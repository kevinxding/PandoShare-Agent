import type { CommandEnvelope } from './commands.js'

export type ApprovalDecision = 'approve' | 'deny' | 'cancel'

export type ApprovalKind = 'tool' | 'gui' | 'gateway' | 'loop'

export type ApprovalRequestEnvelope = CommandEnvelope<{
  kind: ApprovalKind
  reason: string
  risk?: 'low' | 'medium' | 'high'
  targetId?: string
  requestedAction?: string
  inputPreview?: string
}>

export type ApprovalResponse = {
  approvalId: string
  decision: ApprovalDecision
  reason: string
  resolvedBy: 'user' | 'policy' | 'system'
  resolvedAtMs: number
}

export function isDangerousGuiAction(action: string): boolean {
  const normalized = action.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  return [
    'send',
    'delete',
    'pay',
    'payment',
    'submit',
    'submit_form',
    'publish',
    'post',
    'modify_system_settings',
    'system_settings',
    'close_save_dialog',
    'close_unsaved_dialog',
  ].includes(normalized)
}
