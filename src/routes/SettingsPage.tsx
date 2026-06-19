import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApiKeys } from '../hooks/useApiKeys'
import type { ConnectionStatus } from '../types'

/** 连接状态对应的 UI */
function StatusBadge({ status }: { status: ConnectionStatus }) {
  const map: Record<ConnectionStatus, { text: string; cls: string }> = {
    idle:    { text: '',          cls: '' },
    testing: { text: '测试中…',   cls: 'bg-yellow-100 text-yellow-700' },
    success: { text: '✓ 已连接',  cls: 'bg-green-100 text-green-700' },
    error:   { text: '✗ 连接失败', cls: 'bg-red-100 text-red-700' },
  }
  const m = map[status] || map.idle
  if (!m.text) return null
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${m.cls}`}>
      {m.text}
    </span>
  )
}

export default function SettingsPage() {
  const {
    keys, loaded,
    deepseekStatus, tencentStatus, azureStatus,
    updateKey, saveKeys, testAll,
  } = useApiKeys()

  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    const ok = await saveKeys()
    if (ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleTestAll = async () => {
    await testAll()
  }

  // 防止 SSR 闪烁
  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400">加载中…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 safe-area-top safe-area-bottom">
      {/* Header */}
      <header className="bg-blue-800 text-white px-5 pt-12 pb-5 safe-area-top">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-white/80 touch-target flex items-center">
            ←
          </Link>
          <h1 className="text-2xl font-bold">API 设置</h1>
        </div>
        <p className="text-blue-200 text-sm mt-1 ml-9">配置 AI 服务连接</p>
      </header>

      {/* 表单 */}
      <main className="flex-1 px-5 py-6 space-y-5 overflow-y-auto">

        {/* === DeepSeek === */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">DeepSeek API</h2>
            <StatusBadge status={deepseekStatus} />
          </div>
          <label className="block text-sm text-slate-500 mb-1">API Key</label>
          <input
            type="password"
            value={keys.deepseekKey}
            onChange={e => updateKey('deepseekKey', e.target.value)}
            placeholder="sk-..."
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-2">
            用于普通话 → 粤语翻译 + 粤拼标注 · <a href="https://platform.deepseek.com/api_keys" target="_blank" className="text-blue-500 underline">获取 Key</a>
          </p>
        </section>

        {/* === 腾讯云 ASR === */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">腾讯云 ASR</h2>
            <StatusBadge status={tencentStatus} />
          </div>
          <label className="block text-sm text-slate-500 mb-1">SecretId</label>
          <input
            type="text"
            value={keys.tencentSecretId}
            onChange={e => updateKey('tencentSecretId', e.target.value)}
            placeholder="AKID..."
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          />
          <label className="block text-sm text-slate-500 mb-1">SecretKey</label>
          <input
            type="password"
            value={keys.tencentSecretKey}
            onChange={e => updateKey('tencentSecretKey', e.target.value)}
            placeholder="..."
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-2">
            语音识别（普通话 → 文字 + 时间戳）· <a href="https://console.cloud.tencent.com/cam/capi" target="_blank" className="text-blue-500 underline">获取密钥</a>
          </p>
        </section>

        {/* === Azure TTS === */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">Azure TTS</h2>
            <StatusBadge status={azureStatus} />
          </div>
          <label className="block text-sm text-slate-500 mb-1">Subscription Key</label>
          <input
            type="password"
            value={keys.azureSubscriptionKey}
            onChange={e => updateKey('azureSubscriptionKey', e.target.value)}
            placeholder="..."
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          />
          <label className="block text-sm text-slate-500 mb-1">Region</label>
          <input
            type="text"
            value={keys.azureRegion}
            onChange={e => updateKey('azureRegion', e.target.value)}
            placeholder="例如 eastasia"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-2">
            粤语 TTS 朗读 · <a href="https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/SpeechServices" target="_blank" className="text-blue-500 underline">获取密钥</a>
          </p>
        </section>

        {/* === 操作按钮 === */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleTestAll}
            className="w-full bg-blue-800 text-white font-semibold py-4 rounded-xl active:bg-blue-900 transition-colors touch-target disabled:opacity-50"
          >
            测试连接
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`w-full font-semibold py-4 rounded-xl transition-colors touch-target ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-slate-200 text-slate-700 active:bg-slate-300'
            }`}
          >
            {saved ? '✓ 已保存' : '保存设置'}
          </button>
        </div>

        {/* 隐私声明 */}
        <p className="text-xs text-slate-400 text-center pb-6">
          所有 API Key 加密存储在你的设备本地（IndexedDB + AES-GCM），不会上传到任何第三方服务器。
        </p>
      </main>
    </div>
  )
}
