import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { addRelationshipToCampaign } from '../../domain/campaign/addRelationship'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { buildCampaignGraph, getFocusedGraphContext, GRAPH_WIDTH } from './buildCampaignGraph'

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
})
