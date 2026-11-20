// vCard reader (SPEC §5.3): versions 2.1 / 3.0 / 4.0, unfolding, grouped properties (item1.TEL), 2.1 bare type
// parameters, QUOTED-PRINTABLE + CHARSET, ENCODING=b/BASE64 text, 4.0 quoted parameter lists and tel: URIs, several
// cards per file. Returns the extractor's contact model. Pure.
import type { Address, ContactCard, EmailType, PhoneType, Social, SocialService } from '../contact';
import { emptyAddress, emptyContact, emptyName, SOCIAL_SERVICES } from '../contact';
import { formatInternational } from '../phone';
import { socialFromUrl } from '../social';

import { base64Bytes, decodeLatin1, decodeUtf8, utf8Bytes } from './text';

export type Property = { group: string; name: string; params: Record<string, string[]>; value: string };

/** Unfolds CRLF/LF + space/tab continuations; joins 2.1 quoted-printable soft breaks ("=" at the end of a line). */
export function unfold(text: string): string[] {
  const raw = text.replace(/\r\n|\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (/^[ \t]/.test(line) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
      continue;
    }
    // QP soft line breaks: the property declares QUOTED-PRINTABLE and the line ends with "=".
    if (/ENCODING=QUOTED-PRINTABLE|;QUOTED-PRINTABLE[;:]/i.test(line.split(':')[0] ?? '')) {
      while (line.endsWith('=') && i + 1 < raw.length) line = line.slice(0, -1) + raw[++i].replace(/^[ \t]/, '');
    }
    lines.push(line);
  }
  return lines.filter((l) => l.trim() !== '');
}

/** Splits at the first ':' that is not inside a quoted parameter value. */
function splitNameValue(line: string): [string, string] | null {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) return [line.slice(0, i), line.slice(i + 1)];
  }
  return null;
}

function splitParams(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const c of s) {
    if (c === '"') quoted = !quoted;
    if (c === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseProperty(line: string): Property | null {
  const nv = splitNameValue(line);
  if (!nv) return null;
  const [head, value] = nv;
  const [nameWithGroup, ...paramParts] = splitParams(head);
  const dot = nameWithGroup.lastIndexOf('.');
  const group = dot >= 0 ? nameWithGroup.slice(0, dot) : '';
  const name = (dot >= 0 ? nameWithGroup.slice(dot + 1) : nameWithGroup).toUpperCase();
  const params: Record<string, string[]> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    const key = eq >= 0 ? p.slice(0, eq).toUpperCase() : 'TYPE'; // 2.1 bare parameters: TEL;WORK;VOICE
    const rawVals = eq >= 0 ? p.slice(eq + 1) : p;
    const vals = rawVals.replace(/^"|"$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '').trim()).filter(Boolean);
    const bare = eq < 0 ? rawVals.toUpperCase() : '';
    if (bare === 'QUOTED-PRINTABLE' || bare === 'BASE64' || bare === 'B') (params.ENCODING ??= []).push(bare);
    else (params[key] ??= []).push(...vals);
  }
  return { group, name, params, value };
}

function decodeQp(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(...utf8Bytes(s[i]));
  }
  return out;
}

function decodeBytes(bytes: number[], charset: string | undefined): string {
  const cs = (charset ?? 'UTF-8').toUpperCase();
  if (cs === 'ISO-8859-1' || cs === 'LATIN1' || cs === 'WINDOWS-1252' || cs === 'CP1252') return decodeLatin1(bytes);
  return decodeUtf8(bytes);
}

/** The property value after transfer decoding (QP, base64) — still vCard-escaped. */
function decodedValue(p: Property): string {
  const enc = (p.params.ENCODING ?? []).map((e) => e.toUpperCase());
  const charset = p.params.CHARSET?.[0];
  if (enc.includes('QUOTED-PRINTABLE')) return decodeBytes(decodeQp(p.value), charset);
  if (enc.includes('B') || enc.includes('BASE64')) return decodeBytes(base64Bytes(p.value), charset);
  return p.value;
}

/** Splits at unescaped separators and unescapes each part (\\ \, \; \n \N). */
export function splitEscaped(s: string, sep: ';' | ',' | null): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const n = s[++i];
      cur += n === 'n' || n === 'N' ? '\n' : n;
    } else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}
const unescape = (s: string) => splitEscaped(s, null)[0];

function types(p: Property): string[] {
  return (p.params.TYPE ?? []).map((t) => t.toLowerCase());
}

function phoneTypeOf(t: string[]): PhoneType {
  if (t.includes('fax')) return 'fax';
  if (t.includes('cell') || t.includes('mobile') || t.includes('iphone')) return 'mobile';
  if (t.includes('home')) return 'home';
  if (t.includes('work')) return 'work';
  return 'other';
}

function emailTypeOf(t: string[]): EmailType {
  if (t.includes('home')) return 'home';
  if (t.includes('work')) return 'work';
  return 'other';
}

function serviceOf(t: string[]): SocialService {
  const s = t.find((x) => (SOCIAL_SERVICES as readonly string[]).includes(x === 'twitter' ? 'x' : x));
  return (s === 'twitter' ? 'x' : (s as SocialService | undefined)) ?? 'other';
}

function cardFrom(props: Property[]): ContactCard {
  const c = emptyContact();
  let fn = '';
  const urls: string[] = [];
  const socialUrls = new Set<string>();
  for (const p of props) {
    const value = decodedValue(p);
    const t = types(p);
    switch (p.name) {
      case 'N': {
        const [family = '', given = '', middle = '', prefix = '', suffix = ''] = splitEscaped(value, ';').map((s) => s.trim());
        c.name = { ...emptyName(), family, given, middle, prefix, suffix };
        break;
      }
      case 'FN':
        fn = unescape(value).trim();
        break;
      case 'ORG': {
        const [company = '', ...units] = splitEscaped(value, ';').map((s) => s.trim());
        if (company) c.company = company;
        const dept = units.filter(Boolean).join(', ');
        if (dept) c.department = dept;
        break;
      }
      case 'TITLE':
        if (unescape(value).trim()) c.title = unescape(value).trim();
        break;
      case 'TEL': {
        let v = unescape(value).trim();
        const uri = /^tel:/i.test(v);
        if (uri) v = v.replace(/^tel:/i, '').replace(/;.*$/, '');
        const e164 = uri && /^\+\d{6,15}$/.test(v) ? v : undefined;
        if (v) c.phones.push({ value: e164 ? formatInternational(e164) : v, type: phoneTypeOf(t), ...(e164 ? { e164 } : {}) });
        break;
      }
      case 'EMAIL': {
        const v = unescape(value).trim().replace(/^mailto:/i, '');
        if (v) c.emails.push({ value: v, type: emailTypeOf(t) });
        break;
      }
      case 'URL': {
        const v = unescape(value).trim();
        if (v) urls.push(v);
        break;
      }
      case 'X-SOCIALPROFILE': {
        const v = unescape(value).trim();
        const xUser = p.params['X-USER']?.[0];
        if (!v && !xUser) break;
        const social: Social = { service: serviceOf(t), value: v || xUser! };
        c.socials.push(social);
        socialUrls.add(v.toLowerCase());
        break;
      }
      case 'ADR': {
        const [pobox = '', ext = '', street = '', city = '', region = '', postcode = '', country = ''] = splitEscaped(value, ';').map((s) => s.trim());
        const a: Address = { ...emptyAddress(), street: [pobox, ext, street].filter(Boolean).join('\n'), city, region, postcode, country };
        a.raw = [a.street, [postcode, city].filter(Boolean).join(' '), region, country].filter(Boolean).join(', ');
        if (a.raw) c.addresses.push(a);
        break;
      }
      case 'NOTE': {
        const v = unescape(value).trim();
        if (v) c.notes = c.notes ? `${c.notes}\n${v}` : v;
        break;
      }
      case 'CATEGORIES':
        c.tags.push(...splitEscaped(value, ',').map((s) => s.trim()).filter(Boolean));
        break;
    }
  }
  // URL lines that repeat a social profile are the writer's duplicates (D19); social-domain URLs become socials.
  for (const u of urls) {
    if (socialUrls.has(u.toLowerCase())) continue;
    const s = socialFromUrl(u);
    if (s) c.socials.push(s);
    else c.urls.push(u);
  }
  if (!c.name || (!c.name.family && !c.name.given && !c.name.middle)) c.name = { ...(c.name ?? emptyName()), full: fn };
  else c.name.full = fn;
  if (!c.name.full && !c.name.family && !c.name.given) delete c.name;
  return c;
}

/** All cards in a vCard text (BEGIN:VCARD … END:VCARD blocks; text outside them is ignored). */
export function readVCard(text: string): ContactCard[] {
  const out: ContactCard[] = [];
  let current: Property[] | null = null;
  for (const line of unfold(text)) {
    const p = parseProperty(line);
    if (!p) continue;
    if (p.name === 'BEGIN' && p.value.trim().toUpperCase() === 'VCARD') current = [];
    else if (p.name === 'END' && p.value.trim().toUpperCase() === 'VCARD') {
      if (current) out.push(cardFrom(current));
      current = null;
    } else if (current) current.push(p);
  }
  return out;
}
