import { afterEach, describe, expect, it } from 'vitest';
import { getAIProviders } from '../ai/provider-registry.js';

const originalOpenAIKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalOpenAIKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAIKey;
  }
});

describe('OpenAI provider registration', () => {
  it('does not register a provider when the API key is absent', () => {
    delete process.env.OPENAI_API_KEY;
    expect(getAIProviders()).toEqual([]);
  });

  it('registers only the OpenAI provider when a server-side key is configured', () => {
    process.env.OPENAI_API_KEY = 'synthetic-test-key-not-a-real-credential';
    expect(getAIProviders().map((provider) => provider.name)).toEqual(['openai']);
  });

  it('treats a whitespace-only API key as unconfigured', () => {
    process.env.OPENAI_API_KEY = '   ';
    expect(getAIProviders()).toEqual([]);
  });
});
