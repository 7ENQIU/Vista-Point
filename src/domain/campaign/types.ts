export const CAMPAIGN_SCHEMA_VERSION = 11 as const

export const ENTITY_TYPES = ['location', 'npc', 'scene', 'clue', 'item', 'note', 'event', 'encounter'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export type LifecycleStatus = 'draft' | 'active' | 'archived'
export type Visibility = 'game_master' | 'party' | 'public'
export const STATE_CATEGORIES = [
  'life',
  'social',
  'story',
  'information',
  'spatial',
  'resource',
  'custom',
] as const
export type StateCategory = (typeof STATE_CATEGORIES)[number]
export const STATE_VALUE_TYPES = ['boolean', 'integer', 'decimal', 'text'] as const
export type StateValueType = (typeof STATE_VALUE_TYPES)[number]
export type StateValue = boolean | number | string

export const KNOWLEDGE_SUBJECT_TYPES = ['party', 'entity'] as const
export type KnowledgeSubjectType = (typeof KNOWLEDGE_SUBJECT_TYPES)[number]
export const KNOWLEDGE_STATUSES = ['unknown', 'suspected', 'known', 'confirmed', 'false', 'forgotten'] as const
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number]
export const KNOWLEDGE_TRUTH_VALUES = ['unknown', 'true', 'false'] as const
export type KnowledgeTruth = (typeof KNOWLEDGE_TRUTH_VALUES)[number]

export const LOGIC_GROUP_OPERATORS = ['all', 'any', 'none', 'count'] as const
export type LogicGroupOperator = (typeof LOGIC_GROUP_OPERATORS)[number]
export const LOGIC_CONDITION_OPERATORS = [
  'equals', 'not_equals', 'greater', 'greater_or_equal', 'less', 'less_or_equal',
  'contains', 'not_contains', 'exists', 'not_exists',
] as const
export type LogicConditionOperator = (typeof LOGIC_CONDITION_OPERATORS)[number]
export const LOGIC_CONDITION_FIELDS = ['state', 'lifecycle_status', 'relationship', 'knowledge', 'world_time'] as const
export type LogicConditionField = (typeof LOGIC_CONDITION_FIELDS)[number]
export const LOGIC_EFFECT_TYPES = ['set_state', 'set_lifecycle_status'] as const
export type LogicEffectType = (typeof LOGIC_EFFECT_TYPES)[number]
export const LOGIC_EXECUTION_MODES = ['automatic', 'require_confirmation', 'suggest_only'] as const
export type LogicExecutionMode = (typeof LOGIC_EXECUTION_MODES)[number]
export const LOGIC_TRIGGER_TYPES = ['manual', 'on_change', 'world_time'] as const
export type LogicTriggerType = (typeof LOGIC_TRIGGER_TYPES)[number]
export const LOGIC_TRIGGER_REPEATS = ['once', 'rearm'] as const
export type LogicTriggerRepeat = (typeof LOGIC_TRIGGER_REPEATS)[number]
export const LOGIC_ACTIVATION_STATUSES = ['pending', 'applied', 'dismissed', 'invalidated'] as const
export type LogicActivationStatus = (typeof LOGIC_ACTIVATION_STATUSES)[number]

export interface EntityStateVariable {
  id: string
  name: string
  category: StateCategory
  valueType: StateValueType
  value: StateValue
  updatedAt: string
}
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
  characterTags: string[]
  locationLevel?: number
  customFields: Record<string, unknown>
  state: EntityStateVariable[]
  origin: EntityOrigin
  createdAt: string
  updatedAt: string
}

export interface EntityOrigin {
  mode: 'preparation' | 'session_quick_create'
  processed: boolean
  sessionId?: string
  sceneId?: string
  worldTime: string
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
  sessionId?: string
  relatedEntityIds: string[]
  reversible: boolean
  payload: Record<string, unknown>
}

export type SessionStatus = 'active' | 'completed'

export interface CampaignSession {
  id: string
  campaignId: string
  number: number
  name: string
  status: SessionStatus
  currentSceneId: string
  participantIds: string[]
  visitedSceneIds: string[]
  startedAt: string
  endedAt?: string
  worldTimeStart: string
  worldTimeEnd?: string
  summary: string
}

export type ScheduledWorldEventStatus = 'scheduled' | 'completed' | 'cancelled'

export interface ScheduledWorldEvent {
  id: string
  campaignId: string
  title: string
  description: string
  occursAt: string
  critical: boolean
  status: ScheduledWorldEventStatus
  relatedEntityIds: string[]
  createdAt: string
  updatedAt: string
}

export interface CalendarMonth {
  id: string
  name: string
  days: number
}

export interface GregorianCampaignCalendar {
  kind: 'gregorian'
  name: string
}

export interface CustomCampaignCalendar {
  kind: 'custom'
  name: string
  eraLabel: string
  months: CalendarMonth[]
  weekdays: string[]
  epochWorldTime: string
  epochYear: number
  epochMonthId: string
  epochDay: number
  epochHour: number
  epochMinute: number
  epochWeekdayIndex: number
}

export type CampaignCalendar = GregorianCampaignCalendar | CustomCampaignCalendar

export type EncounterStatus = 'active' | 'completed'
export type EncounterSide = 'allies' | 'opponents' | 'neutral'

export interface EncounterParticipant {
  id: string
  entityId: string
  side: EncounterSide
  initiative: number
  conditions: string[]
}

export interface CampaignEncounter {
  id: string
  campaignId: string
  encounterEntityId: string
  sessionId: string
  sceneId: string
  status: EncounterStatus
  round: number
  currentTurnIndex: number
  participants: EncounterParticipant[]
  startedAt: string
  endedAt?: string
  outcome: string
}

export interface KnowledgeRecord {
  id: string
  campaignId: string
  subjectType: KnowledgeSubjectType
  subjectEntityId?: string
  content: string
  status: KnowledgeStatus
  confidence: number
  truth: KnowledgeTruth
  source: string
  relatedEntityIds: string[]
  createdAt: string
  updatedAt: string
}

export interface LogicCondition {
  kind: 'condition'
  id: string
  entityId?: string
  field: LogicConditionField
  stateId?: string
  targetEntityId?: string
  relationshipType?: RelationshipType
  subjectType?: KnowledgeSubjectType
  subjectEntityId?: string
  operator: LogicConditionOperator
  value?: StateValue | LifecycleStatus
}

export interface LogicConditionGroup {
  kind: 'group'
  id: string
  operator: LogicGroupOperator
  minimum?: number
  children: LogicConditionNode[]
}

export type LogicConditionNode = LogicCondition | LogicConditionGroup

export interface LogicEffect {
  id: string
  entityId: string
  type: LogicEffectType
  stateId?: string
  value: StateValue | LifecycleStatus
}

export interface LogicTrigger {
  type: LogicTriggerType
  delayMinutes: number
  repeat: LogicTriggerRepeat
}

export interface LogicRule {
  id: string
  campaignId: string
  name: string
  description: string
  enabled: boolean
  conditionGroup: LogicConditionGroup
  effects: LogicEffect[]
  executionMode: LogicExecutionMode
  trigger: LogicTrigger
  createdAt: string
  updatedAt: string
}

export interface LogicTriggerState {
  ruleId: string
  lastSatisfied: boolean
  hasTriggered: boolean
  lastEventId?: string
  evaluatedAt: string
}

export interface LogicActivation {
  id: string
  campaignId: string
  ruleId: string
  status: LogicActivationStatus
  sourceEventId: string
  triggeredAt: string
  dueAt: string
  evaluationExplanation: string
  conditionExplanations: string[]
  effectExplanations: string[]
  resolvedAt?: string
}

export interface Campaign {
  schemaVersion: typeof CAMPAIGN_SCHEMA_VERSION
  id: string
  name: string
  description: string
  gameSystem: string
  worldTime: string
  calendar: CampaignCalendar
  entities: CampaignEntity[]
  relationships: Relationship[]
  knowledge: KnowledgeRecord[]
  logicRules: LogicRule[]
  logicTriggerStates: LogicTriggerState[]
  logicActivations: LogicActivation[]
  sessions: CampaignSession[]
  activeSessionId?: string
  scheduledEvents: ScheduledWorldEvent[]
  encounters: CampaignEncounter[]
  activeEncounterId?: string
  eventLog: CampaignEvent[]
  createdAt: string
  updatedAt: string
}
