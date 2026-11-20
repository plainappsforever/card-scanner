// The rating prompt (redesign R1): asked once per app version, only after real use: the fifth card saved to Contacts.
// Never during a scan and never on a first launch (nobody has five saved cards then). The home screen calls this when it
// comes into focus and no scan is running. The "asked in version X" flag lives in the settings table only; this app has no
// backup file that carries settings, and the flag is not part of any export.
import { getSetting, setSetting } from '@/db/settings';
import { withRead } from '@/db/tx';
import type { Db } from '@/db/types';

export const REVIEW_AFTER_SAVED = 5;
const KEY = 'review_asked_version';

/** Cards that went into Contacts (system form, bulk create or update); deleted cards do not count. */
export async function savedToContactsCount(db: Db): Promise<number> {
  const row = await withRead(db, (r) =>
    r.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM cards WHERE deleted_at IS NULL AND is_mine = 0 AND contact_state <> 'none'")
  );
  return row?.n ?? 0;
}

/** True when the prompt is due: enough saved cards and not yet asked in this version. */
export async function reviewDue(db: Db, version: string): Promise<boolean> {
  if ((await getSetting(db, KEY)) === version) return false;
  return (await savedToContactsCount(db)) >= REVIEW_AFTER_SAVED;
}

/** Asks at most once per version. `ask` is the system prompt (expo-store-review); it may refuse silently. Returns whether it asked. */
export async function maybeAskForReview(db: Db, version: string, ask: () => Promise<void>, scanning = false): Promise<boolean> {
  if (scanning || !(await reviewDue(db, version))) return false;
  // the flag first: if the system sheet crashes or is dismissed, the person is still not asked twice
  await setSetting(db, KEY, version);
  await ask().catch(() => undefined);
  return true;
}
