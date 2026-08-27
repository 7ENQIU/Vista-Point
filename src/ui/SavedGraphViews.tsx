import { useState, type FormEvent } from 'react'
import type { SavedGraphView } from '../domain/campaign/types'

interface SavedGraphViewsProps {
  views: SavedGraphView[]
  isSaving: boolean
  onApply: (view: SavedGraphView) => void
  onCreate: (name: string) => Promise<boolean>
  onRename: (viewId: string, name: string) => Promise<boolean>
  onRemove: (viewId: string) => Promise<void>
}

export function SavedGraphViews({ views, isSaving, onApply, onCreate, onRename, onRemove }: SavedGraphViewsProps) {
  const availableViews = views ?? []
  const [name, setName] = useState('')
  const [renamingId, setRenamingId] = useState('')
  const [renameValue, setRenameValue] = useState('')

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    if (await onCreate(name)) setName('')
  }

  async function submitRename(event: FormEvent, viewId: string) {
    event.preventDefault()
    if (await onRename(viewId, renameValue)) {
      setRenamingId('')
      setRenameValue('')
    }
  }

  return (
    <details className="saved-graph-views">
      <summary>Сохранённые виды <span>{availableViews.length}</span></summary>
      <div className="saved-graph-views-content">
        <p>Вид запоминает текущий поиск и фильтры типов. Раскладка карточек остаётся локальной.</p>
        <form className="saved-graph-view-create" onSubmit={submitCreate}>
          <label htmlFor="saved-graph-view-name">Название нового вида</label>
          <div>
            <input id="saved-graph-view-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Например, Улики текущей главы" value={name} />
            <button disabled={isSaving || !name.trim()} type="submit">Сохранить текущий</button>
          </div>
        </form>
        {availableViews.length === 0 ? <p className="empty-state compact">Сохранённых видов пока нет.</p> : (
          <ul className="saved-graph-view-list">
            {availableViews.map((view) => <li key={view.id}>
              {renamingId === view.id ? (
                <form onSubmit={(event) => submitRename(event, view.id)}>
                  <label className="sr-only" htmlFor={`saved-graph-view-rename-${view.id}`}>Новое название вида</label>
                  <input autoFocus id={`saved-graph-view-rename-${view.id}`} maxLength={80} onChange={(event) => setRenameValue(event.target.value)} value={renameValue} />
                  <button disabled={isSaving || !renameValue.trim()} type="submit">Готово</button>
                  <button onClick={() => setRenamingId('')} type="button">Отмена</button>
                </form>
              ) : <>
                <button className="saved-graph-view-apply" disabled={isSaving} onClick={() => onApply(view)} type="button">
                  <strong>{view.name}</strong>
                  <small>{view.query ? `Поиск: «${view.query}»` : 'Без поискового запроса'} · фильтров: {view.entityTypes.length + view.customEntityTypeIds.length}</small>
                </button>
                <button aria-label={`Переименовать вид «${view.name}»`} disabled={isSaving} onClick={() => { setRenamingId(view.id); setRenameValue(view.name) }} type="button">Переименовать</button>
                <button aria-label={`Удалить вид «${view.name}»`} disabled={isSaving} onClick={() => onRemove(view.id)} type="button">Удалить</button>
              </>}
            </li>)}
          </ul>
        )}
      </div>
    </details>
  )
}
