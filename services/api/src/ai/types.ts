export type TaskType =
  | 'triage'
  | 'investigation'
  | 'reasoning'
  | 'review'
  | 'summarization'
  | 'forensics'
  | 'classification'
  | 'tool_execution';

export type Complexity = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'deepseek';

export interface ModelDescriptor {
  provider: ProviderName;
  modelId: string;
  capabilities: TaskType[];
  complexity: Complexity[];
  maxContextTokens?: number;
  latencyTier: 'fast' | 'balanced' | 'deep';
  costTier: 'low' | 'medium' | 'high';
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
  allowedRegions?: string[];
  retentionPolicy?: string;
  active: boolean;
}

export interface AIRequest {
  taskType: TaskType;
  complexity: Complexity;
  riskLevel: RiskLevel;
  prompt: string;
  systemPrompt?: string;
  context?: Record<string, unknown>;
  schema?: Record<string, unknown>;
  tools?: string[];
  maxTokens?: number;
  timeoutMs?: number;
  tenantId?: string;
  userId?: string;
  requireHumanApproval?: boolean;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface ModelResponse {
  provider: ProviderName;
  modelId: string;
  status: 'success' | 'error' | 'policy_blocked';
  content?: unknown;
  warnings?: string[];
  usage?: ModelUsage;
  latencyMs?: number;
  error?: {
    code?: string;
    message: string;
  };
}

export interface ProviderContract {
  readonly name: ProviderName;
  generate(request: AIRequest): Promise<ModelResponse>;
  getCapabilities(): ModelDescriptor[];
}

export interface RoutingDecision {
  provider: ProviderName;
  modelId: string;
  reason: string;
  fallbackProviders: ProviderName[];
  estimatedCostUsd: number;
  timeoutMs: number;
}
