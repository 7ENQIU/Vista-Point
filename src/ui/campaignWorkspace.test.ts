import { describe, expect, it } from 'vitest'
import { resolveInitialCampaignCanvasMode, resolveInitialCampaignWorkspaceView, toggleCampaignCanvasMode } from './campaignWorkspace'

describe('рабочие разделы кампании', () => {
  it('не перехватывает стартовый экран из-за старой активной сессии', () => {
    expect(resolveInitialCampaignWorkspaceView('session-1', 'graph')).toBe('graph')
  })

  it('восстанавливает последний корректный раздел', () => {
    expect(resolveInitialCampaignWorkspaceView(undefined, 'history')).toBe('history')
  })

  it('по умолчанию открывает граф знаний', () => {
    expect(resolveInitialCampaignWorkspaceView(undefined, 'unknown')).toBe('graph')
  })

  it('перенаправляет старые сохранённые разделы', () => {
    expect(resolveInitialCampaignWorkspaceView(undefined, 'campaign')).toBe('details')
    expect(resolveInitialCampaignWorkspaceView(undefined, 'logic')).toBe('graph')
  })

  it('хранит режим канваса отдельно от раздела кампании', () => {
    expect(resolveInitialCampaignCanvasMode('logic')).toBe('logic')
    expect(resolveInitialCampaignCanvasMode('graph')).toBe('knowledge')
  })

  it('переключает два режима канваса без изменения рабочего раздела', () => {
    expect(toggleCampaignCanvasMode('knowledge')).toBe('logic')
    expect(toggleCampaignCanvasMode('logic')).toBe('knowledge')
  })
})
