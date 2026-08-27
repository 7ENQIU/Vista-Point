import { addPredicateToCampaign, type CreatePredicateInput } from '../../domain/campaign/addPredicate'
import { addRelationshipToCampaign } from '../../domain/campaign/addRelationship'
import type { Campaign, Relationship } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export interface CreateFactInput {
  sourceId: string
  targetId: string
  predicateId?: string
  newPredicate?: CreatePredicateInput
  directed?: boolean
  description?: string
}

export async function createAndSaveFact(
  repository: CampaignRepository,
  campaign: Campaign,
  input: CreateFactInput,
): Promise<{ campaign: Campaign; fact: Relationship }> {
  let nextCampaign = campaign
  let predicateId = input.predicateId
  if (input.newPredicate) {
    const added = addPredicateToCampaign(campaign, input.newPredicate)
    nextCampaign = added.campaign
    predicateId = added.predicate.id
  }
  if (!predicateId) throw new Error('Выберите или создайте предикат.')

  const addedFact = addRelationshipToCampaign(nextCampaign, {
    sourceId: input.sourceId,
    targetId: input.targetId,
    predicateId,
    directed: input.directed,
    description: input.description,
  })
  await repository.save(addedFact.campaign)
  return { campaign: addedFact.campaign, fact: addedFact.relationship }
}
