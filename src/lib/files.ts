// Card image files (SPEC §4.1, Offscan D28 ordering). The file system is injected (`FileOps`): the app passes an
// expo-file-system implementation (P6/P7), tests a fake with injected failures. Paths stored in the database are
// RELATIVE to the documents folder (iOS changes the container path between installs/updates).
//
// Order of a new card: images written to a temp path by the capture code → moved into cards/<id>/ → ONE transaction
// inserts the rows. A failed move removes what this call already moved and creates no rows; a failed transaction leaves
// the folder without rows, which the start-up sweep removes. Deletion runs the other way: rows go first (purgeDeleted),
// files after. The app only ever removes its own files under cards/ (product behaviour on the user's phone).
import { createCard, putSide, type NewCard, type SideInput, type SideName } from '@/db/cards';
import type { Db } from '@/db/types';

export type FileOps = {
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  makeDir(path: string): Promise<void>;
};

export const CARDS_DIR = 'cards';

export function cardDir(cardId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(cardId)) throw new Error(`unsafe card id "${cardId}"`);
  return `${CARDS_DIR}/${cardId}`;
}

/** Paths of a side's files. A REPLACED side gets a unique name (`stamp`), so the old image is never overwritten before the row commits (S15). */
export function sidePaths(cardId: string, side: SideName, stamp?: number): { image: string; thumb: string } {
  const dir = cardDir(cardId);
  const base = stamp === undefined ? side : `${side}-${stamp}`;
  return { image: `${dir}/${base}.jpg`, thumb: `${dir}/${base}.thumb.jpg` };
}

/** A side as captured: temp files (relative or absolute, the FileOps implementation decides) + size. */
export type CapturedSide = { side: SideName; temp: string; thumbTemp?: string; w: number; h: number; rotation?: 0 | 90 | 180 | 270; qrJson?: string | null };

/** Moves the captured files into the card folder, then inserts the rows. Returns the card id. */
export async function storeNewCard(fs: FileOps, db: Db, card: Omit<NewCard, 'sides'> & { id: string }, sides: readonly CapturedSide[], now = Date.now()): Promise<string> {
  const moved: string[] = [];
  const rows: SideInput[] = [];
  try {
    await fs.makeDir(cardDir(card.id));
    for (const s of sides) {
      const p = sidePaths(card.id, s.side);
      await fs.move(s.temp, p.image);
      moved.push(p.image);
      if (s.thumbTemp) {
        await fs.move(s.thumbTemp, p.thumb);
        moved.push(p.thumb);
      }
      rows.push({ side: s.side, imageFile: p.image, w: s.w, h: s.h, rotation: s.rotation ?? 0, qrJson: s.qrJson ?? null });
    }
  } catch (error) {
    for (const path of moved) await fs.remove(path).catch(() => undefined);
    throw error;
  }
  await createCard(db, { ...card, sides: rows }, now); // a failure here leaves files without rows → swept at start
  return card.id;
}

/**
 * "Add back side" / "Retake": the new image goes to a UNIQUE path, then one transaction swaps the row, and only after the
 * commit the replaced file is removed (review S15). A failed move or transaction leaves the old side intact.
 */
export async function replaceSide(fs: FileOps, db: Db, cardId: string, captured: CapturedSide, now = Date.now()): Promise<void> {
  const p = sidePaths(cardId, captured.side, now);
  const moved: string[] = [];
  try {
    await fs.makeDir(cardDir(cardId));
    await fs.move(captured.temp, p.image);
    moved.push(p.image);
    if (captured.thumbTemp) {
      await fs.move(captured.thumbTemp, p.thumb);
      moved.push(p.thumb);
    }
  } catch (error) {
    for (const path of moved) await fs.remove(path).catch(() => undefined);
    throw error;
  }
  let old: string | null;
  try {
    old = await putSide(db, cardId, { side: captured.side, imageFile: p.image, w: captured.w, h: captured.h, rotation: captured.rotation ?? 0, qrJson: captured.qrJson ?? null }, now);
  } catch (error) {
    for (const path of moved) await fs.remove(path).catch(() => undefined);
    throw error;
  }
  if (old) {
    await fs.remove(old).catch(() => undefined);
    await fs.remove(old.replace(/\.jpg$/, '.thumb.jpg')).catch(() => undefined);
  }
}

/** Deletes the files of purged cards (call AFTER purgeDeleted committed). Missing files are fine. */
export async function removeCardFiles(fs: FileOps, cardIds: readonly string[], files: readonly string[]): Promise<void> {
  for (const f of files) await fs.remove(f).catch(() => undefined);
  for (const id of cardIds) {
    await fs.remove(sidePaths(id, 'front').thumb).catch(() => undefined);
    await fs.remove(sidePaths(id, 'back').thumb).catch(() => undefined);
    await fs.remove(cardDir(id)).catch(() => undefined);
  }
}

export type SweepPlan = { orphanFolders: string[]; brokenDrafts: string[] };

/**
 * Start-up sweep: card folders without a row are removed; DRAFT rows whose image file never arrived are removed
 * (paste/manual drafts have no image and are kept).
 * A checked card is never removed by the sweep (a missing image is shown as missing, the data is the user's).
 */
export function planSweep(folders: readonly string[], rows: readonly { id: string; status: 'draft' | 'checked'; files: string[] }[], existing: ReadonlySet<string>, inFlight: ReadonlySet<string> = new Set()): SweepPlan {
  // a card whose files are moved but whose row is not committed yet looks exactly like an orphan: the capture queue's
  // in-flight ids are never swept (review S15; P7 also runs the sweep BEFORE the queue starts)
  const ids = new Set(rows.map((r) => r.id));
  return {
    orphanFolders: folders.filter((f) => !ids.has(f) && !inFlight.has(f)).map((f) => `${CARDS_DIR}/${f}`),
    brokenDrafts: rows.filter((r) => r.status === 'draft' && !inFlight.has(r.id) && r.files.some((f) => !existing.has(f))).map((r) => r.id),
  };
}
