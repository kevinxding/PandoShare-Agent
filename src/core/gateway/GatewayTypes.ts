import type { CommandEnvelope } from '../protocol/index.js'

export type GatewayMessageKind = 'telegram' | 'feishu' | 'wecom' | 'local' | 'mock'

export type GatewayInboundMessage = {
  messageId: string
  channel: GatewayMessageKind
  userId: string
  text: string
  createdAtMs: number
}

export type GatewayOutboundDelivery = {
  deliveryId: string
  replyToMessageId?: string
  channel: GatewayMessageKind
  userId: string
  text: string
  createdAtMs: number
  status: 'queued' | 'delivered' | 'failed'
}

export type GatewayCommandRoute = {
  command: CommandEnvelope
  replyText?: string
}
