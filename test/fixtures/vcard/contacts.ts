// vCard/CSV fixture contacts (P2, written by the builder — not blind; the Mac referee is the independent judge, A7):
// names in the 15 UI languages, emoji, long notes that fold across multi-byte characters, escapes, every phone type.
import type { ContactCard } from '@/engine/contact';
import { emptyAddress, emptyContact, emptyName } from '@/engine/contact';

const name = (given: string, family: string, more: Partial<ReturnType<typeof emptyName>> = {}) => ({ ...emptyName(), given, family, ...more });
const addr = (street: string, postcode: string, city: string, country: string, countryCode: string, region = '') => ({ ...emptyAddress(), street, postcode, city, country, countryCode, region });

export const VCARD_CONTACTS: ContactCard[] = [
  {
    ...emptyContact(),
    name: name('Anna', 'Weber', { prefix: 'Dr.', middle: 'Maria' }),
    company: 'ACME GmbH',
    department: 'Vertrieb',
    title: 'Geschäftsführerin',
    phones: [
      { value: '+49 30 1234567', type: 'work', e164: '+49301234567' },
      { value: '+49 171 1234567', type: 'mobile', e164: '+491711234567' },
      { value: '+49 30 1234568', type: 'fax', e164: '+49301234568' },
    ],
    emails: [{ value: 'anna.weber@acme-de.example', type: 'work' }],
    urls: ['www.acme.de'],
    socials: [{ service: 'linkedin', value: 'https://www.linkedin.com/in/anna-weber' }, { service: 'xing', value: 'https://www.xing.com/profile/Anna_Weber' }],
    addresses: [addr('Musterstraße 12', '10115', 'Berlin', 'Deutschland', 'DE')],
    notes: 'Wants a quote; call after 3 pm, not before.',
    event: 'Hannover Messe 2026',
    metOn: '2026-04-20',
    metWhere: 'Halle 7, Stand B12',
    tags: ['Lead', 'Supplier, maybe'],
  },
  { ...emptyContact(), name: name('Ünal', 'Öztürk'), company: 'Korvan Teknoloji A.Ş.', title: 'Satış Müdürü', phones: [{ value: '+90 212 555 12 34', type: 'work' }], emails: [{ value: 'unal@korvan-com-tr.example', type: 'work' }], addresses: [addr('Büyükdere Cad. No: 123', '34394', 'İstanbul', 'Türkiye', 'TR', 'Şişli')] },
  { ...emptyContact(), name: name('太郎', '山田'), otherName: 'Taro Yamada', company: '株式会社山田製造', title: '営業部長', phones: [{ value: '+81 3-1234-5678', type: 'work' }], emails: [{ value: 'yamada@yamada-seizo-co-jp.example', type: 'work' }], addresses: [addr('丸の内1-2-3', '100-0005', '千代田区', '日本', 'JP', '東京都')] },
  { ...emptyContact(), name: name('伟', '王'), company: '上海瑞珩科技有限公司', title: '总经理', phones: [{ value: '+86 138 0013 8000', type: 'mobile' }], emails: [{ value: 'wang.wei@ruihengkj-cn.example', type: 'work' }] },
  { ...emptyContact(), name: name('민준', '김'), company: '(주)한빛소프트', title: '부장', phones: [{ value: '+82 10-1234-5678', type: 'mobile' }], socials: [{ service: 'line', value: 'minjun.kim' }] },
  { ...emptyContact(), name: name('Дмитрий', 'Иванов', { middle: 'Сергеевич' }), company: 'ООО «Север»', title: 'Генеральный директор', phones: [{ value: '+7 495 123-45-67', type: 'work' }] },
  { ...emptyContact(), name: name('محمد', 'العتيبي'), company: 'شركة الأفق للتقنية', title: 'مدير المبيعات', phones: [{ value: '+966 11 234 5678', type: 'work' }], emails: [{ value: 'm.otaibi@alnawres-sa.example', type: 'work' }] },
  { ...emptyContact(), name: name('राहुल', 'शर्मा'), company: 'शर्मा इंजीनियरिंग', title: 'निदेशक', phones: [{ value: '+91 98765 43210', type: 'mobile' }] },
  { ...emptyContact(), name: name('Nguyễn Văn', 'An'), company: 'Công ty TNHH Ánh Dương', title: 'Giám đốc', phones: [{ value: '+84 28 3822 1234', type: 'work' }] },
  { ...emptyContact(), name: name('Siti', 'Rahayu'), company: 'PT Maju Bersama Tbk', title: 'Manajer Pemasaran', phones: [{ value: '+62 21 5790 1234', type: 'work' }] },
  { ...emptyContact(), name: name('João', 'Gonçalves'), company: 'Soluções Ágeis Ltda.', title: 'Diretor Comercial', addresses: [addr('Avenida Paulista, 1000', '01310-100', 'São Paulo', 'Brasil', 'BR', 'SP')] },
  { ...emptyContact(), name: name('José', 'García Márquez'), company: 'Ibérica S.L.', title: 'Gerente', phones: [{ value: '+34 91 123 45 67', type: 'work' }] },
  { ...emptyContact(), name: name('Françoise', "D'Arcy-Lefèvre", { prefix: 'Mme' }), company: 'Lumaryne SARL', title: 'Directrice générale', emails: [{ value: 'f.darcy@lumaryne-fr.example', type: 'work' }] },
  { ...emptyContact(), name: name('Giulia', 'Bianchi'), company: 'Ferro S.p.A.', title: 'Direttrice vendite', phones: [{ value: '+39 02 1234 5678', type: 'work' }] },
  { ...emptyContact(), name: name('Chris', "O'Neil", { suffix: 'Jr.' }), company: 'Smith, Jones & Partners; LLP', title: 'Partner\\Counsel', phones: [{ value: '+1 415 555 0123', type: 'home' }, { value: '+1 415 555 0199', type: 'other' }], emails: [{ value: 'chris@smithjonesllp-com.example', type: 'home' }, { value: 'c.oneil@gmail-com.example', type: 'other' }] },
  {
    ...emptyContact(),
    name: name('Zoë', 'Ångström 🎉'),
    company: 'Emoji 😀 Labs',
    notes: `${'Ein sehr langer Notiztext mit Umlauten äöü und Emoji 👩\u200D💻🚀 über mehrere gefaltete Zeilen; '.repeat(4)}Ende.\nZweite Zeile, mit Komma.`,
    tags: ['🔥 hot', 'a;b'],
  },
  { ...emptyContact(), company: 'Only Company Inc.', emails: [{ value: 'hello@only.example', type: 'work' }] },
  { ...emptyContact(), emails: [{ value: 'nobody@example.org', type: 'other' }] },
];
