import { useState, type FormEvent } from 'react'
import type { LogicConditionNodeInput, SetLogicRuleInput } from '../domain/campaign/logicRules'
import type { Campaign, CampaignEntity, CustomFieldDefinition, CustomFieldValue, EntityStateVariable, LogicCondition, LogicConditionGroup, LogicConditionOperator, LogicEffect, LogicGroupOperator, LogicRule, Predicate, StateValue } from '../domain/campaign/types'

interface LogicRuleCanvasEditorProps {
  campaign: Campaign
  rule?: LogicRule
  onCancel: () => void
  onRemove?: (ruleId: string) => Promise<void>
  onSave: (input: SetLogicRuleInput) => Promise<void>
}

type SupportedConditionField = 'relationship' | 'state' | 'custom_field'

interface ConditionDraft {
  kind: 'condition'
  key: string
  id?: string
  field: SupportedConditionField
  entityId: string
  targetEntityId: string
  predicateId: string
  stateId: string
  customFieldId: string
  operator: LogicConditionOperator
  stateValue: StateValue
}

interface GroupDraft {
  kind: 'group'
  key: string
  id?: string
  operator: LogicGroupOperator
  minimum: number
  children: ConditionNodeDraft[]
}

type ConditionNodeDraft = ConditionDraft | GroupDraft

interface EffectDraft {
  key: string
  id?: string
  entityId: string
  type: 'set_state' | 'set_custom_field' | 'create_fact'
  stateId: string
  customFieldId: string
  stateValue: StateValue
  targetEntityId: string
  predicateId: string
  directed: boolean
  description: string
}

let draftCounter = 0
function draftKey(prefix: string): string { draftCounter += 1; return `${prefix}-${draftCounter}` }

function isSupportedGroup(group: LogicConditionGroup): boolean {
  return group.children.length > 0 && group.children.every((node) => node.kind === 'group'
    ? isSupportedGroup(node)
    : node.field === 'relationship' || node.field === 'state' || node.field === 'custom_field')
}

function supportedEffects(rule?: LogicRule): LogicEffect[] | undefined {
  if (!rule) return undefined
  return rule.effects.length > 0 && rule.effects.every((effect) => effect.type === 'set_state' || effect.type === 'set_custom_field' || effect.type === 'create_fact') ? rule.effects : undefined
}

function createConditionDraft(campaign: Campaign, condition?: LogicCondition): ConditionDraft {
  const entities = campaign.entities.filter((entity) => entity.status !== 'archived')
  const predicates = campaign.predicates.filter((predicate) => predicate.status !== 'archived')
  const entityId = condition?.entityId ?? entities[0]?.id ?? ''
  const entity = entities.find((item) => item.id === entityId)
  const state = entity?.state.find((item) => item.id === condition?.stateId) ?? entity?.state[0]
  const customField = campaign.customFieldDefinitions.find((item) => item.id === condition?.customFieldId) ?? campaign.customFieldDefinitions[0]
  return {
    kind: 'condition', key: draftKey('condition'), id: condition?.id,
    field: condition?.field === 'state' ? 'state' : condition?.field === 'custom_field' ? 'custom_field' : 'relationship',
    entityId,
    targetEntityId: condition?.targetEntityId ?? entities.find((entity) => entity.id !== entityId)?.id ?? '',
    predicateId: condition?.predicateId ?? predicates[0]?.id ?? '',
    stateId: state?.id ?? '',
    customFieldId: customField?.id ?? '',
    operator: condition?.operator ?? (condition?.field === 'state' ? 'equals' : 'exists'),
    stateValue: (condition?.field === 'state' || condition?.field === 'custom_field') && condition.value !== undefined
      ? condition.value
      : condition?.field === 'custom_field' ? defaultCustomFieldValue(customField) : state?.value ?? '',
  }
}

function createGroupDraft(campaign: Campaign, group?: LogicConditionGroup): GroupDraft {
  return {
    kind: 'group', key: draftKey('group'), id: group?.id,
    operator: group?.operator ?? 'all', minimum: group?.minimum ?? 1,
    children: group?.children.map((node) => node.kind === 'group' ? createGroupDraft(campaign, node) : createConditionDraft(campaign, node)) ?? [createConditionDraft(campaign)],
  }
}

function createEffectDraft(campaign: Campaign, effect?: LogicEffect): EffectDraft {
  const entities = campaign.entities.filter((entity) => entity.status !== 'archived')
  const predicates = campaign.predicates.filter((predicate) => predicate.status !== 'archived')
  const entityId = effect?.entityId ?? entities[0]?.id ?? ''
  const state = campaign.entities.find((entity) => entity.id === entityId)?.state.find((item) => item.id === (effect?.type === 'set_state' ? effect.stateId : undefined))
    ?? campaign.entities.find((entity) => entity.id === entityId)?.state[0]
  return {
    key: draftKey('effect'), id: effect?.id,
    entityId,
    type: effect?.type === 'create_fact' ? 'create_fact' : effect?.type === 'set_custom_field' ? 'set_custom_field' : 'set_state',
    stateId: state?.id ?? '',
    customFieldId: effect?.type === 'set_custom_field' ? effect.customFieldId : campaign.customFieldDefinitions[0]?.id ?? '',
    stateValue: effect?.type === 'set_state' || effect?.type === 'set_custom_field' ? effect.value : state?.value ?? '',
    targetEntityId: effect?.type === 'create_fact' ? effect.targetEntityId : entities.find((entity) => entity.id !== entityId)?.id ?? '',
    predicateId: effect?.type === 'create_fact' ? effect.predicateId : predicates[0]?.id ?? '',
    directed: effect?.type === 'create_fact' ? effect.directed : predicates[0]?.directed ?? true,
    description: effect?.type === 'create_fact' ? effect.description : '',
  }
}

function updateTree(root: GroupDraft, key: string, update: (node: ConditionNodeDraft) => ConditionNodeDraft): GroupDraft {
  function visit(node: ConditionNodeDraft): ConditionNodeDraft {
    if (node.key === key) return update(node)
    return node.kind === 'group' ? { ...node, children: node.children.map(visit) } : node
  }
  return visit(root) as GroupDraft
}

function conditionInput(node: ConditionNodeDraft): LogicConditionNodeInput {
  if (node.kind === 'group') return {
    kind: 'group', id: node.id, operator: node.operator,
    minimum: node.operator === 'count' ? Math.min(Math.max(1, node.minimum), node.children.length) : undefined,
    children: node.children.map(conditionInput),
  }
  if (node.field === 'relationship') return {
    kind: 'condition', id: node.id, field: 'relationship', entityId: node.entityId,
    targetEntityId: node.targetEntityId, predicateId: node.predicateId,
    operator: node.operator === 'not_exists' ? 'not_exists' : 'exists',
  }
  if (node.field === 'state') return {
    kind: 'condition', id: node.id, field: 'state', entityId: node.entityId,
    stateId: node.stateId, operator: node.operator, value: node.stateValue,
  }
  if (node.field === 'custom_field') return {
    kind: 'condition', id: node.id, field: 'custom_field', entityId: node.entityId,
    customFieldId: node.customFieldId, operator: node.operator, value: node.stateValue,
  }
  throw new Error('Неподдерживаемое условие правила.')
}

function collectConditions(group: GroupDraft): ConditionDraft[] {
  return group.children.flatMap((node) => node.kind === 'group' ? collectConditions(node) : [node])
}

function stateValueInput(id: string, label: string, state: EntityStateVariable, value: StateValue, onChange: (value: StateValue) => void) {
  if (state.valueType === 'boolean') return <><label htmlFor={id}>{label}</label><select id={id} onChange={(event) => onChange(event.target.value === 'true')} value={String(value)}><option value="true">Да</option><option value="false">Нет</option></select></>
  if (state.valueType === 'integer' || state.valueType === 'decimal') return <><label htmlFor={id}>{label}</label><input id={id} onChange={(event) => onChange(Number(event.target.value))} required step={state.valueType === 'integer' ? 1 : 'any'} type="number" value={typeof value === 'number' ? value : 0} /></>
  return <><label htmlFor={id}>{label}</label><input id={id} onChange={(event) => onChange(event.target.value)} required type="text" value={String(value)} /></>
}

function stateOperatorOptions(state?: EntityStateVariable) {
  if (state?.valueType === 'boolean') return <><option value="equals">Равно</option><option value="not_equals">Не равно</option></>
  if (state?.valueType === 'integer' || state?.valueType === 'decimal') return <><option value="equals">Равно</option><option value="not_equals">Не равно</option><option value="greater">Больше</option><option value="greater_or_equal">Больше или равно</option><option value="less">Меньше</option><option value="less_or_equal">Меньше или равно</option></>
  return <><option value="equals">Равно</option><option value="not_equals">Не равно</option><option value="contains">Содержит</option><option value="not_contains">Не содержит</option></>
}

function defaultCustomFieldValue(field?: CustomFieldDefinition): CustomFieldValue {
  if (field?.type === 'boolean') return false
  if (field?.type === 'number') return 0
  return ''
}

function customFieldValueInput(
  id: string,
  label: string,
  field: CustomFieldDefinition,
  entities: CampaignEntity[],
  value: CustomFieldValue,
  onChange: (value: CustomFieldValue) => void,
) {
  if (field.type === 'boolean') return <><label htmlFor={id}>{label}</label><select id={id} onChange={(event) => onChange(event.target.value === 'true')} value={String(value)}><option value="true">Да</option><option value="false">Нет</option></select></>
  if (field.type === 'number') return <><label htmlFor={id}>{label}</label><input id={id} onChange={(event) => onChange(Number(event.target.value))} required step="any" type="number" value={typeof value === 'number' ? value : 0} /></>
  if (field.type === 'entity_reference') return <><label htmlFor={id}>{label}</label><select id={id} onChange={(event) => onChange(event.target.value)} required value={String(value)}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></>
  return <><label htmlFor={id}>{label}</label><input id={id} onChange={(event) => onChange(event.target.value)} required type="text" value={String(value)} /></>
}

function customFieldOperatorOptions(field?: CustomFieldDefinition) {
  if (field?.type === 'number') return <><option value="equals">Равно</option><option value="not_equals">Не равно</option><option value="greater">Больше</option><option value="greater_or_equal">Больше или равно</option><option value="less">Меньше</option><option value="less_or_equal">Меньше или равно</option><option value="exists">Заполнено</option><option value="not_exists">Не заполнено</option></>
  if (field?.type === 'text') return <><option value="equals">Равно</option><option value="not_equals">Не равно</option><option value="contains">Содержит</option><option value="not_contains">Не содержит</option><option value="exists">Заполнено</option><option value="not_exists">Не заполнено</option></>
  return <><option value="equals">Равно</option><option value="not_equals">Не равно</option><option value="exists">Заполнено</option><option value="not_exists">Не заполнено</option></>
}

const operatorOptions = <><option value="all">Все элементы (AND)</option><option value="any">Хотя бы один (OR)</option><option value="none">Ни один (NOT)</option><option value="count">Не меньше N (COUNT)</option></>

interface ConditionFieldsProps {
  condition: ConditionDraft
  customFieldDefinitions: CustomFieldDefinition[]
  entities: CampaignEntity[]
  predicates: Predicate[]
  index: number
  removable: boolean
  onChange: (key: string, update: Partial<ConditionDraft>) => void
  onRemove: () => void
}

function ConditionFields({ condition, customFieldDefinitions, entities, predicates, index, removable, onChange, onRemove }: ConditionFieldsProps) {
  const entity = entities.find((item) => item.id === condition.entityId)
  const state = entity?.state.find((item) => item.id === condition.stateId)
  const customField = customFieldDefinitions.find((item) => item.id === condition.customFieldId)
  return <fieldset className="logic-condition-item"><legend>Условие {index + 1}</legend>
    <div className="logic-canvas-editor-row"><strong>Проверка {index + 1}</strong>{removable && <button className="text-button" onClick={onRemove} type="button">Убрать</button>}</div>
    <label htmlFor={`canvas-condition-field-${condition.key}`}>Что проверить</label><select id={`canvas-condition-field-${condition.key}`} onChange={(event) => { const field = event.target.value as SupportedConditionField; const firstState = entity?.state[0]; const firstCustomField = customFieldDefinitions[0]; onChange(condition.key, { field, operator: field === 'relationship' ? 'exists' : 'equals', stateId: firstState?.id ?? '', customFieldId: firstCustomField?.id ?? '', stateValue: field === 'custom_field' ? defaultCustomFieldValue(firstCustomField) : firstState?.value ?? '' }) }} value={condition.field}><option value="relationship">Существование факта</option><option value="state">Значение состояния</option><option value="custom_field">Пользовательское поле</option></select>
    <label htmlFor={`canvas-condition-entity-${condition.key}`}>Сущность</label><select id={`canvas-condition-entity-${condition.key}`} onChange={(event) => { const entityId = event.target.value; const firstState = entities.find((item) => item.id === entityId)?.state[0]; onChange(condition.key, { entityId, targetEntityId: condition.targetEntityId === entityId ? entities.find((item) => item.id !== entityId)?.id ?? '' : condition.targetEntityId, stateId: firstState?.id ?? '', stateValue: condition.field === 'state' ? firstState?.value ?? '' : condition.stateValue }) }} required value={condition.entityId}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select>
    {condition.field === 'relationship' ? <>
      <label htmlFor={`canvas-condition-predicate-${condition.key}`}>Предикат</label><select id={`canvas-condition-predicate-${condition.key}`} onChange={(event) => onChange(condition.key, { predicateId: event.target.value })} required value={condition.predicateId}>{predicates.map((predicate) => <option key={predicate.id} value={predicate.id}>{predicate.directLabel}</option>)}</select>
      <label htmlFor={`canvas-condition-target-${condition.key}`}>Целевая сущность</label><select id={`canvas-condition-target-${condition.key}`} onChange={(event) => onChange(condition.key, { targetEntityId: event.target.value })} required value={condition.targetEntityId}>{entities.filter((entity) => entity.id !== condition.entityId).map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select>
      <label htmlFor={`canvas-condition-operator-${condition.key}`}>Проверка</label><select id={`canvas-condition-operator-${condition.key}`} onChange={(event) => onChange(condition.key, { operator: event.target.value as LogicConditionOperator })} value={condition.operator}><option value="exists">Факт существует</option><option value="not_exists">Факт не существует</option></select>
    </> : condition.field === 'custom_field' ? <>
      {customFieldDefinitions.length ? <>
        <label htmlFor={`canvas-condition-custom-field-${condition.key}`}>Пользовательское поле</label><select id={`canvas-condition-custom-field-${condition.key}`} onChange={(event) => { const nextField = customFieldDefinitions.find((item) => item.id === event.target.value); onChange(condition.key, { customFieldId: event.target.value, operator: 'equals', stateValue: defaultCustomFieldValue(nextField) }) }} required value={condition.customFieldId}>{customFieldDefinitions.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select>
        <label htmlFor={`canvas-condition-operator-${condition.key}`}>Сравнение</label><select id={`canvas-condition-operator-${condition.key}`} onChange={(event) => onChange(condition.key, { operator: event.target.value as LogicConditionOperator })} value={condition.operator}>{customFieldOperatorOptions(customField)}</select>
        {customField && condition.operator !== 'exists' && condition.operator !== 'not_exists' && customFieldValueInput(`canvas-condition-value-${condition.key}`, 'Ожидаемое значение', customField, entities, condition.stateValue, (stateValue) => onChange(condition.key, { stateValue }))}
      </> : <p className="form-inline-error">В кампании нет пользовательских полей. Создайте поле в полной карточке сущности.</p>}
    </> : <>
      {entity?.state.length ? <>
        <label htmlFor={`canvas-condition-state-${condition.key}`}>Параметр состояния</label><select id={`canvas-condition-state-${condition.key}`} onChange={(event) => { const nextState = entity.state.find((item) => item.id === event.target.value); onChange(condition.key, { stateId: event.target.value, operator: 'equals', stateValue: nextState?.value ?? '' }) }} required value={condition.stateId}>{entity.state.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <label htmlFor={`canvas-condition-operator-${condition.key}`}>Сравнение</label><select id={`canvas-condition-operator-${condition.key}`} onChange={(event) => onChange(condition.key, { operator: event.target.value as LogicConditionOperator })} value={condition.operator}>{stateOperatorOptions(state)}</select>
        {state && stateValueInput(`canvas-condition-value-${condition.key}`, 'Ожидаемое значение', state, condition.stateValue, (stateValue) => onChange(condition.key, { stateValue }))}
      </> : <p className="form-inline-error">У сущности нет параметров состояния. Добавьте параметр в карточке или выберите другую сущность.</p>}
    </>}
  </fieldset>
}

interface GroupFieldsProps {
  campaign: Campaign
  group: GroupDraft
  depth: number
  removable?: boolean
  onChange: (key: string, update: Partial<ConditionNodeDraft>) => void
  onAppend: (groupKey: string, node: ConditionNodeDraft) => void
  onRemoveChild: (groupKey: string, childKey: string) => void
  onRemove?: () => void
}

function GroupFields({ campaign, group, depth, removable, onChange, onAppend, onRemoveChild, onRemove }: GroupFieldsProps) {
  const entities = campaign.entities.filter((entity) => entity.status !== 'archived')
  const predicates = campaign.predicates.filter((predicate) => predicate.status !== 'archived')
  return <fieldset className={`logic-condition-group${depth > 0 ? ' is-nested' : ''}`}><legend>{depth === 0 ? 'Логика условий' : `Подгруппа · уровень ${depth}`}</legend>
    <div className="logic-canvas-editor-row"><strong>{depth === 0 ? 'Корневая группа' : 'Вложенная группа'}</strong>{removable && <button className="text-button" onClick={onRemove} type="button">Убрать группу</button>}</div>
    <label htmlFor={`canvas-group-operator-${group.key}`}>Как объединить элементы</label><select id={`canvas-group-operator-${group.key}`} onChange={(event) => onChange(group.key, { operator: event.target.value as LogicGroupOperator })} value={group.operator}>{operatorOptions}</select>
    {group.operator === 'count' && <><label htmlFor={`canvas-group-minimum-${group.key}`}>Сколько элементов должно выполниться</label><input id={`canvas-group-minimum-${group.key}`} max={group.children.length} min={1} onChange={(event) => onChange(group.key, { minimum: Number(event.target.value) })} required type="number" value={Math.min(group.minimum, group.children.length)} /></>}
    {group.children.map((node, index) => node.kind === 'group' ? <GroupFields
      campaign={campaign} depth={depth + 1} group={node} key={node.key} removable={group.children.length > 1}
      onAppend={onAppend} onChange={onChange} onRemove={() => onRemoveChild(group.key, node.key)} onRemoveChild={onRemoveChild}
    /> : <ConditionFields
      condition={node} customFieldDefinitions={campaign.customFieldDefinitions} entities={entities} index={index} key={node.key} predicates={predicates} removable={group.children.length > 1}
      onChange={(key, update) => onChange(key, update)} onRemove={() => onRemoveChild(group.key, node.key)}
    />)}
    <div className="logic-condition-group-actions"><button className="button button-secondary" onClick={() => onAppend(group.key, createConditionDraft(campaign))} type="button">+ Условие</button>{depth < 5 && <button className="button button-secondary" onClick={() => onAppend(group.key, createGroupDraft(campaign))} type="button">+ Подгруппа</button>}</div>
    {depth === 5 && <p className="logic-group-limit">Достигнута максимальная глубина: пять вложенных уровней.</p>}
  </fieldset>
}

export function LogicRuleCanvasEditor({ campaign, rule, onCancel, onRemove, onSave }: LogicRuleCanvasEditorProps) {
  const existingEffects = supportedEffects(rule)
  const supported = !rule || Boolean(isSupportedGroup(rule.conditionGroup) && existingEffects)
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [triggerType, setTriggerType] = useState<'manual' | 'on_change'>(rule?.trigger.type === 'on_change' ? 'on_change' : 'manual')
  const [conditionGroup, setConditionGroup] = useState<GroupDraft>(() => createGroupDraft(campaign, supported && rule ? rule.conditionGroup : undefined))
  const [effects, setEffects] = useState<EffectDraft[]>(() => (existingEffects?.length ? existingEffects : [undefined]).map((effect) => createEffectDraft(campaign, effect)))
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState('')
  const entities = campaign.entities.filter((entity) => entity.status !== 'archived')

  function changeNode(key: string, update: Partial<ConditionNodeDraft>) {
    setConditionGroup((current) => updateTree(current, key, (node) => ({ ...node, ...update } as ConditionNodeDraft)))
  }

  function appendNode(groupKey: string, node: ConditionNodeDraft) {
    setConditionGroup((current) => updateTree(current, groupKey, (currentNode) => currentNode.kind === 'group' ? { ...currentNode, children: [...currentNode.children, node] } : currentNode))
  }

  function removeChild(groupKey: string, childKey: string) {
    setConditionGroup((current) => updateTree(current, groupKey, (node) => node.kind === 'group' ? { ...node, children: node.children.filter((child) => child.key !== childKey) } : node))
  }

  function updateEffect(key: string, update: Partial<EffectDraft>) {
    setEffects((current) => current.map((effect) => effect.key === key ? { ...effect, ...update } : effect))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLocalError(''); setSaving(true)
    try {
      await onSave({
        ruleId: rule?.id, name, description, enabled, conditionGroup: conditionInput(conditionGroup) as SetLogicRuleInput['conditionGroup'],
        effects: effects.map((effect) => effect.type === 'create_fact'
          ? { id: effect.id, entityId: effect.entityId, type: 'create_fact', targetEntityId: effect.targetEntityId, predicateId: effect.predicateId, directed: effect.directed, description: effect.description }
          : effect.type === 'set_custom_field'
            ? { id: effect.id, entityId: effect.entityId, type: 'set_custom_field', customFieldId: effect.customFieldId, value: effect.stateValue }
            : { id: effect.id, entityId: effect.entityId, type: 'set_state', stateId: effect.stateId, value: effect.stateValue }),
        executionMode: 'require_confirmation', trigger: { type: triggerType, delayMinutes: 0, repeat: rule?.trigger.repeat ?? 'rearm' },
      })
      onCancel()
    } catch (caught) { setLocalError(caught instanceof Error ? caught.message : 'Не удалось сохранить правило.') } finally { setSaving(false) }
  }

  async function remove() {
    if (!rule || !onRemove || !window.confirm(`Удалить правило «${rule.name}»? Оно исчезнет с логического канваса, а действие останется в истории.`)) return
    setSaving(true); setLocalError('')
    try { await onRemove(rule.id); onCancel() } catch (caught) { setLocalError(caught instanceof Error ? caught.message : 'Не удалось удалить правило.') } finally { setSaving(false) }
  }

  if (!supported) return <div className="logic-canvas-editor"><div className="graph-inspector-heading"><div><span>Неподдерживаемое правило</span><h3>{rule?.name}</h3></div><button className="text-button" onClick={onCancel} type="button">Закрыть</button></div><p>Правило содержит типы условий или результатов, которые пока нельзя менять на канвасе. Вложенные группы поддерживаются, а этот объект остаётся доступен для просмотра без риска потерять данные.</p></div>

  const invalidRelationship = collectConditions(conditionGroup).some((condition) => condition.field === 'relationship' && (entities.length < 2 || !condition.predicateId || !condition.targetEntityId))
  const invalidState = collectConditions(conditionGroup).some((condition) => condition.field === 'state' && !entities.find((entity) => entity.id === condition.entityId)?.state.some((state) => state.id === condition.stateId))
    || effects.some((effect) => effect.type === 'set_state' && !entities.find((entity) => entity.id === effect.entityId)?.state.some((state) => state.id === effect.stateId))
  const invalidCustomField = collectConditions(conditionGroup).some((condition) => condition.field === 'custom_field' && !campaign.customFieldDefinitions.some((field) => field.id === condition.customFieldId))
    || effects.some((effect) => effect.type === 'set_custom_field' && !campaign.customFieldDefinitions.some((field) => field.id === effect.customFieldId))
  const invalidFact = effects.some((effect) => effect.type === 'create_fact' && (entities.length < 2 || effect.entityId === effect.targetEntityId || !effect.targetEntityId || !effect.predicateId))

  return <form className="logic-canvas-editor" onSubmit={submit}>
    <div className="graph-inspector-heading"><div><span>{rule ? 'Редактирование' : 'Новое правило'}</span><h3>{rule?.name || 'Событие и результаты'}</h3></div><button className="text-button" onClick={onCancel} type="button">Закрыть</button></div>
    {localError && <p className="form-inline-error" role="alert">{localError}</p>}
    <label htmlFor="canvas-rule-name">Название события</label><input id="canvas-rule-name" onChange={(event) => setName(event.target.value)} placeholder="Например, Анна вступила в Орден" required value={name} />
    <label htmlFor="canvas-rule-description">Описание</label><textarea id="canvas-rule-description" onChange={(event) => setDescription(event.target.value)} rows={2} value={description} />
    <label className="checkbox-field"><input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" /> Правило включено</label>
    <label htmlFor="canvas-rule-trigger">Когда проверять</label><select id="canvas-rule-trigger" onChange={(event) => setTriggerType(event.target.value as typeof triggerType)} value={triggerType}><option value="manual">Только вручную</option><option value="on_change">После изменения кампании</option></select>

    <GroupFields campaign={campaign} depth={0} group={conditionGroup} onAppend={appendNode} onChange={changeNode} onRemoveChild={removeChild} />

    {effects.map((effect, index) => <fieldset key={effect.key}><legend>Подготовленный результат {index + 1}</legend>
      <div className="logic-canvas-editor-row"><strong>Изменение {index + 1}</strong>{effects.length > 1 && <button className="text-button" onClick={() => setEffects((current) => current.filter((item) => item.key !== effect.key))} type="button">Убрать</button>}</div>
      <label htmlFor={`canvas-result-type-${effect.key}`}>Что изменить</label><select id={`canvas-result-type-${effect.key}`} onChange={(event) => { const type = event.target.value as EffectDraft['type']; const predicate = campaign.predicates.find((item) => item.status !== 'archived'); const customField = campaign.customFieldDefinitions[0]; updateEffect(effect.key, { type, predicateId: predicate?.id ?? '', directed: predicate?.directed ?? true, customFieldId: customField?.id ?? '', stateValue: type === 'set_custom_field' ? defaultCustomFieldValue(customField) : effect.stateValue }) }} value={effect.type}><option value="set_state">Значение состояния</option><option value="set_custom_field">Пользовательское поле</option><option value="create_fact">Создать факт</option></select>
      <label htmlFor={`canvas-result-entity-${effect.key}`}>{effect.type === 'create_fact' ? 'Источник' : 'Сущность'}</label><select id={`canvas-result-entity-${effect.key}`} onChange={(event) => { const entityId = event.target.value; const state = entities.find((item) => item.id === entityId)?.state[0]; updateEffect(effect.key, { entityId, targetEntityId: effect.targetEntityId === entityId ? entities.find((item) => item.id !== entityId)?.id ?? '' : effect.targetEntityId, stateId: state?.id ?? '', stateValue: effect.type === 'set_state' ? state?.value ?? '' : effect.stateValue }) }} required value={effect.entityId}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select>
      {effect.type === 'create_fact' ? <>
        <label htmlFor={`canvas-result-predicate-${effect.key}`}>Предикат</label><select id={`canvas-result-predicate-${effect.key}`} onChange={(event) => { const predicate = campaign.predicates.find((item) => item.id === event.target.value); updateEffect(effect.key, { predicateId: event.target.value, directed: predicate?.directed ?? true }) }} required value={effect.predicateId}>{campaign.predicates.filter((predicate) => predicate.status !== 'archived').map((predicate) => <option key={predicate.id} value={predicate.id}>{predicate.directLabel}</option>)}</select>
        <label htmlFor={`canvas-result-target-${effect.key}`}>Цель</label><select id={`canvas-result-target-${effect.key}`} onChange={(event) => updateEffect(effect.key, { targetEntityId: event.target.value })} required value={effect.targetEntityId}>{entities.filter((entity) => entity.id !== effect.entityId).map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select>
        <label className="checkbox-field"><input checked={effect.directed} onChange={(event) => updateEffect(effect.key, { directed: event.target.checked })} type="checkbox" /> Направленный факт</label>
        <label htmlFor={`canvas-result-description-${effect.key}`}>Описание факта</label><textarea id={`canvas-result-description-${effect.key}`} onChange={(event) => updateEffect(effect.key, { description: event.target.value })} rows={2} value={effect.description} />
      </> : effect.type === 'set_custom_field' ? (() => {
        const customField = campaign.customFieldDefinitions.find((item) => item.id === effect.customFieldId)
        return campaign.customFieldDefinitions.length ? <>
          <label htmlFor={`canvas-result-custom-field-${effect.key}`}>Пользовательское поле</label><select id={`canvas-result-custom-field-${effect.key}`} onChange={(event) => { const nextField = campaign.customFieldDefinitions.find((item) => item.id === event.target.value); updateEffect(effect.key, { customFieldId: event.target.value, stateValue: defaultCustomFieldValue(nextField) }) }} required value={effect.customFieldId}>{campaign.customFieldDefinitions.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select>
          {customField && customFieldValueInput(`canvas-result-custom-value-${effect.key}`, 'Новое значение', customField, entities, effect.stateValue, (stateValue) => updateEffect(effect.key, { stateValue }))}
        </> : <p className="form-inline-error">В кампании нет пользовательских полей. Создайте поле в полной карточке сущности.</p>
      })() : (() => {
        const entity = entities.find((item) => item.id === effect.entityId)
        const state = entity?.state.find((item) => item.id === effect.stateId)
        return entity?.state.length ? <>
          <label htmlFor={`canvas-result-state-${effect.key}`}>Параметр состояния</label><select id={`canvas-result-state-${effect.key}`} onChange={(event) => { const nextState = entity.state.find((item) => item.id === event.target.value); updateEffect(effect.key, { stateId: event.target.value, stateValue: nextState?.value ?? '' }) }} required value={effect.stateId}>{entity.state.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {state && stateValueInput(`canvas-result-value-${effect.key}`, 'Новое значение', state, effect.stateValue, (stateValue) => updateEffect(effect.key, { stateValue }))}
        </> : <p className="form-inline-error">У сущности нет параметров состояния. Добавьте параметр в карточке или выберите другую сущность.</p>
      })()}
    </fieldset>)}
    <button className="button button-secondary" onClick={() => setEffects((current) => [...current, createEffectDraft(campaign)])} type="button">+ Добавить результат</button>

    <p className="logic-canvas-safety">Сохранение меняет только правило. Все результаты остаются предварительным просмотром и потребуют отдельного подтверждения мастера.</p>
    <div className="logic-canvas-editor-actions"><button className="button button-primary" disabled={saving || entities.length < 1 || invalidRelationship || invalidState || invalidCustomField || invalidFact} type="submit">{saving ? 'Сохраняем…' : 'Сохранить правило'}</button>{rule && onRemove && <button className="danger-link" disabled={saving} onClick={() => void remove()} type="button">Удалить правило</button>}</div>
  </form>
}
