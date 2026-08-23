import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './ui/design-tokens.css'
import './ui/styles.css'
import { applyTheme, getInitialTheme } from './ui/theme'

applyTheme(getInitialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Офлайн-кэш — дополнительная возможность; сбой не блокирует локальную работу.
    })
  })
}
