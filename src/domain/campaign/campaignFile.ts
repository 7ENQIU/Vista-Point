import {
  CAMPAIGN_SCHEMA_VERSION,
  CUSTOM_FIELD_TYPES,
  ENTITY_TYPES,
  FACT_TYPES,
  ENTITY_IMAGE_MAX_DATA_URL_LENGTH,
  ENTITY_IMAGE_MIME_TYPES,
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_SUBJECT_TYPES,
  KNOWLEDGE_TRUTH_VALUES,
  LOGIC_CONDITION_FIELDS,
  LOGIC_CONDITION_OPERATORS,
  LOGIC_EFFECT_TYPES,
  LOGIC_EXECUTION_MODES,
  LOGIC_GROUP_OPERATORS,
  LOGIC_ACTIVATION_STATUSES,
  LOGIC_TRIGGER_REPEATS,
  LOGIC_TRIGGER_TYPES,
  RELATIONSHIP_TYPES,
  STATE_CATEGORIES,
  STATE_VALUE_TYPES,
  type Campaign,
  type CampaignCalendar,
  type CampaignEntity,
  type CampaignEncounter,
  type CampaignEvent,
  type CustomFieldDefinition,
  type CustomEntityType,
  type SavedGraphView,
  type EntityTemplate,
  type CampaignSession,
  type KnowledgeRecord,
  type LogicCondition,
  type LogicConditionGroup,
  type LogicConditionNode,
  type LogicEffect,
  type LogicActivation,
  type LogicRule,
  type LogicTriggerState,
  type HotbarSlot,
  type Predicate,
  type Relationship,
  type ScheduledWorldEvent,
} from './types'
import { migrateCampaignSchema } from './migrateCampaign'

export const CAMPAIGN_FILE_FORMAT = 'vista-point-campaign' as const
export const CAMPAIGN_FILE_FORMAT_VERSION = 1 as const

export interface CampaignFile {
  format: typeof CAMPAIGN_FILE_FORMAT
  formatVersion: typeof CAMPAIGN_FILE_FORMAT_VERSION
  exportedAt: string
  campaign: Campaign
}

export class CampaignFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CampaignFileError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function isIsoDate(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Date.parse(value))
}

function isCampaignCalendar(value: unknown): value is CampaignCalendar {
  if (!isRecord(value) || !isString(value.kind) || !isString(value.name) || !value.name.trim()) return false
  if (value.kind === 'gregorian') return true
  if (value.kind !== 'custom' || !isString(value.eraLabel) || !Array.isArray(value.months) || !Array.isArray(value.weekdays) ||
    !isIsoDate(value.epochWorldTime) || !Number.isInteger(value.epochYear) || !isString(value.epochMonthId) ||
    !Number.isInteger(value.epochDay) || !Number.isInteger(value.epochHour) || !Number.isInteger(value.epochMinute) || !Number.isInteger(value.epochWeekdayIndex)) return false
  if (value.months.length < 1 || value.months.length > 48 || value.weekdays.length > 32 || !value.weekdays.every((day) => isString(day) && Boolean(day.trim()))) return false
  const months = value.months as unknown[]
  const validMonths = months.every((month) => isRecord(month) && isString(month.id) && Boolean(month.id) && isString(month.name) && Boolean(month.name.trim()) && Number.isInteger(month.days) && Number(month.days) >= 1 && Number(month.days) <= 999)
  if (!validMonths) return false
  const typedMonths = months as Array<{ id: string; days: number }>
  const monthIds = new Set(typedMonths.map((month) => month.id))
  const epochMonth = typedMonths.find((month) => month.id === value.epochMonthId)
  return monthIds.size === typedMonths.length && Boolean(epochMonth) && Number(value.epochDay) >= 1 && Number(value.epochDay) <= epochMonth!.days &&
    Number(value.epochHour) >= 0 && Number(value.epochHour) <= 23 && Number(value.epochMinute) >= 0 && Number(value.epochMinute) <= 59 &&
    Number(value.epochWeekdayIndex) >= 0 && (value.weekdays.length === 0 ? value.epochWeekdayIndex === 0 : Number(value.epochWeekdayIndex) < value.weekdays.length)
}

function isStateValue(value: unknown, valueType: unknown): boolean {
  if (valueType === 'boolean') return typeof value === 'boolean'
  if (valueType === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (valueType === 'decimal') return typeof value === 'number' && Number.isFinite(value)
  if (valueType === 'text') return isString(value)
  return false
}

function isEntityState(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.category) &&
    STATE_CATEGORIES.includes(value.category as (typeof STATE_CATEGORIES)[number]) &&
    isString(value.valueType) &&
    STATE_VALUE_TYPES.includes(value.valueType as (typeof STATE_VALUE_TYPES)[number]) &&
    isStateValue(value.value, value.valueType) &&
    isIsoDate(value.updatedAt)
  )
}

function isEntity(value: unknown, campaignId: string): value is CampaignEntity {
  if (!isRecord(value)) return false
  const imageIsValid = value.image === undefined || (
    isRecord(value.image) &&
    isString(value.image.mimeType) &&
    ENTITY_IMAGE_MIME_TYPES.includes(value.image.mimeType as (typeof ENTITY_IMAGE_MIME_TYPES)[number]) &&
    isString(value.image.fileName) && Boolean(value.image.fileName.trim()) &&
    isIsoDate(value.image.updatedAt) &&
    isString(value.image.dataUrl) &&
    value.image.dataUrl.length <= ENTITY_IMAGE_MAX_DATA_URL_LENGTH &&
    value.image.dataUrl.startsWith(`data:${value.image.mimeType};base64,`)
  )
  return (
    isString(value.id) &&
    value.campaignId === campaignId &&
    isString(value.type) &&
    ENTITY_TYPES.includes(value.type as CampaignEntity['type']) &&
    (value.customTypeId === undefined || isString(value.customTypeId)) &&
    isString(value.name) &&
    isStringArray(value.aliases) &&
    isString(value.summary) &&
    isString(value.description) &&
    isString(value.dmNotes) &&
    imageIsValid &&
    (value.status === 'active' || value.status === 'archived') &&
    isStringArray(value.tags) &&
    isStringArray(value.characterTags) &&
    (value.locationLevel === undefined || (value.type === 'location' && Number.isInteger(value.locationLevel) && Number(value.locationLevel) >= 1)) &&
    isRecord(value.customFields) &&
    Array.isArray(value.state) &&
    value.state.every(isEntityState) &&
    isRecord(value.origin) &&
    (value.origin.mode === 'preparation' || value.origin.mode === 'session_quick_create') &&
    typeof value.origin.processed === 'boolean' &&
    (value.origin.sessionId === undefined || isString(value.origin.sessionId)) &&
    (value.origin.sceneId === undefined || isString(value.origin.sceneId)) &&
    isString(value.origin.worldTime) &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  )
}

function isCustomFieldDefinition(value: unknown): value is CustomFieldDefinition {
  return isRecord(value) && isString(value.id) && Boolean(value.id) &&
    isString(value.name) && Boolean(value.name.trim()) && isString(value.type) &&
    CUSTOM_FIELD_TYPES.includes(value.type as CustomFieldDefinition['type'])
}

function isCustomEntityType(value: unknown, campaignId: string): value is CustomEntityType {
  return isRecord(value) && isString(value.id) && Boolean(value.id) && value.campaignId === campaignId &&
    isString(value.name) && Boolean(value.name.trim()) && isString(value.baseType) &&
    ENTITY_TYPES.includes(value.baseType as CustomEntityType['baseType']) &&
    isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
}

function isSavedGraphView(value: unknown, campaignId: string): value is SavedGraphView {
  return isRecord(value) && isString(value.id) && Boolean(value.id) && value.campaignId === campaignId &&
    isString(value.name) && Boolean(value.name.trim()) && isString(value.query) &&
    Array.isArray(value.entityTypes) && value.entityTypes.every((type) => isString(type) && ENTITY_TYPES.includes(type as SavedGraphView['entityTypes'][number])) &&
    isStringArray(value.customEntityTypeIds) && isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
}

function isEntityTemplate(value: unknown, campaignId: string): value is EntityTemplate {
  return isRecord(value) && isString(value.id) && Boolean(value.id) && value.campaignId === campaignId &&
    isString(value.name) && Boolean(value.name.trim()) && isString(value.entityType) &&
    ENTITY_TYPES.includes(value.entityType as EntityTemplate['entityType']) &&
    (value.customTypeId === undefined || isString(value.customTypeId)) && isString(value.summary) &&
    isString(value.description) && isString(value.dmNotes) && isStringArray(value.tags) &&
    isStringArray(value.characterTags) && isRecord(value.customFields) &&
    isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
}

function isCampaignEncounter(value: unknown, campaignId: string): value is CampaignEncounter {
  if (!isRecord(value)) return false
  return isString(value.id) && value.campaignId === campaignId && isString(value.encounterEntityId) &&
    isString(value.sessionId) && isString(value.sceneId) && (value.status === 'active' || value.status === 'completed') &&
    Number.isInteger(value.round) && Number(value.round) > 0 && Number.isInteger(value.currentTurnIndex) &&
    Array.isArray(value.participants) && value.participants.every((participant) => isRecord(participant) &&
      isString(participant.id) && isString(participant.entityId) &&
      (participant.side === 'allies' || participant.side === 'opponents' || participant.side === 'neutral') &&
      Number.isInteger(participant.initiative) && isStringArray(participant.conditions)) &&
    isIsoDate(value.startedAt) && (value.endedAt === undefined || isIsoDate(value.endedAt)) && isString(value.outcome)
}

function isRelationship(value: unknown, campaignId: string): value is Relationship {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    value.campaignId === campaignId &&
    isString(value.sourceId) &&
    isString(value.targetId) &&
    isString(value.predicateId) &&
    isString(value.type) &&
    FACT_TYPES.includes(value.type as Relationship['type']) &&
    typeof value.directed === 'boolean' &&
    isString(value.description) &&
    isString(value.status)
  )
}

function isHotbarSlot(value: unknown): value is HotbarSlot {
  if (!isRecord(value) || !Number.isInteger(value.slot)) return false
  if (value.preset === undefined) return true
  return isRecord(value.preset) && value.preset.type === 'create_fact' &&
    isString(value.preset.label) && Boolean(value.preset.label.trim()) &&
    isString(value.preset.predicateId) && typeof value.preset.directed === 'boolean' &&
    isString(value.preset.description)
}

function isPredicate(value: unknown, campaignId: string): value is Predicate {
  if (!isRecord(value)) return false
  return isString(value.id) && Boolean(value.id) && value.campaignId === campaignId &&
    isString(value.directLabel) && Boolean(value.directLabel.trim()) &&
    isString(value.inverseLabel) && Boolean(value.inverseLabel.trim()) &&
    isString(value.description) && typeof value.directed === 'boolean' &&
    (value.systemType === undefined || (isString(value.systemType) && RELATIONSHIP_TYPES.includes(value.systemType as Predicate['systemType'] & string))) &&
    (value.status === 'draft' || value.status === 'active' || value.status === 'archived') &&
    isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
}

function isCampaignEvent(value: unknown, campaignId: string): value is CampaignEvent {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    value.campaignId === campaignId &&
    isString(value.type) &&
    isIsoDate(value.occurredAt) &&
    isString(value.worldTime) &&
    isString(value.source) &&
    (value.sessionId === undefined || isString(value.sessionId)) &&
    isStringArray(value.relatedEntityIds) &&
    typeof value.reversible === 'boolean' &&
    isRecord(value.payload)
  )
}

function isCampaignSession(value: unknown, campaignId: string): value is CampaignSession {
  if (!isRecord(value)) return false
  return isString(value.id) && value.campaignId === campaignId &&
    typeof value.number === 'number' && Number.isInteger(value.number) && value.number > 0 &&
    isString(value.name) && (value.status === 'active' || value.status === 'completed') &&
    isString(value.currentSceneId) && isStringArray(value.participantIds) && isStringArray(value.visitedSceneIds) &&
    isIsoDate(value.startedAt) && (value.endedAt === undefined || isIsoDate(value.endedAt)) &&
    isString(value.worldTimeStart) && (value.worldTimeEnd === undefined || isString(value.worldTimeEnd)) &&
    isString(value.summary)
}

function isScheduledWorldEvent(value: unknown, campaignId: string): value is ScheduledWorldEvent {
  if (!isRecord(value)) return false
  return isString(value.id) && value.campaignId === campaignId && isString(value.title) && isString(value.description) &&
    isIsoDate(value.occursAt) && typeof value.critical === 'boolean' &&
    (value.status === 'scheduled' || value.status === 'completed' || value.status === 'cancelled') &&
    isStringArray(value.relatedEntityIds) && isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
}

function isKnowledgeRecord(value: unknown, campaignId: string): value is KnowledgeRecord {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    value.campaignId === campaignId &&
    isString(value.subjectType) &&
    KNOWLEDGE_SUBJECT_TYPES.includes(value.subjectType as KnowledgeRecord['subjectType']) &&
    (value.subjectType === 'entity' ? isString(value.subjectEntityId) : value.subjectEntityId === undefined) &&
    isString(value.content) &&
    isString(value.status) &&
    KNOWLEDGE_STATUSES.includes(value.status as KnowledgeRecord['status']) &&
    typeof value.confidence === 'number' &&
    Number.isInteger(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 100 &&
    isString(value.truth) &&
    KNOWLEDGE_TRUTH_VALUES.includes(value.truth as KnowledgeRecord['truth']) &&
    isString(value.source) &&
    isStringArray(value.relatedEntityIds) &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  )
}

function isLogicCondition(value: unknown): value is LogicCondition {
  if (!isRecord(value)) return false
  return value.kind === 'condition' && isString(value.id) && (value.entityId === undefined || isString(value.entityId)) &&
    isString(value.field) && LOGIC_CONDITION_FIELDS.includes(value.field as LogicCondition['field']) &&
    (value.stateId === undefined || isString(value.stateId)) &&
    (value.customFieldId === undefined || isString(value.customFieldId)) &&
    (value.targetEntityId === undefined || isString(value.targetEntityId)) &&
    (value.relationshipType === undefined || RELATIONSHIP_TYPES.includes(value.relationshipType as (typeof RELATIONSHIP_TYPES)[number])) &&
    (value.predicateId === undefined || isString(value.predicateId)) &&
    (value.subjectType === undefined || KNOWLEDGE_SUBJECT_TYPES.includes(value.subjectType as (typeof KNOWLEDGE_SUBJECT_TYPES)[number])) &&
    (value.subjectEntityId === undefined || isString(value.subjectEntityId)) &&
    isString(value.operator) && LOGIC_CONDITION_OPERATORS.includes(value.operator as LogicCondition['operator']) &&
    (value.value === undefined || typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean')
}

function isLogicConditionGroup(value: unknown): value is LogicConditionGroup {
  if (!isRecord(value)) return false
  return value.kind === 'group' && isString(value.id) && isString(value.operator) &&
    LOGIC_GROUP_OPERATORS.includes(value.operator as LogicConditionGroup['operator']) &&
    (value.minimum === undefined || Number.isInteger(value.minimum)) && Array.isArray(value.children) &&
    value.children.every((child) => isRecord(child) && (child.kind === 'group' ? isLogicConditionGroup(child) : isLogicCondition(child)))
}

function isLogicEffect(value: unknown): value is LogicEffect {
  if (!isRecord(value)) return false
  if (!isString(value.id) || !isString(value.entityId) || !isString(value.type) || !LOGIC_EFFECT_TYPES.includes(value.type as LogicEffect['type'])) return false
  if (value.type === 'create_fact') return isString(value.targetEntityId) && isString(value.predicateId) && typeof value.directed === 'boolean' &&
    isString(value.description)
  if (value.type === 'set_custom_field') return isString(value.customFieldId) &&
    (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean')
  return (value.type !== 'set_state' || isString(value.stateId)) &&
    (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean')
}

function isLogicRule(value: unknown, campaignId: string): value is LogicRule {
  if (!isRecord(value)) return false
  return isString(value.id) && value.campaignId === campaignId && isString(value.name) && isString(value.description) &&
    typeof value.enabled === 'boolean' &&
    isLogicConditionGroup(value.conditionGroup) &&
    Array.isArray(value.effects) && value.effects.every(isLogicEffect) &&
    isString(value.executionMode) && LOGIC_EXECUTION_MODES.includes(value.executionMode as LogicRule['executionMode']) &&
    isRecord(value.trigger) && isString(value.trigger.type) && LOGIC_TRIGGER_TYPES.includes(value.trigger.type as LogicRule['trigger']['type']) &&
    Number.isInteger(value.trigger.delayMinutes) && Number(value.trigger.delayMinutes) >= 0 &&
    isString(value.trigger.repeat) && LOGIC_TRIGGER_REPEATS.includes(value.trigger.repeat as LogicRule['trigger']['repeat']) &&
    isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
}

function isLogicTriggerState(value: unknown): value is LogicTriggerState {
  if (!isRecord(value)) return false
  return isString(value.ruleId) && typeof value.lastSatisfied === 'boolean' && typeof value.hasTriggered === 'boolean' &&
    (value.lastEventId === undefined || isString(value.lastEventId)) && isIsoDate(value.evaluatedAt)
}

function isLogicActivation(value: unknown, campaignId: string): value is LogicActivation {
  if (!isRecord(value)) return false
  return isString(value.id) && value.campaignId === campaignId && isString(value.ruleId) &&
    isString(value.status) && LOGIC_ACTIVATION_STATUSES.includes(value.status as LogicActivation['status']) &&
    isString(value.sourceEventId) && isIsoDate(value.triggeredAt) && isIsoDate(value.dueAt) &&
    isString(value.evaluationExplanation) && isStringArray(value.conditionExplanations) && isStringArray(value.effectExplanations) &&
    (value.resolvedAt === undefined || isIsoDate(value.resolvedAt))
}

export function validateCampaign(value: unknown): Campaign {
  if (!isRecord(value)) {
    throw new CampaignFileError('В файле отсутствует объект кампании.')
  }
  if (value.schemaVersion !== CAMPAIGN_SCHEMA_VERSION) {
    throw new CampaignFileError(`Версия схемы не поддерживается: ${String(value.schemaVersion)}.`)
  }
  if (!isString(value.id) || !value.id || !isString(value.name) || !value.name.trim()) {
    throw new CampaignFileError('У кампании отсутствует идентификатор или название.')
  }
  if (
    !isString(value.description) ||
    !isString(value.gameSystem) ||
    !isString(value.worldTime) ||
    !isCampaignCalendar(value.calendar) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    !Array.isArray(value.entities) ||
    !Array.isArray(value.predicates) ||
    !Array.isArray(value.relationships) ||
    !Array.isArray(value.hotbar) ||
    !Array.isArray(value.customFieldDefinitions) ||
    !Array.isArray(value.customEntityTypes) ||
    !Array.isArray(value.savedGraphViews) ||
    !Array.isArray(value.entityTemplates) ||
    !Array.isArray(value.knowledge) ||
    !Array.isArray(value.logicRules) ||
    !Array.isArray(value.logicTriggerStates) ||
    !Array.isArray(value.logicActivations) ||
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.scheduledEvents) ||
    !Array.isArray(value.encounters) ||
    (value.activeEncounterId !== undefined && !isString(value.activeEncounterId)) ||
    (value.activeSessionId !== undefined && !isString(value.activeSessionId)) ||
    !Array.isArray(value.eventLog)
  ) {
    throw new CampaignFileError('Структура кампании повреждена или неполна.')
  }

  const campaignId = value.id
  if (!value.entities.every((entity) => isEntity(entity, campaignId))) {
    throw new CampaignFileError('Одна или несколько сущностей имеют неверную структуру.')
  }
  if (!value.predicates.every((predicate) => isPredicate(predicate, campaignId))) {
    throw new CampaignFileError('Один или несколько предикатов имеют неверную структуру.')
  }
  if (!value.relationships.every((relationship) => isRelationship(relationship, campaignId))) {
    throw new CampaignFileError('Одна или несколько связей имеют неверную структуру.')
  }
  if (!value.hotbar.every(isHotbarSlot)) {
    throw new CampaignFileError('Один или несколько слотов хотбара имеют неверную структуру.')
  }
  if (!value.customFieldDefinitions.every(isCustomFieldDefinition)) {
    throw new CampaignFileError('Одно или несколько пользовательских полей имеют неверную структуру.')
  }
  if (!value.customEntityTypes.every((customType) => isCustomEntityType(customType, campaignId))) {
    throw new CampaignFileError('Один или несколько пользовательских типов сущностей имеют неверную структуру.')
  }
  if (!value.savedGraphViews.every((view) => isSavedGraphView(view, campaignId))) {
    throw new CampaignFileError('Один или несколько сохранённых видов графа имеют неверную структуру.')
  }
  if (!value.entityTemplates.every((template) => isEntityTemplate(template, campaignId))) {
    throw new CampaignFileError('Один или несколько шаблонов карточек имеют неверную структуру.')
  }
  if (!value.eventLog.every((event) => isCampaignEvent(event, campaignId))) {
    throw new CampaignFileError('Одна или несколько записей журнала имеют неверную структуру.')
  }
  if (!value.knowledge.every((knowledge) => isKnowledgeRecord(knowledge, campaignId))) {
    throw new CampaignFileError('Одна или несколько записей знания имеют неверную структуру.')
  }
  if (!value.logicRules.every((rule) => isLogicRule(rule, campaignId))) {
    throw new CampaignFileError('Одно или несколько логических правил имеют неверную структуру.')
  }
  if (!value.logicTriggerStates.every(isLogicTriggerState) || !value.logicActivations.every((activation) => isLogicActivation(activation, campaignId))) {
    throw new CampaignFileError('Очередь логических срабатываний имеет неверную структуру.')
  }
  if (!value.sessions.every((session) => isCampaignSession(session, campaignId))) {
    throw new CampaignFileError('Одна или несколько сессий имеют неверную структуру.')
  }
  if (!value.scheduledEvents.every((event) => isScheduledWorldEvent(event, campaignId))) {
    throw new CampaignFileError('Одно или несколько запланированных событий имеют неверную структуру.')
  }
  if (!value.encounters.every((encounter) => isCampaignEncounter(encounter, campaignId))) {
    throw new CampaignFileError('Одно или несколько столкновений имеют неверную структуру.')
  }

  const entityIds = new Set(value.entities.map((entity) => entity.id))
  const customEntityTypes = value.customEntityTypes as CustomEntityType[]
  if (entityIds.size !== value.entities.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы сущностей.')
  }
  const predicateIds = new Set(value.predicates.map((predicate) => predicate.id))
  if (predicateIds.size !== value.predicates.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы предикатов.')
  }
  const hotbarSlots = value.hotbar.map((item) => item.slot)
  if (hotbarSlots.length !== 10 || new Set(hotbarSlots).size !== 10 || hotbarSlots.some((slot, index) => slot !== index + 1)) {
    throw new CampaignFileError('Хотбар должен содержать десять упорядоченных слотов.')
  }
  if (value.hotbar.some((slot) => slot.preset && !predicateIds.has(slot.preset.predicateId))) {
    throw new CampaignFileError('Хотбар ссылается на отсутствующий предикат.')
  }
  const customFieldIds = new Set(value.customFieldDefinitions.map((field) => field.id))
  const customFieldNames = new Set(value.customFieldDefinitions.map((field) => field.name.trim().toLocaleLowerCase('ru-RU')))
  if (customFieldIds.size !== value.customFieldDefinitions.length || customFieldNames.size !== value.customFieldDefinitions.length) {
    throw new CampaignFileError('Пользовательские поля содержат повторяющиеся идентификаторы или названия.')
  }
  const customFieldDefinitions = new Map(value.customFieldDefinitions.map((field) => [field.id, field]))
  const customEntityTypeIds = new Set(customEntityTypes.map((item) => item.id))
  const customEntityTypeNames = new Set(customEntityTypes.map((item) => item.name.trim().toLocaleLowerCase('ru-RU')))
  if (customEntityTypeIds.size !== customEntityTypes.length || customEntityTypeNames.size !== customEntityTypes.length) {
    throw new CampaignFileError('Пользовательские типы сущностей содержат повторяющиеся идентификаторы или названия.')
  }
  if (value.entities.some((entity) => entity.customTypeId && !customEntityTypes.some((item) => item.id === entity.customTypeId && item.baseType === entity.type))) {
    throw new CampaignFileError('Сущность ссылается на отсутствующий или несовместимый пользовательский тип.')
  }
  const savedGraphViewIds = new Set(value.savedGraphViews.map((view) => view.id))
  const savedGraphViewNames = new Set(value.savedGraphViews.map((view) => view.name.trim().toLocaleLowerCase('ru-RU')))
  if (savedGraphViewIds.size !== value.savedGraphViews.length || savedGraphViewNames.size !== value.savedGraphViews.length) {
    throw new CampaignFileError('Сохранённые виды графа содержат повторяющиеся идентификаторы или названия.')
  }
  if (value.savedGraphViews.some((view) => new Set(view.entityTypes).size !== view.entityTypes.length ||
    new Set(view.customEntityTypeIds).size !== view.customEntityTypeIds.length ||
    view.customEntityTypeIds.some((typeId) => !customEntityTypeIds.has(typeId)))) {
    throw new CampaignFileError('Сохранённый вид графа содержит повторяющиеся или отсутствующие типы сущностей.')
  }
  const customFieldsAreInvalid = (customFields: Record<string, unknown>) => Object.entries(customFields).some(([fieldId, fieldValue]) => {
    const definition = customFieldDefinitions.get(fieldId)
    if (!definition) return true
    if (definition.type === 'boolean') return typeof fieldValue !== 'boolean'
    if (definition.type === 'number') return typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)
    if (typeof fieldValue !== 'string') return true
    return definition.type === 'entity_reference' && Boolean(fieldValue) && !entityIds.has(fieldValue)
  })
  const hasInvalidCustomFields = value.entities.some((entity) => customFieldsAreInvalid(entity.customFields))
  if (hasInvalidCustomFields) {
    throw new CampaignFileError('Значения пользовательских полей повреждены или ссылаются на отсутствующие данные.')
  }
  const templateIds = new Set(value.entityTemplates.map((template) => template.id))
  const templateNames = new Set(value.entityTemplates.map((template) => template.name.trim().toLocaleLowerCase('ru-RU')))
  if (templateIds.size !== value.entityTemplates.length || templateNames.size !== value.entityTemplates.length ||
    value.entityTemplates.some((template) => (template.entityType !== 'npc' && template.characterTags.length > 0) ||
      (template.customTypeId && !customEntityTypes.some((item) => item.id === template.customTypeId && item.baseType === template.entityType)) ||
      customFieldsAreInvalid(template.customFields))) {
    throw new CampaignFileError('Шаблоны карточек содержат повторяющиеся названия или повреждённые значения.')
  }
  const hasInvalidStateVariables = value.entities.some((entity) => {
    const stateIds = new Set(entity.state.map((state) => state.id))
    const stateNames = new Set(entity.state.map((state) => state.name.trim().toLocaleLowerCase('ru-RU')))
    return entity.state.some((state) => !state.id || !state.name.trim()) ||
      stateIds.size !== entity.state.length ||
      stateNames.size !== entity.state.length
  })
  if (hasInvalidStateVariables) {
    throw new CampaignFileError('Состояние сущности содержит пустые или повторяющиеся параметры.')
  }

  const relationshipIds = new Set(value.relationships.map((relationship) => relationship.id))
  if (relationshipIds.size !== value.relationships.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы связей.')
  }
  const eventIds = new Set(value.eventLog.map((event) => event.id))
  if (eventIds.size !== value.eventLog.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы событий.')
  }
  const knowledgeIds = new Set(value.knowledge.map((knowledge) => knowledge.id))
  if (knowledgeIds.size !== value.knowledge.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы знаний.')
  }
  const logicRuleIds = new Set(value.logicRules.map((rule) => rule.id))
  if (logicRuleIds.size !== value.logicRules.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы правил.')
  }
  const activationIds = new Set(value.logicActivations.map((activation) => activation.id))
  if (activationIds.size !== value.logicActivations.length) throw new CampaignFileError('В очереди обнаружены повторяющиеся идентификаторы срабатываний.')
  const triggerStateRuleIds = new Set(value.logicTriggerStates.map((state) => state.ruleId))
  if (triggerStateRuleIds.size !== value.logicTriggerStates.length) throw new CampaignFileError('В состоянии триггеров обнаружены повторяющиеся правила.')
  const sessionIds = new Set(value.sessions.map((session) => session.id))
  if (sessionIds.size !== value.sessions.length) throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы сессий.')
  const scheduledEventIds = new Set(value.scheduledEvents.map((event) => event.id))
  if (scheduledEventIds.size !== value.scheduledEvents.length) throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы запланированных событий.')
  const encounterIds = new Set(value.encounters.map((encounter) => encounter.id))
  if (encounterIds.size !== value.encounters.length) throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы столкновений.')

  const hasBrokenRelationships = value.relationships.some(
    (relationship) =>
      relationship.sourceId === relationship.targetId ||
      !entityIds.has(relationship.sourceId) ||
      !entityIds.has(relationship.targetId) ||
      !predicateIds.has(relationship.predicateId),
  )
  const hasBrokenEventLinks = value.eventLog.some((event) =>
    event.relatedEntityIds.some((id) => !entityIds.has(id)),
  )
  const hasInvalidKnowledge = value.knowledge.some((knowledge) =>
    !knowledge.content.trim() ||
    knowledge.relatedEntityIds.length === 0 ||
    new Set(knowledge.relatedEntityIds).size !== knowledge.relatedEntityIds.length)
  if (hasInvalidKnowledge) {
    throw new CampaignFileError('Knowledge State содержит пустые или повторяющиеся данные.')
  }
  const hasBrokenKnowledge = value.knowledge.some((knowledge) =>
    knowledge.relatedEntityIds.some((id) => !entityIds.has(id)) ||
    (knowledge.subjectType === 'entity' && !entityIds.has(knowledge.subjectEntityId!)),
  )
  function flattenLogicNodes(group: LogicConditionGroup): LogicConditionNode[] {
    return [group, ...group.children.flatMap((child) => child.kind === 'group' ? flattenLogicNodes(child) : [child])]
  }
  function hasInvalidLogicGroup(group: LogicConditionGroup, depth = 0): boolean {
    return depth > 5 || !group.children.length ||
      (group.operator === 'count' && (!group.minimum || group.minimum < 1 || group.minimum > group.children.length)) ||
      group.children.some((child) => child.kind === 'group' && hasInvalidLogicGroup(child, depth + 1))
  }
  const hasInvalidLogicRules = value.logicRules.some((rule) => {
    const nodes = flattenLogicNodes(rule.conditionGroup)
    const nodeIds = new Set(nodes.map((node) => node.id))
    const effectIds = new Set(rule.effects.map((effect) => effect.id))
    const effectTargets = new Set(rule.effects.map((effect) => effect.type === 'create_fact'
      ? `${effect.type}:${effect.predicateId}:${effect.directed}:${effect.directed ? `${effect.entityId}:${effect.targetEntityId}` : [effect.entityId, effect.targetEntityId].sort().join(':')}`
      : `${effect.entityId}:${effect.type}:${effect.type === 'set_state' ? effect.stateId : effect.type === 'set_custom_field' ? effect.customFieldId : 'status'}`))
    return !rule.id || !rule.name.trim() || rule.conditionGroup.children.length === 0 || rule.effects.length === 0 ||
      nodeIds.size !== nodes.length || hasInvalidLogicGroup(rule.conditionGroup) || effectIds.size !== rule.effects.length ||
      effectTargets.size !== rule.effects.length
  })
  if (hasInvalidLogicRules) throw new CampaignFileError('Логическое правило содержит пустые или повторяющиеся данные.')
  const entityById = new Map(value.entities.map((entity) => [entity.id, entity]))
  const hasBrokenLogicRules = value.logicRules.some((rule) =>
    flattenLogicNodes(rule.conditionGroup).some((node) => {
      if (node.kind === 'group') return false
      const condition = node
      if (condition.field === 'world_time') return !['equals', 'not_equals', 'greater', 'greater_or_equal', 'less', 'less_or_equal'].includes(condition.operator) || typeof condition.value !== 'string' || Number.isNaN(Date.parse(condition.value))
      const entity = entityById.get(condition.entityId!)
      if (condition.field === 'relationship') return !entity || !entityById.has(condition.targetEntityId!) ||
        (!condition.predicateId && !condition.relationshipType) || (condition.predicateId ? !predicateIds.has(condition.predicateId) : false) ||
        !['exists', 'not_exists'].includes(condition.operator)
      if (condition.field === 'custom_field') {
        const definition = customFieldDefinitions.get(condition.customFieldId ?? '')
        const existence = condition.operator === 'exists' || condition.operator === 'not_exists'
        if (!entity || !definition) return true
        if (existence) return false
        const valueValid = definition.type === 'boolean' ? typeof condition.value === 'boolean'
          : definition.type === 'number' ? typeof condition.value === 'number' && Number.isFinite(condition.value)
            : typeof condition.value === 'string'
        const operatorValid = definition.type === 'number'
          ? ['equals', 'not_equals', 'greater', 'greater_or_equal', 'less', 'less_or_equal'].includes(condition.operator)
          : definition.type === 'text'
            ? ['equals', 'not_equals', 'contains', 'not_contains'].includes(condition.operator)
            : ['equals', 'not_equals'].includes(condition.operator)
        return !valueValid || !operatorValid || (definition.type === 'entity_reference' && Boolean(condition.value) && !entityIds.has(String(condition.value)))
      }
      if (condition.field === 'knowledge') return !entity || !condition.subjectType ||
        !['exists', 'not_exists', 'equals', 'not_equals'].includes(condition.operator) ||
        (condition.subjectType === 'entity' && !entityById.has(condition.subjectEntityId!)) ||
        (['equals', 'not_equals'].includes(condition.operator) && !KNOWLEDGE_STATUSES.includes(String(condition.value) as KnowledgeRecord['status']))
      const state = entity?.state.find((item) => item.id === condition.stateId)
      const existence = condition.operator === 'exists' || condition.operator === 'not_exists'
      return !entity || (condition.field === 'lifecycle_status'
        ? !['equals', 'not_equals'].includes(condition.operator) || !['draft', 'active'].includes(String(condition.value))
        : (!condition.stateId || (!existence && (!state || !isStateValue(condition.value, state.valueType)))))
    }) || rule.effects.some((effect) => {
      const entity = entityById.get(effect.entityId)
      if (!entity) return true
      if (effect.type === 'create_fact') return !entityById.has(effect.targetEntityId) || effect.entityId === effect.targetEntityId || !predicateIds.has(effect.predicateId)
      if (effect.type === 'set_custom_field') {
        const definition = customFieldDefinitions.get(effect.customFieldId)
        if (!definition) return true
        const valueValid = definition.type === 'boolean' ? typeof effect.value === 'boolean'
          : definition.type === 'number' ? typeof effect.value === 'number' && Number.isFinite(effect.value)
            : typeof effect.value === 'string'
        return !valueValid || (definition.type === 'entity_reference' && Boolean(effect.value) && !entityIds.has(String(effect.value)))
      }
      const state = effect.type === 'set_state' ? entity.state.find((item) => item.id === effect.stateId) : undefined
      return effect.type === 'set_state' ? !state || !isStateValue(effect.value, state.valueType) : !['draft', 'active'].includes(String(effect.value))
    })) || value.logicRules.some((rule) => rule.executionMode === 'automatic' && rule.trigger.type === 'manual')
  const hasBrokenLogicRuntime = value.logicTriggerStates.some((state) => !logicRuleIds.has(state.ruleId) || (state.lastEventId && !eventIds.has(state.lastEventId))) ||
    value.logicActivations.some((activation) => !eventIds.has(activation.sourceEventId) || (activation.status === 'pending' && !logicRuleIds.has(activation.ruleId)) || (activation.status === 'pending' ? Boolean(activation.resolvedAt) : !activation.resolvedAt))
  if (hasBrokenLogicRuntime) throw new CampaignFileError('Очередь логических срабатываний содержит повреждённые ссылки.')
  const activeSessions = value.sessions.filter((session) => session.status === 'active')
  const hasInvalidSessions = activeSessions.length > 1 ||
    (value.activeSessionId === undefined ? activeSessions.length > 0 : activeSessions.length !== 1 || activeSessions[0].id !== value.activeSessionId) ||
    value.sessions.some((session) => {
      const scene = entityById.get(session.currentSceneId)
      return !session.name.trim() || !scene || scene.type !== 'scene' || (session.status === 'active' && scene.status === 'archived') ||
        session.visitedSceneIds.length === 0 || !session.visitedSceneIds.includes(session.currentSceneId) ||
        new Set(session.participantIds).size !== session.participantIds.length ||
        new Set(session.visitedSceneIds).size !== session.visitedSceneIds.length ||
        session.participantIds.some((id) => !entityIds.has(id)) ||
        session.visitedSceneIds.some((id) => entityById.get(id)?.type !== 'scene') ||
        (session.status === 'completed' && (!session.endedAt || !session.worldTimeEnd))
    }) || value.eventLog.some((event) => event.sessionId && !sessionIds.has(event.sessionId))
  if (hasInvalidSessions) throw new CampaignFileError('Runtime Layer содержит повреждённую сессию или ссылки.')
  const activeEncounters = value.encounters.filter((encounter) => encounter.status === 'active')
  const hasInvalidEncounters = activeEncounters.length > 1 ||
    (value.activeEncounterId === undefined ? activeEncounters.length > 0 : activeEncounters.length !== 1 || activeEncounters[0].id !== value.activeEncounterId) ||
    value.encounters.some((encounter) => {
      const encounterEntity = entityById.get(encounter.encounterEntityId)
      const participantIds = new Set(encounter.participants.map((participant) => participant.id))
      const participantEntityIds = new Set(encounter.participants.map((participant) => participant.entityId))
      return !encounterEntity || encounterEntity.type !== 'encounter' || !sessionIds.has(encounter.sessionId) || entityById.get(encounter.sceneId)?.type !== 'scene' ||
        encounter.participants.length < 2 || participantIds.size !== encounter.participants.length || participantEntityIds.size !== encounter.participants.length ||
        encounter.participants.some((participant) => !entityIds.has(participant.entityId)) ||
        encounter.currentTurnIndex < 0 || encounter.currentTurnIndex >= encounter.participants.length ||
        (encounter.status === 'completed' && (!encounter.endedAt || !encounter.outcome.trim()))
    })
  if (hasInvalidEncounters) throw new CampaignFileError('Runtime Layer содержит повреждённое столкновение или ссылки.')
  const hasInvalidOrigins = value.entities.some((entity) => entity.origin.mode === 'session_quick_create' &&
    (!entity.origin.sessionId || !sessionIds.has(entity.origin.sessionId) || !entity.origin.sceneId || entityById.get(entity.origin.sceneId)?.type !== 'scene'))
  if (hasInvalidOrigins) throw new CampaignFileError('Очередь импровизации содержит повреждённый контекст.')
  const hasInvalidScheduledEvents = value.scheduledEvents.some((event) => !event.title.trim() ||
    new Set(event.relatedEntityIds).size !== event.relatedEntityIds.length ||
    event.relatedEntityIds.some((id) => !entityIds.has(id)))
  if (hasInvalidScheduledEvents) throw new CampaignFileError('World Clock содержит повреждённое событие или ссылки.')
  if (hasBrokenRelationships || hasBrokenEventLinks || hasBrokenKnowledge || hasBrokenLogicRules) {
    throw new CampaignFileError('Кампания содержит ссылки на отсутствующие сущности.')
  }

  return value as unknown as Campaign
}

export function serializeCampaignFile(campaign: Campaign, exportedAt = new Date()): string {
  const file: CampaignFile = {
    format: CAMPAIGN_FILE_FORMAT,
    formatVersion: CAMPAIGN_FILE_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    campaign,
  }
  return JSON.stringify(file, null, 2)
}

export function parseCampaignFile(source: string): Campaign {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new CampaignFileError('Файл не является корректным JSON.')
  }

  if (!isRecord(value) || value.format !== CAMPAIGN_FILE_FORMAT) {
    throw new CampaignFileError('Это не файл кампании Vista Point.')
  }
  if (value.formatVersion !== CAMPAIGN_FILE_FORMAT_VERSION) {
    throw new CampaignFileError(`Версия формата файла не поддерживается: ${String(value.formatVersion)}.`)
  }
  if (!isIsoDate(value.exportedAt)) {
    throw new CampaignFileError('В файле отсутствует корректная дата экспорта.')
  }

  return validateCampaign(migrateCampaignSchema(value.campaign).campaign)
}

export function normalizeStoredCampaign(value: unknown): {
  campaign: Campaign
  migrated: boolean
  fromVersion?: number
} {
  const migration = migrateCampaignSchema(value)
  return {
    campaign: validateCampaign(migration.campaign),
    migrated: migration.migrated,
    fromVersion: migration.fromVersion,
  }
}

export function campaignFileName(campaign: Campaign): string {
  const safeName = campaign.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'campaign'
  return `${safeName}.vista-point.json`
}
