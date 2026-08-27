export type CanvasViewportMode = 'knowledge' | 'logic'

export interface CanvasViewport {
  centerX: number
  centerY: number
  zoom: number
}

interface KeyValueStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

interface StoredCanvasViewport extends CanvasViewport {
  version: 1
  campaignId: string
  mode: CanvasViewportMode
  updatedAt: string
}

export const MIN_CANVAS_ZOOM = 0.5
export const MAX_CANVAS_ZOOM = 2

function storageKey(campaignId: string, mode: CanvasViewportMode): string {
  return `vista-point:canvas-viewport:${campaignId}:${mode}`
}

export function normalizeCanvasViewport(value: unknown): CanvasViewport | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (!Number.isFinite(candidate.centerX) || !Number.isFinite(candidate.centerY) || !Number.isFinite(candidate.zoom)) return undefined
  return {
    centerX: candidate.centerX as number,
    centerY: candidate.centerY as number,
    zoom: Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, candidate.zoom as number)),
  }
}

export class LocalCanvasViewportRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  load(campaignId: string, mode: CanvasViewportMode): CanvasViewport | undefined {
    const raw = this.storage.getItem(storageKey(campaignId, mode))
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw) as Partial<StoredCanvasViewport>
      if (parsed.version !== 1 || parsed.campaignId !== campaignId || parsed.mode !== mode) return undefined
      return normalizeCanvasViewport(parsed)
    } catch {
      return undefined
    }
  }

  save(campaignId: string, mode: CanvasViewportMode, viewport: CanvasViewport): void {
    const normalized = normalizeCanvasViewport(viewport)
    if (!normalized) throw new Error('Некорректное положение канваса.')
    const stored: StoredCanvasViewport = {
      version: 1, campaignId, mode, ...normalized, updatedAt: new Date().toISOString(),
    }
    this.storage.setItem(storageKey(campaignId, mode), JSON.stringify(stored))
  }

  clear(campaignId: string, mode: CanvasViewportMode): void {
    this.storage.removeItem(storageKey(campaignId, mode))
  }
}
