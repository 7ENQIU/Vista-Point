import { describe, expect, it } from 'vitest'
import {
  CampaignFileError,
  campaignFileName,
  parseCampaignFile,
  serializeCampaignFile,
} from './campaignFile'
import { createCampaign } from './createCampaign'

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
})
