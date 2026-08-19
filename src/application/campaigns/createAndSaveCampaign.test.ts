import { describe, expect, it } from 'vitest'
import type { CampaignBackup, CampaignRepository } from '../ports/CampaignRepository'
import type { Campaign } from '../../domain/campaign/types'
import { createAndSaveCampaign } from './createAndSaveCampaign'

class MemoryCampaignRepository implements CampaignRepository {
  campaigns: Campaign[] = []

  async list() {
    return this.campaigns
  }

  async getById(id: string) {
    return this.campaigns.find((campaign) => campaign.id === id)
  }

  async save(campaign: Campaign) {
    this.campaigns.push(campaign)
  }

  async importCampaign(campaign: Campaign) {
    const replaced = this.campaigns.some((item) => item.id === campaign.id)
    this.campaigns = [campaign, ...this.campaigns.filter((item) => item.id !== campaign.id)]
    return { replaced }
  }

  async listBackups(_campaignId: string): Promise<CampaignBackup[]> {
    return []
  }

  async restoreBackup(_backupId: string): Promise<Campaign> {
    throw new Error('В тестовом репозитории нет резервных копий.')
  }
}

describe('createAndSaveCampaign', () => {
  it('сохраняет созданную кампанию через порт репозитория', async () => {
    const repository = new MemoryCampaignRepository()

    const campaign = await createAndSaveCampaign(repository, { name: 'Северный рубеж' })

    expect(repository.campaigns).toEqual([campaign])
    expect(campaign.name).toBe('Северный рубеж')
  })
})
