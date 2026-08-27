import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createLogicTestCampaign } from '../application/campaigns/createLogicTestCampaign'
import { LogicRuleCanvasEditor } from './LogicRuleCanvasEditor'

describe('LogicRuleCanvasEditor', () => {
  it('открывает для редактирования правило по состоянию и показывает типизированное значение', () => {
    const campaign = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))
    const rule = campaign.logicRules.find((item) => item.id === 'dev:rule:state')
    const html = renderToStaticMarkup(createElement(LogicRuleCanvasEditor, {
      campaign,
      rule,
      onCancel: () => undefined,
      onSave: async () => undefined,
    }))

    expect(html).not.toContain('Неподдерживаемое правило')
    expect(html).toContain('Значение состояния')
    expect(html).toContain('Параметр состояния')
    expect(html).toContain('Доверие')
    expect(html).toContain('Ожидаемое значение')
    expect(html).toContain('Новое значение')
  })

  it('редактирует результат создания факта с предикатом и целью', () => {
    const campaign = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))
    const baseRule = campaign.logicRules.find((item) => item.id === 'dev:rule:state')!
    const rule = { ...baseRule, effects: [{ id: 'fact-effect', entityId: 'dev:anna', type: 'create_fact' as const, targetEntityId: 'dev:order', predicateId: 'dev:predicate:trusts', directed: true, description: '' }] }
    const html = renderToStaticMarkup(createElement(LogicRuleCanvasEditor, { campaign, rule, onCancel: () => undefined, onSave: async () => undefined }))

    expect(html).not.toContain('Неподдерживаемое правило')
    expect(html).toContain('Создать факт')
    expect(html).toContain('Предикат')
    expect(html).toContain('Доверяет')
    expect(html).toContain('Орден Семи ключей')
    expect(html).not.toContain('Видимость факта')
  })

  it('редактирует условие и результат пользовательского поля', () => {
    const base = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))
    const campaign = { ...base, customFieldDefinitions: [{ id: 'trust-field', name: 'Доверие к партии', type: 'number' as const }] }
    const baseRule = campaign.logicRules.find((item) => item.id === 'dev:rule:state')!
    const rule = {
      ...baseRule,
      conditionGroup: { kind: 'group' as const, id: 'root', operator: 'all' as const, children: [{ kind: 'condition' as const, id: 'condition', entityId: 'dev:anna', field: 'custom_field' as const, customFieldId: 'trust-field', operator: 'greater_or_equal' as const, value: 2 }] },
      effects: [{ id: 'effect', entityId: 'dev:anna', type: 'set_custom_field' as const, customFieldId: 'trust-field', value: 4 }],
    }
    const html = renderToStaticMarkup(createElement(LogicRuleCanvasEditor, { campaign, rule, onCancel: () => undefined, onSave: async () => undefined }))

    expect(html).not.toContain('Неподдерживаемое правило')
    expect(html).toContain('Пользовательское поле')
    expect(html).toContain('Доверие к партии')
    expect(html).toContain('Больше или равно')
    expect(html).toContain('Новое значение')
  })
})
