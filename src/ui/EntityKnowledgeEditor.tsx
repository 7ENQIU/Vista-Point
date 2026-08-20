import { useState, type FormEvent } from 'react'
import {
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_TRUTH_VALUES,
  type CampaignEntity,
  type KnowledgeRecord,
  type KnowledgeStatus,
  type KnowledgeTruth,
} from '../domain/campaign/types'
import type { SetKnowledgeInput } from '../domain/campaign/setKnowledge'
import { ru } from '../shared/i18n/ru'

interface EntityKnowledgeEditorProps {
  entities: CampaignEntity[]
  entity: CampaignEntity
  isSaving: boolean
  knowledge: KnowledgeRecord[]
  onRemove: (knowledgeId: string) => Promise<void>
  onSave: (input: SetKnowledgeInput) => Promise<void>
}

function subjectValue(knowledge: KnowledgeRecord): string {
  return knowledge.subjectType === 'party' ? 'party' : `entity:${knowledge.subjectEntityId}`
}

export function EntityKnowledgeEditor({
  entities,
  entity,
  isSaving,
  knowledge,
  onRemove,
  onSave,
}: EntityKnowledgeEditorProps) {
  const [editingId, setEditingId] = useState('')
  const [confirmingRemovalId, setConfirmingRemovalId] = useState('')
  const [subject, setSubject] = useState('party')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<KnowledgeStatus>('known')
  const [confidence, setConfidence] = useState(75)
  const [truth, setTruth] = useState<KnowledgeTruth>('unknown')
  const [source, setSource] = useState('')
  const [relatedEntityIds, setRelatedEntityIds] = useState<string[]>([entity.id])
  const [localError, setLocalError] = useState('')
  const entityNames = new Map(entities.map((item) => [item.id, item.name]))

  function resetForm() {
    setEditingId('')
    setSubject('party')
    setContent('')
    setStatus('known')
    setConfidence(75)
    setTruth('unknown')
    setSource('')
    setRelatedEntityIds([entity.id])
    setLocalError('')
  }

  function startEditing(record: KnowledgeRecord) {
    setEditingId(record.id)
    setSubject(subjectValue(record))
    setContent(record.content)
    setStatus(record.status)
    setConfidence(record.confidence)
    setTruth(record.truth)
    setSource(record.source)
    setRelatedEntityIds(record.relatedEntityIds)
    setLocalError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    const [subjectType, subjectEntityId] = subject.startsWith('entity:')
      ? ['entity' as const, subject.slice('entity:'.length)]
      : ['party' as const, undefined]
    try {
      await onSave({
        knowledgeId: editingId || undefined,
        subjectType,
        subjectEntityId,
        content,
        status,
        confidence,
        truth,
        source,
        relatedEntityIds,
      })
      resetForm()
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : ru.storageError)
    }
  }

  async function confirmRemoval(knowledgeId: string) {
    setLocalError('')
    try {
      await onRemove(knowledgeId)
      if (editingId === knowledgeId) resetForm()
      setConfirmingRemovalId('')
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : ru.storageError)
    }
  }

  return (
    <section className="entity-knowledge-card" aria-labelledby="entity-knowledge-heading">
      <div className="entity-knowledge-heading">
        <div>
          <p className="overline">Knowledge State</p>
          <h2 id="entity-knowledge-heading">{ru.entityKnowledge}</h2>
        </div>
        <span>{knowledge.length}</span>
      </div>

      {knowledge.length === 0 ? (
        <p className="entity-knowledge-empty">{ru.noEntityKnowledge}</p>
      ) : (
        <div className="entity-knowledge-list">
          {knowledge.map((record) => (
            <article className="entity-knowledge-row" key={record.id}>
              <div className="entity-knowledge-meta">
                <span>{record.subjectType === 'party' ? ru.party : entityNames.get(record.subjectEntityId!) ?? ru.unknownEntity}</span>
                <span>{ru.knowledgeStatuses[record.status]}</span>
                <span>{record.confidence}%</span>
              </div>
              <p>{record.content}</p>
              <small>
                {ru.knowledgeTruthLabel}: {ru.knowledgeTruth[record.truth]}
                {record.source ? ` · ${ru.knowledgeSource}: ${record.source}` : ''}
              </small>
              {confirmingRemovalId === record.id ? (
                <div className="entity-knowledge-actions">
                  <button className="danger-link" disabled={isSaving} onClick={() => confirmRemoval(record.id)} type="button">{ru.confirmDelete}</button>
                  <button className="link-button" onClick={() => setConfirmingRemovalId('')} type="button">{ru.cancel}</button>
                </div>
              ) : (
                <div className="entity-knowledge-actions">
                  <button className="link-button" onClick={() => startEditing(record)} type="button">{ru.edit}</button>
                  <button className="danger-link" onClick={() => setConfirmingRemovalId(record.id)} type="button">{ru.delete}</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <form className="entity-knowledge-form" onSubmit={handleSubmit}>
        <h3>{editingId ? ru.editKnowledge : ru.addKnowledge}</h3>
        <p className="form-hint">{ru.knowledgeSeparationHint}</p>
        {localError && <p className="form-inline-error" role="alert">{localError}</p>}

        <label htmlFor="knowledge-subject">{ru.knowledgeSubject}</label>
        <select id="knowledge-subject" onChange={(event) => setSubject(event.target.value)} value={subject}>
          <option value="party">{ru.party}</option>
          <optgroup label={ru.entities}>
            {entities.map((item) => <option key={item.id} value={`entity:${item.id}`}>{item.name}</option>)}
          </optgroup>
        </select>

        <label htmlFor="knowledge-content">{ru.knowledgeContent}</label>
        <textarea id="knowledge-content" onChange={(event) => setContent(event.target.value)} rows={4} value={content} />

        <div className="entity-editor-pair">
          <div>
            <label htmlFor="knowledge-status">{ru.knowledgeStatus}</label>
            <select id="knowledge-status" onChange={(event) => setStatus(event.target.value as KnowledgeStatus)} value={status}>
              {KNOWLEDGE_STATUSES.map((item) => <option key={item} value={item}>{ru.knowledgeStatuses[item]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="knowledge-confidence">{ru.knowledgeConfidence}</label>
            <input
              id="knowledge-confidence"
              max={100}
              min={0}
              onChange={(event) => setConfidence(Number(event.target.value))}
              step={1}
              type="number"
              value={confidence}
            />
          </div>
        </div>

        <label htmlFor="knowledge-truth">{ru.knowledgeTruthLabel}</label>
        <select id="knowledge-truth" onChange={(event) => setTruth(event.target.value as KnowledgeTruth)} value={truth}>
          {KNOWLEDGE_TRUTH_VALUES.map((item) => <option key={item} value={item}>{ru.knowledgeTruth[item]}</option>)}
        </select>

        <label htmlFor="knowledge-source">{ru.knowledgeSource}</label>
        <input id="knowledge-source" onChange={(event) => setSource(event.target.value)} value={source} />

        <div className="entity-knowledge-form-actions">
          <button className="button button-primary" disabled={isSaving} type="submit">
            {isSaving ? ru.saving : editingId ? ru.saveChanges : ru.addKnowledge}
          </button>
          {editingId && <button className="button button-ghost" onClick={resetForm} type="button">{ru.cancel}</button>}
        </div>
      </form>
    </section>
  )
}
