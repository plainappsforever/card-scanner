// Orientation chooser (SPEC §5.1 end, D18). Pure. The app OCRs at 0° first and retries 90°, 270°, 180° only when the
// 0° result is weak; this module decides both.
import type { Line } from './extract/types';

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const URL = /\b(?:https?:\/\/|www\.)\S+/i;
const PHONE = /(?:\+|\b)\d[\d\s()./-]{5,}\d/;

/** Pattern hits of a set of lines: lines with an e-mail, a URL/www or a phone-like digit run. */
export function patternHits(lines: readonly Line[]): number {
  let n = 0;
  for (const l of lines) {
    if (EMAIL.test(l.text)) n++;
    if (URL.test(l.text)) n++;
    if (PHONE.test(l.text) && (l.text.match(/\d/g) ?? []).length >= 6) n++;
  }
  return n;
}

/** Score = Σ(characters × line confidence (1 when unknown)) + 10 per pattern hit. */
export function orientationScore(lines: readonly Line[]): number {
  let chars = 0;
  for (const l of lines) chars += [...l.text.replace(/\s/g, '')].length * (l.conf ?? 1);
  return chars + 10 * patternHits(lines);
}

/** Retry other rotations when the 0° result has < 20 characters or no pattern hit (D18). */
export function needsRotationRetry(lines: readonly Line[]): boolean {
  const chars = lines.reduce((n, l) => n + [...l.text.replace(/\s/g, '')].length, 0);
  return chars < 20 || patternHits(lines) === 0;
}

export const RETRY_ORDER = [90, 270, 180] as const;
export type Rotation = 0 | 90 | 180 | 270;

/** The best of the rotations tried; ties → the lower rotation. */
export function chooseRotation(results: readonly { rotation: Rotation; lines: Line[] }[]): Rotation {
  let best: { rotation: Rotation; score: number } | null = null;
  for (const r of [...results].sort((a, b) => a.rotation - b.rotation)) {
    const score = orientationScore(r.lines);
    if (!best || score > best.score) best = { rotation: r.rotation, score };
  }
  return best?.rotation ?? 0;
}
