import { evaluateLogicRule } from '../../domain/campaign/logicRules'
import type { Campaign, CampaignEntity, CampaignEvent, CampaignSession, KnowledgeRecord, LogicConditionGroup, LogicRule } from '../../domain/campaign/types'

export interface SessionRuleView { rule: LogicRule; satisfied: boolean; explanation: string }
export interface SessionView {
  session: CampaignSession
  scene: CampaignEntity
  location?: CampaignEntity
  participants: CampaignEntity[]
  relatedEntities: CampaignEntity[]
  knowledge: KnowledgeRecord[]
  rules: SessionRuleView[]
  timeline: CampaignEvent[]
}

function conditionEntityIds(group: LogicConditionGroup): string[] {
  return group.children.flatMap((node) => node.kind === 'group'
    ? conditionEntityIds(node)
    : [node.entityId, node.targetEntityId, node.subjectEntityId].filter((id): id is string => Boolean(id)))
}

export function buildSessionView(campaign: Campaign, sessionId = campaign.activeSessionId): SessionView | undefined {
  const session = campaign.sessions.find((item) => item.id === sessionId)
  if (!session) return undefined
  const active = new Map(campaign.entities.filter((entity) => entity.status !== 'archived').map((entity) => [entity.id, entity]))
  const scene = active.get(session.currentSceneId)
  if (!scene || scene.type !== 'scene') return undefined
  const sceneRelationships = campaign.relationships.filter((relationship) => relationship.status !== 'archived' && (relationship.sourceId === scene.id || relationship.targetId === scene.id))
  const inferredParticipantIds = sceneRelationships
    .filter((relationship) => relationship.type === 'participates_in' && relationship.targetId === scene.id)
    .map((relationship) => relationship.sourceId)
  const participantIds = [...new Set([...session.participantIds, ...inferredParticipantIds])]
  const participants = participantIds.flatMap((id) => active.get(id) ? [active.get(id)!] : [])
  const relatedIds = [...new Set(sceneRelationships.flatMap((relationship) => [relationship.sourceId, relationship.targetId]).filter((id) => id !== scene.id))]
  const locationId = sceneRelationships.find((relationship) => relationship.type === 'located_in' && relationship.sourceId === scene.id)?.targetId
  const relatedEntities = relatedIds.flatMap((id) => active.get(id) ? [active.get(id)!] : [])
    .filter((entity) => !participantIds.includes(entity.id) && entity.id !== locationId)
  const contextIds = new Set([scene.id, ...participantIds, ...relatedIds])
  const knowledge = campaign.knowledge.filter((record) => record.relatedEntityIds.some((id) => contextIds.has(id)))
  const rules = campaign.logicRules.filter((rule) => rule.enabled && [...conditionEntityIds(rule.conditionGroup), ...rule.effects.map((effect) => effect.entityId)].some((id) => contextIds.has(id))).map((rule) => {
    const evaluation = evaluateLogicRule(campaign, rule)
    return { rule, satisfied: evaluation.satisfied, explanation: evaluation.explanation }
  })
  return {
    session, scene, location: locationId ? active.get(locationId) : undefined, participants, relatedEntities, knowledge, rules,
    timeline: campaign.eventLog.filter((event) => event.sessionId === session.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  }
}
