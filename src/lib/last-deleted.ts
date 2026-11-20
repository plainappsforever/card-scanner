// A card deleted on the Card screen is handed to the Cards list, which shows its undo snack on focus (REVIEW_V1 M3).
// Plain module state: the two screens never render at the same time.
let pending: string[] | null = null;

export function noteDeleted(ids: readonly string[]): void {
  pending = [...ids];
}

/** The ids deleted since the last call (once). */
export function takeDeleted(): string[] | null {
  const p = pending;
  pending = null;
  return p;
}
