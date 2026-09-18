/**
 * The feedback controls drawn inside the chat panel — the reason this app
 * exists. Styled from the chatbot's own theme so they read as part of the
 * widget rather than something bolted on.
 *
 *   `MessageFeedback`     thumbs up / down under a reply, with an optional note
 *   `ConversationRating`  1–5 stars + comment on the whole conversation
 */

import { useState, type CSSProperties } from "react";
import { Check, Loader2, MessageSquareText, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";

import { CORNER_RADIUS, isLightHex } from "@/lib/chat-agent-constants";
import { cn } from "@/lib/utils";
import type { WidgetTheme } from "@/types/chat-agent-types";

export type MessageRating = "up" | "down" | null;

export function MessageFeedback({
  theme,
  rating,
  note,
  disabled,
  onRate,
}: {
  theme: WidgetTheme;
  rating: MessageRating;
  note?: string | null;
  disabled?: boolean;
  onRate: (rating: MessageRating, note?: string | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  async function vote(next: MessageRating) {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await onRate(next === rating ? null : next, note ?? null);
      if (next === "down" && next !== rating) setNoteOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (busy) return;
    setBusy(true);
    try {
      await onRate(rating, draft.trim() || null);
      setNoteOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const button = (kind: "up" | "down") => {
    const active = rating === kind;
    const Icon = kind === "up" ? ThumbsUp : ThumbsDown;
    return (
      <button
        type="button"
        onClick={() => void vote(kind)}
        disabled={busy || disabled}
        aria-pressed={active}
        aria-label={kind === "up" ? "Good reply" : "Bad reply"}
        title={kind === "up" ? "Good reply" : "Bad reply"}
        className={cn(
          "grid size-6 place-items-center rounded-full transition-all disabled:opacity-50",
          active ? "scale-105" : "opacity-60 hover:opacity-100",
        )}
        style={{
          background: active ? theme.primary : "transparent",
          color: active ? theme.primaryText : theme.mutedText,
        }}
      >
        <Icon className="size-3.5" strokeWidth={2.25} />
      </button>
    );
  };

  const inputStyle: CSSProperties = {
    background: isLightHex(theme.background) ? theme.background : theme.muted,
    color: theme.backgroundText,
    boxShadow: `inset 0 0 0 1px ${theme.border}`,
    borderRadius: Math.min(CORNER_RADIUS[theme.corners]?.bubble ?? 12, 12),
  };

  return (
    <div className="mt-1 flex flex-col gap-1.5 pl-1">
      <div className="flex items-center gap-1">
        {button("up")}
        {button("down")}
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          disabled={disabled}
          className={cn(
            "ml-0.5 flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium transition-opacity",
            note ? "opacity-90" : "opacity-60 hover:opacity-100",
          )}
          style={{ color: theme.mutedText, background: note ? theme.muted : "transparent" }}
          title="Leave a note on this reply"
        >
          <MessageSquareText className="size-3" />
          {note ? "Note added" : "Add note"}
        </button>
        {busy ? <Loader2 className="size-3 animate-spin" style={{ color: theme.mutedText }} /> : null}
      </div>
      {noteOpen ? (
        <div className="flex items-end gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="What was wrong (or right) about this reply?"
            className="min-w-0 flex-1 resize-none px-2.5 py-1.5 text-[12px] outline-none"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => void saveNote()}
            disabled={busy}
            className="grid size-7 place-items-center rounded-full"
            style={{ background: theme.primary, color: theme.primaryText }}
            aria-label="Save note"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNoteOpen(false);
              setDraft(note ?? "");
            }}
            className="grid size-7 place-items-center rounded-full"
            style={{ background: theme.muted, color: theme.mutedText }}
            aria-label="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ConversationRating({
  theme,
  rating,
  comment,
  onSubmit,
  onDismiss,
  animate,
}: {
  theme: WidgetTheme;
  rating: number | null;
  comment?: string | null;
  onSubmit: (rating: number, comment: string | null) => Promise<void>;
  onDismiss?: () => void;
  animate?: boolean;
}) {
  const [stars, setStars] = useState(rating ?? 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(comment ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(Boolean(rating));
  const [error, setError] = useState<string | null>(null);

  const radius = CORNER_RADIUS[theme.corners] ?? CORNER_RADIUS.rounded;
  const light = isLightHex(theme.background);

  async function submit() {
    if (busy || !stars) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(stars, text.trim() || null);
      setSaved(true);
    } catch {
      setError("Could not save your rating. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-widget-animate={animate ? "" : undefined}
      className="shrink-0 px-3.5 pt-3 pb-3"
      style={{ background: theme.background, borderTop: `1px solid ${theme.border}` }}
    >
      <div
        className="p-3"
        style={{
          background: theme.muted,
          color: theme.backgroundText,
          borderRadius: radius.bubble,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold">{saved ? "Thanks for rating this chat" : "How was this chat?"}</p>
            <p className="text-[11px]" style={{ color: theme.mutedText }}>
              {saved ? "You can change your rating at any time." : "Your rating helps us improve the chatbot."}
            </p>
          </div>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="grid size-6 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100"
              style={{ color: theme.mutedText }}
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= (hover || stars);
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setStars(n);
                  setSaved(false);
                }}
                onMouseEnter={() => setHover(n)}
                disabled={busy}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className="grid size-8 place-items-center rounded-full transition-transform hover:scale-110"
              >
                <Star
                  className="size-5"
                  strokeWidth={1.75}
                  style={{ color: filled ? theme.primary : theme.mutedText, fill: filled ? theme.primary : "transparent" }}
                />
              </button>
            );
          })}
          <span className="ml-1 text-[11px]" style={{ color: theme.mutedText }}>
            {stars ? `${stars}/5` : ""}
          </span>
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          rows={2}
          maxLength={4000}
          placeholder="Anything we should know? (optional)"
          className="mt-2 w-full resize-none px-2.5 py-1.5 text-[12px] outline-none"
          style={{
            background: light ? theme.background : theme.background,
            color: theme.backgroundText,
            boxShadow: `inset 0 0 0 1px ${theme.border}`,
            borderRadius: Math.min(radius.bubble, 12),
          }}
        />

        {error ? <p className="mt-1.5 text-[11px] text-red-500">{error}</p> : null}

        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !stars || saved}
            className="flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: theme.primary, color: theme.primaryText }}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
            {saved ? "Saved" : "Submit rating"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The small "Rate this chat" pill the composer row shows once a conversation has some substance. */
export function RateChatButton({ theme, onClick, rated }: { theme: WidgetTheme; onClick: () => void; rated: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium opacity-80 hover:opacity-100"
      style={{ background: theme.muted, color: rated ? theme.primary : theme.mutedText }}
    >
      <Star className="size-3" style={{ fill: rated ? theme.primary : "transparent" }} />
      {rated ? "Update rating" : "Rate this chat"}
    </button>
  );
}
