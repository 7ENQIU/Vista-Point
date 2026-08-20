import {
  applyLogicRuleInCampaign,
  removeLogicRuleFromCampaign,
  setLogicRuleInCampaign,
  type SetLogicRuleInput,
} from '../../domain/campaign/logicRules'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function setAndSaveLogicRule(
  repository: CampaignRepository,
  campaign: Campaign,
  input: SetLogicRuleInput,
) {
  const result = setLogicRuleInCampaign(campaign, input)
  if (result.changed) await repository.save(result.campaign)
  return result
}

export async function removeAndSaveLogicRule(
  repository: CampaignRepository,
  campaign: Campaign,
  ruleId: string,
) {
  const result = removeLogicRuleFromCampaign(campaign, ruleId)
  await repository.save(result.campaign)
  return result
}

export async function applyAndSaveLogicRule(
  repository: CampaignRepository,
  campaign: Campaign,
  ruleId: string,
) {
  const result = applyLogicRuleInCampaign(campaign, ruleId)
  if (result.changed) await repository.save(result.campaign)
  return result
}
