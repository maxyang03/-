/**
 * Web Crypto API 加密封装
 *
 * 使用 AES-GCM 加密 API Key，基于设备指纹派生密钥。
 * 注意：前端加密无法做到绝对安全（密钥也在前端），但比明文存储好。
 */

/** 生成设备指纹（不变量拼接） */
function getDeviceFingerprint(): string {
  const parts = [
    navigator.hardwareConcurrency ?? 4,
    screen.colorDepth,
    screen.width,
    screen.height,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    // 固定盐值，避免每次派生不同 key
    'cantonese-learner-v1',
  ]
  return parts.join('|')
}

/** 将字符串转为 CryptoKey */
async function deriveKey(raw: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(raw),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('cantonese-learner-salt'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

let cachedKey: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await deriveKey(getDeviceFingerprint())
  }
  return cachedKey
}

/**
 * 加密明文文本
 * @returns { encryptedData: Base64密文, iv: Base64 IV }
 */
export async function encrypt(plaintext: string): Promise<{ encryptedData: string; iv: string }> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )
  return {
    encryptedData: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  }
}

/**
 * 解密密文
 */
export async function decrypt(encryptedData: string, iv: string): Promise<string> {
  const key = await getKey()
  const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0))
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    encryptedBytes
  )
  return new TextDecoder().decode(decrypted)
}

/**
 * 清除缓存的密钥（用于重置场景）
 */
export function clearCachedKey(): void {
  cachedKey = null
}
