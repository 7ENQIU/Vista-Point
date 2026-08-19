import type {
  CampaignBackup,
  CampaignRepository,
  ImportCampaignResult,
} from '../../application/ports/CampaignRepository'
import type { Campaign } from '../../domain/campaign/types'

const DATABASE_NAME = 'vista-point'
const DATABASE_VERSION = 2
const CAMPAIGNS_STORE = 'campaigns'
const BACKUPS_STORE = 'campaignBackups'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Ошибка локального хранилища.'))
  })
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Операция локального хранилища отменена.'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Ошибка локального хранилища.'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(CAMPAIGNS_STORE)) {
        database.createObjectStore(CAMPAIGNS_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(BACKUPS_STORE)) {
        const store = database.createObjectStore(BACKUPS_STORE, { keyPath: 'id' })
        store.createIndex('campaignId', 'campaignId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть локальную базу.'))
  })
}

function createBackup(campaign: Campaign, reason: CampaignBackup['reason']): CampaignBackup {
  return {
    id: crypto.randomUUID(),
    campaignId: campaign.id,
    createdAt: new Date().toISOString(),
    reason,
    campaign: structuredClone(campaign),
  }
}

export class IndexedDbCampaignRepository implements CampaignRepository {
  async list(): Promise<Campaign[]> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(CAMPAIGNS_STORE, 'readonly')
      const campaigns = await requestResult(
        transaction.objectStore(CAMPAIGNS_STORE).getAll() as IDBRequest<Campaign[]>,
      )
      return campaigns.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    } finally {
      database.close()
    }
  }

  async getById(id: string): Promise<Campaign | undefined> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(CAMPAIGNS_STORE, 'readonly')
      return await requestResult(
        transaction.objectStore(CAMPAIGNS_STORE).get(id) as IDBRequest<Campaign | undefined>,
      )
    } finally {
      database.close()
    }
  }

  async save(campaign: Campaign): Promise<void> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(CAMPAIGNS_STORE, 'readwrite')
      const completed = transactionResult(transaction)
      transaction.objectStore(CAMPAIGNS_STORE).put(campaign)
      await completed
    } finally {
      database.close()
    }
  }

  async importCampaign(campaign: Campaign): Promise<ImportCampaignResult> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction([CAMPAIGNS_STORE, BACKUPS_STORE], 'readwrite')
      const completed = transactionResult(transaction)
      const campaigns = transaction.objectStore(CAMPAIGNS_STORE)
      const existing = await requestResult(
        campaigns.get(campaign.id) as IDBRequest<Campaign | undefined>,
      )
      const backup = existing ? createBackup(existing, 'before-import') : undefined
      if (backup) transaction.objectStore(BACKUPS_STORE).put(backup)
      campaigns.put(campaign)
      await completed
      return { replaced: Boolean(existing), backupId: backup?.id }
    } finally {
      database.close()
    }
  }

  async listBackups(campaignId: string): Promise<CampaignBackup[]> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(BACKUPS_STORE, 'readonly')
      const index = transaction.objectStore(BACKUPS_STORE).index('campaignId')
      const backups = await requestResult(
        index.getAll(campaignId) as IDBRequest<CampaignBackup[]>,
      )
      return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    } finally {
      database.close()
    }
  }

  async restoreBackup(backupId: string): Promise<Campaign> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction([CAMPAIGNS_STORE, BACKUPS_STORE], 'readwrite')
      const completed = transactionResult(transaction)
      const backups = transaction.objectStore(BACKUPS_STORE)
      const campaigns = transaction.objectStore(CAMPAIGNS_STORE)
      const backup = await requestResult(
        backups.get(backupId) as IDBRequest<CampaignBackup | undefined>,
      )
      if (!backup) {
        transaction.abort()
        await completed.catch(() => undefined)
        throw new Error('Резервная копия не найдена.')
      }

      const current = await requestResult(
        campaigns.get(backup.campaignId) as IDBRequest<Campaign | undefined>,
      )
      if (current) backups.put(createBackup(current, 'before-restore'))
      campaigns.put(backup.campaign)
      await completed
      return structuredClone(backup.campaign)
    } finally {
      database.close()
    }
  }
}
