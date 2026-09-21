/**
 * The visitor half of the chat agent — `GET/POST /api/v1/widget/*`.
 *
 * Deliberately **not** built on `@/lib/axios-config`. Every other call in this
 * app is made by a signed-in CRM user, so the shared Axios instance attaches a
 * bearer token, refreshes it, and bounces to `/login` on a 401. None of that
 * applies here: this code runs inside an iframe on the public website, for
 * someone who has no CRM account and never will. Plain `fetch` keeps it that
 * way — a stray interceptor sending a staff token to a public endpoint, or
 * redirecting a prospective student to a staff login, would both be bugs.
 *
 * The server decides whether a given website may embed a given agent, by
 * checking the `Origin` header the browser attaches. Nothing here can or should
 * try to prove where it is running from.
 */

import { API_V1_BASE, Config } from "@/lib/config";
import { getAuthToken } from "@/lib/auth-utils";
import type {
  GuidedFlow,
  WidgetAgentPresentation,
  WidgetChatMessage,
  WidgetConfig,
  WidgetServerMessage,
  WidgetSession,
  WidgetStepResult,
  WidgetStoredMessage,
  WidgetStreamEvent,
  WidgetVisitorState,
} from "@/types/chat-agent-types";

const BASE = API_V1_BASE;

/**
 * Turns kept in this browser.
 *
 * The server builds the prompt from its own rows, so this cap is about what a
 * refresh restores on screen, not what the model is told.
 */
const MAX_HISTORY = 40;

/** Signed tokens are accepted for 30 days; re-session before that. */
export const WIDGET_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export class WidgetApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "WidgetApiError";
  }
}

/* ── Local storage ───────────────────────────────────────────────────────── */
// Namespaced per agent key so two widgets on one site cannot read each other's
// visitor or transcript.

function tokenKey(agentKey: string) {
  return `acharya.widget.visitorToken.${agentKey}`;
}

function historyKey(agentKey: string) {
  return `acharya.widget.history.${agentKey}`;
}

function capturedKey(agentKey: string) {
  return `acharya.widget.captured.${agentKey}`;
}

export function readVisitorToken(agentKey: string): string | undefined {
  try {
    return localStorage.getItem(tokenKey(agentKey)) ?? undefined;
  } catch {
    return undefined; // private mode, or storage disabled
  }
}

export function writeVisitorToken(agentKey: string, token: string) {
  try {
    localStorage.setItem(tokenKey(agentKey), token);
  } catch {
    // Not fatal: the visitor simply gets a new identity next load.
  }
}

/**
 * The transcript from this browser.
 *
 * Anything unreadable is discarded rather than repaired — a half-parsed entry
 * would otherwise sit in the conversation forever.
 */
export function loadLocalHistory(agentKey: string): WidgetStoredMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(agentKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is WidgetStoredMessage =>
        !!m &&
        typeof m === "object" &&
        typeof (m as WidgetStoredMessage).id === "string" &&
        typeof (m as WidgetStoredMessage).text === "string" &&
        ((m as WidgetStoredMessage).from === "user" || (m as WidgetStoredMessage).from === "bot"),
    );
  } catch {
    return [];
  }
}

export function saveLocalHistory(agentKey: string, messages: WidgetStoredMessage[]) {
  try {
    // A failed bubble holds an error string, not something the agent said —
    // restoring it on refresh would show the visitor a stale failure.
    const keep = messages.filter((m) => !m.failed && m.text.trim()).slice(-MAX_HISTORY);
    localStorage.setItem(historyKey(agentKey), JSON.stringify(keep));
  } catch {
    // Quota or private mode — the conversation just will not survive a refresh.
  }
}

export function clearLocalHistory(agentKey: string) {
  try {
    localStorage.removeItem(historyKey(agentKey));
  } catch {
    // ignore
  }
}

/** Has this visitor already given their details? Stops the form asking twice. */
export function hasCaptured(agentKey: string): boolean {
  try {
    return localStorage.getItem(capturedKey(agentKey)) === "1";
  } catch {
    return false;
  }
}

export function markCaptured(agentKey: string) {
  try {
    localStorage.setItem(capturedKey(agentKey), "1");
  } catch {
    // Private mode — the visitor may be asked again on their next visit.
  }
}

/** Transcript → the wire shape, newest turns last. */
function toApiHistory(messages: WidgetStoredMessage[]): WidgetChatMessage[] {
  return messages
    .filter((m) => !m.failed && m.text.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.from === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));
}

/* ── HTTP ────────────────────────────────────────────────────────────────── */

async function parseError(res: Response): Promise<WidgetApiError> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string | { message?: string; code?: string };
  };
  const nested = typeof body.error === "object" ? body.error : null;
  const message =
    nested?.message ??
    (Array.isArray(body.message) ? body.message[0] : body.message) ??
    res.statusText;
  // The API puts its machine-readable code in `error` as a bare string
  // (`origin_not_allowed`, `not_trained`, `invalid_token`, …).
  const code = nested?.code ?? (typeof body.error === "string" ? body.error : undefined);
  return new WidgetApiError(res.status, message, code);
}

/**
 * `Authorization` when the app has a signed-in user, so a conversation held
 * inside the app is attributed to that account. Share-link visitors have no
 * token and the header is simply absent - the routes are public either way.
 */
function widgetHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function assertConfigured() {
  if (!Config.API_URL) throw new WidgetApiError(500, "VITE_API_URL is not configured");
}

/**
 * Fetch the agent's appearance without creating a visitor.
 *
 * This is what the widget boots from: greeting, theme, presets. `/widget/session`
 * is reserved for the first typed message, because opening the panel is not
 * enough to mint a visitor.
 */
export async function fetchWidgetConfig(agentKey: string): Promise<WidgetConfig> {
  assertConfigured();

  const res = await fetch(`${BASE}/widget/config?publicKey=${encodeURIComponent(agentKey)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw await parseError(res);

  const body = (await res.json()) as { agent: WidgetAgentPresentation; guidedFlow?: unknown };
  return { agent: body.agent, guidedFlow: readGuidedFlow(body.guidedFlow) };
}

/**
 * Accept the tree only when it has the two things the widget needs to draw it.
 * A corrupt tree is the server's problem (it falls back to presets and logs);
 * this only guards against an older API that sends nothing at all.
 */
function readGuidedFlow(raw: unknown): GuidedFlow | null {
  if (!raw || typeof raw !== "object") return null;
  const flow = raw as Partial<GuidedFlow>;
  if (!Array.isArray(flow.rootIds) || !flow.nodes || typeof flow.nodes !== "object") return null;
  return {
    rootIds: flow.rootIds,
    nodes: flow.nodes,
    escapeToAiLabel: flow.escapeToAiLabel ?? "",
    escapeToHumanLabel: flow.escapeToHumanLabel ?? "",
    markIntlYesLabel: flow.markIntlYesLabel,
    markIntlNoLabel: flow.markIntlNoLabel,
    markIntlYesAck: flow.markIntlYesAck,
    markIntlNoAck: flow.markIntlNoAck,
  };
}

function readVisitorState(raw: unknown): WidgetVisitorState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<WidgetVisitorState>;
  return {
    id: v.id ?? null,
    currentNodeId: v.currentNodeId ?? null,
    guidedFlowExitedAt: v.guidedFlowExitedAt ?? null,
    handoffAt: v.handoffAt ?? null,
    leadDigest: v.leadDigest ?? null,
    name: v.name ?? null,
    rating: v.rating ?? null,
    ratingComment: v.ratingComment ?? null,
    captured: Boolean(v.captured),
  };
}

function readServerMessages(raw: unknown): WidgetServerMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is WidgetServerMessage =>
      !!m &&
      typeof m === "object" &&
      typeof (m as WidgetServerMessage).id === "string" &&
      typeof (m as WidgetServerMessage).content === "string" &&
      ((m as WidgetServerMessage).role === "user" || (m as WidgetServerMessage).role === "assistant"),
  );
}

/**
 * Fetch the agent's config, and resume a visitor if this browser already has one.
 *
 * Passing the stored token continues the same visitor. An expired or unknown
 * token is not an error — it simply comes back with `visitorToken: null` and the
 * next message starts a fresh visitor, so a bad token is never something the
 * person has to see or act on.
 */
export async function openWidgetSession(
  agentKey: string,
  visitorToken?: string,
): Promise<WidgetSession> {
  assertConfigured();

  const res = await fetch(`${BASE}/widget/session`, {
    method: "POST",
    headers: widgetHeaders(),
    body: JSON.stringify({
      publicKey: agentKey,
      ...(visitorToken ? { visitorToken } : {}),
    }),
  });
  if (!res.ok) throw await parseError(res);

  const body = (await res.json()) as {
    visitorToken: string | null;
    agent: WidgetAgentPresentation;
    guidedFlow?: unknown;
    visitor?: unknown;
    messages?: unknown;
    limited?: boolean;
    retryAt?: string | null;
  };

  return {
    visitorToken: body.visitorToken ?? null,
    expiresIn: WIDGET_TOKEN_TTL_SECONDS,
    agent: body.agent,
    guidedFlow: readGuidedFlow(body.guidedFlow),
    visitor: readVisitorState(body.visitor),
    messages: readServerMessages(body.messages),
    limited: Boolean(body.limited),
    retryAt: body.retryAt ?? null,
  };
}

/**
 * The three things only the browser can see.
 *
 * `document.referrer` inside an iframe is the embedding page, which is what makes
 * `pageUrl` knowable at all — the widget's own URL is ours, not the university's
 * marketing site. Every one of these is best-effort: a locked-down browser may
 * report none of it, and the visitor can still chat perfectly well.
 */
function readBrowserContext(): { timezone?: string; pageUrl?: string; referrer?: string } {
  const out: { timezone?: string; pageUrl?: string; referrer?: string } = {};
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) out.timezone = zone;
  } catch {
    // Intl unavailable — not worth a second thought.
  }
  try {
    // In an iframe this is the page the widget is embedded on.
    if (document.referrer) out.pageUrl = document.referrer;
    // What sent them to that page, when the parent chose to share it.
    const ancestor = document.location.ancestorOrigins?.[0];
    if (ancestor && ancestor !== document.referrer) out.referrer = ancestor;
  } catch {
    // Cross-origin restrictions — expected, and nothing depends on it.
  }
  return out;
}

export type SubmitWidgetLeadResult = {
  ok: boolean;
  /** A new CRM Lead was created from these details. */
  leadCreated: boolean;
  /** The phone or email matched an existing Lead; this visitor is now attached to it. */
  deduped: boolean;
};

/**
 * Send the details a visitor volunteered.
 *
 * Creates (or attaches to) a CRM Lead. A failure here is still not worth
 * interrupting the conversation over — the caller shows a message and lets
 * them carry on chatting.
 */
export async function submitWidgetLead(input: {
  token: string | null;
  agentKey: string;
  name: string;
  phone?: string;
  email?: string;
  history: WidgetStoredMessage[];
}): Promise<SubmitWidgetLeadResult & { visitorToken: string | null }> {
  assertConfigured();

  const res = await fetch(`${BASE}/widget/lead`, {
    method: "POST",
    headers: widgetHeaders(),
    body: JSON.stringify({
      ...(input.token ? { visitorToken: input.token } : { publicKey: input.agentKey, ...readBrowserContext() }),
      name: input.name.trim(),
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      history: toApiHistory(input.history),
    }),
  });
  if (!res.ok) throw await parseError(res);

  const body = (await res.json().catch(() => ({}))) as Partial<SubmitWidgetLeadResult> & {
    visitorToken?: string | null;
  };
  return {
    ok: body.ok !== false,
    leadCreated: Boolean(body.leadCreated),
    deduped: Boolean(body.deduped),
    visitorToken: body.visitorToken ?? null,
  };
}

/* -- Feedback ------------------------------------------------------------- */

/** Thumbs up / down on one reply. `rating: null` clears it. */
export async function rateWidgetMessage(input: {
  token: string;
  messageId: string;
  rating: "up" | "down" | null;
  note?: string | null;
  /** Why (one of FEEDBACK_REASONS). Omit to keep the stored reason; null clears it. */
  reason?: string | null;
}): Promise<void> {
  assertConfigured();
  const res = await fetch(`${BASE}/widget/feedback/message`, {
    method: "POST",
    headers: widgetHeaders(),
    body: JSON.stringify({
      visitorToken: input.token,
      messageId: input.messageId,
      rating: input.rating,
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    }),
  });
  if (!res.ok) throw await parseError(res);
}

/** A 1-5 star rating and comment on the whole conversation. */
export async function rateWidgetConversation(input: {
  token: string;
  rating: number;
  comment?: string | null;
}): Promise<void> {
  assertConfigured();
  const res = await fetch(`${BASE}/widget/feedback/conversation`, {
    method: "POST",
    headers: widgetHeaders(),
    body: JSON.stringify({ visitorToken: input.token, rating: input.rating, comment: input.comment ?? null }),
  });
  if (!res.ok) throw await parseError(res);
}

/**
 * A chip click — `POST /widget/step`.
 *
 * Resolved entirely server-side from the saved tree, so it costs no model call
 * and the widget never has to know what a chip means: it sends the id and
 * renders whatever comes back. Like `/widget/chat`, the first call from a fresh
 * browser mints the visitor and returns a token the caller must persist.
 */
export async function stepWidgetFlow(input: {
  token: string | null;
  agentKey: string;
  nodeId: string;
}): Promise<WidgetStepResult> {
  assertConfigured();

  const res = await fetch(`${BASE}/widget/step`, {
    method: "POST",
    headers: widgetHeaders(),
    body: JSON.stringify(
      input.token
        ? { visitorToken: input.token, nodeId: input.nodeId }
        : { publicKey: input.agentKey, nodeId: input.nodeId, ...readBrowserContext() },
    ),
  });
  if (!res.ok) throw await parseError(res);

  const body = (await res.json()) as Partial<WidgetStepResult>;
  return {
    mode: body.mode === "ai" || body.mode === "handoff" ? body.mode : "guided",
    answer: typeof body.answer === "string" ? body.answer : "",
    next: Array.isArray(body.next)
      ? body.next.filter((c) => c && typeof c.id === "string" && typeof c.label === "string")
      : [],
    currentNodeId: body.currentNodeId ?? null,
    callbackTaskCreated: Boolean(body.callbackTaskCreated),
    visitorToken: body.visitorToken ?? null,
  };
}

export type SendWidgetMessageInput = {
  /** Null on the very first message — `agentKey` identifies the agent instead. */
  token: string | null;
  agentKey: string;
  message: string;
  signal?: AbortSignal;
};

export type SendWidgetMessageResult = {
  frames: AsyncGenerator<WidgetStreamEvent>;
  /**
   * Set only on the turn that created the visitor. Must be persisted — without
   * it the next message starts another visitor and the thread splits in two.
   */
  issuedToken: string | null;
  /** The stored id of the reply, so a thumbs vote can be attached to it. */
  assistantMessageId: string | null;
  /** A second bot message the server added after the reply (the details form). */
  followup: { id: string; content: string } | null;
};

/**
 * Send a turn and adapt the reply into the frames the UI reads.
 *
 * The endpoint answers with a single JSON body, so this yields one `delta`
 * carrying the whole reply and then `done`. The UI is written against a stream
 * because that is where this is going; when the server starts streaming, this
 * function is the only thing that has to change.
 *
 * A rate-limited turn is **not** an error: the API returns 200 with the agent's
 * handoff message, which is the reply the visitor should see. It arrives as an
 * ordinary delta on purpose.
 */
export async function sendWidgetMessage(
  input: SendWidgetMessageInput,
): Promise<SendWidgetMessageResult> {
  assertConfigured();

  const init: RequestInit = {
    method: "POST",
    headers: widgetHeaders(),
    // Token when we have one, public key when we do not. No `history`: the
    // server stores the conversation and builds the prompt from its own rows,
    // so sending ours would be both redundant and a way to rewrite what was
    // said. The environment fields ride along only on the first message, where
    // they are read once and stored with the new visitor — address, browser and
    // language are taken from the request headers server-side, because a
    // browser cannot know its own IP and anything it claims about itself can be
    // edited before it is sent.
    body: JSON.stringify(
      input.token
        ? { visitorToken: input.token, message: input.message }
        : { publicKey: input.agentKey, message: input.message, ...readBrowserContext() },
    ),
  };
  if (input.signal) init.signal = input.signal;

  const res = await fetch(`${BASE}/widget/chat`, init);
  if (!res.ok) throw await parseError(res);

  const body = (await res.json()) as {
    reply?: string;
    limited?: boolean;
    visitorToken?: string | null;
    assistantMessageId?: string | null;
    followup?: { id: string; content: string } | null;
  };

  async function* frames(): AsyncGenerator<WidgetStreamEvent> {
    const reply = typeof body.reply === "string" ? body.reply : "";
    if (!reply) {
      yield { event: "error", data: { message: "The assistant returned an empty reply." } };
      return;
    }
    yield { event: "delta", data: { text: reply } };
    yield { event: "done", data: {} };
  }

  return {
    frames: frames(),
    issuedToken: body.visitorToken ?? null,
    assistantMessageId: body.assistantMessageId ?? null,
    followup: body.followup?.content ? body.followup : null,
  };
}

/** Window event (detail = agent key) that tells an open widget to start a new chat. */
export const WIDGET_RESET_EVENT = "widget:new-chat";

/** Ask the open widget for this bot to start over from fresh. */
export function requestNewWidgetChat(agentKey: string) {
  window.dispatchEvent(new CustomEvent(WIDGET_RESET_EVENT, { detail: agentKey }));
}

/** Forget this browser's conversation with a bot: the next message starts a new thread. */
export function forgetWidgetConversation(agentKey: string) {
  try {
    localStorage.removeItem(tokenKey(agentKey));
    localStorage.removeItem(historyKey(agentKey));
    localStorage.removeItem(capturedKey(agentKey));
  } catch {
    // ignore
  }
}

/**
 * Ask the bot to follow up with a visitor who has gone quiet. Returns null when
 * the server declines (not right after a bot turn, already nudged, or the
 * conversation's nudge allowance is used up) — that is normal, not an error.
 */
export async function requestWidgetNudge(input: {
  token: string;
}): Promise<{ reply: string; assistantMessageId: string | null } | null> {
  assertConfigured();
  const res = await fetch(`${BASE}/widget/chat`, {
    method: "POST",
    headers: widgetHeaders(),
    body: JSON.stringify({ visitorToken: input.token, message: "(follow-up)", nudge: true }),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { reply?: string | null; assistantMessageId?: string | null };
  return typeof body.reply === "string" && body.reply.trim()
    ? { reply: body.reply, assistantMessageId: body.assistantMessageId ?? null }
    : null;
}
