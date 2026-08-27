import { describe, expect, it } from 'vitest'
import type { CampaignBackup, CampaignRepository } from '../ports/CampaignRepository'
import type { Campaign } from '../../domain/campaign/types'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { createAndSaveFact } from './createAndSaveFact'

class MemoryCampaignRepository implements CampaignRepository {
  saved?: Campaign
  async list() { return this.saved ? [this.saved] : [] }
  async getById(id: string) { return this.saved?.id === id ? this.saved : undefined }
  async save(campaign: Campaign) { this.saved = campaign }
  async importCampaign(campaign: Campaign) { this.saved = campaign; return { replaced: false } }
  async listBackups(_campaignId: string): Promise<CampaignBackup[]> { return [] }
  async restoreBackup(_backupId: string): Promise<Campaign> { throw new Error('Нет копий.') }
}

describe('createAndSaveFact', () => {
  it('создаёт серию фактов с одинаковыми свойствами заготовки', async () => {
    const repository = new MemoryCampaignRepository()
    let campaign = createCampaign({ name: 'Канвас' })
    for (const [id, name] of [['source', 'Анна'], ['target-1', 'Башня'], ['target-2', 'Порт']] as const) {
      campaign = addEntityToCampaign(campaign, { type: 'location', name }, { entityId: id }).campaign
    }
    const preset = { predicateId: 'builtin:located_in', directed: true, description: 'Быстрое размещение.' }

    campaign = (await createAndSaveFact(repository, campaign, { sourceId: 'source', targetId: 'target-1', ...preset })).campaign
    campaign = (await createAndSaveFact(repository, campaign, { sourceId: 'source', targetId: 'target-2', ...preset })).campaign

    expect(campaign.relationships).toHaveLength(2)
    expect(campaign.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: 'target-1', description: preset.description }),
      expect.objectContaining({ targetId: 'target-2', description: preset.description }),
    ]))
    expect(campaign.eventLog.filter((event) => event.type === 'relationship.created')).toHaveLength(2)
    await expect(createAndSaveFact(repository, campaign, { sourceId: 'source', targetId: 'target-1', ...preset }))
      .rejects.toThrow('уже существует')
  })
})
