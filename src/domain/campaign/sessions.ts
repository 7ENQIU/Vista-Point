import type { Campaign, CampaignEvent, CampaignSession } from './types'

export interface StartSessionInput {
  name?: string
  sceneId: string
  participantIds: string[]
}

export interface UpdateSessionContextInput {
  sceneId: string
  participantIds: string[]
}

export interface AddSessionEventInput {
  description: string
  relatedEntityIds?: string[]
}

interface SessionOptions { now?: Date; sessionId?: string; eventId?: string }

function unique(ids: string[]) { return [...new Set(ids.map((id) => id.trim()).filter(Boolean))] }

function activeEntityIds(campaign: Campaign) {
  return new Set(campaign.entities.filter((entity) => entity.status !== 'archived').map((entity) => entity.id))
}

function validateScene(campaign: Campaign, sceneId: string) {
  const scene = campaign.entities.find((entity) => entity.id === sceneId && entity.status !== 'archived')
  if (!scene || scene.type !== 'scene') throw new Error('Выберите активную сущность типа «Сцена».')
  return scene
}

function validateParticipants(campaign: Campaign, participantIds: string[]) {
  const ids = unique(participantIds)
  const available = activeEntityIds(campaign)
  if (ids.some((id) => !available.has(id))) throw new Error('Один или несколько участников сессии недоступны.')
  return ids
}

function getActiveSession(campaign: Campaign): CampaignSession {
  const session = campaign.sessions.find((item) => item.id === campaign.activeSessionId && item.status === 'active')
  if (!session) throw new Error('Активная сессия не найдена.')
  return session
}

export function startSessionInCampaign(
  campaign: Campaign,
  input: StartSessionInput,
  options: SessionOptions = {},
): { campaign: Campaign; session: CampaignSession; event: CampaignEvent } {
  if (campaign.activeSessionId) throw new Error('Сначала завершите текущую сессию.')
  validateScene(campaign, input.sceneId)
  const participantIds = validateParticipants(campaign, input.participantIds).filter((id) => id !== input.sceneId)
  const timestamp = (options.now ?? new Date()).toISOString()
  const number = Math.max(0, ...campaign.sessions.map((session) => session.number)) + 1
  const session: CampaignSession = {
    id: options.sessionId ?? crypto.randomUUID(), campaignId: campaign.id, number,
    name: input.name?.trim() || `Сессия ${number}`, status: 'active', currentSceneId: input.sceneId,
    participantIds, visitedSceneIds: [input.sceneId], startedAt: timestamp,
    worldTimeStart: campaign.worldTime, summary: '',
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: session.id,
    type: 'session.started', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds: unique([input.sceneId, ...participantIds]), reversible: true,
    payload: { sessionId: session.id, sessionName: session.name, sceneId: input.sceneId, participantIds },
  }
  return {
    session, event,
    campaign: { ...campaign, sessions: [...campaign.sessions, session], activeSessionId: session.id, eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}

export function updateSessionContextInCampaign(
  campaign: Campaign,
  input: UpdateSessionContextInput,
  options: Pick<SessionOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; session: CampaignSession; event?: CampaignEvent; changed: boolean } {
  const current = getActiveSession(campaign)
  validateScene(campaign, input.sceneId)
  const participantIds = validateParticipants(campaign, input.participantIds).filter((id) => id !== input.sceneId)
  if (current.currentSceneId === input.sceneId && JSON.stringify(current.participantIds) === JSON.stringify(participantIds)) {
    return { campaign, session: current, changed: false }
  }
  const timestamp = (options.now ?? new Date()).toISOString()
  const session: CampaignSession = {
    ...current, currentSceneId: input.sceneId, participantIds,
    visitedSceneIds: unique([...current.visitedSceneIds, input.sceneId]),
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: session.id,
    type: 'session.context.updated', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds: unique([input.sceneId, ...participantIds]), reversible: true,
    payload: { sessionId: session.id, before: { sceneId: current.currentSceneId, participantIds: current.participantIds }, after: { sceneId: input.sceneId, participantIds } },
  }
  return { session, event, changed: true, campaign: { ...campaign, sessions: campaign.sessions.map((item) => item.id === session.id ? session : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function addSessionEventInCampaign(
  campaign: Campaign,
  input: AddSessionEventInput,
  options: Pick<SessionOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; session: CampaignSession; event: CampaignEvent } {
  const session = getActiveSession(campaign)
  const description = input.description.trim()
  if (!description) throw new Error('Описание события обязательно.')
  const available = activeEntityIds(campaign)
  const relatedEntityIds = unique([session.currentSceneId, ...(input.relatedEntityIds ?? [])])
  if (relatedEntityIds.some((id) => !available.has(id))) throw new Error('Связанная сущность события недоступна.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: session.id,
    type: 'session.manual_event', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds, reversible: false, payload: { sessionId: session.id, description },
  }
  return { session, event, campaign: { ...campaign, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function completeSessionInCampaign(
  campaign: Campaign,
  summary: string,
  options: Pick<SessionOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; session: CampaignSession; event: CampaignEvent } {
  const current = getActiveSession(campaign)
  const timestamp = (options.now ?? new Date()).toISOString()
  const session: CampaignSession = {
    ...current, status: 'completed', endedAt: timestamp, worldTimeEnd: campaign.worldTime, summary: summary.trim(),
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: session.id,
    type: 'session.completed', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds: unique([session.currentSceneId, ...session.participantIds]), reversible: true,
    payload: { sessionId: session.id, sessionName: session.name, summary: session.summary, visitedSceneIds: session.visitedSceneIds },
  }
  return { session, event, campaign: { ...campaign, sessions: campaign.sessions.map((item) => item.id === session.id ? session : item), activeSessionId: undefined, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
