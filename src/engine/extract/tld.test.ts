/**
 * @jest-environment node
 */
// IANA snapshot (D44) vs the curated P3 list it replaced (D32): every curated entry that was a real TLD must still be
// accepted. Five curated entries were not TLDs in the IANA list of 2026-10-16 and are listed here on purpose.
import { domainToASCII } from 'node:url';

import { IANA_SHA256, IANA_VERSION } from './iana-tlds';
import { knownTld, punycodeLabel, TLDS } from './tld';

const CC = `ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es
et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv
ly ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so
sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw`;
const GENERIC = `com net org info biz edu gov mil int name pro mobi asia tel travel jobs museum aero coop cat io ai app dev tech online site store shop xyz top vip club agency design digital studio media
solutions consulting services group company global email cloud network systems software science energy law legal health care clinic dental finance capital fund partners ventures marketing events
tours hotel restaurant cafe bar coffee art gallery photo photography film music live news blog wiki page link one world earth city berlin hamburg koeln cologne bayern nrw wien swiss paris london nyc tokyo
amsterdam brussels barcelona madrid istanbul moscow quebec scot wales irish eus gal bzh frl ruhr saarland team works tools engineering industries academy school university education training expert
institute foundation consulting international business center management immo house builders construction properties realestate estate homes garden fashion beauty fitness yoga sport football
golf auto car cars taxi bike boats fish farm wine beer bio eco green earth love family life lifestyle kitchen pizza menu recipes social chat video audio radio tv games plus space zone today guru
expert ninja rocks cool fun lol wtf sexy work works careers job directory link click help support codes legal tax accountant insurance bank credit loans money gold diamonds jewelry watch black
blue red pink tokyo nagoya osaka yokohama okinawa kyoto shop shopping deals sale market forsale amazon google apple microsoft
gmbh ltd inc llc coach dentist tirol zuerich versicherung immobilien haus jetzt ovh ag kaufen reise reisen rehab physio clinic dental attorney lawyer architect`;
const IDN = `рф рус бел укр срб мкд қаз 中国 中國 公司 网络 網絡 网址 商城 集团 在线 移动 我爱你 香港 台湾 台灣 新加坡 日本 みんな コム ストア セール 한국 닷컴 닷넷 삼성 السعودية امارات مصر قطر ایران بھارت भारत ไทย`;
const NOT_TLDS = ['hotel', 'job', 'architect', '網絡', '日本'];
const words = (s: string) => s.split(/\s+/).filter(Boolean);

describe('TLDs: IANA snapshot (D44)', () => {
  it('is the snapshot recorded in DECISIONS', () => {
    expect(IANA_VERSION).toMatch(/^Version \d{10}/);
    expect(IANA_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(TLDS.size).toBeGreaterThan(1400);
  });

  it('accepts every curated entry that is a real TLD (regression for the P3 list)', () => {
    const curated = [...words(CC), ...words(GENERIC), ...words(IDN)];
    const rejected = curated.filter((t) => !knownTld(`example.${t}`));
    expect(rejected.sort()).toEqual([...NOT_TLDS].sort());
  });

  it('matches Unicode TLDs through punycode exactly like Node', () => {
    for (const t of words(IDN)) expect(punycodeLabel(t)).toBe(domainToASCII(`a.${t}`).split('.').pop());
    expect(knownTld('kontakt.рф')).toBe(true);
    expect(knownTld('xn--p1ai')).toBe(true);
    expect(knownTld('example.xn--zzzzzz')).toBe(false);
    expect(knownTld('example.dentist')).toBe(true);
    expect(knownTld('example.corn')).toBe(false);
  });
});
