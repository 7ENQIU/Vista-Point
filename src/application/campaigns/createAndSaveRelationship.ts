import {
  addRelationshipToCampaign,
  type CreateRelationshipInput,
} from '../../domain/campaign/addRelationship'
import type { Campaign, Relationship } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export interface SavedRelationshipResult {
  campaign: Campaign
  relationship: Relationship
}

export interface SavedRelationshipsResult {
  campaign: Campaign
  relationships: Relationship[]
}

export async function createAndSaveRelationships(
  repository: CampaignRepository,
  campaign: Campaign,
  inputs: CreateRelationshipInput[],
): Promise<SavedRelationshipsResult> {
  if (inputs.length === 0) {
    throw new Error('Выберите хотя бы одну сущность для связи.')
  }

  const result = inputs.reduce(
    (current, input) => {
      const added = addRelationshipToCampaign(current.campaign, input)
      return {
        campaign: added.campaign,
        relationships: [...current.relationships, added.relationship],
      }
    },
    { campaign, relationships: [] as Relationship[] },
  )

  await repository.save(result.campaign)
  return result
}

export async function createAndSaveRelationship(
  repository: CampaignRepository,
  campaign: Campaign,
  input: CreateRelationshipInput,
): Promise<SavedRelationshipResult> {
  const result = await createAndSaveRelationships(repository, campaign, [input])
  return { campaign: result.campaign, relationship: result.relationships[0] }
}
