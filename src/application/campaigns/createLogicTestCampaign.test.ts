import { describe, expect, it } from 'vitest'
import { applyLogicRuleInCampaign, previewLogicRule } from '../../domain/campaign/logicRules'
import { parseCampaignFile, serializeCampaignFile } from '../../domain/campaign/campaignFile'
import { createLogicTestCampaign, LOGIC_TEST_CAMPAIGN_ID } from './createLogicTestCampaign'

describe('createLogicTestCampaign', () => {
  const now = new Date('2026-08-26T10:00:00.000Z')

  it('создаёт воспроизводимый изолированный стенд со всеми типами проверочных правил', () => {
    const campaign = createLogicTestCampaign(now)
    const previews = Object.fromEntries(campaign.logicRules.map((rule) => [rule.id, previewLogicRule(campaign, rule)]))

    expect(campaign).toMatchObject({ id: LOGIC_TEST_CAMPAIGN_ID, name: 'Тестовый стенд логики' })
    expect(campaign.entities).toHaveLength(5)
    expect(campaign.relationships).toHaveLength(4)
    expect(campaign.logicRules).toHaveLength(6)
    expect(previews['dev:rule:pass']).toMatchObject({ evaluation: { satisfied: true }, canApply: true })
    expect(previews['dev:rule:fail']).toMatchObject({ evaluation: { satisfied: false }, canApply: false })
    expect(previews['dev:rule:nested']).toMatchObject({ evaluation: { satisfied: true }, canApply: true })
    expect(previews['dev:rule:nested'].effects.filter((effect) => effect.changed)).toHaveLength(2)
    expect(previews['dev:rule:suggest']).toMatchObject({ evaluation: { satisfied: true }, canApply: false })
    expect(previews['dev:rule:suggest'].effects).toEqual([
      expect.objectContaining({ type: 'create_fact', targetEntityId: 'dev:clue', changed: true }),
    ])
    expect(previews['dev:rule:state']).toMatchObject({ evaluation: { satisfied: true }, canApply: true })
    expect(previews['dev:rule:custom-field']).toMatchObject({ evaluation: { satisfied: true }, canApply: true, effects: [expect.objectContaining({ type: 'set_custom_field', changed: true })] })
  })

  it('применяет атомарный и state-сценарии без изменения исходного стенда', () => {
    const campaign = createLogicTestCampaign(now)
    const nested = applyLogicRuleInCampaign(campaign, 'dev:rule:nested', { now, eventId: 'dev:test:apply-nested' })
    const state = applyLogicRuleInCampaign(campaign, 'dev:rule:state', { now, eventId: 'dev:test:apply-state' })
    const customField = applyLogicRuleInCampaign(campaign, 'dev:rule:custom-field', { now, eventId: 'dev:test:apply-custom-field' })

    expect(nested.changed).toBe(true)
    expect(nested.campaign.entities.find((entity) => entity.id === 'dev:vault')?.state[0].value).toBe(false)
    expect(nested.campaign.entities.find((entity) => entity.id === 'dev:clue')?.state[0].value).toBe(1)
    expect(state.campaign.entities.find((entity) => entity.id === 'dev:anna')?.state[0].value).toBe(5)
    expect(customField.campaign.entities.find((entity) => entity.id === 'dev:anna')?.customFields['dev:field:reputation']).toBe(4)
    expect(campaign.entities.find((entity) => entity.id === 'dev:vault')?.state[0].value).toBe(true)
  })

  it('проходит переносимую сериализацию и доменную проверку ссылок', () => {
    const campaign = createLogicTestCampaign(now)
    expect(parseCampaignFile(serializeCampaignFile(campaign))).toEqual(campaign)

    const broken = JSON.parse(serializeCampaignFile(campaign))
    const rule = broken.campaign.logicRules.find((item: { id: string }) => item.id === 'dev:rule:custom-field')
    rule.effects[0].value = 'не число'
    expect(() => parseCampaignFile(JSON.stringify(broken))).toThrow('ссылки на отсутствующие сущности')
  })
})
