// Paste text (SPEC §7 screen 7, U7): an e-mail signature or any contact text → fields → Review (a draft, as every
// capture). Lines the extractor did not use go into the card's notes, so nothing pasted is lost.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { createCard } from '@/db/cards';
import { getCurrentEvent } from '@/db/events';
import { fieldsFromExtracted } from '@/db/fields';
import { useSQLiteContext } from '@/db/provider';
import { extractText } from '@/engine/extract/index';
import { getLanguage } from '@/i18n';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { newCardId } from '@/lib/app-files';
import { localDay } from '@/lib/capture';
import { phoneRegion } from '@/lib/ocr-queue';

export default function PasteScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState('');

  async function read() {
    const x = extractText(text, { region: await phoneRegion(db), uiLang: getLanguage() });
    const rest = x.leftovers.map((id) => x.lines.find((l) => l.id === id)?.text).filter(Boolean);
    const event = await getCurrentEvent(db);
    const id = await createCard(db, {
      id: newCardId(),
      source: 'paste',
      status: 'draft',
      eventId: event?.id ?? null,
      metOn: localDay(Date.now()),
      notes: rest.length ? `${t('paste.leftoverNote')}\n${rest.join('\n')}` : null,
      extractorVersion: x.version,
      fields: fieldsFromExtracted(x),
    });
    router.replace({ pathname: '/review/[id]', params: { id } });
  }

  return (
    <ScrollView testID="paste-screen" style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ThemedText themeColor="textSecondary">{t('paste.hint')}</ThemedText>
      <TextInput testID="paste-input" multiline autoFocus value={text} onChangeText={setText} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} textAlignVertical="top" />
      <Button testID="paste-read" label={t('paste.read')} disabled={!text.trim()} onPress={read} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  input: { borderRadius: Radius.control, padding: 12, fontSize: 16, minHeight: 220 },
});
