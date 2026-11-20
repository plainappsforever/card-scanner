// Default Expo Metro config + plugins/release-exclusions.js: in preview/production (APP_VARIANT, set by
// scripts/native.sh and eas.json) the development-only routes, seed table and seed images are not bundled (D49).
const { getDefaultConfig } = require('expo/metro-config');

const { withReleaseExclusions } = require('./plugins/release-exclusions');

module.exports = withReleaseExclusions(getDefaultConfig(__dirname), { root: __dirname, variant: process.env.APP_VARIANT ?? 'development' });
