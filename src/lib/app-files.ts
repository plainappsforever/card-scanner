// expo-file-system implementation of `FileOps` (src/lib/files.ts) and the app's folders (SPEC §4.1). Paths in the
// database are RELATIVE to the documents folder. Offscan lessons applied: copySync/moveSync (expo-file-system 57's
// copy()/move() return promises — un-awaited they raced the next native call), and the start-up sweep never touches
// what THIS process created (`born`), because a card folder exists before its row (files-then-rows).
import { Directory, File, Paths } from 'expo-file-system';

import { emptyDraftIds, purgeDeleted, removeBrokenDrafts, sweepInput } from '@/db/cards';
import type { Db } from '@/db/types';
import { newId as rowId } from '@/lib/id';

import { CARDS_DIR, planSweep, removeCardFiles, type FileOps } from './files';

const born = new Set<string>();
const PROCESS_START = Date.now();

/** A card id made by this process (never swept while the process runs). */
export function newCardId(): string {
  const id = rowId();
  born.add(id);
  return id;
}

/** file:// URI of a path relative to the documents folder (an absolute URI is returned unchanged). */
export const uriOf = (rel: string) => (rel.includes('://') ? rel : new File(Paths.document, rel).uri);

function dir(parent: Directory, name: string): Directory {
  const d = new Directory(parent, name);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}
export const incomingDir = () => dir(Paths.cache, 'incoming');
export const exportsDir = () => dir(Paths.cache, 'exports');
/** A fresh temp file URI in the incoming folder. */
export const incomingUri = (ext = 'jpg') => new File(incomingDir(), `${rowId()}.${ext}`).uri;

export const appFs: FileOps = {
  async move(from, to) {
    const dest = new File(Paths.document, to);
    const parent = dest.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true });
    if (dest.exists) dest.delete();
    new File(uriOf(from)).moveSync(dest);
  },
  async remove(path) {
    const f = new File(uriOf(path));
    if (f.exists) {
      f.delete();
      return;
    }
    const d = new Directory(uriOf(path));
    if (d.exists) d.delete();
  },
  async exists(path) {
    return new File(uriOf(path)).exists || new Directory(uriOf(path)).exists;
  },
  async makeDir(path) {
    const d = new Directory(Paths.document, path);
    if (!d.exists) d.create({ intermediates: true });
  },
};

/**
 * Start-up sweep (SPEC §4.1): card folders without a row and drafts whose image never arrived go; files of earlier
 * runs in the incoming/export caches go. Runs BEFORE the OCR queue starts. Only the app's own files.
 */
export async function sweepFiles(db: Db): Promise<{ folders: number; drafts: number }> {
  const rows = await sweepInput(db);
  const cardsDir = new Directory(Paths.document, CARDS_DIR);
  const folders = cardsDir.exists ? cardsDir.list().filter((e) => e instanceof Directory).map((e) => e.name) : [];
  const existing = new Set<string>();
  for (const r of rows) for (const f of r.files) if (new File(Paths.document, f).exists) existing.add(f);
  const plan = planSweep(folders, rows, existing, born);
  for (const f of plan.orphanFolders) await appFs.remove(f).catch(() => undefined);
  if (plan.brokenDrafts.length) await removeBrokenDrafts(db, plan.brokenDrafts);
  const empty = await emptyDraftIds(db);
  if (empty.length) await removeBrokenDrafts(db, empty);
  for (const d of [new Directory(Paths.cache, 'incoming'), new Directory(Paths.cache, 'exports')]) {
    if (!d.exists) continue;
    for (const e of d.list()) {
      const t = e.info().modificationTime;
      if (t !== undefined && t !== null && t < PROCESS_START) e.delete();
    }
  }
  return { folders: plan.orphanFolders.length, drafts: plan.brokenDrafts.length };
}

/** The undo snack's lifetime on the Cards screen; a card deleted longer ago is gone for good at the next purge. */
export const UNDO_MS = 8_000;

/**
 * Cards deleted more than `graceMs` ago are removed for good: rows first, their image files after the commit (SPEC
 * §4.1). Runs at start, on every return to the foreground and when the undo snack expires (REVIEW_V1 M1: nothing
 * called `purgeDeleted` before — deleted cards and their images stayed on the phone forever).
 */
export async function purgeExpired(db: Db, graceMs = 60_000, now = Date.now()): Promise<number> {
  const { cardIds, files } = await purgeDeleted(db, now - graceMs);
  if (cardIds.length) await removeCardFiles(appFs, cardIds, files);
  return cardIds.length;
}
