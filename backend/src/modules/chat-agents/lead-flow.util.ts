import type { UiBlock } from './ui-block.util';

/**
 * The lead rules every AI bot plays by, enforced here rather than trusted to
 * the prompt:
 *
 *   - after the bot's 3rd reply, a name + number form arrives as its own
 *     message, with a "not now" (once per conversation)
 *   - from the 6th reply on, the form is compulsory: no more answers until
 *     the visitor leaves a number
 *   - a form never asks for something the visitor already gave
 *
 * The forms these rules add carry `"auto"` so they are not counted as replies.
 */

export const LEAD_SOFT_AFTER = 3;
export const LEAD_GATE_AFTER = 6;

/** Marks the forms this module adds, so reply counts can leave them out. */
export const AUTO_MARKER = '"auto":"';

export interface KnownContact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

const LEAD_FIELDS = new Set(['name', 'phone', 'email']);

/**
 * A name the visitor states outright ("I'm Sneha", "my name is Rahul Kumar"),
 * as a fallback for when the model forgets to tag it. Capitalised words only,
 * so "I'm looking for…" is not taken for a name.
 */
export function detectName(message: string): string | null {
  const m = message.match(
    /(?:^|\b)(?:[Ii] am|I'm|I’m|[Mm]y name is|[Mm]y name's|[Tt]his is|[Cc]all me)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)\b/,
  );
  return m ? m[1] : null;
}

/** True when a stored bot message carried a form asking for name, phone or email. */
export function storedHasLeadForm(content: string | undefined): boolean {
  const raw = content?.match(/<ui>([\s\S]*?)<\/ui>/)?.[1];
  if (!raw) return false;
  try {
    const ui = JSON.parse(raw) as { type?: string; fields?: string[] };
    return ui.type === 'form' && Array.isArray(ui.fields) && ui.fields.some((f) => LEAD_FIELDS.has(f));
  } catch {
    return false;
  }
}

/** The visitor asked for something that genuinely needs their details. */
export function asksForContactStep(message: string): boolean {
  return /\b(call|callback|call back|video|visit|book|whatsapp|send|report|guide|slot|counsell?or)\b/i.test(message);
}

/** A follow-up bubble that asks for the name or number (dropped when a details form is already coming). */
export function asksForDetails(text: string): boolean {
  return /\b(your name|call you|what should i call|number|whatsapp|mobile)\b/i.test(text);
}

/** A question the visitor answers by tapping or filling in. */
export function isBlockingUi(ui: UiBlock | null): boolean {
  return Boolean(ui && (ui.type === 'chips' || ui.type === 'select' || ui.type === 'form'));
}

export function isLeadForm(ui: UiBlock | null): boolean {
  return Boolean(ui && ui.type === 'form' && ui.fields.some((f) => LEAD_FIELDS.has(f)));
}

/**
 * Remove fields the visitor already gave. A form that asked only for those is
 * dropped entirely (null); one with other questions (a slot, a programme) stays.
 */
export function withoutKnownFields(ui: UiBlock | null, known: KnownContact | null): UiBlock | null {
  if (!ui || ui.type !== 'form' || !known) return ui;
  const fields = ui.fields.filter(
    (f) => !((f === 'name' && known.name) || (f === 'phone' && known.phone) || (f === 'email' && known.email)),
  );
  if (fields.length === ui.fields.length) return ui;
  const left = fields.length + (ui.selects?.length ?? 0);
  if (left === 0) return null;
  return { ...ui, fields };
}

/**
 * Nothing is booked or delivered to someone we cannot reach:
 *  - a call, video or visit form always carries the name and number fields
 *    that are still missing;
 *  - a PDF guide is never handed over before the number: it becomes the
 *    "we'll send it to your WhatsApp" form, and the guide follows once they
 *    have filled it in.
 */
export function requireContact(ui: UiBlock | null, known: KnownContact | null): UiBlock | null {
  if (!ui) return ui;
  const missing = [...(known?.name ? [] : ['name' as const]), ...(known?.phone ? [] : ['phone' as const])];
  if (!missing.length) return ui;

  if (ui.type === 'form') {
    const books = ui.fields.includes('slot') || ui.fields.includes('visitDay') || ui.icon === 'video' || ui.icon === 'phone';
    if (!books) return ui;
    const add = missing.filter((f) => !ui.fields.includes(f));
    if (!add.length) return ui;
    return { ...ui, fields: [...add, ...ui.fields].slice(0, 6) };
  }

  if (ui.type === 'guide' && !known?.phone) {
    return {
      type: 'form',
      icon: 'whatsapp',
      title: `${ui.title.slice(0, 60)} is ready`,
      subtitle: 'We send it to your WhatsApp, with your name on it.',
      fields: missing,
      submit: 'Send it on WhatsApp',
      skip: 'Not now, keep chatting',
      note: 'Used only to send your report and answer your questions. Say stop anytime.',
    };
  }
  return ui;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** The stored content of an auto lead message: one short line, then the form. */
export function autoLeadMessage(kind: 'soft' | 'gate', known: KnownContact | null): string {
  const fields = [...(known?.name ? [] : ['name']), 'phone'];
  const soft = kind === 'soft';
  const first = known?.name?.trim().split(/\s+/)[0];
  // Ask only for what is missing, and say so in the words.
  const what = first ? 'number' : 'name and number';
  const you = first ? `, ${first}` : '';
  const line = soft
    ? pick([
        `Quick one${you}: what ${what} should the counsellor use to send you the exact details?`,
        `So a counsellor can WhatsApp you the exact fee and next steps${you}, what ${what} should I use?`,
        `Let me get your ${what} on file${you}, so everything we covered reaches you on WhatsApp.`,
      ])
    : pick([
        `To keep going${you}, I'll need your ${what}, so a counsellor can confirm the details that apply to you.`,
        `Before we go further${you}, please share your ${what}: the rest depends on your exact case, and a counsellor confirms it.`,
      ]);
  const form = {
    type: 'form',
    icon: 'phone',
    title: soft ? 'Get the exact details for you' : 'Your details to continue',
    subtitle: 'Fee for your quota, eligibility and next steps, from a counsellor.',
    fields,
    submit: soft ? 'Send me the details' : 'Continue',
    ...(soft ? { skip: 'Not now, keep chatting', quietSkip: true } : { gate: true }),
    note: 'Used only by Acharya admissions for your enquiry. Say stop anytime.',
    auto: kind,
  };
  return `${line}\n\n<ui>${JSON.stringify(form)}</ui>`;
}
