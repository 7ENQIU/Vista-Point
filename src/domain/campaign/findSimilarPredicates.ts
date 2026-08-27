import type { Predicate } from './types'

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/\s+/g, ' ')
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}

export function findSimilarPredicates(predicates: Predicate[], query: string): Predicate[] {
  const normalizedQuery = normalize(query)
  if (normalizedQuery.length < 3) return []
  return predicates.filter((predicate) => {
    if (predicate.status === 'archived') return false
    return [predicate.directLabel, predicate.inverseLabel].some((label) => {
      const normalizedLabel = normalize(label)
      return normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedLabel) ||
        editDistance(normalizedLabel, normalizedQuery) <= Math.max(1, Math.floor(Math.max(normalizedLabel.length, normalizedQuery.length) * 0.3))
    })
  }).slice(0, 4)
}
