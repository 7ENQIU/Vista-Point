import { previewLogicRule } from '../../domain/campaign/logicRules'
import type { Campaign, LogicCondition, LogicConditionGroup, LogicRule } from '../../domain/campaign/types'

export type LogicCanvasNodeKind = 'event' | 'condition' | 'result'
export type LogicCanvasNodeState = 'neutral' | 'pass' | 'fail' | 'disabled'

export interface LogicCanvasNode {
  id: string
  ruleId: string
  kind: LogicCanvasNodeKind
  title: string
  subtitle: string
  details: string[]
  relatedEntityIds: string[]
  state: LogicCanvasNodeState
  x: number
  y: number
  width: number
  height: number
}

export interface LogicCanvasEdge {
  id: string
  sourceId: string
  targetId: string
  label: 'проверить' | 'далее' | 'да' | 'нет'
  path: string
  state: LogicCanvasNodeState
}

export interface LogicCanvasProjection {
  nodes: LogicCanvasNode[]
  edges: LogicCanvasEdge[]
  width: number
  height: number
}

interface ConditionPlacement { condition: LogicCondition; parentGroupId: string }
interface GroupPlacement { group: LogicConditionGroup; parentGroupId?: string; depth: number; conditionIds: string[] }

const NODE_WIDTH = 240
const NODE_HEIGHT = 86
const X_EVENT = 140
const X_CONDITION = 440
const GROUP_GAP = 300

function triggerLabel(rule: LogicRule): string {
  if (rule.trigger.type === 'manual') return 'Ручное событие'
  if (rule.trigger.type === 'world_time') return rule.trigger.delayMinutes > 0
    ? `Мировое время · задержка ${rule.trigger.delayMinutes} мин.`
    : 'Изменение мирового времени'
  return rule.trigger.delayMinutes > 0 ? `Изменение · задержка ${rule.trigger.delayMinutes} мин.` : 'Изменение кампании'
}

function orthogonalPath(source: LogicCanvasNode, target: LogicCanvasNode): string {
  const sourceX = source.x + source.width / 2
  const targetX = target.x - target.width / 2
  const middleX = (sourceX + targetX) / 2
  return `M ${sourceX} ${source.y} L ${middleX} ${source.y} L ${middleX} ${target.y} L ${targetX} ${target.y}`
}

function groupTitle(group: LogicConditionGroup): string {
  if (group.operator === 'all') return 'Все элементы · AND'
  if (group.operator === 'any') return 'Хотя бы один · OR'
  if (group.operator === 'none') return 'Ни один · NOT'
  return `Не меньше ${group.minimum ?? 1} · COUNT`
}

function describeConditionTree(root: LogicConditionGroup): { conditions: ConditionPlacement[]; groups: GroupPlacement[]; maxDepth: number } {
  const conditions: ConditionPlacement[] = []
  const groups: GroupPlacement[] = []
  let maxDepth = 0
  function visit(group: LogicConditionGroup, parentGroupId: string | undefined, depth: number): string[] {
    maxDepth = Math.max(maxDepth, depth)
    const conditionIds = group.children.flatMap((node) => {
      if (node.kind === 'group') return visit(node, group.id, depth + 1)
      conditions.push({ condition: node, parentGroupId: group.id })
      return [node.id]
    })
    groups.push({ group, parentGroupId, depth, conditionIds })
    return conditionIds
  }
  visit(root, undefined, 0)
  return { conditions, groups, maxDepth }
}

export function buildLogicCanvas(campaign: Campaign): LogicCanvasProjection {
  const nodes: LogicCanvasNode[] = []
  const edges: LogicCanvasEdge[] = []
  let cursorY = 70
  let canvasWidth = 1230

  for (const rule of campaign.logicRules) {
    const preview = previewLogicRule(campaign, rule)
    const tree = describeConditionTree(rule.conditionGroup)
    const conditionCount = Math.max(1, tree.conditions.length)
    const resultCount = Math.max(1, preview.effects.length)
    const blockHeight = Math.max(190, conditionCount * 112, resultCount * 112)
    const centerY = cursorY + blockHeight / 2
    const ruleState: LogicCanvasNodeState = !rule.enabled ? 'disabled' : preview.evaluation.satisfied ? 'pass' : 'fail'
    const rootGroupX = X_CONDITION + (tree.maxDepth + 1) * GROUP_GAP
    const resultX = rootGroupX + GROUP_GAP
    canvasWidth = Math.max(canvasWidth, resultX + NODE_WIDTH / 2 + 70)
    const eventNode: LogicCanvasNode = {
      id: `logic:${rule.id}:event`, ruleId: rule.id, kind: 'event', title: rule.name,
      subtitle: triggerLabel(rule), details: [rule.description || 'Описание правила не добавлено.'], relatedEntityIds: [],
      state: rule.enabled ? 'neutral' : 'disabled', x: X_EVENT, y: centerY, width: NODE_WIDTH, height: NODE_HEIGHT,
    }
    nodes.push(eventNode)

    const conditionY = new Map<string, number>()
    const nodeById = new Map<string, LogicCanvasNode>([[eventNode.id, eventNode]])
    tree.conditions.forEach(({ condition }, index) => {
      const evaluation = preview.evaluation.conditionResults.find((item) => item.conditionId === condition.id)
      const state: LogicCanvasNodeState = !rule.enabled ? 'disabled' : evaluation?.passed ? 'pass' : 'fail'
      const y = cursorY + (index + 0.5) * (blockHeight / conditionCount)
      conditionY.set(condition.id, y)
      const node: LogicCanvasNode = {
        id: `logic:${rule.id}:condition:${condition.id}`, ruleId: rule.id, kind: 'condition',
        title: `Условие ${index + 1} · ${evaluation?.passed ? 'выполнено' : 'не выполнено'}`,
        subtitle: evaluation?.explanation ?? 'Условие не удалось вычислить.', details: [],
        relatedEntityIds: [condition.entityId, condition.targetEntityId].filter((id): id is string => Boolean(id)),
        state, x: X_CONDITION, y, width: NODE_WIDTH, height: NODE_HEIGHT,
      }
      nodes.push(node); nodeById.set(node.id, node)
      edges.push({
        id: `logic:${rule.id}:check:${condition.id}`, sourceId: eventNode.id, targetId: node.id,
        label: 'проверить', path: orthogonalPath(eventNode, node), state,
      })
    })

    tree.groups.forEach(({ group, depth, conditionIds }) => {
      const evaluation = preview.evaluation.groupResults.find((item) => item.groupId === group.id)
      const state: LogicCanvasNodeState = !rule.enabled ? 'disabled' : evaluation?.passed ? 'pass' : 'fail'
      const descendantY = conditionIds.map((id) => conditionY.get(id)).filter((value): value is number => value !== undefined)
      const y = descendantY.length ? descendantY.reduce((sum, value) => sum + value, 0) / descendantY.length : centerY
      const node: LogicCanvasNode = {
        id: `logic:${rule.id}:group:${group.id}`, ruleId: rule.id, kind: 'condition', title: groupTitle(group),
        subtitle: evaluation?.explanation ?? 'Группу не удалось вычислить.',
        details: group.id === rule.conditionGroup.id ? [preview.evaluation.explanation] : ['Результат этой подгруппы передаётся в родительскую группу.'],
        relatedEntityIds: [...new Set(tree.conditions.filter((item) => conditionIds.includes(item.condition.id)).flatMap((item) => [item.condition.entityId, item.condition.targetEntityId].filter((id): id is string => Boolean(id))))],
        state, x: X_CONDITION + (tree.maxDepth - depth + 1) * GROUP_GAP, y, width: NODE_WIDTH, height: NODE_HEIGHT,
      }
      nodes.push(node); nodeById.set(node.id, node)
    })

    tree.conditions.forEach(({ condition, parentGroupId }) => {
      const source = nodeById.get(`logic:${rule.id}:condition:${condition.id}`)!
      const target = nodeById.get(`logic:${rule.id}:group:${parentGroupId}`)!
      edges.push({
        id: `logic:${rule.id}:continue:${condition.id}`, sourceId: source.id, targetId: target.id,
        label: 'далее', path: orthogonalPath(source, target), state: source.state,
      })
    })
    tree.groups.filter((item) => item.parentGroupId).forEach(({ group, parentGroupId }) => {
      const source = nodeById.get(`logic:${rule.id}:group:${group.id}`)!
      const target = nodeById.get(`logic:${rule.id}:group:${parentGroupId}`)!
      edges.push({
        id: `logic:${rule.id}:continue:${group.id}`, sourceId: source.id, targetId: target.id,
        label: 'далее', path: orthogonalPath(source, target), state: source.state,
      })
    })

    const rootNode = nodeById.get(`logic:${rule.id}:group:${rule.conditionGroup.id}`)!
    const effects = preview.effects.length > 0 ? preview.effects : [{ effectId: 'empty', entityId: '', targetEntityId: undefined, changed: false, explanation: 'Результаты не настроены.' }]
    effects.forEach((effect, index) => {
      const resultY = cursorY + (index + 0.5) * (blockHeight / resultCount)
      const resultNode: LogicCanvasNode = {
        id: `logic:${rule.id}:result:${effect.effectId}`, ruleId: rule.id, kind: 'result',
        title: effect.changed ? 'Изменение подготовлено' : 'Изменение не требуется', subtitle: effect.explanation,
        details: [rule.executionMode === 'suggest_only' ? 'Только предложение мастеру.' : 'Применение потребует отдельного подтверждения мастера.'],
        relatedEntityIds: [effect.entityId, effect.targetEntityId].filter((id): id is string => Boolean(id)), state: ruleState, x: resultX, y: resultY, width: NODE_WIDTH, height: NODE_HEIGHT,
      }
      nodes.push(resultNode)
      edges.push({
        id: `logic:${rule.id}:effect:${effect.effectId}`, sourceId: rootNode.id, targetId: resultNode.id,
        label: preview.evaluation.satisfied ? 'да' : 'нет', path: orthogonalPath(rootNode, resultNode), state: ruleState,
      })
    })
    cursorY += blockHeight + 70
  }

  return { nodes, edges, width: canvasWidth, height: Math.max(360, cursorY) }
}
