import React from 'react'
import { AlertTriangle, RefreshCw, Terminal, ExternalLink, ShieldAlert } from 'lucide-react'

export interface ConfigurationErrorPageProps {
  missingVars?: string[]
}

export function ConfigurationErrorPage({
  missingVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
}: ConfigurationErrorPageProps) {
  const handleReload = () => {
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800 antialiased">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-amber-500/10 border-b border-amber-200 p-6 flex items-start gap-4">
          <div className="size-12 rounded-xl bg-amber-500/20 text-amber-700 grid place-items-center shrink-0">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              SwasthyaSetu Configuration Incomplete
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              The frontend application requires Supabase connection environment variables to initialize securely.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Missing Required Variables
            </p>
            <div className="space-y-1.5">
              {missingVars.map((v) => (
                <div
                  key={v}
                  className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs font-mono text-rose-800"
                >
                  <AlertTriangle className="size-3.5 text-rose-600 shrink-0" />
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Safe Setup Guidance
            </p>
            <div className="bg-slate-900 text-slate-200 p-3.5 rounded-xl text-xs font-mono space-y-2">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                <Terminal className="size-3.5" />
                <span>Create or update your .env.local file:</span>
              </div>
              <p className="text-teal-400 select-all">
                VITE_SUPABASE_URL=https://your-project.supabase.co
              </p>
              <p className="text-teal-400 select-all">
                VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-anon-key
              </p>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Copy from <code className="text-slate-700 font-mono">.env.example</code> into <code className="text-slate-700 font-mono">.env.local</code>. Never commit secret service keys to client repositories.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400">
            SwasthyaSetu EHR · Safe Startup Boundary
          </span>
          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <RefreshCw className="size-3.5" />
            Retry Connection
          </button>
        </div>
      </div>
    </div>
  )
}
