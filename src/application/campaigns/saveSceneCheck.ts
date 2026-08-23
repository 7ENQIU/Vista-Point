import { resolveSceneCheckInCampaign, type ResolveSceneCheckInput } from '../../domain/campaign/sceneChecks'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function resolveAndSaveSceneCheck(repository: CampaignRepository, campaign: Campaign, input: ResolveSceneCheckInput) {
  const result = resolveSceneCheckInCampaign(campaign, input); await repository.save(result.campaign); return result
}
