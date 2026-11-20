#!/usr/bin/env node
// O3 real-OCR set (SPEC §13 O3, A6) — device-free, on this Mac.
//   node --import ./scripts/node/ts-hooks.mjs scripts/o3/o3.mjs prepare   → artifacts/o3/jobs.json
//   swift scripts/o3/render-ocr.swift artifacts/o3/jobs.json artifacts/o3   → images + raw Vision JSON
//   node --import ./scripts/node/ts-hooks.mjs scripts/o3/o3.mjs build     → test/fixtures/cards/vision-1/b{1,2,3}/
//   node --import ./scripts/node/ts-hooks.mjs scripts/o3/o3.mjs score [--misses]   → one combined table
// The card TEXT comes from the blind sets B1–B3 (written by separate agents): every line is drawn at its fixture box with
// the documented OCR damage REVERSED (the printed string), so the damage in the result is what macOS Vision really
// produced. Truth, absent, accept, composed and traps are copied unchanged; `input` is replaced by the normalised Vision
// result (src/engine/ocr.ts normalizeOcr, unchanged) and `qr` by the codes Vision decoded from the drawn QR image.
// Style per image (font, colours, size jitter, rotation, noise, blur) is derived from a hash of the image name, so a
// rerun produces the same images. Not blind: B1–B3 are tuning sets (L27 rule 4) — O3 measures real OCR, not layouts.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { normalizeOcr } from '../../src/engine/ocr.ts';

const root = path.resolve(import.meta.dirname, '../..');
const art = path.join(root, 'artifacts/o3');
const fixRoot = path.join(root, 'test/fixtures/cards');
const outRoot = path.join(fixRoot, 'vision-1');
const SETS = ['blind-1', 'blind-2', 'blind-3'];
const short = (set) => set.replace('blind-', 'b');

const FONTS = ['HelveticaNeue', 'AvenirNext-Regular', 'Georgia', 'TimesNewRomanPSMT', 'Futura-Medium', 'GillSans', 'Optima-Regular', 'Palatino-Roman', 'Baskerville', 'Didot', 'ArialMT', 'Verdana', 'TrebuchetMS', 'AmericanTypewriter', 'HoeflerText-Regular', 'Menlo-Regular'];
const STYLES = [
  { bg: [1, 1, 1], fg: [0.05, 0.05, 0.05] },
  { bg: [0.98, 0.96, 0.9], fg: [0.2, 0.2, 0.2] },
  { bg: [0.94, 0.94, 0.94], fg: [0.1, 0.2, 0.45] },
  { bg: [0.92, 0.95, 0.99], fg: [0.05, 0.1, 0.3] },
  { bg: [1, 1, 1], fg: [0.5, 0.1, 0.1] },
  { bg: [0.1, 0.14, 0.25], fg: [0.95, 0.95, 0.95] },
  { bg: [0.15, 0.15, 0.15], fg: [0.85, 0.75, 0.45] },
  { bg: [0.82, 0.72, 0.56], fg: [0.2, 0.12, 0.05] },
  { bg: [1, 1, 1], fg: [0.1, 0.35, 0.2] },
];
const ICON = { '& ': '☎ ', '@ ': '✉ ', 'M ': '✉ ', 'Q ': '⌂ ', '6 ': '⌂ ', '9 ': '⌂ ' };
const VISION = { 'vi-VN': 'vi-VT', 'es-MX': 'es-ES', latin: null, chinese: 'zh-Hans', japanese: 'ja-JP', korean: 'ko-KR', devanagari: 'hi-IN' };
const CARD_LANG = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-BR', nl: 'nl-NL', pl: 'pl-PL', tr: 'tr-TR', sv: 'sv-SE', da: 'da-DK', nb: 'nb-NO', no: 'nb-NO', cs: 'cs-CZ', ru: 'ru-RU', id: 'id-ID', vi: 'vi-VT', ar: 'ar-SA', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-Hans', 'zh-Hant': 'zh-Hant', hi: 'hi-IN' };

const hash = (s) => createHash('sha256').update(s).digest();
const pick = (arr, h, i) => arr[h[i] % arr.length];
const unit = (h, i) => h.readUInt16BE(i) / 65535;

function load(set) {
  const dir = path.join(fixRoot, set, 'cards');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

/** Lines as PRINTED: documented damage reversed; merged two-column lines split at a run of ≥ 3 spaces. */
function printedLines(fx, side) {
  const lines = fx.input[side].lines.map((l) => ({ ...l, text: l.text }));
  for (const d of fx.ocr_damage ?? []) {
    if (d.kinds.includes('merged-line') || d.ocr === d.printed) continue;
    const l = lines.find((x) => x.text.includes(d.ocr));
    if (!l) continue;
    let printed = d.printed;
    if (d.kinds.includes('stray-symbol') && d.stray) printed = (ICON[d.stray] ?? '• ') + printed;
    l.text = l.text.replace(d.ocr, printed);
  }
  const out = [];
  for (const l of lines) {
    const parts = l.text.split(/ {3,}/);
    if (parts.length === 1 || !l.box) {
      out.push(l);
      continue;
    }
    const total = parts.reduce((n, p) => n + p.length, 0) + 3 * (parts.length - 1);
    let x = l.box.x;
    for (const p of parts) {
      const w = (l.box.w * p.length) / total;
      out.push({ ...l, text: p, box: { ...l.box, x, w } });
      x += w + (l.box.w * 3) / total;
    }
  }
  return out;
}

function langsOf(fx, side) {
  const want = [];
  for (const l of fx.input[side].langs) {
    const v = l in VISION ? VISION[l] : l;
    if (v) want.push(v);
    else for (const c of fx.card_langs) if (CARD_LANG[c]) want.push(CARD_LANG[c]);
  }
  if (!want.includes('en-US')) want.push('en-US');
  return [...new Set(want)];
}

/** One image per printed side: the side fixture (`-front` / `-back`) if present, else `-both`, else the single card. */
function images() {
  const out = [];
  for (const set of SETS) {
    const fixtures = load(set).filter((f) => f.layout !== 'text');
    const byId = new Map(fixtures.map((f) => [f.id, f]));
    for (const fx of fixtures) {
      if (fx.side === 'single') out.push({ set, name: `${short(set)}-${fx.id}`, fx, side: 'front' });
      if (fx.side === 'front' || fx.side === 'back') out.push({ set, name: `${short(set)}-${fx.group}-${fx.side}`, fx, side: 'front' });
      if (fx.side === 'both') {
        if (!byId.has(`${fx.group}-front`)) out.push({ set, name: `${short(set)}-${fx.group}-front`, fx, side: 'front' });
        if (!byId.has(`${fx.group}-back`)) out.push({ set, name: `${short(set)}-${fx.group}-back`, fx, side: 'back' });
      }
    }
  }
  return out;
}

function prepare() {
  const jobs = images().map(({ name, fx, side }) => {
    const h = hash(name);
    const style = pick(STYLES, h, 1);
    const lines = printedLines(fx, side).filter((l) => l.box);
    const maxH = Math.max(...lines.map((l) => l.box.h));
    const sorted = lines.map((l) => l.box.h).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? maxH;
    const portrait = fx.layout === 'portrait';
    const codes = (fx.input.qr ?? []).filter((q) => (q.side ?? 'front') === (side === 'front' && fx.side === 'back' ? 'back' : side) && q.box);
    return {
      name,
      width: portrait ? 1035 : 1600,
      height: portrait ? 1600 : 1035,
      lines: lines.map((l) => ({ text: l.text, x: l.box.x, y: l.box.y, w: l.box.w, h: l.box.h, bold: l.box.h === maxH && maxH >= 1.2 * median, rtl: l.dir === 'rtl' })),
      codes: codes.map((q) => ({ text: q.text, ...q.box })),
      langs: langsOf(fx, side),
      font: pick(FONTS, h, 0),
      bg: style.bg,
      fg: style.fg,
      rotation: (unit(h, 2) - 0.5) * 4,
      noise: Math.round(unit(h, 4) * 14),
      blur: [0, 0, 0, 0.6, 1.0, 1.4][h[6] % 6],
      sizeJitter: 0.1,
      seed: h.readUInt32BE(8),
    };
  });
  fs.mkdirSync(art, { recursive: true });
  fs.writeFileSync(path.join(art, 'jobs.json'), JSON.stringify(jobs, null, 1));
  console.log(`${jobs.length} images → artifacts/o3/jobs.json`);
}

function rawSide(name, prefix) {
  const raw = JSON.parse(fs.readFileSync(path.join(art, 'raw', `${name}.json`), 'utf8'));
  const n = normalizeOcr(raw.vision, prefix);
  return { side: { engine: 'vision', langs: n.langs, lines: n.lines }, codes: raw.codes, ms: raw.ms, dropped: raw.dropped };
}

function build() {
  const jobs = new Map(JSON.parse(fs.readFileSync(path.join(art, 'jobs.json'), 'utf8')).map((j) => [j.name, j]));
  let n = 0;
  for (const set of SETS) {
    const dir = path.join(outRoot, short(set), 'cards');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(fixRoot, set, 'FORMAT.md'), path.join(outRoot, short(set), 'FORMAT.md'));
    for (const fx of load(set).filter((f) => f.layout !== 'text')) {
      const sides = fx.side === 'single' ? [[`${short(set)}-${fx.id}`, 'front', 'f']] : fx.side === 'both' ? [[`${short(set)}-${fx.group}-front`, 'front', 'f'], [`${short(set)}-${fx.group}-back`, 'back', 'b']] : [[`${short(set)}-${fx.group}-${fx.side}`, 'front', 'f']];
      const input = { region: fx.input.region, uiLang: fx.input.uiLang };
      const o3 = { source: `${set}/cards/${fx.id}.json`, images: [], qrExpected: (fx.input.qr ?? []).length, qrDecoded: 0 };
      const qr = [];
      for (const [name, key, prefix] of sides) {
        const r = rawSide(name, prefix);
        input[key] = r.side;
        const j = jobs.get(name);
        o3.images.push({ name, font: j.font, rotation: +j.rotation.toFixed(2), noise: j.noise, blur: j.blur, langs: j.langs, dropped: r.dropped, visionMs: r.ms });
        for (const c of r.codes) qr.push({ format: c.format, text: c.text, side: key });
      }
      if (qr.length) input.qr = qr;
      o3.qrDecoded = qr.length;
      const out = { ...fx, input, o3 };
      delete out.ocr_damage;
      fs.writeFileSync(path.join(dir, `${fx.id}.json`), JSON.stringify(out, null, 1));
      n++;
    }
  }
  console.log(`${n} fixtures → test/fixtures/cards/vision-1/b{1,2,3}/cards`);
}

async function score(showMisses) {
  const { loadBlind, runBlindSet, summaryLine, totals } = await import('../../test/blind-format.ts');
  const { formatScore } = await import('../../src/engine/extract/score.ts');
  const { EXTRACTOR_VERSION } = await import('../../src/engine/extract/index.ts');
  const all = [];
  for (const set of SETS) all.push(...loadBlind(path.join(outRoot, short(set)), (p) => fs.readFileSync(p, 'utf8'), (d) => fs.readdirSync(d), path.join));
  const run = runBlindSet(all);
  console.log(formatScore(run.overall, `O3 vision-1: ${run.overall.cards} fixtures (${new Set(all.flatMap((f) => f.o3.images.map((i) => i.name))).size} images, macOS Vision .accurate), extractor ${EXTRACTOR_VERSION}, ${run.ms.toFixed(0)} ms`));
  console.log(summaryLine('overall', run.overall));
  for (const set of SETS) {
    const sub = runBlindSet(all.filter((f) => f.o3.source.startsWith(set)));
    console.log(summaryLine(`from ${set}`, sub.overall));
  }
  console.log('\nby country group');
  for (const [k, s] of run.groups) console.log('  ' + summaryLine(k, s));
  console.log('\nby side');
  for (const [k, s] of run.sides) console.log('  ' + summaryLine(k, s));
  const t = totals(run.overall);
  console.log(`\nproduced ${t.produced}, confident wrong ${t.highWrong}, asked ${t.asked}`);
  const q = all.reduce((a, f) => [a[0] + f.o3.qrExpected, a[1] + f.o3.qrDecoded], [0, 0]);
  console.log(`QR codes drawn ${q[0]} (per fixture), decoded by Vision ${q[1]}`);
  if (showMisses) {
    console.log('\nmisses');
    for (const m of run.overall.misses) console.log(`  ${m.card} ${m.field}: want [${m.want.join(', ')}] got [${m.got.join(', ')}]${m.asked.length ? ` asked [${m.asked.join(', ')}]` : ''}`);
  }
}

const cmd = process.argv[2];
if (cmd === 'prepare') prepare();
else if (cmd === 'build') build();
else if (cmd === 'score') await score(process.argv.includes('--misses'));
else console.log('usage: o3.mjs prepare|build|score [--misses]');
