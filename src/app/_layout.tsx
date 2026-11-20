import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, type Theme } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState, LogBox, useColorScheme } from 'react-native';

import { BrandFonts, Colors } from '@/constants/theme';
import { DatabaseProvider } from '@/db/provider';
import { migrate } from '@/db/migrations';
import { getThemePreference } from '@/db/settings';
import { useT } from '@/hooks/use-t';
import { purgeExpired, sweepFiles } from '@/lib/app-files';
import { configureNotifications } from '@/lib/notifications';
import { startOcrQueue } from '@/lib/ocr-queue';
import { applyLanguagePreference } from '@/lib/prefs';
import { startReminders } from '@/lib/reminders';
import { applyThemePreference } from '@/lib/theme-preference';

configureNotifications();
// Dev builds only (LogBox does not exist in Release): expo-router 57.0.27's useLinking sets state when the initial URL of
// a cold start by a link resolves, before its root has mounted — a framework warning, not ours. Its red toast covered
// the bottom buttons on Android and failed two dev flows in P9b (L14).
LogBox.ignoreLogs(["Can't perform a React state update on a component that hasn't mounted yet"]);

async function initDatabase(db: SQLiteDatabase) {
  await migrate(db);
  applyThemePreference(await getThemePreference(db));
  await applyLanguagePreference(db);
  // files-then-rows: the sweep runs BEFORE the OCR queue starts (SPEC §4.1)
  await sweepFiles(db).catch(() => undefined);
  // deleted cards whose undo window is over are removed for good (rows, then files) — now and on every return (M1)
  await purgeExpired(db).catch(() => undefined);
  AppState.addEventListener('change', (s) => s === 'active' && purgeExpired(db).catch(() => undefined));
  startOcrQueue(db);
  // follow-up reminders: reconciled now, after every card change and on every return to the foreground (D48)
  startReminders(db);
}

export default function RootLayout() {
  return (
    <DatabaseProvider onInit={initDatabase}>
      <Navigator />
    </DatabaseProvider>
  );
}

/** U9: tapping a follow-up notification opens its card (also when the tap started the app). */
function useNotificationLinks() {
  const router = useRouter();
  useEffect(() => {
    const open = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/card/')) router.push(url as `/card/${string}`);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) open(last.notification);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, [router]);
}

// D24: header, back button and screen backgrounds follow the brand tokens instead of React Navigation's iOS blue.
function navigationTheme(dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  const c = Colors[dark ? 'dark' : 'light'];
  const font = (f: Theme['fonts']['regular']) => ({ ...f, fontFamily: BrandFonts.body });
  return {
    ...base,
    colors: { ...base.colors, primary: c.tintText, background: c.background, card: c.background, text: c.text, border: c.border },
    fonts: { regular: font(base.fonts.regular), medium: font(base.fonts.medium), bold: font(base.fonts.bold), heavy: font(base.fonts.heavy) },
  };
}
const NAV_THEMES = { light: navigationTheme(false), dark: navigationTheme(true) };

function Navigator() {
  const scheme = useColorScheme();
  const t = useT();
  useNotificationLinks();
  return (
    <ThemeProvider value={NAV_THEMES[scheme === 'dark' ? 'dark' : 'light']}>
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: BrandFonts.title } }}>
        <Stack.Screen name="index" options={{ title: t('home.title') }} />
        <Stack.Screen name="review/[id]" options={{ title: t('review.title') }} />
        <Stack.Screen name="card/[id]" options={{ title: t('card.title') }} />
        <Stack.Screen name="export" options={{ title: t('export.title'), presentation: 'modal' }} />
        <Stack.Screen name="my-card" options={{ title: t('myCard.title') }} />
        <Stack.Screen name="paste" options={{ title: t('paste.title') }} />
        <Stack.Screen name="new" options={{ title: t('home.add.manual') }} />
        <Stack.Screen name="events" options={{ title: t('events.title') }} />
        <Stack.Screen name="bulk-contacts" options={{ title: t('bulk.title') }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      </Stack>
    </ThemeProvider>
  );
}
