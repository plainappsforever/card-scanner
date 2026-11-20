// Text recognition queue (SPEC §5.0, D18): one side at a time, oldest first; the state lives in card_sides, so the queue
// resumes after the app is killed. Per side: recognise at 0°, retry rotations only when the result is weak (D18), read
// printed codes (QR …). When no side of a card is pending any more and the card is still an UNEDITED draft, the extractor
// fills its fields (each with its confidence). States are honest: done · empty · unsupported (languages this phone
// cannot read) · failed (reason).
import { Platform } from 'react-native';

import CardKit from '../../modules/card-kit';
import { getCard, OCR_MODEL_PENDING, pendingOcrSides, replaceFields, requeueModelPending, setSideOcr, type SideName } from '@/db/cards';
import { fieldsFromExtracted } from '@/db/fields';
import { getSetting } from '@/db/settings';
import type { Db } from '@/db/types';
import { extract } from '@/engine/extract/index';
import { normalizeOcr, type CardOcr } from '@/engine/ocr';
import { chooseRotation, needsRotationRetry, RETRY_ORDER, type Rotation } from '@/engine/orientation';
import { deviceRegion, getLanguage } from '@/i18n';

import { uriOf } from './app-files';
import { cardInput } from './card-input';
import { ocrLanguages, planOcr } from './ocr-langs';

let running = false;
let wake: (() => void) | null = null;
let available: string[] | null = null;
const listeners = new Set<(cardId: string) => void>();

/** Called when a card's OCR/extraction finished (screens refresh). */
export function onCardProcessed(fn: (cardId: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function kickOcr(): void {
  wake?.();
}

export async function nativeOcrLanguages(): Promise<string[]> {
  available ??= await CardKit.ocrLanguages().catch(() => []);
  return available;
}

export async function phoneRegion(db: Db): Promise<string | undefined> {
  return (await getSetting(db, 'phone_region')) ?? deviceRegion();
}

export function startOcrQueue(db: Db): void {
  if (running) return;
  running = true;
  (async () => {
    await requeueModelPending(db).catch(() => 0);
    for (;;) {
      const [next] = await pendingOcrSides(db, 1).catch(() => []);
      if (!next) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 30_000);
        });
        wake = null;
        continue;
      }
      await recognizeSide(db, next.cardId, next.side, next.imageFile);
      const card = await getCard(db, next.cardId).catch(() => null);
      if (card && !card.sides.some((s) => s.ocrState === 'pending')) {
        await extractCard(db, next.cardId).catch(() => undefined);
        listeners.forEach((fn) => fn(next.cardId));
      }
    }
  })();
}

export async function recognizeSide(db: Db, cardId: string, side: SideName, imageFile: string): Promise<void> {
  const prefix = side === 'front' ? 'f' : 'b';
  try {
    const plan = planOcr(ocrLanguages(await getSetting(db, 'ocr_langs'), getLanguage()), Platform.OS === 'ios' ? 'ios' : 'android', await nativeOcrLanguages());
    const uri = uriOf(imageFile);
    const codes = await CardKit.detectBarcodes(uri).catch(() => []);
    const qrJson = codes.length ? JSON.stringify(codes.map((c) => ({ format: c.format, text: c.text }))) : null;
    if (plan.codes.length === 0) {
      await setSideOcr(db, cardId, side, { state: 'unsupported', langs: plan.unsupported.join(','), qrJson });
      return;
    }
    const read = async (rotation: Rotation): Promise<CardOcr> => normalizeOcr(await CardKit.recognize(uri, { langs: plan.codes, rotation }), prefix);
    let ocr = await read(0);
    let rotation: Rotation = 0;
    if (needsRotationRetry(ocr.lines)) {
      const results: { rotation: Rotation; lines: CardOcr['lines']; ocr: CardOcr }[] = [{ rotation: 0, lines: ocr.lines, ocr }];
      for (const r of RETRY_ORDER) {
        const o = await read(r);
        results.push({ rotation: r, lines: o.lines, ocr: o });
      }
      rotation = chooseRotation(results);
      ocr = results.find((x) => x.rotation === rotation)?.ocr ?? ocr;
    }
    await setSideOcr(db, cardId, side, {
      state: ocr.lines.length ? 'done' : 'empty',
      engine: ocr.engine,
      langs: plan.codes.join(','),
      json: JSON.stringify(ocr),
      rotation,
      qrJson,
    });
  } catch (e) {
    // Android: a Play-services text model (Chinese/Devanagari/Japanese/Korean) is still downloading — not a failure; the
    // side waits as "unsupported" + model-pending and is queued again on the next start (Offscan P6–P8 bug 6)
    if ((e as { code?: string }).code === 'E_MODEL_PENDING') {
      await setSideOcr(db, cardId, side, { state: 'unsupported', error: OCR_MODEL_PENDING }).catch(() => undefined);
      return;
    }
    await setSideOcr(db, cardId, side, { state: 'failed', error: e instanceof Error ? e.message : String(e) }).catch(() => undefined);
  }
}

const SCALAR = new Set(['name', 'other_name', 'company', 'department', 'title']);

/**
 * Extraction of a draft (first capture, added back side, retake). What the user typed or edited is never overwritten:
 * those fields stay, the extractor only adds kinds/values the user has not set. Confirmed cards are never touched.
 */
export async function extractCard(db: Db, cardId: string): Promise<void> {
  const card = await getCard(db, cardId);
  if (!card || card.status !== 'draft') return;
  const x = extract(cardInput(card, await phoneRegion(db), getLanguage()));
  const kept = card.fields.filter((f) => f.edited || f.confidence === 'user');
  const fresh = fieldsFromExtracted(x).filter((f) => !kept.some((k) => k.kind === f.kind && (SCALAR.has(f.kind) || (k.normalized !== null && k.normalized === f.normalized))));
  await replaceFields(db, cardId, [...kept, ...fresh], { extractorVersion: x.version });
}
