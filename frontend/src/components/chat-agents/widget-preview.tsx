import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { useTestChatAgent } from "@/components/chat-agents/hook/mutation/use-chat-agent-mutations";
import {
  TypingDots,
  WidgetBranding,
  WidgetBubble,
  WidgetComposer,
  WidgetDayDivider,
  WidgetHeader,
  WidgetHomeBody,
  WidgetHomeHeader,
  WidgetMessages,
  WidgetNav,
  WidgetPanel,
  WidgetPresets,
  WidgetStartCard,
  WidgetText,
  type WidgetTab,
} from "@/components/chat-agents/widget/widget-chrome";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/axios-config";
import { cn } from "@/lib/utils";
import type { ChatAgentFormValues } from "@/zod/chat-agent-schema";
import type { TestChatAgentMessage, WidgetTheme } from "@/types/chat-agent-types";

type PreviewMessage = {
  id: string;
  from: "bot" | "user";
  text: string;
  failed?: boolean;
};

/**
 * What one answer cost. Shown under the reply because this is the only place
 * the real per-turn spend is visible: rate limits count messages, and messages
 * vary enormously in cost depending on how much the chatbot knows.
 */
type ReplyMeta = { latencyMs: number; inputTokens: number; outputTokens: number };

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Math.random());
}

/**
 * The widget as a visitor will see it, drawn from unsaved form values.
 *
 * Built from the very same chrome the public iframe renders (`widget-chrome`),
 * home tab and all — not a lookalike. A replica drifts: it did, and what the
 * admin approved in here was not what the website showed.
 *
 * Two modes share one panel. **Preview** answers with a fixed line and costs
 * nothing — it is there so colours and copy can be judged. **Try it** calls
 * `POST /chat-agents/:id/test`, which runs the same pack, prompt and model as
 * the live widget but works on a draft chatbot, needs no allowed origin and
 * does not consume the visitor rate limits. Unsaved edits are not sent: the
 * test endpoint answers from what is stored, so the panel says so rather than
 * letting someone conclude their new instructions had no effect.
 */
export function WidgetPreview({
  values,
  agentId,
  className,
}: {
  values: ChatAgentFormValues;
  agentId: string;
  className?: string;
}) {
  const theme = values.theme as WidgetTheme;
  const [tab, setTab] = useState<WidgetTab>("home");
  const [live, setLive] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [meta, setMeta] = useState<ReplyMeta | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const test = useTestChatAgent(agentId);

  const name = values.name?.trim() || "Untitled chatbot";
  const greeting = values.greeting?.trim();
  const homeHeading = values.heading?.trim() || "Hey there";
  const homeSubheading = values.subheading?.trim() || `Got questions? Let's chat with ${name}.`;
  const presets = values.messagePresets.filter(Boolean).slice(0, 4);
  const placeholder = values.inputPlaceholder?.trim() || "Ask a question…";
  const avatarUrl = values.avatarUrl?.trim() || null;
  const askedOnce = messages.some((m) => m.from === "user");

  // The greeting is the first bubble, exactly as the live widget shows it.
  const thread = useMemo<PreviewMessage[]>(
    () => (greeting ? [{ id: "greeting", from: "bot", text: greeting }, ...messages] : messages),
    [greeting, messages],
  );

  // History for the API: the preview's canned turns must never be sent, or the
  // chatbot would be answering a conversation that never happened.
  const history = useMemo<TestChatAgentMessage[]>(
    () =>
      messages
        .filter((m) => !m.failed)
        .map((m) => ({
          role: m.from === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        })),
    [messages],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, test.isPending]);

  function reset() {
    setMessages([]);
    setMeta(null);
    setDraft("");
    setTab("home");
    test.reset();
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || test.isPending) return;

    setDraft("");
    setTab("messages");
    setMessages((prev) => [...prev, { id: uid(), from: "user", text: trimmed }]);

    if (!live) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          from: "bot",
          text: "This is a static preview — switch on “Try it” above to get a real answer from this chatbot.",
        },
      ]);
      return;
    }

    try {
      const result = await test.mutateAsync({ message: trimmed, history });
      setMessages((prev) => [...prev, { id: uid(), from: "bot", text: result.reply }]);
      setMeta({
        latencyMs: result.latencyMs,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          from: "bot",
          failed: true,
          text: getErrorMessage(error, "The chatbot could not answer. Train it, then try again."),
        },
      ]);
    }
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:16px_16px]",
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Preview
        </span>
        <div className="flex items-center gap-1">
          {meta ? (
            <span className="mr-1 text-[10px] text-muted-foreground tabular-nums">
              {(meta.latencyMs / 1000).toFixed(1)}s · {meta.inputTokens} in / {meta.outputTokens}{" "}
              out
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setLive((value) => !value);
              reset();
            }}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              live
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title="Answer with the real model instead of a canned line"
          >
            {live ? "Try it · on" : "Try it"}
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground"
            onClick={reset}
            aria-label="Reset conversation"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* The embed is 400×640; the preview keeps that width and a taller cap,
          centred in the rail, so the theme is judged at the size it ships in. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
        <WidgetPanel theme={theme} variant="card" className="max-h-[680px] max-w-[400px]">
          {tab === "home" ? (
            <>
              <WidgetHomeHeader
                theme={theme}
                heading={homeHeading}
                subheading={homeSubheading}
                name={name}
                avatarUrl={avatarUrl}
              />
              <WidgetHomeBody theme={theme}>
                <WidgetStartCard
                  theme={theme}
                  name={name}
                  avatarUrl={avatarUrl}
                  onClick={() => setTab("messages")}
                />
                {presets.length > 0 ? (
                  <WidgetPresets
                    theme={theme}
                    presets={presets}
                    disabled={test.isPending}
                    onSelect={(preset) => void send(preset)}
                    variant="cards"
                  />
                ) : null}
              </WidgetHomeBody>
            </>
          ) : (
            <>
              <WidgetHeader
                theme={theme}
                name={name}
                avatarUrl={avatarUrl}
                title={name}
                onBack={() => setTab("home")}
              />
              <WidgetMessages theme={theme} underHeader>
                <WidgetDayDivider theme={theme} />
                {thread.map((m, i) => (
                  <WidgetBubble
                    key={m.id}
                    theme={theme}
                    from={m.from}
                    failed={m.failed}
                    animate={theme.animations}
                    group={{
                      first: thread[i - 1]?.from !== m.from,
                      last: thread[i + 1]?.from !== m.from && !(test.isPending && m.from === "bot"),
                    }}
                  >
                    {m.from === "bot" ? <WidgetText text={m.text} /> : m.text}
                  </WidgetBubble>
                ))}
                {test.isPending ? (
                  <WidgetBubble
                    theme={theme}
                    from="bot"
                    animate={theme.animations}
                    group={{ first: thread.at(-1)?.from !== "bot", last: true }}
                  >
                    <TypingDots color={theme.mutedText} animated={theme.animations} />
                  </WidgetBubble>
                ) : null}
                {!askedOnce && presets.length > 0 ? (
                  <WidgetPresets
                    theme={theme}
                    presets={presets}
                    disabled={test.isPending}
                    onSelect={(preset) => void send(preset)}
                  />
                ) : null}
                <div ref={endRef} />
              </WidgetMessages>
              <WidgetComposer
                theme={theme}
                value={draft}
                onChange={setDraft}
                onSend={() => void send(draft)}
                placeholder={placeholder}
                disabled={test.isPending}
              />
            </>
          )}
          {tab === "home" ? <WidgetNav theme={theme} active={tab} onChange={setTab} /> : null}
          {theme.showBranding ? <WidgetBranding theme={theme} /> : null}
        </WidgetPanel>
      </div>
    </div>
  );
}
