import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import {
  archiveAndSaveEntity,
  archiveAndSaveRelationship,
} from '../application/campaigns/archiveAndSaveCampaignItem'
import { createAndSaveCampaign } from '../application/campaigns/createAndSaveCampaign'
import { createAndSaveEntity } from '../application/campaigns/createAndSaveEntity'
import { createAndSaveRelationships } from '../application/campaigns/createAndSaveRelationship'
import { importCampaignFile } from '../application/campaigns/importCampaignFile'
import {
  removeAndSaveEntityState,
  setAndSaveEntityState,
} from '../application/campaigns/saveEntityState'
import { removeAndSaveKnowledge, setAndSaveKnowledge } from '../application/campaigns/saveKnowledge'
import { applyAndSaveLogicRule, removeAndSaveLogicRule, setAndSaveLogicRule } from '../application/campaigns/saveLogicRule'
import { addAndSaveSessionEvent, completeAndSaveSession, startAndSaveSession, updateAndSaveSessionContext } from '../application/campaigns/saveSession'
import { updateAndSaveEntity } from '../application/campaigns/updateAndSaveEntity'
import type { CampaignBackup, CampaignRepository } from '../application/ports/CampaignRepository'
import { parseCampaignFile } from '../domain/campaign/campaignFile'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type Campaign,
  type CampaignEntity,
  type EntityType,
  type RelationshipType,
  type Visibility,
} from '../domain/campaign/types'
import { IndexedDbCampaignRepository } from '../infrastructure/storage/IndexedDbCampaignRepository'
import { ru } from '../shared/i18n/ru'
import { CampaignGraph } from './CampaignGraph'
import { CampaignEventLog } from './CampaignEventLog'
import { downloadCampaign } from './downloadCampaign'
import { EntityEditor } from './EntityEditor'
import { EntityKnowledgeEditor } from './EntityKnowledgeEditor'
import { EntityStateEditor } from './EntityStateEditor'
import { groupRelationshipSources } from './groupRelationshipSources'
import { LogicRuleBuilder } from './LogicRuleBuilder'
import { SessionMode } from './SessionMode'
import {
  searchCampaignEntities,
  type SearchableEntityStatus,
} from './searchCampaignEntities'

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

type EntityPanelView = 'details' | 'state' | 'knowledge'

function CampaignOverview({ campaign, repository, onBack, onCampaignChanged }: CampaignOverviewProps) {
  const [backups, setBackups] = useState<CampaignBackup[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [entityType, setEntityType] = useState<EntityType>('location')
  const [entityName, setEntityName] = useState('')
  const [entitySummary, setEntitySummary] = useState('')
  const [isCreatingEntity, setIsCreatingEntity] = useState(false)
  const [editingEntityId, setEditingEntityId] = useState('')
  const [entityPanelView, setEntityPanelView] = useState<EntityPanelView>('details')
  const [isUpdatingEntity, setIsUpdatingEntity] = useState(false)
  const [isSavingEntityState, setIsSavingEntityState] = useState(false)
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false)
  const [isSavingLogic, setIsSavingLogic] = useState(false)
  const [isSavingSession, setIsSavingSession] = useState(false)
  const [campaignSearch, setCampaignSearch] = useState('')
  const [entityTypeFilters, setEntityTypeFilters] = useState<EntityType[]>([])
  const [entityStatusFilter, setEntityStatusFilter] = useState<'all' | SearchableEntityStatus>('all')
  const campaignSearchInput = useRef<HTMLInputElement>(null)
  const [relationshipSourceIds, setRelationshipSourceIds] = useState<string[]>([])
  const [relationshipSourceSearch, setRelationshipSourceSearch] = useState('')
  const [relationshipTargetId, setRelationshipTargetId] = useState('')
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('located_in')
  const [relationshipDescription, setRelationshipDescription] = useState('')
  const [relationshipDirected, setRelationshipDirected] = useState(true)
  const [relationshipVisibility, setRelationshipVisibility] = useState<Visibility>('game_master')
  const [isCreatingRelationship, setIsCreatingRelationship] = useState(false)
  const [archivingEntityId, setArchivingEntityId] = useState('')
  const [archivingRelationshipId, setArchivingRelationshipId] = useState('')
  const activeEntities = campaign.entities.filter((entity) => entity.status !== 'archived')
  const activeEntityIds = new Set(activeEntities.map((entity) => entity.id))
  const activeRelationships = campaign.relationships.filter((relationship) =>
    relationship.status !== 'archived' &&
    activeEntityIds.has(relationship.sourceId) &&
    activeEntityIds.has(relationship.targetId))
  const availableSourceEntities = activeEntities.filter(
    (entity) => entity.id !== relationshipTargetId,
  )
  const sourceGroups = groupRelationshipSources(availableSourceEntities, relationshipSourceSearch)
  const targetGroups = groupRelationshipSources(activeEntities, '')
  const visibleSourceCount = sourceGroups.reduce(
    (count, group) => count + group.entities.length,
    0,
  )
  const selectedSourceEntities = relationshipSourceIds.flatMap((id) => {
    const entity = activeEntities.find((item) => item.id === id)
    return entity ? [entity] : []
  })
  const editingEntity = activeEntities.find((entity) => entity.id === editingEntityId)
  const editingEntityKnowledge = editingEntity
    ? campaign.knowledge.filter((knowledge) => knowledge.relatedEntityIds.includes(editingEntity.id))
    : []
  const entitySearchGroups = useMemo(() => searchCampaignEntities(campaign.entities, {
    query: campaignSearch,
    types: entityTypeFilters,
    status: entityStatusFilter,
    knowledge: campaign.knowledge,
  }), [campaign.entities, campaign.knowledge, campaignSearch, entityStatusFilter, entityTypeFilters])
  const visibleEntities = useMemo(
    () => entitySearchGroups.flatMap((group) => group.results.map((result) => result.entity)),
    [entitySearchGroups],
  )
  const visibleEntityIds = useMemo(
    () => visibleEntities.map((entity) => entity.id),
    [visibleEntities],
  )
  const isEntitySearchFiltered = Boolean(
    campaignSearch.trim() || entityTypeFilters.length > 0 || entityStatusFilter !== 'all',
  )
  const counters = [
    [ru.entities, activeEntities.length],
    [ru.relationships, activeRelationships.length],
    [ru.knowledge, campaign.knowledge.length],
    [ru.logicRules, campaign.logicRules.length],
    [ru.sessions, campaign.sessions.length],
    [ru.events, campaign.eventLog.length],
  ] as const

  function openEntityPanel(entityId: string, view: EntityPanelView) {
    setEditingEntityId(entityId)
    setEntityPanelView(view)
  }

  function toggleEntityTypeFilter(type: EntityType) {
    setEntityTypeFilters((current) => current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type])
  }

  function resetEntitySearch() {
    setCampaignSearch('')
    setEntityTypeFilters([])
    setEntityStatusFilter('all')
  }

  useEffect(() => {
    repository.listBackups(campaign.id).then(setBackups).catch(() => setError(ru.storageError))
  }, [campaign.id, repository])

  useEffect(() => {
    function handleSearchShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        campaignSearchInput.current?.focus()
        campaignSearchInput.current?.select()
      } else if (event.key === 'Escape' && document.activeElement === campaignSearchInput.current) {
        setCampaignSearch('')
      }
    }

    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [])

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
      const result = await createAndSaveRelationships(
        repository,
        campaign,
        relationshipSourceIds.map((sourceId) => ({
          sourceId,
          targetId: relationshipTargetId,
          type: relationshipType,
          directed: relationshipDirected,
          description: relationshipDescription,
          visibility: relationshipVisibility,
        })),
      )
      setRelationshipSourceIds([])
      setRelationshipSourceSearch('')
      setRelationshipTargetId('')
      setRelationshipDescription('')
      onCampaignChanged(result.campaign)
      setMessage(
        result.relationships.length === 1
          ? ru.relationshipCreated
          : `Создано связей: ${result.relationships.length}. Каждая добавлена в журнал событий.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsCreatingRelationship(false)
    }
  }

  async function handleEntityUpdate(
    entity: CampaignEntity,
    input: Parameters<typeof updateAndSaveEntity>[3],
  ) {
    setError('')
    setMessage('')
    setIsUpdatingEntity(true)
    try {
      const result = await updateAndSaveEntity(repository, campaign, entity.id, input)
      if (result.changed) onCampaignChanged(result.campaign)
      setEditingEntityId('')
      setMessage(result.changed ? ru.entityUpdated : ru.entityUnchanged)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsUpdatingEntity(false)
    }
  }

  async function handleEntityStateSave(
    entity: CampaignEntity,
    input: Parameters<typeof setAndSaveEntityState>[3],
  ) {
    setError('')
    setMessage('')
    setIsSavingEntityState(true)
    try {
      const result = await setAndSaveEntityState(repository, campaign, entity.id, input)
      if (result.changed) onCampaignChanged(result.campaign)
      setMessage(result.changed ? ru.stateSaved : ru.entityUnchanged)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally {
      setIsSavingEntityState(false)
    }
  }

  async function handleEntityStateRemove(entity: CampaignEntity, stateId: string) {
    setError('')
    setMessage('')
    setIsSavingEntityState(true)
    try {
      const result = await removeAndSaveEntityState(repository, campaign, entity.id, stateId)
      onCampaignChanged(result.campaign)
      setMessage(ru.stateRemoved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally {
      setIsSavingEntityState(false)
    }
  }

  async function handleKnowledgeSave(input: Parameters<typeof setAndSaveKnowledge>[2]) {
    setError('')
    setMessage('')
    setIsSavingKnowledge(true)
    try {
      const result = await setAndSaveKnowledge(repository, campaign, input)
      if (result.changed) onCampaignChanged(result.campaign)
      setMessage(result.changed ? ru.knowledgeSaved : ru.knowledgeUnchanged)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally {
      setIsSavingKnowledge(false)
    }
  }

  async function handleKnowledgeRemove(knowledgeId: string) {
    setError('')
    setMessage('')
    setIsSavingKnowledge(true)
    try {
      const result = await removeAndSaveKnowledge(repository, campaign, knowledgeId)
      onCampaignChanged(result.campaign)
      setMessage(ru.knowledgeRemoved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally {
      setIsSavingKnowledge(false)
    }
  }

  async function handleLogicRuleSave(input: Parameters<typeof setAndSaveLogicRule>[2]) {
    setError(''); setMessage(''); setIsSavingLogic(true)
    try {
      const result = await setAndSaveLogicRule(repository, campaign, input)
      if (result.changed) onCampaignChanged(result.campaign)
      setMessage(result.changed ? ru.logicRuleSaved : ru.logicRuleUnchanged)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally { setIsSavingLogic(false) }
  }

  async function handleLogicRuleRemove(ruleId: string) {
    setError(''); setMessage(''); setIsSavingLogic(true)
    try {
      const result = await removeAndSaveLogicRule(repository, campaign, ruleId)
      onCampaignChanged(result.campaign); setMessage(ru.logicRuleRemoved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally { setIsSavingLogic(false) }
  }

  async function handleLogicRuleApply(ruleId: string) {
    setError(''); setMessage(''); setIsSavingLogic(true)
    try {
      const result = await applyAndSaveLogicRule(repository, campaign, ruleId)
      if (result.changed) onCampaignChanged(result.campaign)
      setMessage(result.changed ? ru.logicRuleApplied : ru.logicRuleNoChanges)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally { setIsSavingLogic(false) }
  }

  async function handleSessionStart(input: Parameters<typeof startAndSaveSession>[2]) {
    setError(''); setMessage(''); setIsSavingSession(true)
    try { const result = await startAndSaveSession(repository, campaign, input); onCampaignChanged(result.campaign); setMessage(ru.sessionStarted) }
    catch (caught) { setError(caught instanceof Error ? caught.message : ru.storageError); throw caught }
    finally { setIsSavingSession(false) }
  }

  async function handleSessionContext(input: Parameters<typeof updateAndSaveSessionContext>[2]) {
    setError(''); setMessage(''); setIsSavingSession(true)
    try { const result = await updateAndSaveSessionContext(repository, campaign, input); if (result.changed) onCampaignChanged(result.campaign); setMessage(result.changed ? ru.sessionContextSaved : ru.sessionContextUnchanged) }
    catch (caught) { setError(caught instanceof Error ? caught.message : ru.storageError); throw caught }
    finally { setIsSavingSession(false) }
  }

  async function handleSessionEvent(input: Parameters<typeof addAndSaveSessionEvent>[2]) {
    setError(''); setMessage(''); setIsSavingSession(true)
    try { const result = await addAndSaveSessionEvent(repository, campaign, input); onCampaignChanged(result.campaign); setMessage(ru.sessionEventSaved) }
    catch (caught) { setError(caught instanceof Error ? caught.message : ru.storageError); throw caught }
    finally { setIsSavingSession(false) }
  }

  async function handleSessionComplete(summary: string) {
    setError(''); setMessage(''); setIsSavingSession(true)
    try { const result = await completeAndSaveSession(repository, campaign, summary); onCampaignChanged(result.campaign); setMessage(ru.sessionCompleted) }
    catch (caught) { setError(caught instanceof Error ? caught.message : ru.storageError); throw caught }
    finally { setIsSavingSession(false) }
  }

  async function handleArchiveRelationship(relationshipId: string) {
    const relationship = activeRelationships.find((item) => item.id === relationshipId)
    if (!relationship || !window.confirm(ru.deleteRelationshipConfirm)) return

    setError('')
    setMessage('')
    setArchivingRelationshipId(relationshipId)
    try {
      const result = await archiveAndSaveRelationship(repository, campaign, relationshipId)
      onCampaignChanged(result.campaign)
      setMessage(ru.relationshipDeleted)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setArchivingRelationshipId('')
    }
  }

  async function handleArchiveEntity(entityId: string) {
    const entity = activeEntities.find((item) => item.id === entityId)
    if (!entity) return
    const relationshipCount = activeRelationships.filter(
      (relationship) => relationship.sourceId === entityId || relationship.targetId === entityId,
    ).length
    const confirmation = relationshipCount > 0
      ? `Удалить «${entity.name}» из рабочих представлений? Вместе с сущностью будут убраны связанные отношения: ${relationshipCount}. Данные сохранятся в архиве кампании.`
      : `Удалить «${entity.name}» из рабочих представлений? Данные сохранятся в архиве кампании.`
    if (!window.confirm(confirmation)) return

    setError('')
    setMessage('')
    setArchivingEntityId(entityId)
    try {
      const result = await archiveAndSaveEntity(repository, campaign, entityId)
      if (editingEntityId === entityId) setEditingEntityId('')
      setRelationshipSourceIds((current) => current.filter((id) => id !== entityId))
      if (relationshipTargetId === entityId) setRelationshipTargetId('')
      onCampaignChanged(result.campaign)
      setMessage(
        result.archivedRelationships.length > 0
          ? `Сущность удалена из рабочих представлений. Связей перенесено в архив: ${result.archivedRelationships.length}.`
          : ru.entityDeleted,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setArchivingEntityId('')
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

        <SessionMode
          campaign={campaign}
          isSaving={isSavingSession}
          onAddEvent={handleSessionEvent}
          onComplete={handleSessionComplete}
          onOpenEntity={(entityId) => openEntityPanel(entityId, 'details')}
          onStart={handleSessionStart}
          onUpdateContext={handleSessionContext}
        />

        <section className="campaign-search-panel" aria-labelledby="campaign-search-heading">
          <div className="campaign-search-heading">
            <div>
              <p className="overline">{ru.quickNavigation}</p>
              <h2 id="campaign-search-heading">{ru.campaignSearch}</h2>
              <p>{ru.campaignSearchHint}</p>
            </div>
            <span aria-live="polite">{visibleEntities.length} / {activeEntities.length}</span>
          </div>
          <div className="campaign-search-input">
            <input
              aria-label={ru.campaignSearch}
              autoComplete="off"
              onChange={(event) => setCampaignSearch(event.target.value)}
              placeholder={ru.campaignSearchPlaceholder}
              ref={campaignSearchInput}
              type="search"
              value={campaignSearch}
            />
            <kbd>Ctrl K</kbd>
            {campaignSearch && (
              <button aria-label={ru.clearSearch} onClick={() => setCampaignSearch('')} type="button">×</button>
            )}
          </div>
          <div className="campaign-filter-row" aria-label={ru.entityTypeFilter}>
            <span>{ru.entityTypeFilter}</span>
            <button
              aria-pressed={entityTypeFilters.length === 0}
              className={entityTypeFilters.length === 0 ? 'is-active' : ''}
              onClick={() => setEntityTypeFilters([])}
              type="button"
            >
              {ru.allTypes}
            </button>
            {ENTITY_TYPES.map((type) => (
              <button
                aria-pressed={entityTypeFilters.includes(type)}
                className={entityTypeFilters.includes(type) ? 'is-active' : ''}
                key={type}
                onClick={() => toggleEntityTypeFilter(type)}
                type="button"
              >
                {ru.entityTypes[type]}
              </button>
            ))}
          </div>
          <div className="campaign-filter-row" aria-label={ru.entityStatusFilter}>
            <span>{ru.entityStatusFilter}</span>
            {(['all', 'draft', 'active'] as const).map((status) => (
              <button
                aria-pressed={entityStatusFilter === status}
                className={entityStatusFilter === status ? 'is-active' : ''}
                key={status}
                onClick={() => setEntityStatusFilter(status)}
                type="button"
              >
                {status === 'all' ? ru.allStatuses : ru.lifecycleStatuses[status]}
              </button>
            ))}
            {isEntitySearchFiltered && (
              <button className="campaign-filter-reset" onClick={resetEntitySearch} type="button">
                {ru.resetFilters}
              </button>
            )}
          </div>
        </section>

        <section className="entity-workspace" aria-labelledby="entities-heading">
          <div className="entity-list-panel">
            <div className="section-title entity-section-title">
              <div>
                <p className="overline">{ru.preparationMode}</p>
                <h2 id="entities-heading">{ru.entities}</h2>
              </div>
              <span aria-label={`${visibleEntities.length} из ${activeEntities.length} сущностей`}>
                {visibleEntities.length}
              </span>
            </div>
            {activeEntities.length === 0 ? (
              <p className="entity-empty">{ru.noEntities}</p>
            ) : visibleEntities.length === 0 ? (
              <div className="entity-empty entity-filter-empty">
                <p>{ru.noSearchResults}</p>
                <button className="link-button" onClick={resetEntitySearch} type="button">{ru.resetFilters}</button>
              </div>
            ) : (
              <div className="entity-result-groups">
                {entitySearchGroups.map((group) => (
                  <section className="entity-result-group" key={group.type}>
                    <div className="entity-result-group-heading">
                      <h3>{ru.entityTypes[group.type]}</h3>
                      <span>{group.results.length}</span>
                    </div>
                    <div className="entity-list">
                    {group.results.map(({ entity, match }) => (
                  <article className="entity-row" key={entity.id}>
                    <span className="entity-type-mark" aria-hidden="true" />
                    <div>
                      <div className="entity-row-heading">
                        <h3>{entity.name}</h3>
                        <span>{ru.lifecycleStatuses[entity.status]}</span>
                      </div>
                      <p>{entity.summary || 'Короткая заметка не добавлена.'}</p>
                      {match && (
                        <p className="entity-search-match">
                          <span>{ru.searchFields[match.field]}</span>
                          {match.value}
                        </p>
                      )}
                    </div>
                    <strong>{ru.entityTypes[entity.type]}</strong>
                    <div className="entity-row-actions">
                      <button
                        className="link-button"
                        onClick={() => openEntityPanel(entity.id, 'details')}
                        type="button"
                      >
                        {ru.edit}
                      </button>
                      <button
                        className="link-button"
                        onClick={() => openEntityPanel(entity.id, 'state')}
                        type="button"
                      >
                        {ru.state}
                      </button>
                      <button
                        className="link-button"
                        onClick={() => openEntityPanel(entity.id, 'knowledge')}
                        type="button"
                      >
                        {ru.knowledge}
                      </button>
                      <button
                        className="danger-link"
                        disabled={archivingEntityId === entity.id}
                        onClick={() => handleArchiveEntity(entity.id)}
                        type="button"
                      >
                        {archivingEntityId === entity.id ? ru.deleting : ru.delete}
                      </button>
                    </div>
                  </article>
                    ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {editingEntity ? (
            <div className="entity-side-panel">
              <div className="entity-panel-toolbar">
                <div aria-label={ru.entityPanelSections} className="entity-panel-tabs" role="tablist">
                  <button
                    aria-controls="entity-details-panel"
                    aria-selected={entityPanelView === 'details'}
                    className={`entity-panel-tab ${entityPanelView === 'details' ? 'is-active' : ''}`}
                    id="entity-details-tab"
                    onClick={() => setEntityPanelView('details')}
                    role="tab"
                    type="button"
                  >
                    {ru.entityData}
                  </button>
                  <button
                    aria-controls="entity-state-panel"
                    aria-selected={entityPanelView === 'state'}
                    className={`entity-panel-tab ${entityPanelView === 'state' ? 'is-active' : ''}`}
                    id="entity-state-tab"
                    onClick={() => setEntityPanelView('state')}
                    role="tab"
                    type="button"
                  >
                    {ru.state}
                    <span>{editingEntity.state.length}</span>
                  </button>
                  <button
                    aria-controls="entity-knowledge-panel"
                    aria-selected={entityPanelView === 'knowledge'}
                    className={`entity-panel-tab ${entityPanelView === 'knowledge' ? 'is-active' : ''}`}
                    id="entity-knowledge-tab"
                    onClick={() => setEntityPanelView('knowledge')}
                    role="tab"
                    type="button"
                  >
                    {ru.knowledge}
                    <span>{editingEntityKnowledge.length}</span>
                  </button>
                </div>
                <button className="text-button" onClick={() => setEditingEntityId('')} type="button">
                  {ru.close}
                </button>
              </div>
              {entityPanelView === 'details' ? (
                <div aria-labelledby="entity-details-tab" id="entity-details-panel" role="tabpanel">
                  <EntityEditor
                    entity={editingEntity}
                    isSaving={isUpdatingEntity}
                    key={editingEntity.id}
                    onCancel={() => setEditingEntityId('')}
                    onSave={(input) => handleEntityUpdate(editingEntity, input)}
                  />
                </div>
              ) : entityPanelView === 'state' ? (
                <div aria-labelledby="entity-state-tab" id="entity-state-panel" role="tabpanel">
                  <EntityStateEditor
                    entity={editingEntity}
                    isSaving={isSavingEntityState}
                    onRemove={(stateId) => handleEntityStateRemove(editingEntity, stateId)}
                    onSave={(input) => handleEntityStateSave(editingEntity, input)}
                  />
                </div>
              ) : (
                <div aria-labelledby="entity-knowledge-tab" id="entity-knowledge-panel" role="tabpanel">
                  <EntityKnowledgeEditor
                    entities={activeEntities}
                    entity={editingEntity}
                    isSaving={isSavingKnowledge}
                    key={editingEntity.id}
                    knowledge={editingEntityKnowledge}
                    onRemove={handleKnowledgeRemove}
                    onSave={handleKnowledgeSave}
                  />
                </div>
              )}
            </div>
          ) : <form className="quick-create" onSubmit={handleEntitySubmit}>
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
          </form>}
        </section>

        <section className="relationship-workspace" aria-labelledby="relationships-heading">
          <div className="relationship-list-panel">
            <div className="section-title relationship-section-title">
              <div>
                <p className="overline">Структура кампании</p>
                <h2 id="relationships-heading">{ru.relationships}</h2>
              </div>
              <span aria-label={`${activeRelationships.length} связей`}>
                {activeRelationships.length}
              </span>
            </div>
            {activeRelationships.length === 0 ? (
              <p className="relationship-empty">{ru.noRelationships}</p>
            ) : (
              <div className="relationship-list">
                {[...activeRelationships].reverse().map((relationship) => (
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
                      <small>{ru.visibility[relationship.visibility]}</small>
                      {relationship.description && <p>{relationship.description}</p>}
                    </div>
                    <button
                      className="danger-link"
                      disabled={archivingRelationshipId === relationship.id}
                      onClick={() => handleArchiveRelationship(relationship.id)}
                      type="button"
                    >
                      {archivingRelationshipId === relationship.id ? ru.deleting : ru.delete}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <form className="relationship-create" onSubmit={handleRelationshipSubmit}>
            <p className="overline">{ru.relationshipBuilder}</p>
            <h2>Связать сущности</h2>
            {activeEntities.length < 2 && (
              <p className="form-hint">{ru.relationshipNeedsEntities}</p>
            )}
            <fieldset className="relationship-source-fieldset">
              <legend>{ru.relationshipSources}</legend>
              <div className="relationship-source-summary" aria-live="polite">
                <span>{ru.relationshipSourcesFound}: {visibleSourceCount}</span>
                <strong>{ru.relationshipSourcesSelected}: {relationshipSourceIds.length}</strong>
              </div>
              <label className="relationship-source-search-label" htmlFor="relationship-source-search">
                {ru.relationshipSourcesSearch}
              </label>
              <div className="relationship-source-search">
                <input
                  autoComplete="off"
                  id="relationship-source-search"
                  onChange={(event) => setRelationshipSourceSearch(event.target.value)}
                  placeholder={ru.relationshipSourcesSearchPlaceholder}
                  type="search"
                  value={relationshipSourceSearch}
                />
                {relationshipSourceSearch && (
                  <button
                    aria-label={ru.clearSearch}
                    onClick={() => setRelationshipSourceSearch('')}
                    type="button"
                  >
                    ×
                  </button>
                )}
              </div>
              {selectedSourceEntities.length > 0 && (
                <div className="relationship-selected-sources" aria-label={ru.relationshipSourcesSelected}>
                  {selectedSourceEntities.map((entity) => (
                    <button
                      aria-label={`Убрать ${entity.name} из выбранных`}
                      key={entity.id}
                      onClick={() => setRelationshipSourceIds((current) =>
                        current.filter((id) => id !== entity.id))}
                      type="button"
                    >
                      {entity.name} <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="relationship-source-options">
                {sourceGroups.length === 0 ? (
                  <p className="relationship-source-empty">{ru.relationshipSourcesEmpty}</p>
                ) : sourceGroups.map((group) => (
                  <section className="relationship-source-group" key={group.type}>
                    <h3>
                      {ru.entityTypes[group.type]}
                      <span>{group.entities.length}</span>
                    </h3>
                    {group.entities.map((entity) => (
                      <label className="relationship-source-option" key={entity.id}>
                        <input
                          checked={relationshipSourceIds.includes(entity.id)}
                          onChange={(event) => {
                            setRelationshipSourceIds((current) => event.target.checked
                              ? [...current, entity.id]
                              : current.filter((id) => id !== entity.id))
                          }}
                          type="checkbox"
                        />
                        <span>
                          <strong>{entity.name}</strong>
                          <small>{entity.summary || ru.noEntitySummary}</small>
                        </span>
                      </label>
                    ))}
                  </section>
                ))}
              </div>
              <p className="relationship-source-hint">{ru.relationshipSourcesHint}</p>
            </fieldset>
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
              onChange={(event) => {
                const targetId = event.target.value
                setRelationshipTargetId(targetId)
                setRelationshipSourceIds((current) => current.filter((id) => id !== targetId))
              }}
              value={relationshipTargetId}
            >
              <option value="">{ru.selectEntity}</option>
              {targetGroups.map((group) => (
                <optgroup key={group.type} label={ru.entityTypes[group.type]}>
                  {group.entities.map((entity) => (
                    <option disabled={relationshipSourceIds.includes(entity.id)} key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </optgroup>
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
            <label htmlFor="relationship-visibility">{ru.relationshipVisibility}</label>
            <select
              id="relationship-visibility"
              onChange={(event) => setRelationshipVisibility(event.target.value as Visibility)}
              value={relationshipVisibility}
            >
              <option value="game_master">{ru.visibility.game_master}</option>
              <option value="party">{ru.visibility.party}</option>
              <option value="public">{ru.visibility.public}</option>
            </select>
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
                activeEntities.length < 2 ||
                relationshipSourceIds.length === 0 ||
                !relationshipTargetId ||
                isCreatingRelationship
              }
              type="submit"
            >
              {isCreatingRelationship ? 'Создаём…' : ru.createRelationship}
            </button>
          </form>
        </section>
        <CampaignGraph
          campaign={campaign}
          entityIds={visibleEntityIds}
          isFiltered={isEntitySearchFiltered}
        />
        <LogicRuleBuilder
          campaign={campaign}
          isSaving={isSavingLogic}
          onApply={handleLogicRuleApply}
          onRemove={handleLogicRuleRemove}
          onSave={handleLogicRuleSave}
        />
        <CampaignEventLog campaign={campaign} onOpenEntity={(entityId) => openEntityPanel(entityId, 'details')} />
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
