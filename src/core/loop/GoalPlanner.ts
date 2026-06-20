import type { Goal, Plan, Task } from './LoopTypes.js'

export class GoalPlanner {
  createGoal(input: {
    goalId?: string
    objective: string
    successCriteria?: readonly string[]
    constraints?: readonly string[]
  }): Goal {
    const objective = input.objective.trim()
    if (!objective) throw new Error('Goal objective must not be empty')
    return {
      goalId: input.goalId ?? `goal_${Date.now()}_${shortId()}`,
      objective,
      successCriteria: input.successCriteria ?? [],
      constraints: input.constraints ?? [],
      status: 'created',
      createdAtMs: Date.now(),
    }
  }

  createPlan(goal: Goal): Plan {
    const task: Task = {
      taskId: `task_${Date.now()}_${shortId()}`,
      goalId: goal.goalId,
      title: firstLine(goal.objective),
      status: 'queued',
      executionMode: 'code',
      verifier: {
        type: 'custom',
        name: 'manual_review',
      },
      requiresApproval: false,
    }
    return {
      planId: `plan_${Date.now()}_${shortId()}`,
      goalId: goal.goalId,
      tasks: [task],
      createdAtMs: Date.now(),
    }
  }
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim().slice(0, 100) || 'Loop task'
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10)
}
