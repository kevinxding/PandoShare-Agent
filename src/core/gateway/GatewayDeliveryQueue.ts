import { JsonlStore } from '../store/index.js'
import type { GatewayInboundMessage, GatewayOutboundDelivery } from './GatewayTypes.js'

export class GatewayDeliveryQueue {
  constructor(
    private readonly inbound: JsonlStore<GatewayInboundMessage>,
    private readonly outbound: JsonlStore<GatewayOutboundDelivery>,
  ) {}

  enqueueInbound(message: Omit<GatewayInboundMessage, 'messageId' | 'createdAtMs'> & {
    messageId?: string
    createdAtMs?: number
  }): Promise<void> {
    return this.inbound.append({
      messageId: message.messageId ?? `gw_msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      createdAtMs: message.createdAtMs ?? Date.now(),
      channel: message.channel,
      userId: message.userId,
      text: message.text,
    })
  }

  async readInbound(): Promise<GatewayInboundMessage[]> {
    return this.inbound.readRecords()
  }

  enqueueOutbound(message: Omit<GatewayOutboundDelivery, 'deliveryId' | 'createdAtMs' | 'status'> & {
    deliveryId?: string
    createdAtMs?: number
    status?: GatewayOutboundDelivery['status']
  }): Promise<void> {
    return this.outbound.append({
      deliveryId: message.deliveryId ?? `delivery_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      createdAtMs: message.createdAtMs ?? Date.now(),
      status: message.status ?? 'queued',
      replyToMessageId: message.replyToMessageId,
      channel: message.channel,
      userId: message.userId,
      text: message.text,
    })
  }

  async readOutbound(): Promise<GatewayOutboundDelivery[]> {
    return this.outbound.readRecords()
  }
}
