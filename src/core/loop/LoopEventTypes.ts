export const LOOP_EVENT_TYPES = {
  goalCreated: 'loop_goal_created',
  planCreated: 'loop_plan_created',
  taskCreated: 'loop_task_created',
  taskQueued: 'loop_task_queued',
  taskStarted: 'loop_task_started',
  taskCompleted: 'loop_task_completed',
  taskFailed: 'loop_task_failed',
  attemptStarted: 'loop_attempt_started',
  attemptCompleted: 'loop_attempt_completed',
  attemptFailed: 'loop_attempt_failed',
  verificationStarted: 'loop_verification_started',
  verificationCompleted: 'loop_verification_completed',
  humanGateRequested: 'loop_human_gate_requested',
  humanGateResolved: 'loop_human_gate_resolved',
  checkpointCreated: 'loop_checkpoint_created',
  recoveryDecided: 'loop_recovery_decided',
  resumed: 'loop_resumed',
  blocked: 'loop_blocked',
  completed: 'loop_completed',
  legacyEventBridged: 'loop_legacy_event_bridged',
} as const

export type LoopEventType = typeof LOOP_EVENT_TYPES[keyof typeof LOOP_EVENT_TYPES]

export const LOOP_TERMINAL_EVENT_TYPES = new Set<string>([
  LOOP_EVENT_TYPES.blocked,
  LOOP_EVENT_TYPES.completed,
])

export function isLoopEventType(value: string): value is LoopEventType {
  return Object.values(LOOP_EVENT_TYPES).includes(value as LoopEventType)
}
