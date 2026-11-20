// Cards, sides and fields (SPEC §4.2). Writes in one transaction each (template rules), reads through withRead.
// Files-then-rows (SPEC §4.1, Offscan D28): image files are already at their final paths when createCard runs
// (src/lib/files.ts moves them first); rows are removed for good BEFORE their files (purgeDeleted returns the paths).
// `draft` cards ("To check") are never exported, bulk-saved or matched as the library's truth (L26, D17); the
// `is_mine` card never appears in lists, exports or matching.
import type { ContactCard } from '@/engine/contact';
import { cardTitle, sortCards, type SortOrder } from '@/engine/format';
import type { StoredCard } from '@/engine/match';
import { newId } from '@/lib/id';

import { cardsChanged } from './changes';
import { contactFromFields, type CardField, type FieldInput } from './fields';
import { rewriteSearch, searchCardIds } from './search';
import { withRead, withTransaction } from './tx';
import type { Db } from './types';

export type CardStatus = 'draft' | 'checked';
export type CardSource = 'scan' | 'photo' | 'paste' | 'qr' | 'manual';
export type ContactState = 'none' | 'form_saved' | 'created' | 'updated';
export type SideName = 'front' | 'back';
export type OcrState = 'pending' | 'done' | 'empty' | 'failed' | 'unsupported';

export type SideInput = { side: SideName; imageFile: string; w: number; h: number; rotation?: 0 | 90 | 180 | 270; qrJson?: string | null };
export type CardSide = Required<Omit<SideInput, 'qrJson'>> & {
  qrJson: string | null;
  ocrState: OcrState;
  ocrEngine: string | null;
  ocrLangs: string | null;
  ocrError: string | null;
  ocrJson: string | null;
  createdAt: number;
};

export type NewCard = {
  id?: string;
  source: CardSource;
  status?: CardStatus;
  isMine?: boolean;
  eventId?: string | null;
  metOn?: string | null;
  metWhere?: string | null;
  notes?: string | null;
  extractorVersion?: string | null;
  sides?: SideInput[];
  fields?: FieldInput[];
};

export type Card = {
  id: string;
  status: CardStatus;
  isMine: boolean;
  source: CardSource;
  eventId: string | null;
  eventName: string | null;
  metOn: string | null;
  metWhere: string | null;
  notes: string | null;
  followUpAt: number | null;
  /** Wall-clock time the user chose ("2026-10-19T09:00", D48); null for rows from before migration 3. */
  followUpLocal: string | null;
  followUpNotification: string | null;
  contactState: ContactState;
  contactId: string | null;
  contactSavedAt: number | null;
  extractorVersion: string | null;
  createdAt: number;
  updatedAt: number;
  checkedAt: number | null;
  deletedAt: number | null;
  sides: CardSide[];
  fields: CardField[];
  tags: string[];
  /** The contact these rows describe (with event/notes/tags). */
  contact: ContactCard;
};

type CardRow = {
  id: string;
  status: CardStatus;
  is_mine: number;
  source: CardSource;
  event_id: string | null;
  event_name: string | null;
  met_on: string | null;
  met_where: string | null;
  notes: string | null;
  follow_up_at: number | null;
  follow_up_local: string | null;
  follow_up_notification: string | null;
  contact_state: ContactState;
  contact_id: string | null;
  contact_saved_at: number | null;
  extractor_version: string | null;
  created_at: number;
  updated_at: number;
  checked_at: number | null;
  deleted_at: number | null;
};
type SideRow = {
  card_id: string;
  side: SideName;
  image_file: string;
  w: number;
  h: number;
  rotation: 0 | 90 | 180 | 270;
  ocr_state: OcrState;
  ocr_engine: string | null;
  ocr_langs: string | null;
  ocr_error: string | null;
  ocr_json: string | null;
  qr_json: string | null;
  created_at: number;
};
type FieldRow = {
  id: string;
  card_id: string;
  kind: CardField['kind'];
  label: string | null;
  value: string;
  normalized: string | null;
  raw: string | null;
  confidence: CardField['confidence'];
  source_lines: string | null;
  position: number;
  edited: number;
};

async function insertFields(tx: Db, cardId: string, fields: readonly FieldInput[], now: number): Promise<void> {
  let position = 0;
  for (const f of fields) {
    await tx.runAsync(
      `INSERT INTO card_fields (id, card_id, kind, label, value, normalized, raw, confidence, source_lines, position, edited)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(now),
      cardId,
      f.kind,
      f.label,
      f.value,
      f.normalized,
      f.raw,
      f.confidence,
      f.sourceLines.length ? JSON.stringify(f.sourceLines) : null,
      position++,
      f.edited ? 1 : 0
    );
  }
}

async function insertSide(tx: Db, cardId: string, s: SideInput, now: number): Promise<void> {
  await tx.runAsync(
    'INSERT INTO card_sides (card_id, side, image_file, w, h, rotation, qr_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    cardId,
    s.side,
    s.imageFile,
    s.w,
    s.h,
    s.rotation ?? 0,
    s.qrJson ?? null,
    now
  );
}

/** Inserts a card with its sides and fields in one transaction (its image files must already be in place). */
export async function createCard(db: Db, card: NewCard, now = Date.now()): Promise<string> {
  const id = card.id ?? newId(now);
  const status = card.status ?? 'draft';
  await withTransaction(db, async (tx) => {
    await tx.runAsync(
      `INSERT INTO cards (id, status, is_mine, source, event_id, met_on, met_where, notes, extractor_version, created_at, updated_at, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      status,
      card.isMine ? 1 : 0,
      card.source,
      card.eventId ?? null,
      card.metOn ?? null,
      card.metWhere ?? null,
      card.notes ?? null,
      card.extractorVersion ?? null,
      now,
      now,
      status === 'checked' ? now : null
    );
    for (const s of card.sides ?? []) await insertSide(tx, id, s, now);
    await insertFields(tx, id, card.fields ?? [], now);
    await rewriteSearch(tx, id);
  });
  return id;
}

/** Adds (or replaces) one side, e.g. "Add back side". Returns the replaced image path (delete it after this commits). */
export async function putSide(db: Db, cardId: string, side: SideInput, now = Date.now()): Promise<string | null> {
  return withTransaction(db, async (tx) => {
    const old = await tx.getFirstAsync<{ image_file: string }>('SELECT image_file FROM card_sides WHERE card_id = ? AND side = ?', cardId, side.side);
    await tx.runAsync('DELETE FROM card_sides WHERE card_id = ? AND side = ?', cardId, side.side);
    await insertSide(tx, cardId, side, now);
    await tx.runAsync('UPDATE cards SET updated_at = ? WHERE id = ?', now, cardId);
    await rewriteSearch(tx, cardId);
    return old && old.image_file !== side.imageFile ? old.image_file : null;
  });
}

export type OcrUpdate = { state: OcrState; engine?: string | null; langs?: string | null; error?: string | null; json?: string | null; rotation?: 0 | 90 | 180 | 270; qrJson?: string | null };

/** Stores a side's text-recognition result (state honest: done / empty / failed / unsupported). */
export async function setSideOcr(db: Db, cardId: string, side: SideName, u: OcrUpdate, now = Date.now()): Promise<void> {
  await withTransaction(db, async (tx) => {
    await tx.runAsync(
      `UPDATE card_sides SET ocr_state = ?, ocr_engine = ?, ocr_langs = ?, ocr_error = ?, ocr_json = ?, rotation = COALESCE(?, rotation),
        qr_json = COALESCE(?, qr_json)
        WHERE card_id = ? AND side = ?`,
      u.state,
      u.engine ?? null,
      u.langs ?? null,
      u.error ?? null,
      u.json ?? null,
      u.rotation ?? null,
      u.qrJson ?? null,
      cardId,
      side
    );
    await tx.runAsync('UPDATE cards SET updated_at = ? WHERE id = ?', now, cardId);
    await rewriteSearch(tx, cardId);
  });
}

/** Replaces all fields (Review edits, a new extraction). The card stays in its status. */
export async function replaceFields(db: Db, cardId: string, fields: readonly FieldInput[], opts: { extractorVersion?: string; now?: number } = {}): Promise<void> {
  const now = opts.now ?? Date.now();
  await withTransaction(db, async (tx) => {
    await tx.runAsync('DELETE FROM card_fields WHERE card_id = ?', cardId);
    await insertFields(tx, cardId, fields, now);
    if (opts.extractorVersion !== undefined) await tx.runAsync('UPDATE cards SET extractor_version = ? WHERE id = ?', opts.extractorVersion, cardId);
    await tx.runAsync('UPDATE cards SET updated_at = ? WHERE id = ?', now, cardId);
    await rewriteSearch(tx, cardId);
  });
  cardsChanged();
}

/** "Looks right": the user's confirmation, optionally with the fields as shown. The only way to `checked`. */
export async function confirmCard(db: Db, cardId: string, fields?: readonly FieldInput[], now = Date.now()): Promise<void> {
  await withTransaction(db, async (tx) => {
    if (fields) {
      await tx.runAsync('DELETE FROM card_fields WHERE card_id = ?', cardId);
      await insertFields(tx, cardId, fields, now);
    }
    await tx.runAsync("UPDATE cards SET status = 'checked', checked_at = ?, updated_at = ? WHERE id = ?", now, now, cardId);
    await rewriteSearch(tx, cardId);
  });
  cardsChanged();
}

export type CardMetaUpdate = { eventId?: string | null; metOn?: string | null; metWhere?: string | null; notes?: string | null };

export async function updateCardMeta(db: Db, cardId: string, u: CardMetaUpdate, now = Date.now()): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const col: Record<keyof CardMetaUpdate, string> = { eventId: 'event_id', metOn: 'met_on', metWhere: 'met_where', notes: 'notes' };
  for (const k of Object.keys(col) as (keyof CardMetaUpdate)[]) {
    if (u[k] === undefined) continue;
    const v = u[k];
    sets.push(`${col[k]} = ?`);
    args.push(typeof v === 'string' && v.trim() === '' ? null : (v ?? null));
  }
  if (sets.length === 0) return;
  await withTransaction(db, async (tx) => {
    await tx.runAsync(`UPDATE cards SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...args, now, cardId);
    await rewriteSearch(tx, cardId);
  });
  cardsChanged();
}

/** Sets one event on many cards (multi-select "Event"). */
export async function setEventForCards(db: Db, cardIds: readonly string[], eventId: string | null, now = Date.now()): Promise<void> {
  await withTransaction(db, async (tx) => {
    for (const id of cardIds) {
      await tx.runAsync('UPDATE cards SET event_id = ?, updated_at = ? WHERE id = ?', eventId, now, id);
      await rewriteSearch(tx, id);
    }
  });
  cardsChanged();
}

/** Follow-up reminder: time (ms), its wall-clock stamp (D48) and the scheduled notification's id; null clears all. */
export async function setFollowUp(db: Db, cardId: string, at: number | null, notificationId: string | null = null, local: string | null = null, now = Date.now()): Promise<void> {
  await withTransaction(db, (tx) =>
    tx.runAsync(
      'UPDATE cards SET follow_up_at = ?, follow_up_local = ?, follow_up_notification = ?, updated_at = ? WHERE id = ?',
      at,
      at === null ? null : local,
      at === null ? null : notificationId,
      now,
      cardId
    )
  );
  cardsChanged();
}

/**
 * The reconciler's write (src/lib/reminders.ts): the due time in today's zone and the notification now scheduled for
 * it. Does NOT signal a change (it is the answer to one) and leaves `updated_at` alone; skipped for a cleared follow-up.
 */
export async function setFollowUpScheduled(db: Db, cardId: string, at: number, notificationId: string | null): Promise<void> {
  await withTransaction(db, (tx) =>
    tx.runAsync('UPDATE cards SET follow_up_at = ?, follow_up_notification = ? WHERE id = ? AND follow_up_at IS NOT NULL', at, notificationId, cardId)
  );
}

export type FollowUp = { cardId: string; at: number; local: string | null; notificationId: string | null; title: string; company: string; event: string | null };

/** Live cards with a follow-up (input of reminder-plan `reconcile`). */
export async function listFollowUps(db: Db): Promise<FollowUp[]> {
  const ids = await withRead(db, (r) =>
    r.getAllAsync<{ id: string }>('SELECT id FROM cards WHERE follow_up_at IS NOT NULL AND deleted_at IS NULL AND is_mine = 0 ORDER BY follow_up_at')
  );
  const out: FollowUp[] = [];
  for (const { id } of ids) {
    const c = await getCard(db, id);
    if (!c || c.followUpAt === null) continue;
    out.push({ cardId: id, at: c.followUpAt, local: c.followUpLocal, notificationId: c.followUpNotification, title: cardTitle(c.contact), company: c.contact.company ?? '', event: c.eventName });
  }
  return out;
}

export async function setContactState(db: Db, cardId: string, state: ContactState, contactId: string | null = null, now = Date.now()): Promise<void> {
  await withTransaction(db, (tx) =>
    tx.runAsync(
      'UPDATE cards SET contact_state = ?, contact_id = COALESCE(?, contact_id), contact_saved_at = ?, updated_at = ? WHERE id = ?',
      state,
      contactId,
      state === 'none' ? null : now,
      now,
      cardId
    )
  );
}

/** Soft delete (undo window): rows and files stay until purgeDeleted. */
export async function deleteCards(db: Db, cardIds: readonly string[], now = Date.now()): Promise<void> {
  await withTransaction(db, async (tx) => {
    for (const id of cardIds) await tx.runAsync('UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', now, now, id);
  });
  cardsChanged();
}

export async function restoreCards(db: Db, cardIds: readonly string[], now = Date.now()): Promise<void> {
  await withTransaction(db, async (tx) => {
    for (const id of cardIds) await tx.runAsync('UPDATE cards SET deleted_at = NULL, updated_at = ? WHERE id = ?', now, id);
  });
  cardsChanged();
}

/**
 * Removes cards deleted at or before `before` for good and returns their image files — the caller deletes the files
 * only AFTER this commits (a crash in between leaves orphan files that the start-up sweep removes, never rows without files).
 */
export async function purgeDeleted(db: Db, before: number): Promise<{ cardIds: string[]; files: string[] }> {
  return withTransaction(db, async (tx) => {
    const cards = await tx.getAllAsync<{ id: string }>('SELECT id FROM cards WHERE deleted_at IS NOT NULL AND deleted_at <= ?', before);
    const files: string[] = [];
    for (const { id } of cards) {
      const sides = await tx.getAllAsync<{ image_file: string }>('SELECT image_file FROM card_sides WHERE card_id = ?', id);
      files.push(...sides.map((s) => s.image_file));
      // Children explicitly (also correct if a connection ever runs without foreign_keys).
      await tx.runAsync('DELETE FROM card_fields WHERE card_id = ?', id);
      await tx.runAsync('DELETE FROM card_sides WHERE card_id = ?', id);
      await tx.runAsync('DELETE FROM card_tags WHERE card_id = ?', id);
      await tx.runAsync('DELETE FROM search_fts WHERE card_id = ?', id);
      await tx.runAsync('DELETE FROM cards WHERE id = ?', id);
    }
    return { cardIds: cards.map((c) => c.id), files };
  });
}

function sideOf(r: SideRow): CardSide {
  return {
    side: r.side,
    imageFile: r.image_file,
    w: r.w,
    h: r.h,
    rotation: r.rotation,
    qrJson: r.qr_json,
    ocrState: r.ocr_state,
    ocrEngine: r.ocr_engine,
    ocrLangs: r.ocr_langs,
    ocrError: r.ocr_error,
    ocrJson: r.ocr_json,
    createdAt: r.created_at,
  };
}

function fieldOf(r: FieldRow): CardField {
  let sourceLines: string[] = [];
  try {
    sourceLines = r.source_lines ? (JSON.parse(r.source_lines) as string[]) : [];
  } catch {
    sourceLines = [];
  }
  return { id: r.id, kind: r.kind, label: r.label, value: r.value, normalized: r.normalized, raw: r.raw, confidence: r.confidence, sourceLines, position: r.position, edited: r.edited === 1 };
}

const CARD_SELECT = `SELECT c.*, e.name AS event_name FROM cards c LEFT JOIN events e ON e.id = c.event_id`;

const CHUNK = 400; // ids per IN (...) statement (SQLite's default variable limit is 999)

function group<T extends { card_id: string }>(rows: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.card_id);
    if (list) list.push(r);
    else m.set(r.card_id, [r]);
  }
  return m;
}

/** Children of many cards in three statements per chunk, not three per card (REVIEW_V1 S1: 2,000 cards = 6,000 queries). */
async function hydrate(r: Db, rows: CardRow[]): Promise<Card[]> {
  const sidesBy = new Map<string, SideRow[]>();
  const fieldsBy = new Map<string, FieldRow[]>();
  const tagsBy = new Map<string, { card_id: string; name: string }[]>();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const ids = rows.slice(i, i + CHUNK).map((row) => row.id);
    const q = ids.map(() => '?').join(',');
    for (const [k, v] of group(await r.getAllAsync<SideRow>(`SELECT * FROM card_sides WHERE card_id IN (${q}) ORDER BY side DESC`, ...ids))) sidesBy.set(k, v);
    for (const [k, v] of group(await r.getAllAsync<FieldRow>(`SELECT * FROM card_fields WHERE card_id IN (${q}) ORDER BY position`, ...ids))) fieldsBy.set(k, v);
    for (const [k, v] of group(await r.getAllAsync<{ card_id: string; name: string }>(`SELECT ct.card_id, t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id IN (${q}) ORDER BY t.name COLLATE NOCASE`, ...ids))) tagsBy.set(k, v);
  }
  const out: Card[] = [];
  for (const row of rows) {
    const sides = sidesBy.get(row.id) ?? [];
    const fields = fieldsBy.get(row.id) ?? [];
    const tags = tagsBy.get(row.id) ?? [];
    const f = fields.map(fieldOf);
    const tagNames = tags.map((t) => t.name);
    out.push({
      id: row.id,
      status: row.status,
      isMine: row.is_mine === 1,
      source: row.source,
      eventId: row.event_id,
      eventName: row.event_name,
      metOn: row.met_on,
      metWhere: row.met_where,
      notes: row.notes,
      followUpAt: row.follow_up_at,
      followUpLocal: row.follow_up_local ?? null,
      followUpNotification: row.follow_up_notification,
      contactState: row.contact_state,
      contactId: row.contact_id,
      contactSavedAt: row.contact_saved_at,
      extractorVersion: row.extractor_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      checkedAt: row.checked_at,
      deletedAt: row.deleted_at,
      sides: sides.map(sideOf),
      fields: f,
      tags: tagNames,
      contact: contactFromFields(f, { notes: row.notes, event: row.event_name, metOn: row.met_on, metWhere: row.met_where, tags: tagNames }),
    });
  }
  return out;
}

export async function getCard(db: Db, id: string): Promise<Card | null> {
  return withRead(db, async (r) => {
    const rows = await r.getAllAsync<CardRow>(`${CARD_SELECT} WHERE c.id = ?`, id);
    return (await hydrate(r, rows))[0] ?? null;
  });
}

export type CardFilter = { status?: CardStatus; eventId?: string; tagId?: string; query?: string; sort?: SortOrder; locale?: string };

/** The library list: live cards (not deleted, not "my card"), filtered, searched and sorted. */
export async function listCards(db: Db, filter: CardFilter = {}): Promise<Card[]> {
  const where = ['c.deleted_at IS NULL', 'c.is_mine = 0'];
  const args: string[] = [];
  if (filter.status) {
    where.push('c.status = ?');
    args.push(filter.status);
  }
  if (filter.eventId) {
    where.push('c.event_id = ?');
    args.push(filter.eventId);
  }
  if (filter.tagId) {
    where.push('EXISTS (SELECT 1 FROM card_tags ct WHERE ct.card_id = c.id AND ct.tag_id = ?)');
    args.push(filter.tagId);
  }
  const hits = filter.query ? await searchCardIds(db, filter.query) : null;
  // only the search hits are hydrated (REVIEW_V1 S1)
  const cards = await withRead(db, async (r) => {
    const rows = await r.getAllAsync<CardRow>(`${CARD_SELECT} WHERE ${where.join(' AND ')}`, ...args);
    return hydrate(r, hits ? rows.filter((row) => hits.has(row.id)) : rows);
  });
  return sortCards(cards, filter.sort ?? 'added', filter.locale);
}

/** Counts for the filter chips. */
export async function countCards(db: Db): Promise<{ all: number; draft: number }> {
  const row = await withRead(db, (r) =>
    r.getFirstAsync<{ all_n: number; draft_n: number }>(
      "SELECT COUNT(*) AS all_n, COALESCE(SUM(status = 'draft'), 0) AS draft_n FROM cards WHERE deleted_at IS NULL AND is_mine = 0"
    )
  );
  return { all: row?.all_n ?? 0, draft: row?.draft_n ?? 0 };
}

export type ExportSelection = { cardIds?: readonly string[]; eventId?: string; tagId?: string };

/**
 * Cards an export or a bulk save may use: CHECKED live cards only (A11). `skippedDrafts` counts the selected cards that
 * are still "To check" so the UI can say "3 cards not checked yet are left out".
 */
export async function cardsForExport(db: Db, sel: ExportSelection = {}): Promise<{ cards: Card[]; skippedDrafts: number }> {
  let all = await listCards(db, { eventId: sel.eventId, tagId: sel.tagId });
  if (sel.cardIds) {
    const wanted = new Set(sel.cardIds);
    all = all.filter((c) => wanted.has(c.id));
  }
  const cards = all.filter((c) => c.status === 'checked');
  return { cards: sortCards(cards, 'added'), skippedDrafts: all.length - cards.length };
}

/** Checked library cards as matcher input (drafts are not the library's truth; the card itself excluded by the caller). */
export async function matchPool(db: Db): Promise<StoredCard[]> {
  const cards = await listCards(db, { status: 'checked' });
  return cards.map((c) => ({ id: c.id, contact: c.contact, createdAt: c.createdAt }));
}

/** Sides still waiting for text recognition, oldest first (the OCR queue; the state lives here, so it resumes after a kill). */
export async function pendingOcrSides(db: Db, limit = 1): Promise<{ cardId: string; side: SideName; imageFile: string; rotation: 0 | 90 | 180 | 270 }[]> {
  const rows = await withRead(db, (r) =>
    r.getAllAsync<{ card_id: string; side: SideName; image_file: string; rotation: 0 | 90 | 180 | 270 }>(
      `SELECT s.card_id, s.side, s.image_file, s.rotation FROM card_sides s JOIN cards c ON c.id = s.card_id
        WHERE s.ocr_state = 'pending' AND c.deleted_at IS NULL ORDER BY s.created_at, s.card_id, s.side LIMIT ?`,
      limit
    )
  );
  return rows.map((r) => ({ cardId: r.card_id, side: r.side, imageFile: r.image_file, rotation: r.rotation }));
}

/** Error marker of a side whose OCR model is still being downloaded (Android Play services): retried on every start. */
export const OCR_MODEL_PENDING = 'model-pending';

/** Puts "model still downloading" sides back into the queue (app start). Returns how many. */
export async function requeueModelPending(db: Db): Promise<number> {
  return withTransaction(db, async (tx) => {
    const r = await tx.runAsync("UPDATE card_sides SET ocr_state = 'pending', ocr_error = NULL WHERE ocr_state = 'unsupported' AND ocr_error = ?", OCR_MODEL_PENDING);
    return r.changes;
  });
}

/** Draft ids in capture order (the batch queue "3 of 12"). */
export async function draftIds(db: Db): Promise<string[]> {
  const rows = await withRead(db, (r) =>
    r.getAllAsync<{ id: string }>("SELECT id FROM cards WHERE status = 'draft' AND deleted_at IS NULL AND is_mine = 0 ORDER BY created_at, id")
  );
  return rows.map((r) => r.id);
}

/** First "To check" card, oldest first — where an interrupted batch resumes. */
export async function firstDraft(db: Db): Promise<string | null> {
  const row = await withRead(db, (r) =>
    r.getFirstAsync<{ id: string }>("SELECT id FROM cards WHERE status = 'draft' AND deleted_at IS NULL AND is_mine = 0 ORDER BY created_at, id LIMIT 1")
  );
  return row?.id ?? null;
}

// ---- My card ----
export async function getMyCard(db: Db): Promise<Card | null> {
  return withRead(db, async (r) => (await hydrate(r, await r.getAllAsync<CardRow>(`${CARD_SELECT} WHERE c.is_mine = 1`)))[0] ?? null);
}

/** Creates or replaces the user's own card (always `checked`: the user typed or confirmed it). */
export async function saveMyCard(db: Db, fields: readonly FieldInput[], now = Date.now()): Promise<string> {
  return withTransaction(db, async (tx) => {
    const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM cards WHERE is_mine = 1');
    if (existing) {
      await tx.runAsync('DELETE FROM card_fields WHERE card_id = ?', existing.id);
      await insertFields(tx, existing.id, fields, now);
      await tx.runAsync('UPDATE cards SET updated_at = ? WHERE id = ?', now, existing.id);
      return existing.id;
    }
    return createCard(tx, { source: 'manual', status: 'checked', isMine: true, fields: [...fields] }, now);
  });
}

/** Draft rows (and their image paths) for the start-up sweep (src/lib/files.ts planSweep). */
export async function sweepInput(db: Db): Promise<{ id: string; status: CardStatus; files: string[] }[]> {
  const rows = await withRead(db, (r) => r.getAllAsync<{ id: string; status: CardStatus; image_file: string | null }>(
    'SELECT c.id, c.status, s.image_file FROM cards c LEFT JOIN card_sides s ON s.card_id = c.id ORDER BY c.id'
  ));
  const out = new Map<string, { id: string; status: CardStatus; files: string[] }>();
  for (const r of rows) {
    if (!out.has(r.id)) out.set(r.id, { id: r.id, status: r.status, files: [] });
    if (r.image_file) out.get(r.id)!.files.push(r.image_file);
  }
  return [...out.values()];
}

/**
 * Ids of abandoned "Type in" / Paste drafts: no side, no stored field with a value, no notes, no place (REVIEW_V1 S2 — a
 * "Type in" that was left with the back button stayed as an "Unnamed / To check" card). Checked cards never.
 */
export async function emptyDraftIds(db: Db): Promise<string[]> {
  const rows = await withRead(db, (r) =>
    r.getAllAsync<{ id: string }>(
      `SELECT c.id FROM cards c WHERE c.status = 'draft' AND c.is_mine = 0 AND c.deleted_at IS NULL AND c.source IN ('manual', 'paste')
         AND c.notes IS NULL AND c.met_where IS NULL
         AND NOT EXISTS (SELECT 1 FROM card_sides s WHERE s.card_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM card_fields f WHERE f.card_id = c.id AND f.value <> '')`
    )
  );
  return rows.map((r) => r.id);
}

/** Removes draft rows whose images never arrived (sweep result). Checked cards are never removed by the sweep. */
export async function removeBrokenDrafts(db: Db, cardIds: readonly string[]): Promise<void> {
  await withTransaction(db, async (tx) => {
    for (const id of cardIds) {
      const row = await tx.getFirstAsync<{ status: CardStatus }>('SELECT status FROM cards WHERE id = ?', id);
      if (row?.status !== 'draft') continue;
      await tx.runAsync('DELETE FROM card_fields WHERE card_id = ?', id);
      await tx.runAsync('DELETE FROM card_sides WHERE card_id = ?', id);
      await tx.runAsync('DELETE FROM card_tags WHERE card_id = ?', id);
      await tx.runAsync('DELETE FROM search_fts WHERE card_id = ?', id);
      await tx.runAsync('DELETE FROM cards WHERE id = ?', id);
    }
  });
}
