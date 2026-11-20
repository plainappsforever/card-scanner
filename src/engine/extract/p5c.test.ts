/**
 * @jest-environment node
 */
// Fix round P5c from the blind set B2 misses (docs/V1_LOG.md "P5c-B2" miss list, D39). B2 was measured ONCE on the
// untouched snapshot 5121cc6; since then it is a TUNING set (L27 rule 7): these tests keep the fixes, they are not
// accuracy evidence. Evidence after this round needs a fresh blind set B3 from another agent.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blindInput, loadBlind, runBlindSet, type BlindFixture } from '../../../test/blind-format';

import { extract, extractText } from './index';
import type { Extracted, Line } from './types';

const load = (set: string) => loadBlind(join(__dirname, '../../../test/fixtures/cards', set), (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);
const b2 = load('blind-2');
const b1 = load('blind-1');
const fx = (id: string, set = b2) => set.find((f) => f.id === id) as BlindFixture;
const run = (id: string, set = b2) => extract(blindInput(fx(id, set)));
const name = (x: Extracted) => x.name && { given: x.name.value.given, middle: x.name.value.middle, family: x.name.value.family, confidence: x.name.confidence };
const phones = (x: Extracted) => x.phones.map((p) => `${p.value.e164 ?? p.value.raw}:${p.value.type}:${p.confidence}`);
const emails = (x: Extracted) => x.emails.map((e) => `${e.value.value}:${e.confidence}`);
const addr = (x: Extracted, i = 0) => x.addresses[i] && { street: x.addresses[i].value.street, postcode: x.addresses[i].value.postcode, city: x.addresses[i].value.city, confidence: x.addresses[i].confidence };
const lines = (...texts: [string, number][]): Line[] => texts.map((t, i) => ({ id: `f${i}`, text: t[0], height: t[1], box: { x: 0.08, y: 0.08 + i * 0.07, w: 0.5, h: t[1] } }));

describe('P5c 1 — OCR damage and lost accents are never "sure" (L26)', () => {
  it('names with OCR damage are repaired only against the e-mail or the given-name list, and stay medium', () => {
    expect(name(run('de-05'))).toMatchObject({ given: 'Sven', family: 'Hollmann', confidence: 'medium' }); // "HoIlmann"
    expect(name(run('de-22'))).toMatchObject({ given: 'Kornelia', family: 'Seidel', confidence: 'medium' }); // "Komelia"
    expect(name(run('de-09'))).toMatchObject({ given: 'Hermann', family: 'Tannholz', confidence: 'medium' }); // "Herrnann"
    expect(name(run('us-03'))).toMatchObject({ given: 'Mike', family: "O'Kearn", confidence: 'medium' }); // "0'Brien"
  });

  it('e-mail damage: a glued "|", ".corn", a capital I at a word end → repaired at medium, never a split-off address', () => {
    expect(emails(run('us-04-front'))).toEqual(['dana.whitfield@northwind-analytics-com.example:medium']);
    // both sides: the back's vCard QR carries the same address, read independently of the OCR → high
    expect(emails(run('us-04-both'))).toEqual(['dana.whitfield@northwind-analytics-com.example:high']);
    expect(emails(run('tw-01'))).toEqual(['jimmy.lin@tpyt-com-tw.example:medium']);
    expect(emails(run('mx-02'))).toEqual(['o.hansen@sensorik-nord-com.example:medium']);
    expect(emails(run('de-20'))).toEqual(['s.huber@gratblick-hotel-de.example:medium']);
    // a real domain label "corn" stays ("corn.de" is a domain, not damage)
    expect(emails(extractText('Anna Weber\nanna@corn-de.example'))).toEqual(['anna@corn-de.example:high']);
  });

  it('a house number with a letter O ("28O") is repaired and the address is not sure', () => {
    expect(addr(run('de-07'))).toMatchObject({ street: 'Podbielskistraße 280', postcode: '30655', confidence: 'medium' });
  });

  it('names whose accents the OCR probably dropped stay as printed, at most medium', () => {
    const lost: [string, string, string][] = [
      ['cz-01', 'Tomas', 'Dvorak'],
      ['de-12-back', 'Matthias', 'Kruger'],
      ['es-01', 'Maria', 'Fernandez Lopez'],
      ['fr-02', 'Claire', 'DUBOIS-LEFEVRE'],
      ['mex-01', 'Daniela', 'Garza Trevino'],
      ['pl-01', 'Katarzyna', 'Wojcik'],
      ['se-01', 'Erik', 'Lindstrom'],
      ['vn-01', 'Quan', 'Tran'],
    ];
    for (const [id, given, family] of lost) expect([id, name(run(id))]).toEqual([id, expect.objectContaining({ given, family, confidence: 'medium' })]);
    expect(run('es-01').name?.rule).toMatch(/accent-lost/);
  });

  it('the accent rule does not fire without a reason: a US "Jose Lopez", a name that kept its accents, a French "Rhône" on a Swiss card', () => {
    expect(extractText('Jose Lopez\nSales Director\nAcme Inc.\njose.lopez@acme-com.example\n+1 415 555 0142', { region: 'US' }).name?.confidence).toBe('high');
    expect(extractText('Lea Müller\nGeschäftsführerin\nlea.mueller@acme-de.example\n+49 761 292827', { region: 'DE' }).name?.confidence).toBe('high');
    expect(name(run('ch-02'))).toMatchObject({ given: 'Camille', family: 'Rochat', confidence: 'high' });
  });

  it('no B2 value read only from a line the OCR marked unsure (conf < 0.7) is high', () => {
    for (const f of b2) {
      const inp = blindInput(f);
      const unsure = new Set([...inp.front, ...(inp.back ?? [])].filter((l) => (l.conf ?? 1) < 0.7).map((l) => l.id));
      const x = extract(inp);
      const all = [x.name, x.company, x.title, x.department, ...x.phones, ...x.emails, ...x.urls, ...x.addresses];
      for (const c of all) if (c && c.sources.some((s) => unsure.has(s)) && !c.sources.some((s) => s.startsWith('q'))) expect([f.id, c.rule, c.confidence]).not.toEqual([f.id, c.rule, 'high']);
    }
  });
});

describe('P5c 2 — credentials after the name, prefixes, "0\'Brien"', () => {
  it('credential suffixes are split off the name as printed', () => {
    expect(run('de-15').name?.value).toMatchObject({ prefix: 'Dipl.-Kfm.', given: 'Martin', family: 'Roth', suffix: 'WP, StB, RA' });
    expect(run('uk-02').name?.value).toMatchObject({ given: 'Priya', family: 'Shah', suffix: 'FCCA' });
    expect(run('ch-01').name?.value).toMatchObject({ given: 'Reto', family: 'Brunell', suffix: 'lic. oec. HSG' });
    expect(run('pt-01').name?.value).toMatchObject({ prefix: 'Eng.a', given: 'Ana', middle: 'Rita', family: 'Sousa' });
  });

  it('a family name that looks like a German prefix word is not a credential ("Lisa Marie Herr")', () => {
    expect(extractText('Lisa Marie Herr\nlisa.herr@acme-de.example', { region: 'DE' }).name?.value).toMatchObject({ given: 'Lisa', middle: 'Marie', family: 'Herr', suffix: '' });
  });
});

describe('P5c 3 — a legal form on its own line belongs to the company', () => {
  it('prefix forms join the line below, lone forms join the line above; two-line logos match the domain by initials', () => {
    expect(run('jp-02').company).toMatchObject({ value: '有限会社高橋プラン事務所', confidence: 'medium' });
    expect(run('be-01').company).toMatchObject({ value: 'DIAMANT LOGISTICS NV', confidence: 'medium' });
    expect(run('us-01').company?.value).toBe('CORVALE PHYSICAL THERAPY');
    expect(run('us-03').company?.value).toBe("O'KEARN PLUMBING & HEATING");
  });
});

describe('P5c 4 — departments', () => {
  it('separate department lines and unit words are departments; "Service"/"Support" remnants are not', () => {
    expect([run('jp-03').title?.value, run('jp-03').department?.value]).toEqual(['Hardware Engineer', 'R&D Center']);
    expect(run('in-01').title).toMatchObject({ value: 'Head', confidence: 'medium' });
    expect(run('in-01').department?.value).toBe('Engineering');
    expect(run('ch-02').department?.value).toBe('Gestion de fortune');
    expect(run('sig-02').department?.value).toBe('Tax Advisory');
    expect(run('at-02-back').department).toBeUndefined(); // "Skiverleih · Service · Testcenter"
    expect(run('at-02-both').department).toBeUndefined();
    expect(run('de-17')).toMatchObject({ title: { value: 'Key Account Managerin' }, department: undefined });
  });

  it('a title + department line keeps the whole line as the title and only OFFERS the department (low, D39)', () => {
    const cases: [string, string, string][] = [
      ['de-06', 'Leiter Vertrieb Süd', 'Vertrieb Süd'],
      ['de-12-front', 'Leiter Forschung & Entwicklung', 'Forschung & Entwicklung'],
      ['de-12-back', 'Head of Research & Development', 'Research & Development'],
      ['de-20', 'Direktorin Sales & Marketing', 'Sales & Marketing'],
      ['es-01', 'Gerente de Ventas', 'Ventas'],
      ['mex-01', 'Gerente de Compras', 'Compras'],
      ['mx-02', 'Senior Engineer, R&D', 'R&D'],
      ['pl-01', 'Kierownik Działu Zakupów', 'Działu Zakupów'],
      ['ru-01', 'Руководитель отдела продаж', 'отдела продаж'],
      ['sig-01', 'Teamleiterin Kundenservice', 'Kundenservice'],
      ['us-02', 'VP, Business Development', 'Business Development'],
      ['vn-01', 'Giám đốc Kinh doanh', 'Kinh doanh'],
    ];
    for (const [id, title, dept] of cases) {
      const x = run(id);
      expect([id, x.title?.value, x.department?.value, x.department?.confidence]).toEqual([id, title, dept, 'low']);
    }
  });

  it('no department is offered from a dictionary title phrase or a non-department remainder', () => {
    const d = (t: string, region = 'US') => extract({ front: lines(['Anna Weber', 0.06], [t, 0.035], ['anna@acme-com.example', 0.03]), region }).department;
    expect(d('VP, Enterprise Sales')).toBeUndefined();
    expect(d('Diretor Comercial', 'BR')).toBeUndefined();
    expect(d('Produktmanager Außenleuchten', 'DE')).toBeUndefined();
    expect(d('Sales Manager')).toBeUndefined();
    expect(run('id-01')).toMatchObject({ title: { value: 'Manajer Pemasaran' }, department: undefined }); // a dictionary title phrase (B1 keeps it whole)
    expect(d('Fachanwältin für Arbeitsrecht', 'DE')).toBeUndefined();
  });

  it('B1 departments outside the old dictionaries; a "Praxis für …" line stays the company', () => {
    expect(run('de-22', b1).department?.value).toBe('Klinik für Kardiologie');
    expect(run('mx-02', b1).department?.value).toBe('Optische Messtechnik');
    expect(run('uk-01', b1).department?.value).toBe('Commercial Property');
    expect(run('de-23', b1).department).toBeUndefined();
  });
});

describe('P5c 5 — title dictionaries (AT, CZ, DE, MX, PT, SE) and mixed-script lines', () => {
  it('finds the titles B2 missed', () => {
    const t = (id: string) => run(id).title?.value;
    expect(t('at-03')).toBe('Grafikdesignerin');
    expect(t('cz-01')).toBe('obchodní ředitel');
    expect(t('de-07')).toBe('Immobilienmakler (IHK)');
    expect(t('de-21')).toBe('Dipl.-Ing. Architekt BDA');
    expect(t('mx-01')).toBe('Medical Science Liaison');
    expect(t('pt-01')).toBe('Enologa');
    expect(run('se-01').title).toMatchObject({ value: 'VD', confidence: 'high' });
  });

  it('"業務經理 Sales Manager": the title in the name\'s script, the other as the alternative', () => {
    const x = run('tw-01');
    expect(x.title?.value).toBe('Sales Manager');
    expect(x.alternatives.title?.value).toBe('業務經理');
  });

  it('"Partner" alone directly under the name: medium, never high', () => {
    for (const id of ['ch-01', 'de-15', 'uk-02']) expect([id, run(id).title?.value, run(id).title?.confidence]).toEqual([id, 'Partner', 'medium']);
  });
});

describe('P5c 6 — addresses', () => {
  it('a PO box number is never a postcode; registry lines are never addresses or websites', () => {
    expect(run('ae-01').addresses).toHaveLength(1);
    expect(addr(run('ae-01'))).toMatchObject({ postcode: '', city: 'Dubai', confidence: 'medium' });
    expect(addr(run('ae-01'))?.street).toContain('Sheikh Zayed Road');
    expect(run('in-01').addresses).toHaveLength(1); // "CIN: U72200KA2005PTC036789" is no address
    expect(run('tw-01').addresses).toHaveLength(1); // "統一編號 12345678" is no address
    expect(run('se-01').urls).toEqual([]); // "Org.nr 556123-4567" is no website
  });

  it('"Col. Centro" is the district after the street; the CEP line takes its city from the line above', () => {
    expect(addr(run('mex-01'))).toMatchObject({ street: 'Av. Constitución 2050 Ote., Col. Centro', postcode: '64000', city: 'Monterrey' });
    expect(addr(run('br-01'))).toMatchObject({ postcode: '01310-200', city: 'Sao Paulo' });
    expect(addr(run('br-01'))?.street).toMatch(/^Av\. Paulista, 1578/);
  });

  it('postcodes in confusable letters, Korean/Taiwanese/Czech formats, Hong Kong and Vietnam', () => {
    expect(addr(run('at-01'))).toMatchObject({ postcode: '1010', city: 'Wien', confidence: 'medium' }); // "lOlO Wien"
    expect(addr(run('uk-02'))).toMatchObject({ postcode: 'M1 1BN', city: 'Manchester', confidence: 'medium' }); // "Ml 1BN"
    expect(addr(run('uk-01'))).toMatchObject({ postcode: 'WC1R 4ED', city: 'London', street: '14 Bedford Row', confidence: 'medium' }); // "WClR"
    expect(addr(run('kr-01'))).toMatchObject({ postcode: '06236', city: '서울특별시', confidence: 'medium' });
    expect(addr(run('kr-02'))).toMatchObject({ postcode: '48058', city: '부산광역시', confidence: 'medium' });
    expect(addr(run('tw-01'))).toMatchObject({ postcode: '114', city: '台北市', confidence: 'medium' });
    expect(addr(run('cz-01'))).toMatchObject({ postcode: '602 00', city: 'Brno', street: 'Hybešova 42' });
    expect(addr(run('hk-01'))).toMatchObject({ postcode: '', city: 'Hong Kong' });
    expect(addr(run('vn-01'))).toMatchObject({ city: 'TP. Hồ Chí Minh' });
    expect(addr(run('vn-01'))?.street).toContain('235 Nguyễn Văn Cừ');
  });
});

describe('P5c 7 — phones: composed suffixes, glued labels, duplicates, types', () => {
  it('"DW 15", "Sekretariat -13", "Fax -99" compose with the base number', () => {
    expect(phones(run('at-01'))).toContain('+431533478015:work:medium');
    expect(phones(run('de-02'))).toEqual(['+49892109870:work:high', '+498921098712:work:medium', '+498921098713:work:medium', '+498921098799:fax:high']);
    expect(phones(run('de-15'))).toContain('+496997123499:fax:medium');
  });

  it('"Mobil0171 …" (glued label), no number from "RCS Paris B …", one entry for a MECARD number printed with a label, "H.P" is mobile', () => {
    expect(phones(run('de-09'))).toContain('+491715551234:mobile:high');
    expect(phones(run('fr-01')).some((p) => p.startsWith('+33732829320'))).toBe(false);
    expect(phones(run('us-02'))).toEqual(['+14155550161:work:medium', '+14155550179:mobile:high']);
    expect(phones(run('kr-02'))).toContain('+821023456789:mobile:high');
  });
});

describe('blind set B2 as a TUNING set (measured once on 5121cc6 before these fixes: docs/V1_LOG.md P5c-B2)', () => {
  it('the remaining misses are pinned by id; none is high-confidence wrong', () => {
    const r = runBlindSet(b2);
    expect(r.overall.highWrong + r.overall.fields.phoneType.highWrong + r.overall.fields.prefix.highWrong).toBe(0);
    expect(r.overall.misses.map((m) => `${m.card} ${m.field}`)).toEqual([
      'cz-01 name', // accents lost by the OCR: printed value kept at medium; the scorer stays strict on accents
      'de-06 department', // title + department on one line: the department is only offered (low), D39
      'de-12-back name', // accents lost (Krüger)
      'de-12-back department',
      'de-12-both department',
      'de-12-front department',
      'de-20 department',
      'es-01 name', // accents lost (María José Fernández López)
      'es-01 department',
      'fr-02 name', // accents lost (DUBOIS-LEFÈVRE)
      'id-01 department', // "Manajer Pemasaran" is a dictionary title phrase: no department offered
      'mex-01 name', // accents lost (Treviño)
      'mex-01 department',
      'mx-02 department',
      'pl-01 name', // accents lost (Wójcik)
      'pl-01 department',
      'ru-01 department',
      'se-01 name', // accents lost (Lindström)
      'sig-01 department',
      'us-02 department',
      'us-05 phone', // judgement call: nothing on the card proves +1 — +49 at medium ("Check")
      'vn-01 name', // accents lost (Trần Minh Quân)
      'vn-01 department',
    ]);
  });
});
