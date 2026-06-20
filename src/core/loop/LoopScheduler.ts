import type { LoopState, TaskProjection } from './LoopProjector.js'

export type LoopSchedulerPolicy = {
  maxAttempts?: number
}

export type ScheduleDecision =
  | { type: 'run_task'; task: TaskProjection; reason: string }
  | { type: 'wait_human'; gateId: string; reason: string }
  | { type: 'blocked'; reason: string }
  | { type: 'completed'; reason: string }
  | { type: 'noop'; reason: string }

export function selectNextTask(loopState: LoopState, policy: LoopSchedulerPolicy = {}): ScheduleDecision {
  const maxAttempts = policy.maxAttempts ?? 3
  if (loopState.pendingHumanGateId) return { type: 'wait_human', gateId: loopState.pendingHumanGateId, reason: 'human gate is pending' }
  if (loopState.status === 'completed') return { type: 'completed', reason: 'loop is already completed' }
  if (loopState.status === 'blocked') return { type: 'blocked', reason: 'loop is blocked' }
  if (!loopState.tasks.length) return { type: 'blocked', reason: 'loop has no tasks' }
  const queued = loopState.tasks.find(task => task.status === 'queued' || task.status === 'created')
  if (queued) return { type: 'run_task', task: queued, reason: 'queued task is ready' }
  const retryable = loopState.tasks.find(task => task.status === 'failed' && task.retryCount < maxAttempts)
  if (retryable) return { type: 'run_task', task: retryable, reason: `failed task retry ${retryable.retryCount + 1}/${maxAttempts}` }
  const exhausted = loopState.tasks.find(task => task.status === 'failed' && task.retryCount >= maxAttempts)
  if (exhausted) return { type: 'blocked', reason: `task ${exhausted.taskId} reached maxAttempts=${maxAttempts}` }
  if (loopState.tasks.every(task => task.status === 'completed')) return { type: 'completed', reason: 'all tasks completed' }
  if (loopState.activeTaskId || loopState.activeAttemptId) return { type: 'noop', reason: 'loop has an active task or attempt' }
  return { type: 'noop', reason: 'no schedulable task' }
}
