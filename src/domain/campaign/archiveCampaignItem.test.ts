import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { addRelationshipToCampaign } from './addRelationship'
import { archiveEntityInCampaign, archiveRelationshipInCampaign } from './archiveCampaignItem'
import { createCampaign } from './createCampaign'

function relatedCampaign() {
  const empty = createCampaign({ name: 'Архив' }, new Date('2026-08-20T00:00:00Z'), 'c1')
  const first = addEntityToCampaign(empty, { type: 'npc', name: 'Серёга' }, { entityId: 'e1' })
  const second = addEntityToCampaign(first.campaign, { type: 'location', name: 'Маяк' }, { entityId: 'e2' })
  return addRelationshipToCampaign(second.campaign, {
    sourceId: 'e1', targetId: 'e2', type: 'located_in', directed: true,
  }, { relationshipId: 'r1' }).campaign
}

describe('архивирование элементов кампании', () => {
  it('архивирует связь и фиксирует событие, не удаляя исходные данные', () => {
    const result = archiveRelationshipInCampaign(relatedCampaign(), 'r1', {
      now: new Date('2026-08-20T01:00:00Z'), eventId: 'archive-r1',
    })

    expect(result.relationship.status).toBe('archived')
    expect(result.campaign.relationships).toHaveLength(1)
    expect(result.event).toMatchObject({
      id: 'archive-r1', type: 'relationship.archived', relatedEntityIds: ['e1', 'e2'], reversible: true,
    })
  })

  it('архивирует сущность и все её активные связи одной прослеживаемой операцией', () => {
    const result = archiveEntityInCampaign(relatedCampaign(), 'e1', {
      now: new Date('2026-08-20T01:00:00Z'), eventId: 'archive-e1',
    })

    expect(result.entity.status).toBe('archived')
    expect(result.archivedRelationships.map((item) => item.id)).toEqual(['r1'])
    expect(result.campaign.relationships[0].status).toBe('archived')
    expect(result.event.payload.archivedRelationshipIds).toEqual(['r1'])
    expect(result.campaign.entities).toHaveLength(2)
  })
})
