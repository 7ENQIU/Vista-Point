import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { addPredicateToCampaign } from '../../domain/campaign/addPredicate'
import { addRelationshipToCampaign } from '../../domain/campaign/addRelationship'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { setLogicRuleInCampaign } from '../../domain/campaign/logicRules'
import { setEntityStateInCampaign } from '../../domain/campaign/setEntityState'
import type { Campaign } from '../../domain/campaign/types'

export const LOGIC_TEST_CAMPAIGN_ID = 'dev:logic-test-stand'

/** Создаёт воспроизводимую dev-кампанию для ручных и автоматических проверок Logic Layer. */
export function createLogicTestCampaign(now = new Date()): Campaign {
  let campaign = createCampaign({
    name: 'Тестовый стенд логики',
    description: 'Изолированная dev-кампания с фактами, состояниями и правилами для безопасных локальных проверок.',
  }, now, LOGIC_TEST_CAMPAIGN_ID)

  const entities = [
    { id: 'dev:anna', type: 'npc' as const, name: 'Анна', summary: 'Разведчица в Башне.' },
    { id: 'dev:tower', type: 'location' as const, name: 'Башня', summary: 'Родительская локация.' },
    { id: 'dev:vault', type: 'location' as const, name: 'Хранилище', summary: 'Вложенная локация без числового уровня.' },
    { id: 'dev:order', type: 'note' as const, name: 'Орден Семи ключей', summary: 'Связанная сущность для пользовательского предиката.' },
    { id: 'dev:clue', type: 'clue' as const, name: 'Сломанная печать', summary: 'Улика для проверки нескольких результатов.' },
  ]
  for (const [index, entity] of entities.entries()) {
    campaign = addEntityToCampaign(campaign, entity, {
      now,
      entityId: entity.id,
      eventId: `dev:event:entity:${index + 1}`,
    }).campaign
  }
  campaign = {
    ...campaign,
    customFieldDefinitions: [
      { id: 'dev:field:reputation', name: 'Репутация', type: 'number' },
      { id: 'dev:field:base', name: 'Базовая локация', type: 'entity_reference' },
    ],
    entities: campaign.entities.map((entity) => entity.id === 'dev:anna'
      ? { ...entity, customFields: { 'dev:field:reputation': 2, 'dev:field:base': 'dev:tower' } }
      : entity),
  }
  campaign = setEntityStateInCampaign(campaign, 'dev:anna', {
    name: 'Доверие', category: 'social', valueType: 'integer', value: 2,
  }, { now, stateId: 'dev:state:trust', eventId: 'dev:event:trust' }).campaign
  campaign = setEntityStateInCampaign(campaign, 'dev:vault', {
    name: 'Запечатано', category: 'story', valueType: 'boolean', value: true,
  }, { now, stateId: 'dev:state:sealed', eventId: 'dev:event:sealed' }).campaign
  campaign = setEntityStateInCampaign(campaign, 'dev:clue', {
    name: 'Изучение', category: 'information', valueType: 'integer', value: 0,
  }, { now, stateId: 'dev:state:research', eventId: 'dev:event:research' }).campaign
  campaign = setEntityStateInCampaign(campaign, 'dev:order', {
    name: 'Влияние', category: 'social', valueType: 'integer', value: 0,
  }, { now, stateId: 'dev:state:influence', eventId: 'dev:event:influence' }).campaign

  campaign = addPredicateToCampaign(campaign, {
    directLabel: 'Доверяет', inverseLabel: 'Пользуется доверием',
    description: 'Тестовый пользовательский предикат.', directed: true,
  }, { now, predicateId: 'dev:predicate:trusts', eventId: 'dev:event:predicate' }).campaign

  const facts = [
    { id: 'dev:fact:anna-tower', sourceId: 'dev:anna', targetId: 'dev:tower', predicateId: 'builtin:located_in' },
    { id: 'dev:fact:vault-tower', sourceId: 'dev:vault', targetId: 'dev:tower', predicateId: 'builtin:located_in' },
    { id: 'dev:fact:clue-vault', sourceId: 'dev:clue', targetId: 'dev:vault', predicateId: 'builtin:located_in' },
    { id: 'dev:fact:anna-order', sourceId: 'dev:anna', targetId: 'dev:order', predicateId: 'dev:predicate:trusts' },
  ]
  for (const [index, fact] of facts.entries()) {
    campaign = addRelationshipToCampaign(campaign, fact, {
      now,
      relationshipId: fact.id,
      eventId: `dev:event:fact:${index + 1}`,
    }).campaign
  }

  campaign = setLogicRuleInCampaign(campaign, {
    name: '01 · Анна закрепилась в Башне',
    description: 'Выполненное правило по факту и доверию; готово к подтверждаемому применению.',
    enabled: true,
    executionMode: 'require_confirmation',
    conditionGroup: { kind: 'group', id: 'dev:group:arrival', operator: 'all', children: [
      { kind: 'condition', id: 'dev:condition:anna-in-tower', entityId: 'dev:anna', field: 'relationship', targetEntityId: 'dev:tower', predicateId: 'builtin:located_in', operator: 'exists' },
      { kind: 'condition', id: 'dev:condition:anna-trust', entityId: 'dev:anna', field: 'state', stateId: 'dev:state:trust', operator: 'greater_or_equal', value: 2 },
    ] },
    effects: [{ id: 'dev:effect:anna-trust-three', entityId: 'dev:anna', type: 'set_state', stateId: 'dev:state:trust', value: 3 }],
  }, { now, ruleId: 'dev:rule:pass', eventId: 'dev:event:rule:pass' }).campaign

  campaign = setLogicRuleInCampaign(campaign, {
    name: '02 · Недоступное открытие улики',
    description: 'Невыполненное правило: Хранилище пока запечатано.',
    enabled: true,
    executionMode: 'require_confirmation',
    conditionGroup: { kind: 'group', id: 'dev:group:failed', operator: 'all', children: [
      { kind: 'condition', id: 'dev:condition:vault-open', entityId: 'dev:vault', field: 'state', stateId: 'dev:state:sealed', operator: 'equals', value: false },
    ] },
    effects: [{ id: 'dev:effect:clue-research-failed', entityId: 'dev:clue', type: 'set_state', stateId: 'dev:state:research', value: 1 }],
  }, { now, ruleId: 'dev:rule:fail', eventId: 'dev:event:rule:fail' }).campaign

  campaign = setLogicRuleInCampaign(campaign, {
    name: '03 · Вложенный COUNT и два результата',
    description: 'Два из трёх блоков выполнены; применение меняет Хранилище и улику атомарно.',
    enabled: true,
    executionMode: 'require_confirmation',
    conditionGroup: { kind: 'group', id: 'dev:group:count', operator: 'count', minimum: 2, children: [
      { kind: 'condition', id: 'dev:condition:arrival-fact', entityId: 'dev:anna', field: 'relationship', targetEntityId: 'dev:tower', predicateId: 'builtin:located_in', operator: 'exists' },
      { kind: 'group', id: 'dev:group:none', operator: 'none', children: [
        { kind: 'condition', id: 'dev:condition:vault-opened', entityId: 'dev:vault', field: 'state', stateId: 'dev:state:sealed', operator: 'equals', value: false },
      ] },
      { kind: 'condition', id: 'dev:condition:clue-researched', entityId: 'dev:clue', field: 'state', stateId: 'dev:state:research', operator: 'greater', value: 0 },
    ] },
    effects: [
      { id: 'dev:effect:vault-open', entityId: 'dev:vault', type: 'set_state', stateId: 'dev:state:sealed', value: false },
      { id: 'dev:effect:clue-research', entityId: 'dev:clue', type: 'set_state', stateId: 'dev:state:research', value: 1 },
    ],
  }, { now, ruleId: 'dev:rule:nested', eventId: 'dev:event:rule:nested' }).campaign

  campaign = setLogicRuleInCampaign(campaign, {
    name: '04 · Предложение создать факт',
    description: 'Выполненное suggest_only-правило показывает подготовленный факт, но не разрешает применение.',
    enabled: true,
    executionMode: 'suggest_only',
    conditionGroup: { kind: 'group', id: 'dev:group:suggestion', operator: 'all', children: [
      { kind: 'condition', id: 'dev:condition:anna-trusts-order', entityId: 'dev:anna', field: 'relationship', targetEntityId: 'dev:order', predicateId: 'dev:predicate:trusts', operator: 'exists' },
    ] },
    effects: [{
      id: 'dev:effect:order-reveals-clue', entityId: 'dev:order', type: 'create_fact',
      targetEntityId: 'dev:clue', predicateId: 'builtin:reveals', directed: true,
      description: 'Орден указывает на сломанную печать.',
    }],
  }, { now, ruleId: 'dev:rule:suggest', eventId: 'dev:event:rule:suggest' }).campaign

  campaign = setLogicRuleInCampaign(campaign, {
    name: '05 · Изменение числового состояния',
    description: 'Эффект состояния для проверки предпросмотра и Undo/Redo.',
    enabled: true,
    executionMode: 'require_confirmation',
    conditionGroup: { kind: 'group', id: 'dev:group:state', operator: 'all', children: [
      { kind: 'condition', id: 'dev:condition:trust-ready', entityId: 'dev:anna', field: 'state', stateId: 'dev:state:trust', operator: 'greater_or_equal', value: 2 },
    ] },
    effects: [{ id: 'dev:effect:trust-five', entityId: 'dev:anna', type: 'set_state', stateId: 'dev:state:trust', value: 5 }],
  }, { now, ruleId: 'dev:rule:state', eventId: 'dev:event:rule:state' }).campaign

  campaign = setLogicRuleInCampaign(campaign, {
    name: '06 · Пользовательское поле',
    description: 'Проверяет типизированную репутацию и готовит её подтверждаемое изменение.',
    enabled: true,
    executionMode: 'require_confirmation',
    conditionGroup: { kind: 'group', id: 'dev:group:custom-field', operator: 'all', children: [
      { kind: 'condition', id: 'dev:condition:reputation-ready', entityId: 'dev:anna', field: 'custom_field', customFieldId: 'dev:field:reputation', operator: 'greater_or_equal', value: 2 },
      { kind: 'condition', id: 'dev:condition:base-tower', entityId: 'dev:anna', field: 'custom_field', customFieldId: 'dev:field:base', operator: 'equals', value: 'dev:tower' },
    ] },
    effects: [{ id: 'dev:effect:reputation-four', entityId: 'dev:anna', type: 'set_custom_field', customFieldId: 'dev:field:reputation', value: 4 }],
  }, { now, ruleId: 'dev:rule:custom-field', eventId: 'dev:event:rule:custom-field' }).campaign

  return campaign
}
