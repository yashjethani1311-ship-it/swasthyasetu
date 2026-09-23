import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component render error caught by ErrorBoundary:', error.message, errorInfo.componentStack)
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' })
    window.location.reload()
  }

  private handleGoHome = () => {
    this.setState({ hasError: false, errorMessage: '' })
    window.location.href = '/'
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800 antialiased">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 text-center space-y-4">
            <div className="size-12 rounded-full bg-rose-50 text-rose-600 grid place-items-center mx-auto">
              <AlertTriangle className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                Application Rendering Interrupted
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                SwasthyaSetu encountered an unexpected issue while rendering this workspace. Your clinical records and account data are safely preserved on the server.
              </p>
            </div>

            <div className="pt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
              >
                <Home className="size-3.5" />
                Return to Dashboard
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <RefreshCw className="size-3.5" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
