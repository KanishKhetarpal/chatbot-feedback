/**
 * The models a CRM feature may run on.
 *
 * These ids are customer-supplied through admin screens and feed billable API calls, so
 * they are always validated against this allowlist — never passed through. Two screens
 * write one today (the chat-agent dashboard and Document AI settings) and both read this
 * list, because a second copy is how one screen ends up offering a model the other cannot
 * run.
 *
 * Screens pick by TIER — `Fast` / `Standard` / `Advanced` — and show the model the tier
 * currently resolves to alongside it, so an admin can see what they are paying for.
 * `modelName` is that display string; it is not an identifier and nothing may parse it.
 * Swapping the model behind a tier stays a change to this file rather than a migration:
 * edit `id` and `modelName` together and every screen follows.
 */

export type ModelTier = 'fast' | 'standard' | 'advanced';

export type ModelSpec = {
  id: string;
  tier: ModelTier;
  label: string;
  /** Human-readable name of the model behind this tier. Display only. */
  modelName: string;
  description: string;
  contextWindow: number;
  supportsEffort: boolean;
  /**
   * Can this model read an image or a PDF sent as a content block?
   *
   * All three can today, so nothing filters on it yet — it exists because Document AI
   * cannot run on a model that cannot see the document, and a text-only model added to
   * this list later must not silently become selectable there.
   */
  supportsVision: boolean;
};

export const MODELS: readonly ModelSpec[] = [
  {
    id: 'claude-haiku-4-5',
    modelName: 'Claude Haiku 4.5',
    tier: 'fast',
    label: 'Fast',
    description: 'Quickest and cheapest. Good for straightforward FAQ answering.',
    contextWindow: 200_000,
    supportsEffort: false,
    supportsVision: true,
  },
  {
    id: 'claude-sonnet-5',
    modelName: 'Claude Sonnet 5',
    tier: 'standard',
    label: 'Standard',
    description: 'Best balance of quality and cost. Recommended for most agents.',
    contextWindow: 1_000_000,
    supportsEffort: true,
    supportsVision: true,
  },
  {
    id: 'claude-opus-5',
    modelName: 'Claude Opus 5',
    tier: 'advanced',
    label: 'Advanced',
    description: 'Highest quality on complex, multi-step questions. Costs the most.',
    contextWindow: 1_000_000,
    supportsEffort: true,
    supportsVision: true,
  },
] as const;

export const DEFAULT_MODEL = 'claude-sonnet-5';

export const MODEL_IDS = MODELS.map((m) => m.id);

export const isAllowedModel = (id: string): boolean => MODEL_IDS.includes(id);

/** The subset a document-reading feature may offer. */
export const VISION_MODELS = MODELS.filter((m) => m.supportsVision);
export const VISION_MODEL_IDS = VISION_MODELS.map((m) => m.id);
export const isVisionModel = (id: string): boolean => VISION_MODEL_IDS.includes(id);

export const EFFORT_LEVELS = ['low', 'medium', 'high'] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

/**
 * The effort value to send for a given model, or `undefined` to send none.
 *
 * Two callers must agree on this exactly — the answer path and the training cache warm —
 * because `output_config.effort` participates in the prompt-cache key. If the warm sends a
 * different value (or none) than the real call, they write separate cache entries and the
 * warm silently achieves nothing.
 *
 * Returns undefined for models that reject the parameter outright (Haiku 4.5).
 */
export function resolveEffort(model: string, effort: string): Effort | undefined {
  const spec = MODELS.find((m) => m.id === model);
  if (!spec?.supportsEffort) return undefined;
  return (EFFORT_LEVELS as readonly string[]).includes(effort)
    ? (effort as Effort)
    : undefined;
}

export const EFFORT_LABELS: Record<Effort, string> = {
  low: 'Quick — answers fast, less deliberation',
  medium: 'Balanced — the default',
  high: 'Thorough — thinks harder, slower and costlier',
};
