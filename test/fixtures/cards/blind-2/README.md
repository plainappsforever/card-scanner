# Blind set B2 — business-card fixtures

Second, independent blind set (SPEC §13 B2). Format and checker are byte-identical copies of the first
set's `FORMAT.md` and `check.py`. Validate with `python3 -I check.py`.

| id | what makes it hard |
|---|---|
| `de-01` | Tagline "Ihr Partner für …" must not become the title; "GmbH" alone on a line; numbers written "07071 / 9 36 52-0" (" / " is also a segment separator); Tel/Fax share a base; city lost its umlaut |
| `de-02` | "RA Dr." prefix and "LL.M." suffix around the name; Durchwahl -12 and Sekretariat -13 share the base of the switchboard number; "l" read as "1" in the e-mail |
| `de-03` | No title at all — only the tagline "Seit 1952 in Familienbesitz"; Tel and Fax identical except the last digit on one line; opening hours with 7 digits |
| `de-04` | Combined label "Mobil/Fax:" glued to two numbers separated by " / "; Tel and Fax differ in the last digit; "0" read as "O"; no e-mail |
| `de-05` | "Eine Marke der Hellwig Lichttechnik GmbH" carries the only legal form but is not the company; brand logo LUMARA is |
| `de-06` | "Leiter Vertrieb Süd" = title + department on one line; "A member of the Nordwind Group"; Austrian phone region |
| `mx-01` | German company, English labels; "Part of HALVORSEN MEDICAL" in capitals; "Dr. med." prefix and MBA suffix; " @ " in the e-mail |
| `de-07` | The company logo contains the person's full name; VAT id "DE 287 654 321" (9 digits) and § 34c licence line |
| `de-08` | Freelancer: no company, no address; domain = her name; national mobile with a Swiss phone region, only the .de domain tells the country; phone icon read as "&" |
| `de-09` | Letter-spaced logo "S C H R E I N E R E I" + "LORENZ"; tagline "Meisterbetrieb seit 1988"; m read as rn, 0 as O, label glued to the mobile |
| `de-10` | QR code with a profile URL next to printed web address; "5" read as "S" in the mobile |
| `de-11` | Shop card without a person: no name, no title; IBAN, BIC, Steuernummer, USt-IdNr. and opening hours are all digit runs |
| `de-12-front` | Engineering card, German front / English back, Durchwahl suffix, "Est. 1988", "Head Office", "A member of … Group" — front only |
| `de-12-back` | Engineering card, German front / English back, Durchwahl suffix, "Est. 1988", "Head Office", "A member of … Group" — back only, scanned as a single side (lines under input.front) |
| `de-12-both` | Engineering card, German front / English back, Durchwahl suffix, "Est. 1988", "Head Office", "A member of … Group" — both sides together |
| `de-13` | No phone, no company, no address — only two city names "Berlin · Lissabon"; .design TLD; "l" read as "I" in the e-mail |
| `de-14` | Postcode with leading zero read as "O1099"; "Termine nach Vereinbarung" is not a title; B.Sc. suffix; Tel/Fax last digit; no e-mail |
| `de-15` | "WP, StB, RA" credentials after the name (RA here as a suffix, in de-02 as a prefix); Durchwahl -55 and Fax -99 as suffixes of one base; "Partner" is both the title and part of the company |
| `de-16` | Two columns merged: the name and the Tel number came back as one line; "GmbH & Co. KG" alone; Tel -0 / Fax -10 |
| `de-17` | Name over two lines; street address and a Postfach with its own postcode; "mm" read as "rnm" in the e-mail |
| `de-18` | QR-only card: printed name plus a vCard 3.0 code with everything else |
| `de-19` | Icons read as characters: phone icon "@", envelope "M" (looks like the mobile label), house icon "6" before the street; "Tel./Fax" one number |
| `de-20` | "Direktorin Sales & Marketing" = title + department; tagline with a year; both "l" in the e-mail domain read as "I" |
| `de-21` | US phone region on a Berlin card with national numbers "(030) …" and "(0172) …"; Telefon/Telefax share a base; O for 0 in the area code |
| `de-22` | "Der Marktführer für Industriedichtungen" tagline; company spread over three lines ending in "GmbH" alone; "rn" read as "m" in the given name |
| `mx-02` | "Senior Engineer, R&D" on one line; "Phone/Fax" combined label; ".com" read as ".corn" |
| `sig-01` | Pasted German e-mail signature with greeting, legal footer naming two other people as Geschäftsführer, HRB and USt-IdNr. |
| `at-01` | Austrian "DW 15" extension after the switchboard number; "Mag." prefix; Vienna postcode 1010 read as "lOlO"; Firmenbuch and UID numbers |
| `at-02-front` | Tyrolean ski shop, back side with opening hours, IBAN and Instagram — front only |
| `at-02-back` | Tyrolean ski shop, back side with opening hours, IBAN and Instagram — back only, scanned as a single side (lines under input.front) |
| `at-02-both` | Tyrolean ski shop, back side with opening hours, IBAN and Instagram — both sides together |
| `at-03` | No address, no company; Austrian national mobile with German phone region — only the .at domain decides; O for 0 |
| `ch-01` | Swiss card: "lic. oec. HSG" degree after the name, single-letter labels T/D/M, MWST number; city lost its umlaut |
| `ch-02` | Geneva private bank, French; "Banque privée depuis 1862" tagline; title and department on separate lines; glued "Tél.+41" |
| `uk-01` | "Head Office" above the address; "T/F" combined label; "+44 (0)20" trunk zero in brackets; MRICS suffix; company number 04123456 |
| `uk-02` | FCCA suffix; "Est. 1996" tagline; national UK numbers with an Indian phone region; postcode "M1" read as "Ml"; VAT number |
| `uk-03` | No address; unlabelled national UK mobile, German phone region — only .co.uk tells the country |
| `us-01` | "PT, DPT" credentials (PT is also an Indonesian legal form); NPI 10-digit id and licence number; "Part of the … network"; Phone/Fax last digit |
| `us-02` | MECARD QR agreeing with the printed card; "ext. 204"; "VP, Business Development" |
| `us-03` | Vanity toll-free number 1-800-GO-PLUMB; "O" of O'Brien read as zero; no street address, only "Serving the Denver Metro Area"; licence number |
| `us-04-front` | Analytics firm, vCard QR on the back, "Est. 2009", city list — front only |
| `us-04-back` | Analytics firm, vCard QR on the back, "Est. 2009", city list — back only, scanned as a single side (lines under input.front) |
| `us-04-both` | Analytics firm, vCard QR on the back, "Est. 2009", city list — both sides together |
| `us-05` | No address, .com domain, unlabelled national US number, German phone region: nothing on the card proves the country — must not be a confident German number |
| `sig-02` | Pasted US signature: "O:"/"C:" one-letter labels, "x 318" extension, CPA suffix, address on one line, confidentiality footer |
| `fr-01` | French all-caps family name; "Une société du Groupe Arvel"; SIRET/RCS/TVA lines; "+33 (0)1"; accents lost in the street |
| `fr-02` | Belgian phone region: "04 72 10 20 30" is also a VALID Belgian mobile (0472…); only the Lyon BP/Cedex address and .fr make it French |
| `it-01` | Italian landline keeps its 0 after +39 ("+39 02 …"), read with O for 0; mobile "347 …" without +39 and a German region; P.IVA 11 digits |
| `es-01` | Spanish double given name and double family name, all accents lost; "Gerente de Ventas"; floor "3º Izda."; CIF |
| `pt-01` | Portuguese wine estate without any phone; NIF "501 234 567" has exactly the shape of a Portuguese number; tagline with a year |
| `nl-01` | "ir." prefix and family "van der Berg"; Dutch mobile "06 …" (also a plausible German area code) with region DE; KvK and BTW numbers |
| `be-01` | Legal form "NV" alone on a line; "GSM" mobile label; Belgian enterprise number BE 0123.456.749 |
| `pl-01` | Polish "mgr inż." prefix; "Kierownik Działu Zakupów" title + department; NIP with dashes like a phone, KRS, REGON |
| `cz-01` | Czech "Ing." prefix and "Ph.D." suffix, all háčky lost in the name; postcode "602 00" starts like the mobile 602; IČO/DIČ |
| `tr-01` | Turkish lawyer "Av." prefix; Tel/Faks last digits 89/90; district "Şişli / İstanbul" with a slash; 10-digit Vergi No |
| `se-01` | Swedish card without an address (only "Stockholm · Göteborg"), national "08-…" (also a plausible German 081… area) with German region — only .se decides; two-letter title "VD"; Org.nr |
| `in-01` | Indian card: "Head – Engineering", PIN "560 095" after a dash, GSTIN and CIN ids full of digits, unlabelled landline |
| `id-01` | Indonesian degrees "S.T., M.M." after the name; "PT … Tbk" legal form in front; "HP" mobile label with O for 0; NPWP tax id |
| `vn-01` | Vietnamese name, family first, tone marks lost; tax code "MST: 0312345678" looks exactly like a Vietnamese mobile; no postcode |
| `ae-01` | Bilingual Dubai card (English + Arabic RTL lines); P.O. Box 123456 (6 digits) on the street line; TRN 15 digits; Tel/Fax last digit |
| `ru-01` | Russian name in family–given–patronymic order; landline with trunk "8 (495)"; ИНН 7701234567 (10 digits, starts like +7 701…) |
| `br-01` | Brazilian card with Portuguese phone region; "Cel./WhatsApp:" label; CEP on its own line; CNPJ; city without tilde |
| `mex-01` | Mexican card with a US phone region: "81 1234 5678" is 10 digits like a US number; "Lic." prefix; double family name; RFC tax id |
| `jp-01-front` | Tokyo card, Japanese front / English back — front only |
| `jp-01-back` | Tokyo card, Japanese front / English back — back only, scanned as a single side (lines under input.front) |
| `jp-01-both` | Tokyo card, Japanese front / English back — both sides together |
| `jp-02` | Portrait Japanese card, name 高橋美咲 without a space (also in the company name); 有限会社 on its own line; O for 0 |
| `jp-03` | Japanese company, English-only card, no address, .com: the national toll-free "0120-987-654" gets its country only from the +81 mobile |
| `cn-01-front` | Shenzhen card, Chinese front / English back — front only |
| `cn-01-back` | Shenzhen card, Chinese front / English back — back only, scanned as a single side (lines under input.front) |
| `cn-01-both` | Shenzhen card, Chinese front / English back — both sides together |
| `hk-01` | Hong Kong card read with UI Chinese and region CN: primary name is the Chinese 陳大文; "(852)" country code without "+"; no postcode |
| `tw-01` | Taiwan card mixing scripts on the same line ("林志明 Jimmy Lin", "業務經理 Sales Manager"); 3-digit postcode glued to the city; "ext. 568"; national mobile 0912… (also a German 0912x area) |
| `kr-01` | Korean card: "(주)" legal form, department + title "개발팀 팀장", T./F. on one line separated by two spaces, O for 0 in the mobile |
| `kr-02` | Two-syllable Korean family name 남궁 (남궁민수); business registration number 123-45-67890 with dashes; German phone region; no e-mail |
