export type LoopIdentitySource = 'cli' | 'web' | 'gateway' | 'daemon' | 'test'

export type LoopIdentity = {
  workspaceId: string
  loopId: string
  goalId: string
  rootThreadId?: string
  createdByCommandId?: string
  source: LoopIdentitySource
  createdAtMs: number
}

export function createLoopIdentity(input: {
  workspaceId: string
  loopId?: string
  goalId?: string
  rootThreadId?: string
  createdByCommandId?: string
  source?: LoopIdentitySource
  createdAtMs?: number
}): LoopIdentity {
  const createdAtMs = input.createdAtMs ?? Date.now()
  return {
    workspaceId: input.workspaceId,
    loopId: input.loopId ?? createLoopId(createdAtMs),
    goalId: input.goalId ?? createGoalId(createdAtMs),
    rootThreadId: input.rootThreadId,
    createdByCommandId: input.createdByCommandId,
    source: input.source ?? 'daemon',
    createdAtMs,
  }
}

export function createLoopId(nowMs = Date.now()): string {
  return createScopedId('loop', nowMs)
}

export function createGoalId(nowMs = Date.now()): string {
  return createScopedId('goal', nowMs)
}

export function createPlanId(nowMs = Date.now()): string {
  return createScopedId('plan', nowMs)
}

export function createTaskId(nowMs = Date.now()): string {
  return createScopedId('task', nowMs)
}

export function createAttemptId(nowMs = Date.now()): string {
  return createScopedId('attempt', nowMs)
}

export function createGateId(nowMs = Date.now()): string {
  return createScopedId('gate', nowMs)
}

export function createLoopCheckpointId(nowMs = Date.now()): string {
  return createScopedId('loop_checkpoint', nowMs)
}

function createScopedId(prefix: string, nowMs: number): string {
  const time = Math.max(0, Math.trunc(nowMs)).toString(36)
  const entropy = Math.random().toString(36).slice(2, 12)
  return `${prefix}_${time}_${entropy}`
}
