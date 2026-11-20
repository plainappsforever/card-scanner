# Field extractor (SPEC §5.1) — rules with examples

Pure TypeScript (`index.ts` → `extract(input)` / `extractText(text)`), no React Native imports. Input: OCR lines of the
front (ids `f0…`), the back (`b0…`), decoded codes (`q0…`), the phone region and the UI language. Output (`types.ts`):
one `Candidate { value, confidence: high|medium|low, sources: lineIds, rule }` per field, `alternatives`, `leftovers`
and every line. **Nothing is saved here** — the result is a proposal the user checks (L26, D17). Version:
`EXTRACTOR_VERSION` (stored on every card). Dictionaries in `dict/` are our own curated lists (D14); `tld.ts` is a curated
TLD snapshot (D32). Accuracy: only blind-set figures are evidence (`npm run blind -- <folder>`, SPEC §13; the
development set in `test/fixtures/cards/dev/` is a tuning set).

Run order in code: 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8 → 9 → 7b → 10 (addresses before phones so postcodes are never read
as numbers; the company fallback after the name so a large name is not taken for a logo).

| # | Rule (file) | Examples |
|---|---|---|
| 1 | **Pre-normalise and segment** (`normalize.ts`): NFKC, dashes/quotes/odd spaces unified, Arabic-Indic and Devanagari digits → ASCII. Split at `\|`, `•`, `·`, ` / ` (not between digits) and at 2+ spaces before a label. Digit confusables O/o→0, l/I/\|→1, S→5, B→8 only inside runs that are ≥ 70 % digits (`rules/phone.ts`). | `T +49 30 12 \| M +49 170 1` → 2 segments · `Fon 0761 / 29 28 27` stays one · `T +49 4O 3O12 456-0` → `+49 40 3012 456-0` · `BOSS Office` untouched |
| 2 | **Codes first** (`index.ts`): vCard/MECARD/BIZCARD → fields `high`; OCR values that agree add their line as a source; differing OCR scalars become `alternatives`; a URL code → website or social. Unreadable codes fill nothing. | QR `TITLE:Redaktionsleiterin`, card "Chefredakteurin" → title from the code, OCR value offered as alternative |
| 3 | **E-mail** (`rules/email.ts`): `local@domain-tld.example`, TLD known. Repairs inside the shape: spaces around `@`/dots, `(at)`, `[at]`, `©`/`®`, ` at ` (labelled only); missing `@` only when labelled and the domain is the card's website. Clean → high; repaired → medium; unknown TLD → low. `Instagram @x.y` is not an e-mail. | `konrad @ hollerbach.de` → medium · `torben(at)brueckner-elektro.de` → medium · `E-Mail: anna.weberacme.de` + `www.acme.de` → `anna.weber@acme-de.example` medium |
| 4 | **Website / social** (`rules/url.ts`, `../social.ts`): www/scheme/bare domains with a known TLD; a bare domain needs a lower-case TLD as printed unless labelled (`GmbH & Co.KG`, `Mo.-Fr.`, `M.Sc.` are not websites); `www acme de` → medium. Profile URLs (linkedin.com/in, xing.com/profile, x.com, instagram.com, github.com, youtube.com/@, tiktok.com/@, t.me …) → social high; labelled handles (`XING: …`, `WeChat: …`, `in/…`) → medium; a lone `@handle` → other, low. | `linkedin.com/in/anna-weber` → linkedin high · `Made in Germany` → nothing |
| 5 | **Phones** (`rules/phone.ts`, `../phone.ts`): ≥ 6 digits; registry/tax/bank segments (USt-IdNr, VAT, IBAN, HRB, SIRET, ИНН, 사업자 …), addresses, dates and year ranges skipped. Label dictionary (15 languages) decides mobile/work/fax/home; generic labels (Tel, Phone, 電話, Тел …) and unlabelled numbers use the metadata (mobile → mobile, else work). Default country: `+cc` on the card → country names/prefixes → ccTLD → phone region. Valid + label → high; valid → medium; a labelled number with a possible length but unassigned range → medium, same digits (D30); otherwise invalid ≥ 7 digits → low, kept as printed. Extensions (`ext. 23`, `Durchwahl 12`) are kept. Labels after the number (`0172 5566778 (mobil)`) count. | `Tel. 0171 1234567` → mobile high · `0160 1234567` → mobile medium · `Mobile 07700 900456` (UK drama range) → medium · `USt-IdNr. DE 812 345 678` → no phone |
| 6 | **Address** (`rules/address.ts`): postcode+city patterns for DE/AT/CH/FR/BE/NL/LU/IT/ES/PT/PL/UK/IE/US/CA/MX/BR/TR/RU/JP/IN/SG/AU/ID/SA/KR (+ others via the card country), PO boxes, JP `〒`, CN `邮编`, KR `(우)`. Street = same segment before the postcode, else a street-like line above in the same column (≤ 2 lines; street keywords in 15 languages, German compounds, "words + house number"); country = a country name after the city or on the line below. A leading number in US/UK/AU… is a house number. postcode+city+street → high; postcode+city → medium; CJK/VN address with city and a numbered street but no postcode → medium (D31); a street keyword line on a card without any postcode → low, whole block in `street`. | `Hafenweg 7a` / `20457 Hamburg` / `Deutschland` → high · `1200 Market Street, Suite 400` / `San Francisco, CA 94102` → high · `〒530-0001 大阪府大阪市北区梅田2-4-9` → 大阪府 / 大阪市 / 北区梅田2-4-9 |
| 7 | **Company** (`rules/company.ts`): legal form (GmbH, AG, Ltd, Inc., S.p.A., A.Ş., ООО, 株式会社, 有限公司, 주식회사, شركة …) → high; letters equal to the e-mail/web domain stem (`&`/`+` as and/und, ä→ae) → high; stem prefix + company word ("Zephyr Systems" next to logo "ZEPHYR") → high; stem prefix → medium; a logo set on two lines is tried joined. After the name: a company line in the name's script is preferred (front Japanese, back English). 7b fallback: best remaining line without digits — with a company word (Bäckerei, Kanzlei, Solutions …) → medium, else low ("logo text"). | `TALLOW & TIDE` + `hello@tallowandtide-com.example` → high · `Farbklang` + `ansorge@maler-leipzig-de.example` → low |
| 8 | **Title / department** (`rules/title.ts`): dictionaries in 15 languages + German compound heads (-leiter, -manager, -ingenieur, -berater …) + CJK/Hangul/Arabic/Devanagari substrings. Next to the name (same line after a comma or a merged OCR line, or directly above/below in the same column) → high; elsewhere → medium. Title segments on one line are joined ("Directeur des ventes / Sales Director"); department words without a title word → department. | `Anna Weber, CEO` → name + title · `Gideon Achterberg  Chief Technology Officer` → split · `Vertrieb Bildgebung` → department |
| 9 | **Name** (`rules/name.ts`): candidates without digits, `@`, URLs, dictionary hits, legal forms or company words; 1–4 tokens (Latin, Cyrillic, Arabic, Devanagari) or 2–5 CJK/Hangul characters. Score: e-mail local part (first.last, flast, firstl, first, last; ü→ue) + given-name list (own, ~1,500 names) + title adjacency + font height + capitalisation. E-mail match, or list + title → high; one signal (list, title, clearly largest font) → medium; structure only → low. Split (N1–N7): prefixes/suffixes (Dr., Prof., Dipl.-Ing., RA, Mag., Mme, Jr., PhD, Esq. …); `FAMILY, Given`; an all-caps token is the family (`Jean DUPONT`); particles join the family (van der, von, Ní); Spanish/Portuguese cards: two family names; Vietnamese: family first; romanised Korean/Chinese on KR/CN cards: family first; Russian with patronymic: Фамилия Имя Отчество; CJK with a space → family first; Chinese without space → compound list else first character; Korean → compound list else first syllable; Japanese without a space → family list (~110), else `family = full`, low ("check name"). N7: two names in different scripts → primary in the UI language's script, else Latin; the other → `otherName`. | `Ottilie Brandstätter` + `o.brandstaetter@…` → high · `東雲蒼汰` (not in the list) → low · `佐藤花子` → 佐藤 / 花子 medium |
| 10 | **Leftovers** (`index.ts`): every line no field used, and the unused remainder of a partly used line (`<line>~<k>`), is listed as "Text on the card". A second person on the card stays there. | `anna@acme-de.example (bitte nur vormittags)` → leftover "bitte nur vormittags" |

Scoring for the bench (`score.ts`, SPEC §13): e-mail lower-case exact; URL host+path case-insensitive without scheme and
trailing slash; phone E.164 (or digits when unparseable); phone type over the right numbers; name = given(+middle) and
family after NFKC/case-fold/whitespace; company/title/department case- and punctuation-insensitive; address = postcode +
city exact plus street token overlap ≥ 0.8 (CJK: characters are tokens); high/medium = produced, low = asked the user;
confident wrong = high-confidence wrong ÷ produced.

## Fix round P5b (`x2-2026-10-16`; review `docs/REVIEW_ENGINE.md` + blind set B1 misses — tests in `p5b.test.ts`)
- **Layout repair** (`index.ts` `repairLayout`): "Gesell-" / "schafterin" → one word; "…@klinikum-" / "nordstadt.de" → one
  address (real hyphen kept); "W E I N G U T" → "WEINGUT". The second line joins every field/leftover of the first.
- **Card country (M1):** votes from +cc, country names, `D-` prefixes, address patterns that name their country (US
  `City, ST 12345`, CA, UK, IE, AU, 〒, NL/PT/PL/BR/RU) and ccTLDs (`.it` counts). The phone region never votes. A number
  valid only through the region (no +cc, no evidence) is at most **medium**; the D30 "possible" reading needs evidence.
- **Phones:** a label never follows a letter or digit ("24h", "5F"); label runs "Tel./Fax", "T/F", "Mobil/Fax" → ONE
  entry with the voice type at medium; "Tel.-Nr.", "Notdienst 24h:" still label; registry words block only the number
  they label (short ones need ":"/a digit after them: "Tan Wei Ming" is a name); "Kundennummer", "Stand", "ROC #", time
  ranges are no phones; "030 123456 / 0171 7654321" → two numbers; "M" on a fixed line → medium; "Durchwahl -127",
  "F: -19" compose with the base number (medium); "1-800-GO-PLUMB" (medium); duplicates only when number + extension +
  type are equal.
- **Titles (M3):** generic words (partner, head, senior, staff, chief …) only with another title/department word, then
  medium; a lone one next to the name is asked (low); sentence words and stop phrases ("Ihr …", "Head Office") never.
  "Notar Dr. …", "Inh. …", "Filialleitung: …" → title + name; "営業部 部長", "Senior Manager – Procurement" → department +
  title; "Ma1ermeister" → "Malermeister" (medium); a name ending in -meister is no title.
- **Companies (M4):** group/holding words are hints; "a member of …", "ein Unternehmen der …", "a … company" are never
  the company; PT/CV/SE/Co. … only at a company's line end (PT/CV also first in Indonesian names); credentials after a
  name are suffixes; a legal-form-only line continues the larger line(s) above (medium); a slogan after the legal form is
  cut; a person-shaped domain line is the NAME (S3); a sentence or a list of services is no logo.
- **Names:** nicknames in quotes, "MarkusLindqvist", a given name on its own line above the family name, both scripts
  on one line, more prefixes (Maître, Av., mgr inż., Lic., Prof. Dr. rer. nat. …), Catalan "i", Indonesian degrees; a
  lone line is not "the largest"; St./San place names and CJK lines without a known family name are asked.
- **E-mail:** "holzwurrn" → the printed website's "holzwurm", "brightIine" → "brightline", "pfefferkom" → the printed
  name's "pfefferkorn" (all medium). **Web:** an unknown TLD after an explicit `www.`/scheme → medium (S9).
- **Addresses:** O/l confusables in postcodes and PO box numbers (medium), "Cedex", comma-continued street lines, JP/KR
  in Latin script (ward/`-si` as city), "Şişli / İstanbul", Hong Kong, a Vietnamese city on the next line, CN/KR
  postcodes after the address, a 4-digit house number on a 5-digit-postcode card is no postcode, MECARD ADR fields.
- **Codes (S4/S5):** an unsplit MECARD/FN name is split (medium); a code that conflicts with the printed text → medium.

## Fix round P5c (`x3-2026-10-16`; blind set B2 misses, docs/V1_LOG.md "P5c-B2" — tests in `p5c.test.ts`, readings D39)
B2 is a TUNING set since this round (L27 rule 7); the examples below are B2/B1 lines.
- **OCR damage is never "sure" (L26):** a value whose source line the OCR marks unsure (`conf` < 0.7; Apple Vision
  reports 0.5) is at most medium unless a code (QR) confirms it. Name lines with damage indicators (`OCR_DAMAGE`: a "|"
  glued between letters, 0/1 between lower-case letters, a capital I inside a word, "0'" before a capital, O/l/I glued to
  digits) are at most medium. Repairs, always medium: "HoIlmann" → "Hollmann" (only when the e-mail or the given-name
  list confirms), "Herrnann" → "Hermann" / "Komelia" → "Kornelia" (rn↔m, only into a known given name), "Mike 0'Brien" →
  "O'Brien", "dana.whitfie|d@" → "dana.whitfield@" (a glued "|" no longer splits the line), ".corn" → ".com" (as TLD or
  before a ccTLD; "corn.de" stays), "hoteI.de" → "hotel.de", "Podbielskistraße 28O" → "280".
- **Accents the OCR probably dropped:** a Latin name printed without any diacritic is at most medium when a token is on
  the accent list (`ACCENTED_NAMES`, per language: de, fr, es, pt, cs, pl, sv/nordic, tr, hu, ga, vi) of a language the
  card speaks (card country, or that language's letters elsewhere on the card), when the card is Vietnamese, when a
  token ends in "-oglu" (Turkish ğ) or is a Spanish "-ez" surname, or when the e-mail spells the name with ae/oe/ue. The
  printed value is kept — accents are never invented ("Lopez" exists).
- **Credentials:** trailing professional abbreviations are suffixes as printed: "Martin Roth, WP, StB, RA", "Priya Shah
  FCCA", "Reto Brunner, lic. oec. HSG" (prefix words count as credentials after the name only when all-caps-ish or dotted,
  so "Lisa Marie Herr" keeps her name); "Eng.ª" is a prefix.
- **Companies:** a prefix-type legal form alone on its line joins the line below ("有限会社" / "高橋デザイン事務所"); a lone
  legal form directly below the company joins it ("DIAMANT LOGISTICS" / "NV"), both medium; a two-line logo whose first
  line + the initials of the second spell the domain ("CASCADE" / "PHYSICAL THERAPY", cascadept.com); trade hints
  (plumbing, heating, therapy …).
- **Titles and departments:** feminine "-in" of English titles ("Key Account Managerin"); title words for AT/DE trades,
  CZ/SK, MX, PT, SE/Nordic ("VD", "-chef", "-ledare", "-ansvarig"), "Medical Science Liaison"; "Partner" alone directly
  under the name → medium (never high; "Head"/"Senior" alone stay asked); "業務經理 Sales Manager" → one title per script,
  the name's script wins, the other is the alternative; "Head – Engineering" → title "Head" at medium. Departments: units
  with "Center/Centre" split after a comma ("Hardware Engineer, R&D Center"); new unit words (Tax Advisory, Gestion de
  fortune, Commercial Property, Optische Messtechnik, hospital departments, Polish/Russian/Vietnamese forms); "Support
  0120-…" (a phone label) and "Skiverleih · Service · Testcenter" (a list) are no department; "Praxis für …" stays the
  company. **Title + department on one line without a unit word** ("Leiter Vertrieb Süd", "Gerente de Ventas", "VP,
  Business Development"): the whole line stays the title and the department part is only OFFERED (low = "Check") —
  B1/dev and B2 disagree on this layout (D39); a dictionary title phrase ("Diretor Comercial", "Manajer Pemasaran") offers
  nothing.
- **Addresses:** a PO box number is never a postcode; "…, P.O. Box 123456" / "Dubai, United Arab Emirates" → city from
  the next line (medium); registry lines (CIN, GSTIN, Org.nr, 統一編號 … from `NOT_PHONE_WORDS`) are never addresses;
  "Org.nr 556123-4567" is no website; "Col. Centro, 64000 Monterrey" → the district goes after the street above; "CEP
  01310-200" under "Bela Vista – São Paulo – SP" → city/UF from the line above, "CEP" is no street; "lOlO Wien" under a
  street line, UK "Ml 1BN" / "WClR 4ED" → repaired (medium); CZ/SK/SE/GR "602 00 Brno"; Korean postcode printed first
  ("06236 서울특별시 …"); Taiwan "114台北市內湖區…" (medium, D31); Hong Kong "88 Queensway, Admiralty, Hong Kong" and a
  "23/F" line above; Vietnam: the street line above joins and the city keeps a printed "TP.".
- **Phones:** "…80-0, DW 15" (Austrian Durchwahl without a dash), "Sekretariat -13" (new work labels), a suffix never
  composes from an earlier suffix; "Mobil0171 …" (label glued to the number); "RCS Paris B 732 …" is a register number;
  "H.P" = mobile; an untyped code number (MECARD `TEL:`) printed with a label is ONE entry with the printed type.

## Fix round P5d (`x4-2026-10-16`; blind set B3 confident-wrong sources, docs/V1_LOG.md "P5c-B3" — tests in `p5d.test.ts`, readings D41)
B3 is a TUNING set since this round (L27 rule 7); the examples below are B3/B1 lines. Scope: the sources of the 15
confident-wrong B3 values only (names at ~70 % are accepted until real OCR decides).
- **Company over two lines** (`joinLineAbove`): the line directly above a legal-form or domain-equal company line joins
  it when it is ONE trade / organisation / authority word ("BEDACHUNGEN" / "WÖHRLE GmbH", "Installatiebedrijf" / "Van
  der Berg B.V.", "Landeshauptstadt" / "München") or a brand whose letters start the card's domain ("celvion" /
  "Diagnostics GmbH", "LONE STAR" / "ROOFING & GUTTERS LLC"). Never a person, title, legal form, sentence or the same
  name; the joined value is medium (a layout reading) unless it equals the domain stem.
- **Name ↔ e-mail conflicts** (`reconcileNameEmail`, replaces P5b's one-way `repairEmailsFromName`): a local-part word and
  a name word that differ only by rn/m, 1/l, 0/o or vv/w mean one line is damaged. "Bergströrn" + "bergstroem@": the
  name word with "rn" → "m" ends in a surname element (-ström, -holm, -heim, -mann …) → the NAME is repaired, the
  printed e-mail stays; "Pfefferkorn" + "pfefferkom@" → the e-mail takes the name (as before). Both at most medium; an
  e-mail word with a digit is the damaged side.
- **Pasted e-mails:** the quoted reply ("On … wrote:", "Am … schrieb …:", "-----Original Message-----", "> …", "From: …@")
  is listed as text, never read into a field.
- **"|" glued into words** (`repairLayout`): "Ho|tenauer" → "Holtenauer", "McA||ister" → "McAllister", "A|-Qahtani" →
  "Al-Qahtani"; every value read from such a line is at most medium (`+ocr-repaired`).
- **Names:** "Mag.a", "MMag.", "Dr.in", "DDr.", "Ing.in" are prefixes; FRSC and other learned-society credentials (and
  F/M + R + consonants, "MRCPsych") are suffixes; Arabic compound family names keep their head ("Abdel Rahman", "Abu
  Zeid"; "bin Fahad" stays the middle name).
- **Addresses:** register lines ("PR 1187 AG Hamburg", "VR 4711", "Amtsgericht …") are never addresses; "Hoofdweg212" →
  "Hoofdweg 212" (medium); an Indian state before the PIN is the region and the comma part before it the city; "Rīga,
  LV-1012" (postcode after the city).
- **Titles / phones:** "lnh." → "Inh." (lower-case l before a consonant at a word start = OCR I, medium); "DD" = direct
  dial (work); the Vietnamese "DĐ" (di động) = mobile.

## O3 fix round (x5, 2026-10-16) — real-OCR misreads from macOS Vision (vision-1 is a tuning set from here on)
- **E-mail split after a dot** ("oliver. whitcombe@…"): a lower-case word ending in `.`/`_`/`-` directly before a
  local part is joined into it, medium; never an e-mail label word ("e-mail. anna@…").
- **Capital I starting a lower-case e-mail word** ("Ivr@uw-edu.example"): I or l — medium (`email.I-or-l`); after the name
  is known, l is taken when it spells the name's initials or a name word, and the same word in a profile handle follows.
  A profile path with such an I is medium too.
- **Domain one letter from a company word** (≥ 6 letters; "brandaver-partner.de" next to "BRANDAUER & PARTNER"): one
  line is damaged → e-mail and company medium, nothing changed.
- **Postcode glued to a phone** by a merged two-column line ("Fax 0341 2 15 88 49 04155 Leipzig"): a 4–5 digit group
  before a capitalised word at the end of a ≥ 14-digit run is cut off.
- **Domain prefix over two lines** ("tiny garden" / "Software for small growers"): medium, not high.
