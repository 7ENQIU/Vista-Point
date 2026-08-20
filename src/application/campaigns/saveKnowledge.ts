import {
  removeKnowledgeFromCampaign,
  setKnowledgeInCampaign,
  type SetKnowledgeInput,
} from '../../domain/campaign/setKnowledge'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function setAndSaveKnowledge(
  repository: CampaignRepository,
  campaign: Campaign,
  input: SetKnowledgeInput,
) {
  const result = setKnowledgeInCampaign(campaign, input)
  if (result.changed) await repository.save(result.campaign)
  return result
}

export async function removeAndSaveKnowledge(
  repository: CampaignRepository,
  campaign: Campaign,
  knowledgeId: string,
) {
  const result = removeKnowledgeFromCampaign(campaign, knowledgeId)
  await repository.save(result.campaign)
  return result
}
