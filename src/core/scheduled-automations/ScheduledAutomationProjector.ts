import type { ScheduledAutomationHealth, ScheduledAutomationJob, ScheduledAutomationRun } from './ScheduledAutomationTypes.js'

export type ScheduledAutomationProjection = {
  health: ScheduledAutomationHealth
  jobs: ScheduledAutomationJob[]
  recentRuns: ScheduledAutomationRun[]
}

export function projectScheduledAutomations(input: { health: ScheduledAutomationHealth; jobs: ScheduledAutomationJob[]; runs: ScheduledAutomationRun[] }): ScheduledAutomationProjection {
  return { health: input.health, jobs: input.jobs, recentRuns: input.runs }
}
