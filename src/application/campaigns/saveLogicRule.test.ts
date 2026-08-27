import { describe, expect, it, vi } from 'vitest'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { setLogicRuleInCampaign } from '../../domain/campaign/logicRules'
import { setEntityStateInCampaign } from '../../domain/campaign/setEntityState'
import type { CampaignRepository } from '../ports/CampaignRepository'
import { applyAndSaveLogicRule, removeAndSaveLogicRule, setAndSaveLogicRule } from './saveLogicRule'

function setup() {
  const entity = addEntityToCampaign(createCampaign({ name: 'Кампания' }), { type: 'npc', name: 'Макс' }, { entityId: 'entity-1' }).campaign
  return setEntityStateInCampaign(entity, 'entity-1', { name: 'Готов', category: 'story', valueType: 'boolean', value: true }, { stateId: 'state-1' }).campaign
}

const input = {
  name: 'Активация', enabled: true, executionMode: 'require_confirmation' as const,
  conditionGroup: { kind: 'group' as const, operator: 'all' as const, children: [{ kind: 'condition' as const, entityId: 'entity-1', field: 'state' as const, stateId: 'state-1', operator: 'equals' as const, value: true }] },
  effects: [{ entityId: 'entity-1', type: 'set_state' as const, stateId: 'state-1', value: false }],
}

describe('saveLogicRule', () => {
  it('сохраняет создание, применение и удаление правила', async () => {
    const save = vi.fn()
    const repository = { save } as unknown as CampaignRepository
    const created = await setAndSaveLogicRule(repository, setup(), input)
    expect(save).toHaveBeenCalledTimes(1)

    const applied = await applyAndSaveLogicRule(repository, created.campaign, created.rule.id)
    expect(applied.campaign.entities[0].state[0].value).toBe(false)
    expect(save).toHaveBeenCalledTimes(2)

    await removeAndSaveLogicRule(repository, applied.campaign, created.rule.id)
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('не сохраняет повторное применение без изменений', async () => {
    const save = vi.fn()
    const repository = { save } as unknown as CampaignRepository
    const campaign = setup()
    const noOpInput = { ...input, effects: [{ entityId: 'entity-1', type: 'set_state' as const, stateId: 'state-1', value: true }] }
    const created = setLogicRuleInCampaign(campaign, noOpInput, { ruleId: 'rule-1' }).campaign
    const applied = await applyAndSaveLogicRule(repository, created, 'rule-1')
    expect(applied.changed).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
})
