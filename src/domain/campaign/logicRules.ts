import {
  KNOWLEDGE_STATUSES, KNOWLEDGE_SUBJECT_TYPES, LOGIC_CONDITION_FIELDS, LOGIC_CONDITION_OPERATORS,
  LOGIC_EFFECT_TYPES, LOGIC_EXECUTION_MODES, LOGIC_GROUP_OPERATORS, RELATIONSHIP_TYPES,
  type Campaign, type CampaignEntity, type CampaignEvent, type KnowledgeSubjectType, type LifecycleStatus,
  type LogicCondition, type LogicConditionField, type LogicConditionGroup, type LogicConditionNode,
  type LogicConditionOperator, type LogicEffect, type LogicEffectType,
  type CustomFieldDefinition, type CustomFieldValue, type LogicExecutionMode, type LogicGroupOperator, type LogicRule, type LogicTrigger, type RelationshipType, type StateValue,
} from './types'
import { addRelationshipToCampaign, isSameRelationship } from './addRelationship'

export interface LogicConditionInput {
  kind: 'condition'; id?: string; entityId?: string; field: LogicConditionField; stateId?: string
  customFieldId?: string
  targetEntityId?: string; relationshipType?: RelationshipType; predicateId?: string; subjectType?: KnowledgeSubjectType
  subjectEntityId?: string; operator: LogicConditionOperator; value?: StateValue | LifecycleStatus
}
export interface LogicConditionGroupInput { kind: 'group'; id?: string; operator: LogicGroupOperator; minimum?: number; children: LogicConditionNodeInput[] }
export type LogicConditionNodeInput = LogicConditionInput | LogicConditionGroupInput
export type LogicEffectInput =
  | { id?: string; entityId: string; type: 'set_state'; stateId: string; value: StateValue }
  | { id?: string; entityId: string; type: 'set_custom_field'; customFieldId: string; value: CustomFieldValue }
  | { id?: string; entityId: string; type: 'create_fact'; targetEntityId: string; predicateId: string; directed?: boolean; description?: string }
  | { id?: string; entityId: string; type: 'set_lifecycle_status'; value: LifecycleStatus }
export interface SetLogicRuleInput { ruleId?: string; name: string; description?: string; enabled: boolean; conditionGroup: LogicConditionGroupInput; effects: LogicEffectInput[]; executionMode: LogicExecutionMode; trigger?: LogicTrigger }
export interface LogicConditionEvaluation { conditionId: string; passed: boolean; entityId?: string; actual?: StateValue | LifecycleStatus; explanation: string }
export interface LogicGroupEvaluation { groupId: string; passed: boolean; matched: number; total: number; explanation: string }
export interface LogicRuleEvaluation { satisfied: boolean; conditionResults: LogicConditionEvaluation[]; groupResults: LogicGroupEvaluation[]; explanation: string }
export interface LogicEffectPreview { effectId: string; entityId: string; targetEntityId?: string; type: LogicEffect['type']; changed: boolean; explanation: string }
export interface LogicRulePreview { evaluation: LogicRuleEvaluation; effects: LogicEffectPreview[]; canApply: boolean }
export interface LogicMutationOptions { now?: Date; ruleId?: string; eventId?: string; conditionIds?: string[]; groupIds?: string[]; effectIds?: string[]; relationshipIds?: string[]; source?: 'user' | 'system'; activationId?: string }

function getEntity(campaign: Campaign, entityId?: string): CampaignEntity {
  const entity = campaign.entities.find((item) => item.id === entityId)
  if (!entity || entity.status === 'archived') throw new Error('Сущность правила не найдена или находится в архиве.')
  return entity
}
function valueMatchesType(value: unknown, type: string): boolean {
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'decimal') return typeof value === 'number' && Number.isFinite(value)
  return type === 'text' && typeof value === 'string'
}
function customFieldValueMatchesType(value: unknown, definition: CustomFieldDefinition): value is CustomFieldValue {
  if (definition.type === 'boolean') return typeof value === 'boolean'
  if (definition.type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === 'string'
}
function getCustomFieldDefinition(campaign: Campaign, customFieldId?: string): CustomFieldDefinition {
  const definition = campaign.customFieldDefinitions.find((item) => item.id === customFieldId)
  if (!definition) throw new Error('Пользовательское поле правила не найдено.')
  return definition
}
function validateCustomFieldComparison(campaign: Campaign, definition: CustomFieldDefinition, operator: LogicConditionOperator, value: unknown): void {
  const existence = operator === 'exists' || operator === 'not_exists'
  if (existence) return
  if (!customFieldValueMatchesType(value, definition)) throw new Error('Значение условия не соответствует типу пользовательского поля.')
  if (definition.type === 'number' && !['equals', 'not_equals', 'greater', 'greater_or_equal', 'less', 'less_or_equal'].includes(operator)) throw new Error('Для числового поля выбран недопустимый оператор.')
  if (definition.type === 'text' && !['equals', 'not_equals', 'contains', 'not_contains'].includes(operator)) throw new Error('Для текстового поля выбран недопустимый оператор.')
  if ((definition.type === 'boolean' || definition.type === 'entity_reference') && !['equals', 'not_equals'].includes(operator)) throw new Error('Для этого поля доступны только равенство и неравенство.')
  if (definition.type === 'entity_reference' && value && typeof value === 'string') getEntity(campaign, value)
}
function validateCondition(campaign: Campaign, condition: LogicConditionInput): void {
  if (!LOGIC_CONDITION_FIELDS.includes(condition.field)) throw new Error('Поле условия не поддерживается.')
  if (!LOGIC_CONDITION_OPERATORS.includes(condition.operator)) throw new Error('Оператор условия не поддерживается.')
  if (condition.field === 'world_time') {
    if (!['equals', 'not_equals', 'greater', 'greater_or_equal', 'less', 'less_or_equal'].includes(condition.operator)) throw new Error('Для мирового времени выбран недопустимый оператор.')
    if (typeof condition.value !== 'string' || Number.isNaN(Date.parse(condition.value))) throw new Error('Укажите корректное мировое время в условии.')
    return
  }
  const entity = getEntity(campaign, condition.entityId)
  if (condition.field === 'custom_field') {
    const definition = getCustomFieldDefinition(campaign, condition.customFieldId)
    validateCustomFieldComparison(campaign, definition, condition.operator, condition.value)
    return
  }
  if (condition.field === 'relationship') {
    getEntity(campaign, condition.targetEntityId)
    if (condition.predicateId) {
      const predicate = campaign.predicates.find((item) => item.id === condition.predicateId && item.status !== 'archived')
      if (!predicate) throw new Error('Выберите действующий предикат для условия.')
    } else if (!condition.relationshipType || !RELATIONSHIP_TYPES.includes(condition.relationshipType)) {
      throw new Error('Выберите предикат для условия.')
    }
    if (!['exists', 'not_exists'].includes(condition.operator)) throw new Error('Связь поддерживает только проверку существования.')
    return
  }
  if (condition.field === 'knowledge') {
    if (!condition.subjectType || !KNOWLEDGE_SUBJECT_TYPES.includes(condition.subjectType)) throw new Error('Выберите субъекта знания.')
    if (condition.subjectType === 'entity') getEntity(campaign, condition.subjectEntityId)
    if (!['exists', 'not_exists', 'equals', 'not_equals'].includes(condition.operator)) throw new Error('Для знания выбран недопустимый оператор.')
    if (['equals', 'not_equals'].includes(condition.operator) && !KNOWLEDGE_STATUSES.includes(String(condition.value) as (typeof KNOWLEDGE_STATUSES)[number])) throw new Error('Выберите корректный статус знания.')
    return
  }
  if (condition.field === 'lifecycle_status') {
    if (!['equals', 'not_equals'].includes(condition.operator)) throw new Error('Статус сущности поддерживает только равенство и неравенство.')
    if (!['draft', 'active'].includes(String(condition.value))) throw new Error('Недопустимый статус в условии.')
    return
  }
  if (!condition.stateId) throw new Error('Выберите параметр состояния для условия.')
  const state = entity.state.find((item) => item.id === condition.stateId)
  const existence = condition.operator === 'exists' || condition.operator === 'not_exists'
  if (!state && !existence) throw new Error('Параметр состояния условия не найден.')
  if (existence) return
  if (!state || !valueMatchesType(condition.value, state.valueType)) throw new Error('Значение условия не соответствует типу параметра состояния.')
  if (['greater', 'greater_or_equal', 'less', 'less_or_equal'].includes(condition.operator) && typeof state.value !== 'number') throw new Error('Числовое сравнение доступно только для числового состояния.')
  if (['contains', 'not_contains'].includes(condition.operator) && state.valueType !== 'text') throw new Error('Проверка содержания доступна только для текстового состояния.')
}
function validateGroup(campaign: Campaign, group: LogicConditionGroupInput, depth = 0): void {
  if (depth > 5) throw new Error('Глубина вложенности условий не может превышать пять уровней.')
  if (!LOGIC_GROUP_OPERATORS.includes(group.operator)) throw new Error('Логика группы не поддерживается.')
  if (!group.children.length) throw new Error('Группа должна содержать хотя бы одно условие или подгруппу.')
  if (group.operator === 'count' && (!Number.isInteger(group.minimum) || group.minimum! < 1 || group.minimum! > group.children.length)) throw new Error('COUNT должен требовать от одного до количества элементов группы.')
  group.children.forEach((node) => node.kind === 'group' ? validateGroup(campaign, node, depth + 1) : validateCondition(campaign, node))
}
function validateEffect(campaign: Campaign, effect: LogicEffectInput): void {
  const entity = getEntity(campaign, effect.entityId)
  if (!LOGIC_EFFECT_TYPES.includes(effect.type)) throw new Error('Тип последствия не поддерживается.')
  if (effect.type === 'create_fact') {
    getEntity(campaign, effect.targetEntityId)
    if (effect.entityId === effect.targetEntityId) throw new Error('Источник и цель нового факта должны различаться.')
    const predicate = campaign.predicates.find((item) => item.id === effect.predicateId && item.status !== 'archived')
    if (!predicate) throw new Error('Выберите действующий предикат для нового факта.')
    return
  }
  if (effect.type === 'set_lifecycle_status') {
    if (!['draft', 'active'].includes(String(effect.value))) throw new Error('Правило не может архивировать сущность. Используйте безопасное удаление вручную.')
    return
  }
  if (effect.type === 'set_custom_field') {
    const definition = getCustomFieldDefinition(campaign, effect.customFieldId)
    if (!customFieldValueMatchesType(effect.value, definition)) throw new Error('Значение последствия не соответствует типу пользовательского поля.')
    if (definition.type === 'entity_reference' && effect.value) getEntity(campaign, String(effect.value))
    return
  }
  const state = entity.state.find((item) => item.id === effect.stateId)
  if (!state) throw new Error('Параметр состояния последствия не найден.')
  if (!valueMatchesType(effect.value, state.valueType)) throw new Error('Значение последствия не соответствует типу параметра состояния.')
}
function collectConditions(group: LogicConditionGroup | LogicConditionGroupInput): Array<LogicCondition | LogicConditionInput> {
  return group.children.flatMap((node) => node.kind === 'group' ? collectConditions(node) : [node])
}
function validateRuleInput(campaign: Campaign, input: SetLogicRuleInput | LogicRule): void {
  if (!input.name.trim()) throw new Error('Название правила обязательно.')
  if (!LOGIC_EXECUTION_MODES.includes(input.executionMode)) throw new Error('Режим исполнения не поддерживается.')
  const trigger = input.trigger ?? { type: 'manual', delayMinutes: 0, repeat: 'rearm' }
  if (!['manual', 'on_change', 'world_time'].includes(trigger.type)) throw new Error('Тип триггера не поддерживается.')
  if (!Number.isInteger(trigger.delayMinutes) || trigger.delayMinutes < 0) throw new Error('Задержка правила должна быть целым числом минут не меньше нуля.')
  if (!['once', 'rearm'].includes(trigger.repeat)) throw new Error('Режим повторения триггера не поддерживается.')
  if (input.executionMode === 'automatic' && trigger.type === 'manual') throw new Error('Автоматическое исполнение требует триггер изменения или мирового времени.')
  validateGroup(campaign, input.conditionGroup)
  if (!input.effects.length) throw new Error('Добавьте хотя бы одно последствие.')
  input.effects.forEach((effect) => validateEffect(campaign, effect))
  const targets = input.effects.map((effect) => {
    if (effect.type !== 'create_fact') return `${effect.entityId}:${effect.type}:${effect.type === 'set_state' ? effect.stateId : effect.type === 'set_custom_field' ? effect.customFieldId : 'status'}`
    const predicate = campaign.predicates.find((item) => item.id === effect.predicateId)!
    const directed = effect.directed ?? predicate.directed
    const endpoints = directed ? `${effect.entityId}:${effect.targetEntityId}` : [effect.entityId, effect.targetEntityId].sort().join(':')
    return `${effect.type}:${effect.predicateId}:${directed}:${endpoints}`
  })
  if (new Set(targets).size !== targets.length) throw new Error('Одно правило не может дважды изменять одно и то же поле сущности.')
}
function normalizeGroup(input: LogicConditionGroupInput, options: LogicMutationOptions, counters = { condition: 0, group: 0 }): LogicConditionGroup {
  const id = input.id ?? options.groupIds?.[counters.group++] ?? crypto.randomUUID()
  return { kind: 'group', id, operator: input.operator, minimum: input.operator === 'count' ? input.minimum : undefined,
    children: input.children.map((node): LogicConditionNode => node.kind === 'group' ? normalizeGroup(node, options, counters) : ({
      ...node, kind: 'condition', id: node.id ?? options.conditionIds?.[counters.condition++] ?? crypto.randomUUID(),
      entityId: node.field === 'world_time' ? undefined : node.entityId,
      stateId: node.field === 'state' ? node.stateId : undefined,
      customFieldId: node.field === 'custom_field' ? node.customFieldId : undefined,
      targetEntityId: node.field === 'relationship' ? node.targetEntityId : undefined,
      relationshipType: node.field === 'relationship' ? node.relationshipType : undefined,
      predicateId: node.field === 'relationship' ? node.predicateId : undefined,
      subjectType: node.field === 'knowledge' ? node.subjectType : undefined,
      subjectEntityId: node.field === 'knowledge' && node.subjectType === 'entity' ? node.subjectEntityId : undefined,
    })) }
}
function nodeIds(group: LogicConditionGroup): string[] { return [group.id, ...group.children.flatMap((node) => node.kind === 'group' ? nodeIds(node) : [node.id])] }
function snapshot(rule: LogicRule): Record<string, unknown> { return { name: rule.name, description: rule.description, enabled: rule.enabled, conditionGroup: rule.conditionGroup, effects: rule.effects, executionMode: rule.executionMode, trigger: rule.trigger } }
function relatedEntityIds(rule: LogicRule): string[] {
  const ids = collectConditions(rule.conditionGroup).flatMap((condition) => [condition.entityId, condition.targetEntityId, condition.subjectEntityId].filter((id): id is string => Boolean(id)))
  return [...new Set([...ids, ...rule.effects.flatMap((effect) => effect.type === 'create_fact' ? [effect.entityId, effect.targetEntityId] : [effect.entityId])])]
}

export function setLogicRuleInCampaign(campaign: Campaign, input: SetLogicRuleInput, options: LogicMutationOptions = {}): { campaign: Campaign; rule: LogicRule; event?: CampaignEvent; changed: boolean } {
  validateRuleInput(campaign, input)
  const existing = input.ruleId ? campaign.logicRules.find((rule) => rule.id === input.ruleId) : undefined
  if (input.ruleId && !existing) throw new Error('Правило не найдено.')
  const timestamp = (options.now ?? new Date()).toISOString(); const conditionGroup = normalizeGroup(input.conditionGroup, options)
  const ids = nodeIds(conditionGroup); if (new Set(ids).size !== ids.length) throw new Error('Идентификаторы условий и групп должны быть уникальны внутри правила.')
  const rule: LogicRule = { id: existing?.id ?? options.ruleId ?? crypto.randomUUID(), campaignId: campaign.id, name: input.name.trim(), description: input.description?.trim() ?? '', enabled: input.enabled, conditionGroup,
    effects: input.effects.map((effect, index) => {
      const id = effect.id ?? options.effectIds?.[index] ?? crypto.randomUUID()
      if (effect.type !== 'create_fact') return { ...effect, id }
      const predicate = campaign.predicates.find((item) => item.id === effect.predicateId)!
      return { ...effect, id, directed: effect.directed ?? predicate.directed, description: effect.description?.trim() ?? '' }
    }), executionMode: input.executionMode, trigger: input.trigger ?? { type: 'manual', delayMinutes: 0, repeat: 'rearm' }, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
  if (new Set(rule.effects.map((item) => item.id)).size !== rule.effects.length) throw new Error('Идентификаторы последствий должны быть уникальны внутри правила.')
  if (existing && JSON.stringify(snapshot(existing)) === JSON.stringify(snapshot(rule))) return { campaign, rule: existing, changed: false }
  const event: CampaignEvent = { id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: existing ? 'logic.rule.updated' : 'logic.rule.created', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId, relatedEntityIds: relatedEntityIds(rule), reversible: true, payload: { ruleId: rule.id, ruleName: rule.name, before: existing ? snapshot(existing) : null, after: snapshot(rule) } }
  return { rule, event, changed: true, campaign: { ...campaign, logicRules: existing ? campaign.logicRules.map((item) => item.id === existing.id ? rule : item) : [...campaign.logicRules, rule], logicTriggerStates: existing ? campaign.logicTriggerStates.filter((item) => item.ruleId !== rule.id) : campaign.logicTriggerStates, logicActivations: existing ? campaign.logicActivations.map((item) => item.ruleId === rule.id && item.status === 'pending' ? { ...item, status: 'invalidated' as const, resolvedAt: timestamp } : item) : campaign.logicActivations, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
export function removeLogicRuleFromCampaign(campaign: Campaign, ruleId: string, options: Pick<LogicMutationOptions, 'now' | 'eventId'> = {}) {
  const rule = campaign.logicRules.find((item) => item.id === ruleId); if (!rule) throw new Error('Правило не найдено.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const event: CampaignEvent = { id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'logic.rule.removed', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user', sessionId: campaign.activeSessionId, relatedEntityIds: relatedEntityIds(rule), reversible: true, payload: { ruleId, ruleName: rule.name, before: snapshot(rule) } }
  return { rule, event, campaign: { ...campaign, logicRules: campaign.logicRules.filter((item) => item.id !== ruleId), logicTriggerStates: campaign.logicTriggerStates.filter((item) => item.ruleId !== ruleId), logicActivations: campaign.logicActivations.map((item) => item.ruleId === ruleId && item.status === 'pending' ? { ...item, status: 'dismissed' as const, resolvedAt: timestamp } : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
function compare(actual: unknown, operator: LogicConditionOperator, expected: unknown): boolean {
  if (operator === 'exists') return actual !== undefined; if (operator === 'not_exists') return actual === undefined
  if (operator === 'equals') return actual === expected; if (operator === 'not_equals') return actual !== expected
  if (operator === 'greater') return typeof actual === 'number' && typeof expected === 'number' && actual > expected
  if (operator === 'greater_or_equal') return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
  if (operator === 'less') return typeof actual === 'number' && typeof expected === 'number' && actual < expected
  if (operator === 'less_or_equal') return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
  if (operator === 'contains') return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)
  return typeof actual === 'string' && typeof expected === 'string' && !actual.includes(expected)
}
function displayValue(value: unknown): string { if (value === undefined) return 'не существует'; if (typeof value === 'boolean') return value ? 'Да' : 'Нет'; return String(value) }
function evaluateCondition(campaign: Campaign, condition: LogicCondition): LogicConditionEvaluation {
  if (condition.field === 'world_time') {
    const passed = compare(Date.parse(campaign.worldTime), condition.operator, Date.parse(String(condition.value)))
    return { conditionId: condition.id, passed, actual: campaign.worldTime, explanation: `Мировое время: ${new Date(campaign.worldTime).toLocaleString('ru-RU')} — условие ${passed ? 'выполнено' : 'не выполнено'}.` }
  }
  const entity = campaign.entities.find((item) => item.id === condition.entityId && item.status !== 'archived')
  if (condition.field === 'custom_field') {
    const definition = campaign.customFieldDefinitions.find((item) => item.id === condition.customFieldId)
    const actual = condition.customFieldId ? entity?.customFields[condition.customFieldId] : undefined
    const passed = Boolean(entity && definition) && compare(actual, condition.operator, condition.value)
    return {
      conditionId: condition.id,
      passed,
      entityId: condition.entityId,
      actual,
      explanation: `${entity?.name ?? 'Удалённая сущность'} · ${definition?.name ?? 'удалённое пользовательское поле'}: сейчас «${displayValue(actual)}» — условие ${passed ? 'выполнено' : 'не выполнено'}.`,
    }
  }
  if (condition.field === 'relationship') {
    const relationship = campaign.relationships.find((item) => item.status !== 'archived' && item.sourceId === condition.entityId && item.targetId === condition.targetEntityId &&
      (condition.predicateId ? item.predicateId === condition.predicateId : item.type === condition.relationshipType))
    const actual = relationship ? true : undefined; const passed = compare(actual, condition.operator, undefined); const target = campaign.entities.find((item) => item.id === condition.targetEntityId)
    const predicate = campaign.predicates.find((item) => item.id === condition.predicateId)
    return { conditionId: condition.id, passed, entityId: condition.entityId, actual, explanation: `${entity?.name ?? 'Удалённая сущность'} — ${predicate?.directLabel ?? condition.relationshipType ?? 'связана с'} → ${target?.name ?? 'Удалённая сущность'}: факт ${relationship ? 'существует' : 'не существует'} — условие ${passed ? 'выполнено' : 'не выполнено'}.` }
  }
  if (condition.field === 'knowledge') {
    const records = campaign.knowledge.filter((record) => record.relatedEntityIds.includes(condition.entityId!) && record.subjectType === condition.subjectType && (condition.subjectType === 'party' || record.subjectEntityId === condition.subjectEntityId))
    const expected = String(condition.value ?? ''); const actual = records[0]?.status
    const passed = condition.operator === 'exists' ? records.length > 0 : condition.operator === 'not_exists' ? records.length === 0 : condition.operator === 'equals' ? records.some((record) => record.status === expected) : records.length > 0 && records.every((record) => record.status !== expected)
    return { conditionId: condition.id, passed, entityId: condition.entityId, actual, explanation: `${condition.subjectType === 'party' ? 'Партия' : 'Сущность'} · знание о «${entity?.name ?? 'Удалённая сущность'}»: ${records.length ? records.map((record) => record.status).join(', ') : 'нет записей'} — условие ${passed ? 'выполнено' : 'не выполнено'}.` }
  }
  const state = condition.field === 'state' ? entity?.state.find((item) => item.id === condition.stateId) : undefined
  const actual = condition.field === 'lifecycle_status' ? entity?.status : state?.value; const passed = Boolean(entity) && compare(actual, condition.operator, condition.value)
  const target = condition.field === 'lifecycle_status' ? 'статус' : state?.name ?? 'удалённый параметр'
  return { conditionId: condition.id, passed, entityId: condition.entityId, actual, explanation: `${entity?.name ?? 'Удалённая сущность'} · ${target}: сейчас «${displayValue(actual)}» — условие ${passed ? 'выполнено' : 'не выполнено'}.` }
}
export function evaluateLogicRule(campaign: Campaign, rule: LogicRule): LogicRuleEvaluation {
  const conditionResults: LogicConditionEvaluation[] = []; const groupResults: LogicGroupEvaluation[] = []
  function evaluateGroup(group: LogicConditionGroup): boolean {
    const results = group.children.map((node) => { if (node.kind === 'group') return evaluateGroup(node); const result = evaluateCondition(campaign, node); conditionResults.push(result); return result.passed })
    const matched = results.filter(Boolean).length
    const passed = group.operator === 'all' ? matched === results.length : group.operator === 'any' ? matched > 0 : group.operator === 'none' ? matched === 0 : matched >= (group.minimum ?? 1)
    const requirement = group.operator === 'count' ? `COUNT ≥ ${group.minimum}` : group.operator.toUpperCase()
    groupResults.push({ groupId: group.id, passed, matched, total: results.length, explanation: `Группа ${requirement}: выполнено ${matched} из ${results.length} — ${passed ? 'да' : 'нет'}.` }); return passed
  }
  const satisfied = evaluateGroup(rule.conditionGroup)
  return { satisfied, conditionResults, groupResults, explanation: satisfied ? 'Корневая группа условий выполнена.' : 'Корневая группа условий не выполнена.' }
}
export function previewLogicRule(campaign: Campaign, rule: LogicRule): LogicRulePreview {
  const evaluation = evaluateLogicRule(campaign, rule)
  const effects = rule.effects.map((effect): LogicEffectPreview => {
    const entity = campaign.entities.find((item) => item.id === effect.entityId && item.status !== 'archived')
    if (effect.type === 'create_fact') {
      const target = campaign.entities.find((item) => item.id === effect.targetEntityId && item.status !== 'archived')
      const predicate = campaign.predicates.find((item) => item.id === effect.predicateId && item.status !== 'archived')
      const existing = campaign.relationships.find((item) => item.status !== 'archived' && isSameRelationship(item, {
        sourceId: effect.entityId, targetId: effect.targetEntityId, predicateId: effect.predicateId, directed: effect.directed,
      }))
      return {
        effectId: effect.id, entityId: effect.entityId, targetEntityId: effect.targetEntityId, type: effect.type, changed: Boolean(entity && target && predicate && !existing),
        explanation: existing
          ? `Факт «${entity?.name ?? 'Удалённая сущность'} — ${predicate?.directLabel ?? 'неизвестный предикат'} → ${target?.name ?? 'Удалённая сущность'}» уже существует.`
          : `Создать факт: ${entity?.name ?? 'Удалённая сущность'} — ${predicate?.directLabel ?? 'неизвестный предикат'} → ${target?.name ?? 'Удалённая сущность'}.`,
      }
    }
    if (effect.type === 'set_custom_field') {
      const definition = campaign.customFieldDefinitions.find((item) => item.id === effect.customFieldId)
      const before = entity?.customFields[effect.customFieldId]
      return {
        effectId: effect.id,
        entityId: effect.entityId,
        type: effect.type,
        changed: Boolean(entity && definition) && before !== effect.value,
        explanation: `${entity?.name ?? 'Удалённая сущность'} · ${definition?.name ?? 'удалённое пользовательское поле'}: «${displayValue(before)}» → «${displayValue(effect.value)}».`,
      }
    }
    const state = effect.type === 'set_state' ? entity?.state.find((item) => item.id === effect.stateId) : undefined
    const before = effect.type === 'set_state' ? state?.value : entity?.status
    const target = effect.type === 'set_state' ? state?.name ?? 'удалённый параметр' : 'статус'
    return { effectId: effect.id, entityId: effect.entityId, type: effect.type, changed: Boolean(entity) && before !== effect.value, explanation: `${entity?.name ?? 'Удалённая сущность'} · ${target}: «${displayValue(before)}» → «${displayValue(effect.value)}».` }
  })
  return { evaluation, effects, canApply: rule.enabled && evaluation.satisfied && rule.executionMode !== 'suggest_only' }
}
export function applyLogicRuleInCampaign(campaign: Campaign, ruleId: string, options: Pick<LogicMutationOptions, 'now' | 'eventId' | 'relationshipIds' | 'source' | 'activationId'> = {}) {
  const rule = campaign.logicRules.find((item) => item.id === ruleId); if (!rule) throw new Error('Правило не найдено.')
  validateRuleInput(campaign, rule); const preview = previewLogicRule(campaign, rule)
  if (!rule.enabled) throw new Error('Отключённое правило нельзя применить.'); if (!preview.evaluation.satisfied) throw new Error('Условия правила не выполнены.'); if (rule.executionMode === 'suggest_only') throw new Error('Это правило работает только как предложение мастеру.')
  if (!preview.effects.some((effect) => effect.changed)) return { campaign, changed: false, preview }
  const timestamp = (options.now ?? new Date()).toISOString(); const changes: Record<string, unknown>[] = []
  const entities = campaign.entities.map((entity) => { const effects = rule.effects.filter((effect) => effect.entityId === entity.id); if (!effects.length) return entity; let updated = entity
    for (const effect of effects) {
      if (effect.type === 'create_fact') continue
      if (effect.type === 'set_lifecycle_status') {
        const before = updated.status
        if (before !== effect.value) { changes.push({ effectId: effect.id, entityId: entity.id, field: 'lifecycle_status', before, after: effect.value }); updated = { ...updated, status: effect.value as LifecycleStatus, updatedAt: timestamp } }
        continue
      }
      if (effect.type === 'set_custom_field') {
        const definition = getCustomFieldDefinition(campaign, effect.customFieldId)
        if (!customFieldValueMatchesType(effect.value, definition)) throw new Error('Тип значения последствия больше не соответствует пользовательскому полю.')
        const before = updated.customFields[effect.customFieldId]
        if (before !== effect.value) {
          changes.push({ effectId: effect.id, entityId: entity.id, field: 'custom_field', customFieldId: effect.customFieldId, customFieldName: definition.name, before, beforeExists: Object.prototype.hasOwnProperty.call(updated.customFields, effect.customFieldId), after: effect.value })
          updated = { ...updated, customFields: { ...updated.customFields, [effect.customFieldId]: effect.value }, updatedAt: timestamp }
        }
        continue
      }
      const state = updated.state.find((item) => item.id === effect.stateId)
      if (!state) throw new Error('Параметр состояния последствия больше не существует.')
      if (!valueMatchesType(effect.value, state.valueType)) throw new Error('Тип значения последствия больше не соответствует состоянию.')
      if (state.value !== effect.value) { changes.push({ effectId: effect.id, entityId: entity.id, field: 'state', stateId: state.id, stateName: state.name, before: state.value, after: effect.value }); updated = { ...updated, state: updated.state.map((item) => item.id === state.id ? { ...item, value: effect.value as StateValue, updatedAt: timestamp } : item), updatedAt: timestamp } }
    }
    return updated })
  let relationships = campaign.relationships
  let relationshipIndex = 0
  for (const effect of rule.effects) {
    if (effect.type !== 'create_fact') continue
    if (relationships.some((item) => item.status !== 'archived' && isSameRelationship(item, { sourceId: effect.entityId, targetId: effect.targetEntityId, predicateId: effect.predicateId, directed: effect.directed }))) continue
    const added = addRelationshipToCampaign({ ...campaign, entities, relationships, eventLog: [] }, {
      sourceId: effect.entityId, targetId: effect.targetEntityId, predicateId: effect.predicateId,
      directed: effect.directed, description: effect.description,
    }, { now: new Date(timestamp), relationshipId: options.relationshipIds?.[relationshipIndex++] })
    relationships = added.campaign.relationships
    changes.push({ effectId: effect.id, entityId: effect.entityId, targetEntityId: effect.targetEntityId, field: 'relationship_created', relationship: added.relationship })
  }
  const event: CampaignEvent = { id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'logic.rule.applied', occurredAt: timestamp, worldTime: campaign.worldTime, source: options.source ?? 'user', sessionId: campaign.activeSessionId, relatedEntityIds: relatedEntityIds(rule), reversible: true, payload: { ruleId: rule.id, ruleName: rule.name, activationId: options.activationId, changes } }
  return { preview, event, changed: true, campaign: { ...campaign, entities, relationships, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
