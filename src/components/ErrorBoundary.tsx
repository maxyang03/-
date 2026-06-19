import { Component, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-5 safe-area-top safe-area-bottom">
          <p className="text-4xl mb-4">😵</p>
          <h1 className="text-xl font-bold text-slate-800 mb-2">出了点问题</h1>
          <p className="text-sm text-slate-500 text-center mb-1">
            {this.state.error?.message || '应用遇到未知错误'}
          </p>
          <p className="text-xs text-slate-400 text-center mb-6">
            请尝试刷新页面，或返回首页重新开始
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-800 text-white px-6 py-3 rounded-xl font-semibold touch-target active:bg-blue-900"
            >
              刷新页面
            </button>
            <Link
              to="/"
              className="bg-slate-200 text-slate-700 px-6 py-3 rounded-xl font-semibold touch-target active:bg-slate-300"
            >
              返回首页
            </Link>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
