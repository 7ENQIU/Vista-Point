import type { Campaign, CampaignEntity, CampaignEvent, EntityType } from './types'

export interface CreateEntityInput {
  type: EntityType
  name: string
  summary?: string
  locationLevel?: number
  characterTags?: string[]
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
  origin?: CampaignEntity['origin']
}

export function addEntityToCampaign(
  campaign: Campaign,
  input: CreateEntityInput,
  options: AddEntityOptions = {},
): AddEntityResult {
  const name = input.name.trim()
  if (!name) throw new Error('Название сущности обязательно.')
  if (input.locationLevel !== undefined && (input.type !== 'location' || !Number.isInteger(input.locationLevel) || input.locationLevel < 1)) {
    throw new Error('Уровень локации должен быть целым числом от 1.')
  }

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
    characterTags: input.type === 'npc' ? [...new Set((input.characterTags ?? []).map((tag) => tag.trim()).filter(Boolean))] : [],
    locationLevel: input.type === 'location' ? input.locationLevel : undefined,
    customFields: {},
    state: [],
    origin: options.origin ?? { mode: 'preparation', processed: true, worldTime: campaign.worldTime },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: entity.origin.mode === 'session_quick_create' ? 'entity.quick_created' : 'entity.created',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [entity.id],
    reversible: true,
    payload: {
      entityType: entity.type,
      entityName: entity.name,
      creationMode: entity.origin.mode,
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
