// Given names (SPEC rule 9: "a curated list written by the P3 agent, ~150–300 common given names per language, our own
// file") and family-name lists used to split CJK/Vietnamese/Korean names. Folded (lower case, Latin diacritics
// removed); native scripts as written. A list hit is ONE signal among several — uncommon names still win on layout,
// e-mail match and title adjacency.

const list = (s: string) => s.split(/\s+/).filter(Boolean);

export const GIVEN_NAMES = new Set([
  // German / Austrian / Swiss
  ...list(`alexander andreas anna annette anja barbara bernd birgit brigitte carsten christian christina christine claudia daniel daniela dieter dirk doris elke elisabeth erik eva fabian felix
  florian frank franziska frieder friedrich gabriele georg gerhard gisela gudrun gunter guenter hannah hans hans-peter hartmut heike heinz helga helmut henning holger horst ines ingrid jan jana jens
  joachim jochen johanna johannes jonas jorg joerg jurgen juergen julia kai karin karl karl-heinz katharina katrin kerstin klaus konrad lars laura lena lisa lukas manfred manuela marcel marco
  maria marie markus martin martina matthias max maximilian melanie michael michaela monika nadine nicole niklas nils norbert olaf oliver patrick paul peter petra philipp rainer ralf regina
  reinhard renate robert roland rolf rudiger ruediger sabine sandra sarah sascha sebastian silke simon simone sophie stefan stefanie steffen stephan susanne sven swen thomas thorsten tim tobias
  torsten udo ulrich ulrike ursula uwe volker walter werner wolfgang yvonne jutta heidi gerd gunther kurt otto herbert ingo marion annika leonie mia emma ben finn luca leon noah elias moritz till
  lea lina clara ida greta frieda paula mathilda jakob johann henrik hendrik wilhelm hermann kornelia cornelia anke ludwig magdalena theresa veronika sybille dagmar hildegard waltraud erika ilse`),
  // English
  ...list(`james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald
  edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank patrick raymond jack dennis jerry tyler aaron jose adam nathan
  henry douglas zachary peter kyle ethan walter noah jeremy christian keith roger terry gerald harold sean austin carl arthur lawrence dylan jesse jordan bryan billy joe bruce gabriel logan albert
  willie alan juan wayne elijah randy roy vincent ralph eugene russell bobby mason philip louis mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty margaret sandra
  ashley kimberly emily donna michelle carol amanda dorothy melissa deborah stephanie rebecca sharon laura cynthia kathleen amy angela shirley anna brenda pamela emma nicole helen samantha katherine
  christine debra rachel carolyn janet catherine maria heather diane ruth julie olivia joyce virginia victoria kelly lauren christina joan evelyn judith megan andrea cheryl hannah jacqueline martha
  gloria teresa ann sara madison frances kathryn janice jean abigail alice judy sophia grace denise amber doris marilyn danielle beverly isabella theresa diana natalie brittany charlotte marie
  kayla alexis lori chris alex sam jamie taylor morgan casey riley jessie tom tim mike dave steve rob bob bill jim nick ben matt dan greg jeff ken ron ted tony kate liz meg jen beth claire chloe lucy
  ella amelia harry oliver george charlie oscar archie leo freddie alfie theo isla poppy evie ruby daisy molly holly zoe zoë ian neil graham colin nigel simon stuart gareth rhys owen dylan aidan liam
  connor niamh siobhan aoife ciara sinead declan eoin padraig seamus fiona morag hamish`),
  // French
  ...list(`jean pierre michel philippe alain nicolas christophe laurent stephane sebastien julien francois olivier thierry patrick eric frederic pascal didier bruno vincent yves jacques bernard
  daniel marc gilles herve emmanuel guillaume antoine mathieu thomas maxime alexandre romain hugo lucas louis arthur gabriel raphael jules adam marie nathalie isabelle sylvie catherine francoise
  christine valerie sandrine sophie celine veronique stephanie aurelie emilie julie camille chloe manon lea ines clemence pauline helene anne monique nicole jacqueline brigitte martine dominique
  claude genevieve agnes elodie margaux juliette amelie josephine therese odile benedicte beatrice caroline delphine florence laetitia virginie marion cecile lucie elise`),
  // Spanish / Portuguese
  ...list(`jose antonio manuel francisco juan david javier daniel carlos jesus alejandro miguel rafael pedro pablo angel sergio fernando jorge luis alberto alvaro diego adrian raul enrique ramon
  vicente ignacio andres joaquin santiago eduardo victor roberto mario oscar ruben marcos hugo emilio julio gonzalo rodrigo ricardo mateo martin maria carmen ana isabel dolores pilar teresa rosa
  lucia paula laura marta cristina elena sara raquel beatriz rocio silvia patricia alicia julia irene noelia sonia montserrat nuria mercedes concepcion esperanza gabriela valentina camila sofia
  daniela fernanda ximena guadalupe joao pedro paulo lucas gabriel rafael gustavo felipe bruno thiago tiago matheus leonardo rodrigo marcelo andre fabio vitor ricardo antonio francisco luiz
  fernando henrique caio diogo goncalo rui nuno tiago miguel duarte afonso ana maria beatriz mariana juliana fernanda camila larissa leticia amanda bruna carolina vanessa patricia adriana
  claudia renata luciana tatiana aline jessica raquel ines catarina sofia margarida joana rita filipa`),
  // Italian
  ...list(`giuseppe giovanni antonio mario luigi francesco angelo vincenzo pietro salvatore carlo franco domenico bruno paolo michele giorgio aldo sergio luciano marco andrea alessandro
  stefano roberto massimo davide matteo lorenzo riccardo simone fabio luca federico gianluca enrico emanuele claudio maurizio nicola alberto filippo tommaso edoardo leonardo gabriele giulio maria
  anna giuseppina rosa angela giovanna teresa lucia carmela caterina francesca antonietta carla elena giulia chiara sara valentina alessandra federica silvia martina laura paola roberta
  elisa cristina daniela barbara monica simona serena ilaria beatrice camilla aurora alice ginevra emma vittoria`),
  // Dutch / Nordic / Polish (frequent in DE trade-fair stacks)
  ...list(`jan pieter joost bram daan sem ruben thijs lars sander bas stijn jeroen maarten wouter joris koen niels rik tim floor sanne lotte fleur anouk eva femke ilse marieke esther
  anders erik lars nils olav ole sven bjorn bjorn magnus henrik jens mikkel rasmus soren søren kasper mads frederik ingrid astrid sigrid kirsten mette hanne lene karin malin linnea elsa freja
  piotr pawel tomasz krzysztof andrzej marcin michal jakub lukasz łukasz kamil grzegorz agnieszka katarzyna malgorzata joanna magdalena ewa aleksandra natalia monika anna marta zofia`),
  // Turkish
  ...list(`mehmet mustafa ahmet ali huseyin hasan ibrahim ismail osman yusuf murat omer ramazan halil suleyman abdullah mahmut recep fatih kemal emre burak serkan volkan hakan cem can deniz
  emir eren kaan onur tolga ugur umut yasin baris berk cagri gokhan kerem levent orhan selim sinan tarik tuncay unal ünal fatma ayse emine hatice zeynep elif meryem sultan hulya esra merve busra
  ozlem derya gul gulsen ebru seda sibel tugba yasemin aylin burcu cansu dilek ece gizem irem melis nur pinar selin sevgi tuba`),
  // Indonesian / Malay
  ...list(`budi agus andi ahmad muhammad rizki dwi eko hendra joko bambang dedi hadi iwan wahyu yudi adi arif bayu dimas fajar gilang hari indra putra rudi rahmat sigit teguh yoga siti sri dewi
  ayu fitri indah lestari nur putri rina ratna wati yuni ani dian eka endah maya mega novi rahayu sari tari utami wulan kartika anisa nurul`),
  // Vietnamese (given names are the last token)
  ...list(`an anh binh chi cuong dung duc dung giang ha hai hanh hien hieu hoa hoang hung huong huy khanh khoa lam lan linh long mai minh my nam nga ngoc nhung phong phuc phuong quan quang quynh
  son tam tan thanh thao thu thuy tien trang trung tuan tung van viet vy xuan yen`),
  // Hindi / Indian (romanised)
  ...list(`aarav aditya ajay akash amit anil anand arjun arun ashok deepak dinesh ganesh gaurav harish karan krishna kumar manish manoj mohan mukesh naveen nikhil pankaj prakash pradeep rahul raj rajesh
  rakesh ramesh ravi rohit sachin sandeep sanjay santosh satish shankar sunil suresh tarun varun vijay vikas vikram vivek yash aarti anjali anita deepa divya geeta kavita lakshmi meena neha nisha pooja
  priya priyanka radha rekha ritu sangeeta sapna shweta sita sneha sunita swati usha vandana`),
  // Arabic (romanised)
  ...list(`mohammed mohammad muhammad mohamed ahmed ahmad ali omar umar abdullah abdulaziz abdulrahman khalid khaled faisal fahad fahd saud sultan nasser saleh salem saeed said hamad hamed hassan
  hussein ibrahim ismail yousef youssef yusuf tariq majid mansour nawaf turki bandar fatima fatimah aisha aysha maryam mariam noura nora sara sarah huda hanan layla leila amal reem rania dana lama
  hind asma salma zainab`),
  // Russian (romanised)
  ...list(`aleksandr alexandr alexey aleksey andrey andrei anton artem boris denis dmitry dmitri evgeny evgeniy igor ilya ivan kirill konstantin maxim mikhail nikita nikolai nikolay oleg pavel roman
  sergey sergei vadim valentin viktor vladimir vladislav yury yuri anastasia anna daria ekaterina elena irina julia yulia ksenia maria marina natalia olga svetlana tatiana tatyana valentina
  victoria viktoria`),
  // Cyrillic
  ...list(`александр алексей андрей антон артём артем борис вадим валентин виктор владимир владислав денис дмитрий евгений игорь илья иван кирилл константин максим михаил никита николай олег
  павел роман сергей юрий анастасия анна дарья екатерина елена ирина юлия ксения мария марина наталья ольга светлана татьяна валентина виктория`),
  // Arabic script
  ...list(`محمد أحمد احمد علي عمر عبدالله عبدالعزيز عبدالرحمن خالد فيصل فهد سعود سلطان ناصر صالح سالم سعيد حمد حامد حسن حسين إبراهيم ابراهيم إسماعيل يوسف طارق ماجد منصور نواف تركي فاطمة عائشة مريم نورة سارة هدى حنان ليلى أمل ريم رانيا`),
  // Devanagari
  ...list(`राहुल अमित अजय आदित्य अनिल आनंद अर्जुन अरुण अशोक दीपक दिनेश गणेश गौरव करण कृष्ण मनीष मनोज मोहन नवीन निखिल पंकज प्रकाश प्रदीप राज राजेश राकेश रमेश रवि रोहित सचिन संदीप संजय सुनील सुरेश विजय विकास विक्रम विवेक आरती अंजलि अनीता दीपा दिव्या गीता कविता लक्ष्मी मीना नेहा निशा पूजा प्रिया राधा रेखा सीता स्नेहा सुनीता`),
]);

/** Common Japanese family names (for splitting kanji names written without a space, SPEC N5). */
export const JA_FAMILY = list(`佐藤 鈴木 高橋 田中 伊藤 渡辺 渡部 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 林 斎藤 斉藤 清水 山崎 森 池田 橋本 阿部 石川 山下 中島 石井 小川 前田 岡田 長谷川
  藤田 後藤 近藤 村上 遠藤 青木 坂本 斉藤 福田 太田 西村 藤井 金子 岡本 藤原 中野 三浦 原田 松田 竹内 中川 小野 田村 中山 和田 石田 森田 上田 原 内田 柴田 酒井 宮崎 横山 高木 安藤 宮本 大野
  小島 工藤 谷口 今井 高田 丸山 増田 杉山 村田 大塚 新井 小山 平野 藤本 河野 上野 野口 武田 松井 千葉 岩崎 菅原 木下 久保 佐野 野村 松尾 菊地 杉本 市川 古川 大西 島田 水野 桜井 高野 渡邊 吉川 山内 西田 飯田 菅野`);
/** Chinese compound (two-character) family names (SPEC N5). */
/** The most common single-character Chinese family names (simplified and traditional), own list. */
export const ZH_FAMILY = new Set(list(`王 李 张 張 刘 劉 陈 陳 杨 楊 黄 黃 赵 趙 吴 吳 周 徐 孙 孫 马 馬 朱 胡 郭 何 林 高 罗 羅 郑 鄭 梁 谢 謝 宋 唐 许 許 韩 韓 冯 馮 邓 鄧 曹 彭 曾 肖 蕭 田 董 潘 袁 蔡 蒋 蔣 余 于 杜 叶 葉 程 魏 苏 蘇
吕 呂 丁 任 沈 姚 卢 盧 姜 崔 钟 鍾 谭 譚 陆 陸 汪 范 金 石 廖 贾 賈 夏 韦 韋 付 方 白 邹 鄒 孟 熊 秦 邱 江 尹 薛 闫 閆 段 雷 侯 龙 龍 史 陶 黎 贺 賀 顾 顧 毛 郝 龚 龔 邵 万 萬 钱 錢 严 嚴 覃 武 戴 莫 孔 向 汤 湯 常
温 溫 康 施 文 牛 樊 葛 邢 安 齐 齊 易 乔 喬 伍 庞 龐 颜 顏 倪 庄 莊 聂 聶 章 鲁 魯 岳 翟 殷 詹 申 欧 歐 耿 关 關 兰 蘭 焦 俞 左 柳 甘 祝 包 宁 寧 尚 符 舒 阮 柯 纪 紀 梅 童 凌 毕 畢 单 單 季 裴 霍 涂 成 苗 谷 盛 曲 翁 冉
骆 駱 蓝 藍 路 游 辛 靳 管 柴 蒙 鲍 鮑 华 華 喻 祁 蒲 房 滕 屈 饶 饒 解 牟 艾 尤 阳 陽 时 時 穆 农 農 司 卓 古 吉 缪 繆 简 簡 车 車 项 項 连 連 麦 麥 褚 娄 婁 窦 竇 戚 岑 景 党 黨 宫 宮 费 費 卜 冷 晏 席 卫 衛 米 柏 宗 瞿 桂
全 佟 应 應 臧 闵 閔 苟 边 邊 卞 姬 师 師 仇 栾 欒 隋 商 刁 沙 荣 榮 巫 寇 桑 郎 甄 仲 虞 敖 巩 鞏 明 佘 池 查 麻 苑 迟 遲 邝 鄺 黄 冼 区 區 伦 倫 岳 植 招`));
export const ZH_COMPOUND_FAMILY = list('欧阳 歐陽 司马 司馬 诸葛 諸葛 南宫 南宮 上官 东方 東方 皇甫 尉迟 尉遲 公孙 公孫 慕容 令狐 宇文 长孙 長孫 夏侯 轩辕 軒轅 端木 独孤 獨孤 司徒 西门 西門');
/** Korean family names; two-syllable ones first (SPEC N5). */
export const KO_COMPOUND_FAMILY = list('남궁 황보 선우 제갈 독고 사공 서문 동방');
export const KO_FAMILY = list('김 이 박 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 류 유 전 홍 고 문 양 손 배 백 허 남 심 노 하 곽 성 차 주 우 구 민 진 나 지 엄 채 원 천 방 공 현 함 변 염 여 추 도 소 석 선 설 마 길 연 위 표 명 기 반 왕 금 옥 육 인 맹 제 모 탁 국 어 은 편 용');
/** Vietnamese family names (folded): a Vietnamese name is written family first (SPEC N4 exception, D30). */
export const VI_FAMILY = new Set(list('nguyen tran le pham hoang huynh phan vu vo dang bui do ho ngo duong ly dinh trinh doan lam mai truong cao luu luong'));
/** Romanised Korean/Chinese family names, used only on cards from KR/CN/TW/HK (family first in Latin text). */
export const EAST_ASIAN_LATIN_FAMILY = new Set(list('kim lee park choi jung jeong kang cho yoon yun jang lim han oh seo shin kwon hwang ahn song ryu yoo hong ko moon yang son bae baek wang li zhang liu chen yang huang zhao wu zhou xu sun ma zhu hu guo he lin gao luo zheng liang xie song tang han feng deng cao peng zeng xiao tian dong pan yuan cai jiang yu du ye cheng wei su lu ding ren shen yao jin'));

/**
 * Names that are normally printed WITH diacritics, per language (P5c, L26). Folded forms (lower case, accents removed).
 * A Latin name token printed WITHOUT any diacritic whose folded form is on the list of a language the card speaks
 * ("Dvorak" on a Czech card, "Kruger" on a German one, "Lopez" on a Spanish one) has probably lost its accents in the
 * OCR: the name is then at most medium ("Check"). The value is never "corrected" — some people do write "Lopez".
 * A language counts for a card when the card's country is one of `countries`, or the card's other text contains one of
 * its letters (`letters`). Own curated lists: common given and family names, not tuned to one fixture.
 */
export type AccentLanguage = { countries: string[]; letters: RegExp; names: ReadonlySet<string> };
export const ACCENTED_NAMES: Record<string, AccentLanguage> = {
  de: {
    countries: ['DE', 'AT', 'CH', 'LI', 'LU'],
    letters: /[äöüßÄÖÜ]/u,
    names: new Set(list(`muller schroder kruger bohm konig kohler schafer jager schutz schutze gartner hubner lowe wohler bottcher dorr frohlich gunther gunter jurgen jorg bjorn
    sonke gotz roder jurgens kroger moller schroter tonnies wust lubke grun gruner hoffler kuhne kuhnel bruckner muhlbauer nussbaumer schubel wohrle buttner fussel`)),
  },
  fr: {
    countries: ['FR', 'BE', 'CH', 'LU', 'MC', 'CA'],
    letters: /[éèêëàâçîïôûùœÉÈÊÀÇ]/u,
    names: new Set(list(`francois francoise jerome stephane stephanie helene celine valerie sebastien frederic frederique cedric gerard andre rene renee therese noemie chloe zoe
    benedicte beatrice aurelie amelie emilie melanie cecile elodie gaetan joel raphael raphaelle herve lea ines agnes genevieve veronique leonie oceane penelope anais clementine
    clemence evariste etienne eugenie gregoire jeremie remi regis salome severine solene timothee gaelle aurelien nadege dorothee celeste irene noel
    lefevre leveque benoit lemaitre gerault theriault bedard gagne pare cote belanger gelinas fevrier legere senechal bechard trepanier lepine theroux girardot dupre bressan`)),
  },
  es: {
    countries: ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'UY', 'PY', 'BO', 'CR', 'GT', 'HN', 'SV', 'NI', 'PA', 'DO', 'CU', 'PR'],
    letters: /[ñáéíóúÑÁÉÍÓÚ¿¡]/u,
    names: new Set(list(`jose maria jesus angel ramon joaquin ruben alvaro adrian andres ivan hector nicolas tomas sebastian cesar raul fermin monica sofia lucia rocio belen veronica
    agustin ines ximena oscar nuria agusti marti puigdomenech vilaro rossello pages ferre villasenor julian simon marisol rene
    fernandez lopez gonzalez rodriguez martinez sanchez perez gomez diaz hernandez jimenez alvarez munoz ramirez gutierrez suarez dominguez vazquez mendez nunez garcia benitez
    marquez ibanez pena ordonez trevino nino cortes velazquez galvez chavez leon rios millan roman avila castano duenas nuno beltran saenz pelaez baez lainez montano`)),
  },
  pt: {
    countries: ['PT', 'BR', 'AO', 'MZ', 'CV'],
    letters: /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔ]/u,
    names: new Set(list(`joao jose antonio sebastiao conceicao ines monica vitoria flavio fabio marcio sergio rogerio claudio julio mario patricia lucia cecilia andre simao
    goncalo estevao lucio leticia leonor marcia
    goncalves magalhaes simoes guimaraes araujo bras braganca falcao romao assuncao leao sa brandao conceicao gusmao jordao camoes`)),
  },
  cs: {
    countries: ['CZ', 'SK'],
    letters: /[ěščřžýáíéůúťďňľĺôäŠČŘŽÝÁÍÉŮÚŤĎŇ]/u,
    names: new Set(list(`tomas jiri lukas frantisek vaclav ondrej stepan zdenek ales lubos marketa sarka vera katerina pavlina ludek bretislav jaromir premysl 
    dvorak novak cerny prochazka kucera vesely horak nemec pokorny pospisil hajek jelinek kral ruzicka benes sedlacek dolezal kolar navratil cermak vanek blazek krizek kovar
    bartos vlcek polak kopecky simek konecny maly stastny dusek strnad sevcik hruby safarik zak janousek matousek kriz kubicek`)),
  },
  pl: {
    countries: ['PL'],
    letters: /[łąęśźżńćóŁĄĘŚŹŻŃĆÓ]/u,
    names: new Set(list(`lukasz michal pawel malgorzata jozef slawomir wladyslaw boleslaw stanislaw miroslaw jaroslaw przemyslaw radoslaw wieslaw zdzislaw elzbieta bozena grazyna
    wojcik wisniewski wisniewska wozniak kaminski kaminska zielinski zielinska szymanski szymanska dabrowski dabrowska kozlowski kozlowska krol gorski gorska sliwinski kolodziej
    wrobel wroblewski wroblewska jozwiak gorecki gorecka sliwa lozinski bak lesniak swiatek wlodarczyk stepien golebiowski jedrzejczak piatek rozanski wojtowicz zajac pawlowski pawlowska`)),
  },
  sv: {
    countries: ['SE', 'NO', 'DK', 'FI', 'IS'],
    letters: /[åäöøæÅÄÖØÆ]/u,
    names: new Set(list(`lindstrom bergstrom soderberg ostberg oberg akesson sjoberg sjostrom nystrom engstrom lofgren bjork bjorklund bostrom ahlstrom hogberg lundstrom ostlund
    sandstrom wahlstrom strom backstrom sodergren ohman hakansson hammarstrom jaaskelainen hamalainen makinen jarvinen sondergaard hoj moller lokke boe
    olafsson olafsdottir gudmundsson gudmundsdottir sigurdsson thordarson johannsson
    soren bjorn jorgen goran hakan asa orjan osten borje gosta ake mans torbjorn sigurdur thorsdottir`)),
  },
  tr: {
    countries: ['TR'],
    letters: /[çşğıöüÇŞĞİÖÜ]/u,
    names: new Set(list(`ozturk sahin celik ozdemir aydin ozkan gunes kilic cakir dogan kocak guler ucar erdogan gul karakoc ozcan ozbek cetin coskun gunduz ozgur
    ozlem gulsen ilker umit ugur sukru serife gokhan suleyman huseyin omer cagla busra nese sevgul gulay`)),
  },
  ga: {
    countries: ['IE', 'GB'],
    letters: /[áéíóúÁÉÍÓÚ]/u,
    names: new Set(list(`siobhan sinead padraig mairead roisin ciaran eilis aine sile maire seamus ni nic`)),
  },
  hu: {
    countries: ['HU'],
    letters: /[őűáéíóúöüŐŰÁÉÍÓÚÖÜ]/u,
    names: new Set(list(`kovacs szabo toth horvath molnar nemeth balazs gabor peter istvan laszlo jozsef zoltan sandor andras tamas mate agnes erzsebet zsofia reka marta lorinc
    szucs biro pinter lukacs gal juhasz hegedus meszaros szalai racz`)),
  },
  vi: {
    countries: ['VN'],
    // Vietnamese-only letters (â, ê, ô are French/Portuguese too: "Rhône" is no Vietnamese evidence)
    letters: /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹĂĐƠƯ]/u,
    names: new Set(list(`nguyen tran le pham hoang huynh phan vu vo dang bui do ho ngo duong ly dinh trinh truong quan quang tuan thanh duc hung dung thuy huong phuong trang
    thao ngoc anh van thi`)),
  },
};
