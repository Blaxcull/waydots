import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Persist Google OAuth tokens immediately on landing before any React Router redirection
if (typeof window !== 'undefined') {
  try {
    const hash = window.location.hash.replace(/^#/, '')
    const hashParams = new URLSearchParams(hash)
    const searchParams = new URLSearchParams(window.location.search)
    const providerToken = hashParams.get('provider_token') || searchParams.get('provider_token')
    if (providerToken) {
      localStorage.removeItem('google_provider_token_rejected')
      localStorage.setItem('google_provider_token', providerToken)
    }
  } catch {
    // Ignore extraction errors
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
