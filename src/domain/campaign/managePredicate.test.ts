import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { addPredicateToCampaign } from './addPredicate'
import { addRelationshipToCampaign } from './addRelationship'
import { createCampaign } from './createCampaign'
import { archivePredicateInCampaign, updatePredicateInCampaign } from './managePredicate'

function campaignWithPredicate() {
  const campaign = createCampaign({ name: 'Словарь' }, new Date('2026-08-23T10:00:00Z'), 'c1')
  return addPredicateToCampaign(campaign, { directLabel: 'охраняет', inverseLabel: 'охраняется', directed: true }, { predicateId: 'p1' }).campaign
}

describe('managePredicate', () => {
  it('переименовывает пользовательский предикат без изменения фактов', () => {
    const campaign = campaignWithPredicate()
    const result = updatePredicateInCampaign(campaign, 'p1', { directLabel: 'защищает', inverseLabel: 'защищается' }, { eventId: 'update-p1' })
    expect(result.predicate).toMatchObject({ id: 'p1', directLabel: 'защищает', inverseLabel: 'защищается' })
    expect(result.event).toMatchObject({ id: 'update-p1', type: 'predicate.updated', reversible: true })
  })

  it('защищает встроенные и используемые предикаты от архивирования', () => {
    let campaign = campaignWithPredicate()
    campaign = addEntityToCampaign(campaign, { type: 'npc', name: 'Анна' }, { entityId: 'e1' }).campaign
    campaign = addEntityToCampaign(campaign, { type: 'location', name: 'Башня' }, { entityId: 'e2' }).campaign
    campaign = addRelationshipToCampaign(campaign, { sourceId: 'e1', targetId: 'e2', predicateId: 'p1' }).campaign
    expect(() => archivePredicateInCampaign(campaign, 'p1')).toThrow('Сначала отмените факты')
    expect(() => archivePredicateInCampaign(campaign, 'builtin:knows')).toThrow('Встроенный')
  })

  it('архивирует неиспользуемый пользовательский предикат с событием', () => {
    const result = archivePredicateInCampaign(campaignWithPredicate(), 'p1', { eventId: 'archive-p1' })
    expect(result.predicate.status).toBe('archived')
    expect(result.event).toMatchObject({ id: 'archive-p1', type: 'predicate.archived', reversible: true })
  })
})
