import {
  CAMPAIGN_SCHEMA_VERSION,
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type Campaign,
  type CampaignEntity,
  type CampaignEvent,
  type Relationship,
} from './types'

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
    isStringArray(value.relatedEntityIds) &&
    typeof value.reversible === 'boolean' &&
    isRecord(value.payload)
  )
}

function validateCampaign(value: unknown): Campaign {
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

  const entityIds = new Set(value.entities.map((entity) => entity.id))
  if (entityIds.size !== value.entities.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы сущностей.')
  }

  const relationshipIds = new Set(value.relationships.map((relationship) => relationship.id))
  if (relationshipIds.size !== value.relationships.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы связей.')
  }
  const eventIds = new Set(value.eventLog.map((event) => event.id))
  if (eventIds.size !== value.eventLog.length) {
    throw new CampaignFileError('В кампании обнаружены повторяющиеся идентификаторы событий.')
  }

  const hasBrokenRelationships = value.relationships.some(
    (relationship) =>
      relationship.sourceId === relationship.targetId ||
      !entityIds.has(relationship.sourceId) ||
      !entityIds.has(relationship.targetId),
  )
  const hasBrokenEventLinks = value.eventLog.some((event) =>
    event.relatedEntityIds.some((id) => !entityIds.has(id)),
  )
  if (hasBrokenRelationships || hasBrokenEventLinks) {
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

  return validateCampaign(value.campaign)
}

export function campaignFileName(campaign: Campaign): string {
  const safeName = campaign.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'campaign'
  return `${safeName}.vista-point.json`
}
