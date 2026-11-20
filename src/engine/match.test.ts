import { rng, pick } from '../../test/random';

import type { ContactCard } from './contact';
import { emptyContact, emptyName } from './contact';
import { companyKey, emailKey, findMatches, foldText, nameKey, samePhoneKey, scorePair, type StoredCard } from './match';
import { applyMerge, mergeMeta, planMerge } from './merge';
import { phoneKey } from './phone';

function card(given: string, family: string, extra: Partial<ContactCard> = {}): ContactCard {
  return { ...emptyContact(), name: { ...emptyName(), given, family }, ...extra };
}
const stored = (id: string, c: ContactCard, createdAt = 0): StoredCard => ({ id, contact: c, createdAt });

describe('keys', () => {
  it('fold diacritics and special letters', () => {
    expect(foldText('Jürgen Øster Æbelø Straße')).toBe('jurgen oster aebelo strasse');
    expect(nameKey({ ...emptyName(), prefix: 'Dr.', given: 'Jürgen', family: 'Müller', suffix: 'PhD' })).toBe('jurgen muller');
    expect(nameKey('Müller, Jürgen Dr.')).toBe('jurgen muller');
    expect(companyKey('ACME Solutions GmbH & Co. KG')).toBe('acme solutions');
    expect(companyKey('(주) 삼성')).toBe('삼성');
    expect(emailKey(' Anna.Wendrau@acme-de.example ')).toBe('anna.wendrau@acme-de.example');
  });

  it('phone keys: E.164 equal, or last 9 digits when one side is not valid', () => {
    expect(samePhoneKey('+49301234567', '301234567')).toBe(true);
    expect(samePhoneKey('+49301234567', '+43301234567')).toBe(false); // two valid numbers in different countries
    expect(samePhoneKey('', '')).toBe(false);
  });
});

describe('scores and verdicts (SPEC §5.5)', () => {
  const anna = card('Anna', 'Wendrau', { company: 'ACME GmbH', emails: [{ value: 'anna.wendrau@acme-de.example', type: 'work' }], phones: [{ value: '+49 171 1234567', type: 'mobile', e164: '+491711234567' }] });

  it('same e-mail 1.0, same phone 0.95, name+company 0.9, near name+company 0.7, name only 0.6', () => {
    expect(scorePair(card('', '', { emails: [{ value: 'ANNA.WENDRAU@acme-de.example', type: 'work' }] }), anna).score).toBe(1);
    expect(scorePair(card('', '', { phones: [{ value: '0171 1234567', type: 'mobile' }] }), anna, { region: 'DE' }).score).toBe(0.95);
    expect(scorePair(card('Anna', 'Wendrau', { company: 'Acme' }), anna)).toEqual({ score: 0.9, reason: 'name+company' });
    expect(scorePair(card('Anna', 'Wendrav', { company: 'ACME' }), anna)).toEqual({ score: 0.7, reason: 'near-name+company' });
    expect(scorePair(card('Anna', 'Wendrau'), anna)).toEqual({ score: 0.6, reason: 'name' });
    expect(scorePair(card('Bob', 'Stone'), anna).score).toBe(0);
  });

  it('role mailboxes and shared lines are not evidence for one person (D28)', () => {
    const info = card('Anna', 'Wendrau', { emails: [{ value: 'info@acme-de.example', type: 'work' }] });
    expect(scorePair(card('Carl', 'Berg', { emails: [{ value: 'info@acme-de.example', type: 'work' }] }), info).score).toBe(0.3);
    const line = { value: '+49 30 1234567', type: 'work' as const, e164: '+49301234567' };
    expect(scorePair(card('Carl', 'Berg', { phones: [line] }), card('Anna', 'Wendrau', { phones: [line] })).score).toBe(0.6);
  });

  it('switchboard: a number on ≥ 3 stored cards with different names scores ≤ 0.3', () => {
    const line = { value: '+49 30 1234567', type: 'work' as const, e164: '+49301234567' };
    const pool = ['Anna Wendrau', 'Carl Berg', 'Dana Ruiz'].map((n, i) => stored(`s${i}`, card(n.split(' ')[0], n.split(' ')[1], { phones: [line] })));
    const r = findMatches(card('', '', { phones: [line] }), pool);
    expect(r.verdict).toBe('none');
    expect(r.ranked.every((m) => m.score <= 0.3)).toBe(true);
  });

  it('same needs a margin; two equally good candidates are only "possible"; nothing is ever merged here', () => {
    expect(findMatches(card('Anna', 'Wendrau', { company: 'ACME' }), [stored('a', anna)]).verdict).toBe('same');
    const twin = stored('b', card('Anna', 'Wendrau', { company: 'ACME' }));
    const r = findMatches(card('Anna', 'Wendrau', { company: 'ACME' }), [stored('a', anna), twin]);
    expect(r.verdict).toBe('possible');
    expect(findMatches(card('Anna', 'Wendrau'), [stored('a', anna)]).verdict).toBe('possible');
    expect(findMatches(card('Zed', 'Q'), [stored('a', anna)])).toEqual({ verdict: 'none', best: null, ranked: [] });
  });
});

// ---- Property tests (A9), seeded ----
const GIVEN = ['Anna', 'Jürgen', 'Zoë', 'Søren', 'Łukasz', 'Đorđe', 'José', 'Mei', 'Ayşe', 'Nguyễn'];
const FAMILY = ['Wendrau', 'Müller', 'Ørsted', 'Æbelø', 'Straße', 'García', 'Öztürk', 'Kowalski', 'Lê'];
const COMPANY = ['ACME GmbH', 'Nordwind AG', 'Blue Fox Ltd.', 'Soluções S.A.', 'Kaya A.Ş.', '株式会社 山田'];
const PHONES = ['+49 30 1234567', '+49 171 7654321', '+44 20 7946 0958', '+1 415 555 0123', '+33 1 42 68 53 00'];

function randomCard(r: () => number): ContactCard {
  const phone = pick(r, PHONES);
  return card(pick(r, GIVEN), pick(r, FAMILY), {
    company: pick(r, COMPANY),
    phones: [{ value: phone, type: r() < 0.5 ? 'mobile' : 'work' }],
    emails: [{ value: `${pick(r, ['a', 'b', 'c'])}${Math.floor(r() * 1000)}@example.com`, type: 'work' }],
    urls: r() < 0.5 ? ['www.example.com'] : [],
  });
}

/** Same number, another print form: spaces moved, (0) inserted, 00 prefix. */
function phoneVariant(r: () => number, phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const cc = phone.split(' ')[0].slice(1);
  const rest = digits.slice(cc.length);
  const forms = [`00${cc} ${rest}`, `+${cc} (0)${rest}`, `+${cc}-${rest.slice(0, 3)}-${rest.slice(3)}`, `+${cc}${rest}`];
  return cc === '1' || cc === '44' || cc === '33' ? pick(r, [forms[0], forms[2], forms[3]]) : pick(r, forms);
}

describe('matcher and merge properties (A9, seed 20261016)', () => {
  const r = rng(20261016);
  const cards = Array.from({ length: 200 }, () => randomCard(r));

  it('normalisation is idempotent', () => {
    for (const c of cards) {
      const n = nameKey(c.name);
      expect(nameKey(n)).toBe(n);
      const k = companyKey(c.company);
      expect(companyKey(k)).toBe(k);
      const e = emailKey(c.emails[0].value);
      expect(emailKey(e)).toBe(e);
      const p = phoneKey(c.phones[0].value);
      expect(phoneKey(p)).toBe(p);
    }
  });

  it('a card always matches itself as "same"', () => {
    for (const c of cards.slice(0, 50)) expect(findMatches(c, [stored('self', c)]).verdict).toBe('same');
  });

  it('format variants of the same phone and case variants of the same e-mail match (same name on both cards)', () => {
    for (const c of cards) {
      const [g, f] = [c.name?.given ?? '', c.name?.family ?? ''];
      const v = card(g, f, { phones: [{ value: phoneVariant(r, c.phones[0].value), type: c.phones[0].type }] });
      expect(scorePair(v, c).score).toBeGreaterThanOrEqual(0.95);
      const e = card(g, f, { emails: [{ value: ` ${c.emails[0].value.toUpperCase()}`, type: 'work' }] });
      expect(scorePair(e, c).score).toBe(1);
    }
  });

  it('merge never removes a value and adding the same card twice adds nothing', () => {
    for (let i = 0; i + 1 < cards.length; i += 2) {
      const [a, b] = [cards[i], cards[i + 1]];
      const plan = planMerge(a, b);
      for (const choice of ['keep', 'incoming'] as const) {
        const merged = applyMerge(a, plan, { name: choice, company: choice, title: choice, department: choice });
        for (const k of ['phones', 'emails', 'urls', 'socials', 'addresses'] as const) {
          for (const x of a[k] as unknown[]) expect(merged[k]).toContainEqual(x);
        }
      }
      const again = planMerge(a, a);
      expect(again.conflicts).toEqual([]);
      expect([...again.additions.phones, ...again.additions.emails, ...again.additions.urls]).toEqual([]);
    }
  });
});

describe('merge plan (SPEC §5.5)', () => {
  it('unions lists by normalised value, fills empty scalars, asks about differing ones', () => {
    const existing = card('Anna', 'Wendrau', { company: 'ACME GmbH', phones: [{ value: '+49 30 1234567', type: 'work' }], emails: [{ value: 'anna@acme-de.example', type: 'work' }] });
    const incoming = card('Anna', 'Wendrau-Schulz', { company: 'Acme', title: 'CEO', phones: [{ value: '030 123 45 67', type: 'work' }, { value: '+49 171 1234567', type: 'mobile' }], emails: [{ value: 'ANNA@acme-de.example', type: 'work' }] });
    const plan = planMerge(existing, incoming, 'DE');
    expect(plan.additions.phones.map((p) => p.value)).toEqual(['+49 171 1234567']);
    expect(plan.additions.emails).toEqual([]);
    expect(plan.additions.fill).toEqual({ title: 'CEO' });
    expect(plan.conflicts.map((c) => c.field)).toEqual(['name']); // company "ACME GmbH" = "Acme" by key
    expect(applyMerge(existing, plan).name?.family).toBe('Wendrau');
    expect(applyMerge(existing, plan, { name: 'incoming' }).name?.family).toBe('Wendrau-Schulz');
  });
});

describe('conservative "same" (review S1): weak evidence stays "possible", the user decides', () => {
  const office = { value: '+49 761 292827', type: 'work' as const, e164: '+49761292827' };
  const anna = card('Anna', 'Wendrau', { company: 'Wendrau Holz GmbH', phones: [office], emails: [{ value: 'anna.wendrau@wendrau-holz-de.example', type: 'work' }] });

  it('a shared work line reaches "same" only when both cards carry the same name', () => {
    expect(scorePair(card('', '', { phones: [office] }), anna).score).toBe(0.8);
    expect(scorePair({ ...emptyContact(), company: 'Wendrau Holz GmbH', phones: [office] }, anna).score).toBe(0.8);
    expect(scorePair(card('Anna', 'Wendrau', { phones: [office] }), anna).score).toBe(0.95);
    expect(findMatches(card('', '', { phones: [office] }), [stored('a', anna)]).verdict).toBe('possible');
  });

  it('contradictions cap at 0.8: same name + company with different mobiles and personal e-mails', () => {
    const t1 = card('Thomas', 'Müller', { company: 'Velmedra AG', emails: [{ value: 'thomas.mueller@velmedra-com.example', type: 'work' }], phones: [{ value: '+49 171 1111111', type: 'mobile', e164: '+491711111111' }] });
    const t2 = card('Thomas', 'Müller', { company: 'Velmedra AG', emails: [{ value: 'thomas.mueller2@velmedra-com.example', type: 'work' }], phones: [{ value: '+49 171 2222222', type: 'mobile', e164: '+491712222222' }] });
    expect(scorePair(t1, t2).score).toBe(0.8);
    expect(findMatches(t1, [stored('t2', t2)]).verdict).toBe('possible');
  });

  it('extensions are part of the phone key; a new extension is added by the merge plan', () => {
    const a = card('', 'Roe', { phones: [{ value: '+1 212 555 0100 ext. 23', type: 'work', e164: '+12125550100' }] });
    const b = card('Jane', '', { phones: [{ value: '+1 212 555 0100 ext. 45', type: 'work', e164: '+12125550100' }] });
    expect(scorePair(a, b).score).toBe(0);
    expect(samePhoneKey('+12125550100;ext=23', '+12125550100;ext=45')).toBe(false);
    expect(planMerge(a, b).additions.phones.map((p) => p.value)).toEqual(['+1 212 555 0100 ext. 45']);
  });

  it('a shared mobile with a different given name is not "same"; role mailboxes never count', () => {
    const jan = card('Jan', 'Kowalski', { phones: [{ value: '+48 512 345 678', type: 'mobile', e164: '+48512345678' }] });
    const jana = card('Jana', 'Kowalski', { phones: [{ value: '+48 512 345 678', type: 'mobile', e164: '+48512345678' }] });
    expect(scorePair(jana, jan).score).toBe(0.8);
    for (const box of ['anfrage', 'kanzlei', 'praxis', 'buchhaltung', 'jobs', 'presse', 'noreply', 'notariat']) {
      expect(scorePair(card('', '', { emails: [{ value: `${box}@acme.de`, type: 'work' }] }), card('Anna', 'Wendrau', { emails: [{ value: `${box}@acme.de`, type: 'work' }] })).score).toBe(0.3);
    }
  });

  it('a shared e-mail that is not the person\'s own reaches "same" only with the same name', () => {
    const shared = { value: 'j.doe@acme-com.example', type: 'work' as const };
    expect(scorePair(card('', '', { emails: [shared] }), card('Mary', 'Smith', { emails: [shared] })).score).toBe(0.8);
    expect(scorePair(card('', '', { emails: [{ value: 'anna.wendrau@wendrau-holz-de.example', type: 'work' }] }), anna).score).toBe(1);
  });
});

describe('library merge keeps the incoming card\'s own notes (P8)', () => {
  const meta = (m: Partial<Parameters<typeof mergeMeta>[0]> = {}) => ({ eventId: null, metOn: null, metWhere: null, notes: null, tags: [], ...m });
  it('fills event/met data, appends differing notes, unions tags; never replaces the stored values', () => {
    expect(mergeMeta(meta({ eventId: 'e1', notes: 'Wants a demo', tags: ['Lead'] }), meta({ eventId: 'e2', metOn: '2026-10-15', metWhere: 'Stand B12', notes: 'Call after the fair', tags: ['lead', 'Robotics'] }))).toEqual({
      eventId: 'e1',
      metOn: '2026-10-15',
      metWhere: 'Stand B12',
      notes: 'Wants a demo\n\nCall after the fair',
      tags: ['Lead', 'Robotics'],
    });
    expect(mergeMeta(meta({ notes: 'Call after the fair!' }), meta({ notes: 'call after the fair' })).notes).toBe('Call after the fair!');
    expect(mergeMeta(meta(), meta({ notes: 'x' })).notes).toBe('x');
    expect(mergeMeta(meta({ metWhere: 'Hall 3' }), meta({ metWhere: 'Stand B12' })).metWhere).toBe('Hall 3');
  });
});

describe('margin rule in floating point (P8 finding on the simulator)', () => {
  it('same e-mail (1.0) vs a colleague line shared with another card (0.8): margin 0.2 → same, not possible', () => {
    const lena = (id: string, company: string, emails: string[], phones: string[]) => ({
      id,
      contact: { ...emptyContact(), name: { ...emptyName(), given: 'Lena', family: 'Brandt', full: 'Lena Brandt' }, company, emails: emails.map((value) => ({ value, type: 'other' as const })), phones: phones.map((value) => ({ value, type: 'other' as const })) },
    });
    const stored = [lena('old', 'ACME Test GmbH', ['lena.1@acme-test-de.example'], ['+49 30 9876543']), lena('new', 'Brandt olabpw GmbH', ['lena.2@acme-test-de.example'], [])];
    const card = lena('card', 'Brandt olabpw GmbH', ['lena.2@acme-test-de.example'], ['+49 30 9876543']).contact;
    const m = findMatches(card, stored, { region: 'DE' });
    expect(m.ranked.map((r) => r.score)).toEqual([1, 0.8]);
    expect(m.verdict).toBe('same');
    expect(m.best?.card.id).toBe('new');
  });
});
