import { z } from "zod";

import { DEFAULT_HANDOFF_TRIGGERS, DEFAULT_WIDGET_THEME } from "@/lib/chat-agent-constants";
import type { ChatAgent, PatchChatAgentInput } from "@/types/chat-agent-types";

const originUrl = z
  .string()
  .url("Use a full URL with scheme, e.g. https://www.example.com")
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.pathname || url.pathname === "/";
    } catch {
      return false;
    }
  }, "Origin only — no path (https://www.example.com, not …/about)");

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Use a hex colour, e.g. #1b12ca");

export const chatAgentFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(2000),
  avatarUrl: z
    .string()
    .max(2000)
    .refine((v) => !v.trim() || URL.canParse(v), "Must be a valid URL"),
  heading: z.string().max(120),
  subheading: z.string().max(200),
  greeting: z.string().max(1000),
  messagePresets: z.array(z.string().min(1).max(120)).max(4),
  inputPlaceholder: z.string().max(120),

  tone: z.enum(["professional", "friendly", "casual", "formal", "empathetic"]),
  responseLength: z.enum(["concise", "balanced", "detailed"]),
  language: z.string().min(1),
  useEmoji: z.boolean(),
  knowledgeMode: z.enum(["strict", "blended"]),
  fallbackMessage: z.string().max(1000),
  restrictedTopics: z.array(z.string().min(1).max(120)).max(20),
  instructions: z.string().max(20_000),

  leadCapture: z.enum(["never", "before_chat", "after_first_reply"]),
  leadFields: z
    .array(z.enum(["phone", "name", "email"]))
    .min(1, "Pick at least one field")
    .max(3),
  qualificationEnabled: z.boolean(),
  handoffTriggers: z.array(z.string().min(2).max(120)).max(20),
  handoffMessage: z.string().max(1000),
  handoffOnFallback: z.number().int().min(0).max(10),

  model: z.string().min(1),
  effort: z.enum(["low", "medium", "high"]),
  maxTokens: z.number().int().min(128).max(8192),

  allowedOrigins: z.array(originUrl).max(20),
  status: z.enum(["draft", "active", "paused"]),

  // Mirrors the API's theme contract. Colours are pattern-checked here so a typo
  // is caught in the field rather than coming back as a 400 after Save.
  theme: z.object({
    primary: hexColor,
    primaryText: hexColor,
    background: hexColor,
    backgroundText: hexColor,
    muted: hexColor,
    mutedText: hexColor,
    border: hexColor,
    corners: z.enum(["rounded", "soft", "square"]),
    launcherPosition: z.enum(["right", "left"]),
    // The floor is a minimum touch target, not a matter of taste.
    launcherSize: z.number().int().min(44).max(80),
    animations: z.boolean(),
    showBranding: z.boolean(),
  }),
});

export type ChatAgentFormValues = z.infer<typeof chatAgentFormSchema>;

export const EMPTY_CHAT_AGENT_FORM_VALUES: ChatAgentFormValues = {
  name: "",
  description: "",
  avatarUrl: "",
  heading: "",
  subheading: "",
  greeting: "",
  messagePresets: [],
  inputPlaceholder: "",
  tone: "friendly",
  responseLength: "balanced",
  language: "auto",
  useEmoji: false,
  knowledgeMode: "strict",
  fallbackMessage: "",
  restrictedTopics: [],
  instructions: "",
  leadCapture: "after_first_reply",
  leadFields: ["phone"],
  qualificationEnabled: true,
  handoffTriggers: DEFAULT_HANDOFF_TRIGGERS,
  handoffMessage: "",
  handoffOnFallback: 2,
  model: "",
  effort: "medium",
  maxTokens: 1024,
  allowedOrigins: [],
  status: "draft",
  theme: DEFAULT_WIDGET_THEME,
};

export function chatAgentToFormValues(agent: ChatAgent): ChatAgentFormValues {
  return {
    // The API resolves this server-side and always answers with every field;
    // the spread is only insurance against an older response.
    theme: { ...DEFAULT_WIDGET_THEME, ...(agent.theme ?? {}) },
    name: agent.name,
    description: agent.description ?? "",
    avatarUrl: agent.avatarUrl ?? "",
    heading: agent.heading ?? "",
    subheading: agent.subheading ?? "",
    greeting: agent.greeting ?? "",
    messagePresets: agent.messagePresets ?? [],
    inputPlaceholder: agent.inputPlaceholder ?? "",
    tone: agent.tone,
    responseLength: agent.responseLength,
    language: agent.language || "auto",
    useEmoji: agent.useEmoji,
    knowledgeMode: agent.knowledgeMode,
    fallbackMessage: agent.fallbackMessage ?? "",
    restrictedTopics: agent.restrictedTopics ?? [],
    instructions: agent.instructions ?? "",
    leadCapture: agent.leadCapture,
    leadFields: agent.leadFields?.length ? agent.leadFields : ["phone"],
    // Older API builds omit it; the server default is on.
    qualificationEnabled: agent.qualificationEnabled ?? true,
    handoffTriggers: agent.handoffTriggers?.length
      ? agent.handoffTriggers
      : DEFAULT_HANDOFF_TRIGGERS,
    handoffMessage: agent.handoffMessage ?? "",
    handoffOnFallback: agent.handoffOnFallback ?? 2,
    model: agent.model,
    effort: agent.effort,
    maxTokens: agent.maxTokens ?? 1024,
    allowedOrigins: agent.allowedOrigins ?? [],
    status: agent.status,
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isDirty(value: unknown): boolean {
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(isDirty);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(isDirty);
  }
  return false;
}

/**
 * Build a PATCH body from dirty react-hook-form fields only.
 *
 * Sending the whole form would overwrite fields another tab changed since this
 * one loaded, and would make every save look like an edit to everything.
 */
export function dirtyChatAgentPatch(
  values: ChatAgentFormValues,
  dirtyFields: Partial<Record<keyof ChatAgentFormValues, unknown>>,
): PatchChatAgentInput {
  const patch: PatchChatAgentInput = {};

  // Blank means "cleared", not "empty string" — the API stores null.
  const nullableStringKeys = new Set([
    "description",
    "avatarUrl",
    "heading",
    "subheading",
    "greeting",
    "inputPlaceholder",
    "fallbackMessage",
    "instructions",
    "handoffMessage",
  ]);

  for (const key of Object.keys(dirtyFields) as (keyof ChatAgentFormValues)[]) {
    if (!isDirty(dirtyFields[key])) continue;
    const value = values[key];

    if (nullableStringKeys.has(key)) {
      (patch as Record<string, unknown>)[key] = emptyToNull(value as string);
      continue;
    }

    // Sent whole rather than field-by-field. The API merges a theme over what is
    // stored and keeps only what differs from its defaults, so sending the
    // complete object still results in a sparse row — and it avoids walking
    // react-hook-form's nested dirtyFields tree to find which colour moved.
    if (key === "theme") {
      patch.theme = values.theme;
      continue;
    }

    (patch as Record<string, unknown>)[key] = value;
  }

  return patch;
}

export function validateOriginTag(tag: string): string | null {
  const result = originUrl.safeParse(tag);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid origin URL");
}
