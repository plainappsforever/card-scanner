// Follow-up reminders (SPEC §5.8, §8 U9, D48). The notification permission is asked the FIRST time a reminder is set
// (never before); the reminder is stored even when notifications are off (the card shows it), and the UI says so.
// Scheduling is one reconciler: the system's notifications are made equal to the cards' future follow-ups — at start,
// when the app comes back to the foreground (time zone, permission or language may have changed), and after every card
// change (src/db/changes.ts: edits, event renames, delete, undo, merge). Never two runs at once.
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { onCardsChanged } from '@/db/changes';
import { listFollowUps, setFollowUp, setFollowUpScheduled, type Card } from '@/db/cards';
import type { Db } from '@/db/types';
import { reconcile, toLocalStamp, type ReminderTexts, type Scheduled } from '@/engine/reminder-plan';
import { getLanguage, makeT, subscribeLanguage } from '@/i18n';

const CHANNEL_ID = 'follow-ups';
const KIND = 'follow-up';

export type ReconcileResult = { scheduled: number; cancelled: number; kept: number; moved: number; permission: boolean };

function texts(): ReminderTexts {
  const t = makeT(getLanguage());
  return { title: (name, company) => (company ? t('reminder.withCompany', { name, company }) : t('reminder.title', { name })) };
}

/** Our notifications as the engine sees them (card, time and text we scheduled; P7 ones lack `at` → rescheduled). */
function ours(requests: Notifications.NotificationRequest[]): Scheduled[] {
  return requests
    .filter((r) => r.content.data?.kind === KIND || typeof r.content.data?.cardId === 'string')
    .map((r) => {
      const at = Number(r.content.data?.at);
      return { id: r.identifier, cardId: typeof r.content.data?.cardId === 'string' ? r.content.data.cardId : null, at: Number.isFinite(at) && at > 0 ? at : null, title: r.content.title ?? '', body: r.content.body ?? '' };
    });
}

async function runOnce(db: Db, now = Date.now()): Promise<ReconcileResult> {
  const permission = (await Notifications.getPermissionsAsync()).granted;
  const cards = await listFollowUps(db);
  const plan = reconcile(cards, ours(await Notifications.getAllScheduledNotificationsAsync()), now, texts());
  for (const id of plan.cancel) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  let scheduled = 0;
  if (permission && plan.schedule.length && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: makeT(getLanguage())('reminder.channel'), importance: Notifications.AndroidImportance.DEFAULT });
  }
  const ids = new Map(plan.keep.map((k) => [k.cardId, k.id]));
  for (const w of plan.schedule) {
    if (!permission) continue; // stored on the card; scheduled once notifications are allowed (next start/foreground)
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: w.title, body: w.body, data: { kind: KIND, cardId: w.cardId, at: String(w.at), url: `/card/${w.cardId}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(w.at), channelId: CHANNEL_ID },
    });
    ids.set(w.cardId, id);
    scheduled++;
  }
  // every row ends with its due time in today's zone and the id of the notification that now stands for it (or none)
  for (const c of cards) {
    const at = plan.moved.find((m) => m.cardId === c.cardId)?.at ?? c.at;
    const id = ids.get(c.cardId) ?? null;
    if (at !== c.at || id !== c.notificationId) await setFollowUpScheduled(db, c.cardId, at, id);
  }
  return { scheduled, cancelled: plan.cancel.length, kept: plan.keep.length, moved: plan.moved.length, permission };
}

let running: Promise<ReconcileResult> | null = null;
let again = false;

/** Reconciles now (or right after the run in progress); resolves with the last run's result. */
export async function reconcileReminders(db: Db): Promise<ReconcileResult> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let r: ReconcileResult;
    do {
      again = false;
      r = await runOnce(db);
    } while (again);
    return r;
  })().finally(() => {
    running = null;
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced reconcile (many writes in a row → one run). */
export function requestReconcile(db: Db, delayMs = 300): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    reconcileReminders(db).catch(() => undefined);
  }, delayMs);
}

/** Start-up wiring: one run now, then on card changes, language switches and every return to the foreground. */
export function startReminders(db: Db): () => void {
  requestReconcile(db, 0);
  const offCards = onCardsChanged(() => requestReconcile(db));
  const offLang = subscribeLanguage(() => requestReconcile(db));
  const sub = AppState.addEventListener('change', (s) => s === 'active' && requestReconcile(db));
  return () => {
    offCards();
    offLang();
    sub.remove();
  };
}

/**
 * Sets (or clears, `at` null) a card's follow-up. Asks for the notification permission the first time; the follow-up
 * is stored either way and the reconciler schedules it ('denied' = stored, but the system will not show it).
 */
export async function setReminder(db: Db, card: Card, at: number | null): Promise<'scheduled' | 'denied' | 'cleared'> {
  if (at === null) {
    await setFollowUp(db, card.id, null);
    await reconcileReminders(db);
    return 'cleared';
  }
  let { granted } = await Notifications.getPermissionsAsync();
  if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
  await setFollowUp(db, card.id, at, null, toLocalStamp(at));
  await reconcileReminders(db);
  return granted ? 'scheduled' : 'denied';
}
