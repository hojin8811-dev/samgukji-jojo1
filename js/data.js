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
  H: { name: '관아', def: 0.40, cost: 99, icon: 'wall' }, /* v5.1 — 성 안 궁궐·관아 건물(통행 불가) */
};

/* ───────────── 병과 (16종) ───────────── */
SK.CLASSES = {
  gunwoong: { name: '군주', hanja: '君主', role: '지휘·균형', atk: 31, def: 21, mov: 4, rng: 1, mp: 46,
    skills: ['jihwi'], weapon: 'sword', desc: '군 전체를 이끄는 군주. 지휘로 아군을 강화한다.' },
  gibi: { name: '기병', hanja: '騎兵', role: '돌격·기동', atk: 34, def: 17, mov: 6, rng: 1, mp: 20,
    skills: ['dolpa'], weapon: 'spear', mount: true, desc: '이동 6의 돌격 병과. 평지·도로에서 공격 +15%, 산지 통행 불가.' },
  gunggi: { name: '궁기', hanja: '弓騎', role: '원거리·기동', atk: 29, def: 14, mov: 5, rng: 4, mp: 26,
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
  gungsu: { name: '궁수', hanja: '弓手', role: '원거리', atk: 25, def: 13, mov: 4, rng: 4, mp: 16,
    skills: ['jipsajung'], weapon: 'bow', desc: '3칸 밖에서 일방적으로 사격. 산·성 위에서 사거리 +1.' },
  mudoga: { name: '무도가', hanja: '武道家', role: '연격·기동', atk: 33, def: 15, mov: 5, rng: 1, mp: 20,
    skills: ['yeongyeok'], weapon: 'fist', desc: '맨몸의 연격으로 두 번 때린다. 평지에서 공격 +10%.' },
  yasubyung: { name: '야수병', hanja: '野獸兵', role: '숲·산 추격', atk: 36, def: 16, mov: 6, rng: 1, mp: 18,
    skills: ['yaseup'], weapon: 'claw', desc: '호랑이 부대. 숲·산지에서 공격 +20%, 이동 6.' },
  muhui: { name: '무희', hanja: '舞姬', role: '유혹·교란', atk: 20, def: 10, mov: 5, rng: 2, mp: 48,
    skills: ['yuhok'], weapon: 'ribbon', desc: '춤으로 적의 공격을 크게 떨어뜨린다. 사거리 2.' },
  yeonnobyung: { name: '연노병', hanja: '連弩兵', role: '연사·원거리', atk: 27, def: 15, mov: 3, rng: 5, mp: 18,
    skills: ['yeonno'], weapon: 'crossbow', desc: '연발 쇠뇌로 4칸을 두 번 쏜다. 느리지만 화력이 뛰어나다.' },
  deunggabyung: { name: '등갑병', hanja: '藤甲兵', role: '철벽 방어', atk: 28, def: 31, mov: 3, rng: 1, mp: 12,
    skills: ['bangpae'], weapon: 'sword', desc: '등나무 갑옷의 중장 보병. 느리지만 좀처럼 뚫리지 않는다.' },
  gunakdae: { name: '군악대', hanja: '軍樂隊', role: '사기·지원', atk: 12, def: 12, mov: 4, rng: 2, mp: 60,
    skills: ['gomu', 'jihwi'], weapon: 'drum', desc: '북과 나팔로 아군의 사기를 올린다. 직접 싸움은 약하다.' },
  pocha: { name: '포차', hanja: '砲車', role: '공성 병기', atk: 46, def: 26, mov: 2, rng: 5, minRng: 2, mp: 10,
    skills: ['pogyeok'], weapon: 'ram', siege: true, desc: '성문·성벽에 2배 피해. 인접한 적은 칠 수 없고 이동이 느리다.' },
  balseokcha: { name: '발석차', hanja: '發石車', role: '투석 병기', atk: 56, def: 18, mov: 1, rng: 7, minRng: 3, mp: 10,
    skills: ['tuseok'], weapon: 'catapult', siege: true, desc: '먼 곳을 범위로 때리는 투석기. 성문 공략의 결정타.' },
};

/* ───────────── 책략 ───────────── */
SK.SKILLS = {
  jihwi: { name: '지휘', hanja: '指揮', mp: 12, kind: 'buffAreaAllies', radius: 3, atk: 0.2, turns: 3,
    desc: '주변 3칸 아군 전원 공격 +20% (3턴)' },
  dolpa: { name: '돌파', hanja: '突破', mp: 10, kind: 'power', range: 1, power: 1.55,
    desc: '한 명에게 강력한 돌격 (공격력 155%)' },
  jipsajung: { name: '집중사격', hanja: '集中射擊', mp: 8, kind: 'power', range: 4, power: 1.45,
    desc: '사거리 안의 적 하나를 집중 사격' },
  gwantung: { name: '관통창', hanja: '貫通槍', mp: 8, kind: 'power', range: 2, power: 1.4, vsMount: 0.4,
    desc: '2칸 찌르기. 기병에게 +40% 추가 피해' },
  sobogeup: { name: '소보급', hanja: '小補給', mp: 10, kind: 'heal', range: 2, healPct: 0.16,
    desc: '아군 1명의 병력을 최대 병력의 16% 회복 (최대 22%)' },
  daebogeup: { name: '대보급', hanja: '大補給', mp: 20, kind: 'healArea', radius: 2, healPct: 0.13,
    desc: '주변 2칸 아군 전원을 최대 병력의 13% 회복' },
  gomu: { name: '고무', hanja: '鼓舞', mp: 12, kind: 'buffAlly', range: 2, atk: 0.3, turns: 3,
    desc: '아군 1명 공격 +30% (3턴)' },
  pungsu: { name: '풍수', hanja: '風水', mp: 16, kind: 'debuffDef', range: 3, radius: 2, turns: 3, amount: -0.25,
    desc: '지점 2칸 안의 적 방어 -25% (3턴)' },
  hwagye: { name: '화계', hanja: '火計', mp: 12, kind: 'magic', range: 3, power: 260,
    desc: '불을 질러 방어를 무시하는 피해' },
  sangang: { name: '산악강타', hanja: '山岳强打', mp: 8, kind: 'power', range: 1, power: 1.5, ignoreTerrain: true,
    desc: '지형 방어를 무시하는 강타' },
  suryu: { name: '수류참', hanja: '水流斬', mp: 8, kind: 'power', range: 1, power: 1.5, waterBonus: true,
    desc: '물 위에서 더 강한 일격 (+15%)' },
  bangpae: { name: '방패벽', hanja: '防牌壁', mp: 8, kind: 'buffSelf', def: 0.5, turns: 3,
    desc: '자신의 방어 +50% (3턴)' },
  yosul: { name: '요술', hanja: '妖術', mp: 14, kind: 'debuffAtk', range: 3, radius: 1, turns: 3, amount: -0.3,
    desc: '적 1명의 공격 -30% (3턴)' },
  yeongyeok: { name: '연격', hanja: '連擊', mp: 10, kind: 'power', range: 1, power: 1.3, hits: 2,
    desc: '두 번 연속 공격 (각 130%)' },
  yaseup: { name: '야습', hanja: '夜襲', mp: 10, kind: 'power', range: 1, power: 1.6,
    desc: '숲·산지에서 기습적인 강타' },
  yuhok: { name: '유혹', hanja: '誘惑', mp: 12, kind: 'debuffAtk', range: 2, radius: 2, turns: 3, amount: -0.35,
    desc: '주변 2칸 적의 공격 -35% (3턴)' },
  pogyeok: { name: '포격', hanja: '砲擊', mp: 8, kind: 'power', range: 5, minRange: 2, power: 2.0, siegeBonus: 1.0,
    desc: '성문·성벽 위의 적에게 2배 피해' },
  tuseok: { name: '투석', hanja: '投石', mp: 8, kind: 'magicArea', range: 7, minRange: 3, radius: 1, power: 320,
    desc: '먼 지점 1칸 범위에 돌을 던진다' },
  yeonno: { name: '연노사격', hanja: '連弩射擊', mp: 10, kind: 'power', range: 5, power: 1.15, hits: 2,
    desc: '4칸 밖의 적을 두 번 연속으로 쏜다' },
  gwanse: { name: '관통사격', hanja: '貫通射擊', mp: 12, kind: 'power', range: 5, power: 1.7,
    desc: '4칸 밖에서 꿰뚫는 강력한 사격' },
  paedo: { name: '해일', hanja: '海溢', mp: 18, kind: 'magicArea', range: 3, radius: 2, power: 300,
    desc: '거대한 물결로 범위를 휩쓴다' },
  cheonmu: { name: '천무', hanja: '天武', mp: 14, kind: 'power', range: 1, power: 1.85,
    desc: '하늘을 가르는 무도의 일격' },
  hwanmu: { name: '환무', hanja: '幻舞', mp: 16, kind: 'debuffAtk', range: 2, radius: 2, turns: 3, amount: -0.4,
    desc: '현혹의 춤으로 적 공격 -40%' },
  yeonpo: { name: '연속포격', hanja: '連發砲擊', mp: 14, kind: 'power', range: 6, minRange: 2, power: 2.4, siegeBonus: 0.8,
    desc: '성문에 연달아 포탄을 퍼붓는다' },
  hwayeom: { name: '화염투석', hanja: '火焰投石', mp: 16, kind: 'magicArea', range: 7, minRange: 3, radius: 2, power: 380,
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
/* v5 — 병과 공용 SD 18종 (assets/units/job_*.webp, 2등신 치비 화풍) */
SK.JOB_UNIT = {
  jojo: 'lord', gunwoong: 'lord', bong: 'lord',
  gibyung: 'cavalry', gunggi: 'horse_archer', gunggibyung: 'horse_archer', changbyung: 'spear', bobyung: 'sword',
  sanjeok: 'bandit', sujeok: 'pirate', chaeksa: 'strategist', pungsusa: 'geomancer', dosa: 'taoist',
  gungbyung: 'archer', gungsu: 'archer', mudoga: 'martial', yasubyung: 'beast', muhui: 'dancer',
  yeonnobyung: 'crossbow', deunggabyung: 'rattan', gunakdae: 'drum', pocha: 'catapult', balseokcha: 'catapult',
};
SK.CLASS_PORTRAIT = {
  gunwoong: 'gen_bobyung', gibi: 'gen_gibyung', gunggi: 'gen_gibyung', changbyung: 'gen_changbyung',
  geombyung: 'gen_bobyung', sanjeok: 'gen_sanjeok', sujeok: 'gen_sujeok', chaeksa: 'gen_chaeksa',
  pungsusa: 'gen_chaeksa', dosa: 'gen_dosa', gungsu: 'gen_gungbyung', mudoga: 'gen_mudoga',
  yasubyung: 'gen_yasubyung', muhui: 'gen_muhui', pocha: 'gen_pocha', balseokcha: 'gen_pocha',
  yeonnobyung: 'gen_gungbyung', deunggabyung: 'gen_bobyung',
  /* v5.0.3 — 군악대 기본값을 여성 무희 초상에서 남성 악사 초상으로 바꾼다.
     (간옹·유염 같은 남성 장수가 여성 무희 그림을 받던 문제) 여성 장수만 무희 초상을 쓴다. */
  gunakdae: 'gen_gunak_m',
};
/* 여성 장수 — 이 이름들만 여성 초상(gen_muhui)을 쓴다. 남성은 절대 받지 않는다. */
SK.FEMALE_GENERALS = ['초선', '허황옥', '보연사', '견희', '대교', '소교', '신헌영', '왕원희',
  '진덕여왕', '황진이', '손노반', '손노육', '채문희', '허난설헌', '손상향', '선덕여왕',
  '축융', '포삼랑', '황월영', '관은병', '장성채', '마운록', '화만', '향랑'];
SK.isFemaleGeneral = function (g) {
  return !!(g && SK.FEMALE_GENERALS.indexOf(g.name) >= 0);
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

/* ───────────── 지역 구분 (v4.2) ─────────────
   한국 장수는 한국 세력·한국 성 주점에만, 중국(위·촉·오·군웅) 장수는 중국 세력·중국 성에만 쓴다.
   인물이 섞이면 삼국지와 삼한이 한 주점에 서는 꼴이 되므로 철저히 나눈다. */
SK.KOREAN_FACTIONS = ['goguryeo', 'baekje', 'silla'];
SK.FACTION_GROUP = {
  caocao: '위', cao_wei_pre: '위', cao_wei: '위',
  liubei: '촉', shu_han: '촉',
  sunjian: '오', sunquan: '오', sun_wu: '오',
};
SK.factionGroup = function (fid) {
  if (SK.KOREAN_FACTIONS.indexOf(fid) >= 0) return '한국';
  return SK.FACTION_GROUP[fid] || '군웅';
};
/* 인물의 지역 — generals.json의 faction(위·촉·오·군웅·한국)을 따른다 */
SK.generalGroup = function (g) {
  if (!g) return '중국';
  if (g.region) return g.region === '한국' ? '한국' : '중국';
  return g.faction === '한국' ? '한국' : '중국';
};
SK.cityGroup = function (cityId) {
  const c = SK.CITY[cityId];
  return c && c.region === '한국' ? '한국' : '중국';
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

/* ───────────── 세력 ─────────────
   시나리오마다 state.factions가 만들어진다 (data/historical_scenarios.json).
   SK.FACTIONS는 중립/미지정 세력만 담는 최소 사전. */
SK.FACTIONS = {
  neutral: { name: '재야', mark: '야', color: '#8b8677', light: '#e4e2d8', lord: '' },
  caocao: { name: '조조군', mark: '위', color: '#2f57a6', light: '#d5dff0', lord: '조조' },
  liubei: { name: '유비군', mark: '촉', color: '#2b7fc9', light: '#d6e7f5', lord: '유비' },
  sunquan: { name: '손권군', mark: '오', color: '#2f8f7d', light: '#d3e9e3', lord: '손권' },
  goguryeo: { name: '고구려', mark: '고', color: '#3a5f9a', light: '#d6e0f0', lord: '고국천왕' },
};

/* 세력 id → 한 글자 한국어 표식 (깃발·배지에 쓴다, 없으면 이름 첫 글자) */
SK.FACTION_MARK = {
  dongzhuo: '동', yuanshao: '원', caocao: '위', liubei: '촉', sunjian: '손', yuanshu: '술',
  liubiao: '표', liuyan: '언', mateng: '마', gongsunzan: '공', taoqian: '도', hansui: '한',
  goguryeo: '고', baekje: '백', silla: '신', sunquan: '오', liuzhang: '장', zhanglu: '로',
  gongsunkang: '강', cao_wei_pre: '위', liuzong: '종', shu_han: '촉', sun_wu: '오',
  shi_xie: '사', meng_huo: '맹', neutral: '야',
  kongrong: '융', liuyao: '유', yanbaihu: '엄', wanglang: '왕', zhanglu: '로',
};

/* 세력 표식 — 한 글자 한국어 (data에 mark가 없으면 이름 첫 글자) */
SK.markOf = function (f) {
  if (!f) return '야';
  if (f.mark) return f.mark;
  if (f.id && SK.FACTION_MARK[f.id]) return SK.FACTION_MARK[f.id];
  return String(f.name || '재야').replace(/군$/, '').charAt(0) || '야';
};

/* 세력 색 — 지도·UI에서 한눈에 갈리도록 고대비로 고정한다 (v4.2)
   위=군청 · 촉=에메랄드 · 오=크림슨 · 여포=보라먹 · 원소=금 · 동탁=숯회색
   고구려=인디고 · 백제=틸 · 신라=주황, 나머지 군웅은 서로 겹치지 않는 밝은 색 */
SK.FACTION_COLOR = {
  /* v5.0.3 — 190년 지도에서 길·근접으로 맞닿는 세력끼리 색 거리(ΔE) 49 이상이 되도록 다시 배치했다.
     (유비군 녹색 ↔ 도겸군 연두색이 거의 같아 보이던 문제) 조조·유비·손견·동탁·원소는 상징색 유지. */
  caocao: '#1D4ED8', cao_wei_pre: '#1D4ED8', cao_wei: '#1D4ED8',
  liubei: '#15803D', shu_han: '#15803D',
  sunjian: '#DC2626', sunquan: '#DC2626', sun_wu: '#B91C1C',
  lubu: '#7E22CE', lvbu: '#7E22CE',
  yuanshao: '#CA8A04', dongzhuo: '#374151',
  goguryeo: '#6D28D9', baekje: '#7E1D3E', silla: '#0B7285',
  yuanshu: '#DB2777', liubiao: '#0E7490', liuzong: '#9333EA', liuyan: '#7E22CE',
  liuzhang: '#92400E', mateng: '#B45309', hansui: '#3F6212', gongsunzan: '#9F1239',
  taoqian: '#7C2D12', zhanglu: '#BE185D', gongsunkang: '#78350F', shi_xie: '#A16207',
  meng_huo: '#4D7C0F', neutral: '#8B8777',
  kongrong: '#475569', liuyao: '#0891B2', yanbaihu: '#1E40AF', wanglang: '#4D7C0F',
};

SK.factionInfo = function (key) {
  const st = SK.state;
  if (st && st.factions && st.factions[key]) return st.factions[key];
  return SK.FACTIONS[key] || SK.FACTIONS.neutral;
};
SK.factionColor = function (key) { return SK.factionInfo(key).color || '#8b8677'; };
SK.factionName = function (key) { return SK.factionInfo(key).name || '재야'; };
SK.playerFaction = function () { return (SK.state && SK.state.playerFaction) || 'neutral'; };

/* ───────────── 거점 이름 별칭 (사서 이름 → 게임 거점) ───────────── */
SK.CITY_ALIAS = {
  '낙양': 'luoyang', '장안': 'changan', '홍농': 'hangu', '미오': 'changan', '호로관': 'huluguan',
  '발해': 'nanpi', '업': 'ye', '남피': 'nanpi', '감릉': 'pingyuan',
  '진류': 'chenliu', '동군': 'puyang', '진국': 'runan', '영천': 'xuchang',
  '고당': 'pingyuan', '평원': 'pingyuan', '복양': 'puyang',
  '장사': 'changsha', '무릉': 'wuling', '영릉': 'lingling', '계양': 'guiyang',
  '완': 'wan', '남양': 'wan', '수춘': 'shouchun', '구강': 'shouchun',
  '양양': 'xiangyang', '강릉': 'jiangling', '강하': 'jiangxia', '남군': 'jiangling',
  '성도': 'chengdu', '광한': 'zitong', '파군': 'yongan', '건위': 'jianning',
  '한중': 'hanzhong', '남정': 'hanzhong', '양평관': 'yangping',
  '무위': 'wuwei', '서량': 'wuwei', '서량군': 'wuwei', '금성': 'tianshui', '천수': 'tianshui',
  '안정': 'anding', '서평': 'anding', '삭방': 'shuofang',
  '북평': 'beiping', '요서': 'beiping', '계': 'ji', '역경': 'ji',
  '하비': 'xiapi', '팽성': 'xiaopei', '낭야': 'langya', '광릉': 'guangling', '초': 'xiaopei',
  '소패': 'xiaopei', '해릉 요새': 'hailing',
  '국내성': 'guknaeseong', '환도성': 'guknaeseong', '졸본': 'ansiseong',
  '압록강 유역': 'hamhung', '동옥저': 'hamhung', '함흥': 'hamhung',
  '위례성': 'hanseong', '한성': 'hanseong', '미추홀': 'hanseong',
  '마한 북부': 'wansan', '한강 유역': 'wonju', '웅진': 'ungjin',
  '서라벌': 'gyeongju', '금성': 'gyeongju', '경주': 'gyeongju',
  '동해안': 'daegwallyeong', '낙동강 동부': 'busan',
  '허창': 'xuchang', '관도': 'puyang', '여남': 'runan', '신야': 'xinye',
  '건업': 'jianye', '오군': 'wu', '회계': 'kuaiji', '단양': 'shishang',
  '여강': 'hefei', '합비': 'hefei', '예장': 'jianan', '파양': 'changsha', '시상': 'shishang',
  '자동': 'zitong', '강주': 'gangju', '하구': 'jiangxia', '당양': 'jiangling',
  '장판': 'xinye', '무창': 'jiangxia', '영안': 'yongan',
  '양평': 'liaodong', '요동': 'liaodong', '현도': 'ansiseong', '낙랑': 'pyongyang',
  '교지': 'nanhai', '구진': 'nanhai', '일남': 'nanhai', '합포': 'nanhai',
  '월수': 'yunnan', '영창': 'yongchang', '운남': 'yunnan', '건녕': 'jianning',
  '상당': 'shangdang', '호관': 'hoguan', '진양': 'jinyang', '대': 'dai',
  '남해': 'nanhai', '건안': 'jianan', '대만': 'taipei', '탐라': 'tamna',
};

/* 세력별로 뜻이 갈리는 지명 (서량의 金城 ↔ 신라의 金城) */
SK.ALIAS_BY_FACTION = {
  hansui: { '금성': 'tianshui', '서평': 'anding', '무위': 'wuwei' },
  mateng: { '금성': 'tianshui', '서량': 'wuwei' },
};

SK.cityIdByName = function (name) {
  if (!name) return null;
  const s = String(name).trim();
  if (SK.CITY_ALIAS[s] && SK.CITY[SK.CITY_ALIAS[s]]) return SK.CITY_ALIAS[s];
  const hit = SK.CITY_LIST.find((c) => c.name === s);
  return hit ? hit.id : null;
};

/* ───────────── 499장수 밖 인물 (시나리오 데이터의 누락 인명) ──────── */
/* region: '한국' 인 인물만 한국 성·세력에 배치된다 */
SK.KOREAN_EXTRA = ['초고왕', '구수왕', '벌휴이사금', '내해이사금', '산상왕', '구수', '내해', '명림어수', '석우로', '사반왕'];
SK.EXTRA_GENERALS = {
  '유언': { job: '군주', tier: 'A', war: 40, intel: 66, lead: 58 },
  '초고왕': { job: '군주', tier: 'A', war: 72, intel: 70, lead: 74 },
  '구수왕': { job: '군주', tier: 'B', war: 61, intel: 64, lead: 66 },
  '벌휴이사금': { job: '군주', tier: 'A', war: 64, intel: 72, lead: 73 },
  '내해이사금': { job: '군주', tier: 'B', war: 60, intel: 66, lead: 64 },
  '산상왕': { job: '군주', tier: 'A', war: 73, intel: 68, lead: 70 },
  '공손강': { job: '군주', tier: 'B', war: 58, intel: 62, lead: 60 },
  '무안국': { job: '창병', tier: 'B', war: 74, intel: 56, lead: 66 },
  '왕수': { job: '검병', tier: 'C', war: 62, intel: 50, lead: 58 },
  '엄여': { job: '수적', tier: 'B', war: 72, intel: 46, lead: 62 },
  '장영': { job: '창병', tier: 'B', war: 68, intel: 52, lead: 60 },
  '번능': { job: '궁수', tier: 'B', war: 66, intel: 50, lead: 58 },
  '착융': { job: '산적', tier: 'B', war: 70, intel: 48, lead: 60 },
  '양임': { job: '창병', tier: 'B', war: 70, intel: 58, lead: 64 },
  '장위': { job: '검병', tier: 'B', war: 67, intel: 54, lead: 60 },
  '공손도': { job: '군주', tier: 'B', war: 62, intel: 70, lead: 66 },
  '공손공': { job: '기병', tier: 'B', war: 66, intel: 54, lead: 58 },
  '남중 호족': { job: '군주', tier: 'B', war: 55, intel: 52, lead: 58 },
  '구수': { job: '군주', tier: 'A', war: 58, intel: 76, lead: 70 },
  '내해': { job: '창병', tier: 'B', war: 66, intel: 60, lead: 62 },
  '마휴': { job: '기병', tier: 'B', war: 71, intel: 52, lead: 63 },
  '마철': { job: '기병', tier: 'B', war: 68, intel: 48, lead: 60 },
  '양홍': { job: '검병', tier: 'B', war: 63, intel: 55, lead: 62 },
  '염상': { job: '검병', tier: 'B', war: 60, intel: 52, lead: 58 },
  '주포': { job: '기병', tier: 'B', war: 74, intel: 46, lead: 61 },
  '전해': { job: '창병', tier: 'B', war: 65, intel: 50, lead: 59 },
  '선우보': { job: '궁기', tier: 'B', war: 67, intel: 54, lead: 60 },
  '엄강': { job: '창병', tier: 'B', war: 70, intel: 56, lead: 62 },
  '국의': { job: '책사', tier: 'B', war: 30, intel: 74, lead: 58 },
  '명림어수': { job: '책사', tier: 'A', war: 40, intel: 82, lead: 70 },
  '석우로': { job: '창병', tier: 'A', war: 82, intel: 66, lead: 74 },
  '사반왕': { job: '군주', tier: 'B', war: 45, intel: 58, lead: 55 },
  '번민': { job: '검병', tier: 'B', war: 64, intel: 58, lead: 60 },
  '이감': { job: '기병', tier: 'B', war: 68, intel: 50, lead: 57 },
  '염행': { job: '궁수', tier: 'B', war: 62, intel: 54, lead: 56 },
  '양추': { job: '검병', tier: 'B', war: 60, intel: 52, lead: 55 },
  '양송': { job: '군주', tier: 'B', war: 48, intel: 62, lead: 58 },
  '양백': { job: '창병', tier: 'B', war: 63, intel: 50, lead: 56 },
  '성의': { job: '검병', tier: 'B', war: 61, intel: 55, lead: 57 },
  '옹개': { job: '창병', tier: 'B', war: 66, intel: 48, lead: 58 },
  '왕위': { job: '군주', tier: 'B', war: 52, intel: 60, lead: 57 },
  '사일': { job: '궁수', tier: 'B', war: 60, intel: 56, lead: 55 },
  '사흠': { job: '창병', tier: 'B', war: 58, intel: 58, lead: 56 },
  '염포': { job: '검병', tier: 'B', war: 57, intel: 54, lead: 55 },
  '고람': { job: '기병', tier: 'B', war: 62, intel: 50, lead: 56 },
  '고정': { job: '창병', tier: 'B', war: 60, intel: 52, lead: 54 },
};

/* 한자 인명 → 한국어 표기 */
SK.NAME_ALIAS = {
  '于禁': '우금', '典韋': '전위', '徐晃': '서황', '許褚': '허저', '曹真': '조진', '조仁': '조인',
};

SK.BOSS_PORTRAITS = {};   // 세력 우두머리 초상화는 factionInfo().lord 로 찾는다


/* v5.0.1 — 세력별 초기 식구. enrichFactions가 이 목록 밖의 장수를 끌어오지 않는다.
   (190년 유비 평원에 황충·이엄·엄안·곽준이 따라오던 문제) */
SK.EARLY_RETAINERS = {
  dongzhuo: ['동탁', '여포', '이유', '화웅', '번조', '이각', '곽사', '장제', '서영', '가후'],
  yuanshao: ['원소', '저수', '전풍', '안량', '문추', '국의', '심배', '봉기', '곽도', '장합', '원담', '원희', '원상'],
  caocao: ['조조', '하후돈', '하후연', '조인', '조홍', '악진', '이전', '순욱', '순유', '전위', '정욱', '유엽', '하후상', '조순'],
  liubei: ['유비', '관우', '장비', '간옹', '손건', '미축', '미방', '유염', '진도'],
  sunjian: ['손견', '손책', '정보', '황개', '한당', '조무', '주치', '주유', '손권'],
  yuanshu: ['원술', '기령', '양홍', '장훈', '뇌박', '진란', '교유'],
  liubiao: ['유표', '괴량', '괴월', '채모', '황조', '문빙', '유종', '황충', '장윤'],
  liuyan: ['유언', '장로', '장수', '번민', '장임', '엄안', '황권', '법정', '이엄', '곽준', '맹달', '오의', '오란'],
  mateng: ['마등', '마초', '방덕', '마휴', '마철', '한수', '성의', '마대'],
  gongsunzan: ['공손찬', '조운', '엄강', '선우보', '전해', '공손속'],
  taoqian: ['도겸', '미축', '미방', '진규', '조표'],
  hansui: ['한수', '염행', '양추', '이감'],
  kongrong: ['공융', '왕수', '무안국'],
  liuyao: ['유요', '태사자', '우번'],
  yanbaihu: ['엄백호', '엄여'],
  wanglang: ['왕랑', '우번'],
  zhanglu: ['장로', '양송', '염포', '양백', '양임', '장위'],
  goguryeo: ['고국천왕', '을파소', '을지문덕', '연개소문', '동천왕', '광개토대왕'],
  baekje: ['초고왕', '구수', '사반왕', '구수왕', '근초고왕'],
  silla: ['벌휴이사금', '내해', '내해이사금', '석우로', '김유신'],
  cao_wei_pre: ['조조', '조인', '조홍', '하후돈', '하후연', '장료', '장합', '서황', '악진', '우금', '허저', '전위', '조진', '조휴', '사마의', '곽가', '순욱', '순유', '정욱', '가후', '진군', '종요', '하후상', '조비'],
  cao_wei: ['조비', '조진', '조휴', '조인', '하후상', '장료', '장합', '서황', '악진', '문빙', '사마의', '진군', '종요', '가후', '하후돈', '하후연'],
  shu_han: ['유비', '관우', '장비', '조운', '제갈량', '황충', '위연', '마초', '마량', '법정', '장완', '비의', '관평', '장포', '손건', '간옹', '미축'],
  sunquan: ['손권', '주유', '노숙', '여몽', '육손', '정보', '황개', '한당', '감녕', '능통', '주태', '서성', '정봉', '장소', '태사자', '장흠', '장굉', '능조', '제갈근'],
  sun_wu: ['손권', '주유', '노숙', '여몽', '육손', '정보', '황개', '한당', '감녕', '능통', '주태', '서성', '정봉', '장소', '제갈근'],
  liuzong: ['유종', '채모', '괴월', '괴량', '문빙'],
  liuzhang: ['유장', '장임', '엄안', '황권', '법정', '맹달', '오의', '오란', '이엄'],
  gongsunkang: ['공손강', '공손도', '공손공'],
  shi_xie: ['사섭', '사흠', '사휘', '사일'],
  meng_huo: ['남중 호족', '옹개', '고정', '주포'],
};

/* ───────────── 시나리오 (data/historical_scenarios.json) ───────────── */
SK.HIST = [];
SK.setHistorical = function (list) {
  SK.HIST = (list || []).filter((s) => s && s.factions && s.factions.length).slice().sort((a, b) => a.year - b.year);
  SK.SCENARIOS = SK.HIST;
};
SK.histById = function (id) { return SK.HIST.find((s) => Number(s.id) === Number(id)) || null; };


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
        const area = /범위|주변|전군/.test(eff);
        def.kind = area ? 'healArea' : 'heal';
        def.healPct = area ? 0.13 : 0.16;
        if (area) def.radius = 2;
        def.range = Math.max(2, rng.max);
      } else if (/아군/.test(eff) && /(공격|사기|방어|진형)/.test(eff)) {
        def.kind = 'buffAreaAllies'; def.radius = 2; def.atk = 0.2; def.turns = 3;
      } else if (/적/.test(eff) && /(방어|사기|공격|혼란|매혹)/.test(eff) && !/피해/.test(eff)) {
        def.kind = /방어/.test(eff) ? 'debuffDef' : 'debuffAtk';
        def.radius = 2; def.amount = -0.25; def.turns = 3;
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

/* 사서 인명 → 게임 인명 */
SK.normName = function (n) { return SK.NAME_ALIAS[n] || n; };

/* 시나리오 하나를 실제 영지 배치로 푼다.
   · faction.cities 이름을 77거점으로 별칭 변환
   · 여러 세력이 같은 거점을 주장하면 "자기 영지 중심"이 가까운 세력이 가져간다
   · 아무도 주장하지 않은 거점은 가장 가까운 세력(300px 이내), 그 밖은 재야 */
/* 변방·요새·섬 — 시나리오가 비워 두는 공백지(재야) 후보.
   처음부터 전국이 다 나뉘어 있으면 확장할 맛이 없으므로, 변두리 거점은 산적·호족이
   지키는 재야로 남긴다. (수도이거나 그 세력의 마지막 성이면 그대로 둔다) */
SK.NEUTRAL_KEEP = ['tamna', 'taipei', 'tainan', 'nanhai', 'yunnan', 'yongchang', 'lushui',
  'shuofang', 'dai', 'hailing', 'shanhaiguan', 'daegwallyeong', 'cheolwon'];

/* v5 — 인물 등장 연도 (data/generals.json의 debutYear).
   아직 성인이 되지 않은 명장은 시나리오 시작과 매년 1월에 걸러진다. */
SK.debutOk = function (g, year) {
  if (!g) return false;
  const d = Number(g.debutYear);
  if (!d) return true;
  return d <= Number(year || 0);
};
SK.hiddenByDebut = function (year) {
  const out = [];
  SK.GENERALS.forEach((g) => { if (g.debutYear && Number(g.debutYear) === Number(year)) out.push(g); });
  return out;
};

SK.resolveScenario = function (sc) {
  if (!sc || !sc.factions || !SK.CITY_LIST.length) return null;
  const facs = {};
  const claims = {};
  sc.factions.forEach((f) => {
    const ids = [];
    const own = SK.ALIAS_BY_FACTION[f.id] || {};
    (f.cities || []).forEach((nm) => {
      const id = own[nm] || SK.cityIdByName(nm);
      if (!id) return;
      if (ids.indexOf(id) < 0) ids.push(id);
      (claims[id] = claims[id] || []).push(f.id);
    });
    const capId = own[f.capital] || SK.cityIdByName(f.capital) || ids[0] || null;
    if (capId && ids.indexOf(capId) < 0) {
      ids.unshift(capId);
      (claims[capId] = claims[capId] || []).push(f.id);
    }
    facs[f.id] = {
      id: f.id,
      name: f.name,
      lord: SK.normName(f.leader),
      mark: SK.FACTION_MARK[f.id] || String(f.name || '재야').replace(/군$/, '').charAt(0),
      color: SK.FACTION_COLOR[f.id] || f.color || '#8b8677',
      allies: f.allies || [],
      enemies: f.enemies || [],
      generals: (f.generals || []).map(SK.normName).filter(Boolean),
      listed: ids,
      capital: capId,
      cities: [],
    };
  });
  const facIds = Object.keys(facs);
  facIds.forEach((k) => {
    const cs = facs[k].listed.map((id) => SK.CITY[id]).filter(Boolean);
    const n = Math.max(1, cs.length);
    facs[k].cx = cs.reduce((a, c) => a + c.u * 2000, 0) / n;
    facs[k].cy = cs.reduce((a, c) => a + c.v * 1333, 0) / n;
  });

  const owner = {};
  SK.CITY_LIST.forEach((c) => {
    const list = claims[c.id];
    if (!list || !list.length) return;
    if (list.length === 1) { owner[c.id] = list[0]; return; }
    const x = c.u * 2000, y = c.v * 1333;
    let best = list[0], bd = Infinity;
    list.forEach((fid) => {
      const f = facs[fid];
      const d = Math.hypot(x - f.cx, y - f.cy);
      if (d < bd) { bd = d; best = fid; }
    });
    owner[c.id] = best;
  });
  // v5 — 주장하지 않은 거점은 탐욕적으로 가장 가까운 세력에 붙이지 않는다.
  //       변방·남중·대만처럼 아무도 차지하지 않은 곳은 재야(공백지)로 남겨 확장의 맛을 살린다.
  SK.CITY_LIST.forEach((c) => {
    if (owner[c.id]) return;
    owner[c.id] = 'neutral';
  });
  // 각 세력의 수도는 반드시 그 세력의 것이 되도록 확정한다
  facIds.forEach((fid) => {
    const cap = facs[fid].capital;
    if (!cap) return;
    owner[cap] = fid;
  });
  // v4.2 — 변방·섬은 재야의 공백지로 남긴다
  SK.NEUTRAL_KEEP.forEach((id) => {
    if (!SK.CITY[id]) return;
    const fid = owner[id];
    if (!fid || fid === 'neutral') return;
    const f = facs[fid];
    if (!f || f.capital === id) return;
    const owned = SK.CITY_LIST.filter((c) => owner[c.id] === fid).length;
    if (owned <= 3) return;            // 마지막 성들을 빼앗지는 않는다
    owner[id] = 'neutral';
  });
  if (!facs.neutral) {
    facs.neutral = { id: 'neutral', name: '재야', lord: '', hanja: '在', color: '#8b8677',
      allies: [], enemies: [], generals: [], listed: [], capital: null, cities: [], cx: 0, cy: 0 };
  }
  SK.CITY_LIST.forEach((c) => {
    const f = facs[owner[c.id]];
    if (f) f.cities.push(c.id);
  });
  return { factions: facs, owner };
};

SK.applyScenario = function (cities, sc) {
  const res = SK.resolveScenario(sc);
  if (!res) return null;
  SK._lastResolved = res;
  SK.CITY_LIST.forEach((c) => { if (cities[c.id]) cities[c.id].owner = res.owner[c.id] || 'neutral'; });
  return res;
};

/* 시나리오 연표 — (연, 월) 일치 이벤트 */
SK.timelineFor = function (sc, year, month) {
  if (!sc || !sc.timelineEvents) return null;
  return sc.timelineEvents.find((e) => Number(e.year) === Number(year) && Number(e.month) === Number(month)) || null;
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
  const key = String(u || 'sword');
  if (key.indexOf('/') >= 0) return key;                       // 전용 SD(상위 100명) 경로
  let job = SK.JOB_UNIT[key];
  if (!job && SK.CLASS_UNIT[key]) job = SK.JOB_UNIT[SK.CLASS_UNIT[key]];
  if (!job) job = SK.CLASSES[key] ? (SK.JOB_UNIT[SK.CLASS_UNIT[key]] || 'sword') : 'sword';
  return `assets/units/job_${job}.webp`;                        // v5 — 병과 공용 18종
};
/* 병과 → 공용 SD 파일 키 (없으면 검병) */
SK.classUnitFile = function (cls) {
  const job = SK.JOB_UNIT[cls] || 'sword';
  return `assets/units/job_${job}.webp`;
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
  SK.registerExtras();
  SK.GENERALS.forEach((g) => { g.hanja = ''; });
  SK.rebalanceTiers();
};

/* v4.1 — 등급을 능력치 피라미드로 다시 세운다 (S 5% · A 15% · B 35% · C 45%)
   원본 데이터는 A급이 49%, C급이 0%여서 주점에 고급 인재만 넘치고 있었다.
   능력치 순위로 다시 나누면 이름난 장수는 그대로 S·A로 남고, 이름 없는 장수는 B·C로 내려간다. */
SK.TIER_MIX = [{ t: 'S', to: 0.05 }, { t: 'A', to: 0.20 }, { t: 'B', to: 0.55 }, { t: 'C', to: 1.0 }];
SK.genScore = function (g) {
  return (g.leadership || 0) * 0.4 + (g.war || 0) * 0.3 + (g.intel || 0) * 0.3;
};
SK.rebalanceTiers = function () {
  const list = SK.GENERALS.slice().sort((a, b) => SK.genScore(b) - SK.genScore(a) || String(a.name).localeCompare(String(b.name)));
  const n = list.length;
  if (!n) return;
  list.forEach((g, i) => {
    const p = (i + 0.5) / n;
    g.tier = (SK.TIER_MIX.find((m) => p <= m.to) || SK.TIER_MIX[SK.TIER_MIX.length - 1]).t;
  });
  SK.TIER_COUNT = SK.GENERALS.reduce((a, g) => { a[g.tier] = (a[g.tier] || 0) + 1; return a; }, {});
};

/* 시나리오 데이터에만 있는 인물을 장수 목록에 더한다 */
SK.registerExtras = function () {
  const base = 90000;
  Object.keys(SK.EXTRA_GENERALS || {}).forEach((name, i) => {
    if (SK.GEN_BY_NAME[name]) return;
    const e = SK.EXTRA_GENERALS[name];
    const g = {
      id: base + i, name, faction: '재야', tier: e.tier || 'B', job: e.job || '검병',
      leadership: e.lead, war: e.war, intel: e.intel,
      politics: Math.round((e.war + e.intel + e.lead) / 3), charm: 62, skill: e.skill || '',
      region: SK.KOREAN_EXTRA.indexOf(name) >= 0 ? '한국' : '중국',
    };
    SK.GENERALS.push(g);
    SK.GEN_BY_ID[g.id] = g;
    SK.GEN_BY_NAME[g.name] = g;
  });
};
SK.genClass = function (g) { return (g && SK.JOB_CLASS[g.job]) || 'geombyung'; };
SK.genLv = function (g) { return (g && SK.TIER_LV[g.tier]) || 3; };
SK.genPortrait = function (g) {
  const art = SK.artPortrait(g && g.name);
  if (art) return art;
  const core = Object.values(SK.HEROES).find((h) => h.name === g.name);
  if (core) return core.pt;
  const cls = SK.genClass(g);
  /* 여성 초상은 여성 장수에게만 — 남성 군악대·무희가 여성 그림을 받지 않게 한다 */
  if (cls === 'gunakdae' || cls === 'muhui') return SK.isFemaleGeneral(g) ? 'gen_muhui' : 'gen_gunak_m';
  return SK.CLASS_PORTRAIT[cls] || 'gen_bobyung';
};
SK.genUnit = function (g) {
  const art = SK.artUnit(g && g.name);
  if (art) return art;
  const core = Object.values(SK.HEROES).find((h) => h.name === g.name);
  // v5 — 병과 공용 18종 SD로 통일한다 (옛 전용 키는 병과 그림으로 대신한다)
  if (core && core.unit && SK.JOB_UNIT[core.unit]) return core.unit;
  return SK.CLASS_UNIT[SK.genClass(g)];
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
SK.JFAC = { '위': 'caocao', '촉': 'liubei', '오': 'sunquan', '군웅': 'neutral', '한국': 'goguryeo' };
SK.TYPE_KEY = { '대도시': 'capital', '소도시': 'town', '관문': 'pass', '요새': 'fortress' };

SK.setCities = function (list) {
  Object.keys(SK.CITY).forEach((k) => delete SK.CITY[k]);
  SK.CITY_LIST = [];
  (list || []).forEach((d) => {
    const geo = SK.CITY_GEO[d.name];
    if (!geo) return;
    const [id, hanja, u, v, region] = geo;
    SK.CITY[id] = {
      id, name: d.name, hanja: '', u, v, region,
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

/* v5 — 육로로 이어서는 안 되는 짝 (바다를 건너는 길)
   산해관과 북해·안시성 사이는 바다다. 육로는 산해관 → 요동 → 안시성으로 돌아간다.
   섬(탐라·대만)은 배로만 오가고, 대만 안의 타이베이↔타이난만 육로다. */
SK.SEA_ONLY_PAIRS = [['shanhaiguan', 'beihai'], ['shanhaiguan', 'ansiseong'],
  ['liaodong', 'pyongyang'],
  /* v5.0.1 — 지도에서 겹치던 관통 직통선을 없앤다 (장사→남해·강주, 무위→한중) */
  ['changsha', 'nanhai'], ['changsha', 'gangju'], ['wuwei', 'hanzhong']];
/* 섬 — 육로는 섬 안에서만 난다. 바깥으로는 배(SEALANES)로만 오간다. */
SK.ISLAND_GROUP = { tamna: '제주', taipei: '대만', tainan: '대만' };
/* 반드시 있어야 하는 육로 — 끊기면 남중·서량·강동이 고립된다 */
SK.MUST_ROADS = [['hanzhong', 'yangping'], ['hanzhong', 'changan'], ['changan', 'anding'],
  ['yongan', 'jiangling'], ['jiangxia', 'hefei'], ['jiangxia', 'runan'], ['jianye', 'jianan'],
  ['shishang', 'jianan'], ['shanhaiguan', 'liaodong'], ['liaodong', 'ansiseong'],
  ['taipei', 'tainan'], ['xinye', 'xiangyang'], ['shangyong', 'hanzhong'], ['wuling', 'changsha'],
  ['nanhai', 'guiyang'], ['nanhai', 'gangju'], ['gangju', 'guiyang'],
  ['jianning', 'yunnan'], ['wuwei', 'tianshui'], ['lushui', 'chengdu'], ['lushui', 'jianning']];

/* v5.0.3 — 77거점 역참로를 손으로 고정한다.
   거리만 보는 자동 최소신장트리는 호로관↔낙양·업↔남피 같은 뻔한 길을 놓치고,
   삭방↔함곡관·산해관↔남피처럼 바다를 가로지르거나 지도를 관통하는 선을 만들었다.
   순서: 서량 → 관중 → 하북·병주·유주 → 중원 → 서주·회남 → 형주 → 익주·남만 → 강동 → 요동·한국 */
SK.ROAD_EDGES = [
  /* 서량 — 하서회랑과 농서 */
  ['wuwei', 'tianshui'], ['wuwei', 'anding'], ['tianshui', 'anding'], ['tianshui', 'yangping'],
  ['anding', 'changan'], ['anding', 'shuofang'], ['shuofang', 'dai'],
  /* 관중 — 장안·동관·함곡관·낙양 */
  ['changan', 'dongguan'], ['dongguan', 'hangu'], ['hangu', 'luoyang'],
  ['changan', 'hanzhong'], ['luoyang', 'wan'], ['luoyang', 'huluguan'],
  /* 하북·병주 — 태행산맥 양쪽과 하북 평야 */
  ['jinyang', 'dai'], ['jinyang', 'shangdang'], ['jinyang', 'ye'],
  ['shangdang', 'hoguan'], ['hoguan', 'ye'], ['shangdang', 'luoyang'],
  ['ye', 'nanpi'], ['ye', 'puyang'], ['nanpi', 'ji'], ['nanpi', 'pingyuan'],
  ['ji', 'beiping'], ['ji', 'dai'], ['beiping', 'shanhaiguan'], ['shanhaiguan', 'liaodong'],
  /* 청주·서주 */
  ['pingyuan', 'puyang'], ['pingyuan', 'beihai'], ['beihai', 'langya'],
  ['langya', 'xiapi'], ['xiapi', 'xiaopei'], ['xiapi', 'guangling'], ['guangling', 'hailing'],
  ['xiaopei', 'chenliu'], ['xiaopei', 'shouchun'],
  /* 중원 — 진류·허창·여남·복양 */
  ['puyang', 'chenliu'], ['chenliu', 'xuchang'], ['chenliu', 'huluguan'],
  ['huluguan', 'xuchang'], ['xuchang', 'wan'], ['xuchang', 'runan'],
  ['wan', 'xinye'], ['runan', 'shouchun'], ['shouchun', 'hefei'],
  /* 형주 */
  ['xinye', 'xiangyang'], ['xiangyang', 'jiangling'], ['xiangyang', 'jiangxia'],
  ['xiangyang', 'shangyong'], ['jiangling', 'jiangxia'], ['jiangling', 'wuling'],
  ['jiangling', 'changsha'], ['wuling', 'changsha'], ['changsha', 'lingling'],
  ['lingling', 'guiyang'], ['changsha', 'guiyang'], ['guiyang', 'nanhai'],
  ['nanhai', 'gangju'], ['gangju', 'guiyang'], ['jiangxia', 'changsha'],
  /* 익주·남만 */
  ['hanzhong', 'yangping'], ['yangping', 'jiange'], ['jiange', 'zhidong'],
  ['zhidong', 'chengdu'], ['chengdu', 'yongan'], ['chengdu', 'lushui'],
  ['yongan', 'jiangling'], ['lushui', 'jianning'], ['jianning', 'yunnan'],
  ['jianning', 'yongchang'], ['yunnan', 'yongchang'],
  /* 강동 */
  ['hefei', 'jianye'], ['hefei', 'jiangxia'], ['runan', 'jiangxia'],
  ['jianye', 'wu'], ['jianye', 'jianan'], ['wu', 'shishang'], ['shishang', 'kuaiji'],
  ['shishang', 'jianan'], ['kuaiji', 'jianan'], ['nanhai', 'jianan'],
  /* 요동·한국 */
  ['liaodong', 'ansiseong'], ['ansiseong', 'guknaeseong'], ['guknaeseong', 'hamhung'],
  ['hamhung', 'pyongyang'], ['pyongyang', 'gaeseong'], ['gaeseong', 'cheolwon'],
  ['gaeseong', 'hanseong'], ['cheolwon', 'wonju'], ['hanseong', 'wonju'],
  ['hanseong', 'ungjin'], ['hanseong', 'gwangju'], ['wonju', 'cheongju'],
  ['wonju', 'daegwallyeong'], ['daegwallyeong', 'gyeongju'], ['cheongju', 'ungjin'],
  ['cheongju', 'wansan'], ['ungjin', 'wansan'], ['ungjin', 'gwangju'], ['wansan', 'gwangju'],
  ['gyeongju', 'busan'],
  /* 섬 — 같은 섬 안에서만 */
  ['taipei', 'tainan'],
];

SK.ROAD_VIA = {
  'shanhaiguan|liaodong': [[1312.5, 227.6], [1332.5, 227.6], [1353.1, 218.8], [1374.4, 201.3], [1403.8, 191.9], [1441.2, 190.7], [1477.5, 181.9], [1512.5, 165.7]],
  'gaeseong|hanseong': [[1665.0, 338.9], [1715.0, 356.4]],
  'hanseong|ungjin': [[1731.2, 382.6], [1713.8, 417.7]],
  'ungjin|gwangju': [[1706.2, 457.7], [1708.8, 502.7]],
};

SK.buildRoads = function () {
  const pts = SK.CITY_LIST;
  if (!pts.length) return;
  SK.ROADS.length = 0;
  pts.forEach((c) => { c.roads = []; c.sea = []; });
  SK.SEALANES.length = 0;
  const dist = (a, b) => Math.hypot((a.u - b.u) * 2000, (a.v - b.v) * 1333);
  const banned = new Set(SK.SEA_ONLY_PAIRS.map(([a, b]) => (a < b ? a + '|' + b : b + '|' + a)));
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  function landOk(idA, idB) {
    const ga = SK.ISLAND_GROUP[idA], gb = SK.ISLAND_GROUP[idB];
    if (ga || gb) return !!ga && ga === gb;      // 섬은 같은 섬끼리만 육로
    return true;
  }
  const edges = new Set();
  const add = (a, b) => {
    if (!a || !b || a === b) return false;
    const k = pairKey(a.id, b.id);
    if (banned.has(k) || edges.has(k)) return false;
    if (!landOk(a.id, b.id)) return false;
    edges.add(k);
    a.roads.push(b.id); b.roads.push(a.id);
    SK.ROADS.push([a.id, b.id]);
    return true;
  };
  // 1) 손으로 고정한 역참로 — 77거점의 실제 지리를 따른다
  SK.ROAD_EDGES.forEach(([a, b]) => {
    if (SK.CITY[a] && SK.CITY[b]) add(SK.CITY[a], SK.CITY[b]);
  });
  // 2) 반드시 있어야 할 길 (안전망 — 목록에서 빠져도 여기서 살아난다)
  SK.MUST_ROADS.forEach(([a, b]) => {
    if (SK.CITY[a] && SK.CITY[b]) add(SK.CITY[a], SK.CITY[b]);
  });
  // 3) 목록에 없는 새 거점이 생기면 가장 가까운 이웃과 잇는다 (앞으로 거점을 늘릴 때 대비)
  pts.forEach((a) => {
    if (a.roads.length) return;
    const near = pts.filter((b) => b !== a && !banned.has(pairKey(a.id, b.id)) && landOk(a.id, b.id))
      .sort((x, y) => dist(a, x) - dist(a, y));
    near.slice(0, 2).forEach((b) => add(a, b));
  });
  // 4) 막다른 길 보수 — 육로도 해로도 없이 홀로 남은 거점만 잇는다
  pts.forEach((a) => {
    if (a.roads.length + a.sea.length) return;
    const cand = pts.filter((b) => b !== a && !a.roads.includes(b.id) && !banned.has(pairKey(a.id, b.id)) && landOk(a.id, b.id))
      .sort((x, y) => dist(a, x) - dist(a, y));
    if (cand.length) add(a, cand[0]);
  });
  // 5) 해로 — 배로만 건너는 길은 모두 여기에 둔다 (탐라·대만·발해·황해·남해)
  const sea = [['tamna', 'busan'], ['tamna', 'hailing'], ['tamna', 'jianye'],
    ['taipei', 'jianan'], ['tainan', 'nanhai'], ['jianye', 'guangling'],
    ['liaodong', 'pyongyang'], ['beihai', 'liaodong'], ['shanhaiguan', 'beihai']];
  sea.forEach(([a, b]) => {
    if (!SK.CITY[a] || !SK.CITY[b]) return;
    SK.CITY[a].sea.push(b); SK.CITY[b].sea.push(a);
    SK.SEALANES.push([a, b]);
  });
};

/* v5.0.3 — 길이 지나는 점들. 바다를 가로지르는 구간은 SK.ROAD_VIA 의 꺾은점을 따라 해안으로 돌아간다.
   map.js 그리기와 SK.roadIssues 감사가 같은 좌표를 쓴다. */
SK.roadPoints = function (a, b) {
  const A = SK.CITY[a], B = SK.CITY[b];
  if (!A || !B) return [];
  const ax = A.u * 2000, ay = A.v * 1333, bx = B.u * 2000, by = B.v * 1333;
  const via = (SK.ROAD_VIA || {})[a + '|' + b] || (SK.ROAD_VIA || {})[b + '|' + a] || null;
  if (via && via.length) {
    return [[ax, ay]].concat(via.map((p) => [p[0], p[1]]), [[bx, by]]);
  }
  const mx = (ax + bx) / 2 + (by - ay) * -0.045;
  const my = (ay + by) / 2 + (bx - ax) * 0.045;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([(1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx,
      (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by]);
  }
  return pts;
};

SK.neighbors = function (id) { return (SK.CITY[id] && SK.CITY[id].roads) || []; };
SK.seaNeighbors = function (id) { return (SK.CITY[id] && SK.CITY[id].sea) || []; };
SK.allNeighbors = function (id) { return SK.neighbors(id).concat(SK.seaNeighbors(id)); };

/* ───────────── 도로망 자체 점검 (v5.0.3) ─────────────
   ‣ 육로가 바다를 건너는가 — 지도 폴리곤 위에서 40점을 찍어 본다
   ‣ 관문이 양쪽을 잇는가 · 홀로 남은 거점이 있는가 · 77거점이 한 덩어리인가
   QA에서 SK.roadIssues() 로 확인한다. 평소 게임 진행에는 쓰이지 않는다. */
SK.roadIssues = function () {
  const out = [];
  const pts = SK.CITY_LIST;
  if (!pts.length) return ['거점이 없다'];
  const MAPW = 2000, MAPH = 1333;
  let landPath = null, lctx = null;
  if (typeof Path2D !== 'undefined' && SK.MAPGEO) {
    try {
      landPath = new Path2D();
      SK.MAPGEO.land.forEach((flat) => {
        landPath.moveTo(flat[0], flat[1]);
        for (let i = 2; i < flat.length; i += 2) landPath.lineTo(flat[i], flat[i + 1]);
        landPath.closePath();
      });
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      lctx = cv.getContext('2d');
    } catch (e) { landPath = null; }
  }
  const onLand = (x, y) => (lctx && landPath ? lctx.isPointInPath(landPath, x, y) : true);
  const deg = {};
  const seaDeg = {};
  SK.CITY_LIST.forEach((c) => { deg[c.id] = 0; seaDeg[c.id] = 0; });
  SK.ROADS.forEach(([a, b]) => {
    deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1;
    const A = SK.CITY[a], B = SK.CITY[b];
    if (!A || !B) { out.push(`없는 거점 ${a}-${b}`); return; }
    const path = SK.roadPoints(a, b);
    let wet = 0, total = 0;
    for (let i = 0; i < path.length; i++) {
      total++;
      if (!onLand(path[i][0], path[i][1])) wet++;
      if (i < path.length - 1) {
        for (let k = 1; k < 6; k++) {
          const t = k / 6;
          total++;
          if (!onLand(path[i][0] + (path[i + 1][0] - path[i][0]) * t,
            path[i][1] + (path[i + 1][1] - path[i][1]) * t)) wet++;
        }
      }
    }
    if (wet / Math.max(1, total) > 0.06) out.push(`바다 횡단 ${A.name}-${B.name} (${wet}/${total})`);
  });
  SK.SEALANES.forEach(([a, b]) => {
    seaDeg[a] = (seaDeg[a] || 0) + 1; seaDeg[b] = (seaDeg[b] || 0) + 1;
  });
  const island = SK.ISLAND_GROUP || {};
  SK.CITY_LIST.forEach((c) => {
    if (island[c.id]) return;
    if (deg[c.id] + seaDeg[c.id] === 0) out.push(`홀로 남은 거점 ${c.name}`);
    else if (deg[c.id] < 2 && seaDeg[c.id] === 0) out.push(`길이 하나뿐 ${c.name} (${deg[c.id]})`);
  });
  /* 관문 — 양쪽을 잇는 두 갈래 이상의 육로 */
  SK.CITY_LIST.filter((c) => c.type === 'pass').forEach((c) => {
    if (deg[c.id] < 2) out.push(`관문 ${c.name} — 육로 ${deg[c.id]}개`);
  });
  /* 한 덩어리인가 (섬 제외) */
  const seen = new Set();
  const stack = [pts[0].id];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    (SK.neighbors(id) || []).forEach((n) => { if (!seen.has(n)) stack.push(n); });
  }
  const islandIds = Object.keys(island);
  const dry = pts.filter((c) => !islandIds.includes(c.id) && !seen.has(c.id));
  if (dry.length) out.push(`길이 끊긴 무리: ${dry.map((c) => c.name).join(', ')}`);
  SK.SEALANES.forEach(([a, b]) => {
    if (islandIds.includes(a) && !seaDeg[a]) out.push(`섬 ${a} 해로 없음`);
    if (islandIds.includes(b) && !seaDeg[b]) out.push(`섬 ${b} 해로 없음`);
  });
  return out;
};

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

/* v5.1 — 직교 공성전 맵 (정면 시점). 위쪽에 성, 아래쪽에 공격 진영.
   y0 후벽 · y1~5 성 안 마당(궁궐 4×2) · y6 외벽+성문 2칸 · y7 해자(다리 2칸, 여울 2곳)
   · y8~12 성문 앞 길 · y13~17 아군 진영. 격자와 그림이 1:1로 맞도록 배경 그림 없이 코드로 그린다. */
function siegeMap() {
  const g = blankGrid();
  const row = (y, ch, x0 = 0, x1 = 17) => { for (let x = x0; x <= x1; x++) g[y][x] = ch; };
  /* 성 안 마당 + 좌우 성벽 + 후벽 */
  for (let y = 0; y <= 5; y++) { row(y, 'D'); g[y][0] = 'C'; g[y][17] = 'C'; }
  row(0, 'C');
  /* 궁궐·관아 */
  for (let y = 1; y <= 2; y++) row(y, 'H', 7, 10);
  /* 정면 외벽 + 성문 2칸 */
  row(6, 'C'); g[6][8] = 'G'; g[6][9] = 'G';
  /* 해자: 다리 2칸(성문 앞) + 양옆 여울 */
  row(7, 'W'); g[7][8] = 'B'; g[7][9] = 'B'; g[7][3] = 'S'; g[7][14] = 'S';
  /* 성문 앞 길 */
  for (let y = 8; y <= 12; y++) { g[y][8] = 'R'; g[y][9] = 'R'; }
  row(13, 'R', 7, 10);
  /* 성 밖: 숲(우회·엄폐) · 산(양 모서리) */
  paint(g, [[9, 1], [9, 2], [10, 1], [10, 2], [10, 3], [11, 2], [9, 15], [9, 16], [10, 14], [10, 15], [10, 16], [11, 15], [11, 5], [12, 5], [11, 12], [12, 12]], 'F');
  paint(g, [[13, 0], [13, 1], [14, 0], [14, 1], [14, 2], [15, 0], [15, 1], [16, 0], [17, 0], [17, 1],
    [13, 16], [13, 17], [14, 15], [14, 16], [14, 17], [15, 16], [15, 17], [16, 17], [17, 16], [17, 17]], 'M');
  return g2s(g);
}

function navalMap() {
  const g = blankGrid();
  for (let y = 5; y <= 10; y++) for (let x = 0; x < 18; x++) g[y][x] = 'W';
  for (let x = 0; x < 18; x++) { g[4][x] = 'S'; g[11][x] = 'S'; }
  for (let y = 3; y <= 12; y++) { g[y][4] = 'B'; g[y][5] = 'B'; g[y][12] = 'B'; g[y][13] = 'B'; }
  /* v5.0.1 — 오른쪽 나무다리(그림 x 78~96%)를 실제로 건널 수 있게 다리 타일로 바꿈 */
  for (let y = 4; y <= 11; y++) { g[y][15] = 'B'; g[y][16] = 'B'; }
  g[4][14] = 'B'; g[5][14] = 'B'; g[10][17] = 'B'; g[11][17] = 'B';
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

/* v5.0.1 — 도시 공략은 언제나 공성전. 관문은 산전, 요새는 요새전.
   수전·산전은 강·바다를 건너는 길과 행군 요격전(2단계)에서 쓴다. */
SK.battleTypeFor = function (city) {
  if (!city) return 'siege';
  if (city.type === 'pass') return 'mountain';
  if (city.type === 'fortress') return 'fortress';
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
  if (type === 'siege') return [[8, 3], [6, 4], [11, 4], [4, 3], [13, 3], [8, 5], [9, 5], [3, 5]];
  if (type === 'naval') return [[3, 2], [6, 2], [9, 2], [12, 2], [15, 2], [5, 1], [11, 1], [14, 1]];
  if (type === 'mountain') return [[16, 2], [14, 4], [11, 7], [10, 9], [8, 10], [13, 5], [15, 3], [9, 11]];
  return [[12, 4], [15, 4], [13, 6], [16, 7], [11, 7], [12, 9], [14, 5], [16, 3]];
};
SK.allySlots = function (type) {
  if (type === 'siege') return [[8, 13], [9, 13], [7, 14], [10, 14], [6, 13], [11, 13], [5, 14], [12, 14], [8, 15], [9, 15]];
  if (type === 'naval') return [[3, 15], [6, 15], [9, 15], [12, 15], [15, 15], [4, 16], [7, 16], [10, 16], [13, 16], [16, 16]];
  if (type === 'mountain') return [[2, 16], [3, 15], [4, 14], [5, 13], [6, 12], [7, 12], [3, 16], [4, 16], [5, 14], [6, 13]];
  return [[3, 15], [5, 16], [7, 15], [9, 16], [4, 13], [6, 14], [8, 16], [2, 14], [10, 16], [5, 14]];
};

/* ══════════════════════════════════════════════════════════════
   v4.1 — 한글화 후처리 : 화면에 한자가 남지 않도록 데이터의 한자 표기를 비운다
   (병과·특기·인물·전장 이름은 한국어 이름만 쓴다)
   ══════════════════════════════════════════════════════════════ */
Object.keys(SK.CLASSES || {}).forEach((k) => { SK.CLASSES[k].hanja = ''; });
Object.keys(SK.SKILLS || {}).forEach((k) => { if (SK.SKILLS[k]) SK.SKILLS[k].hanja = ''; });
Object.keys(SK.HEROES || {}).forEach((k) => { SK.HEROES[k].hanja = ''; });
Object.keys(SK.BATTLE_TYPES || {}).forEach((k) => { SK.BATTLE_TYPES[k].hanja = ''; });

/* 숫자 월 표기 — 190년 1월 ~ 190년 12월 */
SK.MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
SK.monthName = function (idx) {
  const i = ((Number(idx) || 0) % 12 + 12) % 12;
  return SK.MONTH_NAMES[i];
};
SK.dateLabel = function (year, monthIdx) {
  return `${Number(year)}년 ${SK.monthName(monthIdx)}`;
};
