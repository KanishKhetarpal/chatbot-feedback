import type { HandoffReason } from './whatsapp-render';
import { department } from './whatsapp-departments';
import type { OutboundMessage, WaOption } from './whatsapp.types';
import { composeInteractive } from './whatsapp-render';

/**
 * The part of the bot that never calls the model.
 *
 * Some turns must be exact, instant and free: a STOP must stop, a fee question
 * must reach a counsellor every single time (not whenever the model remembers
 * to), and a tap on "Call me back" must offer slots. Those are decided here from
 * the text and the tapped option id. Everything else goes to the AI turn.
 */

export type Decision =
  | { type: 'opt_out' }
  | { type: 'opt_in' }
  | { type: 'welcome' }
  | { type: 'menu' }
  | { type: 'apply' }
  | { type: 'handoff_start'; reason: HandoffReason }
  | { type: 'handoff_call' }
  | { type: 'handoff_slot'; slot: string }
  | { type: 'handoff_chat' }
  | { type: 'snooze' }
  | { type: 'more' }
  | { type: 'audience'; audience: 'prospective' | 'student' | 'other' }
  | { type: 'dept_handoff'; dept: string }
  | { type: 'dept_pass' }
  | { type: 'course'; course: string }
  | { type: 'unclear' }
  | { type: 'restart' }
  | { type: 'style_note'; note: string }
  | { type: 'paused' }
  | { type: 'ignore' }
  | { type: 'ai'; message: string };

/** Money questions. A counsellor gives the exact figure; the bot never quotes one. */
const FEE_RE =
  /\b(fees?|fee structure|tuition|cost(s|ing)?|price|pricing|how much|charges?|donation|capitation|installments?|instalments?|emi|payment plan|pay(ment)? in parts|refund|package cost|hostel fee|total amount|kitna|kitni|paisa|paise|rupees?)\b/i;
const HUMAN_RE =
  /\b(talk|speak|connect|chat)\b.{0,20}\b(human|person|someone|counsell?or|agent|staff|executive|team)\b|\b(call me|callback|call back|real person)\b/i;
/** Money already paid or owed: a current student's accounts question, not a price enquiry. */
const PAID_RE = /\b(paid|receipt|dues|due amount|pending fee|fee payment|payment failed|transaction|challan)\b/i;
/**
 * The application (or registration) fee specifically, which is not the course
 * fee: when the CRM holds their figure, Tara answers it herself instead of
 * sending them to a counsellor for a number we already have.
 */
const APPLICATION_FEE_RE =
  /\b(application|registration|form|apply\w*)\s*(fee|fees|charge|charges|amount|cost|payment)\b|\b(fee|fees|charges?|amount|payment)\s+(for|to)\s+(the\s+)?(application|apply\w*|register\w*|registration|form)\b/i;
/**
 * Pushing back on cost ("too high", "can't afford") with no programme named.
 * Right after Tara has asked for the application fee this is about THAT fee,
 * not tuition, and sending it to a counsellor answers a question they did not
 * ask. She handles it herself and still hands off for any figure she may not
 * give (her own rules make her).
 */
const COST_PUSHBACK_RE =
  /\b(too (high|much|expensive|costly)|can'?t afford|cannot afford|not affordable|out of (my |our )?budget|bahut (zyada|mehnga)|mehnga|costly)\b/i;
const CALL_RE = /\b(call me|call back|callback|give me a call|phone me|ring me)\b/i;
const STOP_RE = /^\s*(stop|unsubscribe|stop messages|stop all|opt out|optout|don'?t message( me)?|band karo)\s*[.!]*\s*$/i;
const START_RE = /^\s*(start|resume|unstop|subscribe)\s*[.!]*\s*$/i;
const GREETING_RE = /^\s*(hi+|hii+|hello+|hey+|hlo|helo|namaste|namaskar|good (morning|afternoon|evening)|menu|main menu|options|help|start over)\s*[.!]*\s*$/i;

export const CALL_SLOTS: WaOption[] = [
  { id: 'slot:within_hour', title: 'In the next hour' },
  { id: 'slot:today_evening', title: 'Today, 4 to 7 pm' },
  { id: 'slot:tomorrow_morning', title: 'Tomorrow morning' },
];

/** Three buttons. Everything else (hostel, placements, scholarships, visits) they can just type. */
export const MAIN_MENU: WaOption[] = [
  { id: 'menu:courses', title: 'Explore courses' },
  { id: 'menu:eligibility', title: 'Check eligibility' },
  { id: 'handoff:ask', title: 'Talk to counsellor' },
];

/** What a menu row asks the AI, in the person's voice. */
const MENU_QUESTIONS: Record<string, string> = {
  'menu:courses': 'What courses do you offer?',
  'menu:eligibility': 'Can you check if I am eligible?',
  'menu:hostel': 'Tell me about the hostel and campus life.',
  'menu:placements': 'How are the placements?',
  'menu:scholarships': 'What scholarships could I get?',
};

export function isOptOut(text: string | null): boolean {
  return !!text && STOP_RE.test(text);
}

/**
 * Decide the turn.
 *
 * @param text what they typed, or the title of what they tapped
 * @param optionId the tapped option id (or the one a typed number resolved to)
 * @param firstContact true when the bot has never replied to this person
 * @param paused a counsellor owns the thread
 */
export function route(input: {
  text: string | null;
  optionId: string | null;
  firstContact: boolean;
  paused: boolean;
  optedOut: boolean;
  coach?: boolean;
  /** Who is chatting, when known (prospective | student | parent | alumni | recruiter | other). */
  audience?: string | null;
  /** Our template is the only thing we have sent: this is their first answer to it. */
  afterTemplateOnly?: boolean;
  /** The CRM holds an application-fee figure for this person, so Tara may state it. */
  applicationFeeKnown?: boolean;
}): Decision {
  const text = (input.text ?? '').trim();
  const id = input.optionId ?? '';

  // The owner testing from WhatsApp: "start over" wipes the thread and Tara opens again.
  if (input.coach && /^\s*(start over|restart|reset|start again)(\s+from\s+(0|zero|scratch))?\s*[.!]*\s*$/i.test(text)) {
    return { type: 'restart' };
  }

  // The owner coaching the bot from WhatsApp: "feedback: shorter replies".
  const coached = input.coach ? text.match(/^\s*(?:feedback|fb|note|style|coach|tip)\s*[:\-]\s*([\s\S]+)$/i) : null;
  if (coached) return { type: 'style_note', note: coached[1].trim() };

  if (isOptOut(text)) return { type: 'opt_out' };
  if (START_RE.test(text)) return input.optedOut ? { type: 'opt_in' } : { type: 'welcome' };
  if (input.optedOut) return { type: 'ignore' };

  // A counsellor owns the thread: the bot stays out of it. "menu" hands it back.
  if (input.paused) return /^\s*(menu|bot)\s*$/i.test(text) ? { type: 'menu' } : { type: 'paused' };

  // Taps first: an id is an exact instruction.
  if (id === 'handoff:call') return { type: 'handoff_call' };
  if (id === 'handoff:chat') return { type: 'handoff_chat' };
  if (id.startsWith('more:')) return { type: 'more' };
  if (id === 'aud:prospective' || id === 'aud:student' || id === 'aud:other') {
    // 'aud:prospective' = "Joining Acharya": the bot asks what they want to study next.
    return { type: 'audience', audience: id.slice(4) as 'prospective' | 'student' | 'other' };
  }
  if (id === 'dept:pass') return { type: 'dept_pass' };
  if (id === 'course:Something else') return { type: 'ai', message: "I'm looking at a different course." };
  if (id.startsWith('course:')) return { type: 'course', course: id.slice(7) };
  if (id.startsWith('dept:')) return { type: 'dept_handoff', dept: id.slice(5) };
  if (STUDENT_QUESTIONS[id]) return { type: 'ai', message: STUDENT_QUESTIONS[id] };
  if (id === 'handoff:continue') return { type: 'menu' };
  // The first tap on an opening template: introduce the bot, then the menu.
  if (id === 'menu:open') return { type: 'welcome' };
  if (id === 'handoff:ask') return { type: 'handoff_start', reason: 'asked_for_human' };
  if (id === 'handoff:fees') return { type: 'handoff_start', reason: 'fees' };
  if (id === 'optout:template') return { type: 'opt_out' };
  if (id === 'later:snooze') return { type: 'snooze' };
  if (id.startsWith('slot:')) return { type: 'handoff_slot', slot: CALL_SLOTS.find((s) => s.id === id)?.title ?? text };
  if (id === 'menu:apply') return { type: 'apply' };
  if (id === 'menu:visit') return { type: 'handoff_start', reason: 'visit' };
  if (MENU_QUESTIONS[id]) return { type: 'ai', message: MENU_QUESTIONS[id] };

  if (!text) return input.firstContact ? { type: 'welcome' } : { type: 'ignore' };
  if (isUnclear(text)) return { type: 'unclear' };
  const slot = CALL_SLOTS.find((s) => s.title.toLowerCase() === text.toLowerCase());
  if (slot) return { type: 'handoff_slot', slot: slot.title };
  // A cost objection while their application fee is on the table: hers to answer.
  if (COST_PUSHBACK_RE.test(text) && input.applicationFeeKnown && !isEnrolled(input.audience)) return { type: 'ai', message: text };
  // Their own application fee, when the CRM gives us the figure: Tara answers it
  // herself rather than sending them to a counsellor for a number we hold.
  if (APPLICATION_FEE_RE.test(text) && input.applicationFeeKnown && !isEnrolled(input.audience)) return { type: 'ai', message: text };
  // A current student's fee question is about paying, not the price: student affairs, not admissions.
  // Someone still joining is talking about their own application payment, which is Tara's job.
  if (PAID_RE.test(text) && input.audience !== 'prospective') {
    return { type: 'dept_handoff', dept: 'student_affairs' };
  }
  if (FEE_RE.test(text)) {
    return isEnrolled(input.audience) ? { type: 'dept_handoff', dept: 'student_affairs' } : { type: 'handoff_start', reason: 'fees' };
  }
  // They already said HOW ("call me"): straight to the time, don't ask again.
  if (CALL_RE.test(text) && !isEnrolled(input.audience)) return { type: 'handoff_call' };
  if (HUMAN_RE.test(text)) {
    return isEnrolled(input.audience) ? { type: 'dept_handoff', dept: 'student_affairs' } : { type: 'handoff_start', reason: 'asked_for_human' };
  }
  // "Sure", "ok", "yes", "noted" typed back to our template: open the conversation properly.
  if (input.afterTemplateOnly && text.split(/\s+/).length <= 4 && !/\?/.test(text)) return { type: 'welcome' };
  if (GREETING_RE.test(text)) return input.firstContact ? { type: 'welcome' } : { type: 'menu' };
  if (input.firstContact && text.length < 4) return { type: 'welcome' };

  return { type: 'ai', message: text };
}

/** Short words people really send, which must not be mistaken for noise. */
const SHORT_WORDS = new Set(['ok', 'okay', 'k', 'kk', 'yes', 'no', 'ya', 'yeah', 'haan', 'ha', 'na', 'nahi', 'hi', 'hii', 'hey', 'cse', 'ece', 'eee', 'ise', 'mba', 'mca', 'bba', 'bca', 'bcom', 'ai', 'ml', 'mech', 'civil', 'law', 'mbbs', 'bsc', 'msc', 'why', 'how', 'what', 'when', 'where', 'fee', 'fees', 'thanks', 'thx', 'ty', 'bye']);

/**
 * "??", "...", "asdf", "hmm": nothing to answer. The model comments on these
 * ("looks like that didn't send right"), so they never reach it.
 */
export function isUnclear(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (!/[\p{L}\p{N}]/u.test(t)) return true; // only punctuation or symbols
  if (/^(h+m+|u+m+|a+h+|o+|a+)$/.test(t)) return true;
  if (t.length <= 5 && /^[a-z]+$/.test(t) && !SHORT_WORDS.has(t)) {
    // A keyboard mash has no vowel pattern a word would; "asdf", "qwer", "jkl".
    return /^(asdf|qwer|zxcv|jkl|sdf|dfg|fgh|ghj|hjk|xyz|abc|test)/.test(t) || !/[aeiou]/.test(t);
  }
  return false;
}

export function unclearMessages(pending: WaOption[]): OutboundMessage[] {
  if (pending.length) return composeInteractive("Sorry, I didn't get that. Tap one, or type your question:", pending);
  return [{ kind: 'text', body: "Sorry, I didn't get that. What would you like to know?" }];
}

/** Already at Acharya (or connected to it): served, never sold to. */
export function isEnrolled(audience: string | null | undefined): boolean {
  // 'parent' alone is ambiguous (most parents who write are asking about admission): not enrolled.
  return audience === 'student' || audience === 'student_parent' || audience === 'alumni';
}

/** Student-menu taps, asked of the AI in the student's voice. */
const STUDENT_QUESTIONS: Record<string, string> = {
  'st:exams': "I'm a current student. Where do I find exam dates, timetables and results?",
  'st:campus': "I'm a current student with a question about the hostel or college buses.",
  'st:certificates': "I'm a current student and I need a certificate (bonafide, transfer or similar).",
  'st:placements': "I'm a current student. How do placements and internships work?",
  'st:complaint': "I'm a current student and I want to raise a complaint.",
};

/** A typed "2" (or "2." / "option 2") resolves to the second option last shown. */
export function resolveNumbered(text: string | null, pending: WaOption[]): WaOption | null {
  const m = (text ?? '').trim().match(/^(?:option\s*)?(\d{1,2})\s*[.)]?$/i);
  if (!m) return null;
  return pending[Number(m[1]) - 1] ?? null;
}

/** A typed reply that is exactly an option's title counts as tapping it. */
export function resolveByTitle(text: string | null, pending: WaOption[]): WaOption | null {
  const t = (text ?? '').trim().toLowerCase();
  if (!t) return null;
  return pending.find((o) => o.title.toLowerCase() === t) ?? null;
}

/**
 * What a template's quick-reply button means to the bot, read from its label.
 * WhatsApp hands back the label when it is tapped, so the label is the contract.
 */
export function templateButtonId(title: string): string {
  const t = title.toLowerCase();
  if (/not interested|no thanks|unsubscribe|stop/.test(t)) return 'optout:template';
  if (/later|not now|busy/.test(t)) return 'later:snooze';
  if (/counsel|call|talk|speak|support|help/.test(t)) return 'handoff:ask';
  if (/fee|cost/.test(t)) return 'handoff:fees';
  if (/apply|enrol|i'?ll do it/.test(t)) return 'menu:apply';
  if (/visit|tour/.test(t)) return 'menu:visit';
  if (/course|program/.test(t)) return 'menu:courses';
  if (/eligib/.test(t)) return 'menu:eligibility';
  if (/hostel|campus/.test(t)) return 'menu:hostel';
  if (/scholar/.test(t)) return 'menu:scholarships';
  if (/placement|job/.test(t)) return 'menu:placements';
  return 'menu:open';
}

export const SNOOZE_TEXT =
  "No problem. Whenever you're ready, just reply here: I can check your eligibility, show you the hostels, or get a counsellor to call.";

// ── Scripted replies ────────────────────────────────────────────────────────

const firstName = (name: string | null) => {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}][\p{L}'.-]{1,30}$/u.test(first) ? first : '';
};

/**
 * Someone wrote to the number first. Open like a counsellor: who we are in five
 * words, then one easy question. Most people who write in are thinking of
 * joining, so the question is about that; a current student taps the third
 * button or just says so.
 */
export function audienceMessages(name: string | null): OutboundMessage[] {
  const hi = firstName(name) ? `Hi ${firstName(name)}` : 'Hi';
  return composeInteractive(`${hi}, Tara here from Acharya.\nWhat can I help you with? Ask me anything, or tap one.`, [
    { id: 'aud:prospective', title: 'Joining Acharya' },
    { id: 'aud:student', title: 'I study here' },
    { id: 'aud:other', title: 'Something else' },
  ]);
}

/**
 * Our template opened the chat and they just answered it. The bot's first real
 * message: said by the AI so it can use what the lead enquired about.
 */
export function openerInstruction(reply: string, course: string | null): string {
  return [
    `[CONVERSATION START. ${course ? `They enquired about ${course}.` : ''} Their reply so far: "${reply}".`,
    'Write your first real message the way a good counsellor texts a lead they are calling back: warm, personal, short.',
    'Line 1: "Hi <their first name if the KNOWN block has it>, this is Tara from Acharya."',
    course
      ? `Line 2: pick up their enquiry in plain words and ask ONE easy question about it, e.g. "You'd asked about ${course}. Are you applying this year?"`
      : 'Line 2: ask ONE easy question about what they are looking for, e.g. "What are you hoping to study?"',
    'Nothing else: no list of branches or facts, no menu, no "thanks for your interest", no "I can help you with". Two lines total. Give 2 or 3 buttons only if the question has obvious short answers.]',
  ].join(' ');
}

export function studentMenuMessages(): OutboundMessage[] {
  return composeInteractive("What's it about? Tap one, or just type your question.", [
    { id: 'st:exams', title: 'Exams and results' },
    { id: 'st:campus', title: 'Hostel or bus' },
    { id: 'st:certificates', title: 'Certificates' },
    { id: 'dept:student_affairs', title: 'Fee payments' },
    { id: 'st:placements', title: 'Placements' },
    { id: 'st:complaint', title: 'Raise a complaint' },
  ]);
}

export const OTHER_TEXT =
  'Parents, alumni, recruiters and visitors all write here too. What can I help you with?';

export function deptHandoffMessages(key: string, lead = ''): OutboundMessage[] {
  const d = department(key);
  return composeInteractive(
    `${lead ? `${lead}\n\n*${d.label}*: ${d.contact}` : `The *${d.label}* handles that: ${d.contact}.`}\n\nShall I send them your request with your number, so they get back to you?`,
    [
      { id: 'dept:pass', title: 'Pass it on' },
      { id: 'handoff:continue', title: 'Keep chatting' },
    ],
  );
}

export function deptPassedMessages(key: string): OutboundMessage[] {
  const d = department(key);
  return [
    {
      kind: 'text',
      body: `Sent to the *${d.label}* with your number. They usually reply within a working day, here or by phone.`,
    },
  ];
}

export function welcomeMessages(name: string | null): OutboundMessage[] {
  const hi = firstName(name) ? `Hi ${firstName(name)}` : 'Hi';
  return composeInteractive(
    `${hi}, I'm Tara from Acharya.\n\nAsk me anything: courses, eligibility, hostels, placements. Or tap one to start.`,
    MAIN_MENU,
  );
}

export function menuMessages(): OutboundMessage[] {
  return composeInteractive('Ask me anything, or tap one of these:', MAIN_MENU);
}

const HANDOFF_OPENERS: Record<HandoffReason, string> = {
  fees:
    'Fees at Acharya depend on the programme and your admission quota (KCET, COMEDK or management), and hostel is separate. So a counsellor gives you the *exact figure for your case* instead of a guess.\n\nHow would you like it?',
  out_of_scope: "That one needs a counsellor to answer properly, and I would rather get it right than guess.\n\nHow would you like to reach them?",
  asked_for_human: 'A counsellor can take it from here.\n\nHow would you like to talk?',
  complaint: "I'm sorry about that. A senior counsellor should hear this directly.\n\nHow would you like them to reach you?",
  visit:
    'A counsellor can show you around: the hostels, the labs and your department.\n\nWant them to call you to fix a day, or chat here?',
  callback: 'Happy to set that up.\n\nHow would you like the counsellor to reach you?',
  department: 'A person from the right office should take this.\n\nHow would you like them to reach you?',
};

export function handoffStartMessages(reason: HandoffReason): OutboundMessage[] {
  return composeInteractive(HANDOFF_OPENERS[reason], [
    { id: 'handoff:call', title: 'Call me back' },
    { id: 'handoff:chat', title: 'Chat here' },
    { id: 'handoff:continue', title: 'Keep exploring' },
  ]);
}

export function slotMessages(): OutboundMessage[] {
  return composeInteractive('When suits you for the call?', CALL_SLOTS);
}

export function slotConfirmMessages(slot: string, waId: string): OutboundMessage[] {
  const masked = `+${waId.slice(0, waId.length - 10)} ••••• ${waId.slice(-5)}`;
  return [
    {
      kind: 'text',
      body: `Done. A counsellor will call you on ${masked}, *${slot.toLowerCase()}*.\n\nIf anything else comes up before then, just message here.`,
    },
  ];
}

export function chatHandoffMessages(): OutboundMessage[] {
  return [
    {
      kind: 'text',
      body:
        'A counsellor will reply right here in this chat.\n\nType *menu* any time to come back to me.',
    },
  ];
}

export function applyMessages(): OutboundMessage[] {
  return composeInteractive(
    'You can apply online in about 10 minutes: https://admissions.acharya.global/\n\nKeep your 10th and 12th marks cards handy. A counsellor checks eligibility and walks you through the documents after you apply.\n\nWant a counsellor to help you through it?',
    [
      { id: 'handoff:call', title: 'Yes, call me' },
      { id: 'menu:eligibility', title: 'Check eligibility' },
    ],
  );
}

export const OPT_OUT_TEXT =
  "Done, you won't get any more messages from us. If you change your mind, just send *START*.";
export const OPT_IN_TEXT = "Welcome back. You'll hear from us again.";
