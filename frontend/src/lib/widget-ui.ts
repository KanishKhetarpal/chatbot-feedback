/**
 * What a bot can attach to a reply besides its text (see ui-block.util.ts in
 * the backend, which validates and stores it):
 *
 *   <media>[{url,caption}]</media>  campus photos
 *   <ui>{…}</ui>                    one interactive element
 *   <next>["…"]</next>              suggested follow-up replies
 *   <then>…</then>                  a short second message, its own bubble
 *   <plan>{card}</plan>             a checklist pinned under the header
 *
 * This file splits stored content back into those parts and types them.
 */

export type UiProgress = { step: number; total: number };

export type UiIcon =
  | "home" | "bed" | "food" | "shield" | "wifi" | "bus" | "book" | "flask" | "briefcase" | "trophy" | "users"
  | "graduation" | "rupee" | "calendar" | "clock" | "phone" | "video" | "map" | "check" | "star" | "file" | "heart"
  | "info" | "building" | "award" | "target" | "mail" | "whatsapp";

export type UiChips = {
  type: "chips";
  prompt?: string;
  options: string[];
  multi?: boolean;
  submit?: string;
  /** Multi-select: label of the exclusive "none of these" answer. */
  none?: string;
  progress?: UiProgress;
};

export type UiSelect = {
  type: "select";
  title?: string;
  fields: { label: string; options: string[] }[];
  submit?: string;
  /** A "skip this" button; its label is sent back as the answer. */
  skip?: string;
  progress?: UiProgress;
};

export type UiCardItem = { label: string; value?: string; status?: "ok" | "warn" | "no" | "info"; icon?: UiIcon };

export type UiCard = {
  type: "card";
  variant?: "result" | "profile" | "summary" | "story" | "checklist" | "compare" | "stats" | "booking";
  title: string;
  subtitle?: string;
  badge?: string;
  items?: UiCardItem[];
  table?: { columns: string[]; rows: string[][] };
  quote?: string;
  footer?: string;
  actions?: string[];
  links?: { label: string; url: string }[];
  progress?: UiProgress;
};

export type UiFits = {
  type: "fits";
  title: string;
  subtitle?: string;
  items: { name: string; match?: number; why?: string; icon?: UiIcon }[];
  actions?: string[];
};

export type UiGuide = {
  type: "guide";
  title: string;
  for?: string;
  subtitle?: string;
  sections: { heading: string; body: string }[];
  locked?: boolean;
  unlockLabel?: string;
};

export type UiFormField = "name" | "phone" | "email" | "slot" | "relation" | "visitDay";

export type UiForm = {
  type: "form";
  title: string;
  subtitle?: string;
  fields: UiFormField[];
  selects?: { label: string; options: string[] }[];
  slots?: string[];
  visitDays?: string[];
  submit?: string;
  note?: string;
  icon?: UiIcon;
  /** The chat cannot continue until this form is submitted. */
  gate?: boolean;
  /** Rule-based bots: submit without the AI; show `done` ({name} = first name) and bring the menu back. */
  local?: boolean;
  done?: string;
  /** A "not now" button so the visitor can carry on without it. */
  skip?: string;
  /** "Not now" just closes the form and opens the composer, sending nothing. */
  quietSkip?: boolean;
  /** Added by the server's lead rules: "soft" (skippable) or "gate" (compulsory). */
  auto?: "soft" | "gate";
};

export type UiBlock = UiChips | UiSelect | UiCard | UiFits | UiGuide | UiForm;

export type UiMedia = { url: string; caption: string };

export type ReplyParts = {
  text: string;
  ui: UiBlock | null;
  media: UiMedia[];
  next: string[];
  /** A second, separate message after the first. */
  then: string;
  /** A checklist to pin under the header (the latest one wins). */
  plan: UiCard | null;
};

function readTag<T>(content: string, tag: string): T | null {
  const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return null;
  }
}

const ANY_TAG_RE = /<(ui|media|next|then|plan)>[\s\S]*?(<\/\1>|$)/gi;

/** Stored content → the bubble text and its attachments. */
export function splitReply(content: string): ReplyParts {
  const ui = readTag<UiBlock>(content, "ui");
  const media = readTag<UiMedia[]>(content, "media");
  const next = readTag<string[]>(content, "next");
  const plan = readTag<UiCard>(content, "plan");
  const then = content.match(/<then>([\s\S]*?)<\/then>/i)?.[1]?.trim() ?? "";
  return {
    text: content.replace(ANY_TAG_RE, "").trim(),
    ui: ui && typeof ui === "object" && typeof ui.type === "string" ? ui : null,
    media: Array.isArray(media) ? media.filter((m) => m && typeof m.url === "string") : [],
    next: Array.isArray(next) ? next.filter((n) => typeof n === "string" && n.trim()) : [],
    then,
    plan: plan && typeof plan === "object" && typeof plan.title === "string" ? plan : null,
  };
}

/** Back-compat: text + element only. */
export function splitUi(content: string): { text: string; ui: UiBlock | null } {
  const { text, ui } = splitReply(content);
  return { text, ui };
}

/**
 * True when the element is a question the visitor has to answer (quiz chips,
 * dropdowns, a form). The composer is hidden while one is on screen.
 */
export function isBlocking(ui: UiBlock | null): boolean {
  return Boolean(ui && (ui.type === "chips" || ui.type === "select" || ui.type === "form"));
}

/** True when the element is a gate form: no typing at all until it is submitted. */
export function isGate(ui: UiBlock | null): boolean {
  return Boolean(ui && ui.type === "form" && ui.gate);
}

/** One line describing an element, for the admin transcript and feedback lists. */
export function describeUi(ui: UiBlock): string {
  switch (ui.type) {
    case "chips":
      return `Tappable options: ${ui.options.join(" · ")}`;
    case "select":
      return `Dropdowns: ${ui.fields.map((f) => f.label).join(", ")}`;
    case "card":
      return `Card (${ui.variant ?? "info"}): ${ui.title}`;
    case "fits":
      return `${ui.title}: ${ui.items.map((i) => i.name).join(", ")}`;
    case "guide":
      return `${ui.locked ? "Locked" : ""} PDF guide: ${ui.title}`.trim();
    case "form":
      return `Form: ${ui.title} (${[...ui.fields, ...(ui.selects ?? []).map((s) => s.label)].join(", ")})`;
  }
}

/** Strip attachments for places that only show text. */
export function textOnly(content: string): string {
  return splitReply(content).text;
}
