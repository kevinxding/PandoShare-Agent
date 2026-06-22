export type ScheduledAutomationStatus = 'active' | 'paused' | 'deleted'

export type ScheduledAutomationRunStatus = 'started' | 'completed' | 'failed' | 'skipped'

export type ScheduledAutomationSchedule =
  | { kind: 'once'; runAtMs: number; runAtIso?: string }
  | { kind: 'every'; intervalMs: number }
  | { kind: 'daily'; time: string; timezone: 'local' | 'UTC' | string; warning?: string }
  | { kind: 'cron'; expression: string; intervalMinutes?: number; unsupportedReason?: string }

export type ScheduledAutomationActionKind =
  | 'gateway_message'
  | 'agent_turn'
  | 'loop_wake'
  | 'remote_trigger'
  | 'system_event'
  | 'command'
  | 'webhook'

export type ScheduledAutomationDeliveryMode = 'none' | 'gateway' | 'queue_only'

export type ScheduledAutomationAction = {
  type: ScheduledAutomationActionKind
  payload?: Record<string, unknown>
}

export type ScheduledAutomationDelivery = {
  mode: ScheduledAutomationDeliveryMode
  channelId?: string
  userId?: string
}

export type ScheduledAutomationSource = 'api' | 'tool' | 'legacy_automation_queue' | 'system' | 'smoke'

export type ScheduledAutomationJob = {
  jobId: string
  title: string
  status: ScheduledAutomationStatus
  workspaceId: string
  createdAtMs: number
  updatedAtMs: number
  schedule: ScheduledAutomationSchedule
  action: ScheduledAutomationAction
  delivery: ScheduledAutomationDelivery
  source: ScheduledAutomationSource
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastRunId?: string
  runCount: number
  metadata?: Record<string, unknown>
}

export type ScheduledAutomationRunReason = 'scheduled' | 'manual' | 'context_limit' | 'retry_after_failure' | 'system'

export type ScheduledAutomationRun = {
  runId: string
  jobId: string
  workspaceId: string
  status: ScheduledAutomationRunStatus
  reason: ScheduledAutomationRunReason
  scheduledForMs: number
  startedAtMs: number
  completedAtMs?: number
  actionType: ScheduledAutomationActionKind
  deliveryMode: ScheduledAutomationDeliveryMode
  attempt: number
  message?: string
  error?: string
  output?: Record<string, unknown>
  eventIds: string[]
}

export type CreateScheduledAutomationJobInput = {
  jobId?: string
  title?: string
  schedule: string | Partial<ScheduledAutomationSchedule> | Record<string, unknown>
  action: ScheduledAutomationAction | Record<string, unknown>
  delivery?: ScheduledAutomationDelivery | Record<string, unknown>
  source?: ScheduledAutomationSource
  workspaceId?: string
  nextRunAtMs?: number
  metadata?: Record<string, unknown>
}

export type UpdateScheduledAutomationJobInput = Partial<Pick<ScheduledAutomationJob, 'title' | 'status' | 'schedule' | 'action' | 'delivery' | 'nextRunAtMs' | 'lastRunAtMs' | 'lastRunId' | 'runCount' | 'metadata'>>

export type ScheduledAutomationExecutorResult = {
  status: Exclude<ScheduledAutomationRunStatus, 'started'>
  message: string
  output?: Record<string, unknown>
}

export type ScheduledAutomationTickResult = {
  ok: boolean
  nowMs: number
  dueCount: number
  processedCount: number
  runs: ScheduledAutomationRun[]
  errors: Array<{ jobId: string; message: string }>
}

export type ScheduledAutomationHealth = {
  ok: boolean
  workspaceId: string
  activeJobCount: number
  pausedJobCount: number
  deletedJobCount: number
  dueJobCount: number
  recentRunCount: number
  lastRun?: ScheduledAutomationRun
  warnings: string[]
}

export type ScheduledAutomationListQuery = {
  status?: ScheduledAutomationStatus
  includeDeleted?: boolean
  limit?: number
}

export type ScheduledAutomationRunQuery = {
  jobId?: string
  limit?: number
}
