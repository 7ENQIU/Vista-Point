import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { addRelationshipToCampaign } from '../../domain/campaign/addRelationship'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { buildEntityContextPaths, selectImmediateHierarchyRelationships } from './buildEntityContext'

function hierarchyCampaign() {
  let campaign = createCampaign({ name: 'Иерархия' }, new Date('2026-08-24T00:00:00Z'), 'c1')
  for (const [id, type, name] of [
    ['world', 'location', 'Мир'],
    ['city', 'location', 'Пурпе'],
    ['station', 'location', 'Вокзал'],
    ['scene', 'scene', 'Встреча на вокзале'],
    ['max', 'npc', 'Макс'],
  ] as const) campaign = addEntityToCampaign(campaign, { type, name }, { entityId: id }).campaign
  for (const input of [
    { sourceId: 'city', targetId: 'world', type: 'located_in' as const, directed: true },
    { sourceId: 'station', targetId: 'city', type: 'located_in' as const, directed: true },
    { sourceId: 'scene', targetId: 'station', type: 'located_in' as const, directed: true },
    { sourceId: 'max', targetId: 'station', type: 'located_in' as const, directed: true },
    { sourceId: 'max', targetId: 'scene', type: 'participates_in' as const, directed: true },
  ]) campaign = addRelationshipToCampaign(campaign, input).campaign
  return campaign
}

describe('buildEntityContextPaths', () => {
  it('строит контекст от мира до ближайшей сцены без дублирования сущностей', () => {
    const paths = buildEntityContextPaths(hierarchyCampaign())

    expect(paths.get('city')?.map((entity) => entity.name)).toEqual(['Мир'])
    expect(paths.get('max')?.map((entity) => entity.name)).toEqual(['Мир', 'Пурпе', 'Вокзал', 'Встреча на вокзале'])
  })

  it('для участника сцены скрывает прямую связь с локацией', () => {
    const selected = selectImmediateHierarchyRelationships(hierarchyCampaign())
      .filter((relationship) => relationship.sourceId === 'max')

    expect(selected).toHaveLength(1)
    expect(selected[0].type).toBe('participates_in')
  })
})
