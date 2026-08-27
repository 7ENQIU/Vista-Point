import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { buildSessionView } from '../application/campaigns/buildSessionView'
import { buildPostSessionSummary } from '../application/campaigns/buildPostSessionSummary'
import type { StartSessionInput, UpdateSessionContextInput, AddSessionEventInput } from '../domain/campaign/sessions'
import type { ResolveSceneCheckInput, SceneCheckMode } from '../domain/campaign/sceneChecks'
import type { Campaign } from '../domain/campaign/types'
import { formatCampaignDateTime } from '../domain/campaign/calendar'
import { describeCampaignEvent } from './CampaignEventLog'
import { ru } from '../shared/i18n/ru'

interface SessionModeProps {
  campaign: Campaign
  isSaving: boolean
  onAddEvent: (input: AddSessionEventInput) => Promise<void>
  onComplete: (summary: string) => Promise<void>
  onOpenEntity: (entityId: string) => void
  onResolveCheck: (input: ResolveSceneCheckInput) => Promise<void>
  onStart: (input: StartSessionInput) => Promise<void>
  onUpdateContext: (input: UpdateSessionContextInput) => Promise<void>
}

export function SessionMode({ campaign, isSaving, onAddEvent, onComplete, onOpenEntity, onResolveCheck, onStart, onUpdateContext }: SessionModeProps) {
  const scenes = campaign.entities.filter((entity) => entity.type === 'scene' && entity.status !== 'archived')
  const activeEntities = campaign.entities.filter((entity) => entity.status !== 'archived')
  const view = useMemo(() => buildSessionView(campaign), [campaign])
  const [name, setName] = useState('')
  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? '')
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [manualEvent, setManualEvent] = useState('')
  const [checkName, setCheckName] = useState('')
  const [checkDifficulty, setCheckDifficulty] = useState(10)
  const [checkModifier, setCheckModifier] = useState(0)
  const [checkMode, setCheckMode] = useState<SceneCheckMode>('roll')
  const [manualTotal, setManualTotal] = useState(10)
  const [checkActorId, setCheckActorId] = useState('')
  const [summary, setSummary] = useState('')
  const [confirmingFinish, setConfirmingFinish] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (view) {
      setSceneId(view.session.currentSceneId)
      setParticipantIds(view.session.participantIds)
    } else if (!sceneId && scenes[0]) setSceneId(scenes[0].id)
  }, [view?.session.id, scenes[0]?.id])

  function toggleParticipant(id: string) {
    setParticipantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function start(event: FormEvent) {
    event.preventDefault(); setLocalError('')
    try { await onStart({ name, sceneId, participantIds }); setName('') } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  async function updateContext() {
    setLocalError('')
    try { await onUpdateContext({ sceneId, participantIds }) } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  async function addEvent(event: FormEvent) {
    event.preventDefault(); setLocalError('')
    try { await onAddEvent({ description: manualEvent, relatedEntityIds: participantIds }); setManualEvent('') } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  async function resolveCheck(event: FormEvent) {
    event.preventDefault(); setLocalError('')
    try {
      await onResolveCheck({ name: checkName, difficulty: checkDifficulty, modifier: checkModifier, mode: checkMode, manualTotal: checkMode === 'manual' ? manualTotal : undefined, actorId: checkActorId || undefined })
      setCheckName('')
    } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  async function complete() {
    setLocalError('')
    try { await onComplete(summary); setSummary(''); setConfirmingFinish(false); setParticipantIds([]) } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  const participantChoices = activeEntities.filter((entity) => entity.id !== sceneId && entity.type === 'npc')
  if (!view) return (
    <section className="session-section" aria-labelledby="session-heading">
      <div className="session-heading"><div><p className="overline">Runtime Layer</p><h2 id="session-heading">{ru.sessionModeTitle}</h2><p>{ru.sessionModeHint}</p></div></div>
      {localError && <p className="form-inline-error" role="alert">{localError}</p>}
      {scenes.length === 0 ? <p className="entity-empty">{ru.noPreparedScenes}</p> : <form className="session-start-form" onSubmit={start}>
        <label htmlFor="session-name">{ru.sessionName}</label><input id="session-name" onChange={(event) => setName(event.target.value)} placeholder="Например, Встреча у маяка" value={name} />
        <label htmlFor="session-scene">{ru.currentScene}</label><select id="session-scene" onChange={(event) => { setSceneId(event.target.value); setParticipantIds([]) }} value={sceneId}>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select>
        <fieldset className="session-participant-picker"><legend>{ru.sessionParticipants}</legend>{participantChoices.map((entity) => <label className="checkbox-field" key={entity.id}><input checked={participantIds.includes(entity.id)} onChange={() => toggleParticipant(entity.id)} type="checkbox" />{entity.name} · {ru.entityTypes[entity.type]}</label>)}</fieldset>
        <button className="button button-primary" disabled={isSaving || !sceneId} type="submit">{ru.startSession}</button>
      </form>}
    </section>
  )

  return (
    <section className="session-section session-active" aria-labelledby="session-heading">
      <div className="session-heading"><div><p className="overline">Runtime Layer · {view.session.name}</p><h2 id="session-heading">{ru.sessionModeTitle}</h2><p>{ru.sessionModeHint}</p></div><span>{ru.worldTime}: {formatCampaignDateTime(campaign.worldTime, campaign.calendar)}</span></div>
      {localError && <p className="form-inline-error" role="alert">{localError}</p>}
      <div className="session-grid">
        <aside className="session-context-panel">
          <h3>{ru.currentScene}</h3>
          <label htmlFor="active-session-scene">{ru.currentScene}</label><select id="active-session-scene" onChange={(event) => { setSceneId(event.target.value); setParticipantIds([]) }} value={sceneId}>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select>
          <fieldset className="session-participant-picker"><legend>{ru.sessionParticipants}</legend>{participantChoices.map((entity) => <label className="checkbox-field" key={entity.id}><input checked={participantIds.includes(entity.id)} onChange={() => toggleParticipant(entity.id)} type="checkbox" />{entity.name}</label>)}</fieldset>
          <button className="button button-ghost" disabled={isSaving} onClick={updateContext} type="button">{ru.saveSessionContext}</button>
          {view.location && <div className="session-location"><span>{ru.sceneLocation}</span><button className="link-button" onClick={() => onOpenEntity(view.location!.id)} type="button">{view.location.name}</button></div>}
        </aside>

        <main className="dm-screen">
          <p className="overline">{ru.dmScreen}</p><h3>{view.scene.name}</h3><p>{view.scene.description || view.scene.summary || ru.noEntitySummary}</p>
          <div className="dm-card-grid">{view.participants.map((entity) => <article className="dm-card" key={entity.id}><button className="link-button" onClick={() => onOpenEntity(entity.id)} type="button">{entity.name}</button><p>{entity.summary || ru.noEntitySummary}</p>{entity.characterTags.length > 0 && <div className="entity-character-tags">{entity.characterTags.map((tag) => <span key={tag}>{tag}</span>)}</div>}{entity.state.length > 0 && <dl>{entity.state.map((state) => <div key={state.id}><dt>{state.name}</dt><dd>{typeof state.value === 'boolean' ? state.value ? ru.yes : ru.no : String(state.value)}</dd></div>)}</dl>}</article>)}</div>
          {view.relatedEntities.length > 0 && <div className="session-related"><h4>{ru.relatedSceneEntities}</h4>{view.relatedEntities.map((entity) => <button className="entity-chip" key={entity.id} onClick={() => onOpenEntity(entity.id)} type="button">{entity.name}</button>)}</div>}
          <form className="scene-check-form" onSubmit={resolveCheck}><h4>{ru.quickSceneCheck}</h4><label htmlFor="check-name">{ru.checkName}</label><input id="check-name" value={checkName} onChange={(event) => setCheckName(event.target.value)} placeholder="Например, заметить засаду" /><div className="scene-check-fields"><label>{ru.checkDifficulty}<input type="number" min="1" max="100" value={checkDifficulty} onChange={(event) => setCheckDifficulty(Number(event.target.value))} /></label><label>{ru.checkModifier}<input type="number" min="-100" max="100" value={checkModifier} onChange={(event) => setCheckModifier(Number(event.target.value))} /></label><label>{ru.checkMode}<select value={checkMode} onChange={(event) => setCheckMode(event.target.value as SceneCheckMode)}><option value="roll">{ru.localD20Roll}</option><option value="manual">{ru.manualCheckResult}</option></select></label></div><label>{ru.checkActor}<select value={checkActorId} onChange={(event) => setCheckActorId(event.target.value)}><option value="">{ru.withoutActor}</option>{view.participants.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>{checkMode === 'manual' && <label>{ru.manualTotal}<input type="number" value={manualTotal} onChange={(event) => setManualTotal(Number(event.target.value))} /></label>}<button className="button button-primary" disabled={isSaving || !checkName.trim()}>{ru.resolveCheck}</button></form>
          <form className="session-event-form" onSubmit={addEvent}><label htmlFor="session-event">{ru.sessionEventDescription}</label><textarea id="session-event" onChange={(event) => setManualEvent(event.target.value)} rows={3} value={manualEvent} /><button className="button button-primary" disabled={isSaving || !manualEvent.trim()} type="submit">{ru.addSessionEvent}</button></form>
        </main>

        <aside className="session-insights-panel">
          <div><h3>{ru.sceneRules}</h3>{view.rules.length ? view.rules.map((item) => <p className={item.satisfied ? 'logic-pass' : 'logic-fail'} key={item.rule.id}>{item.rule.name}: {item.explanation}</p>) : <p>{ru.noSceneContext}</p>}</div>
          <div><h3>{ru.sceneKnowledge}</h3>{view.knowledge.length ? view.knowledge.map((item) => <p key={item.id}>{item.content}</p>) : <p>{ru.noSceneContext}</p>}</div>
          <div><h3>{ru.sessionTimeline}</h3>{view.timeline.length ? <ol className="session-timeline">{view.timeline.map((event) => { const description = describeCampaignEvent(event, campaign.calendar); return <li key={event.id}><time>{new Date(event.occurredAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time><span><strong>{description.title}</strong>{description.detail}</span></li> })}</ol> : <p>{ru.noSessionTimeline}</p>}</div>
          <label htmlFor="session-summary">{ru.sessionSummary}</label><button className="button button-ghost" onClick={() => setSummary(buildPostSessionSummary(campaign))} type="button">{ru.buildSummaryDraft}</button><textarea id="session-summary" onChange={(event) => setSummary(event.target.value)} rows={10} value={summary} />
          {confirmingFinish ? <div className="logic-confirm"><p>{ru.finishSessionQuestion}</p><button className="button button-primary" disabled={isSaving} onClick={complete} type="button">{ru.finishSession}</button><button className="button button-ghost" onClick={() => setConfirmingFinish(false)} type="button">{ru.cancel}</button></div> : <button className="button button-ghost" onClick={() => setConfirmingFinish(true)} type="button">{ru.finishSession}</button>}
        </aside>
      </div>
    </section>
  )
}
