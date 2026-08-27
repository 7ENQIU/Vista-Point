import type { Campaign, CampaignEntity, Relationship } from '../../domain/campaign/types'

function hierarchyEndpoints(relationship: Relationship): { childId: string; parentId: string } | undefined {
  if (!relationship.directed) return undefined
  if (relationship.type === 'located_in' || relationship.type === 'participates_in') {
    return { childId: relationship.sourceId, parentId: relationship.targetId }
  }
  if (relationship.type === 'contains') {
    return { childId: relationship.targetId, parentId: relationship.sourceId }
  }
  return undefined
}
function relationshipPriority(relationship: Relationship): number {
  return relationship.type === 'participates_in' ? 2 : 1
}

/**
 * Оставляет для каждой сущности только ближайший пространственный контекст.
 * Остальные типы связей не затрагиваются.
 */
export function selectImmediateHierarchyRelationships(
  campaign: Campaign,
  relationships = campaign.relationships.filter((relationship) => relationship.status !== 'archived'),
): Relationship[] {
  const selected = new Map<string, { relationship: Relationship; index: number }>()

  relationships.forEach((relationship, index) => {
    const endpoints = hierarchyEndpoints(relationship)
    if (!endpoints) return
    const current = selected.get(endpoints.childId)
    if (!current) {
      selected.set(endpoints.childId, { relationship, index })
      return
    }
    const priority = relationshipPriority(relationship) - relationshipPriority(current.relationship)
    if (priority > 0 || (priority === 0 && index > current.index)) {
      selected.set(endpoints.childId, { relationship, index })
    }
  })

  const selectedIds = new Set([...selected.values()].map((item) => item.relationship.id))
  return relationships.filter((relationship) => !hierarchyEndpoints(relationship) || selectedIds.has(relationship.id))
}

export function buildEntityContextPaths(campaign: Campaign): Map<string, CampaignEntity[]> {
  const entityById = new Map(campaign.entities.filter((entity) => entity.status !== 'archived').map((entity) => [entity.id, entity]))
  const parentByChild = new Map<string, string>()
  for (const relationship of selectImmediateHierarchyRelationships(campaign)) {
    const endpoints = hierarchyEndpoints(relationship)
    if (endpoints && entityById.has(endpoints.childId) && entityById.has(endpoints.parentId)) {
      parentByChild.set(endpoints.childId, endpoints.parentId)
    }
  }

  return new Map([...entityById.keys()].map((entityId) => {
    const reversed: CampaignEntity[] = []
    const visited = new Set([entityId])
    let parentId = parentByChild.get(entityId)
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      const parent = entityById.get(parentId)
      if (!parent) break
      reversed.push(parent)
      parentId = parentByChild.get(parentId)
    }
    return [entityId, reversed.reverse()]
  }))
}
