// Device self-test (development variant only; SPEC §6.1): card-kit on THIS simulator/emulator — text recognition and
// barcodes on O3 seed images → extractor → compared with the blind truth; plus the Contacts spikes S1–S4 (SPEC §6.2):
// the system "new contact" form WITHOUT the Contacts permission, the permission state, and a contact count (asks the
// permission — tap only AFTER the form test). Each check prints PASS/FAIL lines Maestro can assert. P8: the follow-up
// notifications the system holds for the app (title | body | due time), so a flow can watch the reconciler (D48).
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { Contact } from 'expo-contacts';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Platform, ScrollView } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { SEED_IMAGES } from '@/dev/seed-assets';
import { emptyContact } from '@/engine/contact';
import { extract } from '@/engine/extract/index';
import { normalizeOcr } from '@/engine/ocr';
import { getLanguage } from '@/i18n';
import CardKit from '../../../modules/card-kit';
import { contactsAccess, presentNewContactForm, requestContactsAccess } from '@/lib/contacts';
import { ocrLanguages, planOcr } from '@/lib/ocr-langs';

const CASES: { image: string; langs: string; email: string; phones: string[]; qr?: string }[] = [
  { image: 'b1-de-01', langs: 'de', email: 'info@mueller-elektro-hn-de.example', phones: ['+497131567890', '+497131567891', '+491714567890'] },
  { image: 'b1-us-01', langs: 'en', email: 'marcus.delacroix@brightline-analytics-com.example', phones: ['+12125550147', '+19175550193', '+12125550148'] },
  { image: 'b1-de-11', langs: 'de', email: 'lennart@vogelsang-consulting-de.example', phones: ['+4915734567890'], qr: 'BEGIN:VCARD' },
  { image: 'b1-jp-01-front', langs: 'ja', email: 't.yamada@sakuratech-co-jp.example', phones: ['+81312345678', '+81312345679', '+819012345678'] },
];

async function localCopy(name: string): Promise<string> {
  const asset = Asset.fromModule(SEED_IMAGES[name]);
  await asset.downloadAsync();
  const copy = new File(Paths.cache, `selftest-${name}-${Date.now()}.jpg`);
  new File(asset.localUri as string).copySync(copy);
  return copy.uri;
}

export default function SelfTestScreen() {
  const [lines, setLines] = useState<string[]>([]);
  const say = (s: string) => setLines((l) => [...l, s]);
  if (Constants.expoConfig?.extra?.appVariant !== 'development') return null;

  async function ocr() {
    const native = await CardKit.ocrLanguages();
    say(`ocrLanguages: ${native.join(',')}`);
    for (const c of CASES) {
      try {
        const uri = await localCopy(c.image);
        const plan = planOcr(ocrLanguages(c.langs === 'en' ? 'en' : `${c.langs},en`, getLanguage()), Platform.OS === 'ios' ? 'ios' : 'android', native);
        if (!plan.codes.length) {
          say(`${c.image}: UNSUPPORTED ${plan.unsupported.join(',')}`);
          continue;
        }
        const t0 = Date.now();
        const raw = await CardKit.recognize(uri, { langs: plan.codes, rotation: 0 }).catch((e: unknown) => {
          throw new Error(`recognize: ${e instanceof Error ? e.message : String(e)}`);
        });
        const ms = Date.now() - t0;
        let codes: Awaited<ReturnType<typeof CardKit.detectBarcodes>> = [];
        try {
          codes = await CardKit.detectBarcodes(uri);
        } catch (e) {
          say(`${c.image}: FAIL detectBarcodes ${e instanceof Error ? e.message : String(e)}`);
        }
        const o = normalizeOcr(raw, 'f');
        const x = extract({ front: o.lines, qr: codes.map((k) => ({ format: k.format, text: k.text })), region: 'DE', uiLang: 'en' });
        const email = x.emails.some((e) => e.value.value === c.email);
        const phones = c.phones.every((p) => x.phones.some((q) => q.value.e164 === p));
        const qr = c.qr ? codes.some((k) => k.text.startsWith(c.qr as string)) : true;
        say(`${c.image}: ${email && phones && qr ? 'PASS' : 'FAIL'} lines=${o.lines.length} ${ms}ms email=${email} phones=${phones} qr=${c.qr ? qr : '-'} langs=${plan.codes.join(',')}`);
        if (!phones) say(`${c.image}: phones read ${x.phones.map((q) => `${q.value.e164 ?? q.value.raw}:${q.confidence}`).join(' ')} | lines ${o.lines.map((l) => l.text).join(' / ')}`);
      } catch (e) {
        say(`${c.image}: FAIL ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    say('ocr-done');
  }

  async function form() {
    say(`S1 access before: ${await contactsAccess()}`);
    const c = emptyContact();
    c.name = { prefix: '', given: 'Spike', middle: '', family: `Form ${Date.now() % 100000}`, suffix: '', full: 'Spike Form' };
    c.company = 'Card Scanner Spike';
    c.phones = [{ value: '+49 30 1234567', type: 'work' }];
    c.emails = [{ value: 'spike@example.com', type: 'work' }];
    try {
      const saved = await presentNewContactForm(c, { otherName: 'Other name', event: 'Event', metOn: 'Met on', metWhere: 'Where met' });
      say(`S1 form returned: ${saved}`);
    } catch (e) {
      say(`S1 form FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
    say(`S1 access after: ${await contactsAccess()}`);
    say('form-done');
  }

  async function count() {
    const a = await requestContactsAccess();
    say(`permission: ${a}`);
    if (a === 'granted' || a === 'limited') {
      const all = await Contact.getAllDetails(['givenName', 'familyName', 'company'] as never);
      const spikes = (all as { givenName?: string; company?: string }[]).filter((x) => x.company === 'Card Scanner Spike' || x.givenName === 'Spike');
      say(`contacts: ${all.length}, spike contacts: ${spikes.length}`);
    }
    say('count-done');
  }

  async function reminders() {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const ours = all.filter((r) => r.content.data?.kind === 'follow-up');
    say(`reminders: ${ours.length}`);
    for (const r of ours) say(`reminder: ${r.content.title} | ${r.content.body || '-'} | ${new Date(Number(r.content.data?.at)).toISOString()}`);
    say('reminders-done');
  }

  return (
    <ScrollView testID="self-test-screen" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Button testID="selftest-ocr" label="OCR + barcodes" onPress={ocr} />
      <Button testID="selftest-form" label="S1/S4: new-contact form (no permission)" onPress={form} />
      <Button testID="selftest-count" label="Count contacts (asks permission)" variant="secondary" onPress={count} />
      <Button testID="selftest-reminders" label="Scheduled follow-up reminders" variant="secondary" onPress={reminders} />
      {lines.map((l, i) => (
        <ThemedText key={i} testID={/-done$/.test(l) ? l : undefined} type="small">
          {l}
        </ThemedText>
      ))}
    </ScrollView>
  );
}
