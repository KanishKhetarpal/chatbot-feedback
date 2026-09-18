export type FieldIssue = { path: string; message: string };

export class ChatAgentValidationError extends Error {
  constructor(readonly issues: FieldIssue[]) {
    super(issues[0]?.message ?? 'Request validation failed');
    this.name = 'ChatAgentValidationError';
  }
}

/** Origin only: scheme + host + port. No path, query, or hash. */
export function normalizeOrigin(value: string, path = 'allowedOrigins'): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChatAgentValidationError([
      { path, message: 'Use a full URL with scheme, e.g. https://acharya.ac.in' },
    ]);
  }

  if (url.username || url.password) {
    throw new ChatAgentValidationError([{ path, message: 'Origin must not include credentials' }]);
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new ChatAgentValidationError([
      { path, message: 'Origin only — no path (https://acharya.ac.in, not …/admissions)' },
    ]);
  }

  return url.origin;
}

export function normalizeOrigins(values: string[]): string[] {
  const issues: FieldIssue[] = [];
  const origins: string[] = [];

  values.forEach((value, index) => {
    try {
      origins.push(normalizeOrigin(value, `allowedOrigins.${index}`));
    } catch (err) {
      if (err instanceof ChatAgentValidationError) issues.push(...err.issues);
      else throw err;
    }
  });

  if (issues.length) throw new ChatAgentValidationError(issues);
  return origins;
}

export function emptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
