import type { CampaignEvent } from '../../domain/campaign/types'

export function selectVisibleHistoryEvents(
  events: CampaignEvent[],
  clearedThroughEventId?: string,
): CampaignEvent[] {
  if (!clearedThroughEventId) return events

  const cursorIndex = events.map((event) => event.id).lastIndexOf(clearedThroughEventId)
  return cursorIndex < 0 ? events : events.slice(cursorIndex + 1)
}
