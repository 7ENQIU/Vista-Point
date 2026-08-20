import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { migrateCampaignSchema } from './migrateCampaign'

describe('migrateCampaignSchema', () => {
  it('последовательно мигрирует схему v1 до текущей версии', () => {
    const current = addEntityToCampaign(
      createCampaign({ name: 'Старая кампания' }),
      { type: 'npc', name: 'Серёга' },
    ).campaign
    const legacy = {
      ...current,
      schemaVersion: 1,
      entities: current.entities.map(({ state: _state, ...entity }) => entity),
    }

    const result = migrateCampaignSchema(legacy)

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(1)
    expect(result.campaign).toMatchObject({
      schemaVersion: 5,
      entities: [{ name: 'Серёга', state: [] }],
      knowledge: [],
      logicRules: [],
      sessions: [],
    })
    expect(legacy.entities[0]).not.toHaveProperty('state')
  })

  it('добавляет пустой Knowledge State кампании схемы v2', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { knowledge: _knowledge, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 2 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(2)
    expect(result.campaign).toMatchObject({ schemaVersion: 5, knowledge: [], logicRules: [], sessions: [] })
  })

  it('добавляет пустой Logic Layer кампании схемы v3', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { logicRules: _logicRules, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 3 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(3)
    expect(result.campaign).toMatchObject({ schemaVersion: 5, logicRules: [], sessions: [] })
  })

  it('добавляет пустой Runtime Layer кампании схемы v4', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { sessions: _sessions, activeSessionId: _activeSessionId, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 4 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(4)
    expect(result.campaign).toMatchObject({ schemaVersion: 5, sessions: [] })
  })

  it('не изменяет актуальную схему', () => {
    const campaign = createCampaign({ name: 'Новая кампания' })
    const result = migrateCampaignSchema(campaign)

    expect(result).toEqual({ campaign, migrated: false })
  })
})
