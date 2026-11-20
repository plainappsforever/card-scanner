/**
 * @jest-environment node
 */
// The rating prompt: only after the fifth card saved to Contacts, once per version, never while scanning.
import { createTestDb } from '../../test/node-sqlite-db';
import { createCard, deleteCards, setContactState } from '@/db/cards';
import { fieldsFromContact } from '@/db/fields';
import { migrate } from '@/db/migrations';
import { emptyContact, emptyName } from '@/engine/contact';

import { maybeAskForReview, reviewDue, savedToContactsCount } from './store-review';

const person = (given: string) => fieldsFromContact({ ...emptyContact(), name: { ...emptyName(), given, family: 'Test' } }, 'user');

async function setup(saved: number, unsaved = 0) {
  const db = createTestDb();
  await migrate(db);
  const ids: string[] = [];
  for (let i = 0; i < saved + unsaved; i++) {
    const id = await createCard(db, { source: 'scan', status: 'checked', fields: person(`P${i}`) });
    if (i < saved) await setContactState(db, id, i % 2 ? 'created' : 'form_saved');
    ids.push(id);
  }
  return { db, ids };
}

describe('rating prompt', () => {
  it('stays quiet on a fresh install and with four saved cards', async () => {
    const { db } = await setup(4, 3);
    const ask = jest.fn(async () => undefined);
    expect(await savedToContactsCount(db)).toBe(4);
    expect(await maybeAskForReview(db, '1.1.0', ask)).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks after the fifth saved card, once per version', async () => {
    const { db } = await setup(5);
    const ask = jest.fn(async () => undefined);
    expect(await maybeAskForReview(db, '1.1.0', ask)).toBe(true);
    expect(await maybeAskForReview(db, '1.1.0', ask)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(await reviewDue(db, '1.2.0')).toBe(true); // a later version may ask again
  });

  it('never asks while a scan is running, and does not use the flag up', async () => {
    const { db } = await setup(6);
    const ask = jest.fn(async () => undefined);
    expect(await maybeAskForReview(db, '1.1.0', ask, true)).toBe(false);
    expect(ask).not.toHaveBeenCalled();
    expect(await reviewDue(db, '1.1.0')).toBe(true);
  });

  it('deleted cards do not count, and a refusing prompt does not throw', async () => {
    const { db, ids } = await setup(5);
    await deleteCards(db, [ids[0]]);
    expect(await reviewDue(db, '1.1.0')).toBe(false);
    const { db: db2 } = await setup(5);
    await expect(maybeAskForReview(db2, '1.1.0', async () => Promise.reject(new Error('no')))).resolves.toBe(true);
  });
});
