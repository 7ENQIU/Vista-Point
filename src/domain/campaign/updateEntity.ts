import type {
  Campaign,
  CampaignEntity,
  CampaignEvent,
  LifecycleStatus,
  Visibility,
} from './types'

export type EditableEntityStatus = Exclude<LifecycleStatus, 'archived'>

export interface UpdateEntityInput {
  name: string
  aliases: string[]
  summary: string
  description: string
  status: EditableEntityStatus
  visibility: Visibility
  tags: string[]
}

export interface UpdateEntityResult {
  campaign: Campaign
  entity: CampaignEntity
  event?: CampaignEvent
  changed: boolean
}

export interface UpdateEntityOptions {
  now?: Date
  eventId?: string
}

function normalizeList(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const normalized = value.trim()
    const comparisonKey = normalized.toLocaleLowerCase('ru-RU')
    if (!normalized || seen.has(comparisonKey)) continue
    seen.add(comparisonKey)
    result.push(normalized)
  }

  return result
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function updateEntityInCampaign(
  campaign: Campaign,
  entityId: string,
  input: UpdateEntityInput,
  options: UpdateEntityOptions = {},
): UpdateEntityResult {
  const currentEntity = campaign.entities.find((entity) => entity.id === entityId)
  if (!currentEntity) throw new Error('Сущность не найдена.')
  if (currentEntity.status === 'archived') {
    throw new Error('Архивную сущность нельзя редактировать.')
  }

  const name = input.name.trim()
  if (!name) throw new Error('Название сущности обязательно.')

  const nextValues = {
    name,
    aliases: normalizeList(input.aliases),
    summary: input.summary.trim(),
    description: input.description.trim(),
    status: input.status,
    visibility: input.visibility,
    tags: normalizeList(input.tags),
  }
  const changedFields = (Object.keys(nextValues) as Array<keyof typeof nextValues>).filter((field) => {
    const currentValue = currentEntity[field]
    const nextValue = nextValues[field]
    return Array.isArray(currentValue) && Array.isArray(nextValue)
      ? !sameList(currentValue, nextValue)
      : currentValue !== nextValue
  })

  if (changedFields.length === 0) {
    return { campaign, entity: currentEntity, changed: false }
  }

  const timestamp = (options.now ?? new Date()).toISOString()
  const entity: CampaignEntity = {
    ...currentEntity,
    ...nextValues,
    updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'entity.updated',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [entity.id],
    reversible: true,
    payload: {
      changedFields,
      before: Object.fromEntries(changedFields.map((field) => [field, currentEntity[field]])),
      after: Object.fromEntries(changedFields.map((field) => [field, entity[field]])),
    },
  }

  return {
    entity,
    event,
    changed: true,
    campaign: {
      ...campaign,
      entities: campaign.entities.map((item) => item.id === entityId ? entity : item),
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
