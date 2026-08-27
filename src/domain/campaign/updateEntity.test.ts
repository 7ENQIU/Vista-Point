import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { updateEntityInCampaign } from './updateEntity'
import { setLogicRuleInCampaign } from './logicRules'
import { createEntityTemplateFromEntity } from './entityTemplates'

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
      changedFields: expect.arrayContaining(['name', 'aliases']),
      before: { name: 'Серёга' },
      after: { name: 'Сергей' },
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
      tags: entity.tags,
    })

    expect(result.changed).toBe(false)
    expect(result.campaign).toBe(campaign)
    expect(result.event).toBeUndefined()
  })

  it('не дублирует изображение в журнале и помечает его замену необратимой', () => {
    const campaign = campaignWithEntity()
    const image = {
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      mimeType: 'image/png' as const,
      fileName: 'portrait.png',
      updatedAt: '2026-08-20T12:00:00.000Z',
    }
    const entity = campaign.entities[0]
    const result = updateEntityInCampaign(campaign, entity.id, {
      name: entity.name, aliases: entity.aliases, summary: entity.summary,
      description: entity.description,
      tags: entity.tags, image,
    }, { eventId: 'image-event' })

    expect(result.entity.image).toEqual(image)
    expect(result.event?.reversible).toBe(false)
    expect(result.event?.payload.after).toEqual({
      image: { fileName: 'portrait.png', mimeType: 'image/png', updatedAt: image.updatedAt },
    })
    expect(JSON.stringify(result.event)).not.toContain(image.dataUrl)
  })

  it('запрещает пустое название и редактирование архивной сущности', () => {
    const campaign = campaignWithEntity()
    const input = {
      name: ' ',
      aliases: [],
      summary: '',
      description: '',
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

  it('создаёт типизированные поля кампании и сохраняет значения в единой сущности', () => {
    const campaign = campaignWithEntity()
    const result = updateEntityInCampaign(campaign, 'entity-1', {
      name: 'Серёга', aliases: [], summary: 'Смотритель маяка', description: '', tags: [],
      customFieldDefinitions: [
        { id: 'reputation', name: 'Репутация', type: 'number' },
        { id: 'contact', name: 'Контакт', type: 'entity_reference' },
      ],
      customFields: { reputation: 4, contact: 'entity-1' },
    }, { eventId: 'custom-fields-event' })

    expect(result.campaign.customFieldDefinitions).toEqual([
      { id: 'reputation', name: 'Репутация', type: 'number' },
      { id: 'contact', name: 'Контакт', type: 'entity_reference' },
    ])
    expect(result.entity.customFields).toEqual({ reputation: 4, contact: 'entity-1' })
    expect(result.event).toMatchObject({ type: 'entity.updated', reversible: false })
  })

  it('отклоняет значение неверного типа и ссылку на отсутствующую сущность', () => {
    const campaign = campaignWithEntity()
    const base = { name: 'Серёга', aliases: [], summary: 'Смотритель маяка', description: '', tags: [] }

    expect(() => updateEntityInCampaign(campaign, 'entity-1', {
      ...base,
      customFieldDefinitions: [{ id: 'rank', name: 'Ранг', type: 'number' }],
      customFields: { rank: 'первый' },
    })).toThrow('неверного типа')

    expect(() => updateEntityInCampaign(campaign, 'entity-1', {
      ...base,
      customFieldDefinitions: [{ id: 'owner', name: 'Владелец', type: 'entity_reference' }],
      customFields: { owner: 'missing' },
    })).toThrow('отсутствующую сущность')
  })

  it('сохраняет новое определение даже без значения в текущей сущности', () => {
    const campaign = campaignWithEntity()
    const entity = campaign.entities[0]
    const result = updateEntityInCampaign(campaign, entity.id, {
      name: entity.name,
      aliases: entity.aliases,
      summary: entity.summary,
      description: entity.description,
      tags: entity.tags,
      customFieldDefinitions: [{ id: 'motto', name: 'Девиз', type: 'text' }],
      customFields: {},
    }, { eventId: 'definition-event' })

    expect(result.changed).toBe(true)
    expect(result.campaign.customFieldDefinitions).toEqual([{ id: 'motto', name: 'Девиз', type: 'text' }])
    expect(result.event).toMatchObject({
      id: 'definition-event',
      reversible: false,
      payload: { changedFields: [], customFieldDefinitionsChanged: true },
    })
  })

  it('переименовывает определение без смены ID и потери значений', () => {
    const base = campaignWithEntity()
    const campaign = {
      ...base,
      customFieldDefinitions: [{ id: 'rank', name: 'Ранг', type: 'number' as const }],
      entities: base.entities.map((entity) => ({ ...entity, customFields: { rank: 2 } })),
    }
    const entity = campaign.entities[0]
    const result = updateEntityInCampaign(campaign, entity.id, {
      name: entity.name, aliases: entity.aliases, summary: entity.summary, description: entity.description, tags: entity.tags,
      customFieldDefinitions: [{ id: 'rank', name: 'Уровень доверия', type: 'number' }],
      customFields: entity.customFields,
    }, { eventId: 'rename-field' })

    expect(result.campaign.customFieldDefinitions).toEqual([{ id: 'rank', name: 'Уровень доверия', type: 'number' }])
    expect(result.entity.customFields).toEqual({ rank: 2 })
    expect(result.event).toMatchObject({ id: 'rename-field', reversible: false })
  })

  it('удаляет только свободное определение и запрещает смену типа', () => {
    const base = campaignWithEntity()
    const campaign = { ...base, customFieldDefinitions: [{ id: 'motto', name: 'Девиз', type: 'text' as const }] }
    const entity = campaign.entities[0]
    const common = { name: entity.name, aliases: entity.aliases, summary: entity.summary, description: entity.description, tags: entity.tags, customFields: {} }

    expect(updateEntityInCampaign(campaign, entity.id, { ...common, customFieldDefinitions: [] }).campaign.customFieldDefinitions).toEqual([])
    expect(() => updateEntityInCampaign(campaign, entity.id, {
      ...common, customFieldDefinitions: [{ id: 'motto', name: 'Девиз', type: 'number' }],
    })).toThrow('Тип существующего')
  })

  it('не удаляет определение с заполненными значениями или ссылками из логики', () => {
    const base = campaignWithEntity()
    const withValue = {
      ...base,
      customFieldDefinitions: [{ id: 'trust', name: 'Доверие', type: 'number' as const }],
      entities: base.entities.map((entity) => ({ ...entity, customFields: { trust: 2 } })),
    }
    const entity = withValue.entities[0]
    const withoutDefinitions = { name: entity.name, aliases: entity.aliases, summary: entity.summary, description: entity.description, tags: entity.tags, customFieldDefinitions: [], customFields: {} }
    expect(() => updateEntityInCampaign(withValue, entity.id, withoutDefinitions)).toThrow('заполнено хотя бы у одной сущности')

    const withoutValue = { ...withValue, entities: withValue.entities.map((item) => ({ ...item, customFields: {} })) }
    const withRule = setLogicRuleInCampaign(withoutValue, {
      name: 'Проверить доверие', enabled: true,
      conditionGroup: { kind: 'group', operator: 'all', children: [{ kind: 'condition', entityId: entity.id, field: 'custom_field', customFieldId: 'trust', operator: 'not_exists' }] },
      effects: [{ entityId: entity.id, type: 'set_custom_field', customFieldId: 'trust', value: 1 }],
      executionMode: 'require_confirmation',
    }).campaign
    expect(() => updateEntityInCampaign(withRule, entity.id, withoutDefinitions)).toThrow('используется логическим правилом')

    const withTemplate = createEntityTemplateFromEntity(withValue, entity.id, 'NPC', { templateId: 'npc-template' }).campaign
    const templateWithoutEntityValue = { ...withTemplate, entities: withTemplate.entities.map((item) => ({ ...item, customFields: {} })) }
    expect(() => updateEntityInCampaign(templateWithoutEntityValue, entity.id, withoutDefinitions)).toThrow('используется шаблоном карточки')
  })
})
