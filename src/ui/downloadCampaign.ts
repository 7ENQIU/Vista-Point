import { campaignFileName, serializeCampaignFile } from '../domain/campaign/campaignFile'
import type { Campaign } from '../domain/campaign/types'

export function downloadCampaign(campaign: Campaign): void {
  const blob = new Blob([serializeCampaignFile(campaign)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = campaignFileName(campaign)
  link.click()
  URL.revokeObjectURL(url)
}
