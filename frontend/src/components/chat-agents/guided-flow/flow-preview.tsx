/**
 * The tree as a visitor will walk it, simulated entirely in the browser.
 *
 * Nothing here talks to the server: chips resolve against the draft, merge
 * tokens fill from a sample known caller (or their fallbacks), and the system
 * chips act out what the API would do — so a flow can be tried before it is
 * saved, and a broken branch is found by pressing it rather than by reading.
 */

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import {
  WidgetBubble,
  WidgetChips,
  WidgetHandoffNotice,
  WidgetHeader,
  WidgetMessages,
  WidgetText,
} from "@/components/chat-agents/widget/widget-chrome";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  CORNER_RADIUS,
  DEFAULT_WIDGET_THEME,
  GUIDED_FLOW_MERGE_TOKENS,
  guidedChipsFor,
  interpolateGuidedAnswer,
  isLightHex,
} from "@/lib/chat-agent-constants";
import { cn } from "@/lib/utils";
import type { ChatAgent, GuidedFlow, WidgetChip, WidgetFlowMode } from "@/types/chat-agent-types";

type PreviewMessage = { id: string; from: "bot" | "user"; text: string };

let counter = 0;
const uid = () => `p${++counter}`;

const SAMPLE_CALLER = Object.fromEntries(
  GUIDED_FLOW_MERGE_TOKENS.map((token) => [token.token, token.example]),
);

export function GuidedFlowPreview({
  flow,
  agent,
  className,
}: {
  flow: GuidedFlow | null;
  agent: ChatAgent;
  className?: string;
}) {
  const theme = { ...DEFAULT_WIDGET_THEME, ...(agent.theme ?? {}) };
  const [known, setKnown] = useState(false);
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [mode, setMode] = useState<WidgetFlowMode>("guided");
  const [chips, setChips] = useState<WidgetChip[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const values = known ? SAMPLE_CALLER : {};
  const greeting = [
    known ? `Welcome back, ${SAMPLE_CALLER.firstName}!` : "",
    agent.greeting?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Start over whenever the tree's roots change or the caller toggles — a
  // preview mid-branch of a node that no longer exists helps nobody.
  const rootKey = flow ? flow.rootIds.join("|") : "";
  useEffect(() => {
    setMessages(greeting ? [{ id: "greeting", from: "bot", text: greeting }] : []);
    setMode("guided");
    setChips(flow ? guidedChipsFor(flow, flow.rootIds) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootKey, known, flow === null]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chips]);

  function reset() {
    setMessages(greeting ? [{ id: "greeting", from: "bot", text: greeting }] : []);
    setMode("guided");
    setChips(flow ? guidedChipsFor(flow, flow.rootIds) : []);
  }

  function pick(chip: WidgetChip) {
    if (!flow) return;
    const say = (text: string) => setMessages((m) => [...m, { id: uid(), from: "bot", text }]);
    setMessages((m) => [...m, { id: uid(), from: "user", text: chip.label }]);

    switch (chip.id) {
      case "escape_ai":
        say("Sure — ask me anything and I'll do my best to help.");
        setMode("ai");
        setChips([]);
        return;
      case "escape_human":
        say(
          agent.handoffMessage?.trim() ||
            "I've let a counsellor know. Someone will call you shortly.",
        );
        setMode("handoff");
        setChips([]);
        return;
      case "mark_intl_yes":
        if (flow.markIntlYesAck?.trim()) say(interpolateGuidedAnswer(flow.markIntlYesAck, values));
        setChips(guidedChipsFor(flow, flow.rootIds));
        return;
      case "mark_intl_no":
        if (flow.markIntlNoAck?.trim()) say(interpolateGuidedAnswer(flow.markIntlNoAck, values));
        setChips(guidedChipsFor(flow, flow.rootIds));
        return;
      default: {
        const node = flow.nodes[chip.id];
        if (!node) {
          say(`⚠ “${chip.id}” does not exist in this tree.`);
          setChips(guidedChipsFor(flow, flow.rootIds));
          return;
        }
        say(interpolateGuidedAnswer(node.answer, values) || "(empty answer)");
        setChips(guidedChipsFor(flow, node.next));
      }
    }
  }

  const panelRadius = CORNER_RADIUS[theme.corners]?.panel ?? 22;
  const lightPanel = isLightHex(theme.background);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold">Preview</p>
          <p className="truncate text-[11px] text-muted-foreground">
            Client-side simulation — nothing is sent or saved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Known caller
            <Switch size="sm" checked={known} onCheckedChange={setKnown} />
          </label>
          <Button type="button" variant="ghost" size="xs" onClick={reset} title="Start over">
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <div
          className={cn(
            "flex h-full flex-col overflow-hidden",
            lightPanel ? "shadow-elev-2" : "shadow-elev-3",
          )}
          style={{
            background: theme.background,
            color: theme.backgroundText,
            borderRadius: panelRadius,
            border: `1px solid ${theme.border}`,
          }}
        >
          <WidgetHeader
            theme={theme}
            name={agent.name}
            avatarUrl={agent.avatarUrl}
            title={agent.name || "Assistant"}
            subtitle={mode === "handoff" ? "Counsellor requested" : undefined}
          />
          <WidgetMessages theme={theme}>
            {!flow ? (
              <p className="px-2 py-6 text-center text-xs" style={{ color: theme.mutedText }}>
                Switch on the guided flow to try it here.
              </p>
            ) : null}
            {messages.map((m) => (
              <WidgetBubble key={m.id} theme={theme} from={m.from} animate={false}>
                {m.from === "bot" ? <WidgetText text={m.text} /> : m.text}
              </WidgetBubble>
            ))}
            {mode === "guided" && chips.length ? (
              <WidgetChips theme={theme} title="Ask about" chips={chips} onSelect={pick} />
            ) : null}
            {flow && mode === "guided" && !chips.length && messages.length > 1 ? (
              <p className="text-center text-[11px]" style={{ color: theme.mutedText }}>
                Dead end — this node offers no next chips.
              </p>
            ) : null}
            {mode === "ai" ? (
              <p className="text-center text-[11px]" style={{ color: theme.mutedText }}>
                Free-text mode from here — the composer opens and the model answers.
              </p>
            ) : null}
            <div ref={scrollRef} />
          </WidgetMessages>
          {mode === "handoff" ? (
            <WidgetHandoffNotice theme={theme} text="A counsellor will call you shortly." />
          ) : null}
        </div>
      </div>
    </div>
  );
}
