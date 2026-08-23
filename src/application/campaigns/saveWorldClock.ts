import { applyWorldTimeChangeInCampaign, cancelScheduledWorldEventInCampaign, createScheduledWorldEventInCampaign, type CreateScheduledWorldEventInput } from '../../domain/campaign/worldClock'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignCalendar } from '../../domain/campaign/types'
import { setCampaignCalendarInCampaign } from '../../domain/campaign/calendar'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function createAndSaveScheduledWorldEvent(repository: CampaignRepository, campaign: Campaign, input: CreateScheduledWorldEventInput) {
  const result = createScheduledWorldEventInCampaign(campaign, input); await repository.save(result.campaign); return result
}
export async function cancelAndSaveScheduledWorldEvent(repository: CampaignRepository, campaign: Campaign, scheduledEventId: string) {
  const result = cancelScheduledWorldEventInCampaign(campaign, scheduledEventId); await repository.save(result.campaign); return result
}
export async function applyAndSaveWorldTime(repository: CampaignRepository, campaign: Campaign, targetWorldTime: string) {
  const result = applyWorldTimeChangeInCampaign(campaign, targetWorldTime, true); await repository.save(result.campaign); return result
}
export async function setAndSaveCampaignCalendar(repository: CampaignRepository, campaign: Campaign, calendar: CampaignCalendar) {
  const result = setCampaignCalendarInCampaign(campaign, calendar); await repository.save(result.campaign); return result
}
