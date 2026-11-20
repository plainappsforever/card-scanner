import { VCARD_CONTACTS } from '../../../test/fixtures/vcard/contacts';
import type { ContactCard } from '../contact';
import { socialUrl } from '../social';

import { classifyCode, readBizcard, readMecard } from './mecard';
import { myCardPayload, QR_PAYLOAD_LIMIT } from './payload';
import { readVCard, unfold } from './reader';
import { utf8Length } from './text';
import { composeNote, escapeValue, foldLine, formattedName, writeVCard } from './writer';

/** What a round trip must preserve (the NOTE carries other name/event/met data as text). */
function comparable(c: ContactCard) {
  const socials = c.socials.map((s) => ({ service: s.service, value: socialUrl(s) ?? s.value }));
  return {
    name: { family: c.name?.family ?? '', given: c.name?.given ?? '', middle: c.name?.middle ?? '', prefix: c.name?.prefix ?? '', suffix: c.name?.suffix ?? '' },
    company: c.company,
    department: c.department,
    title: c.title,
    phones: c.phones.map((p) => ({ value: p.value, type: p.type })),
    emails: c.emails,
    urls: c.urls,
    socials,
    addresses: c.addresses.map((a) => [a.street, a.city, a.region, a.postcode, a.country]),
    note: composeNote(c) || undefined,
    tags: c.tags,
  };
}
function comparableRead(c: ContactCard) {
  const x = comparable(c);
  return { ...x, note: c.notes };
}

describe('vCard writer (SPEC §5.3)', () => {
  const text = writeVCard(VCARD_CONTACTS);

  it('uses CRLF, never lets a physical line exceed 75 octets, and never splits a UTF-8 character', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of text.split('\r\n')) expect(utf8Length(line)).toBeLessThanOrEqual(75);
    expect(text).not.toContain('�');
  });

  it('folds at multi-byte boundaries and unfolding gives the original line back', () => {
    const long = `NOTE:${'äöü👩\u200D💻漢字'.repeat(20)}`;
    const folded = foldLine(long);
    expect(folded.split('\r\n').every((l) => utf8Length(l) <= 75)).toBe(true);
    expect(unfold(folded)).toEqual([long]);
  });

  it('escapes backslash, comma, semicolon and newlines', () => {
    expect(escapeValue('a\\b,c;d\ne')).toBe('a\\\\b\\,c\\;d\\ne');
    expect(text).toContain('ORG:Smith\\, Jones & Partners\\; LLP');
    expect(text).toContain('TITLE:Partner\\\\Counsel');
  });

  it('writes the documented properties: types, socials twice, NOTE and CATEGORIES, FN never empty', () => {
    const anna = writeVCard([VCARD_CONTACTS[0]]);
    for (const l of ['VERSION:3.0', 'N:Weber;Anna;Maria;Dr.;', 'FN:Dr. Anna Maria Weber', 'ORG:ACME GmbH;Vertrieb', 'TEL;TYPE=WORK,VOICE:+49 30 1234567', 'TEL;TYPE=CELL,VOICE:+49 171 1234567', 'TEL;TYPE=WORK,FAX:+49 30 1234568', 'EMAIL;TYPE=INTERNET,WORK:anna.weber@acme-de.example', 'ADR;TYPE=WORK:;;Musterstraße 12;Berlin;;10115;Deutschland', 'X-SOCIALPROFILE;TYPE=linkedin:https://www.linkedin.com/in/anna-weber', 'URL:https://www.linkedin.com/in/anna-weber', 'CATEGORIES:Lead,Supplier\\, maybe']) {
      expect(anna).toContain(l);
    }
    expect(unfold(anna).join('\n')).toContain('NOTE:Event: Hannover Messe 2026\\nMet on: 2026-04-20\\nWhere met: Halle 7\\, Stand B12\\nWants a quote\\;');
    expect(anna).not.toMatch(/PHOTO|REV:|PRODID/);
    expect(writeVCard([VCARD_CONTACTS[0]], { includeNotes: false })).not.toMatch(/NOTE|CATEGORIES/);
    expect(formattedName(VCARD_CONTACTS[16])).toBe('Only Company Inc.');
    expect(formattedName(VCARD_CONTACTS[17])).toBe('nobody@example.org');
    expect(writeVCard([VCARD_CONTACTS[2]])).toContain('FN:山田太郎');
  });

  it('is deterministic', () => {
    expect(writeVCard(VCARD_CONTACTS)).toBe(text);
  });
});

describe('vCard reader round trip (A7, own fixtures)', () => {
  it.each(['3.0', '4.0'] as const)('reads every card written as %s back to the same fields', (version) => {
    const back = readVCard(writeVCard(VCARD_CONTACTS, { version }));
    expect(back).toHaveLength(VCARD_CONTACTS.length);
    back.forEach((c, i) => expect(comparableRead(c)).toEqual(comparable(VCARD_CONTACTS[i])));
  });

  it('4.0 writes tel: URIs for valid numbers', () => {
    const v4 = writeVCard([VCARD_CONTACTS[0]], { version: '4.0' });
    expect(v4).toContain('TEL;VALUE=uri;TYPE="cell,voice":tel:+491711234567');
    expect(readVCard(v4)[0].phones[1]).toEqual({ value: '+49 171 1234567', type: 'mobile', e164: '+491711234567' });
  });
});

describe('vCard reader: foreign formats', () => {
  it('2.1 with quoted-printable, charset, bare types and soft line breaks', () => {
    const v21 = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=BCrgen M=C3=BCller',
      'TEL;WORK;VOICE:+49 89 123456',
      'TEL;CELL:0171 2345678',
      'ADR;WORK;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:;;Hauptstra=DFe 5;M=FCnchen;;80331;=',
      'Deutschland',
      'NOTE;ENCODING=QUOTED-PRINTABLE:Zeile eins=0D=0AZeile zwei',
      'END:VCARD',
    ].join('\r\n');
    const [c] = readVCard(v21);
    expect(c.name).toMatchObject({ family: 'Müller', given: 'Jürgen', full: 'Jürgen Müller' });
    expect(c.phones).toEqual([{ value: '+49 89 123456', type: 'work' }, { value: '0171 2345678', type: 'mobile' }]);
    expect(c.addresses[0]).toMatchObject({ street: 'Hauptstraße 5', city: 'München', postcode: '80331', country: 'Deutschland' });
    expect(c.notes).toBe('Zeile eins\r\nZeile zwei');
  });

  it('grouped properties (Apple item1.), 4.0 quoted params, base64 text, several cards, LF only', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Doe;Jane;;;',
      'FN:Jane Doe',
      'item1.TEL;type=pref:+1 212 555 0100',
      'item1.X-ABLabel:Direct',
      'item2.EMAIL;type=INTERNET;type=WORK:jane@doe.example',
      'TITLE;ENCODING=b:Q0VP',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:Max Mustermann',
      'TEL;TYPE="voice,cell";VALUE=uri:tel:+49-171-1234567',
      'URL:https://www.linkedin.com/in/max',
      'END:VCARD',
    ].join('\n');
    const [jane, max] = readVCard(text);
    expect(jane).toMatchObject({ title: 'CEO', emails: [{ value: 'jane@doe.example', type: 'work' }], phones: [{ value: '+1 212 555 0100', type: 'other' }] });
    expect(max.name).toMatchObject({ full: 'Max Mustermann', given: '', family: '' });
    expect(max.phones[0]).toMatchObject({ value: '+49-171-1234567', type: 'mobile' });
    expect(max.socials).toEqual([{ service: 'linkedin', value: 'https://www.linkedin.com/in/max' }]);
    expect(max.urls).toEqual([]);
  });

  it('MECARD and BIZCARD with escapes; code classification', () => {
    const me = readMecard('MECARD:N:Weber,Anna;TEL:+4930123456;EMAIL:anna@acme-de.example;URL:https://acme.de;ORG:ACME\\; Co;NOTE:a\\:b;;');
    expect(me).toMatchObject({ name: { family: 'Weber', given: 'Anna' }, company: 'ACME; Co', notes: 'a:b', urls: ['https://acme.de'], phones: [{ value: '+4930123456' }] });
    expect(readBizcard('BIZCARD:N:Sean;X:Owen;T:Engineer;C:Google;B:+12125551212;E:sean@google-com.example;;')).toMatchObject({ name: { given: 'Sean', family: 'Owen' }, company: 'Google', title: 'Engineer' });
    expect(classifyCode('https://www.linkedin.com/in/x')).toEqual({ kind: 'url', url: 'https://www.linkedin.com/in/x' });
    expect(classifyCode('tel:+4930123')).toEqual({ kind: 'phone', value: '+4930123' });
    expect(classifyCode('mailto:a@b-de.example?subject=x')).toEqual({ kind: 'email', value: 'a@b-de.example' });
    expect(classifyCode('LEAD:8f3a91c0ffee')).toEqual({ kind: 'unreadable' });
    expect(classifyCode(writeVCard([VCARD_CONTACTS[1]]))).toMatchObject({ kind: 'contact', format: 'vcard' });
  });
});

describe('My card QR payload', () => {
  it('drops socials, then addresses, above 1,200 bytes and says so', () => {
    const big: ContactCard = {
      ...VCARD_CONTACTS[0],
      socials: Array.from({ length: 12 }, (_, i) => ({ service: 'other' as const, value: `https://example.com/profile/a-very-long-handle-number-${i}` })),
      addresses: Array.from({ length: 6 }, () => VCARD_CONTACTS[0].addresses[0]),
    };
    const p = myCardPayload(big);
    expect(p.omitted).toContain('socials');
    expect(p.bytes).toBeLessThanOrEqual(QR_PAYLOAD_LIMIT);
    expect(p.text).not.toMatch(/NOTE|CATEGORIES/);
    expect(myCardPayload(VCARD_CONTACTS[1])).toMatchObject({ omitted: [], fits: true });
  });
});
