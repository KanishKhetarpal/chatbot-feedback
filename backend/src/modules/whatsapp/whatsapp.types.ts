/**
 * What the bot says on WhatsApp, independent of how it is delivered.
 *
 * The bot composes these; the transport decides how each reaches the phone. On
 * WhatsApp the limits are hard and Meta rejects anything over them, so they are
 * written down here once:
 *
 *   reply buttons  up to 3, title up to 20 characters, body up to 1024
 *   list           up to 10 rows, row title up to 24, description up to 72,
 *                  button label up to 20, body up to 4096
 *   text           up to 4096
 */

export const WA_LIMITS = {
  buttons: 3,
  buttonTitle: 20,
  listRows: 10,
  rowTitle: 24,
  rowDescription: 72,
  listButton: 20,
  interactiveBody: 1024,
  text: 4096,
} as const;

export interface WaOption {
  /** Stable id that comes back when tapped: `menu:courses`, `handoff:call`, `ai:2`. */
  id: string;
  title: string;
  description?: string;
  /** On a "More options" button: the options it reveals. */
  rest?: WaOption[];
}

export type OutboundMessage =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; options: WaOption[]; footer?: string }
  | { kind: 'list'; body: string; button: string; options: WaOption[]; footer?: string }
  | { kind: 'image'; url: string; caption?: string }
  | { kind: 'document'; url: string; filename: string; caption?: string }
  | {
      kind: 'template';
      name: string;
      language: string;
      bodyParams: string[];
      body: string;
      quickReplies?: string[];
      /**
       * The value for a template's dynamic URL button. An AUTHENTICATION
       * template's "copy code" button is one of these, and Meta refuses the
       * whole message without it: `(#131008) Button at index 0 of type Url
       * requires a parameter`.
       */
      urlButtonParam?: string;
    };

/** Who caused a message: the AI turn, the follow-up ladder, the counsellor handoff, or a fixed system reply. */
export type OutboundSource = 'bot' | 'followup' | 'handoff' | 'system';

/** One delivery attempt's outcome, in the shape every transport returns. */
export interface DeliveryResult {
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
  /** refused = provably not delivered (safe to retry); unknown = may have been. */
  delivery?: 'refused' | 'unknown';
}

/** Everything the router, bot and simulator need to know about a contact at the start of a turn. */
export interface ContactSnapshot {
  id: string;
  waId: string;
  agentId: string;
  visitorId: string;
  profileName: string | null;
  stage: string;
  botPausedUntil: Date | null;
  handoffAt: Date | null;
  optedOutAt: Date | null;
  pendingOptions: WaOption[];
  lastInboundAt: Date | null;
}
