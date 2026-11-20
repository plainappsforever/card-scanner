/**
 * @jest-environment node
 */
// Release config has no development routes (P8, D49): Metro's blockList for preview/production covers every file of
// the debug routes, the seed table and the seed images; development keeps them; no shipped file imports them (else a
// release bundle would fail or pull them back in); release variants also drop the development-client scheme residue.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..');
const { DEV_ONLY, blockPatterns } = require('../plugins/release-exclusions') as { DEV_ONLY: string[]; blockPatterns: (root: string, variant: string) => RegExp[] };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

function metroBlockList(variant: string): RegExp[] {
  const saved = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    let list: RegExp[] = [];
    jest.isolateModules(() => {
      const config = require('../metro.config.js');
      const b = config.resolver.blockList;
      list = Array.isArray(b) ? b : [b];
    });
    return list;
  } finally {
    process.env.APP_VARIANT = saved;
  }
}

const blocked = (list: RegExp[], file: string) => list.some((r) => r.test(file));
const devFiles = DEV_ONLY.flatMap((d) => files(join(root, d)));

describe('release config has no dev routes (D49)', () => {
  it('the dev-only folders exist and hold the debug routes and seed images', () => {
    const rel = devFiles.map((f) => relative(root, f));
    expect(rel).toEqual(expect.arrayContaining(['src/app/debug/seed.tsx', 'src/app/debug/self-test.tsx', 'src/dev/seed-assets.ts', 'assets/dev-seed/b1-de-01.jpg']));
  });

  it.each(['preview', 'production'])('%s: Metro blocks every dev-only file and no app file', (variant) => {
    const list = metroBlockList(variant);
    for (const f of devFiles) expect({ f: relative(root, f), blocked: blocked(list, f) }).toEqual({ f: relative(root, f), blocked: true });
    for (const f of ['src/app/index.tsx', 'src/app/settings.tsx', 'src/app/debugger-note.tsx', 'src/devices.ts', 'assets/images/icon.png', 'node_modules/expo-router/entry.js']) {
      expect({ f, blocked: blocked(list, join(root, f)) }).toEqual({ f, blocked: false });
    }
    expect(blocked(list, join(root, 'artifacts/maestro/x/screenshot.png'))).toBe(true);
  });

  it('development keeps the routes (Maestro seeds through them); artifacts/ is blocked there too', () => {
    const list = metroBlockList('development');
    for (const f of devFiles) expect(blocked(list, f)).toBe(false);
    expect(blocked(list, join(root, 'artifacts/maestro/run.log'))).toBe(true);
    expect(blockPatterns(root, 'development')).toHaveLength(1);
  });

  it('no file outside the dev-only folders imports them', () => {
    const shipped = [...files(join(root, 'src')), ...files(join(root, 'modules', 'card-kit')).filter((f) => f.endsWith('.ts'))].filter(
      (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !devFiles.includes(f)
    );
    const offenders = shipped.filter((f) => /from ['"](@\/dev\/|@\/app\/debug|\.\.?\/.*(dev-seed|\/debug\/))/.test(readFileSync(f, 'utf8')) || /require\(['"].*dev-seed/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });
});
