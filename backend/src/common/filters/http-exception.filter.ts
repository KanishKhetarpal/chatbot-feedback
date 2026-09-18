import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx  = host.switchToHttp();
    const res  = ctx.getResponse<Response>();
    const req  = ctx.getRequest<Request>();

    // D10 — some middleware throws a plain Error that already carries the right HTTP
    // status. body-parser's PayloadTooLargeError is the one that bit us: it runs BEFORE
    // any controller, is not an HttpException, and so was reported as "500 Internal
    // Server Error" — telling the caller the server broke when in fact their request was
    // simply too big. Honour a sane status when the thrower supplied one.
    const carried = this.statusFromError(exception);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : carried ?? HttpStatus.INTERNAL_SERVER_ERROR;

    // R8's second door. `req.url` is path AND query string, and the query string on this
    // API routinely carries personal data: `?q=` is a name-or-phone search on
    // `/raw-records` and on leads, so any 5xx on one of those requests wrote a phone
    // number to stdout — the same leak fixed in `conversions.service.ts`, reached by a
    // different route. `req.path` is the same diagnostic minus the values; for a 500 the
    // stack trace below is the real diagnostic anyway, and the caller still receives the
    // full URL in the response body, so nothing is lost that anyone was using.
    const route = `${req.method} ${req.path}`;

    // Only a genuine 5xx is a bug worth a stack trace; a 413 is the caller's business.
    if (!(exception instanceof HttpException) && status >= 500) {
      this.logger.error(`Unhandled exception on ${route}`, exception instanceof Error ? exception.stack : String(exception));
    } else if (!(exception instanceof HttpException)) {
      this.logger.warn(`${status} on ${route}: ${(exception as Error)?.message ?? exception}`);
    }

    let message = 'Internal server error';
    let error   = 'Internal Server Error';
    let details: unknown = undefined;
    // D8 — whatever else the thrower attached to the body (see below)
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      const raw = exception.getResponse();

      if (typeof raw === 'string') {
        message = raw;
        error   = this.statusToError(status);
      } else if (typeof raw === 'object' && raw !== null) {
        const body = raw as Record<string, unknown>;
        error   = (body.error as string)   ?? this.statusToError(status);
        // ValidationPipe sends message as string[] — join into one string
        if (Array.isArray(body.message)) {
          message = (body.message as string[]).join('; ');
          details = body.message;
        } else {
          message = (body.message as string) ?? exception.message;
        }

        // D8 — keep the rest of the body instead of throwing it away.
        //
        // A thrower can attach more than a sentence. `publishVersion` throws
        // `BadRequestException({ message, ...report })` where the report carries
        // `errors` — the list of exactly which boxes are wrong and why. Only
        // `message` was ever copied out, so the caller got "Version failed
        // validation — not published." and no way to find out what to fix; the
        // detail existed and was dropped one layer before the response.
        //
        // Only fields the thrower deliberately set survive, and the canonical four
        // are never overwritten, so the documented envelope is unchanged.
        const { statusCode: _s, error: _e, message: _m, timestamp: _t, path: _p, ...rest } = body;
        if (Object.keys(rest).length > 0) extra = rest;
      }
    } else if (carried) {
      // D10 — a middleware error we recognised: say what it was, in its own words.
      message = (exception as Error)?.message ?? this.statusToError(carried);
      error = this.statusToError(carried);
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      ...(details !== undefined && { details }),
      ...extra,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }

  /**
   * D10 — the HTTP status a non-Nest error is carrying, if it is carrying a sane one.
   *
   * Deliberately narrow: only a 4xx is honoured. A library that tags its own error 500
   * tells us nothing we didn't assume, and trusting a wider range would let a random
   * `status` property on some unrelated object silently downgrade a real crash into a
   * tidy-looking 4xx — hiding exactly the bugs this filter exists to surface.
   */
  private statusFromError(exception: unknown): number | undefined {
    if (!exception || typeof exception !== 'object') return undefined;
    const e = exception as { status?: unknown; statusCode?: unknown };
    const raw = typeof e.status === 'number' ? e.status : e.statusCode;
    if (typeof raw !== 'number' || !Number.isInteger(raw)) return undefined;
    return raw >= 400 && raw < 500 ? raw : undefined;
  }

  private statusToError(status: number): string {
    const map: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      500: 'Internal Server Error',
    };
    return map[status] ?? 'Error';
  }
}
