import { describe, expect, it } from 'vitest'
import { createCampaign } from './createCampaign'
import { addPredicateToCampaign } from './addPredicate'

describe('addPredicateToCampaign', () => {
  it('создаёт стабильный предикат и прослеживаемое событие', () => {
    const campaign = createCampaign({ name: 'Предикаты' }, new Date('2026-08-23T12:00:00.000Z'), 'c1')
    const result = addPredicateToCampaign(campaign, {
      directLabel: ' охраняет ', inverseLabel: ' охраняется ', directed: true,
    }, { predicateId: 'p1', eventId: 'event-p1', now: new Date('2026-08-23T13:00:00.000Z') })

    expect(result.predicate).toMatchObject({ id: 'p1', directLabel: 'охраняет', inverseLabel: 'охраняется', directed: true })
    expect(result.event).toMatchObject({ id: 'event-p1', type: 'predicate.created', relatedEntityIds: [], reversible: true })
    expect(result.campaign.predicates).toHaveLength(campaign.predicates.length + 1)
  })

  it('не допускает пустые и повторяющиеся названия', () => {
    const campaign = createCampaign({ name: 'Предикаты' })
    expect(() => addPredicateToCampaign(campaign, { directLabel: '', inverseLabel: '', directed: true })).toThrow('прямое и обратное')
    expect(() => addPredicateToCampaign(campaign, { directLabel: 'ЗНАЕТ', inverseLabel: 'Известен', directed: true })).toThrow('уже существует')
  })
})
