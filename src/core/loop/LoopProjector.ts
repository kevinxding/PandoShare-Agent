import type { EventEnvelope } from '../protocol/index.js'
import { LOOP_EVENT_TYPES } from './LoopEventTypes.js'
import type { LoopVerifierSpec, TaskExecutionMode } from './LoopTypes.js'

export type LoopProjectionStatus = 'created' | 'planned' | 'running' | 'waiting_human' | 'blocked' | 'completed' | 'failed' | 'interrupted'
export type TaskProjectionStatus = 'created' | 'queued' | 'running' | 'completed' | 'failed' | 'blocked'
export type AttemptProjectionStatus = 'created' | 'running' | 'completed' | 'failed'

export type TaskProjection = {
  taskId: string
  goalId?: string
  title: string
  status: TaskProjectionStatus
  executionMode: TaskExecutionMode
  verifier?: LoopVerifierSpec
  requiresApproval: boolean
  retryCount: number
  lastAttemptId?: string
  updatedAtMs: number
}

export type AttemptProjection = {
  attemptId: string
  taskId?: string
  runId?: string
  status: AttemptProjectionStatus
  checkpointId?: string
  summary?: string
  failureReason?: string
  startedAtMs?: number
  completedAtMs?: number
  updatedAtMs: number
}

export type GoalState = {
  goalId: string
  objective?: string
  status: LoopProjectionStatus
  createdAtMs?: number
  updatedAtMs: number
  warnings: string[]
}

export type TaskState = TaskProjection & { warnings: string[] }
export type AttemptState = AttemptProjection & { warnings: string[] }

export type HumanGateProjection = {
  gateId: string
  taskId?: string
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
  risk?: string
  requestedAction?: string
  createdAtMs?: number
  resolvedAtMs?: number
}

export type LoopState = {
  workspaceId: string
  loopId: string
  goalId: string
  status: LoopProjectionStatus
  tasks: TaskProjection[]
  attempts: AttemptProjection[]
  humanGates: HumanGateProjection[]
  activeTaskId?: string
  activeAttemptId?: string
  pendingHumanGateId?: string
  lastRunId?: string
  lastCheckpointId?: string
  verificationSummary?: string
  recoveryDecision?: string
  failureCount: number
  updatedAtMs: number
  warnings: string[]
}

export function projectLoopState(events: readonly EventEnvelope[]): LoopState {
  const sorted = [...events].sort((left, right) => left.seq - right.seq || left.createdAtMs - right.createdAtMs || left.eventId.localeCompare(right.eventId))
  const warnings: string[] = []
  const tasks = new Map<string, TaskProjection>()
  const attempts = new Map<string, AttemptProjection>()
  const gates = new Map<string, HumanGateProjection>()
  let workspaceId = first(sorted, event => event.workspaceId) ?? 'unknown'
  let loopId = first(sorted, event => event.loopId ?? getString(event.payload, 'loopId')) ?? 'unknown_loop'
  let goalId = first(sorted, event => event.goalId ?? getString(event.payload, 'goalId')) ?? 'unknown_goal'
  let status: LoopProjectionStatus = 'created'
  let activeTaskId: string | undefined
  let activeAttemptId: string | undefined
  let pendingHumanGateId: string | undefined
  let lastRunId: string | undefined
  let lastCheckpointId: string | undefined
  let verificationSummary: string | undefined
  let recoveryDecision: string | undefined
  let failureCount = 0
  let updatedAtMs = 0
  let terminal: string | undefined

  for (const event of sorted) {
    updatedAtMs = Math.max(updatedAtMs, event.createdAtMs)
    workspaceId = event.workspaceId || workspaceId
    loopId = event.loopId ?? getString(event.payload, 'loopId') ?? loopId
    goalId = event.goalId ?? getString(event.payload, 'goalId') ?? goalId
    const taskId = event.taskId ?? getString(event.payload, 'taskId')
    const attemptId = getString(event.payload, 'attemptId')
    if (event.runId) lastRunId = event.runId

    switch (event.eventType) {
      case LOOP_EVENT_TYPES.goalCreated:
        status = 'created'
        break
      case LOOP_EVENT_TYPES.planCreated:
        if (status === 'created') status = 'planned'
        break
      case LOOP_EVENT_TYPES.taskCreated:
        upsertTask(tasks, event, taskId, 'created', warnings)
        if (status === 'created') status = 'planned'
        break
      case LOOP_EVENT_TYPES.taskQueued:
        upsertTask(tasks, event, taskId, 'queued', warnings)
        if (status === 'created') status = 'planned'
        break
      case LOOP_EVENT_TYPES.taskStarted:
        upsertTask(tasks, event, taskId, 'running', warnings)
        activeTaskId = taskId
        status = 'running'
        break
      case LOOP_EVENT_TYPES.taskCompleted:
        upsertTask(tasks, event, taskId, 'completed', warnings)
        if (activeTaskId === taskId) activeTaskId = undefined
        break
      case LOOP_EVENT_TYPES.taskFailed:
        upsertTask(tasks, event, taskId, 'failed', warnings)
        failureCount += 1
        if (activeTaskId === taskId) activeTaskId = undefined
        status = 'failed'
        break
      case LOOP_EVENT_TYPES.attemptStarted:
        upsertAttempt(attempts, event, attemptId, taskId, 'running', warnings)
        if (taskId) linkAttempt(tasks, taskId, attemptId)
        activeAttemptId = attemptId
        activeTaskId = taskId ?? activeTaskId
        status = 'running'
        break
      case LOOP_EVENT_TYPES.attemptCompleted:
        upsertAttempt(attempts, event, attemptId, taskId, 'completed', warnings)
        if (activeAttemptId === attemptId) activeAttemptId = undefined
        break
      case LOOP_EVENT_TYPES.attemptFailed:
        upsertAttempt(attempts, event, attemptId, taskId, 'failed', warnings)
        if (activeAttemptId === attemptId) activeAttemptId = undefined
        failureCount += 1
        status = 'failed'
        break
      case LOOP_EVENT_TYPES.verificationStarted:
        status = 'running'
        break
      case LOOP_EVENT_TYPES.verificationCompleted:
        verificationSummary = getString(event.payload, 'summary') ?? getString(event.payload, 'message') ?? verificationSummary
        break
      case LOOP_EVENT_TYPES.humanGateRequested: {
        const gateId = getString(event.payload, 'gateId')
        if (!gateId) warnings.push(`event ${event.seq} missing gateId`)
        else {
          gates.set(gateId, {
            gateId,
            taskId,
            status: 'pending',
            reason: getString(event.payload, 'reason'),
            risk: getString(event.payload, 'risk'),
            requestedAction: getString(event.payload, 'requestedAction'),
            createdAtMs: getNumber(event.payload, 'createdAtMs') ?? event.createdAtMs,
          })
          pendingHumanGateId = gateId
          status = 'waiting_human'
        }
        break
      }
      case LOOP_EVENT_TYPES.humanGateResolved: {
        const gateId = getString(event.payload, 'gateId')
        if (!gateId) warnings.push(`event ${event.seq} missing gateId`)
        else {
          const previous = gates.get(gateId)
          const approved = getBoolean(event.payload, 'approved')
          gates.set(gateId, {
            gateId,
            taskId: taskId ?? previous?.taskId,
            status: approved === false ? 'rejected' : 'approved',
            reason: previous?.reason,
            risk: previous?.risk,
            requestedAction: previous?.requestedAction,
            createdAtMs: previous?.createdAtMs,
            resolvedAtMs: getNumber(event.payload, 'resolvedAtMs') ?? event.createdAtMs,
          })
          if (pendingHumanGateId === gateId) pendingHumanGateId = undefined
          status = approved === false ? 'blocked' : 'planned'
        }
        break
      }
      case LOOP_EVENT_TYPES.checkpointCreated:
        lastCheckpointId = getString(event.payload, 'checkpointId') ?? lastCheckpointId
        break
      case LOOP_EVENT_TYPES.recoveryDecided:
        recoveryDecision = getString(event.payload, 'decision') ?? recoveryDecision
        break
      case LOOP_EVENT_TYPES.resumed:
        if (terminal && !getBoolean(event.payload, 'force')) warnings.push(`event ${event.seq} attempted to resume terminal loop after ${terminal}`)
        else {
          status = 'planned'
          terminal = undefined
        }
        break
      case LOOP_EVENT_TYPES.blocked:
        status = 'blocked'
        terminal = noteTerminal(terminal, event.eventType, event.seq, warnings)
        break
      case LOOP_EVENT_TYPES.completed:
        status = 'completed'
        terminal = noteTerminal(terminal, event.eventType, event.seq, warnings)
        break
      case LOOP_EVENT_TYPES.legacyEventBridged:
        status = legacyStatus(event.payload) ?? status
        break
    }
  }

  const taskList = [...tasks.values()].sort((left, right) => left.updatedAtMs - right.updatedAtMs || left.taskId.localeCompare(right.taskId))
  if (taskList.length && taskList.every(task => task.status === 'completed') && status !== 'completed' && status !== 'blocked') status = 'completed'
  return {
    workspaceId,
    loopId,
    goalId,
    status,
    tasks: taskList,
    attempts: [...attempts.values()].sort((left, right) => left.updatedAtMs - right.updatedAtMs || left.attemptId.localeCompare(right.attemptId)),
    humanGates: [...gates.values()].sort((left, right) => (left.createdAtMs ?? 0) - (right.createdAtMs ?? 0) || left.gateId.localeCompare(right.gateId)),
    activeTaskId,
    activeAttemptId,
    pendingHumanGateId,
    lastRunId,
    lastCheckpointId,
    verificationSummary,
    recoveryDecision,
    failureCount,
    updatedAtMs,
    warnings,
  }
}

export function projectGoalState(events: readonly EventEnvelope[], goalId: string): GoalState {
  const relevant = events.filter(event => event.goalId === goalId || getString(event.payload, 'goalId') === goalId)
  const state = projectLoopState(relevant)
  return { goalId, objective: first(relevant, event => getString(event.payload, 'objective')), status: state.status, createdAtMs: first(relevant, event => event.createdAtMs), updatedAtMs: state.updatedAtMs, warnings: state.warnings }
}

export function projectTaskState(events: readonly EventEnvelope[], taskId: string): TaskState {
  const state = projectLoopState(events.filter(event => event.taskId === taskId || getString(event.payload, 'taskId') === taskId))
  const task = state.tasks.find(item => item.taskId === taskId)
  return task ? { ...task, warnings: state.warnings } : { taskId, title: 'Unknown task', status: 'created', executionMode: 'code', requiresApproval: false, retryCount: 0, updatedAtMs: 0, warnings: [`task not found: ${taskId}`] }
}

export function projectAttemptState(events: readonly EventEnvelope[], attemptId: string): AttemptState {
  const state = projectLoopState(events.filter(event => getString(event.payload, 'attemptId') === attemptId))
  const attempt = state.attempts.find(item => item.attemptId === attemptId)
  return attempt ? { ...attempt, warnings: state.warnings } : { attemptId, status: 'created', updatedAtMs: 0, warnings: [`attempt not found: ${attemptId}`] }
}

function upsertTask(tasks: Map<string, TaskProjection>, event: EventEnvelope, taskId: string | undefined, status: TaskProjectionStatus, warnings: string[]): void {
  if (!taskId) {
    warnings.push(`event ${event.seq} missing taskId`)
    return
  }
  const payloadTask = getRecord(event.payload, 'task')
  const previous = tasks.get(taskId)
  tasks.set(taskId, {
    taskId,
    goalId: event.goalId ?? getString(event.payload, 'goalId') ?? previous?.goalId,
    title: getString(event.payload, 'title') ?? getRecordString(payloadTask, 'title') ?? previous?.title ?? 'Loop task',
    status,
    executionMode: taskExecutionMode(getString(event.payload, 'executionMode') ?? getRecordString(payloadTask, 'executionMode') ?? previous?.executionMode),
    verifier: getVerifier(event.payload, 'verifier') ?? getVerifier(payloadTask, 'verifier') ?? previous?.verifier,
    requiresApproval: getBoolean(event.payload, 'requiresApproval') ?? getRecordBoolean(payloadTask, 'requiresApproval') ?? previous?.requiresApproval ?? false,
    retryCount: previous?.retryCount ?? 0,
    lastAttemptId: getString(event.payload, 'attemptId') ?? previous?.lastAttemptId,
    updatedAtMs: event.createdAtMs,
  })
}

function upsertAttempt(attempts: Map<string, AttemptProjection>, event: EventEnvelope, attemptId: string | undefined, taskId: string | undefined, status: AttemptProjectionStatus, warnings: string[]): void {
  if (!attemptId) {
    warnings.push(`event ${event.seq} missing attemptId`)
    return
  }
  const previous = attempts.get(attemptId)
  attempts.set(attemptId, {
    attemptId,
    taskId: taskId ?? previous?.taskId,
    runId: event.runId ?? getString(event.payload, 'runId') ?? previous?.runId,
    status,
    checkpointId: getString(event.payload, 'checkpointId') ?? previous?.checkpointId,
    summary: getString(event.payload, 'summary') ?? previous?.summary,
    failureReason: getString(event.payload, 'message') ?? getString(event.payload, 'reason') ?? previous?.failureReason,
    startedAtMs: status === 'running' ? event.createdAtMs : previous?.startedAtMs,
    completedAtMs: status === 'completed' || status === 'failed' ? event.createdAtMs : previous?.completedAtMs,
    updatedAtMs: event.createdAtMs,
  })
}

function linkAttempt(tasks: Map<string, TaskProjection>, taskId: string, attemptId: string | undefined): void {
  if (!attemptId) return
  const task = tasks.get(taskId)
  if (!task) return
  tasks.set(taskId, { ...task, retryCount: task.retryCount + 1, lastAttemptId: attemptId })
}

function noteTerminal(previous: string | undefined, next: string, seq: number, warnings: string[]): string {
  if (previous && previous !== next) warnings.push(`terminal event conflict at seq ${seq}: ${previous} then ${next}`)
  if (previous && previous === next) warnings.push(`duplicate terminal event at seq ${seq}: ${next}`)
  return previous ?? next
}

function getRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const next = (value as Record<string, unknown>)[key]
  return next && typeof next === 'object' && !Array.isArray(next) ? next as Record<string, unknown> : undefined
}

function getString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const next = (value as Record<string, unknown>)[key]
  return typeof next === 'string' && next.trim() ? next : undefined
}

function getNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const next = (value as Record<string, unknown>)[key]
  return typeof next === 'number' && Number.isFinite(next) ? next : undefined
}

function getBoolean(value: unknown, key: string): boolean | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const next = (value as Record<string, unknown>)[key]
  return typeof next === 'boolean' ? next : undefined
}

function getRecordString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getRecordBoolean(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = record?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function getVerifier(value: unknown, key: string): LoopVerifierSpec | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const verifier = (value as Record<string, unknown>)[key]
  if (!verifier || typeof verifier !== 'object' || Array.isArray(verifier)) return undefined
  const type = (verifier as { type?: unknown }).type
  return type === 'command' || type === 'file' || type === 'custom' ? verifier as LoopVerifierSpec : undefined
}

function taskExecutionMode(value: unknown): TaskExecutionMode {
  return value === 'code' || value === 'gui' || value === 'gateway' || value === 'mixed' || value === 'research' ? value : 'code'
}

function legacyStatus(payload: unknown): LoopProjectionStatus | undefined {
  const status = getString(payload, 'status')
  if (status === 'created' || status === 'running' || status === 'blocked' || status === 'completed' || status === 'failed') return status
  if (status === 'paused' || status === 'stopped') return 'interrupted'
  return undefined
}

function first<T>(events: readonly EventEnvelope[], pick: (event: EventEnvelope) => T | undefined): T | undefined {
  for (const event of events) {
    const value = pick(event)
    if (value !== undefined) return value
  }
  return undefined
}
