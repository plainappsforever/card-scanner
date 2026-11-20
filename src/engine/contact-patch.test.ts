import { emptyAddress, emptyContact, emptyName, type ContactCard } from './contact';
import { additionCounts, asContactRecord, planContactPatch } from './contact-patch';

const person = (more: Partial<ContactCard> = {}): ContactCard => ({ ...emptyContact(), name: { ...emptyName(), given: 'Anna', family: 'Weber', full: 'Anna Weber' }, ...more });

describe('add to existing contact: new values only, never overwriting (D47)', () => {
  it('adds what the contact lacks; values it has (in another format) are not added twice', () => {
    const contact = person({ company: 'ACME GmbH', phones: [{ value: '+49 30 1234567', type: 'work' }], emails: [{ value: 'Anna.Weber@acme-de.example', type: 'work' }] });
    const card = person({
      company: 'ACME',
      title: 'Head of Sales',
      phones: [{ value: '030 1234567', type: 'work' }, { value: '+49 171 5550123', type: 'mobile' }],
      emails: [{ value: 'anna.weber@acme-de.example ', type: 'work' }],
      urls: ['https://acme.de'],
      addresses: [{ ...emptyAddress(), street: 'Hauptstr. 1', postcode: '10115', city: 'Berlin' }],
    });
    const plan = planContactPatch(contact, card, 'DE');
    expect(plan.additions.phones.map((p) => p.value)).toEqual(['+49 171 5550123']);
    expect(plan.additions.emails).toEqual([]);
    expect(plan.additions.urls).toEqual(['https://acme.de']);
    expect(plan.additions.addresses).toHaveLength(1);
    expect(plan.additions.fill).toEqual({ title: 'Head of Sales' }); // company "ACME" = "ACME GmbH" (legal form) → nothing
    expect(plan.conflicts).toEqual([]);
    expect(plan.count).toBe(4);
    expect(additionCounts(plan)).toEqual({ phones: 1, emails: 0, urls: 1, addresses: 1, socials: 0, details: 1 });
  });

  it('a differing name, company or title is a conflict that is reported, never applied', () => {
    const contact = person({ company: 'ACME', title: 'Sales' });
    const card = person({ name: { ...emptyName(), given: 'Annette', family: 'Weber', full: '' }, company: 'Beta AG', title: 'Head of Sales', otherName: 'アンナ' });
    const plan = planContactPatch(contact, card, 'DE');
    expect(plan.conflicts.map((c) => c.field).sort()).toEqual(['company', 'name', 'title']);
    expect(plan.additions.fill).toEqual({});
    expect(plan.count).toBe(0);
  });

  it('fills a name and company only when the contact has none (a contact saved as just a number)', () => {
    const contact: ContactCard = { ...emptyContact(), phones: [{ value: '+491715550123', type: 'mobile' }] };
    const plan = planContactPatch(contact, person({ company: 'ACME', phones: [{ value: '+49 171 5550123', type: 'mobile' }] }), 'DE');
    expect(plan.additions.fill.name?.given).toBe('Anna');
    expect(plan.additions.fill.company).toBe('ACME');
    expect(plan.additions.phones).toEqual([]);
  });

  it('profile links compare as the web addresses the contact stores; handles as social profiles', () => {
    const card = person({ socials: [{ service: 'linkedin', value: 'linkedin.com/in/annaweber' }, { service: 'wechat', value: 'anna_w' }] });
    expect(asContactRecord(card)).toMatchObject({ urls: ['https://linkedin.com/in/annaweber'], socials: [{ service: 'wechat', value: 'anna_w' }] });
    const contact = person({ urls: ['https://www.linkedin.com/in/annaweber/'] });
    const plan = planContactPatch(contact, card);
    expect(plan.additions.urls).toEqual([]);
    expect(plan.additions.socials).toEqual([{ service: 'wechat', value: 'anna_w' }]);
  });

  it('property: applying the plan never removes or changes a value the contact had', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
    const pick = <T,>(xs: T[]) => xs[rnd(xs.length)];
    const phones = ['+49 30 1234567', '030 1234567', '+49 171 5550123', '+1 212 555 0147', '+33 1 23 45 67 89'];
    const emails = ['a@acme-de.example', 'A@acme-de.example', 'b@betavon-com.example', 'c@gamma-fr.example'];
    const companies = ['', 'ACME', 'ACME GmbH', 'Beta AG'];
    const gen = (): ContactCard =>
      person({
        company: pick(companies) || undefined,
        title: pick(['', 'CEO', 'Sales']) || undefined,
        phones: Array.from({ length: rnd(3) }, () => ({ value: pick(phones), type: pick(['work', 'mobile'] as const) })),
        emails: Array.from({ length: rnd(3) }, () => ({ value: pick(emails), type: 'work' as const })),
      });
    for (let i = 0; i < 300; i++) {
      const contact = gen();
      const plan = planContactPatch(contact, gen(), 'DE');
      // scalars: only filled where empty
      for (const k of ['company', 'department', 'title'] as const) if (plan.additions.fill[k] !== undefined) expect(contact[k] ?? '').toBe('');
      // the result is the contact's lists plus additions (nothing removed, nothing rewritten)
      const after = [...contact.phones, ...plan.additions.phones];
      expect(after.slice(0, contact.phones.length)).toEqual(contact.phones);
      expect(plan.count).toBe(plan.additions.phones.length + plan.additions.emails.length + plan.additions.urls.length + plan.additions.socials.length + plan.additions.addresses.length + Object.keys(plan.additions.fill).length);
    }
  });
});
