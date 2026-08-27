import { setHotbarSlotInCampaign } from '../../domain/campaign/hotbar'
import type { Campaign, FactHotbarPreset } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function saveHotbarSlot(
  repository: CampaignRepository,
  campaign: Campaign,
  slot: number,
  preset: FactHotbarPreset | undefined,
): Promise<Campaign> {
  const updated = setHotbarSlotInCampaign(campaign, slot, preset)
  await repository.save(updated)
  return updated
}
