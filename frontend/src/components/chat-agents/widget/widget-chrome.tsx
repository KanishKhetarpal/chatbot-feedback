/**
 * Every painted piece of the visitor-facing widget, in one file.
 *
 * These are the parts a member of the public sees inside the iframe on the
 * university's website — kept apart from the rest of the CRM's UI kit on
 * purpose. Nothing here may use `@/components/ui/*`: those components read the
 * CRM's Tailwind theme tokens, and this panel is coloured entirely by the
 * chatbot's own saved theme, which the owner picked and which has no light/dark
 * mode. Every colour therefore arrives as an inline style rather than a class.
 *
 * `widget-chat.tsx` holds all of the state; this file holds none.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Home,
  Loader2,
  Menu,
  MessageCircle,
  PhoneCall,
  Send,
} from "lucide-react";

import { bubbleRadii, CORNER_RADIUS, isLightHex } from "@/lib/chat-agent-constants";
import { cn } from "@/lib/utils";
import { Config } from "@/lib/config";

const APP_NAME = Config.APP_NAME;
import type { WidgetChip, WidgetTheme } from "@/types/chat-agent-types";

/** `card` floats with its own radius and shadow; `flush` fills its container. */
export type WidgetChromeVariant = "card" | "flush";

/** Height of the conversation header; the thread scrolls underneath it. */
const HEADER_HEIGHT = 68;

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const n = Number.parseInt(raw.length === 3 ? raw.replace(/./g, "$&$&") : raw, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* ── Markdown ────────────────────────────────────────────────────────────── */

/**
 * Minimal markdown for agent replies — bold, inline code, links, bullets.
 *
 * Deliberately not a markdown library: these are short answers in a 400px
 * panel, and pulling a parser plus its plugins into the bundle to render four
 * constructs would cost more than it renders. Shared with the dashboard
 * preview so the two show the same text the same way.
 */
function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={match.index} className="rounded px-1 py-0.5 text-[0.9em] opacity-90">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("(") + 1, -1);
      nodes.push(
        <a key={match.index} href={href} target="_blank" rel="noreferrer" className="underline">
          {label}
        </a>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function WidgetText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => {
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <span key={index} className="flex gap-2 pl-0.5">
              <span
                className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-current opacity-60"
                aria-hidden
              />
              <span>{renderInline(bullet[1])}</span>
            </span>
          );
        }
        const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
        if (numbered) {
          return (
            <span key={index} className="flex gap-2">
              <span className="w-4 shrink-0 text-right tabular-nums opacity-70" aria-hidden>
                {numbered[1]}.
              </span>
              <span>{renderInline(numbered[2])}</span>
            </span>
          );
        }
        return (
          <span key={index} className={cn("block", !line.trim() && "h-2.5")}>
            {renderInline(line)}
          </span>
        );
      })}
    </>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

/**
 * Keyframes and chrome rules that have to travel with the widget.
 *
 * Inline styles cannot express keyframes, and inside the iframe this app's
 * stylesheet is the only one present — so the motion, the placeholder colour
 * and the scrollbar the panel needs ship here rather than in `styles.css`,
 * where they would load on every CRM page for nobody's benefit.
 */
const WIDGET_CHROME_CSS = `
@keyframes widget-typing {
  0%, 60%, 100% { transform: translateY(0); opacity: .35; }
  30% { transform: translateY(-3px); opacity: 1; }
}
@keyframes widget-message-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes widget-boot-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@keyframes widget-boot-ripple {
  0% { transform: scale(.55); opacity: .5; }
  80% { opacity: .08; }
  100% { transform: scale(1.25); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-widget-animate] { animation: none !important; }
}
[data-widget-root] input,
[data-widget-root] textarea {
  color-scheme: inherit;
}
[data-widget-root][data-widget-scheme="light"] input,
[data-widget-root][data-widget-scheme="light"] textarea {
  color-scheme: light;
}
[data-widget-root] input::placeholder,
[data-widget-root] textarea::placeholder {
  color: var(--widget-muted-text);
  opacity: 1;
}
[data-widget-root] ::selection {
  background: var(--widget-primary);
  color: var(--widget-primary-text);
}
[data-widget-scroll] {
  scrollbar-width: thin;
  scrollbar-color: var(--widget-border) transparent;
}
[data-widget-scroll]::-webkit-scrollbar { width: 6px; }
[data-widget-scroll]::-webkit-scrollbar-track { background: transparent; }
[data-widget-scroll]::-webkit-scrollbar-thumb {
  background: var(--widget-border);
  border-radius: 99px;
}
[data-widget-hover] { transition: background-color .15s ease, transform .15s ease; }
[data-widget-hover]:hover:not(:disabled) { background-color: var(--widget-hover) !important; }
[data-widget-hover] [data-widget-arrow] { transition: transform .2s cubic-bezier(.22,1,.36,1), opacity .2s ease; }
[data-widget-hover]:hover [data-widget-arrow] { transform: translateX(3px); opacity: 1; }
[data-widget-composer]:focus-within {
  box-shadow: inset 0 0 0 1px var(--widget-primary), 0 0 0 3px var(--widget-focus-ring) !important;
}
[data-widget-cta] { transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
[data-widget-cta]:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
[data-widget-cta]:active:not(:disabled) { transform: scale(.98); filter: brightness(.96); }
[data-widget-cta] [data-widget-arrow] { transition: transform .2s cubic-bezier(.22,1,.36,1); }
[data-widget-cta]:hover [data-widget-arrow] { transform: translate(2px, -2px); }
[data-widget-nav-tab]:hover:not([aria-current]) { opacity: 1 !important; }
[data-widget-nav-tab]:hover > span:first-child { transform: translateY(-1px); }
[data-widget-nav-tab]:active > span:first-child { transform: scale(.92); }
[data-widget-press] { transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease; }
[data-widget-press]:hover:not(:disabled) { transform: translateY(-1px); }
[data-widget-press]:active:not(:disabled) { transform: scale(.94); }
`;

export function WidgetPanel({
  theme,
  variant = "card",
  className,
  children,
}: {
  theme: WidgetTheme;
  variant?: WidgetChromeVariant;
  className?: string;
  children: ReactNode;
}) {
  const radius = CORNER_RADIUS[theme.corners] ?? CORNER_RADIUS.rounded;
  const light = isLightHex(theme.background);

  return (
    <div
      data-widget-root
      data-widget-scheme={light ? "light" : "dark"}
      className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden", className)}
      style={
        {
          // The accent, not the panel background: the header and the rounded
          // lip of the home sheet both sit on it, so it is what shows through.
          background: theme.primary,
          color: theme.backgroundText,
          borderRadius: variant === "card" ? radius.panel : 0,
          boxShadow: variant === "card" ? "0 24px 60px -18px rgba(15,23,42,.45)" : undefined,
          colorScheme: light ? "light" : "dark",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, Roboto, ui-sans-serif, system-ui, sans-serif',
          WebkitFontSmoothing: "antialiased",
          overscrollBehavior: "contain",
          "--widget-muted-text": theme.mutedText,
          "--widget-border": theme.border,
          "--widget-primary": theme.primary,
          "--widget-primary-text": theme.primaryText,
          // Hover tint and focus halo derive from the palette rather than being
          // two more colours for the owner to pick.
          "--widget-hover": isLightHex(theme.muted) ? "rgba(0,0,0,.045)" : "rgba(255,255,255,.07)",
          "--widget-focus-ring": `${theme.primary}40`,
        } as CSSProperties
      }
    >
      <style>{WIDGET_CHROME_CSS}</style>
      {children}
    </div>
  );
}

/* ── Conversation ────────────────────────────────────────────────────────── */

export function WidgetHeader({
  theme,
  name,
  avatarUrl,
  title,
  subtitle,
  onBack,
}: {
  theme: WidgetTheme;
  name: string;
  avatarUrl?: string | null;
  title: string;
  /** One short status line under the name, e.g. "Counsellor requested". Omit for none. */
  subtitle?: string;
  onBack?: () => void;
}) {
  const initial = (name?.charAt(0) || "A").toUpperCase();
  const light = isLightHex(theme.background);

  return (
    <header
      className="relative z-10 flex shrink-0 items-center px-2"
      style={{
        height: HEADER_HEIGHT,
        background: hexToRgba(theme.background, 0.82),
        WebkitBackdropFilter: "saturate(180%) blur(16px)",
        backdropFilter: "saturate(180%) blur(16px)",
        borderBottom: `1px solid ${theme.border}`,
        color: theme.backgroundText,
      }}
    >
      <div className="w-10 shrink-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            data-widget-hover
            className="grid size-9 place-items-center rounded-full"
            style={{ color: theme.primary }}
          >
            <ChevronLeft className="size-5" strokeWidth={2.4} />
          </button>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <div className="relative">
          <div
            className="grid size-8 place-items-center overflow-hidden rounded-full text-[11px] font-semibold"
            style={{
              background: theme.muted,
              boxShadow: `0 0 0 1px ${theme.border}`,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <span
            className="absolute -right-px -bottom-px size-2 rounded-full bg-emerald-500"
            style={{ boxShadow: `0 0 0 1.5px ${light ? theme.background : theme.muted}` }}
            aria-hidden
          />
        </div>
        <p className="mt-1.5 max-w-full truncate text-[12.5px] leading-tight font-semibold">
          {title}
        </p>
        {subtitle ? (
          <p
            className="max-w-full truncate text-[10.5px] leading-tight"
            style={{ color: theme.mutedText }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="w-10 shrink-0" aria-hidden />
    </header>
  );
}

/** Centred "Today" marker at the top of a thread. */
export function WidgetDayDivider({
  theme,
  label = "Today",
}: {
  theme: WidgetTheme;
  label?: string;
}) {
  return (
    <p
      className="text-center text-[10.5px] font-medium tracking-wide"
      style={{ color: theme.mutedText }}
    >
      {label}
    </p>
  );
}

export function WidgetMessages({
  theme,
  children,
  underHeader = false,
}: {
  theme: WidgetTheme;
  children: ReactNode;
  /** Slide the thread up behind the frosted `WidgetHeader` so it blurs what scrolls past. */
  underHeader?: boolean;
}) {
  return (
    <div
      data-widget-scroll
      className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3"
      style={{
        background: theme.background,
        color: theme.backgroundText,
        marginTop: underHeader ? -HEADER_HEIGHT : 0,
        paddingTop: underHeader ? HEADER_HEIGHT + 12 : 12,
      }}
    >
      {children}
    </div>
  );
}

export function WidgetBubble({
  theme,
  from,
  failed,
  animate,
  group,
  children,
}: {
  theme: WidgetTheme;
  from: "user" | "bot";
  failed?: boolean;
  animate?: boolean;
  /**
   * Where this message sits in a run from the same sender. Runs are drawn
   * tight, with the tail on the last bubble only — the way every messaging
   * app the visitor already uses does it. Omitted = a run of one.
   */
  group?: { first: boolean; last: boolean };
  children: ReactNode;
}) {
  const isUser = from === "user";
  const first = group?.first ?? true;
  const last = group?.last ?? true;
  const r = CORNER_RADIUS[theme.corners]?.bubble ?? 16;
  const radius = Math.max(r, 18);
  const tight = Math.max(4, Math.round(radius * 0.3));
  const fill = isUser ? theme.primary : theme.muted;

  // The "tail" is the sender-side bottom corner drawn tight, as Messenger,
  // Telegram and WhatsApp Web do it — no protruding shape to seam or mismatch.
  // Inside a run the inner corners tighten too, so the bubbles read as one
  // thread of speech rather than a stack of pills.
  const tail = 4;
  const borderRadius = isUser
    ? `${radius}px ${first ? radius : tight}px ${last ? tail : tight}px ${radius}px`
    : `${first ? radius : tight}px ${radius}px ${radius}px ${last ? tail : tight}px`;

  return (
    <div
      data-widget-animate={animate ? "" : undefined}
      className={cn(
        "flex",
        isUser ? "justify-end pl-12" : "justify-start pr-12",
        first && "mt-2.5",
      )}
      style={{
        animation: animate ? "widget-message-in .22s cubic-bezier(.22,1,.36,1)" : undefined,
      }}
    >
      <div
        className={cn(
          "relative max-w-full px-3.5 py-2 text-[14px] leading-[1.45]",
          isUser && "whitespace-pre-wrap",
          failed && "opacity-90",
        )}
        style={{
          background: fill,
          color: isUser ? theme.primaryText : failed ? "#ef4444" : theme.backgroundText,
          borderRadius,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The boot illustration: a chat bubble with live typing dots, floating over
 * two expanding ripple rings — "the chat is waking up", drawn rather than
 * said. Shown while the config loads.
 *
 * ⚠ The embed loader paints a pixel-identical twin of this OVER the iframe
 * from the moment the launcher is clicked until this app's first render
 * (`buildOverlay` in `src/widget-loader.js`) — that is what makes the
 * cover → app handover invisible. Change one, change both.
 *
 * Ripples rest at opacity 0 and the bubble at rest position, so the
 * `[data-widget-animate]` reduced-motion rule leaves a clean static figure
 * rather than a frozen mid-frame.
 */
export function WidgetBootFigure({ theme }: { theme: WidgetTheme }) {
  return (
    <div className="relative flex size-[88px] items-center justify-center">
      {[0, 1.1].map((delay) => (
        <span
          key={delay}
          data-widget-animate
          className="absolute inset-0 rounded-full border-2 opacity-0"
          style={{
            borderColor: theme.primary,
            animation: `widget-boot-ripple 2.2s ${delay}s infinite ease-out`,
          }}
        />
      ))}
      <div
        data-widget-animate
        className="relative"
        style={{ animation: "widget-boot-bob 2.2s infinite ease-in-out" }}
      >
        <div
          className="flex h-[42px] w-14 items-center justify-center gap-[5px] rounded-[14px]"
          style={{ background: theme.primary }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              data-widget-animate
              className="size-[7px] rounded-full opacity-35"
              style={{
                background: theme.primaryText,
                animation: `widget-typing 1.2s ${i * 0.16}s infinite ease-in-out`,
              }}
            />
          ))}
        </div>
        <span
          className="absolute -bottom-1 left-2.5 size-3 rotate-45 rounded-[2px]"
          style={{ background: theme.primary }}
        />
      </div>
    </div>
  );
}

export function TypingDots({ color, animated }: { color: string; animated: boolean }) {
  return (
    <span className="inline-flex h-4 items-center gap-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5 rounded-full"
          style={{
            background: color,
            opacity: animated ? undefined : 0.6,
            animation: animated
              ? `widget-typing 1.2s ${i * 0.16}s infinite ease-in-out`
              : undefined,
          }}
        />
      ))}
    </span>
  );
}

export function WidgetComposer({
  theme,
  value,
  onChange,
  onSend,
  onMenu,
  placeholder,
  disabled,
  error,
}: {
  theme: WidgetTheme;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** When set, a menu button appears that takes the visitor back to the root chips. */
  onMenu?: () => void;
  placeholder: string;
  disabled?: boolean;
  error?: string | null;
}) {
  const canSend = !disabled && Boolean(value.trim());
  const light = isLightHex(theme.background);

  return (
    <div
      className="relative shrink-0 px-3 pt-2 pb-3"
      style={{
        background: theme.background,
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      {error ? <p className="mb-2 text-[11px] text-red-500">{error}</p> : null}
      <div className="flex items-end gap-2">
        {onMenu ? (
          <button
            type="button"
            onClick={onMenu}
            disabled={disabled}
            data-widget-hover
            className="grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-50"
            style={{ color: theme.mutedText, background: theme.muted }}
            aria-label="Show menu"
            title="Menu"
          >
            <Menu className="size-4" />
          </button>
        ) : null}
        <div
          data-widget-composer
          className="flex min-w-0 flex-1 items-center transition-shadow"
          style={{
            background: light ? theme.background : theme.muted,
            borderRadius: 999,
            boxShadow: `inset 0 0 0 1px ${theme.border}`,
          }}
        >
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                onSend();
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={4000}
            className="h-10 min-w-0 flex-1 bg-transparent pl-4 pr-1 text-[14px] outline-none disabled:opacity-60"
            style={{ color: theme.backgroundText }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            data-widget-press
            className={cn(
              "mr-1 grid size-8 shrink-0 place-items-center rounded-full transition-opacity",
              !canSend && "opacity-35",
            )}
            style={{ background: theme.primary, color: theme.primaryText }}
            aria-label="Send"
          >
            {disabled ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowUp className="size-4" strokeWidth={2.6} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WidgetPresets({
  theme,
  presets,
  disabled,
  onSelect,
  variant = "list",
  title = variant === "cards" ? "Popular questions" : "Ask about",
}: {
  theme: WidgetTheme;
  presets: string[];
  disabled?: boolean;
  onSelect: (preset: string) => void;
  variant?: WidgetChipsVariant;
  title?: string;
}) {
  return (
    <WidgetChips
      theme={theme}
      title={title}
      chips={presets.map((label) => ({ id: label, label }))}
      disabled={disabled}
      onSelect={(chip) => onSelect(chip.label)}
      variant={variant}
    />
  );
}

/**
 * `list` — one grouped block, compact, for chips that follow an answer in the
 * conversation. `cards` — one card per chip with a question mark, for the
 * home tab where each is an invitation rather than a menu item.
 */
export type WidgetChipsVariant = "list" | "cards";

/**
 * A stacked list of tappable chips — the guided flow's building block, and the
 * same look the legacy presets use so a tree switched on mid-life does not
 * change the widget's face.
 */
export function WidgetChips({
  theme,
  title,
  chips,
  disabled,
  onSelect,
  variant = "list",
}: {
  theme: WidgetTheme;
  title?: string;
  chips: WidgetChip[];
  disabled?: boolean;
  onSelect: (chip: WidgetChip) => void;
  variant?: WidgetChipsVariant;
}) {
  if (!chips.length) return null;
  const radius = CORNER_RADIUS[theme.corners] ?? CORNER_RADIUS.rounded;

  if (variant === "cards") {
    return (
      <div>
        {title ? (
          <p className="mb-2.5 px-0.5 text-[13px] font-semibold tracking-tight">{title}</p>
        ) : null}
        <div className="flex flex-col gap-2">
          {chips.map((chip, i) => (
            <button
              key={`${chip.id}-${i}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(chip)}
              data-widget-hover
              data-widget-press
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] leading-snug disabled:opacity-50"
              style={{ ...homeCardStyle(theme), borderRadius: Math.max(radius.bubble, 14) }}
            >
              <span className="min-w-0 flex-1 font-medium">{chip.label}</span>
              <ChevronRight
                data-widget-arrow
                className="size-4 shrink-0 opacity-50"
                style={{ color: theme.mutedText }}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // In a thread: quick-reply pills, the way iMessage / WhatsApp business chats
  // offer them — outlined in the accent, wrapping, sitting where the reply goes.
  const light = isLightHex(theme.background);
  return (
    <div className="mt-1 pl-1">
      {title ? (
        <p className="mb-1.5 text-[10.5px] font-medium" style={{ color: theme.mutedText }}>
          {title}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, i) => (
          <button
            key={`${chip.id}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(chip)}
            data-widget-press
            className="px-3.5 py-1.5 text-[13px] leading-snug font-medium disabled:opacity-50"
            style={{
              color: theme.primary,
              background: `${theme.primary}${light ? "12" : "2b"}`,
              borderRadius: 999,
              boxShadow: `inset 0 0 0 1px ${theme.primary}55`,
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The end of the line: a counsellor has been asked for. Replaces the composer
 * so the visitor is not left typing into a conversation nobody is answering.
 */
export function WidgetHandoffNotice({ theme, text }: { theme: WidgetTheme; text: string }) {
  return (
    <div className="shrink-0 px-3 pt-2 pb-3" style={{ background: theme.background }}>
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] leading-snug"
        style={{
          background: theme.muted,
          color: theme.backgroundText,
          borderRadius: 14,
          boxShadow: `inset 0 0 0 1px ${theme.border}`,
        }}
      >
        <PhoneCall className="size-4 shrink-0" style={{ color: theme.primary }} />
        <span>{text}</span>
      </div>
    </div>
  );
}

/* ── Home tab ────────────────────────────────────────────────────────────── */

export type WidgetTab = "home" | "messages";

function AvatarMark({
  name,
  avatarUrl,
  sizeClass,
  wash,
  ring,
}: {
  name: string;
  avatarUrl?: string | null;
  sizeClass: string;
  wash: string;
  /** Hairline around the mark — the card border colour, so it never floats. */
  ring: string;
}) {
  const initial = (name?.charAt(0) || "A").toUpperCase();
  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden rounded-full text-xs font-semibold",
        sizeClass,
      )}
      style={{ background: wash, boxShadow: `0 0 0 1px ${ring}` }}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : initial}
    </div>
  );
}

export function WidgetHomeHeader({
  theme,
  heading,
  subheading,
  name,
  avatarUrl,
}: {
  theme: WidgetTheme;
  heading: string;
  subheading: string;
  /** Brand mark above the heading — the same avatar the conversation header shows. */
  name?: string;
  avatarUrl?: string | null;
}) {
  const lightAccent = isLightHex(theme.primary);
  const wash = lightAccent
    ? "linear-gradient(180deg, rgba(255,255,255,.22), rgba(0,0,0,.08))"
    : "linear-gradient(165deg, rgba(255,255,255,.18), rgba(0,0,0,.2))";
  const glow = lightAccent
    ? "radial-gradient(circle at 85% 15%, rgba(0,0,0,.10), transparent 55%)"
    : "radial-gradient(circle at 85% 15%, rgba(255,255,255,.22), transparent 55%)";
  const chipBg = lightAccent ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.16)";
  const initial = (name?.charAt(0) || "A").toUpperCase();

  return (
    <header
      className="relative shrink-0 overflow-hidden px-5 pt-5 pb-11"
      style={{ background: theme.primary, color: theme.primaryText }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: wash }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: glow }}
        aria-hidden
      />
      {/* Two soft rings drifting off the top-right corner — depth without a photo. */}
      <span
        className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full"
        style={{
          border: `1.5px solid ${lightAccent ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.14)"}`,
        }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -top-6 -right-20 size-44 rounded-full"
        style={{
          border: `1.5px solid ${lightAccent ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.10)"}`,
        }}
        aria-hidden
      />

      {name ? (
        <div className="relative mb-4 flex items-center justify-between">
          <div
            className="grid size-9 place-items-center overflow-hidden rounded-full text-[12px] font-semibold"
            style={{ background: chipBg, boxShadow: "0 0 0 2px rgba(255,255,255,.22)" }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: chipBg }}
          >
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
            Online
          </span>
        </div>
      ) : null}
      <h1 className="relative text-[26px] leading-[1.15] font-semibold tracking-tight">
        {heading}
      </h1>
      {subheading ? (
        <p className="relative mt-1.5 max-w-[18rem] text-[13px] leading-snug opacity-85">
          {subheading}
        </p>
      ) : null}
    </header>
  );
}

/** The sheet that overlaps the header's lower edge — hence the negative margin. */
export function WidgetHomeBody({ theme, children }: { theme: WidgetTheme; children: ReactNode }) {
  const light = isLightHex(theme.background);
  // A faint continuation of the accent under the cards: on a flat white sheet
  // the cards had nothing to sit on and the empty run below them read as a bug.
  const tint = `${theme.primary}${light ? "12" : "2e"}`;
  return (
    <div
      data-widget-scroll
      className="relative z-10 -mt-5 min-h-0 flex-1 overflow-y-auto rounded-t-[22px]"
      style={{
        background: `linear-gradient(180deg, ${tint} 0%, transparent 260px), ${theme.background}`,
        color: theme.backgroundText,
      }}
    >
      <div className="flex flex-col gap-5 px-4 pt-4 pb-5">{children}</div>
    </div>
  );
}

/** Card surface for the home tab: the panel colour on a light theme, the muted one on dark. */
function homeCardStyle(theme: WidgetTheme): CSSProperties {
  const light = isLightHex(theme.background);
  return {
    background: light ? theme.background : theme.muted,
    color: theme.backgroundText,
    boxShadow: light
      ? `inset 0 0 0 1px ${theme.border}, 0 1px 2px rgba(0,0,0,.03), 0 4px 14px -6px rgba(0,0,0,.08)`
      : `inset 0 0 0 1px ${theme.border}, 0 4px 14px -6px rgba(0,0,0,.4)`,
  };
}

/**
 * The "start a conversation" card: one tappable row — avatar, title, reply
 * time, and a round send button on the right. A full-width CTA under the row
 * doubled the card's height and shouted next to the question cards below.
 */
export function WidgetStartCard({
  theme,
  name,
  avatarUrl,
  onClick,
}: {
  theme: WidgetTheme;
  name: string;
  avatarUrl?: string | null;
  onClick: () => void;
}) {
  const radius = CORNER_RADIUS[theme.corners] ?? CORNER_RADIUS.rounded;
  const card = homeCardStyle(theme);
  const wash = isLightHex(theme.background) ? theme.primary : "rgba(255,255,255,.16)";

  return (
    <button
      type="button"
      onClick={onClick}
      data-widget-press
      className="flex w-full items-center gap-3 p-3.5 text-left"
      style={{ ...card, borderRadius: Math.max(radius.bubble, 16) }}
    >
      <span className="relative shrink-0">
        <AvatarMark
          name={name}
          avatarUrl={avatarUrl}
          sizeClass="size-11"
          wash={wash}
          ring={theme.border}
        />
        <span
          className="absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-400"
          style={{ boxShadow: `0 0 0 2px ${card.background}` }}
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-tight">
          Send us a message
        </span>
        <span className="mt-0.5 block truncate text-[12px]" style={{ color: theme.mutedText }}>
          Typically replies instantly
        </span>
      </span>
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full"
        style={{
          background: theme.primary,
          color: theme.primaryText,
          boxShadow: `0 4px 12px -6px ${theme.primary}b3`,
        }}
        aria-hidden
      >
        <Send className="size-4 -translate-x-px translate-y-px" strokeWidth={2.2} />
      </span>
    </button>
  );
}

/**
 * Bottom tab bar. Icon over label, the active tab in the brand colour and
 * nothing else — no chips or filled pills, which read as heavy next to the
 * home cards. A thin top edge and a faint lift shadow separate it from the
 * sheet above.
 */
export function WidgetNav({
  theme,
  active,
  onChange,
}: {
  theme: WidgetTheme;
  active: WidgetTab;
  onChange: (tab: WidgetTab) => void;
}) {
  // On a light accent the primary would be near-invisible against the panel, so
  // the body text colour marks the active tab instead.
  const activeColor = isLightHex(theme.primary) ? theme.backgroundText : theme.primary;
  const light = isLightHex(theme.background);

  return (
    <nav
      className="relative z-10 grid shrink-0 grid-cols-2 border-t"
      style={{
        borderColor: theme.border,
        background: theme.background,
        boxShadow: light
          ? "0 -10px 24px -22px rgba(0,0,0,.35)"
          : "0 -10px 24px -22px rgba(0,0,0,.8)",
      }}
      aria-label="Widget sections"
    >
      <NavTab
        activeColor={activeColor}
        mutedColor={theme.mutedText}
        label="Home"
        active={active === "home"}
        onClick={() => onChange("home")}
        icon={<Home className="size-[22px]" strokeWidth={active === "home" ? 2.1 : 1.7} />}
      />
      <NavTab
        activeColor={activeColor}
        mutedColor={theme.mutedText}
        label="Messages"
        active={active === "messages"}
        onClick={() => onChange("messages")}
        icon={
          <MessageCircle className="size-[22px]" strokeWidth={active === "messages" ? 2.1 : 1.7} />
        }
      />
    </nav>
  );
}

function NavTab({
  activeColor,
  mutedColor,
  label,
  active,
  onClick,
  icon,
}: {
  activeColor: string;
  mutedColor: string;
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      data-widget-nav-tab
      className="flex flex-col items-center gap-1 px-2 pt-3 pb-2.5 text-[11px] leading-none font-medium transition-colors duration-200"
      style={{ color: active ? activeColor : mutedColor, opacity: active ? 1 : 0.9 }}
    >
      <span className="grid place-items-center transition-transform duration-200">{icon}</span>
      <span style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
    </button>
  );
}

/* ── Lead capture ────────────────────────────────────────────────────────── */

/**
 * Asks the visitor for a name and number.
 *
 * A form rather than the chatbot asking conversationally. Chat feels friendlier,
 * but it leaves you parsing free text, validating a mobile out of a sentence,
 * and handling "actually it's for my son" — and what arrives is a string you
 * hope is a phone number. Two fields give you something a counsellor can dial.
 *
 * Drawn as a sheet in the composer's slot, not as a bubble in the thread: it
 * is never cut off by the fold, the thread above stays readable, and while it
 * is up there is one thing to do. "Keep chatting" brings the composer back.
 */
export function LeadCaptureCard({
  theme,
  onSubmit,
  onDismiss,
  animate,
}: {
  theme: WidgetTheme;
  onSubmit: (name: string, phone: string) => Promise<void>;
  onDismiss: () => void;
  animate?: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const radius = CORNER_RADIUS[theme.corners] ?? CORNER_RADIUS.rounded;
  const light = isLightHex(theme.background);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    // Checked here as well as on the server so the correction happens where the
    // typo is, without a round trip.
    const digits = phone.replace(/\D/g, "");
    if (name.trim().length < 2) {
      setError("Please enter your name.");
      return;
    }
    if (digits.length < 7 || digits.length > 15) {
      setError("Enter a valid phone number.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim(), phone.trim());
    } catch {
      setError("Could not send that. Please try again.");
      setBusy(false);
    }
  }

  const inputStyle: CSSProperties = {
    background: light ? theme.background : theme.muted,
    color: theme.backgroundText,
    boxShadow: `inset 0 0 0 1px ${theme.border}`,
    borderRadius: Math.min(radius.bubble, 12),
  };

  return (
    <form
      onSubmit={submit}
      data-widget-animate={animate ? "" : undefined}
      className="shrink-0 px-3.5 pt-3.5 pb-3"
      style={{
        background: theme.background,
        color: theme.backgroundText,
        borderTop: `1px solid ${theme.border}`,
        boxShadow: "0 -12px 24px -20px rgba(0,0,0,.35)",
        animation: animate ? "widget-message-in .26s cubic-bezier(.22,1,.36,1)" : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full"
          style={{ background: `${theme.primary}${light ? "14" : "33"}`, color: theme.primary }}
          aria-hidden
        >
          <PhoneCall className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-semibold tracking-tight">
            Want a counsellor to call you?
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: theme.mutedText }}>
            Leave your details and we'll ring you back — usually within the hour.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          maxLength={100}
          disabled={busy}
          data-widget-composer
          className="w-full px-3 py-2.5 text-[13px] outline-none transition-shadow disabled:opacity-60"
          style={inputStyle}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile number"
          autoComplete="tel"
          inputMode="tel"
          maxLength={20}
          disabled={busy}
          data-widget-composer
          className="w-full px-3 py-2.5 text-[13px] outline-none transition-shadow disabled:opacity-60"
          style={inputStyle}
        />
      </div>

      {error ? (
        <p className="mt-2 text-[11px]" style={{ color: "#ef4444" }}>
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          data-widget-cta
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
          style={{
            background: theme.primary,
            color: theme.primaryText,
            borderRadius: 999,
            boxShadow: `0 6px 16px -6px ${theme.primary}99`,
          }}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PhoneCall className="size-3.5" />
          )}
          Request a call
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          data-widget-hover
          className="shrink-0 px-3.5 py-2.5 text-[13px] font-medium"
          style={{ color: theme.mutedText, borderRadius: 999 }}
        >
          Keep chatting
        </button>
      </div>

      {/* A mobile number is personal data. Saying what happens to it, at the
          point it is asked for, is both the decent thing and what consent under
          the DPDP Act is supposed to look like. */}
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: theme.mutedText }}>
        By sharing your number you agree to be contacted about admissions.
      </p>
    </form>
  );
}

/* ── Branding ────────────────────────────────────────────────────────────── */

/** The "Powered by" line under the nav, when the owner leaves it on. */
export function WidgetBranding({ theme }: { theme: WidgetTheme }) {
  return (
    <p
      className="shrink-0 pb-1.5 text-center text-[10px] tracking-wide"
      style={{ background: theme.background, color: theme.mutedText }}
    >
      Powered by <span className="font-semibold">{APP_NAME}</span>
    </p>
  );
}
