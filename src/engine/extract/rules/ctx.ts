// Shared state of one extraction run. Pure.
import type { Seg } from '../normalize';
import type { Candidate, EmailValue, Extracted, Line, PhoneValue, SocialValue } from '../types';
import type { Address, NameParts } from '../../contact';

export type Ctx = {
  segs: Seg[];
  lines: Line[];
  /** Phone region of the device (fallback default country). */
  region?: string;
  /** Best guess of the card's country (from +cc numbers, country names, ccTLDs, the region). */
  cardCountry?: string;
  /** True when `cardCountry` comes from the card itself (+cc, address pattern, country name, ccTLD), not the region (M1). */
  countryEvidence?: boolean;
  uiLang: string;
  /** Input line ids with OCR-damage indicators or a low OCR line confidence (P5c): names from them are at most medium. */
  damaged: Set<string>;
  /** Domain stems of the card's e-mail and web addresses (company rule). */
  stems: string[];
  emails: Candidate<EmailValue>[];
  urls: Candidate<string>[];
  socials: Candidate<SocialValue>[];
  phones: Candidate<PhoneValue>[];
  addresses: Candidate<Address>[];
  name?: Candidate<NameParts>;
  otherName?: Candidate<string>;
  company?: Candidate<string>;
  /** Strong company candidates (for the script preference after the name). */
  companyCands?: { seg: Seg; c: Candidate<string> }[];
  department?: Candidate<string>;
  title?: Candidate<string>;
  alternatives: Extracted['alternatives'];
  /** Segment ids that are title/department dictionary hits (the name rule skips them). */
  titleSegs: Map<string, 'title' | 'department'>;
  /** Title spans made only of generic words ("Head of Sales"): at most medium, no name signal (review M3). */
  weakTitles?: Set<string>;
  /** A single generic word alone on its line ("Partner"): asked (low) only when next to the name. */
  loneTitles?: Set<string>;
};

export const srcOf = (seg: Seg) => [seg.lineId];
