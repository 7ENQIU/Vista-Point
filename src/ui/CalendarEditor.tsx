import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { buildCustomCalendar, formatCampaignDateTime, worldTimeToCustomDate } from '../domain/campaign/calendar'
import type { Campaign, CampaignCalendar, CalendarMonth } from '../domain/campaign/types'

interface CalendarEditorProps { campaign: Campaign; isSaving: boolean; onSave: (calendar: CampaignCalendar) => Promise<void> }

function initialMonths(campaign: Campaign): CalendarMonth[] {
  return campaign.calendar.kind === 'custom' ? campaign.calendar.months : [{ id: crypto.randomUUID(), name: 'Первый месяц', days: 30 }]
}

export function CalendarEditor({ campaign, isSaving, onSave }: CalendarEditorProps) {
  const initialDate = campaign.calendar.kind === 'custom' ? worldTimeToCustomDate(campaign.worldTime, campaign.calendar) : undefined
  const seedMonths = useMemo(() => initialMonths(campaign), [])
  const [kind, setKind] = useState<CampaignCalendar['kind']>(campaign.calendar.kind)
  const [name, setName] = useState(campaign.calendar.name)
  const [eraLabel, setEraLabel] = useState(campaign.calendar.kind === 'custom' ? campaign.calendar.eraLabel : '')
  const [months, setMonths] = useState(seedMonths)
  const [weekdays, setWeekdays] = useState(campaign.calendar.kind === 'custom' ? campaign.calendar.weekdays.join(', ') : '')
  const [year, setYear] = useState(initialDate?.year ?? 1)
  const [monthId, setMonthId] = useState(initialDate?.monthId ?? seedMonths[0].id)
  const [day, setDay] = useState(initialDate?.day ?? 1)
  const [weekdayIndex, setWeekdayIndex] = useState(initialDate?.weekdayIndex ?? 0)
  const [error, setError] = useState('')
  const weekdayItems = useMemo(() => weekdays.split(',').map((item) => item.trim()).filter(Boolean), [weekdays])
  useEffect(() => {
    if (campaign.calendar.kind !== 'custom') return
    const current = worldTimeToCustomDate(campaign.worldTime, campaign.calendar)
    setYear(current.year); setMonthId(current.monthId); setDay(current.day); setWeekdayIndex(current.weekdayIndex)
  }, [campaign.worldTime, campaign.calendar])

  function updateMonth(id: string, patch: Partial<CalendarMonth>) { setMonths((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)) }
  function removeMonth(id: string) { setMonths((items) => { if (items.length === 1) return items; const next = items.filter((item) => item.id !== id); if (monthId === id) setMonthId(next[0].id); return next }) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    try {
      const calendar: CampaignCalendar = kind === 'gregorian'
        ? { kind: 'gregorian', name: name.trim() || 'Григорианский календарь' }
        : buildCustomCalendar(campaign, { name, eraLabel, months, weekdays: weekdayItems, currentYear: year, currentMonthId: monthId, currentDay: day, currentWeekdayIndex: weekdayIndex })
      if (!window.confirm('Сохранить календарь? Внутреннее мировое время и запланированные события останутся на своих местах, но будут показаны по новым правилам.')) return
      await onSave(calendar)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить календарь.') }
  }

  return <details className="calendar-editor">
    <summary><span>Календарь кампании</span><strong>{campaign.calendar.name}</strong></summary>
    <form onSubmit={submit}>
      <p>Настройте названия и длину месяцев. Текущая игровая дата станет точкой отсчёта, а история и расписание сохранятся.</p>
      {error && <p className="form-inline-error" role="alert">{error}</p>}
      <div className="calendar-editor-grid"><label>Тип<select value={kind} onChange={(event) => { const next = event.target.value as CampaignCalendar['kind']; setKind(next); if (next === 'gregorian') setName('Григорианский календарь') }}><option value="gregorian">Обычный календарь</option><option value="custom">Пользовательский календарь</option></select></label><label>Название<input value={name} onChange={(event) => setName(event.target.value)} /></label></div>
      {kind === 'custom' && <>
        <div className="calendar-editor-grid"><label>Обозначение эпохи<input value={eraLabel} placeholder="Например: 3Э" onChange={(event) => setEraLabel(event.target.value)} /></label><label>Дни недели через запятую<input value={weekdays} placeholder="Первый день, Второй день…" onChange={(event) => setWeekdays(event.target.value)} /></label></div>
        <h4>Месяцы</h4><div className="calendar-month-list">{months.map((month, index) => <div key={month.id}><span>{index + 1}</span><input aria-label={`Название месяца ${index + 1}`} value={month.name} onChange={(event) => updateMonth(month.id, { name: event.target.value })} /><input aria-label={`Дней в месяце ${index + 1}`} type="number" min="1" max="999" value={month.days} onChange={(event) => updateMonth(month.id, { days: Number(event.target.value) })} /><button type="button" aria-label={`Удалить месяц ${month.name}`} disabled={months.length === 1} onClick={() => removeMonth(month.id)}>×</button></div>)}</div>
        <button className="button button-ghost" type="button" onClick={() => { const added = { id: crypto.randomUUID(), name: `Месяц ${months.length + 1}`, days: 30 }; setMonths((items) => [...items, added]) }}>Добавить месяц</button>
        <h4>Текущая дата — точка отсчёта</h4><div className="calendar-anchor"><input aria-label="Текущий год" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /><select aria-label="Текущий месяц" value={monthId} onChange={(event) => setMonthId(event.target.value)}>{months.map((month) => <option key={month.id} value={month.id}>{month.name}</option>)}</select><input aria-label="Текущий день" type="number" min="1" max={months.find((month) => month.id === monthId)?.days ?? 1} value={day} onChange={(event) => setDay(Number(event.target.value))} />{weekdayItems.length > 0 && <select aria-label="Текущий день недели" value={weekdayIndex} onChange={(event) => setWeekdayIndex(Number(event.target.value))}>{weekdayItems.map((item, index) => <option key={`${item}-${index}`} value={index}>{item}</option>)}</select>}</div>
      </>}
      <div className="calendar-editor-actions"><span>Сейчас: {formatCampaignDateTime(campaign.worldTime, campaign.calendar)}</span><button className="button button-primary" disabled={isSaving}>Сохранить календарь</button></div>
    </form>
  </details>
}
