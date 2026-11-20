import { withTransaction } from './tx';
import type { Db } from './types';

// Append-only. Never edit a migration that has shipped; add a new one instead.
//
// FOREIGN-KEY TRAP (review S14): the app opens the database with `PRAGMA foreign_keys = ON`, and every migration runs
// inside a transaction, where that pragma cannot be switched off. The usual SQLite table rebuild (CREATE new → copy →
// DROP old → RENAME) on a PARENT table therefore fires its ON DELETE actions: rebuilding `cards` would delete every
// `card_fields`/`card_sides`/`card_tags` row (CASCADE), rebuilding `events` would set every card's `event_id` to NULL.
// `migrate()` refuses such a migration (`parentTableRebuilds`) and the test suite checks MIGRATIONS. To change a parent
// table, use ALTER TABLE … ADD COLUMN / RENAME COLUMN, or rebuild the CHILD tables instead.
export const MIGRATIONS: string[] = [
  `CREATE TABLE items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   );
   CREATE TABLE settings (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
  // 2 — business card library (SPEC §4.2, P1). The template's demo table `items` stays until P7 replaces its screens
  // (D26: files are repurposed, never deleted); a later migration drops it.
  `CREATE TABLE events (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
     starts_on TEXT NULL CHECK (starts_on IS NULL OR starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
     created_at INTEGER NOT NULL
   );
   CREATE TABLE cards (
     id TEXT PRIMARY KEY NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('draft','checked')),
     is_mine INTEGER NOT NULL DEFAULT 0 CHECK (is_mine IN (0,1)),
     source TEXT NOT NULL CHECK (source IN ('scan','photo','paste','qr','manual')),
     event_id TEXT NULL REFERENCES events(id) ON DELETE SET NULL,
     met_on TEXT NULL CHECK (met_on IS NULL OR met_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
     met_where TEXT NULL,
     notes TEXT NULL,
     follow_up_at INTEGER NULL,
     follow_up_notification TEXT NULL,
     contact_state TEXT NOT NULL DEFAULT 'none' CHECK (contact_state IN ('none','form_saved','created','updated')),
     contact_id TEXT NULL,
     contact_saved_at INTEGER NULL,
     extractor_version TEXT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     checked_at INTEGER NULL,
     deleted_at INTEGER NULL,
     CHECK (status = 'checked' OR checked_at IS NULL)
   );
   CREATE UNIQUE INDEX cards_one_mine ON cards(is_mine) WHERE is_mine = 1;
   CREATE INDEX cards_list ON cards(deleted_at, status, created_at);
   CREATE INDEX cards_event ON cards(event_id);
   CREATE INDEX cards_follow_up ON cards(follow_up_at) WHERE follow_up_at IS NOT NULL;
   CREATE TABLE card_sides (
     card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     side TEXT NOT NULL CHECK (side IN ('front','back')),
     image_file TEXT NOT NULL,
     w INTEGER NOT NULL CHECK (w > 0),
     h INTEGER NOT NULL CHECK (h > 0),
     rotation INTEGER NOT NULL DEFAULT 0 CHECK (rotation IN (0,90,180,270)),
     ocr_state TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_state IN ('pending','done','empty','failed','unsupported')),
     ocr_engine TEXT NULL,
     ocr_langs TEXT NULL,
     ocr_error TEXT NULL,
     ocr_json TEXT NULL,
     qr_json TEXT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (card_id, side)
   );
   CREATE TABLE card_fields (
     id TEXT PRIMARY KEY NOT NULL,
     card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('name','other_name','company','department','title','phone','email','url','social','address')),
     label TEXT NULL,
     value TEXT NOT NULL,
     normalized TEXT NULL,
     raw TEXT NULL,
     confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low','user')),
     source_lines TEXT NULL,
     position INTEGER NOT NULL,
     edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0,1))
   );
   CREATE INDEX card_fields_card ON card_fields(card_id, position);
   CREATE INDEX card_fields_match ON card_fields(kind, normalized);
   CREATE TABLE tags (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
     created_at INTEGER NOT NULL
   );
   CREATE TABLE card_tags (
     card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
     PRIMARY KEY (card_id, tag_id)
   );
   CREATE INDEX card_tags_tag ON card_tags(tag_id);
   CREATE VIRTUAL TABLE search_fts USING fts5(card_id UNINDEXED, body, tokenize='trigram');`,
  // 3 — P8: the template demo table goes (D26 → D47; nothing references it). Follow-ups keep the wall-clock time the
  // user chose ("2026-10-19T09:00", D48), so a time-zone change moves the reminder to 09:00 where the user is now.
  `DROP TABLE IF EXISTS items;
   ALTER TABLE cards ADD COLUMN follow_up_local TEXT NULL
     CHECK (follow_up_local IS NULL OR follow_up_local GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]');`,
];

export const LATEST_VERSION = MIGRATIONS.length;

/** Tables that other tables reference (REFERENCES x), over all migrations given. */
export function parentTables(migrations: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const m of migrations) for (const r of m.matchAll(/REFERENCES\s+["`]?(\w+)/gi)) out.add(r[1].toLowerCase());
  return out;
}

/** Statements that drop or rename a parent table (the rebuild pattern that cascades deletes, see the comment above). */
export function parentTableRebuilds(migrations: readonly string[], all: readonly string[] = migrations): string[] {
  const parents = parentTables(all);
  const out: string[] = [];
  for (const m of migrations) {
    for (const r of m.matchAll(/\b(DROP\s+TABLE(?:\s+IF\s+EXISTS)?|ALTER\s+TABLE)\s+["`]?(\w+)["`]?(\s+RENAME\s+TO)?/gi)) {
      const isDrop = /^DROP/i.test(r[1]);
      if (parents.has(r[2].toLowerCase()) && (isDrop || r[3])) out.push(r[0].replace(/\s+/g, ' '));
    }
  }
  return out;
}

export async function migrate(db: Db, migrations: string[] = MIGRATIONS): Promise<void> {
  // The version is read INSIDE each unit: another JS handle on the same connection (e.g. a background task at a cold
  // start) may have migrated meanwhile, and a migration must never run twice. One transaction per migration: a
  // failure rolls back both the schema change and user_version.
  for (;;) {
    const applied = await withTransaction(db, async (tx) => {
      const row = await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      const version = row?.user_version ?? 0;
      if (version >= migrations.length) return false;
      const unsafe = parentTableRebuilds([migrations[version]], migrations);
      if (unsafe.length) throw new Error(`migration ${version + 1} rebuilds a referenced table (${unsafe.join('; ')}): with foreign keys on this deletes or nulls child rows`);
      await tx.execAsync(`${migrations[version]} PRAGMA user_version = ${version + 1};`);
      return true;
    });
    if (!applied) return;
  }
}
