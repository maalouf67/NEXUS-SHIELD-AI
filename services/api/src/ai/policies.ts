import type { AIRequest, ModelDescriptor, ProviderName, RoutingDecision, RiskLevel } from './types.js';

/**
 * Only OpenAI currently has an implemented provider adapter. Other providers
 * remain known types for future work but have no active model descriptors.
 */
export const defaultModelPolicy: Record<ProviderName, ModelDescriptor[]> = {
  openai: [{
    provider: 'openai',
    modelId: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    capabilities: ['triage', 'classification'],
    complexity: ['low', 'medium', 'high'],
    latencyTier: 'balanced',
    costTier: 'medium',
    supportsStructuredOutput: true,
    supportsTools: false,
    active: true
  }],
  anthropic: [],
  gemini: [],
  deepseek: []
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
  if (request.requireHumanApproval || request.context?.sensitive) return 'critical';
  if (request.complexity === 'critical' || request.taskType === 'tool_execution') return 'critical';
  if (request.complexity === 'high' || request.taskType === 'forensics') return 'high';
  if (request.taskType === 'investigation' || request.taskType === 'review') return 'medium';
  return 'low';
}

export function buildRoutingDecision(
  request: AIRequest,
  provider: ProviderName,
  modelId: string,
  availableProviders: ProviderName[]
): RoutingDecision {
  const available = new Set(availableProviders);
  const preferredOrder = getRoutingRules().default[request.complexity] ?? ['openai'];
  return {
    provider,
    modelId,
    reason: `Selected ${provider} for ${request.taskType} with ${request.complexity} complexity.`,
    fallbackProviders: [...new Set(preferredOrder.filter((name) => available.has(name) && name !== provider))],
    timeoutMs: request.timeoutMs ?? 45000
  };
}
