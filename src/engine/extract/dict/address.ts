// Address words (SPEC rule 6, own curated list): street keywords and PO boxes in the 15 UI languages, country names →
// ISO 3166 alpha-2. Folded entries (lower case, Latin diacritics removed); scripts without spaces as substrings.

/** Whole-word street keywords (folded; a trailing "." in the text is ignored). */
export const STREET_WORDS = [
  'str', 'strasse', 'straße', 'weg', 'platz', 'allee', 'gasse', 'ring', 'damm', 'ufer', 'chaussee', 'steig', 'pfad', 'markt', 'hof', 'berg', 'graben', 'wall', 'kamp', 'stieg', 'twiete', 'zeile', 'anger',
  'street', 'st', 'road', 'rd', 'avenue', 'ave', 'av', 'boulevard', 'blvd', 'lane', 'ln', 'drive', 'court', 'ct', 'place', 'pl', 'square', 'sq', 'way', 'terrace', 'highway', 'hwy', 'parkway', 'pkwy',
  'suite', 'ste', 'floor', 'fl', 'unit', 'building', 'bldg', 'house', 'tower', 'centre', 'center', 'park', 'close', 'crescent', 'row', 'mews', 'gardens', 'hill', 'grove', 'walk', 'wharf', 'quay', 'circle',
  'rue', 'bd', 'chemin', 'allee', 'impasse', 'quai', 'route', 'cours', 'faubourg', 'passage', 'via', 'viale', 'piazza', 'piazzale', 'corso', 'largo', 'vicolo', 'strada', 'calle', 'avenida', 'avda', 'paseo',
  'plaza', 'carrera', 'carretera', 'camino', 'ronda', 'travesia', 'glorieta', 'rua', 'travessa', 'praca', 'alameda', 'estrada', 'rodovia', 'cad', 'caddesi', 'cd', 'sok', 'sokak', 'sokagi', 'mah', 'mahallesi',
  'mh', 'bulvari', 'blv', 'no', 'kat', 'daire', 'ул', 'улица', 'пр-т', 'проспект', 'пер', 'переулок', 'ш', 'шоссе', 'пл', 'площадь', 'наб', 'набережная', 'д', 'дом', 'корп', 'стр', 'офис', 'бульвар',
  'jl', 'jalan', 'gg', 'gang', 'kav', 'ruko', 'gedung', 'lantai', 'duong', 'pho', 'so', 'ngo', 'ngach', 'phuong', 'quan', 'huyen', 'tp', 'thanh pho', 'toa nha', 'tang', 'marg', 'nagar', 'sector', 'plot',
  'shop', 'opp', 'near', 'straat', 'laan', 'plein', 'gracht', 'kade', 'singel', 'dijk', 'vej', 'gade', 'gatan', 'vagen', 'gata', 'katu', 'tie', 'ulica', 'ul', 'aleja', 'al', 'plac', 'utca', 'ut',
];
/** Substring street markers (CJK, Hangul, Arabic, Devanagari). */
export const STREET_SUBSTRINGS = ['丁目', '番地', '番', '号', '町', '区', '市', '县', '縣', '路', '街', '道', '大道', '弄', '巷', '号楼', '大厦', '大廈', 'ビル', '階', '로', '길', '동', '번지', '층', '호', 'شارع', 'طريق', 'حي', 'مبنى', 'मार्ग', 'रोड', 'नगर', 'गली', 'सड़क'];
/** PO box words (Latin/Cyrillic), as a regex alternative without groups. */
export const PO_BOX_WORDS = "postfach|postbus|pf\\.?|p\\.?\\s?o\\.?\\s?box|po\\s?box|p\\.o\\.b\\.?|b\\.p\\.?|apartado|apdo\\.?|casella postale|caixa postal|posta kutusu|а\\/я|абонентский ящик";
/** PO boxes (folded). "C.P." is NOT here: in Mexico it means código postal. */
export const PO_BOX = /\b(postfach|postbus|pf\.?|p\.?\s?o\.?\s?box|po\s?box|p\.o\.b\.?|b\.?p\.?|apartado|apdo\.?|casella postale|caixa postal|posta kutusu|а\/я|абонентский ящик)(?=[\s.:]*\d)|私書箱|邮政信箱|사서함|ص\.?\s?ب\.?|صندوق بريد/i;

/** Country names (folded) → ISO code. English, German and the country's own language(s), plus the 15 UI languages' forms for the main ones. */
export const COUNTRIES: Record<string, string> = {
  germany: 'DE', deutschland: 'DE', allemagne: 'DE', alemania: 'DE', germania: 'DE', alemanha: 'DE', almanya: 'DE', германия: 'DE', jerman: 'DE', duc: 'DE', ドイツ: 'DE', 德国: 'DE', 독일: 'DE', ألمانيا: 'DE', जर्मनी: 'DE', 'federal republic of germany': 'DE', brd: 'DE',
  austria: 'AT', osterreich: 'AT', oesterreich: 'AT', autriche: 'AT', avusturya: 'AT', австрия: 'AT',
  switzerland: 'CH', schweiz: 'CH', suisse: 'CH', svizzera: 'CH', suiza: 'CH', isvicre: 'CH', швейцария: 'CH',
  france: 'FR', frankreich: 'FR', francia: 'FR', franca: 'FR', fransa: 'FR', франция: 'FR', perancis: 'FR', phap: 'FR', フランス: 'FR', 法国: 'FR', 프랑스: 'FR', فرنسا: 'FR', फ्रांस: 'FR',
  belgium: 'BE', belgien: 'BE', belgique: 'BE', belgie: 'BE', belgica: 'BE', belcika: 'BE',
  netherlands: 'NL', niederlande: 'NL', nederland: 'NL', holland: 'NL', 'the netherlands': 'NL', 'pays-bas': 'NL', 'paises bajos': 'NL', hollanda: 'NL',
  luxembourg: 'LU', luxemburg: 'LU', luxemburgo: 'LU', italy: 'IT', italien: 'IT', italia: 'IT', italie: 'IT', italya: 'IT', италия: 'IT', イタリア: 'IT', 意大利: 'IT', 이탈리아: 'IT',
  spain: 'ES', spanien: 'ES', espana: 'ES', espagne: 'ES', spagna: 'ES', ispanya: 'ES', испания: 'ES', portugal: 'PT', portogallo: 'PT', portekiz: 'PT',
  'united kingdom': 'GB', uk: 'GB', 'u.k.': 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', grossbritannien: 'GB', 'vereinigtes konigreich': 'GB', 'royaume-uni': 'GB', 'reino unido': 'GB', 'regno unito': 'GB', ingiltere: 'GB', великобритания: 'GB', イギリス: 'GB', 英国: 'GB', 영국: 'GB',
  ireland: 'IE', irland: 'IE', irlande: 'IE', eire: 'IE', 'united states': 'US', 'united states of america': 'US', usa: 'US', 'u.s.a.': 'US', 'u.s.': 'US', us: 'US', america: 'US', vereinigte_staaten: 'US', 'vereinigte staaten': 'US', 'etats-unis': 'US', 'estados unidos': 'US', 'stati uniti': 'US', abd: 'US', сша: 'US', 'amerika serikat': 'US', 'hoa ky': 'US', アメリカ: 'US', 美国: 'US', 미국: 'US', 'الولايات المتحدة': 'US', अमेरिका: 'US',
  canada: 'CA', kanada: 'CA', mexico: 'MX', mexiko: 'MX', mexique: 'MX', meksika: 'MX', brazil: 'BR', brasil: 'BR', brasilien: 'BR', bresil: 'BR', brezilya: 'BR', бразилия: 'BR',
  turkey: 'TR', turkiye: 'TR', turkei: 'TR', turquie: 'TR', turquia: 'TR', turchia: 'TR', турция: 'TR', russia: 'RU', russland: 'RU', россия: 'RU', 'russian federation': 'RU', 'российская федерация': 'RU', rusya: 'RU', russie: 'RU', rusia: 'RU',
  poland: 'PL', polen: 'PL', polska: 'PL', pologne: 'PL', polonia: 'PL', japan: 'JP', 日本: 'JP', japon: 'JP', giappone: 'JP', japao: 'JP', japonya: 'JP', япония: 'JP', 'nhat ban': 'JP', 일본: 'JP', اليابان: 'JP', जापान: 'JP',
  china: 'CN', 中国: 'CN', 中华人民共和国: 'CN', chine: 'CN', cina: 'CN', 'cin': 'CN', китай: 'CN', 'trung quoc': 'CN', 중국: 'CN', الصين: 'CN', चीन: 'CN', 'p.r. china': 'CN', prc: 'CN',
  'south korea': 'KR', korea: 'KR', 'republic of korea': 'KR', 대한민국: 'KR', 한국: 'KR', sudkorea: 'KR', 'coree du sud': 'KR', 'corea del sur': 'KR', 'guney kore': 'KR', 'южная корея': 'KR', 韓国: 'KR', 韩国: 'KR',
  india: 'IN', indien: 'IN', inde: 'IN', hindistan: 'IN', индия: 'IN', भारत: 'IN', indonesia: 'ID', indonesien: 'ID', indonesie: 'ID', endonezya: 'ID', индонезия: 'ID',
  vietnam: 'VN', 'viet nam': 'VN', вьетнам: 'VN', ベトナム: 'VN', 越南: 'VN', 베트남: 'VN', 'saudi arabia': 'SA', 'kingdom of saudi arabia': 'SA', 'saudi-arabien': 'SA', ksa: 'SA', السعودية: 'SA', 'المملكة العربية السعودية': 'SA',
  'united arab emirates': 'AE', uae: 'AE', 'u.a.e.': 'AE', 'vereinigte arabische emirate': 'AE', الإمارات: 'AE', 'الإمارات العربية المتحدة': 'AE', australia: 'AU', australien: 'AU', australie: 'AU',
  denmark: 'DK', danemark: 'DK', danmark: 'DK', sweden: 'SE', schweden: 'SE', sverige: 'SE', norway: 'NO', norwegen: 'NO', norge: 'NO', finland: 'FI', finnland: 'FI', suomi: 'FI',
  'czech republic': 'CZ', czechia: 'CZ', tschechien: 'CZ', hungary: 'HU', ungarn: 'HU', magyarorszag: 'HU', greece: 'GR', griechenland: 'GR', singapore: 'SG', singapur: 'SG', 'hong kong': 'HK', taiwan: 'TW',
  israel: 'IL', egypt: 'EG', 'south africa': 'ZA', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE', 'new zealand': 'NZ', thailand: 'TH', malaysia: 'MY', philippines: 'PH', pakistan: 'PK', qatar: 'QA', kuwait: 'KW', oman: 'OM', bahrain: 'BH',
};

/** ccTLD → country (for the default phone country and ambiguous postcodes). */
export const TLD_COUNTRY: Record<string, string> = { uk: 'GB' };
