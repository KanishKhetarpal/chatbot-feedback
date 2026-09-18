/**
 * The chat panel itself — used by the share link (`/s/:key`), the in-app chat
 * page (`/chat/:key`) and the embeddable iframe (`/widget/:key`).
 *
 * Boots from `GET /widget/config` for a fresh browser or `POST /widget/session`
 * for a returning one (which also hands back the stored thread and any feedback
 * already left on it), sends turns to `POST /widget/chat`, walks the guided flow
 * through `POST /widget/step`, and records feedback through the two
 * `POST /widget/feedback/*` routes.
 *
 * Three modes when the chatbot has a guided flow: `guided` (chips, zero model
 * cost), `ai` (free text) and `handoff` (they asked for a person).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  LeadCaptureCard,
  TypingDots,
  WidgetBootFigure,
  WidgetBranding,
  WidgetBubble,
  WidgetChips,
  WidgetComposer,
  WidgetDayDivider,
  WidgetHandoffNotice,
  WidgetHeader,
  WidgetHomeBody,
  WidgetHomeHeader,
  WidgetMessages,
  WidgetNav,
  WidgetPanel,
  WidgetPresets,
  WidgetStartCard,
  WidgetText,
  type WidgetChromeVariant,
  type WidgetTab,
} from "@/components/chat-agents/widget/widget-chrome";
import {
  ConversationRating,
  MessageFeedback,
  RateChatButton,
  type MessageRating,
} from "@/components/chat-agents/widget/widget-feedback";
import { DEFAULT_WIDGET_THEME, guidedChipsFor } from "@/lib/chat-agent-constants";
import {
  fetchWidgetConfig,
  hasCaptured,
  loadLocalHistory,
  markCaptured,
  openWidgetSession,
  rateWidgetConversation,
  rateWidgetMessage,
  readVisitorToken,
  saveLocalHistory,
  sendWidgetMessage,
  stepWidgetFlow,
  submitWidgetLead,
  WidgetApiError,
  WIDGET_TOKEN_TTL_SECONDS,
  writeVisitorToken,
  type SendWidgetMessageResult,
} from "@/lib/widget-api";
import type {
  GuidedFlow,
  WidgetAgentPresentation,
  WidgetChip,
  WidgetFlowMode,
  WidgetServerMessage,
  WidgetStoredMessage,
  WidgetTheme,
  WidgetVisitorState,
} from "@/types/chat-agent-types";

type ChatMessage = WidgetStoredMessage;

const RATE_LIMIT_COPY = "Too many messages for now — please try again shortly.";
const HANDOFF_COPY = "Someone from the team will get in touch with you shortly.";

function resolveTheme(raw: Partial<WidgetTheme> | null | undefined): WidgetTheme {
  return { ...DEFAULT_WIDGET_THEME, ...(raw ?? {}) };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
}

function isAuthFailure(err: unknown) {
  return (
    err instanceof WidgetApiError &&
    (err.status === 401 || err.code === "invalid_token" || err.code === "session_expired")
  );
}

/** The server's copy of the thread, in the shape the panel draws. */
function fromServer(messages: WidgetServerMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    serverId: m.id,
    from: m.role === "assistant" ? "bot" : "user",
    text: m.content,
    rating: m.rating ?? null,
    feedbackNote: m.feedbackNote ?? null,
  }));
}

function resumeFlow(flow: GuidedFlow | null, visitor: WidgetVisitorState | null): { mode: WidgetFlowMode; chips: WidgetChip[] } {
  if (!flow) return { mode: "ai", chips: [] };
  if (visitor?.handoffAt) return { mode: "handoff", chips: [] };
  if (visitor?.guidedFlowExitedAt) return { mode: "ai", chips: [] };
  const current = visitor?.currentNodeId ? flow.nodes[visitor.currentNodeId] : null;
  if (current) return { mode: "guided", chips: guidedChipsFor(flow, current.next) };
  return { mode: "guided", chips: guidedChipsFor(flow, flow.rootIds) };
}

export function WidgetChat({
  agentKey,
  className,
  variant = "card",
}: {
  agentKey: string;
  className?: string;
  variant?: WidgetChromeVariant;
}) {
  const [agent, setAgent] = useState<WidgetAgentPresentation | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [captureDone, setCaptureDone] = useState(() => hasCaptured(agentKey));
  const [captureThanks, setCaptureThanks] = useState(false);
  const [tab, setTab] = useState<WidgetTab>("home");

  const [guidedFlow, setGuidedFlow] = useState<GuidedFlow | null>(null);
  const [flowMode, setFlowMode] = useState<WidgetFlowMode>("ai");
  const [chips, setChips] = useState<WidgetChip[]>([]);

  // Conversation-level feedback.
  const [ratingOpen, setRatingOpen] = useState(false);
  const [conversationRating, setConversationRating] = useState<number | null>(null);
  const [conversationComment, setConversationComment] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const tokenExpiresAtRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const theme = resolveTheme(agent?.theme);
  const prefersReducedMotion = usePrefersReducedMotion();
  const animate = theme.animations && !prefersReducedMotion;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chips, streaming, ratingOpen]);

  useEffect(() => {
    if (booting || streaming) return;
    saveLocalHistory(agentKey, messages);
  }, [agentKey, messages, streaming, booting]);

  const ensureSession = useCallback(async () => {
    const stored = readVisitorToken(agentKey);
    const next = await openWidgetSession(agentKey, stored);
    if (next.visitorToken) writeVisitorToken(agentKey, next.visitorToken);
    tokenRef.current = next.visitorToken;
    tokenExpiresAtRef.current = Date.now() + next.expiresIn * 1000;
    setAgent(next.agent);
    return next;
  }, [agentKey]);

  const scheduleRefresh = useCallback(
    (expiresIn: number) => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      const delay = Math.max(5_000, (expiresIn - 60) * 1000);
      refreshTimerRef.current = window.setTimeout(() => {
        void ensureSession().catch(() => {});
      }, delay);
    },
    [ensureSession],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBooting(true);
      setBootError(null);
      try {
        const stored = readVisitorToken(agentKey);
        let presentation: WidgetAgentPresentation;
        let flow: GuidedFlow | null;
        let visitor: WidgetVisitorState | null = null;
        let serverThread: ChatMessage[] = [];

        if (stored) {
          const session = await ensureSession();
          if (cancelled) return;
          scheduleRefresh(session.expiresIn);
          presentation = session.agent;
          flow = session.guidedFlow;
          visitor = session.visitor;
          serverThread = fromServer(session.messages);
          if (session.limited) setComposerError(RATE_LIMIT_COPY);
          if (visitor?.rating) {
            setConversationRating(visitor.rating);
            setConversationComment(visitor.ratingComment ?? null);
          }
          if (visitor?.captured) setCaptureDone(true);
        } else {
          const config = await fetchWidgetConfig(agentKey);
          if (cancelled) return;
          presentation = config.agent;
          flow = config.guidedFlow;
        }

        setAgent(presentation);
        setGuidedFlow(flow);

        const resumed = resumeFlow(flow, visitor);
        setFlowMode(resumed.mode);
        setChips(resumed.chips);

        const firstName = (visitor?.leadDigest?.firstName ?? visitor?.name)?.trim();
        const greeting = [firstName ? `Welcome back, ${firstName}!` : "", presentation.greeting?.trim() ?? ""]
          .filter(Boolean)
          .join(" ");

        // The server's copy wins: it carries the message ids feedback needs.
        // The local copy only covers a browser whose session lapsed.
        const storedHistory = serverThread.length ? serverThread : loadLocalHistory(agentKey);
        if (storedHistory.length) {
          setMessages(storedHistory);
          setTab("messages");
        } else if (greeting) {
          setMessages([{ id: "greeting", from: "bot", text: greeting }]);
        }
      } catch (err) {
        if (cancelled) return;
        setBootError(
          err instanceof WidgetApiError ? err.message : "Could not start the chat. Check the chatbot key and allowed origins.",
        );
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      abortRef.current?.abort();
    };
  }, [agentKey, ensureSession, scheduleRefresh]);

  async function refreshTokenIfNeeded(): Promise<string | null> {
    if (tokenRef.current && Date.now() < tokenExpiresAtRef.current - 30_000) return tokenRef.current;
    const next = await ensureSession();
    scheduleRefresh(next.expiresIn);
    if (next.limited) setComposerError(RATE_LIMIT_COPY);
    return next.visitorToken;
  }

  function adoptToken(issued: string | null) {
    if (!issued) return;
    writeVisitorToken(agentKey, issued);
    tokenRef.current = issued;
    tokenExpiresAtRef.current = Date.now() + WIDGET_TOKEN_TTL_SECONDS * 1000;
  }

  function setBubble(id: string, patch: Partial<ChatMessage>) {
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg)));
  }

  async function streamReply(text: string) {
    setStreaming(true);
    setComposerError(null);
    const botId = uid();
    setMessages((m) => [...m, { id: botId, from: "bot", text: "" }]);

    const appendDelta = (chunk: string) => {
      setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, text: msg.text + chunk } : msg)));
    };
    const failBubble = (message: string) => setBubble(botId, { text: message, failed: true });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let token = await refreshTokenIfNeeded();
      const attempt = (authToken: string | null) =>
        sendWidgetMessage({ token: authToken, agentKey, message: text, signal: controller.signal });

      let sent: SendWidgetMessageResult;
      try {
        sent = await attempt(token);
      } catch (err) {
        if (isAuthFailure(err)) {
          token = null;
          sent = await attempt(null);
        } else {
          throw err;
        }
      }

      adoptToken(sent.issuedToken);
      if (sent.assistantMessageId) setBubble(botId, { serverId: sent.assistantMessageId });

      let sawTerminal = false;
      for await (const frame of sent.frames) {
        if (frame.event === "delta") appendDelta(frame.data.text);
        else if (frame.event === "done") sawTerminal = true;
        else if (frame.event === "error") {
          sawTerminal = true;
          failBubble(frame.data.message);
        }
      }
      if (!sawTerminal) failBubble("Connection dropped before the reply finished. Please try again.");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      failBubble(err instanceof WidgetApiError ? err.message : "Something went wrong sending your message.");
    } finally {
      setStreaming(false);
    }
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? draft).trim();
    if (!text || streaming || booting || !agent) return;
    if (text.length > 4000) {
      setComposerError("Message is too long (max 4000 characters).");
      return;
    }
    setDraft("");
    setComposerError(null);
    setTab("messages");
    setMessages((m) => [...m, { id: uid(), from: "user", text }]);
    await streamReply(text);
  }

  async function pickChip(chip: WidgetChip) {
    if (streaming || booting || !agent || !guidedFlow) return;
    const previousChips = chips;

    setTab("messages");
    setComposerError(null);
    setChips([]);
    setStreaming(true);
    const botId = uid();
    setMessages((m) => [...m, { id: uid(), from: "user", text: chip.label }, { id: botId, from: "bot", text: "" }]);

    try {
      let token = await refreshTokenIfNeeded();
      const attempt = (authToken: string | null) => stepWidgetFlow({ token: authToken, agentKey, nodeId: chip.id });

      let result;
      try {
        result = await attempt(token);
      } catch (err) {
        if (isAuthFailure(err)) {
          token = null;
          result = await attempt(null);
        } else {
          throw err;
        }
      }

      adoptToken(result.visitorToken);

      if (result.answer.trim()) setBubble(botId, { text: result.answer });
      else setMessages((m) => m.filter((msg) => msg.id !== botId));

      setFlowMode(result.mode);
      setChips(result.mode === "guided" ? result.next : []);
    } catch (err) {
      if (err instanceof WidgetApiError && err.code === "rate_limited") {
        setMessages((m) => m.filter((msg) => msg.id !== botId));
        setComposerError(RATE_LIMIT_COPY);
        setChips(previousChips);
      } else if (err instanceof WidgetApiError && (err.code === "guided_flow_unavailable" || err.code === "unknown_node")) {
        setMessages((m) => m.filter((msg) => msg.id !== botId));
        setGuidedFlow(err.code === "guided_flow_unavailable" ? null : guidedFlow);
        setFlowMode("ai");
        setChips([]);
      } else {
        setBubble(botId, {
          text: err instanceof WidgetApiError ? err.message : "Something went wrong. Please try that again.",
          failed: true,
        });
        setChips(previousChips);
      }
    } finally {
      setStreaming(false);
    }
  }

  function showMenu() {
    if (!guidedFlow) return;
    setFlowMode("guided");
    setChips(guidedChipsFor(guidedFlow, guidedFlow.rootIds));
  }

  // ── Feedback ───────────────────────────────────────────────────────────────

  async function rateMessage(message: ChatMessage, rating: MessageRating, note?: string | null) {
    if (!message.serverId || !tokenRef.current) return;
    const previous = { rating: message.rating ?? null, feedbackNote: message.feedbackNote ?? null };
    setBubble(message.id, { rating, feedbackNote: note ?? null });
    try {
      await rateWidgetMessage({ token: tokenRef.current, messageId: message.serverId, rating, note });
    } catch {
      setBubble(message.id, previous);
      throw new Error("rating_failed");
    }
  }

  async function rateConversation(rating: number, comment: string | null) {
    if (!tokenRef.current) throw new Error("no_session");
    await rateWidgetConversation({ token: tokenRef.current, rating, comment });
    setConversationRating(rating);
    setConversationComment(comment);
  }

  if (booting) {
    return (
      <WidgetPanel theme={DEFAULT_WIDGET_THEME} variant={variant} className={className}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4" style={{ background: DEFAULT_WIDGET_THEME.background }}>
          <WidgetBootFigure theme={DEFAULT_WIDGET_THEME} />
          <p className="text-sm" style={{ color: DEFAULT_WIDGET_THEME.mutedText }}>
            Starting chat…
          </p>
        </div>
      </WidgetPanel>
    );
  }

  if (bootError || !agent) {
    return (
      <WidgetPanel theme={DEFAULT_WIDGET_THEME} variant={variant} className={className}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center" style={{ background: DEFAULT_WIDGET_THEME.background }}>
          <p className="text-sm font-medium" style={{ color: DEFAULT_WIDGET_THEME.backgroundText }}>
            Chat unavailable
          </p>
          <p className="max-w-xs text-xs" style={{ color: DEFAULT_WIDGET_THEME.mutedText }}>
            {bootError}
          </p>
          <p className="max-w-xs text-[11px]" style={{ color: DEFAULT_WIDGET_THEME.mutedText }}>
            Ensure the chatbot is active, trained, and this site is allowed to use it.
          </p>
        </div>
      </WidgetPanel>
    );
  }

  const hasFlow = Boolean(guidedFlow);
  const guided = hasFlow && flowMode === "guided";
  const handedOff = hasFlow && flowMode === "handoff";

  const answeredOnce = messages.some((m) => m.from === "bot" && m.id !== "greeting");
  const askedOnce = messages.some((m) => m.from === "user");
  const userTurns = messages.filter((m) => m.from === "user").length;
  const showCapture =
    !captureDone &&
    !streaming &&
    (handedOff ||
      (agent.leadCapture !== "never" &&
        (agent.leadCapture === "before_chat" || (answeredOnce && askedOnce && userTurns >= 2))));

  // The rating card is offered once the chat has some substance, and always
  // reachable from the pill next to the composer.
  const canRate = Boolean(tokenRef.current) && answeredOnce;

  const presets = hasFlow ? [] : (agent.messagePresets ?? []).slice(0, 4);
  const placeholder = agent.inputPlaceholder?.trim() || "Ask a question…";
  const homeHeading = agent.heading?.trim() || "Hey there";
  const homeSubheading = agent.subheading?.trim() || `Got questions? Let's chat with ${agent.name}.`;

  const chipRow =
    guided && chips.length > 0 ? (
      <WidgetChips theme={theme} title="Ask about" chips={chips} disabled={streaming} onSelect={(chip) => void pickChip(chip)} />
    ) : null;

  return (
    <WidgetPanel theme={theme} variant={variant} className={className}>
      {tab === "home" ? (
        <>
          <WidgetHomeHeader theme={theme} heading={homeHeading} subheading={homeSubheading} name={agent.name} avatarUrl={agent.avatarUrl} />
          <WidgetHomeBody theme={theme}>
            <WidgetStartCard theme={theme} name={agent.name} avatarUrl={agent.avatarUrl} onClick={() => setTab("messages")} />
            {guided && chips.length > 0 ? (
              <WidgetChips theme={theme} title="Popular questions" chips={chips} disabled={streaming} onSelect={(chip) => void pickChip(chip)} variant="cards" />
            ) : null}
            {presets.length > 0 ? (
              <WidgetPresets theme={theme} presets={presets} disabled={streaming} onSelect={(preset) => void send(preset)} variant="cards" />
            ) : null}
          </WidgetHomeBody>
        </>
      ) : (
        <>
          <WidgetHeader
            theme={theme}
            name={agent.name}
            avatarUrl={agent.avatarUrl}
            title={agent.name || "Assistant"}
            subtitle={handedOff ? "Handoff requested" : conversationRating ? `You rated this chat ${conversationRating}/5` : undefined}
            onBack={() => setTab("home")}
          />

          <WidgetMessages theme={theme} underHeader>
            <WidgetDayDivider theme={theme} />
            {messages.map((m, i) => {
              const isRateable = m.from === "bot" && Boolean(m.serverId) && !m.failed && m.text.trim();
              return (
                <div key={m.id}>
                  <WidgetBubble
                    theme={theme}
                    from={m.from}
                    failed={m.failed}
                    animate={animate}
                    group={{ first: messages[i - 1]?.from !== m.from, last: messages[i + 1]?.from !== m.from }}
                  >
                    {m.text ? (
                      m.from === "bot" ? (
                        <WidgetText text={m.text} />
                      ) : (
                        m.text
                      )
                    ) : m.from === "bot" ? (
                      <TypingDots color={theme.mutedText} animated={animate} />
                    ) : (
                      ""
                    )}
                  </WidgetBubble>
                  {isRateable ? (
                    <MessageFeedback
                      theme={theme}
                      rating={m.rating ?? null}
                      note={m.feedbackNote}
                      disabled={streaming}
                      onRate={(rating, note) => rateMessage(m, rating, note)}
                    />
                  ) : null}
                </div>
              );
            })}

            {!streaming ? chipRow : null}

            {!askedOnce && presets.length > 0 ? (
              <WidgetPresets theme={theme} presets={presets} disabled={streaming} onSelect={(preset) => void send(preset)} />
            ) : null}

            {captureThanks ? (
              <p className="text-center text-[11px]" style={{ color: theme.mutedText }}>
                Thanks — we have your details.
              </p>
            ) : null}

            {composerError && guided ? <p className="text-center text-[11px] text-red-500">{composerError}</p> : null}

            {canRate && !ratingOpen && !showCapture ? (
              <div className="flex justify-center pt-1">
                <RateChatButton theme={theme} rated={Boolean(conversationRating)} onClick={() => setRatingOpen(true)} />
              </div>
            ) : null}

            <div ref={endRef} />
          </WidgetMessages>

          {ratingOpen ? (
            <ConversationRating
              theme={theme}
              rating={conversationRating}
              comment={conversationComment}
              onSubmit={rateConversation}
              onDismiss={() => setRatingOpen(false)}
              animate={animate}
            />
          ) : showCapture ? (
            <LeadCaptureCard
              theme={theme}
              onSubmit={async (name, phone) => {
                const result = await submitWidgetLead({
                  token: tokenRef.current,
                  agentKey,
                  name,
                  phone,
                  history: messages,
                });
                adoptToken(result.visitorToken);
                markCaptured(agentKey);
                setCaptureDone(true);
                setCaptureThanks(true);
              }}
              onDismiss={() => {
                markCaptured(agentKey);
                setCaptureDone(true);
              }}
              animate={animate}
            />
          ) : handedOff ? (
            <WidgetHandoffNotice theme={theme} text={HANDOFF_COPY} />
          ) : guided ? null : (
            <WidgetComposer
              theme={theme}
              value={draft}
              onChange={setDraft}
              onSend={() => void send()}
              onMenu={hasFlow ? showMenu : undefined}
              placeholder={hasFlow ? "Ask me anything…" : placeholder}
              disabled={streaming}
              error={composerError}
            />
          )}
        </>
      )}

      {tab === "home" ? <WidgetNav theme={theme} active={tab} onChange={setTab} /> : null}
      {theme.showBranding ? <WidgetBranding theme={theme} /> : null}
    </WidgetPanel>
  );
}
