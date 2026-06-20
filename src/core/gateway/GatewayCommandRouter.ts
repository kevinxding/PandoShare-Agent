import { createCommandEnvelope } from '../protocol/index.js'
import type { GatewayCommandRoute, GatewayInboundMessage } from './GatewayTypes.js'

export class GatewayCommandRouter {
  constructor(private readonly workspaceId: string) {}

  route(message: GatewayInboundMessage): GatewayCommandRoute {
    const [command = '', ...rest] = message.text.trim().split(/\s+/)
    const argumentText = rest.join(' ')
    switch (command.toLowerCase()) {
      case '/status':
        return this.command(message, 'gateway.status', { message })
      case '/goal':
        return this.command(message, 'loop.goal', { objective: argumentText, message })
      case '/loops':
        return this.command(message, 'loop.list', { message })
      case '/approve':
        return this.command(message, 'approval.resolve', { decision: 'approve', targetId: rest[0], message })
      case '/deny':
        return this.command(message, 'approval.resolve', { decision: 'deny', targetId: rest[0], message })
      case '/stop':
        return this.command(message, 'agent.stop', { reason: argumentText || 'Gateway stop command.', message })
      default:
        return this.command(message, 'agent.run', { prompt: message.text, message })
    }
  }

  private command(message: GatewayInboundMessage, commandType: string, payload: unknown): GatewayCommandRoute {
    return {
      command: createCommandEnvelope({
        commandType,
        workspaceId: this.workspaceId,
        source: 'gateway',
        payload,
      }),
      replyText: `queued ${commandType}`,
    }
  }
}
