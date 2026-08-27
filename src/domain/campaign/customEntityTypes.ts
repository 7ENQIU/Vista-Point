import type { Campaign, CampaignEvent, CustomEntityType, EntityType } from './types'

export interface CustomEntityTypeOptions {
  now?: Date
  typeId?: string
  eventId?: string
}

function normalizedName(name: string) {
  return name.trim().toLocaleLowerCase('ru-RU')
}

function assertUniqueName(campaign: Campaign, name: string, exceptId?: string) {
  if (campaign.customEntityTypes.some((item) => item.id !== exceptId && normalizedName(item.name) === normalizedName(name))) {
    throw new Error('Пользовательский тип с таким названием уже существует.')
  }
}

export function createCustomEntityTypeInCampaign(
  campaign: Campaign,
  input: { name: string; baseType: EntityType },
  options: CustomEntityTypeOptions = {},
): { campaign: Campaign; customType: CustomEntityType; event: CampaignEvent } {
  const name = input.name.trim()
  if (!name) throw new Error('Название пользовательского типа обязательно.')
  assertUniqueName(campaign, name)
  const timestamp = (options.now ?? new Date()).toISOString()
  const customType: CustomEntityType = {
    id: options.typeId ?? crypto.randomUUID(), campaignId: campaign.id, name, baseType: input.baseType,
    createdAt: timestamp, updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'entity.type.created',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId,
    relatedEntityIds: [], reversible: false,
    payload: { customTypeId: customType.id, customTypeName: customType.name, baseType: customType.baseType },
  }
  return { customType, event, campaign: { ...campaign, customEntityTypes: [...campaign.customEntityTypes, customType], eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function renameCustomEntityTypeInCampaign(
  campaign: Campaign,
  typeId: string,
  nameInput: string,
  options: Pick<CustomEntityTypeOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; customType: CustomEntityType; event?: CampaignEvent } {
  const existing = campaign.customEntityTypes.find((item) => item.id === typeId)
  if (!existing) throw new Error('Пользовательский тип сущности не найден.')
  const name = nameInput.trim()
  if (!name) throw new Error('Название пользовательского типа обязательно.')
  assertUniqueName(campaign, name, typeId)
  if (name === existing.name) return { campaign, customType: existing }
  const timestamp = (options.now ?? new Date()).toISOString()
  const customType = { ...existing, name, updatedAt: timestamp }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'entity.type.renamed',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId,
    relatedEntityIds: [], reversible: false,
    payload: { customTypeId: typeId, previousName: existing.name, customTypeName: name, baseType: existing.baseType },
  }
  return { customType, event, campaign: { ...campaign, customEntityTypes: campaign.customEntityTypes.map((item) => item.id === typeId ? customType : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function removeCustomEntityTypeFromCampaign(
  campaign: Campaign,
  typeId: string,
  options: Pick<CustomEntityTypeOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; customType: CustomEntityType; event: CampaignEvent } {
  const customType = campaign.customEntityTypes.find((item) => item.id === typeId)
  if (!customType) throw new Error('Пользовательский тип сущности не найден.')
  if (campaign.entities.some((entity) => entity.customTypeId === typeId)) {
    throw new Error('Нельзя удалить тип, пока он используется сущностями.')
  }
  if (campaign.entityTemplates.some((template) => template.customTypeId === typeId)) {
    throw new Error('Нельзя удалить тип, пока он используется шаблонами карточек.')
  }
  const timestamp = (options.now ?? new Date()).toISOString()
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'entity.type.removed',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId,
    relatedEntityIds: [], reversible: false,
    payload: { customTypeId: typeId, customTypeName: customType.name, baseType: customType.baseType },
  }
  return {
    customType,
    event,
    campaign: {
      ...campaign,
      customEntityTypes: campaign.customEntityTypes.filter((item) => item.id !== typeId),
      savedGraphViews: (campaign.savedGraphViews ?? []).map((view) => view.customEntityTypeIds.includes(typeId)
        ? { ...view, customEntityTypeIds: view.customEntityTypeIds.filter((item) => item !== typeId), updatedAt: timestamp }
        : view),
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
