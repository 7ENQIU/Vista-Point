import type { Campaign, CampaignCalendar, CustomCampaignCalendar } from './types'

export interface CustomCalendarDateTime {
  year: number
  monthId: string
  day: number
  hour: number
  minute: number
  weekdayIndex: number
}

export interface SetCustomCalendarInput {
  name: string
  eraLabel?: string
  months: Array<{ id?: string; name: string; days: number }>
  weekdays: string[]
  currentYear: number
  currentMonthId: string
  currentDay: number
  currentWeekdayIndex?: number
}

const MINUTE_MS = 60_000

function floorDiv(value: number, divisor: number) { return Math.floor(value / divisor) }
function mod(value: number, divisor: number) { return ((value % divisor) + divisor) % divisor }
function daysPerYear(calendar: CustomCampaignCalendar) { return calendar.months.reduce((sum, month) => sum + month.days, 0) }

function dateOrdinal(calendar: CustomCampaignCalendar, year: number, monthId: string, day: number) {
  const monthIndex = calendar.months.findIndex((month) => month.id === monthId)
  if (monthIndex < 0) throw new Error('Выберите месяц из календаря.')
  const month = calendar.months[monthIndex]
  if (!Number.isInteger(year)) throw new Error('Год должен быть целым числом.')
  if (!Number.isInteger(day) || day < 1 || day > month.days) throw new Error(`В месяце «${month.name}» от 1 до ${month.days} дней.`)
  return (year - 1) * daysPerYear(calendar) + calendar.months.slice(0, monthIndex).reduce((sum, item) => sum + item.days, 0) + day - 1
}

function ordinalDate(calendar: CustomCampaignCalendar, ordinal: number) {
  const yearLength = daysPerYear(calendar)
  const year = floorDiv(ordinal, yearLength) + 1
  let dayOfYear = mod(ordinal, yearLength)
  const month = calendar.months.find((item) => {
    if (dayOfYear < item.days) return true
    dayOfYear -= item.days
    return false
  })!
  return { year, monthId: month.id, day: dayOfYear + 1 }
}

export function buildCustomCalendar(campaign: Campaign, input: SetCustomCalendarInput): CustomCampaignCalendar {
  const name = input.name.trim()
  if (!name) throw new Error('Укажите название календаря.')
  if (input.months.length < 1 || input.months.length > 48) throw new Error('Календарь должен содержать от 1 до 48 месяцев.')
  const months = input.months.map((month) => ({ id: month.id || crypto.randomUUID(), name: month.name.trim(), days: Number(month.days) }))
  if (months.some((month) => !month.name || !Number.isInteger(month.days) || month.days < 1 || month.days > 999)) throw new Error('У каждого месяца должны быть название и длина от 1 до 999 дней.')
  if (new Set(months.map((month) => month.id)).size !== months.length) throw new Error('Идентификаторы месяцев не должны повторяться.')
  const weekdays = input.weekdays.map((item) => item.trim()).filter(Boolean)
  if (weekdays.length > 32) throw new Error('Можно добавить не более 32 дней недели.')
  const date = new Date(campaign.worldTime)
  const calendar: CustomCampaignCalendar = {
    kind: 'custom', name, eraLabel: input.eraLabel?.trim() ?? '', months, weekdays,
    epochWorldTime: campaign.worldTime, epochYear: input.currentYear, epochMonthId: input.currentMonthId,
    epochDay: input.currentDay, epochHour: date.getHours(), epochMinute: date.getMinutes(),
    epochWeekdayIndex: weekdays.length ? mod(input.currentWeekdayIndex ?? 0, weekdays.length) : 0,
  }
  dateOrdinal(calendar, calendar.epochYear, calendar.epochMonthId, calendar.epochDay)
  return calendar
}

export function worldTimeToCustomDate(iso: string, calendar: CustomCampaignCalendar): CustomCalendarDateTime {
  const elapsedMinutes = Math.round((Date.parse(iso) - Date.parse(calendar.epochWorldTime)) / MINUTE_MS)
  if (!Number.isFinite(elapsedMinutes)) throw new Error('Мировое время имеет неверный формат.')
  const epochOrdinal = dateOrdinal(calendar, calendar.epochYear, calendar.epochMonthId, calendar.epochDay)
  const totalMinutes = epochOrdinal * 1440 + calendar.epochHour * 60 + calendar.epochMinute + elapsedMinutes
  const ordinal = floorDiv(totalMinutes, 1440)
  return { ...ordinalDate(calendar, ordinal), hour: floorDiv(mod(totalMinutes, 1440), 60), minute: mod(totalMinutes, 60), weekdayIndex: calendar.weekdays.length ? mod(calendar.epochWeekdayIndex + ordinal - epochOrdinal, calendar.weekdays.length) : 0 }
}

export function customDateToWorldTime(value: Omit<CustomCalendarDateTime, 'weekdayIndex'>, calendar: CustomCampaignCalendar) {
  if (!Number.isInteger(value.hour) || value.hour < 0 || value.hour > 23 || !Number.isInteger(value.minute) || value.minute < 0 || value.minute > 59) throw new Error('Укажите время от 00:00 до 23:59.')
  const targetMinutes = dateOrdinal(calendar, value.year, value.monthId, value.day) * 1440 + value.hour * 60 + value.minute
  const epochMinutes = dateOrdinal(calendar, calendar.epochYear, calendar.epochMonthId, calendar.epochDay) * 1440 + calendar.epochHour * 60 + calendar.epochMinute
  return new Date(Date.parse(calendar.epochWorldTime) + (targetMinutes - epochMinutes) * MINUTE_MS).toISOString()
}

export function formatCampaignDateTime(iso: string, calendar: CampaignCalendar) {
  if (calendar.kind === 'gregorian') return new Date(iso).toLocaleString('ru-RU')
  const value = worldTimeToCustomDate(iso, calendar)
  const month = calendar.months.find((item) => item.id === value.monthId)!
  const weekday = calendar.weekdays[value.weekdayIndex]
  return `${weekday ? `${weekday}, ` : ''}${value.day} ${month.name} ${calendar.eraLabel ? `${calendar.eraLabel} ` : ''}${value.year}, ${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`
}

export function setCampaignCalendarInCampaign(campaign: Campaign, calendar: CampaignCalendar, now = new Date(), eventId: string = crypto.randomUUID()) {
  const timestamp = now.toISOString()
  const event = { id: eventId, campaignId: campaign.id, type: 'world.calendar.updated', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user' as const, sessionId: campaign.activeSessionId, relatedEntityIds: [], reversible: true, payload: { before: campaign.calendar, after: calendar } }
  return { event, campaign: { ...campaign, calendar, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
