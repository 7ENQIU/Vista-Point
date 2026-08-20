import { describe, expect, it } from 'vitest'
import { createCampaign } from './createCampaign'

describe('createCampaign', () => {
  it('создаёт пустую кампанию текущей версии схемы', () => {
    const now = new Date('2026-08-19T10:00:00.000Z')
    const campaign = createCampaign({ name: '  Тени над портом  ' }, now, 'campaign-1')

    expect(campaign).toMatchObject({
      id: 'campaign-1',
      name: 'Тени над портом',
      schemaVersion: 5,
      entities: [],
      relationships: [],
      knowledge: [],
      logicRules: [],
      sessions: [],
      eventLog: [],
      createdAt: now.toISOString(),
    })
  })

  it('отклоняет пустое название', () => {
    expect(() => createCampaign({ name: '   ' })).toThrow('Название кампании обязательно.')
  })
})
