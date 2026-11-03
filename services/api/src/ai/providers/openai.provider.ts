import { analyzeThreatWithAgent } from '../agents/threat-analysis.js';
import { defaultModelPolicy } from '../policies.js';
import type { AIRequest, ModelResponse, ProviderContract } from '../types.js';

function providerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();
  if (message === 'AI_NOT_CONFIGURED') return 'AI_NOT_CONFIGURED';
  if (message === 'AI_REFUSED') return 'AI_REFUSED';
  if (message === 'AI_RATE_LIMIT' || normalized.includes('429') || normalized.includes('rate limit')) return 'AI_RATE_LIMIT';
  if (message === 'AI_AUTH_FAILED' || normalized.includes('401') || normalized.includes('unauthorized')) return 'AI_AUTH_FAILED';
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'AI_TIMEOUT';
  return 'AI_ANALYSIS_FAILED';
}

export const openAIProvider: ProviderContract = {
  name: 'openai',
  getCapabilities() {
    return defaultModelPolicy.openai;
  },
  async generate(request: AIRequest): Promise<ModelResponse> {
    const context = request.context ?? {};
    const target = context.target;
    const source = context.source;
    const modelId = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

    if (typeof target !== 'string' || typeof source !== 'string') {
      return { provider: 'openai', modelId, status: 'error',
        error: { code: 'INVALID_THREAT_CONTEXT', message: 'Threat context is incomplete.' } };
    }

    const startedAt = Date.now();
    try {
      const analysis = await analyzeThreatWithAgent({
        target,
        source,
        signal_type: typeof context.signal_type === 'string' ? context.signal_type : undefined,
        details: request.prompt
      });
      return { provider: 'openai', modelId, status: 'success', content: analysis, latencyMs: Date.now() - startedAt };
    } catch (error) {
      const code = providerErrorCode(error);
      return {
        provider: 'openai', modelId, status: 'error', latencyMs: Date.now() - startedAt,
        error: { code, message: code === 'AI_ANALYSIS_FAILED' ? 'The OpenAI analysis request failed.' : code }
      };
    }
  }
};
