// Extractor input/output (SPEC §5.1). Pure types.
import type { Address, NameParts, PhoneType, EmailType, SocialService } from '../contact';

export type Confidence = 'high' | 'medium' | 'low';
export type Box = { x: number; y: number; w: number; h: number };
/** One OCR line in the upright card frame (SPEC §5.0). `id` = side letter + index ("f3", "b0"); paste text = "t<n>". */
export type Line = { id: string; text: string; box?: Box; height?: number; dir?: 'ltr' | 'rtl'; conf?: number };

/** A decoded code from the card image (QR/Aztec/DataMatrix/PDF417). */
export type ParsedCode = { format?: string; text: string };

export type ExtractInput = {
  front: Line[];
  back?: Line[];
  qr?: ParsedCode[];
  /** ISO 3166 alpha-2 of the phone's region (setting `phone_region`). */
  region?: string;
  /** UI language (for N7: which script is primary). */
  uiLang?: string;
};

export type Candidate<T> = { value: T; confidence: Confidence; sources: string[]; rule: string };

/** `ext` = extension printed after the number ("x 312", "ext. 204"); also part of `value`, never of `e164`. */
export type PhoneValue = { value: string; type: PhoneType; e164?: string; raw: string; labelled: boolean; ext?: string };
export type EmailValue = { value: string; type: EmailType };
export type SocialValue = { service: SocialService; value: string };

export type Extracted = {
  name?: Candidate<NameParts>;
  otherName?: Candidate<string>;
  company?: Candidate<string>;
  department?: Candidate<string>;
  title?: Candidate<string>;
  phones: Candidate<PhoneValue>[];
  emails: Candidate<EmailValue>[];
  urls: Candidate<string>[];
  socials: Candidate<SocialValue>[];
  addresses: Candidate<Address>[];
  /** Second-best value per scalar field (the review screen offers it). */
  alternatives: Partial<Record<'name' | 'company' | 'department' | 'title', Candidate<string | NameParts>>>;
  /** Line ids not used by any field — shown as "Text on the card". */
  leftovers: string[];
  /** Every input line by id (front, back, codes as `q<n>`), so the UI can show leftovers and source outlines. */
  lines: Line[];
  version: string;
};
