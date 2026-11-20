# Fixture format

Written blind against card-scanner `docs/SPEC.md` §5.0 (OCR line model), §5.1 (extractor input/output) and §13 (scoring).
The author did not read the extractor source or the app's own fixtures. The builder maps the keys below to its own types; no
other key is needed.

## Folder
```
cards/<id>.json   one fixture per file (input + ground truth)
manifest.json     id, group, side, languages, country, layout, traps for every fixture
README.md         one line per fixture: what makes it hard
check.py          validator (python3 -I check.py)
```

## Fixture (`cards/<id>.json`)
| key | meaning |
|---|---|
| `id` | file name without `.json`. Prefix = card country/language (`de`, `at`, `ch`, `mx` = mixed DE/EN, `uk`, `us`, `fr`, `it`, `es`, `mex`, `pl`, `tr`, `nl`, `br`, `in`, `id`, `vn`, `ae`, `ru`, `jp`, `cn`, `hk`, `kr`, `sig` = pasted e-mail signature) |
| `group`, `side` | two-sided cards: `group` = base id, `side` = `front` / `back` / `both`. One-sided: `group: null`, `side: "single"` |
| `card_langs`, `card_country` | languages printed on the card; country of the card's address (ISO 3166 alpha-2) |
| `layout` | `landscape` (85×55), `portrait` (55×85) or `text` (paste input, no boxes) |
| `input` | extractor input, below |
| `truth` | ground truth, below |
| `absent` | field kinds that are NOT on the card. `truth` kinds with a value + `absent` = all 10 kinds, never both |
| `accept` | other answers that are also right: `{ "<path>": ["…"] }` (paths as in `ocr_damage`, e.g. `title`, `company`, `name.given`, `addresses[0].city`, `urls[0]`). Every accepted string is on the card too |
| `composed` | truth paths whose value is not printed as one string (e.g. letter-spaced logo "W E I N G U T" + "Rebholz-Achterberg" → company "Weingut Rebholz-Achterberg"); each token is on the card |
| `ocr_damage` | documented OCR errors (below) |
| `traps` | short tags (vocabulary in `manifest.json`; e.g. `ocr-0O`, `glued-label`, `name-split-lines`, `vat-id`, `two-sided`) |
| `notes` | what a correct extractor has to get right on this card |

### `input` (SPEC §5.1)
```json
{ "front": OcrLines, "back"?: OcrLines, "qr"?: [Code], "region": "DE", "uiLang": "de" }
{ "text": "…pasted text…", "region": "DE", "uiLang": "de" }          // layout "text" (Paste text, no boxes)
```
`OcrLines` (SPEC §5.0, upright card frame, all coordinates 0…1, origin top-left):
```json
{ "engine": "vision" | "mlkit", "langs": ["de-DE","en-US"],
  "lines": [ { "id": "f0", "text": "…", "box": {"x","y","w","h"}, "height": <box.h>,
               "words": [ { "text": "…", "box": {…} } ], "dir": "ltr" | "rtl", "conf"?: 1.0 | 0.5 } ] }
```
- Lines are in reading order; ids `f<n>` (front) / `b<n>` (back) are the line index.
- `conf` only on `vision` lines (1.0, or 0.5 on lines that carry documented damage); `mlkit` lines have no `conf`.
- Line text is exactly what the OCR "returned", damage included. Words are the line split at single spaces.
- **Side fixtures of two-sided cards:** `<id>-front` and `<id>-back` each hold ONE side under `input.front` (as when the user
  scans only that side); `<id>-both` holds the front under `front` (`f*`) and the back under `back` (`b*`), identical texts.
- `qr` entries are RAW decoded payloads as `detectBarcodes` returns them (SPEC §6.1): `{ "format": "qr", "text": "<payload>",
  "box": {…}, "side"?: "front"|"back" }`. The builder runs its own reader (§5.3) to get `ParsedCode`. Payloads: vCard 3.0
  (`de-11`), MECARD (`us-03`), URL (`de-12`).
- `region` = the user's `phone_region` setting; `uiLang` = UI language. Several cards deliberately have a region that
  differs from the card's country (German user scanning foreign cards).

### `truth` (SPEC §5.1 output model)
Every string is the **exact printed string** (as on the paper card, before OCR damage).
```json
{ "name": { "prefix","given","middle","family","suffix","full" } | null,   // "" for missing parts; full = printed name
  "otherName": "…" | null,           // name in a second script (N7)
  "company": "…" | null, "department": "…" | null, "title": "…" | null,
  "phones": [ { "printed": "0171 4 56 78 90", "e164": "+491714567890", "type": "mobile|work|fax|home|other",
                "label": "Mobil" | null, "ext": "312" | null, "composed"?: true, "type_accept"?: ["fax"] } ],
  "emails": ["…"], "urls": ["…"],
  "socials": [ { "service": "linkedin|xing|x|instagram|github|wechat|other|…", "value": "linkedin.com/in/…" } ],
  "addresses": [ { "street","extra","pobox","postcode","city","region","country","countryCode" } ] }
```
- Phones: `printed` = the number as printed (without label); `label` = printed label (or `null`); `e164` and `type` are the
  correct normalised values (type from the label, else from the number range: mobile range → mobile, else work).
  `ext` = extension printed after "x"/"ext." (not part of `e164`). `composed: true` = the number is printed only as a
  suffix of another number ("Durchwahl -127", "F: -19") or as a vanity number ("1-800-GO-PLUMB"); `e164` is the full
  number. `type_accept` = other acceptable types (e.g. "Tel./Fax").
- Addresses: `street` = street + house number as printed; `extra` = floor/suite/unit/building/district text printed
  with the address (score it as part of the street tokens if the extractor puts it in `street`); `pobox` = printed PO box
  ("Postfach 11 62", "BP 30122", "P.O. Box 123456"); `postcode`, `city`, `region`, `country` as printed ("" if not printed);
  `countryCode` = correct ISO code (inferred, not necessarily printed). Some countries print no postcode (HK, AE, VN).
- When a card prints the same address/name in two scripts, truth has ONE address and the primary name per N7 (Latin
  unless the UI language's script is present); the other-script variants are listed in `accept`.
- Names: truth is the real split. `jp-02` (佐藤花子, no space) is truth family 佐藤 / given 花子 although SPEC N5 says
  such names cannot be split reliably (expected: family = full, low confidence) — a low-confidence output is "asked the
  user", not wrong, under §13.

### `ocr_damage`
```json
{ "path": "emails[0]" | "phones[1].printed" | "addresses[0].postcode" | "title" | "name.full" | "text",
  "printed": "<true printed string>", "ocr": "<what the OCR line contains>", "kinds": ["rn/m"], "stray"?: "& " }
```
`path: "text"` = damage in text that is not a scored value (labels, prefixes like "lnh." for "Inh."). Kinds:
`0/O`, `1/l` (l, I, | for 1 or the other way), `5/S`, `8/B`, `rn/m`, `dropped-space`, `spaced-at` (" @ "),
`diacritic-lost`, `merged-line` (two columns read as one line), `stray-symbol` (icon read as a character; `stray` = the
inserted text). `check.py` verifies that the OCR form is on the card and folds to the printed form under the kinds.
Line breaks printed on the card (name or title over two lines, e-mail broken at a hyphen) are layout, not damage; they
are tagged in `traps` (`name-split-lines`, `hyphenated-title-split`, `email-split-across-lines`).

## Scoring (SPEC §13, unchanged)
e-mail lower-case exact; URL host+path case-insensitive without scheme/trailing slash; phone E.164 equal (digits when
unparseable) + type exact (`type` or `type_accept`); name = given+family after NFKC/case-fold/whitespace (prefix/suffix
separately); company/title/department case- and punctuation-insensitive exact (`accept` alternatives count as right);
address = postcode+city exact plus street token overlap ≥ 0.8; high/medium = produced, low = asked the user. A value
produced for a kind listed in `absent` is a false positive. `notes` are for humans and are not scored.
