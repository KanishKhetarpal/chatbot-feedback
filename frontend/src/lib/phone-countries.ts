/**
 * Country dial codes and national-number lengths.
 *
 * Kept out of `components/ui/phone-input.tsx` so the same table drives both the
 * picker UI and the OTP validators in `lib/utils.ts` — a number the input lets
 * you finish typing is exactly a number the "Verify" button accepts.
 *
 * @see https://github.com/mukeshsoni/country-telephone-data/blob/master/country_telephone_data.js
 * @format [iso2, dialCode]
 */
export const COUNTRY_DATA: [string, string][] = [
  ["af", "93"],
  ["ax", "358"],
  ["al", "355"],
  ["dz", "213"],
  ["as", "1684"],
  ["ad", "376"],
  ["ao", "244"],
  ["ai", "1264"],
  ["ag", "1268"],
  ["ar", "54"],
  ["am", "374"],
  ["aw", "297"],
  ["au", "61"],
  ["at", "43"],
  ["az", "994"],
  ["bs", "1242"],
  ["bh", "973"],
  ["bd", "880"],
  ["bb", "1246"],
  ["by", "375"],
  ["be", "32"],
  ["bz", "501"],
  ["bj", "229"],
  ["bm", "1441"],
  ["bt", "975"],
  ["bo", "591"],
  ["ba", "387"],
  ["bw", "267"],
  ["br", "55"],
  ["io", "246"],
  ["vg", "1284"],
  ["bn", "673"],
  ["bg", "359"],
  ["bf", "226"],
  ["bi", "257"],
  ["kh", "855"],
  ["cm", "237"],
  ["ca", "1"],
  ["cv", "238"],
  ["bq", "599"],
  ["ky", "1345"],
  ["cf", "236"],
  ["td", "235"],
  ["cl", "56"],
  ["cn", "86"],
  ["co", "57"],
  ["km", "269"],
  ["cd", "243"],
  ["cg", "242"],
  ["ck", "682"],
  ["cr", "506"],
  ["ci", "225"],
  ["hr", "385"],
  ["cu", "53"],
  ["cw", "599"],
  ["cy", "357"],
  ["cz", "420"],
  ["dk", "45"],
  ["dj", "253"],
  ["dm", "1767"],
  ["do", "1"],
  ["ec", "593"],
  ["eg", "20"],
  ["sv", "503"],
  ["gq", "240"],
  ["er", "291"],
  ["ee", "372"],
  ["et", "251"],
  ["fk", "500"],
  ["fo", "298"],
  ["fj", "679"],
  ["fi", "358"],
  ["fr", "33"],
  ["gf", "594"],
  ["pf", "689"],
  ["ga", "241"],
  ["gm", "220"],
  ["ge", "995"],
  ["de", "49"],
  ["gh", "233"],
  ["gi", "350"],
  ["gr", "30"],
  ["gl", "299"],
  ["gd", "1473"],
  ["gp", "590"],
  ["gu", "1671"],
  ["gt", "502"],
  ["gg", "44"],
  ["gn", "224"],
  ["gw", "245"],
  ["gy", "592"],
  ["ht", "509"],
  ["hn", "504"],
  ["hk", "852"],
  ["hu", "36"],
  ["is", "354"],
  ["in", "91"],
  ["id", "62"],
  ["ir", "98"],
  ["iq", "964"],
  ["ie", "353"],
  ["im", "44"],
  ["il", "972"],
  ["it", "39"],
  ["jm", "1876"],
  ["jp", "81"],
  ["je", "44"],
  ["jo", "962"],
  ["kz", "7"],
  ["ke", "254"],
  ["ki", "686"],
  ["xk", "383"],
  ["kw", "965"],
  ["kg", "996"],
  ["la", "856"],
  ["lv", "371"],
  ["lb", "961"],
  ["ls", "266"],
  ["lr", "231"],
  ["ly", "218"],
  ["li", "423"],
  ["lt", "370"],
  ["lu", "352"],
  ["mo", "853"],
  ["mk", "389"],
  ["mg", "261"],
  ["mw", "265"],
  ["my", "60"],
  ["mv", "960"],
  ["ml", "223"],
  ["mt", "356"],
  ["mh", "692"],
  ["mq", "596"],
  ["mr", "222"],
  ["mu", "230"],
  ["mx", "52"],
  ["fm", "691"],
  ["md", "373"],
  ["mc", "377"],
  ["mn", "976"],
  ["me", "382"],
  ["ms", "1664"],
  ["ma", "212"],
  ["mz", "258"],
  ["mm", "95"],
  ["na", "264"],
  ["nr", "674"],
  ["np", "977"],
  ["nl", "31"],
  ["nc", "687"],
  ["nz", "64"],
  ["ni", "505"],
  ["ne", "227"],
  ["ng", "234"],
  ["nu", "683"],
  ["nf", "672"],
  ["kp", "850"],
  ["mp", "1670"],
  ["no", "47"],
  ["om", "968"],
  ["pk", "92"],
  ["pw", "680"],
  ["ps", "970"],
  ["pa", "507"],
  ["pg", "675"],
  ["py", "595"],
  ["pe", "51"],
  ["ph", "63"],
  ["pl", "48"],
  ["pt", "351"],
  ["pr", "1"],
  ["qa", "974"],
  ["re", "262"],
  ["ro", "40"],
  ["ru", "7"],
  ["rw", "250"],
  ["bl", "590"],
  ["sh", "290"],
  ["kn", "1869"],
  ["lc", "1758"],
  ["mf", "590"],
  ["pm", "508"],
  ["vc", "1784"],
  ["ws", "685"],
  ["sm", "378"],
  ["st", "239"],
  ["sa", "966"],
  ["sn", "221"],
  ["rs", "381"],
  ["sc", "248"],
  ["sl", "232"],
  ["sg", "65"],
  ["sx", "1721"],
  ["sk", "421"],
  ["si", "386"],
  ["sb", "677"],
  ["so", "252"],
  ["za", "27"],
  ["kr", "82"],
  ["ss", "211"],
  ["es", "34"],
  ["lk", "94"],
  ["sd", "249"],
  ["sr", "597"],
  ["sz", "268"],
  ["se", "46"],
  ["ch", "41"],
  ["sy", "963"],
  ["tw", "886"],
  ["tj", "992"],
  ["tz", "255"],
  ["th", "66"],
  ["tl", "670"],
  ["tg", "228"],
  ["tk", "690"],
  ["to", "676"],
  ["tt", "1868"],
  ["tn", "216"],
  ["tr", "90"],
  ["tm", "993"],
  ["tc", "1649"],
  ["tv", "688"],
  ["vi", "1340"],
  ["ug", "256"],
  ["ua", "380"],
  ["ae", "971"],
  ["gb", "44"],
  ["us", "1"],
  ["uy", "598"],
  ["uz", "998"],
  ["vu", "678"],
  ["va", "39"],
  ["ve", "58"],
  ["vn", "84"],
  ["wf", "681"],
  ["eh", "212"],
  ["ye", "967"],
  ["zm", "260"],
  ["zw", "263"],
];

export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag?: string;
}

/**
 * Accepted subscriber-number lengths (digits after the dial code), by ISO2.
 *
 * Only countries whose lengths are well established are listed; anything missing
 * falls back to the generic E.164 bounds below, which stays permissive rather
 * than rejecting a legitimate applicant over a guessed length.
 */
export const NATIONAL_NUMBER_LENGTH: Record<string, { min: number; max: number }> = {
  IN: { min: 10, max: 10 },
  US: { min: 10, max: 10 },
  CA: { min: 10, max: 10 },
  // NANP countries sharing the bare "+1" dial code — without these, their DEFAULT
  // fallback would let any 5–12-digit national number pass for all +1 numbers.
  PR: { min: 10, max: 10 },
  DO: { min: 10, max: 10 },
  GB: { min: 9, max: 10 },
  IE: { min: 9, max: 9 },
  AU: { min: 9, max: 9 },
  NZ: { min: 8, max: 10 },
  SG: { min: 8, max: 8 },
  MY: { min: 9, max: 10 },
  ID: { min: 9, max: 12 },
  PH: { min: 10, max: 10 },
  TH: { min: 9, max: 9 },
  VN: { min: 9, max: 9 },
  KH: { min: 8, max: 9 },
  MM: { min: 8, max: 10 },
  CN: { min: 11, max: 11 },
  HK: { min: 8, max: 8 },
  MO: { min: 8, max: 8 },
  TW: { min: 9, max: 9 },
  JP: { min: 9, max: 10 },
  KR: { min: 9, max: 10 },
  NP: { min: 10, max: 10 },
  BD: { min: 10, max: 10 },
  LK: { min: 9, max: 9 },
  PK: { min: 10, max: 10 },
  AF: { min: 9, max: 9 },
  BT: { min: 8, max: 8 },
  MV: { min: 7, max: 7 },
  AE: { min: 9, max: 9 },
  SA: { min: 9, max: 9 },
  QA: { min: 8, max: 8 },
  KW: { min: 8, max: 8 },
  OM: { min: 8, max: 8 },
  BH: { min: 8, max: 8 },
  JO: { min: 9, max: 9 },
  LB: { min: 7, max: 8 },
  IL: { min: 9, max: 9 },
  IQ: { min: 10, max: 10 },
  IR: { min: 10, max: 10 },
  YE: { min: 9, max: 9 },
  TR: { min: 10, max: 10 },
  EG: { min: 10, max: 10 },
  MA: { min: 9, max: 9 },
  DZ: { min: 9, max: 9 },
  TN: { min: 8, max: 8 },
  SD: { min: 9, max: 9 },
  NG: { min: 10, max: 10 },
  GH: { min: 9, max: 9 },
  KE: { min: 9, max: 9 },
  TZ: { min: 9, max: 9 },
  UG: { min: 9, max: 9 },
  RW: { min: 9, max: 9 },
  ET: { min: 9, max: 9 },
  ZA: { min: 9, max: 9 },
  ZM: { min: 9, max: 9 },
  ZW: { min: 9, max: 9 },
  MU: { min: 7, max: 8 },
  DE: { min: 10, max: 11 },
  FR: { min: 9, max: 9 },
  IT: { min: 9, max: 10 },
  ES: { min: 9, max: 9 },
  PT: { min: 9, max: 9 },
  NL: { min: 9, max: 9 },
  BE: { min: 8, max: 9 },
  CH: { min: 9, max: 9 },
  PL: { min: 9, max: 9 },
  CZ: { min: 9, max: 9 },
  SK: { min: 9, max: 9 },
  HU: { min: 9, max: 9 },
  RO: { min: 9, max: 9 },
  GR: { min: 10, max: 10 },
  SE: { min: 7, max: 9 },
  NO: { min: 8, max: 8 },
  DK: { min: 8, max: 8 },
  FI: { min: 9, max: 10 },
  RU: { min: 10, max: 10 },
  UA: { min: 9, max: 9 },
  KZ: { min: 10, max: 10 },
  UZ: { min: 9, max: 9 },
  BR: { min: 10, max: 11 },
  MX: { min: 10, max: 10 },
  AR: { min: 10, max: 10 },
  CL: { min: 9, max: 9 },
  CO: { min: 10, max: 10 },
  PE: { min: 9, max: 9 },
};

/** Used for countries missing from the table above. */
export const DEFAULT_NATIONAL_NUMBER_LENGTH = { min: 5, max: 12 };

/** E.164 bounds on the full number (dial code + subscriber), used when no country matches. */
export const MIN_TOTAL_DIGITS = 7;
export const MAX_TOTAL_DIGITS = 15;

export function getNationalNumberLength(countryCode?: string | null) {
  if (!countryCode) return DEFAULT_NATIONAL_NUMBER_LENGTH;
  return NATIONAL_NUMBER_LENGTH[countryCode.toUpperCase()] ?? DEFAULT_NATIONAL_NUMBER_LENGTH;
}

/** `Intl.DisplayNames` construction is an ICU lookup — build one per locale, not per country. */
const regionDisplayNamesCache = new Map<string, Intl.DisplayNames | null>();

function getRegionDisplayNames(locale: string): Intl.DisplayNames | null {
  if (!regionDisplayNamesCache.has(locale)) {
    try {
      regionDisplayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
    } catch {
      regionDisplayNamesCache.set(locale, null);
    }
  }
  return regionDisplayNamesCache.get(locale) ?? null;
}

export function getCountryName(countryCode: string, locale = "en"): string {
  const regionNames = getRegionDisplayNames(locale);
  if (!regionNames) return countryCode;
  try {
    return regionNames.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

export function getCountries(): Country[] {
  return COUNTRY_DATA.map(([iso2, dialCode]): Country => {
    const code = iso2.toUpperCase();
    return {
      code,
      name: getCountryName(code),
      dialCode: `+${dialCode}`,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Built once — `getCountries()` runs ~240 `Intl.DisplayNames` lookups plus a sort. */
let cachedCountries: Country[] | null = null;
export function getCachedCountries(): Country[] {
  cachedCountries ??= getCountries();
  return cachedCountries;
}

/**
 * ISO-3166 alpha-2 (`"IN"`) to dial code (`"+91"`). The country picker only reports
 * the ISO code, but `Lead.mobileCountryCode` stores the dial code.
 */
export function getDialCodeForCountry(countryCode?: string | null): string | null {
  if (!countryCode) return null;
  const iso2 = countryCode.toLowerCase();
  const match = COUNTRY_DATA.find(([code]) => code === iso2);
  return match ? `+${match[1]}` : null;
}

/**
 * Dial code (`"+91"`) carried by a `+`-prefixed phone value, for the
 * `Lead.mobileCountryCode` column. Legacy bare numbers (no `+`) have no country
 * context, so they return null and the field is omitted from payloads.
 */
export function extractDialCode(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed.startsWith("+")) return null;
  return detectCountryFromNumber(trimmed)?.dialCode ?? null;
}

/**
 * `detectCountryFromNumber` needs longest-dial-code-first order. Cached per array
 * so a stable `countries` list is sorted once rather than on every keystroke.
 */
const dialCodeOrderCache = new WeakMap<Country[], Country[]>();

function getCountriesByDialCodeLength(countries: Country[]): Country[] {
  let sorted = dialCodeOrderCache.get(countries);
  if (!sorted) {
    sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
    dialCodeOrderCache.set(countries, sorted);
  }
  return sorted;
}

export function detectCountryFromNumber(
  value: string,
  countries: Country[] = getCachedCountries(),
): Country | undefined {
  if (!value?.startsWith("+")) return undefined;

  const digits = value.slice(1).replace(/\D/g, "");
  if (!digits) return undefined;

  const sorted = getCountriesByDialCodeLength(countries);

  const matches: Country[] = [];
  for (const country of sorted) {
    const dialCode = country.dialCode.slice(1);
    if (digits.startsWith(dialCode)) {
      matches.push(country);
    }
  }

  if (matches.length === 0) return undefined;

  if (matches.length > 1 && matches[0]?.dialCode === "+1") {
    const usCountry = matches.find((c) => c.code === "US");
    if (usCountry) return usCountry;
  }

  return matches[0];
}

/**
 * Length check for a full international number (`+971501234567`).
 *
 * Shared dial codes are the reason this checks every candidate rather than the
 * single detected country: `+1` covers the US, Canada and a dozen Caribbean
 * nations, so a number is valid if it fits *any* country on that dial code.
 */
export function isValidInternationalPhone(value?: string | null): boolean {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return false;

  const candidates = getCachedCountries().filter((c) => digits.startsWith(c.dialCode.slice(1)));

  if (candidates.length === 0) {
    return digits.length >= MIN_TOTAL_DIGITS && digits.length <= MAX_TOTAL_DIGITS;
  }

  return candidates.some((country) => {
    const nationalLength = digits.length - country.dialCode.slice(1).length;
    const { min, max } = getNationalNumberLength(country.code);
    return nationalLength >= min && nationalLength <= max;
  });
}
