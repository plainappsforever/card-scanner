// RELEASE_KIT Appendix C (P9): every ```store <lang> <limit> block of docs/RELEASE_KIT.md fits its store limit and uses
// none of the words the app's own strings may not use (SPEC §2 / src/lib/wording.ts: AI, percentages, accuracy,
// guarantees, perfection) — the store text makes the same honest promises as the UI.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bannedIn } from '@/lib/wording';

const KIT_PATH = join(__dirname, '../docs/RELEASE_KIT.md');
const kit = existsSync(KIT_PATH) ? readFileSync(KIT_PATH, 'utf8') : '';
const blocks = [...kit.matchAll(/```store (\w+(?:-\w+)?) (\d+)\n([\s\S]*?)\n```/g)].map((m, i) => ({ i, lang: m[1], limit: Number(m[2]), text: m[3] }));

(kit ? describe : describe.skip)('store texts in docs/RELEASE_KIT.md', () => {
  it('has the EN and DE listings for both stores (name, short/subtitle, description, promotional/keywords)', () => {
    expect(blocks.filter((b) => b.lang === 'en').length).toBeGreaterThanOrEqual(6);
    expect(blocks.filter((b) => b.lang === 'de').length).toBeGreaterThanOrEqual(6);
  });

  it.each(blocks.map((b) => [b.i, b.lang, b.limit, b] as const))('block %i (%s, ≤ %i characters) fits and uses no banned word', (_i, _lang, limit, b) => {
    expect([...b.text].length).toBeLessThanOrEqual(limit);
    expect(bannedIn(b.text)).toEqual([]);
  });
});
