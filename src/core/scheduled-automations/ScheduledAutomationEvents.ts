import type { DurableRuntime } from '../durable/index.js'
import type { ScheduledAutomationJob, ScheduledAutomationRun } from './ScheduledAutomationTypes.js'

export const SCHEDULED_EVENT_TYPES = {
  jobCreated: 'scheduled_job_created',
  jobUpdated: 'scheduled_job_updated',
  jobDeleted: 'scheduled_job_deleted',
  jobPaused: 'scheduled_job_paused',
  jobResumed: 'scheduled_job_resumed',
  tickStarted: 'scheduled_tick_started',
  tickCompleted: 'scheduled_tick_completed',
  runStarted: 'scheduled_run_started',
  runCompleted: 'scheduled_run_completed',
  runFailed: 'scheduled_run_failed',
  runSkipped: 'scheduled_run_skipped',
} as const

export type ScheduledEventType = typeof SCHEDULED_EVENT_TYPES[keyof typeof SCHEDULED_EVENT_TYPES]

export async function appendScheduledEvent(input: {
  durable?: DurableRuntime
  eventType: ScheduledEventType
  workspaceId: string
  job?: ScheduledAutomationJob
  run?: ScheduledAutomationRun
  payload?: Record<string, unknown>
}): Promise<string | undefined> {
  if (!input.durable) return undefined
  const event = await input.durable.appendEvent({
    eventType: input.eventType,
    workspaceId: input.workspaceId,
    runId: input.run?.runId,
    payload: {
      jobId: input.job?.jobId ?? input.run?.jobId,
      runId: input.run?.runId,
      actionType: input.job?.action.type ?? input.run?.actionType,
      status: input.run?.status ?? input.job?.status,
      ...input.payload,
    },
  })
  return event.eventId
}
