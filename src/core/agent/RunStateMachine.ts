import {
  createEventEnvelope,
  type CommandEnvelope,
  type EventEnvelope,
  type EventEnvelopeSink,
} from '../protocol/index.js'

export type RunStatus =
  | 'created'
  | 'started'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'interrupted'

export type RunState = {
  runId: string
  workspaceId: string
  threadId?: string
  goalId?: string
  loopId?: string
  status: RunStatus
  createdAtMs: number
  updatedAtMs: number
  lastError?: string
}

export class RunStateTransitionError extends Error {
  constructor(
    message: string,
    readonly from: RunStatus,
    readonly to: RunStatus,
  ) {
    super(message)
    this.name = 'RunStateTransitionError'
  }
}

export class RunStateMachine {
  private readonly runs = new Map<string, RunState>()

  constructor(private readonly emitEvent?: EventEnvelopeSink) {}

  async startRun(command: CommandEnvelope): Promise<RunState> {
    const runId = command.runId ?? `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const now = Date.now()
    const state: RunState = {
      runId,
      workspaceId: command.workspaceId,
      threadId: command.threadId,
      goalId: command.goalId,
      loopId: command.loopId,
      status: 'created',
      createdAtMs: now,
      updatedAtMs: now,
    }
    this.runs.set(runId, state)
    await this.transition(runId, 'started', {
      commandId: command.commandId,
      commandType: command.commandType,
      source: command.source,
    })
    await this.transition(runId, 'running', {
      commandId: command.commandId,
      commandType: command.commandType,
    })
    return this.requireRun(runId)
  }

  async resumeRun(threadId: string, runId: string): Promise<RunState> {
    const state = this.runs.get(runId)
    if (!state) throw new Error(`Cannot resume missing run: ${runId}`)
    if (state.threadId !== threadId) throw new Error(`Run ${runId} does not belong to thread ${threadId}`)
    await this.transition(runId, 'running', { reason: 'resume' })
    return this.requireRun(runId)
  }

  async interruptRun(runId: string): Promise<RunState> {
    await this.transition(runId, 'interrupted', { reason: 'interrupt_requested' })
    return this.requireRun(runId)
  }

  async completeRun(runId: string, payload: Record<string, unknown> = {}): Promise<RunState> {
    await this.transition(runId, 'completed', payload)
    return this.requireRun(runId)
  }

  async failRun(runId: string, error: unknown): Promise<RunState> {
    const message = error instanceof Error ? error.message : String(error)
    await this.transition(runId, 'failed', { message })
    const state = this.requireRun(runId)
    const next = { ...state, lastError: message }
    this.runs.set(runId, next)
    return next
  }

  readRun(runId: string): RunState | undefined {
    return this.runs.get(runId)
  }

  private async transition(runId: string, to: RunStatus, payload: Record<string, unknown>): Promise<void> {
    const current = this.requireRun(runId)
    if (!isAllowedTransition(current.status, to)) {
      const error = new RunStateTransitionError(
        `Illegal run state transition: ${current.status} -> ${to}`,
        current.status,
        to,
      )
      await this.emitRunEvent('run_failed', current, { message: error.message, attemptedStatus: to })
      throw error
    }
    const next = {
      ...current,
      status: to,
      updatedAtMs: Date.now(),
    }
    this.runs.set(runId, next)
    await this.emitRunEvent(eventTypeForStatus(to), next, payload)
  }

  private async emitRunEvent(eventType: string, state: RunState, payload: Record<string, unknown>): Promise<void> {
    if (!this.emitEvent) return
    const event = createEventEnvelope({
      eventType,
      workspaceId: state.workspaceId,
      threadId: state.threadId,
      runId: state.runId,
      goalId: state.goalId,
      loopId: state.loopId,
      payload: {
        status: state.status,
        ...payload,
      },
    })
    await this.emitEvent(event)
  }

  private requireRun(runId: string): RunState {
    const state = this.runs.get(runId)
    if (!state) throw new Error(`Missing run state: ${runId}`)
    return state
  }
}

function isAllowedTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return true
  const allowed: Record<RunStatus, readonly RunStatus[]> = {
    created: ['started', 'failed', 'interrupted'],
    started: ['running', 'failed', 'interrupted'],
    running: ['waiting_approval', 'completed', 'failed', 'interrupted'],
    waiting_approval: ['running', 'completed', 'failed', 'interrupted'],
    completed: [],
    failed: [],
    interrupted: [],
  }
  return allowed[from].includes(to)
}

function eventTypeForStatus(status: RunStatus): EventEnvelope['eventType'] {
  switch (status) {
    case 'started':
    case 'running':
      return 'run_start'
    case 'completed':
      return 'run_complete'
    case 'failed':
      return 'run_failed'
    case 'waiting_approval':
      return 'approval'
    case 'interrupted':
      return 'run_failed'
    case 'created':
      return 'run_start'
  }
}
