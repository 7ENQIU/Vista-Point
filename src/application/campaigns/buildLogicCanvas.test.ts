import { describe, expect, it } from 'vitest'
import { setLogicRuleInCampaign } from '../../domain/campaign/logicRules'
import { addEntityToCampaign } from '../../domain/campaign/addEntity'
import { createCampaign } from '../../domain/campaign/createCampaign'
import { buildLogicCanvas } from './buildLogicCanvas'

function campaignWithRule() {
  let campaign = createCampaign({ name: 'Логика' }, new Date('2026-08-26T10:00:00Z'), 'c1')
  campaign = addEntityToCampaign(campaign, { type: 'npc', name: 'Анна' }, { entityId: 'e1' }).campaign
  campaign.entities[0] = { ...campaign.entities[0], status: 'draft' }
  return setLogicRuleInCampaign(campaign, {
    name: 'Анна готова', enabled: true,
    conditionGroup: { kind: 'group', operator: 'all', children: [{ kind: 'condition', entityId: 'e1', field: 'lifecycle_status', operator: 'equals', value: 'draft' }] },
    effects: [{ entityId: 'e1', type: 'set_lifecycle_status', value: 'active' }],
    executionMode: 'require_confirmation', trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' },
  }, { ruleId: 'rule-1', groupIds: ['group-1'], conditionIds: ['condition-1'], effectIds: ['effect-1'] }).campaign
}

describe('buildLogicCanvas', () => {
  it('строит цепочку событие → условие → результат без изменения кампании', () => {
    const campaign = campaignWithRule()
    const before = JSON.stringify(campaign)
    const projection = buildLogicCanvas(campaign)
    expect(projection.nodes.map((node) => node.kind)).toEqual(['event', 'condition', 'condition', 'result'])
    expect(projection.edges.map((edge) => edge.label)).toEqual(['проверить', 'далее', 'да'])
    expect(projection.nodes[1]).toMatchObject({ state: 'pass', title: 'Условие 1 · выполнено' })
    expect(projection.nodes[2]).toMatchObject({ state: 'pass', title: 'Все элементы · AND' })
    expect(JSON.stringify(campaign)).toBe(before)
  })

  it('отмечает выключенное правило без подготовки автоматического действия', () => {
    const campaign = campaignWithRule()
    campaign.logicRules[0] = { ...campaign.logicRules[0], enabled: false }
    expect(buildLogicCanvas(campaign).nodes.every((node) => node.state === 'disabled')).toBe(true)
  })

  it('разводит несколько условий через корневую группу к нескольким результатам', () => {
    let campaign = campaignWithRule()
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Башня' }, { entityId: 'e2' }).campaign
    campaign.entities[1] = { ...campaign.entities[1], status: 'draft' }
    campaign = setLogicRuleInCampaign(campaign, {
      ruleId: 'rule-1', name: 'Открыть путь', enabled: true,
      conditionGroup: { kind: 'group', id: 'group-1', operator: 'any', children: [
        { kind: 'condition', id: 'condition-1', entityId: 'e1', field: 'lifecycle_status', operator: 'equals', value: 'draft' },
        { kind: 'condition', id: 'condition-2', entityId: 'e2', field: 'lifecycle_status', operator: 'equals', value: 'active' },
      ] },
      effects: [
        { id: 'effect-1', entityId: 'e1', type: 'set_lifecycle_status', value: 'active' },
        { id: 'effect-2', entityId: 'e2', type: 'set_lifecycle_status', value: 'active' },
      ],
      executionMode: 'require_confirmation', trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' },
    }).campaign

    const projection = buildLogicCanvas(campaign)
    expect(projection.nodes).toHaveLength(6)
    expect(projection.edges.map((edge) => edge.label)).toEqual(['проверить', 'проверить', 'далее', 'далее', 'да', 'да'])
    expect(projection.nodes.find((node) => node.id.includes(':group:'))).toMatchObject({ title: 'Хотя бы один · OR', state: 'pass' })
    expect(projection.nodes.filter((node) => node.kind === 'result')).toHaveLength(2)
  })

  it('показывает вложенную группу отдельным узлом между условиями и корневой группой', () => {
    let campaign = campaignWithRule()
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Башня' }, { entityId: 'e2' }).campaign
    campaign.entities[1] = { ...campaign.entities[1], status: 'draft' }
    campaign = setLogicRuleInCampaign(campaign, {
      ruleId: 'rule-1', name: 'Сложное правило', enabled: true,
      conditionGroup: { kind: 'group', id: 'group-1', operator: 'all', children: [
        { kind: 'group', id: 'group-2', operator: 'none', children: [
          { kind: 'condition', id: 'condition-1', entityId: 'e1', field: 'lifecycle_status', operator: 'equals', value: 'active' },
          { kind: 'condition', id: 'condition-2', entityId: 'e2', field: 'lifecycle_status', operator: 'equals', value: 'active' },
        ] },
      ] },
      effects: [{ id: 'effect-1', entityId: 'e1', type: 'set_lifecycle_status', value: 'active' }],
      executionMode: 'require_confirmation', trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' },
    }).campaign

    const projection = buildLogicCanvas(campaign)
    const nested = projection.nodes.find((node) => node.id.endsWith(':group:group-2'))!
    const root = projection.nodes.find((node) => node.id.endsWith(':group:group-1'))!
    expect(nested).toMatchObject({ title: 'Ни один · NOT', state: 'pass' })
    expect(root).toMatchObject({ title: 'Все элементы · AND', state: 'pass' })
    expect(nested.x).toBeLessThan(root.x)
    expect(projection.edges).toContainEqual(expect.objectContaining({ sourceId: nested.id, targetId: root.id, label: 'далее' }))
    expect(projection.width).toBeGreaterThan(1230)
  })
})
