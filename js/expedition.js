/* =====================================================================
   꼬마영웅 대난투 — 원정 시나리오 《삼국이분다》 통합판
   v5.70 (?v=88) · 대기실 · 레벨(Lv.1~99) · 대각선 실시간 난투 전투

   · 입장은 두 갈래뿐 — 주소의 ?exp=1, 또는 표지 제목 5연타.
     일반 접속(?v=88)에서는 원정 버튼도 문구도 화면에 나오지 않는다.
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

  /* ── 인연 7종 (v5.68 과 같은 효과. 보호막·치명은 이 전투에서 HP·공격으로 환산) ── */
  const BONDS = [
    { id: 'chogi', icon: '🏠', name: '초창기 가신단', members: ['미방', '미축', '간옹'], desc: '방어 +12% · 보호막(최대 HP +25%)', atk: 0, def: 0.12, hp: 0.25 },
    { id: 'dowon', icon: '🌸', name: '도원결의', members: ['유비', '관우', '장비'], desc: '공격 +20% · HP +15%', atk: 0.20, def: 0, hp: 0.15 },
    { id: 'taepyeong', icon: '☯️', name: '태평도 삼형제', members: ['장각', '장보', '장량'], desc: '공격 +20% (책략 피해)', atk: 0.20, def: 0, hp: 0 },
    { id: 'waryong', icon: '🐉', name: '와룡봉추', members: ['제갈량', '방통'], desc: '공격 +18% (스킬 피해)', atk: 0.18, def: 0, hp: 0 },
    { id: 'oho', icon: '🐯', name: '오호대장군', members: ['관우', '장비', '조운', '마초', '황충'], desc: '공격 +15%', atk: 0.15, def: 0, hp: 0 },
    { id: 'gangdong', icon: '🐅', name: '강동의 호랑이', members: ['손견', '손책', '손권'], desc: '공격 +12% · 방어 +8%', atk: 0.12, def: 0.08, hp: 0 },
    { id: 'oja', icon: '🛡️', name: '위의 오자양장', members: ['장료', '서황', '우금', '악진', '장합'], desc: '방어 +15% · HP +10%', atk: 0, def: 0.15, hp: 0.10 }
  ];
  /* 같은 세력 3 / 4 / 5명 (v5.68 그대로) */
  const FACTION_TIERS = {
    3: { n: 3, atk: 0.10, def: 0.10, hp: 0.10 },
    4: { n: 4, atk: 0.18, def: 0.18, hp: 0.18 },
    5: { n: 5, atk: 0.28, def: 0.28, hp: 0.28 }
  };

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
    /* 장착 — 없는 장비·잘못된 칸·중복 장착은 버린다 */
    const usedIid = {};
    const rawEquip = {};
    if (st.equip && typeof st.equip === 'object') Object.keys(st.equip).forEach((n) => { rawEquip[n] = st.equip[n]; });
    Object.keys(out.owned).forEach((id) => {
      const box = out.owned[id].equip || {};
      Object.keys(box).forEach((slot) => {
        const iid = box[slot];
        const item = out.gear.find((g) => g.iid === iid);
        const t = item ? treasureOf(item) : null;
        if (!t || slotOf(t) !== slot || usedIid[iid]) { delete box[slot]; return; }
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

  /* ── 장비 ────────────────────────────────────────────────── */
  const SLOTS = ['weapon', 'armor', 'treasure'];
  const SLOT_LABEL = { weapon: '무기', armor: '방어구', treasure: '보물' };
  const SLOT_ICON = { weapon: '⚔️', armor: '🛡️', treasure: '💎' };
  const TYPE_ICON = { '무기': '⚔️', '방어구': '🛡️', '명마': '🐎', '서적': '📜', '병법서': '📜', '병법서·보물': '📜', '보물': '💎', '비보': '💎', '문물': '🏺', '약': '🧪', '악기': '🎵' };
  const STAT_LABEL = { war: '무력', leadership: '통솔', intel: '지력', politics: '정치', charm: '매력', move: '이동' };
  function slotOf(t) {
    if (!t) return 'treasure';
    if (t.type === '무기') return 'weapon';
    if (t.type === '방어구') return 'armor';
    return 'treasure';
  }
  function treasureOf(item) {
    if (!item) return null;
    try {
      if (SK.TREASURE_BY_ID && SK.TREASURE_BY_ID[item.tid]) return SK.TREASURE_BY_ID[item.tid];
      return (SK.TREASURES || []).find((t) => t && t.id === item.tid) || null;
    } catch (e) { return null; }
  }
  function gearItem(iid) { return (S && S.gear.find((g) => g.iid === iid)) || null; }
  function equipBonus(id) {
    const b = { war: 0, leadership: 0, intel: 0, move: 0 };
    const box = (S && S.owned[id] && S.owned[id].equip) || {};
    SLOTS.forEach((slot) => {
      const t = treasureOf(gearItem(box[slot]));
      if (!t || !t.statBonus) return;
      Object.keys(t.statBonus).forEach((k) => { if (b[k] != null) b[k] += Number(t.statBonus[k]) || 0; });
    });
    return b;
  }
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
      if (b.members.every((m) => (ids || []).indexOf(m) >= 0)) out.push({ label: b.name, atk: b.atk || 0, def: b.def || 0, hp: b.hp || 0, bond: 1, icon: b.icon });
    });
    return out;
  }
  const sumSyn = (list) => (list || []).reduce((a, s) => { a.atk += s.atk || 0; a.def += s.def || 0; a.hp += s.hp || 0; return a; }, emptySyn());

  function baseStats(d) {
    const g = genOf(d) || {};
    const eq = equipBonus(d.id);
    const L = (Number(g.leadership) || 40) + eq.leadership;
    const W = (Number(g.war) || 40) + eq.war;
    const I = (Number(g.intel) || 30) + eq.intel;
    return { L: L, W: W, I: I };
  }
  function stat(id, syn) {
    const d = def(id);
    const r = (S && S.owned[id]) || { lv: 1, star: 1 };
    const b = baseStats(d);
    const m = (1 + 0.06 * (r.lv - 1)) * (1 + 0.12 * (r.star - 1));
    const g = syn || emptySyn();
    return {
      atk: Math.round((b.W * 1.1 + b.I * 0.35 + b.L * 0.3) * m * (1 + (g.atk || 0))),
      def: Math.round((b.L * 0.5 + b.W * 0.15) * m * (1 + (g.def || 0))),
      hp: Math.round((b.L * 10 + b.W * 6) * m * (1 + (g.hp || 0)))
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
  function portrait(d, cls, src) {
    const w = el('div', 'ex-pt ' + (cls || ''));
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
      c.appendChild(el('div', 'ex-badge', '<b>' + stars(r.star) + '</b> Lv.' + r.lv + '<br>' + d.name));
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
    return { merit: 120 + n * 60 + (boss ? 200 : 0), hero: n === MAX_ACT1 ? '유비' : null };
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
        '<div class="u-n">' + d.name + ' <small>' + (CLS_LABEL[d.cls] || '') + ' · ' + (d.faction || '재야') + ' · ' + d.tier + '급</small></div>' +
        '<div class="u-s">' + stars(r.star) + ' &nbsp;Lv.' + r.lv + (r.lv >= MAX_LV ? ' (MAX)' : '') + '</div>' +
        '<div class="u-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="u-x">EXP ' + fmt(r.exp) + ' / ' + (nx ? fmt(nx) : '-') + '</div>'));
      body.appendChild(head);
      body.appendChild(el('div', 'u-stats',
        '<div><span>공격</span><b>' + fmt(s.atk) + '</b></div><div><span>방어</span><b>' + fmt(s.def) + '</b></div><div><span>HP</span><b>' + fmt(s.hp) + '</b></div>'));
      body.appendChild(el('div', 'u-skill', '✨ 필살기 · <b>' + (d.skill || '필살기') + '</b><small> 카드가 노랗게 빛나면 터치</small>'));

      const eqBox = S.owned[id].equip || {};
      const es = el('div', 'u-equip');
      SLOTS.forEach((k) => {
        const t = treasureOf(gearItem(eqBox[k]));
        const cell = el('div', 'u-eq' + (t ? ' on' : ''), '<i>' + SLOT_ICON[k] + '</i><span>' + (t ? t.name : SLOT_LABEL[k]) + '</span>');
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
        row.appendChild(el('div', 'l-mid', '<b>' + d.name + ' <small>' + d.tier + '급 ' + (d.faction || '재야') + '</small></b><small>' + stars(r.star) + ' Lv.' + r.lv + ' · ' + (CLS_LABEL[d.cls] || '') + ' · ⚔️' + fmt(stat(id, emptySyn()).atk) + '</small>'));
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

  /* ---------- 인연도감 ---------- */
  function openBonds() {
    const body = el('div', 'ex-list');
    const before = el('div', 'u-note', '같은 세력 3명 → 공·방·HP +10% · 4명 → +18% · 5명 → +28%<br>재야(在野) 장수는 세력 시너지에 들지 않아요 · 인연은 세력과 상관없이 맞춰집니다');
    body.appendChild(before);
    BONDS.forEach((b) => {
      const have = b.members.filter((m) => S.owned[m]).length, on = b.members.every((m) => S.squad.indexOf(m) >= 0);
      const row = el('div', 'l-row' + (on ? ' in' : ''),
        '<div class="l-mid"><b>' + b.icon + ' ' + b.name + '</b><small>' + b.members.map((m) => (S.owned[m] ? m : m + '(미보유)')).join(' · ') + '</small><small>' + b.desc + '</small></div>' +
        '<div class="s-st">' + have + '/' + b.members.length + (on ? ' ✔' : '') + '</div>');
      body.appendChild(row);
    });
    modal('인연도감', body, { cls: 'tall' });
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
    const s = t && t.statBonus ? Object.keys(t.statBonus).map((k) => (STAT_LABEL[k] || k) + ' +' + t.statBonus[k]).join(' · ') : '';
    return s || (t && t.effect) || '';
  }
  function openTreasure() {
    const body = el('div', 'ex-unit');
    const draw = (res, n) => {
      body.innerHTML = '';
      body.appendChild(el('div', 'u-note big', '💎 보물 창고<br>본편 250종 보물 · 공훈 ' + COST_GEAR[1] + ' · 10회 ' + COST_GEAR[10] + ' · 무기·방어구·보물 3칸 장착'));
      body.appendChild(el('div', 'sx-rate', '전설 ' + GEAR_RATE['전설'] + '% · 영웅 ' + GEAR_RATE['영웅'] + '% · 희귀 ' + GEAR_RATE['희귀'] + '% · 일반 ' + GEAR_RATE['일반'] + '% <em>· 10회는 희귀 이상 1점 보장</em>'));
      body.appendChild(el('div', 'sx-wallet', '🏅 보유 공훈 <b>' + fmt(readMerit()) + '</b> · 보유 장비 <b>' + S.gear.length + '</b>점'));
      if (res && res.length) {
        const grid = el('div', 'sx-grid');
        res.forEach((it) => {
          const t = it.treasure, card = el('div', 'sx-card g');
          card.appendChild(el('div', 'sx-ic', TYPE_ICON[t.type] || '💎'));
          card.appendChild(el('b', '', t.name));
          card.appendChild(el('em', '', t.grade || ''));
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
        const owner = used[it.iid];
        const rowEl = el('div', 'sx-gear',
          '<span class="sx-gic">' + (TYPE_ICON[t.type] || '💎') + '</span>' +
          '<div class="sx-gmid"><b>' + t.name + '</b><small>' + SLOT_LABEL[slotOf(t)] + ' · ' + (t.grade || '') + ' · ' + gearStatText(t) + '</small></div>' +
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
      const t = treasureOf(it);
      const row = el('div', 'sx-gear' + (it.iid === cur ? ' on' : ''),
        '<span class="sx-gic">' + (TYPE_ICON[t.type] || '💎') + '</span>' +
        '<div class="sx-gmid"><b>' + t.name + '</b><small>' + (t.grade || '') + ' · ' + gearStatText(t) + '</small></div>' +
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
      x: x, y: y, cd: rnd(0.1, 0.6), gauge: 0, alive: true, boss: !!d.boss, tgt: null
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
      B.units.push(mkUnit(0, Object.assign({}, def(id), { id: id }), stat(id, g), 118 + k * 40, 600 + k * 40, i));
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
      u.cd -= dt;
      if (!u.tgt || !u.tgt.alive) u.tgt = nearest(u);
      const t = u.tgt;
      if (!t) return;
      const dx = t.x - u.x, dy = t.y - u.y, dist = Math.hypot(dx, dy) || 1, rg = RANGE[u.cls] || 46;
      if (dist > rg) {
        const sp = (SPEED[u.cls] || 100) * (u.cls === 'melee' && dist > 120 ? 1.5 : 1) * dt;
        u.x += dx / dist * sp; u.y += dy / dist * sp;
      } else if (u.cd <= 0) {
        u.cd = ASPD[u.cls] || 1;
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
  const calc = (s, t, m) => Math.max(1, Math.round(s.atk * m * rnd(0.9, 1.1) * 100 / (100 + t.def)));
  function hit(s, t, m, fx) {
    if (!t.alive) return;
    const dmg = calc(s, t, m);
    t.hp -= dmg;
    s.gauge = Math.min(100, s.gauge + 4);
    t.gauge = Math.min(100, t.gauge + 7);
    fxAt(t.x, t.y - 28, fx || 'slash');
    pop(t.x, t.y - 50, dmg, s.team === 0 ? '' : ' foe');
    t.el.classList.add('hurt');
    setTimeout(() => { if (t.el) t.el.classList.remove('hurt'); }, 120);
    if (t.hp <= 0) die(t);
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
  function cast(u) {
    if (!u.alive || !B || B.end) return;
    u.gauge = 0;
    const foes = aliveOf(u.team ? 0 : 1);
    if (!foes.length) return;
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
      if (!u.team) aliveOf(0).forEach((a) => { const h = Math.round(u.atk * 1.2); a.hp = Math.min(a.max, a.hp + h); pop(a.x, a.y - 50, '+' + h, ' heal'); });
    }
    if (u.card) u.card.classList.remove('ready');
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
      merit = first ? rw.merit : Math.max(20, Math.round(rw.merit * 0.25));
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
    maxCleared: maxCleared
  };
})();
