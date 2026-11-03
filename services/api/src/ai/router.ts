import type { AIRequest, ModelDescriptor, ProviderContract, ProviderName, RoutingDecision } from './types.js';
import { buildRoutingDecision, getRoutingRules } from './policies.js';

export function getModelsForRequest(request: AIRequest, providers: ProviderContract[]): ModelDescriptor[] {
  return providers.flatMap((provider) => provider.getCapabilities()).filter((descriptor) =>
    descriptor.active &&
    descriptor.capabilities.includes(request.taskType) &&
    descriptor.complexity.includes(request.complexity)
  );
}

export function chooseProvider(request: AIRequest, providers: ProviderContract[]): RoutingDecision {
  const candidates = getModelsForRequest(request, providers);
  if (candidates.length === 0) throw new Error('AI_NO_PROVIDER_AVAILABLE');

  const registeredNames = new Set(providers.map((provider) => provider.name));
  const priority = getRoutingRules().default[request.complexity] ?? ['openai'];
  const preferred = [...candidates].sort((left, right) => {
    const leftRank = priority.indexOf(left.provider);
    const rightRank = priority.indexOf(right.provider);
    return (leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank) -
      (rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank);
  })[0];

  return buildRoutingDecision(request, preferred.provider, preferred.modelId, [...registeredNames] as ProviderName[]);
}

export function getFallbackChain(request: AIRequest, providers: ProviderContract[]): ProviderName[] {
  return chooseProvider(request, providers).fallbackProviders;
}

export async function invokeProvider(provider: ProviderContract, request: AIRequest) {
  return provider.generate(request);
}
