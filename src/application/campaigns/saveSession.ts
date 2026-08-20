import {
  addSessionEventInCampaign,
  completeSessionInCampaign,
  startSessionInCampaign,
  updateSessionContextInCampaign,
  type AddSessionEventInput,
  type StartSessionInput,
  type UpdateSessionContextInput,
} from '../../domain/campaign/sessions'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function startAndSaveSession(repository: CampaignRepository, campaign: Campaign, input: StartSessionInput) {
  const result = startSessionInCampaign(campaign, input); await repository.save(result.campaign); return result
}
export async function updateAndSaveSessionContext(repository: CampaignRepository, campaign: Campaign, input: UpdateSessionContextInput) {
  const result = updateSessionContextInCampaign(campaign, input); if (result.changed) await repository.save(result.campaign); return result
}
export async function addAndSaveSessionEvent(repository: CampaignRepository, campaign: Campaign, input: AddSessionEventInput) {
  const result = addSessionEventInCampaign(campaign, input); await repository.save(result.campaign); return result
}
export async function completeAndSaveSession(repository: CampaignRepository, campaign: Campaign, summary: string) {
  const result = completeSessionInCampaign(campaign, summary); await repository.save(result.campaign); return result
}
