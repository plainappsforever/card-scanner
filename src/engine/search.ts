// Search text and query plan (SPEC §5.7, Offscan §5.8 pattern). Pure.
// Bodies and queries go through the same normaliser: NFKC, lower case, whitespace collapsed. A query of ≥ 3 characters
// becomes one FTS5 trigram phrase (substring match anywhere in the body); 1–2 characters fall back to LIKE over the same
// bodies (the trigram index cannot answer them); empty = no text filter.

export function normalizeSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

export type QueryPlan = { kind: 'all' } | { kind: 'match'; expr: string } | { kind: 'like'; pattern: string };

export function planQuery(query: string): QueryPlan {
  const q = normalizeSearch(query);
  if (q === '') return { kind: 'all' };
  if ([...q].length >= 3) return { kind: 'match', expr: `"${q.replace(/"/g, '""')}"` };
  return { kind: 'like', pattern: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` };
}

/** One search body per card: the parts joined by newlines after normalisation; empty parts dropped. */
export function searchBody(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((p) => normalizeSearch(p ?? ''))
    .filter((p) => p !== '')
    .join('\n');
}
