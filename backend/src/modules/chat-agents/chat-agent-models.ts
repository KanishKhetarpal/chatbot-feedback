/**
 * Chat-agent model + vocabulary constants.
 *
 * The model allowlist itself moved to `src/common/ai/claude-models.ts` on 2026-09-10, when
 * Document AI became a second admin screen that writes a model id. It is re-exported here
 * unchanged so every existing importer keeps working — the list has one home, not two.
 * Everything below the re-export is chat-agent-only vocabulary and stays here.
 */

export {
  MODELS,
  DEFAULT_MODEL,
  MODEL_IDS,
  isAllowedModel,
  EFFORT_LEVELS,
  EFFORT_LABELS,
  resolveEffort,
} from '../../common/ai/claude-models';
export type { ModelTier, ModelSpec, Effort } from '../../common/ai/claude-models';

export const TONES = ['professional', 'friendly', 'casual', 'formal', 'empathetic'] as const;
export const RESPONSE_LENGTHS = ['concise', 'balanced', 'detailed'] as const;
export const KNOWLEDGE_MODES = ['strict', 'blended'] as const;
export const LEAD_CAPTURE_MODES = ['never', 'before_chat', 'after_first_reply'] as const;
export const LEAD_FIELDS = ['phone', 'name', 'email'] as const;
export const AGENT_STATUSES = ['draft', 'active', 'paused'] as const;
