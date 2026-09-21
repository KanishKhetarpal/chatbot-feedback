/**
 * AI chat agents — the widget that answers admissions questions on the public
 * site, its knowledge, and the conversations it has held.
 *
 * Mirrors the backend `chat-agents` module (`/api/v1/chat-agents`,
 * `/api/v1/knowledge`, `/api/v1/widget-inbox`). Field names and defaults must
 * track it exactly; the API resolves and validates everything server-side and
 * always answers with complete objects.
 *
 * Not to be confused with `Agent` in `use-get-agents.ts` — that is a *field*
 * agent (a person with UTM links). These are software.
 */

/* ── Widget theme ────────────────────────────────────────────────────────── */

export type CornerStyle = "rounded" | "soft" | "square";
export type LauncherPosition = "right" | "left";

/**
 * How the widget looks on the customer's site.
 *
 * There is no light/dark mode here on purpose: a widget is not a site, it does
 * not follow the visitor's system preference, it looks the way its owner chose.
 * Picking a look is done through the presets in `chat-agent-constants.ts`,
 * which only fill in the seven colours.
 */
export type WidgetTheme = {
  primary: string;
  primaryText: string;
  background: string;
  backgroundText: string;
  muted: string;
  mutedText: string;
  border: string;
  corners: CornerStyle;
  launcherPosition: LauncherPosition;
  launcherSize: number;
  animations: boolean;
  showBranding: boolean;
};

/** The seven colours a preset sets. Layout and behaviour are not a preset's business. */
export type ThemePalette = Pick<
  WidgetTheme,
  "primary" | "primaryText" | "background" | "backgroundText" | "muted" | "mutedText" | "border"
>;

/* ── The agent ───────────────────────────────────────────────────────────── */

export type ChatAgentTone = "professional" | "friendly" | "casual" | "formal" | "empathetic";
export type ChatAgentResponseLength = "concise" | "balanced" | "detailed";
export type ChatAgentKnowledgeMode = "strict" | "blended";
export type ChatAgentLeadCapture = "never" | "before_chat" | "after_first_reply";
export type ChatAgentLeadField = "phone" | "name" | "email";
export type ChatAgentEffort = "low" | "medium" | "high";
export type ChatAgentStatus = "draft" | "active" | "paused";

export type ChatAgent = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  status: ChatAgentStatus;
  publicKey: string;

  avatarUrl: string | null;
  heading: string | null;
  subheading: string | null;
  greeting: string | null;
  messagePresets: string[];
  inputPlaceholder: string | null;

  tone: ChatAgentTone;
  responseLength: ChatAgentResponseLength;
  language: string;
  useEmoji: boolean;
  knowledgeMode: ChatAgentKnowledgeMode;
  fallbackMessage: string | null;
  restrictedTopics: string[];

  handoffTriggers: string[];
  handoffMessage: string | null;
  handoffOnFallback: number;

  leadCapture: ChatAgentLeadCapture;
  leadFields: ChatAgentLeadField[];
  /**
   * Counsellor persona: answer the question AND ask one qualifying question per
   * reply (mobile → name → course → year → level → city). Off = pure Q&A.
   * Defaults to true server-side.
   */
  qualificationEnabled: boolean;
  /**
   * The chip decision tree, or null when the agent runs on `messagePresets`
   * alone. Saved through its own endpoint (`PUT /chat-agents/:id/guided-flow`),
   * never through PATCH — see `useSaveGuidedFlow`.
   */
  guidedFlow: GuidedFlow | null;

  model: string;
  effort: ChatAgentEffort;
  maxTokens: number;

  allowedOrigins: string[];
  theme: WidgetTheme;

  knowledgeSources?: { id: string; name: string; status: string }[];

  createdAt: string;
  updatedAt: string;
};

export type ChatAgentModelOption = {
  id: string;
  tier: string;
  label: string;
  /**
   * Name of the model behind this tier, e.g. "Claude Sonnet 5". Display only —
   * `id` is the identifier. Optional because an older API build does not send
   * it, and a missing name should cost the label rather than the whole row.
   */
  modelName?: string;
  description: string;
  contextWindow: number;
};

export type ChatAgentOptions = {
  models: ChatAgentModelOption[];
  effortLevels: { value: ChatAgentEffort; label: string }[];
  tones: ChatAgentTone[];
  responseLengths: ChatAgentResponseLength[];
  knowledgeModes: ChatAgentKnowledgeMode[];
  leadCaptureModes: ChatAgentLeadCapture[];
  leadFields: ChatAgentLeadField[];
};

export type CreateChatAgentInput = { name: string; description?: string | null };

export type PatchChatAgentInput = Partial<
  Omit<
    ChatAgent,
    "id" | "publicKey" | "createdAt" | "updatedAt" | "knowledgeSources" | "guidedFlow"
  >
>;

/* ── Guided flow ─────────────────────────────────────────────────────────── */

/**
 * The four chips the server understands without a node behind them.
 *
 * They may appear in any node's `next[]` (and in `rootIds`) but are never
 * authored as regular nodes: `escape_ai` flips the visitor into free-text mode,
 * `escape_human` fires a handoff (and a callback Task when a Lead is linked),
 * and the two `mark_intl_*` chips record where the visitor is from and return
 * them to the root chips. Their labels live on the tree, not on a node.
 */
export type GuidedFlowReservedId = "escape_ai" | "escape_human" | "mark_intl_yes" | "mark_intl_no";

export type GuidedFlowNode = {
  /** Lowercase slug, `/^[a-z0-9][a-z0-9_-]{0,63}$/`. Never a reserved id. */
  id: string;
  /** Chip text, ≤ 80 chars. */
  label: string;
  /** Rendered as the bot bubble when the chip is clicked. ≤ 2000 chars; supports `{{merge|fallback}}` tokens. */
  answer: string;
  /** Up to 6 chips shown after the answer — node ids or reserved ids. */
  next: string[];
};

/**
 * An admin-authored decision tree the widget walks without touching a model.
 *
 * Reserved-chip labels sit at the tree level because the same "Talk to a
 * counsellor" chip is offered from many nodes and must read the same everywhere.
 * The `markIntl*` fields are optional — only a tree that actually uses those
 * chips needs them.
 */
export type GuidedFlow = {
  /** 1–8 ids shown on the home screen. */
  rootIds: string[];
  escapeToAiLabel: string;
  escapeToHumanLabel: string;
  markIntlYesLabel?: string;
  markIntlNoLabel?: string;
  /** Bot bubble after `mark_intl_yes`, before the root chips come back. */
  markIntlYesAck?: string;
  markIntlNoAck?: string;
  /** ≤ 100 entries, keyed by `node.id`. */
  nodes: Record<string, GuidedFlowNode>;
  /** Purely rule-based: the AI is never called, the visitor never types. */
  noAi?: boolean;
};

/** One problem with a tree — from the client validator or the server's 400. */
export type GuidedFlowIssue = {
  code: string;
  message: string;
  /** Which node (or `a → b` edge) the problem sits on, when it has a location. */
  where?: string;
};

export type SaveGuidedFlowResult = {
  agentId: string;
  guidedFlow: GuidedFlow | null;
  cleared: boolean;
};

/**
 * What went with an agent when it was deleted.
 *
 * Reported rather than assumed: "deleted the agent" understates what happened
 * when the same call took 12 knowledge sources and 400 visitor conversations
 * with it, and the counts are the only honest way to say so afterwards.
 */
export type DeleteChatAgentResult = {
  id: string;
  name: string;
  deleted: {
    knowledgeSources: number;
    knowledgeChunks: number;
    knowledgePacks: number;
    visitors: number;
    messages: number;
  };
};

export type TestChatAgentMessage = { role: "user" | "assistant"; content: string };

export type TestChatAgentInput = {
  message: string;
  history?: TestChatAgentMessage[];
};

/**
 * A staff trial of an agent.
 *
 * Runs the same knowledge pack, prompt and model as the live widget, but works
 * on draft and paused agents, needs no allowed origin, and does not touch the
 * widget rate limits — so testing can never push a live agent into cooldown.
 */
export type TestChatAgentResult = {
  reply: string;
  agent: {
    id: string;
    name: string;
    status: string;
    model: string;
    effort: string | null;
    knowledgeMode: string;
  };
  pack: { version: number; tokenCount: number; builtAt: string };
  /** Whether the pack that just answered is already out of date. */
  training: { needed: boolean; added: number; removed: number; changed: number };
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  latencyMs: number;
};

/**
 * How far the compiled pack has drifted from what the author has written.
 *
 * Three counts rather than one total because "12 added, 1 removed" says what
 * happened and "13 changes" does not. `removed` covers both deleting a source
 * and switching one off — either way the live pack still teaches it.
 */
export type TrainingState = {
  hasPack: boolean;
  needed: boolean;
  added: number;
  removed: number;
  changed: number;
  staleCount: number;
  lastTrainedAt: string | null;
  pack: {
    version: number;
    tokenCount: number;
    sourceCount: number;
    model: string;
    builtAt: string;
  } | null;
};

/** What a completed compile reports back. */
export type TrainChatAgentResult = {
  pack: {
    version: number;
    /** Tokens sent on every message. The number that carries a recurring cost. */
    tokenCount: number;
    sourceCount: number;
    model: string;
    builtAt: string;
  };
  training: TrainingState;
};

/* ── Knowledge ───────────────────────────────────────────────────────────── */

/**
 * The CRM supports `text` and `file` only. The backend can store other kinds
 * (website, qa, integration) and older rows may still carry them, so the union
 * keeps them readable — nothing in this UI creates one.
 */
export type KnowledgeSourceType = "text" | "file" | "website" | "qa" | "integration";
export type KnowledgeSourceStatus = "pending" | "processing" | "ready" | "failed";

export type KnowledgeSource = {
  id: string;
  name: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  error: string | null;

  /** The checkbox — use this when answering. */
  enabled: boolean;

  /**
   * What this source is, in the author's words. Sent to the model above the
   * content itself — for an uploaded table it is the only thing that says what
   * the columns mean, which is why upload requires it and text does not.
   */
  description: string | null;
  /** Original upload name. Null for text sources. */
  fileName: string | null;
  /** Data rows extracted from a tabular file, excluding headers. */
  rowCount: number | null;
  sheetCount: number | null;

  chunkCount: number;
  /** Extracted text size — what the quota counts. */
  contentBytes: number;
  fileBytes: number | null;
  mimeType: string | null;

  contentHash: string | null;
  embeddedHash: string | null;
  embeddedAt: string | null;
  /** Ingested, but the current text was never compiled into a pack. */
  untrained: boolean;

  lastSynced: string | null;
  createdAt: string;
  updatedAt: string;

  /** Present on the detail GET only — list responses omit body fields. */
  content?: string | null;
  extractedText?: string | null;
};

/**
 * `GET /knowledge/:id/file` — a presigned S3 link, not the bytes.
 *
 * `url` is a plain GET valid for `expiresIn` seconds, carrying
 * `Content-Disposition: attachment` with the original name.
 */
export type KnowledgeFileDownload = {
  url: string;
  /** TTL in seconds (15 min). Refetch rather than reusing a stale link. */
  expiresIn: number;
  /** Original uploaded name, as the browser will save it. */
  fileName: string;
};

/**
 * Per-upload facts, returned once beside the created source.
 *
 * Deliberately not stored on the row: these describe *this upload*, and the
 * author is deciding right now whether to keep it. A skipped sheet or a dropped
 * column is only visible here.
 */
export type KnowledgeUploadReport = {
  rowCount: number;
  sheetCount: number;
  sheets: { name: string; rowCount: number; columns: string[] }[];
  chunkCount: number;
  tokenCount: number;
  tokenLimit: number;
  truncated: boolean;
  truncationReason: string | null;
  /** False when the original was not written to object storage — it will not be downloadable later. */
  durableStorage: boolean;
};

export type KnowledgeSummary = {
  byType: Record<
    KnowledgeSourceType,
    { count: number; enabledCount: number; contentBytes: number }
  >;
  enabled: { count: number; contentBytes: number };
  total: { count: number; contentBytes: number };
  quota: { usedBytes: number; limitBytes: number; plan: "free" | "pro" | "business" };
  training: TrainingState;
};

export type CreateKnowledgeTextInput = {
  type: "text";
  agentId: string;
  name: string;
  content: string;
  description?: string;
};

export type UploadKnowledgeFileInput = {
  agentId: string;
  file: File;
  name?: string;
  description: string;
};

export type PatchKnowledgeSourceInput = {
  enabled?: boolean;
  name?: string;
  content?: string;
  /** Spreadsheet context. Not used for text snippets. */
  description?: string;
};

/* ── Inbox ───────────────────────────────────────────────────────────────── */

/**
 * Widget conversations, as staff read them.
 *
 * **Read-only.** The agent answers; staff observe. There is no reply endpoint,
 * and the UI must not offer a control that implies otherwise.
 *
 * The unit is a *visitor*, not a conversation: the backend keeps one continuous
 * thread per visitor, because an applicant decides over days and that whole arc
 * is one conversation.
 */
export type InboxRole = "user" | "assistant";

export type InboxUser = { id: string; name: string; email: string };
export type InboxReviewStatus = "pending" | "reviewed" | "flagged";

export type InboxThread = {
  visitorId: string;
  agent: { id: string; name: string; avatarUrl?: string | null };
  /** The signed-in tester, when the chat happened inside the app. */
  user: InboxUser | null;
  name: string | null;
  email: string | null;
  /** True when a mobile number was captured (form or conversation). */
  hasPhone: boolean;
  deviceType: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  messageCount: number;
  rating: number | null;
  ratingComment: string | null;
  reviewStatus: InboxReviewStatus;
  thumbs: { up: number; down: number };
  lastMessage: { role: InboxRole; preview: string; at: string } | null;
};

export type InboxThreadPage = {
  /** Null when the list is not filtered to one agent. */
  agent: { id: string; name: string } | null;
  threads: InboxThread[];
  nextCursor: string | null;
};

export type InboxMessage = {
  id: string;
  role: InboxRole;
  content: string;
  createdAt: string;
  /** Assistant rows only — null on a visitor's own message. */
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  latencyMs: number | null;
  packVersion: number | null;
  chipNodeId?: string | null;
  rating: "up" | "down" | null;
  feedbackNote: string | null;
  feedbackReason: string | null;
  ratedAt: string | null;
};

/** What the visitor told the agent. Null until they mention it. */
export type InboxCollected = {
  name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  courseInterest: string | null;
};

/**
 * Facts a background extraction job read out of the visitor's own messages
 * (never off the request). Any subset may be present; a missing key means the
 * visitor has not mentioned it yet. Kept apart from `collected` because these
 * were inferred by a model rather than typed into a form.
 */
export type InboxExtracted = {
  dob?: string | null;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  languagePreference?: string | null;
  courseCoreName?: string | null;
  courseAcademicYearName?: string | null;
  educationCompleted?: string | null;
  grade12Stream?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  requiresHostel?: boolean | null;
  interestedInScholarship?: boolean | null;
  hasLocalGuardian?: boolean | null;
} & Record<string, string | number | boolean | null | undefined>;

/**
 * What was read off the request when the visitor was created.
 *
 * Kept apart from `collected` on purpose: a city the visitor typed and a city
 * inferred from their connection are different claims, and a panel that mixed
 * them would invite staff to trust the weaker one.
 */
export type InboxContext = {
  ipAddress: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  timezone: string | null;
  language: string | null;
  pageUrl: string | null;
  referrer: string | null;
};

/**
 * A curated CRM snapshot of the Lead this visitor resolved to.
 *
 * Refreshed server-side on every session open, so it reflects the CRM as of the
 * visitor's last visit rather than the moment the Lead was linked. Deliberately
 * excludes phone, email and anything else the persona must not repeat back.
 */
export type InboxLeadDigest = {
  firstName: string | null;
  courseInterest?: string | null;
  courseCoreName?: string | null;
  courseProgramName?: string | null;
  courseSpecializationName?: string | null;
  courseAcademicYearName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  hasApplication: boolean;
  applicationStatus: string | null;
  loadedAt?: string | null;
};

/**
 * Where the visitor is in the guided flow. All three are null for a visitor who
 * has only ever typed — the tree is optional and most agents will not have one.
 */
export type InboxVisitorFlowState = {
  /** Last chip they clicked; the widget resumes here on the next open. */
  currentNodeId?: string | null;
  /** When they took the "ask me something else" chip into free-text mode. */
  guidedFlowExitedAt?: string | null;
  /** When they asked for a counsellor. Silent extraction stops from here. */
  handoffAt?: string | null;
};

export type InboxThreadDetail = {
  visitor: {
    id: string;
    firstSeenAt: string;
    lastSeenAt: string;
    currentNodeId: string | null;
    guidedFlowExitedAt: string | null;
    handoffAt: string | null;
    user: InboxUser | null;
    custom?: InboxExtracted | null;
  };
  collected: InboxCollected;
  custom?: InboxExtracted | null;
  feedback: { rating: number | null; ratingComment: string | null; ratedAt: string | null };
  review: {
    status: InboxReviewStatus;
    note: string | null;
    reviewedAt: string | null;
    reviewedBy: { id: string; name: string } | null;
  };
  context: InboxContext;
  agent: { id: string; name: string; avatarUrl?: string | null; model?: string | null };
  messages: InboxMessage[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    thumbsUp: number;
    thumbsDown: number;
  };
};

export type InboxStats = {
  conversations: number;
  withMessages: number;
  rated: number;
  averageRating: number | null;
  thumbsUp: number;
  thumbsDown: number;
  reviewStatus: Partial<Record<InboxReviewStatus, number>>;
  perAgent: {
    agent: { id: string; name: string; status: string };
    conversations: number;
    averageRating: number | null;
  }[];
};


/* ── The public widget (visitor-facing) ──────────────────────────────────── */

/**
 * What `/widget/*` serves to a member of the public.
 *
 * These are the only chat-agent types read outside the CRM's own walls: the
 * `/widget/$agentKey` route renders inside an iframe on the university's public
 * website, where there is no login, no Axios instance and no CRM user. Nothing
 * here may reference an authenticated shape.
 */

/** Chrome the widget renders itself. None of this reaches the model. */
export type WidgetAgentPresentation = {
  name: string;
  avatarUrl: string | null;
  heading: string | null;
  subheading: string | null;
  greeting: string | null;
  messagePresets: string[];
  inputPlaceholder: string | null;
  leadCapture: ChatAgentLeadCapture;
  leadFields: ChatAgentLeadField[];
  theme: WidgetTheme;
};

/**
 * What `POST /widget/session` gives back.
 *
 * `visitorToken` is an opaque signed string, not a raw id — the server holds the
 * visitor's real identifier inside it and signs the whole thing, so the browser
 * can hand it back but cannot alter it (notably, cannot point it at a different
 * agent). Treat it as a bearer value: store it, send it, never parse it.
 */
/** A chip as the widget draws it — an id to send back and a label to show. */
export type WidgetChip = { id: string; label: string };

/** What the widget is doing right now: walking the tree, chatting with the model, or waiting for a person. */
export type WidgetFlowMode = "guided" | "ai" | "handoff";

/**
 * The visitor's state, as `POST /widget/session` returns it. Null for a browser
 * the server has never seen. Only the first name of the digest reaches the
 * widget — everything else about a known caller is for the model to weave into
 * replies, never for the chrome to display.
 */
export type WidgetVisitorState = {
  id?: string | null;
  currentNodeId: string | null;
  guidedFlowExitedAt: string | null;
  handoffAt: string | null;
  leadDigest: { firstName?: string | null } | null;
  /** First name of the person chatting, when known (a signed-in tester or a captured name). */
  name?: string | null;
  /** The 1-5 rating already left on this conversation, if any. */
  rating?: number | null;
  ratingComment?: string | null;
  /** Whether contact details have already been captured for this visitor. */
  captured?: boolean;
};

/** A stored turn as `POST /widget/session` returns it, so the widget can redraw the thread and its feedback. */
export type WidgetServerMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chipNodeId: string | null;
  rating: "up" | "down" | null;
  feedbackNote: string | null;
  feedbackReason: string | null;
  createdAt: string;
};

/** `POST /widget/step` — a chip click, resolved server-side at zero model cost. */
export type WidgetStepResult = {
  mode: WidgetFlowMode;
  /** Already interpolated; safe to render as-is. */
  answer: string;
  next: WidgetChip[];
  currentNodeId: string | null;
  /** True only for `escape_human` on a visitor with a linked Lead. */
  callbackTaskCreated: boolean;
  /** Non-null only on the turn that created the visitor. */
  visitorToken: string | null;
};

/** `GET /widget/config` — appearance plus the tree, no visitor state. */
export type WidgetConfig = {
  agent: WidgetAgentPresentation;
  guidedFlow: GuidedFlow | null;
};

export type WidgetSession = {
  /**
   * Null until the visitor has actually typed.
   *
   * Opening the widget does not create a visitor server-side — most people open
   * it and close it, and an unauthenticated endpoint that created a row per
   * curious click could also be looped to reset the per-visitor message budget.
   * The token arrives on the response to the first message instead.
   */
  visitorToken: string | null;
  /** Seconds until the token stops being accepted. The widget re-sessions before then. */
  expiresIn: number;
  agent: WidgetAgentPresentation;
  guidedFlow: GuidedFlow | null;
  /** Null for first-time visitors and for older API builds. */
  visitor: WidgetVisitorState | null;
  /** The stored thread, oldest first. Empty for a browser the server has never seen. */
  messages: WidgetServerMessage[];
  /** True when a rate limit is already in force, so the composer can open disabled. */
  limited: boolean;
  retryAt: string | null;
};

/** One turn, in the shape the API expects it back. */
export type WidgetChatMessage = { role: "user" | "assistant"; content: string };

/**
 * The transcript, kept in this browser.
 *
 * The conversation itself lives server-side (that is what the inbox reads), but
 * the visitor's own copy is what survives a refresh in their tab — so it is as
 * durable as their site data and no more. Clearing it starts a genuinely new
 * conversation on screen.
 */
export type WidgetStoredMessage = {
  id: string;
  from: "user" | "bot";
  text: string;
  failed?: boolean;
  /** The server-side message id, once known - what a thumbs vote is attached to. */
  serverId?: string | null;
  rating?: "up" | "down" | null;
  feedbackNote?: string | null;
  feedbackReason?: string | null;
};

/**
 * Frames the chat UI consumes.
 *
 * The API replies with one JSON body today, so `sendWidgetMessage` adapts it
 * into exactly one `delta` followed by `done`. Keeping the UI on a stream shape
 * means that when the server does start streaming for real, only the adapter
 * changes.
 */
export type WidgetStreamEvent =
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: Record<string, never> }
  | { event: "error"; data: { message: string } };

// ── Feedback patterns (GET /widget-inbox/feedback) ─────────────────────────

export type FeedbackTally = { likes: number; dislikes: number; notes: number };

export type FeedbackItem = {
  messageId: string;
  visitorId: string;
  agent: { id: string; name: string; status: string; avatarUrl: string | null; model: string | null };
  user: { id: string; name: string; isGuest: boolean } | null;
  visitorName: string | null;
  question: string | null;
  reply: string;
  model: string | null;
  rating: "up" | "down" | null;
  reason: string | null;
  note: string | null;
  ratedAt: string | null;
  createdAt: string;
  conversationStars: number | null;
};

export type LeadCaptureRow = {
  agent: FeedbackItem["agent"];
  /** Conversations in range with at least one visitor message. */
  conversations: number;
  withName: number;
  withPhone: number;
  /** withPhone ÷ conversations. */
  captureRate: number | null;
  /** Visitor messages sent before the one that contained the number, averaged. Null when none captured in chat. */
  avgTurnsToPhone: number | null;
  /** Replies liked with a lead-capture reason ("convincing", "natural ask", "good offer"). */
  convincingLikes: number;
  /** Replies disliked with a lead-capture reason ("pushy", "too early", "scripted"). */
  pushyDislikes: number;
};

export type FeedbackPatterns = {
  range: { from: string; to: string; days: number };
  /** Which chatbot actually gets the number - the sales test's headline table. */
  leads: LeadCaptureRow[];
  totals: FeedbackTally & {
    likeRate: number | null;
    replies: number;
    ratedShare: number | null;
    conversationsRated: number;
    averageStars: number | null;
  };
  byAgent: (FeedbackTally & {
    agent: FeedbackItem["agent"];
    likeRate: number | null;
    replies: number;
    ratedShare: number | null;
    averageStars: number | null;
    starRatings: number;
  })[];
  byModel: (FeedbackTally & { model: string; likeRate: number | null })[];
  byReason: { up: { reason: string; count: number }[]; down: { reason: string; count: number }[] };
  byDay: (FeedbackTally & { date: string })[];
  byHour: (FeedbackTally & { hour: number })[];
  byUser: (FeedbackTally & { label: string; user: { id: string; name: string } | null })[];
  themes: { liked: { term: string; count: number }[]; disliked: { term: string; count: number }[] };
  liked: FeedbackItem[];
  disliked: FeedbackItem[];
  notes: FeedbackItem[];
};

// ── Token usage (GET /ai-usage) ────────────────────────────────────────────

export type UsageBucket = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
  avgLatencyMs: number | null;
  cacheHitRate: number | null;
};

export type UsageAgent = { id: string; name: string; status: string; avatarUrl: string | null; model: string | null } | null;

export type AiUsageReport = {
  range: { from: string; to: string; days: number };
  totals: UsageBucket & { avgTokensPerCall: number | null; tokenCountCalls: number };
  byDay: (UsageBucket & { date: string })[];
  byAgent: (UsageBucket & { agent: UsageAgent })[];
  byModel: (UsageBucket & { model: string })[];
  byOperation: (UsageBucket & { operation: string })[];
  recent: {
    id: string;
    createdAt: string;
    operation: string;
    model: string;
    agent: UsageAgent;
    visitorId: string | null;
    userId: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    latencyMs: number | null;
    costUsd: number;
  }[];
  pricing: { model: string; inputPerMTok: number; outputPerMTok: number; cacheWritePerMTok: number; cacheReadPerMTok: number }[];
};
