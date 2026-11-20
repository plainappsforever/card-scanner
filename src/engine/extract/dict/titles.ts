// Job titles and departments in the 15 UI languages (SPEC rule 8, own curated list). Latin/Cyrillic/Greek entries are
// written folded (lower case, no diacritics) and matched as whole words or phrases; CJK/Hangul/Arabic/Devanagari
// entries are matched as substrings. German compounds are matched by their head word (TITLE_SUFFIXES).

export const TITLE_WORDS = [
  // English
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'ciso', 'cpo', 'chro', 'cso', 'cdo', 'vp', 'svp', 'evp', 'avp', 'founder', 'co-founder', 'cofounder', 'owner', 'co-owner', 'president', 'vice president',
  'chairman', 'chairwoman', 'chair', 'chairperson', 'director', 'managing director', 'executive director', 'manager', 'general manager', 'head', 'head of', 'lead', 'team lead', 'tech lead', 'leader',
  'partner', 'managing partner', 'senior partner', 'associate', 'principal', 'consultant', 'senior consultant', 'advisor', 'adviser', 'engineer', 'developer', 'designer', 'architect', 'analyst',
  'specialist', 'officer', 'executive', 'account executive', 'account manager', 'key account manager', 'sales representative', 'representative', 'sales rep', 'coordinator', 'administrator', 'assistant',
  'executive assistant', 'secretary', 'accountant', 'attorney', 'attorney at law', 'lawyer', 'counsel', 'general counsel', 'solicitor', 'barrister', 'notary', 'physician', 'surgeon', 'nurse', 'dentist',
  'pharmacist', 'therapist', 'physiotherapist', 'lecturer', 'researcher', 'scientist', 'technician', 'supervisor', 'superintendent', 'agent', 'broker', 'realtor', 'editor', 'journalist', 'photographer',
  'chef', 'proprietor', 'intern', 'trainee', 'apprentice', 'recruiter', 'buyer', 'planner', 'producer', 'programmer', 'strategist', 'evangelist', 'ambassador', 'treasurer', 'controller', 'auditor',
  'inspector', 'surveyor', 'foreman', 'operator', 'sales manager', 'project manager', 'product manager', 'marketing manager', 'office manager', 'store manager', 'branch manager', 'country manager',
  'regional manager', 'area manager', 'business development manager', 'chief', 'chief executive officer', 'chief technology officer', 'chief financial officer', 'chief operating officer', 'senior', 'junior',
  'staff', 'fellow', 'realtor', 'broker associate', 'clinical psychologist', 'psychologist', 'professor', 'associate professor', 'assistant professor', 'curator', 'translator', 'interpreter', 'coach', 'trainer', 'instructor', 'teacher', 'mentor', 'partner manager',
  // German
  'geschaftsfuhrer', 'geschaftsfuhrerin', 'geschaeftsfuehrer', 'geschaeftsfuehrerin', 'geschaftsfuhrender gesellschafter', 'gesellschafter', 'gesellschafterin', 'inhaber', 'inhaberin', 'prokurist',
  'prokuristin', 'vorstand', 'vorstandin', 'vorstandsvorsitzender', 'vorstandsvorsitzende', 'vorsitzender', 'vorsitzende', 'leiter', 'leiterin', 'berater', 'beraterin', 'referent', 'referentin',
  'sachbearbeiter', 'sachbearbeiterin', 'ingenieur', 'ingenieurin', 'techniker', 'technikerin', 'meister', 'meisterin', 'kaufmann', 'kauffrau', 'assistent', 'assistentin', 'sekretar', 'sekretarin',
  'rechtsanwalt', 'rechtsanwaltin', 'steuerberater', 'steuerberaterin', 'wirtschaftsprufer', 'wirtschaftspruferin', 'notar', 'notarin', 'architektin', 'entwickler', 'entwicklerin', 'mitarbeiter',
  'mitarbeiterin', 'aussendienst', 'innendienst', 'direktor', 'direktorin', 'prasident', 'prasidentin', 'arzt', 'arztin', 'zahnarzt', 'zahnarztin', 'apotheker', 'apothekerin', 'heilpraktiker',
  'heilpraktikerin', 'physiotherapeut', 'physiotherapeutin', 'handelsvertreter', 'makler', 'maklerin', 'fachanwalt', 'fachanwaltin', 'auszubildender', 'auszubildende', 'beauftragter', 'beauftragte',
  'disponent', 'disponentin', 'planer', 'planerin', 'gutachter', 'gutachterin', 'dozent', 'dozentin', 'lehrer', 'lehrerin', 'fotograf', 'fotografin', 'grafiker', 'grafikerin', 'redakteur', 'redakteurin',
  'inh', 'fachzahnarzt', 'fachzahnarztin', 'fachzahnarzte', 'zahnarzte', 'arzte', 'facharzt', 'facharztin', 'fachanwalte', 'rechtsanwalte', 'notare', 'steuerberater', 'osteopath', 'osteopathin',
  'geschaftsfuhrende gesellschafterin', 'geschaftsfuhrende gesellschafter', 'geschaftsfuhrende', 'geschaftsfuhrender', 'geschaftsleitung', 'leitung', 'teamleitung', 'projektleitung', 'bereichsleitung', 'abteilungsleitung', 'verkaufsberater', 'verkaufsberaterin', 'kundenberater', 'kundenberaterin',
  // French
  'directeur', 'directrice', 'directeur general', 'directrice generale', 'president directeur general', 'pdg', 'gerant', 'gerante', 'responsable', 'chef de projet', 'ingenieure', 'consultante',
  'conseiller', 'conseillere', 'charge', 'chargee', "charge d'affaires", "chargee d'affaires", 'commercial', 'commerciale', 'attache commercial', 'attachee commerciale', 'assistante', 'avocat', 'avocate',
  'notaire', 'expert-comptable', 'comptable', 'fondateur', 'fondatrice', 'associe', 'associee', 'technicien', 'technicienne', 'delegue', 'deleguee', 'presidente', 'vendeur', 'vendeuse',
  // Spanish / Portuguese
  'directora', 'director general', 'directora general', 'gerente', 'gerente general', 'gerente comercial', 'presidenta', 'jefe', 'jefa', 'jefe de ventas', 'ingeniero', 'ingeniera', 'consultor',
  'consultora', 'asesor', 'asesora', 'abogado', 'abogada', 'socio', 'socia', 'fundador', 'fundadora', 'ejecutivo', 'ejecutiva', 'ejecutivo de cuentas', 'coordinador', 'coordinadora', 'representante',
  'arquitecte', 'enginyer', 'enginyera', 'advocat', 'advocada', 'director comercial', 'tecnico', 'tecnica', 'administradora', 'contador', 'contadora', 'arquitecto', 'arquitecta', 'encargado', 'encargada', 'diretor', 'diretora', 'diretor comercial', 'diretora comercial', 'engenheiro',
  'engenheira', 'advogado', 'advogada', 'coordenador', 'coordenadora', 'analista', 'executivo', 'executiva', 'assessor', 'assessora', 'vendedor', 'vendedora', 'propietario', 'proprietario',
  // Italian
  'direttore', 'direttrice', 'direttore generale', 'direttore commerciale', 'direttrice vendite', 'direttore vendite', 'amministratore delegato', 'amministratore unico', 'amministratore', 'ingegnere',
  'consulente', 'avvocato', 'commercialista', 'titolare', 'agronomo', 'agronoma', 'geologo', 'geologa', 'perito', 'notaio', 'medico', 'farmacista', 'psicologo', 'psicologa', 'veterinario', 'progettista', 'fondatore', 'fondatrice', 'capo', 'geometra', 'architetto', 'agente', 'impiegato', 'impiegata', 'segretaria', 'responsabile commerciale',
  // Polish (folded: ł→l, ż/ź→z, ą→a, ę→e, ś→s, ć→c, ń→n, ó→o)
  'kierownik', 'kierownik projektu', 'dyrektor', 'dyrektor handlowy', 'prezes', 'prezes zarzadu', 'wiceprezes', 'specjalista', 'wlasciciel', 'wlascicielka', 'tlumacz', 'tlumacz przysiegly',
  'tlumaczka', 'tlumaczka przysiegla', 'inzynier', 'doradca', 'konsultant', 'radca prawny', 'adwokat', 'ksiegowa', 'przedstawiciel handlowy', 'menedzer',
  // Dutch
  'projectleider', 'directeur-eigenaar', 'eigenaar', 'adviseur', 'projectmanager', 'bedrijfsleider', 'accountmanager', 'advocaat', 'notaris', 'medewerker', 'teamleider', 'vestigingsmanager',
  // Turkish (folded: ü→u, ş→s, ı→i, ğ→g, ç→c, ö→o)
  'genel mudur', 'mudur', 'muduru', 'mudiresi', 'yonetici', 'yonetim kurulu baskani', 'baskan', 'baskani', 'satis muduru', 'muhendis', 'muhendisi', 'uzman', 'uzmani', 'danisman', 'danismani', 'avukat',
  'kurucu', 'kurucu ortak', 'ortak', 'sahibi', 'sef', 'sorumlu', 'sorumlusu', 'temsilci', 'temsilcisi', 'koordinator', 'koordinatoru', 'asistan', 'yonetmen', 'direktor', 'direktoru', 'mali musavir',
  'satis temsilcisi', 'genel mudur yardimcisi',
  // Russian (Cyrillic)
  'генеральный директор', 'директор', 'заместитель', 'руководитель', 'начальник', 'менеджер', 'инженер', 'главный инженер', 'специалист', 'консультант', 'юрист', 'адвокат', 'бухгалтер',
  'главный бухгалтер', 'президент', 'председатель', 'основатель', 'владелец', 'представитель', 'эксперт', 'аналитик', 'разработчик', 'ведущий', 'старший', 'коммерческий директор',
  // Indonesian
  'direktur', 'direktur utama', 'manajer', 'kepala', 'presiden direktur', 'komisaris', 'pemilik', 'pendiri', 'konsultan', 'insinyur', 'staf', 'sekretaris', 'koordinator', 'pengacara', 'akuntan',
  'wakil', 'manajer pemasaran', 'manajer penjualan',
  // Vietnamese (folded)
  'giam doc', 'tong giam doc', 'pho giam doc', 'truong phong', 'pho phong', 'quan ly', 'chu tich', 'ky su', 'chuyen vien', 'nhan vien', 'ke toan', 'luat su', 'tu van', 'truong nhom', 'nha sang lap',
  // P5c — German/Austrian trades and professions (no word that is also a common family name: no Koch, Maler, Schreiner …)
  'architekt', 'immobilienmakler', 'immobilienmaklerin', 'grafikdesigner', 'grafikdesignerin', 'mediengestalter', 'mediengestalterin', 'designerin', 'verwalter', 'verwalterin',
  'hausverwalter', 'hausverwalterin', 'pfleger', 'pflegerin', 'hebamme', 'konditorin', 'elektriker', 'elektrikerin', 'installateur', 'installateurin', 'optiker', 'optikerin',
  'monteur', 'monteurin', 'floristin', 'logopade', 'logopadin', 'tierarzt', 'tierarztin', 'bilanzbuchhalter', 'bilanzbuchhalterin', 'buchhalter', 'buchhalterin',
  'wirtschaftstreuhander', 'wirtschaftstreuhanderin', 'controllerin', 'kommerzialrat', 'medical science liaison', 'science liaison', 'liaison', 'medical advisor',
  // Czech / Slovak (folded: ř→r, í→i, á→a, ě→e)
  'reditel', 'reditelka', 'obchodni reditel', 'obchodni reditelka', 'generalni reditel', 'technicky reditel', 'financni reditel', 'jednatel', 'jednatelka', 'vedouci', 'manazer',
  'manazerka', 'obchodni zastupce', 'specialistka', 'konzultantka', 'inzenyr', 'projektovy manazer', 'predseda predstavenstva', 'mistopredseda', 'majitel', 'majitelka', 'asistentka', 'ucetni',
  'riaditel', 'riaditelka', 'konatel', 'konatelka',
  // Mexican / Latin-American Spanish
  'subdirector', 'subdirectora', 'subgerente', 'jefe de compras', 'jefa de compras', 'comprador', 'compradora', 'supervisora', 'asesor comercial', 'asesora comercial', 'contralor',
  'director de operaciones', 'directora de operaciones', 'gerente de planta', 'director de compras', 'directora de compras', 'auxiliar administrativo', 'licenciado', 'licenciada',
  // Portuguese
  'enologo', 'enologa', 'diretor-geral', 'diretora-geral', 'socio-gerente', 'socia-gerente', 'administrador', 'responsavel', 'tecnico comercial', 'tecnica comercial', 'gestor', 'gestora',
  'gestor de cliente', 'gestora de cliente', 'medica', 'arquiteto', 'arquiteta', 'economista', 'farmaceutico', 'farmaceutica', 'assistente', 'oenologist', 'oenologue', 'winemaker',
  // Swedish / Nordic ("VD" = verkställande direktör)
  'vd', 'vice vd', 'verkstallande direktor', 'forsaljningschef', 'marknadschef', 'ekonomichef', 'inkopschef', 'teknisk chef', 'saljare', 'saljchef', 'projektledare', 'konsult', 'grundare',
  'medgrundare', 'agare', 'styrelseordforande', 'ordforande', 'utvecklare', 'ingenjor', 'arkitekt', 'kundansvarig', 'radgivare', 'handlaggare', 'daglig leder', 'administrerende direktor',
  'toimitusjohtaja',
];

/** Matched as substrings (scripts without word spaces, or where words agglutinate). */
export const TITLE_SUBSTRINGS = [
  // Japanese
  '代表取締役', '取締役', '社長', '会長', '副社長', '専務', '常務', '執行役員', '部長', '課長', '係長', '主任', '次長', '室長', '本部長', '支店長', '所長', '顧問', '理事', 'マネージャー', 'マネジャー', 'エンジニア',
  'ディレクター', 'プロデューサー', 'デザイナー', 'コンサルタント', 'リーダー', '担当', '代表', '弁護士', '税理士', '会計士',
  // Chinese
  '总经理', '總經理', '经理', '經理', '总监', '總監', '董事长', '董事長', '董事', '副总裁', '副總裁', '总裁', '總裁', '首席执行官', '首席技术官', '工程师', '工程師', '主管', '助理', '销售经理', '业务经理', '创始人',
  '合伙人', '律师', '顾问', '总工', '厂长', '主席',
  // Korean
  '대표이사', '대표', '사장', '부사장', '부장', '과장', '차장', '팀장', '이사', '상무', '전무', '실장', '주임', '대리', '사원', '매니저', '엔지니어', '본부장', '센터장', '연구원', '수석', '책임', '선임', '변호사', '회장',
  // Arabic
  'مدير', 'المدير', 'الرئيس التنفيذي', 'رئيس', 'مهندس', 'مستشار', 'محامي', 'محاسب', 'مؤسس', 'مالك', 'مشرف', 'منسق', 'مندوب', 'أخصائي', 'نائب',
  // Hindi
  'निदेशक', 'प्रबंधक', 'प्रबंध निदेशक', 'अध्यक्ष', 'मालिक', 'संस्थापक', 'इंजीनियर', 'अभियंता', 'सलाहकार', 'अधिकारी', 'मुख्य कार्यकारी अधिकारी', 'सहायक', 'वकील', 'प्रमुख',
];

/** German compound heads: "Vertriebsleiter", "Projektmanagerin", "Elektroingenieur". Matched at the end of a word. */
export const TITLE_SUFFIXES = [
  'leiter', 'leiterin', 'manager', 'managerin', 'ingenieur', 'ingenieurin', 'berater', 'beraterin', 'referent', 'referentin', 'direktor', 'direktorin', 'assistent', 'assistentin', 'beauftragter',
  'beauftragte', 'techniker', 'technikerin', 'meister', 'meisterin', 'kaufmann', 'kauffrau', 'planer', 'planerin', 'entwickler', 'entwicklerin', 'architekt', 'architektin', 'vertreter', 'vertreterin',
  'leitung', 'leider', 'arzte', 'anwalte', 'designer', 'designerin', 'makler', 'maklerin', 'gestalter', 'gestalterin', 'chef', 'ansvarig', 'ledare', 'redakteur', 'redakteurin', 'berater', 'therapeut', 'therapeutin', 'arzt', 'arztin', 'anwalt', 'spezialist', 'spezialistin', 'koordinator', 'koordinatorin', 'mitarbeiter', 'mitarbeiterin', 'sachverstandiger', 'sachverstandige', 'anwalt', 'anwaltin',
];

export const DEPARTMENT_WORDS = [
  'sales', 'marketing', 'vertrieb', 'verkauf', 'einkauf', 'purchasing', 'procurement', 'human resources', 'hr', 'personal', 'personalabteilung', 'finance', 'finanzen', 'buchhaltung', 'accounting',
  'controlling', 'it', 'information technology', 'research and development', 'research & development', 'r&d', 'f&e', 'forschung und entwicklung', 'forschung & entwicklung', 'entwicklung', 'development',
  'engineering', 'produktion', 'production', 'logistik', 'logistics', 'customer service', 'kundenservice', 'kundendienst', 'support', 'technical support', 'legal', 'rechtsabteilung', 'compliance',
  'operations', 'qualitatsmanagement', 'quality', 'qualitat', 'quality assurance', 'communications', 'corporate communications', 'kommunikation', 'unternehmenskommunikation', 'public relations', 'pr',
  'presse', 'business development', 'export', 'import', 'abteilung', 'department', 'dept', 'dept.', 'division', 'bereich', 'geschaftsbereich', 'administration', 'verwaltung', 'innovation', 'strategy',
  'strategie', 'facility management', 'service', 'aftersales', 'after sales', 'key account', 'international sales', 'export sales', 'außendienst', 'aussendienst', 'innendienst', 'technik', 'konstruktion',
  'service commercial', 'direction commerciale', 'ressources humaines', 'comptabilite', 'achats', 'departement', 'ventas', 'compras', 'recursos humanos', 'contabilidad', 'finanzas', 'departamento',
  'departamento comercial', 'ufficio commerciale', 'vendite', 'acquisti', 'risorse umane', 'amministrazione', 'ufficio tecnico', 'vendas', 'financeiro', 'comercial', 'satis', 'pazarlama', 'satin alma',
  'insan kaynaklari', 'muhasebe', 'departmani', 'bolumu', 'отдел продаж', 'отдел', 'департамент', 'бухгалтерия', 'маркетинг', 'divisi', 'departemen', 'bagian', 'penjualan', 'pemasaran',
  'phong kinh doanh', 'phong', 'ban', 'procurement', 'litigation',
  // P5c — units seen on B1/B2 cards and their neighbours (tuning; listed in docs/V1_LOG.md P5c)
  'forschung', 'research', 'tax advisory', 'tax & legal', 'advisory', 'audit', 'assurance', 'wealth management', 'gestion de fortune', 'gestion de patrimoine', 'private banking',
  'asset management', 'corporate finance', 'commercial property', 'property management', 'real estate', 'messtechnik', 'optische messtechnik', 'kinh doanh', 'nhan su',
  'отдела', 'отдела продаж', 'отдел маркетинга', 'dzial', 'dzialu', 'zakupow', 'sprzedazy', 'eksportu', 'marketingu', 'dzial zakupow', 'dzialu zakupow', 'dzial sprzedazy',
  'oddeleni', 'obchodni oddeleni', 'inkop', 'forsaljning', 'ekonomi', 'mercadotecnia', 'operaciones', 'comercial exterior', 'vendas', 'compras',
  // hospital departments ("Klinik für Kardiologie")
  'kardiologie', 'cardiology', 'radiologie', 'radiology', 'chirurgie', 'surgery', 'orthopadie', 'orthopaedics', 'orthopedics', 'neurologie', 'neurology', 'onkologie', 'oncology',
  'padiatrie', 'pediatrics', 'paediatrics', 'gynakologie', 'urologie', 'urology', 'dermatologie', 'dermatology', 'innere medizin', 'internal medicine', 'anasthesiologie', 'psychiatrie',
  'notaufnahme', 'intensivmedizin',
];

export const DEPARTMENT_SUBSTRINGS = ['営業部', '事業部', '本部', '開発部', '技術部', '総務部', '経理部', '人事部', '営業課', '销售部', '市场部', '事业部', '技术部', '财务部', '人事部', '部门', '영업부', '부서',
  '사업부', '영업팀', '마케팅팀', '기술팀', 'قسم', 'إدارة', 'المبيعات', 'التسويق', 'विभाग', 'बिक्री', 'विपणन'];

/** Name prefixes and suffixes (SPEC N1), folded, without the trailing dot. */
export const NAME_PREFIXES = new Set([
  'dr', 'prof', 'professor', 'dipl.-ing', 'dipl-ing', 'dipl.-kfm', 'dipl.-kffr', 'dipl.-inf', 'dipl.-wirt.-ing', 'dipl.-betriebsw', 'dipl.-psych', 'dipl', 'ing', 'mag', 'mr', 'mrs', 'ms', 'mx', 'miss',
  'mme', 'mlle', 'herr', 'frau', 'sr', 'sra', 'srta', 'sig', 'sig.ra', 'dott', 'dott.ssa', 'avv', 'arch', 'geom', 'ir', 'drs', 'univ.-prof', 'priv.-doz', 'dr.-ing', 'dr. med', 'med', 'h.c', 'rer. nat',
  'maitre', 'me', 'av', 'lic', 'licda', 'arq', 'mtro', 'mtra', 'mgr', 'inz', 'hab', 'habil', 'med', 'dent', 'vet', 'rer', 'nat', 'phil', 'jur', 'oec', 'sc', 'techn', 'pharm', 'dr hab',
  'eng', 'eng.a', 'eng.o', 'enga', 'dra', 'dr.a', 'arq.a', 'prof.a', 'lic.a', 'lic.o', 'ing.a',
  // Austrian feminine and double degrees (P5d, B3 at-g25 "Mag.a Elif Kaya-Brunner"): Mag.a, MMag., Dr.in, DDr., Ing.in
  'mag.a', 'mmag', 'mmag.a', 'dr.in', 'ddr', 'ddr.in', 'ing.in', 'di.in', 'dipl.-ing.in', 'bakk', 'bakk.a',
  'bay', 'bayan', 'г-н', 'г-жа', 'bapak', 'bpk', 'ibu', 'shri', 'smt', 'sri', 'السيد', 'السيدة', 'د', 'م', 'श्री', 'श्रीमती', 'डॉ', 'stb', 'wp', 'rae', 'dkfm',
]);
export const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'ph.d', 'mba', 'm.sc', 'msc', 'b.sc', 'bsc', 'm.a', 'b.a', 'md', 'm.d', 'esq', 'cpa', 'pe', 'p.eng', 'llm', 'll.m', 'm.eng', 'b.eng', 'mph', 'dds', 'cfa', 'pmp', 'acca', 'frcs', 'mrcs', 'dipl.-ing', 'ma', 'ba',
  // credentials printed after US/UK names (review M4) and Indonesian academic degrees ("Dewi Wibowo, S.E., M.M.")
  'pt', 'dpt', 'ot', 'otr', 'rn', 'np', 'pa-c', 'dnp', 'lcsw', 'lmft', 'cfp', 'cfa', 'frcp', 'mrcp', 'mbbs', 'aia', 'faia', 'leed ap', 'dclinpsy', 'cpsychol', 'mbe', 'obe', 'cbe', 'qc', 'kc', 'frics', 'mrics',
  's.e', 'm.m', 's.t', 'm.t', 's.h', 'm.h', 's.kom', 'm.kom', 's.pd', 'm.pd', 's.si', 'm.si', 's.ked', 's.ip', 's.sos', 'm.b.a', 'm.sc.', 'dipl.-kfm',
  // UK/IE/CH professional bodies and degrees printed after the name (P5c): "Priya Shah FCCA", "lic. oec. HSG"
  'fcca', 'aca', 'fca', 'cima', 'acma', 'fcma', 'cta', 'hsg', 'ceng', 'mcips', 'chfc', 'clu', 'llb', 'll.b', 'jd', 'cipd', 'mcipd', 'fcipd', 'riba', 'mrtpi', 'frsa', 'fcii', 'acii', 'cmgr', 'fcmi', 'mcmi',
  // UK learned societies and engineering bodies (P5d, B3 uk-a20 "Dr Chidi Okonkwo-Hale FRSC")
  'frsc', 'mrsc', 'cchem', 'csci', 'frs', 'freng', 'fiet', 'miet', 'cphys', 'minstp', 'finstp', 'fimeche', 'imeche', 'fice', 'mice', 'fistructe', 'fba', 'fmedsci', 'fhea', 'sfhea', 'pfhea',
  'frcog', 'frcpath', 'frcr', 'frcgp', 'mrcgp', 'frcse', 'frcvs', 'mrcvs', 'frcpsych', 'mrcpsych', 'fds', 'bds', 'frgs', 'fras', 'frhists', 'fsa']);
/** Lower-case particles inside Latin family names. */
export const NAME_PARTICLES = new Set(['i', 'ni', 'nic', 'ui', 'von', 'van', 'de', 'der', 'den', 'di', 'da', 'du', 'del', 'della', 'des', 'la', 'le', 'bin', 'binti', 'al', 'el', 'ibn', 'y', 'dos', 'das', 'do', 'zu', 'ten', 'ter', 'vom', 'zum', 'zur', "d'", 'st', 'mac', 'af', 'av']);
