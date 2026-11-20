// Social profile URLs and handles (SPEC §5.1 rule 4, §5.3). Pure; shared by the extractor and the vCard reader/writer.
import type { Social, SocialService } from './contact';

type Rule = { service: SocialService; host: RegExp; path?: RegExp };
const RULES: Rule[] = [
  { service: 'linkedin', host: /(^|\.)linkedin\.com$/, path: /^\/(in|company|pub|profile)\/[^/]+/i },
  { service: 'xing', host: /(^|\.)xing\.(com|de)$/, path: /^\/(profile|pages|companies)\/[^/]+/i },
  { service: 'x', host: /^(www\.|mobile\.)?(x|twitter)\.com$/, path: /^\/[A-Za-z0-9_]{1,15}\/?$/ },
  { service: 'instagram', host: /^(www\.)?instagram\.com$/, path: /^\/[A-Za-z0-9_.]+\/?$/ },
  { service: 'facebook', host: /^(www\.|m\.)?(facebook|fb)\.com$/, path: /^\/[^/]+/ },
  { service: 'github', host: /^(www\.)?github\.com$/, path: /^\/[A-Za-z0-9-]+\/?$/ },
  { service: 'youtube', host: /^(www\.|m\.)?youtube\.com$/, path: /^\/(@|c\/|channel\/|user\/)[^/]+/ },
  { service: 'tiktok', host: /^(www\.)?tiktok\.com$/, path: /^\/@[^/]+/ },
  { service: 'telegram', host: /^(t\.me|telegram\.me)$/, path: /^\/[A-Za-z0-9_]{4,}/ },
  { service: 'whatsapp', host: /^(wa\.me|api\.whatsapp\.com)$/ },
  { service: 'line', host: /^line\.me$/ },
];

/** Host and path of a URL-ish string ("https://www.linkedin.com/in/x/" → { host: "www.linkedin.com", path: "/in/x/" }). */
export function splitUrl(url: string): { host: string; path: string } | null {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/\s?#]+)([^\s]*)$/i.exec(url.trim());
  if (!m) return null;
  return { host: m[1].toLowerCase(), path: m[2] || '' };
}

/** The social service of a profile URL, or null for an ordinary website. */
export function socialFromUrl(url: string): Social | null {
  const u = splitUrl(url);
  if (!u) return null;
  for (const r of RULES) {
    if (!r.host.test(u.host)) continue;
    if (r.path && !r.path.test(u.path)) return null;
    return { service: r.service, value: url.trim() };
  }
  return null;
}

const HANDLE_URL: Partial<Record<SocialService, (h: string) => string>> = {
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  xing: (h) => `https://www.xing.com/profile/${h}`,
  x: (h) => `https://x.com/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  github: (h) => `https://github.com/${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  telegram: (h) => `https://t.me/${h}`,
};

/** A profile URL for a social value: the value itself when it is a URL, a URL built from a handle, else null (WeChat, LINE IDs). */
export function socialUrl(s: Social): string | null {
  const v = s.value.trim();
  if (/^(https?:\/\/|www\.)/i.test(v) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(v)) return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const make = HANDLE_URL[s.service];
  const handle = v.replace(/^@/, '');
  return make && /^[A-Za-z0-9_.-]+$/.test(handle) ? make(handle) : null;
}
