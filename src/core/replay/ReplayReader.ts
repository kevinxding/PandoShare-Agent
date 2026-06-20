import { DurableRuntime } from '../durable/index.js'
import type { EventEnvelope } from '../protocol/index.js'

export class ReplayReader {
  constructor(private readonly durable: DurableRuntime) {}

  read(input: { threadId?: string; runId?: string; loopId?: string } = {}): Promise<EventEnvelope[]> {
    if (input.runId) return this.durable.readRunEvents(input.runId)
    if (input.threadId) return this.durable.readThreadEvents(input.threadId)
    return this.durable.readEvents(input)
  }
}
