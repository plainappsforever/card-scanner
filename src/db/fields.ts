// card_fields rows <-> the engine's models (SPEC §4.2). Pure mapping, no database access.
// `value` holds the confirmed/edited value (name and address as JSON of their parts); `raw` what the extractor
// produced before the user's edits; `normalized` the matcher key (E.164, lower-case e-mail, URL without scheme …).
import type { Address, ContactCard, NameParts, PhoneType, EmailType, SocialService } from '@/engine/contact';
import { emptyAddress, emptyContact, emptyName, EMAIL_TYPES, PHONE_TYPES, SOCIAL_SERVICES } from '@/engine/contact';
import type { Candidate, Extracted } from '@/engine/extract/types';
import { companyKey, emailKey, foldText, nameKey } from '@/engine/match';
import { urlKey } from '@/engine/merge';

export type FieldKind = 'name' | 'other_name' | 'company' | 'department' | 'title' | 'phone' | 'email' | 'url' | 'social' | 'address';
export type FieldConfidence = 'high' | 'medium' | 'low' | 'user';
export const FIELD_KINDS: readonly FieldKind[] = ['name', 'other_name', 'company', 'department', 'title', 'phone', 'email', 'url', 'social', 'address'];

export type FieldInput = {
  kind: FieldKind;
  label: string | null;
  value: string;
  normalized: string | null;
  raw: string | null;
  confidence: FieldConfidence;
  sourceLines: string[];
  edited: boolean;
};
export type CardField = FieldInput & { id: string; position: number };

export function normalizedOf(kind: FieldKind, value: string, label: string | null): string | null {
  switch (kind) {
    case 'name': {
      const k = nameKey(parseName(value));
      return k || null;
    }
    case 'company': {
      const k = companyKey(value);
      return k || null;
    }
    case 'phone': {
      const digits = value.replace(/[^\d+]/g, '');
      return digits || null;
    }
    case 'email':
      return emailKey(value) || null;
    case 'url':
      return urlKey(value) || null;
    case 'social':
      return `${label ?? 'other'}:${urlKey(value).replace(/^@/, '')}`;
    case 'address': {
      const a = parseAddress(value);
      const k = foldText([a.postcode, a.city].join(' ')).trim();
      return k || null;
    }
    default:
      return foldText(value).trim() || null;
  }
}

export function parseName(value: string): NameParts {
  try {
    const v = JSON.parse(value) as Partial<NameParts>;
    return { ...emptyName(), ...v };
  } catch {
    return { ...emptyName(), full: value };
  }
}

export function parseAddress(value: string): Address {
  try {
    const v = JSON.parse(value) as Partial<Address>;
    return { ...emptyAddress(), ...v };
  } catch {
    return { ...emptyAddress(), street: value, raw: value };
  }
}

function input<T>(kind: FieldKind, c: Candidate<T>, value: string, label: string | null, normalized?: string | null): FieldInput {
  return { kind, label, value, normalized: normalized === undefined ? normalizedOf(kind, value, label) : normalized, raw: value, confidence: c.confidence, sourceLines: c.sources, edited: false };
}

/** Rows for a fresh extraction (Review shows them; nothing is "user" yet). */
export function fieldsFromExtracted(x: Extracted): FieldInput[] {
  const out: FieldInput[] = [];
  if (x.name) out.push(input('name', x.name, JSON.stringify(x.name.value), null));
  if (x.otherName) out.push(input('other_name', x.otherName, x.otherName.value, null));
  if (x.company) out.push(input('company', x.company, x.company.value, null));
  if (x.department) out.push(input('department', x.department, x.department.value, null));
  if (x.title) out.push(input('title', x.title, x.title.value, null));
  for (const p of x.phones) out.push({ ...input('phone', p, p.value.value, p.value.type, p.value.e164 ?? normalizedOf('phone', p.value.value, null)), raw: p.value.raw });
  for (const e of x.emails) out.push(input('email', e, e.value.value, e.value.type));
  for (const u of x.urls) out.push(input('url', u, u.value, null));
  for (const s of x.socials) out.push(input('social', s, s.value.value, s.value.service));
  for (const a of x.addresses) out.push(input('address', a, JSON.stringify(a.value), null));
  return out;
}

/** Rows for a contact typed in, decoded from a QR code or confirmed by the user (`confidence` = 'user' or 'high'). */
export function fieldsFromContact(c: ContactCard, confidence: FieldConfidence = 'user'): FieldInput[] {
  const f = (kind: FieldKind, value: string, label: string | null = null, normalized?: string | null): FieldInput => ({
    kind,
    label,
    value,
    normalized: normalized === undefined ? normalizedOf(kind, value, label) : normalized,
    raw: null,
    confidence,
    sourceLines: [],
    edited: false,
  });
  const out: FieldInput[] = [];
  if (c.name && (c.name.full || c.name.given || c.name.family)) out.push(f('name', JSON.stringify(c.name)));
  if (c.otherName) out.push(f('other_name', c.otherName));
  if (c.company) out.push(f('company', c.company));
  if (c.department) out.push(f('department', c.department));
  if (c.title) out.push(f('title', c.title));
  for (const p of c.phones) out.push(f('phone', p.value, p.type, p.e164 ?? normalizedOf('phone', p.value, null)));
  for (const e of c.emails) out.push(f('email', e.value, e.type));
  for (const u of c.urls) out.push(f('url', u));
  for (const s of c.socials) out.push(f('social', s.value, s.service));
  for (const a of c.addresses) out.push(f('address', JSON.stringify(a)));
  return out;
}

const oneOf = <T extends string>(list: readonly T[], v: string | null, fallback: T): T => (v && (list as readonly string[]).includes(v) ? (v as T) : fallback);

export type CardMeta = { notes?: string | null; event?: string | null; metOn?: string | null; metWhere?: string | null; tags?: string[] };

/** The contact a card's rows describe (for vCard, CSV, matching, Contacts). First scalar of each kind wins. */
export function contactFromFields(fields: readonly FieldInput[], meta: CardMeta = {}): ContactCard {
  const c = emptyContact();
  for (const f of fields) {
    switch (f.kind) {
      case 'name':
        c.name ??= parseName(f.value);
        break;
      case 'other_name':
        c.otherName ??= f.value;
        break;
      case 'company':
        c.company ??= f.value;
        break;
      case 'department':
        c.department ??= f.value;
        break;
      case 'title':
        c.title ??= f.value;
        break;
      case 'phone': {
        const e164 = f.normalized && /^\+\d{6,15}$/.test(f.normalized) ? f.normalized : undefined;
        c.phones.push({ value: f.value, type: oneOf<PhoneType>(PHONE_TYPES, f.label, 'other'), ...(e164 ? { e164 } : {}) });
        break;
      }
      case 'email':
        c.emails.push({ value: f.value, type: oneOf<EmailType>(EMAIL_TYPES, f.label, 'work') });
        break;
      case 'url':
        c.urls.push(f.value);
        break;
      case 'social':
        c.socials.push({ service: oneOf<SocialService>(SOCIAL_SERVICES, f.label, 'other'), value: f.value });
        break;
      case 'address':
        c.addresses.push(parseAddress(f.value));
        break;
    }
  }
  if (meta.notes) c.notes = meta.notes;
  if (meta.event) c.event = meta.event;
  if (meta.metOn) c.metOn = meta.metOn;
  if (meta.metWhere) c.metWhere = meta.metWhere;
  c.tags = [...(meta.tags ?? [])];
  return c;
}
