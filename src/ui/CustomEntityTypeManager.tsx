import { useState, type FormEvent } from 'react'
import { ENTITY_TYPES, type Campaign, type EntityType } from '../domain/campaign/types'
import { ru } from '../shared/i18n/ru'

interface CustomEntityTypeManagerProps {
  campaign: Campaign
  isSaving: boolean
  onCreate: (input: { name: string; baseType: EntityType }) => Promise<void>
  onRename: (typeId: string, name: string) => Promise<void>
  onRemove: (typeId: string) => Promise<void>
}

export function CustomEntityTypeManager({ campaign, isSaving, onCreate, onRename, onRemove }: CustomEntityTypeManagerProps) {
  const [name, setName] = useState('')
  const [baseType, setBaseType] = useState<EntityType>('location')
  const [editingId, setEditingId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')

  async function create(event: FormEvent) {
    event.preventDefault()
    setError('')
    try { await onCreate({ name, baseType }); setName('') } catch (caught) { setError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  async function rename(typeId: string) {
    setError('')
    try { await onRename(typeId, editingName); setEditingId(''); setEditingName('') } catch (caught) { setError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  async function remove(typeId: string, typeName: string) {
    if (!window.confirm(`Удалить пользовательский тип «${typeName}»? Это возможно только если он не используется сущностями и шаблонами.`)) return
    setError('')
    try { await onRemove(typeId) } catch (caught) { setError(caught instanceof Error ? caught.message : ru.storageError) }
  }

  return <section className="custom-entity-type-manager" aria-labelledby="custom-entity-types-title">
    <div>
      <p className="overline">Настраиваемость</p>
      <h2 id="custom-entity-types-title">Пользовательские типы</h2>
      <p>Создайте собственное название на основе встроенного типа. Базовый тип сохраняет специальное поведение карточки и графа.</p>
    </div>
    <form className="custom-entity-type-create" onSubmit={create}>
      <label htmlFor="custom-entity-type-name">Название</label>
      <input id="custom-entity-type-name" onChange={(event) => setName(event.target.value)} placeholder="Например, Город" value={name} />
      <label htmlFor="custom-entity-type-base">Основа</label>
      <select id="custom-entity-type-base" onChange={(event) => setBaseType(event.target.value as EntityType)} value={baseType}>
        {ENTITY_TYPES.map((type) => <option key={type} value={type}>{ru.entityTypes[type]}</option>)}
      </select>
      <button className="button button-primary" disabled={isSaving || !name.trim()} type="submit">Добавить тип</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {campaign.customEntityTypes.length === 0 ? <p className="entity-empty">Пользовательских типов пока нет.</p> : <div className="custom-entity-type-list">
      {campaign.customEntityTypes.map((customType) => {
        const entityCount = campaign.entities.filter((entity) => entity.customTypeId === customType.id).length
        const templateCount = campaign.entityTemplates.filter((template) => template.customTypeId === customType.id).length
        return <div key={customType.id}>
          {editingId === customType.id ? <input aria-label={`Новое название типа ${customType.name}`} onChange={(event) => setEditingName(event.target.value)} value={editingName} /> : <strong>{customType.name}</strong>}
          <span>Основа: {ru.entityTypes[customType.baseType]} · сущностей: {entityCount} · шаблонов: {templateCount}</span>
          <div>
            {editingId === customType.id ? <>
              <button className="link-button" disabled={isSaving || !editingName.trim()} onClick={() => void rename(customType.id)} type="button">Сохранить</button>
              <button className="link-button" onClick={() => { setEditingId(''); setEditingName('') }} type="button">Отмена</button>
            </> : <button className="link-button" onClick={() => { setEditingId(customType.id); setEditingName(customType.name) }} type="button">Переименовать</button>}
            <button className="danger-link" disabled={isSaving || entityCount > 0 || templateCount > 0} onClick={() => void remove(customType.id, customType.name)} type="button">Удалить</button>
          </div>
        </div>
      })}
    </div>}
  </section>
}
