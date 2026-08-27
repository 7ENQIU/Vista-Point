import { describe, expect, it } from 'vitest'
import { LocalHistoryPreferencesRepository } from './LocalHistoryPreferencesRepository'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null { return this.values.get(key) ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('LocalHistoryPreferencesRepository', () => {
  it('хранит курсор очистки отдельно для каждого проекта', () => {
    const repository = new LocalHistoryPreferencesRepository(new MemoryStorage())
    repository.clearThrough('c1', 'event-1')
    repository.clearThrough('c2', 'event-2')

    expect(repository.loadClearedThroughEventId('c1')).toBe('event-1')
    expect(repository.loadClearedThroughEventId('c2')).toBe('event-2')
  })

  it('восстанавливает очищенную историю без изменения проекта', () => {
    const repository = new LocalHistoryPreferencesRepository(new MemoryStorage())
    repository.clearThrough('c1', 'event-1')
    repository.restore('c1')

    expect(repository.loadClearedThroughEventId('c1')).toBeUndefined()
  })

  it('игнорирует повреждённую локальную настройку', () => {
    const storage = new MemoryStorage()
    storage.setItem('vista-point:history-preferences:c1', '{broken')

    expect(new LocalHistoryPreferencesRepository(storage).loadClearedThroughEventId('c1')).toBeUndefined()
  })
})
