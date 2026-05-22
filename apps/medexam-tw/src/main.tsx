import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth/AuthContext'
import { initConsoleErrorBuffer } from './services/console-error-buffer'
import '@study-rpg/theme-pixel-medical/styles/global.css'
import './styles.css'

// Inject a base-aware @font-face so the pixel font loads under any deploy
// base (/study-rpg/ on GH Pages, /1st/ on Cloudflare Pages). Static CSS
// @font-face URLs starting with "/" are NOT rebased by Vite, so we ship
// this runtime version in addition (browser tries all sources, uses the
// first that loads).
function injectBaseAwareFontFace(): void {
  const base = import.meta.env.BASE_URL // e.g. "/study-rpg/" or "/1st/"
  const style = document.createElement('style')
  style.dataset.injectedBy = 'base-aware-font-face'
  style.textContent = `
@font-face {
  font-family: 'Cubic 11';
  src: url('${base}fonts/Cubic_11.woff2') format('woff2'),
       url('${base}fonts/Cubic_11.woff') format('woff');
  font-display: swap;
}`
  document.head.appendChild(style)
}
injectBaseAwareFontFace()

initConsoleErrorBuffer()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
