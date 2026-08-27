import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from '../domain/campaign/addEntity'
import { createCampaign } from '../domain/campaign/createCampaign'
import { EntityEditor } from './EntityEditor'

describe('EntityEditor · пользовательские поля', () => {
  it('показывает имя, тип, использование и блокирует удаление заполненного поля', () => {
    const base = addEntityToCampaign(createCampaign({ name: 'Поля' }), { type: 'npc', name: 'Анна' }, { entityId: 'anna' }).campaign
    const campaign = {
      ...base,
      customFieldDefinitions: [{ id: 'trust', name: 'Доверие', type: 'number' as const }],
      entities: base.entities.map((entity) => ({ ...entity, customFields: { trust: 3 } })),
    }
    const html = renderToStaticMarkup(createElement(EntityEditor, {
      customFieldDefinitions: campaign.customFieldDefinitions,
      entities: campaign.entities,
      entity: campaign.entities[0],
      entityTemplates: [],
      isSaving: false,
      isSavingTemplate: false,
      logicRules: [],
      onCancel: () => undefined,
      onCreateTemplate: async () => undefined,
      onRemoveTemplate: async () => undefined,
      onSave: async () => undefined,
    }))

    expect(html).toContain('Название поля')
    expect(html).toContain('Доверие')
    expect(html).toContain('Число')
    expect(html).toContain('Заполнено у сущностей: 1')
    expect(html).toContain('disabled=""')
  })
})
