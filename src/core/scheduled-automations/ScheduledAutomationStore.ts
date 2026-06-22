import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseScheduleInput } from './ScheduleParser.js'
import { redactScheduledValue } from './ScheduledAutomationRedaction.js'
import type {
  CreateScheduledAutomationJobInput,
  ScheduledAutomationAction,
  ScheduledAutomationDelivery,
  ScheduledAutomationJob,
  ScheduledAutomationListQuery,
  ScheduledAutomationRun,
  ScheduledAutomationRunQuery,
  ScheduledAutomationStatus,
  UpdateScheduledAutomationJobInput,
} from './ScheduledAutomationTypes.js'

const SCHEDULED_DIR = '.pandoshare/scheduled'
const JOBS_FILE = 'jobs.jsonl'
const RUNS_FILE = 'runs.jsonl'
const LEGACY_AUTOMATION_DIR = '.pandoshare/automation'
const LEGACY_SCHEDULES_FILE = 'schedules.jsonl'

export type ScheduledAutomationJobRecord = ScheduledAutomationJob & { recordType: 'job_snapshot' }
export type ScheduledAutomationRunRecord = ScheduledAutomationRun & { recordType: 'run_snapshot' }

export class ScheduledAutomationStore {
  readonly root: string

  constructor(readonly workspaceRoot: string, readonly workspaceId = 'default') {
    this.root = join(workspaceRoot, SCHEDULED_DIR)
  }

  async createJob(input: CreateScheduledAutomationJobInput & { nextRunAtMs?: number }): Promise<ScheduledAutomationJob> {
    const now = Date.now()
    const jobId = sanitizeId(input.jobId ?? `job_${now}_${shortId()}`, 'jobId')
    if (await this.readJob(jobId)) throw new Error('scheduled job already exists: ' + jobId)
    const job: ScheduledAutomationJob = {
      jobId,
      title: stringOr(input.title, 'Scheduled automation'),
      status: 'active',
      workspaceId: input.workspaceId ?? this.workspaceId,
      createdAtMs: now,
      updatedAtMs: now,
      schedule: parseScheduleInput(input.schedule, now).schedule,
      action: normalizeAction(input.action),
      delivery: normalizeDelivery(input.delivery),
      source: input.source ?? 'api',
      nextRunAtMs: input.nextRunAtMs,
      runCount: 0,
      metadata: redactScheduledValue(input.metadata ?? {}),
    }
    await this.appendJob(job)
    return job
  }

  async updateJob(jobId: string, patch: UpdateScheduledAutomationJobInput): Promise<ScheduledAutomationJob> {
    const current = await this.requireJob(jobId)
    const next: ScheduledAutomationJob = {
      ...current,
      ...patch,
      jobId: current.jobId,
      workspaceId: current.workspaceId,
      createdAtMs: current.createdAtMs,
      updatedAtMs: Date.now(),
      metadata: patch.metadata ? redactScheduledValue(patch.metadata) : current.metadata,
    }
    await this.appendJob(next)
    return next
  }

  pauseJob(jobId: string): Promise<ScheduledAutomationJob> {
    return this.updateJob(jobId, { status: 'paused' })
  }

  resumeJob(jobId: string, nextRunAtMs?: number): Promise<ScheduledAutomationJob> {
    return this.updateJob(jobId, { status: 'active', nextRunAtMs })
  }

  deleteJob(jobId: string): Promise<ScheduledAutomationJob> {
    return this.updateJob(jobId, { status: 'deleted', nextRunAtMs: undefined })
  }

  async readJob(jobId: string): Promise<ScheduledAutomationJob | undefined> {
    return (await this.readJobs({ includeDeleted: true })).find(job => job.jobId === jobId)
  }

  async requireJob(jobId: string): Promise<ScheduledAutomationJob> {
    const job = await this.readJob(sanitizeId(jobId, 'jobId'))
    if (!job) throw new Error('scheduled job not found: ' + jobId)
    return job
  }

  async readJobs(query: ScheduledAutomationListQuery = {}): Promise<ScheduledAutomationJob[]> {
    const snapshots = await this.readJsonl<ScheduledAutomationJobRecord>(JOBS_FILE)
    const byId = new Map<string, ScheduledAutomationJob>()
    for (const record of snapshots) byId.set(record.jobId, stripRecordType(record))
    const jobs = Array.from(byId.values())
      .filter(job => query.includeDeleted || job.status !== 'deleted')
      .filter(job => query.status === undefined || job.status === query.status)
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    return typeof query.limit === 'number' ? jobs.slice(0, Math.max(0, query.limit)) : jobs
  }

  async readLegacyScheduleProjections(): Promise<ScheduledAutomationJob[]> {
    const records = await readJsonlFromPath<Record<string, unknown>>(join(this.workspaceRoot, LEGACY_AUTOMATION_DIR, LEGACY_SCHEDULES_FILE))
    return records.flatMap(record => {
      const scheduleId = stringValue(record.scheduleId)
      const scheduleText = stringValue(record.schedule)
      if (!scheduleId || !scheduleText) return []
      const now = Date.now()
      const parsed = parseScheduleInput(scheduleText, now).schedule
      return [{
        jobId: sanitizeId(`legacy_${scheduleId}`, 'jobId'),
        title: `Legacy schedule ${scheduleId}`,
        status: legacyStatus(record.status),
        workspaceId: this.workspaceId,
        createdAtMs: numberValue(record.createdAtMs) ?? now,
        updatedAtMs: numberValue(record.updatedAtMs) ?? now,
        schedule: parsed,
        action: { type: 'remote_trigger', payload: { channel: 'legacy', payload: stringValue(record.command) ?? '' } },
        delivery: { mode: 'queue_only' },
        source: 'legacy_automation_queue',
        nextRunAtMs: numberValue(record.nextRunAtMs),
        lastRunAtMs: numberValue(record.lastRunAtMs),
        runCount: numberValue(record.runCount) ?? 0,
        metadata: redactScheduledValue({ scheduleId, goalId: record.goalId, taskId: record.taskId, loopId: record.loopId }),
      } satisfies ScheduledAutomationJob]
    })
  }

  async listDueJobs(nowMs = Date.now(), maxJobs = 20): Promise<ScheduledAutomationJob[]> {
    const jobs = await this.readJobs({ status: 'active' })
    const due: ScheduledAutomationJob[] = []
    for (const job of jobs) {
      if (job.nextRunAtMs === undefined || job.nextRunAtMs > nowMs) continue
      if (await this.findRunForSlot(job.jobId, job.nextRunAtMs)) continue
      due.push(job)
      if (due.length >= maxJobs) break
    }
    return due.sort((left, right) => (left.nextRunAtMs ?? 0) - (right.nextRunAtMs ?? 0))
  }

  async recordRunStart(input: Omit<ScheduledAutomationRun, 'status' | 'startedAtMs' | 'eventIds'> & { eventIds?: string[]; startedAtMs?: number }): Promise<ScheduledAutomationRun> {
    const existing = await this.findRunForSlot(input.jobId, input.scheduledForMs)
    if (existing) return existing
    const run: ScheduledAutomationRun = {
      ...input,
      status: 'started',
      startedAtMs: input.startedAtMs ?? Date.now(),
      eventIds: input.eventIds ?? [],
    }
    await this.appendRun(run)
    return run
  }

  async completeRun(run: ScheduledAutomationRun, patch: Partial<ScheduledAutomationRun>): Promise<ScheduledAutomationRun> {
    const next: ScheduledAutomationRun = {
      ...run,
      ...patch,
      status: patch.status ?? run.status,
      completedAtMs: patch.completedAtMs ?? Date.now(),
      eventIds: uniqueStrings([...(run.eventIds ?? []), ...((patch.eventIds ?? []) as string[])]),
    }
    await this.appendRun(next)
    return next
  }

  async readRuns(query: ScheduledAutomationRunQuery = {}): Promise<ScheduledAutomationRun[]> {
    const snapshots = await this.readJsonl<ScheduledAutomationRunRecord>(RUNS_FILE)
    const byId = new Map<string, ScheduledAutomationRun>()
    for (const record of snapshots) byId.set(record.runId, stripRecordType(record))
    const runs = Array.from(byId.values())
      .filter(run => query.jobId === undefined || run.jobId === query.jobId)
      .sort((left, right) => right.startedAtMs - left.startedAtMs)
    return typeof query.limit === 'number' ? runs.slice(0, Math.max(0, query.limit)) : runs
  }

  async findRunForSlot(jobId: string, scheduledForMs: number): Promise<ScheduledAutomationRun | undefined> {
    return (await this.readRuns({ jobId })).find(run => run.scheduledForMs === scheduledForMs)
  }

  private async appendJob(job: ScheduledAutomationJob): Promise<void> {
    await this.appendJsonl(JOBS_FILE, { ...redactScheduledValue(job), recordType: 'job_snapshot' })
  }

  private async appendRun(run: ScheduledAutomationRun): Promise<void> {
    await this.appendJsonl(RUNS_FILE, { ...redactScheduledValue(run), recordType: 'run_snapshot' })
  }

  private async appendJsonl(filename: string, value: unknown): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await appendFile(join(this.root, filename), JSON.stringify(value) + '\n', 'utf8')
  }

  private async readJsonl<T>(filename: string): Promise<T[]> {
    await mkdir(this.root, { recursive: true })
    return readJsonlFromPath<T>(join(this.root, filename))
  }
}

function normalizeAction(value: unknown): ScheduledAutomationAction {
  const record = recordOrThrow(value, 'action')
  const type = stringValue(record.type)
  if (!type || !['gateway_message', 'agent_turn', 'loop_wake', 'remote_trigger', 'system_event', 'command', 'webhook'].includes(type)) {
    throw new Error('action.type is not supported')
  }
  return { type: type as ScheduledAutomationAction['type'], payload: redactScheduledValue(recordOrEmpty(record.payload)) }
}

function normalizeDelivery(value: unknown): ScheduledAutomationDelivery {
  const record = recordOrEmpty(value)
  const mode = stringValue(record.mode) ?? 'none'
  if (mode !== 'none' && mode !== 'gateway' && mode !== 'queue_only') throw new Error('delivery.mode is not supported')
  return { mode, channelId: stringValue(record.channelId), userId: stringValue(record.userId) }
}

function legacyStatus(value: unknown): ScheduledAutomationStatus {
  if (value === 'disabled' || value === 'processed') return 'paused'
  return 'active'
}

async function readJsonlFromPath<T>(path: string): Promise<T[]> {
  try {
    const text = await readFile(path, 'utf8')
    return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line) as T] } catch { return [] }
    })
  } catch {
    return []
  }
}

function stripRecordType<T extends { recordType?: string }>(record: T): Omit<T, 'recordType'> {
  const { recordType: _recordType, ...rest } = record
  return rest
}

function sanitizeId(value: string, name: string): string {
  const trimmed = value.trim()
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) throw new Error(name + ' must use ASCII letters, numbers, underscore, and hyphen')
  return trimmed
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

function stringOr(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function recordOrThrow(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(name + ' must be an object')
  return value as Record<string, unknown>
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}
