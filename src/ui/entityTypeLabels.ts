import type { Campaign, CampaignEntity, EntityTemplate, EntityType } from '../domain/campaign/types'
import { ru } from '../shared/i18n/ru'

export function entityTypeLabel(
  campaign: Pick<Campaign, 'customEntityTypes'>,
  item: { type: EntityType; customTypeId?: string } | Pick<EntityTemplate, 'entityType' | 'customTypeId'>,
) {
  const baseType = 'type' in item ? item.type : item.entityType
  return (item.customTypeId && campaign.customEntityTypes.find((customType) => customType.id === item.customTypeId)?.name) || ru.entityTypes[baseType]
}

export function entityTypeSelectionValue(item: Pick<CampaignEntity, 'type' | 'customTypeId'>) {
  return item.customTypeId ? `custom:${item.customTypeId}` : `base:${item.type}`
}
