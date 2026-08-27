import type { Campaign, FactHotbarPreset, HotbarSlot } from './types'

export const HOTBAR_SLOT_COUNT = 10

export function createEmptyHotbar(): HotbarSlot[] {
  return Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => ({ slot: index + 1 }))
}

export function setHotbarSlotInCampaign(
  campaign: Campaign,
  slot: number,
  preset: FactHotbarPreset | undefined,
  now = new Date(),
): Campaign {
  if (!Number.isInteger(slot) || slot < 1 || slot > HOTBAR_SLOT_COUNT) {
    throw new Error('Слот хотбара должен быть числом от 1 до 10.')
  }
  if (preset) {
    const predicate = campaign.predicates.find((item) => item.id === preset.predicateId && item.status !== 'archived')
    if (!predicate) throw new Error('Предикат для слота не найден или удалён.')
    if (!preset.label.trim()) throw new Error('Короткое название слота обязательно.')
  }
  return {
    ...campaign,
    hotbar: campaign.hotbar.map((item) => item.slot === slot
      ? { slot, preset: preset ? { ...preset, label: preset.label.trim(), description: preset.description.trim() } : undefined }
      : item),
    updatedAt: now.toISOString(),
  }
}
