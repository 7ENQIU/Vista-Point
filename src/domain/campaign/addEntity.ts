import type { Campaign, CampaignEntity, CampaignEvent, CustomFieldValue, EntityType } from './types'

export interface CreateEntityInput {
  type: EntityType
  name: string
  summary?: string
  characterTags?: string[]
  description?: string
  dmNotes?: string
  tags?: string[]
  customFields?: Record<string, CustomFieldValue>
  templateId?: string
  customTypeId?: string
}

export interface AddEntityResult {
  campaign: Campaign
  entity: CampaignEntity
  event: CampaignEvent
}

export interface AddEntityOptions {
  now?: Date
  entityId?: string
  eventId?: string
  origin?: CampaignEntity['origin']
}

export function addEntityToCampaign(
  campaign: Campaign,
  input: CreateEntityInput,
  options: AddEntityOptions = {},
): AddEntityResult {
  const name = input.name.trim()
  if (!name) throw new Error('Название сущности обязательно.')
  const template = input.templateId ? campaign.entityTemplates.find((item) => item.id === input.templateId) : undefined
  if (input.templateId && !template) throw new Error('Выбранный шаблон карточки не найден.')
  if (template && template.entityType !== input.type) throw new Error('Тип сущности не соответствует выбранному шаблону.')
  const customTypeId = input.customTypeId ?? template?.customTypeId
  const customType = customTypeId ? campaign.customEntityTypes.find((item) => item.id === customTypeId) : undefined
  if (customTypeId && !customType) throw new Error('Выбранный пользовательский тип сущности не найден.')
  if (customType && customType.baseType !== input.type) throw new Error('Базовый тип сущности не соответствует пользовательскому типу.')
  if (template && template.customTypeId !== customTypeId) throw new Error('Пользовательский тип сущности не соответствует выбранному шаблону.')
  const customFields = input.customFields ?? template?.customFields ?? {}
  for (const [fieldId, value] of Object.entries(customFields)) {
    const definition = campaign.customFieldDefinitions.find((item) => item.id === fieldId)
    if (!definition) throw new Error('Шаблон ссылается на отсутствующее пользовательское поле.')
    const valid = definition.type === 'boolean' ? typeof value === 'boolean'
      : definition.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === 'string'
    if (!valid) throw new Error(`Шаблон содержит неверное значение поля «${definition.name}».`)
    if (definition.type === 'entity_reference' && value && !campaign.entities.some((entity) => entity.id === value && entity.status !== 'archived')) {
      throw new Error(`Шаблон ссылается на недоступную сущность в поле «${definition.name}».`)
    }
  }

  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const entity: CampaignEntity = {
    id: options.entityId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: input.type,
    customTypeId,
    name,
    aliases: [],
    summary: input.summary?.trim() ?? template?.summary ?? '',
    description: input.description?.trim() ?? template?.description ?? '',
    dmNotes: input.dmNotes?.trim() ?? template?.dmNotes ?? '',
    image: undefined,
    status: 'active',
    tags: [...new Set((input.tags ?? template?.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
    characterTags: input.type === 'npc' ? [...new Set((input.characterTags ?? template?.characterTags ?? []).map((tag) => tag.trim()).filter(Boolean))] : [],
    locationLevel: undefined,
    customFields: { ...customFields },
    state: [],
    origin: options.origin ?? { mode: 'preparation', processed: true, worldTime: campaign.worldTime },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type: entity.origin.mode === 'session_quick_create' ? 'entity.quick_created' : 'entity.created',
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [entity.id],
    reversible: true,
    payload: {
      entityType: entity.type,
      customTypeId: entity.customTypeId,
      entityName: entity.name,
      creationMode: entity.origin.mode,
      newStatus: entity.status,
      templateId: template?.id,
      templateName: template?.name,
    },
  }

  return {
    entity,
    event,
    campaign: {
      ...campaign,
      entities: [...campaign.entities, entity],
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
