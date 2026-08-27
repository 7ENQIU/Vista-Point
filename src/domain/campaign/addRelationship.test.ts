import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { addRelationshipToCampaign } from './addRelationship'
import { archiveRelationshipInCampaign } from './archiveCampaignItem'
import { createCampaign } from './createCampaign'

function campaignWithTwoEntities() {
  const campaign = createCampaign({ name: 'Кампания' }, new Date('2026-08-19T18:00:00Z'), 'c1')
  const first = addEntityToCampaign(campaign, { type: 'npc', name: 'Смотритель' }, { entityId: 'e1', eventId: 'ev1' })
  return addEntityToCampaign(first.campaign, { type: 'location', name: 'Маяк' }, { entityId: 'e2', eventId: 'ev2' }).campaign
}

describe('addRelationshipToCampaign', () => {
  it('создаёт самостоятельную связь и событие', () => {
    const campaign = campaignWithTwoEntities()

    const result = addRelationshipToCampaign(
      campaign,
      { sourceId: 'e1', targetId: 'e2', type: 'located_in', directed: true, description: 'Живёт наверху' },
      { now: new Date('2026-08-19T20:00:00Z'), relationshipId: 'r1', eventId: 'ev3' },
    )

    expect(result.relationship).toMatchObject({
      id: 'r1', sourceId: 'e1', targetId: 'e2', type: 'located_in', directed: true,
      description: 'Живёт наверху', status: 'active',
    })
    expect(result.event).toMatchObject({
      id: 'ev3', type: 'relationship.created', relatedEntityIds: ['e1', 'e2'], reversible: true,
    })
    expect(result.campaign.relationships).toContainEqual(result.relationship)
    expect(campaign.relationships).toEqual([])
  })

  it('запрещает связь сущности с самой собой', () => {
    expect(() => addRelationshipToCampaign(campaignWithTwoEntities(), {
      sourceId: 'e1', targetId: 'e1', type: 'knows', directed: true,
    })).toThrow('должны быть разными')
  })

  it('не создаёт повторную ненаправленную связь в обратном порядке', () => {
    const first = addRelationshipToCampaign(campaignWithTwoEntities(), {
      sourceId: 'e1', targetId: 'e2', type: 'opposes', directed: false,
    })

    expect(() => addRelationshipToCampaign(first.campaign, {
      sourceId: 'e2', targetId: 'e1', type: 'opposes', directed: false,
    })).toThrow('уже существует')
  })

  it('разрешает заново создать ранее архивированную связь', () => {
    const first = addRelationshipToCampaign(campaignWithTwoEntities(), {
      sourceId: 'e1', targetId: 'e2', type: 'located_in', directed: true,
    }, { relationshipId: 'r1' })
    const archived = archiveRelationshipInCampaign(first.campaign, 'r1')

    const recreated = addRelationshipToCampaign(archived.campaign, {
      sourceId: 'e1', targetId: 'e2', type: 'located_in', directed: true,
    }, { relationshipId: 'r2' })

    expect(recreated.relationship.id).toBe('r2')
    expect(recreated.campaign.relationships).toHaveLength(2)
  })

  it('позволяет одной локации находиться в другой без числовых уровней', () => {
    let campaign = createCampaign({ name: 'Вложенность' })
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Регион' }, { entityId: 'region' }).campaign
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Город' }, { entityId: 'city' }).campaign

    expect(addRelationshipToCampaign(campaign, {
      sourceId: 'region', targetId: 'city', type: 'located_in', directed: true,
    }).relationship.type).toBe('located_in')
  })
})
