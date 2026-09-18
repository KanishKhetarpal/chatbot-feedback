/**
 * Per-turn "here is what we already know about this visitor" block.
 *
 * Prepended to the LAST user message (not the system prompt) so it can vary
 * every turn without invalidating the knowledge-pack cache.
 */

export interface VisitorFacts {
  name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  courseInterest: string | null;
  /** Anything else learned during the conversation (`{{token}}` facts). */
  custom: unknown;
}

export function formatKnownFacts(visitor: VisitorFacts): string {
  const custom = ((visitor.custom ?? {}) as Record<string, unknown>) || {};

  const line = (label: string, value: unknown): string => {
    if (value === null || value === undefined) return `${label}: (not asked)`;
    if (typeof value === 'boolean') return `${label}: ${value ? 'yes' : 'no'}`;
    const str = String(value).trim();
    return str ? `${label}: ${str}` : `${label}: (not asked)`;
  };

  const rows = [
    line('firstName', custom.firstName ?? (visitor.name ? visitor.name.split(/\s+/)[0] : null)),
    line('mobile', visitor.phone),
    line('name', visitor.name),
    line('email', visitor.email),
    line('courseInterest', visitor.courseInterest ?? custom.courseInterest),
    line('city', custom.city ?? visitor.location),
    line('country', custom.country),
    line('isInternational', custom.isIntl),
  ];

  // Anything else in `custom` that has no dedicated line above.
  const shown = new Set(['firstName', 'courseInterest', 'city', 'country', 'isIntl']);
  for (const [key, value] of Object.entries(custom)) {
    if (shown.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    rows.push(line(key, value));
  }

  return `[KNOWN ABOUT THIS VISITOR — do not re-ask these, do not mention this block]
${rows.join('\n')}`;
}
