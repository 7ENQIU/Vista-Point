export const CAMPAIGN_SCHEMA_VERSION = 22 as const

export const ENTITY_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export type EntityImageMimeType = (typeof ENTITY_IMAGE_MIME_TYPES)[number]
export const ENTITY_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const ENTITY_IMAGE_MAX_DATA_URL_LENGTH = 7_100_000

export interface EntityImage {
  dataUrl: string
  mimeType: EntityImageMimeType
  fileName: string
  updatedAt: string
}

export const ENTITY_TYPES = ['location', 'npc', 'scene', 'clue', 'item', 'note', 'event', 'encounter'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export interface CustomEntityType {
  id: string
  campaignId: string
  name: string
  baseType: EntityType
  createdAt: string
  updatedAt: string
}

export interface SavedGraphView {
  id: string
  campaignId: string
  name: string
  query: string
  entityTypes: EntityType[]
  customEntityTypeIds: string[]
  createdAt: string
  updatedAt: string
}

export type LifecycleStatus = 'draft' | 'active' | 'archived'

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'boolean', 'entity_reference'] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]
export type CustomFieldValue = string | number | boolean

export interface CustomFieldDefinition {
  id: string
  name: string
  type: CustomFieldType
}

export interface EntityTemplate {
  id: string
  campaignId: string
  name: string
  entityType: EntityType
  customTypeId?: string
  summary: string
  description: string
  dmNotes: string
  tags: string[]
  characterTags: string[]
  customFields: Record<string, CustomFieldValue>
  createdAt: string
  updatedAt: string
}

export interface FactHotbarPreset {
  type: 'create_fact'
  label: string
  predicateId: string
  directed: boolean
  description: string
}

export interface HotbarSlot {
  slot: number
  preset?: FactHotbarPreset
}
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
export const LOGIC_CONDITION_FIELDS = ['state', 'custom_field', 'lifecycle_status', 'relationship', 'knowledge', 'world_time'] as const
export type LogicConditionField = (typeof LOGIC_CONDITION_FIELDS)[number]
export const LOGIC_EFFECT_TYPES = ['set_state', 'set_custom_field', 'create_fact', 'set_lifecycle_status'] as const
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
export const FACT_TYPES = [...RELATIONSHIP_TYPES, 'custom'] as const
export type FactType = (typeof FACT_TYPES)[number]

export interface Predicate {
  id: string
  campaignId: string
  directLabel: string
  inverseLabel: string
  description: string
  directed: boolean
  systemType?: RelationshipType
  status: LifecycleStatus
  createdAt: string
  updatedAt: string
}

export interface CampaignEntity {
  id: string
  campaignId: string
  type: EntityType
  customTypeId?: string
  name: string
  aliases: string[]
  summary: string
  description: string
  dmNotes: string
  image?: EntityImage
  status: LifecycleStatus
  tags: string[]
  characterTags: string[]
  locationLevel?: number
  customFields: Record<string, CustomFieldValue>
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
  type: FactType
  predicateId: string
  directed: boolean
  description: string
  status: LifecycleStatus
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
  customFieldId?: string
  targetEntityId?: string
  relationshipType?: RelationshipType
  predicateId?: string
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

export type LogicEffect =
  | { id: string; entityId: string; type: 'set_state'; stateId: string; value: StateValue }
  | { id: string; entityId: string; type: 'set_custom_field'; customFieldId: string; value: CustomFieldValue }
  | { id: string; entityId: string; type: 'create_fact'; targetEntityId: string; predicateId: string; directed: boolean; description: string }
  | { id: string; entityId: string; type: 'set_lifecycle_status'; value: LifecycleStatus }

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
  predicates: Predicate[]
  relationships: Relationship[]
  hotbar: HotbarSlot[]
  customFieldDefinitions: CustomFieldDefinition[]
  customEntityTypes: CustomEntityType[]
  savedGraphViews: SavedGraphView[]
  entityTemplates: EntityTemplate[]
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
