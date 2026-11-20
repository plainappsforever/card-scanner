// My card (SPEC §7 screen 6, U8): the user's own details once → a full-width QR code (vCard 3.0, ≤ 1,200 bytes; what
// had to be left out is said) + "Share as vCard". Never in lists, exports or matching.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { QrCode } from '@/components/qr';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { getMyCard, saveMyCard } from '@/db/cards';
import { fieldsFromContact } from '@/db/fields';
import { useSQLiteContext } from '@/db/provider';
import { emptyContact, emptyName, type ContactCard } from '@/engine/contact';
import { myCardPayload } from '@/engine/vcard/payload';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { shareFiles, writeExport } from '@/lib/export';

type Form = { given: string; family: string; company: string; title: string; phone: string; email: string; url: string };
const EMPTY: Form = { given: '', family: '', company: '', title: '', phone: '', email: '', url: '' };

function toContact(f: Form): ContactCard {
  const c = emptyContact();
  c.name = { ...emptyName(), given: f.given.trim(), family: f.family.trim(), full: [f.given.trim(), f.family.trim()].filter(Boolean).join(' ') };
  if (f.company.trim()) c.company = f.company.trim();
  if (f.title.trim()) c.title = f.title.trim();
  if (f.phone.trim()) c.phones = [{ value: f.phone.trim(), type: 'mobile' }];
  if (f.email.trim()) c.emails = [{ value: f.email.trim(), type: 'work' }];
  if (f.url.trim()) c.urls = [f.url.trim()];
  return c;
}

export default function MyCardScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const [form, setForm] = useState<Form>(EMPTY);
  const [contact, setContact] = useState<ContactCard | null>(null);
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getMyCard(db).then((card) => {
        if (!card) {
          setEditing(true);
          return;
        }
        const c = card.contact;
        setContact(c);
        setForm({ given: c.name?.given ?? '', family: c.name?.family ?? '', company: c.company ?? '', title: c.title ?? '', phone: c.phones[0]?.value ?? '', email: c.emails[0]?.value ?? '', url: c.urls[0] ?? '' });
      });
    }, [db])
  );

  async function save() {
    const c = toContact(form);
    await saveMyCard(db, fieldsFromContact(c, 'user'));
    setContact(c);
    setEditing(false);
  }

  const payload = contact ? myCardPayload(contact) : null;
  const fields: [keyof Form, string, 'default' | 'phone-pad' | 'email-address' | 'url'][] = [
    ['given', t('field.given'), 'default'],
    ['family', t('field.family'), 'default'],
    ['company', t('field.company'), 'default'],
    ['title', t('field.title'), 'default'],
    ['phone', t('field.phone'), 'phone-pad'],
    ['email', t('field.email'), 'email-address'],
    ['url', t('field.url'), 'url'],
  ];

  return (
    <ScrollView testID="my-card-screen" style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {editing || !payload ? (
        <>
          <ThemedText themeColor="textSecondary">{t('myCard.empty')}</ThemedText>
          {fields.map(([k, label, kb]) => (
            <TextInput
              key={k}
              testID={`my-card-${k}`}
              placeholder={label}
              placeholderTextColor={theme.textSecondary}
              keyboardType={kb}
              autoCapitalize={kb === 'default' ? 'words' : 'none'}
              value={form[k]}
              onChangeText={(v) => setForm({ ...form, [k]: v })}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          ))}
          <Button testID="my-card-save" label={t('myCard.save')} disabled={!Object.values(form).some((v) => v.trim())} onPress={save} />
        </>
      ) : (
        <>
          <View style={[styles.qr, { backgroundColor: theme.cardFace }]}>
            <QrCode testID="my-card-qr" text={payload.text} size={Math.min(width - 2 * Spacing.three, 420)} />
          </View>
          {payload.omitted.length ? (
            <ThemedText testID="my-card-left-out" themeColor="textSecondary">
              {t('myCard.leftOut', { items: payload.omitted.map((o) => t(`myCard.${o}`)).join(', ') })}
            </ThemedText>
          ) : null}
          {!payload.fits ? <ThemedText themeColor="danger">{t('myCard.tooBig')}</ThemedText> : null}
          <Button
            testID="my-card-share"
            label={t('myCard.share')}
            onPress={async () => {
              const file = writeExport(contact?.name?.full || t('myCard.title'), 'vcf', payload.text);
              await shareFiles([file], t('myCard.share'));
            }}
          />
          <Button testID="my-card-edit" label={t('myCard.edit')} variant="secondary" onPress={() => setEditing(true)} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  input: { borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  // QR on a cream card face; the code keeps its own white tile inside (scanners need light on dark modules)
  qr: { alignItems: 'center', padding: Spacing.two, borderRadius: Radius.card, boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.12)' },
});
