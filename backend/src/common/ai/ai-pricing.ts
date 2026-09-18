import type { AiTokenUsage } from '../../modules/ai/ai-usage.types';

/**
 * List prices in USD per million tokens, used ONLY to estimate cost at read
 * time. Tokens are the stored fact; prices change, so they live here rather
 * than in a column. Edit this file when Anthropic changes a price and every
 * historical row re-prices itself.
 *
 * Cache writes are billed at 1.25x input, cache reads at 0.1x input.
 */
export type ModelPricing = {
  model: string;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok: number;
  cacheReadPerMTok: number;
};

export const MODEL_PRICING: readonly ModelPricing[] = [
  { model: 'claude-haiku-4-5', inputPerMTok: 1, outputPerMTok: 5, cacheWritePerMTok: 1.25, cacheReadPerMTok: 0.1 },
  { model: 'claude-sonnet-5', inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.3 },
  { model: 'claude-opus-5', inputPerMTok: 15, outputPerMTok: 75, cacheWritePerMTok: 18.75, cacheReadPerMTok: 1.5 },
] as const;

/** Unknown model ids (a renamed tier, an old row) are priced as Sonnet so they are never silently free. */
const FALLBACK = MODEL_PRICING[1];

export function pricingFor(model: string): ModelPricing {
  return MODEL_PRICING.find((p) => p.model === model) ?? FALLBACK;
}

export function estimateCostUsd(model: string, usage: AiTokenUsage): number {
  const p = pricingFor(model);
  return (
    (usage.inputTokens * p.inputPerMTok +
      usage.outputTokens * p.outputPerMTok +
      usage.cacheWriteTokens * p.cacheWritePerMTok +
      usage.cacheReadTokens * p.cacheReadPerMTok) /
    1_000_000
  );
}
