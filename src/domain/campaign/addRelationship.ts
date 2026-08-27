import type { Campaign, CampaignEvent, Relationship, RelationshipType } from './types'
import { builtinPredicateId } from './predicateCatalog'

export interface CreateRelationshipInput {
  sourceId: string
  targetId: string
  type?: RelationshipType
  predicateId?: string
  directed?: boolean
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

export function isSameRelationship(existing: Relationship, input: { sourceId: string; targetId: string; predicateId: string; directed: boolean }): boolean {
  const sameDirection = existing.sourceId === input.sourceId && existing.targetId === input.targetId
  const reverseDirection = existing.sourceId === input.targetId && existing.targetId === input.sourceId
  return (
    existing.predicateId === input.predicateId &&
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
  if (source.status === 'archived' || target.status === 'archived') {
    throw new Error('Нельзя создать связь с удалённой сущностью.')
  }
  const predicateId = input.predicateId ?? (input.type ? builtinPredicateId(input.type) : '')
  const predicate = campaign.predicates.find((item) => item.id === predicateId && item.status !== 'archived')
  if (!predicate) throw new Error('Предикат связи не найден или удалён.')
  const factType = predicate.systemType ?? input.type ?? 'custom'
  const directed = input.directed ?? predicate.directed
  const normalizedInput = { sourceId: input.sourceId, targetId: input.targetId, predicateId, directed }
  if (campaign.relationships.some(
    (relationship) => relationship.status !== 'archived' && isSameRelationship(relationship, normalizedInput),
  )) {
    throw new Error('Такая связь уже существует.')
  }
  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const relationship: Relationship = {
    id: options.relationshipId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    sourceId: input.sourceId,
    targetId: input.targetId,
    type: factType,
    predicateId,
    directed,
    description: input.description?.trim() ?? '',
    status: 'active',
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'relationship.created',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [source.id, target.id],
    reversible: true,
    payload: {
      relationshipId: relationship.id,
      relationshipType: relationship.type,
      predicateId: relationship.predicateId,
      predicateLabel: predicate.directLabel,
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
