// Rule 9 — the person's name (SPEC §5.1) and its split into parts (N1–N7). Candidates: lines without digits, "@", URLs
// or dictionary hits, 1–4 tokens (Latin, Cyrillic, Arabic, Devanagari) or 2–5 CJK/Hangul characters, not the company.
// Score = font-height rank + adjacency to the title + given-name list + e-mail local-part match + capitalisation.
// E-mail match, or list hit + title adjacency → high; one signal → medium; structure only → low. Pure.
import type { NameParts } from '../../contact';
import { emptyName } from '../../contact';
import { COUNTRIES } from '../dict/address';
import { ACCENTED_NAMES, EAST_ASIAN_LATIN_FAMILY, GIVEN_NAMES, JA_FAMILY, KO_COMPOUND_FAMILY, KO_FAMILY, VI_FAMILY, ZH_COMPOUND_FAMILY, ZH_FAMILY } from '../dict/names';
import { NAME_PARTICLES, NAME_PREFIXES, NAME_SUFFIXES } from '../dict/titles';
import { consume, consumeAll, directlyBelow, fold, HANGUL, hasBoxes, KANA, meaningfulRest, scriptOf, type Script, type Seg } from '../normalize';
import type { Candidate, Confidence } from '../types';

import { hasCompanyHint, hasLegalForm } from './company';
import type { Ctx } from './ctx';
import { hasTitleWord, isDepartmentText, isTitleText, titleSpans } from './title';

const bare = (t: string) => fold(t).replace(/\.$/, '');
// Upper-case professional abbreviations before German names: RA (Rechtsanwalt), RAin, StB, WP, Dipl.-…
const isPrefix = (t: string) => NAME_PREFIXES.has(bare(t)) || /^(dr|prof|dipl)\.(-?\p{L}+\.?)*$/iu.test(t) || /^(RA|RAin|RAe|StB|WP|vBP|Dipl\.)$/u.test(t);
// "FRSC", "MRCPsych": Fellow/Member of a Royal … — F/M + R + consonants only (P5d); "Jan MRAZ" keeps its vowel and its name
const isSuffix = (t: string) => NAME_SUFFIXES.has(fold(t).replace(/[.,]+$/, '')) || NAME_SUFFIXES.has(fold(t).replace(/[.,]+$/, '').replace(/\./g, '')) || /^[FM]R[BCDFGHJKLMNPQRSTVWXZ]{2,4}$/.test(t.replace(/[.,]+$/, ''));
/** After the name, professional abbreviations are credentials, not prefixes: "Martin Roth, WP, StB, RA", "Reto Brunner, lic. oec. HSG" (P5c). */
const isTrailingCredential = (t: string) => isSuffix(t) || ((/^\p{Lu}[\p{Lu}\p{Ll}]*\p{Lu}$|^\p{Lu}{2,}$/u.test(t) || /^\p{L}{2,}\.$/u.test(t)) && isPrefix(t));

/**
 * OCR repairs inside a name line (P5c): "HoIlmann" (capital I for l) when the e-mail spells "hollmann" or the result is
 * a known given name; "Herrnann" → "Hermann" and "Komelia" → "Kornelia" (rn/m) only when the result is a known given
 * name and the printed word is not. Returns the text and whether anything was changed.
 */
function repairNameOcr(text: string, locals: readonly string[]): { text: string; repaired: boolean } {
  let repaired = false;
  const flat = locals.map((l) => l.toLowerCase().replace(/[^a-z]/g, ''));
  const out = text.replace(/\p{L}{3,}/gu, (w) => {
    const known = (x: string) => GIVEN_NAMES.has(fold(x));
    if (/(?<=\p{Ll})I(?=\p{Ll})|^\p{Lu}\p{Ll}*I(?=\p{Ll})/u.test(w)) {
      const fixed = w.replace(/(?<=\p{Ll})I(?=\p{Ll})/gu, 'l');
      const f = fold(fixed).replace(/[^a-z]/g, '');
      if (known(fixed) || (f.length >= 4 && flat.some((l) => l.includes(f)))) {
        repaired = true;
        return fixed;
      }
    }
    if (known(w)) return w;
    for (const [from, to] of [['rn', 'm'], ['m', 'rn']] as const) {
      for (let i = w.indexOf(from); i >= 0; i = w.indexOf(from, i + 1)) {
        const cand = w.slice(0, i) + to + w.slice(i + from.length);
        if (known(cand)) {
          repaired = true;
          return cand;
        }
      }
    }
    return w;
  });
  return { text: out, repaired };
}

/** The card's text minus the name line: which accent languages does the card speak (country or letters, P5c)? */
function accentLanguages(ctx: Ctx, nameLine: string): string[] {
  const other = ctx.segs.filter((s) => s.lineId !== nameLine).map((s) => s.text).join(' ');
  return Object.entries(ACCENTED_NAMES)
    .filter(([, l]) => (ctx.cardCountry && l.countries.includes(ctx.cardCountry)) || l.letters.test(other))
    .map(([k]) => k);
}

/**
 * L26 (P5c): a Latin name printed without any diacritic although it probably had some — a token on the accent list of a
 * language the card speaks ("Dvorak" on a Czech card), a Vietnamese card whose other text has Vietnamese letters, or an
 * e-mail that spells the name with ae/oe/ue ("krueger@" for "Kruger"). Such a name is at most medium; it is not changed.
 */
export function accentLikelyLost(tokens: readonly string[], ctx: Ctx, nameLine: string, locals: readonly string[]): boolean {
  if (tokens.length === 0 || tokens.some((t) => /[^\x00-\x7F]/.test(t))) return false;
  const langs = accentLanguages(ctx, nameLine);
  const parts = tokens.flatMap((t) => t.split(/[-'’]/)).map((t) => fold(t).replace(/[^a-z]/g, '')).filter((t) => t.length >= 2);
  if (langs.some((k) => parts.some((p) => ACCENTED_NAMES[k].names.has(p)))) return true;
  // spelling cues beyond the lists: Turkish "-oglu" is "-oğlu"; Spanish surnames in "-ez" are mostly "-ález/-ínez/-érez"
  if (parts.some((p) => p.length >= 6 && /oglu$/.test(p))) return true;
  if (langs.includes('es') && parts.slice(1).some((p) => /^[a-z]{3,}ez$/.test(p) && !/^(valdez|cortez|ortez|baez|paez)$/.test(p))) return true;
  if (langs.includes('vi') && ACCENTED_NAMES.vi.letters.test(ctx.segs.filter((s) => s.lineId !== nameLine).map((s) => s.text).join(' '))) return true;
  const flat = locals.map((l) => l.toLowerCase());
  return parts.some((p) => /[aou]/.test(p) && flat.some((l) => [...p.matchAll(/[aou]/g)].some((m) => l.includes(`${p.slice(0, m.index)}${p[m.index!]}e${p.slice(m.index! + 1)}`))));
}

/** German/Nordic transliteration for e-mail matching: Jürgen → juergen and jurgen. */
function asciiForms(token: string): string[] {
  const f = fold(token).replace(/[^a-z]/g, '');
  const de = token
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z]/g, '');
  return [...new Set([f, de].filter(Boolean))];
}

/** Does an e-mail local part spell this name (first.last, flast, firstl, first, last …)? */
export function emailMatchesName(locals: readonly string[], tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const given = asciiForms(tokens[0]);
  const family = asciiForms(tokens[tokens.length - 1]);
  const all = tokens.map(asciiForms);
  for (const local of locals) {
    const l = local.toLowerCase().replace(/[^a-z]/g, '');
    if (l.length < 2) continue;
    for (const g of given) {
      for (const f of family) {
        if (tokens.length > 1) {
          const forms = [g + f, f + g, g[0] + f, g + f[0], f + g[0], g[0] + f[0] + f.slice(1)];
          if (forms.includes(l)) return true;
          if (f.length >= 3 && l === f) return true;
        }
        if (g.length >= 3 && l === g) return true;
      }
    }
    // middle names and compound family names ("maria.garcia.lopez", "jgarcialopez")
    const joined = all.map((f) => f[0]).join('');
    if (tokens.length > 2 && (l === joined || l === all[0][0][0] + all.slice(1).map((f) => f[0]).join(''))) return true;
  }
  return false;
}

type NameCand = { seg: Seg; text: string; tokens: string[]; script: Script; score: number; signals: { email: boolean; list: boolean; title: boolean; top: boolean }; span: [number, number]; also?: Seg; repaired?: boolean };

const STOP = new Set(['and', 'und', 'the', 'for', 'fur', 'mit', 'with', 'your', 'our', 'ihr', 'ihre', 'unsere', 'et', 'pour', 'avec', 'per', 'con', 'para', 'por', 'il', 'el', 'los', 'las', 'die', 'das']);

/** Tokens of a name line; stray OCR symbols ("'", "|", "•") that carry no letter are dropped. */
function tokensOf(text: string): string[] {
  return text
    .replace(/[,]/g, ' , ')
    .split(/\s+/)
    .filter((t) => t !== '' && t !== ',' && /[\p{L}]/u.test(t));
}

/** "Mo-Fr", "Mon–Fri", "Lun.-Ven." (opening hours), "Col. Jardines" / "Fracc. …" (Mexican address lines): never names. */
const NOT_NAME_START = /^(?:(?:mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun|lun|mar|mer|jeu|ven|sam|dim|lu|ma|me|ju|vi)\.?\s?[-–]|(?:col|fracc|colonia|barrio|bairro|mah|mahallesi|sok|cad)\.?\s)/iu;

function plausibleName(text: string, script: Script): string[] | null {
  if (/[\d@#&+=_*%$€£¥]|https?:|www\./i.test(text)) return null;
  if (NOT_NAME_START.test(text.trim())) return null;
  if (script === 'cjk' || script === 'hangul') {
    const chars = [...text.replace(/[\s・·.]/g, '')];
    if (chars.length < 2 || chars.length > 5) return null;
    if (!chars.every((c) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー々]/u.test(c))) return null;
    return text.split(/\s+/).filter(Boolean);
  }
  const tokens = tokensOf(text.replace(/[()"]/g, ' '));
  const core = tokens.filter((t) => !isPrefix(t) && !isSuffix(t));
  if (core.length < 1 || core.length > 4) return null;
  if (core.some((t) => STOP.has(fold(t)))) return null;
  if (script === 'latin' || script === 'cyrillic') {
    // Each core token capitalised (or all caps), particles allowed in lower case
    const ok = core.every((t) => /^[\p{Lu}][\p{L}\p{M}'’.-]*$/u.test(t) || NAME_PARTICLES.has(fold(t)) || /^[\p{Lu}]\.$/u.test(t));
    if (!ok) return null;
    if (core.every((t) => t.length <= 1)) return null;
  }
  if (!core.every((t) => /^[\p{L}\p{M}'’.-]+$/u.test(t))) return null;
  return tokens;
}

function isCountryLine(text: string): boolean {
  return !!COUNTRIES[fold(text).replace(/[.,]+$/, '')];
}

/** Collect candidates and choose the name (plus N7 other-script name). Returns the chosen segment. */
export function findName(ctx: Ctx): Seg | undefined {
  const locals = ctx.emails.map((e) => e.value.value.split('@')[0]).filter((l) => !/^(info|office|kontakt|contact|sales|hello|mail|service|support|team|post)$/.test(l));
  const spans = titleSpans(ctx);
  const titleOrders = spans.filter((t) => t.kind === 'title' && !ctx.weakTitles?.has(t.key)).map((t) => t.seg);
  const cands: NameCand[] = [];
  const boxes = hasBoxes(ctx.segs);
  const cities = new Set(ctx.addresses.map((a) => fold(a.value.city)).filter(Boolean));
  const add = (seg: Seg, raw: string, span: [number, number], extra: Partial<NameCand> = {}) => {
    let text = raw.replace(/^[\s,;:|·•-]+|[\s,;:|·•-]+$/g, '');
    // a nickname in quotes or parentheses ("Rosalind "Roz" Okafor", "Tomasz (Tom) Wierzbicki") is not part of the name
    const nick = /\s+"([^"\s]{2,15})"(?=\s)|\s+\((?![^)]*\d)([\p{L}]{2,15})\)(?=\s)/u.exec(text);
    text = text.replace(/\s+"[^"\s]{2,15}"(?=\s)|\s+\((?![^)]*\d)[\p{L}]{2,15}\)(?=\s)/gu, '').replace(/\s+/g, ' ');
    // "MarkusLindqvist" (the OCR dropped the space) → "Markus Lindqvist" when the first part is a known given name
    let repaired = extra.repaired ?? false;
    text = text.replace(/(?<![\p{L}])(\p{Lu}\p{Ll}+)(\p{Lu}\p{Ll}{2,})(?![\p{L}])/gu, (m, a: string, b: string) => {
      if (!GIVEN_NAMES.has(fold(a))) return m;
      repaired = true;
      return `${a} ${b}`;
    });
    const ocr = repairNameOcr(text, locals);
    if (ocr.repaired) {
      text = ocr.text;
      repaired = true;
    }
    const script = scriptOf(text);
    const tokens = plausibleName(text, script);
    if (!tokens) return;
    const core = tokens.filter((t) => !isPrefix(t) && !isSuffix(t));
    if (hasLegalForm(text) || hasCompanyHint(text) || isTitleText(text) || isDepartmentText(text) || isCountryLine(text)) return;
    // "Head Office", "Senior Living": generic title words are never a name either (unless the line starts with a given name)
    if (hasTitleWord(text) && !GIVEN_NAMES.has(fold(core[0] ?? ''))) return;
    if (cities.has(fold(text))) return;
    // "da Gino" (a restaurant's "at Gino's"): a lower-case particle and one word is no person's name
    if (core.length === 1 && /^\p{Ll}/u.test(tokens[0] ?? '')) return;
    // the nickname may be what the e-mail spells ("tom@" for Tomasz "Tom" Wierzbicki)
    const email = script === 'latin' && (emailMatchesName(locals, core) || (!!nick && emailMatchesName(locals, [nick[1] ?? nick[2], ...core.slice(1)])));
    const list = core.some((t) => GIVEN_NAMES.has(fold(t)));
    const title = titleOrders.some((t) => t.side === seg.side && (t.lineId === seg.lineId || (boxes ? directlyBelow(seg, t) || directlyBelow(t, seg) : Math.abs(t.order - seg.order) <= 1)));
    cands.push({ seg, text, tokens, script, score: 0, signals: { email, list, title, top: false }, span, ...extra, repaired });
  };
  for (const seg of ctx.segs) {
    if (!meaningfulRest(seg)) continue;
    if (seg.used.includes('company')) continue;
    const mine = spans.filter((t) => t.seg === seg);
    if (mine.some((t) => t.key === seg.id || t.kind === 'department')) continue;
    // the part of the segment outside its title spans ("Notar | Dr. … von Ahlefeldt", "Anna Weber, | CEO")
    let rest = seg.rest;
    for (const t of mine) rest = rest.slice(0, t.from) + ' '.repeat(t.to - t.from) + rest.slice(t.to);
    const from = rest.length - rest.trimStart().length;
    const to = rest.trimEnd().length;
    if (to <= from) continue;
    const text = rest.slice(from, to);
    add(seg, text, [from, to]);
    // "李明华 Li Minghua": both scripts on one line → one candidate per script (N7 picks the primary)
    const mixed = /^([\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]{2,5})[\s\u3000]+([\p{Script=Latin}][\p{L}\s.'’-]+)$/u.exec(text) ?? /^([\p{Script=Latin}][\p{L}\s.'’-]+?)[\s\u3000]+([\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]{2,5})$/u.exec(text);
    if (mixed) {
      const a = from + text.indexOf(mixed[1]);
      const b = from + text.lastIndexOf(mixed[2]);
      add(seg, mixed[1], [a, a + mixed[1].length]);
      add(seg, mixed[2], [b, b + mixed[2].length]);
    }
    // a name printed on two lines ("Ottilie" / "Brandstetter-Nakamura"): a given name directly above one more name word
    const one = text.trim();
    if (/^\p{Lu}[\p{L}\p{M}'’-]+$/u.test(one) && (GIVEN_NAMES.has(fold(one)) || locals.some((l) => l.toLowerCase().replace(/[^a-z]/g, '').startsWith(fold(one).replace(/[^a-z]/g, '')))) && boxes) {
      const below = ctx.segs.find((s) => s.lineId !== seg.lineId && directlyBelow(seg, s, 0.8) && Math.abs(s.height - seg.height) <= 0.006 && /^\p{Lu}[\p{L}\p{M}'’-]+$/u.test(s.rest.trim()) && !s.used.length);
      if (below) add(seg, `${one} ${below.rest.trim()}`, [from, to], { also: below });
    }
  }
  if (cands.length === 0) return undefined;
  // font-height rank among candidates (with a margin), else position for pasted text
  const heights = [...new Set(cands.map((c) => c.seg))].map((sg) => sg.height);
  const maxH = Math.max(...heights);
  const sortedH = [...heights].sort((a, b) => b - a);
  for (const c of cands) {
    const s = c.signals;
    const core = c.tokens.filter((t) => !isPrefix(t) && !isSuffix(t));
    // the largest text is a signal only against other candidates (a lone line is not "the largest name", review S2)
    if (maxH > 0) s.top = c.seg.height === maxH && sortedH[1] !== undefined && maxH >= sortedH[1] * 1.15;
    c.score =
      (s.email ? 6 : 0) +
      (s.list ? 2.5 : 0) +
      (s.title ? 2.5 : 0) +
      (maxH > 0 ? (c.seg.height / maxH) * 2 : c.seg.order < 3 ? 1 - c.seg.order * 0.3 : 0) +
      (s.top ? 0.5 : 0) +
      (c.script === 'latin' && core.length >= 2 && core.length <= 3 ? 1 : 0) +
      (c.script === 'latin' && core.length === 1 ? -1.5 : 0) +
      (c.script !== 'latin' && c.script !== 'cyrillic' ? 0.8 : 0) +
      (c.tokens.some(isPrefix) ? 1 : 0) -
      c.seg.order * 0.02;
  }
  cands.sort((a, b) => b.score - a.score);
  let best = cands[0];
  // N7: two names in different scripts → primary = script of the UI language if present, else Latin
  const want = uiScript(ctx.uiLang);
  const other = cands.find((c) => c !== best && c.script !== best.script && (c.seg.lineId !== best.seg.lineId || c.span[0] >= best.span[1] || c.span[1] <= best.span[0]) && (c.script === want || c.score >= best.score - 4) && (c.signals.title || c.signals.list || c.signals.email || c.signals.top || c.script !== 'latin' || best.script !== 'latin'));
  if (other) {
    const primary = best.script === want ? best : other.script === want ? other : best.script === 'latin' ? best : other.script === 'latin' ? other : best;
    const secondary = primary === best ? other : best;
    if (primary !== best) {
      primary.signals = { ...primary.signals, list: primary.signals.list || best.signals.list, title: primary.signals.title || best.signals.title };
    }
    best = primary;
    ctx.otherName = { value: secondary.text, confidence: 'medium', sources: [secondary.seg.lineId], rule: 'name.other-script' };
    consume(secondary.seg, secondary.span[0], secondary.span[1], 'other_name');
  }
  const { parts, splitConfidence } = splitName(best.text, best.script, ctx);
  const s = best.signals;
  let confidence: Confidence = s.email || (s.list && s.title) ? 'high' : s.list || s.title || s.top ? 'medium' : 'low';
  if (splitConfidence === 'low') confidence = 'low';
  else if (splitConfidence === 'medium' && confidence === 'high') confidence = 'medium';
  if ((best.repaired || best.also) && confidence === 'high') confidence = 'medium';
  // OCR damage on the name line ("|", "0'", a capital I inside a word, a line the OCR marked unsure), or accents the OCR
  // probably dropped: never "sure" (P5c, L26)
  const coreTokens = best.tokens.filter((t) => !isPrefix(t) && !isSuffix(t));
  const damaged = ctx.damaged.has(best.seg.lineId) || (!!best.also && ctx.damaged.has(best.also.lineId));
  const accentLost = best.script === 'latin' && accentLikelyLost(coreTokens, ctx, best.seg.lineId, locals);
  if ((damaged || accentLost) && confidence === 'high') confidence = 'medium';
  // "St. Louis", a lone given name inside a place phrase, or a CJK line whose first character is no family name: ask (S2)
  if (best.script === 'latin' && /^(st|ste|san|santa|sao|saint|sainte)\.?$/i.test(best.tokens[0] ?? '') && !s.email) confidence = 'low';
  if ((best.script === 'cjk' || best.script === 'hangul') && !cjkFamilyKnown(best.text) && !s.email) confidence = 'low';
  const rule = (s.email ? 'name.email' : s.list && s.title ? 'name.list+title' : 'name.layout') + (damaged ? '+ocr-damage' : '') + (accentLost ? '+accent-lost' : '');
  ctx.name = { value: parts, confidence, sources: best.also ? [best.seg.lineId, best.also.lineId] : [best.seg.lineId], rule } as Candidate<NameParts>;
  consume(best.seg, best.span[0], best.span[1], 'name');
  if (best.also) consumeAll(best.also, 'name');
  const alt = cands.find((c) => c !== best && c.seg !== best.seg && c.seg !== best.also && c.seg.lineId !== ctx.otherName?.sources[0]);
  if (alt) ctx.alternatives.name = { value: splitName(alt.text, alt.script, ctx).parts, confidence: 'low', sources: [alt.seg.lineId], rule: 'name.alternative' };
  return best.seg;
}

/** A CJK/Hangul name whose first character(s) are a known family name (Chinese, Japanese, Korean lists). */
function cjkFamilyKnown(text: string): boolean {
  const t = text.replace(/[\s\u3000・·]/g, '');
  const first = [...t][0] ?? '';
  return ZH_FAMILY.has(first) || ZH_COMPOUND_FAMILY.some((f) => t.startsWith(f)) || KO_FAMILY.includes(first) || KO_COMPOUND_FAMILY.some((f) => t.startsWith(f)) || [...JA_FAMILY].some((f) => t.startsWith(f)) || KANA.test(t);
}

function uiScript(lang: string): Script {
  if (lang === 'ja' || lang.startsWith('zh')) return 'cjk';
  if (lang === 'ko') return 'hangul';
  if (lang === 'ru') return 'cyrillic';
  if (lang === 'ar') return 'arabic';
  if (lang === 'hi') return 'devanagari';
  return 'latin';
}

/** N1–N6: prefixes/suffixes, "FAMILY, Given", all-caps family, Latin order, CJK/Hangul, Vietnamese family-first. */
export function splitName(text: string, script: Script, ctx: Pick<Ctx, 'cardCountry' | 'segs'>): { parts: NameParts; splitConfidence: Confidence } {
  const n: NameParts = { ...emptyName(), full: text.replace(/\s+/g, ' ').trim() };
  if (script === 'cjk' || script === 'hangul') return splitCjk(n, ctx);
  let tokens = tokensOf(text.replace(/[()"]/g, ' '));
  const comma = text.indexOf(',');
  const prefixes: string[] = [];
  const suffixes: string[] = [];
  while (tokens.length > 1 && isPrefix(tokens[0])) prefixes.push(tokens.shift()!);
  // "di Gino Pellegrini" (Italian "by"), "by Anna Weber": a lower-case word before a full name is not part of it
  if (tokens.length >= 3 && /^(di|da|by|de)$/.test(tokens[0])) tokens = tokens.slice(1);
  while (tokens.length > 2 && isTrailingCredential(tokens[tokens.length - 1])) suffixes.unshift(tokens.pop()!);
  while (tokens.length > 1 && isSuffix(tokens[tokens.length - 1])) suffixes.unshift(tokens.pop()!);
  n.prefix = prefixes.join(' ');
  // the suffix as printed after the name ("WP, StB, RA", "lic. oec. HSG")
  const lastCore = tokens[tokens.length - 1] ?? '';
  const sufStart = suffixes.length ? text.indexOf(suffixes[0], text.lastIndexOf(lastCore) + lastCore.length) : -1;
  n.suffix = sufStart >= 0 ? text.slice(sufStart).trim().replace(/[,\s]+$/, '') : suffixes.join(/,/.test(text) ? ', ' : ' ');
  // N2 "WEBER, Anna" (a comma between two name parts, not before a suffix)
  if (comma > 0 && suffixes.length === 0) {
    const [left, right] = [text.slice(0, comma), text.slice(comma + 1)].map((s) => tokensOf(s).filter((t) => !isPrefix(t) && !isSuffix(t)));
    if (left.length >= 1 && right.length >= 1) {
      n.family = left.join(' ');
      n.given = right[0];
      n.middle = right.slice(1).join(' ');
      return { parts: n, splitConfidence: 'high' };
    }
  }
  if (tokens.length === 1) {
    n.given = '';
    n.family = tokens[0];
    return { parts: n, splitConfidence: 'low' };
  }
  // N3: one all-caps token among mixed-case tokens is the family name ("Jean DUPONT", "DUPONT Jean")
  const isCaps = (t: string) => /^\p{Lu}[\p{Lu}'’-]+$/u.test(t);
  const caps = tokens.filter(isCaps);
  if (caps.length >= 1 && caps.length < tokens.length && script === 'latin') {
    const first = tokens.findIndex(isCaps);
    const last = tokens.length - 1 - [...tokens].reverse().findIndex(isCaps);
    if (tokens.slice(first, last + 1).every(isCaps)) {
      const fam = tokens.slice(first, last + 1);
      const rest = [...tokens.slice(0, first), ...tokens.slice(last + 1)];
      n.family = fam.join(' ');
      n.given = rest[0] ?? '';
      n.middle = rest.slice(1).join(' ');
      return { parts: n, splitConfidence: 'high' };
    }
  }
  const cc = ctx.cardCountry;
  // Vietnamese: family first ("Nguyễn Văn An" → family Nguyễn, middle Văn, given An)
  if (script === 'latin' && (VI_FAMILY.has(fold(tokens[0])) && (cc === 'VN' || /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu.test(text)))) {
    n.family = tokens[0];
    n.given = tokens[tokens.length - 1];
    n.middle = tokens.slice(1, -1).join(' ');
    return { parts: n, splitConfidence: 'medium' };
  }
  // Romanised Korean/Chinese on cards from those countries: "Kim Min-jun", "Wang Wei" (family first) unless given-name order is evident
  if (script === 'latin' && cc && ['KR', 'CN', 'TW', 'HK'].includes(cc) && tokens.length === 2 && EAST_ASIAN_LATIN_FAMILY.has(fold(tokens[0])) && !EAST_ASIAN_LATIN_FAMILY.has(fold(tokens[1]))) {
    n.family = tokens[0];
    n.given = tokens[1];
    return { parts: n, splitConfidence: 'medium' };
  }
  // Hungarian: family first
  if (cc === 'HU' && script === 'latin') {
    n.family = tokens[0];
    n.given = tokens.slice(1).join(' ');
    return { parts: n, splitConfidence: 'medium' };
  }
  // N4 Latin (and N6 Arabic/Devanagari/Cyrillic in logical order): Given [Middle…] Family; particles join the family.
  // Spanish/Portuguese cards: two family names ("José García Márquez" → family "García Márquez").
  let famStart = tokens.length - 1;
  while (famStart > 1 && NAME_PARTICLES.has(fold(tokens[famStart - 1]))) famStart--;
  // Catalan/Spanish "Puigdomènech i Vilaró", "Ortega y Gasset": the family name is both parts with the "i"/"y"
  if (tokens.length >= 4 && /^(i|y)$/.test(tokens[tokens.length - 2]) && famStart >= tokens.length - 2) famStart = tokens.length - 3;
  const iberian = cc && ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'UY', 'PY', 'BO', 'CR', 'GT', 'PT', 'BR'].includes(cc);
  if (iberian && famStart === tokens.length - 1 && tokens.length >= 3 && !GIVEN_NAMES.has(fold(tokens[tokens.length - 2]))) famStart = tokens.length - 2;
  // Arabic compound family names: "Mostafa Abdel Rahman", "Ahmed Abu Zeid", "Omar El Sayed" — the theophoric "Abd-" / "Abu"
  // head belongs to the last word (P5d, B3 eg-t37); "bin Fahad" (nasab) stays the middle name
  if (script === 'latin' && famStart === tokens.length - 1 && tokens.length >= 3 && /^(abd|abdel|abdul|abdal|abdol|abdoul|abu|abou|el|al)$/.test(fold(tokens[tokens.length - 2]))) famStart = tokens.length - 2;
  if (cc === 'RU' && script === 'cyrillic' && tokens.length === 3 && /(ович|евич|ич|овна|евна|ична|инична)$/u.test(tokens[2])) {
    // Russian "Фамилия Имя Отчество" (family first when the last token is a patronymic)
    n.family = tokens[0];
    n.given = tokens[1];
    n.middle = tokens[2];
    return { parts: n, splitConfidence: 'medium' };
  }
  n.given = tokens[0];
  n.middle = tokens.slice(1, famStart).join(' ');
  n.family = tokens.slice(famStart).join(' ');
  return { parts: n, splitConfidence: 'high' };
}

function splitCjk(n: NameParts, ctx: Pick<Ctx, 'cardCountry' | 'segs'>): { parts: NameParts; splitConfidence: Confidence } {
  const text = n.full;
  const spaced = text.split(/[\s・·]+/).filter(Boolean);
  if (spaced.length === 2) {
    n.family = spaced[0];
    n.given = spaced[1];
    return { parts: n, splitConfidence: 'high' };
  }
  const chars = [...text.replace(/\s/g, '')];
  if (HANGUL.test(text)) {
    const compound = KO_COMPOUND_FAMILY.find((f) => text.startsWith(f) && chars.length >= 3);
    const fam = compound ?? (KO_FAMILY.includes(chars[0]) ? chars[0] : chars[0]);
    n.family = fam;
    n.given = chars.slice([...fam].length).join('');
    return { parts: n, splitConfidence: compound || KO_FAMILY.includes(chars[0]) ? 'high' : 'medium' };
  }
  const japanese = ctx.cardCountry === 'JP' || KANA.test(text) || ctx.segs.some((s) => KANA.test(s.text));
  if (japanese) {
    const fam = [...JA_FAMILY].sort((a, b) => b.length - a.length).find((f) => text.startsWith(f) && chars.length - [...f].length >= 1 && chars.length - [...f].length <= 3);
    if (fam) {
      n.family = fam;
      n.given = chars.slice([...fam].length).join('');
      return { parts: n, splitConfidence: 'medium' };
    }
    n.family = chars.join('');
    n.given = '';
    return { parts: n, splitConfidence: 'low' };
  }
  const compound = ZH_COMPOUND_FAMILY.find((f) => text.startsWith(f) && chars.length >= 3);
  const fam = compound ?? chars[0];
  n.family = fam;
  n.given = chars.slice([...fam].length).join('');
  return { parts: n, splitConfidence: chars.length <= 4 ? 'high' : 'medium' };
}
