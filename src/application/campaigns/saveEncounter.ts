import { advanceEncounterTurnInCampaign, completeEncounterInCampaign, setEncounterParticipantHpInCampaign, startEncounterInCampaign, updateEncounterParticipantInCampaign, type StartEncounterInput, type UpdateEncounterParticipantInput } from '../../domain/campaign/encounters'
import type { Campaign } from '../../domain/campaign/types'
import type { CampaignRepository } from '../ports/CampaignRepository'

export async function startAndSaveEncounter(repository: CampaignRepository, campaign: Campaign, input: StartEncounterInput) { const result = startEncounterInCampaign(campaign, input); await repository.save(result.campaign); return result }
export async function updateAndSaveEncounterParticipant(repository: CampaignRepository, campaign: Campaign, input: UpdateEncounterParticipantInput) { const result = updateEncounterParticipantInCampaign(campaign, input); await repository.save(result.campaign); return result }
export async function advanceAndSaveEncounterTurn(repository: CampaignRepository, campaign: Campaign) { const result = advanceEncounterTurnInCampaign(campaign); await repository.save(result.campaign); return result }
export async function completeAndSaveEncounter(repository: CampaignRepository, campaign: Campaign, outcome: string) { const result = completeEncounterInCampaign(campaign, outcome, true); await repository.save(result.campaign); return result }
export async function setAndSaveEncounterParticipantHp(repository: CampaignRepository, campaign: Campaign, participantId: string, hp: number) { const result = setEncounterParticipantHpInCampaign(campaign, participantId, hp); if (result.changed) await repository.save(result.campaign); return result }
