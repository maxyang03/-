import { useCallback, useState } from 'react'
import { db } from '../services/db'
import { decrypt } from '../services/crypto'
import type { ApiKeys } from '../types'

/**
 * 从 IndexedDB 解密读取 API Key 的 hook（用于流水线调用时）
 */
export function useApiKeyForServices() {
  const [loading, setLoading] = useState(true)

  const getKeys = useCallback(async (): Promise<ApiKeys | null> => {
    try {
      const keys: Partial<ApiKeys> = {}

      const ds = await db.apiKeys.get('deepseek')
      if (ds) keys.deepseekKey = await decrypt(ds.encryptedData, ds.iv)

      const tc = await db.apiKeys.get('tencent')
      if (tc) {
        const p = JSON.parse(await decrypt(tc.encryptedData, tc.iv))
        keys.tencentSecretId = p.secretId ?? ''
        keys.tencentSecretKey = p.secretKey ?? ''
      }

      const az = await db.apiKeys.get('azure')
      if (az) {
        const p = JSON.parse(await decrypt(az.encryptedData, az.iv))
        keys.azureSubscriptionKey = p.subscriptionKey ?? ''
        keys.azureRegion = p.region ?? ''
      }

      setLoading(false)
      return { ...keys } as ApiKeys
    } catch (err) {
      console.error('读取 API Key 失败:', err)
      setLoading(false)
      return null
    }
  }, [])

  return { getKeys, loading }
}
