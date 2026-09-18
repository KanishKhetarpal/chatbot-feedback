import { createHash } from 'crypto';
import { CHUNK_OVERLAP, CHUNK_SIZE } from './knowledge.constants';

/** Fixed-size sliding window, snapped to a sentence or newline where possible. */
export function chunkText(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);

    if (end < clean.length) {
      const window = clean.slice(start, end);
      const boundary = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '));
      if (boundary > CHUNK_SIZE * 0.5) end = start + boundary + 1;
    }

    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);

    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
