/**
 * Rendering the compiled knowledge pack.
 *
 * The output of this file is a prompt-cache key: the answer path sends it as a
 * cached system block, and caching is a byte-exact prefix match. So everything
 * here must be deterministic. Nothing volatile may appear in a pack — no build
 * timestamp, no source IDs, no counts — or every build would invalidate the
 * cache for content that did not actually change.
 */

/** A source as the renderer needs it. `text` is the extracted body, not chunks. */
export interface PackSource {
  name: string;

  /**
   * The author's own account of what this source is.
   *
   * Rendered directly under the heading, above the content, because it is what
   * makes the content interpretable at all for an uploaded table — a column
   * headed `AMT` is a number until someone says it is annual tuition in INR.
   * Null for most text sources, where the prose speaks for itself.
   */
  description?: string | null;
  /**
   * The source's full extracted text.
   *
   * Deliberately *not* assembled from `ChatAgentKnowledgeChunk` rows: chunks
   * overlap by CHUNK_OVERLAP characters so retrieval never splits a sentence
   * across a boundary, and concatenating them would duplicate that overlap at
   * every join. Chunks are for future retrieval; the pack uses the whole text.
   */
  text: string;
}

import { renderSourceHeader } from './table.util';

const SEPARATOR = '\n\n---\n\n';

/**
 * Render sources into the document the model reads.
 *
 * Headings are included because an unlabelled wall of concatenated text gives the
 * model no way to tell where one topic ends and the next begins — and no way to
 * say which source an answer came from.
 */
export function renderPack(sources: PackSource[]): string {
  return sources
    .map((source) => `${renderSourceHeader(source.name, source.description ?? null)}\n\n${source.text.trim()}`)
    .join(SEPARATOR);
}

/**
 * Split a total token count across sources in proportion to their byte size.
 *
 * Used only on the over-budget error path, to answer "which source should I turn
 * off?". Approximate on purpose: an exact per-source count means one API call per
 * source, and this runs precisely when the author already has too many of them.
 * Flagged as approximate in the response so nobody builds on the number.
 */
export function apportionTokens<T extends { id: string; name: string; bytes: number }>(
  sources: T[],
  totalTokens: number,
): { id: string; name: string; approxTokens: number }[] {
  const totalBytes = sources.reduce((sum, s) => sum + s.bytes, 0);
  if (totalBytes === 0) {
    return sources.map((s) => ({ id: s.id, name: s.name, approxTokens: 0 }));
  }
  return sources
    .map((s) => ({
      id: s.id,
      name: s.name,
      approxTokens: Math.round((s.bytes / totalBytes) * totalTokens),
    }))
    .sort((a, b) => b.approxTokens - a.approxTokens);
}
