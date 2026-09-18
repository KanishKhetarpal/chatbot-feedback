import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { Request } from 'express';
import { removeQuietly } from './knowledge-file-storage.service';

/**
 * Delete multer's temp file once the request is over, however it ended.
 *
 * The same hazard `raw-data-lead/upload-cleanup.interceptor.ts` was written for,
 * and it applies here for the same reason: Nest runs pipes **inside** the
 * interceptor chain, so a request the global `ValidationPipe` refuses — a missing
 * `description`, a malformed `agentId` — is rejected after multer has already
 * streamed the body to disk and before any handler code runs. Nothing would ever
 * come back for that file.
 *
 * Must be listed *outside* `FileInterceptor` in `@UseInterceptors` so it wraps it.
 *
 * `finalize` rather than `catchError`: it fires on success too, where the file has
 * already been moved by `persist` and the unlink is a harmless no-op. One path, no
 * branching on how the request ended.
 */
@Injectable()
export class KnowledgeUploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { file?: { path?: string } }>();
    return next.handle().pipe(finalize(() => void removeQuietly(req.file?.path)));
  }
}
