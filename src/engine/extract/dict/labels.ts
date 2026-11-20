// Label words in the 15 UI languages (own curated list, D14). Matching is on folded text (lower case, Latin
// diacritics removed — see `fold` in ../normalize.ts), so entries are written folded ("telefono", not "teléfono").
import type { PhoneType } from '../../contact';

/** Phone label → type. `generic` labels ("Tel", "Phone") say "a phone" — the number's metadata decides mobile/work. */
export type PhoneLabel = { type: PhoneType; generic?: boolean };

const generic: PhoneLabel = { type: 'work', generic: true };
const L = (type: PhoneType): PhoneLabel => ({ type });

export const PHONE_LABELS: Record<string, PhoneLabel> = {
  // generic
  t: generic, tel: generic, tel1: generic, tel2: generic, telefon: generic, telephone: generic, tele: generic, tlf: generic, phone: generic, ph: generic, p: generic, fon: generic, fone: generic,
  telefono: generic, telefone: generic, telf: generic, 'tel.': generic, telp: generic, telpon: generic, 'telepon': generic, 'dt': generic, 'đt': generic, 'dien thoai': generic,
  тел: generic, телефон: generic, 'т': generic, 電話: generic, 电话: generic, 電話番号: generic, 전화: generic, 'tel no': generic, 'phone no': generic,
  هاتف: generic, 'ت': generic, फोन: generic, 'फ़ोन': generic, दूरभाष: generic, 'n°': generic,
  // mobile
  m: L('mobile'), mob: L('mobile'), mobile: L('mobile'), mobil: L('mobile'), mobiltelefon: L('mobile'), handy: L('mobile'), cell: L('mobile'), cellular: L('mobile'), cellphone: L('mobile'), c: L('mobile'),
  cel: L('mobile'), celular: L('mobile'), movil: L('mobile'), portable: L('mobile'), port: L('mobile'), gsm: L('mobile'), hp: L('mobile'), handphone: L('mobile'), ponsel: L('mobile'), cep: L('mobile'), 'cep tel': L('mobile'),
  'h.p': L('mobile'), 'h.p.': L('mobile'), 'h/p': L('mobile'), cellulare: L('mobile'), mobiele: L('mobile'), mobiel: L('mobile'), 'di dong': L('mobile'), 'dđ': L('mobile'), моб: L('mobile'), мобильный: L('mobile'), сот: L('mobile'), сотовый: L('mobile'),
  携帯: L('mobile'), 携帯電話: L('mobile'), 手机: L('mobile'), 手機: L('mobile'), 移动电话: L('mobile'), 휴대폰: L('mobile'), 핸드폰: L('mobile'), 휴대전화: L('mobile'), 모바일: L('mobile'), hp번호: L('mobile'),
  جوال: L('mobile'), محمول: L('mobile'), موبايل: L('mobile'), मोबाइल: L('mobile'), whatsapp: L('mobile'), wa: L('mobile'), 'mobile phone': L('mobile'),
  // work (specific)
  o: L('work'), off: L('work'), office: L('work'), buro: L('work'), buero: L('work'), direct: L('work'), direkt: L('work'), durchwahl: L('work'), dw: L('work'), d: L('work'), zentrale: L('work'),
  main: L('work'), switchboard: L('work'), work: L('work'), business: L('work'), geschaftlich: L('work'), bureau: L('work'), standard: L('work'), fixe: L('work'), oficina: L('work'), ufficio: L('work'),
  escritorio: L('work'), is: L('work'), kantor: L('work'), 'van phong': L('work'), офис: L('work'), рабочий: L('work'), 直通: L('work'), 代表: L('work'), 직통: L('work'), 대표: L('work'), 사무실: L('work'),
  sekretariat: L('work'), secretariat: L('work'), empfang: L('work'), rezeption: L('work'), reception: L('work'), assistenz: L('work'), vorzimmer: L('work'), 座机: L('work'), 办公: L('work'), 办公室: L('work'), مكتب: L('work'), कार्यालय: L('work'), 'direct line': L('work'), 'dir': L('work'), tf: L('work'),
  // "DD +44 (0)113 …" = direct dial (UK); the Vietnamese "DĐ" (di động = mobile) keeps its Đ in the folded text (P5d)
  dd: L('work'), ddi: L('work'), 'direct dial': L('work'),
  // fax
  f: L('fax'), fax: L('fax'), telefax: L('fax'), fx: L('fax'), faks: L('fax'), 'fax no': L('fax'), факс: L('fax'), ファックス: L('fax'), ファクス: L('fax'), 传真: L('fax'), 傳真: L('fax'), 팩스: L('fax'), فاكس: L('fax'), फैक्स: L('fax'),
  // hotlines and service lines (the user files them as "other")
  hotline: L('other'), 'service-hotline': L('other'), servicehotline: L('other'), notdienst: L('other'), notruf: L('other'), storungsdienst: L('other'), bereitschaft: L('other'),
  'emergency': L('other'), 'helpline': L('other'), 'support line': L('other'), termine: generic, terminvereinbarung: generic, reservierung: generic, reservations: generic, bookings: generic,
  // home
  h: L('home'), home: L('home'), privat: L('home'), private: L('home'), domicile: L('home'), casa: L('home'), residencia: L('home'), ev: L('home'), rumah: L('home'), nha: L('home'), 自宅: L('home'),
  住宅: L('home'), 家: L('home'), 집: L('home'), منزل: L('home'), घर: L('home'), дом: L('home'), домашний: L('home'),
};

/** E-mail labels (a missing "@" is repaired only in a labelled segment, SPEC rule 3). */
export const EMAIL_LABELS = new Set([
  'mailto', 'e', 'e-mail', 'email', 'mail', 'e-post', 'epost', 'courriel', 'correo', 'correo electronico', 'posta', 'e-posta', 'eposta', 'surel', 'surat elektronik', 'thu dien tu', 'почта', 'эл. почта', 'e-mail адрес',
  '邮箱', '邮件', '電子郵件', '電子メール', 'メール', 'eメール', '이메일', '메일', 'بريد', 'البريد', 'البريد الإلكتروني', 'ईमेल', 'ई-मेल', 'mel',
]);

/** Website labels. */
export const URL_LABELS = new Set([
  'w', 'web', 'www', 'website', 'web site', 'internet', 'homepage', 'url', 'site', 'sitio', 'sitio web', 'sito', 'sito web', 'situs', 'trang web', 'сайт', 'веб-сайт', '网址', '網址', '网站', 'ホームページ', 'hp', 'ウェブ',
  '웹사이트', '홈페이지', 'موقع', 'الموقع', 'वेबसाइट',
]);

/** Social labels → service. */
export const SOCIAL_LABELS: Record<string, import('../../contact').SocialService> = {
  linkedin: 'linkedin', 'linked in': 'linkedin', in: 'linkedin', xing: 'xing', twitter: 'x', x: 'x', instagram: 'instagram', insta: 'instagram', ig: 'instagram', facebook: 'facebook', fb: 'facebook',
  github: 'github', youtube: 'youtube', yt: 'youtube', tiktok: 'tiktok', wechat: 'wechat', weixin: 'wechat', 微信: 'wechat', 'wechat id': 'wechat', line: 'line', 'line id': 'line', 'line@': 'line',
  telegram: 'telegram', tg: 'telegram', skype: 'other', kakaotalk: 'other', kakao: 'other', 카카오톡: 'other', qq: 'other', viber: 'other', threads: 'other', bluesky: 'other', mastodon: 'other',
};

/** Segments with these words carry registry, tax or bank numbers — never phone numbers (SPEC rule 5). */
export const NOT_PHONE_WORDS = [
  'ust-idnr', 'ust-id', 'ustid', 'ust.-id', 'ust id', 'ust.-idnr', 'uid', 'vat', 'tva', 'iva', 'p.iva', 'p. iva', 'partita iva', 'cif', 'nif', 'nie', 'gstin', 'gst', 'pan', 'npwp', 'инн', 'кпп', 'огрн', 'окпо',
  'ein', 'tax', 'steuernummer', 'steuer-nr', 'st.-nr', 'stnr', 'mwst', 'btw', 'kvk', 'siret', 'siren', 'rcs', 'naf', 'ape', 'cnpj', 'cpf', 'abn', 'acn', 'hrb', 'hra', 'handelsregister',
  'registergericht', 'amtsgericht', 'register court', 'company no', 'company number', 'registered in', 'registered office', 'reg. no', 'reg no', 'registration', 'iban', 'bic', 'swift', 'blz', 'konto', 'kto',
  'account', 'sort code', 'bank', 'sparkasse', 'volksbank', 'postbank', 'raiffeisen', '法人番号', '登録番号', '统一社会信用代码', '税号', '사업자등록번호', '사업자번호', '사업자', 'رقم ضريبي', 'الرقم الضريبي',
  'سجل تجاري', 'mst', 'ma so thue', 'vergi', 'mersis', 'ticaret sicil', 'sicil', 'kdv', 'firmenbuch', 'fn', 'zvr', 'gln', 'ean', 'duns', 'lei', 'bce', 'kbo', 'ondernemingsnummer', 'nip', 'regon', 'krs',
  'cin', 'llpin', 'tan', 'nib', 'siup', 'tdp', 'cr', 'c.r.', 'trn', 'oib', 'cuit', 'rut', 'rfc', 'curp',
  // P5c: Nordic/Czech/Taiwanese registry labels
  'org.nr', 'org.-nr', 'org nr', 'orgnr', 'organisationsnummer', 'org.nr.', 'momsnr', 'cvr', 'y-tunnus', 'ico', 'dic', '統一編號', '统一编号', 'regnr', 'reg.nr',
];
