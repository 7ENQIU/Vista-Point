import { buildCampaignHistoryEntries, selectRecentHistoryEntries, type HistoryEntry } from '../application/campaigns/buildCampaignHistory'
import type { Campaign, CampaignEntity } from '../domain/campaign/types'
import { ru } from '../shared/i18n/ru'
import { describeCampaignEvent } from './CampaignEventLog'

export function buildEntityHistoryEntries(campaign: Campaign, entityId: string): HistoryEntry[] {
  return buildCampaignHistoryEntries(campaign.eventLog)
    .reverse()
    .filter((entry) => entry.event.relatedEntityIds.includes(entityId))
}

interface EntityHistoryPanelProps {
  campaign: Campaign
  entity: CampaignEntity
  onOpenEntity: (entityId: string) => void
}

function historyStatus(status: HistoryEntry['status']): string {
  if (status === 'applied') return 'Действует'
  if (status === 'undone') return 'Отменено'
  return 'Запись истории'
}

export function EntityHistoryPanel({ campaign, entity, onOpenEntity }: EntityHistoryPanelProps) {
  const history = buildEntityHistoryEntries(campaign, entity.id)
  const historyWindow = selectRecentHistoryEntries(history, 100)
  const activeEntitiesById = new Map(campaign.entities
    .filter((item) => item.status !== 'archived')
    .map((item) => [item.id, item]))

  return <section className="entity-history-card" aria-labelledby="entity-history-heading">
    <div className="entity-history-heading">
      <div>
        <p className="overline">Event Layer</p>
        <h2 id="entity-history-heading">История сущности</h2>
      </div>
      <span>{history.length}</span>
    </div>
    <p className="entity-history-hint">Это записи общего журнала кампании, связанные с текущей сущностью. Просмотр не создаёт отдельную копию истории.</p>

    {historyWindow.entries.length === 0 ? (
      <p className="entity-history-empty">Для этой сущности пока нет событий.</p>
    ) : <>
      {historyWindow.hiddenCount > 0 && <p className="entity-history-limit">Показаны последние 100 записей. Более ранние события ({historyWindow.hiddenCount}) остаются в общем журнале.</p>}
      <div className="entity-history-list">
        {historyWindow.entries.map((entry) => {
          const description = describeCampaignEvent(entry.event, campaign.calendar)
          const relatedEntities = entry.event.relatedEntityIds
            .filter((entityId) => entityId !== entity.id)
            .flatMap((entityId) => {
              const related = activeEntitiesById.get(entityId)
              return related ? [related] : []
            })
          return <article className={`entity-history-row is-${entry.status}`} key={entry.id}>
            <div className="entity-history-time">
              <time dateTime={entry.event.occurredAt}>{new Date(entry.event.occurredAt).toLocaleString('ru-RU')}</time>
              <span>{entry.event.source === 'user' ? ru.userEvent : ru.systemEvent}</span>
            </div>
            <div className="entity-history-title">
              <h3>{description.title}</h3>
              <span className={`event-log-status is-${entry.status}`}>{historyStatus(entry.status)}</span>
            </div>
            <p>{description.detail}</p>
            {relatedEntities.length > 0 && <div className="entity-history-related" aria-label="Другие связанные сущности">
              {relatedEntities.map((related) => <button className="link-button" key={related.id} onClick={() => onOpenEntity(related.id)} type="button">{related.name}</button>)}
            </div>}
          </article>
        })}
      </div>
    </>}
  </section>
}
