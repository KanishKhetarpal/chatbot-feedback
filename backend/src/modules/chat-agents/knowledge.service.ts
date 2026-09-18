import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChatAgentKnowledgeSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKnowledgeSourceDto } from './dto/create-knowledge-source.dto';
import { UpdateKnowledgeSourceDto } from './dto/update-knowledge-source.dto';
import {
  FILE_KNOWLEDGE_TYPE,
  KNOWLEDGE_BYTES_LIMIT,
  KNOWLEDGE_FILE_EXTENSIONS,
  KNOWLEDGE_PLAN,
  KNOWLEDGE_SOURCE_TYPES,
  LIVE_KNOWLEDGE_TYPES,
  TEXT_KNOWLEDGE_TYPE,
  type KnowledgeSourceType,
} from './knowledge.constants';
import { chunkText, formatBytes, sha256 } from './knowledge.util';
import {
  KnowledgeFileStorageService,
  KNOWLEDGE_DOWNLOAD_URL_TTL_SECONDS,
  removeQuietly,
} from './knowledge-file-storage.service';
import {
  detectKnowledgeFileType,
  parseTableFile,
  TableParseError,
} from './table-parser';
import { chunkTable, renderTable } from './table.util';
import { UploadKnowledgeFileDto } from './dto/upload-knowledge-file.dto';
import { TrainingService } from './training.service';

const LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  error: true,
  enabled: true,
  description: true,
  fileName: true,
  rowCount: true,
  sheetCount: true,
  chunkCount: true,
  contentBytes: true,
  fileBytes: true,
  mimeType: true,
  contentHash: true,
  embeddedHash: true,
  embeddedAt: true,
  lastSynced: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ListRow = Pick<ChatAgentKnowledgeSource, keyof typeof LIST_SELECT>;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly training: TrainingService,
    private readonly storage: KnowledgeFileStorageService,
  ) {}

  async list(agentId: string, type?: KnowledgeSourceType) {
    await this.assertAgent(agentId);
    const sources = await this.prisma.chatAgentKnowledgeSource.findMany({
      where: { agentId, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
      select: LIST_SELECT,
    });
    return sources.map((source) => this.toListApi(source));
  }

  async getOne(id: string) {
    const source = await this.prisma.chatAgentKnowledgeSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Knowledge source not found');
    return this.toDetailApi(source);
  }

  async getSummary(agentId: string) {
    await this.assertAgent(agentId);

    const grouped = await this.prisma.chatAgentKnowledgeSource.groupBy({
      by: ['type', 'enabled'],
      where: { agentId },
      _count: { _all: true },
      _sum: { contentBytes: true },
    });

    const byType = Object.fromEntries(
      KNOWLEDGE_SOURCE_TYPES.map((t) => [t, { count: 0, enabledCount: 0, contentBytes: 0 }]),
    ) as Record<KnowledgeSourceType, { count: number; enabledCount: number; contentBytes: number }>;

    let totalCount = 0;
    let totalBytes = 0;
    let enabledCount = 0;
    let enabledBytes = 0;

    for (const row of grouped) {
      const bucket = byType[row.type as KnowledgeSourceType];
      const count = row._count._all;
      const bytes = row._sum.contentBytes ?? 0;
      if (bucket) {
        bucket.count += count;
        bucket.contentBytes += bytes;
        if (row.enabled) bucket.enabledCount += count;
      }
      totalCount += count;
      totalBytes += bytes;
      if (row.enabled) {
        enabledCount += count;
        enabledBytes += bytes;
      }
    }

    const usedBytes = await this.usedBytes(agentId);

    // Staleness comes from the pack's recorded source set, not from a per-row
    // hash check — the row check is blind to a trained source being deleted or
    // disabled, both of which leave the live pack teaching removed material.
    const training = await this.training.getTrainingState(agentId);

    return {
      byType,
      enabled: { count: enabledCount, contentBytes: enabledBytes },
      total: { count: totalCount, contentBytes: totalBytes },
      quota: { usedBytes, limitBytes: KNOWLEDGE_BYTES_LIMIT, plan: KNOWLEDGE_PLAN },
      // The UI has to be able to say "uploads are not durable yet" without
      // knowing how storage is configured. Flips to true when S3 lands.
      storage: { durable: this.storage.durable },
      training,
    };
  }

  async create(dto: CreateKnowledgeSourceDto) {
    if (dto.type === FILE_KNOWLEDGE_TYPE) {
      throw this.badRequest(
        'Files are uploaded, not posted as JSON. Use POST /knowledge/upload.',
        'wrong_endpoint',
      );
    }
    if (dto.type !== TEXT_KNOWLEDGE_TYPE) {
      throw this.badRequest(
        'Website, Q/A, and integration sources are coming soon. Add a text snippet or upload a CSV/XLSX for now.',
        'not_implemented',
      );
    }

    const name = dto.name?.trim() ?? '';
    const content = dto.content?.trim() ?? '';
    if (!name) {
      throw this.badRequest('Name is required', 'validation_failed', [
        { path: 'name', message: 'Name is required' },
      ]);
    }
    if (!content) {
      throw this.badRequest('Content is required', 'validation_failed', [
        { path: 'content', message: 'Content is required' },
      ]);
    }

    await this.assertAgent(dto.agentId);

    const chunks = chunkText(content);
    if (chunks.length === 0) {
      throw this.badRequest('This source produced no readable text.', 'validation_failed', [
        { path: 'content', message: 'This source produced no readable text.' },
      ]);
    }

    const contentBytes = Buffer.byteLength(content, 'utf8');
    await this.assertQuota(dto.agentId, contentBytes);

    const description = dto.description?.trim() || null;

    const source = await this.prisma.chatAgentKnowledgeSource.create({
      data: {
        agentId: dto.agentId,
        name,
        type: TEXT_KNOWLEDGE_TYPE,
        location: content,
        description,
        status: 'ready',
        chunkCount: chunks.length,
        contentBytes,
        contentHash: sha256(content),
        lastSynced: new Date(),
        chunks: {
          create: chunks.map((chunk, position) => ({ content: chunk, position })),
        },
      },
    });

    return this.toDetailApi(source);
  }

  async update(id: string, dto: UpdateKnowledgeSourceDto) {
    if (
      dto.name === undefined &&
      dto.enabled === undefined &&
      dto.content === undefined &&
      dto.description === undefined
    ) {
      throw this.badRequest('No fields to update', 'validation_failed');
    }

    const existing = await this.prisma.chatAgentKnowledgeSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Knowledge source not found');

    if (dto.content !== undefined && existing.type !== TEXT_KNOWLEDGE_TYPE) {
      throw this.badRequest(
        'Only text snippets have editable content. Re-upload the file to change what it contains — its description can be edited here.',
        'wrong_type',
      );
    }

    // Editing a file's description changes what the model is told the table
    // *means*, so it changes the compiled pack — which is why `contentHash` moves
    // with it. Without that, the summary panel would report the agent as trained
    // while the live pack still carries the old wording.
    const nextDescription =
      dto.description === undefined ? undefined : dto.description.trim() || null;

    if (dto.content === undefined) {
      const updated = await this.prisma.chatAgentKnowledgeSource.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(nextDescription !== undefined
            ? {
                description: nextDescription,
                contentHash: sha256(`${nextDescription ?? ''}\n${existing.location}`),
              }
            : {}),
        },
      });
      return this.toDetailApi(updated);
    }

    const content = dto.content.trim();
    const chunks = chunkText(content);
    if (chunks.length === 0) {
      throw this.badRequest('This source produced no readable text.', 'validation_failed', [
        { path: 'content', message: 'This source produced no readable text.' },
      ]);
    }

    const contentBytes = Buffer.byteLength(content, 'utf8');
    await this.assertQuota(existing.agentId, contentBytes, existing.contentBytes);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.chatAgentKnowledgeChunk.deleteMany({ where: { sourceId: id } });
      await tx.chatAgentKnowledgeChunk.createMany({
        data: chunks.map((chunk, position) => ({ sourceId: id, content: chunk, position })),
      });
      return tx.chatAgentKnowledgeSource.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          location: content,
          ...(nextDescription !== undefined ? { description: nextDescription } : {}),
          status: 'ready',
          error: null,
          chunkCount: chunks.length,
          contentBytes,
          contentHash: sha256(content),
          lastSynced: new Date(),
        },
      });
    });

    return this.toDetailApi(updated);
  }

  async delete(id: string) {
    const existing = await this.prisma.chatAgentKnowledgeSource.findUnique({
      where: { id },
      select: { id: true, storageKey: true },
    });
    if (!existing) throw new NotFoundException('Knowledge source not found');

    // Row first, file second. The row is the record of truth: a deleted row with
    // an orphaned file on disk is untidy, whereas a deleted file with a surviving
    // row is a source that renders as broken. `discard` is best-effort anyway, so
    // a storage failure must not leave the row behind.
    await this.prisma.chatAgentKnowledgeSource.delete({ where: { id } });
    await this.storage.discard(existing.storageKey);
    return { id };
  }

  async resync(id: string) {
    const source = await this.prisma.chatAgentKnowledgeSource.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!source) throw new NotFoundException('Knowledge source not found');
    if (source.type === TEXT_KNOWLEDGE_TYPE) {
      throw this.badRequest('Text sources have no external source to re-fetch', 'not_resyncable');
    }
    if (source.type === FILE_KNOWLEDGE_TYPE) {
      throw this.badRequest(
        'An uploaded file has no external source to re-fetch. Upload the new version and delete this one.',
        'not_resyncable',
      );
    }
    throw this.badRequest(
      'Website, Q/A, and integration sources are coming soon.',
      'not_implemented',
    );
  }

  /**
   * Ingest an uploaded CSV/XLSX as a knowledge source.
   *
   * Synchronous, unlike the raw-data pipeline's queued ingest, and that is a
   * deliberate difference rather than an oversight. A raw dataset is 100k rows
   * and the author expects to come back later; a knowledge file has to fit inside
   * a 60k-token prompt, so it is small by construction and the useful answer —
   * "this fits" or "this is 11,000 tokens too big" — is only knowable after
   * parsing. Deferring it to a worker would replace one clear refusal with a
   * pending row the author has to poll and then clean up.
   *
   * Order matters: parse, render, *then* check the budget, and only create the
   * row once it is known to be usable. Anything refused leaves nothing behind but
   * the multer temp file, which the controller's cleanup removes.
   */
  async uploadFile(
    dto: UploadKnowledgeFileDto,
    file: { path: string; originalname: string; size: number; mimetype?: string },
  ) {
    await this.assertAgent(dto.agentId);

    const fileType = detectKnowledgeFileType(file.originalname);
    if (!fileType) {
      throw this.badRequest(
        `"${file.originalname}" is not a supported file. Upload a ${Object.keys(KNOWLEDGE_FILE_EXTENSIONS)
          .map((e) => `.${e}`)
          .join(' or ')} file.`,
        'unsupported_file_type',
      );
    }

    let parsed;
    try {
      parsed = await parseTableFile(file.path, fileType, file.originalname);
    } catch (err) {
      if (err instanceof TableParseError) {
        throw this.badRequest(err.message, 'unreadable_file');
      }
      throw err;
    }

    const name =
      dto.name?.trim() || file.originalname.replace(/\.[^.]+$/, '').trim() || 'Uploaded file';
    const description = dto.description.trim();
    const content = renderTable(parsed, fileType);
    const contentBytes = Buffer.byteLength(content, 'utf8');

    await this.assertQuota(dto.agentId, contentBytes);

    // The check that makes this feature honest. Without retrieval the whole table
    // rides along on every message, so a file that does not fit the pack budget
    // can never be used — and finding that out at upload, with the numbers and the
    // arithmetic shown, is the difference between a limit and a mystery.
    const budget = await this.training.previewPackTokens(dto.agentId, {
      name,
      description,
      text: content,
    });
    if (!budget.fits) {
      throw new BadRequestException({
        message:
          `This file would take this agent to ${budget.tokenCount.toLocaleString()} tokens, over the ` +
          `${budget.limit.toLocaleString()} limit — everything an agent knows is sent on every message, ` +
          `so the whole table has to fit. Remove columns you do not need, split the sheet, or ` +
          `disable another source.`,
        error: 'knowledge_too_large',
        tokenCount: budget.tokenCount,
        currentTokens: budget.currentTokens,
        limit: budget.limit,
        rowCount: parsed.totalRows,
        sheetCount: parsed.sheets.length,
      });
    }

    const chunks = chunkTable(parsed, fileType);

    const source = await this.prisma.chatAgentKnowledgeSource.create({
      data: {
        agentId: dto.agentId,
        name,
        type: FILE_KNOWLEDGE_TYPE,
        location: content,
        description,
        fileName: file.originalname,
        status: 'ready',
        chunkCount: chunks.length,
        rowCount: parsed.totalRows,
        sheetCount: parsed.sheets.length,
        contentBytes,
        fileBytes: file.size,
        mimeType: file.mimetype ?? null,
        // Covers the description as well as the table: re-wording what a column
        // means changes the compiled pack, so it has to register as staleness.
        contentHash: sha256(`${description}\n${content}`),
        lastSynced: new Date(),
        chunks: {
          create: chunks.map((chunk, position) => ({ content: chunk, position })),
        },
      },
    });

    // Storage last, and non-fatally. The extracted text is already committed, so
    // the agent can answer from this source whether or not the original survives.
    // Failing the whole upload here would discard a perfectly good source over a
    // lost download.
    let storageKey: string | null = null;
    try {
      storageKey = await this.storage.persist(
        file.path,
        source.id,
        dto.agentId,
        fileType,
        file.mimetype,
      );
      await this.prisma.chatAgentKnowledgeSource.update({
        where: { id: source.id },
        data: { storageKey },
      });
    } catch (err) {
      await removeQuietly(file.path);
      this.logger.warn(
        `Kept extracted text but could not store the original for source ${source.id}: ${(err as Error)?.message}`,
      );
    }

    return {
      source: this.toDetailApi({ ...source, storageKey }),
      // Reported rather than embedded in the source: these are facts about *this
      // upload*, and the author is deciding right now whether to keep it.
      report: {
        rowCount: parsed.totalRows,
        sheetCount: parsed.sheets.length,
        sheets: parsed.sheets.map((sheet) => ({
          name: sheet.name,
          rowCount: sheet.rows.length,
          columns: sheet.headers,
        })),
        chunkCount: chunks.length,
        tokenCount: budget.tokenCount,
        tokenLimit: budget.limit,
        truncated: parsed.truncated,
        truncationReason: parsed.truncationReason,
        durableStorage: this.storage.durable,
      },
    };
  }

  /**
   * A presigned S3 URL the client can hand to the browser as a download link.
   *
   * 410 when the source has no stored file — the extracted text is unaffected
   * and the agent keeps answering, so this is a normal-not-error condition
   * that the panel renders as "re-upload if you need the original back".
   */
  async getFile(id: string) {
    const source = await this.prisma.chatAgentKnowledgeSource.findUnique({
      where: { id },
      select: { id: true, type: true, fileName: true, storageKey: true },
    });
    if (!source) throw new NotFoundException('Knowledge source not found');
    if (source.type !== FILE_KNOWLEDGE_TYPE) {
      throw this.badRequest('This source is not an uploaded file', 'wrong_type');
    }
    const url = await this.storage.resolve(source.storageKey, source.fileName);
    if (!url) {
      throw new GoneException({
        message:
          'The original file is no longer stored on the server. This does not affect the agent — it answers from the extracted text, which is kept in the database. Re-upload the file if you need the original back.',
        error: 'file_not_stored',
      });
    }
    return {
      url,
      expiresIn: KNOWLEDGE_DOWNLOAD_URL_TTL_SECONDS,
      fileName: source.fileName,
    };
  }

  private async assertAgent(agentId: string) {
    const agent = await this.prisma.chatAgent.findUnique({
      where: { id: agentId },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  /**
   * Storage used by one agent.
   *
   * ⚠️ Scoped to the agent, which it was **not** before file upload existed: the
   * aggregate ran over every row in the table, so one agent's knowledge consumed
   * every other agent's quota, and the message ("your 2.0 MB limit") described a
   * per-agent limit that was being enforced globally. Harmless while every source
   * was a hand-pasted paragraph; immediately blocking once a single upload can be
   * megabytes. If a tenant-wide ceiling is wanted later it should be its own
   * check, with its own message, not this one silently doing both jobs.
   */
  private async usedBytes(agentId: string): Promise<number> {
    const { _sum } = await this.prisma.chatAgentKnowledgeSource.aggregate({
      where: { agentId },
      _sum: { contentBytes: true },
    });
    return _sum.contentBytes ?? 0;
  }

  private async assertQuota(agentId: string, incomingBytes: number, previousBytes = 0) {
    if (incomingBytes === 0) return;
    const used = await this.usedBytes(agentId);
    const projected = used - previousBytes + incomingBytes;
    if (projected > KNOWLEDGE_BYTES_LIMIT) {
      throw this.badRequest(
        `This would use ${formatBytes(projected)} of your ${formatBytes(KNOWLEDGE_BYTES_LIMIT)} knowledge limit. ` +
          `Remove a source or upgrade your plan.`,
        'quota_exceeded',
      );
    }
  }

  private toListApi(source: ListRow | ChatAgentKnowledgeSource) {
    return {
      id: source.id,
      name: source.name,
      type: source.type,
      status: source.status,
      error: source.error,
      enabled: source.enabled,
      description: source.description,
      fileName: source.fileName,
      rowCount: source.rowCount,
      sheetCount: source.sheetCount,
      chunkCount: source.chunkCount,
      contentBytes: source.contentBytes,
      fileBytes: source.fileBytes,
      mimeType: source.mimeType,
      contentHash: source.contentHash,
      embeddedHash: source.embeddedHash,
      embeddedAt: source.embeddedAt,
      lastSynced: source.lastSynced,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      untrained:
        source.status === 'ready' &&
        source.contentHash !== null &&
        source.contentHash !== source.embeddedHash,
    };
  }

  private toDetailApi(source: ChatAgentKnowledgeSource) {
    return {
      ...this.toListApi(source),
      content: source.type === TEXT_KNOWLEDGE_TYPE ? source.location : null,
      // For a file this is the *rendered* table — what the model will actually
      // read. Surfaced under its own key rather than as `content` because it is
      // not editable, and an editor bound to it would silently discard changes.
      extractedText: source.type === FILE_KNOWLEDGE_TYPE ? source.location : null,
      pairs: null,
      url: source.type === 'website' ? source.location : null,
    };
  }

  private badRequest(
    message: string,
    code: string,
    issues?: { path: string; message: string }[],
  ) {
    return new BadRequestException({
      message,
      error: code,
      ...(issues ? { issues, details: issues.map((issue) => issue.message) } : {}),
    });
  }
}
