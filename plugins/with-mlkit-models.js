// ML Kit install-time model downloads (D13): Play services fetches the UNBUNDLED text-recognition models (Chinese,
// Devanagari, Japanese, Korean) when the app is installed, so they work offline afterwards. The value lives in the APP
// manifest with tools:replace because expo-dev-launcher (development builds only) declares the same meta-data key with
// "barcode_ui" and the manifest merger refuses two libraries' values (P6–P8 device phase, first Android build).
// Release builds have no dev launcher; development builds lose only the launcher's QR-model pre-download hint.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const KEY = 'com.google.mlkit.vision.DEPENDENCIES';
const VALUE = 'ocr_chinese,ocr_devanagari,ocr_japanese,ocr_korean';

module.exports = function withMlkitModels(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app['meta-data'] = (app['meta-data'] ?? []).filter((m) => m.$['android:name'] !== KEY);
    app['meta-data'].push({ $: { 'android:name': KEY, 'android:value': VALUE, 'tools:replace': 'android:value' } });
    return mod;
  });
};
