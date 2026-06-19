import { useState, useEffect, useRef, useCallback } from 'react'
import type { TranslatedSegment } from '../types'

/**
 * 视频-字幕同步 Hook
 *
 * 监听 <video> 的 timeupdate 事件，匹配当前播放时间对应的字幕句子。
 * 支持手动滚动暂停自动跟随，松手后恢复。
 */
export function useVideoSync(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  segments: TranslatedSegment[],
) {
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isUserScrolling, setIsUserScrolling] = useState(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentenceRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  /** 注册句子 DOM 引用 */
  const registerSentenceRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) sentenceRefs.current.set(index, el)
    else sentenceRefs.current.delete(index)
  }, [])

  /** 监听视频时间，匹配字幕 */
  useEffect(() => {
    const video = videoRef.current
    if (!video || segments.length === 0) return

    const onTimeUpdate = () => {
      const t = video.currentTime
      const idx = segments.findIndex(
        seg => t >= seg.start && t < seg.end
      )
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx)
      }
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [videoRef, segments, currentIndex])

  /** 当前句变化 → 自动滚动 */
  useEffect(() => {
    if (isUserScrolling || currentIndex === -1) return

    const el = sentenceRefs.current.get(currentIndex)
    const container = scrollContainerRef.current
    if (el && container) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentIndex, isUserScrolling])

  /** 用户手动滚动 */
  const onScroll = useCallback(() => {
    setIsUserScrolling(true)

    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      setIsUserScrolling(false)
    }, 3000) // 松手 3 秒后恢复
  }, [])

  /** 清理 */
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [])

  /** 点击某句 → 跳转到视频对应时间 */
  const jumpTo = useCallback((index: number) => {
    const video = videoRef.current
    if (!video || index < 0 || index >= segments.length) return
    video.currentTime = segments[index].start
    setCurrentIndex(index)
    setIsUserScrolling(false) // 立即恢复自动跟随
  }, [videoRef, segments])

  return {
    currentIndex,
    isUserScrolling,
    scrollContainerRef,
    registerSentenceRef,
    onScroll,
    jumpTo,
    setCurrentIndex,
  }
}
