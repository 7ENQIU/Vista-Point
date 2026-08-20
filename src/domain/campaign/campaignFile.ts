import {
  CAMPAIGN_SCHEMA_VERSION,
  ENTITY_TYPES,
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_SUBJECT_TYPES,
  KNOWLEDGE_TRUTH_VALUES,
  LOGIC_CONDITION_FIELDS,
  LOGIC_CONDITION_OPERATORS,
  LOGIC_EFFECT_TYPES,
  LOGIC_EXECUTION_MODES,
  LOGIC_GROUP_OPERATORS,
  RELATIONSHIP_TYPES,
  STATE_CATEGORIES,
  STATE_VALUE_TYPES,
  type Campaign,
  type CampaignEntity,
  type CampaignEvent,
  type CampaignSession,
  type KnowledgeRecord,
  type LogicCondition,
  type LogicEffect,
  type LogicRule,
  type Relationship,
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
  return (
    isString(value.id) &&
    value.campaignId === campaignId &&
    isString(value.type) &&
    ENTITY_TYPES.includes(value.type as CampaignEntity['type']) &&
    isString(value.name) &&
    isStringArray(value.aliases) &&
    isString(value.summary) &&
    isString(value.description) &&
    isString(value.status) &&
    isString(value.visibility) &&
    isStringArray(value.tags) &&
    isRecord(value.customFields) &&
    Array.isArray(value.state) &&
    value.state.every(isEntityState) &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  )
}

function isRelationship(value: unknown, campaignId: string): value is Relationship {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    value.campaignId === campaignId &&
    isString(value.sourceId) &&
    isString(value.targetId) &&
    isString(value.type) &&
    RELATIONSHIP_TYPES.includes(value.type as Relationship['type']) &&
    typeof value.directed === 'boolean' &&
    isString(value.description) &&
    isString(value.status) &&
    isString(value.visibility)
  )
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
  return isString(value.id) && isString(value.entityId) &&
    isString(value.field) && LOGIC_CONDITION_FIELDS.includes(value.field as LogicCondition['field']) &&
    (value.stateId === undefined || isString(value.stateId)) &&
    isString(value.operator) && LOGIC_CONDITION_OPERATORS.includes(value.operator as LogicCondition['operator']) &&
    (value.value === undefined || typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean')
}

function isLogicEffect(value: unknown): value is LogicEffect {
  if (!isRecord(value)) return false
  return isString(value.id) && isString(value.entityId) &&
    isString(value.type) && LOGIC_EFFECT_TYPES.includes(value.type as LogicEffect['type']) &&
    (value.stateId === undefined || isString(value.stateId)) &&
    (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean')
}

function isLogicRule(value: unknown, campaignId: string): value is LogicRule {
  if (!isRecord(value)) return false
  return isString(value.id) && value.campaignId === campaignId && isString(value.name) && isString(value.description) &&
    typeof value.enabled === 'boolean' &&
    isString(value.groupOperator) && LOGIC_GROUP_OPERATORS.includes(value.groupOperator as LogicRule['groupOperator']) &&
    Array.isArray(value.conditions) && value.conditions.every(isLogicCondition) &&
    Array.isArray(value.effects) && value.effects.every(isLogicEffect) &&
    isString(value.executionMode) && LOGIC_EXECUTION_MODES.includes(value.executionMode as LogicRule['executionMode']) &&
    isIsoDate(value.createdAt) && isIsoDate(value.updatedAt)
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
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    !Array.isArray(value.entities) ||
    !Array.isArray(value.relationships) ||
    !Array.isArray(value.knowledge) ||
    !Array.isArray(value.logicRules) ||
    !Array.isArray(value.sessions) ||
    (value.activeSessionId !== undefined && !isString(value.activeSessionId)) ||
    !Array.isArray(value.eventLog)
  ) {
    throw new CampaignFileError('Структура кампании повреждена или неполна.')
  }

  const campaignId = value.id
  if (!value.entities.every((entity) => isEntity(entity, campaignId))) {
    throw new CampaignFileError('Одна или несколько сущностей имеют неверную структуру.')
  }
  if (!value.relationships.every((relationship) => isRelationship(relationship, campaignId))) {
    throw new CampaignFileError('Одна или несколько связей имеют неверную структуру.')
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
  if (!value.sessions.every((session) => isCampaignSession(session, campaignId))) {
    throw new CampaignFileError('Одна или несколько сессий имеют неверную структуру.')
  }

  const entityIds = new Set(value.entities.map((entity) => entity.id))
  if (entityIds.size !== value.entities.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы сущностей.')
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
  const sessionIds = new Set(value.sessions.map((session) => session.id))
  if (sessionIds.size !== value.sessions.length) throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы сессий.')

  const hasBrokenRelationships = value.relationships.some(
    (relationship) =>
      relationship.sourceId === relationship.targetId ||
      !entityIds.has(relationship.sourceId) ||
      !entityIds.has(relationship.targetId),
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
  const hasInvalidLogicRules = value.logicRules.some((rule) => {
    const conditionIds = new Set(rule.conditions.map((condition) => condition.id))
    const effectIds = new Set(rule.effects.map((effect) => effect.id))
    const effectTargets = new Set(rule.effects.map((effect) =>
      `${effect.entityId}:${effect.type}:${effect.type === 'set_state' ? effect.stateId : 'status'}`))
    return !rule.id || !rule.name.trim() || rule.conditions.length === 0 || rule.effects.length === 0 ||
      conditionIds.size !== rule.conditions.length || effectIds.size !== rule.effects.length ||
      effectTargets.size !== rule.effects.length
  })
  if (hasInvalidLogicRules) throw new CampaignFileError('Логическое правило содержит пустые или повторяющиеся данные.')
  const entityById = new Map(value.entities.map((entity) => [entity.id, entity]))
  const hasBrokenLogicRules = value.logicRules.some((rule) =>
    rule.conditions.some((condition) => {
      const entity = entityById.get(condition.entityId)
      const state = entity?.state.find((item) => item.id === condition.stateId)
      const existence = condition.operator === 'exists' || condition.operator === 'not_exists'
      return !entity || (condition.field === 'lifecycle_status'
        ? !['equals', 'not_equals'].includes(condition.operator) || !['draft', 'active'].includes(String(condition.value))
        : (!condition.stateId || (!existence && (!state || !isStateValue(condition.value, state.valueType)))))
    }) || rule.effects.some((effect) => {
      const entity = entityById.get(effect.entityId)
      const state = entity?.state.find((item) => item.id === effect.stateId)
      return !entity || (effect.type === 'set_state'
        ? !state || !isStateValue(effect.value, state.valueType)
        : !['draft', 'active'].includes(String(effect.value)))
    }))
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
