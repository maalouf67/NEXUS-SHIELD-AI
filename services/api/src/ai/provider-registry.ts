import { openAIProvider } from './providers/openai.provider.js';
import type { ProviderContract } from './types.js';

/** Returns only implemented providers with credentials configured on the API server. */
export function getAIProviders(): ProviderContract[] {
  if (!process.env.OPENAI_API_KEY?.trim()) return [];
  return [openAIProvider];
}
