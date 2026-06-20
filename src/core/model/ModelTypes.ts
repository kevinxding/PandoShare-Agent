import type { ProviderDefinition } from '../../services/llm/types.js'

export type ModelTaskType = 'code' | 'gui' | 'loop' | 'verifier' | 'cheap' | 'long_context'

export type ModelCapabilities = {
  tools: boolean
  vision: boolean
  longContext: boolean
  reasoning: boolean
  streaming: boolean
}

export type RoutedModel = {
  provider: ProviderDefinition
  model: string
  capabilities: ModelCapabilities
}

export type ModelRouteRequest = {
  taskType: ModelTaskType
  preferredProvider?: string
  preferredModel?: string
}

export type ModelUsageRecord = {
  provider: string
  model: string
  runId?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  createdAtMs: number
}
