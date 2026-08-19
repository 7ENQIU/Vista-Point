export const CAMPAIGN_SCHEMA_VERSION = 1 as const

export type EntityType =
  | 'location'
  | 'npc'
  | 'scene'
  | 'clue'
  | 'event'
  | 'encounter'

export type LifecycleStatus = 'draft' | 'active' | 'archived'
export type Visibility = 'game_master' | 'party' | 'public'

export interface CampaignEntity {
  id: string
  campaignId: string
  type: EntityType
  name: string
  aliases: string[]
  summary: string
  description: string
  status: LifecycleStatus
  visibility: Visibility
  tags: string[]
  customFields: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Relationship {
  id: string
  campaignId: string
  sourceId: string
  targetId: string
  type: string
  directed: boolean
  description: string
  status: LifecycleStatus
  visibility: Visibility
}

export interface CampaignEvent {
  id: string
  campaignId: string
  type: string
  occurredAt: string
  worldTime: string
  source: 'user' | 'system' | 'import'
  relatedEntityIds: string[]
  reversible: boolean
  payload: Record<string, unknown>
}

export interface Campaign {
  schemaVersion: typeof CAMPAIGN_SCHEMA_VERSION
  id: string
  name: string
  description: string
  gameSystem: string
  worldTime: string
  entities: CampaignEntity[]
  relationships: Relationship[]
  eventLog: CampaignEvent[]
  createdAt: string
  updatedAt: string
}
