interface KeyValueStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

interface StoredHistoryPreferences {
  version: 1
  campaignId: string
  clearedThroughEventId: string
  updatedAt: string
}

function storageKey(campaignId: string): string {
  return `vista-point:history-preferences:${campaignId}`
}

export class LocalHistoryPreferencesRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  loadClearedThroughEventId(campaignId: string): string | undefined {
    const raw = this.storage.getItem(storageKey(campaignId))
    if (!raw) return undefined

    try {
      const parsed = JSON.parse(raw) as Partial<StoredHistoryPreferences>
      if (
        parsed.version !== 1 ||
        parsed.campaignId !== campaignId ||
        typeof parsed.clearedThroughEventId !== 'string' ||
        !parsed.clearedThroughEventId
      ) return undefined
      return parsed.clearedThroughEventId
    } catch {
      return undefined
    }
  }

  clearThrough(campaignId: string, eventId: string): void {
    const preferences: StoredHistoryPreferences = {
      version: 1,
      campaignId,
      clearedThroughEventId: eventId,
      updatedAt: new Date().toISOString(),
    }
    this.storage.setItem(storageKey(campaignId), JSON.stringify(preferences))
  }

  restore(campaignId: string): void {
    this.storage.removeItem(storageKey(campaignId))
  }
}
