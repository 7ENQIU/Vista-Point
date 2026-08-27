import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { addPredicateToCampaign } from './addPredicate'
import { createCampaign } from './createCampaign'
import { recommendPredicatesForEntities } from './recommendPredicates'

function pair(sourceType: Parameters<typeof addEntityToCampaign>[1]['type'], targetType: Parameters<typeof addEntityToCampaign>[1]['type']) {
  const source = addEntityToCampaign(createCampaign({ name: 'Рекомендации' }), { type: sourceType, name: 'Источник' }, { entityId: 'source' })
  const target = addEntityToCampaign(source.campaign, { type: targetType, name: 'Цель' }, { entityId: 'target' })
  return target
}

describe('recommendPredicatesForEntities', () => {
  it('рекомендует нахождение и переход для двух локаций в устойчивом порядке', () => {
    const campaign = pair('location', 'location').campaign
    const result = recommendPredicatesForEntities(campaign.entities[0], campaign.entities[1], campaign.predicates)
    expect(result.recommended.map((predicate) => predicate.systemType)).toEqual(['located_in', 'contains', 'transitions_to'])
  })

  it('рекомендует участие для NPC и сцены', () => {
    const campaign = pair('npc', 'scene').campaign
    const result = recommendPredicatesForEntities(campaign.entities[0], campaign.entities[1], campaign.predicates)
    expect(result.recommended.map((predicate) => predicate.systemType)).toEqual(['participates_in'])
  })

  it('оставляет пользовательские и нерекомендованные предикаты доступными', () => {
    const base = pair('npc', 'npc').campaign
    const campaign = addPredicateToCampaign(base, { directLabel: 'Доверяет', inverseLabel: 'Пользуется доверием', directed: true }, { predicateId: 'custom:trusts' }).campaign
    const result = recommendPredicatesForEntities(campaign.entities[0], campaign.entities[1], campaign.predicates)
    expect(result.recommended.map((predicate) => predicate.systemType)).toEqual(['knows', 'opposes', 'controls'])
    expect(result.other.some((predicate) => predicate.id === 'custom:trusts')).toBe(true)
  })

  it('не предлагает рекомендации без полной пары', () => {
    const campaign = pair('npc', 'location').campaign
    expect(recommendPredicatesForEntities(campaign.entities[0], undefined, campaign.predicates)).toEqual({ recommended: [], other: campaign.predicates })
  })
})
