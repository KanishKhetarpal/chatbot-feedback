/**
 * How one Claude call is attributed in the token ledger.
 *
 * Passed by the caller, never inferred. An AsyncLocalStorage context would drop it at
 * every Bull job boundary — which is exactly where the automatic document checks and the
 * widget extraction run — and could never know which lead a call was about.
 */

/** Coarse grouping the dashboard buckets by. */
export type AiFeature =
  | 'ai_filters'
  | 'email_authoring'
  | 'document_ai'
  | 'chat_widget'
  | 'chat_agent_training';

/**
 * `user` — a person pressed something, so it is attributable to them.
 * `system` — a background job with no request user.
 * `visitor` — an anonymous caller on the public chat widget.
 */
export type AiActorType = 'user' | 'system' | 'visitor';

/** A check that fired on upload versus the same check a counsellor asked for. */
export type AiTrigger = 'automatic' | 'manual';

export type AiEntityType = 'document' | 'chat_agent';

export interface AiAttribution {
  feature: AiFeature;
  actorType: AiActorType;
  trigger: AiTrigger;
  userId?: string | null;
  visitorId?: string | null;
  /**
   * Only when it is known at call time. Widget calls leave this null even for a visitor
   * who already has a lead — the read path joins through `visitorId`, so a visitor who
   * converts later brings their whole history with them without any row being rewritten.
   */
  leadId?: string | null;
  applicationId?: string | null;
  entityType?: AiEntityType | null;
  entityId?: string | null;
}

/** Token counts for one call. All four kinds — cache reads and writes are billed differently. */
export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Non-zero on the turn that wrote the cache (billed above plain input). */
  cacheWriteTokens: number;
  /** Non-zero on every turn that hit it (billed far below). Zero across repeats means a broken prefix. */
  cacheReadTokens: number;
}
