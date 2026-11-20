// Duplicate matcher (SPEC §5.5; meter-tracker D91/D92 pattern: canonical keys on both sides, margin rule, never an
// automatic merge). Pure. Compares a new card with stored cards (or phone contacts converted to ContactCard).
//
// Keys: phone → E.164 (else last 9 digits); e-mail → trimmed lower case; name → NFKD without diacritics (ß→ss, ø→o,
// æ→ae …), lower case, prefixes/suffixes removed, tokens sorted; company → lower case without legal forms/punctuation.
// Scores: same e-mail 1.0 · same phone 0.95 · same name + company 0.9 · name one edit away (≥ 8 letters) + same company
// 0.7 · same name only 0.6 · else 0. Shared numbers/addresses (D27): a phone on ≥ 3 stored cards with different names is
// a switchboard (≤ 0.3); a role mailbox (info@, office@ …) scores ≤ 0.3; a phone or e-mail match whose two cards carry
// clearly different names is capped (work line 0.6, mobile/e-mail 0.8) — colleagues share lines, people don't share names.
// Verdict: `same` = best ≥ 0.9 with a margin ≥ 0.2 over the runner-up; `possible` = best ≥ 0.6 otherwise; else `none`.
import type { ContactCard, NameParts } from './contact';
import { joinName } from './contact';
import { phoneKey } from './phone';

const FOLD: Record<string, string> = { ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };

/**
 * Lower case, Latin/Greek/Cyrillic diacritics removed (U+0300–U+036F after NFKD), recomposed (NFC — so Hangul syllables
 * and kana with voicing marks stay intact), the letters above folded.
 */
export function foldText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]+/g, '')
    .normalize('NFC')
    .replace(/[ßøæœłđðþı]/g, (c) => FOLD[c] ?? c);
}

const NAME_AFFIXES = new Set(
  'dr prof professor mr mrs ms mx miss herr frau m mme mlle sr sra srta sig sigra dott dottssa ing dipl dipl-ing ir mag dra jr ii iii iv phd md mba msc bsc ma ba llm esq'.split(' ')
);

export function nameKey(name: NameParts | string | undefined): string {
  if (!name) return '';
  const text = typeof name === 'string' ? name : [name.given, name.middle, name.family].join(' ').trim() || name.full;
  return foldText(text)
    .replace(/[.,]/g, ' ')
    .split(/[\s]+/)
    .map((t) => t.replace(/^[-'’]+|[-'’]+$/g, ''))
    .filter((t) => t !== '' && !NAME_AFFIXES.has(t.replace(/\./g, '')))
    .sort()
    .join(' ');
}

const LEGAL_FORMS = new Set(
  'gmbh ag kg ug ek ohg mbh co kgaa se ltd llc inc corp corporation plc llp lp sa sl sarl sas spa srl bv nv oy ab as pty pvt tbk pt as ltdsti ooo ao pao zao ип 株式会社 有限会社 有限公司 股份有限公司 주식회사 주 limited company gbr partg partner partners'.split(' ')
);

export function companyKey(company: string | undefined): string {
  if (!company) return '';
  return foldText(company)
    .replace(/[.,'’"()\-/&+]/g, ' ')
    .split(/\s+/)
    .filter((t) => t !== '' && !LEGAL_FORMS.has(t))
    .join(' ');
}

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

const ROLE_MAILBOX = /^(info|office|kontakt|contact|contacto|contato|sales|vertrieb|hello|hallo|hi|mail|service|support|team|admin|post|empfang|reception|enquiries|inquiries|buero|bureau|mailbox|anfrage|anfragen|kanzlei|praxis|buchhaltung|rechnung|rechnungen|invoice|invoices|billing|accounts|jobs|karriere|career|careers|bewerbung|presse|press|media|marketing|booking|bookings|order|orders|bestellung|noreply|no-reply|donotreply|termine|termin|verwaltung|zentrale|sekretariat|notariat|anmeldung|reservierung|reservations|webmaster|hr|personal)$/;

/** info@, office@ … : shared by everybody at a company, never evidence for one person. */
export function isRoleMailbox(email: string): boolean {
  return ROLE_MAILBOX.test(emailKey(email).split('@')[0] ?? '');
}

export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const splitExt = (k: string) => {
  const i = k.indexOf(';ext=');
  return i < 0 ? { base: k, ext: '' } : { base: k.slice(0, i), ext: k.slice(i + 5) };
};
const last9 = (k: string) => splitExt(k).base.replace(/\D/g, '').slice(-9);
/** Two phone keys are the same number: equal keys, or equal last 9 digits when one side was not a valid number. The
 * extension is part of the key: "+1 212 555 0100 ext. 23" and "… ext. 45" are two people (review S1). */
export function samePhoneKey(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  if (a === b) return true;
  if (splitExt(a).ext !== splitExt(b).ext) return false;
  if (a.startsWith('+') && b.startsWith('+')) return false;
  const da = last9(a);
  const db = last9(b);
  return da.length >= 7 && da === db;
}

/** Matching key of a stored phone: E.164 (or the printed digits) plus ";ext=N" when an extension is printed. */
export function phoneMatchKey(p: { value: string; e164?: string }, region?: string): string {
  const ext = /(?:ext\.?|x|durchwahl|dw)\s*[.:]?\s*(\d{1,5})\s*$/i.exec(p.value);
  const base = p.e164 ?? phoneKey(ext ? p.value.slice(0, ext.index) : p.value, region);
  return ext ? `${base};ext=${ext[1]}` : base;
}

export type MatchReason = 'email' | 'phone' | 'name+company' | 'near-name+company' | 'name' | 'switchboard' | 'none';
export type StoredCard = { id: string; contact: ContactCard; createdAt?: number };
export type CardMatch = { card: StoredCard; score: number; reason: MatchReason };
export type MatchVerdict = 'same' | 'possible' | 'none';
export type MatchResult = { verdict: MatchVerdict; best: CardMatch | null; ranked: CardMatch[] };

export const SAME_MIN = 0.9;
export const SAME_MARGIN = 0.2;
export const POSSIBLE_MIN = 0.6;
/** Scores are sums of tenths: 1.0 − 0.8 is 0.19999999999999996 in floating point (P8 finding) — compare with a tolerance. */
const EPS = 1e-9;

type Keys = { emails: string[]; personal: string[]; phones: { key: string; mobile: boolean }[]; name: string; nameLetters: string; company: string };

/** An e-mail whose local part spells a part of the card's own name ("anna.weber@", "aweber@") is that person's own. */
function personalEmails(emails: readonly string[], name: string): string[] {
  const parts = name.split(' ').map((t) => t.replace(/[^a-z]/g, '')).filter((t) => t.length >= 3);
  return emails.filter((e) => !isRoleMailbox(e) && parts.some((t) => (e.split('@')[0] ?? '').replace(/[^a-z]/g, '').includes(t)));
}

function keysOf(c: ContactCard, region?: string): Keys {
  const name = nameKey(c.name);
  const emails = c.emails.map((e) => emailKey(e.value)).filter(Boolean);
  return {
    emails,
    personal: personalEmails(emails, name),
    phones: c.phones.filter((p) => p.type !== 'fax').map((p) => ({ key: phoneMatchKey(p, region), mobile: p.type === 'mobile' })),
    name,
    nameLetters: name.replace(/\s/g, ''),
    company: companyKey(c.company),
  };
}

function namesConflict(a: Keys, b: Keys): boolean {
  if (a.name === '' || b.name === '') return false;
  return editDistance(a.nameLetters, b.nameLetters, 2) > 2;
}

/** Phone keys printed on ≥ 3 stored cards with different names. */
export function switchboards(stored: readonly StoredCard[], region?: string): Set<string> {
  const names = new Map<string, Set<string>>();
  for (const s of stored) {
    const k = keysOf(s.contact, region);
    for (const p of k.phones) {
      const key = last9(p.key);
      if (!names.has(key)) names.set(key, new Set());
      names.get(key)!.add(k.name);
    }
  }
  return new Set([...names].filter(([, n]) => n.size >= 3).map(([k]) => k));
}

/** Different mobiles on both cards (none shared), or different personal e-mails: evidence against "same person". */
function contradicts(a: Keys, b: Keys): boolean {
  const am = a.phones.filter((p) => p.mobile);
  const bm = b.phones.filter((p) => p.mobile);
  const mobiles = am.length > 0 && bm.length > 0 && !am.some((p) => bm.some((q) => samePhoneKey(p.key, q.key)));
  const mails = a.personal.length > 0 && b.personal.length > 0 && !a.personal.some((e) => b.personal.includes(e));
  return mobiles || mails;
}

/**
 * Score of one pair with the reason of the strongest signal. Conservative (review S1): a shared WORK line, or a shared
 * e-mail that is not known to be the person's own, reaches "same" (≥ 0.9) only when both cards carry the same name; any
 * contradiction (different mobiles, different personal e-mails) caps the pair at 0.8 — the user decides.
 */
export function scorePair(incoming: ContactCard, stored: ContactCard, opts: { region?: string; switchboards?: Set<string> } = {}): { score: number; reason: MatchReason } {
  const a = keysOf(incoming, opts.region);
  const b = keysOf(stored, opts.region);
  const conflict = namesConflict(a, b);
  const sameName = a.name !== '' && a.name === b.name;
  const cap = contradicts(a, b) ? 0.8 : 1;
  let best: { score: number; reason: MatchReason } = { score: 0, reason: 'none' };
  const take = (score: number, reason: MatchReason) => {
    const s = reason === 'switchboard' ? score : Math.min(score, cap);
    if (s > best.score) best = { score: s, reason };
  };
  for (const e of a.emails) {
    if (!b.emails.includes(e)) continue;
    if (isRoleMailbox(e)) take(0.3, 'switchboard');
    else if (conflict) take(0.8, 'email');
    else take(sameName || a.personal.includes(e) || b.personal.includes(e) ? 1 : 0.8, 'email');
  }
  for (const p of a.phones) {
    const q = b.phones.find((x) => samePhoneKey(p.key, x.key));
    if (!q) continue;
    if (opts.switchboards?.has(last9(p.key))) take(0.3, 'switchboard');
    else if (conflict) take(p.mobile && q.mobile ? 0.8 : 0.6, 'phone');
    else if (p.mobile && q.mobile) take(sameName || a.name === '' || b.name === '' ? 0.95 : 0.8, 'phone');
    else take(sameName ? 0.95 : 0.8, 'phone');
  }
  if (sameName) take(a.company !== '' && a.company === b.company ? 0.9 : 0.6, a.company !== '' && a.company === b.company ? 'name+company' : 'name');
  else if (a.company !== '' && a.company === b.company && a.nameLetters.length >= 8 && editDistance(a.nameLetters, b.nameLetters, 1) <= 1) take(0.7, 'near-name+company');
  return best;
}

/** Ranks stored cards against a new one; the UI shows the verdict as a banner and never merges on its own. */
export function findMatches(incoming: ContactCard, stored: readonly StoredCard[], opts: { region?: string; excludeId?: string } = {}): MatchResult {
  const pool = stored.filter((s) => s.id !== opts.excludeId);
  const boards = switchboards(pool, opts.region);
  const ranked = pool
    .map((card) => ({ card, ...scorePair(incoming, card.contact, { region: opts.region, switchboards: boards }) }))
    .filter((m) => m.score > 0)
    .sort((x, y) => y.score - x.score || (y.card.createdAt ?? 0) - (x.card.createdAt ?? 0));
  const best = ranked[0] ?? null;
  if (!best || best.score < POSSIBLE_MIN - EPS) return { verdict: 'none', best: null, ranked };
  const runnerUp = ranked[1]?.score ?? 0;
  const verdict: MatchVerdict = best.score >= SAME_MIN - EPS && best.score - runnerUp >= SAME_MARGIN - EPS ? 'same' : 'possible';
  return { verdict, best, ranked };
}

/** Banner text inputs: display name (or company) of the matched card. */
export function matchLabel(m: CardMatch): { name: string; company: string } {
  return { name: m.card.contact.name ? joinName(m.card.contact.name) : (m.card.contact.company ?? ''), company: m.card.contact.company ?? '' };
}
