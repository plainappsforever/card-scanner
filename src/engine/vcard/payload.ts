// "My card" QR payload (SPEC §5.3): the writer's vCard 3.0 for one card without NOTE/CATEGORIES. Above 1,200 UTF-8
// bytes the socials, then the addresses are dropped (a QR at error-correction level M stays easy to scan from a phone
// screen) and the caller tells the user what was left out. Pure; the QR itself is drawn in P7.
import type { ContactCard } from '../contact';

import { utf8Length } from './text';
import { writeVCard } from './writer';

export const QR_PAYLOAD_LIMIT = 1200;
export type Omitted = 'socials' | 'addresses';

export function myCardPayload(card: ContactCard): { text: string; bytes: number; omitted: Omitted[]; fits: boolean } {
  let c: ContactCard = { ...card, notes: undefined, event: undefined, metOn: undefined, metWhere: undefined, otherName: undefined, tags: [] };
  const omitted: Omitted[] = [];
  let text = writeVCard([c], { includeNotes: false });
  if (utf8Length(text) > QR_PAYLOAD_LIMIT && c.socials.length > 0) {
    c = { ...c, socials: [] };
    omitted.push('socials');
    text = writeVCard([c], { includeNotes: false });
  }
  if (utf8Length(text) > QR_PAYLOAD_LIMIT && c.addresses.length > 0) {
    c = { ...c, addresses: [] };
    omitted.push('addresses');
    text = writeVCard([c], { includeNotes: false });
  }
  const bytes = utf8Length(text);
  return { text, bytes, omitted, fits: bytes <= QR_PAYLOAD_LIMIT };
}
