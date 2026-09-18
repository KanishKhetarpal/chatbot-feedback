/**
 * Reading an uploaded CSV/XLSX into sheets of clean string cells.
 *
 * Deliberately **not** reusing `raw-data-lead/file-parser.ts`, which does the same
 * job for bought datasets. That one is first-worksheet-only and says so — a raw
 * dataset is a single-sheet export, so the second tab of a workbook is a bug there
 * and a fee schedule here. Changing it to serve both would put a knowledge-base
 * requirement inside another module's contract; the shared part is ~30 lines of
 * cell coercion, which is cheaper duplicated than entangled.
 *
 * The other difference is what "a row" is for. There, a row becomes a Lead and is
 * validated field by field. Here nothing is interpreted: whatever the author put
 * in the sheet is what the model should read, so the only processing is making it
 * legible — trimming, dropping empty rows and columns, and naming headers that
 * have no name.
 */
import * as fs from 'fs';
import { parse } from 'csv-parse';
import * as ExcelJS from 'exceljs';
import {
  KNOWLEDGE_CELL_MAX_CHARS,
  KNOWLEDGE_FILE_MAX_COLUMNS,
  KNOWLEDGE_FILE_MAX_ROWS,
  KNOWLEDGE_FILE_MAX_SHEETS,
  type KnowledgeFileType,
} from './knowledge.constants';

/** One tab of a workbook, or the whole file for a CSV. */
export interface ParsedSheet {
  /** Worksheet name, or the uploaded file's name for a CSV. */
  name: string;
  /** Whatever sat above the header row — usually a title. Empty when there was none. */
  caption: string;
  headers: string[];
  rows: string[][];
}

export interface ParsedTable {
  sheets: ParsedSheet[];
  totalRows: number;
  /** True when a stop condition cut the read short — surfaced, never silent. */
  truncated: boolean;
  truncationReason: string | null;
}

export class TableParseError extends Error {}

export function detectKnowledgeFileType(fileName: string): KnowledgeFileType | null {
  const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx') return 'xlsx';
  return null;
}

/**
 * Strip what Postgres cannot store and what would corrupt a table row.
 *
 * **NUL is the one that bites.** A `text` column rejects `0x00` outright
 * (`22021 invalid byte sequence for encoding "UTF8"`), so a single stray NUL
 * anywhere in a spreadsheet fails the whole upload with a 500 — and real ERP
 * exports carry them: the file that found this had 8, sitting in a column that
 * was otherwise empty. Nothing upstream removes them, because NUL is not
 * whitespace and `\s+` does not match it.
 *
 * The other C0 controls and DEL are stripped for the same class of reason: they
 * render as nothing, cost tokens, and can confuse the model. Lone surrogates go
 * too — they are not valid UTF-8 once encoded, which is the same 22021 by a
 * different route.
 */
const stripUnstorable = (value: string) =>
  value
    // C0 controls except tab/LF/CR (which the whitespace collapse handles), plus DEL
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // unpaired surrogates
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

/**
 * One cell → one line of text.
 *
 * Newlines inside a cell are collapsed rather than preserved: the renderer emits
 * one table row per line, and a cell containing a paragraph would break the row
 * apart and take every column after it with it.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';

  let out: string;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    out = `${y}-${m}-${d}`;
  } else if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      out = (obj.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    } else if (obj.text !== undefined) {
      out = String(obj.text);
    } else if (obj.result !== undefined) {
      // A formula cell. The cached result is the value a reader sees; the formula
      // itself would tell the model nothing it can use.
      return cellToString(obj.result);
    } else if (obj.hyperlink !== undefined) {
      out = String(obj.hyperlink);
    } else {
      out = '';
    }
  } else {
    out = String(value);
  }

  out = stripUnstorable(out).replace(/\s+/g, ' ').trim();
  return out.length > KNOWLEDGE_CELL_MAX_CHARS
    ? `${out.slice(0, KNOWLEDGE_CELL_MAX_CHARS)}…`
    : out;
}

const isBlankRow = (row: string[]) => row.every((cell) => cell === '');

/** How many leading rows are examined to work out where the header is. */
const HEADER_SCAN_ROWS = 20;

const filled = (row: string[]) => row.filter((cell) => cell !== '').length;

/**
 * Find the header row.
 *
 * Not "the first non-blank row", which is the obvious rule and the wrong one. Real
 * exports open with a title — `Acharya University — Fee Schedule 2026-27` sitting
 * alone in A1, often followed by a blank — and taking that as the header names
 * every column after the first `Column 2`, `Column 3`, and demotes the actual
 * header into a data row. Verified against exactly that file before this existed.
 *
 * What separates a title from a header is *width*: a title occupies one cell, a
 * header occupies as many as the data does. So the widest of the leading rows sets
 * the expectation and the first row that comes close to it is the header.
 *
 * The 0.6 factor is slack for headers with a genuinely empty column in the middle.
 * Falling back to the first non-blank row keeps narrow files — a one-column list —
 * working, since no row can reach a two-cell threshold there.
 */
function findHeaderIndex(raw: string[][]): number {
  const firstFilled = raw.findIndex((row) => filled(row) > 0);
  if (firstFilled === -1) return -1;

  const window = raw.slice(firstFilled, firstFilled + HEADER_SCAN_ROWS);
  const widest = Math.max(...window.map(filled));
  if (widest < 2) return firstFilled;

  const threshold = Math.max(2, widest * 0.6);
  const found = window.findIndex((row) => filled(row) >= threshold);
  return found === -1 ? firstFilled : firstFilled + found;
}

/**
 * Turn raw rows into a sheet with named columns.
 *
 * Anything above the header becomes the `caption` rather than being dropped. A
 * title row is not noise — "Fee Schedule 2026-27" is often the only place the
 * year appears, and an agent that cannot say which year a fee applies to is worse
 * than no agent. It costs a few tokens once per sheet.
 *
 * Returns null for a sheet with no usable content, so an empty tab is skipped
 * rather than rendered as an empty table.
 */
function toSheet(name: string, raw: string[][]): ParsedSheet | null {
  const headerIndex = findHeaderIndex(raw);
  if (headerIndex === -1) return null;

  const caption = raw
    .slice(0, headerIndex)
    .map((row) => row.filter((cell) => cell !== '').join(' '))
    .filter(Boolean)
    .join(' — ')
    .slice(0, 300);

  const headerRow = raw[headerIndex];
  const width = Math.min(headerRow.length, KNOWLEDGE_FILE_MAX_COLUMNS);

  // Blank and duplicate headers both produce columns the model cannot refer to.
  // Naming them positionally is worse than a real name and far better than none.
  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, i) => {
    const base = (headerRow[i] ?? '').trim() || `Column ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows = raw
    .slice(headerIndex + 1)
    .map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''))
    .filter((row) => !isBlankRow(row));

  if (rows.length === 0) return null;

  // A column that is empty in every row costs tokens on every message and tells
  // the model nothing. Dropping it here is the single cheapest saving available.
  const keep = headers.map((_, i) => rows.some((row) => row[i] !== ''));
  if (keep.every(Boolean)) return { name, caption, headers, rows };

  return {
    name,
    caption,
    headers: headers.filter((_, i) => keep[i]),
    rows: rows.map((row) => row.filter((_, i) => keep[i])),
  };
}

export async function parseTableFile(
  filePath: string,
  type: KnowledgeFileType,
  fileName: string,
): Promise<ParsedTable> {
  const raw = type === 'csv' ? await readCsv(filePath, fileName) : await readXlsx(filePath);

  const sheets: ParsedSheet[] = [];
  for (const sheet of raw.sheets) {
    const parsed = toSheet(sheet.name, sheet.rows);
    if (parsed) sheets.push(parsed);
  }

  if (sheets.length === 0) {
    throw new TableParseError(
      'No readable rows were found in this file. Check that it has a header row and at least one row of data.',
    );
  }

  return {
    sheets,
    totalRows: sheets.reduce((sum, s) => sum + s.rows.length, 0),
    truncated: raw.truncated,
    truncationReason: raw.truncationReason,
  };
}

interface RawRead {
  sheets: { name: string; rows: string[][] }[];
  truncated: boolean;
  truncationReason: string | null;
}

async function readCsv(filePath: string, fileName: string): Promise<RawRead> {
  const source = fs.createReadStream(filePath);
  const parser = source.pipe(
    parse({ bom: true, relax_column_count: true, skip_empty_lines: true, trim: true }),
  );
  // `.pipe()` does not forward the source's errors to the destination, so an
  // unreadable file would leave the parser waiting for data that is never coming.
  source.on('error', (err) => parser.destroy(err));

  const rows: string[][] = [];
  let truncated = false;

  try {
    for await (const record of parser) {
      if (rows.length >= KNOWLEDGE_FILE_MAX_ROWS) {
        truncated = true;
        break;
      }
      rows.push((record as unknown[]).map(cellToString));
    }
  } catch (err) {
    throw new TableParseError(
      `This file could not be read as CSV: ${(err as Error)?.message ?? 'unknown error'}`,
    );
  } finally {
    source.destroy();
  }

  return {
    sheets: [{ name: stripUnstorable(fileName.replace(/\.[^.]+$/, '')), rows }],
    truncated,
    truncationReason: truncated ? `Stopped after ${KNOWLEDGE_FILE_MAX_ROWS} rows` : null,
  };
}

async function readXlsx(filePath: string): Promise<RawRead> {
  // Non-streaming, unlike `raw-data-lead/file-parser.ts`, and for two reasons.
  //
  // The streaming `WorkbookReader` cannot reliably name a worksheet: it resolves
  // the name from `workbook.xml`, and when the zip places that entry after the
  // sheets it throws outright (verified against an ExcelJS-written file, which
  // orders it exactly that way). A sheet name is not decoration here — it is how
  // the model is told that this table is "PG Fees" and not "UG Fees".
  //
  // And the memory argument that drove the streaming design over there does not
  // apply here. A raw dataset is 100k rows; a knowledge file has to fit inside a
  // 60k-token prompt, so anything trainable is small by construction. The row
  // caps refuse the rest before it is ever rendered.
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    throw new TableParseError(
      `This file could not be read as a spreadsheet: ${(err as Error)?.message ?? 'unknown error'}`,
    );
  }

  const sheets: { name: string; rows: string[][] }[] = [];
  let total = 0;
  let truncated = false;
  let reason: string | null = null;
  let hidden = 0;

  for (const worksheet of workbook.worksheets) {
    // A hidden tab is nearly always a lookup table or a pivot cache — the
    // author's scaffolding, not the document they mean to publish. Including it
    // costs tokens on every message and can contradict the visible sheet.
    if (worksheet.state && worksheet.state !== 'visible') {
      hidden++;
      continue;
    }
    if (sheets.length >= KNOWLEDGE_FILE_MAX_SHEETS) {
      truncated = true;
      reason = `Stopped after ${KNOWLEDGE_FILE_MAX_SHEETS} sheets`;
      break;
    }

    const width = Math.min(worksheet.columnCount, KNOWLEDGE_FILE_MAX_COLUMNS);
    const rows: string[][] = [];

    // Indexed via `getCell` rather than `row.values`, which is a *sparse* array:
    // a row with gaps has holes, and `.map` skips holes rather than yielding
    // them — which silently shifts every cell after a blank one into the wrong
    // column. That misalignment is invisible in the output and would present as
    // the model quoting the wrong figure.
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (total >= KNOWLEDGE_FILE_MAX_ROWS) {
        truncated = true;
        reason = `Stopped after ${KNOWLEDGE_FILE_MAX_ROWS} rows`;
        return;
      }
      rows.push(Array.from({ length: width }, (_, i) => cellToString(row.getCell(i + 1).value)));
      total++;
    });

    sheets.push({
      name: stripUnstorable(worksheet.name || `Sheet ${sheets.length + 1}`).trim(),
      rows,
    });
    if (truncated) break;
  }

  if (hidden > 0 && sheets.length === 0) {
    throw new TableParseError(
      `Every sheet in this workbook is hidden. Unhide the sheet you want the agent to read and upload it again.`,
    );
  }

  return { sheets, truncated, truncationReason: reason };
}
