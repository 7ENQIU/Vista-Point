import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createLogicTestCampaign } from '../application/campaigns/createLogicTestCampaign'
import { buildEntityHistoryEntries, EntityHistoryPanel } from './EntityHistoryPanel'

describe('EntityHistoryPanel', () => {
  it('выбирает только события, связанные с текущей сущностью, в обратном хронологическом порядке', () => {
    const campaign = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))
    const history = buildEntityHistoryEntries(campaign, 'dev:anna')

    expect(history.length).toBeGreaterThan(0)
    expect(history.every((entry) => entry.event.relatedEntityIds.includes('dev:anna'))).toBe(true)
    expect(history.map((entry) => entry.event.id)).toEqual(
      campaign.eventLog.filter((event) => event.relatedEntityIds.includes('dev:anna')).map((event) => event.id).reverse(),
    )
  })

  it('показывает описания общего журнала без создания отдельной истории', () => {
    const campaign = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))
    const entity = campaign.entities.find((item) => item.id === 'dev:anna')!
    const html = renderToStaticMarkup(createElement(EntityHistoryPanel, {
      campaign,
      entity,
      onOpenEntity: () => undefined,
    }))

    expect(html).toContain('История сущности')
    expect(html).toContain('Сущность создана')
    expect(html).toContain('Параметр состояния добавлен')
    expect(html).toContain('Факт создан')
    expect(html).toContain('Действует')
  })
})
