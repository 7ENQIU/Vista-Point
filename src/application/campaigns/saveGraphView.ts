import { createSavedGraphViewInCampaign, removeSavedGraphViewFromCampaign, renameSavedGraphViewInCampaign, type SavedGraphViewInput } from '../../domain/campaign/savedGraphViews'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function createAndSaveGraphView(repository: CampaignRepository, campaign: Campaign, input: SavedGraphViewInput) {
  const result = createSavedGraphViewInCampaign(campaign, input)
  await repository.save(result.campaign)
  return result
}

export async function renameAndSaveGraphView(repository: CampaignRepository, campaign: Campaign, viewId: string, name: string) {
  const result = renameSavedGraphViewInCampaign(campaign, viewId, name)
  if (result.campaign !== campaign) await repository.save(result.campaign)
  return result
}

export async function removeAndSaveGraphView(repository: CampaignRepository, campaign: Campaign, viewId: string) {
  const result = removeSavedGraphViewFromCampaign(campaign, viewId)
  await repository.save(result.campaign)
  return result
}
