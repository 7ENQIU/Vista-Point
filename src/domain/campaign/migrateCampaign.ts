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
  if (!isRecord(value) || ![1, 2, 3, 4].includes(value.schemaVersion as number)) {
    return { campaign: value, migrated: false }
  }

  const fromVersion = value.schemaVersion as 1 | 2 | 3 | 4
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

  return {
    migrated: true,
    fromVersion,
    campaign: {
      ...migrated,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      sessions: [],
      activeSessionId: undefined,
    },
  }
}

export function isCurrentCampaign(value: unknown): value is Campaign {
  return isRecord(value) && value.schemaVersion === CAMPAIGN_SCHEMA_VERSION
}
