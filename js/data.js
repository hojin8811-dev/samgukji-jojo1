/* ══════════════════════════════════════════════════════════════
   꼬마영웅 대난투 — 데이터 (지형·병과·장수·80거점·전장)
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
  /* v5.3 — 공성전 보루. 방어 +45%·턴 시작 회복은 battle.js effDef/턴 리셋에서 처리한다 */
  T: { name: '망루', def: 0, cost: 2, icon: 'tower' },
  K: { name: '본성', def: 0, cost: 1, icon: 'keep' },
  /* v5.17 — 1×1 본진·마을. 지형 자체는 평지와 같고, 회복·방어 보정은 battle.js가 준다 */
  A: { name: '아군 본진', def: 0, cost: 1, icon: 'base' },
  E: { name: '적 본진', def: 0, cost: 1, icon: 'base' },
  V: { name: '마을', def: 0, cost: 1, icon: 'village' },
};

/* ───────────── 병과 (16종) ───────────── */
SK.CLASSES = {
  gunwoong: { name: '군주', hanja: '君主', role: '지휘·균형', atk: 31, def: 21, mov: 4, rng: 1, mp: 46,
    skills: ['jihwi'], weapon: 'sword', desc: '군 전체를 이끄는 군주. 지휘로 아군을 강화한다.' },
  gibi: { name: '기병', hanja: '騎兵', role: '돌격·기동', atk: 34, def: 17, mov: 6, rng: 1, mp: 20,
    skills: ['dolpa'], weapon: 'spear', mount: true, desc: '이동 6의 돌격 병과. 평지·도로에서 공격 +15%, 보병에게 +18%, 산지 통행 불가.' },
  gunggi: { name: '궁기', hanja: '弓騎', role: '원거리·기동', atk: 29, def: 14, mov: 5, rng: 3, mp: 26,
    skills: ['jipsajung'], weapon: 'bow', mount: true, desc: '이동 5의 말탄 궁수. 3칸(◇ 마름모) 사격, 산이나 성 위에서 사거리 +1.' },
  changbyung: { name: '창병', hanja: '槍兵', role: '대기병·성문', atk: 28, def: 21, mov: 4, rng: 2, mp: 18,
    skills: ['gwantung'], weapon: 'spear', desc: '긴 창으로 2칸(◇ 마름모, 대각선 포함)을 찌른다. 기병·야수에게 +35%, 성문에서 방어 +20%.' },
  geombyung: { name: '검병', hanja: '劍兵', role: '방어·근접', atk: 30, def: 24, mov: 4, rng: 1, mp: 16,
    skills: ['bangpae'], weapon: 'sword', desc: '튼튼한 방패 검병. 궁병에게 +20%, 성문·마당에서 방어 +20%. 반격 피해 90%로 방패 맞다이에 강하다.' },
  sanjeok: { name: '산적', hanja: '山賊', role: '산지·숲 특화', atk: 34, def: 14, mov: 5, rng: 1, mp: 16,
    skills: ['sangang'], weapon: 'axe', desc: '산지·숲에서 공격 +30%. 산전의 주인공.' },
  sujeok: { name: '수적', hanja: '水賊', role: '수전 특화', atk: 31, def: 17, mov: 5, rng: 1, mp: 20,
    skills: ['suryu'], weapon: 'trident', desc: '물 위를 걸어 다닌다. 물에서 공격 +25%, 방어 +15%.' },
  chaeksa: { name: '책사', hanja: '策士', role: '책략', atk: 16, def: 11, mov: 4, rng: 3, mp: 60,
    skills: ['hwagye', 'pungsu'], weapon: 'fan', desc: '화계로 방어를 무시하는 피해, 풍수로 적 방어를 깎는다.' },
  pungsusa: { name: '풍수사', hanja: '風水師', role: '회복·보조', atk: 15, def: 12, mov: 4, rng: 3, mp: 70,
    skills: ['sobogeup', 'daebogeup', 'gomu', 'pungsu'], weapon: 'staff', desc: '보급으로 아군을 살리고 고무로 공격을 올린다.' },
  dosa: { name: '도사', hanja: '道士', role: '저주·회복', atk: 18, def: 12, mov: 4, rng: 3, mp: 64,
    skills: ['yosul', 'sobogeup'], weapon: 'staff', desc: '요술로 적의 공격을 약화시키고 부상병을 회복한다.' },
  gungsu: { name: '궁수', hanja: '弓手', role: '원거리', atk: 25, def: 13, mov: 4, rng: 3, minRng: 2, mp: 16,
    skills: ['jipsajung'], weapon: 'bow', desc: '2칸 밖에서 3칸(◇ 마름모)까지 일방적으로 사격. 기병·책략계에 +18%, 창병에 +20%. 산·성 위에서 사거리 +1.' },
  mudoga: { name: '무도가', hanja: '武道家', role: '연격·기동', atk: 33, def: 15, mov: 5, rng: 1, mp: 20,
    skills: ['yeongyeok'], weapon: 'fist', desc: '맨몸의 연격으로 두 번 때린다. 평지에서 공격 +10%, 궁병에게 +20%로 파고든다.' },
  yasubyung: { name: '야수병', hanja: '野獸兵', role: '숲·산 추격', atk: 36, def: 16, mov: 5, rng: 1, mp: 18,
    skills: ['yaseup'], weapon: 'claw', desc: '호랑이 부대. 보병에게 +18%, 숲·산지에서 공격 +20%, 숲·산에서는 이동력 +1(6급)에 진입 비용 1.' },
  muhui: { name: '무희', hanja: '舞姬', role: '유혹·교란', atk: 20, def: 10, mov: 5, rng: 2, mp: 48,
    skills: ['yuhok'], weapon: 'ribbon', desc: '춤으로 적의 공격을 크게 떨어뜨린다. 사거리 2(◇ 마름모).' },
  yeonnobyung: { name: '연노병', hanja: '連弩兵', role: '연사·원거리', atk: 27, def: 15, mov: 3, rng: 4, minRng: 2, mp: 18,
    skills: ['yeonno'], weapon: 'crossbow', desc: '연발 쇠뇌로 2~4칸(◇ 마름모)을 두 번 쏜다. 기병·책략계에 +18%, 창병에 +20%. 느리지만 화력이 뛰어나다.' },
  deunggabyung: { name: '등갑병', hanja: '藤甲兵', role: '철벽 방어', atk: 28, def: 31, mov: 3, rng: 1, mp: 12,
    skills: ['bangpae'], weapon: 'sword', desc: '등나무 갑옷의 중장 보병. 궁병에게 +20%, 느리지만 좀처럼 뚫리지 않는다.' },
  gunakdae: { name: '군악대', hanja: '軍樂隊', role: '사기·지원', atk: 12, def: 12, mov: 4, rng: 2, mp: 60,
    skills: ['gomu', 'jihwi'], weapon: 'drum', desc: '북과 나팔로 아군의 사기를 올린다. 직접 싸움은 약하다.' },
  pocha: { name: '포차', hanja: '砲車', role: '공성 병기', atk: 46, def: 26, mov: 2, rng: 5, minRng: 2, mp: 10,
    skills: ['pogyeok'], weapon: 'ram', siege: true, desc: '2~5칸(◇ 마름모) 사거리. 성문·성벽에 2배 피해. 붙으면 못 쏘고 이동이 느리다.' },
  balseokcha: { name: '발석차', hanja: '發石車', role: '투석 병기', atk: 56, def: 18, mov: 1, rng: 7, minRng: 3, mp: 10,
    skills: ['tuseok'], weapon: 'catapult', siege: true, desc: '3~7칸(◇ 마름모) 먼 곳을 범위로 때리는 투석기. 성문 공략의 결정타.' },
};

/* ───────────── 책략 ─────────────
   v5.14 — 사거리·범위는 전부 마름모(맨해튼) 거리 기준이다. 대각선 1칸 = 거리 2.
   위력 예산: MP 8~9 ≈ 140%, MP 10 ≈ 150%, MP 12 ≈ 175~185%, MP 14 ≈ 195%, MP 16+ ≈ 210~230%.
   2연타는 한 대 92%(합 184%), 3연타는 한 대 72%(합 216%)를 넘기지 않는다. */
SK.SKILLS = {
  jihwi: { name: '지휘', hanja: '指揮', mp: 12, kind: 'buffAreaAllies', radius: 2, atk: 0.2, turns: 3,
    desc: '주변 2칸(마름모) 아군 전원 공격 +20% (3턴)' },
  dolpa: { name: '돌파', hanja: '突破', mp: 10, kind: 'power', range: 1, power: 1.55,
    desc: '한 명에게 강력한 돌격 (공격력 155%)' },
  jipsajung: { name: '집중사격', hanja: '集中射擊', mp: 9, kind: 'power', range: 3, power: 1.4,
    desc: '사거리 3칸 안의 적 하나를 집중 사격 (140%)' },
  gwantung: { name: '관통창', hanja: '貫通槍', mp: 9, kind: 'power', range: 2, power: 1.4, vsMount: 0.4,
    desc: '2칸(마름모) 찌르기 140%. 기병에게 +40% 추가 피해' },
  sobogeup: { name: '소보급', hanja: '小補給', mp: 10, kind: 'heal', range: 2, healPct: 0.16,
    desc: '2칸 안 아군 1명(자기 자신 포함)의 병력을 최대 병력의 16% 회복 (최대 22%)' },
  daebogeup: { name: '대보급', hanja: '大補給', mp: 22, kind: 'healArea', radius: 2, healPct: 0.12,
    desc: '주변 2칸(마름모) 아군 전원을 최대 병력의 12% 회복' },
  gomu: { name: '고무', hanja: '鼓舞', mp: 12, kind: 'buffAlly', range: 2, atk: 0.3, turns: 3,
    desc: '2칸 안 아군 1명 공격 +30% (3턴)' },
  pungsu: { name: '풍수', hanja: '風水', mp: 15, kind: 'debuffDef', range: 3, radius: 2, turns: 3, amount: -0.25,
    desc: '3칸 앞 지점의 2칸(마름모) 안 적 방어 -25% (3턴)' },
  hwagye: { name: '화계', hanja: '火計', mp: 12, kind: 'magic', range: 3, power: 240,
    desc: '3칸 앞 적에게 불을 질러 방어를 무시하는 피해' },
  sangang: { name: '산악강타', hanja: '山岳强打', mp: 9, kind: 'power', range: 1, power: 1.45, ignoreTerrain: true,
    desc: '지형 방어를 무시하는 강타 (145%)' },
  suryu: { name: '수류참', hanja: '水流斬', mp: 9, kind: 'power', range: 1, power: 1.45, waterBonus: true,
    desc: '물 위에서 더 강한 일격 (145%, 물에서 +15%)' },
  bangpae: { name: '방패벽', hanja: '防牌壁', mp: 8, kind: 'buffSelf', def: 0.5, turns: 3,
    desc: '자신의 방어 +50% (3턴)' },
  yosul: { name: '요술', hanja: '妖術', mp: 14, kind: 'debuffAtk', range: 3, radius: 1, turns: 3, amount: -0.3,
    desc: '적 1명의 공격 -30% (3턴)' },
  yeongyeok: { name: '연격', hanja: '連擊', mp: 12, kind: 'power', range: 1, power: 0.92, hits: 2,
    desc: '두 번 연속 공격 (각 92% · 합 184%)' },
  yaseup: { name: '야습', hanja: '夜襲', mp: 10, kind: 'power', range: 1, power: 1.5,
    desc: '숲·산지에서 기습적인 강타 (150%)' },
  yuhok: { name: '유혹', hanja: '誘惑', mp: 13, kind: 'debuffAtk', range: 2, radius: 2, turns: 3, amount: -0.35,
    desc: '주변 2칸(마름모) 적의 공격 -35% (3턴)' },
  pogyeok: { name: '포격', hanja: '砲擊', mp: 10, kind: 'power', range: 5, minRange: 2, power: 2.0, siegeBonus: 1.0,
    desc: '5칸 앞 적에게 200%. 성문·성벽 위의 적에게는 2배' },
  tuseok: { name: '투석', hanja: '投石', mp: 11, kind: 'magicArea', range: 6, minRange: 3, radius: 1, power: 300,
    desc: '6칸 앞 지점 1칸 범위에 돌을 던진다' },
  yeonno: { name: '연노사격', hanja: '連弩射擊', mp: 12, kind: 'power', range: 4, power: 0.85, hits: 2,
    desc: '4칸 밖의 적을 두 번 연속으로 쏜다 (각 85% · 합 170%)' },
  gwanse: { name: '관통사격', hanja: '貫通射擊', mp: 12, kind: 'power', range: 4, power: 1.65,
    desc: '4칸 밖에서 꿰뚫는 강력한 사격 (165%)' },
  paedo: { name: '해일', hanja: '海溢', mp: 18, kind: 'magicArea', range: 3, radius: 2, power: 300,
    desc: '거대한 물결로 2칸(마름모) 범위를 휩쓴다' },
  cheonmu: { name: '천무', hanja: '天武', mp: 14, kind: 'power', range: 1, power: 1.85,
    desc: '하늘을 가르는 무도의 일격 (185%)' },
  hwanmu: { name: '환무', hanja: '幻舞', mp: 15, kind: 'debuffAtk', range: 2, radius: 2, turns: 3, amount: -0.4,
    desc: '현혹의 춤으로 주변 2칸 적 공격 -40%' },
  yeonpo: { name: '연속포격', hanja: '連發砲擊', mp: 16, kind: 'power', range: 6, minRange: 2, power: 2.4, siegeBonus: 0.8,
    desc: '6칸 앞 성문에 연달아 포탄을 퍼붓는다 (240%)' },
  hwayeom: { name: '화염투석', hanja: '火焰投石', mp: 20, kind: 'magicArea', range: 6, minRange: 3, radius: 2, power: 340,
    desc: '6칸 앞에 불붙은 돌을 던져 2칸 범위를 불바다로 만든다' },
};

/* 병과 → SD 유닛/초상화 */
SK.CLASS_UNIT = {
  gunwoong: 'jojo', gibi: 'gibyung', gunggi: 'gunggibyung', changbyung: 'changbyung',
  geombyung: 'bobyung', sanjeok: 'sanjeok', sujeok: 'sujeok', chaeksa: 'chaeksa',
  pungsusa: 'pungsusa', dosa: 'dosa', gungsu: 'gungbyung', mudoga: 'mudoga',
  yasubyung: 'yasubyung', muhui: 'muhui', pocha: 'pocha', balseokcha: 'balseokcha',
  yeonnobyung: 'gungbyung', deunggabyung: 'bobyung', gunakdae: 'gunakdae',
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
  '축융', '포삼랑', '황월영', '관은병', '장성채', '마운록', '화만', '향랑',
  '논개'];   // v5.23 — 논개(진주)를 여성 장수로 등록
SK.isFemaleGeneral = function (g) {
  return !!(g && SK.FEMALE_GENERALS.indexOf(g.name) >= 0);
};
SK.REGIMENTS = [
  { cls: 'geombyung', name: '검병대', cost: 2000 },
  { cls: 'changbyung', name: '창병대', cost: 2000 },
  { cls: 'gungsu', name: '궁수대', cost: 2000 },
  { cls: 'gibi', name: '기병대', cost: 2000 },
  { cls: 'sanjeok', name: '산적대', cost: 2000 },
  { cls: 'sujeok', name: '수적대', cost: 2000 },
  { cls: 'mudoga', name: '무도가대', cost: 2000 },
  { cls: 'yasubyung', name: '야수병대', cost: 2000 },
  { cls: 'pocha', name: '포차대', cost: 2000 },
  { cls: 'balseokcha', name: '발석차대', cost: 2000 },
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

/* ───────────── 병과 삼각 상성 (v5.15)
   조조전식 상성: 보병은 활을 든 궁병에게 달라붙고, 궁병은 느린 기병·책략계를 저격하고,
   기병·야수는 보병을 덮치고, 창병은 기병·야수를 말째로 받아넣는다.
   창병은 궁병에게 약하다(궁병→창병 +20%).
   반환: { mul, label } — 배율 1.0이면 상성 없음. */
SK.CLASS_GROUPS = {
  보병: ['geombyung', 'deunggabyung', 'mudoga'],
  궁병: ['gungsu', 'yeonnobyung', 'gunggi'],
  기병: ['gibi', 'yasubyung'],
  창병: ['changbyung'],
  책략: ['chaeksa', 'dosa', 'pungsusa', 'muhui', 'gunakdae'],
};
SK.TRIANGLE = {
  geombyung: { gungsu: 1.2, yeonnobyung: 1.2, label: '보병→궁병' },
  deunggabyung: { gungsu: 1.2, yeonnobyung: 1.2, label: '보병→궁병' },
  mudoga: { gungsu: 1.2, yeonnobyung: 1.2, label: '보병→궁병' },
  gungsu: { gibi: 1.18, yasubyung: 1.18, changbyung: 1.2, chaeksa: 1.18, dosa: 1.18, pungsusa: 1.18, muhui: 1.18, gunakdae: 1.18, label: '궁병→기병·책략' },
  yeonnobyung: { gibi: 1.18, yasubyung: 1.18, changbyung: 1.2, chaeksa: 1.18, dosa: 1.18, pungsusa: 1.18, muhui: 1.18, gunakdae: 1.18, label: '궁병→기병·책략' },
  gunggi: { gibi: 1.18, yasubyung: 1.18, changbyung: 1.2, chaeksa: 1.18, dosa: 1.18, pungsusa: 1.18, muhui: 1.18, gunakdae: 1.18, label: '궁병→기병·책략' },
  gibi: { geombyung: 1.18, deunggabyung: 1.18, mudoga: 1.18, label: '기병→보병' },
  yasubyung: { geombyung: 1.18, deunggabyung: 1.18, mudoga: 1.18, label: '기병→보병' },
  changbyung: { gibi: 1.35, yasubyung: 1.35, label: '창병→기병' },
};
SK.triangleMul = function (aCls, dCls) {
  const row = SK.TRIANGLE[aCls];
  const mul = row && row[dCls];
  if (!mul) return { mul: 1, label: '' };
  return { mul, label: `${row.label} +${Math.round((mul - 1) * 100)}%` };
};

/* ───────────── 지역 구분 (v4.2) ─────────────
   한국 장수는 한국 세력·한국 성 주점에만, 중국(위·촉·오·군웅) 장수는 중국 세력·중국 성에만 쓴다.
   인물이 섞이면 삼국지와 삼한이 한 주점에 서는 꼴이 되므로 철저히 나눈다. */
/* v5.20 — 조선(joseon)·고려(goryeo)도 한국 세력으로 묶는다.
   그래야 완산·개성 주점에 한국 인재만 서고, 세력 계열(한국)이 3국과 같아진다. */
SK.KOREAN_FACTIONS = ['goguryeo', 'baekje', 'silla', 'joseon', 'goryeo'];
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
  lvbu: { name: '여포군', mark: '여', color: '#7E22CE', light: '#e6d5f5', lord: '여포' },
  zhangjiao: { name: '장각군', mark: '황', color: '#7C6A0A', light: '#ece5c0', lord: '장각' },
  /* v5.19 — 190년 1막 형남·남만 세력. 22 → 24세력 */
  hanxuan: { name: '한현군', mark: '현', color: '#A21CAF', light: '#f2d6f6', lord: '한현' },
  meng_huo: { name: '맹획군', mark: '맹', color: '#C2410C', light: '#f8dccb', lord: '맹획' },
  /* v5.20 — 1막 시공초월 한국 5세력: 조선(완산)·고려(개성)·사섭군(남해)·공손강군(요동) */
  joseon: { name: '조선', mark: '조', color: '#991B1B', light: '#f6d4d4', lord: '이성계' },
  goryeo: { name: '고려', mark: '려', color: '#6B21A8', light: '#e7d7f3', lord: '왕건' },
  shi_xie: { name: '사섭군', mark: '사', color: '#A16207', light: '#efe1bd', lord: '사섭' },
  gongsunkang: { name: '공손강군', mark: '강', color: '#78350F', light: '#eadbc9', lord: '공손강' },
};

/* 세력 id → 한 글자 한국어 표식 (깃발·배지에 쓴다, 없으면 이름 첫 글자) */
SK.FACTION_MARK = {
  dongzhuo: '동', yuanshao: '원', caocao: '위', liubei: '촉', sunjian: '손', yuanshu: '술',
  liubiao: '표', liuyan: '언', mateng: '마', gongsunzan: '공', taoqian: '도', hansui: '한',
  goguryeo: '고', baekje: '백', silla: '신', sunquan: '오', liuzhang: '장', zhanglu: '로',
  gongsunkang: '강', cao_wei_pre: '위', liuzong: '종', shu_han: '촉', sun_wu: '오',
  shi_xie: '사', meng_huo: '맹', neutral: '야',
  kongrong: '융', liuyao: '유', yanbaihu: '엄', wanglang: '왕', zhanglu: '로',
  lvbu: '여', zhangjiao: '황',
  /* v5.19 — 한현군 '현'(한수군 '한'과 겹치지 않게) · 남만 맹획군 '맹' · 4막 남중 호족 '중' */
  hanxuan: '현', nanjung: '중',
  /* v5.20 — 조선 '조' · 고려 '려' (사섭군 '사'·공손강군 '강'은 기존 표식 그대로) */
  joseon: '조', goryeo: '려',
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
   고구려=인디고 · 백제=틸 · 신라=주황, 나머지 군웅은 서로 겹치지 않는 밝은 색
   v5.18 — 여포군(보라)과 고구려가 같은 보라로 겹쳐 보여 고구려를 더 진한 인디고(#312E81)로 낮짼다 */
SK.FACTION_COLOR = {
  /* v5.0.3 — 190년 지도에서 길·근접으로 맞닿는 세력끼리 색 거리(ΔE) 49 이상이 되도록 다시 배치했다.
     (유비군 녹색 ↔ 도겸군 연두색이 거의 같아 보이던 문제) 조조·유비·손견·동탁·원소는 상징색 유지. */
  caocao: '#1D4ED8', cao_wei_pre: '#1D4ED8', cao_wei: '#1D4ED8',
  liubei: '#15803D', shu_han: '#15803D',
  sunjian: '#DC2626', sunquan: '#DC2626', sun_wu: '#B91C1C',
  lubu: '#7E22CE', lvbu: '#7E22CE',
  yuanshao: '#CA8A04', dongzhuo: '#374151',
  goguryeo: '#312E81', baekje: '#7E1D3E', silla: '#0B7285',
  yuanshu: '#DB2777', liubiao: '#0E7490', liuzong: '#9333EA', liuyan: '#7E22CE',
  liuzhang: '#92400E', mateng: '#B45309', hansui: '#3F6212', gongsunzan: '#9F1239',
  taoqian: '#7C2D12', zhanglu: '#BE185D', gongsunkang: '#78350F', shi_xie: '#A16207',
  neutral: '#8B8777',
  zhangjiao: '#7C6A0A',
  /* v5.19 — 한현군(장사)은 이웃한 손견군 빨강·유표군 청록·유요군 하늘·왕랑군 올리브와
     색이 갈리도록 자주(#A21CAF), 맹획군(운남)은 남만 흙빛 주황(#C2410C).
     4막 남중 호족(meng_huo → nanjung)은 기존 올리브를 그대로 쓴다. */
  hanxuan: '#A21CAF', meng_huo: '#C2410C', nanjung: '#4D7C0F',
  kongrong: '#475569', liuyao: '#0891B2', yanbaihu: '#1E40AF', wanglang: '#4D7C0F',
  /* v5.20 — 1막 한국 5세력 색: 조선 진홍(#991B1B), 고려 보라(#6B21A8).
     완산·개성에서 이웃한 백제(자주빛)·신라(청록)·고구려(남보라)와 ΔE 30 이상으로 갈린다. */
  joseon: '#991B1B', goryeo: '#6B21A8',
};

/* v5.20 — 군주·왕은 재야 인재로 등용되지 않는다.
   조선 완산 주점에 고구려 왕 광개토대왕·금관가야 김수로가 '은거 인재'로 앉는 것을 막는다.
   (이미 다른 세력을 이끄는 사람을 신하로 데려오면 판도가 우스워진다) */
SK.lordNameSet = function (st) {
  const s = st || SK.state;
  const out = new Set();
  if (!s || !s.factions) return out;
  Object.keys(s.factions).forEach((k) => {
    if (k === 'neutral') return;
    const f = s.factions[k];
    const n = f && f.lord ? SK.normName(f.lord) : '';
    if (n) out.add(n);
  });
  return out;
};
/* v5.22 — 왕·왕비·태자 같은 왕실 인물은 job이 '군주'가 아니어도 재야 인재가 아니다.
   (의자왕·진덕여왕·고이왕·무령왕·문무왕처럼 병과만 다를 뿐 임금인 인물이
    주점·탐색에 '은거 인재'로 앉던 문제) */
SK.ROYAL_TITLE = /(?:대왕|여왕|왕|이사금|태자|왕비|왕후)$/;
SK.isRoyalName = function (name) {
  const n = SK.normName ? SK.normName(name) : String(name || '').trim();
  return !!n && SK.ROYAL_TITLE.test(n);
};
SK.isLordOnly = function (g, lordSet) {
  if (!g) return true;
  if (g.job === '군주') return true;
  if (lordSet && lordSet.has(g.name)) return true;
  /* 왕실 인물 — 이름이 왕·대왕·여왕·이사금·태자로 끝나면 재야에 두지 않는다 */
  if (g.royal === true) return true;
  return SK.isRoyalName(g.name);
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
  '무위': 'wuwei', '서량': 'wuwei', '서량군': 'wuwei', '천수': 'tianshui',
  '안정': 'anding', '서평': 'anding', '삭방': 'shuofang',
  '북평': 'beiping', '요서': 'beiping', '계': 'ji', '역경': 'ji',
  '하비': 'xiapi', '팽성': 'xiaopei', '낭야': 'langya', '광릉': 'guangling', '초': 'xiaopei',
  '소패': 'xiaopei', '해릉 요새': 'hailing',
  '국내성': 'guknaeseong', '환도성': 'guknaeseong', '졸본': 'ansiseong',
  '압록강 유역': 'hamhung', '동옥저': 'hamhung', '함흥': 'hamhung',
  '위례성': 'hanseong', '한성': 'hanseong', '미추홀': 'hanseong',
  '마한 북부': 'wansan', '한강 유역': 'wonju', '웅진': 'ungjin',
  '서라벌': 'gyeongju', '경주': 'gyeongju',
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
  /* v5.3 — 실제 거점 '금성'이 생겼다. 한수의 본거지 금성은 그 성을 쓰고,
     서평은 금성에 붙인다(같은 성으로 모이면 한 곳으로 센다). */
  hansui: { '서평': 'geumseong' },
  mateng: { '서량': 'wuwei' },
  /* 신라의 '금성'은 경주(서라벌)다 — 서북의 금성과 이름이 같아 세력별로 갈라 둔다 */
  silla: { '금성': 'gyeongju' },
  /* 백제 '마한 북부'는 한강 유역이므로 한성으로 (전주 완산으로 보내지 않는다) */
  baekje: { '마한 북부': 'hanseong' },
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
/* v5.18 — 한국 3국 명부 정비: 구수/구수왕·내해/내해이사금처럼 같은 사람이 두 이름으로
   들어 있던 항목과, generals.json에 이미 있는 역대 왕(초고왕·벌휴이사금·산상왕·사반왕)을 걷어냈다.
   여기에는 generals.json에 없는 진짜 장수·책사만 남긴다. */
/* v5.23 — 아래 38인은 generals.json에 없던 한국 인물이라 region을 '한국'으로 못 박는다 */
SK.KOREAN_EXTRA = ['명림어수', '석우로',
  '유금필', '김윤후', '김방경', '이지란', '최윤덕', '정기룡', '연남생', '정운',
  '권응수', '창조리', '목라근자', '해구', '알천', '죽지랑', '박영규', '장문휴',
  '홍대용', '박지원', '김시습', '남이', '어유소', '허종', '정문부', '이정암',
  '신립', '정충신', '영규', '홍계남', '김응서', '김상헌', '거타지', '김정호',
  '유형원', '정제두', '안용복', '논개', '김천일', '송상현',
  '오연총', '고연수', '어재연', '원측', '정년'];
SK.EXTRA_GENERALS = {
  '유언': { job: '군주', tier: 'A', war: 40, intel: 66, lead: 58 },
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
  '후성': { job: '기병', tier: 'B', war: 71, intel: 48, lead: 60, birth: 156 },
  '마휴': { job: '기병', tier: 'B', war: 71, intel: 52, lead: 63 },
  '마철': { job: '기병', tier: 'B', war: 68, intel: 48, lead: 60 },
  '양홍': { job: '검병', tier: 'B', war: 63, intel: 55, lead: 62 },
  '염상': { job: '검병', tier: 'B', war: 60, intel: 52, lead: 58 },
  '주포': { job: '기병', tier: 'B', war: 74, intel: 46, lead: 61 },
  '전해': { job: '창병', tier: 'B', war: 65, intel: 50, lead: 59 },
  '선우보': { job: '궁기', tier: 'B', war: 67, intel: 54, lead: 60 },
  '엄강': { job: '창병', tier: 'B', war: 70, intel: 56, lead: 62 },
  '국의': { job: '책사', tier: 'B', war: 30, intel: 74, lead: 58 },
  '명림어수': { job: '책사', tier: 'A', war: 40, intel: 82, lead: 70, birth: 146 },
  '석우로': { job: '창병', tier: 'A', war: 82, intel: 66, lead: 74, birth: 165 },
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
  /* v5.19 — 1막 주 세력 드림팀·한현군·맹획군 보강 인물 (generals.json에 없는 이름만 여기 둔다) */
  '서서': { job: '책사', tier: 'A', war: 52, intel: 92, lead: 81, pol: 84, charm: 89, birth: 170, debut: 192 },
  '우보': { job: '기병', tier: 'B', war: 72, intel: 38, lead: 60, birth: 155, debut: 175 },
  '한현': { job: '군주', tier: 'C', war: 62, intel: 50, lead: 57, birth: 155, debut: 180 },
  '양령': { job: '창병', tier: 'B', war: 74, intel: 42, lead: 63, birth: 160, debut: 180 },
  '형도영': { job: '창병', tier: 'B', war: 80, intel: 35, lead: 62, birth: 160, debut: 190 },
  '진응': { job: '궁수', tier: 'C', war: 66, intel: 38, lead: 56, birth: 165, debut: 190 },
  '포륭': { job: '창병', tier: 'C', war: 64, intel: 34, lead: 54, birth: 165, debut: 190 },
  '설례': { job: '검병', tier: 'B', war: 66, intel: 52, lead: 60, birth: 160, debut: 180 },
  '관정': { job: '책사', tier: 'B', war: 30, intel: 76, lead: 60, birth: 155, debut: 180 },
  '아회남': { job: '야수병', tier: 'B', war: 76, intel: 34, lead: 58, birth: 170, debut: 195 },
  '대래동주': { job: '야수병', tier: 'B', war: 74, intel: 40, lead: 60, birth: 165, debut: 195 },
  '맹우': { job: '창병', tier: 'B', war: 72, intel: 46, lead: 57, birth: 178, debut: 195 },
  '동도나': { job: '창병', tier: 'B', war: 73, intel: 40, lead: 55, birth: 170, debut: 195 },
  '금환삼결': { job: '창병', tier: 'B', war: 78, intel: 30, lead: 56, birth: 170, debut: 195 },
  '망아장': { job: '야수병', tier: 'C', war: 70, intel: 28, lead: 52, birth: 172, debut: 195 },
  /* v5.20 — 사섭군(남해)·공손강군(요동) 보강 인물 (generals.json에 없는 이름만) */
  '사광': { job: '창병', tier: 'B', war: 63, intel: 58, lead: 58, birth: 168, debut: 190 },
  '환린': { job: '검병', tier: 'B', war: 72, intel: 52, lead: 60, birth: 165, debut: 190 },
  '유의': { job: '궁수', tier: 'B', war: 64, intel: 62, lead: 59, birth: 158, debut: 184 },
  /* v5.21 — 소세력 5팀(도겸·공용·한수·엄백호·왕랑) 고유 부하. 랜덤 재야 보충 대신 실제 부하로 채운다 */
  '장개': { job: '산적', tier: 'B', war: 66, intel: 40, lead: 55, birth: 160, debut: 184 },   // 張闓 — 도겸의 부하
  '도상': { job: '창병', tier: 'C', war: 58, intel: 46, lead: 52, birth: 172, debut: 190 },   // 陶商 — 도겸의 장남
  '종보': { job: '창병', tier: 'B', war: 71, intel: 44, lead: 58, birth: 160, debut: 184 },   // 宗寶 — 공융의 부하
  '좌승조': { job: '책사', tier: 'B', war: 38, intel: 72, lead: 58, birth: 155, debut: 184 },   // 左承祖 — 공융의 막료
  '성공영': { job: '책사', tier: 'A', war: 52, intel: 84, lead: 70, birth: 160, debut: 184 },   // 成公英 — 한수의 막료
  '장횡': { job: '창병', tier: 'B', war: 70, intel: 44, lead: 57, birth: 162, debut: 184 },   // 張橫 — 한수의 부하
  '후선': { job: '검병', tier: 'B', war: 66, intel: 48, lead: 56, birth: 163, debut: 184 },   // 侯選 — 한수의 부하
  '주혼': { job: '수적', tier: 'C', war: 62, intel: 40, lead: 52, birth: 165, debut: 188 },   // 周欣 — 엄백호의 수군 족장
  '추타': { job: '산적', tier: 'C', war: 63, intel: 34, lead: 50, birth: 166, debut: 188 },   // 鄒陀 — 엄백호의 부하
  '황룡': { job: '창병', tier: 'C', war: 60, intel: 38, lead: 51, birth: 168, debut: 188 },   // 黃龍 — 엄백호의 부하
  '소건': { job: '궁수', tier: 'C', war: 59, intel: 42, lead: 50, birth: 168, debut: 188 },   // 蘇乾 — 엄백호의 부하
  '주흔': { job: '창병', tier: 'B', war: 66, intel: 54, lead: 60, birth: 158, debut: 180 },   // 周昕 — 왕랑의 부하
  '장아': { job: '검병', tier: 'C', war: 61, intel: 46, lead: 52, birth: 165, debut: 184 },   // 張雅 — 왕랑의 부하
  /* v5.23 — 한국 재야 풀 보강 43인(초상 1·2탄 40명 + 초상 없는 3인). v5.22에서 왕실 인물을 재야에서 빼자 한국 성(완산·개성·경주 등)
     주점이 비어 중국 인재로 메워지던 문제를 뿌리에서 고친다. 병과는 책사·기병에 몰리지 않게 18병과에 나눠 배분했고, 왕·태자·여왕은 넣지 않았다
     (이름이 왕·대왕·여왕·이사금·태자로 끝나면 SK.isLordOnly가 재야에서 뺀다). */
  '유금필': { job: '기병', tier: 'A', war: 91, intel: 74, lead: 88, pol: 56, charm: 64, birth: 166, debut: 190, skill: '훤산성의 역습' },   // 庾黔弼 — 고려 개국 명장
  '김윤후': { job: '풍수사', tier: 'A', war: 90, intel: 84, lead: 92, pol: 58, charm: 82, birth: 164, debut: 190, skill: '처인성의 한 발' },   // 金允侯 — 처인성에서 살리타 격살
  '김방경': { job: '수적', tier: 'A', war: 89, intel: 86, lead: 90, pol: 76, charm: 74, birth: 160, debut: 190, skill: '삼별초 진압' },   // 金方慶 — 삼별초 진압
  '이지란': { job: '궁기', tier: 'A', war: 93, intel: 70, lead: 86, pol: 50, charm: 58, birth: 158, debut: 190, skill: '여진의 명궁' },   // 李之蘭 — 여진 출신 조선 개국 장수
  '최윤덕': { job: '기병', tier: 'A', war: 91, intel: 78, lead: 88, pol: 72, charm: 74, birth: 157, debut: 190, skill: '사군 개척' },   // 崔潤德 — 조선 4군 개척
  '정기룡': { job: '기병', tier: 'A', war: 91, intel: 76, lead: 87, pol: 52, charm: 66, birth: 158, debut: 190, skill: '상주성의 창' },   // 鄭起龍 — 임진왜란 육전 명장
  '연남생': { job: '기병', tier: 'A', war: 87, intel: 88, lead: 91, pol: 74, charm: 68, birth: 156, debut: 190, skill: '대막리지의 군령' },   // 淵男生 — 고구려 대막리지
  '정운': { job: '수적', tier: 'B', war: 86, intel: 70, lead: 84, pol: 54, charm: 62, birth: 157, debut: 190, skill: '녹도만호의 배' },   // 鄭運 — 임진왜란 녹도만호
  '권응수': { job: '창병', tier: 'B', war: 85, intel: 70, lead: 84, pol: 58, charm: 72, birth: 159, debut: 190, skill: '영천 의병' },   // 權應銖 — 영천 의병장
  '창조리': { job: '책사', tier: 'B', war: 54, intel: 86, lead: 78, pol: 82, charm: 64, birth: 160, debut: 190, skill: '고구려의 책략' },   // 倉助利 — 고구려 재상
  '목라근자': { job: '검병', tier: 'C', war: 76, intel: 56, lead: 74, pol: 52, charm: 55, birth: 165, debut: 192, skill: '백제의 창' },   // 木羅斤資 — 백제 장군
  '해구': { job: '책사', tier: 'C', war: 50, intel: 74, lead: 66, pol: 80, charm: 58, birth: 162, debut: 190, skill: '조정의 저울' },   // 解仇 — 백제 대신
  '알천': { job: '책사', tier: 'B', war: 68, intel: 84, lead: 82, pol: 80, charm: 76, birth: 158, debut: 190, skill: '화백의 자리' },   // 閼川 — 신라 화백회의 대장
  '죽지랑': { job: '검병', tier: 'B', war: 80, intel: 62, lead: 76, pol: 56, charm: 88, birth: 166, debut: 192, skill: '화랑의 검' },   // 竹旨郞 — 신라 화랑
  '박영규': { job: '기병', tier: 'B', war: 84, intel: 64, lead: 82, pol: 62, charm: 58, birth: 160, debut: 190, skill: '호족의 기병' },   // 朴英規 — 고려 호족 장군
  '장문휴': { job: '수적', tier: 'B', war: 84, intel: 70, lead: 82, pol: 54, charm: 56, birth: 168, debut: 194, skill: '발해의 뱃길' },   // 張文休 — 발해 수군장
  '홍대용': { job: '책사', tier: 'B', war: 30, intel: 90, lead: 50, pol: 78, charm: 66, birth: 173, debut: 194, skill: '북경의 지도' },   // 洪大容 — 실학자
  '박지원': { job: '책사', tier: 'A', war: 28, intel: 92, lead: 48, pol: 82, charm: 84, birth: 173, debut: 194, skill: '열하일기의 눈' },   // 朴趾源 — 열하일기
  '김시습': { job: '풍수사', tier: 'B', war: 36, intel: 86, lead: 52, pol: 72, charm: 76, birth: 170, debut: 192, skill: '매월당의 붓' },   // 金時習 — 매월당
  '남이': { job: '무도가', tier: 'B', war: 88, intel: 60, lead: 80, pol: 42, charm: 60, birth: 168, debut: 192, skill: '북정의 기병' },   // 南怡 — 조선 무장
  '어유소': { job: '기병', tier: 'C', war: 80, intel: 60, lead: 78, pol: 58, charm: 62, birth: 165, debut: 192, skill: '여진 정벌' },   // 魚有沼 — 조선 여진 정벌
  '허종': { job: '무도가', tier: 'B', war: 84, intel: 66, lead: 82, pol: 64, charm: 60, birth: 163, debut: 190, skill: '국경의 창' },   // 許琮 — 조선 북방 무장
  '정문부': { job: '산적', tier: 'B', war: 66, intel: 82, lead: 80, pol: 78, charm: 68, birth: 161, debut: 190, skill: '함경 의병' },   // 鄭文孚 — 함경도 의병장
  '이정암': { job: '등갑병', tier: 'B', war: 82, intel: 80, lead: 86, pol: 72, charm: 70, birth: 160, debut: 190, skill: '연안성 사수' },   // 李廷馣 — 연안성 사수
  '신립': { job: '궁수', tier: 'C', war: 80, intel: 50, lead: 70, pol: 40, charm: 52, birth: 159, debut: 190, skill: '탄금대의 활' },   // 申砬 — 탄금대
  '정충신': { job: '궁기', tier: 'B', war: 86, intel: 74, lead: 84, pol: 60, charm: 64, birth: 162, debut: 190, skill: '심하의 기병' },   // 鄭忠信 — 심하·정묘
  '영규': { job: '창병', tier: 'B', war: 85, intel: 60, lead: 80, pol: 44, charm: 76, birth: 160, debut: 190, skill: '승병의 창' },   // 靈圭 — 승병장
  '홍계남': { job: '검병', tier: 'C', war: 78, intel: 52, lead: 72, pol: 46, charm: 66, birth: 161, debut: 190, skill: '안성의 의병' },   // 洪季男 — 안성 의병장
  '김응서': { job: '검병', tier: 'C', war: 78, intel: 58, lead: 72, pol: 52, charm: 58, birth: 160, debut: 190, skill: '도원수의 말' },   // 金應瑞 — 임진왜란 장수
  '김상헌': { job: '책사', tier: 'B', war: 40, intel: 86, lead: 76, pol: 84, charm: 72, birth: 163, debut: 190, skill: '척화의 붓' },   // 金尙憲 — 척화파 재상
  '거타지': { job: '궁수', tier: 'C', war: 70, intel: 48, lead: 56, pol: 40, charm: 54, birth: 168, debut: 196, skill: '신라의 활' },   // 居陀知 — 신라 활잡이
  '김정호': { job: '풍수사', tier: 'C', war: 26, intel: 76, lead: 40, pol: 58, charm: 60, birth: 175, debut: 198, skill: '대동여지도' },   // 金正浩 — 대동여지도
  '유형원': { job: '책사', tier: 'C', war: 24, intel: 78, lead: 42, pol: 64, charm: 52, birth: 172, debut: 196, skill: '반계수록' },   // 柳馨遠 — 반계수록
  '정제두': { job: '도사', tier: 'C', war: 28, intel: 74, lead: 40, pol: 60, charm: 56, birth: 170, debut: 196, skill: '양명의 책' },   // 鄭齊斗 — 양명학
  '안용복': { job: '수적', tier: 'C', war: 52, intel: 62, lead: 54, pol: 48, charm: 62, birth: 166, debut: 194, skill: '울릉도의 바다' },   // 安龍福 — 울릉도·독도
  '논개': { job: '무희', tier: 'C', war: 44, intel: 50, lead: 48, pol: 42, charm: 90, birth: 167, debut: 194, skill: '진주의 바위' },   // 論介 — 진주
  '김천일': { job: '등갑병', tier: 'C', war: 70, intel: 62, lead: 70, pol: 60, charm: 66, birth: 160, debut: 190, skill: '진주성의 군' },   // 金千鎰 — 진주성 의병장
  '송상현': { job: '창병', tier: 'C', war: 66, intel: 64, lead: 68, pol: 66, charm: 70, birth: 158, debut: 190, skill: '동래 성문' },   // 宋象賢 — 동래성
  /* v5.23 — 한국 초상 2탄에서 새로 들어온 5인 (오연총·고연수·어재연·원측·정년). */
  '오연총': { job: '궁기', tier: 'A', war: 89, intel: 76, lead: 91, pol: 66, charm: 68, birth: 160, debut: 190, skill: '여진 정벌' },   // 吳延寵 — 고려 별무반 여진 정벌
  '고연수': { job: '창병', tier: 'A', war: 89, intel: 78, lead: 90, pol: 62, charm: 66, birth: 158, debut: 190, skill: '요동의 창' },   // 高延壽 — 고구려 장수, 안시성
  '어재연': { job: '등갑병', tier: 'B', war: 84, intel: 62, lead: 80, pol: 50, charm: 72, birth: 172, debut: 196, skill: '광성보의 깃발' },   // 魚在淵 — 신미양요 광성보
  '원측': { job: '도사', tier: 'B', war: 30, intel: 86, lead: 50, pol: 78, charm: 70, birth: 168, debut: 194, skill: '유식의 한 수' },   // 圓測 — 신라 승려, 유식학
  '정년': { job: '수적', tier: 'B', war: 86, intel: 64, lead: 80, pol: 48, charm: 58, birth: 164, debut: 192, skill: '장보고의 수군' },   // 鄭年 — 장보고 휘하 수군장
};

/* 한자 인명 → 한국어 표기 */
SK.NAME_ALIAS = {
  '于禁': '우금', '典韋': '전위', '徐晃': '서황', '許褚': '허저', '曹真': '조진', '조仁': '조인',
};

SK.BOSS_PORTRAITS = {};   // 세력 우두머리 초상화는 factionInfo().lord 로 찾는다


/* v5.0.1 — 세력별 초기 식구. enrichFactions가 이 목록 밖의 장수를 끌어오지 않는다.
   (190년 유비 평원에 황충·이엄·엄안·곽준이 따라오던 문제) */
SK.EARLY_RETAINERS = {
  /* v5.19 — 190년 1막 주 세력 드림팀(유비·동탁·여포·손견·마등·조조). f.generals와 같이 맞춘다. */
  dongzhuo: ['동탁', '이유', '이각', '곽사', '장제', '장수', '우보', '서영', '번조', '화웅', '가후', '단외'],
  yuanshao: ['원소', '저수', '전풍', '안량', '문추', '국의', '심배', '봉기', '곽도', '장합', '원담', '원희', '원상'],
  caocao: ['조조', '하후돈', '하후연', '곽가', '순욱', '순유', '전위', '허저', '조인', '조홍', '악진', '우금', '서황', '정욱'],
  liubei: ['유비', '관우', '장비', '조운', '제갈량', '방통', '서서', '강유', '간옹', '손건', '미축', '미방'],
  sunjian: ['손견', '손책', '손권', '주유', '여몽', '황개', '정보', '한당', '주태', '태사자', '감녕', '노숙'],
  yuanshu: ['원술', '기령', '양홍', '장훈', '뇌박', '진란', '교유'],
  liubiao: ['유표', '괴량', '괴월', '괴도', '변희', '채모', '황조', '문빙', '장윤', '유벽', '유훈', '유종'],
  liuyan: ['유언', '번민', '장임', '엄안', '황권', '법정', '이엄', '곽준', '맹달', '오의', '오란'],
  mateng: ['마등', '마초', '마대', '방덕', '마휴', '마철', '성의'],
  /* v5.20 — 공손공은 요동 공손강군으로 옮기고 북평은 공손속으로 채운다 */
  gongsunzan: ['공손찬', '엄강', '선우보', '전해', '공손속', '관정'],
  taoqian: ['도겸', '진규', '조표', '진등', '장개', '도상'],
  hansui: ['한수', '염행', '양추', '이감', '성공영', '장횡', '후선'],
  kongrong: ['공융', '왕수', '무안국', '종보', '좌승조', '손소'],
  liuyao: ['유요', '우번', '착융', '번능', '장영', '설례'],
  yanbaihu: ['엄백호', '엄여', '주혼', '추타', '황룡', '소건'],
  wanglang: ['왕랑', '주흔', '장아', '하제', '고정', '동습'],
  zhanglu: ['장로', '양송', '염포', '양백', '양임', '장위'],
  /* v5.18 — 한국 3국은 군주 1명 + 명장·책사·문신으로 정리 (왕만 우르르 서지 않게) */
  goguryeo: ['광개토대왕', '을지문덕', '연개소문', '양만춘', '온달', '을파소', '명림답부', '밀우', '유유', '검모잠'],
  baekje: ['근초고왕', '계백', '흑치상지', '성충', '흥수', '복신', '근초고태자'],
  silla: ['진흥왕', '김유신', '김춘추', '장보고', '관창', '이사부', '거칠부', '사다함', '설총', '원효'],
  /* v5.18 — 190년 1막: 여포군·장각군(황건적) 신설. 겹치는 장수는 원 세력에서 뺀다 */
  lvbu: ['여포', '진궁', '고순', '장패', '송헌', '위속', '후성'],
  zhangjiao: ['장각', '장보', '장량', '관해', '배원소', '주창', '요화'],
  cao_wei_pre: ['조조', '조인', '조홍', '하후돈', '하후연', '장료', '장합', '서황', '악진', '우금', '허저', '전위', '조진', '조휴', '사마의', '곽가', '순욱', '순유', '정욱', '가후', '진군', '종요', '하후상', '조비'],
  cao_wei: ['조비', '조진', '조휴', '조인', '하후상', '장료', '장합', '서황', '악진', '문빙', '사마의', '진군', '종요', '가후', '하후돈', '하후연'],
  shu_han: ['유비', '관우', '장비', '조운', '제갈량', '황충', '위연', '마초', '마량', '법정', '장완', '비의', '관평', '장포', '손건', '간옹', '미축'],
  sunquan: ['손권', '주유', '노숙', '여몽', '육손', '정보', '황개', '한당', '감녕', '능통', '주태', '서성', '정봉', '장소', '태사자', '장흠', '장굉', '능조', '제갈근'],
  sun_wu: ['손권', '주유', '노숙', '여몽', '육손', '정보', '황개', '한당', '감녕', '능통', '주태', '서성', '정봉', '장소', '제갈근'],
  liuzong: ['유종', '채모', '괴월', '괴량', '문빙'],
  liuzhang: ['유장', '장임', '엄안', '황권', '법정', '맹달', '오의', '오란', '이엄'],
  gongsunkang: ['공손강', '공손도', '공손공'],
  shi_xie: ['사섭', '사흠', '사휘', '사일'],
  /* v5.20 — 1막 조선·고려 (f.generals로 고정되지만, 시나리오 없이 시작할 때도 같은 식구가 서게) */
  joseon: ['이성계', '세종대왕', '이순신', '정도전', '정몽주', '권율', '김시민', '정약용', '김종서', '곽재우'],
  goryeo: ['왕건', '강감찬', '서희', '윤관', '양규', '최영', '척준경', '신숭겸', '배현경', '박서'],
  /* v5.19 — 4막 남중 호족은 id를 nanjung으로 옮겼다(1막 남만 맹획군과 이름이 겹치지 않게) */
  nanjung: ['남중 호족', '옹개', '고정', '주포'],
  /* v5.19 — 190년 1막 형남 한현군(장사) · 남만 맹획군(운남) */
  hanxuan: ['한현', '황충', '위연', '양령', '형도영', '진응', '포륭'],
  meng_huo: ['맹획', '축융', '올돌골', '목록대왕', '타사대왕', '아회남', '대래동주', '맹우', '동도나', '금환삼결', '망아장'],
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
  gunwoong: { names: ['군주', '패왕', '천하대장군', '천하제왕'], at: [10, 20, 30], skills: ['gomu', 'jihwi'] },
  gibi: { names: ['기병', '철기병', '용기병', '천하기병'], at: [10, 20, 30], skills: ['bangpae', 'yeongyeok'] },
  gunggi: { names: ['궁기', '백발신궁', '천궁', '신궁'], at: [10, 20, 30], skills: ['gwanse', 'jipsajung'] },
  changbyung: { names: ['창병', '철창병', '신창병', '창성'], at: [10, 20, 30], skills: ['bangpae', 'gwanse'] },
  geombyung: { names: ['검병', '무쌍검병', '검성', '검신'], at: [10, 20, 30], skills: ['yeongyeok', 'bangpae'] },
  sanjeok: { names: ['산적', '산왕', '산신', '산의왕'], at: [10, 20, 30], skills: ['yaseup', 'sangang'] },
  sujeok: { names: ['수적', '해룡', '수신', '해왕'], at: [10, 20, 30], skills: ['paedo', 'suryu'] },
  chaeksa: { names: ['책사', '군사', '신책', '천하책사'], at: [10, 20, 30], skills: ['pungsu', 'hwayeom'] },
  pungsusa: { names: ['풍수사', '천기사', '신풍수', '천지풍수'], at: [10, 20, 30], skills: ['gomu', 'pungsu'] },
  dosa: { names: ['도사', '신선', '천사', '천존'], at: [10, 20, 30], skills: ['yosul', 'hwayeom'] },
  gungsu: { names: ['궁수', '명궁', '신궁', '천궁수'], at: [10, 20, 30], skills: ['gwanse', 'jipsajung'] },
  mudoga: { names: ['무도가', '무신', '천하무적', '무성'], at: [10, 20, 30], skills: ['cheonmu', 'yeongyeok'] },
  yasubyung: { names: ['야수병', '백호대', '용호대', '만수대'], at: [10, 20, 30], skills: ['sangang', 'yaseup'] },
  muhui: { names: ['무희', '천무희', '무신희', '선녀'], at: [10, 20, 30], skills: ['hwanmu', 'yuhok'] },
  pocha: { names: ['포차', '천자포', '신기포', '천하포'], at: [10, 20, 30], skills: ['yeonpo', 'pogyeok'] },
  balseokcha: { names: ['발석차', '신기전', '천뢰차', '천지차'], at: [10, 20, 30], skills: ['hwayeom', 'tuseok'] },
  yeonnobyung: { names: ['연노병', '신연노', '천하연노', '연노신병'], at: [10, 20, 30], skills: ['gwanse', 'yeonno'] },
  deunggabyung: { names: ['등갑병', '무쌍등갑', '등갑신병', '철벽'], at: [10, 20, 30], skills: ['yeongyeok', 'bangpae'] },
  gunakdae: { names: ['군악대', '천군악', '군신악', '천하군악'], at: [10, 20, 30], skills: ['jihwi', 'gomu'] },
};
/* v5.17 — 전직 3회: Lv.10 → Lv.20 → Lv.30(풀레벨). 단계 0(기본)~3(최종) */
SK.PROMO_AT = [10, 20, 30];
SK.tierForLv = function (lv) {
  let t = 0;
  SK.PROMO_AT.forEach((n) => { if (lv >= n) t += 1; });
  return Math.min(3, t);
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
/* v5.17 — 그 레벨에서 전직하는가 (10/20/30). battle.js·app.js의 전직 연출이 쓴다 */
SK.isPromoLv = function (lv) { return SK.PROMO_AT.indexOf(Number(lv)) >= 0; };
SK.promoStageOf = function (lv) { return SK.tierForLv(lv); };
SK.troopForNamed = function (lv, tier) {
  tier = tier == null ? SK.tierForLv(lv) : tier;
  return Math.min(4800, Math.round(1600 + lv * 120 + tier * 380));
};
/* v5.2 — 부대 병력 상한. 기본 군주 10,000 / 일반 장수 5,000.
   장군 직책(rank)을 얻으면 일반 10,000 / 군주 20,000까지 열린다. */
SK.TROOP_CAP = {
  base: { lord: 10000, named: 5000 },
  general: { lord: 10000, named: 5000 },
};
/* v5.8 — 관직(교위 → 중랑장 → 진동·진서장군 → 대장군).
   군주 명성이 오르면 휘하 장수에게 내리고, 출진 병력 상한이 5,000 → 10,000까지 열린다.
   봉급은 조금 오르고(달마다 금 지출), 임명할 때 충성이 오른다. */
/* v5.11 — 문관·무관 24단계 관직.
   · 무관(mil) 12단계: 출진 병력이 500씩 촘촘히 늘고 공격·방어가 조금씩 오른다
   · 문관(civ) 12단계: 출진 병력도 늘지만 내정(정치)·책략(지력) 보정이 붙는다
   · 모두 군주 명성 + 장수 개인 공훈치로 서임한다 (예전 key는 그대로 살려 옛 저장과 호환) */
SK.OFFICES = [
  { key: 'none', name: '관직 없음', branch: 'none', fame: 0, merit: 0, add: 0, salary: 0, loyal: 0 },
  /* ── 무관 ── */
  { key: 'dowi', name: '도위', branch: 'mil', fame: 150, merit: 45, add: 500, atk: 1, def: 1, salary: 12, loyal: 2 },
  { key: 'gyowi', name: '교위', branch: 'mil', fame: 300, merit: 80, add: 1000, atk: 2, def: 1, salary: 25, loyal: 3 },
  { key: 'bijanggun', name: '비장군', branch: 'mil', fame: 550, merit: 130, add: 1500, atk: 3, def: 2, salary: 34, loyal: 3 },
  { key: 'pyeonjanggun', name: '편장군', branch: 'mil', fame: 800, merit: 185, add: 2000, atk: 4, def: 2, salary: 42, loyal: 4 },
  { key: 'jungnangjang', name: '중랑장', branch: 'mil', fame: 1100, merit: 250, add: 2500, atk: 5, def: 3, salary: 50, loyal: 4 },
  { key: 'yangmujanggun', name: '양무장군', branch: 'mil', fame: 1500, merit: 330, add: 3000, atk: 6, def: 4, salary: 60, loyal: 4 },
  { key: 'toyeokjanggun', name: '토역장군', branch: 'mil', fame: 1900, merit: 420, add: 3500, atk: 7, def: 5, salary: 70, loyal: 5 },
  { key: 'jindong', name: '진동장군', branch: 'mil', fame: 2400, merit: 520, add: 4000, atk: 8, def: 5, salary: 80, loyal: 5 },
  { key: 'jinseo', name: '진서장군', branch: 'mil', fame: 3000, merit: 660, add: 4500, atk: 9, def: 6, salary: 90, loyal: 5 },
  { key: 'geogijanggun', name: '거기장군', branch: 'mil', fame: 3800, merit: 820, add: 5000, atk: 11, def: 7, salary: 105, loyal: 6 },
  { key: 'pyogijanggun', name: '표기장군', branch: 'mil', fame: 4700, merit: 1050, add: 5500, atk: 13, def: 8, salary: 120, loyal: 6 },
  { key: 'daegeneral', name: '대장군', branch: 'mil', fame: 6000, merit: 1400, add: 6000, atk: 16, def: 10, salary: 140, loyal: 7 },
  /* ── 문관 ── */
  { key: 'jubu', name: '주부', branch: 'civ', fame: 150, merit: 40, add: 500, pol: 2, intel: 1, salary: 12, loyal: 2 },
  { key: 'hyeonryeong', name: '현령', branch: 'civ', fame: 320, merit: 75, add: 500, pol: 3, intel: 1, salary: 22, loyal: 2 },
  { key: 'byeolga', name: '별가', branch: 'civ', fame: 520, merit: 120, add: 1000, pol: 4, intel: 2, salary: 32, loyal: 3 },
  { key: 'taesu', name: '태수', branch: 'civ', fame: 780, merit: 175, add: 1500, pol: 5, intel: 2, salary: 44, loyal: 3 },
  { key: 'eosajungseung', name: '어사중승', branch: 'civ', fame: 1100, merit: 240, add: 2000, pol: 6, intel: 3, salary: 54, loyal: 4 },
  { key: 'jungseoryeong', name: '중서령', branch: 'civ', fame: 1500, merit: 320, add: 2500, pol: 8, intel: 4, salary: 64, loyal: 4 },
  { key: 'sangseoryeong', name: '상서령', branch: 'civ', fame: 1950, merit: 415, add: 3000, pol: 9, intel: 5, salary: 74, loyal: 4 },
  { key: 'taesang', name: '태상', branch: 'civ', fame: 2450, merit: 520, add: 3500, pol: 11, intel: 5, salary: 84, loyal: 5 },
  { key: 'sagong', name: '사공', branch: 'civ', fame: 3050, merit: 650, add: 4000, pol: 12, intel: 6, salary: 95, loyal: 5 },
  { key: 'sado', name: '사도', branch: 'civ', fame: 3750, merit: 800, add: 4500, pol: 14, intel: 7, salary: 108, loyal: 6 },
  { key: 'taebu', name: '태부', branch: 'civ', fame: 4600, merit: 980, add: 5000, pol: 16, intel: 8, salary: 122, loyal: 6 },
  { key: 'seungsang', name: '승상', branch: 'civ', fame: 6000, merit: 1300, add: 6000, pol: 20, intel: 10, salary: 145, loyal: 7 },
];
/* v5.11 — 관직 분과별 다음 자리 (무관은 무관끼리, 문관은 문관끼리 오른다) */
SK.officeBranchOf = function (hero) { return SK.officeOf(hero).branch || 'none'; };
SK.officePol = function (hero) { return SK.officeOf(hero).pol || 0; };
SK.officeIntel = function (hero) { return SK.officeOf(hero).intel || 0; };
SK.officeWarBonus = function (hero) {
  const o = SK.officeOf(hero);
  return { atk: (o.atk || 0) / 100, def: (o.def || 0) / 100 };
};
SK.OFFICE_BY_KEY = {};
SK.OFFICES.forEach((o) => { SK.OFFICE_BY_KEY[o.key] = o; });
SK.officeOf = function (hero) {
  if (!hero || !hero.appoint) return SK.OFFICES[0];
  return SK.OFFICE_BY_KEY[hero.appoint] || SK.OFFICES[0];
};
SK.officeAdd = function (hero) { return SK.officeOf(hero).add || 0; };
SK.officeSalary = function (hero) { return SK.officeOf(hero).salary || 0; };
/* v5.10 — 장수 개인 공훈치(merit) */
SK.meritOf = function (hero) { return Math.max(0, Math.round(Number(hero && hero.merit) || 0)); };
SK.nextOfficeOf = function (hero) {
  const cur = SK.officeOf(hero);
  const branch = cur.branch || 'mil';
  const pool = SK.OFFICES.filter((o) => o.branch === branch);
  const i = pool.findIndex((o) => o.key === cur.key);
  return i >= 0 && i + 1 < pool.length ? pool[i + 1] : null;
};
/* v5.11 — 그 분과에서 지금 명성·공훈으로 열리는 가장 높은 자리 */
SK.bestOfficeFor = function (hero, branch, fame) {
  const pool = SK.OFFICES.filter((o) => o.branch === branch);
  let best = null;
  const merit = SK.meritOf(hero);
  pool.forEach((o) => { if ((fame || 0) >= o.fame && merit >= (o.merit || 0)) best = o; });
  return best;
};
SK.troopCapOf = function (hero, st) {
  const state = st || SK.state || {};
  const lordName = ((state.factions || {})[state.playerFaction || ''] || {}).lord || '';
  const isLord = !!(hero && lordName && hero.name === lordName) || (hero && hero.rank === '군주');
  /* v5.17 — 상한은 단순하다. 일반 장수 5,000 / 군주 10,000.
     관직·공적 보너스가 붙어도 이 상한을 넘지 않는다 (그 보너스는 공·방·봉급으로 간다). */
  return isLord ? SK.TROOP_CAP.base.lord : SK.TROOP_CAP.base.named;
};
SK.nextPromo = function (lv) {
  for (let i = 0; i < SK.PROMO_AT.length; i++) if (lv < SK.PROMO_AT[i]) return SK.PROMO_AT[i];
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
      SK.PROMO[cls] = SK.PROMO[cls] || { names: [], at: [10, 20, 30], skills: [] };
      SK.PROMO[cls].names = [C.name].concat(d.promotions.slice(0, 3));
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
        /* v5.14 — '배' 수치를 먼저 보고, 없으면 가장 큰 %를 위력으로 쓴다.
           (예전엔 문자열의 첫 %를 집어 "회피율 +15%"만 있는 기술이 15% 위력이 됐다)
           2연타는 한 대 92%, 3연타는 한 대 72%까지만. */
        const multM = eff.match(/([0-9]+(?:\.[0-9]+)?)\s*배/);
        const pcts = (eff.match(/(\d{2,3})\s*%/g) || []).map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));
        let pw = multM ? Number(multM[1]) : (pcts.length ? Math.max.apply(null, pcts) / 100 : 0);
        if (!(pw >= 0.9)) pw = 1.2 + (Number(sk.mp) || 10) * 0.022;   // 수치가 없는 효과는 MP 비례
        const hitM = eff.match(/([23])\s*(?:회\s*)?(?:연속|연사|연타|타격)/);
        const hits = hitM ? Math.min(3, Number(hitM[1])) : 1;
        if (hits > 1) pw = Math.min(pw, hits >= 3 ? 0.72 : 0.92);
        /* 연타는 한 대 위력이 낮으므로 하한도 낮춘다 (합 184% / 216% 상한) */
        def.power = Math.min(2.3, Math.max(hits >= 3 ? 0.6 : (hits === 2 ? 0.8 : 1.0), pw));
        if (hits > 1) def.hits = hits;
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
   · faction.cities 이름을 80거점으로 별칭 변환
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
    });
    const capId = own[f.capital] || SK.cityIdByName(f.capital) || ids[0] || null;
    if (capId && ids.indexOf(capId) < 0) ids.unshift(capId);
    /* v5.2 — 시나리오별 시작 거점 상한.
       190년처럼 세력이 많을 때는 대지주(동탁·유표 등)만 여러 성을 들고,
       나머지는 수도 한 곳에서 시작해 빈 땅을 밀고 나가는 재미를 살린다. */
    let keep = ids;
    const cap = (sc.cityCaps && Number(sc.cityCaps[f.id])) || Number(sc.defaultCityCap) || 0;
    if (cap > 0 && ids.length > cap) {
      keep = ids.filter((id) => id === capId).concat(ids.filter((id) => id !== capId)).slice(0, cap);
    }
    keep.forEach((id) => { (claims[id] = claims[id] || []).push(f.id); });
    ids.length = 0;
    keep.forEach((id) => ids.push(id));
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
  /* v5.2 — 시작 장수 명부를 여기서 확정한다.
     시나리오 카드에 뜨는 《장수 N》은 이 목록의 길이 그대로이고,
     인게임 시작 장수도 같은 목록으로 만들어지므로 숫자가 100% 맞는다. */
  SK.padStartRosters(facs, Number(sc.year) || 190);
  return { factions: facs, owner };
};

/* 인물 → 세력 인물 풀(위·촉·오·군웅·한국) */
SK.genPoolGroupOf = function (g) {
  if (!g) return '군웅';
  if (SK.generalGroup(g) === '한국' || g.faction === '한국') return '한국';
  const f = g.faction || '';
  if (f === '위' || f === '촉' || f === '오') return f;
  return '군웅';
};

/* ───────────── 시작 장수 명부 확정 (v5.2) ─────────────
   · 군주 + 시나리오 장수 + 초기 식구(EARLY_RETAINERS)를 세력별로 겹치지 않게 배정
   · 6명에 못 미치는 소세력은 같은 인물 풀에서 채워 초반 내정 5칸을 굴릴 수 있게 한다
   · 결과는 f.startGenerals 에 남겨 두고, 시나리오 카드·인게임이 같은 수를 쓴다 */
SK.START_ROSTER_MIN = 6;
/* v5.15 — 1막(190) 시작 인원. 동탁·원소·손견·유표는 12명,
   유비는 유비·관우·장비·손건·미축·간옹·미방 7명 그대로, 나머지 세력은 최소 6명. */
/* v5.19 — 1막 드림팀: 유비 12명(제갈량·조운·강유·방통·서서 포함), 조조 14명(곽가·허저·우금·서황 포함),
   손견 12명(손책·손권·주유·여몽 포함), 동탁 12명, 유표 12명. */
SK.ACT1_ROSTER_TARGET = { dongzhuo: 12, yuanshao: 12, caocao: 14, sunjian: 12, liubiao: 12, liubei: 12 };
SK.padStartRosters = function (facs, year) {
  if (!facs || !SK.GENERALS.length) return facs;
  const MIN = SK.START_ROSTER_MIN;
  const TARGET = Number(year) === 190 ? (SK.ACT1_ROSTER_TARGET || {}) : {};
  const used = new Set();
  const order = Object.keys(facs).filter((k) => k !== 'neutral');
  const rankOf = { S: 0, A: 1, B: 2, C: 3 };
  /* v5.20 — 군주급은 소세력 보충 풀에서 뺀다.
     (왕랑군에 사섭, 엄백호군에 공손도가 끌려오던 문제 — 남의 나라 군주가 남의 성에 눌러앉는 꼴) */
  const lordNames = new Set(order.map((fid) => SK.normName(facs[fid].lord)).filter(Boolean));
  order.forEach((fid) => {
    const f = facs[fid];
    const names = [];
    const cap = TARGET[fid] || 14;
    const add = (n, first, locked) => {
      const nm = SK.normName(n);
      const g = nm ? SK.GEN_BY_NAME[nm] : null;
      if (!g) return;
      if (!first && used.has(g.id)) return;
      /* v5.19 — 시나리오가 f.generals에 이름을 적어 둔 장수는 '그 세력의 주인공'으로 본다.
         등장 연도(debutYear) 때문에 190년 드림팀(제갈량·강유 등)이 빠지지 않게 연도 검사를 건너뛴다. */
      if (!locked && !SK.debutOk(g, year)) return;
      if (names.indexOf(nm) >= 0) return;
      names.push(nm); used.add(g.id);
    };
    if (f.lord) add(f.lord, true, true);
    (f.generals || []).forEach((n) => { if (names.length < cap) add(n, false, true); });
    ((SK.EARLY_RETAINERS || {})[fid] || []).forEach((n) => { if (names.length < cap) add(n); });
    f._start = names;
    f._want = TARGET[fid] || MIN;
  });
  /* 모자란 세력을 먼저 채운다 (부족분이 큰 순서) */
  order.slice().sort((a, b) => (facs[b]._want - facs[b]._start.length) - (facs[a]._want - facs[a]._start.length)).forEach((fid) => {
    const f = facs[fid];
    const names = f._start;
    const want = f._want || MIN;
    if (names.length >= want) return;
    const grp = SK.factionGroup(fid);
    const pool = SK.GENERALS.filter((g) => SK.genPoolGroupOf(g) === grp && !used.has(g.id)
      && g.job !== '군주' && !lordNames.has(g.name))
      .sort((a, b) => {
        const da = Number(a.debutYear) || 0, db = Number(b.debutYear) || 0;
        const ta = da <= year ? 0 : da <= year + 15 ? 1 : 2;
        const tb = db <= year ? 0 : db <= year + 15 ? 1 : 2;
        if (ta !== tb) return ta - tb;
        const ra = rankOf[a.tier] == null ? 3 : rankOf[a.tier];
        const rb = rankOf[b.tier] == null ? 3 : rankOf[b.tier];
        if (ra !== rb) return ra - rb;
        return (b.war + b.intel) - (a.war + a.intel);
      });
    for (let i = 0; i < pool.length && names.length < want; i++) {
      names.push(pool[i].name); used.add(pool[i].id);
    }
  });
  order.forEach((fid) => {
    const f = facs[fid];
    f.startGenerals = (f._start || []).slice();
    f.generals = f.startGenerals.slice();
    delete f._start;
    delete f._want;
  });
  return facs;
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
/* v5.8 — 오늘 새로 그린 A급 18인·한국 12인 초상/SD를 기존 상위 100인 목록 위에 얹는다.
   같은 이름이 있으면 새 그림(초상·SD)이 이긴다. */
SK.addTopArt = function (manifest) {
  if (!manifest) return;
  Object.keys(manifest).forEach((name) => {
    const a = manifest[name];
    if (!a) return;
    const cur = SK.ART[name] || {};
    SK.ART[name] = Object.assign({}, cur, a, {
      portrait: a.portrait || cur.portrait || null,
      unit: a.unit || cur.unit || null,
    });
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
  SK.GENERALS.forEach((g) => { g.hanja = ''; g.origTier = g.tier; });
  SK.rebalanceTiers();
};

/* v4.1 — 등급을 능력치 피라미드로 다시 세운다 (S 5% · A 15% · B 35% · C 45%)
   원본 데이터는 A급이 49%, C급이 0%여서 주점에 고급 인재만 넘치고 있었다.
   능력치 순위로 다시 나누면 이름난 장수는 그대로 S·A로 남고, 이름 없는 장수는 B·C로 내려간다. */
SK.TIER_MIX = [{ t: 'S', to: 0.05 }, { t: 'A', to: 0.20 }, { t: 'B', to: 0.55 }, { t: 'C', to: 1.0 }];
/* v5.11 — 등급 재산정은 '최고 스탯 + 상위 2개 스탯'으로.
   예전에는 통·무·지만 평균이라 여포(무력 100)처럼 한 능력이 빼어난 명장이 B로,
   서희·순욱·곽가(지력 90+)가 C로 강등됐다. 정치·매력까지 포함해 다시 매긴다. */
SK.genScore = function (g) {
  const st = [g.war || 0, g.intel || 0, g.leadership || 0, g.politics || 0, g.charm || 0]
    .map((v) => Number(v) || 0).sort((a, b) => b - a);
  const top = st[0], second = st[1] || 0, third = st[2] || 0;
  return top * 0.62 + second * 0.26 + third * 0.12;
};
SK.topStatOf = function (g) {
  return Math.max(g.war || 0, g.intel || 0, g.leadership || 0, g.politics || 0, g.charm || 0);
};
/* v5.13 — 시공초월 올스타: 한국 3국 군주는 등급 재산정에서도 S로 고정한다.
   (근초고왕 정치 92처럼 한 끗 차이로 A로 내려가면 '3국 S급 올스타' 컨셉이 무너진다) */
SK.TIER_LOCK = { '광개토대왕': 'S', '근초고왕': 'S', '진흥왕': 'S' };
SK.rebalanceTiers = function () {
  /* 원본 등급을 남겨 둔다 — 최고 스탯 95+ 또는 원본 S는 S/A로 보호한다 */
  SK.GENERALS.forEach((g) => { if (!g.origTier) g.origTier = g.tier; });
  const list = SK.GENERALS.slice().sort((a, b) => SK.genScore(b) - SK.genScore(a) || String(a.name).localeCompare(String(b.name)));
  const n = list.length;
  if (!n) return;
  list.forEach((g, i) => {
    if (SK.TIER_LOCK[g.name]) { g.tier = SK.TIER_LOCK[g.name]; return; }
    const p = (i + 0.5) / n;
    let t = (SK.TIER_MIX.find((m) => p <= m.to) || SK.TIER_MIX[SK.TIER_MIX.length - 1]).t;
    const top = SK.topStatOf(g);
    const orig = g.origTier || g.tier;
    /* 최고 스탯 97+는 S, 93+는 최소 A, 원본 S는 최소 A로 보호한다.
       (여포 무력 100 · 서희/순욱/곽가 지력 94+ · 유비/장비 매력·무력 98+) */
    if (top >= 97) t = 'S';
    else if (top >= 93) t = t === 'C' ? 'A' : (t === 'B' ? 'A' : t);
    else if (orig === 'S') t = t === 'C' ? 'B' : (t === 'B' ? 'A' : t);
    else if (orig === 'A' && t === 'C') t = 'B';
    g.tier = t;
  });
  SK.TIER_COUNT = SK.GENERALS.reduce((a, g) => { a[g.tier] = (a[g.tier] || 0) + 1; return a; }, {});
};
/* v5.11 — 나이. 태어난 해가 없으면 0, 미래 장수·초월 영웅은 최소 18세로 보정한다.
   (구수왕 -27세·제갈량 9세 같은 비정상 나이를 화면에서 없앤다) */
SK.ageOf = function (g, year) {
  if (!g) return 0;
  const by = Number(g.birthYear);
  if (!by) return 0;
  const yr = Number(year || (SK.state && SK.state.eraYear) || 190);
  const age = yr - by + 1;
  return Math.max(18, age);
};

/* ───────────── v5.12 꼬마영웅 개그 한마디 (data/hero_gags.json) ─────────────
   장수 상세창에서 딱딱한 열전 대신 보여 주는 한줄 대사.
   이름 전용(named) → 병종(classes) → 등급(tiers) → 기본 순서로 고른다. */
SK.GAGS = { named: {}, classes: {}, tiers: {} };
SK.setGags = function (d) {
  const src = d || {};
  SK.GAGS = {
    named: src.named || {},
    classes: src.classes || {},
    tiers: src.tiers || {},
  };
};
SK.gagOf = function (name, cls, tier) {
  const G = SK.GAGS || {};
  const named = (G.named || {})[name];
  if (named) return named;
  /* 이름이 정해진 대사가 없으면 병종 특성 대사에서 이름별로 늘 같은 줄을 고른다 */
  const pick = (arr) => {
    if (!arr || !arr.length) return '';
    let h = 0;
    const s = String(name || '') + String(cls || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return arr[h % arr.length];
  };
  const byCls = pick((G.classes || {})[cls]);
  if (byCls) return byCls;
  const byTier = pick((G.tiers || {})[tier || 'default']) || pick((G.tiers || {}).default);
  return byTier || '오늘도 성 지키느라 바쁘다 바빠!';
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
      /* v5.19 — 정치·매력·등장 연도를 지정할 수 있게 한다 (서서처럼 정치·매력이 중요한 인물) */
      politics: e.pol != null ? e.pol : Math.round((e.war + e.intel + e.lead) / 3),
      charm: e.charm != null ? e.charm : 62, skill: e.skill || '',
      birthYear: e.birth || null,
      debutYear: e.debut || null,
      region: SK.KOREAN_EXTRA.indexOf(name) >= 0 ? '한국' : '중국',
    };
    SK.GENERALS.push(g);
    SK.GEN_BY_ID[g.id] = g;
    SK.GEN_BY_NAME[g.name] = g;
  });
};
SK.genClass = function (g) { return (g && SK.JOB_CLASS[g.job]) || 'geombyung'; };
SK.genLv = function (g) { return (g && SK.TIER_LV[g.tier]) || 3; };
/* v5.8 — 처형한 장수는 다시 세상에 나오지 않는다 (주점·탐색·등장 명부에서 뺀다) */
SK.isDead = function (genId, name) {
  const s = SK.state;
  if (!s || !s.deadGens) return false;
  if (genId != null && s.deadGens[String(genId)]) return true;
  if (name && s.deadNames && s.deadNames[name]) return true;
  return false;
};
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
    charm: t.statBonus.charm || 0, politics: t.statBonus.politics || 0, move: t.statBonus.move || 0,
    rng: t.statBonus.rng || 0 };
};
SK.equipBonus = function (h) {
  const out = { war: 0, intel: 0, leadership: 0, charm: 0, politics: 0, move: 0, rng: 0 };
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
/* ───────────── 78 거점 (data/cities.json) ───────────── */
SK.CITY = {};
SK.CITY_LIST = [];
SK.ROADS = [];
SK.SEALANES = [];
SK.JFAC = { '위': 'caocao', '촉': 'liubei', '오': 'sunquan', '군웅': 'neutral', '한국': 'goguryeo' };
SK.TYPE_KEY = { '대도시': 'capital', '중도시': 'mid', '소도시': 'town', '관문': 'pass', '요새': 'fortress' };

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
  /* v5.0.1 — 지도에서 겹치던 관통 직통선을 없앤다 (장사→남해·강주, 무위→한중) */
  ['changsha', 'nanhai'], ['changsha', 'gangju'], ['wuwei', 'hanzhong']];
/* 섬 — 육로는 섬 안에서만 난다. 바깥으로는 배(SEALANES)로만 오간다. */
SK.ISLAND_GROUP = { tamna: '제주', taipei: '대만', tainan: '대만' };
/* v5.6 — 막다른 종점이어도 되는 거점 (하서회랑 서쪽 끝 무위) */
SK.END_CITIES = ['wuwei'];
/* 반드시 있어야 하는 육로 — 끊기면 남중·서량·강동이 고립된다 */
SK.MUST_ROADS = [['hanzhong', 'yangping'], ['hanzhong', 'changan'], ['changan', 'anding'],
  ['yongan', 'jiangling'], ['jiangxia', 'hefei'], ['jiangxia', 'runan'],
  ['shishang', 'jianan'], ['shanhaiguan', 'liaodong'], ['liaodong', 'ansiseong'],
  ['taipei', 'tainan'], ['xinye', 'xiangyang'], ['shangyong', 'hanzhong'], ['wuling', 'changsha'],
  ['nanhai', 'guiyang'], ['nanhai', 'gangju'], ['gangju', 'guiyang'],
  ['jianning', 'yunnan'], ['lushui', 'chengdu'], ['lushui', 'jianning']];

/* v5.0.3 — 역참로를 손으로 고정한다 (v5.5: 80거점).
   거리만 보는 자동 최소신장트리는 호로관↔낙양·업↔남피 같은 뻔한 길을 놓치고,
   삭방↔함곡관·산해관↔남피처럼 바다를 가로지르거나 지도를 관통하는 선을 만들었다.
   순서: 서량 → 관중 → 하북·병주·유주 → 중원 → 서주·회남 → 형주 → 익주·남만 → 강동 → 요동·한국 */
SK.ROAD_EDGES = [
  /* 서량 — 하서회랑과 농서 */
  ['wuwei', 'geumseong'], ['geumseong', 'tianshui'], ['tianshui', 'anding'], ['tianshui', 'yangping'],
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
  ['hanzhong', 'yangping'], ['hanzhong', 'shangyong'], ['yangping', 'jiange'], ['jiange', 'zhidong'],
  ['zhidong', 'chengdu'], ['chengdu', 'yongan'], ['chengdu', 'lushui'],
  ['yongan', 'jiangling'], ['lushui', 'jianning'], ['jianning', 'yunnan'],
  ['jianning', 'yongchang'], ['yunnan', 'yongchang'],
  /* 강동 */
  ['hefei', 'jianye'], ['hefei', 'jiangxia'], ['runan', 'jiangxia'],
  ['jianye', 'wu'], ['wu', 'shishang'], ['shishang', 'kuaiji'],
  ['shishang', 'jianan'], ['kuaiji', 'jianan'], ['nanhai', 'jianan'],
  /* 요동·한국 */
  ['liaodong', 'ansiseong'], ['ansiseong', 'guknaeseong'], ['guknaeseong', 'hamhung'],
  /* v5.5 — 북방 신규 거점: 국내성 북서 부여, 함흥 북동 옥저 */
  ['guknaeseong', 'buyeo'], ['buyeo', 'okjeo'], ['okjeo', 'hamhung'],
  ['hamhung', 'pyongyang'], ['pyongyang', 'gaeseong'], ['gaeseong', 'cheolwon'],
  ['gaeseong', 'hanseong'], ['cheolwon', 'wonju'], ['hanseong', 'wonju'],
  ['hanseong', 'ungjin'], ['wonju', 'cheongju'],
  ['wonju', 'daegwallyeong'], ['daegwallyeong', 'gyeongju'], ['cheongju', 'ungjin'],
  ['cheongju', 'wansan'], ['ungjin', 'gwangju'], ['wansan', 'gwangju'],
  ['gyeongju', 'busan'], ['busan', 'wansan'],
  /* 섬 — 같은 섬 안에서만 */
  ['taipei', 'tainan'],
];

SK.ROAD_VIA = {
  /* v5.6 — 80거점 확정 좌표(도안 A)에 맞춰 다시 잡았다. 예전 픽셀 꺾은점은 좌표 이동으로
     길이 성에서 떨어진 곳을 지나갔다. 지금은 바다를 스치는 구간 하나만 손으로 돌린다. */
  /* 웅진 → 광주: 서해안으로 부풀지 않게 안쪽(동쪽)으로 살짝 돌린다 */
  'ungjin|gwangju': [[1706, 500], [1712, 548]],
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
  // 1) 손으로 고정한 역참로 — 80거점의 실제 지리를 따른다
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
    ['shanhaiguan', 'beihai']];
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
   ‣ 관문이 양쪽을 잇는가 · 홀로 남은 거점이 있는가 · 80거점이 한 덩어리인가
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
  /* v5.6 — 지형 기준이 바뀌었다. 배경이 도안 A 그림(map_bg.webp)이므로, 그림에서 뽑은
     육지 마스크(js/mapmask.js · SK.landAt)로 바다를 판정한다. 마스크가 없으면 옛 폴리곤으로. */
  const useMask = typeof SK.landAt === 'function' && !!SK.MAPMASK;
  const onLand = useMask ? (x, y) => SK.landAt(x, y)
    : (x, y) => (lctx && landPath ? lctx.isPointInPath(landPath, x, y) : true);
  const deg = {};
  const seaDeg = {};
  SK.CITY_LIST.forEach((c) => { deg[c.id] = 0; seaDeg[c.id] = 0; });
  SK.ROADS.forEach(([a, b]) => {
    deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1;
    const A = SK.CITY[a], B = SK.CITY[b];
    if (!A || !B) { out.push(`없는 거점 ${a}-${b}`); return; }
    /* 같은 섬 안의 길(타이베이—타이난)은 바다를 건너지 않는다 — 마스크의 섬 경계가
       그림보다 좁아도 문제 삼지 않는다 */
    const isl = SK.ISLAND_GROUP || {};
    if (isl[a] && isl[a] === isl[b]) return;
    const path = SK.roadPoints(a, b);
    let wet = 0, total = 0;
    /* 해안 성은 성 자체가 물가에 걸쳐 있다 — 성에서 18px 안쪽은 세지 않는다 */
    const ax0 = A.u * MAPW, ay0 = A.v * MAPH, bx0 = B.u * MAPW, by0 = B.v * MAPH;
    const nearEnd = (x, y) => Math.hypot(x - ax0, y - ay0) < 18 || Math.hypot(x - bx0, y - by0) < 18;
    for (let i = 0; i < path.length; i++) {
      if (!nearEnd(path[i][0], path[i][1])) {
        total++;
        if (!onLand(path[i][0], path[i][1])) wet++;
      }
      if (i < path.length - 1) {
        for (let k = 1; k < 6; k++) {
          const t = k / 6;
          const px = path[i][0] + (path[i + 1][0] - path[i][0]) * t;
          const py = path[i][1] + (path[i + 1][1] - path[i][1]) * t;
          if (nearEnd(px, py)) continue;
          total++;
          if (!onLand(px, py)) wet++;
        }
      }
    }
    if (wet / Math.max(1, total) > 0.06) out.push(`바다 횡단 ${A.name}-${B.name} (${wet}/${total})`);
  });
  SK.SEALANES.forEach(([a, b]) => {
    seaDeg[a] = (seaDeg[a] || 0) + 1; seaDeg[b] = (seaDeg[b] || 0) + 1;
  });
  const island = SK.ISLAND_GROUP || {};
  /* v5.6 — 서량 막다른 서쪽 끝(무위)은 하서회랑 단일 루트의 종점이라 길이 하나인 게 정상이다 */
  const terminus = SK.END_CITIES || ['wuwei'];
  SK.CITY_LIST.forEach((c) => {
    if (island[c.id]) return;
    if (deg[c.id] + seaDeg[c.id] === 0) out.push(`홀로 남은 거점 ${c.name}`);
    else if (deg[c.id] < 2 && seaDeg[c.id] === 0 && terminus.indexOf(c.id) < 0) out.push(`길이 하나뿐 ${c.name} (${deg[c.id]})`);
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

/* ───────────── 전장 지도 (요격·소도시 24×24 · 중도시 28×28 · 대도시 32×32) ─────────────
   v5.17 — 《조조전》 스케일 대형 전장.
   · 격자 크기는 전장마다 다르고(B.cols·B.rows), 지도는 코드로 그린다.
   · 모든 지도에 아군 본진 'A' · 적 총대장 본진 'E' · 마을 'V'를 심는다(각 1×1).
   · 배경 그림(assets/maps/v2/battle_*.webp)은 칸 수에 맞춰 늘려 깔고,
     성벽(C)·성문(G) 칸은 그림의 성벽 줄과 같은 자리에 놓는다.
   · SK.MAP_META[key] = { cols, rows, allyBase, enemyBase, villages } — battle.js가 읽는다. */
SK.MAP_META = {};
SK.MAP_SIZES = { field: 24, siege: 24, siege2: 28, siege3: 32 };

const MAP_SITE_CHARS = 'DPRSBF';       // 본진·마을을 놓을 수 있는 땅
function mkGrid(cols, rows, ch) { return Array.from({ length: rows }, () => Array(cols).fill(ch || 'P')); }
function g2s(g) { return g.map((r) => r.join('')); }
function inG(g, y, x) { return y >= 0 && y < g.length && x >= 0 && x < g[0].length; }
function setT(g, y, x, ch) { if (inG(g, y, x)) g[y][x] = ch; }
function paint(g, list, ch) { list.forEach(([y, x]) => setT(g, y, x, ch)); }
function fillRect(g, y0, y1, x0, x1, ch) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setT(g, y, x, ch); }
function hline(g, y, x0, x1, ch) { for (let x = x0; x <= x1; x++) setT(g, y, x, ch); }
function vline(g, x, y0, y1, ch) { for (let y = y0; y <= y1; y++) setT(g, y, x, ch); }
/* 숲·바위 덩어리 — 가운데를 기준으로 삐죽한 원을 찍는다 */
function blob(g, cx, cy, r, ch, seed) {
  const s = seed || (cx * 7 + cy * 13);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      const wob = 0.55 + 0.45 * Math.sin((dx + dy + s) * 1.7);
      if (d <= r * (0.62 + wob * 0.42)) setT(g, cy + dy, cx + dx, ch);
    }
  }
}
/* 본진·마을 자리 — 원하는 칸이 벽·물·궁궐이면 가까운 땅으로 옮긴다 */
function placeSite(g, ch, x, y, occupied) {
  const ok = (yy, xx) => inG(g, yy, xx) && MAP_SITE_CHARS.indexOf(g[yy][xx]) >= 0
    && !(occupied && occupied.some((o) => o.x === xx && o.y === yy));
  for (let r = 0; r < 7; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const yy = y + dy, xx = x + dx;
        if (ok(yy, xx)) { g[yy][xx] = ch; return { x: xx, y: yy }; }
      }
    }
  }
  return null;
}
/* 지도 하나를 마무리 — 본진·마을을 심고 메타를 남긴다 */
function finishMap(key, g, spec) {
  const cols = g[0].length, rows = g.length;
  const cx = Math.floor(cols / 2);
  const sites = [];
  const ally = placeSite(g, 'A', spec.ally ? spec.ally[0] : cx, spec.ally ? spec.ally[1] : rows - 2, sites);
  if (ally) sites.push(Object.assign({ type: 'allyHQ' }, ally));
  const enemy = placeSite(g, 'E', spec.enemy ? spec.enemy[0] : cx, spec.enemy ? spec.enemy[1] : 2, sites);
  if (enemy) sites.push(Object.assign({ type: 'enemyHQ' }, enemy));
  (spec.villages || []).forEach(([x, y]) => {
    const v = placeSite(g, 'V', x, y, sites);
    if (v) sites.push(Object.assign({ type: 'village' }, v));
  });
  const rowsOut = g2s(g);
  SK.MAPS[key] = rowsOut;
  SK.MAP_META[key] = { cols, rows, allyBase: ally, enemyBase: enemy,
    villages: sites.filter((s) => s.type === 'village') };
  return rowsOut;
}

/* ── 평야 요격전 ── (배경: 십자로와 네 모서리 숲) */
function plainMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  hline(g, 11, 0, n - 1, 'R'); hline(g, 12, 0, n - 1, 'R');
  blob(g, 2, 6, 2, 'F', 1); blob(g, 21, 6, 2, 'F', 2);
  blob(g, 2, 18, 2, 'F', 3); blob(g, 21, 18, 2, 'F', 4);
  blob(g, 1, 11, 1, 'M', 5); blob(g, 22, 12, 1, 'M', 6);
  paint(g, [[0, 0], [0, 1], [1, 0], [23, 23], [23, 22], [22, 23], [0, 23], [1, 23], [0, 22], [23, 0], [22, 0], [23, 1]], 'M');
  return finishMap('plain', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[6, 8], [17, 8], [cx, 16]] });
}

/* ── 도하전 ── (배경: 세로 길 + 가운데 강과 나무다리) */
function fordMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  fillRect(g, 10, 13, 0, n - 1, 'W');
  fillRect(g, 10, 13, cx - 1, cx, 'B');
  fillRect(g, 10, 13, 3, 4, 'S'); fillRect(g, 10, 13, 19, 20, 'S');
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  blob(g, 3, 4, 2, 'F', 11); blob(g, 20, 4, 2, 'F', 12);
  blob(g, 3, 19, 2, 'F', 13); blob(g, 20, 19, 2, 'F', 14);
  paint(g, [[0, 0], [0, 1], [1, 0], [23, 0], [22, 0], [23, 1], [0, 23], [0, 22], [1, 23], [23, 23], [22, 23], [23, 22]], 'M');
  return finishMap('ford', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[7, 6], [16, 6], [cx, 18]] });
}

/* ── 산전 ── (배경: 좌우 절벽 + 가운데 세로 길 + 강과 다리) */
function mountainMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'M');
  fillRect(g, 0, n - 1, 7, 16, 'P');
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  fillRect(g, 11, 12, 7, 16, 'W');
  fillRect(g, 11, 12, cx - 1, cx, 'B');
  setT(g, 11, 7, 'S'); setT(g, 12, 7, 'S'); setT(g, 11, 16, 'S'); setT(g, 12, 16, 'S');
  blob(g, 8, 4, 1, 'F', 21); blob(g, 15, 19, 1, 'F', 22);
  blob(g, 15, 4, 1, 'F', 23); blob(g, 8, 19, 1, 'F', 24);
  paint(g, [[0, 0], [0, 1], [1, 0], [23, 23], [23, 22], [22, 23]], 'F');
  return finishMap('mountain', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[9, 17], [14, 6], [cx, 8]] });
}

/* ── 밀림 매복전 ── (배경: 열린 풀밭 + 십자로 + 나무 덩어리) */
function forestMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  hline(g, 10, 0, n - 1, 'R'); hline(g, 11, 0, n - 1, 'R');
  [[6, 3], [17, 3], [6, 8], [18, 8], [6, 15], [17, 15], [5, 20], [18, 20]].forEach(([x, y], i) => blob(g, x, y, 2, 'F', 31 + i));
  blob(g, 1, 12, 1, 'M', 41); blob(g, 22, 12, 1, 'M', 42);
  return finishMap('forest', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[8, 6], [15, 17], [cx, 13]] });
}

/* ── 협곡 잔도전 ── (배경: 좌우 절벽 + 외길 + 가운데 급류) */
function gorgeMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'M');
  fillRect(g, 0, n - 1, 8, 15, 'P');
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  fillRect(g, 10, 11, 8, 15, 'W');
  fillRect(g, 10, 11, cx - 1, cx, 'B');
  setT(g, 10, 8, 'S'); setT(g, 11, 8, 'S'); setT(g, 10, 15, 'S'); setT(g, 11, 15, 'S');
  blob(g, 9, 5, 1, 'F', 41); blob(g, 14, 17, 1, 'F', 42);
  blob(g, 9, 18, 1, 'F', 43); blob(g, 14, 4, 1, 'F', 44);
  return finishMap('gorge', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[9, 7], [14, 16]] });
}

/* ── 야영 기습전 ── (배경: 위쪽 진영 흙바닥 + 아래쪽 풀밭 + 가운데 길) */
function campMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  fillRect(g, 1, 11, 1, n - 2, 'D');
  vline(g, cx - 1, 12, n - 1, 'R'); vline(g, cx, 12, n - 1, 'R');
  hline(g, 2, 1, n - 2, 'R'); hline(g, 10, 1, n - 2, 'R');
  /* 막사는 그림에만 두고 길을 막지 않는다 (천막 자리를 장애물로 만들면 그림과 어긋난다) */
  blob(g, 2, 14, 1, 'F', 51); blob(g, 21, 14, 1, 'F', 52);
  blob(g, 6, 18, 1, 'F', 53); blob(g, 17, 18, 1, 'F', 54);
  paint(g, [[0, 0], [0, 1], [1, 0], [23, 23], [23, 22], [22, 23], [0, 23], [1, 23], [0, 22], [23, 0], [22, 0], [23, 1]], 'M');
  return finishMap('camp', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[5, 6], [18, 6], [cx, 18]] });
}

/* ── 수전 ── (배경: 가운데 넓은 강 + 좌우 나무다리 + 양쪽 뭍길) */
function navalMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  fillRect(g, 9, 15, 0, n - 1, 'W');
  fillRect(g, 9, 15, 5, 6, 'B');
  fillRect(g, 9, 15, 17, 18, 'B');
  hline(g, 7, 0, n - 1, 'R'); hline(g, 16, 0, n - 1, 'R');
  vline(g, cx - 1, 0, 8, 'R'); vline(g, cx, 0, 8, 'R');
  vline(g, cx - 1, 16, n - 1, 'R'); vline(g, cx, 16, n - 1, 'R');
  blob(g, 1, 3, 1, 'F', 61); blob(g, 22, 3, 1, 'F', 62);
  blob(g, 1, 20, 1, 'F', 63); blob(g, 22, 20, 1, 'F', 64);
  paint(g, [[0, 0], [0, 1], [1, 0], [23, 23], [23, 22], [22, 23], [0, 23], [1, 23], [0, 22], [23, 0], [22, 0], [23, 1]], 'M');
  return finishMap('naval', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[8, 7], [15, 7], [cx, 20]] });
}

/* ── 요새전 ── (배경: 위쪽을 가로지르는 요새 성벽 + 아래로 난 길) */
function fortressMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  /* 요새 성벽 — 화면 끝까지, 아래 가운데 성문 */
  hline(g, 2, 0, n - 1, 'C');
  hline(g, 11, 0, n - 1, 'C');
  fillRect(g, 3, 10, 0, n - 1, 'D');
  vline(g, 0, 2, 11, 'C'); vline(g, n - 1, 2, 11, 'C');
  setT(g, 11, cx - 1, 'G'); setT(g, 11, cx, 'G');
  setT(g, 2, cx - 1, 'G'); setT(g, 2, cx, 'G');
  setT(g, 3, 3, 'T'); setT(g, 3, n - 4, 'T');
  fillRect(g, 4, 6, cx - 4, cx + 3, 'H');
  setT(g, 7, cx - 1, 'K'); setT(g, 7, cx, 'K');
  vline(g, cx - 1, 12, n - 1, 'R'); vline(g, cx, 12, n - 1, 'R');
  blob(g, 3, 16, 2, 'F', 71); blob(g, 20, 16, 2, 'F', 72);
  blob(g, 6, 21, 1, 'F', 73); blob(g, 17, 21, 1, 'F', 74);
  paint(g, [[0, 0], [0, 1], [1, 0], [23, 23], [23, 22], [22, 23], [0, 23], [1, 23], [0, 22]], 'M');
  return finishMap('fortress', g, { ally: [cx, n - 2], enemy: [cx, 8], villages: [[4, 14], [19, 14]] });
}

/* ── 공성전 — 겹성벽 (소 1중 24×24 · 중 2중 28×28 · 대 3중 32×32) ──
   성벽 줄(row)은 배경 그림(battle_siege*.webp)의 성벽과 같은 자리에 맞춘다.
   · 소도시: 아래쪽 성벽 1줄 + 중앙 정문, 그 위가 성 안(궁궐·천막)
   · 중도시: 1중(아래) · 2중(가운데) 두 줄 + 각각 중앙 정문
   · 대도시: 1중(아래) · 2중(가운데) + 맨 위 중앙의 네모(ㄷ자) 본성 성곽 —
     본성 성곽 안에 적 총대장 본진(1×1)이 있다.
   1단 문을 깨면 1·2단 사이 외성 마당, 2단 문을 깨면 2·3단 사이 마당,
   마지막 본성 문을 깨면 총대장 본진 앞까지 들어갈 수 있다. */
function siegeMap(rings) {
  rings = rings === 3 ? 3 : (rings === 2 ? 2 : 1);
  /* 성벽 두께는 그림과 맞춰 2칸. walls는 바깥(아래)부터가 아니라 안쪽→바깥 순서로 적는다. */
  /* v5.22 — 배경 그림(battle_siege*.webp)의 성벽 줄과 격자를 맞췄다.
     1중성은 그림 성벽이 한 칸 위에 있어 성벽 줄을 11·12 → 10·11로 올렸고,
     3중성 본성 성곽은 그림의 담장(아래 11·12줄, 좌우 3·28열)에 맞춰 넓혔다. */
  const cfg = rings === 3
    ? { size: 32, walls: [[17, 18], [24, 25]], box: { top: [1, 2], bottom: [11, 12], x0: 3, x1: 28 } }
    : (rings === 2
      ? { size: 28, walls: [[10, 11], [19, 20]], box: null }
      : { size: 24, walls: [[10, 11]], box: null });
  const n = cfg.size, cx = Math.floor(n / 2);
  const walls = cfg.walls;
  const outer = walls[walls.length - 1][1];
  const g = mkGrid(n, n, 'P');
  /* 성 안(바깥 성벽 위쪽)은 마당 */
  fillRect(g, 0, outer, 0, n - 1, 'D');
  const palEnd = Math.round(n * 0.13) + 1;
  let enemyBase;
  if (cfg.box) {
    /* 대도시 — 맨 위 중앙의 네모(ㄷ자) 본성 성곽. 안에 적 총대장 본진. */
    const b = cfg.box;
    fillRect(g, b.top[0], b.top[1], b.x0, b.x1, 'C');
    fillRect(g, b.bottom[0], b.bottom[1], b.x0, b.x1, 'C');
    vline(g, b.x0, b.top[0], b.bottom[1], 'C');
    vline(g, b.x1, b.top[0], b.bottom[1], 'C');
    b.bottom.forEach((gy) => { setT(g, gy, cx - 1, 'G'); setT(g, gy, cx, 'G'); });
    /* 본성 안 궁궐 — 문 앞까지 마당을 비워 둔다 */
    fillRect(g, b.top[1] + 1, b.top[1] + 4, cx - 4, cx + 3, 'H');
    setT(g, b.top[1] + 5, cx - 1, 'K'); setT(g, b.top[1] + 5, cx, 'K');
    enemyBase = [cx, b.bottom[0] - 2];
  } else {
    fillRect(g, 1, palEnd, cx - 4, cx + 3, 'H');
    setT(g, palEnd + 1, cx - 1, 'K'); setT(g, palEnd + 1, cx, 'K');
    enemyBase = [cx, palEnd + 3];
  }
  /* 1중·2중 성벽 — 화면 끝까지 가로지르고 중앙에 정문(2칸) */
  walls.forEach((rows) => {
    rows.forEach((y) => {
      hline(g, y, 0, n - 1, 'C');
      /* 성문은 성벽 두께만큼 뚫린 통로 — 문을 부수면 이 두 줄로 성 안에 들어간다 */
      setT(g, y, cx - 1, 'G'); setT(g, y, cx, 'G');
    });
  });
  /* 바깥 성문 앞길 */
  for (let y = outer + 1; y <= n - 1; y++) { setT(g, y, cx - 1, 'R'); setT(g, y, cx, 'R'); }
  hline(g, n - 3, cx - 5, cx + 4, 'R');
  /* 1중 성벽 뒤 좌·우 망루 — 수성 궁수·연노의 사거리 +1 거점 */
  setT(g, outer - 2, 3, 'T'); setT(g, outer - 2, n - 4, 'T');
  if (rings >= 2) { const mid = walls[0][0]; setT(g, mid - 2, 3, 'T'); setT(g, mid - 2, n - 4, 'T'); }
  /* 성 밖 숲·바위 */
  blob(g, 3, n - 4, 2, 'F', 81); blob(g, n - 4, n - 4, 2, 'F', 82);
  blob(g, 2, n - 8, 1, 'F', 83); blob(g, n - 3, n - 8, 1, 'F', 84);
  paint(g, [[0, 0], [0, 1], [1, 0], [n - 1, n - 1], [n - 1, n - 2], [n - 2, n - 1]], 'M');
  /* 마을 — 1단과 2단 성벽 사이 외성 마당 좌·우 (+ 소도시는 성 안 천막 자리) */
  const villages = [];
  if (rings >= 2) {
    const midY = Math.round((walls[0][1] + outer - 1) / 2) + 1;
    villages.push([4, midY], [n - 5, midY]);
    if (rings === 3) villages.push([cx - 7, walls[0][0] - 3]);
  } else {
    villages.push([3, 4], [n - 4, 4], [cx - 6, n - 5]);
  }
  const key = rings === 3 ? 'siege3' : (rings === 2 ? 'siege2' : 'siege');
  return finishMap(key, g, { ally: [cx, n - 2], enemy: enemyBase, villages });
}

SK.MAPS = {};
plainMap(); fordMap(); mountainMap(); forestMap(); gorgeMap(); campMap(); navalMap(); fortressMap();
/* 모든 전장 유형의 지도가 실제로 있는지 확인 (없으면 startBattle이 터진다) */
Object.keys(SK.BATTLE_TYPES || {}).forEach((k) => {
  const key = SK.BATTLE_TYPES[k].map;
  if (!SK.MAPS[key]) console.error('전장 지도 없음:', k, key);
});
siegeMap(1); siegeMap(2); siegeMap(3);
/* v5.15 — 옛 저장의 ambush 요격전은 밀림전으로 이어진다 */
SK.MAPS.ambush = SK.MAPS.forest;
SK.MAP_META.ambush = SK.MAP_META.forest;

/* v5.11 — 성 등급별 성벽 겹수 (소도시 1중 · 중도시 2중 · 대도시 3중) */
SK.siegeRingsOfLevel = function (lv) {
  const n = Number(lv) || 1;
  return n >= 4 ? 3 : (n === 3 ? 2 : 1);
};
/* 성 종류로 성벽 겹수 — 대도시 3중 · 중도시 2중 · 소도시/관문/요새 1중 */
SK.siegeRingsOfCity = function (city) {
  const t = city && city.type;
  return t === 'capital' ? 3 : (t === 'mid' ? 2 : 1);
};
SK.siegeMapKey = function (rings) { return rings >= 3 ? 'siege3' : (rings === 2 ? 'siege2' : 'siege'); };
/* v5.17 — 전장 격자 크기. 요격전·소도시 24 / 중도시 28 / 대도시 32 */
SK.battleSizeFor = function (type, rings) {
  if (type === 'siege' || type === 'defense') return rings >= 3 ? 32 : (rings === 2 ? 28 : 24);
  if (type === 'fortress') return 24;
  return 24;
};

/* 전장 유형 정보 */
SK.BATTLE_TYPES = {
  siege: { name: '공성전', hanja: '', map: 'siege', img: 'siege', desc: '성벽과 성문을 뚫어라',
    objective: '적 총대장을 쓰러뜨리거나 적 본진을 점령하라', skill: '수적과 궁기병이 성문 돌파에 유리합니다.' },
  fortress: { name: '요새전', hanja: '', map: 'fortress', img: 'fortress', desc: '목책과 요새를 함락하라',
    objective: '적 총대장을 쓰러뜨리거나 적 본진을 점령하라', skill: '보병과 책사가 성문 공략에 적합합니다.' },
  /* v5.3 — 행군 요격전 8종 (v5.15에서 밀림·협곡·야영 3종 추가) */
  plain: { name: '평야전', hanja: '', map: 'plain', img: 'plain', desc: '넓은 들에서 적 요격대와 맞붙는다',
    objective: '적 총대장을 쓰러뜨리거나 적 본진을 점령하라', skill: '기병·무도가는 평지에서 강합니다.' },
  ford: { name: '도하전', hanja: '', map: 'ford', img: 'ford', desc: '강 건널목을 사이에 두고 맞선다',
    objective: '여울과 다리를 건너 적 본진을 점령하라', skill: '수적은 물 위를 걸을 수 있습니다.' },
  mountain: { name: '산전', hanja: '', map: 'mountain', img: 'mountain', desc: '산길을 사이에 두고 맞선다',
    objective: '산허리 길을 따라 올라가 적 본진을 점령하라', skill: '산적·야수병은 산지에서 이동력이 +1입니다.' },
  forest: { name: '밀림 매복전', hanja: '', map: 'forest', img: 'forest', desc: '숲길에서 기습을 받았다',
    objective: '오솔길을 뚫고 적 본진을 점령하라', skill: '산적·야수병은 숲에서 강하고 야수병은 숲에서 이동력 6급입니다.' },
  gorge: { name: '협곡 잔도전', hanja: '', map: 'gorge', img: 'gorge', desc: '절벽 사이 외길에서 길목을 다툰다',
    objective: '잔도를 건너 적 본진을 점령하라', skill: '창병·등갑병이 길목을 막고 궁수·연노가 절벽 그늘에서 쏩니다.' },
  camp: { name: '야영 기습전', hanja: '', map: 'camp', img: 'camp', desc: '적 야영지를 기습했다',
    objective: '막사와 보급로를 끊고 적 본진을 점령하라', skill: '기병·야수병의 돌격이 막사 사이에서 힘을 냅니다.' },
  naval: { name: '수전', hanja: '', map: 'naval', img: 'naval', desc: '강을 건너 적선을 무찌르라',
    objective: '다리와 물길을 이용해 적 본진을 점령하라', skill: '수적은 물 위를 걸을 수 있습니다.' },
  /* v5.7 — 수성전: 아군이 성 안에서 적 침공군을 맞는다 (지도는 공성전을 뒤집어 쓴다) */
  defense: { name: '수성전', hanja: '', map: 'siege', img: 'siege', desc: '성을 지켜 적을 물리쳐라',
    objective: '성을 지켜라 — 적 총대장을 쓰러뜨리거나 적 본진을 점령하라', skill: '궁수·궁기병은 성벽 안에서 유리합니다.' },
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
  return { capital: 6400, mid: 5200, town: 4200, pass: 4800, fortress: 5000 }[type] || 4000;
};

/* 적 부대 구성 */
SK.enemyClassesFor = function (type, idx) {
  const tables = {
    siege:    ['geombyung', 'yeonnobyung', 'chaeksa', 'pocha', 'changbyung', 'balseokcha', 'deunggabyung', 'gungsu', 'gunggi', 'geombyung'],
    naval:    ['sujeok', 'sujeok', 'gungsu', 'sujeok', 'chaeksa', 'dosa', 'gunakdae', 'sujeok', 'sujeok', 'gungsu'],
    mountain: ['sanjeok', 'yasubyung', 'sanjeok', 'yeonnobyung', 'chaeksa', 'mudoga', 'sanjeok', 'yasubyung', 'gungsu', 'changbyung'],
    fortress: ['deunggabyung', 'gungsu', 'changbyung', 'pocha', 'chaeksa', 'balseokcha', 'yeonnobyung', 'geombyung', 'gunggi', 'mudoga'],
    defense:  ['geombyung', 'yeonnobyung', 'chaeksa', 'pocha', 'changbyung', 'balseokcha', 'deunggabyung', 'gungsu', 'gunggi', 'geombyung'],
    plain:    ['gibi', 'changbyung', 'geombyung', 'gungsu', 'mudoga', 'chaeksa', 'gibi', 'gungsu', 'gunggi', 'changbyung'],
    ford:     ['sujeok', 'gungsu', 'changbyung', 'sujeok', 'chaeksa', 'yeonnobyung', 'geombyung', 'sujeok', 'gungsu', 'sujeok'],
    ambush:   ['sanjeok', 'yasubyung', 'mudoga', 'sanjeok', 'gungsu', 'chaeksa', 'yasubyung', 'sanjeok', 'changbyung', 'gungsu'],
    forest:   ['sanjeok', 'yasubyung', 'yasubyung', 'sanjeok', 'mudoga', 'gungsu', 'chaeksa', 'sanjeok', 'gungsu', 'yasubyung'],
    gorge:    ['changbyung', 'deunggabyung', 'yeonnobyung', 'gungsu', 'changbyung', 'chaeksa', 'deunggabyung', 'balseokcha', 'gungsu', 'mudoga'],
    camp:     ['gibi', 'geombyung', 'changbyung', 'gungsu', 'yasubyung', 'chaeksa', 'mudoga', 'yeonnobyung', 'gungsu', 'gibi'],
  };
  const t = tables[type] || tables.siege;
  return t[idx % t.length];
};

/* 배치 좌표 [x, y] — 격자 크기에 맞춰 계산한다 (v5.17) */
SK.innerSlots = function (rings, cols) {
  const n = cols || (rings >= 3 ? 32 : (rings === 2 ? 28 : 24));
  return SK.enemySlots('siege', rings, n);
};
/* 성 안쪽(수비) 슬롯 — 적 본진을 감싸는 자리 */
function slotsAround(base, n, count) {
  const out = [];
  if (!base) return [[Math.floor(n / 2), Math.floor(n / 2)]];
  for (let dy = 0; dy <= 3; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = base.x + dx, y = base.y + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      out.push([x, y]);
    }
    for (let dx = -2; dx <= 2; dx++) {
      const x = base.x + dx, y = base.y - dy;
      if (y < 0 || x < 0 || x >= n || y >= n) continue;
      if (dy > 0) out.push([x, y]);
    }
  }
  return out.slice(0, count || 10);
}
SK.enemySlots = function (type, rings, cols) {
  const meta = SK.MAP_META[type === 'defense' ? 'siege' : (SK.BATTLE_TYPES[type] && SK.BATTLE_TYPES[type].img)] || null;
  const key = (type === 'siege' || type === 'defense') ? SK.siegeMapKey(rings || 1) : (SK.BATTLE_TYPES[type] ? SK.BATTLE_TYPES[type].map : 'siege');
  const m = SK.MAP_META[key] || meta;
  const n = cols || (m ? m.cols : 24);
  if (type === 'defense') {
    /* 수성전 — 침공군은 성 밖 길목에서 올라온다 */
    const outerRow = Math.max(3, (m ? m.rows : n) - 3);
    const out = [];
    for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) out.push([Math.floor(n / 2) + dx, outerRow - dy]);
    return out;
  }
  /* v5.17 — 공성 수비대는 성벽 마당마다 나눠 선다(바깥 마당 → 안쪽 → 본진).
     한 곳에 뭉치면 회복 거점과 겹쳐 전투가 끝나지 않는다. */
  if (type === 'siege' && m) {
    const rows2 = m.rows, cx2 = Math.floor(n / 2);
    const gateRows = [];
    (SK.MAPS[key] || []).forEach((line, y) => { if (line.indexOf('G') >= 0) gateRows.push(y); });
    gateRows.sort((a, b) => a - b);
    const bands = [];
    let y0 = 1;
    gateRows.forEach((gy) => { if (gy - 1 >= y0) bands.push([y0, gy - 1]); y0 = gy + 2; });
    if (y0 <= rows2 - 4) bands.push([y0, rows2 - 4]);
    const out = [];
    bands.slice().reverse().forEach((b) => {
      const yA = b[1] - 1, yB = Math.max(b[0], b[1] - 3);
      [[0, yA], [-2, yA], [2, yA], [0, yB], [-2, yB], [2, yB]].forEach(([dx, y]) => {
        out.push([clampX(cx2 + dx, n), y]);
      });
    });
    const near = slotsAround(m.enemyBase, n, 10);
    return out.concat(near).slice(0, 10);
  }
  return slotsAround(m && m.enemyBase, n, 10);
};
function clampX(x, n) { return Math.max(0, Math.min(n - 1, x)); }
SK.allySlots = function (type, rings, cols) {
  const key = (type === 'siege' || type === 'defense') ? SK.siegeMapKey(rings || 1) : (SK.BATTLE_TYPES[type] ? SK.BATTLE_TYPES[type].map : 'siege');
  const m = SK.MAP_META[key];
  const n = cols || (m ? m.cols : 24);
  if (type === 'defense') return slotsAround(m && m.enemyBase, n, 10);
  const base = m && m.allyBase ? m.allyBase : { x: Math.floor(n / 2), y: n - 2 };
  /* 아군은 본진 앞 두 줄에 폭 5칸으로 늘어선다 (10부대) */
  const out = [];
  [0, -1, -2].forEach((dy) => [-2, -1, 0, 1, 2].forEach((dx) => {
    const x = base.x + dx, y = base.y + dy;
    if (x >= 0 && y >= 0 && x < n && y < n) out.push([x, y]);
  }));
  return out;
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
/* v5.12 — 역사 연도 대신 '판을 시작한 해'부터 세는 N년차 표기를 쓴다.
   (190년·208년 같은 정사 연도를 화면에서 걷어 내고 시공초월 난투 톤으로) */
SK.dateLabel = function (year, monthIdx, st) {
  const s = st || SK.state;
  const y = Number(year) || 0;
  let base = s ? Number(s.eraBase || 0) : 0;
  if (!base && s && s.eraYear) base = Number(s.eraYear) - (Number(s.year || 1) - 1);
  const rel = base ? Math.max(1, y - base + 1) : 0;
  return rel ? `${rel}년차 ${SK.monthName(monthIdx)}` : `${y}년차 ${SK.monthName(monthIdx)}`;
};
