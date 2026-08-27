import { describe, expect, it } from 'vitest'
import { createCampaign } from './createCampaign'
import { setHotbarSlotInCampaign } from './hotbar'

describe('campaign hotbar', () => {
  it('создаёт десять стабильных пустых слотов', () => {
    expect(createCampaign({ name: 'Хотбар' }).hotbar).toEqual(
      Array.from({ length: 10 }, (_, index) => ({ slot: index + 1 })),
    )
  })

  it('настраивает и очищает слот без изменения остальных', () => {
    const campaign = createCampaign({ name: 'Хотбар' })
    const configured = setHotbarSlotInCampaign(campaign, 1, {
      type: 'create_fact', label: '  Находится в  ', predicateId: 'builtin:located_in',
      directed: true, description: '  Быстрый факт.  ',
    }, new Date('2026-08-26T12:00:00.000Z'))

    expect(configured.hotbar[0].preset).toMatchObject({ label: 'Находится в', description: 'Быстрый факт.' })
    expect(configured.hotbar.slice(1)).toEqual(campaign.hotbar.slice(1))
    expect(setHotbarSlotInCampaign(configured, 1, undefined).hotbar[0]).toEqual({ slot: 1, preset: undefined })
  })

  it('отклоняет отсутствующий предикат', () => {
    const campaign = createCampaign({ name: 'Хотбар' })
    expect(() => setHotbarSlotInCampaign(campaign, 1, {
      type: 'create_fact', label: 'Факт', predicateId: 'missing', directed: true,
      description: '',
    })).toThrow('не найден или удалён')
  })
})
