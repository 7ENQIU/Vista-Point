import { describe, expect, it } from 'vitest'
import { createCampaign } from './createCampaign'
import { createCustomEntityTypeInCampaign, removeCustomEntityTypeFromCampaign } from './customEntityTypes'
import { createSavedGraphViewInCampaign, removeSavedGraphViewFromCampaign, renameSavedGraphViewInCampaign } from './savedGraphViews'

describe('savedGraphViews', () => {
  it('сохраняет нормализованные фильтры и записывает событие', () => {
    const withType = createCustomEntityTypeInCampaign(createCampaign({ name: 'Виды' }), { name: 'Город', baseType: 'location' }, { typeId: 'city' }).campaign
    const result = createSavedGraphViewInCampaign(withType, {
      name: '  Города главы  ', query: '  порт  ', entityTypes: ['npc', 'location', 'npc'], customEntityTypeIds: ['city', 'city'],
    }, { viewId: 'view-1', eventId: 'event-1', now: new Date('2026-08-27T10:00:00.000Z') })

    expect(result.view).toMatchObject({ id: 'view-1', name: 'Города главы', query: 'порт', entityTypes: ['location', 'npc'], customEntityTypeIds: ['city'] })
    expect(result.event).toMatchObject({ id: 'event-1', type: 'graph.view.created', payload: { viewId: 'view-1', viewName: 'Города главы' } })
    expect(result.campaign.savedGraphViews).toEqual([result.view])
  })

  it('переименовывает и удаляет вид с историей', () => {
    const created = createSavedGraphViewInCampaign(createCampaign({ name: 'Виды' }), {
      name: 'Улики', query: '', entityTypes: ['clue'], customEntityTypeIds: [],
    }, { viewId: 'view-1' }).campaign
    const renamed = renameSavedGraphViewInCampaign(created, 'view-1', 'Улики главы', { eventId: 'rename' })
    const removed = removeSavedGraphViewFromCampaign(renamed.campaign, 'view-1', { eventId: 'remove' })

    expect(renamed.view.name).toBe('Улики главы')
    expect(renamed.event?.type).toBe('graph.view.renamed')
    expect(removed.campaign.savedGraphViews).toEqual([])
    expect(removed.event.type).toBe('graph.view.removed')
  })

  it('не допускает пустые, повторяющиеся и повреждённые определения', () => {
    const campaign = createCampaign({ name: 'Виды' })
    expect(() => createSavedGraphViewInCampaign(campaign, { name: ' ', query: '', entityTypes: [], customEntityTypeIds: [] })).toThrow('Название')
    expect(() => createSavedGraphViewInCampaign(campaign, { name: 'Вид', query: '', entityTypes: [], customEntityTypeIds: ['missing'] })).toThrow('отсутствующий')
    const created = createSavedGraphViewInCampaign(campaign, { name: 'Вид', query: '', entityTypes: [], customEntityTypeIds: [] }).campaign
    expect(() => createSavedGraphViewInCampaign(created, { name: ' вид ', query: '', entityTypes: [], customEntityTypeIds: [] })).toThrow('уже существует')
  })

  it('очищает удалённый пользовательский тип из сохранённых видов', () => {
    const withType = createCustomEntityTypeInCampaign(createCampaign({ name: 'Виды' }), { name: 'Город', baseType: 'location' }, { typeId: 'city' }).campaign
    const withView = createSavedGraphViewInCampaign(withType, { name: 'Города', query: '', entityTypes: [], customEntityTypeIds: ['city'] }, { viewId: 'view' }).campaign
    const removed = removeCustomEntityTypeFromCampaign(withView, 'city', { now: new Date('2026-08-27T12:00:00.000Z') })

    expect(removed.campaign.savedGraphViews[0].customEntityTypeIds).toEqual([])
    expect(removed.campaign.savedGraphViews[0].updatedAt).toBe('2026-08-27T12:00:00.000Z')
  })
})
