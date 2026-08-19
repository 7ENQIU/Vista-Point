import { ENTITY_TYPES, type CampaignEntity, type EntityType } from '../domain/campaign/types'

export interface EntityTypeGroup {
  type: EntityType
  entities: CampaignEntity[]
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim()
}

export function groupRelationshipSources(
  entities: CampaignEntity[],
  query: string,
): EntityTypeGroup[] {
  const queryParts = normalizeSearch(query).split(/\s+/).filter(Boolean)
  const matched = entities.filter((entity) => {
    if (queryParts.length === 0) return true
    const haystack = normalizeSearch([
      entity.name,
      ...entity.aliases,
      entity.summary,
      ...entity.tags,
    ].join(' '))
    return queryParts.every((part) => haystack.includes(part))
  })

  return ENTITY_TYPES.flatMap((type): EntityTypeGroup[] => {
    const grouped = matched
      .filter((entity) => entity.type === type)
      .sort((left, right) => left.name.localeCompare(right.name, 'ru-RU'))
    return grouped.length > 0 ? [{ type, entities: grouped }] : []
  })
}
