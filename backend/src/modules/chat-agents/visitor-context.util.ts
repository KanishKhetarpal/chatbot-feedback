/**
 * What can be known about a visitor before they type a word.
 *
 * Two sources, and the split matters. The **request** carries the IP and the
 * User-Agent: the browser does not know its own address, and anything a client
 * sends about itself can be edited, so these are read server-side and never
 * accepted from the body. The **widget** contributes what only it can see — the
 * page it is embedded on, and the browser's timezone.
 *
 * Hand-rolled rather than pulling in a UA parser. The full libraries carry
 * thousands of device signatures to answer questions this product never asks;
 * what is wanted here is "Chrome on Android" for a staff member reading an inbox,
 * and being wrong about an obscure browser costs nothing. Revisit if that ever
 * stops being true.
 */

export interface VisitorContext {
  ipAddress: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  timezone: string | null;
  language: string | null;
  pageUrl: string | null;
  referrer: string | null;
}

/** Order matters: every one of these also claims to be something earlier. */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\/([\d.]+)/, 'Edge'],
  [/\bOPR\/([\d.]+)|\bOpera\/([\d.]+)/, 'Opera'],
  [/\bSamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
  [/\bFxiOS\/([\d.]+)|\bFirefox\/([\d.]+)/, 'Firefox'],
  [/\bCriOS\/([\d.]+)/, 'Chrome'],
  [/\bChrome\/([\d.]+)/, 'Chrome'],
  // Last: Chrome, Edge and Opera all claim Safari in their UA string.
  [/\bVersion\/([\d.]+).*\bSafari\//, 'Safari'],
];

const OSES: [RegExp, string][] = [
  [/\bWindows NT 10/, 'Windows'],
  [/\bWindows NT/, 'Windows'],
  [/\bAndroid\b/, 'Android'],
  // Before macOS: an iPad in desktop mode reports "Macintosh" too, but keeps
  // "iPhone"/"iPad" when it does not.
  [/\biPhone\b|\biPad\b|\biPod\b/, 'iOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
];

const BOT = /bot|crawler|spider|crawling|headless|preview|monitor|curl|wget|python-requests/i;

function detectDeviceType(ua: string): string {
  if (BOT.test(ua)) return 'bot';
  if (/\biPad\b|\bTablet\b|\bAndroid\b(?!.*\bMobile\b)/i.test(ua)) return 'tablet';
  if (/\bMobi|\biPhone\b|\bAndroid\b/i.test(ua)) return 'mobile';
  return 'desktop';
}

function firstMatch(ua: string, table: [RegExp, string][]): string | null {
  for (const [pattern, label] of table) {
    const hit = ua.match(pattern);
    if (hit) {
      const version = hit.slice(1).find(Boolean);
      return version ? `${label} ${version.split('.')[0]}` : label;
    }
  }
  return null;
}

/**
 * The caller's address.
 *
 * `req.ip` is preferred, and not merely as a convenience: Express walks back
 * exactly as many `X-Forwarded-For` hops as `trust proxy` says are real (1, set
 * in `main.ts`). Reading the header's first entry directly would be **spoofable**
 * — anyone can prepend an address of their choosing to their own request, and an
 * IP recorded for abuse investigation that the abuser chose is worse than none.
 *
 * The header fallback exists only for a deployment where `trust proxy` was never
 * configured, and inherits that weakness; it is a last resort, not the intent.
 *
 * ⚠️ `trust proxy` must match the real number of hops. Set it to 1 behind two
 * proxies and this records the inner proxy instead of the visitor — which is
 * exactly what a forged two-hop chain produced under test.
 *
 * IPv6-mapped IPv4 (`::ffff:1.2.3.4`) is unwrapped so the same visitor does not
 * appear under two spellings.
 */
export function readIp(
  ip: string | undefined,
  forwardedFor: string | undefined,
): string | null {
  const candidate = ip || forwardedFor?.split(',')[0]?.trim();
  if (!candidate) return null;
  const unwrapped = candidate.replace(/^::ffff:/i, '');
  return unwrapped.slice(0, 45) || null;
}

const clip = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

export function buildVisitorContext(input: {
  ip?: string;
  forwardedFor?: string;
  userAgent?: string;
  acceptLanguage?: string;
  /** Volunteered by the widget — it is the only thing that can see them. */
  timezone?: string;
  pageUrl?: string;
  referrer?: string;
}): VisitorContext {
  const ua = clip(input.userAgent, 1000);

  return {
    ipAddress: readIp(input.ip, input.forwardedFor),
    userAgent: ua,
    browser: ua ? firstMatch(ua, BROWSERS) : null,
    os: ua ? firstMatch(ua, OSES) : null,
    deviceType: ua ? detectDeviceType(ua) : null,
    // `en-GB,en;q=0.9` → `en-GB`. The weighted list is more than anyone reading
    // an inbox needs.
    language: clip(input.acceptLanguage?.split(',')[0], 20),
    timezone: clip(input.timezone, 64),
    pageUrl: clip(input.pageUrl, 2000),
    referrer: clip(input.referrer, 2000),
  };
}
