import {
  STATE_CATEGORIES,
  STATE_VALUE_TYPES,
  type Campaign,
  type CampaignEntity,
  type CampaignEvent,
  type EntityStateVariable,
  type StateCategory,
  type StateValue,
  type StateValueType,
} from './types'

export interface SetEntityStateInput {
  stateId?: string
  name: string
  category: StateCategory
  valueType: StateValueType
  value: StateValue
}

export interface EntityStateChangeResult {
  campaign: Campaign
  entity: CampaignEntity
  state?: EntityStateVariable
  event?: CampaignEvent
  changed: boolean
}

export interface EntityStateChangeOptions {
  now?: Date
  stateId?: string
  eventId?: string
}

function validStateValue(valueType: StateValueType, value: StateValue): boolean {
  if (valueType === 'boolean') return typeof value === 'boolean'
  if (valueType === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (valueType === 'decimal') return typeof value === 'number' && Number.isFinite(value)
  return valueType === 'text' && typeof value === 'string'
}

function getEditableEntity(campaign: Campaign, entityId: string): CampaignEntity {
  const entity = campaign.entities.find((item) => item.id === entityId)
  if (!entity) throw new Error('Сущность не найдена.')
  if (entity.status === 'archived') throw new Error('Архивную сущность нельзя изменять.')
  return entity
}

function replaceEntity(campaign: Campaign, entity: CampaignEntity, event: CampaignEvent): Campaign {
  return {
    ...campaign,
    entities: campaign.entities.map((item) => item.id === entity.id ? entity : item),
    eventLog: [...campaign.eventLog, event],
    updatedAt: event.occurredAt,
  }
}

export function setEntityStateInCampaign(
  campaign: Campaign,
  entityId: string,
  input: SetEntityStateInput,
  options: EntityStateChangeOptions = {},
): EntityStateChangeResult {
  const currentEntity = getEditableEntity(campaign, entityId)
  const name = input.name.trim()
  if (!name) throw new Error('Название параметра состояния обязательно.')
  if (!STATE_CATEGORIES.includes(input.category)) throw new Error('Категория состояния не поддерживается.')
  if (!STATE_VALUE_TYPES.includes(input.valueType) || !validStateValue(input.valueType, input.value)) {
    throw new Error('Значение не соответствует выбранному типу состояния.')
  }

  const existing = input.stateId
    ? currentEntity.state.find((state) => state.id === input.stateId)
    : undefined
  if (input.stateId && !existing) throw new Error('Параметр состояния не найден.')

  const duplicate = currentEntity.state.find((state) =>
    state.id !== existing?.id && state.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))
  if (duplicate) throw new Error('Параметр состояния с таким названием уже существует.')

  const unchanged = existing &&
    existing.name === name &&
    existing.category === input.category &&
    existing.valueType === input.valueType &&
    existing.value === input.value
  if (unchanged) return { campaign, entity: currentEntity, state: existing, changed: false }

  const timestamp = (options.now ?? new Date()).toISOString()
  const state: EntityStateVariable = {
    id: existing?.id ?? options.stateId ?? crypto.randomUUID(),
    name,
    category: input.category,
    valueType: input.valueType,
    value: input.valueType === 'text' ? String(input.value).trim() : input.value,
    updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: existing ? 'entity.state.updated' : 'entity.state.created',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [entityId],
    reversible: true,
    payload: {
      stateId: state.id,
      stateName: state.name,
      before: existing ?? null,
      after: state,
    },
  }
  const entity: CampaignEntity = {
    ...currentEntity,
    state: existing
      ? currentEntity.state.map((item) => item.id === existing.id ? state : item)
      : [...currentEntity.state, state],
    updatedAt: timestamp,
  }

  return { campaign: replaceEntity(campaign, entity, event), entity, state, event, changed: true }
}

export function removeEntityStateFromCampaign(
  campaign: Campaign,
  entityId: string,
  stateId: string,
  options: EntityStateChangeOptions = {},
): EntityStateChangeResult {
  const currentEntity = getEditableEntity(campaign, entityId)
  const existing = currentEntity.state.find((state) => state.id === stateId)
  if (!existing) throw new Error('Параметр состояния не найден.')

  const timestamp = (options.now ?? new Date()).toISOString()
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'entity.state.removed',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [entityId],
    reversible: true,
    payload: {
      stateId: existing.id,
      stateName: existing.name,
      before: existing,
      after: null,
    },
  }
  const entity: CampaignEntity = {
    ...currentEntity,
    state: currentEntity.state.filter((state) => state.id !== stateId),
    updatedAt: timestamp,
  }

  return { campaign: replaceEntity(campaign, entity, event), entity, event, changed: true }
}
