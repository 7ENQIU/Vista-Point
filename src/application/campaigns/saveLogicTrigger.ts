import { applyLogicActivationInCampaign, dismissLogicActivationInCampaign, refreshLogicTriggersInCampaign } from '../../domain/campaign/logicTriggers'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function refreshAndSaveLogicTriggers(repository: CampaignRepository, campaign: Campaign) {
  const result = refreshLogicTriggersInCampaign(campaign)
  if (result.changed) await repository.save(result.campaign)
  return result
}

export async function applyAndSaveLogicActivation(repository: CampaignRepository, campaign: Campaign, activationId: string) {
  const result = applyLogicActivationInCampaign(campaign, activationId)
  await repository.save(result.campaign)
  return result
}

export async function dismissAndSaveLogicActivation(repository: CampaignRepository, campaign: Campaign, activationId: string) {
  const result = dismissLogicActivationInCampaign(campaign, activationId)
  await repository.save(result.campaign)
  return result
}
