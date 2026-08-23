export const CAMPAIGN_WORKSPACE_VIEWS = ['session', 'campaign', 'graph', 'logic', 'history'] as const
export type CampaignWorkspaceView = (typeof CAMPAIGN_WORKSPACE_VIEWS)[number]

export function isCampaignWorkspaceView(value: unknown): value is CampaignWorkspaceView {
  return typeof value === 'string' && CAMPAIGN_WORKSPACE_VIEWS.includes(value as CampaignWorkspaceView)
}

export function resolveInitialCampaignWorkspaceView(activeSessionId?: string, stored?: string | null): CampaignWorkspaceView {
  if (activeSessionId) return 'session'
  return isCampaignWorkspaceView(stored) ? stored : 'campaign'
}
