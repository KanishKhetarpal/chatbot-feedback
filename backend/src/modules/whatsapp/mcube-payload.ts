import parsePhoneNumber from 'libphonenumber-js';

/**
 * Reading what Mcube posts to the webhook.
 *
 * Ported from the CRM (`AcharyaUniversityCRM/src/modules/chatbot/mcube-payload.ts`),
 * which learned both shapes the hard way:
 *
 *   1. Meta's own envelope, when Mcube proxies the Cloud API untouched:
 *        { entry: [ { changes: [ { field: 'messages', value: { contacts, messages, statuses } } ] } ] }
 *   2. Mcube's flat dashboard webhook:
 *        { from, message, messageId, timestamp, type, mediaUrl }
 *
 * Both normalise to Meta's envelope, and `readEnvelope` turns that into the two
 * things the bot acts on: messages from a person and receipts for what we sent.
 * Unlike the CRM inbox, this parser also keeps WHICH option a person tapped
 * (the reply id and the `context.id` of the message it answers), because that is
 * what the bot routes on and what the tap analytics count.
 */

type Any = Record<string, any>;

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];

export interface InboundMessage {
  waId: string;
  profileName: string | null;
  providerMessageId: string | null;
  timestamp: Date;
  /** text | interactive_reply | button_reply | image | … */
  kind: string;
  /** What the person wrote, or the title of what they tapped. */
  text: string | null;
  /** The id of the tapped option (list row, reply button, template quick reply). */
  optionId: string | null;
  /** The wamid of our message this one answers, when WhatsApp says. */
  inReplyTo: string | null;
  raw: Any;
}

export interface StatusUpdate {
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  error: string | null;
}

export interface MetaEnvelope {
  entry: Array<{ changes: Array<{ field: string; value: Any }> }>;
}

/** Meta sends epoch seconds as a string; Mcube may send seconds, ms or ISO. */
export function toEpochSeconds(raw: unknown, now = Date.now()): number {
  if (raw === null || raw === undefined || raw === '') return Math.floor(now / 1000);
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n > 1e12 ? n / 1000 : n);
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? Math.floor(now / 1000) : Math.floor(parsed / 1000);
}

function envelope(value: Any): MetaEnvelope {
  return { entry: [{ changes: [{ field: 'messages', value }] }] };
}

/** Accept whatever Mcube posts and return Meta's envelope (empty when unreadable). */
export function normaliseToMetaEnvelope(payload: unknown): MetaEnvelope {
  if (!payload || typeof payload !== 'object') return { entry: [] };
  const body = payload as Any;

  if (Array.isArray(body.entry)) return body as MetaEnvelope;

  // Flat receipt: a status and a message id, no body.
  if (typeof body.status === 'string' && (body.messageId != null || body.message_wamid != null)) {
    return envelope({
      statuses: [
        {
          id: body.message_wamid ?? body.messageId,
          status: String(body.status).toLowerCase(),
          timestamp: toEpochSeconds(body.timestamp),
          ...(body.error ? { errors: [{ title: String(body.error) }] } : {}),
        },
      ],
    });
  }

  // Flat inbound message.
  if (body.from != null || body.mobile != null || body.phone != null) {
    const from = String(body.from ?? body.mobile ?? body.phone ?? '');
    const type = String(body.type ?? 'text').toLowerCase();
    const text = body.message ?? body.text ?? body.body ?? null;
    const message: Any = {
      from,
      id: body.messageId ?? body.message_wamid ?? body.id ?? null,
      timestamp: toEpochSeconds(body.timestamp),
      type: MEDIA_TYPES.includes(type) ? type : 'text',
    };
    if (MEDIA_TYPES.includes(type)) message[type] = { link: body.mediaUrl ?? body.url ?? null, caption: text };
    else message.text = { body: text == null ? null : String(text) };
    const profileName = body.profileName ?? body.name ?? body.senderName ?? null;
    return envelope({
      contacts: profileName ? [{ wa_id: from, profile: { name: profileName } }] : [],
      messages: [message],
    });
  }

  return { entry: [] };
}

/** Digits only; below 8 digits nothing is a routable number. */
export function toWaId(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function readMessage(m: Any, profileName: string | null): InboundMessage | null {
  const waId = toWaId(m?.from);
  if (!waId) return null;
  const type = String(m?.type ?? 'text');
  const base = {
    waId,
    profileName,
    providerMessageId: m?.id ? String(m.id) : null,
    timestamp: new Date(toEpochSeconds(m?.timestamp) * 1000),
    inReplyTo: m?.context?.id ? String(m.context.id) : null,
    raw: m,
  };

  if (type === 'text') {
    return { ...base, kind: 'text', text: m?.text?.body ?? null, optionId: null };
  }
  // A tapped reply button or list row on an interactive message.
  if (type === 'interactive') {
    const reply = m?.interactive?.button_reply ?? m?.interactive?.list_reply ?? {};
    return {
      ...base,
      kind: 'interactive_reply',
      text: reply?.title ?? null,
      optionId: reply?.id ? String(reply.id) : null,
    };
  }
  // A quick-reply button on a TEMPLATE: the payload is what we set when sending.
  if (type === 'button') {
    return {
      ...base,
      kind: 'button_reply',
      text: m?.button?.text ?? null,
      optionId: m?.button?.payload ? String(m.button.payload) : null,
    };
  }
  if (MEDIA_TYPES.includes(type)) {
    return { ...base, kind: type, text: m?.[type]?.caption ?? null, optionId: null };
  }
  return { ...base, kind: type, text: null, optionId: null };
}

/** Everything in one webhook call, in the order it arrived. */
export function readEnvelope(payload: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const env = normaliseToMetaEnvelope(payload);
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];

  for (const entry of env.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'messages') continue;
      const value = change?.value ?? {};
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c?.wa_id && c?.profile?.name) names.set(String(c.wa_id), String(c.profile.name));
      }
      for (const m of value.messages ?? []) {
        const read = readMessage(m, names.get(String(m?.from ?? '')) ?? null);
        if (read) messages.push(read);
      }
      for (const s of value.statuses ?? []) {
        const status = String(s?.status ?? '').toLowerCase();
        if (!s?.id || !['sent', 'delivered', 'read', 'failed'].includes(status)) continue;
        statuses.push({
          providerMessageId: String(s.id),
          status: status as StatusUpdate['status'],
          timestamp: new Date(toEpochSeconds(s.timestamp) * 1000),
          error: s?.errors?.[0]?.message ?? s?.errors?.[0]?.title ?? null,
        });
      }
    }
  }
  return { messages, statuses };
}

/**
 * The `{ phone, country_code }` pair Mcube's send endpoints expect.
 *
 * Read from Google's calling-code metadata, never guessed at `slice(-10)`: the
 * CRM found that guess dials a Singapore number in India. Null means refuse.
 */
export function splitWaId(waId: string): { phone: string; country_code: string } | null {
  const digits = String(waId ?? '').replace(/\D/g, '');
  if (!digits) return null;
  try {
    const parsed = parsePhoneNumber(`+${digits}`);
    if (!parsed?.countryCallingCode || !parsed.nationalNumber) return null;
    return { phone: String(parsed.nationalNumber), country_code: String(parsed.countryCallingCode) };
  } catch {
    return null;
  }
}
