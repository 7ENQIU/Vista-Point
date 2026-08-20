import { describe, expect, it } from 'vitest'
import type { CampaignBackup, CampaignRepository } from '../ports/CampaignRepository'
import type { Campaign } from '../../domain/campaign/types'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { updateAndSaveEntity } from './updateAndSaveEntity'

class UpdateEntityRepository implements CampaignRepository {
  saved?: Campaign
  saveCalls = 0
  async list() { return this.saved ? [this.saved] : [] }
  async getById(id: string) { return this.saved?.id === id ? this.saved : undefined }
  async save(campaign: Campaign) { this.saved = campaign; this.saveCalls += 1 }
  async importCampaign(campaign: Campaign) { this.saved = campaign; return { replaced: false } }
  async listBackups(_campaignId: string): Promise<CampaignBackup[]> { return [] }
  async restoreBackup(_backupId: string): Promise<Campaign> { throw new Error('Нет копии.') }
}

function campaignWithEntity() {
  return addEntityToCampaign(
    createCampaign({ name: 'Кампания' }),
    { type: 'location', name: 'Пурпе' },
  ).campaign
}

describe('updateAndSaveEntity', () => {
  it('сохраняет изменённую сущность через порт репозитория', async () => {
    const repository = new UpdateEntityRepository()
    const campaign = campaignWithEntity()
    const entity = campaign.entities[0]
    const result = await updateAndSaveEntity(repository, campaign, entity.id, {
      name: entity.name,
      aliases: ['Северный город'],
      summary: 'Крупнейшая локация кампании',
      description: '',
      status: 'active',
      visibility: 'game_master',
      tags: ['город'],
    })

    expect(result.changed).toBe(true)
    expect(repository.saved).toEqual(result.campaign)
    expect(repository.saveCalls).toBe(1)
  })

  it('не обращается к хранилищу при сохранении без изменений', async () => {
    const repository = new UpdateEntityRepository()
    const campaign = campaignWithEntity()
    const entity = campaign.entities[0]
    const result = await updateAndSaveEntity(repository, campaign, entity.id, {
      name: entity.name,
      aliases: [],
      summary: '',
      description: '',
      status: 'draft',
      visibility: 'game_master',
      tags: [],
    })

    expect(result.changed).toBe(false)
    expect(repository.saveCalls).toBe(0)
  })
})
