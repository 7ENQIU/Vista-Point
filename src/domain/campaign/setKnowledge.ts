import {
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_SUBJECT_TYPES,
  KNOWLEDGE_TRUTH_VALUES,
  type Campaign,
  type CampaignEvent,
  type KnowledgeRecord,
  type KnowledgeStatus,
  type KnowledgeSubjectType,
  type KnowledgeTruth,
} from './types'

export interface SetKnowledgeInput {
  knowledgeId?: string
  subjectType: KnowledgeSubjectType
  subjectEntityId?: string
  content: string
  status: KnowledgeStatus
  confidence: number
  truth: KnowledgeTruth
  source?: string
  relatedEntityIds: string[]
}

export interface SetKnowledgeResult {
  campaign: Campaign
  knowledge: KnowledgeRecord
  event?: CampaignEvent
  changed: boolean
}

export interface KnowledgeMutationOptions {
  now?: Date
  knowledgeId?: string
  eventId?: string
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function validateInput(campaign: Campaign, input: SetKnowledgeInput): void {
  if (!input.content.trim()) throw new Error('Содержание знания обязательно.')
  if (!KNOWLEDGE_SUBJECT_TYPES.includes(input.subjectType)) throw new Error('Неизвестный субъект знания.')
  if (!KNOWLEDGE_STATUSES.includes(input.status)) throw new Error('Неизвестный статус знания.')
  if (!KNOWLEDGE_TRUTH_VALUES.includes(input.truth)) throw new Error('Неизвестная оценка истинности.')
  if (!Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 100) {
    throw new Error('Уверенность должна быть целым числом от 0 до 100.')
  }

  const entityIds = new Set(campaign.entities.map((entity) => entity.id))
  if (input.subjectType === 'entity' && (!input.subjectEntityId || !entityIds.has(input.subjectEntityId))) {
    throw new Error('Субъект знания не найден в кампании.')
  }
  const relatedIds = uniqueIds(input.relatedEntityIds)
  if (relatedIds.length === 0) throw new Error('Свяжите знание хотя бы с одной сущностью.')
  if (relatedIds.some((id) => !entityIds.has(id))) {
    throw new Error('Связанная сущность знания не найдена в кампании.')
  }
}

function knowledgeSnapshot(knowledge: KnowledgeRecord): Record<string, unknown> {
  return {
    subjectType: knowledge.subjectType,
    subjectEntityId: knowledge.subjectEntityId,
    content: knowledge.content,
    status: knowledge.status,
    confidence: knowledge.confidence,
    truth: knowledge.truth,
    source: knowledge.source,
    relatedEntityIds: knowledge.relatedEntityIds,
  }
}

function sameKnowledge(left: KnowledgeRecord, right: KnowledgeRecord): boolean {
  return JSON.stringify(knowledgeSnapshot(left)) === JSON.stringify(knowledgeSnapshot(right))
}

export function setKnowledgeInCampaign(
  campaign: Campaign,
  input: SetKnowledgeInput,
  options: KnowledgeMutationOptions = {},
): SetKnowledgeResult {
  validateInput(campaign, input)
  const existing = input.knowledgeId
    ? campaign.knowledge.find((knowledge) => knowledge.id === input.knowledgeId)
    : undefined
  if (input.knowledgeId && !existing) throw new Error('Запись знания не найдена.')

  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const knowledge: KnowledgeRecord = {
    id: existing?.id ?? options.knowledgeId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    subjectType: input.subjectType,
    subjectEntityId: input.subjectType === 'entity' ? input.subjectEntityId : undefined,
    content: input.content.trim(),
    status: input.status,
    confidence: input.confidence,
    truth: input.truth,
    source: input.source?.trim() ?? '',
    relatedEntityIds: uniqueIds(input.relatedEntityIds),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  if (existing && sameKnowledge(existing, knowledge)) {
    return { campaign, knowledge: existing, changed: false }
  }

  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: existing ? 'knowledge.updated' : 'knowledge.created',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: uniqueIds([
      ...knowledge.relatedEntityIds,
      ...(knowledge.subjectEntityId ? [knowledge.subjectEntityId] : []),
    ]),
    reversible: true,
    payload: {
      knowledgeId: knowledge.id,
      before: existing ? knowledgeSnapshot(existing) : null,
      after: knowledgeSnapshot(knowledge),
    },
  }

  return {
    knowledge,
    event,
    changed: true,
    campaign: {
      ...campaign,
      knowledge: existing
        ? campaign.knowledge.map((item) => item.id === existing.id ? knowledge : item)
        : [...campaign.knowledge, knowledge],
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}

export function removeKnowledgeFromCampaign(
  campaign: Campaign,
  knowledgeId: string,
  options: Pick<KnowledgeMutationOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; knowledge: KnowledgeRecord; event: CampaignEvent } {
  const knowledge = campaign.knowledge.find((item) => item.id === knowledgeId)
  if (!knowledge) throw new Error('Запись знания не найдена.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: 'knowledge.removed',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: uniqueIds([
      ...knowledge.relatedEntityIds,
      ...(knowledge.subjectEntityId ? [knowledge.subjectEntityId] : []),
    ]),
    reversible: true,
    payload: { knowledgeId, before: knowledgeSnapshot(knowledge) },
  }

  return {
    knowledge,
    event,
    campaign: {
      ...campaign,
      knowledge: campaign.knowledge.filter((item) => item.id !== knowledgeId),
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
