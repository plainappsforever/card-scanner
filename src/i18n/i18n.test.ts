import { bannedIn } from '@/lib/wording';

import { de } from './de';
import { en, type MessageKey } from './en';
import { languageOfTag, LANGUAGE_NAMES, LANGUAGES, messages, resolveLanguage, translate, type Language } from './index';

const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(' ');

describe('i18n parity', () => {
  it('every complete language has exactly the English keys, no empty text and the same placeholders', () => {
    for (const [lang, dict] of Object.entries(messages)) {
      expect({ lang, keys: Object.keys(dict!).sort() }).toEqual({ lang, keys: Object.keys(en).sort() });
      for (const [key, text] of Object.entries(en)) {
        const value = dict![key as keyof typeof en];
        expect({ lang, key, empty: value.trim() === '' }).toEqual({ lang, key, empty: false });
        expect({ lang, key, p: placeholders(value) }).toEqual({ lang, key, p: placeholders(text) });
      }
    }
  });

  it('German is complete and actually translated (not English copies, except names/brands)', () => {
    const same = Object.keys(en).filter((k) => de[k as keyof typeof en] === en[k as keyof typeof en]);
    expect(same.sort()).toEqual(['app.name', 'common.ok', 'export.csv', 'export.vcard', 'field.name', 'field.url', 'phone.fax', 'settings.theme.system'].sort()); // 'OK', 'System' are German words too
  });

  it('keeps the app name untranslated', () => {
    for (const dict of Object.values(messages)) expect(dict!['app.name']).toBe(en['app.name']);
  });

  it('all 15 UI languages have a complete file', () => {
    expect(LANGUAGES).toHaveLength(15);
    expect(Object.keys(messages).sort()).toEqual([...LANGUAGES].sort());
    for (const l of LANGUAGES) expect(Object.keys(messages[l]).length).toBe(Object.keys(en).length);
  });

  // Keys a language may leave as in English: the name, format names and true loanwords (checked by a native reader
  // where one was available — L11: the 13 P8 files were written by the build agent, not by native speakers).
  const SAME: Record<Exclude<Language, 'en'>, readonly MessageKey[]> = {
    de: ['field.name', 'field.url', 'phone.fax', 'common.ok', 'settings.theme.system'],
    es: ['phone.fax', 'common.ok'],
    'pt-BR': ['home.menu', 'field.email', 'phone.fax', 'common.ok'],
    fr: ['home.menu', 'field.email', 'phone.mobile', 'phone.fax', 'card.notes', 'common.ok', 'home.add.photos', 'card.sms'],
    it: ['home.menu', 'field.email', 'field.social', 'phone.fax', 'common.ok'],
    tr: [],
    ru: [],
    id: ['home.menu', 'common.ok', 'card.edit', 'myCard.edit'],
    hi: [],
    ja: ['common.ok'],
    'zh-CN': [],
    ko: [],
    vi: ['home.menu', 'phone.fax', 'common.ok'],
    ar: [],
  };

  it('every language is actually translated (only listed loanwords equal the English text)', () => {
    for (const l of LANGUAGES) {
      if (l === 'en') continue;
      const same = (Object.keys(en) as MessageKey[]).filter((k) => messages[l][k] === en[k]);
      expect({ l, same: same.sort() }).toEqual({ l, same: ['app.name', 'export.csv', 'export.vcard', ...SAME[l]].sort() });
    }
  });

  it('no UI string in any language claims accuracy, shows a percentage, says "AI" or promises perfection (SPEC §2)', () => {
    const hits = LANGUAGES.flatMap((l) => (Object.keys(en) as MessageKey[]).flatMap((k) => bannedIn(messages[l][k]).map((w) => `${l} ${k}: ${w}`)));
    expect(hits).toEqual([]);
    expect(bannedIn('100 % accurate AI scan')).toEqual(expect.arrayContaining(['%', 'accura']));
    expect(bannedIn('Mit KI erkannt').length).toBe(1);
    expect(bannedIn('Kissen, Aida, Maria')).toEqual([]); // word boundaries: no false hits inside words
  });

  it('English and German pick singular or plural; "|" appears in no other text', () => {
    expect(translate('en', 'home.count', { n: 1 })).toBe('1 card');
    expect(translate('en', 'home.count', { n: 3 })).toBe('3 cards');
    expect(translate('en', 'export.leftOut', { n: 1 })).toBe('1 card not checked yet is left out');
    expect(translate('de', 'bulk.leftOut', { n: 2 })).toBe('2 noch nicht geprüfte Karten bleiben außen vor');
    expect(translate('es', 'home.count', { n: 1 })).toBe('Tarjetas: 1');
    for (const l of LANGUAGES) for (const k of Object.keys(en) as MessageKey[]) if (messages[l][k].includes('|')) expect({ l, k, plural: l === 'en' || l === 'de' }).toEqual({ l, k, plural: true });
  });

  it('Arabic keeps inserted values in Unicode isolates; other languages insert them as they are', () => {
    expect(translate('ar', 'home.selected', { n: 3 })).toBe('المحدد: \u20683\u2069');
    expect(translate('de', 'home.selected', { n: 3 })).toBe('3 ausgewählt');
    expect(LANGUAGE_NAMES.ar).toBe('العربية');
  });
});

describe('language resolver', () => {
  it.each([
    ['de-DE', 'de'],
    ['de_AT', 'de'],
    ['pt-PT', 'pt-BR'],
    ['zh-Hans-CN', 'zh-CN'],
    ['zh-TW', undefined],
    ['zh-Hant-HK', undefined],
    ['in-ID', 'id'],
    ['xx', undefined],
  ])('%s → %s', (tag, want) => expect(languageOfTag(tag)).toBe(want));

  it('first supported device language wins, else English; an explicit preference wins', () => {
    expect(resolveLanguage('system', ['zh-TW', 'fr-CH', 'en-US'])).toBe('fr');
    expect(resolveLanguage('system', ['xx'])).toBe('en');
    expect(resolveLanguage('de', ['fr'])).toBe('de');
  });
});
