export type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'vista-point:theme'

export function getInitialTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Локальная настройка не обязательна для работы приложения.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  try { window.localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* интерфейс продолжает работать */ }
}
