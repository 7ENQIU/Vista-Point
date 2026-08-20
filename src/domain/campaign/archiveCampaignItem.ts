import type { Campaign, CampaignEntity, CampaignEvent, Relationship } from './types'

export interface ArchiveOptions {
  now?: Date
  eventId?: string
}

export interface ArchiveRelationshipResult {
  campaign: Campaign
  relationship: Relationship
  event: CampaignEvent
}

export interface ArchiveEntityResult {
  campaign: Campaign
  entity: CampaignEntity
  archivedRelationships: Relationship[]
  event: CampaignEvent
}

export function archiveRelationshipInCampaign(
  campaign: Campaign,
  relationshipId: string,
  options: ArchiveOptions = {},
): ArchiveRelationshipResult {
  const relationship = campaign.relationships.find((item) => item.id === relationshipId)
  if (!relationship) throw new Error('Связь не найдена в кампании.')
  if (relationship.status === 'archived') throw new Error('Связь уже удалена из рабочих представлений.')

  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const archivedRelationship: Relationship = { ...relationship, status: 'archived' }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'relationship.archived',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [relationship.sourceId, relationship.targetId],
    reversible: true,
    payload: {
      relationshipId: relationship.id,
      relationshipType: relationship.type,
      previousStatus: relationship.status,
      newStatus: archivedRelationship.status,
    },
  }

  return {
    relationship: archivedRelationship,
    event,
    campaign: {
      ...campaign,
      relationships: campaign.relationships.map((item) =>
        item.id === relationshipId ? archivedRelationship : item),
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}

export function archiveEntityInCampaign(
  campaign: Campaign,
  entityId: string,
  options: ArchiveOptions = {},
): ArchiveEntityResult {
  const entity = campaign.entities.find((item) => item.id === entityId)
  if (!entity) throw new Error('Сущность не найдена в кампании.')
  if (entity.status === 'archived') throw new Error('Сущность уже удалена из рабочих представлений.')
  const activeSession = campaign.sessions.find((session) => session.id === campaign.activeSessionId && session.status === 'active')
  if (activeSession?.currentSceneId === entityId) {
    throw new Error('Текущую сцену нельзя архивировать во время сессии. Сначала смените сцену или завершите сессию.')
  }

  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const archivedEntity: CampaignEntity = {
    ...entity,
    status: 'archived',
    updatedAt: timestamp,
  }
  const archivedRelationships = campaign.relationships
    .filter((relationship) =>
      relationship.status !== 'archived' &&
      (relationship.sourceId === entityId || relationship.targetId === entityId))
    .map((relationship): Relationship => ({ ...relationship, status: 'archived' }))
  const archivedRelationshipIds = new Set(archivedRelationships.map((relationship) => relationship.id))
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'entity.archived',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [entity.id],
    reversible: true,
    payload: {
      entityId: entity.id,
      entityName: entity.name,
      previousStatus: entity.status,
      newStatus: archivedEntity.status,
      archivedRelationshipIds: [...archivedRelationshipIds],
    },
  }

  return {
    entity: archivedEntity,
    archivedRelationships,
    event,
    campaign: {
      ...campaign,
      entities: campaign.entities.map((item) => item.id === entityId ? archivedEntity : item),
      relationships: campaign.relationships.map((relationship) =>
        archivedRelationshipIds.has(relationship.id)
          ? { ...relationship, status: 'archived' }
          : relationship),
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
