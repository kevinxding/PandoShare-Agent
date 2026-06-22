import type { ScheduledAutomationRun } from './ScheduledAutomationTypes.js'

export function summarizeScheduledRuns(runs: readonly ScheduledAutomationRun[]): Record<string, number> {
  return runs.reduce<Record<string, number>>((summary, run) => {
    summary[run.status] = (summary[run.status] ?? 0) + 1
    return summary
  }, {})
}
