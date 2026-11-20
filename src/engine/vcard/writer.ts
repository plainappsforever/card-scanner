// vCard writer (SPEC §5.3, D19). vCard 3.0 by default (most compatible with iPhone, Google, Outlook imports), 4.0 on
// request. UTF-8, CRLF, lines folded at 75 octets on UTF-8 character boundaries (continuation = CRLF + one space),
// RFC 2426 / 6350 escaping. Deterministic output: no PHOTO, REV or PRODID. Pure.
import type { ContactCard, PhoneType } from '../contact';
import { socialUrl } from '../social';
import { displayName } from '../format';

import { utf8Length } from './text';

export type VCardVersion = '3.0' | '4.0';
export type NoteLabels = { otherName: string; event: string; metOn: string; metWhere: string };
export const ENGLISH_NOTE_LABELS: NoteLabels = { otherName: 'Other name', event: 'Event', metOn: 'Met on', metWhere: 'Where met' };
export type WriteOptions = {
  version?: VCardVersion;
  /** NOTE (other name, event, met on/where, notes) and CATEGORIES (tags). Default true. */
  includeNotes?: boolean;
  noteLabels?: NoteLabels;
};

/** Escapes one text value (RFC 2426 §5, RFC 6350 §3.4): backslash, comma, semicolon, newline. */
export function escapeValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds one content line at 75 octets without splitting a UTF-8 character; continuation lines start with a space. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Length(ch);
    if (curLen + n > limit) {
      out.push(cur);
      cur = ' ';
      curLen = 1;
      limit = 75;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const TEL_TYPES_3: Record<PhoneType, string> = { mobile: 'CELL,VOICE', work: 'WORK,VOICE', fax: 'WORK,FAX', home: 'HOME,VOICE', other: 'OTHER,VOICE' }; // OTHER: Apple Contacts shows a bare VOICE as a custom label "VOICE" (referee, D29)
const TEL_TYPES_4: Record<PhoneType, string> = { mobile: '"cell,voice"', work: '"work,voice"', fax: '"work,fax"', home: '"home,voice"', other: '"other,voice"' };

/** The NOTE text: other name, event, met on, met where, the user's notes — one per line. */
export function composeNote(c: ContactCard, labels: NoteLabels = ENGLISH_NOTE_LABELS): string {
  const lines: string[] = [];
  if (c.otherName) lines.push(`${labels.otherName}: ${c.otherName}`);
  if (c.event) lines.push(`${labels.event}: ${c.event}`);
  if (c.metOn) lines.push(`${labels.metOn}: ${c.metOn}`);
  if (c.metWhere) lines.push(`${labels.metWhere}: ${c.metWhere}`);
  if (c.notes) lines.push(c.notes);
  return lines.join('\n');
}

/** FN is never empty: the name, else the company, else the first e-mail, else the first phone. */
export function formattedName(c: ContactCard): string {
  return displayName(c.name) || c.company?.trim() || c.emails[0]?.value || c.phones[0]?.value || '?';
}

function cardLines(c: ContactCard, opts: WriteOptions): string[] {
  const v = opts.version ?? '3.0';
  const e = escapeValue;
  const lines = ['BEGIN:VCARD', `VERSION:${v}`];
  const n = c.name;
  lines.push(`N:${[n?.family ?? '', n?.given ?? '', n?.middle ?? '', n?.prefix ?? '', n?.suffix ?? ''].map(e).join(';')}`);
  lines.push(`FN:${e(formattedName(c))}`);
  if (c.company || c.department) lines.push(`ORG:${[c.company ?? '', ...(c.department ? [c.department] : [])].map(e).join(';')}`);
  if (c.title) lines.push(`TITLE:${e(c.title)}`);
  for (const p of c.phones) {
    if (v === '3.0') lines.push(`TEL;TYPE=${TEL_TYPES_3[p.type]}:${e(p.value)}`);
    else lines.push(p.e164 ? `TEL;VALUE=uri;TYPE=${TEL_TYPES_4[p.type]}:tel:${p.e164}` : `TEL;TYPE=${TEL_TYPES_4[p.type]}:${e(p.value)}`);
  }
  for (const m of c.emails) {
    const t = m.type === 'other' ? '' : m.type.toUpperCase();
    lines.push(v === '3.0' ? `EMAIL;TYPE=INTERNET${t ? `,${t}` : ''}:${e(m.value)}` : `EMAIL${t ? `;TYPE=${t.toLowerCase()}` : ''}:${e(m.value)}`);
  }
  for (const u of c.urls) lines.push(`URL:${e(u)}`);
  for (const a of c.addresses) {
    const parts: string[] = ['', '', a.street, a.city, a.region, a.postcode, a.country];
    if (!parts.some((p) => p !== '') && a.raw) parts[2] = a.raw;
    lines.push(`ADR;TYPE=${v === '3.0' ? 'WORK' : 'work'}:${parts.map(e).join(';')}`);
  }
  for (const s of c.socials) {
    const url = socialUrl(s);
    lines.push(`X-SOCIALPROFILE;TYPE=${s.service}:${e(url ?? s.value)}`);
    if (url) lines.push(`URL:${e(url)}`); // some importers drop X-SOCIALPROFILE (D19)
  }
  if (opts.includeNotes !== false) {
    const note = composeNote(c, opts.noteLabels);
    if (note) lines.push(`NOTE:${e(note)}`);
    if (c.tags.length > 0) lines.push(`CATEGORIES:${c.tags.map(e).join(',')}`);
  }
  lines.push('END:VCARD');
  return lines;
}

/** One file with all cards, consecutive vCards, CRLF line ends (also after the last line). */
export function writeVCard(cards: readonly ContactCard[], opts: WriteOptions = {}): string {
  return cards.map((c) => cardLines(c, opts).map(foldLine).join('\r\n') + '\r\n').join('');
}
