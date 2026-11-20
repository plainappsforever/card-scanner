// Phone numbers (SPEC §5.2, D13): the ONLY module that imports libphonenumber-js (max metadata, so the number type
// mobile/fixed is known for every country). Pure.
import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

import type { PhoneType } from './contact';

export type ParsedPhone = {
  /** As printed (after whitespace collapse). */
  raw: string;
  /** Digits only, for "same number" fallbacks when the number is not valid. */
  digits: string;
  valid: boolean;
  e164?: string;
  /** International format "+49 30 1234567" when parseable, else the raw text. */
  display: string;
  country?: string;
  /** From the metadata: mobile, fixed (incl. fixed-or-mobile, toll-free …) or unknown. */
  numberType: 'mobile' | 'fixed' | 'unknown';
  /** libphonenumber's own type (MOBILE, FIXED_LINE, FIXED_LINE_OR_MOBILE, TOLL_FREE …) — whether the metadata can tell mobile from fixed. */
  kind?: string;
  ext?: string;
  /** Not valid, but the length fits the country's plan (e.g. reserved drama ranges like UK 07700 900xxx). */
  possible?: boolean;
  /** E.164 form of a possible-but-invalid number (same digits, nothing corrected). */
  possibleE164?: string;
  possibleDisplay?: string;
};

export function isCountry(code: string | undefined): code is CountryCode {
  return !!code && /^[A-Z]{2}$/.test(code) && isSupportedCountry(code as CountryCode);
}

/**
 * Prepares a printed number for the parser: "00" international prefix → "+", the German/Swiss/Austrian trunk "(0)" after
 * a country code dropped ("+49 (0) 30 …"), letters other than an extension marker removed.
 */
export function cleanPhoneText(raw: string): string {
  let s = raw.normalize('NFKC').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
  s = s.replace(/^00(?=[1-9])/, '+').replace(/^\+\s+/, '+');
  s = s.replace(/^(\+\d{1,3})[\s-]*\(0\)[\s-]*/, '$1 ');
  s = s.replace(/^(\+\d{1,3})[\s-]+0(?=[1-9][\d\s/-]{4,})/, (m, cc: string) => (cc === '+39' ? m : `${cc} `)); // "+49 030 …" (not Italy: 0 belongs to the number)
  return s;
}

export function parsePhone(raw: string, defaultCountry?: string): ParsedPhone {
  const text = raw.replace(/\s+/g, ' ').trim();
  const cleaned = cleanPhoneText(text);
  const digits = cleaned.replace(/\D/g, '');
  const base: ParsedPhone = { raw: text, digits, valid: false, display: text, numberType: 'unknown' };
  let parsed;
  try {
    parsed = parsePhoneNumberFromString(cleaned, isCountry(defaultCountry) ? defaultCountry : undefined);
  } catch {
    parsed = undefined;
  }
  if (!parsed) return base;
  const valid = parsed.isValid();
  if (!valid) {
    const possible = parsed.isPossible();
    return { ...base, country: parsed.country, possible, ...(possible ? { possibleE164: parsed.number, possibleDisplay: parsed.formatInternational() } : {}) };
  }
  const t = parsed.getType();
  return {
    ...base,
    valid: true,
    e164: parsed.number,
    display: parsed.formatInternational(),
    country: parsed.country,
    numberType: t === 'MOBILE' ? 'mobile' : t === undefined ? 'unknown' : 'fixed',
    kind: t,
    ext: parsed.ext,
  };
}

/** International display form of a valid E.164 number; the input when it does not parse. */
export function formatInternational(e164: string): string {
  const p = parsePhoneNumberFromString(e164);
  return p && p.isValid() ? p.formatInternational() : e164;
}

/** E.164 of a printed number, or undefined when it is not a valid number. */
export function toE164(raw: string, defaultCountry?: string): string | undefined {
  return parsePhone(raw, defaultCountry).e164;
}

/** Type for a number without a label word: mobile numbers → mobile, every other valid number → work. */
export function phoneType(p: ParsedPhone): PhoneType {
  return p.numberType === 'mobile' ? 'mobile' : 'work';
}

/** Country calling code of an E.164 number ("+4930…" → "49"), for default-country inference. */
export function countryOfE164(e164: string): string | undefined {
  return parsePhoneNumberFromString(e164)?.country;
}

/**
 * Matching key of a phone (SPEC §5.5): E.164 when valid, else the last 9 digits (or all digits when shorter) — so
 * "+49 30 1234567", "030 1234567" and "0049 (0)30 123 45 67" meet.
 */
export function phoneKey(raw: string, defaultCountry?: string): string {
  const p = parsePhone(raw, defaultCountry);
  if (p.e164) return p.e164;
  return p.digits.length > 9 ? p.digits.slice(-9) : p.digits;
}
