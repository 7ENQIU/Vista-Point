import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Campaign, CampaignCalendar } from '../domain/campaign/types'
import { formatCampaignDateTime } from '../domain/campaign/calendar'
import { previewWorldTimeChange, type CreateScheduledWorldEventInput, type WorldTimePreview } from '../domain/campaign/worldClock'
import { ru } from '../shared/i18n/ru'
import { CalendarDateTimeInput } from './CalendarDateTimeInput'
import { CalendarEditor } from './CalendarEditor'

interface WorldClockPanelProps {
  campaign: Campaign
  isSaving: boolean
  onApplyTime: (target: string) => Promise<void>
  onCancelEvent: (id: string) => Promise<void>
  onCreateEvent: (input: CreateScheduledWorldEventInput) => Promise<void>
  onSetCalendar: (calendar: CampaignCalendar) => Promise<void>
}

export function WorldClockPanel({ campaign, isSaving, onApplyTime, onCancelEvent, onCreateEvent, onSetCalendar }: WorldClockPanelProps) {
  const [target, setTarget] = useState(campaign.worldTime)
  const [preview, setPreview] = useState<WorldTimePreview>()
  const [title, setTitle] = useState('')
  const [occursAt, setOccursAt] = useState(new Date(Date.parse(campaign.worldTime) + 3_600_000).toISOString())
  const [critical, setCritical] = useState(false)
  const [localError, setLocalError] = useState('')
  const upcoming = useMemo(() => campaign.scheduledEvents.filter((event) => event.status === 'scheduled').sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt)), [campaign.scheduledEvents])
  useEffect(() => {
    setTarget(campaign.worldTime)
    setOccursAt((current) => Date.parse(current) > Date.parse(campaign.worldTime) ? current : new Date(Date.parse(campaign.worldTime) + 3_600_000).toISOString())
  }, [campaign.worldTime])

  function prepare(value: string) {
    setLocalError('')
    try { const next = previewWorldTimeChange(campaign, value); setTarget(next.to); setPreview(next) }
    catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }
  function advance(minutes: number) { prepare(new Date(Date.parse(campaign.worldTime) + minutes * 60_000).toISOString()) }
  async function apply() {
    if (!preview) return
    setLocalError('')
    try { await onApplyTime(preview.to); setPreview(undefined); setTarget(preview.to) }
    catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setLocalError('')
    try { await onCreateEvent({ title, occursAt, critical }); setTitle(''); setCritical(false) }
    catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }
  async function cancelEvent(id: string) {
    if (!window.confirm(ru.cancelScheduledEventConfirm)) return
    setLocalError('')
    try { await onCancelEvent(id) }
    catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  return <section className="world-clock-section" aria-labelledby="world-clock-heading">
    <div className="world-clock-heading"><div><p className="overline">World Clock</p><h2 id="world-clock-heading">{ru.worldClock}</h2><p>{ru.worldClockHint}</p></div><strong>{formatCampaignDateTime(campaign.worldTime, campaign.calendar)}</strong></div>
    <CalendarEditor campaign={campaign} isSaving={isSaving} onSave={onSetCalendar} />
    {localError && <p className="form-inline-error" role="alert">{localError}</p>}
    <div className="world-clock-grid">
      <div className="world-time-controls"><h3>{ru.changeWorldTime}</h3><div className="world-time-quick"><button type="button" onClick={() => advance(15)}>+15 мин</button><button type="button" onClick={() => advance(60)}>+1 час</button><button type="button" onClick={() => advance(480)}>+8 часов</button><button type="button" onClick={() => advance(1440)}>+1 день</button></div><label htmlFor="world-time-target">{ru.targetWorldTime}</label><CalendarDateTimeInput id="world-time-target" calendar={campaign.calendar} value={target} onChange={setTarget} /><button className="button button-ghost" type="button" onClick={() => prepare(target)}>{ru.previewTimeChange}</button>
      {preview && <div className="world-time-preview"><h4>{ru.timeChangePreview}</h4><p>{formatCampaignDateTime(preview.from, campaign.calendar)} → {formatCampaignDateTime(preview.to, campaign.calendar)}</p>{preview.dueEvents.length ? <><p>{ru.eventsWillTrigger}: {preview.dueEvents.length}</p><ul>{preview.dueEvents.map((item) => <li key={item.id}><strong>{item.title}</strong>{item.critical && <span className="critical-badge">{ru.criticalEvent}</span>}<time>{formatCampaignDateTime(item.occursAt, campaign.calendar)}</time></li>)}</ul></> : <p>{ru.noEventsWillTrigger}</p>}<button className="button button-primary" disabled={isSaving} type="button" onClick={apply}>{ru.confirmTimeChange}</button><button className="button button-ghost" type="button" onClick={() => setPreview(undefined)}>{ru.cancel}</button></div>}</div>
      <form className="world-event-form" onSubmit={create}><h3>{ru.scheduleEvent}</h3><label htmlFor="world-event-title">{ru.eventTitle}</label><input id="world-event-title" value={title} onChange={(event) => setTitle(event.target.value)} /><label htmlFor="world-event-time">{ru.eventTime}</label><CalendarDateTimeInput id="world-event-time" calendar={campaign.calendar} value={occursAt} onChange={setOccursAt} /><label className="checkbox-field"><input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /><span>{ru.criticalEventHint}</span></label><button className="button button-primary" disabled={isSaving || !title.trim()}>{ru.addScheduledEvent}</button><h4>{ru.upcomingEvents}</h4>{upcoming.length ? <ol className="scheduled-event-list">{upcoming.map((item) => <li key={item.id}><span><strong>{item.title}</strong><time>{formatCampaignDateTime(item.occursAt, campaign.calendar)}</time></span><button type="button" aria-label={`Отменить событие «${item.title}»`} onClick={() => void cancelEvent(item.id)}>×</button></li>)}</ol> : <p>{ru.noUpcomingEvents}</p>}</form>
    </div>
  </section>
}
