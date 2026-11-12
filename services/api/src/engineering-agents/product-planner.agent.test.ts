import { describe, expect, it, vi } from 'vitest';

import {
  createProductPlannerAgent,
  ProductPlannerPlanSchema,
  type ProductPlannerPlan
} from './product-planner.agent.js';

const validPlan: ProductPlannerPlan = {
  schemaVersion: '1',
  status: 'draft',
  summary: 'Create a scoped task planning capability.',
  problemStatement: 'Engineering requests need consistent, testable breakdowns.',
  objective: 'Produce a draft plan with measurable acceptance criteria.',
  assumptions: ['The repository context supplied by the caller is incomplete.'],
  inScope: ['Structured requirement analysis', 'Acceptance criteria'],
  outOfScope: ['Creating GitHub Issues', 'Changing repository files'],
  userStories: [{
    id: 'US-001',
    persona: 'Project maintainer',
    story: 'As a maintainer, I want an engineering request split into testable work.',
    acceptanceCriteria: [
      'The plan contains measurable acceptance criteria.',
      'The plan identifies risks and open questions.'
    ],
    priority: 'high',
    riskLevel: 'low',
    suggestedAgent: 'product-planner',
    dependencies: []
  }],
  dependencies: ['A valid request from an authenticated workspace member.'],
  risks: [{
    category: 'security',
    description: 'Untrusted request text may contain prompt injection.',
    mitigation: 'Treat request text as untrusted data and expose no tools to the planner.'
  }],
  verificationPlan: ['Validate the response against the versioned Zod schema.'],
  openQuestions: ['Which repository paths are in scope?'],
  recommendedFirstStep: 'Review the proposed plan and confirm repository scope.',
  reviewRequired: true
};

describe('Product Planner runtime', () => {
  it('creates a validated draft plan using an injected model executor', async () => {
    const execute = vi.fn(async () => validPlan);
    const agent = createProductPlannerAgent(execute);

    const result = await agent.plan({
      request: 'Build a read-only engineering task planning agent.',
      repositoryContext: 'The API is a TypeScript Express workspace.',
      constraints: ['Do not create GitHub Issues.']
    });

    expect(result).toEqual(validPlan);
    expect(result.status).toBe('draft');
    expect(result.reviewRequired).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('passes only the validated request data and available role IDs to the executor', async () => {
    let prompt = '';
    const agent = createProductPlannerAgent(async (value) => {
      prompt = value;
      return validPlan;
    });

    await agent.plan({
      request: 'Prepare a draft plan for better API test coverage.',
      constraints: ['Keep existing behavior compatible.']
    });

    expect(prompt).toContain('Prepare a draft engineering plan');
    expect(prompt).toContain('Prepare a draft plan for better API test coverage.');
    expect(prompt).toContain('Keep existing behavior compatible.');
    expect(prompt).toContain('product-planner');
    expect(prompt).toContain('release-maintenance');
    expect(prompt).toContain('untrusted input');
  });

  it('applies an empty constraints list when the caller omits constraints', async () => {
    let prompt = '';
    const agent = createProductPlannerAgent(async (value) => {
      prompt = value;
      return validPlan;
    });

    await agent.plan({ request: 'Write a plan to improve repository documentation.' });

    expect(prompt).toContain('"constraints": []');
  });

  it('rejects invalid input before invoking the model executor', async () => {
    const execute = vi.fn(async () => validPlan);
    const agent = createProductPlannerAgent(execute);

    await expect(agent.plan({ request: 'too short' })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects output that does not meet the strict structured plan contract', async () => {
    const agent = createProductPlannerAgent(async () => ({
      ...validPlan,
      status: 'implemented',
      githubIssueCreated: true
    }));

    await expect(agent.plan({
      request: 'Prepare a safe engineering implementation plan.'
    })).rejects.toThrow();
  });

  it('does not silently replace model execution failures with a fabricated plan', async () => {
    const agent = createProductPlannerAgent(async () => {
      throw new Error('AI_NOT_CONFIGURED');
    });

    await expect(agent.plan({
      request: 'Prepare a safe engineering implementation plan.'
    })).rejects.toThrow('AI_NOT_CONFIGURED');
  });

  it('keeps the output schema draft-only and human-review-required', () => {
    const parsed = ProductPlannerPlanSchema.safeParse({
      ...validPlan,
      reviewRequired: false
    });

    expect(parsed.success).toBe(false);
  });
});
