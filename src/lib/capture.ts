// Capture pipeline (SPEC §8 U1–U3, §4.1): images → upright, metadata-free card JPEGs (long edge ≤ 1600, q 0.85) +
// thumbnails (≤ 360) in the cache → moved into cards/<id>/ → ONE transaction creates the DRAFT card ("To check") →
// the OCR queue reads it. Nothing reaches Contacts or an export from here (L26): the user confirms in Review first.
import { Platform } from 'react-native';

import CardKit, { type NativeQuad } from '../../modules/card-kit';
import type { CardSource, SideName } from '@/db/cards';
import type { Db } from '@/db/types';
import { detectDocument } from '@/engine/detect';
import { orderCorners, outputSize, quadValid, type Quad } from '@/engine/geometry';

import { appFs, incomingUri, newCardId } from './app-files';
import { base64ToBytes } from './base64';
import { storeNewCard, type CapturedSide } from './files';
import { kickOcr } from './ocr-queue';

export const CARD_MAX_SIDE = 1600;
export const CARD_QUALITY = 0.85;
export const THUMB_SIDE = 360;
/** Detector score from which a photo's card outline is applied without asking (Offscan U3). */
export const CONFIDENT = 0.6;

export type IncomingImage = { uri: string; w?: number; h?: number; cropped: boolean };

/** Card outline in a photo: Vision's document segmentation on iOS, else (or when it finds nothing) the JS detector. */
export async function detectCard(uri: string): Promise<{ quad: Quad; score: number } | null> {
  if (Platform.OS === 'ios') {
    try {
      const q = await CardKit.detectDocument(uri);
      if (q) return { quad: orderCorners(q), score: 1 };
    } catch {
      // the JS detector below
    }
  }
  const g = await CardKit.grayThumbnail(uri, 384);
  const found = detectDocument({ width: g.w, height: g.h, data: base64ToBytes(g.base64) });
  return found ? { quad: found.quad as Quad, score: found.score } : null;
}

/** One image → a side ready to be moved into its card folder. Photos get their card outline cut out when sure. */
export async function prepareSide(img: IncomingImage, side: SideName): Promise<CapturedSide> {
  const normalized = incomingUri();
  const n = await CardKit.normalizeImport(img.uri, normalized, 2400);
  let src = normalized;
  if (!img.cropped) {
    const found = await detectCard(normalized).catch(() => null);
    if (found && found.score >= CONFIDENT && quadValid(found.quad, n.w / n.h)) {
      const size = outputSize(found.quad, n.w, n.h);
      const warped = incomingUri();
      await CardKit.render({ src: normalized, out: warped, quad: found.quad as NativeQuad, width: size.w, height: size.h, filter: 'original', brightness: 0, contrast: 0, threshold: 0, quality: 0.92 });
      src = warped;
    }
  }
  const temp = incomingUri();
  const out = await CardKit.exportJpeg(src, temp, CARD_MAX_SIDE, CARD_QUALITY);
  const thumbTemp = incomingUri();
  await CardKit.exportJpeg(temp, thumbTemp, THUMB_SIDE, 0.8);
  return { side, temp, thumbTemp, w: out.w, h: out.h };
}

export type AddOptions = { source: CardSource; twoSided: boolean; eventId: string | null };

/**
 * Images (scanner pages in order, or picked photos) → draft cards. With `twoSided`, pages pair up as front/back
 * (an odd last page is a one-sided card). Returns the new card ids in order.
 */
export async function addCards(db: Db, images: readonly IncomingImage[], opts: AddOptions, now = Date.now()): Promise<string[]> {
  const ids: string[] = [];
  const step = opts.twoSided ? 2 : 1;
  for (let i = 0; i < images.length; i += step) {
    const group = images.slice(i, i + step);
    const sides: CapturedSide[] = [];
    for (let k = 0; k < group.length; k++) sides.push(await prepareSide(group[k], k === 0 ? 'front' : 'back'));
    const id = newCardId();
    await storeNewCard(appFs, db, { id, source: opts.source, status: 'draft', eventId: opts.eventId, metOn: localDay(now) }, sides, now + ids.length);
    ids.push(id);
  }
  kickOcr();
  return ids;
}

/** Today as YYYY-MM-DD in local time ("Met on" default). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type ScanOutcome = { kind: 'cards'; ids: string[] } | { kind: 'cancel' } | { kind: 'fallback'; reason: string };

/** U1/U2: the system scanner (VisionKit / ML Kit). 'fallback' when it is not ready (simulator, Play module missing). */
export async function scanCards(db: Db, opts: Omit<AddOptions, 'source'>): Promise<ScanOutcome> {
  const status = await CardKit.scannerStatus().catch(() => 'unavailable' as const);
  if (status !== 'ready') return { kind: 'fallback', reason: status };
  let res;
  try {
    res = await CardKit.scanDocument({});
  } catch (e) {
    return { kind: 'fallback', reason: e instanceof Error ? e.message : 'error' };
  }
  if (res.status !== 'ok' || res.pages.length === 0) return { kind: 'cancel' };
  const ids = await addCards(db, res.pages.map((p) => ({ uri: p.uri, w: p.w, h: p.h, cropped: true })), { ...opts, source: 'scan' });
  return { kind: 'cards', ids };
}

/** One more image for an existing card ("Add back side", "Retake"): the scanner (one page) when ready, else Photos. */
export async function captureOne(pick: () => Promise<IncomingImage | null>): Promise<IncomingImage | null> {
  const status = await CardKit.scannerStatus().catch(() => 'unavailable' as const);
  if (status === 'ready') {
    try {
      const res = await CardKit.scanDocument({ pageLimit: 1 });
      if (res.status !== 'ok' || res.pages.length === 0) return null;
      return { uri: res.pages[0].uri, w: res.pages[0].w, h: res.pages[0].h, cropped: true };
    } catch {
      // fall through to the picker
    }
  }
  return pick();
}
