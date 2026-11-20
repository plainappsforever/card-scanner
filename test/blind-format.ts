// Adapter for blind fixture sets written by a separate agent (format: test/fixtures/cards/blind-1/FORMAT.md) to the
// extractor input and the SPEC §13 scorer (src/engine/extract/score.ts). Lives outside src/engine so that adding it
// does not change the measured extractor snapshot. Only keys documented in FORMAT.md are read.
//
// Mapping decisions (written down BEFORE the single B1 run):
//  - input: `front`/`back` OcrLines are already the normaliser's output model (SPEC §5.0) → passed as Line[] unchanged
//    (id, text, box, height, dir, conf). `text` (paste input) → linesFromText, as the Paste screen does. `qr` raw
//    payloads → ParsedCode { format, text }; the extractor's own code reader (vcard/reader, MECARD) parses them.
//  - truth phone = `e164` (also for `composed` numbers: the full number is the truth) with `type`; `type_accept`
//    types count as right too. `ext` is not part of E.164 (FORMAT) and is not scored.
//  - truth address street = `street`, or `pobox` when no street is printed (the Address model has no PO-box field, so a
//    PO box can only be read into `street`). `extra` (floor/suite) is NOT required: the scorer measures the share of
//    truth street tokens found in the extracted street, so extra tokens in the extracted street cost nothing.
//  - `accept`: every documented alternative is tried per field and the one that scores best is used (ties → the
//    printed truth). Name alternatives: `name.given` replaces given and clears middle; `name.family` replaces family;
//    `name.prefix` is scored in the prefix row; `name.full`/`name.suffix` are not scored by §13 (nor is otherName).
//    `addresses[0].city` replaces the city; if the accepted city is in another script than the truth city (two-script
//    cards, FORMAT: "the other-script variants are listed in accept"), the street check is dropped for that variant,
//    because the truth carries no street in that script.
//  - a low-confidence value is "asked the user": neither right nor wrong (the scorer's rule; FORMAT and SPEC §13).
//  - JP names without a space (jp-02): truth is the real split; a low-confidence answer is asked (FORMAT), a
//    medium/high answer is scored like any other name.
//
// Added for B2 (written BEFORE the single B2 run on 5121cc6; the extractor was not run on B2 before it):
//  - title + department printed on ONE line: truth splits them; that whole line is also accepted as the title (when an
//    input line consists of an accepted title and an accepted department plus at most a short connector such as
//    "of", "de", ",", "–", "|"). The department is then simply not found (a miss, not wrong). B2 lists the line in
//    `accept.title` on most such cards; jp-01-front, kr-01 and sig-02 do not, the rule covers them the same way.
//  - `addresses[0].street` alternatives (new in B2) are tried together with the `addresses[0].city` alternatives;
//    a street is paired only with a city in the same script (two-script cards); a city in another script without an
//    accepted street in that script drops the street check (the B1 rule). `addresses[0].extra` and
//    `addresses[0].region` alternatives change nothing: §13 scores neither extra nor region.
//  - FIXED AFTER the B2 run (P5c, D39): a `name.family` alternative that begins with the truth's middle name clears it
//    from the middle (br-01). The B2 first-run output (docs/blind-2-first-run.txt) was produced without this fix.
//  - no other leniency: a brand logo is the company (no accept for "A member of …"/"Eine Marke der …" lines, none is
//    listed); hk-01's primary name is the Chinese one (no English variant accepted); us-05's truth is +1 although
//    nothing on the card proves the country, so a confident +49 counts as confidently wrong; jp-02 per FORMAT above.
//
// Added for B3 (written BEFORE the single B3 run on 8a4dff7; the extractor was not run on B3 before it). Generic key
// support for keys B3 uses for the first time, plus the orchestrator's judgement calls for B3 (README of the set):
//  - `name.middle` alternatives join the given × family alternatives (vn-h18-both "Nguyen / Thi Minh"); an explicit
//    middle alternative wins over the middle a given/family alternative would leave.
//  - `name.full` alternatives are read as prefix (leading words ending in ".") + given (first word) + middle + family
//    (last word); outside PERSON_PAIRS only given/middle/family are taken (at-u20-both, tr-t34-both: same as the truth
//    or as the given/family alternatives).
//  - `addresses[0].pobox` alternatives are street candidates when the truth prints no street (street = pobox, the B1
//    rule; ae-t35-both Arabic "ص.ب."), paired by script with the city like street alternatives;
//    `addresses[0].postcode` alternatives are tried with every city/street pair (it-h15 "I-39040").
//  - judgement call at-m07 (PERSON_PAIRS): three equal dentists, truth = the first; each accepted full name counts only
//    together with the accepted title of the same index (name, prefix and title are chosen as ONE pair).
//  - judgement call in-i39 (NAME_READINGS): "R. Venkatesh" is given + middle with NO family name; the printed order
//    (given "R.", middle "Venkatesh") is the same reading. A family name "Venkatesh" stays wrong.
//  - judgement calls needing no code (the fixture already encodes them): de-h17-back has no "Durchwahl -214" in its
//    truth (an extra phone from it is wrong/asked as usual); eg-t37 family "Abdel Rahman" (no alternative); combined
//    fixtures take the front-side language as truth with English in `accept`; ae-t35 Latin name primary, Arabic
//    otherName (not scored); tr-t34 Turkish spelling is truth.
//  - country groups for dk/lv/no (Rest of Europe) and eg/sa (Arab states); a "by theme" split from B3's id scheme.
//
// Added in P5d (AFTER B3's single run — B3 is a tuning set; orchestrator judgement call, D41): FORMAT.md lists no
// "telegram" service, so a blind author can only write "other" for a Telegram handle. A truth social of service "other"
// is also accepted as "telegram" when the card itself prints a Telegram cue ("TG", "Telegram", "t.me/") — mx-s14
// "TG @kofi_berlin". The value must still match.
import { linesFromText } from '../src/engine/ocr';
import { extract } from '../src/engine/extract/index';
import type { CardFixture, Truth } from '../src/engine/extract/fixtures';
import { emptyScore, scoreCard, FIELDS, type Field, type Score } from '../src/engine/extract/score';
import type { Box, Extracted, ExtractInput, Line } from '../src/engine/extract/types';
import type { PhoneType } from '../src/engine/contact';
import { foldText } from '../src/engine/match';

export type BlindLine = { id: string; text: string; box?: Box; height?: number; dir?: 'ltr' | 'rtl'; conf?: number };
export type BlindSide = { engine: string; langs: string[]; lines: BlindLine[] };
export type BlindInput = {
  front?: BlindSide;
  back?: BlindSide;
  text?: string;
  qr?: { format: string; text: string; side?: string }[];
  region: string;
  uiLang: string;
};
export type BlindPhone = { printed: string; e164: string; type: PhoneType; label: string | null; ext: string | null; composed?: boolean; type_accept?: PhoneType[] };
export type BlindAddress = { street: string; extra: string; pobox: string; postcode: string; city: string; region: string; country: string; countryCode: string };
export type BlindName = { prefix: string; given: string; middle: string; family: string; suffix: string; full: string };
export type BlindTruth = {
  name: BlindName | null;
  otherName: string | null;
  company: string | null;
  department: string | null;
  title: string | null;
  phones: BlindPhone[];
  emails: string[];
  urls: string[];
  socials: { service: string; value: string }[];
  addresses: BlindAddress[];
};
export type BlindFixture = {
  id: string;
  group: string | null;
  side: 'single' | 'front' | 'back' | 'both';
  card_langs: string[];
  card_country: string;
  layout: string;
  input: BlindInput;
  truth: BlindTruth;
  absent: string[];
  accept: Record<string, string[]>;
  composed: string[];
  traps: string[];
};

const toLine = (l: BlindLine): Line => {
  const line: Line = { id: l.id, text: l.text };
  if (l.box) line.box = { ...l.box };
  if (l.height !== undefined) line.height = l.height;
  if (l.dir) line.dir = l.dir;
  if (l.conf !== undefined) line.conf = l.conf;
  return line;
};

export function blindInput(fx: BlindFixture): ExtractInput {
  const i = fx.input;
  const qr = i.qr?.map((q) => ({ format: q.format, text: q.text }));
  const front = i.text !== undefined ? linesFromText(i.text) : (i.front?.lines ?? []).map(toLine);
  const out: ExtractInput = { front, region: i.region, uiLang: i.uiLang };
  if (i.back) out.back = i.back.lines.map(toLine);
  if (qr && qr.length) out.qr = qr;
  return out;
}

export function blindTruth(fx: BlindFixture): Truth {
  const t = fx.truth;
  const out: Truth = {
    phones: t.phones.map((p) => ({ number: p.e164, type: p.type })),
    emails: [...t.emails],
    urls: [...t.urls],
    socials: t.socials.map((s) => ({ ...s })),
    addresses: t.addresses.map((a) => ({ street: a.street || a.pobox, postcode: a.postcode, city: a.city, region: a.region, country: a.country })),
  };
  if (t.name) out.name = { prefix: t.name.prefix, given: t.name.given, middle: t.name.middle, family: t.name.family, suffix: t.name.suffix };
  if (t.company) out.company = t.company;
  if (t.department) out.department = t.department;
  if (t.title) out.title = t.title;
  return out;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const script = (s: string) => (CJK.test(s) ? 'cjk' : /[\p{Script=Cyrillic}]/u.test(s) ? 'cyr' : /[\p{Script=Arabic}]/u.test(s) ? 'ar' : 'latin');

const fold = (s: string) => foldText(s).replace(/[^\p{L}\p{N}]/gu, '');

/** B3 judgement call: fixtures whose accepted full names go together with the accepted title of the same index. */
export const PERSON_PAIRS = new Set(['at-m07']);
/** B3 judgement calls: extra readings of the printed name (see header). */
export const NAME_READINGS: Record<string, { given: string; middle: string; family: string }[]> = {
  'in-i39': [{ given: 'R.', middle: 'Venkatesh', family: '' }],
};

/** `name.full` alternative → prefix (leading words ending in "."), given (first), middle, family (last). */
export function nameFromFull(full: string): { prefix: string; given: string; middle: string; family: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length - 2 && /\.$/.test(words[i])) i++;
  const rest = words.slice(i);
  const prefix = words.slice(0, i).join(' ');
  if (rest.length < 2) return { prefix, given: rest.join(' '), middle: '', family: '' };
  return { prefix, given: rest[0], middle: rest.slice(1, -1).join(' '), family: rest[rest.length - 1] };
}

/** Input lines that print an accepted title and an accepted department together (B2 judgement call, see header). */
export function titleDepartmentLines(fx: BlindFixture): string[] {
  const t = fx.truth;
  if (!t.title || !t.department) return [];
  const titles = [t.title, ...(fx.accept?.title ?? [])].map(fold).filter(Boolean);
  const depts = [t.department, ...(fx.accept?.department ?? [])].map(fold).filter(Boolean);
  const inp = blindInput(fx);
  const out: string[] = [];
  for (const l of [...inp.front, ...(inp.back ?? [])]) {
    const k = fold(l.text);
    const hit = titles.some((ti) => depts.some((d) => k.includes(ti) && k.includes(d) && k.length <= ti.length + d.length + 6));
    if (hit && !titles.includes(k) && !out.includes(l.text)) out.push(l.text);
  }
  return out;
}

/**
 * A `name.family` alternative that starts with (the end of) the truth's middle name — br-01: middle "Oliveira", family
 * "Santos", accepted family "Oliveira Santos" — takes those words out of the middle; otherwise the middle stays.
 * (Fix after B2's single run, D38/D39: the B2 run kept the middle and scored br-01's "Rafael / Oliveira Santos" wrong.)
 */
export function familyAbsorbsMiddle(middle: string, family: string): string {
  const m = middle.trim().split(/\s+/).filter(Boolean);
  const f = family.trim().split(/\s+/).filter(Boolean).map((w) => fold(w));
  for (let k = m.length; k > 0; k--) {
    const tail = m.slice(m.length - k).map((w) => fold(w));
    if (tail.every((w, i) => f[i] === w) && f.length > k) return m.slice(0, m.length - k).join(' ');
  }
  return middle;
}

type Option = (t: Truth) => void;
type Dimension = { fields: Field[]; options: Option[] };

function dimensions(fx: BlindFixture): Dimension[] {
  const acc = fx.accept ?? {};
  const dims: Dimension[] = [];
  const titleLines = titleDepartmentLines(fx);
  const paired = PERSON_PAIRS.has(fx.id) && !!fx.truth.name;
  for (const k of ['company', 'title', 'department'] as const) {
    const alts = k === 'title' ? [...(paired ? [] : (acc.title ?? [])), ...titleLines] : (acc[k] ?? []);
    if (alts.length) dims.push({ fields: [k], options: [() => {}, ...alts.map((v) => (t: Truth) => void (t[k] = v))] });
  }
  if (acc['urls[0]']?.length) dims.push({ fields: ['url'], options: [() => {}, ...acc['urls[0]'].map((v) => (t: Truth) => void (t.urls = [v, ...(t.urls ?? []).slice(1)]))] });
  if (fx.truth.name) {
    const givens: (string | null)[] = [null, ...(acc['name.given'] ?? [])];
    const middles: (string | null)[] = [null, ...(acc['name.middle'] ?? [])];
    const families: (string | null)[] = [null, ...(acc['name.family'] ?? [])];
    const readings = [...(paired ? [] : (acc['name.full'] ?? []).map(nameFromFull)), ...(NAME_READINGS[fx.id] ?? [])];
    if (givens.length > 1 || middles.length > 1 || families.length > 1 || readings.length) {
      const options: Option[] = [];
      for (const g of givens)
        for (const m of middles)
          for (const f of families)
            options.push((t) => {
              if (!t.name) return;
              t.name = { ...t.name, ...(g !== null ? { given: g, middle: '' } : {}), ...(f !== null ? { family: f, middle: familyAbsorbsMiddle(t.name.middle ?? '', f) } : {}) };
              if (m !== null) t.name = { ...t.name, middle: m };
            });
      for (const r of readings)
        options.push((t) => {
          if (t.name) t.name = { ...t.name, given: r.given, middle: r.middle, family: r.family };
        });
      dims.push({ fields: ['name'], options });
    }
    if (paired) {
      const fulls = acc['name.full'] ?? [];
      const titles = acc.title ?? [];
      const options: Option[] = [() => {}];
      fulls.forEach((full, i) => {
        const n = nameFromFull(full);
        options.push((t) => {
          t.name = { ...t.name, ...n };
          if (titles[i] !== undefined) t.title = titles[i];
        });
      });
      dims.push({ fields: ['name', 'prefix', 'title'], options });
    }
    if (acc['name.prefix']?.length) dims.push({ fields: ['prefix'], options: [() => {}, ...acc['name.prefix'].map((v) => (t: Truth) => void (t.name = { ...t.name, prefix: v }))] });
  }
  const a0 = fx.truth.addresses[0];
  if (a0 && (acc['addresses[0].city']?.length || acc['addresses[0].street']?.length || acc['addresses[0].pobox']?.length || acc['addresses[0].postcode']?.length)) {
    const cities = [a0.city, ...(acc['addresses[0].city'] ?? [])];
    const streets = [a0.street || a0.pobox, ...(acc['addresses[0].street'] ?? []), ...(a0.street ? [] : (acc['addresses[0].pobox'] ?? []))];
    const postcodes = [a0.postcode, ...(acc['addresses[0].postcode'] ?? [])];
    const options: Option[] = [() => {}];
    for (const city of cities) {
      const same = streets.filter((st) => !st || script(st) === script(city));
      for (const street of same.length ? same : [''])
        for (const postcode of postcodes) {
          options.push((t) => {
            const [a, ...rest] = t.addresses ?? [];
            t.addresses = [{ ...a, city, street, postcode }, ...rest];
          });
        }
    }
    dims.push({ fields: ['address'], options });
  }
  const inp = blindInput(fx);
  const telegramCue = [...inp.front, ...(inp.back ?? [])].some((l) => /(?<![\p{L}])(?:TG|telegram)(?![\p{L}])|t\.me\//iu.test(l.text));
  fx.truth.socials.forEach((so, i) => {
    if (so.service === 'other' && telegramCue) dims.push({ fields: ['social'], options: [() => {}, (t) => void (t.socials = (t.socials ?? []).map((q, j) => (j === i ? { ...q, service: 'telegram' } : q)))] });
  });
  fx.truth.phones.forEach((p, i) => {
    if (p.type_accept?.length) dims.push({ fields: ['phoneType'], options: [() => {}, ...p.type_accept.map((ty) => (t: Truth) => void (t.phones = (t.phones ?? []).map((q, j) => (j === i ? { ...q, type: ty } : q))))] });
  });
  return dims;
}

const clone = (t: Truth): Truth => JSON.parse(JSON.stringify(t)) as Truth;

/** The truth with the documented alternatives that best match this extraction (ties keep the printed truth). */
export function chooseTruth(fx: BlindFixture, x: Extracted): Truth {
  const truth = blindTruth(fx);
  const card = (t: Truth): CardFixture => ({ id: fx.id, truth: t });
  for (const d of dimensions(fx)) {
    let best = -Infinity;
    let pick: Option = () => {};
    for (const opt of d.options) {
      const t = clone(truth);
      opt(t);
      const s = emptyScore();
      scoreCard(card(t), x, s);
      const v = d.fields.reduce((n, f) => n + 2 * s.fields[f].right + s.fields[f].askedRight - s.fields[f].wrong, 0);
      if (v > best) {
        best = v;
        pick = opt;
      }
    }
    pick(truth);
  }
  return truth;
}

/** Totals as the scorer's headline (derived fields phoneType/prefix excluded) and the stricter S13 variant. */
export function totals(s: Score): { produced: number; highWrong: number; asked: number; producedAll: number; highWrongAll: number } {
  let produced = 0;
  let highWrong = 0;
  let asked = 0;
  for (const k of FIELDS) {
    if (k === 'phoneType' || k === 'prefix') continue;
    produced += s.fields[k].produced;
    highWrong += s.fields[k].highWrong;
    asked += s.fields[k].asked;
  }
  const producedAll = produced + s.fields.phoneType.produced + s.fields.prefix.produced;
  const highWrongAll = highWrong + s.fields.phoneType.highWrong + s.fields.prefix.highWrong;
  return { produced, highWrong, asked, producedAll, highWrongAll };
}

export const COUNTRY_GROUPS: [string, string[]][] = [
  ['DACH + DE/EN mixed', ['de', 'at', 'ch', 'mx']],
  ['UK + US', ['uk', 'us']],
  ['Rest of Europe + Latin America', ['fr', 'it', 'es', 'mex', 'pl', 'tr', 'nl', 'br', 'be', 'cz', 'pt', 'se', 'dk', 'no', 'lv']],
  ['India, Indonesia, Vietnam, Arab states (AE, SA, EG), Russia', ['in', 'id', 'vn', 'ae', 'sa', 'eg', 'ru']],
  ['CJK (JP, CN, HK, TW, KR)', ['jp', 'cn', 'hk', 'tw', 'kr']],
  ['Pasted signatures', ['sig']],
];
export const countryGroup = (id: string): string => {
  const prefix = id.split('-')[0];
  return COUNTRY_GROUPS.find(([, ps]) => ps.includes(prefix))?.[0] ?? 'other';
};

/** B3's id scheme `<country>-<letter><nn>` (README of the set): the letter is the card's theme. Other sets → null. */
const THEMES: [string, string][] = [
  ['e', 'trade (e)'], ['m', 'medical (m)'], ['l', 'law (l)'], ['s', 'startup / misc (s, y)'], ['y', 'startup / misc (s, y)'],
  ['h', 'hotel / restaurant (h)'], ['a', 'academic (a, u)'], ['u', 'academic (a, u)'], ['g', 'government (g)'], ['c', 'caps (c)'],
  ['n', 'Nordic / Baltic (n)'], ['t', 'Turkish / Arabic (t)'], ['i', 'Indian (i)'], ['v', 'Vietnamese (v)'], ['k', 'two-column (k)'],
  ['x', 'other (x)'], ['q', 'QR-only (q)'],
];
export const cardTheme = (id: string): string | null => {
  if (id.startsWith('sig-')) return 'pasted signature (sig)';
  const m = /^[a-z]+-([a-z])\d{2}(?:-|$)/.exec(id);
  return m ? (THEMES.find(([k]) => k === m[1])?.[1] ?? null) : null;
};

export type BlindRun = {
  overall: Score;
  groups: Map<string, Score>;
  themes: Map<string, Score>;
  regions: Map<string, Score>;
  sides: Map<string, Score>;
  traps: Map<string, { cards: number; clean: number; score: Score }>;
  perCard: { id: string; misses: Score['misses'] }[];
  ms: number;
};

export function runBlindSet(fixtures: readonly BlindFixture[]): BlindRun {
  const run: BlindRun = { overall: emptyScore(), groups: new Map(), themes: new Map(), regions: new Map(), sides: new Map(), traps: new Map(), perCard: [], ms: 0 };
  const into = <K,>(m: Map<K, Score>, k: K) => {
    if (!m.has(k)) m.set(k, emptyScore());
    return m.get(k) as Score;
  };
  const t0 = performance.now();
  for (const fx of fixtures) {
    const x = extract(blindInput(fx));
    const truth = chooseTruth(fx, x);
    const card: CardFixture = { id: fx.id, truth };
    const own = emptyScore();
    const theme = cardTheme(fx.id);
    for (const s of [run.overall, into(run.groups, countryGroup(fx.id)), ...(theme ? [into(run.themes, theme)] : []), into(run.regions, fx.input.region === fx.card_country ? 'phone region = card country' : 'phone region ≠ card country'), into(run.sides, fx.side), own]) {
      s.cards++;
      scoreCard(card, x, s);
    }
    for (const trap of fx.traps) {
      if (!run.traps.has(trap)) run.traps.set(trap, { cards: 0, clean: 0, score: emptyScore() });
      const tr = run.traps.get(trap) as { cards: number; clean: number; score: Score };
      tr.cards++;
      if (own.misses.length === 0) tr.clean++;
      tr.score.cards++;
      scoreCard(card, x, tr.score);
    }
    run.perCard.push({ id: fx.id, misses: own.misses });
  }
  run.ms = performance.now() - t0;
  for (const s of [run.overall, ...run.groups.values(), ...run.themes.values(), ...run.regions.values(), ...run.sides.values(), ...[...run.traps.values()].map((t) => t.score)]) {
    const tt = totals(s);
    s.produced = tt.produced;
    s.highWrong = tt.highWrong;
  }
  return run;
}

/** Fixtures of a blind folder (`<dir>/cards/*.json`). File system injected (Jest and the Node bench share this). */
export function loadBlind(dir: string, read: (p: string) => string, list: (d: string) => string[], join: (a: string, b: string) => string): BlindFixture[] {
  const cards = join(dir, 'cards');
  return list(cards)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(read(join(cards, f))) as BlindFixture);
}

const pct = (n: number, d: number) => (d === 0 ? '–' : `${((100 * n) / d).toFixed(1)}%`);

/** One line per score: recall per field, asked, confident wrong (headline and with phone types/prefixes). */
export function summaryLine(label: string, s: Score): string {
  const tt = totals(s);
  const f = s.fields;
  const parts = (['email', 'url', 'phone', 'phoneType', 'name', 'company', 'title', 'department', 'address', 'social'] as Field[])
    .filter((k) => f[k].truth > 0 || f[k].produced > 0)
    .map((k) => `${k} ${f[k].right}/${f[k].truth}${f[k].wrong ? ` w${f[k].wrong}` : ''}${f[k].highWrong ? ` hw${f[k].highWrong}` : ''}${f[k].asked ? ` a${f[k].asked}` : ''}`);
  return `${label} (${s.cards} fixtures): ${parts.join(' · ')} | confident wrong ${tt.highWrong}/${tt.produced} = ${pct(tt.highWrong, tt.produced)} (incl. types/prefixes ${tt.highWrongAll}/${tt.producedAll} = ${pct(tt.highWrongAll, tt.producedAll)}) | asked ${tt.asked}/${tt.produced + tt.asked} = ${pct(tt.asked, tt.produced + tt.asked)}`;
}
