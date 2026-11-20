// MECARD (NTT DoCoMo; common in QR codes) and BIZCARD readers, and the code classifier for scanned codes
// (SPEC §5.3, §9 "codes"). Pure.
import type { ContactCard } from '../contact';
import { emptyAddress, emptyContact, emptyName } from '../contact';
import { socialFromUrl } from '../social';

import { readVCard } from './reader';

/** Splits "KEY:value;KEY:value;;" at unescaped ';' and unescapes \; \: \, \\ . */
function fields(body: string): [string, string][] {
  const out: [string, string][] = [];
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) cur += body[++i];
    else if (c === ';') {
      if (cur !== '') {
        const colon = cur.indexOf(':');
        if (colon > 0) out.push([cur.slice(0, colon).toUpperCase(), cur.slice(colon + 1)]);
      }
      cur = '';
    } else cur += c;
  }
  if (cur !== '') {
    const colon = cur.indexOf(':');
    if (colon > 0) out.push([cur.slice(0, colon).toUpperCase(), cur.slice(colon + 1)]);
  }
  return out;
}

function addUrl(c: ContactCard, url: string) {
  const s = socialFromUrl(url);
  if (s) c.socials.push(s);
  else c.urls.push(url);
}

export function readMecard(text: string): ContactCard | null {
  const m = /^\s*MECARD:([\s\S]*)$/i.exec(text);
  if (!m) return null;
  const c = emptyContact();
  for (const [k, v] of fields(m[1])) {
    const value = v.trim();
    if (!value) continue;
    if (k === 'N') {
      const [family = '', given = ''] = value.split(',').map((s) => s.trim());
      c.name = { ...emptyName(), family, given, full: given || family ? '' : value };
    } else if (k === 'TEL' || k === 'TEL-AV') c.phones.push({ value, type: 'other' });
    else if (k === 'EMAIL') c.emails.push({ value, type: 'other' });
    else if (k === 'URL') addUrl(c, value);
    else if (k === 'ORG') c.company = value;
    else if (k === 'TITLE') c.title = value;
    else if (k === 'NOTE' || k === 'MEMO') c.notes = value;
    else if (k === 'ADR') {
      // MECARD ADR has the vCard order with commas: PO box, extended, street, city, region, postcode, country
      const p = value.split(',').map((x) => x.trim());
      if (p.length >= 5) {
        const [pobox = '', ext = '', street = '', city = '', region = '', postcode = '', country = ''] = p;
        const st = [pobox, ext, street].filter(Boolean).join(', ');
        c.addresses.push({ ...emptyAddress(), street: st, city, region, postcode, country, raw: [st, [postcode, city].filter(Boolean).join(' '), region, country].filter(Boolean).join(', ') });
      } else c.addresses.push({ ...emptyAddress(), street: value, raw: value });
    }
  }
  return c;
}

export function readBizcard(text: string): ContactCard | null {
  const m = /^\s*BIZCARD:([\s\S]*)$/i.exec(text);
  if (!m) return null;
  const c = emptyContact();
  let given = '';
  let family = '';
  for (const [k, v] of fields(m[1])) {
    const value = v.trim();
    if (!value) continue;
    if (k === 'N') given = value;
    else if (k === 'X') family = value;
    else if (k === 'T') c.title = value;
    else if (k === 'C') c.company = value;
    else if (k === 'A') c.addresses.push({ ...emptyAddress(), street: value, raw: value });
    else if (k === 'B') c.phones.push({ value, type: 'work' });
    else if (k === 'M') c.phones.push({ value, type: 'mobile' });
    else if (k === 'F') c.phones.push({ value, type: 'fax' });
    else if (k === 'E') c.emails.push({ value, type: 'work' });
  }
  if (given || family) c.name = { ...emptyName(), given, family };
  return c;
}

export type CodeContent =
  | { kind: 'contact'; format: 'vcard' | 'mecard' | 'bizcard'; contacts: ContactCard[] }
  | { kind: 'url'; url: string }
  | { kind: 'phone'; value: string }
  | { kind: 'email'; value: string }
  | { kind: 'unreadable' };

/** What a decoded code means for a card: contact data, a link, a number/e-mail, or nothing we can read. */
export function classifyCode(text: string): CodeContent {
  const t = text.trim();
  if (/^BEGIN:VCARD/i.test(t)) {
    const contacts = readVCard(t);
    return contacts.length > 0 ? { kind: 'contact', format: 'vcard', contacts } : { kind: 'unreadable' };
  }
  const me = readMecard(t);
  if (me) return { kind: 'contact', format: 'mecard', contacts: [me] };
  const biz = readBizcard(t);
  if (biz) return { kind: 'contact', format: 'bizcard', contacts: [biz] };
  if (/^https?:\/\/\S+$/i.test(t) || /^www\.\S+\.\S+$/i.test(t)) return { kind: 'url', url: t };
  if (/^tel:/i.test(t)) return { kind: 'phone', value: t.slice(4) };
  if (/^mailto:/i.test(t)) return { kind: 'email', value: t.slice(7).split('?')[0] };
  return { kind: 'unreadable' };
}
