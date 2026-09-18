/**
 * The web app's own origin(s), from `FRONTEND_URL` (comma-separated).
 *
 * Used twice: as the CORS allowlist for the authenticated API, and as the
 * origin that is always allowed to talk to the public chat routes — a share
 * link or the in-app chat page is served from here, so no per-bot
 * configuration should be needed for them to work.
 */
export function frontendOrigins(): string[] {
  const raw = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  return raw
    .split(',')
    .map((o) => o.trim().toLowerCase().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function isFrontendOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return frontendOrigins().includes(origin.trim().toLowerCase().replace(/\/+$/, ''));
}
