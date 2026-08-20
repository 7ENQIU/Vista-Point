import { ENTITY_TYPES, type CampaignEntity, type EntityType } from '../domain/campaign/types'
import { entityMatchesQuery } from './searchCampaignEntities'

export interface EntityTypeGroup {
  type: EntityType
  entities: CampaignEntity[]
}

export function groupRelationshipSources(
  entities: CampaignEntity[],
  query: string,
): EntityTypeGroup[] {
  const matched = entities.filter((entity) => entityMatchesQuery(entity, query))

  return ENTITY_TYPES.flatMap((type): EntityTypeGroup[] => {
    const grouped = matched
      .filter((entity) => entity.type === type)
      .sort((left, right) => left.name.localeCompare(right.name, 'ru-RU'))
    return grouped.length > 0 ? [{ type, entities: grouped }] : []
  })
}
