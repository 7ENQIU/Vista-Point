import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { addRelationshipToCampaign } from '../../domain/campaign/addRelationship'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { startSessionInCampaign } from '../../domain/campaign/sessions'
import { buildSessionView } from './buildSessionView'

describe('buildSessionView', () => {
  it('собирает DM Screen из единых сущностей и связей', () => {
    let campaign = createCampaign({ name: 'Сессия' })
    for (const [id, type, name] of [['scene', 'scene', 'Пристань'], ['location', 'location', 'Пурпе'], ['npc', 'npc', 'Серёга'], ['clue', 'clue', 'Ключ']] as const) {
      campaign = addEntityToCampaign(campaign, { type, name }, { entityId: id }).campaign
    }
    campaign = addRelationshipToCampaign(campaign, { sourceId: 'scene', targetId: 'location', type: 'located_in', directed: true }).campaign
    campaign = addRelationshipToCampaign(campaign, { sourceId: 'npc', targetId: 'scene', type: 'participates_in', directed: true }).campaign
    campaign = addRelationshipToCampaign(campaign, { sourceId: 'clue', targetId: 'scene', type: 'belongs_to', directed: true }).campaign
    campaign = startSessionInCampaign(campaign, { sceneId: 'scene', participantIds: [] }, { sessionId: 'session-1' }).campaign

    const view = buildSessionView(campaign)!
    expect(view.scene.name).toBe('Пристань')
    expect(view.location?.name).toBe('Пурпе')
    expect(view.participants.map((entity) => entity.name)).toEqual(['Серёга'])
    expect(view.relatedEntities.map((entity) => entity.name)).toEqual(['Ключ'])
    expect(view.timeline[0].type).toBe('session.started')
  })
})
