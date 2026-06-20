import { DurableRuntime } from '../durable/index.js'
import { projectLoopState, type LoopState } from '../loop/index.js'
import type { EventEnvelope } from '../protocol/index.js'

export type LoopReplay = {
  loopId: string
  events: EventEnvelope[]
  state: LoopState
}

export class ReplayReader {
  constructor(private readonly durable: DurableRuntime) {}

  read(input: { threadId?: string; runId?: string; loopId?: string } = {}): Promise<EventEnvelope[]> {
    if (input.runId) return this.durable.readRunEvents(input.runId)
    if (input.threadId) return this.durable.readThreadEvents(input.threadId)
    return this.durable.readEvents(input)
  }

  async buildLoopReplay(loopId: string): Promise<LoopReplay> {
    const events = await this.durable.readEvents({ loopId })
    return {
      loopId,
      events,
      state: projectLoopState(events),
    }
  }

  replayLoop(loopId: string): Promise<LoopReplay> {
    return this.buildLoopReplay(loopId)
  }
}
