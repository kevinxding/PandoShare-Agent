import type { KeyEvent } from '@opentui/core'

export type PandoKeyBindingName =
  | 'app.exit'
  | 'command.palette.show'
  | 'keys.show'
  | 'thread.list'
  | 'model.list'
  | 'input.submit'
  | 'input.newline'
  | 'input.history.prev'
  | 'input.history.next'
  | 'dialog.select.prev'
  | 'dialog.select.next'
  | 'dialog.select.page_up'
  | 'dialog.select.page_down'
  | 'dialog.select.home'
  | 'dialog.select.end'
  | 'dialog.select.submit'
  | 'dialog.input.clear'
  | 'dialog.input.delete_word_backward'
  | 'dialog.close'
  | 'messages.page_up'
  | 'messages.page_down'
  | 'messages.line_up'
  | 'messages.line_down'
  | 'messages.first'
  | 'messages.last'

export type PandoKeyBindingDefinition = {
  keys: readonly string[]
  description: string
}

export type PandoTextareaKeyBinding = {
  name: string
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  action: 'submit' | 'newline'
}

export const pandoKeybindings: Record<PandoKeyBindingName, PandoKeyBindingDefinition> = {
  'app.exit': { keys: ['ctrl+c'], description: 'Exit the application' },
  'command.palette.show': { keys: ['ctrl+p'], description: 'Show command palette' },
  'keys.show': { keys: ['ctrl+alt+k'], description: 'Show keyboard shortcuts' },
  'thread.list': { keys: ['tab'], description: 'Switch thread' },
  'model.list': { keys: ['f2'], description: 'Switch model' },
  'input.submit': { keys: ['return'], description: 'Submit input' },
  'input.newline': { keys: ['ctrl+j', 'shift+return', 'ctrl+return', 'alt+return'], description: 'Insert newline' },
  'input.history.prev': { keys: ['ctrl+up'], description: 'Previous prompt history item' },
  'input.history.next': { keys: ['ctrl+down'], description: 'Next prompt history item' },
  'dialog.select.prev': { keys: ['up', 'ctrl+p'], description: 'Previous dialog item' },
  'dialog.select.next': { keys: ['down', 'ctrl+n'], description: 'Next dialog item' },
  'dialog.select.page_up': { keys: ['pageup'], description: 'Move dialog page up' },
  'dialog.select.page_down': { keys: ['pagedown'], description: 'Move dialog page down' },
  'dialog.select.home': { keys: ['home'], description: 'First dialog item' },
  'dialog.select.end': { keys: ['end'], description: 'Last dialog item' },
  'dialog.select.submit': { keys: ['return'], description: 'Select dialog item' },
  'dialog.input.clear': { keys: ['ctrl+u'], description: 'Clear dialog search input' },
  'dialog.input.delete_word_backward': { keys: ['ctrl+w'], description: 'Delete previous dialog search word' },
  'dialog.close': { keys: ['escape'], description: 'Close dialog' },
  'messages.page_up': { keys: ['pageup', 'ctrl+alt+b'], description: 'Scroll messages up by one page' },
  'messages.page_down': { keys: ['pagedown', 'ctrl+alt+f'], description: 'Scroll messages down by one page' },
  'messages.line_up': { keys: ['ctrl+alt+y'], description: 'Scroll messages up by one line' },
  'messages.line_down': { keys: ['ctrl+alt+e'], description: 'Scroll messages down by one line' },
  'messages.first': { keys: ['home'], description: 'Scroll to first message' },
  'messages.last': { keys: ['end'], description: 'Scroll to latest message' },
}

export function pandoKeyLabel(name: PandoKeyBindingName): string {
  return pandoKeybindings[name].keys.map(formatKeyBindingForDisplay).join(' / ')
}

export function pandoPrimaryKeyLabel(name: PandoKeyBindingName): string {
  return formatKeyBindingForDisplay(pandoKeybindings[name].keys[0] ?? '')
}

export function pandoKeyLabels(names: readonly PandoKeyBindingName[]): string {
  return names.map(name => pandoKeyLabel(name)).join('   ')
}

export function isPandoKey(event: KeyEvent, name: PandoKeyBindingName): boolean {
  return pandoKeybindings[name].keys.some(key => keyEventMatches(event, key))
}

export const pandoPromptTextareaKeyBindings: readonly PandoTextareaKeyBinding[] = [
  ...pandoKeybindings['input.newline'].keys.map(key => keyToTextareaBinding(key, 'newline')),
  ...pandoKeybindings['input.submit'].keys.map(key => keyToTextareaBinding(key, 'submit')),
]

export function keyEventMatches(event: KeyEvent, binding: string): boolean {
  const parts = binding.toLowerCase().split('+').map(part => part.trim()).filter(Boolean)
  const key = parts.at(-1)
  if (!key) return false
  const wantCtrl = parts.includes('ctrl')
  const wantShift = parts.includes('shift')
  const wantMeta = parts.includes('meta') || parts.includes('alt')
  const wantSuper = parts.includes('super')
  const wantHyper = parts.includes('hyper')

  return (
    normalizeKeyName(event.name) === normalizeKeyName(key) &&
    Boolean(event.ctrl) === wantCtrl &&
    Boolean(event.shift) === wantShift &&
    Boolean(event.meta) === wantMeta &&
    Boolean(event.super) === wantSuper &&
    Boolean(event.hyper) === wantHyper
  )
}

function normalizeKeyName(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized === 'enter' || normalized === 'linefeed' || normalized === 'kpenter') return 'return'
  if (normalized === 'esc') return 'escape'
  if (normalized === 'pgup') return 'pageup'
  if (normalized === 'pgdown' || normalized === 'pgdn') return 'pagedown'
  return normalized
}

function formatKeyBindingForDisplay(binding: string): string {
  return binding.split('+').map(formatKeyPartForDisplay).join('+')
}

function formatKeyPartForDisplay(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized === 'return') return 'enter'
  if (normalized === 'escape') return 'esc'
  if (normalized === 'pageup') return 'pgup'
  if (normalized === 'pagedown') return 'pgdn'
  if (/^f\d+$/.test(normalized)) return normalized.toUpperCase()
  return normalized
}

function keyToTextareaBinding(binding: string, action: 'submit' | 'newline'): PandoTextareaKeyBinding {
  const parts = binding.toLowerCase().split('+').map(part => part.trim()).filter(Boolean)
  const key = parts.at(-1) ?? binding
  const result: PandoTextareaKeyBinding = {
    name: normalizeKeyName(key),
    action,
  }
  if (parts.includes('ctrl')) result.ctrl = true
  if (parts.includes('shift')) result.shift = true
  if (parts.includes('meta') || parts.includes('alt')) result.meta = true
  return result
}
