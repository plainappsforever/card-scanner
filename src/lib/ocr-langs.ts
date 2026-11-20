// Which languages text recognition runs with (SPEC §11: default = UI language + English; Settings may add more).
// ORDER MATTERS on iOS (O3, D42): with en-US first, Vision silently dropped every Arabic line; a non-Latin language
// first (or automatic detection) read them. So non-Latin scripts go FIRST. Android: ML Kit scripts (Latin is bundled;
// Chinese/Devanagari/Japanese/Korean are Play-services models); Russian and Arabic have no Android recogniser in this
// build (L11 — Offscan has the same gap).
import type { Language } from '@/i18n';

export const VISION_CODES: Record<Language, string> = {
  en: 'en-US', de: 'de-DE', es: 'es-ES', 'pt-BR': 'pt-BR', fr: 'fr-FR', it: 'it-IT', tr: 'tr-TR', ru: 'ru-RU', id: 'id-ID',
  hi: 'hi-IN', ja: 'ja-JP', 'zh-CN': 'zh-Hans', ko: 'ko-KR', vi: 'vi-VT', ar: 'ar-SA',
};
export const MLKIT_SCRIPTS: Record<Language, string | null> = {
  en: 'latin', de: 'latin', es: 'latin', 'pt-BR': 'latin', fr: 'latin', it: 'latin', tr: 'latin', id: 'latin', vi: 'latin',
  hi: 'devanagari', ja: 'japanese', 'zh-CN': 'chinese', ko: 'korean', ru: null, ar: null,
};
const NON_LATIN: ReadonlySet<Language> = new Set(['ru', 'hi', 'ja', 'zh-CN', 'ko', 'ar']);

/** The user's OCR languages: the stored list, else UI language + English; non-Latin first, no duplicates. */
export function ocrLanguages(stored: string | null, uiLang: Language): Language[] {
  const list = (stored ? stored.split(',').map((s) => s.trim()) : [uiLang, 'en']).filter((l): l is Language => l in VISION_CODES);
  const unique = [...new Set(list.length ? list : ['en' as Language])];
  return [...unique.filter((l) => NON_LATIN.has(l)), ...unique.filter((l) => !NON_LATIN.has(l))];
}

export type OcrPlan = { codes: string[]; unsupported: Language[] };

/** Native codes for this platform, dropping what the phone cannot read (`available` = the module's ocrLanguages()). */
export function planOcr(langs: readonly Language[], platform: 'ios' | 'android', available: readonly string[]): OcrPlan {
  const have = new Set(available);
  const codes: string[] = [];
  const unsupported: Language[] = [];
  for (const l of langs) {
    const code = platform === 'ios' ? VISION_CODES[l] : MLKIT_SCRIPTS[l];
    if (code && have.has(code)) {
      if (!codes.includes(code)) codes.push(code);
    } else unsupported.push(l);
  }
  return { codes, unsupported };
}
