interface KeyValueStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

const ENGLISH_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,."
const RUSSIAN_LAYOUT = 'йцукенгшщзхъфывапролджэячсмитьбю'
const STORAGE_KEY = 'vista-point:canvas-shortcut:new-entity'

export const DEFAULT_NEW_ENTITY_SHORTCUT = 'n'

export function normalizeCanvasShortcut(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('ru-RU')
  if (!/^\p{L}$/u.test(normalized)) throw new Error('Выберите одну буквенную клавишу.')
  return normalized
}

export function canvasShortcutKeys(value: string): string[] {
  const normalized = normalizeCanvasShortcut(value)
  const englishIndex = ENGLISH_LAYOUT.indexOf(normalized)
  const russianIndex = RUSSIAN_LAYOUT.indexOf(normalized)
  const counterpart = englishIndex >= 0 ? RUSSIAN_LAYOUT[englishIndex]
    : russianIndex >= 0 ? ENGLISH_LAYOUT[russianIndex]
      : undefined
  return [...new Set([normalized, counterpart].filter((key): key is string => Boolean(key)))]
}

export function canvasShortcutLabel(value: string): string {
  return canvasShortcutKeys(value).map((key) => key.toLocaleUpperCase('ru-RU')).join(' / ')
}

export function matchesCanvasShortcut(eventKey: string, configuredKey: string): boolean {
  return canvasShortcutKeys(configuredKey).includes(eventKey.toLocaleLowerCase('ru-RU'))
}

export class LocalCanvasShortcutRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  loadNewEntityShortcut(): string {
    const raw = this.storage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_NEW_ENTITY_SHORTCUT
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; key?: unknown }
      return parsed.version === 1 && typeof parsed.key === 'string'
        ? normalizeCanvasShortcut(parsed.key)
        : DEFAULT_NEW_ENTITY_SHORTCUT
    } catch {
      return DEFAULT_NEW_ENTITY_SHORTCUT
    }
  }

  saveNewEntityShortcut(key: string): string {
    const normalized = normalizeCanvasShortcut(key)
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, key: normalized }))
    return normalized
  }

  resetNewEntityShortcut(): void {
    this.storage.removeItem(STORAGE_KEY)
  }
}
