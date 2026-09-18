export const KNOWLEDGE_SOURCE_TYPES = ['text', 'website', 'file', 'qa', 'integration'] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const KNOWLEDGE_SOURCE_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;

/** Types that actually ingest. The rest are rejected with `not_implemented`. */
export const LIVE_KNOWLEDGE_TYPES = ['text', 'file'] as const;
export type LiveKnowledgeType = (typeof LIVE_KNOWLEDGE_TYPES)[number];

/** The pasted-prose type. Named separately because it is the only editable one. */
export const TEXT_KNOWLEDGE_TYPE = 'text' as const;
/** The uploaded-spreadsheet type. */
export const FILE_KNOWLEDGE_TYPE = 'file' as const;

export const KNOWLEDGE_BYTES_LIMIT = 2_000_000;
export const KNOWLEDGE_PLAN = 'free' as const;

export const CHUNK_SIZE = 1200;
export const CHUNK_OVERLAP = 150;

/**
 * Ceiling on a compiled knowledge pack, in tokens.
 *
 * This is the limit that actually bites. KNOWLEDGE_BYTES_LIMIT caps what you may
 * *store*; this caps what gets sent to the model on every single message, so it
 * is the one with a recurring bill attached. 60k is generous for an FAQ agent
 * and cheap once prompt-cached; raise it per plan later if a real agent needs it.
 *
 * ⚠️ It is also what bounds spreadsheet uploads, and the bound is tighter than it
 * looks. A rendered table row costs roughly 4 tokens per column plus 2, so a
 * 3-column sheet fits ~4,000 rows and a 15-column sheet only ~800 — for the whole
 * agent, not per file. Upload measures this up front rather than letting an author
 * discover it at train time; see `KnowledgeService.assertPackBudget`.
 */
export const KNOWLEDGE_CONTEXT_TOKEN_LIMIT = 60_000;

/** Builds kept per agent. Older ones are pruned inside the training transaction. */
export const KNOWLEDGE_PACK_RETENTION = 5;

// ── Uploaded files ───────────────────────────────────────────────────────────

export const KNOWLEDGE_FILE_TYPES = ['csv', 'xlsx'] as const;
export type KnowledgeFileType = (typeof KNOWLEDGE_FILE_TYPES)[number];

/**
 * Extension → type. `.txt` is deliberately **not** here: a text file that happens
 * to be delimited is a text snippet, and routing it through the table renderer
 * would turn prose into a one-column table.
 */
export const KNOWLEDGE_FILE_EXTENSIONS: Record<string, KnowledgeFileType> = {
  csv: 'csv',
  xlsx: 'xlsx',
};

/**
 * Multer's ceiling. Generous relative to what can actually be *trained* — a file
 * this large will be refused by the token budget long before it is refused here.
 * It exists to stop a 500 MB upload occupying a request slot, not to enforce
 * policy; the honest limit is the token one, and it is reported in tokens.
 */
export const KNOWLEDGE_FILE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Parser stop conditions, hit before the token budget is ever computed.
 *
 * Their job is to keep a pathological file from being fully materialised in
 * memory just to be told it is too big. A file that trips one of these was never
 * going to fit in a 60k-token prompt — the smallest possible row is well over a
 * token — so refusing early costs an author nothing they could have had.
 */
export const KNOWLEDGE_FILE_MAX_ROWS = 50_000;
export const KNOWLEDGE_FILE_MAX_COLUMNS = 80;
export const KNOWLEDGE_FILE_MAX_SHEETS = 20;

/** Data rows per chunk. Each chunk repeats the header, so this is a real cost. */
export const KNOWLEDGE_TABLE_ROWS_PER_CHUNK = 20;

/** Longest cell we will render. Beyond this a cell is a document, not a value. */
export const KNOWLEDGE_CELL_MAX_CHARS = 500;

export const KNOWLEDGE_DESCRIPTION_MAX_CHARS = 2_000;
