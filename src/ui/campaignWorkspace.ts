export const CAMPAIGN_WORKSPACE_VIEWS = ['session', 'graph', 'history', 'details'] as const
export type CampaignWorkspaceView = (typeof CAMPAIGN_WORKSPACE_VIEWS)[number]
export type CampaignCanvasMode = 'knowledge' | 'logic'

export function isCampaignWorkspaceView(value: unknown): value is CampaignWorkspaceView {
  return typeof value === 'string' && CAMPAIGN_WORKSPACE_VIEWS.includes(value as CampaignWorkspaceView)
}

export function resolveInitialCampaignWorkspaceView(_activeSessionId?: string, stored?: string | null): CampaignWorkspaceView {
  if (stored === 'campaign') return 'details'
  if (stored === 'logic') return 'graph'
  return isCampaignWorkspaceView(stored) ? stored : 'graph'
}

export function resolveInitialCampaignCanvasMode(stored?: string | null): CampaignCanvasMode {
  return stored === 'logic' ? 'logic' : 'knowledge'
}

export function toggleCampaignCanvasMode(current: CampaignCanvasMode): CampaignCanvasMode {
  return current === 'knowledge' ? 'logic' : 'knowledge'
}
