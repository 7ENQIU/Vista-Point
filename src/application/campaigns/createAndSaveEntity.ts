import { addEntityToCampaign, type CreateEntityInput } from '../../domain/campaign/addEntity'
import type { CampaignEntity, Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export interface SavedEntityResult {
  campaign: Campaign
  entity: CampaignEntity
}

export async function createAndSaveEntity(
  repository: CampaignRepository,
  campaign: Campaign,
  input: CreateEntityInput,
): Promise<SavedEntityResult> {
  const result = addEntityToCampaign(campaign, input)
  await repository.save(result.campaign)
  return { campaign: result.campaign, entity: result.entity }
}
