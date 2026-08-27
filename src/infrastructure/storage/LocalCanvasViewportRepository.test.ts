import { describe, expect, it } from 'vitest'
import { LocalCanvasViewportRepository } from './LocalCanvasViewportRepository'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('LocalCanvasViewportRepository', () => {
  it('хранит viewport отдельно по кампании и режиму', () => {
    const repository = new LocalCanvasViewportRepository(new MemoryStorage())
    repository.save('c1', 'logic', { centerX: 620, centerY: 280, zoom: 1.4 })
    repository.save('c1', 'knowledge', { centerX: 100, centerY: 120, zoom: 0.8 })
    expect(repository.load('c1', 'logic')).toEqual({ centerX: 620, centerY: 280, zoom: 1.4 })
    expect(repository.load('c1', 'knowledge')).toEqual({ centerX: 100, centerY: 120, zoom: 0.8 })
    expect(repository.load('c2', 'logic')).toBeUndefined()
  })

  it('ограничивает масштаб и игнорирует повреждённую запись', () => {
    const storage = new MemoryStorage()
    const repository = new LocalCanvasViewportRepository(storage)
    repository.save('c1', 'logic', { centerX: 10, centerY: 20, zoom: 9 })
    expect(repository.load('c1', 'logic')?.zoom).toBe(2)
    storage.setItem('vista-point:canvas-viewport:c1:logic', '{broken')
    expect(repository.load('c1', 'logic')).toBeUndefined()
  })

  it('сбрасывает только выбранный режим', () => {
    const repository = new LocalCanvasViewportRepository(new MemoryStorage())
    repository.save('c1', 'logic', { centerX: 10, centerY: 20, zoom: 1 })
    repository.save('c1', 'knowledge', { centerX: 30, centerY: 40, zoom: 1 })
    repository.clear('c1', 'logic')
    expect(repository.load('c1', 'logic')).toBeUndefined()
    expect(repository.load('c1', 'knowledge')).toBeDefined()
  })
})
