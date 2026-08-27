import type {
  Campaign,
  CampaignEntity,
  CampaignEvent,
  CustomFieldDefinition,
  CustomFieldValue,
  EntityImage,
} from './types'

export interface UpdateEntityInput {
  name: string
  aliases: string[]
  summary: string
  description: string
  dmNotes?: string
  image?: EntityImage
  tags: string[]
  characterTags?: string[]
  customFieldDefinitions?: CustomFieldDefinition[]
  customFields?: Record<string, CustomFieldValue>
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

function sameImage(left: EntityImage | undefined, right: EntityImage | undefined): boolean {
  if (!left || !right) return left === right
  return left.dataUrl === right.dataUrl && left.mimeType === right.mimeType &&
    left.fileName === right.fileName && left.updatedAt === right.updatedAt
}

function sameRecord(left: Record<string, CustomFieldValue>, right: Record<string, CustomFieldValue>): boolean {
  const leftKeys = Object.keys(left)
  return leftKeys.length === Object.keys(right).length && leftKeys.every((key) => left[key] === right[key])
}

function sameDefinitions(left: CustomFieldDefinition[], right: CustomFieldDefinition[]): boolean {
  return left.length === right.length && left.every((field, index) => field.id === right[index]?.id &&
    field.name === right[index]?.name && field.type === right[index]?.type)
}

function ruleUsesCustomField(campaign: Campaign, customFieldId: string): boolean {
  function groupUsesField(group: Campaign['logicRules'][number]['conditionGroup']): boolean {
    return group.children.some((node) => node.kind === 'group'
      ? groupUsesField(node)
      : node.field === 'custom_field' && node.customFieldId === customFieldId)
  }
  return campaign.logicRules.some((rule) => groupUsesField(rule.conditionGroup) ||
    rule.effects.some((effect) => effect.type === 'set_custom_field' && effect.customFieldId === customFieldId))
}

function eventFieldValue(field: string, value: unknown): unknown {
  if (field !== 'image') return value
  if (!value) return null
  const image = value as EntityImage
  return { fileName: image.fileName, mimeType: image.mimeType, updatedAt: image.updatedAt }
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

  const customFieldDefinitions = (input.customFieldDefinitions ?? campaign.customFieldDefinitions).map((definition) => ({
    ...definition,
    name: definition.name.trim(),
  }))
  const definitionIds = new Set<string>()
  const definitionNames = new Set<string>()
  for (const definition of customFieldDefinitions) {
    const normalizedName = definition.name.toLocaleLowerCase('ru-RU')
    if (!definition.id || !definition.name) throw new Error('Название пользовательского поля обязательно.')
    if (definitionIds.has(definition.id) || definitionNames.has(normalizedName)) throw new Error('Пользовательские поля не должны повторяться.')
    definitionIds.add(definition.id)
    definitionNames.add(normalizedName)
  }
  const removedDefinitionIds = campaign.customFieldDefinitions
    .filter((definition) => !definitionIds.has(definition.id))
    .map((definition) => definition.id)
  for (const definition of customFieldDefinitions) {
    const existing = campaign.customFieldDefinitions.find((item) => item.id === definition.id)
    if (existing && existing.type !== definition.type) throw new Error('Тип существующего пользовательского поля нельзя изменить.')
  }
  if (removedDefinitionIds.some((fieldId) => ruleUsesCustomField(campaign, fieldId))) {
    throw new Error('Нельзя удалить поле, пока оно используется логическим правилом.')
  }
  if (removedDefinitionIds.some((fieldId) => campaign.entityTemplates.some((template) => Object.prototype.hasOwnProperty.call(template.customFields, fieldId)))) {
    throw new Error('Нельзя удалить поле, пока оно используется шаблоном карточки.')
  }
  const customFields = input.customFields ?? currentEntity.customFields
  const definitionsChanged = !sameDefinitions(campaign.customFieldDefinitions, customFieldDefinitions)
  if (removedDefinitionIds.some((fieldId) => campaign.entities.some((entity) => Object.prototype.hasOwnProperty.call(entity.customFields, fieldId)))) {
    throw new Error('Нельзя удалить поле, пока оно заполнено хотя бы у одной сущности.')
  }
  for (const [fieldId, value] of Object.entries(customFields)) {
    const definition = customFieldDefinitions.find((item) => item.id === fieldId)
    if (!definition) throw new Error('Значение ссылается на отсутствующее пользовательское поле.')
    const valid = definition.type === 'boolean' ? typeof value === 'boolean'
      : definition.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === 'string'
    if (!valid) throw new Error(`Поле «${definition.name}» содержит значение неверного типа.`)
    if (definition.type === 'entity_reference' && value && !campaign.entities.some((entity) => entity.id === value)) {
      throw new Error(`Поле «${definition.name}» ссылается на отсутствующую сущность.`)
    }
  }

  const nextValues = {
    name,
    aliases: normalizeList(input.aliases),
    summary: input.summary.trim(),
    description: input.description.trim(),
    dmNotes: input.dmNotes === undefined ? currentEntity.dmNotes : input.dmNotes.trim(),
    image: Object.prototype.hasOwnProperty.call(input, 'image') ? input.image : currentEntity.image,
    tags: normalizeList(input.tags),
    characterTags: currentEntity.type === 'npc' ? normalizeList(input.characterTags ?? currentEntity.characterTags) : [],
    customFields,
    locationLevel: undefined,
  }

  const changedFields = (Object.keys(nextValues) as Array<keyof typeof nextValues>).filter((field) => {
    const currentValue = currentEntity[field]
    const nextValue = nextValues[field]
    if (field === 'image') return !sameImage(currentValue as EntityImage | undefined, nextValue as EntityImage | undefined)
    if (field === 'customFields') return !sameRecord(currentValue as Record<string, CustomFieldValue>, nextValue as Record<string, CustomFieldValue>)
    return Array.isArray(currentValue) && Array.isArray(nextValue)
      ? !sameList(currentValue, nextValue)
      : currentValue !== nextValue
  })

  if (changedFields.length === 0 && !definitionsChanged) {
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
    reversible: !definitionsChanged && !changedFields.includes('image') && !changedFields.includes('customFields'),
    payload: {
      changedFields,
      customFieldDefinitionsChanged: definitionsChanged,
      before: Object.fromEntries(changedFields.map((field) => [field, eventFieldValue(field, currentEntity[field])])),
      after: Object.fromEntries(changedFields.map((field) => [field, eventFieldValue(field, entity[field])])),
    },
  }

  return {
    entity,
    event,
    changed: true,
    campaign: {
      ...campaign,
      entities: campaign.entities.map((item) => item.id === entityId ? entity : item),
      customFieldDefinitions,
      eventLog: [...campaign.eventLog, event],
      updatedAt: timestamp,
    },
  }
}
