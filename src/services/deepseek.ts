import { db } from './db'
import type { SubtitleSegment, TranslatedSegment } from '../types'

// ===================================================
// DeepSeek Chat API
// ===================================================

const API_BASE = 'https://api.deepseek.com'

const SYSTEM_PROMPT = `你是一个专业的粤语翻译专家。你的任务是将普通话翻译成地道、口语化的粤语，并为每句粤语标注粵拼（Jyutping）。

## 规则
1. 粤语翻译必须口语化、自然，贴近香港日常用语，不要字面直译
2. 粵拼必须准确，参考香港语言学学会粵拼方案（LSHK Jyutping）
3. 保持原文的语气、情感和节奏
4. 输出严格的 JSON 数组格式

## 输出格式
[{"yue": "粤语句子", "jyutping": "jyut6 ping3"}]

## 示例
输入：大家好，我是李雷，今天我们来聊聊粤语。
输出：[{"yue": "大家好，我係李雷，今日我哋嚟傾下廣東話。", "jyutping": "daai6 gaa1 hou2, ngo5 hai6 lei5 leoi4, gam1 jat6 ngo5 dei6 lai4 king1 haa5 gwong2 dung1 waa2."}]

输入：这个东西很好吃。
输出：[{"yue": "呢個嘢好好食。", "jyutping": "ni1 go3 je5 hou2 hou2 sik6."}]

请严格按照上述 JSON 格式输出，不要输出任何其他文字、标记或解释。`

/**
 * 单次翻译请求（处理一批普通话句子）
 *
 * @param sentences  普通话句子数组
 * @param apiKey     DeepSeek API Key
 * @returns 粤语翻译 + 粤拼数组（与 sentences 顺序对应）
 */
async function translateBatch(
  sentences: string[],
  apiKey: string,
): Promise<Array<{ yue: string; jyutping: string }>> {
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请翻译以下普通话句子：\n${numbered}` },
      ],
      temperature: 0.3,
      max_tokens: 4096,
      // 不使用 response_format: json_object（DeepSeek 对此模式支持不完全稳定）
    }),
  })

  if (!response.ok) {
    const err = await response.text().catch(() => '')
    throw new Error(`DeepSeek API 错误 (${response.status}): ${err}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('DeepSeek 返回空内容')
  }

  // 解析 JSON：尝试多种容错策略
  return parseTranslationResult(content, sentences.length)
}

/**
 * 解析翻译结果（容错）
 *
 * DeepSeek 偶尔会输出不符合 JSON 的内容（如 markdown 包裹、多余换行等）
 */
function parseTranslationResult(
  raw: string,
  expectedCount: number,
): Array<{ yue: string; jyutping: string }> {
  let cleaned = raw.trim()

  // 1. 去掉可能的 markdown 代码块标记
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  // 2. 尝试直接 JSON.parse
  try {
    const arr = JSON.parse(cleaned)
    if (Array.isArray(arr)) return arr.slice(0, expectedCount)
  } catch { /* fallthrough */ }

  // 3. 尝试提取 JSON 数组（正则）
  const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0])
      if (Array.isArray(arr)) return arr.slice(0, expectedCount)
    } catch { /* fallthrough */ }
  }

  // 4. 尝试逐行修复：每行单独解析
  const lines = cleaned.split('\n').filter(l => l.trim())
  const items: Array<{ yue: string; jyutping: string }> = []
  for (const line of lines) {
    // 尝试匹配 "yue": "..." "jyutping": "..."
    const yueMatch = line.match(/"yue"\s*:\s*"([^"]+)"/)
    const jpMatch = line.match(/"jyutping"\s*:\s*"([^"]+)"/)
    if (yueMatch && jpMatch) {
      items.push({ yue: yueMatch[1], jyutping: jpMatch[1] })
    }
  }
  if (items.length > 0) return items.slice(0, expectedCount)

  // 5. 完全失败
  throw new Error(`无法解析 DeepSeek 返回内容: ${cleaned.slice(0, 200)}`)
}

/**
 * 完整的翻译流水线
 *
 * 支持分批翻译（每批最多 15 句，避免 token 超限），逐批更新进度。
 *
 * @param segments   普通话句子（来自 ASR）
 * @param apiKey     DeepSeek API Key
 * @param videoId    关联的视频 ID
 * @param onProgress 进度回调
 * @returns 翻译后的完整句子数组
 */
export async function translateSegments(
  segments: SubtitleSegment[],
  apiKey: string,
  videoId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<TranslatedSegment[]> {
  const BATCH_SIZE = 15
  const results: TranslatedSegment[] = new Array(segments.length)

  // 分批处理
  for (let offset = 0; offset < segments.length; offset += BATCH_SIZE) {
    const batch = segments.slice(offset, offset + BATCH_SIZE)
    const texts = batch.map(s => s.text)

    const translated = await translateBatch(texts, apiKey)

    // 合并结果
    for (let i = 0; i < batch.length; i++) {
      const original = batch[i]
      const trans = translated[i]
      results[offset + i] = {
        ...original,
        yue: trans?.yue ?? original.text,
        jyutping: trans?.jyutping ?? '',
      }
    }

    // 进度
    onProgress?.(Math.min(offset + BATCH_SIZE, segments.length), segments.length)

    // 批次间短暂休息（避免速率限制）
    if (offset + BATCH_SIZE < segments.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  // 存回 IndexedDB
  await db.segments.bulkPut(
    results.map((seg, idx) => ({
      ...seg,
      videoId,
      index: idx,
    }))
  )

  // 更新视频状态
  await db.videos.update(videoId, {
    status: 'ready',
    segmentCount: results.length,
  })

  return results
}
