import { useEffect, useState } from 'react'
import { applyTheme, getInitialTheme, type ThemeMode } from './theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)

  useEffect(() => applyTheme(theme), [theme])

  return (
    <div className="theme-toggle" aria-label="Тема оформления" role="group">
      <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')} type="button">Светлая</button>
      <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} type="button">Тёмная</button>
    </div>
  )
}
