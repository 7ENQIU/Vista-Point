import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { getImprovisationQueue, markImprovisedEntityProcessedInCampaign, quickCreateEntityInCampaign } from './improvisation'
import { startSessionInCampaign } from './sessions'

function activeCampaign() {
  const withScene = addEntityToCampaign(createCampaign({ name: 'Пурпе' }), { type: 'scene', name: 'Порт' }, { entityId: 'scene-1' }).campaign
  return startSessionInCampaign(withScene, { sceneId: 'scene-1', participantIds: [] }, { sessionId: 'session-1' }).campaign
}

describe('очередь импровизации', () => {
  it('сохраняет контекст Quick Create и позволяет отметить объект обработанным', () => {
    const created = quickCreateEntityInCampaign(activeCampaign(), { type: 'note', name: 'Слух о маяке', summary: 'Проверить после игры' }, { entityId: 'note-1', eventId: 'quick-1' })
    expect(created.entity.origin).toMatchObject({ mode: 'session_quick_create', processed: false, sessionId: 'session-1', sceneId: 'scene-1' })
    expect(created.event.type).toBe('entity.quick_created')
    expect(getImprovisationQueue(created.campaign)).toHaveLength(1)
    const processed = markImprovisedEntityProcessedInCampaign(created.campaign, 'note-1', { eventId: 'processed-1' })
    expect(processed.entity.origin.processed).toBe(true)
    expect(getImprovisationQueue(processed.campaign)).toEqual([])
  })

  it('требует активную сессию', () => {
    expect(() => quickCreateEntityInCampaign(createCampaign({ name: 'Пурпе' }), { type: 'npc', name: 'Макс' })).toThrow('активной сессии')
  })
})
