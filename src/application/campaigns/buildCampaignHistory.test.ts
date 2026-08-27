import { describe, expect, it } from 'vitest'
import type { CampaignEvent } from '../../domain/campaign/types'
import { buildCampaignHistoryEntries, campaignEventGroup, selectRecentHistoryEntries } from './buildCampaignHistory'

function event(id: string, type: string, payload: Record<string, unknown> = {}): CampaignEvent {
  return {
    id, campaignId: 'c1', type, payload, occurredAt: `2026-08-26T10:00:0${id.length}.000Z`,
    worldTime: '2026-08-26T10:00:00.000Z', source: 'user', relatedEntityIds: [], reversible: true,
  }
}

describe('buildCampaignHistoryEntries', () => {
  it('показывает актуальный статус исходного действия после Undo и Redo', () => {
    const created = event('create', 'relationship.created')
    const undo = event('undo', 'history.undo', { targetEventId: 'create', targetEventType: created.type })
    const undone = buildCampaignHistoryEntries([created, undo])
    expect(undone[0]).toMatchObject({ eventId: 'create', status: 'undone', group: 'relationship' })
    expect(undone[1]).toMatchObject({ eventId: 'undo', status: 'recorded', targetEventId: 'create' })

    const redo = event('redo', 'history.redo', { targetEventId: 'create', targetEventType: created.type })
    expect(buildCampaignHistoryEntries([created, undo, redo])[0].status).toBe('applied')
  })

  it('относит предикаты к истории связей', () => {
    expect(campaignEventGroup(event('p', 'predicate.updated'))).toBe('relationship')
  })

  it('ограничивает только проекцию и сообщает число скрытых записей', () => {
    const entries = ['5', '4', '3', '2', '1']
    expect(selectRecentHistoryEntries(entries, 3)).toEqual({ entries: ['5', '4', '3'], hiddenCount: 2 })
    expect(entries).toHaveLength(5)
  })
})
