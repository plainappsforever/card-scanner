// Rule 6 — postal addresses (SPEC §5.1). Postcode/city patterns per country; the street is the same segment before the
// postcode ("Musterstraße 12, 10115 Berlin") or a street-like line directly above (≤ 2 lines); the country is a country
// name after the city or on the line below. postcode+city+street → high; postcode+city → medium; a street keyword line
// without any postcode on the card → low with the whole block in `street` (never invented parts). Pure.
import type { Address } from '../../contact';
import { emptyAddress } from '../../contact';
import { COUNTRIES, PO_BOX, PO_BOX_WORDS, STREET_SUBSTRINGS, STREET_WORDS } from '../dict/address';
import { NOT_PHONE_WORDS, PHONE_LABELS } from '../dict/labels';
import { alternation, columnAbove, consume, consumeAll, directlyBelow, fold, foldKeep, hasBoxes, repairDigits, type Seg } from '../normalize';

import type { Ctx } from './ctx';

const CITY = "\\p{Lu}[\\p{L}\\p{M}'.-]*(?:[ -](?:[\\p{L}\\p{M}'.-]+))*?";
const CITY_TAIL = "(?=\\s*(?:$|[,;(/])|\\s+-\\s|\\s+(?:[cC]edex|CEDEX)\\b|\\s{2,})";

const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR';
const CA_PROV = 'AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT';
const AU_STATES = 'NSW|VIC|QLD|WA|SA|TAS|ACT|NT';
/** Indian states (folded) — printed before the PIN they are the region, not the city. Delhi, Chandigarh and Puducherry are cities too. */
const IN_STATES = /^(?:andhra pradesh|arunachal pradesh|assam|bihar|chhattisgarh|goa|gujarat|haryana|himachal pradesh|jharkhand|karnataka|kerala|madhya pradesh|maharashtra|manipur|meghalaya|mizoram|nagaland|odisha|orissa|punjab|rajasthan|sikkim|tamil nadu|tamilnadu|telangana|tripura|uttar pradesh|uttarakhand|west bengal|jammu and kashmir|jammu & kashmir|ladakh)$/;
const PREFIX_COUNTRY: Record<string, string> = { D: 'DE', DE: 'DE', A: 'AT', AT: 'AT', CH: 'CH', F: 'FR', FR: 'FR', B: 'BE', BE: 'BE', L: 'LU', LU: 'LU', I: 'IT', IT: 'IT', E: 'ES', ES: 'ES', NL: 'NL', DK: 'DK', S: 'SE', SE: 'SE', N: 'NO', NO: 'NO', FIN: 'FI', FI: 'FI', PL: 'PL', CZ: 'CZ', H: 'HU', HU: 'HU', P: 'PT', PT: 'PT', TR: 'TR' };
const FIVE_DIGIT = new Set(['DE', 'FR', 'IT', 'ES', 'TR', 'MX', 'ID', 'SA', 'FI', 'MY', 'TH', 'KR', 'US', 'UA', 'HR', 'EG']);
/** Countries that print the house number before the street (a leading number is not a postcode). */
const NUMBER_FIRST = new Set(['US', 'CA', 'GB', 'IE', 'AU', 'NZ', 'IN', 'SG', 'JP', 'PH']);
const FOUR_DIGIT = new Set(['AT', 'CH', 'BE', 'LU', 'DK', 'NO', 'HU', 'AU', 'ZA', 'PH', 'NZ', 'SI', 'BG', 'CY', 'GE', 'AM', 'TN', 'BD']);

type Hit = { postcode: string; city: string; region?: string; country?: string; street?: string; start: number; end: number; rule: string };

const STREET_ALT = alternation(STREET_WORDS);
const STREET_WORD_RE = new RegExp(`(?<![\\p{L}])(?:${STREET_ALT})(?![\\p{L}])\\.?`, 'iu');
const STRONG_STREET = /(stra(ß|ss)e|str\.|(?<![\p{L}])c\/\s?\p{Lu}|(?<![\p{L}])(street|road|avenue|boulevard|rue|via|viale|piazza|calle|avenida|rua|caddesi|cad\.|sokak|sok\.|mahallesi|mah\.|улица|ул\.|проспект|jalan|jl\.|đường|straat|laan|plein|gasse|allee|weg|platz)(?![\p{L}]))/iu;
const DE_COMPOUND = /\p{L}{2,}(stra(ß|ss)e|str\.?|weg|platz|allee|gasse|ring|damm|ufer|chaussee|steig|pfad|markt|hof|graben|wall|kamp|stieg|berg|park)\s*\d/iu;
/** A registry/tax line ("CIN: U72200…", "Org.nr 556123-4567", "統一編號 12345678") is never an address (P5c). */
const REGISTRY_START = new RegExp(`^(?:${alternation(NOT_PHONE_WORDS.filter((w) => !/^(registered office|bank|account|sparkasse|volksbank|raiffeisen|postbank)$/.test(w)))})(?![\\p{L}])`, 'iu');
/** German register entries printed without a registry word ("PR 1187 AG Hamburg" = Partnerschaftsregister, "VR 4711", "HRB 712345"). */
const REGISTER_ENTRY = /^(?:HRA|HRB|PR|VR|GnR|GsR|PartR)\s?\d{2,}|(?<![\p{L}])(?:amtsgericht|registergericht|handelsregister|partnerschaftsregister|vereinsregister|genossenschaftsregister|firmenbuch)(?![\p{L}])/iu;
export function isRegistryLine(text: string): boolean {
  return REGISTRY_START.test(fold(text.trim())) || REGISTER_ENTRY.test(text.trim());
}
/** A PO box number is never a postcode: "P.O. Box 123456" (P5c). */
const PO_BOX_BEFORE = new RegExp(`(?:${PO_BOX_WORDS})[\\s.:#]*$`, 'iu');
/** A postcode label alone before the postcode ("CEP 01310-200", "PLZ 79098") is not a street. */
const POSTCODE_LABEL = /^(?:cep|plz|zip|zip code|postcode|post code|postal code|c\.?\s?p\.?|pin|pin code|code postal)[\s.:]*$/iu;
const PHONE_LABEL_RE = new RegExp(`(?<![\\p{L}])(?:${alternation(Object.keys(PHONE_LABELS).filter((k) => k.length > 1))})(?![\\p{L}])\\s*[.:]?\\s*[+(\\d]`, 'iu');

/** A street-shaped text: a street keyword (or German compound) with a house number, or a strong keyword, or a PO box. */
export function looksLikeStreet(text: string): boolean {
  if (PO_BOX.test(text)) return true;
  if (DE_COMPOUND.test(text)) return true;
  const hasDigit = /\d/.test(text);
  if (STREET_SUBSTRINGS.some((s) => text.includes(s)) && hasDigit && /[\p{Script=Han}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Devanagari}]/u.test(text)) return true;
  if (STRONG_STREET.test(text) && (hasDigit || text.split(/\s+/).length <= 5)) return true;
  return hasDigit && STREET_WORD_RE.test(text) && !/@|www\.|https?:/i.test(text) && /\d+\s*[a-z]?\b|\b\d+/i.test(text);
}

function countryOfText(text: string): string | undefined {
  const f = fold(text).replace(/[.,;:()]+$/g, '').trim();
  return COUNTRIES[f] ?? COUNTRIES[f.replace(/\./g, '')];
}

/** "Berlin, Germany" → { city: 'Berlin', country: 'Germany', code: 'DE' } */
function splitCityCountry(city: string): { city: string; country: string; code?: string } {
  const parts = city.split(/\s*,\s*|\s+-\s+/);
  const particle = (s: string) => /(?:^|\s)(de|do|da|di|del|am|im|an|upon|on|sur|sous|en|la)$/iu.test(s);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const code = countryOfText(last);
    if (code) return { city: parts.slice(0, -1).join(', '), country: last, code };
  }
  const words = city.split(' ');
  if (words.length > 1 && !particle(words.slice(0, -1).join(' '))) {
    const code = countryOfText(words[words.length - 1]);
    if (code) return { city: words.slice(0, -1).join(' '), country: words[words.length - 1], code };
  }
  return { city, country: '' };
}

const ADDRESS_LABEL = /^\s*(地址|住所|주소|adresse|address|addr\.?|add\.?(?=\s*:)|anschrift|direcci[oó]n|indirizzo|endere[cç]o|adres|адрес|alamat|đ[iị]a ch[iỉ]|العنوان|पता)\s*[:：.]?\s*/iu;

/** A line of words ending in a house number ("Keizersgracht 123", "Am Mühlbach 2", "Rua Augusta, 120") or a number first ("14 Clerkenwell Green"). */
const HOUSE_NUMBER_LINE = /^(?:[\p{L}][\p{L}\p{M}.'’\- ]*[\p{L}.],?\s\d{1,5}\s?[a-zA-Z]?(?:\s?[-/]\s?\d{1,4}[a-zA-Z]?)?|\d{1,5}[a-zA-Z]?,?\s+[\p{L}][\p{L}\p{M}.'’\- ]+)$/u;

/** "Postbus l234", "BP 3O122": OCR confusables in a PO box number. */
function fixPoBox(t: string): string {
  return t.replace(new RegExp(`((?:${PO_BOX_WORDS}|bp)[\\s.:]*)([\\dOolI|SB]{2,}(?:\\s[\\dOolI|SB]{2,})*)`, 'iu'), (m, w: string, num: string) => (/\d/.test(num) ? w + num.replace(/[OolI|SB]/g, (c) => ({ O: '0', o: '0', l: '1', I: '1', '|': '1', S: '5', B: '8' })[c] ?? c) : m));
}

/** An address line that continues on the next one: ends with a comma ("Plot No. 42, MIDC Industrial Area,"), or a Mexican "Col." / Brazilian "Bairro" district line. */
const CONTINUES = /,\s*$/;
const DISTRICT_LINE = /^(?:col\.?|colonia|fracc\.?|fraccionamiento|barrio|bairro|mah\.?|mahallesi|quartier)\s+\p{L}/iu;

function cleanCity(c: string): string {
  return c.replace(/\s+([cC]edex|CEDEX)(\s+\d+)?$/, '').replace(/[\s,;:.-]+$/, '').trim();
}

/** Postcode + city hits in one segment text. `country` is the card's best country guess for ambiguous digits. */
export function postcodeHits(text: string, cardCountry?: string): Hit[] {
  const hits: Hit[] = [];
  const add = (h: Hit) => {
    if (!hits.some((x) => x.start < h.end && h.start < x.end)) hits.push(h);
  };
  let m: RegExpExecArray | null;
  // Japan 〒123-4567 …
  if ((m = /〒\s?(\d{3})-?(\d{4})\s*(.*)$/u.exec(text))) add({ postcode: `${m[1]}-${m[2]}`, city: m[3], country: 'JP', start: m.index, end: text.length, rule: 'address.jp' });
  // Netherlands 1234 AB City
  for (const x of text.matchAll(new RegExp(`(?<![\\p{L}\\d])(\\d{4})\\s?([A-Z]{2})\\s+(${CITY})${CITY_TAIL}`, 'gu'))) {
    if (!/^(SS|SA|SD)$/.test(x[2])) add({ postcode: `${x[1]} ${x[2]}`, city: x[3], country: 'NL', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.nl' });
  }
  // Portugal 1234-567 City · Poland 12-345 City
  for (const x of text.matchAll(new RegExp(`(?<![\\d-])(\\d{4}-\\d{3})\\s+(${CITY})${CITY_TAIL}`, 'gu'))) add({ postcode: x[1], city: x[2], country: 'PT', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.pt' });
  for (const x of text.matchAll(new RegExp(`(?<![\\d-])(\\d{2}-\\d{3})\\s+(${CITY})${CITY_TAIL}`, 'gu'))) add({ postcode: x[1], city: x[2], country: 'PL', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.pl' });
  // Brazil CEP 01310-100 (city "São Paulo - SP" / "São Paulo/SP" before or after)
  if ((m = /(?<![\d-])(\d{5}-\d{3})(?![\d-])/u.exec(text))) {
    const around = text.replace(m[0], '|');
    const c = new RegExp(`(${CITY})\\s*(?:-|\\/)\\s*([A-Z]{2})(?![\\p{L}])`, 'u').exec(around);
    add({ postcode: m[1], city: c ? c[1] : '', region: c?.[2], country: 'BR', start: c && (c.index ?? 0) < m.index ? (c.index ?? 0) : m.index, end: text.length, rule: 'address.br' });
  }
  // US City, ST 12345(-6789)
  for (const x of text.matchAll(new RegExp(`(${CITY}),?\\s+(${US_STATES})\\s+(\\d{5}(?:-\\d{4})?)(?![\\d])`, 'gu'))) add({ postcode: x[3], city: x[1], region: x[2], country: 'US', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.us' });
  // Canada City, ON A1A 1A1 / City (Ontario) A1A 1A1
  for (const x of text.matchAll(new RegExp(`(${CITY}),?\\s+(${CA_PROV})\\s+([A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d)(?![\\p{L}\\d])`, 'gu'))) add({ postcode: x[3], city: x[1], region: x[2], country: 'CA', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.ca' });
  // Australia City NSW 2000
  for (const x of text.matchAll(new RegExp(`(${CITY}),?\\s+(${AU_STATES})\\s+(\\d{4})(?![\\d])`, 'gu'))) add({ postcode: x[3], city: x[1], region: x[2], country: 'AU', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.au' });
  // UK postcode (city before it on the same segment)
  for (const x of text.matchAll(/(?<![\p{L}\d])([A-Z]{1,2}\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2})(?![\p{L}\d])/gu)) {
    const before = text.slice(0, x.index).replace(/[\s,]+$/, '');
    const city = new RegExp(`(${CITY})$`, 'u').exec(before.split(/,\s*/).pop() ?? '');
    add({ postcode: x[1], city: city ? city[1] : '', country: 'GB', start: city ? before.lastIndexOf(city[1]) : (x.index ?? 0), end: (x.index ?? 0) + x[0].length, rule: 'address.uk' });
  }
  // Ireland Eircode "Dublin 2, D02 X285"
  for (const x of text.matchAll(/(?<![\p{L}\d])([AC-FHKNPRTV-Y]\d{2}|D6W)\s([0-9AC-FHKNPRTV-Y]{4})(?![\p{L}\d])/gu)) {
    const before = text.slice(0, x.index).replace(/[\s,]+$/, '');
    const city = new RegExp(`(${CITY}(?:\\s\\d{1,2})?)$`, 'u').exec(before.split(/,\s*/).pop() ?? '');
    add({ postcode: `${x[1]} ${x[2]}`, city: city ? city[1] : '', country: 'IE', start: city ? before.lastIndexOf(city[1]) : (x.index ?? 0), end: (x.index ?? 0) + x[0].length, rule: 'address.ie' });
  }
  // Russia 123456, г. Москва / Москва, 123456
  for (const x of text.matchAll(/(?<!\d)(\d{6}),?\s*(?:г\.\s*)?(\p{Script=Cyrillic}[\p{Script=Cyrillic}-]+(?:\s[\p{Script=Cyrillic}-]+)?)/gu)) add({ postcode: x[1], city: x[2], country: 'RU', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.ru' });
  for (const x of text.matchAll(/(?:г\.\s*)?(\p{Script=Cyrillic}[\p{Script=Cyrillic}-]+),\s*(\d{6})(?!\d)/gu)) add({ postcode: x[2], city: x[1], country: 'RU', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.ru' });
  // India / Singapore: City - 400 001 / City 400001 / PIN 400001
  for (const x of text.matchAll(new RegExp(`(${CITY})\\s*[-–,]?\\s*(?:PIN[:\\s]*)?(\\d{3}\\s?\\d{3})(?![\\d])`, 'gu'))) {
    const city = x[1];
    if (/singapore/i.test(city)) add({ postcode: x[2], city, country: 'SG', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.sg' });
    else if (cardCountry === 'IN' || cardCountry === 'SG') add({ postcode: x[2].replace(/\s/g, ''), city, country: cardCountry === 'SG' ? 'SG' : 'IN', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.in' });
  }
  // European style: (D-)12345 City · (CH-)8001 Zürich · C.P. 06600 Ciudad de México
  for (const x of text.matchAll(new RegExp(`(?<![\\p{L}\\d+])(?:(?:C\\.?P\\.?|CP)\\s?)?(?:(${Object.keys(PREFIX_COUNTRY).join('|')})[-‑]\\s?)?(\\d{4,5})\\s+(${CITY})${CITY_TAIL}`, 'gu'))) {
    const pc = x[2];
    const prefixCountry = x[1] ? PREFIX_COUNTRY[x[1]] : undefined;
    let country = prefixCountry;
    if (!country && cardCountry && (pc.length === 5 ? FIVE_DIGIT : FOUR_DIGIT).has(cardCountry)) country = cardCountry;
    // "… Mateos 2105 Pte." on a Mexican card: a 4-digit number is no postcode where postcodes have 5 digits (and back)
    if (!prefixCountry && cardCountry && (pc.length === 5 ? FOUR_DIGIT : FIVE_DIGIT).has(cardCountry) && !(pc.length === 5 ? FIVE_DIGIT : FOUR_DIGIT).has(cardCountry)) continue;
    const before = text.slice(0, x.index).trimEnd();
    if ((/\d$/.test(before) && !looksLikeStreet(before)) || PHONE_LABEL_RE.test(foldKeep(before))) continue; // a phone number, not a postcode
    // "1200 Market Street", "1600 Champa St": a house number before a street, not a postcode before a city
    if (!x[1] && (STREET_WORD_RE.test(x[3]) || (cardCountry && NUMBER_FIRST.has(cardCountry)))) continue;
    add({ postcode: pc, city: x[3], country, start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.eu' });
  }
  // Latvia / Lithuania with the postcode after the city: "Brīvības iela 155, Rīga, LV-1012" (P5d, B3 lv-n31)
  for (const x of text.matchAll(new RegExp(`(${CITY}),?\\s+((?:LV-\\d{4})|(?:LT-\\d{5}))(?![\\d])`, 'gu'))) add({ postcode: x[2], city: x[1], country: x[2].slice(0, 2), start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.baltic' });
  // Czech/Slovak/Swedish/Greek "602 00 Brno", "114 55 Stockholm" (P5c)
  if (cardCountry && ['CZ', 'SK', 'SE', 'GR'].includes(cardCountry)) {
    for (const x of text.matchAll(new RegExp(`(?<![\\p{L}\\d+])(?:(CZ|SK|S|SE|GR)[-‑]\\s?)?(\\d{3}\\s\\d{2})\\s+(${CITY})${CITY_TAIL}`, 'gu'))) {
      const before = text.slice(0, x.index).trimEnd();
      if (/\d$/.test(before) || PHONE_LABEL_RE.test(foldKeep(before))) continue;
      add({ postcode: x[2], city: x[3], country: cardCountry, start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.cz-se' });
    }
  }
  // PO box + city without a postcode: "P.O. Box 123456, Dubai, UAE"
  for (const x of text.matchAll(new RegExp(`(?<![\\p{L}])(${PO_BOX_WORDS})[\\s.:]*(\\d+)\\s*,\\s*(${CITY})${CITY_TAIL}`, 'giu'))) {
    if (hits.some((h) => h.start <= (x.index ?? 0) + x[0].length && (x.index ?? 0) <= h.end)) continue;
    add({ postcode: '', city: x[3], street: `${x[1]} ${x[2]}`.replace(/\s+/g, ' '), start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.pobox' });
  }
  // Japanese address in Latin script: "… Nagoya 460-0008, Japan"
  if (cardCountry === 'JP') {
    for (const x of text.matchAll(new RegExp(`(${CITY}),?\\s+(\\d{3}-\\d{4})(?![\\d])`, 'gu'))) add({ postcode: x[2], city: x[1], country: 'JP', start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.jp-latin' });
  }
  // City-first five digits (Jakarta 12190, Riyadh 12345, Seoul 06236) on cards from those countries
  if (cardCountry && ['ID', 'SA', 'MY', 'TH', 'KR', 'AE', 'VN', 'CN', 'TW'].includes(cardCountry)) {
    for (const x of text.matchAll(new RegExp(`(${CITY})\\s+(\\d{5,6})(?![\\d])`, 'gu'))) add({ postcode: x[2], city: x[1], country: cardCountry, start: x.index ?? 0, end: (x.index ?? 0) + x[0].length, rule: 'address.cityfirst' });
  }
  return hits
    .filter((h) => {
      const at = h.postcode ? text.indexOf(h.postcode.split(/\s/)[0], h.start) : -1;
      return at < 0 || !PO_BOX_BEFORE.test(text.slice(0, at));
    })
    .sort((a, b) => a.start - b.start);
}

/** Japanese / Chinese / Korean address text → region, city, street. */
function splitCjkAddress(text: string, country: string): { region: string; city: string; street: string } {
  const t = text.trim();
  if (country === 'JP') {
    const r = /^(東京都|北海道|京都府|大阪府|.{2,3}県)/u.exec(t);
    const region = r ? r[1] : '';
    const rest = t.slice(region.length);
    const c = /^(.+?[市区町村郡])/u.exec(rest);
    // 横浜市西区 → city 横浜市 (first 市); 千代田区 → 千代田区
    const city = c ? c[1] : '';
    return { region, city, street: rest.slice(city.length).trim() };
  }
  if (country === 'CN') {
    const r = /^(.{2,3}(?:省|自治区))/u.exec(t);
    const region = r ? r[1] : '';
    const rest = t.slice(region.length);
    const c = /^(.{2,4}?市)/u.exec(rest);
    const city = c ? c[1] : '';
    return { region, city, street: rest.slice(city.length).trim() };
  }
  if (country === 'KR') {
    const words = t.split(/\s+/);
    let region = '';
    let city = '';
    let i = 0;
    if (words[i] && /(도)$/.test(words[i]) && !/(시)$/.test(words[i])) region = words[i++];
    if (words[i] && /(특별시|광역시|특별자치시|시)$/.test(words[i])) city = words[i++];
    return { region, city, street: words.slice(i).join(' ') };
  }
  return { region: '', city: '', street: t };
}

/** Vietnamese city at the end of an address line: "…, Quận 1, TP. Hồ Chí Minh" / "…, Hoàn Kiếm, Hà Nội". */
const VN_CITY = /(?:^|,\s*)((?:TP\.?|Tp\.?|Thành phố)\s*)?(Hồ Chí Minh|Hà Nội|Đà Nẵng|Hải Phòng|Cần Thơ|Nha Trang|Huế|Biên Hòa|Vũng Tàu)\s*$/u;
/** Taiwan "114台北市內湖區瑞光路88號5樓": a 3/5/6-digit postcode glued before the city (P5c). */
const TW_ADDRESS = /^(\d{3}(?:\d{2,3})?)?\s*([\p{Script=Han}]{2,3}[市縣])(.*\d.*)$/u;
const CN_POSTCODE = /(?:邮编|郵編|邮政编码|郵遞區號)\s*[:：]?\s*(\d{6})/u;
const KR_POSTCODE = /^\s*(?:\(우\)|우\)?|우편번호)\s*[:：]?\s*(\d{5})\s*/u;
const CN_ADDRESS = /[\p{Script=Han}]{2,}(省|市|区|區|县|縣|路|街|道|号|號)/u;
const KR_ADDRESS = /(특별시|광역시|[가-힣]+시|[가-힣]+도)\s+[가-힣]+(구|군|시)\s+.*(로|길)\s*\d/u;
const JP_ADDRESS = /(東京都|北海道|京都府|大阪府|[\p{Script=Han}]{2,3}県).*[市区町村郡]/u;

/** The segments before this one: earlier segments of the same line first, then up to `n` lines above. */
function segsAbove(ctx: Ctx, seg: Seg, n: number): Seg[] {
  if (hasBoxes(ctx.segs)) {
    // two-column cards: "above" is the same column, not the previous line in reading order
    const sameLine = ctx.segs.filter((s) => s.lineId === seg.lineId && s.order < seg.order).reverse();
    return [...sameLine, ...columnAbove(ctx.segs, seg, n)];
  }
  const i = ctx.segs.indexOf(seg);
  const out: Seg[] = [];
  const lines = new Set<string>();
  for (let k = i - 1; k >= 0; k--) {
    const s = ctx.segs[k];
    if (s.side !== seg.side) break;
    if (s.lineId !== seg.lineId) {
      if (!lines.has(s.lineId) && lines.size >= n) break;
      lines.add(s.lineId);
    }
    out.push(s);
  }
  return out;
}

function segBelow(ctx: Ctx, seg: Seg): Seg | undefined {
  if (hasBoxes(ctx.segs)) return ctx.segs.filter((s) => directlyBelow(seg, s)).sort((a, b) => a.line.box!.y - b.line.box!.y)[0];
  const i = ctx.segs.indexOf(seg);
  for (let k = i + 1; k < ctx.segs.length; k++) {
    const s = ctx.segs[k];
    if (s.side !== seg.side) return undefined;
    if (s.lineId !== seg.lineId) return s;
  }
  return undefined;
}

function isFree(s: Seg): boolean {
  return s.rest.trim() !== '' && !/@/.test(s.rest);
}

export function findAddresses(ctx: Ctx): void {
  const found: { hit: Hit; seg: Seg }[] = [];
  const repairedSegs = new Set<Seg>();
  for (const seg of ctx.segs) {
    if (!isFree(seg) || isRegistryLine(seg.rest)) continue;
    // "8O687 München", "O1067 Dresden": confusables inside a digit-dominated postcode (same length, so spans stay);
    // "lOlO Wien" under a street line, "Manchester Ml 1BN", "London WClR 4ED": confusables in postcode position (P5c)
    const fixed = repairPostcodeConfusables(ctx, seg, repairDigits(seg.rest));
    const hits = postcodeHits(seg.rest, ctx.cardCountry);
    const fixedHits = fixed.repaired && hits.length === 0 ? postcodeHits(fixed.text, ctx.cardCountry) : [];
    for (const hit of hits.length ? hits : fixedHits) {
      if (PHONE_LABEL_RE.test(foldKeep(seg.rest.slice(0, hit.start)))) continue;
      if (fixedHits.length) repairedSegs.add(seg);
      found.push({ hit, seg });
    }
  }
  for (const { hit, seg } of found) {
    const a: Address = emptyAddress();
    const sources = new Set<string>([seg.lineId]);
    a.postcode = hit.postcode;
    let country = hit.country;
    let city = cleanCity(hit.city);
    if (hit.rule === 'address.jp' || hit.rule === 'address.cn') {
      let rest = city;
      if (rest === '') {
        const below = segBelow(ctx, seg);
        if (below && isFree(below)) {
          rest = below.rest.trim();
          consumeAll(below, 'address');
          sources.add(below.lineId);
        }
      }
      const parts = splitCjkAddress(rest, country ?? 'JP');
      a.region = parts.region;
      a.city = parts.city;
      a.street = parts.street;
      city = parts.city;
    } else {
      const cc = splitCityCountry(city);
      city = cleanCity(cc.city);
      if (cc.code) {
        a.country = cc.country;
        country = country ?? cc.code;
      }
      a.city = city;
      if (hit.region) a.region = hit.region;
      // Turkish "34394 Şişli/İstanbul", Italian "20121 Milano (MI)"
      const after = seg.rest.slice(hit.end);
      const slash = /^\s*\/\s*(\p{Lu}[\p{L}]+)/u.exec(after);
      if (slash) {
        a.region = a.city;
        a.city = slash[1];
        hit.end += slash[0].length;
      }
      // "34394 Şişli / İstanbul": the spaced slash split the line — the next segment of the same line is the city
      const nextSeg = ctx.segs.find((x) => x.lineId === seg.lineId && x.order === seg.order + 1);
      if (!slash && hit.end >= seg.rest.trimEnd().length && nextSeg && isFree(nextSeg) && /^\p{Lu}[\p{L}\p{M}'-]+(?:\s\p{Lu}[\p{L}\p{M}'-]+)?$/u.test(nextSeg.rest.trim()) && !countryOfText(nextSeg.rest)) {
        a.region = a.city;
        a.city = nextSeg.rest.trim();
        consumeAll(nextSeg, 'address');
      }
      const cedex = /^\s+(?:cedex|CEDEX|Cedex)(?:\s+\d{1,3})?(?!\S)/u.exec(seg.rest.slice(hit.end));
      if (cedex) hit.end += cedex[0].length;
      const prov = /^\s*\(([A-Z]{2})\)/u.exec(seg.rest.slice(hit.end));
      if (prov) {
        a.region = prov[1];
        hit.end += prov[0].length;
      }
      const tail = seg.rest.slice(hit.end).replace(/^[\s,;-]+/, '').trim();
      if (!a.country && tail && countryOfText(tail)) {
        a.country = tail;
        country = country ?? countryOfText(tail);
        hit.end = seg.rest.length;
      }
    }
    if (hit.street) a.street = hit.street;
    // Russian order "123056, г. Москва, ул. Тверская, д. 12": the street follows the city
    if (hit.rule === 'address.ru') {
      const after = seg.rest.slice(hit.end).replace(/^[\s,;]+/, '').trim();
      if (after && looksLikeStreet(after)) {
        a.street = after;
        hit.end = seg.rest.length;
      }
    }
    // street: same segment before the postcode, else a street-like line above
    const rawBefore = seg.rest.slice(0, hit.start).replace(ADDRESS_LABEL, '').replace(/[\s,;-]+$/, '').trim();
    // "CEP 01310-200": a postcode label is no street; "Col. Centro, 64000 Monterrey": a district, the street is above (P5c)
    const district = DISTRICT_LINE.test(rawBefore) ? rawBefore : '';
    const before = POSTCODE_LABEL.test(rawBefore) || district ? '' : rawBefore;
    if (POSTCODE_LABEL.test(rawBefore) || district) consume(seg, 0, hit.start, 'address');
    // Brazil "Bela Vista – São Paulo – SP" / "CEP 01310-200": the city (and district) on the line above the CEP
    let anchor = seg;
    if (hit.rule === 'address.br' && !a.city) {
      const up = segsAbove(ctx, seg, 1).find((x) => x.lineId !== seg.lineId && isFree(x));
      const parts = up?.rest.trim().split(/\s+[-–]\s+|\s*\/\s*/) ?? [];
      if (up && parts.length >= 2 && /^[A-Z]{2}$/.test(parts[parts.length - 1]) && /^\p{Lu}[\p{L}\s.'-]+$/u.test(parts[parts.length - 2])) {
        a.city = parts[parts.length - 2];
        city = a.city;
        a.region = parts[parts.length - 1];
        if (parts.length > 2) a.street = parts.slice(0, -2).join(', ');
        consumeAll(up, 'address');
        sources.add(up.lineId);
        anchor = up;
      }
    }
    // Japanese address in Latin script: "Shibuya-ku, Tokyo 150-0002" → the ward is the city, Tokyo the region
    if (hit.rule === 'address.jp-latin' && /^[\p{L}-]+-(ku|shi|cho|machi|gun|mura)$/iu.test(before)) {
      a.region = a.city;
      a.city = before;
      consume(seg, 0, hit.start, 'address');
    } else if (!a.street && before && /\p{L}/u.test(before) && !PHONE_LABEL_RE.test(before)) {
      a.street = fixStreetNumber(before.replace(/^[\s,;-]+/, ''));
      if (a.street !== before.replace(/^[\s,;-]+/, '')) repairedSegs.add(seg);
      consume(seg, 0, hit.start, 'address');
    }
    // the street line(s) above that end with a comma continue into this one ("Plot No. 42, MIDC Industrial Area,")
    if (a.street || a.region) {
      for (const s2 of segsAbove(ctx, seg, 1).filter((x) => x.lineId !== seg.lineId && isFree(x))) {
        const t = s2.rest.trim();
        if (!CONTINUES.test(t) || /@|www\.|https?:/i.test(t) || PHONE_LABEL_RE.test(foldKeep(t))) break;
        a.street = a.street ? `${t.replace(/[\s,]+$/, '')}, ${a.street}` : t.replace(/[\s,]+$/, '');
        consumeAll(s2, 'address');
        sources.add(s2.lineId);
        break;
      }
    }
    const brDistrict = anchor !== seg ? a.street : '';
    if (brDistrict) a.street = '';
    if (!a.street) {
      const above = segsAbove(ctx, anchor, 2).filter(isFree);
      const streetSegs: Seg[] = [];
      for (const s of above) {
        const t = fixPoBox(s.rest.trim());
        if (looksLikeStreet(t) || DISTRICT_LINE.test(t) || (CONTINUES.test(t) && streetSegs.length === 0 && /\d/.test(t) && !/@|www\./.test(t)) || (HOUSE_NUMBER_LINE.test(t) && !/\d{5,}|@|www\./.test(t) && !PHONE_LABEL_RE.test(foldKeep(t)))) streetSegs.unshift(s);
        else if (streetSegs.length > 0 || s.used.length > 0) break;
        else if (/\p{L}/u.test(t) && !/\d/.test(t) && streetSegs.length === 0 && s.lineId !== seg.lineId) {
          // a city-only line between street and postcode ("Aberdeen" / "AB12 3LP"): the city when the hit has none
          if (!a.city && hit.rule === 'address.uk' && t.split(/\s+/).length <= 3) {
            a.city = t;
            consumeAll(s, 'address');
            sources.add(s.lineId);
            continue;
          }
          break;
        }
      }
      if (streetSegs.length > 0) {
        a.street = streetSegs.map((s) => fixStreetNumber(fixPoBox(s.rest.trim())).replace(/[\s,]+$/, '')).join(', ');
        if (streetSegs.some((s) => fixStreetNumber(s.rest.trim()) !== s.rest.trim())) repairedSegs.add(seg);
        for (const s of streetSegs) {
          consumeAll(s, 'address');
          sources.add(s.lineId);
        }
      }
    }
    // the district goes after the street ("Av. Constitución 2050 Ote., Col. Centro"; "Av. Paulista, 1578, Bela Vista")
    for (const extra of [district, brDistrict]) if (extra) a.street = a.street ? `${a.street}, ${extra}` : extra;
    // country line below
    if (!a.country) {
      const below = segBelow(ctx, seg);
      if (below && isFree(below) && countryOfText(below.rest)) {
        a.country = below.rest.trim();
        country = country ?? countryOfText(below.rest);
        consumeAll(below, 'address');
        sources.add(below.lineId);
      }
    }
    a.countryCode = country ?? ctx.cardCountry ?? '';
    // India: "…, Parade Road, Fort Kochi, Kerala 682001" — a state before the PIN is the region; the city is the comma part
    // before it (P5d, B3 in-y03)
    if (hit.rule === 'address.in' && IN_STATES.test(fold(a.city))) {
      const m = /^(.*?),\s*(\p{Lu}[\p{L}\s.'-]{1,30})$/u.exec(a.street.replace(/[\s,]+$/, ''));
      a.region = a.city;
      a.city = m && !/\d/.test(m[2]) && !STREET_WORD_RE.test(m[2]) ? m[2].trim() : '';
      if (m && a.city) a.street = m[1].trim();
    }
    // Korean address in Latin script: "…, Seongnam-si," / "Gyeonggi-do 13494": the "-do" is the province, the city is the "-si"
    if (a.countryCode === 'KR' && /-do$/i.test(a.city)) {
      const m = /^(.*?),?\s*([\p{L}-]+-(?:si|gun))$/iu.exec(a.street.replace(/[\s,]+$/, ''));
      if (m) {
        a.region = a.city;
        a.city = m[2];
        a.street = m[1].replace(/[\s,]+$/, '');
      }
    }
    consume(seg, hit.start, Math.min(seg.rest.length, hit.end), 'address');
    a.raw = formatAddress(a);
    // A PO box with a city where the country has no postcodes (UAE …) is as complete as such an address gets → medium
    let confidence: 'high' | 'medium' | 'low' = a.city && a.postcode ? (a.street ? 'high' : 'medium') : hit.rule === 'address.pobox' && a.city ? 'medium' : 'low';
    if (repairedSegs.has(seg) && confidence === 'high') confidence = 'medium'; // a repaired postcode is not sure
    ctx.addresses.push({ value: a, confidence, sources: [...sources], rule: hit.rule });
  }
  // No postcode anywhere: CJK address lines, or street keyword lines → low, whole block in street
  if (found.length === 0) {
    for (const seg of ctx.segs) {
      if (!isFree(seg) || isRegistryLine(seg.rest)) continue;
      let t = seg.rest.trim().replace(ADDRESS_LABEL, '');
      let country: string | undefined;
      // "Sheikh Zayed Road, P.O. Box 123456" / "Dubai, United Arab Emirates": a PO box line, the city on the next line (P5c)
      const below = segBelow(ctx, seg);
      if (PO_BOX.test(t) && below && isFree(below)) {
        const m = new RegExp(`^(${CITY})(?:\\s*,\\s*(.+))?$`, 'u').exec(below.rest.trim());
        const code = m ? (m[2] ? countryOfText(m[2]) : countryOfText(m[1])) : undefined;
        if (m && m[2] && code && !countryOfText(m[1])) {
          const up = segsAbove(ctx, seg, 1).filter((x) => x.lineId !== seg.lineId && isFree(x) && /\d/.test(x.rest) && (STREET_WORD_RE.test(x.rest) || /\b(office|tower|building|floor|suite)\b/i.test(x.rest)) && !PHONE_LABEL_RE.test(foldKeep(x.rest)));
          const street = [...up.map((x) => x.rest.trim().replace(/[\s,]+$/, '')), t].join(', ');
          const a: Address = { ...emptyAddress(), street, city: m[1], country: m[2], countryCode: code, raw: `${street}, ${below.rest.trim()}` };
          ctx.addresses.push({ value: a, confidence: 'medium', sources: [...up.map((x) => x.lineId), seg.lineId, below.lineId], rule: 'address.pobox-city' });
          for (const x of [...up, seg, below]) consumeAll(x, 'address');
          continue;
        }
      }
      // Taiwan (card evidence TW): postcode + city + district/street (medium, like every CJK address, D31)
      const tw = ctx.cardCountry === 'TW' ? TW_ADDRESS.exec(t) : null;
      if (tw) {
        const a: Address = { ...emptyAddress(), postcode: tw[1] ?? '', city: tw[2], street: tw[3].trim(), countryCode: 'TW', raw: t };
        ctx.addresses.push({ value: a, confidence: tw[1] ? 'medium' : 'low', sources: [seg.lineId], rule: 'address.tw' });
        consumeAll(seg, 'address');
        continue;
      }
      // "…, Quận 1," / "TP. Hồ Chí Minh": the city on the next line
      const next = segBelow(ctx, seg);
      const joinNext = CONTINUES.test(t) && next && isFree(next) && VN_CITY.test(`, ${next.rest.trim()}`);
      if (joinNext) t = `${t.replace(/[\s,]+$/, '')}, ${next!.rest.trim()}`;
      const vn = VN_CITY.exec(t);
      if (vn && /\d/.test(t)) {
        // "Tầng 12, 235 Nguyễn Văn Cừ" / "Phường 4, Quận 5, TP. Hồ Chí Minh": the street line above joins (P5c)
        const up = joinNext ? [] : segsAbove(ctx, seg, 1).filter((x) => x.lineId !== seg.lineId && isFree(x) && /\d/.test(x.rest) && (looksLikeStreet(x.rest) || HOUSE_NUMBER_LINE.test(x.rest.trim()) || /(?:^|,\s*)\d{1,4}\s+\p{Lu}/u.test(x.rest)) && !PHONE_LABEL_RE.test(foldKeep(x.rest)));
        const street = [...up.map((x) => x.rest.trim().replace(/[\s,]+$/, '')), t.slice(0, vn.index).replace(/[\s,]+$/, '')].filter(Boolean).join(', ');
        // the city as printed: "TP. Hồ Chí Minh" (both blind sets keep the "TP." of Thành phố)
        const a: Address = { ...emptyAddress(), street, city: `${vn[1] ? vn[1].trim() + ' ' : ''}${vn[2]}`, countryCode: 'VN', raw: t };
        ctx.addresses.push({ value: a, confidence: street ? 'medium' : 'low', sources: [...up.map((x) => x.lineId), ...(joinNext ? [seg.lineId, next!.lineId] : [seg.lineId])], rule: 'address.vn' });
        for (const x of up) consumeAll(x, 'address');
        consumeAll(seg, 'address');
        if (joinNext) consumeAll(next!, 'address');
        continue;
      }
      // Hong Kong has no postcodes: "1 Matheson Street, Causeway Bay, Hong Kong" (a unit/floor line above joins the street)
      const hk = /^(.*\d.*?),\s*(Hong Kong|Kowloon|New Territories)(?:\s*SAR)?\.?$/iu.exec(t);
      if (hk && (STRONG_STREET.test(hk[1]) || STREET_WORD_RE.test(hk[1]) || /^\d{1,4}[A-Z]?\s+\p{Lu}\p{L}+/u.test(hk[1]))) {
        const up = segsAbove(ctx, seg, 1).filter((x) => x.lineId !== seg.lineId && isFree(x) && /\d/.test(x.rest) && (STREET_WORD_RE.test(x.rest) || /\d+\/F\b/.test(x.rest)) && !PHONE_LABEL_RE.test(foldKeep(x.rest)));
        const street = [...up.map((x) => x.rest.trim().replace(/[\s,]+$/, '')), hk[1]].join(', ');
        const a: Address = { ...emptyAddress(), street, city: hk[2], countryCode: 'HK', raw: `${street}, ${hk[2]}` };
        ctx.addresses.push({ value: a, confidence: 'medium', sources: [...up.map((x) => x.lineId), seg.lineId], rule: 'address.hk' });
        for (const x of up) consumeAll(x, 'address');
        consumeAll(seg, 'address');
        continue;
      }
      if (JP_ADDRESS.test(t) && !/[@]/.test(t)) country = 'JP';
      else if (KR_ADDRESS.test(t)) country = 'KR';
      else if (CN_ADDRESS.test(t) && /\d/.test(t) && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t)) country = 'CN';
      if (country) {
        // a postcode printed after the address: "…建国路88号 100022", "… 12층 (06236)"
        const tailPc = country === 'CN' ? /\s+(\d{6})$/u.exec(t) : country === 'KR' ? /\s*\((\d{5})\)$/u.exec(t) : null;
        if (tailPc) t = t.slice(0, tailPc.index).trim();
        // Korean "06236 서울특별시 강남구 …": the 5-digit postcode printed first (P5c)
        const krLead = country === 'KR' ? /^(\d{5})\s+(?=\p{Script=Hangul})/u.exec(t) : null;
        const parts = splitCjkAddress(t.replace(KR_POSTCODE, '').replace(/^\d{5}\s+(?=\p{Script=Hangul})/u, '').trim(), country);
        const a: Address = { ...emptyAddress(), ...parts, countryCode: country, raw: t };
        // CN "邮编 200120" anywhere on the card; KR "(우)06236" / "우 06236" before the address
        const kr = KR_POSTCODE.exec(t);
        if (kr) a.postcode = kr[1];
        if (krLead) a.postcode = krLead[1];
        if (tailPc) a.postcode = tailPc[1];
        if (country === 'CN') {
          const pcSeg = ctx.segs.find((s) => CN_POSTCODE.test(s.rest));
          if (pcSeg) {
            a.postcode = CN_POSTCODE.exec(pcSeg.rest)![1];
            const m = CN_POSTCODE.exec(pcSeg.rest)!;
            consume(pcSeg, m.index, m.index + m[0].length, 'address');
          }
        }
        // CJK addresses carry no postcode on most cards: city + street with a number is a full structural match (D31)
        const structured = parts.city !== '' && /\d/.test(parts.street);
        ctx.addresses.push({ value: a, confidence: structured ? 'medium' : 'low', sources: [seg.lineId], rule: `address.${country.toLowerCase()}-structure` });
        consumeAll(seg, 'address');
        continue;
      }
      if (looksLikeStreet(t) && (STRONG_STREET.test(t) || DE_COMPOUND.test(t) || PO_BOX.test(t))) {
        const block = [seg];
        const next = segBelow(ctx, seg);
        if (next && isFree(next) && !looksLikePhoneOrMail(next.rest) && /\p{L}{3,}/u.test(next.rest) && next.rest.split(/\s+/).length <= 6 && !/\d{5,}/.test(next.rest)) block.push(next);
        const text = block.map((s) => s.rest.trim()).join(', ');
        const a: Address = { ...emptyAddress(), street: text, countryCode: ctx.cardCountry ?? '', raw: text };
        ctx.addresses.push({ value: a, confidence: 'low', sources: block.map((s) => s.lineId), rule: 'address.keyword' });
        for (const s of block) consumeAll(s, 'address');
        break;
      }
    }
  }
}

/** "Podbielskistraße 28O": a capital O/I or an l glued to a house number is a digit (P5c; the address is then medium). */
function fixStreetNumber(t: string): string {
  return t
    .replace(/(?<=(?:^|[\s,])\d{1,4})[OIl](?=$|[\s,/])/gu, (c) => CONFUSABLE_DIGIT[c] ?? c)
    // "Hoofdweg212", "Hauptstraße12": the OCR dropped the space between a street word and its house number (P5d)
    .replace(GLUED_NUMBER, '$1 $2');
}
const GLUED_NUMBER = /(\p{L}{2,}(?:weg|straat|laan|gracht|plein|kade|dijk|singel|steeg|straße|strasse|gasse|allee|platz|ring|damm|ufer|vej|gade|gatan|vägen|veien|gata|katu|tie))(\d{1,4}[a-zA-Z]?)(?![\p{L}\d])/giu;

const CONFUSABLE_DIGIT: Record<string, string> = { O: '0', o: '0', l: '1', I: '1', '|': '1', S: '5', B: '8' };

/** Postcode-position confusables the digit-run repair cannot see (no digit in "lOlO"; letters in UK codes). Same length. */
function repairPostcodeConfusables(ctx: Ctx, seg: Seg, fixed: { text: string; repaired: boolean }): { text: string; repaired: boolean } {
  let text = fixed.text;
  // "lOlO Wien": a 4–5 character token of O/l/I/0/1 at the start, a capitalised word after it, a street line directly above
  const lead = /^(\s*)([0-9OolI|]{4,5})(?=\s+\p{Lu}\p{Ll})/u.exec(text);
  if (lead && /[Oo0]/.test(lead[2]) && /[lI|1]/.test(lead[2]) && /[OolI|]/.test(lead[2])) {
    const above = segsAbove(ctx, seg, 1).find((x) => x.lineId !== seg.lineId);
    if (above && (looksLikeStreet(above.rest) || HOUSE_NUMBER_LINE.test(above.rest.trim()))) {
      text = lead[1] + lead[2].replace(/[OolI|]/g, (c) => CONFUSABLE_DIGIT[c] ?? c) + text.slice(lead[0].length);
    }
  }
  // UK outward code with a letter for a digit: "Ml 1BN" → "M1 1BN", "WClR 4ED" → "WC1R 4ED" (cards of GB/IE only)
  if (ctx.cardCountry === 'GB') {
    text = text.replace(/(?<![\p{L}\d])([A-Z]{1,2})([lIO])([A-Z\d]?)(\s\d[ABD-HJLNP-UW-Z]{2})(?![\p{L}\d])/gu, (m, a: string, d: string, c: string, tail: string) => `${a}${CONFUSABLE_DIGIT[d]}${c}${tail}`);
  }
  return { text, repaired: fixed.repaired || text !== fixed.text };
}

/** One-line display form in the country's order (US/CA/AU "City ST 12345", UK/IE "City POSTCODE", else "12345 City"). */
export function formatAddress(a: Address): string {
  const cc = a.countryCode;
  const place =
    cc === 'US' || cc === 'CA' || cc === 'AU'
      ? [a.city, [a.region, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : cc === 'GB' || cc === 'IE'
        ? [a.city, a.postcode].filter(Boolean).join(' ')
        : [[a.postcode, a.city].filter(Boolean).join(' '), cc === 'JP' || cc === 'CN' || cc === 'KR' ? '' : a.region].filter(Boolean).join(', ');
  return [a.street, place, cc === 'JP' || cc === 'CN' || cc === 'KR' ? a.region : '', a.country].filter(Boolean).join(', ');
}

function looksLikePhoneOrMail(t: string): boolean {
  return /@|www\.|\d{6,}/.test(t) || PHONE_LABEL_RE.test(foldKeep(t));
}

/** Segments the phone rule must skip: address-like text without a phone label. */
export function isAddressLike(seg: Seg, cardCountry?: string): boolean {
  if (seg.used.includes('address')) return true;
  const t = seg.rest;
  if (PHONE_LABEL_RE.test(foldKeep(t))) return false;
  return /〒/.test(t) || PO_BOX.test(t) || postcodeHits(t, cardCountry).length > 0;
}
