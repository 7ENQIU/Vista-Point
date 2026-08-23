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
      schemaVersion: 11,
      calendar: { kind: 'gregorian' },
      entities: [{ name: 'Серёга', state: [] }],
      knowledge: [],
      logicRules: [],
      logicTriggerStates: [],
      logicActivations: [],
      sessions: [],
      scheduledEvents: [],
      encounters: [],
    })
    expect(legacy.entities[0]).not.toHaveProperty('state')
  })

  it('добавляет пустой Knowledge State кампании схемы v2', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { knowledge: _knowledge, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 2 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(2)
    expect(result.campaign).toMatchObject({ schemaVersion: 11, calendar: { kind: 'gregorian' }, knowledge: [], logicRules: [], logicTriggerStates: [], logicActivations: [], sessions: [], scheduledEvents: [], encounters: [] })
  })

  it('добавляет пустой Logic Layer кампании схемы v3', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { logicRules: _logicRules, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 3 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(3)
    expect(result.campaign).toMatchObject({ schemaVersion: 11, logicRules: [], logicTriggerStates: [], logicActivations: [], sessions: [], scheduledEvents: [], encounters: [] })
  })

  it('добавляет пустой Runtime Layer кампании схемы v4', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { sessions: _sessions, activeSessionId: _activeSessionId, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 4 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(4)
    expect(result.campaign).toMatchObject({ schemaVersion: 11, sessions: [], scheduledEvents: [], encounters: [] })
  })

  it('добавляет расписание мировых событий кампании схемы v5', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { scheduledEvents: _scheduledEvents, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 5 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(5)
    expect(result.campaign).toMatchObject({ schemaVersion: 11, scheduledEvents: [], encounters: [] })
  })

  it('добавляет происхождение сущностей и столкновения кампании схемы v6', () => {
    const current = addEntityToCampaign(createCampaign({ name: 'Старая кампания' }), { type: 'npc', name: 'Серёга' }).campaign
    const legacy = { ...current, schemaVersion: 6, entities: current.entities.map(({ origin: _origin, ...entity }) => entity) }
    const result = migrateCampaignSchema(legacy)

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(6)
    expect(result.campaign).toMatchObject({ schemaVersion: 11, entities: [{ origin: { mode: 'preparation', processed: true }, characterTags: [] }], encounters: [] })
  })

  it('преобразует плоские правила схемы v7 в дерево с ручным триггером', () => {
    const current = createCampaign({ name: 'Логика' })
    const legacy = { ...current, schemaVersion: 7, logicRules: [{ id: 'rule-1', campaignId: current.id, name: 'Правило', description: '', enabled: true, groupOperator: 'any', conditions: [{ id: 'condition-1', entityId: 'missing', field: 'lifecycle_status', operator: 'equals', value: 'active' }], effects: [], executionMode: 'suggest_only', createdAt: current.createdAt, updatedAt: current.updatedAt }] }
    const result = migrateCampaignSchema(legacy)
    expect(result.fromVersion).toBe(7)
    expect(result.campaign).toMatchObject({ schemaVersion: 11, logicRules: [{ conditionGroup: { kind: 'group', operator: 'any', children: [{ kind: 'condition', id: 'condition-1' }] }, trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' } }] })
  })

  it('добавляет ручные триггеры и пустую очередь кампании схемы v8', () => {
    const current = createCampaign({ name: 'Логика' })
    const legacyRule = { id: 'rule-1', campaignId: current.id, name: 'Правило', description: '', enabled: true, conditionGroup: { kind: 'group', id: 'root', operator: 'all', children: [] }, effects: [], executionMode: 'suggest_only', createdAt: current.createdAt, updatedAt: current.updatedAt }
    const result = migrateCampaignSchema({ ...current, schemaVersion: 8, logicRules: [legacyRule], logicTriggerStates: undefined, logicActivations: undefined })
    expect(result.fromVersion).toBe(8)
    expect(result.campaign).toMatchObject({ schemaVersion: 11, logicRules: [{ trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' } }], logicTriggerStates: [], logicActivations: [] })
  })

  it('добавляет григорианское представление кампании схемы v9 без сдвига времени', () => {
    const current = createCampaign({ name: 'До календарей' }, new Date('2026-08-23T10:15:00.000Z'))
    const { calendar: _calendar, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 9 })
    expect(result.fromVersion).toBe(9)
    expect(result.campaign).toMatchObject({ schemaVersion: 11, worldTime: current.worldTime, calendar: { kind: 'gregorian', name: 'Григорианский календарь' } })
  })

  it('добавляет ролевые теги сущностям схемы v10 и сохраняет календарь', () => {
    const current = createCampaign({ name: 'Схема 10' }, new Date('2026-08-23T10:15:00.000Z'), 'c10')
    const withNpc = addEntityToCampaign(current, { type: 'npc', name: 'Макс' }, { entityId: 'max' }).campaign
    const legacy = {
      ...withNpc,
      schemaVersion: 10,
      entities: withNpc.entities.map(({ characterTags: _characterTags, locationLevel: _locationLevel, ...entity }) => entity),
    }

    const result = migrateCampaignSchema(legacy)

    expect(result.fromVersion).toBe(10)
    expect(result.campaign).toMatchObject({
      schemaVersion: 11,
      calendar: current.calendar,
      entities: [{ id: 'max', characterTags: [] }],
    })
  })

  it('не изменяет актуальную схему', () => {
    const campaign = createCampaign({ name: 'Новая кампания' })
    const result = migrateCampaignSchema(campaign)

    expect(result).toEqual({ campaign, migrated: false })
  })
})
