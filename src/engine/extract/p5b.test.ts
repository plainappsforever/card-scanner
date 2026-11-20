/**
 * @jest-environment node
 */
// Fix round P5b (docs/REVIEW_ENGINE.md M1–M5, S1–S15 and the blind-set B1 misses). Every input here is a TUNING input:
// the reviewer's probes and B1 are no longer blind once fixed (L27 rule 7) — these tests keep the fixes, they are not
// accuracy evidence. Evidence after this round = a fresh blind set B2 from another agent.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blindInput, loadBlind, runBlindSet } from '../../../test/blind-format';
import { readMecard } from '../vcard/mecard';

import { fixtureInput, loadCards, type CardFixture } from './fixtures';
import { extract, extractText } from './index';
import { buildSegments, meaningfulRest } from './normalize';
import { formatScore, scoreCards } from './score';
import type { Extracted, Line } from './types';

const lines = (...texts: (string | [string, number])[]): Line[] =>
  texts.map((t, i) => (typeof t === 'string' ? { id: `f${i}`, text: t } : { id: `f${i}`, text: t[0], height: t[1], box: { x: 0.08, y: 0.08 + i * 0.07, w: 0.5, h: t[1] } }));
const phones = (x: Extracted) => x.phones.map((p) => [p.value.e164 ?? p.value.raw, p.value.type, p.confidence]);

const devDir = join(__dirname, '../../../test/fixtures/cards/dev');
const dev = loadCards(devDir, (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);
const blindDir = join(__dirname, '../../../test/fixtures/cards/blind-1');
const blind = loadBlind(blindDir, (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);

describe('M1 — the phone default country comes from the card before the phone region', () => {
  const us = ['Brightlyre Analytics', 'Marcus Delacroix', '350 Fifth Avenue', 'San Francisco, CA 94102', 'Office (415) 555-0142', 'Mobile (628) 555-0199', 'marcus@brightlyre-com.example'].join('\n');
  it.each(['DE', 'IN', 'GB', 'JP', 'US'])('a US card scanned on a %s phone gets +1 numbers', (region) => {
    expect(phones(extractText(us, { region }))).toEqual([
      ['+14155550142', 'work', 'high'],
      ['+16285550199', 'mobile', 'high'],
    ]);
  });

  it('New York card on a German phone; UK and Italian national numbers on a German phone', () => {
    expect(extractText('Jane Roe\n(212) 555-0123\nNew York, NY 10001', { region: 'DE' }).phones[0].value.e164).toBe('+12125550123');
    expect(extractText('Dr Isla MacLennan\n14 Queen Street\nEdinburgh EH2 1JX\nTel: 0131 496 0055', { region: 'DE' }).phones[0].value.e164).toBe('+441314960055');
    expect(extractText('Avv. Chiara Varsetti\nT. 06 6789 1234\nwww.studiovarsetti.it', { region: 'DE' }).phones[0].value.e164).toBe('+390667891234');
  });

  it('without country evidence on the card a number valid only through the region is medium, and never a "possible" +1 0… number', () => {
    expect(phones(extractText('Anna Wendrau\nTel 0761 292827\nanna@wendrau-com.example', { region: 'DE' }))).toEqual([['+49761292827', 'work', 'medium']]);
    const x = extractText('Anna Wendrau\nTel 0761 292827\nanna@wendrau-com.example', { region: 'US' });
    expect(x.phones.every((p) => p.confidence === 'low' && !p.value.e164?.startsWith('+10'))).toBe(true);
  });

  it.each(['DE', 'IN', 'GB', 'US', 'JP'])('dev set scanned on a %s phone: no phone number high and wrong (review perturbation, S12)', (region) => {
    const moved = dev.map((c): CardFixture => ({ ...c, region }));
    expect(scoreCards(moved).fields.phone.highWrong).toBe(0);
  });
});

describe('M2 — combined and glued labels', () => {
  it.each([
    ['Tel./Fax 0761 292827', 'work'],
    ['Fon/Fax 0761 292827', 'work'],
    ['Tel & Fax: 0761 292827', 'work'],
    ['T/F 0761 292827', 'work'],
    ['Mobil/Fax 0171 1234567', 'mobile'],
    ['Fax/Tel 0761 292827', 'work'],
  ])('%s → one %s entry at medium, never fax at high', (line, type) => {
    expect(phones(extractText(`Anna Wendrau\n${line}\nanna@wendrau-de.example`, { region: 'DE' }))).toEqual([[expect.any(String), type, 'medium']]);
  });

  it('"24h", "9-18h", "5F", "2F" are no labels', () => {
    const t = (s: string) => extractText(`${s}\nanna@wendrau-de.example`, { region: 'DE' }).phones[0].value.type;
    expect(t('Notdienst 24h: 0171 1234567')).toBe('other'); // the hotline label, not "h(ome)"
    expect(t('Mo-Fr 9-18h 0761 292827')).toBe('work');
    expect(t('Büro 2F 0761 292827')).toBe('work');
    expect(extractText('渋谷ビル5F 03-1234-5678', { region: 'JP' }).phones[0].value.type).toBe('work');
  });
});

describe('M3 — taglines and generic words are not titles', () => {
  it.each(['Ihr Partner für Holz', 'Der Marktführer für Holzbau', 'Head Office', 'Senior Living Community', 'Staff Only', 'Staff Training & Coaching', 'Your partner since 1987'])('"%s" is no title', (tag) => {
    const x = extract({ front: lines(['WENDRAU HOLZ', 0.08], ['Anna Wendrau', 0.06], [tag, 0.035], ['Hauptstraße 5', 0.03], ['79098 Freiburg', 0.03], ['anna@wendrau-holz-de.example', 0.03]), region: 'DE' });
    expect(x.title?.confidence === 'high' || x.title?.confidence === 'medium').toBe(false);
  });

  it('generic words with a department word are a title at medium; a lone generic word is only asked', () => {
    const x = extract({ front: lines(['Anna Wendrau', 0.06], ['Head of Sales', 0.035], ['anna@acme-de.example', 0.03]), region: 'DE' });
    expect(x.title).toMatchObject({ value: 'Head of Sales' });
    // P5c (D39): "Partner" alone directly under the name is a firm's partner title → medium, never high; "Head" stays asked
    const y = extract({ front: lines(['Anna Wendrau', 0.06], ['Partner', 0.035], ['anna@acme-de.example', 0.03]), region: 'DE' });
    expect(y.title).toMatchObject({ value: 'Partner', confidence: 'medium' });
    expect(extract({ front: lines(['Anna Wendrau', 0.06], ['Head', 0.035], ['anna@acme-de.example', 0.03]), region: 'DE' }).title?.confidence).toBe('low');
    expect(extract({ front: lines(['Anna Wendrau', 0.06], ['Senior Consultant', 0.035], ['anna@acme-de.example', 0.03]), region: 'DE' }).title?.confidence).toBe('high');
  });

  it('dev cards without their title line plus a tagline: no tagline becomes a sure title (review perturbation, S12)', () => {
    const tags = ['Ihr Partner für Holz', 'Head Office', 'Senior Living Specialists', 'Der Marktführer für Holzbau', 'Staff Training & Coaching'];
    let sure = 0;
    dev.forEach((c, i) => {
      if (!c.truth.title || !c.front || c.front.some((l) => typeof l !== 'string' && l.length === 4)) return;
      const front = c.front.filter((l) => (typeof l === 'string' ? l : l[0]) !== c.truth.title);
      const at = Math.max(0, front.findIndex((l) => (typeof l === 'string' ? l : l[0]) === c.truth.company)) + 1;
      front.splice(at, 0, [tags[i % tags.length], 0.035]);
      const x = extract(fixtureInput({ ...c, front }));
      if (x.title && tags.includes(x.title.value) && x.title.confidence !== 'low') sure++;
    });
    expect(sure).toBe(0);
  });
});

describe('M4 — membership lines, credentials and short forms are not companies', () => {
  it('"A member of … Group" never replaces the logo/legal company (review perturbation, S12)', () => {
    let replaced = 0;
    for (const c of dev) {
      if (!c.front || c.front.some((l) => typeof l !== 'string' && l.length === 4)) continue;
      const x = extract(fixtureInput({ ...c, front: [...c.front, ['A member of the Contoso Group', 0.025]] }));
      if (x.company && /member of/i.test(x.company.value)) replaced++;
    }
    expect(replaced).toBe(0);
    expect(extractText('NORTHWIND\nA member of the Contoso Group\nAnna Wendrau\nanna@northwind-de.example').company?.value).toBe('NORTHWIND');
    expect(extractText('WENDRAU\nEin Unternehmen der Müller Gruppe\nAnna Wendrau\nanna@wendrau-de.example').company?.value).toBe('WENDRAU');
    expect(extractText('EASTGABLE\na Eastgable Inc. company\nEastgable Software GmbH\nflorian@eastgable-com.example').company?.value).toBe('Eastgable Software GmbH');
  });

  it('"Jane Doe, PT, DPT" is a name with credentials; "Co. Kerry" and "CV & Portfolio" are no legal forms', () => {
    const x = extractText('Brume Rehab\nJane Doe, PT, DPT\njane@brumerehab-com.example', { region: 'US' });
    expect(x.name?.value).toMatchObject({ given: 'Jane', family: 'Doe', suffix: 'PT, DPT' });
    expect(x.company?.value).toBe('Brume Rehab');
    expect(extractText('Murphy Joinery\nMain Street, Tralee\nCo. Kerry\nseamus@murphyjoinery-ie.example').company?.value).toBe('Murphy Joinery');
    expect(extractText('CV & Portfolio\nAnna Wendrau\nanna@wendrau-de.example').company?.rule ?? '').not.toBe('company.legal');
    expect(extractText('PT Nusantara Boga Tbk\nDewi Wibowo').company?.value).toBe('PT Nusantara Boga Tbk');
  });

  it('a legal-form-only line continues the larger line(s) above it (medium)', () => {
    const x = extract({ front: lines(['DACHDECKEREI', 0.05], ['KERSCHNER', 0.05], ['GmbH & Co. KG', 0.025], ['Hauke Kerschner', 0.04]), region: 'DE' });
    expect(x.company).toMatchObject({ value: 'DACHDECKEREI KERSCHNER GmbH & Co. KG', confidence: 'medium' });
    expect(extract({ front: lines(['Ferreira & Lima', 0.05], ['Comércio Ltda.', 0.032], ['Ana Paula Ferreira', 0.06]), region: 'BR' }).company?.value).toBe('Ferreira & Lima Comércio Ltda.');
  });
});

describe('M5 — a second number with the same base is kept; nothing read is hidden', () => {
  it('extension pairs and Tel/Fax with the same digits are two entries', () => {
    expect(phones(extractText('T (212) 555-0100 x23\nF (212) 555-0100 x45\nNew York, NY 10001', { region: 'US' })).map((p) => p.slice(0, 2))).toEqual([
      ['+12125550100', 'work'],
      ['+12125550100', 'fax'],
    ]);
    const x = extractText('T (212) 555-0100 x23\nF (212) 555-0100 x45\nNew York, NY 10001', { region: 'US' });
    expect(x.phones.map((p) => p.value.value)).toEqual(['+1 212 555 0100 ext. 23', '+1 212 555 0100 ext. 45']);
    expect(phones(extractText('Tel 0761 292827\nFax 0761 292827\nanna@wendrau-de.example', { region: 'DE' })).map((p) => p[1])).toEqual(['work', 'fax']);
  });

  // a line that is only a label ("Tél.", "Mail") carries nothing to show
  const meaningful = (t: string) => buildSegments([{ id: 'x0', text: t }]).some((sg) => meaningfulRest(sg) !== '');
  const hidden = (x: Extracted, ids: string[]) => {
    // a value offered as the alternative of a field is shown on the review screen too
    const used = new Set([x.name, x.company, x.title, x.department, x.otherName, ...Object.values(x.alternatives), ...x.phones, ...x.emails, ...x.urls, ...x.socials, ...x.addresses].flatMap((c) => c?.sources ?? []));
    const left = new Set(x.leftovers.map((l) => l.split('~')[0]));
    return ids.filter((id) => !used.has(id) && !left.has(id));
  };
  it('every input line with text is in a field or in "Text on the card" (dev set and B1)', () => {
    for (const c of dev) {
      const input = fixtureInput(c);
      const x = extract(input);
      expect([c.id, hidden(x, [...input.front, ...(input.back ?? [])].filter((l) => meaningful(l.text)).map((l) => l.id))]).toEqual([c.id, []]);
    }
    for (const fx of blind) {
      const input = blindInput(fx);
      const x = extract(input);
      expect([fx.id, hidden(x, [...input.front, ...(input.back ?? [])].filter((l) => meaningful(l.text)).map((l) => l.id))]).toEqual([fx.id, []]);
    }
  });
});

describe('S2–S10 (review should-fix)', () => {
  it('S2: a lone line is not "the largest name"; place phrases and CJK lines without a family name are only asked', () => {
    const x = extract({ front: lines(['NORDSCHIMMER', 0.08], ['Fresh Fish Market', 0.04], ['info@nordschimmer-de.example', 0.03]), region: 'DE' });
    expect(x.name === undefined || x.name.confidence === 'low').toBe(true);
    expect(extract({ front: lines(['欢迎光临', 0.06], ['北京天成科技有限公司', 0.04]), region: 'CN' }).name?.confidence ?? 'low').toBe('low');
    expect(extractText('St. Louis\nACME Inc.\ninfo@acme-com.example', { region: 'US' }).name?.confidence ?? 'low').toBe('low');
  });

  it('S3: a freelancer whose name is the domain is a NAME, not a company', () => {
    const x = extract({ front: lines(['ANNA WENDRAU', 0.08], ['hallo@annawendrau-de.example', 0.03], ['www.annawendrau.de', 0.03]), region: 'DE' });
    expect(x.name?.value).toMatchObject({ given: 'ANNA', family: 'WENDRAU' });
    expect(x.company?.confidence === 'high').toBe(false);
    const y = extract({ front: lines(['Jannik Oberländer', 0.09], ['Fotograf & Videograf', 0.05], ['hallo@jannikoberlaender-de.example', 0.045]), region: 'DE' });
    expect(y.name?.value).toMatchObject({ given: 'Jannik', family: 'Oberländer' });
    expect(y.company).toBeUndefined();
  });

  it('S4/S5: MECARD "N:Anna Wendrau" is split; a code that conflicts with the printed name is medium', () => {
    const x = extract({ front: [], qr: [{ text: 'MECARD:N:Anna Wendrau;EMAIL:anna@wendrau-de.example;;' }], region: 'DE' });
    expect(x.name).toMatchObject({ value: { given: 'Anna', family: 'Wendrau' }, confidence: 'medium' });
    const y = extract({ front: lines(['Max Müller', 0.06], ['Prokurist', 0.035]), qr: [{ text: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Wendrau;Anna;;;\r\nFN:Anna Wendrau\r\nEND:VCARD\r\n' }], region: 'DE' });
    expect(y.name?.confidence).toBe('medium');
    expect((y.alternatives.name?.value as { family: string }).family).toBe('Müller');
    expect(readMecard('MECARD:N:Achterkamp,Fenna;ADR:,,Am Messesee 3,Hannover,,30521,Deutschland;;')?.addresses[0]).toMatchObject({ street: 'Am Messesee 3', city: 'Hannover', postcode: '30521', country: 'Deutschland' });
  });

  it.each(['Kundennummer 4711 0815 22', 'Art.-Nr. 0761 2928', 'Lizenz 030 1234 5678', 'Kammer-Nr. 030 123456', 'Stand 4711 0815', 'Matrikel 0761 2928 27', 'ROC #312845', 'Mo-Fr 08.00-18.00'])('S6: "%s" is no phone', (t) => {
    const x = extractText(`${t}\nanna@wendrau-de.example`, { region: 'DE' });
    expect(x.phones).toEqual([]);
    expect(x.name).toBeUndefined();
  });

  it('S6: "Tel.-Nr." and "Phone No." still label a phone', () => {
    expect(phones(extractText('Tel.-Nr. 0761 292827\nanna@wendrau-de.example', { region: 'DE' }))).toEqual([['+49761292827', 'work', 'high']]);
    expect(extractText('Phone No: +44 20 7946 0958').phones[0].value.e164).toBe('+442079460958');
  });

  it('S7: a registry word blocks only the number it labels; short words need ":"/a digit', () => {
    expect(extractText('Tan Wei Ming +65 9123 4567').phones[0].value.e164).toBe('+6591234567');
    const x = extractText('Ein Unternehmen der Wendrau Gruppe Tel 0761 292827\nanna@wendrau-de.example', { region: 'DE' });
    expect(x.phones[0].value.e164).toBe('+49761292827');
    expect(x.company?.value ?? '').not.toMatch(/Unternehmen/);
    expect(extractText('CIF B-12345678\nUSt-IdNr. DE 812 345 678\nTAN: 4711 0815', { region: 'ES' }).phones).toEqual([]);
  });

  it('S8: two numbers joined by " / " are split when each is valid alone; "0761 / 29 28 27" stays one', () => {
    expect(phones(extractText('Tel. 030 123456 / 0171 7654321\nanna@wendrau-de.example', { region: 'DE' })).map((p) => p.slice(0, 2))).toEqual([
      ['+4930123456', 'work'],
      ['+491717654321', 'mobile'],
    ]);
    expect(extractText('Fon 0761 / 29 28 27\nanna@wendrau-de.example', { region: 'DE' }).phones.map((p) => p.value.e164)).toEqual(['+49761292827']);
  });

  it('S9: an explicit www. with a TLD outside the snapshot is a website at medium', () => {
    expect(extractText('www.wendrau.holzbau').urls[0]).toMatchObject({ value: 'www.wendrau.holzbau', confidence: 'medium' });
    expect(extractText('wendrau.holzbau').urls).toEqual([]);
    expect(extractText('www.wendrau.gmbh').urls[0]).toMatchObject({ value: 'www.wendrau.gmbh', confidence: 'high' }); // .gmbh added to the snapshot
    expect(extractText('www.zahnspange.dentist').urls[0]).toMatchObject({ value: 'www.zahnspange.dentist', confidence: 'high' });
  });

  it('S10: a specific label the metadata contradicts is not sure; N4: an office icon read as "O" is no digit', () => {
    expect(phones(extractText('M 030 1234567\nanna@wendrau-de.example', { region: 'DE' }))).toEqual([['+49301234567', 'mobile', 'medium']]);
    expect(phones(extractText('C 030 1234567\nanna@wendrau-de.example', { region: 'DE' }))).toEqual([['+49301234567', 'mobile', 'medium']]);
    expect(extractText('O 0171 1234567\nanna@wendrau-de.example', { region: 'DE' }).phones[0].value).toMatchObject({ e164: '+491711234567', type: 'work' });
  });
});

describe('B1 misses that were extractor bugs (B1 is a tuning set from now on)', () => {
  it('suffix numbers ("Durchwahl -127", "F: -19") and vanity numbers', () => {
    const x = extractText('Zentrale 0049 6407 9 13-0 · Durchwahl -127\nm@stadtwerke-rabensteg-de.example', { region: 'DE' });
    expect(phones(x)).toEqual([
      ['+4964079130', 'work', 'high'],
      ['+496407913127', 'work', 'medium'],
    ]);
    expect(extractText('T: 0212 / 2 33 44-0  F: -19\nk@acme-wzm-de.example', { region: 'DE' }).phones.map((p) => [p.value.e164, p.value.type])).toEqual([
      ['+49212233440', 'work'],
      ['+492122334419', 'fax'],
    ]);
    expect(extractText('1-800-GO-PLUMB\nPhoenix, AZ 85004', { region: 'US' }).phones[0]).toMatchObject({ value: { e164: '+18004675862' }, confidence: 'medium' });
  });

  it('e-mail OCR damage is repaired against the printed website or name (medium)', () => {
    const x = extractText('Bogdan Wiśniewski\nb.wisniewski@holzwurrn-vellstedt-de.example\nwww.holzwurm-vellstedt.de', { region: 'DE' });
    expect(x.emails[0]).toMatchObject({ value: { value: 'b.wisniewski@holzwurm-vellstedt-de.example' }, confidence: 'medium' });
    expect(extractText('marcus.delacroix@brightiyre-analytics-com.example').emails[0]).toMatchObject({ value: { value: 'marcus.delacroix@brightlyre-analytics-com.example' }, confidence: 'medium' });
    expect(extract({ front: lines(['Margarete Pfefferkorn', 0.06], ['Sachbearbeiterin', 0.04], ['m.pfefferkom@stadtwerke-rabenau-de.example', 0.036]), region: 'DE' }).emails[0].value.value).toBe('m.pfefferkorn@stadtwerke-rabenau-de.example');
  });

  it('a word or address broken at the line end is joined; a letter-spaced logo is one word', () => {
    const x = extract({ front: lines(['Ottilie Brandstetter', 0.07], ['Geschäftsführende Gesell-', 0.04], ['schafterin', 0.04], ['ngozi.adeyemi@klinikum-', 0.036], ['birkenhain.de', 0.036]), region: 'DE' });
    expect(x.title?.value).toBe('Geschäftsführende Gesellschafterin');
    expect(x.emails.map((e) => e.value.value)).toEqual(['ngozi.adeyemi@klinikum-birkenhain-de.example']);
    expect(x.urls).toEqual([]);
    expect(x.title?.sources).toEqual(['f1', 'f2']);
    expect(extract({ front: lines(['W E I N G U T', 0.03], ['Clara Rebholz', 0.035]), region: 'DE' }).lines.some((l) => l.text === 'W E I N G U T')).toBe(true);
  });

  it('names: title before the name, nickname, dropped space, two lines, prefixes, Catalan "i", Indonesian degrees', () => {
    const n = (t: string, region = 'DE') => extractText(t, { region }).name?.value;
    expect(n('Notar Dr. Friedrich-Wilhelm von Ahlefeldt\nnotariat@ahlefeldt-notar-de.example')).toMatchObject({ prefix: 'Dr.', given: 'Friedrich-Wilhelm', family: 'von Ahlefeldt' });
    expect(extractText('Filialleitung: Petra Unterholzner').title?.value).toBe('Filialleitung');
    expect(extractText('Inh. Zbigniew Kaczmarek\nLindenweg 4, 04157 Leipzig').title?.value).toBe('Inh.');
    expect(n('Rosalind "Roz" Okafor\nroz@lonespur-realty-com.example', 'US')).toMatchObject({ given: 'Rosalind', family: 'Okafor' });
    expect(n('Best regards,\nTom\n--\nTomasz "Tom" Wierzbicki | Head of Partnerships\ntom@fernleaf-io.example', 'GB')).toMatchObject({ given: 'Tomasz', family: 'Wierzbicki' });
    expect(n('MarkusLindqvist\nm.lindqvist@acme-de.example')).toMatchObject({ given: 'Markus', family: 'Lindqvist' });
    expect(extract({ front: lines(['Ottilie', 0.07], ['Brandstetter-Nakamura', 0.07], ['ottilie@interiorstudio-ob-de.example', 0.03]), region: 'DE' }).name?.value).toMatchObject({ given: 'Ottilie', family: 'Brandstetter-Nakamura' });
    expect(n('Maître Hélène Dubois-Roche', 'FR')).toMatchObject({ prefix: 'Maître', given: 'Hélène' });
    expect(n('Av. Zeynep Karaosmanoğlu', 'TR')).toMatchObject({ prefix: 'Av.', given: 'Zeynep' });
    expect(n('mgr inż. Bożena Wróblewska-Kąkol', 'PL')).toMatchObject({ prefix: 'mgr inż.', given: 'Bożena' });
    expect(n('Jordi Puigdomènech i Vilaró', 'ES')).toMatchObject({ given: 'Jordi', family: 'Puigdomènech i Vilaró' });
    expect(n('Dewi Lestari Wibowo, S.E., M.M.', 'ID')).toMatchObject({ given: 'Dewi', family: 'Wibowo', suffix: 'S.E., M.M.' });
    expect(n('李明华 Li Minghua\nli.minghua@hgdz-sz-com-cn.example', 'CN')).toMatchObject({ given: 'Minghua', family: 'Li' });
  });

  it('department and title on one line are split', () => {
    const t = (s: string, region = 'JP') => {
      const x = extract({ front: lines(['山田 太郎', 0.08], [s, 0.04]), region });
      return [x.department?.value, x.title?.value];
    };
    expect(t('営業部 部長')).toEqual(['営業部', '部長']);
    expect(t('개발팀 팀장', 'KR')).toEqual(['개발팀', '팀장']);
    expect(t('Senior Manager – Procurement', 'IN')).toEqual(['Procurement', 'Senior Manager']);
    expect(t('General Manager, Sales Division')).toEqual(['Sales Division', 'General Manager']);
    expect(t('VP, Enterprise Sales', 'US')).toEqual([undefined, 'VP, Enterprise Sales']);
  });

  it('addresses: repaired postcodes, PO boxes, Cedex, comma continuations, JP/KR in Latin, TR slash, HK, VN, CN', () => {
    const a = (t: string, region = 'DE') => extractText(t, { region }).addresses[0]?.value;
    expect(a('Am Sägewerk 5\nO1067 Dresden')).toMatchObject({ postcode: '01067', city: 'Dresden', street: 'Am Sägewerk 5' });
    expect(a('Postbus l234\n3000 BA Rotterdam', 'NL')).toMatchObject({ street: 'Postbus 1234', postcode: '3000 BA' });
    expect(a('BP 3O122\n13302 Marseille Cedex 03\nk@medfret-fr.example')).toMatchObject({ street: 'BP 30122', postcode: '13302', city: 'Marseille' });
    expect(a('Plot No. 42, MIDC Industrial Area,\nAndheri (East), Mumbai – 400 093,\nMaharashtra, India', 'IN')).toMatchObject({ postcode: '400093', city: 'Mumbai', street: 'Plot No. 42, MIDC Industrial Area, Andheri (East)' });
    expect(a('8F Shibuya Sakura Bldg., 2-21-1 Shibuya,\nShibuya-ku, Tokyo 150-0002, Japan', 'JP')).toMatchObject({ city: 'Shibuya-ku', region: 'Tokyo', postcode: '150-0002' });
    expect(a('123 Pangyo-ro, Bundang-gu, Seongnam-si,\nGyeonggi-do 13494, Korea', 'KR')).toMatchObject({ city: 'Seongnam-si', region: 'Gyeonggi-do', postcode: '13494' });
    expect(a('Büyükdere Cad. No: 185\n34394 Şişli / İstanbul', 'TR')).toMatchObject({ city: 'İstanbul', region: 'Şişli', postcode: '34394' });
    expect(a('Unit 1203, 12/F, Tower 2, Times Square\n1 Matheson Street, Causeway Bay, Hong Kong', 'HK')).toMatchObject({ city: 'Hong Kong', countryCode: 'HK' });
    expect(a('Số 25 Đường Lê Duẩn, Phường Bến Nghé, Quận 1,\nTP. Hồ Chí Minh', 'VN')).toMatchObject({ city: 'TP. Hồ Chí Minh' }); // as printed (P5c, both blind sets)
    expect(a('地址：北京市朝阳区建国路88号 100022', 'CN')).toMatchObject({ postcode: '100022', city: '北京市' });
    expect(a('Add: No.18 Keji South Rd, Nanshan, Shenzhen 518057, China', 'CN')).toMatchObject({ postcode: '518057', city: 'Shenzhen' });
    expect(a('Blvd. Adolfo López Mateos 2105 Pte.\nCol. Jardines del Moral\n37160 León, Gto.', 'MX')).toMatchObject({ postcode: '37160', city: 'León' });
    expect(extractText('Blvd. Adolfo López Mateos 2105 Pte.\nCol. Jardines del Moral\n37160 León, Gto.', { region: 'MX' }).addresses).toHaveLength(1);
  });

  it('companies: a slogan after the legal form is cut; a company word continues the larger line above; lists of services are no company', () => {
    expect(extractText('Fernleaf Labs Ltd. — Making carbon accounting boring\ntom@fernleaf-io.example').company?.value).toBe('Fernleaf Labs Ltd.');
    expect(extract({ front: lines(['KARAOSMANOĞLU', 0.05], ['Hukuk Bürosu', 0.034], ['Av. Zeynep Karaosmanoğlu', 0.06]), region: 'TR' }).company?.value).toBe('KARAOSMANOĞLU Hukuk Bürosu');
    expect(extract({ front: lines(['Räume, die erzählen.', 0.05], ['Wohnen · Hotel · Gastronomie', 0.035]), region: 'DE' }).company).toBeUndefined();
    expect(extract({ front: lines(['BROTZEIT', 0.12], ['Bäckerei · Konditorei', 0.04], ['www.baeckerei-brotzeit.de', 0.038]), region: 'DE' }).company?.value).toBe('BROTZEIT');
  });

  it('bilingual social labels: "微信 WeChat: id"; x.com profiles', () => {
    expect(extractText('微信 WeChat: liminghua_sz').socials[0].value).toEqual({ service: 'wechat', value: 'liminghua_sz' });
    expect(extractText('x.com/pvenkat').socials[0].value.service).toBe('x');
  });
});

describe('blind set B1 as a TUNING set (measured once on 8ab53c5 before these fixes: docs/V1_LOG.md P4c)', () => {
  it('the remaining misses are pinned by id; none is high-confidence wrong', () => {
    const run = runBlindSet(blind);
    expect(run.overall.highWrong + run.overall.fields.phoneType.highWrong + run.overall.fields.prefix.highWrong).toBe(0);
    expect(run.overall.misses.map((m) => `${m.card} ${m.field}`)).toEqual([
      'de-05 company', // no legal form, no domain match: asked (low)
      'it-03 name', // "di Gino Pellegrini": found, but no signal → asked (low)
      'kr-01 address', // UNCONFIRMED format assumption: Seoul 특별시 as region and the 구 as city
      'uk-02 phone', // UK 07700 900xxx drama range: invalid → asked (low)
      'us-02 social', // a lone @handle is social "other", low (SPEC rule 4)
    ]);
  });
});

describe('S13 — the bench prints the confident-wrong figure with phone types and prefixes, and the asked-wrong count', () => {
  it('formatScore has both headlines', () => {
    const text = formatScore(scoreCards(dev.slice(0, 5)), 'dev5');
    expect(text).toMatch(/confident wrong: \d+ of \d+/);
    expect(text).toMatch(/confident wrong incl\. phone types and prefixes: \d+ of \d+/);
    expect(text).toMatch(/asked \(low\): \d+ values, \d+ of them right, \d+ asked-wrong/);
  });
});
