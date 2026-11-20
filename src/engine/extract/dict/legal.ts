// Legal forms (SPEC rule 7, own curated list). `cased` forms must appear exactly as written (short ones that are also
// words or initials: "AG", "AS", "PT", "SA"); the others match case-insensitively on folded text.
export const LEGAL_CASED = [
  'AG', 'KG', 'UG', 'SE', 'OHG', 'GbR', 'KGaA', 'e.K.', 'e.V.', 'eG', 'mbH', 'PartG', 'AB', 'AS', 'A/S', 'ApS', 'ASA', 'Oy', 'Oyj', 'NV', 'N.V.', 'BV', 'B.V.', 'VOF', 'SA', 'S.A.', 'SAS', 'SASU', 'SARL', 'Sàrl', 'SÀRL', 'S.à r.l.',
  'EURL', 'SL', 'S.L.', 'SLU', 'S.L.U.', 'SpA', 'S.p.A.', 'Srl', 'S.r.l.', 'SRL', 'S.n.c.', 'S.a.s.', 'Lda', 'Lda.', 'Ltda', 'Ltda.', 'S/A', 'EIRELI', 'ME', 'PT', 'CV', 'Tbk', 'Tbk.', 'PLC', 'LLP',
  'LLC', 'L.L.C.', 'LP', 'Inc', 'Inc.', 'Corp', 'Corp.', 'Co.', 'Ltd', 'Ltd.', 'Pty', 'Pty.', 'Pvt', 'Pvt.', 'GmbH', 'A.Ş.', 'A.S.', 'Ltd. Şti.', 'Şti.', 'ООО', 'АО', 'ПАО', 'ЗАО', 'ОАО', 'ИП', 'TNHH',
  'P.C.', 'P.A.', 'PLLC', 'L.P.', 'JSC', 'CTCP', 'CP', 'K.K.', 'KK', 'Sdn Bhd', 'Sdn. Bhd.', 'Bhd', 'GesmbH', 'Ges.m.b.H.', 'sp. z o.o.', 'S.C.', 'SpA.', 'W.L.L.', 'WLL', 'FZE', 'FZ-LLC', 'FZCO', 'DMCC',
];
/** Folded, case-insensitive (whole words). */
export const LEGAL_WORDS = [
  'gmbh', 'gesellschaft mbh', 'gmbh & co. kg', 'limited', 'incorporated', 'corporation', 'company', 'private limited', 'pvt ltd', 'pvt. ltd.', 'societe anonyme', 'sociedad anonima', 'sociedad limitada',
  'societa per azioni', 'aktiengesellschaft', 'kommanditgesellschaft', 'anonim sirketi', 'limited sirketi', 'perseroan terbatas', 'cong ty', 'cong ty tnhh', 'cong ty co phan', '& partner', '& partners', '& co',
  '& sohne', '& soehne', '& cie', 'y cia', '& associates', 'partnerschaft', 'partnerschaftsgesellschaft', 'haftungsbeschrankt', 'sp. z o.o', 'sp. z o.o.', 'sp.j', 'sp.k', 's.a. de c.v', 's. de r.l',
];
/** Script-specific forms matched as substrings (no word boundaries in these scripts). */
export const LEGAL_SUBSTRINGS = ['株式会社', '有限会社', '合同会社', '（株）', '(株)', '㈱', '有限公司', '股份有限公司', '有限责任公司', '集团', '公司', '주식회사', '(주)', '㈜', '유한회사', 'شركة', 'مؤسسة', 'ذ.م.م', 'ش.م.م', 'प्राइवेट लिमिटेड', 'लिमिटेड', 'Công ty'];
/** Weak company signals (not legal forms): raise a line's company score a little. */
/** Short cased forms that are also initials, credentials or words (PT = physical therapist, CV = curriculum vitae, Co. Kerry
 * = an Irish county): a legal form only at the END of a line after another capitalised word (PT/CV also at the start
 * of Indonesian names, "PT Maju Jaya"), never after a person-shaped head and a comma ("Jane Doe, PT"). Review M4. */
export const LEGAL_STRICT = new Set(['PT', 'CV', 'SE', 'ME', 'CP', 'SA', 'AS', 'AB', 'SL', 'LP', 'Co.', 'KK', 'NV', 'BV', 'Oy']);
/** Weak company signals (not legal forms): raise a line's company score a little. Group/holding words are hints, not
 * legal forms (review M4: "A member of the Contoso Group"). */
export const COMPANY_HINTS = [
  'group', 'gruppe', 'holding', 'groupe', 'grupo', 'gruppo', 'physiotherapie', 'hukuk', 'hukuk burosu', 'solicitors', 'attorneys', 'rechtsanwalte', 'steuerkanzlei', 'trattoria', 'ristorante', 'weingut',
  'solutions', 'consulting', 'services', 'technologies', 'technology', 'systems', 'software', 'industries', 'international', 'engineering', 'logistics', 'partners', 'labs', 'studio', 'agency', 'media',
  'design', 'plumbing', 'heating', 'roofing', 'therapy', 'physical therapy', 'construction', 'contractors', 'landscaping', 'cleaning', 'architects', 'architekten', 'kanzlei', 'praxis', 'technik', 'bau', 'werke', 'werk', 'handel', 'verlag', 'versicherung', 'bank', 'hotel', 'restaurant', 'atelier', 'consultants', 'trading', 'import',
  'export', 'buro', 'bouw', 'techniek', 'installatie', 'manufacturing', 'electronics', 'electric', 'motors', 'pharma', 'medical', 'clinic', 'klinik', 'university', 'universitat', 'hochschule', 'institut', 'institute', 'stiftung', 'foundation', 'verein',
  'association', 'ventures', 'capital', 'immobilien', 'gastronomie', 'elektro', 'sanitar', 'heizung', 'tischlerei', 'schreinerei', 'baeckerei', 'backerei', 'metzgerei', 'friseur', 'apotheke', 'autohaus',
  'teknoloji', 'muhendislik', 'insaat', 'ticaret', 'sanayi', 'tecnologia', 'soluciones', 'servicios', 'soluções', 'solucoes', 'servizi', 'tecnologie', 'technologie', 'conseil', 'industrie',
];
