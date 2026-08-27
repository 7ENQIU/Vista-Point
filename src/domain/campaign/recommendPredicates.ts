import type { CampaignEntity, Predicate, RelationshipType } from './types'

export interface PredicateRecommendations {
  recommended: Predicate[]
  other: Predicate[]
}

type TypePair = `${CampaignEntity['type']}→${CampaignEntity['type']}`

const PAIR_RECOMMENDATIONS: Partial<Record<TypePair, RelationshipType[]>> = {
  'location→location': ['located_in', 'contains', 'transitions_to'],
  'scene→location': ['located_in'],
  'scene→scene': ['transitions_to'],
  'npc→location': ['located_in'],
  'npc→scene': ['participates_in'],
  'npc→npc': ['knows', 'opposes', 'controls'],
  'item→location': ['located_in'],
  'item→npc': ['belongs_to'],
  'item→scene': ['participates_in'],
  'clue→location': ['located_in'],
  'clue→npc': ['reveals'],
  'clue→scene': ['participates_in'],
  'note→location': ['belongs_to'],
  'note→npc': ['belongs_to'],
  'note→scene': ['belongs_to'],
  'event→location': ['located_in'],
  'event→scene': ['causes', 'belongs_to'],
  'event→event': ['causes', 'depends_on'],
  'encounter→location': ['located_in'],
  'encounter→scene': ['participates_in'],
}

function fallbackRecommendations(source: CampaignEntity, target: CampaignEntity): RelationshipType[] {
  if (target.type === 'location') return ['located_in']
  if (target.type === 'scene' && source.type !== 'scene') return ['participates_in']
  if (source.type === 'event') return ['causes']
  return []
}

export function recommendPredicatesForEntities(
  source: CampaignEntity | undefined,
  target: CampaignEntity | undefined,
  predicates: readonly Predicate[],
): PredicateRecommendations {
  const active = predicates.filter((predicate) => predicate.status !== 'archived')
  if (!source || !target || source.id === target.id) return { recommended: [], other: active }
  const systemTypes = PAIR_RECOMMENDATIONS[`${source.type}→${target.type}`] ?? fallbackRecommendations(source, target)
  const rank = new Map(systemTypes.map((type, index) => [type, index]))
  const recommended = active
    .filter((predicate) => predicate.systemType && rank.has(predicate.systemType))
    .sort((left, right) => rank.get(left.systemType!)! - rank.get(right.systemType!)!)
  const recommendedIds = new Set(recommended.map((predicate) => predicate.id))
  return { recommended, other: active.filter((predicate) => !recommendedIds.has(predicate.id)) }
}
