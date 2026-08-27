import { describe, expect, it } from 'vitest'
import type { CampaignEvent } from '../../domain/campaign/types'
import { selectVisibleHistoryEvents } from './selectVisibleHistoryEvents'

function event(id: string): CampaignEvent {
  return {
    id,
    campaignId: 'campaign-1',
    type: 'entity.updated',
    occurredAt: `2026-08-23T12:00:0${id}.000Z`,
    worldTime: '2026-08-23T12:00:00.000Z',
    source: 'user',
    relatedEntityIds: [],
    reversible: true,
    payload: {},
  }
}

describe('selectVisibleHistoryEvents', () => {
  const events = [event('1'), event('2'), event('3')]

  it('скрывает очищенные записи, но показывает новые', () => {
    expect(selectVisibleHistoryEvents(events, '2').map((item) => item.id)).toEqual(['3'])
  })

  it('не изменяет исходный журнал', () => {
    const result = selectVisibleHistoryEvents(events, '3')

    expect(result).toEqual([])
    expect(events.map((item) => item.id)).toEqual(['1', '2', '3'])
  })

  it('не скрывает записи по неизвестному курсору', () => {
    expect(selectVisibleHistoryEvents(events, 'missing')).toEqual(events)
  })
})
