/**
 * @jest-environment node
 */
// lib/contacts against a fake expo-contacts: the Android lookup after the system form (S4/D51) and "add to existing"
// adding values one by one without ever patching a list or overwriting a filled scalar (D47).
import { emptyContact, emptyName, type ContactCard } from '@/engine/contact';
import { ENGLISH_NOTE_LABELS } from '@/engine/vcard/writer';

const os = { OS: 'android' };
const state = {
  formResult: false,
  access: { status: 'granted', granted: true } as { status: string; granted: boolean; accessPrivileges?: string },
  all: [] as { id: string; givenName?: string; familyName?: string; company?: string; phones?: { number: string }[]; emails?: { address: string }[] }[],
  details: {} as Record<string, unknown>,
  calls: [] as string[],
};

jest.mock('react-native', () => ({ Platform: os }));
jest.mock('expo-contacts', () => {
  class Contact {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    static presentCreateForm = async () => state.formResult;
    static getAllDetails = async () => state.all;
    static create = async () => new Contact('new-1');
    async getDetails() {
      return state.details;
    }
    async addPhone(p: { number: string }) {
      state.calls.push(`addPhone ${p.number}`);
      return 'x';
    }
    async addEmail(e: { address: string }) {
      state.calls.push(`addEmail ${e.address}`);
      return 'x';
    }
    async addUrlAddress(u: { url: string }) {
      state.calls.push(`addUrl ${u.url}`);
      return 'x';
    }
    async addAddress() {
      state.calls.push('addAddress');
      return 'x';
    }
    async addSocialProfile() {
      state.calls.push('addSocial');
      return 'x';
    }
    async patch(p: Record<string, unknown>) {
      state.calls.push(`patch ${Object.keys(p).sort().join(',')}`);
    }
  }
  return {
    Contact,
    ContactField: new Proxy({}, { get: (_t, k) => String(k).toLowerCase() }),
    getPermissionsAsync: async () => state.access,
    requestPermissionsAsync: async () => state.access,
  };
});

// eslint-disable-next-line import/first
import { addToExistingContact, saveWithForm } from './contacts';

const nora = (more: Partial<ContactCard> = {}): ContactCard => ({ ...emptyContact(), name: { ...emptyName(), given: 'Nora', family: 'Lindrevik', full: 'Nora Lindrevik' }, emails: [{ value: 'nora@lindrevik-se.example', type: 'work' }], ...more });

beforeEach(() => {
  os.OS = 'android';
  state.formResult = false;
  state.access = { status: 'granted', granted: true };
  state.all = [];
  state.calls = [];
});

describe('one card through the system form (S4, D51)', () => {
  it('the form says saved → saved, no lookup needed', async () => {
    state.formResult = true;
    expect(await saveWithForm(nora(), ENGLISH_NOTE_LABELS, 'SE')).toEqual({ result: 'saved', contactId: null });
  });

  it('Android, no result, access granted, the same person is in Contacts → found (with its id)', async () => {
    state.all = [{ id: 'c-7', givenName: 'Nora', familyName: 'Lindrevik', emails: [{ address: 'NORA@lindrevik-se.example' }] }];
    expect(await saveWithForm(nora(), ENGLISH_NOTE_LABELS, 'SE')).toEqual({ result: 'found', contactId: 'c-7' });
  });

  it('no claim without evidence: not found, no access, only a "possible" match, or iOS', async () => {
    state.all = [{ id: 'c-1', givenName: 'Nora', familyName: 'Lindrevik' }]; // name only = possible, not same
    expect((await saveWithForm(nora(), ENGLISH_NOTE_LABELS, 'SE')).result).toBe('none');
    state.all = [{ id: 'c-7', givenName: 'Nora', familyName: 'Lindrevik', emails: [{ address: 'nora@lindrevik-se.example' }] }];
    state.access = { status: 'denied', granted: false };
    expect((await saveWithForm(nora(), ENGLISH_NOTE_LABELS, 'SE')).result).toBe('none'); // never asks for the permission
    state.access = { status: 'granted', granted: true };
    os.OS = 'ios';
    expect((await saveWithForm(nora(), ENGLISH_NOTE_LABELS, 'SE')).result).toBe('none');
  });
});

describe('add to existing contact (D47)', () => {
  it('adds each new value with its own add call; fills only empty scalars; never patches a list', async () => {
    state.details = { givenName: 'Nora', familyName: 'Lindrevik', company: 'Lindrevik AB', jobTitle: null, note: '', phones: [{ label: 'work', number: '+46 8 123 456' }], emails: [{ label: 'work', address: 'nora@lindrevik-se.example' }], urlAddresses: [], addresses: [], socialProfiles: [] };
    const card = nora({ company: 'Lindrevik Design AB', title: 'Partner', phones: [{ value: '+46 8 123 456', type: 'work' }, { value: '+46 70 555 01 23', type: 'mobile' }], urls: ['lindrevik.se'], event: 'Formex' });
    const plan = await addToExistingContact('c-7', card, ENGLISH_NOTE_LABELS, 'SE');
    expect(state.calls).toEqual(['addPhone +46 70 555 01 23', 'addUrl lindrevik.se', 'patch jobTitle,note']);
    expect(plan.conflicts.map((c) => c.field)).toEqual(['company']); // shown to the user, never written
    expect(plan.count).toBe(3);
  });

  it('a contact with a note keeps it (Android); iOS never writes or reads the note', async () => {
    state.details = { givenName: 'Nora', familyName: 'Lindrevik', note: 'Met 2024', phones: [], emails: [{ address: 'nora@lindrevik-se.example' }] };
    await addToExistingContact('c-7', nora({ title: 'Partner', event: 'Formex' }), ENGLISH_NOTE_LABELS);
    expect(state.calls).toEqual(['patch jobTitle']);
    state.calls = [];
    os.OS = 'ios';
    state.details = { givenName: 'Nora', familyName: 'Lindrevik', phones: [], emails: [{ address: 'nora@lindrevik-se.example' }] };
    await addToExistingContact('c-7', nora({ title: 'Partner', event: 'Formex' }), ENGLISH_NOTE_LABELS);
    expect(state.calls).toEqual(['patch jobTitle']);
  });
});
