// Metro plugin (P8, D49): development-only routes and files never reach a preview/production bundle.
// `src/app/debug/` (seed + self-test routes), `src/dev/` (seed image table) and `assets/dev-seed/` (≈ 4 MB of O3 card
// renders) are put on Metro's blockList for every variant except development, so Expo Router's route scan
// (require.context) never sees them and their images are not bundled. The routes also check the variant at runtime
// (belt and braces). `artifacts/` (Maestro screenshots/logs) is blocked in every variant: a file written there mid-flow
// must not make Metro reload the app (eye-app finding). Used by metro.config.js; tested in test/release-config.test.ts.
const path = require('node:path');

/** Folders that exist for development only (relative to the project root). */
const DEV_ONLY = ['src/app/debug', 'src/dev', 'assets/dev-seed'];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const folderPattern = (root, dir) => new RegExp(`^${escape(path.join(root, dir))}(?:[/\\\\].*)?$`);

/** Metro blockList patterns for a variant. */
function blockPatterns(root, variant) {
  const always = [folderPattern(root, 'artifacts')];
  return variant === 'development' ? always : [...always, ...DEV_ONLY.map((d) => folderPattern(root, d))];
}

function withReleaseExclusions(config, { root, variant }) {
  const existing = config.resolver.blockList;
  const list = Array.isArray(existing) ? existing : existing ? [existing] : [];
  config.resolver.blockList = [...list, ...blockPatterns(root, variant)];
  return config;
}

module.exports = { DEV_ONLY, blockPatterns, withReleaseExclusions };
