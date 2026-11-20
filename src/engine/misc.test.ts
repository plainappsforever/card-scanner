import { emptyContact, emptyName } from './contact';
import { cardTitle, displayName, exportFileName, shareText, sortCards } from './format';
import { linesFromText, normalizeOcr, type RawMlkit, type RawVision } from './ocr';
import { chooseRotation, needsRotationRetry, orientationScore } from './orientation';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { customTime, presetTime, reconcile, reminderContent } from './reminder-plan';
import { normalizeSearch, planQuery, searchBody } from './search';

const name = (given: string, family: string, more = {}) => ({ ...emptyName(), given, family, ...more });

describe('format (SPEC §5.6)', () => {
  it('display names: Latin given-first, CJK family-first without space, Hangul with space, Hungarian on request', () => {
    expect(displayName(name('Anna', 'Weber', { prefix: 'Dr.' }))).toBe('Dr. Anna Weber');
    expect(displayName(name('太郎', '山田'))).toBe('山田太郎');
    expect(displayName(name('민준', '김'))).toBe('김 민준');
    expect(displayName(name('László', 'Nagy'), { familyFirst: true })).toBe('Nagy László');
    expect(displayName({ ...emptyName(), full: '山田太郎' })).toBe('山田太郎');
    expect(cardTitle({ ...emptyContact(), company: 'ACME' })).toBe('ACME');
  });

  it('sorts by name with the locale (Ä with A in German), company, added', () => {
    const cards = [
      { id: '1', createdAt: 1, contact: { ...emptyContact(), name: name('Zoe', 'Ärger'), company: 'B' } },
      { id: '2', createdAt: 2, contact: { ...emptyContact(), name: name('Al', 'Berg') } },
      { id: '3', createdAt: 3, contact: { ...emptyContact(), company: 'Alpha' } },
    ];
    expect(sortCards(cards, 'name', 'de').map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(sortCards(cards, 'company', 'de').map((c) => c.id)).toEqual(['3', '1', '2']);
    expect(sortCards(cards, 'added').map((c) => c.id)).toEqual(['3', '2', '1']);
  });

  it('share text and file names', () => {
    const c = { ...emptyContact(), name: name('Anna', 'Weber'), title: 'CEO', company: 'ACME', phones: [{ value: '+49 30 1', type: 'work' as const }], emails: [{ value: 'a@acme-de.example', type: 'work' as const }] };
    expect(shareText(c, { mobile: 'Mobile', work: 'Work', fax: 'Fax', home: 'Home', other: 'Other', email: 'E-mail', url: 'Web', address: 'Address' })).toBe('Anna Weber\nCEO\nACME\nWork: +49 30 1\nE-mail: a@acme-de.example');
    expect(exportFileName('Hannover Messe: 2026/04 <final>?', 'vcf')).toBe('Hannover Messe- 2026-04 -final--.vcf');
    expect(exportFileName('   ', 'csv')).toBe('cards.csv');
    expect(exportFileName('x'.repeat(150), 'csv')).toHaveLength(104);
  });
});

describe('search plan (SPEC §5.7)', () => {
  it('normalises and picks trigram MATCH for ≥ 3 characters, LIKE below', () => {
    expect(normalizeSearch('  ＡＣＭＥ   GmbH ')).toBe('acme gmbh');
    expect(planQuery('ac')).toEqual({ kind: 'like', pattern: '%ac%' });
    expect(planQuery('50%')).toEqual({ kind: 'match', expr: '"50%"' });
    expect(planQuery('a_')).toEqual({ kind: 'like', pattern: '%a\\_%' });
    expect(planQuery('say "x"')).toEqual({ kind: 'match', expr: '"say ""x"""' });
    expect(planQuery('   ')).toEqual({ kind: 'all' });
    expect(searchBody(['Anna', null, ' ', 'ACME'])).toBe('anna\nacme');
  });
});

describe('reminder plan (SPEC §5.8)', () => {
  const now = new Date(2026, 9, 16, 14, 30); // Friday 16 Oct 2026, 14:30 local

  it('presets at the follow-up time; next Monday from a Friday and from a Monday', () => {
    expect(new Date(presetTime('tomorrow', now, '09:00'))).toEqual(new Date(2026, 9, 17, 9, 0));
    expect(new Date(presetTime('in3days', now, '18:15'))).toEqual(new Date(2026, 9, 19, 18, 15));
    expect(new Date(presetTime('nextMonday', now))).toEqual(new Date(2026, 9, 19, 9, 0));
    expect(new Date(presetTime('nextMonday', new Date(2026, 9, 19, 8)))).toEqual(new Date(2026, 9, 26, 9, 0));
    expect(new Date(presetTime('in2weeks', now, 'bad'))).toEqual(new Date(2026, 9, 30, 9, 0));
    expect(customTime('2026-02-30')).toBeNull();
    expect(new Date(customTime('2026-12-01', '07:05')!)).toEqual(new Date(2026, 11, 1, 7, 5));
  });

  const texts = { title: (n: string, co: string) => (co ? `Follow up: ${n} (${co})` : `Follow up: ${n}`) };
  const c = (cardId: string, at: number, notificationId: string | null, more: { local?: string | null; title?: string; company?: string; event?: string | null } = {}) => ({
    cardId,
    at,
    local: null,
    notificationId,
    title: 'Anna Weber',
    company: 'ACME',
    event: 'IAA',
    ...more,
  });
  const sched = (id: string, cardId: string | null, at: number | null, title = 'Follow up: Anna Weber (ACME)', body = 'IAA') => ({ id, cardId, at, title, body });

  it('reconcile schedules missing/changed reminders and cancels stale ones; past ones are dropped', () => {
    const t = now.getTime();
    const plan = reconcile(
      [c('keep', t + 1000, 'n1'), c('moved', t + 5000, 'n2'), c('new', t + 9000, null), c('past', t - 1, 'n4')],
      [sched('n1', 'keep', t + 1000), sched('n2', 'moved', t + 2000), sched('n3', 'deleted', t + 3000), sched('n4', 'past', t - 1)],
      t,
      texts
    );
    expect(plan.schedule.map((x) => x.cardId)).toEqual(['moved', 'new']);
    expect(plan.cancel.sort()).toEqual(['n2', 'n3', 'n4']);
    expect(plan.keep).toEqual([{ cardId: 'keep', id: 'n1' }]);
    expect(reminderContent(c('x', 1, null), texts)).toEqual({ title: 'Follow up: Anna Weber (ACME)', body: 'IAA' });
  });

  it('reconcile after edits: renamed person, new company, renamed or removed event → rescheduled with the new text', () => {
    const t = now.getTime();
    const s = [sched('a', 'name', t + 10), sched('b', 'company', t + 10), sched('c', 'event', t + 10), sched('d', 'noevent', t + 10), sched('e', 'same', t + 10)];
    const plan = reconcile(
      [c('name', t + 10, 'a', { title: 'Anna Weber-Schulz' }), c('company', t + 10, 'b', { company: 'ACME Robotics' }), c('event', t + 10, 'c', { event: 'IAA 2026' }), c('noevent', t + 10, 'd', { event: null }), c('same', t + 10, 'e')],
      s,
      t,
      texts
    );
    expect(plan.cancel.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(plan.schedule.map((w) => [w.cardId, w.title, w.body])).toEqual([
      ['name', 'Follow up: Anna Weber-Schulz (ACME)', 'IAA'],
      ['company', 'Follow up: Anna Weber (ACME Robotics)', 'IAA'],
      ['event', 'Follow up: Anna Weber (ACME)', 'IAA 2026'],
      ['noevent', 'Follow up: Anna Weber (ACME)', ''],
    ]);
  });

  it('reconcile: duplicates, notifications without card data (P7 format) and deleted cards are cancelled', () => {
    const t = now.getTime();
    const plan = reconcile([c('x', t + 50, 'n1')], [sched('n1', 'x', t + 50), sched('n1b', 'x', t + 50), sched('old', 'x', null), sched('orphan', null, null)], t, texts);
    expect(plan.keep).toEqual([{ cardId: 'x', id: 'n1' }]);
    expect(plan.cancel.sort()).toEqual(['n1b', 'old', 'orphan']);
    expect(plan.schedule).toEqual([]);
    // the card was deleted (it is not in the list any more): its notification goes, nothing is scheduled
    expect(reconcile([], [sched('n1', 'x', t + 50)], t, texts)).toMatchObject({ cancel: ['n1'], schedule: [] });
  });
});

// The engine uses the phone's local time (Date). Jest cannot switch the process time zone, so these run the REAL engine in
// a child Node process per zone (TZ=…), through the repo's TypeScript loader.
function inZone(tz: string, body: string): any {
  const code = `import * as R from './src/engine/reminder-plan.ts'; const out = (() => { ${body} })(); console.log(JSON.stringify(out));`;
  const out = execFileSync(process.execPath, ['--import', './scripts/node/ts-hooks.mjs', '--input-type=module', '-e', code], { cwd: join(__dirname, '..', '..'), env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  return JSON.parse(out);
}

describe('follow-ups across time zones (D48)', () => {
  it('a wall-clock follow-up stays at 09:00 local when the phone moves from Berlin to Tokyo', () => {
    const berlin = inZone('Europe/Berlin', `const at = R.presetTime('tomorrow', new Date(2026, 9, 16, 14, 30)); return { at, local: R.toLocalStamp(at) };`);
    expect(berlin.local).toBe('2026-10-17T09:00');
    const tokyo = inZone(
      'Asia/Tokyo',
      `const f = { cardId: 'k', at: ${berlin.at}, local: '${berlin.local}', notificationId: 'n', title: 'A', company: '', event: null };
       const due = R.effectiveAt(f);
       const plan = R.reconcile([f], [{ id: 'n', cardId: 'k', at: ${berlin.at}, title: 'Follow up: A', body: '' }], due - 3600000, { title: (n) => 'Follow up: ' + n });
       return { due, hour: new Date(due).getHours(), plan, old: R.effectiveAt({ at: ${berlin.at}, local: null }) };`
    );
    expect(tokyo.hour).toBe(9);
    expect(berlin.at - tokyo.due).toBe(7 * 3600_000); // 09:00 in Tokyo is 7 h before 09:00 in Berlin (CEST)
    expect(tokyo.plan.cancel).toEqual(['n']);
    expect(tokyo.plan.schedule.map((w: { at: number }) => w.at)).toEqual([tokyo.due]);
    expect(tokyo.plan.moved.map((w: { cardId: string }) => w.cardId)).toEqual(['k']);
    expect(tokyo.old).toBe(berlin.at); // rows from before migration 3 (no wall-clock stamp) keep their instant
  });

  it('daylight saving: 09:00 stays 09:00 after the clocks change; the skipped hour moves forward; bad stamps refused', () => {
    const r = inZone(
      'Europe/Berlin',
      `return { gap: R.fromLocalStamp('2026-10-26T09:00') - R.fromLocalStamp('2026-10-24T09:00'), skipped: new Date(R.fromLocalStamp('2027-03-28T02:30')).getHours(),
         bad: [R.fromLocalStamp('2026-02-30T09:00'), R.fromLocalStamp('2026-10-17 09:00'), R.fromLocalStamp('2026-10-17T24:00')] };`
    );
    expect(r.gap).toBe(49 * 3600_000); // clocks went back on 25 Oct
    expect(r.skipped).toBe(3);
    expect(r.bad).toEqual([null, null, null]);
  });
});

describe('OCR normaliser (copied from Offscan) and orientation (D18)', () => {
  it('Vision: flips to a top-left origin, reading order, boxes and side-prefixed ids', () => {
    const q = (x0: number, y0: number, x1: number, y1: number) => [
      { x: x0, y: y1 },
      { x: x1, y: y1 },
      { x: x1, y: y0 },
      { x: x0, y: y0 },
    ] as RawVision['lines'][number]['quad'];
    const raw: RawVision = {
      engine: 'vision',
      langs: ['de-DE'],
      lines: [
        { text: 'anna@acme-de.example', confidence: 0.9, quad: q(0.1, 0.2, 0.5, 0.25) }, // lower on the card (Vision y up)
        { text: 'Anna Weber', confidence: 1, quad: q(0.1, 0.8, 0.6, 0.9) },
      ],
    };
    const out = normalizeOcr(raw, 'b');
    expect(out.lines.map((l) => [l.id, l.text])).toEqual([['b0', 'Anna Weber'], ['b1', 'anna@acme-de.example']]);
    expect(out.lines[0].box!.y).toBeCloseTo(0.1);
    expect(out.lines[0].height).toBeCloseTo(0.1);
  });

  it('ML Kit: pixels → 0…1, CJK words joined without spaces', () => {
    const pts = (x0: number, y0: number, x1: number, y1: number) => [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
    const raw: RawMlkit = { engine: 'mlkit', langs: ['ja'], width: 1000, height: 600, blocks: [{ text: '', lines: [{ text: '山田 太郎', cornerPoints: pts(100, 60, 400, 120), elements: [{ text: '山田', cornerPoints: pts(100, 60, 250, 120) }, { text: '太郎', cornerPoints: pts(250, 60, 400, 120) }] }] }] };
    const out = normalizeOcr(raw);
    expect(out.lines[0]).toMatchObject({ id: 'f0', text: '山田太郎' });
    expect(out.lines[0].box!.w).toBeCloseTo(0.3);
    expect(out.lines[0].box!.y).toBeCloseTo(0.1);
  });

  it('pasted text becomes lines without boxes', () => {
    expect(linesFromText('Anna Weber\n\n  ACME GmbH  \r\nTel. 030 1')).toEqual([
      { id: 't0', text: 'Anna Weber', dir: 'ltr' },
      { id: 't1', text: 'ACME GmbH', dir: 'ltr' },
      { id: 't2', text: 'Tel. 030 1', dir: 'ltr' },
    ]);
  });

  it('retries rotations only for weak results and picks the best; ties → lower rotation', () => {
    const good = [{ id: 'f0', text: 'Anna Weber' }, { id: 'f1', text: 'anna@acme-de.example' }, { id: 'f2', text: '+49 30 1234567' }];
    const junk = [{ id: 'f0', text: 'ɐuuɐ ʍǝqǝɹ' }];
    expect(needsRotationRetry(good)).toBe(false);
    expect(needsRotationRetry(junk)).toBe(true);
    expect(orientationScore(good)).toBeGreaterThan(orientationScore(junk));
    expect(chooseRotation([{ rotation: 0, lines: junk }, { rotation: 90, lines: good }, { rotation: 270, lines: [] }])).toBe(90);
    expect(chooseRotation([{ rotation: 180, lines: good }, { rotation: 90, lines: good }])).toBe(90);
  });
});
