import type { Campaign } from '../../domain/campaign/types'
import { formatCampaignDateTime } from '../../domain/campaign/calendar'

function formatDuration(startedAt: string, endedAt: string) {
  const minutes = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours} ч ${rest} мин` : `${rest} мин`
}

export function buildPostSessionSummary(campaign: Campaign, sessionId = campaign.activeSessionId, now = new Date()) {
  const session = campaign.sessions.find((item) => item.id === sessionId)
  if (!session) throw new Error('Сессия для сводки не найдена.')
  const names = new Map(campaign.entities.map((entity) => [entity.id, entity.name]))
  const events = campaign.eventLog.filter((event) => event.sessionId === session.id && event.type !== 'session.started')
  const manualEvents = events.filter((event) => event.type === 'session.manual_event').map((event) => String(event.payload.description ?? '')).filter(Boolean)
  const checks = events.filter((event) => event.type === 'session.check.resolved').map((event) => `${String(event.payload.name ?? 'Проверка')}: ${event.payload.succeeded ? 'успех' : 'неудача'} (${String(event.payload.total ?? '—')} против ${String(event.payload.difficulty ?? '—')})`)
  const encounters = campaign.encounters.filter((encounter) => encounter.sessionId === session.id)
  const improvised = campaign.entities.filter((entity) => entity.origin.sessionId === session.id && entity.origin.mode === 'session_quick_create')
  const pending = improvised.filter((entity) => !entity.origin.processed && entity.status !== 'archived')
  const stateChanges = events.filter((event) => event.type.startsWith('entity.state.')).length
  const knowledgeChanges = events.filter((event) => event.type.startsWith('knowledge.')).length
  const relationshipChanges = events.filter((event) => event.type.startsWith('relationship.')).length
  const scheduled = campaign.scheduledEvents.filter((event) => event.status === 'scheduled')
  const lines = [
    `Сессия №${session.number}: ${session.name}`,
    `Длительность: ${formatDuration(session.startedAt, session.endedAt ?? now.toISOString())}.`,
    `Мировое время: ${formatCampaignDateTime(session.worldTimeStart, campaign.calendar)} → ${formatCampaignDateTime(session.worldTimeEnd ?? campaign.worldTime, campaign.calendar)}.`,
    `Посещённые сцены: ${session.visitedSceneIds.map((id) => names.get(id) ?? 'Неизвестная сцена').join(', ') || 'нет'}.`,
    '',
    'Ключевые события:',
    ...(manualEvents.length ? manualEvents.map((item) => `- ${item}`) : ['- Явные записи мастера отсутствуют.']),
    ...(checks.length ? ['', 'Проверки:', ...checks.map((item) => `- ${item}`)] : []),
    '',
    'Столкновения:',
    ...(encounters.length ? encounters.map((item) => `- ${names.get(item.encounterEntityId) ?? 'Столкновение'}: ${item.status === 'completed' ? item.outcome : 'не завершено'}; раундов — ${item.round}.`) : ['- Столкновений не было.']),
    '',
    `Изменения: состояние — ${stateChanges}, знания — ${knowledgeChanges}, связи — ${relationshipChanges}.`,
    `Импровизировано: ${improvised.length ? improvised.map((entity) => names.get(entity.id)).join(', ') : 'ничего'}.`,
    `Требует обработки: ${pending.length ? pending.map((entity) => names.get(entity.id)).join(', ') : 'нет'}.`,
    `Активные отложенные события: ${scheduled.length ? scheduled.map((event) => event.title).join(', ') : 'нет'}.`,
    '',
    'Задачи мастера перед следующей игрой:',
    ...(pending.length ? pending.map((entity) => `- Обработать «${entity.name}».`) : ['- Явных задач из очереди импровизации нет.']),
  ]
  return lines.join('\n')
}
