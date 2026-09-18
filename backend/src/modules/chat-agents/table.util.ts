/**
 * Turning a parsed spreadsheet into text a model can answer from.
 *
 * The whole problem this file solves: a spreadsheet is legible because of where
 * things *are*. Column three means "tuition" because of a word sitting at the top
 * of the file, possibly two thousand rows away. Flatten that naively and every
 * row becomes a list of unattributed numbers.
 *
 * So each table is rendered as a Markdown table with its header attached, and —
 * critically — **every chunk repeats the header**. Chunk 40 of a fee schedule has
 * to be readable on its own, because retrieval (later) will hand it over on its
 * own. Repeating a header costs a few tokens per chunk and is the difference
 * between a usable excerpt and a grid of orphaned numbers.
 *
 * Output is deterministic. It ends up inside a knowledge pack, and a pack is a
 * prompt-cache key — the same file uploaded twice must render byte-identically or
 * it invalidates the cache for content that did not change.
 */
import {
  KNOWLEDGE_TABLE_ROWS_PER_CHUNK,
  type KnowledgeFileType,
} from './knowledge.constants';
import type { ParsedSheet, ParsedTable } from './table-parser';

/**
 * Markdown tables are pipe-delimited, so a pipe inside a value would invent a
 * column. Escaped rather than stripped: `A|B` is a real value someone typed.
 */
const escapeCell = (value: string) => value.replace(/\|/g, '\\|');

const renderRow = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`;

/** Header plus the `---` separator — the part every chunk repeats. */
function renderHeader(sheet: ParsedSheet): string {
  return [renderRow(sheet.headers), `| ${sheet.headers.map(() => '---').join(' | ')} |`].join('\n');
}

/**
 * A one-line orientation for a sheet, above its table.
 *
 * Worth its ~20 tokens: it is what lets the agent answer "what fee information do
 * you have?" — a question the rows themselves can only answer by being read in
 * full, which is exactly what we are trying to avoid paying for.
 */
function renderSheetIntro(sheet: ParsedSheet, showName: boolean): string {
  const heading = showName ? `### ${sheet.name}\n` : '';
  const caption = sheet.caption ? `${sheet.caption}\n` : '';
  const rowWord = sheet.rows.length === 1 ? 'row' : 'rows';
  return `${heading}${caption}${sheet.rows.length} ${rowWord}, columns: ${sheet.headers.join(', ')}.`;
}

/**
 * The full document stored on the source and compiled into the pack.
 *
 * Sheet names are shown only for a genuine multi-sheet workbook. For a CSV the
 * "sheet" is the file itself and its name is already the source name, so printing
 * it would put the same string on screen twice for no gain.
 */
export function renderTable(parsed: ParsedTable, fileType: KnowledgeFileType): string {
  const showNames = parsed.sheets.length > 1 || fileType === 'xlsx';

  const body = parsed.sheets
    .map((sheet) =>
      [
        renderSheetIntro(sheet, showNames),
        '',
        renderHeader(sheet),
        ...sheet.rows.map(renderRow),
      ].join('\n'),
    )
    .join('\n\n');

  if (!parsed.truncated) return body;

  // Stated in the document itself, not only in the API response. The author sees
  // the warning at upload; the *model* needs to know its table is incomplete, or
  // it will report "no such programme" for a row that was simply cut off.
  return `${body}\n\n> Note: this file was too large to include in full. ${parsed.truncationReason}.`;
}

/**
 * Retrieval-ready chunks: a header and a slice of rows, repeated down the sheet.
 *
 * Nothing reads these yet — the pack still carries the whole table — but they are
 * written now because re-chunking later would mean re-parsing files that, on
 * local disk, may no longer exist.
 */
export function chunkTable(parsed: ParsedTable, fileType: KnowledgeFileType): string[] {
  const showNames = parsed.sheets.length > 1 || fileType === 'xlsx';
  const chunks: string[] = [];

  for (const sheet of parsed.sheets) {
    const intro = renderSheetIntro(sheet, showNames);
    const header = renderHeader(sheet);

    for (let i = 0; i < sheet.rows.length; i += KNOWLEDGE_TABLE_ROWS_PER_CHUNK) {
      const slice = sheet.rows.slice(i, i + KNOWLEDGE_TABLE_ROWS_PER_CHUNK);
      // "rows 41–60 of 240" is what makes a chunk honest about being a fragment.
      // Without it the model reads twenty rows as if they were the whole sheet.
      const from = i + 1;
      const to = i + slice.length;
      const span = `Rows ${from}–${to} of ${sheet.rows.length}.`;
      chunks.push([intro, span, '', header, ...slice.map(renderRow)].join('\n'));
    }
  }

  return chunks;
}

/**
 * How a source is introduced in the compiled pack.
 *
 * Shared by text and file sources so both read the same way to the model, and so
 * the description — the whole reason a spreadsheet is intelligible at all — can
 * never be rendered for one type and forgotten for the other.
 */
export function renderSourceHeader(name: string, description: string | null): string {
  const trimmed = description?.trim();
  return trimmed ? `## ${name.trim()}\n\n${trimmed}` : `## ${name.trim()}`;
}
