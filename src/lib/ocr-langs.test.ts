import { ocrLanguages, planOcr } from './ocr-langs';

describe('OCR language plan (D42: non-Latin first)', () => {
  it('defaults to the UI language + English', () => {
    expect(ocrLanguages(null, 'de')).toEqual(['de', 'en']);
    expect(ocrLanguages(null, 'en')).toEqual(['en']);
  });
  it('puts non-Latin scripts first', () => {
    expect(ocrLanguages('en,ar', 'en')).toEqual(['ar', 'en']);
    expect(ocrLanguages(null, 'ja')).toEqual(['ja', 'en']);
  });
  it('maps to Vision codes / ML Kit scripts and reports what the phone cannot read', () => {
    expect(planOcr(['ar', 'en'], 'ios', ['en-US', 'ar-SA'])).toEqual({ codes: ['ar-SA', 'en-US'], unsupported: [] });
    expect(planOcr(['ar', 'de', 'en'], 'android', ['latin', 'japanese'])).toEqual({ codes: ['latin'], unsupported: ['ar'] });
    expect(planOcr(['hi'], 'ios', ['en-US'])).toEqual({ codes: [], unsupported: ['hi'] });
  });
});
