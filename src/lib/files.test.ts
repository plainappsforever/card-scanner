/**
 * @jest-environment node
 */
import { createTestDb } from '../../test/node-sqlite-db';
import { deleteCards, getCard, purgeDeleted, sweepInput } from '@/db/cards';
import { migrate } from '@/db/migrations';

import { cardDir, planSweep, removeCardFiles, replaceSide, sidePaths, storeNewCard, type FileOps } from './files';

/** In-memory file system with injectable failures. */
function fakeFs(fail: { move?: (from: string, to: string) => boolean } = {}) {
  const files = new Set<string>(['tmp/a.jpg', 'tmp/a.thumb.jpg', 'tmp/b.jpg']);
  const dirs = new Set<string>();
  const log: string[] = [];
  const ops: FileOps = {
    async move(from, to) {
      if (fail.move?.(from, to)) throw new Error(`disk full moving ${from}`);
      if (!files.has(from)) throw new Error(`missing ${from}`);
      files.delete(from);
      files.add(to);
      log.push(`move ${from} → ${to}`);
    },
    async remove(path) {
      files.delete(path);
      dirs.delete(path);
      log.push(`remove ${path}`);
    },
    async exists(path) {
      return files.has(path) || dirs.has(path);
    },
    async makeDir(path) {
      dirs.add(path);
    },
  };
  return { ops, files, dirs, log };
}

async function freshDb() {
  const db = createTestDb();
  await migrate(db);
  return db;
}

const sides = [
  { side: 'front' as const, temp: 'tmp/a.jpg', thumbTemp: 'tmp/a.thumb.jpg', w: 1600, h: 900 },
  { side: 'back' as const, temp: 'tmp/b.jpg', w: 1600, h: 900 },
];

describe('files then rows (SPEC §4.1)', () => {
  it('moves the images into the card folder BEFORE the rows are inserted', async () => {
    const fs = fakeFs();
    const db = await freshDb();
    await storeNewCard(fs.ops, db, { id: 'c1', source: 'scan' }, sides);
    expect(fs.log).toEqual(['move tmp/a.jpg → cards/c1/front.jpg', 'move tmp/a.thumb.jpg → cards/c1/front.thumb.jpg', 'move tmp/b.jpg → cards/c1/back.jpg']);
    const card = await getCard(db, 'c1');
    expect(card?.sides.map((s) => s.imageFile)).toEqual(['cards/c1/front.jpg', 'cards/c1/back.jpg']);
  });

  it('a failed move (disk full) creates no rows and takes back what this call moved', async () => {
    const fs = fakeFs({ move: (from) => from === 'tmp/b.jpg' });
    const db = await freshDb();
    await expect(storeNewCard(fs.ops, db, { id: 'c1', source: 'scan' }, sides)).rejects.toThrow(/disk full/);
    expect(await getCard(db, 'c1')).toBeNull();
    expect(fs.files.has('cards/c1/front.jpg')).toBe(false);
    expect(fs.files.has('tmp/b.jpg')).toBe(true); // the unmoved temp is the capture code's to clean
  });

  it('a failed transaction leaves files without rows — the sweep removes that folder', async () => {
    const fs = fakeFs();
    const db = await freshDb();
    await expect(storeNewCard(fs.ops, db, { id: 'c1', source: 'scan', eventId: 'no-such-event' }, sides)).rejects.toThrow(/FOREIGN KEY/);
    expect(await getCard(db, 'c1')).toBeNull();
    expect(fs.files.has('cards/c1/front.jpg')).toBe(true);
    const plan = planSweep(['c1'], await sweepInput(db), fs.files);
    expect(plan).toEqual({ orphanFolders: ['cards/c1'], brokenDrafts: [] });
  });

  it('deletion: rows first, files after; a crash between leaves only orphan files', async () => {
    const fs = fakeFs();
    const db = await freshDb();
    await storeNewCard(fs.ops, db, { id: 'c1', source: 'scan' }, sides);
    await deleteCards(db, ['c1'], 10);
    expect(fs.files.has('cards/c1/front.jpg')).toBe(true); // undo window: files kept
    const purged = await purgeDeleted(db, 10);
    // "crash" here: rows are gone, files remain → the next start-up sweep finds a folder without a row
    expect(planSweep(['c1'], await sweepInput(db), fs.files).orphanFolders).toEqual(['cards/c1']);
    await removeCardFiles(fs.ops, purged.cardIds, purged.files);
    expect([...fs.files].filter((f) => f.startsWith('cards/'))).toEqual([]);
  });

  it('the sweep removes drafts whose image never arrived, never checked cards, never paste drafts', () => {
    const rows = [
      { id: 'd1', status: 'draft' as const, files: ['cards/d1/front.jpg'] },
      { id: 'k1', status: 'checked' as const, files: ['cards/k1/front.jpg'] },
      { id: 'p1', status: 'draft' as const, files: [] },
    ];
    expect(planSweep(['d1', 'k1', 'x9'], rows, new Set())).toEqual({ orphanFolders: ['cards/x9'], brokenDrafts: ['d1'] });
  });

  it('paths are relative and card ids cannot escape the cards folder', () => {
    expect(sidePaths('c1', 'back')).toEqual({ image: 'cards/c1/back.jpg', thumb: 'cards/c1/back.thumb.jpg' });
    expect(() => cardDir('../x')).toThrow(/unsafe/);
  });
});

describe('replacing a side and the sweep during a running capture (review S15)', () => {
  it('a replaced side goes to a unique path; the old image is removed only after the row committed', async () => {
    const fs = fakeFs();
    const db = await freshDb();
    await storeNewCard(fs.ops, db, { id: 'c1', source: 'scan' }, [sides[0]]);
    fs.files.add('tmp/new.jpg');
    await replaceSide(fs.ops, db, 'c1', { side: 'front', temp: 'tmp/new.jpg', w: 1600, h: 900 }, 5000);
    expect((await getCard(db, 'c1'))?.sides.map((s) => s.imageFile)).toEqual(['cards/c1/front-5000.jpg']);
    expect(fs.files.has('cards/c1/front-5000.jpg')).toBe(true);
    expect(fs.files.has('cards/c1/front.jpg')).toBe(false);
    const order = fs.log.filter((l) => /front/.test(l));
    expect(order.indexOf('move tmp/new.jpg → cards/c1/front-5000.jpg')).toBeLessThan(order.indexOf('remove cards/c1/front.jpg'));
  });

  it('a failed transaction keeps the old side and removes the new file', async () => {
    const fs = fakeFs();
    const db = await freshDb();
    await storeNewCard(fs.ops, db, { id: 'c1', source: 'scan' }, [sides[0]]);
    fs.files.add('tmp/new.jpg');
    await expect(replaceSide(fs.ops, db, 'missing-card', { side: 'front', temp: 'tmp/new.jpg', w: 1, h: 1 }, 6000)).rejects.toThrow();
    expect(fs.files.has('cards/c1/front.jpg')).toBe(true);
    expect(fs.files.has('cards/missing-card/front-6000.jpg')).toBe(false);
  });

  it('the sweep never touches a card that is still being stored', () => {
    const plan = planSweep(['c1', 'c2'], [{ id: 'd1', status: 'draft', files: ['cards/d1/front.jpg'] }], new Set(), new Set(['c2', 'd1']));
    expect(plan).toEqual({ orphanFolders: ['cards/c1'], brokenDrafts: [] });
  });
});
