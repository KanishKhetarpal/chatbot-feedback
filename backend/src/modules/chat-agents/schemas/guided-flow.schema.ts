import { z } from 'zod/v4';

/**
 * Zod contract for `ChatAgent.guidedFlow` — the admin-editable decision tree
 * that answers first-touch questions without an AI call.
 *
 * Shape and limits documented alongside GuidedFlowValidator.validate — the
 * limits are enforced twice on purpose: zod catches shape drift, the validator
 * catches semantic problems (cycles, orphans, reserved-id misuse) that a schema
 * cannot express.
 *
 * Reserved node ids — never authored by an admin, always resolvable at runtime:
 *   `escape_ai`    — hands the visitor to the AI-mode composer
 *   `escape_human` — fires handoff (sets visitor.handoffAt + creates a callback Task)
 */

/**
 * Reserved node ids — hard-coded semantics in the runtime, never authored by
 * admins.
 *
 *   escape_ai       — hands the visitor to AI-mode composer
 *   escape_human    — fires handoff (+ creates a callback Task if lead exists)
 *   mark_intl_yes   — records visitor.custom.isIntl = true, then attempts to
 *                     derive country from the visitor's timezone via ERP-anchored
 *                     `GeoDeriveService` (§4.6 of the plan)
 *   mark_intl_no    — records visitor.custom.isIntl = false and locks country
 *                     to "India" (implied tier) — no derivation needed for
 *                     domestic majority
 *
 * `mark_intl_*` chips DO advance the flow — they respect their own `next[]` so
 * the admin can pick a follow-up chip in the same author-authored tree.
 */
export const RESERVED_NODE_IDS = ['escape_ai', 'escape_human', 'mark_intl_yes', 'mark_intl_no'] as const;
export type ReservedNodeId = (typeof RESERVED_NODE_IDS)[number];

/** Bounds — mirrored by the validator so a wider zod parse still can't slip past. */
export const GUIDED_FLOW_LIMITS = {
  rootMin: 1,
  rootMax: 8,
  labelMaxLen: 80,
  answerMaxLen: 5000,
  nextMaxPerNode: 6,
  maxDepth: 8,
  maxNodes: 100,
} as const;

/**
 * Node id must be either a reserved id OR a lowercase-slug the admin chose.
 * Deliberately not a UUID: authors will refer to these in the editor, and short
 * meaningful ids (`btech_fees`) beat opaque ones for debugging.
 */
export const NODE_ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const GuidedFlowNodeSchema = z.object({
  id: z.string().regex(NODE_ID_REGEX),
  label: z.string().trim().min(1).max(GUIDED_FLOW_LIMITS.labelMaxLen),
  answer: z.string().trim().min(1).max(GUIDED_FLOW_LIMITS.answerMaxLen),
  next: z.array(z.string().regex(NODE_ID_REGEX)).max(GUIDED_FLOW_LIMITS.nextMaxPerNode),
});

export type GuidedFlowNode = z.infer<typeof GuidedFlowNodeSchema>;

export const GuidedFlowSchema = z.object({
  rootIds: z
    .array(z.string().regex(NODE_ID_REGEX))
    .min(GUIDED_FLOW_LIMITS.rootMin)
    .max(GUIDED_FLOW_LIMITS.rootMax),
  escapeToAiLabel: z.string().trim().min(1).max(GUIDED_FLOW_LIMITS.labelMaxLen),
  escapeToHumanLabel: z.string().trim().min(1).max(GUIDED_FLOW_LIMITS.labelMaxLen),
  /**
   * Chip labels for the international-detection side-effect chips. Optional
   * with defaults — an agent that doesn't put these in any node's `next[]`
   * never sees them. When present in the flow, both the label AND the ack
   * message must be authored, so an admin can match the wording to their brand.
   */
  markIntlYesLabel: z
    .string()
    .trim()
    .min(1)
    .max(GUIDED_FLOW_LIMITS.labelMaxLen)
    .optional()
    .default('Yes, from another country'),
  markIntlNoLabel: z
    .string()
    .trim()
    .min(1)
    .max(GUIDED_FLOW_LIMITS.labelMaxLen)
    .optional()
    .default("No, I'm from India"),
  markIntlYesAck: z
    .string()
    .trim()
    .min(1)
    .max(GUIDED_FLOW_LIMITS.answerMaxLen)
    .optional()
    .default('Thanks for letting me know. Which programme are you interested in?'),
  markIntlNoAck: z
    .string()
    .trim()
    .min(1)
    .max(GUIDED_FLOW_LIMITS.answerMaxLen)
    .optional()
    .default('Great, thanks. Which programme are you interested in?'),
  nodes: z.record(z.string(), GuidedFlowNodeSchema),
  /**
   * A purely rule-based bot: the AI is never called. No typing, no AI
   * follow-ups, and `escape_ai` is refused. Everything is the tree.
   */
  noAi: z.boolean().optional(),
  /**
   * Rule-based lead capture: after a random number of answered chips
   * (between afterMin and afterMax), while the visitor has left no number, one
   * of `prompts` (text + a stored `<ui>` form, taken in turn) is appended to the
   * answer. Then again every `repeatEvery` answers, up to `maxTimes`.
   */
  capture: z
    .object({
      afterMin: z.number().int().min(1).max(10),
      afterMax: z.number().int().min(1).max(10),
      repeatEvery: z.number().int().min(1).max(10).default(3),
      maxTimes: z.number().int().min(1).max(5).default(3),
      prompts: z.array(z.string().trim().min(1).max(GUIDED_FLOW_LIMITS.answerMaxLen)).min(1).max(6),
      /** From this many answers on, with no number yet, `gatePrompt` (a gate form) replaces the menu. */
      gateAfter: z.number().int().min(1).max(20).optional(),
      gatePrompt: z.string().trim().min(1).max(GUIDED_FLOW_LIMITS.answerMaxLen).optional(),
    })
    .optional(),
});

export type GuidedFlow = z.infer<typeof GuidedFlowSchema>;
