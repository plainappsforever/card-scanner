/**
 * @jest-environment node
 */
// The blind-set adapter (test/blind-format.ts) maps only FORMAT.md keys. These tests check the mapping itself on the
// committed B1 fixtures WITHOUT running the extractor on them (that run is the bench, `npm run blind`).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyScore, scoreCard } from '../src/engine/extract/score';
import type { Extracted } from '../src/engine/extract/types';

import { blindInput, blindTruth, cardTheme, chooseTruth, countryGroup, familyAbsorbsMiddle, loadBlind, nameFromFull, titleDepartmentLines, type BlindFixture } from './blind-format';

const dir = join(__dirname, 'fixtures/cards/blind-1');
const all = loadBlind(dir, (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);
const byId = (id: string) => all.find((f) => f.id === id) as BlindFixture;

const empty = (): Extracted => ({ phones: [], emails: [], urls: [], socials: [], addresses: [], alternatives: {}, leftovers: [], lines: [], version: 'test' });

describe('blind-format adapter', () => {
  it('loads all 77 B1 fixtures and maps every side, paste text and QR payload', () => {
    expect(all).toHaveLength(77);
    for (const fx of all) {
      const inp = blindInput(fx);
      expect(inp.region).toBe(fx.input.region);
      if (fx.input.text !== undefined) {
        expect(inp.front.length).toBeGreaterThan(0);
        expect(inp.front.every((l) => l.id.startsWith('t'))).toBe(true);
      } else {
        expect(inp.front.map((l) => l.text)).toEqual(fx.input.front?.lines.map((l) => l.text));
        expect(inp.front.every((l) => l.box && l.height === l.box.h)).toBe(true);
      }
      expect(inp.back?.length ?? 0).toBe(fx.input.back?.lines.length ?? 0);
      expect(inp.qr?.map((q) => q.text) ?? []).toEqual(fx.input.qr?.map((q) => q.text) ?? []);
      expect(countryGroup(fx.id)).not.toBe('other');
    }
    expect(all.filter((f) => f.side === 'both').every((f) => blindInput(f).back)).toBe(true);
    expect(all.filter((f) => blindInput(f).qr).map((f) => f.id)).toEqual(['de-11', 'de-12-back', 'de-12-both', 'de-24', 'us-03']);
  });

  it('truth: E.164 phones (composed numbers in full), PO box as street when no street is printed', () => {
    const t = blindTruth(byId('de-10'));
    expect(t.phones?.find((p) => p.number === '+496407913127')).toEqual({ number: '+496407913127', type: 'work' });
    expect(t.addresses?.[0]).toMatchObject({ street: 'Postfach 11 62', postcode: '35466', city: 'Rabenau' });
    expect(blindTruth(byId('us-01')).addresses?.[0].street).toBe('350 Fifth Avenue');
  });

  it('accept alternatives and type_accept count as right; a low value stays "asked"', () => {
    const fx = byId('us-01');
    const x = empty();
    x.company = { value: 'BRIGHTLYRE ANALYTICS', confidence: 'medium', sources: [], rule: 't' };
    x.title = { value: 'Something else', confidence: 'low', sources: [], rule: 't' };
    const s = emptyScore();
    scoreCard({ id: fx.id, truth: chooseTruth(fx, x) }, x, s);
    expect(s.fields.company).toMatchObject({ right: 1, wrong: 0 });
    expect(s.fields.title).toMatchObject({ right: 0, wrong: 0, asked: 1 });

    const us5 = byId('us-05');
    const y = empty();
    y.phones.push({ value: { value: '+1 800 467 5862', type: 'other', e164: '+18004675862', raw: '1-800-GO-PLUMB', labelled: false }, confidence: 'medium', sources: [], rule: 't' });
    const s2 = emptyScore();
    scoreCard({ id: us5.id, truth: chooseTruth(us5, y) }, y, s2);
    expect(s2.fields.phone.right).toBe(1);
    expect(s2.fields.phoneType).toMatchObject({ right: 1, wrong: 0 });
  });

  it('a city in the other script is accepted without the truth street (two-script cards)', () => {
    const fx = byId('jp-01-both');
    const x = empty();
    x.addresses.push({ value: { street: '渋谷2-21-1', city: '渋谷区', region: '東京都', postcode: '150-0002', country: '', countryCode: 'JP', raw: '' }, confidence: 'high', sources: [], rule: 't' });
    const s = emptyScore();
    scoreCard({ id: fx.id, truth: chooseTruth(fx, x) }, x, s);
    expect(s.fields.address.right).toBe(1);
  });
});

// B2 (75 fixtures, SPEC §13 B2): mapping only — synthetic extractions, the extractor is NOT run on B2 here.
describe('blind-format adapter on B2', () => {
  const dir2 = join(__dirname, 'fixtures/cards/blind-2');
  const b2 = loadBlind(dir2, (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);
  const b2Id = (id: string) => b2.find((f) => f.id === id) as BlindFixture;
  const score = (fx: BlindFixture, x: Extracted) => {
    const s = emptyScore();
    scoreCard({ id: fx.id, truth: chooseTruth(fx, x) }, x, s);
    return s;
  };
  const cand = <T,>(value: T, confidence: 'high' | 'medium' | 'low' = 'high') => ({ value, confidence, sources: [], rule: 't' });

  it('loads all 75 fixtures; every id has a country group', () => {
    expect(b2).toHaveLength(75);
    for (const fx of b2) expect([fx.id, countryGroup(fx.id)]).not.toEqual([fx.id, 'other']);
  });

  it('title + department on one line: the whole line is accepted as the title, the department is then a miss', () => {
    expect(titleDepartmentLines(b2Id('jp-01-front'))).toEqual(['営業部 部長']);
    expect(titleDepartmentLines(b2Id('kr-01'))).toEqual(['개발팀 팀장']);
    expect(titleDepartmentLines(b2Id('sig-02'))).toEqual(['Senior Manager | Tax Advisory']);
    expect(titleDepartmentLines(b2Id('ch-02'))).toEqual([]);
    const x = empty();
    x.title = cand('개발팀 팀장');
    const s = score(b2Id('kr-01'), x);
    expect(s.fields.title).toMatchObject({ right: 1, wrong: 0 });
    expect(s.fields.department).toMatchObject({ truth: 1, right: 0, wrong: 0 });
  });

  it('accepted streets pair with cities of their script; extra/region alternatives are not needed', () => {
    const cn = b2Id('cn-01-both');
    const x = empty();
    x.addresses.push(cand({ street: '科苑路15号', city: '深圳市', region: '', postcode: '518057', country: '', countryCode: 'CN', raw: '' }));
    expect(score(cn, x).fields.address.right).toBe(1);
    const y = empty();
    y.addresses.push(cand({ street: 'No. 15 Keyuan Road', city: 'Shenzhen', region: '', postcode: '518057', country: 'China', countryCode: 'CN', raw: '' }));
    expect(score(cn, y).fields.address.right).toBe(1);
    const z = empty();
    z.addresses.push(cand({ street: 'Somewhere 1', city: 'Shenzhen', region: '', postcode: '518057', country: '', countryCode: 'CN', raw: '' }));
    expect(score(cn, z).fields.address).toMatchObject({ right: 0, wrong: 1 });
  });

  it('a name.family alternative that begins with the middle name clears it (br-01, fixed after the B2 run, D39)', () => {
    expect(familyAbsorbsMiddle('Oliveira', 'Oliveira Santos')).toBe('');
    expect(familyAbsorbsMiddle('Maria Oliveira', 'Oliveira Santos')).toBe('Maria');
    expect(familyAbsorbsMiddle('Paul', 'Smith Jones')).toBe('Paul');
    expect(familyAbsorbsMiddle('', 'García Márquez')).toBe('');
    const br = b2Id('br-01');
    const x = empty();
    x.name = cand({ prefix: '', given: 'Rafael', middle: '', family: 'Oliveira Santos', suffix: '', full: 'Rafael Oliveira Santos' });
    expect(score(br, x).fields.name).toMatchObject({ right: 1, wrong: 0 });
    const y = empty();
    y.name = cand({ prefix: '', given: 'Rafael', middle: 'Oliveira', family: 'Santos', suffix: '', full: 'Rafael Oliveira Santos' });
    expect(score(br, y).fields.name).toMatchObject({ right: 1, wrong: 0 });
  });

  it('judgement calls stay strict: group line as company, English name on hk-01, +49 on us-05 are wrong', () => {
    const de5 = b2Id('de-05');
    const a = empty();
    a.company = cand('Hellwig Lichttechnik GmbH');
    expect(score(de5, a).fields.company).toMatchObject({ right: 0, highWrong: 1 });
    const hk = b2Id('hk-01');
    const b = empty();
    b.name = cand({ prefix: '', given: 'Peter', middle: '', family: 'CHAN', suffix: '', full: 'Peter CHAN' });
    expect(score(hk, b).fields.name).toMatchObject({ right: 0, highWrong: 1 });
    const us5 = b2Id('us-05');
    const c = empty();
    c.phones.push(cand({ value: '+49 503 5550148', type: 'work' as const, e164: '+495035550148', raw: '503-555-0148', labelled: false }));
    expect(score(us5, c).fields.phone).toMatchObject({ right: 0, highWrong: 1 });
  });
});

// B3 (74 fixtures, SPEC §13 B3): mapping only — synthetic extractions, the extractor is NOT run on B3 here.
describe('blind-format adapter on B3', () => {
  const dir3 = join(__dirname, 'fixtures/cards/blind-3');
  const b3 = loadBlind(dir3, (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);
  const b3Id = (id: string) => b3.find((f) => f.id === id) as BlindFixture;
  const score = (fx: BlindFixture, x: Extracted) => {
    const s = emptyScore();
    scoreCard({ id: fx.id, truth: chooseTruth(fx, x) }, x, s);
    return s;
  };
  const cand = <T,>(value: T, confidence: 'high' | 'medium' | 'low' = 'high') => ({ value, confidence, sources: [], rule: 't' });
  const person = (prefix: string, given: string, middle: string, family: string) => cand({ prefix, given, middle, family, suffix: '', full: [prefix, given, middle, family].filter(Boolean).join(' ') });
  const addr = (street: string, postcode: string, city: string, countryCode: string) => cand({ street, city, region: '', postcode, country: '', countryCode, raw: '' });

  it('loads all 74 fixtures; every id has a country group and a theme', () => {
    expect(b3).toHaveLength(74);
    for (const fx of b3) {
      expect([fx.id, countryGroup(fx.id)]).not.toEqual([fx.id, 'other']);
      expect([fx.id, cardTheme(fx.id)]).not.toEqual([fx.id, null]);
    }
    expect(cardTheme('de-11')).toBeNull();
  });

  it('name.full alternatives: prefix words ending in ".", first word given, last word family', () => {
    expect(nameFromFull('Dr. Stefan Lechner')).toEqual({ prefix: 'Dr.', given: 'Stefan', middle: '', family: 'Lechner' });
    expect(nameFromFull('Matthias Edlinger')).toEqual({ prefix: '', given: 'Matthias', middle: '', family: 'Edlinger' });
    expect(nameFromFull('Univ.-Prof. Dipl.-Ing. Dr.techn. Matthias Edlinger').prefix).toBe('Univ.-Prof. Dipl.-Ing. Dr.techn.');
  });

  it('at-m07: any of the equal dentists counts, but only with her or his own specialty', () => {
    const fx = b3Id('at-m07');
    const a = empty();
    a.name = person('Dr.', 'Stefan', '', 'Lechner');
    a.title = cand('Implantologie & Oralchirurgie');
    const sa = score(fx, a);
    expect([sa.fields.name.right, sa.fields.prefix.right, sa.fields.title.right]).toEqual([1, 1, 1]);
    const b = empty();
    b.name = person('Dr.', 'Stefan', '', 'Lechner');
    b.title = cand('Kinderzahnheilkunde');
    const sb = score(fx, b);
    expect(sb.fields.name.right + sb.fields.title.right).toBe(1);
    expect(sb.fields.name.wrong + sb.fields.title.wrong).toBe(1);
    const c = empty();
    c.name = person('DDr.', 'Miriam', '', 'Hofbauer');
    c.title = cand('Kieferorthopädie');
    expect(score(fx, c).fields.name).toMatchObject({ right: 1, wrong: 0 });
  });

  it('in-i39: "R. Venkatesh" is given + middle without a family name, in either order; a family name is wrong', () => {
    const fx = b3Id('in-i39');
    for (const [g, m] of [['R.', 'Venkatesh'], ['Venkatesh', 'R.'], ['R. Venkatesh', '']]) {
      const x = empty();
      x.name = person('', g, m, '');
      expect(score(fx, x).fields.name).toMatchObject({ right: 1, wrong: 0 });
    }
    const y = empty();
    y.name = person('', 'R.', '', 'Venkatesh');
    expect(score(fx, y).fields.name).toMatchObject({ right: 0, highWrong: 1 });
  });

  it('combined fixtures: English name.middle / name.family, street, city, P.O. box and postcode alternatives', () => {
    const vn = b3Id('vn-h18-both');
    const x = empty();
    x.name = person('Ms.', 'Anh', 'Thi Minh', 'Nguyen');
    x.addresses.push(addr('68 Bach Dang St.', '', 'Da Nang', 'VN'));
    const sx = score(vn, x);
    expect(sx.fields.name).toMatchObject({ right: 1, wrong: 0 });
    expect(sx.fields.address).toMatchObject({ right: 1, wrong: 0 });
    const ae = b3Id('ae-t35-both');
    const y = empty();
    y.addresses.push(addr('ص.ب. 113456', '', 'أبوظبي', 'AE'));
    expect(score(ae, y).fields.address).toMatchObject({ right: 1, wrong: 0 });
    const it = b3Id('it-h15');
    const z = empty();
    z.addresses.push(addr('Dolomitenstraße 12', 'I-39040', 'Kastelruth', 'IT'));
    expect(score(it, z).fields.address).toMatchObject({ right: 1, wrong: 0 });
  });

  it('judgement calls stay strict: eg-t37 "Abdel" as middle, ASCII Turkish on the front, an unresolved -214 are wrong', () => {
    const eg = b3Id('eg-t37');
    const a = empty();
    a.name = person('', 'Mostafa', 'Abdel', 'Rahman');
    expect(score(eg, a).fields.name).toMatchObject({ right: 0, highWrong: 1 });
    const tr = b3Id('tr-t34-front');
    const b = empty();
    b.name = person('', 'Gokhan', '', 'Cevrik');
    expect(score(tr, b).fields.name).toMatchObject({ right: 0, highWrong: 1 });
    const trBoth = b3Id('tr-t34-both');
    expect(score(trBoth, b).fields.name).toMatchObject({ right: 1, wrong: 0 });
    const h17 = b3Id('de-h17-back');
    const c = empty();
    c.phones.push(cand({ value: '214', type: 'work' as const, e164: '+49214', raw: '-214', labelled: true }));
    expect(score(h17, c).fields.phone).toMatchObject({ right: 0, highWrong: 1 });
    expect(blindTruth(h17).phones).toHaveLength(1);
    expect(blindInput(b3Id('de-h17-both')).back?.length).toBeGreaterThan(0);
  });
});
