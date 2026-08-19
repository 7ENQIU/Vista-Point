import type { Campaign, CampaignEntity, Relationship } from '../../domain/campaign/types'

export const GRAPH_WIDTH = 960
export const GRAPH_NODE_WIDTH = 176
export const GRAPH_NODE_HEIGHT = 80

export interface CampaignGraphNode {
  entity: CampaignEntity
  x: number
  y: number
}

export interface CampaignGraphEdge {
  relationship: Relationship
  source: CampaignGraphNode
  target: CampaignGraphNode
  startX: number
  startY: number
  endX: number
  endY: number
  labelX: number
  labelY: number
}

export interface CampaignGraphProjection {
  width: number
  height: number
  nodes: CampaignGraphNode[]
  edges: CampaignGraphEdge[]
}

export interface FocusedGraphContext {
  node: CampaignGraphNode
  incoming: CampaignGraphEdge[]
  outgoing: CampaignGraphEdge[]
  mutual: CampaignGraphEdge[]
}

function edgePoint(
  from: CampaignGraphNode,
  to: CampaignGraphNode,
  extraGap = 0,
): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return { x: from.x, y: from.y }

  const halfWidth = GRAPH_NODE_WIDTH / 2 + extraGap
  const halfHeight = GRAPH_NODE_HEIGHT / 2 + extraGap
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy),
  )
  return { x: from.x + dx * scale, y: from.y + dy * scale }
}

export function buildCampaignGraph(campaign: Campaign): CampaignGraphProjection {
  const count = campaign.entities.length
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))))
  const rows = Math.max(1, Math.ceil(count / columns))
  const horizontalMargin = 120
  const verticalMargin = 80
  const rowGap = 150
  const usableWidth = GRAPH_WIDTH - horizontalMargin * 2
  const height = Math.max(260, verticalMargin * 2 + (rows - 1) * rowGap)

  const nodes = campaign.entities.map((entity, index): CampaignGraphNode => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = columns === 1
      ? GRAPH_WIDTH / 2
      : horizontalMargin + (usableWidth * column) / (columns - 1)
    return { entity, x, y: verticalMargin + row * rowGap }
  })
  const nodeById = new Map(nodes.map((node) => [node.entity.id, node]))
  const edges = campaign.relationships.flatMap((relationship): CampaignGraphEdge[] => {
    const source = nodeById.get(relationship.sourceId)
    const target = nodeById.get(relationship.targetId)
    if (!source || !target) return []

    const start = edgePoint(source, target)
    const end = edgePoint(target, source, relationship.directed ? 9 : 0)
    return [{
      relationship,
      source,
      target,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      labelX: (source.x + target.x) / 2,
      labelY: (source.y + target.y) / 2 - 8,
    }]
  })

  return { width: GRAPH_WIDTH, height, nodes, edges }
}

export function getFocusedGraphContext(
  graph: CampaignGraphProjection,
  nodeId: string,
): FocusedGraphContext | undefined {
  const node = graph.nodes.find((item) => item.entity.id === nodeId)
  if (!node) return undefined

  return {
    node,
    incoming: graph.edges.filter(
      (edge) => edge.relationship.directed && edge.target.entity.id === nodeId,
    ),
    outgoing: graph.edges.filter(
      (edge) => edge.relationship.directed && edge.source.entity.id === nodeId,
    ),
    mutual: graph.edges.filter(
      (edge) =>
        !edge.relationship.directed &&
        (edge.source.entity.id === nodeId || edge.target.entity.id === nodeId),
    ),
  }
}
