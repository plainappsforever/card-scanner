/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fieldsFromExtracted } from '@/db/fields';

import { extract, extractText, guessCardCountry, toContact } from './index';
import { loadCards } from './fixtures';
import { splitSegments } from './normalize';
import { postcodeHits } from './rules/address';
import { emailMatchesName, splitName } from './rules/name';
import { repairDigits } from './rules/phone';
import { formatScore, scoreCards } from './score';
import type { Line } from './types';

const lines = (...texts: (string | [string, number])[]): Line[] =>
  texts.map((t, i) => (typeof t === 'string' ? { id: `f${i}`, text: t } : { id: `f${i}`, text: t[0], height: t[1], box: { x: 0.08, y: 0.08 + i * 0.07, w: 0.5, h: t[1] } }));

describe('rule 1 — segments', () => {
  it('splits at | • · and spaced slashes, not inside "0761 / 29 28 27"; two spaces before a label', () => {
    expect(splitSegments('T +49 30 12 | M +49 170 1')).toEqual(['T +49 30 12', 'M +49 170 1']);
    expect(splitSegments('anna@acme-de.example · www.acme.de')).toEqual(['anna@acme-de.example', 'www.acme.de']);
    expect(splitSegments('Fon 0761 / 29 28 27')).toEqual(['Fon 0761 / 29 28 27']);
    expect(splitSegments('CEO / Founder')).toEqual(['CEO', 'Founder']);
    expect(splitSegments('Industriestr. 44   Telefon 089 4521 330')).toEqual(['Industriestr. 44', 'Telefon 089 4521 330']);
    expect(splitSegments('Hall 3   booth 7')).toEqual(['Hall 3 booth 7']);
  });

  it('repairs digit confusables only in digit-dominated runs', () => {
    expect(repairDigits('T +49 4O 3O12 456-0').text).toBe('T +49 40 3012 456-0');
    expect(repairDigits('Mobile: +49 l72 345 67 89').text).toBe('Mobile: +49 172 345 67 89');
    expect(repairDigits('BOSS Office 12').text).toBe('BOSS Office 12');
  });
});

describe('rule 3 — e-mail', () => {
  it.each([
    ['anna.weber@acme-de.example', 'anna.weber@acme-de.example', 'high'],
    ['E-Mail: Anna.Weber@acme-de.example', 'anna.weber@acme-de.example', 'high'],
    ['konrad @ hollerbrink.de', 'konrad@hollerbrink-de.example', 'medium'],
    ['torben(at)bruenzel-elektro.de', 'torben@bruenzel-elektro-de.example', 'medium'],
    ['info@acme .de', 'info@acme-de.example', 'medium'],
    ['mail© studio-kqv.de', 'mail@studio-kqv-de.example', 'medium'],
  ])('%s → %s (%s)', (text, value, confidence) => {
    const x = extractText(text);
    expect(x.emails.map((e) => [e.value.value, e.confidence])).toEqual([[value, confidence]]);
  });

  it('a missing @ is repaired only when labelled and the domain is the card website', () => {
    expect(extractText('E-Mail: anna.weberacme.de\nwww.acme.de').emails.map((e) => e.value.value)).toEqual(['anna.weber@acme-de.example']);
    expect(extractText('anna.weberacme.de\nwww.acme.de').emails).toEqual([]);
  });

  it('"Instagram @studio.k" is a social handle, not an e-mail; unknown TLD → low', () => {
    const x = extractText('Instagram @studio.k');
    expect(x.emails).toEqual([]);
    expect(x.socials[0].value).toEqual({ service: 'instagram', value: '@studio.k' });
    expect(extractText('anna@acme-qqq.example').emails[0].confidence).toBe('low');
  });
});

describe('rule 4 — websites and socials', () => {
  it('finds www/scheme/bare domains with a known TLD, never abbreviations or legal forms', () => {
    expect(extractText('www.acme.de').urls.map((u) => u.value)).toEqual(['www.acme.de']);
    expect(extractText('https://acme.de/kontakt').urls.map((u) => u.value)).toEqual(['https://acme.de/kontakt']);
    expect(extractText('acme-solutions.co.uk').urls.map((u) => u.value)).toEqual(['acme-solutions.co.uk']);
    expect(extractText('ACME GmbH & Co.KG\nMo.-Fr. 8-17 Uhr\nz.B. Montag\nM.Sc. Informatik').urls).toEqual([]);
    expect(extractText('www acme de').urls.map((u) => [u.value, u.confidence])).toEqual([['www.acme.de', 'medium']]);
  });

  it('profile URLs → socials (high), labelled handles (medium), lone @handle (low)', () => {
    const x = extractText('linkedin.com/in/anna-weber\nXING: Anna_Weber\nWeChat: anna_w88\nin/annaw\n@annaweber');
    expect(x.socials.map((s) => [s.value.service, s.value.value, s.confidence])).toEqual([
      ['linkedin', 'linkedin.com/in/anna-weber', 'high'],
      ['xing', 'Anna_Weber', 'medium'],
      ['wechat', 'anna_w88', 'medium'],
      ['linkedin', 'annaw', 'medium'],
      ['other', '@annaweber', 'low'],
    ]);
    expect(extractText('Made in Germany').socials).toEqual([]);
  });
});

describe('rule 5 — phones', () => {
  it('labels decide the type; generic labels and unlabelled numbers use the metadata', () => {
    // the card names its country (.de) — without that evidence a number valid only through the region is medium (M1)
    const x = extractText('Tel. 030 1234567\nTel. 0171 1234567\nFax 030 1234568\nPrivat 030 7654321\n0160 1234567\n030 9988776\nanna@acme-de.example', { region: 'DE' });
    expect(x.phones.map((p) => [p.value.e164, p.value.type, p.confidence])).toEqual([
      ['+49301234567', 'work', 'high'],
      ['+491711234567', 'mobile', 'high'],
      ['+49301234568', 'fax', 'high'],
      ['+49307654321', 'home', 'high'],
      ['+491601234567', 'mobile', 'medium'],
      ['+49309988776', 'work', 'medium'],
    ]);
  });

  it('several numbers on one line, labels after the number, extensions', () => {
    const x = extractText('T +49 30 1234567 F +49 30 1234568\n0431 556677 (Praxis) 0172 5566778 (mobil)\n+1 415 555 0100 ext. 23', { region: 'DE' });
    expect(x.phones.map((p) => [p.value.value, p.value.type])).toEqual([
      ['+49 30 1234567', 'work'],
      ['+49 30 1234568', 'fax'],
      ['+49 431 556677', 'work'],
      ['+49 172 5566778', 'mobile'],
      ['+1 415 555 0100 ext. 23', 'work'],
    ]);
  });

  it('never reads tax ids, IBANs, register numbers, dates or postcodes as phones', () => {
    const x = extractText('USt-IdNr. DE 812 345 678\nIBAN DE89 3704 0044 0532 0130 00\nAmtsgericht Essen HRB 123456\n16.10.2026\nMusterstraße 12, 10115 Berlin\n〒100-0005 東京都千代田区丸の内1-2-3', { region: 'DE' });
    expect(x.phones).toEqual([]);
  });

  it('an invalid number is kept as printed (low); a labelled possible number is medium with the same digits', () => {
    // country evidence on the card (UK postcode) allows the D30 "possible" reading; the phone region alone does not (M1)
    const x = extractText('0123 45\n12 34 567 890 12\nMobile 07700 900456\nLondon EC1V 0DS', { region: 'GB' });
    expect(x.phones.map((p) => [p.value.value, p.value.e164 ?? null, p.confidence])).toEqual([
      ['12 34 567 890 12', null, 'low'],
      ['+44 7700 900456', '+447700900456', 'medium'],
    ]);
    expect(extractText('Mobile 07700 900456', { region: 'GB' }).phones.map((p) => [p.value.e164 ?? null, p.confidence])).toEqual([[null, 'low']]);
  });

  it('default country: +cc on the card, then the address/TLD, then the phone region', () => {
    expect(guessCardCountry(lines('Tel +43 1 31322 0', 'Mobil 0664 1234567'), 'DE')).toBe('AT');
    expect(guessCardCountry(lines('anna@acme-fr.example'), 'DE')).toBe('FR');
    expect(guessCardCountry(lines('ACME'), 'DE')).toBe('DE');
    expect(extractText('Tel +43 1 31322 0\nMobil 0664 1234567', { region: 'DE' }).phones[1].value.e164).toBe('+436641234567');
  });
});

describe('rule 6 — addresses', () => {
  it.each([
    ['DE', '10115 Berlin', '10115', 'Berlin'],
    ['DE', 'D-79098 Freiburg im Breisgau', '79098', 'Freiburg im Breisgau'],
    ['CH', 'CH-8001 Zürich', '8001', 'Zürich'],
    ['FR', '75008 Paris CEDEX 08', '75008', 'Paris'],
    ['IT', '20121 Milano (MI)', '20121', 'Milano'],
    ['NL', '1015 CJ Amsterdam', '1015 CJ', 'Amsterdam'],
    ['PT', '1100-053 Lisboa', '1100-053', 'Lisboa'],
    ['PL', '80-827 Gdańsk', '80-827', 'Gdańsk'],
    ['US', 'San Francisco, CA 94102', '94102', 'San Francisco'],
    ['CA', 'Montréal, QC H3A 3G4', 'H3A 3G4', 'Montréal'],
    ['AU', 'Sydney NSW 2000', '2000', 'Sydney'],
    ['GB', 'London EC1R 0DP', 'EC1R 0DP', 'London'],
    ['IE', 'Dublin 2, D02 A342', 'D02 A342', 'Dublin 2'],
    ['BR', 'São Paulo/SP - CEP 01310-200', '01310-200', 'São Paulo'],
    ['RU', '123056, г. Москва', '123056', 'Москва'],
    ['IN', 'Chennai - 600 018', '600018', 'Chennai'],
    ['ID', 'Jakarta 12190', '12190', 'Jakarta'],
    ['KR', 'Seoul 06236', '06236', 'Seoul'],
    ['MX', 'C.P. 06600 Ciudad de México', '06600', 'Ciudad de México'],
    ['TR', '34394 Şişli', '34394', 'Şişli'],
  ])('%s: %s', (country, text, postcode, city) => {
    const h = postcodeHits(text, country)[0];
    expect([h?.postcode, h?.city.trim()]).toEqual([postcode, city]);
  });

  it('street above (≤ 2 lines), country below; "1200 Market Street" is a house number, not a postcode', () => {
    const x = extractText('Hafenweg 7a\n20457 Hamburg\nDeutschland', { region: 'DE' });
    expect(x.addresses[0]).toMatchObject({ confidence: 'high', value: { street: 'Hafenweg 7a', postcode: '20457', city: 'Hamburg', country: 'Deutschland', countryCode: 'DE' } });
    const us = extractText('1200 Market Street, Suite 400\nSan Francisco, CA 94102', { region: 'US' });
    expect(us.addresses.map((a) => [a.value.street, a.value.postcode, a.value.city, a.value.region])).toEqual([['1200 Market Street, Suite 400', '94102', 'San Francisco', 'CA']]);
  });

  it('Japanese 〒 addresses split into prefecture, city, street; CJK without postcode → medium structure', () => {
    const jp = extractText('〒530-0001 大阪府大阪市北区梅田2-4-9');
    expect(jp.addresses[0].value).toMatchObject({ postcode: '530-0001', region: '大阪府', city: '大阪市', street: '北区梅田2-4-9' });
    const cn = extractText('地址：上海市浦东新区世纪大道100号');
    expect(cn.addresses[0]).toMatchObject({ confidence: 'medium', value: { city: '上海市', street: '浦东新区世纪大道100号' } });
    const kr = extractText('서울특별시 강남구 테헤란로 152');
    expect(kr.addresses[0].value).toMatchObject({ city: '서울특별시', street: '강남구 테헤란로 152' });
  });

  it('an unknown format stays one block in "street" with low confidence (nothing invented)', () => {
    const x = extractText('Plot 14, Sector 5 Road\nGreen Valley Estate', { region: 'NG' });
    expect(x.addresses).toHaveLength(1);
    expect(x.addresses[0]).toMatchObject({ confidence: 'low', value: { postcode: '', city: '' } });
    expect(x.addresses[0].value.street).toContain('Plot 14');
  });
});

describe('rules 7–9 — company, title, name', () => {
  it('legal form → high; domain stem → high; company word → medium; logo text → low', () => {
    expect(extractText('Anna Weber\nNordwind Logistik GmbH').company).toMatchObject({ value: 'Nordwind Logistik GmbH', confidence: 'high' });
    expect(extractText('TALLOW & BRINE\nWren Castellano\nhello@tallowandbrine-com.example').company).toMatchObject({ value: 'TALLOW & BRINE', confidence: 'high' });
    expect(extractText('Bäckerei Hollerbach\nKonrad Hollerbach\nInhaber').company).toMatchObject({ value: 'Bäckerei Hollerbach', confidence: 'medium' });
    expect(extractText('Farbklang\nRuprecht Ansorge\nMalermeister\nansorge@maler-ansorge-de.example').company?.confidence).toBe('low');
    expect(extractText('株式会社山田製作所\n山田 太郎').company?.value).toBe('株式会社山田製作所');
  });

  it('title next to the name → high, department words → department', () => {
    const x = extractText('Fabian Oyelaran-Schmitt\nKey Account Manager\nVertrieb Bildgebung');
    expect(x.title).toMatchObject({ value: 'Key Account Manager', confidence: 'high' });
    expect(x.department?.value).toBe('Vertrieb Bildgebung');
    expect(extractText('Vertriebsleiter Süd').title?.value).toBe('Vertriebsleiter Süd');
    expect(extractText('Amélie Fournier-Diallo, Chargée de communication').title?.value).toBe('Chargée de communication');
  });

  it('name: e-mail match → high; list + title → high; a single signal → medium; structure only → low', () => {
    expect(extractText('Ottilie Brandstätter\no.brandstaetter@nordschimmer-de.example').name?.confidence).toBe('high');
    expect(extractText('Anna Weber\nGeschäftsführerin').name?.confidence).toBe('high');
    expect(extractText('Xaver Quillfeather\nGeschäftsführer\nquill@acme-de.example').name?.confidence).toBe('medium');
    expect(extractText('Xaver Quillfeather').name?.confidence).toBe('low');
    expect(emailMatchesName(['jgarcialopez'], ['José', 'García', 'López'])).toBe(true);
    expect(emailMatchesName(['juergen.mueller'], ['Jürgen', 'Müller'])).toBe(true);
    expect(emailMatchesName(['info'], ['Jürgen', 'Müller'])).toBe(false);
  });

  it.each([
    ['Dr. Anna Maria Weber', 'latin', undefined, { prefix: 'Dr.', given: 'Anna', middle: 'Maria', family: 'Weber' }],
    ['WEBER, Anna', 'latin', undefined, { given: 'Anna', family: 'WEBER' }],
    ['Jean DUPONT', 'latin', undefined, { given: 'Jean', family: 'DUPONT' }],
    ['DUPONT Jean', 'latin', undefined, { given: 'Jean', family: 'DUPONT' }],
    ['Ludwig van Beethoven', 'latin', undefined, { given: 'Ludwig', family: 'van Beethoven' }],
    ['Chris O’Neil Jr.', 'latin', undefined, { given: 'Chris', family: 'O’Neil', suffix: 'Jr.' }],
    ['José García Márquez', 'latin', 'ES', { given: 'José', family: 'García Márquez' }],
    ['Nguyễn Văn An', 'latin', 'VN', { given: 'An', middle: 'Văn', family: 'Nguyễn' }],
    ['Kim Minjun', 'latin', 'KR', { given: 'Minjun', family: 'Kim' }],
    ['Иванов Дмитрий Сергеевич', 'cyrillic', 'RU', { given: 'Дмитрий', middle: 'Сергеевич', family: 'Иванов' }],
    ['山田 太郎', 'cjk', 'JP', { given: '太郎', family: '山田' }],
    ['佐藤花子', 'cjk', 'JP', { given: '花子', family: '佐藤' }],
    ['欧阳明华', 'cjk', 'CN', { given: '明华', family: '欧阳' }],
    ['王伟', 'cjk', 'CN', { given: '伟', family: '王' }],
    ['남궁서연', 'hangul', 'KR', { given: '서연', family: '남궁' }],
    ['محمد العتيبي', 'arabic', 'SA', { given: 'محمد', family: 'العتيبي' }],
  ] as const)('split %s', (text, script, country, want) => {
    expect(splitName(text, script, { cardCountry: country, segs: [] }).parts).toMatchObject(want);
  });

  it('Japanese name without a space and not in the family list → family = full, low (check name)', () => {
    expect(splitName('東雲蒼汰', 'cjk', { cardCountry: 'JP', segs: [] })).toMatchObject({ parts: { family: '東雲蒼汰', given: '' }, splitConfidence: 'low' });
  });

  it('N7: two scripts — primary follows the UI language, the other becomes otherName', () => {
    const front = lines(['佐藤花子', 0.08], ['代表取締役', 0.035], ['hanako.sato@kirihane-jp.example', 0.03]);
    const back = [{ id: 'b0', text: 'Hanako Sato', height: 0.07, box: { x: 0.08, y: 0.1, w: 0.4, h: 0.07 } }];
    expect(extract({ front, back, uiLang: 'ja', region: 'JP' })).toMatchObject({ name: { value: { family: '佐藤', given: '花子' } }, otherName: { value: 'Hanako Sato' } });
    expect(extract({ front, back, uiLang: 'en', region: 'JP' })).toMatchObject({ name: { value: { given: 'Hanako', family: 'Sato' } }, otherName: { value: '佐藤花子' } });
  });
});

describe('rules 2 and 10 — codes, leftovers, nothing hidden', () => {
  it('a vCard code fills fields (high); agreeing OCR confirms; a differing OCR title becomes the alternative and the code value is medium (S5)', () => {
    const qr = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lindqvist;Henrike;;;\r\nFN:Henrike Lindqvist\r\nTITLE:Redaktionsleiterin\r\nTEL;TYPE=CELL:+49 151 4455 6677\r\nEND:VCARD\r\n';
    const x = extract({ front: lines(['Henrike Lindqvist', 0.06], ['Chefredakteurin', 0.035]), qr: [{ text: qr }], region: 'DE' });
    expect(x.name).toMatchObject({ confidence: 'high', sources: ['q0', 'f0'] });
    expect(x.title).toMatchObject({ value: 'Redaktionsleiterin', confidence: 'medium' });
    expect(x.alternatives.title?.value).toBe('Chefredakteurin');
    expect(x.phones[0].value).toMatchObject({ e164: '+4915144556677', type: 'mobile' });
  });

  it('a QR-only card works; an unreadable code fills nothing', () => {
    const x = extract({ front: lines(['Chidinma Okafor', 0.08]), qr: [{ text: 'MECARD:N:Okafor,Chidinma;TEL:+12125550111;EMAIL:c@okafor-studio.example;;' }], region: 'US' });
    expect(x.emails.map((e) => e.value.value)).toEqual(['c@okafor-studio.example']);
    expect(x.phones[0].value.e164).toBe('+12125550111');
    const y = extract({ front: [], qr: [{ text: 'LEAD:8f3a91c0ffee' }] });
    expect([y.name, y.phones, y.emails]).toEqual([undefined, [], []]);
  });

  it('every line that is not used is listed; a second person stays visible', () => {
    const x = extractText('Steuerkanzlei Hagedorn & Okoro\nBirte Hagedorn\nSteuerberaterin\nEmeka Okoro\nSteuerberater\nMo-Fr 9-18 Uhr', { region: 'DE' });
    const text = (id: string) => x.lines.find((l) => l.id === id)?.text;
    expect(x.leftovers.map(text)).toEqual(['Emeka Okoro', 'Steuerberater', 'Mo-Fr 9-18 Uhr']);
  });

  it('a partly used line keeps its unused remainder visible', () => {
    const x = extractText('anna@acme-de.example (bitte nur vormittags)');
    expect(x.leftovers.map((id) => x.lines.find((l) => l.id === id)?.text)).toEqual(['bitte nur vormittags']);
  });

  it('the result is a proposal: fields carry confidence and sources; rows are never "user" until confirmed', () => {
    const x = extractText('Anna Weber\nACME GmbH\nanna@acme-de.example', { region: 'DE' });
    const rows = fieldsFromExtracted(x);
    expect(rows.every((r) => r.confidence !== 'user' && r.edited === false && r.sourceLines.length > 0)).toBe(true);
    expect(toContact(x)).toMatchObject({ company: 'ACME GmbH', emails: [{ value: 'anna@acme-de.example' }] });
    expect(x.version).toMatch(/^x\d/);
  });

  it('empty input gives an empty proposal', () => {
    expect(extractText('')).toMatchObject({ phones: [], emails: [], leftovers: [] });
  });
});

describe('development set (tuning set, NOT evidence — L27)', () => {
  const dir = join(__dirname, '../../../test/fixtures/cards/dev');
  const cards = loadCards(dir, (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);

  it('has ≥ 60 cards and keeps its measured level (regression floor, not a quality claim)', () => {
    expect(cards.length).toBeGreaterThanOrEqual(60);
    const s = scoreCards(cards);
    const recall = (k: keyof typeof s.fields) => s.fields[k].right / s.fields[k].truth;
    const floors: [keyof typeof s.fields, number][] = [
      ['email', 1],
      ['url', 1],
      ['phone', 0.99],
      ['phoneType', 1],
      ['name', 0.98],
      ['company', 0.97],
      ['title', 0.98],
      ['address', 1],
    ];
    const below = floors.filter(([k, f]) => recall(k) < f).map(([k]) => k);
    if (below.length) console.log(formatScore(s, 'dev'));
    expect(below).toEqual([]);
    expect(s.highWrong).toBe(0);
  });

  it('the known misses are pinned by id: any new miss fails (review S11)', () => {
    const misses = scoreCards(cards).misses.map((m) => `${m.card} ${m.field}`);
    expect(misses).toEqual([
      'jp-03 name', // Japanese name without a space and outside the family list: asked (SPEC N5)
      'de-07 prefix', // "RA Dr.": the professional prefix RA is kept with Dr. (the dev truth says "Dr.")
      'de-12 company', // two logo lines, the legal name only in the e-mail domain: medium "Holzwerk"
      'us-03 social', // a lone @handle is social "other", low (SPEC rule 4)
      'logo-02 company', // logo text without legal form or domain: asked (low)
      'logo-03 phone', // UK 07700 900xxx drama range, no country evidence on the card: asked (M1)
    ]);
  });
});
