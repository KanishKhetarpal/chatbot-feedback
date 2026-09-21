/**
 * Why a reply was liked or disliked. Mirrors FEEDBACK_REASONS in the backend's
 * widget-feedback.dto.ts — the server refuses anything outside this list.
 */
export const FEEDBACK_REASONS = {
  up: ["convincing", "natural_ask", "good_offer", "accurate", "helpful", "clear", "friendly", "fast"],
  down: ["pushy", "too_early", "scripted", "incorrect", "unclear", "off_topic", "too_long", "unhelpful", "tone"],
} as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)["up"][number] | (typeof FEEDBACK_REASONS)["down"][number];

const LABELS: Record<string, string> = {
  convincing: "Convinced me to share my number",
  natural_ask: "Asked for details naturally",
  good_offer: "Good offer / reason to share",
  pushy: "Too pushy",
  too_early: "Asked too early",
  scripted: "Sounds scripted / robotic",
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
