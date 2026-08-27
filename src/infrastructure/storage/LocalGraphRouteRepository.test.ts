import { describe, expect, it } from 'vitest'
import { LocalGraphRouteRepository } from './LocalGraphRouteRepository'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('LocalGraphRouteRepository', () => {
  it('хранит ручные точки линий отдельно от кампании', () => {
    const repository = new LocalGraphRouteRepository(storage())
    repository.save('campaign', 'world', { fact: { x: 420, y: 180 } })
    expect(repository.load('campaign', 'world')).toEqual({ fact: { x: 420, y: 180 } })
    repository.clear('campaign', 'world')
    expect(repository.load('campaign', 'world')).toEqual({})
  })
})
