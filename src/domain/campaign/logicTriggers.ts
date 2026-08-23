import { applyLogicRuleInCampaign, evaluateLogicRule, previewLogicRule } from './logicRules'
import type { Campaign, CampaignEvent, LogicActivation, LogicRule, LogicTriggerState } from './types'

export interface LogicTriggerOptions {
  now?: Date
  activationIds?: string[]
  eventIds?: string[]
  maxAutomaticSteps?: number
}

interface IdCounters { activation: number; event: number }

function nextId(ids: string[] | undefined, index: number): string {
  return ids?.[index] ?? crypto.randomUUID()
}

function eventForRule(campaign: Campaign, rule: LogicRule): CampaignEvent | undefined {
  const events = campaign.eventLog.filter((event) => !event.type.startsWith('logic.activation.'))
  return rule.trigger.type === 'world_time'
    ? [...events].reverse().find((event) => event.type === 'world.time.changed')
    : events.at(-1)
}

function activationEvent(
  campaign: Campaign,
  activation: LogicActivation,
  type: 'logic.activation.created' | 'logic.activation.applied' | 'logic.activation.dismissed' | 'logic.activation.invalidated',
  eventId: string,
  now: string,
): CampaignEvent {
  const rule = campaign.logicRules.find((item) => item.id === activation.ruleId)
  return {
    id: eventId, campaignId: campaign.id, type, occurredAt: now, worldTime: campaign.worldTime,
    source: type === 'logic.activation.dismissed' || (type === 'logic.activation.applied' && rule?.executionMode !== 'automatic') ? 'user' : 'system', sessionId: campaign.activeSessionId,
    relatedEntityIds: rule ? [...new Set(rule.effects.map((effect) => effect.entityId))] : [], reversible: false,
    payload: { activationId: activation.id, ruleId: activation.ruleId, ruleName: rule?.name, dueAt: activation.dueAt, sourceEventId: activation.sourceEventId },
  }
}

function resolveActivation(
  campaign: Campaign,
  activationId: string,
  action: 'apply' | 'dismiss',
  options: LogicTriggerOptions,
  counters: IdCounters,
): { campaign: Campaign; activation: LogicActivation; changed: boolean } {
  const activation = campaign.logicActivations.find((item) => item.id === activationId)
  if (!activation || activation.status !== 'pending') throw new Error('Срабатывание правила не найдено или уже обработано.')
  const timestamp = (options.now ?? new Date()).toISOString()
  if (action === 'dismiss') {
    const resolved = { ...activation, status: 'dismissed' as const, resolvedAt: timestamp }
    const event = activationEvent(campaign, resolved, 'logic.activation.dismissed', nextId(options.eventIds, counters.event++), timestamp)
    return { activation: resolved, changed: true, campaign: { ...campaign, logicActivations: campaign.logicActivations.map((item) => item.id === activation.id ? resolved : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
  }
  if (Date.parse(activation.dueAt) > Date.parse(campaign.worldTime)) throw new Error('Игровое время отложенного срабатывания ещё не наступило.')
  const rule = campaign.logicRules.find((item) => item.id === activation.ruleId)
  if (!rule || !rule.enabled) {
    const resolved = { ...activation, status: 'invalidated' as const, resolvedAt: timestamp }
    const event = activationEvent(campaign, resolved, 'logic.activation.invalidated', nextId(options.eventIds, counters.event++), timestamp)
    return { activation: resolved, changed: true, campaign: { ...campaign, logicActivations: campaign.logicActivations.map((item) => item.id === activation.id ? resolved : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
  }
  if (rule.executionMode === 'suggest_only') throw new Error('Предложение мастеру нельзя применить как автоматическое последствие.')
  if (!evaluateLogicRule(campaign, rule).satisfied) {
    const resolved = { ...activation, status: 'invalidated' as const, resolvedAt: timestamp }
    const event = activationEvent(campaign, resolved, 'logic.activation.invalidated', nextId(options.eventIds, counters.event++), timestamp)
    return { activation: resolved, changed: true, campaign: { ...campaign, logicActivations: campaign.logicActivations.map((item) => item.id === activation.id ? resolved : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
  }
  const applied = applyLogicRuleInCampaign(campaign, rule.id, { now: options.now, eventId: nextId(options.eventIds, counters.event++), source: rule.executionMode === 'automatic' ? 'system' : 'user', activationId })
  const resolved = { ...activation, status: 'applied' as const, resolvedAt: timestamp }
  const withStatus = { ...applied.campaign, logicActivations: applied.campaign.logicActivations.map((item) => item.id === activation.id ? resolved : item) }
  const event = activationEvent(withStatus, resolved, 'logic.activation.applied', nextId(options.eventIds, counters.event++), timestamp)
  return { activation: resolved, changed: true, campaign: { ...withStatus, eventLog: [...withStatus.eventLog, event], updatedAt: timestamp } }
}

export function dismissLogicActivationInCampaign(campaign: Campaign, activationId: string, options: LogicTriggerOptions = {}) {
  return resolveActivation(campaign, activationId, 'dismiss', options, { activation: 0, event: 0 })
}

export function applyLogicActivationInCampaign(campaign: Campaign, activationId: string, options: LogicTriggerOptions = {}) {
  return resolveActivation(campaign, activationId, 'apply', options, { activation: 0, event: 0 })
}

export function refreshLogicTriggersInCampaign(campaign: Campaign, options: LogicTriggerOptions = {}): { campaign: Campaign; changed: boolean; automaticLimitReached: boolean } {
  const timestamp = (options.now ?? new Date()).toISOString()
  const counters: IdCounters = { activation: 0, event: 0 }
  const maxSteps = options.maxAutomaticSteps ?? 20
  let current = campaign
  let changed = false
  let automaticSteps = 0

  while (automaticSteps < maxSteps) {
    let progressed = false

    const dueAutomatic = current.logicActivations.find((activation) => {
      const rule = current.logicRules.find((item) => item.id === activation.ruleId)
      return activation.status === 'pending' && rule?.executionMode === 'automatic' && Date.parse(activation.dueAt) <= Date.parse(current.worldTime)
    })
    if (dueAutomatic) {
      current = resolveActivation(current, dueAutomatic.id, 'apply', options, counters).campaign
      automaticSteps += 1; changed = true; progressed = true
      continue
    }

    for (const rule of current.logicRules) {
      if (!rule.enabled || rule.trigger.type === 'manual') continue
      const sourceEvent = eventForRule(current, rule)
      if (!sourceEvent) continue
      const existing = current.logicTriggerStates.find((state) => state.ruleId === rule.id)
      if (existing?.lastEventId === sourceEvent.id) continue
      const evaluation = evaluateLogicRule(current, rule)
      const shouldTrigger = evaluation.satisfied && !existing?.lastSatisfied && (rule.trigger.repeat === 'rearm' || !existing?.hasTriggered)
      const state: LogicTriggerState = { ruleId: rule.id, lastSatisfied: evaluation.satisfied, hasTriggered: Boolean(existing?.hasTriggered || shouldTrigger), lastEventId: sourceEvent.id, evaluatedAt: timestamp }
      current = { ...current, logicTriggerStates: [...current.logicTriggerStates.filter((item) => item.ruleId !== rule.id), state] }
      changed = true; progressed = true
      if (!evaluation.satisfied) {
        const stale = current.logicActivations.filter((activation) => activation.ruleId === rule.id && activation.status === 'pending')
        for (const activation of stale) {
          const invalidated = { ...activation, status: 'invalidated' as const, resolvedAt: timestamp }
          const event = activationEvent(current, invalidated, 'logic.activation.invalidated', nextId(options.eventIds, counters.event++), timestamp)
          current = { ...current, logicActivations: current.logicActivations.map((item) => item.id === activation.id ? invalidated : item), eventLog: [...current.eventLog, event], updatedAt: timestamp }
        }
      }
      if (!shouldTrigger) continue

      const preview = previewLogicRule(current, rule)
      const dueAt = new Date(Date.parse(current.worldTime) + rule.trigger.delayMinutes * 60_000).toISOString()
      const activation: LogicActivation = {
        id: nextId(options.activationIds, counters.activation++), campaignId: current.id, ruleId: rule.id, status: 'pending', sourceEventId: sourceEvent.id,
        triggeredAt: timestamp, dueAt, evaluationExplanation: evaluation.explanation,
        conditionExplanations: [...evaluation.groupResults.map((item) => item.explanation), ...evaluation.conditionResults.map((item) => item.explanation)],
        effectExplanations: preview.effects.map((item) => item.explanation),
      }
      const event = activationEvent(current, activation, 'logic.activation.created', nextId(options.eventIds, counters.event++), timestamp)
      current = { ...current, logicActivations: [...current.logicActivations, activation], eventLog: [...current.eventLog, event], updatedAt: timestamp }
      if (rule.executionMode === 'automatic' && rule.trigger.delayMinutes === 0) break
    }

    if (!progressed) break
  }

  const automaticLimitReached = automaticSteps >= maxSteps && current.logicActivations.some((activation) => {
    const rule = current.logicRules.find((item) => item.id === activation.ruleId)
    return activation.status === 'pending' && rule?.executionMode === 'automatic' && Date.parse(activation.dueAt) <= Date.parse(current.worldTime)
  })
  if (automaticLimitReached) {
    const event: CampaignEvent = { id: nextId(options.eventIds, counters.event++), campaignId: current.id, type: 'logic.activation.limit_reached', occurredAt: timestamp, worldTime: current.worldTime, source: 'system', sessionId: current.activeSessionId, relatedEntityIds: [], reversible: false, payload: { maxAutomaticSteps: maxSteps } }
    current = { ...current, eventLog: [...current.eventLog, event], updatedAt: timestamp }; changed = true
  }
  return { campaign: changed ? { ...current, updatedAt: timestamp } : campaign, changed, automaticLimitReached }
}
