export const CAMPAIGN_SCHEMA_VERSION = 1 as const

export const ENTITY_TYPES = ['location', 'npc', 'scene', 'clue', 'event', 'encounter'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export type LifecycleStatus = 'draft' | 'active' | 'archived'
export type Visibility = 'game_master' | 'party' | 'public'
export const RELATIONSHIP_TYPES = [
  'located_in',
  'belongs_to',
  'knows',
  'controls',
  'depends_on',
  'discovers',
  'blocks',
  'causes',
  'reveals',
  'opposes',
  'contains',
  'transitions_to',
  'participates_in',
] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

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
  type: RelationshipType
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
