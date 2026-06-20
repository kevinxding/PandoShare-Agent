import type { QueryEngineOptions } from '../../QueryEngine.js'
import type { QueryTurnOutput } from '../../query.js'
import type { AgentEvent } from '../../services/events/index.js'
import { DurableRuntime } from '../durable/index.js'
import {
  createCommandEnvelope,
  type CommandEnvelope,
  type CommandSource,
  type EventEnvelope,
} from '../protocol/index.js'
import { AgentCommandHandler } from './AgentCommandHandler.js'
import { AgentKernelAdapter } from './AgentKernelAdapter.js'
import { RunStateMachine } from './RunStateMachine.js'

export type AgentKernelOptions = QueryEngineOptions & {
  workspaceId?: string
  commandSource?: CommandSource
  durable?: DurableRuntime
}

export class AgentKernel {
  private readonly durable: DurableRuntime
  private readonly adapter: AgentKernelAdapter
  private readonly commandHandler: AgentCommandHandler
  private readonly stateMachine: RunStateMachine
  private readonly envelopeEvents: EventEnvelope[] = []

  constructor(private readonly options: AgentKernelOptions) {
    const workspaceId = options.workspaceId ?? 'default'
    this.durable = options.durable ?? new DurableRuntime({ workspaceRoot: options.cwd, workspaceId })
    this.adapter = new AgentKernelAdapter(options)
    this.commandHandler = new AgentCommandHandler(this.adapter)
    this.stateMachine = new RunStateMachine(async event => {
      this.envelopeEvents.push(event)
      await this.durable.appendEvent(event)
    })
  }

  async submit(command: CommandEnvelope): Promise<QueryTurnOutput> {
    const run = await this.stateMachine.startRun(command)
    try {
      const output = await this.commandHandler.handle(command)
      await this.stateMachine.completeRun(run.runId, {
        threadId: this.threadId(),
        finalTextPreview: output.finalText.slice(0, 500),
      })
      await this.durable.createCheckpoint({
        workspaceId: command.workspaceId,
        threadId: this.threadId() ?? command.threadId,
        runId: run.runId,
        goalId: command.goalId,
        loopId: command.loopId,
        payload: {
          message: 'AgentKernel run completed.',
        },
      })
      return output
    } catch (error) {
      await this.stateMachine.failRun(run.runId, error)
      throw error
    }
  }

  submitMessage(prompt: string): Promise<QueryTurnOutput> {
    return this.run(prompt)
  }

  run(prompt: string): Promise<QueryTurnOutput> {
    const command = createCommandEnvelope({
      commandType: 'agent.run',
      workspaceId: this.options.workspaceId ?? 'default',
      source: this.options.commandSource ?? 'cli',
      threadId: this.options.threadId,
      goalId: this.options.goalId,
      payload: {
        prompt,
      },
    })
    return this.submit(command)
  }

  events(): readonly AgentEvent[] {
    return this.adapter.events()
  }

  coreEvents(): readonly EventEnvelope[] {
    return this.envelopeEvents
  }

  threadId(): string | undefined {
    return this.adapter.threadId()
  }

  abort(reason?: unknown): void {
    this.adapter.abort(reason)
  }
}
