/**
 * Conversational lead capture.
 *
 * A counsellor-style bot asks for the visitor's name and number in the flow of
 * the conversation, so those facts arrive as free text — "sure, it's Priya,
 * 98450 12345" — not through the contact form. Two things turn that text into
 * columns on the visitor row:
 *
 *   1. The model is told (see QUALIFIER_INSTRUCTION) to end every reply in
 *      which it learned something with one hidden tag:
 *        <visitor-facts name="Priya Sharma" mobile="9845012345" />
 *      `extractFactsTag` pulls that tag out and returns the clean reply.
 *
 *   2. As a safety net, `detectPhone` scans the visitor's own message for an
 *      Indian mobile number. Models occasionally forget the tag; a ten-digit
 *      number starting 6–9 is unambiguous enough to keep on its own.
 *
 * Only whitelisted keys are stored, values are trimmed and length-capped, and
 * an existing value is never overwritten by an empty one.
 */

export const FACTS_TAG = 'visitor-facts';

/** Keys the model may set. Anything else in the tag is dropped. */
export const FACT_KEYS = [
  'name',
  'mobile',
  'email',
  'courseInterest',
  'city',
  'academicYear',
  'educationLevel',
  'preferredCallTime',
  'parentOrStudent',
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export type ExtractedFacts = Partial<Record<FactKey, string>>;

const TAG_RE = new RegExp(`<${FACTS_TAG}\\b([^>]*?)\\/?>(?:\\s*<\\/${FACTS_TAG}>)?`, 'gi');
const ATTR_RE = /([A-Za-z][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const MAX_VALUE = 120;

/**
 * Strip every facts tag from a reply and merge their attributes.
 *
 * Returns the reply without the tag(s), trimmed, and the facts found. A reply
 * with no tag comes back unchanged with an empty facts object.
 */
export function extractFactsTag(reply: string): { text: string; facts: ExtractedFacts } {
  const facts: ExtractedFacts = {};
  const text = reply
    .replace(TAG_RE, (_match, attrs: string) => {
      for (const m of attrs.matchAll(ATTR_RE)) {
        const key = m[1] as FactKey;
        const raw = (m[2] ?? m[3] ?? '').trim();
        if (!FACT_KEYS.includes(key) || !raw) continue;
        const value = raw.slice(0, MAX_VALUE);
        if (/^(unknown|null|none|n\/a|-)$/i.test(value)) continue;
        facts[key] = key === 'mobile' ? normalizeMobile(value) : value;
      }
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (facts.mobile !== undefined && !facts.mobile) delete facts.mobile;
  return { text, facts };
}

/**
 * Find an Indian mobile number in free text. Accepts "+91 98450 12345",
 * "098450-12345", "9845012345". Returns the canonical 10 digits, or null.
 */
export function detectPhone(message: string): string | null {
  const m = message.match(/(?:\+?91[\s-]?|0)?([6-9]\d{4}[\s-]?\d{5})(?!\d)/);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
}

/** 10-digit Indian mobile → as is; with a country code → keep "+" and digits. Empty if hopeless. */
export function normalizeMobile(input: string): string {
  const detected = detectPhone(input);
  if (detected) return detected;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return input.trim().startsWith('+') ? `+${digits}` : digits;
}

/** Cheap sanity check for a name the model claims to have heard. */
export function looksLikeName(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 80) return false;
  if (/\d/.test(v)) return false;
  if (/^(guest|user|visitor|student|parent|sir|madam|ma'am|hi|hello|hey|ok|okay|yes|no)$/i.test(v)) return false;
  return /^[\p{L}][\p{L}\s.'-]*$/u.test(v);
}
