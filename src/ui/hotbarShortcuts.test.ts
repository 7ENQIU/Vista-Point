import { describe, expect, it } from 'vitest'
import { resolveHotbarShortcut } from './hotbarShortcuts'

const base = { ctrlKey: false, metaKey: false, altKey: false, targetTagName: 'DIV', isContentEditable: false }

describe('hotbar shortcuts', () => {
  it('сопоставляет 1–9 и 0 с десятью слотами', () => {
    expect(resolveHotbarShortcut({ ...base, key: '1' })).toBe(1)
    expect(resolveHotbarShortcut({ ...base, key: '9' })).toBe(9)
    expect(resolveHotbarShortcut({ ...base, key: '0' })).toBe(10)
  })

  it('не перехватывает цифры в формах и с модификаторами', () => {
    expect(resolveHotbarShortcut({ ...base, key: '1', targetTagName: 'INPUT' })).toBeUndefined()
    expect(resolveHotbarShortcut({ ...base, key: '1', targetTagName: 'TEXTAREA' })).toBeUndefined()
    expect(resolveHotbarShortcut({ ...base, key: '1', ctrlKey: true })).toBeUndefined()
    expect(resolveHotbarShortcut({ ...base, key: '1', isContentEditable: true })).toBeUndefined()
  })

  it('возвращает отдельную команду Escape', () => {
    expect(resolveHotbarShortcut({ ...base, key: 'Escape' })).toBe('escape')
  })
})
