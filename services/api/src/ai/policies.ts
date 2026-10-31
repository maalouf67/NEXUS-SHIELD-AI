import type { AIRequest, ModelDescriptor, ProviderName, RoutingDecision, RiskLevel } from './types.js';

export const defaultModelPolicy: Record<ProviderName, ModelDescriptor[]> = {
  openai: [
    {
      provider: 'openai',
      modelId: 'gpt-4.1-mini',
      capabilities: ['triage', 'classification', 'summarization'],
      complexity: ['low', 'medium'],
      latencyTier: 'fast',
      costTier: 'low',
      supportsStructuredOutput: true,
      supportsTools: true,
      active: true
    }
  ],
  anthropic: [
    {
      provider: 'anthropic',
      modelId: 'claude-3-5-sonnet-latest',
      capabilities: ['reasoning', 'investigation', 'review'],
      complexity: ['medium', 'high'],
      latencyTier: 'balanced',
      costTier: 'medium',
      supportsStructuredOutput: true,
      supportsTools: true,
      active: true
    }
  ],
  gemini: [
    {
      provider: 'gemini',
      modelId: 'gemini-2.5-flash',
      capabilities: ['classification', 'summarization', 'forensics'],
      complexity: ['low', 'medium', 'high'],
      latencyTier: 'fast',
      costTier: 'low',
      supportsStructuredOutput: true,
      supportsTools: true,
      active: true
    }
  ],
  deepseek: [
    {
      provider: 'deepseek',
      modelId: 'deepseek-chat',
      capabilities: ['triage', 'classification', 'summarization'],
      complexity: ['low', 'medium'],
      latencyTier: 'fast',
      costTier: 'low',
      supportsStructuredOutput: true,
      supportsTools: false,
      active: true
    }
  ]
};

export function getRoutingRules() {
  return {
    default: {
      low: ['deepseek', 'openai'],
      medium: ['openai', 'anthropic', 'gemini'],
      high: ['anthropic', 'gemini', 'openai'],
      critical: ['anthropic', 'openai']
    },
    risk: {
      low: ['deepseek'],
      medium: ['openai'],
      high: ['anthropic'],
      critical: ['anthropic', 'openai']
    }
  } as const;
}

export function classifyRisk(request: AIRequest): RiskLevel {
  if (request.requireHumanApproval || request.context?.sensitive) {
    return 'critical';
  }

  if (request.complexity === 'critical' || request.taskType === 'tool_execution') {
    return 'critical';
  }

  if (request.complexity === 'high' || request.taskType === 'forensics') {
    return 'high';
  }

  if (request.taskType === 'investigation' || request.taskType === 'review') {
    return 'medium';
  }

  return 'low';
}

export function estimateCostUsd(data: { provider: ProviderName; modelId: string; complexity: string; inputTokens?: number; outputTokens?: number }): number {
  const costMap: Record<ProviderName, number> = {
    openai: 0.004,
    anthropic: 0.006,
    gemini: 0.003,
    deepseek: 0.0015
  };

  const base = costMap[data.provider] ?? 0.003;
  const complexityMultiplier = {
    low: 0.8,
    medium: 1,
    high: 1.6,
    critical: 2.3
  };

  const multiplier = complexityMultiplier[data.complexity as keyof typeof complexityMultiplier] ?? 1;
  const tokenFactor = ((data.inputTokens ?? 2000) + (data.outputTokens ?? 800)) / 10000;
  return Number((base * multiplier * tokenFactor).toFixed(6));
}

export function buildRoutingDecision(request: AIRequest, provider: ProviderName, modelId: string): RoutingDecision {
  return {
    provider,
    modelId,
    reason: `Selected for ${request.taskType} with ${request.complexity} complexity`,
    fallbackProviders: getRoutingRules().default[request.complexity] ?? ['openai'],
    estimatedCostUsd: estimateCostUsd({
      provider,
      modelId,
      complexity: request.complexity,
      inputTokens: 2000,
      outputTokens: 1200
    }),
    timeoutMs: request.timeoutMs ?? 20000
  };
}
