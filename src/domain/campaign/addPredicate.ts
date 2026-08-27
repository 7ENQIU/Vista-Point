import type { Campaign, CampaignEvent, Predicate } from './types'

export interface CreatePredicateInput {
  directLabel: string
  inverseLabel: string
  description?: string
  directed: boolean
}

export interface AddPredicateOptions {
  now?: Date
  predicateId?: string
  eventId?: string
}

export function addPredicateToCampaign(
  campaign: Campaign,
  input: CreatePredicateInput,
  options: AddPredicateOptions = {},
): { campaign: Campaign; predicate: Predicate; event: CampaignEvent } {
  const directLabel = input.directLabel.trim()
  const inverseLabel = input.inverseLabel.trim()
  if (!directLabel || !inverseLabel) throw new Error('Укажите прямое и обратное название предиката.')
  const key = directLabel.toLocaleLowerCase('ru-RU')
  if (campaign.predicates.some((item) => item.status !== 'archived' && item.directLabel.toLocaleLowerCase('ru-RU') === key)) {
    throw new Error('Предикат с таким прямым названием уже существует.')
  }

  const timestamp = (options.now ?? new Date()).toISOString()
  const predicate: Predicate = {
    id: options.predicateId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    directLabel,
    inverseLabel,
    description: input.description?.trim() ?? '',
    directed: input.directed,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'predicate.created',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [],
    reversible: true,
    payload: { predicateId: predicate.id, directLabel, inverseLabel, directed: predicate.directed },
  }

  return {
    predicate,
    event,
    campaign: {
      ...campaign,
      predicates: [...campaign.predicates, predicate],
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
