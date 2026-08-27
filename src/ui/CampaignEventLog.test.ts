import { describe, expect, it } from 'vitest'
import type { CampaignEvent } from '../domain/campaign/types'
import { describeCampaignEvent } from './CampaignEventLog'

function event(type: string, payload: Record<string, unknown>): CampaignEvent {
  return {
    id: 'event-1', campaignId: 'campaign-1', type,
    occurredAt: '2026-08-20T12:00:00.000Z', worldTime: '2026-08-20T10:00:00.000Z',
    source: 'user', relatedEntityIds: ['entity-1'], reversible: true, payload,
  }
}

describe('describeCampaignEvent', () => {
  it('объясняет изменение карточки перечислением полей', () => {
    expect(describeCampaignEvent(event('entity.updated', { changedFields: ['name', 'tags'] }))).toEqual({
      title: 'Карточка сущности обновлена', detail: 'Изменено: название, теги.',
    })
  })

  it('показывает прежнее и новое значение состояния', () => {
    expect(describeCampaignEvent(event('entity.state.updated', {
      stateName: 'Здоровье',
      before: { valueType: 'integer', value: 24 },
      after: { valueType: 'integer', value: 17 },
    }))).toEqual({ title: 'Состояние изменено', detail: 'Здоровье: 24 → 17.' })
  })

  it('показывает содержание удалённого знания из снимка события', () => {
    expect(describeCampaignEvent(event('knowledge.removed', {
      before: { content: 'Серёга видел маяк у старой пристани.' },
    }))).toEqual({
      title: 'Знание удалено', detail: 'Серёга видел маяк у старой пристани.',
    })
  })

  it('объясняет подтверждённое применение правила', () => {
    expect(describeCampaignEvent(event('logic.rule.applied', {
      ruleName: 'Серёга ранен', changes: [{}, {}],
    }))).toEqual({ title: 'Последствия правила применены', detail: 'Серёга ранен: изменений — 2.' })
  })

  it('показывает ручное событие сессии', () => {
    expect(describeCampaignEvent(event('session.manual_event', { description: 'Партия вошла в маяк.' }))).toEqual({
      title: 'Событие сессии', detail: 'Партия вошла в маяк.',
    })
  })

  it('показывает создание шаблона карточки', () => {
    expect(describeCampaignEvent(event('entity.template.created', { templateName: 'Разведчик' }))).toEqual({
      title: 'Шаблон карточки создан', detail: 'Разведчик',
    })
  })

  it('отдельно описывает Undo без сокрытия исходного события', () => {
    expect(describeCampaignEvent(event('history.undo', { targetEventId: 'fact-1', targetEventType: 'relationship.created' }))).toEqual({
      title: 'Действие отменено', detail: 'Исходное действие: создание факта. История сохранена без удаления записей.',
    })
  })
})
