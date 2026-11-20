// The app's ONE JS database wrapper per JS context (found in warranty-wallet, decision D118).
//
// expo-sqlite gives every `openDatabaseAsync('app.db')` the SAME cached native connection under a NEW JS wrapper, and on
// Android a wrapper that is garbage-collected closes that shared native connection (no reference count), leaving every
// other wrapper dead. So the UI (`DatabaseProvider`), background tasks and every other caller share this one wrapper,
// held for the lifetime of the JS context and never closed. Do not call `openDatabaseAsync` or use expo-sqlite's
// `SQLiteProvider` anywhere else (`connection.test.ts` scans src/).
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'app.db';

let opened: Promise<SQLiteDatabase> | null = null;

/**
 * Connection settings, run once right after the open and before anyone else holds the handle (not a data write, so not
 * through the write queue): SQLite enforces REFERENCES / ON DELETE only with foreign_keys on, per connection (Node's
 * test database has it on by default, so tests and the app behave alike).
 */
async function configure(db: SQLiteDatabase): Promise<SQLiteDatabase> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  return db;
}

/** The app's handle: opened once, kept forever. A failed open is forgotten so the next call tries again. */
export function appDatabase(): Promise<SQLiteDatabase> {
  if (!opened) {
    opened = openDatabaseAsync(DATABASE_NAME).then(configure);
    opened.catch(() => {
      opened = null;
    });
  }
  return opened;
}
