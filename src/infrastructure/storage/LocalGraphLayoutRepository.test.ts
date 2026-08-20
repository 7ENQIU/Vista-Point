import { describe, expect, it } from 'vitest'
import { LocalGraphLayoutRepository } from './LocalGraphLayoutRepository'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null { return this.values.get(key) ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('LocalGraphLayoutRepository', () => {
  it('хранит независимые локальные раскладки режимов кампании', () => {
    const repository = new LocalGraphLayoutRepository(new MemoryStorage())
    repository.save('c1', 'world', { e1: { x: 120, y: 180 } })
    repository.save('c1', 'party', { e1: { x: 340, y: 220 } })

    expect(repository.load('c1', 'world')).toEqual({ e1: { x: 120, y: 180 } })
    expect(repository.load('c1', 'party')).toEqual({ e1: { x: 340, y: 220 } })
  })

  it('игнорирует повреждённые координаты и неизвестный формат', () => {
    const storage = new MemoryStorage()
    storage.setItem('vista-point:graph-layout:c1:world', JSON.stringify({
      version: 1,
      campaignId: 'c1',
      view: 'world',
      positions: { good: { x: 10, y: 20 }, bad: { x: 'oops', y: 30 } },
    }))
    const repository = new LocalGraphLayoutRepository(storage)

    expect(repository.load('c1', 'world')).toEqual({ good: { x: 10, y: 20 } })
    expect(repository.load('missing', 'world')).toEqual({})
  })

  it('сбрасывает только выбранную раскладку', () => {
    const repository = new LocalGraphLayoutRepository(new MemoryStorage())
    repository.save('c1', 'world', { e1: { x: 120, y: 180 } })
    repository.save('c1', 'party', { e1: { x: 340, y: 220 } })

    repository.clear('c1', 'world')

    expect(repository.load('c1', 'world')).toEqual({})
    expect(repository.load('c1', 'party')).toEqual({ e1: { x: 340, y: 220 } })
  })
})
