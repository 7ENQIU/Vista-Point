import type { Campaign, CampaignEvent, ScheduledWorldEvent } from './types'

export interface CreateScheduledWorldEventInput {
  title: string
  description?: string
  occursAt: string
  critical?: boolean
  relatedEntityIds?: string[]
}

export interface WorldTimePreview {
  from: string
  to: string
  dueEvents: ScheduledWorldEvent[]
}

interface WorldClockOptions {
  now?: Date
  eventId?: string
  scheduledEventId?: string
  triggeredEventIds?: string[]
}

function iso(value: string, message: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(message)
  return date.toISOString()
}

function unique(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function validateEntityIds(campaign: Campaign, ids: string[]) {
  const available = new Set(campaign.entities.filter((entity) => entity.status !== 'archived').map((entity) => entity.id))
  if (ids.some((id) => !available.has(id))) throw new Error('Одна или несколько связанных сущностей недоступны.')
}

export function previewWorldTimeChange(campaign: Campaign, targetWorldTime: string): WorldTimePreview {
  const from = iso(campaign.worldTime, 'Текущее мировое время повреждено.')
  const to = iso(targetWorldTime, 'Укажите корректные дату и время.')
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  const dueEvents = toMs > fromMs
    ? campaign.scheduledEvents
      .filter((event) => event.status === 'scheduled' && Date.parse(event.occursAt) > fromMs && Date.parse(event.occursAt) <= toMs)
      .sort((left, right) => Date.parse(left.occursAt) - Date.parse(right.occursAt))
    : []
  return { from, to, dueEvents }
}

export function createScheduledWorldEventInCampaign(
  campaign: Campaign,
  input: CreateScheduledWorldEventInput,
  options: WorldClockOptions = {},
): { campaign: Campaign; scheduledEvent: ScheduledWorldEvent; event: CampaignEvent } {
  const title = input.title.trim()
  if (!title) throw new Error('Название запланированного события обязательно.')
  const occursAt = iso(input.occursAt, 'Укажите корректные дату и время события.')
  if (Date.parse(occursAt) <= Date.parse(campaign.worldTime)) throw new Error('Событие должно происходить позже текущего мирового времени.')
  const relatedEntityIds = unique(input.relatedEntityIds ?? [])
  validateEntityIds(campaign, relatedEntityIds)
  const timestamp = (options.now ?? new Date()).toISOString()
  const scheduledEvent: ScheduledWorldEvent = {
    id: options.scheduledEventId ?? crypto.randomUUID(), campaignId: campaign.id, title,
    description: input.description?.trim() ?? '', occursAt, critical: input.critical ?? false,
    status: 'scheduled', relatedEntityIds, createdAt: timestamp, updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: campaign.activeSessionId,
    type: 'world.scheduled_event.created', occurredAt: timestamp, worldTime: campaign.worldTime,
    source: 'user', relatedEntityIds, reversible: true,
    payload: { scheduledEventId: scheduledEvent.id, title, occursAt, critical: scheduledEvent.critical },
  }
  return { scheduledEvent, event, campaign: { ...campaign, scheduledEvents: [...campaign.scheduledEvents, scheduledEvent], eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function cancelScheduledWorldEventInCampaign(
  campaign: Campaign,
  scheduledEventId: string,
  options: WorldClockOptions = {},
): { campaign: Campaign; scheduledEvent: ScheduledWorldEvent; event: CampaignEvent } {
  const current = campaign.scheduledEvents.find((item) => item.id === scheduledEventId)
  if (!current || current.status !== 'scheduled') throw new Error('Активное запланированное событие не найдено.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const scheduledEvent = { ...current, status: 'cancelled' as const, updatedAt: timestamp }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: campaign.activeSessionId,
    type: 'world.scheduled_event.cancelled', occurredAt: timestamp, worldTime: campaign.worldTime,
    source: 'user', relatedEntityIds: current.relatedEntityIds, reversible: true,
    payload: { scheduledEventId, title: current.title, occursAt: current.occursAt },
  }
  return { scheduledEvent, event, campaign: { ...campaign, scheduledEvents: campaign.scheduledEvents.map((item) => item.id === scheduledEventId ? scheduledEvent : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}

export function applyWorldTimeChangeInCampaign(
  campaign: Campaign,
  targetWorldTime: string,
  confirmed: boolean,
  options: WorldClockOptions = {},
): { campaign: Campaign; preview: WorldTimePreview; events: CampaignEvent[] } {
  const preview = previewWorldTimeChange(campaign, targetWorldTime)
  if (preview.to === preview.from) throw new Error('Новое мировое время совпадает с текущим.')
  if (!confirmed) throw new Error('Изменение мирового времени требует подтверждения мастера.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const timeEvent: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: campaign.activeSessionId,
    type: 'world.time.changed', occurredAt: timestamp, worldTime: preview.to, source: 'user',
    relatedEntityIds: unique(preview.dueEvents.flatMap((event) => event.relatedEntityIds)), reversible: true,
    payload: { before: preview.from, after: preview.to, triggeredScheduledEventIds: preview.dueEvents.map((event) => event.id) },
  }
  const triggeredEvents = preview.dueEvents.map((scheduled, index): CampaignEvent => ({
    id: options.triggeredEventIds?.[index] ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: campaign.activeSessionId,
    type: 'world.scheduled_event.triggered', occurredAt: timestamp, worldTime: scheduled.occursAt,
    source: 'system', relatedEntityIds: scheduled.relatedEntityIds, reversible: false,
    payload: { scheduledEventId: scheduled.id, title: scheduled.title, description: scheduled.description, critical: scheduled.critical },
  }))
  const dueIds = new Set(preview.dueEvents.map((event) => event.id))
  const scheduledEvents = campaign.scheduledEvents.map((event) => dueIds.has(event.id)
    ? { ...event, status: 'completed' as const, updatedAt: timestamp }
    : event)
  const events = [timeEvent, ...triggeredEvents]
  return { preview, events, campaign: { ...campaign, worldTime: preview.to, scheduledEvents, eventLog: [...campaign.eventLog, ...events], updatedAt: timestamp } }
}
