// Rule 7 — company (SPEC §5.1). A legal form (GmbH, Ltd, 株式会社 …) → high; a line whose letters equal the e-mail/web
// domain stem (≥ 4 characters, case/space/punctuation-insensitive) → high, a prefix match → medium; otherwise the
// largest non-name line without digits in the top or bottom band → low ("logo text"). Pure.
import { COMPANY_HINTS, LEGAL_CASED, LEGAL_STRICT, LEGAL_SUBSTRINGS, LEGAL_WORDS } from '../dict/legal';
import { GIVEN_NAMES } from '../dict/names';
import { NOT_PHONE_WORDS } from '../dict/labels';
import { alternation, columnAbove, consumeAll, directlyBelow, fold, hasBoxes, meaningfulRest, type Seg } from '../normalize';
import { FREE_MAIL, SECOND_LEVEL } from '../tld';
import type { Candidate } from '../types';

import type { Ctx } from './ctx';
import { isTitleText } from './title';

const CASED_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation(LEGAL_CASED)})(?![\\p{L}\\p{N}])`, 'gu');
const WORDS_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation(LEGAL_WORDS)})(?![\\p{L}\\p{N}])`, 'iu');
const WORDS_RE_G = new RegExp(WORDS_RE.source, 'giu');
const HINTS_RE = new RegExp(`(?<![\\p{L}])(?:${alternation(COMPANY_HINTS)})(?![\\p{L}])`, 'iu');
const REGISTRY_RE = new RegExp(`(?<![\\p{L}])(?:${alternation(NOT_PHONE_WORDS.filter((w) => w.length > 3))})(?![\\p{L}])`, 'iu');

/** "Jane Doe, PT", "CV & Portfolio", "Co. Kerry": a short cased form counts only where a company prints it (M4). */
function strictFormOk(text: string, index: number, form: string): boolean {
  const before = text.slice(0, index).trim();
  const after = text.slice(index + form.length);
  if (before === '' && (form === 'PT' || form === 'CV')) return /^\s+\p{Lu}\p{L}+\s+\p{Lu}/u.test(after) && !text.includes(',');
  if (!/^[\s.,;)]*$/.test(after)) return false;
  if (!/\p{Lu}[\p{L}&'’-]+/u.test(before)) return false;
  // a person before a comma ("Jane Doe, PT, DPT", "Anna Weber, SE"): credentials, not a company
  const head = before.split(',')[0].trim().split(/\s+/);
  if (before.includes(',') && head.length >= 2 && head.length <= 3 && GIVEN_NAMES.has(fold(head[0]))) return false;
  return true;
}

export function hasLegalForm(text: string): boolean {
  if (WORDS_RE.test(fold(text)) || LEGAL_SUBSTRINGS.some((s) => text.includes(s))) return true;
  for (const m of text.matchAll(CASED_RE)) if (!LEGAL_STRICT.has(m[0]) || strictFormOk(text, m.index ?? 0, m[0])) return true;
  return false;
}

/** "A member of the Contoso Group", "Ein Unternehmen der Müller Gruppe", "a Northbridge Inc. company": never the company (M4). */
const MEMBERSHIP = /^(?:(?:a|an|ein|eine)\s+)?(?:member of|part of|a division of|division of|a subsidiary of|subsidiary of|in association with|powered by|unternehmen (?:der|des|von)|marke (?:der|des|von)|mitglied (?:der|des|im)|tochter(?:gesellschaft|unternehmen)? (?:der|des|von)|une (?:societe|filiale|marque) (?:du|de|des)|una empresa (?:del|de)|parte de|uma empresa (?:do|da)|bir .+ (?:kurulusudur|sirketidir))(?![\p{L}])|^(?:a|an)\s.{2,40}\s(?:company|brand|group company)$/iu;
export function isMembershipLine(text: string): boolean {
  return MEMBERSHIP.test(fold(text).trim());
}

/** Words of a company line that are not legal forms, abbreviations ("San.", "Tic.") or parenthesised ("(haftungsbeschränkt)"). */
function contentWords(text: string): number {
  let t = text.replace(/\([^)]*\)/g, ' ');
  for (const m of [...t.matchAll(CASED_RE)].reverse()) t = t.slice(0, m.index) + ' ' + t.slice((m.index ?? 0) + m[0].length);
  t = fold(t).replace(WORDS_RE_G, ' ');
  return t.split(/\s+/).filter((w) => /^\p{L}{4,}$/u.test(w)).length;
}

/** 2–3 capitalised words without a company word. */
function nameLike(text: string): boolean {
  const t = text.trim().split(/\s+/);
  return t.length >= 2 && t.length <= 3 && t.every((w) => /^\p{Lu}[\p{L}\p{M}'’-]*$/u.test(w)) && !hasCompanyHint(text);
}

/** A job title directly under the segment ("Jannik Oberländer" / "Fotograf & Videograf"): the line is a person. */
function titleBelow(ctx: Ctx, seg: Seg): boolean {
  const i = ctx.segs.indexOf(seg);
  const next = hasBoxes(ctx.segs) ? ctx.segs.find((s) => directlyBelow(seg, s)) : ctx.segs[i + 1];
  return !!next && next.side === seg.side && isTitleText(next.rest);
}

/** "ANNA WEBER" / "Jannik Oberländer" — 2–3 capitalised words starting with a known given name: a person, not a company (S3). */
function personShaped(text: string): boolean {
  const t = text.trim().split(/\s+/);
  return t.length >= 2 && t.length <= 3 && GIVEN_NAMES.has(fold(t[0])) && t.every((w) => /^\p{Lu}[\p{L}\p{M}'’-]*$/u.test(w));
}

const HINT_SUFFIX = /\p{L}{3,}(kanzlei|praxis|technik|bau|werk|werke|handel|verlag|beratung|service|agentur|studio|atelier|design|systeme|logistik|reisen|immobilien|consult|bouw|techniek|groep|tech|soft|ware)(?![\p{L}])/iu;

export function hasCompanyHint(text: string): boolean {
  const f = fold(text);
  return HINTS_RE.test(f) || HINT_SUFFIX.test(f);
}

const letters = (s: string) => fold(s).replace(/[^\p{L}\p{N}]/gu, '');
/** Letter forms of a line for domain comparison: "&"/"+" as "and"/"und"/nothing, German umlauts as ae/oe/ue too. */
function letterForms(s: string): string[] {
  const base = s.normalize('NFKC');
  const variants = new Set<string>();
  for (const amp of ['', 'and', 'und', 'et', 'y', 'e']) {
    const t = base.replace(/\s*[&+]\s*/g, ` ${amp} `);
    variants.add(letters(t));
    variants.add(letters(t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')));
  }
  return [...variants].filter((v) => v.length >= 3);
}

/** Company stems of the card's own domains: "anna@acme-solutions-co-uk.example" → "acmesolutions". Free-mail domains skipped. */
export function domainStems(hosts: readonly string[]): string[] {
  const out = new Set<string>();
  for (const h of hosts) {
    const host = h.toLowerCase().replace(/^www\./, '');
    if (FREE_MAIL.has(host)) continue;
    const labels = host.split('.');
    let i = labels.length - 2;
    if (i > 0 && SECOND_LEVEL.has(labels[i])) i--;
    const stem = (labels[i] ?? '').replace(/[^\p{L}\p{N}]/gu, '');
    if (stem.length >= 3) out.add(stem);
  }
  return [...out];
}

function stemMatch(text: string, stems: readonly string[]): 'equal' | 'prefix' | null {
  const forms = letterForms(text);
  if (forms.length === 0) return null;
  let best: 'equal' | 'prefix' | null = null;
  for (const s of stems) {
    for (const l of forms) {
      if (l === s) return 'equal';
      if (s.length >= 4 && (l.startsWith(s) || s.startsWith(l)) && Math.min(l.length, s.length) >= 4) best = 'prefix';
      // "BROTZEIT" in baeckerei-brotzeit.de: the line is the END of the stem
      if (l.length >= 5 && s.length > l.length && s.endsWith(l) && /^[^\p{L}]*\p{Lu}/u.test(text)) best = 'prefix';
    }
  }
  return best;
}

/** "CASCADE" / "PHYSICAL THERAPY" with cascadept.com: the first line plus the initials of the second spell the stem (P5c). */
function initialsMatch(first: string, second: string, stems: readonly string[]): boolean {
  const head = letters(first);
  const init = second.split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !/^(and|und|&|of|the)$/i.test(w)).map((w) => letters(w)[0] ?? '').join('');
  return head.length >= 4 && init.length >= 2 && stems.includes(head + init);
}

/** A line that is nothing but a legal form ("NV", "GmbH", "S.A. de C.V.", "有限会社"). */
function legalOnly(text: string): boolean {
  const t = text.trim();
  if (LEGAL_SUBSTRINGS.includes(t) || LEGAL_CASED.includes(t)) return true;
  return hasLegalForm(t) && contentWords(t) === 0 && !/\p{L}{5,}/u.test(fold(t).replace(WORDS_RE_G, ''));
}
/** Legal forms printed BEFORE the name ("有限会社 高橋デザイン事務所", "PT Maju Jaya", "(주)누리데이터"). */
const LEGAL_PREFIX = new Set(['株式会社', '有限会社', '合同会社', '(株)', '（株）', '㈱', '주식회사', '(주)', '㈜', '유한회사', 'PT', 'CV', 'ООО', 'АО', 'ПАО', 'ЗАО', 'ОАО', 'Công ty', 'CÔNG TY']);

function cleanCompany(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/^[\s,;:|·•-]+|[\s,;:|·•]+$/g, '');
}

/** The segment's remaining text as printed (punctuation such as the dot of "Ltd." kept), or '' when not eligible. */
function eligible(seg: Seg): string {
  if (!meaningfulRest(seg)) return '';
  const r = seg.rest.replace(/\s+/g, ' ').trim().replace(/^[\s,;:|·•-]+|[\s,;:|·•-]+$/g, '');
  if (!r || /@|https?:|www\./i.test(r)) return '';
  if (REGISTRY_RE.test(fold(r))) return '';
  if (isMembershipLine(r)) return '';
  if (r.split(/\s+/).length > 9) return '';
  return r;
}

/** Strong signals only (legal form, domain stem). Fills ctx.company and alternatives; claims the segment. */
export function findCompanyStrong(ctx: Ctx): void {
  const cands: { seg: Seg; text: string; score: number; c: Candidate<string>; also?: Seg }[] = [];
  const boxes = hasBoxes(ctx.segs);
  // a logo set on two lines ("MOOS" / "& STEIN", "HALCYON" / "ARCHITECTS") is tried as one text too
  const pairs: { seg: Seg; text: string; also?: Seg }[] = [];
  for (const seg of ctx.segs) {
    const text = eligible(seg);
    if (!text) continue;
    pairs.push({ seg, text });
    const below = boxes ? ctx.segs.find((s) => directlyBelow(seg, s, 0.8)) : undefined;
    const t2 = below ? eligible(below) : '';
    if (below && t2 && !/\d|@/.test(text + t2) && [...t2].length <= 30 && !hasLegalForm(text) && !isTitleText(t2)) {
      const joined = `${text} ${t2}`;
      const single = stemMatch(text, ctx.stems);
      const pair = stemMatch(joined, ctx.stems);
      if ((pair === 'equal' && single !== 'equal') || (pair === 'prefix' && single !== 'equal' && hasCompanyHint(t2)) || (single !== 'equal' && initialsMatch(text, t2, ctx.stems))) pairs.push({ seg, text: joined, also: below });
    }
  }
  for (const { seg, text, also } of pairs) {
    const digits = (text.match(/\d/g) ?? []).length;
    if (digits > text.length * 0.3) continue;
    const legal = hasLegalForm(text);
    const initials = !!also && initialsMatch(text.slice(0, text.length - eligible(also).length).trim(), eligible(also), ctx.stems);
    const stem = stemMatch(text, ctx.stems) ?? (initials ? 'prefix' : null);
    if (!legal && !stem) continue;
    // a freelancer's own name that is also the domain ("Jannik Oberländer" / jannikoberlaender.de) is the NAME (S3)
    if (!legal && (personShaped(text) || (nameLike(text) && titleBelow(ctx, seg)))) continue;
    const hint = hasCompanyHint(text);
    // a longer line that starts with the domain stem and carries a company word ("Zephyr Systems") is the fuller
    // name next to a logo that equals the stem ("ZEPHYR")
    const multi = text.trim().split(/\s+/).length >= 2;
    const score = (legal ? 10 : 0) + (stem === 'equal' ? 8 : stem === 'prefix' ? 5 : 0) + (hint && stem === 'prefix' && multi ? 4 : 0) + seg.height * 10 - seg.order * 0.01;
    // a prefix match on ONE generic company word ("Bäckerei" in baeckerei-brotzeit.de) is not sure (L26)
    // a domain PREFIX over two lines ("tiny garden" / "Software for small growers", O3 de-s12) is a layout guess → medium
    const confidence = legal || stem === 'equal' || (stem === 'prefix' && hint && text.trim().split(/\s+/).length >= 2 && !also) ? 'high' : 'medium';
    // "Fernleaf Labs Ltd. - Making carbon accounting boring": the slogan after the legal form is not the company
    const cut = legal ? /^(.*?(?:\p{L}\.|\p{Lu}{2,}|\)))\s+[-–—:|]\s+\p{L}.*$/u.exec(text) : null;
    const value = cut && hasLegalForm(cut[1]) ? cut[1] : text;
    cands.push({ seg, text: value, score: score + (also ? 0.5 : 0), also, c: { value: cleanCompany(value), confidence, sources: also ? [seg.lineId, also.lineId] : [seg.lineId], rule: (legal ? 'company.legal' : `company.domain-${stem}${hint ? '+hint' : ''}`) + (also ? '+2lines' : '') } });
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (!best) return;
  joinLegalOnly(ctx, best);
  const above = joinLineAbove(ctx, best);
  if (!above) joinLegalBelow(ctx, best);
  ctx.company = best.c;
  ctx.companyCands = cands.map((c) => ({ seg: c.seg, c: c.c }));
  consumeAll(best.seg, 'company');
  if (best.also) consumeAll(best.also, 'company');
  const alt = cands.find((c) => c.seg.lineId !== best.seg.lineId && !best.c.sources.includes(c.seg.lineId) && letters(c.text) !== letters(best.text));
  if (alt) ctx.alternatives.company = alt.c;
}

/**
 * "Ferreira & Lima" / "Comércio Ltda.", "DACHDECKEREI" / "KERSCHNER" / "GmbH & Co. KG": a legal-form line with at most one
 * word of its own continues the larger line(s) directly above it → joined, medium (the join is a layout guess).
 */
function joinLegalOnly(ctx: Ctx, best: { seg: Seg; text: string; c: Candidate<string>; also?: Seg }): void {
  if (best.also || !best.c.rule.startsWith('company.legal') || contentWords(best.text) > 1) return;
  const boxes = hasBoxes(ctx.segs);
  const above = boxes
    ? columnAbove(ctx.segs, best.seg, 2, 1.2)
    : ctx.segs.filter((s) => s.side === best.seg.side && s.order < best.seg.order && s.order >= best.seg.order - 1).reverse();
  const take: Seg[] = [];
  for (const s of above) {
    const t = eligible(s).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, '').trim();
    if (!t || /\d|@/.test(t) || !/^\p{Lu}/u.test(t) || t.split(/\s+/).length > 4) break;
    if (s.height + 0.002 < best.seg.height || personShaped(t) || isTitleText(t) || hasLegalForm(t)) break;
    if (letters(best.text).includes(letters(t))) break;
    take.unshift(s);
  }
  if (take.length === 0) return;
  const value = cleanCompany([...take.map((s) => eligible(s).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, '').trim()), best.text].join(' '));
  best.c = { value, confidence: stemMatch(value, ctx.stems) === 'equal' ? 'high' : 'medium', sources: [...take.map((s) => s.lineId), best.seg.lineId], rule: 'company.legal+lines-above' };
  for (const s of take) consumeAll(s, 'company');
}

/** Authority words printed above the place ("Landeshauptstadt" / "München", "Stadt" / "Wien", "City of" / "Leeds"). Folded. */
const AUTHORITY = /^(?:landeshauptstadt|hauptstadt|stadt|gemeinde|marktgemeinde|stadtgemeinde|landkreis|kreis|bezirksamt|magistrat|freistaat|hansestadt|bundesstadt|kreisstadt|universitatsstadt|ville de|comune di|citta di|gemeente|city of|town of|county of|borough of|municipality of|ayuntamiento de|kommune|kommun)$/;
/** One trade or organisation noun ("BEDACHUNGEN", "Installatiebedrijf", "Tischlerei", "Malerbetrieb"). Folded. */
const DESCRIPTOR_END = /(?:ungen|erei|bedrijf|betrieb|werkstatt|werkstatte|kanzlei|praxis|technik|handel|stadt)$/;

/**
 * P5d (B3): a company printed over two lines keeps both — "BEDACHUNGEN" / "WÖHRLE GmbH", "Installatiebedrijf" / "Van der
 * Berg B.V.", "Landeshauptstadt" / "München" (one trade, organisation or authority word directly above), "celvion" /
 * "Diagnostics GmbH", "LONE STAR" / "ROOFING & GUTTERS LLC" (a brand line above whose letters start the card's domain).
 * The join is a layout reading → medium, unless the joined text equals the domain stem. Returns whether it joined.
 */
function joinLineAbove(ctx: Ctx, best: { seg: Seg; text: string; c: Candidate<string>; also?: Seg }): boolean {
  if (best.also || best.c.rule.includes('+lines-above') || !/^company\.(?:legal|domain-equal)/.test(best.c.rule)) return false;
  const boxes = hasBoxes(ctx.segs);
  const up = boxes ? columnAbove(ctx.segs, best.seg, 1, 1.2)[0] : ctx.segs.find((s) => s.side === best.seg.side && s.order === best.seg.order - 1);
  if (!up || up.used.length > 0 || ctx.segs.filter((s) => s.lineId === up.lineId).length > 1 || up.lineId === best.seg.lineId) return false;
  if (boxes && up.height < best.seg.height * 0.5) return false;
  const t = eligible(up).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, '').trim();
  if (!t || /\d|@/.test(t) || t.split(/\s+/).length > 3 || /[.!?]$/.test(t)) return false;
  if (personShaped(t) || isTitleText(t) || hasLegalForm(t) || isMembershipLine(t) || letters(best.text).includes(letters(t))) return false;
  const f = fold(t);
  const descriptor = AUTHORITY.test(f) || (/^\p{Lu}[\p{L}\p{M}-]{5,}$/u.test(t) && (hasCompanyHint(t) || DESCRIPTOR_END.test(f)));
  const brand = stemMatch(t, ctx.stems) !== null && stemMatch(best.text, ctx.stems) !== 'equal';
  if (!descriptor && !brand) return false;
  const value = cleanCompany(`${t} ${best.text}`);
  best.c = { value, confidence: stemMatch(value, ctx.stems) === 'equal' ? 'high' : 'medium', sources: [up.lineId, best.seg.lineId], rule: `${best.c.rule}+line-above` };
  consumeAll(up, 'company');
  return true;
}

/**
 * "有限会社" / "高橋デザイン事務所": a prefix-type legal form alone on its line belongs to the line below; "DIAMANT LOGISTICS" /
 * "NV": a lone legal form directly below the company line belongs to it. Joined → medium (a layout guess, P5c).
 */
function joinLegalBelow(ctx: Ctx, best: { seg: Seg; text: string; c: Candidate<string>; also?: Seg }): void {
  if (best.also || best.c.rule === 'company.legal+lines-above') return;
  const boxes = hasBoxes(ctx.segs);
  const below = boxes ? ctx.segs.find((s) => directlyBelow(best.seg, s, 0.8)) : ctx.segs.find((s) => s.side === best.seg.side && s.order === best.seg.order + 1);
  if (!below || below.lineId === best.seg.lineId || below.used.length > 0) return;
  const t2 = eligible(below);
  if (!t2 || /\d|@/.test(t2)) return;
  const cjk = (s: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(s);
  const head = best.text.trim();
  let value = '';
  if (LEGAL_PREFIX.has(head) && legalOnly(head)) {
    // the line below is the company's name (not a title, a person or another legal form)
    if (isTitleText(t2) || personShaped(t2) || hasLegalForm(t2) || [...t2].length > 30) return;
    value = cjk(head) && cjk(t2) ? `${head}${t2}` : `${head} ${t2}`;
  } else if (!hasLegalForm(head) && legalOnly(t2) && !LEGAL_PREFIX.has(t2.trim())) {
    value = `${head} ${t2.trim()}`;
  } else return;
  best.c = { value: cleanCompany(value), confidence: 'medium', sources: [best.seg.lineId, below.lineId], rule: `${best.c.rule}+legal-line` };
  consumeAll(below, 'company');
}

/** After the name: prefer a company line in the name's script (front Japanese, back English …). */
export function preferCompanyScript(ctx: Ctx, script: string, scriptOfText: (t: string) => string): void {
  if (!ctx.company || !ctx.companyCands || scriptOfText(ctx.company.value) === script) return;
  const same = ctx.companyCands.find((c) => scriptOfText(c.c.value) === script && c.c.confidence === 'high');
  if (!same) return;
  const current = ctx.companyCands.find((c) => c.c === ctx.company);
  ctx.alternatives.company = ctx.company;
  ctx.company = same.c;
  if (!same.seg.used.includes('company')) consumeAll(same.seg, 'company');
  if (current) {
    // the other-script company line goes back to "Text on the card" (it was consumed as the company)
    current.seg.used = current.seg.used.filter((u) => u !== 'company');
    if (current.seg.used.length === 0) current.seg.rest = current.seg.text;
  }
}

/** Fallback after the name rule: the largest remaining line without digits at the top or bottom of the card → low. */
/**
 * Fallback after the name rule: the best remaining line without digits — the largest text, a company word, near the top
 * or bottom. With a company word (Bäckerei, Kanzlei, Solutions …) → medium; otherwise low ("logo text"). A following
 * line that starts in lower case at the same size continues it ("Physiopraxis" / "am Rathaus").
 */
export function findCompanyFallback(ctx: Ctx, nameSegIds: ReadonlySet<string>): void {
  if (ctx.company) return;
  const front = ctx.segs.filter((s) => s.side === ctx.segs[0]?.side);
  const n = front.length;
  const cands: { seg: Seg; text: string; score: number; i: number }[] = [];
  front.forEach((seg, i) => {
    if (nameSegIds.has(seg.id) || ctx.titleSegs.has(seg.id)) return;
    if (seg.used.length > 0) return; // remainders of contact lines are not company names
    // "Wohnen · Hotel · Gastronomie": one item of a list of services is not the company
    if (ctx.segs.filter((s) => s.lineId === seg.lineId).length >= 3) return;
    const text = eligible(seg);
    if (!text || /\d/.test(text)) return;
    if (!/\p{L}{2,}/u.test(text)) return;
    const first = text.replace(/^[^\p{L}\p{N}]+/u, '');
    // "Räume, die erzählen.", "Building robots that care.": a sentence is a slogan, not a logo
    if (/[.!?]$/.test(text.trim()) && !hasLegalForm(text) || /,\s*\p{Ll}/u.test(text)) return;
    if (/^\p{Ll}/u.test(first) || text.split(/\s+/).length > 6) return;
    const band = i < Math.max(2, n * 0.3) || i >= n - Math.max(1, n * 0.2);
    const score = seg.height * 20 + (hasCompanyHint(text) ? 3 : 0) + (band ? 1 : 0) + (i === 0 ? 0.5 : 0) + (/^[\p{Lu}\s&.'-]+$/u.test(text) ? 0.5 : 0);
    cands.push({ seg, text, score, i });
  });
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (!best) return;
  let value = best.text;
  const used = [best.seg];
  const next = front[best.i + 1];
  if (next && next.lineId !== best.seg.lineId && Math.abs(next.height - best.seg.height) <= 0.01 && /^\p{Ll}/u.test(next.rest.trim()) && !/\d|@/.test(next.rest) && eligible(next)) {
    value = `${value} ${eligible(next)}`;
    used.push(next);
  }
  // "KARAOSMANOĞLU" / "Hukuk Bürosu", "HALLWORTH PRYCE" / "Solicitors": a company-word line continues the larger name above
  const prev = front[best.i - 1];
  if (prev && hasCompanyHint(value) && value.split(/\s+/).length <= 2 && prev.used.length === 0 && !nameSegIds.has(prev.id) && !ctx.titleSegs.has(prev.id) && prev.height > best.seg.height && eligible(prev) && !/\d|@/.test(prev.rest) && prev.rest.trim().split(/\s+/).length <= 3 && !personShaped(prev.rest.trim())) {
    value = `${eligible(prev)} ${value}`;
    used.unshift(prev);
  }
  const hint = hasCompanyHint(value);
  ctx.company = { value: cleanCompany(value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, '')), confidence: hint ? 'medium' : 'low', sources: used.map((s) => s.lineId), rule: hint ? 'company.hint' : 'company.logo' };
  for (const s of used) consumeAll(s, 'company');
}
