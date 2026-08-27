import { useEffect, useRef, type ReactNode } from 'react'
import type { CampaignEntity } from '../domain/campaign/types'
import { ru } from '../shared/i18n/ru'

export type EntityFullScreenCardView = 'details' | 'state' | 'relationships' | 'history'

interface EntityFullScreenCardProps {
  children: ReactNode
  entity: CampaignEntity
  historyCount: number
  isSaving: boolean
  relationshipCount: number
  onRequestClose: () => void
  onSelectView: (view: EntityFullScreenCardView) => void
  view: EntityFullScreenCardView
  typeLabel?: string
}

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function EntityFullScreenCard({
  children,
  entity,
  historyCount,
  isSaving,
  relationshipCount,
  onRequestClose,
  onSelectView,
  view,
  typeLabel,
}: EntityFullScreenCardProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const isSavingRef = useRef(isSaving)
  const requestCloseRef = useRef(onRequestClose)
  isSavingRef.current = isSaving
  requestCloseRef.current = onRequestClose

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const siblings = dialog?.parentElement
      ? [...dialog.parentElement.children].filter((element) => element !== dialog)
      : []
    const initiallyInert = siblings.filter((element) => element.hasAttribute('inert'))
    document.body.classList.add('has-fullscreen-entity-card')
    siblings.forEach((element) => element.setAttribute('inert', ''))
    dialog?.querySelector<HTMLElement>('[data-entity-card-close]')?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSavingRef.current) {
        event.preventDefault()
        requestCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('has-fullscreen-entity-card')
      window.removeEventListener('keydown', handleKeyDown)
      siblings.forEach((element) => {
        if (!initiallyInert.includes(element)) element.removeAttribute('inert')
      })
      opener?.focus()
    }
  }, [])

  return (
    <section
      aria-labelledby="entity-fullscreen-title"
      aria-modal="true"
      className="entity-fullscreen-card"
      ref={dialogRef}
      role="dialog"
    >
      <header className="entity-fullscreen-header">
        <div>
          <p className="overline">Полная карточка</p>
          <h1 id="entity-fullscreen-title">{entity.name}</h1>
          <p>{typeLabel ?? ru.entityTypes[entity.type]}</p>
        </div>
        <button
          aria-label="Закрыть полную карточку"
          className="entity-fullscreen-close"
          data-entity-card-close
          disabled={isSaving}
          onClick={onRequestClose}
          type="button"
        >×</button>
      </header>

      <nav aria-label={ru.entityPanelSections} className="entity-fullscreen-tabs" role="tablist">
        <button
          aria-controls="entity-fullscreen-details"
          aria-selected={view === 'details'}
          className={view === 'details' ? 'is-active' : ''}
          onClick={() => onSelectView('details')}
          role="tab"
          type="button"
        >Данные</button>
        <button
          aria-controls="entity-fullscreen-state"
          aria-selected={view === 'state'}
          className={view === 'state' ? 'is-active' : ''}
          onClick={() => onSelectView('state')}
          role="tab"
          type="button"
        >Состояние <span>{entity.state.length}</span></button>
        <button
          aria-controls="entity-fullscreen-relationships"
          aria-selected={view === 'relationships'}
          className={view === 'relationships' ? 'is-active' : ''}
          onClick={() => onSelectView('relationships')}
          role="tab"
          type="button"
        >Связи <span>{relationshipCount}</span></button>
        <button
          aria-controls="entity-fullscreen-history"
          aria-selected={view === 'history'}
          className={view === 'history' ? 'is-active' : ''}
          onClick={() => onSelectView('history')}
          role="tab"
          type="button"
        >История <span>{historyCount}</span></button>
      </nav>

      <div className="entity-fullscreen-content">{children}</div>
    </section>
  )
}
