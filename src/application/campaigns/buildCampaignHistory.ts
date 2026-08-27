import type { CampaignEvent } from '../../domain/campaign/types'

export type HistoryEntryGroup = 'entity' | 'relationship' | 'state' | 'knowledge' | 'logic' | 'session' | 'world' | 'encounter' | 'history'
export type HistoryEntryStatus = 'applied' | 'undone' | 'recorded'

export interface HistoryEntry {
  id: string
  event: CampaignEvent
  eventId: string
  group: HistoryEntryGroup
  status: HistoryEntryStatus
  targetEventId?: string
}

export function campaignEventGroup(event: CampaignEvent): HistoryEntryGroup {
  if (event.type.startsWith('history.')) return 'history'
  if (event.type.startsWith('entity.state.')) return 'state'
  if (event.type.startsWith('knowledge.')) return 'knowledge'
  if (event.type.startsWith('logic.')) return 'logic'
  if (event.type.startsWith('session.')) return 'session'
  if (event.type.startsWith('world.')) return 'world'
  if (event.type.startsWith('encounter.')) return 'encounter'
  if (event.type.startsWith('relationship.') || event.type.startsWith('predicate.')) return 'relationship'
  return 'entity'
}

function targetEventId(event: CampaignEvent): string | undefined {
  return typeof event.payload.targetEventId === 'string' ? event.payload.targetEventId : undefined
}

export function buildCampaignHistoryEntries(events: CampaignEvent[]): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  const originalEntries = new Map<string, HistoryEntry>()

  for (const event of events) {
    const targetId = targetEventId(event)
    if (event.type === 'history.undo' && targetId) {
      const target = originalEntries.get(targetId)
      if (target) target.status = 'undone'
    } else if (event.type === 'history.redo' && targetId) {
      const target = originalEntries.get(targetId)
      if (target) target.status = 'applied'
    }

    const entry: HistoryEntry = {
      id: `history:${event.id}`,
      event,
      eventId: event.id,
      group: campaignEventGroup(event),
      status: event.type.startsWith('history.') ? 'recorded' : 'applied',
      targetEventId: targetId,
    }
    entries.push(entry)
    if (!event.type.startsWith('history.')) originalEntries.set(event.id, entry)
  }

  return entries
}

export function selectRecentHistoryEntries<T>(entries: T[], limit = 500): { entries: T[]; hiddenCount: number } {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Лимит истории должен быть положительным целым числом.')
  return {
    entries: entries.slice(0, limit),
    hiddenCount: Math.max(0, entries.length - limit),
  }
}
