import { ENTITY_TYPES, type CampaignEntity, type EntityType } from '../domain/campaign/types'

export interface EntityTypeGroup {
  type: EntityType
  entities: CampaignEntity[]
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

export function groupRelationshipSources(
  entities: CampaignEntity[],
  query: string,
): EntityTypeGroup[] {
  const queryParts = normalizeInput(query).split(/\s+/).filter(Boolean).map(searchVariants)
  const matched = entities.filter((entity) => {
    if (queryParts.length === 0) return true
    const haystack = foldRussianLetters(normalizeInput([
      entity.name,
      ...entity.aliases,
      entity.summary,
      ...entity.tags,
    ].join(' ')))
    return queryParts.every((variants) => variants.some((part) => haystack.includes(part)))
  })

  return ENTITY_TYPES.flatMap((type): EntityTypeGroup[] => {
    const grouped = matched
      .filter((entity) => entity.type === type)
      .sort((left, right) => left.name.localeCompare(right.name, 'ru-RU'))
    return grouped.length > 0 ? [{ type, entities: grouped }] : []
  })
}
