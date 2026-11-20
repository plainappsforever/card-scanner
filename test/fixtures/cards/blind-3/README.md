# Blind business-card fixtures, set 3

Third blind set, written without reading the extractor source, its tests, its logs or the two earlier sets.
Format: `FORMAT.md` (copied unchanged from set 1; its example ids such as `de-11`/`us-03` refer to set 1).
Validator: `python3 -I check.py` (copied unchanged). Trap tags: `manifest.json` → `trap_vocabulary`.

Id scheme: `<country>-<letter><nn>`; letter = theme (e trade, m medical, l law, s/y startup or misc, h hotel/restaurant,
a/u academic, g government, c caps, n Nordic/Baltic, t Turkish/Arabic, i Indian, v Vietnamese, k two-column, x other,
q QR-only); `sig-` = pasted e-mail signature. Two-sided cards: `<base>-front|back|both`.

Known checker gap: `check.py` has no country codes for Portugal (+351), Finland (+358) or the Baltic states
(+370/+371/+372). The set therefore has no Portuguese card; the Latvian card (`lv-n31`) prints no phone, and the
Estonian and Lithuanian names sit on German and Swedish cards.

| id | what makes it hard |
|---|---|
| `de-e01` | Elektriker; legal form alone on line 2, "Fax -59" suffix of the base number, Innung member line, "\|" for "l". |
| `de-e02` | Dachdecker; name in caps, family name also the logo, Tel./Fax combined, VAT id, lost umlaut, no e-mail. |
| `de-e03` | Sanitär/Heizung; dotless ı, Durchwahl suffix, Mobil/WhatsApp label, "24/7" in a label, IBAN, " @ ". |
| `at-e04` | Austrian Elektriker for a DE user; "e.U." alone, "0" inside a word, FN/UID numbers. |
| `ch-e05` | Swiss Sanitär; logo lost the umlaut, "Natel" mobile label, suissetec member line, MWST number. |
| `de-y08` | Elektriker company card, letter-spaced logo, no person and no e-mail; "Notdienst" label, "\|" for "l" in the street. |
| `de-k42` | Dachdecker, two columns merged into one OCR line twice (phone + street, fax + postcode), Innung line. |
| `nl-x43` | Dutch Sanitär (loodgieter) for a DE user; "van der" family, postcode "1057 DE", KvK/BTW/IBAN, dropped space. |
| `it-x47` | Italian electrician; phone icon read as "&", +39 0 kept, Geom. prefix, P.IVA 11 digits. |
| `us-x48` | US roofer; vanity 1-800-ROOF-PRO, company over two lines, slash title, no address. |
| `uk-x49` | UK electrician; company over 3 lines ending in "Ltd", "\|\|" for "ll" in the name, "\|" separator, NICEIC. |
| `de-m06` | GP practice; holder + three colleagues in a footer line, opening hours, company over two lines. |
| `at-m07` | Dental practice portrait card; three equal doctors, no holder, DDr. prefix, "18/5" house/door. |
| `uk-m08` | London dermatologist for a DE user; "Dr" no dot, MBBS MRCP suffixes, GMC number, street in company. |
| `es-x46` | Spanish dentist; two given + two family names, "0" for "O" in the title, collegiate no., floor "3º B". |
| `de-l09` | Hamburg law firm, two columns read column-wise, partner list, LL.M. (Edinburgh), Durchwahl suffix, "Neuer Wall". |
| `uk-l10-front` | front side only. Leeds solicitors; "Partner, Commercial Property", DD label, partner list + SRA/company no. on the back. |
| `uk-l10-back` | back side only. Leeds solicitors; "Partner, Commercial Property", DD label, partner list + SRA/company no. on the back. |
| `uk-l10-both` | both sides. Leeds solicitors; "Partner, Commercial Property", DD label, partner list + SRA/company no. on the back. |
| `us-l11` | Chicago law firm; commas in company and before Esq., extension x 204, Suite. |
| `tr-y11` | Istanbul law firm for a DE user; Av. prefix, "Elif Nur", bar number 6 digits, partner list, lost Ğ. |
| `fr-x45` | Paris avocate; Maître prefix, "& ASSOCIÉS" second company line, Barreau line, lost é in the street. |
| `de-s12` | Startup; first name only, company only as the domain fernlet.garden, lone @handle, no phone/address. |
| `se-s13` | Swedish startup for a DE user; first name only, no address, unlabelled mobile, GitHub + X. |
| `mx-s14` | Berlin hardware startup; first name, IG/TG handles, legal name + c/o address in one footer line. |
| `us-y02` | Portrait startup card; name inside "hey, I'm Sam", lowercase logo, IG + GitHub, no phone/address. |
| `in-i40` | Bengaluru startup for a DE user; company only as domain, middle initial, unlabelled mobile, no address. |
| `se-y05` | Swedish translator in DE; the name is the business (no company), domain = name, "\|" for "l" in the name. |
| `it-h15` | South Tyrol hotel; IT/DE street and town names, "I-39040", stars as "****", P.IVA. |
| `fr-h16` | Lyon brasserie for a DE user; GARNIER caps family, opening hours, SIRET, menu URL in a QR, no e-mail. |
| `ch-x51` | Montreux hotel; T/F labels, "Grand-Rue 80", " @ " in the e-mail, "depuis 1898". |
| `de-x50` | Country inn; "L0WEN" for "LÖWEN", "lnh." for "Inh." before the name, kitchen hours, no e-mail. |
| `ae-y09` | Dubai restaurant, no person; Arabic + Latin logo, "Reservations / WhatsApp", local 04 number, no postcode. |
| `de-h17-front` | front side only. Hotel; front = house + switchboard, back = person with "Durchwahl -214" that needs the front base. |
| `de-h17-back` | back side only. Hotel; front = house + switchboard, back = person with "Durchwahl -214" that needs the front base. |
| `de-h17-both` | both sides. Hotel; front = house + switchboard, back = person with "Durchwahl -214" that needs the front base. |
| `vn-h18-front` | front side only. Da Nang hotel, VI front / EN back; Vietnamese name order on both sides, same numbers twice, no postcode. |
| `vn-h18-back` | back side only. Da Nang hotel, VI front / EN back; Vietnamese name order on both sides, same numbers twice, no postcode. |
| `vn-h18-both` | both sides. Da Nang hotel, VI front / EN back; Vietnamese name order on both sides, same numbers twice, no postcode. |
| `de-a19` | Göttingen physicist, Estonian name with lost ä, "Dr. rer. nat.", ORCID, faculty + institute, Raum. |
| `uk-a20` | Manchester chemist for a DE user; Reader title, FRSC, department · faculty line, "1" for "l" in e-mail. |
| `us-a21` | UW linguist; Indian name with middle initial, Ph.D., campus Box number, ZIP+4, dotted phone, ORCID. |
| `se-a22` | Stockholm economist for a DE user; Å lost, short 08- number, postcode "106 91", ORCID. |
| `at-u20-front` | front side only. TU Graz professor, DE front / EN back; three-title prefix stack, faculty + institute, ORCID, "lnstituts…". |
| `at-u20-back` | back side only. TU Graz professor, DE front / EN back; three-title prefix stack, faculty + institute, ORCID, "lnstituts…". |
| `at-u20-both` | both sides. TU Graz professor, DE front / EN back; three-title prefix stack, faculty + institute, ORCID, "lnstituts…". |
| `de-g23` | Munich city planning office; Referat + Hauptabteilung, Zimmer 412 inside the address line, lost ć. |
| `de-g24` | Berlin district office, two columns; Abteilung/Amt/Fachbereich, visiting + Postfach address, "rn" for "m". |
| `at-g25` | Vienna MA 48; "Mag.a" prefix, MA 48 department with digits, "5" for "s" in "-gasse", URL with path. |
| `ch-g26` | Basel Amt card without a person; Departement/Amt/Abteilung, "Büro 3.14", no name. |
| `us-c27` | US caps card for a DE user, no address; label "O" read as "0", "C" = cell, "VP, CUSTOMER SUCCESS", ext. 7. |
| `pl-c28` | Warsaw buyer for a DE user; caps name with lost Ó, "Sp. z o.o." alone, "kom." label, KRS/NIP. |
| `no-n29` | Oslo plumber for a DE user; letter-spaced logo, Org.nr. shaped like a mobile, "0" for "o" in the e-mail, Bjørn-Erik. |
| `dk-n30` | Copenhagen architect for a DE user; company = her name + ApS, CVR shaped like a phone, "København K". |
| `lv-n31` | Riga timber exporter; all Latvian diacritics lost in the name, SIA "…" prefix, LV-postcode last, no phone. |
| `se-n32` | Lithuanian buyer at a Swedish wind company for a DE user; lost ė, "-gatan" street, postcode "852 30". |
| `tr-t34-front` | front side only. Istanbul textile firm, TR front / EN back with ASCII spelling; A.Ş. line, Cep, Vergi No, İ. |
| `tr-t34-back` | back side only. Istanbul textile firm, TR front / EN back with ASCII spelling; A.Ş. line, Cep, Vergi No, İ. |
| `tr-t34-both` | both sides. Istanbul textile firm, TR front / EN back with ASCII spelling; A.Ş. line, Cep, Vergi No, İ. |
| `ae-t35-front` | front side only. Abu Dhabi investment firm, EN front / AR back (rtl); "Al Mansoori" family, title – department, P.O. Box. |
| `ae-t35-back` | back side only. Abu Dhabi investment firm, EN front / AR back (rtl); "Al Mansoori" family, title – department, P.O. Box. |
| `ae-t35-both` | both sides. Abu Dhabi investment firm, EN front / AR back (rtl); "Al Mansoori" family, title – department, P.O. Box. |
| `sa-t36` | Riyadh engineer for a DE user; "Eng." + "bin Fahad" + "A\|-Qahtani", C.R./VAT, P.O. Box + postcode. |
| `eg-t37` | Cairo pharma rep for a DE user; family "Abdel Rahman" in two tokens, person name in the street, no postcode. |
| `in-i39` | Chennai VP for a DE user; "R. Venkatesh" (initial + given, no family), "8.E." for "B.E.", PIN with space. |
| `in-y03` | Kochi heritage hotel for a DE user; "H0USE", middle initial, gm@ mailbox, door no. "1/268". |
| `vn-v41` | Hanoi engineer for a DE user; Vietnamese order in caps, name diacritics lost, MST tax code like a phone. |
| `id-y04` | Jakarta director for a DE user; Ir./M.T., "5etiawan", PT … Tbk, tower floor before street, NPWP. |
| `mx-y06` | Heidelberg medtech, EN labels on a DE card; "Direct -312" suffix, e-mail icon read as "@ ", HRB + GF line. |
| `de-q52` | Photographer; only logo + tagline printed, everything else in a vCard QR. |
| `se-q53` | Swedish illustrator for a DE user; only name + title printed, rest in a MECARD QR, no company/address. |
| `sig-01` | French e-mail signature; recipient in the salutation, "Tél. :"/"Port. :", capital + RCS + SIRET footer. |
| `sig-02` | German signature; base "-0" + Durchwahl -213 + Fax -299, i. A., HRA/HRB footer with 2nd company + GF names. |
| `sig-03` | Dubai signature with a quoted reply carrying another person's name and e-mail; FZ-LLC, no street/postcode. |
