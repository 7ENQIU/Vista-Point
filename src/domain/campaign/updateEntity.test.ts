import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { updateEntityInCampaign } from './updateEntity'

function campaignWithEntity() {
  const campaign = createCampaign(
    { name: 'Тени над заливом' },
    new Date('2026-08-20T10:00:00.000Z'),
    'campaign-1',
  )
  return addEntityToCampaign(
    campaign,
    { type: 'npc', name: 'Серёга', summary: 'Смотритель маяка' },
    {
      now: new Date('2026-08-20T11:00:00.000Z'),
      entityId: 'entity-1',
      eventId: 'event-created',
    },
  ).campaign
}

describe('updateEntityInCampaign', () => {
  it('обновляет единую сущность и фиксирует обратимое событие с изменениями', () => {
    const campaign = campaignWithEntity()
    const result = updateEntityInCampaign(
      campaign,
      'entity-1',
      {
        name: '  Сергей  ',
        aliases: [' Серёга ', 'серёга', '', 'Маячник'],
        summary: '  Хранитель старого маяка  ',
        description: '  Знает все тропы на мысе.  ',
        status: 'active',
        visibility: 'party',
        tags: [' Побережье ', 'побережье', 'Союзник'],
        characterTags: [' Бандит ', 'бандит', 'Контрабандист'],
      },
      {
        now: new Date('2026-08-20T12:00:00.000Z'),
        eventId: 'event-updated',
      },
    )

    expect(result.changed).toBe(true)
    expect(result.entity).toMatchObject({
      id: 'entity-1',
      name: 'Сергей',
      aliases: ['Серёга', 'Маячник'],
      summary: 'Хранитель старого маяка',
      description: 'Знает все тропы на мысе.',
      status: 'active',
      visibility: 'party',
      tags: ['Побережье', 'Союзник'],
      characterTags: ['Бандит', 'Контрабандист'],
      updatedAt: '2026-08-20T12:00:00.000Z',
    })
    expect(result.event).toMatchObject({
      id: 'event-updated',
      type: 'entity.updated',
      relatedEntityIds: ['entity-1'],
      reversible: true,
    })
    expect(result.event?.payload).toMatchObject({
      changedFields: expect.arrayContaining(['name', 'aliases', 'status', 'visibility']),
      before: { name: 'Серёга', status: 'draft' },
      after: { name: 'Сергей', status: 'active' },
    })
    expect(campaign.entities[0].name).toBe('Серёга')
  })

  it('не сохраняет техническое событие, если данные не изменились', () => {
    const campaign = campaignWithEntity()
    const entity = campaign.entities[0]
    const result = updateEntityInCampaign(campaign, entity.id, {
      name: entity.name,
      aliases: entity.aliases,
      summary: entity.summary,
      description: entity.description,
      status: 'draft',
      visibility: entity.visibility,
      tags: entity.tags,
    })

    expect(result.changed).toBe(false)
    expect(result.campaign).toBe(campaign)
    expect(result.event).toBeUndefined()
  })

  it('запрещает пустое название и редактирование архивной сущности', () => {
    const campaign = campaignWithEntity()
    const input = {
      name: ' ',
      aliases: [],
      summary: '',
      description: '',
      status: 'draft' as const,
      visibility: 'game_master' as const,
      tags: [],
    }

    expect(() => updateEntityInCampaign(campaign, 'entity-1', input)).toThrow(
      'Название сущности обязательно.',
    )

    const archivedCampaign = {
      ...campaign,
      entities: campaign.entities.map((entity) => ({ ...entity, status: 'archived' as const })),
    }
    expect(() => updateEntityInCampaign(archivedCampaign, 'entity-1', input)).toThrow(
      'Архивную сущность нельзя редактировать.',
    )
  })
})
