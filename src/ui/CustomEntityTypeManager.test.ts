import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from '../domain/campaign/addEntity'
import { createCampaign } from '../domain/campaign/createCampaign'
import { createCustomEntityTypeInCampaign } from '../domain/campaign/customEntityTypes'
import { CustomEntityTypeManager } from './CustomEntityTypeManager'

describe('CustomEntityTypeManager', () => {
  it('показывает базовую семантику и блокирует удаление используемого типа', () => {
    const typed = createCustomEntityTypeInCampaign(createCampaign({ name: 'Типы' }), { name: 'Город', baseType: 'location' }, { typeId: 'city' }).campaign
    const campaign = addEntityToCampaign(typed, { type: 'location', customTypeId: 'city', name: 'Порт' }).campaign
    const html = renderToStaticMarkup(createElement(CustomEntityTypeManager, {
      campaign, isSaving: false,
      onCreate: async () => undefined, onRename: async () => undefined, onRemove: async () => undefined,
    }))

    expect(html).toContain('Город')
    expect(html).toContain('Основа: Локация')
    expect(html).toContain('сущностей: 1')
    expect(html).toContain('disabled=""')
  })
})
