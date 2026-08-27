import type { CampaignEntity } from '../domain/campaign/types'
import { ru } from '../shared/i18n/ru'

interface GraphEntityPopoverProps {
  entity: CampaignEntity
  incomingCount: number
  mutualCount: number
  onClose: () => void
  onOpenEntity: (entityId: string) => void
  outgoingCount: number
  typeLabel?: string
}

export function GraphEntityPopover({
  entity,
  incomingCount,
  mutualCount,
  onClose,
  onOpenEntity,
  outgoingCount,
  typeLabel,
}: GraphEntityPopoverProps) {
  return <aside
    aria-label={`Краткая карточка: ${entity.name}`}
    aria-live="polite"
    className="graph-entity-popover"
  >
    <div className="graph-entity-popover-heading">
      {entity.image
        ? <img alt="" aria-hidden="true" src={entity.image.dataUrl} />
        : <span aria-hidden="true">{entity.name.slice(0, 1).toUpperCase()}</span>}
      <div>
        <small>{typeLabel ?? ru.entityTypes[entity.type]}</small>
        <h3>{entity.name}</h3>
      </div>
      <button aria-label="Закрыть краткую карточку" onClick={onClose} type="button">×</button>
    </div>
    <p>{entity.summary || ru.noEntitySummary}</p>
    <small className="graph-entity-popover-facts">
      Исходящих: {outgoingCount} · Входящих: {incomingCount} · Взаимных: {mutualCount}
    </small>
    <button className="button button-primary button-block" onClick={() => onOpenEntity(entity.id)} type="button">
      Открыть полную карточку
    </button>
  </aside>
}
