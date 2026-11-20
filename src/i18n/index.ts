// UI languages (SPEC §11, print-cost D90 / Offscan pattern). All 15 are complete since P8 (EN/DE sources, D25/D50);
// a missing key would fall back to English (the parity test and scripts/check-i18n.mjs fail the build first).
// Screens call `useT()` (src/hooks/use-t.ts); never read getLanguage() during render.
import { getLocales } from 'expo-localization';

import { ar } from './ar';
import { de } from './de';
import { en, type MessageKey } from './en';
import { es } from './es';
import { fr } from './fr';
import { hi } from './hi';
import { id } from './id';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { ptBR } from './pt-BR';
import { ru } from './ru';
import { tr } from './tr';
import { vi } from './vi';
import { zhCN } from './zh-CN';

export type { MessageKey };
export type Language = 'en' | 'de' | 'es' | 'pt-BR' | 'fr' | 'it' | 'tr' | 'ru' | 'id' | 'hi' | 'ja' | 'zh-CN' | 'ko' | 'vi' | 'ar';
/** What the user picked in Settings: a language, or follow the device. */
export type LanguagePreference = 'system' | Language;
export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

export const LANGUAGES: readonly Language[] = ['en', 'de', 'es', 'pt-BR', 'fr', 'it', 'tr', 'ru', 'id', 'hi', 'ja', 'zh-CN', 'ko', 'vi', 'ar'];
export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['system', ...LANGUAGES];
/** Complete dictionaries, one per UI language. */
export const messages: Record<Language, Record<MessageKey, string>> = { en, de, es, 'pt-BR': ptBR, fr, it, tr, ru, id, hi, ja, 'zh-CN': zhCN, ko, vi, ar };
export const DEFAULT_LANGUAGE: Language = 'en';

/** Each language's own name, the same in every UI language. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  fr: 'Français',
  it: 'Italiano',
  tr: 'Türkçe',
  ru: 'Русский',
  id: 'Bahasa Indonesia',
  hi: 'हिन्दी',
  ja: '日本語',
  'zh-CN': '简体中文',
  ko: '한국어',
  vi: 'Tiếng Việt',
  ar: 'العربية',
};

/**
 * The supported language a BCP-47 tag means: 'de', 'de-DE', 'de_AT' are German; every Portuguese is pt-BR; Chinese only
 * in Simplified script (Traditional → undefined, so the next device language or English is used); old 'in' = Indonesian.
 */
export function languageOfTag(tag: string): Language | undefined {
  const [primary = '', ...rest] = tag.replace(/_/g, '-').toLowerCase().split('-');
  if (primary === 'pt') return 'pt-BR';
  if (primary === 'in') return 'id';
  if (primary === 'zh') {
    const traditional = rest.includes('hant') || (!rest.includes('hans') && rest.some((r) => r === 'tw' || r === 'hk' || r === 'mo'));
    return traditional ? undefined : 'zh-CN';
  }
  return LANGUAGES.find((l) => l === primary);
}

/** The preference if set, else the first of the device's preferred languages the app speaks, else English. */
export function resolveLanguage(preference: LanguagePreference, deviceTags: string | readonly string[] | undefined): Language {
  if (preference !== 'system') return preference;
  const tags = typeof deviceTags === 'string' ? [deviceTags] : (deviceTags ?? []);
  for (const tag of tags) {
    const language = languageOfTag(tag);
    if (language) return language;
  }
  return DEFAULT_LANGUAGE;
}

/** The device's preferred languages, most preferred first (expo-localization; Intl in Node tests). */
export function deviceLanguageTags(): string[] {
  try {
    const tags = getLocales()
      .map((l) => l.languageTag)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (tags.length > 0) return tags;
  } catch {
    // no native module (Node) - fall through
  }
  try {
    return [Intl.DateTimeFormat().resolvedOptions().locale];
  } catch {
    return [];
  }
}

/** The device's region (ISO 3166 alpha-2, upper case) — the default phone region (SPEC §4.2 `phone_region`). */
export function deviceRegion(): string | undefined {
  try {
    const code = getLocales().find((l) => typeof l.regionCode === 'string' && l.regionCode)?.regionCode;
    if (code) return code.toUpperCase();
  } catch {
    // Node
  }
  return undefined;
}

let current: Language = resolveLanguage('system', deviceLanguageTags());
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  listeners.forEach((l) => l());
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** First-strong isolate … pop: a Latin name or number inside Arabic text keeps its own direction (SPEC §9, D90). */
const isolate = (v: string) => `\u2068${v}\u2069`;

/**
 * "{n} card|{n} cards": singular|plural, picked by params.n (1 = singular). Used by English and German only; the other
 * languages write counts as "Label: {n}" (D50), so they need no plural rules.
 */
function pickPlural(text: string, params?: Record<string, string | number>): string {
  const bar = text.indexOf('|');
  if (bar < 0) return text;
  return params && Number(params.n) === 1 ? text.slice(0, bar) : text.slice(bar + 1);
}

export function translate(language: Language, key: MessageKey, params?: Record<string, string | number>): string {
  const text: string = pickPlural(messages[language]?.[key] ?? en[key], params);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? (language === 'ar' ? isolate(String(params[name])) : String(params[name])) : m));
}

const translators = new Map<Language, Translator>();

/** One translator per language: same identity for the same language, a different function for another one. */
export function makeT(language: Language): Translator {
  let t = translators.get(language);
  if (!t) {
    t = (key, params) => translate(language, key, params);
    translators.set(language, t);
  }
  return t;
}
