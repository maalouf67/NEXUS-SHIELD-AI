import { getAIProviders } from './provider-registry.js';
import { chooseProvider, getFallbackChain, invokeProvider } from './router.js';
import type { AIRequest, ProviderContract, ProviderName } from './types.js';

export interface OrchestratorResult {
  status: 'success';
  taskType: AIRequest['taskType'];
  provider: ProviderName;
  modelId: string;
  analysis: unknown;
  latencyMs?: number;
  routing: {
    preferredProvider: ProviderName;
    selectedProvider: ProviderName;
    reason: string;
    fallbackProviders: ProviderName[];
  };
}

export async function runOrchestrator(
  request: AIRequest,
  providers: ProviderContract[] = getAIProviders()
): Promise<OrchestratorResult> {
  if (request.taskType !== 'triage' && request.taskType !== 'classification') {
    throw new Error('UNSUPPORTED_TASK');
  }
  if (typeof request.context?.target !== 'string' || typeof request.context?.source !== 'string') {
    throw new Error('INVALID_THREAT_CONTEXT');
  }
  if (providers.length === 0) throw new Error('AI_NOT_CONFIGURED');

  const decision = chooseProvider(request, providers);
  const fallbackChain = getFallbackChain(request, providers);
  const providerByName = new Map(providers.map((provider) => [provider.name, provider]));
  const executionOrder = [decision.provider, ...fallbackChain];
  let lastError = 'AI_ANALYSIS_FAILED';

  for (const providerName of executionOrder) {
    const provider = providerByName.get(providerName);
    if (!provider) continue;
    const response = await invokeProvider(provider, request);

    if (response.status === 'success' && response.content !== undefined) {
      return {
        status: 'success',
        taskType: request.taskType,
        provider: response.provider,
        modelId: response.modelId,
        analysis: response.content,
        latencyMs: response.latencyMs,
        routing: {
          preferredProvider: decision.provider,
          selectedProvider: response.provider,
          reason: decision.reason,
          fallbackProviders: fallbackChain
        }
      };
    }
    if (response.status === 'policy_blocked') throw new Error('AI_POLICY_BLOCKED');
    lastError = response.error?.code || 'AI_ANALYSIS_FAILED';
  }
  throw new Error(lastError);
}
