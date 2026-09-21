/**
 * Renders the interactive element a bot attached to a reply (see lib/widget-ui.ts).
 *
 *   chips   tappable answers (single or multi-select), optional progress bar
 *   select  one to four dropdowns and a button
 *   card    something the bot presents: a result, a profile, a comparison table…
 *   guide   a personalised PDF guide, locked (blurred preview + unlock form) or
 *           unlocked (downloadable, visitor's name on the cover)
 *   form    an inline form: name, phone, callback slot, relation, visit day
 *
 * Every element answers by sending an ordinary visitor message, so the model
 * sees the choice in the transcript exactly as if it had been typed. Forms that
 * collect a phone number also store it through the lead endpoint, so the number
 * is on the record even if the model forgets to tag it.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarCheck,
  ChevronRight,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  Lock,
  Mail,
  PenLine,
  Quote,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";

import { CORNER_RADIUS, isLightHex } from "@/lib/chat-agent-constants";
import type { UiBlock, UiCard, UiCardItem, UiChips, UiFits, UiForm, UiGuide, UiMedia, UiProgress, UiSelect } from "@/lib/widget-ui";
import { iconFor } from "@/lib/widget-icons";
import type { WidgetTheme } from "@/types/chat-agent-types";

export type UiHandlers = {
  /** Send a visitor message, as if typed. */
  onSend: (text: string) => void | Promise<void>;
  /** Store a name + phone (+ email) on the conversation. */
  onLead: (name: string, phone: string, email?: string) => Promise<void>;
  /** Rule-based bots: show the visitor's summary and a scripted reply without calling the AI. */
  onLocal?: (visitorText: string, botText: string) => void;
  /** AI bots: open the composer so the visitor can type their own question instead. */
  onTypeOwn?: () => void;
  /** Rule-based bots: a form's "not now" just closes it (the menu stays). */
  onSkipLocal?: () => void;
};

const OWN_QUESTION = "Ask my own question";
const NONE_OF_THESE = "None of these";

type Props = UiHandlers & {
  theme: WidgetTheme;
  block: UiBlock;
  /** Only the latest reply's element takes input; older ones are shown as a record. */
  active: boolean;
  disabled?: boolean;
};

export function WidgetUiBlock(props: Props) {
  const { block } = props;
  switch (block.type) {
    case "chips":
      return <ChipsView {...props} block={block} />;
    case "select":
      return <SelectView {...props} block={block} />;
    case "card":
      return <CardView {...props} block={block} />;
    case "fits":
      return <FitsView {...props} block={block} />;
    case "guide":
      return <GuideView {...props} block={block} />;
    case "form":
      return <FormView {...props} block={block} />;
    default:
      return null;
  }
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function lookFor(theme: WidgetTheme) {
  const radius = CORNER_RADIUS[theme.corners] ?? CORNER_RADIUS.rounded;
  const light = isLightHex(theme.background);
  const panel: CSSProperties = {
    background: light ? "#ffffff" : theme.muted,
    color: theme.backgroundText,
    boxShadow: `0 0 0 1px ${theme.border}, 0 6px 18px -12px rgba(0,0,0,${light ? 0.25 : 0.6})`,
    borderRadius: Math.max(radius.bubble, 12),
  };
  const input: CSSProperties = {
    background: light ? theme.background : theme.background,
    color: theme.backgroundText,
    boxShadow: `inset 0 0 0 1px ${theme.border}`,
    borderRadius: Math.min(radius.bubble, 10),
  };
  const primaryBtn: CSSProperties = {
    background: theme.primary,
    color: theme.primaryText,
    borderRadius: Math.min(radius.bubble, 10),
  };
  const tint = `${theme.primary}${light ? "12" : "2b"}`;
  return { radius, light, panel, input, primaryBtn, tint };
}

function Wrap({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 max-w-[92%] pl-1">{children}</div>;
}

function ProgressBar({ theme, progress }: { theme: WidgetTheme; progress?: UiProgress }) {
  if (!progress) return null;
  const pct = Math.max(0, Math.min(100, (progress.step / progress.total) * 100));
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: theme.border }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: theme.primary }} />
      </div>
      <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: theme.mutedText }}>
        {progress.step}/{progress.total}
      </span>
    </div>
  );
}

function Pill({
  theme,
  children,
  selected,
  disabled,
  onClick,
}: {
  theme: WidgetTheme;
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { light } = lookFor(theme);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-widget-press
      className="inline-flex items-center gap-1 px-3.5 py-1.5 text-[13px] leading-snug font-medium disabled:opacity-50"
      style={{
        color: selected ? theme.primaryText : theme.primary,
        background: selected ? theme.primary : `${theme.primary}${light ? "12" : "2b"}`,
        borderRadius: 999,
        boxShadow: `inset 0 0 0 1px ${theme.primary}55`,
      }}
    >
      {selected ? <Check className="size-3.5" /> : null}
      {children}
    </button>
  );
}

/** A quieter pill that opens the composer: the visitor's own question beats any option list. */
function OwnQuestionPill({ theme, disabled, onClick }: { theme: WidgetTheme; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-widget-press
      className="inline-flex items-center gap-1 px-3.5 py-1.5 text-[13px] leading-snug font-medium disabled:opacity-50"
      style={{ color: theme.mutedText, borderRadius: 999, boxShadow: `inset 0 0 0 1px ${theme.border}` }}
    >
      <PenLine className="size-3.5" />
      {OWN_QUESTION}
    </button>
  );
}

/** The quiet text button under a panel's main button: "Not now", "Ask my own question". */
function SecondaryAction({ theme, label, disabled, onClick }: { theme: WidgetTheme; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-1.5 w-full py-1.5 text-[12.5px] font-medium disabled:opacity-50"
      style={{ color: theme.mutedText }}
    >
      {label}
    </button>
  );
}

function Field({ label, children, theme }: { label: string; children: ReactNode; theme: WidgetTheme }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold tracking-wide uppercase" style={{ color: theme.mutedText }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Closed({ theme, label }: { theme: WidgetTheme; label: string }) {
  return (
    <p className="mt-1 flex items-center gap-1 pl-1 text-[11px]" style={{ color: theme.mutedText }}>
      <Check className="size-3" /> {label}
    </p>
  );
}

// ── chips ────────────────────────────────────────────────────────────────────

function ChipsView({ theme, block, active, disabled, onSend, onTypeOwn }: Props & { block: UiChips }) {
  const [picked, setPicked] = useState<string[]>([]);
  if (!active) return null;

  // Every multi-select has an honest way out: "none of these", exclusive of the rest.
  const noneLabel = block.none ?? NONE_OF_THESE;
  const options = block.multi && !block.options.some((o) => /^none\b/i.test(o)) ? [...block.options, noneLabel] : block.options;
  const isNone = (o: string) => /^none\b/i.test(o);
  const toggle = (option: string) =>
    setPicked((p) =>
      p.includes(option)
        ? p.filter((o) => o !== option)
        : isNone(option)
          ? [option]
          : [...p.filter((o) => !isNone(o)), option],
    );
  const ownQuestion = !block.multi && onTypeOwn && !block.options.some((o) => /own question|type my/i.test(o));

  return (
    <Wrap>
      <ProgressBar theme={theme} progress={block.progress} />
      {block.prompt ? (
        <p className="mb-1.5 text-[10.5px] font-medium" style={{ color: theme.mutedText }}>
          {block.prompt}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Pill
            key={option}
            theme={theme}
            disabled={disabled}
            selected={block.multi ? picked.includes(option) : false}
            onClick={() => (block.multi ? toggle(option) : void onSend(option))}
          >
            {option}
          </Pill>
        ))}
        {ownQuestion ? <OwnQuestionPill theme={theme} disabled={disabled} onClick={onTypeOwn!} /> : null}
      </div>
      {block.multi ? (
        <button
          type="button"
          disabled={disabled || picked.length === 0}
          onClick={() => void onSend(picked.join(", "))}
          className="mt-2 px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40"
          style={lookFor(theme).primaryBtn}
        >
          {block.submit ?? "Done"} {picked.length ? `(${picked.length})` : ""}
        </button>
      ) : null}
    </Wrap>
  );
}

// ── select ───────────────────────────────────────────────────────────────────

function SelectView({ theme, block, active, disabled, onSend, onTypeOwn }: Props & { block: UiSelect }) {
  const look = lookFor(theme);
  const [values, setValues] = useState<string[]>(() => block.fields.map(() => ""));
  if (!active) return <Closed theme={theme} label={block.title ?? "Answered"} />;

  const ready = values.every(Boolean);
  return (
    <Wrap>
      <div className="p-3.5" style={look.panel}>
        <ProgressBar theme={theme} progress={block.progress} />
        {block.title ? <p className="mb-2.5 text-[13.5px] font-semibold tracking-tight">{block.title}</p> : null}
        <div className="flex flex-col gap-2.5">
          {block.fields.map((field, i) => (
            <Field key={field.label} label={field.label} theme={theme}>
              <select
                value={values[i]}
                disabled={disabled}
                onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                className="w-full px-2.5 py-2 text-[13px] outline-none"
                style={look.input}
              >
                <option value="">Choose…</option>
                {field.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled || !ready}
          onClick={() => void onSend(block.fields.map((f, i) => `${f.label}: ${values[i]}`).join(" · "))}
          className="mt-3 w-full py-2.5 text-[13px] font-semibold disabled:opacity-40"
          style={look.primaryBtn}
        >
          {block.submit ?? "Continue"}
        </button>
        {block.skip ? <SecondaryAction theme={theme} disabled={disabled} label={block.skip} onClick={() => void onSend(block.skip!)} /> : null}
        {onTypeOwn ? <SecondaryAction theme={theme} disabled={disabled} label={OWN_QUESTION} onClick={onTypeOwn} /> : null}
      </div>
    </Wrap>
  );
}

// ── card ─────────────────────────────────────────────────────────────────────

const STATUS_ICON = {
  ok: { Icon: CheckCircle2, color: "#16a34a" },
  warn: { Icon: AlertTriangle, color: "#d97706" },
  no: { Icon: XCircle, color: "#dc2626" },
  info: { Icon: Info, color: "" },
} as const;

function CardItemRow({ theme, item, first }: { theme: WidgetTheme; item: UiCardItem; first: boolean }) {
  const s = item.status ? STATUS_ICON[item.status] : null;
  const RowIcon = iconFor(item.icon);
  if (RowIcon) {
    return (
      <li className="flex items-start gap-2.5 py-1.5" style={{ borderTop: first ? undefined : `1px solid ${theme.border}` }}>
        <span
          className="mt-[1px] grid size-6 shrink-0 place-items-center rounded-md"
          style={{ background: `${theme.primary}14`, color: s && s.color ? s.color : theme.primary }}
        >
          <RowIcon className="size-3.5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
          <span className="font-semibold">{item.label}</span>
          {item.value ? <span style={{ color: theme.mutedText }}>: {item.value}</span> : null}
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2 py-1.5" style={{ borderTop: first ? undefined : `1px solid ${theme.border}` }}>
      {s ? (
        <s.Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: s.color || theme.primary }} />
      ) : (
        <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: theme.primary }} />
      )}
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
        <span className="font-semibold">{item.label}</span>
        {item.value ? <span style={{ color: theme.mutedText }}>: {item.value}</span> : null}
      </div>
    </li>
  );
}

const CARD_ICON: Record<NonNullable<UiCard["variant"]>, typeof Sparkles> = {
  result: Sparkles,
  profile: UserRound,
  summary: FileText,
  story: Quote,
  checklist: CheckCircle2,
  compare: FileText,
  stats: Sparkles,
  booking: CalendarCheck,
};

function CardView({ theme, block, active, disabled, onSend }: Props & { block: UiCard }) {
  const look = lookFor(theme);
  const Icon = CARD_ICON[block.variant ?? "summary"] ?? FileText;
  const profile = block.variant === "profile";
  const booking = block.variant === "booking";
  const stats = block.variant === "stats";

  return (
    <Wrap>
      <div className="overflow-hidden" style={look.panel}>
        <div
          className="flex items-start gap-3 px-3.5 pt-3.5 pb-3"
          style={{ background: booking || profile ? look.tint : undefined }}
        >
          <span
            className={profile ? "grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-bold" : "grid size-8 shrink-0 place-items-center rounded-full"}
            style={{ background: profile ? theme.primary : look.tint, color: profile ? theme.primaryText : theme.primary }}
          >
            {profile ? initials(block.title) : <Icon className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[14px] leading-snug font-semibold tracking-tight">{block.title}</p>
              {block.badge ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase"
                  style={{ background: theme.primary, color: theme.primaryText }}
                >
                  {block.badge}
                </span>
              ) : null}
            </div>
            {block.subtitle ? (
              <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: theme.mutedText }}>
                {block.subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="px-3.5 pb-3.5">
          <ProgressBar theme={theme} progress={block.progress} />

          {stats && block.items?.length ? (
            <div className="grid grid-cols-2 gap-2">
              {block.items.map((item) => (
                <div key={item.label} className="rounded-lg px-2.5 py-2" style={{ background: look.tint }}>
                  <p className="text-[15px] font-bold tracking-tight" style={{ color: theme.primary }}>
                    {item.value ?? "—"}
                  </p>
                  <p className="text-[11px] leading-snug" style={{ color: theme.mutedText }}>
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          ) : block.items?.length ? (
            <ul>
              {block.items.map((item, i) => (
                <CardItemRow key={`${item.label}-${i}`} theme={theme} item={item} first={i === 0} />
              ))}
            </ul>
          ) : null}

          {block.table ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr>
                    {block.table.columns.map((c) => (
                      <th key={c} className="px-1.5 pb-1.5 text-left font-semibold" style={{ color: theme.mutedText }}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.table.rows.map((row, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${theme.border}` }}>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-1.5 py-1.5 align-top ${j === 0 ? "font-semibold" : ""}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {block.quote ? (
            <blockquote
              className="mt-2 border-l-2 pl-2.5 text-[12.5px] leading-relaxed italic"
              style={{ borderColor: theme.primary }}
            >
              {block.quote}
            </blockquote>
          ) : null}

          {block.footer ? (
            <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: theme.mutedText }}>
              {block.footer}
            </p>
          ) : null}

          {block.links?.length ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {block.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2 text-[12.5px] font-semibold"
                  style={{ ...look.input, color: theme.primary }}
                >
                  {l.label}
                  <ArrowUpRight className="size-3.5" />
                </a>
              ))}
            </div>
          ) : null}

          {active && block.actions?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {block.actions.map((a) => (
                <Pill key={a} theme={theme} disabled={disabled} onClick={() => void onSend(a)}>
                  {a}
                </Pill>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Wrap>
  );
}

// ── fits ─────────────────────────────────────────────────────────────────────

/** A ranked shortlist: rank, name, one short reason, a match score. Nothing else. */
function FitsView({ theme, block, active, disabled, onSend }: Props & { block: UiFits }) {
  const look = lookFor(theme);
  return (
    <Wrap>
      <div className="overflow-hidden" style={look.panel}>
        <div className="px-3.5 pt-3 pb-2">
          <p className="text-[14px] leading-snug font-semibold tracking-tight">{block.title}</p>
          {block.subtitle ? (
            <p className="mt-0.5 text-[11.5px]" style={{ color: theme.mutedText }}>
              {block.subtitle}
            </p>
          ) : null}
        </div>
        <ol>
          {block.items.map((item, i) => {
            const top = i === 0;
            return (
              <li
                key={item.name}
                className="flex items-center gap-3 px-3.5 py-2.5"
                style={{ borderTop: `1px solid ${theme.border}`, background: top ? look.tint : undefined }}
              >
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums"
                  style={top ? { background: theme.primary, color: theme.primaryText } : { boxShadow: `inset 0 0 0 1.5px ${theme.border}`, color: theme.mutedText }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-snug font-semibold">{item.name}</p>
                  {item.why ? (
                    <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: theme.mutedText }}>
                      {item.why}
                    </p>
                  ) : null}
                </div>
                {typeof item.match === "number" ? (
                  <span className="shrink-0 text-right">
                    <span className="block text-[14px] leading-none font-bold tabular-nums" style={{ color: top ? theme.primary : theme.backgroundText }}>
                      {item.match}%
                    </span>
                    <span className="text-[9.5px] tracking-wide uppercase" style={{ color: theme.mutedText }}>
                      match
                    </span>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {active && block.actions?.length ? (
          <div className="flex flex-wrap gap-1.5 px-3.5 pt-1 pb-3">
            {block.actions.map((a) => (
              <Pill key={a} theme={theme} disabled={disabled} onClick={() => void onSend(a)}>
                {a}
              </Pill>
            ))}
          </div>
        ) : null}
      </div>
    </Wrap>
  );
}

function initials(text: string) {
  const words = text.replace(/[^A-Za-z\s.]/g, " ").split(/\s+/).filter((w) => w && !/^(dr|mr|mrs|ms)\.?$/i.test(w));
  return (words[0]?.[0] ?? "?").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase();
}

// ── lead fields (shared by guide unlock and form) ────────────────────────────

function validPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

// ── guide ────────────────────────────────────────────────────────────────────

function GuideView({ theme, block, active, disabled, onSend, onLead }: Props & { block: UiGuide }) {
  const look = lookFor(theme);
  const [unlocking, setUnlocking] = useState(false);
  const [name, setName] = useState(block.for ?? "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function unlock() {
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!validPhone(phone)) return setError("Enter a valid 10-digit mobile number.");
    setBusy(true);
    setError(null);
    try {
      await onLead(name.trim(), phone.trim());
      setSent(true);
      await onSend(`Yes, please send my guide. I'm ${name.trim()}, WhatsApp ${phone.trim()}.`);
    } catch {
      setError("Could not send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setDownloading(true);
    try {
      const { doc, filename } = await buildGuidePdf(block, theme);
      doc.save(filename);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Wrap>
      <div className="overflow-hidden" style={look.panel}>
        {/* Cover */}
        <div className="px-4 pt-4 pb-3.5" style={{ background: theme.primary, color: theme.primaryText }}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] uppercase opacity-85">
            <FileText className="size-3.5" /> Personalised guide · PDF
          </div>
          <p className="mt-1.5 text-[16px] leading-snug font-bold tracking-tight">{block.title}</p>
          {block.for ? <p className="mt-0.5 text-[12px] opacity-90">Prepared for {block.for}</p> : null}
          {block.subtitle ? <p className="mt-1 text-[11px] opacity-80">{block.subtitle}</p> : null}
        </div>

        {/* Contents */}
        <div className="px-4 py-3">
          <p className="mb-1.5 text-[10.5px] font-semibold tracking-wide uppercase" style={{ color: theme.mutedText }}>
            Inside · {block.sections.length} sections
          </p>
          <ol className="flex flex-col gap-2">
            {block.sections.map((s, i) => (
              <li key={s.heading} className="text-[12.5px] leading-snug">
                <div className="flex items-start gap-2">
                  <span className="w-4 shrink-0 font-bold tabular-nums" style={{ color: theme.primary }}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{s.heading}</p>
                    {block.locked ? (
                      <p
                        className="mt-0.5 line-clamp-2 select-none text-[11.5px]"
                        style={{ color: theme.mutedText, filter: "blur(3.5px)" }}
                        aria-hidden
                      >
                        {s.body}
                      </p>
                    ) : open ? (
                      <p className="mt-0.5 whitespace-pre-line text-[11.5px] leading-relaxed" style={{ color: theme.mutedText }}>
                        {s.body}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {block.locked ? (
            active && !sent ? (
              unlocking ? (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      maxLength={80}
                      className="w-full px-2.5 py-2 text-[13px] outline-none"
                      style={look.input}
                    />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="WhatsApp number"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={20}
                      className="w-full px-2.5 py-2 text-[13px] outline-none"
                      style={look.input}
                    />
                  </div>
                  {error ? <p className="text-[11px] text-red-500">{error}</p> : null}
                  <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => void unlock()}
                    className="flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold disabled:opacity-50"
                    style={look.primaryBtn}
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
                    Unlock my guide
                  </button>
                  <p className="text-center text-[10.5px]" style={{ color: theme.mutedText }}>
                    Used only to send this guide. Say stop anytime.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setUnlocking(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold disabled:opacity-50"
                  style={look.primaryBtn}
                >
                  <Lock className="size-3.5" /> {block.unlockLabel ?? "Unlock my guide"}
                </button>
              )
            ) : sent ? (
              <Closed theme={theme} label="Details sent — your guide is on its way" />
            ) : (
              <p className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: theme.mutedText }}>
                <Lock className="size-3" /> Locked preview
              </p>
            )
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void download()}
                disabled={downloading}
                className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
                style={look.primaryBtn}
              >
                {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="px-3 py-2.5 text-[12.5px] font-semibold"
                style={{ ...look.input, color: theme.primary }}
              >
                {open ? "Hide" : "Read here"}
              </button>
            </div>
          )}
          {!block.locked ? (
            <p className="mt-2 text-center text-[10.5px]" style={{ color: theme.mutedText }}>
              A copy also comes to your WhatsApp from your counsellor.
            </p>
          ) : null}
        </div>
      </div>
    </Wrap>
  );
}

/** jsPDF's built-in fonts are Latin-1 only; keep what they can draw. */
function pdfSafe(text: string) {
  return text
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return Number.isNaN(n) ? [30, 64, 175] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Builds the guide as a jsPDF document. Exported so it can be exercised without a download. */
export async function buildGuidePdf(block: UiGuide, theme: WidgetTheme) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const [r, g, b] = hexToRgb(theme.primary);

  // Cover band
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 190, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ACHARYA INSTITUTES, BENGALURU  -  PERSONALISED ADMISSION GUIDE", M, 50);
  doc.setFontSize(24);
  const titleLines = doc.splitTextToSize(pdfSafe(block.title), W - M * 2);
  doc.text(titleLines, M, 90);
  let y = 90 + titleLines.length * 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  if (block.for) {
    doc.text(pdfSafe(`Prepared for ${block.for}`), M, y);
    y += 18;
  }
  if (block.subtitle) {
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(pdfSafe(block.subtitle), W - M * 2), M, y);
  }
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), W - M, 50, { align: "right" });

  // Sections
  y = 230;
  doc.setTextColor(20, 20, 20);
  block.sections.forEach((s, i) => {
    const body = doc.splitTextToSize(pdfSafe(s.body), W - M * 2);
    const need = 26 + body.length * 14 + 18;
    if (y + need > H - 70) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(r, g, b);
    doc.text(pdfSafe(`${i + 1}. ${s.heading}`), M, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(40, 40, 40);
    body.forEach((line: string) => {
      if (y > H - 70) {
        doc.addPage();
        y = 60;
      }
      doc.text(line, M, y);
      y += 14;
    });
    y += 18;
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(220, 220, 220);
    doc.line(M, H - 48, W - M, H - 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      "Figures from Acharya's published information. Fees and scholarship slabs are confirmed by your counsellor. admissions@acharya.ac.in  |  +91 74066-44449",
      M,
      H - 34,
      { maxWidth: W - M * 2 - 40 },
    );
    doc.text(`${p}/${pages}`, W - M, H - 34, { align: "right" });
  }

  const slug = (block.for ? `${block.for}-` : "") + block.title;
  const filename = `${slug.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "guide"}.pdf`;
  return { doc, filename };
}

// ── form ─────────────────────────────────────────────────────────────────────

const RELATIONS = ["I'm the student", "Parent", "Guardian / relative"];

function FormView({ theme, block, active, disabled, onSend, onLead, onLocal, onSkipLocal }: Props & { block: UiForm }) {
  const look = lookFor(theme);
  const has = (f: UiForm["fields"][number]) => block.fields.includes(f);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [slot, setSlot] = useState("");
  const [relation, setRelation] = useState("");
  const [visitDay, setVisitDay] = useState("");
  const [email, setEmail] = useState("");
  const [extra, setExtra] = useState<string[]>(() => (block.selects ?? []).map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const HeadIcon = iconFor(block.icon) ?? CalendarCheck;

  if (skipped) return <Closed theme={theme} label="Skipped for now" />;
  if (!active) return <Closed theme={theme} label={block.title} />;
  if (done) return <Closed theme={theme} label="Sent" />;

  function skip() {
    setSkipped(true);
    if (block.local || block.quietSkip) onSkipLocal?.();
    else void onSend(block.skip ?? "Not now, let's keep going");
  }

  async function submit() {
    if (has("name") && name.trim().length < 2) return setError("Please enter a name.");
    if (has("phone") && !validPhone(phone)) return setError("Enter a valid 10-digit mobile number.");
    if (has("slot") && block.slots?.length && !slot) return setError("Pick a time.");
    if (has("visitDay") && block.visitDays?.length && !visitDay) return setError("Pick a day.");
    if (has("relation") && !relation) return setError("Tell us who is enquiring.");
    if (has("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    const missing = (block.selects ?? []).findIndex((_, i) => !extra[i]);
    if (missing >= 0) return setError(`Choose ${block.selects![missing].label.toLowerCase()}.`);
    setBusy(true);
    setError(null);
    try {
      if (has("phone")) await onLead(name.trim() || "Visitor", phone.trim(), has("email") ? email.trim() : undefined);
      const parts = [
        has("name") ? `Name: ${name.trim()}` : null,
        has("relation") ? relation : null,
        ...(block.selects ?? []).map((f, i) => `${f.label}: ${extra[i]}`),
        has("phone") ? `Mobile: ${phone.trim()}` : null,
        has("email") ? `Email: ${email.trim()}` : null,
        has("slot") && slot ? `Call me: ${slot}` : null,
        has("visitDay") && visitDay ? `Visit: ${visitDay}` : null,
      ].filter(Boolean);
      setDone(true);
      if (block.local && onLocal) {
        const first = name.trim().split(/\s+/)[0] || "there";
        onLocal(parts.join(" · "), (block.done ?? "Thanks, {name}. A counsellor will be in touch shortly.").replace(/\{name\}/g, first));
      } else {
        await onSend(parts.join(" · "));
      }
    } catch {
      setDone(false);
      setError("Could not send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const select = (value: string, set: (v: string) => void, options: string[], placeholder: string) => (
    <select
      value={value}
      disabled={busy || disabled}
      onChange={(e) => set(e.target.value)}
      className="w-full px-2.5 py-2 text-[13px] outline-none"
      style={look.input}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <Wrap>
      <div className="p-3.5" style={look.panel}>
        <div className="mb-2.5 flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: look.tint, color: theme.primary }}>
            <HeadIcon className="size-4" />
          </span>
          <div>
            <p className="text-[13.5px] leading-snug font-semibold tracking-tight">{block.title}</p>
            {block.subtitle ? (
              <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: theme.mutedText }}>
                {block.subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {has("relation") ? <Field label="Who is enquiring" theme={theme}>{select(relation, setRelation, RELATIONS, "Choose…")}</Field> : null}
          {has("name") ? (
            <Field label="Name" theme={theme}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" maxLength={80} disabled={busy} className="w-full px-2.5 py-2 text-[13px] outline-none" style={look.input} />
            </Field>
          ) : null}
          {has("phone") ? (
            <Field label="Mobile / WhatsApp" theme={theme}>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" autoComplete="tel" inputMode="tel" maxLength={20} disabled={busy} className="w-full px-2.5 py-2 text-[13px] outline-none" style={look.input} />
            </Field>
          ) : null}
          {(block.selects ?? []).map((f, i) => (
            <Field key={f.label} label={f.label} theme={theme}>
              {select(extra[i] ?? "", (v) => setExtra((xs) => xs.map((x, j) => (j === i ? v : x))), f.options, "Choose…")}
            </Field>
          ))}
          {has("email") ? (
            <Field label="Email" theme={theme}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" maxLength={120} disabled={busy} className="w-full px-2.5 py-2 text-[13px] outline-none" style={look.input} />
            </Field>
          ) : null}
          {has("slot") && block.slots?.length ? <Field label={block.icon === "video" ? "Preferred slot" : "Best time to call"} theme={theme}>{select(slot, setSlot, block.slots, "Pick a time…")}</Field> : null}
          {has("visitDay") && block.visitDays?.length ? <Field label="Visit day" theme={theme}>{select(visitDay, setVisitDay, block.visitDays, "Pick a day…")}</Field> : null}
        </div>
        {error ? <p className="mt-2 text-[11px] text-red-500">{error}</p> : null}
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void submit()}
          className="mt-3 flex w-full items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold disabled:opacity-50"
          style={look.primaryBtn}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {block.submit ?? "Send"}
        </button>
        {block.skip && !block.gate ? <SecondaryAction theme={theme} disabled={busy || disabled} label={block.skip} onClick={skip} /> : null}
        {block.note ? (
          <p className="mt-2 text-center text-[10.5px]" style={{ color: theme.mutedText }}>
            {block.note}
          </p>
        ) : null}
      </div>
    </Wrap>
  );
}


// ── pinned plan ─────────────────────────────────────────────────────────────

/**
 * A checklist pinned under the chat header: title, progress and the next open
 * step, expandable to the full list. The bot updates it; it is never re-sent
 * into the thread.
 */
export function WidgetPlanBar({ theme, plan }: { theme: WidgetTheme; plan: UiCard }) {
  const [open, setOpen] = useState(false);
  const look = lookFor(theme);
  const items = plan.items ?? [];
  const done = items.filter((i) => i.status === "ok").length;
  const total = plan.progress?.total ?? items.length;
  const step = plan.progress?.step ?? done;
  const nextOpen = items.find((i) => i.status !== "ok");
  const pct = total ? Math.max(0, Math.min(100, (step / total) * 100)) : 0;
  return (
    <div className="shrink-0 px-3 pt-2 pb-1.5" style={{ background: theme.background, borderBottom: `1px solid ${theme.border}` }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[12px] font-semibold">{plan.title}</p>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums" style={{ color: theme.primary }}>
            {step} of {total}
            <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: theme.border }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: theme.primary }} />
        </div>
        {!open && nextOpen ? (
          <p className="mt-1 truncate text-[11px]" style={{ color: theme.mutedText }}>
            Next: {nextOpen.label}
            {nextOpen.value ? `, ${nextOpen.value.replace(/^next:\s*/i, "")}` : ""}
          </p>
        ) : null}
      </button>
      {open && items.length ? (
        <ul className="mt-1.5 rounded-lg px-2.5 py-1" style={{ background: look.tint }}>
          {items.map((item, i) => (
            <CardItemRow key={`${item.label}-${i}`} theme={theme} item={item} first={i === 0} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ── photos ───────────────────────────────────────────────────────────────────

/** Up to three campus photos under a reply; the first is shown large. */
export function WidgetMedia({ theme, media }: { theme: WidgetTheme; media: UiMedia[] }) {
  const [broken, setBroken] = useState<string[]>([]);
  const shown = media.filter((m) => !broken.includes(m.url));
  if (!shown.length) return null;
  const radius = Math.max((CORNER_RADIUS[theme.corners] ?? CORNER_RADIUS.rounded).bubble, 12);
  const [lead, ...rest] = shown;
  const wideRest = rest.length === 1;
  const tile = (m: UiMedia, big: boolean) => (
    <a
      key={m.url}
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/img relative block overflow-hidden"
      style={{ borderRadius: radius, boxShadow: `0 0 0 1px ${theme.border}` }}
    >
      <img
        src={m.url}
        alt={m.caption}
        loading="lazy"
        onError={() => setBroken((b) => [...b, m.url])}
        className={`w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.03] ${big || wideRest ? "aspect-[16/10]" : "aspect-square"} object-top`}
      />
      <span
        className="absolute inset-x-0 bottom-0 px-2.5 pt-6 pb-1.5 text-[11px] leading-tight font-medium text-white"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,.65), transparent)" }}
      >
        {m.caption}
      </span>
    </a>
  );
  return (
    <div className="mt-1.5 max-w-[92%] pl-1">
      {tile(lead, true)}
      {rest.length ? <div className={`mt-1.5 grid gap-1.5 ${rest.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>{rest.map((m) => tile(m, false))}</div> : null}
    </div>
  );
}

// ── follow-up suggestions ───────────────────────────────────────────────────

/** Suggested next replies under the latest bot message. Optional: the composer stays open. */
export function WidgetNext({
  theme,
  options,
  disabled,
  onSend,
}: {
  theme: WidgetTheme;
  options: string[];
  disabled?: boolean;
  onSend: (text: string) => void | Promise<void>;
}) {
  if (!options.length) return null;
  const look = lookFor(theme);
  return (
    <div className="mt-2 flex max-w-[92%] flex-col items-start gap-1.5 pl-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => void onSend(o)}
          data-widget-press
          className="flex items-center gap-1.5 px-3 py-1.5 text-left text-[12.5px] leading-snug font-medium disabled:opacity-50"
          style={{ color: theme.primary, background: look.tint, borderRadius: 999, boxShadow: `inset 0 0 0 1px ${theme.primary}40` }}
        >
          {o}
          <ChevronRight className="size-3.5 shrink-0 opacity-70" />
        </button>
      ))}
    </div>
  );
}
