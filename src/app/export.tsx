// Export (SPEC §7 screen 5, U5): which cards (selection / all / event / tag), vCard or CSV, include notes, Share….
// CHECKED cards only (A11): the sheet says how many "To check" cards are left out.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { cardsForExport, type Card } from '@/db/cards';
import { listEvents, type CardEvent } from '@/db/events';
import { useSQLiteContext } from '@/db/provider';
import { listTags, type Tag } from '@/db/tags';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { exportContent, shareFiles, writeExport, type ExportFormat } from '@/lib/export';
import { noteLabels } from '@/lib/note-labels';

type Scope = { kind: 'selection' } | { kind: 'all' } | { kind: 'event'; id: string } | { kind: 'tag'; id: string };

export default function ExportScreen() {
  const params = useLocalSearchParams<{ ids?: string }>();
  const ids = params.ids ? params.ids.split(',').filter(Boolean) : null;
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>(ids ? { kind: 'selection' } : { kind: 'all' });
  const [format, setFormat] = useState<ExportFormat>('vcf');
  const [notes, setNotes] = useState(true);
  const [result, setResult] = useState<{ cards: Card[]; skippedDrafts: number }>({ cards: [], skippedDrafts: 0 });
  const [events, setEvents] = useState<CardEvent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    listEvents(db).then(setEvents);
    listTags(db).then(setTags);
  }, [db]);
  const idKey = params.ids ?? '';
  useEffect(() => {
    const sel = scope.kind === 'selection' ? { cardIds: idKey.split(',').filter(Boolean) } : scope.kind === 'event' ? { eventId: scope.id } : scope.kind === 'tag' ? { tagId: scope.id } : {};
    cardsForExport(db, sel).then(setResult);
  }, [db, scope, idKey]);

  const scopes: { id: string; label: string; s: Scope }[] = [
    ...(ids ? [{ id: 'scope-selection', label: t('export.scope.selection'), s: { kind: 'selection' } as Scope }] : []),
    { id: 'scope-all', label: t('export.scope.all'), s: { kind: 'all' } },
    ...events.map((e) => ({ id: `scope-event-${e.id}`, label: e.name, s: { kind: 'event', id: e.id } as Scope })),
    ...tags.map((g) => ({ id: `scope-tag-${g.id}`, label: `#${g.name}`, s: { kind: 'tag', id: g.id } as Scope })),
  ];
  const same = (a: Scope, b: Scope) => a.kind === b.kind && ('id' in a ? a.id : '') === ('id' in b ? b.id : '');

  async function share() {
    const base = scope.kind === 'event' ? (events.find((e) => e.id === scope.id)?.name ?? t('export.fileBase')) : scope.kind === 'tag' ? (tags.find((g) => g.id === scope.id)?.name ?? t('export.fileBase')) : t('export.fileBase');
    const file = writeExport(base, format, exportContent(result.cards, format, notes, noteLabels(t)));
    const done = await shareFiles([file], t('export.title'));
    setStatus(done ? t('export.done') : null);
  }

  return (
    <ScrollView testID="export-sheet" style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        {scopes.map((s) => (
          <Chip key={s.id} id={s.id} label={s.label} active={same(s.s, scope)} onPress={() => setScope(s.s)} />
        ))}
      </View>
      <ThemedText testID="export-count" type="smallBold">
        {t('export.count', { n: result.cards.length })}
      </ThemedText>
      {result.skippedDrafts ? (
        <ThemedText testID="export-left-out" themeColor="textSecondary">
          {t('export.leftOut', { n: result.skippedDrafts })}
        </ThemedText>
      ) : null}
      <View style={styles.wrap}>
        <Chip id="format-vcf" label={t('export.vcard')} active={format === 'vcf'} onPress={() => setFormat('vcf')} />
        <Chip id="format-csv" label={t('export.csv')} active={format === 'csv'} onPress={() => setFormat('csv')} />
      </View>
      <View style={styles.switchRow}>
        <ThemedText style={{ flex: 1 }}>{t('export.includeNotes')}</ThemedText>
        <Switch testID="include-notes" value={notes} onValueChange={setNotes} />
      </View>
      <Button testID="export-share" label={t('export.share')} disabled={result.cards.length === 0} onPress={share} />
      {result.cards.length === 0 ? <ThemedText themeColor="textSecondary">{t('export.none')}</ThemedText> : null}
      {status ? <ThemedText testID="export-status">{status}</ThemedText> : null}
      <Button testID="export-close" label={t('common.done')} variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

function Chip({ id, label, active, onPress }: { id: string; label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable testID={id} onPress={onPress} style={[styles.chip, { backgroundColor: active ? theme.tint : theme.backgroundElement }]}>
      <ThemedText type="small" style={{ color: active ? theme.onTint : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
