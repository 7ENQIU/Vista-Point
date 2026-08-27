import { CAMPAIGN_SCHEMA_VERSION, type Campaign } from './types'
import { builtinPredicateId, createBuiltinPredicates } from './predicateCatalog'
import { createEmptyHotbar } from './hotbar'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripLegacyVisibility(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLegacyVisibility)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) =>
    key === 'visibility' ? [] : [[key, stripLegacyVisibility(entry)]],
  ))
}

export interface CampaignMigrationResult {
  campaign: unknown
  migrated: boolean
  fromVersion?: number
}

export function migrateCampaignSchema(value: unknown): CampaignMigrationResult {
  if (!isRecord(value) || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].includes(value.schemaVersion as number)) {
    return { campaign: value, migrated: false }
  }

  const fromVersion = value.schemaVersion as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21
  let migrated: Record<string, unknown> = value

  if (fromVersion === 1) {
    if (!Array.isArray(value.entities)) return { campaign: value, migrated: false }
    migrated = {
      ...value,
      schemaVersion: 2,
      entities: value.entities.map((entity) => isRecord(entity)
        ? { ...entity, state: [] }
        : entity),
    }
  }

  if (fromVersion < 3) {
    migrated = { ...migrated, schemaVersion: 3, knowledge: [] }
  }

  if (fromVersion < 4) {
    migrated = { ...migrated, schemaVersion: 4, logicRules: [] }
  }

  if (fromVersion < 5) {
    migrated = { ...migrated, schemaVersion: 5, sessions: [], activeSessionId: undefined }
  }

  if (fromVersion < 6) {
    migrated = { ...migrated, schemaVersion: 6, scheduledEvents: [] }
  }

  if (fromVersion < 7) {
    const entities = Array.isArray(migrated.entities)
      ? migrated.entities.map((entity) => isRecord(entity)
        ? { ...entity, origin: { mode: 'preparation', processed: true, worldTime: String(migrated.worldTime ?? '') } }
        : entity)
      : migrated.entities
    migrated = { ...migrated, schemaVersion: 7, entities, encounters: [], activeEncounterId: undefined }
  }

  const migratedRules = Array.isArray(migrated.logicRules) ? migrated.logicRules.map((rule) => {
    if (!isRecord(rule)) return rule
    const withTree = fromVersion < 8
      ? (() => { const { groupOperator, conditions, ...rest } = rule; const children = Array.isArray(conditions) ? conditions.map((condition) => isRecord(condition) ? { ...condition, kind: 'condition' } : condition) : []; return { ...rest, conditionGroup: { kind: 'group', id: `${String(rule.id)}:root`, operator: groupOperator, children } } })()
      : rule
    const withTrigger = fromVersion < 9 ? { ...withTree, trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' } } : withTree
    const hasLegacyStatusCondition = (node: unknown): boolean => isRecord(node) && (
      node.field === 'lifecycle_status' ||
      (Array.isArray(node.children) && node.children.some(hasLegacyStatusCondition))
    )
    const withTriggerRecord: Record<string, unknown> = withTrigger
    const hasLegacyStatusEffect = Array.isArray(withTriggerRecord.effects) && withTriggerRecord.effects.some((effect: unknown) =>
      isRecord(effect) && effect.type === 'set_lifecycle_status')
    return fromVersion < 14 && (hasLegacyStatusCondition(withTriggerRecord.conditionGroup) || hasLegacyStatusEffect)
      ? { ...withTrigger, enabled: false }
      : withTrigger
  }) : migrated.logicRules

  const migratedEntities = Array.isArray(migrated.entities)
    ? migrated.entities.map((entity) => isRecord(entity)
      ? (() => {
        const { visibility: _legacyVisibility, ...entityWithoutVisibility } = entity
        return {
          ...entityWithoutVisibility,
          status: fromVersion < 14 && entity.status === 'draft' ? 'active' : entity.status,
          characterTags: fromVersion < 11 ? [] : entity.characterTags,
          locationLevel: fromVersion < 11 ? undefined : entity.locationLevel,
          dmNotes: fromVersion < 12 ? '' : entity.dmNotes,
          image: fromVersion < 12 ? undefined : entity.image,
        }
      })()
      : entity)
    : migrated.entities

  const timestamp = typeof migrated.createdAt === 'string' ? migrated.createdAt : new Date(0).toISOString()
  const predicates = fromVersion < 13
    ? createBuiltinPredicates(String(migrated.id ?? ''), timestamp)
    : migrated.predicates
  const relationships = fromVersion < 13 && Array.isArray(migrated.relationships)
    ? migrated.relationships.map((relationship) => isRecord(relationship) && typeof relationship.type === 'string'
      ? { ...relationship, predicateId: builtinPredicateId(relationship.type as Parameters<typeof builtinPredicateId>[0]) }
      : relationship)
    : migrated.relationships

  const legacyCustomFields = Array.isArray(migratedEntities)
    ? migratedEntities.flatMap((entity) => isRecord(entity) && isRecord(entity.customFields)
      ? Object.entries(entity.customFields)
      : [])
    : []
  const customFieldDefinitions = fromVersion < 18
    ? [...new Map(legacyCustomFields.map(([id, fieldValue]) => [id, {
      id,
      name: id,
      type: typeof fieldValue === 'boolean' ? 'boolean' : typeof fieldValue === 'number' ? 'number' : 'text',
    }])).values()]
    : migrated.customFieldDefinitions
  const entitiesWithTypedCustomFields = fromVersion < 18 && Array.isArray(migratedEntities)
    ? migratedEntities.map((entity) => isRecord(entity) && isRecord(entity.customFields)
      ? {
        ...entity,
        customFields: Object.fromEntries(Object.entries(entity.customFields).map(([id, fieldValue]) => [
          id,
          typeof fieldValue === 'boolean' || (typeof fieldValue === 'number' && Number.isFinite(fieldValue)) || typeof fieldValue === 'string'
            ? fieldValue
            : JSON.stringify(fieldValue),
        ])),
      }
      : entity)
    : migratedEntities

  return {
    migrated: true,
    fromVersion,
    campaign: {
      ...migrated,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      calendar: fromVersion < 10 ? { kind: 'gregorian', name: 'Григорианский календарь' } : migrated.calendar,
      entities: entitiesWithTypedCustomFields,
      predicates,
      relationships: fromVersion < 22 ? stripLegacyVisibility(relationships) : relationships,
      hotbar: fromVersion < 17 ? createEmptyHotbar() : fromVersion < 22 ? stripLegacyVisibility(migrated.hotbar) : migrated.hotbar,
      customFieldDefinitions,
      customEntityTypes: fromVersion < 20 ? [] : migrated.customEntityTypes,
      savedGraphViews: fromVersion < 21 ? [] : migrated.savedGraphViews,
      entityTemplates: fromVersion < 19 ? [] : migrated.entityTemplates,
      logicRules: fromVersion < 22 ? stripLegacyVisibility(migratedRules) : migratedRules,
      logicTriggerStates: fromVersion < 9 ? [] : (Array.isArray(migrated.logicTriggerStates) ? migrated.logicTriggerStates : []),
      logicActivations: fromVersion < 9 ? [] : (Array.isArray(migrated.logicActivations) ? migrated.logicActivations : []),
      eventLog: fromVersion < 22 ? stripLegacyVisibility(migrated.eventLog) : migrated.eventLog,
    },
  }
}

export function isCurrentCampaign(value: unknown): value is Campaign {
  return isRecord(value) && value.schemaVersion === CAMPAIGN_SCHEMA_VERSION
}
