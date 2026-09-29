import type { PrismaService } from '../../prisma/prisma.service';
import { ON_DEMAND_LOAD_MODE } from './knowledge.constants';

/**
 * Knowledge a bot reads only on the turns that need it.
 *
 * The compiled pack rides every call, cached. An `on_demand` source is kept out
 * of it and, when one of its trigger phrases appears in what the visitor has
 * just written, its text is attached to that one turn's user message. That is
 * where KNOWN FACTS and the reply checklist already go, after every cache
 * breakpoint, so the cached prefix (system blocks and history) never changes
 * because of it, and a turn that does not match pays nothing at all.
 *
 * Stored history keeps the visitor's raw words; the attachment is rebuilt each
 * turn. Matching also looks at their previous message, so that a follow-up
 * ("and if the OTP never comes?") still gets the material the question before
 * it pulled in.
 */

/** Earlier visitor messages that still count, besides the current one: enough for an immediate follow-up ("and then?"), not so many that later unrelated turns keep paying for it. */
export const ON_DEMAND_LOOKBACK = 1;

/** On-demand sources are re-read at most this often per agent. */
const CACHE_TTL_MS = 60_000;

interface OnDemandSource {
  name: string;
  text: string;
  patterns: RegExp[];
}

const cache = new Map<string, { at: number; sources: OnDemandSource[] }>();

/** Trimmed, lower-cased, single-spaced, de-duplicated; empties and one-letter noise dropped. */
export function normaliseTriggers(raw: string[]): string[] {
  const seen = new Set<string>();
  for (const t of raw) {
    const clean = t.trim().toLowerCase().replace(/\s+/g, ' ');
    if (clean.length >= 2) seen.add(clean);
  }
  return [...seen];
}

/** A trigger as a whole-word, case-insensitive pattern; inner spaces match any run of whitespace. */
export function triggerPattern(trigger: string): RegExp {
  const body = trigger
    .split(' ')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu');
}

/** The sources whose triggers appear in any of `texts`, in their stored order. */
export function matchSources<T extends { patterns: RegExp[] }>(sources: T[], texts: string[]): T[] {
  const haystack = texts.filter(Boolean).join('\n');
  if (!haystack) return [];
  return sources.filter((s) => s.patterns.some((p) => p.test(haystack)));
}

/** The attachment for one turn: each matched source, labelled, with how to use it. */
export function renderOnDemand(sources: { name: string; text: string }[]): string {
  return sources
    .map(
      (s) =>
        `<reference name="${s.name.replace(/"/g, "'")}">\n` +
        `Extra knowledge for this message only. Use it if it answers them; the same rules apply as for the rest of your knowledge.\n\n` +
        `${s.text.trim()}\n</reference>`,
    )
    .join('\n\n');
}

async function loadSources(prisma: PrismaService, agentId: string): Promise<OnDemandSource[]> {
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.sources;
  const rows = await prisma.chatAgentKnowledgeSource.findMany({
    where: { agentId, enabled: true, status: 'ready', loadMode: ON_DEMAND_LOAD_MODE },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { name: true, location: true, triggers: true },
  });
  const sources = rows
    .filter((r) => r.triggers.length > 0)
    .map((r) => ({ name: r.name, text: r.location, patterns: r.triggers.map(triggerPattern) }));
  cache.set(agentId, { at: Date.now(), sources });
  return sources;
}

/**
 * The on-demand knowledge this turn needs, ready to put at the top of the last
 * user message, or '' when nothing matches (the common case: no extra tokens).
 *
 * @param visitorTexts the visitor's messages, oldest first, ending with this turn's.
 */
export async function onDemandContext(
  prisma: PrismaService,
  agentId: string,
  visitorTexts: string[],
): Promise<string> {
  const sources = await loadSources(prisma, agentId);
  if (sources.length === 0) return '';
  const matched = matchSources(sources, visitorTexts.slice(-(ON_DEMAND_LOOKBACK + 1)));
  return matched.length ? renderOnDemand(matched) : '';
}

/** For tests and for a knowledge edit that must show up immediately. */
export function clearOnDemandCache(agentId?: string): void {
  if (agentId) cache.delete(agentId);
  else cache.clear();
}
