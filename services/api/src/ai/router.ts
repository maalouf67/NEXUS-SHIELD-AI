import type { AIRequest, ModelDescriptor, ProviderContract, ProviderName, RoutingDecision } from './types.js';
import { buildRoutingDecision, defaultModelPolicy, getRoutingRules } from './policies.js';

export function getModelsForRequest(request: AIRequest): ModelDescriptor[] {
  const selected: ModelDescriptor[] = [];

  for (const provider of Object.keys(defaultModelPolicy) as ProviderName[]) {
    const descriptors = defaultModelPolicy[provider];
    for (const descriptor of descriptors) {
      if (!descriptor.active) continue;
      if (descriptor.capabilities.includes(request.taskType) && descriptor.complexity.includes(request.complexity)) {
        selected.push(descriptor);
      }
    }
  }

  return selected.length > 0 ? selected : defaultModelPolicy.openai;
}

export function chooseProvider(request: AIRequest): RoutingDecision {
  const candidates = getModelsForRequest(request);
  const preferred = candidates[0];

  if (!preferred) {
    return buildRoutingDecision(request, 'openai', 'gpt-4.1-mini');
  }

  return buildRoutingDecision(request, preferred.provider, preferred.modelId);
}

export function getFallbackChain(request: AIRequest): ProviderName[] {
  const base = getRoutingRules().default[request.complexity] ?? ['openai'];
  return [...new Set(base.filter((provider) => provider !== chooseProvider(request).provider))];
}

export async function invokeProvider(provider: ProviderContract, request: AIRequest) {
  return provider.generate(request);
}
