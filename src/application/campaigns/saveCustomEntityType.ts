import { createCustomEntityTypeInCampaign, removeCustomEntityTypeFromCampaign, renameCustomEntityTypeInCampaign } from '../../domain/campaign/customEntityTypes'
import type { Campaign, EntityType } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function createAndSaveCustomEntityType(repository: CampaignRepository, campaign: Campaign, input: { name: string; baseType: EntityType }) {
  const result = createCustomEntityTypeInCampaign(campaign, input)
  await repository.save(result.campaign)
  return result
}

export async function renameAndSaveCustomEntityType(repository: CampaignRepository, campaign: Campaign, typeId: string, name: string) {
  const result = renameCustomEntityTypeInCampaign(campaign, typeId, name)
  if (result.campaign !== campaign) await repository.save(result.campaign)
  return result
}

export async function removeAndSaveCustomEntityType(repository: CampaignRepository, campaign: Campaign, typeId: string) {
  const result = removeCustomEntityTypeFromCampaign(campaign, typeId)
  await repository.save(result.campaign)
  return result
}
