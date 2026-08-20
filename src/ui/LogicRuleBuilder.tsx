import { useMemo, useState, type FormEvent } from 'react'
import {
  type Campaign,
  type CampaignEntity,
  type LogicConditionField,
  type LogicConditionOperator,
  type LogicEffectType,
  type LogicGroupOperator,
  type LogicRule,
  type StateValue,
} from '../domain/campaign/types'
import { previewLogicRule, type SetLogicRuleInput } from '../domain/campaign/logicRules'
import { ru } from '../shared/i18n/ru'

interface LogicRuleBuilderProps {
  campaign: Campaign
  isSaving: boolean
  onApply: (ruleId: string) => Promise<void>
  onRemove: (ruleId: string) => Promise<void>
  onSave: (input: SetLogicRuleInput) => Promise<void>
}

interface ConditionDraft {
  key: string
  id?: string
  entityId: string
  field: LogicConditionField
  stateId: string
  operator: LogicConditionOperator
  value: string
}

interface EffectDraft {
  key: string
  id?: string
  entityId: string
  type: LogicEffectType
  stateId: string
  value: string
}

function key() { return crypto.randomUUID() }

function firstEntity(entities: CampaignEntity[]) { return entities[0]?.id ?? '' }

function conditionDraft(entities: CampaignEntity[]): ConditionDraft {
  return { key: key(), entityId: firstEntity(entities), field: 'lifecycle_status', stateId: '', operator: 'equals', value: 'active' }
}

function effectDraft(entities: CampaignEntity[]): EffectDraft {
  return { key: key(), entityId: firstEntity(entities), type: 'set_lifecycle_status', stateId: '', value: 'active' }
}

function parseStateValue(entity: CampaignEntity | undefined, stateId: string, raw: string): StateValue {
  const state = entity?.state.find((item) => item.id === stateId)
  if (state?.valueType === 'boolean') return raw === 'true'
  if (state?.valueType === 'integer' || state?.valueType === 'decimal') return Number(raw)
  return raw
}

function valueControl(
  entity: CampaignEntity | undefined,
  stateId: string,
  value: string,
  onChange: (value: string) => void,
) {
  const state = entity?.state.find((item) => item.id === stateId)
  if (state?.valueType === 'boolean') return (
    <select onChange={(event) => onChange(event.target.value)} value={value || 'true'}>
      <option value="true">{ru.yes}</option><option value="false">{ru.no}</option>
    </select>
  )
  return <input onChange={(event) => onChange(event.target.value)} step={state?.valueType === 'integer' ? 1 : 'any'} type={state && ['integer', 'decimal'].includes(state.valueType) ? 'number' : 'text'} value={value} />
}

export function LogicRuleBuilder({ campaign, isSaving, onApply, onRemove, onSave }: LogicRuleBuilderProps) {
  const entities = campaign.entities.filter((entity) => entity.status !== 'archived')
  const [editingId, setEditingId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [groupOperator, setGroupOperator] = useState<LogicGroupOperator>('all')
  const [executionMode, setExecutionMode] = useState<'require_confirmation' | 'suggest_only'>('require_confirmation')
  const [conditions, setConditions] = useState<ConditionDraft[]>(() => [conditionDraft(entities)])
  const [effects, setEffects] = useState<EffectDraft[]>(() => [effectDraft(entities)])
  const [localError, setLocalError] = useState('')
  const [expandedRuleId, setExpandedRuleId] = useState('')
  const [confirmingRuleId, setConfirmingRuleId] = useState('')
  const [removingRuleId, setRemovingRuleId] = useState('')
  const entityById = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities])

  function resetForm() {
    setEditingId(''); setName(''); setDescription(''); setEnabled(true); setGroupOperator('all')
    setExecutionMode('require_confirmation'); setConditions([conditionDraft(entities)]); setEffects([effectDraft(entities)]); setLocalError('')
  }

  function startEditing(rule: LogicRule) {
    setEditingId(rule.id); setName(rule.name); setDescription(rule.description); setEnabled(rule.enabled)
    setGroupOperator(rule.groupOperator); setExecutionMode(rule.executionMode)
    setConditions(rule.conditions.map((item) => ({
      key: key(), id: item.id, entityId: item.entityId, field: item.field, stateId: item.stateId ?? '', operator: item.operator,
      value: item.value === undefined ? '' : String(item.value),
    })))
    setEffects(rule.effects.map((item) => ({
      key: key(), id: item.id, entityId: item.entityId, type: item.type, stateId: item.stateId ?? '', value: String(item.value),
    })))
    setLocalError('')
  }

  function updateCondition(index: number, patch: Partial<ConditionDraft>) {
    setConditions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  function updateEffect(index: number, patch: Partial<EffectDraft>) {
    setEffects((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLocalError('')
    try {
      await onSave({
        ruleId: editingId || undefined, name, description, enabled, groupOperator, executionMode,
        conditions: conditions.map((item) => ({
          id: item.id, entityId: item.entityId, field: item.field, stateId: item.field === 'state' ? item.stateId : undefined,
          operator: item.operator,
          value: ['exists', 'not_exists'].includes(item.operator) ? undefined : item.field === 'state'
            ? parseStateValue(entityById.get(item.entityId), item.stateId, item.value) : item.value,
        })),
        effects: effects.map((item) => ({
          id: item.id, entityId: item.entityId, type: item.type, stateId: item.type === 'set_state' ? item.stateId : undefined,
          value: item.type === 'set_state' ? parseStateValue(entityById.get(item.entityId), item.stateId, item.value) : item.value,
        })),
      })
      resetForm()
    } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  async function apply(ruleId: string) {
    setLocalError('')
    try { await onApply(ruleId); setConfirmingRuleId('') } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  async function remove(ruleId: string) {
    setLocalError('')
    try { await onRemove(ruleId); setRemovingRuleId(''); if (editingId === ruleId) resetForm() } catch (caught) { setLocalError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  return (
    <section className="logic-workspace" aria-labelledby="logic-builder-heading">
      <div className="logic-heading">
        <div><p className="overline">Logic Layer</p><h2 id="logic-builder-heading">{ru.logicBuilder}</h2><p>{ru.logicBuilderHint}</p></div>
        <span>{campaign.logicRules.length}</span>
      </div>
      {localError && <p className="form-inline-error" role="alert">{localError}</p>}

      <div className="logic-layout">
        <div className="logic-rule-list">
          {campaign.logicRules.length === 0 ? <p className="entity-empty">{ru.noLogicRules}</p> : campaign.logicRules.map((rule) => {
            const preview = previewLogicRule(campaign, rule)
            const expanded = expandedRuleId === rule.id
            return <article className="logic-rule-card" key={rule.id}>
              <div className="logic-rule-summary">
                <div><h3>{rule.name}</h3><p>{rule.description || ru.logicBuilderHint}</p></div>
                <span className={preview.evaluation.satisfied ? 'logic-pass' : 'logic-fail'}>{preview.evaluation.satisfied ? ru.conditionsMet : ru.conditionsNotMet}</span>
              </div>
              <div className="logic-rule-actions">
                <button className="link-button" onClick={() => setExpandedRuleId(expanded ? '' : rule.id)} type="button">{ru.evaluateRule}</button>
                <button className="link-button" onClick={() => startEditing(rule)} type="button">{ru.edit}</button>
                <button className="danger-link" onClick={() => setRemovingRuleId(rule.id)} type="button">{ru.delete}</button>
              </div>
              {expanded && <div className="logic-preview">
                <strong>{preview.evaluation.explanation}</strong>
                <ul>{preview.evaluation.conditionResults.map((item) => <li className={item.passed ? 'logic-pass' : 'logic-fail'} key={item.conditionId}>{item.explanation}</li>)}</ul>
                <h4>{ru.effectPreview}</h4><ul>{preview.effects.map((item) => <li key={item.effectId}>{item.explanation}</li>)}</ul>
                {rule.executionMode === 'suggest_only' ? <p>{ru.suggestionOnly}</p> : confirmingRuleId === rule.id ? <div className="logic-confirm">
                  <p>{ru.applyRuleQuestion}</p><button className="button button-primary" disabled={isSaving || !preview.canApply} onClick={() => apply(rule.id)} type="button">{ru.confirmApplyRule}</button>
                  <button className="button button-ghost" onClick={() => setConfirmingRuleId('')} type="button">{ru.cancel}</button>
                </div> : <button className="button button-primary" disabled={!preview.canApply || isSaving} onClick={() => setConfirmingRuleId(rule.id)} type="button">{ru.confirmApplyRule}</button>}
              </div>}
              {removingRuleId === rule.id && <div className="logic-confirm"><p>Удалить правило? История останется в журнале событий.</p>
                <button className="danger-link" disabled={isSaving} onClick={() => remove(rule.id)} type="button">{ru.confirmDelete}</button>
                <button className="link-button" onClick={() => setRemovingRuleId('')} type="button">{ru.cancel}</button></div>}
            </article>
          })}
        </div>

        <form className="logic-builder-form" onSubmit={handleSubmit}>
          <h3>{editingId ? ru.editLogicRule : ru.addLogicRule}</h3>
          <label htmlFor="logic-name">{ru.logicRuleName}</label><input id="logic-name" onChange={(event) => setName(event.target.value)} value={name} />
          <label htmlFor="logic-description">{ru.logicRuleDescription}</label><textarea id="logic-description" onChange={(event) => setDescription(event.target.value)} rows={2} value={description} />
          <label className="checkbox-field"><input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />{ru.logicRuleEnabled}</label>
          <label htmlFor="logic-group">{ru.logicGroupOperator}</label><select id="logic-group" onChange={(event) => setGroupOperator(event.target.value as LogicGroupOperator)} value={groupOperator}>
            {(['all', 'any', 'none'] as const).map((item) => <option key={item} value={item}>{ru.logicGroupOperators[item]}</option>)}
          </select>

          <div className="logic-builder-section"><div><h4>{ru.logicConditions}</h4><button className="link-button" onClick={() => setConditions((current) => [...current, conditionDraft(entities)])} type="button">{ru.addCondition}</button></div>
            {conditions.map((item, index) => {
              const entity = entityById.get(item.entityId); const state = entity?.state.find((entry) => entry.id === item.stateId)
              const operators = item.field === 'lifecycle_status'
                ? ['equals', 'not_equals'] as const
                : state?.valueType === 'text'
                  ? ['equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists'] as const
                  : state?.valueType === 'integer' || state?.valueType === 'decimal'
                    ? ['equals', 'not_equals', 'greater', 'greater_or_equal', 'less', 'less_or_equal', 'exists', 'not_exists'] as const
                    : ['equals', 'not_equals', 'exists', 'not_exists'] as const
              const needsValue = !['exists', 'not_exists'].includes(item.operator)
              return <fieldset className="logic-builder-row" key={item.key}><legend>Условие {index + 1}</legend>
                <select aria-label={ru.logicEntity} onChange={(event) => updateCondition(index, { entityId: event.target.value, stateId: '' })} value={item.entityId}>{entities.map((entityItem) => <option key={entityItem.id} value={entityItem.id}>{entityItem.name}</option>)}</select>
                <select aria-label={ru.logicField} onChange={(event) => updateCondition(index, { field: event.target.value as LogicConditionField, stateId: '', operator: 'equals', value: event.target.value === 'lifecycle_status' ? 'active' : '' })} value={item.field}>{(['state', 'lifecycle_status'] as const).map((field) => <option key={field} value={field}>{ru.logicFields[field]}</option>)}</select>
                {item.field === 'state' && <select aria-label={ru.logicStateParameter} onChange={(event) => {
                  const selected = entity?.state.find((entry) => entry.id === event.target.value)
                  updateCondition(index, { stateId: event.target.value, operator: 'equals', value: selected ? String(selected.value) : '' })
                }} value={item.stateId}><option value="">{ru.logicStateParameter}</option>{entity?.state.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>}
                <select aria-label={ru.logicOperator} onChange={(event) => updateCondition(index, { operator: event.target.value as LogicConditionOperator })} value={item.operator}>{operators.map((operator) => <option key={operator} value={operator}>{ru.logicOperators[operator]}</option>)}</select>
                {needsValue && (item.field === 'lifecycle_status' ? <select aria-label={ru.logicExpectedValue} onChange={(event) => updateCondition(index, { value: event.target.value })} value={item.value}><option value="draft">{ru.lifecycleStatuses.draft}</option><option value="active">{ru.lifecycleStatuses.active}</option></select> : valueControl(entity, state?.id ?? '', item.value, (value) => updateCondition(index, { value })))}
                {conditions.length > 1 && <button className="danger-link" onClick={() => setConditions((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">{ru.removeItem}</button>}
              </fieldset>
            })}
          </div>

          <div className="logic-builder-section"><div><h4>{ru.logicEffects}</h4><button className="link-button" onClick={() => setEffects((current) => [...current, effectDraft(entities)])} type="button">{ru.addEffect}</button></div>
            {effects.map((item, index) => {
              const entity = entityById.get(item.entityId); const state = entity?.state.find((entry) => entry.id === item.stateId)
              return <fieldset className="logic-builder-row" key={item.key}><legend>Последствие {index + 1}</legend>
                <select aria-label={ru.logicEntity} onChange={(event) => updateEffect(index, { entityId: event.target.value, stateId: '' })} value={item.entityId}>{entities.map((entityItem) => <option key={entityItem.id} value={entityItem.id}>{entityItem.name}</option>)}</select>
                <select aria-label={ru.logicEffectType} onChange={(event) => updateEffect(index, { type: event.target.value as LogicEffectType, stateId: '', value: 'active' })} value={item.type}>{(['set_state', 'set_lifecycle_status'] as const).map((type) => <option key={type} value={type}>{ru.logicEffectTypes[type]}</option>)}</select>
                {item.type === 'set_state' && <select aria-label={ru.logicStateParameter} onChange={(event) => {
                  const selected = entity?.state.find((entry) => entry.id === event.target.value)
                  updateEffect(index, { stateId: event.target.value, value: selected ? String(selected.value) : '' })
                }} value={item.stateId}><option value="">{ru.logicStateParameter}</option>{entity?.state.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>}
                {item.type === 'set_lifecycle_status' ? <select aria-label={ru.logicNewValue} onChange={(event) => updateEffect(index, { value: event.target.value })} value={item.value}><option value="draft">{ru.lifecycleStatuses.draft}</option><option value="active">{ru.lifecycleStatuses.active}</option></select> : valueControl(entity, state?.id ?? '', item.value, (value) => updateEffect(index, { value }))}
                {effects.length > 1 && <button className="danger-link" onClick={() => setEffects((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">{ru.removeItem}</button>}
              </fieldset>
            })}
          </div>
          <label htmlFor="logic-execution">{ru.logicExecutionMode}</label><select id="logic-execution" onChange={(event) => setExecutionMode(event.target.value as typeof executionMode)} value={executionMode}><option value="require_confirmation">{ru.logicExecutionModes.require_confirmation}</option><option value="suggest_only">{ru.logicExecutionModes.suggest_only}</option></select>
          <div className="logic-form-actions"><button className="button button-primary" disabled={isSaving || entities.length === 0} type="submit">{isSaving ? ru.saving : ru.saveChanges}</button>{editingId && <button className="button button-ghost" onClick={resetForm} type="button">{ru.cancel}</button>}</div>
        </form>
      </div>
    </section>
  )
}
