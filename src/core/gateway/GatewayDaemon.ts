import { DurableRuntime } from '../durable/index.js'
import { JsonlStore, RuntimePaths } from '../store/index.js'
import { GatewayCommandRouter } from './GatewayCommandRouter.js'
import { GatewayDeliveryQueue } from './GatewayDeliveryQueue.js'
import type { GatewayCommandRoute, GatewayInboundMessage } from './GatewayTypes.js'

export class GatewayDaemon {
  readonly queue: GatewayDeliveryQueue
  private readonly durable: DurableRuntime
  private readonly router: GatewayCommandRouter

  constructor(private readonly input: { workspaceRoot: string; workspaceId?: string; runtimeId?: string }) {
    const workspaceId = input.workspaceId ?? 'default'
    const paths = new RuntimePaths({ workspaceRoot: input.workspaceRoot, workspaceId })
    this.queue = new GatewayDeliveryQueue(
      new JsonlStore(paths.queuePath('gateway-inbound')),
      new JsonlStore(paths.queuePath('gateway-outbound')),
    )
    this.durable = new DurableRuntime({ workspaceRoot: input.workspaceRoot, workspaceId })
    this.router = new GatewayCommandRouter(workspaceId)
  }

  async receive(message: Omit<GatewayInboundMessage, 'messageId' | 'createdAtMs'>): Promise<GatewayCommandRoute> {
    const fullMessage: GatewayInboundMessage = {
      messageId: `gw_msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      createdAtMs: Date.now(),
      ...message,
    }
    await this.queue.enqueueInbound(fullMessage)
    await this.writeHeartbeat('running', 'Gateway received a message.')
    const route = this.router.route(fullMessage)
    await this.durable.appendEvent({
      eventType: 'gateway_message',
      workspaceId: this.input.workspaceId ?? 'default',
      payload: {
        message: fullMessage,
        commandType: route.command.commandType,
      },
    })
    if (route.replyText) {
      await this.queue.enqueueOutbound({
        replyToMessageId: fullMessage.messageId,
        channel: fullMessage.channel,
        userId: fullMessage.userId,
        text: route.replyText,
      })
    }
    return route
  }

  writeHeartbeat(status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed', message?: string) {
    return this.durable.writeHeartbeat({
      workspaceId: this.input.workspaceId ?? 'default',
      runtimeId: this.input.runtimeId ?? 'gateway',
      kernel: 'gateway',
      workerType: 'gateway',
      status,
      message,
    })
  }
}
