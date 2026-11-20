// Events ("Hannover Messe 2026"): the active event is applied to every new scan until switched off (SPEC §7.8, D20).
import { newId } from '@/lib/id';

import { cardsChanged } from './changes';
import { rewriteSearch } from './search';
import { getSetting, setSetting } from './settings';
import { withRead, withTransaction, withWrite } from './tx';
import type { Db } from './types';

export type CardEvent = { id: string; name: string; startsOn: string | null; createdAt: number; cards: number };
type Row = { id: string; name: string; starts_on: string | null; created_at: number; cards: number };

export const CURRENT_EVENT_KEY = 'current_event_id';

const clean = (name: string) => name.replace(/\s+/g, ' ').trim();

/** Creates an event, or returns the existing one with the same name (case-insensitive). */
export async function createEvent(db: Db, name: string, opts: { startsOn?: string | null; id?: string; now?: number } = {}): Promise<string> {
  const n = clean(name);
  if (n === '') throw new Error('event name is empty');
  const now = opts.now ?? Date.now();
  return withTransaction(db, async (tx) => {
    const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM events WHERE name = ?', n);
    if (existing) return existing.id;
    const id = opts.id ?? newId(now);
    await tx.runAsync('INSERT INTO events (id, name, starts_on, created_at) VALUES (?, ?, ?, ?)', id, n, opts.startsOn ?? null, now);
    return id;
  });
}

export async function renameEvent(db: Db, id: string, name: string): Promise<void> {
  const n = clean(name);
  if (n === '') throw new Error('event name is empty');
  await withTransaction(db, async (tx) => {
    await tx.runAsync('UPDATE events SET name = ? WHERE id = ?', n, id);
    const cards = await tx.getAllAsync<{ id: string }>('SELECT id FROM cards WHERE event_id = ?', id);
    for (const c of cards) await rewriteSearch(tx, c.id);
  });
  cardsChanged(); // the reminder text names the event
}

/** Deletes the event; its cards keep everything else (event_id → NULL). Clears it as the current event. */
export async function deleteEvent(db: Db, id: string): Promise<void> {
  await withTransaction(db, async (tx) => {
    const cards = await tx.getAllAsync<{ id: string }>('SELECT id FROM cards WHERE event_id = ?', id);
    await tx.runAsync('UPDATE cards SET event_id = NULL WHERE event_id = ?', id);
    await tx.runAsync('DELETE FROM events WHERE id = ?', id);
    if ((await getSetting(tx, CURRENT_EVENT_KEY)) === id) await tx.runAsync('DELETE FROM settings WHERE key = ?', CURRENT_EVENT_KEY);
    for (const c of cards) await rewriteSearch(tx, c.id);
  });
  cardsChanged(); // the reminder text names the event
}

/** Newest first, with the number of (not deleted, not "my card") cards. */
export async function listEvents(db: Db): Promise<CardEvent[]> {
  const rows = await withRead(db, (r) =>
    r.getAllAsync<Row>(
      `SELECT e.id, e.name, e.starts_on, e.created_at,
              (SELECT COUNT(*) FROM cards c WHERE c.event_id = e.id AND c.deleted_at IS NULL AND c.is_mine = 0) AS cards
         FROM events e ORDER BY e.created_at DESC, e.name`
    )
  );
  return rows.map((r) => ({ id: r.id, name: r.name, startsOn: r.starts_on, createdAt: r.created_at, cards: r.cards }));
}

/** The event new scans get, or null. A stale id (event deleted elsewhere) reads as null. */
export async function getCurrentEvent(db: Db): Promise<CardEvent | null> {
  const id = await getSetting(db, CURRENT_EVENT_KEY);
  if (!id) return null;
  return (await listEvents(db)).find((e) => e.id === id) ?? null;
}

export async function setCurrentEvent(db: Db, id: string | null): Promise<void> {
  if (id === null) {
    await withWrite(db, (tx) => tx.runAsync('DELETE FROM settings WHERE key = ?', CURRENT_EVENT_KEY));
    return;
  }
  await setSetting(db, CURRENT_EVENT_KEY, id);
}
