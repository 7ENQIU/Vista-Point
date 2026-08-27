import { applyHistoryAction } from '../../domain/campaign/historyActions'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function applyAndSaveHistoryAction(
  repository: CampaignRepository,
  campaign: Campaign,
  direction: 'undo' | 'redo',
) {
  const result = applyHistoryAction(campaign, direction)
  await repository.save(result.campaign)
  return result
}
