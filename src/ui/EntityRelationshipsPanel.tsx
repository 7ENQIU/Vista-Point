import type { Campaign, CampaignEntity, Relationship } from '../domain/campaign/types'
import { ru } from '../shared/i18n/ru'

export type EntityRelationshipDirection = 'outgoing' | 'incoming' | 'mutual'

export interface EntityRelationshipItem {
  direction: EntityRelationshipDirection
  label: string
  otherEntity: CampaignEntity
  relationship: Relationship
}

export type EntityRelationshipGroups = Record<EntityRelationshipDirection, EntityRelationshipItem[]>

function relationshipLabel(campaign: Campaign, relationship: Relationship, entityId: string): string {
  const predicate = campaign.predicates.find((item) => item.id === relationship.predicateId)
  if (predicate) return relationship.sourceId === entityId ? predicate.directLabel : predicate.inverseLabel
  return ru.relationshipTypes[relationship.type]
}

export function buildEntityRelationshipGroups(campaign: Campaign, entityId: string): EntityRelationshipGroups {
  const entitiesById = new Map(campaign.entities
    .filter((entity) => entity.status !== 'archived')
    .map((entity) => [entity.id, entity]))
  const groups: EntityRelationshipGroups = { outgoing: [], incoming: [], mutual: [] }

  for (const relationship of campaign.relationships) {
    if (relationship.status === 'archived') continue
    if (relationship.sourceId !== entityId && relationship.targetId !== entityId) continue
    const otherEntityId = relationship.sourceId === entityId ? relationship.targetId : relationship.sourceId
    const otherEntity = entitiesById.get(otherEntityId)
    if (!otherEntity) continue
    const direction: EntityRelationshipDirection = !relationship.directed
      ? 'mutual'
      : relationship.sourceId === entityId ? 'outgoing' : 'incoming'
    groups[direction].push({
      direction,
      label: relationshipLabel(campaign, relationship, entityId),
      otherEntity,
      relationship,
    })
  }

  for (const items of Object.values(groups)) {
    items.sort((left, right) => left.otherEntity.name.localeCompare(right.otherEntity.name, 'ru'))
  }
  return groups
}

const groupLabels: Record<EntityRelationshipDirection, string> = {
  outgoing: 'Исходящие факты',
  incoming: 'Входящие факты',
  mutual: 'Взаимные факты',
}

function RelationshipGroup({
  direction,
  isArchivingRelationshipId,
  items,
  onArchiveRelationship,
  onOpenEntity,
}: {
  direction: EntityRelationshipDirection
  isArchivingRelationshipId: string
  items: EntityRelationshipItem[]
  onArchiveRelationship: (relationshipId: string) => Promise<void>
  onOpenEntity: (entityId: string) => void
}) {
  if (items.length === 0) return null
  return <section className="entity-relationship-group">
    <div className="entity-relationship-group-heading">
      <h3>{groupLabels[direction]}</h3>
      <span>{items.length}</span>
    </div>
    <div className="entity-relationship-list">
      {items.map(({ label, otherEntity, relationship }) => <article className="entity-relationship-row" key={relationship.id}>
        <div className="entity-relationship-route">
          <span>{label}</span>
          <button className="link-button" onClick={() => onOpenEntity(otherEntity.id)} type="button">
            {otherEntity.name}
          </button>
        </div>
        <div className="entity-relationship-meta">
          <span>{relationship.directed ? 'Направленный факт' : 'Взаимный факт'}</span>
        </div>
        {relationship.description && <p>{relationship.description}</p>}
        <button
          className="danger-link"
          disabled={isArchivingRelationshipId === relationship.id}
          onClick={() => onArchiveRelationship(relationship.id)}
          type="button"
        >{isArchivingRelationshipId === relationship.id ? 'Отменяем…' : 'Отменить факт'}</button>
      </article>)}
    </div>
  </section>
}

interface EntityRelationshipsPanelProps {
  campaign: Campaign
  entity: CampaignEntity
  isArchivingRelationshipId: string
  onArchiveRelationship: (relationshipId: string) => Promise<void>
  onOpenEntity: (entityId: string) => void
}

export function EntityRelationshipsPanel({
  campaign,
  entity,
  isArchivingRelationshipId,
  onArchiveRelationship,
  onOpenEntity,
}: EntityRelationshipsPanelProps) {
  const groups = buildEntityRelationshipGroups(campaign, entity.id)
  const count = groups.outgoing.length + groups.incoming.length + groups.mutual.length

  return <section className="entity-relationships-card" aria-labelledby="entity-relationships-heading">
    <div className="entity-relationships-heading">
      <div>
        <p className="overline">Relationship Layer</p>
        <h2 id="entity-relationships-heading">Связи сущности</h2>
      </div>
      <span>{count}</span>
    </div>
    <p className="entity-relationships-hint">Названия показаны относительно текущей сущности. Переход открывает связанную сущность в этой же полной карточке.</p>
    {count === 0 ? <p className="entity-relationships-empty">У этой сущности пока нет активных фактов.</p> : <>
      <RelationshipGroup direction="outgoing" isArchivingRelationshipId={isArchivingRelationshipId} items={groups.outgoing} onArchiveRelationship={onArchiveRelationship} onOpenEntity={onOpenEntity} />
      <RelationshipGroup direction="incoming" isArchivingRelationshipId={isArchivingRelationshipId} items={groups.incoming} onArchiveRelationship={onArchiveRelationship} onOpenEntity={onOpenEntity} />
      <RelationshipGroup direction="mutual" isArchivingRelationshipId={isArchivingRelationshipId} items={groups.mutual} onArchiveRelationship={onArchiveRelationship} onOpenEntity={onOpenEntity} />
    </>}
  </section>
}
