import { ENTITY_TYPES, type Campaign, type CampaignEvent, type EntityType, type SavedGraphView } from './types'

export interface SavedGraphViewInput {
  name: string
  query: string
  entityTypes: EntityType[]
  customEntityTypeIds: string[]
}

export interface SavedGraphViewOptions {
  now?: Date
  viewId?: string
  eventId?: string
}

function normalizedName(name: string) {
  return name.trim().toLocaleLowerCase('ru-RU')
}

function assertUniqueName(campaign: Campaign, name: string, exceptId?: string) {
  if (campaign.savedGraphViews.some((view) => view.id !== exceptId && normalizedName(view.name) === normalizedName(name))) {
    throw new Error('Сохранённый вид с таким названием уже существует.')
  }
}

function normalizeFilters(campaign: Campaign, input: SavedGraphViewInput) {
  const entityTypes = ENTITY_TYPES.filter((type) => input.entityTypes.includes(type))
  const knownCustomTypeIds = new Set(campaign.customEntityTypes.map((type) => type.id))
  const customEntityTypeIds = [...new Set(input.customEntityTypeIds)]
  if (customEntityTypeIds.some((id) => !knownCustomTypeIds.has(id))) {
    throw new Error('Сохранённый вид ссылается на отсутствующий пользовательский тип.')
  }
  return { entityTypes, customEntityTypeIds }
}

function createEvent(campaign: Campaign, type: string, timestamp: string, payload: Record<string, unknown>, eventId?: string): CampaignEvent {
  return {
    id: eventId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    type,
    occurredAt: timestamp,
    worldTime: campaign.worldTime,
    source: 'user',
    sessionId: campaign.activeSessionId,
    relatedEntityIds: [],
    reversible: false,
    payload,
  }
}

export function createSavedGraphViewInCampaign(
  campaign: Campaign,
  input: SavedGraphViewInput,
  options: SavedGraphViewOptions = {},
): { campaign: Campaign; view: SavedGraphView; event: CampaignEvent } {
  const name = input.name.trim()
  if (!name) throw new Error('Название сохранённого вида обязательно.')
  assertUniqueName(campaign, name)
  const timestamp = (options.now ?? new Date()).toISOString()
  const filters = normalizeFilters(campaign, input)
  const view: SavedGraphView = {
    id: options.viewId ?? crypto.randomUUID(),
    campaignId: campaign.id,
    name,
    query: input.query.trim(),
    ...filters,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const event = createEvent(campaign, 'graph.view.created', timestamp, { viewId: view.id, viewName: view.name }, options.eventId)
  return {
    view,
    event,
    campaign: { ...campaign, savedGraphViews: [...campaign.savedGraphViews, view], eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}

export function renameSavedGraphViewInCampaign(
  campaign: Campaign,
  viewId: string,
  nameInput: string,
  options: Pick<SavedGraphViewOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; view: SavedGraphView; event?: CampaignEvent } {
  const existing = campaign.savedGraphViews.find((view) => view.id === viewId)
  if (!existing) throw new Error('Сохранённый вид не найден.')
  const name = nameInput.trim()
  if (!name) throw new Error('Название сохранённого вида обязательно.')
  assertUniqueName(campaign, name, viewId)
  if (name === existing.name) return { campaign, view: existing }
  const timestamp = (options.now ?? new Date()).toISOString()
  const view = { ...existing, name, updatedAt: timestamp }
  const event = createEvent(campaign, 'graph.view.renamed', timestamp, { viewId, previousName: existing.name, viewName: name }, options.eventId)
  return {
    view,
    event,
    campaign: { ...campaign, savedGraphViews: campaign.savedGraphViews.map((item) => item.id === viewId ? view : item), eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}

export function removeSavedGraphViewFromCampaign(
  campaign: Campaign,
  viewId: string,
  options: Pick<SavedGraphViewOptions, 'now' | 'eventId'> = {},
): { campaign: Campaign; view: SavedGraphView; event: CampaignEvent } {
  const view = campaign.savedGraphViews.find((item) => item.id === viewId)
  if (!view) throw new Error('Сохранённый вид не найден.')
  const timestamp = (options.now ?? new Date()).toISOString()
  const event = createEvent(campaign, 'graph.view.removed', timestamp, { viewId, viewName: view.name }, options.eventId)
  return {
    view,
    event,
    campaign: { ...campaign, savedGraphViews: campaign.savedGraphViews.filter((item) => item.id !== viewId), eventLog: [...campaign.eventLog, event], updatedAt: timestamp },
  }
}
