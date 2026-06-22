import type { DurableRuntime } from '../durable/index.js'
import type { GatewayDaemon, GatewayChannelKind } from '../gateway/index.js'
import { LocalAutomationQueue } from '../../services/automationQueue/index.js'
import type { ScheduledAutomationExecutorResult, ScheduledAutomationJob, ScheduledAutomationRun } from './ScheduledAutomationTypes.js'

export type ScheduledBackendHandle = {
  handle(input: { action: string; payload?: unknown; context?: Record<string, unknown>; requestId?: string }): Promise<unknown>
}

export type ScheduledAutomationExecutorOptions = {
  workspaceRoot: string
  workspaceId?: string
  durable?: DurableRuntime
  gateway?: GatewayDaemon
  automationQueue?: LocalAutomationQueue
  backend?: ScheduledBackendHandle
  loopWake?: { tick(): Promise<{ ok: boolean; loopId?: string; message: string }> }
}

export class ScheduledAutomationExecutor {
  private readonly queue: LocalAutomationQueue

  constructor(private readonly options: ScheduledAutomationExecutorOptions) {
    this.queue = options.automationQueue ?? new LocalAutomationQueue(options.workspaceRoot)
  }

  async execute(job: ScheduledAutomationJob, run: ScheduledAutomationRun): Promise<ScheduledAutomationExecutorResult> {
    const payload = job.action.payload ?? {}
    switch (job.action.type) {
      case 'gateway_message': return this.gatewayMessage(job, run, payload)
      case 'remote_trigger': return this.remoteTrigger(job, run, payload)
      case 'system_event': return this.systemEvent(job, run, payload)
      case 'loop_wake': return this.loopWake()
      case 'agent_turn': return this.agentTurn(job, run, payload)
      case 'command': return { status: 'skipped', message: 'command action is schema-only and denied by default.' }
      case 'webhook': return { status: 'skipped', message: 'webhook action is schema-only and denied by default.' }
    }
  }

  private async gatewayMessage(job: ScheduledAutomationJob, run: ScheduledAutomationRun, payload: Record<string, unknown>): Promise<ScheduledAutomationExecutorResult> {
    if (!this.options.gateway) return { status: 'skipped', message: 'gateway daemon is not configured.' }
    const channelId = stringValue(payload.channelId) ?? stringValue(payload.channel) ?? job.delivery.channelId ?? 'local'
    const userId = stringValue(payload.userId) ?? job.delivery.userId ?? 'operator'
    const text = stringValue(payload.text) ?? stringValue(payload.message) ?? job.title
    const channelKind = gatewayChannelKind(stringValue(payload.channelKind) ?? channelId)
    const outbound = await this.options.gateway.enqueueOutbound({
      channelId,
      channelKind,
      userId,
      text,
      metadata: { scheduledJobId: job.jobId, scheduledRunId: run.runId },
    })
    return { status: 'completed', message: 'gateway message queued.', output: { deliveryId: outbound.deliveryId, channelId: outbound.channelId, status: outbound.status } }
  }

  private async remoteTrigger(job: ScheduledAutomationJob, run: ScheduledAutomationRun, payload: Record<string, unknown>): Promise<ScheduledAutomationExecutorResult> {
    const trigger = await this.queue.createTrigger({
      channel: stringValue(payload.channel) ?? 'scheduled',
      payload: stringValue(payload.payload) ?? stringValue(payload.text) ?? job.title,
      goalId: stringValue(payload.goalId),
      taskId: stringValue(payload.taskId),
    })
    return { status: 'completed', message: 'remote trigger queued.', output: { triggerId: trigger.triggerId, scheduledRunId: run.runId } }
  }

  private async systemEvent(job: ScheduledAutomationJob, run: ScheduledAutomationRun, payload: Record<string, unknown>): Promise<ScheduledAutomationExecutorResult> {
    const event = await this.options.durable?.appendEvent({
      eventType: 'scheduled_system_event',
      workspaceId: job.workspaceId,
      runId: run.runId,
      payload: { jobId: job.jobId, runId: run.runId, ...payload },
    })
    return { status: 'completed', message: 'system event recorded.', output: event ? { eventId: event.eventId } : undefined }
  }

  private async loopWake(): Promise<ScheduledAutomationExecutorResult> {
    if (!this.options.loopWake) return { status: 'skipped', message: 'loop wake scheduler is not configured.' }
    const wake = await this.options.loopWake.tick()
    return { status: wake.ok ? 'completed' : 'skipped', message: wake.message, output: { loopId: wake.loopId, ok: wake.ok } }
  }

  private async agentTurn(job: ScheduledAutomationJob, run: ScheduledAutomationRun, payload: Record<string, unknown>): Promise<ScheduledAutomationExecutorResult> {
    if (!this.options.backend) return { status: 'skipped', message: 'backend handle is not configured for agent_turn.' }
    const prompt = stringValue(payload.prompt) ?? stringValue(payload.text) ?? job.title
    const response = await this.options.backend.handle({
      action: 'agent.run',
      requestId: `scheduled_agent_${run.runId}`,
      payload: { prompt, scheduledJobId: job.jobId, scheduledRunId: run.runId },
      context: { threadId: `scheduled_${job.jobId}_${run.runId}`, runId: run.runId },
    })
    return { status: 'completed', message: 'agent turn submitted.', output: { backend: response as Record<string, unknown> } }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function gatewayChannelKind(value: string): GatewayChannelKind | undefined {
  if (value === 'local' || value === 'mock' || value === 'telegram' || value === 'feishu' || value === 'lark' || value === 'wecom') return value
  return undefined
}
