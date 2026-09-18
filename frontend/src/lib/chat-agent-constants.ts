import type {
  ChatAgentStatus,
  CornerStyle,
  GuidedFlow,
  GuidedFlowIssue,
  GuidedFlowNode,
  GuidedFlowReservedId,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
  ThemePalette,
  WidgetChip,
  WidgetTheme,
} from "@/types/chat-agent-types";

/* ── Widget theme ────────────────────────────────────────────────────────── */

/** Must match the backend's `widget-theme.ts` defaults exactly. */
export const DEFAULT_WIDGET_THEME: WidgetTheme = {
  primary: "#ea580c",
  primaryText: "#fff7ed",
  background: "#0a0a0a",
  backgroundText: "#fafafa",
  muted: "#171717",
  mutedText: "#a3a3a3",
  border: "#262626",
  corners: "rounded",
  launcherPosition: "right",
  launcherSize: 48,
  animations: true,
  showBranding: false,
};

/**
 * Ready-made palettes.
 *
 * Each is picked against its own background rather than derived by inverting
 * another — a flipped dark palette gives you invisible borders and unreadable
 * secondary text. Every one keeps body text near the contrast ratio you would
 * want for a paragraph, because visitors read these bubbles rather than glance
 * at them.
 */
export const THEME_PRESETS: { id: string; name: string; palette: ThemePalette }[] = [
  {
    id: "acharya",
    name: "Acharya",
    palette: {
      primary: "#1b12ca",
      primaryText: "#ffffff",
      background: "#ffffff",
      backgroundText: "#0f0f14",
      muted: "#f3f3f8",
      mutedText: "#6b6b7b",
      border: "#e4e4ed",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    palette: {
      primary: "#ea580c",
      primaryText: "#fff7ed",
      background: "#0a0a0a",
      backgroundText: "#fafafa",
      muted: "#171717",
      mutedText: "#a3a3a3",
      border: "#262626",
    },
  },
  {
    id: "daylight",
    name: "Daylight",
    palette: {
      primary: "#2563eb",
      primaryText: "#ffffff",
      background: "#ffffff",
      backgroundText: "#0a0a0a",
      muted: "#f4f4f5",
      mutedText: "#71717a",
      border: "#e4e4e7",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    palette: {
      primary: "#06b6d4",
      primaryText: "#042f38",
      background: "#0b1420",
      backgroundText: "#e6f0f7",
      muted: "#14212f",
      mutedText: "#8aa1b4",
      border: "#1e2d3d",
    },
  },
  {
    id: "forest",
    name: "Forest",
    palette: {
      primary: "#10b981",
      primaryText: "#04241a",
      background: "#0b1410",
      backgroundText: "#e8f2ec",
      muted: "#13211a",
      mutedText: "#8fa89a",
      border: "#1d2f26",
    },
  },
  {
    id: "paper",
    name: "Paper",
    palette: {
      primary: "#7c3aed",
      primaryText: "#ffffff",
      background: "#faf9fb",
      backgroundText: "#18131d",
      muted: "#f1edf5",
      mutedText: "#6b6273",
      border: "#e5dfeb",
    },
  },
];

/** Which preset a theme currently matches, if any — so the picker can show it selected. */
export function matchThemePreset(theme: WidgetTheme): string | null {
  const found = THEME_PRESETS.find((preset) =>
    (Object.keys(preset.palette) as (keyof ThemePalette)[]).every(
      (key) => theme[key]?.toLowerCase() === preset.palette[key].toLowerCase(),
    ),
  );
  return found?.id ?? null;
}

/** Radius per corner style, in px. Kept in step with the backend's CORNER_RADIUS. */
export const CORNER_RADIUS: Record<CornerStyle, { panel: number; bubble: number }> = {
  rounded: { panel: 22, bubble: 16 },
  soft: { panel: 12, bubble: 10 },
  square: { panel: 2, bubble: 2 },
};

/** Chat-tail radii: the corner nearest the speaker is tighter than the rest. */
export function bubbleRadii(corners: CornerStyle, from: "user" | "bot"): string {
  const r = CORNER_RADIUS[corners]?.bubble ?? 16;
  const tail = Math.max(4, Math.round(r * 0.28));
  return from === "user" ? `${r}px ${r}px ${tail}px ${r}px` : `${r}px ${r}px ${r}px ${tail}px`;
}

/**
 * Whether a panel colour is light enough to need dark native chrome.
 * Relative luminance, same weights as the CSS brightness heuristic.
 */
export function isLightHex(hex: string): boolean {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return false;
  const n = Number.parseInt(raw, 16);
  if (Number.isNaN(n)) return false;
  return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 160;
}

/* ── Agent options ───────────────────────────────────────────────────────── */

export const CHAT_AGENT_LANGUAGES = [
  { value: "auto", label: "Auto — match the visitor" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "kn", label: "Kannada" },
];

export const CHAT_AGENT_LEAD_FIELD_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
];

export const DEFAULT_HANDOFF_TRIGGERS = ["talk to a human", "speak to someone", "complaint"];

/** Status → `Badge` tone, following the app's shared tone vocabulary. */
export function getChatAgentStatusTone(
  status: ChatAgentStatus | string,
): "success" | "warning" | "muted" {
  switch (status) {
    case "active":
      return "success";
    case "paused":
      return "warning";
    default:
      return "muted";
  }
}

export function getKnowledgeStatusTone(
  status: KnowledgeSourceStatus | "untrained" | string,
): "success" | "warning" | "danger" | "muted" {
  switch (status) {
    case "ready":
      return "success";
    case "pending":
    case "processing":
    case "untrained":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "muted";
  }
}

/* ── Knowledge ───────────────────────────────────────────────────────────── */

/**
 * Only two kinds are offered here. Websites, Q/A pairs and connectors exist in
 * the backend's union but are not creatable from the CRM — paste the page as a
 * text snippet instead.
 */
export const KNOWLEDGE_TABS: { type: "text" | "file"; label: string; hint: string }[] = [
  { type: "text", label: "Text", hint: "Paste policies, notices, fee rules and short articles." },
  { type: "file", label: "Files", hint: "Upload a CSV or Excel sheet — fees, courses, dates." },
];

export const KNOWLEDGE_FILE_ACCEPT = [".csv", ".xlsx"] as const;
export const KNOWLEDGE_FILE_MAX_MB = 10;
/** Matches the backend's UploadKnowledgeFileDto. */
export const KNOWLEDGE_DESCRIPTION_MIN = 10;

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  text: "Text snippet",
  file: "File",
  website: "Website",
  qa: "Q/A",
  integration: "Integration",
};

export function isKnowledgeIngesting(status: string) {
  return status === "pending" || status === "processing";
}

export function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Embed snippet ───────────────────────────────────────────────────────── */

/**
 * The `<script>` tag a site owner pastes to put an agent on their page.
 *
 * Built here rather than fetched from the API, because this app is the only
 * place that knows the address: `widget.js` is a static file in this app's
 * `public/`, so it is served from this app's own origin — the same origin that
 * serves the `/widget/:key` panel the loader mounts. That is why the tag needs
 * no second address. The API base is baked into `widget.js` itself, since it is
 * the one thing the loader cannot infer.
 *
 * The `src` is absolute on purpose. Pasted onto another site, a relative
 * `/widget.js` would resolve against *that* site and 404.
 *
 * `origin` is injectable so a super admin working on localhost can still copy a
 * snippet that points at production, rather than one nobody else can load.
 */
export function buildEmbedSnippet(publicKey: string, options?: { origin?: string }): string {
  const origin = (
    options?.origin ?? (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/+$/, "");

  return [
    `<script async src="${origin}/widget.js"`,
    `        data-agent-key="${publicKey}"></script>`,
  ].join("\n");
}

// ── Inbox — silently-extracted visitor details ──

/**
 * Display order and copy for `visitor.custom` in the inbox sidebar. Order matches
 * the priority the backend's qualifier uses, so the panel reads top-down the same
 * way the agent asks. City / state / country are folded into one Location row.
 */
export const INBOX_EXTRACTED_FIELDS: {
  key: string;
  label: string;
  kind?: "date" | "boolean";
}[] = [
  { key: "dob", label: "Date of birth", kind: "date" },
  { key: "gender", label: "Gender" },
  { key: "location", label: "Location" },
  { key: "languagePreference", label: "Language" },
  { key: "courseCoreName", label: "Programme (formal)" },
  { key: "courseAcademicYearName", label: "Academic year" },
  { key: "educationCompleted", label: "Education completed" },
  { key: "grade12Stream", label: "Class 12 stream" },
  { key: "parentName", label: "Parent name" },
  { key: "parentPhone", label: "Parent phone" },
  { key: "requiresHostel", label: "Needs hostel", kind: "boolean" },
  { key: "interestedInScholarship", label: "Scholarship interest", kind: "boolean" },
  { key: "hasLocalGuardian", label: "Local guardian", kind: "boolean" },
];

// ── Guided flow ──

/**
 * Server limits, mirrored so the editor can refuse a bad tree before the round
 * trip. Must track `guided-flow.validator.ts` on the backend exactly — the
 * server is still the authority and answers 400 with the full issue list.
 */
export const GUIDED_FLOW_LIMITS = {
  minRoots: 1,
  maxRoots: 8,
  maxNodes: 100,
  maxLabel: 80,
  maxAnswer: 2000,
  maxNext: 6,
  maxDepth: 5,
} as const;

export const GUIDED_FLOW_NODE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const GUIDED_FLOW_RESERVED_IDS: readonly GuidedFlowReservedId[] = [
  "escape_ai",
  "escape_human",
  "mark_intl_yes",
  "mark_intl_no",
];

export function isGuidedFlowReservedId(id: string): id is GuidedFlowReservedId {
  return (GUIDED_FLOW_RESERVED_IDS as readonly string[]).includes(id);
}

/** Default copy for the four system chips, used when a tree is first switched on. */
export const GUIDED_FLOW_DEFAULT_LABELS = {
  escapeToAiLabel: "Ask me something else",
  escapeToHumanLabel: "Talk to a counsellor",
  markIntlYesLabel: "Yes, from another country",
  markIntlNoLabel: "No, I'm from India",
  markIntlYesAck: "Thanks — noted. What would you like to know?",
  markIntlNoAck: "Great. What would you like to know?",
} as const;

/** What each system chip does, for the editor's picker. */
export const GUIDED_FLOW_SYSTEM_CHIPS: {
  id: GuidedFlowReservedId;
  labelKey: "escapeToAiLabel" | "escapeToHumanLabel" | "markIntlYesLabel" | "markIntlNoLabel";
  ackKey?: "markIntlYesAck" | "markIntlNoAck";
  hint: string;
}[] = [
  { id: "escape_ai", labelKey: "escapeToAiLabel", hint: "Routes to the AI — free-text chat" },
  {
    id: "escape_human",
    labelKey: "escapeToHumanLabel",
    hint: "Fires a handoff and a callback task",
  },
  {
    id: "mark_intl_yes",
    labelKey: "markIntlYesLabel",
    ackKey: "markIntlYesAck",
    hint: "Marks the visitor as international, returns to root",
  },
  {
    id: "mark_intl_no",
    labelKey: "markIntlNoLabel",
    ackKey: "markIntlNoAck",
    hint: "Locks country to India, returns to root",
  },
];

/**
 * Merge tokens an answer may use. Deliberately the non-sensitive subset — the
 * server resolves phone, email and ids to an empty string anyway, so offering
 * them would only produce blank gaps in answers.
 */
export const GUIDED_FLOW_MERGE_TOKENS: { token: string; label: string; example: string }[] = [
  { token: "firstName", label: "First name", example: "Ravi" },
  { token: "courseInterest", label: "Course interest", example: "B.Tech CSE" },
  { token: "courseCoreName", label: "Programme", example: "B.Tech" },
  { token: "courseProgramName", label: "Program", example: "Computer Science" },
  { token: "courseSpecializationName", label: "Specialisation", example: "AI & ML" },
  { token: "courseAcademicYearName", label: "Academic year", example: "2026-27" },
  { token: "city", label: "City", example: "Bengaluru" },
  { token: "state", label: "State", example: "Karnataka" },
  { token: "country", label: "Country", example: "India" },
  { token: "applicationStatus", label: "Application status", example: "Application_Submitted" },
];

/**
 * Chip label for any id — a node's own label, or the tree-level label for a
 * reserved id. Falls back to the id itself so a tree with a dangling reference
 * still renders something a person can recognise and fix.
 */
export function resolveGuidedChipLabel(flow: GuidedFlow, id: string): string {
  switch (id) {
    case "escape_ai":
      return flow.escapeToAiLabel || GUIDED_FLOW_DEFAULT_LABELS.escapeToAiLabel;
    case "escape_human":
      return flow.escapeToHumanLabel || GUIDED_FLOW_DEFAULT_LABELS.escapeToHumanLabel;
    case "mark_intl_yes":
      return flow.markIntlYesLabel || GUIDED_FLOW_DEFAULT_LABELS.markIntlYesLabel;
    case "mark_intl_no":
      return flow.markIntlNoLabel || GUIDED_FLOW_DEFAULT_LABELS.markIntlNoLabel;
    default:
      return flow.nodes[id]?.label || id;
  }
}

/** Ids → chips, in order. Unknown ids are kept (labelled by id) rather than dropped, so a broken tree is visible. */
export function guidedChipsFor(flow: GuidedFlow, ids: string[]): WidgetChip[] {
  return ids.map((id) => ({ id, label: resolveGuidedChipLabel(flow, id) }));
}

/**
 * Turn a chip label into a node id that satisfies the server regex, avoiding
 * anything already taken. "What programmes do you offer?" → `what-programmes-do-you-offer`.
 */
export function slugifyGuidedNodeId(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!base || !/^[a-z0-9]/.test(base)) base = `node-${base}`.replace(/-+$/g, "");
  if (isGuidedFlowReservedId(base)) base = `${base}-node`;
  let candidate = base;
  let n = 2;
  while (used.has(candidate) || isGuidedFlowReservedId(candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

/**
 * Client-side interpolation of `{{field}}` / `{{field|fallback}}`, matching the
 * server's rules: a known value wins, else the fallback, else an empty string.
 * Only the editor's preview uses this — the live widget renders the server's
 * already-interpolated `answer`.
 */
export function interpolateGuidedAnswer(answer: string, values: Record<string, string>): string {
  return answer.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g,
    (_, key: string, fb?: string) => (values[key]?.trim() ? values[key] : (fb ?? "").trim()),
  );
}

/** Depth of every node reachable from the roots (root chips are depth 1). */
function guidedFlowDepths(flow: GuidedFlow): Map<string, number> {
  const depth = new Map<string, number>();
  const queue: { id: string; d: number }[] = flow.rootIds
    .filter((id) => flow.nodes[id])
    .map((id) => ({ id, d: 1 }));
  while (queue.length) {
    const { id, d } = queue.shift()!;
    if (depth.has(id)) continue;
    depth.set(id, d);
    for (const child of flow.nodes[id]?.next ?? []) {
      if (flow.nodes[child] && !depth.has(child)) queue.push({ id: child, d: d + 1 });
    }
  }
  return depth;
}

/** Nodes nothing reaches from the root chips. The server refuses to save these. */
export function guidedFlowOrphans(flow: GuidedFlow): GuidedFlowNode[] {
  const reachable = guidedFlowDepths(flow);
  return Object.values(flow.nodes).filter((node) => !reachable.has(node.id));
}

/** Every node (and "root") whose `next[]` points at `id`. */
export function guidedFlowReferrers(flow: GuidedFlow, id: string): string[] {
  const out: string[] = [];
  if (flow.rootIds.includes(id)) out.push("root");
  for (const node of Object.values(flow.nodes)) {
    if (node.id !== id && node.next.includes(id)) out.push(node.id);
  }
  return out;
}

/**
 * The server's shape and semantic checks, run locally so the editor can mark
 * problems as they are made. Codes follow the backend's names where they exist
 * (`unknown_next_ref`, `orphan_node`) so a server issue lands in the same slot.
 */
export function validateGuidedFlow(flow: GuidedFlow): GuidedFlowIssue[] {
  const issues: GuidedFlowIssue[] = [];
  const L = GUIDED_FLOW_LIMITS;
  const nodeIds = Object.keys(flow.nodes);

  if (flow.rootIds.length < L.minRoots) {
    issues.push({ code: "roots_empty", message: "Add at least one root chip." });
  }
  if (flow.rootIds.length > L.maxRoots) {
    issues.push({ code: "roots_too_many", message: `At most ${L.maxRoots} root chips.` });
  }
  if (nodeIds.length > L.maxNodes) {
    issues.push({ code: "nodes_too_many", message: `At most ${L.maxNodes} nodes.` });
  }
  if (!flow.escapeToAiLabel.trim()) {
    issues.push({ code: "label_missing", message: "The “ask the AI” chip needs a label." });
  }
  if (!flow.escapeToHumanLabel.trim()) {
    issues.push({
      code: "label_missing",
      message: "The “talk to a counsellor” chip needs a label.",
    });
  }

  for (const id of flow.rootIds) {
    if (!flow.nodes[id] && !isGuidedFlowReservedId(id)) {
      issues.push({
        code: "unknown_next_ref",
        message: `Root chip points at unknown node “${id}”.`,
        where: `root → ${id}`,
      });
    }
  }

  for (const [key, node] of Object.entries(flow.nodes)) {
    if (key !== node.id) {
      issues.push({
        code: "id_mismatch",
        message: `Node key “${key}” differs from its id.`,
        where: key,
      });
    }
    if (!GUIDED_FLOW_NODE_ID_RE.test(node.id)) {
      issues.push({
        code: "bad_id",
        message: `“${node.id}” is not a lowercase slug.`,
        where: node.id,
      });
    }
    if (isGuidedFlowReservedId(node.id)) {
      issues.push({ code: "reserved_id", message: `“${node.id}” is reserved.`, where: node.id });
    }
    if (!node.label.trim()) {
      issues.push({ code: "label_empty", message: "Chip label is empty.", where: node.id });
    } else if (node.label.length > L.maxLabel) {
      issues.push({
        code: "label_too_long",
        message: `Label over ${L.maxLabel} characters.`,
        where: node.id,
      });
    }
    if (!node.answer.trim()) {
      issues.push({ code: "answer_empty", message: "Answer is empty.", where: node.id });
    } else if (node.answer.length > L.maxAnswer) {
      issues.push({
        code: "answer_too_long",
        message: `Answer over ${L.maxAnswer} characters.`,
        where: node.id,
      });
    }
    if (node.next.length > L.maxNext) {
      issues.push({
        code: "next_too_many",
        message: `More than ${L.maxNext} next chips.`,
        where: node.id,
      });
    }
    for (const ref of node.next) {
      if (!flow.nodes[ref] && !isGuidedFlowReservedId(ref)) {
        issues.push({
          code: "unknown_next_ref",
          message: `Node “${node.id}” links to unknown node “${ref}”.`,
          where: `${node.id} → ${ref}`,
        });
      }
    }
    if (new Set(node.next).size !== node.next.length) {
      issues.push({
        code: "duplicate_next",
        message: "The same chip is listed twice.",
        where: node.id,
      });
    }
  }

  const usesIntl = [...flow.rootIds, ...Object.values(flow.nodes).flatMap((n) => n.next)].some(
    (id) => id === "mark_intl_yes" || id === "mark_intl_no",
  );
  if (usesIntl && (!flow.markIntlYesLabel?.trim() || !flow.markIntlNoLabel?.trim())) {
    issues.push({
      code: "intl_labels_missing",
      message: "The international chips are used but their labels are blank.",
    });
  }

  const depths = guidedFlowDepths(flow);
  for (const [id, d] of depths) {
    if (d > L.maxDepth) {
      issues.push({
        code: "too_deep",
        message: `“${id}” sits ${d} chips deep (max ${L.maxDepth}).`,
        where: id,
      });
    }
  }
  for (const orphan of guidedFlowOrphans(flow)) {
    issues.push({
      code: "orphan_node",
      message: `“${orphan.label || orphan.id}” cannot be reached from a root chip.`,
      where: orphan.id,
    });
  }

  return issues;
}
