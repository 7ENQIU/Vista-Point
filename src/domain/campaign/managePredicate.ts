import type { Campaign, CampaignEvent, Predicate } from './types'

export interface UpdatePredicateInput {
  directLabel: string
  inverseLabel: string
  description?: string
}

export interface ManagePredicateOptions {
  now?: Date
  eventId?: string
}

function editablePredicate(campaign: Campaign, predicateId: string): Predicate {
  const predicate = campaign.predicates.find((item) => item.id === predicateId)
  if (!predicate) throw new Error('Предикат не найден.')
  if (predicate.systemType) throw new Error('Встроенный предикат нельзя изменить или архивировать.')
  if (predicate.status === 'archived') throw new Error('Предикат уже находится в архиве.')
  return predicate
}

export function updatePredicateInCampaign(
  campaign: Campaign,
  predicateId: string,
  input: UpdatePredicateInput,
  options: ManagePredicateOptions = {},
): { campaign: Campaign; predicate: Predicate; event?: CampaignEvent; changed: boolean } {
  const current = editablePredicate(campaign, predicateId)
  const directLabel = input.directLabel.trim()
  const inverseLabel = input.inverseLabel.trim()
  const description = input.description?.trim() ?? ''
  if (!directLabel || !inverseLabel) throw new Error('Укажите прямое и обратное название предиката.')
  const keys = new Set([directLabel, inverseLabel].map((label) => label.toLocaleLowerCase('ru-RU')))
  if (campaign.predicates.some((predicate) => predicate.id !== predicateId && predicate.status !== 'archived' &&
    [predicate.directLabel, predicate.inverseLabel].some((label) => keys.has(label.toLocaleLowerCase('ru-RU'))))) {
    throw new Error('Предикат с таким названием уже существует.')
  }
  if (directLabel === current.directLabel && inverseLabel === current.inverseLabel && description === current.description) {
    return { campaign, predicate: current, changed: false }
  }

  const timestamp = (options.now ?? new Date()).toISOString()
  const predicate = { ...current, directLabel, inverseLabel, description, updatedAt: timestamp }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'predicate.updated',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId,
    relatedEntityIds: [], reversible: true,
    payload: {
      predicateId,
      before: { directLabel: current.directLabel, inverseLabel: current.inverseLabel, description: current.description },
      after: { directLabel, inverseLabel, description },
    },
  }
  return {
    predicate, event, changed: true,
    campaign: { ...campaign, predicates: campaign.predicates.map((item) => item.id === predicateId ? predicate : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}

export function archivePredicateInCampaign(
  campaign: Campaign,
  predicateId: string,
  options: ManagePredicateOptions = {},
): { campaign: Campaign; predicate: Predicate; event: CampaignEvent } {
  const current = editablePredicate(campaign, predicateId)
  const activeFactCount = campaign.relationships.filter((fact) => fact.status !== 'archived' && fact.predicateId === predicateId).length
  if (activeFactCount > 0) throw new Error(`Сначала отмените факты с этим предикатом: ${activeFactCount}.`)
  const timestamp = (options.now ?? new Date()).toISOString()
  const predicate: Predicate = { ...current, status: 'archived', updatedAt: timestamp }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'predicate.archived',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId,
    relatedEntityIds: [], reversible: true,
    payload: { predicateId, directLabel: current.directLabel, inverseLabel: current.inverseLabel },
  }
  return {
    predicate, event,
    campaign: { ...campaign, predicates: campaign.predicates.map((item) => item.id === predicateId ? predicate : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}
