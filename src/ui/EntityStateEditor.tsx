import { useState, type FormEvent } from 'react'
import {
  STATE_CATEGORIES,
  STATE_VALUE_TYPES,
  type CampaignEntity,
  type EntityStateVariable,
  type StateCategory,
  type StateValue,
  type StateValueType,
} from '../domain/campaign/types'
import type { SetEntityStateInput } from '../domain/campaign/setEntityState'
import { ru } from '../shared/i18n/ru'

interface EntityStateEditorProps {
  entity: CampaignEntity
  isSaving: boolean
  onRemove: (stateId: string) => Promise<void>
  onSave: (input: SetEntityStateInput) => Promise<void>
}

function displayValue(state: EntityStateVariable): string {
  if (state.valueType === 'boolean') return state.value ? ru.yes : ru.no
  return String(state.value)
}

function defaultRawValue(valueType: StateValueType): string {
  return valueType === 'boolean' ? 'true' : ''
}

function parseValue(valueType: StateValueType, rawValue: string): StateValue {
  if (valueType === 'boolean') return rawValue === 'true'
  if (valueType === 'integer') {
    if (!rawValue.trim() || !Number.isInteger(Number(rawValue))) {
      throw new Error('Введите целое число.')
    }
    return Number(rawValue)
  }
  if (valueType === 'decimal') {
    if (!rawValue.trim() || !Number.isFinite(Number(rawValue))) {
      throw new Error('Введите число.')
    }
    return Number(rawValue)
  }
  return rawValue
}

export function EntityStateEditor({ entity, isSaving, onRemove, onSave }: EntityStateEditorProps) {
  const [editingId, setEditingId] = useState('')
  const [confirmingRemovalId, setConfirmingRemovalId] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<StateCategory>('custom')
  const [valueType, setValueType] = useState<StateValueType>('text')
  const [rawValue, setRawValue] = useState('')
  const [localError, setLocalError] = useState('')

  function resetForm() {
    setEditingId('')
    setName('')
    setCategory('custom')
    setValueType('text')
    setRawValue('')
    setLocalError('')
  }

  function startEditing(state: EntityStateVariable) {
    setEditingId(state.id)
    setName(state.name)
    setCategory(state.category)
    setValueType(state.valueType)
    setRawValue(String(state.value))
    setLocalError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    try {
      await onSave({
        stateId: editingId || undefined,
        name,
        category,
        valueType,
        value: parseValue(valueType, rawValue),
      })
      resetForm()
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : ru.storageError)
    }
  }

  async function confirmRemoval(stateId: string) {
    setLocalError('')
    try {
      await onRemove(stateId)
      if (editingId === stateId) resetForm()
      setConfirmingRemovalId('')
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : ru.storageError)
    }
  }

  return (
    <section className="entity-state-card" aria-labelledby="entity-state-heading">
      <div className="entity-state-heading">
        <div>
          <p className="overline">State Layer</p>
          <h2 id="entity-state-heading">{ru.entityState}</h2>
        </div>
        <span>{entity.state.length}</span>
      </div>

      {entity.state.length === 0 ? (
        <p className="entity-state-empty">{ru.noEntityState}</p>
      ) : (
        <div className="entity-state-list">
          {entity.state.map((state) => (
            <article className="entity-state-row" key={state.id}>
              <div>
                <span>{ru.stateCategories[state.category]}</span>
                <strong>{state.name}</strong>
                <p>{displayValue(state)}</p>
              </div>
              {confirmingRemovalId === state.id ? (
                <div className="entity-state-confirm">
                  <button className="danger-link" disabled={isSaving} onClick={() => confirmRemoval(state.id)} type="button">
                    {ru.confirmDelete}
                  </button>
                  <button className="link-button" onClick={() => setConfirmingRemovalId('')} type="button">
                    {ru.cancel}
                  </button>
                </div>
              ) : (
                <div className="entity-state-actions">
                  <button className="link-button" onClick={() => startEditing(state)} type="button">{ru.edit}</button>
                  <button className="danger-link" onClick={() => setConfirmingRemovalId(state.id)} type="button">{ru.delete}</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <form className="entity-state-form" onSubmit={handleSubmit}>
        <h3>{editingId ? ru.editState : ru.addState}</h3>
        {localError && <p className="form-inline-error" role="alert">{localError}</p>}
        <label htmlFor="state-name">{ru.stateName}</label>
        <input id="state-name" onChange={(event) => setName(event.target.value)} value={name} />

        <div className="entity-editor-pair">
          <div>
            <label htmlFor="state-category">{ru.stateCategory}</label>
            <select id="state-category" onChange={(event) => setCategory(event.target.value as StateCategory)} value={category}>
              {STATE_CATEGORIES.map((item) => <option key={item} value={item}>{ru.stateCategories[item]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="state-value-type">{ru.stateValueType}</label>
            <select
              id="state-value-type"
              onChange={(event) => {
                const nextType = event.target.value as StateValueType
                setValueType(nextType)
                setRawValue(defaultRawValue(nextType))
              }}
              value={valueType}
            >
              {STATE_VALUE_TYPES.map((item) => <option key={item} value={item}>{ru.stateValueTypes[item]}</option>)}
            </select>
          </div>
        </div>

        <label htmlFor="state-value">{ru.stateValue}</label>
        {valueType === 'boolean' ? (
          <select id="state-value" onChange={(event) => setRawValue(event.target.value)} value={rawValue}>
            <option value="true">{ru.yes}</option>
            <option value="false">{ru.no}</option>
          </select>
        ) : (
          <input
            id="state-value"
            onChange={(event) => setRawValue(event.target.value)}
            step={valueType === 'integer' ? 1 : valueType === 'decimal' ? 'any' : undefined}
            type={valueType === 'integer' || valueType === 'decimal' ? 'number' : 'text'}
            value={rawValue}
          />
        )}

        <div className="entity-state-form-actions">
          <button className="button button-primary" disabled={isSaving} type="submit">
            {isSaving ? ru.saving : editingId ? ru.saveChanges : ru.addState}
          </button>
          {editingId && <button className="button button-ghost" onClick={resetForm} type="button">{ru.cancel}</button>}
        </div>
      </form>
    </section>
  )
}
