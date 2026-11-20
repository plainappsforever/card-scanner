// CSV export (SPEC §5.4, D19). UTF-8 with BOM (Excel), CRLF, RFC 4180 quoting, fixed English header documented for
// Salesforce / HubSpot / Zoho / Google imports. Several values in one cell are joined with " ; ". Formula-injection
// guard (OWASP): a cell starting with = + - @ tab or CR gets a leading ' — except phone columns whose value matches
// ^\+?[0-9 ()./-]+$ (cannot carry a formula), so "+49 30 …" stays importable. Pure.
import type { ContactCard } from './contact';
import { displayName } from './format';

export const CSV_COLUMNS = [
  'First name',
  'Middle name',
  'Last name',
  'Prefix',
  'Suffix',
  'Full name',
  'Other name',
  'Company',
  'Department',
  'Job title',
  'Mobile phone',
  'Work phone',
  'Fax',
  'Home phone',
  'Other phones',
  'E-mail 1',
  'E-mail 2',
  'E-mail 3',
  'Website',
  'LinkedIn',
  'Other social',
  'Street',
  'City',
  'Region',
  'Postcode',
  'Country',
  'Event',
  'Met on',
  'Where met',
  'Tags',
  'Notes',
  'Added on',
  'Follow-up on',
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

const PHONE_COLUMNS = new Set<CsvColumn>(['Mobile phone', 'Work phone', 'Fax', 'Home phone', 'Other phones']);
const JOIN = ' ; ';
const SAFE_PHONE = /^\+?[0-9 ()./-]+$/;

export type CsvRow = { contact: ContactCard; addedOn: string; followUpOn?: string };

/** The OWASP guard for one cell. Phone cells that are plainly numbers are left alone. */
export function guardCell(column: CsvColumn, value: string): string {
  if (value === '' || !/^[=+\-@\t\r]/.test(value)) return value;
  if (PHONE_COLUMNS.has(column) && value.split(JOIN).every((v) => SAFE_PHONE.test(v))) return value;
  return `'${value}`;
}

/** RFC 4180: quoted when it contains a quote, comma, semicolon, CR or LF, or leading/trailing space; quotes doubled. */
export function quoteCell(value: string): string {
  return /[",;\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvValues(r: CsvRow): Record<CsvColumn, string> {
  const c = r.contact;
  const n = c.name;
  const phones = (t: string) => c.phones.filter((p) => p.type === t).map((p) => p.value).join(JOIN);
  const emails = c.emails.map((e) => e.value);
  const linkedin = c.socials.filter((s) => s.service === 'linkedin').map((s) => s.value);
  const others = c.socials.filter((s) => s.service !== 'linkedin').map((s) => `${s.service}: ${s.value}`);
  const addr = (k: 'street' | 'city' | 'region' | 'postcode' | 'country') =>
    c.addresses.map((a) => (k === 'street' && !a.street && !a.city && !a.postcode ? a.raw : a[k]).replace(/\n/g, ', ')).join(JOIN).replace(/^( ; )+$/, '');
  return {
    'First name': n?.given ?? '',
    'Middle name': n?.middle ?? '',
    'Last name': n?.family ?? '',
    Prefix: n?.prefix ?? '',
    Suffix: n?.suffix ?? '',
    'Full name': displayName(n),
    'Other name': c.otherName ?? '',
    Company: c.company ?? '',
    Department: c.department ?? '',
    'Job title': c.title ?? '',
    'Mobile phone': phones('mobile'),
    'Work phone': phones('work'),
    Fax: phones('fax'),
    'Home phone': phones('home'),
    'Other phones': phones('other'),
    'E-mail 1': emails[0] ?? '',
    'E-mail 2': emails[1] ?? '',
    'E-mail 3': emails.slice(2).join(JOIN),
    Website: c.urls.join(JOIN),
    LinkedIn: linkedin.join(JOIN),
    'Other social': others.join(JOIN),
    Street: addr('street'),
    City: addr('city'),
    Region: addr('region'),
    Postcode: addr('postcode'),
    Country: addr('country'),
    Event: c.event ?? '',
    'Met on': c.metOn ?? '',
    'Where met': c.metWhere ?? '',
    Tags: c.tags.join(JOIN),
    Notes: c.notes ?? '',
    'Added on': r.addedOn,
    'Follow-up on': r.followUpOn ?? '',
  };
}

export function writeCsv(rows: readonly CsvRow[]): string {
  const lines = [CSV_COLUMNS.map(quoteCell).join(',')];
  for (const r of rows) {
    const v = csvValues(r);
    lines.push(CSV_COLUMNS.map((col) => quoteCell(guardCell(col, v[col]))).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** YYYY-MM-DD in local time (Added on / Follow-up on columns). */
export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
