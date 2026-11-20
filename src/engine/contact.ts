// The contact model shared by the extractor output (without confidences), the vCard writer/reader, CSV, the matcher,
// merge and formatting. Pure TypeScript, no React Native imports (SPEC §5).

export type PhoneType = 'mobile' | 'work' | 'fax' | 'home' | 'other';
export type EmailType = 'work' | 'home' | 'other';
export type SocialService =
  | 'linkedin'
  | 'xing'
  | 'x'
  | 'instagram'
  | 'facebook'
  | 'github'
  | 'youtube'
  | 'tiktok'
  | 'wechat'
  | 'line'
  | 'telegram'
  | 'whatsapp'
  | 'other';

export const PHONE_TYPES: readonly PhoneType[] = ['mobile', 'work', 'fax', 'home', 'other'];
export const EMAIL_TYPES: readonly EmailType[] = ['work', 'home', 'other'];
export const SOCIAL_SERVICES: readonly SocialService[] = ['linkedin', 'xing', 'x', 'instagram', 'facebook', 'github', 'youtube', 'tiktok', 'wechat', 'line', 'telegram', 'whatsapp', 'other'];

export type NameParts = { prefix: string; given: string; middle: string; family: string; suffix: string; full: string };
export type Address = { street: string; city: string; region: string; postcode: string; country: string; countryCode: string; raw: string };
/** `value` = display form (international format when parseable, else as printed); `e164` only when valid. */
export type Phone = { value: string; type: PhoneType; e164?: string };
export type Email = { value: string; type: EmailType };
/** `value` = a profile URL or a handle/ID as printed. */
export type Social = { service: SocialService; value: string };

export type ContactCard = {
  name?: NameParts;
  otherName?: string;
  company?: string;
  department?: string;
  title?: string;
  phones: Phone[];
  emails: Email[];
  urls: string[];
  socials: Social[];
  addresses: Address[];
  /** The user's free notes; event/met data are separate so writers decide how to label them. */
  notes?: string;
  event?: string;
  metOn?: string;
  metWhere?: string;
  tags: string[];
};

export function emptyContact(): ContactCard {
  return { phones: [], emails: [], urls: [], socials: [], addresses: [], tags: [] };
}

export function emptyName(): NameParts {
  return { prefix: '', given: '', middle: '', family: '', suffix: '', full: '' };
}

export function emptyAddress(): Address {
  return { street: '', city: '', region: '', postcode: '', country: '', countryCode: '', raw: '' };
}

/** "Prefix Given Middle Family Suffix" from the parts (Latin order); `full` wins when the parts are empty. */
export function joinName(n: NameParts): string {
  const parts = [n.prefix, n.given, n.middle, n.family, n.suffix].map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : n.full.trim();
}

export function hasName(n: NameParts | undefined): n is NameParts {
  return !!n && (joinName(n) !== '' || n.full.trim() !== '');
}
