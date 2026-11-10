import { z } from 'zod';

const AgentPlatformResultSchema = z.object({
  tenant_id: z.string().uuid(),
  task_id: z.string().min(8).max(128),
  agent_id: z.string().min(1).max(160),
  classification: z.enum(['critical', 'high', 'medium', 'low']),
  risk_score: z.number().int().min(0).max(100),
  evidence: z.array(z.string().min(1).max(1000)).max(32),
  recommendations: z.array(z.string().min(1).max(1000)).max(32),
  read_only: z.literal(true)
}).strict();

export type AgentPlatformResult = z.infer<typeof AgentPlatformResultSchema>;

export interface AgentTriageSubmission {
  tenant_id: string;
  task_id: string;
  event_type: string;
  source: string;
  target: string;
  details: string;
  observed_at: string;
}

export async function submitSecurityTriage(
  submission: AgentTriageSubmission
): Promise<AgentPlatformResult> {
  const baseUrl = process.env.AGENT_PLATFORM_URL?.trim();
  const serviceToken = process.env.NEXUS_AGENT_PLATFORM_TOKEN?.trim();
  if (!baseUrl || !serviceToken || serviceToken.length < 32) {
    throw new Error('AGENT_PLATFORM_NOT_CONFIGURED');
  }

  let endpoint: URL;
  try {
    endpoint = new URL('/v1/triage', baseUrl);
  } catch {
    throw new Error('AGENT_PLATFORM_NOT_CONFIGURED');
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceToken}`,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(submission),
      signal: AbortSignal.timeout(105_000)
    });
  } catch {
    throw new Error('AGENT_PLATFORM_UNAVAILABLE');
  }

  if (!response.ok) {
    throw new Error('AGENT_PLATFORM_UNAVAILABLE');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('AGENT_PLATFORM_INVALID_RESPONSE');
  }

  const parsed = AgentPlatformResultSchema.safeParse(body);
  if (!parsed.success ||
      parsed.data.tenant_id !== submission.tenant_id ||
      parsed.data.task_id !== submission.task_id) {
    throw new Error('AGENT_PLATFORM_INVALID_RESPONSE');
  }
  return parsed.data;
}
