import type { CampaignGraphNodePosition, CampaignGraphView } from '../../application/campaigns/buildCampaignGraph'

interface KeyValueStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

export type CampaignGraphEdgeRoutes = Record<string, CampaignGraphNodePosition>

function storageKey(campaignId: string, view: CampaignGraphView): string {
  return `vista-point:graph-routes:${campaignId}:${view}`
}

export function normalizeGraphEdgeRoutes(value: unknown): CampaignGraphEdgeRoutes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([relationshipId, point]) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) return []
    const candidate = point as Record<string, unknown>
    return Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
      ? [[relationshipId, { x: candidate.x as number, y: candidate.y as number }]]
      : []
  }))
}

export class LocalGraphRouteRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  load(campaignId: string, view: CampaignGraphView): CampaignGraphEdgeRoutes {
    const raw = this.storage.getItem(storageKey(campaignId, view))
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; campaignId?: unknown; view?: unknown; routes?: unknown }
      return parsed.version === 1 && parsed.campaignId === campaignId && parsed.view === view
        ? normalizeGraphEdgeRoutes(parsed.routes)
        : {}
    } catch { return {} }
  }

  save(campaignId: string, view: CampaignGraphView, routes: CampaignGraphEdgeRoutes): void {
    this.storage.setItem(storageKey(campaignId, view), JSON.stringify({
      version: 1, campaignId, view, routes: normalizeGraphEdgeRoutes(routes), updatedAt: new Date().toISOString(),
    }))
  }

  clear(campaignId: string, view: CampaignGraphView): void {
    this.storage.removeItem(storageKey(campaignId, view))
  }
}
