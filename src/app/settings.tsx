// Settings (SPEC §7 screen 9): language, appearance, phone region, text-recognition languages (what THIS phone can
// read, from the engine at runtime), batch two-sided, Contacts access state, About (privacy, what we do not do, licences).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ChoiceSheet } from '@/components/sheets';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useSQLiteContext } from '@/db/provider';
import { getSetting, getThemePreference, setSetting, setThemePreference, type ThemePreference } from '@/db/settings';
import { deviceRegion, LANGUAGE_NAMES, LANGUAGES, type Language, type LanguagePreference } from '@/i18n';
import { useLanguage, useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { PRIVACY_URL } from '@/constants/app';
import { contactsAccess, type Access } from '@/lib/contacts';
import { ocrLanguages, planOcr } from '@/lib/ocr-langs';
import { nativeOcrLanguages } from '@/lib/ocr-queue';
import { applyLanguagePreference, getLanguagePreference, getTwoSided } from '@/lib/prefs';
import { applyThemePreference } from '@/lib/theme-preference';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const t = useT();
  const lang = useLanguage();
  const [pref, setPref] = useState<LanguagePreference>('system');
  const [themePref, setThemePref] = useState<ThemePreference>('system');
  const [region, setRegion] = useState('');
  const [ocr, setOcr] = useState<Language[]>([]);
  const [readable, setReadable] = useState<Set<Language>>(new Set());
  const [twoSided, setTwoSided] = useState(false);
  const [access, setAccess] = useState<Access>('undetermined');
  const [sheet, setSheet] = useState<null | 'language' | 'theme'>(null);

  const load = useCallback(async () => {
    setPref(await getLanguagePreference(db));
    setThemePref(await getThemePreference(db));
    setRegion((await getSetting(db, 'phone_region')) ?? '');
    setOcr(ocrLanguages(await getSetting(db, 'ocr_langs'), lang));
    const native = await nativeOcrLanguages();
    const os = Platform.OS === 'ios' ? 'ios' : 'android';
    setReadable(new Set(LANGUAGES.filter((l) => planOcr([l], os, native).codes.length > 0)));
    setTwoSided(await getTwoSided(db));
    setAccess(await contactsAccess().catch(() => 'undetermined' as const));
  }, [db, lang]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggleOcr(l: Language) {
    const next = ocr.includes(l) ? ocr.filter((x) => x !== l) : [...ocr, l];
    if (next.length === 0) return;
    await setSetting(db, 'ocr_langs', next.join(','));
    setOcr(ocrLanguages(next.join(','), lang));
  }

  return (
    <ScrollView testID="settings-screen" style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Row id="language-button" label={t('settings.language')} value={pref === 'system' ? t('settings.language.system') : LANGUAGE_NAMES[pref]} onPress={() => setSheet('language')} />
      <Row id="theme-button" label={t('settings.theme')} value={t(`settings.theme.${themePref}`)} onPress={() => setSheet('theme')} />
      <View style={styles.block}>
        <ThemedText type="smallBold">{t('settings.regionLabel')}</ThemedText>
        <TextInput
          testID="phone-region"
          value={region}
          placeholder={deviceRegion() ?? 'DE'}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="characters"
          maxLength={2}
          onChangeText={async (v) => {
            setRegion(v.toUpperCase());
            if (/^[A-Za-z]{2}$/.test(v)) await setSetting(db, 'phone_region', v.toUpperCase());
          }}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.regionHint')}
        </ThemedText>
      </View>
      <View style={styles.block}>
        <ThemedText type="smallBold">{t('settings.ocr')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.ocrHint')}
        </ThemedText>
        {LANGUAGES.map((l) => (
          <View key={l} style={styles.switchRow}>
            <ThemedText style={{ flex: 1 }} themeColor={readable.has(l) ? 'text' : 'textSecondary'}>
              {LANGUAGE_NAMES[l]}
              {readable.has(l) ? '' : ` — ${t('settings.ocrUnsupported')}`}
            </ThemedText>
            <Switch testID={`ocr-lang-${l}`} value={ocr.includes(l)} disabled={!readable.has(l)} onValueChange={() => toggleOcr(l)} />
          </View>
        ))}
      </View>
      <View style={styles.switchRow}>
        <ThemedText style={{ flex: 1 }}>{t('settings.twoSided')}</ThemedText>
        <Switch
          testID="batch-two-sided"
          value={twoSided}
          onValueChange={async (v) => {
            setTwoSided(v);
            await setSetting(db, 'batch_two_sided', v ? '1' : '0');
          }}
        />
      </View>
      <View style={styles.block}>
        <ThemedText type="smallBold">{t('settings.contacts')}</ThemedText>
        <ThemedText testID="contacts-access" themeColor="textSecondary">
          {t(`settings.contacts.${access}`)}
        </ThemedText>
        {access === 'denied' || access === 'limited' ? (
          <Pressable testID="open-system-settings" onPress={() => Linking.openSettings()}>
            <ThemedText themeColor="tintText">{t('bulk.openSettings')}</ThemedText>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.block} testID="about">
        <ThemedText type="smallBold">{t('settings.about')}</ThemedText>
        <ThemedText type="small">{t('settings.privacy')}</ThemedText>
        <Pressable testID="privacy-link" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => undefined)}>
          <ThemedText type="small" themeColor="tintText">
            {t('settings.privacyLink')}
          </ThemedText>
        </Pressable>
        <ThemedText type="small">{t('settings.notDone')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.licences')}
        </ThemedText>
      </View>
      {sheet === 'language' ? (
        <ChoiceSheet
          title={t('settings.language')}
          choices={[{ value: 'system', label: t('settings.language.system') }, ...LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))]}
          onClose={() => setSheet(null)}
          onChoose={async (v) => {
            setSheet(null);
            setPref(v as LanguagePreference);
            await applyLanguagePreference(db, v as LanguagePreference);
          }}
        />
      ) : null}
      {sheet === 'theme' ? (
        <ChoiceSheet
          title={t('settings.theme')}
          choices={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))}
          onClose={() => setSheet(null)}
          onChoose={async (v) => {
            setSheet(null);
            setThemePref(v as ThemePreference);
            applyThemePreference(v as ThemePreference);
            await setThemePreference(db, v as ThemePreference);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function Row({ id, label, value, onPress }: { id: string; label: string; value: string; onPress: () => void }) {
  return (
    <Pressable testID={id} onPress={onPress} style={styles.row}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText themeColor="tintText">{value}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  block: { gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  input: { borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, width: 80 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
