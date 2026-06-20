export type ReconnectDecision = {
  attempt: number
  delayMs: number
  shouldRetry: boolean
}

export class ReconnectPolicy {
  constructor(
    private readonly input: {
      baseDelayMs?: number
      maxDelayMs?: number
      maxAttempts?: number
    } = {},
  ) {}

  next(attempt: number): ReconnectDecision {
    const maxAttempts = this.input.maxAttempts ?? 8
    const baseDelayMs = this.input.baseDelayMs ?? 500
    const maxDelayMs = this.input.maxDelayMs ?? 30_000
    return {
      attempt,
      shouldRetry: attempt < maxAttempts,
      delayMs: Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1)),
    }
  }
}
