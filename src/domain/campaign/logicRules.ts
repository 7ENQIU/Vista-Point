import {
  LOGIC_CONDITION_FIELDS,
  LOGIC_CONDITION_OPERATORS,
  LOGIC_EFFECT_TYPES,
  LOGIC_EXECUTION_MODES,
  LOGIC_GROUP_OPERATORS,
  type Campaign,
  type CampaignEntity,
  type CampaignEvent,
  type LifecycleStatus,
  type LogicCondition,
  type LogicConditionField,
  type LogicConditionOperator,
  type LogicEffect,
  type LogicEffectType,
  type LogicExecutionMode,
  type LogicGroupOperator,
  type LogicRule,
  type StateValue,
} from './types'

export interface LogicConditionInput {
  id?: string
  entityId: string
  field: LogicConditionField
  stateId?: string
  operator: LogicConditionOperator
  value?: StateValue | LifecycleStatus
}

export interface LogicEffectInput {
  id?: string
  entityId: string
  type: LogicEffectType
  stateId?: string
  value: StateValue | LifecycleStatus
}

export interface SetLogicRuleInput {
  ruleId?: string
  name: string
  description?: string
  enabled: boolean
  groupOperator: LogicGroupOperator
  conditions: LogicConditionInput[]
  effects: LogicEffectInput[]
  executionMode: LogicExecutionMode
}

export interface LogicConditionEvaluation {
  conditionId: string
  passed: boolean
  entityId: string
  actual?: StateValue | LifecycleStatus
  explanation: string
}

export interface LogicRuleEvaluation {
  satisfied: boolean
  conditionResults: LogicConditionEvaluation[]
  explanation: string
}

export interface LogicEffectPreview {
  effectId: string
  entityId: string
  changed: boolean
  explanation: string
}

export interface LogicRulePreview {
  evaluation: LogicRuleEvaluation
  effects: LogicEffectPreview[]
  canApply: boolean
}

export interface LogicMutationOptions {
  now?: Date
  ruleId?: string
  eventId?: string
  conditionIds?: string[]
  effectIds?: string[]
}

function getEntity(campaign: Campaign, entityId: string): CampaignEntity {
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
  const entity = getEntity(campaign, condition.entityId)
  if (!LOGIC_CONDITION_FIELDS.includes(condition.field)) throw new Error('Поле условия не поддерживается.')
  if (!LOGIC_CONDITION_OPERATORS.includes(condition.operator)) throw new Error('Оператор условия не поддерживается.')
  if (condition.field === 'lifecycle_status') {
    if (condition.stateId) throw new Error('Для статуса сущности нельзя выбирать параметр состояния.')
    if (!['equals', 'not_equals'].includes(condition.operator)) {
      throw new Error('Статус сущности поддерживает только равенство и неравенство.')
    }
    if (!['draft', 'active'].includes(String(condition.value))) throw new Error('Недопустимый статус в условии.')
    return
  }

  if (!condition.stateId) throw new Error('Выберите параметр состояния для условия.')
  const state = entity.state.find((item) => item.id === condition.stateId)
  const existenceOperator = condition.operator === 'exists' || condition.operator === 'not_exists'
  if (!state && !existenceOperator) throw new Error('Параметр состояния условия не найден.')
  if (existenceOperator) return
  if (!state || !valueMatchesType(condition.value, state.valueType)) {
    throw new Error('Значение условия не соответствует типу параметра состояния.')
  }
  if (['greater', 'greater_or_equal', 'less', 'less_or_equal'].includes(condition.operator) &&
    typeof state.value !== 'number') throw new Error('Числовое сравнение доступно только для числового состояния.')
  if (['contains', 'not_contains'].includes(condition.operator) && state.valueType !== 'text') {
    throw new Error('Проверка содержания доступна только для текстового состояния.')
  }
}

function validateEffect(campaign: Campaign, effect: LogicEffectInput): void {
  const entity = getEntity(campaign, effect.entityId)
  if (!LOGIC_EFFECT_TYPES.includes(effect.type)) throw new Error('Тип последствия не поддерживается.')
  if (effect.type === 'set_lifecycle_status') {
    if (!['draft', 'active'].includes(String(effect.value))) {
      throw new Error('Правило не может архивировать сущность. Используйте безопасное удаление вручную.')
    }
    return
  }
  if (!effect.stateId) throw new Error('Выберите параметр состояния для последствия.')
  const state = entity.state.find((item) => item.id === effect.stateId)
  if (!state) throw new Error('Параметр состояния последствия не найден.')
  if (!valueMatchesType(effect.value, state.valueType)) {
    throw new Error('Значение последствия не соответствует типу параметра состояния.')
  }
}

function validateRuleInput(campaign: Campaign, input: SetLogicRuleInput): void {
  if (!input.name.trim()) throw new Error('Название правила обязательно.')
  if (!LOGIC_GROUP_OPERATORS.includes(input.groupOperator)) throw new Error('Логика группы не поддерживается.')
  if (!LOGIC_EXECUTION_MODES.includes(input.executionMode)) throw new Error('Режим исполнения не поддерживается.')
  if (input.conditions.length === 0) throw new Error('Добавьте хотя бы одно условие.')
  if (input.effects.length === 0) throw new Error('Добавьте хотя бы одно последствие.')
  input.conditions.forEach((condition) => validateCondition(campaign, condition))
  input.effects.forEach((effect) => validateEffect(campaign, effect))
  const effectTargets = input.effects.map((effect) =>
    `${effect.entityId}:${effect.type}:${effect.type === 'set_state' ? effect.stateId : 'status'}`)
  if (new Set(effectTargets).size !== effectTargets.length) {
    throw new Error('Одно правило не может дважды изменять одно и то же поле сущности.')
  }
}

function snapshot(rule: LogicRule): Record<string, unknown> {
  return {
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    groupOperator: rule.groupOperator,
    conditions: rule.conditions,
    effects: rule.effects,
    executionMode: rule.executionMode,
  }
}

function relatedEntityIds(rule: LogicRule): string[] {
  return [...new Set([
    ...rule.conditions.map((condition) => condition.entityId),
    ...rule.effects.map((effect) => effect.entityId),
  ])]
}

export function setLogicRuleInCampaign(
  campaign: Campaign,
  input: SetLogicRuleInput,
  options: LogicMutationOptions = {},
): { campaign: Campaign; rule: LogicRule; event?: CampaignEvent; changed: boolean } {
  validateRuleInput(campaign, input)
  const existing = input.ruleId ? campaign.logicRules.find((rule) => rule.id === input.ruleId) : undefined
  if (input.ruleId && !existing) throw new Error('Правило не найдено.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const rule: LogicRule = {
    id: existing?.id ?? options.ruleId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    enabled: input.enabled,
    groupOperator: input.groupOperator,
    conditions: input.conditions.map((condition, index) => ({
      ...condition,
      id: condition.id ?? options.conditionIds?.[index] ?? crypto.randomUUID(),
      stateId: condition.field === 'state' ? condition.stateId : undefined,
    })),
    effects: input.effects.map((effect, index) => ({
      ...effect,
      id: effect.id ?? options.effectIds?.[index] ?? crypto.randomUUID(),
      stateId: effect.type === 'set_state' ? effect.stateId : undefined,
    })),
    executionMode: input.executionMode,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
  if (new Set(rule.conditions.map((item) => item.id)).size !== rule.conditions.length ||
    new Set(rule.effects.map((item) => item.id)).size !== rule.effects.length) {
    throw new Error('Идентификаторы условий и последствий должны быть уникальны внутри правила.')
  }
  if (existing && JSON.stringify(snapshot(existing)) === JSON.stringify(snapshot(rule))) {
    return { campaign, rule: existing, changed: false }
  }
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id,
    type: existing ? 'logic.rule.updated' : 'logic.rule.created',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: relatedEntityIds(rule), reversible: true,
    payload: { ruleId: rule.id, ruleName: rule.name, before: existing ? snapshot(existing) : null, after: snapshot(rule) },
  }
  return {
    rule, event, changed: true,
    campaign: {
      ...campaign,
      logicRules: existing
        ? campaign.logicRules.map((item) => item.id === existing.id ? rule : item)
        : [...campaign.logicRules, rule],
      eventLog: [...campaign.eventLog, event], updatedAt: timestamp,
    },
  }
}

export function removeLogicRuleFromCampaign(
  campaign: Campaign,
  ruleId: string,
  options: Pick<LogicMutationOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; rule: LogicRule; event: CampaignEvent } {
  const rule = campaign.logicRules.find((item) => item.id === ruleId)
  if (!rule) throw new Error('Правило не найдено.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'logic.rule.removed',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: relatedEntityIds(rule), reversible: true,
    payload: { ruleId, ruleName: rule.name, before: snapshot(rule) },
  }
  return {
    rule, event,
    campaign: { ...campaign, logicRules: campaign.logicRules.filter((item) => item.id !== ruleId), eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}

function compare(actual: unknown, operator: LogicConditionOperator, expected: unknown): boolean {
  if (operator === 'exists') return actual !== undefined
  if (operator === 'not_exists') return actual === undefined
  if (operator === 'equals') return actual === expected
  if (operator === 'not_equals') return actual !== expected
  if (operator === 'greater') return typeof actual === 'number' && typeof expected === 'number' && actual > expected
  if (operator === 'greater_or_equal') return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
  if (operator === 'less') return typeof actual === 'number' && typeof expected === 'number' && actual < expected
  if (operator === 'less_or_equal') return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
  if (operator === 'contains') return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)
  return typeof actual === 'string' && typeof expected === 'string' && !actual.includes(expected)
}

function displayValue(value: unknown): string {
  if (value === undefined) return 'не существует'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  return String(value)
}

export function evaluateLogicRule(campaign: Campaign, rule: LogicRule): LogicRuleEvaluation {
  const conditionResults = rule.conditions.map((condition): LogicConditionEvaluation => {
    const entity = campaign.entities.find((item) => item.id === condition.entityId && item.status !== 'archived')
    const state = condition.field === 'state'
      ? entity?.state.find((item) => item.id === condition.stateId)
      : undefined
    const actual = condition.field === 'lifecycle_status' ? entity?.status : state?.value
    const passed = Boolean(entity) && compare(actual, condition.operator, condition.value)
    const target = condition.field === 'lifecycle_status' ? 'статус' : state?.name ?? 'удалённый параметр'
    return {
      conditionId: condition.id, passed, entityId: condition.entityId, actual,
      explanation: `${entity?.name ?? 'Удалённая сущность'} · ${target}: сейчас «${displayValue(actual)}» — условие ${passed ? 'выполнено' : 'не выполнено'}.`,
    }
  })
  const satisfied = rule.groupOperator === 'all'
    ? conditionResults.every((item) => item.passed)
    : rule.groupOperator === 'any'
      ? conditionResults.some((item) => item.passed)
      : conditionResults.every((item) => !item.passed)
  return {
    satisfied,
    conditionResults,
    explanation: satisfied ? 'Группа условий выполнена.' : 'Группа условий не выполнена.',
  }
}

export function previewLogicRule(campaign: Campaign, rule: LogicRule): LogicRulePreview {
  const evaluation = evaluateLogicRule(campaign, rule)
  const effects = rule.effects.map((effect): LogicEffectPreview => {
    const entity = campaign.entities.find((item) => item.id === effect.entityId && item.status !== 'archived')
    const state = effect.type === 'set_state' ? entity?.state.find((item) => item.id === effect.stateId) : undefined
    const before = effect.type === 'set_state' ? state?.value : entity?.status
    const target = effect.type === 'set_state' ? state?.name ?? 'удалённый параметр' : 'статус'
    return {
      effectId: effect.id, entityId: effect.entityId,
      changed: Boolean(entity) && before !== effect.value,
      explanation: `${entity?.name ?? 'Удалённая сущность'} · ${target}: «${displayValue(before)}» → «${displayValue(effect.value)}».`,
    }
  })
  return { evaluation, effects, canApply: rule.enabled && evaluation.satisfied && rule.executionMode === 'require_confirmation' }
}

export function applyLogicRuleInCampaign(
  campaign: Campaign,
  ruleId: string,
  options: Pick<LogicMutationOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; event?: CampaignEvent; changed: boolean; preview: LogicRulePreview } {
  const rule = campaign.logicRules.find((item) => item.id === ruleId)
  if (!rule) throw new Error('Правило не найдено.')
  validateRuleInput(campaign, rule)
  const preview = previewLogicRule(campaign, rule)
  if (!rule.enabled) throw new Error('Отключённое правило нельзя применить.')
  if (!preview.evaluation.satisfied) throw new Error('Условия правила не выполнены.')
  if (rule.executionMode === 'suggest_only') throw new Error('Это правило работает только как предложение мастеру.')
  if (!preview.effects.some((effect) => effect.changed)) return { campaign, changed: false, preview }

  const timestamp = (options.now ?? new Date()).toISOString()
  const changes: Record<string, unknown>[] = []
  const entities = campaign.entities.map((entity) => {
    const effects = rule.effects.filter((effect) => effect.entityId === entity.id)
    if (effects.length === 0) return entity
    let updated = entity
    for (const effect of effects) {
      if (effect.type === 'set_lifecycle_status') {
        const before = updated.status
        if (before !== effect.value) {
          changes.push({ effectId: effect.id, entityId: entity.id, field: 'lifecycle_status', before, after: effect.value })
          updated = { ...updated, status: effect.value as LifecycleStatus, updatedAt: timestamp }
        }
      } else {
        const state = updated.state.find((item) => item.id === effect.stateId)
        if (!state) throw new Error('Параметр состояния последствия больше не существует.')
        if (!valueMatchesType(effect.value, state.valueType)) throw new Error('Тип значения последствия больше не соответствует состоянию.')
        if (state.value !== effect.value) {
          changes.push({ effectId: effect.id, entityId: entity.id, field: 'state', stateId: state.id, stateName: state.name, before: state.value, after: effect.value })
          updated = { ...updated, state: updated.state.map((item) => item.id === state.id ? { ...item, value: effect.value as StateValue, updatedAt: timestamp } : item), updatedAt: timestamp }
        }
      }
    }
    return updated
  })
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, type: 'logic.rule.applied',
    occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: relatedEntityIds(rule), reversible: true,
    payload: { ruleId: rule.id, ruleName: rule.name, changes },
  }
  return { preview, event, changed: true, campaign: { ...campaign, entities, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
