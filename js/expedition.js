/* =====================================================================
   삼국지-꼬마영웅 난타전 — 원정 시나리오 《삼국이분다》 통합판
   v5.74 (?v=92) · 대기실 · 레벨(Lv.1~99) · 대각선 실시간 난투 전투

   · v5.74 — 초상화 등급 테두리 4색(S빨강·A보라·B파랑·C초록) · 필살기 3×3 실시간 전투
     (기절·화상·감속·치유·버프) · 장비 재정립(무기 공격력%+치명타%, 갑옷 최대HP%+피해감소%,
     보물 공격속도%+초기 게이지%) · 공훈 보상 하향 · 인연 24종 도감.

   · 입장은 두 갈래뿐 — 주소의 ?exp=1, 또는 표지 제목 5연타.
     일반 접속(?v=92)에서는 원정 버튼도 문구도 화면에 나오지 않는다.
   · 저장: localStorage['sk_expedition_v1'] (본편 공유 공훈은 'sk_meta_merit')
     v5.69 이하 저장(roster/formation/stars/gear/equip/progress/cleared)을 그대로 읽어
     lv·exp 기본값을 채워 새 구조(owned/squad)로 옮긴다. 저장할 때는 옛 구조도 함께 써 두어
     예전 빌드가 열어도 원정단·별·장비가 살아 있게 한다.
   · 데이터: 본편 js/data.js 의 SK.GENERALS(701명) · SK.TREASURES(250종)를 그대로 쓴다.
     세력 시너지(촉·위·오·군웅·한국 3/4/5명) · 인연 7종 · 공훈 뽑기(100/900) ·
     장비 뽑기(80/720) · 3칸 장착 · 1막 황건적 1~10관문(5 장량 · 8 장보 · 10 장각 · 유비 ★1)
   · 전투: duel_arena_bg 위 대각선 난투(58px 치비), 60초, 1×/2×/3× 배속, 자동스킬, 필살기 카드
   ===================================================================== */
(function () {
  'use strict';
  const SK = window.SK || (window.SK = {});

  /* ── 저장 키 ─────────────────────────────────────────────── */
  const KEY = 'sk_expedition_v1';        // 원정단·진형·진행도·별·레벨·장비
  const META_KEY = 'sk_meta_merit';      // 영구 공훈(본편과 공유)
  const START_MERIT = 1000;              // 처음 연 사람에게 지급하는 시작 공훈
  const MAX_LV = 99, MAX_ACT1 = 10, MAX_SQUAD = 5, STAR_MAX = 5;

  const COST_HERO = { 1: 100, 10: 900 };
  const COST_GEAR = { 1: 80, 10: 720 };
  const HERO_RATE = { S: 3, A: 15, B: 37, C: 45 };
  const GEAR_RATE = { '전설': 6, '영웅': 18, '희귀': 36, '일반': 40 };

  const FACTIONS = ['촉', '위', '오', '군웅', '한국'];
  const FCOLOR = { '촉': '#2f8f4b', '위': '#2f6fb8', '오': '#b8432f', '군웅': '#8a7448', '한국': '#7a5aa8' };
  const CLS_LABEL = { melee: '근접', ranged: '원거리', strategist: '책사' };
  const ACT_NAME = '제1막 · 황건적의 난';

  const MELEE_JOBS = ['군주', '기병', '창병', '검병', '산적', '수적', '무도가', '야수병', '등갑병'];
  const RANGED_JOBS = ['궁수', '연노병', '포차', '궁기', '군악대', '무희'];
  const CASTER_JOBS = ['책사', '풍수사', '도사'];
  const JOB_SPRITE = {
    '군주': 'lord', '기병': 'cavalry', '궁기': 'horse_archer', '창병': 'spear', '검병': 'sword',
    '산적': 'bandit', '수적': 'pirate', '책사': 'strategist', '풍수사': 'geomancer', '도사': 'taoist',
    '궁수': 'archer', '무도가': 'martial', '야수병': 'beast', '무희': 'dancer', '포차': 'catapult',
    '연노병': 'crossbow', '등갑병': 'rattan', '군악대': 'drum'
  };

  /* ── 인연 24종 (v5.74 — js/data.js 장수 이름과 1:1 대조)
     need = 발동에 필요한 인원(없으면 전원) · 효과는 소수(0.12 = +12%) [공격, HP, 방어]
     · '주몽·소서노'는 본편 명부에 없어 고구려 개국은 《동명성왕·유리명왕》으로 맞췄다.
     · '화타'도 명부에 없어 장수 필살기는 대교·소교(치유) 계열로 둔다. */
  const BOND = (id, icon, name, cat, members, need, fx, desc) => ({
    id: id, icon: icon, name: name, cat: cat, members: members,
    need: need || members.length, atk: fx[0] || 0, hp: fx[1] || 0, def: fx[2] || 0, desc: desc || ''
  });
  const BONDS = [
    BOND('dowon', '🌸', '도원결의', '촉', ['유비', '관우', '장비'], 0, [.12, .08, 0], '복숭아 동산의 형제 맹세'),
    BOND('oho5', '🐯', '오호대장군', '촉', ['관우', '장비', '조운', '마초', '황충'], 0, [.15, .10, .05], '촉한을 대표하는 다섯 맹장'),
    BOND('waryong', '🐉', '와룡과 봉추', '촉', ['제갈량', '방통'], 0, [.10, .06, .04], '둘 중 하나만 얻어도 천하를 얻는다'),
    BOND('samgo', '🏡', '삼고초려', '촉', ['유비', '제갈량'], 0, [.08, .08, .04], '초려를 세 번 찾은 군신'),
    BOND('ojo', '⚔️', '조조와 오자양장', '위', ['조조', '장료', '악진', '우금', '장합', '서황'], 4, [.12, .08, .06], '위나라 최고의 오장수'),
    BOND('mosadan', '📜', '조조 모사단', '위', ['조조', '순욱', '순유', '곽가', '정욱', '가후'], 4, [.10, .06, .06], '지략으로 천하를 설계한 책사진'),
    BOND('jongchin', '🩸', '조씨·하후씨 종친', '위', ['하후돈', '하후연', '조인', '조홍'], 3, [.10, .10, .04], '조조의 피를 나눈 종친 장군'),
    BOND('hochi', '🐂', '호치와 악래', '위', ['전위', '허저'], 0, [.10, .12, .05], '조조를 지킨 두 호위 맹장'),
    BOND('sama', '🦅', '사마씨 삼부자', '위', ['사마의', '사마사', '사마소'], 0, [.12, .06, .06], '천하를 가져간 가문'),
    BOND('leejang', '🌺', '강동 이교', '오', ['대교', '소교'], 0, [.06, .12, .06], '강동의 두 미인'),
    BOND('jukson', '🤝', '주유와 손책', '오', ['손책', '주유'], 0, [.12, .08, .04], '강동을 연 의형제'),
    BOND('son3', '🐅', '손씨 삼대', '오', ['손견', '손책', '손권'], 0, [.10, .10, .04], '강동의 호랑이 가문'),
    BOND('ojijang', '🚩', '오의 지장', '오', ['주유', '노숙', '여몽', '육손'], 3, [.10, .06, .06], '오나라를 이끈 도독들'),
    BOND('yeopo', '💋', '여포와 초선', '군웅', ['여포', '초선'], 0, [.14, .06, 0], '천하 무쌍과 연환미인'),
    BOND('dongtak', '🔥', '동탁의 폭정', '군웅', ['동탁', '이유', '화웅', '여포'], 3, [.12, .10, .03], '서량군의 잔혹한 전위'),
    BOND('wonsso', '🏹', '원소 사정주', '군웅', ['안량', '문추', '장합', '고람'], 3, [.10, .08, .05], '하북의 네 기둥'),
    BOND('hwanggeon', '☯️', '황건 삼형제', '군웅', ['장각', '장보', '장량'], 0, [.12, .10, .03], '창천이 죽고 황천이 서리라'),
    BOND('seoryang', '🐎', '서량 철기', '군웅', ['마초', '마등', '방덕', '한수'], 3, [.12, .08, .04], '서량의 용맹한 기마대'),
    BOND('namman', '🌿', '남만 맹획·축융', '남만', ['맹획', '축융'], 0, [.10, .10, .04], '남만의 왕과 불의 여장'),
    BOND('goguryeo1', '🏔️', '고구려 개국', '고구려', ['동명성왕', '유리명왕'], 0, [.08, .10, .05], '졸본에서 일어난 개국 군주와 그 아들'),
    BOND('goguryeo2', '🗡️', '고구려 정복', '고구려', ['광개토대왕', '장수왕', '을지문덕'], 2, [.12, .08, .05], '대륙을 호령한 정복 군주'),
    BOND('silla', '🌼', '신라 화랑', '신라', ['김유신', '관창', '사다함'], 2, [.10, .08, .06], '꽃다운 화랑의 기개'),
    BOND('baekje', '🏯', '백제 명장', '백제', ['계백', '성충', '복신', '흑치상지'], 3, [.10, .10, .05], '백제를 지킨 마지막 명장'),
    BOND('joseon', '🐢', '조선 의병·장수', '조선', ['이순신', '곽재우', '권율', '김시민'], 3, [.12, .10, .06], '임진년 나라를 구한 이들')
  ];
  const BOND_CAT_ICON = { '촉': '🟩', '위': '🟦', '오': '🟥', '군웅': '🟫' };
  /* 같은 세력 3 / 4 / 5명 (v5.68 그대로) */
  const FACTION_TIERS = {
    3: { n: 3, atk: 0.10, def: 0.10, hp: 0.10 },
    4: { n: 4, atk: 0.18, def: 0.18, hp: 0.18 },
    5: { n: 5, atk: 0.28, def: 0.28, hp: 0.28 }
  };

  /* =====================================================================
     필살기 — 3×3 실시간 난투용 (v5.74)
       area: front 전열 · row 가로줄 · col 세로줄(관통) · cross 십자 5칸
             all 전체 · rand3 무작위 3명 · low HP 최저 1명 · one 가장 가까운 1명
       효과: pow(공격력 대비 피해%) stun(초) slow(%) burn(초당 공격력%) heal(최대HP%)
             atkUp(%) gauge(%) dur(초)
     ─ 상세창 문구(describeSkill)와 전투 효과(runSkill)는 같은 정의를 같이 읽는다.
     ===================================================================== */
  const SKILL_TYPES = {
    charge: { icon: '🐎', label: '근접 돌격' }, sweep: { icon: '⚔️', label: '광역 베기' }, pierce: { icon: '🏹', label: '원거리 관통' },
    fire: { icon: '🔥', label: '광역 화계' }, bolt: { icon: '⚡', label: '번개' }, heal: { icon: '💚', label: '전체 치유' },
    buff: { icon: '📣', label: '사기 고양' }, control: { icon: '🌀', label: '기절·감속' }
  };
  const AREA_TXT = {
    front: '전방 적 전체', row: '대상 가로줄 적 전체', col: '대상 세로줄 적 전체(관통)', cross: '대상 십자 범위(5칸) 적',
    all: '적 전체', rand3: '무작위 적 3명', low: 'HP 최저 적 1명', one: '가장 가까운 적 1명'
  };
  const S2 = (type, name, o) => Object.assign({ type: type, name: name }, o);
  const HERO_SKILLS = {
    '장비': S2('charge', '장판교 일갈', { area: 'front', pow: 160, stun: 1.5 }),
    '관우': S2('sweep', '청룡언월참', { area: 'row', pow: 200 }),
    '조운': S2('charge', '칠진칠출', { area: 'cross', pow: 175 }),
    '마초': S2('charge', '서량 철기돌격', { area: 'col', pow: 185 }),
    '여포': S2('sweep', '방천화극', { area: 'all', pow: 150, stun: 1.0 }),
    '허저': S2('charge', '호치 돌진', { area: 'front', pow: 170, stun: .8 }),
    '전위': S2('sweep', '악래 난무', { area: 'row', pow: 190 }),
    '하후돈': S2('charge', '흑갑 일섬', { area: 'one', pow: 240 }),
    '손책': S2('charge', '소패왕 돌격', { area: 'cross', pow: 180 }),
    '맹획': S2('sweep', '남만 대진격', { area: 'front', pow: 150, slow: 30, dur: 3 }),
    '황충': S2('pierce', '백보천양', { area: 'col', pow: 210 }),
    '태사자': S2('pierce', '신사 연발', { area: 'col', pow: 200 }),
    '유비': S2('buff', '인덕의 검', { heal: 12, atkUp: 12, dur: 5 }),
    '조조': S2('buff', '치세의 간웅', { atkUp: 15, gauge: 10, dur: 5 }),
    '곽가': S2('buff', '십승십패', { atkUp: 18, gauge: 15, dur: 5 }),
    '순욱': S2('buff', '왕좌의 보좌', { atkUp: 14, heal: 10, dur: 5 }),
    '대교': S2('heal', '강동의 미소', { heal: 18, gauge: 10 }),
    '소교': S2('heal', '강동의 노래', { heal: 18, gauge: 10 }),
    '제갈량': S2('fire', '팔진화계', { area: 'all', pow: 90, burn: 25, dur: 3 }),
    '주유': S2('fire', '적벽의 불길', { area: 'all', pow: 110, burn: 30, dur: 3 }),
    '육손': S2('fire', '이릉의 연화', { area: 'all', pow: 100, burn: 25, dur: 3 }),
    '축융': S2('fire', '화염 투창', { area: 'cross', pow: 130, burn: 30, dur: 3 }),
    '장각': S2('bolt', '태평요술', { area: 'rand3', pow: 170, stun: 1.0 }),
    '사마의': S2('bolt', '심모원려', { area: 'rand3', pow: 150, stun: .8 }),
    '방통': S2('control', '연환계', { area: 'all', pow: 80, slow: 40, dur: 4 }),
    '초선': S2('control', '연환 미인계', { area: 'low', pow: 120, stun: 2.0 }),
    '이순신': S2('pierce', '명량 일척', { area: 'col', pow: 230 }),
    '계백': S2('charge', '결사 돌격', { area: 'front', pow: 170, stun: 1.0 }),
    '김유신': S2('sweep', '삼국통일검', { area: 'row', pow: 200 }),
    '광개토대왕': S2('sweep', '정복 군주', { area: 'all', pow: 140 })
  };
  const CLS_SKILL = {
    melee: S2('charge', '돌격', { area: 'front', pow: 150, stun: 1.0 }),
    ranged: S2('pierce', '관통 사격', { area: 'col', pow: 180 }),
    strategist: S2('fire', '화계', { area: 'all', pow: 100, burn: 20, dur: 3 }),
    support: S2('heal', '치유', { heal: 20 })
  };
  function skillOf(o) {
    if (typeof o === 'string' || typeof o === 'number') o = def(o);
    if (!o) return CLS_SKILL.melee;
    const base = HERO_SKILLS[o.name];
    const s = base || Object.assign({}, CLS_SKILL[o.cls] || CLS_SKILL.melee, o.skill ? { name: o.skill } : {});
    return Object.assign({ dur: 3 }, s);
  }
  function describeSkill(s) {
    const a = AREA_TXT[s.area] || AREA_TXT.one, parts = [], fx = [];
    if (s.pow) parts.push(a + ' ' + s.pow + '% 피해');
    if (s.stun) fx.push(s.stun + '초 기절');
    if (s.slow) fx.push('이동·공격속도 -' + s.slow + '% (' + (s.dur || 3) + '초)');
    if (s.burn) fx.push('화상 ' + (s.dur || 3) + '초 (초당 공격력 ' + s.burn + '%)');
    if (fx.length) parts.push(s.pow ? fx.join(' + ') : a + ' ' + fx.join(' + '));
    if (s.heal) parts.push('아군 전체 최대 HP ' + s.heal + '% 회복');
    if (s.atkUp) parts.push('아군 전체 공격력 +' + s.atkUp + '% (' + (s.dur || 3) + '초)');
    if (s.gauge) parts.push('아군 전체 필살 게이지 +' + s.gauge + '%');
    return parts.join(' + ') || '단일 대상 강타';
  }
  function skillHTML(o) {
    if (typeof o === 'string' || typeof o === 'number') o = def(o);
    const s = skillOf(o), t = SKILL_TYPES[s.type] || SKILL_TYPES.charge;
    return '<div class="xs-skill" data-type="' + s.type + '"><div class="xs-hd"><span class="xs-ic">' + t.icon + '</span><b>' +
      esc(s.name) + '</b><em>' + t.label + '</em></div><div class="xs-ds">' + esc(describeSkill(s)) + '</div>' +
      '<div class="xs-ft">필살 게이지 100% 시 발동 · 자동/수동</div></div>';
  }
  /* 3×3 칸 — 전투 유닛의 gx(0 전열~), gy(0~2). 없으면 idx로 계산 */
  function cellOf(u, i) {
    const n = (i == null ? u.idx : i) || 0;
    return { x: u.gx != null ? u.gx : Math.floor(n / 3), y: u.gy != null ? u.gy : n % 3 };
  }
  function skillTargets(area, foes, main) {
    const L = foes.filter((f) => f.alive !== false && f.hp > 0);
    if (!L.length) return [];
    const m = main && L.indexOf(main) >= 0 ? main : L[0], mc = cellOf(m, foes.indexOf(m));
    const ax = (f) => cellOf(f, foes.indexOf(f)).x, ay = (f) => cellOf(f, foes.indexOf(f)).y;
    switch (area) {
      case 'all': return L;
      case 'front': { const fx = Math.min.apply(null, L.map(ax)); return L.filter((f) => ax(f) === fx); }
      case 'row': return L.filter((f) => ay(f) === mc.y);
      case 'col': return L.filter((f) => ax(f) === mc.x);
      case 'cross': return L.filter((f) => { const c = cellOf(f, foes.indexOf(f)); return Math.abs(c.x - mc.x) + Math.abs(c.y - mc.y) <= 1; });
      case 'rand3': return L.slice().sort(function () { return Math.random() - .5; }).slice(0, 3);
      case 'low': return [L.slice().sort((a, b) => a.hp - b.hp)[0]];
      default: return [m];
    }
  }
  function runSkill(s, caster, ctx) {
    const foes = ctx.foes || [], allies = (ctx.allies || []).filter((a) => a.alive !== false && a.hp > 0), H = ctx.H || {};
    const live = foes.filter((f) => f.alive !== false && f.hp > 0);
    if (s.pow || s.stun || s.slow || s.burn) {
      const dist = H.dist || (function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); });
      const main = live.slice().sort((a, b) => dist(caster, a) - dist(caster, b))[0];
      if (main) {
        if (s.type === 'charge' && H.dash) H.dash(caster, main);
        skillTargets(s.area, foes, main).forEach((t) => {
          if (s.pow && H.dmg) H.dmg(caster, t, s.pow / 100);
          if (s.stun && H.stun) H.stun(t, s.stun);
          if (s.slow && H.slow) H.slow(t, s.slow, s.dur || 3);
          if (s.burn && H.burn) H.burn(t, caster.atk * s.burn / 100, s.dur || 3);
        });
      }
    }
    allies.forEach((a) => {
      if (s.heal && H.heal) H.heal(a, Math.round(a.max * s.heal / 100));
      if (s.atkUp && H.buff) H.buff(a, 'atk', s.atkUp / 100, s.dur || 5);
      if (s.gauge) a.gauge = Math.min(100, (a.gauge || 0) + s.gauge);
    });
  }

  /* ── 1막 관문 (v5.68 편성 그대로) ───────────────────────── */
  const STAGE_DEFS = [
    { n: 1, name: '황건 정찰대', sub: '길목을 지키는 황건 패잔병', groups: [{ name: '황건 정찰병', job: '산적', L: 26, W: 28, I: 6, c: 3 }] },
    { n: 2, name: '황건 도적떼', sub: '마을을 턴 황건 도적들', groups: [{ name: '황건 도적', job: '산적', L: 32, W: 36, I: 8, c: 4 }] },
    { n: 3, name: '황건 무리', sub: '술사를 앞세운 황건의 무리', groups: [{ name: '황건 도적', job: '산적', L: 36, W: 42, I: 10, c: 3 }, { name: '황건 술사', job: '도사', L: 30, W: 18, I: 44, c: 1 }] },
    { n: 4, name: '황건 정예', sub: '붉은 수건을 두른 정예 부대', groups: [{ name: '황건 정예', job: '창병', L: 44, W: 50, I: 14, c: 4 }] },
    { n: 5, name: '장량의 진', sub: '중간보스 · 장량', boss: '장량', groups: [{ name: '장량', boss: true, job: '도사', L: 74, W: 66, I: 76, c: 1, scale: 1.55 }, { name: '황건 정예', job: '창병', L: 46, W: 52, I: 14, c: 3 }] },
    { n: 6, name: '태평도 신도', sub: '태평도의 신도들이 밀려옵니다', groups: [{ name: '태평도 신도', job: '무도가', L: 54, W: 58, I: 20, c: 4 }, { name: '황건 술사', job: '도사', L: 44, W: 24, I: 58, c: 1 }] },
    { n: 7, name: '태평도 주력', sub: '태평도의 주력 군세', groups: [{ name: '태평도 주력', job: '창병', L: 60, W: 64, I: 24, c: 4 }, { name: '황건 술사', job: '도사', L: 48, W: 26, I: 62, c: 1 }] },
    { n: 8, name: '장보의 진', sub: '보스 · 장보', boss: '장보', groups: [{ name: '장보', boss: true, job: '도사', L: 75, W: 64, I: 78, c: 1, scale: 1.62 }, { name: '황건 정예', job: '창병', L: 60, W: 64, I: 22, c: 4 }] },
    { n: 9, name: '남양 최후 저지선', sub: '남양으로 가는 마지막 길목', groups: [{ name: '남양 결사대', job: '검병', L: 72, W: 76, I: 30, c: 4 }, { name: '황건 술사', job: '도사', L: 60, W: 30, I: 72, c: 1 }] },
    { n: 10, name: '장각의 진', sub: '최종보스 · 장각', boss: '장각', groups: [{ name: '장각', boss: true, job: '도사', L: 86, W: 36, I: 88, c: 1, scale: 1.9 }, { name: '황건 정예', job: '창병', L: 70, W: 74, I: 30, c: 5 }] }
  ];

  /* ── 작은 도우미 ─────────────────────────────────────────── */
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('ko-KR');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const stars = (n) => '★'.repeat(clamp(Math.round(n) || 1, 1, STAR_MAX));
  function sfx(name) { try { if (SK.sfx && SK.sfx.play) SK.sfx.play(name || 'ui'); } catch (e) { /* ignore */ } }

  /* ── 장수 풀 (본편 701명) ────────────────────────────────── */
  const FALLBACK_UNITS = [
    { id: '미방', name: '미방', cls: 'melee', faction: '촉', tier: 'A', job: '창병', skill: '수성의 보급', gen: { leadership: 75, war: 74, intel: 52 } },
    { id: '미축', name: '미축', cls: 'ranged', faction: '촉', tier: 'A', job: '풍수사', skill: '거부의 군자금', gen: { leadership: 47, war: 24, intel: 76 } },
    { id: '간옹', name: '간옹', cls: 'strategist', faction: '촉', tier: 'A', job: '책사', skill: '유머의 중재', gen: { leadership: 38, war: 32, intel: 74 } },
    { id: '유비', name: '유비', cls: 'melee', faction: '촉', tier: 'S', job: '군주', skill: '인덕의 빛', gen: { leadership: 75, war: 73, intel: 74 } }
  ];
  let _pool = null, _poolSig = '', _byId = null;

  function clsOf(job) {
    if (CASTER_JOBS.indexOf(job) >= 0) return 'strategist';
    if (RANGED_JOBS.indexOf(job) >= 0) return 'ranged';
    if (MELEE_JOBS.indexOf(job) >= 0) return 'melee';
    return 'melee';
  }
  function facOf(f) { return FACTIONS.indexOf(f) >= 0 ? f : null; }   // 재야(在野)는 어느 세력에도 들지 않는다

  function pool() {
    const gs = (SK.GENERALS || []);
    const sig = gs.length + ':' + (gs[0] ? gs[0].name : '');
    if (_pool && _poolSig === sig) return _pool;
    _poolSig = sig;
    if (!gs.length) { _pool = FALLBACK_UNITS.slice(); _byId = {}; _pool.forEach((u) => { _byId[u.id] = u; }); return _pool; }
    _pool = gs.filter((g) => g && g.name).map((g) => ({
      id: g.name, name: g.name, cls: clsOf(g.job), job: g.job || '',
      faction: facOf(g.faction), tier: g.tier || 'C', skill: g.skill || '', gen: g
    }));
    _byId = {};
    _pool.forEach((u) => { _byId[u.id] = u; });
    return _pool;
  }
  function def(id) {
    pool();
    if (_byId && _byId[id]) return _byId[id];
    const fb = FALLBACK_UNITS.find((u) => u.id === id);
    return fb || { id: id, name: id || '???', cls: 'melee', faction: null, tier: 'C', job: '', skill: '', gen: { leadership: 40, war: 40, intel: 30 } };
  }
  function genOf(d) { return (d && (d.gen || (SK.GEN_BY_NAME && SK.GEN_BY_NAME[d.id]))) || null; }

  function portraitSrc(d) {
    try {
      const g = genOf(d);
      if (g && SK.genPortrait && SK.ptSrc) return SK.ptSrc(SK.genPortrait(g));
    } catch (e) { /* ignore */ }
    return 'assets/portraits/v2/gen_bobyung.webp';
  }
  function chibiSrc(d) {
    try {
      const g = genOf(d);
      if (g && SK.genUnit && SK.unitSrc) return SK.unitSrc(SK.genUnit(g));
      if (d && d.job && SK.classUnitFile && SK.JOB_CLASS && SK.JOB_CLASS[d.job]) return SK.classUnitFile(SK.JOB_CLASS[d.job]);
    } catch (e) { /* ignore */ }
    return 'assets/units/job_' + (JOB_SPRITE[(d && d.job) || ''] || 'sword') + '.webp';
  }
  function enemySrc(job) { return 'assets/units/job_' + (JOB_SPRITE[job] || 'sword') + '.webp'; }

  /* ── 저장 ────────────────────────────────────────────────── */
  let S = null;

  function readMerit() {
    let v = null;
    try { const raw = localStorage.getItem(META_KEY); if (raw != null && raw !== '') v = Number(raw); } catch (e) { v = null; }
    if (v == null || !isFinite(v) || v < 0) { v = START_MERIT; writeMerit(v); }
    return Math.round(v);
  }
  function writeMerit(v) {
    try { localStorage.setItem(META_KEY, String(Math.max(0, Math.round(Number(v) || 0)))); } catch (e) { /* 저장이 막힌 브라우저 */ }
  }
  function addMerit(n) { const v = readMerit() + Math.round(Number(n) || 0); writeMerit(v); return v; }

  const STARTERS = ['미방', '미축', '간옹'];

  function normOwned(r) {
    const o = { star: clamp(Math.round(Number(r && r.star) || 1), 1, STAR_MAX), lv: clamp(Math.round(Number(r && r.lv) || 1), 1, MAX_LV), exp: Math.max(0, Math.round(Number(r && r.exp) || 0)) };
    const eq = (r && r.equip && typeof r.equip === 'object') ? r.equip : {};
    const box = {};
    ['weapon', 'armor', 'treasure'].forEach((k) => { if (eq[k]) box[k] = String(eq[k]); });
    if (Object.keys(box).length) o.equip = box;
    return o;
  }

  function loadStore() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    const st = (raw && typeof raw === 'object') ? raw : {};
    const out = { v: 2, owned: {}, squad: [], gear: [], cleared: [], progress: 1, credit: {} };

    /* ① v5.70 구조가 이미 있으면 그대로 읽는다 */
    if (st.owned && typeof st.owned === 'object' && Object.keys(st.owned).length) {
      Object.keys(st.owned).forEach((id) => {
        if (!id || typeof id !== 'string') return;
        out.owned[id] = normOwned(st.owned[id]);
      });
      out.squad = (Array.isArray(st.squad) ? st.squad : []).filter((id) => out.owned[id]).slice(0, MAX_SQUAD);
    } else {
      /* ② v5.69 이하 저장 → 새 구조로 옮긴다 (lv·exp 기본값 1·0) */
      const roster = (Array.isArray(st.roster) && st.roster.length) ? st.roster.filter((n) => typeof n === 'string' && n) : STARTERS.slice();
      STARTERS.forEach((n) => { if (roster.indexOf(n) < 0) roster.push(n); });
      const rawStars = (st.stars && typeof st.stars === 'object') ? st.stars : {};
      roster.forEach((n) => { out.owned[n] = normOwned({ star: rawStars[n], lv: 1, exp: 0 }); });
      const formation = Array.isArray(st.formation) ? st.formation : null;
      if (formation) out.squad = formation.filter((n) => n && out.owned[n]).slice(0, MAX_SQUAD);
    }

    /* 시작 3인은 어떤 경우에도 원정단에 남긴다 */
    STARTERS.forEach((n) => { if (!out.owned[n]) out.owned[n] = { star: 1, lv: 1, exp: 0 }; });
    if (!out.squad.length) out.squad = STARTERS.slice().filter((n) => out.owned[n]).slice(0, MAX_SQUAD);
    out.squad = out.squad.filter((id, i, arr) => out.owned[id] && arr.indexOf(id) === i).slice(0, MAX_SQUAD);

    /* 장비 인스턴스 */
    const seen = {};
    (Array.isArray(st.gear) ? st.gear : []).forEach((it) => {
      if (!it || it.tid == null || !it.iid) return;
      const iid = String(it.iid);
      if (seen[iid]) return;
      seen[iid] = 1;
      out.gear.push({ iid: iid, tid: Number(it.tid) });
    });
    /* 장착 — 없는 장비·잘못된 칸·중복 장착은 버린다. 보물 데이터가 아직 안 왔으면 지우지 않는다 */
    const usedIid = {};
    const tpReady = (SK.TREASURES || []).length > 0;
    const rawEquip = {};
    if (st.equip && typeof st.equip === 'object') Object.keys(st.equip).forEach((n) => { rawEquip[n] = st.equip[n]; });
    Object.keys(out.owned).forEach((id) => {
      const box = out.owned[id].equip || {};
      Object.keys(box).forEach((slot) => {
        const iid = box[slot];
        const item = out.gear.find((g) => g.iid === iid);
        const t = item ? treasureOf(item) : null;
        if (!t) { if (tpReady || !item) delete box[slot]; return; }
        if (slotOf(t) !== slot || usedIid[iid]) { delete box[slot]; return; }
        usedIid[iid] = 1;
      });
      if (!Object.keys(box).length) delete out.owned[id].equip;
    });
    /* 옛 equip(name → {slot:iid}) 가 남아 있고 새 칸이 비어 있으면 옮겨 담는다 */
    Object.keys(rawEquip).forEach((id) => {
      if (!out.owned[id] || out.owned[id].equip) return;
      const src = rawEquip[id];
      if (!src || typeof src !== 'object') return;
      const box = {};
      ['weapon', 'armor', 'treasure'].forEach((slot) => {
        const iid = src[slot];
        const item = out.gear.find((g) => g.iid === iid);
        const t = item ? treasureOf(item) : null;
        if (!t || usedIid[iid] || slotOf(t) !== slot) return;
        usedIid[iid] = 1; box[slot] = String(iid);
      });
      if (Object.keys(box).length) out.owned[id].equip = box;
    });

    /* 진행도 */
    const cleared = (Array.isArray(st.cleared) ? st.cleared : [])
      .map((n) => Number(n)).filter((n) => n >= 1 && n <= MAX_ACT1);
    cleared.sort((a, b) => a - b);
    out.cleared = cleared.filter((n, i, a) => a.indexOf(n) === i);
    out.progress = clamp(Number(st.progress) || (out.cleared.length ? Math.max.apply(null, out.cleared) + 1 : 1), 1, MAX_ACT1);
    out.credit = (st.credit && typeof st.credit === 'object') ? { raw: Number(st.credit.raw) || 0, baseCities: st.credit.baseCities == null ? null : Number(st.credit.baseCities) } : {};
    return out;
  }

  function maxCleared() {
    if (!S || !S.cleared || !S.cleared.length) return 0;
    let m = 0; S.cleared.forEach((n) => { if (n > m) m = n; });
    return m;
  }
  function save() {
    if (!S) return;
    try {
      const dump = {
        v: 2,
        owned: S.owned,
        squad: S.squad,
        gear: S.gear,
        cleared: S.cleared.slice(),
        progress: clamp(maxCleared() + 1, 1, MAX_ACT1),
        credit: S.credit,
        /* ── 옛 구조도 함께 써 둔다 (v5.69 빌드 호환) ── */
        roster: Object.keys(S.owned),
        stars: (function () { const o = {}; Object.keys(S.owned).forEach((id) => { o[id] = S.owned[id].star; }); return o; })(),
        formation: (function () { const f = new Array(9).fill(null); const order = [1, 4, 7, 0, 2]; S.squad.forEach((id, i) => { if (order[i] != null && S.owned[id]) f[order[i]] = id; }); return f; })(),
        equip: (function () { const o = {}; Object.keys(S.owned).forEach((id) => { if (S.owned[id].equip && Object.keys(S.owned[id].equip).length) o[id] = S.owned[id].equip; }); return o; })()
      };
      localStorage.setItem(KEY, JSON.stringify(dump));
    } catch (e) { /* ignore */ }
  }

  /* ── 본편 공훈 적립 (v5.68 그대로) ───────────────────────── */
  function ownedCities() {
    const s = SK.state;
    if (!s || !s.cities || !SK.CITY_LIST) return 0;
    return SK.CITY_LIST.filter((c) => s.cities[c.id] && s.cities[c.id].owner === s.playerFaction).length;
  }
  function syncMerit(announce) {
    const s = SK.state;
    if (!s || !s.cities) return;
    const c = S.credit;
    const cities = ownedCities();
    if (c.baseCities == null) c.baseCities = cities;
    const fame = Number(s.fame) || 0;
    const raw = fame * 2 + Math.max(0, cities - c.baseCities) * 20 + (s.unified ? 500 : 0);
    if (raw < c.raw) { c.baseCities = cities; c.raw = fame * 2 + (s.unified ? 500 : 0); save(); return; }
    if (raw > c.raw) {
      const gain = raw - c.raw;
      addMerit(gain);
      c.raw = raw;
      save();
      if (announce) toast('본편 공훈 +' + fmt(gain) + ' 적립! (명성 ' + fame + ')');
    }
  }

  /* ── 장비 (보물) — 원정 3×3 난투용 재정립 (v5.74) ──────────
     무기 = 공격력% + 치명타%   갑옷 = 최대HP% + 피해감소%   보물 = 공격속도% + 초기 게이지%
     본편 보물 등급: 전설=S · 영웅=A · 희귀=B · 일반=C   (data/treasures.json 의 type·grade 그대로) */
  const SLOTS = ['weapon', 'armor', 'treasure'];
  const SLOT_LABEL = { weapon: '무기', armor: '갑옷', treasure: '보물' };
  const SLOT_ICON = { weapon: '⚔️', armor: '🛡️', treasure: '💎' };
  const TYPE_ICON = { '무기': '⚔️', '방어구': '🛡️', '명마': '🐎', '서적': '📜', '병법서': '📜', '병법서·보물': '📜', '보물': '💎', '비보': '💎', '문물': '🏺', '약': '🧪', '악기': '🎵' };
  const EQUIP_SLOTS = {
    weapon: { label: '무기', icon: '⚔️', fx: [['atk', '공격력', '⚔️'], ['crit', '치명타', '💥']] },
    armor: { label: '갑옷', icon: '🛡️', fx: [['hp', '최대HP', '❤️'], ['reduce', '피해감소', '🧱']] },
    treasure: { label: '보물', icon: '💎', fx: [['aspd', '공격속도', '⚡'], ['gauge0', '초기 게이지', '🔋']] }
  };
  const EQUIP_BASE = {   // [1번째 %, 2번째 %]
    weapon: { S: [18, 10], A: [12, 7], B: [8, 5], C: [5, 3] },
    armor: { S: [20, 10], A: [14, 7], B: [9, 5], C: [6, 3] },
    treasure: { S: [12, 25], A: [8, 18], B: [5, 12], C: [3, 8] }
  };
  const EQUIP_GRADE = { '전설': 'S', '영웅': 'A', '희귀': 'B', '일반': 'C', 'S': 'S', 'A': 'A', 'B': 'B', 'C': 'C' };
  const EQUIP_CAP = { crit: 60, reduce: 50, aspd: 60, gauge0: 80 };
  function slotOf(t) {
    if (!t) return 'treasure';
    const ty = String(t.type || t.slot || t.kind || '');
    if (/무기/.test(ty)) return 'weapon';
    if (/방어구|갑옷/.test(ty)) return 'armor';
    return 'treasure';
  }
  function normalizeTreasure(t) {
    if (!t) return null;
    const slot = slotOf(t), g = EQUIP_GRADE[t.grade] || 'C', k = 1 + 0.05 * (Number(t.enh) || 0);
    const b = EQUIP_BASE[slot][g] || EQUIP_BASE[slot].C, keys = EQUIP_SLOTS[slot].fx;
    return {
      id: t.id, name: t.name, grade: g, slot: slot,
      fx: keys.map((f, i) => ({ key: f[0], label: f[1], icon: f[2], val: Math.round(b[i] * k * 10) / 10 }))
    };
  }
  function fxChips(n) {
    if (!n) return '';
    return '<div class="xt-fx">' + n.fx.map((f) => '<span>' + f.icon + ' ' + f.label + ' <b>+' + f.val + '%</b></span>').join('') + '</div>';
  }
  function treasureCardHTML(t) {
    const n = normalizeTreasure(t);
    if (!n) return '';
    return '<div class="xt-card" data-grade="' + n.grade + '"><div class="xt-top"><span class="xt-ic">' + SLOT_ICON[n.slot] +
      '</span><b>' + esc(n.name) + '</b><em>' + n.grade + '</em></div><div class="xt-slot">' + SLOT_LABEL[n.slot] + '</div>' + fxChips(n) + '</div>';
  }
  function equipBonus(id) {
    const r = { atk: 0, hp: 0, crit: 0, reduce: 0, aspd: 0, gauge0: 0 };
    const box = (S && S.owned && S.owned[id] && S.owned[id].equip) || {};
    SLOTS.forEach((slot) => {
      const t = treasureOf(gearItem(box[slot]));
      if (!t) return;
      const n = normalizeTreasure(t);
      if (!n) return;
      n.fx.forEach((f) => { r[f.key] += f.val / 100; });
    });
    Object.keys(EQUIP_CAP).forEach((k) => { r[k] = Math.min(r[k] || 0, EQUIP_CAP[k] / 100); });
    return r;
  }
  function applyEquipToUnit(u, b) {   // 치명타 1.5배 · 피해감소 · 공격속도 · 초기 게이지
    if (!u || !b) return u;
    u.crit = b.crit || 0; u.reduce = b.reduce || 0; u.aspd = b.aspd || 0;
    u.gauge = Math.max(u.gauge || 0, Math.round((b.gauge0 || 0) * 100));
    return u;
  }
  function treasureOf(item) {
    if (!item) return null;
    try {
      if (SK.TREASURE_BY_ID && SK.TREASURE_BY_ID[item.tid]) return SK.TREASURE_BY_ID[item.tid];
      return (SK.TREASURES || []).find((t) => t && t.id === item.tid) || null;
    } catch (e) { return null; }
  }
  function gearItem(iid) { return (S && S.gear.find((g) => g.iid === iid)) || null; }
  function equippedBy() {
    const used = {};
    if (!S) return used;
    Object.keys(S.owned).forEach((id) => {
      const box = S.owned[id].equip || {};
      SLOTS.forEach((k) => { if (box[k]) used[box[k]] = id; });
    });
    return used;
  }
  function equipItem(id, iid) {
    const item = gearItem(iid), t = treasureOf(item);
    if (!item || !t || !S.owned[id]) { toast('장비를 찾을 수 없어요'); return false; }
    const slot = slotOf(t);
    const used = equippedBy();
    if (used[iid] && used[iid] !== id) { toast(t.name + '은(는) ' + used[iid] + '이(가) 쓰고 있어요'); sfx('deny'); return false; }
    S.owned[id].equip = S.owned[id].equip || {};
    S.owned[id].equip[slot] = iid;
    save(); sfx('ui');
    toast(id + ' — ' + SLOT_LABEL[slot] + '에 ' + t.name + ' 장착');
    return true;
  }
  function unequip(id, slot) {
    const box = S.owned[id] && S.owned[id].equip;
    if (!box || !box[slot]) return false;
    delete box[slot];
    if (!Object.keys(box).length) delete S.owned[id].equip;
    save(); sfx('ui');
    toast(id + ' — ' + SLOT_LABEL[slot] + ' 해제');
    return true;
  }

  /* ── 스탯 ────────────────────────────────────────────────── */
  const emptySyn = () => ({ atk: 0, def: 0, hp: 0 });
  function synergies(ids) {
    const out = [];
    const cnt = {};
    (ids || []).forEach((id) => { const f = def(id).faction; if (f) cnt[f] = (cnt[f] || 0) + 1; });
    let best = null, bn = 0;
    FACTIONS.forEach((f) => { if ((cnt[f] || 0) > bn) { bn = cnt[f]; best = f; } });
    if (bn >= 3) {
      const tier = FACTION_TIERS[bn >= 5 ? 5 : bn >= 4 ? 4 : 3];
      out.push({ label: best + ' ' + bn + '명', atk: tier.atk, def: tier.def, hp: tier.hp, faction: best });
    }
    BONDS.forEach((b) => {
      const hit = b.members.filter((m) => (ids || []).indexOf(m) >= 0).length;
      if (hit >= (b.need || b.members.length)) out.push({ label: b.name, atk: b.atk || 0, def: b.def || 0, hp: b.hp || 0, bond: 1, icon: b.icon });
    });
    return out;
  }
  const sumSyn = (list) => (list || []).reduce((a, s) => { a.atk += s.atk || 0; a.def += s.def || 0; a.hp += s.hp || 0; return a; }, emptySyn());

  function baseStats(d) {
    const g = genOf(d) || {};
    const L = Number(g.leadership) || 40;
    const W = Number(g.war) || 40;
    const I = Number(g.intel) || 30;
    return { L: L, W: W, I: I };
  }
  function stat(id, syn) {
    const d = def(id);
    const r = (S && S.owned[id]) || { lv: 1, star: 1 };
    const b = baseStats(d);
    const m = (1 + 0.06 * (r.lv - 1)) * (1 + 0.12 * (r.star - 1));
    const g = syn || emptySyn();
    const eb = equipBonus(id);          // 장비: 무기 공격력% · 갑옷 최대HP%
    return {
      atk: Math.round((b.W * 1.1 + b.I * 0.35 + b.L * 0.3) * m * (1 + (g.atk || 0)) * (1 + (eb.atk || 0))),
      def: Math.round((b.L * 0.5 + b.W * 0.15) * m * (1 + (g.def || 0))),
      hp: Math.round((b.L * 10 + b.W * 6) * m * (1 + (g.hp || 0)) * (1 + (eb.hp || 0)))
    };
  }
  function power(ids) {
    const g = sumSyn(synergies(ids));
    return (ids || []).reduce((p, id) => { const s = stat(id, g); return p + s.atk * 3 + s.def * 2 + s.hp * 0.3; }, 0);
  }
  function targetStage() { return Math.min(maxCleared() + 1, MAX_ACT1); }

  /* ── 레벨 ────────────────────────────────────────────────── */
  const needExp = (lv) => Math.floor(30 * Math.pow(lv, 1.3) + 20);
  const lvCost = (lv) => 3 + Math.floor(lv * lv / 30);
  function sumCost(lv, n) { let t = 0; for (let i = 0; i < n && lv + i < MAX_LV; i++) t += lvCost(lv + i); return t; }
  function addExp(id, n) {
    const r = S.owned[id];
    if (!r || r.lv >= MAX_LV) return 0;
    let up = 0;
    r.exp += Math.max(0, Math.round(n));
    while (r.lv < MAX_LV && r.exp >= needExp(r.lv)) { r.exp -= needExp(r.lv); r.lv++; up++; }
    if (r.lv >= MAX_LV) r.exp = 0;
    return up;
  }
  function buyLv(id, n) {
    const r = S.owned[id];
    if (!r) return 0;
    let done = 0;
    while (done < n && r.lv < MAX_LV) {
      const c = lvCost(r.lv);
      if (readMerit() < c) break;
      addMerit(-c); r.lv++; done++;
    }
    if (done) save();
    return done;
  }

  /* ── 뽑기 ────────────────────────────────────────────────── */
  function byTier() {
    const o = { S: [], A: [], B: [], C: [] };
    pool().forEach((u) => { const t = ['S', 'A', 'B', 'C'].indexOf(u.tier) >= 0 ? u.tier : 'C'; o[t].push(u); });
    return o;
  }
  function rollTier(minB) {
    const r = Math.random() * 100;
    let t = r < HERO_RATE.S ? 'S' : r < HERO_RATE.S + HERO_RATE.A ? 'A' : r < HERO_RATE.S + HERO_RATE.A + HERO_RATE.B ? 'B' : 'C';
    if (minB && t === 'C') t = 'B';
    return t;
  }
  function rollHero(minB) {
    const o = byTier();
    let t = rollTier(minB), arr = o[t];
    if (!arr.length) { ['C', 'B', 'A', 'S'].some((k) => { if (o[k].length) { arr = o[k]; t = k; return false; } return true; }); }
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function grantHero(u) {
    if (!u) return null;
    const r = S.owned[u.id];
    if (!r) {
      S.owned[u.id] = { star: 1, lv: 1, exp: 0 };
      return { id: u.id, name: u.name, tier: u.tier, star: 1, isNew: true, tag: 'NEW' };
    }
    if (r.star < STAR_MAX) { r.star++; return { id: u.id, name: u.name, tier: u.tier, star: r.star, isNew: false, tag: '★' + r.star }; }
    addMerit(40);
    return { id: u.id, name: u.name, tier: u.tier, star: r.star, isNew: false, tag: '공훈+40' };
  }
  function pullHero(n) {
    const out = [];
    for (let i = 0; i < n; i++) { const u = rollHero(false); const r = grantHero(u); if (r) out.push(r); }
    if (n === 10 && out.length) {
      const good = out.some((r) => r.tier === 'S' || r.tier === 'A' || r.isNew || /★/.test(r.tag));
      if (!good) { const u = rollHero(true); const r = grantHero(u); if (r) out[out.length - 1] = r; }
    }
    return out;
  }
  let iidSeq = 0;
  function newIid() { iidSeq = (iidSeq + 1) % 1000; return 'g' + Date.now().toString(36) + iidSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function rollGearGrade(minRare) {
    const r = Math.random() * 100;
    let acc = 0, g = '일반';
    ['전설', '영웅', '희귀', '일반'].some((k) => { acc += GEAR_RATE[k] || 0; if (r < acc) { g = k; return true; } return false; });
    if (minRare && g === '일반') g = '희귀';
    return g;
  }
  function rollGear(minRare) {
    const all = (SK.TREASURES || []).filter((t) => t && t.name);
    if (!all.length) return null;
    let grade = rollGearGrade(minRare);
    let list = all.filter((t) => t.grade === grade);
    if (!list.length) { list = all; grade = list[0].grade || '일반'; }
    const t = list[Math.floor(Math.random() * list.length)];
    return { iid: newIid(), tid: t.id, treasure: t };
  }
  function pullGear(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const it = rollGear(false);
      if (!it) break;
      S.gear.push({ iid: it.iid, tid: it.tid });
      out.push(it);
    }
    if (n === 10 && out.length === 10 && !out.some((it) => it.treasure.grade !== '일반')) {
      S.gear.pop();
      const it = rollGear(true);
      if (it) { S.gear.push({ iid: it.iid, tid: it.tid }); out[out.length - 1] = it; }
    }
    return out;
  }

  /* =====================================================================
     화면 — 루트
     ===================================================================== */
  let root = null, stage = null;
  function fit() {
    if (!stage) return;
    const k = Math.min(window.innerWidth / 390, window.innerHeight / 844);
    stage.style.transform = 'translate(-50%,-50%) scale(' + k + ')';
  }
  function mount() {
    if (root) return;
    root = el('div', 'ex-root'); root.id = 'expRoot';
    stage = el('div', 'ex-stage'); root.appendChild(stage);
    document.body.appendChild(root);
    fit(); window.addEventListener('resize', fit);
  }
  function open() {
    S = loadStore();
    save();
    mount();
    syncMerit(true);
    renderRoom();
    /* 보물 데이터가 늦게 오면 장비 효과를 다시 계산해 그린다 */
    if (!(SK.TREASURES || []).length && typeof SK.loadTreasures === 'function') {
      SK.loadTreasures().then(() => { if (S && root) { S = loadStore(); renderRoom(); } }).catch(() => { /* ignore */ });
    }
    try { if (SK.bgm) SK.bgm('title'); } catch (e) { /* ignore */ }
  }
  function close() {
    stopBattle();
    if (root) { root.remove(); root = stage = null; }
    window.removeEventListener('resize', fit);
    if (typeof window.ExpBack === 'function') { try { window.ExpBack(); } catch (e) { /* ignore */ } }
    else {
      try { if (SK.show) SK.show('screen-title'); } catch (e) { /* ignore */ }
      document.dispatchEvent(new CustomEvent('exp:exit'));
    }
  }
  function isOpen() { return !!root; }
  function back() {
    if (!root) return false;
    if (B) { stopBattle(); renderRoom(); return true; }
    if (root.querySelector('.ex-modal')) { const m = root.querySelectorAll('.ex-modal'); m[m.length - 1].remove(); return true; }
    close(); return true;
  }
  function toast(msg) {
    if (!stage) return;
    const t = el('div', 'ex-toast', msg); stage.appendChild(t);
    setTimeout(() => { try { t.remove(); } catch (e) { /* ignore */ } }, 1700);
  }
  function modal(title, body, opt) {
    const m = el('div', 'ex-modal');
    const box = el('div', 'ex-mbox' + (opt && opt.cls ? ' ' + opt.cls : ''));
    const h = el('div', 'ex-mh', '<b>' + title + '</b>');
    const x = el('button', 'ex-mx', '✕'); h.appendChild(x);
    box.appendChild(h); box.appendChild(body); m.appendChild(box); stage.appendChild(m);
    const kill = () => { m.remove(); if (opt && opt.onClose) opt.onClose(); };
    x.onclick = kill;
    m.addEventListener('click', (e) => { if (e.target === m) kill(); });
    m.kill = kill;
    return m;
  }
  /* ── 초상화 등급 테두리 4색 — 본편 S빨강·A보라·B파랑·C초록과 같은 값 ── */
  const GRADE_COLOR = { S: '#c42828', A: '#7742a3', B: '#2559ab', C: '#33764a' };
  function tierOf(d) {
    if (!d) return 'C';
    try { if (SK.tierOfPerson) return SK.tierOfPerson(d); } catch (e) { /* ignore */ }
    const t = String(d.tier == null ? '' : d.tier).toUpperCase();
    return GRADE_COLOR[t] ? t : 'C';
  }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  function portrait(d, cls, src) {
    const w = el('div', 'ex-pt ' + (cls || ''));
    w.dataset.grade = tierOf(d);
    const im = new Image(); im.src = src || portraitSrc(d); im.alt = d.name; im.draggable = false;
    im.onerror = () => { im.remove(); w.classList.add('noimg'); w.textContent = (d.name || '?')[0]; };
    w.appendChild(im);
    return w;
  }

  /* =====================================================================
     1. 대기실
     ===================================================================== */
  const YARD_SLOTS = [
    { x: 118, y: 445 }, { x: 272, y: 445 },
    { x: 72, y: 620 }, { x: 195, y: 620 }, { x: 320, y: 620 }
  ];
  let _readyTries = 0;

  function renderRoom() {
    stopBattle();
    if (!stage) return;
    stage.innerHTML = '';
    if (!(SK.GENERALS || []).length && _readyTries < 16) {          // 데이터 로딩 전이면 잠깐 기다렸다 다시 그린다
      _readyTries++;
      const wait = el('div', 'ex-loading', '장수 명부를 불러오는 중…');
      stage.appendChild(wait);
      setTimeout(() => { if (root) { if ((SK.GENERALS || []).length) { _readyTries = 0; renderRoom(); } else renderRoom(); } }, 260);
      return;
    }
    _readyTries = 0;
    const ids = S.squad.slice(0, MAX_SQUAD), st = targetStage(), sd = STAGE_DEFS[st - 1];
    const room = el('div', 'ex-room');
    room.appendChild(el('div', 'ex-bg'));

    const top = el('div', 'ex-top');
    const bk = el('button', 'ex-back', '← 본편'); bk.onclick = close;
    top.appendChild(bk);
    top.appendChild(el('div', 'ex-act', ACT_NAME));
    top.appendChild(el('div', 'ex-pw', '⚔️ ' + fmt(power(ids))));
    top.appendChild(el('div', 'ex-merit', '🏅 ' + fmt(readMerit())));
    room.appendChild(top);

    const rw = rewardOf(st), hero = rw.hero ? def(rw.hero) : null;
    room.appendChild(el('div', 'ex-goal',
      '<div class="g1">현재 목표</div><div class="g2">' + st + '관문 · ' + sd.name + '</div>' +
      '<div class="g3">🏅 ' + fmt(rw.merit) + (hero ? ' · 🎁 ' + hero.name : '') + '</div>' +
      (maxCleared() >= MAX_ACT1 ? '<div class="g4">1막 클리어 완료</div>' : '')));

    const side = el('div', 'ex-side');
    [['스테이지', '🗺️', openStages], ['랭킹전', '🏆', openRanking], ['진형편집', '🧩', openFormation], ['인연도감', '📜', openBonds]]
      .forEach(([t, ic, fn]) => { const b = el('button', 'ex-sbtn', '<i>' + ic + '</i><span>' + t + '</span>'); b.onclick = fn; side.appendChild(b); });
    room.appendChild(side);

    const yard = el('div', 'ex-yard');
    ids.forEach((id, i) => {
      const d = def(id), r = S.owned[id], p = YARD_SLOTS[i];
      if (!r) return;
      const c = el('div', 'ex-char'); c.style.left = p.x + 'px'; c.style.top = p.y + 'px';
      c.style.animationDelay = (i * -0.4) + 's'; c.style.zIndex = Math.round(p.y);
      c.appendChild(portrait(d, 'ex-chibi', chibiSrc(d)));
      const bd = el('div', 'ex-badge', '<b>' + stars(r.star) + '</b> Lv.' + r.lv + '<br>' + d.name);
      bd.dataset.grade = tierOf(d);
      c.appendChild(bd);
      c.onclick = () => openUnit(id);
      yard.appendChild(c);
    });
    if (!ids.length) yard.appendChild(el('div', 'ex-empty', '출진할 장수를 진형편집에서 골라 주세요'));
    room.appendChild(yard);

    const syn = synergies(ids);
    const sb = el('div', 'ex-syn');
    if (!syn.length) sb.appendChild(el('span', 'ex-chip off', '활성 시너지 없음'));
    syn.forEach((s) => sb.appendChild(el('span', 'ex-chip' + (s.bond ? ' bond' : ''), (s.icon || '🚩') + ' ' + s.label + ' <em>' + synText(s) + '</em>')));
    room.appendChild(sb);

    const go = el('button', 'ex-go', maxCleared() >= MAX_ACT1 ? '⚔️ 10관문 재도전' : '⚔️ ' + st + '관문 출진');
    go.onclick = () => startBattle(st);
    room.appendChild(go);

    const dock = el('nav', 'ex-dock');
    [['장수', '🛡️', openRoster], ['보물', '💎', openTreasure], ['소환', '🔮', openSummon], ['랭킹', '🏆', openRanking]]
      .forEach(([t, ic, fn]) => { const b = el('button', '', '<i>' + ic + '</i><span>' + t + '</span>'); b.onclick = fn; dock.appendChild(b); });
    room.appendChild(dock);
    stage.appendChild(room);
  }
  function synText(s) {
    const a = [];
    if (s.atk) a.push('공+' + Math.round(s.atk * 100) + '%');
    if (s.def) a.push('방+' + Math.round(s.def * 100) + '%');
    if (s.hp) a.push('HP+' + Math.round(s.hp * 100) + '%');
    return a.join(' ') || '+0%';
  }
  function rewardOf(n) {
    const boss = !!(STAGE_DEFS[n - 1] && STAGE_DEFS[n - 1].boss);
    return { merit: 40 + n * 15 + (boss ? 60 : 0), hero: n === MAX_ACT1 ? '유비' : null };
  }
  /* v5.74 — 재도전은 첫 클리어의 15~25% (관문이 높을수록 ↑), 최소 10 · 최대 45 */
  function repeatRewardOf(n) {
    const rate = 0.15 + 0.10 * clamp((n - 1) / 9, 0, 1);
    return clamp(Math.round(rewardOf(n).merit * rate), 10, 45);
  }

  /* ---------- 장수 상세 (스탯/장비/레벨업) ---------- */
  function openUnit(id) {
    if (!S.owned[id]) return;
    const d = def(id), body = el('div', 'ex-unit');
    const draw = () => {
      const r = S.owned[id], s = stat(id, sumSyn(synergies(S.squad)));
      const nx = r.lv >= MAX_LV ? 0 : needExp(r.lv), pct = nx ? Math.round(r.exp / nx * 100) : 100;
      body.innerHTML = '';
      const head = el('div', 'u-head'); head.appendChild(portrait(d, 'u-pt'));
      head.appendChild(el('div', 'u-info',
        '<div class="u-n">' + d.name + ' <small>' + (CLS_LABEL[d.cls] || '') + ' · ' + (d.faction || '재야') + ' · ' + tierOf(d) + '급</small></div>' +
        '<div class="u-s">' + stars(r.star) + ' &nbsp;Lv.' + r.lv + (r.lv >= MAX_LV ? ' (MAX)' : '') + '</div>' +
        '<div class="u-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="u-x">EXP ' + fmt(r.exp) + ' / ' + (nx ? fmt(nx) : '-') + '</div>'));
      body.appendChild(head);
      body.appendChild(el('div', 'u-stats',
        '<div><span>공격</span><b>' + fmt(s.atk) + '</b></div><div><span>방어</span><b>' + fmt(s.def) + '</b></div><div><span>HP</span><b>' + fmt(s.hp) + '</b></div>'));
      body.appendChild(el('div', 'u-skillbox', skillHTML(d)));

      const eqBox = S.owned[id].equip || {};
      const es = el('div', 'u-equip');
      SLOTS.forEach((k) => {
        const t = treasureOf(gearItem(eqBox[k])), n = normalizeTreasure(t);
        const cell = el('div', 'u-eq' + (t ? ' on' : ''));
        cell.dataset.grade = n ? n.grade : 'C';
        cell.innerHTML = '<i>' + SLOT_ICON[k] + '</i><span>' + (t ? esc(t.name) : SLOT_LABEL[k]) + '</span>' +
          (n ? n.fx.map((f) => '<small>' + f.icon + '+' + f.val + '%</small>').join('') : '');
        cell.onclick = () => openEquipPicker(id, k);
        es.appendChild(cell);
      });
      body.appendChild(es);

      const row = el('div', 'u-btns');
      const b1 = el('button', 'ex-btn', '레벨업 +1 <small>🏅' + fmt(lvCost(Math.min(r.lv, MAX_LV - 1))) + '</small>');
      const b5 = el('button', 'ex-btn gold', '레벨업 +5 <small>🏅' + fmt(sumCost(r.lv, 5)) + '</small>');
      b1.onclick = () => lvUp(id, 1, draw); b5.onclick = () => lvUp(id, 5, draw);
      row.appendChild(b1); row.appendChild(b5); body.appendChild(row);
      body.appendChild(el('div', 'u-note', '보유 공훈 🏅 ' + fmt(readMerit()) + ' · 레벨당 공·방·HP +6% · ★1당 +12%'));
    };
    draw();
    modal('장수 정보', body, { onClose: renderArm });
  }
  function renderArm() { renderRoom(); }
  function lvUp(id, n, redraw) {
    const r = S.owned[id];
    if (!r) return;
    if (r.lv >= MAX_LV) return toast('이미 최대 레벨이에요');
    const done = buyLv(id, n);
    if (!done) return toast('공훈이 부족해요');
    if (done < n) toast('공훈 부족으로 +' + done + ' 상승');
    else sfx('levelup');
    redraw();
    if (stage) { const m = $('.ex-merit', stage); if (m) m.textContent = '🏅 ' + fmt(readMerit()); }
  }

  /* ---------- 장수(내 원정단) ---------- */
  function openRoster() {
    const body = el('div', 'ex-list');
    const draw = () => {
      body.innerHTML = '<div class="l-hd">보유 공훈 🏅 ' + fmt(readMerit()) + ' · 장수 ' + Object.keys(S.owned).length + '명</div>';
      Object.keys(S.owned).sort((a, b) => (S.owned[b].lv - S.owned[a].lv) || (S.owned[b].star - S.owned[a].star)).forEach((id) => {
        const d = def(id), r = S.owned[id], inSq = S.squad.indexOf(id) >= 0;
        if (!r) return;
        const row = el('div', 'l-row' + (inSq ? ' in' : ''));
        row.appendChild(portrait(d, 'l-pt'));
        row.appendChild(el('div', 'l-mid', '<b>' + d.name + ' <small>' + tierOf(d) + '급 ' + (d.faction || '재야') + '</small></b><small>' + stars(r.star) + ' Lv.' + r.lv + ' · ' + (CLS_LABEL[d.cls] || '') + ' · ⚔️' + fmt(stat(id, emptySyn()).atk) + '</small>'));
        const b1 = el('button', 'ex-mini', '+1'), b5 = el('button', 'ex-mini gold', '+5');
        b1.onclick = (e) => { if (e) e.stopPropagation(); lvUp(id, 1, draw); };
        b5.onclick = (e) => { if (e) e.stopPropagation(); lvUp(id, 5, draw); };
        row.appendChild(b1); row.appendChild(b5);
        row.onclick = () => { m.kill(); openUnit(id); };
        body.appendChild(row);
      });
    };
    draw();
    const m = modal('장수 · 내 원정단', body, { onClose: renderRoom, cls: 'tall' });
  }

  /* ---------- 스테이지 ---------- */
  function openStages() {
    const body = el('div', 'ex-list');
    const mc = maxCleared();
    for (let n = 1; n <= MAX_ACT1; n++) {
      const sd = STAGE_DEFS[n - 1], rw = rewardOf(n), ok = n <= mc, lock = n > mc + 1;
      const row = el('div', 'l-row stg' + (ok ? ' clr' : '') + (lock ? ' lock' : ''),
        '<div class="s-no">' + n + '</div><div class="l-mid"><b>' + sd.name + (sd.boss ? ' 👑' : '') + '</b><small>🏅' + fmt(rw.merit) + (rw.hero ? ' · 🎁 유비' : '') + ' · ' + sd.sub + '</small></div>' +
        '<div class="s-st">' + (ok ? '✔ 클리어' : lock ? '🔒' : '도전') + '</div>');
      if (!lock) row.onclick = () => { m.kill(); startBattle(n); };
      body.appendChild(row);
    }
    const m = modal(ACT_NAME, body, { cls: 'tall' });
  }

  /* ---------- 랭킹 ---------- */
  function openRanking() {
    const mine = Math.floor(power(S.squad));
    const names = ['여포', '하후돈', '마초', '감녕', '태사자', '전위', '허저', '장료', '손책', '주유'];
    const list = names.map((n, i) => ({ n: n, p: Math.floor(mine * (1.6 - i * 0.13) + 500 * (10 - i)) }));
    list.push({ n: '나', p: mine, me: 1 });
    list.sort((a, b) => b.p - a.p);
    const body = el('div', 'ex-list');
    list.forEach((r, i) => body.appendChild(el('div', 'l-row' + (r.me ? ' in' : ''),
      '<div class="s-no">' + (i + 1) + '</div><div class="l-mid"><b>' + r.n + '</b></div><div class="s-st">⚔️ ' + fmt(r.p) + '</div>')));
    body.appendChild(el('div', 'u-note', '※ 임시 랭킹 (서버 연동 전) — 내 전투력 ⚔️ ' + fmt(mine)));
    modal('랭킹', body, { cls: 'tall' });
  }

  /* ---------- 진형편집 ---------- */
  function openFormation() {
    const body = el('div', 'ex-form');
    let sel = -1;
    const draw = () => {
      body.innerHTML = '<div class="l-hd">출진 순서 (탭해서 위치 교환 · 최대 5명)</div>';
      const row = el('div', 'f-slots');
      for (let i = 0; i < MAX_SQUAD; i++) {
        const id = S.squad[i], sl = el('div', 'f-slot' + (i === sel ? ' sel' : ''));
        if (id) { sl.appendChild(portrait(def(id), 'f-pt')); sl.appendChild(el('small', '', def(id).name)); }
        else sl.innerHTML = '<em>+</em>';
        sl.onclick = () => {
          if (sel < 0) { if (S.squad[i]) sel = i; }
          else if (i < S.squad.length) { const t = S.squad[i]; S.squad[i] = S.squad[sel]; S.squad[sel] = t; sel = -1; save(); }
          else { sel = -1; }
          draw();
        };
        row.appendChild(sl);
      }
      body.appendChild(row);
      body.appendChild(el('div', 'l-hd', '대기 장수 (탭: 출진/제외)'));
      const bench = el('div', 'f-bench');
      Object.keys(S.owned).forEach((id) => {
        const d = def(id), inSq = S.squad.indexOf(id) >= 0;
        const c = el('div', 'f-card' + (inSq ? ' in' : ''));
        c.appendChild(portrait(d, 'f-pt'));
        c.appendChild(el('small', '', 'Lv.' + S.owned[id].lv + ' ' + d.name));
        c.onclick = () => {
          if (inSq) {
            if (S.squad.length <= 1) return toast('최소 1명은 출진해야 해요');
            S.squad = S.squad.filter((x) => x !== id);
          } else if (S.squad.length < MAX_SQUAD) S.squad.push(id);
          else return toast('출진은 5명까지예요 — 한 명을 빼 주세요');
          sel = -1; save(); draw();
        };
        bench.appendChild(c);
      });
      body.appendChild(bench);
      const sy = synergies(S.squad);
      body.appendChild(el('div', 'u-note', '⚔️ 총 전투력 ' + fmt(power(S.squad)) + (sy.length ? ' · ' + sy.map((s) => s.label).join(', ') : '')));
    };
    draw();
    modal('진형편집', body, { onClose: renderRoom, cls: 'tall' });
  }

  /* ---------- 인연도감 (24종 · 완성 강조 · 보유 ✓ · 효과 칩 · 출진 중 배지) ---------- */
  function bondFx(b) {
    return [['⚔️', '공격', b.atk], ['❤️', 'HP', b.hp], ['🛡️', '방어', b.def]].filter((x) => x[2]);
  }
  function bondCodexHTML() {
    const own = S.owned || {}, sq = S.squad || [];
    const rows = BONDS.map((b) => {
      const ms = b.members, need = b.need || ms.length;
      const have = ms.filter((m) => own[m]).length;
      const live = ms.filter((m) => sq.indexOf(m) >= 0).length >= need;
      return { b: b, ms: ms, have: have, need: need, done: have >= need, live: live };
    }).sort((x, y) => (y.done - x.done) || (y.have / y.need - x.have / x.need) || String(x.b.name).localeCompare(String(y.b.name), 'ko'));
    const dn = rows.filter((r) => r.done).length;
    return '<div class="xb-sum">완성 <b>' + dn + '</b> / ' + rows.length + '종</div>' + rows.map((r) =>
      '<div class="xb-card' + (r.done ? ' done' : '') + (r.live ? ' live' : '') + '">' +
      '<div class="xb-hd"><b>' + (r.b.icon || '📜') + ' ' + esc(r.b.name) + '</b>' + (r.b.cat ? '<small>' + esc(r.b.cat) + '</small>' : '') +
      '<span class="xb-st">' + (r.done ? '✔ 완성' : Math.min(r.have, r.need) + '/' + r.need) + '</span></div>' +
      (r.b.desc ? '<div class="xb-ds">' + esc(r.b.desc) + '</div>' : '') +
      '<div class="xb-fx">' + bondFx(r.b).map((f) => '<span>' + f[0] + ' ' + f[1] + ' <b>+' + Math.round(f[2] * 100) + '%</b></span>').join('') +
      (r.need < r.ms.length ? '<span class="xb-need">' + r.need + '명 이상</span>' : '') + (r.live ? '<span class="xb-live">출진 중 발동</span>' : '') + '</div>' +
      '<div class="xb-ms">' + r.ms.map((m) => '<span class="xb-m' + (own[m] ? ' own' : '') + '">' + (own[m] ? '✓ ' : '') + esc(m) + '</span>').join('') + '</div></div>').join('');
  }
  function openBonds() {
    const body = el('div', 'ex-list');
    body.appendChild(el('div', 'u-note', '같은 세력 3명 → +10% · 4명 → +18% · 5명 → +28% (재야 제외)<br>인연은 세력과 상관없이 맞춰집니다'));
    body.appendChild(el('div', 'xb-body', bondCodexHTML()));
    modal('📜 인연도감', body, { cls: 'tall' });
  }

  /* ---------- 소환 (장수 공훈 뽑기) ---------- */
  function openSummon() {
    const body = el('div', 'ex-unit');
    const draw = (res, n) => {
      body.innerHTML = '';
      body.appendChild(el('div', 'u-note big', '🔮 장수 소환<br>공훈 ' + COST_HERO[1] + ' · 10회 ' + COST_HERO[10] + ' · 중복은 ★승급(최대 ★5, 별당 +12%)'));
      body.appendChild(el('div', 'sx-rate', 'S ' + HERO_RATE.S + '% · A ' + HERO_RATE.A + '% · B ' + HERO_RATE.B + '% · C ' + HERO_RATE.C + '% <em>· 10회는 B급 이상 1명 보장</em>'));
      body.appendChild(el('div', 'sx-wallet', '🏅 보유 공훈 <b>' + fmt(readMerit()) + '</b>'));
      if (res && res.length) {
        const grid = el('div', 'sx-grid');
        res.forEach((r) => {
          const d = def(r.id), card = el('div', 'sx-card t-' + (r.tier || 'C'));
          card.appendChild(portrait(d, 'sx-pt'));
          card.appendChild(el('b', '', r.name));
          card.appendChild(el('em', '', r.tag === 'NEW' ? 'NEW' : (r.tag === '공훈+40' ? '공훈+40' : (r.star >= 2 ? stars(r.star) : ''))));
          grid.appendChild(card);
        });
        body.appendChild(grid);
      }
      const row = el('div', 'u-btns');
      const b1 = el('button', 'ex-btn', '1회 <small>🏅' + COST_HERO[1] + '</small>');
      const b10 = el('button', 'ex-btn gold', '10회 <small>🏅' + COST_HERO[10] + '</small>');
      b1.onclick = () => doSummon(1); b10.onclick = () => doSummon(10);
      row.appendChild(b1); row.appendChild(b10); body.appendChild(row);
    };
    let m;
    const doSummon = (n) => {
      const cost = COST_HERO[n];
      if (readMerit() < cost) { toast('공훈이 모자라요 (필요 🏅' + fmt(cost) + ')'); sfx('deny'); return; }
      addMerit(-cost);
      const res = pullHero(n);
      save();
      draw(res, n);
      const best = res && res.some((r) => r.tier === 'S' || r.tier === 'A');
      sfx(best ? 'levelup' : 'coin');
      if (stage) { const v = $('.ex-merit', stage); if (v) v.textContent = '🏅 ' + fmt(readMerit()); }
    };
    draw(null, 1);
    m = modal('소환', body, { onClose: renderRoom, cls: 'tall' });
  }

  /* ---------- 보물 (장비 뽑기 + 3칸 장착) ---------- */
  function gearStatText(t) {
    const n = normalizeTreasure(t);
    if (n) return n.fx.map((f) => f.label + ' +' + f.val + '%').join(' · ');
    return (t && t.effect) || '';
  }
  function openTreasure() {
    const body = el('div', 'ex-unit');
    const draw = (res, n) => {
      body.innerHTML = '';
      body.appendChild(el('div', 'u-note big', '💎 보물 창고<br>본편 250종 보물 · 공훈 ' + COST_GEAR[1] + ' · 10회 ' + COST_GEAR[10] + '<br>무기·갑옷·보물 3칸 — 무기 공격력%+치명타% · 갑옷 최대HP%+피해감소% · 보물 공격속도%+초기 게이지%'));
      body.appendChild(el('div', 'sx-rate', '전설 ' + GEAR_RATE['전설'] + '% · 영웅 ' + GEAR_RATE['영웅'] + '% · 희귀 ' + GEAR_RATE['희귀'] + '% · 일반 ' + GEAR_RATE['일반'] + '% <em>· 10회는 희귀 이상 1점 보장</em>'));
      body.appendChild(el('div', 'sx-wallet', '🏅 보유 공훈 <b>' + fmt(readMerit()) + '</b> · 보유 장비 <b>' + S.gear.length + '</b>점'));
      if (res && res.length) {
        const grid = el('div', 'sx-grid');
        res.forEach((it) => {
          const t = it.treasure, n = normalizeTreasure(t), card = el('div', 'sx-card g');
          if (n) card.dataset.grade = n.grade;
          card.appendChild(el('div', 'sx-ic', TYPE_ICON[t.type] || '💎'));
          card.appendChild(el('b', '', t.name));
          card.appendChild(el('em', '', (t.grade || '') + (n ? ' · ' + n.grade : '')));
          if (n) card.appendChild(el('div', 'xt-fx', n.fx.map((f) => '<span>' + f.icon + ' +' + f.val + '%</span>').join('')));
          grid.appendChild(card);
        });
        body.appendChild(grid);
      }
      const row = el('div', 'u-btns');
      const b1 = el('button', 'ex-btn', '뽑기 1회 <small>🏅' + COST_GEAR[1] + '</small>');
      const b10 = el('button', 'ex-btn gold', '뽑기 10회 <small>🏅' + COST_GEAR[10] + '</small>');
      b1.onclick = () => doPull(1); b10.onclick = () => doPull(10);
      row.appendChild(b1); row.appendChild(b10); body.appendChild(row);

      body.appendChild(el('div', 'l-hd', '보유 장비 (' + S.gear.length + '점) — 탭해서 장착'));
      const used = equippedBy();
      if (!S.gear.length) body.appendChild(el('div', 'u-note', '아직 장비가 없어요. 위에서 뽑아 보세요.'));
      S.gear.slice().reverse().forEach((it) => {
        const t = treasureOf(it);
        if (!t) return;
        const owner = used[it.iid], n = normalizeTreasure(t);
        const rowEl = el('div', 'sx-gear',
          '<span class="sx-gic">' + (TYPE_ICON[t.type] || '💎') + '</span>' +
          '<div class="sx-gmid"><b>' + t.name + ' <em class="sx-tg">' + (n ? n.grade : '') + '</em></b><small>' + SLOT_LABEL[slotOf(t)] + ' · ' + (t.grade || '') + '</small>' + fxChips(n) + '</div>' +
          '<span class="sx-gs">' + (owner ? owner : '장착') + '</span>');
        rowEl.onclick = () => pickUnitFor(it.iid);
        body.appendChild(rowEl);
      });
    };
    const doPull = (n) => {
      const cost = COST_GEAR[n];
      if (readMerit() < cost) { toast('공훈이 모자라요 (필요 🏅' + fmt(cost) + ')'); sfx('deny'); return; }
      addMerit(-cost);
      const res = pullGear(n);
      save();
      draw(res, n);
      sfx(res && res.some((it) => it.treasure.grade !== '일반') ? 'levelup' : 'coin');
      if (stage) { const v = $('.ex-merit', stage); if (v) v.textContent = '🏅 ' + fmt(readMerit()); }
    };
    draw(null, 1);
    modal('보물 창고', body, { onClose: renderRoom, cls: 'tall' });
  }
  function pickUnitFor(iid) {
    const item = gearItem(iid), t = treasureOf(item);
    if (!t) return;
    const body = el('div', 'ex-list');
    body.appendChild(el('div', 'l-hd', t.name + ' (' + SLOT_LABEL[slotOf(t)] + ') — 장착할 장수'));
    Object.keys(S.owned).forEach((id) => {
      const d = def(id), r = S.owned[id];
      const cur = treasureOf(gearItem((r.equip || {})[slotOf(t)]));
      const row = el('div', 'l-row', '<div class="l-mid"><b>' + d.name + '</b><small>Lv.' + r.lv + ' · ' + (r.faction || '재야') + (cur ? ' · 지금 ' + cur.name : '') + '</small></div>');
      row.onclick = () => { if (equipItem(id, iid)) { m.kill(); openTreasure(); } };
      // row의 왼쪽에 초상
      row.insertBefore(portrait(d, 'l-pt'), row.firstChild);
      body.appendChild(row);
    });
    const m = modal('장비 장착', body, { cls: 'tall' });
  }
  function openEquipPicker(id, slot) {
    const used = equippedBy();
    const list = S.gear.filter((it) => {
      const t = treasureOf(it);
      if (!t || slotOf(t) !== slot) return false;
      return !used[it.iid] || used[it.iid] === id;
    });
    const body = el('div', 'ex-list');
    const cur = (S.owned[id].equip || {})[slot];
    body.appendChild(el('div', 'l-hd', def(id).name + ' · ' + SLOT_LABEL[slot] + (cur ? ' — 지금 장착 중' : ' — 비어 있음')));
    if (cur) {
      const off = el('button', 'ex-btn', '지금 장비 해제');
      off.onclick = () => { unequip(id, slot); m.kill(); openUnit(id); };
      body.appendChild(off);
    }
    if (!list.length) body.appendChild(el('div', 'u-note', '이 칸에 낄 장비가 없어요. 「보물」에서 뽑아 보세요.'));
    list.forEach((it) => {
      const t = treasureOf(it), n = normalizeTreasure(t);
      const row = el('div', 'sx-gear' + (it.iid === cur ? ' on' : ''),
        '<span class="sx-gic">' + (TYPE_ICON[t.type] || '💎') + '</span>' +
        '<div class="sx-gmid"><b>' + t.name + ' <em class="sx-tg">' + (n ? n.grade : '') + '</em></b><small>' + (t.grade || '') + ' ' + SLOT_LABEL[slotOf(t)] + '</small>' + fxChips(n) + '</div>' +
        '<span class="sx-gs">' + (it.iid === cur ? '장착중' : '장착') + '</span>');
      row.onclick = () => { if (equipItem(id, it.iid)) { m.kill(); openUnit(id); } };
      body.appendChild(row);
    });
    const m = modal(SLOT_LABEL[slot] + ' 고르기', body, { cls: 'tall' });
  }

  /* =====================================================================
     2. 전투 — 대각선 실시간 난투
     ===================================================================== */
  let B = null;
  const ARENA_TIME = 60, UNIT_W = 58;
  const RANGE = { melee: 46, ranged: 170, strategist: 190 };
  const SPEED = { melee: 120, ranged: 80, strategist: 70 };
  const ASPD = { melee: 1.0, ranged: 1.25, strategist: 1.5 };

  function mkUnit(team, d, st, x, y, idx) {
    const u = {
      team: team, idx: idx, id: d.id, name: d.name, cls: d.cls || 'melee', skill: d.skill || (team ? '맹공' : '필살기'),
      hp: Math.max(1, Math.round(st.hp)), max: Math.max(1, Math.round(st.hp)),
      atk: Math.max(1, Math.round(st.atk)), def: Math.max(0, Math.round(st.def)),
      x: x, y: y, cd: rnd(0.1, 0.6), gauge: 0, alive: true, boss: !!d.boss, tgt: null,
      gx: Math.floor((idx || 0) / 3), gy: (idx || 0) % 3,     // 3×3 칸 — 필살기 범위 판정
      stunT: 0, slowPct: 0, slowT: 0, burnDps: 0, burnT: 0, buffAtk: 0, buffT: 0, crit: 0, reduce: 0, aspd: 0
    };
    const e = el('div', 'bt-u t' + team + (u.boss ? ' boss' : ''));
    const im = new Image(); im.src = team ? enemySrc(d.job) : chibiSrc(d); im.draggable = false;
    im.onerror = () => { im.remove(); e.classList.add('noimg'); e.dataset.ch = (d.name || '?')[0]; };
    e.appendChild(im);
    e.appendChild(el('div', 'bt-hp', '<i></i>'));
    u.el = e; u.hpEl = $('.bt-hp i', e); B.field.appendChild(e);
    place(u);
    return u;
  }
  function place(u) {
    u.el.style.transform = 'translate(' + (u.x - UNIT_W / 2) + 'px,' + (u.y - UNIT_W) + 'px)';
    u.el.style.zIndex = Math.round(u.y);
  }

  function buildEnemies(n) {
    const sd = STAGE_DEFS[n - 1], list = [];
    (sd.groups || []).forEach((gr) => { for (let i = 0; i < (gr.c || 1); i++) list.push(gr); });
    const seen = {};
    return list.slice(0, 6).map((gr, i) => {
      seen[gr.name] = (seen[gr.name] || 0) + 1;
      const cnt = list.filter((x) => x === gr).length;
      const nm = gr.boss ? gr.name : (cnt > 1 ? gr.name + ' ' + seen[gr.name] : gr.name);
      const sc = gr.scale || 1;
      const L = (gr.L || 30) * sc, W = (gr.W || 30) * sc, I = (gr.I || 10) * sc;
      const hp = Math.round((L * 10 + W * 6) * (gr.boss ? 1.75 : 0.9));
      const atk = Math.round((W * 1.1 + I * 0.35 + L * 0.3) * (gr.boss ? 1.05 : 0.85));
      const def = Math.round((L * 0.5 + W * 0.15) * (gr.boss ? 0.95 : 0.8));
      return { id: 'e' + i + '_' + nm, name: nm, cls: clsOf(gr.job), job: gr.job, skill: gr.boss ? '황천의 술법' : '맹공', boss: !!gr.boss, hp: hp, atk: atk, def: def };
    });
  }

  function startBattle(n) {
    stopBattle();
    if (!root) open();
    const sd = STAGE_DEFS[clamp(n, 1, MAX_ACT1) - 1];
    const ids = S.squad.slice(0, MAX_SQUAD).filter((id) => S.owned[id]);
    if (!ids.length) { toast('출진할 장수가 없어요'); return; }
    const g = sumSyn(synergies(ids));
    stage.innerHTML = '';
    const bt = el('div', 'bt');
    bt.appendChild(el('div', 'bt-bg'));
    bt.appendChild(el('div', 'bt-hud',
      '<div class="bt-side"><div class="bt-bar a"><i></i></div><small>아군 ' + ids.length + '명</small></div>' +
      '<div class="bt-time">60</div>' +
      '<div class="bt-side r"><div class="bt-bar e"><i></i></div><small>' + n + '관문 · 적군</small></div>'));
    const field = el('div', 'bt-field'); bt.appendChild(field);
    const ctl = el('div', 'bt-ctl', '<button class="spd">1× 배속</button><button class="auto on">⚡ 자동스킬 ON</button><button class="out">도주</button>');
    bt.appendChild(ctl);
    bt.appendChild(el('div', 'bt-cards'));
    stage.appendChild(bt);

    B = { n: n, sd: sd, field: field, root: bt, units: [], proj: [], speed: 1, auto: true, time: ARENA_TIME, end: false, raf: 0, last: performance.now() };

    ids.forEach((id, i) => {
      const k = i - (ids.length - 1) / 2;
      const u = mkUnit(0, Object.assign({}, def(id), { id: id }), stat(id, g), 118 + k * 40, 600 + k * 40, i);
      applyEquipToUnit(u, equipBonus(id));      // 치명타·피해감소·공격속도·초기 게이지
      B.units.push(u);
    });
    const en = buildEnemies(n);
    en.forEach((e, i) => {
      const k = i - (en.length - 1) / 2;
      B.units.push(mkUnit(1, e, { hp: e.hp, atk: e.atk, def: e.def }, 272 + k * 36, 250 + k * 36, i));
    });

    const cards = $('.bt-cards', bt);
    B.units.filter((u) => u.team === 0).forEach((u) => {
      const c = el('div', 'bt-card'), d = def(u.id);
      c.appendChild(portrait(d, 'c-pt'));
      c.appendChild(el('div', 'c-hp', '<i></i>'));
      c.appendChild(el('div', 'c-sk', '<i></i>'));
      c.onclick = () => { if (B && !B.end && u.alive && u.gauge >= 100) cast(u); };
      cards.appendChild(c);
      u.card = c; u.cHp = $('.c-hp i', c); u.cSk = $('.c-sk i', c);
    });

    const spd = $('.spd', ctl), auto = $('.auto', ctl);
    spd.onclick = () => { if (!B) return; B.speed = B.speed % 3 + 1; spd.textContent = B.speed + '× 배속'; spd.classList.toggle('hot', B.speed > 1); };
    auto.onclick = () => { if (!B) return; B.auto = !B.auto; auto.textContent = '⚡ 자동스킬 ' + (B.auto ? 'ON' : 'OFF'); auto.classList.toggle('on', B.auto); };
    $('.out', ctl).onclick = () => finish(false, true);

    banner('⚔️ ' + n + '관문 돌입!');
    B.last = performance.now();
    B.raf = requestAnimationFrame(frame);
  }
  function stopBattle() {
    if (B) { try { cancelAnimationFrame(B.raf); } catch (e) { /* ignore */ } B.end = true; B = null; }
  }
  function frame(t) {
    if (!B || B.end) return;
    const dt = Math.min(0.05, (t - B.last) / 1000) * B.speed;
    B.last = t;
    tick(dt);
    if (B && !B.end) B.raf = requestAnimationFrame(frame);
  }
  const aliveOf = (team) => B.units.filter((u) => u.alive && u.team === team);
  function nearest(u) {
    let best = null, bd = 1e9;
    B.units.forEach((o) => {
      if (!o.alive || o.team === u.team) return;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }
  function separate() {
    const L = B.units.filter((u) => u.alive);
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = 40;
        if (d < min) {
          const p = (min - d) / 2;
          a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p;
        }
      }
    }
    L.forEach((u) => { u.x = clamp(u.x, 30, 360); u.y = clamp(u.y, 150, 660); });
  }
  function tick(dt) {
    B.time -= dt;
    B.units.forEach((u) => {
      if (!u.alive) return;
      /* 버프·감속·화상 시계 — 기절 중에도 화상은 탄다 */
      if (u.buffT > 0) { u.buffT -= dt; if (u.buffT <= 0) { u.buffT = 0; u.buffAtk = 0; } }
      if (u.slowT > 0) { u.slowT -= dt; if (u.slowT <= 0) { u.slowT = 0; u.slowPct = 0; } }
      if (u.burnT > 0) {
        u.burnT -= dt;
        u.hp -= Math.max(1, Math.round((u.burnDps || 0) * dt));
        u.burnAcc = (u.burnAcc || 0) + dt;
        if (u.burnAcc >= 0.5) { u.burnAcc = 0; u.el.classList.add('burn'); setTimeout(() => { if (u.el) u.el.classList.remove('burn'); }, 180); fxAt(u.x, u.y - 26, 'fire'); }
        if (u.hp <= 0) { die(u); return; }
        if (u.burnT <= 0) { u.burnT = 0; u.burnDps = 0; }
      }
      if (u.stunT > 0) { u.stunT -= dt; if (u.stunT > 0) return; u.stunT = 0; u.el.classList.remove('stun'); }
      u.cd -= dt;
      if (!u.tgt || !u.tgt.alive) u.tgt = nearest(u);
      const t = u.tgt;
      if (!t) return;
      const dx = t.x - u.x, dy = t.y - u.y, dist = Math.hypot(dx, dy) || 1, rg = RANGE[u.cls] || 46;
      if (dist > rg) {
        const sp = (SPEED[u.cls] || 100) * (u.cls === 'melee' && dist > 120 ? 1.5 : 1) * (1 - (u.slowPct || 0)) * dt;
        u.x += dx / dist * sp; u.y += dy / dist * sp;
      } else if (u.cd <= 0) {
        u.cd = (ASPD[u.cls] || 1) / (1 + (u.aspd || 0)) * (1 + (u.slowPct || 0));
        if (u.cls === 'melee') {
          u.el.classList.add('lunge');
          setTimeout(() => { if (u.el) u.el.classList.remove('lunge'); }, 180);
          hit(u, t, 1, 'slash');
        } else {
          shoot(u, t, 1, u.cls === 'strategist' ? 'orb' : 'arrow', 0);
        }
        u.gauge = Math.min(100, u.gauge + 12);
      }
      if (u.gauge >= 100 && (u.team === 1 || B.auto)) cast(u);
    });
    separate();
    projectiles(dt);
    B.units.forEach((u) => { if (u.alive) place(u); });
    hud();
    if (!aliveOf(1).length) finish(true);
    else if (!aliveOf(0).length || B.time <= 0) finish(false);
  }
  /* 장비·버프를 반영한 피해 계산 — 치명타 1.5배, 피해감소, 공격력 버프 */
  const calc = (s, t, m) => {
    const crit = !!(s.crit && Math.random() < s.crit);
    const raw = (s.atk * (1 + (s.buffAtk || 0))) * m * rnd(0.9, 1.1) * 100 / (100 + t.def) * (crit ? 1.5 : 1) * (1 - (t.reduce || 0));
    return { dmg: Math.max(1, Math.round(raw)), crit: crit };
  };
  function hit(s, t, m, fx) {
    if (!t.alive) return 0;
    const r = calc(s, t, m), dmg = r.dmg;
    t.hp -= dmg;
    s.gauge = Math.min(100, s.gauge + 4);
    t.gauge = Math.min(100, t.gauge + 7);
    fxAt(t.x, t.y - 28, fx || 'slash');
    pop(t.x, t.y - 50, (r.crit ? '✦' : '') + dmg, (s.team === 0 ? '' : ' foe') + (r.crit ? ' crit' : ''));
    t.el.classList.add('hurt');
    setTimeout(() => { if (t.el) t.el.classList.remove('hurt'); }, 120);
    if (t.hp <= 0) die(t);
    return dmg;
  }
  function die(u) {
    u.alive = false; u.hp = 0;
    u.el.classList.add('dead');
    if (u.card) u.card.classList.add('dead');
    setTimeout(() => { if (u.el) u.el.style.display = 'none'; }, 600);
  }
  function shoot(s, t, m, kind, delay) {
    B.proj.push({ s: s, t: t, m: m, kind: kind, x: s.x, y: s.y - 30, delay: delay || 0, el: null });
  }
  function projectiles(dt) {
    B.proj = B.proj.filter((p) => {
      if (p.delay > 0) { p.delay -= dt; return true; }
      if (!p.el) { p.el = el('div', 'bt-proj ' + p.kind); B.field.appendChild(p.el); }
      if (!p.t.alive) { const n = nearest(p.s); if (n) p.t = n; else { p.el.remove(); return false; } }
      const dx = p.t.x - p.x, dy = p.t.y - 30 - p.y, d = Math.hypot(dx, dy) || 1, sp = 420 * dt;
      if (d <= sp + 8) { p.el.remove(); hit(p.s, p.t, p.m, p.kind === 'orb' ? 'flash' : 'slash'); return false; }
      p.x += dx / d * sp; p.y += dy / d * sp;
      p.el.style.transform = 'translate(' + (p.x - 8) + 'px,' + (p.y - 8) + 'px) rotate(' + Math.atan2(dy, dx) + 'rad)';
      p.el.style.zIndex = 9999;
      return true;
    });
  }
  /* 필살기 효과 → 엔진 (기절·감속·화상·치유·버프·돌진) */
  const SKILL_H = {
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    dmg: (src, t, mult) => hit(src, t, mult, 'big'),
    dash: (a, b) => { a.x += (b.x - a.x) * 0.55; a.y += (b.y - a.y) * 0.55; if (a.alive) place(a); },
    stun: (t, sec) => {
      if (!t.alive) return;
      t.stunT = Math.max(t.stunT || 0, sec);
      t.el.classList.add('stun');
      fxAt(t.x, t.y - 34, 'stun');
    },
    slow: (t, pct, sec) => {
      if (!t.alive) return;
      t.slowPct = Math.max(t.slowPct || 0, clamp(pct, 0, 90) / 100);
      t.slowT = Math.max(t.slowT || 0, sec);
      fxAt(t.x, t.y - 20, 'slow');
    },
    burn: (t, dps, sec) => {
      if (!t.alive) return;
      t.burnDps = Math.max(t.burnDps || 0, dps);
      t.burnT = Math.max(t.burnT || 0, sec);
      fxAt(t.x, t.y - 30, 'fire');
    },
    heal: (t, amount) => {
      if (!t.alive || amount <= 0) return;
      t.hp = Math.min(t.max, t.hp + amount);
      pop(t.x, t.y - 52, '+' + amount, ' heal');
    },
    buff: (t, key, ratio, sec) => {
      if (!t.alive || key !== 'atk') return;
      t.buffAtk = Math.max(t.buffAtk || 0, ratio);
      t.buffT = Math.max(t.buffT || 0, sec);
      t.el.classList.add('buffed');
      setTimeout(() => { if (t.el && !(t.buffT > 0)) t.el.classList.remove('buffed'); }, sec * 1000);
    }
  };
  function cast(u) {
    if (!u.alive || !B || B.end) return;
    u.gauge = 0;
    const foes = aliveOf(u.team ? 0 : 1);
    if (!foes.length) return;
    if (!u.team) {
      /* 아군 — 장수별 필살기를 3×3 범위·효과 그대로 실행 */
      const s = u.skillDef || (u.skillDef = skillOf(u));
      showCutin(u, s);
      u.el.classList.add('cast');
      setTimeout(() => { if (u.el) u.el.classList.remove('cast'); }, 450);
      runSkill(s, u, { foes: foes, allies: aliveOf(0), H: SKILL_H });
      if (u.card) u.card.classList.remove('ready');
      return;
    }
    banner(u.name + ' · ' + u.skill, u.team);
    u.el.classList.add('cast');
    setTimeout(() => { if (u.el) u.el.classList.remove('cast'); }, 450);
    if (u.cls === 'melee') {
      const c = (u.tgt && u.tgt.alive) ? u.tgt : foes[0];
      u.x += (c.x - u.x) * 0.55; u.y += (c.y - u.y) * 0.55;
      fxAt(c.x, c.y - 20, 'big');
      foes.forEach((f) => { if (Math.hypot(f.x - c.x, f.y - c.y) < 120) hit(u, f, 2.0, 'slash'); });
    } else if (u.cls === 'ranged') {
      for (let i = 0; i < 4; i++) shoot(u, foes[Math.floor(Math.random() * foes.length)], 1.25, 'arrow', i * 0.12);
    } else {
      foes.forEach((f) => { fxAt(f.x, f.y - 30, 'bolt'); hit(u, f, 0.85, 'flash'); });
    }
    if (u.card) u.card.classList.remove('ready');
  }
  /* 필살기 컷인 — 초상화에도 등급 테두리가 붙는다 */
  function showCutin(u, s) {
    if (!B || B.end) return;
    const d = def(u.id), t = SKILL_TYPES[s.type] || SKILL_TYPES.charge;
    const c = el('div', 'ex-cutin');
    c.appendChild(portrait(d, 'cutin-pt'));
    c.appendChild(el('div', 'cu-tx', '<b>' + esc(d.name) + '</b><em>' + t.icon + ' ' + esc(s.name) + '</em><small>' + esc(describeSkill(s)) + '</small>'));
    B.root.appendChild(c);
    setTimeout(() => { try { c.remove(); } catch (e) { /* ignore */ } }, 1000);
  }
  function fxAt(x, y, kind) {
    if (!B) return;
    const f = el('div', 'bt-fx ' + kind);
    f.style.left = x + 'px'; f.style.top = y + 'px'; B.field.appendChild(f);
    setTimeout(() => { try { f.remove(); } catch (e) { /* ignore */ } }, 460);
  }
  function pop(x, y, txt, cls) {
    if (!B) return;
    const p = el('div', 'bt-pop' + (cls || ''), String(txt));
    p.style.left = (x + rnd(-8, 8)) + 'px'; p.style.top = y + 'px'; B.field.appendChild(p);
    setTimeout(() => { try { p.remove(); } catch (e) { /* ignore */ } }, 800);
  }
  function banner(txt, team) {
    if (!B) return;
    const b = el('div', 'bt-banner' + (team ? ' foe' : ''), txt);
    B.root.appendChild(b);
    setTimeout(() => { try { b.remove(); } catch (e) { /* ignore */ } }, 1150);
  }
  function hud() {
    const A = B.units.filter((u) => u.team === 0), E = B.units.filter((u) => u.team === 1);
    const ratio = (L) => {
      const m = L.reduce((s, u) => s + u.max, 0), h = L.reduce((s, u) => s + Math.max(0, u.hp), 0);
      return m ? h / m * 100 : 0;
    };
    const ba = $('.bt-bar.a i', B.root), be = $('.bt-bar.e i', B.root);
    if (ba) ba.style.width = ratio(A) + '%';
    if (be) be.style.width = ratio(E) + '%';
    const tm = $('.bt-time', B.root);
    if (tm) tm.textContent = Math.max(0, Math.ceil(B.time));
    B.units.forEach((u) => {
      if (u.hpEl) u.hpEl.style.width = clamp(u.hp / u.max * 100, 0, 100) + '%';
      if (u.card) {
        u.cHp.style.width = clamp(u.hp / u.max * 100, 0, 100) + '%';
        u.cSk.style.width = u.gauge + '%';
        u.card.classList.toggle('ready', u.alive && u.gauge >= 100);
      }
    });
  }

  /* ── 결과 / 경험치 ───────────────────────────────────────── */
  function finish(win, flee) {
    if (!B || B.end) return;
    B.end = true;
    try { cancelAnimationFrame(B.raf); } catch (e) { /* ignore */ }
    const n = B.n, rw = rewardOf(n), first = win && S.cleared.indexOf(n) < 0;
    const baseExp = 40 + n * 30, exp = win ? baseExp : Math.round(baseExp * 0.25);
    const res = [];
    S.squad.slice(0, MAX_SQUAD).forEach((id) => {
      if (!S.owned[id]) return;
      const r = S.owned[id], before = r.lv, up = addExp(id, exp);
      res.push({ id: id, before: before, after: r.lv, up: up });
    });
    let merit = 0, heroTxt = '';
    if (win) {
      merit = first ? rw.merit : repeatRewardOf(n);
      addMerit(merit);
      if (first) {
        S.cleared.push(n); S.cleared.sort((a, b) => a - b);
        if (rw.hero && def(rw.hero).id) {
          const hr = S.owned[rw.hero];
          if (hr) { if (hr.star < STAR_MAX) { hr.star++; heroTxt = rw.hero + ' 중복! ★' + hr.star; } else { addMerit(40); heroTxt = rw.hero + ' 중복 — 공훈 +40'; } }
          else { S.owned[rw.hero] = { star: 1, lv: 1, exp: 0 }; heroTxt = '🎁 ' + rw.hero + ' 영입!'; }
        }
      }
    }
    save();
    sfx(win ? 'victory' : 'defeat');
    const body = el('div', 'ex-result');
    body.innerHTML = '<div class="r-t ' + (win ? 'win' : 'lose') + '">' + (win ? (first ? '첫 클리어!' : '승리!') : (flee ? '퇴각' : '패배')) + '</div>' +
      '<div class="r-l">경험치 +' + fmt(exp) + ' (출진 장수 전원)' + (win ? ' · 🏅 +' + fmt(merit) : ' · 잃은 것은 없어요') + '</div>' +
      (heroTxt ? '<div class="r-h">' + heroTxt + '</div>' : '');
    res.forEach((r) => {
      const nm = (def(r.id) || {}).name || r.id;
      body.appendChild(el('div', 'r-row', '<span>' + nm + '</span><b>Lv.' + r.before + (r.up ? ' → Lv.' + r.after + ' ⬆' : '') + '</b>'));
    });
    const row = el('div', 'u-btns');
    const again = el('button', 'ex-btn', win && n < MAX_ACT1 && n === maxCleared() ? '다음 관문' : '다시 도전');
    const home = el('button', 'ex-btn gold', '대기실');
    again.onclick = () => { const next = (win && n < MAX_ACT1 && n === maxCleared()) ? n + 1 : n; stopBattle(); startBattle(next); };
    home.onclick = () => { m.kill(); stopBattle(); renderRoom(); };
    row.appendChild(again); row.appendChild(home); body.appendChild(row);
    const m = modal(win ? '전투 결과' : '전투 종료', body, { cls: 'res' });
    const x = $('.ex-mx', m); if (x) x.style.display = 'none';
    B = null;
  }

  /* =====================================================================
     비밀 입장 · 공개 API
     ===================================================================== */
  function bindEntry() {
    let dev = false;
    try { dev = new URLSearchParams(location.search).get('exp') === '1'; } catch (e) { dev = false; }
    const btn = document.getElementById('btn-expedition');
    if (btn) {
      if (dev) btn.hidden = false;
      btn.onclick = (e) => { if (e) e.preventDefault(); open(); };
    }
    const logo = document.querySelector('#screen-title .title-logo') || document.querySelector('.title-logo');
    if (logo) {
      let taps = [];
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', () => {
        const now = Date.now();
        taps = taps.filter((t) => now - t <= 1500);
        taps.push(now);
        if (taps.length < 5) return;
        taps = [];
        if (btn) btn.hidden = false;
        if (root) { renderRoom(); return; }
        open();
      });
    }
    if (dev) open();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
  else bindEntry();

  window.ExpBack = function () {
    try { if (SK.show) SK.show('screen-title'); } catch (e) { /* ignore */ }
  };
  window.Expedition = {
    open: open,
    close: close,
    isOpen: isOpen,
    back: back,
    state: () => (S ? JSON.parse(JSON.stringify({ owned: S.owned, squad: S.squad, cleared: S.cleared, gear: S.gear.length, merit: readMerit() })) : null),
    merit: readMerit,
    addMerit: addMerit,
    addExp: (id, n) => { const u = addExp(id, n); save(); return u; }
  };

  /* 옛 점검 스크립트 호환 (SK.expedition) */
  SK.expedition = {
    open: open,
    close: close,
    reveal: () => { const b = document.getElementById('btn-expedition'); if (b) b.hidden = false; },
    get state() {
      if (!S) return null;
      return {
        roster: Object.keys(S.owned), formation: S.squad.slice(), progress: clamp(maxCleared() + 1, 1, MAX_ACT1),
        stars: (function () { const o = {}; Object.keys(S.owned).forEach((id) => { o[id] = S.owned[id].star; }); return o; })(),
        gear: S.gear.length, equip: (function () { const o = {}; Object.keys(S.owned).forEach((id) => { if (S.owned[id].equip) o[id] = S.owned[id].equip; }); return o; })(),
        cleared: S.cleared.slice(), merit: readMerit(), owned: S.owned
      };
    },
    merit: () => readMerit(),
    addMerit: addMerit,
    power: () => power(S.squad),
    reload: () => { S = loadStore(); renderRoom(); },
    syncMerit: syncMerit,
    pull: (n) => { if (!S) S = loadStore(); const r = pullHero(n === 10 ? 10 : 1); save(); renderRoom(); return r; },
    pullGear: (n) => { if (!S) S = loadStore(); const r = pullGear(n === 10 ? 10 : 1); save(); renderRoom(); return r.map((it) => ({ name: it.treasure.name, grade: it.treasure.grade, slot: slotOf(it.treasure) })); },
    equip: (id, iid) => equipItem(id, iid),
    gearList: () => S.gear.map((it) => { const t = treasureOf(it); return t ? { iid: it.iid, name: t.name, grade: t.grade, slot: slotOf(t) } : null; }).filter(Boolean),
    setParty: (names) => { S.squad = (names || []).filter((n) => S.owned[n]).slice(0, MAX_SQUAD); save(); renderRoom(); return S.squad.slice(); },
    setStar: (name, n) => { if (S.owned[name]) { S.owned[name].star = clamp(Number(n) || 1, 1, STAR_MAX); save(); renderRoom(); } },
    battleStart: (n) => startBattle(n || targetStage()),
    battleSpeed: (s) => { if (B) { B.speed = clamp(Number(s) || 1, 1, 3); const b = $('.spd', B.root); if (b) b.textContent = B.speed + '× 배속'; } },
    battleState: () => (B ? {
      stage: B.n, over: B.end, time: Math.round(B.time * 10) / 10, speed: B.speed,
      ally: B.units.filter((u) => u.team === 0).map((u) => ({ name: u.name, hp: Math.round(u.hp), max: u.max, alive: u.alive, gauge: Math.round(u.gauge) })),
      enemy: B.units.filter((u) => u.team === 1).map((u) => ({ name: u.name, hp: Math.round(u.hp), max: u.max, alive: u.alive }))
    } : null),
    battleFlee: () => finish(false, true),
    lvUp: (id, n) => { const d = buyLv(id, n); renderRoom(); return d; },
    maxCleared: maxCleared,
    /* v5.74 — 점검용: 등급·필살기·장비·인연 */
    gradeOf: (id) => tierOf(def(id)),
    bondCount: () => BONDS.length,
    bonds: () => BONDS.map((b) => ({ name: b.name, cat: b.cat, members: b.members.slice(), need: b.need })),
    activeBonds: () => synergies(S.squad).filter((s) => s.bond).map((s) => s.label),
    skill: (id) => { const s = skillOf(id); return { name: s.name, type: s.type, area: s.area || 'one', desc: describeSkill(s) }; },
    equipFx: (id) => equipBonus(id),
    rewards: () => { const o = []; for (let n = 1; n <= MAX_ACT1; n++) o.push({ n: n, first: rewardOf(n).merit, repeat: repeatRewardOf(n) }); return o; }
  };

  /* 같은 이름의 공개 API (통합 전 패치 파일과 호환) */
  SK.EXPEDITION = {
    GRADE_COLOR: GRADE_COLOR, gradeOf: (o) => tierOf(o), BONDS: BONDS, SKILL_TYPES: SKILL_TYPES,
    HERO_SKILLS: HERO_SKILLS, skillOf: skillOf, describeSkill: describeSkill, skillHTML: skillHTML,
    skillTargets: skillTargets, runSkill: runSkill, EQUIP_SLOTS: EQUIP_SLOTS, slotOf: slotOf,
    normalizeTreasure: normalizeTreasure, equipBonus: equipBonus, treasureCardHTML: treasureCardHTML,
    rewardOf: (n) => rewardOf(n).merit, repeatRewardOf: repeatRewardOf, openBondCodex: openBonds
  };
})();
