import { describe, expect, it } from 'vitest'
import { buildCustomCalendar, customDateToWorldTime, formatCampaignDateTime, setCampaignCalendarInCampaign, worldTimeToCustomDate } from './calendar'
import { createCampaign } from './createCampaign'

function fixture() {
  const campaign = createCampaign({ name: 'Календарная кампания' }, new Date(2026, 7, 23, 15, 15), 'campaign-1')
  const calendar = buildCustomCalendar(campaign, {
    name: 'Календарь Туманного берега', eraLabel: '3Э',
    months: [{ id: 'first', name: 'Первый прилив', days: 30 }, { id: 'last', name: 'Последнее зерно', days: 31 }],
    weekdays: ['Первый день', 'Второй день', 'Третий день'], currentYear: 433, currentMonthId: 'last', currentDay: 27, currentWeekdayIndex: 1,
  })
  return { campaign, calendar }
}

describe('пользовательский календарь', () => {
  it('форматирует привязанное мировое время с эпохой, месяцем и днём недели', () => {
    const { campaign, calendar } = fixture()
    expect(formatCampaignDateTime(campaign.worldTime, calendar)).toBe('Второй день, 27 Последнее зерно 3Э 433, 15:15')
  })

  it('переходит через границу месяца и года без изменения внутренней шкалы', () => {
    const { campaign, calendar } = fixture()
    const monthEnd = customDateToWorldTime({ year: 433, monthId: 'last', day: 31, hour: 23, minute: 59 }, calendar)
    const next = worldTimeToCustomDate(new Date(Date.parse(monthEnd) + 60_000).toISOString(), calendar)
    expect(next).toMatchObject({ year: 434, monthId: 'first', day: 1, hour: 0, minute: 0 })
    expect(Date.parse(monthEnd)).toBeGreaterThan(Date.parse(campaign.worldTime))
  })

  it('преобразует пользовательскую дату в ISO и обратно без потери минуты', () => {
    const { calendar } = fixture()
    const value = { year: 435, monthId: 'first', day: 12, hour: 8, minute: 40 }
    expect(worldTimeToCustomDate(customDateToWorldTime(value, calendar), calendar)).toMatchObject(value)
  })

  it('не принимает пустые месяцы и невозможные даты', () => {
    const { campaign } = fixture()
    expect(() => buildCustomCalendar(campaign, { name: 'Пустой', months: [], weekdays: [], currentYear: 1, currentMonthId: '', currentDay: 1 })).toThrow('от 1 до 48')
    expect(() => buildCustomCalendar(campaign, { name: 'Короткий', months: [{ id: 'm', name: 'Месяц', days: 10 }], weekdays: [], currentYear: 1, currentMonthId: 'm', currentDay: 11 })).toThrow('от 1 до 10')
  })

  it('фиксирует смену календаря в журнале, не меняя мировое время', () => {
    const { campaign, calendar } = fixture()
    const result = setCampaignCalendarInCampaign(campaign, calendar, new Date('2026-08-23T11:00:00.000Z'), 'event-1')
    expect(result.campaign.worldTime).toBe(campaign.worldTime)
    expect(result.event).toMatchObject({ id: 'event-1', type: 'world.calendar.updated', reversible: true })
  })
})
