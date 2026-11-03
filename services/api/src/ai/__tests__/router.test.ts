import { describe, expect, it, vi } from 'vitest';
import { chooseProvider, getFallbackChain, getModelsForRequest } from '../router.js';
import type { AIRequest, ModelDescriptor, ModelResponse, ProviderContract, ProviderName } from '../types.js';

function descriptor(provider: ProviderName, active = true): ModelDescriptor {
  return {
    provider, modelId: `${provider}-test-model`,
    capabilities: ['triage', 'classification'], complexity: ['low', 'medium', 'high'],
    latencyTier: 'balanced', costTier: 'medium',
    supportsStructuredOutput: true, supportsTools: false, active
  };
}
function fakeProvider(name: ProviderName, active = true): ProviderContract {
  return {
    name, getCapabilities: () => [descriptor(name, active)],
    generate: vi.fn(async (): Promise<ModelResponse> => ({
      provider: name, modelId: `${name}-test-model`, status: 'success',
      content: { classification: 'low', risk_score: 10 }
    }))
  };
}
const request: AIRequest = {
  taskType: 'triage', complexity: 'medium', riskLevel: 'medium',
  prompt: 'Review supplied security telemetry.',
  context: { target: 'test-host', source: 'manual-report' }
};

describe('AI provider routing', () => {
  it('selects only registered providers that support the requested task', () => {
    const openai = fakeProvider('openai');
    const disabledGemini = fakeProvider('gemini', false);
    expect(getModelsForRequest(request, [openai, disabledGemini]).map((model) => model.provider)).toEqual(['openai']);
    expect(chooseProvider(request, [openai, disabledGemini]).provider).toBe('openai');
  });
  it('does not invent fallback providers when only one provider is available', () => {
    expect(getFallbackChain(request, [fakeProvider('openai')])).toEqual([]);
  });
  it('rejects an empty provider registry or unsupported task', () => {
    expect(() => chooseProvider(request, [])).toThrow('AI_NO_PROVIDER_AVAILABLE');
    expect(getModelsForRequest({ ...request, taskType: 'tool_execution' }, [fakeProvider('openai')])).toEqual([]);
  });
});
