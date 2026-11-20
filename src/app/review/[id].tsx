// Review (SPEC §7 screen 2, L26): the card image on top, every field editable with a "Check" mark where the extractor
// was not sure, "Text on the card" (nothing read is hidden), event / met on / where met / tags / notes / follow-up,
// the duplicate banner (Merge / Keep both). NOTHING is saved as checked, sent to Contacts or exported until "Looks
// right". In a batch: "Save & next (i of n)" and "Later" (stays To check).
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceSheet, type Choice } from '@/components/sheets';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { confirmCard, deleteCards, draftIds, getCard, matchPool, replaceFields, setContactState, setFollowUp, updateCardMeta, type Card, type SideName } from '@/db/cards';
import { listEvents, type CardEvent } from '@/db/events';
import { contactFromFields, fieldsFromContact, parseAddress, parseName, type FieldInput, type FieldKind } from '@/db/fields';
import { useSQLiteContext } from '@/db/provider';
import { setCardTags } from '@/db/tags';
import { joinName, PHONE_TYPES, type NameParts, type Address } from '@/engine/contact';
import { extract } from '@/engine/extract/index';
import type { Extracted } from '@/engine/extract/types';
import { findMatches, matchLabel, type MatchResult } from '@/engine/match';
import { applyMerge, mergeMeta, planMerge, type Choice as MergeChoice, type ScalarField } from '@/engine/merge';
import { PRESETS, presetTime, type Preset } from '@/engine/reminder-plan';
import { useLanguage, useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { appFs, uriOf } from '@/lib/app-files';
import { captureOne, prepareSide } from '@/lib/capture';
import { cardInput } from '@/lib/card-input';
import { saveWithForm } from '@/lib/contacts';
import { replaceSide } from '@/lib/files';
import { kickOcr, onCardProcessed, phoneRegion } from '@/lib/ocr-queue';
import { setReminder } from '@/lib/reminders';
import { addField, confirmedFields, isEmpty, needsCheck, removeField, setAddressPart, setLabel, setNamePart, setValue, lineAsField, withCoreFields } from '@/lib/review-model';
import { noteLabels } from '@/lib/note-labels';

const KIND_ORDER: FieldKind[] = ['name', 'other_name', 'company', 'department', 'title', 'phone', 'email', 'url', 'social', 'address'];
const ADDABLE: FieldKind[] = ['other_name', 'company', 'department', 'title', 'phone', 'email', 'url', 'social', 'address'];

export default function ReviewScreen() {
  const { id, batch } = useLocalSearchParams<{ id: string; batch?: string }>();
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const lang = useLanguage();
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [fields, setFields] = useState<FieldInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [x, setX] = useState<Extracted | null>(null);
  const [side, setSide] = useState<SideName>('front');
  const [focus, setFocus] = useState<string[]>([]);
  const [events, setEvents] = useState<CardEvent[]>([]);
  const [meta, setMeta] = useState({ eventId: null as string | null, metOn: '', metWhere: '', notes: '', tags: '' });
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [mergeChoices, setMergeChoices] = useState<Partial<Record<ScalarField, MergeChoice>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | { kind: 'useAs'; lineId: string; text: string } | { kind: 'add' } | { kind: 'event' } | { kind: 'followUp' } | { kind: 'side'; which: SideName }>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (keepEdits: boolean) => {
      const c = await getCard(db, id);
      if (!c) {
        router.back();
        return;
      }
      setCard(c);
      if (!keepEdits) {
        setFields(withCoreFields(c.fields));
        setMeta({ eventId: c.eventId, metOn: c.metOn ?? '', metWhere: c.metWhere ?? '', notes: c.notes ?? '', tags: c.tags.join(', ') });
      }
      const region = await phoneRegion(db);
      const pending = c.sides.some((s) => s.ocrState === 'pending');
      setX(!pending && c.sides.length ? extract(cardInput(c, region, lang)) : null);
      if (c.status === 'checked') setConfirmed(true);
      setEvents(await listEvents(db));
      if (batch === '1') setQueue(await draftIds(db));
    },
    [db, id, lang, batch, router]
  );

  // a new id is a new screen (router.replace), so the local state starts fresh; on refocus local edits are kept
  useFocusEffect(
    useCallback(() => {
      load(dirty);
    }, [load, dirty])
  );
  useEffect(() => onCardProcessed((cid) => cid === id && load(dirty)), [id, load, dirty]);

  // duplicate check against the library (checked cards), live while editing
  useEffect(() => {
    let active = true;
    (async () => {
      if (!card || confirmed) return;
      const pool = await matchPool(db);
      const r = findMatches(contactFromFields(confirmedFields(fields)), pool, { region: await phoneRegion(db), excludeId: id });
      if (active) setMatch(r.verdict === 'none' ? null : r);
    })();
    return () => {
      active = false;
    };
  }, [db, card, fields, confirmed, id]);

  const update = (next: FieldInput[]) => {
    setFields(next);
    setDirty(true);
  };

  const pending = card?.sides.some((s) => s.ocrState === 'pending') ?? false;
  const shownSide = card?.sides.find((s) => s.side === side) ?? card?.sides[0];
  const usedLines = useMemo(() => new Set(fields.flatMap((f) => f.sourceLines)), [fields]);
  const leftovers = (x?.leftovers ?? []).map((lid) => x?.lines.find((l) => l.id === lid)).filter((l): l is NonNullable<typeof l> => !!l && !usedLines.has(l.id) && !usedLines.has(l.id.split('~')[0]));
  const position = queue.indexOf(id);
  const sideState = card?.sides.map((s) => s.ocrState) ?? [];

  async function saveDraft() {
    await replaceFields(db, id, fields.filter((f) => !isEmpty(f)));
    await saveMeta();
  }
  async function saveMeta() {
    await updateCardMeta(db, id, { eventId: meta.eventId, metOn: meta.metOn || null, metWhere: meta.metWhere || null, notes: meta.notes || null });
    await setCardTags(db, id, meta.tags.split(',').map((s) => s.trim()).filter(Boolean));
  }

  async function confirm(next: boolean) {
    setBusy(true);
    try {
      await confirmCard(db, id, confirmedFields(fields));
      await saveMeta();
      setDirty(false);
      if (next) return goNext();
      setConfirmed(true);
      await load(false);
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    const rest = (await draftIds(db)).filter((d) => d !== id);
    if (rest.length) router.replace({ pathname: '/review/[id]', params: { id: rest[0], batch: '1' } });
    else router.back();
  }

  async function later() {
    await saveDraft();
    const rest = (await draftIds(db)).filter((d) => d !== id);
    const after = rest.find((d) => queue.indexOf(d) > position) ?? null;
    if (batch === '1' && after) router.replace({ pathname: '/review/[id]', params: { id: after, batch: '1' } });
    else router.back();
  }

  async function addToContacts() {
    if (!card) return;
    const fresh = await getCard(db, id);
    if (!fresh || fresh.status !== 'checked') return; // L26: never an unchecked card
    const r = await saveWithForm(fresh.contact, noteLabels(t), await phoneRegion(db));
    if (r.result === 'none') return;
    await setContactState(db, id, 'form_saved', r.contactId);
    setSaved(r.result === 'saved' ? t('review.formSaved') : t('contacts.found'));
  }

  async function merge() {
    if (!match?.best || !card) return;
    const target = await getCard(db, match.best.card.id);
    if (!target) return;
    await saveDraft(); // the incoming card's notes, tags, event as shown
    const fresh = (await getCard(db, id)) ?? card;
    const incoming = contactFromFields(confirmedFields(fields));
    const plan = planMerge(target.contact, incoming, await phoneRegion(db));
    const merged = applyMerge(target.contact, plan, mergeChoices);
    // Order: everything is added to the stored card first; the incoming card goes last (a failure part way leaves a
    // duplicate, never a loss). Its notes/tags/event/met data and follow-up are kept (P8; nothing stored is replaced).
    await replaceFields(db, target.id, fieldsFromContact(merged, 'user'));
    const m = mergeMeta(target, fresh);
    await updateCardMeta(db, target.id, { eventId: m.eventId, metOn: m.metOn, metWhere: m.metWhere, notes: m.notes });
    await setCardTags(db, target.id, m.tags);
    if (target.followUpAt === null && fresh.followUpAt !== null) await setFollowUp(db, target.id, fresh.followUpAt, null, fresh.followUpLocal);
    await deleteCards(db, [id]);
    router.replace({ pathname: '/card/[id]', params: { id: target.id } });
  }

  // Add back side / Retake: the user chooses the system scanner or a photo (P8: with the camera denied, iOS's scanner only
  // says "Camera Unavailable" and returns nothing — the photo path must stay reachable).
  async function newSide(which: SideName, source: 'scan' | 'photos') {
    const pick = async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      return res.canceled || !res.assets[0] ? null : { uri: res.assets[0].uri, w: res.assets[0].width, h: res.assets[0].height, cropped: false };
    };
    setBusy(true);
    try {
      if (dirty) await saveDraft();
      const img = source === 'scan' ? await captureOne(pick) : await pick();
      if (!img) return;
      await replaceSide(appFs, db, id, await prepareSide(img, which));
      kickOcr();
      setSide(which);
      await load(true);
    } finally {
      setBusy(false);
    }
  }

  async function chooseFollowUp(v: string) {
    setSheet(null);
    if (!card) return;
    await saveDraftOrMeta();
    const fresh = (await getCard(db, id)) as Card;
    const at = v === 'none' ? null : presetTime(v as Preset, new Date());
    const r = await setReminder(db, fresh, at);
    setNotice(r === 'denied' ? t('review.followUp.off') : null);
    await load(true);
  }
  async function saveDraftOrMeta() {
    if (confirmed) await saveMeta();
    else await saveDraft();
  }

  if (!card) return <ActivityIndicator style={{ marginTop: Spacing.six }} />;

  const kindLabel = (k: FieldKind) => t(`field.${k === 'other_name' ? 'otherName' : k}` as 'field.name');
  const ordered = fields.map((f, i) => ({ f, i })).sort((a, b) => KIND_ORDER.indexOf(a.f.kind) - KIND_ORDER.indexOf(b.f.kind));
  const counters: Partial<Record<FieldKind, number>> = {};

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: position >= 0 && queue.length > 1 ? `${t('review.title')} (${position + 1}/${queue.length})` : t('review.title') }} />
      <ScrollView testID="review-screen" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {shownSide ? (
          <View>
            <View style={[styles.face, { backgroundColor: theme.cardFace }]}>
            <View style={[styles.imageWrap, { aspectRatio: shownSide.rotation % 180 === 0 ? shownSide.w / shownSide.h : shownSide.h / shownSide.w }]}>
              <Image testID="card-image" source={{ uri: uriOf(shownSide.imageFile) }} style={[styles.image, shownSide.rotation ? { transform: [{ rotate: `${shownSide.rotation}deg` }] } : null]} contentFit="contain" />
              {shownSide.rotation === 0
                ? (x?.lines ?? [])
                    .filter((l) => l.box && focus.includes(l.id) && l.id.startsWith(shownSide.side === 'front' ? 'f' : 'b'))
                    .map((l) => <View key={l.id} pointerEvents="none" style={[styles.outline, { borderColor: theme.tint, left: `${l.box!.x * 100}%`, top: `${l.box!.y * 100}%`, width: `${l.box!.w * 100}%`, height: `${l.box!.h * 100}%` }]} />)
                : null}
            </View>
            </View>
            {card.sides.length > 1 ? (
              <Pressable testID="side-toggle" onPress={() => setSide(side === 'front' ? 'back' : 'front')} style={styles.sideToggle}>
                <ThemedText type="small" themeColor="tintText">
                  {side === 'front' ? t('review.back') : t('review.front')}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {pending ? (
          <View style={styles.reading} testID="review-reading">
            <ActivityIndicator />
            <ThemedText themeColor="textSecondary">{t('review.reading')}</ThemedText>
          </View>
        ) : null}
        {sideState.includes('empty') && !fields.some((f) => !isEmpty(f)) ? <ThemedText testID="review-empty" themeColor="danger">{t('review.noText')}</ThemedText> : null}
        {sideState.includes('unsupported') ? (
          <ThemedText testID="review-unsupported" themeColor="danger">
            {card.sides.some((s) => s.ocrError === 'model-pending') ? t('review.modelPending') : t('review.unsupported', { langs: card.sides.map((s) => s.ocrLangs).filter(Boolean).join(', ') })}
          </ThemedText>
        ) : null}
        {sideState.includes('failed') ? <ThemedText testID="review-failed" themeColor="danger">{t('review.failed')}</ThemedText> : null}

        {match?.best && !confirmed ? (
          <View testID="duplicate-banner" style={[styles.banner, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small">
              {t(match.verdict === 'same' ? 'match.same' : 'match.possible', { name: matchLabel(match.best).name, company: matchLabel(match.best).company, date: new Date(match.best.card.createdAt ?? 0).toLocaleDateString(lang) })}
            </ThemedText>
            <MergeConflicts db={db} targetId={match.best.card.id} fields={fields} choices={mergeChoices} onChoose={setMergeChoices} />
            <View style={styles.row}>
              <Button testID="merge-button" label={t('match.merge')} onPress={merge} style={styles.flex} />
              <Button testID="keep-both-button" label={t('match.keepBoth')} variant="secondary" onPress={() => setMatch(null)} style={styles.flex} />
            </View>
          </View>
        ) : null}

        {ordered.map(({ f, i }) => {
          const n = (counters[f.kind] = (counters[f.kind] ?? -1) + 1);
          const key = `${f.kind}-${n}`;
          const check = needsCheck(f);
          return (
            <View key={`${i}-${f.kind}`} style={styles.field} onTouchStart={() => setFocus(f.sourceLines)}>
              <View style={styles.fieldHead}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {kindLabel(f.kind)}
                  {f.kind === 'social' && f.label ? ` · ${f.label}` : ''}
                </ThemedText>
                {check ? (
                  <ThemedText testID={`check-mark-${key}`} type="small" style={[styles.check, { backgroundColor: theme.danger, color: theme.background }]}>
                    {t('field.check')}
                  </ThemedText>
                ) : null}
                {f.kind === 'phone' || f.kind === 'email' ? (
                  <Pressable
                    testID={`${f.kind}-type-${n}`}
                    onPress={() => {
                      const list: readonly string[] = f.kind === 'phone' ? PHONE_TYPES : ['work', 'home', 'other'];
                      update(setLabel(fields, i, list[(list.indexOf(f.label ?? '') + 1) % list.length]));
                    }}>
                    <ThemedText type="small" themeColor="tintText">
                      {t(`${f.kind}.${f.label ?? 'other'}` as 'phone.mobile')}
                    </ThemedText>
                  </Pressable>
                ) : null}
                <View style={styles.flex} />
                <Pressable testID={`remove-${key}`} hitSlop={8} onPress={() => update(removeField(fields, i))}>
                  <ThemedText type="small" themeColor="danger">
                    {t('review.remove')}
                  </ThemedText>
                </Pressable>
              </View>
              {f.kind === 'name' ? (
                <NameEditor value={parseName(f.value)} onChange={(part, v) => update(setNamePart(fields, i, part, v))} />
              ) : f.kind === 'address' ? (
                <AddressEditor value={parseAddress(f.value)} onChange={(part, v) => update(setAddressPart(fields, i, part, v))} />
              ) : (
                <Input testID={`field-${key}`} value={f.value} onChangeText={(v) => update(setValue(fields, i, v))} keyboardType={f.kind === 'phone' ? 'phone-pad' : f.kind === 'email' ? 'email-address' : f.kind === 'url' ? 'url' : 'default'} autoCapitalize={f.kind === 'email' || f.kind === 'url' || f.kind === 'social' ? 'none' : 'sentences'} />
              )}
            </View>
          );
        })}
        <Pressable testID="add-field" onPress={() => setSheet({ kind: 'add' })} style={styles.addField}>
          <ThemedText themeColor="tintText">{t('review.addField')}</ThemedText>
        </Pressable>

        {leftovers.length ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">{t('field.leftovers')}</ThemedText>
            {leftovers.map((l) => (
              <Pressable key={l.id} testID={`leftover-${l.id}`} onPress={() => setSheet({ kind: 'useAs', lineId: l.id, text: l.text })} style={[styles.leftover, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" style={styles.flex}>
                  {l.text}
                </ThemedText>
                <ThemedText type="small" themeColor="tintText">
                  {t('field.useAs')}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Pressable testID="event-picker" onPress={() => setSheet({ kind: 'event' })} style={styles.metaRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('card.event')}
            </ThemedText>
            <ThemedText themeColor="tintText">{events.find((e) => e.id === meta.eventId)?.name ?? t('review.event.none')}</ThemedText>
          </Pressable>
          <Labeled label={t('card.metOn')}>
            <Input testID="met-on-input" value={meta.metOn} placeholder="YYYY-MM-DD" onChangeText={(v) => (setMeta({ ...meta, metOn: v }), setDirty(true))} />
          </Labeled>
          <Labeled label={t('card.metWhere')}>
            <Input testID="met-where-input" value={meta.metWhere} onChangeText={(v) => (setMeta({ ...meta, metWhere: v }), setDirty(true))} />
          </Labeled>
          <Labeled label={t('card.tags')}>
            <Input testID="tag-input" value={meta.tags} placeholder={t('review.tagsHint')} autoCapitalize="none" onChangeText={(v) => (setMeta({ ...meta, tags: v }), setDirty(true))} />
          </Labeled>
          <Labeled label={t('card.notes')}>
            <Input testID="notes-input" value={meta.notes} multiline onChangeText={(v) => (setMeta({ ...meta, notes: v }), setDirty(true))} />
          </Labeled>
          <Pressable testID="follow-up-button" onPress={() => setSheet({ kind: 'followUp' })} style={styles.metaRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('card.followUp')}
            </ThemedText>
            <ThemedText themeColor="tintText">{card.followUpAt ? t('review.followUp.at', { date: new Date(card.followUpAt).toLocaleString(lang) }) : t('review.followUp.none')}</ThemedText>
          </Pressable>
          {notice ? (
            <ThemedText testID="review-notice" type="small" themeColor="danger">
              {notice}
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.actions}>
          {confirmed ? (
            <>
              <ThemedText testID="review-confirmed" themeColor="textSecondary">
                {saved ?? t('review.saved')}
              </ThemedText>
              <Button testID="add-to-contacts-button" label={t('review.addToContacts')} onPress={addToContacts} />
              {dirty ? <Button testID="save-button" label={t('common.save')} variant="secondary" onPress={() => confirm(false)} /> : null}
              {batch === '1' && queue.filter((q) => q !== id).length ? (
                <Button testID="next-button" label={t('review.nextCard')} variant="secondary" onPress={goNext} />
              ) : (
                <Button testID="done-button" label={t('common.done')} variant="secondary" onPress={() => router.back()} />
              )}
            </>
          ) : (
            <>
              {batch === '1' && queue.length > 1 ? (
                <Button testID="next-button" disabled={busy || pending} label={t('review.next', { i: position + 1, n: queue.length })} onPress={() => confirm(true)} />
              ) : (
                <Button testID="confirm-button" disabled={busy || pending} label={t('review.confirm')} onPress={() => confirm(false)} />
              )}
              {batch === '1' && queue.length > 1 ? <Button testID="confirm-button" disabled={busy || pending} variant="secondary" label={t('review.confirm')} onPress={() => confirm(false)} /> : null}
              <View style={styles.row}>
                <Button testID="later-button" label={t('review.later')} variant="secondary" onPress={later} style={styles.flex} />
                {card.sides.length ? (
                  <Button testID={card.sides.some((s) => s.side === 'back') ? 'retake-back-button' : 'add-back-button'} label={card.sides.some((s) => s.side === 'back') ? t('review.retakeBack') : t('review.addBack')} variant="secondary" disabled={busy} onPress={() => setSheet({ kind: 'side', which: 'back' })} style={styles.flex} />
                ) : null}
              </View>
              {card.sides.length ? <Button testID="retake-button" label={t('review.retake')} variant="secondary" disabled={busy} onPress={() => setSheet({ kind: 'side', which: 'front' })} /> : null}
            </>
          )}
        </View>
      </ScrollView>
      {sheet?.kind === 'useAs' ? (
        <ChoiceSheet
          title={t('review.useAs')}
          choices={[...KIND_ORDER.filter((k) => k !== 'other_name').map((k) => ({ value: k, label: kindLabel(k) })), { value: 'note', label: t('card.notes') }]}
          onClose={() => setSheet(null)}
          onChoose={async (v) => {
            const s = sheet;
            setSheet(null);
            if (v === 'note') {
              setMeta({ ...meta, notes: meta.notes ? `${meta.notes}\n${s.text}` : s.text });
              setDirty(true);
            } else update(lineAsField(fields, v as FieldKind, s.text, s.lineId, await phoneRegion(db)));
          }}
        />
      ) : null}
      {sheet?.kind === 'add' ? <ChoiceSheet title={t('review.addField')} choices={ADDABLE.map((k) => ({ value: k, label: kindLabel(k) }))} onClose={() => setSheet(null)} onChoose={(v) => (setSheet(null), update(addField(fields, v as FieldKind)))} /> : null}
      {sheet?.kind === 'side' ? (
        <ChoiceSheet
          title={sheet.which === 'back' ? t('review.addBack') : t('review.retake')}
          choices={[
            { value: 'scan', label: t('home.scan') },
            { value: 'photos', label: t('home.add.photos') },
          ]}
          onClose={() => setSheet(null)}
          onChoose={(v) => {
            const which = sheet.which;
            setSheet(null);
            // the system picker/scanner never appeared while our sheet was still closing (P7, iOS): start it afterwards
            setTimeout(() => newSide(which, v as 'scan' | 'photos'), 450);
          }}
        />
      ) : null}
      {sheet?.kind === 'event' ? (
        <ChoiceSheet
          title={t('card.event')}
          choices={[{ value: '-', label: t('review.event.none') }, ...events.map((e) => ({ value: e.id, label: e.name }))]}
          onClose={() => setSheet(null)}
          onChoose={(v) => {
            setSheet(null);
            setMeta({ ...meta, eventId: v === '-' ? null : v });
            setDirty(true);
          }}
        />
      ) : null}
      {sheet?.kind === 'followUp' ? (
        <ChoiceSheet
          title={t('card.followUp')}
          choices={[...PRESETS.map((p): Choice => ({ value: p, label: t(`reminder.preset.${p}`) })), ...(card.followUpAt ? [{ value: 'none', label: t('review.followUp.remove') }] : [])]}
          onClose={() => setSheet(null)}
          onChoose={chooseFollowUp}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function MergeConflicts({ db, targetId, fields, choices, onChoose }: { db: ReturnType<typeof useSQLiteContext>; targetId: string; fields: FieldInput[]; choices: Partial<Record<ScalarField, MergeChoice>>; onChoose: (c: Partial<Record<ScalarField, MergeChoice>>) => void }) {
  const t = useT();
  const [conflicts, setConflicts] = useState<{ field: ScalarField; existing: string; incoming: string }[]>([]);
  useEffect(() => {
    let active = true;
    getCard(db, targetId).then(async (target) => {
      if (!target || !active) return;
      const plan = planMerge(target.contact, contactFromFields(confirmedFields(fields)), await phoneRegion(db));
      const text = (v: string | NameParts) => (typeof v === 'string' ? v : joinName(v));
      setConflicts(plan.conflicts.map((c) => ({ field: c.field, existing: text(c.existing), incoming: text(c.incoming) })));
    });
    return () => {
      active = false;
    };
  }, [db, targetId, fields]);
  if (!conflicts.length) return null;
  return (
    <View style={{ gap: Spacing.one }}>
      {conflicts.map((c) => {
        const useNew = choices[c.field] === 'incoming';
        return (
          <Pressable key={c.field} testID={`merge-choice-${c.field}`} onPress={() => onChoose({ ...choices, [c.field]: useNew ? 'keep' : 'incoming' })}>
            <ThemedText type="small">{t('review.mergeConflict', { field: t(`field.${c.field}` as 'field.name'), value: useNew ? c.incoming : c.existing })}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  const theme = useTheme();
  return <TextInput placeholderTextColor={theme.textSecondary} {...props} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }, props.multiline ? { minHeight: 72 } : null]} />;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

function NameEditor({ value, onChange }: { value: NameParts; onChange: (part: keyof NameParts, v: string) => void }) {
  const t = useT();
  const [more, setMore] = useState(!!(value.prefix || value.middle || value.suffix));
  return (
    <View style={{ gap: Spacing.one }}>
      {more ? <Input testID="field-name-prefix" placeholder={t('field.prefix')} value={value.prefix} onChangeText={(v) => onChange('prefix', v)} /> : null}
      <Input testID="field-name-given" placeholder={t('field.given')} value={value.given} onChangeText={(v) => onChange('given', v)} />
      {more ? <Input testID="field-name-middle" placeholder={t('field.middle')} value={value.middle} onChangeText={(v) => onChange('middle', v)} /> : null}
      <Input testID="field-name-family" placeholder={t('field.family')} value={value.family} onChangeText={(v) => onChange('family', v)} />
      {more ? <Input testID="field-name-suffix" placeholder={t('field.suffix')} value={value.suffix} onChangeText={(v) => onChange('suffix', v)} /> : null}
      {!more ? (
        <Pressable testID="name-more" onPress={() => setMore(true)}>
          <ThemedText type="small" themeColor="tintText">
            {t('review.nameMore')}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function AddressEditor({ value, onChange }: { value: Address; onChange: (part: keyof Address, v: string) => void }) {
  const t = useT();
  return (
    <View style={{ gap: Spacing.one }}>
      <Input testID="field-address-street" placeholder={t('field.street')} value={value.street} onChangeText={(v) => onChange('street', v)} />
      <View style={styles.row}>
        <Input testID="field-address-postcode" placeholder={t('field.postcode')} value={value.postcode} onChangeText={(v) => onChange('postcode', v)} style={undefined} />
        <View style={styles.flex}>
          <Input testID="field-address-city" placeholder={t('field.city')} value={value.city} onChangeText={(v) => onChange('city', v)} />
        </View>
      </View>
      <Input testID="field-address-region" placeholder={t('field.region')} value={value.region} onChangeText={(v) => onChange('region', v)} />
      <Input testID="field-address-country" placeholder={t('field.country')} value={value.country} onChangeText={(v) => onChange('country', v)} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  face: { padding: Spacing.two, borderRadius: Radius.card, boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.12)' },
  imageWrap: { width: '100%', borderRadius: Radius.card, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  outline: { position: 'absolute', borderWidth: 2, borderRadius: Radius.card },
  sideToggle: { alignSelf: 'flex-end', paddingVertical: Spacing.one },
  reading: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  banner: { borderRadius: Radius.control, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  field: { gap: Spacing.one },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  check: { borderRadius: Radius.card, paddingHorizontal: 6, overflow: 'hidden' },
  input: { borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minWidth: 90 },
  addField: { paddingVertical: Spacing.one },
  section: { gap: Spacing.two },
  leftover: { borderRadius: Radius.card, padding: Spacing.two, flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.one },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
});
