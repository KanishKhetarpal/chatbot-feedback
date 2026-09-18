import type { Transition, Variants } from "motion/react";
import type {
  DensityPreference,
  TextSizePreference,
  UiPreferences,
} from "@/types/ui-preference-types";

// ── House motion language (formerly lib/motion-constants.ts) ──

// ── House motion language ────────────────────────────────────────────────────
// Every framer-motion surface pulls from these so the whole app shares one
// physical feel. Don't inline ad-hoc springs/durations in feature components.

/** Instant-feeling UI response — indicators, pills, tab underlines. */
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 };

/** Playful overshoot — badges popping, toolbars springing in. */
export const SPRING_BOUNCY: Transition = { type: "spring", stiffness: 420, damping: 22, mass: 0.9 };

/** Heavier settle — content entrances, rolling numbers. */
export const SPRING_SETTLE: Transition = { type: "spring", stiffness: 230, damping: 30, mass: 1 };

/** Matches MENU_HOVER_PILL_TRANSITION's curve for tween-based reveals. */
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

/** Gap between staggered children in cascade entrances. */
export const STAGGER_INTERVAL = 0.06;

/** Parent variants for a staggered cascade (pair with `cascadeItem` children). */
export const cascadeContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER_INTERVAL, delayChildren: 0.04 } },
};

/** Child variants: blur-up rise with a spring settle. */
export const cascadeItem: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: SPRING_SETTLE },
};

// ── UI preference options (formerly lib/ui-preferences-constants.ts) ──

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  density: "compact",
  textSize: "default",
  reduceMotion: false,
  sidebarCollapsed: false,
};

export const DENSITY_OPTIONS: { value: DensityPreference; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

/** `rootFontSize` is written to `--ui-font-size` on `<html>`. */
export const TEXT_SIZE_OPTIONS: {
  value: TextSizePreference;
  label: string;
  rootFontSize: string;
}[] = [
  { value: "small", label: "Small", rootFontSize: "13px" },
  { value: "default", label: "Default", rootFontSize: "14px" },
  { value: "large", label: "Large", rootFontSize: "16px" },
];

export const THEME_OPTIONS: { value: "light" | "dark" | "system"; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

// ── Chart palette + source/stage colour helpers (formerly lib/chart-colors.ts) ──

const PROPER_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  google: "Google",
  meta: "Meta",
  website: "Website",
  referral: "Referral",
};

/** Format a raw source name for display: walk_in → Walk In, whatsapp → WhatsApp */
export function formatSourceName(name: string): string {
  if (!name) return name;
  const key = name.toLowerCase().replace(/[\s_-]/g, "");
  if (PROPER_NAMES[key]) return PROPER_NAMES[key];
  return name
    .replace(/[_-]/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function cv(name: string): string {
  if (typeof document === "undefined") return `var(${name})`;
  // Return "" (not `var(...)`) when the variable is undefined, so callers'
  // `cv(...) || fallback` chains actually fall back — an unresolvable var()
  // renders black in SVG fills.
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const STAGE_COLOR_MAP: Record<string, string> = {
  untouched: "#94a3b8", // Slate-400 (Neutral/cold)
  not_answered: "#f97316", // Orange-500 (No response)
  touched: "#818cf8", // Indigo-400 (First contact)
  cold: "#60a5fa", // Blue-400 (Cold/inactive)
  warm: "#fbbf24", // Amber-400 (Warm interest)
  hot: "#fb923c", // Orange-400 (Hot interest)
  prospect: "#6366f1", // Indigo-500 (Qualified prospect)
  future_prospect: "#a5b4fc", // Indigo-300 (Nurturing prospect)
  course_details_filled: "#38bdf8", // Sky-400 (Engaged)
  application_initiated: "#3b82f6", // Blue-500 (Application started)
  application_submitted: "#8b5cf6", // Violet-500 (Application complete)
  enrolled: "#10b981", // Emerald-500 (Enrolled!)
  not_interested: "#ef4444", // Red-500 (Lost/Not interested)
  disqualified: "#f43f5e", // Rose-500 (Disqualified)
};

/** Bar fill for a lead stage, falling back to the neutral slate. */
export function stageColor(stage: string): string {
  return STAGE_COLOR_MAP[stage.toLowerCase()] ?? "#94a3b8";
}

/** Heat-map cell classes for a count relative to the grid's max. */
export function heatClass(value: number, max: number): string {
  if (value === 0) return "bg-muted text-muted-foreground";
  const ratio = value / max;
  if (ratio > 0.7) return "bg-danger text-white";
  if (ratio > 0.4) return "bg-danger/70 text-white";
  if (ratio > 0.2) return "bg-danger/25 text-danger";
  return "bg-danger/10 text-danger";
}

/** Text colour per `BadgeTone`, for figures that carry a tone but no badge. */
export const TONE_TEXT_CLASS: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
  info: "text-info",
};

export function getChartColors() {
  // Categorical palette — reordered for best visual contrast
  const palette = [
    cv("--chart-8"), // deep indigo
    cv("--chart-7"), // blue
    cv("--chart-9"), // purple
    cv("--chart-2"), // teal
    cv("--chart-5"), // amber
    cv("--chart-1"), // orange
    cv("--chart-6"), // sky
    cv("--chart-10"), // pink
  ];

  // Stage colors: visually distinct across all 7 states
  // slate → violet → blue → sky → orange → emerald (win) / red (loss)
  const stageMap: Record<string, string> = {
    new: "#94a3b8", // slate       – not yet engaged
    qualified: "#818cf8", // indigo      – first positive signal
    assigned: "#38bdf8", // sky blue    – in motion
    contacted: "#a78bfa", // violet      – real engagement
    nurturing: "#fb923c", // orange      – warming up
    converted: "#34d399", // emerald     – positive outcome
    lost: "#f87171", // soft red    – negative outcome
  };

  return {
    /** 8-color categorical palette from CSS theme vars */
    palette,

    /** Resolve a stage name to its semantic color, falling back to palette by index */
    stageColor: (name: string, fallbackIndex = 0): string => {
      const key = name.toLowerCase();
      return STAGE_COLOR_MAP[key] ?? stageMap[key] ?? palette[fallbackIndex % palette.length];
    },

    /** Pipeline series — leads → apps → submitted → enrolled */
    pipeline: {
      leadsCreated: cv("--chart-8"),
      applicationsStarted: cv("--chart-9"),
      submitted: cv("--chart-6"),
      enrolled: cv("--chart-11"),
    },

    /** Primary colors (darker / lighter variations and shades) */
    primary: {
      default: cv("--primary") || "oklch(39.479% 0.25216 267.845)",
      dark: cv("--primary-dark") || "oklch(28% 0.2 267.845)",
      light: cv("--primary-light") || "oklch(75% 0.13 267.845)",
      shades: [
        cv("--primary-shade-1") || "oklch(20% 0.16 267.845)",
        cv("--primary-shade-2") || "oklch(26% 0.20 267.845)",
        cv("--primary-shade-3") || "oklch(33% 0.23 267.845)",
        cv("--primary-shade-4") || "oklch(39.479% 0.25216 267.845)",
        cv("--primary-shade-5") || "oklch(46% 0.245 267.845)",
        cv("--primary-shade-6") || "oklch(52% 0.22 267.845)",
        cv("--primary-shade-7") || "oklch(59% 0.20 267.845)",
        cv("--primary-shade-8") || "oklch(65% 0.18 267.845)",
        cv("--primary-shade-9") || "oklch(72% 0.15 267.845)",
        cv("--primary-shade-10") || "oklch(78% 0.13 267.845)",
        cv("--primary-shade-11") || "oklch(84% 0.09 267.845)",
        cv("--primary-shade-12") || "oklch(90% 0.06 267.845)",
      ],
    },

    /** Application funnel stages */
    appStage: {
      applicationsCreated: cv("--chart-8"),
      submitted: cv("--chart-9"),
      verified: cv("--chart-6"),
      approved: cv("--chart-2"),
      offerReleased: cv("--chart-5"),
      feePaid: cv("--chart-1"),
      enrolled: cv("--chart-11"),
    } as Record<string, string>,

    /** Shared recharts Tooltip props */
    tt: {
      contentStyle: {
        borderRadius: 8,
        border: "none",
        boxShadow: "0 4px 20px rgba(0,0,0,0.13)",
        fontSize: 12,
        padding: "8px 12px",
      },
      labelStyle: { color: "#111827", fontWeight: 600 as const, marginBottom: 4 },
      itemStyle: { color: "#374151", padding: "1px 0" },
    },
  };
}
