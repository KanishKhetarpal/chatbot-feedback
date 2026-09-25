import type { UiBlock } from './ui-block.util';

/**
 * The lead rules every AI bot plays by, enforced here rather than trusted to
 * the prompt:
 *
 *   - after `leadSoftAfter` bot replies, a name + number form with a "not now"
 *     (once per conversation)
 *   - from `leadGateAfter` on, the form is compulsory: no more answers until
 *     the visitor leaves a number
 *   - either form is a turn of its own, never under an answer: it is sent in
 *     place of the reply, and the message it held back is answered once the
 *     form is filled in or skipped
 *   - a form never asks for something the visitor already gave
 *
 * Both numbers live on the agent (Leads tab) so they can be tuned per bot
 * without a deploy; 0 switches that ask off. They are enforced here, in the
 * API, never in the widget: a caller who talks to the endpoint directly hits
 * exactly the same wall.
 *
 * The forms these rules add carry `"auto"` so they are not counted as replies.
 */

/** Used when the agent row has no number of its own. */
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

/** The element a stored bot message carried, parsed loosely (only its type is relied on). */
export function storedUi(content: string | undefined): UiBlock | null {
  const raw = content?.match(/<ui>([\s\S]*?)<\/ui>/)?.[1];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UiBlock;
  } catch {
    return null;
  }
}

/**
 * The visitor message a lead form was sent in place of an answer to, when the
 * form is the last thing the bot said. Answered on the turn after the form.
 */
export function heldQuestion(history: { role: string; content: string }[]): string | null {
  const last = history[history.length - 1];
  const before = history[history.length - 2];
  if (!last || last.role !== 'assistant' || !last.content.includes(AUTO_MARKER)) return null;
  return before?.role === 'user' ? before.content : null;
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

/**
 * What the visitor was actually asking about when the ask arrives.
 *
 * The ask is never "please give your number": it is "here is the one thing a
 * counsellor can do for you that I can't, where should it go?". That thing
 * depends on the conversation, so the topic picks the promise.
 */
export const LEAD_TOPICS = ['fees', 'scholarship', 'eligibility', 'hostel', 'placements', 'apply', 'visit', 'course'] as const;
export type LeadTopic = (typeof LEAD_TOPICS)[number];

const TOPIC_PATTERNS: Array<[LeadTopic, RegExp]> = [
  ['scholarship', /\b(scholarship|waiver|concession|discount|free seat|stipend|ews|bpl)\w*/i],
  ['fees', /\b(fee|cost|price|pricing|how much|expensive|afford|instal?ment|emi|tuition|budget)\w*/i],
  ['placements', /\b(placement|package|salary|lpa|recruit|company|companies|job|internship)\w*/i],
  ['hostel', /\b(hostel|room|mess|food|stay|accommodat|warden|residence)\w*|\bpg\b/i],
  ['apply', /\b(apply|applic|admission form|register|registration|enrol|seat|book my seat)\w*/i],
  ['eligibility', /\b(eligib|qualify|cut ?off|cutoff|rank|kcet|comedk|jee|neet|nata|kmat|pgcet|percentage|marks|criteria)\w*/i],
  ['visit', /\b(visit|campus tour|come to campus|see the campus|counsell?or|call me|callback|talk to)\w*/i],
  ['course', /\b(course|programme|program|branch|specialis|specializ|btech|mba|mca|bba|bca|pharmacy|nursing|design|architect)\w*|\bb\.?e\.?\b|\bb\.?com\b/i],
];

/**
 * The topic of the ask, from the visitor's own messages, newest first. Falls
 * back to `course` so the promise is always something concrete.
 */
export function detectLeadTopic(messages: string[]): LeadTopic {
  for (const text of messages) {
    if (!text) continue;
    for (const [topic, re] of TOPIC_PATTERNS) if (re.test(text)) return topic;
  }
  return 'course';
}

/**
 * Per topic: what the counsellor does that the bot cannot (`worth`), the line
 * that carries it, and the form's own words. `worth` is the value proposition
 * the ask is built on; nothing here promises a seat, a figure or a scholarship.
 */
const TOPIC_COPY: Record<LeadTopic, { worth: string[]; title: string; subtitle: string; submit: string }> = {
  fees: {
    worth: [
      'The fee depends on your quota, and Acharya does not publish the figures. A counsellor can check yours and send it in writing',
      'What you would actually pay changes with the quota you get in on, so a counsellor works out your exact figure and sends it across',
    ],
    title: 'The fee for your case',
    subtitle: 'A counsellor sends the exact fee for your quota, plus what else it covers.',
    submit: 'Send me my fee details',
  },
  scholarship: {
    worth: [
      'Whether you match a scholarship comes down to your rank band and category, and a counsellor can run that check for you today',
      'A counsellor can check which scholarships you may match and what they would take off your fee',
    ],
    title: 'Your scholarship check',
    subtitle: 'A counsellor checks the bands you may match and sends what it means for your fee.',
    submit: 'Check what I may match',
  },
  eligibility: {
    worth: [
      'A counsellor can confirm your eligibility against your marks and give you the route in, in writing',
      'Your route in depends on your marks and exam, and a counsellor confirms which one applies to you',
    ],
    title: 'Your eligibility, confirmed',
    subtitle: 'A counsellor checks your marks against the rule and sends your route in.',
    submit: 'Confirm my eligibility',
  },
  hostel: {
    worth: [
      'A counsellor can send you the hostel details with the charges, and hold a slot if you want to see the rooms',
      'Hostel charges are not published, so a counsellor sends those and can arrange a look at the rooms',
    ],
    title: 'Hostel details for you',
    subtitle: 'Rooms, what is included, charges, and a campus visit if you want one.',
    submit: 'Send me the details',
  },
  placements: {
    worth: [
      'A counsellor can send you the placement record for your branch, not the headline number',
      'Branch-wise placement figures come from the placement cell, and a counsellor can get yours sent over',
    ],
    title: 'Placements for your branch',
    subtitle: 'Recruiters, roles and the record for the course you are looking at.',
    submit: 'Send the placement report',
  },
  apply: {
    worth: [
      'A counsellor can take you through the application, check your documents before you submit, and tell you what happens after',
      'Before you apply, a counsellor checks your documents and eligibility so nothing comes back rejected',
    ],
    title: 'Start your application',
    subtitle: 'A counsellor checks your documents and walks you through the steps.',
    submit: 'Help me apply',
  },
  visit: {
    worth: [
      'A counsellor can call you at a time you pick and set up a campus visit',
      'To set up the call or the visit, the counsellor needs somewhere to reach you',
    ],
    title: 'Talk to a counsellor',
    subtitle: 'A call at a time that suits you, or a campus visit.',
    submit: 'Set it up',
  },
  course: {
    worth: [
      'A counsellor can go through your options properly and send you the details that apply to your case',
      'A counsellor can look at your marks and interests together and tell you which course actually fits',
    ],
    title: 'Your options, in writing',
    subtitle: 'A counsellor sends what fits you: the course, the route in and the next step.',
    submit: 'Send it to me',
  },
};

/**
 * The stored content of an auto lead message: one short line that says what
 * they get and why the bot cannot give it, then the form.
 *
 * The soft one is an offer with a "not now". The compulsory one says plainly
 * that this is where the chat needs a person, and still gives the reason.
 */
export function autoLeadMessage(kind: 'soft' | 'gate', known: KnownContact | null, topic: LeadTopic = 'course'): string {
  const fields = [...(known?.name ? [] : ['name']), 'phone'];
  const soft = kind === 'soft';
  const first = known?.name?.trim().split(/\s+/)[0];
  // Ask only for what is missing, and say so in the words.
  const what = first ? 'number' : 'name and number';
  const you = first ? `, ${first}` : '';
  const copy = TOPIC_COPY[topic] ?? TOPIC_COPY.course;
  const worth = pick(copy.worth);
  const line = soft
    ? pick([
        `${worth}. What ${what} should they use${you}?`,
        `${worth}. Where should that go${you}?`,
        `Here is the bit I can't do from here${you}: ${lower(worth)}. What ${what} works?`,
      ])
    : pick([
        `This is where it needs a person${you}. ${worth}, and for that they need your ${what}.`,
        `From here it is your case, not general information${you}. ${worth}. Leave your ${what} and they will take it from there.`,
      ]);
  const form = {
    type: 'form',
    icon: 'phone',
    title: copy.title,
    subtitle: copy.subtitle,
    fields,
    submit: soft ? copy.submit : 'Continue',
    // "Not now" is sent as their answer, so the message the form held back gets its reply.
    ...(soft ? { skip: 'Not now, keep chatting' } : { gate: true }),
    note: 'One counsellor, about this enquiry only. Say stop anytime and it ends.',
    auto: kind,
  };
  return `${line}\n\n<ui>${JSON.stringify(form)}</ui>`;
}

/** Lowercase the first word of a sentence when it is dropped mid-line. */
function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
