// OCR line model (SPEC §5.0). COPIED from Offscan `src/engine/ocr.ts` (~/Developer/pdf-scanner at commit 8664bb1,
// same owner; raw shapes, normalisers, CJK joining and reading order unchanged) and trimmed for cards: no unrotate (card
// images are stored upright), no paragraphs/plain text/language plans. Added: axis-aligned boxes, relative line height
// and side-prefixed line ids ("f3", "b0") so extracted fields can point back at their source line.
import type { Box, Line } from './extract/types';

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
export type OcrEngine = 'vision' | 'mlkit' | 'tesseract';
export type OcrWord = { text: string; quad: Quad };
type OcrLine = { text: string; quad: Quad; dir: 'ltr' | 'rtl'; words: OcrWord[]; confidence?: number };

// ---- Raw shapes (contract with the native module, as Offscan's scan-kit) ----
/** Vision: corners normalised with a BOTTOM-left origin (Vision's own frame), per line and per word. */
export type RawVision = {
  engine: 'vision';
  langs: string[];
  lines: { text: string; confidence?: number; quad: Quad; words?: { text: string; quad: Quad }[] }[];
};
type MlkitPoint = { x: number; y: number };
/** ML Kit: corner points in PIXELS of the image, top-left origin, clockwise from the text's top-left. */
export type RawMlkit = {
  engine: 'mlkit';
  langs: string[];
  width: number;
  height: number;
  blocks: {
    text: string;
    lines: { text: string; confidence?: number; cornerPoints: MlkitPoint[]; elements: { text: string; cornerPoints: MlkitPoint[] }[] }[];
  }[];
};
/** Tesseract (ResultIterator at word level): axis-aligned pixel boxes, words in reading order with block/par/line numbers. */
export type RawTesseract = {
  engine: 'tesseract';
  langs: string[];
  width: number;
  height: number;
  words: { text: string; conf: number; left: number; top: number; width: number; height: number; block: number; par: number; line: number }[];
};
export type RawOcr = RawVision | RawMlkit | RawTesseract;

/** A normalised side: what `card_sides.ocr_json` stores and the extractor reads. */
export type CardOcr = { engine: OcrEngine | 'text'; langs: string[]; lines: Line[] };

export class OcrError extends Error {
  readonly code = 'bad-raw-result';
  constructor(message: string) {
    super(message);
    this.name = 'OcrError';
  }
}

// ---- Character classes ----
const RTL_RANGES: [number, number][] = [
  [0x0590, 0x08ff],
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfefe],
  [0x10800, 0x10fff],
  [0x1e800, 0x1efff],
];
export function isRtlChar(cp: number): boolean {
  return RTL_RANGES.some(([a, b]) => cp >= a && cp <= b);
}
const LETTER = /\p{L}/u;
/** Direction of the first strong character (Unicode bidi rule P2); 'ltr' when there is none. */
export function textDirection(text: string): 'ltr' | 'rtl' {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isRtlChar(cp) && LETTER.test(ch)) return 'rtl';
    if (LETTER.test(ch)) return 'ltr';
  }
  return 'ltr';
}
/** Characters written without spaces between words: Han, Hiragana, Katakana, CJK punctuation, full-width forms. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-〿ー＀-￯]/u;
export function isCjkChar(ch: string): boolean {
  return CJK.test(ch);
}

/** Line text: words joined by one space, except between two CJK characters. */
export function joinWords(words: readonly string[]): string {
  let out = '';
  for (const w of words) {
    if (out === '') {
      out = w;
      continue;
    }
    const last = [...out].pop()!;
    const first = [...w][0];
    out += isCjkChar(last) && isCjkChar(first) ? w : ` ${w}`;
  }
  return out;
}

// ---- Normalisers ----
const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
function quadOf(points: readonly Point[], what: string): Quad {
  if (points.length !== 4 || !points.every(finite)) throw new OcrError(`${what}: need 4 finite corner points`);
  return [points[0], points[1], points[2], points[3]].map((p) => ({ x: p.x, y: p.y })) as Quad;
}
function boundsQuad(quads: readonly Quad[]): Quad {
  const xs = quads.flatMap((q) => q.map((p) => p.x));
  const ys = quads.flatMap((q) => q.map((p) => p.y));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}
const clean = (s: string) => s.replace(/\s+/gu, ' ').trim();

type Draft = { words: OcrWord[]; quad?: Quad; confidence?: number };

function finish(drafts: Draft[]): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const d of drafts) {
    const words = d.words.filter((w) => w.text !== '');
    if (words.length === 0) continue;
    const text = joinWords(words.map((w) => w.text));
    const line: OcrLine = { text, quad: d.quad ?? boundsQuad(words.map((w) => w.quad)), dir: textDirection(text), words };
    if (d.confidence !== undefined && Number.isFinite(d.confidence)) line.confidence = d.confidence;
    lines.push(line);
  }
  return lines;
}

/** A quad, or null when malformed (one bad box must not fail the side — it is dropped, the rest kept). */
function tryQuad(points: readonly Point[] | undefined | null, what: string): Quad | null {
  try {
    return points ? quadOf(points, what) : null;
  } catch {
    return null;
  }
}

function fromVision(raw: RawVision): Draft[] {
  const flip = (q: Quad): Quad => q.map((p) => ({ x: p.x, y: 1 - p.y })) as Quad;
  return raw.lines.map((l, i) => {
    const lineQuad = tryQuad(l.quad, `vision line ${i}`);
    const quad = lineQuad ? flip(lineQuad) : undefined;
    const words: OcrWord[] = [];
    if (l.words && l.words.length > 0) {
      l.words.forEach((w, k) => {
        const q = tryQuad(w.quad, `vision line ${i} word ${k}`);
        if (q) words.push({ text: clean(w.text ?? ''), quad: flip(q) });
      });
    } else if (quad && clean(l.text ?? '') !== '') {
      words.push({ text: clean(l.text), quad });
    }
    return { words, quad, confidence: l.confidence };
  });
}

function fromMlkit(raw: RawMlkit): Draft[] {
  if (!(raw.width > 0 && raw.height > 0)) throw new OcrError('mlkit: image size missing');
  const norm = (pts: MlkitPoint[] | undefined, what: string) =>
    pts ? tryQuad(pts.map((p) => ({ x: p.x / raw.width, y: p.y / raw.height })), what) : null;
  return raw.blocks.flatMap((b, bi) =>
    (b.lines ?? []).map((l, li) => {
      const words: OcrWord[] = [];
      (l.elements ?? []).forEach((e, ei) => {
        const q = norm(e.cornerPoints, `mlkit element ${bi}/${li}/${ei}`);
        if (q) words.push({ text: clean(e.text ?? ''), quad: q });
      });
      return { quad: norm(l.cornerPoints, `mlkit block ${bi} line ${li}`) ?? undefined, confidence: l.confidence, words };
    })
  );
}

function fromTesseract(raw: RawTesseract): Draft[] {
  if (!(raw.width > 0 && raw.height > 0)) throw new OcrError('tesseract: image size missing');
  const drafts = new Map<string, Draft & { conf: number[] }>();
  for (const w of raw.words) {
    const key = `${w.block}/${w.par}/${w.line}`;
    let d = drafts.get(key);
    if (!d) drafts.set(key, (d = { words: [], conf: [] }));
    const x0 = w.left / raw.width;
    const y0 = w.top / raw.height;
    const x1 = (w.left + w.width) / raw.width;
    const y1 = (w.top + w.height) / raw.height;
    const quad = tryQuad(
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      `tesseract word ${key}`
    );
    if (!quad) continue;
    const text = clean(w.text ?? '');
    d.words.push({ text, quad });
    if (text !== '' && Number.isFinite(w.conf)) d.conf.push(w.conf / 100);
  }
  return [...drafts.values()].map((d) => ({
    words: d.words,
    confidence: d.conf.length ? d.conf.reduce((a, b) => a + b, 0) / d.conf.length : undefined,
  }));
}

// ---- Reading order (Offscan) ----
function yRange(q: Quad) {
  const ys = q.map((p) => p.y);
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
}
function xRange(q: Quad) {
  const xs = q.map((p) => p.x);
  return { left: Math.min(...xs), right: Math.max(...xs) };
}
const centreY = (q: Quad) => {
  const { top, bottom } = yRange(q);
  return (top + bottom) / 2;
};

/** Two lines share a row when their vertical overlap is ≥ 50 % of the smaller height. */
export function sameRow(a: Quad, b: Quad): boolean {
  const ra = yRange(a);
  const rb = yRange(b);
  const overlap = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
  const smaller = Math.min(ra.bottom - ra.top, rb.bottom - rb.top);
  return smaller > 0 ? overlap >= 0.5 * smaller : overlap >= 0;
}

function rows(lines: readonly OcrLine[]): OcrLine[][] {
  const sorted = [...lines].sort((a, b) => centreY(a.quad) - centreY(b.quad) || xRange(a.quad).left - xRange(b.quad).left);
  const out: OcrLine[][] = [];
  for (const line of sorted) {
    const row = out[out.length - 1];
    if (row && sameRow(row[0].quad, line.quad)) row.push(line);
    else out.push([line]);
  }
  return out.map((row) => {
    const rtl = row.filter((l) => l.dir === 'rtl').length > row.length / 2;
    return [...row].sort((a, b) => (rtl ? xRange(b.quad).right - xRange(a.quad).right : xRange(a.quad).left - xRange(b.quad).left));
  });
}

function boxOf(q: Quad): Box {
  const { top, bottom } = yRange(q);
  const { left, right } = xRange(q);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Raw engine output → card lines in reading order with ids `<prefix><index>` (prefix 'f' front, 'b' back). */
export function normalizeOcr(raw: RawOcr, prefix: 'f' | 'b' = 'f'): CardOcr {
  const drafts = raw.engine === 'vision' ? fromVision(raw) : raw.engine === 'mlkit' ? fromMlkit(raw) : fromTesseract(raw);
  const ordered = rows(finish(drafts)).flat();
  return {
    engine: raw.engine,
    langs: [...raw.langs],
    lines: ordered.map((l, i) => {
      const box = boxOf(l.quad);
      const line: Line = { id: `${prefix}${i}`, text: l.text, box, height: box.h, dir: l.dir };
      if (l.confidence !== undefined) line.conf = l.confidence;
      return line;
    }),
  };
}

/** Pasted text (e-mail signature): one line per non-empty text line, no boxes, ids `t0`, `t1` … */
export function linesFromText(text: string): Line[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((t) => clean(t))
    .filter((t) => t !== '')
    .map((t, i) => ({ id: `t${i}`, text: t, dir: textDirection(t) }));
}
