#!/usr/bin/env node
// Referees for the export writers (SPEC §13 O1/O2, acceptance A7/A8), device-free on this Mac:
//  - vCard: our writer's output for the fixture contacts (test/fixtures/vcard/contacts.ts) in 3.0 and 4.0 is parsed by
//    macOS's Contacts framework (referee/swift/vcard-referee.swift); every field must come back as we meant it.
//  - CSV: Python's csv module parses our export of the same contacts + hostile cells (referee/python/csv_check.py).
// Output files go to artifacts/referee/ (git-ignored). Exit status 1 on any difference.
// Usage: node --import ./scripts/node/ts-hooks.mjs scripts/referee.mjs   (npm run referee)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { VCARD_CONTACTS } from '../test/fixtures/vcard/contacts.ts';
import { emptyContact } from '../src/engine/contact.ts';
import { CSV_COLUMNS, csvValues, guardCell, writeCsv } from '../src/engine/csv.ts';
import { socialUrl } from '../src/engine/social.ts';
import { composeNote, formattedName, writeVCard } from '../src/engine/vcard/writer.ts';

const root = join(import.meta.dirname, '..');
const out = join(root, 'artifacts', 'referee');
mkdirSync(out, { recursive: true });

const PHONE_LABEL = { mobile: '_$!<Mobile>!$_', work: '_$!<Work>!$_', fax: '_$!<WorkFAX>!$_', home: '_$!<Home>!$_', other: '_$!<Other>!$_' };
const EMAIL_LABEL = { work: '_$!<Work>!$_', home: '_$!<Home>!$_', other: '' };

/** What Apple's parser should report for one of our contacts. */
function expectedApple(c) {
  const n = c.name ?? {};
  const noNameNoOrg = !n.given && !n.family && !n.middle && !c.company;
  const urls = [...c.urls];
  const socials = c.socials.map((s) => {
    const url = socialUrl(s);
    if (url) urls.push(url);
    return url ? { service: s.service, url, username: '' } : { service: s.service, url: '', username: s.value };
  });
  return {
    namePrefix: n.prefix ?? '',
    // Apple derives the first name from FN when N and ORG are empty (D29): the e-mail/phone then shows as the name.
    givenName: noNameNoOrg ? formattedName(c) : (n.given ?? ''),
    middleName: n.middle ?? '',
    familyName: n.family ?? '',
    nameSuffix: n.suffix ?? '',
    organizationName: c.company ?? '',
    departmentName: c.department ?? '',
    jobTitle: c.title ?? '',
    phones: c.phones.map((p) => ({ label: PHONE_LABEL[p.type], value: p.value })),
    emails: c.emails.map((e) => ({ label: EMAIL_LABEL[e.type], value: e.value })),
    urls,
    addresses: c.addresses.map((a) => ({ street: a.street, city: a.city, state: a.region, postalCode: a.postcode, country: a.country })),
    socials,
    note: composeNote(c),
  };
}

function appleComparable(a) {
  return {
    ...a,
    phones: a.phones,
    emails: a.emails,
    urls: a.urls.map((u) => u.value),
    addresses: a.addresses.map(({ street, city, state, postalCode, country }) => ({ street, city, state, postalCode, country })),
    socials: a.socials.map(({ service, url, username }) => ({ service, url, username })),
    note: a.note ?? '',
  };
}

let diffs = 0;
function compare(what, got, want, quiet) {
  let n = 0;
  for (const key of Object.keys(want)) {
    const g = JSON.stringify(got[key]);
    const w = JSON.stringify(want[key]);
    if (g !== w) {
      n++;
      if (!quiet) console.log(`VCARD DIFF ${what} ${key}: Apple read ${g} — we wrote ${w}`);
    }
  }
  return n;
}

// 3.0 is what the app exports (D19) and the A7 gate. 4.0 is written only on request; macOS Contacts does not read
// vCard 4.0 (no UTF-8, TYPE lists and tel: URIs lost — measured 2026-10-16, D29), so its count is information only.
for (const version of ['3.0', '4.0']) {
  const gate = version === '3.0';
  const file = join(out, `contacts-${version}.vcf`);
  writeFileSync(file, writeVCard(VCARD_CONTACTS, { version }));
  const json = execFileSync('swift', [join(root, 'referee/swift/vcard-referee.swift'), file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const parsed = JSON.parse(json);
  let n = parsed.length === VCARD_CONTACTS.length ? 0 : 1;
  if (n) console.log(`VCARD DIFF ${version}: Apple read ${parsed.length} contacts, we wrote ${VCARD_CONTACTS.length}`);
  VCARD_CONTACTS.forEach((c, i) => (n += compare(`v${version} #${i} (${formattedName(c)})`, appleComparable(parsed[i] ?? {}), expectedApple(c), !gate)));
  if (gate) diffs += n;
  console.log(`vcard-referee ${version}: ${parsed.length} contacts parsed by macOS Contacts, ${n} field difference(s)${gate ? '' : ' (information only: macOS does not read vCard 4.0, D29)'}`);
}

// CSV: fixture contacts + hostile cells
const hostile = [
  { ...emptyContact(), company: '=HYPERLINK("http://evil.example","x")', notes: '@SUM(A1:A9)', title: '-2+3', department: '+cmd|calc', phones: [{ value: '+49 30 1234567', type: 'work' }, { value: '=1+1', type: 'mobile' }], tags: ['\tTAB'] },
  { ...emptyContact(), notes: 'multi\nline, with "quotes"; and semicolons', urls: ['https://example.com/?a=1,b=2'] },
];
const rows = [...VCARD_CONTACTS, ...hostile].map((c, i) => ({ contact: c, addedOn: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` }));
const csvFile = join(out, 'contacts.csv');
writeFileSync(csvFile, writeCsv(rows));
const expected = { header: [...CSV_COLUMNS], rows: rows.map((r) => { const v = csvValues(r); return CSV_COLUMNS.map((c) => guardCell(c, v[c])); }), phoneColumns: ['Mobile phone', 'Work phone', 'Fax', 'Home phone', 'Other phones'] };
writeFileSync(join(out, 'contacts.expected.json'), JSON.stringify(expected));
try {
  process.stdout.write(execFileSync('python3', [join(root, 'referee/python/csv_check.py'), csvFile, join(out, 'contacts.expected.json')], { encoding: 'utf8' }));
} catch (e) {
  process.stdout.write(e.stdout ?? '');
  diffs++;
}

console.log(diffs === 0 ? 'referee: 0 differences' : `referee: ${diffs} difference(s)`);
process.exit(diffs === 0 ? 0 : 1);
