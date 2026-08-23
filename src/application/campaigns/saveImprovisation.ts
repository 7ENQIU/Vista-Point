import { markImprovisedEntityProcessedInCampaign, quickCreateEntityInCampaign } from '../../domain/campaign/improvisation'
import type { CreateEntityInput } from '../../domain/campaign/addEntity'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function quickCreateAndSaveEntity(repository: CampaignRepository, campaign: Campaign, input: CreateEntityInput) {
  const result = quickCreateEntityInCampaign(campaign, input); await repository.save(result.campaign); return result
}
export async function processAndSaveImprovisedEntity(repository: CampaignRepository, campaign: Campaign, entityId: string) {
  const result = markImprovisedEntityProcessedInCampaign(campaign, entityId); await repository.save(result.campaign); return result
}
