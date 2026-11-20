/**
 * @jest-environment node
 */
import { createTestDb } from '../../test/node-sqlite-db';
import { emptyContact, emptyName } from '@/engine/contact';

import { cardsForExport, confirmCard, draftIds, OCR_MODEL_PENDING, pendingOcrSides, requeueModelPending, countCards, createCard, deleteCards, firstDraft, getCard, getMyCard, listCards, listFollowUps, matchPool, purgeDeleted, putSide, removeBrokenDrafts, emptyDraftIds, replaceFields, restoreCards, saveMyCard, setContactState, setEventForCards, setFollowUp, setSideOcr, sweepInput, updateCardMeta } from './cards';
import { createEvent, deleteEvent, getCurrentEvent, listEvents, renameEvent, setCurrentEvent } from './events';
import { fieldsFromContact, type FieldInput } from './fields';
import { searchCardIds } from './search';
import { addTagToCards, cardTags, deleteTag, listTags, setCardTags } from './tags';

import { LATEST_VERSION, MIGRATIONS, migrate, parentTableRebuilds } from './migrations';
import { getThemePreference, setThemePreference } from './settings';

async function freshDb() {
  const db = createTestDb();
  await migrate(db);
  return db;
}

describe('migrations', () => {
  it('never drop or rename a table that others reference (S14: cascades would delete child rows)', async () => {
    expect(parentTableRebuilds(MIGRATIONS)).toEqual([]);
    const rebuild = 'CREATE TABLE cards_new (id TEXT PRIMARY KEY); INSERT INTO cards_new SELECT id FROM cards; DROP TABLE cards; ALTER TABLE cards_new RENAME TO cards;';
    expect(parentTableRebuilds([rebuild], [...MIGRATIONS, rebuild])).toEqual(['DROP TABLE cards']);
    expect(parentTableRebuilds(['ALTER TABLE events RENAME TO old_events;'], MIGRATIONS)).toEqual(['ALTER TABLE events RENAME TO']);
    expect(parentTableRebuilds(['ALTER TABLE cards ADD COLUMN x TEXT; DROP TABLE items;'], MIGRATIONS)).toEqual([]);
    // the runner refuses such a migration before it touches any row
    const db = await freshDb();
    await expect(migrate(db, [...MIGRATIONS, rebuild])).rejects.toThrow(/rebuilds a referenced table/);
    const row = await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE name = 'cards_new'");
    expect(row?.n).toBe(0);
  });

  it('reaches the latest version and is safe to run again', async () => {
    const db = await freshDb();
    await migrate(db);
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(LATEST_VERSION);
  });
});

describe('migration 3 (P8, D47/D48)', () => {
  it('drops the template table on an upgraded database and keeps every card', async () => {
    const db = createTestDb();
    await migrate(db, MIGRATIONS.slice(0, 2));
    await db.execAsync("INSERT INTO items (title, created_at) VALUES ('demo', 1)");
    const id = await createCard(db, { source: 'manual', status: 'checked', fields: fieldsFromContact({ ...emptyContact(), company: 'ACME' }, 'user') }, 1000);
    await db.runAsync("UPDATE cards SET follow_up_at = 5000, follow_up_notification = 'n-1' WHERE id = ?", id);
    await migrate(db);
    expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'items'")).toBeNull();
    const card = await getCard(db, id);
    expect(card?.contact.company).toBe('ACME');
    expect(card?.followUpAt).toBe(5000);
    expect(card?.followUpLocal).toBeNull();
  });

  it('follow_up_local only takes a wall-clock time "YYYY-MM-DDTHH:MM"', async () => {
    const db = await freshDb();
    const id = await createCard(db, { source: 'manual' }, 1);
    await setFollowUp(db, id, 5000, null, '2026-10-19T09:00');
    expect((await getCard(db, id))?.followUpLocal).toBe('2026-10-19T09:00');
    await expect(db.runAsync("UPDATE cards SET follow_up_local = '19.10.2026 9:00' WHERE id = ?", id)).rejects.toThrow(/CHECK/);
    await setFollowUp(db, id, null);
    expect((await getCard(db, id))?.followUpLocal).toBeNull();
  });
});

describe('theme preference', () => {
  it('defaults to system, persists changes, and ignores invalid stored values', async () => {
    const db = await freshDb();
    expect(await getThemePreference(db)).toBe('system');

    await setThemePreference(db, 'dark');
    expect(await getThemePreference(db)).toBe('dark');

    await db.runAsync("UPDATE settings SET value = 'purple' WHERE key = 'theme'");
    expect(await getThemePreference(db)).toBe('system');
  });
});

// ---- Card library (P1, SPEC §4.2) ----

function contactFields(given: string, family: string, extra: Partial<ReturnType<typeof emptyContact>> = {}): FieldInput[] {
  return fieldsFromContact({ ...emptyContact(), name: { ...emptyName(), given, family }, ...extra }, 'high');
}

describe('schema (migration 2)', () => {
  it('creates the library tables with their CHECKs (the template table is gone since migration 3)', async () => {
    const db = await freshDb();
    const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name");
    const names = tables.map((t) => t.name);
    for (const t of ['cards', 'card_sides', 'card_fields', 'events', 'tags', 'card_tags', 'search_fts', 'settings']) expect(names).toContain(t);
    expect(names).not.toContain('items');
    await expect(db.runAsync("INSERT INTO cards (id, status, source, created_at, updated_at) VALUES ('x', 'saved', 'scan', 1, 1)")).rejects.toThrow(/CHECK/);
    await expect(db.runAsync("INSERT INTO cards (id, status, source, created_at, updated_at) VALUES ('x', 'draft', 'fax', 1, 1)")).rejects.toThrow(/CHECK/);
    await expect(db.runAsync("INSERT INTO cards (id, status, source, met_on, created_at, updated_at) VALUES ('x', 'draft', 'scan', '16.10.2026', 1, 1)")).rejects.toThrow(/CHECK/);
    await expect(db.runAsync("INSERT INTO cards (id, status, source, checked_at, created_at, updated_at) VALUES ('x', 'draft', 'scan', 5, 1, 1)")).rejects.toThrow(/CHECK/);
  });

  it('allows only one "my card"', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'm1', source: 'manual', status: 'checked', isMine: true });
    await expect(createCard(db, { id: 'm2', source: 'manual', status: 'checked', isMine: true })).rejects.toThrow(/UNIQUE/);
  });

  it('a failed migration rolls back schema and version together', async () => {
    const db = createTestDb();
    await expect(migrate(db, ['CREATE TABLE a (x INTEGER);', 'CREATE TABLE b (y INTEGER); THIS IS NOT SQL;'])).rejects.toThrow();
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(1);
    const b = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'b'");
    expect(b).toBeNull();
  });
});

describe('cards', () => {
  it('creates a draft with sides and fields, reads it back with its contact, and confirms it', async () => {
    const db = await freshDb();
    const fields = contactFields('Anna', 'Weber', { company: 'ACME GmbH', phones: [{ value: '+49 30 1234567', type: 'work', e164: '+49301234567' }], emails: [{ value: 'anna.weber@acme-de.example', type: 'work' }] });
    await createCard(db, { id: 'c1', source: 'scan', sides: [{ side: 'front', imageFile: 'cards/c1/front.jpg', w: 1600, h: 900 }], fields, extractorVersion: 'x1' }, 1000);
    const c = await getCard(db, 'c1');
    expect(c).toMatchObject({ status: 'draft', source: 'scan', extractorVersion: 'x1', checkedAt: null });
    expect(c!.sides[0]).toMatchObject({ side: 'front', ocrState: 'pending', w: 1600 });
    expect(c!.contact).toMatchObject({ company: 'ACME GmbH', phones: [{ e164: '+49301234567', type: 'work' }], emails: [{ value: 'anna.weber@acme-de.example' }] });
    expect(c!.fields.map((f) => f.kind)).toEqual(['name', 'company', 'phone', 'email']);
    expect(c!.fields.find((f) => f.kind === 'email')?.normalized).toBe('anna.weber@acme-de.example');
    await confirmCard(db, 'c1', undefined, 2000);
    expect(await getCard(db, 'c1')).toMatchObject({ status: 'checked', checkedAt: 2000 });
  });

  it('a failing statement inside createCard leaves nothing behind', async () => {
    const db = await freshDb();
    const bad = [...contactFields('A', 'B'), { kind: 'phone', label: 'work', value: 'x', normalized: null, raw: null, confidence: 'maybe', sourceLines: [], edited: false } as unknown as FieldInput];
    await expect(createCard(db, { id: 'c1', source: 'scan', fields: bad })).rejects.toThrow(/CHECK/);
    expect(await getCard(db, 'c1')).toBeNull();
    expect(await db.getAllAsync('SELECT * FROM card_fields')).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM search_fts')).toEqual([]);
  });

  it('OCR results, a back side, edits and meta are stored and searchable', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'c1', source: 'scan', sides: [{ side: 'front', imageFile: 'cards/c1/front.jpg', w: 10, h: 6 }], fields: contactFields('Anna', 'Weber') });
    await setSideOcr(db, 'c1', 'front', { state: 'done', engine: 'vision', langs: 'de,en', json: JSON.stringify({ lines: [{ id: 'f0', text: 'Zertifizierter Fachbetrieb' }] }), rotation: 90 });
    const replaced = await putSide(db, 'c1', { side: 'back', imageFile: 'cards/c1/back.jpg', w: 10, h: 6 });
    expect(replaced).toBeNull();
    expect(await putSide(db, 'c1', { side: 'back', imageFile: 'cards/c1/back2.jpg', w: 10, h: 6 })).toBe('cards/c1/back.jpg');
    await updateCardMeta(db, 'c1', { notes: 'Wants a quote for 200 units', metWhere: 'Halle 7', metOn: '2026-10-16' });
    expect((await searchCardIds(db, 'fachbetrieb'))?.has('c1')).toBe(true); // leftover OCR text is searchable (A15)
    expect((await searchCardIds(db, 'QUOTE'))?.has('c1')).toBe(true);
    expect((await searchCardIds(db, 'we'))?.has('c1')).toBe(true); // 2 characters → LIKE
    expect((await searchCardIds(db, 'zzz'))?.size).toBe(0);
    await replaceFields(db, 'c1', contactFields('Anne', 'Webber'), { extractorVersion: 'x2' });
    const c = await getCard(db, 'c1');
    expect(c).toMatchObject({ extractorVersion: 'x2', metOn: '2026-10-16', metWhere: 'Halle 7' });
    expect(c!.sides.find((s) => s.side === 'front')).toMatchObject({ ocrState: 'done', rotation: 90, ocrLangs: 'de,en' });
    expect((await searchCardIds(db, 'webber'))?.has('c1')).toBe(true);
    expect((await searchCardIds(db, 'Weber '))?.has('c1')).toBe(false);
    await updateCardMeta(db, 'c1', { notes: '  ' });
    expect((await getCard(db, 'c1'))!.notes).toBeNull();
  });

  it('lists live cards only, filters, sorts by name/company/added, and counts drafts', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'a', source: 'scan', fields: contactFields('Zoe', 'Adams', { company: 'Beta' }) }, 1);
    await createCard(db, { id: 'b', source: 'scan', status: 'checked', fields: contactFields('Ölaf', 'Ärger', { company: 'Alpha' }) }, 2);
    await createCard(db, { id: 'c', source: 'scan', status: 'checked', fields: contactFields('Carl', 'Zander') }, 3);
    await createCard(db, { id: 'm', source: 'manual', status: 'checked', isMine: true, fields: contactFields('Me', 'Myself') }, 4);
    await deleteCards(db, ['c'], 10);
    expect((await listCards(db)).map((c) => c.id)).toEqual(['b', 'a']);
    expect((await listCards(db, { sort: 'name', locale: 'de' })).map((c) => c.id)).toEqual(['a', 'b']);
    expect((await listCards(db, { sort: 'company' })).map((c) => c.id)).toEqual(['b', 'a']);
    expect((await listCards(db, { status: 'draft' })).map((c) => c.id)).toEqual(['a']);
    expect(await countCards(db)).toEqual({ all: 2, draft: 1 });
    await restoreCards(db, ['c']);
    expect((await listCards(db, { sort: 'name' })).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(await firstDraft(db)).toBe('a');
    expect((await getMyCard(db))?.id).toBe('m');
  });

  it('exports and the matcher pool use checked cards only (A11)', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'd', source: 'scan', fields: contactFields('Draft', 'Card') });
    await createCard(db, { id: 'k', source: 'scan', status: 'checked', fields: contactFields('Kept', 'Card') });
    await createCard(db, { id: 'm', source: 'manual', status: 'checked', isMine: true });
    const all = await cardsForExport(db);
    expect(all.cards.map((c) => c.id)).toEqual(['k']);
    expect(all.skippedDrafts).toBe(1);
    const sel = await cardsForExport(db, { cardIds: ['d', 'm'] });
    expect(sel).toMatchObject({ cards: [], skippedDrafts: 1 });
    expect((await matchPool(db)).map((c) => c.id)).toEqual(['k']);
  });

  it('follow-ups and contact state', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'c1', source: 'scan', status: 'checked', fields: contactFields('Anna', 'Weber', { company: 'ACME' }) });
    await setFollowUp(db, 'c1', 5000, 'notif-1');
    expect(await listFollowUps(db)).toEqual([{ cardId: 'c1', at: 5000, local: null, notificationId: 'notif-1', title: 'Anna Weber', company: 'ACME', event: null }]);
    await deleteCards(db, ['c1']);
    expect(await listFollowUps(db)).toEqual([]);
    await restoreCards(db, ['c1']);
    await setFollowUp(db, 'c1', null, 'ignored');
    expect(await getCard(db, 'c1')).toMatchObject({ followUpAt: null, followUpNotification: null });
    await setContactState(db, 'c1', 'form_saved', null, 7000);
    expect(await getCard(db, 'c1')).toMatchObject({ contactState: 'form_saved', contactSavedAt: 7000 });
  });

  it('purge removes rows for good and returns the image files to delete afterwards', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'c1', source: 'scan', sides: [{ side: 'front', imageFile: 'cards/c1/front.jpg', w: 1, h: 1 }, { side: 'back', imageFile: 'cards/c1/back.jpg', w: 1, h: 1 }], fields: contactFields('A', 'B') });
    await setCardTags(db, 'c1', ['fair']);
    await deleteCards(db, ['c1'], 100);
    expect(await purgeDeleted(db, 50)).toEqual({ cardIds: [], files: [] }); // undo window still open
    const purged = await purgeDeleted(db, 100);
    expect(purged.cardIds).toEqual(['c1']);
    expect(purged.files.sort()).toEqual(['cards/c1/back.jpg', 'cards/c1/front.jpg']);
    for (const t of ['cards', 'card_sides', 'card_fields', 'card_tags', 'search_fts']) expect(await db.getAllAsync(`SELECT * FROM ${t}`)).toEqual([]);
  });

  it('my card is created once and replaced on save', async () => {
    const db = await freshDb();
    const id = await saveMyCard(db, contactFields('Jonas', 'Example'));
    expect(await saveMyCard(db, contactFields('Jonas', 'Changed'))).toBe(id);
    const mine = await getMyCard(db);
    expect(mine?.contact.name?.family).toBe('Changed');
    expect(await listCards(db)).toEqual([]);
  });

  it('sweep input lists every card with its files; broken drafts are removed, checked cards never', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'd', source: 'scan', sides: [{ side: 'front', imageFile: 'cards/d/front.jpg', w: 1, h: 1 }] });
    await createCard(db, { id: 'k', source: 'scan', status: 'checked', sides: [{ side: 'front', imageFile: 'cards/k/front.jpg', w: 1, h: 1 }] });
    expect(await sweepInput(db)).toEqual([
      { id: 'd', status: 'draft', files: ['cards/d/front.jpg'] },
      { id: 'k', status: 'checked', files: ['cards/k/front.jpg'] },
    ]);
    await removeBrokenDrafts(db, ['d', 'k']);
    expect((await sweepInput(db)).map((r) => r.id)).toEqual(['k']);
  });

  it('empty manual/paste drafts are listed for the sweep; drafts with a value, notes, a side or a checked status never (REVIEW_V1 S2)', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'empty-manual', source: 'manual' });
    await createCard(db, { id: 'empty-paste', source: 'paste', fields: [{ kind: 'company', label: null, value: '', normalized: null, raw: null, confidence: 'user', sourceLines: [], edited: true }] });
    await createCard(db, { id: 'typed', source: 'manual', fields: contactFields('Anna', 'Weber') });
    await createCard(db, { id: 'noted', source: 'paste', notes: 'call back' });
    await createCard(db, { id: 'scanned', source: 'scan', sides: [{ side: 'front', imageFile: 'cards/scanned/front.jpg', w: 1, h: 1 }] });
    await createCard(db, { id: 'checked', source: 'manual', status: 'checked' });
    expect((await emptyDraftIds(db)).sort()).toEqual(['empty-manual', 'empty-paste']);
    await removeBrokenDrafts(db, await emptyDraftIds(db));
    expect((await listCards(db)).map((c) => c.id).sort()).toEqual(['checked', 'noted', 'scanned', 'typed']);
  });
});

describe('events and tags', () => {
  it('events: create (case-insensitive unique), current event, rename updates search, delete keeps cards', async () => {
    const db = await freshDb();
    const id = await createEvent(db, ' Hannover  Messe 2026 ', { now: 1 });
    expect(await createEvent(db, 'hannover messe 2026')).toBe(id);
    await expect(createEvent(db, '   ')).rejects.toThrow();
    await createCard(db, { id: 'c1', source: 'scan', eventId: id, fields: contactFields('A', 'B') });
    await setCurrentEvent(db, id);
    expect((await getCurrentEvent(db))?.name).toBe('Hannover Messe 2026');
    expect((await listEvents(db))[0]).toMatchObject({ id, cards: 1 });
    await renameEvent(db, id, 'IAA 2026');
    expect((await searchCardIds(db, 'iaa 2026'))?.has('c1')).toBe(true);
    await deleteEvent(db, id);
    expect(await getCurrentEvent(db)).toBeNull();
    expect(await getCard(db, 'c1')).toMatchObject({ eventId: null, eventName: null });
    const e2 = await createEvent(db, 'CES');
    await setEventForCards(db, ['c1'], e2);
    expect((await getCard(db, 'c1'))?.eventName).toBe('CES');
    await setCurrentEvent(db, null);
    expect(await getCurrentEvent(db)).toBeNull();
  });

  it('tags: set (dedup, case-insensitive), add to many, list counts, filter, delete', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'c1', source: 'scan', fields: contactFields('A', 'B') });
    await createCard(db, { id: 'c2', source: 'scan', fields: contactFields('C', 'D') });
    await setCardTags(db, 'c1', ['Supplier', 'supplier ', '', 'Hot lead']);
    expect(await cardTags(db, 'c1')).toEqual(['Hot lead', 'Supplier']);
    await addTagToCards(db, ['c1', 'c2'], 'SUPPLIER');
    const tags = await listTags(db);
    expect(tags.map((t) => [t.name, t.cards])).toEqual([['Hot lead', 1], ['Supplier', 2]]);
    const supplier = tags.find((t) => t.name === 'Supplier')!;
    expect((await listCards(db, { tagId: supplier.id })).length).toBe(2);
    expect((await searchCardIds(db, 'hot lead'))?.has('c1')).toBe(true);
    await deleteTag(db, supplier.id);
    expect(await cardTags(db, 'c2')).toEqual([]);
    expect((await getCard(db, 'c1'))?.contact.tags).toEqual(['Hot lead']);
  });
});

describe('OCR queue states (P6/P7)', () => {
  it('pending sides come oldest first; a model-pending side is queued again; drafts in capture order', async () => {
    const db = await freshDb();
    await createCard(db, { id: 'a', source: 'photo', sides: [{ side: 'front', imageFile: 'cards/a/front.jpg', w: 10, h: 6 }] }, 1000);
    await createCard(db, { id: 'b', source: 'photo', sides: [{ side: 'front', imageFile: 'cards/b/front.jpg', w: 10, h: 6 }] }, 2000);
    expect((await pendingOcrSides(db, 5)).map((s) => s.cardId)).toEqual(['a', 'b']);
    await setSideOcr(db, 'a', 'front', { state: 'unsupported', error: OCR_MODEL_PENDING, qrJson: '[{"format":"qr","text":"x"}]' });
    await setSideOcr(db, 'b', 'front', { state: 'unsupported', error: null });
    expect(await pendingOcrSides(db, 5)).toEqual([]);
    expect((await getCard(db, 'a'))?.sides[0].qrJson).toBe('[{"format":"qr","text":"x"}]');
    expect(await requeueModelPending(db)).toBe(1);
    expect((await pendingOcrSides(db, 5)).map((s) => s.cardId)).toEqual(['a']);
    expect(await draftIds(db)).toEqual(['a', 'b']);
  });
});
