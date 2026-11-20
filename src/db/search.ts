// Search index (SPEC §4.2 search_fts, §5.7): one FTS5 trigram row per card, rewritten by the data functions in the
// same transaction as every write that changes its inputs (no triggers; Offscan D30). Reads through withRead.
import { normalizeSearch, planQuery, searchBody } from '@/engine/search';

import { parseAddress, parseName } from './fields';
import { withRead, withWrite } from './tx';
import type { Db } from './types';

type FieldRow = { kind: string; label: string | null; value: string };

function fieldText(f: FieldRow): string {
  if (f.kind === 'name') {
    const n = parseName(f.value);
    return [n.prefix, n.given, n.middle, n.family, n.suffix, n.full].filter(Boolean).join(' ');
  }
  if (f.kind === 'address') {
    const a = parseAddress(f.value);
    return [a.street, a.postcode, a.city, a.region, a.country].filter(Boolean).join(' ');
  }
  return f.value;
}

function ocrText(json: string | null): string {
  if (!json) return '';
  try {
    const parsed = JSON.parse(json) as { lines?: { text?: string }[] };
    return (parsed.lines ?? []).map((l) => l.text ?? '').join('\n');
  } catch {
    return '';
  }
}

/** Rewrites the card's search row. Call with the handle of the running write unit. */
export async function rewriteSearch(db: Db, cardId: string): Promise<void> {
  await withWrite(db, async (tx) => {
    const card = await tx.getFirstAsync<{ notes: string | null; met_where: string | null; event: string | null }>(
      'SELECT c.notes, c.met_where, e.name AS event FROM cards c LEFT JOIN events e ON e.id = c.event_id WHERE c.id = ?',
      cardId
    );
    await tx.runAsync('DELETE FROM search_fts WHERE card_id = ?', cardId);
    if (!card) return;
    const fields = await tx.getAllAsync<FieldRow>('SELECT kind, label, value FROM card_fields WHERE card_id = ? ORDER BY position', cardId);
    const sides = await tx.getAllAsync<{ ocr_json: string | null }>('SELECT ocr_json FROM card_sides WHERE card_id = ? ORDER BY side DESC', cardId);
    const tags = await tx.getAllAsync<{ name: string }>('SELECT t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = ? ORDER BY t.name', cardId);
    const body = searchBody([...fields.map(fieldText), ...sides.map((s) => ocrText(s.ocr_json)), card.notes, card.met_where, card.event, ...tags.map((t) => t.name)]);
    await tx.runAsync('INSERT INTO search_fts (card_id, body) VALUES (?, ?)', cardId, body);
  });
}

/** Card ids whose body contains the query (all ids for an empty query is the caller's job: returns null). */
export async function searchCardIds(db: Db, query: string): Promise<Set<string> | null> {
  const plan = planQuery(query);
  if (plan.kind === 'all') return null;
  const rows = await withRead(db, (r) =>
    plan.kind === 'match'
      ? r.getAllAsync<{ card_id: string }>('SELECT card_id FROM search_fts WHERE body MATCH ?', plan.expr)
      : r.getAllAsync<{ card_id: string }>("SELECT card_id FROM search_fts WHERE body LIKE ? ESCAPE '\\'", plan.pattern)
  );
  return new Set(rows.map((r) => r.card_id));
}

export { normalizeSearch };
