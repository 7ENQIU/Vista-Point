import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  applyCampaignGraphEdgeRoutes,
  applyCampaignGraphNodePositions,
  buildCampaignGraph,
  getFocusedGraphContext,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  GRAPH_ROUTE_CLEARANCE,
  type CampaignGraphEdge,
  type CampaignGraphEdgeRoutes,
  type CampaignGraphNode,
  type CampaignGraphNodePositions,
} from '../application/campaigns/buildCampaignGraph'
import type { CreateFactInput } from '../application/campaigns/createAndSaveFact'
import type { UpdatePredicateInput } from '../domain/campaign/managePredicate'
import type { Campaign, FactHotbarPreset } from '../domain/campaign/types'
import { findSimilarPredicates } from '../domain/campaign/findSimilarPredicates'
import { recommendPredicatesForEntities } from '../domain/campaign/recommendPredicates'
import { LocalGraphLayoutRepository } from '../infrastructure/storage/LocalGraphLayoutRepository'
import { LocalGraphRouteRepository } from '../infrastructure/storage/LocalGraphRouteRepository'
import {
  LocalCanvasViewportRepository,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  type CanvasViewport,
} from '../infrastructure/storage/LocalCanvasViewportRepository'
import {
  canvasShortcutLabel,
  DEFAULT_NEW_ENTITY_SHORTCUT,
  LocalCanvasShortcutRepository,
  matchesCanvasShortcut,
  normalizeCanvasShortcut,
} from '../infrastructure/storage/LocalCanvasShortcutRepository'
import { ru } from '../shared/i18n/ru'
import { entityTypeLabel } from './entityTypeLabels'
import { GraphEntityPopover } from './GraphEntityPopover'
import { resolveHotbarShortcut } from './hotbarShortcuts'

interface CampaignGraphProps {
  campaign: Campaign
  entityIds?: readonly string[]
  isFiltered?: boolean
  interactionBlocked?: boolean
  onCreateEntity?: () => void
  onOpenEntity?: (entityId: string) => void
  onCreateFact?: (input: CreateFactInput) => Promise<void>
  onArchiveFact?: (relationshipId: string) => Promise<void>
  onUpdatePredicate?: (predicateId: string, input: UpdatePredicateInput) => Promise<void>
  onArchivePredicate?: (predicateId: string) => Promise<void>
  onUpdateHotbarSlot?: (slot: number, preset: FactHotbarPreset | undefined) => Promise<void>
}

interface GraphDragState {
  nodeId: string
  pointerId: number
  offsetY: number
  offsetX: number
}

interface FactDragState {
  sourceId: string
  pointerId: number
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface CanvasPanState {
  pointerId: number
  startClientX: number
  startClientY: number
  startViewport: CanvasViewport
}

interface EdgeRouteDragState {
  relationshipId: string
  pointerId: number
}

function centeredViewport(width: number, height: number): CanvasViewport {
  return { centerX: width / 2, centerY: height / 2, zoom: 1 }
}

function clampViewport(viewport: CanvasViewport, width: number, height: number): CanvasViewport {
  const zoom = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, viewport.zoom))
  const visibleWidth = width / zoom
  const visibleHeight = height / zoom
  return {
    zoom,
    centerX: visibleWidth >= width ? width / 2 : Math.min(width - visibleWidth / 2, Math.max(visibleWidth / 2, viewport.centerX)),
    centerY: visibleHeight >= height ? height / 2 : Math.min(height - visibleHeight / 2, Math.max(visibleHeight / 2, viewport.centerY)),
  }
}

function shortened(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function otherEntityName(edge: CampaignGraphEdge, focusedId: string): string {
  return edge.source.entity.id === focusedId ? edge.target.entity.name : edge.source.entity.name
}

function relationshipLabel(edge: CampaignGraphEdge, campaign: Campaign): string {
  const predicate = campaign.predicates.find((item) => item.id === edge.relationship.predicateId)
  if (predicate) return edge.source.entity.id === edge.relationship.sourceId
    ? predicate.directLabel
    : predicate.inverseLabel
  return edge.displayType === 'includes_participant'
    ? ru.graphRelationshipTypes.includes_participant
    : ru.relationshipTypes[edge.displayType]
}

function ConnectionList({
  edges,
  focusedId,
  onSelectEntity,
  title,
  campaign,
  onArchiveFact,
}: {
  edges: CampaignGraphEdge[]
  focusedId: string
  onSelectEntity: (entityId: string) => void
  title: string
  campaign: Campaign
  onArchiveFact?: (relationshipId: string) => Promise<void>
}) {
  if (edges.length === 0) return null

  return (
    <div className="graph-connection-group">
      <h4>{title}</h4>
      <ul>
        {edges.map((edge) => (
          <li key={edge.relationship.id}>
            <div className="graph-connection-line">
              <div>
                <strong>{relationshipLabel(edge, campaign)}</strong>
                <button
                  className="link-button"
                  onClick={() => onSelectEntity(
                    edge.source.entity.id === focusedId ? edge.target.entity.id : edge.source.entity.id,
                  )}
                  type="button"
                >
                  {otherEntityName(edge, focusedId)}
                </button>
              </div>
              {onArchiveFact && <button
                aria-label={`Отменить факт: ${relationshipLabel(edge, campaign)} ${otherEntityName(edge, focusedId)}`}
                className="graph-cancel-fact"
                onClick={() => onArchiveFact(edge.relationship.id)}
                title="Отменить факт"
                type="button"
              >↶</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CampaignGraph({
  campaign,
  entityIds,
  isFiltered = false,
  interactionBlocked = false,
  onCreateEntity,
  onOpenEntity,
  onCreateFact,
  onArchiveFact,
  onUpdatePredicate,
  onArchivePredicate,
  onUpdateHotbarSlot,
}: CampaignGraphProps) {
  const [isLayoutEditing, setIsLayoutEditing] = useState(false)
  const [isCanvasMaximized, setIsCanvasMaximized] = useState(false)
  const [positions, setPositions] = useState<CampaignGraphNodePositions>({})
  const positionsRef = useRef<CampaignGraphNodePositions>({})
  const [edgeRoutes, setEdgeRoutes] = useState<CampaignGraphEdgeRoutes>({})
  const edgeRoutesRef = useRef<CampaignGraphEdgeRoutes>({})
  const [dragState, setDragState] = useState<GraphDragState>()
  const [factDragState, setFactDragState] = useState<FactDragState>()
  const edgeRouteDragStateRef = useRef<EdgeRouteDragState | undefined>(undefined)
  const [panState, setPanState] = useState<CanvasPanState>()
  const [layoutStatus, setLayoutStatus] = useState('')
  const [focusedId, setFocusedId] = useState<string>()
  const [isFactComposerOpen, setIsFactComposerOpen] = useState(false)
  const [factTargetId, setFactTargetId] = useState('')
  const [factPredicateId, setFactPredicateId] = useState('')
  const [newPredicateDirectLabel, setNewPredicateDirectLabel] = useState('')
  const [newPredicateInverseLabel, setNewPredicateInverseLabel] = useState('')
  const [newPredicateDirected, setNewPredicateDirected] = useState(true)
  const [factStatus, setFactStatus] = useState('')
  const [isPredicateManagerOpen, setIsPredicateManagerOpen] = useState(false)
  const [editingPredicateId, setEditingPredicateId] = useState('')
  const [editPredicateDirectLabel, setEditPredicateDirectLabel] = useState('')
  const [editPredicateInverseLabel, setEditPredicateInverseLabel] = useState('')
  const [editPredicateDescription, setEditPredicateDescription] = useState('')
  const [predicateManagerStatus, setPredicateManagerStatus] = useState('')
  const [activeHotbarSlot, setActiveHotbarSlot] = useState<number>()
  const [quickFactSourceId, setQuickFactSourceId] = useState<string>()
  const [editingHotbarSlot, setEditingHotbarSlot] = useState<number>()
  const [hotbarLabel, setHotbarLabel] = useState('')
  const [hotbarPredicateId, setHotbarPredicateId] = useState('')
  const [hotbarDirected, setHotbarDirected] = useState(true)
  const [hotbarDescription, setHotbarDescription] = useState('')
  const [hotbarStatus, setHotbarStatus] = useState('')
  const [newEntityShortcut, setNewEntityShortcut] = useState(DEFAULT_NEW_ENTITY_SHORTCUT)
  const [shortcutDraft, setShortcutDraft] = useState(DEFAULT_NEW_ENTITY_SHORTCUT)
  const [isShortcutEditorOpen, setIsShortcutEditorOpen] = useState(false)
  const [shortcutStatus, setShortcutStatus] = useState('')
  const [viewport, setViewport] = useState<CanvasViewport>({ centerX: 480, centerY: 160, zoom: 1 })
  const viewportRef = useRef(viewport)
  const svgRef = useRef<SVGSVGElement>(null)
  const maximizedScrollRef = useRef({ x: 0, y: 0 })
  const layoutRepository = useMemo(() => {
    try {
      return new LocalGraphLayoutRepository(window.localStorage)
    } catch {
      return undefined
    }
  }, [])
  const routeRepository = useMemo(() => {
    try { return new LocalGraphRouteRepository(window.localStorage) } catch { return undefined }
  }, [])
  const viewportRepository = useMemo(() => {
    try { return new LocalCanvasViewportRepository(window.localStorage) } catch { return undefined }
  }, [])
  const shortcutRepository = useMemo(() => {
    try { return new LocalCanvasShortcutRepository(window.localStorage) } catch { return undefined }
  }, [])
  const automaticGraph = useMemo(
    () => buildCampaignGraph(campaign, { entityIds, view: 'world' }),
    [campaign, entityIds],
  )
  const positionedGraph = useMemo(
    () => applyCampaignGraphNodePositions(automaticGraph, positions),
    [automaticGraph, positions],
  )
  const graph = useMemo(
    () => applyCampaignGraphEdgeRoutes(positionedGraph, edgeRoutes),
    [edgeRoutes, positionedGraph],
  )
  const context = focusedId ? getFocusedGraphContext(graph, focusedId) : undefined
  const activePredicates = campaign.predicates.filter((predicate) => predicate.status !== 'archived')
  const customPredicates = activePredicates.filter((predicate) => !predicate.systemType)
  const activeHotbarPreset = activeHotbarSlot
    ? campaign.hotbar.find((item) => item.slot === activeHotbarSlot)?.preset
    : undefined
  const similarPredicates = useMemo(
    () => findSimilarPredicates(activePredicates, newPredicateDirectLabel),
    [activePredicates, newPredicateDirectLabel],
  )
  const factPredicateRecommendations = useMemo(() => recommendPredicatesForEntities(
    campaign.entities.find((entity) => entity.id === focusedId && entity.status !== 'archived'),
    campaign.entities.find((entity) => entity.id === factTargetId && entity.status !== 'archived'),
    activePredicates,
  ), [activePredicates, campaign.entities, factTargetId, focusedId])

  useEffect(() => {
    if (!layoutRepository) {
      positionsRef.current = {}
      setPositions({})
      setLayoutStatus(ru.graphLayoutStorageError)
      return
    }
    try {
      const loaded = layoutRepository.load(campaign.id, 'world')
      positionsRef.current = loaded
      setPositions(loaded)
      setLayoutStatus(Object.keys(loaded).length > 0 ? ru.graphLayoutLoaded : '')
    } catch {
      positionsRef.current = {}
      setPositions({})
      setLayoutStatus(ru.graphLayoutStorageError)
    }
  }, [campaign.id, layoutRepository])

  useEffect(() => {
    const loaded = routeRepository?.load(campaign.id, 'world') ?? {}
    edgeRoutesRef.current = loaded
    setEdgeRoutes(loaded)
  }, [campaign.id, routeRepository])

  useEffect(() => {
    const next = clampViewport(
      viewportRepository?.load(campaign.id, 'knowledge') ?? centeredViewport(automaticGraph.width, automaticGraph.height),
      automaticGraph.width,
      automaticGraph.height,
    )
    viewportRef.current = next
    setViewport(next)
  }, [automaticGraph.height, automaticGraph.width, campaign.id, viewportRepository])

  useEffect(() => { viewportRef.current = viewport }, [viewport])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomWithWheel(event.clientX, event.clientY, event.deltaY, svg.getBoundingClientRect())
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [campaign.id, graph.height, graph.width, viewportRepository])

  useEffect(() => {
    const loaded = shortcutRepository?.loadNewEntityShortcut() ?? DEFAULT_NEW_ENTITY_SHORTCUT
    setNewEntityShortcut(loaded)
    setShortcutDraft(loaded)
  }, [shortcutRepository])

  useEffect(() => {
    if (focusedId && !graph.nodes.some((node) => node.entity.id === focusedId)) {
      setFocusedId(undefined)
    }
  }, [focusedId, graph.nodes])

  useEffect(() => {
    setActiveHotbarSlot(undefined)
    setQuickFactSourceId(undefined)
    setEditingHotbarSlot(undefined)
  }, [campaign.id])

  useEffect(() => {
    if (!interactionBlocked) return
    setActiveHotbarSlot(undefined)
    setQuickFactSourceId(undefined)
  }, [interactionBlocked])

  useEffect(() => {
    if (!activeHotbarPreset) return
    const predicate = campaign.predicates.find((item) => item.id === activeHotbarPreset.predicateId)
    if (!predicate || predicate.status === 'archived') {
      setActiveHotbarSlot(undefined)
      setQuickFactSourceId(undefined)
      setHotbarStatus('Активный слот отключён: предикат больше недоступен.')
    }
  }, [activeHotbarPreset, campaign.predicates])

  useEffect(() => {
    if (!isCanvasMaximized) return
    document.body.classList.add('has-maximized-canvas')
    function closeMaximizedCanvas(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      setIsCanvasMaximized(false)
    }
    window.addEventListener('keydown', closeMaximizedCanvas)
    return () => {
      document.body.classList.remove('has-maximized-canvas')
      window.removeEventListener('keydown', closeMaximizedCanvas)
      const { x, y } = maximizedScrollRef.current
      window.requestAnimationFrame(() => window.scrollTo(x, y))
    }
  }, [isCanvasMaximized])

  function toggleCanvasMaximized() {
    setIsCanvasMaximized((current) => {
      if (!current) maximizedScrollRef.current = { x: window.scrollX, y: window.scrollY }
      return !current
    })
  }

  function savePositions(next: CampaignGraphNodePositions) {
    positionsRef.current = next
    setPositions(next)
    try {
      if (!layoutRepository) throw new Error('Local storage is unavailable')
      layoutRepository.save(campaign.id, 'world', next)
      setLayoutStatus(ru.graphLayoutSaved)
    } catch {
      setLayoutStatus(ru.graphLayoutStorageError)
    }
  }

  function clampPosition(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.min(
        graph.width - GRAPH_NODE_WIDTH / 2 - GRAPH_ROUTE_CLEARANCE,
        Math.max(GRAPH_NODE_WIDTH / 2 + GRAPH_ROUTE_CLEARANCE, x),
      ),
      y: Math.min(
        graph.height - GRAPH_NODE_HEIGHT / 2 - GRAPH_ROUTE_CLEARANCE,
        Math.max(GRAPH_NODE_HEIGHT / 2 + GRAPH_ROUTE_CLEARANCE, y),
      ),
    }
  }

  function pointerPosition(event: ReactPointerEvent<SVGElement>): { x: number; y: number } | undefined {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return undefined
    const matrix = svg.getScreenCTM()
    if (!matrix) return undefined
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return { x: transformed.x, y: transformed.y }
  }

  function openFactComposer(sourceId: string, targetId = '') {
    setActiveHotbarSlot(undefined)
    setQuickFactSourceId(undefined)
    setIsPredicateManagerOpen(false)
    setFocusedId(sourceId)
    setFactTargetId(targetId)
    setIsFactComposerOpen(true)
    setFactStatus('')
  }

  function openPredicateManager() {
    setActiveHotbarSlot(undefined)
    setQuickFactSourceId(undefined)
    setFocusedId(undefined)
    setIsFactComposerOpen(false)
    setIsPredicateManagerOpen(true)
    setPredicateManagerStatus('')
  }

  function openHotbarEditor(slotNumber: number) {
    const preset = campaign.hotbar.find((item) => item.slot === slotNumber)?.preset
    const predicate = preset ? campaign.predicates.find((item) => item.id === preset.predicateId) : undefined
    setActiveHotbarSlot(undefined)
    setQuickFactSourceId(undefined)
    setEditingHotbarSlot(slotNumber)
    setHotbarLabel(preset?.label ?? predicate?.directLabel ?? '')
    setHotbarPredicateId(preset?.predicateId ?? '')
    setHotbarDirected(preset?.directed ?? true)
    setHotbarDescription(preset?.description ?? '')
    setHotbarStatus('')
  }

  function toggleHotbarSlot(slotNumber: number) {
    const slot = campaign.hotbar.find((item) => item.slot === slotNumber)
    const predicate = slot?.preset && campaign.predicates.find((item) => item.id === slot.preset?.predicateId)
    if (!slot?.preset || !predicate || predicate.status === 'archived') {
      openHotbarEditor(slotNumber)
      return
    }
    setEditingHotbarSlot(undefined)
    setIsFactComposerOpen(false)
    setIsPredicateManagerOpen(false)
    setFocusedId(undefined)
    setQuickFactSourceId(undefined)
    setActiveHotbarSlot((current) => current === slotNumber ? undefined : slotNumber)
    setHotbarStatus(activeHotbarSlot === slotNumber
      ? 'Быстрый инструмент выключен.'
      : `Режим «${slot.preset.label}»: выберите источник и цель.`)
  }

  async function submitHotbarSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingHotbarSlot || !onUpdateHotbarSlot) return
    setHotbarStatus('')
    try {
      await onUpdateHotbarSlot(editingHotbarSlot, {
        type: 'create_fact', label: hotbarLabel, predicateId: hotbarPredicateId,
        directed: hotbarDirected, description: hotbarDescription,
      })
      setEditingHotbarSlot(undefined)
      setHotbarStatus('Слот сохранён в кампании.')
    } catch (caught) {
      setHotbarStatus(caught instanceof Error ? caught.message : 'Не удалось сохранить слот.')
    }
  }

  async function clearHotbarSlot() {
    if (!editingHotbarSlot || !onUpdateHotbarSlot) return
    try {
      await onUpdateHotbarSlot(editingHotbarSlot, undefined)
      setEditingHotbarSlot(undefined)
      setHotbarStatus('Слот очищен.')
    } catch (caught) {
      setHotbarStatus(caught instanceof Error ? caught.message : 'Не удалось очистить слот.')
    }
  }

  async function createQuickFact(sourceId: string, targetId: string) {
    if (!activeHotbarPreset || !onCreateFact) return
    setFactStatus('')
    try {
      await onCreateFact({
        sourceId, targetId, predicateId: activeHotbarPreset.predicateId,
        directed: activeHotbarPreset.directed,
        description: activeHotbarPreset.description,
      })
      setQuickFactSourceId(undefined)
      setFactStatus(`Факт «${activeHotbarPreset.label}» создан. Инструмент остаётся активным.`)
    } catch (caught) {
      setFactStatus(caught instanceof Error ? caught.message : 'Не удалось создать факт.')
    }
  }

  function selectQuickFactNode(entityId: string) {
    if (!activeHotbarPreset) {
      setFocusedId(entityId)
      return
    }
    if (!quickFactSourceId) {
      setQuickFactSourceId(entityId)
      setFactStatus('Источник выбран. Теперь выберите цель.')
      return
    }
    if (quickFactSourceId === entityId) {
      setQuickFactSourceId(undefined)
      setFactStatus('Выбор источника сброшен.')
      return
    }
    void createQuickFact(quickFactSourceId, entityId)
  }

  function startPredicateEditing(predicateId: string) {
    const predicate = customPredicates.find((item) => item.id === predicateId)
    if (!predicate) return
    setEditingPredicateId(predicate.id)
    setEditPredicateDirectLabel(predicate.directLabel)
    setEditPredicateInverseLabel(predicate.inverseLabel)
    setEditPredicateDescription(predicate.description)
    setPredicateManagerStatus('')
  }

  async function submitPredicateUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingPredicateId || !onUpdatePredicate) return
    setPredicateManagerStatus('')
    try {
      await onUpdatePredicate(editingPredicateId, {
        directLabel: editPredicateDirectLabel,
        inverseLabel: editPredicateInverseLabel,
        description: editPredicateDescription,
      })
      setEditingPredicateId('')
      setPredicateManagerStatus('Предикат обновлён. Названия во всех фактах изменились автоматически.')
    } catch (caught) {
      setPredicateManagerStatus(caught instanceof Error ? caught.message : 'Не удалось обновить предикат.')
    }
  }

  async function archivePredicate(predicateId: string) {
    if (!onArchivePredicate) return
    const predicate = customPredicates.find((item) => item.id === predicateId)
    if (!predicate || !window.confirm(`Архивировать предикат «${predicate.directLabel} / ${predicate.inverseLabel}»? Он исчезнет из списка выбора, но останется в истории.`)) return
    setPredicateManagerStatus('')
    try {
      await onArchivePredicate(predicateId)
      if (editingPredicateId === predicateId) setEditingPredicateId('')
      setPredicateManagerStatus('Предикат перенесён в архив.')
    } catch (caught) {
      setPredicateManagerStatus(caught instanceof Error ? caught.message : 'Не удалось архивировать предикат.')
    }
  }

  function startFactDrag(event: ReactPointerEvent<SVGCircleElement>, node: CampaignGraphNode) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = node.x + GRAPH_NODE_WIDTH / 2
    const startY = node.y
    if (!activeHotbarPreset) setFocusedId(node.entity.id)
    setFactDragState({ sourceId: node.entity.id, pointerId: event.pointerId, startX, startY, currentX: startX, currentY: startY })
  }

  function moveFactDrag(event: ReactPointerEvent<SVGCircleElement>) {
    if (!factDragState || event.pointerId !== factDragState.pointerId) return
    const pointer = pointerPosition(event)
    if (!pointer) return
    setFactDragState((current) => current ? { ...current, currentX: pointer.x, currentY: pointer.y } : current)
  }

  function finishFactDrag(event: ReactPointerEvent<SVGCircleElement>) {
    if (!factDragState || event.pointerId !== factDragState.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const pointer = pointerPosition(event)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const sourceId = factDragState.sourceId
    setFactDragState(undefined)
    if (!pointer) return
    const target = graph.nodes.find((node) => node.entity.id !== sourceId &&
      Math.abs(pointer.x - node.x) <= GRAPH_NODE_WIDTH / 2 && Math.abs(pointer.y - node.y) <= GRAPH_NODE_HEIGHT / 2)
    if (target) {
      if (activeHotbarPreset) void createQuickFact(sourceId, target.entity.id)
      else openFactComposer(sourceId, target.entity.id)
    }
  }

  function startNodeDrag(event: ReactPointerEvent<SVGGElement>, node: CampaignGraphNode) {
    if (!isLayoutEditing) return
    const pointer = pointerPosition(event)
    if (!pointer) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragState({
      nodeId: node.entity.id,
      pointerId: event.pointerId,
      offsetX: node.x - pointer.x,
      offsetY: node.y - pointer.y,
    })
  }

  function moveNodeDrag(event: ReactPointerEvent<SVGGElement>) {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    const pointer = pointerPosition(event)
    if (!pointer) return
    const node = graph.nodes.find((item) => item.entity.id === dragState.nodeId)
    if (!node) return
    const position = clampPosition(pointer.x + dragState.offsetX, pointer.y + dragState.offsetY)
    const next = { ...positionsRef.current, [dragState.nodeId]: position }
    positionsRef.current = next
    setPositions(next)
  }

  function finishNodeDrag(event: ReactPointerEvent<SVGGElement>) {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragState(undefined)
    savePositions(positionsRef.current)
  }

  function activateNode(event: KeyboardEvent<SVGGElement>, node: CampaignGraphNode) {
    if (isLayoutEditing && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      const step = event.shiftKey ? 32 : 12
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      savePositions({
        ...positionsRef.current,
        [node.entity.id]: clampPosition(node.x + dx, node.y + dy),
      })
      setFocusedId(node.entity.id)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeHotbarPreset) selectQuickFactNode(node.entity.id)
      else {
        setFocusedId(node.entity.id)
        onOpenEntity?.(node.entity.id)
      }
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      selectQuickFactNode(node.entity.id)
    }
  }

  function resetLayout() {
    if (!window.confirm(ru.graphLayoutResetConfirm)) return
    try {
      if (!layoutRepository) throw new Error('Local storage is unavailable')
      layoutRepository.clear(campaign.id, 'world')
      routeRepository?.clear(campaign.id, 'world')
      positionsRef.current = {}
      edgeRoutesRef.current = {}
      setPositions({})
      setEdgeRoutes({})
      setLayoutStatus(ru.graphLayoutReset)
    } catch {
      setLayoutStatus(ru.graphLayoutStorageError)
    }
  }

  function saveEdgeRoutes(next: CampaignGraphEdgeRoutes) {
    edgeRoutesRef.current = next
    setEdgeRoutes(next)
    try {
      if (!routeRepository) throw new Error('Local storage is unavailable')
      routeRepository.save(campaign.id, 'world', next)
      setLayoutStatus('Маршрут линии сохранён локально.')
    } catch { setLayoutStatus(ru.graphLayoutStorageError) }
  }

  function startEdgeRouteDrag(event: ReactPointerEvent<SVGCircleElement>, relationshipId: string) {
    if (!isLayoutEditing) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = { relationshipId, pointerId: event.pointerId }
    edgeRouteDragStateRef.current = next
  }

  function moveEdgeRouteDrag(event: ReactPointerEvent<SVGElement>) {
    const activeDrag = edgeRouteDragStateRef.current
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
    const point = pointerPosition(event)
    if (!point) return
    const next = { ...edgeRoutesRef.current, [activeDrag.relationshipId]: point }
    edgeRoutesRef.current = next
    setEdgeRoutes(next)
  }

  function finishEdgeRouteDrag(event: ReactPointerEvent<SVGElement>) {
    const activeDrag = edgeRouteDragStateRef.current
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    edgeRouteDragStateRef.current = undefined
    saveEdgeRoutes(edgeRoutesRef.current)
  }

  function moveEdgeRouteWithKeyboard(event: KeyboardEvent<SVGCircleElement>, edge: CampaignGraphEdge) {
    if (!isLayoutEditing || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 32 : 12
    const current = edgeRoutesRef.current[edge.relationship.id] ?? { x: edge.labelX, y: edge.labelY + 8 }
    saveEdgeRoutes({
      ...edgeRoutesRef.current,
      [edge.relationship.id]: {
        x: current.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        y: current.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
      },
    })
  }

  function resetEdgeRoute(relationshipId: string) {
    const { [relationshipId]: _removed, ...next } = edgeRoutesRef.current
    saveEdgeRoutes(next)
  }

  function persistViewport(next: CanvasViewport, message = 'Положение канвы сохранено локально.') {
    const normalized = clampViewport(next, graph.width, graph.height)
    viewportRef.current = normalized
    setViewport(normalized)
    try {
      if (!viewportRepository) throw new Error('Local storage is unavailable')
      viewportRepository.save(campaign.id, 'knowledge', normalized)
      setLayoutStatus(message)
    } catch { setLayoutStatus('Не удалось сохранить положение канвы на этом устройстве.') }
  }

  function changeZoom(delta: number) {
    persistViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom + delta })
  }

  function resetViewport() {
    const next = centeredViewport(graph.width, graph.height)
    viewportRef.current = next
    setViewport(next)
    try {
      viewportRepository?.clear(campaign.id, 'knowledge')
      setLayoutStatus('Обзор канвы восстановлен.')
    } catch { setLayoutStatus('Обзор восстановлен без сохранения настройки.') }
  }

  function startPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || (event.target as Element).closest('.graph-node, .graph-edge-route-handle')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setFocusedId(undefined)
    setPanState({ pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startViewport: viewportRef.current })
  }

  function movePan(event: ReactPointerEvent<SVGSVGElement>) {
    if (!panState || panState.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const visibleWidth = graph.width / panState.startViewport.zoom
    const visibleHeight = graph.height / panState.startViewport.zoom
    const next = clampViewport({
      ...panState.startViewport,
      centerX: panState.startViewport.centerX - (event.clientX - panState.startClientX) * visibleWidth / bounds.width,
      centerY: panState.startViewport.centerY - (event.clientY - panState.startClientY) * visibleHeight / bounds.height,
    }, graph.width, graph.height)
    viewportRef.current = next
    setViewport(next)
  }

  function finishPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (!panState || panState.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setPanState(undefined)
    persistViewport(viewportRef.current)
  }

  function zoomWithWheel(clientX: number, clientY: number, deltaY: number, bounds: DOMRect) {
    const current = viewportRef.current
    const currentWidth = graph.width / current.zoom
    const currentHeight = graph.height / current.zoom
    const relativeX = (clientX - bounds.left) / bounds.width
    const relativeY = (clientY - bounds.top) / bounds.height
    const pointerX = current.centerX - currentWidth / 2 + relativeX * currentWidth
    const pointerY = current.centerY - currentHeight / 2 + relativeY * currentHeight
    const nextZoom = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, current.zoom + (deltaY < 0 ? 0.1 : -0.1)))
    const nextWidth = graph.width / nextZoom
    const nextHeight = graph.height / nextZoom
    persistViewport({
      zoom: nextZoom,
      centerX: pointerX + (0.5 - relativeX) * nextWidth,
      centerY: pointerY + (0.5 - relativeY) * nextHeight,
    }, `Масштаб канвы: ${Math.round(nextZoom * 100)}%.`)
  }

  function saveShortcut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const normalized = normalizeCanvasShortcut(shortcutDraft)
      const saved = shortcutRepository?.saveNewEntityShortcut(normalized) ?? normalized
      setNewEntityShortcut(saved)
      setShortcutDraft(saved)
      setShortcutStatus(`Клавиша создания сущности: ${canvasShortcutLabel(saved)}.`)
      setIsShortcutEditorOpen(false)
    } catch (caught) { setShortcutStatus(caught instanceof Error ? caught.message : 'Не удалось сохранить клавишу.') }
  }

  function resetShortcut() {
    shortcutRepository?.resetNewEntityShortcut()
    setNewEntityShortcut(DEFAULT_NEW_ENTITY_SHORTCUT)
    setShortcutDraft(DEFAULT_NEW_ENTITY_SHORTCUT)
    setShortcutStatus(`Восстановлена клавиша ${canvasShortcutLabel(DEFAULT_NEW_ENTITY_SHORTCUT)}.`)
  }

  function isConnected(edge: CampaignGraphEdge): boolean {
    return !focusedId || edge.source.entity.id === focusedId || edge.target.entity.id === focusedId
  }

  async function submitFact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!focusedId || !onCreateFact) return
    setFactStatus('')
    try {
      await onCreateFact({
        sourceId: focusedId,
        targetId: factTargetId,
        predicateId: factPredicateId === '__new__' ? undefined : factPredicateId,
        newPredicate: factPredicateId === '__new__' ? {
          directLabel: newPredicateDirectLabel,
          inverseLabel: newPredicateInverseLabel,
          directed: newPredicateDirected,
        } : undefined,
      })
      setIsFactComposerOpen(false)
      setFactTargetId('')
      setFactPredicateId('')
      setNewPredicateDirectLabel('')
      setNewPredicateInverseLabel('')
      setFactStatus('Факт создан и добавлен в историю.')
    } catch (caught) {
      setFactStatus(caught instanceof Error ? caught.message : 'Не удалось создать факт.')
    }
  }

  function handleCanvasShortcut(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const hotbarShortcut = resolveHotbarShortcut({
      key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      targetTagName: target.tagName, isContentEditable: target.isContentEditable,
    })
    if (hotbarShortcut === 'escape' && activeHotbarSlot) {
      event.preventDefault()
      event.stopPropagation()
      setActiveHotbarSlot(undefined)
      setQuickFactSourceId(undefined)
      setHotbarStatus('Быстрый инструмент выключен.')
      return
    }
    if (typeof hotbarShortcut === 'number') {
      event.preventDefault()
      toggleHotbarSlot(hotbarShortcut)
      return
    }
    if (hotbarShortcut === undefined && (event.ctrlKey || event.metaKey || event.altKey ||
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable)) return
    if (!matchesCanvasShortcut(event.key, newEntityShortcut)) return

    event.preventDefault()
    onCreateEntity?.()
  }

  const viewWidth = graph.width / viewport.zoom
  const viewHeight = graph.height / viewport.zoom
  const viewBox = `${viewport.centerX - viewWidth / 2} ${viewport.centerY - viewHeight / 2} ${viewWidth} ${viewHeight}`

  return (
    <section className={`campaign-graph-section${isCanvasMaximized ? ' is-maximized' : ''}`} aria-labelledby="campaign-graph-heading">
      <div className="graph-heading">
        <div>
          <p className="overline">Единое рабочее пространство</p>
          <h2 id="campaign-graph-heading">{ru.campaignGraph}</h2>
          <p>{ru.graphHint}</p>
        </div>
        <div className="graph-heading-actions">
          <button className="button button-primary graph-create-entity" onClick={onCreateEntity} type="button">
            <span aria-hidden="true">+</span> Новая сущность <span className="graph-create-shortcut">{canvasShortcutLabel(newEntityShortcut)}</span>
          </button>
          <div className="graph-layout-actions">
            <button aria-expanded={isShortcutEditorOpen} onClick={() => setIsShortcutEditorOpen((current) => !current)} type="button">
              Настроить клавишу
            </button>
            <button aria-pressed={isPredicateManagerOpen} className={isPredicateManagerOpen ? 'is-active' : ''} onClick={openPredicateManager} type="button">
              Предикаты
            </button>
            <button aria-pressed={isCanvasMaximized} onClick={toggleCanvasMaximized} type="button">
              {isCanvasMaximized ? 'Свернуть канвас' : 'На весь экран'}
            </button>
            <button
              aria-pressed={isLayoutEditing}
              className={isLayoutEditing ? 'is-active' : ''}
              onClick={() => setIsLayoutEditing((current) => !current)}
              type="button"
            >
              {isLayoutEditing ? ru.finishGraphLayout : ru.editGraphLayout}
            </button>
            <div className="logic-viewport-actions" role="group" aria-label="Масштаб канвы знаний">
              <button aria-label="Уменьшить масштаб" disabled={viewport.zoom <= MIN_CANVAS_ZOOM} onClick={() => changeZoom(-0.1)} type="button">−</button>
              <button aria-label="Вернуть обзор" onClick={resetViewport} type="button">{Math.round(viewport.zoom * 100)}%</button>
              <button aria-label="Увеличить масштаб" disabled={viewport.zoom >= MAX_CANVAS_ZOOM} onClick={() => changeZoom(0.1)} type="button">+</button>
            </div>
            <button disabled={Object.keys(positions).length === 0 && Object.keys(edgeRoutes).length === 0} onClick={resetLayout} type="button">
              {ru.resetGraphLayout}
            </button>
          </div>
        </div>
      </div>

      {isShortcutEditorOpen && <form className="graph-shortcut-editor" onSubmit={saveShortcut}>
        <label htmlFor="new-entity-shortcut">Клавиша новой сущности</label>
        <input
          autoFocus
          id="new-entity-shortcut"
          maxLength={1}
          onChange={(event) => { setShortcutDraft(event.target.value); setShortcutStatus('') }}
          required
          value={shortcutDraft.toLocaleUpperCase('ru-RU')}
        />
        <span>Одна буква. Соответствующая клавиша русской или английской раскладки тоже сработает.</span>
        <button className="button button-primary" type="submit">Сохранить</button>
        <button className="button button-ghost" onClick={resetShortcut} type="button">Вернуть N / Т</button>
      </form>}
      {shortcutStatus && <p className="graph-shortcut-status" aria-live="polite">{shortcutStatus}</p>}

      <div className="graph-status-row">
        <div className="graph-legend" aria-label="Легенда графа">
          <span className="graph-legend-arrow" aria-hidden="true">→</span>
          {ru.directedRelationship}
        </div>
        <p aria-live="polite">
          {isLayoutEditing ? ru.graphLayoutHint : layoutStatus}
        </p>
      </div>

      {graph.nodes.length === 0 && !isPredicateManagerOpen ? (
        <div className="graph-empty">
          <img src="/vista-point-mark.svg" alt="" aria-hidden="true" />
          <p>{isFiltered ? ru.graphFilteredEmpty : ru.graphEmpty}</p>
        </div>
      ) : (
        <div className="graph-layout">
          <div className="graph-canvas-stack">
            <div className="graph-scroll" onKeyDown={handleCanvasShortcut} tabIndex={0} aria-label={`Область графа знаний. ${canvasShortcutLabel(newEntityShortcut)} создаёт сущность, 1–0 включают быстрые инструменты.`}>
            <svg
              ref={svgRef}
              className={`campaign-graph${isLayoutEditing ? ' is-layout-editing' : ''}${panState ? ' is-panning' : ''}`}
              onPointerCancel={(event) => { finishPan(event); finishEdgeRouteDrag(event) }}
              onPointerDown={startPan}
              onPointerMove={(event) => { movePan(event); moveEdgeRouteDrag(event) }}
              onPointerUp={(event) => { finishPan(event); finishEdgeRouteDrag(event) }}
              role="img"
              aria-labelledby="campaign-graph-title campaign-graph-description"
              viewBox={viewBox}
            >
              <title id="campaign-graph-title">{`Граф знаний проекта «${campaign.name}»`}</title>
              <desc id="campaign-graph-description">
                Сущности кампании и типизированные связи между ними. Выберите узел, чтобы изучить его связи.
              </desc>
              <defs>
                <marker id="graph-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M 0 0 L 8 4 L 0 8 z" />
                </marker>
              </defs>

              <g aria-hidden={isLayoutEditing ? undefined : true}>
                {graph.edges.map((edge) => (
                  <g
                    className={`graph-edge${isConnected(edge) ? '' : ' is-muted'}${
                      focusedId && isConnected(edge) ? ' is-focused' : ''
                    }`}
                    key={edge.relationship.id}
                  >
                    <path
                      className="graph-edge-route"
                      d={edge.path}
                      markerEnd={edge.relationship.directed ? 'url(#graph-arrow)' : undefined}
                    />
                    <text x={edge.labelX} y={edge.labelY} textAnchor="middle">
                      {relationshipLabel(edge, campaign)}
                    </text>
                    {isLayoutEditing && <circle
                      aria-label={`Изменить маршрут связи ${relationshipLabel(edge, campaign)}`}
                      className="graph-edge-route-handle"
                      cx={edgeRoutes[edge.relationship.id]?.x ?? edge.labelX}
                      cy={edgeRoutes[edge.relationship.id]?.y ?? edge.labelY + 8}
                      onDoubleClick={(event) => { event.stopPropagation(); resetEdgeRoute(edge.relationship.id) }}
                      onKeyDown={(event) => moveEdgeRouteWithKeyboard(event, edge)}
                      onPointerCancel={finishEdgeRouteDrag}
                      onPointerDown={(event) => startEdgeRouteDrag(event, edge.relationship.id)}
                      onPointerMove={moveEdgeRouteDrag}
                      onPointerUp={finishEdgeRouteDrag}
                      r="7"
                      role="button"
                      tabIndex={0}
                    />}
                  </g>
                ))}
              </g>
              {factDragState && <path
                className="graph-fact-draft"
                d={`M ${factDragState.startX} ${factDragState.startY} L ${factDragState.currentX} ${factDragState.currentY}`}
                markerEnd="url(#graph-arrow)"
              />}

              {graph.nodes.map((node) => {
                const selected = focusedId === node.entity.id
                const connected = Boolean(factDragState) || !focusedId || selected || graph.edges.some(
                  (edge) => isConnected(edge) && (
                    edge.source.entity.id === node.entity.id || edge.target.entity.id === node.entity.id
                  ),
                )
                return (
                  <g
                    aria-label={`${node.entity.name}, ${entityTypeLabel(campaign, node.entity)}`}
                    aria-pressed={selected}
                    className={`graph-node${selected ? ' is-selected' : ''}${quickFactSourceId === node.entity.id ? ' is-quick-source' : ''}${connected ? '' : ' is-muted'}`}
                    key={node.entity.id}
                    onClick={() => selectQuickFactNode(node.entity.id)}
                    onDoubleClick={() => onOpenEntity?.(node.entity.id)}
                    onKeyDown={(event) => activateNode(event, node)}
                    onPointerCancel={finishNodeDrag}
                    onPointerDown={(event) => startNodeDrag(event, node)}
                    onPointerMove={moveNodeDrag}
                    onPointerUp={finishNodeDrag}
                    role="button"
                    tabIndex={0}
                    transform={`translate(${node.x - GRAPH_NODE_WIDTH / 2} ${node.y - GRAPH_NODE_HEIGHT / 2})`}
                  >
                    <rect height={GRAPH_NODE_HEIGHT} rx="12" width={GRAPH_NODE_WIDTH} />
                    {node.entity.image
                      ? <image className="graph-node-image" height="54" href={node.entity.image.dataUrl} preserveAspectRatio="xMidYMid slice" width="44" x="12" y="14" />
                      : <circle cx="18" cy="20" r="4" />}
                    <text className="graph-node-type" x={node.entity.image ? 66 : 30} y="24">
                      {entityTypeLabel(campaign, node.entity)}
                    </text>
                    <text className="graph-node-name" x={node.entity.image ? 66 : 16} y="52">
                      {shortened(node.entity.name, node.entity.image ? 16 : 23)}
                    </text>
                    {node.context.length > 0 && <text className="graph-node-context" x="16" y="78">
                      {shortened(node.context.map((entity) => entity.name).join(' › '), 27)}
                    </text>}
                    <circle
                      aria-label={`Начать связь от ${node.entity.name}`}
                      className="graph-node-link-handle"
                      cx={GRAPH_NODE_WIDTH}
                      cy={GRAPH_NODE_HEIGHT / 2}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          event.stopPropagation()
                          if (activeHotbarPreset) selectQuickFactNode(node.entity.id)
                          else openFactComposer(node.entity.id)
                        }
                      }}
                      onPointerCancel={finishFactDrag}
                      onPointerDown={(event) => startFactDrag(event, node)}
                      onPointerMove={moveFactDrag}
                      onPointerUp={finishFactDrag}
                      r="7"
                      role="button"
                      tabIndex={0}
                    />
                  </g>
                )
              })}
            </svg>
            </div>
            {context && !isPredicateManagerOpen && <GraphEntityPopover
              entity={context.node.entity}
              incomingCount={context.incoming.length}
              mutualCount={context.mutual.length}
              onClose={() => setFocusedId(undefined)}
              onOpenEntity={(entityId) => onOpenEntity?.(entityId)}
              outgoingCount={context.outgoing.length}
              typeLabel={entityTypeLabel(campaign, context.node.entity)}
            />}
            <div className="graph-hotbar" aria-label="Быстрые инструменты">
              {campaign.hotbar.map((slot) => {
                const predicate = slot.preset && campaign.predicates.find((item) => item.id === slot.preset?.predicateId)
                const invalid = Boolean(slot.preset && (!predicate || predicate.status === 'archived'))
                return <div className="graph-hotbar-slot" key={slot.slot}>
                  <button
                    aria-pressed={activeHotbarSlot === slot.slot}
                    className={activeHotbarSlot === slot.slot ? 'is-active' : invalid ? 'is-invalid' : ''}
                    onClick={() => toggleHotbarSlot(slot.slot)}
                    title={invalid ? 'Предикат недоступен — настройте слот' : slot.preset?.label ?? 'Настроить слот'}
                    type="button"
                  >
                    <kbd>{slot.slot === 10 ? 0 : slot.slot}</kbd>
                    <span>{invalid ? 'Настроить' : slot.preset?.label ?? '+'}</span>
                  </button>
                  {slot.preset && <button aria-label={`Изменить слот ${slot.slot === 10 ? 0 : slot.slot}`} className="graph-hotbar-edit" onClick={() => openHotbarEditor(slot.slot)} type="button">⋯</button>}
                </div>
              })}
            </div>
            {(activeHotbarPreset || hotbarStatus) && <p className="graph-hotbar-status" aria-live="polite">
              {activeHotbarPreset
                ? `Активно: ${activeHotbarPreset.label}. ${quickFactSourceId ? 'Выберите цель.' : 'Выберите источник.'} Esc — выйти.`
                : hotbarStatus}
            </p>}
            {editingHotbarSlot && <form className="graph-hotbar-editor" onSubmit={submitHotbarSlot}>
              <div><strong>Слот {editingHotbarSlot === 10 ? 0 : editingHotbarSlot}</strong><button aria-label="Закрыть настройку" className="text-button" onClick={() => setEditingHotbarSlot(undefined)} type="button">×</button></div>
              <label htmlFor="hotbar-label">Короткое название</label>
              <input id="hotbar-label" maxLength={28} onChange={(event) => setHotbarLabel(event.target.value)} required value={hotbarLabel} />
              <label htmlFor="hotbar-predicate">Предикат</label>
              <select id="hotbar-predicate" onChange={(event) => {
                const predicate = activePredicates.find((item) => item.id === event.target.value)
                setHotbarPredicateId(event.target.value)
                if (predicate) { setHotbarDirected(predicate.directed); if (!hotbarLabel) setHotbarLabel(predicate.directLabel) }
              }} required value={hotbarPredicateId}>
                <option value="">Выберите предикат</option>
                {activePredicates.map((predicate) => <option key={predicate.id} value={predicate.id}>{predicate.directLabel}</option>)}
              </select>
              <label className="graph-predicate-direction"><input checked={hotbarDirected} onChange={(event) => setHotbarDirected(event.target.checked)} type="checkbox" /> Направленный факт</label>
              <label htmlFor="hotbar-description">Описание по умолчанию</label>
              <textarea id="hotbar-description" onChange={(event) => setHotbarDescription(event.target.value)} rows={2} value={hotbarDescription} />
              <div><button className="button button-primary" type="submit">Сохранить</button>{campaign.hotbar.find((item) => item.slot === editingHotbarSlot)?.preset && <button className="button button-ghost" onClick={clearHotbarSlot} type="button">Очистить</button>}</div>
            </form>}
          </div>

          <aside className="graph-inspector" aria-live="polite">
            {isPredicateManagerOpen ? (
              <div className="graph-predicate-manager">
                <div className="graph-inspector-heading">
                  <div>
                    <span>Словарь связей</span>
                    <h3>Пользовательские предикаты</h3>
                  </div>
                  <button className="text-button" onClick={() => setIsPredicateManagerOpen(false)} type="button">Закрыть</button>
                </div>
                <p>Встроенные предикаты ({activePredicates.length - customPredicates.length}) защищены. Пользовательские можно переименовать или убрать, если они не используются.</p>
                {customPredicates.length === 0 ? (
                  <p className="graph-no-connections">Пользовательские предикаты появятся здесь после создания нового типа связи.</p>
                ) : (
                  <div className="graph-predicate-list">
                    {customPredicates.map((predicate) => {
                      const factCount = campaign.relationships.filter((fact) => fact.status !== 'archived' && fact.predicateId === predicate.id).length
                      return <article className="graph-predicate-row" key={predicate.id}>
                        {editingPredicateId === predicate.id ? (
                          <form className="graph-predicate-edit-form" onSubmit={submitPredicateUpdate}>
                            <label htmlFor={`predicate-direct-${predicate.id}`}>Прямое название</label>
                            <input id={`predicate-direct-${predicate.id}`} onChange={(event) => setEditPredicateDirectLabel(event.target.value)} required value={editPredicateDirectLabel} />
                            <label htmlFor={`predicate-inverse-${predicate.id}`}>Обратное название</label>
                            <input id={`predicate-inverse-${predicate.id}`} onChange={(event) => setEditPredicateInverseLabel(event.target.value)} required value={editPredicateInverseLabel} />
                            <label htmlFor={`predicate-description-${predicate.id}`}>Описание</label>
                            <textarea id={`predicate-description-${predicate.id}`} onChange={(event) => setEditPredicateDescription(event.target.value)} rows={2} value={editPredicateDescription} />
                            <div className="graph-predicate-row-actions">
                              <button className="button button-primary" type="submit">Сохранить</button>
                              <button className="button button-ghost" onClick={() => setEditingPredicateId('')} type="button">Отмена</button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div><strong>{predicate.directLabel}</strong><span>{predicate.inverseLabel}</span></div>
                            {predicate.description && <p>{predicate.description}</p>}
                            <small>{factCount === 0 ? 'Не используется' : `Фактов: ${factCount}`}</small>
                            <div className="graph-predicate-row-actions">
                              <button className="link-button" onClick={() => startPredicateEditing(predicate.id)} type="button">Изменить</button>
                              <button className="danger-link" onClick={() => archivePredicate(predicate.id)} type="button">В архив</button>
                            </div>
                          </>
                        )}
                      </article>
                    })}
                  </div>
                )}
                {predicateManagerStatus && <p className="graph-fact-status" aria-live="polite">{predicateManagerStatus}</p>}
              </div>
            ) : context ? (
              <>
                <div className="graph-inspector-heading">
                  <div>
                    <span>{entityTypeLabel(campaign, context.node.entity)}</span>
                    <h3>{context.node.entity.name}</h3>
                  </div>
                  <button className="text-button" onClick={() => setFocusedId(undefined)} type="button">
                    {ru.clearFocus}
                  </button>
                </div>
                <p>{context.node.entity.summary || ru.noEntitySummary}</p>
                {context.node.entity.characterTags.length > 0 && <div className="entity-character-tags" aria-label="Ролевые теги персонажа">
                  {context.node.entity.characterTags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>}
                <button className="button button-primary button-block" onClick={() => onOpenEntity?.(context.node.entity.id)} type="button">
                  Открыть карточку
                </button>
                <button className="button button-ghost button-block" onClick={() => {
                  setIsFactComposerOpen((current) => !current)
                  setFactStatus('')
                }} type="button">
                  {isFactComposerOpen ? 'Отменить связь' : 'Связать с сущностью'}
                </button>
                {isFactComposerOpen && <form className="graph-fact-composer" onSubmit={submitFact}>
                  <p><strong>{context.node.entity.name}</strong> →</p>
                  <label htmlFor="graph-fact-target">Целевая сущность</label>
                  <select id="graph-fact-target" onChange={(event) => setFactTargetId(event.target.value)} required value={factTargetId}>
                    <option value="">Выберите сущность</option>
                    {campaign.entities.filter((entity) => entity.status !== 'archived' && entity.id !== focusedId).map((entity) => (
                      <option key={entity.id} value={entity.id}>{entity.name}</option>
                    ))}
                  </select>
                  <label htmlFor="graph-fact-predicate">Предикат</label>
                  <select id="graph-fact-predicate" onChange={(event) => setFactPredicateId(event.target.value)} required value={factPredicateId}>
                    <option value="">Выберите предикат</option>
                    {factPredicateRecommendations.recommended.length > 0 && <optgroup label="Рекомендуются для этой пары">
                      {factPredicateRecommendations.recommended.map((predicate) => <option key={predicate.id} value={predicate.id}>{predicate.directLabel}</option>)}
                    </optgroup>}
                    <optgroup label={factPredicateRecommendations.recommended.length > 0 ? 'Все остальные' : 'Все предикаты'}>
                      {factPredicateRecommendations.other.map((predicate) => <option key={predicate.id} value={predicate.id}>{predicate.directLabel}</option>)}
                    </optgroup>
                    <option value="__new__">+ Новый предикат…</option>
                  </select>
                  {factTargetId && factPredicateRecommendations.recommended.length > 0 && <p className="graph-predicate-recommendation-hint">
                    Подсказка учитывает типы сущностей. Можно выбрать любой другой предикат.
                  </p>}
                  {factPredicateId === '__new__' && <div className="graph-new-predicate">
                    <label htmlFor="graph-predicate-direct">Прямое название</label>
                    <input id="graph-predicate-direct" onChange={(event) => setNewPredicateDirectLabel(event.target.value)} placeholder="Например, охраняет" required value={newPredicateDirectLabel} />
                    {similarPredicates.length > 0 && <div className="graph-predicate-suggestions">
                      <p>Возможно, такой предикат уже есть:</p>
                      {similarPredicates.map((predicate) => <button key={predicate.id} onClick={() => {
                        setFactPredicateId(predicate.id)
                        setNewPredicateDirectLabel('')
                        setNewPredicateInverseLabel('')
                      }} type="button">{predicate.directLabel} / {predicate.inverseLabel}</button>)}
                    </div>}
                    <label htmlFor="graph-predicate-inverse">Обратное название</label>
                    <input id="graph-predicate-inverse" onChange={(event) => setNewPredicateInverseLabel(event.target.value)} placeholder="Например, охраняется" required value={newPredicateInverseLabel} />
                    <label className="graph-predicate-direction"><input checked={newPredicateDirected} onChange={(event) => setNewPredicateDirected(event.target.checked)} type="checkbox" /> Направленный предикат</label>
                  </div>}
                  <button className="button button-primary button-block" type="submit">Создать факт</button>
                </form>}
                {factStatus && <p className="graph-fact-status" aria-live="polite">{factStatus}</p>}
                {context.incoming.length + context.outgoing.length + context.mutual.length === 0 ? (
                  <p className="graph-no-connections">{ru.noNodeConnections}</p>
                ) : (
                  <div className="graph-connections">
                    <ConnectionList campaign={campaign} edges={context.outgoing} focusedId={focusedId!} onArchiveFact={onArchiveFact} onSelectEntity={setFocusedId} title={ru.outgoingRelationships} />
                    <ConnectionList campaign={campaign} edges={context.incoming} focusedId={focusedId!} onArchiveFact={onArchiveFact} onSelectEntity={setFocusedId} title={ru.incomingRelationships} />
                    <ConnectionList campaign={campaign} edges={context.mutual} focusedId={focusedId!} onArchiveFact={onArchiveFact} onSelectEntity={setFocusedId} title={ru.mutualRelationships} />
                  </div>
                )}
              </>
            ) : (
              <div className="graph-inspector-empty">
                <span aria-hidden="true">◎</span>
                <h3>{ru.graphInspectorTitle}</h3>
                <p>{ru.graphInspectorHint}</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}
