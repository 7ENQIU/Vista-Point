import { describe, expect, it } from 'vitest'
import type { CampaignBackup, CampaignRepository } from '../ports/CampaignRepository'
import type { Campaign } from '../../domain/campaign/types'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { serializeCampaignFile } from '../../domain/campaign/campaignFile'
import { importCampaignFile } from './importCampaignFile'

class ImportRepository implements CampaignRepository {
  campaign?: Campaign

  async list() { return this.campaign ? [this.campaign] : [] }
  async getById(id: string) { return this.campaign?.id === id ? this.campaign : undefined }
  async save(campaign: Campaign) { this.campaign = campaign }
  async importCampaign(campaign: Campaign) {
    const replaced = this.campaign?.id === campaign.id
    this.campaign = campaign
    return { replaced, backupId: replaced ? 'backup-1' : undefined }
  }
  async listBackups(_campaignId: string): Promise<CampaignBackup[]> { return [] }
  async restoreBackup(_backupId: string): Promise<Campaign> { throw new Error('Нет копии.') }
}

describe('importCampaignFile', () => {
  it('проверяет файл до передачи кампании репозиторию', async () => {
    const repository = new ImportRepository()
    const campaign = createCampaign({ name: 'Импорт' }, new Date('2026-08-19T18:00:00Z'), 'id-1')

    const result = await importCampaignFile(repository, serializeCampaignFile(campaign))

    expect(result.campaign).toEqual(campaign)
    expect(result.replaced).toBe(false)
    expect(repository.campaign).toEqual(campaign)
  })

  it('не изменяет хранилище при повреждённом файле', async () => {
    const repository = new ImportRepository()

    await expect(importCampaignFile(repository, '{broken')).rejects.toThrow('корректным JSON')
    expect(repository.campaign).toBeUndefined()
  })
})
