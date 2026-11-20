// Merge plan (SPEC §5.5): what a new card would add to a stored card or phone contact. Pure. Lists are unions by
// normalised value; differing scalars become conflicts the user decides; nothing that exists is ever removed.
import type { Address, ContactCard, Email, NameParts, Phone, Social } from './contact';
import { joinName } from './contact';
import { companyKey, emailKey, foldText, nameKey, phoneMatchKey, samePhoneKey } from './match';

export type ScalarField = 'name' | 'otherName' | 'company' | 'department' | 'title';
export type Conflict =
  | { field: 'name'; existing: NameParts; incoming: NameParts }
  | { field: Exclude<ScalarField, 'name'>; existing: string; incoming: string };
export type Additions = {
  phones: Phone[];
  emails: Email[];
  urls: string[];
  socials: Social[];
  addresses: Address[];
  /** Scalars the existing record lacks (filled without asking: nothing is replaced). */
  fill: Partial<Pick<ContactCard, ScalarField>>;
};
export type MergePlan = { additions: Additions; conflicts: Conflict[] };
export type Choice = 'keep' | 'incoming';

export const urlKey = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const socialKey = (s: Social) => `${s.service}:${urlKey(s.value).replace(/^@/, '')}`;
const addressKey = (a: Address) => foldText([a.street, a.postcode, a.city].join('|')).replace(/[^\p{L}\p{N}|]/gu, '');
const textKey = (s: string) => foldText(s).replace(/[^\p{L}\p{N}]/gu, '');

function union<T>(existing: readonly T[], incoming: readonly T[], same: (a: T, b: T) => boolean): T[] {
  const out: T[] = [];
  for (const x of incoming) if (!existing.some((e) => same(e, x)) && !out.some((o) => same(o, x))) out.push(x);
  return out;
}

export function planMerge(existing: ContactCard, incoming: ContactCard, region?: string): MergePlan {
  const pk = (p: Phone) => phoneMatchKey(p, region);
  const additions: Additions = {
    phones: union(existing.phones, incoming.phones, (a, b) => samePhoneKey(pk(a), pk(b))),
    emails: union(existing.emails, incoming.emails, (a, b) => emailKey(a.value) === emailKey(b.value)),
    urls: union(existing.urls, incoming.urls, (a, b) => urlKey(a) === urlKey(b)),
    socials: union(existing.socials, incoming.socials, (a, b) => socialKey(a) === socialKey(b)),
    addresses: union(existing.addresses, incoming.addresses, (a, b) => addressKey(a) === addressKey(b)),
    fill: {},
  };
  const conflicts: Conflict[] = [];
  const inName = incoming.name && joinName(incoming.name) !== '' ? incoming.name : undefined;
  const exName = existing.name && joinName(existing.name) !== '' ? existing.name : undefined;
  if (inName && !exName) additions.fill.name = inName;
  else if (inName && exName && nameKey(inName) !== nameKey(exName)) conflicts.push({ field: 'name', existing: exName, incoming: inName });
  for (const field of ['otherName', 'company', 'department', 'title'] as const) {
    const a = existing[field]?.trim() ?? '';
    const b = incoming[field]?.trim() ?? '';
    if (b === '') continue;
    if (a === '') additions.fill[field] = b;
    else if ((field === 'company' ? companyKey(a) !== companyKey(b) : textKey(a) !== textKey(b))) conflicts.push({ field, existing: a, incoming: b });
  }
  return { additions, conflicts };
}

/** The merged record: existing values + additions + the user's choice per conflict (default: keep the saved value). */
export function applyMerge(existing: ContactCard, plan: MergePlan, choices: Partial<Record<ScalarField, Choice>> = {}): ContactCard {
  const out: ContactCard = {
    ...existing,
    ...plan.additions.fill,
    phones: [...existing.phones, ...plan.additions.phones],
    emails: [...existing.emails, ...plan.additions.emails],
    urls: [...existing.urls, ...plan.additions.urls],
    socials: [...existing.socials, ...plan.additions.socials],
    addresses: [...existing.addresses, ...plan.additions.addresses],
    tags: [...existing.tags],
  };
  for (const c of plan.conflicts) {
    if (choices[c.field] !== 'incoming') continue;
    if (c.field === 'name') out.name = c.incoming;
    else out[c.field] = c.incoming;
  }
  return out;
}

export type CardMeta = { eventId: string | null; metOn: string | null; metWhere: string | null; notes: string | null; tags: readonly string[] };

/**
 * The library merge (U10) also keeps what the user wrote on the incoming card (P8): the stored card's event/met data
 * win and are only FILLED from the incoming one; notes are appended when they differ; tags are the union (case-blind).
 * Nothing the stored card had is removed or replaced.
 */
export function mergeMeta(stored: CardMeta, incoming: CardMeta): CardMeta {
  const notesA = stored.notes?.trim() ?? '';
  const notesB = incoming.notes?.trim() ?? '';
  const notes = !notesB || textKey(notesA).includes(textKey(notesB)) ? notesA : notesA ? `${notesA}\n\n${notesB}` : notesB;
  const tags = [...stored.tags];
  for (const t of incoming.tags) if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
  return {
    eventId: stored.eventId ?? incoming.eventId,
    metOn: stored.metOn ?? incoming.metOn,
    metWhere: stored.metWhere?.trim() ? stored.metWhere : incoming.metWhere,
    notes: notes || null,
    tags,
  };
}
