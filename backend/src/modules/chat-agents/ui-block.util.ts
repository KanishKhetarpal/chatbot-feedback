import { z } from 'zod/v4';
import { isAllowedLink, MEDIA_LIBRARY } from './media-library';

/**
 * Everything a bot may attach to a reply besides its text.
 *
 *   <ui>{…}</ui>              one interactive element (chips, select, card, guide, form)
 *   <media>["key",…]</media>  up to three campus photos, by library key
 *   <next>["…","…"]</next>    2–4 suggested follow-up questions (the conversation never dead-ends)
 *   <then>…</then>            a short second message, shown as its own bubble after everything else
 *   <plan>{card}</plan>       a checklist pinned under the chat header (replaces the previous one)
 *
 * The server validates each, repairs harmless overflows, drops anything
 * broken, strips emoji and spaced dashes from everything the visitor will
 * read, and stores the result in canonical form at the end of the message.
 * The widget splits it back apart. Keeping it inside the message content means
 * a reloaded thread redraws it and the model sees in its own history exactly
 * what it showed last turn.
 */

export const UI_TAG = 'ui';

/** Icons a card row, a bullet or a form may name. Mirrored by the widget. */
export const ICON_NAMES = [
  'home', 'bed', 'food', 'shield', 'wifi', 'bus', 'book', 'flask', 'briefcase', 'trophy', 'users',
  'graduation', 'rupee', 'calendar', 'clock', 'phone', 'video', 'map', 'check', 'star', 'file', 'heart',
  'info', 'building', 'award', 'target', 'mail', 'whatsapp',
] as const;

const short = (max: number) => z.string().trim().min(1).max(max);
const Icon = z.enum(ICON_NAMES);

// step 0 is legitimate: a freshly built plan has nothing done yet. With min(1)
// every starting <plan> failed validation and was silently dropped.
const Progress = z.object({ step: z.number().int().min(0).max(20), total: z.number().int().min(1).max(20) });

const ChipsBlock = z.object({
  type: z.literal('chips'),
  prompt: short(80).optional(),
  options: z.array(short(60)).min(2).max(8),
  multi: z.boolean().optional(),
  submit: short(40).optional(),
  /** Multi-select only: the exclusive "none of these" answer. The widget always offers one. */
  none: short(40).optional(),
  progress: Progress.optional(),
});

const SelectBlock = z.object({
  type: z.literal('select'),
  title: short(80).optional(),
  fields: z
    .array(z.object({ label: short(40), options: z.array(short(60)).min(2).max(12) }))
    .min(1)
    .max(4),
  submit: short(40).optional(),
  /** A "skip this" button that sends this label back. */
  skip: short(40).optional(),
  progress: Progress.optional(),
});

const CardItem = z.object({
  label: short(60),
  value: short(160).optional(),
  status: z.enum(['ok', 'warn', 'no', 'info']).optional(),
  icon: Icon.optional(),
});

const Link = z.object({ label: short(40), url: z.string().url().refine(isAllowedLink, 'link must be an Acharya site') });

const CardBlock = z.object({
  type: z.literal('card'),
  variant: z.enum(['result', 'profile', 'summary', 'story', 'checklist', 'compare', 'stats', 'booking']).optional(),
  title: short(90),
  subtitle: short(160).optional(),
  badge: short(40).optional(),
  items: z.array(CardItem).max(10).optional(),
  table: z
    .object({
      columns: z.array(z.string().trim().max(40)).min(2).max(5),
      rows: z.array(z.array(z.string().trim().max(80)).min(2).max(5)).min(1).max(8),
    })
    .optional(),
  quote: short(300).optional(),
  footer: short(200).optional(),
  actions: z.array(short(60)).max(4).optional(),
  links: z.array(Link).max(3).optional(),
  progress: Progress.optional(),
});

/** A short ranked list: best matches, top picks. Deliberately sparse so it reads at a glance. */
const FitsBlock = z.object({
  type: z.literal('fits'),
  title: short(80),
  subtitle: short(120).optional(),
  items: z
    .array(
      z.object({
        name: short(60),
        match: z.number().int().min(0).max(100).optional(),
        why: short(90).optional(),
        icon: Icon.optional(),
      }),
    )
    .min(1)
    .max(4),
  actions: z.array(short(60)).max(4).optional(),
});

const GuideBlock = z.object({
  type: z.literal('guide'),
  title: short(90),
  for: short(60).optional(),
  subtitle: short(160).optional(),
  sections: z
    .array(z.object({ heading: short(80), body: z.string().trim().min(1).max(1600) }))
    .min(2)
    .max(8),
  locked: z.boolean().optional(),
  unlockLabel: short(40).optional(),
});

const FormBlock = z.object({
  type: z.literal('form'),
  title: short(90),
  subtitle: short(160).optional(),
  fields: z.array(z.enum(['name', 'phone', 'email', 'slot', 'relation', 'visitDay'])).max(6),
  /** Extra dropdowns of the bot's own (programme, route, marks…). */
  selects: z
    .array(z.object({ label: short(40), options: z.array(short(60)).min(2).max(12) }))
    .max(4)
    .optional(),
  slots: z.array(short(48)).max(8).optional(),
  visitDays: z.array(short(40)).max(6).optional(),
  submit: short(40).optional(),
  note: short(160).optional(),
  icon: Icon.optional(),
  /** A gate: the chat cannot continue (no typing) until this form is submitted. */
  gate: z.boolean().optional(),
  /**
   * Rule-based bots: submit without calling the AI. The lead is saved, `done`
   * is shown as the bot's reply ({name} = the visitor's first name) and the
   * scripted menu comes back.
   */
  local: z.boolean().optional(),
  done: short(400).optional(),
  /** A "not now" button: the visitor can carry on without filling it in. */
  skip: short(40).optional(),
  /** "Not now" just closes the form (the composer opens) instead of sending a message. */
  quietSkip: z.boolean().optional(),
  /** Set on forms the server adds itself (lead-flow.util.ts). */
  auto: z.enum(['soft', 'gate']).optional(),
});

export const UiBlockSchema = z.discriminatedUnion('type', [ChipsBlock, SelectBlock, CardBlock, FitsBlock, GuideBlock, FormBlock]);
export type UiBlock = z.infer<typeof UiBlockSchema>;

/** The pinned plan is a checklist card. */
export const PlanSchema = CardBlock;
export type PlanBlock = z.infer<typeof PlanSchema>;

const NextSchema = z.array(short(70)).min(1).max(4);

export interface MediaOut {
  url: string;
  caption: string;
}

export interface ReplyParts {
  text: string;
  ui: UiBlock | null;
  media: MediaOut[];
  next: string[];
  then: string;
  plan: PlanBlock | null;
  rejected: boolean;
  reason?: string;
  /** Sentences dropped for claiming something the knowledge does not say. */
  claimsRemoved: string[];
}

// ── Visitor-facing text hygiene ──────────────────────────────────────────────

const EMOJI_RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D\p{Extended_Pictographic})*|\uFE0F/gu;

/**
 * No emoji, and no spaced dashes used as punctuation ("Entrance route — KCET").
 * Unspaced en dashes in ranges ("4–6 pm", "2026–27") are kept.
 */
export function cleanVisible(text: string): string {
  return text
    .replace(EMOJI_RE, '')
    .replace(/[ \t]+[—–][ \t]+/g, ', ')
    .replace(/—/g, ', ')
    .replace(/ ,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n');
}

function cleanDeep<T>(value: T): T {
  if (typeof value === 'string') return cleanVisible(value).trim() as T;
  if (Array.isArray(value)) return value.map(cleanDeep) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'url' ? v : cleanDeep(v);
    return out as T;
  }
  return value;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Validate, repairing the harmless overflows a model produces (a badge three
 * characters too long, a ninth chip) by trimming them rather than throwing the
 * whole element away. Structural problems still fail.
 */
function parseLenient<T>(schema: z.ZodType<T>, input: unknown) {
  let value = input;
  for (let attempt = 0; attempt < 12; attempt++) {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed;
    const fixable = parsed.error.issues.filter((i) => i.code === 'too_big');
    if (fixable.length !== parsed.error.issues.length) return parsed;
    value = structuredClone(value);
    for (const issue of fixable) {
      const max = Number((issue as { maximum?: number | bigint }).maximum);
      const parentPath = issue.path.slice(0, -1);
      const key = issue.path[issue.path.length - 1];
      let parent: any = value;
      for (const k of parentPath) parent = parent?.[k as keyof typeof parent];
      const current = parent?.[key as keyof typeof parent];
      if (typeof current === 'string') parent[key as any] = current.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
      else if (Array.isArray(current)) parent[key as any] = current.slice(0, max);
      else return parsed;
    }
  }
  return schema.safeParse(value);
}

/** Drop a question that ends the text: the last sentence of the last paragraph, if it asks one. */
function withoutClosingQuestion(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  const last = paragraphs[paragraphs.length - 1] ?? '';
  if (!/\?\s*$/.test(last) || /^\s*[-*•]|^\s*\[[a-z]+\]/im.test(last.split('\n').pop() ?? '')) return text;
  const sentences = last.trim().split(/(?<=[.!])\s+/);
  sentences.pop();
  const kept = sentences.join(' ').trim();
  const rest = paragraphs.slice(0, -1);
  if (kept) rest.push(kept);
  // Never empty the answer entirely.
  return rest.length ? rest.join('\n\n').trim() : text;
}

const DEFAULT_TITLES: Record<string, string> = {
  card: 'Summary',
  fits: 'Your top picks',
  guide: 'Your Acharya guide',
  form: 'Your details',
};

/** A missing title is not worth losing the whole element over. */
function withDefaultTitle(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const block = value as { type?: string; title?: unknown };
  if (block.type && DEFAULT_TITLES[block.type] && (typeof block.title !== 'string' || !block.title.trim())) {
    return { ...block, title: DEFAULT_TITLES[block.type] };
  }
  return value;
}

const tagRe = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
const openTagRe = (tag: string) => new RegExp(`<${tag}>[\\s\\S]*$`, 'i');

/** Split a raw model reply into visible text and its validated attachments. */
/**
 * Openers the owner has banned ("Good move,", "Great question!", "Sure,").
 *
 * Both personas forbid them and both models still slip now and then, so they
 * are cut here as well as asked for in the prompt. Removing a leading
 * interjection cannot change what the sentence says, which is why this one
 * thing is fixed in code while every other style rule stays in the prompt.
 */
const FILLER_OPENER =
  /^(?:(?:good|great|nice|lovely|awesome|perfect|excellent|wonderful|sure|absolutely|certainly|definitely|of course|fair|no worries|got it|noted|okay|ok|alright|understood|cool|makes sense|that'?s fine|that'?s okay|that'?s great|good to know|nice to know|fair enough|fair point|no problem|fine|all right|right|glad you asked|thanks for asking)(?:\s+(?:pick|choice|question|one|call|field|stuff|then|move|news|idea|plan|start|point|thinking|area|subject|branch|goal|shout|spot|to know))?(?:\s+to\s+[a-z]{2,12})?(?:,?\s+(?:that'?s|it'?s) (?:fine|okay|ok|great)(?: at this stage| for now)?)?(?:\s*[,.!:;]+\s*|\s+[-–—]+\s+))+/i;

export function stripFillerOpener(text: string): string {
  const cut = text.replace(FILLER_OPENER, '');
  if (cut === text || cut.trim().length < 12) return text;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/**
 * Claims about demand, popularity or scarcity that the knowledge never makes.
 *
 * "CSE is a strong pick, high demand and solid placement record" reads like a
 * fact and is not one: nothing in the knowledge base ranks a branch or says how
 * fast seats go. The owner has banned these outright, the prompt bans them by
 * example, and both models still write one occasionally, so they are also cut
 * here.
 */
const UNSUPPORTED_CLAIM = new RegExp(
  [
    // demand and popularity
    'most sought[- ]after',
    'sought[- ]after',
    '(?:most|very|highly) popular',
    '(?:high|highest|higher|huge|great|most|strong|strongest|growing|rising)\\s+demand',
    '(?:most |highly |very )?in[- ]demand',
    'demand is (?:high|highest|huge|growing|rising)',
    'most enquir\\w+',
    'most preferred',
    'highly preferred',
    'everyone wants',
    'hot fav(?:ou)?rite',
    // scarcity
    'fills? up fast(?:est)?',
    'fill(?:ing|s)? (?:up )?(?:fast|quickly|first)',
    'going fast',
    'limited seats?',
    'seats? are filling',
    'seats? (?:go|get taken) (?:fast|quickly)',
    // ranking. "the best branch FOR YOU" is a fit, not a ranking, and stays.
    '(?:the )?(?:best|top|number one) branch(?!\\s+(?:for|to suit))',
  ].join('|'),
  'i',
);

/**
 * Saying a claim is not something we can make is the behaviour we want, not a
 * claim: "I don't have data on which branch fills up fastest" keeps its words.
 * Only a denial that comes BEFORE the phrase counts, so "CSE is in high demand,
 * though I have no figures" is still cut.
 */
const DENIAL =
  /(don'?t|do not|doesn'?t|does not|didn'?t|cannot|can'?t|won'?t|isn'?t|is not|aren'?t|are not|no|not|never|without|unable)/i;

/** A fragment that cannot stand as a sentence once its neighbours are gone. */
const DANGLING_START = /^(and|or|but|also|plus|with|under|at|in|on|for|from|which|that|so|then|because|since|as|especially|though|although)\b/i;
const HAS_VERB =
  /\b(is|are|was|were|has|have|had|can|could|will|would|offers?|gives?|runs?|covers?|includes?|holds?|takes?|comes?|sits?|starts?|needs?|accepts?|decides?|confirms?|sends?|works?|means?)\b/i;

/**
 * Remove the claims, keeping everything true that stood before them.
 *
 * A sentence is cut at the first clause that carries a claim, and everything
 * from there on goes. Keeping the later clauses instead produced sentences that
 * referred to something no longer there ("Exact seat-fill data isn't published,
 * but that's the trend."), which reads worse than the claim did.
 *
 * The whole sentence goes when what survives could not stand on its own ("…,
 * under VTU."), and if that would empty the message the original is kept: a
 * reply that says nothing is worse than one that oversells. The QA suites
 * (backend/scripts/qa) are what catch that case.
 */
export function scrubUnsupportedClaims(text: string): { text: string; removed: string[] } {
  if (!UNSUPPORTED_CLAIM.test(text)) return { text, removed: [] };
  const removed: string[] = [];

  const lines = text.split('\n').map((line) => {
    if (!UNSUPPORTED_CLAIM.test(line)) return line;
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.map((sentence) => {
      if (!UNSUPPORTED_CLAIM.test(sentence)) return sentence;
      // A denial before the phrase means the bot is refusing to make the claim.
      if (DENIAL.test(sentence.slice(0, sentence.search(UNSUPPORTED_CLAIM)))) return sentence;
      removed.push(sentence.trim());
      const clauses = sentence.split(/,\s*/);
      const first = clauses.findIndex((clause) => UNSUPPORTED_CLAIM.test(clause));
      const rebuilt = clauses
        .slice(0, first)
        .join(', ')
        .replace(/\s+([.!?])/g, '$1')
        .replace(/[,;:\s]+$/, '')
        .trim();
      const words = rebuilt.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
      const standsAlone = words.length >= 4 && HAS_VERB.test(rebuilt) && !DANGLING_START.test(rebuilt);
      if (!standsAlone) return '';
      return /[.!?]$/.test(rebuilt) ? rebuilt : `${rebuilt}.`;
    });
    return kept.filter(Boolean).join(' ').trim();
  });

  const scrubbed = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!scrubbed) return { text, removed: [] };
  return { text: scrubbed, removed };
}

export function extractReplyParts(reply: string): ReplyParts {
  let ui: UiBlock | null = null;
  let media: MediaOut[] = [];
  let next: string[] = [];
  let then = '';
  let plan: PlanBlock | null = null;
  let rejected = false;
  let reason: string | undefined;

  let text = reply
    .replace(tagRe(UI_TAG), (_m, raw: string) => {
      try {
        const parsed = parseLenient(UiBlockSchema, withDefaultTitle(JSON.parse(raw.trim())));
        if (parsed.success) ui = cleanDeep(parsed.data);
        else {
          rejected = true;
          const issue = parsed.error.issues[0];
          reason = `${issue?.path.join('.') || 'block'}: ${issue?.message}`;
        }
      } catch (error) {
        rejected = true;
        reason = `not JSON: ${(error as Error).message}`;
      }
      return '';
    })
    .replace(tagRe('media'), (_m, raw: string) => {
      try {
        const keys = JSON.parse(raw.trim());
        if (Array.isArray(keys)) {
          // Keys normally; a model echoing its own stored history may send {url, caption}.
          const byUrl = new Map(Object.values(MEDIA_LIBRARY).map((m) => [m.url, m]));
          media = [...new Set(keys.map((k) => (typeof k === 'string' ? k.trim() : typeof k?.url === 'string' ? k.url : '')))]
            .map((k) => MEDIA_LIBRARY[k] ?? byUrl.get(k))
            .filter((m): m is (typeof MEDIA_LIBRARY)[string] => Boolean(m))
            .slice(0, 3)
            .map((m) => ({ url: m.url, caption: m.caption }));
        }
      } catch {
        /* an unreadable media tag just shows no photos */
      }
      return '';
    })
    .replace(tagRe('next'), (_m, raw: string) => {
      try {
        const parsed = parseLenient(NextSchema, JSON.parse(raw.trim()));
        if (parsed.success) next = cleanDeep(parsed.data);
      } catch {
        /* no suggestions this turn */
      }
      return '';
    })
    .replace(tagRe('then'), (_m, raw: string) => {
      const value = cleanVisible(raw.replace(/<[^>]*>/g, '')).trim();
      if (value) then = value.slice(0, 280);
      return '';
    })
    .replace(tagRe('plan'), (_m, raw: string) => {
      try {
        const parsed = parseLenient(PlanSchema, JSON.parse(raw.trim()));
        if (parsed.success) plan = cleanDeep(parsed.data);
      } catch {
        /* the pinned plan stays as it was */
      }
      return '';
    });

  // An unterminated block (the reply was cut off) must not leak to the visitor.
  for (const tag of [UI_TAG, 'media', 'next', 'then', 'plan']) {
    text = text.replace(openTagRe(tag), () => {
      if (tag === UI_TAG) {
        rejected = true;
        reason = 'unterminated block (reply cut off: raise maxTokens?)';
      }
      return '';
    });
  }

  const claims = scrubUnsupportedClaims(stripFillerOpener(cleanVisible(text).replace(/\n{3,}/g, '\n\n').trim()));
  text = claims.text;
  // The follow-up bubble is the bot's own voice as well; `next` is not, being
  // suggestions written for the visitor to say.
  if (then) {
    const thenClaims = scrubUnsupportedClaims(then);
    then = thenClaims.text;
    claims.removed.push(...thenClaims.removed);
  }

  const shown = ui as UiBlock | null;
  const blocking = Boolean(shown && (shown.type === 'chips' || shown.type === 'select' || shown.type === 'form'));

  // A closing question or ask after an answer reads as its own message, not
  // the tail of a paragraph. (Not when a question element follows: the
  // question must stay above the options it asks about.)
  if (!then && !blocking) {
    const paragraphs = text.split(/\n\s*\n/);
    const last = paragraphs[paragraphs.length - 1]?.trim() ?? '';
    if (paragraphs.length > 1 && /\?$/.test(last) && last.length <= 280 && !/^\s*[-*•]|^\s*\[[a-z]+\]/i.test(last)) {
      then = last;
      text = paragraphs.slice(0, -1).join('\n\n').trim();
    }
  }

  // A question element is the one question of this reply: a second one in a
  // follow-up bubble would compete with it.
  if (blocking && /\?\s*$/.test(then)) then = '';

  // One question per reply: when the follow-up bubble asks one, a question
  // closing the answer itself goes (the bubble is the planned next step).
  if (/\?\s*$/.test(then)) text = withoutClosingQuestion(text);

  // When the next step needs their details, the form is the next step: no
  // side suggestions pulling away from it (its "not now" is the way out).
  if (shown && shown.type === 'form' && shown.fields.some((f) => f === 'name' || f === 'phone' || f === 'email')) {
    next = [];
  }

  return { text, ui, media, next, then, plan, rejected, reason, claimsRemoved: claims.removed };
}

/** Back-compat wrapper. */
export function extractUiBlock(reply: string) {
  const parts = extractReplyParts(reply);
  return { text: parts.text, ui: parts.ui, rejected: parts.rejected, reason: parts.reason };
}

/** The stored form: visible text, then each attachment in canonical form. */
export function composeStored(
  parts: Pick<ReplyParts, 'text' | 'ui' | 'media' | 'next'> & Partial<Pick<ReplyParts, 'then' | 'plan'>>,
): string {
  let out = parts.text;
  if (parts.plan) out += `\n\n<plan>${JSON.stringify(parts.plan)}</plan>`;
  if (parts.media.length) out += `\n\n<media>${JSON.stringify(parts.media)}</media>`;
  if (parts.ui) out += `\n\n<${UI_TAG}>${JSON.stringify(parts.ui)}</${UI_TAG}>`;
  if (parts.then) out += `\n\n<then>${parts.then}</then>`;
  if (parts.next.length) out += `\n\n<next>${JSON.stringify(parts.next)}</next>`;
  return out;
}

export function withUiBlock(text: string, ui: UiBlock | null): string {
  return composeStored({ text, ui, media: [], next: [] });
}

/** Message content for a one-line preview: attachments removed, a short label if nothing else is left. */
export function previewText(content: string, max: number): string {
  const text = content
    .replace(/<(ui|media|next|plan)>[\s\S]*?(<\/\1>|$)/gi, '')
    .replace(/<\/?then>/gi, ' ')
    .replace(/^\s*[-*\u2022]\s+/gm, '')
    .replace(/\[[a-z]+\]\s*/gi, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (text || '[interactive element]').slice(0, max);
}
