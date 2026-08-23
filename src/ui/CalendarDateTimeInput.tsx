import { useEffect, useState } from 'react'
import { customDateToWorldTime, worldTimeToCustomDate } from '../domain/campaign/calendar'
import type { CampaignCalendar } from '../domain/campaign/types'

interface CalendarDateTimeInputProps {
  calendar: CampaignCalendar
  id: string
  value: string
  onChange: (iso: string) => void
}

function localInput(iso: string) {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function CalendarDateTimeInput({ calendar, id, value, onChange }: CalendarDateTimeInputProps) {
  const [draft, setDraft] = useState(() => calendar.kind === 'custom' ? worldTimeToCustomDate(value, calendar) : undefined)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(calendar.kind === 'custom' ? worldTimeToCustomDate(value, calendar) : undefined); setError('') }, [calendar, value])
  if (calendar.kind === 'gregorian') return <input id={id} type="datetime-local" value={localInput(value)} onChange={(event) => onChange(new Date(event.target.value).toISOString())} />
  const customCalendar = calendar
  const current = draft ?? worldTimeToCustomDate(value, customCalendar)
  function update(next: typeof current) {
    setDraft(next)
    try { onChange(customDateToWorldTime(next, customCalendar)); setError('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Дата имеет неверный формат.') }
  }
  const month = customCalendar.months.find((item) => item.id === current.monthId) ?? customCalendar.months[0]
  return <div className="calendar-date-input" id={id}>
    <input aria-label="Год" type="number" value={current.year} onChange={(event) => update({ ...current, year: Number(event.target.value) })} />
    <select aria-label="Месяц" value={current.monthId} onChange={(event) => { const nextMonth = customCalendar.months.find((item) => item.id === event.target.value)!; update({ ...current, monthId: nextMonth.id, day: Math.min(current.day, nextMonth.days) }) }}>{customCalendar.months.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
    <input aria-label="День" type="number" min="1" max={month.days} value={current.day} onChange={(event) => update({ ...current, day: Number(event.target.value) })} />
    <input aria-label="Время" type="time" value={`${String(current.hour).padStart(2, '0')}:${String(current.minute).padStart(2, '0')}`} onChange={(event) => { const [hour, minute] = event.target.value.split(':').map(Number); update({ ...current, hour, minute }) }} />
    {error && <small className="form-inline-error" role="alert">{error}</small>}
  </div>
}
