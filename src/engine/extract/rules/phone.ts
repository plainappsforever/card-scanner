// Rule 5 — phone numbers (SPEC §5.1). Segments with ≥ 6 digits; registry/tax/bank numbers, addresses, dates, time
// ranges and numbers after a non-phone word ("Kundennummer", "Stand", "ROC #") excluded. Digit confusables (O/o→0,
// l/I/|→1, S→5, B→8) are repaired only inside runs that are already ≥ 70 % digits. A label word decides the type;
// generic labels ("Tel", "Phone") and unlabelled numbers take it from the metadata (mobile → mobile, else work).
// Confidence (L26 — a doubtful number is never "sure"): valid + label → high; valid without label → medium; a number that
// is only valid because of the PHONE REGION (no +cc, no country evidence on the card) → at most medium; a combined
// label ("Tel./Fax") → one entry with the voice type, medium; a specific label the metadata contradicts ("M" on a Berlin
// landline) → medium; invalid but ≥ 7 digits → low, kept as printed (never "corrected" into another number). Pure.
import { parsePhone, phoneType, type ParsedPhone } from '../../phone';
import type { PhoneType } from '../../contact';
import { NOT_PHONE_WORDS, PHONE_LABELS, type PhoneLabel } from '../dict/labels';
import { alternation, consume, foldKeep, repairDigits, type Seg } from '../normalize';
import type { Candidate, PhoneValue } from '../types';

import { isAddressLike } from './address';
import type { Ctx } from './ctx';

export { repairDigits };

// A label never directly follows a letter or a digit ("24h" is not "h(ome)", "5F" is not "F(ax)").
const LABEL_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${alternation(Object.keys(PHONE_LABELS))})(?![\\p{L}])\\s*[.:：]?`, 'giu');
// "Mobil0171 5 55 12 34": a number may also start right after a label word the OCR glued to it (P5c)
const GLUED = alternation(Object.keys(PHONE_LABELS).filter((k) => k.length >= 3 && /^[\p{L}.]+$/u.test(k)));
const NUMBER = new RegExp(`(?:(?<![\\p{L}\\d])|(?<=(?<![\\p{L}])(?:${GLUED})))(\\(?\\+?\\(?\\d[\\d\\s().\\/-]*\\d\\)?)(?![\\p{L}\\d])`, 'giu');
const DATE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^\d{4}[./-]\d{1,2}[./-]\d{1,2}$|^(19|20)\d{2}\s?-\s?(19|20)\d{2}$/;
/** Opening hours "08.00-18.00", "8:00 - 18:30" — never numbers. */
const TIME = /^\d{1,2}[.:]\d{2}(?:\s?[-–]\s?\d{1,2}[.:]\d{2})?$|\d{1,2}:\d{2}/;

// Registry, tax and bank words (SPEC rule 5) block only the number they label. Short words ("TAN", "EIN", "FN", "PAN")
// are also ordinary words or names ("Tan Wei Ming", "Ein Unternehmen der …"): they count only with ":"/"."/"#" or a
// digit run (optionally after a 2-letter country code, "VAT GB123…") right after them.
const REG_LONG = NOT_PHONE_WORDS.filter((w) => w.replace(/[^\p{L}]/gu, '').length >= 5);
const REG_SHORT = NOT_PHONE_WORDS.filter((w) => w.replace(/[^\p{L}]/gu, '').length < 5);
const REG_LONG_RE = new RegExp(`(?<![\\p{L}])(?:${alternation(REG_LONG)})(?![\\p{L}])`, 'giu');
const REG_SHORT_RE = new RegExp(`(?<![\\p{L}])(?:${alternation(REG_SHORT)})(?![\\p{L}])(?=\\s*[.:#：-]|\\s*(?:[a-z]{1,2}[-\\s]?)?\\d)`, 'giu');

/** Words that make the number after them something else: customer/article/licence/booth/member numbers (S6). */
const NOT_BEFORE = new Set([
  'nr', 'no', 'nummer', 'number', 'kundennummer', 'kundennr', 'kunden-nr', 'kd-nr', 'kdnr', 'artikel', 'artikelnummer', 'art-nr', 'lizenz', 'lizenznummer', 'licence', 'license', 'lic', 'kammer',
  'kammer-nr', 'mitglied', 'mitgliedsnummer', 'mitglieds-nr', 'stand', 'booth', 'halle', 'hall', 'ref', 'referenz', 'reference', 'order', 'auftrag', 'auftragsnummer', 'bestellnummer', 'id', 'matrikel',
  'matrikelnummer', 'roc', 'toque', 'dx', 'vertrag', 'vertragsnummer', 'policy', 'police', 'rechnung', 'invoice', 'gas safe', 'reg', 'plz', 'zip', 'pin', 'lot', 'charge', 'serial', 'seriennummer',
]);
const NUMBER_WORD = '(?:nr|no|nummer|number|n°|#)';
// between label and number: separators, a number word ("Tel.-Nr."), or an availability note ("Notdienst 24h:")
const AFTER_LABEL = new RegExp(`^[\\s.:：()/-]*(?:(?:${NUMBER_WORD}|24\\s?h|24\\/7)[\\s.:：()/-]*)?$`, 'u');

type Found = { start: number; end: number; text: string };
type Link = { label: PhoneLabel; start: number; end: number };

function numbersIn(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const start = m.index ?? 0;
    // split "+49 30 1 +49 170 2" at a "+" after a space
    const parts = m[1].split(/(?<=\d)(?=\s+\+)/);
    let off = start;
    for (const p of parts) {
      const lead = p.length - p.trimStart().length;
      const t = p.trim();
      // "Fax 0341 2 15 88 49 04155 Leipzig" (O3 de-k42: two columns read as one line): a 4–5 digit group before a
      // capitalised word, at the end of a run too long for one number, is the postcode of the next column
      const glued = /^(.*\d)\s+\d{4,5}$/u.exec(t);
      const city = /^\s+\p{Lu}\p{Ll}{2,}/u.test(text.slice(off + lead + t.length));
      const head = glued && city && t.replace(/\D/g, '').length >= 14 ? glued[1] : t;
      if (head !== '') out.push({ start: off + lead, end: off + lead + head.length, text: head });
      off += p.length;
    }
  }
  return out;
}

/** "030 123456 / 0171 7654321", "0761 1234, 0761 5678": two numbers when each side is valid alone (S8). */
function splitRun(n: Found, country: string | undefined): Found[] {
  const m = /^(.*\d)(\s+\/\s+|\s*,\s+)(\(?\+?\d.*)$/u.exec(n.text);
  if (!m) return [n];
  const [left, sep, right] = [m[1], m[2], m[3]];
  const ok = (t: string) => t.replace(/\D/g, '').length >= 6 && parsePhone(t, country).valid;
  if (!ok(left) || !ok(right)) return [n];
  const rStart = n.start + left.length + sep.length;
  return [
    { start: n.start, end: n.start + left.length, text: left },
    { start: rStart, end: n.end, text: right },
  ];
}

/**
 * The label run directly before a number: "Tel.", "Tel./Fax", "T/F", "Tel & Fax:", "Phone No." (labels joined by
 * "/", "&", "+", ",", "und", "and", "et", "y", "e", "i", "ve"). Empty when other text sits between label and number.
 */
function labelsBefore(folded: string, pos: number): { labels: PhoneLabel[]; start?: number } {
  let chain: Link[] = [];
  LABEL_RE.lastIndex = 0;
  for (const m of folded.matchAll(LABEL_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (end > pos) break;
    const link: Link = { label: PHONE_LABELS[m[1].toLowerCase()], start, end };
    const prev = chain[chain.length - 1];
    const joined = prev && /^[\s.:：()]*(?:[/&+,]|und|and|et|y|e|i|ve|или|и|和|及)?[\s.:：()]*$/u.test(folded.slice(prev.end, start));
    chain = joined ? [...chain, link] : [link];
  }
  const last = chain[chain.length - 1];
  if (!last || !AFTER_LABEL.test(folded.slice(last.end, pos))) return { labels: [] };
  return { labels: chain.map((c) => c.label), start: chain[0].start };
}

function labelAfter(folded: string, end: number): PhoneLabel | undefined {
  const m = /^\s*\(?\s*([\p{L}.]+)\s*\)?/u.exec(folded.slice(end));
  if (!m) return undefined;
  const l = PHONE_LABELS[m[1].replace(/\.$/, '').toLowerCase()];
  return l && !l.generic && m[1].length > 1 ? l : undefined;
}

/** A registry/tax/bank word before the number with no phone label in between (S7). */
function registryBlocks(folded: string, pos: number): boolean {
  // "RCS Paris B 732 829 320", "RCS Lyon 123 456 789": the French register names its court city before the number (P5c)
  if (/(?<![\p{L}])rcs\s+\p{L}+(?:[\s-]\p{L}+)?\s+(?:[ab]\s+)?$/u.test(folded.slice(0, pos))) return true;
  for (const re of [REG_LONG_RE, REG_SHORT_RE]) {
    re.lastIndex = 0;
    for (const m of folded.matchAll(re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (end > pos) break;
      LABEL_RE.lastIndex = 0;
      if ([...folded.slice(end, pos).matchAll(LABEL_RE)].length === 0) return true;
    }
  }
  return false;
}

/** A non-phone word directly before the number ("Kundennummer 4711 …", "Art.-Nr. …", "Stand 12 …"), unless it follows a phone label ("Tel.-Nr."). */
function nonPhoneWordBefore(folded: string, pos: number): boolean {
  const m = /([\p{L}#°][\p{L}.\-#° ]*?)[\s.:#\-°]*$/u.exec(folded.slice(0, pos));
  if (!m) return false;
  const words = m[1].trim().split(/\s+/);
  const last = words[words.length - 1].replace(/\.+$/, '').replace(/\./g, '');
  const lastTwo = words.slice(-2).join(' ').replace(/\./g, '');
  const hit = NOT_BEFORE.has(last) || NOT_BEFORE.has(lastTwo) || /^(?:art|kd|kunden|mitglieds|kammer|lizenz|auftrags|bestell|vertrags|reg)-?nr$/.test(last);
  if (!hit) return false;
  if (!/^(nr|no|nummer|number|#)$/.test(last)) return true;
  // "Tel. Nr.", "Phone No.", "Fax-Nr." — a phone label right before the number word
  return labelsBefore(folded, pos).labels.length === 0;
}

type Emit = { value: PhoneValue; confidence: Candidate<PhoneValue>['confidence']; rule: string };

const numKey = (v: PhoneValue) => v.e164 ?? v.raw.replace(/\D/g, '');
/** Same number, same extension, same type: the only duplicate that may be merged (M5). */
const sameEntry = (a: PhoneValue, b: PhoneValue) => numKey(a) === numKey(b) && (a.ext ?? '') === (b.ext ?? '') && a.type === b.type;

/** Pushes a phone unless an identical entry exists (then the line joins its sources, so nothing read is lost). */
function push(ctx: Ctx, seg: Seg, e: Emit): void {
  const twin = ctx.phones.find((x) => sameEntry(x.value, e.value));
  if (twin) {
    if (!twin.sources.includes(seg.lineId)) twin.sources = [...twin.sources, seg.lineId];
    return;
  }
  ctx.phones.push({ value: e.value, confidence: e.confidence, sources: [seg.lineId], rule: e.rule });
}

/** Metadata that tells mobile from fixed lines contradicts a specific label ("M 030 1234567") → not sure (S10). */
function contradicts(label: PhoneLabel | undefined, p: ParsedPhone): boolean {
  if (!label || label.generic || !p.valid) return false;
  if (label.type === 'mobile') return p.kind === 'FIXED_LINE';
  if (label.type === 'work' || label.type === 'home' || label.type === 'fax') return p.kind === 'MOBILE';
  return false;
}

const VANITY = /(?<![\p{L}\d])((?:\+?1[\s.-]?)?\(?8(?:00|33|44|55|66|77|88)\)?[.-][A-Z0-9][A-Z0-9\s.-]{5,12}[A-Z0-9])(?![\p{L}\d])/u;
const KEYPAD: Record<string, string> = { A: '2', B: '2', C: '2', D: '3', E: '3', F: '3', G: '4', H: '4', I: '4', J: '5', K: '5', L: '5', M: '6', N: '6', O: '6', P: '7', Q: '7', R: '7', S: '7', T: '8', U: '8', V: '8', W: '9', X: '9', Y: '9', Z: '9' };

export function findPhones(ctx: Ctx): void {
  const country = ctx.cardCountry ?? ctx.region;
  for (const seg of ctx.segs) {
    if (seg.rest.trim() === '' || !/\d/.test(seg.rest)) continue;
    const folded = foldKeep(seg.text);
    if (isAddressLike(seg, ctx.cardCountry)) continue;
    const { text, repaired } = repairDigits(seg.rest);
    const found = numbersIn(text).flatMap((n) => splitRun(n, country));
    for (const n of found) {
      const digits = n.text.replace(/\D/g, '');
      if (digits.length < 6 || digits.length > 17) continue;
      if (DATE.test(n.text) || TIME.test(n.text)) continue;
      if (registryBlocks(folded, n.start) || nonPhoneWordBefore(folded, n.start)) continue;
      // extension after the number: "ext. 23", "x23", "Durchwahl 12", "内線 123"
      const ext = /^\s*(?:ext\.?|extension|x|durchwahl|dw|nst\.?|内線)\s*[.:]?\s*(\d{1,5})(?!\d)/iu.exec(text.slice(n.end));
      const end = ext ? n.end + ext[0].length : n.end;
      const lb = labelsBefore(folded, n.start);
      const after = lb.labels.length ? undefined : labelAfter(folded, end);
      const labels = lb.labels.length ? lb.labels : after ? [after] : [];
      const fax = labels.some((l) => l.type === 'fax');
      const voice = labels.find((l) => l.type !== 'fax' && !l.generic) ?? labels.find((l) => l.type !== 'fax');
      const combined = fax && !!voice;
      const label = combined ? voice : (labels.find((l) => !l.generic) ?? labels[0]);
      const explicitCc = /^\(?\s*(?:\+|00[1-9])/.test(n.text);
      const p = parsePhone(n.text, country);
      if (!p.valid && digits.length < 7) continue;
      if (!p.valid && !label && /^\d{6,8}$/.test(n.text)) continue; // a bare code/number without spaces or label
      // A labelled number that is not valid but has a possible length (unassigned/reserved range) → medium, same digits
      // (D30) — only when the country comes from the card itself, never from the phone region alone (M1)
      const possible = !p.valid && !!label && !!p.possible && (explicitCc || !!ctx.countryEvidence);
      const type: PhoneType = label && !label.generic ? label.type : p.valid ? phoneType(p) : (label?.type ?? 'other');
      const printed = p.valid ? p.display : possible ? (p.possibleDisplay ?? p.display) : seg.rest.slice(n.start, n.end);
      const value = ext && (p.valid || possible) ? `${printed} ext. ${ext[1]}` : printed;
      const e164 = p.e164 ?? (possible ? p.possibleE164 : undefined);
      const wasRepaired = repaired && seg.rest.slice(n.start, n.end) !== n.text;
      const regionOnly = p.valid && !explicitCc && !ctx.countryEvidence;
      const sure = p.valid && !!label && !wasRepaired && !combined && !regionOnly && !contradicts(label, p);
      const confidence = possible ? 'medium' : !p.valid ? 'low' : sure ? 'high' : 'medium';
      const rule = possible ? 'phone.possible' : !p.valid ? 'phone.invalid' : combined ? 'phone.combined' : label ? 'phone.labelled' : 'phone.metadata';
      const base: PhoneValue = { value, type, e164, raw: seg.rest.slice(n.start, n.end), labelled: !!label, ...(ext ? { ext: ext[1] } : {}) };
      // "Tel./Fax 0761 292827": ONE entry with the voice type (a fax-only entry could not be called), medium (M2)
      push(ctx, seg, { value: base, confidence, rule });
      consume(seg, lb.start ?? n.start, end, 'phone');
    }
    findSuffixNumber(ctx, seg, folded);
    findVanity(ctx, seg, country);
  }
}

/** "Durchwahl -127", "F: -19": a labelled suffix that replaces the last digit group of the card's base number "913-0". */
function findSuffixNumber(ctx: Ctx, seg: Seg, folded: string): void {
  // "Durchwahl -12", "Fax -99", and (Austrian) "…80-0, DW 15" — a durchwahl label also without the dash (P5c)
  const m = /^(.*?)(-\s?(\d{1,5}))\s*$/u.exec(seg.rest) ?? /^(.*?(?:durchwahl|dw|klappe|nst)\.?:?\s*)((\d{1,5}))\s*$/iu.exec(seg.rest);
  if (!m || /\d/.test(m[1])) return;
  const lb = labelsBefore(folded, m[1].length);
  if (lb.labels.length === 0) return;
  // the base is a printed number ending in a dash group ("…87-0"), never an earlier composed suffix ("-12")
  const base = [...ctx.phones].reverse().find((p) => p.value.e164 && p.rule !== 'phone.suffix' && /-\s?\d{1,5}$/.test(p.value.raw));
  if (!base) return;
  const composed = base.value.raw.replace(/-\s?\d{1,5}$/, `-${m[3]}`);
  const p = parsePhone(composed, ctx.cardCountry ?? ctx.region);
  if (!p.valid) return;
  const label = lb.labels.find((l) => !l.generic) ?? lb.labels[0];
  const type: PhoneType = label && !label.generic ? label.type : phoneType(p);
  push(ctx, seg, { value: { value: p.display, type, e164: p.e164, raw: m[2], labelled: true }, confidence: 'medium', rule: 'phone.suffix' });
  consume(seg, lb.start ?? m[1].length, seg.rest.length, 'phone');
}

/** "1-800-GO-PLUMB": letters on the keypad (North American toll-free numbers only) → medium. */
function findVanity(ctx: Ctx, seg: Seg, country: string | undefined): void {
  const m = VANITY.exec(seg.rest);
  if (!m || m.index === undefined || (m[1].match(/[A-Z]/g) ?? []).length < 2) return;
  const digits = m[1].replace(/[A-Z]/g, (c) => KEYPAD[c]);
  const p = parsePhone(digits, country === 'CA' ? 'CA' : 'US');
  if (!p.valid) return;
  push(ctx, seg, { value: { value: p.display, type: 'work', e164: p.e164, raw: m[1], labelled: false }, confidence: 'medium', rule: 'phone.vanity' });
  consume(seg, m.index, m.index + m[0].length, 'phone');
}

export function phoneSegs(segs: readonly Seg[]): Seg[] {
  return segs.filter((s) => s.used.includes('phone'));
}
