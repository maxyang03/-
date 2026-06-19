import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// ===================================================
// ffmpeg.wasm 单例
// ===================================================

let ffmpeg: FFmpeg | null = null
let loadingPromise: Promise<void> | null = null

/**
 * 加载 ffmpeg.wasm（仅首次加载，后续复用）
 *
 * 核心文件从 CDN 获取，约 30MB。
 * 提供 progress 回调让 UI 展示加载进度。
 */
export async function loadFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg
  if (loadingPromise) return loadingPromise.then(() => ffmpeg!)

  const instance = new FFmpeg()

  // 监听日志输出，用作进度上报
  instance.on('log', ({ message }) => {
    if (onProgress) onProgress(message)
  })

  loadingPromise = (async () => {
    onProgress?.('正在加载 ffmpeg 核心文件…')
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

    await instance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    ffmpeg = instance
    onProgress?.('ffmpeg 加载完成')
    loadingPromise = null
  })()

  await loadingPromise
  return ffmpeg!
}

/**
 * 从视频 Blob/文件提取音频为 WAV 格式
 *
 * @param input   视频文件或 Blob URL
 * @param onProgress  进度回调（0-100 的数字进度，以及文字说明）
 * @returns WAV 音频 Blob
 */
export async function extractAudio(
  input: File | string,
  onProgress?: (percent: number, msg: string) => void
): Promise<Blob> {
  const instance = await loadFFmpeg(msg => onProgress?.(0, msg))

  onProgress?.(5, '正在读取视频文件…')

  // 写入输入文件
  let inputData: Uint8Array
  if (typeof input === 'string') {
    // 如果是 blob URL，需先 fetch
    const res = await fetch(input)
    const buf = await res.arrayBuffer()
    inputData = new Uint8Array(buf)
  } else {
    inputData = new Uint8Array(await input.arrayBuffer())
  }

  // 根据文件后缀确定输入文件名
  const fileName = typeof input === 'string' ? 'input.mp4' : (input.name || 'input.mp4')
  const inputExt = fileName.split('.').pop() || 'mp4'

  onProgress?.(10, '正在写入文件…')
  await instance.writeFile(`input.${inputExt}`, inputData)

  // 执行转码：视频 → WAV (16kHz, mono)
  // 参数说明：
  //   -i input.mp4    输入文件
  //   -vn             不要视频流
  //   -acodec pcm_s16le  WAV PCM 16bit
  //   -ar 16000        16kHz 采样率（腾讯云 ASR 推荐）
  //   -ac 1            单声道
  //   output.wav       输出文件
  onProgress?.(15, '正在提取音频（可能需要几十秒）…')

  await instance.exec([
    '-i', `input.${inputExt}`,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    'output.wav',
  ])

  onProgress?.(90, '正在读取音频数据…')

  // 读取输出文件（注意：ffmpeg 命令行的 -y 默认覆盖）
  const outputData = await instance.readFile('output.wav')

  onProgress?.(100, '提取完成')

  // 清理临时文件
  try {
    await instance.deleteFile(`input.${inputExt}`)
    await instance.deleteFile('output.wav')
  } catch {
    // 清理失败不阻塞
  }

  return new Blob([outputData], { type: 'audio/wav' })
}

/**
 * 获取 ffmpeg 实例（用于高级用途）
 */
export function getFFmpeg(): FFmpeg | null {
  return ffmpeg
}
