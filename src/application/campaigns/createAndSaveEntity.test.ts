import { describe, expect, it } from 'vitest'
import type { CampaignBackup, CampaignRepository } from '../ports/CampaignRepository'
import type { Campaign } from '../../domain/campaign/types'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { createAndSaveEntity } from './createAndSaveEntity'

class EntityRepository implements CampaignRepository {
  saved?: Campaign
  async list() { return this.saved ? [this.saved] : [] }
  async getById(id: string) { return this.saved?.id === id ? this.saved : undefined }
  async save(campaign: Campaign) { this.saved = campaign }
  async importCampaign(campaign: Campaign) { this.saved = campaign; return { replaced: false } }
  async listBackups(_campaignId: string): Promise<CampaignBackup[]> { return [] }
  async restoreBackup(_backupId: string): Promise<Campaign> { throw new Error('Нет копии.') }
}

describe('createAndSaveEntity', () => {
  it('сохраняет обновлённую кампанию через порт репозитория', async () => {
    const repository = new EntityRepository()
    const campaign = createCampaign({ name: 'Кампания' })

    const result = await createAndSaveEntity(repository, campaign, {
      type: 'npc',
      name: 'Арден Вейл',
    })

    expect(repository.saved).toEqual(result.campaign)
    expect(result.campaign.entities).toContainEqual(result.entity)
    expect(result.campaign.eventLog[0].relatedEntityIds).toContain(result.entity.id)
  })
})
