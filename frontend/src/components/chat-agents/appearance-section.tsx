import type { UseFormReturn } from "react-hook-form";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { SectionHeading } from "@/components/chat-agents/profile-sections";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_WIDGET_THEME, matchThemePreset, THEME_PRESETS } from "@/lib/chat-agent-constants";
import type { ChatAgentFormValues } from "@/zod/chat-agent-schema";
import { cn } from "@/lib/utils";
import type { CornerStyle, LauncherPosition, ThemePalette } from "@/types/chat-agent-types";

type AgentForm = UseFormReturn<ChatAgentFormValues>;

const COLOR_FIELDS = [
  { key: "primary", label: "Accent", hint: "Header, launcher, visitor bubbles, send button" },
  { key: "primaryText", label: "On accent", hint: "Text drawn over the accent" },
  { key: "background", label: "Panel", hint: "Behind the conversation" },
  { key: "backgroundText", label: "Body text", hint: "Main message text" },
  { key: "muted", label: "Chatbot bubble", hint: "The assistant's messages" },
  { key: "mutedText", label: "Secondary text", hint: "Hints and captions" },
  { key: "border", label: "Border", hint: "Dividers and outlines" },
] as const;

/** Presets shown in the picker; the sixth card is "Custom", which opens the colour editor. */
const PICKER_PRESETS = THEME_PRESETS.slice(0, 5);

const CORNERS: { value: CornerStyle; label: string }[] = [
  { value: "rounded", label: "Rounded" },
  { value: "soft", label: "Soft" },
  { value: "square", label: "Square" },
];

/**
 * The appearance editor.
 *
 * Writes into the same react-hook-form instance as the rest of the profile, so
 * the existing dirty tracking, Save button and live preview all pick it up with
 * no extra plumbing — `form.watch()` already feeds the preview.
 */
export function AppearanceSection({ form }: { form: AgentForm }) {
  const theme = form.watch("theme");
  const activePreset = matchThemePreset(theme);
  // Anything that is not one of the five shown presets is "Custom" — including
  // a palette hand-tuned from a preset by a single hex.
  const isCustom = !PICKER_PRESETS.some((preset) => preset.id === activePreset);

  function set<K extends keyof ChatAgentFormValues["theme"]>(
    key: K,
    value: ChatAgentFormValues["theme"][K],
  ) {
    // Set the whole object rather than a `theme.<key>` path: react-hook-form's
    // template-literal path types don't narrow through a generic key, and the
    // object write is equivalent here.
    form.setValue("theme", { ...theme, [key]: value }, { shouldDirty: true, shouldValidate: true });
  }

  /**
   * Apply a preset — all seven colours at once.
   *
   * Layout and behaviour (corners, launcher, motion) are left alone on purpose:
   * they are decisions about how the widget sits on the page, not about how it
   * is coloured. Colours are replaced wholesale rather than merged, because a
   * half-applied palette is exactly the unreadable combination these avoid.
   */
  function applyPreset(palette: ThemePalette) {
    form.setValue("theme", { ...theme, ...palette }, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <SectionHeading
          title="Palette"
          hint="Pick a preset, or set your own colours under Custom. The preview on the right is live."
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() =>
            form.setValue("theme", DEFAULT_WIDGET_THEME, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PICKER_PRESETS.map((preset) => {
          const selected = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.palette)}
              aria-pressed={selected}
              className={presetCardClass(selected)}
            >
              <PresetSwatch palette={preset.palette} />
              <span className="min-w-0 truncate text-xs font-medium">{preset.name}</span>
            </button>
          );
        })}

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-pressed={isCustom} className={presetCardClass(isCustom)}>
              {/* The swatch mirrors the live theme, so a tuned palette still
                  reads as "yours" at a glance rather than as a blank card. */}
              <PresetSwatch palette={theme} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">Custom</span>
              <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[360px] p-2">
            <p className="px-1.5 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Colours
            </p>
            <div className="grid gap-1">
              {COLOR_FIELDS.map(({ key, label, hint }) => {
                const value = theme[key];
                const error = form.formState.errors.theme?.[key]?.message;
                return (
                  <div key={key} className="min-w-0 rounded-lg px-1.5 py-1.5 hover:bg-muted/60">
                    <div className="flex items-center gap-2.5">
                      {/* The swatch is a real colour input, so the OS picker is
                          available; the text field beside it is for pasting a brand hex. */}
                      <input
                        type="color"
                        aria-label={label}
                        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
                        onChange={(event) => set(key, event.target.value)}
                        className="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
                      </div>
                      <input
                        type="text"
                        value={value}
                        onChange={(event) => set(key, event.target.value)}
                        spellCheck={false}
                        className="w-[86px] shrink-0 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] uppercase outline-none focus:border-primary"
                      />
                    </div>
                    {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <SectionHeading
          title="Launcher"
          hint="How the widget sits on the page before it is opened."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-xs font-medium">Corners</label>
            <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
              {CORNERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set("corners", value)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs transition-colors",
                    theme.corners === value
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium">Position</label>
            <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
              {(["right", "left"] as LauncherPosition[]).map((position) => (
                <button
                  key={position}
                  type="button"
                  onClick={() => set("launcherPosition", position)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs capitalize transition-colors",
                    theme.launcherPosition === position
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {position}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-medium">Launcher size</label>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {theme.launcherSize}px
            </span>
          </div>
          <input
            type="range"
            min={44}
            max={80}
            step={2}
            value={theme.launcherSize}
            onChange={(event) => set("launcherSize", Number(event.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-[11px] text-muted-foreground">
            Stops at 44px — anything smaller fails as a touch target on a phone.
          </p>
        </div>

        <ThemeToggle
          checked={theme.animations}
          onChange={(value) => set("animations", value)}
          label="Animations"
          hint="Launcher entrance, panel open, typing dots. Visitors whose system asks for reduced motion never see them regardless."
        />
      </div>
    </div>
  );
}

function presetCardClass(selected: boolean): string {
  return cn(
    "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
    selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
  );
}

/**
 * A miniature of the widget itself: panel, border, accent. Names alone
 * ("Ocean") tell an author nothing about contrast.
 */
function PresetSwatch({
  palette,
}: {
  palette: Pick<ThemePalette, "background" | "border" | "primary">;
}) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border"
      style={{ background: palette.background, borderColor: palette.border }}
    >
      <span className="size-3.5 rounded-full" style={{ background: palette.primary }} />
    </span>
  );
}

function ThemeToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
