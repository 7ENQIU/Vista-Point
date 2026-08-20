import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { removeEntityStateFromCampaign, setEntityStateInCampaign } from './setEntityState'

function campaignWithEntity() {
  return addEntityToCampaign(
    createCampaign({ name: 'Кампания' }, new Date('2026-08-20T08:00:00.000Z'), 'campaign-1'),
    { type: 'npc', name: 'Серёга' },
    { entityId: 'entity-1' },
  ).campaign
}

describe('entity state', () => {
  it('создаёт типизированный параметр и обратимое событие', () => {
    const result = setEntityStateInCampaign(
      campaignWithEntity(),
      'entity-1',
      { name: ' Здоровье ', category: 'resource', valueType: 'integer', value: 24 },
      {
        now: new Date('2026-08-20T09:00:00.000Z'),
        stateId: 'state-1',
        eventId: 'event-state-created',
      },
    )

    expect(result.state).toEqual({
      id: 'state-1',
      name: 'Здоровье',
      category: 'resource',
      valueType: 'integer',
      value: 24,
      updatedAt: '2026-08-20T09:00:00.000Z',
    })
    expect(result.event).toMatchObject({
      type: 'entity.state.created',
      relatedEntityIds: ['entity-1'],
      reversible: true,
      payload: { before: null, after: result.state },
    })
  })

  it('обновляет существующий параметр без создания копии', () => {
    const created = setEntityStateInCampaign(
      campaignWithEntity(),
      'entity-1',
      { name: 'Настроение', category: 'social', valueType: 'text', value: 'Спокоен' },
      { stateId: 'state-1' },
    )
    const updated = setEntityStateInCampaign(
      created.campaign,
      'entity-1',
      {
        stateId: 'state-1',
        name: 'Настроение',
        category: 'social',
        valueType: 'text',
        value: 'Насторожен',
      },
      { eventId: 'event-state-updated' },
    )

    expect(updated.entity.state).toHaveLength(1)
    expect(updated.state?.value).toBe('Насторожен')
    expect(updated.event).toMatchObject({
      id: 'event-state-updated',
      type: 'entity.state.updated',
      payload: {
        before: expect.objectContaining({ value: 'Спокоен' }),
        after: expect.objectContaining({ value: 'Насторожен' }),
      },
    })
  })

  it('не создаёт событие без изменений и запрещает неверный тип значения', () => {
    const created = setEntityStateInCampaign(
      campaignWithEntity(),
      'entity-1',
      { name: 'Жив', category: 'life', valueType: 'boolean', value: true },
      { stateId: 'state-1' },
    )
    const unchanged = setEntityStateInCampaign(created.campaign, 'entity-1', {
      stateId: 'state-1',
      name: 'Жив',
      category: 'life',
      valueType: 'boolean',
      value: true,
    })

    expect(unchanged.changed).toBe(false)
    expect(unchanged.event).toBeUndefined()
    expect(() => setEntityStateInCampaign(campaignWithEntity(), 'entity-1', {
      name: 'Здоровье', category: 'resource', valueType: 'integer', value: 2.5,
    })).toThrow('Значение не соответствует выбранному типу состояния.')
  })

  it('удаляет параметр из текущего состояния, сохраняя его в событии', () => {
    const created = setEntityStateInCampaign(
      campaignWithEntity(),
      'entity-1',
      { name: 'Скрыт', category: 'story', valueType: 'boolean', value: true },
      { stateId: 'state-1' },
    )
    const removed = removeEntityStateFromCampaign(
      created.campaign,
      'entity-1',
      'state-1',
      { eventId: 'event-state-removed' },
    )

    expect(removed.entity.state).toEqual([])
    expect(removed.event).toMatchObject({
      type: 'entity.state.removed',
      payload: { before: expect.objectContaining({ id: 'state-1' }), after: null },
    })
  })
})
