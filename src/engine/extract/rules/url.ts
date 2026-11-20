// Rule 4 — websites and social profiles (SPEC §5.1). www./scheme/bare domains with a known TLD and no "@". A bare
// domain needs a lower-case TLD as printed (so "GmbH & Co.KG", "Mo.-Fr." are not websites) unless the segment is
// labelled "Web:"/"www". Profile URLs of known services become socials (high); a labelled handle ("LinkedIn: …",
// "Instagram @…", "WeChat: …") is a social (medium); a lone "@handle" is social "other" (low).
import type { SocialService } from '../../contact';
import { urlKey } from '../../merge';
import { socialFromUrl } from '../../social';
import { SOCIAL_LABELS, URL_LABELS } from '../dict/labels';
import { alternation, consume, foldKeep } from '../normalize';
import { knownTld } from '../tld';

import type { Ctx } from './ctx';

const HOST_LABEL = '[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]*[\\p{L}\\p{N}])?';
const URL_RE = new RegExp(`(?<![\\p{L}\\p{N}@._-])((?:https?:\\/\\/)?(?:www?w?\\.)?${HOST_LABEL}(?:\\.${HOST_LABEL})*\\.(\\p{L}{2,})(?![\\p{L}\\p{N}-])(?:[/?#][^\\s]*)?)`, 'giu');
const URL_LABEL_START = new RegExp(`^(?:${alternation(URL_LABELS)})(?![\\p{L}])\\s*[.:：]?`, 'iu');
const SOCIAL_LABEL = new RegExp(`(?<![\\p{L}])(${alternation(Object.keys(SOCIAL_LABELS))})(?![\\p{L}])\\s*(?:[.:：/]|id\\b)?\\s*(@?[\\p{L}\\p{N}_.\\-/]{2,})`, 'iu');

/** Hosts printed as websites (pre-pass for the e-mail rule: "missing @" repair). */
export function websiteHosts(texts: readonly string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/(?:https?:\/\/)?www\.([a-z0-9.-]+\.[a-z]{2,})/gi)) out.add(m[1].toLowerCase());
  }
  return [...out];
}

function cleanUrl(u: string): string {
  return u.replace(/[),.;:!'"]+$/, '').replace(/^wwww\./i, 'www.');
}

export function findUrls(ctx: Ctx): void {
  for (const seg of ctx.segs) {
    if (seg.rest.trim() === '') continue;
    const labelled = URL_LABEL_START.test(foldKeep(seg.rest.trimStart()));
    // OCR read "www acme de" for "www.acme.de" (labelled or starting with www)
    let text = seg.rest;
    let spaced = false;
    const sp = /(?<![\p{L}])www[ ,]+([\p{L}\p{N}-]{2,})[ ,]+([a-z]{2,6})(?![\p{L}])/iu.exec(text);
    if (sp && knownTld(sp[2])) {
      const fixed = `www.${sp[1]}.${sp[2]}`;
      text = text.slice(0, sp.index) + fixed.padEnd(sp[0].length, ' ') + text.slice(sp.index + sp[0].length);
      spaced = true;
    }
    URL_RE.lastIndex = 0;
    for (const m of text.matchAll(URL_RE)) {
      const start = m.index ?? 0;
      const full = cleanUrl(m[1]);
      const tld = m[2];
      const host = full.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
      const explicit = /^(https?:\/\/|www\.)/i.test(full);
      const labels = host.split('.');
      // an unknown TLD after an explicit "www."/scheme is still a website (D32: the TLD list is a curated snapshot) → medium (S9)
      const unknown = !knownTld(host);
      if (unknown && !(explicit && /^\p{L}{2,24}$/u.test(tld) && labels.length >= (/^www\./i.test(host) ? 3 : 2))) continue;
      if (!explicit) {
        if (!labelled && tld !== tld.toLowerCase()) continue;
        if (labels.length < 2 || (labels[labels.length - 2].length < 2 && !socialFromUrl(full))) continue;
        // "z.B.", "e.K.", "i.A." style abbreviations and decimal numbers are not hosts
        if (/^\d+(\.\d+)+$/.test(host)) continue;
        // "Org.nr 556123-4567", "St.nr. 12/345": a short label + "nr"/"no" before a number is a registry label (P5c)
        if (labels.length === 2 && /^\s*[.:]?\s*\d/.test(text.slice(start + m[0].length)) && /^(nr|no|nb|id)$/i.test(tld)) continue;
      }
      if (text[start + m[0].length] === '@' || text[start - 1] === '@') continue;
      const social = socialFromUrl(full);
      // "x.com/Ivr_nlp" (O3): a capital I starting a word of an otherwise lower-case profile path may be an l → medium
      const iOrL = !!social && /(?:\/|[._-])I\p{Ll}/u.test(full) && full.replace(/I/g, '') === full.replace(/I/g, '').toLowerCase();
      const confidence = unknown || spaced || iOrL || /^wwww\./i.test(m[1]) ? 'medium' : 'high';
      // the same address again (or from the QR code): this line joins its sources, so it is never hidden (M5)
      const twin = social ? ctx.socials.find((s) => s.value.value.toLowerCase() === full.toLowerCase() || urlKey(s.value.value) === urlKey(full)) : ctx.urls.find((u) => urlKey(u.value) === urlKey(full));
      if (twin) {
        if (!twin.sources.includes(seg.lineId)) twin.sources = [...twin.sources, seg.lineId];
      } else if (social) ctx.socials.push({ value: social, confidence, sources: [seg.lineId], rule: 'social.url' });
      else ctx.urls.push({ value: full, confidence, sources: [seg.lineId], rule: explicit ? 'url' : 'url.bare' });
      consume(seg, start, start + m[0].length, social ? 'social' : 'url');
    }
  }
}

export function findSocialHandles(ctx: Ctx): void {
  for (const seg of ctx.segs) {
    const r = seg.rest;
    if (r.trim() === '') continue;
    let m = SOCIAL_LABEL.exec(foldKeep(r));
    // "微信 WeChat: liminghua_sz": a bilingual label pair — the handle follows the LAST label word
    while (m && m.index !== undefined && SOCIAL_LABELS[m[2].replace(/[.:：]+$/, '').toLowerCase()]) {
      const off = m.index + m[0].length - m[2].length;
      const again = SOCIAL_LABEL.exec(foldKeep(r).slice(off));
      if (!again || again.index === undefined) break;
      again.index += off;
      m = again;
    }
    if (m && m.index !== undefined) {
      const key = m[1].toLowerCase();
      const service: SocialService = SOCIAL_LABELS[key] ?? 'other';
      // "in" (LinkedIn icon read as text) and "x" only count with a "/" or ":" ("in/anna-weber", "X: @anna")
      const between = r.slice(m.index + m[1].length, m.index + m[0].length - m[2].length);
      if ((key === 'in' || key === 'x' || key === 'line') && !/[/:：]|@/.test(between + m[2].slice(0, 1))) continue;
      const handle = r.slice(m.index + m[0].length - m[2].length, m.index + m[0].length).replace(/[.,;:]+$/, '');
      if (/^\+?\d[\d\s-]{5,}$/.test(handle)) continue; // a number after "WhatsApp" is a phone
      ctx.socials.push({ value: { service, value: handle }, confidence: 'medium', sources: [seg.lineId], rule: 'social.label' });
      consume(seg, m.index, m.index + m[0].length, 'social');
      continue;
    }
    const lone = /(?<![\p{L}\p{N}.])@([A-Za-z0-9_.]{2,30})(?![\p{L}\p{N}@])/u.exec(r);
    if (lone && lone.index !== undefined && !/@[^\s]*\./.test(r.slice(lone.index, lone.index + lone[0].length + 1).replace(/\.$/, ''))) {
      ctx.socials.push({ value: { service: 'other', value: `@${lone[1].replace(/\.$/, '')}` }, confidence: 'low', sources: [seg.lineId], rule: 'social.handle' });
      consume(seg, lone.index, lone.index + lone[0].length, 'social');
    }
  }
}
