import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { quickCreateEntityInCampaign } from '../../domain/campaign/improvisation'
import { addSessionEventInCampaign, startSessionInCampaign } from '../../domain/campaign/sessions'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { buildPostSessionSummary } from './buildPostSessionSummary'

it('собирает редактируемый черновик сводки из событий и очереди', () => {
  const scene = addEntityToCampaign(createCampaign({ name: 'Пурпе' }), { type: 'scene', name: 'Пристань' }, { entityId: 'scene' }).campaign
  const session = startSessionInCampaign(scene, { sceneId: 'scene', participantIds: [] }, { sessionId: 'session' }).campaign
  const noted = addSessionEventInCampaign(session, { description: 'Найден ключ.' }).campaign
  const improvised = quickCreateEntityInCampaign(noted, { type: 'npc', name: 'Смотритель' }, { entityId: 'npc' }).campaign
  const summary = buildPostSessionSummary(improvised, 'session', new Date('2026-08-23T12:00:00.000Z'))
  expect(summary).toContain('Посещённые сцены: Пристань')
  expect(summary).toContain('- Найден ключ.')
  expect(summary).toContain('Требует обработки: Смотритель')
})
