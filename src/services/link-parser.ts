/**
 * 链接类型检测和转换
 *
 * 不同平台有不同嵌入策略：
 * - B站：需要特殊嵌入参数
 * - YouTube：标准 iframe 即可
 * - 抖音：通常不支持嵌入，给出提示
 * - 直链 .mp4：直接用 video 标签
 */

export type LinkType = 'youtube' | 'bilibili' | 'douyin' | 'tiktok' | 'direct_mp4' | 'web'

interface ParsedLink {
  type: LinkType
  /** iframe 可嵌入的 URL（或 null 表示不支持嵌入） */
  embedUrl: string | null
  /** 原始链接 */
  originalUrl: string
  /** 猜测的视频标题 */
  title: string
  /** 用户提示 */
  hint?: string
}

/**
 * 解析粘贴的链接
 */
export function parseVideoLink(url: string): ParsedLink {
  const trimmed = url.trim()

  // 直链 .mp4 / .mov
  if (/\.(mp4|mov|webm|m3u8)(\?|$)/i.test(trimmed)) {
    return {
      type: 'direct_mp4',
      embedUrl: trimmed,
      originalUrl: trimmed,
      title: '直链视频',
    }
  }

  // YouTube
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )
  if (ytMatch) {
    const videoId = ytMatch[1]
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      originalUrl: trimmed,
      title: `YouTube 视频 (${videoId})`,
    }
  }

  // B站 (bilibili)
  const blMatch = trimmed.match(
    /bilibili\.com\/video\/(BV[a-zA-Z0-9]+|av\d+)/
  )
  if (blMatch) {
    const vid = blMatch[1]
    const bvid = vid.startsWith('av') ? vid : vid
    return {
      type: 'bilibili',
      embedUrl: `https://player.bilibili.com/player.html?bvid=${vid}&page=1&high_quality=1`,
      originalUrl: trimmed,
      title: `B站视频 (${bvid})`,
      hint: 'B站视频可能需要在浏览器中播放。如果无法加载，请尝试用本地文件。',
    }
  }

  // 抖音
  if (/douyin\.com|v\.douyin\.com/.test(trimmed)) {
    return {
      type: 'douyin',
      embedUrl: null,
      originalUrl: trimmed,
      title: '抖音视频',
      hint: '抖音视频不支持嵌入播放。建议下载后作为本地文件导入。',
    }
  }

  // TikTok
  if (/tiktok\.com/.test(trimmed)) {
    return {
      type: 'tiktok',
      embedUrl: null,
      originalUrl: trimmed,
      title: 'TikTok 视频',
      hint: 'TikTok 视频不支持嵌入播放。建议下载后作为本地文件导入。',
    }
  }

  // 通用网页
  return {
    type: 'web',
    embedUrl: trimmed,
    originalUrl: trimmed,
    title: '在线视频',
    hint: '部分网站禁止嵌入播放，如无法加载请尝试本地文件。',
  }
}

/**
 * 检查链接是否可以嵌入
 */
export function canEmbed(type: LinkType): boolean {
  return !['douyin', 'tiktok'].includes(type)
}
