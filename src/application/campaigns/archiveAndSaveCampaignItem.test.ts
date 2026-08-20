import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { addRelationshipToCampaign } from '../../domain/campaign/addRelationship'
import { createCampaign } from '../../domain/campaign/createCampaign'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignBackup, CampaignRepository } from '../ports/CampaignRepository'
import { archiveAndSaveEntity, archiveAndSaveRelationship } from './archiveAndSaveCampaignItem'

class ArchiveRepository implements CampaignRepository {
  saved?: Campaign
  async list() { return this.saved ? [this.saved] : [] }
  async getById(id: string) { return this.saved?.id === id ? this.saved : undefined }
  async save(campaign: Campaign) { this.saved = campaign }
  async importCampaign(campaign: Campaign) { this.saved = campaign; return { replaced: false } }
  async listBackups(_campaignId: string): Promise<CampaignBackup[]> { return [] }
  async restoreBackup(_backupId: string): Promise<Campaign> { throw new Error('Нет копии.') }
}

function relatedCampaign() {
  const empty = createCampaign({ name: 'Архив' })
  const first = addEntityToCampaign(empty, { type: 'npc', name: 'NPC' }, { entityId: 'e1' })
  const second = addEntityToCampaign(first.campaign, { type: 'scene', name: 'Сцена' }, { entityId: 'e2' })
  return addRelationshipToCampaign(second.campaign, {
    sourceId: 'e1', targetId: 'e2', type: 'participates_in', directed: true,
  }, { relationshipId: 'r1' }).campaign
}

describe('архивирование и сохранение', () => {
  it('сохраняет архивированную связь', async () => {
    const repository = new ArchiveRepository()
    const result = await archiveAndSaveRelationship(repository, relatedCampaign(), 'r1')
    expect(repository.saved).toEqual(result.campaign)
    expect(result.relationship.status).toBe('archived')
  })

  it('сохраняет архивированную сущность вместе с зависимыми связями', async () => {
    const repository = new ArchiveRepository()
    const result = await archiveAndSaveEntity(repository, relatedCampaign(), 'e1')
    expect(repository.saved).toEqual(result.campaign)
    expect(result.entity.status).toBe('archived')
    expect(result.archivedRelationships).toHaveLength(1)
  })
})
