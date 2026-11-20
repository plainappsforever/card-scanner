// Contacts (SPEC §6.2, D12). Default path (one card): the system "new contact" form — iOS CNContactViewController,
// Android ACTION_INSERT — with NO Contacts permission; the user taps Save there (a second confirmation, L26).
// Enhanced path (several cards, duplicate check): the permission, asked ONLY at that moment after our explanation.
// Notes on iOS need Apple's contact-notes entitlement (owner question, not requested) → the note is left out on iOS,
// and never READ there either. "Add to existing contact" (P8, D47) adds new values only, one add call per value, and
// fills a scalar only where the contact has none — it never patches a list (expo-contacts' `patch` REPLACES lists).
import { Contact, getPermissionsAsync, requestPermissionsAsync, ContactField, type ContactPatch, type CreateContactRecord } from 'expo-contacts';
import { Platform } from 'react-native';

import type { ContactCard, EmailType, PhoneType } from '@/engine/contact';
import { emptyContact } from '@/engine/contact';
import { planContactPatch, type ContactPatchPlan } from '@/engine/contact-patch';
import { findMatches } from '@/engine/match';
import { socialUrl } from '@/engine/social';
import { composeNote, type NoteLabels } from '@/engine/vcard/writer';

const PHONE_LABEL: Record<PhoneType, string> = { mobile: 'mobile', work: 'work', fax: 'work fax', home: 'home', other: 'other' };

/** Our contact → expo-contacts' record. `noteLabels` given = the note (event, where met, notes) is written (Android). */
export function toRecord(c: ContactCard, noteLabels?: NoteLabels): CreateContactRecord {
  const n = c.name;
  const r: CreateContactRecord = {};
  if (n) {
    if (n.given || n.family || n.middle) {
      if (n.prefix) r.prefix = n.prefix;
      if (n.given) r.givenName = n.given;
      if (n.middle) r.middleName = n.middle;
      if (n.family) r.familyName = n.family;
      if (n.suffix) r.suffix = n.suffix;
    } else if (n.full) r.givenName = n.full;
  }
  if (c.company) r.company = c.company;
  if (c.department) r.department = c.department;
  if (c.title) r.jobTitle = c.title;
  if (c.phones.length) r.phones = c.phones.map((p) => ({ label: PHONE_LABEL[p.type], number: p.value }));
  if (c.emails.length) r.emails = c.emails.map((e) => ({ label: e.type, address: e.value }));
  const urls = [...c.urls, ...c.socials.map((s) => socialUrl(s)).filter((u): u is string => !!u)];
  if (urls.length) r.urlAddresses = urls.map((u) => ({ label: 'work', url: u }));
  const handles = c.socials.filter((s) => !socialUrl(s));
  if (handles.length) r.socialProfiles = handles.map((s) => ({ service: s.service, username: s.value }));
  if (c.addresses.length) {
    r.addresses = c.addresses.map((a) => ({ label: 'work', street: a.street, city: a.city, region: a.region, postcode: a.postcode, country: a.country }));
  }
  if (noteLabels && Platform.OS !== 'ios') {
    const note = composeNote(c, noteLabels);
    if (note) r.note = note;
  }
  return r;
}

/** U1: the system form, prefilled. true = the user saved it (Android: RESULT_OK; iOS: the controller returned a contact). */
export async function presentNewContactForm(c: ContactCard, noteLabels: NoteLabels): Promise<boolean> {
  return Contact.presentCreateForm(toRecord(c, noteLabels));
}

export type Access = 'granted' | 'limited' | 'denied' | 'undetermined';

export async function contactsAccess(): Promise<Access> {
  const p = await getPermissionsAsync();
  return accessOf(p);
}

/** Asks the system (only from the bulk/duplicate screen, after our explanation). */
export async function requestContactsAccess(): Promise<Access> {
  return accessOf(await requestPermissionsAsync());
}

function accessOf(p: { status: string; granted: boolean; accessPrivileges?: 'all' | 'limited' | 'none' }): Access {
  if (p.accessPrivileges === 'limited') return 'limited';
  if (p.granted) return 'granted';
  return p.status === 'denied' ? 'denied' : 'undetermined';
}

/** Creates one contact (permission needed). Returns its id. */
export async function createContact(c: ContactCard, noteLabels: NoteLabels): Promise<string> {
  const contact = await Contact.create(toRecord(c, noteLabels));
  return contact.id;
}

/** The phone's contacts as our model, for the duplicate check (only names, company, phones, e-mails). */
export async function phoneContacts(): Promise<{ id: string; contact: ContactCard }[]> {
  const fields = [ContactField.GIVEN_NAME, ContactField.MIDDLE_NAME, ContactField.FAMILY_NAME, ContactField.COMPANY, ContactField.PHONES, ContactField.EMAILS] as const;
  const all = await Contact.getAllDetails(fields);
  return all.map((d, i) => {
    const x = d as unknown as { id?: string; givenName?: string | null; middleName?: string | null; familyName?: string | null; company?: string | null; phones?: { number?: string }[]; emails?: { address?: string }[] };
    const c = emptyContact();
    const given = x.givenName ?? '';
    const family = x.familyName ?? '';
    c.name = { prefix: '', given, middle: x.middleName ?? '', family, suffix: '', full: [given, family].filter(Boolean).join(' ') };
    if (x.company) c.company = x.company;
    c.phones = (x.phones ?? []).filter((p) => p.number).map((p) => ({ value: p.number as string, type: 'other' as PhoneType }));
    c.emails = (x.emails ?? []).filter((e) => e.address).map((e) => ({ value: e.address as string, type: 'other' as const }));
    return { id: x.id ?? `phone-${i}`, contact: c };
  });
}

const DETAIL_FIELDS = [
  ContactField.PREFIX,
  ContactField.GIVEN_NAME,
  ContactField.MIDDLE_NAME,
  ContactField.FAMILY_NAME,
  ContactField.SUFFIX,
  ContactField.COMPANY,
  ContactField.DEPARTMENT,
  ContactField.JOB_TITLE,
  ContactField.PHONES,
  ContactField.EMAILS,
  ContactField.URL_ADDRESSES,
  ContactField.ADDRESSES,
  ContactField.SOCIAL_PROFILES,
] as const;

type Details = {
  prefix?: string | null;
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  suffix?: string | null;
  company?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  note?: string | null;
  phones?: { label?: string; number?: string }[];
  emails?: { label?: string; address?: string }[];
  urlAddresses?: { url?: string }[];
  addresses?: { street?: string; city?: string; region?: string; postcode?: string; country?: string }[];
  socialProfiles?: { service?: string; username?: string; url?: string }[];
};

const phoneType = (label = ''): PhoneType => (/fax/i.test(label) ? 'fax' : /mobile|cell|iphone/i.test(label) ? 'mobile' : /work/i.test(label) ? 'work' : /home/i.test(label) ? 'home' : 'other');
const emailType = (label = ''): EmailType => (/work/i.test(label) ? 'work' : /home/i.test(label) ? 'home' : 'other');

/** A phone contact's details as our model (for the matcher and the add-to-existing plan). */
export function fromDetails(d: Details): ContactCard {
  const c = emptyContact();
  const n = { prefix: d.prefix ?? '', given: d.givenName ?? '', middle: d.middleName ?? '', family: d.familyName ?? '', suffix: d.suffix ?? '', full: '' };
  n.full = [n.given, n.middle, n.family].filter(Boolean).join(' ');
  if (n.full) c.name = n;
  if (d.company) c.company = d.company;
  if (d.department) c.department = d.department;
  if (d.jobTitle) c.title = d.jobTitle;
  c.phones = (d.phones ?? []).filter((p) => p.number).map((p) => ({ value: p.number as string, type: phoneType(p.label) }));
  c.emails = (d.emails ?? []).filter((e) => e.address).map((e) => ({ value: e.address as string, type: emailType(e.label) }));
  c.urls = (d.urlAddresses ?? []).map((u) => u.url ?? '').filter(Boolean);
  c.addresses = (d.addresses ?? []).map((a) => ({ street: a.street ?? '', city: a.city ?? '', region: a.region ?? '', postcode: a.postcode ?? '', country: a.country ?? '', countryCode: '', raw: '' }));
  c.socials = (d.socialProfiles ?? []).filter((s) => s.username || s.url).map((s) => ({ service: 'other' as const, value: (s.username || s.url) as string }));
  if (d.note) c.notes = d.note;
  return c;
}

/** One contact's details (permission needed). The note only on Android (iOS needs the notes entitlement). */
export async function contactDetails(id: string): Promise<ContactCard> {
  const fields = Platform.OS === 'ios' ? DETAIL_FIELDS : ([...DETAIL_FIELDS, ContactField.NOTE] as const);
  return fromDetails((await new Contact(id).getDetails(fields)) as unknown as Details);
}

/**
 * Adds the card's NEW values to an existing phone contact (permission needed): one add call per phone, e-mail, web
 * address, postal address and profile; a name/company/department/title only where the contact has none; on Android the
 * note (event, where met, notes) only when the contact has no note. Returns the plan that was applied. A failure part
 * way leaves the values added so far; a retry plans again from the contact as it is then, so nothing is added twice.
 */
export async function addToExistingContact(id: string, card: ContactCard, noteLabels: NoteLabels, region?: string): Promise<ContactPatchPlan> {
  const existing = await contactDetails(id);
  const plan = planContactPatch(existing, card, region);
  const contact = new Contact(id);
  const a = plan.additions;
  for (const p of a.phones) await contact.addPhone({ label: PHONE_LABEL[p.type], number: p.value });
  for (const e of a.emails) await contact.addEmail({ label: e.type, address: e.value });
  for (const u of a.urls) await contact.addUrlAddress({ label: 'work', url: u });
  for (const x of a.addresses) await contact.addAddress({ label: 'work', street: x.street, city: x.city, region: x.region, postcode: x.postcode, country: x.country });
  for (const s of a.socials) await contact.addSocialProfile({ service: s.service, username: s.value });
  const patch: ContactPatch = {};
  const f = a.fill;
  if (f.name) {
    if (f.name.given || f.name.family || f.name.middle) {
      if (f.name.prefix) patch.prefix = f.name.prefix;
      if (f.name.given) patch.givenName = f.name.given;
      if (f.name.middle) patch.middleName = f.name.middle;
      if (f.name.family) patch.familyName = f.name.family;
      if (f.name.suffix) patch.suffix = f.name.suffix;
    } else if (f.name.full) patch.givenName = f.name.full;
  }
  if (f.company) patch.company = f.company;
  if (f.department) patch.department = f.department;
  if (f.title) patch.jobTitle = f.title;
  if (Platform.OS !== 'ios' && !existing.notes) {
    const note = composeNote(card, noteLabels);
    if (note) patch.note = note;
  }
  if (Object.keys(patch).length) await contact.patch(patch);
  return plan;
}

/**
 * Android after the system form (S4: Google Contacts returns no "saved" result): when Contacts access was granted
 * anyway, look the person up — a contact the matcher calls the SAME person (e-mail, mobile, name + company). Never
 * asks for the permission. iOS reports the result itself, so this is Android only.
 */
export async function findInContacts(card: ContactCard, region?: string): Promise<string | null> {
  if (Platform.OS === 'ios' || (await contactsAccess()) !== 'granted') return null;
  const all = await phoneContacts();
  const m = findMatches(card, all, { region });
  return m.verdict === 'same' && m.best ? m.best.card.id : null;
}

/**
 * One card through the system "new contact" form (no permission). 'saved' = the form said so; 'found' = Android gave
 * no result, but the person is in Contacts now (lookup with the access the user granted anyway); 'none' otherwise.
 */
export async function saveWithForm(card: ContactCard, noteLabels: NoteLabels, region?: string): Promise<{ result: 'saved' | 'found' | 'none'; contactId: string | null }> {
  if (await presentNewContactForm(card, noteLabels)) return { result: 'saved', contactId: null };
  const id = await findInContacts(card, region).catch(() => null);
  return id ? { result: 'found', contactId: id } : { result: 'none', contactId: null };
}
