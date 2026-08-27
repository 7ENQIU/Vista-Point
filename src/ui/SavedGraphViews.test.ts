import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SavedGraphView } from '../domain/campaign/types'
import { SavedGraphViews } from './SavedGraphViews'

describe('SavedGraphViews', () => {
  it('объясняет границу раскладки и показывает сохранённый фильтр', () => {
    const view: SavedGraphView = {
      id: 'view', campaignId: 'campaign', name: 'Улики главы', query: 'печать', entityTypes: ['clue'], customEntityTypeIds: [],
      createdAt: '2026-08-27T10:00:00.000Z', updatedAt: '2026-08-27T10:00:00.000Z',
    }
    const html = renderToStaticMarkup(createElement(SavedGraphViews, {
      views: [view], isSaving: false,
      onApply: () => undefined, onCreate: async () => true, onRename: async () => true, onRemove: async () => undefined,
    }))

    expect(html).toContain('Сохранённые виды')
    expect(html).toContain('Улики главы')
    expect(html).toContain('Поиск: «печать»')
    expect(html).toContain('Раскладка карточек остаётся локальной')
  })

  it('безопасно переживает старое состояние открытой вкладки до миграции', () => {
    const html = renderToStaticMarkup(createElement(SavedGraphViews, {
      views: undefined as unknown as SavedGraphView[], isSaving: false,
      onApply: () => undefined, onCreate: async () => true, onRename: async () => true, onRemove: async () => undefined,
    }))

    expect(html).toContain('Сохранённых видов пока нет')
  })
})
