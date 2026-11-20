/**
 * @jest-environment node
 */
// The reconciler against a fake notification centre and a real (node:sqlite) library: edits, event renames, delete,
// undo, a cleared follow-up, a moved due time, permission off/on, and the P7 notification format (D48).
import { createTestDb } from '../../test/node-sqlite-db';
import { createCard, deleteCards, getCard, replaceFields, restoreCards, setFollowUp } from '@/db/cards';
import { createEvent, renameEvent } from '@/db/events';
import { fieldsFromContact } from '@/db/fields';
import { migrate } from '@/db/migrations';
import { emptyContact, emptyName } from '@/engine/contact';

type Req = { identifier: string; content: { title: string; body: string; data: Record<string, unknown> }; trigger: { date: Date } };
const centre = { granted: true, asked: 0, list: [] as Req[], next: 1 };

jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove() {} }) } }));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: async () => ({ granted: centre.granted }),
  requestPermissionsAsync: async () => {
    centre.asked++;
    return { granted: centre.granted };
  },
  getAllScheduledNotificationsAsync: async () => centre.list.map((r) => ({ ...r })),
  cancelScheduledNotificationAsync: async (id: string) => {
    centre.list = centre.list.filter((r) => r.identifier !== id);
  },
  scheduleNotificationAsync: async (req: { content: Req['content']; trigger: Req['trigger'] }) => {
    const identifier = `n${centre.next++}`;
    centre.list.push({ identifier, content: req.content, trigger: req.trigger });
    return identifier;
  },
  setNotificationChannelAsync: async () => null,
}));

// imported after the mocks
// eslint-disable-next-line import/first
import { reconcileReminders, setReminder } from './reminders';

const person = (given: string, family: string, company: string) => fieldsFromContact({ ...emptyContact(), name: { ...emptyName(), given, family }, company }, 'user');

async function setup() {
  centre.granted = true;
  centre.asked = 0;
  centre.list = [];
  const db = createTestDb();
  await migrate(db);
  const eventId = await createEvent(db, 'IAA');
  const id = await createCard(db, { source: 'scan', status: 'checked', eventId, fields: person('Anna', 'Weber', 'ACME') });
  return { db, id, eventId };
}

const texts = () => centre.list.map((r) => [r.content.title, r.content.body]);
const future = Math.floor((Date.now() + 3 * 86400_000) / 60_000) * 60_000; // presets are whole minutes (wall-clock stamps, D48)

describe('follow-up reconciler (D48)', () => {
  it('schedules once, then follows edits, event renames, delete, undo and clearing', async () => {
    const { db, id, eventId } = await setup();
    expect(await setReminder(db, (await getCard(db, id))!, future)).toBe('scheduled');
    expect(texts()).toEqual([['Follow up: Anna Weber (ACME)', 'IAA']]);
    const first = centre.list[0].identifier;
    expect((await getCard(db, id))?.followUpNotification).toBe(first);
    expect(centre.list[0].content.data).toMatchObject({ kind: 'follow-up', cardId: id, url: `/card/${id}` });

    await reconcileReminders(db); // nothing changed → nothing rescheduled
    expect(centre.list.map((r) => r.identifier)).toEqual([first]);

    await replaceFields(db, id, person('Anna', 'Weber-Schulz', 'ACME Robotics'));
    await reconcileReminders(db);
    expect(texts()).toEqual([['Follow up: Anna Weber-Schulz (ACME Robotics)', 'IAA']]);

    await renameEvent(db, eventId, 'IAA Mobility');
    await reconcileReminders(db);
    expect(texts()).toEqual([['Follow up: Anna Weber-Schulz (ACME Robotics)', 'IAA Mobility']]);

    await deleteCards(db, [id]);
    await reconcileReminders(db);
    expect(centre.list).toEqual([]);

    await restoreCards(db, [id]); // undo brings the reminder back
    await reconcileReminders(db);
    expect(texts()).toEqual([['Follow up: Anna Weber-Schulz (ACME Robotics)', 'IAA Mobility']]);
    expect((await getCard(db, id))?.followUpNotification).toBe(centre.list[0].identifier);

    expect(await setReminder(db, (await getCard(db, id))!, null)).toBe('cleared');
    expect(centre.list).toEqual([]);
    expect(await getCard(db, id)).toMatchObject({ followUpAt: null, followUpLocal: null, followUpNotification: null });
  });

  it('permission off: the follow-up is stored and scheduled later, when notifications are allowed', async () => {
    const { db, id } = await setup();
    centre.granted = false;
    expect(await setReminder(db, (await getCard(db, id))!, future)).toBe('denied');
    expect(centre.asked).toBe(1);
    expect(centre.list).toEqual([]);
    expect((await getCard(db, id))?.followUpAt).toBe(future);
    centre.granted = true; // the user allowed notifications in the system settings
    expect(await reconcileReminders(db)).toMatchObject({ scheduled: 1, permission: true });
    expect(centre.list).toHaveLength(1);
  });

  it('a P7 notification (no time in its data) and a past follow-up are cleaned up', async () => {
    const { db, id } = await setup();
    await setFollowUp(db, id, future, 'old-p7', null);
    centre.list.push({ identifier: 'old-p7', content: { title: 'Follow up: Anna Weber (ACME)', body: 'IAA', data: { cardId: id } }, trigger: { date: new Date(future) } });
    await reconcileReminders(db);
    expect(centre.list.map((r) => r.identifier)).not.toContain('old-p7');
    expect(centre.list).toHaveLength(1);
    await setFollowUp(db, id, Date.now() - 1000, centre.list[0].identifier, null); // due time passed
    await reconcileReminders(db);
    expect(centre.list).toEqual([]);
    expect(await getCard(db, id)).toMatchObject({ followUpNotification: null });
  });

  it('a wall-clock stamp that means another instant now (time zone moved) reschedules and stores the new time', async () => {
    const { db, id } = await setup();
    const local = '2030-01-15T09:00';
    const due = new Date(2030, 0, 15, 9, 0).getTime();
    await setFollowUp(db, id, due + 7 * 3600_000, null, local); // stored while the phone was 7 h behind
    const r = await reconcileReminders(db);
    expect(r.moved).toBe(1);
    expect(centre.list.map((x) => x.trigger.date.getTime())).toEqual([due]);
    expect((await getCard(db, id))?.followUpAt).toBe(due);
  });
});
