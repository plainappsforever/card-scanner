// Two small modal sheets used across screens: a list of choices (Android alerts allow only three buttons) and a
// one-line text prompt (Alert.prompt is iOS-only). testIDs for Maestro: choice-<value>, prompt-input, prompt-ok.
import { useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';

export type Choice = { value: string; label: string };

export function ChoiceSheet({ title, choices, onChoose, onClose }: { title: string; choices: readonly Choice[]; onChoose: (value: string) => void; onClose: () => void }) {
  const theme = useTheme();
  const t = useT();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* the backdrop is a sibling, not a parent: an accessible parent hides the choices from VoiceOver and Maestro */}
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.background }]} testID="choice-sheet">
          <ThemedText type="smallBold" style={styles.title}>
            {title}
          </ThemedText>
          <ScrollView style={{ maxHeight: 420 }}>
            {choices.map((c) => (
              <Pressable key={c.value} testID={`choice-${c.value}`} accessibilityRole="button" style={[styles.row, { borderColor: theme.border }]} onPress={() => onChoose(c.value)}>
                <ThemedText>{c.label}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable testID="choice-cancel" accessibilityRole="button" style={styles.row} onPress={onClose}>
            <ThemedText themeColor="tintText">{t('common.cancel')}</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function PromptSheet({ title, initial = '', onDone, onClose }: { title: string; initial?: string; onDone: (text: string) => void; onClose: () => void }) {
  const theme = useTheme();
  const t = useT();
  const [text, setText] = useState(initial);
  const input = useRef<TextInput>(null);
  // blur first: on Android the keyboard otherwise stays up after the modal closes and hides the selection bar
  const done = () => {
    input.current?.blur();
    Keyboard.dismiss();
    onDone(text.trim());
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="smallBold" style={styles.title}>
            {title}
          </ThemedText>
          <TextInput
            testID="prompt-input"
            autoFocus
            value={text}
            onChangeText={setText}
            ref={input}
            onSubmitEditing={() => text.trim() && done()}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <View style={styles.buttons}>
            <Pressable testID="prompt-cancel" accessibilityRole="button" onPress={onClose} style={styles.button}>
              <ThemedText themeColor="tintText">{t('common.cancel')}</ThemedText>
            </Pressable>
            <Pressable testID="prompt-ok" accessibilityRole="button" disabled={!text.trim()} onPress={done} style={styles.button}>
              <ThemedText themeColor="tintText" type="smallBold">
                {t('common.ok')}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: Spacing.four },
  sheet: { borderRadius: Radius.control, padding: Spacing.three, gap: Spacing.two },
  title: { marginBottom: Spacing.one },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.four },
  button: { paddingVertical: 8 },
});
