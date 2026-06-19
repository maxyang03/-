import { useCallback, useEffect, useState } from 'react'
import { db } from '../services/db'
import { encrypt, decrypt } from '../services/crypto'
import type { ApiKeys, ConnectionStatus } from '../types'

/** 空 key 配置 */
const EMPTY_KEYS: ApiKeys = {
  deepseekKey: '',
  tencentSecretId: '',
  tencentSecretKey: '',
  azureSubscriptionKey: '',
  azureRegion: '',
}

/**
 * API Key 管理 hook
 * - 从 IndexedDB 读取加密存储的 Key
 * - 保存时加密后写入
 * - 提供各服务连接测试方法
 */
export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeys>(EMPTY_KEYS)
  const [loaded, setLoaded] = useState(false)
  const [deepseekStatus, setDeepseekStatus] = useState<ConnectionStatus>('idle')
  const [tencentStatus, setTencentStatus] = useState<ConnectionStatus>('idle')
  const [azureStatus, setAzureStatus] = useState<ConnectionStatus>('idle')

  /** 启动时从数据库加载 */
  useEffect(() => {
    loadKeys()
  }, [])

  const loadKeys = async () => {
    try {
      const loaded: Partial<ApiKeys> = {}

      // DeepSeek
      const ds = await db.apiKeys.get('deepseek')
      if (ds) {
        loaded.deepseekKey = await decrypt(ds.encryptedData, ds.iv)
      }

      // 腾讯云 — 以一个 JSON 存储 { secretId, secretKey }
      const tc = await db.apiKeys.get('tencent')
      if (tc) {
        const parsed = JSON.parse(await decrypt(tc.encryptedData, tc.iv))
        loaded.tencentSecretId = parsed.secretId ?? ''
        loaded.tencentSecretKey = parsed.secretKey ?? ''
      }

      // Azure — JSON { subscriptionKey, region }
      const az = await db.apiKeys.get('azure')
      if (az) {
        const parsed = JSON.parse(await decrypt(az.encryptedData, az.iv))
        loaded.azureSubscriptionKey = parsed.subscriptionKey ?? ''
        loaded.azureRegion = parsed.region ?? ''
      }

      setKeys({ ...EMPTY_KEYS, ...loaded })
    } catch (err) {
      console.error('加载 API Key 失败:', err)
    } finally {
      setLoaded(true)
    }
  }

  /** 更新单个字段 */
  const updateKey = useCallback(<K extends keyof ApiKeys>(field: K, value: ApiKeys[K]) => {
    setKeys(prev => ({ ...prev, [field]: value }))
  }, [])

  /** 保存所有 Key 到加密存储 */
  const saveKeys = useCallback(async (): Promise<boolean> => {
    try {
      // DeepSeek
      if (keys.deepseekKey) {
        const encrypted = await encrypt(keys.deepseekKey)
        await db.apiKeys.put({ provider: 'deepseek', ...encrypted })
      } else {
        await db.apiKeys.delete('deepseek')
      }

      // 腾讯云
      if (keys.tencentSecretId || keys.tencentSecretKey) {
        const encrypted = await encrypt(JSON.stringify({
          secretId: keys.tencentSecretId,
          secretKey: keys.tencentSecretKey,
        }))
        await db.apiKeys.put({ provider: 'tencent', ...encrypted })
      } else {
        await db.apiKeys.delete('tencent')
      }

      // Azure
      if (keys.azureSubscriptionKey || keys.azureRegion) {
        const encrypted = await encrypt(JSON.stringify({
          subscriptionKey: keys.azureSubscriptionKey,
          region: keys.azureRegion,
        }))
        await db.apiKeys.put({ provider: 'azure', ...encrypted })
      } else {
        await db.apiKeys.delete('azure')
      }

      return true
    } catch (err) {
      console.error('保存 API Key 失败:', err)
      return false
    }
  }, [keys])

  /** 测试 DeepSeek 连接（GET /models，返回 200 即成功） */
  const testDeepSeek = useCallback(async (): Promise<boolean> => {
    if (!keys.deepseekKey) return false
    setDeepseekStatus('testing')
    try {
      const res = await fetch('https://api.deepseek.com/v1/models', {
        headers: { Authorization: `Bearer ${keys.deepseekKey}` },
      })
      setDeepseekStatus(res.ok ? 'success' : 'error')
      return res.ok
    } catch {
      setDeepseekStatus('error')
      return false
    }
  }, [keys.deepseekKey])

  /** 测试腾讯云 ASR 连接（简单请求验证签名） */
  const testTencentASR = useCallback(async (): Promise<boolean> => {
    if (!keys.tencentSecretId || !keys.tencentSecretKey) return false
    setTencentStatus('testing')
    try {
      // 用 DescribeTaskStatus 空查验证签名
      const ok = await testTencentConnection(keys.tencentSecretId, keys.tencentSecretKey)
      setTencentStatus(ok ? 'success' : 'error')
      return ok
    } catch {
      setTencentStatus('error')
      return false
    }
  }, [keys.tencentSecretId, keys.tencentSecretKey])

  /** 测试 Azure TTS 连接（发最简单的 SSML） */
  const testAzureTTS = useCallback(async (): Promise<boolean> => {
    if (!keys.azureSubscriptionKey || !keys.azureRegion) return false
    setAzureStatus('testing')
    try {
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-HK'><voice name='zh-HK-HiuMaanNeural'>你好</voice></speak>`
      const res = await fetch(
        `https://${keys.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': keys.azureSubscriptionKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
          },
          body: ssml,
        }
      )
      setAzureStatus(res.ok ? 'success' : 'error')
      return res.ok
    } catch {
      setAzureStatus('error')
      return false
    }
  }, [keys.azureSubscriptionKey, keys.azureRegion])

  /** 一键测试所有连接 */
  const testAll = useCallback(async () => {
    await Promise.all([testDeepSeek(), testTencentASR(), testAzureTTS()])
  }, [testDeepSeek, testTencentASR, testAzureTTS])

  return {
    keys,
    loaded,
    deepseekStatus,
    tencentStatus,
    azureStatus,
    updateKey,
    saveKeys,
    testDeepSeek,
    testTencentASR,
    testAzureTTS,
    testAll,
  }
}

// ===================================================
// 腾讯云 ASR 签名（V3 TC3-HMAC-SHA256）
// ===================================================

async function sha256Hex(message: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return sig
}

async function testTencentConnection(
  secretId: string,
  secretKey: string
): Promise<boolean> {
  const service = 'asr'
  const host = 'asr.tencentcloudapi.com'
  const action = 'DescribeTaskStatus'
  const version = '2019-06-14'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const body = JSON.stringify({ TaskId: 0 })

  // 1. Canonical Request
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const hashedPayload = await sha256Hex(body)
  const canonicalRequest = [
    'POST', '/', '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n')

  // 2. String to Sign
  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n')

  // 3. Signature
  const kDate = await hmacSha256(new TextEncoder().encode(`TC3${secretKey}`), date)
  const kService = await hmacSha256(kDate, service)
  const kSigning = await hmacSha256(kService, 'tc3_request')
  const signature = Array.from(new Uint8Array(await hmacSha256(kSigning, stringToSign)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // 4. Authorization
  const authorization = [
    `${algorithm} Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  // 5. 请求
  try {
    const res = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': String(timestamp),
        'Authorization': authorization,
      },
      body,
    })
    // 即使 TaskId=0 不存在的报错也算签名通过了
    const data = await res.json()
    // 签名通过会返回 InvalidParameterValue 之类，签名失败会返回 AuthFailure
    return data.Response?.Error?.Code !== 'AuthFailure'
  } catch {
    return false
  }
}
