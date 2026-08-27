import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createLogicTestCampaign } from '../application/campaigns/createLogicTestCampaign'
import { buildEntityRelationshipGroups, EntityRelationshipsPanel } from './EntityRelationshipsPanel'

describe('EntityRelationshipsPanel', () => {
  it('показывает прямые названия исходящих и обратные названия входящих фактов', () => {
    const campaign = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))

    const anna = buildEntityRelationshipGroups(campaign, 'dev:anna')
    expect(anna.outgoing.map((item) => item.label)).toEqual(['Находится в', 'Доверяет'])
    expect(anna.incoming).toEqual([])

    const tower = buildEntityRelationshipGroups(campaign, 'dev:tower')
    expect(tower.incoming.map((item) => `${item.label}: ${item.otherEntity.name}`)).toEqual([
      'Содержит: Анна',
      'Содержит: Хранилище',
    ])
  })

  it('рендерит связанные сущности и команды отмены фактов', () => {
    const campaign = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))
    const entity = campaign.entities.find((item) => item.id === 'dev:anna')!
    const html = renderToStaticMarkup(createElement(EntityRelationshipsPanel, {
      campaign,
      entity,
      isArchivingRelationshipId: '',
      onArchiveRelationship: async () => undefined,
      onOpenEntity: () => undefined,
    }))

    expect(html).toContain('Связи сущности')
    expect(html).toContain('Находится в')
    expect(html).toContain('Башня')
    expect(html).toContain('Доверяет')
    expect(html).toContain('Орден Семи ключей')
    expect(html.match(/Отменить факт/g)).toHaveLength(2)
  })
})
