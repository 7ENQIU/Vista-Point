import { describe, expect, it } from 'vitest'
import { createCampaign } from './createCampaign'
import { applyWorldTimeChangeInCampaign, cancelScheduledWorldEventInCampaign, createScheduledWorldEventInCampaign, previewWorldTimeChange } from './worldClock'

const now = new Date('2026-08-23T12:00:00.000Z')
function baseCampaign() { return { ...createCampaign({ name: 'Пурпе' }, now), worldTime: now.toISOString() } }

describe('World Clock', () => {
  it('создаёт и отменяет запланированное событие с журналом', () => {
    const created = createScheduledWorldEventInCampaign(baseCampaign(), { title: 'Прилив', occursAt: '2026-08-23T14:00:00.000Z', critical: true }, { now, scheduledEventId: 'scheduled-1', eventId: 'event-1' })
    expect(created.scheduledEvent).toMatchObject({ id: 'scheduled-1', status: 'scheduled', critical: true })
    const cancelled = cancelScheduledWorldEventInCampaign(created.campaign, 'scheduled-1', { now, eventId: 'event-2' })
    expect(cancelled.scheduledEvent.status).toBe('cancelled')
    expect(cancelled.event.type).toBe('world.scheduled_event.cancelled')
  })

  it('показывает события до изменения времени и применяет их только после подтверждения', () => {
    const prepared = createScheduledWorldEventInCampaign(baseCampaign(), { title: 'Прилив', occursAt: '2026-08-23T13:00:00.000Z', critical: true }, { now, scheduledEventId: 'scheduled-1' }).campaign
    expect(previewWorldTimeChange(prepared, '2026-08-23T14:00:00.000Z').dueEvents).toHaveLength(1)
    expect(() => applyWorldTimeChangeInCampaign(prepared, '2026-08-23T14:00:00.000Z', false)).toThrow('подтверждения')
    expect(prepared.worldTime).toBe(now.toISOString())

    const applied = applyWorldTimeChangeInCampaign(prepared, '2026-08-23T14:00:00.000Z', true, { now, eventId: 'clock', triggeredEventIds: ['trigger'] })
    expect(applied.campaign.worldTime).toBe('2026-08-23T14:00:00.000Z')
    expect(applied.campaign.scheduledEvents[0].status).toBe('completed')
    expect(applied.events.map((event) => event.type)).toEqual(['world.time.changed', 'world.scheduled_event.triggered'])
  })

  it('не запускает события при переводе времени назад', () => {
    const prepared = createScheduledWorldEventInCampaign(baseCampaign(), { title: 'Прилив', occursAt: '2026-08-23T13:00:00.000Z' }, { now }).campaign
    expect(previewWorldTimeChange(prepared, '2026-08-23T11:00:00.000Z').dueEvents).toEqual([])
  })
})
