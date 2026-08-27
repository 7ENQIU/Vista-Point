import type {
  Campaign,
  CampaignEntity,
  Relationship,
  FactType,
} from '../../domain/campaign/types'
import { selectImmediateHierarchyRelationships } from './buildEntityContext'

export const GRAPH_WIDTH = 960
export const GRAPH_NODE_WIDTH = 176
export const GRAPH_NODE_HEIGHT = 96
export const GRAPH_COLUMN_GAP = 320
export const GRAPH_ROW_GAP = 160
export const GRAPH_ROUTE_CLEARANCE = 24

export type CampaignGraphView = 'world' | 'party'

export interface CampaignGraphBuildOptions {
  entityIds?: readonly string[]
  view?: CampaignGraphView
}

export interface CampaignGraphNodePosition {
  x: number
  y: number
}

export type CampaignGraphNodePositions = Record<string, CampaignGraphNodePosition>
export type CampaignGraphEdgeRoutes = Record<string, CampaignGraphNodePosition>

export interface CampaignGraphNode {
  entity: CampaignEntity
  context: CampaignEntity[]
  x: number
  y: number
}

export type CampaignGraphRelationshipType = FactType | 'includes_participant'

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
  path: string
  points: CampaignGraphNodePosition[]
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

function isHierarchyRelationship(item: DisplayRelationship): boolean {
  return item.relationship.directed &&
    (item.displayType === 'contains' || item.displayType === 'includes_participant')
}

function buildLevels(entities: CampaignEntity[], relationships: DisplayRelationship[]): Map<string, number> {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))
  const parentByChild = new Map<string, string>()
  const levels = new Map<string, number>()

  for (const item of relationships) {
    if (isHierarchyRelationship(item) && entityById.has(item.displaySourceId) && entityById.has(item.displayTargetId)) {
      parentByChild.set(item.displayTargetId, item.displaySourceId)
    }
  }

  function resolveLevel(entityId: string, visiting: Set<string>): number {
    const resolved = levels.get(entityId)
    if (resolved !== undefined) return resolved

    if (visiting.has(entityId)) return 0
    const parentId = parentByChild.get(entityId)
    if (!parentId) {
      levels.set(entityId, 0)
      return 0
    }

    const nextVisiting = new Set(visiting).add(entityId)
    const level = resolveLevel(parentId, nextVisiting) + 1
    levels.set(entityId, level)
    return level
  }

  for (const entity of entities) resolveLevel(entity.id, new Set())
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

function buildEdges(
  relationships: DisplayRelationship[],
  nodes: CampaignGraphNode[],
): CampaignGraphEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.entity.id, node]))
  const sourcePortOffsets = buildSourcePortOffsets(relationships, nodeById)
  const occupiedSegments: Segment[] = []
  return relationships.flatMap((item): CampaignGraphEdge[] => {
    const source = nodeById.get(item.displaySourceId)
    const target = nodeById.get(item.displayTargetId)
    if (!source || !target) return []

    const routed = routeEdge(
      source,
      target,
      nodes,
      occupiedSegments,
      item.relationship.directed,
      sourcePortOffsets.get(item.relationship.id) ?? 0,
    )
    occupiedSegments.push(...toSegments(routed.points))
    return [{
      relationship: item.relationship,
      displayType: item.displayType,
      source,
      target,
      startX: routed.points[0].x,
      startY: routed.points[0].y,
      endX: routed.points.at(-1)!.x,
      endY: routed.points.at(-1)!.y,
      labelX: routed.label.x,
      labelY: routed.label.y,
      path: roundedOrthogonalPath(routed.points),
      points: routed.points,
    }]
  })
}

interface Segment { a: CampaignGraphNodePosition; b: CampaignGraphNodePosition }

const GRAPH_EDGE_LANE_GAP = 14
const GRAPH_PORT_INSET = 16

function buildSourcePortOffsets(
  relationships: DisplayRelationship[],
  nodeById: Map<string, CampaignGraphNode>,
): Map<string, number> {
  const outgoing = new Map<string, DisplayRelationship[]>()
  for (const item of relationships) {
    if (!item.relationship.directed || !nodeById.has(item.displaySourceId) || !nodeById.has(item.displayTargetId)) continue
    outgoing.set(item.displaySourceId, [...(outgoing.get(item.displaySourceId) ?? []), item])
  }

  const offsets = new Map<string, number>()
  const maximumOffset = GRAPH_NODE_HEIGHT / 2 - GRAPH_PORT_INSET
  const minimumOffset = 12

  for (const [sourceId, items] of outgoing) {
    const source = nodeById.get(sourceId)!
    const above = items
      .filter((item) => nodeById.get(item.displayTargetId)!.y < source.y)
      .sort((first, second) => nodeById.get(first.displayTargetId)!.y - nodeById.get(second.displayTargetId)!.y)
    const level = items.filter((item) => nodeById.get(item.displayTargetId)!.y === source.y)
    const below = items
      .filter((item) => nodeById.get(item.displayTargetId)!.y > source.y)
      .sort((first, second) => nodeById.get(first.displayTargetId)!.y - nodeById.get(second.displayTargetId)!.y)

    above.forEach((item, index) => {
      const ratio = above.length === 1 ? 1 : 1 - index / (above.length - 1)
      offsets.set(item.relationship.id, -(minimumOffset + (maximumOffset - minimumOffset) * ratio))
    })
    level.forEach((item, index) => {
      const centeredIndex = index - (level.length - 1) / 2
      offsets.set(item.relationship.id, level.length === 1 ? 0 : centeredIndex * GRAPH_EDGE_LANE_GAP)
    })
    below.forEach((item, index) => {
      const ratio = below.length === 1 ? 1 : index / (below.length - 1)
      offsets.set(item.relationship.id, minimumOffset + (maximumOffset - minimumOffset) * ratio)
    })
  }

  return offsets
}

function toSegments(points: CampaignGraphNodePosition[]): Segment[] {
  return points.slice(1).map((point, index) => ({ a: points[index], b: point }))
}

function compactPoints(points: CampaignGraphNodePosition[]): CampaignGraphNodePosition[] {
  const unique = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true
    const previous = unique[index - 1]
    const next = unique[index + 1]
    return !(previous.x === point.x && point.x === next.x) && !(previous.y === point.y && point.y === next.y)
  })
}

function segmentCrossesNode(segment: Segment, node: CampaignGraphNode): boolean {
  const left = node.x - GRAPH_NODE_WIDTH / 2 - GRAPH_ROUTE_CLEARANCE
  const right = node.x + GRAPH_NODE_WIDTH / 2 + GRAPH_ROUTE_CLEARANCE
  const top = node.y - GRAPH_NODE_HEIGHT / 2 - GRAPH_ROUTE_CLEARANCE
  const bottom = node.y + GRAPH_NODE_HEIGHT / 2 + GRAPH_ROUTE_CLEARANCE
  if (segment.a.x === segment.b.x) {
    return segment.a.x > left && segment.a.x < right && Math.max(segment.a.y, segment.b.y) > top && Math.min(segment.a.y, segment.b.y) < bottom
  }
  return segment.a.y > top && segment.a.y < bottom && Math.max(segment.a.x, segment.b.x) > left && Math.min(segment.a.x, segment.b.x) < right
}

function segmentsConflict(first: Segment, second: Segment): number {
  const firstVertical = first.a.x === first.b.x
  const secondVertical = second.a.x === second.b.x
  if (firstVertical === secondVertical) {
    const laneDistance = firstVertical
      ? Math.abs(first.a.x - second.a.x)
      : Math.abs(first.a.y - second.a.y)
    if (laneDistance >= GRAPH_EDGE_LANE_GAP) return 0
    const firstRange = firstVertical ? [first.a.y, first.b.y] : [first.a.x, first.b.x]
    const secondRange = secondVertical ? [second.a.y, second.b.y] : [second.a.x, second.b.x]
    return Math.min(Math.max(...firstRange), Math.max(...secondRange)) > Math.max(Math.min(...firstRange), Math.min(...secondRange)) ? 12_000 : 0
  }
  const vertical = firstVertical ? first : second
  const horizontal = firstVertical ? second : first
  return vertical.a.x > Math.min(horizontal.a.x, horizontal.b.x) && vertical.a.x < Math.max(horizontal.a.x, horizontal.b.x) &&
    horizontal.a.y > Math.min(vertical.a.y, vertical.b.y) && horizontal.a.y < Math.max(vertical.a.y, vertical.b.y) ? 4_000 : 0
}

function orderEntitiesToReduceCrossings(
  entitiesByLevel: Map<number, CampaignEntity[]>,
  levels: Map<string, number>,
  relationships: DisplayRelationship[],
  maxLevel: number,
): Map<number, CampaignEntity[]> {
  const ordered = new Map([...entitiesByLevel.entries()].map(([level, entities]) => [level, [...entities]]))
  const neighbors = new Map<string, string[]>()
  for (const relationship of relationships) {
    neighbors.set(relationship.displaySourceId, [...(neighbors.get(relationship.displaySourceId) ?? []), relationship.displayTargetId])
    neighbors.set(relationship.displayTargetId, [...(neighbors.get(relationship.displayTargetId) ?? []), relationship.displaySourceId])
  }

  function sweep(levelNumbers: number[], towardLowerLevels: boolean) {
    const indexByEntity = new Map<string, number>()
    for (const entities of ordered.values()) entities.forEach((entity, index) => indexByEntity.set(entity.id, index))
    for (const level of levelNumbers) {
      const current = ordered.get(level) ?? []
      ordered.set(level, current.map((entity, index) => {
        const relatedIndexes = (neighbors.get(entity.id) ?? []).flatMap((neighborId) => {
          const neighborLevel = levels.get(neighborId)
          const relevant = neighborLevel !== undefined && (towardLowerLevels ? neighborLevel < level : neighborLevel > level)
          const neighborIndex = indexByEntity.get(neighborId)
          return relevant && neighborIndex !== undefined ? [neighborIndex] : []
        })
        return { entity, index, score: relatedIndexes.length
          ? relatedIndexes.reduce((sum, value) => sum + value, 0) / relatedIndexes.length
          : index }
      }).sort((first, second) => first.score - second.score || first.index - second.index).map((item) => item.entity))
    }
  }

  for (let iteration = 0; iteration < 4; iteration += 1) {
    sweep(Array.from({ length: maxLevel }, (_, index) => index + 1), true)
    sweep(Array.from({ length: maxLevel }, (_, index) => maxLevel - index - 1), false)
  }
  return ordered
}

function routeEdge(source: CampaignGraphNode, target: CampaignGraphNode, nodes: CampaignGraphNode[], occupied: Segment[], directed: boolean, sourcePortOffset: number): { points: CampaignGraphNodePosition[]; label: CampaignGraphNodePosition } {
  const direction = directed ? 1 : target.x >= source.x ? 1 : -1
  const start = { x: source.x + direction * GRAPH_NODE_WIDTH / 2, y: source.y + sourcePortOffset }
  const end = { x: target.x - direction * (GRAPH_NODE_WIDTH / 2 + (directed ? 9 : 0)), y: target.y }
  const startPort = { x: start.x + direction * GRAPH_ROUTE_CLEARANCE, y: start.y }
  const endPort = { x: end.x - direction * GRAPH_ROUTE_CLEARANCE, y: end.y }
  const corridorMinimum = Math.min(startPort.x, endPort.x)
  const corridorMaximum = Math.max(startPort.x, endPort.x)
  const middleX = (startPort.x + endPort.x) / 2
  const corridorChannels = [middleX]
  for (let offset = GRAPH_EDGE_LANE_GAP; middleX - offset >= corridorMinimum || middleX + offset <= corridorMaximum; offset += GRAPH_EDGE_LANE_GAP) {
    if (middleX - offset >= corridorMinimum) corridorChannels.push(middleX - offset)
    if (middleX + offset <= corridorMaximum) corridorChannels.push(middleX + offset)
  }
  const xChannels = [...new Set([
    ...corridorChannels,
    ...nodes.flatMap((node) => [
      node.x - GRAPH_NODE_WIDTH / 2 - GRAPH_ROUTE_CLEARANCE,
      node.x + GRAPH_NODE_WIDTH / 2 + GRAPH_ROUTE_CLEARANCE,
    ]),
    GRAPH_ROUTE_CLEARANCE,
  ])]
  const yChannels = [...new Set([
    (startPort.y + endPort.y) / 2,
    ...nodes.flatMap((node) => [
      node.y - GRAPH_NODE_HEIGHT / 2 - GRAPH_ROUTE_CLEARANCE,
      node.y + GRAPH_NODE_HEIGHT / 2 + GRAPH_ROUTE_CLEARANCE,
    ]),
    GRAPH_ROUTE_CLEARANCE,
  ])]
  const candidates = [
    ...xChannels.map((x) => [start, startPort, { x, y: startPort.y }, { x, y: endPort.y }, endPort, end]),
    ...yChannels.map((y) => [start, startPort, { x: startPort.x, y }, { x: endPort.x, y }, endPort, end]),
  ].map(compactPoints).filter((points) => points.length >= 4 || (points.length === 2 && startPort.x <= endPort.x))
  const blockingNodes = nodes.filter((node) => node.entity.id !== source.entity.id && node.entity.id !== target.entity.id)
  const points = candidates.map((candidate) => {
    const segments = toSegments(candidate)
    const blocked = segments.some((segment) => blockingNodes.some((node) => segmentCrossesNode(segment, node)))
    const length = segments.reduce((sum, segment) => sum + Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y), 0)
    const conflicts = segments.reduce((sum, segment) => sum + occupied.reduce((value, existing) => value + segmentsConflict(segment, existing), 0), 0)
    const finalSegment = segments.at(-1)!
    const finalLength = Math.abs(finalSegment.a.x - finalSegment.b.x) + Math.abs(finalSegment.a.y - finalSegment.b.y)
    const shortLabelLane = Math.max(0, 64 - finalLength) * 20
    return { candidate, score: (blocked ? 1_000_000 : 0) + length + conflicts + shortLabelLane + segments.length * 18 }
  }).sort((a, b) => a.score - b.score)[0].candidate
  const segments = toSegments(points)
  const finalHorizontal = [...segments].reverse().find((segment) => segment.a.y === segment.b.y) ?? segments.at(-1)!
  return {
    points,
    label: {
      x: (finalHorizontal.a.x + finalHorizontal.b.x) / 2,
      y: (finalHorizontal.a.y + finalHorizontal.b.y) / 2 - 8,
    },
  }
}

function roundedOrthogonalPath(points: CampaignGraphNodePosition[], radius = 10): string {
  if (points.length < 2) return ''
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    const incoming = Math.min(radius, (Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y)) / 2)
    const outgoing = Math.min(radius, (Math.abs(next.x - corner.x) + Math.abs(next.y - corner.y)) / 2)
    const before = { x: corner.x + Math.sign(previous.x - corner.x) * incoming, y: corner.y + Math.sign(previous.y - corner.y) * incoming }
    const after = { x: corner.x + Math.sign(next.x - corner.x) * outgoing, y: corner.y + Math.sign(next.y - corner.y) * outgoing }
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`
  }
  const end = points.at(-1)!
  return `${path} L ${end.x} ${end.y}`
}

export function buildCampaignGraph(
  campaign: Campaign,
  options: CampaignGraphBuildOptions = {},
): CampaignGraphProjection {
  const view = options.view ?? 'world'
  const requestedIds = options.entityIds ? new Set(options.entityIds) : undefined
  const partyKnownEntityIds = new Set(campaign.knowledge
    .filter((knowledge) =>
      knowledge.subjectType === 'party' &&
      knowledge.status !== 'unknown' &&
      knowledge.status !== 'forgotten')
    .flatMap((knowledge) => knowledge.relatedEntityIds))
  const activeEntities = campaign.entities.filter((entity) =>
    entity.status !== 'archived' &&
    (!requestedIds || requestedIds.has(entity.id)) &&
    (view === 'world' || partyKnownEntityIds.has(entity.id)))
  const activeEntityIds = new Set(activeEntities.map((entity) => entity.id))
  const visibleRelationships = campaign.relationships
    .filter((relationship) =>
      relationship.status !== 'archived' &&
      activeEntityIds.has(relationship.sourceId) &&
      activeEntityIds.has(relationship.targetId))
  const displayRelationships = selectImmediateHierarchyRelationships(campaign, visibleRelationships)
    .map(toDisplayRelationship)
  const levels = buildLevels(activeEntities, displayRelationships)
  const maxLevel = Math.max(0, ...levels.values())
  const horizontalMargin = 40
  const verticalMargin = 40
  const width = Math.max(GRAPH_WIDTH, horizontalMargin * 2 + GRAPH_NODE_WIDTH + maxLevel * GRAPH_COLUMN_GAP)
  const entitiesByLevel = new Map<number, CampaignEntity[]>()

  for (const entity of activeEntities) {
    const level = levels.get(entity.id) ?? 0
    entitiesByLevel.set(level, [...(entitiesByLevel.get(level) ?? []), entity])
  }

  const orderedEntitiesByLevel = orderEntitiesToReduceCrossings(entitiesByLevel, levels, displayRelationships, maxLevel)
  const largestLevel = Math.max(1, ...[...orderedEntitiesByLevel.values()].map((entities) => entities.length))
  const height = Math.max(320, verticalMargin * 2 + GRAPH_NODE_HEIGHT + (largestLevel - 1) * GRAPH_ROW_GAP)

  const nodes = [...orderedEntitiesByLevel.entries()].flatMap(([level, entities]) => {
    const levelHeight = (entities.length - 1) * GRAPH_ROW_GAP
    const firstY = height / 2 - levelHeight / 2
    return entities.map((entity, index): CampaignGraphNode => ({
      entity,
      context: [],
      x: horizontalMargin + GRAPH_NODE_WIDTH / 2 + level * GRAPH_COLUMN_GAP,
      y: firstY + index * GRAPH_ROW_GAP,
    }))
  })
  const edges = buildEdges(displayRelationships, nodes)

  return { width, height, nodes, edges }
}

export function applyCampaignGraphNodePositions(
  graph: CampaignGraphProjection,
  positions: CampaignGraphNodePositions,
): CampaignGraphProjection {
  const minX = GRAPH_NODE_WIDTH / 2 + GRAPH_ROUTE_CLEARANCE
  const maxX = graph.width - GRAPH_NODE_WIDTH / 2 - GRAPH_ROUTE_CLEARANCE
  const minY = GRAPH_NODE_HEIGHT / 2 + GRAPH_ROUTE_CLEARANCE
  const maxY = graph.height - GRAPH_NODE_HEIGHT / 2 - GRAPH_ROUTE_CLEARANCE
  const nodes = graph.nodes.map((node) => {
    const position = positions[node.entity.id]
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return node
    return {
      ...node,
      x: Math.min(maxX, Math.max(minX, position.x)),
      y: Math.min(maxY, Math.max(minY, position.y)),
    }
  })
  const relationships: DisplayRelationship[] = graph.edges.map((edge) => ({
    relationship: edge.relationship,
    displaySourceId: edge.source.entity.id,
    displayTargetId: edge.target.entity.id,
    displayType: edge.displayType,
  }))

  return { ...graph, nodes, edges: buildEdges(relationships, nodes) }
}

export function applyCampaignGraphEdgeRoutes(
  graph: CampaignGraphProjection,
  routes: CampaignGraphEdgeRoutes,
): CampaignGraphProjection {
  const edges = graph.edges.map((edge) => {
    const rawControl = routes[edge.relationship.id]
    if (!rawControl || !Number.isFinite(rawControl.x) || !Number.isFinite(rawControl.y)) return edge
    const control = {
      x: Math.min(graph.width - GRAPH_ROUTE_CLEARANCE, Math.max(GRAPH_ROUTE_CLEARANCE, rawControl.x)),
      y: Math.min(graph.height - GRAPH_ROUTE_CLEARANCE, Math.max(GRAPH_ROUTE_CLEARANCE, rawControl.y)),
    }
    const direction = edge.endX >= edge.startX ? 1 : -1
    const start = { x: edge.startX, y: edge.startY }
    const end = { x: edge.endX, y: edge.endY }
    const startPort = { x: start.x + direction * GRAPH_ROUTE_CLEARANCE, y: start.y }
    const endPort = { x: end.x - direction * GRAPH_ROUTE_CLEARANCE, y: end.y }
    const points = compactPoints([
      start,
      startPort,
      { x: control.x, y: start.y },
      control,
      { x: endPort.x, y: control.y },
      endPort,
      end,
    ])
    return {
      ...edge,
      points,
      path: roundedOrthogonalPath(points),
      labelX: control.x,
      labelY: control.y - 8,
    }
  })
  return { ...graph, edges }
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
