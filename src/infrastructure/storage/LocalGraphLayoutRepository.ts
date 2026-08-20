import type {
  CampaignGraphNodePositions,
  CampaignGraphView,
} from '../../application/campaigns/buildCampaignGraph'

interface KeyValueStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

interface StoredGraphLayout {
  version: 1
  campaignId: string
  view: CampaignGraphView
  positions: CampaignGraphNodePositions
  updatedAt: string
}

function storageKey(campaignId: string, view: CampaignGraphView): string {
  return `vista-point:graph-layout:${campaignId}:${view}`
}

function parsePositions(value: unknown): CampaignGraphNodePositions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(Object.entries(value).flatMap(([entityId, position]) => {
    if (!position || typeof position !== 'object' || Array.isArray(position)) return []
    const candidate = position as Record<string, unknown>
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return []
    return [[entityId, { x: candidate.x as number, y: candidate.y as number }]]
  }))
}

export class LocalGraphLayoutRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  load(campaignId: string, view: CampaignGraphView): CampaignGraphNodePositions {
    const raw = this.storage.getItem(storageKey(campaignId, view))
    if (!raw) return {}

    try {
      const parsed = JSON.parse(raw) as Partial<StoredGraphLayout>
      if (parsed.version !== 1 || parsed.campaignId !== campaignId || parsed.view !== view) return {}
      return parsePositions(parsed.positions)
    } catch {
      return {}
    }
  }

  save(
    campaignId: string,
    view: CampaignGraphView,
    positions: CampaignGraphNodePositions,
  ): void {
    const layout: StoredGraphLayout = {
      version: 1,
      campaignId,
      view,
      positions: parsePositions(positions),
      updatedAt: new Date().toISOString(),
    }
    this.storage.setItem(storageKey(campaignId, view), JSON.stringify(layout))
  }

  clear(campaignId: string, view: CampaignGraphView): void {
    this.storage.removeItem(storageKey(campaignId, view))
  }
}
