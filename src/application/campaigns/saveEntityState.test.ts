import { describe, expect, it } from 'vitest'
import type { CampaignBackup, CampaignRepository } from '../ports/CampaignRepository'
import type { Campaign } from '../../domain/campaign/types'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { removeAndSaveEntityState, setAndSaveEntityState } from './saveEntityState'

class StateRepository implements CampaignRepository {
  saved?: Campaign
  saveCalls = 0
  async list() { return this.saved ? [this.saved] : [] }
  async getById(id: string) { return this.saved?.id === id ? this.saved : undefined }
  async save(campaign: Campaign) { this.saved = campaign; this.saveCalls += 1 }
  async importCampaign(campaign: Campaign) { this.saved = campaign; return { replaced: false } }
  async listBackups(_campaignId: string): Promise<CampaignBackup[]> { return [] }
  async restoreBackup(_backupId: string): Promise<Campaign> { throw new Error('Нет копии.') }
}

describe('entity state application scenarios', () => {
  it('сохраняет создание и удаление состояния одной сущности', async () => {
    const repository = new StateRepository()
    const campaign = addEntityToCampaign(
      createCampaign({ name: 'Кампания' }),
      { type: 'npc', name: 'Серёга' },
    ).campaign
    const entityId = campaign.entities[0].id

    const created = await setAndSaveEntityState(repository, campaign, entityId, {
      name: 'Здоровье', category: 'resource', valueType: 'integer', value: 18,
    })
    const removed = await removeAndSaveEntityState(
      repository,
      created.campaign,
      entityId,
      created.state!.id,
    )

    expect(created.entity.state).toHaveLength(1)
    expect(removed.entity.state).toEqual([])
    expect(repository.saved).toEqual(removed.campaign)
    expect(repository.saveCalls).toBe(2)
  })
})
