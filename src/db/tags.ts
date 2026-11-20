// Tags: many-to-many with cards; names unique case-insensitively (SPEC §4.2).
import { newId } from '@/lib/id';

import { rewriteSearch } from './search';
import { withRead, withTransaction } from './tx';
import type { Db } from './types';

export type Tag = { id: string; name: string; cards: number };

const clean = (name: string) => name.replace(/\s+/g, ' ').trim();

async function ensureTag(tx: Db, name: string, now: number): Promise<string> {
  const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM tags WHERE name = ?', name);
  if (existing) return existing.id;
  const id = newId(now);
  await tx.runAsync('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', id, name, now);
  return id;
}

/** Replaces the card's tags with these names (created when new; empty names ignored; duplicates folded). */
export async function setCardTags(db: Db, cardId: string, names: readonly string[], now = Date.now()): Promise<void> {
  await withTransaction(db, async (tx) => {
    await tx.runAsync('DELETE FROM card_tags WHERE card_id = ?', cardId);
    const seen = new Set<string>();
    for (const raw of names) {
      const name = clean(raw);
      if (name === '' || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const tagId = await ensureTag(tx, name, now);
      await tx.runAsync('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', cardId, tagId);
    }
    await tx.runAsync('UPDATE cards SET updated_at = ? WHERE id = ?', now, cardId);
    await rewriteSearch(tx, cardId);
  });
}

/** Adds one tag to many cards (multi-select "Tag"). */
export async function addTagToCards(db: Db, cardIds: readonly string[], name: string, now = Date.now()): Promise<void> {
  const n = clean(name);
  if (n === '') return;
  await withTransaction(db, async (tx) => {
    const tagId = await ensureTag(tx, n, now);
    for (const id of cardIds) {
      await tx.runAsync('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', id, tagId);
      await rewriteSearch(tx, id);
    }
  });
}

export async function listTags(db: Db): Promise<Tag[]> {
  return withRead(db, (r) =>
    r.getAllAsync<Tag>(
      `SELECT t.id, t.name,
              (SELECT COUNT(*) FROM card_tags ct JOIN cards c ON c.id = ct.card_id
                WHERE ct.tag_id = t.id AND c.deleted_at IS NULL AND c.is_mine = 0) AS cards
         FROM tags t ORDER BY t.name COLLATE NOCASE`
    )
  );
}

export async function cardTags(db: Db, cardId: string): Promise<string[]> {
  const rows = await withRead(db, (r) =>
    r.getAllAsync<{ name: string }>('SELECT t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = ? ORDER BY t.name COLLATE NOCASE', cardId)
  );
  return rows.map((r) => r.name);
}

export async function deleteTag(db: Db, id: string): Promise<void> {
  await withTransaction(db, async (tx) => {
    const cards = await tx.getAllAsync<{ card_id: string }>('SELECT card_id FROM card_tags WHERE tag_id = ?', id);
    await tx.runAsync('DELETE FROM card_tags WHERE tag_id = ?', id);
    await tx.runAsync('DELETE FROM tags WHERE id = ?', id);
    for (const c of cards) await rewriteSearch(tx, c.card_id);
  });
}
