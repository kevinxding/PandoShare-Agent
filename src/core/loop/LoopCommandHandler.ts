import type { CommandEnvelope } from '../protocol/index.js'
import type { LoopRuntime } from './LoopRuntime.js'

export type LoopCommandResult = {
  ok: boolean
  commandType: string
  result: unknown
}

export class LoopCommandHandler {
  constructor(private readonly runtime: Pick<LoopRuntime, 'createLoop' | 'runNext' | 'resumeLoop' | 'status' | 'recoverLoop'>) {}

  async handle(command: CommandEnvelope): Promise<LoopCommandResult> {
    const payload = recordPayload(command.payload)
    const loopId = stringPayload(payload, 'loopId') ?? command.loopId
    switch (command.commandType) {
      case 'loop.create':
        return { ok: true, commandType: command.commandType, result: await this.runtime.createLoop({
          objective: stringPayload(payload, 'objective') ?? 'Loop task',
          successCriteria: arrayPayload(payload, 'successCriteria'),
          constraints: arrayPayload(payload, 'constraints'),
          loopId,
          goalId: command.goalId ?? stringPayload(payload, 'goalId'),
          rootThreadId: command.threadId,
          createdByCommandId: command.commandId,
          source: command.source,
        }) }
      case 'loop.run':
        return { ok: true, commandType: command.commandType, result: await this.runtime.runNext(requireLoopId(loopId)) }
      case 'loop.resume':
        return { ok: true, commandType: command.commandType, result: await this.runtime.resumeLoop(requireLoopId(loopId)) }
      case 'loop.status':
        return { ok: true, commandType: command.commandType, result: await this.runtime.status(requireLoopId(loopId)) }
      case 'loop.pause':
      case 'loop.stop':
      case 'loop.approve':
      case 'loop.reject':
        return { ok: false, commandType: command.commandType, result: { reason: `${command.commandType} is event-contract-only in this core layer; UI/gateway adapters should resolve it through HumanGate events.` } }
      default:
        throw new Error(`Unsupported loop command: ${command.commandType}`)
    }
  }
}

function recordPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function requireLoopId(loopId: string | undefined): string {
  if (!loopId) throw new Error('Loop command requires loopId')
  return loopId
}

function stringPayload(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function arrayPayload(payload: Record<string, unknown>, key: string): readonly string[] | undefined {
  const value = payload[key]
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : undefined
}
