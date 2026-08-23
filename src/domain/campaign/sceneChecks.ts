import type { Campaign, CampaignEvent } from './types'

export type SceneCheckMode = 'roll' | 'manual'
export interface ResolveSceneCheckInput {
  name: string
  difficulty: number
  modifier: number
  mode: SceneCheckMode
  manualTotal?: number
  actorId?: string
}

interface SceneCheckOptions { now?: Date; eventId?: string; random?: () => number }

export function resolveSceneCheckInCampaign(
  campaign: Campaign,
  input: ResolveSceneCheckInput,
  options: SceneCheckOptions = {},
): { campaign: Campaign; event: CampaignEvent; total: number; succeeded: boolean } {
  const session = campaign.sessions.find((item) => item.id === campaign.activeSessionId && item.status === 'active')
  if (!session) throw new Error('Быстрая проверка доступна только в активной сессии.')
  const name = input.name.trim()
  if (!name) throw new Error('Название проверки обязательно.')
  if (!Number.isInteger(input.difficulty) || input.difficulty < 1 || input.difficulty > 100) throw new Error('Сложность должна быть целым числом от 1 до 100.')
  if (!Number.isInteger(input.modifier) || Math.abs(input.modifier) > 100) throw new Error('Модификатор должен быть целым числом от −100 до 100.')
  if (input.actorId) {
    const actor = campaign.entities.find((entity) => entity.id === input.actorId && entity.status !== 'archived')
    if (!actor) throw new Error('Участник проверки недоступен.')
  }
  const roll = input.mode === 'roll' ? Math.floor((options.random ?? Math.random)() * 20) + 1 : undefined
  if (input.mode === 'manual' && !Number.isInteger(input.manualTotal)) throw new Error('Укажите целый итог ручной проверки.')
  const total = input.mode === 'manual' ? input.manualTotal! : roll! + input.modifier
  const succeeded = total >= input.difficulty
  const timestamp = (options.now ?? new Date()).toISOString()
  const relatedEntityIds = [...new Set([session.currentSceneId, ...(input.actorId ? [input.actorId] : [])])]
  const event: CampaignEvent = {
    id: options.eventId ?? crypto.randomUUID(), campaignId: campaign.id, sessionId: session.id,
    type: 'session.check.resolved', occurredAt: timestamp, worldTime: campaign.worldTime, source: 'user',
    relatedEntityIds, reversible: false,
    payload: { name, difficulty: input.difficulty, modifier: input.modifier, mode: input.mode, roll, total, succeeded, actorId: input.actorId },
  }
  return { event, total, succeeded, campaign: { ...campaign, eventLog: [...campaign.eventLog, event], updatedAt: timestamp } }
}
