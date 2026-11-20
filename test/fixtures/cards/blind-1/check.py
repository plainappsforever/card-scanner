#!/usr/bin/env python3
"""Validate the blind business-card fixture set (see FORMAT.md).

Usage: python3 -I check.py [fixture-folder]   (default: the folder this file is in)

Checks per fixture:
  1. structure: required keys, line ids f<n>/b<n>, boxes inside 0..1, height == box.h, words join to the line text
  2. every ground-truth string (and every accepted alternative) is literally on the card: in one OCR line, in
     consecutive lines of the same side joined by " " / "" / with a line-end hyphen removed, in a QR payload, or in
     the pasted text; if the field has an ocr_damage entry, the damaged form must be on the card instead and must fold
     to the printed form under the declared damage kinds; fields listed in "composed" need each token on the card
  3. no field kind is both present and absent; present + absent = all 10 kinds
  4. phones: E.164 shape, national digits consistent with the printed digits (unless composed), valid type, ext printed
  5. two-sided groups: the combined fixture carries exactly the front and back lines of the side fixtures
  6. README.md has one line per fixture
Exit code 0 = all fixtures valid.
"""
import json, os, re, sys, unicodedata

KINDS = ['name', 'otherName', 'company', 'department', 'title', 'phones', 'emails', 'urls', 'socials', 'addresses']
PHONE_TYPES = {'mobile', 'work', 'fax', 'home', 'other'}
DAMAGE_KINDS = {'0/O', '1/l', '5/S', '8/B', 'rn/m', 'dropped-space', 'spaced-at', 'diacritic-lost', 'merged-line', 'stray-symbol'}
CC = ['1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
      '51', '52', '54', '55', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '352',
      '353', '420', '852', '853', '886', '966', '971', '972']
SOCIAL = {'linkedin', 'xing', 'x', 'twitter', 'instagram', 'facebook', 'github', 'youtube', 'tiktok', 'wechat', 'line', 'other'}


def strip_marks(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


def fold(s, kinds):
    if 'diacritic-lost' in kinds:
        s = strip_marks(s)
    if 'spaced-at' in kinds:
        s = s.replace(' @ ', '@').replace(' . ', '.')
    if 'rn/m' in kinds:
        s = s.replace('rn', 'm')
    table = {}
    if '0/O' in kinds:
        table.update({'O': '0', 'o': '0'})
    if '1/l' in kinds:
        table.update({'l': '1', 'I': '1', '|': '1'})
    if '5/S' in kinds:
        table.update({'S': '5', 's': '5'})
    if '8/B' in kinds:
        table.update({'B': '8'})
    s = ''.join(table.get(c, c) for c in s)
    if 'dropped-space' in kinds:
        s = s.replace(' ', '')
    return s


class Card:
    def __init__(self, fx):
        self.fx = fx
        inp = fx['input']
        self.sides = []
        for key in ('front', 'back'):
            if key in inp:
                self.sides.append([ln['text'] for ln in inp[key]['lines']])
        if 'text' in inp:
            self.sides.append(inp['text'].split('\n'))
        self.qr = [q['text'] for q in inp.get('qr', [])]

    def find(self, s):
        """Return how s occurs on the card, or None."""
        if not s:
            return None
        for side in self.sides:
            for t in side:
                if s in t:
                    return 'line'
        for q in self.qr:
            if s in q:
                return 'qr'
        for side in self.sides:
            for i in range(len(side)):
                for j in range(i + 2, min(len(side), i + 4) + 1):
                    seg = side[i:j]
                    joins = [' '.join(seg), ''.join(seg),
                             ''.join(t[:-1] if t.endswith('-') and k < len(seg) - 1 else t for k, t in enumerate(seg))]
                    for jt in joins:
                        if s in jt:
                            return 'joined'
        return None

    def all_text(self):
        return '\n'.join('\n'.join(s) for s in self.sides) + '\n' + '\n'.join(self.qr)


def values(truth):
    """Yield (path, string) for every printed ground-truth string."""
    n = truth.get('name')
    if n:
        for k in ('prefix', 'given', 'middle', 'family', 'suffix', 'full'):
            if n.get(k):
                yield f'name.{k}', n[k]
    for k in ('otherName', 'company', 'department', 'title'):
        if truth.get(k):
            yield k, truth[k]
    for i, p in enumerate(truth.get('phones', [])):
        yield f'phones[{i}].printed', p['printed']
        if p.get('label'):
            yield f'phones[{i}].label', p['label']
    for i, e in enumerate(truth.get('emails', [])):
        yield f'emails[{i}]', e
    for i, u in enumerate(truth.get('urls', [])):
        yield f'urls[{i}]', u
    for i, s in enumerate(truth.get('socials', [])):
        yield f'socials[{i}].value', s['value']
    for i, a in enumerate(truth.get('addresses', [])):
        for k in ('street', 'extra', 'pobox', 'postcode', 'city', 'region', 'country'):
            if a.get(k):
                yield f'addresses[{i}].{k}', a[k]


def check_fixture(fx, errors, stats):
    cid = fx.get('id', '?')
    def err(msg):
        errors.append(f'{cid}: {msg}')
    for k in ('id', 'group', 'side', 'card_langs', 'card_country', 'layout', 'input', 'truth', 'absent', 'accept',
              'composed', 'ocr_damage', 'traps', 'notes'):
        if k not in fx:
            err(f'missing key {k}')
    inp, truth = fx['input'], fx['truth']
    if 'region' not in inp or 'uiLang' not in inp:
        err('input needs region and uiLang')
    if fx['layout'] == 'text':
        if not isinstance(inp.get('text'), str):
            err('paste fixture without input.text')
    else:
        if 'front' not in inp:
            err('no input.front')
    for key, pre in (('front', 'f'), ('back', 'b')):
        if key not in inp:
            continue
        side = inp[key]
        if side.get('engine') not in ('vision', 'mlkit') or not side.get('langs'):
            err(f'{key}: engine/langs missing')
        for idx, ln in enumerate(side['lines']):
            if ln['id'] != f'{pre}{idx}':
                err(f'{key}: line id {ln["id"]} != {pre}{idx}')
            b = ln['box']
            if not (0 <= b['x'] <= 1 and 0 <= b['y'] <= 1 and b['w'] > 0 and b['h'] > 0
                    and b['x'] + b['w'] <= 1.0001 and b['y'] + b['h'] <= 1.0001):
                err(f'{ln["id"]}: box outside the card {b}')
            if abs(ln['height'] - b['h']) > 1e-6:
                err(f'{ln["id"]}: height != box.h')
            if ' '.join(w['text'] for w in ln['words']) != ' '.join(t for t in ln['text'].split(' ') if t):
                err(f'{ln["id"]}: words do not join to the line text')
            if ln.get('dir') not in ('ltr', 'rtl'):
                err(f'{ln["id"]}: dir')
    for q in inp.get('qr', []):
        if q.get('format') != 'qr' or not q.get('text'):
            err('qr entry needs format=qr and text')

    card = Card(fx)
    damage = {}
    for d in fx['ocr_damage']:
        bad = set(d['kinds']) - DAMAGE_KINDS
        if bad:
            err(f'unknown damage kinds {bad}')
        if d['printed'] == d['ocr']:
            err(f'damage {d["path"]}: printed == ocr')
        if not card.find(d['ocr']):
            err(f'damage {d["path"]}: OCR form {d["ocr"]!r} not on the card')
        if 'merged-line' in d['kinds']:
            ok = d['printed'] in d['ocr']
        elif 'stray-symbol' in d['kinds']:
            ok = bool(d.get('stray')) and d['ocr'].replace(d['stray'], '', 1) == d['printed']
        else:
            ok = fold(d['printed'], d['kinds']) == fold(d['ocr'], d['kinds'])
        if not ok:
            err(f'damage {d["path"]}: {d["printed"]!r} vs {d["ocr"]!r} not explained by {d["kinds"]}')
        if d['path'] != 'text':
            damage[d['path']] = d
        stats['damage'] += 1

    composed = set(fx['composed'])
    def check_value(path, v):
        stats['values'] += 1
        if path in damage:
            d = damage[path]
            if d['printed'] != v:
                err(f'{path}: damage entry printed {d["printed"]!r} != truth {v!r}')
            stats['damaged'] += 1
            return
        if path in composed:
            flat = re.sub(r'\s+', '', card.all_text()).casefold()
            missing = [t for t in v.split() if t.casefold() not in flat]
            if missing:
                err(f'{path}: composed value {v!r}, tokens not on card: {missing}')
            stats['composed'] += 1
            return
        how = card.find(v)
        if not how:
            err(f'{path}: {v!r} not on the card')
        else:
            stats[how] += 1

    for path, v in values(truth):
        check_value(path, v)
    for path, alts in fx['accept'].items():
        base = path.split('[')[0].split('.')[0]
        if base not in KINDS:
            err(f'accept path {path} unknown')
        for a in alts:
            check_value(f'accept:{path}', a)
    for path in composed:
        if path in damage:
            err(f'{path}: both composed and damaged')

    # present / absent
    present = [k for k in KINDS if truth.get(k)]
    both = set(present) & set(fx['absent'])
    if both:
        err(f'present and absent: {sorted(both)}')
    if set(present) | set(fx['absent']) != set(KINDS):
        err(f'present+absent do not cover all kinds: missing {set(KINDS) - set(present) - set(fx["absent"])}')
    for k in fx['absent']:
        if k not in KINDS:
            err(f'unknown absent kind {k}')
    n = truth.get('name')
    if n and not (n.get('given') or n.get('family')):
        err('name without given/family')

    # phones
    for i, p in enumerate(truth.get('phones', [])):
        e = p['e164']
        if not re.fullmatch(r'\+\d{8,15}', e):
            err(f'phones[{i}]: bad E.164 {e}')
        if p['type'] not in PHONE_TYPES:
            err(f'phones[{i}]: type {p["type"]}')
        for t in p.get('type_accept', []):
            if t not in PHONE_TYPES:
                err(f'phones[{i}]: type_accept {t}')
        printed = p['printed']
        if p.get('ext'):
            if p['ext'] not in printed:
                err(f'phones[{i}]: ext {p["ext"]} not in printed')
            printed = printed[:printed.rfind(p['ext'])]
        if not p.get('composed'):
            digits = re.sub(r'\D', '', printed)
            cc = next((c for c in sorted(CC, key=len, reverse=True) if e[1:].startswith(c)), None)
            if not cc:
                err(f'phones[{i}]: unknown country code in {e}')
            elif not digits.endswith(e[1 + len(cc):]):
                err(f'phones[{i}]: printed digits {digits} do not end with national number {e[1 + len(cc):]}')
    for i, s in enumerate(truth.get('socials', [])):
        if s['service'] not in SOCIAL:
            err(f'socials[{i}]: service {s["service"]}')
    for i, a in enumerate(truth.get('addresses', [])):
        if not a.get('countryCode'):
            err(f'addresses[{i}]: countryCode missing')
        if not (a.get('street') or a.get('pobox') or a.get('city')):
            err(f'addresses[{i}]: empty')


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    cdir = os.path.join(root, 'cards')
    files = sorted(f for f in os.listdir(cdir) if f.endswith('.json'))
    errors = []
    stats = dict(values=0, line=0, joined=0, qr=0, damaged=0, composed=0, damage=0)
    fixtures = []
    for f in files:
        with open(os.path.join(cdir, f), encoding='utf-8') as fh:
            fx = json.load(fh)
        if fx['id'] + '.json' != f:
            errors.append(f'{f}: id {fx["id"]} does not match file name')
        fixtures.append(fx)
        check_fixture(fx, errors, stats)

    # two-sided groups
    groups = {}
    for fx in fixtures:
        if fx['group']:
            groups.setdefault(fx['group'], {})[fx['side']] = fx
    for g, m in groups.items():
        if set(m) != {'front', 'back', 'both'}:
            errors.append(f'group {g}: sides {sorted(m)}')
            continue
        txt = lambda fx, k: [ln['text'] for ln in fx['input'][k]['lines']]
        if txt(m['both'], 'front') != txt(m['front'], 'front') or txt(m['both'], 'back') != txt(m['back'], 'front'):
            errors.append(f'group {g}: combined fixture lines differ from the side fixtures')

    # README coverage
    readme = open(os.path.join(root, 'README.md'), encoding='utf-8').read()
    for fx in fixtures:
        if not re.search(r'^\| `' + re.escape(fx['id']) + r'` \|', readme, re.M):
            errors.append(f'README.md: no line for {fx["id"]}')

    cards = len({fx['group'] or fx['id'] for fx in fixtures})
    absent_core = [fx['id'] for fx in fixtures if set(fx['absent']) & {'name', 'company', 'phones', 'emails', 'addresses'}]
    print(f'fixtures: {len(fixtures)}  physical cards: {cards}  two-sided groups: {len(groups)}')
    print(f'ground-truth strings checked: {stats["values"]} (single line {stats["line"]}, joined lines {stats["joined"]}, '
          f'QR payload {stats["qr"]}, via documented OCR damage {stats["damaged"]}, composed {stats["composed"]})')
    print(f'ocr_damage entries: {stats["damage"]}; fixtures with OCR damage: '
          f'{sum(1 for fx in fixtures if fx["ocr_damage"])}')
    print(f'fixtures with a core field absent (name/company/phones/emails/addresses): {len(absent_core)}')
    if errors:
        print(f'\n{len(errors)} ERRORS')
        for e in errors:
            print('  ' + e)
        sys.exit(1)
    print('OK: all fixtures valid')


if __name__ == '__main__':
    main()
