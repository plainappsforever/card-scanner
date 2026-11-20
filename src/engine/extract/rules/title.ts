// Rule 8 — job title and department (SPEC §5.1). Dictionary hits in the 15 languages; a title next to the name → high,
// elsewhere → medium; department words without a title word → department. Pure.
// L26 (review M3): single generic words ("Partner", "Head", "Senior", "Staff") are a title only together with another
// title or department word ("Head of Sales", "Senior Partner"), and then at most medium; lines with sentence words
// ("Ihr Partner für Holz", "Your partner since 1987") and stop phrases ("Head Office", "Staff only") are never titles.
import { GIVEN_NAMES } from '../dict/names';
import { DEPARTMENT_SUBSTRINGS, DEPARTMENT_WORDS, NAME_PREFIXES, TITLE_SUBSTRINGS, TITLE_SUFFIXES, TITLE_WORDS } from '../dict/titles';
import { alternation, consume, directlyBelow, fold, foldKeep, hasBoxes, meaningfulRest, scriptOf, type Seg } from '../normalize';

import type { Ctx } from './ctx';

const TITLE_SRC = `(?<![\\p{L}])(?:${alternation(TITLE_WORDS)})(?![\\p{L}])`;
/** Stateless use only (`exec`/`test` on a fresh copy): a shared global regex keeps `lastIndex` between calls. */
const titleRe = (flags = 'iu') => new RegExp(TITLE_SRC, flags);
const TITLE_RE = titleRe();
const DEPT_RE = new RegExp(`(?<![\\p{L}])(?:${alternation(DEPARTMENT_WORDS.filter((w) => w.length > 2))})(?![\\p{L}])`, 'iu');
const SHORT_DEPT = /(?<![\p{L}])(IT|HR|PR|EDV|F&E|R&D)(?![\p{L}])/u;
const SUFFIX_RE = new RegExp(`\\p{L}{3,}(?:${alternation(TITLE_SUFFIXES)})(?![\\p{L}])`, 'iu');
/** An organisational unit at the end of a line: "Antibody Discovery Team", "Sales Division", "Abteilung Einkauf". */
const UNIT_END = /(?<![\p{L}])(team|division|department|dept\.?|unit|abteilung|bereich|sparte|afdeling|departement|departamento|dipartimento)$/iu;
const UNIT_ANY = /(?<![\p{L}])(team|division|department|dept\.?|unit|abteilung|bereich|sparte|afdeling|departement|departamento|dipartimento|center|centre)(?![\p{L}])/iu;
/** Words that qualify a department without being one ("Vertrieb Süd", "R&D Center", "Sales DACH"). Folded. */
const DEPT_QUALIFIER = /^(sud|nord|ost|west|mitte|south|north|east|central|international|national|europe|europa|emea|dach|apac|americas|asia|global|center|centre|team|group|innendienst|aussendienst)$/u;
const DEPT_CONNECTOR = /^(&|\+|and|und|y|e|et|i|ve|и|\/)$/u;
const DEPT_RE_G = new RegExp(DEPT_RE.source, 'giu');
const SHORT_DEPT_G = new RegExp(SHORT_DEPT.source, 'gu');

/**
 * The whole text is a department name: dictionary units joined by "&"/"and"/"und" plus qualifiers ("Sales & Marketing",
 * "Forschung & Entwicklung", "Vertrieb Süd", "R&D Center", "отдела продаж"). "Enterprise Sales" is not (P5c).
 */
export function isDepartmentPhrase(text: string): boolean {
  let rest = text.replace(SHORT_DEPT_G, ' ');
  rest = fold(rest).replace(DEPT_RE_G, ' ');
  if (fold(rest).replace(/[^\p{L}]/gu, '') === fold(text).replace(/[^\p{L}]/gu, '')) return false; // no department word at all
  return rest
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => DEPT_CONNECTOR.test(w) || DEPT_QUALIFIER.test(w.replace(/[^\p{L}]/gu, '')) || !/\p{L}/u.test(w));
}

const TITLE_EXACT = new RegExp(`^(?:${alternation(TITLE_WORDS)})$`, 'iu');
const TITLE_END = new RegExp(`(?<![\\p{L}])(?:${alternation(TITLE_WORDS)})$`, 'iu');
const SUFFIX_END = new RegExp(`\\p{L}{3,}(?:${alternation(TITLE_SUFFIXES)})$`, 'iu');
/** The text ends in a title word ("Senior Engineer", "Teamleiterin", "部長"), not in another word ("VP, Enterprise"). */
function endsInTitle(text: string): boolean {
  const f = feminine(ocrFold(fold(text))).replace(/[\s,–—-]+$/u, '');
  return TITLE_END.test(f) || SUFFIX_END.test(f) || TITLE_SUBSTRINGS.some((x) => text.trim().endsWith(x));
}

const CONNECTOR_WORDS = /^(of|for|de|del|de la|des|du|di|della|dello|für|fur|der|des|do|da|dos|das)$/iu;

/**
 * "Leiter Vertrieb Süd", "Head of Research & Development", "Gerente de Ventas", "Manajer Pemasaran": a title followed by a
 * department phrase on one line. Returns the department part, or '' (P5c). Blind sets disagree whether such a line is one
 * title or title + department (B1/dev: one title; B2: split, whole line accepted) → the caller keeps the whole line as
 * the title and only OFFERS the department (low, "Check"), D39.
 */
export function departmentInTitle(text: string): string {
  // a dictionary title phrase stays one title ("Diretor Comercial", "Jefe de Ventas", "Sales Manager")
  if (TITLE_EXACT.test(feminine(ocrFold(fold(text))).trim())) return '';
  const words = text.trim().split(/\s+/);
  for (let k = 1; k < words.length; k++) {
    const head = words.slice(0, k).join(' ').replace(/[,–—-]+$/, '');
    let tailWords = words.slice(k);
    if (tailWords.length > 1 && CONNECTOR_WORDS.test(tailWords[0])) tailWords = tailWords.slice(1);
    const tail = tailWords.join(' ').replace(/^[,–—-]+\s*/, '');
    if (!tail || !titleStrength(head) || isDepartmentText(head) || !endsInTitle(head)) continue;
    if (isTitleText(tail) && !isDepartmentPhrase(tail)) continue;
    if (isDepartmentPhrase(tail)) return tail;
  }
  return '';
}
const CJK_DEPT_END = /[\p{Script=Han}\p{Script=Hangul}](部|課|室|팀|본부|센터|사업부|부문)$/u;

/** Words that are a title only next to another title/department word (review M3). Folded. */
const GENERIC = new Set(['partner', 'head', 'lead', 'leader', 'senior', 'junior', 'staff', 'chief', 'chef', 'associate', 'agent', 'commercial', 'capo', 'sef', 'ortak', 'fellow']);
/** Never a title, whatever words they contain. Folded. */
const STOP_PHRASES = /(?<![\p{L}])(head ?office|head ?quarters?|headquarters|staff only|senior living|senior care|seniorenresidenz|chef'?s (table|kitchen)|partner of|partner von|partnerunternehmen|official partner|premium partner)(?![\p{L}])/u;
/** Sentence and slogan words: a line with one is a tagline, never a title. Folded. */
const SENTENCE = /(?<![\p{L}])(ihr|ihre|ihren|your|our|unser|unsere|unserer|wir|we|since|seit|welcome|willkommen|votre|notre|nuestro|nuestra|vostro|sizin|bizim|always|immer)(?![\p{L}])/u;
/** Title abbreviations printed before the name ("Inh. Anna Weber"): used only when the card has no fuller title. */
export const ABBREV_TITLES = new Set(['inh', 'inh.', 'gf', 'gf.']);

/** "lnh." (OCR l for I at a word start before a consonant) → "inh." for dictionary lookups only. */
const ocrFold = (f: string) => f.replace(/(^|\s)l(?=[bcdfghjkmnpqrstvwxz])/g, '$1i');

export type Strength = 'strong' | 'generic' | 'lone' | null;

/** How sure a text is a job title: strong (a specific title word), generic (generic words + another title/department word), or not a title. */
/** German feminine forms of English titles: "Key Account Managerin", "Consultantin" (P5c). */
const feminine = (f: string) => f.replace(/(manager|consultant|designer|developer|controller|planner|recruiter|trainer|coach|engineer|architect|officer)in(?![\p{L}])/gu, '$1');

export function titleStrength(text: string): Strength {
  text = repairWordDigits(text).text;
  const f = feminine(ocrFold(fold(text)));
  if (STOP_PHRASES.test(f) || SENTENCE.test(f)) return null;
  const words = [...f.matchAll(titleRe('giu'))].map((m) => m[0]);
  const strongWord = words.some((w) => !GENERIC.has(w));
  const sub = TITLE_SUBSTRINGS.some((s) => text.includes(s));
  const suffix = SUFFIX_RE.test(f);
  if (strongWord || sub) return 'strong';
  if (suffix) {
    // "Gisela Hoffmeister", "Lena Brandmeister": a family name that ends like a title word (-meister, -leiter)
    const t = text.trim().split(/\s+/);
    if (t.length >= 2 && t.length <= 3 && GIVEN_NAMES.has(fold(t[0])) && t.every((w) => /^\p{Lu}/u.test(w))) return null;
    return 'strong';
  }
  // "Commercial Property", "Service Commercial": a department name whose only title word is a generic one is no title (P5c)
  if (words.length >= 1 && isDepartmentPhrase(text)) return null;
  if (words.length >= 2 || (words.length === 1 && isDepartmentText(text))) return 'generic';
  // "Clinical Lead", "Design Lead", "Practice Head": a short capitalised line that ENDS in lead/head/partner/associate
  const tw = text.trim().split(/\s+/);
  if (words.length === 1 && tw.length >= 2 && tw.length <= 3 && tw.every((w) => /^\p{Lu}/u.test(w)) && /^(lead|head|partner|associate|chief)$/.test(fold(tw[tw.length - 1]))) return 'generic';
  // "Partner", "Associate" alone on a short line: maybe a title — only ever asked (low), never filled (L26)
  if (words.length === 1 && text.trim().split(/\s+/).length <= 2) return 'lone';
  return null;
}

export function isTitleText(text: string): boolean {
  const s = titleStrength(text);
  return s === 'strong' || s === 'generic';
}

/** Any title word at all, generic ones included ("Head Office", "Senior Living"): such a line is never a person's name. */
export function hasTitleWord(text: string): boolean {
  const f = feminine(ocrFold(fold(text)));
  return TITLE_RE.test(f) || SUFFIX_RE.test(f) || TITLE_SUBSTRINGS.some((s) => text.includes(s));
}

export function isDepartmentText(text: string): boolean {
  const f = fold(text);
  return DEPT_RE.test(f) || SHORT_DEPT.test(text) || DEPARTMENT_SUBSTRINGS.some((s) => text.includes(s)) || UNIT_END.test(f.trim()) || CJK_DEPT_END.test(text.trim());
}

const isPrefixToken = (t: string) => NAME_PREFIXES.has(fold(t).replace(/\.$/, '')) || /^(dr|prof|dipl)\.(-?\p{L}+\.?)*$/iu.test(t);

/** 2–4 capitalised words that start with a known given name (a name before or after a title on one line). */
function nameShaped(text: string, needCue: boolean, locals: readonly string[] = []): boolean {
  if (/[,;]/.test(text)) return false; // "Hans-Peter Alpinger, Dr. Florian Weiß": two people, not one name
  const t = text.trim().split(/\s+/).filter(Boolean);
  const core = t.filter((w) => !isPrefixToken(w));
  if (core.length < 2 || core.length > 4) return false;
  if (!core.every((w) => /^[\p{Lu}][\p{L}\p{M}'’.-]*$/u.test(w) || /^(von|van|der|de|di|da|del|zu|la|le)$/.test(w))) return false;
  if (isDepartmentText(text) || isTitleText(text)) return false;
  const first = fold(core[0]).replace(/[^a-z]/g, '');
  return !needCue || GIVEN_NAMES.has(fold(core[0])) || core.length < t.length || (first.length >= 3 && locals.some((l) => l.includes(first)));
}

function plausible(text: string): boolean {
  if (/@|https?:|www\.|\d{3,}/.test(text)) return false;
  const words = text.split(/\s+/).length;
  return words <= 8 && [...text].length <= 70;
}

/** Span key: `id` = the whole segment, `id@from-to` = a part of it. */
const spanKey = (seg: Seg, from: number, to: number) => (from === 0 && to >= seg.rest.length ? seg.id : `${seg.id}@${from}-${to}`);

export type TitleSpan = { key: string; seg: Seg; kind: 'title' | 'department'; from: number; to: number };

export function titleSpans(ctx: Ctx): TitleSpan[] {
  const out: TitleSpan[] = [];
  for (const [key, kind] of ctx.titleSegs) {
    const [sid, range] = key.split('@');
    const seg = ctx.segs.find((s) => s.id === sid);
    if (!seg) continue;
    const [from, to] = range ? range.split('-').map(Number) : [0, seg.rest.length];
    out.push({ key, seg, kind, from, to });
  }
  return out;
}

/** "営業部 部長", "개발팀 팀장", "Senior Manager – Procurement", "General Manager, Sales Division": department + title on one line. */
function splitDeptTitle(text: string): { dept: [number, number]; title: [number, number] } | null {
  const cjk = /^(\S+)[\s　]+(\S+)$/u.exec(text);
  if (cjk && /[\p{Script=Han}\p{Script=Hangul}]/u.test(text)) {
    const [a, b] = [cjk[1], cjk[2]];
    const bStart = text.length - b.length;
    if (isDepartmentText(a) && !isDepartmentText(b) && titleStrength(b)) return { dept: [0, a.length], title: [bStart, text.length] };
    if (isDepartmentText(b) && titleStrength(a) && !isDepartmentText(a)) return { dept: [bStart, text.length], title: [0, a.length] };
  }
  const m = /^(.+?)(\s[–—-]\s|,\s)(.+)$/u.exec(text);
  if (!m) return null;
  const [a, sep, b] = [m[1], m[2], m[3]];
  const bStart = a.length + sep.length;
  const unit = (s: string) => UNIT_ANY.test(fold(s)) || sep.trim() !== ',';
  if (titleStrength(a) && !titleStrength(b) && isDepartmentText(b) && unit(b)) return { title: [0, a.length], dept: [bStart, text.length] };
  if (titleStrength(b) && !titleStrength(a) && isDepartmentText(a) && unit(a)) return { dept: [0, a.length], title: [bStart, text.length] };
  return null;
}

/** Marks title/department segments (the name rule skips them). Values are chosen in finishTitle once the name is known. */
export function markTitles(ctx: Ctx): void {
  ctx.weakTitles = new Set();
  ctx.loneTitles = new Set();
  const locals = ctx.emails.map((e) => e.value.value.split('@')[0].toLowerCase().replace(/[^a-z]/g, ''));
  const set = (seg: Seg, from: number, to: number, kind: 'title' | 'department', text: string, context = text) => {
    const key = spanKey(seg, from, to);
    ctx.titleSegs.set(key, kind);
    // the strength of a split-off title part counts its line: "Head – Engineering" is a generic title, not a lone word
    const st = kind === 'title' ? (titleStrength(text) === 'lone' && titleStrength(context) === 'generic' ? 'generic' : titleStrength(text)) : null;
    if (st === 'generic' || st === 'lone') ctx.weakTitles!.add(key);
    if (st === 'lone') ctx.loneTitles!.add(key);
  };
  for (const seg of ctx.segs) {
    const text = meaningfulRest(seg);
    if (!text || !plausible(text)) continue;
    const rest = seg.rest;
    const lead = rest.length - rest.trimStart().length;
    // "Anna Weber, CEO": the part after the comma may be the title
    const comma = rest.lastIndexOf(', ');
    if (comma > 0 && isTitleText(rest.slice(comma + 2)) && !isTitleText(rest.slice(0, comma)) && nameShaped(rest.slice(0, comma), true, locals)) {
      set(seg, comma + 2, rest.length, 'title', rest.slice(comma + 2));
      continue;
    }
    // "Notar Dr. Friedrich-Wilhelm von Ahlefeldt", "Filialleitung: Petra Unterholzner", "Inh. Zbigniew Kaczmarek"
    const words = [...rest.matchAll(/\S+/g)];
    let headSplit = false;
    for (let k = 1; k <= Math.min(3, words.length - 2) && !headSplit; k++) {
      const headEnd = (words[k - 1].index ?? 0) + words[k - 1][0].length;
      const head = rest.slice(0, headEnd).trim();
      const tail = rest.slice(headEnd).replace(/^[\s:：]+/, '');
      const cue = /[.:：]$/.test(head) || isPrefixToken(tail.split(/\s+/)[0] ?? '');
      // every head word is a title word (or a connector): "Geschäftsführer: Hans-Peter Alpinger, Dr. …" is no "title + name"
      const allTitle = head.replace(/[:：,]$/, '').split(/\s+/).every((w) => titleStrength(w) !== null || /^(of|für|fur|de|du|der|des|di|del|y|und|&)$/i.test(w));
      if (allTitle && titleStrength(head.replace(/[:：]$/, '')) === 'strong' && nameShaped(tail, !cue, locals)) {
        set(seg, lead, headEnd, 'title', head);
        headSplit = true;
      }
    }
    if (headSplit) continue;
    // "Gideon Achterberg  Chief Technology Officer" (two OCR lines merged): split where the title phrase starts
    const m = TITLE_RE.exec(foldKeep(rest));
    if (m && m.index !== undefined && m.index > lead) {
      const head = rest.slice(0, m.index).trim();
      if (nameShaped(head, true, locals) && !isTitleText(head)) {
        set(seg, m.index, rest.length, 'title', rest.slice(m.index));
        continue;
      }
    }
    const dt = splitDeptTitle(text);
    if (dt) {
      set(seg, lead + dt.dept[0], lead + dt.dept[1], 'department', text.slice(...dt.dept));
      set(seg, lead + dt.title[0], lead + dt.title[1], 'title', text.slice(...dt.title), text);
      continue;
    }
    // "業務經理 Sales Manager": one title per script on one line — the name's script is chosen, the other is the alternative
    const mixed = /^([\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}ー・]+)[\s\u3000]+(\p{Script=Latin}[\p{L}\s&.,'’-]*\p{L})$/u.exec(text) ?? /^(\p{Script=Latin}[\p{L}\s&.,'’-]*\p{L})[\s\u3000]+([\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}ー・]+)$/u.exec(text);
    if (mixed && isTitleText(mixed[1]) && isTitleText(mixed[2])) {
      const b = text.lastIndexOf(mixed[2]);
      set(seg, lead, lead + mixed[1].length, 'title', mixed[1]);
      set(seg, lead + b, lead + b + mixed[2].length, 'title', mixed[2]);
      continue;
    }
    if (isTitleText(text) || titleStrength(text) === 'lone') set(seg, 0, rest.length, 'title', text);
    // "Support 0120-…" (a phone label), "Skiverleih · Service · Testcenter" (a list of services): no department (P5c)
    // "Praxis für Kieferorthopädie": a practice/firm line is the company, not a department
    else if (isDepartmentText(text) && !seg.used.includes('phone') && ctx.segs.filter((x) => x.lineId === seg.lineId).length < 3 && !/^(praxis|kanzlei|buro|studio|atelier|zentrum|centre|center)(?![\p{L}])/u.test(fold(text))) set(seg, 0, rest.length, 'department', text);
  }
}

function textOf(s: TitleSpan): string {
  return s.seg.rest.slice(s.from, s.to).replace(/\s+/g, ' ').trim().replace(/^[\s,;:|·•-]+|[\s,;:|·•-]+$/g, '');
}

/** "Ma1ermeister" → "Malermeister": a digit 1/0 between letters is an OCR confusable (value then medium). */
function repairWordDigits(s: string): { text: string; repaired: boolean } {
  const text = s.replace(/(?<=\p{Ll})1(?=\p{Ll})/gu, 'l').replace(/(?<=\p{L})0(?=\p{L})/gu, 'o');
  return { text, repaired: text !== s };
}

/** Chooses title and department; adjacency to the name segment (order ±1, or ±2 across the department) → high. */
export function finishTitle(ctx: Ctx, nameSeg?: Seg): void {
  const entries = titleSpans(ctx).filter((e) => e.seg.rest.slice(e.from, e.to).trim() !== '');
  const boxes = hasBoxes(ctx.segs);
  // distance in lines: geometric neighbours (same column, directly above/below) count as 1 on cards with boxes
  const dist = (s: Seg) => {
    if (!nameSeg || s.side !== nameSeg.side) return 99;
    if (boxes && s.lineId !== nameSeg.lineId) return directlyBelow(nameSeg, s) || directlyBelow(s, nameSeg) ? 1 : 2 + Math.abs(s.order - nameSeg.order);
    return Math.abs(s.order - nameSeg.order);
  };
  const nameScript = nameSeg ? scriptOf(nameSeg.text) : undefined;
  const sameScript = (e: TitleSpan) => (nameScript && scriptOf(textOf(e)) === nameScript ? 0 : 1);
  const abbrev = (e: TitleSpan) => (ctx.loneTitles?.has(e.key) ? 2 : ABBREV_TITLES.has(ocrFold(fold(textOf(e)))) ? 1 : 0);
  const titles = entries.filter((e) => e.kind === 'title').sort((a, b) => abbrev(a) - abbrev(b) || dist(a.seg) - dist(b.seg) || sameScript(a) - sameScript(b) || a.seg.order - b.seg.order);
  const depts = entries.filter((e) => e.kind === 'department').sort((a, b) => dist(a.seg) - dist(b.seg) || sameScript(a) - sameScript(b) || a.seg.order - b.seg.order);
  // a lone generic word ("Partner") counts only right next to the name, and then only as a question (low)
  const t = titles.find((x) => !ctx.loneTitles?.has(x.key) || dist(x.seg) <= 1);
  if (t) {
    const sameLine = nameSeg && t.seg.lineId === nameSeg.lineId;
    const d = dist(t.seg);
    const adjacent = sameLine || d === 1 || (!boxes && d === 2 && depts.some((x) => Math.abs(x.seg.order - t.seg.order) === 1)) || (boxes && depts.some((x) => nameSeg && directlyBelow(nameSeg, x.seg) && directlyBelow(x.seg, t.seg)));
    const whole = t.key === t.seg.id;
    // "Directeur des ventes / Sales Director": whole title segments of the same line belong together
    const twins = whole ? titles.filter((x) => x !== t && x.seg.lineId === t.seg.lineId && x.key === x.seg.id) : [];
    const parts = [t, ...twins].sort((a, b) => a.seg.order - b.seg.order);
    const sep = / \/ /.test(t.seg.line.text) ? ' / ' : ' | ';
    const raw = parts.length > 1 ? parts.map(textOf).join(sep) : textOf(t);
    const digitsFixed = repairWordDigits(raw);
    // "lnh." / "lngenieur": a lower-case l before a consonant at a word start is an OCR "I" — repaired, never high (P5d, B3 de-x50)
    const unL = digitsFixed.text.replace(/(?<![\p{L}\p{N}])l(?=[bcdfghkmnpqrstvwxz])/gu, 'I');
    const fixed = { text: unL, repaired: digitsFixed.repaired || unL !== digitsFixed.text };
    const weak = parts.every((p) => ctx.weakTitles?.has(p.key));
    const lone = parts.every((p) => ctx.loneTitles?.has(p.key));
    // "Partner" alone on the line directly next to the name is the partner title of a firm → medium (never high); other
    // lone generic words ("Head", "Senior", "Lead") stay a question (P5c)
    const lonePartner = lone && d <= 1 && /^(partner|partnerin|associate|ortak|socio|socia|associe|associee)$/.test(fold(raw).replace(/[^\p{L}]/gu, ''));
    const confidence = lone && !lonePartner ? 'low' : weak || lonePartner || fixed.repaired ? 'medium' : adjacent ? 'high' : 'medium';
    ctx.title = { value: fixed.text, confidence, sources: [...new Set(parts.map((p) => p.seg.lineId))], rule: weak ? 'title.generic' : adjacent ? 'title.adjacent' : 'title.dictionary' };
    for (const p of parts) consume(p.seg, p.from, p.to, 'title');
    const second = titles.find((x) => x !== t && !twins.includes(x));
    if (second) ctx.alternatives.title = { value: repairWordDigits(textOf(second)).text, confidence: 'medium', sources: [second.seg.lineId], rule: 'title.dictionary' };
  }
  const d = depts.find((x) => x.seg.rest.slice(x.from, x.to).trim() !== '');
  if (d) {
    ctx.department = { value: textOf(d), confidence: 'medium', sources: [d.seg.lineId], rule: 'department.dictionary' };
    consume(d.seg, d.from, d.to, 'department');
  } else if (ctx.title) {
    // "Leiter Vertrieb Süd": the title keeps the whole line; its department part is only offered (low = "Check", D39)
    const part = departmentInTitle(ctx.title.value);
    if (part) ctx.department = { value: part, confidence: 'low', sources: [...ctx.title.sources], rule: 'department.in-title' };
  }
}
