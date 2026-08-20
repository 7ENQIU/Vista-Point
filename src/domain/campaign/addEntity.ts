import type { Campaign, CampaignEntity, CampaignEvent, EntityType } from './types'

export interface CreateEntityInput {
  type: EntityType
  name: string
  summary?: string
}

export interface AddEntityResult {
  campaign: Campaign
  entity: CampaignEntity
  event: CampaignEvent
}

export interface AddEntityOptions {
  now?: Date
  entityId?: string
  eventId?: string
}

export function addEntityToCampaign(
  campaign: Campaign,
  input: CreateEntityInput,
  options: AddEntityOptions = {},
): AddEntityResult {
  const name = input.name.trim()
  if (!name) throw new Error('Название сущности обязательно.')

  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const entity: CampaignEntity = {
    id: options.entityId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: input.type,
    name,
    aliases: [],
    summary: input.summary?.trim() ?? '',
    description: '',
    status: 'draft',
    visibility: 'game_master',
    tags: [],
    customFields: {},
    state: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'entity.created',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [entity.id],
    reversible: true,
    payload: {
      entityType: entity.type,
      entityName: entity.name,
      creationMode: 'preparation',
      newStatus: entity.status,
    },
  }

  return {
    entity,
    event,
    campaign: {
      ...campaign,
      entities: [...campaign.entities, entity],
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
