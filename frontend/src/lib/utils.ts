import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parse, format, formatDistanceToNowStrict, startOfDay, endOfDay } from "date-fns";
import {
  detectCountryFromNumber,
  isValidInternationalPhone,
  MIN_TOTAL_DIGITS,
} from "@/lib/phone-countries";
import * as React from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const getReadableDate = (date?: string | null) => {
  if (!date) return "";

  // Support DD-MM-YYYY and DD/MM/YYYY by constructing a local Date
  const ddMmYyyyPattern = /^(\d{1,2})[-/]?(\d{1,2})[-/]?(\d{4})$/;
  const match = date.match(ddMmYyyyPattern);

  let parsedDate: Date | null = null;
  if (match) {
    const [, day, month, year] = match;
    parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    // Try common ISO-like formats
    const formats = ["yyyy-MM-dd", "yyyy/MM/dd"];
    for (const f of formats) {
      const d = parse(date, f, new Date());
      if (!isNaN(d.getTime())) {
        parsedDate = d;
        break;
      }
    }
    // Fallback to native Date parsing
    if (!parsedDate) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) parsedDate = d;
    }
  }

  if (!parsedDate || isNaN(parsedDate.getTime())) return date;
  return format(parsedDate, "d MMM yyyy"); // e.g., 2 Jun 2025
};
/**
 * Compact relative time for feeds — "2m", "5h", "3d". Falls back to an absolute date
 * past a week, where "47 days ago" stops being easier to read than the date itself.
 */
export const getRelativeTime = (date?: string | null): string => {
  if (!date) return "";

  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return "";

  const ageMs = Date.now() - parsed.getTime();
  if (ageMs < 60_000) return "just now";
  if (ageMs > 7 * 24 * 60 * 60 * 1000) return format(parsed, "d MMM");

  return formatDistanceToNowStrict(parsed)
    .replace(/ minutes?$/, "m")
    .replace(/ hours?$/, "h")
    .replace(/ days?$/, "d")
    .replace(/ seconds?$/, "s");
};

export const capitalizeWords = (text: string): string => {
  return text
    ?.toLowerCase()
    .split(/[ _-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
const NAME_CONNECTORS = new Set(["of", "and", "the", "for", "in", "at"]);

/** Degree/qualification acronyms that read as words, so the vowel test below
 * can't spot them. Anything vowel-less (BM, NRV, SMT, PVT) is caught for free. */
const NAME_ACRONYMS = new Set(["MBA", "BBA", "BCA", "MCA", "BSC", "MSC", "PUC", "NRI", "UG", "PG"]);

/**
 * Title-case an institution / program name without flattening its acronyms.
 *
 * The imported course columns are a mix of ALL CAPS and properly cased rows, so
 * `capitalizeWords` alone renders "ACHARYA BM REDDY COLLEGE OF PHARMACY" as
 * "Acharya Bm Reddy College Of Pharmacy". Connectors are checked first ("OF"
 * would otherwise look like an acronym), then a token is only left as written
 * when it's short and either vowel-less or a known acronym — so "PRE" becomes
 * "Pre" while "NRV" and "MBA" survive.
 */
export const titleCaseName = (value?: string | null): string => {
  const text = String(value ?? "").trim();
  if (!text) return "";

  return text
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && NAME_CONNECTORS.has(lower)) return lower;
      if (word.length <= 4 && /^[A-Z]+$/.test(word)) {
        if (NAME_ACRONYMS.has(word) || !/[AEIOU]/.test(word)) return word;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
};

/**
 * Recombine a lead's stored mobile with its dial code into a dialable number.
 *
 * The backend strips the leading `+` before writing `Lead.mobile`, so an
 * international number lands as `14155551234` with the country context kept
 * separately in `Lead.mobileCountryCode` (`"+1"`). Legacy India rows predate that
 * column: they hold a bare 10-digit number and a null dial code, and are left as-is.
 */
export const formatMobileWithCountryCode = (
  mobile?: string | null,
  mobileCountryCode?: string | null,
): string => {
  const number = String(mobile ?? "").trim();
  if (!number) return "";
  if (number.startsWith("+")) return number;

  const dialCode = String(mobileCountryCode ?? "")
    .trim()
    .replace(/^\+/, "");
  if (!dialCode) return number;

  // The stored number usually already carries the dial code minus the `+`.
  if (number.length > dialCode.length && number.startsWith(dialCode)) return `+${number}`;
  return `+${dialCode}${number}`;
};

/** Just the digits of a phone value — separators, spaces and the `+` stripped. */
export const phoneDigits = (value?: string | number | null): string =>
  String(value ?? "").replace(/\D/g, "");

/**
 * Prefer `mobileE164` only when it actually contains a subscriber number.
 * Cached/partial profile payloads (and some PATCH responses) leave it null or
 * as a dial code like `+91` — both are truthy enough to hide `mobile` via `||`.
 */
export const pickDisplayMobile = (mobile?: string | null, mobileE164?: string | null): string => {
  const e164 = String(mobileE164 ?? "").trim();
  const local = String(mobile ?? "").trim();
  if (phoneDigits(e164).length >= MIN_TOTAL_DIGITS) return e164;
  return local || e164;
};

/** Group national digits for display — India 10-digit as `95481 12836`, NANP as `415 555 1234`.
 * Incomplete groups (fewer than 4 digits) only appear at the end. */
function groupNationalDigits(national: string, dial?: string): string {
  if (national.length === 10) {
    if (dial === "1") {
      return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
    }
    // India (+91) and other 10-digit nationals: five + five.
    return `${national.slice(0, 5)} ${national.slice(5)}`;
  }
  if (national.length <= 4) return national;

  const parts: string[] = [];
  let rest = national;
  while (rest.length > 4) {
    parts.push(rest.slice(0, 4));
    rest = rest.slice(4);
  }
  if (rest) parts.push(rest);
  return parts.join(" ");
}

/**
 * `+91 95481 12836` — dial code, then national digits in groups of five.
 * Strips a leading dial code off `mobile` when the stored value already
 * includes it (`919548112836` + `+91`).
 */
export const formatMobileGrouped = (
  mobile?: string | null,
  mobileCountryCode?: string | null,
): string => {
  const dial = String(mobileCountryCode ?? "").trim();
  const dialDigits = dial.replace(/^\+/, "");
  let national = phoneDigits(mobile);
  if (dialDigits && national.startsWith(dialDigits) && national.length > dialDigits.length) {
    national = national.slice(dialDigits.length);
  }

  const grouped = national.replace(/(\d{5})(?=\d)/g, "$1 ").trim();
  if (dial && grouped) {
    const prefix = dial.startsWith("+") ? dial : `+${dial}`;
    return `${prefix} ${grouped}`;
  }
  return grouped || dial;
};

/**
 * Human-readable phone for UI: `+91 95481 12836`.
 * Keeps `formatMobileWithCountryCode` compact for `tel:` / IVR payloads.
 */
export const formatMobileDisplay = (
  mobile?: string | null,
  mobileCountryCode?: string | null,
): string => {
  const e164 = formatMobileWithCountryCode(mobile, mobileCountryCode);
  if (!e164) return "";

  const digits = phoneDigits(e164);
  if (!digits) return e164;

  let dial = String(mobileCountryCode ?? "")
    .trim()
    .replace(/^\+/, "");
  let national = "";

  if (dial && digits.startsWith(dial) && digits.length > dial.length) {
    national = digits.slice(dial.length);
  } else if (e164.startsWith("+")) {
    const country = detectCountryFromNumber(e164);
    if (country) {
      dial = country.dialCode.replace(/^\+/, "");
      national = digits.slice(dial.length);
    }
  } else if (digits.length === 10) {
    // Legacy bare India mobile — no dial code stored.
    return groupNationalDigits(digits, "91");
  }

  if (!dial || !national) return e164;
  return `+${dial} ${groupNationalDigits(national, dial)}`;
};
/**
 * Country-aware mobile validation, shared by every phone Zod schema.
 *
 * Values with a leading `+` are checked against real per-country subscriber
 * lengths (see `NATIONAL_NUMBER_LENGTH` in `lib/phone-countries.ts`). Values
 * without one are legacy stored leads holding a bare 10-digit Indian number,
 * which keep the historical exact-10 check.
 */
export const isValidOtpPhone = (value?: string | null): boolean => {
  const digits = phoneDigits(value);
  if (!digits) return false;

  if (!(value ?? "").trim().startsWith("+")) return digits.length === 10;

  return isValidInternationalPhone(digits);
};

export const formatCurrency = (amount?: number): string => {
  if (!amount) return "0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatCompactCurrency = (amount?: number): string => {
  if (amount === undefined || amount === null || amount === 0) return "₹0";

  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (absAmount >= 10000000) {
    return `${sign}₹${Number((absAmount / 10000000).toFixed(2))} Cr`;
  }
  if (absAmount >= 100000) {
    return `${sign}₹${Number((absAmount / 100000).toFixed(2))} L`;
  }
  if (absAmount >= 1000) {
    return `${sign}₹${Number((absAmount / 1000).toFixed(2))} K`;
  }
  return `${sign}${formatCurrency(absAmount)}`;
};

export const formatCompactNumber = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) return "0";

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 10000000) {
    return `${sign}${Number((abs / 10000000).toFixed(1))}Cr`;
  }
  if (abs >= 100000) {
    return `${sign}${Number((abs / 100000).toFixed(1))}L`;
  }
  if (abs >= 1000) {
    return `${sign}${Number((abs / 1000).toFixed(1))}K`;
  }
  return `${sign}${abs}`;
};

/** Two-letter monogram for avatar circles (e.g. "Ankit Kumar" → "AK"). */
export const getInitials = (name?: string | null, maxWords = 2): string => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, maxWords);
  if (!parts.length) return "";
  return parts
    .map((w) => w[0])
    .join("")
    .toUpperCase();
};

/** Clock time for schedule rows — "3:00 PM". */
export const getReadableTime = (date?: string | null): string => {
  if (!date) return "";
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return "";
  return format(parsed, "h:mm a");
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accept a `yyyy-MM-dd` search param; anything else is dropped. */
export function parseYmdSearch(value: unknown): string | undefined {
  return typeof value === "string" && YMD_RE.test(value) ? value : undefined;
}

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Start of a local calendar day as ISO — matches the leads/applications filter bar. */
export function ymdToStartIso(ymd: string): string {
  return startOfDay(ymdToLocalDate(ymd)).toISOString();
}

/** End of a local calendar day as ISO — matches the leads/applications filter bar. */
export function ymdToEndIso(ymd: string): string {
  return endOfDay(ymdToLocalDate(ymd)).toISOString();
}

/**
 * The `?from=&to=` pair a list page needs to show the same window a dashboard
 * tile counted. Absent bounds are dropped rather than sent as empty strings.
 */
export function dateSearchFromFilters(filters: { from?: string; to?: string }): {
  from?: string;
  to?: string;
} {
  return {
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  };
}

/**
 * `2026-08` → `Aug 2026`, `2026-08-14` → `14 Aug 2026`.
 *
 * Reports receive periods in their sortable form, which is right for a key and
 * wrong for a heading. Parsed by parts rather than by `new Date("2026-08")` —
 * that string parses as UTC midnight and renders as July for anyone west of
 * Greenwich.
 *
 * Anything else is passed through untouched: the weekly grains send the
 * client's own week labels, which are already prose and must not be reworded
 * into something their sheet does not say.
 */
export function formatPeriodLabel(period: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) return format(new Date(+month[1], +month[2] - 1, 1), "MMM yyyy");
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
  if (day) return format(new Date(+day[1], +day[2] - 1, +day[3]), "d MMM yyyy");
  return period;
}

// ── Intl date formatting (formerly lib/format.ts) ──

export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
) {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: opts.month ?? "long",
      day: opts.day ?? "numeric",
      year: opts.year ?? "numeric",
      ...opts,
    }).format(new Date(date));
  } catch (_err) {
    return "";
  }
}

// ── React ref composition (formerly lib/compose-refs.ts) ──

type PossibleRef<T> = React.Ref<T> | undefined;

/**
 * Set a given ref to a given value
 * This utility takes care of different types of refs: callback refs and RefObject(s)
 */
function setRef<T>(ref: PossibleRef<T>, value: T) {
  if (typeof ref === "function") {
    return ref(value);
  }

  if (ref !== null && ref !== undefined) {
    ref.current = value;
  }
}

/**
 * A utility to compose multiple refs together
 * Accepts callback refs and RefObject(s)
 */
function composeRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  return (node) => {
    let hasCleanup = false;
    const cleanups = refs.map((ref) => {
      const cleanup = setRef(ref, node);
      if (!hasCleanup && typeof cleanup === "function") {
        hasCleanup = true;
      }
      return cleanup;
    });

    // React <19 will log an error to the console if a callback ref returns a
    // value. We don't use ref cleanups internally so this will only happen if a
    // user's ref callback returns a value, which we only expect if they are
    // using the cleanup functionality added in React 19.
    if (hasCleanup) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i];
          if (typeof cleanup === "function") {
            cleanup();
          } else {
            setRef(refs[i], null);
          }
        }
      };
    }
  };
}

/**
 * A custom hook that composes multiple refs
 * Accepts callback refs and RefObject(s)
 */
function useComposedRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  // biome-ignore lint/correctness/useExhaustiveDependencies: we don't want to re-run this callback when the refs change
  return React.useCallback(composeRefs(...refs), refs);
}

export { composeRefs, useComposedRefs };

/** Drop undefined / null / empty entries so they are never serialized into a query string. */
export const cleanParams = (
  params: Record<string, string | undefined | null>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
};

/**
 * Read a list response whichever shape it arrives in — a bare array or the CRM's
 * `{ data, meta }` envelope.
 *
 * Deliberately tolerant: a screen that renders nothing because a response grew a wrapper is
 * the most annoying possible failure, and it looks identical to "there is no data".
 */
export function unwrapList<T>(body: { data?: T[] } | T[] | null | undefined): T[] {
  if (Array.isArray(body)) return body;
  return Array.isArray(body?.data) ? body.data : [];
}
