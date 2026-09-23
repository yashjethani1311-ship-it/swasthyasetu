import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'
import { AuthProvider } from './lib/auth'
import { LanguageProvider } from './lib/i18n'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConfigurationErrorPage } from './components/ConfigurationErrorPage'
import { isSupabaseConfigured, getMissingSupabaseConfig } from './lib/supabase'

function Root() {
  if (!isSupabaseConfigured) {
    return <ConfigurationErrorPage missingVars={getMissingSupabaseConfig()} />
  }

  return (
    <AuthProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
)