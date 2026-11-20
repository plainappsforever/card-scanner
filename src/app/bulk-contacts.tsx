// Add many to Contacts (SPEC §7 screen 4, U4, D12, D47): our explanation FIRST, then the system permission prompt — the
// only place the app asks for Contacts. Duplicate check against the phone's contacts, a choice per card (New / Add to
// existing <name> / Skip) and an exact summary. "Add to existing" adds new values only and never overwrites: what it
// would add and what stays as it is in Contacts are shown before the user taps Add. Denied → one by one with the system
// form (no permission). iOS limited access → only shared contacts are compared, and the user can share more.
// Checked cards only (A11). The Card screen's "Add to existing contact" opens this screen for one card.
import { Contact } from 'expo-contacts';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { Radius, Spacing } from '@/constants/theme';
import { cardsForExport, setContactState, type Card } from '@/db/cards';
import { useSQLiteContext } from '@/db/provider';
import { joinName, type NameParts } from '@/engine/contact';
import { planContactPatch, type ContactPatchPlan } from '@/engine/contact-patch';
import { displayName } from '@/engine/format';
import { findMatches, type MatchVerdict } from '@/engine/match';
import type { MessageKey } from '@/i18n';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { addToExistingContact, contactDetails, contactsAccess, createContact, phoneContacts, requestContactsAccess, saveWithForm, type Access } from '@/lib/contacts';
import { noteLabels } from '@/lib/note-labels';
import { phoneRegion } from '@/lib/ocr-queue';

type Step = 'explain' | 'checking' | 'choose' | 'denied' | 'done';
type Choice = 'new' | 'existing' | 'skip';
type Existing = { id: string; name: string; verdict: MatchVerdict; plan: ContactPatchPlan | null };
type Row = { card: Card; choice: Choice; existing: Existing | null };
type Summary = { added: number; updated: number; skipped: number; failed: number };

const FIELD_KEY: Record<string, MessageKey> = { name: 'field.name', company: 'field.company', department: 'field.department', title: 'field.title' };
const scalar = (v: string | NameParts) => (typeof v === 'string' ? v : joinName(v));

/** "+49 171 5550123, anna@acme-de.example, Head of Sales" — the values that would be added, as the user will see them. */
function additionsText(plan: ContactPatchPlan): string {
  const a = plan.additions;
  const address = (x: (typeof a.addresses)[number]) => [x.street, [x.postcode, x.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || x.raw;
  return [
    ...(a.fill.name ? [joinName(a.fill.name)] : []),
    ...[a.fill.company, a.fill.department, a.fill.title].filter((v): v is string => !!v),
    ...a.phones.map((p) => p.value),
    ...a.emails.map((e) => e.value),
    ...a.urls,
    ...a.addresses.map(address),
    ...a.socials.map((s) => s.value),
  ].join(', ');
}

export default function BulkContactsScreen() {
  const params = useLocalSearchParams<{ ids?: string }>();
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const [cards, setCards] = useState<Card[]>([]);
  const [skippedDrafts, setSkippedDrafts] = useState(0);
  const [step, setStep] = useState<Step>('explain');
  const [access, setAccess] = useState<Access>('undetermined');
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [formNotes, setFormNotes] = useState<Record<string, string>>({});
  const idKey = params.ids ?? '';

  useEffect(() => {
    (async () => {
      const r = await cardsForExport(db, idKey ? { cardIds: idKey.split(',') } : {});
      setCards(r.cards);
      setSkippedDrafts(r.skippedDrafts);
      const a = await contactsAccess().catch(() => 'undetermined' as const);
      setAccess(a);
      if (a === 'granted' || a === 'limited') check(r.cards);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, idKey]);

  async function check(list: Card[]) {
    setStep('checking');
    const phone = await phoneContacts().catch(() => []);
    const region = await phoneRegion(db);
    const next: Row[] = [];
    for (const card of list) {
      const m = findMatches(card.contact, phone, { region });
      if (m.verdict === 'none' || !m.best) {
        next.push({ card, choice: 'new', existing: null });
        continue;
      }
      const id = m.best.card.id;
      const plan = await contactDetails(id)
        .then((c) => planContactPatch(c, card.contact, region))
        .catch((e: unknown) => {
          console.warn('contact details unreadable', e instanceof Error ? e.message : String(e));
          return null; // shown as "could not read", never as "nothing new"
        });
      const name = displayName(m.best.card.contact.name) || m.best.card.contact.company || '?';
      // The same person with something new → "Add to existing" is preselected (it only adds, D47); a possible match or
      // nothing new → Skip. The user sees the choice and what it adds before tapping Add.
      const choice: Choice = m.verdict === 'same' && plan && plan.count > 0 ? 'existing' : 'skip';
      next.push({ card, choice, existing: { id, name, verdict: m.verdict, plan } });
    }
    setRows(next);
    setStep('choose');
  }

  async function ask() {
    const a = await requestContactsAccess();
    setAccess(a);
    if (a === 'granted' || a === 'limited') check(cards);
    else setStep('denied');
  }

  async function shareMore() {
    await Contact.presentAccessPicker().catch(() => []);
    setAccess(await contactsAccess().catch(() => access));
    check(cards);
  }

  async function add() {
    const s: Summary = { added: 0, updated: 0, skipped: 0, failed: 0 };
    const region = await phoneRegion(db);
    const next: Row[] = [];
    for (const r of rows) {
      if (r.choice === 'skip') {
        s.skipped++;
        continue;
      }
      try {
        if (r.choice === 'existing' && r.existing) {
          await addToExistingContact(r.existing.id, r.card.contact, noteLabels(t), region);
          await setContactState(db, r.card.id, 'updated', r.existing.id);
          s.updated++;
        } else {
          const id = await createContact(r.card.contact, noteLabels(t));
          await setContactState(db, r.card.id, 'created', id);
          s.added++;
        }
      } catch {
        s.failed++;
        next.push(r); // failed ones stay selectable for a retry
      }
    }
    setRows(next);
    setSummary(s);
    setStep('done');
  }

  const name = (c: Card) => displayName(c.contact.name) || c.contact.company || c.contact.emails[0]?.value || '?';
  const choose = (i: number, choice: Choice) => setRows(rows.map((x, k) => (k === i ? { ...x, choice } : x)));
  const toAdd = rows.filter((r) => r.choice !== 'skip').length;

  return (
    <ScrollView testID="bulk-contacts-screen" style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <ThemedText testID="bulk-count" type="smallBold">
        {t('export.count', { n: cards.length })}
      </ThemedText>
      {skippedDrafts ? <ThemedText themeColor="textSecondary">{t('bulk.leftOut', { n: skippedDrafts })}</ThemedText> : null}
      {step === 'explain' ? (
        <View testID="contacts-explain" style={styles.block}>
          <ThemedText>{t('bulk.explain', { app: APP_NAME })}</ThemedText>
          <Button testID="contacts-continue" label={t('bulk.continue')} disabled={cards.length === 0} onPress={ask} />
          <Button testID="contacts-one-by-one" label={t('bulk.oneByOne')} variant="secondary" onPress={() => setStep('denied')} />
        </View>
      ) : null}
      {step === 'checking' ? (
        <View style={styles.row}>
          <ActivityIndicator />
          <ThemedText>{t('bulk.checking')}</ThemedText>
        </View>
      ) : null}
      {step === 'denied' ? (
        <View style={styles.block} testID="bulk-denied">
          {access === 'denied' ? <ThemedText>{t('bulk.denied')}</ThemedText> : null}
          {access === 'denied' ? (
            <Pressable onPress={() => Linking.openSettings()}>
              <ThemedText themeColor="tintText">{t('bulk.openSettings')}</ThemedText>
            </Pressable>
          ) : null}
          {cards.map((c) => (
            <View key={c.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <ThemedText>{name(c)}</ThemedText>
                {formNotes[c.id] ? (
                  <ThemedText testID={`form-note-${c.id}`} type="small" themeColor="textSecondary">
                    {formNotes[c.id]}
                  </ThemedText>
                ) : null}
              </View>
              <Pressable
                testID={`form-${c.id}`}
                onPress={async () => {
                  const r = await saveWithForm(c.contact, noteLabels(t), await phoneRegion(db));
                  if (r.result === 'none') return;
                  await setContactState(db, c.id, 'form_saved', r.contactId);
                  setFormNotes((n) => ({ ...n, [c.id]: r.result === 'saved' ? t('review.formSaved') : t('contacts.found') }));
                }}>
                <ThemedText themeColor="tintText">{t('review.addToContacts')}</ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {step === 'choose' ? (
        <View style={styles.block}>
          {access === 'limited' ? (
            <View style={styles.block} testID="bulk-limited">
              <ThemedText themeColor="textSecondary">{t('bulk.limited', { app: APP_NAME })}</ThemedText>
              {Platform.OS === 'ios' ? (
                <Pressable testID="bulk-share-more" onPress={shareMore}>
                  <ThemedText themeColor="tintText">{t('bulk.shareMore')}</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {rows.map((r, i) => {
            const plan = r.existing?.plan ?? null;
            const canAddTo = !!r.existing && !!plan && plan.count > 0;
            const options: { choice: Choice; label: string }[] = [
              { choice: 'new', label: t('bulk.new') },
              ...(canAddTo && r.existing ? [{ choice: 'existing' as const, label: t('bulk.addTo', { name: r.existing.name }) }] : []),
              { choice: 'skip', label: t('bulk.skip') },
            ];
            return (
              <View key={r.card.id} testID={`bulk-row-${r.card.id}`} style={styles.card}>
                <ThemedText type="smallBold">{name(r.card)}</ThemedText>
                {r.existing ? (
                  <ThemedText testID={`bulk-existing-${r.card.id}`} type="small" themeColor="textSecondary">
                    {!plan
                      ? t('bulk.unreadable', { name: r.existing.name })
                      : canAddTo
                        ? `${t(r.existing.verdict === 'same' ? 'bulk.existing' : 'bulk.possibly', { name: r.existing.name })} ${t('bulk.adds', { list: additionsText(plan) })}`
                        : t('bulk.nothingNew', { name: r.existing.name })}
                  </ThemedText>
                ) : null}
                {r.choice === 'existing' && plan
                  ? plan.conflicts.map((c) => (
                      <ThemedText key={c.field} testID={`bulk-kept-${r.card.id}-${c.field}`} type="small" themeColor="textSecondary">
                        {t('bulk.kept', { field: t(FIELD_KEY[c.field]), value: scalar(c.existing), card: scalar(c.incoming) })}
                      </ThemedText>
                    ))
                  : null}
                <View testID={`bulk-choice-${r.card.id}`} style={styles.chips}>
                  {options.map((o) => (
                    <Pressable
                      key={o.choice}
                      testID={`bulk-${o.choice}-${r.card.id}`}
                      accessibilityState={{ selected: r.choice === o.choice }}
                      onPress={() => choose(i, o.choice)}
                      style={[styles.chip, { backgroundColor: r.choice === o.choice ? theme.tint : theme.backgroundElement }]}>
                      <ThemedText type="small" numberOfLines={1} style={{ color: r.choice === o.choice ? theme.onTint : theme.text }}>
                        {o.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
          <Button testID="bulk-add-button" label={t('bulk.add', { n: toAdd })} disabled={toAdd === 0} onPress={add} />
        </View>
      ) : null}
      {step === 'done' && summary ? (
        <View style={styles.block}>
          <ThemedText testID="bulk-summary" type="smallBold">
            {t('bulk.summary', summary)}
          </ThemedText>
          {summary.failed ? <Button testID="bulk-retry" label={t('bulk.retry')} onPress={() => setStep('choose')} /> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  block: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  chip: { borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%' },
});
