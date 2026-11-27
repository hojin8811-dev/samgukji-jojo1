/* =====================================================================
   삼국지-꼬마영웅 난타전 — 원정 시나리오 《꼬마영웅 원정대》 통합판
   v7.2 · 제5~7막 서주·형주·오나라(41~70관문) · 막 탭 가로 스크롤
   v7.1 · 제4막 하북 제패전(31~40관문) · 관문마다 입장/승리 한 줄 시나리오
   v7.0 · 정식 오픈 — 표지 공식 진입 버튼 · 주간 보스전(주차 로테이션·기믹·주간 기록)
   v6.3 · 전투씬 애니메이션·타격감 개편 (모션 타임라인 · 반달 칼바람 · 넉백/화면 흔들림)
   v6.2 · 1~3막(30관문) · 랭킹전 실전투 · 장비 분해·강화 · 보스 토벌전
   v5.74 (?v=92) · 대기실 · 레벨(Lv.1~99) · 대각선 실시간 난투 전투

   · v6.3 — 전투 유닛을 .bt-u(좌표)·.bt-sp(좌우 반전)·.bt-mo(모션) 세 겹으로 나눠
     HP 배지는 뒤집지 않고 몸만 대상 방향을 본다. 대기 호흡·걸음 바운스/앞기울기/발밑 먼지,
     병과별 예비동작→타격→복귀 타임라인(근접 돌진 베기·궁수 반동·책사 부상 시전),
     회전 반달 칼바람·화살/마법탄 궤적·돌진 잔상, 피격 넉백·히트/크리티컬 플래시·전장 흔들림,
     쓰러지는 사망 연출, 일시정지 버튼과 종료 시 이펙트/타이머 정리. 밸런스·세이브는 그대로.

   · v5.74 — 초상화 등급 테두리 4색(S빨강·A보라·B파랑·C초록) · 필살기 3×3 실시간 전투
     (기절·화상·감속·치유·버프) · 장비 재정립(무기 공격력%+치명타%, 갑옷 최대HP%+피해감소%,
     보물 공격속도%+초기 게이지%) · 공훈 보상 하향 · 인연 24종 도감.

   · 입장은 세 갈래 — ① 표지의 [⚔️ 꼬마영웅 원정대] 버튼(v7.0 정식 오픈)
     ② 주소의 ?exp=1 ③ 표지 제목 5연타. 어느 쪽이든 같은 대기실로 들어간다.
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
  const MAX_LV = 99, MAX_ACT = 70, MAX_ACT1 = 10, MAX_SQUAD = 5, STAR_MAX = 5;
  const ENH_MAX = 5;                     // 장비 강화 상한 (+5)
  const STONE_NAME = '🔨 정련석';         // 강화 재료

  const COST_HERO = { 1: 100, 10: 900 };
  const COST_GEAR = { 1: 80, 10: 720 };
  const HERO_RATE = { S: 3, A: 15, B: 37, C: 45 };
  const GEAR_RATE = { '전설': 6, '영웅': 18, '희귀': 36, '일반': 40 };

  const FACTIONS = ['촉', '위', '오', '군웅', '한국'];
  const FCOLOR = { '촉': '#2f8f4b', '위': '#2f6fb8', '오': '#b8432f', '군웅': '#8a7448', '한국': '#7a5aa8' };
  const CLS_LABEL = { melee: '근접', ranged: '원거리', strategist: '책사' };

  /* ── 막 구성 — 막마다 관문 10개 (v7.2에서 제5~7막 추가, 41~70) ────────
     · 1막 1~10 · 2막 11~20 · 3막 21~30 · 4막 31~40 · 5막 41~50 · 6막 51~60 · 7막 61~70
     이전 막의 마지막 관문을 깨면 다음 막이 열린다 (actUnlocked).
     · 막이 5개를 넘으면 머리줄·스테이지 창의 막 탭이 가로 스크롤이 된다(actTabsHTML).
     · 앞으로 8~10막(남만·중원·한국)을 붙이면 MAX_ACT와 ACTS만 늘리면 된다. */
  const ACTS = [
    { n: 1, short: '1막', name: '제1막 · 황건적의 난', sub: '황건의 난', from: 1, to: 10, icon: '🟡',
      desc: '창천이 죽고 황천이 서리라 — 태평도 황건의 물결' },
    { n: 2, short: '2막', name: '제2막 · 반동탁 연합', sub: '동탁 토벌', from: 11, to: 20, icon: '🔥',
      desc: '열여덟 제후가 낙양으로 — 서량군과의 결전' },
    { n: 3, short: '3막', name: '제3막 · 관도·적벽 대전', sub: '천하삼분', from: 21, to: 30, icon: '🌊',
      desc: '하북의 패권과 장강의 불길 — 천하가 셋으로 갈린다' },
    { n: 4, short: '4막', name: '제4막 · 하북 제패전', sub: '하북·북방 평정', from: 31, to: 40, icon: '🐎',
      desc: '계교에서 요동까지, 원씨의 하북을 끊고 북방을 평정한다' },
    { n: 5, short: '5막', name: '제5막 · 서주 혈전', sub: '서주 각축', from: 41, to: 50, icon: '🏯',
      desc: '조조의 서주 공방, 여포와 유비의 각축 — 백문루에서 천하무쌍이 끝난다' },
    { n: 6, short: '6막', name: '제6막 · 형주 대혈전', sub: '장판파와 형남', from: 51, to: 60, icon: '⛵',
      desc: '신야의 불길에서 장판파를 지나, 형남 사군을 차례로 평정한다' },
    { n: 7, short: '7막', name: '제7막 · 오나라와 대격돌', sub: '형주 분쟁·이릉', from: 61, to: 70, icon: '🔥',
      desc: '형주를 둘러싼 오의 압박, 그리고 이릉의 칠백 리 불길과 맞선다' }
  ];
  const ACT_NAME = ACTS[0].name;
  function actOf(n) { const k = clamp(Math.round(Number(n) || 1), 1, MAX_ACT); return ACTS[Math.floor((k - 1) / 10)] || ACTS[0]; }
  function actUnlocked(a) { return !a || a.from <= 1 || maxCleared() >= a.from - 1; }
  let actSel = 0;                       // 대기실·스테이지 창에서 보고 있는 막

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

  /* ── 관문 70개 — 막마다 10개 (v7.2에서 41~70 제5~7막 추가) ──────────────
     story: { enter: 입장 한 줄, win: 승리 한 줄 } — 전투 시작 때 띠로, 결과 창에서 글로 보인다.
     편성은 본편 장수 공식과 같은 식(L·W·I)으로 적는다. 실제 HP·공격·방어는
     unitsFrom() 이 계산하며 boss:true 는 HP 1.75배·크기 확대다.
     보스 이름은 본편 명부(SK.GENERALS)에 있는 장수를 우선 쓴다. 명부에 없는 인물(국의·엄강·고람·답돈·유연·
     후성·여광·여상·유도·형도영·조범·금선)은 def() 폴백을 타서 병과 SD(enemySrc)로 표시되고 이름만 쓰인다. */
  const STAGE_DEFS = [
    /* ══ 제1막 · 황건적의 난 (1~10) ══ */
    { n: 1, name: '황건 정찰대', sub: '길목을 지키는 황건 패잔병', groups: [{ name: '황건 정찰병', job: '산적', L: 26, W: 28, I: 6, c: 3 }] },
    { n: 2, name: '황건 도적떼', sub: '마을을 턴 황건 도적들', groups: [{ name: '황건 도적', job: '산적', L: 32, W: 36, I: 8, c: 4 }] },
    { n: 3, name: '황건 무리', sub: '술사를 앞세운 황건의 무리', groups: [{ name: '황건 도적', job: '산적', L: 36, W: 42, I: 10, c: 3 }, { name: '황건 술사', job: '도사', L: 30, W: 18, I: 44, c: 1 }] },
    { n: 4, name: '황건 정예', sub: '붉은 수건을 두른 정예 부대', groups: [{ name: '황건 정예', job: '창병', L: 44, W: 50, I: 14, c: 4 }] },
    { n: 5, name: '장량의 진', sub: '중간보스 · 장량', boss: '장량', groups: [{ name: '장량', boss: true, job: '도사', L: 74, W: 66, I: 76, c: 1, scale: 1.55 }, { name: '황건 정예', job: '창병', L: 46, W: 52, I: 14, c: 3 }] },
    { n: 6, name: '태평도 신도', sub: '태평도의 신도들이 밀려옵니다', groups: [{ name: '태평도 신도', job: '무도가', L: 54, W: 58, I: 20, c: 4 }, { name: '황건 술사', job: '도사', L: 44, W: 24, I: 58, c: 1 }] },
    { n: 7, name: '태평도 주력', sub: '태평도의 주력 군세', groups: [{ name: '태평도 주력', job: '창병', L: 60, W: 64, I: 24, c: 4 }, { name: '황건 술사', job: '도사', L: 48, W: 26, I: 62, c: 1 }] },
    { n: 8, name: '장보의 진', sub: '보스 · 장보', boss: '장보', groups: [{ name: '장보', boss: true, job: '도사', L: 75, W: 64, I: 78, c: 1, scale: 1.62 }, { name: '황건 정예', job: '창병', L: 60, W: 64, I: 22, c: 4 }] },
    { n: 9, name: '남양 최후 저지선', sub: '남양으로 가는 마지막 길목', groups: [{ name: '남양 결사대', job: '검병', L: 72, W: 76, I: 30, c: 4 }, { name: '황건 술사', job: '도사', L: 60, W: 30, I: 72, c: 1 }] },
    { n: 10, name: '장각의 진', sub: '최종보스 · 장각', boss: '장각', groups: [{ name: '장각', boss: true, job: '도사', L: 86, W: 36, I: 88, c: 1, scale: 1.9 }, { name: '황건 정예', job: '창병', L: 70, W: 74, I: 30, c: 5 }] },

    /* ══ 제2막 · 반동탁 연합 (11~20) ══ */
    { n: 11, name: '사수관의 서량군', sub: '관문을 막아선 이각·곽사의 군세', groups: [
      { name: '이각', job: '기병', L: 94, W: 100, I: 58, c: 1, scale: 1.35 },
      { name: '곽사', job: '창병', L: 92, W: 96, I: 56, c: 1, scale: 1.3 },
      { name: '서량 철기', job: '기병', L: 84, W: 90, I: 28, c: 2 }] },
    { n: 12, name: '견수관의 화살비', sub: '서영이 이끄는 서량 궁병대', groups: [
      { name: '서영', job: '궁수', L: 88, W: 74, I: 96, c: 1, scale: 1.35 },
      { name: '서량 궁병', job: '궁수', L: 86, W: 86, I: 34, c: 3 },
      { name: '서량 철기', job: '기병', L: 86, W: 92, I: 28, c: 2 }] },
    { n: 13, name: '호뢰관 돌파', sub: '관문을 지키는 동탁의 정예', groups: [
      { name: '서량 정예', job: '창병', L: 92, W: 98, I: 30, c: 3 },
      { name: '서량 궁기', job: '궁기', L: 90, W: 92, I: 34, c: 2 },
      { name: '동탁 군사', job: '도사', L: 84, W: 48, I: 94, c: 1 }] },
    { n: 14, name: '낙양 성문', sub: '불타는 낙양으로 들어서는 길', groups: [
      { name: '낙양 수비대', job: '검병', L: 96, W: 100, I: 34, c: 3 },
      { name: '서량 철기', job: '기병', L: 94, W: 100, I: 30, c: 2 },
      { name: '동탁 군사', job: '도사', L: 88, W: 50, I: 98, c: 1 }] },
    { n: 15, name: '화웅의 진', sub: '중간보스 · 화웅', boss: '화웅', groups: [
      { name: '화웅', boss: true, job: '기병', L: 100, W: 116, I: 50, c: 1, scale: 1.6 },
      { name: '서량 철기', job: '기병', L: 92, W: 98, I: 30, c: 3 },
      { name: '서량 궁병', job: '궁수', L: 88, W: 86, I: 34, c: 2 }] },
    { n: 16, name: '낙양 대화재', sub: '궁궐에 옮겨붙은 불길', groups: [
      { name: '방화 부대', job: '산적', L: 98, W: 104, I: 38, c: 3 },
      { name: '서량 정예', job: '창병', L: 98, W: 102, I: 32, c: 2 },
      { name: '동탁 군사', job: '도사', L: 92, W: 52, I: 102, c: 1 }] },
    { n: 17, name: '호관의 결전', sub: '연합군을 막아선 최후의 관문', groups: [
      { name: '호관 수비대', job: '창병', L: 102, W: 106, I: 34, c: 3 },
      { name: '서량 철기', job: '기병', L: 100, W: 106, I: 32, c: 2 },
      { name: '서량 궁기', job: '궁기', L: 96, W: 98, I: 36, c: 1 }] },
    { n: 18, name: '여포의 진', sub: '보스 · 여포 — 천하무쌍', boss: '여포', groups: [
      { name: '여포', boss: true, job: '기병', L: 108, W: 132, I: 38, c: 1, scale: 1.7 },
      { name: '고순', job: '등갑병', L: 100, W: 106, I: 50, c: 1, scale: 1.2 },
      { name: '서량 철기', job: '기병', L: 98, W: 104, I: 30, c: 2 },
      { name: '서량 궁병', job: '궁수', L: 94, W: 90, I: 34, c: 2 }] },
    { n: 19, name: '장안성 공방', sub: '동탁이 버티는 최후의 성', groups: [
      { name: '장안 수비대', job: '검병', L: 106, W: 110, I: 38, c: 3 },
      { name: '서량 친위대', job: '창병', L: 106, W: 112, I: 34, c: 2 },
      { name: '이유', job: '도사', L: 98, W: 58, I: 110, c: 1, scale: 1.25 }] },
    { n: 20, name: '동탁의 진', sub: '최종보스 · 동탁 — 서량의 폭군', boss: '동탁', groups: [
      { name: '동탁', boss: true, job: '군주', L: 112, W: 124, I: 96, c: 1, scale: 1.75 },
      { name: '이유', job: '도사', L: 100, W: 58, I: 112, c: 1, scale: 1.2 },
      { name: '서량 친위대', job: '창병', L: 106, W: 112, I: 38, c: 3 },
      { name: '서량 철기', job: '기병', L: 104, W: 110, I: 34, c: 1 }] },

    /* ══ 제3막 · 관도·적벽 대전 (21~30) ══ */
    { n: 21, name: '하북의 기병', sub: '원소군의 선봉이 밀려옵니다', groups: [
      { name: '하북 철기', job: '기병', L: 114, W: 120, I: 42, c: 3 },
      { name: '하북 궁병', job: '연노병', L: 110, W: 106, I: 46, c: 2 },
      { name: '원소 군사', job: '책사', L: 106, W: 60, I: 122, c: 1 }] },
    { n: 22, name: '여양성 공방', sub: '관도로 가는 길목의 성', groups: [
      { name: '여양 수비대', job: '창병', L: 118, W: 122, I: 44, c: 3 },
      { name: '하북 철기', job: '기병', L: 116, W: 122, I: 40, c: 2 },
      { name: '하북 신궁', job: '궁기', L: 112, W: 114, I: 48, c: 1 }] },
    { n: 23, name: '안량·문추의 진', sub: '보스 · 하북의 두 맹장', boss: '안량', groups: [
      { name: '안량', boss: true, job: '기병', L: 118, W: 136, I: 44, c: 1, scale: 1.6 },
      { name: '문추', boss: true, job: '궁기', L: 116, W: 134, I: 42, c: 1, scale: 1.55 },
      { name: '하북 철기', job: '기병', L: 112, W: 116, I: 38, c: 2 },
      { name: '하북 정예', job: '창병', L: 110, W: 114, I: 40, c: 2 }] },
    { n: 24, name: '백마성 수비', sub: '원소가 쏟아 붓는 총공세', groups: [
      { name: '백마 수비대', job: '검병', L: 120, W: 124, I: 46, c: 3 },
      { name: '하북 철기', job: '기병', L: 118, W: 124, I: 40, c: 2 },
      { name: '전풍', job: '책사', L: 112, W: 62, I: 128, c: 1, scale: 1.25 }] },
    { n: 25, name: '원소의 진', sub: '중간보스 · 원소 — 하북의 패자', boss: '원소', groups: [
      { name: '원소', boss: true, job: '군주', L: 122, W: 116, I: 118, c: 1, scale: 1.7 },
      { name: '저수', job: '풍수사', L: 112, W: 66, I: 128, c: 1, scale: 1.2 },
      { name: '하북 정예', job: '창병', L: 116, W: 120, I: 42, c: 3 },
      { name: '하북 철기', job: '기병', L: 114, W: 120, I: 40, c: 1 }] },
    { n: 26, name: '창정의 추격', sub: '패주하는 하북군의 저항', groups: [
      { name: '하북 결사대', job: '검병', L: 124, W: 130, I: 48, c: 3 },
      { name: '하북 궁기', job: '궁기', L: 120, W: 122, I: 50, c: 2 },
      { name: '하북 군사', job: '도사', L: 116, W: 62, I: 134, c: 1 }] },
    { n: 27, name: '장강의 안개', sub: '적벽으로 향하는 조조의 수군', groups: [
      { name: '형주 수군', job: '수적', L: 126, W: 128, I: 52, c: 3 },
      { name: '조조 수군', job: '수적', L: 126, W: 132, I: 48, c: 2 },
      { name: '채모', job: '수적', L: 118, W: 116, I: 100, c: 1, scale: 1.25 }] },
    { n: 28, name: '주유·감녕의 진', sub: '보스 · 강동의 도독과 백기장군', boss: '주유', groups: [
      { name: '주유', boss: true, job: '책사', L: 126, W: 96, I: 140, c: 1, scale: 1.6 },
      { name: '감녕', boss: true, job: '수적', L: 124, W: 138, I: 96, c: 1, scale: 1.55 },
      { name: '강동 수군', job: '수적', L: 120, W: 124, I: 46, c: 2 },
      { name: '강동 정예', job: '창병', L: 118, W: 124, I: 44, c: 2 }] },
    { n: 29, name: '적벽 화공', sub: '연쇄한 배에 옮겨붙는 불길', groups: [
      { name: '조조 수군', job: '수적', L: 130, W: 134, I: 52, c: 3 },
      { name: '조조 궁병', job: '연노병', L: 128, W: 130, I: 54, c: 2 },
      { name: '조조 군사', job: '도사', L: 124, W: 66, I: 140, c: 1 }] },
    { n: 30, name: '적벽 대전', sub: '최종보스 · 조조와 제갈량', boss: '조조', groups: [
      { name: '조조', boss: true, job: '군주', L: 134, W: 130, I: 136, c: 1, scale: 1.75 },
      { name: '제갈량', boss: true, job: '책사', L: 130, W: 88, I: 152, c: 1, scale: 1.7 },
      { name: '호위 친위대', job: '검병', L: 126, W: 132, I: 48, c: 2 },
      { name: '조조 수군', job: '수적', L: 124, W: 128, I: 46, c: 2 }] },

    /* ══ 제4막 · 하북 제패전 (31~40) — 계교(191) → 역경루(199) → 백마·연진(200) → 여양(200)
       → 남피(205) → 업성(204) → 백랑산·요동(207). 원씨 가문과 북방을 끝내는 사슬이다. ══ */
    { n: 31, name: '계교 전초전', sub: '국의의 강노진이 계교의 길을 막는다', story: {
      enter: '계교의 안개가 걷히고, 국의가 이끄는 원소의 선봉이 강노를 일제히 겨눈다.',
      win: '강노진이 무너지자 하북으로 들어가는 첫 길이 열렸다.' }, groups: [
      { name: '국의', job: '연노병', L: 138, W: 136, I: 52, c: 1, scale: 1.35 },
      { name: '원소군 강노병', job: '연노병', L: 134, W: 130, I: 48, c: 2 },
      { name: '원소군 선봉', job: '기병', L: 136, W: 138, I: 42, c: 2 }] },
    { n: 32, name: '역경루 공방', sub: '공손찬·엄강의 백마의종이 성루를 지킨다', story: {
      enter: '높이 솟은 역경루 아래, 백마의종이 창을 세워 성문을 굳게 닫았다.',
      win: '백마의 깃발이 성루에서 떨어졌다 — 하북의 서쪽이 평정됐다.' }, groups: [
      { name: '공손찬', job: '군주', L: 140, W: 140, I: 74, c: 1, scale: 1.35 },
      { name: '엄강', job: '기병', L: 138, W: 142, I: 46, c: 1, scale: 1.3 },
      { name: '백마의종', job: '기병', L: 134, W: 138, I: 40, c: 3 },
      { name: '역경 수비대', job: '창병', L: 132, W: 132, I: 44, c: 1 }] },
    { n: 33, name: '백마진 돌파', sub: '안량의 포위망을 뚫고 백마성 유연을 구한다', story: {
      enter: '안량의 군세가 백마성을 에워쌌다. 성 안의 유연은 이제 버틸 힘이 없다.',
      win: '포위망을 찢자 백마성의 성문이 열렸다 — 관도로 가는 길이 드러났다.' }, groups: [
      { name: '안량', job: '기병', L: 142, W: 150, I: 46, c: 1, scale: 1.45 },
      { name: '원소군 창병', job: '창병', L: 138, W: 140, I: 44, c: 3 },
      { name: '원소군 궁병', job: '궁수', L: 134, W: 132, I: 48, c: 2 }] },
    { n: 34, name: '연진 야습', sub: '문추와 유비의 지원군이 야습을 노린다', story: {
      enter: '연진의 갈대밭이 흔들린다 — 문추와 유비가 밤을 타고 야습을 걸어온다.',
      win: '야습은 불꽃 한 줌으로 끝났다. 원소의 본대가 흔들리기 시작한다.' }, groups: [
      { name: '문추', job: '궁기', L: 144, W: 152, I: 46, c: 1, scale: 1.45 },
      { name: '유비', job: '군주', L: 142, W: 140, I: 102, c: 1, scale: 1.3 },
      { name: '원소군 기병', job: '기병', L: 138, W: 142, I: 40, c: 3 },
      { name: '원소군 궁기', job: '궁기', L: 136, W: 136, I: 46, c: 1 }] },
    { n: 35, name: '여양 공방전', sub: '중간보스 · 원담과 곽도의 여양성', boss: '원담', story: {
      enter: '여양성의 성문이 활짝 열린다. 원담과 곽도가 하북의 기병을 모두 내보낸다.',
      win: '여양이 함락되자 원소군의 허리가 꺾였다.' }, groups: [
      { name: '원담', boss: true, job: '군주', L: 146, W: 144, I: 98, c: 1, scale: 1.55 },
      { name: '곽도', boss: true, job: '풍수사', L: 142, W: 72, I: 140, c: 1, scale: 1.45 },
      { name: '여양 수비대', job: '창병', L: 140, W: 142, I: 46, c: 2 },
      { name: '하북 철기', job: '기병', L: 140, W: 144, I: 40, c: 2 }] },
    { n: 36, name: '기주 남피성', sub: '신평과 봉기의 계책이 남피성을 지킨다', story: {
      enter: '남피성에서 신평과 봉기가 원씨의 마지막 계책을 펼친다.',
      win: '남피성에 원씨의 깃발이 하나둘 내려갔다 — 기주가 우리 것이 됐다.' }, groups: [
      { name: '신평', job: '책사', L: 148, W: 84, I: 144, c: 1, scale: 1.4 },
      { name: '봉기', job: '검병', L: 148, W: 148, I: 54, c: 1, scale: 1.4 },
      { name: '남피 수비대', job: '검병', L: 144, W: 146, I: 48, c: 2 },
      { name: '원담의 잔당', job: '창병', L: 142, W: 144, I: 44, c: 2 }] },
    { n: 37, name: '업성 수성전', sub: '저수·전풍의 계책과 고람의 수비대', story: {
      enter: '업성의 성벽 위로 저수와 전풍의 계책이 걸리고, 고람의 수비대가 성문을 메운다.',
      win: '성벽을 넘자 고람이 성문을 열었다 — 업성의 심장이 드러났다.' }, groups: [
      { name: '저수', job: '풍수사', L: 150, W: 84, I: 146, c: 1, scale: 1.4 },
      { name: '전풍', job: '책사', L: 150, W: 86, I: 148, c: 1, scale: 1.4 },
      { name: '고람', job: '검병', L: 150, W: 150, I: 56, c: 1, scale: 1.35 },
      { name: '업성 수비대', job: '창병', L: 146, W: 148, I: 48, c: 3 }] },
    { n: 38, name: '업성 본진 함락', sub: '보스 · 심배와 원상 — 업성의 심장', boss: '심배', story: {
      enter: '심배가 본진의 문을 걸어 잠그고, 원상이 마지막 군세를 세운다.',
      win: '심배는 끝까지 무릎을 굽히지 않았다. 업성은 그렇게 함락됐다.' }, groups: [
      { name: '심배', boss: true, job: '연노병', L: 154, W: 150, I: 64, c: 1, scale: 1.65 },
      { name: '원상', boss: true, job: '군주', L: 152, W: 154, I: 66, c: 1, scale: 1.6 },
      { name: '업성 친위대', job: '검병', L: 148, W: 150, I: 50, c: 2 },
      { name: '하북 결사대', job: '창병', L: 148, W: 150, I: 48, c: 2 }] },
    { n: 39, name: '백랑산 오환 토벌', sub: '답돈의 오환 철기가 백랑산을 내려온다', boss: '답돈', story: {
      enter: '백랑산의 능선이 검게 물든다 — 답돈의 오환 철기가 일제히 내려온다.',
      win: '오환의 철기가 백랑산 아래에 멈췄다 — 북방의 발길이 끊겼다.' }, groups: [
      { name: '답돈', boss: true, job: '기병', L: 156, W: 162, I: 48, c: 1, scale: 1.6 },
      { name: '오환 철기', job: '기병', L: 152, W: 156, I: 42, c: 3 },
      { name: '오환 궁기', job: '궁기', L: 150, W: 152, I: 46, c: 2 }] },
    { n: 40, name: '요동·하북 완전 평정', sub: '최종보스 · 원희·원상과 공손강의 연합군', boss: '공손강', story: {
      enter: '요동의 성문 앞, 원희와 원상이 공손강과 손을 잡고 마지막 방벽을 세운다.',
      win: '원씨의 마지막 불씨가 꺼졌다 — 하북과 요동, 북방 전역이 평정됐다.' }, groups: [
      { name: '공손강', boss: true, job: '군주', L: 160, W: 158, I: 102, c: 1, scale: 1.7 },
      { name: '원상', boss: true, job: '군주', L: 158, W: 160, I: 70, c: 1, scale: 1.6 },
      { name: '원희', job: '기병', L: 156, W: 158, I: 50, c: 1, scale: 1.4 },
      { name: '요동 수비대', job: '창병', L: 152, W: 154, I: 48, c: 2 },
      { name: '원씨 친위대', job: '검병', L: 154, W: 156, I: 50, c: 1 }] },

    /* ══ 제5막 · 서주 혈전 (41~50) — 조조의 서주 정벌(194) → 원술·여포의 각축(196~197)
       → 하비성 공방과 백문루 최후(198~199). 서주에서 여포의 이름이 끝나는 사슬이다. ══ */
    { n: 41, name: '도겸의 서주', sub: '조조의 복수군이 서주로 밀려온다', story: {
      enter: '조숭의 원한을 앞세운 조조가 서주로 진군한다. 도겸의 군세가 성벽 위에서 창을 세웠다.',
      win: '서주의 성문이 열렸다 — 도겸은 유성으로 물러났다.' }, groups: [
      { name: '도겸', job: '군주', L: 162, W: 160, I: 92, c: 1, scale: 1.35 },
      { name: '서주 단양병', job: '창병', L: 158, W: 160, I: 46, c: 3 },
      { name: '서주 수비대', job: '검병', L: 156, W: 158, I: 44, c: 2 }] },
    { n: 42, name: '조표의 하비', sub: '하비성을 지키는 조표의 단양병', story: {
      enter: '성을 비운 사이 조표가 하비의 문을 열고 여포의 군세를 들였다.',
      win: '하비성의 깃발이 바뀌었다 — 서주의 허리가 여포에게 넘어갔다.' }, groups: [
      { name: '조표', job: '검병', L: 164, W: 162, I: 50, c: 1, scale: 1.3 },
      { name: '하비 단양병', job: '창병', L: 160, W: 160, I: 44, c: 3 },
      { name: '여포군 선봉', job: '기병', L: 160, W: 166, I: 42, c: 2 }] },
    { n: 43, name: '원술군의 침공', sub: '기령의 대군이 소패성을 에워싼다', story: {
      enter: '원술이 기령에게 대군을 맡겨 보냈다. 소패성의 군량은 이미 바닥을 보이고 있다.',
      win: '기령의 군세가 물러났다 — 유비가 화친을 청하고, 여포가 그 틈을 노렸다.' }, groups: [
      { name: '기령', job: '기병', L: 166, W: 170, I: 56, c: 1, scale: 1.35 },
      { name: '원술군 창병', job: '창병', L: 162, W: 164, I: 44, c: 3 },
      { name: '원술군 궁병', job: '궁수', L: 158, W: 156, I: 48, c: 2 }] },
    { n: 44, name: '소패성 공방', sub: '여포의 선봉 장료가 성문을 노린다', story: {
      enter: '여포가 뇌물을 받고 소패성으로 왔다. 성문 밖에서 장료의 선봉이 창을 겨눈다.',
      win: '남은 군세를 추슬러 소패를 빠져나왔다 — 유비는 서주 외곽으로 물러났다.' }, groups: [
      { name: '장료', job: '기병', L: 168, W: 172, I: 78, c: 1, scale: 1.35 },
      { name: '여포군 철기', job: '기병', L: 166, W: 170, I: 46, c: 2 },
      { name: '여포군 궁병', job: '궁수', L: 162, W: 160, I: 48, c: 2 }] },
    { n: 45, name: '하비 공방전', sub: '성을 둘러싼 여포군의 총공세', story: {
      enter: '하비성 아래로 여포군이 밀려들었다. 성벽을 두드리는 소리가 밤새 멎지 않았다.',
      win: '성을 지켜 냈다 — 이제 하비로 들어갈 길은 물길 하나뿐이다.' }, groups: [
      { name: '여포군 정예', job: '검병', L: 170, W: 172, I: 50, c: 3 },
      { name: '여포군 궁기', job: '궁기', L: 168, W: 170, I: 52, c: 2 },
      { name: '하비 공성대', job: '창병', L: 168, W: 170, I: 46, c: 1 }] },
    { n: 46, name: '장패·송헌·후성', sub: '여포의 세 장수가 성문을 나선다', story: {
      enter: '장패가 창을 들고, 송헌과 후성이 좌우에서 성문을 막아선다.',
      win: '세 장수가 흩어졌다 — 하비성의 문은 안에서부터 삐걱였다.' }, groups: [
      { name: '장패', job: '창병', L: 172, W: 174, I: 52, c: 1, scale: 1.3 },
      { name: '송헌', job: '검병', L: 170, W: 172, I: 50, c: 1, scale: 1.3 },
      { name: '후성', job: '기병', L: 168, W: 172, I: 48, c: 1, scale: 1.25 },
      { name: '여포군 수비대', job: '창병', L: 168, W: 170, I: 46, c: 2 }] },
    { n: 47, name: '고순의 함진영', sub: '중간보스 · 고순 — 무너지지 않는 창벽', boss: '고순', story: {
      enter: '함진영이 방패를 세우고 한 걸음도 물러서지 않는다. 고순의 창끝이 하비의 마지막 기둥이다.',
      win: '함진영의 창벽이 갈라졌다 — 고순이 끌려가자 성문이 열렸다.' }, groups: [
      { name: '고순', boss: true, job: '등갑병', L: 176, W: 178, I: 62, c: 1, scale: 1.6 },
      { name: '함진영', job: '등갑병', L: 174, W: 176, I: 50, c: 3 },
      { name: '여포군 궁병', job: '연노병', L: 170, W: 168, I: 54, c: 2 }] },
    { n: 48, name: '진궁의 계책', sub: '보스 · 진궁 — 성을 나가지 않는 계책', boss: '진궁', story: {
      enter: '진궁이 성을 나가 군량길을 끊자고 청했지만, 여포는 아내의 말을 들었다.',
      win: '계책은 성문이 닫히는 순간 무너졌다 — 진궁의 지혜도 여포의 망설임을 이기지 못했다.' }, groups: [
      { name: '진궁', boss: true, job: '책사', L: 178, W: 96, I: 170, c: 1, scale: 1.55 },
      { name: '여포군 친위대', job: '검병', L: 174, W: 176, I: 52, c: 2 },
      { name: '여포군 수비대', job: '창병', L: 172, W: 174, I: 50, c: 2 }] },
    { n: 49, name: '하비성 수공', sub: '물길을 끊고 성벽 아래로', story: {
      enter: '조조가 물길을 막아 성을 잠갔다. 성벽 아래로 흘러든 물이 수비대의 발을 묶는다.',
      win: '물이 빠지자 성벽이 드러났다 — 하비성의 마지막 밤이 저물었다.' }, groups: [
      { name: '위속', job: '검병', L: 178, W: 180, I: 58, c: 1, scale: 1.35 },
      { name: '하비 수비대', job: '창병', L: 174, W: 176, I: 50, c: 3 },
      { name: '하비 수군', job: '수적', L: 172, W: 174, I: 52, c: 2 }] },
    { n: 50, name: '백문루 최후', sub: '최종보스 · 여포와 초선 — 천하무쌍의 마지막', boss: '여포', story: {
      enter: '백문루 위에서 여포가 방천화극을 세웠다. 초선이 그 뒤에서 조용히 고개를 숙인다.',
      win: '여포는 백문루에서 무릎을 굽혔다 — 천하무쌍의 이름이 서주에서 끝났다.' }, groups: [
      { name: '여포', boss: true, job: '기병', L: 186, W: 198, I: 56, c: 1, scale: 1.85 },
      { name: '초선', job: '무희', L: 172, W: 150, I: 96, c: 1, scale: 1.4 },
      { name: '여포 친위대', job: '검병', L: 180, W: 182, I: 54, c: 2 },
      { name: '하비 결사대', job: '창병', L: 178, W: 180, I: 52, c: 1 }] },

    /* ══ 제6막 · 형주 대혈전 (51~60) — 신야 전초전(202) → 박망파 화공(202) → 장판파(208)
       → 형남 사군 평정(209). 유비가 몸 붙일 땅을 얻어 가는 사슬이다. ══ */
    { n: 51, name: '신야 전초전', sub: '여광·여상의 선봉이 신야에 닿았다', story: {
      enter: '여광과 여상이 조조의 명으로 신야에 이렀다. 성벽 아래에서 창끝이 햇빛을 받았다.',
      win: '선봉이 무너지자 두 장수는 황급히 돌아갔다 — 하후돈의 본대가 움직이기 시작했다.' }, groups: [
      { name: '여광', job: '기병', L: 188, W: 192, I: 56, c: 1, scale: 1.3 },
      { name: '여상', job: '궁수', L: 186, W: 184, I: 58, c: 1, scale: 1.25 },
      { name: '조조군 선봉', job: '기병', L: 184, W: 188, I: 50, c: 2 },
      { name: '조조군 창병', job: '창병', L: 182, W: 186, I: 48, c: 1 }] },
    { n: 52, name: '박망파 화공', sub: '하후돈과 우금이 불길에 갇힌다', story: {
      enter: '하후돈이 추격해 박망파의 좁은 길로 들어섰다. 마른 갈대가 바람에 흔들린다.',
      win: '산등성이가 불길에 잠겼다 — 하후돈은 갑옷을 벗어 던지고 겨우 빠져나왔다.' }, groups: [
      { name: '하후돈', job: '기병', L: 190, W: 200, I: 64, c: 1, scale: 1.45 },
      { name: '우금', job: '창병', L: 188, W: 190, I: 62, c: 1, scale: 1.4 },
      { name: '조조군 기병', job: '기병', L: 186, W: 190, I: 52, c: 2 },
      { name: '조조군 궁병', job: '궁수', L: 184, W: 182, I: 54, c: 1 }] },
    { n: 53, name: '신야 철수', sub: '조홍의 추격대가 성을 태운다', story: {
      enter: '조조의 대군이 남쪽으로 내려온다. 조홍이 불붙은 신야성을 등지고 따라붙었다.',
      win: '성은 불탔지만 사람은 남았다 — 남은 백성을 이끌고 장강으로 향했다.' }, groups: [
      { name: '조홍', job: '기병', L: 192, W: 196, I: 58, c: 1, scale: 1.35 },
      { name: '조조군 추격대', job: '기병', L: 190, W: 194, I: 52, c: 3 },
      { name: '조조군 궁기', job: '궁기', L: 188, W: 190, I: 56, c: 1 }] },
    { n: 54, name: '당양 장판파', sub: '문빙과 장합이 피난민의 행렬을 덮친다', story: {
      enter: '당양의 들판에 피난민이 길게 늘어섰다. 문빙의 철기가 사방에서 창을 세웠다.',
      win: '퇴로가 열렸다 — 조운의 창이 백성의 행렬을 끝까지 지켰다.' }, groups: [
      { name: '문빙', job: '기병', L: 194, W: 200, I: 60, c: 1, scale: 1.4 },
      { name: '장합', job: '기병', L: 196, W: 198, I: 76, c: 1, scale: 1.4 },
      { name: '조조군 호표기', job: '기병', L: 192, W: 196, I: 54, c: 2 },
      { name: '조조군 궁병', job: '연노병', L: 190, W: 188, I: 56, c: 1 }] },
    { n: 55, name: '장판교의 포효', sub: '중간보스 · 조조 추격대 — 다리를 지키는 한 사람', boss: '조순', story: {
      enter: '장판교 앞에서 조조의 추격대가 멈춰 섰다. 다리 위의 한 사내가 창을 세운다.',
      win: '다리가 끊어지고 추격대가 강물에 멈췄다 — 백성의 행렬이 형주 남쪽으로 사라졌다.' }, groups: [
      { name: '조순', boss: true, job: '기병', L: 198, W: 206, I: 64, c: 1, scale: 1.6 },
      { name: '호표기 추격대', job: '기병', L: 194, W: 198, I: 54, c: 3 },
      { name: '조조군 궁기', job: '궁기', L: 192, W: 194, I: 58, c: 1 }] },
    { n: 56, name: '강릉성 공방', sub: '조인이 형주의 관문을 닫았다', story: {
      enter: '강릉의 성문은 조인의 군세가 굳게 닫았다. 형주로 가는 물길이 이 성 뒤에 있다.',
      win: '강릉이 열렸다 — 형남 사군으로 가는 길이 한꺼번에 트였다.' }, groups: [
      { name: '조인', job: '창병', L: 200, W: 204, I: 64, c: 1, scale: 1.4 },
      { name: '강릉 수비대', job: '검병', L: 196, W: 198, I: 54, c: 3 },
      { name: '형주 수군', job: '수적', L: 194, W: 196, I: 56, c: 2 }] },
    { n: 57, name: '영릉의 유도', sub: '유도와 형도영이 영릉 들판을 막는다', story: {
      enter: '영릉 태수 유도가 형도영에게 큰 도끼를 쥐여 주었다. 들판에 먼지가 일었다.',
      win: '형도영의 도끼가 땅에 박혔다 — 유도는 성문을 열고 항복했다.' }, groups: [
      { name: '형도영', job: '무도가', L: 200, W: 208, I: 50, c: 1, scale: 1.45 },
      { name: '유도', job: '책사', L: 198, W: 100, I: 160, c: 1, scale: 1.3 },
      { name: '영릉군', job: '창병', L: 196, W: 198, I: 52, c: 3 }] },
    { n: 58, name: '계양의 조범', sub: '조범의 계략이 계양성 안에서 익는다', story: {
      enter: '계양 태수 조범이 성문을 닫고 성벽 위에 활을 세웠다. 성 안에서 무언가 꾸미는 기척이 난다.',
      win: '조범은 술잔을 내려놓고 항복했다 — 계양이 우리 이름 아래에 들었다.' }, groups: [
      { name: '조범', job: '책사', L: 202, W: 106, I: 168, c: 1, scale: 1.35 },
      { name: '계양 수비대', job: '궁수', L: 198, W: 198, I: 56, c: 3 },
      { name: '계양 결사대', job: '검병', L: 198, W: 200, I: 54, c: 2 }] },
    { n: 59, name: '무릉의 금선', sub: '금선이 무릉의 좁은 길을 막는다', story: {
      enter: '무릉 태수 금선이 산길에 군사를 세웠다. 좁은 길목마다 창이 솟는다.',
      win: '산길이 열리자 무릉의 백성이 스스로 성문을 밀었다 — 금선은 달아났다.' }, groups: [
      { name: '금선', job: '검병', L: 204, W: 208, I: 58, c: 1, scale: 1.4 },
      { name: '무릉 산병', job: '산적', L: 200, W: 204, I: 50, c: 3 },
      { name: '무릉 궁병', job: '궁수', L: 198, W: 196, I: 54, c: 2 }] },
    { n: 60, name: '장사의 황충', sub: '보스 · 한현·황충·위연 — 장사의 마지막 성문', boss: '한현', story: {
      enter: '장사성 아래에서 황충이 활시위를 당기고, 위연이 성문 앞을 서성인다.',
      win: '한현이 성문을 버렸다 — 황충의 활과 위연의 칼이 우리 편이 되었다.' }, groups: [
      { name: '한현', boss: true, job: '검병', L: 206, W: 206, I: 60, c: 1, scale: 1.6 },
      { name: '황충', boss: true, job: '궁기', L: 208, W: 212, I: 66, c: 1, scale: 1.6 },
      { name: '위연', job: '검병', L: 206, W: 210, I: 58, c: 1, scale: 1.55 },
      { name: '장사 수비대', job: '검병', L: 202, W: 204, I: 54, c: 2 }] },

    /* ══ 제7막 · 오나라와 대격돌 (61~70) — 공안·강릉 방어(215) → 백제성·자귀(222)
       → 효정과 이릉의 불길(222). 강동의 군세와 정면으로 부딪치는 마지막 사슬이다. ══ */
    { n: 61, name: '공안 방어전', sub: '여몽과 반장이 공안으로 밀려온다', story: {
      enter: '여몽이 배를 버리고 육로로 공안에 들이닥쳤다. 강가의 봉화가 잇달아 올랐다.',
      win: '공안의 성문이 버텼다 — 강동의 군세가 강 건너로 물러났다.' }, groups: [
      { name: '여몽', job: '기병', L: 212, W: 214, I: 90, c: 1, scale: 1.4 },
      { name: '반장', job: '검병', L: 210, W: 212, I: 62, c: 1, scale: 1.35 },
      { name: '오군 수군', job: '수적', L: 208, W: 210, I: 56, c: 3 }] },
    { n: 62, name: '강릉 방어전', sub: '강릉성에 오군의 깃발이 걸린다', story: {
      enter: '여몽이 강릉성에 들어가 오의 깃발을 걸었다. 성문 밖에서 반장의 군세가 길을 막는다.',
      win: '깃발을 다시 세웠다 — 형주의 동쪽 절반이 오군에게서 떨어졌다.' }, groups: [
      { name: '여몽', job: '기병', L: 214, W: 216, I: 92, c: 1, scale: 1.4 },
      { name: '반장', job: '검병', L: 212, W: 214, I: 64, c: 1, scale: 1.35 },
      { name: '강릉 오군', job: '창병', L: 208, W: 210, I: 56, c: 3 },
      { name: '오군 궁병', job: '연노병', L: 206, W: 204, I: 58, c: 1 }] },
    { n: 63, name: '백제성 출진', sub: '손환과 주연이 백제성으로 따라온다', story: {
      enter: '이릉의 연기가 백제성까지 닿았다. 손환과 주연이 강을 따라 성을 두드린다.',
      win: '성문 앞에 오군의 창이 부러져 쌓였다 — 백제성은 버텼다.' }, groups: [
      { name: '손환', job: '기병', L: 216, W: 220, I: 64, c: 1, scale: 1.4 },
      { name: '주연', job: '창병', L: 218, W: 218, I: 66, c: 1, scale: 1.4 },
      { name: '오군 정예', job: '검병', L: 212, W: 214, I: 58, c: 3 }] },
    { n: 64, name: '자귀 돌파', sub: '한당과 서성이 자귀의 길목을 막는다', story: {
      enter: '자귀의 산길에 한당의 창병이 줄을 섰고, 서성은 높은 곳에 깃발을 꽂았다.',
      win: '산길을 지났다 — 이릉으로 가는 마지막 길목이 열렸다.' }, groups: [
      { name: '한당', job: '창병', L: 218, W: 222, I: 62, c: 1, scale: 1.4 },
      { name: '서성', job: '궁수', L: 216, W: 214, I: 64, c: 1, scale: 1.4 },
      { name: '오군 궁병', job: '연노병', L: 212, W: 210, I: 60, c: 2 },
      { name: '오군 장창병', job: '창병', L: 212, W: 216, I: 58, c: 1 }] },
    { n: 65, name: '효정 결전', sub: '중간보스 · 감녕과 능통 — 효정의 강가', boss: '감녕', story: {
      enter: '효정의 강가에 감녕의 수군이 닻을 내리고, 능통의 창병이 언덕을 올라온다.',
      win: '감녕의 배가 강을 떠났다 — 효정의 강물이 붉게 물들었다.' }, groups: [
      { name: '감녕', boss: true, job: '수적', L: 222, W: 232, I: 80, c: 1, scale: 1.65 },
      { name: '능통', boss: true, job: '창병', L: 222, W: 226, I: 66, c: 1, scale: 1.6 },
      { name: '오군 수군', job: '수적', L: 216, W: 220, I: 58, c: 2 },
      { name: '오군 정예', job: '검병', L: 216, W: 218, I: 58, c: 1 }] },
    { n: 66, name: '장강 수비대', sub: '정봉과 주태의 수군이 강을 메운다', story: {
      enter: '장강 위에 정봉의 배가 줄지어 섰다. 주태가 갑옷을 입고 뱃머리에 섰다.',
      win: '수군의 대열이 끊겼다 — 강 위의 길이 다시 열렸다.' }, groups: [
      { name: '정봉', job: '수적', L: 224, W: 228, I: 64, c: 1, scale: 1.45 },
      { name: '주태', job: '창병', L: 226, W: 230, I: 66, c: 1, scale: 1.45 },
      { name: '장강 수군', job: '수적', L: 218, W: 222, I: 58, c: 3 }] },
    { n: 67, name: '이릉의 화계', sub: '육손의 군막에 화공의 계획이 세워진다', story: {
      enter: '육손이 마른 갈대밭을 가리키며 군막의 장수들에게 무언가를 지시한다.',
      win: '화공의 준비를 먼저 끊었다 — 육손의 손에서 횃불 하나가 떨어졌다.' }, groups: [
      { name: '주환', job: '창병', L: 226, W: 230, I: 68, c: 1, scale: 1.45 },
      { name: '오군 화공대', job: '산적', L: 222, W: 226, I: 60, c: 3 },
      { name: '오군 궁기', job: '궁기', L: 220, W: 222, I: 62, c: 1 }] },
    { n: 68, name: '칠백 리 불길', sub: '강을 따라 불이 번진다', story: {
      enter: '강을 따라 불이 번졌다. 칠백 리의 갈대가 한꺼번에 타오르고 연기가 하늘을 덮었다.',
      win: '불길을 뚫고 나왔다 — 이릉의 들판에는 재만 남았다.' }, groups: [
      { name: '여범', job: '수적', L: 228, W: 232, I: 66, c: 1, scale: 1.5 },
      { name: '오군 화공대', job: '산적', L: 224, W: 228, I: 60, c: 3 },
      { name: '오군 궁병', job: '연노병', L: 222, W: 220, I: 64, c: 2 }] },
    { n: 69, name: '손권의 친위대', sub: '보스 · 손권 — 강동의 주인', boss: '손권', story: {
      enter: '손권이 직접 군기를 들었다. 강동의 친위대가 강가를 가득 메운다.',
      win: '손권의 군기가 땅에 떨어졌다 — 오나라의 심장이 흔들렸다.' }, groups: [
      { name: '손권', boss: true, job: '군주', L: 234, W: 232, I: 150, c: 1, scale: 1.7 },
      { name: '손권 친위대', job: '검병', L: 228, W: 230, I: 64, c: 3 },
      { name: '강동 철기', job: '기병', L: 226, W: 230, I: 60, c: 2 }] },
    { n: 70, name: '이릉의 불길', sub: '최종보스 · 육손 — 불로 끝나는 대전', boss: '육손', story: {
      enter: '육손이 횃불을 들었다. 이릉의 들판이 그 손끝에서 다시 붉게 물든다.',
      win: '불길이 꺼지고 육손이 물러났다 — 이릉의 들판에 오래도록 우리 깃발이 섰다.' }, groups: [
      { name: '육손', boss: true, job: '책사', L: 240, W: 150, I: 200, c: 1, scale: 1.8 },
      { name: '오군 정예', job: '검병', L: 232, W: 236, I: 66, c: 2 },
      { name: '오군 수군', job: '수적', L: 230, W: 234, I: 64, c: 2 },
      { name: '이릉 방화대', job: '산적', L: 228, W: 232, I: 62, c: 1 }] }
  ];
  /* 보스 토벌전(도전 모드) — 이미 클리어한 막의 대표 보스를 강화해 다시 상대한다 */
  const BOSS_RUSH = [
    { id: '장각', stage: 10, name: '태평도 교주 · 장각', sub: '황건의 잔당이 다시 모였다', merit: 180, stone: 5, groups: [
      { name: '장각', boss: true, job: '도사', L: 120, W: 76, I: 120, c: 1, scale: 1.6 },
      { name: '황건 정예', job: '창병', L: 96, W: 100, I: 32, c: 3 }] },
    { id: '화웅', stage: 15, name: '서량의 선봉 · 화웅', sub: '관문을 부순 창끝', merit: 240, stone: 6, groups: [
      { name: '화웅', boss: true, job: '기병', L: 130, W: 150, I: 52, c: 1, scale: 1.6 },
      { name: '서량 철기', job: '기병', L: 112, W: 118, I: 30, c: 2 },
      { name: '서량 궁병', job: '궁수', L: 108, W: 100, I: 36, c: 2 }] },
    { id: '여포', stage: 18, name: '천하무쌍 · 여포', sub: '방천화극이 다시 하늘을 가른다', merit: 320, stone: 8, groups: [
      { name: '여포', boss: true, job: '기병', L: 140, W: 172, I: 40, c: 1, scale: 1.75 },
      { name: '고순', job: '등갑병', L: 122, W: 130, I: 50, c: 1, scale: 1.2 },
      { name: '서량 철기', job: '기병', L: 120, W: 126, I: 32, c: 2 }] },
    { id: '동탁', stage: 20, name: '서량의 폭군 · 동탁', sub: '장안성에 다시 드리운 폭정', merit: 400, stone: 10, groups: [
      { name: '동탁', boss: true, job: '군주', L: 146, W: 156, I: 104, c: 1, scale: 1.7 },
      { name: '이유', job: '도사', L: 124, W: 64, I: 130, c: 1, scale: 1.2 },
      { name: '서량 친위대', job: '창병', L: 128, W: 134, I: 40, c: 3 }] },
    { id: '안량', stage: 23, name: '하북의 두 맹장', sub: '안량과 문추의 복수전', merit: 460, stone: 10, groups: [
      { name: '안량', boss: true, job: '기병', L: 128, W: 150, I: 46, c: 1, scale: 1.6 },
      { name: '문추', boss: true, job: '궁기', L: 126, W: 148, I: 44, c: 1, scale: 1.55 },
      { name: '하북 정예', job: '창병', L: 122, W: 126, I: 42, c: 2 }] },
    { id: '원소', stage: 25, name: '하북의 패자 · 원소', sub: '사정주가 다시 뭉쳤다', merit: 520, stone: 12, groups: [
      { name: '원소', boss: true, job: '군주', L: 134, W: 128, I: 128, c: 1, scale: 1.7 },
      { name: '저수', job: '풍수사', L: 122, W: 70, I: 138, c: 1, scale: 1.2 },
      { name: '하북 정예', job: '창병', L: 126, W: 130, I: 44, c: 3 }] },
    { id: '감녕', stage: 28, name: '백기장군 · 감녕', sub: '강동 수군의 야습', merit: 600, stone: 14, groups: [
      { name: '감녕', boss: true, job: '수적', L: 134, W: 152, I: 100, c: 1, scale: 1.6 },
      { name: '주유', boss: true, job: '책사', L: 132, W: 100, I: 148, c: 1, scale: 1.55 },
      { name: '강동 수군', job: '수적', L: 126, W: 130, I: 48, c: 2 }] },
    { id: '조조', stage: 30, name: '적벽의 결전 · 조조', sub: '천하를 노리는 최후의 결전', merit: 760, stone: 18, groups: [
      { name: '조조', boss: true, job: '군주', L: 146, W: 142, I: 150, c: 1, scale: 1.8 },
      { name: '제갈량', boss: true, job: '책사', L: 140, W: 92, I: 160, c: 1, scale: 1.7 },
      { name: '호위 친위대', job: '검병', L: 134, W: 140, I: 50, c: 3 }] }
  ];
  function bossRushOf(id) { return BOSS_RUSH.find((b) => b.id === id) || null; }

  /* ── 주간 보스전 (v7.0) ────────────────────────────────────────────────
     KST 기준 ISO 주차로 6종이 매주 월요일 0시에 돌아가며 바뀐다. 기믹은 전투 수치로
     그대로 적용되고(적 공격·방어·HP·공격속도, 제한 시간, 아군 공격), 매 도전의 피해량을
     재어 그 주의 최고 피해를 남긴다. 한 주에 한 번 첫 격파 보상을 준다.
       · 판정: 적을 모두 쓰러뜨리면 '격파', 90초가 지나면 '시간 종료'(피해 기록은 남는다)
       · 저장: sk_expedition_v1.weekly (없는 옛 세이브는 기본값으로 채운다) */
  const WEEKLY_TIME = 90;                // 주간 보스전 기본 제한 시간(초)
  const WEEKLY_FOE_RATE = 1.12;          // 같은 관문 보스 토벌전(1.05)보다 조금 두껍게
  const WEEKLY = [
    { id: 'w_jangak', short: '장각', stage: 10, name: '태평도 교주 · 장각', sub: '창천의 요술이 다시 하늘을 덮는다',
      merit: 520, stone: 12, gim: { id: 'sulbeop', icon: '☯️', name: '창천의 요술', desc: '적 전체 공격력 +20%', enemyAtk: 0.20 },
      groups: [
        { name: '장각', boss: true, job: '도사', L: 122, W: 78, I: 122, c: 1, scale: 1.65 },
        { name: '황건 정예', job: '창병', L: 100, W: 104, I: 34, c: 3 }] },
    { id: 'w_hwamong', short: '화웅', stage: 15, name: '서량의 선봉 · 화웅', sub: '관문을 부순 창끝이 다시 겨눠진다',
      merit: 620, stone: 14, gim: { id: 'cheolbyeok', icon: '🛡️', name: '철벽의 진', desc: '적 전체 방어력 +40%', enemyDef: 0.40 },
      groups: [
        { name: '화웅', boss: true, job: '기병', L: 132, W: 152, I: 54, c: 1, scale: 1.6 },
        { name: '서량 철기', job: '기병', L: 114, W: 120, I: 32, c: 2 },
        { name: '서량 궁병', job: '궁수', L: 110, W: 102, I: 38, c: 2 }] },
    { id: 'w_yeopo', short: '여포', stage: 18, name: '천하무쌍 · 여포', sub: '방천화극이 45초 안에 결판을 낸다',
      merit: 720, stone: 16, gim: { id: 'sokjeon', icon: '⏱', name: '천하무쌍', desc: '제한 시간 45초 — 속전속결', time: 45 },
      groups: [
        { name: '여포', boss: true, job: '기병', L: 142, W: 174, I: 42, c: 1, scale: 1.75 },
        { name: '고순', job: '등갑병', L: 124, W: 132, I: 52, c: 1, scale: 1.2 },
        { name: '서량 철기', job: '기병', L: 122, W: 128, I: 34, c: 2 }] },
    { id: 'w_dongtak', short: '동탁', stage: 20, name: '서량의 폭군 · 동탁', sub: '장안성에 다시 드리운 폭정',
      merit: 820, stone: 18, gim: { id: 'pokjeong', icon: '🐘', name: '폭정의 군세', desc: '적 전체 최대 HP +25%', enemyHp: 0.25 },
      groups: [
        { name: '동탁', boss: true, job: '군주', L: 148, W: 158, I: 106, c: 1, scale: 1.7 },
        { name: '이유', job: '도사', L: 126, W: 66, I: 132, c: 1, scale: 1.2 },
        { name: '서량 친위대', job: '창병', L: 130, W: 136, I: 42, c: 3 }] },
    { id: 'w_gamnyeong', short: '감녕', stage: 28, name: '백기장군 · 감녕', sub: '강동 수군의 야습이 밤을 가른다',
      merit: 900, stone: 20, gim: { id: 'yaseup', icon: '🌊', name: '강동의 야습', desc: '적 전체 공격속도 +30%', enemyAspd: 0.30 },
      groups: [
        { name: '감녕', boss: true, job: '수적', L: 138, W: 156, I: 102, c: 1, scale: 1.6 },
        { name: '주유', boss: true, job: '책사', L: 134, W: 102, I: 150, c: 1, scale: 1.55 },
        { name: '강동 수군', job: '수적', L: 128, W: 132, I: 50, c: 2 }] },
    { id: 'w_jojo', short: '조조', stage: 30, name: '적벽의 결전 · 조조', sub: '천하를 건 마지막 결전',
      merit: 1000, stone: 24, gim: { id: 'gyeoljeon', icon: '🔥', name: '결전의 포진', desc: '적 전체 공격력 +15% · 아군 전체 공격력 +15%', enemyAtk: 0.15, allyAtk: 0.15 },
      groups: [
        { name: '조조', boss: true, job: '군주', L: 150, W: 146, I: 154, c: 1, scale: 1.8 },
        { name: '제갈량', boss: true, job: '책사', L: 144, W: 96, I: 164, c: 1, scale: 1.7 },
        { name: '호위 친위대', job: '검병', L: 138, W: 144, I: 52, c: 3 }] }
  ];
  function weeklyBossOf(id) { return WEEKLY.find((b) => b.id === id) || null; }

  /* 주차 계산 — 기기 시간대와 상관없이 KST 벽시계로 센다 */
  function kstClock(now) { return new Date((now == null ? Date.now() : now) + 9 * 3600000); }
  function isoWeekOf(d) {                       // d = KST 벽시계를 UTC 필드에 담은 Date
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);     // 그 주 목요일 → ISO 연도가 정해진다
    const year = t.getUTCFullYear();
    return { year: year, week: Math.ceil(((t - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7) };
  }
  function weekStartMs(year, week) {            // 1주차 월요일 00:00 KST → 실제 epoch ms
    const jan4 = Date.UTC(year, 0, 4);          // 1월 4일은 언제나 1주차
    const day = new Date(jan4).getUTCDay() || 7;
    return jan4 - (day - 1) * 86400000 + (week - 1) * 7 * 86400000 - 9 * 3600000;
  }
  function weekInfo(now) {
    const iso = isoWeekOf(kstClock(now));
    const start = weekStartMs(iso.year, iso.week), end = start + 7 * 86400000;
    const idx = ((iso.year * 53 + iso.week) % WEEKLY.length + WEEKLY.length) % WEEKLY.length;
    return { key: iso.year + '-W' + (iso.week < 10 ? '0' : '') + iso.week,
      year: iso.year, week: iso.week, start: start, end: end, idx: idx, boss: WEEKLY[idx] };
  }
  function wkDate(ms) { const d = kstClock(ms); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }
  function wkLeft(ms) {
    const left = Math.max(0, ms - Date.now());
    const d = Math.floor(left / 86400000), h = Math.floor(left % 86400000 / 3600000), m = Math.floor(left % 3600000 / 60000);
    return d > 0 ? d + '일 ' + h + '시간' : (h > 0 ? h + '시간 ' + m + '분' : m + '분');
  }
  /* 옛 세이브에 weekly 가 없거나 깨졌어도 기본값으로 채운다 (세이브 이관 가드) */
  function normWeekly(raw, wk) {
    const o = { key: wk.key, boss: wk.boss.id, best: 0, clears: 0, plays: 0, first: false, bestAt: 0 };
    if (!raw || typeof raw !== 'object') return o;
    const key = String(raw.key || '');
    if (!/^\d{4}-W\d{2}$/.test(key)) return o;                 // 형식이 깨진 기록은 이번 주 것으로 새로 시작
    o.key = key;
    o.boss = weeklyBossOf(raw.boss) ? String(raw.boss) : o.boss;
    o.best = clamp(Math.round(Number(raw.best) || 0), 0, 99999999);
    o.clears = clamp(Math.round(Number(raw.clears) || 0), 0, 9999);
    o.plays = clamp(Math.round(Number(raw.plays) || 0), 0, 99999);
    o.first = !!raw.first;
    o.bestAt = Math.max(0, Math.round(Number(raw.bestAt) || 0));
    return o;
  }
  const normHist = (raw) => (Array.isArray(raw) ? raw : []).filter((h) => h && /^\d{4}-W\d{2}$/.test(String(h.key || '')))
    .map((h) => ({ key: String(h.key), boss: weeklyBossOf(h.boss) ? String(h.boss) : '',
      best: clamp(Math.round(Number(h.best) || 0), 0, 99999999), clears: clamp(Math.round(Number(h.clears) || 0), 0, 9999) }))
    .slice(-8);
  /* 주가 바뀌면 지난 주 기록을 보관하고 이번 주 기록을 새로 연다 */
  function refreshWeekly() {
    const wk = weekInfo();
    if (!S) return wk;
    if (!S.weekly || S.weekly.key !== wk.key) {
      const old = S.weekly;
      if (old && old.key && old.key < wk.key && (old.best || old.clears)) {
        S.weeklyHist = normHist((S.weeklyHist || []).concat([{ key: old.key, boss: old.boss, best: old.best, clears: old.clears }]));
      }
      S.weekly = { key: wk.key, boss: wk.boss.id, best: 0, clears: 0, plays: 0, first: false, bestAt: 0 };
      save();
    } else if (S.weekly.boss !== wk.boss.id) {
      S.weekly.boss = wk.boss.id;                                // 로테이션 정의가 바뀐 경우
      save();
    }
    return wk;
  }

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
    return 'assets/portraits/v2/gen_bobyung.webp?v=114';
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
  /* ── 정련석 (v6.2) — 장비 분해로 얻고 장비 강화에 쓴다. 원정 저장에 함께 남는다 ── */
  const readStone = () => (S ? Math.max(0, Math.round(Number(S.stone) || 0)) : 0);
  function addStone(n) { if (!S) return 0; S.stone = Math.max(0, readStone() + Math.round(Number(n) || 0)); return S.stone; }

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
    const out = { v: 4, owned: {}, squad: [], gear: [], cleared: [], progress: 1, credit: {}, stone: 0, rank: 12, rankTop: false, rankWins: 0, bossWins: {}, weekly: null, weeklyHist: [] };

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

    /* 장비 인스턴스 — v6.2 부터 강화도(+enh 0~5)를 함께 보관한다 */
    const seen = {};
    (Array.isArray(st.gear) ? st.gear : []).forEach((it) => {
      if (!it || it.tid == null || !it.iid) return;
      const iid = String(it.iid);
      if (seen[iid]) return;
      seen[iid] = 1;
      out.gear.push({ iid: iid, tid: Number(it.tid), enh: clamp(Math.round(Number(it.enh) || 0), 0, ENH_MAX) });
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

    /* 진행도 (1~30관문) */
    const cleared = (Array.isArray(st.cleared) ? st.cleared : [])
      .map((n) => Number(n)).filter((n) => n >= 1 && n <= MAX_ACT);
    cleared.sort((a, b) => a - b);
    out.cleared = cleared.filter((n, i, a) => a.indexOf(n) === i);
    out.progress = clamp(Number(st.progress) || (out.cleared.length ? Math.max.apply(null, out.cleared) + 1 : 1), 1, MAX_ACT);
    out.credit = (st.credit && typeof st.credit === 'object') ? { raw: Number(st.credit.raw) || 0, baseCities: st.credit.baseCities == null ? null : Number(st.credit.baseCities) } : {};
    /* v6.2 — 정련석 · 랭킹 위치 · 보스 토벌 기록 (없는 옛 저장은 기본값) */
    out.stone = clamp(Math.round(Number(st.stone) || 0), 0, 999999);
    out.rank = clamp(Math.round(Number(st.rank) || 12), 1, LADDER.length + 1);
    out.rankTop = !!st.rankTop;
    out.rankWins = Math.max(0, Math.round(Number(st.rankWins) || 0));
    if (st.bossWins && typeof st.bossWins === 'object') {
      Object.keys(st.bossWins).forEach((k) => { const v = Math.round(Number(st.bossWins[k]) || 0); if (v > 0 && bossRushOf(k)) out.bossWins[k] = v; });
    }
    /* v7.0 — 주간 보스전 기록 (옛 저장은 이번 주 기본값으로 채운다) */
    const wk = weekInfo();
    out.weekly = normWeekly(st.weekly, wk);
    out.weeklyHist = normHist(st.weeklyHist);
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
        v: 4,
        owned: S.owned,
        squad: S.squad,
        gear: S.gear,
        cleared: S.cleared.slice(),
        progress: clamp(maxCleared() + 1, 1, MAX_ACT),
        credit: S.credit,
        stone: S.stone || 0,
        rank: S.rank || 12,
        rankTop: !!S.rankTop,
        rankWins: S.rankWins || 0,
        bossWins: S.bossWins || {},
        weekly: S.weekly || null,
        weeklyHist: S.weeklyHist || [],
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
  function normalizeTreasure(t, enh) {
    if (!t) return null;
    const slot = slotOf(t), g = EQUIP_GRADE[t.grade] || 'C';
    const e = clamp(Math.round(enh == null ? (Number(t.enh) || 0) : Number(enh) || 0), 0, ENH_MAX);
    const k = 1 + 0.05 * e;
    const b = EQUIP_BASE[slot][g] || EQUIP_BASE[slot].C, keys = EQUIP_SLOTS[slot].fx;
    return {
      id: t.id, name: t.name, grade: g, slot: slot, enh: e,
      fx: keys.map((f, i) => ({ key: f[0], label: f[1], icon: f[2], val: Math.round(b[i] * k * 10) / 10 }))
    };
  }
  /* 보유 장비 한 점(인스턴스) 기준 — 강화도(+enh)까지 반영한 수치 */
  function normItem(item) {
    const t = treasureOf(item);
    if (!t) return null;
    const n = normalizeTreasure(t, item && item.enh);
    if (n && item && item.enh) n.enh = clamp(Math.round(Number(item.enh) || 0), 0, ENH_MAX);
    return n;
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
      const item = gearItem(box[slot]);
      const n = normItem(item);
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

  /* ── 장비 강화 · 분해 (v6.2) ────────────────────────────────
     강화: 정련석 + 공훈을 들여 +1~+5. 강화 1당 능력치 +5% (normalizeTreasure 의 k)
     분해: 장착 중이 아닌 장비만. 등급·강화도에 따라 정련석과 공훈을 돌려받는다. */
  const DISMANTLE_STONE = { S: 8, A: 5, B: 3, C: 2 };
  function enhCost(item) {
    const e = clamp(Math.round(Number(item && item.enh) || 0), 0, ENH_MAX);
    return { stone: 1 + e, merit: 40 + 60 * e };
  }
  function dismantleGain(item) {
    const n = normItem(item), g = n ? n.grade : 'C', e = clamp(Math.round(Number(item && item.enh) || 0), 0, ENH_MAX);
    return { stone: (DISMANTLE_STONE[g] || 2) + e, merit: 15 + 10 * e };
  }
  function enhanceItem(item) {
    if (!item) return { ok: false, why: 'miss' };
    const enh = clamp(Math.round(Number(item.enh) || 0), 0, ENH_MAX);
    if (enh >= ENH_MAX) return { ok: false, why: 'max' };
    const c = enhCost(item);
    if (readStone() < c.stone) return { ok: false, why: 'stone', need: c.stone };
    if (readMerit() < c.merit) return { ok: false, why: 'merit', need: c.merit };
    addStone(-c.stone); addMerit(-c.merit);
    item.enh = enh + 1;
    save();
    return { ok: true, enh: item.enh };
  }
  function dismantleItem(item) {
    if (!item) return { ok: false, why: 'miss' };
    const owner = equippedBy()[item.iid];
    if (owner) return { ok: false, why: 'equipped', owner: owner };   // 장착 중인 장비는 분해 금지
    const g = dismantleGain(item);
    addStone(g.stone); addMerit(g.merit);
    S.gear = S.gear.filter((x) => x.iid !== item.iid);
    save();
    return { ok: true, stone: g.stone, merit: g.merit };
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
  function targetStage() { return Math.min(maxCleared() + 1, MAX_ACT); }

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
      S.gear.push({ iid: it.iid, tid: it.tid, enh: 0 });
      out.push(it);
    }
    if (n === 10 && out.length === 10 && !out.some((it) => it.treasure.grade !== '일반')) {
      S.gear.pop();
      const it = rollGear(true);
      if (it) { S.gear.push({ iid: it.iid, tid: it.tid, enh: 0 }); out[out.length - 1] = it; }
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
    actSel = Math.max(0, ACTS.indexOf(actOf(targetStage())));
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
  /* 모든 원정 모달을 걷어낸다 — 장비 상세→장착→보물창고처럼 겹쳐 열린 흐름을 정리 */
  function closeAllModals() {
    if (!stage) return;
    const list = stage.querySelectorAll('.ex-modal');
    for (let i = 0; i < list.length; i++) { try { list[i].remove(); } catch (e) { /* ignore */ } }
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
    const ids = S.squad.slice(0, MAX_SQUAD);
    if (actSel < 0 || actSel >= ACTS.length) actSel = ACTS.indexOf(actOf(targetStage()));
    if (actSel < 0) actSel = 0;
    const act = ACTS[actSel], st = goalStage(act), sd = STAGE_DEFS[st - 1];
    const room = el('div', 'ex-room');
    room.appendChild(el('div', 'ex-bg'));

    const top = el('div', 'ex-top');
    const bk = el('button', 'ex-back', '←'); bk.onclick = close;
    top.appendChild(bk);
    top.appendChild(actTabsHTML());
    top.appendChild(el('div', 'ex-pw', '⚔️ ' + fmt(power(ids))));
    top.appendChild(el('div', 'ex-merit', '🏅 ' + fmt(readMerit())));
    room.appendChild(top);

    const rw = rewardOf(st), hero = rw.hero ? def(rw.hero) : null;
    const allDone = maxCleared() >= act.to, actLock = !actUnlocked(act);
    room.appendChild(el('div', 'ex-goal' + (actLock ? ' lock' : ''),
      '<div class="g0">⚔️ 꼬마영웅 원정대</div>' +
      '<div class="g1">' + (act.n > 1 ? act.short + ' · ' + act.sub : '현재 목표') + '</div>' +
      '<div class="g2">' + st + '관문 · ' + sd.name + '</div>' +
      '<div class="g3">🏅 ' + fmt(rw.merit) + (hero ? ' · 🎁 ' + hero.name : '') + (rw.stone ? ' · ' + STONE_NAME + ' +' + rw.stone : '') + '</div>' +
      (allDone ? '<div class="g4">' + act.short + ' 클리어 완료</div>' : '') +
      (allDone && act.n < ACTS.length ? '<div class="g4">🔓 ' + ACTS[act.n].short + ' 해금 — 위 탭에서 이동</div>' : '') +
      (actLock ? '<div class="g4">🔒 ' + (act.from - 1) + '관문 클리어 시 해금</div>' : '')));

    const side = el('div', 'ex-side');
    [['스테이지', '🗺️', openStages], ['보스토벌', '👑', openBossRush], ['진형편집', '🧩', openFormation], ['인연도감', '📜', openBonds]]
      .forEach(([t, ic, fn]) => { const b = el('button', 'ex-sbtn', '<i>' + ic + '</i><span>' + t + '</span>'); b.onclick = fn; side.appendChild(b); });
    room.appendChild(side);

    /* v7.0 — 주간 보스전 명패: 이번 주 보스·최고 피해를 대기실에서 바로 보여 준다 */
    const wk = refreshWeekly(), wkb = weeklyBossOf(S.weekly.boss) || wk.boss;
    const wkCard = el('button', 'ex-week' + (S.weekly.first ? ' done' : ''),
      '<span class="wk-t">👹 주간 보스전 · ' + wk.week + '주차</span>' +
      '<b>' + esc(wkb.short) + '</b>' +
      '<small>' + (S.weekly.first ? '✔ 격파 · 최고 ' + fmt(S.weekly.best) : '최고 피해 ' + fmt(S.weekly.best)) + '</small>');
    wkCard.onclick = openWeekly;
    room.appendChild(wkCard);
    /* v7.1 — 목표 카드가 두 줄 이름·보상·클리어 줄로 길어지면 주간 보스 명패를 그 아래로 내린다
       (둘 다 absolute 라 168px 고정일 때 4막처럼 긴 막에서 겹친다) */
    requestAnimationFrame(() => {
      try {
        const gEl = room.querySelector('.ex-goal');
        if (gEl && wkCard && wkCard.parentNode) {
          const bottom = gEl.offsetTop + gEl.offsetHeight + 8;
          if (bottom > 168) wkCard.style.top = Math.round(bottom) + 'px';
        }
      } catch (e) { /* ignore */ }
    });

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

    const go = el('button', 'ex-go', maxCleared() >= MAX_ACT ? '⚔️ ' + MAX_ACT + '관문 재도전' : '⚔️ ' + st + '관문 출진');
    go.onclick = () => startBattle(st);
    room.appendChild(go);

    const dock = el('nav', 'ex-dock');
    [['장수', '🛡️', openRoster], ['보물', '💎', openTreasure], ['소환', '🔮', openSummon], ['랭킹', '🏆', openRanking], ['주간보스', '👹', openWeekly]]
      .forEach(([t, ic, fn]) => {
        const b = el('button', t === '주간보스' && !S.weekly.first ? 'hot' : '', '<i>' + ic + '</i><span>' + t + '</span>');
        b.onclick = fn; dock.appendChild(b);
      });
    room.appendChild(dock);
    stage.appendChild(room);
  }
  /* 해당 막에서 지금 도전할 관문 — 다 깼으면 막의 마지막 관문(재도전) */
  function goalStage(a) {
    const mc = maxCleared();
    if (mc + 1 < a.from) return a.from;
    if (mc + 1 <= a.to) return mc + 1;
    return a.to;
  }
  /* 막 탭 (1막~7막) — 대기실 상단과 스테이지 창이 같은 규칙을 쓴다.
     v7.2 — 막이 7개(앞으로 10개)라 한 줄에 다 들어가지 않는다. 탭 줄은 가로 스크롤 레일이 되고
     (CSS .ex-tabs / .ex-stabs 의 overflow-x), 고르고 있는 막 탭이 가운데로 자동 스크롤된다. */
  function actTabsHTML(cls, pick) {
    const wrap = el('div', cls || 'ex-tabs');
    ACTS.forEach((a, i) => {
      const on = a.n === ACTS[actSel].n, ok = actUnlocked(a);
      const b = el('button', 'ex-tab' + (on ? ' on' : '') + (ok ? '' : ' lock'),
        '<b>' + a.short + '</b><small>' + (ok ? a.from + '~' + a.to : '🔒') + '</small>');
      b.onclick = () => {
        if (!ok) { toast(a.from - 1 + '관문을 먼저 클리어하면 ' + a.short + '이 열려요'); sfx('deny'); return; }
        sfx('ui');
        if (pick) pick(i);
        else { actSel = i; renderRoom(); }
      };
      wrap.appendChild(b);
    });
    /* 고른 탭을 보이게 — offsetLeft는 위치 기준(offsetParent)이 화면마다 달라 사각형으로 계산한다 */
    requestAnimationFrame(() => {
      try {
        const on = wrap.querySelector('.ex-tab.on');
        if (!on || wrap.scrollWidth <= wrap.clientWidth + 1) { syncTabEdge(wrap); return; }
        const r = on.getBoundingClientRect(), c = wrap.getBoundingClientRect();
        wrap.scrollLeft += (r.left - c.left) - (c.width - r.width) / 2;
        syncTabEdge(wrap);
      } catch (e) { /* ignore */ }
    });
    wrap.addEventListener('scroll', () => syncTabEdge(wrap), { passive: true });
    return wrap;
  }
  /* 가로 스크롤 레일의 양 끝 안내 — 더 숨은 쪽만 가장자리를 흐리게(mask) 한다.
     탭이 다 들어가면(넓은 화면·막이 적을 때) class가 붙지 않아 아무 변화도 없다. */
  function syncTabEdge(wrap) {
    if (!wrap) return;
    const more = wrap.scrollWidth > wrap.clientWidth + 1;
    wrap.classList.toggle('scrollable', more);
    wrap.classList.toggle('at-start', !more || wrap.scrollLeft <= 1);
    wrap.classList.toggle('at-end', !more || wrap.scrollLeft >= wrap.scrollWidth - wrap.clientWidth - 1);
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
    const hero = n === 10 ? '유비' : n === 20 ? '관우' : n === 30 ? '제갈량' : n === 40 ? '장비'
      : n === 50 ? '조운' : n === 60 ? '황충' : n === 70 ? '마초' : null;
    return { merit: 40 + n * 15 + (boss ? 60 : 0), hero: hero, stone: stoneOf(n) };
  }
  /* 보스 관문 첫 클리어 — 강화 재료 정련석 (막이 올라갈수록 많다 · 1~7막 4·6·8·10·12·14·16) */
  function stoneOf(n) {
    if (!(STAGE_DEFS[n - 1] && STAGE_DEFS[n - 1].boss)) return 0;
    return n <= 10 ? 4 : n <= 20 ? 6 : n <= 30 ? 8 : n <= 40 ? 10 : n <= 50 ? 12 : n <= 60 ? 14 : 16;
  }
  /* v5.74 — 재도전은 첫 클리어의 15~25% (관문이 높을수록 ↑), 최소 10
     · v7.2 — 40관문에서 25%에 닿고 그 뒤로는 25% 그대로다. 분모를 MAX_ACT로 두면
       70관문으로 늘릴 때 1~40관문 재도전 보상이 조용히 깎이므로(예: 30관문 114→98),
       분모는 39(= v7.1의 40관문 기준)로 고정하고 상한만 막별로 올린다(1~4막 120 · 5~7막 170). */
  function repeatRewardOf(n) {
    const rate = 0.15 + 0.10 * clamp((n - 1) / 39, 0, 1);
    return clamp(Math.round(rewardOf(n).merit * rate), 10, n <= 40 ? 120 : 170);
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
        const item = gearItem(eqBox[k]), t = treasureOf(item), n = normItem(item);
        const cell = el('div', 'u-eq' + (t ? ' on' : ''));
        cell.dataset.grade = n ? n.grade : 'C';
        cell.innerHTML = '<i>' + SLOT_ICON[k] + '</i><span>' + (t ? esc(t.name) + (item.enh ? ' +' + item.enh : '') : SLOT_LABEL[k]) + '</span>' +
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

  /* ---------- 스테이지 (1~7막 탭) ---------- */
  function openStages() {
    const body = el('div', 'ex-list');
    const mc = maxCleared();
    let sel = actSel >= 0 && actSel < ACTS.length ? actSel : 0;
    const draw = () => {
      body.innerHTML = '';
      body.appendChild(actTabsHTML('ex-stabs', (i) => { sel = i; draw(); }));
      const a = ACTS[sel];
      body.appendChild(el('div', 'u-note', a.icon + ' ' + a.name + ' — ' + a.desc +
        '<br>' + (actUnlocked(a) ? '관문 ' + a.from + '~' + a.to + ' · ' + (Math.min(Math.max(mc - a.from + 1, 0), a.to - a.from + 1)) + '/' + (a.to - a.from + 1) + ' 클리어' : '🔒 ' + (a.from - 1) + '관문을 먼저 클리어하세요')));
      for (let n = a.from; n <= a.to; n++) {
        const sd = STAGE_DEFS[n - 1], rw = rewardOf(n), ok = n <= mc, lock = !actUnlocked(a) || n > mc + 1;
        const row = el('div', 'l-row stg' + (ok ? ' clr' : '') + (lock ? ' lock' : ''),
          '<div class="s-no">' + n + '</div><div class="l-mid"><b>' + esc(sd.name) + (sd.boss ? ' 👑' : '') + '</b><small>🏅' + fmt(rw.merit) +
          (rw.hero ? ' · 🎁 ' + esc(rw.hero) : '') + (rw.stone ? ' · ' + STONE_NAME + ' +' + rw.stone : '') + ' · ' + esc(sd.sub) + '</small></div>' +
          '<div class="s-st">' + (ok ? '✔ 클리어' : lock ? '🔒' : '도전') + '</div>');
        if (!lock) row.onclick = () => { m.kill(); actSel = sel; startBattle(n); };
        body.appendChild(row);
      }
    };
    draw();
    const m = modal('꼬마영웅 원정대 · 관문', body, { cls: 'tall' });
  }

  /* =====================================================================
     랭킹전 — 실제 AI 랭커와 3×3 실전투 (v6.2)
       LADDER[0] 이 1위. 플레이어는 자신보다 위에 있는 랭커에게만 도전할 수 있고
       이기면 그 자리를 빼았는다(순위 상승 + 공훈·정련석).
       상대 덱은 실제 본편 장수 5명 — 내 전투력에 맞춰 난이도가 오른다.
     ===================================================================== */
  const LADDER = [
    { name: '여포', title: '천하무쌍', deck: ['여포', '장료', '고순', '화웅', '장합'] },
    { name: '조조', title: '치세의 간웅', deck: ['조조', '하후돈', '전위', '허저', '서황'] },
    { name: '주유', title: '적벽의 도독', deck: ['주유', '감녕', '태사자', '황개', '한당'] },
    { name: '마초', title: '서량의 백마', deck: ['마초', '방덕', '마등', '한수', '장제'] },
    { name: '관우', title: '미염공', deck: ['관우', '장비', '조운', '황충', '유비'] },
    { name: '하후돈', title: '독안룡', deck: ['하후돈', '하후연', '조인', '조홍', '악진'] },
    { name: '태사자', title: '강동의 호랑이', deck: ['태사자', '손책', '정보', '능통', '주태'] },
    { name: '감녕', title: '백기장군', deck: ['감녕', '여몽', '노숙', '육손', '손권'] },
    { name: '전위', title: '호위대장', deck: ['전위', '허저', '문빙', '여건', '우금'] },
    { name: '장료', title: '위진의 명장', deck: ['장료', '서황', '악진', '우금', '장합'] },
    { name: '안량', title: '하북의 선봉', deck: ['안량', '문추', '전풍', '저수', '원소'] }
  ];
  const RANK_MAX = LADDER.length + 1;          // 나까지 포함한 사다리 길이
  const rankPos = () => clamp(Math.round(Number(S && S.rank) || RANK_MAX), 1, RANK_MAX);
  /* 상대 위치(pos, 1=최상위)에 따른 목표 전투력 — 아래쪽은 내 0.6배, 1위는 1.5배 */
  function rankTargetPower(pos) {
    const mine = Math.max(300, power(S.squad));
    const t = clamp((RANK_MAX - pos) / (RANK_MAX - 2), 0, 1);   // pos 11→0.1 · pos 1→1
    return Math.round(mine * (0.58 + 0.92 * t));
  }
  function openRanking() {
    const my = rankPos();
    const body = el('div', 'ex-list');
    const draw = () => {
      body.innerHTML = '';
      body.appendChild(el('div', 'u-note big', '🏆 랭킹전 — 나보다 위의 랭커에게 도전해 이기면 그 자리를 빼앗습니다<br>이기면 순위 상승 + 🏅공훈 + ' + STONE_NAME + ', 지면 순위는 그대로'));
      body.appendChild(el('div', 'sx-wallet', '내 순위 <b>' + my + '위</b> / ' + RANK_MAX + ' · ⚔️ 전투력 <b>' + fmt(power(S.squad)) + '</b> · 통산 ' + (S.rankWins || 0) + '승'));
      let shown = 0;
      for (let p = 1; p <= RANK_MAX; p++) {
        if (p === my) {
          const r = el('div', 'l-row in me',
            '<div class="s-no">' + p + '</div><div class="l-mid"><b>나 · ' + esc(S.squad.map((id) => def(id).name).join(' ')) + '</b>' +
            '<small>⚔️ ' + fmt(power(S.squad)) + ' · 여기서 위로 도전하세요</small></div><div class="s-st">🟢 내 자리</div>');
          body.appendChild(r);
          continue;
        }
        const who = p < my ? LADDER[p - 1] : LADDER[p - 2];   // 내 위=도전 가능 · 내 아래=이미 이긴 상대
        if (!who) continue;
        shown++;
        if (p > my) {
          const d0 = def(who.name);
          const row0 = el('div', 'l-row lock');
          row0.appendChild(el('div', 's-no', String(p)));
          row0.appendChild(portrait(d0, 'l-pt'));
          row0.appendChild(el('div', 'l-mid', '<b>' + esc(who.name) + ' <small>' + esc(who.title) + '</small></b><small>이미 앞지른 상대 — 아래 순위</small>'));
          body.appendChild(row0);
          continue;
        }
        const d = def(who.name);
        const row = el('div', 'l-row stg');
        row.appendChild(el('div', 's-no', String(p)));
        row.appendChild(portrait(d, 'l-pt'));
        row.appendChild(el('div', 'l-mid', '<b>' + esc(who.name) + ' <small>' + esc(who.title) + '</small></b>' +
          '<small>⚔️ ' + fmt(rankTargetPower(p)) + ' · ' + who.deck.map((n) => esc(n)).join(' ') + '</small>'));
        const btn = el('button', 'ex-mini gold', '도전');
        btn.onclick = (ev) => { if (ev) ev.stopPropagation(); m.kill(); startRankBattle(p); };
        row.appendChild(btn);
        body.appendChild(row);
      }
      if (!shown) body.appendChild(el('div', 'u-note', '🏆 랭킹 1위입니다 — 최강자의 자리!'));
      body.appendChild(el('div', 'u-note', '상대 덱은 실제 본편 장수 5명입니다 — 내 전투력이 오를수록 상대도 강해집니다.<br>🎁 각 막 보스 첫 클리어·보스 토벌전에서 ' + STONE_NAME + '을 모아 장비를 강화하세요.'));
    };
    draw();
    const m = modal('🏆 랭킹전', body, { cls: 'tall' });
  }

  /* ---------- 보스 토벌전 (도전 모드) ---------- */
  function openBossRush() {
    const body = el('div', 'ex-list');
    const mc = maxCleared();
    body.appendChild(el('div', 'u-note big', '👑 보스 토벌전<br>이미 클리어한 막의 대표 보스를 강화해 다시 상대합니다<br>🗓 첫 토벌에 많은 공훈과 ' + STONE_NAME + ', 반복 토벌도 보상이 있습니다'));
    body.appendChild(el('div', 'sx-wallet', '🏅 공훈 <b>' + fmt(readMerit()) + '</b> · ' + STONE_NAME + ' <b>' + fmt(readStone()) + '</b>'));
    BOSS_RUSH.forEach((b) => {
      const open = mc >= b.stage, done = (S.bossWins[b.id] || 0) > 0;
      const act = actOf(b.stage);
      const row = el('div', 'l-row stg boss' + (done ? ' clr' : '') + (open ? '' : ' lock'));
      row.appendChild(el('div', 's-no', b.stage + ''));
      row.appendChild(portrait(def(b.id), 'l-pt'));
      row.appendChild(el('div', 'l-mid', '<b>👑 ' + esc(b.name) + '</b><small>' + act.short + ' · ' + esc(b.sub) +
        '<br>🏅' + fmt(b.merit) + ' · ' + STONE_NAME + ' +' + b.stone + (done ? ' · 토벌 ' + S.bossWins[b.id] + '회' : '') + '</small></div>'));
      if (!open) {
        row.appendChild(el('div', 's-st', '🔒 ' + b.stage + '관문'));
      } else {
        const btn = el('button', 'ex-mini gold', done ? '재도전' : '도전');
        btn.onclick = () => { m.kill(); startBossBattle(b.id); };
        row.appendChild(btn);
      }
      body.appendChild(row);
    });
    body.appendChild(el('div', 'u-note', '보스는 본편 장수의 실제 능력치에 토벌전 배율이 붙습니다 — 호위 부대와 함께 6명이 나옵니다.'));
    const m = modal('👑 보스 토벌전', body, { cls: 'tall' });
  }

  /* ---------- 주간 보스전 (v7.0) ---------- */
  function openWeekly() {
    const wk = refreshWeekly();
    const b = weeklyBossOf(S.weekly.boss) || wk.boss;
    const rec = S.weekly;
    const body = el('div', 'ex-list ex-weekly');
    let m = null;
    body.appendChild(el('div', 'u-note big', wk.year + '년 ' + wk.week + '주차 · ' + wkDate(wk.start) + '~' + wkDate(wk.end - 1) +
      '<br>마감까지 ' + wkLeft(wk.end)));

    const hero = el('div', 'wk-boss');
    hero.appendChild(portrait(def(b.short), 'wk-pt'));
    hero.appendChild(el('div', 'wk-bn', '<b>' + esc(b.name) + '</b><small>' + esc(b.sub) + '</small>' +
      '<span class="wk-gim"><em>' + b.gim.icon + ' ' + esc(b.gim.name) + '</em> ' + esc(b.gim.desc) + '</span>' +
      (b.gim.time ? '' : '<span class="wk-gim time"><em>⏱ 제한 시간</em> ' + WEEKLY_TIME + '초 안에 최대 피해</span>')));
    body.appendChild(hero);

    const foes = [];
    (b.groups || []).forEach((g) => { foes.push(esc(g.name) + (g.c > 1 ? ' ×' + g.c : '')); });
    body.appendChild(el('div', 'u-note', '출전 — ' + foes.join(' · ')));

    body.appendChild(el('div', 'wk-rec',
      '<div><span>이번 주 최고 피해</span><b>' + fmt(rec.best) + '</b></div>' +
      '<div><span>격파</span><b>' + (rec.first ? '✔ 완료' : rec.clears ? rec.clears + '회' : '—') + '</b></div>' +
      '<div><span>도전</span><b>' + rec.plays + '회</b></div>'));

    const go = el('button', 'ex-btn gold wk-go', (rec.first ? '👹 주간 보스 재도전' : '👹 주간 보스 도전') +
      '<small>' + (rec.first ? '재도전 🏅' + fmt(Math.max(80, Math.round(b.merit * 0.2))) + ' · ' + STONE_NAME + ' +2'
        : '첫 격파 🏅' + fmt(b.merit) + ' · ' + STONE_NAME + ' +' + b.stone) + '</small>');
    go.onclick = () => { if (m) m.kill(); startWeeklyBattle(); };
    body.appendChild(go);

    const mine = power(S.squad), theirs = Math.round(weeklyTarget(b));
    body.appendChild(el('div', 'u-note', '내 원정단 ⚔️' + fmt(mine) + ' · 이번 주 보스 ⚔️' + fmt(theirs) +
      '<br>적을 모두 쓰러뜨리면 격파, 시간이 끝나도 그때까지 넣은 피해가 기록에 남습니다.' +
      '<br>보스 전투력은 내 원정단에 맞춰 조정되고, 관문 진행과 상관없이 언제든 도전할 수 있습니다.' +
      '<br>주간 첫 격파 보상은 한 주에 한 번, 매주 월요일 0시에 보스가 바뀝니다.'));

    if (S.weeklyHist.length) {
      body.appendChild(el('div', 'l-hd', '지난 주 기록'));
      S.weeklyHist.slice().reverse().forEach((h) => {
        const hb = weeklyBossOf(h.boss);
        body.appendChild(el('div', 'wk-hrow', '<b>' + esc(h.key) + '</b><span>' + esc(hb ? hb.short : '—') + '</span>' +
          '<em>피해 ' + fmt(h.best) + (h.clears ? ' · 격파 ' + h.clears + '회' : ' · 미격파') + '</em>'));
      });
    }
    m = modal('👹 주간 보스전', body, { cls: S.weeklyHist.length ? 'tall' : '', onClose: renderRoom });
  }

  /* 적 편성에 기믹 수치를 입힌다 — 표기한 그대로만 바꾼다 */
  function weeklyTarget(b) {
    const mine = power(S ? S.squad : []);
    const curve = expectedPartyPower(b.stage) * WEEKLY_FOE_RATE * TUNE_POWER_MULT;
    /* 관문·토벌전과 같은 원칙 — 곡선보다 강한 사람에게는 곡선(고정)이 적용되고,
       새로 시작한 원정단은 내 전투력의 90%로 맞춰 한 번은 해 볼 만하게 둔다.
       (급하게 맞춘 5인 편성으로 6판 재 보니 ×1.15·×1.00·×0.95는 전패, ×0.90은 첫 판 패배 뒤
        5연승 — 첫 도전은 아슬아슬하고 성장·재도전으로 넘어가는 값) */
    return Math.min(curve, Math.max(600, mine * 0.90));
  }
  function weeklyFoes(b) {
    const g = b.gim || {};
    return unitsFrom(b.groups, weeklyTarget(b)).map((f) => Object.assign({}, f, {
      hp: Math.round(f.hp * (1 + (g.enemyHp || 0))),
      atk: Math.round(f.atk * (1 + (g.enemyAtk || 0))),
      def: Math.round(f.def * (1 + (g.enemyDef || 0)))
    }));
  }
  function startWeeklyBattle() {
    const wk = refreshWeekly();
    const b = weeklyBossOf(S.weekly.boss) || wk.boss;
    const g = b.gim || {};
    startArena({ mode: 'weekly', n: 0, sd: null, title: '👹 주간 보스 — ' + b.short + '!',
      foeLabel: '주간 보스 · ' + b.short, foes: weeklyFoes(b),
      time: g.time || WEEKLY_TIME, gim: g, meta: { boss: b.id, key: wk.key } });
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
      body.appendChild(el('div', 'sx-wallet', '🏅 공훈 <b>' + fmt(readMerit()) + '</b> · ' + STONE_NAME + ' <b>' + fmt(readStone()) + '</b> · 보유 장비 <b>' + S.gear.length + '</b>점'));
      if (res && res.length) {
        const grid = el('div', 'sx-grid');
        res.forEach((it) => {
          const t = it.treasure, nn = normalizeTreasure(t), card = el('div', 'sx-card g');
          if (nn) card.dataset.grade = nn.grade;
          card.appendChild(el('div', 'sx-ic', TYPE_ICON[t.type] || '💎'));
          card.appendChild(el('b', '', t.name));
          card.appendChild(el('em', '', (t.grade || '') + (nn ? ' · ' + nn.grade : '')));
          if (nn) card.appendChild(el('div', 'xt-fx', nn.fx.map((f) => '<span>' + f.icon + ' +' + f.val + '%</span>').join('')));
          grid.appendChild(card);
        });
        body.appendChild(grid);
      }
      const row = el('div', 'u-btns');
      const b1 = el('button', 'ex-btn', '뽑기 1회 <small>🏅' + COST_GEAR[1] + '</small>');
      const b10 = el('button', 'ex-btn gold', '뽑기 10회 <small>🏅' + COST_GEAR[10] + '</small>');
      b1.onclick = () => doPull(1); b10.onclick = () => doPull(10);
      row.appendChild(b1); row.appendChild(b10); body.appendChild(row);

      body.appendChild(el('div', 'l-hd', '보유 장비 (' + S.gear.length + '점) — 탭해서 장착 · 강화 · 분해'));
      const used = equippedBy();
      if (!S.gear.length) body.appendChild(el('div', 'u-note', '아직 장비가 없어요. 위에서 뽑아 보세요.'));
      S.gear.slice().reverse().forEach((it) => {
        const t = treasureOf(it);
        if (!t) return;
        const owner = used[it.iid], nn = normItem(it);
        const rowEl = el('div', 'sx-gear' + (owner ? ' on' : ''),
          '<span class="sx-gic">' + (TYPE_ICON[t.type] || '💎') + '</span>' +
          '<div class="sx-gmid"><b>' + esc(t.name) + (it.enh ? ' <em class="gv-enh">+' + it.enh + '</em>' : '') +
          ' <em class="sx-tg">' + (nn ? nn.grade : '') + '</em></b><small>' + SLOT_LABEL[slotOf(t)] + ' · ' + (t.grade || '') + '</small>' + fxChips(nn) + '</div>' +
          '<span class="sx-gs">' + (owner ? esc(owner) : '미장착') + '</span>');
        rowEl.onclick = () => openGearItem(it.iid);
        body.appendChild(rowEl);
      });
      body.appendChild(el('div', 'u-note', '🌀 중복·남는 장비는 분해해 ' + STONE_NAME + '·공훈을 얻고, 정련석으로 +' + ENH_MAX + '까지 강화할 수 있어요.<br>장착 중인 장비는 분해되지 않습니다.'));
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

  /* ---------- 장비 한 점 상세 — 장착 / 강화(+1~+5) / 분해 ---------- */
  function askConfirm(title, msg, okLabel, onOk) {
    const body = el('div', 'ex-unit');
    body.appendChild(el('div', 'u-note big', msg));
    const row = el('div', 'u-btns');
    const yes = el('button', 'ex-btn danger', okLabel);
    const no = el('button', 'ex-btn', '취소');
    yes.onclick = () => { const m2 = body.closest('.ex-modal'); if (m2) m2.remove(); onOk(); };
    no.onclick = () => { const m2 = body.closest('.ex-modal'); if (m2) m2.remove(); };
    row.appendChild(yes); row.appendChild(no); body.appendChild(row);
    return modal(title, body, { cls: 'res' });
  }
  function openGearItem(iid) {
    const it = gearItem(iid);
    if (!it || !treasureOf(it)) { toast('장비를 찾을 수 없어요'); return; }
    const body = el('div', 'ex-unit');
    const draw = () => {
      const t = treasureOf(it), nn = normItem(it), owner = equippedBy()[iid] || null;
      const slot = slotOf(t);
      body.innerHTML = '';
      const head = el('div', 'gv-top');
      head.appendChild(el('div', 'gv-ic', TYPE_ICON[t.type] || '💎'));
      head.appendChild(el('div', 'gv-n', '<b>' + esc(t.name) + (it.enh ? ' <em class="gv-enh">+' + it.enh + '</em>' : '') + '</b>' +
        '<small>' + SLOT_LABEL[slot] + ' · ' + esc(t.grade || '') + ' · ' + (nn ? nn.grade : '') + '급' + (owner ? ' · ' + esc(owner) + ' 장착 중' : ' · 미장착') + '</small>'));
      body.appendChild(head);
      body.appendChild(el('div', 'xt-fx big', nn ? nn.fx.map((f) => '<span>' + f.icon + ' ' + f.label + ' <b>+' + f.val + '%</b></span>').join('') : ''));
      if (it.enh) body.appendChild(el('div', 'u-note', '강화 +' + it.enh + ' — 기본 능력치 +' + (it.enh * 5) + '% 적용 중' + (it.enh >= ENH_MAX ? ' (최대)' : '')));

      const r1 = el('div', 'u-btns');
      if (owner) {
        const off = el('button', 'ex-btn', '장착 해제');
        off.onclick = () => { unequip(owner, slot); draw(); };
        r1.appendChild(off);
      } else {
        const on = el('button', 'ex-btn gold', '장착할 장수 고르기');
        on.onclick = () => { const mm = body.closest('.ex-modal'); if (mm) mm.remove(); pickUnitFor(iid); };
        r1.appendChild(on);
      }
      body.appendChild(r1);

      const c = enhCost(it);
      const r2 = el('div', 'u-btns');
      const up = el('button', 'ex-btn' + (it.enh >= ENH_MAX ? '' : ' gold'),
        it.enh >= ENH_MAX ? '강화 최대 (+' + ENH_MAX + ')' : '강화 +' + (it.enh + 1) + ' <small>' + STONE_NAME + ' ' + c.stone + ' · 🏅' + fmt(c.merit) + '</small>');
      up.onclick = () => {
        const r = enhanceItem(it);
        if (!r.ok) {
          sfx('deny');
          toast(r.why === 'max' ? '이미 최대 강화예요' : r.why === 'stone' ? STONE_NAME + '이 모자라요 (필요 ' + r.need + ')' : '공훈이 모자라요 (필요 🏅' + fmt(r.need) + ')');
          return;
        }
        sfx('levelup'); toast(t.name + ' 강화 +' + r.enh + '!'); draw();
        if (stage) { const v = $('.ex-merit', stage); if (v) v.textContent = '🏅 ' + fmt(readMerit()); }
      };
      r2.appendChild(up);
      body.appendChild(r2);

      const g = dismantleGain(it);
      const r3 = el('div', 'u-btns');
      const bd = el('button', 'ex-btn danger', '분해 <small>' + STONE_NAME + ' +' + g.stone + ' · 🏅 +' + g.merit + '</small>');
      bd.onclick = () => {
        if (owner) { sfx('deny'); toast('장착 중인 장비는 분해할 수 없어요'); return; }
        askConfirm('장비 분해', esc(t.name) + (it.enh ? ' +' + it.enh : '') + '을(를) 분해할까요?<br>' + STONE_NAME + ' +' + g.stone + ' · 🏅 +' + g.merit, '분해한다', () => {
          const r = dismantleItem(it);
          if (!r.ok) { sfx('deny'); toast(r.why === 'equipped' ? '장착 중인 장비는 분해할 수 없어요' : '분해하지 못했어요'); return; }
          sfx('coin'); toast(t.name + ' 분해 — ' + STONE_NAME + ' +' + r.stone + ' · 🏅 +' + r.merit);
          const mm = body.closest('.ex-modal'); if (mm) mm.remove();
          closeAllModals();
          openTreasure();
        });
      };
      r3.appendChild(bd);
      body.appendChild(r3);
      body.appendChild(el('div', 'u-note', STONE_NAME + ' ' + fmt(readStone()) + ' · 보유 공훈 🏅 ' + fmt(readMerit()) + '<br>강화는 장비 능력치를 +5%씩 올리고, 장착한 장수 전원의 전투에 바로 적용됩니다.'));
    };
    draw();
    modal('장비 상세', body, { cls: 'tall' });
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
      row.onclick = () => { if (equipItem(id, iid)) { closeAllModals(); openTreasure(); } };
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
      const t = treasureOf(it), n = normItem(it);
      const row = el('div', 'sx-gear' + (it.iid === cur ? ' on' : ''),
        '<span class="sx-gic">' + (TYPE_ICON[t.type] || '💎') + '</span>' +
        '<div class="sx-gmid"><b>' + esc(t.name) + (it.enh ? ' <em class="gv-enh">+' + it.enh + '</em>' : '') +
        ' <em class="sx-tg">' + (n ? n.grade : '') + '</em></b><small>' + (t.grade || '') + ' ' + SLOT_LABEL[slotOf(t)] + '</small>' + fxChips(n) + '</div>' +
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
  /* v6.3 — 병과별 공격 타임라인(초) · fire = 타격/발사가 일어나는 시점 비율 */
  const ACT = {
    melee: { len: 0.46, fire: 0.50 },
    ranged: { len: 0.58, fire: 0.62 },
    strategist: { len: 0.64, fire: 0.55 }
  };
  const FX_LIFE = {
    slash: 340, flash: 320, big: 480, bolt: 380, fire: 360, stun: 420, slow: 420,
    arc: 360, spark: 360, ring: 440, dust: 560, trail: 200, muzzle: 190, globe: 480, rune: 560
  };

  function mkUnit(team, d, st, x, y, idx) {
    const u = {
      team: team, idx: idx, id: d.id, name: d.name, cls: d.cls || 'melee', skill: d.skill || (team ? '맹공' : '필살기'),
      hp: Math.max(1, Math.round(st.hp)), max: Math.max(1, Math.round(st.hp)),
      atk: Math.max(1, Math.round(st.atk)), def: Math.max(0, Math.round(st.def)),
      x: x, y: y, cd: rnd(0.1, 0.6), gauge: 0, alive: true, boss: !!d.boss, hero: !!d.hero, tgt: null,
      gx: Math.floor((idx || 0) / 3), gy: (idx || 0) % 3,     // 3×3 칸 — 필살기 범위 판정
      stunT: 0, slowPct: 0, slowT: 0, burnDps: 0, burnT: 0, buffAtk: 0, buffT: 0, crit: 0, reduce: 0, aspd: 0,
      /* v6.3 모션 — 대기 위상차 · 걸음 위상 · 먼지 카운터 · 넉백 스프링 */
      mo: { seed: rnd(0, 6.283), step: rnd(0, 6.283), dustN: 0, kbx: 0, kby: 0 },
      face: team ? -1 : 1, act: null, dash: null
    };
    const e = el('div', 'bt-u t' + team + (u.boss ? ' boss' : ''));
    const sh = el('div', 'bt-shd');          // 발밑 그림자 — 스프라이트가 떠도 땅에 남는다
    const sp = el('div', 'bt-sp');           // 방향 전환(scaleX)만 — 머리 위 HP 배지는 뒤집히지 않는다
    const mo = el('div', 'bt-mo');           // 호흡·걸음 바운스·공격 모션 (매 프레임 보간)
    const im = new Image(); im.src = (team && !u.hero) ? enemySrc(d.job) : chibiSrc(d); im.draggable = false;
    im.onerror = () => { im.remove(); e.classList.add('noimg'); e.dataset.ch = (d.name || '?')[0]; };
    mo.appendChild(im);
    sp.appendChild(mo);
    e.appendChild(sh); e.appendChild(sp);
    e.appendChild(el('div', 'bt-hp', '<i></i>'));
    u.el = e; u.spEl = sp; u.moEl = mo; u.imgEl = im;
    u.spEl.style.transform = 'scaleX(' + u.face + ')';
    u.hpEl = $('.bt-hp i', e); B.field.appendChild(e);
    place(u);
    return u;
  }
  function place(u) {
    if (B && B.quiet) return;                       // fastForward 중에는 그리지 않는다
    const m = u.mo || { kbx: 0, kby: 0 };
    u.el.style.transform = 'translate(' + (u.x - UNIT_W / 2 + m.kbx).toFixed(1) + 'px,' + (u.y - UNIT_W + m.kby).toFixed(1) + 'px)';
    u.el.style.zIndex = Math.round(u.y);
  }

  /* ── v6.3 모션 ─────────────────────────────────────────────────
     스프라이트는 세 겹으로 나눈다.
       .bt-u   월드 좌표(이동) + 넉백 오프셋
       .bt-sp  좌우 반전(scaleX) — HP·이름 배지는 이 밖에 있어 뒤집히지 않는다
       .bt-mo  호흡·걸음 바운스·공격 와인드업/돌진/복귀·기울기 (매 프레임 보간)
     dt 는 배속이 반영된 값이라 1×/2×/3× 어디서든 모션과 전투가 같은 비율로 흐른다. */
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  function setFace(u, f) {
    if (f === u.face) return;
    u.face = f;
    if (u.spEl) u.spEl.style.transform = 'scaleX(' + f + ')';
  }
  function setPose(u, ox, oy, rot, sc) {
    if (!u.moEl) return;
    u.moEl.style.transform = 'translate3d(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px,0) rotate(' +
      rot.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
  }
  function poseIdle(u) {
    const br = Math.sin((B ? B.clock : 0) * 2.3 + u.mo.seed);
    setPose(u, 0, br * 1.7, br * 0.5, 1 + br * 0.008);
  }
  function poseWalk(u, dt) {
    const m = u.mo;
    m.step += dt * 11;
    const s = Math.sin(m.step), a = Math.abs(s);
    const n = Math.floor(m.step / Math.PI);
    if (n !== m.dustN) {
      m.dustN = n;
      /* 발밑 흙먼지 — 걸음마다 한 줌, 조금 늦게 두 번째 줌이 흩날린다 */
      dustFx(u.x - u.face * 8, u.y - 1, -u.face, u.boss);
      dustFx(u.x - u.face * 3, u.y - 3, -u.face * 0.35, false);
    }
    setPose(u, s * 1.2, -a * 3.6, 3.2 + s * 0.9, 1 + (0.5 - a) * 0.05);
  }
  function poseStun(u) {
    setPose(u, 0, 1.2, 7 * Math.sin((B ? B.clock : 0) * 5 + u.mo.seed), 1);
  }
  function poseAct(u, p) {
    const k = u.act.kind;
    if (k === 'melee') {
      /* ① 뒤로 젖히는 예비 동작 → ② 대상 쪽으로 돌진 베기 → ③ 부드러운 복귀 */
      const w = 0.36, s = 0.58;
      let ox, rot, sc = 1;
      if (p < w) { const e = easeOut(p / w); ox = -7 * e; rot = -11 * e; }
      else if (p < s) { const q = (p - w) / (s - w); ox = -7 + 31 * easeOut(q); rot = -11 + 27 * q; sc = 1 + 0.09 * Math.sin(q * Math.PI); }
      else { const e = easeOut(clamp((p - s) / (1 - s), 0, 1)); ox = 24 * (1 - e); rot = 16 * (1 - e); }
      setPose(u, ox, -Math.abs(ox) * 0.08, rot, sc);
    } else if (k === 'ranged') {
      /* 활 당기기(뒤로 젖힘) → 발사 반동 → 복귀 */
      let ox, rot;
      if (p < 0.62) { const e = easeOut(p / 0.62); ox = -10 * e; rot = -8 * e; }
      else { const q = (p - 0.62) / 0.38; ox = -10 + 22 * Math.exp(-q * 7); rot = -8 * (1 - q); }
      setPose(u, ox, -Math.abs(ox) * 0.06, rot, 1);
    } else {
      /* 책사 — 살짝 떠오르며 시전 → 착지 */
      let oy, rot, sc;
      if (p < 0.55) { const e = easeOut(p / 0.55); oy = -10 * e; rot = -2.5 * e; sc = 1 + 0.03 * e; }
      else { const e = easeOut(clamp((p - 0.55) / 0.45, 0, 1)); oy = -10 * (1 - e); rot = -2.5 * (1 - e); sc = 1; }
      setPose(u, 0, oy, rot, sc);
    }
  }
  function poseDash(u) {
    setPose(u, 0, -2, 17, 1.06);
  }

  /* ── 적 난이도 (v6.2) ───────────────────────────────────────
     원정단은 레벨·별로 전투력이 지수적으로 오르므로, 관문마다 "기대 전투력"을 두고
     적 편성의 HP·공격을 그 목표에 맞춰 늘였다 줄인다. 그래서 막이 바뀌어도 난이도가 일정하다.
       · 일반 관문 = 기대 전투력 × 0.98 (내 원정단 ×0.98을 넘지 않는다)
       · 보스 관문 = 기대 전투력 × 1.18 (내 원정단 ×1.12을 넘지 않는다 → 한 관문에 막히지 않게)
       · 보스 토벌전 = 그 관문 기대 전투력 × 1.05 (강화·성장을 요구하는 도전 모드) */
  function expectedPartyPower(n) { return 2900 * Math.pow(1.077, clamp(n, 1, MAX_ACT) - 1); }
  const STAGE_FOE_RATE = 0.98, BOSS_FOE_RATE = 1.18, RUSH_FOE_RATE = 1.05;
  let TUNE_POWER_MULT = 1;              // 점검용 — 목표 전투력 배율

  /* 편성 목록(groups) → 전투 유닛 (목표 전투력에 맞춰 HP·공격 배율을 정한다) */
  function unitsFrom(groups, targetPower) {
    const list = [];
    (groups || []).forEach((gr) => { for (let i = 0; i < (gr.c || 1); i++) list.push(gr); });
    const seen = {};
    const out = list.slice(0, 6).map((gr, i) => {
      seen[gr.name] = (seen[gr.name] || 0) + 1;
      const cnt = list.filter((x) => x === gr).length;
      const nm = gr.boss ? gr.name : (cnt > 1 ? gr.name + ' ' + seen[gr.name] : gr.name);
      const sc = gr.scale || 1;
      const L = (gr.L || 30) * sc, W = (gr.W || 30) * sc, I = (gr.I || 10) * sc;
      return {
        id: 'e' + i + '_' + nm, name: nm, cls: clsOf(gr.job), job: gr.job, boss: !!gr.boss,
        skill: gr.boss ? '황천의 술법' : '맹공',
        hp0: (L * 10 + W * 6) * (gr.boss ? 1.75 : 0.9),
        atk0: (W * 1.1 + I * 0.35 + L * 0.3) * (gr.boss ? 1.05 : 0.85),
        def0: (L * 0.5 + W * 0.15) * (gr.boss ? 0.95 : 0.8)
      };
    });
    const defSum = out.reduce((s, u) => s + u.def0 * 2, 0);
    const liveSum = out.reduce((s, u) => s + u.atk0 * 3 + u.hp0 * 0.3, 0) || 1;
    const k = clamp((Number(targetPower) - defSum) / liveSum, 0.25, 4.5);
    return out.map((u) => ({
      id: u.id, name: u.name, cls: u.cls, job: u.job, boss: u.boss, skill: u.skill,
      hp: Math.max(40, Math.round(u.hp0 * k)), atk: Math.max(4, Math.round(u.atk0 * k)), def: Math.max(0, Math.round(u.def0))
    }));
  }
  function buildEnemies(n) {
    const sd = STAGE_DEFS[n - 1] || {};
    const mine = power(S ? S.squad : []);
    const base = expectedPartyPower(n) * TUNE_POWER_MULT;
    /* 목표 전투력은 곡선을 따르되 내 원정단보다 크게 앞서지 않는다 — 성장이 느린 사람이
       한 관문에 막히지 않고, 곡선보다 강한 사람에게는 같이 올라가는 구조 */
    const target = sd.boss ? Math.min(base * BOSS_FOE_RATE, Math.max(600, mine * 1.12))
      : Math.min(base * STAGE_FOE_RATE, Math.max(400, mine * 0.98));
    return unitsFrom(sd.groups, target);
  }

  /* 랭킹전 상대 덱 — 실제 본편 장수 5명을 목표 전투력에 맞춰 늘여 만든다 */
  function deckUnits(names, targetPower) {
    const arr = (names || []).map((nm) => {
      const d = def(nm), b = baseStats(d);
      return { d: d, atk0: (b.W * 1.1 + b.I * 0.35 + b.L * 0.3) || 1, def0: (b.L * 0.5 + b.W * 0.15) || 1, hp0: (b.L * 10 + b.W * 6) || 10 };
    });
    const raw = arr.reduce((s, u) => s + u.atk0 * 3 + u.def0 * 2 + u.hp0 * 0.3, 0) || 1;
    const k = Math.max(0.2, Number(targetPower) / raw);
    return arr.map((u) => ({
      id: u.d.id, name: u.d.name, job: u.d.job, cls: u.d.cls, hero: true, boss: false,
      hp: Math.max(60, Math.round(u.hp0 * k)), atk: Math.max(6, Math.round(u.atk0 * k)), def: Math.max(0, Math.round(u.def0 * k))
    }));
  }

  function startBattle(n) {
    const k = clamp(Math.round(n) || 1, 1, MAX_ACT);
    const sd = STAGE_DEFS[k - 1];
    const st = (sd && sd.story) || {};
    startArena({ mode: 'stage', n: k, sd: sd, title: '⚔️ ' + k + '관문 돌입!', story: st.enter || '',
      storyTitle: k + '관문 · ' + ((sd && sd.name) || ''),
      foeLabel: k + '관문 · 적군', foes: buildEnemies(k), meta: {} });
  }
  function startRankBattle(pos) {
    const idx = clamp(Math.round(pos) || 1, 1, LADDER.length) - 1;
    const e = LADDER[idx];
    if (!e) return;
    startArena({ mode: 'rank', n: 0, sd: null, title: '🏆 랭킹전 — ' + e.name + '에게 도전!',
      foeLabel: (idx + 1) + '위 ' + e.name, foes: deckUnits(e.deck, rankTargetPower(idx + 1)),
      meta: { idx: idx, name: e.name } });
  }
  function startBossBattle(id) {
    const b = bossRushOf(id);
    if (!b) return;
    if (maxCleared() < b.stage) { toast(b.stage + '관문을 먼저 클리어해야 해요'); return; }
    startArena({ mode: 'boss', n: 0, sd: null, title: '👑 보스 토벌 — ' + b.name + '!',
      foeLabel: '보스 · ' + b.id, foes: unitsFrom(b.groups, expectedPartyPower(b.stage) * RUSH_FOE_RATE * TUNE_POWER_MULT), meta: { boss: b.id } });
  }

  /* 전투 공통 무대 — 모드(stage/rank/boss)에 따라 보상만 finish 가 가른다 */
  function startArena(cfg) {
    stopBattle();
    if (!root) open();
    const ids = S.squad.slice(0, MAX_SQUAD).filter((id) => S.owned[id]);
    if (!ids.length) { toast('출진할 장수가 없어요'); return; }
    const g = sumSyn(synergies(ids));
    const arenaTime = clamp(Math.round(Number(cfg.time) || ARENA_TIME), 20, 180);
    stage.innerHTML = '';
    const bt = el('div', 'bt');
    bt.appendChild(el('div', 'bt-bg'));
    bt.appendChild(el('div', 'bt-hud',
      '<div class="bt-side"><div class="bt-bar a"><i></i></div><small>아군 ' + ids.length + '명</small></div>' +
      '<div class="bt-time">' + arenaTime + '</div>' +
      '<div class="bt-side r"><div class="bt-bar e"><i></i></div><small>' + esc(cfg.foeLabel || '적군') + '</small></div>'));
    const field = el('div', 'bt-field'); bt.appendChild(field);
    const ctl = el('div', 'bt-ctl', '<button class="spd">1× 배속</button><button class="pause">⏸</button><button class="auto on">⚡ 자동스킬 ON</button><button class="out">도주</button>');
    bt.appendChild(ctl);
    bt.appendChild(el('div', 'bt-cards'));
    if (cfg.mode !== 'stage') bt.classList.add('mode-' + cfg.mode);
    /* 주간 보스전 — 누적 피해를 전장 위에 실시간으로 보여 준다 */
    if (cfg.mode === 'weekly') bt.appendChild(el('div', 'bt-week', '👹 주간 보스 · 누적 피해 <b>0</b>'));
    stage.appendChild(bt);

    B = { n: cfg.n || 0, sd: cfg.sd, mode: cfg.mode || 'stage', meta: cfg.meta || {},
      field: field, root: bt, units: [], proj: [], speed: 1, auto: true, time: arenaTime, end: false, raf: 0,
      last: performance.now(), clock: 0, timers: [], paused: false, shakeLv: 0, shakeUntil: 0, quiet: false,
      dmg: 0, weekEl: $('.bt-week', bt), gim: cfg.gim || null };

    ids.forEach((id, i) => {
      const k = i - (ids.length - 1) / 2;
      const u = mkUnit(0, Object.assign({}, def(id), { id: id }), stat(id, g), 118 + k * 40, 600 + k * 40, i);
      applyEquipToUnit(u, equipBonus(id));      // 치명타·피해감소·공격속도·초기 게이지
      B.units.push(u);
    });
    const en = cfg.foes || [];
    en.forEach((e, i) => {
      const k = i - (en.length - 1) / 2;
      B.units.push(mkUnit(1, e, { hp: e.hp, atk: e.atk, def: e.def }, 272 + k * 36, 250 + k * 36, i));
    });
    /* 기믹 — 표기한 수치만큼만 (아군 공격·적 공격속도) */
    const gim = cfg.gim || {};
    if (gim.allyAtk) B.units.forEach((u) => { if (u.team === 0) u.atk = Math.max(1, Math.round(u.atk * (1 + gim.allyAtk))); });
    if (gim.enemyAspd) B.units.forEach((u) => { if (u.team === 1) u.aspd = (u.aspd || 0) + gim.enemyAspd; });

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

    const spd = $('.spd', ctl), auto = $('.auto', ctl), pause = $('.pause', ctl);
    spd.onclick = () => { if (!B) return; B.speed = B.speed % 3 + 1; spd.textContent = B.speed + '× 배속'; spd.classList.toggle('hot', B.speed > 1); };
    /* 일시정지 — 루프·모션·이펙트가 함께 멈추고, 재개하면 그 자리에서 이어진다 */
    pause.onclick = () => {
      if (!B) return;
      B.paused = !B.paused;
      pause.textContent = B.paused ? '▶' : '⏸';
      pause.classList.toggle('on', B.paused);
      bt.classList.toggle('paused', B.paused);
      B.last = performance.now();
    };
    auto.onclick = () => { if (!B) return; B.auto = !B.auto; auto.textContent = '⚡ 자동스킬 ' + (B.auto ? 'ON' : 'OFF'); auto.classList.toggle('on', B.auto); };
    $('.out', ctl).onclick = () => finish(false, true);

    banner(cfg.title || '⚔️ 전투 시작!');
    /* v7.1 — 관문 입장 한 줄 시나리오 (4.6초 뒤 스스로 물러난다 · 전투는 그대로 진행) */
    if (cfg.story) storyCard(cfg.storyTitle, cfg.story);
    B.last = performance.now();
    B.raf = requestAnimationFrame(frame);
  }
  function stopBattle() {
    if (!B) return;
    const b = B;
    B = null;
    b.end = true;
    try { cancelAnimationFrame(b.raf); } catch (e) { /* ignore */ }
    /* 배속·일시정지·종료 어느 쪽에서 끝나도 타이머와 잔여 이펙트 DOM 이 남지 않는다 */
    if (b.timers) b.timers.forEach((id) => { try { clearTimeout(id); } catch (e) { /* ignore */ } });
    b.timers = [];
    [b.field, b.root].forEach((host) => {
      if (!host) return;
      try {
        host.querySelectorAll('.bt-fx,.bt-pop,.bt-proj,.bt-ghost,.bt-banner,.ex-cutin').forEach((n) => {
          try { n.remove(); } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }
    });
  }
  /* 전투 한정 타이머 — stopBattle/finish 에서 한 번에 지운다 */
  function bTimer(ms, fn) {
    if (!B) return 0;
    const id = setTimeout(function () {
      if (B && B.timers) { const i = B.timers.indexOf(id); if (i >= 0) B.timers.splice(i, 1); }
      try { fn(); } catch (e) { /* ignore */ }
    }, Math.max(0, ms));
    B.timers.push(id);
    return id;
  }
  function frame(t) {
    if (!B || B.end) return;
    const raw = Math.min(0.05, (t - B.last) / 1000);
    B.last = t;
    if (!B.paused) tick(raw * B.speed);
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
    B.clock = (B.clock || 0) + dt;
    for (let i = 0; i < B.units.length; i++) stepUnit(B.units[i], dt);
    separate();
    projectiles(dt);
    B.units.forEach((u) => { if (u.alive) place(u); });
    hud();
    if (!aliveOf(1).length) finish(true);
    else if (!aliveOf(0).length || B.time <= 0) finish(false);
  }
  /* 유닛 한 명의 한 프레임 — 상태이상 → 기절 → 돌진/공격 타임라인 → 이동/대기 */
  function stepUnit(u, dt) {
    if (!u.alive) return;
    const m = u.mo;
    /* 버프·감속·화상 시계 — 기절 중에도 화상은 탄다 */
    if (u.buffT > 0) { u.buffT -= dt; if (u.buffT <= 0) { u.buffT = 0; u.buffAtk = 0; u.el.classList.remove('buffed'); } }
    if (u.slowT > 0) { u.slowT -= dt; if (u.slowT <= 0) { u.slowT = 0; u.slowPct = 0; } }
    if (u.burnT > 0) {
      u.burnT -= dt;
      const bd = Math.max(1, Math.round((u.burnDps || 0) * dt));
      u.hp -= bd;
      if (B && B.mode === 'weekly' && u.team === 1) B.dmg = (B.dmg || 0) + bd;
      u.burnAcc = (u.burnAcc || 0) + dt;
      if (u.burnAcc >= 0.5) {
        u.burnAcc = 0;
        u.el.classList.add('burn');
        bTimer(180, function () { if (u.el) u.el.classList.remove('burn'); });
        fxAt(u.x, u.y - 26, 'fire');
      }
      if (u.hp <= 0) { die(u); return; }
      if (u.burnT <= 0) { u.burnT = 0; u.burnDps = 0; }
    }
    /* 피격 넉백 — 밀린 자리에서 스프링처럼 돌아온다 */
    if (m.kbx || m.kby) {
      const k = Math.exp(-dt * 12);
      m.kbx *= k; m.kby *= k;
      if (Math.abs(m.kbx) < 0.4) m.kbx = 0;
      if (Math.abs(m.kby) < 0.4) m.kby = 0;
    }
    if (u.stunT > 0) {
      u.stunT -= dt;
      if (u.stunT > 0) { poseStun(u); return; }
      u.stunT = 0; u.el.classList.remove('stun');
    }
    u.cd -= dt;
    if (u.dash) { stepDash(u, dt); return; }
    if (u.act) { stepAct(u, dt); return; }
    if (u.gauge >= 100 && (u.team === 1 || B.auto)) {
      cast(u);
      if (!u.alive) return;
      if (u.dash) { stepDash(u, dt); return; }
    }
    if (!u.tgt || !u.tgt.alive) u.tgt = nearest(u);
    const t = u.tgt;
    if (!t) { poseIdle(u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, dist = Math.hypot(dx, dy) || 1, rg = RANGE[u.cls] || 46;
    if (Math.abs(dx) > 4) setFace(u, dx >= 0 ? 1 : -1);
    if (dist > rg) {
      /* 걸음 리듬에 맞춰 속도가 아주 조금 오르내린다 — 미끄러지는 느낌 제거 */
      const gait = 0.74 + 0.42 * Math.abs(Math.sin(m.step));
      const sp = (SPEED[u.cls] || 100) * (u.cls === 'melee' && dist > 120 ? 1.5 : 1) * (1 - (u.slowPct || 0)) * gait * dt;
      u.x += dx / dist * sp; u.y += dy / dist * sp;
      poseWalk(u, dt);
    } else if (u.cd <= 0) {
      beginAct(u, t);
      poseAct(u, 0);
    } else {
      poseIdle(u);
    }
  }
  function beginAct(u, t) {
    const kind = u.cls === 'melee' ? 'melee' : (u.cls === 'strategist' ? 'strategist' : 'ranged');
    const cfg = ACT[kind];
    u.act = { kind: kind, t: 0, len: cfg.len, fire: cfg.fire, fired: false, tgt: t };
    u.cd = (ASPD[u.cls] || 1) / (1 + (u.aspd || 0)) * (1 + (u.slowPct || 0));
    if (Math.abs(t.x - u.x) > 4) setFace(u, t.x >= u.x ? 1 : -1);
    if (kind === 'strategist') fxAt(u.x, u.y - 4, 'rune');
  }
  function stepAct(u, dt) {
    const a = u.act;
    a.t += dt;
    const p = a.t / a.len;
    if (!a.fired && p >= a.fire) { a.fired = true; fireAct(u, a); if (!u.alive) return; }
    if (p >= 1) { u.act = null; poseIdle(u); return; }
    poseAct(u, p);
  }
  function fireAct(u, a) {
    let t = a.tgt;
    if (!t || !t.alive) { t = nearest(u); a.tgt = t; }
    if (!t) return;
    if (a.kind === 'melee') {
      const ang = Math.atan2(t.y - u.y, t.x - u.x);
      arcFx(u.x + Math.cos(ang) * 32, u.y - 30 + Math.sin(ang) * 18, ang, false);
      hit(u, t, 1, 'slash');
    } else if (a.kind === 'ranged') {
      fxAt(u.x + u.face * 16, u.y - 34, 'muzzle');
      shoot(u, t, 1, 'arrow', 0);
    } else {
      fxAt(u.x, u.y - 42, 'globe');
      shoot(u, t, 1, 'orb', 0);
    }
    u.gauge = Math.min(100, u.gauge + 12);
  }
  /* 필살기 돌진 — 순간이동 대신 잔상을 남기며 미끄러진다 */
  function startDash(a, b) {
    if (!a || !a.alive || !a.el || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const stand = Math.max(26, (RANGE[a.cls] || 46) * 0.72);
    const len = Math.max(0, d - stand);
    a.act = null;
    setFace(a, dx >= 0 ? 1 : -1);
    a.dash = { x0: a.x, y0: a.y, x1: a.x + dx / d * len, y1: a.y + dy / d * len,
      t: 0, len: clamp(0.16 + len / 900, 0.16, 0.34), gt: 0 };
  }
  function stepDash(u, dt) {
    const d = u.dash;
    d.t += dt;
    const p = clamp(d.t / d.len, 0, 1), e = easeOut(p);
    u.x = d.x0 + (d.x1 - d.x0) * e;
    u.y = d.y0 + (d.y1 - d.y0) * e;
    d.gt -= dt;
    if (d.gt <= 0) { d.gt = 0.05; ghost(u); }
    poseDash(u);
    if (p >= 1) { u.dash = null; ghost(u); }
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
    if (B && B.mode === 'weekly' && s.team === 0 && t.team === 1) B.dmg = (B.dmg || 0) + dmg;
    s.gauge = Math.min(100, s.gauge + 4);
    t.gauge = Math.min(100, t.gauge + 7);
    /* 피격 넉백 — 공격자 반대 방향으로 살짝 밀렸다가 부드럽게 복귀 */
    const ang = Math.atan2(t.y - s.y, t.x - s.x) || 0;
    const kb = Math.min(14, (r.crit ? 11 : 6.5) * (s.boss ? 1.25 : 1));
    if (t.mo) {
      t.mo.kbx = clamp(t.mo.kbx + Math.cos(ang) * kb, -16, 16);
      t.mo.kby = clamp(t.mo.kby + Math.sin(ang) * kb * 0.7, -14, 14);
    }
    flashUnit(t, r.crit);
    fxAt(t.x, t.y - 28, fx || 'slash');
    if (r.crit) { sparkFx(t.x, t.y - 34, 1); shake(1); }
    pop(t.x, t.y - 50, (r.crit ? '✦' : '') + dmg, (s.team === 0 ? '' : ' foe') + (r.crit ? ' crit' : ''));
    if (t.hp <= 0) die(t);
    return dmg;
  }
  /* 흰/붉은 히트 플래시 — 같은 대상 연타에도 매번 다시 터진다 */
  function flashUnit(t, crit) {
    if (!t.el) return;
    t.el.classList.remove('hit', 'hitcrit');
    void t.el.offsetWidth;
    t.el.classList.add(crit ? 'hitcrit' : 'hit');
    bTimer(crit ? 210 : 150, function () { if (t.el) t.el.classList.remove('hit', 'hitcrit'); });
  }
  function die(u) {
    u.alive = false; u.hp = 0; u.act = null; u.dash = null;
    if (u.el) {
      u.el.classList.remove('hit', 'hitcrit');
      u.el.classList.add('dying');
      if (u.moEl) u.moEl.style.setProperty('--fall', '-76deg');
      bTimer(620, function () { if (u.el) u.el.classList.add('dead'); });
      bTimer(700, function () { if (u.el) u.el.style.display = 'none'; });
    }
    if (u.card) u.card.classList.add('dead');
  }

  /* ── v6.3 이펙트 — 모두 bt 필드 안에서만 살고, 전투가 끝나면 함께 사라진다 ── */
  function fxNode(cls, x, y) {
    if (!B || B.quiet) return null;
    const f = el('div', 'bt-fx ' + cls);
    f.style.left = x.toFixed(1) + 'px'; f.style.top = y.toFixed(1) + 'px';
    B.field.appendChild(f);
    return f;
  }
  function fxAt(x, y, kind) {
    const f = fxNode(kind, x, y);
    if (!f) return;
    bTimer(FX_LIFE[kind] || 460, function () { try { f.remove(); } catch (e) { /* ignore */ } });
  }
  /* 회전 반달 칼바람 궤적 */
  function arcFx(x, y, ang, big) {
    const f = fxNode('arc' + (big ? ' big' : ''), x, y);
    if (!f) return;
    f.style.setProperty('--a', Math.round(ang * 180 / Math.PI) + 'deg');
    bTimer(380, function () { try { f.remove(); } catch (e) { /* ignore */ } });
  }
  function sparkFx(x, y, lv) {
    const f = fxNode('spark' + (lv > 1 ? ' big' : ''), x, y);
    if (!f) return;
    bTimer(380, function () { try { f.remove(); } catch (e) { /* ignore */ } });
  }
  function ringFx(x, y, lv) {
    const f = fxNode('ring' + (lv > 1 ? ' big' : ''), x, y);
    if (!f) return;
    bTimer(460, function () { try { f.remove(); } catch (e) { /* ignore */ } });
  }
  function dustFx(x, y, dirX, boss) {
    if (!B || B.quiet) return;
    const f = fxNode('dust' + (boss ? ' big' : ''), x + rnd(-4, 4), y + rnd(-2, 2));
    if (!f) return;
    f.style.setProperty('--dx', (dirX * rnd(6, 15)).toFixed(0) + 'px');
    f.style.setProperty('--dy', (-rnd(2, 7)).toFixed(0) + 'px');
    bTimer(580, function () { try { f.remove(); } catch (e) { /* ignore */ } });
  }
  function trailFx(x, y, kind) {
    const f = fxNode('trail ' + kind, x, y);
    if (!f) return;
    bTimer(210, function () { try { f.remove(); } catch (e) { /* ignore */ } });
  }
  function ghost(u) {
    if (!B || B.quiet || !u.imgEl) return;
    const s = u.imgEl.getAttribute('src');
    if (!s) return;
    const g = el('div', 'bt-ghost');
    const w = u.boss ? 68 : UNIT_W;
    g.style.width = w + 'px'; g.style.height = w + 'px';
    g.style.backgroundImage = 'url("' + s + '")';
    g.style.transform = 'translate(' + (u.x - UNIT_W / 2 + (u.boss ? -5 : 0)).toFixed(1) + 'px,' +
      (u.y - UNIT_W + (u.boss ? -10 : 0)).toFixed(1) + 'px) scaleX(' + u.face + ')';
    g.style.zIndex = Math.round(u.y - 1);
    B.field.appendChild(g);
    bTimer(300, function () { try { g.remove(); } catch (e) { /* ignore */ } });
  }
  /* 전장 화면 흔들림 — 크리티컬은 1, 필살기/보스는 2 */
  function shake(lv) {
    if (!B || B.quiet || !B.field) return;
    const now = B.clock || 0;
    if (B.shakeUntil > now && B.shakeLv >= lv) return;
    B.shakeLv = lv; B.shakeUntil = now + (lv > 1 ? 0.34 : 0.22);
    const f = B.field;
    f.classList.remove('sh1', 'sh2');
    void f.offsetWidth;
    f.classList.add(lv > 1 ? 'sh2' : 'sh1');
    bTimer(lv > 1 ? 370 : 250, function () { try { f.classList.remove('sh1', 'sh2'); } catch (e) { /* ignore */ } });
  }
  function shoot(s, t, m, kind, delay) {
    B.proj.push({ s: s, t: t, m: m, kind: kind, x: s.x + (s.face || 1) * 12, y: s.y - 34, delay: delay || 0, el: null, tt: 0 });
  }
  function projectiles(dt) {
    B.proj = B.proj.filter((p) => {
      if (p.delay > 0) { p.delay -= dt; return true; }
      if (!p.el) { p.el = el('div', 'bt-proj ' + p.kind); B.field.appendChild(p.el); }
      if (!p.t.alive) { const n = nearest(p.s); if (n) p.t = n; else { try { p.el.remove(); } catch (e) { /* ignore */ } return false; } }
      const dx = p.t.x - p.x, dy = p.t.y - 30 - p.y, d = Math.hypot(dx, dy) || 1, sp = 420 * dt;
      if (d <= sp + 8) {
        try { p.el.remove(); } catch (e) { /* ignore */ }
        fxAt(p.t.x, p.t.y - 30, p.kind === 'orb' ? 'flash' : 'muzzle');
        hit(p.s, p.t, p.m, p.kind === 'orb' ? 'flash' : 'slash');
        return false;
      }
      p.x += dx / d * sp; p.y += dy / d * sp;
      const ang = Math.atan2(dy, dx);
      p.el.style.transform = 'translate(' + (p.x - 8).toFixed(1) + 'px,' + (p.y - 8).toFixed(1) + 'px) rotate(' + ang + 'rad)';
      p.el.style.zIndex = 9999;
      /* 화살 꼬리 잔상 / 마법탄 잔광 */
      p.tt -= dt;
      if (p.tt <= 0) { p.tt = p.kind === 'orb' ? 0.055 : 0.04; trailFx(p.x, p.y, p.kind); }
      return true;
    });
  }
  /* 필살기 효과 → 엔진 (기절·감속·화상·치유·버프·돌진) */
  const SKILL_H = {
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    dmg: (src, t, mult) => hit(src, t, mult, 'big'),
    dash: (a, b) => { startDash(a, b); },
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
    u.act = null;
    const foes = aliveOf(u.team ? 0 : 1);
    if (!foes.length) return;
    u.el.classList.add('cast');
    bTimer(460, function () { if (u.el) u.el.classList.remove('cast'); });
    const near = () => foes.slice().sort((a, b) => SKILL_H.dist(u, a) - SKILL_H.dist(u, b))[0];
    if (!u.team) {
      /* 아군 — 장수별 필살기를 3×3 범위·효과 그대로 실행 */
      const s = u.skillDef || (u.skillDef = skillOf(u));
      showCutin(u, s);
      shake(2);                       // 필살기는 전장이 크게 흔들린다
      fxAt(u.x, u.y - 4, 'rune');
      ringFx(u.x, u.y - 26, 2);
      if (s.type === 'charge' || s.type === 'sweep') {
        const m0 = near();
        if (m0) { startDash(u, m0); arcFx(m0.x, m0.y - 30, Math.atan2(m0.y - u.y, m0.x - u.x), true); }
      }
      runSkill(s, u, { foes: foes, allies: aliveOf(0), H: SKILL_H });
      if (u.card) u.card.classList.remove('ready');
      return;
    }
    if (u.team && u.hero) {
      /* 랭킹전 랭커 — 실제 장수의 필살기를 그대로 쓴다 (적 팀 → 아군에게) */
      const s = u.skillDef || (u.skillDef = skillOf({ name: u.id, cls: u.cls, job: u.job }));
      banner(u.name + ' · ' + s.name, u.team);
      shake(2);
      if (s.type === 'charge' || s.type === 'sweep') { const m0 = near(); if (m0) startDash(u, m0); }
      runSkill(s, u, { foes: foes, allies: aliveOf(1), H: SKILL_H });
      if (u.card) u.card.classList.remove('ready');
      return;
    }
    banner(u.name + ' · ' + u.skill, u.team);
    if (u.cls === 'melee') {
      const c = (u.tgt && u.tgt.alive) ? u.tgt : foes[0];
      const ang = Math.atan2(c.y - u.y, c.x - u.x);
      startDash(u, c);
      arcFx(c.x, c.y - 28, ang, true);
      sparkFx(c.x, c.y - 26, 2);
      fxAt(c.x, c.y - 20, 'big');
      shake(2);
      foes.forEach((f) => { if (Math.hypot(f.x - c.x, f.y - c.y) < 120) hit(u, f, 2.0, 'slash'); });
    } else if (u.cls === 'ranged') {
      for (let i = 0; i < 4; i++) shoot(u, foes[Math.floor(Math.random() * foes.length)], 1.25, 'arrow', i * 0.12);
    } else {
      foes.forEach((f) => { fxAt(f.x, f.y - 30, 'bolt'); hit(u, f, 0.85, 'flash'); });
      shake(1);
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
    bTimer(1000, function () { try { c.remove(); } catch (e) { /* ignore */ } });
  }
  function pop(x, y, txt, cls) {
    if (!B || B.quiet) return;
    const p = el('div', 'bt-pop' + (cls || ''), String(txt));
    p.style.left = (x + rnd(-8, 8)) + 'px'; p.style.top = y + 'px'; B.field.appendChild(p);
    bTimer(820, function () { try { p.remove(); } catch (e) { /* ignore */ } });
  }
  function banner(txt, team) {
    if (!B) return;
    const b = el('div', 'bt-banner' + (team ? ' foe' : ''), txt);
    B.root.appendChild(b);
    bTimer(1180, function () { try { b.remove(); } catch (e) { /* ignore */ } });
  }
  /* v7.1 — 관문 입장 시나리오 띠 — 이름과 한 줄 대사를 목판 띠로 띄운다 */
  function storyCard(title, txt) {
    if (!B || !txt) return null;
    const c = el('div', 'bt-story',
      (title ? '<b>' + esc(title) + '</b>' : '') + '<p>' + esc(txt) + '</p>');
    B.root.appendChild(c);
    bTimer(4600, function () { try { c.classList.add('out'); } catch (e) { /* ignore */ } });
    bTimer(5400, function () { try { c.remove(); } catch (e) { /* ignore */ } });
    return c;
  }
  function hud() {
    const A = B.units.filter((u) => u.team === 0), E = B.units.filter((u) => u.team === 1);    const ratio = (L) => {
      const m = L.reduce((s, u) => s + u.max, 0), h = L.reduce((s, u) => s + Math.max(0, u.hp), 0);
      return m ? h / m * 100 : 0;
    };
    const ba = $('.bt-bar.a i', B.root), be = $('.bt-bar.e i', B.root);
    if (ba) ba.style.width = ratio(A) + '%';
    if (be) be.style.width = ratio(E) + '%';
    const tm = $('.bt-time', B.root);
    if (tm) tm.textContent = Math.max(0, Math.ceil(B.time));
    if (B.weekEl) { const d = $('b', B.weekEl); if (d) d.textContent = fmt(B.dmg || 0); }
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
    /* 전투 잔여 이펙트·타이머 정리 — 결과 창 뒤에 남지 않는다 */
    try { B.timers.forEach((id) => clearTimeout(id)); } catch (e) { /* ignore */ }
    B.timers = [];
    [B.field, B.root].forEach((host) => {
      if (!host) return;
      try { host.querySelectorAll('.bt-fx,.bt-pop,.bt-proj,.bt-ghost,.bt-banner,.ex-cutin').forEach((n) => n.remove()); } catch (e) { /* ignore */ }
    });
    const mode = B.mode || 'stage';
    const n = B.n || 0, meta = B.meta || {}, sd = B.sd || {};
    const lived = (sd.story && sd.story.win) || '';
    const dealt = Math.round(B.dmg || 0);
    const first = win && mode === 'stage' && S.cleared.indexOf(n) < 0;
    const rw = mode === 'stage' ? rewardOf(n) : { merit: 0, hero: null, stone: 0 };
    let baseExp, merit = 0, stone = 0, heroTxt = '', extraTxt = '', wkBest = false;
    if (mode === 'stage') baseExp = 40 + n * 30;
    else if (mode === 'rank') baseExp = 120 + (meta.idx + 1) * 12;
    else if (mode === 'weekly') { const wb = weeklyBossOf(meta.boss); baseExp = wb ? Math.round(wb.merit * 0.5) : 220; }
    else { const b = bossRushOf(meta.boss); baseExp = b ? Math.round(b.merit * 0.45) : 150; }
    const exp = win ? baseExp : Math.round(baseExp * 0.25);

    const res = [];
    S.squad.slice(0, MAX_SQUAD).forEach((id) => {
      if (!S.owned[id]) return;
      const r = S.owned[id], before = r.lv, up = addExp(id, exp);
      res.push({ id: id, before: before, after: r.lv, up: up });
    });

    /* 주간 보스전 — 이기든 지든 이번 주 피해·도전 기록은 남긴다 */
    if (mode === 'weekly' && S.weekly && S.weekly.key === meta.key) {
      const rec = S.weekly;
      rec.plays = (rec.plays || 0) + 1;
      if (dealt > (rec.best || 0)) { rec.best = dealt; rec.bestAt = Date.now(); wkBest = true; }
      /* 도중에 주가 바뀌었으면 이번 주(새 보스) 기록으로 옮겨 적지 않는다 */
    }

    if (win) {
      if (mode === 'stage') {
        merit = first ? rw.merit : repeatRewardOf(n);
        addMerit(merit);
        if (first) {
          S.cleared.push(n); S.cleared.sort((a, b) => a - b);
          if (rw.stone) { stone += rw.stone; addStone(rw.stone); }
          if (rw.hero && def(rw.hero).id) {
            const hr = S.owned[rw.hero];
            if (hr) { if (hr.star < STAR_MAX) { hr.star++; heroTxt = rw.hero + ' 중복! ★' + hr.star; } else { addMerit(40); heroTxt = rw.hero + ' 중복 — 공훈 +40'; } }
            else { S.owned[rw.hero] = { star: 1, lv: 1, exp: 0 }; heroTxt = '🎁 ' + rw.hero + ' 영입!'; }
          }
          const a = actOf(n);
          if (n === a.to && a.n < ACTS.length) extraTxt = '🔓 ' + ACTS[a.n].short + ' 해금!';
        }
      } else if (mode === 'rank') {
        const myIdx = rankPos() - 1, oppIdx = clamp(meta.idx, 0, LADDER.length - 1);   // 0-based
        const my = myIdx + 1, opp = oppIdx + 1;
        merit = 60 + Math.max(1, my - opp) * 25;
        stone = 2;
        if (opp < my) S.rank = opp;                 // 이긴 자리를 빼앗는다
        S.rankWins = (S.rankWins || 0) + 1;
        if (rankPos() === 1 && !S.rankTop) { S.rankTop = true; merit += 300; stone += 8; extraTxt = '🏆 랭킹 1위 달성! 보너스 🏅+300 · ' + STONE_NAME + ' +8'; }
        addMerit(merit); addStone(stone);
        heroTxt = '순위 ' + my + '위 → ' + rankPos() + '위' + (opp < my ? ' (' + LADDER[oppIdx].name + ' 제압)' : '');
      } else if (mode === 'boss') {
        const b = bossRushOf(meta.boss);
        if (b) {
          const wins = S.bossWins[b.id] || 0;
          if (!wins) { merit = b.merit; stone = b.stone; extraTxt = '👑 첫 토벌!'; }
          else { merit = Math.max(60, Math.round(b.merit * 0.35)); stone = 1; }
          S.bossWins[b.id] = wins + 1;
          addMerit(merit); addStone(stone);
          heroTxt = b.name + ' 토벌 ' + (wins + 1) + '회';
        }
      } else if (mode === 'weekly') {
        const b = weeklyBossOf(meta.boss);
        const rec = S.weekly;
        if (b && rec && rec.key === meta.key) {
          rec.clears = (rec.clears || 0) + 1;
          if (!rec.first) { rec.first = true; merit = b.merit; stone = b.stone; extraTxt = '👹 주간 첫 격파 보상!'; }
          else { merit = Math.max(80, Math.round(b.merit * 0.2)); stone = 2; extraTxt = '👹 이번 주 재격파'; }
          addMerit(merit); addStone(stone);
        }
      }
    }
    save();
    sfx(win ? 'victory' : 'defeat');
    const title = win ? (mode === 'weekly' ? (extraTxt.indexOf('첫 격파') >= 0 ? '주간 첫 격파!' : '주간 보스 격파!')
      : first ? '첫 클리어!' : mode === 'rank' ? '랭킹전 승리!' : mode === 'boss' ? '토벌 성공!' : '승리!')
      : (flee ? '퇴각' : (mode === 'weekly' ? '격파 실패' : '패배'));
    const body = el('div', 'ex-result');
    body.innerHTML = '<div class="r-t ' + (win || mode === 'weekly' ? 'win' : 'lose') + '">' + title + '</div>' +
      '<div class="r-l">경험치 +' + fmt(exp) + ' (출진 장수 전원)' +
      (win ? (merit ? ' · 🏅 +' + fmt(merit) : '') + (stone ? ' · ' + STONE_NAME + ' +' + stone : '') : ' · 잃은 것은 없어요') + '</div>' +
      (mode === 'weekly' ? '<div class="r-h">이번 전투 피해 ' + fmt(dealt) + ' · 이번 주 최고 ' + fmt(S.weekly ? S.weekly.best : dealt) + (wkBest ? ' — 기록 갱신!' : '') + '</div>' : '') +
      (heroTxt ? '<div class="r-h">' + esc(heroTxt) + '</div>' : '') +
      (extraTxt ? '<div class="r-h">' + esc(extraTxt) + '</div>' : '') +
      (win && mode === 'stage' && lived ? '<div class="r-story">' + esc(lived) + '</div>' : '');
    res.forEach((r) => {
      const nm = (def(r.id) || {}).name || r.id;
      body.appendChild(el('div', 'r-row', '<span>' + esc(nm) + '</span><b>Lv.' + r.before + (r.up ? ' → Lv.' + r.after + ' ⬆' : '') + '</b>'));
    });
    const row = el('div', 'u-btns');
    const nextStage = (win && mode === 'stage' && n < MAX_ACT && n === maxCleared()) ? n + 1 : n;
    const againLabel = mode === 'stage'
      ? (win && n < MAX_ACT && n === maxCleared() ? '다음 관문' : '다시 도전')
      : mode === 'rank' ? '랭킹전' : mode === 'weekly' ? '주간 보스전' : '보스 토벌전';
    const again = el('button', 'ex-btn', againLabel);
    const home = el('button', 'ex-btn gold', '대기실');
    again.onclick = () => {
      stopBattle();
      if (mode === 'rank') { m.kill(); openRanking(); return; }
      if (mode === 'boss') { m.kill(); openBossRush(); return; }
      if (mode === 'weekly') { m.kill(); openWeekly(); return; }
      startBattle(nextStage);
    };
    home.onclick = () => { m.kill(); stopBattle(); renderRoom(); };
    row.appendChild(again); row.appendChild(home); body.appendChild(row);
    const m = modal(win ? '전투 결과' : '전투 종료', body, { cls: 'res' });
    const x = $('.ex-mx', m); if (x) x.style.display = 'none';
    B = null;
  }

  /* =====================================================================
     입장 · 공개 API
     ===================================================================== */
  /* v7.0 — 정식 오픈. 표지의 [⚔️ 꼬마영웅 원정대] 버튼(항상 보임)이 기본 입장이고,
     ?exp=1 즉시 입장과 표지 제목 5연타 입장도 예전 그대로 호환한다. */
  function bindEntry() {
    let dev = false;
    try { dev = new URLSearchParams(location.search).get('exp') === '1'; } catch (e) { dev = false; }
    const btn = document.getElementById('btn-expedition');
    if (btn) {
      btn.hidden = false;
      btn.removeAttribute('hidden');
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
        open();      });
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
        roster: Object.keys(S.owned), formation: S.squad.slice(), progress: clamp(maxCleared() + 1, 1, MAX_ACT),
        stars: (function () { const o = {}; Object.keys(S.owned).forEach((id) => { o[id] = S.owned[id].star; }); return o; })(),
        gear: S.gear.length, equip: (function () { const o = {}; Object.keys(S.owned).forEach((id) => { if (S.owned[id].equip) o[id] = S.owned[id].equip; }); return o; })(),
        cleared: S.cleared.slice(), merit: readMerit(), owned: S.owned,
        /* v6.2 */
        stone: readStone(), rank: rankPos(), rankWins: S.rankWins || 0, rankTop: !!S.rankTop,
        bossWins: JSON.parse(JSON.stringify(S.bossWins || {})),
        weekly: S.weekly ? JSON.parse(JSON.stringify(S.weekly)) : null,
        weeklyHist: JSON.parse(JSON.stringify(S.weeklyHist || [])),
        gearItems: S.gear.map((it) => ({ iid: it.iid, tid: it.tid, enh: it.enh || 0 }))
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
    unequipItem: (iid) => {
      const owner = equippedBy()[iid], item = gearItem(iid);
      if (!owner || !item) return false;
      const t = treasureOf(item);
      return unequip(owner, slotOf(t));
    },
    gearList: () => S.gear.map((it) => { const t = treasureOf(it); return t ? { iid: it.iid, name: t.name, grade: t.grade, slot: slotOf(t) } : null; }).filter(Boolean),
    setParty: (names) => { S.squad = (names || []).filter((n) => S.owned[n]).slice(0, MAX_SQUAD); save(); renderRoom(); return S.squad.slice(); },
    setStar: (name, n) => { if (S.owned[name]) { S.owned[name].star = clamp(Number(n) || 1, 1, STAR_MAX); save(); renderRoom(); } },
    battleStart: (n) => startBattle(n || targetStage()),
    battleSpeed: (s) => { if (B) { B.speed = clamp(Number(s) || 1, 1, 3); const b = $('.spd', B.root); if (b) b.textContent = B.speed + '× 배속'; } },
    /* 점검용 배속 (UI 의 1/2/3× 를 넘어 빠르게 검수할 때만) */
    speed: (s) => { if (B) B.speed = clamp(Number(s) || 1, 1, 12); },
    battleState: () => (B ? {
      stage: B.n, mode: B.mode, meta: B.meta, over: B.end, time: Math.round(B.time * 10) / 10, speed: B.speed,
      dmg: Math.round(B.dmg || 0), gim: B.gim || null,
      ally: B.units.filter((u) => u.team === 0).map((u) => ({ name: u.name, hp: Math.round(u.hp), max: u.max, alive: u.alive, gauge: Math.round(u.gauge) })),
      enemy: B.units.filter((u) => u.team === 1).map((u) => ({ name: u.name, hp: Math.round(u.hp), max: u.max, alive: u.alive, hero: !!u.hero }))
    } : null),
    battleFlee: () => finish(false, true),
    battleWin: () => finish(true),          // 점검용 — 승리 정산을 바로 확인
    /* v6.3 점검용 — 모션·이펙트 상태 (브라우저 검수 스크립트가 읽는다) */
    motions: () => (B ? B.units.map((u) => ({
      name: u.name, team: u.team, cls: u.cls, x: Math.round(u.x * 10) / 10, y: Math.round(u.y * 10) / 10,
      face: u.face, act: u.act ? u.act.kind : null, actP: u.act ? Math.round(u.act.t / u.act.len * 1000) / 1000 : 0,
      dash: !!u.dash, kb: [Math.round(u.mo.kbx * 10) / 10, Math.round(u.mo.kby * 10) / 10],
      pose: u.moEl ? (u.moEl.style.transform || '') : ''
    })) : []),
    fxCount: () => (B ? { fx: B.field.querySelectorAll('.bt-fx').length, proj: B.proj.length,
      ghost: B.field.querySelectorAll('.bt-ghost').length, timers: (B.timers || []).length } : null),
    paused: () => !!(B && B.paused),
    shakeLevel: () => (B ? (B.field.classList.contains('sh2') ? 2 : B.field.classList.contains('sh1') ? 1 : 0) : 0),
    critBoost: (p) => { if (B) B.units.forEach((u) => { if (u.team === 0) u.crit = Math.max(u.crit, clamp(Number(p) || 0, 0, 1)); }); return true; },
    charge: () => { if (B) B.units.forEach((u) => { if (u.alive && u.team === 0) u.gauge = 100; }); return true; },
    /* 점검용 — rAF 대신 1/60초 고정 간격으로 전투를 끝까지 돌린다 (밸런스 측정) */
    fastForward: (sec) => {
      if (!B || B.end) return false;
      try { cancelAnimationFrame(B.raf); } catch (e) { /* ignore */ }
      const step = 1 / 60, n = Math.round((Number(sec) || 60) / step);
      B.quiet = true;                     // 점검용 — 이펙트 DOM·스타일 쓰기 없이 전투만 계산
      for (let i = 0; i < n; i++) { if (!B || B.end) break; tick(step); }
      if (B) { B.quiet = false; B.units.forEach((u) => { if (u.alive) place(u); }); }
      return true;
    },
    lvUp: (id, n) => { const d = buyLv(id, n); renderRoom(); return d; },
    maxCleared: maxCleared,
    /* v6.2 — 막·랭킹·보스·장비 강화 점검용 */
    acts: () => ACTS.map((a) => ({ n: a.n, name: a.name, from: a.from, to: a.to, unlocked: actUnlocked(a) })),
    actTab: (i) => { actSel = clamp(Math.round(i) || 0, 0, ACTS.length - 1); renderRoom(); return ACTS[actSel].n; },
    stages: () => STAGE_DEFS.map((s) => ({ n: s.n, name: s.name, boss: s.boss || null, merit: rewardOf(s.n).merit, hero: rewardOf(s.n).hero, stone: rewardOf(s.n).stone,
      act: actOf(s.n).n, sub: s.sub || '', enter: (s.story && s.story.enter) || '', win: (s.story && s.story.win) || '' })),
    stone: () => readStone(),
    addStone: (n) => { addStone(n); save(); return readStone(); },
    ladder: () => LADDER.map((e, i) => ({ pos: i + 1, name: e.name, title: e.title, deck: e.deck.slice(), power: rankTargetPower(i + 1) })),
    rank: () => rankPos(),
    rankBattle: (pos) => startRankBattle(pos),
    setTune: (x) => { TUNE_POWER_MULT = clamp(Number(x) || 1, 0.2, 4); return TUNE_POWER_MULT; },
    setRank: (pos) => { S.rank = clamp(Math.round(pos) || RANK_MAX, 1, RANK_MAX); save(); renderRoom(); return S.rank; },
    bossRush: () => BOSS_RUSH.map((b) => ({ id: b.id, stage: b.stage, name: b.name, merit: b.merit, stone: b.stone, open: maxCleared() >= b.stage, wins: (S.bossWins[b.id] || 0) })),
    bossBattle: (id) => startBossBattle(id),
    /* v7.0 — 주간 보스전 점검용 */
    weekly: () => {
      const wk = refreshWeekly();
      const b = weeklyBossOf(S.weekly.boss) || wk.boss;
      return { key: wk.key, year: wk.year, week: wk.week, start: wk.start, end: wk.end, left: wkLeft(wk.end),
        boss: { id: b.id, short: b.short, name: b.name, stage: b.stage, merit: b.merit, stone: b.stone,
          gim: { id: b.gim.id, name: b.gim.name, desc: b.gim.desc, time: b.gim.time || WEEKLY_TIME } },
        best: S.weekly.best, clears: S.weekly.clears, plays: S.weekly.plays, first: S.weekly.first,
        hist: JSON.parse(JSON.stringify(S.weeklyHist || [])),
        foePower: Math.round(weeklyTarget(b)),
        myPower: power(S.squad) };
    },
    weeklyRoster: () => WEEKLY.map((b) => ({ id: b.id, short: b.short, name: b.name, stage: b.stage, gim: b.gim.name, merit: b.merit, stone: b.stone })),
    weekAt: (ts) => { const w = weekInfo(ts); return { key: w.key, year: w.year, week: w.week, boss: w.boss.id, name: w.boss.name, start: w.start, end: w.end }; },
    weeklyOpen: () => openWeekly(),
    weeklyBattle: () => startWeeklyBattle(),
    weeklyReset: () => { S.weekly = null; refreshWeekly(); save(); renderRoom(); return SK.expedition.weekly(); },
    enhance: (iid) => { const r = enhanceItem(gearItem(iid)); return r; },
    dismantle: (iid) => { const r = dismantleItem(gearItem(iid)); renderRoom(); return r; },
    equipAt: (id) => { const box = (S.owned[id] || {}).equip || {}; return { weapon: box.weapon || null, armor: box.armor || null, treasure: box.treasure || null }; },
    /* v5.74 — 점검용: 등급·필살기·장비·인연 */
    gradeOf: (id) => tierOf(def(id)),
    bondCount: () => BONDS.length,
    bonds: () => BONDS.map((b) => ({ name: b.name, cat: b.cat, members: b.members.slice(), need: b.need })),
    activeBonds: () => synergies(S.squad).filter((s) => s.bond).map((s) => s.label),
    skill: (id) => { const s = skillOf(id); return { name: s.name, type: s.type, area: s.area || 'one', desc: describeSkill(s) }; },
    equipFx: (id) => equipBonus(id),
    rewards: () => { const o = []; for (let n = 1; n <= MAX_ACT; n++) o.push({ n: n, first: rewardOf(n).merit, repeat: repeatRewardOf(n), stone: rewardOf(n).stone }); return o; }
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
