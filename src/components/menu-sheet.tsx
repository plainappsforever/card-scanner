// The home menu (sheet 7): one bottom sheet with My card, Events, Export and Settings, icon and label per row.
// Rows keep the testIDs of the old header links (my-card-button, export-button, settings-button); Events is menu-events
// because the Events chip on the home screen keeps events-button.
import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';

export type MenuTarget = 'my-card' | 'events' | 'export' | 'settings';

export function MenuSheet({ onChoose, onClose }: { onChoose: (target: MenuTarget) => void; onClose: () => void }) {
  const theme = useTheme();
  const t = useT();
  const rows: { target: MenuTarget; id: string; label: string; symbol: 'person.crop.rectangle' | 'calendar' | 'square.and.arrow.up' | 'gearshape'; glyph: string }[] = [
    { target: 'my-card', id: 'my-card-button', label: t('home.myCard'), symbol: 'person.crop.rectangle', glyph: '▭' },
    { target: 'events', id: 'menu-events', label: t('home.events'), symbol: 'calendar', glyph: '▦' },
    { target: 'export', id: 'export-button', label: t('home.export'), symbol: 'square.and.arrow.up', glyph: '↑' },
    { target: 'settings', id: 'settings-button', label: t('settings.title'), symbol: 'gearshape', glyph: '⚙' },
  ];
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* sibling, not parent, of the sheet: an accessible parent hides the rows from VoiceOver and Maestro */}
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.background }]} testID="menu-sheet">
          {rows.map((r) => (
            <Pressable key={r.target} testID={r.id} accessibilityRole="button" style={[styles.row, { borderColor: theme.border }]} onPress={() => onChoose(r.target)}>
              <SymbolView name={r.symbol} size={22} tintColor={theme.tintText} fallback={<ThemedText themeColor="tintText">{r.glyph}</ThemedText>} />
              <ThemedText>{r.label}</ThemedText>
            </Pressable>
          ))}
          <Pressable testID="menu-cancel" accessibilityRole="button" style={styles.row} onPress={onClose}>
            <ThemedText themeColor="tintText">{t('common.cancel')}</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.control, borderTopRightRadius: Radius.control, padding: Spacing.three, paddingBottom: Spacing.five },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
