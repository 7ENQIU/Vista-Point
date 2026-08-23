import { describe, expect, it } from 'vitest'
import type { CampaignEntity, EntityType } from '../domain/campaign/types'
import { findEntitySearchMatch, searchCampaignEntities } from './searchCampaignEntities'

function entity(
  id: string,
  type: EntityType,
  name: string,
  fields: Partial<CampaignEntity> = {},
): CampaignEntity {
  return {
    id,
    campaignId: 'c1',
    type,
    name,
    aliases: [],
    summary: '',
    description: '',
    status: 'draft',
    visibility: 'game_master',
    tags: [],
    characterTags: [],
    customFields: {},
    state: [],
    origin: { mode: 'preparation', processed: true, worldTime: '2026-08-20T00:00:00.000Z' },
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...fields,
  }
}

describe('searchCampaignEntities', () => {
  const entities = [
    entity('e1', 'npc', 'Серёга', {
      aliases: ['Маячник'],
      description: 'Хранит ключ от старой башни',
      tags: ['союзник'],
      characterTags: ['бандит'],
      customFields: { роль: 'проводник' },
      status: 'active',
      state: [{
        id: 's1',
        name: 'Настроение',
        category: 'social',
        valueType: 'text',
        value: 'Насторожен',
        updatedAt: '2026-08-20T00:00:00.000Z',
      }],
    }),
    entity('e2', 'location', 'Пурпе'),
    entity('e3', 'npc', 'Анна'),
  ]

  it.each(['серега', 'Серёга', 'cthtuf', 'Cth`uf'])('находит имя при запросе «%s»', (query) => {
    const groups = searchCampaignEntities(entities, { query, types: [], status: 'all' })
    expect(groups.flatMap((group) => group.results).map((result) => result.entity.id)).toEqual(['e1'])
  })

  it.each([
    ['маячник', 'alias'],
    ['старой башни', 'description'],
    ['союзник', 'tag'],
    ['бандит', 'character_tag'],
    ['проводник', 'custom_field'],
    ['настроение', 'state_name'],
    ['насторожен', 'state_value'],
  ] as const)('ищет «%s» в расширенном поле %s', (query, field) => {
    expect(findEntitySearchMatch(entities[0], query)?.field).toBe(field)
  })

  it('применяет тип и статус одновременно и группирует результат', () => {
    const groups = searchCampaignEntities(entities, {
      query: '',
      types: ['npc'],
      status: 'draft',
    })

    expect(groups.map((group) => group.type)).toEqual(['npc'])
    expect(groups[0].results.map((result) => result.entity.name)).toEqual(['Анна'])
  })

  it('не возвращает архивные сущности', () => {
    const archived = entity('e4', 'npc', 'Архивный', { status: 'archived' })
    const groups = searchCampaignEntities([...entities, archived], {
      query: '',
      types: [],
      status: 'all',
    })

    expect(groups.flatMap((group) => group.results).some((result) => result.entity.id === 'e4')).toBe(false)
  })

  it('находит сущность по связанному знанию', () => {
    const groups = searchCampaignEntities(entities, {
      query: 'тайный проход',
      types: [],
      status: 'all',
      knowledge: [{
        id: 'k1', campaignId: 'c1', subjectType: 'party', content: 'Здесь есть тайный проход.',
        status: 'known', confidence: 80, truth: 'true', source: 'Карта',
        relatedEntityIds: ['e2'], createdAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
      }],
    })

    expect(groups[0].results[0]).toMatchObject({ entity: { id: 'e2' }, match: { field: 'knowledge' } })
  })
})
