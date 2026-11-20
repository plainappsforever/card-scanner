// Scratch table for the write-queue tests (tx.test.ts). The app's schema no longer has the template's `items` table
// (migration 3, D47); the file is kept because files are never deleted (owner rule) and the tests need a plain table
// without the card schema's CHECKs. Never imported by app code.
import { withRead, withWrite } from './tx';
import type { Db } from './types';

export type Item = { id: number; title: string; note: string; createdAt: number };
export type ItemInput = { title: string; note: string };

type ItemRow = { id: number; title: string; note: string; created_at: number };

/** Creates the scratch table (tests only). */
export async function createScratchItems(db: Db): Promise<void> {
  await withWrite(db, (tx) =>
    tx.execAsync(`CREATE TABLE IF NOT EXISTS items (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       note TEXT NOT NULL DEFAULT '',
       created_at INTEGER NOT NULL
     );`)
  );
}

export async function listItems(db: Db): Promise<Item[]> {
  const rows = await withRead(db, (r) =>
    r.getAllAsync<ItemRow>('SELECT id, title, note, created_at FROM items ORDER BY created_at DESC, id DESC')
  );
  return rows.map((row) => ({ id: row.id, title: row.title, note: row.note, createdAt: row.created_at }));
}

export async function addItem(db: Db, input: ItemInput, now = Date.now()): Promise<number> {
  return withWrite(db, async (tx) => {
    const result = await tx.runAsync('INSERT INTO items (title, note, created_at) VALUES (?, ?, ?)', input.title, input.note, now);
    return result.lastInsertRowId;
  });
}
