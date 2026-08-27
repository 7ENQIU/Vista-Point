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
import { createLogicTestCampaign, LOGIC_TEST_CAMPAIGN_ID } from '../application/campaigns/createLogicTestCampaign'
import { createAndSaveEntity } from '../application/campaigns/createAndSaveEntity'
import { createAndSaveRelationships } from '../application/campaigns/createAndSaveRelationship'
import { createAndSaveFact, type CreateFactInput } from '../application/campaigns/createAndSaveFact'
import { archiveAndSavePredicate, updateAndSavePredicate } from '../application/campaigns/savePredicateChanges'
import { applyAndSaveHistoryAction } from '../application/campaigns/saveHistoryAction'
import { saveHotbarSlot } from '../application/campaigns/saveHotbarSlot'
import { createAndSaveEntityTemplate, removeAndSaveEntityTemplate } from '../application/campaigns/saveEntityTemplate'
import { createAndSaveCustomEntityType, removeAndSaveCustomEntityType, renameAndSaveCustomEntityType } from '../application/campaigns/saveCustomEntityType'
import { createAndSaveGraphView, removeAndSaveGraphView, renameAndSaveGraphView } from '../application/campaigns/saveGraphView'
import { applyAndSaveLogicRule, removeAndSaveLogicRule, setAndSaveLogicRule } from '../application/campaigns/saveLogicRule'
import { selectImmediateHierarchyRelationships } from '../application/campaigns/buildEntityContext'
import { importCampaignFile } from '../application/campaigns/importCampaignFile'
import {
  removeAndSaveEntityState,
  setAndSaveEntityState,
} from '../application/campaigns/saveEntityState'
import { updateAndSaveEntity } from '../application/campaigns/updateAndSaveEntity'
import type { CampaignBackup, CampaignRepository } from '../application/ports/CampaignRepository'
import { parseCampaignFile } from '../domain/campaign/campaignFile'
import type { UpdatePredicateInput } from '../domain/campaign/managePredicate'
import type { SetLogicRuleInput } from '../domain/campaign/logicRules'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type Campaign,
  type CampaignEntity,
  type EntityType,
  type FactHotbarPreset,
  type SavedGraphView,
  type RelationshipType,
} from '../domain/campaign/types'
import { IndexedDbCampaignRepository } from '../infrastructure/storage/IndexedDbCampaignRepository'
import { ru } from '../shared/i18n/ru'
import { CampaignGraph } from './CampaignGraph'
import { CustomEntityTypeManager } from './CustomEntityTypeManager'
import { LogicCanvas } from './LogicCanvas'
import { DesktopUpdateCard } from './DesktopUpdateCard'
import { ThemeToggle } from './ThemeToggle'
import { CampaignEventLog } from './CampaignEventLog'
import { downloadCampaign } from './downloadCampaign'
import { EntityEditor } from './EntityEditor'
import { EntityFullScreenCard, type EntityFullScreenCardView } from './EntityFullScreenCard'
import { buildEntityHistoryEntries, EntityHistoryPanel } from './EntityHistoryPanel'
import { buildEntityRelationshipGroups, EntityRelationshipsPanel } from './EntityRelationshipsPanel'
import { EntityStateEditor } from './EntityStateEditor'
import { groupRelationshipSources } from './groupRelationshipSources'
import { CAMPAIGN_WORKSPACE_VIEWS, resolveInitialCampaignCanvasMode, resolveInitialCampaignWorkspaceView, toggleCampaignCanvasMode, type CampaignCanvasMode, type CampaignWorkspaceView } from './campaignWorkspace'
import { searchCampaignEntities } from './searchCampaignEntities'
import { entityTypeLabel } from './entityTypeLabels'
import { SavedGraphViews } from './SavedGraphViews'

function BrandHeader({ campaignName }: { campaignName?: string }) {
  return (
    <header className="app-topbar">
      <div className="brand">
        <img className="brand-logo" src="/vista-point-mark.svg" alt="" aria-hidden="true" />
        <span className="brand-name">Vista Point</span>
      </div>
      <div className="app-context" aria-label="Состояние приложения">
        <div className="app-status">
          {campaignName && <strong>{campaignName}</strong>}
          {campaignName && <span aria-hidden="true">·</span>}
          <span>Локально</span>
          <span aria-hidden="true">·</span>
          <span>Без сети</span>
        </div>
        <ThemeToggle />
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

type EntityPanelView = EntityFullScreenCardView

const workspaceLabels: Record<CampaignWorkspaceView, { label: string; hint: string }> = {
  session: { label: 'Сессия', hint: 'Раздел в разработке' },
  graph: { label: 'Канвас', hint: 'Знания и логика' },
  history: { label: 'История', hint: 'Журнал изменений' },
  details: { label: 'Подробнее', hint: 'Библиотека и настройки' },
}

function CampaignOverview({ campaign, repository, onBack, onCampaignChanged }: CampaignOverviewProps) {
  const workspaceStorageKey = `vista-point:campaign-workspace:${campaign.id}`
  const canvasModeStorageKey = `vista-point:canvas-mode:${campaign.id}`
  const [workspaceView, setWorkspaceView] = useState<CampaignWorkspaceView>(() => {
    let stored: string | null = null
    try { stored = window.localStorage.getItem(workspaceStorageKey) } catch { /* локальная настройка недоступна */ }
    return resolveInitialCampaignWorkspaceView(campaign.activeSessionId, stored)
  })
  const [canvasMode, setCanvasMode] = useState<CampaignCanvasMode>(() => {
    try { return resolveInitialCampaignCanvasMode(window.localStorage.getItem(canvasModeStorageKey)) } catch { return 'knowledge' }
  })
  const [backups, setBackups] = useState<CampaignBackup[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [entityType, setEntityType] = useState<EntityType>('location')
  const [customEntityTypeId, setCustomEntityTypeId] = useState('')
  const [entityTemplateId, setEntityTemplateId] = useState('')
  const [entityName, setEntityName] = useState('')
  const [entitySummary, setEntitySummary] = useState('')
  const [entityCharacterTags, setEntityCharacterTags] = useState('')
  const [isCreatingEntity, setIsCreatingEntity] = useState(false)
  const [isGraphCreateOpen, setIsGraphCreateOpen] = useState(false)
  const [editingEntityId, setEditingEntityId] = useState('')
  const [isEntityEditorDirty, setIsEntityEditorDirty] = useState(false)
  const [entityPanelView, setEntityPanelView] = useState<EntityPanelView>('details')
  const [isUpdatingEntity, setIsUpdatingEntity] = useState(false)
  const [isSavingEntityTemplate, setIsSavingEntityTemplate] = useState(false)
  const [isSavingCustomEntityType, setIsSavingCustomEntityType] = useState(false)
  const [isSavingGraphView, setIsSavingGraphView] = useState(false)
  const [isSavingEntityState, setIsSavingEntityState] = useState(false)
  const [campaignSearch, setCampaignSearch] = useState('')
  const [entityTypeFilters, setEntityTypeFilters] = useState<EntityType[]>([])
  const [customEntityTypeFilters, setCustomEntityTypeFilters] = useState<string[]>([])
  const savedGraphViews = campaign.savedGraphViews ?? []
  const campaignSearchInput = useRef<HTMLInputElement>(null)
  const [relationshipSourceIds, setRelationshipSourceIds] = useState<string[]>([])
  const [relationshipSourceSearch, setRelationshipSourceSearch] = useState('')
  const [relationshipTargetId, setRelationshipTargetId] = useState('')
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('located_in')
  const [relationshipDescription, setRelationshipDescription] = useState('')
  const [relationshipDirected, setRelationshipDirected] = useState(true)
  const [isCreatingRelationship, setIsCreatingRelationship] = useState(false)
  const [archivingEntityId, setArchivingEntityId] = useState('')
  const [archivingRelationshipId, setArchivingRelationshipId] = useState('')
  const activeEntities = campaign.entities.filter((entity) => entity.status !== 'archived')
  const activeEntityIds = new Set(activeEntities.map((entity) => entity.id))
  const activeRelationships = selectImmediateHierarchyRelationships(campaign, campaign.relationships.filter((relationship) =>
    relationship.status !== 'archived' &&
    activeEntityIds.has(relationship.sourceId) &&
    activeEntityIds.has(relationship.targetId)))
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
  const editingEntityRelationshipGroups = editingEntity
    ? buildEntityRelationshipGroups(campaign, editingEntity.id)
    : undefined
  const editingEntityRelationshipCount = editingEntityRelationshipGroups
    ? editingEntityRelationshipGroups.outgoing.length + editingEntityRelationshipGroups.incoming.length + editingEntityRelationshipGroups.mutual.length
    : 0
  const editingEntityHistoryCount = editingEntity
    ? buildEntityHistoryEntries(campaign, editingEntity.id).length
    : 0
  const entitySearchGroups = useMemo(() => searchCampaignEntities(campaign.entities, {
    query: campaignSearch,
    types: entityTypeFilters,
    customTypeIds: customEntityTypeFilters,
  }, campaign.customFieldDefinitions), [campaign.customFieldDefinitions, campaign.entities, campaignSearch, customEntityTypeFilters, entityTypeFilters])
  const visibleEntities = useMemo(
    () => entitySearchGroups.flatMap((group) => group.results.map((result) => result.entity)),
    [entitySearchGroups],
  )
  const visibleEntityIds = useMemo(() => visibleEntities.map((entity) => entity.id), [visibleEntities])
  const isEntitySearchFiltered = Boolean(
    campaignSearch.trim() || entityTypeFilters.length > 0 || customEntityTypeFilters.length > 0,
  )
  const counters = [
    [ru.entities, activeEntities.length],
    [ru.relationships, activeRelationships.length],
    [ru.events, campaign.eventLog.length],
  ] as const

  function openEntityPanel(entityId: string, view: EntityPanelView) {
    if (isEntityEditorDirty && (editingEntityId !== entityId || entityPanelView !== view) && !window.confirm('Открыть другой раздел карточки? Несохранённые изменения будут потеряны.')) return
    setWorkspaceView('details')
    setIsGraphCreateOpen(false)
    setIsEntityEditorDirty(false)
    setEditingEntityId(entityId)
    setEntityPanelView(view)
  }

  function openGraphEntityPanel(entityId: string) {
    if (isEntityEditorDirty && editingEntityId !== entityId && !window.confirm('Открыть другую карточку? Несохранённые изменения будут потеряны.')) return
    setIsGraphCreateOpen(false)
    setIsEntityEditorDirty(false)
    setEditingEntityId(entityId)
    setEntityPanelView('details')
  }

  function closeEntityPanel() {
    if (isEntityEditorDirty && !window.confirm('Закрыть карточку? Несохранённые изменения будут потеряны.')) return
    setEditingEntityId('')
    setIsEntityEditorDirty(false)
  }

  function selectEntityPanelView(view: EntityPanelView) {
    if (view === entityPanelView) return
    if (isEntityEditorDirty && !window.confirm('Открыть другой раздел карточки? Несохранённые изменения будут потеряны.')) return
    setIsEntityEditorDirty(false)
    setEntityPanelView(view)
  }

  function openGraphEntityCreate() {
    if (isEntityEditorDirty && !window.confirm('Создать новую сущность? Несохранённые изменения будут потеряны.')) return
    setEditingEntityId('')
    setIsEntityEditorDirty(false)
    setIsGraphCreateOpen(true)
  }

  function selectWorkspaceView(view: CampaignWorkspaceView) {
    if (isEntityEditorDirty && view !== workspaceView && !window.confirm('Перейти в другой раздел? Несохранённые изменения карточки будут потеряны.')) return
    if (view !== workspaceView) {
      setEditingEntityId('')
      setIsEntityEditorDirty(false)
    }
    setWorkspaceView(view)
    window.requestAnimationFrame(() => document.getElementById('campaign-workspace-nav')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  function selectCanvasMode(mode: CampaignCanvasMode) {
    if (mode === canvasMode) return
    if (isEntityEditorDirty && !window.confirm('Переключить режим канваса? Несохранённые изменения карточки будут потеряны.')) return
    setEditingEntityId('')
    setIsGraphCreateOpen(false)
    setIsEntityEditorDirty(false)
    setCanvasMode(mode)
  }

  function toggleEntityTypeFilter(type: EntityType) {
    setEntityTypeFilters((current) => current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type])
  }

  function toggleCustomEntityTypeFilter(typeId: string) {
    setCustomEntityTypeFilters((current) => current.includes(typeId)
      ? current.filter((item) => item !== typeId)
      : [...current, typeId])
  }

  function resetEntitySearch() {
    setCampaignSearch('')
    setEntityTypeFilters([])
    setCustomEntityTypeFilters([])
  }

  function applySavedGraphView(view: SavedGraphView) {
    setCampaignSearch(view.query)
    setEntityTypeFilters(view.entityTypes)
    setCustomEntityTypeFilters(view.customEntityTypeIds.filter((id) => campaign.customEntityTypes.some((type) => type.id === id)))
    setMessage(`Вид «${view.name}» применён.`)
  }

  async function handleGraphViewCreate(name: string) {
    setError('')
    setMessage('')
    setIsSavingGraphView(true)
    try {
      const result = await createAndSaveGraphView(repository, { ...campaign, savedGraphViews }, { name, query: campaignSearch, entityTypes: entityTypeFilters, customEntityTypeIds: customEntityTypeFilters })
      await acceptCampaignChange(result.campaign)
      setMessage(`Вид «${result.view.name}» сохранён.`)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      return false
    } finally { setIsSavingGraphView(false) }
  }

  async function handleGraphViewRename(viewId: string, name: string) {
    setError('')
    setMessage('')
    setIsSavingGraphView(true)
    try {
      const result = await renameAndSaveGraphView(repository, { ...campaign, savedGraphViews }, viewId, name)
      await acceptCampaignChange(result.campaign)
      setMessage(`Вид «${result.view.name}» переименован.`)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      return false
    } finally { setIsSavingGraphView(false) }
  }

  async function handleGraphViewRemove(viewId: string) {
    const view = savedGraphViews.find((item) => item.id === viewId)
    if (!view || !window.confirm(`Удалить сохранённый вид «${view.name}»? Текущая раскладка и сущности не изменятся.`)) return
    setError('')
    setMessage('')
    setIsSavingGraphView(true)
    try {
      const result = await removeAndSaveGraphView(repository, { ...campaign, savedGraphViews }, viewId)
      await acceptCampaignChange(result.campaign)
      setMessage(`Вид «${result.view.name}» удалён.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally { setIsSavingGraphView(false) }
  }

  async function acceptCampaignChange(nextCampaign: Campaign) {
    onCampaignChanged(nextCampaign)
  }

  useEffect(() => {
    repository.listBackups(campaign.id).then(setBackups).catch(() => setError(ru.storageError))
  }, [campaign.id, repository])

  useEffect(() => {
    try { window.localStorage.setItem(workspaceStorageKey, workspaceView) } catch { /* интерфейс продолжает работать без сохранения вкладки */ }
  }, [workspaceStorageKey, workspaceView])

  useEffect(() => {
    try { window.localStorage.setItem(canvasModeStorageKey, canvasMode) } catch { /* интерфейс продолжает работать без сохранения режима */ }
  }, [canvasModeStorageKey, canvasMode])

  useEffect(() => {
    function handleSearchShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setWorkspaceView('details')
        window.requestAnimationFrame(() => { campaignSearchInput.current?.focus(); campaignSearchInput.current?.select() })
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

  async function createEntity() {
    setError('')
    setMessage('')
    setIsCreatingEntity(true)
    try {
      const result = await createAndSaveEntity(repository, campaign, {
        type: entityType,
        customTypeId: customEntityTypeId || undefined,
        name: entityName,
        summary: entitySummary,
        characterTags: entityType === 'npc' ? entityCharacterTags.split(',') : undefined,
        templateId: entityTemplateId || undefined,
      })
      setEntityName('')
      setEntitySummary('')
      setEntityCharacterTags('')
      setEntityTemplateId('')
      setCustomEntityTypeId('')
      await acceptCampaignChange(result.campaign)
      setIsGraphCreateOpen(false)
      setMessage(ru.entityCreated)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsCreatingEntity(false)
    }
  }

  function selectEntityTemplate(templateId: string) {
    setEntityTemplateId(templateId)
    const template = campaign.entityTemplates.find((item) => item.id === templateId)
    if (!template) return
    setEntityType(template.entityType)
    setCustomEntityTypeId(template.customTypeId ?? '')
    setEntitySummary(template.summary)
    setEntityCharacterTags(template.characterTags.join(', '))
  }

  function selectEntityType(value: string) {
    setEntityTemplateId('')
    if (value.startsWith('custom:')) {
      const customType = campaign.customEntityTypes.find((item) => item.id === value.slice(7))
      if (!customType) return
      setEntityType(customType.baseType)
      setCustomEntityTypeId(customType.id)
      return
    }
    setEntityType(value.slice(5) as EntityType)
    setCustomEntityTypeId('')
  }

  async function handleCustomEntityTypeCreate(input: { name: string; baseType: EntityType }) {
    setIsSavingCustomEntityType(true)
    try { const result = await createAndSaveCustomEntityType(repository, campaign, input); await acceptCampaignChange(result.campaign); setMessage(`Тип «${result.customType.name}» создан.`) }
    finally { setIsSavingCustomEntityType(false) }
  }

  async function handleCustomEntityTypeRename(typeId: string, name: string) {
    setIsSavingCustomEntityType(true)
    try { const result = await renameAndSaveCustomEntityType(repository, campaign, typeId, name); await acceptCampaignChange(result.campaign); setMessage(`Тип «${result.customType.name}» сохранён.`) }
    finally { setIsSavingCustomEntityType(false) }
  }

  async function handleCustomEntityTypeRemove(typeId: string) {
    setIsSavingCustomEntityType(true)
    try {
      const result = await removeAndSaveCustomEntityType(repository, campaign, typeId)
      await acceptCampaignChange(result.campaign)
      setCustomEntityTypeFilters((current) => current.filter((item) => item !== typeId))
      if (customEntityTypeId === typeId) setCustomEntityTypeId('')
      setMessage(`Тип «${result.customType.name}» удалён.`)
    } finally { setIsSavingCustomEntityType(false) }
  }

  async function handleEntitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createEntity()
  }

  async function handleGraphEntitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createEntity()
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
        })),
      )
      setRelationshipSourceIds([])
      setRelationshipSourceSearch('')
      setRelationshipTargetId('')
      setRelationshipDescription('')
      await acceptCampaignChange(result.campaign)
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

  async function handleGraphFactCreate(input: CreateFactInput) {
    setError('')
    setMessage('')
    const result = await createAndSaveFact(repository, campaign, input)
    await acceptCampaignChange(result.campaign)
    setMessage('Факт создан на графе и добавлен в историю.')
  }

  async function handleHotbarSlotUpdate(slot: number, preset: FactHotbarPreset | undefined) {
    setError('')
    setMessage('')
    const updated = await saveHotbarSlot(repository, campaign, slot, preset)
    await acceptCampaignChange(updated)
    setMessage(preset ? `Слот ${slot === 10 ? 0 : slot} настроен.` : `Слот ${slot === 10 ? 0 : slot} очищен.`)
  }

  async function handlePredicateUpdate(predicateId: string, input: UpdatePredicateInput) {
    setError('')
    setMessage('')
    const result = await updateAndSavePredicate(repository, campaign, predicateId, input)
    if (result.changed) await acceptCampaignChange(result.campaign)
    setMessage(result.changed ? 'Предикат обновлён.' : 'Предикат не изменился.')
  }

  async function handlePredicateArchive(predicateId: string) {
    setError('')
    setMessage('')
    const result = await archiveAndSavePredicate(repository, campaign, predicateId)
    await acceptCampaignChange(result.campaign)
    setMessage('Предикат перенесён в архив.')
  }

  async function handleHistoryAction(direction: 'undo' | 'redo') {
    setError('')
    setMessage('')
    try {
      const result = await applyAndSaveHistoryAction(repository, campaign, direction)
      await acceptCampaignChange(result.campaign)
      setMessage(direction === 'undo' ? 'Последнее действие отменено.' : 'Действие повторено.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    }
  }

  async function handleLogicRuleSave(input: SetLogicRuleInput) {
    setError('')
    setMessage('')
    const result = await setAndSaveLogicRule(repository, campaign, input)
    if (result.changed) await acceptCampaignChange(result.campaign)
    setMessage(result.changed ? 'Логическое правило сохранено.' : 'Правило не изменилось.')
  }

  async function handleLogicRuleRemove(ruleId: string) {
    setError('')
    setMessage('')
    const result = await removeAndSaveLogicRule(repository, campaign, ruleId)
    await acceptCampaignChange(result.campaign)
    setMessage('Логическое правило удалено. Запись сохранена в истории.')
  }

  async function handleLogicRuleApply(ruleId: string) {
    setError('')
    setMessage('')
    try {
      const result = await applyAndSaveLogicRule(repository, campaign, ruleId)
      if (result.changed) await acceptCampaignChange(result.campaign)
      setMessage(result.changed ? 'Результаты правила применены. Изменение можно отменить в истории.' : 'Правило проверено повторно: изменения больше не требуются.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
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
      if (result.changed) await acceptCampaignChange(result.campaign)
      setEditingEntityId('')
      setIsEntityEditorDirty(false)
      setMessage(result.changed ? ru.entityUpdated : ru.entityUnchanged)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsUpdatingEntity(false)
    }
  }

  async function handleEntityTemplateCreate(entity: CampaignEntity, name: string) {
    setError('')
    setMessage('')
    setIsSavingEntityTemplate(true)
    try {
      const result = await createAndSaveEntityTemplate(repository, campaign, entity.id, name)
      await acceptCampaignChange(result.campaign)
      setMessage(`Шаблон «${result.template.name}» создан.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally {
      setIsSavingEntityTemplate(false)
    }
  }

  async function handleEntityTemplateRemove(templateId: string) {
    setError('')
    setMessage('')
    setIsSavingEntityTemplate(true)
    try {
      const result = await removeAndSaveEntityTemplate(repository, campaign, templateId)
      await acceptCampaignChange(result.campaign)
      if (entityTemplateId === templateId) {
        setEntityTemplateId('')
      }
      setMessage(`Шаблон «${result.template.name}» удалён.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally {
      setIsSavingEntityTemplate(false)
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
      if (result.changed) await acceptCampaignChange(result.campaign)
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
      await acceptCampaignChange(result.campaign)
      setMessage(ru.stateRemoved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
      throw caught
    } finally {
      setIsSavingEntityState(false)
    }
  }

  async function handleArchiveRelationship(relationshipId: string) {
    const relationship = campaign.relationships.find((item) => item.id === relationshipId && item.status !== 'archived')
    if (!relationship || !window.confirm(ru.deleteRelationshipConfirm)) return

    setError('')
    setMessage('')
    setArchivingRelationshipId(relationshipId)
    try {
      const result = await archiveAndSaveRelationship(repository, campaign, relationshipId)
      await acceptCampaignChange(result.campaign)
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
      await acceptCampaignChange(result.campaign)
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
        <button className="text-button" onClick={() => {
          if (isEntityEditorDirty && !window.confirm('Вернуться к списку кампаний? Несохранённые изменения карточки будут потеряны.')) return
          onBack()
        }} type="button">
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

        <nav
          aria-label="Разделы кампании"
          className="campaign-workspace-nav"
          id="campaign-workspace-nav"
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const current = CAMPAIGN_WORKSPACE_VIEWS.indexOf(workspaceView)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? CAMPAIGN_WORKSPACE_VIEWS.length - 1 :
              (current + (event.key === 'ArrowRight' ? 1 : -1) + CAMPAIGN_WORKSPACE_VIEWS.length) % CAMPAIGN_WORKSPACE_VIEWS.length
            selectWorkspaceView(CAMPAIGN_WORKSPACE_VIEWS[next])
            window.requestAnimationFrame(() => document.getElementById(`campaign-workspace-tab-${CAMPAIGN_WORKSPACE_VIEWS[next]}`)?.focus())
          }}
          role="tablist"
        >
          {CAMPAIGN_WORKSPACE_VIEWS.map((view) => (
            <button
              aria-controls={`campaign-workspace-panel-${view}`}
              aria-selected={workspaceView === view}
              className={workspaceView === view ? 'is-active' : ''}
              id={`campaign-workspace-tab-${view}`}
              key={view}
              onClick={() => selectWorkspaceView(view)}
              role="tab"
              tabIndex={workspaceView === view ? 0 : -1}
              type="button"
            >
              <strong>{workspaceLabels[view].label}</strong>
              <span>{workspaceLabels[view].hint}</span>
            </button>
          ))}
        </nav>

        {workspaceView === 'session' && <section aria-labelledby="campaign-workspace-tab-session" className="campaign-workspace-panel" id="campaign-workspace-panel-session" role="tabpanel">
          <div className="session-placeholder">
            <p className="overline">Будущий режим</p>
            <h2>Сессия</h2>
            <p>Этот раздел находится в разработке. В будущем здесь появятся инструменты для ведения игровой сессии.</p>
            <button className="button button-primary" onClick={() => selectWorkspaceView('graph')} type="button">
              Вернуться к графу знаний
            </button>
          </div>
        </section>}

        {workspaceView === 'details' && <section aria-labelledby="campaign-workspace-tab-details" className="campaign-workspace-panel" id="campaign-workspace-panel-details" role="tabpanel">
        <section className="metric-grid" aria-label="Состояние кампании">
          {counters.map(([label, value]) => (
            <article className="metric" key={label}>
              <span>{value}</span>
              <p>{label}</p>
            </article>
          ))}
        </section>

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
            {campaign.customEntityTypes.map((customType) => (
              <button
                aria-pressed={customEntityTypeFilters.includes(customType.id)}
                className={customEntityTypeFilters.includes(customType.id) ? 'is-active' : ''}
                key={customType.id}
                onClick={() => toggleCustomEntityTypeFilter(customType.id)}
                type="button"
              >
                {customType.name}
              </button>
            ))}
          </div>
          {isEntitySearchFiltered && <div className="campaign-filter-row">
            <button className="campaign-filter-reset" onClick={resetEntitySearch} type="button">{ru.resetFilters}</button>
          </div>}
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
                      <div className="entity-row-heading"><h3>{entity.name}</h3></div>
                      <p>{entity.summary || 'Короткая заметка не добавлена.'}</p>
                      {entity.characterTags.length > 0 && (
                        <div className="entity-character-tags" aria-label="Ролевые теги персонажа">
                          {entity.characterTags.map((tag) => <span key={tag}>{tag}</span>)}
                        </div>
                      )}
                      {match && (
                        <p className="entity-search-match">
                          <span>{ru.searchFields[match.field]}</span>
                          {match.value}
                        </p>
                      )}
                    </div>
                    <strong>{entityTypeLabel(campaign, entity)}</strong>
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

          <form className="quick-create" onSubmit={handleEntitySubmit}>
            <p className="overline">{ru.quickCreate}</p>
            <h2>Новая сущность</h2>
            {campaign.entityTemplates.length > 0 && <>
              <label htmlFor="entity-template">Шаблон карточки</label>
              <select id="entity-template" onChange={(event) => selectEntityTemplate(event.target.value)} value={entityTemplateId}>
                <option value="">Без шаблона</option>
                {campaign.entityTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {entityTypeLabel(campaign, template)}</option>)}
              </select>
            </>}
            <label htmlFor="entity-type">{ru.entityType}</label>
            <select
              id="entity-type"
              onChange={(event) => selectEntityType(event.target.value)}
              value={customEntityTypeId ? `custom:${customEntityTypeId}` : `base:${entityType}`}
            >
              <optgroup label="Встроенные типы">{ENTITY_TYPES.map((type) => (
                <option key={type} value={`base:${type}`}>{ru.entityTypes[type]}</option>
              ))}</optgroup>
              {campaign.customEntityTypes.length > 0 && <optgroup label="Пользовательские типы">{campaign.customEntityTypes.map((customType) => (
                <option key={customType.id} value={`custom:${customType.id}`}>{customType.name} · {ru.entityTypes[customType.baseType]}</option>
              ))}</optgroup>}
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
            {entityType === 'npc' && <>
              <label htmlFor="entity-character-tags">{ru.characterTags}</label>
              <input autoComplete="off" id="entity-character-tags" onChange={(event) => setEntityCharacterTags(event.target.value)} placeholder={ru.characterTagsPlaceholder} value={entityCharacterTags} />
              <p className="form-hint">{ru.characterTagsHint}</p>
            </>}
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
                      <span>{campaign.predicates.find((predicate) => predicate.id === relationship.predicateId)?.directLabel ?? ru.relationshipTypes[relationship.type]}</span>
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
        <CustomEntityTypeManager
          campaign={campaign}
          isSaving={isSavingCustomEntityType}
          onCreate={handleCustomEntityTypeCreate}
          onRemove={handleCustomEntityTypeRemove}
          onRename={handleCustomEntityTypeRename}
        />
        </section>}

        {workspaceView === 'graph' && <section
          aria-labelledby="campaign-workspace-tab-graph"
          className="campaign-workspace-panel campaign-workspace-panel-graph"
          id="campaign-workspace-panel-graph"
          onKeyDown={(event) => {
            if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !(event.target instanceof HTMLElement) || !event.target.classList.contains('graph-scroll')) return
            event.preventDefault()
            selectCanvasMode(toggleCampaignCanvasMode(canvasMode))
            window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#campaign-workspace-panel-graph .graph-scroll')?.focus())
          }}
          role="tabpanel"
        >
          <section className="graph-workspace-tools" aria-label="Фильтры графа">
            <div className="canvas-mode-switcher" role="tablist" aria-label="Режим канваса">
              <button aria-selected={canvasMode === 'knowledge'} className={canvasMode === 'knowledge' ? 'is-active' : ''} onClick={() => selectCanvasMode('knowledge')} role="tab" type="button"><span aria-hidden="true">◎</span><strong>Граф знаний</strong><small>Сущности и факты</small></button>
              <button aria-selected={canvasMode === 'logic'} className={canvasMode === 'logic' ? 'is-active' : ''} onClick={() => selectCanvasMode('logic')} role="tab" type="button"><span aria-hidden="true">◇</span><strong>Граф логики</strong><small>События и последствия</small></button>
            </div>
            {canvasMode === 'knowledge' && <>
              <div className="graph-workspace-search"><input aria-label="Поиск узлов графа" onChange={(event) => setCampaignSearch(event.target.value)} placeholder="Найти узел по названию или данным" type="search" value={campaignSearch} />{campaignSearch && <button aria-label="Очистить поиск графа" onClick={() => setCampaignSearch('')} type="button">×</button>}</div>
              <div className="graph-workspace-filters" aria-label="Типы узлов графа"><button aria-pressed={entityTypeFilters.length === 0 && customEntityTypeFilters.length === 0} className={entityTypeFilters.length === 0 && customEntityTypeFilters.length === 0 ? 'is-active' : ''} onClick={() => { setEntityTypeFilters([]); setCustomEntityTypeFilters([]) }} type="button">Все</button>{ENTITY_TYPES.map((type) => <button aria-pressed={entityTypeFilters.includes(type)} className={entityTypeFilters.includes(type) ? 'is-active' : ''} key={type} onClick={() => toggleEntityTypeFilter(type)} type="button">{ru.entityTypes[type]}</button>)}{campaign.customEntityTypes.map((customType) => <button aria-pressed={customEntityTypeFilters.includes(customType.id)} className={customEntityTypeFilters.includes(customType.id) ? 'is-active' : ''} key={customType.id} onClick={() => toggleCustomEntityTypeFilter(customType.id)} type="button">{customType.name}</button>)}</div>
              {isEntitySearchFiltered && <button className="link-button" onClick={resetEntitySearch} type="button">Сбросить фильтр графа</button>}
              <SavedGraphViews
                isSaving={isSavingGraphView}
                onApply={applySavedGraphView}
                onCreate={handleGraphViewCreate}
                onRemove={handleGraphViewRemove}
                onRename={handleGraphViewRename}
                views={savedGraphViews}
              />
            </>}
          </section>
          {canvasMode === 'knowledge' ? <div className={`knowledge-canvas-workspace${isGraphCreateOpen ? ' has-drawer' : ''}`}>
            <CampaignGraph
              campaign={campaign}
              entityIds={visibleEntityIds}
              interactionBlocked={isGraphCreateOpen}
              isFiltered={isEntitySearchFiltered}
              onCreateEntity={openGraphEntityCreate}
              onCreateFact={handleGraphFactCreate}
              onArchiveFact={handleArchiveRelationship}
              onUpdatePredicate={handlePredicateUpdate}
              onArchivePredicate={handlePredicateArchive}
              onOpenEntity={openGraphEntityPanel}
              onUpdateHotbarSlot={handleHotbarSlotUpdate}
            />
            {isGraphCreateOpen && (
              <aside className="graph-entity-drawer" aria-label="Создание сущности">
                <div className="graph-entity-drawer-toolbar">
                  <div>
                    <p className="overline">Новая сущность</p>
                    <strong>Создание на канвасе</strong>
                  </div>
                  <button
                    aria-label="Закрыть карточку"
                    className="text-button"
                    onClick={() => { setEditingEntityId(''); setIsGraphCreateOpen(false) }}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <form className="graph-quick-create" onSubmit={handleGraphEntitySubmit}>
                    {campaign.entityTemplates.length > 0 && <>
                      <label htmlFor="graph-entity-template">Шаблон карточки</label>
                      <select id="graph-entity-template" onChange={(event) => selectEntityTemplate(event.target.value)} value={entityTemplateId}>
                        <option value="">Без шаблона</option>
                        {campaign.entityTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {entityTypeLabel(campaign, template)}</option>)}
                      </select>
                    </>}
                    <label htmlFor="graph-entity-name">{ru.entityName}</label>
                    <input
                      autoComplete="off"
                      autoFocus
                      id="graph-entity-name"
                      onChange={(event) => setEntityName(event.target.value)}
                      placeholder="Например, Анна"
                      value={entityName}
                    />
                    <label htmlFor="graph-entity-type">{ru.entityType}</label>
                    <select id="graph-entity-type" onChange={(event) => selectEntityType(event.target.value)} value={customEntityTypeId ? `custom:${customEntityTypeId}` : `base:${entityType}`}>
                      <optgroup label="Встроенные типы">{ENTITY_TYPES.map((type) => <option key={type} value={`base:${type}`}>{ru.entityTypes[type]}</option>)}</optgroup>
                      {campaign.customEntityTypes.length > 0 && <optgroup label="Пользовательские типы">{campaign.customEntityTypes.map((customType) => <option key={customType.id} value={`custom:${customType.id}`}>{customType.name} · {ru.entityTypes[customType.baseType]}</option>)}</optgroup>}
                    </select>
                    <label htmlFor="graph-entity-summary">{ru.entitySummary}</label>
                    <textarea
                      id="graph-entity-summary"
                      onChange={(event) => setEntitySummary(event.target.value)}
                      placeholder={ru.entitySummaryPlaceholder}
                      rows={4}
                      value={entitySummary}
                    />
                    <p className="form-hint">Сущность появится в графе и библиотеке. Полную карточку можно открыть отдельно.</p>
                    <button className="button button-primary button-block" disabled={isCreatingEntity} type="submit">
                      {isCreatingEntity ? 'Создаём…' : 'Создать сущность'}
                    </button>
                </form>
              </aside>
            )}
          </div> : <LogicCanvas
            campaign={campaign}
            onApplyRule={handleLogicRuleApply}
            onOpenEntity={(entityId) => { setCanvasMode('knowledge'); openGraphEntityPanel(entityId) }}
            onRemoveRule={handleLogicRuleRemove}
            onSaveRule={handleLogicRuleSave}
          />}
        </section>}

        {workspaceView === 'history' && <section aria-labelledby="campaign-workspace-tab-history" className="campaign-workspace-panel" id="campaign-workspace-panel-history" role="tabpanel">
          <CampaignEventLog
            campaign={campaign}
            onOpenEntity={(entityId) => openEntityPanel(entityId, 'details')}
            onRedo={() => handleHistoryAction('redo')}
            onUndo={() => handleHistoryAction('undo')}
          />
        </section>}
      </main>
      {editingEntity && <EntityFullScreenCard
        entity={editingEntity}
        historyCount={editingEntityHistoryCount}
        isSaving={isUpdatingEntity || isSavingEntityState}
        onRequestClose={closeEntityPanel}
        onSelectView={selectEntityPanelView}
        relationshipCount={editingEntityRelationshipCount}
        typeLabel={entityTypeLabel(campaign, editingEntity)}
        view={entityPanelView}
      >
        {entityPanelView === 'details' ? (
          <div aria-labelledby="entity-fullscreen-title" id="entity-fullscreen-details" role="tabpanel">
            <EntityEditor
              customFieldDefinitions={campaign.customFieldDefinitions}
              entity={editingEntity}
              entities={campaign.entities}
              entityTemplates={campaign.entityTemplates}
              isSavingTemplate={isSavingEntityTemplate}
              logicRules={campaign.logicRules}
              handleEscape={false}
              isSaving={isUpdatingEntity}
              key={editingEntity.id}
              onCancel={() => { setEditingEntityId(''); setIsEntityEditorDirty(false) }}
              onDirtyChange={setIsEntityEditorDirty}
              onCreateTemplate={(name) => handleEntityTemplateCreate(editingEntity, name)}
              onRemoveTemplate={handleEntityTemplateRemove}
              onSave={(input) => handleEntityUpdate(editingEntity, input)}
              showHeader={false}
              typeLabel={entityTypeLabel(campaign, editingEntity)}
            />
          </div>
        ) : entityPanelView === 'state' ? (
          <div aria-labelledby="entity-fullscreen-title" id="entity-fullscreen-state" role="tabpanel">
            <EntityStateEditor
              entity={editingEntity}
              isSaving={isSavingEntityState}
              onRemove={(stateId) => handleEntityStateRemove(editingEntity, stateId)}
              onSave={(input) => handleEntityStateSave(editingEntity, input)}
            />
          </div>
        ) : entityPanelView === 'relationships' ? (
          <div aria-labelledby="entity-fullscreen-title" id="entity-fullscreen-relationships" role="tabpanel">
            <EntityRelationshipsPanel
              campaign={campaign}
              entity={editingEntity}
              isArchivingRelationshipId={archivingRelationshipId}
              onArchiveRelationship={handleArchiveRelationship}
              onOpenEntity={openGraphEntityPanel}
            />
          </div>
        ) : (
          <div aria-labelledby="entity-fullscreen-title" id="entity-fullscreen-history" role="tabpanel">
            <EntityHistoryPanel
              campaign={campaign}
              entity={editingEntity}
              onOpenEntity={openGraphEntityPanel}
            />
          </div>
        )}
      </EntityFullScreenCard>}
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
  const [isCreatingTestStand, setIsCreatingTestStand] = useState(false)
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

  async function handleCreateLogicTestStand() {
    setError('')
    setMessage('')
    setIsCreatingTestStand(true)
    try {
      const existing = await repository.getById(LOGIC_TEST_CAMPAIGN_ID)
      if (existing && !window.confirm('Пересоздать тестовый стенд? Текущая версия стенда будет сохранена в локальную страховочную копию.')) return

      const campaign = createLogicTestCampaign()
      await repository.importCampaign(campaign)
      setCampaigns((current) => upsertCampaign(current, campaign))
      setMessage(existing ? 'Тестовый стенд пересоздан. Предыдущая версия сохранена локально.' : 'Тестовый стенд логики создан локально.')
      setSelected(campaign)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsCreatingTestStand(false)
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

        <DesktopUpdateCard />

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
            {import.meta.env.DEV && <>
              <p className="overline">Режим разработки</p>
              <button
                className="button button-secondary button-block"
                disabled={isCreatingTestStand}
                onClick={handleCreateLogicTestStand}
                type="button"
              >
                {isCreatingTestStand ? 'Подготавливаем…' : campaigns.some((campaign) => campaign.id === LOGIC_TEST_CAMPAIGN_ID) ? 'Пересоздать тестовый стенд' : 'Создать тестовый стенд логики'}
              </button>
              <p className="privacy-note">Отдельная локальная кампания для безопасных проверок условий и результатов.</p>
            </>}
          </form>
        </section>
      </main>
    </div>
  )
}
