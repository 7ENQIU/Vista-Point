import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { createCustomEntityTypeInCampaign, removeCustomEntityTypeFromCampaign, renameCustomEntityTypeInCampaign } from './customEntityTypes'
import { createEntityTemplateFromEntity } from './entityTemplates'

describe('пользовательские типы сущностей', () => {
  it('создаёт и переименовывает тип со стабильным ID и базовой семантикой', () => {
    const campaign = createCampaign({ name: 'Типы' })
    const created = createCustomEntityTypeInCampaign(campaign, { name: '  Город  ', baseType: 'location' }, {
      now: new Date('2026-08-27T08:00:00.000Z'), typeId: 'city', eventId: 'event-create',
    })
    const renamed = renameCustomEntityTypeInCampaign(created.campaign, 'city', 'Поселение', {
      now: new Date('2026-08-27T08:01:00.000Z'), eventId: 'event-rename',
    })

    expect(renamed.customType).toMatchObject({ id: 'city', name: 'Поселение', baseType: 'location' })
    expect(renamed.campaign.eventLog.map((event) => event.type)).toEqual(['entity.type.created', 'entity.type.renamed'])
  })

  it('создаёт сущность пользовательского типа и переносит тип в шаблон', () => {
    const withType = createCustomEntityTypeInCampaign(createCampaign({ name: 'Типы' }), { name: 'Город', baseType: 'location' }, { typeId: 'city' }).campaign
    const created = addEntityToCampaign(withType, { type: 'location', customTypeId: 'city', name: 'Речной порт' }, { entityId: 'port' })
    const templated = createEntityTemplateFromEntity(created.campaign, 'port', 'Городская основа', { templateId: 'city-template' })
    const next = addEntityToCampaign(templated.campaign, { type: 'location', customTypeId: 'city', templateId: 'city-template', name: 'Северный порт' }, { entityId: 'north-port' })

    expect(created.entity.customTypeId).toBe('city')
    expect(templated.template.customTypeId).toBe('city')
    expect(next.entity).toMatchObject({ id: 'north-port', type: 'location', customTypeId: 'city' })
  })

  it('не удаляет используемый тип и отклоняет несовместимую базу', () => {
    const withType = createCustomEntityTypeInCampaign(createCampaign({ name: 'Типы' }), { name: 'Злодей', baseType: 'npc' }, { typeId: 'villain' }).campaign
    expect(() => addEntityToCampaign(withType, { type: 'location', customTypeId: 'villain', name: 'Ошибка' })).toThrow('Базовый тип')
    const used = addEntityToCampaign(withType, { type: 'npc', customTypeId: 'villain', name: 'Князь' }).campaign
    expect(() => removeCustomEntityTypeFromCampaign(used, 'villain')).toThrow('используется сущностями')
  })

  it('удаляет свободный тип и защищает уникальность названий', () => {
    const first = createCustomEntityTypeInCampaign(createCampaign({ name: 'Типы' }), { name: 'Город', baseType: 'location' }, { typeId: 'city' })
    expect(() => createCustomEntityTypeInCampaign(first.campaign, { name: 'город', baseType: 'scene' })).toThrow('уже существует')
    expect(removeCustomEntityTypeFromCampaign(first.campaign, 'city', { eventId: 'remove' }).campaign.customEntityTypes).toEqual([])
  })
})
