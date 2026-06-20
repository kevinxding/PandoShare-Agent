#!/usr/bin/env node
const core = await import('../dist/src/core/index.js')

const events = [
  event(3, 'loop_task_queued', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke' }, { taskId: 'task_projection_smoke', title: 'Projection task' }),
  event(1, 'loop_goal_created', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke' }, { objective: 'Projection smoke.' }),
  event(2, 'loop_plan_created', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke' }, { planId: 'plan_projection_smoke' }),
]
const first = core.projectLoopState(events)
const second = core.projectLoopState(events)
assert(JSON.stringify(first) === JSON.stringify(second), 'projectLoopState should be deterministic')
assert(first.status === 'planned', `expected planned after sorted seq projection, got ${first.status}`)
assert(first.tasks[0]?.taskId === 'task_projection_smoke', 'projection should process events by seq')

const human = core.projectLoopState([
  ...events,
  event(4, 'loop_human_gate_requested', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke' }, { gateId: 'gate_projection_smoke', reason: 'review', requestedAction: 'approve task' }),
])
assert(human.status === 'waiting_human', `expected waiting_human, got ${human.status}`)
assert(human.pendingHumanGateId === 'gate_projection_smoke', 'human gate should be pending')

const failed = core.projectLoopState([
  ...events,
  event(4, 'loop_task_started', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke' }, { taskId: 'task_projection_smoke' }),
  event(5, 'loop_attempt_started', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke' }, { attemptId: 'attempt_one' }),
  event(6, 'loop_attempt_failed', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke' }, { attemptId: 'attempt_one', message: 'failed' }),
  event(7, 'loop_task_failed', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke' }, { taskId: 'task_projection_smoke' }),
])
assert(failed.failureCount === 2, `expected failureCount=2 for failed attempt + task, got ${failed.failureCount}`)
assert(failed.tasks[0]?.retryCount === 1, `expected retryCount=1, got ${failed.tasks[0]?.retryCount}`)

const completedEvents = [
  ...events,
  event(4, 'loop_task_started', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke' }, { taskId: 'task_projection_smoke' }),
  event(5, 'loop_attempt_started', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke' }, { attemptId: 'attempt_done' }),
  event(6, 'loop_attempt_completed', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke', runId: 'run_projection_smoke' }, { attemptId: 'attempt_done', runId: 'run_projection_smoke' }),
  event(7, 'loop_task_completed', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke', taskId: 'task_projection_smoke', runId: 'run_projection_smoke' }, { taskId: 'task_projection_smoke' }),
  event(8, 'loop_completed', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke' }, { reason: 'done' }),
]
const completed = core.projectLoopState(completedEvents)
assert(completed.status === 'completed', `expected completed, got ${completed.status}`)

const conflict = core.projectLoopState([
  ...completedEvents,
  event(9, 'loop_blocked', { loopId: 'loop_projection_smoke', goalId: 'goal_projection_smoke' }, { reason: 'conflict' }),
])
assert(conflict.warnings.some(warning => warning.includes('terminal event conflict')), 'duplicate terminal conflict should warn')

console.log('loop projection smoke passed')

function event(seq, eventType, ids, payload) {
  return {
    schemaVersion: 1,
    eventId: `evt_projection_${seq}`,
    seq,
    eventType,
    workspaceId: 'default',
    loopId: ids.loopId,
    goalId: ids.goalId,
    taskId: ids.taskId,
    runId: ids.runId,
    createdAtMs: 1000 + seq,
    payload,
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
