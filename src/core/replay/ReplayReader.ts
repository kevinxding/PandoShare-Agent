import { DurableRuntime } from '../durable/index.js'
import type { EventEnvelope } from '../protocol/index.js'

export class ReplayReader {
  constructor(private readonly durable: DurableRuntime) {}

  read(input: { threadId?: string; runId?: string; loopId?: string } = {}): Promise<EventEnvelope[]> {
    return this.durable.readEvents(input)
  }
}
