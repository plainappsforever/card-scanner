/**
 * @jest-environment node
 */
// Fix round P5d from the blind set B3 misses (docs/V1_LOG.md "P5c-B3" miss list, D41) — scoped to the confident-wrong
// sources. B3 was measured ONCE on the untouched snapshot 8a4dff7; since then it is a TUNING set (L27 rule 7): these
// tests keep the fixes, they are not accuracy evidence. Evidence after this round needs a fresh set (real OCR O3 / B4).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blindInput, loadBlind, runBlindSet, type BlindFixture } from '../../../test/blind-format';

import { extract, extractText } from './index';
import type { Extracted, Line } from './types';

const load = (set: string) => loadBlind(join(__dirname, '../../../test/fixtures/cards', set), (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);
const b3 = load('blind-3');
const b1 = load('blind-1');
const fx = (id: string, set = b3) => set.find((f) => f.id === id) as BlindFixture;
const run = (id: string, set = b3) => extract(blindInput(fx(id, set)));
const name = (x: Extracted) => x.name && { prefix: x.name.value.prefix, given: x.name.value.given, middle: x.name.value.middle, family: x.name.value.family, suffix: x.name.value.suffix, confidence: x.name.confidence };
const company = (x: Extracted) => x.company && `${x.company.value}:${x.company.confidence}`;
const phones = (x: Extracted) => x.phones.map((p) => `${p.value.e164 ?? p.value.raw}:${p.value.type}:${p.confidence}`);
const emails = (x: Extracted) => x.emails.map((e) => `${e.value.value}:${e.confidence}`);
const addr = (x: Extracted, i = 0) => x.addresses[i] && { street: x.addresses[i].value.street, postcode: x.addresses[i].value.postcode, city: x.addresses[i].value.city, region: x.addresses[i].value.region, confidence: x.addresses[i].confidence };
const lines = (...texts: [string, number][]): Line[] => texts.map((t, i) => ({ id: `f${i}`, text: t[0], height: t[1], box: { x: 0.08, y: 0.08 + i * 0.07, w: 0.5, h: t[1] } }));

describe('P5d 1 — a company printed over two lines keeps both lines (medium: a layout reading)', () => {
  it('a trade, organisation or authority word directly above the company line joins it', () => {
    expect(company(run('de-k42'))).toBe('BEDACHUNGEN WÖHRLE GmbH:medium');
    expect(company(run('nl-x43'))).toBe('Installatiebedrijf Van der Berg B.V.:medium');
    // "Falkenbruck" alone equals the domain falkenbruck.de, but the authority word above belongs to it
    expect(company(run('de-g23'))).toBe('Landeshauptstadt Falkenbruck:medium');
  });

  it('a brand line above whose letters start the domain joins the legal-form line', () => {
    expect(company(run('mx-y06'))).toBe('celvyon Diagnostics GmbH:medium'); // celvyon.com
    expect(company(run('us-x48'))).toBe('LONE SPUR ROOFING & GUTTERS LLC:medium'); // lonespurroofingtx.com
  });

  it('nothing joins when the line above is the same name, a person, a title or a sentence', () => {
    const logo = extract({ front: lines(['ACME', 0.08], ['Acme Software GmbH', 0.05], ['Anna Wendrau', 0.05], ['anna@acme-de.example', 0.03]), region: 'DE' });
    expect(company(logo)).toBe('Acme Software GmbH:high');
    const person = extract({ front: lines(['Anna Wendrau', 0.05], ['Wendrau Bau GmbH', 0.05], ['Geschäftsführerin', 0.03], ['anna@wendrau-bau-de.example', 0.03]), region: 'DE' });
    expect(company(person)).toBe('Wendrau Bau GmbH:high');
    const tagline = extract({ front: lines(['Wir bauen Ihre Zukunft.', 0.04], ['Wendrau Bau GmbH', 0.05], ['Anna Wendrau', 0.05], ['anna@wendrau-bau-de.example', 0.03]), region: 'DE' });
    expect(company(tagline)).toBe('Wendrau Bau GmbH:high');
  });
});

describe('P5d 2 — e-mail: the printed address is never changed towards a damaged name line (de-g24 root cause)', () => {
  it('"Ole Bergströrn" + "ole.bergstroem@…": the NAME is repaired from the e-mail, the e-mail stays as printed; both medium', () => {
    const x = run('de-g24');
    expect(emails(x)).toEqual(['ole.bergstroem@ba-wendhorst-karlshaven-de.example:medium']);
    expect(name(x)).toMatchObject({ given: 'Ole', family: 'Bergström', confidence: 'medium' });
  });

  it('the P5b direction still holds: "m.pfefferkom@" on the card of Margarete Pfefferkorn takes the name spelling', () => {
    const x = run('de-10', b1);
    expect(emails(x)).toEqual(['m.pfefferkorn@stadtwerke-rabenau-de.example:medium']);
    expect(name(x)).toMatchObject({ family: 'Pfefferkorn', confidence: 'medium' }); // the conflict makes the name unsure too
    // a digit in the e-mail word is the damaged side ("okonkwo-ha1e")
    expect(emails(run('uk-a20'))).toEqual(['chidi.okonkwo-hale@wrexley-ac-uk.example:medium']);
  });

  it('a pasted e-mail: the quoted reply below the signature is text, never a field (sig-03)', () => {
    const x = run('sig-03');
    expect(emails(x)).toEqual(['omar.haddad@saharasolar-ae.example:high']);
    expect(x.leftovers.length).toBeGreaterThan(0);
    const de = extractText('Viele Grüße\nAnna Wendrau\nACME GmbH\nanna.wendrau@acme-de.example\n\nAm 13.10.2026 um 09:12 schrieb Lena Brandt <lena.brandt@sonnenwerk-de.example>:\n> Hallo Anna', { region: 'DE' });
    expect(emails(de)).toEqual(['anna.wendrau@acme-de.example:high']);
    const outlook = extractText('Anna Wendrau\nanna.wendrau@acme-de.example\n-----Original Message-----\nFrom: Lena Brandt <lena@sonnenwerk-de.example>', { region: 'DE' });
    expect(emails(outlook)).toEqual(['anna.wendrau@acme-de.example:high']);
  });
});

describe('P5d 3 — names: prefixes, credentials, Arabic compound names, OCR damage', () => {
  it('"Mag.a" (Austrian feminine Magistra) is a prefix', () => {
    expect(name(run('at-g25'))).toMatchObject({ prefix: 'Mag.a', given: 'Elif', family: 'Kaya-Brunner' });
  });

  it('"FRSC" after the name is a credential, never the family name; an all-caps family name with a vowel stays', () => {
    expect(name(run('uk-a20'))).toMatchObject({ prefix: 'Dr', given: 'Chidi', middle: '', family: 'Okonkwo-Hale', suffix: 'FRSC' });
    expect(name(extractText('Jan Petr MRAZ\njan.mraz@stavby-vrch-cz.example', { region: 'CZ' }))).toMatchObject({ family: 'MRAZ', suffix: '' });
  });

  it('Arabic compound family names keep their head ("Abdel Rahman"); "bin Fahad" stays the middle name', () => {
    expect(name(run('eg-t37'))).toMatchObject({ given: 'Mostafa', middle: '', family: 'Abdel Rahman' });
    expect(name(run('sa-t36'))).toMatchObject({ prefix: 'Eng.', given: 'Abdulrahman', middle: 'bin Fahad', family: 'Al-Qahtani', confidence: 'medium' }); // "A|-Qahtani"
  });

  it('a "|" glued into a name is repaired and the name stays medium ("McA||ister")', () => {
    expect(name(run('uk-x49'))).toMatchObject({ given: 'Callum', family: 'McAllister', confidence: 'medium' });
  });
});

describe('P5d 4 — addresses', () => {
  it('"Ho|tenauer Straße" → "Holtenauer Straße" at medium; "Hoofdweg212" → "Hoofdweg 212" at medium', () => {
    expect(addr(run('de-y08'))).toMatchObject({ street: 'Holtenauer Straße 204', postcode: '24105', city: 'Kiel', confidence: 'medium' });
    expect(addr(run('nl-x43'))).toMatchObject({ street: 'Hoofdweg 212', postcode: '1057 DE', city: 'Amsterdam', confidence: 'medium' });
  });

  it('an Indian state before the PIN is the region, the city is the part before it', () => {
    expect(addr(run('in-y03'))).toMatchObject({ street: '1/268, Parade Road', city: 'Fort Kochi', region: 'Kerala', postcode: '682001' });
    expect(addr(run('in-i39'))).toMatchObject({ city: 'Chennai', region: '', postcode: '600085' }); // a real city stays
    const mumbai = extractText('Priya Shah\npriya@acme-in.example\n12 Nariman Point, Mumbai, Maharashtra 400021', { region: 'IN' });
    expect(addr(mumbai)).toMatchObject({ street: '12 Nariman Point', city: 'Mumbai', region: 'Maharashtra', postcode: '400021' });
  });

  it('a register line ("PR 1187 AG Hamburg") is never an address; a Latvian postcode after the city is read', () => {
    const x = run('de-l09');
    expect(x.addresses.map((a) => `${a.value.postcode} ${a.value.city}`)).toEqual(['20354 Hamburg']);
    expect(addr(run('lv-n31'))).toMatchObject({ street: 'Brīvības iela 155', postcode: 'LV-1012', city: 'Rīga' });
  });
});

describe('P5d 5 — titles, phone labels, social', () => {
  it('"lnh." (OCR l for I) → "Inh.", never high', () => {
    expect(run('de-x50').title).toMatchObject({ value: 'Inh.', confidence: 'medium' });
  });

  it('"DD" is a UK direct dial (work); the Vietnamese "DĐ" (di động) stays mobile', () => {
    expect(phones(run('uk-l10-front'))).toEqual(['+441132456710:work:high', '+447723418902:mobile:high']);
    expect(phones(extractText('Nguyễn Văn An\nDĐ: 0903 456 789\nan@qantu-vn.example', { region: 'VN' }))).toEqual(['+84903456789:mobile:high']);
  });

  it('adapter reading (D41): a truth social "other" is accepted as Telegram when the card prints "TG"', () => {
    const r = runBlindSet([fx('mx-s14')]);
    expect(r.overall.fields.social).toMatchObject({ right: 2, wrong: 0 });
  });
});

describe('blind set B3 as a TUNING set (measured once on 8a4dff7 before these fixes: docs/V1_LOG.md P5c-B3)', () => {
  it('no value is high-confidence wrong any more (tuning figure, not evidence)', () => {
    const r = runBlindSet(b3);
    expect(r.overall.highWrong + r.overall.fields.phoneType.highWrong + r.overall.fields.prefix.highWrong).toBe(0);
  });
});
