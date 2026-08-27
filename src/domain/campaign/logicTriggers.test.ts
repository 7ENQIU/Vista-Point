import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { setLogicRuleInCampaign } from './logicRules'
import { applyLogicActivationInCampaign, refreshLogicTriggersInCampaign } from './logicTriggers'
import { applyWorldTimeChangeInCampaign } from './worldClock'

function campaignWithNpc() {
  const campaign = addEntityToCampaign(createCampaign({ name: 'Триггеры' }, new Date('2026-08-23T10:00:00.000Z'), 'campaign-1'), { type: 'npc', name: 'Серёга' }, { entityId: 'npc-1', eventId: 'entity-event' }).campaign
  campaign.entities[0] = { ...campaign.entities[0], status: 'draft' }
  return campaign
}

function triggeredRule(executionMode: 'automatic' | 'require_confirmation' = 'require_confirmation') {
  return {
    name: 'Активировать NPC', enabled: true, executionMode,
    trigger: { type: 'on_change' as const, delayMinutes: 0, repeat: 'rearm' as const },
    conditionGroup: { kind: 'group' as const, operator: 'all' as const, children: [{ kind: 'condition' as const, entityId: 'npc-1', field: 'lifecycle_status' as const, operator: 'equals' as const, value: 'draft' as const }] },
    effects: [{ entityId: 'npc-1', type: 'set_lifecycle_status' as const, value: 'active' as const }],
  }
}

describe('Logic Trigger Engine', () => {
  it('создаёт одно ожидающее срабатывание на переходе false → true и применяет его после подтверждения', () => {
    const withRule = setLogicRuleInCampaign(campaignWithNpc(), triggeredRule(), { ruleId: 'rule-1', eventId: 'rule-event' }).campaign
    const refreshed = refreshLogicTriggersInCampaign(withRule, { now: new Date('2026-08-23T10:01:00.000Z'), activationIds: ['activation-1'], eventIds: ['activation-created'] })
    expect(refreshed.campaign.logicActivations[0]).toMatchObject({ id: 'activation-1', ruleId: 'rule-1', status: 'pending', sourceEventId: 'rule-event' })
    expect(refreshed.campaign.logicTriggerStates[0]).toMatchObject({ lastSatisfied: true, hasTriggered: true })
    expect(refreshLogicTriggersInCampaign(refreshed.campaign).changed).toBe(false)

    const applied = applyLogicActivationInCampaign(refreshed.campaign, 'activation-1', { now: new Date('2026-08-23T10:02:00.000Z'), eventIds: ['rule-applied', 'activation-applied'] })
    expect(applied.campaign.entities[0].status).toBe('active')
    expect(applied.activation.status).toBe('applied')
    expect(applied.campaign.eventLog.slice(-2).map((event) => event.type)).toEqual(['logic.rule.applied', 'logic.activation.applied'])
  })

  it('применяет явно разрешённое автоматическое правило и не создаёт дубль', () => {
    const withRule = setLogicRuleInCampaign(campaignWithNpc(), triggeredRule('automatic'), { ruleId: 'rule-auto', eventId: 'rule-event' }).campaign
    const refreshed = refreshLogicTriggersInCampaign(withRule, { now: new Date('2026-08-23T10:01:00.000Z'), activationIds: ['auto-activation'], eventIds: ['created', 'rule-applied', 'activation-applied'] })
    expect(refreshed.campaign.entities[0].status).toBe('active')
    expect(refreshed.campaign.logicActivations).toEqual([expect.objectContaining({ status: 'applied' })])
    expect(refreshed.automaticLimitReached).toBe(false)
    expect(refreshLogicTriggersInCampaign(refreshed.campaign).campaign.logicActivations).toHaveLength(1)
  })

  it('автоматически убирает из очереди срабатывание, условия которого перестали выполняться', () => {
    const withRule = setLogicRuleInCampaign(campaignWithNpc(), triggeredRule(), { ruleId: 'rule-1', eventId: 'rule-event' }).campaign
    const queued = refreshLogicTriggersInCampaign(withRule, { activationIds: ['activation-1'], eventIds: ['activation-created'] }).campaign
    const marker = { ...queued.eventLog.at(-1)!, id: 'entity-updated', type: 'entity.updated', relatedEntityIds: ['npc-1'] }
    const changed = { ...queued, entities: queued.entities.map((entity) => ({ ...entity, status: 'active' as const })), eventLog: [...queued.eventLog, marker] }
    const refreshed = refreshLogicTriggersInCampaign(changed, { eventIds: ['activation-invalidated'] }).campaign
    expect(refreshed.logicActivations[0]).toMatchObject({ status: 'invalidated' })
    expect(refreshed.eventLog.at(-1)?.type).toBe('logic.activation.invalidated')
  })

  it('ждёт мирового времени для отложенного последствия и повторно проверяет условия', () => {
    const base = campaignWithNpc()
    const threshold = '2026-08-23T10:30:00.000Z'
    const withRule = setLogicRuleInCampaign(base, {
      ...triggeredRule(), trigger: { type: 'world_time', delayMinutes: 30, repeat: 'once' },
      conditionGroup: { kind: 'group', operator: 'all', children: [{ kind: 'condition', field: 'world_time', operator: 'greater_or_equal', value: threshold }] },
    }, { ruleId: 'time-rule', eventId: 'rule-event' }).campaign
    expect(refreshLogicTriggersInCampaign(withRule).changed).toBe(false)

    const advanced = applyWorldTimeChangeInCampaign(withRule, '2026-08-23T11:00:00.000Z', true, { eventId: 'time-event' }).campaign
    const queued = refreshLogicTriggersInCampaign(advanced, { now: new Date('2026-08-23T10:05:00.000Z'), activationIds: ['delayed'], eventIds: ['created'] }).campaign
    expect(queued.logicActivations[0].dueAt).toBe('2026-08-23T11:30:00.000Z')
    expect(() => applyLogicActivationInCampaign(queued, 'delayed')).toThrow('ещё не наступило')
  })
})
