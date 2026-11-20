// Events (SPEC §7 screen 8): create, rename, "Use for new scans" (the banner on Cards), Stop.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { PromptSheet } from '@/components/sheets';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { createEvent, getCurrentEvent, listEvents, renameEvent, setCurrentEvent, type CardEvent } from '@/db/events';
import { useSQLiteContext } from '@/db/provider';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';

export default function EventsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const [events, setEvents] = useState<CardEvent[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<CardEvent | null>(null);

  const load = useCallback(async () => {
    setEvents(await listEvents(db));
    setCurrent((await getCurrentEvent(db))?.id ?? null);
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function create() {
    if (!name.trim()) return;
    const id = await createEvent(db, name);
    await setCurrentEvent(db, id);
    setName('');
    Keyboard.dismiss();
    load();
  }

  return (
    <ScrollView testID="events-screen" style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.row}>
        <TextInput testID="event-name-input" placeholder={t('events.new')} placeholderTextColor={theme.textSecondary} value={name} onChangeText={setName} onSubmitEditing={create} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
        <Button testID="event-create" label={t('events.create')} disabled={!name.trim()} onPress={create} />
      </View>
      {current ? <Button testID="event-stop" label={t('events.stop')} variant="secondary" onPress={async () => (await setCurrentEvent(db, null), load())} /> : null}
      {events.length === 0 ? <ThemedText themeColor="textSecondary">{t('events.empty')}</ThemedText> : null}
      {events.map((e) => (
        <View key={e.id} testID={`event-row-${e.id}`} style={[styles.event, { borderColor: theme.border }]}>
          <Pressable style={{ flex: 1 }} onLongPress={() => setRenaming(e)} testID={`event-name-${e.id}`}>
            <ThemedText type="smallBold">{e.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('events.cards', { n: e.cards })}
            </ThemedText>
          </Pressable>
          {current === e.id ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('events.current')}
            </ThemedText>
          ) : (
            <Pressable testID={`event-current-${e.id}`} onPress={async () => (await setCurrentEvent(db, e.id), load())}>
              <ThemedText type="small" themeColor="tintText">
                {t('events.use')}
              </ThemedText>
            </Pressable>
          )}
        </View>
      ))}
      {renaming ? (
        <PromptSheet
          title={t('events.rename')}
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onDone={async (n) => {
            await renameEvent(db, renaming.id, n);
            setRenaming(null);
            load();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
  input: { flex: 1, borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  event: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
});
