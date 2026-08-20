import {
  archiveEntityInCampaign,
  archiveRelationshipInCampaign,
  type ArchiveEntityResult,
  type ArchiveRelationshipResult,
} from '../../domain/campaign/archiveCampaignItem'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function archiveAndSaveRelationship(
  repository: CampaignRepository,
  campaign: Campaign,
  relationshipId: string,
): Promise<ArchiveRelationshipResult> {
  const result = archiveRelationshipInCampaign(campaign, relationshipId)
  await repository.save(result.campaign)
  return result
}

export async function archiveAndSaveEntity(
  repository: CampaignRepository,
  campaign: Campaign,
  entityId: string,
): Promise<ArchiveEntityResult> {
  const result = archiveEntityInCampaign(campaign, entityId)
  await repository.save(result.campaign)
  return result
}
