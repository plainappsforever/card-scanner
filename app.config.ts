import type { ConfigContext, ExpoConfig } from 'expo/config';

import brand from './src/constants/brand.json';

// Identity (D24): splash and Android icon background come from the brand tokens.
const IDENTITY = { splashLight: brand.light.background, splashDark: brand.dark.background, iconBackground: brand.light.accent };

// One codebase, three installable variants that can sit side by side on a device.
// Select with APP_VARIANT (set by scripts/native.sh and eas.json).
// Reverse-domain prefix of the bundle id / applicationId (owner, 2026-10-16: same scheme for every app; D10).
// Never put a personal name into an identifier.
const ID_PREFIX = 'com.plainapps';
// PROVISIONAL product name (D10: "Cardkeep" is taken on both stores; the owner picks Plaincard / Cardloft / Cardleaf
// before the first device build). Also in src/constants/app.ts (APP_NAME) for the UI; change both together.
const APP_NAME = 'Cardkeep';
const APP_ID = 'cardkeep';
const VARIANTS = {
  development: { name: `${APP_NAME} Dev`, id: `${ID_PREFIX}.${APP_ID}.dev`, scheme: `${APP_ID}-dev` },
  preview: { name: `${APP_NAME} Preview`, id: `${ID_PREFIX}.${APP_ID}.preview`, scheme: `${APP_ID}-preview` },
  production: { name: APP_NAME, id: `${ID_PREFIX}.${APP_ID}`, scheme: APP_ID },
} as const;

type Variant = keyof typeof VARIANTS;

const variant = (process.env.APP_VARIANT ?? 'development') as Variant;
if (!(variant in VARIANTS)) {
  throw new Error(`Unknown APP_VARIANT "${variant}". Use development, preview or production.`);
}
const { name, id, scheme } = VARIANTS[variant];
// APPLE_TEAM_ID (optional, not a secret) becomes ios.appleTeamId (DEVELOPMENT_TEAM in the generated project) for archives; loyalty-cards/interval-timer pattern.
const appleTeamId = process.env.APPLE_TEAM_ID || undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: 'card-scanner',
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: id,
    // 1.0.0 shipped as build 1; every upload needs a higher build number (redesign 1.1.0 = 2)
    buildNumber: '2',
    ...(appleTeamId ? { appleTeamId } : {}),
    // iPhone only in v1 (SPEC §3).
    supportsTablet: false,
    infoPlist: {
      // VisionKit's document camera and the fallback camera; asked only when the user taps Scan (A3, SPEC §10).
      NSCameraUsageDescription: `${APP_NAME} uses the camera to photograph business cards. The photos stay on this iPhone.`,
    },
    icon: './assets/expo.icon',
    // Export compliance (docs-export-compliance-2026-11-06, card-scanner row): no encryption of its own, nothing beyond the
    // system's, so App Store Connect must not ask on every upload.
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: id,
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: IDENTITY.iconBackground,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Owner decision (SPEC §10, D-notes): other people's cards are never copied to Google's cloud backup (REVIEW_V1 M2).
    allowBackup: false,
    // SPEC §10: no storage, overlay, vibration or network permission in release builds (library manifests re-add some).
    ...(variant === 'development'
      ? {}
      : {
          // P9: expo-notifications' Firebase push permission and 15 launcher-badge permissions go too (the app has no push and
          // sets no badge; mood-journal P11 pattern) — checked with `aapt dump permissions` on the preview APK (V1_LOG P9).
          blockedPermissions: [
            'android.permission.READ_EXTERNAL_STORAGE',
            'android.permission.WRITE_EXTERNAL_STORAGE',
            'android.permission.SYSTEM_ALERT_WINDOW',
            'android.permission.ACCESS_NETWORK_STATE',
            'android.permission.VIBRATE',
            'com.google.android.c2dm.permission.RECEIVE',
            'android.permission.READ_APP_BADGE',
            'com.sec.android.provider.badge.permission.READ',
            'com.sec.android.provider.badge.permission.WRITE',
            'com.htc.launcher.permission.READ_SETTINGS',
            'com.htc.launcher.permission.UPDATE_SHORTCUT',
            'com.sonyericsson.home.permission.BROADCAST_BADGE',
            'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
            'com.anddoes.launcher.permission.UPDATE_COUNT',
            'com.majeur.launcher.permission.UPDATE_BADGE',
            'com.huawei.android.launcher.permission.CHANGE_BADGE',
            'com.huawei.android.launcher.permission.READ_SETTINGS',
            'com.huawei.android.launcher.permission.WRITE_SETTINGS',
            'com.oppo.launcher.permission.READ_SETTINGS',
            'com.oppo.launcher.permission.WRITE_SETTINGS',
            'me.everything.badger.permission.BADGE_COUNT_READ',
            'me.everything.badger.permission.BADGE_COUNT_WRITE',
          ],
        }),
  },
  plugins: [
    // Only this variant's URL scheme; release variants also lose the development-client residue. FIRST, so its mods
    // run after the others' (Offscan/print-cost port).
    ['./plugins/without-dev-client-residue.js', { keep: scheme, release: variant !== 'development' }],
    // No push entitlement: expo-notifications writes aps-environment for iOS although the app only schedules local
    // reminders. Listed EARLY (mods run last-registered-first), so this one runs after the library's; pinned by
    // plugins/without-push-entitlement.test.js (loyalty-cards/interval-timer pattern).
    './plugins/without-push-entitlement.js',
    'expo-router',
    ['expo-splash-screen', { backgroundColor: IDENTITY.splashLight, dark: { backgroundColor: IDENTITY.splashDark }, image: './assets/images/splash-icon.png', imageWidth: 76 }],
    'expo-sqlite',
    'expo-notifications',
    // No push: Firebase's messaging service/receiver/provider and the install-referrer permission leave the manifest (P9).
    './plugins/without-firebase-push.js',
    // P8: the UI languages are declared as the app's localizations (CFBundleLocalizations), so iOS and the App Store list
    // them and system sheets follow the phone's language. Arabic is NOT declared (print-cost D90: declaring it made iOS
    // mirror every screen; the screens were never reviewed right-to-left) — the resolver still shows Arabic text. iOS only:
    // on Android the plugin would also strip library resources to these languages (resConfigs).
    [
      'expo-localization',
      {
        supportedLocales: { ios: ['en', 'de', 'es', 'pt-BR', 'fr', 'it', 'tr', 'ru', 'id', 'hi', 'ja', 'zh-Hans', 'ko', 'vi'] },
        supportsRTL: false,
      },
    ],
    // Dev builds reopen the last Metro server directly, so Maestro can launch them unattended.
    ['expo-dev-client', { launchMode: 'most-recent' }],
    './plugins/with-dev-menu-defaults.js',
    './plugins/with-mlkit-models.js',
    // No INTERNET in preview/production (dev builds need it for Metro).
    ['./plugins/with-no-internet.js', { release: variant !== 'development' }],
    // Photo import through the system picker (no photo-library permission); the camera only for the fallback capture.
    [
      'expo-image-picker',
      {
        photosPermission: false,
        cameraPermission: `${APP_NAME} uses the camera to photograph business cards. The photos stay on this iPhone.`,
        microphonePermission: false,
      },
    ],
    // One card = the system "new contact" form, no permission (D12). The permission is asked only for bulk save and the
    // duplicate check, after our explanation (SPEC §10 text).
    [
      'expo-contacts',
      {
        contactsPermission: `Only when you add several cards at once, add a card to a contact you already have, or look for people already in your contacts: ${APP_NAME} adds only what you choose and compares names, phone numbers and e-mail addresses on this iPhone. Nothing is uploaded.`,
      },
    ],
    // Xcode 27 / iOS 27 SDK: apps without the UIScene lifecycle trap at launch. SDK 57 opt-in (expo >= 57.0.23,
    // expo-build-properties >= 57.0.20); SDK 58+ has it by default, then remove this line. See docs/DECISIONS.md D9.
    ['expo-build-properties', { ios: { enableSceneSupport: true } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appVariant: variant,
  },
});
