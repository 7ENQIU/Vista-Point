import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { addRelationshipToCampaign } from './addRelationship'
import { addPredicateToCampaign } from './addPredicate'
import { validateCampaign } from './campaignFile'
import { createCampaign } from './createCampaign'
import { migrateCampaignSchema } from './migrateCampaign'
import type { Campaign } from './types'

describe('migrateCampaignSchema', () => {
  it.each(Array.from({ length: 21 }, (_, index) => index + 1))('получает валидную актуальную кампанию из полной схемы v%s', (schemaVersion) => {
    const current = createCampaign({ name: `Проверка миграции ${schemaVersion}` })
    const result = migrateCampaignSchema({ ...current, schemaVersion })

    expect(result).toMatchObject({ migrated: true, fromVersion: schemaVersion })
    expect(() => validateCampaign(result.campaign)).not.toThrow()
    expect((result.campaign as Campaign).schemaVersion).toBe(22)
  })

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
      schemaVersion: 22,
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
    expect(result.campaign).toMatchObject({ schemaVersion: 22, calendar: { kind: 'gregorian' }, knowledge: [], logicRules: [], logicTriggerStates: [], logicActivations: [], sessions: [], scheduledEvents: [], encounters: [], hotbar: expect.any(Array), entityTemplates: [], customEntityTypes: [] })
  })

  it('добавляет пустой Logic Layer кампании схемы v3', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { logicRules: _logicRules, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 3 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(3)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, logicRules: [], logicTriggerStates: [], logicActivations: [], sessions: [], scheduledEvents: [], encounters: [] })
  })

  it('добавляет пустой Runtime Layer кампании схемы v4', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { sessions: _sessions, activeSessionId: _activeSessionId, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 4 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(4)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, sessions: [], scheduledEvents: [], encounters: [] })
  })

  it('добавляет расписание мировых событий кампании схемы v5', () => {
    const current = createCampaign({ name: 'Старая кампания' })
    const { scheduledEvents: _scheduledEvents, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 5 })

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(5)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, scheduledEvents: [], encounters: [] })
  })

  it('добавляет происхождение сущностей и столкновения кампании схемы v6', () => {
    const current = addEntityToCampaign(createCampaign({ name: 'Старая кампания' }), { type: 'npc', name: 'Серёга' }).campaign
    const legacy = { ...current, schemaVersion: 6, entities: current.entities.map(({ origin: _origin, ...entity }) => entity) }
    const result = migrateCampaignSchema(legacy)

    expect(result.migrated).toBe(true)
    expect(result.fromVersion).toBe(6)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, entities: [{ origin: { mode: 'preparation', processed: true }, characterTags: [], dmNotes: '' }], encounters: [] })
  })

  it('преобразует плоские правила схемы v7 в дерево с ручным триггером', () => {
    const current = createCampaign({ name: 'Логика' })
    const legacy = { ...current, schemaVersion: 7, logicRules: [{ id: 'rule-1', campaignId: current.id, name: 'Правило', description: '', enabled: true, groupOperator: 'any', conditions: [{ id: 'condition-1', entityId: 'missing', field: 'lifecycle_status', operator: 'equals', value: 'active' }], effects: [], executionMode: 'suggest_only', createdAt: current.createdAt, updatedAt: current.updatedAt }] }
    const result = migrateCampaignSchema(legacy)
    expect(result.fromVersion).toBe(7)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, logicRules: [{ conditionGroup: { kind: 'group', operator: 'any', children: [{ kind: 'condition', id: 'condition-1' }] }, trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' } }] })
  })

  it('добавляет ручные триггеры и пустую очередь кампании схемы v8', () => {
    const current = createCampaign({ name: 'Логика' })
    const legacyRule = { id: 'rule-1', campaignId: current.id, name: 'Правило', description: '', enabled: true, conditionGroup: { kind: 'group', id: 'root', operator: 'all', children: [] }, effects: [], executionMode: 'suggest_only', createdAt: current.createdAt, updatedAt: current.updatedAt }
    const result = migrateCampaignSchema({ ...current, schemaVersion: 8, logicRules: [legacyRule], logicTriggerStates: undefined, logicActivations: undefined })
    expect(result.fromVersion).toBe(8)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, logicRules: [{ trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' } }], logicTriggerStates: [], logicActivations: [] })
  })

  it('добавляет григорианское представление кампании схемы v9 без сдвига времени', () => {
    const current = createCampaign({ name: 'До календарей' }, new Date('2026-08-23T10:15:00.000Z'))
    const { calendar: _calendar, ...legacy } = current
    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 9 })
    expect(result.fromVersion).toBe(9)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, worldTime: current.worldTime, calendar: { kind: 'gregorian', name: 'Григорианский календарь' } })
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
      schemaVersion: 22,
      calendar: current.calendar,
      entities: [{ id: 'max', characterTags: [] }],
    })
  })

  it('добавляет поля карточки схеме v11 без потери ролевых тегов и очереди логики', () => {
    const current = addEntityToCampaign(createCampaign({ name: 'Схема 11' }), {
      type: 'npc', name: 'Анна', characterTags: ['союзник'],
    }).campaign
    const legacy = {
      ...current,
      schemaVersion: 11,
      entities: current.entities.map(({ dmNotes: _dmNotes, image: _image, ...entity }) => entity),
      logicTriggerStates: [{ marker: 'state-preserved' }],
      logicActivations: [{ marker: 'activation-preserved' }],
    }

    const result = migrateCampaignSchema(legacy)

    expect(result.fromVersion).toBe(11)
    expect(result.campaign).toMatchObject({
      schemaVersion: 22,
      entities: [{ characterTags: ['союзник'], dmNotes: '' }],
      logicTriggerStates: [{ marker: 'state-preserved' }],
      logicActivations: [{ marker: 'activation-preserved' }],
    })
  })

  it('добавляет предикаты схеме v12 и сохраняет идентификаторы фактов и изображения', () => {
    const first = addEntityToCampaign(createCampaign({ name: 'Схема 12' }), { type: 'npc', name: 'Анна' }, { entityId: 'anna' }).campaign
    const second = addEntityToCampaign(first, { type: 'location', name: 'Башня' }, { entityId: 'tower' }).campaign
    const current = addRelationshipToCampaign(second, {
      sourceId: 'anna', targetId: 'tower', type: 'located_in', directed: true,
    }, { relationshipId: 'fact-1' }).campaign
    current.entities[0].image = {
      dataUrl: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png', fileName: 'anna.png', updatedAt: current.updatedAt,
    }
    const legacy = {
      ...current,
      schemaVersion: 12,
      predicates: undefined,
      relationships: current.relationships.map(({ predicateId: _predicateId, ...relationship }) => relationship),
    }

    const result = migrateCampaignSchema(legacy)

    expect(result.fromVersion).toBe(12)
    expect(result.campaign).toMatchObject({
      schemaVersion: 22,
      entities: expect.arrayContaining([expect.objectContaining({ id: 'anna', image: expect.objectContaining({ fileName: 'anna.png' }) })]),
      relationships: [{ id: 'fact-1', predicateId: 'builtin:located_in' }],
    })
    expect((result.campaign as typeof current).predicates).toHaveLength(13)
  })

  it('убирает черновики сущностей схемы v13 и отключает правила прежнего статуса', () => {
    const current = addEntityToCampaign(createCampaign({ name: 'Схема 13' }), { type: 'npc', name: 'Анна' }, { entityId: 'anna' }).campaign
    current.entities[0] = { ...current.entities[0], status: 'draft' }
    current.logicRules = [{
      id: 'legacy-rule', campaignId: current.id, name: 'Активировать Анну', description: '', enabled: true,
      conditionGroup: { kind: 'group', id: 'root', operator: 'all', children: [{ kind: 'condition', id: 'condition', entityId: 'anna', field: 'lifecycle_status', operator: 'equals', value: 'draft' }] },
      effects: [{ id: 'effect', entityId: 'anna', type: 'set_lifecycle_status', value: 'active' }],
      executionMode: 'require_confirmation', trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' },
      createdAt: current.createdAt, updatedAt: current.updatedAt,
    }]

    const result = migrateCampaignSchema({ ...current, schemaVersion: 13 })

    expect(result.fromVersion).toBe(13)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, entities: [{ id: 'anna', status: 'active' }], logicRules: [{ id: 'legacy-rule', enabled: false }] })
  })

  it('убирает прежнее поле видимости из сущностей и фактов схемы v14', () => {
    const withEntity = addEntityToCampaign(createCampaign({ name: 'Схема 14' }), { type: 'npc', name: 'Анна' }, { entityId: 'anna' }).campaign
    const withTarget = addEntityToCampaign(withEntity, { type: 'location', name: 'Башня' }, { entityId: 'tower' }).campaign
    const current = addRelationshipToCampaign(withTarget, { sourceId: 'anna', targetId: 'tower', type: 'located_in' }, { relationshipId: 'fact' }).campaign
    const legacy = {
      ...current,
      schemaVersion: 14,
      entities: current.entities.map((entity) => ({ ...entity, visibility: 'public' })),
      relationships: current.relationships.map((relationship) => ({ ...relationship, visibility: 'party' })),
    }

    const result = migrateCampaignSchema(legacy)
    const migrated = result.campaign as typeof current

    expect(result.fromVersion).toBe(14)
    expect(migrated.schemaVersion).toBe(22)
    expect(migrated.entities.every((entity) => !('visibility' in entity))).toBe(true)
    expect('visibility' in migrated.relationships[0]).toBe(false)
  })

  it('поднимает схему v15 без изменения сущностей и фактов', () => {
    const withEntity = addEntityToCampaign(createCampaign({ name: 'Схема 15' }), { type: 'npc', name: 'Анна' }, { entityId: 'anna' }).campaign
    const withTarget = addEntityToCampaign(withEntity, { type: 'location', name: 'Башня' }, { entityId: 'tower' }).campaign
    const current = addRelationshipToCampaign(withTarget, { sourceId: 'anna', targetId: 'tower', type: 'located_in' }, { relationshipId: 'fact' }).campaign

    const result = migrateCampaignSchema({ ...current, schemaVersion: 15 })

    expect(result.fromVersion).toBe(15)
    expect(result.campaign).toMatchObject({
      schemaVersion: 22,
      entities: [{ id: 'anna' }, { id: 'tower' }],
      relationships: [{ id: 'fact', sourceId: 'anna', targetId: 'tower' }],
    })
  })

  it('добавляет десять пустых слотов хотбара схеме v16', () => {
    const first = addEntityToCampaign(createCampaign({ name: 'Схема 16' }), { type: 'npc', name: 'Анна' }, { entityId: 'anna' }).campaign
    const second = addEntityToCampaign(first, { type: 'note', name: 'Орден' }, { entityId: 'order' }).campaign
    const withPredicate = addPredicateToCampaign(second, {
      directLabel: 'Доверяет', inverseLabel: 'Пользуется доверием', directed: true,
    }, { predicateId: 'custom:trusts' }).campaign
    const current = addRelationshipToCampaign(withPredicate, {
      sourceId: 'anna', targetId: 'order', predicateId: 'custom:trusts',
    }, { relationshipId: 'custom-fact' }).campaign
    const { hotbar: _hotbar, ...legacy } = current

    const result = migrateCampaignSchema({ ...legacy, schemaVersion: 16 })

    expect(result.fromVersion).toBe(16)
    expect(result.campaign).toMatchObject({
      schemaVersion: 22,
      hotbar: Array.from({ length: 10 }, (_, index) => ({ slot: index + 1 })),
      predicates: expect.arrayContaining([expect.objectContaining({ id: 'custom:trusts', directLabel: 'Доверяет' })]),
      relationships: [expect.objectContaining({ id: 'custom-fact', predicateId: 'custom:trusts' })],
    })
  })

  it('превращает прежние произвольные значения в типизированные поля схемы v17', () => {
    const current = createCampaign({ name: 'Поля' })
    const legacy = {
      ...current,
      schemaVersion: 17,
      customFieldDefinitions: undefined,
      entities: [{
        ...addEntityToCampaign(current, { type: 'npc', name: 'Анна' }, { entityId: 'anna' }).entity,
        customFields: { Репутация: 3, Союзник: true, Примечание: 'Надёжна' },
      }],
    }

    const result = migrateCampaignSchema(legacy)
    const migrated = result.campaign as Campaign

    expect(result.fromVersion).toBe(17)
    expect(migrated.schemaVersion).toBe(22)
    expect(migrated.customFieldDefinitions).toEqual([
      { id: 'Репутация', name: 'Репутация', type: 'number' },
      { id: 'Союзник', name: 'Союзник', type: 'boolean' },
      { id: 'Примечание', name: 'Примечание', type: 'text' },
    ])
    expect(migrated.entities[0].customFields).toEqual({ Репутация: 3, Союзник: true, Примечание: 'Надёжна' })
  })

  it('добавляет пустую коллекцию шаблонов карточек схеме v18', () => {
    const current = createCampaign({ name: 'Шаблоны' })
    const result = migrateCampaignSchema({ ...current, schemaVersion: 18, entityTemplates: undefined })

    expect(result.fromVersion).toBe(18)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, entityTemplates: [] })
  })

  it('добавляет пустую коллекцию пользовательских типов схеме v19', () => {
    const current = createCampaign({ name: 'Типы' })
    const result = migrateCampaignSchema({ ...current, schemaVersion: 19, customEntityTypes: undefined })

    expect(result.fromVersion).toBe(19)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, customEntityTypes: [], savedGraphViews: [] })
  })

  it('добавляет пустую коллекцию сохранённых видов схеме v20', () => {
    const current = createCampaign({ name: 'Виды' })
    const result = migrateCampaignSchema({ ...current, schemaVersion: 20, savedGraphViews: undefined })

    expect(result.fromVersion).toBe(20)
    expect(result.campaign).toMatchObject({ schemaVersion: 22, savedGraphViews: [] })
  })

  it('удаляет легаси-поле видимости факта из всех сохранённых представлений схемы v21', () => {
    const first = addEntityToCampaign(createCampaign({ name: 'Схема 21' }), { type: 'npc', name: 'Анна' }, { entityId: 'anna' }).campaign
    const second = addEntityToCampaign(first, { type: 'location', name: 'Башня' }, { entityId: 'tower' }).campaign
    const current = addRelationshipToCampaign(second, {
      sourceId: 'anna', targetId: 'tower', type: 'located_in', directed: true,
    }, { relationshipId: 'fact' }).campaign
    const legacy = {
      ...current,
      schemaVersion: 21,
      relationships: current.relationships.map((relationship) => ({ ...relationship, visibility: 'party' })),
      hotbar: current.hotbar.map((slot) => slot.slot === 1 ? {
        ...slot,
        preset: { type: 'create_fact', label: 'Находится в', predicateId: 'builtin:located_in', directed: true, visibility: 'game_master', description: '' },
      } : slot),
      eventLog: current.eventLog.map((event, index) => index === 0
        ? { ...event, payload: { ...event.payload, visibility: 'public' } }
        : event),
    }

    const result = migrateCampaignSchema(legacy)
    const serialized = JSON.stringify(result.campaign)

    expect(result.fromVersion).toBe(21)
    expect((result.campaign as Campaign).schemaVersion).toBe(22)
    expect(serialized).not.toContain('"visibility"')
    expect(() => validateCampaign(result.campaign)).not.toThrow()
  })

  it('не изменяет актуальную схему', () => {
    const campaign = createCampaign({ name: 'Новая кампания' })
    const result = migrateCampaignSchema(campaign)

    expect(result).toEqual({ campaign, migrated: false })
  })
})
