import { DurableRuntime } from '../durable/index.js'
import { computeNextRunAtMs, isUnsupportedSchedule, parseScheduleInput } from './ScheduleParser.js'
import { appendScheduledEvent, SCHEDULED_EVENT_TYPES } from './ScheduledAutomationEvents.js'
import { ScheduledAutomationExecutor, type ScheduledAutomationExecutorOptions } from './ScheduledAutomationExecutor.js'
import { ScheduledAutomationStore } from './ScheduledAutomationStore.js'
import type {
  CreateScheduledAutomationJobInput,
  ScheduledAutomationHealth,
  ScheduledAutomationJob,
  ScheduledAutomationListQuery,
  ScheduledAutomationRun,
  ScheduledAutomationRunQuery,
  ScheduledAutomationRunReason,
  ScheduledAutomationTickResult,
  UpdateScheduledAutomationJobInput,
} from './ScheduledAutomationTypes.js'

export type ScheduledAutomationRuntimeOptions = Omit<ScheduledAutomationExecutorOptions, 'workspaceRoot' | 'workspaceId' | 'durable'> & {
  workspaceRoot: string
  workspaceId?: string
  sessionId?: string
  durable?: DurableRuntime
  store?: ScheduledAutomationStore
  executor?: ScheduledAutomationExecutor
  now?: () => number
}

export class ScheduledAutomationRuntime {
  readonly workspaceRoot: string
  readonly workspaceId: string
  readonly durable: DurableRuntime
  readonly store: ScheduledAutomationStore
  readonly executor: ScheduledAutomationExecutor
  private readonly now: () => number

  constructor(private readonly options: ScheduledAutomationRuntimeOptions) {
    this.workspaceRoot = options.workspaceRoot
    this.workspaceId = options.workspaceId ?? 'default'
    this.durable = options.durable ?? new DurableRuntime({ workspaceRoot: this.workspaceRoot, workspaceId: this.workspaceId })
    this.store = options.store ?? new ScheduledAutomationStore(this.workspaceRoot, this.workspaceId)
    this.executor = options.executor ?? new ScheduledAutomationExecutor({ ...options, workspaceRoot: this.workspaceRoot, workspaceId: this.workspaceId, durable: this.durable })
    this.now = options.now ?? (() => Date.now())
  }

  async createJob(input: CreateScheduledAutomationJobInput): Promise<ScheduledAutomationJob> {
    const nowMs = this.now()
    const parsed = parseScheduleInput(input.schedule, nowMs)
    const nextRunAtMs = input.nextRunAtMs ?? computeNextRunAtMs(parsed.schedule, nowMs)
    const job = await this.store.createJob({ ...input, schedule: parsed.schedule, workspaceId: input.workspaceId ?? this.workspaceId, nextRunAtMs })
    await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.jobCreated, workspaceId: job.workspaceId, job, payload: { warnings: parsed.warnings } })
    return job
  }

  async updateJob(jobId: string, patch: UpdateScheduledAutomationJobInput): Promise<ScheduledAutomationJob> {
    const nextPatch: UpdateScheduledAutomationJobInput = { ...patch }
    if (patch.schedule) {
      const parsed = parseScheduleInput(patch.schedule, this.now())
      nextPatch.schedule = parsed.schedule
      nextPatch.nextRunAtMs = patch.nextRunAtMs ?? computeNextRunAtMs(parsed.schedule, this.now())
    }
    const job = await this.store.updateJob(jobId, nextPatch)
    await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.jobUpdated, workspaceId: job.workspaceId, job })
    return job
  }

  async deleteJob(jobId: string): Promise<ScheduledAutomationJob> {
    const job = await this.store.deleteJob(jobId)
    await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.jobDeleted, workspaceId: job.workspaceId, job })
    return job
  }

  async pauseJob(jobId: string): Promise<ScheduledAutomationJob> {
    const job = await this.store.pauseJob(jobId)
    await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.jobPaused, workspaceId: job.workspaceId, job })
    return job
  }

  async resumeJob(jobId: string): Promise<ScheduledAutomationJob> {
    const current = await this.store.requireJob(jobId)
    const nextRunAtMs = current.nextRunAtMs && current.nextRunAtMs > this.now() ? current.nextRunAtMs : computeNextRunAtMs(current.schedule, this.now())
    const job = await this.store.resumeJob(jobId, nextRunAtMs)
    await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.jobResumed, workspaceId: job.workspaceId, job })
    return job
  }

  listJobs(query: ScheduledAutomationListQuery = {}): Promise<ScheduledAutomationJob[]> {
    return this.store.readJobs(query)
  }

  getJob(jobId: string): Promise<ScheduledAutomationJob> {
    return this.store.requireJob(jobId)
  }

  listRuns(query: ScheduledAutomationRunQuery = {}): Promise<ScheduledAutomationRun[]> {
    return this.store.readRuns(query)
  }

  listLegacyScheduleProjections(): Promise<ScheduledAutomationJob[]> {
    return this.store.readLegacyScheduleProjections()
  }

  async listDueJobs(input: { nowMs?: number; maxJobs?: number } = {}): Promise<ScheduledAutomationJob[]> {
    return this.store.listDueJobs(input.nowMs ?? this.now(), input.maxJobs ?? 20)
  }

  async tick(input: { nowMs?: number; maxJobs?: number } = {}): Promise<ScheduledAutomationTickResult> {
    const nowMs = input.nowMs ?? this.now()
    const tickEventId = await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.tickStarted, workspaceId: this.workspaceId, payload: { nowMs } })
    const due = await this.store.listDueJobs(nowMs, input.maxJobs ?? 20)
    const runs: ScheduledAutomationRun[] = []
    const errors: Array<{ jobId: string; message: string }> = []
    for (const job of due) {
      try {
        runs.push(await this.runJob(job, { reason: 'scheduled', nowMs, scheduledForMs: job.nextRunAtMs ?? nowMs }))
      } catch (error) {
        errors.push({ jobId: job.jobId, message: errorMessage(error) })
      }
    }
    await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.tickCompleted, workspaceId: this.workspaceId, payload: { nowMs, dueCount: due.length, processedCount: runs.length, errors, tickEventId } })
    return { ok: errors.length === 0, nowMs, dueCount: due.length, processedCount: runs.length, runs, errors }
  }

  async runJobNow(jobId: string, reason: ScheduledAutomationRunReason = 'manual'): Promise<ScheduledAutomationRun> {
    const nowMs = this.now()
    const job = await this.store.requireJob(jobId)
    return this.runJob(job, { reason, nowMs, scheduledForMs: nowMs, manual: true })
  }

  async health(): Promise<ScheduledAutomationHealth> {
    const [jobs, due, runs] = await Promise.all([
      this.store.readJobs({ includeDeleted: true }),
      this.store.listDueJobs(this.now(), 50),
      this.store.readRuns({ limit: 20 }),
    ])
    return {
      ok: true,
      workspaceId: this.workspaceId,
      activeJobCount: jobs.filter(job => job.status === 'active').length,
      pausedJobCount: jobs.filter(job => job.status === 'paused').length,
      deletedJobCount: jobs.filter(job => job.status === 'deleted').length,
      dueJobCount: due.length,
      recentRunCount: runs.length,
      lastRun: runs[0],
      warnings: jobs.flatMap(job => isUnsupportedSchedule(job.schedule) ? [`${job.jobId}: unsupported_cron_expression`] : []),
    }
  }

  private async runJob(job: ScheduledAutomationJob, input: { reason: ScheduledAutomationRunReason; nowMs: number; scheduledForMs: number; manual?: boolean }): Promise<ScheduledAutomationRun> {
    if (job.status !== 'active') {
      const skipped = await this.store.recordRunStart(baseRun(job, input))
      return this.store.completeRun(skipped, { status: 'skipped', message: 'job is not active' })
    }
    const unsupported = isUnsupportedSchedule(job.schedule)
    const started = await this.store.recordRunStart(baseRun(job, input))
    const startEventId = await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.runStarted, workspaceId: job.workspaceId, job, run: started })
    const startedWithEvent = startEventId ? { ...started, eventIds: [...started.eventIds, startEventId] } : started
    if (unsupported) {
      const skipped = await this.store.completeRun(startedWithEvent, { status: 'skipped', message: unsupported })
      const eventId = await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.runSkipped, workspaceId: job.workspaceId, job, run: skipped, payload: { reason: unsupported } })
      return eventId ? this.store.completeRun(skipped, { eventIds: [...skipped.eventIds, eventId] }) : skipped
    }
    try {
      const result = await this.executor.execute(job, startedWithEvent)
      const completed = await this.store.completeRun(startedWithEvent, { status: result.status, message: result.message, output: result.output })
      const nextRunAtMs = input.manual ? job.nextRunAtMs : computeNextRunAtMs(job.schedule, input.nowMs, { afterRun: true })
      const currentRunCount = job.runCount ?? 0
      await this.store.updateJob(job.jobId, { nextRunAtMs, lastRunAtMs: completed.completedAtMs, lastRunId: completed.runId, runCount: currentRunCount + 1, metadata: job.metadata })
      const eventType = result.status === 'completed' ? SCHEDULED_EVENT_TYPES.runCompleted : result.status === 'skipped' ? SCHEDULED_EVENT_TYPES.runSkipped : SCHEDULED_EVENT_TYPES.runFailed
      const eventId = await appendScheduledEvent({ durable: this.durable, eventType, workspaceId: job.workspaceId, job, run: completed, payload: { message: result.message } })
      return eventId ? this.store.completeRun(completed, { eventIds: [...completed.eventIds, eventId] }) : completed
    } catch (error) {
      const failed = await this.store.completeRun(startedWithEvent, { status: 'failed', error: errorMessage(error), message: 'scheduled automation failed' })
      await this.store.updateJob(job.jobId, { nextRunAtMs: computeNextRunAtMs(job.schedule, input.nowMs, { afterRun: true }), lastRunAtMs: failed.completedAtMs, lastRunId: failed.runId, metadata: job.metadata })
      const eventId = await appendScheduledEvent({ durable: this.durable, eventType: SCHEDULED_EVENT_TYPES.runFailed, workspaceId: job.workspaceId, job, run: failed, payload: { error: errorMessage(error) } })
      return eventId ? this.store.completeRun(failed, { eventIds: [...failed.eventIds, eventId] }) : failed
    }
  }
}

function baseRun(job: ScheduledAutomationJob, input: { reason: ScheduledAutomationRunReason; scheduledForMs: number }): Omit<ScheduledAutomationRun, 'status' | 'startedAtMs' | 'eventIds'> {
  return {
    runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    jobId: job.jobId,
    workspaceId: job.workspaceId,
    reason: input.reason,
    scheduledForMs: input.scheduledForMs,
    actionType: job.action.type,
    deliveryMode: job.delivery.mode,
    attempt: 1,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
