// Scorer implementing the SPEC §13 scoring rules (fixed before any blind set exists). Pure; shared by Jest and the
// bench script (`npm run blind <folder>`).
//  - e-mail: lower-case exact · URL: host+path case-insensitive without scheme / trailing slash
//  - phone: E.164 equal (or digits equal when unparseable) · phone type: exact, over the phones that were right
//  - name: given+family after NFKC / case-fold / whitespace removal (middle names count with the given name; prefix and
//    suffix are scored separately)
//  - company / title / department: case- and punctuation-insensitive exact
//  - address: postcode+city exact plus street token overlap ≥ 0.8 (when the truth has a street)
//  - high/medium values count as PRODUCED (right or wrong); a low value counts as "asked the user" (neither)
//  - confident wrong = high-confidence wrong values ÷ all produced values
import { foldText } from '../match';
import { urlKey } from '../merge';

import { fixtureInput, type CardFixture, type Truth } from './fixtures';
import { extract } from './index';
import type { Candidate, Extracted } from './types';

export const FIELDS = ['email', 'url', 'phone', 'phoneType', 'name', 'prefix', 'company', 'title', 'department', 'address', 'social'] as const;
export type Field = (typeof FIELDS)[number];
/** A4 targets (recall); null = reported without a target. */
export const TARGETS: Record<Field, number | null> = { email: 0.95, url: 0.9, phone: 0.9, phoneType: 0.8, name: 0.8, prefix: null, company: 0.7, title: 0.65, department: null, address: 0.75, social: null };
export const CONFIDENT_WRONG_MAX = 0.03;

export type FieldStat = { truth: number; produced: number; right: number; wrong: number; highWrong: number; asked: number; askedRight: number };
export type Miss = { card: string; field: Field; want: string[]; got: string[]; asked: string[] };
export type Score = { cards: number; fields: Record<Field, FieldStat>; misses: Miss[]; produced: number; highWrong: number };

const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const textKey = (s: string) => foldText(s).replace(/[^\p{L}\p{N}]/gu, '');
const urlNorm = (u: string) => urlKey(u).replace(/\/+$/, '');
const digits = (s: string) => s.replace(/\D/g, '');
const phoneNorm = (s: string) => (s.startsWith('+') ? `+${digits(s)}` : digits(s));

type Cmp = { key: string; conf: 'high' | 'medium' | 'low' };

function tally(stat: FieldStat, misses: Miss[], card: string, field: Field, want: string[], got: Cmp[], same: (w: string, g: string) => boolean = (a, b) => a === b) {
  stat.truth += want.length;
  const left = [...want];
  const produced = got.filter((g) => g.conf !== 'low');
  const asked = got.filter((g) => g.conf === 'low');
  let wrongHere = 0;
  for (const g of produced) {
    stat.produced++;
    const i = left.findIndex((w) => same(w, g.key));
    if (i >= 0) {
      stat.right++;
      left.splice(i, 1);
    } else {
      stat.wrong++;
      wrongHere++;
      if (g.conf === 'high') stat.highWrong++;
    }
  }
  for (const a of asked) {
    stat.asked++;
    const i = left.findIndex((w) => same(w, a.key));
    if (i >= 0) stat.askedRight++;
  }
  if (left.length > 0 || wrongHere > 0) misses.push({ card, field, want, got: produced.map((g) => `${g.key} (${g.conf})`), asked: asked.map((a) => a.key) });
}

const cmp = <T,>(c: Candidate<T> | undefined, key: (v: T) => string): Cmp[] => (c ? [{ key: key(c.value), conf: c.confidence }] : []);

export function scoreCard(fx: CardFixture, x: Extracted, s: Score): void {
  const t: Truth = fx.truth;
  const f = s.fields;
  tally(f.email, s.misses, fx.id, 'email', (t.emails ?? []).map((e) => e.toLowerCase()), x.emails.map((e) => ({ key: e.value.value.toLowerCase(), conf: e.confidence })));
  tally(f.url, s.misses, fx.id, 'url', (t.urls ?? []).map(urlNorm), x.urls.map((u) => ({ key: urlNorm(u.value), conf: u.confidence })));
  tally(
    f.social,
    s.misses,
    fx.id,
    'social',
    (t.socials ?? []).map((so) => `${so.service}:${urlNorm(so.value).replace(/^@/, '')}`),
    x.socials.map((so) => ({ key: `${so.value.service}:${urlNorm(so.value.value).replace(/^@/, '')}`, conf: so.confidence }))
  );
  // phones: number, then type over the numbers that were right
  const truePhones = t.phones ?? [];
  const gotPhones = x.phones.map((p) => ({ key: phoneNorm(p.value.e164 ?? p.value.raw), conf: p.confidence, type: p.value.type }));
  const samePhone = (w: string, g: string) => w === g || (!w.startsWith('+') || !g.startsWith('+') ? digits(w).slice(-9) === digits(g).slice(-9) && digits(w).length >= 7 : false);
  tally(f.phone, s.misses, fx.id, 'phone', truePhones.map((p) => phoneNorm(p.number)), gotPhones, samePhone);
  const typeWant: string[] = [];
  const typeGot: Cmp[] = [];
  for (const g of gotPhones.filter((p) => p.conf !== 'low')) {
    const tp = truePhones.find((p) => samePhone(phoneNorm(p.number), g.key));
    if (!tp) continue;
    typeWant.push(`${g.key}:${tp.type}`);
    typeGot.push({ key: `${g.key}:${g.type}`, conf: g.conf });
  }
  tally(f.phoneType, s.misses, fx.id, 'phoneType', typeWant, typeGot);
  // name: given(+middle) and family
  const nameKey = (n: { given?: string; middle?: string; family?: string }) => `${squash([n.given ?? '', n.middle ?? ''].join(''))}|${squash(n.family ?? '')}`;
  const tn = t.name && (t.name.given || t.name.family) ? [nameKey(t.name)] : [];
  tally(f.name, s.misses, fx.id, 'name', tn, cmp(x.name, nameKey));
  const tp = t.name?.prefix ? [textKey(t.name.prefix)] : [];
  tally(f.prefix, s.misses, fx.id, 'prefix', tp, x.name?.value.prefix ? [{ key: textKey(x.name.value.prefix), conf: x.name.confidence }] : []);
  tally(f.company, s.misses, fx.id, 'company', t.company ? [textKey(t.company)] : [], cmp(x.company, textKey));
  tally(f.title, s.misses, fx.id, 'title', t.title ? [textKey(t.title)] : [], cmp(x.title, textKey));
  tally(f.department, s.misses, fx.id, 'department', t.department ? [textKey(t.department)] : [], cmp(x.department, textKey));
  // address: postcode+city key; the street overlap is checked in `same`
  const streets = new Map<string, string>();
  const want = (t.addresses ?? []).map((a) => {
    const k = `${squash(a.postcode ?? '')}|${textKey(a.city ?? '')}`;
    streets.set(k, a.street ?? '');
    return k;
  });
  const got = x.addresses.map((a) => ({ key: `${squash(a.value.postcode)}|${textKey(a.value.city)}#${a.value.street}`, conf: a.confidence }));
  tally(f.address, s.misses, fx.id, 'address', want, got, (w, g) => {
    const [gk, street] = [g.split('#')[0], g.split('#').slice(1).join('#')];
    if (w !== gk) return false;
    const ts = streets.get(w) ?? '';
    if (!ts) return true;
    // CJK/Hangul streets have no word spaces: every character is a token there
    const tokens = (s: string) => foldText(s).replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu, ' $1 ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const want = tokens(ts);
    const have = new Set(tokens(street));
    return want.filter((tk) => have.has(tk)).length / want.length >= 0.8;
  });
}

export function emptyScore(): Score {
  const fields = Object.fromEntries(FIELDS.map((k) => [k, { truth: 0, produced: 0, right: 0, wrong: 0, highWrong: 0, asked: 0, askedRight: 0 }])) as Record<Field, FieldStat>;
  return { cards: 0, fields, misses: [], produced: 0, highWrong: 0 };
}

export function scoreCards(cards: readonly CardFixture[]): Score {
  const s = emptyScore();
  for (const c of cards) {
    s.cards++;
    scoreCard(c, extract(fixtureInput(c)), s);
  }
  for (const k of FIELDS) {
    if (k === 'phoneType' || k === 'prefix') continue; // derived fields: not double-counted as produced values
    s.produced += s.fields[k].produced;
    s.highWrong += s.fields[k].highWrong;
  }
  return s;
}

const pct = (n: number, d: number) => (d === 0 ? '   –  ' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

export function formatScore(s: Score, title: string): string {
  const rows = [`${title}`, `field        truth  recall  precision  produced  wrong  high-wrong  asked(low)  asked-right  target`];
  for (const k of FIELDS) {
    const f = s.fields[k];
    const target = TARGETS[k];
    const recall = f.truth ? f.right / f.truth : 0;
    const flag = target === null || f.truth === 0 ? '' : recall >= target ? `≥${Math.round(target * 100)}% ok` : `≥${Math.round(target * 100)}% MISS`;
    rows.push(`${k.padEnd(12)} ${String(f.truth).padStart(5)}  ${pct(f.right, f.truth)}  ${pct(f.right, f.produced).padStart(9)}  ${String(f.produced).padStart(8)}  ${String(f.wrong).padStart(5)}  ${String(f.highWrong).padStart(10)}  ${String(f.asked).padStart(10)}  ${String(f.askedRight).padStart(11)}  ${flag}`);
  }
  const cw = s.produced ? s.highWrong / s.produced : 0;
  rows.push(`confident wrong: ${s.highWrong} of ${s.produced} produced values = ${(100 * cw).toFixed(1)}% (target ≤ ${CONFIDENT_WRONG_MAX * 100}%) ${cw <= CONFIDENT_WRONG_MAX ? 'ok' : 'MISS'}`);
  // review S13: the derived fields stay out of the headline above (SPEC §13 as fixed before B1), but a high-confidence
  // wrong phone TYPE or PREFIX is still a confident error the user sees — second headline with them included
  const d = [s.fields.phoneType, s.fields.prefix];
  const hwAll = s.highWrong + d.reduce((n, f) => n + f.highWrong, 0);
  const prAll = s.produced + d.reduce((n, f) => n + f.produced, 0);
  rows.push(`confident wrong incl. phone types and prefixes: ${hwAll} of ${prAll} = ${prAll ? ((100 * hwAll) / prAll).toFixed(1) : '0.0'}%`);
  const asked = FIELDS.filter((k) => k !== 'phoneType' && k !== 'prefix').reduce((n, k) => n + s.fields[k].asked, 0);
  const askedRight = FIELDS.filter((k) => k !== 'phoneType' && k !== 'prefix').reduce((n, k) => n + s.fields[k].askedRight, 0);
  rows.push(`asked (low): ${asked} values, ${askedRight} of them right, ${asked - askedRight} asked-wrong (shown as "Check", never counted as right)`);
  return rows.join('\n');
}
