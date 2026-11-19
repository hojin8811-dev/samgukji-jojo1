/* ══════════════════════════════════════════════════════════════
   꼬마영웅 천하통일 — 데이터 (지형·병과·장수·76거점·전장)
   ══════════════════════════════════════════════════════════════ */
'use strict';
window.SK = window.SK || {};

/* ───────────── 지형 ───────────── */
SK.TERRAIN = {
  P: { name: '평지', def: 0.00, cost: 1, icon: 'grass' },
  R: { name: '도로', def: -0.05, cost: 1, icon: 'road' },
  F: { name: '숲', def: 0.15, cost: 2, icon: 'forest' },
  M: { name: '산지', def: 0.30, cost: 2, icon: 'mountain' },
  W: { name: '강물', def: 0.10, cost: 99, icon: 'water' },
  S: { name: '여울', def: 0.05, cost: 2, icon: 'shallow' },
  B: { name: '다리', def: 0.00, cost: 1, icon: 'bridge' },
  G: { name: '성문', def: 0.35, cost: 1, icon: 'gate' },
  C: { name: '성벽', def: 0.50, cost: 99, icon: 'wall' },
  D: { name: '마당', def: 0.08, cost: 1, icon: 'yard' },
};

/* ───────────── 병과 (16종) ───────────── */
SK.CLASSES = {
  gunwoong: { name: '군주', hanja: '君主', role: '지휘·균형', atk: 31, def: 21, mov: 4, rng: 1, mp: 46,
    skills: ['jihwi'], weapon: 'sword', desc: '군 전체를 이끄는 군주. 지휘로 아군을 강화한다.' },
  gibi: { name: '기병', hanja: '騎兵', role: '돌격·기동', atk: 34, def: 17, mov: 6, rng: 1, mp: 20,
    skills: ['dolpa'], weapon: 'spear', mount: true, desc: '이동 6의 돌격 병과. 평지·도로에서 공격 +15%, 산지 통행 불가.' },
  gunggi: { name: '궁기', hanja: '弓騎', role: '원거리·기동', atk: 29, def: 14, mov: 5, rng: 3, mp: 26,
    skills: ['jipsajung'], weapon: 'bow', mount: true, desc: '대각선 포함 3칸 사격. 산이나 성 위에서 사거리 +1.' },
  changbyung: { name: '창병', hanja: '槍兵', role: '대기병·성문', atk: 28, def: 21, mov: 4, rng: 2, mp: 18,
    skills: ['gwantung'], weapon: 'spear', desc: '긴 창으로 2칸을 찌른다. 기병에게 +40%, 성문에서 방어 +20%.' },
  geombyung: { name: '검병', hanja: '劍兵', role: '방어·근접', atk: 30, def: 24, mov: 4, rng: 1, mp: 16,
    skills: ['bangpae'], weapon: 'sword', desc: '튼튼한 방패 검병. 성문·마당에서 방어 +20%.' },
  sanjeok: { name: '산적', hanja: '山賊', role: '산지·숲 특화', atk: 34, def: 14, mov: 5, rng: 1, mp: 16,
    skills: ['sangang'], weapon: 'axe', desc: '산지·숲에서 공격 +30%. 산전의 주인공.' },
  sujeok: { name: '수적', hanja: '水賊', role: '수전 특화', atk: 31, def: 17, mov: 5, rng: 1, mp: 20,
    skills: ['suryu'], weapon: 'trident', desc: '물 위를 걸어 다닌다. 물에서 공격 +25%, 방어 +15%.' },
  chaeksa: { name: '책사', hanja: '策士', role: '책략', atk: 16, def: 11, mov: 4, rng: 2, mp: 60,
    skills: ['hwagye', 'pungsu'], weapon: 'fan', desc: '화계로 방어를 무시하는 피해, 풍수로 적 방어를 깎는다.' },
  pungsusa: { name: '풍수사', hanja: '風水師', role: '회복·보조', atk: 15, def: 12, mov: 4, rng: 2, mp: 70,
    skills: ['sobogeup', 'daebogeup', 'gomu', 'pungsu'], weapon: 'staff', desc: '보급으로 아군을 살리고 고무로 공격을 올린다.' },
  dosa: { name: '도사', hanja: '道士', role: '저주·회복', atk: 18, def: 12, mov: 4, rng: 3, mp: 64,
    skills: ['yosul', 'sobogeup'], weapon: 'staff', desc: '요술로 적의 공격을 약화시키고 부상병을 회복한다.' },
  gungsu: { name: '궁수', hanja: '弓手', role: '원거리', atk: 25, def: 13, mov: 4, rng: 3, mp: 16,
    skills: ['jipsajung'], weapon: 'bow', desc: '3칸 밖에서 일방적으로 사격. 산·성 위에서 사거리 +1.' },
  mudoga: { name: '무도가', hanja: '武道家', role: '연격·기동', atk: 33, def: 15, mov: 5, rng: 1, mp: 20,
    skills: ['yeongyeok'], weapon: 'fist', desc: '맨몸의 연격으로 두 번 때린다. 평지에서 공격 +10%.' },
  yasubyung: { name: '야수병', hanja: '野獸兵', role: '숲·산 추격', atk: 36, def: 16, mov: 6, rng: 1, mp: 18,
    skills: ['yaseup'], weapon: 'claw', desc: '호랑이 부대. 숲·산지에서 공격 +20%, 이동 6.' },
  muhui: { name: '무희', hanja: '舞姬', role: '유혹·교란', atk: 20, def: 10, mov: 5, rng: 2, mp: 48,
    skills: ['yuhok'], weapon: 'ribbon', desc: '춤으로 적의 공격을 크게 떨어뜨린다. 사거리 2.' },
  yeonnobyung: { name: '연노병', hanja: '連弩兵', role: '연사·원거리', atk: 27, def: 15, mov: 3, rng: 4, mp: 18,
    skills: ['yeonno'], weapon: 'crossbow', desc: '연발 쇠뇌로 4칸을 두 번 쏜다. 느리지만 화력이 뛰어나다.' },
  deunggabyung: { name: '등갑병', hanja: '藤甲兵', role: '철벽 방어', atk: 28, def: 31, mov: 3, rng: 1, mp: 12,
    skills: ['bangpae'], weapon: 'sword', desc: '등나무 갑옷의 중장 보병. 느리지만 좀처럼 뚫리지 않는다.' },
  gunakdae: { name: '군악대', hanja: '軍樂隊', role: '사기·지원', atk: 12, def: 12, mov: 4, rng: 2, mp: 60,
    skills: ['gomu', 'jihwi'], weapon: 'drum', desc: '북과 나팔로 아군의 사기를 올린다. 직접 싸움은 약하다.' },
  pocha: { name: '포차', hanja: '砲車', role: '공성 병기', atk: 46, def: 26, mov: 2, rng: 4, minRng: 2, mp: 10,
    skills: ['pogyeok'], weapon: 'ram', siege: true, desc: '성문·성벽에 2배 피해. 인접한 적은 칠 수 없고 이동이 느리다.' },
  balseokcha: { name: '발석차', hanja: '發石車', role: '투석 병기', atk: 56, def: 18, mov: 1, rng: 6, minRng: 3, mp: 10,
    skills: ['tuseok'], weapon: 'catapult', siege: true, desc: '먼 곳을 범위로 때리는 투석기. 성문 공략의 결정타.' },
};

/* ───────────── 책략 ───────────── */
SK.SKILLS = {
  jihwi: { name: '지휘', hanja: '指揮', mp: 12, kind: 'buffAreaAllies', radius: 3, atk: 0.2, turns: 2,
    desc: '주변 3칸 아군 전원 공격 +20% (2턴)' },
  dolpa: { name: '돌파', hanja: '突破', mp: 10, kind: 'power', range: 1, power: 1.55,
    desc: '한 명에게 강력한 돌격 (공격력 155%)' },
  jipsajung: { name: '집중사격', hanja: '集中射擊', mp: 8, kind: 'power', range: 3, power: 1.45,
    desc: '사거리 안의 적 하나를 집중 사격' },
  gwantung: { name: '관통창', hanja: '貫通槍', mp: 8, kind: 'power', range: 2, power: 1.4, vsMount: 0.4,
    desc: '2칸 찌르기. 기병에게 +40% 추가 피해' },
  sobogeup: { name: '소보급', hanja: '小補給', mp: 8, kind: 'heal', range: 2, power: 520,
    desc: '아군 1명의 병력을 520 회복' },
  daebogeup: { name: '대보급', hanja: '大補給', mp: 18, kind: 'healArea', radius: 2, power: 360,
    desc: '주변 2칸 아군 전원 병력 360 회복' },
  gomu: { name: '고무', hanja: '鼓舞', mp: 12, kind: 'buffAlly', range: 2, atk: 0.3, turns: 2,
    desc: '아군 1명 공격 +30% (2턴)' },
  pungsu: { name: '풍수', hanja: '風水', mp: 16, kind: 'debuffDef', range: 3, radius: 2, turns: 2, amount: -0.25,
    desc: '지점 2칸 안의 적 방어 -25% (2턴)' },
  hwagye: { name: '화계', hanja: '火計', mp: 12, kind: 'magic', range: 3, power: 260,
    desc: '불을 질러 방어를 무시하는 피해' },
  sangang: { name: '산악강타', hanja: '山岳强打', mp: 8, kind: 'power', range: 1, power: 1.5, ignoreTerrain: true,
    desc: '지형 방어를 무시하는 강타' },
  suryu: { name: '수류참', hanja: '水流斬', mp: 8, kind: 'power', range: 1, power: 1.5, waterBonus: true,
    desc: '물 위에서 더 강한 일격 (+15%)' },
  bangpae: { name: '방패벽', hanja: '防牌壁', mp: 8, kind: 'buffSelf', def: 0.5, turns: 2,
    desc: '자신의 방어 +50% (2턴)' },
  yosul: { name: '요술', hanja: '妖術', mp: 14, kind: 'debuffAtk', range: 3, radius: 1, turns: 2, amount: -0.3,
    desc: '적 1명의 공격 -30% (2턴)' },
  yeongyeok: { name: '연격', hanja: '連擊', mp: 10, kind: 'power', range: 1, power: 1.3, hits: 2,
    desc: '두 번 연속 공격 (각 130%)' },
  yaseup: { name: '야습', hanja: '夜襲', mp: 10, kind: 'power', range: 1, power: 1.6,
    desc: '숲·산지에서 기습적인 강타' },
  yuhok: { name: '유혹', hanja: '誘惑', mp: 12, kind: 'debuffAtk', range: 2, radius: 2, turns: 2, amount: -0.35,
    desc: '주변 2칸 적의 공격 -35% (2턴)' },
  pogyeok: { name: '포격', hanja: '砲擊', mp: 8, kind: 'power', range: 4, minRange: 2, power: 2.0, siegeBonus: 1.0,
    desc: '성문·성벽 위의 적에게 2배 피해' },
  tuseok: { name: '투석', hanja: '投石', mp: 8, kind: 'magicArea', range: 6, minRange: 3, radius: 1, power: 320,
    desc: '먼 지점 1칸 범위에 돌을 던진다' },
  yeonno: { name: '연노사격', hanja: '連弩射擊', mp: 10, kind: 'power', range: 4, power: 1.15, hits: 2,
    desc: '4칸 밖의 적을 두 번 연속으로 쏜다' },
  gwanse: { name: '관통사격', hanja: '貫通射擊', mp: 12, kind: 'power', range: 4, power: 1.7,
    desc: '4칸 밖에서 꿰뚫는 강력한 사격' },
  paedo: { name: '해일', hanja: '海溢', mp: 18, kind: 'magicArea', range: 3, radius: 2, power: 300,
    desc: '거대한 물결로 범위를 휩쓴다' },
  cheonmu: { name: '천무', hanja: '天武', mp: 14, kind: 'power', range: 1, power: 1.85,
    desc: '하늘을 가르는 무도의 일격' },
  hwanmu: { name: '환무', hanja: '幻舞', mp: 16, kind: 'debuffAtk', range: 2, radius: 2, turns: 2, amount: -0.4,
    desc: '현혹의 춤으로 적 공격 -40%' },
  yeonpo: { name: '연속포격', hanja: '連發砲擊', mp: 14, kind: 'power', range: 5, minRange: 2, power: 2.4, siegeBonus: 0.8,
    desc: '성문에 연달아 포탄을 퍼붓는다' },
  hwayeom: { name: '화염투석', hanja: '火焰投石', mp: 16, kind: 'magicArea', range: 6, minRange: 3, radius: 2, power: 380,
    desc: '불붙은 돌을 던져 범위를 불바다로 만든다' },
};

/* 병과 → SD 유닛/초상화 */
SK.CLASS_UNIT = {
  gunwoong: 'jojo', gibi: 'gibyung', gunggi: 'gunggibyung', changbyung: 'changbyung',
  geombyung: 'bobyung', sanjeok: 'sanjeok', sujeok: 'sujeok', chaeksa: 'chaeksa',
  pungsusa: 'pungsusa', dosa: 'dosa', gungsu: 'gungbyung', mudoga: 'mudoga',
  yasubyung: 'yasubyung', muhui: 'muhui', pocha: 'pocha', balseokcha: 'balseokcha',
  yeonnobyung: 'gungbyung', deunggabyung: 'bobyung', gunakdae: 'muhui',
};
SK.CLASS_PORTRAIT = {
  gunwoong: 'gen_bobyung', gibi: 'gen_gibyung', gunggi: 'gen_gibyung', changbyung: 'gen_changbyung',
  geombyung: 'gen_bobyung', sanjeok: 'gen_sanjeok', sujeok: 'gen_sujeok', chaeksa: 'gen_chaeksa',
  pungsusa: 'gen_chaeksa', dosa: 'gen_dosa', gungsu: 'gen_gungbyung', mudoga: 'gen_mudoga',
  yasubyung: 'gen_yasubyung', muhui: 'gen_muhui', pocha: 'gen_pocha', balseokcha: 'gen_pocha',
  yeonnobyung: 'gen_gungbyung', deunggabyung: 'gen_bobyung', gunakdae: 'gen_muhui',
};
SK.REGIMENTS = [
  { cls: 'geombyung', name: '검병대', cost: 1800 },
  { cls: 'changbyung', name: '창병대', cost: 1900 },
  { cls: 'gungsu', name: '궁수대', cost: 1700 },
  { cls: 'gibi', name: '기병대', cost: 2100 },
  { cls: 'sanjeok', name: '산적대', cost: 1800 },
  { cls: 'sujeok', name: '수적대', cost: 1800 },
  { cls: 'mudoga', name: '무도가대', cost: 1800 },
  { cls: 'yasubyung', name: '야수병대', cost: 2200 },
  { cls: 'pocha', name: '포차대', cost: 2400 },
  { cls: 'balseokcha', name: '발석차대', cost: 2600 },
];

/* 지형 상성 */
SK.affinity = function (cls, ch) {
  let atk = 0, def = 0, rng = 0, label = '';
  if (cls === 'sanjeok' && (ch === 'F' || ch === 'M')) { atk = 0.30; label = '산지·숲 +30%'; }
  if (cls === 'yasubyung' && (ch === 'F' || ch === 'M')) { atk = 0.20; label = '숲·산 추격 +20%'; }
  if (cls === 'sujeok' && ch === 'W') { atk = 0.25; def = 0.15; label = '수전 +25%'; }
  if (cls === 'gibi' && (ch === 'P' || ch === 'R')) { atk = 0.15; label = '평지 돌격 +15%'; }
  if (cls === 'mudoga' && (ch === 'P' || ch === 'R')) { atk = 0.10; label = '평지 연격 +10%'; }
  if (cls === 'dosa' && (ch === 'F' || ch === 'M')) { atk = 0.10; label = '산중 수행 +10%'; }
  if (cls === 'changbyung' && ch === 'G') { def = 0.20; label = '성문 수비 +20%'; }
  if (cls === 'geombyung' && (ch === 'G' || ch === 'D')) { def = 0.20; label = '성문 수비 +20%'; }
  if ((cls === 'gungsu' || cls === 'gunggi') && (ch === 'M' || ch === 'G')) { rng = 1; label = '고지 사격 +1'; }
  if ((cls === 'pocha' || cls === 'balseokcha') && (ch === 'G' || ch === 'D')) { def = 0.15; label = '공성 진지'; }
  return { atk, def, rng, label };
};

/* ───────────── 인물 (코어·지원·범용) ───────────── */
SK.HEROES = {
  jojo: { name: '조조', hanja: '曹操', cls: 'gunwoong', lv: 4, wu: 78, ji: 92, tong: 90,
    pt: 'caocao', unit: 'jojo', quote: '천하는 넓고, 내 길은 멀다.' },
  hahoudon: { name: '하후돈', hanja: '夏侯惇', cls: 'gibi', lv: 4, wu: 94, ji: 55, tong: 80,
    pt: 'xiahoudun', unit: 'hahoudon', quote: '한 번 뚫으면 멈추지 않는다.' },
  hahouyeon: { name: '하후연', hanja: '夏侯淵', cls: 'gunggi', lv: 4, wu: 88, ji: 66, tong: 78,
    pt: 'xiahouyuan', unit: 'hahouyeon', quote: '세 번의 화살이면 충분하다.' },
  sunyoo: { name: '순유', hanja: '荀攸', cls: 'pungsusa', lv: 4, wu: 26, ji: 94, tong: 62,
    pt: 'xunyou', unit: 'sunyoo', quote: '하늘과 땅을 읽으면 이길 수 있습니다.' },
  juchang: { name: '주창', hanja: '周倉', cls: 'sanjeok', lv: 3, wu: 86, ji: 38, tong: 58,
    pt: 'zhoucang', unit: 'juchang', quote: '이 산에서는 내가 왕이다.' },
  jutaek: { name: '주태', hanja: '周泰', cls: 'sujeok', lv: 3, wu: 90, ji: 48, tong: 68,
    pt: 'zhoutai', unit: 'jutaek', quote: '강물도 내겐 길이다.' },
  mifang: { name: '미방', hanja: '糜芳', cls: 'chaeksa', lv: 2, wu: 58, ji: 74, tong: 60,
    pt: 'mifang', quote: '한 수 읽어 두겠습니다.' },
  sunqian: { name: '손건', hanja: '孫乾', cls: 'changbyung', lv: 2, wu: 62, ji: 72, tong: 64,
    pt: 'sunqian', quote: '말로 풀 수 있다면 좋겠군요.' },
  yuejin: { name: '악진', hanja: '樂進', cls: 'gibi', lv: 3, wu: 82, ji: 52, tong: 72,
    pt: 'yuejin', quote: '먼저 성에 오르겠다.' },
  wujin: { name: '우금', hanja: '于禁', cls: 'geombyung', lv: 3, wu: 76, ji: 64, tong: 80,
    pt: 'wujin', quote: '흐트러진 진은 내가 바로잡는다.' },
  lidian: { name: '이전', hanja: '李典', cls: 'gungsu', lv: 2, wu: 70, ji: 68, tong: 66,
    pt: 'lidian', quote: '한 발씩, 정확하게.' },
};

SK.GENERIC_NAMES = ['교위', '군사', '도위', '정장', '별부', '군후', '선봉', '참군'];
SK.GENERIC_PORTRAITS = { bobyung: 'gen_bobyung', gungbyung: 'gen_gungbyung', gibi: 'gen_gibyung',
  gunggi: 'gen_gibyung', chaeksa: 'gen_chaeksa', sanjeok: 'gen_sanjeok', sujeok: 'gen_sujeok',
  pungsusa: 'gen_chaeksa', gunwoong: 'gen_bobyung' };

/* ───────────── 세력 ───────────── */
SK.FACTIONS = {
  wei: { name: '위', hanja: '魏', color: '#3f6fb5', light: '#cddcf2', lord: '조조' },
  yuan: { name: '원', hanja: '袁', color: '#b34a4a', light: '#f0cfcf', lord: '원소' },
  lv: { name: '여', hanja: '呂', color: '#7a5aa8', light: '#ded1ef', lord: '여포' },
  wu: { name: '오', hanja: '吳', color: '#2e8b83', light: '#c6e5e0', lord: '손책' },
  liu: { name: '형', hanja: '荊', color: '#b58b3f', light: '#eee0bd', lord: '유표' },
  yan: { name: '익', hanja: '益', color: '#7a9a4a', light: '#dde8c6', lord: '유언' },
  ma: { name: '량', hanja: '涼', color: '#a06a3f', light: '#ead5c3', lord: '마등' },
  gongsun: { name: '공', hanja: '公', color: '#6a7fa8', light: '#d4dceb', lord: '공손찬' },
  dong: { name: '동', hanja: '董', color: '#8a5a5a', light: '#e3cfcf', lord: '동탁' },
  han: { name: '한', hanja: '韓', color: '#7f8577', light: '#dfe1d9', lord: '한왕' },
  shu: { name: '촉', hanja: '蜀', color: '#4f8f5a', light: '#d7e6cf', lord: '유비' },
  warlord: { name: '군웅', hanja: '雄', color: '#7a5a8a', light: '#e2d6ec', lord: '군웅' },
  neutral: { name: '중', hanja: '中', color: '#8d8d8d', light: '#e4e4e4', lord: '중립' },
};

SK.BOSS_PORTRAITS = {
  yuan: { name: '원소', hanja: '袁紹', pt: 'yuanshao', cls: 'gunwoong', lv: 6 },
  lv: { name: '여포', hanja: '呂布', pt: 'lvbu', cls: 'gibi', lv: 8 },
  wu: { name: '손책', hanja: '孫策', pt: 'sunce', cls: 'gibi', lv: 6 },
  liu: { name: '유표', hanja: '劉表', pt: 'liubiao', cls: 'gunwoong', lv: 5 },
};

/* ───────────── 승급 · 경험치 ───────────── */
SK.PROMO = {
  gunwoong: { names: ['군주', '패왕', '천하대장군', '위무대왕', '천하대장군'], at: [5, 10, 20, 30], skills: ['gomu', 'jihwi'] },
  gibi: { names: ['기병', '중기병', '철기병', '용기병', '천하기병'], at: [5, 10, 20, 30], skills: ['bangpae', 'yeongyeok'] },
  gunggi: { names: ['궁기', '신궁기', '백발신궁', '천궁', '신궁'], at: [5, 10, 20, 30], skills: ['gwanse', 'jipsajung'] },
  changbyung: { names: ['창병', '장창병', '철창병', '신창병', '창성'], at: [5, 10, 20, 30], skills: ['bangpae', 'gwanse'] },
  geombyung: { names: ['검병', '정예검병', '무쌍검병', '검성', '검신'], at: [5, 10, 20, 30], skills: ['yeongyeok', 'bangpae'] },
  sanjeok: { names: ['산적', '호적', '산왕', '산신', '산의왕'], at: [5, 10, 20, 30], skills: ['yaseup', 'sangang'] },
  sujeok: { names: ['수적', '수귀', '해룡', '수신', '해왕'], at: [5, 10, 20, 30], skills: ['paedo', 'suryu'] },
  chaeksa: { names: ['책사', '참모', '군사', '신책', '천하책사'], at: [5, 10, 20, 30], skills: ['pungsu', 'hwayeom'] },
  pungsusa: { names: ['풍수사', '대풍수사', '천기사', '신풍수', '천지풍수'], at: [5, 10, 20, 30], skills: ['gomu', 'pungsu'] },
  dosa: { names: ['도사', '선인', '신선', '천사', '천존'], at: [5, 10, 20, 30], skills: ['yosul', 'hwayeom'] },
  gungsu: { names: ['궁수', '신궁수', '명궁', '신궁', '천궁수'], at: [5, 10, 20, 30], skills: ['gwanse', 'jipsajung'] },
  mudoga: { names: ['무도가', '권성', '무신', '천하무적', '무성'], at: [5, 10, 20, 30], skills: ['cheonmu', 'yeongyeok'] },
  yasubyung: { names: ['야수병', '맹수병', '백호대', '용호대', '만수대'], at: [5, 10, 20, 30], skills: ['sangang', 'yaseup'] },
  muhui: { names: ['무희', '선무희', '천무희', '무신희', '선녀'], at: [5, 10, 20, 30], skills: ['hwanmu', 'yuhok'] },
  pocha: { names: ['포차', '대포차', '천자포', '신기포', '천하포'], at: [5, 10, 20, 30], skills: ['yeonpo', 'pogyeok'] },
  balseokcha: { names: ['발석차', '대발석차', '신기전', '천뢰차', '천지차'], at: [5, 10, 20, 30], skills: ['hwayeom', 'tuseok'] },
  yeonnobyung: { names: ['연노병', '정예연노', '신연노', '천하연노', '연노신병'], at: [5, 10, 20, 30], skills: ['gwanse', 'yeonno'] },
  deunggabyung: { names: ['등갑병', '철등갑', '무쌍등갑', '등갑신병', '철벽'], at: [5, 10, 20, 30], skills: ['yeongyeok', 'bangpae'] },
  gunakdae: { names: ['군악대', '대군악대', '천군악', '군신악', '천하군악'], at: [5, 10, 20, 30], skills: ['jihwi', 'gomu'] },
};
SK.tierForLv = function (lv) {
  let t = 0;
  [5, 10, 20, 30].forEach((n) => { if (lv >= n) t += 1; });
  return Math.min(4, t);
};
SK.classTitle = function (cls, lv) {
  const p = SK.PROMO[cls];
  if (!p) return SK.CLASSES[cls].name;
  return p.names[Math.min(p.names.length - 1, SK.tierForLv(lv))];
};
SK.skillsFor = function (cls, lv) {
  return (SK.CLASSES[cls].skills || []).filter((k) => {
    const sk = SK.SKILLS[k];
    return sk && (!sk.unlockLv || lv >= sk.unlockLv);
  });
};
SK.expNeed = function (lv) { return 100 + lv * 45; };
SK.troopForNamed = function (lv, tier) {
  tier = tier == null ? SK.tierForLv(lv) : tier;
  return Math.min(4800, Math.round(1600 + lv * 120 + tier * 380));
};
SK.nextPromo = function (lv) {
  const at = [5, 10, 20, 30];
  for (let i = 0; i < at.length; i++) if (lv < at[i]) return at[i];
  return null;
};

/* ───────────── 499 장수 데이터 연결 ───────────── */
SK.JOB_CLASS = {
  '군주': 'gunwoong', '기병': 'gibi', '궁기': 'gunggi', '창병': 'changbyung', '검병': 'geombyung',
  '산적': 'sanjeok', '수적': 'sujeok', '책사': 'chaeksa', '풍수사': 'pungsusa', '도사': 'dosa',
  '궁수': 'gungsu', '무도가': 'mudoga', '야수병': 'yasubyung', '무희': 'muhui', '포차': 'pocha',
  '연노병': 'yeonnobyung', '등갑병': 'deunggabyung', '군악대': 'gunakdae',
};
SK.FACTION_OF = { '위': 'wei', '촉': 'shu', '오': 'wu', '군웅': 'warlord', '한국': 'han' };
SK.TIER_LV = { S: 5, A: 4, B: 3, C: 2 };
SK.CITY_LORDS = {
  wuwei: ['마등', '마초', '방덕'], anding: ['마등', '한수'], tianshui: ['마등', '강유'],
  changan: ['이각', '곽사', '진궁'], luoyang: ['동탁', '여포', '화웅'], huluguan: ['서영'],
  jinyang: ['원소', '고간'], ye: ['원소', '안량', '문추', '심배'], shangdang: ['원소', '곽도'],
  pingyuan: ['원소', '안량'], nanpi: ['원소', '문추'],
  ji: ['공손찬', '조운', '공손월'], beiping: ['공손찬', '조운'], zhuojun: ['공손찬', '장비'],
  xiapi: ['여포', '장료', '고순'], xiaopei: ['여포', '장료'], peng: ['여포', '고순'],
  shouchun: ['원술', '기령', '장훈'], hefei: ['원술', '장훈'],
  xiangyang: ['유표', '채모', '괴월'], jiangling: ['유표', '문빙'], jiangxia: ['유표', '황조'],
  jianye: ['손책', '주유', '정보'], wu: ['손책', '손권', '정보'], kuaiji: ['손책', '능통'],
  chengdu: ['유장', '장임', '오의'], zhidong: ['유장', '장임'], hanzhong: ['장로', '장위', '양임'],
  jiangzhou: ['유장', '엄안'], yongan: ['유장', '오의'],
  pyongyang: ['을지문덕', '연개소문'], guknaeseong: ['광개토대왕', '을지문덕'],
  hanseong: ['근초고왕'], gyeongju: ['김유신', '계백'], nangnang: ['거칠부'],
  daebang: ['동명성왕'], ansiseong: ['광개토대왕'],
};
SK.TB = {};
SK.parseRange = function (r) {
  if (typeof r === 'number') return { min: 1, max: r };
  const parts = String(r).split('~').map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));
  if (!parts.length) return { min: 1, max: 1 };
  return { min: parts[0], max: parts[parts.length - 1] };
};
SK.applyClassData = function (list) {
  if (!list || !list.length) return;
  list.forEach((d) => {
    const cls = SK.JOB_CLASS[d.job];
    if (!cls || !SK.CLASSES[cls]) return;
    const C = SK.CLASSES[cls];
    C.mov = d.moveRange || C.mov;
    const rng = SK.parseRange(d.attackRange);
    C.rng = rng.max;
    C.minRng = rng.min;
    SK.TB[cls] = Object.assign({ siege: 0, naval: 0, mountain: 0, fortress: 0 }, d.terrainBonus || {});
    if (d.promotions && d.promotions.length) {
      SK.PROMO[cls] = SK.PROMO[cls] || { names: [], at: [5, 10, 20, 30], skills: [] };
      SK.PROMO[cls].names = [C.name].concat(d.promotions.slice(0, 4));
    }
    C.skills = (d.skills || []).map((sk, i) => {
      const key = 'c_' + cls + '_' + i;
      const eff = sk.effect || '';
      const def = { name: sk.name, hanja: '', mp: sk.mp, unlockLv: sk.unlockLv || 1, desc: eff, range: rng.max, minRange: rng.min };
      if (/회복/.test(eff) || /회복/.test(sk.name)) {
        def.kind = 'heal'; def.power = 420 + sk.mp * 14; def.range = Math.max(2, rng.max);
      } else if (/아군/.test(eff) && /(공격|사기|방어|진형)/.test(eff)) {
        def.kind = 'buffAreaAllies'; def.radius = 2; def.atk = 0.2; def.turns = 2;
      } else if (/적/.test(eff) && /(방어|사기|공격|혼란|매혹)/.test(eff) && !/피해/.test(eff)) {
        def.kind = /방어/.test(eff) ? 'debuffDef' : 'debuffAtk';
        def.radius = 2; def.amount = -0.25; def.turns = 2;
      } else if (/(화|뇌|불|폭풍|충격|붕괴|석|해일|천벌)/.test(sk.name + eff) && /피해|폭발|광역|휩쓸/.test(eff)) {
        def.kind = 'magicArea'; def.radius = 1; def.power = 240 + sk.mp * 9;
      } else {
        def.kind = 'power';
        const m = eff.match(/(\d{2,3})\s*%/);
        def.power = m ? Math.min(2.6, Number(m[1]) / 100) : 1.35 + sk.mp * 0.02;
      }
      SK.SKILLS[key] = def;
      return key;
    });
  });
};
SK.terrainBonus = function (cls, type) {
  const t = SK.TB[cls];
  return t ? (t[type] || 0) : 0;
};

SK.SCENARIOS = [];
SK.setScenarios = function (list) { SK.SCENARIOS = list || []; };
SK.applyScenario = function (cities, sc) {
  if (!sc || !sc.factions) return null;
  const caps = Object.keys(sc.factions).map((f) => {
    const info = sc.factions[f];
    const c = SK.CITY_LIST.find((x) => x.name === info.capital);
    return c ? { key: SK.JFAC[f] || 'warlord', label: f, city: c } : null;
  }).filter(Boolean);
  if (caps.length < 2) return null;
  SK.CITY_LIST.forEach((c) => {
    let best = caps[0], bd = Infinity;
    caps.forEach((k) => {
      const d = Math.hypot((c.u - k.city.u) * 2000, (c.v - k.city.v) * 1333);
      if (d < bd) { bd = d; best = k; }
    });
    cities[c.id].owner = best.key;
  });
  return sc;
};

SK.EVENTS = [];
SK.setEvents = function (list) { SK.EVENTS = list || []; };

/* ───────────── 내정 계절 이벤트 (data/domestic_events.json) ──────────── */
SK.DOMESTIC_EVENTS = [];
SK.setDomesticEvents = function (list) { SK.DOMESTIC_EVENTS = (list || []).filter((e) => e && e.title); };

/* ───────────── 전용 일러스트 (data/top100_art_manifest.json) ──────────── */
SK.ART = {};
SK.setTopArt = function (manifest) {
  SK.ART = {};
  if (!manifest) return;
  Object.keys(manifest).forEach((name) => {
    const a = manifest[name];
    if (a && (a.portrait || a.unit)) SK.ART[name] = a;
  });
};
SK.artFor = function (name) { return SK.ART[name] || null; };
SK.ptSrc = function (p) {
  if (!p) return 'assets/portraits/v2/gen_bobyung.webp';
  return String(p).indexOf('/') >= 0 ? p : `assets/portraits/v2/${p}.webp`;
};
SK.unitSrc = function (u) {
  const key = u || 'bobyung';
  return String(key).indexOf('/') >= 0 ? key : `assets/units/v2/${key}.webp`;
};
SK.artPortrait = function (name) { const a = SK.ART[name]; return a && a.portrait ? a.portrait : null; };
SK.artUnit = function (name) { const a = SK.ART[name]; return a && a.unit ? a.unit : null; };

/* ───────────── 관작·대사 (data/quotes_and_ranks.json) ──────────── */
SK.RANKS = [];
SK.QUOTES = {};
SK.setQuotesAndRanks = function (data) {
  if (!data) return;
  SK.RANKS = (data.ranks || []).slice().sort((a, b) => a.minRenown - b.minRenown);
  SK.QUOTES = data.quotes || {};
};
SK.rankFor = function (fame) {
  const f = fame || 0;
  let cur = { level: 1, title: '현령', minRenown: 0, salaryGold: 0, maxTroopsBonus: 0 };
  SK.RANKS.forEach((r) => { if (f >= r.minRenown) cur = r; });
  return cur;
};
SK.nextRank = function (fame) {
  const f = fame || 0;
  return SK.RANKS.find((r) => r.minRenown > f) || null;
};
SK.quoteOf = function (name, kind) {
  const q = SK.QUOTES[name];
  if (!q) return '';
  return q[kind] || '';
};

/* ───────────── 인연 · 숙적 (data/bonds.json) ──────────── */
SK.BONDS = [];
SK.BOND_BY_NAME = {};
SK.setBonds = function (list) {
  SK.BONDS = (list || []).filter((b) => b && b.a && b.b);
  SK.BOND_BY_NAME = {};
  SK.BONDS.forEach((b) => {
    (SK.BOND_BY_NAME[b.a] = SK.BOND_BY_NAME[b.a] || []).push(b);
    (SK.BOND_BY_NAME[b.b] = SK.BOND_BY_NAME[b.b] || []).push(b);
  });
};
SK.bondsOf = function (name) { return SK.BOND_BY_NAME[name] || []; };
SK.bondBetween = function (a, b) {
  if (!a || !b || a === b) return null;
  const list = SK.BOND_BY_NAME[a] || [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    if ((x.a === a && x.b === b) || (x.a === b && x.b === a)) return x;
  }
  return null;
};
SK.bondPartner = function (bond, name) { return bond.a === name ? bond.b : bond.a; };
SK.EVENT_ALIASES = {
  '호로관': ['huluguan'], '하비': ['xiapi'], '완성': ['wan'], '서주': ['xiapi', 'xiaopei'],
  '장판교': ['xinye', 'xiangyang'], '적벽': ['jiangxia', 'wu'], '관도': ['xuchang', 'puyang', 'yanjin'],
  '화용도': ['jiangling'], '합비': ['hefei'], '이릉': ['yongan'], '정군산': ['hanzhong'],
  '오장원': ['changan'], '번성': ['xiangyang'], '낙양': ['luoyang'], '허창': ['xuchang'],
  '업성': ['ye'], '평양': ['pyongyang'], '한성': ['hanseong'], '안시성': ['ansiseong'],
  '살수': ['pyongyang'], '귀주': ['gangju'], '행주': ['hanseong'], '명량': ['busan'],
  '한산도': ['busan', 'tamna'], '노량': ['busan'], '진포': ['busan'], '계양': ['guiyang'],
  '장사': ['changsha'], '강동': ['jianye'], '성도': ['chengdu'], '천수': ['tianshui'],
};
SK.pickEvent = function (city, generals) {
  if (!SK.EVENTS.length) return null;
  const gn = (generals || []).map((g) => g.name);
  let best = null, bestScore = 0;
  SK.EVENTS.forEach((ev) => {
    const text = (ev.title || '') + ' ' + (ev.trigger || '') + ' ' + (ev.dialogue || '');
    let score = 0;
    Object.keys(SK.EVENT_ALIASES).forEach((key) => {
      if (text.includes(key) && SK.EVENT_ALIASES[key].includes(city.id)) score += 3;
    });
    if (text.includes(city.name)) score += 4;
    gn.forEach((n) => { if (n && text.includes(n)) score += 5; });
    if (score > bestScore) { bestScore = score; best = ev; }
  });
  return bestScore >= 3 ? best : null;
};

SK.GENERALS = [];
SK.GEN_BY_ID = {};
SK.GEN_BY_NAME = {};
SK.setGenerals = function (list) {
  SK.GENERALS = list || [];
  SK.GEN_BY_ID = {}; SK.GEN_BY_NAME = {};
  SK.GENERALS.forEach((g) => { SK.GEN_BY_ID[g.id] = g; SK.GEN_BY_NAME[g.name] = g; });
};
SK.genClass = function (g) { return (g && SK.JOB_CLASS[g.job]) || 'geombyung'; };
SK.genLv = function (g) { return (g && SK.TIER_LV[g.tier]) || 3; };
SK.genPortrait = function (g) {
  const art = SK.artPortrait(g && g.name);
  if (art) return art;
  const core = Object.values(SK.HEROES).find((h) => h.name === g.name);
  return core ? core.pt : (SK.CLASS_PORTRAIT[SK.genClass(g)] || 'gen_bobyung');
};
SK.genUnit = function (g) {
  const art = SK.artUnit(g && g.name);
  if (art) return art;
  const core = Object.values(SK.HEROES).find((h) => h.name === g.name);
  return (core && core.unit) || SK.CLASS_UNIT[SK.genClass(g)];
};
SK.genStats = function (g) {
  return { wu: g.war, ji: g.intel, tong: g.leadership };
};

/* ───────────── 150 보물 ───────────── */
SK.TREASURES = [];
SK.TREASURE_BY_ID = {};
SK.TREASURE_SLOTS = { '무기': 'weapon', '방어구': 'armor', '명마': 'horse', '병법서·보물': 'manual' };
SK.SLOT_NAMES = { weapon: '무기', armor: '방어구', horse: '명마', manual: '병법서' };
SK.GRADE_COLOR = { '전설': '#a8443a', '영웅': '#7a5aa8', '희귀': '#3f7a5a' };
SK.setTreasures = function (list) {
  SK.TREASURES = list || [];
  SK.TREASURE_BY_ID = {};
  SK.TREASURES.forEach((t) => { SK.TREASURE_BY_ID[t.id] = t; });
};
SK.treasureSlot = function (t) { return SK.TREASURE_SLOTS[t.type] || 'manual'; };
SK.treasureStats = function (t) {
  return { war: t.statBonus.war || 0, intel: t.statBonus.intel || 0, leadership: t.statBonus.leadership || 0,
    charm: t.statBonus.charm || 0, politics: t.statBonus.politics || 0, move: t.statBonus.move || 0 };
};
SK.equipBonus = function (h) {
  const out = { war: 0, intel: 0, leadership: 0, charm: 0, politics: 0, move: 0 };
  if (!h || !h.equip) return out;
  Object.values(h.equip).forEach((id) => {
    const t = SK.TREASURE_BY_ID[id];
    if (!t) return;
    const st = SK.treasureStats(t);
    Object.keys(out).forEach((k) => { out[k] += st[k]; });
  });
  return out;
};

/* ───────────── 76 거점 ─────────────
   [id, 이름, 한자, u, v, 유형, 세력, 지역] */
/* ───────────── 77 거점 (data/cities.json) ───────────── */
SK.CITY = {};
SK.CITY_LIST = [];
SK.ROADS = [];
SK.SEALANES = [];
SK.JFAC = { '위': 'wei', '촉': 'shu', '오': 'wu', '군웅': 'warlord', '한국': 'han' };
SK.TYPE_KEY = { '대도시': 'capital', '소도시': 'town', '관문': 'pass', '요새': 'fortress' };

SK.setCities = function (list) {
  Object.keys(SK.CITY).forEach((k) => delete SK.CITY[k]);
  SK.CITY_LIST = [];
  (list || []).forEach((d) => {
    const geo = SK.CITY_GEO[d.name];
    if (!geo) return;
    const [id, hanja, u, v, region] = geo;
    SK.CITY[id] = {
      id, name: d.name, hanja, u, v, region,
      type: SK.TYPE_KEY[d.type] || 'town',
      faction: SK.JFAC[d.faction] || 'warlord',
      battleType: d.battleType || 'siege',
      gold: d.gold || 6000, food: d.food || 9000,
      baseTroops: d.troops || 6000, defense: d.defense || 70,
      governor: d.governor || '', roads: [], sea: [],
    };
    SK.CITY_LIST.push(SK.CITY[id]);
  });
  SK.buildRoads();
};

SK.buildRoads = function () {
  const pts = SK.CITY_LIST;
  if (!pts.length) return;
  const dist = (a, b) => Math.hypot((a.u - b.u) * 2000, (a.v - b.v) * 1333);
  const edges = new Set();
  const add = (a, b) => {
    if (a === b) return;
    const k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
    if (edges.has(k)) return;
    edges.add(k);
    a.roads.push(b.id); b.roads.push(a.id);
    SK.ROADS.push([a.id, b.id]);
  };
  // 1) 최소 신장 트리 — 모든 거점 연결 보장
  const inTree = new Set([pts[0].id]);
  const rest = pts.slice(1);
  while (rest.length) {
    let bi = 0, bj = 0, bd = Infinity;
    rest.forEach((b, j) => {
      pts.forEach((a) => {
        if (!inTree.has(a.id)) return;
        const d = dist(a, b);
        if (d < bd) { bd = d; bi = j; bj = 0; }
      });
    });
    const b = rest.splice(bi, 1)[0];
    let best = null, bdist = Infinity;
    inTree.forEach((aid) => {
      const a = SK.CITY[aid];
      const d = dist(a, b);
      if (d < bdist) { bdist = d; best = a; }
    });
    if (best) add(best, b);
    inTree.add(b.id);
  }
  // 2) 가까운 두 이웃 추가 — 길이 갈라지고 순환로가 생긴다
  pts.forEach((a) => {
    pts.filter((b) => b !== a).sort((x, y) => dist(a, x) - dist(a, y)).slice(0, 2).forEach((b) => add(a, b));
  });
  // 3) 해로
  const sea = [['tamna', 'busan'], ['tamna', 'jianye'], ['taipei', 'jianan'], ['tainan', 'nanhai'],
    ['hailing', 'jianye'], ['liaodong', 'pyongyang'], ['busan', 'tainan'], ['langya', 'beihai']];
  sea.forEach(([a, b]) => {
    if (!SK.CITY[a] || !SK.CITY[b]) return;
    SK.CITY[a].sea.push(b); SK.CITY[b].sea.push(a);
    SK.SEALANES.push([a, b]);
  });
};

SK.neighbors = function (id) { return (SK.CITY[id] && SK.CITY[id].roads) || []; };
SK.seaNeighbors = function (id) { return (SK.CITY[id] && SK.CITY[id].sea) || []; };
SK.allNeighbors = function (id) { return SK.neighbors(id).concat(SK.seaNeighbors(id)); };

/* 도시 유형·데이터의 battleType을 그대로 사용 */
SK.battleTypeFor = function (city) {
  if (!city) return 'siege';
  return city.battleType || 'siege';
};

/* 방어 병력 기본값 (fallback) */
SK.cityTroopsBase = function (type) {
  return { capital: 15000, town: 9500, pass: 11000, fortress: 12000 }[type] || 9000;
};

/* ───────────── 전장 지도 (18×18) ───────────── */
function blankGrid() {
  return Array.from({ length: 18 }, () => Array(18).fill('P'));
}
function g2s(g) { return g.map((r) => r.join('')); }
function paint(g, list, ch) {
  list.forEach(([y, x]) => { if (y >= 0 && y < 18 && x >= 0 && x < 18) g[y][x] = ch; });
}

function siegeMap() {
  const g = blankGrid();
  for (let y = 0; y < 18; y++) {
    const wx = 12 + Math.floor((y * 3) / 17);
    const gate = y === 8 || y === 9;
    for (let x = wx; x < Math.min(wx + 2, 18); x++) g[y][x] = gate ? 'G' : 'C';
    for (let x = wx + 2; x < 18; x++) g[y][x] = 'D';
  }
  for (let y = 8; y <= 9; y++) for (let x = 3; x < 12; x++) g[y][x] = 'R';
  paint(g, [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [2, 0], [2, 1], [15, 1], [16, 1], [16, 2], [15, 2], [17, 3]], 'F');
  paint(g, [[0, 5], [0, 6], [1, 5], [3, 2], [4, 2], [12, 3], [13, 2], [14, 3]], 'M');
  paint(g, [[5, 10], [6, 10], [5, 11], [13, 6], [14, 6], [12, 12], [13, 13]], 'F');
  return g2s(g);
}

function navalMap() {
  const g = blankGrid();
  for (let y = 5; y <= 10; y++) for (let x = 0; x < 18; x++) g[y][x] = 'W';
  for (let x = 0; x < 18; x++) { g[4][x] = 'S'; g[11][x] = 'S'; }
  for (let y = 3; y <= 12; y++) { g[y][4] = 'B'; g[y][5] = 'B'; g[y][12] = 'B'; g[y][13] = 'B'; }
  paint(g, [[0, 0], [0, 1], [1, 0], [1, 1], [0, 16], [0, 17], [1, 16], [1, 17], [16, 0], [16, 1], [17, 0], [17, 1], [16, 16], [16, 17], [17, 16], [17, 17]], 'F');
  paint(g, [[2, 2], [3, 2], [2, 15], [3, 15], [14, 2], [15, 2], [14, 15], [15, 15]], 'F');
  paint(g, [[6, 8], [6, 9], [7, 8], [1, 9], [16, 8]], 'R');
  return g2s(g);
}

function mountainMap() {
  const g = blankGrid();
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) g[y][x] = 'M';
  const path = [[16, 2], [15, 4], [13, 5], [12, 7], [10, 8], [9, 10], [7, 11], [6, 13], [4, 14], [3, 16]];
  let prev = path[0];
  const carve = (y, x) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ny = y + dy, nx = x + dx;
      if (ny >= 0 && ny < 18 && nx >= 0 && nx < 18) g[ny][nx] = 'P';
    }
  };
  carve(prev[0], prev[1]);
  path.slice(1).forEach((p) => {
    const steps = Math.max(Math.abs(p[0] - prev[0]), Math.abs(p[1] - prev[1]));
    for (let i = 1; i <= steps; i++) {
      carve(Math.round(prev[0] + ((p[0] - prev[0]) * i) / steps), Math.round(prev[1] + ((p[1] - prev[1]) * i) / steps));
    }
    prev = p;
  });
  paint(g, [[16, 2], [16, 3], [15, 2], [14, 3], [13, 4], [12, 6], [11, 8], [10, 9], [8, 11], [7, 13], [5, 15]], 'R');
  paint(g, [[4, 10], [3, 12], [6, 9], [8, 7], [10, 5], [12, 10], [14, 8], [15, 11], [3, 8], [1, 3], [2, 15], [5, 16]], 'F');
  paint(g, [[0, 0], [0, 1], [1, 0], [16, 16], [17, 17], [17, 16]], 'W');
  return g2s(g);
}

function fortressMap() {
  const g = blankGrid();
  for (let y = 2; y <= 9; y++) for (let x = 10; x <= 17; x++) {
    const wall = y === 2 || y === 9 || x === 10 || x === 17;
    g[y][x] = wall ? 'C' : 'D';
  }
  g[9][12] = 'G'; g[9][13] = 'G';
  paint(g, [[12, 3], [13, 4], [14, 5], [13, 7], [12, 8], [10, 11], [9, 12], [10, 12], [9, 13], [10, 13]], 'R');
  paint(g, [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [15, 12], [16, 12], [16, 13], [15, 13], [17, 14], [14, 14]], 'F');
  paint(g, [[14, 0], [15, 0], [15, 1], [16, 0], [13, 1], [5, 0], [6, 0], [5, 1]], 'M');
  paint(g, [[13, 0], [13, 1], [14, 1]], 'W');
  paint(g, [[13, 2]], 'S');
  paint(g, [[16, 3], [17, 4], [16, 5], [15, 4]], 'F');
  return g2s(g);
}

SK.MAPS = {
  siege: siegeMap(),
  naval: navalMap(),
  mountain: mountainMap(),
  fortress: fortressMap(),
};

/* 전장 유형 정보 */
SK.BATTLE_TYPES = {
  siege: { name: '공성전', hanja: '攻城戰', map: 'siege', desc: '성벽과 성문을 뚫어라',
    objective: '성문을 넘어 적을 전멸시켜라', skill: '수적과 궁기병이 성문 돌파에 유리합니다.' },
  naval: { name: '수전', hanja: '水戰', map: 'naval', desc: '강을 건너 적선을 무찔러라',
    objective: '다리와 물길을 이용해 적을 전멸시켜라', skill: '수적은 물 위를 걸을 수 있습니다.' },
  mountain: { name: '산전', hanja: '山戰', map: 'mountain', desc: '협곡의 길목을 점령하라',
    objective: '허리 길을 따라 올라가 적을 전멸시켜라', skill: '산적은 산지·숲에서 강해집니다.' },
  fortress: { name: '요새전', hanja: '要塞戰', map: 'fortress', desc: '목책과 망루를 함락하라',
    objective: '목책의 성문을 부수고 적을 전멸시켜라', skill: '보병과 책사가 성문 공략에 적합합니다.' },
};

/* 도시 유형·지역으로 전장 결정 */
SK.battleTypeFor = function (city) {
  if (!city) return 'siege';
  if (city.type === 'pass' || city.type === 'fortress') return 'fortress';
  const coastal = ['jianye', 'wu', 'kuaiji', 'haichang', 'shishang', 'jianan', 'guangling', 'shouchun',
    'hefei', 'lujiang', 'jiangxia', 'jiangling', 'nanhai', 'jiangzhou', 'yongan', 'pyongyang',
    'nangnang', 'daebang', 'hanseong', 'busan', 'tamna', 'taipei', 'tainan', 'bohai', 'beihai'];
  const mountain = ['hanzhong', 'shangyong', 'wuling', 'lingling', 'jianning', 'yunnan', 'yongchang',
    'luoshui', 'zhidong', 'ansiseong', 'gaeseong', 'gyeongju', 'jianwei'];
  if (coastal.includes(city.id)) return 'naval';
  if (mountain.includes(city.id)) return 'mountain';
  return 'siege';
};

/* 방어 병력 기본값 */
SK.cityTroopsBase = function (type) {
  return { capital: 6400, town: 4200, pass: 4800, fortress: 5000 }[type] || 4000;
};

/* 적 부대 구성 */
SK.enemyClassesFor = function (type, idx) {
  const tables = {
    siege:    ['geombyung', 'yeonnobyung', 'chaeksa', 'pocha', 'changbyung', 'balseokcha', 'deunggabyung', 'gungsu'],
    naval:    ['sujeok', 'sujeok', 'gungsu', 'sujeok', 'chaeksa', 'dosa', 'gunakdae', 'sujeok'],
    mountain: ['sanjeok', 'yasubyung', 'sanjeok', 'yeonnobyung', 'chaeksa', 'mudoga', 'sanjeok', 'yasubyung'],
    fortress: ['deunggabyung', 'gungsu', 'changbyung', 'pocha', 'chaeksa', 'balseokcha', 'yeonnobyung', 'geombyung'],
  };
  const t = tables[type] || tables.siege;
  return t[idx % t.length];
};

/* 배치 좌표 [x, y] (18×18) */
SK.enemySlots = function (type) {
  if (type === 'siege') return [[16, 2], [16, 5], [16, 8], [16, 11], [16, 14], [15, 3], [15, 12], [14, 8]];
  if (type === 'naval') return [[3, 2], [6, 2], [9, 2], [12, 2], [15, 2], [5, 1], [11, 1], [14, 1]];
  if (type === 'mountain') return [[16, 2], [14, 4], [11, 7], [10, 9], [8, 10], [13, 5], [15, 3], [9, 11]];
  return [[12, 4], [15, 4], [13, 6], [16, 7], [11, 7], [12, 9], [14, 5], [16, 3]];
};
SK.allySlots = function (type) {
  if (type === 'siege') return [[6, 12], [6, 14], [8, 13], [8, 15], [5, 11], [7, 16], [5, 15], [9, 14], [4, 12], [9, 16]];
  if (type === 'naval') return [[3, 15], [6, 15], [9, 15], [12, 15], [15, 15], [4, 16], [7, 16], [10, 16], [13, 16], [16, 16]];
  if (type === 'mountain') return [[2, 16], [3, 15], [4, 14], [5, 13], [6, 12], [7, 12], [3, 16], [4, 16], [5, 14], [6, 13]];
  return [[3, 15], [5, 16], [7, 15], [9, 16], [4, 13], [6, 14], [8, 16], [2, 14], [10, 16], [5, 14]];
};
