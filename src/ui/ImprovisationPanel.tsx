import { useState, type FormEvent } from 'react'
import { getImprovisationQueue } from '../domain/campaign/improvisation'
import { ENTITY_TYPES, type Campaign, type EntityType } from '../domain/campaign/types'
import { formatCampaignDateTime } from '../domain/campaign/calendar'
import { ru } from '../shared/i18n/ru'

interface ImprovisationPanelProps {
  campaign: Campaign
  isSaving: boolean
  onCreate: (input: { type: EntityType; name: string; summary?: string }) => Promise<void>
  onOpenEntity: (id: string) => void
  onProcessed: (id: string) => Promise<void>
}

export function ImprovisationPanel({ campaign, isSaving, onCreate, onOpenEntity, onProcessed }: ImprovisationPanelProps) {
  const queue = getImprovisationQueue(campaign)
  const [type, setType] = useState<EntityType>('npc')
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [localError, setLocalError] = useState('')
  async function create(event: FormEvent) {
    event.preventDefault(); setLocalError('')
    try { await onCreate({ type, name, summary }); setName(''); setSummary('') }
    catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }
  async function processed(id: string) {
    setLocalError('')
    try { await onProcessed(id) } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }
  return <section className="improvisation-section" aria-labelledby="improvisation-heading">
    <div className="improvisation-heading"><div><p className="overline">Quick Create</p><h2 id="improvisation-heading">{ru.improvisationQueue}</h2><p>{ru.improvisationHint}</p></div><span>{queue.length}</span></div>
    {localError && <p className="form-inline-error" role="alert">{localError}</p>}
    <div className="improvisation-grid">
      {campaign.activeSessionId ? <form className="improvisation-form" onSubmit={create}><h3>{ru.createDuringSession}</h3><label htmlFor="quick-entity-type">{ru.entityType}</label><select id="quick-entity-type" value={type} onChange={(event) => setType(event.target.value as EntityType)}>{ENTITY_TYPES.map((item) => <option key={item} value={item}>{ru.entityTypes[item]}</option>)}</select><label htmlFor="quick-entity-name">{ru.entityName}</label><input id="quick-entity-name" value={name} onChange={(event) => setName(event.target.value)} /><label htmlFor="quick-entity-summary">{ru.entitySummary}</label><input id="quick-entity-summary" value={summary} onChange={(event) => setSummary(event.target.value)} /><button className="button button-primary" disabled={isSaving || !name.trim()}>{ru.quickSave}</button></form> : <p className="entity-empty">{ru.quickCreateNeedsSession}</p>}
      <div className="improvisation-queue"><h3>{ru.needsProcessing}</h3>{queue.length ? queue.map((entity) => <article key={entity.id}><div><button className="link-button" onClick={() => onOpenEntity(entity.id)} type="button">{entity.name}</button><p>{ru.entityTypes[entity.type]} · {entity.summary || ru.noEntitySummary}</p><small>{formatCampaignDateTime(entity.origin.worldTime, campaign.calendar)}</small></div><button className="button button-ghost" disabled={isSaving} onClick={() => void processed(entity.id)} type="button">{ru.markProcessed}</button></article>) : <p>{ru.queueEmpty}</p>}</div>
    </div>
  </section>
}
