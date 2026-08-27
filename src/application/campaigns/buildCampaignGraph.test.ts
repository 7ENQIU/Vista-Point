import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { addRelationshipToCampaign } from '../../domain/campaign/addRelationship'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { archiveEntityInCampaign, archiveRelationshipInCampaign } from '../../domain/campaign/archiveCampaignItem'
import {
  applyCampaignGraphEdgeRoutes,
  applyCampaignGraphNodePositions,
  buildCampaignGraph,
  getFocusedGraphContext,
  GRAPH_COLUMN_GAP,
  GRAPH_WIDTH,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  GRAPH_ROUTE_CLEARANCE,
} from './buildCampaignGraph'

function relatedCampaign() {
  const empty = createCampaign({ name: 'Граф' }, new Date('2026-08-19T18:00:00Z'), 'c1')
  const first = addEntityToCampaign(empty, { type: 'npc', name: 'Смотритель' }, { entityId: 'e1' })
  const second = addEntityToCampaign(first.campaign, { type: 'location', name: 'Маяк' }, { entityId: 'e2' })
  const third = addEntityToCampaign(second.campaign, { type: 'clue', name: 'След' }, { entityId: 'e3' })
  const directed = addRelationshipToCampaign(third.campaign, {
    sourceId: 'e1', targetId: 'e2', type: 'located_in', directed: true,
  })
  return addRelationshipToCampaign(directed.campaign, {
    sourceId: 'e1', targetId: 'e3', type: 'knows', directed: false,
  }).campaign
}

describe('buildCampaignGraph', () => {
  it('строит детерминированную проекцию без изменения кампании', () => {
    const campaign = relatedCampaign()
    const graph = buildCampaignGraph(campaign)

    expect(graph.width).toBe(GRAPH_WIDTH)
    expect(graph.nodes).toHaveLength(3)
    expect(graph.edges).toHaveLength(2)
    expect(graph.nodes.every((node) => node.x > 0 && node.x < graph.width)).toBe(true)
    expect(graph.nodes.every((node) => node.y > 0 && node.y < graph.height)).toBe(true)
    expect(campaign.entities.every((entity) => !('x' in entity) && !('y' in entity))).toBe(true)
  })

  it('разделяет входящие, исходящие и взаимные связи выбранного узла', () => {
    const graph = buildCampaignGraph(relatedCampaign())
    const context = getFocusedGraphContext(graph, 'e1')

    expect(context?.outgoing).toHaveLength(0)
    expect(context?.incoming).toHaveLength(1)
    expect(context?.mutual).toHaveLength(1)
  })

  it('раскладывает вложенные локации и персонажей слева направо от большего к меньшему', () => {
    const empty = createCampaign({ name: 'Пурпе' }, new Date('2026-08-19T18:00:00Z'), 'c2')
    const withSerega = addEntityToCampaign(empty, { type: 'npc', name: 'Серёга' }, { entityId: 'serega' })
    const withPurpe = addEntityToCampaign(withSerega.campaign, { type: 'location', name: 'Пурпе' }, { entityId: 'purpe' })
    const withMax = addEntityToCampaign(withPurpe.campaign, { type: 'npc', name: 'Макс' }, { entityId: 'max' })
    const withLocation = addEntityToCampaign(withMax.campaign, { type: 'location', name: 'Локация 1' }, { entityId: 'location-1' })
    const nestedLocation = addRelationshipToCampaign(withLocation.campaign, {
      sourceId: 'location-1', targetId: 'purpe', type: 'located_in', directed: true,
    })
    const withNestedSerega = addRelationshipToCampaign(nestedLocation.campaign, {
      sourceId: 'serega', targetId: 'location-1', type: 'located_in', directed: true,
    })
    const campaign = addRelationshipToCampaign(withNestedSerega.campaign, {
      sourceId: 'max', targetId: 'location-1', type: 'located_in', directed: true,
    }).campaign

    const graph = buildCampaignGraph(campaign)
    const nodeX = new Map(graph.nodes.map((node) => [node.entity.id, node.x]))
    const locationChildren = graph.edges.filter((edge) => edge.source.entity.id === 'location-1')

    expect(nodeX.get('purpe')).toBeLessThan(nodeX.get('location-1')!)
    expect(nodeX.get('location-1')).toBeLessThan(nodeX.get('serega')!)
    expect(nodeX.get('serega')).toBe(nodeX.get('max'))
    expect(graph.edges.every((edge) => edge.source.x < edge.target.x)).toBe(true)
    expect(graph.edges.every((edge) => edge.displayType === 'contains')).toBe(true)
    expect(locationChildren.map((edge) => edge.target.entity.id).sort()).toEqual(['max', 'serega'])
  })

  it('строит иерархию только по цепочке связей и не учитывает обычные связи', () => {
    let campaign = createCampaign({ name: 'Иерархия' }, new Date('2026-08-19T18:00:00Z'), 'levels')
    for (const [id, type, name] of [
      ['world', 'location', 'Мир'],
      ['purpe', 'location', 'Пурпе'],
      ['second-city', 'location', 'Второй город'],
      ['station', 'location', 'Вокзал'],
      ['scene', 'scene', 'Встреча'],
      ['npc', 'npc', 'Серёга'],
      ['clue', 'clue', 'Посторонняя улика'],
    ] as const) {
      campaign = addEntityToCampaign(campaign, { type, name }, { entityId: id }).campaign
    }
    for (const [sourceId, targetId, type] of [
      ['purpe', 'world', 'located_in'],
      ['second-city', 'world', 'located_in'],
      ['station', 'purpe', 'located_in'],
      ['scene', 'station', 'located_in'],
      ['npc', 'scene', 'participates_in'],
      ['world', 'clue', 'knows'],
    ] as const) {
      campaign = addRelationshipToCampaign(campaign, { sourceId, targetId, type, directed: true }).campaign
    }

    const graph = buildCampaignGraph(campaign)
    const x = new Map(graph.nodes.map((node) => [node.entity.id, node.x]))

    expect(x.get('purpe')).toBe(x.get('second-city'))
    expect(x.get('purpe')! - x.get('world')!).toBe(GRAPH_COLUMN_GAP)
    expect(x.get('station')! - x.get('purpe')!).toBe(GRAPH_COLUMN_GAP)
    expect(x.get('scene')! - x.get('station')!).toBe(GRAPH_COLUMN_GAP)
    expect(x.get('npc')! - x.get('scene')!).toBe(GRAPH_COLUMN_GAP)
    expect(x.get('clue')).toBe(x.get('world'))
  })

  it('показывает сцену левее участвующих в ней сущностей', () => {
    const empty = createCampaign({ name: 'Сцена' }, new Date('2026-08-19T18:00:00Z'), 'c3')
    const withNpc = addEntityToCampaign(empty, { type: 'npc', name: 'Серёга' }, { entityId: 'npc' })
    const withScene = addEntityToCampaign(withNpc.campaign, { type: 'scene', name: 'Совет' }, { entityId: 'scene' })
    const campaign = addRelationshipToCampaign(withScene.campaign, {
      sourceId: 'npc', targetId: 'scene', type: 'participates_in', directed: true,
    }).campaign

    const graph = buildCampaignGraph(campaign)
    const edge = graph.edges[0]

    expect(edge.source.entity.id).toBe('scene')
    expect(edge.target.entity.id).toBe('npc')
    expect(edge.source.x).toBeLessThan(edge.target.x)
    expect(edge.displayType).toBe('includes_participant')
  })

  it('не показывает архивные сущности и связи', () => {
    const campaign = relatedCampaign()
    const graphWithoutRelationship = buildCampaignGraph(
      archiveRelationshipInCampaign(campaign, campaign.relationships[0].id).campaign,
    )
    const graphWithoutEntity = buildCampaignGraph(
      archiveEntityInCampaign(campaign, 'e1').campaign,
    )

    expect(graphWithoutRelationship.nodes).toHaveLength(3)
    expect(graphWithoutRelationship.edges).toHaveLength(1)
    expect(graphWithoutEntity.nodes.some((node) => node.entity.id === 'e1')).toBe(false)
    expect(graphWithoutEntity.edges).toHaveLength(0)
  })

  it('строит Party preview только из явно известных сущностей и связей между ними', () => {
    const campaign = relatedCampaign()
    campaign.knowledge.push({
      id: 'k1', campaignId: campaign.id, subjectType: 'party', content: 'Партия видела след.',
      status: 'suspected', confidence: 40, truth: 'unknown', source: '',
      relatedEntityIds: ['e3'], createdAt: campaign.createdAt, updatedAt: campaign.updatedAt,
    })

    const graph = buildCampaignGraph(campaign, { view: 'party' })

    expect(graph.nodes.map((node) => node.entity.id)).toEqual(['e3'])
    expect(graph.edges).toEqual([])
  })

  it('применяет свободные координаты по обеим осям', () => {
    const graph = buildCampaignGraph(relatedCampaign())
    const positioned = applyCampaignGraphNodePositions(graph, {
      e2: { x: graph.width - 200, y: graph.height - 120 },
      e3: { x: 200, y: 120 },
    })
    const positionedSecond = positioned.nodes.find((node) => node.entity.id === 'e2')!
    const positionedThird = positioned.nodes.find((node) => node.entity.id === 'e3')!

    expect(positionedSecond).toMatchObject({ x: graph.width - 200, y: graph.height - 120 })
    expect(positionedThird).toMatchObject({ x: 200, y: 120 })
  })

  it('позволяет вручную провести линию через локальную контрольную точку', () => {
    const graph = buildCampaignGraph(relatedCampaign())
    const edge = graph.edges[0]
    const routed = applyCampaignGraphEdgeRoutes(graph, {
      [edge.relationship.id]: { x: graph.width / 2, y: graph.height - 36 },
    }).edges[0]

    expect(routed.path).not.toBe(edge.path)
    expect(routed.labelX).toBe(graph.width / 2)
    expect(routed.labelY).toBe(graph.height - 44)
    expect(routed.points).toContainEqual({ x: graph.width / 2, y: graph.height - 36 })
  })

  it('переставляет карточки внутри уровня, чтобы убрать очевидное пересечение связей', () => {
    let campaign = createCampaign({ name: 'Без пересечений' }, new Date('2026-08-27T10:00:00Z'), 'crossing-layout')
    for (const [id, name] of [['parent-a', 'Родитель А'], ['parent-b', 'Родитель Б'], ['child-b', 'Ребёнок Б'], ['child-a', 'Ребёнок А']] as const) {
      campaign = addEntityToCampaign(campaign, { type: 'location', name }, { entityId: id }).campaign
    }
    campaign = addRelationshipToCampaign(campaign, {
      sourceId: 'child-a', targetId: 'parent-a', type: 'located_in', directed: true,
    }, { relationshipId: 'fact-a' }).campaign
    campaign = addRelationshipToCampaign(campaign, {
      sourceId: 'child-b', targetId: 'parent-b', type: 'located_in', directed: true,
    }, { relationshipId: 'fact-b' }).campaign

    const graph = buildCampaignGraph(campaign)
    const y = (id: string) => graph.nodes.find((node) => node.entity.id === id)!.y

    expect(y('parent-a')).toBeLessThan(y('parent-b'))
    expect(y('child-a')).toBeLessThan(y('child-b'))
  })

  it('сохраняет смысл цепочки при свободной ручной раскладке', () => {
    let campaign = createCampaign({ name: 'Наследование' }, new Date('2026-08-19T18:00:00Z'), 'inherited-levels')
    campaign = addEntityToCampaign(campaign, {
      type: 'location', name: 'Вокзал',
    }, { entityId: 'location' }).campaign
    campaign = addEntityToCampaign(campaign, { type: 'scene', name: 'Приезд на поезде' }, { entityId: 'scene' }).campaign
    campaign = addEntityToCampaign(campaign, { type: 'npc', name: 'Макс' }, { entityId: 'npc' }).campaign
    campaign = addRelationshipToCampaign(campaign, {
      sourceId: 'scene', targetId: 'location', type: 'located_in', directed: true,
    }).campaign
    campaign = addRelationshipToCampaign(campaign, {
      sourceId: 'npc', targetId: 'scene', type: 'participates_in', directed: true,
    }).campaign
    const automatic = buildCampaignGraph(campaign)
    const positioned = applyCampaignGraphNodePositions(automatic, {
      location: { x: 800, y: 90 },
      scene: { x: 120, y: 160 },
      npc: { x: 300, y: 230 },
    })
    const x = new Map(positioned.nodes.map((node) => [node.entity.id, node.x]))

    expect(x).toEqual(new Map([['location', 800], ['scene', 120], ['npc', 300]]))
    expect(positioned.edges.map((edge) => [edge.source.entity.id, edge.target.entity.id])).toEqual([
      ['location', 'scene'],
      ['scene', 'npc'],
    ])
  })

  it('строит связи только из ортогональных сегментов и скругляет существующие повороты', () => {
    const graph = buildCampaignGraph(relatedCampaign())

    for (const edge of graph.edges) {
      expect(edge.points.slice(1).every((point, index) =>
        point.x === edge.points[index].x || point.y === edge.points[index].y)).toBe(true)
      if (edge.points.length > 2) expect(edge.path).toContain(' Q ')
    }
  })

  it('ведёт связь на одной высоте прямо: справа от контейнера влево к содержимому', () => {
    const empty = createCampaign({ name: 'Прямая' }, new Date('2026-08-19T18:00:00Z'), 'straight')
    const withChild = addEntityToCampaign(empty, { type: 'npc', name: 'Б' }, { entityId: 'child' })
    const withParent = addEntityToCampaign(withChild.campaign, { type: 'location', name: 'А' }, { entityId: 'parent' })
    const campaign = addRelationshipToCampaign(withParent.campaign, {
      sourceId: 'child', targetId: 'parent', type: 'located_in', directed: true,
    }).campaign
    const edge = buildCampaignGraph(campaign).edges[0]

    expect(edge.source.entity.id).toBe('parent')
    expect(edge.target.entity.id).toBe('child')
    expect(edge.points).toHaveLength(2)
    expect(edge.startX).toBe(edge.source.x + GRAPH_NODE_WIDTH / 2)
    expect(edge.endX).toBe(edge.target.x - GRAPH_NODE_WIDTH / 2 - 9)
    expect(edge.startY).toBe(edge.endY)
    expect(edge.path).not.toContain(' Q ')
  })

  it('разводит связи одного родителя по отдельным выходам, коридорам и подписям', () => {
    let campaign = createCampaign({ name: 'Веер' }, new Date('2026-08-19T18:00:00Z'), 'fan-out')
    campaign = addEntityToCampaign(campaign, { type: 'scene', name: 'Приезд на поезде' }, { entityId: 'scene' }).campaign
    for (const id of ['npc-1', 'npc-2', 'npc-3', 'npc-4']) {
      campaign = addEntityToCampaign(campaign, { type: 'npc', name: id }, { entityId: id }).campaign
      campaign = addRelationshipToCampaign(campaign, {
        sourceId: id, targetId: 'scene', type: 'participates_in', directed: true,
      }).campaign
    }

    const edges = buildCampaignGraph(campaign).edges
    const edgeSegments = edges.map((edge) => edge.points.slice(1)
      .map((point, index) => ({ a: edge.points[index], b: point })))
    const sharedTrunk = edgeSegments.some((segments, edgeIndex) => segments.some((first) =>
      edgeSegments.slice(edgeIndex + 1).some((otherSegments) => otherSegments.some((second) => {
        const firstVertical = first.a.x === first.b.x
        const secondVertical = second.a.x === second.b.x
        if (firstVertical !== secondVertical) return false
        const sameLane = firstVertical ? first.a.x === second.a.x : first.a.y === second.a.y
        if (!sameLane) return false
        const firstRange = firstVertical ? [first.a.y, first.b.y] : [first.a.x, first.b.x]
        const secondRange = secondVertical ? [second.a.y, second.b.y] : [second.a.x, second.b.x]
        return Math.min(Math.max(...firstRange), Math.max(...secondRange)) >
          Math.max(Math.min(...firstRange), Math.min(...secondRange))
      }))))

    expect(new Set(edges.map((edge) => edge.startY)).size).toBe(edges.length)
    expect(sharedTrunk).toBe(false)
    expect(new Set(edges.map((edge) => edge.labelY)).size).toBe(edges.length)
    for (const edge of edges) {
      expect(edge.startX).toBe(edge.source.x + GRAPH_NODE_WIDTH / 2)
      expect(edge.endX).toBe(edge.target.x - GRAPH_NODE_WIDTH / 2 - 9)
      expect(edge.points[1].x - edge.startX).toBeGreaterThanOrEqual(GRAPH_ROUTE_CLEARANCE)
      expect(edge.endX - edge.points.at(-2)!.x).toBeGreaterThanOrEqual(GRAPH_ROUTE_CLEARANCE)
    }
  })

  it('не прокладывает прямую линию через защитную область посторонней карточки', () => {
    let campaign = createCampaign({ name: 'Обход' }, new Date('2026-08-19T18:00:00Z'), 'obstacle')
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Источник' }, { entityId: 'parent' }).campaign
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Цель' }, { entityId: 'child' }).campaign
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Препятствие' }, { entityId: 'obstacle' }).campaign
    campaign = addRelationshipToCampaign(campaign, {
      sourceId: 'parent', targetId: 'child', type: 'knows', directed: true,
    }).campaign
    const graph = applyCampaignGraphNodePositions(buildCampaignGraph(campaign), {
      parent: { x: 140, y: 160 },
      obstacle: { x: 450, y: 160 },
      child: { x: 760, y: 160 },
    })
    const edge = graph.edges[0]
    const obstacle = graph.nodes.find((node) => node.entity.id === 'obstacle')!
    const left = obstacle.x - GRAPH_NODE_WIDTH / 2 - GRAPH_ROUTE_CLEARANCE
    const right = obstacle.x + GRAPH_NODE_WIDTH / 2 + GRAPH_ROUTE_CLEARANCE
    const top = obstacle.y - GRAPH_NODE_HEIGHT / 2 - GRAPH_ROUTE_CLEARANCE
    const bottom = obstacle.y + GRAPH_NODE_HEIGHT / 2 + GRAPH_ROUTE_CLEARANCE
    const crossesObstacle = edge.points.slice(1).some((point, index) => {
      const previous = edge.points[index]
      if (previous.x === point.x) {
        return previous.x > left && previous.x < right &&
          Math.max(previous.y, point.y) > top && Math.min(previous.y, point.y) < bottom
      }
      return previous.y > top && previous.y < bottom &&
        Math.max(previous.x, point.x) > left && Math.min(previous.x, point.x) < right
    })

    expect(edge.points.length).toBeGreaterThan(2)
    expect(crossesObstacle).toBe(false)
  })

  it('не переопределяет намеренно совпадающие ручные координаты', () => {
    let campaign = createCampaign({ name: 'Вертикаль' }, new Date('2026-08-19T18:00:00Z'), 'vertical')
    campaign = addEntityToCampaign(campaign, { type: 'npc', name: 'Первый' }, { entityId: 'e1' }).campaign
    campaign = addEntityToCampaign(campaign, { type: 'npc', name: 'Второй' }, { entityId: 'e2' }).campaign
    const graph = buildCampaignGraph(campaign)
    const positioned = applyCampaignGraphNodePositions(graph, {
      e1: { x: 500, y: 160 },
      e2: { x: 500, y: 160 },
    })
    const first = positioned.nodes.find((node) => node.entity.id === 'e1')!
    const second = positioned.nodes.find((node) => node.entity.id === 'e2')!

    expect(first.x).toBe(second.x)
    expect(first).toMatchObject({ x: 500, y: 160 })
    expect(second).toMatchObject({ x: 500, y: 160 })
  })

  it('не позволяет восстановленным координатам вывести узел за границы полотна', () => {
    const graph = buildCampaignGraph(relatedCampaign())
    const positioned = applyCampaignGraphNodePositions(graph, {
      e1: { x: -500, y: 50_000 },
    })
    const node = positioned.nodes.find((item) => item.entity.id === 'e1')

    expect(node).toMatchObject({
      x: GRAPH_NODE_WIDTH / 2 + GRAPH_ROUTE_CLEARANCE,
      y: graph.height - GRAPH_NODE_HEIGHT / 2 - GRAPH_ROUTE_CLEARANCE,
    })
  })
})
