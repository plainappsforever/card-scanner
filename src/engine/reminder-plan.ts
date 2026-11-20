// Follow-up reminders (SPEC §5.8). Pure: presets → a local date-time, the notification text, and `reconcile` which
// turns the cards' follow-ups and the scheduled notifications into schedule/cancel lists (template pattern; run at
// start and after every change). Past times are refused. Follow-ups are wall-clock times (D48): "Monday 09:00" stays
// 09:00 where the user is when the time zone changes.

export type Preset = 'tomorrow' | 'in3days' | 'nextMonday' | 'in2weeks';
export const PRESETS: readonly Preset[] = ['tomorrow', 'in3days', 'nextMonday', 'in2weeks'];

/** "HH:MM" → [h, m]; invalid → 09:00. */
export function parseTime(hhmm: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return [9, 0];
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : [9, 0];
}

/** The local time a preset means, at `time` (setting follow_up_time). */
export function presetTime(preset: Preset, now: Date, time = '09:00'): number {
  const [h, m] = parseTime(time);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (preset === 'in3days') d.setDate(d.getDate() + 3);
  else if (preset === 'in2weeks') d.setDate(d.getDate() + 14);
  else {
    const day = d.getDay(); // 0 = Sunday
    d.setDate(d.getDate() + (((8 - day) % 7) || 7));
  }
  return d.getTime();
}

/** A custom date "YYYY-MM-DD" at `time`, or null when malformed. */
export function customTime(date: string, time = '09:00'): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [h, min] = parseTime(time);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min, 0, 0);
  return d.getMonth() === Number(m[2]) - 1 ? d.getTime() : null;
}

export function isFuture(at: number, now: number): boolean {
  return at > now;
}

/** The wall-clock stamp "YYYY-MM-DDTHH:MM" of an instant in the current time zone (stored with the follow-up, D48). */
export function toLocalStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The instant a wall-clock stamp means in the CURRENT time zone, or null when malformed. A time that does not exist
 * locally (the hour skipped when clocks go forward) moves forward with the clock, as Date does.
 */
export function fromLocalStamp(stamp: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(stamp);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return date.getMonth() === mo - 1 && date.getDate() === d ? date.getTime() : null;
}

/** When a stored follow-up is due now: its wall-clock time in the current zone; the stored instant for old rows. */
export function effectiveAt(f: { at: number; local: string | null }): number {
  return (f.local ? fromLocalStamp(f.local) : null) ?? f.at;
}

export type ReminderCard = { cardId: string; at: number; local: string | null; notificationId: string | null; title: string; company: string; event: string | null };
/** A notification the system holds for us; `at`/`title`/`body` as we scheduled them (from the notification's data). */
export type Scheduled = { id: string; cardId: string | null; at: number | null; title: string; body: string };
export type ReminderTexts = { title: (name: string, company: string) => string };
export type Wanted = { cardId: string; at: number; title: string; body: string; storedAt: number; notificationId: string | null };

/** "Follow up: Anna Weber (ACME)" + body "Hannover Messe" (the event, when there is one). */
export function reminderContent(c: Pick<ReminderCard, 'title' | 'company' | 'event'>, texts: ReminderTexts): { title: string; body: string } {
  return { title: texts.title(c.title, c.company), body: c.event ?? '' };
}

/**
 * What to change so the system's notifications equal the cards' FUTURE follow-ups, with today's texts and today's
 * time zone (SPEC §5.8, D48): a notification is kept only when card, time, title and body all match (one per card);
 * everything else of ours is cancelled — deleted cards, removed or past follow-ups, edited names/companies/events,
 * a moved time zone, duplicates. `schedule` lists what is missing; `keep` maps kept notifications to their cards (the
 * caller stores the id when the row has another one); `moved` lists cards whose due time differs from the stored one.
 */
export function reconcile(
  cards: readonly ReminderCard[],
  scheduled: readonly Scheduled[],
  now: number,
  texts: ReminderTexts
): { schedule: Wanted[]; cancel: string[]; keep: { cardId: string; id: string }[]; moved: Wanted[] } {
  const wanted: Wanted[] = cards.map((c) => ({ cardId: c.cardId, at: effectiveAt(c), ...reminderContent(c, texts), storedAt: c.at, notificationId: c.notificationId }));
  const future = new Map(wanted.filter((w) => w.at > now).map((w) => [w.cardId, w]));
  const cancel: string[] = [];
  const keep: { cardId: string; id: string }[] = [];
  for (const s of scheduled) {
    const w = s.cardId ? future.get(s.cardId) : undefined;
    const same = w && s.at === w.at && s.title === w.title && s.body === w.body && !keep.some((k) => k.cardId === w.cardId);
    if (same && w) keep.push({ cardId: w.cardId, id: s.id });
    else cancel.push(s.id);
  }
  const kept = new Set(keep.map((k) => k.cardId));
  return {
    schedule: [...future.values()].filter((w) => !kept.has(w.cardId)),
    cancel,
    keep,
    moved: wanted.filter((w) => w.at !== w.storedAt),
  };
}
