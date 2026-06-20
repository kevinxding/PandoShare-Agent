import type { ProjectConfig } from '../../services/config/index.js'
import type { ProviderDefinition } from '../../services/llm/types.js'
import { ModelHealth } from './ModelHealth.js'
import type { ModelCapabilities, ModelRouteRequest, RoutedModel } from './ModelTypes.js'
import { ProviderRegistry } from './ProviderRegistry.js'

export class ModelRouter {
  readonly health = new ModelHealth()

  constructor(private readonly registry: ProviderRegistry) {}

  static fromConfig(config: ProjectConfig = {}): ModelRouter {
    return new ModelRouter(new ProviderRegistry(config))
  }

  selectModel(request: ModelRouteRequest): RoutedModel {
    const providers = this.registry.listProviders()
    const provider = request.preferredProvider
      ? this.registry.findProvider(request.preferredProvider)
      : bestProviderForTask(request.taskType, providers)
    if (!provider) throw new Error(`No model provider available for ${request.taskType}`)
    const model = request.preferredModel ?? provider.defaultModel
    const health = this.health.get(provider.id, model)
    if (health.status === 'auth_failed' || health.status === 'unavailable') {
      const fallback = providers.find(item => this.health.get(item.id, item.defaultModel).status === 'ok')
      if (fallback) return toRoutedModel(fallback, fallback.defaultModel)
    }
    return toRoutedModel(provider, model)
  }
}

function bestProviderForTask(taskType: ModelRouteRequest['taskType'], providers: readonly ProviderDefinition[]): ProviderDefinition | undefined {
  if (taskType === 'cheap') return providers.find(provider => provider.id === 'deepseek') ?? providers[0]
  if (taskType === 'gui') return providers.find(provider => provider.capabilities.vision) ?? providers[0]
  if (taskType === 'long_context') {
    return [...providers].sort((left, right) => right.capabilities.contextWindowTokens - left.capabilities.contextWindowTokens)[0]
  }
  if (taskType === 'verifier') return providers.find(provider => provider.id === 'minimax-cn') ?? providers[0]
  return providers[0]
}

function toRoutedModel(provider: ProviderDefinition, model: string): RoutedModel {
  return {
    provider,
    model,
    capabilities: {
      tools: provider.capabilities.tools,
      vision: provider.capabilities.vision,
      longContext: provider.capabilities.contextWindowTokens >= 64_000,
      reasoning: provider.capabilities.reasoning,
      streaming: provider.capabilities.streaming,
    } satisfies ModelCapabilities,
  }
}
