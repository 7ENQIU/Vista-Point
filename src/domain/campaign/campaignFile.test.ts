import { describe, expect, it } from 'vitest'
import {
  CampaignFileError,
  campaignFileName,
  parseCampaignFile,
  serializeCampaignFile,
} from './campaignFile'
import { createCampaign } from './createCampaign'
import { addEntityToCampaign } from './addEntity'
import { addRelationshipToCampaign } from './addRelationship'
import { archiveEntityInCampaign } from './archiveCampaignItem'
import { setKnowledgeInCampaign } from './setKnowledge'
import { setLogicRuleInCampaign } from './logicRules'
import { startSessionInCampaign } from './sessions'

const now = new Date('2026-08-19T18:00:00.000Z')

describe('campaign file', () => {
  it('экспортируется и импортируется без потери данных', () => {
    const campaign = createCampaign({ name: 'Северный рубеж' }, now, 'campaign-1')
    const source = serializeCampaignFile(campaign, now)

    expect(parseCampaignFile(source)).toEqual(campaign)
    expect(campaignFileName(campaign)).toBe('Северный рубеж.vista-point.json')
  })

  it('отклоняет неизвестную версию схемы', () => {
    const campaign = createCampaign({ name: 'Архив' }, now, 'campaign-1')
    const file = JSON.parse(serializeCampaignFile(campaign, now))
    file.campaign.schemaVersion = 99

    expect(() => parseCampaignFile(JSON.stringify(file))).toThrow(CampaignFileError)
  })

  it('импортирует схему v1 через миграцию и добавляет состояние и Knowledge State', () => {
    const campaign = addEntityToCampaign(
      createCampaign({ name: 'Старый экспорт' }, now, 'campaign-1'),
      { type: 'npc', name: 'Серёга' },
      { entityId: 'entity-1' },
    ).campaign
    const file = JSON.parse(serializeCampaignFile(campaign, now))
    file.campaign.schemaVersion = 1
    delete file.campaign.entities[0].state

    const restored = parseCampaignFile(JSON.stringify(file))

    expect(restored.schemaVersion).toBe(5)
    expect(restored.entities[0].state).toEqual([])
    expect(restored.knowledge).toEqual([])
    expect(restored.logicRules).toEqual([])
    expect(restored.sessions).toEqual([])
  })

  it('отклоняет повторяющиеся параметры состояния одной сущности', () => {
    const campaign = addEntityToCampaign(
      createCampaign({ name: 'Состояние' }, now, 'campaign-1'),
      { type: 'npc', name: 'Серёга' },
      { entityId: 'entity-1' },
    ).campaign
    const file = JSON.parse(serializeCampaignFile(campaign, now))
    const state = {
      id: 'state-1',
      name: 'Здоровье',
      category: 'resource',
      valueType: 'integer',
      value: 24,
      updatedAt: now.toISOString(),
    }
    file.campaign.entities[0].state = [state, { ...state }]

    expect(() => parseCampaignFile(JSON.stringify(file))).toThrow(
      'пустые или повторяющиеся параметры',
    )
  })

  it('отклоняет повреждённую связь', () => {
    const campaign = createCampaign({ name: 'Архив' }, now, 'campaign-1')
    const file = JSON.parse(serializeCampaignFile(campaign, now))
    file.campaign.relationships.push({
      id: 'relation-1',
      campaignId: 'campaign-1',
      sourceId: 'missing-1',
      targetId: 'missing-2',
      type: 'knows',
      directed: true,
      description: '',
      status: 'active',
      visibility: 'game_master',
    })

    expect(() => parseCampaignFile(JSON.stringify(file))).toThrow(
      'ссылки на отсутствующие сущности',
    )
  })

  it('отклоняет повторяющиеся идентификаторы связей', () => {
    const campaign = createCampaign({ name: 'Архив' }, now, 'campaign-1')
    const first = addEntityToCampaign(campaign, { type: 'npc', name: 'NPC' }, { entityId: 'e1' })
    const second = addEntityToCampaign(first.campaign, { type: 'location', name: 'Локация' }, { entityId: 'e2' })
    const related = addRelationshipToCampaign(second.campaign, {
      sourceId: 'e1', targetId: 'e2', type: 'located_in', directed: true,
    }, { relationshipId: 'relation-1' }).campaign
    const file = JSON.parse(serializeCampaignFile(related, now))
    file.campaign.relationships.push({ ...file.campaign.relationships[0], type: 'knows' })

    expect(() => parseCampaignFile(JSON.stringify(file))).toThrow(
      'повторяющиеся идентификаторы связей',
    )
  })

  it('сохраняет архивные сущности и их историю при экспорте', () => {
    const campaign = createCampaign({ name: 'Архив' }, now, 'campaign-1')
    const withEntity = addEntityToCampaign(
      campaign,
      { type: 'npc', name: 'Старый NPC' },
      { entityId: 'e1' },
    ).campaign
    const archived = archiveEntityInCampaign(withEntity, 'e1', { eventId: 'archive-e1' }).campaign

    expect(parseCampaignFile(serializeCampaignFile(archived, now))).toEqual(archived)
  })

  it('экспортирует и проверяет Knowledge State со ссылками на сущности', () => {
    const campaign = addEntityToCampaign(
      createCampaign({ name: 'Знания' }, now, 'campaign-1'),
      { type: 'npc', name: 'Серёга' },
      { entityId: 'e1' },
    ).campaign
    const withKnowledge = setKnowledgeInCampaign(campaign, {
      subjectType: 'party', content: 'Серёга хранит ключ.', status: 'known',
      confidence: 80, truth: 'true', relatedEntityIds: ['e1'],
    }, { knowledgeId: 'k1' }).campaign

    expect(parseCampaignFile(serializeCampaignFile(withKnowledge, now))).toEqual(withKnowledge)

    const broken = JSON.parse(serializeCampaignFile(withKnowledge, now))
    broken.campaign.knowledge[0].relatedEntityIds = ['missing']
    expect(() => parseCampaignFile(JSON.stringify(broken))).toThrow('ссылки на отсутствующие сущности')
  })

  it('экспортирует Logic Layer и отклоняет ссылку на отсутствующее состояние', () => {
    const campaign = addEntityToCampaign(
      createCampaign({ name: 'Логика' }, now, 'campaign-1'),
      { type: 'npc', name: 'Макс' }, { entityId: 'e1' },
    ).campaign
    const withRule = setLogicRuleInCampaign(campaign, {
      name: 'Активация', enabled: true, groupOperator: 'all', executionMode: 'require_confirmation',
      conditions: [{ entityId: 'e1', field: 'lifecycle_status', operator: 'equals', value: 'draft' }],
      effects: [{ entityId: 'e1', type: 'set_lifecycle_status', value: 'active' }],
    }, { ruleId: 'rule-1', conditionIds: ['condition-1'], effectIds: ['effect-1'] }).campaign

    expect(parseCampaignFile(serializeCampaignFile(withRule, now))).toEqual(withRule)

    const broken = JSON.parse(serializeCampaignFile(withRule, now))
    broken.campaign.logicRules[0].effects[0] = {
      ...broken.campaign.logicRules[0].effects[0], type: 'set_state', stateId: 'missing', value: 1,
    }
    expect(() => parseCampaignFile(JSON.stringify(broken))).toThrow('ссылки на отсутствующие сущности')
  })

  it('экспортирует активную сессию и отклоняет повреждённую текущую сцену', () => {
    const campaign = addEntityToCampaign(
      createCampaign({ name: 'Сессия' }, now, 'campaign-1'),
      { type: 'scene', name: 'Пристань' }, { entityId: 'scene-1' },
    ).campaign
    const started = startSessionInCampaign(campaign, { sceneId: 'scene-1', participantIds: [] }, { sessionId: 'session-1' }).campaign
    expect(parseCampaignFile(serializeCampaignFile(started, now))).toEqual(started)

    const broken = JSON.parse(serializeCampaignFile(started, now))
    broken.campaign.sessions[0].currentSceneId = 'missing'
    expect(() => parseCampaignFile(JSON.stringify(broken))).toThrow('Runtime Layer содержит повреждённую сессию')
  })
})
