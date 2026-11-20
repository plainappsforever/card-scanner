// Field extractor (SPEC §5.1) — the product's core engine. Pure TypeScript, no React Native imports; the same code runs
// in Jest, in the bench script (Node) and on both phones. Rules (README.md) in this order: 1 pre-normalise/segments,
// 2 codes (QR), 3 e-mail, 4 URL/social, 6 address (run before phones so postcodes are never read as numbers), 5 phones,
// 7 company (strong signals), 8 title/department, 9 name, 7b company fallback, 10 leftovers. Nothing is saved here:
// the result is a proposal the user checks (L26, D17).
import type { Address, ContactCard, NameParts } from '../contact';
import { joinName } from '../contact';
import { companyKey, emailKey, nameKey } from '../match';
import { urlKey } from '../merge';
import { parsePhone } from '../phone';
import { classifyCode } from '../vcard/mecard';
import { socialFromUrl } from '../social';

import { COUNTRIES } from './dict/address';
import { buildSegments, fold, meaningfulRest, ocrDamaged, scriptOf, type Seg } from './normalize';
import { findAddresses, postcodeHits } from './rules/address';
import { domainStems, findCompanyFallback, findCompanyStrong, preferCompanyScript } from './rules/company';
import type { Ctx } from './rules/ctx';
import { domainNearCompany, findEmails, reconcileNameEmail } from './rules/email';
import { findName, splitName } from './rules/name';
import { findPhones } from './rules/phone';
import { finishTitle, markTitles } from './rules/title';
import { findSocialHandles, findUrls, websiteHosts } from './rules/url';
import type { Candidate, Extracted, ExtractInput, Line } from './types';
import { linesFromText } from '../ocr';

export const EXTRACTOR_VERSION = 'x5-2026-10-16'; // x5 = O3 real-OCR fixes; x4 = fix round P5d (B3 misses); x3 = P5c (B2 misses); x2 = P5b (review M1–M5, S1–S15, B1 misses)

const TLD_COUNTRY: Record<string, string> = { uk: 'GB' };
const GENERIC_CC = new Set(['co', 'io', 'me', 'tv', 'cc', 'ai', 'eu', 'ws', 'fm', 'am', 'to', 'la', 'ly', 'gg', 'sh', 'ac', 'is']);

/**
 * Votes for the card's own country from what the card prints: +cc numbers (3 each), country names (4), postcode
 * prefixes "D-79098" (3), address patterns that name their country — US "City, ST 12345", CA, UK and IE postcodes,
 * AU states, 〒, NL/PT/PL/BR/RU forms (3 each, M1) — and e-mail/web ccTLDs (2). The phone region never votes.
 */
export function cardCountryVotes(lines: readonly Line[]): Map<string, number> {
  const text = lines.map((l) => l.text).join('\n');
  const votes = new Map<string, number>();
  const vote = (c: string | undefined, w: number) => c && votes.set(c, (votes.get(c) ?? 0) + w);
  for (const m of text.matchAll(/(?:\+|(?<!\d)00)\d[\d\s().\/-]{5,}\d/g)) {
    const p = parsePhone(m[0]);
    if (p.valid && p.country) vote(p.country, 3);
  }
  for (const l of lines) {
    for (const part of l.text.split(/\s*[,|·•]\s*/)) {
      const c = COUNTRIES[fold(part).replace(/[.]+$/, '').trim()];
      if (c) vote(c, 4);
    }
    const pfx = /(?<![\p{L}])(D|A|CH|F|I|NL|B|L)-\d{4,5}\s/u.exec(l.text);
    if (pfx) vote({ D: 'DE', A: 'AT', CH: 'CH', F: 'FR', I: 'IT', NL: 'NL', B: 'BE', L: 'LU' }[pfx[1]], 3);
    else for (const h of postcodeHits(l.text, undefined)) if (h.country && h.rule !== 'address.eu') vote(h.country, 3);
  }
  for (const m of text.matchAll(/[@.]([a-z0-9-]+\.)+([a-z]{2})(?![a-z])/gi)) {
    const tld = m[2].toLowerCase();
    if (GENERIC_CC.has(tld)) continue;
    vote(TLD_COUNTRY[tld] ?? tld.toUpperCase(), 2);
  }
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) vote('JP', 1);
  if (/\p{Script=Hangul}/u.test(text)) vote('KR', 1);
  return votes;
}

/** The card's country from its own evidence, or undefined when the card names none. */
export function cardEvidenceCountry(lines: readonly Line[]): string | undefined {
  let best: string | undefined;
  let n = 0;
  for (const [c, v] of cardCountryVotes(lines)) if (v > n) [best, n] = [c, v];
  return best;
}

/** The card's country: its own evidence (+cc, address pattern, country name, ccTLD) → else the phone region. */
export function guessCardCountry(lines: readonly Line[], region?: string): string | undefined {
  return cardEvidenceCountry(lines) ?? region;
}

function fromCodes(ctx: Ctx, codes: ExtractInput['qr']): void {
  (codes ?? []).forEach((code, i) => {
    const id = `q${i}`;
    ctx.lines.push({ id, text: code.text });
    const c = classifyCode(code.text);
    const high = <T,>(value: T, rule: string): Candidate<T> => ({ value, confidence: 'high', sources: [id], rule });
    if (c.kind === 'contact') {
      const card = c.contacts[0];
      if (card.name && joinName(card.name)) {
        // MECARD "N:Anna Weber" (no comma) / a vCard with FN only: the code does not say which part is which (S4)
        const n = card.name;
        const unsplit = (!n.given && !n.family) || (!n.given && /\s/.test(n.family.trim()));
        if (unsplit) {
          const text = (n.family || n.full).trim();
          ctx.name = { value: { ...splitName(text, scriptOf(text), ctx).parts, prefix: n.prefix, suffix: n.suffix || splitName(text, scriptOf(text), ctx).parts.suffix }, confidence: 'medium', sources: [id], rule: `qr.${c.format}.split` };
        } else ctx.name = high(card.name, `qr.${c.format}`);
      }
      if (card.company) ctx.company = high(card.company, `qr.${c.format}`);
      if (card.department) ctx.department = high(card.department, `qr.${c.format}`);
      if (card.title) ctx.title = high(card.title, `qr.${c.format}`);
      for (const p of card.phones) {
        const parsed = parsePhone(p.value, ctx.cardCountry ?? ctx.region);
        const type = p.type === 'other' && parsed.valid ? (parsed.numberType === 'mobile' ? 'mobile' : 'work') : p.type;
        // a code number without +cc that is only valid through the phone region is not sure either (M1)
        const regionOnly = parsed.valid && !ctx.countryEvidence && !/^\s*(\+|00[1-9])/.test(p.value);
        // a code number without a type (MECARD "TEL:", vCard TEL without TYPE) takes its type from the printed label later
        const cand = high({ value: parsed.valid ? parsed.display : p.value, type, e164: parsed.e164, raw: p.value, labelled: true }, `qr.${c.format}${p.type === 'other' ? '.untyped' : ''}`);
        ctx.phones.push(regionOnly || !parsed.valid ? { ...cand, confidence: parsed.valid ? 'medium' : 'low' } : cand);
      }
      for (const e of card.emails) ctx.emails.push(high({ value: e.value.toLowerCase(), type: e.type === 'other' ? 'work' : e.type }, `qr.${c.format}`));
      for (const u of card.urls) ctx.urls.push(high(u, `qr.${c.format}`));
      for (const s of card.socials) ctx.socials.push(high(s, `qr.${c.format}`));
      for (const a of card.addresses) ctx.addresses.push(high(a, `qr.${c.format}`));
    } else if (c.kind === 'url') {
      const s = socialFromUrl(c.url);
      if (s) ctx.socials.push(high(s, 'qr.url'));
      else ctx.urls.push(high(c.url, 'qr.url'));
    } else if (c.kind === 'phone') {
      const p = parsePhone(c.value, ctx.cardCountry ?? ctx.region);
      ctx.phones.push(high({ value: p.valid ? p.display : c.value, type: p.numberType === 'mobile' ? 'mobile' : 'work', e164: p.e164, raw: c.value, labelled: false }, 'qr.tel'));
    } else if (c.kind === 'email') ctx.emails.push(high({ value: c.value.toLowerCase(), type: 'work' }, 'qr.mailto'));
  });
}

/** OCR values that repeat a code's value confirm it (its sources grow); differing scalars become alternatives. */
/**
 * Codes win as the default value; printed text that agrees confirms them (for names the printed split is kept: the
 * card shows which part is the family name). A code that CONFLICTS with the printed text is not sure (S5: a QR of
 * another person, a colleague's vCard) → medium, the printed value as the alternative.
 */
function mergeScalar<T>(code: Candidate<T> | undefined, ocr: Candidate<T> | undefined, key: (v: T) => string, keepOcrValue = false, contains = false): { value?: Candidate<T>; alt?: Candidate<T> } {
  if (!code) return { value: ocr };
  if (!ocr) return { value: code };
  const [kc, ko] = [key(code.value), key(ocr.value)];
  // a logo that is the start of the code's company ("POLARSTERN" / "Polarstern Medien GmbH") agrees with it
  if (kc === ko || (contains && ko.length >= 4 && (kc.startsWith(ko) || ko.startsWith(kc)))) {
    const confidence = code.confidence === 'high' || ocr.confidence === 'high' ? 'high' : 'medium';
    return { value: { ...code, value: keepOcrValue && kc === ko ? ocr.value : code.value, confidence, sources: [...new Set([...code.sources, ...ocr.sources])] } };
  }
  return { value: { ...code, confidence: code.confidence === 'low' ? 'low' : 'medium' }, alt: ocr };
}

function dedupe<T>(list: Candidate<T>[], key: (v: T) => string): Candidate<T>[] {
  const out: Candidate<T>[] = [];
  for (const c of list) {
    const k = key(c.value);
    const twin = out.find((o) => key(o.value) === k);
    if (twin) twin.sources = [...new Set([...twin.sources, ...c.sources])];
    else out.push(c);
  }
  return out;
}

/** One address per postcode+city (a QR address and the printed one): the first wins, a street fills in, sources join. */
function dedupeAddresses(list: Candidate<Address>[]): Candidate<Address>[] {
  const out: Candidate<Address>[] = [];
  for (const c of list) {
    // the same postcode is the same address (front in Japanese, back in English); without one, postcode+city
    const pc = c.value.postcode.replace(/\s/g, '');
    const key = `${pc}|${fold(c.value.city)}`;
    const twin = out.find((o) => (pc !== '' ? o.value.postcode.replace(/\s/g, '') === pc : key !== '|' && `|${fold(o.value.city)}` === key));
    if (!twin) {
      out.push(c);
      continue;
    }
    twin.sources = [...new Set([...twin.sources, ...c.sources])];
    if (!twin.value.street && c.value.street) twin.value = { ...twin.value, street: c.value.street };
  }
  return out;
}

/**
 * Layout repairs before the rules see the text: a word broken at the line end ("Geschäftsführende Gesell-" /
 * "schafterin") or an address broken at a hyphen ("…@klinikum-" / "nordstadt.de") is one text again; a letter-spaced
 * logo ("W E I N G U T") is one word. The second line of a join is remembered so every field and leftover that uses the
 * first line points at both (nothing read is hidden).
 */
export function repairLayout(lines: readonly Line[]): { lines: Line[]; joins: Map<string, string>; repaired: Set<string> } {
  const out: Line[] = [];
  const joins = new Map<string, string>();
  const repaired = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    let text = /^(?:\p{L} ){3,}\p{L}$/u.test(a.text.trim()) ? a.text.trim().replace(/ /g, '') : a.text;
    // "Mike 0'Brien": a zero before an apostrophe and a capital is the letter O (the line stays marked as damaged, P5c)
    text = text.replace(/(?<![\p{L}\d])0'(?=\p{Lu})/gu, "O'");
    // "Ho|tenauer Straße", "McA||ister": a "|" glued between a letter and a lower-case letter is an OCR "l"; "A|-Qahtani",
    // "E|-Sayed": the Arabic article before a hyphen (P5d). Same length, so every span stays; the line stays damaged.
    const unpiped = text.replace(/(?<=\p{L})\|{1,2}(?=\p{Ll})/gu, (m) => 'l'.repeat(m.length)).replace(/(?<=(?:^|[\s(])[AE])\|(?=-\p{Lu})/gu, 'l');
    if (unpiped !== text) repaired.add(a.id);
    text = unpiped;
    const b = lines[i + 1];
    const sameSide = b && b.id.replace(/\d.*$/, '') === a.id.replace(/\d.*$/, '');
    const below = !!b && (!a.box || !b.box || (b.box.y > a.box.y && b.box.y - (a.box.y + a.box.h) < 2 * a.box.h && Math.abs(a.box.x - b.box.x) < 0.08));
    if (sameSide && below && /\p{L}-$/u.test(text.trimEnd()) && /^\p{Ll}/u.test(b.text.trimStart())) {
      const head = text.trimEnd();
      const tail = b.text.trim();
      // an e-mail or web address keeps its real hyphen; a hyphenated word loses the break
      const keep = /@|www\.|https?:/i.test(head) || /^[a-z0-9-]+\.[a-z]{2,}(?![\p{L}])/u.test(tail);
      text = keep ? `${head}${tail}` : `${head.slice(0, -1)}${tail}`;
      joins.set(a.id, b.id);
      out.push({ ...a, text });
      i++;
      continue;
    }
    out.push(text === a.text ? a : { ...a, text });
  }
  return { lines: out, joins, repaired };
}

/** OCR line confidence below which the reader itself was unsure (Apple Vision reports 0.5 for such lines). */
export const OCR_UNSURE = 0.7;

/**
 * L26 (P5c): a value read from a line the OCR marks as unsure is never "sure" — high → medium. A code (QR) source that
 * agrees keeps it high: the code was read independently of the OCR.
 */
function capUnsure(cands: (Candidate<unknown> | undefined)[], lines: readonly Line[], repaired: ReadonlySet<string>): void {
  const conf = new Map(lines.map((l) => [l.id, l.conf]));
  for (const c of cands) {
    if (!c || c.confidence !== 'high' || c.sources.some((id) => id.startsWith('q'))) continue;
    if (c.sources.some((id) => (conf.get(id.split('~')[0]) ?? 1) < OCR_UNSURE)) {
      c.confidence = 'medium';
      c.rule = `${c.rule}+ocr-unsure`;
    } else if (c.sources.some((id) => repaired.has(id.split('~')[0]))) {
      // a value read through a layout repair ("Ho|tenauer" → "Holtenauer", P5d) is a reading, not proof
      c.confidence = 'medium';
      c.rule = `${c.rule}+ocr-repaired`;
    }
  }
}

/**
 * A code number without a type ("MECARD:…;TEL:+1415…") that is also printed with a label ("Mobile +1 415 …") is ONE
 * entry: the printed label decides the type, the code joins the sources (P5c, B2 us-02). Never two entries for one number.
 */
function mergeUntypedCodePhones(ctx: Ctx): void {
  ctx.phones = ctx.phones.filter((p) => {
    if (!p.rule.endsWith('.untyped') || !p.value.e164) return true;
    const printed = ctx.phones.find((o) => o !== p && !o.rule.startsWith('qr.') && o.value.e164 === p.value.e164);
    if (!printed) return true;
    printed.sources = [...new Set([...printed.sources, ...p.sources])];
    return false;
  });
}

/**
 * Pasted e-mail text: the quoted reply below the signature ("On Tue, … Lena Brandt <lena@…> wrote:", "Am … schrieb …:",
 * "-----Original Message-----", "> …", an Outlook "From: …@…" header) belongs to another person — its lines are listed
 * as "Text on the card" but no field is read from them (P5d, B3 sig-03). Box-less (pasted) lines only.
 */
const QUOTE_START = /^(?:>|-{2,}\s*(?:original message|urspr(?:ü|ue)ngliche nachricht|message d'origine|mensaje original|messaggio originale)|(?:from|von|de|da|van|fra|od)\s*:\s*.*@|(?:on|am|le|el|il|em|op|den|på|w dniu)\s.{4,}\s(?:wrote|schrieb|a écrit|escribió|ha scritto|escreveu|schreef|skrev|napisał)\b.*:?\s*$)/iu;
export function quotedReplyLines(lines: readonly Line[]): Set<string> {
  const out = new Set<string>();
  const start = lines.findIndex((l, i) => i > 0 && !l.box && QUOTE_START.test(l.text.trim()));
  if (start > 0) for (const l of lines.slice(start)) if (!l.box) out.add(l.id);
  return out;
}

export function extract(input: ExtractInput): Extracted {
  const front = input.front ?? [];
  const back = input.back ?? [];
  const lines: Line[] = [...front, ...back];
  const layout = repairLayout(lines);
  const quoted = quotedReplyLines(layout.lines);
  const segs: Seg[] = buildSegments(layout.lines.filter((l) => !quoted.has(l.id)));
  const ctx: Ctx = {
    segs,
    lines: [...lines],
    region: input.region,
    cardCountry: guessCardCountry(layout.lines.filter((l) => !quoted.has(l.id)), input.region),
    countryEvidence: cardEvidenceCountry(layout.lines.filter((l) => !quoted.has(l.id))) !== undefined,
    damaged: new Set(lines.filter((l) => ocrDamaged(l.text) || (l.conf !== undefined && l.conf < OCR_UNSURE)).map((l) => l.id)),
    uiLang: input.uiLang ?? 'en',
    stems: [],
    emails: [],
    urls: [],
    socials: [],
    phones: [],
    addresses: [],
    alternatives: {},
    titleSegs: new Map(),
  };
  // 2 — codes first
  fromCodes(ctx, input.qr);
  const code = { name: ctx.name, company: ctx.company, title: ctx.title, department: ctx.department };
  ctx.name = ctx.company = ctx.title = ctx.department = undefined;
  // 3, 4 — e-mail, web, socials
  findEmails(ctx, websiteHosts(layout.lines.filter((l) => !quoted.has(l.id)).map((l) => l.text)));
  findUrls(ctx);
  findSocialHandles(ctx);
  ctx.stems = domainStems([...ctx.emails.map((e) => e.value.value.split('@')[1] ?? ''), ...ctx.urls.map((u) => urlKey(u.value).split('/')[0])]);
  // 6, 5 — addresses, then phones (postcodes are never numbers)
  findAddresses(ctx);
  findPhones(ctx);
  mergeUntypedCodePhones(ctx);
  // 7, 8, 9 — company, title/department, name; company fallback once the name is known
  findCompanyStrong(ctx);
  markTitles(ctx);
  const nameSeg = findName(ctx);
  const found = ctx.name as Candidate<NameParts> | undefined; // set by findName (TS cannot see the mutation)
  if (found) preferCompanyScript(ctx, scriptOf(found.value.full), scriptOf);
  if (found) reconcileNameEmail(ctx, found);
  finishTitle(ctx, nameSeg);
  findCompanyFallback(ctx, new Set(nameSeg ? [nameSeg.id] : []));
  domainNearCompany(ctx);

  // codes win; OCR agreement confirms, conflicts become alternatives
  const nm = mergeScalar<NameParts>(code.name, ctx.name, (n) => nameKey(n), true);
  const co = mergeScalar<string>(code.company, ctx.company, companyKey, false, true);
  const ti = mergeScalar<string>(code.title, ctx.title, (s) => fold(s));
  const de = mergeScalar<string>(code.department, ctx.department, (s) => fold(s));
  const alternatives: Extracted['alternatives'] = { ...ctx.alternatives };
  if (nm.alt) alternatives.name = nm.alt;
  if (co.alt) alternatives.company = co.alt;
  if (ti.alt) alternatives.title = ti.alt;
  if (de.alt) alternatives.department = de.alt;

  // 10 — leftovers: lines with no used segment; unused remainders of partly used lines as pseudo-lines "<id>~<k>"
  const leftovers: string[] = [];
  const outLines: Line[] = [...ctx.lines];
  const byLine = new Map<string, Seg[]>();
  for (const s of segs) byLine.set(s.lineId, [...(byLine.get(s.lineId) ?? []), s]);
  const usedLines = new Set<string>();
  for (const c of [nm.value, co.value, ti.value, de.value, ctx.otherName, ...ctx.phones, ...ctx.emails, ...ctx.urls, ...ctx.socials, ...ctx.addresses]) for (const id of c?.sources ?? []) usedLines.add(id);
  for (const [lineId, ss] of byLine) {
    if (!usedLines.has(lineId) && ss.every((s) => s.used.length === 0)) {
      if (ss.some((s) => meaningfulRest(s))) leftovers.push(lineId);
      continue;
    }
    ss.forEach((s, k) => {
      const rest = meaningfulRest(s);
      if (!rest) return;
      const id = `${lineId}~${k}`;
      outLines.push({ ...s.line, id, text: rest });
      leftovers.push(id);
    });
  }

  // the quoted reply of a pasted e-mail: shown as text, never read into fields
  for (const id of quoted) leftovers.push(id);
  // a joined second line belongs to every field (and leftover) of its first line
  if (layout.joins.size > 0) {
    for (const c of [nm.value, co.value, ti.value, de.value, ctx.otherName, ...ctx.phones, ...ctx.emails, ...ctx.urls, ...ctx.socials, ...ctx.addresses]) {
      if (!c) continue;
      for (const [a, b] of layout.joins) if (c.sources.includes(a) && !c.sources.includes(b)) c.sources = [...c.sources, b];
    }
    for (const [a, b] of layout.joins) if (leftovers.some((l) => l === a || l.startsWith(`${a}~`)) && !leftovers.includes(b)) leftovers.push(b);
  }
  capUnsure([nm.value, co.value, ti.value, de.value, ctx.otherName, ...ctx.phones, ...ctx.emails, ...ctx.urls, ...ctx.socials, ...ctx.addresses], lines, layout.repaired);
  return {
    name: nm.value,
    otherName: ctx.otherName,
    company: co.value,
    department: de.value,
    title: ti.value,
    // same number + extension + type only (M5): "Tel 0761 292827" and "Fax 0761 292827" are two entries
    phones: dedupe(ctx.phones, (p) => `${p.e164 ?? p.raw.replace(/\D/g, '')}|${p.ext ?? ''}|${p.type}`),
    emails: dedupe(ctx.emails, (e) => emailKey(e.value)),
    urls: dedupe(ctx.urls, urlKey),
    socials: dedupe(ctx.socials, (s) => `${s.service}:${urlKey(s.value)}`),
    addresses: dedupeAddresses(ctx.addresses),
    alternatives,
    leftovers,
    lines: outLines,
    version: EXTRACTOR_VERSION,
  };
}

/** Pasted text (e-mail signature): every text line becomes a line without a box (SPEC §5.1 input). */
export function extractText(text: string, opts: { region?: string; uiLang?: string } = {}): Extracted {
  return extract({ front: linesFromText(text), region: opts.region, uiLang: opts.uiLang });
}

/** The proposal as a contact (confidences dropped) — for the matcher banner before the user confirms. */
export function toContact(x: Extracted): ContactCard {
  return {
    name: x.name?.value,
    otherName: x.otherName?.value,
    company: x.company?.value,
    department: x.department?.value,
    title: x.title?.value,
    phones: x.phones.map((p) => ({ value: p.value.value, type: p.value.type, ...(p.value.e164 ? { e164: p.value.e164 } : {}) })),
    emails: x.emails.map((e) => e.value),
    urls: x.urls.map((u) => u.value),
    socials: x.socials.map((s) => s.value),
    addresses: x.addresses.map((a) => a.value),
    tags: [],
  };
}
