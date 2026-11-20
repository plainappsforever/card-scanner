// Rule 1 — pre-normalisation and segments (SPEC §5.1). Pure.
// A line is split into SEGMENTS at "|", "•", "·", " / " (spaced) and at two or more spaces before a label word, so
// "T +49 30 12 | M +49 170 …" yields two phone segments. Rules consume spans of a segment's `rest` (replaced by
// spaces, same length) so one segment can feed several fields ("E-Mail: a@b-de.example  Web: www.b.de").
import { foldText } from '../match';

import { EMAIL_LABELS, PHONE_LABELS, SOCIAL_LABELS, URL_LABELS } from './dict/labels';
import type { Line } from './types';

export type Seg = {
  id: string;
  lineId: string;
  line: Line;
  /** Reading order over all sides (front first, then back). */
  order: number;
  side: string;
  text: string;
  rest: string;
  /** Line height (0…1 of the card height), 0 when unknown (pasted text). */
  height: number;
  /** Field kinds that used this segment. */
  used: string[];
};

/** NFKC; dashes, quotes and odd spaces unified. Keeps runs of spaces (segmentation needs them). */
export function normText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[‘’‚‛′´`]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000\t]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Arabic-Indic, Persian and Devanagari digits → ASCII (same length; NFKC leaves them alone)
    .replace(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/** Position-preserving fold: lower case, Latin/Greek/Cyrillic diacritics removed per character (same UTF-16 length). */
export function foldKeep(s: string): string {
  let out = '';
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const base = lower.normalize('NFKD').replace(/[\u0300-\u036F]/g, '');
    out += base.length === lower.length && lower.length === ch.length ? base : ch.length === lower.length ? lower : ch;
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
function alternation(words: Iterable<string>): string {
  return [...new Set(words)].sort((a, b) => b.length - a.length).map(escape).join('|');
}

const ALL_LABELS = alternation([...Object.keys(PHONE_LABELS), ...EMAIL_LABELS, ...URL_LABELS, ...Object.keys(SOCIAL_LABELS)]);
/** A label word at the start of a piece, followed by ":"/"." or a space and then something that is not a letter. */
const LEADING_LABEL = new RegExp(`^(?:${ALL_LABELS})(?![\\p{L}])\\s*[.:：]?`, 'iu');

// " / " splits, except between digits: German numbers are printed "0761 / 29 28 27". A "|" glued between two letters
// ("dana.whitfie|d@…") is an OCR "l", not a separator (P5c): it stays in the text and the rules repair it.
const SPLIT = /\s*(?:(?<!\p{L})\||\|(?!\p{L})|[•·◦▪●■♦◆‧∙⋅])\s*|(?<!\d)\s+\/\s+|\s+\/\s+(?!\d)/u;

/**
 * OCR-damage indicators inside words (P5c, L26): a "|" glued between letters, a 0/1 between lower-case letters
 * ("J0hn", "Ma1er"), a capital I between lower-case letters ("HoIlmann"), "0'" before a capital ("0'Brien"), a letter
 * O/l/I glued to a digit run ("28O", "9845O"). A value read from such text is never "sure".
 */
export const OCR_DAMAGE = /(?<=\p{L})\|+(?=\p{L}|-\p{Lu})|(?<=\p{Ll})[01](?=\p{Ll})|(?<=\p{Ll})I(?=\p{Ll})|(?<![\p{L}\d])0'(?=\p{Lu})|(?<=\d)[OlI](?![\p{L}])|(?<![\p{L}])[OlI](?=\d{2})/u;
export function ocrDamaged(text: string): boolean {
  return OCR_DAMAGE.test(text);
}

/** Splits one line into segment texts (rule 1). */
export function splitSegments(text: string): string[] {
  const parts = normText(text).split(SPLIT);
  const out: string[] = [];
  for (const part of parts) {
    // two or more spaces before a label word start a new segment
    const pieces = part.split(/\s{2,}/);
    let cur = '';
    for (const p of pieces) {
      if (cur !== '' && LEADING_LABEL.test(foldKeep(p))) {
        out.push(cur);
        cur = p;
      } else cur = cur === '' ? p : `${cur} ${p}`;
    }
    if (cur.trim() !== '') out.push(cur);
  }
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s !== '');
}

export function buildSegments(lines: readonly Line[], startOrder = 0): Seg[] {
  const segs: Seg[] = [];
  let order = startOrder;
  for (const line of lines) {
    const texts = splitSegments(line.text);
    texts.forEach((t, k) => {
      segs.push({
        id: texts.length === 1 ? line.id : `${line.id}.${k}`,
        lineId: line.id,
        line,
        order: order++,
        side: line.id.replace(/\d.*$/, ''),
        text: t,
        rest: t,
        height: line.height ?? line.box?.h ?? 0,
        used: [],
      });
    });
  }
  return segs;
}

/** Replaces [start, end) of the segment's rest with spaces and records the field kind. */
export function consume(seg: Seg, start: number, end: number, kind: string): void {
  seg.rest = seg.rest.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + seg.rest.slice(end);
  if (!seg.used.includes(kind)) seg.used.push(kind);
}

export function consumeAll(seg: Seg, kind: string): void {
  consume(seg, 0, seg.rest.length, kind);
}

const LABEL_ONLY = new RegExp(`^(?:(?:${ALL_LABELS})(?![\\p{L}])[\\s.:：/()-]*)+$`, 'iu');

/** What is left of a segment once labels and punctuation are ignored ('' = nothing meaningful). */
export function meaningfulRest(seg: Seg): string {
  const r = seg.rest.replace(/\s+/g, ' ').trim().replace(/^[\s,;:.()\-–/]+|[\s,;:.()\-–/]+$/g, '');
  if (r === '' || LABEL_ONLY.test(foldKeep(r))) return '';
  return [...r.replace(/[^\p{L}\p{N}]/gu, '')].length >= 2 ? r : '';
}

/** Folded text for dictionary lookups (diacritics removed, lower case; length may change). */
export function fold(s: string): string {
  return foldText(s);
}

export const LETTERS = /\p{L}/u;
export const HAN = /[\p{Script=Han}]/u;
export const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
export const HANGUL = /[\p{Script=Hangul}]/u;
export const CJK_ANY = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export type Script = 'latin' | 'cjk' | 'hangul' | 'cyrillic' | 'arabic' | 'devanagari' | 'other';
export function scriptOf(text: string): Script {
  const counts: Record<Script, number> = { latin: 0, cjk: 0, hangul: 0, cyrillic: 0, arabic: 0, devanagari: 0, other: 0 };
  for (const ch of text) {
    if (/\p{Script=Latin}/u.test(ch)) counts.latin++;
    else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) counts.cjk++;
    else if (/\p{Script=Hangul}/u.test(ch)) counts.hangul++;
    else if (/\p{Script=Cyrillic}/u.test(ch)) counts.cyrillic++;
    else if (/\p{Script=Arabic}/u.test(ch)) counts.arabic++;
    else if (/\p{Script=Devanagari}/u.test(ch)) counts.devanagari++;
    else if (/\p{L}/u.test(ch)) counts.other++;
  }
  let best: Script = 'other';
  let n = 0;
  for (const [k, v] of Object.entries(counts) as [Script, number][]) {
    if (v > n) {
      best = k;
      n = v;
    }
  }
  return best;
}

export { alternation, escape };

const CONFUSABLE: Record<string, string> = { O: '0', o: '0', l: '1', I: '1', '|': '1', S: '5', B: '8' };
// a lone confusable letter before a space is a label or an icon ("O 0171 …" = office), never a digit (N4)
const RUN = /(?<![\p{L}\d])[+(]?(?:\d|[OolI|SB](?=[\dOolI|SB]))(?:[\dOolI|SB]|[\s().\/-](?=[\s().\/-]*[\dOolI|SB]))*/gu;

/** Same-length confusable repair inside digit-dominated runs (phones, postcodes). */
export function repairDigits(text: string): { text: string; repaired: boolean } {
  let repaired = false;
  const out = text.replace(RUN, (run, offset: number) => {
    const after = text[offset + run.length];
    if (after && /\p{L}/u.test(after)) return run;
    const chars = run.replace(/[^\dOolI|SB]/g, '');
    const digits = (chars.match(/\d/g) ?? []).length;
    if (digits < 4 || digits / chars.length < 0.7 || digits === chars.length) return run;
    repaired = true;
    return run.replace(/[OolI|SB]/g, (c) => CONFUSABLE[c]);
  });
  return { text: out, repaired };
}



// ---- Geometry (when the OCR gave boxes; pasted text has none and falls back to reading order) ----
const overlapX = (a: Seg, b: Seg) => {
  const A = a.line.box!;
  const B = b.line.box!;
  return Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
};

export function hasBoxes(segs: readonly Seg[]): boolean {
  return segs.length > 0 && segs.every((s) => !!s.line.box);
}

/** `below` sits directly under `above` in the same column: small vertical gap, overlapping or left-aligned. */
export function directlyBelow(above: Seg, below: Seg, maxGapLines = 1.6): boolean {
  const A = above.line.box;
  const B = below.line.box;
  if (!A || !B || above.side !== below.side || above.lineId === below.lineId) return false;
  const gap = B.y - (A.y + A.h);
  const unit = Math.max(A.h, B.h);
  if (B.y < A.y + A.h * 0.5 || gap > unit * maxGapLines) return false;
  return overlapX(above, below) > 0 || Math.abs(A.x - B.x) < 0.05;
}

/** Lines above `seg` in its column, nearest first, at most `n` lines and `maxGapLines` line heights apart each. */
export function columnAbove(segs: readonly Seg[], seg: Seg, n: number, maxGapLines = 2.2): Seg[] {
  const out: Seg[] = [];
  let cur = seg;
  const pool = segs.filter((s) => s.side === seg.side && s.lineId !== seg.lineId && s.line.box && seg.line.box && s.line.box.y < seg.line.box.y);
  for (let k = 0; k < n; k++) {
    const next = pool
      .filter((s) => directlyBelow(s, cur, maxGapLines) && !out.includes(s))
      .sort((a, b) => b.line.box!.y - a.line.box!.y)[0];
    if (!next) break;
    // every segment of that line, right to left so the nearest text comes first
    const sameLine = pool.filter((s) => s.lineId === next.lineId).reverse();
    out.push(...sameLine);
    cur = next;
  }
  return out;
}
