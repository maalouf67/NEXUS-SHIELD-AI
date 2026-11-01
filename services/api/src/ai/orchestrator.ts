import { analyzeThreatWithAgent } from './agents/threat-analysis.js';
import type { AIRequest } from './types.js';

export async function runOrchestrator(request: AIRequest) {
  if (request.taskType !== 'triage' && request.taskType !== 'classification') {
    throw new Error('UNSUPPORTED_TASK');
  }

  const target = request.context?.target;
  const source = request.context?.source;

  if (typeof target !== 'string' || typeof source !== 'string') {
    throw new Error('INVALID_THREAT_CONTEXT');
  }

  const analysis = await analyzeThreatWithAgent({
    target,
    source,
    details: request.prompt
  });

  return {
    status: 'success' as const,
    agent: 'threat-analysis',
    taskType: request.taskType,
    analysis
  };
}
