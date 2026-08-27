import { createEntityTemplateFromEntity, removeEntityTemplateFromCampaign } from '../../domain/campaign/entityTemplates'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function createAndSaveEntityTemplate(repository: CampaignRepository, campaign: Campaign, entityId: string, name: string) {
  const result = createEntityTemplateFromEntity(campaign, entityId, name)
  await repository.save(result.campaign)
  return result
}

export async function removeAndSaveEntityTemplate(repository: CampaignRepository, campaign: Campaign, templateId: string) {
  const result = removeEntityTemplateFromCampaign(campaign, templateId)
  await repository.save(result.campaign)
  return result
}
