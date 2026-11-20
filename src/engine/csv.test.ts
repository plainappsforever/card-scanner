import { VCARD_CONTACTS } from '../../test/fixtures/vcard/contacts';

import { emptyContact } from './contact';
import { CSV_COLUMNS, guardCell, quoteCell, writeCsv } from './csv';

/** Minimal RFC 4180 parser for the test (the independent check is Python's csv module: npm run referee). */
function parse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  return rows;
}

describe('CSV (SPEC §5.4)', () => {
  const rows = VCARD_CONTACTS.map((c, i) => ({ contact: c, addedOn: `2026-10-${String(i + 1).padStart(2, '0')}` }));
  const text = writeCsv(rows);

  it('BOM, CRLF, fixed English header, one row per card', () => {
    expect(text.startsWith('\uFEFFFirst name,Middle name,Last name,')).toBe(true);
    const parsed = parse(text.slice(1));
    expect(parsed[0]).toEqual([...CSV_COLUMNS]);
    expect(parsed).toHaveLength(rows.length + 1);
    expect(parsed.every((r) => r.length === CSV_COLUMNS.length)).toBe(true);
  });

  it('cells carry the values, several values joined with " ; "', () => {
    const anna = parse(text.slice(1))[1];
    const at = (col: (typeof CSV_COLUMNS)[number]) => anna[CSV_COLUMNS.indexOf(col)];
    expect(at('Full name')).toBe('Dr. Anna Maria Weber');
    expect(at('Work phone')).toBe('+49 30 1234567');
    expect(at('Mobile phone')).toBe('+49 171 1234567');
    expect(at('LinkedIn')).toBe('https://www.linkedin.com/in/anna-weber');
    expect(at('Other social')).toBe('xing: https://www.xing.com/profile/Anna_Weber');
    expect(at('Tags')).toBe('Lead ; Supplier, maybe');
    expect(at('Postcode')).toBe('10115');
    const chris = parse(text.slice(1))[15];
    expect(chris[CSV_COLUMNS.indexOf('Company')]).toBe('Smith, Jones & Partners; LLP');
    expect(chris[CSV_COLUMNS.indexOf('Home phone')]).toBe('+1 415 555 0123');
  });

  it('formula guard on hostile cells; phone numbers stay untouched', () => {
    expect(guardCell('Company', '=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(guardCell('Notes', '+1+cmd|calc')).toBe("'+1+cmd|calc");
    expect(guardCell('Notes', '-2+3')).toBe("'-2+3");
    expect(guardCell('Notes', '@SUM(A1)')).toBe("'@SUM(A1)");
    expect(guardCell('Notes', '\tx')).toBe("'\tx");
    expect(guardCell('Work phone', '+49 30 1234567')).toBe('+49 30 1234567');
    expect(guardCell('Work phone', '+49 30 1234567 ; +49 (0)30/99-1')).toBe('+49 30 1234567 ; +49 (0)30/99-1');
    expect(guardCell('Work phone', '+1=1+cmd')).toBe("'+1=1+cmd");
    const hostile = writeCsv([{ contact: { ...emptyContact(), company: '=1+1', notes: 'line1\nline2 "quoted"' }, addedOn: '2026-10-16' }]);
    const r = parse(hostile.slice(1))[1];
    expect(r[CSV_COLUMNS.indexOf('Company')]).toBe("'=1+1");
    expect(r[CSV_COLUMNS.indexOf('Notes')]).toBe('line1\nline2 "quoted"');
  });

  it('quoting', () => {
    expect(quoteCell('plain')).toBe('plain');
    expect(quoteCell('a,b')).toBe('"a,b"');
    expect(quoteCell('say "hi"')).toBe('"say ""hi"""');
    expect(quoteCell(' lead')).toBe('" lead"');
  });
});
