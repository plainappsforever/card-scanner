# Development card set (P3) — a TUNING set, never evidence

73 OCR-text business cards written by the extractor's builder (P3, 2026-10-16). Because the same author wrote the
engine and these cards, every figure measured on them is a development figure (L27 (4)). Evidence comes only from the
blind sets B1/B2 written by separate agents (docs/V1_PLAN.md P4/P5).

Mix: DE/AT/CH 13 · US 5, UK 3, IE, CA, AU · FR 2, IT 2, ES, MX, PT, BR, NL 2, BE, TR 2, RU 2, PL · JP 4, CN 3, KR 3, IN 2,
ID 2, VN 2, SA, AE · special 15 (3 with QR codes incl. one QR-only card, 3 pasted e-mail signatures, 3 logo-as-text,
2 heavy OCR noise, two people on one card, 2 portrait layouts, mixed DE/EN). Two-sided cards: de-12, ru-02, jp-02,
cn-02, in-02 (two of them with a second language on the back). Cards marked "OCR error" in `notes` (and others) carry
real OCR faults: O/0 and l/1 in numbers, " @ " and "(at)", "www acme de", "wwww.", merged lines, stray symbols.
Uncommon or foreign given names on ≥ 30 % of the cards so the given-name list cannot carry the name result.

## Format (one JSON array per file)
```
{ "id", "lang", "region" (ISO 3166 alpha-2 of the phone), "uiLang"?, "layout", "notes"?,
  "front": [line …], "back"?: [line …], "paste"?: "text", "qr"?: ["decoded code text" …],
  "truth": { "name": {prefix?, given?, middle?, family?, suffix?}, "otherName"?, "company"?, "title"?, "department"?,
             "phones": [{"number": E.164 or digits, "type": mobile|work|fax|home|other}], "emails": [..], "urls": [..],
             "socials": [{"service", "value"}], "addresses": [{street?, postcode?, city?, region?, country?}] } }
```
A line is `"text"`, `[text, height]` or `[text, height, x, y]` (fractions of the card height/width). Without x/y the
loader stacks lines top to bottom (`src/engine/extract/fixtures.ts`). Truth = what is printed on the card, typed by a
careful human; phone types follow the meaning (a German 0171 number labelled "Tel." is a mobile).

Scoring: SPEC §13 rules in `src/engine/extract/score.ts`; run `npm run blind -- dev [--misses]`.
