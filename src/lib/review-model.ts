// Review editing (SPEC §7 screen 2) as pure functions over the card's field rows, so the rules are unit-tested:
// an edit marks the field `edited` (the extractor never overwrites it again); confirming drops empty fields and turns
// every edited value into confidence 'user'; a leftover line can be used as any field (nothing read is lost).
import type { FieldInput, FieldKind } from '@/db/fields';
import { normalizedOf, parseAddress, parseName } from '@/db/fields';
import { emptyAddress, emptyName, type Address, type NameParts, type PhoneType } from '@/engine/contact';
import { parsePhone, phoneType } from '@/engine/phone';

const blank = (kind: FieldKind, label: string | null = null, value = ''): FieldInput => ({
  kind,
  label,
  value,
  normalized: null,
  raw: null,
  confidence: 'user',
  sourceLines: [],
  edited: true,
});

/** The fields a person types first are always shown, even when the card had none (manual entry, empty OCR). */
export function withCoreFields(fields: readonly FieldInput[]): FieldInput[] {
  const out = [...fields];
  if (!out.some((f) => f.kind === 'name')) out.unshift(blank('name', null, JSON.stringify(emptyName())));
  for (const kind of ['company', 'title'] as const) if (!out.some((f) => f.kind === kind)) out.push(blank(kind));
  if (!out.some((f) => f.kind === 'phone')) out.push(blank('phone', 'mobile'));
  if (!out.some((f) => f.kind === 'email')) out.push(blank('email', 'work'));
  return out;
}

export function setValue(fields: readonly FieldInput[], index: number, value: string): FieldInput[] {
  return fields.map((f, i) => (i === index ? { ...f, value, edited: f.raw === null ? true : value !== f.raw, normalized: normalizedOf(f.kind, value, f.label) } : f));
}

export function setLabel(fields: readonly FieldInput[], index: number, label: string): FieldInput[] {
  return fields.map((f, i) => (i === index ? { ...f, label, edited: true, normalized: normalizedOf(f.kind, f.value, label) } : f));
}

export function setNamePart(fields: readonly FieldInput[], index: number, part: keyof NameParts, text: string): FieldInput[] {
  const n = { ...parseName(fields[index].value), [part]: text };
  n.full = [n.prefix, n.given, n.middle, n.family, n.suffix].map((s) => s.trim()).filter(Boolean).join(' ');
  return setValue(fields, index, JSON.stringify(n));
}

export function setAddressPart(fields: readonly FieldInput[], index: number, part: keyof Address, text: string): FieldInput[] {
  const a = { ...parseAddress(fields[index].value), [part]: text };
  a.raw = [a.street, [a.postcode, a.city].filter(Boolean).join(' '), a.region, a.country].filter(Boolean).join(', ');
  return setValue(fields, index, JSON.stringify(a));
}

export function removeField(fields: readonly FieldInput[], index: number): FieldInput[] {
  return fields.filter((_, i) => i !== index);
}

export function addField(fields: readonly FieldInput[], kind: FieldKind): FieldInput[] {
  const value = kind === 'name' ? JSON.stringify(emptyName()) : kind === 'address' ? JSON.stringify(emptyAddress()) : '';
  const label = kind === 'phone' ? 'work' : kind === 'email' ? 'work' : kind === 'social' ? 'other' : null;
  return [...fields, blank(kind, label, value)];
}

/** A leftover line ("Text on the card") used as a field; the line is its source. */
export function lineAsField(fields: readonly FieldInput[], kind: FieldKind, text: string, lineId: string, region?: string): FieldInput[] {
  const t = text.trim();
  let value = t;
  let label: string | null = null;
  let normalized: string | null;
  if (kind === 'name') {
    const words = t.split(/\s+/);
    const n: NameParts = { ...emptyName(), given: words.length > 1 ? words.slice(0, -1).join(' ') : '', family: words[words.length - 1] ?? '', full: t };
    value = JSON.stringify(n);
  } else if (kind === 'address') {
    value = JSON.stringify({ ...emptyAddress(), street: t, raw: t });
  }
  if (kind === 'phone') {
    const p = parsePhone(t, region);
    label = (p.valid ? phoneType(p) : 'work') as PhoneType;
    normalized = p.e164 ?? normalizedOf('phone', t, null);
  } else {
    if (kind === 'email') label = 'work';
    if (kind === 'social') label = 'other';
    normalized = normalizedOf(kind, value, label);
  }
  // a scalar kind (company, title …) that exists but is empty takes the line instead of a second entry
  const scalar = ['name', 'other_name', 'company', 'department', 'title'].includes(kind);
  const emptyAt = fields.findIndex((f) => f.kind === kind && isEmpty(f));
  const field: FieldInput = { kind, label, value, normalized, raw: null, confidence: 'user', sourceLines: [lineId], edited: true };
  if (emptyAt >= 0 && (scalar || kind === 'phone' || kind === 'email')) return fields.map((f, i) => (i === emptyAt ? field : f));
  return [...fields, field];
}

export function isEmpty(f: FieldInput): boolean {
  if (f.kind === 'name') {
    const n = parseName(f.value);
    return ![n.prefix, n.given, n.middle, n.family, n.suffix, n.full].some((s) => s.trim());
  }
  if (f.kind === 'address') {
    const a = parseAddress(f.value);
    return ![a.street, a.city, a.postcode, a.region, a.country].some((s) => s.trim());
  }
  return f.value.trim() === '';
}

/** What "Looks right" stores: empty fields dropped, edited values become the user's ('user'). */
export function confirmedFields(fields: readonly FieldInput[]): FieldInput[] {
  return fields.filter((f) => !isEmpty(f)).map((f) => (f.edited ? { ...f, confidence: 'user' as const, normalized: f.normalized ?? normalizedOf(f.kind, f.value, f.label) } : f));
}

/** A field needs a "Check" mark: the extractor was not sure (medium/low) and the user has not edited it. */
export const needsCheck = (f: FieldInput) => !f.edited && (f.confidence === 'medium' || f.confidence === 'low');
