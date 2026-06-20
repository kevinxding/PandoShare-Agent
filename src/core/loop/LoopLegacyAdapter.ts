import type { DurableRuntime } from '../durable/index.js'
import { LOOP_EVENT_TYPES } from './LoopEventTypes.js'

export type LegacyLoopBridgeInput = {
  workspaceId: string
  loopId: string
  goalId?: string
  status?: string
  eventType: string
  createdAtMs?: number
  data?: unknown
}

export type LegacyLoopProjection = {
  loopId: string
  status?: string
  iterationCount: number
  lastRunId?: string
  lastFailurePolicyEvent?: string
}

export class LoopLegacyAdapter {
  constructor(private readonly durable: DurableRuntime) {}

  async bridgeLegacyEvent(input: LegacyLoopBridgeInput): Promise<void> {
    await this.durable.appendEvent({
      eventType: LOOP_EVENT_TYPES.legacyEventBridged,
      workspaceId: input.workspaceId,
      loopId: input.loopId,
      goalId: input.goalId,
      createdAtMs: input.createdAtMs,
      payload: {
        loopId: input.loopId,
        status: input.status,
        legacyEventType: input.eventType,
        data: input.data,
      },
    })
  }

  buildLegacyProjection(input: {
    loopId: string
    status?: string
    runs?: readonly { runId?: string; status?: string }[]
    iterations?: readonly unknown[]
    events?: readonly { type?: string }[]
  }): LegacyLoopProjection {
    return {
      loopId: input.loopId,
      status: input.status,
      iterationCount: input.iterations?.length ?? 0,
      lastRunId: [...(input.runs ?? [])].reverse().find(run => run.runId)?.runId,
      lastFailurePolicyEvent: [...(input.events ?? [])].reverse().find(event => event.type === 'loop_failure_policy_triggered')?.type,
    }
  }
}
