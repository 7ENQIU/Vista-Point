import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ENTITY_IMAGE_MAX_BYTES,
  ENTITY_IMAGE_MIME_TYPES,
  CUSTOM_FIELD_TYPES,
  type CampaignEntity,
  type CustomFieldDefinition,
  type CustomFieldType,
  type CustomFieldValue,
  type EntityImage,
  type EntityImageMimeType,
  type EntityTemplate,
  type LogicConditionGroup,
  type LogicRule,
} from '../domain/campaign/types'
import type { UpdateEntityInput } from '../domain/campaign/updateEntity'
import { ru } from '../shared/i18n/ru'

interface EntityEditorProps {
  customFieldDefinitions: CustomFieldDefinition[]
  entity: CampaignEntity
  entities: CampaignEntity[]
  entityTemplates: EntityTemplate[]
  logicRules: LogicRule[]
  isSavingTemplate: boolean
  handleEscape?: boolean
  isSaving: boolean
  onCancel: () => void
  onSave: (input: UpdateEntityInput) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  onCreateTemplate: (name: string) => Promise<void>
  onRemoveTemplate: (templateId: string) => Promise<void>
  showHeader?: boolean
  typeLabel?: string
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function sameImage(left: EntityImage | undefined, right: EntityImage | undefined): boolean {
  if (!left || !right) return left === right
  return left.dataUrl === right.dataUrl && left.mimeType === right.mimeType &&
    left.fileName === right.fileName && left.updatedAt === right.updatedAt
}

export function EntityEditor({
  customFieldDefinitions,
  entity,
  entities,
  entityTemplates,
  logicRules,
  isSavingTemplate,
  handleEscape = true,
  isSaving,
  onCancel,
  onSave,
  onDirtyChange,
  onCreateTemplate,
  onRemoveTemplate,
  showHeader = true,
  typeLabel,
}: EntityEditorProps) {
  const [name, setName] = useState(entity.name)
  const [aliases, setAliases] = useState(entity.aliases.join(', '))
  const [summary, setSummary] = useState(entity.summary)
  const [description, setDescription] = useState(entity.description)
  const [dmNotes, setDmNotes] = useState(entity.dmNotes)
  const [image, setImage] = useState<EntityImage | undefined>(entity.image)
  const [imageError, setImageError] = useState('')
  const [tags, setTags] = useState(entity.tags.join(', '))
  const [characterTags, setCharacterTags] = useState(entity.characterTags.join(', '))
  const [fieldDefinitions, setFieldDefinitions] = useState(customFieldDefinitions)
  const [customFields, setCustomFields] = useState(entity.customFields)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('text')
  const [templateName, setTemplateName] = useState('')
  const [templateError, setTemplateError] = useState('')
  const isDirty = useMemo(() => name !== entity.name || aliases !== entity.aliases.join(', ') ||
    summary !== entity.summary || description !== entity.description || dmNotes !== entity.dmNotes ||
    tags !== entity.tags.join(', ') || characterTags !== entity.characterTags.join(', ') ||
    !sameImage(image, entity.image) || JSON.stringify(fieldDefinitions) !== JSON.stringify(customFieldDefinitions) ||
    JSON.stringify(customFields) !== JSON.stringify(entity.customFields),
  [aliases, characterTags, customFieldDefinitions, customFields, description, dmNotes, entity, fieldDefinitions, image, name, summary, tags])

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange])

  function requestClose() {
    if (isDirty && !window.confirm('Закрыть карточку? Несохранённые изменения будут потеряны.')) return
    onCancel()
  }

  useEffect(() => {
    if (!handleEscape) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || isSaving) return
      event.preventDefault()
      requestClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleEscape, isSaving, isDirty, onCancel])

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ENTITY_IMAGE_MIME_TYPES.includes(file.type as EntityImageMimeType)) {
      setImageError('Поддерживаются PNG, JPEG, WebP и GIF. SVG не принимается из соображений безопасности.')
      return
    }
    if (file.size > ENTITY_IMAGE_MAX_BYTES) {
      setImageError('Файл должен быть не больше 5 МБ.')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error())
      reader.onerror = () => reject(reader.error ?? new Error())
      reader.readAsDataURL(file)
    }).catch(() => '')
    if (!dataUrl) {
      setImageError('Не удалось прочитать изображение.')
      return
    }
    setImage({ dataUrl, mimeType: file.type as EntityImageMimeType, fileName: file.name, updatedAt: new Date().toISOString() })
    setImageError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSave({
      name,
      aliases: splitList(aliases),
      summary,
      description,
      dmNotes,
      image,
      tags: splitList(tags),
      characterTags: splitList(characterTags),
      customFieldDefinitions: fieldDefinitions,
      customFields,
    })
  }

  function addCustomField() {
    const fieldName = newFieldName.trim()
    if (!fieldName || fieldDefinitions.some((field) => field.name.toLocaleLowerCase('ru-RU') === fieldName.toLocaleLowerCase('ru-RU'))) return
    const id = crypto.randomUUID()
    setFieldDefinitions((current) => [...current, { id, name: fieldName, type: newFieldType }])
    if (newFieldType === 'boolean') setCustomFields((current) => ({ ...current, [id]: false }))
    setNewFieldName('')
    setNewFieldType('text')
  }

  function setCustomFieldValue(fieldId: string, value: CustomFieldValue | undefined) {
    setCustomFields((current) => {
      if (value === undefined || value === '') {
        const { [fieldId]: _removed, ...rest } = current
        return rest
      }
      return { ...current, [fieldId]: value }
    })
  }

  function customFieldRuleUsage(group: LogicConditionGroup, fieldId: string): number {
    return group.children.reduce((count, node) => count + (node.kind === 'group'
      ? customFieldRuleUsage(node, fieldId)
      : Number(node.field === 'custom_field' && node.customFieldId === fieldId)), 0)
  }

  function customFieldUsage(fieldId: string): { entityCount: number; ruleCount: number; templateCount: number } {
    return {
      entityCount: entities.filter((item) => Object.prototype.hasOwnProperty.call(item.customFields, fieldId)).length,
      ruleCount: logicRules.filter((rule) => customFieldRuleUsage(rule.conditionGroup, fieldId) > 0 ||
        rule.effects.some((effect) => effect.type === 'set_custom_field' && effect.customFieldId === fieldId)).length,
      templateCount: entityTemplates.filter((template) => Object.prototype.hasOwnProperty.call(template.customFields, fieldId)).length,
    }
  }

  function removeCustomField(field: CustomFieldDefinition) {
    const persisted = customFieldDefinitions.some((item) => item.id === field.id)
    const usage = customFieldUsage(field.id)
    if (persisted && (usage.entityCount > 0 || usage.ruleCount > 0 || usage.templateCount > 0)) return
    if (persisted && !window.confirm(`Удалить поле «${field.name}» из схемы кампании? Это действие будет сохранено в истории, но не поддерживает Undo.`)) return
    setFieldDefinitions((current) => current.filter((item) => item.id !== field.id))
    setCustomFieldValue(field.id, undefined)
  }

  async function createTemplate() {
    setTemplateError('')
    try {
      await onCreateTemplate(templateName)
      setTemplateName('')
    } catch (caught) {
      setTemplateError(caught instanceof Error ? caught.message : 'Не удалось создать шаблон.')
    }
  }

  async function removeTemplate(template: EntityTemplate) {
    if (!window.confirm(`Удалить шаблон «${template.name}»? Уже созданные сущности не изменятся.`)) return
    setTemplateError('')
    try {
      await onRemoveTemplate(template.id)
    } catch (caught) {
      setTemplateError(caught instanceof Error ? caught.message : 'Не удалось удалить шаблон.')
    }
  }

  return (
    <form className="entity-editor" onSubmit={handleSubmit}>
      {showHeader && <div className="entity-editor-heading">
        <div>
          <p className="overline">{ru.entityCard}</p>
          <h2>{ru.editEntity}</h2>
        </div>
        <button aria-label="Закрыть карточку" className="text-button" disabled={isSaving} onClick={requestClose} type="button">×</button>
      </div>}

      <p className="entity-editor-type">{typeLabel ?? ru.entityTypes[entity.type]}</p>

      <section className="entity-image-field" aria-label="Изображение сущности">
        {image ? <>
          <a href={image.dataUrl} rel="noreferrer" target="_blank" title="Открыть изображение полностью">
            <img alt={`Изображение: ${entity.name}`} src={image.dataUrl} />
          </a>
          <p className="form-hint">{image.fileName}</p>
        </> : <div className="entity-image-placeholder">Без изображения</div>}
        <div className="entity-image-actions">
          <label className="button button-ghost" htmlFor={`entity-image-${entity.id}`}>{image ? 'Заменить' : 'Добавить изображение'}</label>
          <input accept={ENTITY_IMAGE_MIME_TYPES.join(',')} className="visually-hidden" id={`entity-image-${entity.id}`} onChange={handleImageChange} type="file" />
          {image && <button className="text-button" onClick={() => { setImage(undefined); setImageError('') }} type="button">Удалить</button>}
        </div>
        <p className="form-hint">PNG, JPEG, WebP или GIF, до 5 МБ. Файл хранится только в локальной кампании.</p>
        {imageError && <p className="form-error" role="alert">{imageError}</p>}
      </section>

      {entity.type === 'npc' && <div className="entity-special-field">
        <label htmlFor="edit-character-tags">{ru.characterTags}</label>
        <input autoComplete="off" id="edit-character-tags" onChange={(event) => setCharacterTags(event.target.value)} placeholder={ru.characterTagsPlaceholder} value={characterTags} />
        <p className="form-hint">{ru.characterTagsHint}</p>
      </div>}

      <label htmlFor="edit-entity-name">{ru.entityName}</label>
      <input
        autoComplete="off"
        id="edit-entity-name"
        onChange={(event) => setName(event.target.value)}
        value={name}
      />

      <label htmlFor="edit-entity-aliases">{ru.entityAliases}</label>
      <input
        autoComplete="off"
        id="edit-entity-aliases"
        onChange={(event) => setAliases(event.target.value)}
        placeholder={ru.entityAliasesPlaceholder}
        value={aliases}
      />

      <label htmlFor="edit-entity-summary">{ru.entitySummary}</label>
      <textarea
        id="edit-entity-summary"
        onChange={(event) => setSummary(event.target.value)}
        placeholder={ru.entitySummaryPlaceholder}
        rows={3}
        value={summary}
      />

      <label htmlFor="edit-entity-dm-notes">Заметки ДМа</label>
      <textarea
        className="dm-notes-input"
        id="edit-entity-dm-notes"
        onChange={(event) => setDmNotes(event.target.value)}
        placeholder="Секреты, намерения и подсказки только для мастера"
        rows={5}
        value={dmNotes}
      />
      <p className="form-hint">Отдельно от общего описания; не предназначено для показа игрокам.</p>

      <label htmlFor="edit-entity-description">{ru.entityDescription}</label>
      <textarea
        id="edit-entity-description"
        onChange={(event) => setDescription(event.target.value)}
        placeholder={ru.entityDescriptionPlaceholder}
        rows={6}
        value={description}
      />

      <label htmlFor="edit-entity-tags">{ru.entityTags}</label>
      <input
        autoComplete="off"
        id="edit-entity-tags"
        onChange={(event) => setTags(event.target.value)}
        placeholder={ru.entityTagsPlaceholder}
        value={tags}
      />

      <section className="custom-fields-editor" aria-labelledby="custom-fields-title">
        <div>
          <p className="overline">Схема кампании</p>
          <h3 id="custom-fields-title">Пользовательские поля</h3>
          <p className="form-hint">Поле создаётся один раз и становится доступно всем сущностям кампании.</p>
        </div>

        {fieldDefinitions.map((field) => {
          const usage = customFieldUsage(field.id)
          const persisted = customFieldDefinitions.some((item) => item.id === field.id)
          const removalBlocked = persisted && (usage.entityCount > 0 || usage.ruleCount > 0 || usage.templateCount > 0)
          return <fieldset className="custom-field-item" key={field.id}>
            <legend>{field.name}</legend>
            <div className="custom-field-definition-row">
              <label>
                <span>Название поля</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setFieldDefinitions((current) => current.map((item) => item.id === field.id ? { ...item, name: event.target.value } : item))}
                  value={field.name}
                />
              </label>
              <span className="custom-field-type">{{ text: 'Текст', number: 'Число', boolean: 'Да / нет', entity_reference: 'Ссылка на сущность' }[field.type]}</span>
              <button className="text-button" disabled={removalBlocked} onClick={() => removeCustomField(field)} title={removalBlocked ? 'Сначала очистите значения и удалите поле из правил и шаблонов.' : 'Удалить поле из схемы'} type="button">Удалить</button>
            </div>
            <label className="custom-field-row">
              <span>Значение для «{entity.name}»</span>
              {field.type === 'boolean' ? <input
            checked={customFields[field.id] === true}
            onChange={(event) => setCustomFieldValue(field.id, event.target.checked)}
            type="checkbox"
          /> : field.type === 'entity_reference' ? <select
            onChange={(event) => setCustomFieldValue(field.id, event.target.value)}
            value={String(customFields[field.id] ?? '')}
          >
            <option value="">Не выбрано</option>
            {entities.filter((item) => item.status !== 'archived').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select> : <input
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            onChange={(event) => setCustomFieldValue(field.id, field.type === 'number'
              ? event.target.value === '' ? undefined : Number(event.target.value)
              : event.target.value)}
            type={field.type === 'number' ? 'number' : 'text'}
            value={String(customFields[field.id] ?? '')}
          />}
            </label>
            {persisted && <p className="form-hint">Заполнено у сущностей: {usage.entityCount}. В правилах: {usage.ruleCount}. В шаблонах: {usage.templateCount}.</p>}
          </fieldset>
        })}

        <div className="custom-field-create">
          <label>
            <span>Название нового поля</span>
            <input autoComplete="off" onChange={(event) => setNewFieldName(event.target.value)} value={newFieldName} />
          </label>
          <label>
            <span>Тип</span>
            <select onChange={(event) => setNewFieldType(event.target.value as CustomFieldType)} value={newFieldType}>
              {CUSTOM_FIELD_TYPES.map((type) => <option key={type} value={type}>{{
                text: 'Текст', number: 'Число', boolean: 'Да / нет', entity_reference: 'Ссылка на сущность',
              }[type]}</option>)}
            </select>
          </label>
          <button className="button button-ghost" disabled={!newFieldName.trim()} onClick={addCustomField} type="button">Добавить поле</button>
        </div>
      </section>

      <section className="entity-template-editor" aria-labelledby="entity-templates-title">
        <div>
          <p className="overline">Повторное использование</p>
          <h3 id="entity-templates-title">Шаблоны карточек</h3>
          <p className="form-hint">Шаблон копирует сохранённые описания, заметки, теги и пользовательские поля. Имя, изображение, состояние, связи и история не копируются.</p>
        </div>
        <div className="entity-template-create">
          <label>
            <span>Название шаблона</span>
            <input autoComplete="off" onChange={(event) => setTemplateName(event.target.value)} placeholder={`Например, ${typeLabel ?? ru.entityTypes[entity.type]} — основа`} value={templateName} />
          </label>
          <button className="button button-ghost" disabled={isSavingTemplate || isDirty || !templateName.trim()} onClick={() => void createTemplate()} type="button">{isSavingTemplate ? 'Сохраняем…' : 'Создать из карточки'}</button>
        </div>
        {isDirty && <p className="form-hint">Сначала сохраните изменения карточки — шаблон создаётся только из сохранённых данных.</p>}
        {templateError && <p className="form-error" role="alert">{templateError}</p>}
        {entityTemplates.filter((template) => template.entityType === entity.type && template.customTypeId === entity.customTypeId).length > 0 && <div className="entity-template-list">
          {entityTemplates.filter((template) => template.entityType === entity.type && template.customTypeId === entity.customTypeId).map((template) => <div key={template.id}>
            <span><strong>{template.name}</strong><small>{ru.entityTypes[template.entityType]}</small></span>
            <button className="text-button" disabled={isSavingTemplate} onClick={() => void removeTemplate(template)} type="button">Удалить</button>
          </div>)}
        </div>}
      </section>

      <div className="entity-editor-actions">
        <button className="button button-primary" disabled={isSaving} type="submit">
          {isSaving ? ru.saving : ru.saveChanges}
        </button>
        <button className="button button-ghost" disabled={isSaving} onClick={requestClose} type="button">
          {ru.cancel}
        </button>
      </div>
    </form>
  )
}
