import type { QueryTurnOutput } from '../../query.js'
import type { CommandEnvelope } from '../protocol/index.js'
import { AgentKernelAdapter } from './AgentKernelAdapter.js'

export type AgentRunPayload = {
  prompt: string
}

export class AgentCommandHandler {
  constructor(private readonly adapter: AgentKernelAdapter) {}

  async handle(command: CommandEnvelope): Promise<QueryTurnOutput> {
    if (command.commandType !== 'agent.run') {
      throw new Error(`Unsupported AgentKernel command: ${command.commandType}`)
    }
    const payload = command.payload as Partial<AgentRunPayload>
    if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
      throw new Error('agent.run command requires payload.prompt')
    }
    return this.adapter.run(payload.prompt)
  }
}
