import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { createEntityTemplateFromEntity, removeEntityTemplateFromCampaign } from './entityTemplates'

function campaignWithPreparedNpc() {
  const base = addEntityToCampaign(createCampaign({ name: 'Шаблоны' }), {
    type: 'npc', name: 'Анна', summary: 'Разведчица', characterTags: ['союзник'],
  }, { entityId: 'anna' }).campaign
  return {
    ...base,
    customFieldDefinitions: [{ id: 'rank', name: 'Ранг', type: 'number' as const }],
    entities: base.entities.map((entity) => ({
      ...entity,
      description: 'Умеет читать следы.',
      dmNotes: 'Скрывает прошлое.',
      tags: ['Башня'],
      customFields: { rank: 2 },
      state: [{ id: 'hp', name: 'Здоровье', category: 'life' as const, valueType: 'integer' as const, value: 8, updatedAt: entity.updatedAt }],
      image: { dataUrl: 'data:image/png;base64,aA==', mimeType: 'image/png' as const, fileName: 'anna.png', updatedAt: entity.updatedAt },
    })),
  }
}

describe('шаблоны карточек', () => {
  it('создаёт переносимую заготовку без имени, изображения, состояния и связей', () => {
    const result = createEntityTemplateFromEntity(campaignWithPreparedNpc(), 'anna', 'Разведчик', {
      templateId: 'template-1', eventId: 'template-event', now: new Date('2026-08-27T10:00:00.000Z'),
    })

    expect(result.template).toEqual({
      id: 'template-1', campaignId: result.campaign.id, name: 'Разведчик', entityType: 'npc',
      summary: 'Разведчица', description: 'Умеет читать следы.', dmNotes: 'Скрывает прошлое.',
      tags: ['Башня'], characterTags: ['союзник'], customFields: { rank: 2 },
      createdAt: '2026-08-27T10:00:00.000Z', updatedAt: '2026-08-27T10:00:00.000Z',
    })
    expect(result.event).toMatchObject({ type: 'entity.template.created', reversible: false, relatedEntityIds: ['anna'] })
  })

  it('создаёт новую единственную сущность из шаблона и не копирует runtime-данные', () => {
    const withTemplate = createEntityTemplateFromEntity(campaignWithPreparedNpc(), 'anna', 'Разведчик', { templateId: 'template-1' }).campaign
    const result = addEntityToCampaign(withTemplate, {
      type: 'npc', name: 'Борис', templateId: 'template-1',
    }, { entityId: 'boris', eventId: 'create-boris' })

    expect(result.entity).toMatchObject({
      id: 'boris', name: 'Борис', type: 'npc', summary: 'Разведчица', description: 'Умеет читать следы.',
      dmNotes: 'Скрывает прошлое.', tags: ['Башня'], characterTags: ['союзник'], customFields: { rank: 2 },
      state: [], image: undefined,
    })
    expect(result.event.payload).toMatchObject({ templateId: 'template-1', templateName: 'Разведчик' })
    expect(result.campaign.entities).toHaveLength(2)
  })

  it('не допускает дубликат названия и удаляет шаблон без изменения сущностей', () => {
    const created = createEntityTemplateFromEntity(campaignWithPreparedNpc(), 'anna', 'Разведчик', { templateId: 'template-1' }).campaign
    expect(() => createEntityTemplateFromEntity(created, 'anna', ' разведчик ')).toThrow('уже существует')

    const removed = removeEntityTemplateFromCampaign(created, 'template-1', { eventId: 'remove-template' })
    expect(removed.campaign.entityTemplates).toEqual([])
    expect(removed.campaign.entities).toEqual(created.entities)
    expect(removed.event).toMatchObject({ id: 'remove-template', type: 'entity.template.removed', reversible: false })
  })
})
