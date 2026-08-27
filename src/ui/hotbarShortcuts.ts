export interface HotbarShortcutInput {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  targetTagName: string
  isContentEditable: boolean
}

export function resolveHotbarShortcut(input: HotbarShortcutInput): number | 'escape' | undefined {
  if (input.ctrlKey || input.metaKey || input.altKey || input.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(input.targetTagName)) return undefined
  if (input.key === 'Escape') return 'escape'
  if (!/^[0-9]$/.test(input.key)) return undefined
  return input.key === '0' ? 10 : Number(input.key)
}
