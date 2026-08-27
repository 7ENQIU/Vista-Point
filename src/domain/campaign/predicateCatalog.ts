import { RELATIONSHIP_TYPES, type Predicate, type RelationshipType } from './types'

interface BuiltinPredicateDefinition {
  directLabel: string
  inverseLabel: string
  directed: boolean
}

export const BUILTIN_PREDICATE_DEFINITIONS: Record<RelationshipType, BuiltinPredicateDefinition> = {
  located_in: { directLabel: 'Находится в', inverseLabel: 'Содержит', directed: true },
  belongs_to: { directLabel: 'Принадлежит', inverseLabel: 'Включает', directed: true },
  knows: { directLabel: 'Знает', inverseLabel: 'Известен', directed: true },
  controls: { directLabel: 'Контролирует', inverseLabel: 'Контролируется', directed: true },
  depends_on: { directLabel: 'Зависит от', inverseLabel: 'Необходим для', directed: true },
  discovers: { directLabel: 'Обнаруживает', inverseLabel: 'Обнаружен', directed: true },
  blocks: { directLabel: 'Блокирует', inverseLabel: 'Заблокирован', directed: true },
  causes: { directLabel: 'Вызывает', inverseLabel: 'Вызван', directed: true },
  reveals: { directLabel: 'Раскрывает', inverseLabel: 'Раскрывается через', directed: true },
  opposes: { directLabel: 'Противостоит', inverseLabel: 'Противостоит', directed: false },
  contains: { directLabel: 'Содержит', inverseLabel: 'Находится в', directed: true },
  transitions_to: { directLabel: 'Переходит в', inverseLabel: 'Следует после', directed: true },
  participates_in: { directLabel: 'Участвует в', inverseLabel: 'Включает участника', directed: true },
}

export function builtinPredicateId(type: RelationshipType): string {
  return `builtin:${type}`
}

export function createBuiltinPredicates(campaignId: string, timestamp: string): Predicate[] {
  return RELATIONSHIP_TYPES.map((type) => ({
    id: builtinPredicateId(type),
    campaignId,
    ...BUILTIN_PREDICATE_DEFINITIONS[type],
    description: '',
    systemType: type,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}
