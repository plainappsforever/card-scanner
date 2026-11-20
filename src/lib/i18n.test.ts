import { getLanguage, makeT, setLanguage, subscribeLanguage, translate } from './i18n';

describe('i18n (template path re-export)', () => {
  afterEach(() => setLanguage('en'));

  it('returns a different translator function per language (React Compiler memoises on identity)', () => {
    const en = makeT('en');
    const de = makeT('de');
    expect(de).not.toBe(en);
    expect(makeT('en')).toBe(en);
    expect(en('home.title')).toBe('Cards');
    expect(de('home.title')).toBe('Karten');
  });

  it('switching the language notifies subscribers and yields a new translator', () => {
    setLanguage('en');
    const seen: string[] = [];
    const unsubscribe = subscribeLanguage(() => seen.push(makeT(getLanguage())('home.title')));
    const before = makeT(getLanguage());
    setLanguage('de');
    setLanguage('de'); // no change, no notification
    unsubscribe();
    setLanguage('en');
    expect(seen).toEqual(['Karten']);
    expect(makeT('de')).not.toBe(before);
  });

  it('interpolates params', () => {
    expect(translate('de', 'home.count', { n: 3 })).toBe('3 Karten');
  });
});
