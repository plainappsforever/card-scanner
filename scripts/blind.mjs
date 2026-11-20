#!/usr/bin/env node
// Extractor accuracy on a card fixture folder (SPEC §13 scoring, src/engine/extract/score.ts): per field recall,
// precision, wrong, high-confidence wrong, low ("asked the user") and the A4 targets. Device-free (plain Node).
// Usage: npm run blind -- <folder|dev> [--misses]
//   dev = test/fixtures/cards/dev/ (the builder's DEVELOPMENT set — a tuning set, never evidence)
//   a folder with cards/*.json + FORMAT.md = a blind set written by a separate agent (adapter: test/blind-format.ts);
//   prints the overall table plus results by country group, theme (B3 ids), phone region, side and trap.
import fs from 'node:fs';
import path from 'node:path';

import { loadCards } from '../src/engine/extract/fixtures.ts';
import { formatScore, scoreCards } from '../src/engine/extract/score.ts';
import { EXTRACTOR_VERSION } from '../src/engine/extract/index.ts';
import { loadBlind, runBlindSet, summaryLine } from '../test/blind-format.ts';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const showMisses = args.includes('--misses');
const sets = args.filter((a) => !a.startsWith('--'));
for (const set of sets.length ? sets : ['dev']) {
  const dir = set === 'dev' ? path.join(root, 'test/fixtures/cards/dev') : path.resolve(set);
  if (fs.existsSync(path.join(dir, 'FORMAT.md')) && fs.existsSync(path.join(dir, 'cards'))) {
    blindSet(set, dir);
    continue;
  }
  const cards = loadCards(dir, (p) => fs.readFileSync(p, 'utf8'), (d) => fs.readdirSync(d), path.join);
  const t0 = performance.now();
  const score = scoreCards(cards);
  const ms = performance.now() - t0;
  console.log(formatScore(score, `${set}: ${score.cards} cards, extractor ${EXTRACTOR_VERSION}, ${ms.toFixed(0)} ms${set === 'dev' ? ' — DEVELOPMENT SET (tuning, not evidence)' : ''}`));
  if (showMisses) for (const m of score.misses) console.log(`  ${m.card} ${m.field}: want [${m.want.join(', ')}] got [${m.got.join(', ')}]${m.asked.length ? ` asked [${m.asked.join(', ')}]` : ''}`);
  console.log('');
}

function blindSet(set, dir) {
  const fixtures = loadBlind(dir, (p) => fs.readFileSync(p, 'utf8'), (d) => fs.readdirSync(d), path.join);
  const run = runBlindSet(fixtures);
  console.log(formatScore(run.overall, `${set}: ${run.overall.cards} fixtures (blind format), extractor ${EXTRACTOR_VERSION}, ${run.ms.toFixed(0)} ms`));
  console.log(summaryLine('overall', run.overall));
  console.log('\nby country group');
  for (const [k, s] of run.groups) console.log('  ' + summaryLine(k, s));
  if (run.themes.size) {
    console.log('\nby theme (id letter, B3 id scheme)');
    for (const [k, sc] of [...run.themes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) console.log('  ' + summaryLine(k, sc));
  }
  console.log('\nby phone region');
  for (const [k, s] of run.regions) console.log('  ' + summaryLine(k, s));
  console.log('\nby side');
  for (const [k, s] of run.sides) console.log('  ' + summaryLine(k, s));
  console.log('\nby trap (fixtures · fixtures without a miss · wrong · high-wrong · asked)');
  const traps = [...run.traps.entries()].sort((a, b) => a[1].clean / a[1].cards - b[1].clean / b[1].cards || b[1].cards - a[1].cards || a[0].localeCompare(b[0]));
  for (const [k, t] of traps) {
    const f = Object.values(t.score.fields);
    const sum = (key) => f.reduce((n, x) => n + x[key], 0);
    console.log(`  ${k.padEnd(34)} ${String(t.cards).padStart(3)} · ${String(t.clean).padStart(3)} clean · wrong ${sum('wrong')} · high-wrong ${sum('highWrong')} · asked ${sum('asked')}`);
  }
  console.log('\nby trap, per field (same order)');
  for (const [k, t] of traps) console.log('  ' + summaryLine(k, t.score));
  if (showMisses) {
    console.log('\nmisses');
    for (const m of run.overall.misses) console.log(`  ${m.card} ${m.field}: want [${m.want.join(', ')}] got [${m.got.join(', ')}]${m.asked.length ? ` asked [${m.asked.join(', ')}]` : ''}`);
  }
  console.log('');
}
