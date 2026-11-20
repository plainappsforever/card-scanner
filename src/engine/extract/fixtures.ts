// Card fixture format (development set test/fixtures/cards/dev/, documented in its README.md) and its conversion to
// extractor input. Pure: the file system is injected (Jest and the Node bench share this).
import { linesFromText, normalizeOcr, type RawVision } from '../ocr';

import type { ExtractInput, Line } from './types';

/** A line as written in a fixture: "text", [text, height] or [text, height, x, y] (0…1 of the card). */
export type FixtureLine = string | [string, number] | [string, number, number, number];

export type TruthName = { prefix?: string; given?: string; middle?: string; family?: string; suffix?: string };
export type TruthPhone = { number: string; type: 'mobile' | 'work' | 'fax' | 'home' | 'other' };
export type TruthAddress = { street?: string; postcode?: string; city?: string; region?: string; country?: string };
export type Truth = {
  name?: TruthName;
  otherName?: string;
  company?: string;
  title?: string;
  department?: string;
  phones?: TruthPhone[];
  emails?: string[];
  urls?: string[];
  socials?: { service: string; value: string }[];
  addresses?: TruthAddress[];
};

export type CardFixture = {
  id: string;
  lang?: string;
  region?: string;
  uiLang?: string;
  layout?: string;
  notes?: string;
  front?: FixtureLine[];
  back?: FixtureLine[];
  paste?: string;
  qr?: string[];
  truth: Truth;
};

const DEFAULT_H = 0.05;

/**
 * Lines with explicit positions go through the real OCR normaliser (as a Vision result), so their reading order is the
 * app's (rows top to bottom, left to right — two-column cards interleave like on a phone). Lines without positions are
 * stacked in the given order.
 */
function toLines(lines: readonly FixtureLine[], prefix: 'f' | 'b'): Line[] {
  if (lines.length > 0 && lines.every((l) => typeof l !== 'string' && l.length === 4)) {
    const raw: RawVision = {
      engine: 'vision',
      langs: [],
      lines: lines.map((l) => {
        const [text, h, x, y] = l as [string, number, number, number];
        const w = Math.min(0.95 - x, 0.012 * [...text].length + 0.05);
        // Vision: bottom-left origin
        const quad = [
          { x, y: 1 - y },
          { x: x + w, y: 1 - y },
          { x: x + w, y: 1 - y - h },
          { x, y: 1 - y - h },
        ] as RawVision['lines'][number]['quad'];
        return { text, quad };
      }),
    };
    return normalizeOcr(raw, prefix).lines;
  }
  let y = 0.08;
  return lines.map((l, i) => {
    const [text, h = DEFAULT_H, x, yy] = typeof l === 'string' ? [l] : l;
    const top = yy ?? y;
    y = Math.max(y, top + h * 1.45);
    const w = Math.min(0.9, 0.012 * [...text].length + 0.05);
    return { id: `${prefix}${i}`, text, box: { x: x ?? 0.08, y: top, w, h }, height: h };
  });
}

export function fixtureInput(c: CardFixture): ExtractInput {
  if (c.paste !== undefined) return { front: linesFromText(c.paste), qr: c.qr?.map((text) => ({ text })), region: c.region, uiLang: c.uiLang };
  return { front: toLines(c.front ?? [], 'f'), back: c.back ? toLines(c.back, 'b') : undefined, qr: c.qr?.map((text) => ({ text })), region: c.region, uiLang: c.uiLang };
}

/** All cards of a folder: every *.json holds one card or an array of cards. */
export function loadCards(dir: string, read: (p: string) => string, list: (d: string) => string[], join: (a: string, b: string) => string): CardFixture[] {
  const out: CardFixture[] = [];
  for (const f of list(dir).filter((n) => n.endsWith('.json')).sort()) {
    const data = JSON.parse(read(join(dir, f))) as CardFixture | CardFixture[];
    out.push(...(Array.isArray(data) ? data : [data]));
  }
  return out;
}
