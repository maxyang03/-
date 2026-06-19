import { useRef, useState, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../services/db'
import { parseVideoLink, canEmbed } from '../services/link-parser'
import type { VideoMeta } from '../types'

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function HomePage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [videoLink, setVideoLink] = useState('')
  const [linkError, setLinkError] = useState('')
  const [importing, setImporting] = useState(false)
  const [history, setHistory] = useState<VideoMeta[]>([])
  const [showInstallTip, setShowInstallTip] = useState(false)
  const navigate = useNavigate()

  // ====== 加载历史记录 ======
  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const all = await db.videos.orderBy('importedAt').reverse().toArray()
      setHistory(all)
    } catch (err) {
      console.error('加载历史记录失败:', err)
    }
  }, [])

  // ====== 检查 PWA 安装提示 ======
  useEffect(() => {
    // iOS Safari: 检查是否已是 standalone 模式
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone
    if (!isStandalone) {
      // 只在 iOS Safari 显示
      const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())
      if (isIOS) {
        const dismissed = sessionStorage.getItem('installTipDismissed')
        if (!dismissed) setShowInstallTip(true)
      }
    }
  }, [])

  const dismissInstallTip = () => {
    setShowInstallTip(false)
    sessionStorage.setItem('installTipDismissed', '1')
  }

  // ====== 上传本地文件 ======
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validMimes = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm']
    const validExt = file.name.match(/\.(mp4|mov|mkv|webm)$/i)
    if (!validMimes.includes(file.type) && !validExt) {
      alert('不支持的文件格式。请选择 .mp4 / .mov / .mkv / .webm 视频文件')
      return
    }

    setImporting(true)
    try {
      const blobUrl = URL.createObjectURL(file)
      const videoId = uid()
      const video: VideoMeta = {
        id: videoId,
        title: file.name.replace(/\.[^.]+$/, ''),
        sourceType: 'local',
        sourceUrl: blobUrl,
        fileName: file.name,
        importedAt: Date.now(),
        status: 'pending',
      }
      await db.videos.put(video)
      navigate(`/learn/${videoId}`)
    } catch (err) {
      console.error('导入失败:', err)
      alert('导入失败，请重试')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [navigate])

  // ====== 链接提交 ======
  const handleLinkSubmit = useCallback(async () => {
    setLinkError('')
    const trimmed = videoLink.trim()
    if (!trimmed) return

    try { new URL(trimmed) } catch { setLinkError('请输入有效的网址'); return }

    const parsed = parseVideoLink(trimmed)
    if (!canEmbed(parsed.type)) { setLinkError(parsed.hint || '该平台不支持嵌入播放'); return }

    setImporting(true)
    try {
      const videoId = uid()
      const video: VideoMeta = {
        id: videoId,
        title: parsed.title,
        sourceType: 'url',
        sourceUrl: parsed.embedUrl || trimmed,
        importedAt: Date.now(),
        status: 'pending',
      }
      await db.videos.put(video)
      navigate(`/learn/${videoId}`, { state: { hint: parsed.hint } })
    } catch (err) {
      setLinkError('打开失败，请重试')
    } finally {
      setImporting(false)
    }
  }, [videoLink, navigate])

  // ====== 删除记录 ======
  const handleDelete = useCallback(async (e: React.MouseEvent, videoId: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm('确定要删除这条学习记录吗？相关的字幕和音频数据也将被清除。')) return

    try {
      await db.segments.where({ videoId }).delete()
      await db.progress.delete(videoId)
      await db.videos.delete(videoId)
      setHistory(prev => prev.filter(v => v.id !== videoId))
    } catch (err) {
      console.error('删除失败:', err)
    }
  }, [])

  // ====== 格式化时间 ======
  const formatDate = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)

    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays} 天前`
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const statusBadge = (status: VideoMeta['status']) => {
    const map = {
      ready: 'bg-green-100 text-green-700',
      error: 'bg-red-100 text-red-700',
      pending: 'bg-slate-100 text-slate-600',
      extracting: 'bg-blue-100 text-blue-700',
      transcribing: 'bg-blue-100 text-blue-700',
      translating: 'bg-blue-100 text-blue-700',
    }
    const label = {
      ready: '已完成', error: '失败', pending: '待处理',
      extracting: '提取中', transcribing: '识别中', translating: '翻译中',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${map[status]}`}>
        {label[status]}
      </span>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 safe-area-top safe-area-bottom">
      {/* Header */}
      <header className="bg-blue-800 text-white px-5 pt-12 pb-5 safe-area-top">
        <h1 className="text-2xl font-bold">粤语学习助手</h1>
        <p className="text-blue-200 text-sm mt-1">普通话视频 → 粤语翻译 + 拼音 + 朗读</p>
      </header>

      {/* PWA 安装提示 */}
      {showInstallTip && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-start gap-2">
          <span className="text-lg">📲</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">添加到主屏幕</p>
            <p className="text-xs text-amber-600 mt-0.5">
              点击下方 <span className="inline-flex items-center bg-white rounded px-1.5 py-0.5 shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              </span> 分享按钮 → 选择「添加到主屏幕」
            </p>
          </div>
          <button onClick={dismissInstallTip} className="text-amber-400 touch-target shrink-0">✕</button>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 px-5 py-6 space-y-4">
        {/* 导入区域 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-500 uppercase tracking-wide">导入视频</h2>

          <button
            type="button" onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="w-full bg-white rounded-2xl p-5 shadow-sm border border-slate-200 active:bg-slate-50 transition-colors text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">{importing ? '⏳' : '📁'}</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-800">从相册上传视频</h3>
                <p className="text-sm text-slate-500">选择本地 .mp4 / .mov 文件</p>
              </div>
              <span className="text-slate-300 text-xl">›</span>
            </div>
          </button>

          <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm" onChange={handleFileChange} className="hidden" />

          {!showLinkInput ? (
            <button type="button" onClick={() => setShowLinkInput(true)} disabled={importing}
              className="w-full bg-white rounded-2xl p-5 shadow-sm border border-slate-200 active:bg-slate-50 transition-colors text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">🔗</span>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-800">粘贴视频链接</h3>
                  <p className="text-sm text-slate-500">B站、YouTube 等</p>
                </div>
                <span className="text-slate-300 text-xl">›</span>
              </div>
            </button>
          ) : (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-blue-300 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔗</span>
                <h3 className="text-base font-semibold text-slate-800">粘贴视频链接</h3>
                <button type="button" onClick={() => { setShowLinkInput(false); setLinkError('') }} className="ml-auto text-slate-400 text-sm touch-target px-2">取消</button>
              </div>
              <input type="url" inputMode="url" autoFocus value={videoLink}
                onChange={(e) => { setVideoLink(e.target.value); setLinkError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleLinkSubmit()}
                placeholder="https://..." className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {linkError && <p className="text-red-500 text-sm bg-red-50 rounded-lg p-2">{linkError}</p>}
              <p className="text-xs text-slate-400">支持 YouTube、B站 等。抖音/TikTok 不支持嵌入，请下载后从相册导入。</p>
              <button type="button" onClick={handleLinkSubmit} disabled={!videoLink.trim() || importing}
                className="w-full bg-blue-800 text-white font-semibold py-3 rounded-xl active:bg-blue-900 disabled:opacity-40 transition-colors touch-target">
                {importing ? '处理中…' : '打开视频'}
              </button>
            </div>
          )}
        </section>

        {/* 历史记录 */}
        <section>
          <h2 className="text-base font-semibold text-slate-500 uppercase tracking-wide mb-3">学习记录</h2>
          {history.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
              <p className="p-6 text-slate-400 text-center text-sm">暂无学习记录<br /><span className="text-xs">上传视频或粘贴链接开始学习</span></p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(v => (
                <Link key={v.id} to={`/learn/${v.id}`}
                  className="block bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">{v.sourceType === 'local' ? '📁' : '🌐'}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-800 truncate">{v.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-400">{formatDate(v.importedAt)}</span>
                        {v.segmentCount != null && (
                          <span className="text-xs text-slate-400">{v.segmentCount} 句</span>
                        )}
                        {statusBadge(v.status)}
                      </div>
                    </div>
                    <button onClick={(e) => handleDelete(e, v.id)}
                      className="touch-target text-slate-300 hover:text-red-400 text-lg shrink-0"
                    >🗑</button>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 底部导航 */}
      <nav className="bg-white border-t border-slate-200 px-5 py-3 safe-area-bottom flex justify-around">
        <Link to="/" className="flex flex-col items-center gap-1 text-blue-800">
          <span className="text-xl">🏠</span>
          <span className="text-xs font-medium">首页</span>
        </Link>
        <Link to="/settings" className="flex flex-col items-center gap-1 text-slate-400">
          <span className="text-xl">⚙️</span>
          <span className="text-xs font-medium">设置</span>
        </Link>
      </nav>
    </div>
  )
}
