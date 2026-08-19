import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { createAndSaveCampaign } from '../application/campaigns/createAndSaveCampaign'
import { createAndSaveEntity } from '../application/campaigns/createAndSaveEntity'
import { createAndSaveRelationship } from '../application/campaigns/createAndSaveRelationship'
import { importCampaignFile } from '../application/campaigns/importCampaignFile'
import type { CampaignBackup, CampaignRepository } from '../application/ports/CampaignRepository'
import { parseCampaignFile } from '../domain/campaign/campaignFile'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type Campaign,
  type EntityType,
  type RelationshipType,
} from '../domain/campaign/types'
import { IndexedDbCampaignRepository } from '../infrastructure/storage/IndexedDbCampaignRepository'
import { ru } from '../shared/i18n/ru'
import { downloadCampaign } from './downloadCampaign'

function BrandHeader({ campaignName }: { campaignName?: string }) {
  return (
    <header className="app-topbar">
      <div className="brand">
        <img className="brand-logo" src="/vista-point-mark.svg" alt="" aria-hidden="true" />
        <span className="brand-name">Vista Point</span>
      </div>
      <div className="app-context" aria-label="Состояние приложения">
        {campaignName && <strong>{campaignName}</strong>}
        {campaignName && <span aria-hidden="true">·</span>}
        <span>Локально</span>
        <span aria-hidden="true">·</span>
        <span>Без сети</span>
      </div>
    </header>
  )
}

interface CampaignOverviewProps {
  campaign: Campaign
  repository: CampaignRepository
  onBack: () => void
  onCampaignChanged: (campaign: Campaign) => void
}

function CampaignOverview({ campaign, repository, onBack, onCampaignChanged }: CampaignOverviewProps) {
  const [backups, setBackups] = useState<CampaignBackup[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [entityType, setEntityType] = useState<EntityType>('location')
  const [entityName, setEntityName] = useState('')
  const [entitySummary, setEntitySummary] = useState('')
  const [isCreatingEntity, setIsCreatingEntity] = useState(false)
  const [relationshipSourceId, setRelationshipSourceId] = useState('')
  const [relationshipTargetId, setRelationshipTargetId] = useState('')
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('located_in')
  const [relationshipDescription, setRelationshipDescription] = useState('')
  const [relationshipDirected, setRelationshipDirected] = useState(true)
  const [isCreatingRelationship, setIsCreatingRelationship] = useState(false)
  const counters = [
    [ru.entities, campaign.entities.length],
    [ru.relationships, campaign.relationships.length],
    [ru.events, campaign.eventLog.length],
  ] as const

  useEffect(() => {
    repository.listBackups(campaign.id).then(setBackups).catch(() => setError(ru.storageError))
  }, [campaign.id, repository])

  async function restorePrevious() {
    const latest = backups[0]
    if (!latest || !window.confirm(ru.restoreConfirm)) return

    setError('')
    setMessage('')
    setIsRestoring(true)
    try {
      const restored = await repository.restoreBackup(latest.id)
      const refreshedBackups = await repository.listBackups(restored.id)
      setBackups(refreshedBackups)
      onCampaignChanged(restored)
      setMessage(ru.restoreSuccess)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsRestoring(false)
    }
  }

  async function handleEntitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsCreatingEntity(true)
    try {
      const result = await createAndSaveEntity(repository, campaign, {
        type: entityType,
        name: entityName,
        summary: entitySummary,
      })
      setEntityName('')
      setEntitySummary('')
      onCampaignChanged(result.campaign)
      setMessage(ru.entityCreated)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsCreatingEntity(false)
    }
  }

  async function handleRelationshipSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsCreatingRelationship(true)
    try {
      const result = await createAndSaveRelationship(repository, campaign, {
        sourceId: relationshipSourceId,
        targetId: relationshipTargetId,
        type: relationshipType,
        directed: relationshipDirected,
        description: relationshipDescription,
      })
      setRelationshipSourceId('')
      setRelationshipTargetId('')
      setRelationshipDescription('')
      onCampaignChanged(result.campaign)
      setMessage(ru.relationshipCreated)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsCreatingRelationship(false)
    }
  }

  const entityNames = new Map(campaign.entities.map((entity) => [entity.id, entity.name]))

  return (
    <div className="app-window">
      <BrandHeader campaignName={campaign.name} />
      <main className="app-main campaign-overview">
        <button className="text-button" onClick={onBack} type="button">
          ← {ru.back}
        </button>
        <section className="campaign-summary">
          <div>
            <p className="overline">{ru.overview}</p>
            <h1>{campaign.name}</h1>
            <p className="summary-text">{campaign.description || 'Описание пока не добавлено.'}</p>
          </div>
          <div className="campaign-actions">
            <button className="button button-secondary" onClick={() => downloadCampaign(campaign)} type="button">
              {ru.exportBackup}
            </button>
            <button
              className="button button-ghost"
              disabled={!backups.length || isRestoring}
              onClick={restorePrevious}
              type="button"
            >
              {isRestoring ? 'Восстанавливаем…' : ru.restorePrevious}
            </button>
          </div>
        </section>

        <p className="backup-count">{ru.localBackups}: {backups.length}</p>
        {message && <p className="feedback feedback-success" role="status">{message}</p>}
        {error && <p className="feedback feedback-error" role="alert">{error}</p>}

        <section className="metric-grid" aria-label="Состояние кампании">
          {counters.map(([label, value]) => (
            <article className="metric" key={label}>
              <span>{value}</span>
              <p>{label}</p>
            </article>
          ))}
          <article className="metric metric-wide">
            <span className="metric-date">{new Date(campaign.worldTime).toLocaleString('ru-RU')}</span>
            <p>{ru.worldTime}</p>
          </article>
        </section>

        <section className="entity-workspace" aria-labelledby="entities-heading">
          <div className="entity-list-panel">
            <div className="section-title entity-section-title">
              <div>
                <p className="overline">{ru.preparationMode}</p>
                <h2 id="entities-heading">{ru.entities}</h2>
              </div>
              <span aria-label={`${campaign.entities.length} сущностей`}>
                {campaign.entities.length}
              </span>
            </div>
            {campaign.entities.length === 0 ? (
              <p className="entity-empty">{ru.noEntities}</p>
            ) : (
              <div className="entity-list">
                {[...campaign.entities].reverse().map((entity) => (
                  <article className="entity-row" key={entity.id}>
                    <span className="entity-type-mark" aria-hidden="true" />
                    <div>
                      <div className="entity-row-heading">
                        <h3>{entity.name}</h3>
                        <span>{ru.draft}</span>
                      </div>
                      <p>{entity.summary || 'Короткая заметка не добавлена.'}</p>
                    </div>
                    <strong>{ru.entityTypes[entity.type]}</strong>
                  </article>
                ))}
              </div>
            )}
          </div>

          <form className="quick-create" onSubmit={handleEntitySubmit}>
            <p className="overline">{ru.quickCreate}</p>
            <h2>Новая сущность</h2>
            <label htmlFor="entity-type">{ru.entityType}</label>
            <select
              id="entity-type"
              onChange={(event) => setEntityType(event.target.value as EntityType)}
              value={entityType}
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>{ru.entityTypes[type]}</option>
              ))}
            </select>
            <label htmlFor="entity-name">{ru.entityName}</label>
            <input
              autoComplete="off"
              id="entity-name"
              onChange={(event) => setEntityName(event.target.value)}
              placeholder="Например, Маяк на мысе Эйр"
              value={entityName}
            />
            <label htmlFor="entity-summary">{ru.entitySummary}</label>
            <textarea
              id="entity-summary"
              onChange={(event) => setEntitySummary(event.target.value)}
              placeholder={ru.entitySummaryPlaceholder}
              rows={3}
              value={entitySummary}
            />
            <button className="button button-primary button-block" disabled={isCreatingEntity} type="submit">
              {isCreatingEntity ? 'Создаём…' : ru.createEntity}
            </button>
          </form>
        </section>

        <section className="relationship-workspace" aria-labelledby="relationships-heading">
          <div className="relationship-list-panel">
            <div className="section-title relationship-section-title">
              <div>
                <p className="overline">Структура кампании</p>
                <h2 id="relationships-heading">{ru.relationships}</h2>
              </div>
              <span aria-label={`${campaign.relationships.length} связей`}>
                {campaign.relationships.length}
              </span>
            </div>
            {campaign.relationships.length === 0 ? (
              <p className="relationship-empty">{ru.noRelationships}</p>
            ) : (
              <div className="relationship-list">
                {[...campaign.relationships].reverse().map((relationship) => (
                  <article className="relationship-row" key={relationship.id}>
                    <div className="relationship-route">
                      <strong>{entityNames.get(relationship.sourceId) ?? 'Неизвестная сущность'}</strong>
                      <span aria-label={relationship.directed ? 'направленная связь' : 'ненаправленная связь'}>
                        {relationship.directed ? '→' : '↔'}
                      </span>
                      <strong>{entityNames.get(relationship.targetId) ?? 'Неизвестная сущность'}</strong>
                    </div>
                    <div className="relationship-meta">
                      <span>{ru.relationshipTypes[relationship.type]}</span>
                      {relationship.description && <p>{relationship.description}</p>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <form className="relationship-create" onSubmit={handleRelationshipSubmit}>
            <p className="overline">{ru.relationshipBuilder}</p>
            <h2>Связать сущности</h2>
            {campaign.entities.length < 2 && (
              <p className="form-hint">{ru.relationshipNeedsEntities}</p>
            )}
            <label htmlFor="relationship-source">{ru.relationshipSource}</label>
            <select
              id="relationship-source"
              onChange={(event) => setRelationshipSourceId(event.target.value)}
              value={relationshipSourceId}
            >
              <option value="">{ru.selectEntity}</option>
              {campaign.entities.map((entity) => (
                <option disabled={entity.id === relationshipTargetId} key={entity.id} value={entity.id}>
                  {entity.name} · {ru.entityTypes[entity.type]}
                </option>
              ))}
            </select>
            <label htmlFor="relationship-type">{ru.relationshipType}</label>
            <select
              id="relationship-type"
              onChange={(event) => setRelationshipType(event.target.value as RelationshipType)}
              value={relationshipType}
            >
              {RELATIONSHIP_TYPES.map((type) => (
                <option key={type} value={type}>{ru.relationshipTypes[type]}</option>
              ))}
            </select>
            <label htmlFor="relationship-target">{ru.relationshipTarget}</label>
            <select
              id="relationship-target"
              onChange={(event) => setRelationshipTargetId(event.target.value)}
              value={relationshipTargetId}
            >
              <option value="">{ru.selectEntity}</option>
              {campaign.entities.map((entity) => (
                <option disabled={entity.id === relationshipSourceId} key={entity.id} value={entity.id}>
                  {entity.name} · {ru.entityTypes[entity.type]}
                </option>
              ))}
            </select>
            <label htmlFor="relationship-description">{ru.relationshipDescription}</label>
            <textarea
              id="relationship-description"
              onChange={(event) => setRelationshipDescription(event.target.value)}
              placeholder={ru.relationshipDescriptionPlaceholder}
              rows={3}
              value={relationshipDescription}
            />
            <label className="checkbox-field" htmlFor="relationship-directed">
              <input
                checked={relationshipDirected}
                id="relationship-directed"
                onChange={(event) => setRelationshipDirected(event.target.checked)}
                type="checkbox"
              />
              <span>{ru.relationshipDirected}</span>
            </label>
            <button
              className="button button-primary button-block"
              disabled={
                campaign.entities.length < 2 ||
                !relationshipSourceId ||
                !relationshipTargetId ||
                isCreatingRelationship
              }
              type="submit"
            >
              {isCreatingRelationship ? 'Создаём…' : ru.createRelationship}
            </button>
          </form>
        </section>
        <aside className="notice">{ru.skeletonNotice}</aside>
      </main>
    </div>
  )
}

function upsertCampaign(campaigns: Campaign[], campaign: Campaign): Campaign[] {
  return [campaign, ...campaigns.filter((item) => item.id !== campaign.id)]
}

export default function App() {
  const repository = useMemo<CampaignRepository>(() => new IndexedDbCampaignRepository(), [])
  const importInput = useRef<HTMLInputElement>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selected, setSelected] = useState<Campaign>()
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    repository
      .list()
      .then(setCampaigns)
      .catch(() => setError(ru.storageError))
      .finally(() => setIsLoading(false))
  }, [repository])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSaving(true)
    try {
      const campaign = await createAndSaveCampaign(repository, { name })
      setCampaigns((current) => upsertCampaign(current, campaign))
      setName('')
      setSelected(campaign)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setMessage('')
    setIsImporting(true)
    try {
      const source = await file.text()
      const preview = parseCampaignFile(source)
      const existing = await repository.getById(preview.id)
      if (existing && !window.confirm(ru.importConfirm)) return

      const result = await importCampaignFile(repository, source)
      setCampaigns((current) => upsertCampaign(current, result.campaign))
      setMessage(result.replaced ? ru.importReplaced : ru.importSuccess)
      setSelected(result.campaign)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsImporting(false)
    }
  }

  function handleCampaignChanged(campaign: Campaign) {
    setCampaigns((current) => upsertCampaign(current, campaign))
    setSelected(campaign)
  }

  if (selected) {
    return (
      <CampaignOverview
        campaign={selected}
        onBack={() => setSelected(undefined)}
        onCampaignChanged={handleCampaignChanged}
        repository={repository}
      />
    )
  }

  return (
    <div className="app-window">
      <BrandHeader />
      <main className="app-main">
        <section className="page-intro">
          <div>
            <p className="overline">Рабочее пространство мастера</p>
            <h1>Точка обзора</h1>
            <p>{ru.tagline}. Мир, связи и состояние кампании остаются под вашим контролем.</p>
          </div>
          <button
            className="button button-secondary"
            disabled={isImporting}
            onClick={() => importInput.current?.click()}
            type="button"
          >
            {isImporting ? ru.importing : ru.importCampaign}
          </button>
          <input
            ref={importInput}
            accept=".json,.vista-point.json,application/json"
            className="visually-hidden"
            onChange={handleImport}
            type="file"
          />
        </section>

        {message && <p className="feedback feedback-success" role="status">{message}</p>}
        {error && <p className="feedback feedback-error" role="alert">{error}</p>}

        <section className="content-grid">
          <div className="campaigns-section">
            <div className="section-title">
              <h2>{ru.campaigns}</h2>
              <span aria-label={`${campaigns.length} кампаний`}>{campaigns.length}</span>
            </div>
            {isLoading ? (
              <p className="muted">{ru.loading}</p>
            ) : campaigns.length === 0 ? (
              <div className="empty-state">
                <img src="/vista-point-mark.svg" alt="" aria-hidden="true" />
                <div>
                  <h3>{ru.emptyTitle}</h3>
                  <p>{ru.emptyText}</p>
                </div>
              </div>
            ) : (
              <div className="campaign-list">
                {campaigns.map((campaign) => (
                  <article className="campaign-card" key={campaign.id}>
                    <span className="campaign-indicator" aria-hidden="true" />
                    <div>
                      <h3>{campaign.name}</h3>
                      <p>Изменено {new Date(campaign.updatedAt).toLocaleString('ru-RU')}</p>
                    </div>
                    <button className="link-button" onClick={() => setSelected(campaign)} type="button">
                      {ru.open} →
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <form className="create-card" onSubmit={handleSubmit}>
            <p className="overline">{ru.newCampaign}</p>
            <h2>Начните новый мир</h2>
            <p className="form-intro">Достаточно названия — остальные детали можно добавить позже.</p>
            <label htmlFor="campaign-name">{ru.campaignName}</label>
            <input
              autoComplete="off"
              id="campaign-name"
              onChange={(event) => setName(event.target.value)}
              placeholder={ru.campaignPlaceholder}
              value={name}
            />
            <button className="button button-primary button-block" disabled={isSaving} type="submit">
              {isSaving ? ru.creating : ru.create}
            </button>
            <p className="privacy-note">Без аккаунта и отправки данных в сеть.</p>
          </form>
        </section>
      </main>
    </div>
  )
}
