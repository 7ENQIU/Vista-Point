import { describe, expect, it } from 'vitest'
import { createCampaign } from './createCampaign'
import { findSimilarPredicates } from './findSimilarPredicates'

describe('findSimilarPredicates', () => {
  const predicates = createCampaign({ name: 'Словарь' }).predicates

  it.each(['контролирует', 'Контралирует', 'контролируется'])('находит похожий предикат для «%s»', (query) => {
    expect(findSimilarPredicates(predicates, query).map((item) => item.systemType)).toContain('controls')
  })

  it('не предлагает совпадения для слишком короткой строки', () => {
    expect(findSimilarPredicates(predicates, 'на')).toEqual([])
  })
})
