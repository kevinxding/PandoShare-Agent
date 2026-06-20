import { QueryEngine, type QueryEngineOptions } from '../../QueryEngine.js'
import type { QueryTurnOutput } from '../../query.js'
import type { AgentEvent } from '../../services/events/index.js'

// TODO: legacy adapter. QueryEngine remains the proven executor while core owns entry boundaries.
export class AgentKernelAdapter {
  private readonly engine: QueryEngine

  constructor(readonly options: QueryEngineOptions) {
    this.engine = new QueryEngine(options)
  }

  run(prompt: string): Promise<QueryTurnOutput> {
    return this.engine.run(prompt)
  }

  submitMessage(prompt: string): Promise<QueryTurnOutput> {
    return this.engine.submitMessage(prompt)
  }

  events(): readonly AgentEvent[] {
    return this.engine.events()
  }

  threadId(): string | undefined {
    return this.engine.threadId()
  }

  abort(reason?: unknown): void {
    this.engine.abort(reason)
  }
}
