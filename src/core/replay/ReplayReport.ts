import type { ReplayTimelineItem } from './EventReplay.js'
import type { ConsistencyAuditResult, KernelCheckpoint, RecoveryDecision } from '../durable/index.js'
import type { LoopState } from '../loop/index.js'

export class ReplayReport {
  toMarkdown(input: {
    title?: string
    runId?: string
    status?: string
    timeline: readonly ReplayTimelineItem[]
    checkpoints?: readonly KernelCheckpoint[]
    recoveryDecision?: RecoveryDecision
    audit?: ConsistencyAuditResult
    loopState?: LoopState
  }): string {
    const inferredLoopState = input.loopState
    const lines = [
      `# ${input.title ?? 'Pando Run Replay'}`,
      '',
      ...(input.runId ? [`Run: ${input.runId}`, ''] : []),
      ...(input.status ? [`Status: ${input.status}`, ''] : []),
      `Total events: ${input.timeline.length}`,
      '',
      ...(inferredLoopState ? [
        '## Loop Projection',
        '',
        `Loop: ${inferredLoopState.loopId}`,
        `Goal: ${inferredLoopState.goalId}`,
        `Status: ${inferredLoopState.status}`,
        `Tasks: ${inferredLoopState.tasks.length}`,
        `Attempts: ${inferredLoopState.attempts.length}`,
        `Pending human gate: ${inferredLoopState.pendingHumanGateId ?? 'none'}`,
        `Verification: ${inferredLoopState.verificationSummary ?? 'none'}`,
        `Recovery decision: ${inferredLoopState.recoveryDecision ?? 'none'}`,
        ...(inferredLoopState.tasks.length ? ['', ...inferredLoopState.tasks.map(task => `- task ${task.taskId}: ${task.status} (${task.title})`)] : []),
        ...(inferredLoopState.attempts.length ? ['', ...inferredLoopState.attempts.map(attempt => `- attempt ${attempt.attemptId}: ${attempt.status}${attempt.runId ? ` run=${attempt.runId}` : ''}`)] : []),
        ...(inferredLoopState.warnings.length ? ['', ...inferredLoopState.warnings.map(warning => `- warning: ${warning}`)] : []),
        '',
      ] : []),
      ...(input.recoveryDecision ? [
        '## Recovery',
        '',
        `Decision: ${input.recoveryDecision.decision}`,
        `Reason: ${input.recoveryDecision.reason}`,
        '',
      ] : []),
      ...(input.audit ? [
        '## Audit',
        '',
        `OK: ${input.audit.ok ? 'true' : 'false'}`,
        `Warnings: ${input.audit.warnings.length}`,
        `Errors: ${input.audit.errors.length}`,
        ...input.audit.warnings.map(warning => `- warning: ${warning}`),
        ...input.audit.errors.map(error => `- error: ${error}`),
        '',
      ] : []),
      ...(input.checkpoints?.length ? [
        '## Checkpoints',
        '',
        ...input.checkpoints.map(checkpoint => `- ${checkpoint.checkpointId}: ${checkpoint.status}, lastSeq=${checkpoint.lastEventSeq}`),
        '',
      ] : []),
      '## Timeline',
      '',
    ]
    for (const item of input.timeline) {
      lines.push(`- ${item.seq}. ${item.category}/${item.eventType} (${new Date(item.createdAtMs).toISOString()})`)
      if (item.warning) lines.push(`  warning: ${item.warning}`)
    }
    return `${lines.join('\n')}\n`
  }
}
