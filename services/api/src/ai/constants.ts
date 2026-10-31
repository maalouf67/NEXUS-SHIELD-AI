export const AI_TASKS = {
  triage: 'triage',
  investigation: 'investigation',
  reasoning: 'reasoning',
  review: 'review',
  summarization: 'summarization',
  forensics: 'forensics',
  classification: 'classification',
  tool_execution: 'tool_execution'
} as const;

export const AI_COMPLEXITY_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
} as const;

export const AI_DEFAULT_TIMEOUT_MS = 20000;
export const AI_MAX_RETRIES = 3;
export const AI_MAX_BUDGET_PER_REQUEST_USD = 8;
export const AI_MAX_USAGE_PER_TENANT_DAILY_USD = 200;
export const AI_POLICY_VERSION = '2026.10.31';
