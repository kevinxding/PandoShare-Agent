import { createConfiguredProvider, resolveDefaultModel, type ProjectConfig } from '../../services/config/index.js'
import { builtinProviders } from '../../services/llm/providers.js'
import type { ProviderDefinition } from '../../services/llm/types.js'

export class ProviderRegistry {
  constructor(private readonly config: ProjectConfig = {}) {}

  listProviders(): ProviderDefinition[] {
    const configured = Object.entries(this.config.providers ?? {}).map(([id, providerConfig]) =>
      createConfiguredProvider(id, providerConfig, this.config.model?.name),
    )
    const builtin = [
      builtinProviders.openai,
      builtinProviders.deepseek,
      builtinProviders.minimaxChinaTokenPlan,
      builtinProviders.openaiCodex,
    ]
    const byId = new Map<string, ProviderDefinition>()
    for (const provider of [...builtin, ...configured]) byId.set(provider.id, provider)
    return Array.from(byId.values())
  }

  defaultProvider(): ProviderDefinition {
    return resolveDefaultModel(this.config).provider
  }

  findProvider(providerId: string): ProviderDefinition | undefined {
    return this.listProviders().find(provider => provider.id === providerId)
  }
}
