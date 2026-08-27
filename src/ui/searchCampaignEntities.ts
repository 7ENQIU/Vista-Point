import {
  ENTITY_TYPES,
  type CampaignEntity,
  type CustomFieldDefinition,
  type EntityType,
} from '../domain/campaign/types'

export type EntitySearchField =
  | 'name'
  | 'alias'
  | 'summary'
  | 'description'
  | 'tag'
  | 'character_tag'
  | 'custom_field'
  | 'state_name'
  | 'state_value'

export interface EntitySearchMatch {
  field: EntitySearchField
  value: string
}

export interface EntitySearchResult {
  entity: CampaignEntity
  match?: EntitySearchMatch
}

export interface EntitySearchGroup {
  type: EntityType
  results: EntitySearchResult[]
}

export interface SearchCampaignEntitiesFilters {
  query: string
  types: EntityType[]
  customTypeIds?: string[]
}

const ENGLISH_KEYBOARD = '`qwertyuiop[]asdfghjkl;\'zxcvbnm,./'
const RUSSIAN_KEYBOARD = 'ёйцукенгшщзхъфывапролджэячсмитьбю.'

function normalizeInput(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').trim()
}

function foldRussianLetters(value: string): string {
  return value.replaceAll('ё', 'е')
}

function translateKeyboard(value: string, from: string, to: string): string {
  return [...value].map((character) => {
    const index = from.indexOf(character)
    return index >= 0 ? to[index] : character
  }).join('')
}

function searchVariants(value: string): string[] {
  const normalized = normalizeInput(value)
  return [...new Set([
    foldRussianLetters(normalized),
    foldRussianLetters(translateKeyboard(normalized, ENGLISH_KEYBOARD, RUSSIAN_KEYBOARD)),
    foldRussianLetters(translateKeyboard(normalized, RUSSIAN_KEYBOARD, ENGLISH_KEYBOARD)),
  ])]
}

function stateValue(value: boolean | number | string): string {
  if (typeof value !== 'boolean') return String(value)
  return value ? 'true да' : 'false нет'
}

function customFieldValue(name: string, value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${name} ${String(value)}`
  }
  try {
    return `${name} ${JSON.stringify(value)}`
  } catch {
    return name
  }
}

function searchableFields(
  entity: CampaignEntity,
  customFieldDefinitions: CustomFieldDefinition[] = [],
  entitiesById: Map<string, CampaignEntity> = new Map(),
): EntitySearchMatch[] {
  const definitionsById = new Map(customFieldDefinitions.map((field) => [field.id, field]))
  const fields: EntitySearchMatch[] = [
    { field: 'name', value: entity.name },
    ...entity.aliases.map((value): EntitySearchMatch => ({ field: 'alias', value })),
    { field: 'summary', value: entity.summary },
    { field: 'description', value: entity.description },
    ...entity.tags.map((value): EntitySearchMatch => ({ field: 'tag', value })),
    ...entity.characterTags.map((value): EntitySearchMatch => ({ field: 'character_tag', value })),
    ...Object.entries(entity.customFields).map(([id, value]): EntitySearchMatch => ({
      field: 'custom_field',
      value: customFieldValue(definitionsById.get(id)?.name ?? id,
        definitionsById.get(id)?.type === 'entity_reference' && typeof value === 'string'
          ? entitiesById.get(value)?.name ?? value
          : value),
    })),
    ...entity.state.flatMap((state): EntitySearchMatch[] => [
      { field: 'state_name', value: state.name },
      { field: 'state_value', value: stateValue(state.value) },
    ]),
  ]
  return fields.filter((item) => item.value.trim())
}

function matchesVariants(value: string, variants: string[]): boolean {
  const normalized = foldRussianLetters(normalizeInput(value))
  return variants.some((variant) => normalized.includes(variant))
}

export function findEntitySearchMatch(
  entity: CampaignEntity,
  query: string,
  customFieldDefinitions: CustomFieldDefinition[] = [],
  entitiesById: Map<string, CampaignEntity> = new Map(),
): EntitySearchMatch | undefined {
  const queryParts = normalizeInput(query).split(/\s+/).filter(Boolean).map(searchVariants)
  if (queryParts.length === 0) return undefined

  const fields = searchableFields(entity, customFieldDefinitions, entitiesById)
  const haystack = fields.map((item) => item.value).join(' ')
  if (!queryParts.every((variants) => matchesVariants(haystack, variants))) return undefined

  return fields.find((field) => queryParts.some((variants) => matchesVariants(field.value, variants)))
}

export function entityMatchesQuery(entity: CampaignEntity, query: string): boolean {
  return normalizeInput(query) === '' || findEntitySearchMatch(entity, query) !== undefined
}

export function searchCampaignEntities(
  entities: CampaignEntity[],
  filters: SearchCampaignEntitiesFilters,
  customFieldDefinitions: CustomFieldDefinition[] = [],
): EntitySearchGroup[] {
  const allowedTypes = new Set(filters.types)
  const allowedCustomTypes = new Set(filters.customTypeIds ?? [])
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]))
  const matched = entities.flatMap((entity): EntitySearchResult[] => {
    if (entity.status === 'archived') return []
    if (allowedTypes.size > 0 || allowedCustomTypes.size > 0) {
      if (!allowedTypes.has(entity.type) && (!entity.customTypeId || !allowedCustomTypes.has(entity.customTypeId))) return []
    }
    const match = findEntitySearchMatch(entity, filters.query, customFieldDefinitions, entitiesById)
    if (normalizeInput(filters.query) && !match) return []
    return [{ entity, match }]
  })

  return ENTITY_TYPES.flatMap((type): EntitySearchGroup[] => {
    const results = matched
      .filter((result) => result.entity.type === type)
      .sort((left, right) => left.entity.name.localeCompare(right.entity.name, 'ru-RU'))
    return results.length > 0 ? [{ type, results }] : []
  })
}
