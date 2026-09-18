/**
 * Where an uploaded knowledge file lives after the request that carried it.
 *
 * **S3-backed.** The original file is streamed from multer's OS-temp write to
 * S3 under `chat-agents/{agentId}/knowledge/{sourceId}.{ext}`, and the local
 * copy is dropped immediately. Downloads are handed back as presigned GET URLs
 * (15-min TTL) with a `ResponseContentDisposition` set so the browser keeps
 * the original filename.
 *
 * `ChatAgentKnowledgeSource.storageKey` holds the S3 object key. The public
 * surface — `persist` / `resolve` / `discard`, opaque `storageKey` — is
 * unchanged from the previous local-disk backend.
 *
 * If `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are unset the service is
 * inert: `persist` throws 503 (same shape as `DocumentsService`), `resolve`
 * returns null, `discard` is a no-op. Never store anything on the container
 * filesystem — it is ephemeral on Railway.
 */
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import type { KnowledgeFileType } from './knowledge.constants';

/** Delete if present. Never throws — every caller is already on a cleanup path. */
export async function removeQuietly(filePath: string | undefined | null): Promise<void> {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => undefined);
}

const DOWNLOAD_URL_TTL_SECONDS = 900;

@Injectable()
export class KnowledgeFileStorageService {
  private readonly logger = new Logger(KnowledgeFileStorageService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET ?? 'acharya-crm-documents';
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION ?? 'ap-south-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    }
  }

  /** True once this is backed by object storage. Reported by the API so the UI can be honest about durability. */
  get durable(): boolean {
    return this.s3Client !== null;
  }

  /**
   * Take ownership of the file multer wrote and park it in S3 under a name we
   * chose.
   *
   * The caller's filename never becomes an S3 key — a UUID does, prefixed by
   * agent id. The original name is kept on the row for display and is stamped
   * onto the presigned download via `ResponseContentDisposition`.
   */
  async persist(
    localPath: string,
    sourceId: string,
    agentId: string,
    fileType: KnowledgeFileType,
    contentType?: string | null,
  ): Promise<string> {
    if (!this.s3Client) {
      throw new ServiceUnavailableException(
        'S3 is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars.',
      );
    }
    const key = `chat-agents/${agentId}/knowledge/${sourceId}.${fileType}`;
    try {
      const body = fs.createReadStream(localPath);
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType ?? undefined,
        }),
      );
    } finally {
      await removeQuietly(localPath);
    }
    return key;
  }

  /**
   * A short-lived presigned GET URL for the stored file, or null if it cannot
   * be reached (no S3 client, no key). `fileName` is stamped onto the download
   * via `ResponseContentDisposition` so the browser preserves it.
   */
  async resolve(
    storageKey: string | null,
    fileName?: string | null,
  ): Promise<string | null> {
    if (!storageKey || !this.s3Client) return null;
    const safeName = (fileName ?? 'knowledge-file').replace(/"/g, '');
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  }

  /** Best-effort delete. A storage hiccup must not fail deleting a source. */
  async discard(storageKey: string | null): Promise<void> {
    if (!storageKey || !this.s3Client) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
    } catch (err) {
      this.logger.warn(
        `Could not delete knowledge file ${storageKey}: ${(err as Error).message}`,
      );
    }
  }
}

/** How long a download URL stays valid, in seconds. */
export const KNOWLEDGE_DOWNLOAD_URL_TTL_SECONDS = DOWNLOAD_URL_TTL_SECONDS;

/** Multer needs a unique on-disk name before the source row exists. */
export const knowledgeIncomingName = () => randomUUID();
