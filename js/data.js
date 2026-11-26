/* ══════════════════════════════════════════════════════════════
   삼국지-꼬마영웅 난타전 — 데이터 (지형·병과·장수·80거점·전장)
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
  /* ══ v6.0 — 전략 지형 7종 (조조전·영걸전식 지형 싸움) ══
     · U 고지대: 위에서 내려치는 피해 +15%, 원거리 사거리 +1, 방어 +25%,
       기병은 오르는 데 이동 3칸(진입 제한에 가깝다).
     · J 갈대밭: 화공·불·포격이 닿으면 그 칸이 연소한다(추가 화상·이동 방해).
     · Q 군량고 · Y 무기고: 점령하면 그 진영 전체가 이득을 본다 (battle.js objPhase).
     · N 목책: 성벽처럼 막히는 나무 울타리 (돌성벽 대신 쓰는 북방 진지).
     · L 부교: 물 위에 띄운 다리 (걸어서 건넌다).
     · O 포구: 물가의 나무 선착장 — 수군이 오르내리는 자리. */
  U: { name: '고지대', def: 0.25, cost: 2, icon: 'highland' },
  J: { name: '갈대밭', def: 0.05, cost: 2, icon: 'reeds' },
  Q: { name: '군량고', def: 0.15, cost: 1, icon: 'granary' },
  Y: { name: '무기고', def: 0.15, cost: 1, icon: 'armory' },
  N: { name: '목책', def: 0.30, cost: 99, icon: 'palisade' },
  L: { name: '부교', def: 0.00, cost: 1, icon: 'pontoon' },
  O: { name: '포구', def: 0.05, cost: 1, icon: 'port' },
};

/* ───────────── 병과 (16종) ───────────── */
SK.CLASSES = {
  gunwoong: { name: '군주', hanja: '君主', role: '지휘·균형', atk: 31, def: 21, mov: 4, rng: 1, agi: 60, mp: 46,
    skills: ['jihwi'], weapon: 'sword', desc: '군 전체를 이끄는 군주. 지휘로 아군을 강화한다.' },
  gibi: { name: '기병', hanja: '騎兵', role: '돌격·기동', atk: 34, def: 17, mov: 6, rng: 1, agi: 66, mp: 20,
    skills: ['dolpa'], weapon: 'spear', mount: true, desc: '이동 6의 돌격 병과. 평지·도로에서 공격 +15%, 보병에게 +18%, 산지 통행 불가.' },
  gunggi: { name: '궁기', hanja: '弓騎', role: '원거리·기동', atk: 29, def: 14, mov: 5, rng: 3, agi: 74, mp: 26,
    skills: ['jipsajung'], weapon: 'bow', mount: true, desc: '이동 5의 말탄 궁수. 3칸(◇ 마름모) 사격, 산이나 성 위에서 사거리 +1.' },
  changbyung: { name: '창병', hanja: '槍兵', role: '대기병·성문', atk: 28, def: 21, mov: 4, rng: 2, agi: 62, mp: 18,
    skills: ['gwantung'], weapon: 'spear', desc: '긴 창으로 2칸(◇ 마름모, 대각선 포함)을 찌른다. 기병·야수에게 +35%, 성문에서 방어 +20%.' },
  geombyung: { name: '검병', hanja: '劍兵', role: '방어·근접', atk: 30, def: 24, mov: 4, rng: 1, agi: 64, mp: 16,
    skills: ['bangpae'], weapon: 'sword', desc: '튼튼한 방패 검병. 궁병에게 +20%, 성문·마당에서 방어 +20%. 반격 피해 90%로 방패 맞다이에 강하다.' },
  sanjeok: { name: '산적', hanja: '山賊', role: '산지·숲 특화', atk: 34, def: 14, mov: 5, rng: 1, agi: 88, mp: 16,
    skills: ['sangang'], weapon: 'axe', desc: '산지·숲에서 공격 +30%. 산전의 주인공.' },
  sujeok: { name: '수적', hanja: '水賊', role: '수전 특화', atk: 31, def: 17, mov: 5, rng: 1, agi: 68, mp: 20,
    skills: ['suryu'], weapon: 'trident', desc: '물 위를 걸어 다닌다. 물에서 공격 +25%, 방어 +15%.' },
  chaeksa: { name: '책사', hanja: '策士', role: '책략', atk: 16, def: 11, mov: 4, rng: 3, agi: 57, mp: 60,
    skills: ['hwagye', 'pungsu'], weapon: 'fan', desc: '화계로 방어를 무시하는 피해, 풍수로 적 방어를 깎는다.' },
  pungsusa: { name: '풍수사', hanja: '風水師', role: '회복·보조', atk: 15, def: 12, mov: 4, rng: 3, agi: 58, mp: 70,
    skills: ['sobogeup', 'daebogeup', 'gomu', 'pungsu'], weapon: 'staff', desc: '보급으로 아군을 살리고 고무로 공격을 올린다.' },
  dosa: { name: '도사', hanja: '道士', role: '저주·회복', atk: 18, def: 12, mov: 4, rng: 3, agi: 58, mp: 64,
    skills: ['yosul', 'sobogeup'], weapon: 'staff', desc: '요술로 적의 공격을 약화시키고 부상병을 회복한다.' },
  gungsu: { name: '궁수', hanja: '弓手', role: '원거리', atk: 25, def: 13, mov: 4, rng: 3, agi: 74, minRng: 2, mp: 16,
    skills: ['jipsajung'], weapon: 'bow', desc: '2칸 밖에서 3칸(◇ 마름모)까지 일방적으로 사격. 기병·책략계에 +18%, 창병에 +20%. 산·성 위에서 사거리 +1.' },
  mudoga: { name: '무도가', hanja: '武道家', role: '연격·기동', atk: 33, def: 15, mov: 5, rng: 1, agi: 90, mp: 20,
    skills: ['yeongyeok'], weapon: 'fist', desc: '맨몸의 연격으로 두 번 때린다. 평지에서 공격 +10%, 궁병에게 +20%로 파고든다.' },
  yasubyung: { name: '야수병', hanja: '野獸兵', role: '숲·산 추격', atk: 36, def: 16, mov: 5, rng: 1, agi: 85, mp: 18,
    skills: ['yaseup'], weapon: 'claw', desc: '호랑이 부대. 보병에게 +18%, 숲·산지에서 공격 +20%, 숲·산에서는 이동력 +1(6급)에 진입 비용 1.' },
  muhui: { name: '무희', hanja: '舞姬', role: '유혹·교란', atk: 20, def: 10, mov: 5, rng: 2, agi: 62, mp: 48,
    skills: ['yuhok'], weapon: 'ribbon', desc: '춤으로 적의 공격을 크게 떨어뜨린다. 사거리 2(◇ 마름모).' },
  yeonnobyung: { name: '연노병', hanja: '連弩兵', role: '연사·원거리', atk: 27, def: 15, mov: 3, rng: 4, agi: 72, minRng: 2, mp: 18,
    skills: ['yeonno'], weapon: 'crossbow', desc: '연발 쇠뇌로 2~4칸(◇ 마름모)을 두 번 쏜다. 기병·책략계에 +18%, 창병에 +20%. 느리지만 화력이 뛰어나다.' },
  deunggabyung: { name: '등갑병', hanja: '藤甲兵', role: '철벽 방어', atk: 28, def: 31, mov: 3, rng: 1, agi: 40, mp: 12,
    skills: ['bangpae'], weapon: 'sword', desc: '등나무 갑옷의 중장 보병. 궁병에게 +20%, 느리지만 좀처럼 뚫리지 않는다.' },
  gunakdae: { name: '군악대', hanja: '軍樂隊', role: '사기·지원', atk: 12, def: 12, mov: 4, rng: 2, agi: 58, mp: 60,
    skills: ['gomu', 'jihwi'], weapon: 'drum', desc: '북과 나팔로 아군의 사기를 올린다. 직접 싸움은 약하다.' },
  pocha: { name: '포차', hanja: '砲車', role: '공성 병기', atk: 46, def: 26, mov: 2, rng: 5, agi: 38, minRng: 2, mp: 10,
    skills: ['pogyeok'], weapon: 'ram', siege: true, desc: '2~5칸(◇ 마름모) 사거리. 성문·성벽에 2배 피해. 붙으면 못 쏘고 이동이 느리다.' },
  balseokcha: { name: '발석차', hanja: '發石車', role: '투석 병기', atk: 56, def: 18, mov: 1, rng: 7, agi: 36, minRng: 3, mp: 10,
    skills: ['tuseok'], weapon: 'catapult', siege: true, desc: '3~7칸(◇ 마름모) 먼 곳을 범위로 때리는 투석기. 성문 공략의 결정타.' },
};

/* ───────────── v5.86 — 민첩(agi)·운(매력) 숨은 스탯 ─────────────
   사용자 확정 규칙 (battle.js 의 v5.86 블록이 이 값을 읽는다)
   · 민첩(agi) = 병과 기본값(위 표의 agi) + 약한 무력 보정 Math.round(((무력||60) − 60) × 0.1).
     **이동력(mov)과는 아무 관계가 없다** — agi 를 mov 에 더하거나 빼지 말 것.
   · 민첩은 일반 물리 공격의 명중·회피에만 쓰인다. 책략·필살기는 언제나 100% 명중.
     기본 명중 93% + (공격자 agi − 방어자 agi) × 0.25% (60%~99%)
     총 회피율 상한은 40%(0.40) 고정 — 병과·장수·보물 회피를 모두 더한 값에 건다.
   · 운 = 매력(charm). 상태이상 저항 max(0,(매력−60)×0.5)% (최대 +20%),
     치명타 +max(0,(매력−60)×0.08)%p (최대 +3.2%p).
   · 병과 숨은 스탯(회피·치명·치명피해·반격·받는피해·책략·상태저항)의 기본값은 아래 표 하나다.
     관리자 모드(?admin=1)에서만 병과·장수 값이 바뀌고, 일반 주소에서는 이 기본값 그대로다. */
SK.CLASS_HIDDEN_DEFAULT = {
  /* % 단위(bonus). critDmgPct 는 기본 치명 배율 1.55 에 더하는 %p, tacticPct 는 100%가 기준 */
  evaPct: 0, critPct: 0, critDmgPct: 0, cntPct: 0, dmgRedPct: 0, tacticPct: 100, statusResPct: 0,
};
/* 관리자 모드가 고친 장수 숨은 스탯 — 일반 주소(?v=106)에서는 언제나 빈 객체다 */
SK.HIDDEN_GEN = SK.HIDDEN_GEN || {};
SK.classHiddenOf = function (cls) {
  const C = (cls && SK.CLASSES[cls]) || {};
  const D = SK.CLASS_HIDDEN_DEFAULT;
  const n = function (v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; };
  return {
    agi: n(C.agi, 60), evaPct: n(C.evaPct, D.evaPct), critPct: n(C.critPct, D.critPct),
    critDmgPct: n(C.critDmgPct, D.critDmgPct), cntPct: n(C.cntPct, D.cntPct),
    dmgRedPct: n(C.dmgRedPct, D.dmgRedPct), tacticPct: n(C.tacticPct, D.tacticPct),
    statusResPct: n(C.statusResPct, D.statusResPct),
  };
};
SK.genHiddenOf = function (genId) {
  if (genId == null || !SK.HIDDEN_GEN) return null;
  return SK.HIDDEN_GEN[genId] || SK.HIDDEN_GEN[String(genId)] || null;
};

/* ───────────── v5.59 — 최대 MP 배율 ─────────────
   v5.49에서 책략(기술)에 반격이 없는 대신 모든 부대의 최대 MP를 절반(0.5)으로 줄였다.
   그러자 평타가 약한 문관 계열(책사·도사·풍수사)이 핵심 책략을 한두 번 쓰고 바로 말라,
   기력 회복(+8/턴)을 기다리며 서 있게 됐다. 이 세 병과(와 상위 전직 — 전직은 이름만
   바뀌고 cls는 그대로다)만 0.65로 살짝 올려 책략을 한두 번 더 쓸 수 있게 한다.
   예: 책사 Lv.1 60 → 39 · 도사 64 → 42 · 풍수사 70 → 46 · 예전엔 30·32·35.
   나머지 병과는 0.5 그대로다. app.js maxMpOf 와 battle.js maxMpBase 가 이 표를 함께 쓴다. */
/* ───────────── v5.81 — 병과 고유 패시브 (개편된 4스킬과 짝을 이룬다) ─────────────
   · 무도가(자객형): 기본 치명 +10% · 회피 +10%
   · 야수병(자객형): 숲·산지에서 공격할 때 치명 +15%
   · 무희·군악대: 전장에 서 있는 동안 아군 전체에 거는 오라 (battle.js classAuraPhase) */
SK.CLASS_PASSIVE = {
  mudoga: { crit: 0.10, eva: 0.10 },
  yasubyung: { ambushCrit: 0.15 },
  muhui: { aura: { eva: 0.08, crit: 0.05 } },
  gunakdae: { aura: { atk: 0.05, def: 0.05 }, morale: 3 },
};
SK.classPassiveOf = function (cls) { return (cls && SK.CLASS_PASSIVE[cls]) || null; };

SK.MP_SCALE = 0.5;
SK.MP_SCALE_BY_CLASS = { chaeksa: 0.65, dosa: 0.65, pungsusa: 0.65 };
SK.mpScaleOf = function (cls) {
  const v = SK.MP_SCALE_BY_CLASS[cls];
  return v == null ? SK.MP_SCALE : v;
};

/* ───────────── 책략 ─────────────
   v5.14 — 사거리·범위는 전부 마름모(맨해튼) 거리 기준이다. 대각선 1칸 = 거리 2.
   위력 예산: MP 8~9 ≈ 140%, MP 10 ≈ 150%, MP 12 ≈ 175~185%, MP 14 ≈ 195%, MP 16+ ≈ 210~230%.
   2연타는 한 대 92%(합 184%), 3연타는 한 대 72%(합 216%)를 넘기지 않는다. */
SK.SKILLS = {
  jihwi: { name: '지휘', hanja: '指揮', mp: 12, kind: 'buffAreaAllies', radius: 2, atk: 0.2, turns: 3,
    desc: '주변 2칸(마름모) 아군 전원 공격 +20% (3턴) · 사기 +6' },
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
    desc: '2칸 안 아군 1명 공격 +30% (3턴) · 사기 +6' },
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
  if ((cls === 'gungsu' || cls === 'gunggi') && (ch === 'M' || ch === 'G' || ch === 'U')) { rng = 1; label = '고지 사격 +1'; }
  if ((cls === 'pocha' || cls === 'balseokcha') && (ch === 'G' || ch === 'D')) { def = 0.15; label = '공성 진지'; }
  if (cls === 'sanjeok' && ch === 'U') { atk = 0.15; label = '고지 습격 +15%'; }
  if (cls === 'yasubyung' && ch === 'U') { atk = 0.10; label = '고지 추격 +10%'; }
  if ((cls === 'chaeksa' || cls === 'dosa') && ch === 'J') { def = 0.10; label = '갈대 은신 +10%'; }
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

/* 세력 색 — 지도·UI에서 한눈에 갈리도록 고대비로 고정한다 (v4.2 → v5.72 재배치)
   위=군청 · 촉=에메랄드 · 오=크림슨 · 여포=자보라 · 원소=금 · 동탁=숯보라
   고구려=청록 · 백제=자주 · 신라=하늘청록 · 고려=보라 · 조선=흑홍
   v5.72 — 28세력 판도(190년)와 이후 판(200·208·220)의 실제 소유 성을 기준으로,
   길·해로로 맞닿거나 영토가 스치는(거리 300px 이내) 세력끼리 색이 겹치던 곳을 다시 잡았다.
   맞닿은 쌍의 CIELAB 색거리(ΔE) 목표: 150px 이내 45 · 200px 이내 42 · 260px 이내 36 · 그 밖 30.
   예) 원술 분홍 ↔ 장로 자홍 10 → 55 · 조조 파랑 ↔ 고구려 인디고 33 → 98(청록) ·
       조조 파랑 ↔ 엄백호 파랑 30 → 70(자주) · 동탁 숯회 ↔ 공융 회청 9 → 42
   큰 줄기만 옮겼다: 고구려 인디고→짙은 청록, 엄백호 파랑→자주, 공융 회청→먹청록,
   동탁 숯회색→숯보라, 유장·도겸·공손강 갈색 계열은 밝기를 갈라 서로 구분되게. */
SK.FACTION_COLOR = {
  caocao: '#1E4FD8', cao_wei_pre: '#1E4FD8', cao_wei: '#1E4FD8',
  liubei: '#1B8A4B', shu_han: '#1B8A4B',
  sunjian: '#CF2A2A', sunquan: '#CF2A2A', sun_wu: '#CF2A2A',
  lubu: '#8A1296', lvbu: '#8A1296',
  yuanshao: '#CBA016', dongzhuo: '#312B51',
  goguryeo: '#175040', baekje: '#75256A', silla: '#1F9FB8', goryeo: '#5A20B4', joseon: '#6E1212',
  yuanshu: '#D65A8A', liubiao: '#0E849F', liuzong: '#0E7490', liuyan: '#6B3A12', liuzhang: '#6B3A12',
  mateng: '#D98324', hansui: '#4F7A1F', gongsunzan: '#A3153F', taoqian: '#753328',
  zhanglu: '#B723C5', gongsunkang: '#7B4A28', shi_xie: '#A16207', shexie: '#A16207',
  zhangjiao: '#A08A12',
  hanxuan: '#A21CAF', meng_huo: '#C2410C', menghuo: '#C2410C', nanjung: '#8A5A2A',
  kongrong: '#25605C', liuyao: '#16B0D0', yanbaihu: '#B0156E', wanglang: '#5B7D1E',
  neutral: '#8B8777',
  /* 아직 판에 없는 세력 — 뒤에 붙을 시나리오를 위해 색만 미리 잡아 둔다 */
  zhangxiu: '#C08A4A', zhangyang: '#C026D3', xiongnu: '#3F3F46', wuhuan: '#E0A56B',
  xianbei: '#D14D6E', shanyue: '#4C8C5A', qiang: '#7A5230', gongsundu: '#7B4A28',
};

/* v5.78 — 마지막 성을 잃어 나라가 사라진 옛 군주는 재야로 풀려나 주점에 앉을 수 있다.
   (아직 살아 있는 세력의 군주만 '신하로 삼을 수 없는 사람'으로 막는다) */
SK.isExLord = function (name) {
  const s = SK.state;
  const n = SK.normName ? SK.normName(name) : String(name || '').trim();
  if (!n || !s || !Array.isArray(s.exLords)) return false;
  return s.exLords.indexOf(n) >= 0;
};

/* ══════════════════════════════════════════════════════════════
   v5.78 — 세력 멸망 코믹 배너의 군주 마지막 한마디 (28세력 + 뒤 판 세력)
   세력 id 로 먼저 찾고, 없으면 세력 이름(○○군)·군주 이름으로 찾는다.
   ══════════════════════════════════════════════════════════════ */
SK.FALL_LINES = {
  dongzhuo: '여포한테 아들딱지 떼라고 해!! 망해써!! 😭',
  yuanshao: '명문 사세삼공의 체면이 이게 뭐야… 내 옥새 어디 갔어!! 😭',
  caocao: '내가 천하를 저버릴지언정… 아니 오늘은 내가 당했네?! 관우야 잠깐만!! 😭',
  cao_wei: '내가 천하를 저버릴지언정… 아니 오늘은 내가 당했네?! 관우야 잠깐만!! 😭',
  cao_wei_pre: '내가 천하를 저버릴지언정… 아니 오늘은 내가 당했네?! 관우야 잠깐만!! 😭',
  liubei: '아우들아… 짚신 다시 깎으러 가자… 도원결의 시즌2 해야겠네 ㅠㅠ 😭',
  shu_han: '승상아, 우리 촉한이 이렇게… 아니 이건 다 내 탓이오 ㅠㅠ 😭',
  sunjian: '강동의 호랑이가 여기서… 손책아, 아비 대신 먼저 도망쳐라!! 😭',
  sunquan: '강동 호랑이가 고양이 되버렸잖여… 형님들, 나 뗏목 좀 빌려줘요!! 😭',
  sun_wu: '강동 호랑이가 고양이 되버렸잖여… 형님들, 나 뗏목 좀 빌려줘요!! 😭',
  yuanshu: '전국옥새까지 들었는데 왜 천하가 날 안 알아줘?! 꿀물 한 사발만… 😭',
  liubiao: '형주 8백 리가 한순간에 쪼그라들었네… 채모 이 녀석, 술상부터 치워!! 😭',
  hanxuan: '형주 남부 사군 태수가 하루아침에 백수라니… 황충, 활 좀 내려놔!! 😭',
  liuyan: '촉땅 주인이라 불렸는데… 유장이 녀석, 내 성이 왜 네 성이 됐냐!! 😭',
  liuzhang: '촉땅이 넓다더니 왜 내 발 디딜 틈이 없어?! 법정, 형님 좀 불러줘!! 😭',
  liuzong: '아버지 땅을 지키지도 못하고… 항복이면 좀 더 좋은 대우라도 해 줘요!! 😭',
  meng_huo: '일곱 번 잡혔으면 이번엔 여덟 번으로 쳐줘!! 코끼리 어디 갔어!! 😭',
  shi_xie: '교주 남쪽 끝까지 밀려날 줄이야… 야자수 그늘 밑에서 좀 쉬자 😭',
  mateng: '서량 기마대가 한순간에 뚝딱?! 마초야, 넌 먼저 도망쳐라!! 😭',
  gongsunzan: '백마의군 출격 준비 끝났는데… 왜 성문이 열려 있는 거야?! 😭',
  gongsunkang: '요동 끝까지 와 놓고 이렇게 됩니까… 공손도야, 배 좀 띄워라!! 😭',
  taoqian: '서주 태수 자리 그냥 넘길 걸 그랬나… 이젠 편히 쉬고 싶구먼 😭',
  lvbu: '방천화극이 무거워서 못 휘두른 게 아니야!! 바람이 불어서 그런 거라고!! 😭',
  hansui: '마등 형님, 나 먼저 갈게… 서량 들판에서 다시 만나자!! 😭',
  kongrong: '공자의 후예도 성벽 앞에서는 어쩔 수 없구나… 책가방 챙겨라!! 😭',
  liuyao: '양주 자사 자리가 이렇게 순삭될 일인가… 배부터 띄워라!! 😭',
  yanbaihu: '스스로 강동의 덕왕이라 했는데… 덕이 너무 넘쳐서 성이 무너졌나?! 😭',
  wanglang: '회계 땅이 이렇게 차가울 줄이야… 상소문 쓸 힘도 없네!! 😭',
  zhanglu: '오두미도 신도들아, 기도빨이 다했나 봐… 부적 한 장 더 붙여!! 😭',
  zhangjiao: '창천이 이미 죽었다더니… 왜 내 황건이 먼저 쓰러지는 거야?! 😭',
  goguryeo: '고구려 기병의 혼은 꺼지지 않는다!! 오늘은 잠시 숨 고르기다!! 😭',
  baekje: '한성 백제의 풍류가 여기까지라니… 다음엔 더 단단히 쌓는다!! 😭',
  silla: '신라 화랑의 기백은 죽지 않아!! 다음 판에 꼭 설욕한다!! 😭',
  goryeo: '훈요십조도 못 지키고 이 꼴이라니… 후삼국 다시 시작한다!! 😭',
  joseon: '활 잘 쏘는 걸로는 나라를 못 지키는구나… 정도전, 책이나 챙겨라!! 😭',
  nanjung: '남중 호족들아, 덩굴 타고 산속으로 후퇴해!! 😭',
  /* 아직 판에 없는 세력 — 뒤에 붙을 시나리오를 위해 미리 문장만 잡아 둔다 */
  zhangxiu: '북지의 창끝도 오늘은 쉬어 간다… 조조 형님, 한 번만 봐주소!! 😭',
  xiongnu: '초원의 바람이 차갑구나… 다음 계절엔 더 멀리 달린다!! 😭',
  shanyue: '산골짜기 깊숙이 숨었는데 어떻게 찾아왔어?! 😭',
};
/* 세력 이름(○○군)·군주 이름으로도 찾을 수 있게 별칭을 둔다 */
SK.FALL_LINE_ALIAS = {
  '동탁': 'dongzhuo', '원소': 'yuanshao', '조조': 'caocao', '유비': 'liubei', '손견': 'sunjian',
  '손권': 'sunquan', '원술': 'yuanshu', '유표': 'liubiao', '한현': 'hanxuan', '유언': 'liuyan',
  '유장': 'liuzhang', '유종': 'liuzong', '맹획': 'meng_huo', '사섭': 'shi_xie', '마등': 'mateng',
  '공손찬': 'gongsunzan', '공손강': 'gongsunkang', '도겸': 'taoqian', '여포': 'lvbu',
  '한수': 'hansui', '공융': 'kongrong', '유요': 'liuyao', '엄백호': 'yanbaihu',
  '왕랑': 'wanglang', '장로': 'zhanglu', '장각': 'zhangjiao', '광개토대왕': 'goguryeo',
  '근초고왕': 'baekje', '진흥왕': 'silla', '왕건': 'goryeo', '이성계': 'joseon',
};
SK.fallLineOf = function (fid, shortName, lord) {
  /* v6.4b — 코믹 개그 멸망 한마디를 일정 확률로 섞는다 (js/comedy_v64b.js) */
  const com = (typeof window !== 'undefined' && window.SK_COMEDY && window.SK_COMEDY.fall) || [];
  if (com.length && Math.random() < 0.4) {
    return com[Math.floor(Math.random() * com.length)];
  }
  const line = SK.FALL_LINES[fid]
    || SK.FALL_LINES[SK.FALL_LINE_ALIAS[String(shortName || '').replace(/군$/, '')]]
    || SK.FALL_LINES[SK.FALL_LINE_ALIAS[lord]];
  if (line) return line;
  const nm = String(shortName || '').replace(/군$/, '') || '적군';
  return `${nm}의 꿈이 여기서 멈추다니… 다음엔 꼭 다시 일어난다!! 😭`;
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
    /* v5.78 — 사라진 세력의 옛 군주는 더 이상 '군주'로 막지 않는다 */
    if (n && !SK.isExLord(n)) out.add(n);
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
  if (SK.isExLord(g.name)) return false;   // v5.78 — 멸망한 세력의 옛 군주는 재야가 될 수 있다
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
  /* v5.43 — 서서(595)·한현(596)은 data/generals.json으로 옮겼다 (촉·군웅 소속, 전용 초상·SD 유지) */
  '우보': { job: '기병', tier: 'B', war: 72, intel: 38, lead: 60, birth: 155, debut: 175 },
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
/* v5.62 — 병종이 가진 책략 4종 전부(미해금 포함). 화면 미리보기에 쓴다.
   시전·AI 판단은 여전히 SK.skillsFor(해금된 것만)를 쓴다. */
SK.allSkillsOf = function (cls) {
  const C = SK.CLASSES[cls];
  if (!C) return [];
  return (C.skills || []).filter((k) => SK.SKILLS[k]);
};
/* v5.62 — 그 레벨에 아직 잠긴 책략이면 해금 레벨을, 이미 열렸으면 0을 돌려준다 */
SK.skillLockLv = function (key, lv) {
  const sk = SK.SKILLS[key];
  if (!sk) return 0;
  const need = Number(sk.unlockLv) || 1;
  return (Number(lv) || 1) >= need ? 0 : need;
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
   v5.87b — 이 값은 '천장'이다. 실제 상한은 기본 2,000에서 레벨·관직을 채워 올린다
   (SK.troopCapOf / SK.troopCapParts). */
SK.TROOP_CAP = {
  base: { lord: 10000, named: 5000 },
  general: { lord: 10000, named: 5000 },
};
/* v5.41 — 출진 편성의 기본값을 한 곳에 둔다. 장수 상세 화면의 '출진 병력' 안내가
   실제 편성 기본값(2,000 / 최소 1,000)과 달랐던 문제를 막는다. */
SK.DEPLOY_MIN = 1000;
SK.DEPLOY_BASE = 2000;
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
/* ══ v5.87b — 지휘 병력 상한: 기본 2,000 → 레벨·관직을 채워 5,000 (군주 10,000) ══
   v5.17의 '일반 5,000 · 군주 10,000 고정'을 풀었다. 이제 출진 상한은
     기본 2,000 + 레벨 보너스(Lv당 +50 · Lv.21에서 +1,000 상한)
              + 관직 보너스(도위 +400 → 대장군 +2,000)
              + 군주만: 명성 보너스(명성/12 · 최대 +5,000)
   로 계산해 일반 장수는 5,000, 군주는 10,000에서 멈춘다.
   처음 만난 Lv.1 무관 장수는 2,000명 — 곧 출진 기본값(SK.DEPLOY_BASE)과 같다.
   수치는 상세 창·관직 창이 모두 SK.troopCapParts() 하나를 읽어 적는다. */
SK.TROOP_CAP_START = 2000;
SK.TROOP_CAP_LV_STEP = 50;
SK.TROOP_CAP_LV_MAX = 1000;
SK.TROOP_CAP_FAME_MAX = 5000;
/* 관직 분과 안에서의 자리 순서(0=첫 자리) → 추가 병력. 마지막 값이 상한(2,000)이다. */
SK.OFFICE_TROOP_BONUS = [400, 400, 800, 800, 1200, 1200, 1600, 1600, 2000, 2000, 2000, 2000];
SK.lvTroopBonus = function (lv) {
  return Math.min(SK.TROOP_CAP_LV_MAX, Math.max(0, Math.round(Number(lv) || 1) - 1) * SK.TROOP_CAP_LV_STEP);
};
SK.officeTroopBonusOf = function (hero) {
  const o = SK.officeOf(hero);
  if (!o || !o.branch || o.branch === 'none') return 0;
  const pool = SK.OFFICES.filter((x) => x.branch === o.branch);
  const i = pool.findIndex((x) => x.key === o.key);
  if (i < 0) return 0;
  const tbl = SK.OFFICE_TROOP_BONUS;
  return tbl[Math.min(i, tbl.length - 1)] || 0;
};
SK.isLordHero = function (hero, st) {
  if (!hero) return false;
  if (hero.rank === '군주' || hero.isLord) return true;
  const state = st || SK.state || {};
  const lordName = ((state.factions || {})[state.playerFaction || ''] || {}).lord || '';
  return !!(lordName && hero.name === lordName);
};
/* 상한의 내역 — 화면은 이 하나만 읽어 '기본 2,000 + 레벨 +N + 관직 +M'을 적는다 */
SK.troopCapParts = function (hero, st) {
  const state = st || SK.state || {};
  const isLord = SK.isLordHero(hero, state);
  const lv = Math.max(1, Number(hero && hero.lv) || 1);
  const lvBonus = SK.lvTroopBonus(lv);
  const officeBonus = SK.officeTroopBonusOf(hero);
  const fameBonus = isLord ? Math.min(SK.TROOP_CAP_FAME_MAX, Math.floor((Number(state.fame) || 0) / 12)) : 0;
  const capMax = isLord ? SK.TROOP_CAP.base.lord : SK.TROOP_CAP.base.named;
  const cap = Math.max(SK.TROOP_CAP_START, Math.min(capMax, SK.TROOP_CAP_START + lvBonus + officeBonus + fameBonus));
  return { isLord: isLord, lv: lv, base: SK.TROOP_CAP_START, lvBonus: lvBonus, officeBonus: officeBonus,
    fameBonus: fameBonus, cap: cap, capMax: capMax };
};
SK.troopCapOf = function (hero, st) { return SK.troopCapParts(hero, st).cap; };
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
/* ══ v5.55 — 초상화 등급 테두리 (S 빨강+금 · A 보라 · B 파랑 · C 초록) ══
   장수/부대/세이브 정보 어느 것을 넣어도 등급 한 글자를 돌려준다.
   등급을 모르면 C(초록)로 떨어뜨린다 — 병과 공용 부대도 C다. */
SK.TIER_KEYS = ['S', 'A', 'B', 'C'];
SK.tierNorm = function (t) {
  const s = String(t == null ? '' : t).toUpperCase();
  return (s === 'S' || s === 'A' || s === 'B' || s === 'C') ? s : 'C';
};
SK.tierOfPerson = function (o) {
  if (o == null) return 'C';
  if (typeof o === 'string') return SK.tierNorm(((SK.GEN_BY_NAME || {})[o] || {}).tier);
  let t = o.tier;
  if (SK.TIER_KEYS.indexOf(String(t == null ? '' : t).toUpperCase()) < 0) {
    const g = (o.genId != null && SK.GEN_BY_ID && SK.GEN_BY_ID[o.genId]) || (o.name && SK.GEN_BY_NAME && SK.GEN_BY_NAME[o.name]) || null;
    t = g ? g.tier : '';
  }
  return SK.tierNorm(t);
};
SK.tcls = function (o) { return 'tier-' + SK.tierOfPerson(o); };
/* 이미 그려 둔 요소의 등급을 바꾼다 (전장 하단 카드·필살기 컷인처럼 나중에 채우는 자리) */
SK.paintTier = function (el, tier) {
  if (!el || !el.classList) return;
  el.classList.remove('tier-S', 'tier-A', 'tier-B', 'tier-C');
  el.classList.add('tier-' + SK.tierNorm(tier));
};
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
      /* v5.29 — classes.json의 승급 이름은 '기본 병과명을 뺀' 목록이다.
         예전에는 4개 중 앞 3개만 셌기 때문에 마지막 이름(천하제왕·철갑기병 등)이
         Lv.30에도 닿지 못하고 데이터에만 남았다. 이제 3단계(Lv.10/20/30)가
         마지막 이름까지 닿게 매긴다 — 4개가 오면 1·2·최종을 쓴다. */
      const pn = d.promotions.slice(0, 4);
      const three = pn.length >= 4 ? [pn[0], pn[1], pn[3]] : pn.slice(0, 3);
      SK.PROMO[cls].names = [C.name].concat(three);
      SK.PROMO[cls].at = [10, 20, 30];
    }
    C.skills = (d.skills || []).map((sk, i) => {
      const key = 'c_' + cls + '_' + i;
      const eff = sk.effect || '';
      const def = { name: sk.name, hanja: '', mp: sk.mp, unlockLv: sk.unlockLv || 1, desc: eff, range: rng.max, minRange: rng.min };
      /* v5.58 — classes.json 이 kind·수치를 직접 적어 주면 그대로 쓴다.
         (예전에는 description 문구를 정규식으로 읽어 종류를 추측했기 때문에,
          문구와 실제 동작이 어긋나는 기술이 40여 종 있었다) */
      if (sk.kind) {
        def.kind = sk.kind;
        /* v5.60 — poison(중독 부여)·defDown(방어 약화)·selfBuff/allyBuff(공격+버프 복합)·fx(이펙트 태그)까지
           classes.json 이 적은 그대로 넘긴다. 여기 빠지면 실행부가 없는 값을 보게 된다. */
        ['power', 'hits', 'range', 'minRange', 'radius', 'amount', 'turns', 'atk', 'def', 'eva', 'move',
         'healPct', 'vsMount', 'waterBonus', 'siegeBonus', 'defPierce', 'ignoreEvade', 'slow',
         'stun', 'confuse', 'fear', 'cleanse', 'poison', 'defDown', 'selfBuff', 'allyBuff', 'fx',
         /* v5.81 — 병과 4스킬 개편: 여러 칸을 덮는 형태(pattern)와 부가 효과 */
         'pattern', 'maxTargets', 'crit', 'ifHpBelow', 'dash', 'root'].forEach((k) => {
          if (sk[k] != null) def[k] = sk[k];
        });
        if (sk.morale != null) def.morale = sk.morale;
        if (sk.range == null) def.range = rng.max;
        if (sk.minRange == null) def.minRange = rng.min;
        SK.SKILLS[key] = def;
        return key;
      }
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
SK.ASSET_V = '140';   /* 초상 파일을 덮어써도 폰이 옛 그림을 들고 있지 않게 — 파일 경로에도 붙인다 */
SK.ptSrc = function (p) {
  if (!p) return 'assets/portraits/v2/gen_bobyung.webp?v=' + SK.ASSET_V;
  /* v5.89b — 전용 초상(v579·a_rank 등)도 같은 파일명으로 덮어썼으므로 경로 끝에 ?v= 를 붙여
     폰 캐시를 새로 받게 한다 (v5.89a까지는 병과 초상에만 붙었다) */
  const s = String(p);
  if (s.indexOf('/') >= 0) {
    if (/([?&])v=/.test(s)) return s;            /* 두 번 감싸도 ?v=가 겹치지 않게 */
    return s + (s.indexOf('?') >= 0 ? '&' : '?') + 'v=' + SK.ASSET_V;
  }
  return `assets/portraits/v2/${s}.webp?v=${SK.ASSET_V}`;
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
/* v6.4b — 한 칸에 문장 하나(문자열)든 여러 줄(배열)이든 받는다. 배열이면 그중 한 줄을 고른다 */
SK.quoteOf = function (name, kind) {
  const q = SK.QUOTES[name];
  if (!q) return '';
  const v = q[kind];
  if (Array.isArray(v)) return v.length ? v[Math.floor(Math.random() * v.length)] : '';
  return v || '';
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
/* v5.41 — 이벤트 트리거에 나오는 장수 이름 목록 (긴 이름부터 비교해 짧은 이름의 오탐을 줄인다) */
let evGenNames = null;
function eventGenNames() {
  if (evGenNames) return evGenNames;
  evGenNames = (SK.GENERALS || []).map((g) => g && g.name).filter((n) => n && n.length >= 2)
    .sort((a, b) => b.length - a.length);
  return evGenNames;
}
SK.eventGenNames = eventGenNames;
SK.pickEvent = function (city, generals) {
  if (!SK.EVENTS.length) return null;
  const defs = (generals || []).map((g) => g && g.name).filter(Boolean);
  const mine = ((SK.state && SK.state.heroes) || []).map((h) => h.name).filter(Boolean);
  const gnames = eventGenNames();
  let best = null, bestScore = 0;
  SK.EVENTS.forEach((ev) => {
    const text = (ev.title || '') + ' ' + (ev.trigger || '') + ' ' + (ev.dialogue || '');
    /* 조건 판정은 제목·트리거만 본다 (대사에는 인물 이름이 흔히 등장한다) */
    const cond = (ev.title || '') + ' ' + (ev.trigger || '');
    let score = 0;
    Object.keys(SK.EVENT_ALIASES).forEach((key) => {
      if (text.includes(key) && SK.EVENT_ALIASES[key].includes(city.id)) score += 3;
    });
    if (text.includes(city.name)) score += 4;
    defs.forEach((n) => { if (n && text.includes(n)) score += 5; });
    /* v5.41 — 트리거의 '조건'을 본다.
       ① 제목·트리거에 나오는 장수가 우리 군에 있으면 이 이벤트는 적 장수 연출로 쓰지 않는다
          (아군 양만춘이 '적 장수 / 안시성의 화살 양만춘'으로 나오던 모순)
       ② 그 장수가 이 전투의 수비 장수가 아니면 성 이름만으로는 채택하지 않는다
          (재야 안시성처럼 지휘하는 사람이 없는 곳에서 떠던 문제) */
    const named = gnames.filter((n) => cond.includes(n));
    if (named.length) {
      if (named.some((n) => mine.indexOf(n) >= 0)) score = 0;
      else if (!named.some((n) => defs.indexOf(n) >= 0)) score = Math.min(score, 2);
    }
    if (score > bestScore) { bestScore = score; best = ev; }
  });
  return bestScore >= 3 ? best : null;
};

SK.GENERALS = [];
SK.GEN_BY_ID = {};
SK.GEN_BY_NAME = {};
SK.setGenerals = function (list) {
  SK.GENERALS = list || [];
  evGenNames = null;   // v5.41 — 장수 목록이 바뀌면 이벤트 조건 이름 목록도 다시 만든다
  SK.GEN_BY_ID = {}; SK.GEN_BY_NAME = {};
  SK.GENERALS.forEach((g) => { SK.GEN_BY_ID[g.id] = g; SK.GEN_BY_NAME[g.name] = g; });
  SK.registerExtras();
  SK.GENERALS.forEach((g) => { g.hanja = ''; g.origTier = g.tier; });
  SK.rebalanceTiers();
  /* v5.81 — A급 필살기: 등급이 정해진 뒤에 한 번 만든다 (244명 + 승격된 A 포함) */
  if (SK.ensureAUltimates) SK.A_ULT_COUNT = SK.ensureAUltimates();
  /* v5.82 — S급 필살기 개성(e·desc)은 등급이 정해진 지금 덮어쓴다 (A로 재산정된 장수는 A급 상한 유지) */
  if (SK.applyUlt582) SK.applyUlt582();
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

/* ══ v6.5a — 한국 S급 30명 확정 명부 (시대별 균형) ══════════════════════════
   v6.5까지는 한국 장수도 전 장수(701명) 백분위로 등급을 다시 매겨서, 도감의 '한국' S급이
   29명으로 흔들리고 명부도 제멋대로였다 — 책사형(을파소·황희·이황·원효·황진이)이 S로
   올라오고 문무왕·장보고·무령왕 같은 개국·전쟁 군주는 A로 내려가 있었다.
   v6.5a부터 한국 장수는 이 명부를 그대로 따른다.
     · KOREA_S30 — 어떤 스탯 조정에도 S로 남는 30명 (고구려6·백제4·신라6·고려6·조선5·근대3)
     · KOREA_A20 — S에서 내려온 20명. 스탯을 중원 A급(합 340~375)으로 다듬고 A로 고정한다
     · 명부 밖 한국 장수는 재산정 결과를 따르되 S는 주지 않는다(A 이하)
   중원(위·촉·오)·군웅·재야 장수의 등급은 종전 백분위 그대로라 이 명부가 건드리지 않는다. */
SK.KOREA_S30 = [
  /* 고구려 6 */ '광개토대왕', '동명성왕', '장수왕', '을지문덕', '연개소문', '양만춘',
  /* 백제 4 */ '온조왕', '근초고왕', '무령왕', '계백',
  /* 신라 6 */ '진흥왕', '선덕여왕', '문무왕', '김유신', '김춘추', '장보고',
  /* 고려 6 */ '왕건', '강감찬', '윤관', '척준경', '최영', '최무선',
  /* 조선 5 */ '이성계', '정도전', '이방원', '세종대왕', '이순신',
  /* 근대 3 */ '안중근', '김좌진', '김구',
];
SK.KOREA_A20 = [
  '대무신왕', '명림답부', '성왕', '흑치상지', '이사부', '김수로', '설총', '고선지', '서희', '양규',
  '정몽주', '장영실', '김종서', '권율', '곽재우', '김시민', '정약용', '임경업', '김응하', '홍범도',
];
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
    /* v6.5a — 한국 장수는 확정 명부가 백분위보다 먼저다 (위 SK.KOREA_S30 주석 참고) */
    if (g.faction === '한국') {
      if (SK.KOREA_S30.indexOf(g.name) >= 0) t = 'S';
      else if (SK.KOREA_A20.indexOf(g.name) >= 0) t = 'A';
      else if (t === 'S') t = 'A';
    }
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
/* v5.40 — 250종. 새로 들어온 문물·비보·병법서는 모두 병법서 칸(manual)에 든다 */
SK.TREASURE_SLOTS = { '무기': 'weapon', '방어구': 'armor', '명마': 'horse', '병법서·보물': 'manual',
  '병법서': 'manual', '문물': 'manual', '비보': 'manual' };
SK.SLOT_NAMES = { weapon: '무기', armor: '방어구', horse: '명마', manual: '병법서' };
SK.GRADE_COLOR = { '전설': '#a8443a', '영웅': '#7a5aa8', '희귀': '#3f7a5a', '일반': '#8a7a5a' };
SK.setTreasures = function (list) {
  SK.TREASURES = list || [];
  SK.TREASURE_BY_ID = {};
  SK.TREASURES.forEach((t) => { SK.TREASURE_BY_ID[t.id] = t; });
};
/* ══════════════════════════════════════════════════════════════
   v5.33 — 보물 획득 '지역' 판정
   151종의 dropHint에는 '서량·옹주 지역', '강동 제패', '경주 왕릉'처럼 지역 이름이 섞여 있다.
   그런데 실제 드랍(전투 보상)·탐색은 지역을 보지 않아, 도감의 힌트가 '어디서'를 말해 주지 못했다.
   힌트의 지역 낱말을 성 묶음으로 풀어 두고 → 전투 드랍·탐색 가중치에 실제로 쓴다.
   ══════════════════════════════════════════════════════════════ */
SK.TREASURE_REGIONS = [
  { key: '서량', name: '서량·옹주', cities: ['무위', '금성', '천수', '안정'], words: ['서량', '옹주', '마초', '마등', '한수', '양추', '완성', '호표기'] },
  { key: '하북', name: '하북·기주', cities: ['남피', '업', '계', '진양', '상당'], words: ['하북', '기주', '원소', '원상', '심배', '계교', '관도', '백마', '연진'] },
  { key: '유주', name: '유주·북방', cities: ['북평', '평원', '대', '산해관', '삭방'], words: ['유주', '북방', '공손찬', '공손강', '오환', '유목', '초원', '기마', '오르도스', '만리장성'] },
  { key: '중원', name: '중원·사례', cities: ['낙양', '허창', '진류', '완', '호로관', '함곡관', '동관', '호관'], words: ['중원', '낙양', '허창', '진류', '동탁', '왕실', '제례', '호로관'] },
  { key: '서주', name: '서주·예주', cities: ['하비', '소패', '광릉', '여남', '수춘'], words: ['서주', '예주', '하비', '소패', '황건', '장각', '여포', '흑산적', '흑산'] },
  { key: '형주', name: '형주·남양', cities: ['양양', '신야', '강하', '강릉', '무릉', '장사', '영릉', '계양', '상용'], words: ['형주', '남양', '강남 서원', '양양', '장사', '적벽', '장판교', '맥성', '번성', '화용도', '이릉', '강하'] },
  { key: '익주', name: '익주·남만', cities: ['성도', '강주', '영안', '건녕', '운남', '영창', '노수 관문', '검각', '자동', '양평관'], words: ['익주', '남만', '남중', '맹획', '촉한', '제갈량', '오장원', '정군산', '북벌', '목우유마'] },
  { key: '강동', name: '강동·강남', cities: ['건업', '오', '시상', '회계', '건안', '합비'], words: ['강동', '오나라', '손견', '손책', '주유', '여몽', '감녕', '강남', '수군', '합비', '유수구'] },
  { key: '한중', name: '한중·관중', cities: ['한중', '장안', '양평관', '검각'], words: ['한중', '관중', '장안', '서황', '정군산'] },
  { key: '고구려', name: '고구려·요동', cities: ['국내성', '요동', '안시성', '부여', '옥저', '평양', '함흥'], words: ['고구려', '요동', '만주', '개마', '연개소문', '을지문덕', '광개토', '졸본', '평양', '살수', '안시성', '여진'] },
  { key: '삼국', name: '백제·신라·가야', cities: ['한성', '웅진', '청주', '원주', '완산', '광주', '경주', '부산', '금성'], words: ['백제', '신라', '가야', '화랑', '김유신', '근초고왕', '경주', '한강', '김해', '사비', '황산벌'] },
  { key: '고려', name: '고려·개성', cities: ['개성', '철원 요새', '대관령 관문'], words: ['고려', '개성', '왕건', '강감찬', '서희', '윤관', '척준경', '귀주'] },
  { key: '조선', name: '조선·한성', cities: ['한성', '개성', '평양', '부산', '탐라'], words: ['조선', '이순신', '세종', '정도전', '거북선', '명량', '한산', '노량', '진포'] },
  { key: '해상', name: '남해·섬', cities: ['남해', '탐라', '부산', '타이베이', '타이난', '건안'], words: ['해전', '수전', '해상', '섬', '탐라', '제주', '남해안'] },
];
SK.TREASURE_REGION_BY_KEY = {};
SK.TREASURE_REGIONS.forEach((r) => { SK.TREASURE_REGION_BY_KEY[r.key] = r; });
/* 힌트 → { regions:[...], cities:[직접 언급된 성 이름] } */
SK.treasureWhere = function (t) {
  const hint = String((t && t.dropHint) || '');
  const regions = [];
  SK.TREASURE_REGIONS.forEach((r) => {
    if (r.words.some((w) => hint.indexOf(w) >= 0)) {
      if (!regions.some((x) => x.key === r.key)) regions.push(r);
    }
  });
  const cities = [];
  if (SK.CITY_LIST) {
    SK.CITY_LIST.forEach((c) => {
      const nm = String(c.name).replace(' 요새', '').replace(' 관문', '');
      if (nm && nm.length >= 2 && hint.indexOf(nm) >= 0 && cities.indexOf(c.id) < 0) {
        cities.push(c.id);
        /* 직접 적힌 성은 그 지역도 함께 (예: '하비' → 서주·예주) */
        const reg = SK.TREASURE_REGIONS.find((r) => r.cities.some((x) => x === c.name || x === c.name.replace(' 요새', '').replace(' 관문', '')));
        if (reg && !regions.some((x) => x.key === reg.key)) regions.push(reg);
      }
    });
  }
  return { regions, cities };
};
/* 도감·상세에 쓰는 한 줄: 어디서 노리면 되는지 (전투 / 탐색 / 대상인) */
SK.treasurePathText = function (t, full) {
  const w = SK.treasureWhere(t);
  const hint = String((t && t.dropHint) || '');
  const isStart = /시작/.test(hint);
  const battle = /격파|토벌|전투|공방전|승리|보상|전리품|정벌|원정|제패|평정|습격|수성|공성|난이도/.test(hint);
  const explore = /탐사|탐방|탐험|유적|고분|발굴|고적|수집|거래|정찰|지리|유물|무기고|상단|학당|서원|도요지|능묘|천문대/.test(hint);
  const cityTxt = w.cities.map((id) => (SK.CITY && SK.CITY[id] ? SK.CITY[id].name : '')).filter(Boolean).join('·');
  const regTxt = w.regions.length ? w.regions.slice(0, 2).map((r) => r.name).join(' · ') : '';
  /* 성 이름이 힌트에 있으면 그 성을, 없으면 지역을 쓴다. 둘 다 있으면 '하비(서주·예주)'처럼 함께 */
  const where = cityTxt ? (regTxt ? `${cityTxt}(${regTxt})` : cityTxt) : regTxt;
  const parts = [];
  if (isStart) parts.push('시작 보유');
  if (battle) parts.push('전투 — ' + (where || '전국 어디서나'));
  if (explore || !battle) parts.push('탐색 — ' + (where || '전국 어디서나'));
  if (full) parts.push('대상인 — 내 성에 가끔 찾아오는 상인에게 금으로 구매');
  return parts.join(' / ');
};
SK.treasureSlot = function (t) { return SK.TREASURE_SLOTS[t.type] || 'manual'; };
SK.treasureStats = function (t) {
  return { war: (t.statBonus || {}).war || 0, intel: (t.statBonus || {}).intel || 0, leadership: (t.statBonus || {}).leadership || 0,
    charm: (t.statBonus || {}).charm || 0, politics: (t.statBonus || {}).politics || 0, move: (t.statBonus || {}).move || 0,
    rng: (t.statBonus || {}).rng || 0 };
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

/* ───────────── v5.29 — 보물 효과 문구 → 전장 수치 ─────────────
   지금까지 151종 보물의 effect 문구 중 실제로 쓰인 것은 무력·통솔·지력·정치·매력·이동·사거리
   뿐이고, "돌파 피해 +15%" 같은 정성 효과는 화면 글자로만 남아 있었다.
   여기서 effect 문구를 절(쉼표) 단위로 나눠 전장 계산이 쓰는 값으로 바꾼다.
   · 적용 훅: atk 공격력 / def 방어력 / defWall 성벽 위 방어력 / dmg 주는 피해 /
     taken 받는 피해 / magic 책략 위력 / magicTaken 받는 책략 피해 /
     crit 치명타 확률 / critDmg 치명타 피해 / critRes 치명타 저항 / evade 회피 /
     counter 반격 피해 / heal 회복량 / first 첫 공격(선제) / mp 턴당 기력 / rough 험지 이동
   · 환산(게임에 그 판정이 없어 같은 눈금으로 옮긴 것 — UI에도 그대로 적는다):
     명중률 → 주는 피해 %, 책략 명중률 → 책략 위력 %, 적 방어력 -N% → 주는 피해 +N%,
     받는 치명타 피해 -N% → 치명타 저항 +N%, 아군 사기 +N → 공격력 +(N/2)%,
     반사 피해 → 반격 피해 +N%, 피해 경감/감소 → 받는 피해 -(N)%
   · 원문에 숫자가 없는 문구는 값을 지어내지 않고 fxNotes(미적용)로 남겨 UI에 그대로 보여 준다. */
SK.TREASURE_FX_KEYS = ['atk', 'def', 'defWall', 'dmg', 'taken', 'magic', 'magicTaken',
  'crit', 'critDmg', 'critRes', 'evade', 'counter', 'heal', 'first', 'mp', 'mpCost', 'exp',
  'combo', 'volley', 'doubleAct', 'pierce', 'splash', 'line',
  'water', 'mountain', 'night', 'nightTaken', 'reflect', 'charge', 'flank',
  'morale', 'moraleMax', 'moraleSave', 'moraleRegen', 'moraleHit',
  'stunHit', 'fearHit', 'slowHit', 'disarm', 'statusRes', 'cleanse',
  'immuneFC', 'immunePoison', 'immuneDisarm',
  'pursuit', 'meleeTaken', 'gateDmg', 'rngPlus', 'lossCut', 'passive', 'radius', 'moveShot',
  'income', 'supply', 'diplo', 'duel', 'detect',
  'food', 'spy', 'loyalty', 'recruit', 'train',
  /* v5.58 — 문구가 병과·대상·비용을 콕 집는 효과를 실제 판정으로 옮긴다 */
  'vsGeom', 'vsHeavy', 'siegeDmg', 'techCost', 'buildCost'];
SK.TREASURE_FX_LABEL = {
  atk: '공격력', def: '방어력', defWall: '성벽 위 방어력', dmg: '주는 피해', taken: '받는 피해',
  magic: '책략 위력', magicTaken: '받는 책략 피해', crit: '치명타 확률', critDmg: '치명타 피해',
  critRes: '치명타 저항', evade: '회피', counter: '반격 피해', heal: '회복량',
  first: '첫 공격 피해', mp: '턴당 기력', mpCost: '책략 기력 소모', exp: '경험치 획득',
  rough: '험지 이동',
  combo: '연격 확률', volley: '연속 사격 확률', doubleAct: '한 턴 2회 공격', pierce: '연격 시 방어 무시',
  splash: '주변 추가 피해', line: '관통 추가 피해', water: '수전 지형 공·방', mountain: '산악 지형 공·방',
  night: '야간 공·방', nightTaken: '야간 받는 피해', reflect: '반사 피해', charge: '돌격 추가 피해', flank: '측면·후면 추가 피해',
  morale: '사기', moraleMax: '사기 최대치', moraleSave: '사기 저하 저항', moraleRegen: '턴당 사기 회복',
  moraleHit: '적 사기 저하', stunHit: '기절 부여 확률', fearHit: '위축 부여 확률', slowHit: '둔화 부여',
  disarm: '방어 약화 확률', statusRes: '상태이상 저항', cleanse: '상태이상 해제 확률',
  immuneFC: '공포·혼란 면역', immunePoison: '역병 면역', immuneDisarm: '무기 해제 면역',
  pursuit: '추격 발동 확률', meleeTaken: '근접 받는 피해', gateDmg: '성문·장애물 피해',
  rngPlus: '사거리 +1(원거리만)', lossCut: '패전 병력 손실', passive: '고유특기 발동 확률',
  radius: '책략 범위', moveShot: '이동 후 사격 페널티 무효',
  income: '성 내정 수입', supply: '성 군량 유지비', diplo: '외교·등용 성공률', duel: '일기토 승리 확률', detect: '정찰 범위',
  food: '성 군량 생산', spy: '첩보·정찰 성공률', loyalty: '성 민심·충성', recruit: '징병량', train: '훈련 효율',
  vsGeom: '검병·등갑병에게 주는 피해', vsHeavy: '중갑에게 주는 피해', siegeDmg: '성벽·성문 피해',
  techCost: '기술 연구 비용', buildCost: '건축·성벽 수리 비용',
};
SK.TREASURE_FX_DEFAULT = {
  combo: 15, volley: 15, doubleAct: 1, pierce: 1, splash: 12, line: 12,
  water: 10, mountain: 10, night: 10, nightTaken: 15, reflect: 15, charge: 8, flank: 12,
  morale: 12, moraleMax: 10, moraleSave: 25, moraleRegen: 6, moraleHit: 6,
  stunHit: 12, fearHit: 20, slowHit: 1, disarm: 14, statusRes: 15, cleanse: 20,
  immuneFC: 1, immunePoison: 1, immuneDisarm: 1,
  pursuit: 20, meleeTaken: 12, gateDmg: 20, rngPlus: 1, lossCut: 15, passive: 12, radius: 1,
  moveShot: 1, income: 12, supply: 12, diplo: 10, duel: 15, detect: 1,
  counter: 20, first: 20,
  food: 12, spy: 10, loyalty: 8, recruit: 10, train: 10,
  vsGeom: 20, vsHeavy: 20, siegeDmg: 20, techCost: 10, buildCost: 10,
};
SK.TREASURE_FX_FLAGS = { doubleAct: 1, pierce: 1, immuneFC: 1, immunePoison: 1, immuneDisarm: 1, rngPlus: 1, moveShot: 1 };
/* 값이 클수록 '덜 받거나 덜 쓴다'인 훅 — 문구의 부호와 상관없이 크기를 효과로 읽는다 */
SK.TREASURE_FX_ABS = { taken: 1, magicTaken: 1, nightTaken: 1, meleeTaken: 1, mpCost: 1, supply: 1,
  lossCut: 1, moraleHit: 1, moraleSave: 1, techCost: 1, buildCost: 1 };
/* ───────────── v5.58 — 문구 절 ↔ 훅 1:1 표 ─────────────
   treasures.json 의 effect 를 ', ' 로 나눈 절 하나가 아래 표의 한 줄에 정확히 붙는다.
   숫자는 '#'으로 바꾸고 '%'·공백을 지운 키로 찾으므로 값만 달라도 같은 훅이다.
   표에 없는 문구만 아래 정규식(SK.TREASURE_FX_RULES)으로 넘어간다. */
SK.TREASURE_CLAUSE_RULES = [
  ['무력 +#', 'stat'],
  ['지력 +#', 'stat'],
  ['통솔 +#', 'stat'],
  ['정치 +#', 'stat'],
  ['매력 +#', 'stat'],
  ['이동력 +#', 'stat'],
  ['기병 이동력 +#', 'stat'],
  ['수군 이동력 +#', 'stat'],
  ['해상 이동력 +#', 'stat'],
  ['군주 통솔 보정 +#', 'stat'],
  ['공격력 +#%', 'atk'],
  ['기병 공격력 +#%', 'atk'],
  ['보병 공격력 +#%', 'atk'],
  ['궁병 공격력 +#%', 'atk'],
  ['창병 공격력 +#%', 'atk'],
  ['화기 부대 공격력 +#%', 'atk'],
  ['화포 부대 공격력 +#%', 'atk'],
  ['아군 전체 공격력 +#%', 'atk'],
  ['전쟁 중 아군 공격력 +#%', 'atk'],
  ['아군 전열 공격력 +#%', 'atk'],
  ['고대 전열 공격력 +#%', 'atk'],
  ['근접 공격력 +#', 'atk'],
  ['야전 및 야습 공격력 +#%', 'atk'],
  ['해상·수변 전투 공격력 +#%', 'atk'],
  ['도하·연안 전투 공격력 +#%', 'atk'],
  ['하천 및 습지 전투에서 아군 공격력 +#%', 'atk'],
  ['병력 열세 시 공격력 +#%', 'atk'],
  ['아군 전체 공격력·방어력 +#%', 'atkDef'],
  ['방어력 +#%', 'def'],
  ['투사체 방어 +#%', 'def'],
  ['강가·습지 방어력 +#%', 'def'],
  ['위기 상황 방어력 +#%', 'def'],
  ['창병·보병 돌격 방어 +#%', 'def'],
  ['보병 방어력 +#%', 'def'],
  ['기병 방어력 +#%', 'def'],
  ['기병 및 보병 방어력 +#%', 'def'],
  ['모든 병과 방어력 +#%', 'def'],
  ['성벽·주둔지 방어력 +#%', 'defWall'],
  ['성곽 방어력 +#%', 'defWall'],
  ['산성 방어력 +#%', 'defWall'],
  ['산성 방어전에서 아군 방어력 +#%', 'defWall'],
  ['성 방어전 아군 방어력 +#%', 'defWall'],
  ['주는 피해 +#%', 'dmg'],
  ['기동 보병·창병 근접 피해 +#%', 'dmg'],
  ['화계 및 화공 피해 +#%', 'dmg'],
  ['화계 성공률 +#%', 'dmg'],
  ['전술 피해 +#%', 'dmg'],
  ['기병·보병 연계 공격 시 피해 +#%', 'dmg'],
  ['화기 부대 피해 +#%', 'dmg'],
  ['야전 전투 피해 +#%', 'dmg'],
  ['원거리 명중률 +#%', 'dmg'],
  ['궁병 명중률 +#%', 'dmg'],
  ['수군 명중률 +#%', 'dmg'],
  ['방어 관통 +#%', 'dmg'],
  ['돌격 시 적 방어력 -#%', 'dmg'],
  ['일기토·책략 양쪽 피해 +#%', 'dmg'],
  ['받는 피해 -#%', 'taken'],
  ['받는 물리 피해 -#%', 'taken'],
  ['물리 피해 -#%', 'taken'],
  ['받는 원거리 피해 -#%', 'taken'],
  ['전면 물리 피해 -#%', 'taken'],
  ['화살·투석 피해 -#%', 'taken'],
  ['투사체·낙석 피해 -#%', 'taken'],
  ['돌격·충격 피해 경감 -#%', 'taken'],
  ['측면·후면 기습 피해 -#%', 'taken'],
  ['기습 피해 경감 -#%', 'taken'],
  ['진영 고정 방어 시 피해 -#%', 'taken'],
  ['보병 피해 감소 +#%', 'taken'],
  ['이동력 페널티 없이 물리 피해 -#%', 'taken'],
  ['적 기병 공격력 -#%', 'taken'],
  ['적 수군 명중률 -#%', 'taken'],
  ['책략 위력 +#%', 'magic'],
  ['도술·기상 책략 위력 +#%', 'magic'],
  ['안개·화계·낙뢰 책략 위력 +#%', 'magic'],
  ['화계·풍계 책략 위력 +#%', 'magic'],
  ['기상·바람 계열 책략 및 검격 피해 +#%', 'magic'],
  ['고대 설화·신비 책략 위력 +#%', 'magic'],
  ['책략 명중률 +#%', 'magic'],
  ['기상 변화 예측 및 아군 책략 명중률 +#%', 'magic'],
  ['야간·기상 책략 명중률 +#%', 'magic'],
  ['기상 예측 성공률 +#%', 'magic'],
  ['계절 예측 성공률 +#%', 'magic'],
  ['화계 확률 +#%', 'magic'],
  ['고대 설화·신비 책략 위력 및 사기 보정', 'magic'],
  ['받는 책략 피해 -#%', 'magicTaken'],
  ['화계 피해 감소 +#%', 'magicTaken'],
  ['화공·화살 불길 피해 -#%', 'magicTaken'],
  ['화계·화살 불길 피해 -#%', 'magicTaken'],
  ['물·바람 책략 피해 -#%', 'magicTaken'],
  ['책략 역풍·반격 피해 경감 -#%', 'magicTaken'],
  ['저주 저항 +#%', 'magicTaken'],
  ['저주·화계·혼란 책략 저항 +#%', 'magicTaken'],
  ['화계 피해 +#%', 'magicVuln'],
  ['받는 책략 피해 +#%', 'magicVuln'],
  ['물리·책략 피해 -#%', 'both'],
  ['치명타 확률 +#%', 'crit'],
  ['기병 돌격 치명타율 +#%', 'crit'],
  ['치명타·책략 크리티컬 확률 +#%', 'crit'],
  ['근접 치명타 피해 +#%', 'critDmg'],
  ['원거리 치명타 피해 +#%', 'critDmg'],
  ['치명타 저항 +#%', 'critRes'],
  ['헤드샷·치명타 피해 -#%', 'critRes'],
  ['회피 +#%', 'evade'],
  ['회피율 +#%', 'evade'],
  ['위기 회피 확률 +#%', 'evade'],
  ['근접 회피율 +#%', 'evade'],
  ['산림·험지 회피율 +#%', 'evade'],
  ['암습·근접 위기 탈출 확률 +#%', 'evade'],
  ['반격 피해 +#%', 'counter'],
  ['기병 접근 시 반격 위력 +#%', 'counter'],
  ['연속 근접 반격 시 피해 +#%', 'counter'],
  ['반격 공격력 +#%', 'counter'],
  ['근접 자위력 상승', 'counter'],
  ['회복량 +#%', 'heal'],
  ['턴당 병력·부상 회복량 +#%', 'heal'],
  ['궁기·기병 선제공격률 +#%', 'first'],
  ['선제공격·기습 성공률 +#%', 'first'],
  ['기습 공격 성공률 +#%', 'first'],
  ['기습 및 매복 성공률 +#%', 'first'],
  ['매복 성공률 +#%', 'first'],
  ['기마 부대 기동력·선제 타격 보정', 'first'],
  ['턴당 기력 회복 +#', 'mp'],
  ['기력 회복 +#', 'mp'],
  ['책략 소비 기력 -#%', 'mpCost'],
  ['기력 소모 -#%', 'mpCost'],
  ['부대 경험치 획득량 +#%', 'exp'],
  ['경험치 획득 +#%', 'exp'],
  ['부대 경험치 +#%', 'exp'],
  ['단일 대상 연격 확률 +#%', 'combo'],
  ['연노·궁수 연속 사격 확률 +#%', 'volley'],
  ['장거리 화염·연속 투사체 공격 가능', 'volley'],
  ['#턴 #회 근접 공격 가능(쿨타임)', 'doubleAct'],
  ['자웅 쌍검으로 두 번 벤다', 'doubleAct'],
  ['연격 시 대상 방어력 무시', 'pierce'],
  ['주변 #칸 범위 추가 피해', 'splash'],
  ['다중 화살 공격 시 #번째 대상 피해 증가', 'splash'],
  ['다수 적 상대 광역 베기 피해 +#%', 'splash'],
  ['횡일선 관통 베기 추가 피해', 'line'],
  ['수전 지형 공·방 +#%', 'water'],
  ['수군 건조 비용 -#%', 'water'],
  ['수군 방어력 +#%', 'water'],
  ['수전 피해 감소 +#%', 'water'],
  ['수전 공격력 +#%', 'water'],
  ['수전 피해 +#%', 'water'],
  ['산악 지형 공·방 +#%', 'mountain'],
  ['산악·수전 지형 아군 능력치 보정 강화', 'terrainAny'],
  ['야간 공·방 +#%', 'night'],
  ['야간 받는 피해 -#%', 'nightTaken'],
  ['야간 전투 시 물리·책략 피해 -#%', 'nightTaken'],
  ['반사 피해 +#%', 'reflect'],
  ['반격 시 반사 피해 부여', 'reflect'],
  ['돌격 추가 피해 +#%', 'charge'],
  ['돌파 피해 +#%', 'charge'],
  ['기병 돌격 피해 +#%', 'charge'],
  ['돌격 피해 +#%', 'charge'],
  ['돌격 성공률 +#%', 'charge'],
  ['전열 돌파 시 추가 피해 +#%', 'charge'],
  ['돌격 시 이동 거리 비례 추가 피해', 'charge'],
  ['측면·후면 추가 피해 +#%', 'flank'],
  ['은신·측면 공격 시 추가 피해 +#%', 'flank'],
  ['험지 이동 페널티 무효', 'rough'],
  ['강하·도하 이동력 소모 감소', 'rough'],
  ['이동 시 지형 제약 경감', 'rough'],
  ['야전 기동력 보정', 'rough'],
  ['정찰 이동력 소모 감소', 'rough'],
  ['야간 행군 속도 상승', 'rough'],
  ['설원·고원 이동 페널티 감소', 'rough'],
  ['구릉·초원 이동 안정성 상승', 'rough'],
  ['강남 구릉 지형 이동 보정', 'rough'],
  ['산악 지형 이동 소모 -#', 'rough'],
  ['산악 이동 소모 -#', 'rough'],
  ['해상 이동 소모 -#', 'rough'],
  ['아군 육상 이동 소모 -# (역참 경로)', 'rough'],
  ['기상 악화로 인한 이동력 감소 확률 -#%', 'rough'],
  ['전 지형 이동 페널티 경감 및 시야·행군 효율 대폭 상승', 'rough'],
  ['사기 +#', 'morale'],
  ['아군 사기 +#', 'morale'],
  ['세력 전체 사기 +#', 'morale'],
  ['아군 전체 사기 +#', 'morale'],
  ['주둔군 사기 +#', 'morale'],
  ['아군 기병 사기 +#', 'morale'],
  ['전쟁 선포 후 3턴간 아군 사기 +#%', 'morale'],
  ['아군 기병·보병 이동력 보정 및 사기 +#', 'morale'],
  ['야전 행군 시 사기 +#', 'morale'],
  ['전군 사기 최대치 상승', 'moraleMax'],
  ['사기 저하 저항 +#%', 'moraleSave'],
  ['사기 저하 -#%', 'moraleSave'],
  ['아군 사기 감소 -#%', 'moraleSave'],
  ['아군 사기 감소 효과 -#%', 'moraleSave'],
  ['선봉 지휘 시 아군 사기 감소 -#%', 'moraleSave'],
  ['사기 안정 +#%', 'moraleSave'],
  ['행군 시 사기 감소 완화', 'moraleSave'],
  ['설원·초원 이동 시 사기 유지', 'moraleSave'],
  ['아군 사기 회복량 +#%', 'moraleRegen'],
  ['아군 사기 회복 +#%', 'moraleRegen'],
  ['아군 기병·보병 사기 회복량 +#%', 'moraleRegen'],
  ['진형 효율 +#%', 'moraleRegen'],
  ['적 사기 저하 효과 부여', 'moraleHit'],
  ['적 기세 꺾기 효과', 'moraleHit'],
  ['적 사기 저하 +#', 'moraleHit'],
  ['사기 저하 효과', 'moraleHit'],
  ['적 사기 감소 효과 +#%', 'moraleHit'],
  ['적 사기 감소 +#', 'moraleHit'],
  ['돌격 시 적 사기 -#', 'moraleHit'],
  ['기절·위축 효과 부여 확률 +#%', 'stunHit'],
  ['일기토·근접전 위압 효과 부여', 'fearHit'],
  ['둔타 공격 시 이동력 -# 디버프 부여', 'slowHit'],
  ['무기 해제·방어력 약화 확률 +#%', 'disarm'],
  ['상태이상 저항 +#%', 'statusRes'],
  ['아군 상태이상 해제 확률 +#%', 'cleanse'],
  ['아군 혼란 회복', 'cleanse'],
  ['공포·혼란 상태이상 면역', 'immuneFC'],
  ['역병 면역', 'immunePoison'],
  ['무기 내구 손실 무효', 'immuneDisarm'],
  ['무기 흘림 방지', 'immuneDisarm'],
  ['추격 발동 확률 +#%', 'pursuit'],
  ['추격 공격 발동 확률 +#%', 'pursuit'],
  ['돌파 이동 시 추격률 +#%', 'pursuit'],
  ['근접 받는 피해 -#%', 'meleeTaken'],
  ['전면 근접 피해 -#%', 'meleeTaken'],
  ['일기토·근접전 내성 상승', 'meleeTaken'],
  ['목책·장애물 파괴 효율 +#%', 'gateDmg'],
  ['성문·장애물 피해 +#%', 'gateDmg'],
  ['사거리 +#', 'rngPlus'],
  ['사거리 +#(원거리 병과 한정)', 'rngPlus'],
  ['궁병 사거리 +#', 'rngPlus'],
  ['중거리 투척 공격 사용 가능', 'rngPlus'],
  ['해상·포차 공격 사거리 및 폭발 피해 증가', 'rngPlus'],
  ['패전 병력 손실 -#%', 'lossCut'],
  ['부상 발생률 감소', 'lossCut'],
  ['부상 확률 -#%', 'lossCut'],
  ['패전 피해 감소', 'lossCut'],
  ['전술 운용 효율 +#%', 'passive'],
  ['역사적 전술 발동 확률 +#%', 'passive'],
  ['전투 중 전술 성공률 +#%', 'passive'],
  ['범위 효과 확대', 'radius'],
  ['이동 후 사격 피해 감소 없음', 'moveShot'],
  ['일기토 제안 성공률 상승', 'duel'],
  ['일기토 승리 확률 +#%', 'duel'],
  ['일기토 승률 보정 +#%', 'duel'],
  ['적 장수와의 일기토 피해 +#%', 'duel'],
  ['은신·매복 적 탐지 범위 +#', 'detect'],
  ['육상 정찰 범위 +#', 'detect'],
  ['첩보 정찰 범위 +#', 'detect'],
  ['야간 매복 발각 확률 감소', 'detect'],
  ['내정 수입 +#%', 'income'],
  ['도시 내정 효율 +#%', 'income'],
  ['도시 상업 수입 +#%', 'income'],
  ['무역 수입 +#%', 'income'],
  ['문화 수입 +#%', 'income'],
  ['도시 세금 수입 +#%', 'income'],
  ['도시 문화 발전 +#%', 'income'],
  ['상업 개발 효율 +#%', 'income'],
  ['농업·수리 내정 효율 +#%', 'income'],
  ['치안 유지·세수 징수 효율 +#%', 'income'],
  ['도시 행정 효율 +#%', 'income'],
  ['도시 개발 효율 +#%', 'income'],
  ['내정 명령 실행 비용 -#%', 'income'],
  ['세력 명성 획득량 +#%', 'income'],
  ['군량 생산량 +#%', 'food'],
  ['도시 군량 저장량 +#%', 'food'],
  ['성 군량 생산 +#%', 'food'],
  ['농지 개발 비용 -#%', 'food'],
  ['홍수 및 가뭄 피해 예측 성공률 +#%', 'food'],
  ['군량 소모 -#%', 'supply'],
  ['보급 소모 감소', 'supply'],
  ['적군 보급 효율 -#%', 'supply'],
  ['보급 이동 효율 상승', 'supply'],
  ['군량 구매 비용 -#%', 'supply'],
  ['도시 민심 +#%', 'loyalty'],
  ['내정 안정도 +#%', 'loyalty'],
  ['도시 민심 회복량 +#%', 'loyalty'],
  ['점령 도시 민심 안정도 +#%', 'loyalty'],
  ['점령 도시 민심 +#%', 'loyalty'],
  ['장수 충성도 상승량 +#%', 'loyalty'],
  ['도시 민심 상승 및 반란 억제 +#%', 'loyalty'],
  ['장수 충성도 하락 확률 -#%', 'loyalty'],
  ['반란 발생 확률 -#%', 'loyalty'],
  ['반란 확률 -#%', 'loyalty'],
  ['연구 완료 턴 -#', 'loyalty'],
  ['외교 협상 성공률 +#%', 'diplo'],
  ['등용 성공률 +#%', 'diplo'],
  ['인재 등용 성공률 +#%', 'diplo'],
  ['동맹 제안 성공률 +#%', 'diplo'],
  ['외교 우호도 증가량 +#%', 'diplo'],
  ['외교·내정 성공률 +#%', 'diplo'],
  ['외교·사신 임무 성공률 +#%', 'diplo'],
  ['외교·회유 성공률 상승', 'diplo'],
  ['외교 호감도 상승', 'diplo'],
  ['포로 등용·외교 성공률 상승', 'diplo'],
  ['외교·등용 효율 상승', 'diplo'],
  ['인재 등용 비용 -#%', 'diplo'],
  ['외교 성공률 +#%', 'diplo'],
  ['첩보 성공률 +#%', 'spy'],
  ['부패 적발 성공률 +#%', 'spy'],
  ['적군 침공 정보 탐지 확률 +#%', 'spy'],
  ['적군 이동 경로 정찰 성공률 +#%', 'spy'],
  ['징병량 +#%', 'recruit'],
  ['모병량 +#%', 'recruit'],
  ['훈련 효율 +#%', 'train'],
  ['부대 훈련 효율 +#%', 'train'],
  ['신규 장수 무력 성장 확률 +#%', 'train'],
  ['검병·등갑병에게 주는 피해 +#%', 'vsGeom'],
  ['방패·등갑 대상 추가 피해 +#%', 'vsGeom'],
  ['중갑 대상 피해 +#%', 'vsHeavy'],
  ['중갑에게 주는 피해 +#%', 'vsHeavy'],
  ['성벽·성문 피해 +#%', 'siegeDmg'],
  ['성벽·목책 공성 피해 +#%', 'siegeDmg'],
  ['공성·성벽 파괴 피해 +#%', 'siegeDmg'],
  ['기술 연구 비용 -#%', 'techCost'],
  ['모든 기술 연구 비용 -#%', 'techCost'],
  ['성벽 건설 및 수리 비용 -#%', 'buildCost'],
  ['성벽 건설 비용 -#%', 'buildCost'],
  ['도시 건축 비용 -#%', 'buildCost'],
  ['치명타 피해 +#%', 'critDmg'],
  ['첫 공격 피해 +#%', 'first'],
  ['턴당 기력 +#', 'mp'],
  ['책략 기력 소모 -#%', 'mpCost'],
  ['연격 확률 +#%', 'combo'],
  ['연속 사격 확률 +#%', 'volley'],
  ['주변 추가 피해 +12%', 'splash'],
  ['관통 추가 피해 +12%', 'line'],
  ['수전·산악 지형 공·방 +10%', 'terrainAny'],
  ['사기 최대치 +10', 'moraleMax'],
  ['턴당 사기 회복 +#%', 'moraleRegen'],
  ['기절 부여 확률 +#%', 'stunHit'],
  ['위축 부여 확률 +20%', 'fearHit'],
  ['둔화 부여', 'slowHit'],
  ['상태이상 해제 확률 +#%', 'cleanse'],
  ['사거리 +1(원거리만)', 'rngPlus'],
  ['고유특기 발동 확률 +#%', 'passive'],
  ['책략 범위 +1칸', 'radius'],
  ['정찰 범위 +#', 'detect'],
  ['성 내정 수입 +#%', 'income'],
  ['성 민심·충성 +#%', 'loyalty'],
  ['성 군량 유지비 -#%', 'supply'],
  ['외교·등용 성공률 +#%', 'diplo'],
  ['첩보·정찰 성공률 +#%', 'spy'],
  ['중갑(검병·등갑병·창병)에게 주는 피해 +#%', 'vsHeavy'],
  ['건축·성벽 수리 비용 -#%', 'buildCost'],
  ['한 턴 2회 공격', 'doubleAct'],
];
SK.treasureClauseKey = function (s) { return String(s || '').replace(/\d+/g, '#').replace(/%/g, '').replace(/\s+/g, ''); };
SK.TREASURE_CLAUSE_MAP = (function () {
  const m = {};
  SK.TREASURE_CLAUSE_RULES.forEach((r) => { m[SK.treasureClauseKey(r[0])] = r[1]; });
  return m;
})();
/* 옛 정규식 규칙 — 표에 없는 새 문구를 위한 안전망(순서가 중요하다) */
SK.TREASURE_FX_RULES = [
  [/공포[·,]?\s*혼란[^,]*면역|혼란[·,]?\s*공포[^,]*면역/, 'immuneFC'],
  [/역병\s*면역/, 'immunePoison'],
  [/무기\s*흘림\s*방지|무기\s*내구\s*손실\s*무효/, 'immuneDisarm'],
  [/무기\s*해제[·,]?\s*방어력\s*약화/, 'disarm'],
  [/아군\s*상태이상\s*해제\s*확률|아군\s*혼란\s*회복/, 'cleanse'],
  [/상태이상\s*저항/, 'statusRes'],
  [/사거리\s*\+\s*\d+/, 'rngPlus'],
  [/이동\s*후\s*사격\s*피해\s*감소\s*없음/, 'moveShot'],
  [/범위\s*효과\s*확대/, 'radius'],
  [/연격\s*확률|단일\s*대상\s*연격|연격\s*발동/, 'combo'],
  [/연속\s*사격|연사\s*확률|연속\s*투사체/, 'volley'],
  [/1턴\s*2회|한\s*턴\s*(?:에\s*)?두\s*번|2회\s*근접\s*공격|두\s*번\s*벤다|쌍검으로\s*두/, 'doubleAct'],
  [/험지\s*이동\s*페널티\s*무효|지형\s*제약\s*경감|이동\s*페널티\s*경감|지형\s*이동\s*페널티/, 'rough'],
  [/(무력|지력|통솔|매력|정치|이동력)\s*\+\s*\d+/, 'stat'],
];
SK.parseTreasureFx = function (effect) {
  const fx = { rough: false };
  SK.TREASURE_FX_KEYS.forEach((k) => { fx[k] = 0; });
  const used = [], notes = [];
  const clampV = (x) => Math.max(-60, Math.min(80, x));
  const add = (hook, val) => {
    if (SK.TREASURE_FX_FLAGS[hook]) { fx[hook] = 1; return; }
    fx[hook] = clampV(fx[hook] + val);
  };
  String(effect || '').split(/,|\s·\s/).forEach((raw) => {
    const cl = raw.trim();
    if (!cl) return;
    let hook = SK.TREASURE_CLAUSE_MAP[SK.treasureClauseKey(cl)] || null;
    if (!hook) {
      for (let i = 0; i < SK.TREASURE_FX_RULES.length; i++) {
        if (SK.TREASURE_FX_RULES[i][0].test(cl)) { hook = SK.TREASURE_FX_RULES[i][1]; break; }
      }
    }
    const m = cl.match(/([+\-])\s*(\d+)/);
    const signed = m ? (m[1] === '+' ? 1 : -1) * Number(m[2]) : null;
    if (hook === 'stat') return;
    if (!hook) { notes.push(cl); return; }
    if (hook === 'rough') { fx.rough = true; used.push({ cl, hook, v: null }); return; }
    /* 숫자가 없는 문구는 훅별 기본값으로 옮기되, 기본값임을 남긴다 */
    let v = signed;
    if (v == null) {
      const dflt = SK.TREASURE_FX_DEFAULT[hook];
      if (dflt == null) { notes.push(cl); return; }
      v = dflt; used.push({ cl, hook, v, d: true });
    } else {
      used.push({ cl, hook, v });
    }
    if (hook === 'both') { add('taken', Math.abs(v)); add('magicTaken', Math.abs(v)); return; }
    if (hook === 'atkDef') { add('atk', v); add('def', v); return; }
    if (hook === 'magicVuln') { add('magicTaken', -Math.abs(v)); return; }
    if (hook === 'magicMorale') { add('magic', v); add('morale', Math.round(v / 2)); return; }
    if (hook === 'terrainAny') { add('water', v); add('mountain', v); return; }
    if (SK.TREASURE_FX_ABS[hook]) { add(hook, Math.abs(v)); return; }
    add(hook, v);
  });
  return { fx, used, notes };
};
SK.TREASURE_FX_CACHE = {};
SK.treasureFx = function (t) {
  if (!t) return { fx: {}, used: [], notes: [] };
  const key = t.id + ':' + t.effect;
  if (!SK.TREASURE_FX_CACHE[key]) SK.TREASURE_FX_CACHE[key] = SK.parseTreasureFx(t.effect);
  return SK.TREASURE_FX_CACHE[key];
};
/* 장수가 장착한 보물의 전장 수치를 합산한다 (battle.js makeAlly가 부대에 넘긴다) */
SK.heroTreasureFx = function (h) {
  const out = { rough: false };
  SK.TREASURE_FX_KEYS.forEach((k) => { out[k] = 0; });
  if (!h || !h.equip) return out;
  Object.values(h.equip).forEach((id) => {
    const t = SK.TREASURE_BY_ID[id];
    if (!t) return;
    const fx = SK.treasureFx(t).fx;
    SK.TREASURE_FX_KEYS.forEach((k) => { out[k] += fx[k] || 0; });
    if (fx.rough) out.rough = true;
  });
  SK.TREASURE_FX_KEYS.forEach((k) => { out[k] = Math.max(-60, Math.min(80, out[k])); });
  return out;
};
/* 한 보물의 전장 적용 문구 — 보물 화면·장수 정보가 같은 함수를 쓴다 */
/* v5.31 — 표기 단위를 값의 성격별로 나눈다 (퍼센트 / 퍼센트p / 합산 수치 / 플래그) */
SK.TREASURE_FX_PCT = { atk: 1, def: 1, defWall: 1, dmg: 1, magic: 1, evade: 1, counter: 1, heal: 1, first: 1, exp: 1,
  combo: 1, volley: 1, splash: 1, line: 1, water: 1, mountain: 1, night: 1, reflect: 1, charge: 1, flank: 1,
  moraleSave: 1, moraleRegen: 1, stunHit: 1, fearHit: 1, disarm: 1, statusRes: 1, cleanse: 1,
  pursuit: 1, meleeTaken: 1, gateDmg: 1, lossCut: 1, passive: 1, income: 1, supply: 1, diplo: 1, duel: 1 };
SK.TREASURE_FX_NEG = { taken: 1, magicTaken: 1, mpCost: 1, nightTaken: 1, moraleHit: 1, supply: 1,
  meleeTaken: 1, lossCut: 1, techCost: 1, buildCost: 1 };   // v5.58 — 덜 받거나 덜 쓰는 값
/* v5.31 — '−N'으로 읽어야 자연스러운 문구 (군량 유지비 −N%, 적 사기 −N) */
SK.TREASURE_FX_NEG_LABEL = { supply: '성 군량 유지비', moraleHit: '적 사기', lossCut: '패전 병력 손실',
  techCost: '기술 연구 비용', buildCost: '건축·성벽 수리 비용', meleeTaken: '근접 받는 피해', nightTaken: '야간 받는 피해' };   // 이름만 바꾸고 −단위는 같다   // 값이 클수록 '−'(상대를 깎거나 덜 받는다)
/* v5.59 — 보물 효과를 '어디에 붙는가'로 나눈다.
   예전에는 모든 수치를 "전장 적용" 한 줄로 묶어, 청동령의 `징병량 +10%`·`외교 성공률`·
   `내정 수입` 같은 성·나라 효과까지 "전장 적용 징병량 +10%"로 보였다(사용자 제보).
   아래 표에 든 훅만 내정·외교 쪽이고, 나머지는 전부 전장(공격·방어·책랕·사기·상태이상·이동)이다.
   · income 성 내정 수입 · food 군량 생산 · loyalty 민심·충성 · recruit 징병량 · train 훈련 효율
   · supply 군량 유지비 · diplo 외교·등용 · spy 첨보·정찰 · detect 정찰 범위
   · techCost 기술 연구비 · buildCost 건축·성벽 수리비 */
SK.TREASURE_FX_DOMESTIC = { income: 1, food: 1, loyalty: 1, recruit: 1, train: 1, supply: 1,
  diplo: 1, spy: 1, detect: 1, techCost: 1, buildCost: 1 };
SK.TREASURE_SCOPE_LABEL = { battle: '전장 적용', domestic: '내정·외교 적용' };
SK.treasureScopeOf = function (k) { return SK.TREASURE_FX_DOMESTIC[k] ? 'domestic' : 'battle'; };
SK.fxSumLine = function (fx, asArray, scope) {
  const parts = [];
  if (fx) {
    SK.TREASURE_FX_KEYS.forEach((k) => {
      const v = fx[k] || 0;
      if (!v) return;
      if (scope && SK.treasureScopeOf(k) !== scope) return;
      const lab = SK.TREASURE_FX_LABEL[k];
      if (k === 'doubleAct' || k === 'pierce' || k === 'immuneFC' || k === 'immunePoison' ||
          k === 'immuneDisarm' || k === 'rngPlus' || k === 'moveShot') { parts.push(lab); return; }
      if (SK.TREASURE_FX_NEG[k]) {
        const nl = SK.TREASURE_FX_NEG_LABEL[k] || lab;
        parts.push(v > 0 ? `${nl} −${v}${k === 'moraleHit' ? '' : '%'}` : `${nl} +${-v}%`);
        return;
      }
      if (k === 'crit' || k === 'critDmg' || k === 'critRes') { parts.push(`${lab} ${v > 0 ? '+' : ''}${v}%p`); return; }
      if (k === 'mp' || k === 'morale' || k === 'moraleMax') { parts.push(`${lab} ${v > 0 ? '+' : ''}${v}`); return; }
      if (k === 'slowHit') { parts.push(lab); return; }
      if (k === 'radius' || k === 'detect') { parts.push(`${lab} +${v}${k === 'radius' ? '칸' : ''}`); return; }
      parts.push(`${lab} ${v > 0 ? '+' : ''}${v}%`);
    });
    if (fx.rough && (!scope || scope === 'battle')) parts.push('험지 이동 페널티 무효');
  }
  return asArray ? parts : parts.join(' · ');
};
/* v5.59 — 한 보물/장수의 효과를 { battle:[…], domestic:[…] } 로 나눠 돌려준다 (UI 공용) */
SK.fxScopes = function (fx) {
  return { battle: SK.fxSumLine(fx, true, 'battle'), domestic: SK.fxSumLine(fx, true, 'domestic') };
};
SK.treasureFxScopes = function (t) {
  return SK.fxScopes(SK.treasureFx(t).fx);
};
SK.treasureFxLine = function (t) {
  const { fx } = SK.treasureFx(t);
  return SK.fxSumLine(fx);
};
SK.treasureFxApplied = function (t) {
  return SK.treasureFxLine(t) || '';
};
SK.treasureFxNotes = function (t) { return SK.treasureFx(t).notes || []; };
/* v5.30 — 문구에 숫자가 없어 기본값으로 옮긴 절 (UI에 '기본값'으로 밝힌다) */
SK.treasureFxDefaults = function (t) {
  return (SK.treasureFx(t).used || []).filter((u) => u.d).map((u) => u.cl);
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

/* v6.0 — battleTypeFor는 파일 뒤쪽(전장 유형 표 아래)에서 한 번만 정의한다.
   (여기 있던 옛 정의는 지웠다 — 표를 두 벌 두면 지형 매칭이 갈라진다) */

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
  /* v6.0 — 평야전 리뉴얼: 중앙 교차로 좌우에 고지대 언덕 두 개와 가운데 숲덩이.
     언덕을 먼저 잡은 쪽이 활·노로 길을 내려다보고, 기병은 언덕을 돌아 나가야 한다. */
  blob(g, 6, 7, 2, 'U', 205); blob(g, 17, 16, 2, 'U', 206);
  blob(g, 10, 6, 2, 'F', 207); blob(g, 14, 18, 2, 'F', 208);
  /* v5.42 — 마을을 중앙 교차로 곁으로 옮겼다 (예전엔 네 모서리 숲 앞이라 아무도 지나치지 않았다) */
  return finishMap('plain', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[8, 11], [16, 11], [cx, 15]] });
}

/* ── 도하전 ── (배경: 세로 길 + 가운데 강과 나무다리) */
function fordMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  fillRect(g, 10, 13, 0, n - 1, 'W');
  fillRect(g, 10, 13, cx - 1, cx, 'B');
  fillRect(g, 10, 13, 3, 4, 'S'); fillRect(g, 10, 13, 19, 20, 'S');
  /* v6.0 — 도하전 리뉴얼: 다리 옆 갈대밭(화공 지형)과 가운데 여울 하나.
     다리만 노리면 갈대밭에 붙은 부대가 불에 탄다 — 여울로 우회하는 길이 생겼다. */
  fillRect(g, 9, 9, 7, 10, 'J'); fillRect(g, 14, 14, 13, 16, 'J');
  fillRect(g, 10, 13, cx - 6, cx - 6, 'S');
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  blob(g, 3, 4, 2, 'F', 11); blob(g, 20, 4, 2, 'F', 12);
  blob(g, 3, 19, 2, 'F', 13); blob(g, 20, 19, 2, 'F', 14);
  paint(g, [[0, 0], [0, 1], [1, 0], [23, 0], [22, 0], [23, 1], [0, 23], [0, 22], [1, 23], [23, 23], [22, 23], [23, 22]], 'M');
  /* v5.42 — 마을은 다리 어귀 양쪽 (북안 좌·우 + 남안 중앙) */
  return finishMap('ford', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[9, 9], [15, 9], [cx, 15]] });
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
  /* v6.0 — 산전 리뉴얼: 계곡 양쪽 산허리에 고지대(U)를 얹고, 왼쪽에 우회 오솔길을 냈다.
     정면 다리 하나만 두면 늘 같은 싸움이라, 넓은 산허리로 돌아가는 길을 만든다. */
  fillRect(g, 2, 9, 5, 5, 'R'); fillRect(g, 14, 21, 5, 5, 'R');
  fillRect(g, 2, 21, 6, 6, 'M');
  paint(g, [[3, 4], [4, 4], [5, 4], [6, 4], [17, 4], [18, 4], [19, 4], [20, 4]], 'U');
  paint(g, [[4, 17], [5, 17], [6, 17], [7, 17], [16, 17], [17, 17], [18, 17], [19, 17]], 'U');
  /* v5.42 — 마을은 다리 남·북 어귀 (협곡 길목을 두고 붙는 자리) */
  return finishMap('mountain', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[8, 13], [15, 13], [cx, 9]] });
}

/* ── 밀림 매복전 ── (배경: 열린 풀밭 + 십자로 + 나무 덩어리) */
function forestMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  hline(g, 10, 0, n - 1, 'R'); hline(g, 11, 0, n - 1, 'R');
  [[6, 3], [17, 3], [6, 8], [18, 8], [6, 15], [17, 15], [5, 20], [18, 20]].forEach(([x, y], i) => blob(g, x, y, 2, 'F', 31 + i));
  blob(g, 1, 12, 1, 'M', 41); blob(g, 22, 12, 1, 'M', 42);
  /* v6.0 — 밀림 리뉴얼: 숲 사이 고지대 둘레와 숲을 가로지르는 오솔길.
     큰 숲만 있으면 매복만 반복되므로, 언덕을 잡고 길을 내는 싸움을 넣었다. */
  blob(g, 12, 6, 2, 'U', 209); blob(g, 12, 17, 2, 'U', 210);
  hline(g, 5, 4, 20, 'R'); hline(g, 18, 4, 20, 'R');
  /* v5.42 — 마을은 중앙 십자로 갈래 곁 */
  return finishMap('forest', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[9, 9], [15, 11], [cx, 14]] });
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
  /* v6.0 — 협곡 리뉴얼: 잔도 위 절벽에 고지대(U)와 외길 밖으로 난 염소길(오솔길).
     한 줄 길목만 두면 창병 벽 하나로 끝나므로, 절벽 위 사격 자리와 우회로를 넣었다. */
  vline(g, 6, 0, 6, 'P'); vline(g, 6, 7, 23, 'P'); vline(g, 6, 7, 23, 'R'); vline(g, 6, 0, 6, 'R');
  paint(g, [[4, 6], [5, 6], [7, 6], [8, 6], [15, 6], [16, 6], [17, 6], [18, 6]], 'U');
  paint(g, [[4, 17], [5, 17], [7, 17], [8, 17], [15, 17], [16, 17], [17, 17], [18, 17]], 'U');
  /* v5.42 — 마을은 다리 남·북 어귀 */
  return finishMap('gorge', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[9, 9], [14, 12]] });
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
  /* v6.0 — 야영 기습전 리뉴얼: 적 진영 안에 군량고(Q)·무기고(Y)와 목책(N).
     막사만 부수는 싸움에서, 보급품과 무기를 먼저 차지하는 싸움으로 바꿨다. */
  setT(g, 3, 9, 'Q'); setT(g, 4, 14, 'Q'); setT(g, 3, 15, 'Y'); setT(g, 8, 9, 'N'); setT(g, 8, 10, 'N');
  setT(g, 8, 13, 'N'); setT(g, 8, 14, 'N'); setT(g, 8, 15, 'N');
  /* v5.42 — 마을은 camp 앞 중앙 길목 (진영 앞 넓은 길 y=10 곁) */
  return finishMap('camp', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[8, 10], [16, 10], [cx, 13]] });
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
  /* v6.0 — 수전 리뉴얼: 두 다리 옆 갈대밭과 남쪽 포구(O).
     물가 갈대에 붙은 배는 불에 약하고, 포구를 잡으면 선착이 빨라진다. */
  fillRect(g, 8, 8, 8, 11, 'J'); fillRect(g, 16, 16, 13, 16, 'J');
  setT(g, 18, 5, 'O'); setT(g, 19, 6, 'O'); setT(g, 5, 5, 'O');
  /* v5.42 — 마을은 서·동 다리 북쪽 어귀 + 남안 길목 */
  return finishMap('naval', g, { ally: [cx, n - 2], enemy: [cx, 2], villages: [[6, 8], [17, 8], [cx, 17]] });
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
  /* v6.0 — 요새전 리뉴얼: 성문으로 오르는 진입로 양산에 고지대와 보루(T), 앞들에 갈대밭.
     성문만 정면으로 두드리면 손해가 크다 — 진입로 언덕을 먼저 잡는 싸움. */
  blob(g, 5, 15, 2, 'U', 211); blob(g, 18, 15, 2, 'U', 212);
  setT(g, 4, 9, 'T'); setT(g, 4, 14, 'T');
  fillRect(g, 17, 17, 9, 10, 'J'); fillRect(g, 17, 17, 13, 14, 'J');
  /* v5.42 — 마을은 성문 앞 좌·우 + 안쪽 성벽 앞 한 곳 */
  return finishMap('fortress', g, { ally: [cx, n - 2], enemy: [cx, 8], villages: [[7, 14], [16, 14], [8, 9]] });
}

/* ── 공성전 — 겹성벽 (소 1중 24×24 · 중 2중 28×28 · 대 3중 32×32) ──
   성벽 줄(row)은 배경 그림(battle_siege*.webp)의 성벽과 같은 자리에 맞춘다.
   · 소도시: 아래쪽 성벽 1줄 + 중앙 정문, 그 위가 성 안(궁궐·천막)
   · 중도시: 1중(아래) · 2중(가운데) 두 줄 + 각각 중앙 정문
   · 대도시: 1중(아래) · 2중(가운데) + 맨 위 중앙의 네모(ㄷ자) 본성 성곽 —
     본성 성곽 안에 적 총대장 본진(1×1)이 있다.
   1단 문을 깨면 1·2단 사이 외성 마당, 2단 문을 깨면 2·3단 사이 마당,
   마지막 본성 문을 깨면 총대장 본진 앞까지 들어갈 수 있다.
   v6.0 — 중·대도시는 정문 외에 동·서 측면 샛문이 뚫리고, 겹성벽마다 군량고(Q)·무기고(Y)가
   놓인다. 정문 하나만 두드리면 손해가 큰 '우회 공성전'이 된다. */
function siegeBase(rings) {
  rings = rings === 3 ? 3 : (rings === 2 ? 2 : 1);
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
  /* v6.0 — 중·대도시 동·서 측면 샛문. 성벽 한 칸짜리 작은 문이라 정문보다 약하다.
     공격측이 정면에만 몰리지 않고 측면을 찌를 수 있게 한다. */
  if (rings >= 2) {
    const sx = [Math.round(n * 0.185), n - 1 - Math.round(n * 0.185)];
    walls.forEach((rows) => { rows.forEach((y) => { sx.forEach((x) => setT(g, y, x, 'G')); }); });
  }
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
  /* v6.0 — 성 안 군량고·무기고: 겹성벽 사이 마당마다 하나씩, 성문 안쪽 좌·우에 붙인다.
     공격측이 문을 뚫고 들어와 차지하면 그 진영 전체가 회복·공격 버프를 받는다. */
  /* 성벽 줄을 건드리지 않도록 마당 안쪽 두 줄(outer-2, outer-3)에만 놓는다 */
  const court = (y, leftX, rightX) => {
    setT(g, y, leftX, 'Q'); setT(g, y - 1, leftX, 'Y');
    setT(g, y, rightX, 'Y'); setT(g, y - 1, rightX, 'Q');
  };
  if (rings === 3) {
    court(outer - 2, cx - 8, cx + 7);
    court(walls[0][1] - 2, cx - 7, cx + 6);
  } else if (rings === 2) {
    court(outer - 2, cx - 7, cx + 6);
  } else {
    court(outer - 2, cx - 6, cx + 5);
  }
  return { g: g, n: n, cx: cx, walls: walls, outer: outer, cfg: cfg, enemyBase: enemyBase, rings: rings, palEnd: palEnd };
}

function siegeMap(rings) {
  const s0 = siegeBase(rings);
  const g = s0.g, n = s0.n, cx = s0.cx, outer = s0.outer;
  /* v6.0 — 성 밖에도 전략 지형: 성문 앞 갈대밭과 진입로 언덕 */
  fillRect(g, outer + 3, outer + 3, cx - 7, cx - 4, 'J');
  fillRect(g, outer + 3, outer + 3, cx + 3, cx + 6, 'J');
  blob(g, cx - 8, n - 5, 1, 'U', 221);
  blob(g, cx + 7, n - 5, 1, 'U', 222);
  /* v5.42 — 마을은 성문 앞 좌·우 협공 자리 + 1중·2중 성벽 사이 마당 한 곳
     (예전에는 소도시 마을이 성 안 구석·성 밖 모서리에 있어 아무도 밟지 않았다) */
  const villages = s0.rings === 3
    ? [[cx - 5, outer + 2], [cx + 4, outer + 2], [6, 21]]
    : (s0.rings === 2
      ? [[cx - 5, outer + 2], [cx + 4, outer + 2], [5, 16]]
      : [[cx - 5, outer + 2], [cx + 4, outer + 2], [6, 8]]);
  const key = s0.rings === 3 ? 'siege3' : (s0.rings === 2 ? 'siege2' : 'siege');
  return finishMap(key, g, { ally: [cx, n - 2], enemy: s0.enemyBase, villages: villages });
}

/* ── v6.0 — 수상 공성전: 성 앞 강물 + 다리 2개 + 여울 1곳 ──
   하비·강하·건업·한성·웅진·부산·탐라처럼 물에 닿은 성을 칠 때 쓴다.
   성벽과 성문은 그대로 두고, 공격측 들판을 강이 가로지른다 — 다리를 먼저 건너야 한다. */
function siegeNavalMap(rings) {
  const s0 = siegeBase(rings);
  const g = s0.g, n = s0.n, cx = s0.cx, outer = s0.outer;
  const y0 = outer + 2;
  const y1 = Math.min(n - 4, outer + 3);
  /* 강물 두 줄 — 성 앞을 가로지른다 */
  fillRect(g, y0, y1, 0, n - 1, 'W');
  /* 다리 두 개(서·동)와 가운데 여울 하나. 여울은 느리지만 배 없이 걸어 건넌다 */
  fillRect(g, y0, y1, cx - 7, cx - 6, 'B');
  fillRect(g, y0, y1, cx + 5, cx + 6, 'B');
  fillRect(g, y0, y1, cx - 1, cx, 'S');
  /* 다리 어귀 길 — 다리에서 성문 앞길과 남쪽 들판으로 이어진다 */
  [cx - 7, cx + 5].forEach((bx) => {
    setT(g, outer + 1, bx, 'R'); setT(g, outer + 1, bx + 1, 'R');
    fillRect(g, y1 + 1, n - 1, bx, bx + 1, 'R');
  });
  /* 물가 갈대밭(화공 지형)과 포구 */
  fillRect(g, y0 - 1, y0 - 1, 3, 7, 'J');
  fillRect(g, y1 + 1, y1 + 1, n - 8, n - 4, 'J');
  setT(g, y0 - 1, 2, 'O'); setT(g, y1 + 1, n - 3, 'O');
  /* 강 남안에 고지대 둑 */
  blob(g, cx - 9, n - 5, 1, 'U', 231);
  blob(g, cx + 8, n - 6, 1, 'U', 232);
  const key = s0.rings === 3 ? '__siege_naval3' : (s0.rings === 2 ? '__siege_naval2' : '__siege_naval');
  return finishMap(key, g, { ally: [cx, n - 2], enemy: s0.enemyBase,
    villages: [[cx - 6, y0 - 1], [cx + 5, y1 + 1], [cx, n - 3]] });
}

/* ── v6.0 — 산성 공략전: 산등성이 + 좁은 비탈 + 고지대 + 목책/돌성벽 ──
   한중·안시성·국내성·함흥·무릉·영릉·계양처럼 산 위에 앉은 성.
   성 밖은 전부 산지라 성문 앞 비탈길 하나가 정면, 왼쪽 염소길이 우회로다. */
function siegeMountainMap(rings) {
  const s0 = siegeBase(rings);
  const g = s0.g, n = s0.n, cx = s0.cx, outer = s0.outer;
  /* 성문 앞 비탈(중앙 두 줄)만 남기고 성 밖을 산으로 바꾼다 */
  for (let y = outer + 1; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cur = g[y][x];
      if (cur === 'R' || cur === 'B' || cur === 'F' || cur === 'W' || cur === 'U' || cur === 'J') continue;
      if (x >= cx - 1 && x <= cx) { setT(g, y, x, 'R'); continue; }
      setT(g, y, x, 'M');
    }
  }
  /* 왼쪽 염소길 — 성벽까지 이어지는 좁은 오솔길. 여기에 측면 문을 낸다 */
  fillRect(g, outer + 1, n - 2, 3, 3, 'R');
  s0.walls.forEach((rows) => { rows.forEach((y) => setT(g, y, 3, 'G')); });
  /* 비탈을 지키는 고지대 능선과 목책 */
  paint(g, [[outer + 2, cx - 5], [outer + 3, cx - 6], [outer + 4, cx - 5], [outer + 5, cx - 6], [outer + 6, cx - 5]], 'U');
  paint(g, [[outer + 2, cx + 4], [outer + 3, cx + 5], [outer + 4, cx + 4], [outer + 5, cx + 5], [outer + 6, cx + 4]], 'U');
  paint(g, [[outer + 1, cx - 4], [outer + 1, cx - 3], [outer + 1, cx + 2], [outer + 1, cx + 3]], 'N');
  /* 성 안쪽에도 산등성 언덕 한 줄 (수비측 원거리 사격 자리) */
  paint(g, [[outer - 3, cx - 9], [outer - 3, cx + 8], [outer - 4, cx - 8], [outer - 4, cx + 7]], 'U');
  const key = s0.rings === 3 ? '__siege_mountain3' : (s0.rings === 2 ? '__siege_mountain2' : '__siege_mountain');
  return finishMap(key, g, { ally: [cx, n - 2], enemy: s0.enemyBase,
    villages: [[cx - 5, outer + 3], [cx + 4, outer + 5], [cx, n - 4]] });
}

/* ── v6.0 — 보급대 습격전(요격전): 적 보급고·호송 마차를 끊는다 ──
   길게 늘어선 보급 행렬을 가운데서 끊는 싸움. 군량고(Q)·무기고(Y)를 차지하면
   적 사기가 급락하고 이어지는 공성전까지 이득이 남는다. */
function convoyMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  /* 남북으로 난 보급로와 가운데 마차 진지 */
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  hline(g, 11, 0, n - 1, 'R'); hline(g, 12, 0, n - 1, 'R');
  fillRect(g, 9, 14, cx - 4, cx + 3, 'D');
  /* 호송 진지의 군량고·무기고 */
  setT(g, 10, cx - 3, 'Q'); setT(g, 13, cx + 2, 'Q');
  setT(g, 13, cx - 3, 'Y'); setT(g, 10, cx + 2, 'Y');
  /* 진지를 두른 목책 — 동·서 어귀만 열어 둔다 */
  paint(g, [[9, cx - 4], [9, cx - 3], [9, cx - 2], [9, cx + 1], [9, cx + 2], [9, cx + 3]], 'N');
  paint(g, [[14, cx - 4], [14, cx - 3], [14, cx - 2], [14, cx + 1], [14, cx + 2], [14, cx + 3]], 'N');
  /* 좌우 숲·언덕, 남쪽 갈대밭(불 지르기 좋은 자리) */
  blob(g, 3, 5, 2, 'F', 241); blob(g, 20, 18, 2, 'F', 242);
  blob(g, 4, 18, 2, 'U', 243); blob(g, 19, 5, 2, 'U', 244);
  fillRect(g, 16, 16, 4, 9, 'J');
  blob(g, 2, 11, 1, 'M', 245); blob(g, 21, 12, 1, 'M', 246);
  return finishMap('__convoy', g, { ally: [cx, n - 2], enemy: [cx, 7],
    villages: [[6, 11], [17, 12], [cx, 16]] });
}

/* ── v6.0 — 나루터 부교전(요격전): 중앙 좁은 부교 + 좌우 갈대밭(화공) ──
   넓은 강에 부교 하나만 놓인 나루. 부교는 좁고, 좌우 갈대밭에 붙은 부대는 불에 탄다. */
function bridgeMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  fillRect(g, 10, 13, 0, n - 1, 'W');
  /* 부교 어귀 길을 먼저 내고, 그 위에 부교를 얹는다 (길이 부교를 덮지 않게) */
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  fillRect(g, 10, 13, cx - 1, cx, 'L');          // 중앙 좁은 부교 (두 칸)
  /* 좌우 갈대밭 — 화공이 통하는 자리 */
  fillRect(g, 8, 9, 5, 9, 'J'); fillRect(g, 14, 15, 14, 18, 'J');
  /* 물가 포구와 둑길 */
  setT(g, 9, 3, 'O'); setT(g, 14, 20, 'O');
  blob(g, 3, 4, 1, 'U', 251); blob(g, 20, 19, 1, 'U', 252);
  blob(g, 4, 19, 2, 'F', 253); blob(g, 19, 4, 2, 'F', 254);
  paint(g, [[0, 0], [0, 1], [1, 0], [23, 23], [23, 22], [22, 23], [0, 23], [1, 23], [0, 22], [23, 0], [22, 0], [23, 1]], 'M');
  return finishMap('__bridge', g, { ally: [cx, n - 2], enemy: [cx, 2],
    villages: [[cx - 4, 9], [cx + 3, 14], [cx, 17]] });
}

/* ── v6.0 — 북방 초원·목책전: 넓은 초원 + 목책 진지 + 고지대 ──
   부여·옥저 같은 북방 거점과 평원 요격. 적은 목책 진지에 웅크리고, 초원의 언덕이 열쇠다. */
function steppeMap() {
  const n = 24, cx = 12;
  const g = mkGrid(n, n, 'P');
  vline(g, cx - 1, 0, n - 1, 'R'); vline(g, cx, 0, n - 1, 'R');
  hline(g, 12, 1, n - 2, 'R');
  /* 적 목책 진지 — 위쪽을 두르고 가운데 두 어귀만 연다 */
  hline(g, 7, 2, cx - 3, 'N'); hline(g, 7, cx + 3, n - 3, 'N');
  vline(g, 2, 2, 7, 'N'); vline(g, n - 3, 2, 7, 'N');
  fillRect(g, 2, 6, 3, n - 4, 'D');
  setT(g, 4, cx - 4, 'Q'); setT(g, 4, cx + 3, 'Y');
  /* 초원의 고지대 언덕 — 기병이 돌아가야 하는 자리 */
  blob(g, 5, 14, 2, 'U', 261); blob(g, 18, 14, 2, 'U', 262);
  blob(g, 11, 18, 1, 'U', 263);
  /* 드문드문한 숲과 물웅덩이 */
  blob(g, 3, 20, 1, 'F', 264); blob(g, 20, 20, 1, 'F', 265);
  fillRect(g, 16, 16, 6, 8, 'W'); fillRect(g, 16, 16, 7, 7, 'S');
  blob(g, 1, 12, 1, 'M', 266); blob(g, 22, 12, 1, 'M', 267);
  return finishMap('__steppe', g, { ally: [cx, n - 2], enemy: [cx, 3],
    villages: [[6, 10], [17, 10], [cx, 15]] });
}

SK.MAPS = {};
plainMap(); fordMap(); mountainMap(); forestMap(); gorgeMap(); campMap(); navalMap(); fortressMap();
siegeMap(1); siegeMap(2); siegeMap(3);
/* v6.0 — 신규 전장 6종 (수상 공성·산성 공략·보급대 습격·나루터 부교·북방 초원) */
siegeNavalMap(1); siegeNavalMap(2); siegeNavalMap(3);
siegeMountainMap(1); siegeMountainMap(2); siegeMountainMap(3);
convoyMap(); bridgeMap(); steppeMap();
/* 모든 전장 유형의 지도가 실제로 있는지 확인 (없으면 startBattle이 터진다) */
Object.keys(SK.BATTLE_TYPES || {}).forEach((k) => {
  const key = SK.BATTLE_TYPES[k].map;
  if (!SK.MAPS[key]) console.error('전장 지도 없음:', k, key);
});
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
/* v6.0 — 수상 공성·산성 공략은 성 크기별로 지도 키가 따로 있다 (1중·2중·3중) */
SK.siegeVariantKey = function (type, rings) {
  const base = type === 'siege_naval' ? '__siege_naval' : type === 'siege_mountain' ? '__siege_mountain' : null;
  if (!base) return null;
  const r = rings >= 3 ? 3 : (rings === 2 ? 2 : 1);
  return r === 1 ? base : base + r;
};
/* 전장 유형 → 실제 지도 키. 공성 계열은 성벽 겹수(rings)로 고른다 */
SK.mapKeyFor = function (type, rings) {
  const v = SK.siegeVariantKey(type, rings);
  if (v && SK.MAPS[v]) return v;
  if (type === 'siege' || type === 'defense') return SK.siegeMapKey(rings || 1);
  const bt = SK.BATTLE_TYPES && SK.BATTLE_TYPES[type];
  return (bt && bt.map) || 'siege';
};
/* 공성 계열인가 — 성문·성벽을 뚫고 성 안으로 들어가는 전투 */
SK.isSiegeType = function (type) {
  return type === 'siege' || type === 'defense' || type === 'siege_naval' || type === 'siege_mountain';
};
/* v5.93 — 요새 거점의 성벽 방어 계수 (일반 성 1.0 · 요새 2.0).
   공성·수성·거점 방어 계산과 요새전 수비측 방어력에 그대로 쓴다.
   v5.95 — 관문도 요새와 같이 2.0 (사용자 요청 '관문도 요새처럼'). */
SK.fortressWallMul = function (city) {
  return (city && (city.type === 'fortress' || city.type === 'pass')) ? 2 : 1;
};

/* v5.17 — 전장 격자 크기. 요격전·소도시 24 / 중도시 28 / 대도시 32 */
SK.battleSizeFor = function (type, rings) {
  if (type === 'siege' || type === 'defense' || type === 'siege_naval' || type === 'siege_mountain') {
    return rings >= 3 ? 32 : (rings === 2 ? 28 : 24);
  }
  if (type === 'fortress') return 24;
  return 24;
};

/* 전장 유형 정보 */
SK.BATTLE_TYPES = {
  siege: { name: '공성전', hanja: '', map: 'siege', img: 'siege', desc: '성벽과 성문을 뚫어라',
    objective: '적을 전멸시켜라 — 적 본진을 점령하면 사기가 뒤집힌다', skill: '수적과 궁기병이 성문 돌파에 유리합니다.' },
  fortress: { name: '요새전', hanja: '', map: 'fortress', img: 'fortress', desc: '목책과 요새를 함락하라',
    objective: '적을 전멸시켜라 — 적 본진을 점령하면 사기가 뒤집힌다', skill: '보병과 책사가 성문 공략에 적합합니다.' },
  /* v5.3 — 행군 요격전 8종 (v5.15에서 밀림·협곡·야영 3종 추가) */
  plain: { name: '평야전', hanja: '', map: 'plain', img: 'plain', desc: '넓은 들에서 적 요격대와 맞붙는다',
    objective: '적을 전멸시켜라 — 적 본진을 점령하면 사기가 뒤집힌다', skill: '기병·무도가는 평지에서 강합니다.' },
  ford: { name: '도하전', hanja: '', map: 'ford', img: 'ford', desc: '강 건널목을 사이에 두고 맞선다',
    objective: '여울과 다리를 건너 적을 전멸시켜라', skill: '수적은 물 위를 걸을 수 있습니다.' },
  mountain: { name: '산전', hanja: '', map: 'mountain', img: 'mountain', desc: '산길을 사이에 두고 맞선다',
    objective: '산허리 길을 따라 올라가 적을 전멸시켜라', skill: '산적·야수병은 산지에서 이동력이 +1입니다.' },
  forest: { name: '밀림 매복전', hanja: '', map: 'forest', img: 'forest', desc: '숲길에서 기습을 받았다',
    objective: '오솔길을 뚫고 적을 전멸시켜라', skill: '산적·야수병은 숲에서 강하고 야수병은 숲에서 이동력 6급입니다.' },
  gorge: { name: '협곡 잔도전', hanja: '', map: 'gorge', img: 'gorge', desc: '절벽 사이 외길에서 길목을 다툰다',
    objective: '잔도를 건너 적을 전멸시켜라', skill: '창병·등갑병이 길목을 막고 궁수·연노가 절벽 그늘에서 쏩니다.' },
  camp: { name: '야영 기습전', hanja: '', map: 'camp', img: 'camp', desc: '적 야영지를 기습했다',
    objective: '막사와 보급로를 끊고 적을 전멸시켜라', skill: '기병·야수병의 돌격이 막사 사이에서 힘을 냅니다.' },
  naval: { name: '수전', hanja: '', map: 'naval', img: 'naval', desc: '강을 건너 적선을 무찌르라',
    objective: '다리와 물길을 이용해 적을 전멸시켜라', skill: '수적은 물 위를 걸을 수 있습니다.' },
  /* v5.7 — 수성전: 아군이 성 안에서 적 침공군을 맞는다 (지도는 공성전을 뒤집어 쓴다) */
  defense: { name: '수성전', hanja: '', map: 'siege', img: 'siege', desc: '성을 지켜 적을 물리쳐라',
    objective: '성을 지켜라 — 적을 전멸시켜라', skill: '궁수·궁기병은 성벽 안에서 유리합니다.' },
  /* ══ v6.0 — 신규 전장 6종 ══ */
  /* 수상 공성전: 성 앞을 강이 가로지른다. 다리 둘·여울 하나로 건너 성문을 두드린다 */
  siege_naval: { name: '수상 공성전', hanja: '', map: '__siege_naval', img: 'siege',
    desc: '성 앞 강을 건너 성을 두드린다', tone: 'siege',
    objective: '다리와 여울로 강을 건너 적을 전멸시켜라',
    skill: '갈대밭에 붙은 부대는 화공에 탄다. 다리 어귀를 먼저 잡아라.' },
  /* 산성 공략전: 성 밖이 전부 산지. 비탈 정면과 왼쪽 염소길(측면 문)이 있다 */
  siege_mountain: { name: '산성 공략전', hanja: '', map: '__siege_mountain', img: 'siege',
    desc: '산성을 비탈로 올라 함락하라', tone: 'siege',
    objective: '비탈과 염소길을 넘어 적을 전멸시켜라',
    skill: '고지대를 잡으면 사거리 +1·방어 +25%. 기병은 비탈에서 느려진다.' },
  /* 보급대 습격전: 적 보급 행렬의 군량고·무기고를 끊는다 */
  convoy: { name: '보급대 습격전', hanja: '', map: '__convoy', img: 'convoy',
    desc: '적 보급대와 호송 마차를 습격한다',
    objective: '군량고·무기고를 차지하고 호송대를 전멸시켜라',
    skill: '군량고를 차지하면 적 사기가 급락하고, 이어지는 공성전이 쉬워집니다.' },
  /* 나루터 부교전: 좁은 부교 하나와 좌우 갈대밭 */
  bridge: { name: '나루터 부교전', hanja: '', map: '__bridge', img: 'bridge',
    desc: '좁은 부교를 사이에 두고 나루를 다툰다',
    objective: '부교를 건너 적을 전멸시켜라',
    skill: '부교는 좁아 길이 막힌다. 좌우 갈대밭은 화공에 잘 탄다.' },
  /* 북방 초원·목책전: 넓은 초원과 목책 진지 */
  steppe: { name: '북방 초원·목책전', hanja: '', map: '__steppe', img: 'steppe',
    desc: '넓은 초원에서 목책 진지를 무너뜨린다',
    objective: '목책 진지를 뚫고 적을 전멸시켜라',
    skill: '기병은 초원에서 강하지만 목책과 언덕 앞에서는 힘을 못 씁니다.' },
};

/* 모든 전장 유형의 지도가 실제로 있는지 확인 (없으면 startBattle이 터진다) */
Object.keys(SK.BATTLE_TYPES).forEach((k) => {
  const key = SK.BATTLE_TYPES[k].map;
  if (!SK.MAPS[key]) console.error('전장 지도 없음:', k, key);
});

/* v6.0 — 80거점 자동 매칭: 도시 규모(소·중·대)와 cities.json의 battleType(지형)을
   함께 읽어 전장을 고른다.
   · 관문·요새           → 요새전 (목책·보루)
   · 강·바다에 닿은 성    → 수상 공성전 (다리·여울·갈대밭)
   · 산악 성(산지 병력)   → 산성 공략전 (비탈·고지대·측면 문)
   · 북방 초원(평원 성)   → 북방 초원·목책전
   · 나머지 내륙 성       → 공성전 (소 1중 · 중 2중 · 대 3중 + 측면 샛문) */
SK.battleTypeFor = function (city) {
  if (!city) return 'siege';
  const t = city.type;
  const bt = city.battleType || '';
  if (t === 'pass' || t === 'fortress') return 'fortress';
  if (bt === 'naval') return 'siege_naval';
  if (bt === 'mountain') return 'siege_mountain';
  /* 성곽 도시(안시성·북평·요동)는 산성으로 친다 — 돌성벽·비탈·측면 문 */
  if (bt === 'fortress') return 'siege_mountain';
  if (bt === 'plain' || bt === 'steppe') return 'steppe';
  return 'siege';
};
/* 수성전도 같은 지형을 뒤집어 쓴다 (성을 지키는 아군이 그 성의 지형에서 싸운다) */
SK.defenseTypeFor = function (city) {
  const atk = SK.battleTypeFor(city);
  return atk === 'fortress' ? 'fortress' : 'defense';
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
    /* v6.0 — 신규 전장 적 편성 */
    siege_naval:    ['sujeok', 'gungsu', 'geombyung', 'sujeok', 'chaeksa', 'yeonnobyung', 'changbyung', 'sujeok', 'gunggi', 'gungsu'],
    siege_mountain: ['sanjeok', 'gungsu', 'yeonnobyung', 'sanjeok', 'chaeksa', 'changbyung', 'yasubyung', 'deunggabyung', 'gungsu', 'mudoga'],
    convoy:  ['gibi', 'gungsu', 'changbyung', 'gibi', 'chaeksa', 'geombyung', 'gungsu', 'mudoga', 'yeonnobyung', 'gibi'],
    bridge:  ['sujeok', 'gungsu', 'changbyung', 'sujeok', 'chaeksa', 'yeonnobyung', 'geombyung', 'sujeok', 'gungsu', 'mudoga'],
    steppe:  ['gibi', 'gibi', 'gungsu', 'changbyung', 'gibi', 'chaeksa', 'mudoga', 'gungsu', 'yasubyung', 'geombyung'],
  };
  const t = tables[type] || tables.siege;
  return t[idx % t.length];
};

/* 배치 좌표 [x, y] — 격자 크기에 맞춰 계산한다 (v5.17) */
SK.innerSlots = function (rings, cols) {
  const n = cols || (rings >= 3 ? 32 : (rings === 2 ? 28 : 24));
  return SK.enemySlots('siege', rings, n);
};
/* 성 안쪽(수비) 슬롯 — 적 본진을 감싸는 자리
   v5.90 — 가로(n)·세로(nr)를 따로 받는다 (직사각형 지도에서 세로 칸이 잘리지 않게) */
function slotsAround(base, n, count, nr) {
  const out = [];
  const ny = nr || n;
  if (!base) return [[Math.floor(n / 2), Math.floor(ny / 2)]];
  for (let dy = 0; dy <= 3; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = base.x + dx, y = base.y + dy;
      if (x < 0 || y < 0 || x >= n || y >= ny) continue;
      out.push([x, y]);
    }
    for (let dx = -2; dx <= 2; dx++) {
      const x = base.x + dx, y = base.y - dy;
      if (y < 0 || x < 0 || x >= n || y >= ny) continue;
      if (dy > 0) out.push([x, y]);
    }
  }
  return out.slice(0, count || 10);
}
SK.enemySlots = function (type, rings, cols, rows) {
  const key = SK.mapKeyFor(type, rings || 1);
  const meta = SK.MAP_META[key] || SK.MAP_META[type === 'defense' ? 'siege' : (SK.BATTLE_TYPES[type] && SK.BATTLE_TYPES[type].img)] || null;
  const m = SK.MAP_META[key] || meta;
  const n = cols || (m ? m.cols : 24);
  /* v5.90 — 세로 칸수도 따로 받는다 */
  const nr = rows || (m ? m.rows : n);
  if (type === 'defense') {
    /* 수성전 — 침공군은 성 밖 길목에서 올라온다 */
    const outerRow = Math.max(3, (m ? m.rows : n) - 3);
    const out = [];
    for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) out.push([Math.floor(n / 2) + dx, outerRow - dy]);
    return out;
  }
  /* v5.17 — 공성 수비대는 성벽 마당마다 나눠 선다(바깥 마당 → 안쪽 → 본진).
     한 곳에 뭉치면 회복 거점과 겹쳐 전투가 끝나지 않는다. */
  if (SK.isSiegeType(type) && type !== 'defense' && m) {
    const rows2 = m.rows, cx2 = Math.floor(n / 2);
    const gateRows = [];
    (SK.MAPS[key] || []).forEach((line, y) => { if (line.indexOf('G') >= 0) gateRows.push(y); });
    gateRows.sort((a, b) => a - b);
    const bands = [];
    let y0 = 1;
    gateRows.forEach((gy) => { if (gy - 1 >= y0) bands.push([y0, gy - 1]); y0 = gy + 2; });
    /* v5.33 — 맨 바깥 성문 밖(공격자가 서는 들판) 구간은 수비대 자리에서 뺀다.
       예전에는 [y0, rows-4]까지 bands에 넣어, reverse() 때 그 들판이 가장 먼저 쓰여
       1턴부터 수비대 6부대가 성 밖(창병·포차·연노·검병·책사)에 서 있었다(사용자 제보 '공성 갔는데 죄다 밖에 나와 있네?'). */
    const outerGate = gateRows.length ? gateRows[gateRows.length - 1] : rows2 - 1;
    const out = [];
    bands.slice().reverse().forEach((b) => {
      const yA = b[1] - 1, yB = Math.max(b[0], b[1] - 3);
      [[0, yA], [-2, yA], [2, yA], [0, yB], [-2, yB], [2, yB]].forEach(([dx, y]) => {
        if (y >= outerGate) return;                 // 성문 밖은 절대 쓰지 않는다
        out.push([clampX(cx2 + dx, n), y]);
      });
    });
    const near = slotsAround(m.enemyBase, n, 10).filter(([, y]) => y < outerGate);
    return out.concat(near).slice(0, 10);
  }
  return slotsAround(m && m.enemyBase, n, 10, nr);
};
function clampX(x, n) { return Math.max(0, Math.min(n - 1, x)); }
SK.allySlots = function (type, rings, cols, rows) {
  const key = SK.mapKeyFor(type, rings || 1);
  const m = SK.MAP_META[key];
  const n = cols || (m ? m.cols : 24);
  /* v5.90 — 세로 칸수도 따로 받는다 (직사각형 지도에서 아래쪽 자리가 잘리지 않게) */
  const nr = rows || (m ? m.rows : n);
  if (type === 'defense') return slotsAround(m && m.enemyBase, n, 10, nr);
  const base = m && m.allyBase ? m.allyBase : { x: Math.floor(n / 2), y: nr - 2 };
  /* 아군은 본진 앞 두 줄에 폭 5칸으로 늘어선다 (10부대) */
  const out = [];
  [0, -1, -2].forEach((dy) => [-2, -1, 0, 1, 2].forEach((dx) => {
    const x = base.x + dx, y = base.y + dy;
    if (x >= 0 && y >= 0 && x < n && y < nr) out.push([x, y]);
  }));
  return out;
};


/* ══════════════════════════════════════════════════════════════
   v5.54 — S급 장수의 고유 필살기 (전투당 1회)
   · n = 필살기 이름 · q = 전용 대사 · v = 이펙트 종류 · c = 빛깔 · e = 효과
   · 효과는 일반 공격의 +25~45% 안쪽이거나, 범위·상태이상·버프·회복 같은 전술형이다.
     (340% 일격·쿨다운 초기화 같은 밸런스 붕괴는 넣지 않았다)
   · 모든 S급 장수가 자기 이름의 필살기를 가진다 (일반 이름표로 떨어지는 경우 없음)
   ══════════════════════════════════════════════════════════════ */
SK.ULTIMATES = {
  '조조': { n: '패왕호령', q: '천하의 패권은 이 조조의 호령 하나로 움직인다!', v: 'royal_aura', c: '255,206,110', e: { k:'buff', atk:0.18, def:0.08, morale:18, r:2, turns:3 } },
  '하후돈': { n: '설욕일섬', q: '한쪽 눈으로도 네놈의 목은 충분히 보인다!', v: 'slash_crimson', c: '255,86,74', e: { k:'hit', m:1.42 } },
  '하후연': { n: '천리속습', q: '천 리를 달려도 숨은 흐트러지지 않는다!', v: 'beast_charge', c: '220,190,120', e: { k:'hit', m:1.36, ail:'stun', ch:0.35 } },
  '장료': { n: '합비결전', q: '합비의 귀신이 누구인지 똑똑히 보여 주마!', v: 'spear_storm', c: '190,210,255', e: { k:'aoe', m:1.02, r:1, ail:'stun', ch:0.35 } },
  '전위': { n: '악래쌍극', q: '악래의 쌍극 앞에서 버틸 자는 없다!', v: 'slash_crimson', c: '255,120,90', e: { k:'aoe', m:1.0, r:1 } },
  '허저': { n: '호치절명', q: '호랑이를 잡는 이 힘, 네놈에게 쓰겠다!', v: 'roar_shockwave', c: '230,180,110', e: { k:'hit', m:1.4, ail:'stun', ch:0.45 } },
  '서황': { n: '장구돌파', q: '장구의 군율로 적진을 찢는다!', v: 'iron_wall', c: '200,190,160', e: { k:'hit', m:1.38 } },
  '장합': { n: '변화무상', q: '변화무상 — 이 수를 읽을 수 있겠나!', v: 'shadow_blade', c: '170,150,255', e: { k:'combo', m:1.4, n:2 } },
  '순욱': { n: '왕좌지책', q: '왕좌를 세우는 것은 한 수의 책략이다.', v: 'lightning_array', c: '180,210,255', e: { k:'buff', atk:0.2, morale:12, r:2, turns:3 } },
  '순유': { n: '십이기책', q: '적의 허점은 열두 곳, 그중 하나를 찌른다.', v: 'lightning_array', c: '190,200,255', e: { k:'debuff', def:-0.22, atk:-0.1, r:2, turns:3 } },
  '곽가': { n: '귀신지통', q: '귀신도 읽지 못할 통찰을 보여 주지.', v: 'poison_mist', c: '150,220,190', e: { k:'magic', p:1.25, r:1, ail:'poison', ch:0.8 } },
  '가후': { n: '독사절계', q: '독사는 한 번 물면 절대 놓지 않는다.', v: 'poison_mist', c: '170,230,150', e: { k:'magic', p:1.2, r:1, ail:'poison', ch:0.9 } },
  '사마의': { n: '귀모절계', q: '기다림이 곧 승리다 — 지금이다!', v: 'shadow_blade', c: '150,140,220', e: { k:'debuff', def:-0.25, atk:-0.12, r:2, turns:3 } },
  '조인': { n: '철벽수성', q: '이 성은 내 몸이 무너지기 전엔 열리지 않는다.', v: 'iron_wall', c: '200,200,210', e: { k:'buff', def:0.3, morale:14, r:2, turns:3 } },
  '조비': { n: '위왕전론', q: '선왕의 위엄으로 천하를 논한다!', v: 'royal_aura', c: '210,190,255', e: { k:'buff', atk:0.16, def:0.1, morale:14, r:2, turns:3 } },
  '방덕': { n: '여관결사', q: '여관의 결사대에 물러섬은 없다!', v: 'spear_storm', c: '240,200,160', e: { k:'hit', m:1.44 } },
  '등애': { n: '음평혈로', q: '험한 길이 곧 지름길이다!', v: 'stone_barrage', c: '190,170,140', e: { k:'aoe', m:1.0, r:1 } },
  '종회': { n: '검각대치', q: '검각에서 이 승부를 끝내겠다!', v: 'spear_storm', c: '200,200,230', e: { k:'hit', m:1.36 } },
  '유비': { n: '인의결집', q: '형제들이여, 의로써 함께 서자!', v: 'royal_aura', c: '120,220,150', e: { k:'heal', p:0.14, r:2, clear:true, atk:0.1, morale:10 } },
  '관우': { n: '일기당천', q: '일기당천 — 청룡언월도 앞에 적장은 없다!', v: 'dragon_cleave', c: '90,220,140', e: { k:'hit', m:1.45 } },
  '장비': { n: '장판포효', q: '장판교에 이 장비가 있다! 물러나라!', v: 'roar_shockwave', c: '255,150,90', e: { k:'aoe', m:1.0, r:2, ail:'stun', ch:0.5 } },
  '조운': { n: '칠진칠출', q: '칠 번을 뚫고, 칠 번을 나온다!', v: 'spear_storm', c: '120,200,255', e: { k:'combo', m:1.42, n:3 } },
  '마초': { n: '서량천둥', q: '서량의 철기가 천둥처럼 몰아친다!', v: 'beast_charge', c: '200,210,255', e: { k:'hit', m:1.4, ail:'stun', ch:0.4 } },
  '황충': { n: '백보천양', q: '백 걸음, 백 발 — 백발백중이다!', v: 'arrow_rain', c: '255,220,140', e: { k:'arrow', m:1.4, n:3 } },
  '제갈량': { n: '팔진천뢰', q: '팔진의 천둥이 적진을 가른다!', v: 'lightning_array', c: '170,200,255', e: { k:'magic', p:1.3, r:2, ail:'stun', ch:0.45 } },
  '방통': { n: '연환화계', q: '연환의 불이 한 줄로 번져 나간다!', v: 'fire_storm', c: '255,130,70', e: { k:'magic', p:1.25, r:1, ail:'burn', ch:0.8 } },
  '법정': { n: '기습묘수', q: '정면이 아니라 옆을 쳐라!', v: 'shadow_blade', c: '200,150,255', e: { k:'hit', m:1.38 } },
  '강유': { n: '기린계승', q: '승상의 뜻을 이어 끝까지 싸운다!', v: 'lightning_array', c: '150,220,255', e: { k:'magic', p:1.15, r:1 } },
  '위연': { n: '자오곡도', q: '자오곡의 칼날은 뒤에서 온다!', v: 'slash_crimson', c: '230,110,110', e: { k:'hit', m:1.36 } },
  '주창': { n: '충의대부', q: '도를 지키는 도끼는 무겁다!', v: 'slash_crimson', c: '220,160,110', e: { k:'hit', m:1.4 } },
  '서서': { n: '와룡천거', q: '이 자리에 와룡이 있어야 한다!', v: 'wind_gale', c: '180,220,200', e: { k:'buff', atk:0.18, morale:12, r:2, turns:3 } },
  '손권': { n: '강동호시', q: '강동의 호랑이들이여, 쏟아져 나가라!', v: 'royal_aura', c: '255,190,120', e: { k:'buff', atk:0.18, morale:16, r:2, turns:3 } },
  '손견': { n: '강동호랑', q: '강동의 호랑이가 앞장선다!', v: 'slash_crimson', c: '255,140,100', e: { k:'hit', m:1.42 } },
  '손책': { n: '소패왕돌격', q: '소패왕의 돌격을 막아 보아라!', v: 'beast_charge', c: '255,170,110', e: { k:'hit', m:1.42, ail:'stun', ch:0.35 } },
  '주유': { n: '적벽화공', q: '적벽의 불길이 천리를 태운다!', v: 'fire_storm', c: '255,110,60', e: { k:'magic', p:1.35, r:2, ail:'burn', ch:0.85 } },
  '노숙': { n: '천하양분', q: '천하를 둘로 나누는 큰 그림을 그린다.', v: 'wind_gale', c: '200,220,180', e: { k:'debuff', def:-0.18, atk:-0.12, r:2, turns:3 } },
  '여몽': { n: '괄목상대', q: '괄목상대 — 이제 나를 다시 보아라!', v: 'water_surge', c: '110,190,240', e: { k:'aoe', m:1.0, r:1 } },
  '육손': { n: '이릉업화', q: '이릉의 불이 적진을 삼킨다!', v: 'fire_storm', c: '255,140,80', e: { k:'magic', p:1.28, r:2, ail:'burn', ch:0.8 } },
  '감녕': { n: '금범기습', q: '백 기의 깃발이 밤을 가른다!', v: 'shadow_blade', c: '160,150,230', e: { k:'hit', m:1.4 } },
  '태사자': { n: '신궁연사', q: '신의의 활 — 세 발을 한 번에 쏜다!', v: 'arrow_rain', c: '200,230,255', e: { k:'arrow', m:1.4, n:3 } },
  '주태': { n: '불굴상흔', q: '상처투성이여도 나는 아직 서 있다!', v: 'iron_wall', c: '220,180,160', e: { k:'buff', def:0.28, morale:16, r:2, turns:3, selfHeal:0.1 } },
  '육항': { n: '서릉공방', q: '서릉의 방패는 무너지지 않는다!', v: 'iron_wall', c: '190,210,230', e: { k:'buff', def:0.25, atk:0.1, r:2, turns:3 } },
  '여포': { n: '귀신무쌍', q: '천하에 이 여포와 겨룰 자가 있느냐!', v: 'dragon_cleave', c: '255,70,60', e: { k:'hit', m:1.45 } },
  '초선': { n: '경국지색', q: '한 번의 춤으로 진을 무너뜨린다.', v: 'petal_dance', c: '255,150,190', e: { k:'debuff', atk:-0.3, def:-0.1, r:2, turns:3 } },
  '동탁': { n: '폭군위압', q: '이 몸의 위엄을 거역하는 자는 죽는다!', v: 'royal_aura', c: '190,120,90', e: { k:'aoe', m:0.95, r:1, morale:-8 } },
  '원소': { n: '사세삼공', q: '사세삼공의 위엄을 똑똑히 보아라!', v: 'royal_aura', c: '210,170,120', e: { k:'buff', atk:0.15, def:0.1, morale:14, r:2, turns:3 } },
  '장각': { n: '창천황천', q: '창천은 이미 죽었다! 황천이여 오라!', v: 'poison_mist', c: '180,220,120', e: { k:'magic', p:1.2, r:2, ail:'poison', ch:0.8 } },
  '맹획': { n: '남만왕후', q: '남만의 왕이 직접 나선다!', v: 'beast_charge', c: '220,180,110', e: { k:'aoe', m:1.02, r:1 } },
  '축융': { n: '화신비도', q: '불의 신 앞에 무릎을 꿇어라!', v: 'fire_storm', c: '255,150,90', e: { k:'magic', p:1.15, r:1, ail:'burn', ch:0.75 } },
  '광개토대왕': { n: '영락정복', q: '영락의 기상으로 사방을 정복한다!', v: 'royal_aura', c: '200,180,255', e: { k:'buff', atk:0.18, def:0.1, morale:16, r:2, turns:3 } },
  '을지문덕': { n: '살수대첩', q: '살수의 물길이 적을 삼킨다!', v: 'water_surge', c: '110,200,240', e: { k:'magic', p:1.25, r:2 } },
  '연개소문': { n: '천리장성', q: '천리 장성은 네가 넘을 수 없다!', v: 'iron_wall', c: '190,190,220', e: { k:'hit', m:1.36, selfDef:0.25 } },
  '양만춘': { n: '안시성화살', q: '안시성의 화살이 하늘을 가린다!', v: 'arrow_rain', c: '210,230,250', e: { k:'arrowAoe', m:1.0, r:1, n:2 } },
  '계백': { n: '황산결사', q: '황산벌의 결사대는 물러서지 않는다!', v: 'slash_crimson', c: '230,90,90', e: { k:'hit', m:1.45 } },
  '흑치상지': { n: '임존유격', q: '임존성의 유격대가 적을 흔든다!', v: 'wind_gale', c: '170,220,180', e: { k:'aoe', m:1.0, r:1 } },
  '근초고왕': { n: '해상웅비', q: '바다 건너까지 이 땅의 이름을 남긴다!', v: 'water_surge', c: '120,200,230', e: { k:'buff', atk:0.16, morale:14, r:2, turns:3 } },
  '김유신': { n: '삼한일통', q: '삼한을 하나로 — 이 칼로 통일한다!', v: 'dragon_cleave', c: '150,210,255', e: { k:'hit', m:1.4, allyAtk:0.12 } },
  '김춘추': { n: '외교승부', q: '칼보다 말로 천하를 얻는다.', v: 'wind_gale', c: '200,210,180', e: { k:'debuff', atk:-0.15, def:-0.15, r:2, turns:3 } },
  '이사부': { n: '우산복속', q: '나무 사자로 우산국을 복속시킨다!', v: 'water_surge', c: '140,200,230', e: { k:'aoe', m:1.0, r:1 } },
  '김수로': { n: '금관개국', q: '금관가야의 깃발이 하늘을 덮는다!', v: 'royal_aura', c: '230,200,120', e: { k:'buff', def:0.2, morale:16, r:2, turns:3 } },
  '동명성왕': { n: '주몽신궁', q: '한 발의 화살로 하늘을 가른다!', v: 'arrow_rain', c: '255,225,150', e: { k:'arrow', m:1.42, n:2 } },
  '대무신왕': { n: '개마돌격', q: '개마무사의 철기가 밀고 나간다!', v: 'beast_charge', c: '200,200,220', e: { k:'hit', m:1.4 } },
  '장수왕': { n: '남진정책', q: '남으로 — 물러섬 없이 남으로!', v: 'iron_wall', c: '180,200,220', e: { k:'buff', atk:0.15, def:0.12, morale:14, r:2, turns:3 } },
  '명림답부': { n: '좌원대첩', q: '좌원의 매복이 적을 덮친다!', v: 'shadow_blade', c: '150,190,200', e: { k:'aoe', m:1.0, r:1 } },
  '온조왕': { n: '위례개국', q: '위례성에 새 나라의 해가 뜬다!', v: 'royal_aura', c: '200,210,170', e: { k:'buff', def:0.18, morale:14, r:2, turns:3 } },
  '무령왕': { n: '갱위강국', q: '다시 일어나 강한 나라를 세운다!', v: 'wind_gale', c: '190,210,210', e: { k:'buff', atk:0.14, def:0.12, r:2, turns:3 } },
  '성왕': { n: '사비천도', q: '사비로 도읍을 옮기고 다시 선다!', v: 'royal_aura', c: '210,180,210', e: { k:'heal', p:0.12, r:2, atk:0.1 } },
  '진흥왕': { n: '한강장악', q: '한강을 쥔 자가 삼한을 쥔다!', v: 'water_surge', c: '160,210,230', e: { k:'hit', m:1.36 } },
  '선덕여왕': { n: '삼가지예', q: '세 가지 일을 미리 알았노라.', v: 'petal_dance', c: '230,190,240', e: { k:'debuff', atk:-0.25, def:-0.08, r:3, turns:3 } },
  '문무왕': { n: '매소성대첩', q: '매소성에서 나라의 운명을 건다!', v: 'spear_storm', c: '190,210,230', e: { k:'aoe', m:1.02, r:1 } },
  '고선지': { n: '파미르돌파', q: '파미르의 설원도 나를 막지 못한다!', v: 'beast_charge', c: '200,215,240', e: { k:'hit', m:1.4 } },
  '왕건': { n: '호족포용', q: '호족을 품어 하나의 나라를 만든다!', v: 'royal_aura', c: '230,200,140', e: { k:'buff', atk:0.15, def:0.12, morale:16, r:2, turns:3 } },
  '강감찬': { n: '귀주대첩', q: '귀주의 물길로 적을 가둔다!', v: 'water_surge', c: '130,190,230', e: { k:'magic', p:1.3, r:2, ail:'stun', ch:0.35 } },
  '서희': { n: '강동육주', q: '말 한마디로 성 여섯을 얻는다.', v: 'wind_gale', c: '200,220,190', e: { k:'debuff', atk:-0.18, def:-0.18, r:3, turns:3 } },
  '윤관': { n: '별무반북진', q: '별무반이 북방 아홉 성을 세운다!', v: 'spear_storm', c: '200,200,190', e: { k:'hit', m:1.36 } },
  '척준경': { n: '신검일격', q: '신검 한 자루로 이 난을 끝낸다!', v: 'slash_crimson', c: '255,100,90', e: { k:'hit', m:1.42 } },
  '양규': { n: '흥화칠승', q: '흥화진에서 일곱 번 싸워 일곱 번 이겼다!', v: 'iron_wall', c: '210,200,180', e: { k:'buff', def:0.25, morale:16, r:2, turns:3, selfHeal:0.1 } },
  '최무선': { n: '화통화포', q: '화통도감의 포성이 울린다!', v: 'stone_barrage', c: '255,160,80', e: { k:'magic', p:1.25, r:1, ail:'burn', ch:0.6 } },
  '이성계': { n: '신궁일시', q: '한 발의 활로 천하를 정한다!', v: 'arrow_rain', c: '220,230,250', e: { k:'arrow', m:1.42, n:2 } },
  '정도전': { n: '삼봉개국', q: '삼봉의 설계로 새 나라를 세운다.', v: 'wind_gale', c: '200,210,160', e: { k:'buff', atk:0.14, def:0.14, morale:14, r:2, turns:3 } },
  '정몽주': { n: '단심일편', q: '이 마음 한 점, 변치 않으리라.', v: 'petal_dance', c: '230,200,200', e: { k:'heal', p:0.15, r:2, clear:true } },
  '이방원': { n: '왕자의난', q: '이 한 번의 결단으로 판이 뒤집힌다!', v: 'shadow_blade', c: '190,170,220', e: { k:'hit', m:1.4 } },
  '세종대왕': { n: '훈민정음', q: '백성을 위해 새 글자를 펼친다!', v: 'royal_aura', c: '240,220,150', e: { k:'buff', atk:0.14, def:0.14, morale:18, r:3, turns:3 } },
  '장영실': { n: '천문기기', q: '하늘의 이치를 기계로 옮긴다!', v: 'stone_barrage', c: '210,190,160', e: { k:'magic', p:1.15, r:1 } },
  '김종서': { n: '육진개척', q: '육진을 열어 북방을 지킨다!', v: 'iron_wall', c: '200,190,170', e: { k:'hit', m:1.36 } },
  '이순신': { n: '명량학익', q: '학의 날개를 펴고 적함을 가른다!', v: 'water_surge', c: '110,210,245', e: { k:'magic', p:1.3, r:2 } },
  '권율': { n: '행주투석', q: '행주산성의 돌이 쏟아진다!', v: 'stone_barrage', c: '220,190,150', e: { k:'magic', p:1.2, r:1 } },
  '곽재우': { n: '홍의유격', q: '붉은 옷의 유격대가 적을 흔든다!', v: 'wind_gale', c: '240,150,140', e: { k:'aoe', m:1.0, r:1 } },
  '김시민': { n: '진주사수', q: '진주성은 내 목숨과 함께다!', v: 'iron_wall', c: '220,190,170', e: { k:'buff', def:0.3, morale:16, r:2, turns:3 } },
  '정약용': { n: '거중설계', q: '거중기로 무거운 것을 들어 올린다!', v: 'stone_barrage', c: '200,190,160', e: { k:'magic', p:1.2, r:1 } },
  '최영': { n: '홍건격파', q: '황금 보기를 돌같이 여긴 이 칼이다!', v: 'slash_crimson', c: '240,120,100', e: { k:'hit', m:1.42 } },
  '설총': { n: '화왕직언', q: '화왕계로 임금의 마음을 바로잡는다!', v: 'wind_gale', c: '220,210,180', e: { k:'debuff', atk:-0.2, def:-0.12, r:2, turns:3 } },
  '임경업': { n: '백마신궁', q: '백마산성의 신궁이 적을 꿰뚫는다!', v: 'arrow_rain', c: '210,230,250', e: { k:'arrow', m:1.4, n:3 } },
  '김응하': { n: '요동결사', q: '요동의 결사대는 한 걸음도 물러서지 않는다!', v: 'beast_charge', c: '220,180,150', e: { k:'hit', m:1.44 } },
  '장보고': { n: '청해제왕', q: '청해진의 바다를 내가 지킨다!', v: 'water_surge', c: '120,200,235', e: { k:'aoe', m:1.0, r:1 } },
  '을파소': { n: '진대법', q: '굶주린 백성부터 살려야 나라가 선다.', v: 'wind_gale', c: '180,220,190',
    e: { k:'heal', p:0.16, r:2, atk:0.08, clear:true } },
  '원효': { n: '일심화쟁', q: '마음이 하나 되면 다툼은 저절로 사라진다.', v: 'royal_aura', c: '220,210,255',
    e: { k:'buff', atk:0.14, def:0.12, morale:16, r:2, turns:3 } },
  '황희': { n: '청백수성', q: '청백한 마음으로 성을 지킨다.', v: 'iron_wall', c: '210,215,225',
    e: { k:'buff', def:0.28, morale:14, r:2, turns:3, selfHeal:0.1 } },
  '이황': { n: '이기이원', q: '이치를 꿰뚫으면 적의 허실이 보인다.', v: 'lightning_array', c: '190,215,255',
    e: { k:'debuff', def:-0.2, atk:-0.14, r:3, turns:3 } },
  '황진이': { n: '송도가곡', q: '한 곡조에 적의 마음을 흔든다.', v: 'petal_dance', c: '255,170,205',
    e: { k:'debuff', atk:-0.28, def:-0.08, r:2, turns:3 } },
  '안중근': { n: '하얼빈총성', q: '이 총성으로 하늘에 뜻을 전한다!', v: 'arrow_rain', c: '255,230,180', e: { k:'arrow', m:1.45, n:2 } },
  '김좌진': { n: '청산리대첩', q: '청산리의 기마가 적을 쓸어버린다!', v: 'beast_charge', c: '220,200,220', e: { k:'aoe', m:1.05, r:1 } },
  '김구': { n: '백범결심', q: '이 몸이 가진 것은 오직 한 점 결심이다.', v: 'royal_aura', c: '240,220,190', e: { k:'heal', p:0.14, r:2, atk:0.1, clear:true } },
  '홍범도': { n: '봉오동매복', q: '봉오동의 매복이 적을 삼킨다!', v: 'shadow_blade', c: '180,200,180', e: { k:'aoe', m:1.05, r:1, ail:'stun', ch:0.4 } },
};

/* ══════════════════════════════════════════════════════════════
   v5.81 — A급 장수 필살기 개방 (사용자 요청 2026-11-24)
   · S급(위 표)은 그대로 두고, A급은 병과·특성에 맞는 자기 필살기를 하나씩 받는다.
   · S급보다 한 단계 낮은 수치: 단일 120~128% · 범위 82~90% · 버프/디버프 ±10~14%
   · 컷인도 cutinTier:'A' 로 한 단계 조용하다 (battle.js showUltCutin/castUlt).
   · 이름은 병과 묶음별 풀에서 장수마다 다른 것을 고른다(같은 이름이 몰리지 않게).
   ══════════════════════════════════════════════════════════════ */
SK.A_ULT_GROUPS = {
  inf: {
    who: ['gibi', 'changbyung', 'geombyung', 'deunggabyung', 'sanjeok', 'sujeok', 'mudoga', 'yasubyung', 'gunggi'],
    names: ['철벽 돌격타', '일섬 참격', '분쇄 강타', '선봉 돌파'],
    vfx: ['slash_crimson', 'spear_storm', 'iron_wall', 'beast_charge'],
    col: ['240,150,120', '210,220,255', '220,200,170', '230,190,140'],
    eff: [{ k: 'hit', m: 1.24, ail: 'stun', ch: 0.2 }, { k: 'hit', m: 1.26 }, { k: 'combo', m: 1.22, n: 2 }, { k: 'hit', m: 1.22, ail: 'slow' }],
  },
  arc: {
    who: ['gungsu', 'yeonnobyung', 'pocha', 'balseokcha'],
    names: ['연발 사선사격', '백보 관통시', '화살 세례'],
    vfx: ['arrow_rain', 'arrow_rain', 'stone_barrage'],
    col: ['255,225,160', '220,235,250', '230,200,160'],
    eff: [{ k: 'arrow', m: 1.22, n: 2 }, { k: 'arrowAoe', m: 0.86, r: 1, n: 2 }, { k: 'arrow', m: 1.2, n: 2, ail: 'slow' }],
  },
  str: {
    who: ['chaeksa', 'dosa'],
    names: ['기문 화계진', '팔괘 뇌격', '삼밀 화공'],
    vfx: ['lightning_array', 'fire_storm', 'poison_mist'],
    col: ['180,200,255', '255,140,80', '160,220,180'],
    eff: [{ k: 'magic', p: 0.88, r: 1, ail: 'burn', ch: 0.5 }, { k: 'magic', p: 0.86, r: 1, ail: 'stun', ch: 0.2 }, { k: 'magic', p: 0.84, r: 1, ail: 'poison', ch: 0.5 }],
  },
  sup: {
    who: ['pungsusa', 'muhui', 'gunakdae'],
    names: ['고무의 북소리', '치유의 춤', '진군의 노래'],
    vfx: ['royal_aura', 'petal_dance', 'wind_gale'],
    col: ['230,215,160', '250,180,215', '210,220,180'],
    eff: [{ k: 'buff', atk: 0.12, def: 0.1, morale: 10, r: 2, turns: 2 }, { k: 'heal', p: 0.1, r: 2, atk: 0.08 }, { k: 'buff', def: 0.14, morale: 8, r: 2, turns: 2 }],
  },
  lord: {
    who: ['gunwoong'],
    names: ['군령 일갈', '왕의 고동', '제왕의 한마디'],
    vfx: ['royal_aura', 'royal_aura', 'goldWave'],
    col: ['255,220,140', '245,205,120', '255,230,160'],
    eff: [{ k: 'buff', atk: 0.12, def: 0.12, morale: 12, r: 2, turns: 2 }, { k: 'debuff', atk: -0.12, def: -0.1, r: 2, turns: 2 }, { k: 'buff', atk: 0.14, morale: 10, r: 2, turns: 2 }],
  },
};
SK.aUltHash = function (s) {
  let h = 0;
  const t = String(s || '');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 9973;
  return h;
};
SK.makeAUltimate = function (g) {
  if (!g || !g.name) return null;
  const cls = SK.genClass ? SK.genClass(g) : '';
  const key = Object.keys(SK.A_ULT_GROUPS).find((k) => SK.A_ULT_GROUPS[k].who.indexOf(cls) >= 0) || 'inf';
  const G = SK.A_ULT_GROUPS[key];
  const h = SK.aUltHash(g.name);
  const i = h % G.names.length;
  const eff = Object.assign({}, G.eff[h % G.eff.length]);
  return {
    n: (cls === 'gunwoong' ? g.name : (g.name.length > 5 ? g.name.slice(0, 5) : g.name)) + '의 ' + G.names[i],
    q: '이 한 수로 판을 뒤집는다!',
    v: G.vfx[i % G.vfx.length],
    c: G.col[i % G.col.length],
    tier: 'A', cutinTier: 'A',
    e: eff,
  };
};
/* 기존 S급 표시 — 컷인 단계 비교용 */
Object.keys(SK.ULTIMATES).forEach((k) => {
  const u = SK.ULTIMATES[k];
  if (u && !u.tier) { u.tier = 'S'; u.cutinTier = 'S'; }
});
/* v5.81 — 원래 S급 표에 있던 장수가 런타임 등급 재산정으로 A가 되면(하후돈 등),
   그 필살기를 그대로 142%로 쓰게 두지 않는다. 이름·대사·그림은 남기고 수치만 A급 상한으로 낮춘다. */
SK.tuneUltToA = function (spec) {
  if (!spec || spec.tier === 'A' || !spec.e) return spec;
  const e = Object.assign({}, spec.e);
  const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (e.k === 'hit' || e.k === 'combo' || e.k === 'arrow') {
    e.m = Math.round(cap((e.m || 1.3) * 0.88, 1.20, 1.28) * 100) / 100;
  } else if (e.k === 'aoe' || e.k === 'arrowAoe') {
    e.m = Math.round(cap((e.m || 1.0) * 0.86, 0.82, 0.90) * 100) / 100;
  } else if (e.k === 'line') {
    /* v5.82 — 직선 관통도 A급 상한(82~90%) */
    if (e.m) e.m = Math.round(cap(e.m * 0.88, 0.82, 0.90) * 100) / 100;
    if (e.p) e.p = Math.round(cap(e.p * 0.80, 0.80, 0.90) * 100) / 100;
  } else if (e.k === 'magic' || e.k === 'rock') {
    e.p = Math.round(cap((e.p || 1.2) * 0.80, 0.80, 0.90) * 100) / 100;
  } else if (e.k === 'buff') {
    if (e.atk != null) e.atk = cap(e.atk, -0.14, 0.14);
    if (e.def != null) e.def = cap(e.def, -0.14, 0.14);
    if (e.morale != null) e.morale = cap(e.morale, -12, 12);
    if (e.turns) e.turns = Math.min(e.turns, 2);
  } else if (e.k === 'debuff') {
    if (e.atk != null) e.atk = cap(e.atk, -0.14, 0.14);
    if (e.def != null) e.def = cap(e.def, -0.14, 0.14);
    if (e.turns) e.turns = Math.min(e.turns, 2);
  } else if (e.k === 'heal') {
    e.p = Math.min(0.12, e.p || 0.14);
    if (e.atk != null) e.atk = cap(e.atk, 0, 0.1);
  }
  if (e.ail && e.ch) e.ch = Math.min(0.4, e.ch);
  /* v5.82 — 새 개성(기절·흡혈·처치 재행동)도 A급 상한을 지킨다 */
  if (e.stun && e.stun.chance) e.stun = Object.assign({}, e.stun, { chance: Math.min(0.4, e.stun.chance) });
  if (e.lifesteal) e.lifesteal = Math.min(0.35, e.lifesteal);
  if (e.execute) e.execute = Object.assign({}, e.execute, { bonusPct: Math.min(50, e.execute.bonusPct) });
  return Object.assign({}, spec, { e, tier: 'A', cutinTier: 'A' });
};
SK.ensureAUltimates = function () {
  let n = 0;
  (SK.GENERALS || []).forEach((g) => {
    if (!g || !g.name) return;
    const aGrade = (g.tier === 'A' || g.origTier === 'A');
    if (!aGrade) return;
    /* A급이 된 장수가 S급 필살기를 그대로 들고 있으면 A급 상한으로 낮춘다 */
    if (g.tier === 'A' && SK.ULTIMATES[g.name] && SK.ULTIMATES[g.name].tier !== 'A') {
      SK.ULTIMATES[g.name] = SK.tuneUltToA(SK.ULTIMATES[g.name]);
      n += 1;
      return;
    }
    if (SK.ULTIMATES[g.name]) return;
    const spec = SK.makeAUltimate(g);
    if (spec) { SK.ULTIMATES[g.name] = spec; n += 1; }
  });
  return n;
};
SK.aUltCount = function () {
  return Object.keys(SK.ULTIMATES || {}).filter((n) => SK.ULTIMATES[n] && SK.ULTIMATES[n].tier === 'A').length;
};
SK.A_ULT_COUNT = 0;

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
