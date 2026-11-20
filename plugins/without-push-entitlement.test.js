// Release hygiene: the production iOS build carries no push entitlement and declares no non-exempt encryption.
const withoutPushEntitlement = require('./without-push-entitlement.js');

test('aps-environment is removed from the entitlements, other keys stay', async () => {
  const cfg = withoutPushEntitlement({ name: 'x', slug: 'x' });
  const r = await cfg.mods.ios.entitlements({
    modResults: { 'aps-environment': 'development', 'com.example.keep': ['a'] },
    modRequest: { platform: 'ios' },
    modRawConfig: {},
  });
  expect(r.modResults).toEqual({ 'com.example.keep': ['a'] });
});

test.each(['development', 'preview', 'production'])('%s config: plugin registered, ITSAppUsesNonExemptEncryption false', (variant) => {
  const before = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    let cfg;
    jest.isolateModules(() => {
      const load = require('../app.config.ts');
      cfg = (load.default ?? load)({ config: {} });
    });
    expect(cfg.plugins).toContain('./plugins/without-push-entitlement.js');
    // mods run last-registered-first: it must be listed before expo-notifications to run after it (prebuild-verified).
    expect(cfg.plugins.indexOf('./plugins/without-push-entitlement.js')).toBeLessThan(cfg.plugins.indexOf('expo-notifications'));
    expect(cfg.ios.config.usesNonExemptEncryption).toBe(false);
  } finally {
    if (before === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = before;
  }
});
