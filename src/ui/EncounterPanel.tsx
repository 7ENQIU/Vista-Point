import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Campaign, EncounterSide } from '../domain/campaign/types'
import type { StartEncounterInput, UpdateEncounterParticipantInput } from '../domain/campaign/encounters'
import { ru } from '../shared/i18n/ru'

interface EncounterPanelProps {
  campaign: Campaign
  isSaving: boolean
  onAdvance: () => Promise<void>
  onComplete: (outcome: string) => Promise<void>
  onSetHp: (participantId: string, hp: number) => Promise<void>
  onStart: (input: StartEncounterInput) => Promise<void>
  onUpdateParticipant: (input: UpdateEncounterParticipantInput) => Promise<void>
}

export function EncounterPanel({ campaign, isSaving, onAdvance, onComplete, onSetHp, onStart, onUpdateParticipant }: EncounterPanelProps) {
  const session = campaign.sessions.find((item) => item.id === campaign.activeSessionId && item.status === 'active')
  const encounter = campaign.encounters.find((item) => item.id === campaign.activeEncounterId && item.status === 'active')
  const prepared = campaign.entities.filter((entity) => entity.type === 'encounter' && entity.status !== 'archived')
  const candidates = campaign.entities.filter((entity) => entity.status !== 'archived' && entity.type === 'npc')
  const names = useMemo(() => new Map(campaign.entities.map((entity) => [entity.id, entity.name])), [campaign.entities])
  const [encounterEntityId, setEncounterEntityId] = useState(prepared[0]?.id ?? '')
  const [participantIds, setParticipantIds] = useState<string[]>(session?.participantIds ?? [])
  const [outcome, setOutcome] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [localError, setLocalError] = useState('')
  useEffect(() => {
    if (session) setParticipantIds(session.participantIds)
  }, [session?.id])
  useEffect(() => {
    if (!encounterEntityId && prepared[0]) setEncounterEntityId(prepared[0].id)
  }, [prepared[0]?.id])
  if (!session) return null
  function toggle(id: string) { setParticipantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  async function start(event: FormEvent) { event.preventDefault(); setLocalError(''); try { await onStart({ encounterEntityId, participantEntityIds: participantIds }) } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) } }
  async function update(participantId: string, side: EncounterSide, initiative: number, conditions: string) { setLocalError(''); try { await onUpdateParticipant({ participantId, side, initiative, conditions: conditions.split(',') }) } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) } }
  async function complete() { setLocalError(''); try { await onComplete(outcome); setOutcome(''); setConfirming(false) } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) } }
  return <section className="encounter-panel" aria-labelledby="encounter-heading"><div className="encounter-heading"><div><p className="overline">Encounter</p><h3 id="encounter-heading">{ru.encounterMode}</h3></div>{encounter && <strong>{ru.round}: {encounter.round}</strong>}</div>{localError && <p className="form-inline-error" role="alert">{localError}</p>}
    {!encounter ? prepared.length ? <form className="encounter-start-form" onSubmit={start}><label>{ru.preparedEncounter}<select value={encounterEntityId} onChange={(event) => setEncounterEntityId(event.target.value)}>{prepared.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><fieldset className="session-participant-picker"><legend>{ru.encounterParticipants}</legend>{candidates.map((entity) => <label className="checkbox-field" key={entity.id}><input type="checkbox" checked={participantIds.includes(entity.id)} onChange={() => toggle(entity.id)} />{entity.name}</label>)}</fieldset><button className="button button-primary" disabled={isSaving || participantIds.length < 2}>{ru.startEncounter}</button></form> : <p>{ru.noPreparedEncounters}</p> : <><div className="encounter-turn-order">{encounter.participants.map((participant, index) => { const entity = campaign.entities.find((item) => item.id === participant.entityId)!; const hp = entity.state.find((state) => state.name.toLocaleLowerCase('ru-RU') === 'hp'); return <EncounterParticipantRow active={index === encounter.currentTurnIndex} hp={typeof hp?.value === 'number' ? hp.value : undefined} key={participant.id} name={names.get(participant.entityId) ?? ru.unknownEntity} participant={participant} saving={isSaving} onSetHp={onSetHp} onUpdate={update} /> })}</div><button className="button button-primary" disabled={isSaving} onClick={() => void onAdvance()} type="button">{ru.nextTurn}</button><label>{ru.encounterOutcome}<textarea rows={3} value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>{confirming ? <div className="logic-confirm"><p>{ru.completeEncounterConfirm}</p><button className="button button-primary" disabled={isSaving || !outcome.trim()} onClick={() => void complete()} type="button">{ru.completeEncounter}</button><button className="button button-ghost" onClick={() => setConfirming(false)} type="button">{ru.cancel}</button></div> : <button className="button button-ghost" onClick={() => setConfirming(true)} type="button">{ru.completeEncounter}</button>}</>}
  </section>
}

function EncounterParticipantRow({ active, hp, name, participant, saving, onSetHp, onUpdate }: { active: boolean; hp?: number; name: string; participant: Campaign['encounters'][number]['participants'][number]; saving: boolean; onSetHp: (id: string, hp: number) => Promise<void>; onUpdate: (id: string, side: EncounterSide, initiative: number, conditions: string) => Promise<void> }) {
  const [side, setSide] = useState(participant.side)
  const [initiative, setInitiative] = useState(participant.initiative)
  const [conditions, setConditions] = useState(participant.conditions.join(', '))
  const [hpValue, setHpValue] = useState(hp ?? 0)
  return <article className={active ? 'encounter-participant encounter-participant-active' : 'encounter-participant'}><strong>{name}{active ? ` · ${ru.currentTurn}` : ''}</strong><label>{ru.encounterSide}<select value={side} onChange={(event) => setSide(event.target.value as EncounterSide)}><option value="allies">{ru.encounterSides.allies}</option><option value="opponents">{ru.encounterSides.opponents}</option><option value="neutral">{ru.encounterSides.neutral}</option></select></label><label>{ru.initiative}<input type="number" value={initiative} onChange={(event) => setInitiative(Number(event.target.value))} /></label><label>HP<input type="number" value={hpValue} onChange={(event) => setHpValue(Number(event.target.value))} onBlur={() => void onSetHp(participant.id, hpValue)} /></label><label>{ru.conditions}<input value={conditions} onChange={(event) => setConditions(event.target.value)} placeholder="Через запятую" /></label><button className="button button-ghost" disabled={saving} onClick={() => void onUpdate(participant.id, side, initiative, conditions)} type="button">{ru.saveParticipant}</button></article>
}
