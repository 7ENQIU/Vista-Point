import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { addSessionEventInCampaign, completeSessionInCampaign, startSessionInCampaign, updateSessionContextInCampaign } from './sessions'
import { archiveEntityInCampaign } from './archiveCampaignItem'

function preparedCampaign() {
  let campaign = createCampaign({ name: 'Сессии' }, new Date('2026-08-20T10:00:00.000Z'), 'campaign-1')
  for (const [id, type, name] of [['scene-1', 'scene', 'Пристань'], ['scene-2', 'scene', 'Маяк'], ['npc-1', 'npc', 'Серёга']] as const) {
    campaign = addEntityToCampaign(campaign, { type, name }, { entityId: id }).campaign
  }
  return campaign
}

describe('Campaign Session', () => {
  it('запускает одну активную сессию и не копирует участников', () => {
    const base = preparedCampaign()
    const result = startSessionInCampaign(base, { name: 'Встреча у моря', sceneId: 'scene-1', participantIds: ['npc-1'] }, { sessionId: 'session-1', eventId: 'start-event' })
    expect(result.session).toMatchObject({ id: 'session-1', number: 1, currentSceneId: 'scene-1', participantIds: ['npc-1'], status: 'active' })
    expect(result.event).toMatchObject({ type: 'session.started', sessionId: 'session-1' })
    expect(result.campaign.entities).toBe(base.entities)
    expect(() => startSessionInCampaign(result.campaign, { sceneId: 'scene-2', participantIds: [] })).toThrow('завершите текущую')
  })

  it('меняет сцену и участников с историей посещений', () => {
    const started = startSessionInCampaign(preparedCampaign(), { sceneId: 'scene-1', participantIds: [] }, { sessionId: 'session-1' }).campaign
    const result = updateSessionContextInCampaign(started, { sceneId: 'scene-2', participantIds: ['npc-1'] }, { eventId: 'context-event' })
    expect(result.session).toMatchObject({ currentSceneId: 'scene-2', participantIds: ['npc-1'], visitedSceneIds: ['scene-1', 'scene-2'] })
    expect(result.event?.type).toBe('session.context.updated')
  })

  it('добавляет ручное событие и завершает с редактируемой сводкой', () => {
    const started = startSessionInCampaign(preparedCampaign(), { sceneId: 'scene-1', participantIds: ['npc-1'] }, { sessionId: 'session-1' }).campaign
    const noted = addSessionEventInCampaign(started, { description: 'Партия нашла ключ.', relatedEntityIds: ['npc-1'] }, { eventId: 'note-event' })
    expect(noted.event).toMatchObject({ type: 'session.manual_event', reversible: false, relatedEntityIds: ['scene-1', 'npc-1'] })
    const completed = completeSessionInCampaign(noted.campaign, 'Ключ найден.', { eventId: 'finish-event' })
    expect(completed.session).toMatchObject({ status: 'completed', summary: 'Ключ найден.' })
    expect(completed.campaign.activeSessionId).toBeUndefined()
    expect(completed.event.type).toBe('session.completed')
  })

  it('отклоняет не-сцену и пустое ручное событие', () => {
    expect(() => startSessionInCampaign(preparedCampaign(), { sceneId: 'npc-1', participantIds: [] })).toThrow('типа «Сцена»')
    const started = startSessionInCampaign(preparedCampaign(), { sceneId: 'scene-1', participantIds: [] }).campaign
    expect(() => addSessionEventInCampaign(started, { description: '  ' })).toThrow('Описание события обязательно')
  })

  it('защищает текущую сцену от архивирования', () => {
    const started = startSessionInCampaign(preparedCampaign(), { sceneId: 'scene-1', participantIds: [] }).campaign
    expect(() => archiveEntityInCampaign(started, 'scene-1')).toThrow('Текущую сцену нельзя архивировать')
  })
})
