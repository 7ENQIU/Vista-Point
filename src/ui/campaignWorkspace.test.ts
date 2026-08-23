import { describe, expect, it } from 'vitest'
import { resolveInitialCampaignWorkspaceView } from './campaignWorkspace'

describe('рабочие разделы кампании', () => {
  it('открывает активную сессию независимо от сохранённого раздела', () => {
    expect(resolveInitialCampaignWorkspaceView('session-1', 'graph')).toBe('session')
  })

  it('восстанавливает последний корректный раздел', () => {
    expect(resolveInitialCampaignWorkspaceView(undefined, 'history')).toBe('history')
  })

  it('по умолчанию открывает подготовку кампании', () => {
    expect(resolveInitialCampaignWorkspaceView(undefined, 'unknown')).toBe('campaign')
  })
})
