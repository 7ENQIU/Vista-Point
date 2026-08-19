import type { Campaign, CampaignEvent, Relationship, RelationshipType } from './types'

export interface CreateRelationshipInput {
  sourceId: string
  targetId: string
  type: RelationshipType
  directed: boolean
  description?: string
}

export interface AddRelationshipResult {
  campaign: Campaign
  relationship: Relationship
  event: CampaignEvent
}

export interface AddRelationshipOptions {
  now?: Date
  relationshipId?: string
  eventId?: string
}

function isSameRelationship(existing: Relationship, input: CreateRelationshipInput): boolean {
  const sameDirection = existing.sourceId === input.sourceId && existing.targetId === input.targetId
  const reverseDirection = existing.sourceId === input.targetId && existing.targetId === input.sourceId
  return (
    existing.type === input.type &&
    existing.directed === input.directed &&
    (sameDirection || (!input.directed && reverseDirection))
  )
}

export function addRelationshipToCampaign(
  campaign: Campaign,
  input: CreateRelationshipInput,
  options: AddRelationshipOptions = {},
): AddRelationshipResult {
  if (input.sourceId === input.targetId) {
    throw new Error('Источник и цель связи должны быть разными сущностями.')
  }

  const source = campaign.entities.find((entity) => entity.id === input.sourceId)
  const target = campaign.entities.find((entity) => entity.id === input.targetId)
  if (!source || !target) {
    throw new Error('Источник или цель связи не найдены в кампании.')
  }
  if (campaign.relationships.some((relationship) => isSameRelationship(relationship, input))) {
    throw new Error('Такая связь уже существует.')
  }

  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const relationship: Relationship = {
    id: options.relationshipId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    sourceId: input.sourceId,
    targetId: input.targetId,
    type: input.type,
    directed: input.directed,
    description: input.description?.trim() ?? '',
    status: 'active',
    visibility: 'game_master',
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'relationship.created',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    relatedEntityIds: [source.id, target.id],
    reversible: true,
    payload: {
      relationshipId: relationship.id,
      relationshipType: relationship.type,
      sourceName: source.name,
      targetName: target.name,
      directed: relationship.directed,
    },
  }

  return {
    relationship,
    event,
    campaign: {
      ...campaign,
      relationships: [...campaign.relationships, relationship],
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
