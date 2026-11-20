// "Cards changed" signal (P8, D48): data functions that change what a follow-up reminder says or whether it exists
// (fields, event, follow-up, delete/restore, event rename) call `cardsChanged()` after their transaction commits;
// src/lib/reminders.ts listens and reconciles the scheduled notifications. Plain listeners, no React, safe in Node.
const listeners = new Set<() => void>();

export function onCardsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function cardsChanged(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      // a listener's failure never fails the write that already committed
    }
  }
}
