// Cards (SPEC §7 screen 1, redesign sheet 7): the event ribbon, the pile of the latest cards, search, filter chips
// (All / To check / events / tags), sort, the list as card edges, a big Scan button and "+" (Photos, Paste text, Type in),
// a menu sheet (My card, Events, Export, Settings), multi-select with
// Export / Add to Contacts / Tag / Event / Delete (undo). No onboarding, no prompt before the first scan (A3).
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardPile, PILE_SIZE } from '@/components/card-pile';
import { MenuSheet } from '@/components/menu-sheet';
import { ChoiceSheet, PromptSheet, type Choice } from '@/components/sheets';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { countCards, deleteCards, listCards, restoreCards, setEventForCards, type Card } from '@/db/cards';
import { getCurrentEvent, listEvents, type CardEvent } from '@/db/events';
import { useSQLiteContext } from '@/db/provider';
import { addTagToCards, listTags, type Tag } from '@/db/tags';
import { displayName, type SortOrder } from '@/engine/format';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { purgeExpired, UNDO_MS, uriOf } from '@/lib/app-files';
import { takeDeleted } from '@/lib/last-deleted';
import { addCards, scanCards } from '@/lib/capture';
import { onCardProcessed } from '@/lib/ocr-queue';
import { getTwoSided } from '@/lib/prefs';
import { maybeAskForReview } from '@/lib/store-review';

type Filter = { kind: 'all' } | { kind: 'pile'; ids: string[] } | { kind: 'draft' } | { kind: 'event'; id: string } | { kind: 'tag'; id: string };
const SORTS: SortOrder[] = ['added', 'name', 'company'];

export default function CardsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<Card[]>([]);
  const [pile, setPile] = useState<Card[]>([]);
  const listRef = useRef<FlatList<Card>>(null);
  const pileBottom = useRef(0);
  const [counts, setCounts] = useState({ all: 0, draft: 0 });
  const [events, setEvents] = useState<CardEvent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [current, setCurrent] = useState<CardEvent | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sort, setSort] = useState<SortOrder>('added');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [sheet, setSheet] = useState<null | 'add' | 'fallback' | 'event' | 'tag' | 'menu'>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [undo, setUndo] = useState<string[] | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const f = { query: query.trim() || undefined, sort, status: filter.kind === 'draft' ? ('draft' as const) : undefined, eventId: filter.kind === 'event' ? filter.id : undefined, tagId: filter.kind === 'tag' ? filter.id : undefined };
    const [c, n, e, tg, cur] = await Promise.all([listCards(db, f), countCards(db), listEvents(db), listTags(db), getCurrentEvent(db)]);
    // the pile = the latest twelve cards (or the active event's); the plain list already is that, else one more read
    const plain = !f.query && !f.status && !f.eventId && !f.tagId && sort === 'added' && !cur;
    setPile(plain ? c : await listCards(db, { eventId: cur?.id }));
    setCards(c);
    setCounts(n);
    setEvents(e);
    setTags(tg);
    setCurrent(cur);
  }, [db, query, sort, filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // the rating prompt: after the fifth card saved to Contacts, once per version, never while a scan runs (src/lib/store-review.ts)
  useFocusEffect(
    useCallback(() => {
      if (busy) return;
      maybeAskForReview(
        db,
        Constants.expoConfig?.version ?? '0',
        async () => {
          if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
        },
        busy
      ).catch(() => undefined);
    }, [db, busy])
  );
  useEffect(() => onCardProcessed(() => load()), [load]);

  /** The undo snack; when it expires, cards deleted that long ago are purged for good (M1). */
  const showUndo = useCallback(
    (ids: string[]) => {
      setUndo(ids);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => {
        setUndo(null);
        purgeExpired(db, UNDO_MS).catch(() => undefined);
      }, UNDO_MS);
    },
    [db]
  );
  // a card deleted on the Card screen gets the same undo here (M3)
  useFocusEffect(
    useCallback(() => {
      const ids = takeDeleted();
      if (ids) showUndo(ids);
    }, [showUndo])
  );

  const selecting = selectMode || selected.size > 0;
  const endSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function afterCapture(ids: string[]) {
    if (ids.length > 0) router.push({ pathname: '/review/[id]', params: { id: ids[0], batch: ids.length > 1 ? '1' : '0' } });
  }

  async function capture(run: () => Promise<string[] | 'fallback' | null>) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await run();
      if (r === 'fallback') setSheet('fallback');
      else if (r) await afterCapture(r);
    } catch (e) {
      setMessage(t('scan.failed', { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
      load();
    }
  }

  const scan = () =>
    capture(async () => {
      const r = await scanCards(db, { twoSided: await getTwoSided(db), eventId: current?.id ?? null });
      return r.kind === 'fallback' ? 'fallback' : r.kind === 'cards' ? r.ids : null;
    });

  const photos = () =>
    capture(async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 20, quality: 1, exif: false });
      if (res.canceled || res.assets.length === 0) return null;
      return addCards(db, res.assets.map((a) => ({ uri: a.uri, w: a.width, h: a.height, cropped: false })), { source: 'photo', twoSided: await getTwoSided(db), eventId: current?.id ?? null });
    });

  const camera = () =>
    capture(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setMessage(t('scan.cameraUnavailable'));
        return null;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false }).catch(() => null);
      if (!res) {
        setMessage(t('scan.cameraUnavailable'));
        return null;
      }
      if (res.canceled || res.assets.length === 0) return null;
      return addCards(db, res.assets.map((a) => ({ uri: a.uri, w: a.width, h: a.height, cropped: false })), { source: 'photo', twoSided: false, eventId: current?.id ?? null });
    });

  async function removeSelected() {
    const ids = [...selected];
    await deleteCards(db, ids);
    endSelection();
    showUndo(ids);
    load();
  }

  const chips: { id: string; label: string; active: boolean; on: () => void }[] = [
    { id: 'filter-all', label: t('home.filter.all'), active: filter.kind === 'all', on: () => setFilter({ kind: 'all' }) },
    { id: 'filter-draft', label: t('home.filter.draft', { n: counts.draft }), active: filter.kind === 'draft', on: () => setFilter({ kind: 'draft' }) },
    // P8: only tags/events that still have cards (or the active filter) — empty filters are noise (L10)
    ...tags
      .filter((g) => g.cards > 0 || (filter.kind === 'tag' && filter.id === g.id))
      .map((g) => ({ id: `filter-tag-${g.id}`, label: `#${g.name}`, active: filter.kind === 'tag' && filter.id === g.id, on: () => setFilter({ kind: 'tag', id: g.id }) })),
    ...events
      .filter((e) => e.cards > 0 || (filter.kind === 'event' && filter.id === e.id))
      .map((e) => ({ id: `filter-event-${e.id}`, label: e.name, active: filter.kind === 'event' && filter.id === e.id, on: () => setFilter({ kind: 'event', id: e.id }) })),
  ];

  const addChoices: Choice[] = [
    { value: 'photos', label: t('home.add.photos') },
    { value: 'paste', label: t('home.add.paste') },
    { value: 'manual', label: t('home.add.manual') },
  ];

  // tapping the pile filters the list to the pile's cards and scrolls down to it (the search and the chips stay in view)
  const showPile = () => {
    setFilter({ kind: 'pile', ids: pile.slice(0, PILE_SIZE).map((c) => c.id) });
    listRef.current?.scrollToOffset({ offset: pileBottom.current, animated: true });
  };
  const shownCards = filter.kind === 'pile' ? cards.filter((c) => filter.ids.includes(c.id)) : cards;

  const header = (
    <View>
      {pile.length > 0 ? (
        <View onLayout={(e) => (pileBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <CardPile cards={pile} total={counts.all} draftTotal={counts.draft} onPress={showPile} />
        </View>
      ) : null}
      <View style={styles.top}>
        <TextInput
          testID="search-input"
          placeholder={t('home.search')}
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        />
        <FlatList
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          data={[...chips.slice(0, 2), { id: 'select-mode', label: t('home.select'), active: selecting, on: () => (selecting ? endSelection() : setSelectMode(true)) }, { id: 'events-button', label: t('home.events'), active: false, on: () => router.push('/events') }, ...chips.slice(2), { id: 'sort-menu', label: t(`home.sort.${sort}`), active: false, on: () => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]) }]}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.chips}
          renderItem={({ item }) => (
            <Pressable testID={item.id} onPress={item.on} style={[styles.chip, { backgroundColor: item.active ? theme.tint : theme.backgroundElement, borderColor: item.active ? theme.tint : theme.border }]}>
              <ThemedText type="small" style={{ color: item.active ? theme.onTint : theme.text }}>
                {item.label}
              </ThemedText>
            </Pressable>
          )}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]} testID="cards-screen">
      <Stack.Screen
        options={{
          headerTitleAlign: 'center',
          headerRight: () => (
            <Pressable testID="menu-button" accessibilityRole="button" accessibilityLabel={t('home.menu')} hitSlop={10} onPress={() => setSheet('menu')}>
              <SymbolView name="line.3.horizontal" size={24} tintColor={theme.tintText} fallback={<ThemedText themeColor="tintText">≡</ThemedText>} />
            </Pressable>
          ),
        }}
      />
      {current ? (
        <Pressable testID="event-banner" style={[styles.banner, { backgroundColor: theme.tint }]} onPress={() => router.push('/events')}>
          <ThemedText type="small" numberOfLines={1} style={[styles.bannerName, { color: theme.cardFace }]}>
            {t('home.eventBanner', { name: current.name })}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: theme.cardFace }}>
            {t('home.eventChange')}
          </ThemedText>
        </Pressable>
      ) : null}
      {message ? (
        <ThemedText testID="home-message" type="small" themeColor="danger" style={styles.message}>
          {message}
        </ThemedText>
      ) : null}
      <FlatList
        ref={listRef}
        testID="card-list"
        data={shownCards}
        extraData={[selected, selecting]}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {counts.all === 0 ? <EmptyCard /> : null}
            <ThemedText testID="empty-state" themeColor="textSecondary" style={styles.empty}>
              {counts.all === 0 ? t('home.empty') : t('home.noMatch')}
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => <Row card={item} selected={selected.has(item.id)} selecting={selecting} onPress={() => (selecting ? toggle(item.id) : router.push(item.status === 'draft' ? { pathname: '/review/[id]', params: { id: item.id, batch: counts.draft > 1 ? '1' : '0' } } : { pathname: '/card/[id]', params: { id: item.id } }))} onLongPress={() => toggle(item.id)} />}
      />
      {undo ? (
        <View style={[styles.snack, { backgroundColor: theme.text, bottom: 110 + insets.bottom }]}>
          <ThemedText style={{ color: theme.background }}>{t('home.deleted', { n: undo.length })}</ThemedText>
          <Pressable
            testID="undo-button"
            onPress={async () => {
              await restoreCards(db, undo);
              setUndo(null);
              load();
            }}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {t('home.undo')}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.two, backgroundColor: theme.background }]}>
        {selecting ? (
          <View style={styles.selBar} testID="selection-bar">
            <ThemedText type="smallBold">{t('home.selected', { n: selected.size })}</ThemedText>
            <View style={styles.selActions}>
              <SelButton id="selection-export" label={t('home.sel.export')} onPress={() => router.push({ pathname: '/export', params: { ids: [...selected].join(',') } })} />
              <SelButton id="selection-contacts" label={t('home.sel.contacts')} onPress={() => router.push({ pathname: '/bulk-contacts', params: { ids: [...selected].join(',') } })} />
              <SelButton id="selection-tag" label={t('home.sel.tag')} onPress={() => setSheet('tag')} />
              <SelButton id="selection-event" label={t('home.sel.event')} onPress={() => setSheet('event')} />
              <SelButton id="selection-delete" label={t('home.sel.delete')} danger onPress={removeSelected} />
              <SelButton id="selection-cancel" label={t('common.cancel')} onPress={endSelection} />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable testID="scan-button" accessibilityRole="button" disabled={busy} onPress={scan} style={[styles.scan, { backgroundColor: theme.tint }]}>
              {busy ? <ActivityIndicator color={theme.onTint} /> : <ThemedText style={[styles.scanLabel, { color: theme.onTint }]}>{t('home.scan')}</ThemedText>}
            </Pressable>
            <Pressable testID="add-menu" accessibilityRole="button" accessibilityLabel={t('home.add')} disabled={busy} onPress={() => setSheet('add')} style={[styles.plus, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText style={styles.plusLabel}>+</ThemedText>
            </Pressable>
          </View>
        )}
      </View>
      {sheet === 'menu' ? (
        <MenuSheet
          onClose={() => setSheet(null)}
          onChoose={(target) => {
            setSheet(null);
            router.push(target === 'my-card' ? '/my-card' : target === 'events' ? '/events' : target === 'export' ? '/export' : '/settings');
          }}
        />
      ) : null}
      {sheet === 'add' ? (
        <ChoiceSheet
          title={t('home.add')}
          choices={addChoices}
          onClose={() => setSheet(null)}
          onChoose={(v) => {
            setSheet(null);
            // iOS cannot present the system picker while our sheet (a Modal) is still closing — it silently never
            // appeared (P7, simulator); start it after the close animation
            if (v === 'photos') setTimeout(photos, 450);
            if (v === 'paste') router.push('/paste');
            if (v === 'manual') router.push('/new');
          }}
        />
      ) : null}
      {sheet === 'fallback' ? (
        <ChoiceSheet
          title={t('scan.fallback.body')}
          choices={[
            { value: 'camera', label: t('scan.fallback.camera') },
            { value: 'photos', label: t('scan.fallback.photos') },
          ]}
          onClose={() => setSheet(null)}
          onChoose={(v) => {
            setSheet(null);
            setTimeout(v === 'camera' ? camera : photos, 450);
          }}
        />
      ) : null}
      {sheet === 'event' ? (
        <ChoiceSheet
          title={t('home.sel.event')}
          choices={[{ value: '-', label: t('review.event.none') }, ...events.map((e) => ({ value: e.id, label: e.name }))]}
          onClose={() => setSheet(null)}
          onChoose={async (v) => {
            setSheet(null);
            await setEventForCards(db, [...selected], v === '-' ? null : v);
            endSelection();
            load();
          }}
        />
      ) : null}
      {sheet === 'tag' ? (
        <PromptSheet
          title={t('home.tagPrompt')}
          onClose={() => setSheet(null)}
          onDone={async (name) => {
            setSheet(null);
            await addTagToCards(db, [...selected], name);
            endSelection();
            load();
          }}
        />
      ) : null}
    </View>
  );
}

function SelButton({ id, label, onPress, danger }: { id: string; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable testID={id} accessibilityRole="button" onPress={onPress} hitSlop={6} style={styles.selButton}>
      <ThemedText type="small" themeColor={danger ? 'danger' : 'tintText'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Row({ card, selected, selecting, onPress, onLongPress }: { card: Card; selected: boolean; selecting: boolean; onPress: () => void; onLongPress: () => void }) {
  const theme = useTheme();
  const t = useT();
  const front = card.sides.find((s) => s.side === 'front');
  const name = displayName(card.contact.name) || card.contact.company || card.contact.emails[0]?.value || t('row.unnamed');
  const pending = card.sides.some((s) => s.ocrState === 'pending');
  const draft = card.status === 'draft';
  const badge = draft ? t('status.draft') : card.contactState !== 'none' ? t('status.inContacts') : null;
  return (
    <Pressable
      testID={`card-row-${card.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, { backgroundColor: theme.cardFace, borderColor: selected ? theme.tint : 'transparent' }]}>
      {selecting ? <View testID={`select-${card.id}`} style={[styles.check, { borderColor: theme.tint, backgroundColor: selected ? theme.tint : 'transparent' }]} /> : null}
      {front ? <Image source={{ uri: uriOf(front.imageFile.replace(/\.jpg$/, '.thumb.jpg')) }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]} />}
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.cardFaceText }}>
          {pending ? t('review.reading') : name}
        </ThemedText>
        {card.contact.company && name !== card.contact.company ? (
          <ThemedText type="small" numberOfLines={1} style={{ color: theme.cardFaceText, opacity: 0.7 }}>
            {card.contact.company}
          </ThemedText>
        ) : null}
        {card.eventName ? (
          <ThemedText type="small" numberOfLines={1} style={{ color: theme.cardFaceText, opacity: 0.7 }}>
            {card.eventName}
          </ThemedText>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, draft ? { borderColor: theme.tint, borderWidth: 1 } : { backgroundColor: theme.tint }]}>
          {/* One line (P9b): on the Android 36 emulator the measured width broke "To check" before "check" at draw time and
              the one-line-high pill showed only "To". */}
          <ThemedText type="small" numberOfLines={1} style={{ color: draft ? theme.tintText : theme.cardFace }}>
            {badge}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The empty state: one card outline lying at -3 degrees with a dashed circle for the initial and two dashed lines. */
function EmptyCard() {
  const theme = useTheme();
  const dash = { borderStyle: 'dashed' as const, borderColor: theme.textSecondary };
  return (
    <View testID="empty-card" style={[styles.emptyCard, dash, { transform: [{ rotate: '-3deg' }] }]}>
      <View style={[styles.emptyInitial, dash]} />
      <View style={styles.emptyLines}>
        <View style={[styles.emptyLine, dash, { width: '90%' }]} />
        <View style={[styles.emptyLine, dash, { width: '60%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banner: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bannerName: { flex: 1 },
  top: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.two },
  search: { borderRadius: Radius.control, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chips: { gap: Spacing.two, paddingBottom: Spacing.two },
  chip: { borderRadius: Radius.control, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 6 },
  message: { paddingHorizontal: Spacing.three },
  emptyWrap: { alignItems: 'center', marginTop: Spacing.five, gap: Spacing.three },
  empty: { textAlign: 'center', paddingHorizontal: Spacing.four },
  emptyCard: { width: 200, height: 129, borderRadius: Radius.card, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three },
  emptyInitial: { width: 48, height: 48, borderRadius: 24, borderWidth: 2 },
  emptyLines: { flex: 1, gap: Spacing.three },
  emptyLine: { height: 0, borderTopWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, height: 64, marginHorizontal: Spacing.three, marginBottom: 6, paddingHorizontal: Spacing.two, borderRadius: Radius.card, borderWidth: 2 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  thumb: { width: 72, height: 46, borderRadius: Radius.card },
  rowText: { flex: 1 },
  badge: { flexShrink: 0, borderRadius: Radius.card, paddingHorizontal: 8, paddingVertical: 2 },
  snack: { position: 'absolute', left: Spacing.three, right: Spacing.three, borderRadius: Radius.control, padding: Spacing.three, flexDirection: 'row', justifyContent: 'space-between' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  scan: { flex: 1, height: 60, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' },
  scanLabel: { fontSize: 20, fontWeight: 700 },
  plus: { width: 60, height: 60, borderRadius: Radius.control, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  plusLabel: { fontSize: 30, lineHeight: 34 },
  selBar: { gap: Spacing.two },
  selActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  selButton: { paddingVertical: 6 },
});
