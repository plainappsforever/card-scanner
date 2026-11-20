# Blind business-card fixture set (OCR text)

Written blind for the card-scanner field extractor (SPEC §5.1, §13): the author never read the extractor source or the
app's own fixtures. Format: `FORMAT.md`. Validate with `python3 -I check.py`.

77 fixtures from 69 physical cards (4 two-sided cards appear three times: front only, back only, both sides).
One line per fixture: what makes it hard. "region/ui" = the `region` (phone_region) and `uiLang` given to the extractor.

| id | card language | country | layout | region/ui | what makes it hard |
|---|---|---|---|---|---|
| `de-01` | de | DE | landscape | DE/de | Name is also the company word ("Müller Elektrotechnik"), slogan year, Tel+Fax on one dot-separated line. |
| `de-02` | de | DE | landscape | DE/de | VAT id with 9 digits, -0/-14/-99 extensions, city "Frankfurt am Main", mbB legal form on its own line. |
| `de-03` | de | DE | landscape | DE/de | " / " inside phone numbers, opening hours with digits, O for 0 in area code, no e-mail. Absent: emails. |
| `de-04` | de | DE | portrait | DE/de | Portrait, company over 3 lines, "D-83301", labels Fon/Handy, l for 1 in phone, slogan. |
| `de-05` | de | DE | landscape | DE/de | "RA Dr." prefix, Postfach number that looks like a phone, street and PO-box address, two phones on one line. |
| `de-06` | de | DE | landscape | DE/de | Zentrale vs Direkt vs Mobil, floor in the address line, title and department share a word, bare domain. |
| `de-07` | de | DE | landscape | DE/de | Freelancer: no company, no address; the domain equals the person's name; Instagram handle with label. Absent: company, addresses. |
| `de-08` | de/pl | DE | landscape | DE/de | Glued labels "Tel.:0351", O1067 postcode, rn/m in e-mail domain, "lnh." before the name. |
| `de-09-front` | de/en | DE | landscape | DE/de | DE front / EN back, logo with stray glyphs, same phones printed differently per side, address only on back [front side only] Absent: addresses. |
| `de-09-back` | de/en | DE | landscape | DE/de | DE front / EN back, logo with stray glyphs, same phones printed differently per side, address only on back [back side only] Absent: emails. |
| `de-09-both` | de/en | DE | landscape | DE/de | DE front / EN back, logo with stray glyphs, same phones printed differently per side, address only on back [both sides] |
| `de-10` | de | DE | landscape | DE/de | 0049 prefix, extension-only "Durchwahl -127", 24h hotline label, only a Postfach address, rn/m in e-mail. |
| `de-11` | de | DE | landscape | DE/de | QR-only card: printed name only, all other fields only in a vCard QR. Absent: addresses. |
| `de-12-front` | de | DE | landscape | DE/de | Name split over two lines, title hyphen-split, UG (haftungsbeschränkt), back = slogan + QR URL + Instagram [front side only] |
| `de-12-back` | de | DE | landscape | DE/de | Name split over two lines, title hyphen-split, UG (haftungsbeschränkt), back = slogan + QR URL + Instagram [back side only] Absent: name, company, phones, emails, addresses. |
| `de-12-both` | de | DE | landscape | DE/de | Name split over two lines, title hyphen-split, UG (haftungsbeschränkt), back = slogan + QR URL + Instagram [both sides] |
| `de-13` | de/tr | DE | landscape | DE/de | Logo "ACME" as its own line, fax printed only as "-19", Turkish dotless ı vs ASCII e-mail, no title. |
| `de-14` | de/sv | DE | landscape | DE/de | Name read without the space ("MarkusLindqvist"), label glued to number, company over two lines. |
| `de-15` | de | DE | landscape | DE/de | No e-mail/web; only phone labelled "Termine:"; opening hours with digits. Absent: emails. |
| `de-16` | de | DE | landscape | DE/de | Title "Notar" inside the name line, "von" particle, no company, O in postcode. Absent: company. |
| `de-17` | de | DE | landscape | DE/de | Minimal card: name, profession, one unlabelled landline with spaced area code; everything else absent. Absent: company, emails, addresses. |
| `de-18` | de | DE | landscape | DE/de | Icons read as Q/&/@ (the "@ www." line is not an e-mail), name after a label, logo-only company. Absent: emails. |
| `de-19` | de/pl | DE | landscape | DE/de | IBAN line, Tel./Fax combined, freemail web.de, " @ " with spaces, Polish name in company. |
| `de-20` | de | DE | landscape | DE/de | Heavy OCR damage: 1 for l in title/label/e-mail, O for 0 in phone/postcode, umlaut lost in city. |
| `de-21` | de | DE | portrait | DE/de | Portrait, letter-spaced "W E I N G U T", family name = domain stem = company line. |
| `de-22` | de | DE | landscape | DE/de | Four-part prefix, e-mail split across two lines at a real hyphen, street name starting with "Prof.". |
| `de-23` | de | DE | landscape | DE/de | Two people on one card (same family name), plural shared title, title word repeated in company. |
| `at-01` | de | AT | landscape | DE/de | Austria: 4-digit postcode, house/stair/door "21/3/12", S for 5 in phone, Mag. prefix, FN + UID numbers. |
| `ch-01` | de | CH | landscape | DE/de | Switzerland: unlabelled landline + mobile, CH-8008, CHE-VAT with dots, degree on a separate line. |
| `mx-01` | de/en | DE | landscape | DE/de | Lower-case logo, English slogan, legal company name only inside the address line, .io domain. |
| `mx-02` | de/en/fi | DE | landscape | DE/de | Bilingual "DE / EN" title and department lines, "+49 (0)", Finnish name transliterated in the e-mail. |
| `mx-03` | de/en | DE | landscape | DE/de | Title and e-mail merged into one OCR line, two e-mails, XING profile, no website, "-gürtel" street. |
| `mx-04` | de/en | DE | landscape | DE/de | Freelancer: no company/address, degree line under name, tech keyword line, "+49 (0)176 / …". Absent: company, addresses. |
| `mx-05` | de/en | DE | landscape | DE/de | Parent "Inc." tagline vs employer GmbH, URL with path, hyphenated street with "van der". |
| `de-24` | de | DE | landscape | DE/de | QR-only with no printed name: logo + "Scan me" + MECARD (N family,given; ADR). |
| `uk-01` | en | GB | landscape | GB/en | UK solicitor: "+44 (0)", two phones on one line, DX number, legal name only in the regulatory fine print. |
| `uk-02` | en | GB | landscape | GB/en | Tradesman: registration numbers, unlabelled mobile, l/O damage in office number, gmail address, unit line. |
| `uk-03` | en | GB | landscape | DE/de | "Dr" without dot, post-nominals on own line, .scot TLD, UK national number while phone_region = DE. |
| `us-01` | en | US | landscape | DE/de | US: o/c/f labels, "x 312" extension, dotted number, comma in title, no +1 while phone_region = DE. |
| `us-02` | en | US | landscape | US/en | Nickname in quotes, ® in title, licence number, one-line US address with a road number, lone @handle. |
| `us-03` | en | US | portrait | US/en | Portrait startup card: no phone, no address, name on two lines, MECARD QR, x.com + LinkedIn. Absent: phones, addresses. |
| `us-04` | en | US | landscape | US/en | Suffixes "III, Esq." after a comma, P.C. legal form, flast@ e-mail, "St NE" street. |
| `us-05` | en/es | US | landscape | US/en | Vanity number with letters, O for 0 in the second number, ROC licence, no address. Absent: addresses. |
| `fr-01` | fr | FR | landscape | FR/fr | French: CAPS family name, "Tél. :" spacing, SIRET/TVA digit runs, "12, rue …". |
| `fr-02` | fr | FR | landscape | FR/fr | "Maître" prefix, "quai" street, en dash between Tél. and Fax, no company/website. Absent: company. |
| `fr-03` | fr | FR | landscape | DE/de | BP PO box with O for 0, "Cedex 03" after the city, abbreviated domain. |
| `it-01` | it | IT | landscape | IT/it | Italy: "Dott. Ing." prefix, P.IVA 11 digits, "+39 02" keeps its 0, province in parentheses. |
| `it-02` | it | IT | landscape | DE/de | PEC e-mail glued to label, "Avv." prefix but no title, T./F. labels, Italian numbers with phone_region = DE. |
| `it-03` | it | IT | portrait | IT/it | Portrait restaurant card: owner after "di", given name also in company, no e-mail, year slogan. Absent: emails. |
| `es-01` | es | ES | landscape | ES/es | Spanish 2 given + 2 family names, "planta 12" floor, CIF, label glued to "+34". |
| `es-02` | ca/es | ES | landscape | ES/es | Catalan "X i Y" surname, "C/" street with floor/door, S for 5 in mobile, .cat domain, no company. Absent: company. |
| `mex-01` | es | MX | landscape | MX/es | Mexico: Lic., S.A. de C.V., "Col." line, boulevard named after a person, two surnames. |
| `pl-01` | pl | PL | landscape | DE/de | Polish NIP formatted like a phone, "mgr inż." prefix, Sp. z o.o. on its own line, ń lost in city. |
| `pl-02` | pl | PL | landscape | PL/en | Polish sworn translator: no company, freemail, "os." estate address, unlabelled mobile. Absent: company. |
| `tr-01` | tr | TR | landscape | TR/tr | Turkish: "Av." prefix, "No:/Kat:" in street, "Şişli / İstanbul" spaced slash, .av.tr domain. |
| `tr-02` | tr | TR | landscape | DE/de | Turkish Ltd. Şti., two given names, Faks/GSM labels, "Nilüfer/Bursa", l for 1, phone_region = DE. |
| `nl-01` | nl | NL | landscape | DE/de | Dutch: "ir." prefix, "van der" family name, Postbus with l for 1, postcode "3000 BA", KvK/BTW. |
| `br-01` | pt | BR | landscape | DE/en | Brazil: "Ana Paula" compound given, CNPJ, " - " separated address with "10º andar", family name in company. |
| `in-01` | en | IN | landscape | DE/en | India: PIN with space, ISO 9001:2015 slogan, GSTIN, "Title – Department", 3-line address. |
| `id-01` | id | ID | landscape | DE/en | Indonesia: suffix titles after commas, PT … Tbk, "HP" label with O for 0, building/floor line. |
| `vn-01` | vi | VN | landscape | DE/en | Vietnam: family-first name, TNHH company in caps, no postcode, "ĐT"/"Di động" labels. |
| `ae-01` | en/ar | AE | landscape | DE/en | UAE bilingual card: Arabic RTL column, Arabic name as otherName, 6-digit P.O. Box, no postcode. |
| `ru-01` | ru | RU | landscape | DE/en | Russian: family-first name with patronymic, ООО «…», postcode-first one-line address, ИНН. |
| `jp-01-front` | ja/en | JP | landscape | DE/de | JA front / EN back: 〒 address, 部署+役職 on one line, Latin vs Japanese primary name, address in two scripts [front side only] |
| `jp-01-back` | ja/en | JP | landscape | DE/de | JA front / EN back: 〒 address, 部署+役職 on one line, Latin vs Japanese primary name, address in two scripts [back side only] |
| `jp-01-both` | ja/en | JP | landscape | DE/de | JA front / EN back: 〒 address, 部署+役職 on one line, Latin vs Japanese primary name, address in two scripts [both sides] |
| `jp-02` | ja | JP | landscape | JP/ja | Japanese name without space, two titles on one line, 有限会社 prefix, family name in company. |
| `jp-03` | ja/en | JP | landscape | DE/de | Furigana reading line + kanji name with U+3000 space + romaji name; company in two scripts. |
| `cn-01` | zh/en | CN | landscape | DE/en | Bilingual CN/EN: both name scripts on one line, Latin name family-first, bilingual labels, WeChat id. |
| `cn-02` | zh | CN | landscape | CN/zh-CN | Chinese compound surname 欧阳, given name repeated in the street name, full-width colons. |
| `hk-01` | en/zh | HK | landscape | DE/en | Hong Kong: "Kelvin WONG Ka-Ming", traditional Chinese name, no postcode, "12/F" floor. |
| `kr-01` | ko | KR | landscape | DE/en | Korean: name without space, (주) legal form, department+title on one line, postcode in parentheses. |
| `kr-02-front` | en/ko | KR | landscape | DE/en | EN front / KO back: Latin name family-first with ", Ph.D.", Korean legal-form suffix, address in two scripts [front side only] |
| `kr-02-back` | en/ko | KR | landscape | DE/en | EN front / KO back: Latin name family-first with ", Ph.D.", Korean legal-form suffix, address in two scripts [back side only] |
| `kr-02-both` | en/ko | KR | landscape | DE/en | EN front / KO back: Latin name family-first with ", Ph.D.", Korean legal-form suffix, address in two scripts [both sides] |
| `sig-01` | de | DE | text | DE/de | Pasted German signature: footer names other people with a stronger title, HRB/VAT ids, disclaimer text. |
| `sig-02` | en | GB | text | DE/en | Pasted English signature: sign-off "Tom" line, nickname in quotes, ext. 204, one-line UK address, no website. |
