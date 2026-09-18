/**
 * Why a reply was liked or disliked. Mirrors FEEDBACK_REASONS in the backend's
 * widget-feedback.dto.ts — the server refuses anything outside this list.
 */
export const FEEDBACK_REASONS = {
  up: ["accurate", "helpful", "clear", "friendly", "fast"],
  down: ["incorrect", "unclear", "off_topic", "too_long", "unhelpful", "tone"],
} as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)["up"][number] | (typeof FEEDBACK_REASONS)["down"][number];

const LABELS: Record<string, string> = {
  accurate: "Accurate",
  helpful: "Helpful",
  clear: "Clear",
  friendly: "Friendly",
  fast: "Quick",
  incorrect: "Incorrect",
  unclear: "Unclear",
  off_topic: "Off topic",
  too_long: "Too long",
  unhelpful: "Unhelpful",
  tone: "Wrong tone",
};

export function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return "";
  return LABELS[reason] ?? reason.replace(/_/g, " ");
}
