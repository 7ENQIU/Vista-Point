import { describe, expect, it } from 'vitest'
import type { CampaignEntity, EntityType } from '../domain/campaign/types'
import { groupRelationshipSources } from './groupRelationshipSources'

function entity(id: string, type: EntityType, name: string, aliases: string[] = []): CampaignEntity {
  return {
    id,
    campaignId: 'c1',
    type,
    name,
    aliases,
    summary: '',
    description: '',
    status: 'draft',
    visibility: 'game_master',
    tags: [],
    customFields: {},
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
}

describe('groupRelationshipSources', () => {
  const entities = [
    entity('e1', 'npc', 'Серёга'),
    entity('e2', 'location', 'Пурпе'),
    entity('e3', 'npc', 'Анна', ['Смотритель']),
  ]

  it('группирует по типу и сортирует сущности по русскому алфавиту', () => {
    const groups = groupRelationshipSources(entities, '')

    expect(groups.map((group) => group.type)).toEqual(['location', 'npc'])
    expect(groups[1].entities.map((item) => item.name)).toEqual(['Анна', 'Серёга'])
  })

  it.each([
    'Серёга',
    'серега',
    'Серега',
    'серёга',
    'cthtuf',
    'Cthtuf',
    'cth`uf',
    'Cth`uf',
  ])('находит Серёгу по запросу «%s»', (query) => {
    const groups = groupRelationshipSources(entities, query)
    expect(groups.flatMap((group) => group.entities).map((item) => item.id)).toEqual(['e1'])
  })

  it('находит сущность по алиасу', () => {
    const groups = groupRelationshipSources(entities, 'смотр')
    expect(groups.flatMap((group) => group.entities).map((item) => item.id)).toEqual(['e3'])
  })
})
