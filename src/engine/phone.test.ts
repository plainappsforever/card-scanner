import { cleanPhoneText, parsePhone, phoneKey, phoneType, toE164 } from './phone';

describe('phone wrapper (SPEC §5.2)', () => {
  it.each([
    ['+49 (0) 30 1234567', 'US', '+49301234567'],
    ['+49 (0)171 1234567', undefined, '+491711234567'],
    ['0049 30 1234567', 'US', '+49301234567'], // 00 prefix even when the region is not DE
    ['+49 030 1234567', undefined, '+49301234567'], // trunk zero printed after the country code
    ['030/1234567-12', 'DE', '+4930123456712'], // Durchwahl is part of a German number
    ['0171 1234567', 'DE', '+491711234567'],
    ['+39 02 1234 5678', undefined, '+390212345678'], // Italy keeps its 0
    ['+1 (415) 555-0123', undefined, '+14155550123'],
    ['03-1234-5678', 'JP', '+81312345678'],
    ['138 0013 8000', 'CN', '+8613800138000'],
    ['010-1234-5678', 'KR', '+821012345678'],
  ])('%s (%s) → %s', (raw, region, e164) => {
    expect(toE164(raw, region)).toBe(e164);
  });

  it('types from metadata and never invents a number', () => {
    expect(phoneType(parsePhone('+49 171 1234567'))).toBe('mobile');
    expect(phoneType(parsePhone('+49 30 1234567'))).toBe('work');
    const bad = parsePhone('12 34 56', 'DE');
    expect(bad).toMatchObject({ valid: false, display: '12 34 56', digits: '123456' });
    expect(bad.e164).toBeUndefined();
  });

  it('keys of the same number meet across print forms (+49 forms, spaces, slashes)', () => {
    const forms = ['+49 30 1234567', '+49 (0)30 123 45 67', '0049-30-1234567', '030 1234567', '(030) 123 4567', '+49 030/1234567'];
    const keys = forms.map((f) => phoneKey(f, 'DE'));
    expect(new Set(keys)).toEqual(new Set(['+49301234567']));
    // without a region the national form is not valid → last 9 digits, which still equal the E.164 tail
    expect(phoneKey('030 1234567')).toBe('301234567');
  });

  it('cleanPhoneText', () => {
    expect(cleanPhoneText('00 49 30 1')).toBe('00 49 30 1'); // "00 " followed by a space is not an IDD run
    expect(cleanPhoneText('0049 30')).toBe('+49 30');
  });
});
