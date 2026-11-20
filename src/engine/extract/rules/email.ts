// Rule 3 — e-mail addresses (SPEC §5.1). RFC-shaped local@domain-tld.example with a known TLD. Repairs only inside an e-mail
// shape: spaces around "@" and dots, "(at)", "[at]", "©"/"®" for "@" between word characters, " at " in a labelled
// segment; a missing "@" only in a labelled segment and only before a domain the card also prints as its website.
// Clean → high; repaired → medium; unknown TLD → low. The match span is taken from the original text, so the consumed
// part is exactly what was read.
import type { NameParts } from '../../contact';
import { EMAIL_LABELS } from '../dict/labels';
import { alternation, consume, foldKeep } from '../normalize';
import { knownTld } from '../tld';
import type { Candidate } from '../types';

import type { Ctx } from './ctx';

const LOCAL = "[\\p{L}\\p{N}_%+'\uE000-]+(?:\\.[\\p{L}\\p{N}_%+'\uE000-]+)*";
const LABEL = '[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]*[\\p{L}\\p{N}])?';
const DOT = '\\s?\\.\\s?';
const AT = '\\s*(?:@|[([{]\\s?at\\s?[)\\]}]|©|®)\\s*';
const EMAIL_LOOSE = new RegExp(`(?<![\\p{L}\\p{N}._%+'-])(${LOCAL})(${AT})(${LABEL}(?:${DOT}${LABEL})*${DOT}\\p{L}{2,})(?![\\p{L}\\p{N}-])`, 'giu');
const EMAIL_AT_WORD = new RegExp(`(?<![\\p{L}\\p{N}._%+'-])(${LOCAL})(\\s+at\\s+)(${LABEL}(?:${DOT}${LABEL})*${DOT}\\p{L}{2,})(?![\\p{L}\\p{N}-])`, 'giu');
const LABEL_START = new RegExp(`^(?:${alternation(EMAIL_LABELS)})(?![\\p{L}])\\s*[.:：]?\\s*`, 'iu');

/** Same-length stand-in for a space the OCR put after a dot/hyphen/underscore inside a lower-case local part. */
const JOIN = '\uE000';
const LOCAL_SPLIT = /(?<![\p{L}\p{N}._%+'-])(\p{Ll}[\p{Ll}\p{N}_%+'-]*[._-]) (?=[\p{L}\p{N}_%+'-]+(?:\.[\p{L}\p{N}_%+'-]+)*\s*@)/gu;

const LABEL_WORDS = new Set([...EMAIL_LABELS].map((l) => l.toLowerCase().replace(/[.:]+$/, '')));

const SOCIAL_WORD = /^(instagram|insta|ig|twitter|x|tiktok|threads|telegram|tg|youtube|facebook|fb|linkedin|xing|github|line|wechat|kakao)$/i;

/** Emits one e-mail; false when the match is not an e-mail after all (a repaired shape with an unknown TLD, "Instagram @x.y"). */
/** OCR confusions inside words: rn/m, 1/l, 0/o, vv/w. */
const canon = (s: string) => s.replace(/rn/g, 'm').replace(/1/g, 'l').replace(/0/g, 'o').replace(/vv/g, 'w');

function emit(ctx: Ctx, lineId: string, local: string, domainRaw: string, repaired: boolean, rule: string, hosts: readonly string[] = []): boolean {
  // "brightIine": a capital I between lower-case letters is an OCR l (e-mail addresses are printed in lower case)
  // (also before a dot, hyphen or the end: "alpenbIick-hoteI.de")
  const fixI = (t: string) => t.replace(/(?<=\p{Ll})I(?=\p{Ll}|[.-]|$)/gu, 'l');
  if (fixI(local) !== local || fixI(domainRaw) !== domainRaw) repaired = true;
  // "Ivr@uw-edu.example" (O3, Vision): a capital I that STARTS a lower-case word may be an l ("lvr") — which one is unknown,
  // so the address is never sure; reconcileNameEmail picks l when that spells the name's initials or a name word
  const startI = /(?:^|[._-])I(?=\p{Ll})/u.test(local) && local.replace(/I/g, '') === local.replace(/I/g, '').toLowerCase();
  if (startI) repaired = true;
  // "oliver. whitcombe@…" (O3, Vision inserts a space after a dot inside the local part): joined, never sure
  if (local.includes(JOIN)) repaired = true;
  local = local.split(JOIN).join('');
  local = fixI(local);
  let domain = fixI(domainRaw).replace(/\s+/g, '').toLowerCase().replace(/\.+$/, '');
  // ".corn" for ".com" (rn read for m): as the TLD or before a country code ("tpt.corn.tw") — repaired, never sure (P5c)
  const corn = domain.replace(/\.corn(?=\.[a-z]{2}$|$)/, '.com');
  if (corn !== domain) {
    domain = corn;
    repaired = true;
  }
  // "holzwurrn-dresden.de" next to the printed website www.holzwurm-dresden.de: the website's spelling, medium
  const host = hosts.find((h) => h !== domain && canon(h) === canon(domain));
  if (host) {
    domain = host;
    repaired = true;
  }
  const value = `${local.replace(/\s+/g, '')}@${domain}`.toLowerCase();
  const tldOk = knownTld(domain);
  if (repaired && (!tldOk || SOCIAL_WORD.test(local))) return false;
  const twin = ctx.emails.find((e) => e.value.value === value);
  if (twin) {
    // the same address printed again (or in the QR code): this line confirms it and is not hidden (M5)
    if (!twin.sources.includes(lineId)) twin.sources = [...twin.sources, lineId];
    return true;
  }
  ctx.emails.push({ value: { value, type: 'work' }, confidence: !tldOk ? 'low' : repaired ? 'medium' : 'high', sources: [lineId], rule: !tldOk ? 'email.unknown-tld' : startI ? 'email.I-or-l' : repaired ? 'email.repaired' : rule });
  return true;
}

/**
 * Surname elements that end in "m" ("-ström", "-holm", "-heim", "-baum", "-mann" …): a name word that becomes one of them
 * when its "rn" is read as "m" was split by the OCR ("Bergströrn" = "Bergström"), not the e-mail merged (P5d).
 */
const M_ELEMENT = /(strom|holm|heim|baum|blom|boom|dahm|dam|ham|mann|blum|lamm|bohm|brahm|thum|ohm)(?![a-z])/;

/**
 * After the name is known, the e-mail and the name are compared word by word. Where a local-part word and a name word
 * differ only by an OCR confusion (rn/m, 1/l, 0/o, vv/w), ONE of the two lines is damaged:
 * - "m.pfefferkom@…" on the card of Margarete Pfefferkorn, "chidi.okonkwo-ha1e@…": the e-mail takes the name's spelling;
 * - "Ole Bergströrn" with "ole.bergstroem@…" (P5d, B3 de-g24): the name word with "rn" → "m" is a surname element
 *   ("-ström") — the NAME is the damaged line and takes the e-mail's reading; the printed e-mail is kept as printed.
 *   (P5b repaired the e-mail in both cases, so a correct e-mail was changed towards the damaged name line.)
 * Either way neither value is "sure" (L26): both at most medium. An e-mail word with a digit (1/0) is the damaged side.
 * Returns the repaired name, or undefined when the name stays.
 */
export function reconcileNameEmail(ctx: Ctx, name: Candidate<NameParts>): NameParts | undefined {
  const parts = [name.value.given, name.value.middle, name.value.family];
  const tokens = parts.flatMap((p) => p.split(/[\s-]+/)).filter((p) => p.length >= 3);
  const formsOf = (p: string) => [p.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), p.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')];
  const forms = new Set(tokens.flatMap(formsOf));
  let repairedName: NameParts | undefined;
  let conflict = false;
  // "ivr@uw-edu.example" read from "Ivr@…" next to "Lakshmi V. Ramaswamy": the l reading spells the initials (O3 us-a21) →
  // l, still medium; the same word in a profile handle ("x.com/Ivr_nlp") follows
  const initials = parts.flatMap((p) => p.split(/[\s-]+/)).filter((p) => p !== '').map((p) => p[0].toLowerCase()).join('');
  for (const e of ctx.emails) {
    if (e.rule !== 'email.I-or-l') continue;
    const [local, domain] = e.value.value.split('@');
    const words = local.split(/([._-])/);
    const fixed = words.map((t) => (/^i\p{Ll}/u.test(t) && (`l${t.slice(1)}` === initials || forms.has(`l${t.slice(1)}`)) ? `l${t.slice(1)}` : t));
    if (fixed.join('') === local) continue;
    e.value = { ...e.value, value: `${fixed.join('')}@${domain}` };
    words.forEach((t, i) => {
      if (fixed[i] === t) return;
      for (const so of ctx.socials) {
        const re = new RegExp(`(?<![\\p{L}])I${t.slice(1)}(?![\\p{L}])`, 'u');
        if (!re.test(so.value.value)) continue;
        so.value = { ...so.value, value: so.value.value.replace(re, fixed[i]) };
        if (so.confidence === 'high') so.confidence = 'medium';
        so.rule = `${so.rule}+email-I-or-l`;
      }
    });
  }
  for (const e of ctx.emails) {
    const [local, domain] = e.value.value.split('@');
    let changed = false;
    let mine = false;
    const fixed = local.split(/([._-])/).map((t) => {
      if (t.length < 3 || forms.has(t)) return t;
      const hit = [...forms].find((f) => f !== t && canon(f) === canon(t));
      if (!hit) return t;
      mine = mine || !/\d/.test(t);
      // the name side is damaged: "Bergströrn" → "Bergström" when that spells the e-mail word and ends in a surname element
      const word = tokens.find((w) => formsOf(w).includes(hit));
      if (word && !/\d/.test(t)) {
        for (let i = word.indexOf('rn'); i >= 0; i = word.indexOf('rn', i + 1)) {
          const cand = word.slice(0, i) + 'm' + word.slice(i + 2);
          if (formsOf(cand).includes(t) && M_ELEMENT.test(formsOf(cand)[0]) && !M_ELEMENT.test(formsOf(word)[0])) {
            const fix = (s: string) => s.replace(word, cand);
            const base = repairedName ?? name.value;
            repairedName = { ...base, given: fix(base.given), middle: fix(base.middle), family: fix(base.family), full: fix(base.full) };
            return t;
          }
        }
      }
      changed = true;
      return hit;
    });
    conflict = conflict || mine;
    if (mine && e.confidence === 'high') {
      e.confidence = 'medium';
      e.rule = `${e.rule}+name-conflict`;
    }
    if (!changed) continue;
    e.value = { ...e.value, value: `${fixed.join('')}@${domain}` };
    if (e.confidence === 'high') e.confidence = 'medium';
    e.rule = 'email.repaired-name';
  }
  if (conflict && name.confidence === 'high') name.confidence = 'medium';
  if (repairedName) {
    name.value = repairedName;
    name.rule = `${name.rule}+email-repair`;
  }
  return repairedName;
}

export function findEmails(ctx: Ctx, websiteHosts: string[]): void {
  for (const seg of ctx.segs) {
    const rest = seg.rest;
    if (rest.trim() === '') continue;
    const labelled = LABEL_START.test(foldKeep(rest.trimStart()));
    let found = false;
    // "dana.whitfie|d@…": a "|" glued between letters is an OCR "l" (same length, so the consumed span stays exact)
    const text = seg.rest.replace(/(?<=\p{L})\|(?=\p{L})/gu, 'l').replace(LOCAL_SPLIT, (all, word: string) => (LABEL_WORDS.has(word.slice(0, -1).toLowerCase()) ? all : `${word}${JOIN}`));
    for (const re of labelled ? [EMAIL_LOOSE, EMAIL_AT_WORD] : [EMAIL_LOOSE]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const start = m.index ?? 0;
        const repaired = m[2] !== '@' || /\s/.test(m[3]) || re === EMAIL_AT_WORD || seg.rest.slice(start, start + m[0].length).includes('|');
        if (!emit(ctx, seg.lineId, m[1], m[3], repaired, 'email', websiteHosts)) continue;
        consume(seg, start, start + m[0].length, 'email');
        found = true;
      }
    }
    if (found || !labelled) continue;
    // missing "@": "E-Mail: anna.weberacme.de" with the website acme.de on the card
    const lower = rest.toLowerCase().trimEnd();
    const host = websiteHosts.find((h) => lower.endsWith(h) && !lower.includes(`@${h}`));
    if (!host) continue;
    const end = lower.length;
    const at = end - host.length;
    const local = rest.slice(0, at).replace(LABEL_START, '').trim();
    if (/^[\p{L}\p{N}._%+'-]+$/u.test(local) && emit(ctx, seg.lineId, local, host, true, 'email.missing-at')) {
      ctx.emails[ctx.emails.length - 1].rule = 'email.missing-at';
      consume(seg, rest.indexOf(local), end, 'email');
    }
  }
}

const edit1 = (a: string, b: string): boolean => {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
};

/**
 * "i.brandaver@brandaver-partner-de.example" on the card of "BRANDAUER & PARTNER" (O3 de-02, Vision read Futura's "u" as "v"):
 * a domain word one letter away from a company word (≥ 6 letters) means one of the two lines is damaged — neither the
 * e-mail nor the company is sure (L26). Nothing is changed; both become medium.
 */
export function domainNearCompany(ctx: Ctx): void {
  const company = ctx.company;
  if (!company) return;
  const forms = (w: string) => [w.normalize('NFKD').replace(/[̀-ͯ]/g, ''), w.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')];
  const words = company.value.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 6).flatMap(forms);
  if (words.length === 0) return;
  for (const e of ctx.emails) {
    if (e.confidence !== 'high') continue;
    const labels = (e.value.value.split('@')[1] ?? '').split('.').slice(0, -1).flatMap((l) => l.split('-')).filter((w) => w.length >= 6);
    if (!labels.some((d) => !words.includes(d) && words.some((w) => edit1(w, d)))) continue;
    e.confidence = 'medium';
    e.rule = `${e.rule}+company-conflict`;
    if (company.confidence === 'high') {
      company.confidence = 'medium';
      company.rule = `${company.rule}+email-conflict`;
    }
  }
}
