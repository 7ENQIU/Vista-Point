import { describe, expect, it, vi } from 'vitest'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { createCampaign } from '../../domain/campaign/createCampaign'
import type { CampaignRepository } from '../ports/CampaignRepository'
import { removeAndSaveKnowledge, setAndSaveKnowledge } from './saveKnowledge'

function repository(): CampaignRepository {
  return {
    getById: vi.fn(), importCampaign: vi.fn(), list: vi.fn(), listBackups: vi.fn(),
    restoreBackup: vi.fn(), save: vi.fn(),
  }
}

describe('knowledge application scenarios', () => {
  it('сохраняет создание и удаление знания', async () => {
    const repo = repository()
    const campaign = addEntityToCampaign(createCampaign({ name: 'Знания' }), {
      type: 'npc', name: 'Серёга',
    }, { entityId: 'e1' }).campaign
    const created = await setAndSaveKnowledge(repo, campaign, {
      subjectType: 'party', content: 'Факт', status: 'known', confidence: 90,
      truth: 'true', relatedEntityIds: ['e1'],
    })
    await removeAndSaveKnowledge(repo, created.campaign, created.knowledge.id)

    expect(repo.save).toHaveBeenCalledTimes(2)
  })
})
