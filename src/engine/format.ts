// Names, sort keys, "Share as text" and export file names (SPEC §5.6). Pure.
import type { ContactCard, NameParts, PhoneType } from './contact';
import { joinName } from './contact';

const EAST_ASIAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function isEastAsian(text: string): boolean {
  return EAST_ASIAN.test(text);
}

/**
 * Display name: "Given Middle Family" (with prefix/suffix) for Latin and most scripts; family first for Chinese,
 * Japanese and Korean names (no space between the parts for Han/Kana, one space for Hangul) and when `familyFirst`
 * is set (Hungarian cards).
 */
export function displayName(n: NameParts | undefined, opts: { familyFirst?: boolean } = {}): string {
  if (!n) return '';
  const given = [n.given, n.middle].filter(Boolean).join(' ');
  const cjk = isEastAsian(`${n.family}${n.given}${n.full}`);
  if ((cjk || opts.familyFirst) && (n.family || n.given)) {
    const hangul = /\p{Script=Hangul}/u.test(`${n.family}${n.given}`);
    const sep = cjk && !hangul ? '' : ' ';
    return [n.prefix, [n.family, given].filter(Boolean).join(sep), n.suffix].filter(Boolean).join(' ');
  }
  return joinName(n);
}

/** Title of a card in lists: the name, else the company, else the first e-mail, else ''. */
export function cardTitle(c: ContactCard): string {
  return displayName(c.name) || c.company?.trim() || c.emails[0]?.value || c.phones[0]?.value || '';
}

export type SortOrder = 'added' | 'name' | 'company';

/** Sort key for "name": family, then given (cards without a name sort by company/e-mail after named ones). */
export function nameSortKey(c: ContactCard): string[] {
  const n = c.name;
  if (n && (n.family || n.given)) return ['0', n.family || n.given, n.given, n.middle];
  if (n && n.full) return ['0', n.full];
  return ['1', c.company ?? '', c.emails[0]?.value ?? ''];
}

const collators = new Map<string, Intl.Collator>();
function collator(locale?: string): Intl.Collator {
  const key = locale ?? '';
  let c = collators.get(key);
  if (!c) collators.set(key, (c = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })));
  return c;
}

function compareKeys(a: string[], b: string[], locale?: string): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = collator(locale).compare(a[i] ?? '', b[i] ?? '');
    if (d !== 0) return d;
  }
  return 0;
}

export type Sortable = { contact: ContactCard; createdAt: number; id: string };

/** Sorted copy: added = newest first; name/company = locale-aware A–Z (ties: newest first). */
export function sortCards<T extends Sortable>(cards: readonly T[], order: SortOrder, locale?: string): T[] {
  const byAdded = (a: T, b: T) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  return [...cards].sort((a, b) => {
    if (order === 'name') return compareKeys(nameSortKey(a.contact), nameSortKey(b.contact), locale) || byAdded(a, b);
    if (order === 'company') {
      const ka = [a.contact.company ? '0' : '1', a.contact.company ?? '', ...nameSortKey(a.contact)];
      const kb = [b.contact.company ? '0' : '1', b.contact.company ?? '', ...nameSortKey(b.contact)];
      return compareKeys(ka, kb, locale) || byAdded(a, b);
    }
    return byAdded(a, b);
  });
}

export type TextLabels = Record<PhoneType, string> & { email: string; url: string; address: string };

/** "Share as text": a short plain-text business card (labels from the UI language). */
export function shareText(c: ContactCard, labels: TextLabels): string {
  const lines: string[] = [];
  const name = displayName(c.name);
  if (name) lines.push(name);
  if (c.otherName) lines.push(c.otherName);
  const role = [c.title, c.department].filter(Boolean).join(', ');
  if (role) lines.push(role);
  if (c.company) lines.push(c.company);
  for (const p of c.phones) lines.push(`${labels[p.type]}: ${p.value}`);
  for (const e of c.emails) lines.push(`${labels.email}: ${e.value}`);
  for (const u of c.urls) lines.push(`${labels.url}: ${u}`);
  for (const s of c.socials) lines.push(s.value);
  for (const a of c.addresses) {
    const text = [a.street, [a.postcode, a.city].filter(Boolean).join(' '), a.region, a.country].filter(Boolean).join(', ') || a.raw;
    if (text) lines.push(`${labels.address}: ${text}`);
  }
  return lines.join('\n');
}

/** Export file name: forbidden characters replaced by "-", whitespace collapsed, ≤ 100 characters before the extension. */
export function exportFileName(base: string, ext: 'vcf' | 'csv'): string {
  let name = base
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s]+$/g, '')
    .trim();
  if (name === '') name = 'cards';
  const chars = [...name];
  if (chars.length > 100) name = chars.slice(0, 100).join('').trim();
  return `${name}.${ext}`;
}
