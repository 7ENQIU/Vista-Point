import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { advanceEncounterTurnInCampaign, completeEncounterInCampaign, setEncounterParticipantHpInCampaign, startEncounterInCampaign, updateEncounterParticipantInCampaign } from './encounters'
import { startSessionInCampaign } from './sessions'

function prepared() {
  let campaign = createCampaign({ name: 'Шторм' })
  for (const [id, type, name] of [['scene', 'scene', 'Палуба'], ['enc', 'encounter', 'Абордаж'], ['ally', 'npc', 'Серёга'], ['enemy', 'npc', 'Пират']] as const) campaign = addEntityToCampaign(campaign, { type, name }, { entityId: id }).campaign
  return startSessionInCampaign(campaign, { sceneId: 'scene', participantIds: ['ally', 'enemy'] }, { sessionId: 'session' }).campaign
}

describe('базовое столкновение', () => {
  it('запускает столкновение, сортирует инициативу и продвигает раунд', () => {
    const started = startEncounterInCampaign(prepared(), { encounterEntityId: 'enc', participantEntityIds: ['ally', 'enemy'] }, { encounterId: 'runtime', participantIds: ['p1', 'p2'] })
    const updated = updateEncounterParticipantInCampaign(started.campaign, { participantId: 'p2', side: 'opponents', initiative: 15, conditions: ['Скрыт'] })
    expect(updated.encounter.participants[0]).toMatchObject({ entityId: 'enemy', initiative: 15, side: 'opponents' })
    const turn1 = advanceEncounterTurnInCampaign(updated.campaign)
    const turn2 = advanceEncounterTurnInCampaign(turn1.campaign)
    expect(turn2.encounter.round).toBe(2)
  })

  it('меняет HP в единой сущности и фиксирует подтверждённый исход', () => {
    const started = startEncounterInCampaign(prepared(), { encounterEntityId: 'enc', participantEntityIds: ['ally', 'enemy'] }, { encounterId: 'runtime', participantIds: ['p1', 'p2'] })
    const hp = setEncounterParticipantHpInCampaign(started.campaign, 'p2', 7, { stateId: 'hp' })
    expect(hp.entity.state[0]).toMatchObject({ name: 'HP', value: 7 })
    expect(() => completeEncounterInCampaign(hp.campaign, 'Пираты отступили', false)).toThrow('подтверждения')
    const completed = completeEncounterInCampaign(hp.campaign, 'Пираты отступили', true)
    expect(completed.encounter).toMatchObject({ status: 'completed', outcome: 'Пираты отступили' })
    expect(completed.campaign.activeEncounterId).toBeUndefined()
  })
})
