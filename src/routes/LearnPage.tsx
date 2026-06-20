import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { db } from '../services/db'
import { extractAudio } from '../services/ffmpeg'
import { transcribeAudio } from '../services/tencent-asr'
import { translateSegments } from '../services/deepseek'
import { useApiKeyForServices } from '../hooks/useApiKeyForServices'
import { useVideoSync } from '../hooks/useVideoSync'
import { useAudioPlayer, RATE_OPTIONS } from '../hooks/useAudioPlayer'
import type { VideoMeta, SubtitleSegment, TranslatedSegment, PlayMode } from '../types'

type PipelineStep =
  | 'idle'
  | 'extracting'
  | 'transcribing'
  | 'translating'
  | 'done'
  | 'error'

export default function LearnPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const [video, setVideo] = useState<VideoMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const hint = (location.state as { hint?: string })?.hint

  // 音频 / ASR / 翻译状态
  const [step, setStep] = useState<PipelineStep>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [segments, setSegments] = useState<SubtitleSegment[]>([])
  const [translated, setTranslated] = useState<TranslatedSegment[]>([])

  // 播放模式
  const [playMode, setPlayMode] = useState<PlayMode>('full')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { getKeys } = useApiKeyForServices()

  const {
    currentIndex,
    scrollContainerRef,
    registerSentenceRef,
    onScroll,
    jumpTo,
  } = useVideoSync(videoRef, translated)

  const {
    isPlaying,
    isLoading: isAudioLoading,
    rate,
    progress: audioProgress,
    activeIndex: playingIndex,
    playFull,
    playSentence,
    pause,
    stop,
    changeRate,
  } = useAudioPlayer(translated, currentIndex, playMode)

  // ====== 加载视频 ======
  useEffect(() => {
    if (!id) { setError('没有视频 ID'); setLoading(false); return }

    db.videos.get(id).then(v => {
      if (v) {
        setVideo(v)
        db.segments.where({ videoId: v.id }).sortBy('index').then(s => {
          if (s.length > 0) {
            setSegments(s)
            if (s[0]?.yue) setTranslated(s as TranslatedSegment[])
          }
        })
      } else {
        const stored = sessionStorage.getItem(id)
        if (stored) { try { setVideo(JSON.parse(stored)) } catch { setError('视频数据损坏') } }
        else setError('未找到该视频')
      }
    }).catch(() => setError('加载失败')).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }
  }, [audioUrl])

  // ====== 提取音频 ======
  const handleExtractAudio = useCallback(async () => {
    if (!video?.sourceUrl) return
    if (video.sourceType === 'url') { alert('在线视频暂不支持。'); return }

    setStep('extracting'); setProgress(0); setProgressMsg('准备中…')
    try {
      await db.videos.update(video.id, { status: 'extracting' })
      const response = await fetch(video.sourceUrl)
      const blob = await response.blob()
      const file = new File([blob], video.fileName || 'video.mp4', { type: blob.type })
      const wav = await extractAudio(file, (pct, msg) => { setProgress(pct); setProgressMsg(msg) })
      setAudioBlob(wav)
      setAudioUrl(URL.createObjectURL(wav))
      await db.videos.update(video.id, { status: 'pending' })
      setVideo(prev => prev ? { ...prev, status: 'pending' } : null)
      setStep('idle')
    } catch (err: any) {
      setStep('error'); setProgressMsg(err?.message || '提取失败')
    }
  }, [video])

  // ====== 语音识别 ======
  const handleTranscribe = useCallback(async () => {
    if (!audioBlob || !video) return
    setStep('transcribing'); setProgress(0); setProgressMsg('上传中…')
    try {
      const keys = await getKeys()
      if (!keys?.tencentSecretId || !keys?.tencentSecretKey) {
        alert('请先配置腾讯云 ASR 密钥'); return
      }
      await db.videos.update(video.id, { status: 'transcribing' })
      const result = await transcribeAudio(audioBlob, keys.tencentSecretId, keys.tencentSecretKey, video.id,
        (p) => { setProgress(p.stage === 'uploading' ? 30 : Math.min(95, 30 + p.tries! * 5)); setProgressMsg(p.stage === 'uploading' ? '已上传，等待…' : `识别中… ${p.tries}/${p.maxTries}`) }
      )
      setSegments(result)
      setStep('idle')
    } catch (err: any) { setStep('error'); setProgressMsg(err?.message) }
  }, [audioBlob, video, getKeys])

  // ====== AI 翻译 ======
  const handleTranslate = useCallback(async () => {
    if (segments.length === 0 || !video) return
    setStep('translating'); setProgress(0); setProgressMsg('翻译中…')
    try {
      const keys = await getKeys()
      if (!keys?.deepseekKey) { alert('请先配置 DeepSeek API Key'); return }
      await db.videos.update(video.id, { status: 'translating' })
      const result = await translateSegments(segments, keys.deepseekKey, video.id,
        (done, total) => { setProgress(Math.round((done / total) * 100)); setProgressMsg(`翻译中… ${done}/${total}`) }
      )
      setTranslated(result)
      setStep('done'); setProgressMsg(`翻译完成：${result.length} 句`)
      await db.videos.update(video.id, { status: 'ready', segmentCount: result.length })
    } catch (err: any) { setStep('error'); setProgressMsg(err?.message) }
  }, [segments, video, getKeys])

  // ====== 播放控制 ======
  const handlePlayPause = useCallback(async () => {
    if (isPlaying) {
      pause()
    } else {
      if (playMode === 'full') {
        await playFull()
      } else {
        const idx = currentIndex >= 0 ? currentIndex : 0
        await playSentence(idx)
      }
    }
  }, [isPlaying, playMode, currentIndex, pause, playFull, playSentence])

  const handlePrevSentence = useCallback(() => {
    const prevIdx = Math.max(0, currentIndex - 1)
    jumpTo(prevIdx)
    if (playMode === 'sentence') {
      stop()
      playSentence(prevIdx)
    }
  }, [currentIndex, playMode, jumpTo, stop, playSentence])

  const handleNextSentence = useCallback(() => {
    const nextIdx = Math.min(translated.length - 1, currentIndex + 1)
    jumpTo(nextIdx)
    if (playMode === 'sentence') {
      stop()
      playSentence(nextIdx)
    }
  }, [currentIndex, playMode, translated.length, jumpTo, stop, playSentence])

  const statusLabel: Record<VideoMeta['status'], string> = {
    pending: '等待处理', extracting: '提取音频…', transcribing: '语音识别…',
    translating: '翻译中…', ready: '已完成', error: '处理失败',
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-900"><p className="text-slate-400">加载中…</p></div>
  if (error || !video) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 gap-4 px-5">
      <p className="text-3xl">🎬</p><p className="text-slate-400">{error || '数据异常'}</p>
      <Link to="/" className="bg-blue-800 text-white px-6 py-3 rounded-xl touch-target">返回首页</Link>
    </div>
  )

  const isLocal = video.sourceType === 'local'
  const inProgress = step === 'extracting' || step === 'transcribing' || step === 'translating'
  const hasASR = segments.length > 0
  const hasTranslation = translated.length > 0

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 safe-area-top safe-area-bottom">
      {/* ====== 视频区域 ====== */}
      <div className="bg-black flex items-center justify-center" style={{ height: '35vh' }}>
        {isLocal && video.sourceUrl ? (
          <video
            ref={videoRef}
            src={video.sourceUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          >
            <source src={video.sourceUrl} type="video/mp4" />
          </video>
        ) : !isLocal && video.sourceUrl ? (
          <iframe src={video.sourceUrl} className="w-full h-full border-0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={video.title} />
        ) : (
          <div className="text-center px-5"><p className="text-slate-400 text-3xl mb-2">🎬</p><p className="text-slate-500 text-sm">视频加载失败</p></div>
        )}
      </div>

      {/* ====== 字幕 + 控制区 ====== */}
      <div className="flex-1 bg-slate-50 rounded-t-3xl overflow-hidden flex flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-5 py-4 scroll-container space-y-3"
        >
          {/* 视频信息 */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <h2 className="text-base font-semibold text-slate-800 truncate">{video.title}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {isLocal ? '📁 本地' : '🌐 在线'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                video.status === 'ready' ? 'bg-green-100 text-green-700' :
                video.status === 'error' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>{statusLabel[video.status]}</span>
            </div>
            {video.errorMessage && <p className="text-red-500 text-xs mt-2">{video.errorMessage}</p>}
            {video.segmentCount != null && <p className="text-xs text-slate-400 mt-2">共 {video.segmentCount} 句</p>}
            {hint && <p className="text-amber-600 text-xs mt-2 bg-amber-50 rounded-lg p-2">💡 {hint}</p>}
          </div>

          {/* 操作按钮 */}
          <div className="space-y-2">
            {isLocal && !inProgress && !audioBlob && (
              <button onClick={handleExtractAudio} className="w-full bg-blue-800 text-white font-semibold py-4 rounded-xl active:bg-blue-900 transition-colors touch-target flex items-center justify-center gap-2">
                <span>🎙️</span><span>提取音频</span>
              </button>
            )}
            {audioBlob && !inProgress && !hasASR && (
              <button onClick={handleTranscribe} className="w-full bg-purple-700 text-white font-semibold py-4 rounded-xl active:bg-purple-800 transition-colors touch-target flex items-center justify-center gap-2">
                <span>🔊</span><span>语音识别（腾讯云 ASR）</span>
              </button>
            )}
            {hasASR && !inProgress && !hasTranslation && (
              <button onClick={handleTranslate} className="w-full bg-emerald-700 text-white font-semibold py-4 rounded-xl active:bg-emerald-800 transition-colors touch-target flex items-center justify-center gap-2">
                <span>🤖</span><span>AI 翻译（DeepSeek）</span>
              </button>
            )}
            {audioBlob && !inProgress && (
              <button onClick={handleExtractAudio} className="w-full bg-slate-200 text-slate-600 font-semibold py-3 rounded-xl active:bg-slate-300 transition-colors touch-target">
                重新提取音频
              </button>
            )}
          </div>

          {/* 进度 / 完成 / 错误 */}
          {inProgress && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                <span className="text-sm font-medium text-slate-700">{progressMsg}</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-slate-400">{progress}%</p>
            </div>
          )}
          {step === 'done' && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200">
              <div className="flex items-center gap-2"><span>✅</span><span className="text-sm font-medium text-green-700">{progressMsg}</span></div>
            </div>
          )}
          {step === 'error' && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200 space-y-3">
              <div className="flex items-center gap-2"><span>❌</span><span className="text-sm font-medium text-red-700">{progressMsg}</span></div>
              <button onClick={handleExtractAudio} className="text-sm text-blue-600 underline">重试</button>
            </div>
          )}

          {/* ====== 字幕对照区（同步高亮） ====== */}
          {hasTranslation && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between sticky top-0 bg-white z-10 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">
                  📖 字幕对照（{translated.length} 句）
                </h3>
                <span className="text-xs font-normal text-slate-400">普通话 · 粤语 · 拼音</span>
              </div>
              <div className="divide-y divide-slate-50">
                {translated.map((seg, i) => {
                  const isCurrent = i === currentIndex
                  const isPlayingThis = i === playingIndex

                  return (
                    <div
                      key={i}
                      ref={(el) => registerSentenceRef(i, el)}
                      onClick={() => {
                        jumpTo(i)
                        if (playMode === 'sentence') {
                          playSentence(i)
                        }
                      }}
                      className={`px-4 py-3 space-y-1 transition-colors duration-300 cursor-pointer active:bg-slate-100 ${
                        isCurrent
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : 'border-l-4 border-transparent'
                      }`}
                    >
                      {/* 时间戳 */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-11 shrink-0 tabular-nums">
                          {formatTime(seg.start)}
                        </span>
                        {isCurrent && (
                          <span className="text-xs text-blue-500 font-medium animate-pulse">▶ 播放中</span>
                        )}
                        {isPlayingThis && !isCurrent && (
                          <span className="text-xs text-green-600 font-medium">🔊 朗读中</span>
                        )}
                      </div>
                      {/* 普通话 */}
                      <p className={`text-sm leading-relaxed ml-13 ${
                        isCurrent ? 'text-slate-900 font-medium' : 'text-slate-600'
                      }`}>{seg.text}</p>
                      {/* 粤语 */}
                      <p className="text-sm text-blue-800 font-medium ml-13 leading-relaxed">{seg.yue}</p>
                      {/* 拼音 */}
                      <p className="text-xs text-slate-400 italic ml-13 leading-relaxed">{seg.jyutping}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 纯 ASR（翻译前） */}
          {hasASR && !hasTranslation && !inProgress && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <h3 className="text-sm font-semibold text-slate-700 px-4 pt-4 pb-2">📝 识别结果（{segments.length} 句）</h3>
              <div className="divide-y divide-slate-50">
                {segments.slice(0, 20).map((seg, i) => (
                  <div key={i} className="px-4 py-2 flex gap-2 text-sm">
                    <span className="text-slate-400 text-xs w-11 shrink-0 mt-0.5 tabular-nums">{formatTime(seg.start)}</span>
                    <span className="text-slate-700">{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ====== 底部音频播放器 ====== */}
        <div className="bg-white border-t border-slate-200 px-5 py-3 safe-area-bottom space-y-2">
          {/* 模式切换 + 速度选择 */}
          {hasTranslation && (
            <div className="flex gap-2">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 flex-1">
                <button
                  onClick={() => { setPlayMode('full'); stop() }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors touch-target ${
                    playMode === 'full' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  整段
                </button>
                <button
                  onClick={() => { setPlayMode('sentence'); stop() }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors touch-target ${
                    playMode === 'sentence' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  逐句
                </button>
              </div>
              {/* 速度选择 */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {RATE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => changeRate(opt.value)}
                    className={`px-2 py-2 text-xs font-medium rounded-md transition-colors touch-target ${
                      rate === opt.value ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 播放进度条 */}
          {hasTranslation && (isPlaying || isAudioLoading || audioProgress > 0) && (
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isAudioLoading ? 'bg-yellow-400 animate-pulse' : 'bg-blue-500'
                }`}
                style={{ width: `${audioProgress}%` }}
              />
            </div>
          )}

          {/* 播放控制按钮 */}
          <div className="flex items-center justify-center gap-5">
            <button
              onClick={handlePrevSentence}
              disabled={currentIndex <= 0}
              className="touch-target text-slate-400 disabled:text-slate-200 text-lg disabled:opacity-30"
            >
              ⏮
            </button>

            <button
              onClick={handlePlayPause}
              disabled={!hasTranslation || isAudioLoading}
              className={`touch-target w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all active:scale-95 ${
                isAudioLoading
                  ? 'bg-yellow-400 text-white animate-pulse'
                  : isPlaying
                    ? 'bg-blue-800 text-white'
                    : 'bg-blue-800 text-white'
              } disabled:opacity-50`}
            >
              {isAudioLoading ? '⏳' : isPlaying ? '⏸' : '▶'}
            </button>

            <button
              onClick={handleNextSentence}
              disabled={currentIndex >= translated.length - 1}
              className="touch-target text-slate-400 disabled:text-slate-200 text-lg disabled:opacity-30"
            >
              ⏭
            </button>
          </div>

          {/* 状态文字 */}
          <p className="text-center text-xs text-slate-400">
            {isAudioLoading
              ? '正在生成音频…'
              : isPlaying
                ? playMode === 'full'
                  ? `整段朗读中 · ${rate}x`
                  : `${playingIndex >= 0 ? `朗读第 ${playingIndex + 1} 句 · ` : ''}${rate}x`
                : hasTranslation
                  ? playMode === 'full' ? '点击 ▶ 整段朗读' : '点击字幕单句朗读'
                  : '完成流水线后可播放'}
          </p>
        </div>
      </div>

      {/* 返回 */}
      <Link to="/" className="absolute top-3 left-3 touch-target flex items-center justify-center rounded-full bg-black/50 text-white text-sm px-3 py-1.5 active:bg-black/60" style={{ paddingTop: 'calc(0.375rem + var(--safe-area-top))' }}>← 返回</Link>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
