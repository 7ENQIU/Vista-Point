import type {
  Campaign,
  CampaignEntity,
  Relationship,
  RelationshipType,
} from '../../domain/campaign/types'

export const GRAPH_WIDTH = 960
export const GRAPH_NODE_WIDTH = 176
export const GRAPH_NODE_HEIGHT = 80

export interface CampaignGraphNode {
  entity: CampaignEntity
  x: number
  y: number
}

export type CampaignGraphRelationshipType = RelationshipType | 'includes_participant'

export interface CampaignGraphEdge {
  relationship: Relationship
  displayType: CampaignGraphRelationshipType
  source: CampaignGraphNode
  target: CampaignGraphNode
  startX: number
  startY: number
  endX: number
  endY: number
  labelX: number
  labelY: number
}

interface DisplayRelationship {
  relationship: Relationship
  displaySourceId: string
  displayTargetId: string
  displayType: CampaignGraphRelationshipType
}

function toDisplayRelationship(relationship: Relationship): DisplayRelationship {
  if (relationship.directed && relationship.type === 'located_in') {
    return {
      relationship,
      displaySourceId: relationship.targetId,
      displayTargetId: relationship.sourceId,
      displayType: 'contains',
    }
  }

  if (relationship.directed && relationship.type === 'participates_in') {
    return {
      relationship,
      displaySourceId: relationship.targetId,
      displayTargetId: relationship.sourceId,
      displayType: 'includes_participant',
    }
  }

  return {
    relationship,
    displaySourceId: relationship.sourceId,
    displayTargetId: relationship.targetId,
    displayType: relationship.type,
  }
}

function buildLevels(entityIds: string[], relationships: DisplayRelationship[]): Map<string, number> {
  const idSet = new Set(entityIds)
  const levels = new Map(entityIds.map((id) => [id, 0]))
  const incomingCount = new Map(entityIds.map((id) => [id, 0]))
  const outgoing = new Map(entityIds.map((id) => [id, [] as string[]]))

  for (const item of relationships) {
    if (
      !item.relationship.directed ||
      !idSet.has(item.displaySourceId) ||
      !idSet.has(item.displayTargetId)
    ) continue

    outgoing.get(item.displaySourceId)?.push(item.displayTargetId)
    incomingCount.set(
      item.displayTargetId,
      (incomingCount.get(item.displayTargetId) ?? 0) + 1,
    )
  }

  const queue = entityIds.filter((id) => incomingCount.get(id) === 0)
  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index]
    const sourceLevel = levels.get(sourceId) ?? 0
    for (const targetId of outgoing.get(sourceId) ?? []) {
      levels.set(targetId, Math.max(levels.get(targetId) ?? 0, sourceLevel + 1))
      const remaining = (incomingCount.get(targetId) ?? 1) - 1
      incomingCount.set(targetId, remaining)
      if (remaining === 0) queue.push(targetId)
    }
  }

  return levels
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
  const displayRelationships = campaign.relationships.map(toDisplayRelationship)
  const levels = buildLevels(
    campaign.entities.map((entity) => entity.id),
    displayRelationships,
  )
  const maxLevel = Math.max(0, ...levels.values())
  const horizontalMargin = 120
  const verticalMargin = 80
  const columnGap = 260
  const rowGap = 120
  const width = Math.max(GRAPH_WIDTH, horizontalMargin * 2 + maxLevel * columnGap)
  const entitiesByLevel = new Map<number, CampaignEntity[]>()

  for (const entity of campaign.entities) {
    const level = levels.get(entity.id) ?? 0
    entitiesByLevel.set(level, [...(entitiesByLevel.get(level) ?? []), entity])
  }

  const largestLevel = Math.max(1, ...[...entitiesByLevel.values()].map((entities) => entities.length))
  const height = Math.max(320, verticalMargin * 2 + (largestLevel - 1) * rowGap)

  const nodes = [...entitiesByLevel.entries()].flatMap(([level, entities]) => {
    const levelHeight = (entities.length - 1) * rowGap
    const firstY = height / 2 - levelHeight / 2
    return entities.map((entity, index): CampaignGraphNode => ({
      entity,
      x: horizontalMargin + level * columnGap,
      y: firstY + index * rowGap,
    }))
  })
  const nodeById = new Map(nodes.map((node) => [node.entity.id, node]))
  const edges = displayRelationships.flatMap((item): CampaignGraphEdge[] => {
    const source = nodeById.get(item.displaySourceId)
    const target = nodeById.get(item.displayTargetId)
    if (!source || !target) return []

    const start = edgePoint(source, target)
    const end = edgePoint(target, source, item.relationship.directed ? 9 : 0)
    return [{
      relationship: item.relationship,
      displayType: item.displayType,
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

  return { width, height, nodes, edges }
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
