import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildCampaignGraph } from '../application/campaigns/buildCampaignGraph'
import { createLogicTestCampaign } from '../application/campaigns/createLogicTestCampaign'
import { updateEntityInCampaign } from '../domain/campaign/updateEntity'
import { GraphEntityPopover } from './GraphEntityPopover'
import { searchCampaignEntities } from './searchCampaignEntities'

describe('синхронные представления сущности', () => {
  it('после одного обновления граф, попап и библиотечный поиск читают одну актуальную запись', () => {
    const initial = createLogicTestCampaign(new Date('2026-08-26T10:00:00.000Z'))
    const anna = initial.entities.find((entity) => entity.id === 'dev:anna')!
    const result = updateEntityInCampaign(initial, anna.id, {
      name: 'Анна Северная',
      aliases: anna.aliases,
      summary: 'Обновлённая заметка для всех представлений.',
      description: anna.description,
      dmNotes: anna.dmNotes,
      image: anna.image,
      tags: anna.tags,
      characterTags: anna.characterTags,
    }, { now: new Date('2026-08-26T11:00:00.000Z'), eventId: 'event:anna:sync' })

    const graphEntity = buildCampaignGraph(result.campaign).nodes.find((node) => node.entity.id === anna.id)!.entity
    const searchEntity = searchCampaignEntities(result.campaign.entities, {
      query: 'обновлённая заметка',
      types: [],
    })[0].results[0].entity
    const popover = renderToStaticMarkup(createElement(GraphEntityPopover, {
      entity: graphEntity,
      incomingCount: 1,
      mutualCount: 0,
      onClose: () => undefined,
      onOpenEntity: () => undefined,
      outgoingCount: 1,
    }))

    expect(graphEntity).toBe(result.entity)
    expect(searchEntity).toBe(result.entity)
    expect(popover).toContain('Анна Северная')
    expect(popover).toContain('Обновлённая заметка для всех представлений.')
    expect(result.campaign.entities.filter((entity) => entity.id === anna.id)).toHaveLength(1)
  })
})
