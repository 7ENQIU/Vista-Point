import { CAMPAIGN_SCHEMA_VERSION, type Campaign } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface CampaignMigrationResult {
  campaign: unknown
  migrated: boolean
  fromVersion?: number
}

export function migrateCampaignSchema(value: unknown): CampaignMigrationResult {
  if (!isRecord(value) || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(value.schemaVersion as number)) {
    return { campaign: value, migrated: false }
  }

  const fromVersion = value.schemaVersion as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
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
    return fromVersion < 9 ? { ...withTree, trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' } } : withTree
  }) : migrated.logicRules

  const migratedEntities = Array.isArray(migrated.entities)
    ? migrated.entities.map((entity) => isRecord(entity)
      ? { ...entity, characterTags: [], locationLevel: undefined }
      : entity)
    : migrated.entities

  return {
    migrated: true,
    fromVersion,
    campaign: {
      ...migrated,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      calendar: fromVersion < 10 ? { kind: 'gregorian', name: 'Григорианский календарь' } : migrated.calendar,
      entities: migratedEntities,
      logicRules: migratedRules,
      logicTriggerStates: [],
      logicActivations: [],
    },
  }
}

export function isCurrentCampaign(value: unknown): value is Campaign {
  return isRecord(value) && value.schemaVersion === CAMPAIGN_SCHEMA_VERSION
}
