import { createStructuredErrorResult, createTextResult, type ToolDefinition } from '../../Tool.js'
import { LocalAutomationQueue } from '../../services/automationQueue/index.js'
import { ScheduledAutomationRuntime } from '../../core/scheduled-automations/index.js'
import { optionalString, requiredString } from '../shared/index.js'

export const ScheduleCronTool: ToolDefinition = {
  name: 'schedule_cron',
  description: 'Register a local cron-like schedule record for Gateway/heartbeat driven goal or task continuation.',
  safety: 'workspace_write',
  platforms: ['all'],
  behavior: { reads: true, writes: true, background: true },
  concurrency: 'serial',
  inputSchema: {
    type: 'object',
    properties: {
      schedule: { type: 'string' },
      command: { type: 'string' },
      goalId: { type: 'string' },
      taskId: { type: 'string' },
      loopId: { type: 'string' },
    },
    required: ['schedule', 'command'],
  },
  async execute(toolUse, context) {
    try {
      const schedule = requiredString(toolUse.input, 'schedule')
      const command = requiredString(toolUse.input, 'command')
      const goalId = optionalString(toolUse.input, 'goalId') ?? metadataString(context, 'goalId')
      const taskId = optionalString(toolUse.input, 'taskId') ?? metadataString(context, 'taskId')
      const loopId = optionalString(toolUse.input, 'loopId') ?? metadataString(context, 'loopId')
      const record = await new LocalAutomationQueue(context.cwd).createSchedule({ schedule, command, goalId, taskId, loopId })
      let scheduledJobId: string | undefined
      try {
        const job = await new ScheduledAutomationRuntime({ workspaceRoot: context.cwd, workspaceId: 'default' }).createJob({
          title: 'Tool schedule ' + record.scheduleId,
          schedule,
          action: { type: 'remote_trigger', payload: { channel: 'schedule_cron', payload: record.command, goalId, taskId, loopId } },
          delivery: { mode: 'queue_only' },
          source: 'tool',
          metadata: { legacyScheduleId: record.scheduleId },
        })
        scheduledJobId = job.jobId
      } catch {
        scheduledJobId = undefined
      }
      return createTextResult(toolUse.id, JSON.stringify({ ...record, scheduledJobId }, null, 2), true, { scheduleId: record.scheduleId, scheduledJobId })
    } catch (error) {
      return createStructuredErrorResult(toolUse.id, error, { toolName: 'schedule_cron' })
    }
  },
}

function metadataString(context: { metadata?: Record<string, unknown> }, key: string): string | undefined {
  const value = context.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
