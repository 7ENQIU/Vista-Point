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

export async function createAndSaveRelationship(
  repository: CampaignRepository,
  campaign: Campaign,
  input: CreateRelationshipInput,
): Promise<SavedRelationshipResult> {
  const result = addRelationshipToCampaign(campaign, input)
  await repository.save(result.campaign)
  return { campaign: result.campaign, relationship: result.relationship }
}
