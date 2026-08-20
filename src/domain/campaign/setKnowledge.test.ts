import { describe, expect, it } from 'vitest'
import { addEntityToCampaign } from './addEntity'
import { createCampaign } from './createCampaign'
import { removeKnowledgeFromCampaign, setKnowledgeInCampaign } from './setKnowledge'

function preparedCampaign() {
  const campaign = createCampaign({ name: 'Знания' }, new Date('2026-08-20T00:00:00Z'), 'c1')
  return addEntityToCampaign(campaign, { type: 'npc', name: 'Серёга' }, { entityId: 'e1' }).campaign
}

describe('setKnowledgeInCampaign', () => {
  it('создаёт знание партии отдельно от сущности и записывает событие', () => {
    const campaign = preparedCampaign()
    const result = setKnowledgeInCampaign(campaign, {
      subjectType: 'party',
      content: 'Серёга хранит ключ.',
      status: 'known',
      confidence: 80,
      truth: 'true',
      source: 'Разговор в порту',
      relatedEntityIds: ['e1'],
    }, { knowledgeId: 'k1', eventId: 'ev1', now: new Date('2026-08-20T01:00:00Z') })

    expect(result.knowledge).toMatchObject({ id: 'k1', subjectType: 'party', status: 'known' })
    expect(result.event).toMatchObject({ id: 'ev1', type: 'knowledge.created', relatedEntityIds: ['e1'] })
    expect(result.campaign.entities).toEqual(campaign.entities)
    expect(result.campaign.knowledge).toHaveLength(1)
  })

  it('обновляет запись и не создаёт событие без изменений', () => {
    const first = setKnowledgeInCampaign(preparedCampaign(), {
      subjectType: 'party', content: 'Слух', status: 'suspected', confidence: 40,
      truth: 'unknown', relatedEntityIds: ['e1'],
    }, { knowledgeId: 'k1', eventId: 'ev1' })
    const updated = setKnowledgeInCampaign(first.campaign, {
      knowledgeId: 'k1', subjectType: 'party', content: 'Слух', status: 'confirmed',
      confidence: 100, truth: 'true', relatedEntityIds: ['e1'],
    }, { eventId: 'ev2' })
    const unchanged = setKnowledgeInCampaign(updated.campaign, {
      knowledgeId: 'k1', subjectType: 'party', content: 'Слух', status: 'confirmed',
      confidence: 100, truth: 'true', relatedEntityIds: ['e1'],
    })

    expect(updated.event?.type).toBe('knowledge.updated')
    expect(updated.knowledge.status).toBe('confirmed')
    expect(unchanged.changed).toBe(false)
    expect(unchanged.campaign).toBe(updated.campaign)
  })

  it('проверяет субъект, уверенность и связанные сущности', () => {
    const campaign = preparedCampaign()
    expect(() => setKnowledgeInCampaign(campaign, {
      subjectType: 'entity', content: 'Факт', status: 'known', confidence: 50,
      truth: 'true', relatedEntityIds: ['e1'],
    })).toThrow('Субъект знания')
    expect(() => setKnowledgeInCampaign(campaign, {
      subjectType: 'party', content: 'Факт', status: 'known', confidence: 101,
      truth: 'true', relatedEntityIds: ['e1'],
    })).toThrow('от 0 до 100')
  })

  it('удаляет знание с обратимым событием', () => {
    const created = setKnowledgeInCampaign(preparedCampaign(), {
      subjectType: 'party', content: 'Слух', status: 'known', confidence: 70,
      truth: 'false', relatedEntityIds: ['e1'],
    }, { knowledgeId: 'k1' })
    const removed = removeKnowledgeFromCampaign(created.campaign, 'k1', { eventId: 'ev-remove' })

    expect(removed.campaign.knowledge).toEqual([])
    expect(removed.event).toMatchObject({ id: 'ev-remove', type: 'knowledge.removed', reversible: true })
  })
})
