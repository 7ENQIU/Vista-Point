import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { IndexedDbCampaignRepository } from './IndexedDbCampaignRepository'

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('vista-point')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Тестовая база заблокирована.'))
  })
}

describe('IndexedDbCampaignRepository', () => {
  beforeEach(deleteTestDatabase)

  it('создаёт страховочную копию перед импортом и перед откатом', async () => {
    const repository = new IndexedDbCampaignRepository()
    const original = createCampaign(
      { name: 'Исходная версия' },
      new Date('2026-08-19T18:00:00.000Z'),
      'campaign-1',
    )
    await repository.save(original)

    const imported = {
      ...original,
      name: 'Импортированная версия',
      updatedAt: '2026-08-19T19:00:00.000Z',
    }
    const result = await repository.importCampaign(imported)
    const backupsAfterImport = await repository.listBackups(original.id)

    expect(result.replaced).toBe(true)
    expect(backupsAfterImport).toHaveLength(1)
    expect(backupsAfterImport[0].campaign.name).toBe('Исходная версия')

    const restored = await repository.restoreBackup(backupsAfterImport[0].id)
    const backupsAfterRestore = await repository.listBackups(original.id)

    expect(restored.name).toBe('Исходная версия')
    expect((await repository.getById(original.id))?.name).toBe('Исходная версия')
    expect(backupsAfterRestore).toHaveLength(2)
    expect(backupsAfterRestore.some((backup) => backup.campaign.name === 'Импортированная версия')).toBe(true)
  })

  it('мигрирует локальную кампанию v1 и сохраняет исходную страховочную копию', async () => {
    const current = addEntityToCampaign(
      createCampaign({ name: 'Старая локальная кампания' }),
      { type: 'npc', name: 'Серёга' },
    ).campaign
    const legacy = {
      ...current,
      schemaVersion: 1,
      entities: current.entities.map(({ state: _state, ...entity }) => entity),
    }

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vista-point', 2)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('campaigns', { keyPath: 'id' })
        const backups = request.result.createObjectStore('campaignBackups', { keyPath: 'id' })
        backups.createIndex('campaignId', 'campaignId', { unique: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('campaigns', 'readwrite')
      transaction.objectStore('campaigns').put(legacy)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()

    const repository = new IndexedDbCampaignRepository()
    const [migrated] = await repository.list()
    const backups = await repository.listBackups(current.id)

    expect(migrated.schemaVersion).toBe(11)
    expect(migrated.entities[0].state).toEqual([])
    expect(backups).toHaveLength(1)
    expect(backups[0].reason).toBe('before-migration')
    expect(backups[0].campaign.schemaVersion).toBe(11)
  })
})
