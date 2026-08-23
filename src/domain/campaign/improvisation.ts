import { addEntityToCampaign, type CreateEntityInput } from './addEntity'
import type { Campaign, CampaignEntity, CampaignEvent } from './types'

interface ImprovisationOptions { now?: Date; entityId?: string; eventId?: string }

function activeSessionContext(campaign: Campaign) {
  const session = campaign.sessions.find((item) => item.id === campaign.activeSessionId && item.status === 'active')
  if (!session) throw new Error('Quick Create доступен только во время активной сессии.')
  return session
}

export function quickCreateEntityInCampaign(campaign: Campaign, input: CreateEntityInput, options: ImprovisationOptions = {}) {
  const session = activeSessionContext(campaign)
  return addEntityToCampaign(campaign, input, {
    ...options,
    origin: { mode: 'session_quick_create', processed: false, sessionId: session.id, sceneId: session.currentSceneId, worldTime: campaign.worldTime },
  })
}

export function markImprovisedEntityProcessedInCampaign(
  campaign: Campaign,
  entityId: string,
  options: Pick<ImprovisationOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; entity: CampaignEntity; event: CampaignEvent } {
  const current = campaign.entities.find((entity) => entity.id === entityId && entity.status !== 'archived')
  if (!current || current.origin.mode !== 'session_quick_create' || current.origin.processed) throw new Error('Необработанный импровизированный объект не найден.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const entity: CampaignEntity = { ...current, origin: { ...current.origin, processed: true }, updatedAt: timestamp }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: campaign.activeSessionId,
    type: 'entity.quick_create.processed', occurredAt: timestamp, worldTime: campaign.worldTime,
    source: 'user', relatedEntityIds: [entity.id], reversible: true,
    payload: { entityId: entity.id, entityName: entity.name, sessionId: current.origin.sessionId, sceneId: current.origin.sceneId },
  }
  return { entity, event, campaign: { ...campaign, entities: campaign.entities.map((item) => item.id === entity.id ? entity : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function getImprovisationQueue(campaign: Campaign) {
  return campaign.entities.filter((entity) => entity.status !== 'archived' && entity.origin.mode === 'session_quick_create' && !entity.origin.processed)
}
