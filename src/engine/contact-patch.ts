// "Add to existing contact" (SPEC §5.5/§7 screen 4, P8): what a checked card would ADD to a contact in the phone's
// Contacts. Pure. New values only: lists get the values the contact lacks (same normalised keys as the merge plan),
// a scalar (name, company, department, title) is filled only when the contact has none; a differing scalar is a
// conflict that is SHOWN and never applied — the phone contact is never overwritten (owner rule, D47).
import type { Address, ContactCard, Email, NameParts, Phone, Social } from './contact';
import { planMerge, type Conflict } from './merge';
import { socialUrl } from './social';

export type ContactAdditions = {
  phones: Phone[];
  emails: Email[];
  urls: string[];
  socials: Social[];
  addresses: Address[];
  fill: { name?: NameParts; company?: string; department?: string; title?: string };
};
export type ContactPatchPlan = { additions: ContactAdditions; conflicts: Exclude<Conflict, { field: 'otherName' }>[]; count: number };

/** The card as the system contact will hold it: profile links are web addresses there, handles stay social profiles. */
export function asContactRecord(c: ContactCard): ContactCard {
  const links = c.socials.map((s) => socialUrl(s)).filter((u): u is string => !!u);
  return { ...c, urls: [...c.urls, ...links], socials: c.socials.filter((s) => !socialUrl(s)) };
}

export function planContactPatch(existing: ContactCard, incoming: ContactCard, region?: string): ContactPatchPlan {
  const plan = planMerge(asContactRecord(existing), asContactRecord(incoming), region);
  const { name, company, department, title } = plan.additions.fill; // otherName has no place in a phone contact
  const fill: ContactAdditions['fill'] = {};
  if (name) fill.name = name;
  if (company) fill.company = company;
  if (department) fill.department = department;
  if (title) fill.title = title;
  const a = plan.additions;
  const additions: ContactAdditions = { phones: a.phones, emails: a.emails, urls: a.urls, socials: a.socials, addresses: a.addresses, fill };
  const count = a.phones.length + a.emails.length + a.urls.length + a.socials.length + a.addresses.length + Object.keys(fill).length;
  return { additions, conflicts: plan.conflicts.filter((c): c is ContactPatchPlan['conflicts'][number] => c.field !== 'otherName'), count };
}

/** Per kind, how many values would be added (for "Adds 1 phone number, 1 e-mail address"). */
export function additionCounts(p: ContactPatchPlan): { phones: number; emails: number; urls: number; addresses: number; socials: number; details: number } {
  const a = p.additions;
  return { phones: a.phones.length, emails: a.emails.length, urls: a.urls.length, addresses: a.addresses.length, socials: a.socials.length, details: Object.keys(a.fill).length };
}
