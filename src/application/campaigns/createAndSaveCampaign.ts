import { createCampaign, type CreateCampaignInput } from '../../domain/campaign/createCampaign'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function createAndSaveCampaign(
  repository: CampaignRepository,
  input: CreateCampaignInput,
): Promise<Campaign> {
  const campaign = createCampaign(input)
  await repository.save(campaign)
  return campaign
}
