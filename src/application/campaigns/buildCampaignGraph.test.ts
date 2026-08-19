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

    expect(context?.outgoing).toHaveLength(1)
    expect(context?.incoming).toHaveLength(0)
    expect(context?.mutual).toHaveLength(1)
  })
})
