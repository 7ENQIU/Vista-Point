import type { Campaign, CampaignEntity } from '../../domain/campaign/types'
import {
  updateEntityInCampaign,
  type UpdateEntityInput,
} from '../../domain/campaign/updateEntity'
import type { CampaignRepository } from '../ports/CampaignRepository'

export interface SavedEntityUpdateResult {
  campaign: Campaign
  entity: CampaignEntity
  changed: boolean
}

export async function updateAndSaveEntity(
  repository: CampaignRepository,
  campaign: Campaign,
  entityId: string,
  input: UpdateEntityInput,
): Promise<SavedEntityUpdateResult> {
  const result = updateEntityInCampaign(campaign, entityId, input)
  if (result.changed) await repository.save(result.campaign)
  return { campaign: result.campaign, entity: result.entity, changed: result.changed }
}
