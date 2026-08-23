import type { Campaign, CampaignEncounter, CampaignEvent, EncounterParticipant, EncounterSide } from './types'
import { setEntityStateInCampaign } from './setEntityState'

export interface StartEncounterInput { encounterEntityId: string; participantEntityIds: string[] }
export interface UpdateEncounterParticipantInput { participantId: string; side: EncounterSide; initiative: number; conditions: string[] }
interface EncounterOptions { now?: Date; encounterId?: string; eventId?: string; participantIds?: string[] }

function activeSession(campaign: Campaign) {
  const session = campaign.sessions.find((item) => item.id === campaign.activeSessionId && item.status === 'active')
  if (!session) throw new Error('Столкновение доступно только в активной сессии.')
  return session
}
function activeEncounter(campaign: Campaign) {
  const encounter = campaign.encounters.find((item) => item.id === campaign.activeEncounterId && item.status === 'active')
  if (!encounter) throw new Error('Активное столкновение не найдено.')
  return encounter
}
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))] }

export function startEncounterInCampaign(campaign: Campaign, input: StartEncounterInput, options: EncounterOptions = {}) {
  const session = activeSession(campaign)
  if (campaign.activeEncounterId) throw new Error('Сначала завершите текущее столкновение.')
  const encounterEntity = campaign.entities.find((entity) => entity.id === input.encounterEntityId && entity.type === 'encounter' && entity.status !== 'archived')
  if (!encounterEntity) throw new Error('Выберите активную сущность типа «Столкновение».')
  const entityIds = unique(input.participantEntityIds).filter((id) => id !== encounterEntity.id && id !== session.currentSceneId)
  if (entityIds.length < 2) throw new Error('Для столкновения нужны как минимум два участника.')
  const activeIds = new Set(campaign.entities.filter((entity) => entity.status !== 'archived').map((entity) => entity.id))
  if (entityIds.some((id) => !activeIds.has(id))) throw new Error('Один или несколько участников столкновения недоступны.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const participants: EncounterParticipant[] = entityIds.map((entityId, index) => ({ id: options.participantIds?.[index] ?? crypto.randomUUID(), entityId, side: 'neutral', initiative: 0, conditions: [] }))
  const encounter: CampaignEncounter = {
    id: options.encounterId ?? crypto.randomUUID(), campaignId: campaign.id, encounterEntityId: encounterEntity.id,
    sessionId: session.id, sceneId: session.currentSceneId, status: 'active', round: 1, currentTurnIndex: 0,
    participants, startedAt: timestamp, outcome: '',
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: session.id,
    type: 'encounter.started', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds: unique([encounterEntity.id, session.currentSceneId, ...entityIds]), reversible: true,
    payload: { encounterId: encounter.id, encounterEntityId: encounterEntity.id, encounterName: encounterEntity.name, participantEntityIds: entityIds },
  }
  return { encounter, event, campaign: { ...campaign, encounters: [...campaign.encounters, encounter], activeEncounterId: encounter.id, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function updateEncounterParticipantInCampaign(campaign: Campaign, input: UpdateEncounterParticipantInput, options: Pick<EncounterOptions, 'now' | 'eventId'> = {}) {
  const current = activeEncounter(campaign)
  const participant = current.participants.find((item) => item.id === input.participantId)
  if (!participant) throw new Error('Участник столкновения не найден.')
  if (!Number.isInteger(input.initiative) || Math.abs(input.initiative) > 100) throw new Error('Инициатива должна быть целым числом от −100 до 100.')
  const conditions = unique(input.conditions)
  const updated = { ...participant, side: input.side, initiative: input.initiative, conditions }
  const participants = current.participants.map((item) => item.id === participant.id ? updated : item)
    .sort((left, right) => right.initiative - left.initiative)
  const encounter = { ...current, participants, currentTurnIndex: 0 }
  const timestamp = (options.now ?? new Date()).toISOString()
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: current.sessionId,
    type: 'encounter.participant.updated', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds: [participant.entityId], reversible: true,
    payload: { encounterId: current.id, participantId: participant.id, before: participant, after: updated },
  }
  return { encounter, participant: updated, event, campaign: { ...campaign, encounters: campaign.encounters.map((item) => item.id === current.id ? encounter : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function advanceEncounterTurnInCampaign(campaign: Campaign, options: Pick<EncounterOptions, 'now' | 'eventId'> = {}) {
  const current = activeEncounter(campaign)
  if (!current.participants.length) throw new Error('В столкновении нет участников.')
  const nextIndex = (current.currentTurnIndex + 1) % current.participants.length
  const round = nextIndex === 0 ? current.round + 1 : current.round
  const encounter = { ...current, currentTurnIndex: nextIndex, round }
  const timestamp = (options.now ?? new Date()).toISOString()
  const activeParticipant = encounter.participants[nextIndex]
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: current.sessionId,
    type: 'encounter.turn.advanced', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds: [current.encounterEntityId, activeParticipant.entityId], reversible: true,
    payload: { encounterId: current.id, round, currentTurnIndex: nextIndex, activeEntityId: activeParticipant.entityId },
  }
  return { encounter, event, campaign: { ...campaign, encounters: campaign.encounters.map((item) => item.id === current.id ? encounter : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function completeEncounterInCampaign(campaign: Campaign, outcome: string, confirmed: boolean, options: Pick<EncounterOptions, 'now' | 'eventId'> = {}) {
  const current = activeEncounter(campaign)
  if (!confirmed) throw new Error('Завершение столкновения требует подтверждения мастера.')
  const normalizedOutcome = outcome.trim()
  if (!normalizedOutcome) throw new Error('Опишите исход столкновения.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const encounter: CampaignEncounter = { ...current, status: 'completed', endedAt: timestamp, outcome: normalizedOutcome }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: current.sessionId,
    type: 'encounter.completed', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds: unique([current.encounterEntityId, current.sceneId, ...current.participants.map((item) => item.entityId)]), reversible: true,
    payload: { encounterId: current.id, outcome: normalizedOutcome, rounds: current.round },
  }
  return { encounter, event, campaign: { ...campaign, encounters: campaign.encounters.map((item) => item.id === current.id ? encounter : item), activeEncounterId: undefined, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function setEncounterParticipantHpInCampaign(campaign: Campaign, participantId: string, hp: number, options: { now?: Date; stateId?: string; eventId?: string } = {}) {
  const encounter = activeEncounter(campaign)
  const participant = encounter.participants.find((item) => item.id === participantId)
  if (!participant) throw new Error('Участник столкновения не найден.')
  if (!Number.isInteger(hp)) throw new Error('HP должно быть целым числом.')
  const entity = campaign.entities.find((item) => item.id === participant.entityId)!
  const existing = entity.state.find((state) => state.name.toLocaleLowerCase('ru-RU') === 'hp')
  if (existing && existing.valueType !== 'integer') throw new Error('Существующий параметр HP должен иметь целочисленный тип.')
  return setEntityStateInCampaign(campaign, entity.id, { stateId: existing?.id, name: 'HP', category: 'life', valueType: 'integer', value: hp }, options)
}
