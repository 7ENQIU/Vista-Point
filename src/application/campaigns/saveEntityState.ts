import type { Campaign, CampaignEntity, EntityStateVariable } from '../../domain/campaign/types'
import {
  removeEntityStateFromCampaign,
  setEntityStateInCampaign,
  type SetEntityStateInput,
} from '../../domain/campaign/setEntityState'
import type { CampaignRepository } from '../ports/CampaignRepository'

export interface SavedEntityStateResult {
  campaign: Campaign
  entity: CampaignEntity
  state?: EntityStateVariable
  changed: boolean
}

export async function setAndSaveEntityState(
  repository: CampaignRepository,
  campaign: Campaign,
  entityId: string,
  input: SetEntityStateInput,
): Promise<SavedEntityStateResult> {
  const result = setEntityStateInCampaign(campaign, entityId, input)
  if (result.changed) await repository.save(result.campaign)
  return { campaign: result.campaign, entity: result.entity, state: result.state, changed: result.changed }
}

export async function removeAndSaveEntityState(
  repository: CampaignRepository,
  campaign: Campaign,
  entityId: string,
  stateId: string,
): Promise<SavedEntityStateResult> {
  const result = removeEntityStateFromCampaign(campaign, entityId, stateId)
  await repository.save(result.campaign)
  return { campaign: result.campaign, entity: result.entity, changed: true }
}
