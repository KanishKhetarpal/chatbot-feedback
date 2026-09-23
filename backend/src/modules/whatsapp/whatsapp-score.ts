/**
 * How likely this person is to convert, out of 100.
 *
 * Every point comes from something that actually happened in the thread or in
 * the CRM: what they told us, what they asked for, how fast they answer, how
 * far their application has gone. Nothing is inferred by the model, so the
 * number is explainable: `signals` lists the reasons in the order they were
 * applied, and the admin page shows them.
 *
 * The score has two jobs:
 *   - the contacts list sorts and colours by it, so a counsellor works the hot
 *     leads first;
 *   - follow-up rules can be limited to a band, so a hot lead is chased
 *     harder and faster than a cold one.
 *
 * It is not a promise. A high score means "worth a counsellor's time today".
 */

export const SCORE_BANDS = ['hot', 'warm', 'cool', 'cold'] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

export interface ScoreSignal {
  label: string;
  points: number;
}

export interface LeadScore {
  score: number;
  band: ScoreBand;
  signals: ScoreSignal[];
}

/** Everything the scorer looks at. All of it is already stored. */
export interface ScoreInput {
  /** prospective | student | student_parent | alumni | recruiter | other | null */
  audience: string | null;
  stage: string;
  optedOut: boolean;
  /** Their messages, newest first, as plain text. */
  inbound: Array<{ body: string | null; createdAt: Date }>;
  outboundCount: number;
  lastInboundAt: Date | null;
  /** Follow-ups sent since their last reply: silence after a nudge is a signal. */
  followupCount: number;
  /** Did they read our last message without answering it? */
  lastOutboundRead: boolean;
  /** Facts the chat or the CRM filled in. */
  facts: {
    name?: string | null;
    courseInterest?: string | null;
    city?: string | null;
    educationLevel?: string | null;
    preferredCallTime?: string | null;
  };
  /** CRM lead status, application status and the application-fee state. */
  crmStatus?: string | null;
  applicationStatus?: string | null;
  applicationProgress?: string | null;
  /** 'paid' | 'started but pending' | 'not paid yet' | undefined */
  applicationFeeStatus?: string | null;
  /** A counsellor call or visit they asked for. */
  handoffReason?: string | null;
  now?: Date;
}

const DAY = 24 * 60 * 60 * 1000;

/** What they asked about, and what each intent is worth. */
const INTENT_SIGNALS: Array<[RegExp, number, string]> = [
  [/\b(apply|application|admission form|register|enrol|join|seat|admission process)\b/i, 14, 'Asked about applying'],
  [/\b(fee|fees|cost|how much|scholarship|waiver|instal?ment|emi)\b/i, 10, 'Asked about fees or scholarships'],
  [/\b(document|marks card|certificate|aadhaar|transcript|upload)\b/i, 8, 'Asked what documents are needed'],
  [/\b(visit|campus tour|come and see|meet|counsell?or|call me|call back)\b/i, 12, 'Asked for a call or a visit'],
  [/\b(eligib|cut ?off|cutoff|rank|kcet|comedk|jee|nata|kmat|pgcet|percentage|marks)\b/i, 8, 'Checked eligibility or gave marks'],
  [/\b(hostel|room|mess|transport|bus)\b/i, 5, 'Asked about living on campus'],
  [/\b(placement|package|recruit|salary|lpa|internship)\b/i, 5, 'Asked about placements'],
];

/** Things that say this one is going nowhere. */
const NEGATIVE_SIGNALS: Array<[RegExp, number, string]> = [
  [/\b(not interested|no longer interested|don'?t want|not looking|changed my mind)\b/i, -35, 'Said they are not interested'],
  [/\b(already (joined|admitted|taken admission)|joined (another|other)|going to another)\b/i, -40, 'Joined somewhere else'],
  [/\b(too (expensive|costly)|can'?t afford|out of (my )?budget)\b/i, -8, 'Called it unaffordable'],
  [/\b(wrong number|who is this|stop|don'?t message)\b/i, -25, 'Wrong number or asked us to stop'],
];

/** CRM statuses, and where they put a lead. */
const CRM_SIGNALS: Array<[RegExp, number, string]> = [
  [/^Application_Submitted$/i, 30, 'Application submitted in the CRM'],
  [/^(AUID_Created|Offer_\w+|Enrolled|Admitted)$/i, 32, 'Past the application in the CRM'],
  [/^Application_Initiated$/i, 24, 'Application started in the CRM'],
  [/^Course_Details_Filled$/i, 16, 'Course details filled in the CRM'],
  [/^(Warm|Prospect|Interested)$/i, 10, 'CRM has them as a warm lead'],
  [/^(Cold|Not_Answered)$/i, -12, 'CRM has them as cold'],
  [/^(Not_Interested|Junk|Invalid|Lost)$/i, -40, 'CRM has them as lost'],
];

function band(score: number): ScoreBand {
  if (score >= 70) return 'hot';
  if (score >= 45) return 'warm';
  if (score >= 25) return 'cool';
  return 'cold';
}

/**
 * Score a conversation. Starts at 10 (someone wrote in at all) and adds the
 * signals; the total is clamped to 0 to 100.
 */
export function scoreLead(input: ScoreInput): LeadScore {
  const now = input.now ?? new Date();
  const signals: ScoreSignal[] = [];
  const add = (label: string, points: number) => {
    if (points) signals.push({ label, points });
  };

  // Someone who is not joining is not a lead at all: served, never scored up.
  if (input.optedOut) return { score: 0, band: 'cold', signals: [{ label: 'Opted out of messages', points: 0 }] };
  if (input.audience && input.audience !== 'prospective') {
    return { score: 0, band: 'cold', signals: [{ label: `Not a prospective student (${input.audience})`, points: 0 }] };
  }

  add('Wrote in on WhatsApp', 10);

  // ── How much of a conversation this is ───────────────────────────────────
  const replies = input.inbound.length;
  if (replies >= 8) add(`${replies} messages from them`, 16);
  else if (replies >= 4) add(`${replies} messages from them`, 11);
  else if (replies >= 2) add(`${replies} messages from them`, 6);

  // ── What they told us: a lead a counsellor can actually work ─────────────
  if (input.facts.courseInterest) add('Told us their course', 10);
  if (input.facts.educationLevel) add('Gave marks, rank or stream', 9);
  if (input.facts.name) add('Gave their name', 4);
  if (input.facts.city) add('Gave their city', 3);
  if (input.facts.preferredCallTime) add('Picked a time for the call', 10);

  // ── What they asked for ──────────────────────────────────────────────────
  const text = input.inbound.map((m) => m.body ?? '').join('\n');
  for (const [re, points, label] of INTENT_SIGNALS) if (re.test(text)) add(label, points);
  for (const [re, points, label] of NEGATIVE_SIGNALS) if (re.test(text)) add(label, points);
  if (input.handoffReason === 'callback' || input.handoffReason === 'visit' || input.handoffReason === 'asked_for_human') {
    add('Asked to be put through to a counsellor', 12);
  }

  // ── The CRM and the application ──────────────────────────────────────────
  for (const [re, points, label] of CRM_SIGNALS) {
    if (input.crmStatus && re.test(input.crmStatus)) {
      add(label, points);
      break;
    }
  }
  if (input.applicationFeeStatus === 'paid') add('Application fee paid', 25);
  else if (input.applicationFeeStatus?.startsWith('started')) add('Application payment started, not finished', 14);
  else if (input.applicationStatus) add('Application open, fee not paid', 8);
  const progress = Number(input.applicationProgress?.match(/^(\d+)%/)?.[1] ?? NaN);
  if (Number.isFinite(progress) && progress >= 50) add(`Application ${progress}% filled`, 6);

  // ── How warm it is right now ─────────────────────────────────────────────
  const quietFor = input.lastInboundAt ? now.getTime() - input.lastInboundAt.getTime() : Infinity;
  if (quietFor < 2 * 60 * 60 * 1000) add('Talking to us right now', 12);
  else if (quietFor < DAY) add('Replied today', 8);
  else if (quietFor < 3 * DAY) add('Replied in the last three days', 3);
  else if (quietFor > 21 * DAY) add('Quiet for three weeks', -18);
  else if (quietFor > 7 * DAY) add('Quiet for over a week', -10);

  if (input.followupCount >= 3) add(`Ignored ${input.followupCount} follow-ups`, -14);
  else if (input.followupCount === 2) add('Ignored two follow-ups', -8);
  else if (input.followupCount === 1 && input.lastOutboundRead) add('Read the follow-up, did not reply', -4);

  const total = Math.max(0, Math.min(100, signals.reduce((sum, s) => sum + s.points, 0)));
  return { score: total, band: band(total), signals };
}

/** One line for the contacts list and the rule editor. */
export function bandLabel(value: ScoreBand): string {
  return { hot: 'Hot', warm: 'Warm', cool: 'Cool', cold: 'Cold' }[value];
}
