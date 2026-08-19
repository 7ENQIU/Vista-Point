import { describe, expect, it } from 'vitest'
import type { CampaignBackup, CampaignRepository } from '../ports/CampaignRepository'
import type { Campaign } from '../../domain/campaign/types'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { createCampaign } from '../../domain/campaign/createCampaign'
import {
  createAndSaveRelationship,
  createAndSaveRelationships,
} from './createAndSaveRelationship'

class RelationshipRepository implements CampaignRepository {
  saved?: Campaign
  async list() { return this.saved ? [this.saved] : [] }
  async getById(id: string) { return this.saved?.id === id ? this.saved : undefined }
  async save(campaign: Campaign) { this.saved = campaign }
  async importCampaign(campaign: Campaign) { this.saved = campaign; return { replaced: false } }
  async listBackups(_campaignId: string): Promise<CampaignBackup[]> { return [] }
  async restoreBackup(_backupId: string): Promise<Campaign> { throw new Error('Нет копии.') }
}

describe('createAndSaveRelationship', () => {
  it('сохраняет кампанию со связью и событием', async () => {
    const repository = new RelationshipRepository()
    const empty = createCampaign({ name: 'Кампания' })
    const first = addEntityToCampaign(empty, { type: 'npc', name: 'NPC' }, { entityId: 'e1' })
    const campaign = addEntityToCampaign(first.campaign, { type: 'scene', name: 'Сцена' }, { entityId: 'e2' }).campaign

    const result = await createAndSaveRelationship(repository, campaign, {
      sourceId: 'e1', targetId: 'e2', type: 'belongs_to', directed: true,
    })

    expect(repository.saved).toEqual(result.campaign)
    expect(result.campaign.relationships).toContainEqual(result.relationship)
    expect(result.campaign.eventLog.at(-1)?.type).toBe('relationship.created')
  })

  it('создаёт несколько самостоятельных связей и сохраняет кампанию один раз', async () => {
    class CountingRepository extends RelationshipRepository {
      saveCount = 0
      override async save(campaign: Campaign) {
        this.saveCount += 1
        await super.save(campaign)
      }
    }
    const repository = new CountingRepository()
    const empty = createCampaign({ name: 'Кампания' })
    const first = addEntityToCampaign(empty, { type: 'npc', name: 'Серёга' }, { entityId: 'e1' })
    const second = addEntityToCampaign(first.campaign, { type: 'npc', name: 'Макс' }, { entityId: 'e2' })
    const campaign = addEntityToCampaign(second.campaign, { type: 'scene', name: 'Сцена' }, { entityId: 'e3' }).campaign

    const result = await createAndSaveRelationships(repository, campaign, [
      { sourceId: 'e1', targetId: 'e3', type: 'participates_in', directed: true },
      { sourceId: 'e2', targetId: 'e3', type: 'participates_in', directed: true },
    ])

    expect(result.relationships).toHaveLength(2)
    expect(result.campaign.relationships).toHaveLength(2)
    expect(result.campaign.eventLog.slice(-2).every((event) => event.type === 'relationship.created')).toBe(true)
    expect(repository.saveCount).toBe(1)
  })

  it('не сохраняет частичный пакет, если одна из связей некорректна', async () => {
    const repository = new RelationshipRepository()
    const empty = createCampaign({ name: 'Кампания' })
    const first = addEntityToCampaign(empty, { type: 'npc', name: 'Серёга' }, { entityId: 'e1' })
    const campaign = addEntityToCampaign(first.campaign, { type: 'scene', name: 'Сцена' }, { entityId: 'e2' }).campaign

    await expect(createAndSaveRelationships(repository, campaign, [
      { sourceId: 'e1', targetId: 'e2', type: 'participates_in', directed: true },
      { sourceId: 'e2', targetId: 'e2', type: 'participates_in', directed: true },
    ])).rejects.toThrow('должны быть разными')
    expect(repository.saved).toBeUndefined()
  })
})
