/**
 * Rate limits for the public widget endpoint.
 *
 * Windows, not daily budgets. A budget that resets at midnight takes an agent
 * offline for the rest of the day once it trips; a window plus a cooldown heals
 * itself, so a burst of abuse costs an hour rather than a business day.
 *
 * Env-overridable because the right numbers depend on real traffic nobody has
 * seen yet, and tuning them should not require a deploy.
 */

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MINUTE = 60_000;

export interface LimitRule {
  /** Messages allowed inside one window. */
  max: number;
  /** Window length in ms. Elapsing resets the count. */
  windowMs: number;
  /** How long access is withheld once the limit trips. */
  cooldownMs: number;
}

/**
 * Per visitor — fairness, not security. A caller who clears site data gets a new
 * token and a fresh counter, which is fine: this exists to stop one person
 * monopolising an agent, not to stop an attacker.
 */
export const VISITOR_LIMIT: LimitRule = {
  max: num('WIDGET_VISITOR_MAX_MESSAGES', 20),
  windowMs: num('WIDGET_VISITOR_WINDOW_MINUTES', 60) * MINUTE,
  cooldownMs: num('WIDGET_VISITOR_COOLDOWN_MINUTES', 60) * MINUTE,
};

/**
 * Per agent — the real ceiling.
 *
 * Keyed on the agent, which the caller cannot change by clearing storage or
 * rotating IPs, so this is what actually bounds what an abusive script can
 * spend. Set it high enough that legitimate traffic never sees it and low enough
 * that a runaway loop costs an hour of one agent rather than a month of budget.
 */
export const AGENT_LIMIT: LimitRule = {
  max: num('WIDGET_AGENT_MAX_MESSAGES', 500),
  windowMs: num('WIDGET_AGENT_WINDOW_MINUTES', 60) * MINUTE,
  cooldownMs: num('WIDGET_AGENT_COOLDOWN_MINUTES', 60) * MINUTE,
};

/**
 * Per-visitor limit for the guided-flow chip endpoint.
 *
 * MUCH more permissive than VISITOR_LIMIT because a chip click costs no AI
 * money (server just resolves a lookup and writes two rows). The only thing
 * this bounds is a script hammering the endpoint to fill the messages table —
 * 300/hr per visitor is generous for real use, tight enough to make abuse
 * costly.
 */
export const STEP_LIMIT: LimitRule = {
  max: num('WIDGET_STEP_MAX_MESSAGES', 300),
  windowMs: num('WIDGET_STEP_WINDOW_MINUTES', 60) * MINUTE,
  cooldownMs: num('WIDGET_STEP_COOLDOWN_MINUTES', 60) * MINUTE,
};

/** Shown when a limit has tripped and the agent has no handoff message set. */
export const DEFAULT_LIMIT_MESSAGE =
  'I’ve reached my limit for now. Please try again a little later, or contact our team directly.';
