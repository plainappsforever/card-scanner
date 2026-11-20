/**
 * @jest-environment node
 */
// Fix round after the real-OCR set O3 (test/fixtures/cards/vision-1, macOS Vision; V1_LOG "O3", D42/D43). vision-1 was
// measured ONCE on the untouched snapshot 6f43064; since then it is a TUNING set (L27 rule 7). These tests keep the
// fixes for real OCR misreads; they are not accuracy evidence.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blindInput, loadBlind, type BlindFixture } from '../../../test/blind-format';

import { extract, extractText } from './index';
import type { Extracted, Line } from './types';

const load = (set: string) => loadBlind(join(__dirname, '../../../test/fixtures/cards/vision-1', set), (p) => readFileSync(p, 'utf8'), (d) => readdirSync(d), join);
const v1 = load('b1');
const v3 = load('b3');
const run = (id: string, set: BlindFixture[]) => extract(blindInput(set.find((f) => f.id === id) as BlindFixture));
const emails = (x: Extracted) => x.emails.map((e) => `${e.value.value}:${e.confidence}`);
const phones = (x: Extracted) => x.phones.map((p) => `${p.value.e164 ?? p.value.raw}:${p.confidence}`);
const lines = (...texts: string[]): Line[] => texts.map((t, i) => ({ id: `f${i}`, text: t, height: 0.04, box: { x: 0.08, y: 0.1 + i * 0.07, w: 0.6, h: 0.04 } }));

describe('O3 — e-mail misreads by Vision', () => {
  it('a space inserted after a dot inside the local part is joined, at medium', () => {
    expect(emails(run('uk-l10-front', v3))).toEqual(['oliver.whitcombe@pembertonashe-co-uk.example:medium']);
    expect(emails(extract({ front: lines('Anna Weber', 'anna. weber@acme-de.example'), region: 'DE' }))).toEqual(['anna.weber@acme-de.example:medium']);
  });

  it('a label word before the address is never joined into it', () => {
    expect(emails(extract({ front: lines('Anna Weber', 'e-mail. anna@acme-de.example'), region: 'DE' }))).toEqual(['anna@acme-de.example:high']);
  });

  it('a capital I starting a lower-case word is I or l: l when it spells the initials, never high', () => {
    const x = run('us-a21', v3);
    expect(emails(x)).toEqual(['lvr@uwsm-edu.example:medium']);
    expect(x.socials.map((s) => `${s.value.value}:${s.confidence}`)).toEqual(['x.com/lvr_nlp:medium']);
    expect(emails(extractText('Ivan Vatrin\nIvan@vatrin-de.example', { region: 'DE' }))).toEqual(['ivan@vatrin-de.example:medium']);
  });

  it('a domain one letter away from the company makes both medium', () => {
    const x = run('de-02', v1);
    expect(emails(x)).toEqual(['i.brandaver@brandaver-partner-de.example:medium']);
    expect(x.company?.confidence).toBe('medium');
  });
});

describe('O3 — layout', () => {
  it('a postcode glued to a number from the next column is cut off', () => {
    expect(phones(run('de-k42', v3))).toContain('+493412158849:high');
    expect(phones(extract({ front: lines('Tel. 030 1234 5678 Berlin'), region: 'DE' }))).toEqual(['+493012345678:medium']); // region-only number: medium (P3 rule), digits kept
  });

  it('a domain prefix joined over two lines is medium', () => {
    expect(`${run('de-s12', v3).company?.confidence}`).toBe('medium');
  });
});
