import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'
import { AuthProvider } from './lib/auth'
import { LanguageProvider } from './lib/i18n'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <LanguageProvider>
                <App />
            </LanguageProvider>
        </AuthProvider>
    </React.StrictMode>
)