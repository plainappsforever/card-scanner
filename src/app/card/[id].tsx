// Card (SPEC §7 screen 3): a checked card — image, fields with actions (call, SMS, mail, website, map), Edit (→ Review),
// Add to Contacts (system form, no permission), Add to existing contact (permission path, new values only — the bulk
// screen for this one card, D47), Share (vCard), follow-up, delete (undo on the Cards list).
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { deleteCards, getCard, setContactState, type Card } from '@/db/cards';
import { useSQLiteContext } from '@/db/provider';
import { displayName } from '@/engine/format';
import { socialUrl } from '@/engine/social';
import { useLanguage, useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { uriOf } from '@/lib/app-files';
import { noteDeleted } from '@/lib/last-deleted';
import { saveWithForm } from '@/lib/contacts';
import { exportContent, shareFiles, writeExport } from '@/lib/export';
import { noteLabels } from '@/lib/note-labels';
import { phoneRegion } from '@/lib/ocr-queue';

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const lang = useLanguage();
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [side, setSide] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getCard(db, id).then((c) => (c && !c.deletedAt ? setCard(c) : router.back()));
    }, [db, id, router])
  );
  if (!card) return null;
  const c = card.contact;
  const shown = card.sides[side] ?? card.sides[0];
  const open = (url: string) => Linking.openURL(url).catch(() => undefined);
  const name = displayName(c.name);

  const rows: { key: string; label: string; value: string; actions: { id: string; label: string; url: string }[] }[] = [];
  c.phones.forEach((p, n) =>
    rows.push({
      key: `phone-${n}`,
      label: t(`phone.${p.type}`),
      value: p.value,
      actions: p.type === 'fax' ? [] : [
        { id: `call-${n}`, label: t('card.call'), url: `tel:${(p.e164 ?? p.value).replace(/[^\d+]/g, '')}` },
        ...(p.type === 'mobile' ? [{ id: `sms-${n}`, label: t('card.sms'), url: `sms:${(p.e164 ?? p.value).replace(/[^\d+]/g, '')}` }] : []),
      ],
    })
  );
  c.emails.forEach((e, n) => rows.push({ key: `email-${n}`, label: t('field.email'), value: e.value, actions: [{ id: `mail-${n}`, label: t('card.mail'), url: `mailto:${e.value}` }] }));
  c.urls.forEach((u, n) => rows.push({ key: `url-${n}`, label: t('field.url'), value: u, actions: [{ id: `open-${n}`, label: t('card.open'), url: /^https?:/i.test(u) ? u : `https://${u}` }] }));
  c.socials.forEach((s, n) => {
    const url = socialUrl(s);
    rows.push({ key: `social-${n}`, label: s.service, value: s.value, actions: url ? [{ id: `social-open-${n}`, label: t('card.open'), url }] : [] });
  });
  c.addresses.forEach((a, n) => {
    const text = [a.street, [a.postcode, a.city].filter(Boolean).join(' '), a.region, a.country].filter(Boolean).join(', ') || a.raw;
    rows.push({ key: `address-${n}`, label: t('field.address'), value: text, actions: [{ id: `map-${n}`, label: t('card.map'), url: `${Platform.OS === 'ios' ? 'maps://?q=' : 'geo:0,0?q='}${encodeURIComponent(text)}` }] });
  });

  async function addToContacts() {
    if (!card || card.status !== 'checked') return;
    const r = await saveWithForm(card.contact, noteLabels(t), await phoneRegion(db));
    if (r.result === 'none') return;
    await setContactState(db, card.id, 'form_saved', r.contactId);
    setNote(r.result === 'saved' ? t('review.formSaved') : t('contacts.found'));
    setCard((await getCard(db, card.id)) ?? card);
  }

  async function share() {
    if (!card) return;
    const file = writeExport(name || c.company || 'card', 'vcf', exportContent([card], 'vcf', true, noteLabels(t)));
    await shareFiles([file], t('card.share'));
  }

  return (
    <ScrollView testID="card-screen" style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: name || c.company || t('card.title'),
          headerRight: () => (
            <Pressable testID="edit-button" hitSlop={8} onPress={() => router.push({ pathname: '/review/[id]', params: { id: card.id } })}>
              <ThemedText themeColor="tintText">{t('card.edit')}</ThemedText>
            </Pressable>
          ),
        }}
      />
      {shown ? (
        <Pressable style={[styles.face, { backgroundColor: theme.cardFace }]} onPress={() => card.sides.length > 1 && setSide((side + 1) % card.sides.length)}>
          <Image testID="card-image" source={{ uri: uriOf(shown.imageFile) }} style={[styles.image, { aspectRatio: shown.rotation % 180 === 0 ? shown.w / shown.h : shown.h / shown.w }]} contentFit="contain" />
        </Pressable>
      ) : null}
      <View>
        <ThemedText type="smallBold" style={styles.name}>
          {name}
        </ThemedText>
        {[c.title, c.department, c.company, c.otherName].filter(Boolean).map((v) => (
          <ThemedText key={v} themeColor="textSecondary">
            {v}
          </ThemedText>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.key} style={[styles.row, { borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="small" themeColor="textSecondary">
              {r.label}
            </ThemedText>
            <ThemedText selectable>{r.value}</ThemedText>
          </View>
          {r.actions.map((a) => (
            <Pressable key={a.id} testID={a.id} onPress={() => open(a.url)} hitSlop={6}>
              <ThemedText themeColor="tintText">{a.label}</ThemedText>
            </Pressable>
          ))}
        </View>
      ))}
      {card.eventName || card.metWhere || card.metOn || card.notes || card.tags.length || card.followUpAt ? (
        <View style={{ gap: Spacing.one }}>
          {card.eventName ? <ThemedText type="small">{`${t('card.event')}: ${card.eventName}`}</ThemedText> : null}
          {card.metOn ? <ThemedText type="small">{`${t('card.metOn')}: ${card.metOn}`}</ThemedText> : null}
          {card.metWhere ? <ThemedText type="small">{`${t('card.metWhere')}: ${card.metWhere}`}</ThemedText> : null}
          {card.tags.length ? <ThemedText type="small">{`${t('card.tags')}: ${card.tags.join(', ')}`}</ThemedText> : null}
          {card.followUpAt ? <ThemedText type="small">{t('review.followUp.at', { date: new Date(card.followUpAt).toLocaleString(lang) })}</ThemedText> : null}
          {card.notes ? <ThemedText type="small">{card.notes}</ThemedText> : null}
        </View>
      ) : null}
      {note ? <ThemedText testID="card-note" themeColor="textSecondary">{note}</ThemedText> : null}
      {card.contactState !== 'none' ? (
        <ThemedText testID="card-in-contacts" type="small" themeColor="textSecondary">
          {t('status.inContacts')}
          {card.contactSavedAt !== null && card.updatedAt > card.contactSavedAt + 1000 ? ` · ${t('card.changedSinceContacts')}` : ''}
        </ThemedText>
      ) : null}
      <Button testID="add-to-contacts-button" label={t('review.addToContacts')} onPress={addToContacts} />
      {card.status === 'checked' ? (
        <Button testID="add-to-existing-button" label={t('card.addToExisting')} variant="secondary" onPress={() => router.push({ pathname: '/bulk-contacts', params: { ids: card.id } })} />
      ) : null}
      <Button testID="share-button" label={t('card.share')} variant="secondary" onPress={share} />
      <Button
        testID="delete-button"
        label={t('card.delete')}
        variant="secondary"
        onPress={() =>
          // one tap must not lose a card (REVIEW_V1 M3): confirm, then the Cards list shows the undo snack
          Alert.alert(t('card.delete'), name || c.company || '', [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('card.delete'),
              style: 'destructive',
              onPress: async () => {
                await deleteCards(db, [card.id]);
                noteDeleted([card.id]);
                router.back();
              },
            },
          ])
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  // the photo sits on a cream card face with a soft shadow (sheet 7)
  face: { padding: Spacing.two, borderRadius: Radius.card, boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.12)' },
  image: { width: '100%', borderRadius: Radius.card },
  name: { fontSize: 22, lineHeight: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
});
