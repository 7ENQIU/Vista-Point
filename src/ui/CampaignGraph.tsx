import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import {
  buildCampaignGraph,
  getFocusedGraphContext,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  type CampaignGraphEdge,
} from '../application/campaigns/buildCampaignGraph'
import type { Campaign } from '../domain/campaign/types'
import { ru } from '../shared/i18n/ru'

interface CampaignGraphProps {
  campaign: Campaign
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

export function CampaignGraph({ campaign }: CampaignGraphProps) {
  const graph = useMemo(() => buildCampaignGraph(campaign), [campaign])
  const [focusedId, setFocusedId] = useState<string>()
  const context = focusedId ? getFocusedGraphContext(graph, focusedId) : undefined

  useEffect(() => {
    if (focusedId && !graph.nodes.some((node) => node.entity.id === focusedId)) {
      setFocusedId(undefined)
    }
  }, [focusedId, graph.nodes])

  function activateNode(event: KeyboardEvent<SVGGElement>, nodeId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setFocusedId(nodeId)
    }
  }

  function isConnected(edge: CampaignGraphEdge): boolean {
    return !focusedId || edge.source.entity.id === focusedId || edge.target.entity.id === focusedId
  }

  return (
    <section className="campaign-graph-section" aria-labelledby="campaign-graph-heading">
      <div className="graph-heading">
        <div>
          <p className="overline">{ru.worldView}</p>
          <h2 id="campaign-graph-heading">{ru.campaignGraph}</h2>
          <p>{ru.graphHint}</p>
        </div>
        <div className="graph-legend" aria-label="Легенда графа">
          <span className="graph-legend-draft" aria-hidden="true" />
          {ru.draft}
          <span className="graph-legend-arrow" aria-hidden="true">→</span>
          {ru.directedRelationship}
        </div>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="graph-empty">
          <img src="/vista-point-mark.svg" alt="" aria-hidden="true" />
          <p>{ru.graphEmpty}</p>
        </div>
      ) : (
        <div className="graph-layout">
          <div className="graph-scroll" tabIndex={0} aria-label="Область Campaign Graph">
            <svg
              className="campaign-graph"
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
                    aria-label={`${node.entity.name}, ${ru.entityTypes[node.entity.type]}, ${ru.draft}`}
                    aria-pressed={selected}
                    className={`graph-node${selected ? ' is-selected' : ''}${connected ? '' : ' is-muted'}`}
                    key={node.entity.id}
                    onClick={() => setFocusedId(node.entity.id)}
                    onKeyDown={(event) => activateNode(event, node.entity.id)}
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
                    <text className="graph-node-status" x="16" y="69">{ru.draft}</text>
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
