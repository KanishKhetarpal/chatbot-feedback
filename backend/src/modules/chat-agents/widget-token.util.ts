import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * The anonymous visitor token.
 *
 * A website visitor has no account, so the widget is handed an opaque token on
 * first contact and sends it back on every turn. It carries the visitor id, the
 * agent it belongs to, and when it was issued, signed so the server can tell its
 * own tokens from invented ones.
 *
 * ⚠️ **This is identity, not authentication.** The browser holds it, so the
 * browser can throw it away and ask for another. It gives conversation
 * continuity, per-visitor fairness, and something to attach a lead to later —
 * it does not stop a determined caller, and nothing that bounds spend may depend
 * on it alone. That job belongs to the agent-scoped rate limit, whose key the
 * caller cannot change.
 *
 * Format: `v1.<base64url(payload)>.<base64url(hmac)>`. Self-contained on purpose
 * — verifying a token costs no database round trip.
 */

const VERSION = 'v1';

/** Tokens older than this are refused and the widget starts a new session. */
export const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface VisitorTokenPayload {
  /** Visitor id — the primary key of `chat_widget_visitors`. */
  v: string;
  /** Agent id. Present so a token minted for one agent cannot be used on another. */
  a: string;
  /** Issued-at, epoch milliseconds. */
  t: number;
}

export class InvalidVisitorTokenError extends Error {}

/**
 * The signing key.
 *
 * `WIDGET_TOKEN_SECRET` when set. Otherwise derived from `JWT_SECRET` through a
 * hash with a fixed label, so a working app needs no new configuration while the
 * widget key is still not the JWT key — leaking one must not hand over the
 * other. Refuses to sign with nothing at all: an unsigned token is a forgeable
 * one, and failing loudly beats a security property that silently isn't there.
 */
function signingKey(): Buffer {
  const explicit = process.env.WIDGET_TOKEN_SECRET;
  if (explicit) return Buffer.from(explicit, 'utf8');

  const jwt = process.env.JWT_SECRET;
  if (!jwt) {
    throw new Error(
      'Cannot sign widget visitor tokens: set WIDGET_TOKEN_SECRET (or JWT_SECRET).',
    );
  }
  return createHash('sha256').update(`widget-visitor-token:${jwt}`).digest();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadPart: string): string {
  return createHmac('sha256', signingKey()).update(payloadPart).digest('base64url');
}

export function issueVisitorToken(visitorId: string, agentId: string, now = Date.now()): string {
  const payload: VisitorTokenPayload = { v: visitorId, a: agentId, t: now };
  const payloadPart = b64url(JSON.stringify(payload));
  return `${VERSION}.${payloadPart}.${sign(payloadPart)}`;
}

/**
 * Verify and decode, or throw.
 *
 * Signature is compared with `timingSafeEqual` — a plain `===` on an HMAC leaks
 * how much of a guess was right through response timing, which is exactly how
 * you forge one byte at a time.
 */
export function readVisitorToken(token: string, now = Date.now()): VisitorTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new InvalidVisitorTokenError('Malformed token');
  }

  const [, payloadPart, signaturePart] = parts;
  const expected = Buffer.from(sign(payloadPart), 'utf8');
  const actual = Buffer.from(signaturePart, 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new InvalidVisitorTokenError('Bad signature');
  }

  let payload: VisitorTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidVisitorTokenError('Unreadable payload');
  }

  if (typeof payload?.v !== 'string' || typeof payload?.a !== 'string' || typeof payload?.t !== 'number') {
    throw new InvalidVisitorTokenError('Incomplete payload');
  }
  if (now - payload.t > TOKEN_MAX_AGE_MS) {
    throw new InvalidVisitorTokenError('Token expired');
  }

  return payload;
}
