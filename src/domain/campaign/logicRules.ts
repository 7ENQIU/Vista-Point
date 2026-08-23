import {
  KNOWLEDGE_STATUSES, KNOWLEDGE_SUBJECT_TYPES, LOGIC_CONDITION_FIELDS, LOGIC_CONDITION_OPERATORS,
  LOGIC_EFFECT_TYPES, LOGIC_EXECUTION_MODES, LOGIC_GROUP_OPERATORS, RELATIONSHIP_TYPES,
  type Campaign, type CampaignEntity, type CampaignEvent, type KnowledgeSubjectType, type LifecycleStatus,
  type LogicCondition, type LogicConditionField, type LogicConditionGroup, type LogicConditionNode,
  type LogicConditionOperator, type LogicEffectType,
  type LogicExecutionMode, type LogicGroupOperator, type LogicRule, type LogicTrigger, type RelationshipType, type StateValue,
} from './types'

export interface LogicConditionInput {
  kind: 'condition'; id?: string; entityId?: string; field: LogicConditionField; stateId?: string
  targetEntityId?: string; relationshipType?: RelationshipType; subjectType?: KnowledgeSubjectType
  subjectEntityId?: string; operator: LogicConditionOperator; value?: StateValue | LifecycleStatus
}
export interface LogicConditionGroupInput { kind: 'group'; id?: string; operator: LogicGroupOperator; minimum?: number; children: LogicConditionNodeInput[] }
export type LogicConditionNodeInput = LogicConditionInput | LogicConditionGroupInput
export interface LogicEffectInput { id?: string; entityId: string; type: LogicEffectType; stateId?: string; value: StateValue | LifecycleStatus }
export interface SetLogicRuleInput { ruleId?: string; name: string; description?: string; enabled: boolean; conditionGroup: LogicConditionGroupInput; effects: LogicEffectInput[]; executionMode: LogicExecutionMode; trigger?: LogicTrigger }
export interface LogicConditionEvaluation { conditionId: string; passed: boolean; entityId?: string; actual?: StateValue | LifecycleStatus; explanation: string }
export interface LogicGroupEvaluation { groupId: string; passed: boolean; matched: number; total: number; explanation: string }
export interface LogicRuleEvaluation { satisfied: boolean; conditionResults: LogicConditionEvaluation[]; groupResults: LogicGroupEvaluation[]; explanation: string }
export interface LogicEffectPreview { effectId: string; entityId: string; changed: boolean; explanation: string }
export interface LogicRulePreview { evaluation: LogicRuleEvaluation; effects: LogicEffectPreview[]; canApply: boolean }
export interface LogicMutationOptions { now?: Date; ruleId?: string; eventId?: string; conditionIds?: string[]; groupIds?: string[]; effectIds?: string[]; source?: 'user' | 'system'; activationId?: string }

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
function validateCondition(campaign: Campaign, condition: LogicConditionInput): void {
  if (!LOGIC_CONDITION_FIELDS.includes(condition.field)) throw new Error('Поле условия не поддерживается.')
  if (!LOGIC_CONDITION_OPERATORS.includes(condition.operator)) throw new Error('Оператор условия не поддерживается.')
  if (condition.field === 'world_time') {
    if (!['equals', 'not_equals', 'greater', 'greater_or_equal', 'less', 'less_or_equal'].includes(condition.operator)) throw new Error('Для мирового времени выбран недопустимый оператор.')
    if (typeof condition.value !== 'string' || Number.isNaN(Date.parse(condition.value))) throw new Error('Укажите корректное мировое время в условии.')
    return
  }
  const entity = getEntity(campaign, condition.entityId)
  if (condition.field === 'relationship') {
    getEntity(campaign, condition.targetEntityId)
    if (!condition.relationshipType || !RELATIONSHIP_TYPES.includes(condition.relationshipType)) throw new Error('Выберите тип связи для условия.')
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
  if (effect.type === 'set_lifecycle_status') {
    if (!['draft', 'active'].includes(String(effect.value))) throw new Error('Правило не может архивировать сущность. Используйте безопасное удаление вручную.')
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
  const targets = input.effects.map((effect) => `${effect.entityId}:${effect.type}:${effect.type === 'set_state' ? effect.stateId : 'status'}`)
  if (new Set(targets).size !== targets.length) throw new Error('Одно правило не может дважды изменять одно и то же поле сущности.')
}
function normalizeGroup(input: LogicConditionGroupInput, options: LogicMutationOptions, counters = { condition: 0, group: 0 }): LogicConditionGroup {
  const id = input.id ?? options.groupIds?.[counters.group++] ?? crypto.randomUUID()
  return { kind: 'group', id, operator: input.operator, minimum: input.operator === 'count' ? input.minimum : undefined,
    children: input.children.map((node): LogicConditionNode => node.kind === 'group' ? normalizeGroup(node, options, counters) : ({
      ...node, kind: 'condition', id: node.id ?? options.conditionIds?.[counters.condition++] ?? crypto.randomUUID(),
      entityId: node.field === 'world_time' ? undefined : node.entityId,
      stateId: node.field === 'state' ? node.stateId : undefined,
      targetEntityId: node.field === 'relationship' ? node.targetEntityId : undefined,
      relationshipType: node.field === 'relationship' ? node.relationshipType : undefined,
      subjectType: node.field === 'knowledge' ? node.subjectType : undefined,
      subjectEntityId: node.field === 'knowledge' && node.subjectType === 'entity' ? node.subjectEntityId : undefined,
    })) }
}
function nodeIds(group: LogicConditionGroup): string[] { return [group.id, ...group.children.flatMap((node) => node.kind === 'group' ? nodeIds(node) : [node.id])] }
function snapshot(rule: LogicRule): Record<string, unknown> { return { name: rule.name, description: rule.description, enabled: rule.enabled, conditionGroup: rule.conditionGroup, effects: rule.effects, executionMode: rule.executionMode, trigger: rule.trigger } }
function relatedEntityIds(rule: LogicRule): string[] {
  const ids = collectConditions(rule.conditionGroup).flatMap((condition) => [condition.entityId, condition.targetEntityId, condition.subjectEntityId].filter((id): id is string => Boolean(id)))
  return [...new Set([...ids, ...rule.effects.map((effect) => effect.entityId)])]
}

export function setLogicRuleInCampaign(campaign: Campaign, input: SetLogicRuleInput, options: LogicMutationOptions = {}): { campaign: Campaign; rule: LogicRule; event?: CampaignEvent; changed: boolean } {
  validateRuleInput(campaign, input)
  const existing = input.ruleId ? campaign.logicRules.find((rule) => rule.id === input.ruleId) : undefined
  if (input.ruleId && !existing) throw new Error('Правило не найдено.')
  const timestamp = (options.now ?? new Date()).toISOString(); const conditionGroup = normalizeGroup(input.conditionGroup, options)
  const ids = nodeIds(conditionGroup); if (new Set(ids).size !== ids.length) throw new Error('Идентификаторы условий и групп должны быть уникальны внутри правила.')
  const rule: LogicRule = { id: existing?.id ?? options.ruleId ?? crypto.randomUUID(), campaignId: campaign.id, name: input.name.trim(), description: input.description?.trim() ?? '', enabled: input.enabled, conditionGroup,
    effects: input.effects.map((effect, index) => ({ ...effect, id: effect.id ?? options.effectIds?.[index] ?? crypto.randomUUID(), stateId: effect.type === 'set_state' ? effect.stateId : undefined })), executionMode: input.executionMode, trigger: input.trigger ?? { type: 'manual', delayMinutes: 0, repeat: 'rearm' }, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
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
  if (condition.field === 'relationship') {
    const relationship = campaign.relationships.find((item) => item.status !== 'archived' && item.sourceId === condition.entityId && item.targetId === condition.targetEntityId && item.type === condition.relationshipType)
    const actual = relationship ? true : undefined; const passed = compare(actual, condition.operator, undefined); const target = campaign.entities.find((item) => item.id === condition.targetEntityId)
    return { conditionId: condition.id, passed, entityId: condition.entityId, actual, explanation: `${entity?.name ?? 'Удалённая сущность'} → ${target?.name ?? 'Удалённая сущность'}: связь ${relationship ? 'существует' : 'не существует'} — условие ${passed ? 'выполнено' : 'не выполнено'}.` }
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
  const effects = rule.effects.map((effect): LogicEffectPreview => { const entity = campaign.entities.find((item) => item.id === effect.entityId && item.status !== 'archived'); const state = effect.type === 'set_state' ? entity?.state.find((item) => item.id === effect.stateId) : undefined; const before = effect.type === 'set_state' ? state?.value : entity?.status; const target = effect.type === 'set_state' ? state?.name ?? 'удалённый параметр' : 'статус'; return { effectId: effect.id, entityId: effect.entityId, changed: Boolean(entity) && before !== effect.value, explanation: `${entity?.name ?? 'Удалённая сущность'} · ${target}: «${displayValue(before)}» → «${displayValue(effect.value)}».` } })
  return { evaluation, effects, canApply: rule.enabled && evaluation.satisfied && rule.executionMode !== 'suggest_only' }
}
export function applyLogicRuleInCampaign(campaign: Campaign, ruleId: string, options: Pick<LogicMutationOptions, 'now' | 'eventId' | 'source' | 'activationId'> = {}) {
  const rule = campaign.logicRules.find((item) => item.id === ruleId); if (!rule) throw new Error('Правило не найдено.')
  validateRuleInput(campaign, rule); const preview = previewLogicRule(campaign, rule)
  if (!rule.enabled) throw new Error('Отключённое правило нельзя применить.'); if (!preview.evaluation.satisfied) throw new Error('Условия правила не выполнены.'); if (rule.executionMode === 'suggest_only') throw new Error('Это правило работает только как предложение мастеру.')
  if (!preview.effects.some((effect) => effect.changed)) return { campaign, changed: false, preview }
  const timestamp = (options.now ?? new Date()).toISOString(); const changes: Record<string, unknown>[] = []
  const entities = campaign.entities.map((entity) => { const effects = rule.effects.filter((effect) => effect.entityId === entity.id); if (!effects.length) return entity; let updated = entity
    for (const effect of effects) { if (effect.type === 'set_lifecycle_status') { const before = updated.status; if (before !== effect.value) { changes.push({ effectId: effect.id, entityId: entity.id, field: 'lifecycle_status', before, after: effect.value }); updated = { ...updated, status: effect.value as LifecycleStatus, updatedAt: timestamp } } } else { const state = updated.state.find((item) => item.id === effect.stateId); if (!state) throw new Error('Параметр состояния последствия больше не существует.'); if (!valueMatchesType(effect.value, state.valueType)) throw new Error('Тип значения последствия больше не соответствует состоянию.'); if (state.value !== effect.value) { changes.push({ effectId: effect.id, entityId: entity.id, field: 'state', stateId: state.id, stateName: state.name, before: state.value, after: effect.value }); updated = { ...updated, state: updated.state.map((item) => item.id === state.id ? { ...item, value: effect.value as StateValue, updatedAt: timestamp } : item), updatedAt: timestamp } } } }
    return updated })
  const event: CampaignEvent = { id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'logic.rule.applied', occurredAt: timestamp, worldTime: campaign.worldTime, source: options.source ?? 'user', sessionId: campaign.activeSessionId, relatedEntityIds: relatedEntityIds(rule), reversible: true, payload: { ruleId: rule.id, ruleName: rule.name, activationId: options.activationId, changes } }
  return { preview, event, changed: true, campaign: { ...campaign, entities, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
