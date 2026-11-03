import { describe, expect, it, vi } from 'vitest';
import { runOrchestrator } from '../orchestrator.js';
import type { AIRequest, ModelDescriptor, ModelResponse, ProviderContract, ProviderName } from '../types.js';

const request: AIRequest = {
  taskType: 'triage', complexity: 'medium', riskLevel: 'medium',
  prompt: 'Review the supplied network alert.',
  context: { target: 'edge-gateway', source: 'manual-report', signal_type: 'network' }
};
function provider(name: ProviderName, generate: () => Promise<ModelResponse>): ProviderContract {
  const model: ModelDescriptor = {
    provider: name, modelId: `${name}-test-model`,
    capabilities: ['triage', 'classification'], complexity: ['low', 'medium', 'high'],
    latencyTier: 'balanced', costTier: 'medium',
    supportsStructuredOutput: true, supportsTools: false, active: true
  };
  return { name, getCapabilities: () => [model], generate: vi.fn(generate) };
}

describe('AI orchestrator', () => {
  it('returns a structured result from the selected provider', async () => {
    const openai = provider('openai', async () => ({
      provider: 'openai', modelId: 'gpt-test', status: 'success',
      content: { classification: 'medium', risk_score: 42, findings: [], recommendations: [], explanation: 'Test result' },
      latencyMs: 12
    }));
    const result = await runOrchestrator(request, [openai]);
    expect(result.provider).toBe('openai');
    expect(result.analysis).toMatchObject({ classification: 'medium', risk_score: 42 });
    expect(result.routing.selectedProvider).toBe('openai');
  });
  it('uses only a registered fallback provider after the preferred provider fails', async () => {
    const openai = provider('openai', async () => ({
      provider: 'openai', modelId: 'openai-test-model', status: 'error',
      error: { code: 'AI_RATE_LIMIT', message: 'Rate limited' }
    }));
    const gemini = provider('gemini', async () => ({
      provider: 'gemini', modelId: 'gemini-test-model', status: 'success',
      content: { classification: 'low', risk_score: 8 }
    }));
    const result = await runOrchestrator(request, [openai, gemini]);
    expect(result.provider).toBe('gemini');
    expect(result.routing.preferredProvider).toBe('openai');
    expect(openai.generate).toHaveBeenCalledOnce();
    expect(gemini.generate).toHaveBeenCalledOnce();
  });
  it('fails clearly when no provider is configured', async () => {
    await expect(runOrchestrator(request, [])).rejects.toThrow('AI_NOT_CONFIGURED');
  });
  it('rejects unsupported tasks before invoking any provider', async () => {
    const openai = provider('openai', async () => ({
      provider: 'openai', modelId: 'unused', status: 'success', content: {}
    }));
    await expect(runOrchestrator({ ...request, taskType: 'tool_execution' }, [openai])).rejects.toThrow('UNSUPPORTED_TASK');
    expect(openai.generate).not.toHaveBeenCalled();
  });
});
