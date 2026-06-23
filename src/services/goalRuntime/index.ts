import { GoalService } from '../goalService/index.js'
import { LocalGoalStore, type GoalExportData, type GoalSummary } from '../goalStore/index.js'

export type GoalRuntimeStepResult = {
  message: string
  tokenUsage?: number
  threadId?: string
  runId?: string
}

export type GoalRuntimeOptions = {
  sessionId: string
  idle?: boolean
  threadId?: string
  maxRuntimeMs?: number
  maxRuns?: number
  maxTokens?: number
  onContinue?: (goal: GoalExportData) => Promise<GoalRuntimeStepResult> | GoalRuntimeStepResult
}

export type GoalRuntimeOutput = {
  ok: boolean
  goal?: GoalSummary
  status: 'no_active_goal' | 'continued' | 'usage_limited' | 'budget_limited' | 'failed'
  message: string
  threadId?: string
  runId?: string
}

export class GoalRuntime {
  readonly service: GoalService

  constructor(readonly store: LocalGoalStore) {
    this.service = new GoalService(store)
  }

  async resumeActiveGoal(options: GoalRuntimeOptions): Promise<GoalRuntimeOutput> {
    const active = await this.service.activeGoal()
    if (!active) {
      return {
        ok: true,
        status: 'no_active_goal',
        message: 'No active goal found.',
      }
    }
    return this.continueGoal(active.metadata.goalId, options)
  }

  async continueGoal(goalId: string, options: GoalRuntimeOptions): Promise<GoalRuntimeOutput> {
    const startedAtMs = Date.now()
    const data = await this.service.readGoal(goalId)
    if (options.maxRuns !== undefined && (data.metadata.usageRunCount ?? 0) >= options.maxRuns) {
      const goal = await this.service.updateGoal(goalId, {
        status: 'usage_limited',
        reason: `Goal reached maxRuns=${options.maxRuns}.`,
        source: 'runtime',
      })
      return {
        ok: true,
        goal,
        status: 'usage_limited',
        message: `Goal reached maxRuns=${options.maxRuns}.`,
      }
    }
    if (options.maxTokens !== undefined && (data.metadata.usageTokens ?? 0) >= options.maxTokens) {
      const goal = await this.service.updateGoal(goalId, {
        status: 'budget_limited',
        reason: `Goal reached maxTokens=${options.maxTokens}.`,
        source: 'runtime',
      })
      return {
        ok: true,
        goal,
        status: 'budget_limited',
        message: `Goal reached maxTokens=${options.maxTokens}.`,
      }
    }

    const runId = `goal_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await this.store.appendRun(goalId, {
      runId,
      kind: 'manual',
      status: 'started',
      startedAtMs,
      threadId: options.threadId,
      summary: options.idle ? 'Goal runtime idle continuation started.' : 'Goal runtime resumed.',
    })

    try {
      const result = options.onContinue
        ? await options.onContinue(data)
        : { message: options.idle ? 'Goal runtime checked active goal while idle.' : 'Goal runtime resumed active goal.' }
      const completedAtMs = Date.now()
      const durationMs = completedAtMs - startedAtMs
      if (options.maxRuntimeMs !== undefined && durationMs > options.maxRuntimeMs) {
        const goal = await this.service.updateGoal(goalId, {
          status: 'usage_limited',
          reason: `Goal runtime exceeded maxRuntimeMs=${options.maxRuntimeMs}.`,
          source: 'runtime',
        })
        return {
          ok: true,
          goal,
          status: 'usage_limited',
          message: `Goal runtime exceeded maxRuntimeMs=${options.maxRuntimeMs}.`,
        }
      }
      await this.store.appendRun(goalId, {
        runId,
        kind: 'manual',
        status: 'completed',
        startedAtMs,
        completedAtMs,
        durationMs,
        tokenUsage: result.tokenUsage,
        threadId: result.threadId ?? options.threadId,
        summary: result.message,
      })
      await this.store.appendProgress(goalId, result.message)
      await this.store.appendCheckpoint(goalId, result.message)
      return {
        ok: true,
        goal: await this.service.readSummary(goalId),
        status: 'continued',
        message: result.message,
        threadId: result.threadId ?? options.threadId,
        runId: result.runId ?? runId,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const completedAtMs = Date.now()
      await this.store.appendRun(goalId, {
        runId,
        kind: 'manual',
        status: 'failed',
        startedAtMs,
        completedAtMs,
        durationMs: completedAtMs - startedAtMs,
        threadId: options.threadId,
        summary: message,
      })
      await this.store.appendProgress(goalId, `Goal runtime stopped after error: ${message}`)
      await this.store.appendCheckpoint(goalId, `Goal runtime stopped after error: ${message}`)
      return {
        ok: false,
        goal: await this.service.readSummary(goalId),
        status: 'failed',
        message,
        threadId: options.threadId,
        runId,
      }
    }
  }
}
export function buildGoalContextMessage(goal: GoalExportData): string {
  const requirements = goal.requirements.length
    ? goal.requirements.map(requirement => {
        const blocker = requirement.blocker ? ` blocker=${oneLine(requirement.blocker, 160)}` : ''
        return `- [${requirement.status}] ${requirement.requirementId}: ${oneLine(requirement.text, 280)}${blocker}`
      })
    : ['- No explicit requirements recorded. Use the objective as the acceptance target.']
  const progress = goal.progress.slice(-5).map(entry =>
    `- ${new Date(entry.createdAtMs).toISOString()} ${entry.status} ${entry.progressPercent}%: ${oneLine(entry.message, 260)}`,
  )
  const evidence = goal.evidence.slice(-5).map(entry =>
    `- ${entry.type}/${entry.strength}: ${oneLine(entry.summary, 260)}`,
  )
  const checkpoints = goal.checkpoints.slice(-3).map(entry =>
    `- ${new Date(entry.createdAtMs).toISOString()} ${entry.progressPercent}%: ${oneLine(entry.summary, 260)}`,
  )

  return [
    '[active goal]',
    `goalId: ${goal.metadata.goalId}`,
    `status: ${goal.metadata.status}`,
    `progressPercent: ${goal.metadata.progressPercent}`,
    'objective:',
    goal.objective.trim(),
    'requirements:',
    ...requirements,
    'recent_progress:',
    ...(progress.length ? progress : ['- None recorded yet.']),
    'recent_evidence:',
    ...(evidence.length ? evidence : ['- None recorded yet.']),
    'recent_checkpoints:',
    ...(checkpoints.length ? checkpoints : ['- None recorded yet.']),
    'execution_rules:',
    '- Treat this as the active long-running goal for the current run.',
    '- Keep moving on the most useful next step until the goal is truly handled or a real blocker is reached.',
    '- Use get_goal when you need the full ledger.',
    '- Only call update_goal with completed when the acceptance evidence is sufficient.',
    '- Only call update_goal with blocked when the same blocker has repeated and no meaningful progress is possible without user input.',
    '[/active goal]',
  ].join('\n')
}

export function buildGoalContinuationPrompt(goal: GoalExportData, options: { idle?: boolean } = {}): string {
  const action = options.idle ? 'The app is idle. Continue the active goal if there is meaningful work to do.' : 'Continue working on the active goal now.'
  return [
    action,
    '',
    `Goal: ${oneLine(goal.metadata.title || goal.objective, 180)}`,
    '',
    'Use the active goal context already provided to this turn. Do not restate the whole goal unless it helps the work.',
    'If the goal is complete, update the goal as completed with concise evidence. If blocked, update it as blocked with a concrete reason.',
  ].join('\n')
}

function oneLine(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length <= maxChars ? collapsed : `${collapsed.slice(0, maxChars)}...`
}
