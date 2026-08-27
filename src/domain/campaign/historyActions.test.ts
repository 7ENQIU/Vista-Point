import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { addPredicateToCampaign } from './addPredicate'
import { addRelationshipToCampaign } from './addRelationship'
import { createCampaign } from './createCampaign'
import { applyHistoryAction, getHistoryActionState } from './historyActions'
import { applyLogicRuleInCampaign, setLogicRuleInCampaign } from './logicRules'

function graphCampaign() {
  let campaign = createCampaign({ name: 'История' }, new Date('2026-08-23T10:00:00Z'), 'c1')
  campaign = addEntityToCampaign(campaign, { type: 'npc', name: 'Анна' }, { entityId: 'e1', eventId: 'create-e1' }).campaign
  campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Башня' }, { entityId: 'e2', eventId: 'create-e2' }).campaign
  campaign = addPredicateToCampaign(campaign, { directLabel: 'охраняет', inverseLabel: 'охраняется', directed: true }, { predicateId: 'p1', eventId: 'create-p1' }).campaign
  return addRelationshipToCampaign(campaign, { sourceId: 'e1', targetId: 'e2', predicateId: 'p1' }, { relationshipId: 'r1', eventId: 'create-r1' }).campaign
}

describe('historyActions', () => {
  it('отменяет и повторяет создание факта без удаления исходного события', () => {
    const campaign = graphCampaign()
    const undone = applyHistoryAction(campaign, 'undo', { eventId: 'undo-r1' })
    expect(undone.campaign.relationships.find((item) => item.id === 'r1')?.status).toBe('archived')
    expect(undone.campaign.eventLog.map((event) => event.id)).toContain('create-r1')
    expect(undone.event).toMatchObject({ type: 'history.undo', reversible: false, payload: { targetEventId: 'create-r1' } })
    expect(getHistoryActionState(undone.campaign.eventLog).redo?.id).toBe('create-r1')

    const redone = applyHistoryAction(undone.campaign, 'redo', { eventId: 'redo-r1' })
    expect(redone.campaign.relationships.find((item) => item.id === 'r1')?.status).toBe('active')
    expect(getHistoryActionState(redone.campaign.eventLog).undo?.id).toBe('create-r1')
  })

  it('отменяет действия последовательно и очищает redo после нового действия', () => {
    const firstUndo = applyHistoryAction(graphCampaign(), 'undo', { eventId: 'undo-r1' }).campaign
    const secondUndo = applyHistoryAction(firstUndo, 'undo', { eventId: 'undo-p1' }).campaign
    expect(secondUndo.predicates.find((item) => item.id === 'p1')?.status).toBe('archived')
    const changed = addPredicateToCampaign(secondUndo, { directLabel: 'знает тайну', inverseLabel: 'известен тайной', directed: true }, { predicateId: 'p2', eventId: 'create-p2' }).campaign
    expect(getHistoryActionState(changed.eventLog).redo).toBeUndefined()
  })

  it('не пересекает неподдерживаемое событие', () => {
    const campaign = graphCampaign()
    const blocked = { ...campaign, eventLog: [...campaign.eventLog, { ...campaign.eventLog.at(-1)!, id: 'manual', type: 'session.manual_event', reversible: false }] }
    expect(getHistoryActionState(blocked.eventLog)).toEqual({ undo: undefined, redo: undefined })
    expect(() => applyHistoryAction(blocked, 'undo')).toThrow('Нет действия')
  })

  it('не применяет неизвестные поля из снимка импортированного события', () => {
    const campaign = graphCampaign()
    const unsafeEvent = {
      ...campaign.eventLog.at(-1)!, id: 'unsafe', type: 'entity.updated', relatedEntityIds: ['e1'],
      payload: { changedFields: ['id'], before: { id: 'hijacked' }, after: { id: 'e1' } },
    }
    const unsafeCampaign = { ...campaign, eventLog: [...campaign.eventLog, unsafeEvent] }
    expect(() => applyHistoryAction(unsafeCampaign, 'undo')).toThrow('нельзя безопасно восстановить')
    expect(unsafeCampaign.entities.find((item) => item.id === 'e1')).toBeDefined()
  })

  it('отменяет и повторяет создание логического правила через доменную проверку', () => {
    const base = graphCampaign()
    const created = setLogicRuleInCampaign(base, {
      name: 'Анна в башне', enabled: true,
      conditionGroup: { kind: 'group', operator: 'all', children: [{ kind: 'condition', entityId: 'e1', field: 'relationship', targetEntityId: 'e2', predicateId: 'p1', operator: 'exists' }] },
      effects: [{ entityId: 'e1', type: 'set_lifecycle_status', value: 'active' }],
      executionMode: 'require_confirmation', trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' },
    }, { ruleId: 'rule-1', eventId: 'create-rule' }).campaign
    const undone = applyHistoryAction(created, 'undo', { eventId: 'undo-rule' }).campaign
    expect(undone.logicRules).toEqual([])
    const redone = applyHistoryAction(undone, 'redo', { eventId: 'redo-rule' }).campaign
    expect(redone.logicRules[0]).toMatchObject({ id: 'rule-1', name: 'Анна в башне' })
  })

  it('отменяет и повторяет атомарное применение логического правила', () => {
    const base = graphCampaign()
    base.entities[0] = { ...base.entities[0], status: 'draft' }
    const created = setLogicRuleInCampaign(base, {
      name: 'Активировать Анну', enabled: true,
      conditionGroup: { kind: 'group', operator: 'all', children: [{ kind: 'condition', entityId: 'e1', field: 'lifecycle_status', operator: 'equals', value: 'draft' }] },
      effects: [{ entityId: 'e1', type: 'set_lifecycle_status', value: 'active' }],
      executionMode: 'require_confirmation', trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' },
    }, { ruleId: 'rule-apply', eventId: 'create-rule' }).campaign
    const applied = applyLogicRuleInCampaign(created, 'rule-apply', { eventId: 'apply-rule' }).campaign
    expect(applied.entities.find((item) => item.id === 'e1')?.status).toBe('active')

    const undone = applyHistoryAction(applied, 'undo', { eventId: 'undo-apply' }).campaign
    expect(undone.entities.find((item) => item.id === 'e1')?.status).toBe('draft')
    const redone = applyHistoryAction(undone, 'redo', { eventId: 'redo-apply' }).campaign
    expect(redone.entities.find((item) => item.id === 'e1')?.status).toBe('active')
  })

  it('отменяет и повторяет факт, созданный применением правила', () => {
    const base = graphCampaign()
    const created = setLogicRuleInCampaign(base, {
      name: 'Анна узнаёт Башню', enabled: true,
      conditionGroup: { kind: 'group', operator: 'all', children: [{ kind: 'condition', entityId: 'e1', field: 'relationship', targetEntityId: 'e2', predicateId: 'p1', operator: 'exists' }] },
      effects: [{ entityId: 'e2', type: 'create_fact', targetEntityId: 'e1', predicateId: 'builtin:knows' }],
      executionMode: 'require_confirmation', trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' },
    }, { ruleId: 'create-fact-rule', eventId: 'create-fact-rule' }).campaign
    const applied = applyLogicRuleInCampaign(created, 'create-fact-rule', { eventId: 'apply-created-fact', relationshipIds: ['logic-fact'] }).campaign
    expect(applied.relationships.find((item) => item.id === 'logic-fact')?.status).toBe('active')

    const undone = applyHistoryAction(applied, 'undo', { eventId: 'undo-created-fact' }).campaign
    expect(undone.relationships.find((item) => item.id === 'logic-fact')?.status).toBe('archived')
    const redone = applyHistoryAction(undone, 'redo', { eventId: 'redo-created-fact' }).campaign
    expect(redone.relationships.find((item) => item.id === 'logic-fact')?.status).toBe('active')
  })

  it('Undo удаляет впервые заполненное пользовательское поле, а Redo возвращает значение', () => {
    const base = graphCampaign()
    const withField = { ...base, customFieldDefinitions: [{ id: 'trust', name: 'Доверие', type: 'number' as const }] }
    const created = setLogicRuleInCampaign(withField, {
      name: 'Установить доверие', enabled: true,
      conditionGroup: { kind: 'group', operator: 'all', children: [{ kind: 'condition', entityId: 'e1', field: 'custom_field', customFieldId: 'trust', operator: 'not_exists' }] },
      effects: [{ entityId: 'e1', type: 'set_custom_field', customFieldId: 'trust', value: 4 }],
      executionMode: 'require_confirmation', trigger: { type: 'manual', delayMinutes: 0, repeat: 'rearm' },
    }, { ruleId: 'custom-rule', eventId: 'create-custom-rule' }).campaign
    const applied = applyLogicRuleInCampaign(created, 'custom-rule', { eventId: 'apply-custom-rule' }).campaign
    expect(applied.entities.find((item) => item.id === 'e1')?.customFields).toEqual({ trust: 4 })

    const undone = applyHistoryAction(applied, 'undo', { eventId: 'undo-custom-rule' }).campaign
    expect(undone.entities.find((item) => item.id === 'e1')?.customFields).toEqual({})
    const redone = applyHistoryAction(undone, 'redo', { eventId: 'redo-custom-rule' }).campaign
    expect(redone.entities.find((item) => item.id === 'e1')?.customFields).toEqual({ trust: 4 })
  })
})
