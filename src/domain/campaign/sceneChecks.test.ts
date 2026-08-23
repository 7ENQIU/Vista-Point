import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { resolveSceneCheckInCampaign } from './sceneChecks'
import { startSessionInCampaign } from './sessions'

function activeCampaign() {
  const base = createCampaign({ name: 'Пурпе' })
  const withScene = addEntityToCampaign(base, { type: 'scene', name: 'Шторм' }, { entityId: 'scene-1' }).campaign
  return startSessionInCampaign(withScene, { sceneId: 'scene-1', participantIds: [] }, { sessionId: 'session-1' }).campaign
}

describe('быстрые проверки сцены', () => {
  it('локально бросает d20 и записывает результат в таймлайн сессии', () => {
    const result = resolveSceneCheckInCampaign(activeCampaign(), { name: 'Удержать штурвал', difficulty: 15, modifier: 3, mode: 'roll' }, { random: () => 0.6, eventId: 'check-1' })
    expect(result).toMatchObject({ total: 16, succeeded: true })
    expect(result.event).toMatchObject({ type: 'session.check.resolved', sessionId: 'session-1', payload: { roll: 13, total: 16, succeeded: true } })
  })

  it('принимает ручной итог и требует активную сессию', () => {
    expect(resolveSceneCheckInCampaign(activeCampaign(), { name: 'Убедить', difficulty: 12, modifier: 0, mode: 'manual', manualTotal: 9 }).succeeded).toBe(false)
    expect(() => resolveSceneCheckInCampaign(createCampaign({ name: 'Пурпе' }), { name: 'Проверка', difficulty: 10, modifier: 0, mode: 'roll' })).toThrow('активной сессии')
  })
})
