/**
 * The widget's appearance contract.
 *
 * `ChatAgent.theme` is a JSON column, which until recently meant it had no shape
 * at all: the chat panel expected seven colours, the embed loader read two, the
 * dashboard wrote none, and the panel carried a `raw["primaryColor"] ?? raw["primary"]`
 * fallback because nobody could say which name was canonical.
 *
 * This file is that definition. Values are validated on write and normalised on
 * read, so an agent always answers with a complete theme and no consumer has to
 * guess or defend. The stored JSON stays sparse — only what an author actually
 * changed — and defaults fill the rest at read time, so changing a default here
 * updates every agent that never overrode it.
 *
 * There is deliberately **no light/dark mode**. A widget is not a site: it does
 * not follow the visitor's system preference, it looks the way its owner chose.
 * Named presets live in the dashboard and simply fill in these seven colours, so
 * "pick a look" is a UI affordance rather than a stored mode the server has to
 * reason about — and a preset can be added or retuned without a migration.
 */

export const LAUNCHER_POSITIONS = ['right', 'left'] as const;
export type LauncherPosition = (typeof LAUNCHER_POSITIONS)[number];

export const CORNER_STYLES = ['rounded', 'soft', 'square'] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];

export interface WidgetTheme {
  /** Accent: launcher fill, the visitor's own bubbles, the send button. */
  primary: string;
  /** Text and icons drawn on top of `primary`. */
  primaryText: string;
  /** The panel behind the conversation. */
  background: string;
  /** Body text on `background`. */
  backgroundText: string;
  /** The agent's message bubbles, and other raised surfaces. */
  muted: string;
  /** Secondary text — timestamps, hints. */
  mutedText: string;
  border: string;
  corners: CornerStyle;
  launcherPosition: LauncherPosition;
  /** Launcher diameter in px. Clamped — a launcher can be tasteful or a billboard, not both. */
  launcherSize: number;
  /** Entrance and open/close motion. Always overridden by prefers-reduced-motion. */
  animations: boolean;
  /** "Powered by" line under the composer. */
  showBranding: boolean;
}

/** What a brand-new agent looks like before anyone touches it. */
export const DEFAULT_THEME: WidgetTheme = {
  primary: '#ea580c',
  primaryText: '#fff7ed',
  background: '#ffffff',
  backgroundText: '#111827',
  muted: '#f3f4f6',
  mutedText: '#6b7280',
  border: '#e5e7eb',
  corners: 'rounded',
  launcherPosition: 'right',
  launcherSize: 56,
  animations: true,
  showBranding: true,
};

export const LAUNCHER_SIZE_MIN = 44; // below this it fails a touch-target check
export const LAUNCHER_SIZE_MAX = 80;

/** `#rgb`, `#rrggbb`, `#rrggbbaa`. Deliberately not accepting arbitrary CSS. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value.trim());
}

const COLOR_KEYS = [
  'primary',
  'primaryText',
  'background',
  'backgroundText',
  'muted',
  'mutedText',
  'border',
] as const satisfies readonly (keyof WidgetTheme)[];

/**
 * Turn whatever is stored into a complete, safe theme.
 *
 * Reads leniently — a legacy key, a bad colour, a missing field, or a whole
 * `null` all resolve to something renderable. The widget must never fail to draw
 * because of a stored value; the place to reject bad input is on write.
 *
 * Legacy `*Color` names, and the `mode` key from before presets replaced it, are
 * tolerated here and only here, so agents themed earlier keep rendering. Nothing
 * writes either any more.
 */
export function resolveTheme(raw: unknown): WidgetTheme {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;

  const theme: WidgetTheme = { ...DEFAULT_THEME };

  for (const key of COLOR_KEYS) {
    const candidate = source[key] ?? source[`${key}Color`];
    if (isHexColor(candidate)) theme[key] = candidate.trim().toLowerCase();
  }

  if (typeof source.corners === 'string' && (CORNER_STYLES as readonly string[]).includes(source.corners)) {
    theme.corners = source.corners as CornerStyle;
  }
  if (
    typeof source.launcherPosition === 'string' &&
    (LAUNCHER_POSITIONS as readonly string[]).includes(source.launcherPosition)
  ) {
    theme.launcherPosition = source.launcherPosition as LauncherPosition;
  }
  if (typeof source.launcherSize === 'number' && Number.isFinite(source.launcherSize)) {
    theme.launcherSize = Math.min(
      LAUNCHER_SIZE_MAX,
      Math.max(LAUNCHER_SIZE_MIN, Math.round(source.launcherSize)),
    );
  }
  if (typeof source.animations === 'boolean') theme.animations = source.animations;
  if (typeof source.showBranding === 'boolean') theme.showBranding = source.showBranding;

  return theme;
}

/**
 * Keep only what differs from the defaults.
 *
 * Storing the full object would freeze today's defaults into every agent, so a
 * later change to the palette would reach nobody. Sparse storage means "I did
 * not choose this" stays distinguishable from "I chose exactly this".
 */
export function compactTheme(theme: WidgetTheme): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(theme) as [keyof WidgetTheme, unknown][]) {
    if (value !== DEFAULT_THEME[key]) out[key] = value;
  }
  return out;
}

/** The radius each corner style maps to, in px. Shared so panel and launcher agree. */
export const CORNER_RADIUS: Record<CornerStyle, { panel: number; bubble: number }> = {
  rounded: { panel: 22, bubble: 16 },
  soft: { panel: 12, bubble: 10 },
  square: { panel: 2, bubble: 2 },
};
