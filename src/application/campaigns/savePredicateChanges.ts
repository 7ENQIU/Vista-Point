import { archivePredicateInCampaign, updatePredicateInCampaign, type UpdatePredicateInput } from '../../domain/campaign/managePredicate'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function updateAndSavePredicate(repository: CampaignRepository, campaign: Campaign, predicateId: string, input: UpdatePredicateInput) {
  const result = updatePredicateInCampaign(campaign, predicateId, input)
  if (result.changed) await repository.save(result.campaign)
  return result
}

export async function archiveAndSavePredicate(repository: CampaignRepository, campaign: Campaign, predicateId: string) {
  const result = archivePredicateInCampaign(campaign, predicateId)
  await repository.save(result.campaign)
  return result
}
