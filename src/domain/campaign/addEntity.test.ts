import { describe, expect, it } from 'vitest'
import { createCampaign } from './createCampaign'
import { addEntityToCampaign } from './addEntity'

describe('addEntityToCampaign', () => {
  it('создаёт единую черновую сущность и фиксирует событие', () => {
    const campaign = createCampaign(
      { name: 'Тени над заливом' },
      new Date('2026-08-19T18:00:00.000Z'),
      'campaign-1',
    )

    const result = addEntityToCampaign(
      campaign,
      { type: 'location', name: '  Старый маяк  ', summary: '  На северном мысе  ' },
      {
        now: new Date('2026-08-19T19:00:00.000Z'),
        entityId: 'entity-1',
        eventId: 'event-1',
      },
    )

    expect(result.entity).toMatchObject({
      id: 'entity-1',
      campaignId: 'campaign-1',
      type: 'location',
      name: 'Старый маяк',
      summary: 'На северном мысе',
      status: 'active',
    })
    expect(result.event).toMatchObject({
      id: 'event-1',
      type: 'entity.created',
      relatedEntityIds: ['entity-1'],
      reversible: true,
    })
    expect(result.campaign.entities).toEqual([result.entity])
    expect(result.campaign.eventLog).toEqual([result.event])
    expect(campaign.entities).toEqual([])
  })

  it('не создаёт сущность без названия', () => {
    const campaign = createCampaign({ name: 'Кампания' })

    expect(() => addEntityToCampaign(campaign, { type: 'npc', name: '   ' })).toThrow(
      'Название сущности обязательно.',
    )
  })

  it('не создаёт числовой уровень локации и сохраняет отдельные ролевые теги NPC', () => {
    const campaign = createCampaign({ name: 'Иерархия' })
    const location = addEntityToCampaign(campaign, { type: 'location', name: 'Пурпе' }).entity
    const npc = addEntityToCampaign(campaign, { type: 'npc', name: 'Макс', characterTags: [' бандит ', 'дворянин'] }).entity

    expect(location.locationLevel).toBeUndefined()
    expect(npc.characterTags).toEqual(['бандит', 'дворянин'])
  })
})
