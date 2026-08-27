import { describe, expect, it } from 'vitest'
import {
  canvasShortcutKeys,
  canvasShortcutLabel,
  DEFAULT_NEW_ENTITY_SHORTCUT,
  LocalCanvasShortcutRepository,
  matchesCanvasShortcut,
} from './LocalCanvasShortcutRepository'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('LocalCanvasShortcutRepository', () => {
  it('по умолчанию принимает N и ту же клавишу в русской раскладке', () => {
    expect(canvasShortcutKeys(DEFAULT_NEW_ENTITY_SHORTCUT)).toEqual(['n', 'т'])
    expect(canvasShortcutLabel(DEFAULT_NEW_ENTITY_SHORTCUT)).toBe('N / Т')
    expect(matchesCanvasShortcut('N', DEFAULT_NEW_ENTITY_SHORTCUT)).toBe(true)
    expect(matchesCanvasShortcut('т', DEFAULT_NEW_ENTITY_SHORTCUT)).toBe(true)
  })

  it('сохраняет пользовательскую буквенную клавишу локально', () => {
    const repository = new LocalCanvasShortcutRepository(storage())
    expect(repository.loadNewEntityShortcut()).toBe('n')
    expect(repository.saveNewEntityShortcut(' Л ')).toBe('л')
    expect(repository.loadNewEntityShortcut()).toBe('л')
    expect(matchesCanvasShortcut('k', repository.loadNewEntityShortcut())).toBe(true)
  })

  it('не позволяет занять цифровые клавиши хотбара', () => {
    const repository = new LocalCanvasShortcutRepository(storage())
    expect(() => repository.saveNewEntityShortcut('1')).toThrow('буквенную')
  })
})
