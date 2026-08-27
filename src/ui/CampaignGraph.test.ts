import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createCampaign } from '../domain/campaign/createCampaign'
import { addEntityToCampaign } from '../domain/campaign/addEntity'
import { setHotbarSlotInCampaign } from '../domain/campaign/hotbar'
import { CampaignGraph } from './CampaignGraph'

describe('CampaignGraph hotbar', () => {
  it('показывает десять слотов и подпись настроенного предиката', () => {
    const withEntity = addEntityToCampaign(createCampaign({ name: 'Канвас' }), { type: 'location', name: 'Башня' }).campaign
    const campaign = setHotbarSlotInCampaign(withEntity, 1, {
      type: 'create_fact', label: 'Находится в', predicateId: 'builtin:located_in',
      directed: true, description: '',
    })
    const html = renderToStaticMarkup(createElement(CampaignGraph, { campaign }))

    expect(html).toContain('Быстрые инструменты')
    expect(html).toContain('Находится в')
    expect((html.match(/<kbd>/g) ?? [])).toHaveLength(10)
    expect(html).toContain('<kbd>0</kbd>')
  })
})
