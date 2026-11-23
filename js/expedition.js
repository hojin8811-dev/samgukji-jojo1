/* ══════════════════════════════════════════════════════════════════════════
   꼬마영웅 대난투 — 원정 시나리오 (비밀 · DEV)
   v5.68 (?v=86) · 2단계 — 1막 「황건적의 난」 1~10관 풀오토 전투

   · 독립 모듈: 본편(app.js · battle.js)의 흐름을 건드리지 않는다.
     공훈은 본편 상태(명성·점령지·천하통일)를 읽어 대기실을 열 때 적립한다.
   · 입장은 두 갈래뿐 — 주소에 ?exp=1, 또는 표지 제목을 1.5초 안에 5번 연속 터치.
     둘 다 '이번 화면 세션'에만 열리고 localStorage에 흔적을 남기지 않는다.
   · 2단계 범위
     ① 세력 시너지(3·4·5명) + 인연 7종 → 대기실 칩 · 전투 중 배지
     ② 장수 공훈 뽑기(100 / 10회 900) + 중복 ★승급(최대 5성, 성당 +12%)
     ③ 장비(보물) 뽑기(80 / 10회 720) + 무기·방어구·보물 3칸 장착
     ④ 3×3 풀오토 전투 10관(5관 장량 · 8관 장보 · 10관 장각)
        전열→중열→후열 타깃팅, 1×/2× 배속, 필살기 자동, 데미지 팝업, 승패 결과창
        첫 클리어 공훈 보상 · 10관 첫 클리어 시 유비(★1) 영입 · 패배 패널티 없음
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const SK = window.SK || (window.SK = {});

  /* ── 저장 키 ─────────────────────────────────────────────── */
  const META_KEY = 'sk_meta_merit';          // 영구 공훈(본편과 공유하는 메타 재화)
  const EXP_KEY = 'sk_expedition_v1';        // 원정단·진형·진행도·별·장비
  const STARTER_MERIT = 1000;                // 처음 연 사람에게 지급하는 시작 공훈
  const MAX_PARTY = 5;
  const STAR_MAX = 5;
  const STAGES = 10;
  const ROWS = ['전열', '중열', '후열'];
  const COLS = ['왼쪽', '가운데', '오른쪽'];
  const BOSSES = { 5: '장량', 8: '장보', 10: '장각' };
  const STAGE_NAMES = {
    1: '황건 정찰대', 2: '황건 도적떼', 3: '황건 무리', 4: '황건 정예', 5: '장량의 진',
    6: '태평도 신도', 7: '태평도 주력', 8: '장보의 진', 9: '남양 최후 저지선', 10: '장각의 진',
  };

  const COST_HERO = { 1: 100, 10: 900 };
  const COST_GEAR = { 1: 80, 10: 720 };
  const HERO_RATE = { S: 3, A: 15, B: 37, C: 45 };
  const GEAR_RATE = { '전설': 6, '영웅': 18, '희귀': 36, '일반': 40 };

  const FACTION_COLOR = { '촉': '#2f8f4b', '위': '#2f6fb8', '오': '#b8432f', '군웅': '#8a7448', '한국': '#7a5aa8' };
  const FACTIONS = ['촉', '위', '오', '군웅', '한국'];

  /* 데이터가 아직 안 실렸을 때(첫 프레임) 쓸 기본값 — 미방·미축·간옹 */
  const STARTERS = [
    { name: '미방', id: 33, tier: 'A', job: '창병', faction: '촉', leadership: 75, war: 74, intel: 52, politics: 60, charm: 41, skill: '수성의 보급', portrait: 'assets/portraits/a_rank/33_mifang.webp' },
    { name: '미축', id: 243, tier: 'A', job: '풍수사', faction: '촉', leadership: 47, war: 24, intel: 76, politics: 87, charm: 84, skill: '거부의 군자금', portrait: 'assets/portraits/a_rank/243_mizhu.webp' },
    { name: '간옹', id: 35, tier: 'A', job: '책사', faction: '촉', leadership: 38, war: 32, intel: 74, politics: 78, charm: 79, skill: '유머의 중재', portrait: 'assets/portraits/a_rank/35_jianyong.webp' },
  ];
  const START_NAMES = STARTERS.map((g) => g.name);

  /* ── 세력 시너지 (같은 세력 3 / 4 / 5명) ──────────────────── */
  const FACTION_TIERS = {
    3: { n: 3, atk: 0.10, def: 0.10, hp: 0.10, crit: 0, gauge: 0 },
    4: { n: 4, atk: 0.18, def: 0.18, hp: 0.18, crit: 0.05, gauge: 0 },
    5: { n: 5, atk: 0.28, def: 0.28, hp: 0.28, crit: 0.10, gauge: 0.25 },
  };

  /* ── 인연 (조합) ─────────────────────────────────────────── */
  const BONDS = [
    { id: 'chogi', icon: '🏠', name: '초창기 가신단', members: ['미방', '미축', '간옹'], desc: '방어 +12% · 시작 사기 · 보호막(최대 HP 25%)', short: '방+12% 보호막', def: 0.12, shield: 0.25 },
    { id: 'dowon', icon: '🌸', name: '도원결의', members: ['유비', '관우', '장비'], desc: '공격 +20% · HP +15%', short: '공+20% HP+15%', atk: 0.20, hp: 0.15 },
    { id: 'taepyeong', icon: '☯️', name: '태평도 삼형제', members: ['장각', '장보', '장량'], desc: '책략공 +20% (술법 피해)', short: '책략+20%', spell: 0.20 },
    { id: 'waryong', icon: '🐉', name: '와룡봉추', members: ['제갈량', '방통'], desc: '스킬 피해 +18%', short: '스킬+18%', skill: 0.18 },
    { id: 'oho', icon: '🐯', name: '오호대장군', members: ['관우', '장비', '조운', '마초', '황충'], desc: '공격 +15% · 치명 +5%', short: '공+15% 치명+5%', atk: 0.15, crit: 0.05 },
    { id: 'gangdong', icon: '🐅', name: '강동의 호랑이', members: ['손견', '손책', '손권'], desc: '공격 +12% · 방어 +8%', short: '공+12% 방+8%', atk: 0.12, def: 0.08 },
    { id: 'oja', icon: '🛡️', name: '위의 오자양장', members: ['장료', '서황', '우금', '악진', '장합'], desc: '방어 +15% · HP +10%', short: '방+15% HP+10%', def: 0.15, hp: 0.10 },
  ];

  /* ── 장비 3슬롯 (무기 / 방어구 / 보물) ───────────────────── */
  const GEAR_SLOTS = ['weapon', 'armor', 'treasure'];
  const SLOT_LABEL = { weapon: '무기', armor: '방어구', treasure: '보물(명마·병법서)' };
  const SLOT_SHORT = { weapon: '무기', armor: '방어구', treasure: '보물' };
  const SLOT_ICON = { weapon: '⚔️', armor: '🛡️', treasure: '💎' };
  const TYPE_ICON = { '무기': '⚔️', '방어구': '🛡️', '명마': '🐎', '서적': '📜', '병법서': '📜', '병법서·보물': '📜', '보물': '💎', '비보': '💎', '문물': '🏺', '약': '🧪', '악기': '🎵' };
  function gearSlotOf(t) {
    if (!t) return 'treasure';
    if (t.type === '무기') return 'weapon';
    if (t.type === '방어구') return 'armor';
    return 'treasure';
  }
  /* 등급 → CSS 클래스 키 (한글 클래스명을 피한다) */
  function gradeKey(g) {
    return { '전설': 'legend', '영웅': 'hero', '희귀': 'rare', '일반': 'common' }[g] || 'common';
  }

  /* ── 전투 직업 분류 ──────────────────────────────────────── */
  const RANGED_JOBS = ['궁수', '연노병', '책사', '풍수사', '도사', '포차', '군악대', '무희', '궁기'];
  const AOE_JOBS = ['책사', '풍수사', '도사', '포차', '궁기', '연노병'];
  const HEAL_JOBS = ['군악대', '무희'];
  const isRangedJob = (job) => RANGED_JOBS.indexOf(job) >= 0;
  const isCasterJob = (job) => job === '책사' || job === '풍수사' || job === '도사';

  /* ── 작은 도우미 ─────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);
  function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function toast(msg) { try { if (SK.toast) SK.toast(msg); } catch (e) { /* ignore */ } }
  function sfx(name) { try { if (SK.sfx && SK.sfx.play) SK.sfx.play(name || 'ui'); } catch (e) { /* ignore */ } }
  function tierOf(g) { const t = g && g.tier; return ['S', 'A', 'B', 'C'].indexOf(t) >= 0 ? t : 'C'; }
  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : (fb || 0); }

  function getGen(name) {
    if (!name) return null;
    const base = STARTERS.find((g) => g.name === name) || {};
    const live = (SK.GEN_BY_NAME && SK.GEN_BY_NAME[name]) || null;
    if (!live) return base.name ? base : null;
    return {
      name,
      id: live.id,
      tier: live.tier || base.tier,
      job: live.job || base.job || '',
      faction: live.faction || base.faction || '군웅',
      leadership: num(live.leadership, base.leadership),
      war: num(live.war, base.war),
      intel: num(live.intel, base.intel),
      politics: num(live.politics, base.politics),
      charm: num(live.charm, base.charm),
      skill: live.skill || base.skill || '',
      portrait: base.portrait || null,
    };
  }
  function factionOf(name) { const g = getGen(name); return (g && g.faction) || '군웅'; }
  function factionColor(f) { return FACTION_COLOR[f] || '#8a7448'; }

  function portraitOf(name, g) {
    try {
      if (SK.artPortrait) { const a = SK.artPortrait(name); if (a) return a; }
    } catch (e) { /* ignore */ }
    try {
      const live = SK.GEN_BY_NAME && SK.GEN_BY_NAME[name];
      if (live && SK.genPortrait && SK.ptSrc) return SK.ptSrc(SK.genPortrait(live));
    } catch (e) { /* ignore */ }
    return (g && g.portrait) || 'assets/portraits/v2/gen_bobyung.webp';
  }
  function jobPortrait(job) {
    try {
      if (SK.JOB_CLASS && SK.CLASS_PORTRAIT && SK.ptSrc) {
        const cls = SK.JOB_CLASS[job];
        if (cls && SK.CLASS_PORTRAIT[cls]) return SK.ptSrc(SK.CLASS_PORTRAIT[cls]);
      }
    } catch (e) { /* ignore */ }
    return 'assets/portraits/v2/gen_bobyung.webp';
  }
  function faceHtml(name, extraClass) {
    const g = getGen(name);
    if (!g) return '';
    const t = tierOf(g);
    return `<span class="exp-face tf tier-${t} ${extraClass || ''}"><img src="${portraitOf(name, g)}" alt="${name}" loading="lazy"></span>`;
  }
  function starText(n) { return '★'.repeat(clamp(Math.round(n) || 1, 1, STAR_MAX)); }

  function ownedCount(s) {
    if (!s || !SK.CITY_LIST) return 0;
    return SK.CITY_LIST.filter((c) => s.cities && s.cities[c.id] && s.cities[c.id].owner === s.playerFaction).length;
  }

  /* ── 영구 저장 ───────────────────────────────────────────── */
  function readMerit() {
    let v = null;
    try { const raw = localStorage.getItem(META_KEY); if (raw != null && raw !== '') v = Number(raw); } catch (e) { v = null; }
    if (v == null || !isFinite(v) || v < 0) { v = STARTER_MERIT; writeMerit(v); }
    return Math.round(v);
  }
  function writeMerit(v) {
    try { localStorage.setItem(META_KEY, String(Math.max(0, Math.round(Number(v) || 0)))); } catch (e) { /* 저장이 막힌 브라우저 */ }
  }

  function defaultFormation() {
    const f = new Array(9).fill(null);
    f[1] = '미방';   // 전열 가운데
    f[4] = '미축';   // 중열 가운데
    f[8] = '간옹';   // 후열 오른쪽
    return f;
  }

  function loadStore() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(EXP_KEY) || 'null'); } catch (e) { raw = null; }
    const st = (raw && typeof raw === 'object') ? raw : {};
    const roster = Array.isArray(st.roster) && st.roster.length
      ? st.roster.filter((n) => typeof n === 'string' && n) : START_NAMES.slice();
    /* 시작 3인은 어떤 경우에도 원정단에 남긴다 */
    START_NAMES.forEach((n) => { if (roster.indexOf(n) < 0) roster.push(n); });

    let formation = null;
    if (Array.isArray(st.formation) && st.formation.length === 9) {
      formation = st.formation.map((n) => {
        if (typeof n !== 'string' || !n) return null;
        return roster.indexOf(n) >= 0 ? n : null;   // 보유하지 않은 이름은 비운다
      });
    }

    /* 별 (1~5성) */
    const stars = {};
    const rawStars = (st.stars && typeof st.stars === 'object') ? st.stars : {};
    roster.forEach((n) => { stars[n] = clamp(Math.round(Number(rawStars[n]) || 1), 1, STAR_MAX); });

    /* 장비 인스턴스 */
    const gear = [];
    const seenIid = {};
    (Array.isArray(st.gear) ? st.gear : []).forEach((it) => {
      if (!it || it.tid == null || !it.iid) return;
      if (seenIid[it.iid]) return;
      seenIid[it.iid] = 1;
      gear.push({ iid: String(it.iid), tid: Number(it.tid) });
    });

    /* 장착 — 없는 장비·잘못된 칸·중복 장착은 버린다 */
    const equip = {};
    const usedIid = {};
    const rawEquip = (st.equip && typeof st.equip === 'object') ? st.equip : {};
    roster.forEach((name) => {
      const src = rawEquip[name];
      if (!src || typeof src !== 'object') return;
      const box = {};
      GEAR_SLOTS.forEach((slot) => {
        const iid = src[slot];
        if (!iid || usedIid[iid]) return;
        const item = gear.find((g) => g.iid === iid);
        if (!item) return;
        const t = treasureOf(item);
        if (!t || gearSlotOf(t) !== slot) return;
        usedIid[iid] = 1;
        box[slot] = iid;
      });
      if (Object.keys(box).length) equip[name] = box;
    });

    const cleared = (Array.isArray(st.cleared) ? st.cleared : [])
      .map((n) => Number(n)).filter((n) => n >= 1 && n <= STAGES);
    cleared.sort((a, b) => a - b);

    const credit = (st.credit && typeof st.credit === 'object') ? st.credit : {};
    return {
      roster,
      formation: formation || defaultFormation(),
      progress: Math.min(STAGES, Math.max(1, Number(st.progress) || 1)),
      credit: {
        raw: Number(credit.raw) || 0,
        baseCities: credit.baseCities == null ? null : Number(credit.baseCities),
      },
      stars,
      gear,
      equip,
      cleared,
    };
  }

  let store = null;
  let selected = null;      // 진형에서 고른 칸
  let revealed = false;     // 이번 화면 세션에서 비밀 입장이 열렸는가

  function saveStore() {
    if (!store) return;
    try { localStorage.setItem(EXP_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  /* ── 공훈 연동 (본편 명성 · 점령지 · 천하통일) ─────────────── */
  function syncMerit(announce) {
    if (!store) store = loadStore();
    const c = store.credit;
    const s = SK.state;
    if (!s || !s.cities) return;
    const cities = ownedCount(s);
    if (c.baseCities == null) c.baseCities = cities;
    const fame = Number(s.fame) || 0;
    const raw = fame * 2 + Math.max(0, cities - c.baseCities) * 20 + (s.unified ? 500 : 0);
    if (raw < c.raw) {             // 새 판·불러오기로 되돌아간 경우: 기준만 다시 맞춘다
      c.baseCities = cities;
      c.raw = fame * 2 + (s.unified ? 500 : 0);
      return;
    }
    if (raw > c.raw) {
      const gain = raw - c.raw;
      writeMerit(readMerit() + gain);
      c.raw = raw;
      if (announce) toast(`본편 공훈 +${gain} 적립! (명성 ${fame})`);
    }
  }

  function addMerit(n) {
    const v = readMerit() + (Number(n) || 0);
    writeMerit(v);
    paintMerit();
    return v;
  }

  /* ══════════════════════════════════════════════════════════
     장수 · 장비 스탯
     ══════════════════════════════════════════════════════════ */
  function starOf(name) {
    if (!store || !name) return 1;
    return clamp(Math.round(Number(store.stars[name]) || 1), 1, STAR_MAX);
  }
  function starMult(name) { return 1 + 0.12 * (starOf(name) - 1); }

  function treasureOf(item) {
    if (!item) return null;
    try {
      if (SK.TREASURE_BY_ID && SK.TREASURE_BY_ID[item.tid]) return SK.TREASURE_BY_ID[item.tid];
      const list = SK.TREASURES || [];
      return list.find((t) => t && t.id === item.tid) || null;
    } catch (e) { return null; }
  }
  function gearItem(iid) {
    if (!store || !iid) return null;
    return store.gear.find((g) => g.iid === iid) || null;
  }
  function equippedIids() {
    const used = {};
    if (!store) return used;
    Object.keys(store.equip || {}).forEach((name) => {
      GEAR_SLOTS.forEach((slot) => { const iid = store.equip[name][slot]; if (iid) used[iid] = name; });
    });
    return used;
  }
  function equipOf(name) { return (store && store.equip[name]) || {}; }

  function equipBonusOf(name) {
    const bonus = { war: 0, leadership: 0, intel: 0, politics: 0, charm: 0, move: 0 };
    const box = equipOf(name);
    GEAR_SLOTS.forEach((slot) => {
      const t = treasureOf(gearItem(box[slot]));
      if (!t || !t.statBonus) return;
      Object.keys(t.statBonus).forEach((k) => {
        if (bonus[k] == null) return;
        bonus[k] += Number(t.statBonus[k]) || 0;
      });
    });
    return bonus;
  }

  function statsOf(name) {
    const g = getGen(name);
    if (!g) return null;
    const m = starMult(name);
    const gb = equipBonusOf(name);
    return {
      leadership: g.leadership * m + gb.leadership,
      war: g.war * m + gb.war,
      intel: g.intel * m + gb.intel,
      politics: (g.politics || 0) * m + gb.politics,
      charm: (g.charm || 0) * m + gb.charm,
      move: gb.move,
    };
  }
  function powerOf(name) {
    const s = statsOf(name);
    if (!s) return 0;
    return Math.round(s.leadership * 12 + s.war * 10 + s.intel * 8 + s.move * 20);
  }
  function partyNames() { return store ? store.formation.filter(Boolean) : []; }
  function partyPower() { return partyNames().reduce((a, n) => a + powerOf(n), 0); }

  /* ══════════════════════════════════════════════════════════
     세력 시너지 · 인연
     ══════════════════════════════════════════════════════════ */
  function synergyOf(names) {
    const res = {
      names: names || [], faction: null, bonds: [],
      atk: 0, def: 0, hp: 0, crit: 0, spell: 0, skill: 0, gauge: 0, shield: 0,
    };
    const list = names || [];
    const counts = {};
    list.forEach((n) => { const f = factionOf(n); counts[f] = (counts[f] || 0) + 1; });
    let bestF = null, bestN = 0;
    FACTIONS.forEach((f) => { if ((counts[f] || 0) > bestN) { bestN = counts[f]; bestF = f; } });
    if (bestN >= 3) {
      const tier = FACTION_TIERS[bestN >= 5 ? 5 : bestN >= 4 ? 4 : 3];
      res.faction = { faction: bestF, count: bestN, tier };
      res.atk += tier.atk; res.def += tier.def; res.hp += tier.hp;
      res.crit += tier.crit; res.gauge += tier.gauge;
    }
    BONDS.forEach((b) => {
      if (!b.members.every((m) => list.indexOf(m) >= 0)) return;
      res.bonds.push(b);
      ['atk', 'def', 'hp', 'crit', 'spell', 'skill'].forEach((k) => { if (b[k]) res[k] += b[k]; });
      if (b.shield) res.shield += b.shield;
    });
    return res;
  }
  function partySynergy() { return synergyOf(partyNames()); }

  /* ══════════════════════════════════════════════════════════
     화면 그리기 — 대기실
     ══════════════════════════════════════════════════════════ */
  function paintMerit() {
    const el = $('exp-merit');
    if (el) el.textContent = fmt(readMerit());
  }

  function paintChips() {
    const box = $('exp-chips');
    if (!box) return;
    const prog = store ? store.progress : 1;
    const cleared = (store && store.cleared) || [];
    let html = '';
    for (let i = 1; i <= STAGES; i++) {
      const done = cleared.indexOf(i) >= 0;
      const cls = done ? 'done' : (i === prog ? 'now' : '');
      const boss = BOSSES[i];
      const label = boss ? `${i}관 · 보스 ${boss}` : `${i}관`;
      html += `<span class="exp-chip ${cls}${boss ? ' boss' : ''}" role="listitem" data-stage="${i}" title="${label}" aria-label="${label}">${i}</span>`;
    }
    box.innerHTML = html;
    const note = $('exp-progress-note');
    if (note) {
      if (prog >= STAGES && cleared.indexOf(STAGES) >= 0) {
        note.innerHTML = `제1막 완료! <b>장각</b>을 무너뜨렸습니다 — 10관 재도전으로 공훈을 더 모을 수 있습니다.`;
      } else if (cleared.indexOf(STAGES) >= 0) {
        note.innerHTML = `<b>10관</b>을 다시 도전할 수 있습니다 · 5관 장량 · 8관 장보 · 10관 장각`;
      } else {
        note.innerHTML = `<b>${prog}관문</b>부터 도전할 수 있습니다 · 5관 장량 · 8관 장보 · 10관 장각`;
      }
    }
  }

  function partyCount() { return store ? store.formation.filter(Boolean).length : 0; }

  function paintGrid() {
    const grid = $('exp-grid');
    if (!grid) return;
    let html = '';
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const name = store.formation[i];
      const pos = `${ROWS[row]} ${COLS[col]}`;
      if (!name) {
        html += `<div class="exp-cell empty${selected === i ? ' sel' : ''}" data-slot="${i}" role="button" tabindex="0" aria-label="${pos} 빈칸">${ROWS[row]} · 빈칸</div>`;
        continue;
      }
      const g = getGen(name);
      const t = tierOf(g);
      const star = starOf(name);
      const gearN = GEAR_SLOTS.filter((sl) => equipOf(name)[sl]).length;
      html += `<div class="exp-cell filled tier-${t}${selected === i ? ' sel' : ''}" data-slot="${i}" role="button" tabindex="0" aria-label="${name}, ${pos}">`
        + `<span class="exp-rowtag">${ROWS[row]} · ${COLS[col]}</span>`
        + `<span class="exp-info" data-info="${i}" role="button" tabindex="0" aria-label="${name} 능력치">i</span>`
        + faceHtml(name)
        + `<span class="exp-name">${name}${star >= 2 ? `<em class="exp-star">★${star}</em>` : ''}</span>`
        + `<span class="exp-sub">${t}급 · ${(g && g.job) || ''} · ${fmt(powerOf(name))}${gearN ? ` · 🎒${gearN}` : ''}</span>`
        + `</div>`;
    }
    grid.innerHTML = html;
    const cnt = $('exp-form-count');
    if (cnt) cnt.textContent = `배치 ${partyCount()} / ${MAX_PARTY}명`;
    const reserve = $('exp-reserve');
    if (reserve) {
      const next = partyCount() + 1;
      if (next > MAX_PARTY) {
        reserve.innerHTML = `<div class="exp-slot-empty" style="grid-column:1/-1">진형 가득 참 (${MAX_PARTY}명) · 출진 준비 완료</div>`;
      } else if (next === MAX_PARTY) {
        reserve.innerHTML = `<div class="exp-slot-empty" style="grid-column:1/-1">＋ ${next}번 슬롯 · <b>공훈 뽑기</b>로 마지막 한 자리</div>`;
      } else {
        reserve.innerHTML = `<div class="exp-slot-empty">＋ ${next}번 슬롯 · <b>공훈 뽑기</b></div>`
          + `<div class="exp-slot-empty">＋ ${next + 1}번 슬롯 · <b>공훈 뽑기</b></div>`;
      }
    }
    paintSynergy();
  }

  function paintSynergy() {
    const box = $('exp-synergy');
    if (!box) return;
    const s = partySynergy();
    let html = '';
    if (s.faction) {
      const t = s.faction.tier;
      const bits = [`공·방·체 +${pct(t.atk)}`];
      if (t.crit) bits.push(`치명 +${pct(t.crit)}`);
      if (t.gauge) bits.push('필살 가속');
      html += `<span class="exp-syn fact" style="--fc:${factionColor(s.faction.faction)}">`
        + `<em>${s.faction.faction}</em> ${s.faction.count}명 <b>${bits.join(' · ')}</b></span>`;
    }
    s.bonds.forEach((b) => {
      html += `<span class="exp-syn bond" title="${b.desc}">${b.icon} ${b.name} <b>${b.short}</b></span>`;
    });
    if (!html) {
      html = `<span class="exp-syn-empty">같은 세력 3명을 모으면 <b>세력 시너지</b>가 켜집니다</span>`;
    }
    html += `<button type="button" class="exp-syn-more" data-bond-list aria-label="인연 목록 보기">인연 목록</button>`;
    box.innerHTML = html;
  }

  function paintFoot() {
    const prog = store ? store.progress : 1;
    const power = partyPower();
    const reco = 4500 + (prog - 1) * 450;
    const btn = $('exp-sortie');
    if (btn) {
      const done = store && store.cleared.indexOf(prog) >= 0;
      btn.innerHTML = `<span>⚔️</span><b>${prog}관문 ${done ? '재도전' : '출진하기'}</b><small>${STAGE_NAMES[prog] || ''} · 전투력 ${fmt(power)} · 권장 ${fmt(reco)}</small>`;
      btn.classList.toggle('disabled', partyCount() === 0);
    }
  }

  function paintAll() {
    paintMerit();
    paintChips();
    paintGrid();
    paintFoot();
  }

  function posName(i) {
    const row = Math.floor(i / 3), col = i % 3;
    return `${ROWS[row]} ${COLS[col]}`;
  }

  /* ── 진형 터치 ───────────────────────────────────────────── */
  let longFired = false;

  function onCellTap(i) {
    if (!store) return;
    const name = store.formation[i];
    if (selected == null) {
      if (!name) { toast('먼저 옮길 장수를 탭해 주세요.'); return; }
      selected = i;
      paintGrid();
      sfx('ui');
      return;
    }
    if (selected === i) { selected = null; paintGrid(); return; }
    const from = selected;
    const a = store.formation[from];
    const b = store.formation[i];
    store.formation[from] = b;
    store.formation[i] = a;
    selected = null;
    saveStore();
    paintGrid();
    paintFoot();
    sfx('ui');
    toast(b ? `${a} ↔ ${b} 자리 바꿈` : `${a} → ${posName(i)}`);
  }

  function openInfo(i) {
    if (!store) return;
    const name = store.formation[i];
    const g = getGen(name);
    if (!g) return;
    const t = tierOf(g);
    const s = statsOf(name);
    const gb = equipBonusOf(name);
    const star = starOf(name);
    const stats = [
      ['통솔', s.leadership, gb.leadership], ['무력', s.war, gb.war], ['지력', s.intel, gb.intel],
      ['정치', s.politics, gb.politics], ['매력', s.charm, gb.charm],
    ];
    const rows = stats.map(([k, v, bonus]) => {
      const n = Math.max(0, Math.min(100, Math.round(v)));
      return `<div class="exp-stat-row"><span>${k}</span><span class="exp-stat-bar"><i style="width:${n}%"></i></span>`
        + `<b>${Math.round(v)}${bonus ? `<em class="exp-stat-up">+${Math.round(bonus)}</em>` : ''}</b></div>`;
    }).join('');
    const box = equipOf(name);
    const gearRows = GEAR_SLOTS.map((slot) => {
      const tt = treasureOf(gearItem(box[slot]));
      return `<div class="exp-eq-row mini"><span class="exp-eq-ic">${SLOT_ICON[slot]}</span>`
        + `<div><b>${SLOT_SHORT[slot]}</b><em>${tt ? tt.name : '비어 있음'}</em></div></div>`;
    }).join('');
    SK.modal({
      kicker: `${posName(i)} · ${t}급 ${g.job || ''} · ${g.faction}`,
      title: `${name} ${star >= 2 ? `★${star}` : ''}`,
      wide: false,
      body: `<div class="exp-stat-head">${faceHtml(name)}<div><b>${name}</b><span>${t}급 · ${g.job || '장수'} · ${g.faction} · 전투력 ${fmt(powerOf(name))}</span></div></div>`
        + rows
        + (g.skill ? `<div class="exp-skill-line">고유 기술 · <b>${g.skill}</b></div>` : '')
        + `<div class="exp-eq-mini">${gearRows}</div>`
        + `<p class="exp-note-line">★${star} — 별 1개마다 능력치 +12%. 진형에서 다른 칸을 탭하면 이 장수를 옮기거나 맞바꿀 수 있습니다.</p>`,
      actions: [{ label: '장비 바꾸기', onClick: () => { openEquip(name); } }, { label: '닫기', primary: true }],
    });
  }

  /* ══════════════════════════════════════════════════════════
     내 원정단 · 장비 장착
     ══════════════════════════════════════════════════════════ */
  function openRoster() {
    if (!store) store = loadStore();
    const rows = store.roster.map((name) => {
      const g = getGen(name);
      if (!g) return '';
      const slot = store.formation.indexOf(name);
      const placed = slot >= 0;
      const t = tierOf(g);
      const star = starOf(name);
      const gearN = GEAR_SLOTS.filter((sl) => equipOf(name)[sl]).length;
      return `<div class="exp-roster-row">`
        + faceHtml(name)
        + `<div class="exp-roster-main"><b>${name}${star >= 2 ? ` <em class="exp-star">★${star}</em>` : ''}</b><span>${t}급 · ${g.job || '장수'} · ${g.faction} · 전투력 ${fmt(powerOf(name))}</span>`
        + `<em>${placed ? posName(slot) + ' 배치됨' : '대기 중 (진형 밖)'} · 장비 ${gearN}/3</em></div>`
        + `<button type="button" class="exp-roster-btn gear" data-gear="${name}">장비</button>`
        + `<button type="button" class="exp-roster-btn ${placed ? 'off' : 'place'}" data-roster="${name}" data-act="${placed ? 'remove' : 'place'}">${placed ? '해제' : '배치'}</button>`
        + `</div>`;
    }).join('');
    const m = SK.modal({
      kicker: '내 원정단 · 장비',
      title: `보유 ${store.roster.length}명 · 출진 ${partyCount()}/${MAX_PARTY}명`,
      wide: true,
      body: `<div class="exp-roster">${rows || '<p class="exp-note-line">보유한 장수가 없습니다.</p>'}</div>`
        + `<div class="exp-skill-line" style="margin-top:10px">🎒 보유 장비 <b>${fmt(store.gear.length)}</b>점 · 장수마다 무기·방어구·보물 3칸</div>`
        + `<p class="exp-note-line">[배치]는 빈 칸(전열 → 중열 → 후열)에 차례로 넣고, [해제]는 진형에서 뺍니다. 진형은 최대 ${MAX_PARTY}명입니다. 장비는 전투력·전투 스탯에 바로 합산됩니다.</p>`,
      actions: [{ label: '닫기', primary: true }],
    });
    if (!m || !m.el) return;
    m.el.querySelectorAll('[data-roster]').forEach((b) => {
      b.onclick = () => {
        const name = b.dataset.roster;
        const act = b.dataset.act;
        const changed = act === 'place' ? placeGeneral(name) : removeGeneral(name);
        if (changed) { m.close(); setTimeout(openRoster, 90); }
      };
    });
    m.el.querySelectorAll('[data-gear]').forEach((b) => {
      b.onclick = () => { const n = b.dataset.gear; m.close(); setTimeout(() => openEquip(n), 90); };
    });
  }

  function openEquip(name, slot) {
    if (slot) { openGearPicker(name, slot); return; }
    const g = getGen(name);
    if (!g) return;
    const star = starOf(name);
    const box = equipOf(name);
    const s = statsOf(name);
    const gb = equipBonusOf(name);
    const rows = GEAR_SLOTS.map((sl) => {
      const tt = treasureOf(gearItem(box[sl]));
      return `<div class="exp-eq-row${tt ? '' : ' empty'}">`
        + `<span class="exp-eq-ic">${SLOT_ICON[sl]}</span>`
        + `<div class="exp-eq-main"><b>${SLOT_SHORT[sl]}</b>`
        + (tt ? `<span class="exp-eq-name">${tt.name} <em>${tt.grade || ''}</em></span><em>${tt.effect || ''}</em>`
          : `<em>비어 있음</em>`)
        + `</div>`
        + `<button type="button" class="exp-eq-btn" data-slot="${sl}" data-name="${name}" data-eq="pick">${tt ? '변경' : '장착'}</button>`
        + (tt ? `<button type="button" class="exp-eq-btn off" data-slot="${sl}" data-name="${name}" data-eq="off">해제</button>` : '')
        + `</div>`;
    }).join('');
    const bonusLine = ['war', 'leadership', 'intel'].filter((k) => gb[k]).map((k) => {
      const label = { war: '무력', leadership: '통솔', intel: '지력' }[k];
      return `${label} +${gb[k]}`;
    }).join(' · ');
    const m = SK.modal({
      kicker: `장비 장착 · ${g.faction} ${g.job}`,
      title: `${name} ${star >= 2 ? `★${star}` : ''}`,
      wide: true,
      body: `<div class="exp-stat-head">${faceHtml(name)}<div><b>전투력 ${fmt(powerOf(name))}</b>`
        + `<span>통솔 ${Math.round(s.leadership)} · 무력 ${Math.round(s.war)} · 지력 ${Math.round(s.intel)}</span>`
        + `<em class="exp-eq-bonus">${bonusLine ? '장비 합산 ' + bonusLine : '장비 없음'}</em></div></div>`
        + rows
        + `<p class="exp-note-line">장비 한 벌은 한 장수만 쓸 수 있습니다. 보유 장비 <b>${fmt(store.gear.length)}</b>점 · 뽑기로 더 캘 수 있습니다.</p>`,
      actions: [{ label: '원정단으로', onClick: () => { setTimeout(openRoster, 80); } }, { label: '닫기', primary: true }],
    });
    if (!m || !m.el) return;
    m.el.querySelectorAll('[data-eq]').forEach((b) => {
      b.onclick = () => {
        const nm = b.dataset.name, sl = b.dataset.slot, act = b.dataset.eq;
        if (act === 'pick') { m.close(); setTimeout(() => openGearPicker(nm, sl), 90); return; }
        unequipItem(nm, sl);
        m.close();
        setTimeout(() => openEquip(nm), 90);
      };
    });
  }

  function openGearPicker(name, slot) {
    const used = equippedIids();
    const list = (store.gear || []).filter((it) => {
      const t = treasureOf(it);
      if (!t || gearSlotOf(t) !== slot) return false;
      const owner = used[it.iid];
      return !owner || owner === name;
    });
    const rows = list.map((it) => {
      const t = treasureOf(it);
      const stats = Object.keys(t.statBonus || {}).map((k) => {
        const label = { war: '무력', leadership: '통솔', intel: '지력', politics: '정치', charm: '매력', move: '이동' }[k] || k;
        return `${label} +${t.statBonus[k]}`;
      }).join(' · ');
      return `<div class="exp-gear-row"><span class="exp-gear-ic">${TYPE_ICON[t.type] || '💎'}</span>`
        + `<div><b>${t.name}</b><em>${t.type || '보물'} · ${t.effect || ''}</em>`
        + `<em class="exp-gear-stat">${stats || '추가 능력치 없음'}</em></div>`
        + `<span class="exp-grade" style="--gc:${(SK.GRADE_COLOR && SK.GRADE_COLOR[t.grade]) || '#8a7a5a'}">${t.grade || '보물'}</span>`
        + `<button type="button" class="exp-gear-btn" data-iid="${it.iid}">장착</button></div>`;
    }).join('');
    const m = SK.modal({
      kicker: `${name} · ${SLOT_LABEL[slot]}`,
      title: `${SLOT_SHORT[slot]} 고르기`,
      wide: true,
      body: `<div class="exp-gear-list">${rows || `<p class="exp-note-line">이 칸에 낄 ${SLOT_SHORT[slot]} 장비가 없습니다.<br><b>🗡️ 장비(보물) 뽑기</b>로 캐 보세요.</p>`}</div>`,
      actions: [{ label: '돌아가기', onClick: () => { setTimeout(() => openEquip(name), 80); } }, { label: '닫기', primary: true }],
    });
    if (!m || !m.el) return;
    m.el.querySelectorAll('[data-iid]').forEach((b) => {
      b.onclick = () => {
        equipItem(name, b.dataset.iid);
        m.close();
        setTimeout(() => openEquip(name), 90);
      };
    });
  }

  function equipItem(name, iid) {
    const item = gearItem(iid);
    const t = treasureOf(item);
    if (!item || !t) { toast('장비를 찾을 수 없습니다.'); return false; }
    const slot = gearSlotOf(t);
    const used = equippedIids();
    if (used[iid] && used[iid] !== name) { toast(`${t.name}은(는) ${used[iid]}이(가) 쓰고 있습니다.`); sfx('deny'); return false; }
    store.equip[name] = store.equip[name] || {};
    store.equip[name][slot] = iid;
    saveStore();
    paintAll();
    sfx('ui');
    toast(`${name} — ${SLOT_SHORT[slot]}에 ${t.name} 장착`);
    return true;
  }

  function unequipItem(name, slot) {
    if (!store.equip[name] || !store.equip[name][slot]) return false;
    delete store.equip[name][slot];
    if (!Object.keys(store.equip[name]).length) delete store.equip[name];
    saveStore();
    paintAll();
    sfx('ui');
    toast(`${name} — ${SLOT_SHORT[slot]} 해제`);
    return true;
  }

  function placeGeneral(name) {
    if (!store) return false;
    if (store.formation.indexOf(name) >= 0) { toast(`${name}은(는) 이미 진형에 있습니다.`); return false; }
    if (partyCount() >= MAX_PARTY) { toast(`진형은 최대 ${MAX_PARTY}명까지 배치할 수 있습니다.`); return false; }
    const order = [1, 4, 7, 0, 2, 3, 5, 6, 8];
    const idx = order.find((i) => !store.formation[i]);
    if (idx == null) { toast('빈 칸이 없습니다.'); return false; }
    store.formation[idx] = name;
    selected = null;
    saveStore();
    paintGrid();
    paintFoot();
    sfx('ui');
    toast(`${name}을(를) ${posName(idx)}에 배치했습니다.`);
    return true;
  }

  function removeGeneral(name) {
    if (!store) return false;
    const idx = store.formation.indexOf(name);
    if (idx < 0) { toast(`${name}은(는) 진형에 없습니다.`); return false; }
    store.formation[idx] = null;
    if (selected === idx) selected = null;
    saveStore();
    paintGrid();
    paintFoot();
    sfx('deny');
    toast(`${name}을(를) 진형에서 뺐습니다.`);
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     뽑기 — 장수 / 장비
     ══════════════════════════════════════════════════════════ */
  function rawPool() {
    const list = (SK.GENERALS || []).filter((g) => g && g.name && ['S', 'A', 'B', 'C'].indexOf(g.tier) >= 0);
    const by = { S: [], A: [], B: [], C: [] };
    list.forEach((g) => { const t = tierOf(g); by[t].push(g); });
    return by;
  }

  function rollTier(minB) {
    const r = Math.random() * 100;
    let t = r < HERO_RATE.S ? 'S' : r < HERO_RATE.S + HERO_RATE.A ? 'A' : r < HERO_RATE.S + HERO_RATE.A + HERO_RATE.B ? 'B' : 'C';
    if (minB && t === 'C') t = 'B';
    return t;
  }

  function rollHero(minB) {
    const by = rawPool();
    let t = rollTier(minB);
    let arr = by[t];
    if (!arr.length) {
      const order = ['C', 'B', 'A', 'S'];
      for (let i = 0; i < order.length && !arr.length; i++) arr = by[order[i]];
      t = arr.length ? tierOf(arr[0]) : 'C';
    }
    if (!arr.length) return null;
    const g = arr[Math.floor(Math.random() * arr.length)];
    return { name: g.name, tier: tierOf(g), job: g.job, faction: g.faction || '군웅' };
  }

  function grantGeneral(name) {
    const owned = store.roster.indexOf(name) >= 0;
    const g = getGen(name) || {};
    if (!owned) {
      store.roster.push(name);
      store.stars[name] = 1;
      /* 뽑기로 새로 합류한 장수는 진형에 자동 배치하지 않는다 — 자리는 플레이어가 고른다 */
      return { name, tier: tierOf(g), job: g.job || '', faction: g.faction || '군웅', star: 1, isNew: true, tag: 'NEW', tagKind: 'new' };
    }
    const cur = starOf(name);
    if (cur < STAR_MAX) {
      store.stars[name] = cur + 1;
      return { name, tier: tierOf(g), job: g.job || '', faction: g.faction || '군웅', star: cur + 1, isNew: false, tag: `★${cur + 1}`, tagKind: 'star' };
    }
    addMerit(40);
    return { name, tier: tierOf(g), job: g.job || '', faction: g.faction || '군웅', star: cur, isNew: false, tag: '공훈+40', tagKind: 'refund' };
  }

  function placeSilently(name) {
    if (!store) return null;
    if (store.formation.indexOf(name) >= 0) return null;
    if (partyCount() >= MAX_PARTY) return null;
    const order = [1, 4, 7, 0, 2, 3, 5, 6, 8];
    const idx = order.find((i) => !store.formation[i]);
    if (idx == null) return null;
    store.formation[idx] = name;
    return idx;
  }

  function pullHeroOnce() { const h = rollHero(false); return h ? grantGeneral(h.name) : null; }

  function pullHero(n) {
    const out = [];
    for (let i = 0; i < n; i++) { const r = pullHeroOnce(); if (r) out.push(r); }
    if (n === 10) {
      const hasGood = out.some((r) => r.tier === 'S' || r.tier === 'A' || r.tagKind === 'new' || r.tagKind === 'star');
      if (!hasGood) {
        /* B 이상 보장 — 마지막 한 장만 다시 뽑는다 */
        const h = rollHero(true);
        if (h) { out[out.length - 1] = grantGeneral(h.name); }
      }
    }
    return out;
  }

  function rollGearGrade(minRare) {
    const r = Math.random() * 100;
    let acc = 0;
    let g = '일반';
    const order = ['전설', '영웅', '희귀', '일반'];
    for (let i = 0; i < order.length; i++) {
      acc += GEAR_RATE[order[i]] || 0;
      if (r < acc) { g = order[i]; break; }
    }
    if (minRare && g === '일반') g = '희귀';
    return g;
  }

  let iidSeq = 0;
  function newIid() {
    iidSeq = (iidSeq + 1) % 1000;
    return 'g' + Date.now().toString(36) + iidSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  function rollGearItem(minRare) {
    const all = (SK.TREASURES || []).filter((t) => t && t.name);
    if (!all.length) return null;
    let grade = rollGearGrade(minRare);
    let pool = all.filter((t) => t.grade === grade);
    if (!pool.length) { pool = all; grade = (pool[0] && pool[0].grade) || '일반'; }
    const t = pool[Math.floor(Math.random() * pool.length)];
    return { iid: newIid(), tid: t.id, treasure: t };
  }

  function pullGear(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const it = rollGearItem(false);
      if (!it) break;
      store.gear.push({ iid: it.iid, tid: it.tid });
      out.push(it);
    }
    if (n === 10 && out.length === 10) {
      const hasGood = out.some((it) => it.treasure.grade !== '일반');
      if (!hasGood) {
        /* 희귀 이상 보장 — 마지막 한 점을 다시 뽑는다 */
        store.gear.pop();
        const it = rollGearItem(true);
        if (it) { store.gear.push({ iid: it.iid, tid: it.tid }); out[out.length - 1] = it; }
      }
    }
    return out;
  }

  function summonCard(it, i, kind) {
    const delay = i * 70;
    if (kind === 'hero') {
      const g = getGen(it.name);
      return `<div class="exp-summon tier-${it.tier}" style="animation-delay:${delay}ms">`
        + `<span class="exp-face tf tier-${it.tier}"><img src="${portraitOf(it.name, g)}" alt="${it.name}" loading="lazy"></span>`
        + `<b>${it.name}</b>`
        + `<em>${it.faction} · ${it.job || '장수'}</em>`
        + `<span class="exp-summon-star">${it.star >= 2 ? starText(it.star) : ''}</span>`
        + `<span class="exp-summon-tag ${it.tagKind}">${it.tag}</span>`
        + `</div>`;
    }
    const t = it.treasure;
    const slot = gearSlotOf(t);
    const sub = (t.type && t.type !== SLOT_SHORT[slot]) ? `${SLOT_SHORT[slot]} · ${t.type}` : SLOT_SHORT[slot];
    const gc = (SK.GRADE_COLOR && SK.GRADE_COLOR[t.grade]) || '#8a7a5a';
    return `<div class="exp-summon gear grade-${gradeKey(t.grade)}" style="animation-delay:${delay}ms">`
      + `<span class="exp-gear-ic big">${TYPE_ICON[t.type] || '💎'}</span>`
      + `<b>${t.name}</b>`
      + `<em>${sub}</em>`
      + `<span class="exp-summon-tag" style="background:${gc}">${t.grade || '보물'}</span>`
      + `</div>`;
  }

  function pullBodyHead(merit) {
    return `<div class="exp-pull-head"><span class="exp-pull-cost">🏅 내 공훈 <b id="exp-pull-merit">${fmt(merit)}</b></span>`
      + `<span class="exp-pull-rate">S ${HERO_RATE.S}% · A ${HERO_RATE.A}% · B ${HERO_RATE.B}% · C ${HERO_RATE.C}%</span></div>`;
  }

  function openPullHero() {
    const m = SK.modal({
      kicker: '장수 공훈 뽑기',
      title: '공훈으로 장수를 부릅니다',
      wide: true,
      body: `<div id="exp-pull-wrap">`
        + pullBodyHead(readMerit())
        + `<p class="exp-pull-note">10회는 <b>B급 이상 1명 보장</b> · 중복 장수는 <b>★ 승급</b>(최대 5성, 별마다 능력치 +12%)</p>`
        + `<div class="exp-pull-stage" id="exp-pull-stage"><div class="exp-pull-idle"><span>🎴</span><p>공훈을 걸고 장수를 부릅니다.<br>먼저 [1회] 또는 [10회]를 눌러 주세요.</p></div></div>`
        + `<div class="exp-pull-btns"><button type="button" class="btn btn-paper" data-pull="1">1회 · 🏅 100</button>`
        + `<button type="button" class="btn btn-primary" data-pull="10">10회 · 🏅 900</button></div>`
        + `</div>`,
      actions: [{ label: '닫기', primary: true }],
    });
    bindPull(m, 'hero');
  }

  function openPullGear() {
    const m = SK.modal({
      kicker: '장비(보물) 뽑기',
      title: '공훈으로 보물을 캅니다',
      wide: true,
      body: `<div id="exp-pull-wrap">`
        + `<div class="exp-pull-head"><span class="exp-pull-cost">🏅 내 공훈 <b id="exp-pull-merit">${fmt(readMerit())}</b></span>`
        + `<span class="exp-pull-rate">전설 ${GEAR_RATE["전설"]}% · 영웅 ${GEAR_RATE["영웅"]}% · 희귀 ${GEAR_RATE["희귀"]}% · 일반 ${GEAR_RATE["일반"]}%</span></div>`
        + `<p class="exp-pull-note">10회는 <b>희귀 이상 1점 보장</b> · 뽑은 장비는 <b>무기 · 방어구 · 보물</b> 3칸에 장착합니다</p>`
        + `<div class="exp-pull-stage" id="exp-pull-stage"><div class="exp-pull-idle"><span>🗡️</span><p>본편의 250종 보물에서 캅니다.<br>먼저 [1회] 또는 [10회]를 눌러 주세요.</p></div></div>`
        + `<div class="exp-pull-btns"><button type="button" class="btn btn-paper" data-pull="1">1회 · 🏅 80</button>`
        + `<button type="button" class="btn btn-primary" data-pull="10">10회 · 🏅 720</button></div>`
        + `</div>`,
      actions: [{ label: '닫기', primary: true }],
    });
    bindPull(m, 'gear');
  }

  function bindPull(m, kind) {
    if (!m || !m.el) return;
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest ? e.target.closest('[data-pull]') : null;
      if (!b) return;
      const n = Number(b.dataset.pull) === 10 ? 10 : 1;
      doPull(kind, n, m);
    });
  }

  function doPull(kind, n, m) {
    if (!store) store = loadStore();
    const cost = kind === 'hero' ? COST_HERO[n] : COST_GEAR[n];
    if (readMerit() < cost) {
      toast(`공훈이 모자랍니다 (필요 ${fmt(cost)} · 보유 ${fmt(readMerit())})`);
      sfx('deny');
      return;
    }
    addMerit(-cost);
    const res = kind === 'hero' ? pullHero(n) : pullGear(n);
    saveStore();
    paintAll();
    const wrap = m.el.querySelector('#exp-pull-wrap');
    if (!wrap) return;
    const meritEl = wrap.querySelector('#exp-pull-merit');
    if (meritEl) meritEl.textContent = fmt(readMerit());
    const stage = wrap.querySelector('#exp-pull-stage');
    if (!stage) return;
    if (!res.length) {
      stage.innerHTML = `<div class="exp-pull-idle"><span>😥</span><p>뽑을 대상이 없습니다.<br>데이터를 불러오는 중일 수 있습니다.</p></div>`;
      return;
    }
    const best = kind === 'hero'
      ? ['S', 'A', 'B', 'C'].map((t) => `${t} ${res.filter((r) => r.tier === t).length}`).filter((s) => !/ 0$/.test(s)).join(' · ')
      : ['전설', '영웅', '희귀', '일반'].map((g) => `${g} ${res.filter((r) => r.treasure.grade === g).length}`).filter((s) => !/ 0$/.test(s)).join(' · ');
    stage.innerHTML = `<div class="exp-pull-sum"><b>${n === 10 ? '10연' : '1회'} 결과</b><span>${best}</span></div>`
      + `<div class="exp-summon-grid${res.length > 4 ? ' ten' : ''}">${res.map((r, i) => summonCard(r, i, kind)).join('')}</div>`
      + (kind === 'hero' && res.some((r) => r.tagKind === 'new')
        ? `<p class="exp-pull-hint">새 장수 <b>${res.filter((r) => r.tagKind === 'new').length}명</b> 합류 — 창을 닫고 <b>내 원정단 · 장비</b>에서 진형에 배치하세요.</p>`
        : '')
      + (kind === 'gear' ? `<p class="exp-pull-hint">장비는 <b>내 원정단 · 장비</b>에서 장수별 3칸에 장착합니다.</p>` : '');
    const hasTop = kind === 'hero'
      ? res.some((r) => r.tier === 'S' || r.tier === 'A')
      : res.some((r) => r.treasure.grade === '전설' || r.treasure.grade === '영웅');
    sfx(hasTop ? 'levelup' : 'coin');
  }

  function openBondList() {
    const party = partyNames();
    const rows = BONDS.map((b) => {
      const on = b.members.every((m) => party.indexOf(m) >= 0);
      const chips = b.members.map((m) => {
        const has = party.indexOf(m) >= 0;
        return `<span class="exp-bond-mem${has ? ' on' : ''}">${has ? '✓ ' : ''}${m}</span>`;
      }).join('');
      return `<div class="exp-bond-row${on ? ' on' : ''}"><div class="exp-bond-head"><b>${b.icon} ${b.name}</b>`
        + `<span class="exp-bond-badge">${on ? '활성' : '조합 전'}</span></div>`
        + `<em>${b.desc}</em><div class="exp-bond-mems">${chips}</div></div>`;
    }).join('');
    const s = partySynergy();
    const factLine = s.faction
      ? `${s.faction.faction} ${s.faction.count}명 — 공·방·체 +${pct(s.faction.tier.atk)}${s.faction.tier.crit ? ` · 치명 +${pct(s.faction.tier.crit)}` : ''}${s.faction.tier.gauge ? ' · 필살 게이지 충전 가속' : ''}`
      : '같은 세력 3명부터 (4명 · 5명은 더 강하게)';
    SK.modal({
      kicker: '세력 시너지 · 인연',
      title: '조합을 맞추면 진형이 강해집니다',
      wide: true,
      body: `<div class="exp-bond-faction">같은 세력 <b>3명 → +10%</b> · <b>4명 → +18% +치명 5%</b> · <b>5명 → +28% +치명 10% +필살 가속</b><br>`
        + `<em>${factLine}</em></div>`
        + `<p class="exp-note-line" style="margin:-2px 0 6px">세력 시너지는 <b>촉·위·오·군웅·한국</b> 다섯 세력만 셀니다 — 재야(在野) 인물은 어느 세력에도 들지 않습니다. 인연은 세력과 상관없이 맞춰집니다.</p>`
        + rows,
      actions: [{ label: '닫기', primary: true }],
    });
  }

  /* ══════════════════════════════════════════════════════════
     3×3 풀오토 전투
     ══════════════════════════════════════════════════════════ */
  const STAGE_DEFS = [
    {
      n: 1, name: '황건 정찰대', sub: '길목을 지키는 황건 패잔병',
      story: '“주공을 찾아 떠난 길에 황건적이 판을 깔았구먼.” 미축이 셈을 놓고, 미방이 창을 세웁니다.',
      groups: [{ name: '황건 정찰병', job: '산적', L: 26, W: 28, I: 6, c: 3 }, { name: '황건 패잔병', job: '창병', L: 24, W: 25, I: 5, c: 2 }],
    },
    {
      n: 2, name: '황건 도적떼', sub: '마을을 턴 황건 도적들이 길을 막습니다',
      story: '“저 놈들, 곡식을 다 털어 갔습니다.” 간옹이 웃음을 거두고 부채를 접습니다.',
      groups: [{ name: '황건 도적', job: '산적', L: 32, W: 36, I: 8, c: 5 }],
    },
    {
      n: 3, name: '황건 무리', sub: '술사를 앞세운 황건의 무리',
      story: '“저 술사가 군사를 부린다. 먼저 끊어야 해!” 미방이 창을 낮게 잡습니다.',
      groups: [{ name: '황건 도적', job: '산적', L: 36, W: 42, I: 10, c: 4 }, { name: '황건 술사', job: '도사', L: 30, W: 18, I: 44, c: 1 }],
    },
    {
      n: 4, name: '황건 정예', sub: '붉은 수건을 두른 정예 부대',
      story: '“황건 정예라… 오합지졸이 아니야.” 미축이 군자금을 셈하며 진형을 고릅니다.',
      groups: [{ name: '황건 정예', job: '창병', L: 44, W: 50, I: 14, c: 6 }],
    },
    {
      n: 5, name: '장량의 진', sub: '중간보스 · 장량', boss: '장량',
      story: '“인공장군(人公將軍) 장량이다!” 술법으로 안개를 일으키며 황건 부대가 밀려옵니다.',
      groups: [{ name: '장량', boss: true, job: '도사', L: 74, W: 66, I: 76, c: 1, scale: 1.55 }, { name: '황건 정예', job: '창병', L: 46, W: 52, I: 14, c: 4 }],
    },
    {
      n: 6, name: '태평도 신도', sub: '태평도의 신도들이 물결처럼 밀려옵니다',
      story: '“태평(太平)을 외치는 자들이 길마다 깔렸어. 하나하나 뚫자고.”',
      groups: [{ name: '태평도 신도', job: '무도가', L: 54, W: 58, I: 20, c: 5 }, { name: '황건 술사', job: '도사', L: 44, W: 24, I: 58, c: 1 }],
    },
    {
      n: 7, name: '태평도 주력', sub: '태평도의 주력 군세',
      story: '“여기서 밀리면 남양으로 가는 길이 막힌다.” 간옹이 목소리를 낮춥니다.',
      groups: [{ name: '태평도 주력', job: '창병', L: 60, W: 64, I: 24, c: 6 }, { name: '황건 술사', job: '도사', L: 48, W: 26, I: 62, c: 1 }],
    },
    {
      n: 8, name: '장보의 진', sub: '보스 · 장보', boss: '장보',
      story: '“지공장군(地公將軍) 장보가 직접 나섰다!” 황건 정예가 방패처럼 늘어섭니다.',
      groups: [{ name: '장보', boss: true, job: '도사', L: 75, W: 64, I: 78, c: 1, scale: 1.62 }, { name: '황건 정예', job: '창병', L: 60, W: 64, I: 22, c: 5 }],
    },
    {
      n: 9, name: '남양 최후 저지선', sub: '남양으로 가는 마지막 길목',
      story: '“저기만 뚫으면 남양이다. 전열을 단단히 세워!” 미방이 앞에 섭니다.',
      groups: [{ name: '남양 결사대', job: '검병', L: 72, W: 76, I: 30, c: 5 }, { name: '황건 술사', job: '도사', L: 60, W: 30, I: 72, c: 2 }],
    },
    {
      n: 10, name: '장각의 진', sub: '최종보스 · 장각', boss: '장각',
      story: '“창천이사(蒼天已死)… 황천당립(黃天當立)!” 장각의 술법이 하늘을 붉게 물들입니다. 마지막 관문입니다.',
      groups: [{ name: '장각', boss: true, job: '도사', L: 86, W: 36, I: 88, c: 1, scale: 1.9 }, { name: '황건 정예', job: '창병', L: 70, W: 74, I: 30, c: 6 }],
    },
  ];

  function buildEnemies(stage) {
    const def = STAGE_DEFS[clamp(stage, 1, STAGES) - 1];
    const list = [];
    (def.groups || []).forEach((gr) => { for (let i = 0; i < (gr.c || 1); i++) list.push(gr); });
    const slots = [1, 0, 2, 4, 3, 5, 7, 6, 8];
    const seen = {};
    return list.slice(0, 9).map((gr, i) => {
      seen[gr.name] = (seen[gr.name] || 0) + 1;
      const idx = seen[gr.name];
      const cnt = list.filter((x) => x === gr).length;
      const name = gr.boss ? gr.name : (cnt > 1 ? `${gr.name} ${idx}` : gr.name);
      const sc = gr.scale || 1;
      return {
        name,
        job: gr.job || '산적',
        boss: !!gr.boss,
        slot: slots[i],
        L: (gr.L || 30) * sc,
        W: (gr.W || 30) * sc,
        I: (gr.I || 10) * sc,
        hpMult: gr.boss ? 0.6 : 0,
        faction: '군웅',
      };
    });
  }

  function makeUnit(o) {
    const ranged = isRangedJob(o.job);
    const hp = Math.max(120, Math.round((o.L * 10 + o.W * 6) * (1 + (o.hpMult || 0))));
    const atk = (o.W * 1.0 + o.I * 0.35 + o.L * 0.25) * (1 + (o.atkMult || 0));
    const def = (o.L * 0.9 + o.W * 0.2) * (1 + (o.defMult || 0));
    const spd = 46 + o.L * 0.18 + (ranged ? 8 : 0) + (o.move || 0) * 2;
    return {
      uid: o.uid,
      side: o.side,
      name: o.name,
      job: o.job,
      faction: o.faction || '군웅',
      tier: o.tier || 'C',
      slot: o.slot,
      row: Math.floor(o.slot / 3),
      portrait: o.portrait,
      star: o.star || 0,
      boss: !!o.boss,
      skill: o.skill || '',
      hp, maxHp: hp,
      atk, def, spd,
      crit: o.crit == null ? 0.08 : o.crit,
      spell: o.spell || 0,
      skillBoost: o.skillBoost || 0,
      gaugeBoost: o.gaugeBoost || 0,
      shield: Math.round(hp * (o.shield || 0)),
      shieldMax: Math.round(hp * (o.shield || 0)),
      gauge: 0,
      alive: true,
      interval: Math.max(620, Math.min(1900, 2400 - spd * 12)),
      nextAt: 0,
      dmg: 0,
    };
  }

  function createBattle(stage, names) {
    const syn = synergyOf(names);
    const allies = [];
    names.forEach((name) => {
      const g = getGen(name);
      const st = statsOf(name);
      if (!g || !st) return;
      const slot = store.formation.indexOf(name);
      allies.push(makeUnit({
        uid: 'a' + allies.length,
        side: 'ally',
        name,
        job: g.job || '검병',
        faction: g.faction || '군웅',
        tier: tierOf(g),
        slot: slot >= 0 ? slot : [1, 4, 7, 0, 2][allies.length] || 0,
        portrait: portraitOf(name, g),
        star: starOf(name),
        skill: g.skill || '',
        L: st.leadership, W: st.war, I: st.intel,
        move: st.move,
        hpMult: syn.hp,
        atkMult: syn.atk,
        defMult: syn.def,
        crit: 0.08 + syn.crit,
        spell: syn.spell,
        skillBoost: syn.skill,
        gaugeBoost: syn.gauge,
        shield: syn.shield,
      }));
    });
    const enemies = buildEnemies(stage).map((e, i) => makeUnit({
      uid: 'e' + i,
      side: 'enemy',
      name: e.name,
      job: e.job,
      faction: e.faction,
      tier: e.boss ? (getGen(e.name) ? tierOf(getGen(e.name)) : 'A') : 'C',
      slot: e.slot,
      portrait: e.boss ? portraitOf(e.name, getGen(e.name)) : jobPortrait(e.job),
      star: 0,
      boss: e.boss,
      skill: e.boss && getGen(e.name) ? (getGen(e.name).skill || '') : '',
      L: e.L, W: e.W, I: e.I,
      hpMult: e.hpMult,
      crit: e.boss ? 0.12 : 0.06,
    }));
    const B = {
      stage, speed: 1, time: 0, acts: 0, turn: 1, over: false, win: false, ui: true,
      units: allies.concat(enemies), log: [], syn, names: names.slice(),
    };
    B.units.forEach((u, i) => { u.nextAt = 240 + i * 110 + Math.floor(Math.random() * 120); });
    return B;
  }

  /* ── 피해 계산 ───────────────────────────────────────────── */
  function rollDamage(a, t, ratio, kind) {
    let atk = a.atk;
    if (kind === 'spell') atk *= 1 + (a.spell || 0);
    if (kind === 'skill') atk *= 1 + (a.skillBoost || 0);
    let dmg = atk * ratio - t.def * 0.45;
    dmg *= 0.92 + Math.random() * 0.16;
    const crit = Math.random() < (a.crit || 0.08);
    if (crit) dmg *= 1.6;
    return { dmg: Math.max(6, Math.round(dmg)), crit };
  }

  function applyDamage(src, tgt, raw) {
    let dmg = raw;
    if (tgt.shield > 0) {
      const abs = Math.min(tgt.shield, dmg);
      tgt.shield -= abs;
      dmg -= abs;
    }
    tgt.hp -= dmg;
    src.dmg += raw;
    if (tgt.hp <= 0) { tgt.hp = 0; tgt.alive = false; }
    return dmg;
  }

  function pickTarget(u, foes) {
    const live = foes.filter((f) => f.alive);
    if (!live.length) return null;
    if (!isRangedJob(u.job)) {
      for (let r = 0; r < 3; r++) {
        const row = live.filter((t) => t.row === r);
        if (row.length) return row[Math.floor(Math.random() * row.length)];
      }
      return live[0];
    }
    const back = live.filter((t) => t.row === 2);
    if (back.length && Math.random() < 0.45) return back[Math.floor(Math.random() * back.length)];
    const sorted = live.slice().sort((a, b) => (a.row - b.row) || (a.hp / a.maxHp) - (b.hp / b.maxHp));
    return sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
  }

  function logLine(text) {
    if (!B) return;
    B.log.push(text);
    if (B.log.length > 24) B.log.shift();
    if (B.ui) {
      const el = $('eb-log');
      if (el) el.textContent = B.log.slice(-2).join('  ·  ');
    }
  }

  function popupAt(uid, text, kind) {
    if (!B || !B.ui) return;
    const cell = document.querySelector(`#exp-battle [data-uid="${uid}"]`);
    if (!cell) return;
    const s = document.createElement('span');
    s.className = 'eb-pop ' + (kind || '');
    s.textContent = text;
    cell.appendChild(s);
    setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, B.speed > 1 ? 520 : 820);
  }

  function banner(text, sub, kind) {
    if (!B || !B.ui) return;
    const el = $('eb-banner');
    if (!el) return;
    el.className = 'eb-banner ' + (kind || '');
    el.innerHTML = `<b>${text}</b>${sub ? `<em>${sub}</em>` : ''}`;
    el.hidden = false;
    /* 같은 배너가 연달아 떠도 애니메이션이 다시 돌도록 */
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, B.speed > 1 ? 620 : 900);
  }

  function act(u) {
    if (!B || B.over || !u.alive) return;
    const foes = B.units.filter((x) => x.side !== u.side);
    const mates = B.units.filter((x) => x.side === u.side && x.alive);
    if (!foes.some((f) => f.alive) || !mates.length) return;

    u.nextAt = B.time + u.interval;
    B.acts += 1;
    B.turn = 1 + Math.floor(B.acts / 8);

    const ult = u.gauge >= 100;
    if (ult) u.gauge = 0;

    if (ult && HEAL_JOBS.indexOf(u.job) >= 0) {
      const hurt = mates.slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      if (hurt) {
        const heal = Math.round(hurt.maxHp * 0.28 + u.atk * 0.8);
        hurt.hp = Math.min(hurt.maxHp, hurt.hp + heal);
        popupAt(hurt.uid, '+' + fmt(heal), 'heal');
        logLine(`${u.name} 치유 → ${hurt.name} +${fmt(heal)}`);
      }
      banner(u.name, u.skill || '치유의 노래', u.side);
      sfx('heal');
    } else if (ult && AOE_JOBS.indexOf(u.job) >= 0) {
      const targets = foes.filter((f) => f.alive);
      banner(u.name, u.skill || (isCasterJob(u.job) ? '책략' : '연사'), u.side);
      sfx(isCasterJob(u.job) ? 'spell' : 'bolt');
      targets.forEach((t) => {
        const r = rollDamage(u, t, 1.1, isCasterJob(u.job) ? 'spell' : 'normal');
        const real = applyDamage(u, t, r.dmg);
        popupAt(t.uid, String(real), r.crit ? 'crit' : (u.side === 'ally' ? '' : 'hurt'));
        if (!t.alive) logLine(`${u.name} → ${t.name} 격파!`);
      });
      if (u.side === 'ally') logLine(`${u.name} ${isCasterJob(u.job) ? '책략' : '연사'} — 적 전체!`);
      else logLine(`${u.name}의 술법이 아군 전체를 덮칩니다!`);
    } else {
      const t = pickTarget(u, foes);
      if (t) {
        const r = rollDamage(u, t, ult ? 2.6 : 1.25, isCasterJob(u.job) ? 'spell' : (ult ? 'skill' : 'normal'));
        const real = applyDamage(u, t, r.dmg);
        popupAt(t.uid, (r.crit ? '!' : '') + String(real), r.crit ? 'crit' : (u.side === 'ally' ? '' : 'hurt'));
        if (ult) { banner(u.name, u.skill || '필살', u.side); sfx(u.side === 'ally' ? 'sword' : 'hit'); }
        if (!t.alive) logLine(`${u.name} → ${t.name} 격파!`);
        else logLine(`${u.name} → ${t.name} ${fmt(real)}`);
      }
    }

    /* 게이지 — 때린 쪽 +18(시너지 가속), 맞은 쪽 +7 */
    if (u.alive) u.gauge = Math.min(100, u.gauge + 18 * (1 + (u.gaugeBoost || 0)));
    foes.forEach((f) => { if (f.alive) f.gauge = Math.min(100, f.gauge + 7); });

    checkEnd();
  }

  function checkEnd() {
    if (!B || B.over) return;
    const alliesLeft = B.units.some((u) => u.side === 'ally' && u.alive);
    const enemiesLeft = B.units.some((u) => u.side === 'enemy' && u.alive);
    if (!enemiesLeft) finishBattle(true);
    else if (!alliesLeft) finishBattle(false);
  }

  /* ── 전투 화면 ───────────────────────────────────────────── */
  let B = null;

  function unitCell(u) {
    if (!u) return `<div class="eb-unit blank"></div>`;
    const cls = ['eb-unit', u.side, 'tier-' + u.tier];
    if (!u.alive) cls.push('dead');
    if (u.boss) cls.push('boss');
    return `<div class="${cls.join(' ')}" data-uid="${u.uid}" style="--fc:${factionColor(u.faction)}">`
      + `<div class="eb-uhead"><span class="exp-face tf tier-${u.tier}"><img src="${u.portrait}" alt="${u.name}" loading="lazy"></span>`
      + `<span class="eb-uname">${u.name}${u.star >= 2 ? `<em>★${u.star}</em>` : ''}</span></div>`
      + `<div class="eb-hp"><i style="width:${Math.round(100 * u.hp / u.maxHp)}%"></i></div>`
      + `<div class="eb-gg"><i style="width:${Math.round(u.gauge)}%"></i></div>`
      + `</div>`;
  }

  function ensureBattleDom() {
    let el = $('exp-battle');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'exp-battle';
    el.className = 'exp-battle';
    el.hidden = true;
    el.innerHTML = `
      <header class="eb-top">
        <button id="eb-exit" class="eb-btn" type="button" aria-label="전투에서 나가기">✕</button>
        <div class="eb-title"><small id="eb-stage">1관</small><b id="eb-name">황건 정찰대</b></div>
        <button id="eb-speed" class="eb-btn eb-speed" type="button" aria-label="배속">1×</button>
        <span class="eb-turn" id="eb-turn">1턴</span>
      </header>
      <div class="eb-bonds" id="eb-bonds"></div>
      <div class="eb-field">
        <div class="eb-side enemy"><span class="eb-side-tag">적</span><div class="eb-grid" id="eb-enemy"></div></div>
        <div class="eb-mid"><span>⚔</span></div>
        <div class="eb-side ally"><span class="eb-side-tag">아군</span><div class="eb-grid" id="eb-ally"></div></div>
      </div>
      <div class="eb-foot"><p id="eb-log">전투 준비…</p><div class="eb-count" id="eb-count"></div></div>
      <div class="eb-banner" id="eb-banner" hidden></div>`;
    /* #modal-root 와 같은 스택 안에 넣어야 결과창(모달)이 전투 화면 위로 올라온다 */
    const host = $('app') || document.body;
    const root = $('modal-root');
    if (root && root.parentNode === host) host.insertBefore(el, root);
    else host.appendChild(el);
    const exit = el.querySelector('#eb-exit');
    if (exit) exit.onclick = () => { closeBattle(); toast('전투에서 나왔습니다 (잃는 것은 없습니다)'); };
    const sp = el.querySelector('#eb-speed');
    if (sp) sp.onclick = () => {
      if (!B) return;
      B.speed = B.speed >= 2 ? 1 : 2;
      sp.textContent = B.speed + '×';
      el.classList.toggle('x2', B.speed >= 2);
      sfx('ui');
    };
    return el;
  }

  function renderBattle() {
    const el = ensureBattleDom();
    el.hidden = false;
    el.classList.toggle('x2', B.speed >= 2);
    const sp = $('eb-speed');
    if (sp) sp.textContent = B.speed + '×';
    const def = STAGE_DEFS[B.stage - 1] || {};
    const st = $('eb-stage'); if (st) st.textContent = `${B.stage}관${def.boss ? ' · 보스' : ''}`;
    const nm = $('eb-name'); if (nm) nm.textContent = def.name || '';
    const tn = $('eb-turn'); if (tn) tn.textContent = '1턴';
    /* 세력 시너지 · 인연 배지 */
    const bb = $('eb-bonds');
    if (bb) {
      const bits = [];
      if (B.syn.faction) bits.push(`<span class="eb-badge fact" style="--fc:${factionColor(B.syn.faction.faction)}">${B.syn.faction.faction} ${B.syn.faction.count}명 +${pct(B.syn.faction.tier.atk)}</span>`);
      B.syn.bonds.forEach((b) => bits.push(`<span class="eb-badge bond">${b.icon} ${b.name}</span>`));
      bb.innerHTML = bits.join('') || `<span class="eb-badge none">시너지 없음 — 같은 세력 3명으로 맞추면 강해집니다</span>`;
    }
    /* 적은 후열이 위로 오게(마주 보게) 그린다 */
    const enemyGrid = $('eb-enemy');
    if (enemyGrid) {
      const order = [6, 7, 8, 3, 4, 5, 0, 1, 2];
      enemyGrid.innerHTML = order.map((slot) => unitCell(B.units.find((u) => u.side === 'enemy' && u.slot === slot))).join('');
    }
    const allyGrid = $('eb-ally');
    if (allyGrid) {
      allyGrid.innerHTML = [0, 1, 2, 3, 4, 5, 6, 7, 8]
        .map((slot) => unitCell(B.units.find((u) => u.side === 'ally' && u.slot === slot))).join('');
    }
    const lg = $('eb-log'); if (lg) lg.textContent = '전투 시작!';
    paintBattle();
  }

  function paintBattle() {
    if (!B || !B.ui) return;
    B.units.forEach((u) => {
      const cell = document.querySelector(`#exp-battle [data-uid="${u.uid}"]`);
      if (!cell) return;
      const hp = cell.querySelector('.eb-hp > i');
      if (hp) hp.style.width = Math.max(0, Math.min(100, 100 * u.hp / u.maxHp)) + '%';
      const gg = cell.querySelector('.eb-gg > i');
      if (gg) gg.style.width = Math.max(0, Math.min(100, u.gauge)) + '%';
      if (!u.alive && !cell.classList.contains('dead')) cell.classList.add('dead');
      cell.classList.toggle('shielded', u.shield > 0 && u.alive);
      cell.classList.toggle('ready', u.gauge >= 100 && u.alive);
    });
    const tn = $('eb-turn'); if (tn) tn.textContent = B.turn + '턴';
    const live = B.units.filter((u) => u.side === 'enemy' && u.alive).length;
    const total = B.units.filter((u) => u.side === 'enemy').length;
    const cnt = $('eb-count'); if (cnt) cnt.textContent = `적 ${live}/${total}`;
  }

  function tick() {
    if (!B || B.over || document.hidden) return;
    B.time += 80 * B.speed;
    let guard = 0, acted = false;
    while (!B.over && guard++ < 14) {
      const due = B.units.filter((u) => u.alive && u.nextAt <= B.time)
        .sort((a, b) => a.nextAt - b.nextAt)[0];
      if (!due) break;
      act(due);
      acted = true;
    }
    if (acted || guard > 1) paintBattle();
  }

  function startBattle(stage) {
    if (!store) store = loadStore();
    const names = partyNames();
    if (!names.length) { toast('진형에 장수를 먼저 배치해 주세요.'); sfx('deny'); return false; }
    if (B && B.timer) clearInterval(B.timer);
    B = createBattle(stage, names);
    B.ui = true;
    renderBattle();
    sfx('drum');
    try { if (SK.bgm) SK.bgm('battle_field'); } catch (e) { /* ignore */ }
    B.timer = setInterval(tick, 80);
    return true;
  }

  function closeBattle() {
    if (B && B.timer) clearInterval(B.timer);
    const el = $('exp-battle');
    if (el) el.hidden = true;
    B = null;
    try { if (SK.bgm) SK.bgm('title'); } catch (e) { /* ignore */ }
  }

  function finishBattle(win) {
    if (!B || B.over) return;
    B.over = true;
    B.win = win;
    if (B.timer) clearInterval(B.timer);
    sfx(win ? 'victory' : 'defeat');
    if (!B.ui) return;
    paintBattle();
    const snap = { stage: B.stage, turn: B.turn, win };
    setTimeout(() => { if (B === null) return; showResult(snap); }, 680);
  }

  function stageFirstCleared(stage) {
    return store.cleared.indexOf(stage) < 0;
  }

  function showResult(snap) {
    const stage = snap.stage;
    const win = snap.win;
    const def = STAGE_DEFS[stage - 1] || {};
    if (!win) {
      const left = B ? B.units.filter((u) => u.side === 'enemy' && u.alive).length : 0;
      SK.modal({
        kicker: `${stage}관 · ${def.name || ''}`,
        title: '아쉽게 밀렸습니다',
        wide: true,
        dismissible: false,
        body: `<div class="exp-result lose"><span class="exp-result-mark">😤</span>`
          + `<p class="exp-result-lead">아군이 모두 쓰러졌습니다. <b>잃은 것은 없습니다.</b></p>`
          + `<div class="exp-result-rows"><div><span>남은 적</span><b>${left}명</b></div>`
          + `<div><span>버틴 턴</span><b>${snap.turn}턴</b></div></div>`
          + `<p class="exp-note-line">뽑기로 장수를 더 모으고 ★승급·장비를 맞춘 뒤 다시 도전하세요. 같은 관문은 몇 번이든 무료로 재도전할 수 있습니다.</p></div>`,
        actions: [
          { label: '대기실로', onClick: () => { closeBattle(); paintAll(); } },
          { label: '다시 도전', primary: true, onClick: () => { closeBattle(); startBattle(stage); } },
        ],
      });
      return;
    }

    /* 보상 정산 */
    const first = stageFirstCleared(stage);
    let merit = 120 + stage * 60 + (BOSSES[stage] ? 200 : 0);
    let given = merit;
    if (first) {
      store.cleared.push(stage);
      store.cleared.sort((a, b) => a - b);
      if (stage >= store.progress) store.progress = Math.min(STAGES, stage + 1);
    } else {
      given = Math.max(20, Math.round(merit * 0.25));
    }
    addMerit(given);

    /* 10관 첫 클리어 — 유비(★1) 영입 (이 상은 진형 빈 칸에 바로 배치해 준다) */
    let recruit = null;
    if (stage === STAGES && first) {
      recruit = grantGeneral('유비');
      if (recruit.isNew || recruit.star === 1) { recruit.placed = placeSilently('유비'); }
    }
    saveStore();
    paintAll();

    const syn = B ? B.syn : partySynergy();
    const rows = `<div class="exp-result-rows">`
      + `<div><span>소요 턴</span><b>${snap.turn}턴</b></div>`
      + `<div><span>남은 아군</span><b>${B ? B.units.filter((u) => u.side === 'ally' && u.alive).length : 0}명</b></div>`
      + `<div><span>공훈 보상</span><b>+${fmt(given)}${first ? ' <em class="exp-first">첫 클리어</em>' : ''}</b></div>`
      + `</div>`;

    if (stage === STAGES && recruit) {
      const g = getGen('유비');
      SK.modal({
        kicker: '제1막 완료 · 황건적의 난',
        title: '장각을 무너뜨렸습니다!',
        wide: true,
        dismissible: false,
        body: `<div class="exp-congrats"><span class="exp-congrats-ray"></span>`
          + `<span class="exp-congrats-face exp-face tf tier-S"><img src="${portraitOf('유비', g)}" alt="유비"></span>`
          + `<b>${recruit.isNew ? '유비(劉備)가 원정단에 합류합니다' : `유비가 ★${recruit.star}로 승급했습니다`}</b>`
          + `<em>${recruit.isNew ? '하늘은 다시 밝아지고, 주공을 찾아가는 길이 열렸습니다.' : '이미 함께하는 유비가 더 강해졌습니다. 별마다 능력치 +12%.'}</em>`
          + `<div class="exp-recruit-row"><span class="exp-face tf tier-S"><img src="${portraitOf('유비', g)}" alt=""></span>`
          + `<div><b>유비 ${recruit.isNew ? '★1' : '★' + recruit.star}</b><em>${recruit.isNew ? 'NEW · 촉 · 군주' : '중복 → ★ 승급'}</em></div>`
          + `<span class="exp-recruit-badge">${recruit.isNew ? '영입' : '★' + recruit.star}</span></div>`
          + `</div>`
          + rows
          + `<p class="exp-note-line">유비를 ${recruit.placed != null ? '진형 빈 칸에 배치했습니다' : '[내 원정단]에서 진형에 배치하세요'}. 도원결의(유비·관우·장비)를 맞추면 공격 +20% · HP +15%!</p>`,
        actions: [{ label: '대기실로', primary: true, onClick: () => { closeBattle(); paintAll(); } }],
      });
      return;
    }

    const nextStage = stage + 1;
    const canNext = nextStage <= STAGES;
    SK.modal({
      kicker: `${stage}관 · ${def.name || ''}`,
      title: first ? '관문 돌파!' : '다시 이겼습니다',
      wide: true,
      dismissible: false,
      body: `<div class="exp-result win"><span class="exp-result-mark">🏆</span>`
        + `<p class="exp-result-lead">${def.boss ? `<b>${def.boss}</b>를 꺾었습니다!` : '적을 모두 물리쳤습니다.'}</p>`
        + rows
        + (syn.faction || syn.bonds.length
          ? `<p class="exp-result-syn">이번 전투 시너지 · ${syn.faction ? `${syn.faction.faction} ${syn.faction.count}명 +${pct(syn.faction.tier.atk)}` : ''}${syn.faction && syn.bonds.length ? ' · ' : ''}${syn.bonds.map((b) => b.name).join(' · ')}</p>`
          : '')
        + (first && stage === 4 ? `<p class="exp-note-line">5관은 중간보스 <b>장량</b>의 술법 진입니다. 뽑기·★승급으로 전열을 단단히 세우세요.</p>` : '')
        + (first && stage === 8 ? `<p class="exp-note-line">10관 최종보스 <b>장각</b>이 기다립니다. 첫 클리어 보상은 <b>유비 영입</b>!</p>` : '')
        + `</div>`,
      actions: [
        { label: '대기실로', onClick: () => { closeBattle(); paintAll(); } },
        canNext
          ? { label: `${nextStage}관 도전`, primary: true, onClick: () => { closeBattle(); openSortie(nextStage); } }
          : { label: '재도전', primary: true, onClick: () => { closeBattle(); startBattle(stage); } },
      ],
    });
  }

  /* ══════════════════════════════════════════════════════════
     출진 · 메뉴
     ══════════════════════════════════════════════════════════ */
  function openSortie(stage) {
    if (!store) return;
    if (partyCount() === 0) { toast('진형에 장수를 먼저 배치해 주세요.'); return; }
    const prog = stage || store.progress;
    const def = STAGE_DEFS[clamp(prog, 1, STAGES) - 1];
    const power = partyPower();
    const reco = 4500 + (prog - 1) * 450;
    const syn = partySynergy();
    const faces = partyNames().slice(0, 5).map((n) => faceHtml(n)).join('');
    const ahead = power >= reco;
    const badge = `<span class="exp-reco ${ahead ? 'ok' : 'low'}">${ahead ? '충분' : '권장 미달'}</span>`;
    SK.modal({
      kicker: `제1막 · 황건적의 난 · ${prog}관문`,
      title: def.boss ? `${prog}관문 · ${def.name}` : `${prog}관문 · ${def.name}`,
      wide: true,
      body: `<div class="exp-story">`
        + `<p>“${def.story || ''}”</p>`
        + (def.boss ? `<p class="exp-story-boss"><b>보스 · ${def.boss}</b> — ${def.sub || ''}</p>` : `<p class="exp-story-sub">${def.sub || ''}</p>`)
        + `</div>`
        + `<div class="exp-sortie-party">${faces}<em>${partyCount()}명 출진</em></div>`
        + `<div class="exp-sortie-stats"><div><span>내 전투력</span><b>${fmt(power)}</b></div>`
        + `<div><span>권장</span><b>${fmt(reco)} ${badge}</b></div></div>`
        + `<div class="exp-sortie-syn">${syn.faction ? `<span class="exp-syn fact" style="--fc:${factionColor(syn.faction.faction)}">${syn.faction.faction} ${syn.faction.count}명 <b>공·방·체 +${pct(syn.faction.tier.atk)}</b></span>` : ''}`
        + `${syn.bonds.map((b) => `<span class="exp-syn bond">${b.icon} ${b.name}</span>`).join('')}`
        + `${!syn.faction && !syn.bonds.length ? '<span class="exp-syn-empty">시너지 없음</span>' : ''}</div>`
        + `<p class="exp-note-line">전투는 자동으로 진행됩니다. 게이지 100%에서 필살기가 저절로 나가고, 1×/2× 배속으로 볼 수 있습니다. 져도 잃는 것은 없습니다.</p>`,
      actions: [
        { label: '닫기' },
        { label: '⚔️ 출진', primary: true, onClick: () => { startBattle(prog); } },
      ],
    });
  }

  function openRank() {
    const rows = [
      ['유비곰돌이', '12관 · 38턴'],
      ['청룡언월도', '11관 · 41턴'],
      ['적토마질주', '10관 · 44턴'],
      ['조조는간웅', '9관 · 47턴'],
      ['황건적두목', '8관 · 52턴'],
    ].map(([n, s], i) => `<div class="exp-rank-row"><span class="exp-rank-no">${i + 1}</span><b>${n}</b><em>${s}</em></div>`).join('');
    const mine = store ? `내 기록 · ${store.cleared.length}관 클리어 · 전투력 ${fmt(partyPower())}` : '';
    SK.modal({
      kicker: '유저 랭킹전',
      title: '누가 더 멀리 가나',
      wide: true,
      body: `<p class="exp-note-line" style="margin:0 0 6px">클리어 관문 → 턴 수 순으로 겨룹니다. (아래는 화면 확인용 예시)</p>`
        + rows
        + `<div class="exp-rank-me">${mine}</div>`
        + `<p class="exp-note-line"><b>서버 랭킹은 3단계에서 열립니다.</b> 점수·턴 기록은 이미 쌓고 있습니다.</p>`,
      actions: [{ label: '닫기', primary: true }],
    });
  }

  /* ══════════════════════════════════════════════════════════
     화면 열기·닫기
     ══════════════════════════════════════════════════════════ */
  function openExpedition() {
    if (!revealed) return;
    store = loadStore();
    selected = null;
    syncMerit(true);
    saveStore();
    const el = $('screen-expedition');
    if (!el) return;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    if (SK.show) SK.show('screen-expedition');
    el.classList.add('active');
    paintAll();
    try { if (SK.bgm) SK.bgm('title'); } catch (e) { /* ignore */ }
  }
  SK.expeditionOpen = openExpedition;

  function closeExpedition() {
    closeBattle();
    const el = $('screen-expedition');
    if (el) el.classList.remove('active');
    if (SK.show) SK.show('screen-title');
    else {
      const t = $('screen-title');
      if (t) t.classList.add('active');
    }
    try { if (SK.bgm) SK.bgm('title'); } catch (e) { /* ignore */ }
  }

  /* ── 비밀 입장 ───────────────────────────────────────────── */
  function revealEntry(quiet) {
    const b = $('btn-expedition');
    if (!b || !b.hidden) { revealed = true; return; }
    revealed = true;
    b.hidden = false;
    if (!quiet) toast('🤫 비밀 통로가 열렸습니다 — 원정 시나리오 (DEV)');
    sfx('ui');
  }

  function bindSecretEntry() {
    /* ① 주소의 ?exp=1 */
    let dev = false;
    try {
      const q = new URLSearchParams(location.search);
      dev = q.get('exp') === '1';
    } catch (e) { dev = false; }
    if (dev) revealEntry(true);

    /* ② 표지 제목 5연타 (각 터치 1.5초 이내) */
    const logo = document.querySelector('#screen-title .title-logo') || document.querySelector('.title-logo');
    if (!logo) return;
    let taps = [];
    const onTap = () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t <= 1500);
      taps.push(now);
      if (taps.length >= 5) {
        taps = [];
        if (!revealed) {
          revealEntry(false);
          const f = $('btn-expedition');
          if (f && f.scrollIntoView) { try { f.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
        } else {
          toast('비밀 통로는 이미 열려 있습니다.');
        }
      }
    };
    logo.addEventListener('click', onTap);
    logo.style.cursor = 'pointer';
  }

  /* ── 연결 ───────────────────────────────────────────────── */
  function bind() {
    const back = $('exp-back');
    if (back) back.onclick = closeExpedition;

    const entry = $('btn-expedition');
    if (entry) {
      entry.hidden = !revealed;
      entry.onclick = openExpedition;
    }

    const devBtn = $('exp-dev-merit');
    if (devBtn) devBtn.onclick = () => { addMerit(500); toast('테스트 공훈 +500 지급 (DEV)'); };

    const grid = $('exp-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const info = e.target.closest ? e.target.closest('[data-info]') : null;
        if (info) { e.stopPropagation(); openInfo(Number(info.dataset.info)); return; }
        const cell = e.target.closest ? e.target.closest('.exp-cell') : null;
        if (!cell) return;
        if (longFired) { longFired = false; return; }
        onCellTap(Number(cell.dataset.slot));
      });
      grid.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const cell = e.target.closest ? e.target.closest('.exp-cell') : null;
        if (!cell) return;
        e.preventDefault();
        onCellTap(Number(cell.dataset.slot));
      });
      let lpTimer = null;
      const startLp = (e) => {
        const cell = e.target.closest ? e.target.closest('.exp-cell.filled') : null;
        if (!cell) return;
        const i = Number(cell.dataset.slot);
        clearTimeout(lpTimer);
        lpTimer = setTimeout(() => {
          longFired = true;
          openInfo(i);
          setTimeout(() => { longFired = false; }, 900);
        }, 520);
      };
      const endLp = () => clearTimeout(lpTimer);
      grid.addEventListener('pointerdown', startLp);
      grid.addEventListener('pointerup', endLp);
      grid.addEventListener('pointerleave', endLp);
      grid.addEventListener('pointercancel', endLp);
    }

    const reserve = $('exp-reserve');
    if (reserve) reserve.addEventListener('click', (e) => {
      const slot = e.target.closest ? e.target.closest('.exp-slot-empty') : null;
      if (slot && slot.textContent.indexOf('슬롯') >= 0) openPullHero();
    });

    const syn = $('exp-synergy');
    if (syn) syn.addEventListener('click', (e) => {
      const b = e.target.closest ? e.target.closest('[data-bond-list]') : null;
      if (b) openBondList();
    });

    document.querySelectorAll('[data-exp-menu]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.expMenu;
        if (k === 'hero') openPullHero();
        else if (k === 'gear') openPullGear();
        else if (k === 'roster') openRoster();
        else if (k === 'rank') openRank();
      };
    });

    const sortie = $('exp-sortie');
    if (sortie) sortie.onclick = () => openSortie();
  }

  /* ── 시작 ───────────────────────────────────────────────── */
  function init() {
    bindSecretEntry();
    bind();
    setTimeout(() => { if (document.querySelector('#screen-expedition.active') && store) { syncMerit(false); paintAll(); } }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ── 점검용 ─────────────────────────────────────────────── */
  SK.expedition = {
    open: openExpedition,
    close: closeExpedition,
    reveal: () => revealEntry(true),
    get state() {
      return store ? JSON.parse(JSON.stringify({
        roster: store.roster, formation: store.formation, progress: store.progress,
        stars: store.stars, gear: store.gear.length, equip: store.equip, cleared: store.cleared,
        merit: readMerit(),
      })) : null;
    },
    merit: () => readMerit(),
    addMerit,
    power: partyPower,
    reload: () => { store = loadStore(); paintAll(); },
    syncMerit,
    synergy: () => partySynergy(),
    powerOf: (n) => powerOf(n),
    stars: (n) => starOf(n),
    pull: (n) => { const r = pullHero(n === 10 ? 10 : 1); saveStore(); paintAll(); return r; },
    pullGear: (n) => { const r = pullGear(n === 10 ? 10 : 1); saveStore(); paintAll(); return r.map((it) => ({ name: it.treasure.name, grade: it.treasure.grade, slot: gearSlotOf(it.treasure) })); },
    equip: (name, iid) => equipItem(name, iid),
    gearList: () => store.gear.map((it) => { const t = treasureOf(it); return t ? { iid: it.iid, name: t.name, grade: t.grade, slot: gearSlotOf(t) } : null; }).filter(Boolean),
    setParty: (names) => {
      store.formation = new Array(9).fill(null);
      const order = [1, 4, 7, 0, 2];
      (names || []).slice(0, MAX_PARTY).forEach((n, i) => {
        if (store.roster.indexOf(n) < 0) store.roster.push(n);
        if (store.stars[n] == null) store.stars[n] = 1;
        store.formation[order[i]] = n;
      });
      saveStore(); paintAll();
      return partyNames();
    },
    setStar: (name, n) => { store.stars[name] = clamp(Number(n) || 1, 1, STAR_MAX); saveStore(); paintAll(); },
    battleStart: (stage) => startBattle(stage || (store && store.progress) || 1),
    battleState: () => (B ? {
      stage: B.stage, over: B.over, win: B.win, turn: B.turn, speed: B.speed,
      ally: B.units.filter((u) => u.side === 'ally').map((u) => ({ name: u.name, hp: Math.round(u.hp), max: u.maxHp, alive: u.alive, gauge: Math.round(u.gauge) })),
      enemy: B.units.filter((u) => u.side === 'enemy').map((u) => ({ name: u.name, hp: Math.round(u.hp), max: u.maxHp, alive: u.alive })),
      log: B.log.slice(-4),
    } : null),
    battleSpeed: (v) => { if (B) { B.speed = clamp(Number(v) || 1, 1, 8); const el = $('eb-speed'); if (el) el.textContent = B.speed + '×'; } },
    battleStop: closeBattle,
    simulate: (stage, names) => {
      const prev = B;
      B = createBattle(stage, names || partyNames());
      B.ui = false;
      let guard = 0;
      while (!B.over && guard++ < 6000) {
        const due = B.units.filter((u) => u.alive && u.nextAt <= B.time).sort((a, b) => a.nextAt - b.nextAt)[0];
        if (!due) { B.time += 50; continue; }
        act(due);
      }
      const out = {
        win: B.win, turn: B.turn, acts: B.acts,
        allies: B.units.filter((u) => u.side === 'ally' && u.alive).length,
        enemies: B.units.filter((u) => u.side === 'enemy' && u.alive).length,
      };
      B = prev;
      return out;
    },
  };
})();
