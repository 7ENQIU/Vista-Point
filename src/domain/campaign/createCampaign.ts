import { CAMPAIGN_SCHEMA_VERSION, type Campaign } from './types'

export interface CreateCampaignInput {
  name: string
  description?: string
  gameSystem?: string
}

export function createCampaign(
  input: CreateCampaignInput,
  now = new Date(),
  id: string = crypto.randomUUID(),
): Campaign {
  const name = input.name.trim()

  if (!name) {
    throw new Error('Название кампании обязательно.')
  }

  const timestamp = now.toISOString()

  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    id,
    name,
    description: input.description?.trim() ?? '',
    gameSystem: input.gameSystem?.trim() ?? '',
    worldTime: timestamp,
    entities: [],
    relationships: [],
    eventLog: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
