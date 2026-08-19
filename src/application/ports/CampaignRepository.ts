import type { Campaign } from '../../domain/campaign/types'

export interface CampaignBackup {
  id: string
  campaignId: string
  createdAt: string
  reason: 'before-import' | 'before-restore'
  campaign: Campaign
}

export interface ImportCampaignResult {
  replaced: boolean
  backupId?: string
}

export interface CampaignRepository {
  list(): Promise<Campaign[]>
  getById(id: string): Promise<Campaign | undefined>
  save(campaign: Campaign): Promise<void>
  importCampaign(campaign: Campaign): Promise<ImportCampaignResult>
  listBackups(campaignId: string): Promise<CampaignBackup[]>
  restoreBackup(backupId: string): Promise<Campaign>
}
