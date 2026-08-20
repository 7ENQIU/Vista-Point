import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  applyCampaignGraphNodePositions,
  buildCampaignGraph,
  getFocusedGraphContext,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  type CampaignGraphEdge,
  type CampaignGraphNode,
  type CampaignGraphNodePositions,
  type CampaignGraphView,
} from '../application/campaigns/buildCampaignGraph'
import type { Campaign } from '../domain/campaign/types'
import { LocalGraphLayoutRepository } from '../infrastructure/storage/LocalGraphLayoutRepository'
import { ru } from '../shared/i18n/ru'

interface CampaignGraphProps {
  campaign: Campaign
  entityIds?: readonly string[]
  isFiltered?: boolean
}

interface GraphDragState {
  nodeId: string
  pointerId: number
  offsetX: number
  offsetY: number
}

function shortened(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function otherEntityName(edge: CampaignGraphEdge, focusedId: string): string {
  return edge.source.entity.id === focusedId ? edge.target.entity.name : edge.source.entity.name
}

function relationshipLabel(edge: CampaignGraphEdge): string {
  return edge.displayType === 'includes_participant'
    ? ru.graphRelationshipTypes.includes_participant
    : ru.relationshipTypes[edge.displayType]
}

function ConnectionList({
  edges,
  focusedId,
  title,
}: {
  edges: CampaignGraphEdge[]
  focusedId: string
  title: string
}) {
  if (edges.length === 0) return null

  return (
    <div className="graph-connection-group">
      <h4>{title}</h4>
      <ul>
        {edges.map((edge) => (
          <li key={edge.relationship.id}>
            <strong>{relationshipLabel(edge)}</strong>
            <span>{otherEntityName(edge, focusedId)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CampaignGraph({ campaign, entityIds, isFiltered = false }: CampaignGraphProps) {
  const [view, setView] = useState<CampaignGraphView>('world')
  const [isLayoutEditing, setIsLayoutEditing] = useState(false)
  const [positions, setPositions] = useState<CampaignGraphNodePositions>({})
  const positionsRef = useRef<CampaignGraphNodePositions>({})
  const [dragState, setDragState] = useState<GraphDragState>()
  const [layoutStatus, setLayoutStatus] = useState('')
  const [focusedId, setFocusedId] = useState<string>()
  const layoutRepository = useMemo(() => {
    try {
      return new LocalGraphLayoutRepository(window.localStorage)
    } catch {
      return undefined
    }
  }, [])
  const automaticGraph = useMemo(
    () => buildCampaignGraph(campaign, { entityIds, view }),
    [campaign, entityIds, view],
  )
  const graph = useMemo(
    () => applyCampaignGraphNodePositions(automaticGraph, positions),
    [automaticGraph, positions],
  )
  const context = focusedId ? getFocusedGraphContext(graph, focusedId) : undefined

  useEffect(() => {
    if (!layoutRepository) {
      positionsRef.current = {}
      setPositions({})
      setLayoutStatus(ru.graphLayoutStorageError)
      return
    }
    try {
      const loaded = layoutRepository.load(campaign.id, view)
      positionsRef.current = loaded
      setPositions(loaded)
      setLayoutStatus(Object.keys(loaded).length > 0 ? ru.graphLayoutLoaded : '')
    } catch {
      positionsRef.current = {}
      setPositions({})
      setLayoutStatus(ru.graphLayoutStorageError)
    }
  }, [campaign.id, layoutRepository, view])

  useEffect(() => {
    if (focusedId && !graph.nodes.some((node) => node.entity.id === focusedId)) {
      setFocusedId(undefined)
    }
  }, [focusedId, graph.nodes])

  function savePositions(next: CampaignGraphNodePositions) {
    positionsRef.current = next
    setPositions(next)
    try {
      if (!layoutRepository) throw new Error('Local storage is unavailable')
      layoutRepository.save(campaign.id, view, next)
      setLayoutStatus(ru.graphLayoutSaved)
    } catch {
      setLayoutStatus(ru.graphLayoutStorageError)
    }
  }

  function clampPosition(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.min(graph.width - GRAPH_NODE_WIDTH / 2, Math.max(GRAPH_NODE_WIDTH / 2, x)),
      y: Math.min(graph.height - GRAPH_NODE_HEIGHT / 2, Math.max(GRAPH_NODE_HEIGHT / 2, y)),
    }
  }

  function pointerPosition(event: ReactPointerEvent<SVGGElement>): { x: number; y: number } | undefined {
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

  function changeView(nextView: CampaignGraphView) {
    setIsLayoutEditing(false)
    setDragState(undefined)
    positionsRef.current = {}
    setPositions({})
    setView(nextView)
  }

  function startNodeDrag(event: ReactPointerEvent<SVGGElement>, node: CampaignGraphNode) {
    if (!isLayoutEditing) return
    const pointer = pointerPosition(event)
    if (!pointer) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setFocusedId(node.entity.id)
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
    if (isLayoutEditing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const step = event.shiftKey ? 32 : 12
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      savePositions({
        ...positionsRef.current,
        [node.entity.id]: clampPosition(node.x + dx, node.y + dy),
      })
      setFocusedId(node.entity.id)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setFocusedId(node.entity.id)
    }
  }

  function resetLayout() {
    if (!window.confirm(ru.graphLayoutResetConfirm)) return
    try {
      if (!layoutRepository) throw new Error('Local storage is unavailable')
      layoutRepository.clear(campaign.id, view)
      positionsRef.current = {}
      setPositions({})
      setLayoutStatus(ru.graphLayoutReset)
    } catch {
      setLayoutStatus(ru.graphLayoutStorageError)
    }
  }

  function isConnected(edge: CampaignGraphEdge): boolean {
    return !focusedId || edge.source.entity.id === focusedId || edge.target.entity.id === focusedId
  }

  return (
    <section className="campaign-graph-section" aria-labelledby="campaign-graph-heading">
      <div className="graph-heading">
        <div>
          <p className="overline">{view === 'world' ? ru.worldView : ru.partyKnowledgePreview}</p>
          <h2 id="campaign-graph-heading">{ru.campaignGraph}</h2>
          <p>{view === 'world' ? ru.graphHint : ru.partyKnowledgeHint}</p>
        </div>
        <div className="graph-heading-actions">
          <div className="graph-view-switcher" aria-label={ru.graphViewMode} role="group">
            <button
              aria-pressed={view === 'world'}
              className={view === 'world' ? 'is-active' : ''}
              onClick={() => changeView('world')}
              type="button"
            >
              {ru.worldView}
            </button>
            <button
              aria-pressed={view === 'party'}
              className={view === 'party' ? 'is-active' : ''}
              onClick={() => changeView('party')}
              type="button"
            >
              {ru.partyView}
            </button>
          </div>
          <div className="graph-layout-actions">
            <button
              aria-pressed={isLayoutEditing}
              className={isLayoutEditing ? 'is-active' : ''}
              onClick={() => setIsLayoutEditing((current) => !current)}
              type="button"
            >
              {isLayoutEditing ? ru.finishGraphLayout : ru.editGraphLayout}
            </button>
            <button disabled={Object.keys(positions).length === 0} onClick={resetLayout} type="button">
              {ru.resetGraphLayout}
            </button>
          </div>
        </div>
      </div>

      <div className="graph-status-row">
        <div className="graph-legend" aria-label="Легенда графа">
          <span className="graph-legend-draft" aria-hidden="true" />
          {ru.draft}
          <span className="graph-legend-arrow" aria-hidden="true">→</span>
          {ru.directedRelationship}
        </div>
        <p aria-live="polite">
          {isLayoutEditing ? ru.graphLayoutHint : layoutStatus}
        </p>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="graph-empty">
          <img src="/vista-point-mark.svg" alt="" aria-hidden="true" />
          <p>{view === 'party' ? ru.partyGraphEmpty : isFiltered ? ru.graphFilteredEmpty : ru.graphEmpty}</p>
        </div>
      ) : (
        <div className="graph-layout">
          <div className="graph-scroll" tabIndex={0} aria-label="Область Campaign Graph">
            <svg
              className={`campaign-graph${isLayoutEditing ? ' is-layout-editing' : ''}`}
              role="img"
              aria-labelledby="campaign-graph-title campaign-graph-description"
              viewBox={`0 0 ${graph.width} ${graph.height}`}
            >
              <title id="campaign-graph-title">Campaign Graph кампании «{campaign.name}»</title>
              <desc id="campaign-graph-description">
                Сущности кампании и типизированные связи между ними. Выберите узел, чтобы изучить его связи.
              </desc>
              <defs>
                <marker id="graph-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M 0 0 L 8 4 L 0 8 z" />
                </marker>
              </defs>

              <g aria-hidden="true">
                {graph.edges.map((edge) => (
                  <g
                    className={`graph-edge${isConnected(edge) ? '' : ' is-muted'}${
                      focusedId && isConnected(edge) ? ' is-focused' : ''
                    }`}
                    key={edge.relationship.id}
                  >
                    <line
                      markerEnd={edge.relationship.directed ? 'url(#graph-arrow)' : undefined}
                      x1={edge.startX}
                      x2={edge.endX}
                      y1={edge.startY}
                      y2={edge.endY}
                    />
                    <text x={edge.labelX} y={edge.labelY} textAnchor="middle">
                      {relationshipLabel(edge)}
                    </text>
                  </g>
                ))}
              </g>

              {graph.nodes.map((node) => {
                const selected = focusedId === node.entity.id
                const connected = !focusedId || selected || graph.edges.some(
                  (edge) => isConnected(edge) && (
                    edge.source.entity.id === node.entity.id || edge.target.entity.id === node.entity.id
                  ),
                )
                return (
                  <g
                    aria-label={`${node.entity.name}, ${ru.entityTypes[node.entity.type]}, ${ru.lifecycleStatuses[node.entity.status]}`}
                    aria-pressed={selected}
                    className={`graph-node${selected ? ' is-selected' : ''}${connected ? '' : ' is-muted'}`}
                    key={node.entity.id}
                    onClick={() => setFocusedId(node.entity.id)}
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
                    <circle cx="18" cy="20" r="4" />
                    <text className="graph-node-type" x="30" y="24">
                      {ru.entityTypes[node.entity.type]}
                    </text>
                    <text className="graph-node-name" x="16" y="52">
                      {shortened(node.entity.name, 23)}
                    </text>
                    <text className="graph-node-status" x="16" y="69">{ru.lifecycleStatuses[node.entity.status]}</text>
                  </g>
                )
              })}
            </svg>
          </div>

          <aside className="graph-inspector" aria-live="polite">
            {context ? (
              <>
                <div className="graph-inspector-heading">
                  <div>
                    <span>{ru.entityTypes[context.node.entity.type]}</span>
                    <h3>{context.node.entity.name}</h3>
                  </div>
                  <button className="text-button" onClick={() => setFocusedId(undefined)} type="button">
                    {ru.clearFocus}
                  </button>
                </div>
                <p>{context.node.entity.summary || ru.noEntitySummary}</p>
                {context.incoming.length + context.outgoing.length + context.mutual.length === 0 ? (
                  <p className="graph-no-connections">{ru.noNodeConnections}</p>
                ) : (
                  <div className="graph-connections">
                    <ConnectionList edges={context.outgoing} focusedId={focusedId!} title={ru.outgoingRelationships} />
                    <ConnectionList edges={context.incoming} focusedId={focusedId!} title={ru.incomingRelationships} />
                    <ConnectionList edges={context.mutual} focusedId={focusedId!} title={ru.mutualRelationships} />
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
