import { describe, expect, it } from 'vitest'
import { createCampaign } from './createCampaign'

describe('createCampaign', () => {
  it('создаёт пустую кампанию текущей версии схемы', () => {
    const now = new Date('2026-08-19T10:00:00.000Z')
    const campaign = createCampaign({ name: '  Тени над портом  ' }, now, 'campaign-1')

    expect(campaign).toMatchObject({
      id: 'campaign-1',
      name: 'Тени над портом',
      schemaVersion: 22,
      customFieldDefinitions: [],
      customEntityTypes: [],
      savedGraphViews: [],
      entityTemplates: [],
      hotbar: Array.from({ length: 10 }, (_, index) => ({ slot: index + 1 })),
      calendar: { kind: 'gregorian', name: 'Григорианский календарь' },
      entities: [],
      relationships: [],
      knowledge: [],
      logicRules: [],
      logicTriggerStates: [],
      logicActivations: [],
      sessions: [],
      scheduledEvents: [],
      encounters: [],
      eventLog: [],
      createdAt: now.toISOString(),
    })
  })

  it('отклоняет пустое название', () => {
    expect(() => createCampaign({ name: '   ' })).toThrow('Название кампании обязательно.')
  })
})
