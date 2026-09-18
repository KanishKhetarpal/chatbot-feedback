/**
 * The "⋯" under every bot reply — the feedback entry point.
 *
 *   Like / Dislike            one tap, optimistic
 *   Why?                      a short reason list that appears once voted
 *   Add a note                free text
 *   Copy reply
 *
 * Once rated, a small chip ("Liked · Accurate") sits next to the dots so the
 * state is visible without opening anything. Styled from the chatbot's own
 * theme so it reads as part of the widget.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  Copy,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CORNER_RADIUS, isLightHex } from "@/lib/chat-agent-constants";
import { FEEDBACK_REASONS, reasonLabel } from "@/lib/feedback-reasons";
import { cn } from "@/lib/utils";
import type { WidgetTheme } from "@/types/chat-agent-types";

export type MessageRating = "up" | "down" | null;

export function MessageActions({
  theme,
  text,
  rating,
  reason,
  note,
  disabled,
  onRate,
}: {
  theme: WidgetTheme;
  /** The reply's text, for "Copy". */
  text: string;
  rating: MessageRating;
  reason: string | null;
  note: string | null;
  disabled?: boolean;
  onRate: (rating: MessageRating, reason: string | null, note: string | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(fn: () => Promise<void>) {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError("Could not save — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const vote = (next: MessageRating) =>
    run(() => onRate(next, next && next === rating ? reason : null, note));
  const pickReason = (next: string) => run(() => onRate(rating, next, note));
  const saveNote = () =>
    run(async () => {
      await onRate(rating, reason, draft.trim() || null);
      setNoteOpen(false);
    });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — nothing to say */
    }
  }

  const radius = Math.min(CORNER_RADIUS[theme.corners]?.bubble ?? 12, 12);
  const light = isLightHex(theme.background);
  const itemStyle: CSSProperties = { color: theme.backgroundText };
  const itemClass =
    "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-[var(--wm-hover)] data-[disabled]:opacity-50";

  const Item = ({
    icon: Icon,
    children,
    onSelect,
    active,
    danger,
  }: {
    icon: LucideIcon;
    children: ReactNode;
    onSelect: () => void;
    active?: boolean;
    danger?: boolean;
  }) => (
    <Menu.Item className={itemClass} style={itemStyle} onSelect={onSelect} disabled={busy || disabled}>
      <Icon
        className="size-4 shrink-0"
        strokeWidth={2.25}
        style={{
          color: danger ? "#ef4444" : active ? theme.primary : theme.mutedText,
          fill: active ? theme.primary : "transparent",
        }}
      />
      <span className="flex-1">{children}</span>
      {active ? <Check className="size-3.5" style={{ color: theme.primary }} /> : null}
    </Menu.Item>
  );

  const reasons = rating ? FEEDBACK_REASONS[rating] : [];

  return (
    <div className="mt-1 flex flex-col gap-1.5 pl-1">
      <div className="flex items-center gap-1.5">
        <Menu.Root modal={false}>
          <Menu.Trigger asChild>
            <button
              type="button"
              aria-label="Message options"
              title="Rate this reply"
              disabled={disabled}
              className={cn(
                "grid size-6 place-items-center rounded-full transition-opacity",
                rating ? "opacity-70" : "opacity-45",
                "hover:opacity-100 group-hover/msg:opacity-90 data-[state=open]:opacity-100 disabled:opacity-30",
              )}
              style={{ color: theme.mutedText, background: "transparent" }}
            >
              <MoreHorizontal className="size-4" strokeWidth={2.5} />
            </button>
          </Menu.Trigger>

          <Menu.Portal>
            <Menu.Content
              side="bottom"
              align="start"
              sideOffset={4}
              collisionPadding={8}
              className="z-[1000] min-w-[220px] rounded-xl p-1 outline-none"
              style={
                {
                  background: theme.background,
                  color: theme.backgroundText,
                  boxShadow: `0 0 0 1px ${theme.border}, 0 14px 36px rgba(0,0,0,${light ? 0.16 : 0.5})`,
                  "--wm-hover": theme.muted,
                } as CSSProperties
              }
            >
              <Item icon={ThumbsUp} active={rating === "up"} onSelect={() => void vote("up")}>
                {rating === "up" ? "Liked" : "Like this reply"}
              </Item>
              <Item icon={ThumbsDown} active={rating === "down"} onSelect={() => void vote("down")}>
                {rating === "down" ? "Disliked" : "Dislike this reply"}
              </Item>

              {rating ? (
                <>
                  <Menu.Separator className="my-1 h-px" style={{ background: theme.border }} />
                  <Menu.Label
                    className="px-2.5 pt-1 pb-1 text-[10.5px] font-semibold tracking-wide uppercase"
                    style={{ color: theme.mutedText }}
                  >
                    {rating === "up" ? "What made it good?" : "What went wrong?"}
                  </Menu.Label>
                  <Menu.RadioGroup value={reason ?? ""} onValueChange={(v) => void pickReason(v)}>
                    {reasons.map((r) => (
                      <Menu.RadioItem key={r} value={r} className={itemClass} style={itemStyle} disabled={busy}>
                        <span
                          className="grid size-4 shrink-0 place-items-center rounded-full"
                          style={{ boxShadow: `inset 0 0 0 1.5px ${reason === r ? theme.primary : theme.border}` }}
                        >
                          <Menu.ItemIndicator>
                            <span className="block size-2 rounded-full" style={{ background: theme.primary }} />
                          </Menu.ItemIndicator>
                        </span>
                        {reasonLabel(r)}
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioGroup>
                </>
              ) : null}

              <Menu.Separator className="my-1 h-px" style={{ background: theme.border }} />
              <Item icon={MessageSquareText} onSelect={() => setNoteOpen(true)}>
                {note ? "Edit your note" : "Add a note"}
              </Item>
              <Item icon={copied ? Check : Copy} onSelect={() => void copy()}>
                {copied ? "Copied" : "Copy reply"}
              </Item>
              {rating ? (
                <Item icon={X} danger onSelect={() => void vote(null)}>
                  Remove my rating
                </Item>
              ) : null}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>

        {rating ? (
          <span
            className="flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold"
            style={{
              background: theme.muted,
              color: rating === "up" ? theme.primary : theme.mutedText,
            }}
          >
            {rating === "up" ? (
              <ThumbsUp className="size-3" style={{ fill: theme.primary }} strokeWidth={2.25} />
            ) : (
              <ThumbsDown className="size-3" strokeWidth={2.25} />
            )}
            {rating === "up" ? "Liked" : "Disliked"}
            {reason ? <span style={{ color: theme.mutedText }}>· {reasonLabel(reason)}</span> : null}
          </span>
        ) : null}

        {note && !noteOpen ? (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium opacity-80 hover:opacity-100"
            style={{ background: theme.muted, color: theme.mutedText }}
            title={note}
          >
            <MessageSquareText className="size-3" /> Note
          </button>
        ) : null}

        {busy ? <Loader2 className="size-3 animate-spin" style={{ color: theme.mutedText }} /> : null}
      </div>

      {error ? (
        <p className="text-[11px] text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      {noteOpen ? (
        <div className="flex items-end gap-1.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={rating === "down" ? "What should it have said?" : "What did you notice about this reply?"}
            className="min-w-0 flex-1 resize-none px-2.5 py-1.5 text-[12px] outline-none"
            style={{
              background: light ? theme.background : theme.muted,
              color: theme.backgroundText,
              boxShadow: `inset 0 0 0 1px ${theme.border}`,
              borderRadius: radius,
            }}
          />
          <button
            type="button"
            onClick={() => void saveNote()}
            disabled={busy}
            className="grid size-7 place-items-center rounded-full disabled:opacity-50"
            style={{ background: theme.primary, color: theme.primaryText }}
            aria-label="Save note"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
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
