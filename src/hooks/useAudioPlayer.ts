import { useState, useRef, useCallback, useEffect } from 'react'
import type { TranslatedSegment, PlayMode, PlaybackRate } from '../types'
import { synthesizeWithCache, concatBlobs } from '../services/azure-tts'
import { useApiKeyForServices } from './useApiKeyForServices'

/**
 * 音频播放控制 Hook
 *
 * 支持整段播放（拼接所有句子）和逐句点播模式。
 */
export function useAudioPlayer(
  translated: TranslatedSegment[],
  _currentIndex: number,
  _playMode: PlayMode,
) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [rate, setRate] = useState<PlaybackRate>(1)
  const [progress, setProgress] = useState(0) // 0-100
  const [activeIndex, setActiveIndex] = useState(-1) // 逐句模式下当前播放的句子

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fullAudioUrlRef = useRef<string | null>(null)
  const sentenceAudioUrlRef = useRef<Map<number, string>>(new Map())
  const { getKeys } = useApiKeyForServices()

  // 清理
  useEffect(() => {
    return () => {
      if (fullAudioUrlRef.current) URL.revokeObjectURL(fullAudioUrlRef.current)
      sentenceAudioUrlRef.current.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  /** 生成整段音频 */
  const generateFullAudio = useCallback(async (): Promise<string | null> => {
    if (fullAudioUrlRef.current) return fullAudioUrlRef.current
    if (translated.length === 0) return null

    setIsLoading(true)
    try {
      const keys = await getKeys()
      if (!keys?.azureSubscriptionKey || !keys?.azureRegion) {
        alert('请先在设置页面配置 Azure TTS 密钥')
        return null
      }

      // 逐句生成
      const urls: string[] = []
      for (let i = 0; i < translated.length; i++) {
        const blob = await synthesizeWithCache(
          translated[i].yue, keys.azureSubscriptionKey, keys.azureRegion
        )
        urls.push(URL.createObjectURL(blob))
      }

      // 拼接
      const merged = await concatBlobs(urls)
      // 清理单句 URL
      urls.forEach(u => URL.revokeObjectURL(u))

      if (merged) {
        fullAudioUrlRef.current = URL.createObjectURL(merged)
        return fullAudioUrlRef.current
      }
      return null
    } catch (err) {
      console.error('生成整段音频失败:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [translated, getKeys])

  /** 生成单句音频 */
  const generateSentenceAudio = useCallback(async (index: number): Promise<string | null> => {
    if (index < 0 || index >= translated.length) return null
    if (sentenceAudioUrlRef.current.has(index)) {
      return sentenceAudioUrlRef.current.get(index)!
    }

    const seg = translated[index]
    if (!seg.yue) return null

    try {
      const keys = await getKeys()
      if (!keys?.azureSubscriptionKey || !keys?.azureRegion) {
        alert('请先在设置页面配置 Azure TTS 密钥')
        return null
      }

      const blob = await synthesizeWithCache(
        seg.yue, keys.azureSubscriptionKey, keys.azureRegion
      )
      const url = URL.createObjectURL(blob)
      sentenceAudioUrlRef.current.set(index, url)
      return url
    } catch (err) {
      console.error(`生成第 ${index} 句音频失败:`, err)
      return null
    }
  }, [translated, getKeys])

  /** 播放整段 */
  const playFull = useCallback(async () => {
    setIsLoading(true)
    const url = await generateFullAudio()
    setIsLoading(false)

    if (!url) return

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    const audio = new Audio(url)
    audio.playbackRate = rate
    audio.onplay = () => setIsPlaying(true)
    audio.onpause = () => setIsPlaying(false)
    audio.onended = () => { setIsPlaying(false); setProgress(100) }
    audio.ontimeupdate = () => {
      if (audio.duration) {
        setProgress(Math.round((audio.currentTime / audio.duration) * 100))
      }
    }
    audioRef.current = audio
    await audio.play()
  }, [generateFullAudio, rate])

  /** 播放单句 */
  const playSentence = useCallback(async (index: number) => {
    setIsLoading(true)
    const url = await generateSentenceAudio(index)
    setIsLoading(false)

    if (!url) return

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    const audio = new Audio(url)
    audio.playbackRate = rate
    setActiveIndex(index)
    audio.onplay = () => setIsPlaying(true)
    audio.onpause = () => setIsPlaying(false)
    audio.onended = () => { setIsPlaying(false); setActiveIndex(-1) }
    audio.ontimeupdate = () => {
      if (audio.duration) {
        setProgress(Math.round((audio.currentTime / audio.duration) * 100))
      }
    }
    audioRef.current = audio
    await audio.play()
  }, [generateSentenceAudio, rate])

  /** 暂停 */
  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  /** 继续 */
  const resume = useCallback(async () => {
    await audioRef.current?.play()
    setIsPlaying(true)
  }, [])

  /** 停止 */
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsPlaying(false)
    setProgress(0)
    setActiveIndex(-1)
  }, [])

  /** 设置播放速度 */
  const changeRate = useCallback((newRate: PlaybackRate) => {
    setRate(newRate)
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate
    }
  }, [])

  return {
    isPlaying,
    isLoading,
    rate,
    progress,
    activeIndex,
    playFull,
    playSentence,
    pause,
    resume,
    stop,
    changeRate,
  }
}

/** 播放速度选项 */
export const RATE_OPTIONS: { label: string; value: PlaybackRate }[] = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1x', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
]
