import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createLogicTestCampaign } from '../application/campaigns/createLogicTestCampaign'
import { EntityFullScreenCard } from './EntityFullScreenCard'

describe('EntityFullScreenCard', () => {
  it('показывает единый полноэкранный диалог с вкладками данных и состояния', () => {
    const campaign = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))
    const entity = campaign.entities.find((item) => item.name === 'Анна')!
    const html = renderToStaticMarkup(createElement(EntityFullScreenCard, {
      entity,
      historyCount: 4,
      isSaving: false,
      onRequestClose: () => undefined,
      onSelectView: () => undefined,
      relationshipCount: 2,
      view: 'details',
      children: createElement('p', null, 'Содержимое карточки'),
    }))

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('Полная карточка')
    expect(html).toContain('Анна')
    expect(html).toContain('Закрыть полную карточку')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('Состояние')
    expect(html).toContain('Связи')
    expect(html).toContain('История')
  })
})
