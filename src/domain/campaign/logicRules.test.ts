import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import {
  applyLogicRuleInCampaign,
  evaluateLogicRule,
  previewLogicRule,
  removeLogicRuleFromCampaign,
  setLogicRuleInCampaign,
} from './logicRules'
import { setEntityStateInCampaign } from './setEntityState'
import { archiveEntityInCampaign } from './archiveCampaignItem'
import { addRelationshipToCampaign } from './addRelationship'
import { setKnowledgeInCampaign } from './setKnowledge'

function campaignWithState() {
  const created = addEntityToCampaign(createCampaign({ name: 'Правила' }), { type: 'npc', name: 'Серёга' }, {
    entityId: 'entity-1', eventId: 'entity-event', now: new Date('2026-08-20T10:00:00.000Z'),
  }).campaign
  return setEntityStateInCampaign(created, 'entity-1', {
    name: 'Здоровье', category: 'resource', valueType: 'integer', value: 12,
  }, { stateId: 'state-1', eventId: 'state-event', now: new Date('2026-08-20T10:01:00.000Z') }).campaign
}

function ruleInput() {
  return {
    name: 'Серёга ранен', description: 'Показать последствия низкого здоровья.', enabled: true,
    conditionGroup: { kind: 'group' as const, operator: 'all' as const, children: [{ kind: 'condition' as const, entityId: 'entity-1', field: 'state' as const, stateId: 'state-1', operator: 'less' as const, value: 15 }] }, executionMode: 'require_confirmation' as const,
    effects: [{ entityId: 'entity-1', type: 'set_lifecycle_status' as const, value: 'active' as const }],
  }
}

describe('Logic Layer', () => {
  it('создаёт правило отдельно от сущности и фиксирует событие', () => {
    const result = setLogicRuleInCampaign(campaignWithState(), ruleInput(), {
      ruleId: 'rule-1', conditionIds: ['condition-1'], effectIds: ['effect-1'], eventId: 'rule-event',
      now: new Date('2026-08-20T10:02:00.000Z'),
    })

    expect(result.rule).toMatchObject({ id: 'rule-1', conditionGroup: { operator: 'all' }, executionMode: 'require_confirmation' })
    expect(result.campaign.entities[0].state[0].value).toBe(12)
    expect(result.event).toMatchObject({ type: 'logic.rule.created', relatedEntityIds: ['entity-1'] })
  })

  it('объяснимо оценивает ALL, ANY и NONE без изменения кампании', () => {
    const created = setLogicRuleInCampaign(campaignWithState(), ruleInput(), {
      ruleId: 'rule-1', conditionIds: ['condition-1'], effectIds: ['effect-1'],
    })
    const evaluation = evaluateLogicRule(created.campaign, created.rule)
    const preview = previewLogicRule(created.campaign, created.rule)

    expect(evaluation.satisfied).toBe(true)
    expect(evaluation.conditionResults[0]).toMatchObject({ passed: true, actual: 12 })
    expect(preview.canApply).toBe(true)
    expect(created.campaign.entities[0].status).toBe('draft')

    const none = { ...created.rule, conditionGroup: { ...created.rule.conditionGroup, operator: 'none' as const } }
    expect(evaluateLogicRule(created.campaign, none).satisfied).toBe(false)
  })

  it('применяет несколько эффектов атомарно только после отдельного вызова', () => {
    const input = ruleInput()
    const created = setLogicRuleInCampaign(campaignWithState(), {
      ...input,
      effects: [
        ...input.effects,
        { entityId: 'entity-1', type: 'set_state' as const, stateId: 'state-1', value: 5 },
      ],
    }, { ruleId: 'rule-1', conditionIds: ['condition-1'], effectIds: ['effect-1', 'effect-2'] })
    const applied = applyLogicRuleInCampaign(created.campaign, 'rule-1', {
      eventId: 'apply-event', now: new Date('2026-08-20T10:03:00.000Z'),
    })

    expect(applied.changed).toBe(true)
    expect(applied.campaign.entities[0]).toMatchObject({ status: 'active', state: [{ value: 5 }] })
    expect(applied.event).toMatchObject({ type: 'logic.rule.applied', reversible: true })
    expect(applied.event?.payload.changes).toHaveLength(2)
  })

  it('не применяет невыполненное правило и режим предложения', () => {
    const base = campaignWithState()
    const failed = setLogicRuleInCampaign(base, {
      ...ruleInput(), conditionGroup: { ...ruleInput().conditionGroup, children: [{ ...ruleInput().conditionGroup.children[0], value: 5 }] },
    }, { ruleId: 'failed-rule' }).campaign
    expect(() => applyLogicRuleInCampaign(failed, 'failed-rule')).toThrow('Условия правила не выполнены.')

    const suggested = setLogicRuleInCampaign(base, {
      ...ruleInput(), executionMode: 'suggest_only',
    }, { ruleId: 'suggested-rule' }).campaign
    expect(() => applyLogicRuleInCampaign(suggested, 'suggested-rule')).toThrow('только как предложение')
  })

  it('отклоняет опасное архивирование и сохраняет удалённое правило в событии', () => {
    expect(() => setLogicRuleInCampaign(campaignWithState(), {
      ...ruleInput(), effects: [{ entityId: 'entity-1', type: 'set_lifecycle_status', value: 'archived' }],
    })).toThrow('не может архивировать')

    const created = setLogicRuleInCampaign(campaignWithState(), ruleInput(), { ruleId: 'rule-1' }).campaign
    const removed = removeLogicRuleFromCampaign(created, 'rule-1', { eventId: 'remove-event' })
    expect(removed.campaign.logicRules).toEqual([])
    expect(removed.event).toMatchObject({ type: 'logic.rule.removed', payload: { ruleId: 'rule-1' } })
  })

  it('не применяет старое правило к сущности, которую позднее архивировали', () => {
    const created = setLogicRuleInCampaign(campaignWithState(), ruleInput(), { ruleId: 'rule-1' }).campaign
    const archived = archiveEntityInCampaign(created, 'entity-1').campaign
    expect(() => applyLogicRuleInCampaign(archived, 'rule-1')).toThrow('находится в архиве')
  })

  it('отклоняет конфликтующие последствия для одного поля', () => {
    expect(() => setLogicRuleInCampaign(campaignWithState(), {
      ...ruleInput(), effects: [
        { entityId: 'entity-1', type: 'set_lifecycle_status', value: 'active' },
        { entityId: 'entity-1', type: 'set_lifecycle_status', value: 'draft' },
      ],
    })).toThrow('дважды изменять одно и то же поле')
  })

  it('оценивает вложенные группы и COUNT по состоянию и мировому времени', () => {
    const base = campaignWithState()
    const result = setLogicRuleInCampaign(base, {
      ...ruleInput(),
      conditionGroup: { kind: 'group', operator: 'count', minimum: 2, children: [
        { kind: 'condition', entityId: 'entity-1', field: 'state', stateId: 'state-1', operator: 'less', value: 20 },
        { kind: 'group', operator: 'any', children: [
          { kind: 'condition', field: 'world_time', operator: 'less', value: '2100-01-01T00:00:00.000Z' },
          { kind: 'condition', field: 'world_time', operator: 'greater', value: '2200-01-01T00:00:00.000Z' },
        ] },
        { kind: 'condition', entityId: 'entity-1', field: 'lifecycle_status', operator: 'equals', value: 'active' },
      ] },
    }, { ruleId: 'nested', groupIds: ['root', 'nested-group'], conditionIds: ['c1', 'c2', 'c3', 'c4'] })
    const evaluation = evaluateLogicRule(result.campaign, result.rule)
    expect(evaluation.satisfied).toBe(true)
    expect(evaluation.groupResults).toEqual(expect.arrayContaining([expect.objectContaining({ groupId: 'root', matched: 2, passed: true }), expect.objectContaining({ groupId: 'nested-group', passed: true })]))
  })

  it('проверяет существование типизированной связи и статус знания партии', () => {
    let campaign = campaignWithState()
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Маяк' }, { entityId: 'location-1' }).campaign
    campaign = addRelationshipToCampaign(campaign, { sourceId: 'entity-1', targetId: 'location-1', type: 'located_in', directed: true }).campaign
    campaign = setKnowledgeInCampaign(campaign, { subjectType: 'party', content: 'Серёга на маяке', status: 'known', confidence: 90, truth: 'true', relatedEntityIds: ['entity-1'] }).campaign
    const result = setLogicRuleInCampaign(campaign, {
      ...ruleInput(), conditionGroup: { kind: 'group', operator: 'all', children: [
        { kind: 'condition', entityId: 'entity-1', field: 'relationship', targetEntityId: 'location-1', relationshipType: 'located_in', operator: 'exists' },
        { kind: 'condition', entityId: 'entity-1', field: 'knowledge', subjectType: 'party', operator: 'equals', value: 'known' },
      ] },
    }, { ruleId: 'context-rule' })
    expect(evaluateLogicRule(result.campaign, result.rule).satisfied).toBe(true)
  })
})
