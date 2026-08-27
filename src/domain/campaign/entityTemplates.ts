import type { Campaign, CampaignEvent, EntityTemplate } from './types'

export interface EntityTemplateOptions {
  now?: Date
  templateId?: string
  eventId?: string
}

export function createEntityTemplateFromEntity(
  campaign: Campaign,
  entityId: string,
  nameInput: string,
  options: EntityTemplateOptions = {},
): { campaign: Campaign; template: EntityTemplate; event: CampaignEvent } {
  const entity = campaign.entities.find((item) => item.id === entityId && item.status !== 'archived')
  if (!entity) throw new Error('Сущность для шаблона не найдена.')
  const name = nameInput.trim()
  if (!name) throw new Error('Название шаблона обязательно.')
  if (campaign.entityTemplates.some((template) => template.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) {
    throw new Error('Шаблон с таким названием уже существует.')
  }
  const timestamp = (options.now ?? new Date()).toISOString()
  const template: EntityTemplate = {
    id: options.templateId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    name,
    entityType: entity.type,
    customTypeId: entity.customTypeId,
    summary: entity.summary,
    description: entity.description,
    dmNotes: entity.dmNotes,
    tags: [...entity.tags],
    characterTags: [...entity.characterTags],
    customFields: { ...entity.customFields },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'entity.template.created',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId,
    relatedEntityIds: [entity.id], reversible: false,
    payload: { templateId: template.id, templateName: template.name, entityType: template.entityType, customTypeId: template.customTypeId, sourceEntityId: entity.id },
  }
  return {
    template,
    event,
    campaign: { ...campaign, entityTemplates: [...campaign.entityTemplates, template], eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}

export function removeEntityTemplateFromCampaign(
  campaign: Campaign,
  templateId: string,
  options: Pick<EntityTemplateOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; template: EntityTemplate; event: CampaignEvent } {
  const template = campaign.entityTemplates.find((item) => item.id === templateId)
  if (!template) throw new Error('Шаблон карточки не найден.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'entity.template.removed',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId,
    relatedEntityIds: [], reversible: false,
    payload: { templateId: template.id, templateName: template.name, entityType: template.entityType },
  }
  return {
    template,
    event,
    campaign: { ...campaign, entityTemplates: campaign.entityTemplates.filter((item) => item.id !== templateId), eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}
