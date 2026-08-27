import type { Campaign, CampaignEvent, LifecycleStatus } from './types'
import { setLogicRuleInCampaign, type SetLogicRuleInput } from './logicRules'

const SUPPORTED_EVENT_TYPES = new Set([
  'entity.created',
  'entity.quick_created',
  'entity.updated',
  'relationship.created',
  'relationship.archived',
  'predicate.created',
  'predicate.updated',
  'predicate.archived',
  'logic.rule.created',
  'logic.rule.updated',
  'logic.rule.removed',
  'logic.rule.applied',
])

export interface HistoryActionState {
  undo?: CampaignEvent
  redo?: CampaignEvent
}

export interface ApplyHistoryActionOptions {
  now?: Date
  eventId?: string
}

function stringValue(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value) throw new Error(message)
  return value
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Событие не содержит снимок изменения.')
  return value as Record<string, unknown>
}

function stringList(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(message)
  return value
}

function entitySnapshot(event: CampaignEvent, useBefore: boolean): Record<string, unknown> {
  const snapshot = recordValue(useBefore ? event.payload.before : event.payload.after)
  const changedFields = event.payload.changedFields
  if (!Array.isArray(changedFields) || changedFields.some((field) => typeof field !== 'string')) {
    throw new Error('Событие не содержит список изменённых полей.')
  }
  const result: Record<string, unknown> = {}
  for (const field of changedFields) {
    const value = snapshot[field]
    if (field === 'name') {
      if (typeof value !== 'string' || !value.trim()) throw new Error('Снимок истории содержит некорректное название.')
      result.name = value
    } else if (['summary', 'description', 'dmNotes'].includes(field)) {
      if (typeof value !== 'string') throw new Error('Снимок истории содержит некорректный текст.')
      result[field] = value
    } else if (['aliases', 'tags', 'characterTags'].includes(field)) {
      result[field] = stringList(value, 'Снимок истории содержит некорректный список.')
    } else if (field === 'status') {
      if (value !== 'draft' && value !== 'active') throw new Error('Снимок истории содержит некорректный статус.')
      result.status = value
    } else {
      throw new Error(`Поле «${field}» нельзя безопасно восстановить.`)
    }
  }
  return result
}

function predicateSnapshot(event: CampaignEvent, useBefore: boolean) {
  const snapshot = recordValue(useBefore ? event.payload.before : event.payload.after)
  const directLabel = stringValue(snapshot.directLabel, 'Снимок предиката содержит некорректное прямое название.').trim()
  const inverseLabel = stringValue(snapshot.inverseLabel, 'Снимок предиката содержит некорректное обратное название.').trim()
  if (!directLabel || !inverseLabel) throw new Error('Снимок предиката содержит пустое название.')
  if (typeof snapshot.description !== 'string') throw new Error('Снимок предиката содержит некорректное описание.')
  return { directLabel, inverseLabel, description: snapshot.description }
}

function stateValueMatchesType(value: unknown, type: string): boolean {
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'decimal') return typeof value === 'number' && Number.isFinite(value)
  return type === 'text' && typeof value === 'string'
}

function restoreAppliedRule(campaign: Campaign, event: CampaignEvent, useBefore: boolean, timestamp: string): Campaign {
  if (!Array.isArray(event.payload.changes) || event.payload.changes.length === 0) throw new Error('Событие применения правила не содержит изменений.')
  let entities = campaign.entities
  let relationships = campaign.relationships
  for (const rawChange of event.payload.changes) {
    const change = recordValue(rawChange)
    if (change.field === 'relationship_created') {
      const snapshot = recordValue(change.relationship)
      const relationshipId = stringValue(snapshot.id, 'Изменение правила не содержит созданный факт.')
      const relationship = relationships.find((item) => item.id === relationshipId)
      if (!relationship) throw new Error('Созданный правилом факт больше не найден.')
      const expectedStatus = useBefore ? 'active' : 'archived'
      if (relationship.status !== expectedStatus) throw new Error('Факт изменился после применения правила. Безопасное действие невозможно.')
      if (!useBefore) ensureActiveDependencies({ ...campaign, relationships }, relationshipId)
      relationships = relationships.map((item) => item.id === relationshipId ? { ...item, status: useBefore ? 'archived' : 'active' } : item)
      continue
    }
    const entityId = stringValue(change.entityId, 'Изменение правила не содержит сущность.')
    const entity = entities.find((item) => item.id === entityId)
    if (!entity || entity.status === 'archived') throw new Error('Сущность результата правила не найдена или находится в архиве.')
    const expected = useBefore ? change.after : change.before
    const nextValue = useBefore ? change.before : change.after
    if (change.field === 'lifecycle_status') {
      if (!['draft', 'active'].includes(String(expected)) || !['draft', 'active'].includes(String(nextValue))) throw new Error('История правила содержит некорректный жизненный статус.')
      if (entity.status !== expected) throw new Error('Статус сущности изменился после применения правила. Безопасная отмена невозможна.')
      entities = entities.map((item) => item.id === entityId ? { ...item, status: nextValue as LifecycleStatus, updatedAt: timestamp } : item)
      continue
    }
    if (change.field === 'custom_field') {
      const customFieldId = stringValue(change.customFieldId, 'Изменение правила не содержит пользовательское поле.')
      const definition = campaign.customFieldDefinitions.find((item) => item.id === customFieldId)
      if (!definition) throw new Error('Пользовательское поле результата больше не найдено.')
      const currentValue = entity.customFields[customFieldId]
      const currentExists = Object.prototype.hasOwnProperty.call(entity.customFields, customFieldId)
      const expectedExists = useBefore ? true : change.beforeExists === true
      const nextExists = useBefore ? change.beforeExists === true : true
      if (currentExists !== expectedExists || (expectedExists && currentValue !== expected)) throw new Error('Пользовательское поле изменилось после применения правила. Безопасная отмена невозможна.')
      const valid = !nextExists || (definition.type === 'boolean' ? typeof nextValue === 'boolean'
        : definition.type === 'number' ? typeof nextValue === 'number' && Number.isFinite(nextValue)
          : typeof nextValue === 'string')
      if (!valid) throw new Error('История правила содержит значение пользовательского поля неверного типа.')
      const customFields = { ...entity.customFields }
      if (nextExists) customFields[customFieldId] = nextValue as string | number | boolean
      else delete customFields[customFieldId]
      entities = entities.map((item) => item.id === entityId ? {
        ...item, updatedAt: timestamp, customFields,
      } : item)
      continue
    }
    if (change.field !== 'state') throw new Error('История правила содержит неподдерживаемое изменение.')
    const stateId = stringValue(change.stateId, 'Изменение правила не содержит параметр состояния.')
    const state = entity.state.find((item) => item.id === stateId)
    if (!state) throw new Error('Параметр состояния результата больше не найден.')
    if (state.value !== expected) throw new Error('Параметр состояния изменился после применения правила. Безопасная отмена невозможна.')
    if (!stateValueMatchesType(nextValue, state.valueType)) throw new Error('История правила содержит значение неверного типа.')
    entities = entities.map((item) => item.id === entityId ? {
      ...item, updatedAt: timestamp,
      state: item.state.map((entry) => entry.id === stateId ? { ...entry, value: nextValue as typeof entry.value, updatedAt: timestamp } : entry),
    } : item)
  }
  return { ...campaign, entities, relationships }
}

function logicRuleInput(event: CampaignEvent, useBefore: boolean, ruleId?: string): SetLogicRuleInput {
  const snapshot = recordValue(useBefore ? event.payload.before : event.payload.after)
  return {
    ruleId,
    name: snapshot.name as string,
    description: snapshot.description as string,
    enabled: snapshot.enabled as boolean,
    conditionGroup: snapshot.conditionGroup as SetLogicRuleInput['conditionGroup'],
    effects: snapshot.effects as SetLogicRuleInput['effects'],
    executionMode: snapshot.executionMode as SetLogicRuleInput['executionMode'],
    trigger: snapshot.trigger as SetLogicRuleInput['trigger'],
  }
}

function targetEventId(event: CampaignEvent): string | undefined {
  return typeof event.payload.targetEventId === 'string' ? event.payload.targetEventId : undefined
}

export function getHistoryActionState(events: CampaignEvent[]): HistoryActionState {
  const eventsById = new Map(events.map((event) => [event.id, event]))
  const undoStack: CampaignEvent[] = []
  const redoStack: CampaignEvent[] = []

  for (const event of events) {
    if (event.type === 'history.undo') {
      const targetId = targetEventId(event)
      const target = targetId ? eventsById.get(targetId) : undefined
      if (target && undoStack.at(-1)?.id === target.id) {
        undoStack.pop()
        redoStack.push(target)
      }
      continue
    }
    if (event.type === 'history.redo') {
      const targetId = targetEventId(event)
      const target = targetId ? eventsById.get(targetId) : undefined
      if (target && redoStack.at(-1)?.id === target.id) {
        redoStack.pop()
        undoStack.push(target)
      }
      continue
    }
    if (SUPPORTED_EVENT_TYPES.has(event.type) && event.reversible) {
      undoStack.push(event)
      redoStack.length = 0
    } else {
      undoStack.length = 0
      redoStack.length = 0
    }
  }

  return { undo: undoStack.at(-1), redo: redoStack.at(-1) }
}

function ensureActiveDependencies(campaign: Campaign, relationshipId: string) {
  const relationship = campaign.relationships.find((item) => item.id === relationshipId)
  if (!relationship) throw new Error('Факт из истории больше не найден.')
  const source = campaign.entities.find((item) => item.id === relationship.sourceId)
  const target = campaign.entities.find((item) => item.id === relationship.targetId)
  const predicate = campaign.predicates.find((item) => item.id === relationship.predicateId)
  if (!source || !target || source.status === 'archived' || target.status === 'archived') {
    throw new Error('Нельзя восстановить факт: одна из сущностей находится в архиве.')
  }
  if (!predicate || predicate.status === 'archived') throw new Error('Нельзя восстановить факт: предикат находится в архиве.')
  return relationship
}

function applyTarget(campaign: Campaign, target: CampaignEvent, direction: 'undo' | 'redo', timestamp: string): Campaign {
  const useBefore = direction === 'undo'

  if (target.type === 'entity.created' || target.type === 'entity.quick_created') {
    const entityId = target.relatedEntityIds[0]
    const entity = campaign.entities.find((item) => item.id === entityId)
    if (!entity) throw new Error('Созданная сущность больше не найдена.')
    if (useBefore && campaign.relationships.some((fact) => fact.status !== 'archived' && (fact.sourceId === entityId || fact.targetId === entityId))) {
      throw new Error('Сначала отмените активные факты созданной сущности.')
    }
    const restoredStatus = target.payload.newStatus === 'active' ? 'active' : 'draft'
    const status: LifecycleStatus = useBefore ? 'archived' : restoredStatus
    return { ...campaign, entities: campaign.entities.map((item) => item.id === entityId ? { ...item, status, updatedAt: timestamp } : item) }
  }

  if (target.type === 'entity.updated') {
    const entityId = target.relatedEntityIds[0]
    const entity = campaign.entities.find((item) => item.id === entityId)
    if (!entity) throw new Error('Изменённая сущность больше не найдена.')
    const snapshot = entitySnapshot(target, useBefore)
    return { ...campaign, entities: campaign.entities.map((item) => item.id === entityId ? { ...item, ...snapshot, updatedAt: timestamp } : item) }
  }

  if (target.type === 'relationship.created' || target.type === 'relationship.archived') {
    const relationshipId = stringValue(target.payload.relationshipId, 'Факт из истории не содержит идентификатор.')
    const relationship = campaign.relationships.find((item) => item.id === relationshipId)
    if (!relationship) throw new Error('Факт из истории больше не найден.')
    const shouldArchive = target.type === 'relationship.created' ? useBefore : !useBefore
    if (!shouldArchive) ensureActiveDependencies(campaign, relationshipId)
    return { ...campaign, relationships: campaign.relationships.map((item) => item.id === relationshipId ? { ...item, status: shouldArchive ? 'archived' : 'active' } : item) }
  }

  if (target.type === 'predicate.created' || target.type === 'predicate.archived') {
    const predicateId = stringValue(target.payload.predicateId, 'Предикат из истории не содержит идентификатор.')
    const predicate = campaign.predicates.find((item) => item.id === predicateId)
    if (!predicate || predicate.systemType) throw new Error('Пользовательский предикат больше не найден.')
    const shouldArchive = target.type === 'predicate.created' ? useBefore : !useBefore
    if (shouldArchive && campaign.relationships.some((fact) => fact.status !== 'archived' && fact.predicateId === predicateId)) {
      throw new Error('Сначала отмените активные факты с этим предикатом.')
    }
    return { ...campaign, predicates: campaign.predicates.map((item) => item.id === predicateId ? { ...item, status: shouldArchive ? 'archived' : 'active', updatedAt: timestamp } : item) }
  }

  if (target.type === 'predicate.updated') {
    const predicateId = stringValue(target.payload.predicateId, 'Предикат из истории не содержит идентификатор.')
    const predicate = campaign.predicates.find((item) => item.id === predicateId)
    if (!predicate || predicate.systemType) throw new Error('Пользовательский предикат больше не найден.')
    const snapshot = predicateSnapshot(target, useBefore)
    return { ...campaign, predicates: campaign.predicates.map((item) => item.id === predicateId ? { ...item, ...snapshot, updatedAt: timestamp } : item) }
  }

  if (target.type === 'logic.rule.created' || target.type === 'logic.rule.removed') {
    const ruleId = stringValue(target.payload.ruleId, 'Правило из истории не содержит идентификатор.')
    const shouldRemove = target.type === 'logic.rule.created' ? useBefore : !useBefore
    if (shouldRemove) {
      if (!campaign.logicRules.some((rule) => rule.id === ruleId)) throw new Error('Логическое правило больше не найдено.')
      return {
        ...campaign,
        logicRules: campaign.logicRules.filter((rule) => rule.id !== ruleId),
        logicTriggerStates: campaign.logicTriggerStates.filter((state) => state.ruleId !== ruleId),
        logicActivations: campaign.logicActivations.filter((activation) => activation.ruleId !== ruleId),
      }
    }
    if (campaign.logicRules.some((rule) => rule.id === ruleId)) throw new Error('Логическое правило уже существует.')
    const input = logicRuleInput(target, target.type === 'logic.rule.removed', undefined)
    const restored = setLogicRuleInCampaign(campaign, input, { ruleId, now: new Date(timestamp) })
    return { ...restored.campaign, eventLog: campaign.eventLog }
  }

  if (target.type === 'logic.rule.updated') {
    const ruleId = stringValue(target.payload.ruleId, 'Правило из истории не содержит идентификатор.')
    if (!campaign.logicRules.some((rule) => rule.id === ruleId)) throw new Error('Логическое правило больше не найдено.')
    const restored = setLogicRuleInCampaign(campaign, logicRuleInput(target, useBefore, ruleId), { now: new Date(timestamp) })
    return { ...restored.campaign, eventLog: campaign.eventLog }
  }

  if (target.type === 'logic.rule.applied') return restoreAppliedRule(campaign, target, useBefore, timestamp)

  throw new Error('Это действие пока нельзя отменить безопасно.')
}

export function applyHistoryAction(
  campaign: Campaign,
  direction: 'undo' | 'redo',
  options: ApplyHistoryActionOptions = {},
): { campaign: Campaign; event: CampaignEvent; target: CampaignEvent } {
  const state = getHistoryActionState(campaign.eventLog)
  const target = state[direction]
  if (!target) throw new Error(direction === 'undo' ? 'Нет действия, которое можно безопасно отменить.' : 'Нет действия для повтора.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const changed = applyTarget(campaign, target, direction, timestamp)
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: direction === 'undo' ? 'history.undo' : 'history.redo',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: target.relatedEntityIds,
    reversible: false,
    payload: { targetEventId: target.id, targetEventType: target.type },
  }
  return { target, event, campaign: { ...changed, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
