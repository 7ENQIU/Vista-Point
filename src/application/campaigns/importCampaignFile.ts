import { parseCampaignFile } from '../../domain/campaign/campaignFile'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository, ImportCampaignResult } from '../ports/CampaignRepository'

export interface ImportedCampaign extends ImportCampaignResult {
  campaign: Campaign
}

export async function importCampaignFile(
  repository: CampaignRepository,
  source: string,
): Promise<ImportedCampaign> {
  const campaign = parseCampaignFile(source)
  const result = await repository.importCampaign(campaign)
  return { campaign, ...result }
}
