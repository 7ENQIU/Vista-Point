import { useMemo, useState } from 'react'
import type { Campaign, CampaignCalendar, CampaignEvent } from '../domain/campaign/types'
import { formatCampaignDateTime } from '../domain/campaign/calendar'
import { ru } from '../shared/i18n/ru'

type EventGroup = 'all' | 'entity' | 'relationship' | 'state' | 'knowledge' | 'logic' | 'session' | 'world' | 'encounter'

export interface EventDescription {
  title: string
  detail: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function eventGroup(event: CampaignEvent): Exclude<EventGroup, 'all'> {
  if (event.type.startsWith('entity.state.')) return 'state'
  if (event.type.startsWith('knowledge.')) return 'knowledge'
  if (event.type.startsWith('logic.')) return 'logic'
  if (event.type.startsWith('session.')) return 'session'
  if (event.type.startsWith('world.')) return 'world'
  if (event.type.startsWith('encounter.')) return 'encounter'
  if (event.type.startsWith('relationship.')) return 'relationship'
  return 'entity'
}

function stateValue(value: unknown): string {
  if (!isRecord(value)) return 'не задано'
  if (value.valueType === 'boolean') return value.value ? ru.yes : ru.no
  return String(value.value ?? 'не задано')
}

const changedFieldLabels: Record<string, string> = {
  name: 'название',
  aliases: 'альтернативные названия',
  summary: 'короткая заметка',
  description: 'полное описание',
  status: 'статус',
  visibility: 'видимость',
  tags: 'теги',
}

export function describeCampaignEvent(event: CampaignEvent, calendar?: CampaignCalendar): EventDescription {
  const payload = event.payload
  if (event.type === 'entity.created') {
    return { title: 'Сущность создана', detail: String(payload.entityName ?? 'Без названия') }
  }
  if (event.type === 'entity.quick_created') return { title: 'Импровизированный объект создан', detail: String(payload.entityName ?? 'Без названия') }
  if (event.type === 'entity.quick_create.processed') return { title: 'Импровизация обработана', detail: String(payload.entityName ?? 'Без названия') }
  if (event.type === 'entity.updated') {
    const fields = Array.isArray(payload.changedFields)
      ? payload.changedFields.map((field) => changedFieldLabels[String(field)] ?? String(field))
      : []
    return {
      title: 'Карточка сущности обновлена',
      detail: fields.length ? `Изменено: ${fields.join(', ')}.` : 'Данные сущности изменены.',
    }
  }
  if (event.type === 'entity.archived') {
    const count = Array.isArray(payload.archivedRelationshipIds)
      ? payload.archivedRelationshipIds.length
      : 0
    return {
      title: 'Сущность перенесена в архив',
      detail: count ? `Связей перенесено в архив: ${count}.` : String(payload.entityName ?? ''),
    }
  }
  if (event.type === 'relationship.created') {
    return {
      title: 'Связь создана',
      detail: `${String(payload.sourceName ?? 'Сущность')} → ${String(payload.targetName ?? 'Сущность')}`,
    }
  }
  if (event.type === 'relationship.archived') {
    return { title: 'Связь перенесена в архив', detail: 'Связь исключена из рабочих представлений.' }
  }
  if (event.type === 'entity.state.created') {
    return {
      title: 'Параметр состояния добавлен',
      detail: `${String(payload.stateName ?? 'Параметр')}: ${stateValue(payload.after)}.`,
    }
  }
  if (event.type === 'entity.state.updated') {
    return {
      title: 'Состояние изменено',
      detail: `${String(payload.stateName ?? 'Параметр')}: ${stateValue(payload.before)} → ${stateValue(payload.after)}.`,
    }
  }
  if (event.type === 'entity.state.removed') {
    return {
      title: 'Параметр состояния удалён',
      detail: `${String(payload.stateName ?? 'Параметр')}: прежнее значение ${stateValue(payload.before)}.`,
    }
  }
  if (event.type === 'knowledge.created') {
    const after = isRecord(payload.after) ? payload.after : {}
    return { title: 'Знание добавлено', detail: String(after.content ?? 'Без содержания') }
  }
  if (event.type === 'knowledge.updated') {
    const after = isRecord(payload.after) ? payload.after : {}
    return { title: 'Знание изменено', detail: String(after.content ?? 'Без содержания') }
  }
  if (event.type === 'knowledge.removed') {
    const before = isRecord(payload.before) ? payload.before : {}
    return { title: 'Знание удалено', detail: String(before.content ?? 'Без содержания') }
  }
  if (event.type === 'logic.rule.created') return { title: 'Правило создано', detail: String(payload.ruleName ?? 'Без названия') }
  if (event.type === 'logic.rule.updated') return { title: 'Правило изменено', detail: String(payload.ruleName ?? 'Без названия') }
  if (event.type === 'logic.rule.removed') return { title: 'Правило удалено', detail: String(payload.ruleName ?? 'Без названия') }
  if (event.type === 'logic.rule.applied') {
    const count = Array.isArray(payload.changes) ? payload.changes.length : 0
    return { title: 'Последствия правила применены', detail: `${String(payload.ruleName ?? 'Правило')}: изменений — ${count}.` }
  }
  if (event.type === 'logic.activation.created') return { title: 'Правило сработало', detail: `${String(payload.ruleName ?? 'Правило')} добавлено в очередь.` }
  if (event.type === 'logic.activation.applied') return { title: 'Срабатывание обработано', detail: String(payload.ruleName ?? 'Правило') }
  if (event.type === 'logic.activation.dismissed') return { title: 'Срабатывание отклонено', detail: String(payload.ruleName ?? 'Правило') }
  if (event.type === 'logic.activation.invalidated') return { title: 'Срабатывание утратило актуальность', detail: String(payload.ruleName ?? 'Правило') }
  if (event.type === 'logic.activation.limit_reached') return { title: 'Автоматическая цепочка остановлена', detail: `Достигнут предел: ${String(payload.maxAutomaticSteps ?? 20)} шагов.` }
  if (event.type === 'session.started') return { title: 'Сессия начата', detail: String(payload.sessionName ?? 'Без названия') }
  if (event.type === 'session.context.updated') return { title: 'Контекст сессии изменён', detail: 'Обновлены текущая сцена или участники.' }
  if (event.type === 'session.manual_event') return { title: 'Событие сессии', detail: String(payload.description ?? 'Без описания') }
  if (event.type === 'session.check.resolved') return { title: 'Проверка сцены', detail: `${String(payload.name ?? 'Проверка')}: ${String(payload.total ?? '—')} против ${String(payload.difficulty ?? '—')} — ${payload.succeeded ? 'успех' : 'неудача'}.` }
  if (event.type === 'session.completed') return { title: 'Сессия завершена', detail: String(payload.sessionName ?? 'Без названия') }
  if (event.type === 'world.time.changed') return { title: 'Мировое время изменено', detail: calendar ? `${formatCampaignDateTime(String(payload.before), calendar)} → ${formatCampaignDateTime(String(payload.after), calendar)}` : `${new Date(String(payload.before)).toLocaleString('ru-RU')} → ${new Date(String(payload.after)).toLocaleString('ru-RU')}` }
  if (event.type === 'world.scheduled_event.created') return { title: 'Событие запланировано', detail: `${String(payload.title ?? 'Без названия')} · ${calendar ? formatCampaignDateTime(String(payload.occursAt), calendar) : new Date(String(payload.occursAt)).toLocaleString('ru-RU')}` }
  if (event.type === 'world.calendar.updated') return { title: 'Календарь кампании изменён', detail: String(isRecord(payload.after) ? payload.after.name ?? 'Новый календарь' : 'Новый календарь') }
  if (event.type === 'world.scheduled_event.cancelled') return { title: 'Запланированное событие отменено', detail: String(payload.title ?? 'Без названия') }
  if (event.type === 'world.scheduled_event.triggered') return { title: 'Наступило запланированное событие', detail: String(payload.title ?? 'Без названия') }
  if (event.type === 'encounter.started') return { title: 'Столкновение началось', detail: String(payload.encounterName ?? 'Без названия') }
  if (event.type === 'encounter.participant.updated') return { title: 'Участник столкновения обновлён', detail: 'Изменены сторона, инициатива или эффекты.' }
  if (event.type === 'encounter.turn.advanced') return { title: 'Следующий ход', detail: `Раунд ${String(payload.round ?? '—')}.` }
  if (event.type === 'encounter.completed') return { title: 'Столкновение завершено', detail: String(payload.outcome ?? 'Исход не указан') }
  return { title: 'Событие кампании', detail: event.type }
}

interface CampaignEventLogProps {
  campaign: Campaign
  onOpenEntity: (entityId: string) => void
}

export function CampaignEventLog({ campaign, onOpenEntity }: CampaignEventLogProps) {
  const [group, setGroup] = useState<EventGroup>('all')
  const [entityId, setEntityId] = useState('all')
  const [sessionId, setSessionId] = useState('all')
  const activeEntityIds = useMemo(
    () => new Set(campaign.entities.filter((entity) => entity.status !== 'archived').map((entity) => entity.id)),
    [campaign.entities],
  )
  const entityNames = useMemo(
    () => new Map(campaign.entities.map((entity) => [entity.id, entity.name])),
    [campaign.entities],
  )
  const events = [...campaign.eventLog].reverse().filter((event) =>
    (group === 'all' || eventGroup(event) === group) &&
    (entityId === 'all' || event.relatedEntityIds.includes(entityId)) &&
    (sessionId === 'all' || (sessionId === 'none' ? !event.sessionId : event.sessionId === sessionId)))

  return (
    <section className="event-log-section" aria-labelledby="event-log-heading">
      <div className="event-log-heading">
        <div>
          <p className="overline">Event Layer</p>
          <h2 id="event-log-heading">{ru.eventLog}</h2>
          <p>{ru.eventLogHint}</p>
        </div>
        <span aria-label={`${events.length} событий показано`}>{events.length}</span>
      </div>

      <div className="event-log-filters">
        <div>
          <label htmlFor="event-group-filter">{ru.eventGroup}</label>
          <select id="event-group-filter" onChange={(event) => setGroup(event.target.value as EventGroup)} value={group}>
            <option value="all">{ru.allEvents}</option>
            <option value="entity">{ru.entityEvents}</option>
            <option value="relationship">{ru.relationshipEvents}</option>
            <option value="state">{ru.stateEvents}</option>
            <option value="knowledge">{ru.knowledgeEvents}</option>
            <option value="logic">{ru.logicEvents}</option>
            <option value="session">{ru.sessionEvents}</option>
            <option value="world">{ru.worldEvents}</option>
            <option value="encounter">{ru.encounterEvents}</option>
          </select>
        </div>
        <div>
          <label htmlFor="event-entity-filter">{ru.relatedEntity}</label>
          <select id="event-entity-filter" onChange={(event) => setEntityId(event.target.value)} value={entityId}>
            <option value="all">{ru.allEntities}</option>
            {[...campaign.entities]
              .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
              .map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="event-session-filter">{ru.eventSession}</label>
          <select id="event-session-filter" onChange={(event) => setSessionId(event.target.value)} value={sessionId}>
            <option value="all">{ru.allSessions}</option>
            <option value="none">{ru.outsideSessions}</option>
            {[...campaign.sessions]
              .sort((left, right) => right.number - left.number)
              .map((session) => (
                <option key={session.id} value={session.id}>
                  №{session.number} · {session.name}{session.status === 'active' ? ' · активна' : ''}
                </option>
              ))}
          </select>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="event-log-empty">{ru.noFilteredEvents}</p>
      ) : (
        <div className="event-log-list">
          {events.map((event) => {
            const description = describeCampaignEvent(event, campaign.calendar)
            return (
              <article className="event-log-row" key={event.id}>
                <time dateTime={event.occurredAt}>
                  {new Date(event.occurredAt).toLocaleString('ru-RU')}
                </time>
                <div>
                  <h3>{description.title}</h3>
                  <p>{description.detail}</p>
                  <div className="event-log-entities">
                    {event.relatedEntityIds.map((relatedId) => activeEntityIds.has(relatedId) ? (
                      <button className="link-button" key={relatedId} onClick={() => onOpenEntity(relatedId)} type="button">
                        {entityNames.get(relatedId) ?? 'Неизвестная сущность'}
                      </button>
                    ) : (
                      <span key={relatedId}>{entityNames.get(relatedId) ?? 'Архивная сущность'}</span>
                    ))}
                  </div>
                </div>
                <span className="event-log-source">{event.source === 'user' ? ru.userEvent : ru.systemEvent}</span>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
