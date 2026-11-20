/* ══════════════════════════════════════════════════════════════
   꼬마영웅 천하통일 — 상태·화면·내정
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function hasBatchim(word) {
    const s = String(word || '').trim();
    if (!s) return false;
    const c = s.charCodeAt(s.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return false;
    return (c - 0xAC00) % 28 !== 0;
  }
  function josa(word, kind) {
    const b = hasBatchim(word);
    const m = { eun: b ? '은' : '는', i: b ? '이' : '가', eul: b ? '을' : '를', euro: b ? '으로' : '로' };
    return word + (m[kind] || '');
  }
  SK.josa = josa;
  const MONTHS = SK.MONTH_NAMES;
  const SAVE_KEY = 'samgukji-jojo-v4-save';

  /* ───────────── 도시 런타임 ───────────── */
  const CITY = SK.CITY;

  let cityActorUid = null;   // 이번 달 내정을 맡을 장수
  function PF() { return (SK.state && SK.state.playerFaction) || 'neutral'; }
  SK.PF = PF;

  /* 도시 등급 — 농업·상업·성벽·민심의 평균이 오르면 Lv.1→Lv.5 */
  function cityLevel(cs) {
    if (!cs) return 1;
    const score = (cs.agri || 0) * 0.35 + (cs.comm || 0) * 0.30 + (cs.loyalty || 0) * 0.20 + (cs.def || 0) * 0.15;
    if (score >= 80) return 5;
    if (score >= 66) return 4;
    if (score >= 52) return 3;
    if (score >= 38) return 2;
    return 1;
  }
  SK.cityLevel = cityLevel;

  /* 징병 상한 — 인구의 15~20% (v5: 인구를 실제 규모로 올린 만큼 비율을 낮춰 병력 밸런스를 지킨다) */
  function cityCap(cs) { return Math.max(1500, Math.floor((cs.pop || 10000) * 0.17)); }
  SK.cityCap = cityCap;

  /* 시작 등급 — 대도시는 Lv.2, 소도시·관문·요새는 Lv.1 */
  function enforceStartLevel(cs, c) {
    const want = c.type === 'capital' ? 2 : 1;
    let guard = 0;
    while (cityLevel(cs) < want && guard++ < 60) {
      cs.agri = Math.min(100, cs.agri + 2);
      cs.comm = Math.min(100, cs.comm + 2);
    }
    while (cityLevel(cs) > want && guard++ < 140) {
      cs.agri = Math.max(0, cs.agri - 2);
      cs.comm = Math.max(0, cs.comm - 2);
    }
  }

  /* 관문·요새는 도시의 40~45% 인구·수입만 가진다 */
  const ECON_MUL = { capital: 1.5, town: 1, pass: 0.42, fortress: 0.45 };
  function econMul(c) { return ECON_MUL[c.type] || 1; }
  SK.econMul = econMul;
  /* v5 — 인구를 실제 도시 규모로 올린다
     관문·요새 3~6만 · 소도시 8~15만 · 대도시(평원·낙양·장안·업·성도·건업 포함) 25~45만 */
  const BIG_CAPITALS = ['pingyuan', 'luoyang', 'changan', 'ye', 'chengdu', 'jianye'];
  function basePop(c) {
    const h = hashStr(c.id);
    const v = (h % 1000) / 1000;                     // 0~1 고정 난수
    if (c.type === 'capital') {
      const big = BIG_CAPITALS.indexOf(c.id) >= 0;
      const lo = big ? 300000 : 250000, hi = big ? 450000 : 380000;
      return Math.round(lo + (hi - lo) * v);
    }
    if (c.type === 'town') return Math.round(80000 + 70000 * v);
    if (c.type === 'pass') return Math.round(30000 + 30000 * v);
    return Math.round(36000 + 24000 * v);            // 요새
  }
  function cityPopCap(c) {
    return Math.round(({ capital: 700000, town: 260000, pass: 90000, fortress: 110000 }[c.type] || 150000));
  }

  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  }

  /* ───────────── 상태 ───────────── */
  /* ───────────── 새 게임 상태 ───────────── */
  function newState(sc, factionId) {
    const cities = {};
    SK.CITY_LIST.forEach((c) => {
      const base = basePop(c);
      const h = hashStr(c.id);
      cities[c.id] = {
        owner: c.faction || 'neutral',
        troops: Math.min(c.baseTroops, Math.round(base * 0.17)),
        def: Math.min(100, c.defense + (c.type === 'pass' ? 8 : c.type === 'fortress' ? 6 : 0)),
        loyalty: 62 + (h % 12),
        order: 56 + (h % 14),
        pop: base,
        agri: ({ capital: 34, town: 25, pass: 19, fortress: 21 }[c.type] || 24) + (h % 9),
        comm: ({ capital: 31, town: 23, pass: 17, fortress: 19 }[c.type] || 22) + ((h >> 3) % 10),
        train: 50,                        // 시작 훈련도는 50 (v4.2)
        gold: 0, food: 0, genIds: [], advisor: null, governor: null, auto: true, bandit: false,
        slots: null, scoutedUntil: 0,
      };
      ensureSlots(cities[c.id], c);
    });
    const st = {
      version: 5, year: 1, month: 0, gold: 0, food: 0, fame: 0, turn: 1,
      cities, heroes: [], citiesOwned: 0, log: [], lastCity: 'xuchang', treasures: [],
      playerFaction: factionId || 'caocao', factions: {}, scenario: sc ? Number(sc.id) : null,
      eraYear: sc ? Number(sc.year) : 200, timelineSeen: [], talentLuck: 0, talentsVersion: 3,
      rp: 0, techs: [], truce: {},
      marches: [], marchSeq: 0, pendingMarch: null, recruitFail: {},
    };
    SK.CITY_LIST.forEach((c) => enforceStartLevel(cities[c.id], c));
    if (sc) {
      const res = SK.applyScenario(cities, sc);
      if (res) st.factions = res.factions;
    }
    if (!st.factions[st.playerFaction]) {
      // 폴백 — 시나리오 데이터가 없을 때
      st.factions = st.factions || {};
      if (!st.factions[st.playerFaction]) {
        st.factions[st.playerFaction] = { id: st.playerFaction, name: SK.factionInfo(st.playerFaction).name,
          lord: SK.factionInfo(st.playerFaction).lord, mark: SK.markOf(SK.factionInfo(st.playerFaction)),
          color: SK.factionInfo(st.playerFaction).color, generals: [], cities: [], capital: null, allies: [], enemies: [] };
      }
    }
    // 빈 세력(영지 0)은 목록에서 감춘다
    Object.keys(st.factions).forEach((k) => {
      if (st.factions[k].id !== 'neutral' && !st.factions[k].cities.length) delete st.factions[k];
    });
    st.playerFaction = factionId || st.playerFaction;
    if (!st.factions[st.playerFaction]) {
      const anyOwned = SK.CITY_LIST.find((c) => st.cities[c.id].owner === st.playerFaction);
      if (anyOwned) {
        st.factions[st.playerFaction] = { id: st.playerFaction, name: SK.factionInfo(st.playerFaction).name,
          lord: SK.factionInfo(st.playerFaction).lord, mark: SK.markOf(SK.factionInfo(st.playerFaction)),
          color: SK.factionInfo(st.playerFaction).color, generals: [], cities: [], capital: anyOwned.id, allies: [], enemies: [] };
      }
    }
    // v4.2 — 세력 명부를 585장수로 두텁게 채운다 (지역 분리 엄수)
    enrichFactions(st);
    // v4.2 — 공백지는 산적·호족이 지키는 얇은 병력만 둔다
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (cs.owner !== 'neutral') return;
      const h = hashStr(c.id);
      cs.troops = 1100 + (h % 900);
      cs.def = Math.max(40, Math.min(cs.def, 62));
      cs.loyalty = 40 + (h % 15);
      cs.genIds = [];
      cs.bandit = true;
    });
    const ownedIds = SK.CITY_LIST.filter((c) => st.cities[c.id].owner === st.playerFaction).map((c) => c.id);
    const f = st.factions[st.playerFaction] || {};
    const capital = (f.capital && ownedIds.indexOf(f.capital) >= 0) ? f.capital : (ownedIds[0] || 'xuchang');
    st.playerCapital = capital;
    st.lastCity = capital;
    const playerCities = SK.CITY_LIST.filter((c) => st.cities[c.id].owner === st.playerFaction);
    /* v5.0.1 — 첫 달부터 건설·정찰·징병·등용이 실제로 눌리게 시작 자금을 올린다
       1성 소세력 1,200~1,500 · 대세력 2,500~4,000 */
    const nOwn = Math.max(1, playerCities.length);
    st.gold = Math.min(4000, 1150 + nOwn * 330 + (hashStr('g' + st.playerFaction) % 90));
    st.food = Math.min(14000, 2700 + nOwn * 820 + (hashStr('f' + st.playerFaction) % 260));
    seedRoster(st, f, capital, ownedIds);
    giveStarters(st);
    assignGarrisons(st);
    seedTalents(st);
    appointDefaults(st);
    return st;
  }

  /* 세력 하나가 거느릴 장수 수 — 큰 세력은 12~25명, 작은 군웅은 6~10명 */
  const MAJOR_FACTIONS = ['dongzhuo', 'yuanshao', 'caocao', 'liubei', 'sunjian', 'sunquan', 'yuanshu',
    'liubiao', 'liuyan', 'mateng', 'gongsunzan', 'taoqian', 'liuzhang', 'liuzong',
    'cao_wei_pre', 'cao_wei', 'shu_han', 'sun_wu', 'goguryeo', 'baekje', 'silla'];
  function rosterTarget(fid, nCities) {
    const base = 10 + nCities * 2;
    if (MAJOR_FACTIONS.indexOf(fid) >= 0) return Math.max(12, Math.min(25, base));
    return Math.max(6, Math.min(10, base));
  }

  /* v4.2 — 시나리오가 지정한 장수 뒤에 585장수 풀에서 같은 지역 인물을 더 채운다.
     한국 인물은 한국 세력에만, 중국 인물은 중국 세력에만 간다. */
  /* v5 — 인물 풀은 세력 계열별로 완전히 갈라 둔다.
     위=위 인물, 촉=촉 인물, 오=오 인물, 군웅(원소·도겸·동탁·공융·유요·엄백호·왕랑·장로 등)=군웅 인물, 한국=한국 인물.
     아직 등장 연도(debutYear)가 되지 않은 인물은 어느 풀에도 들지 않는다. */
  function poolGroupOf(fid) {
    const g = SK.factionGroup(fid);
    if (g === '위' || g === '촉' || g === '오') return g;
    if (g === '한국') return '한국';
    return '군웅';
  }
  function genPoolGroup(g) {
    if (!g) return '군웅';
    if (SK.generalGroup(g) === '한국') return '한국';
    const f = g.faction || '';
    if (f === '위' || f === '촉' || f === '오') return f;
    return '군웅';                       // 군웅·재야
  }
  SK.poolGroupOf = poolGroupOf;
  SK.genPoolGroup = genPoolGroup;
  function eraYearOf(st) { return Number((st && (st.eraYear || (195 + (st.year || 0)))) || 190); }
  SK.eraYearOf = eraYearOf;

  function enrichFactions(st) {
    if (!SK.GENERALS.length) return;
    const year = eraYearOf(st);
    const used = new Set();
    const fids = Object.keys(st.factions).filter((k) => k !== 'neutral');
    fids.forEach((k) => {
      const f = st.factions[k];
      const names = [];
      const add = (n) => {
        const nm = SK.normName(n);
        const g = nm ? SK.GEN_BY_NAME[nm] : null;
        if (!g || used.has(g.id)) return;
        if (!SK.debutOk(g, year)) return;          // 아직 세상에 나오지 않은 인물
        names.push(nm); used.add(g.id);
      };
      /* v5.2 — 시나리오 단계에서 확정한 시작 명부(startGenerals)를 그대로 쓴다.
         카드에 보이는 장수 수와 인게임 시작 장수 수가 어긋나지 않는다. */
      if (f.startGenerals && f.startGenerals.length) {
        f.startGenerals.forEach(add);
        f.generals = names;
        f.group = SK.factionGroup(f.id);
        f.pool = poolGroupOf(f.id);
        return;
      }
      if (f.lord) add(f.lord);
      const want = rosterTarget(f.id, (f.cities || []).length);
      (f.generals || []).forEach((n) => { if (names.length < want) add(n); });
      /* v5.0.1 — 세력별 초기 식구만 더한다.
         지역·시대가 다른 장수(익주·형주 인물, 아직 합류하지 않은 명장)는 끌어오지 않고
         본래 세력이나 재야·주점·수비 배치로 남긴다. */
      const early = (SK.EARLY_RETAINERS || {})[k] || [];
      early.forEach((n) => { if (names.length < want) add(n); });
      f.generals = names;
      f.group = SK.factionGroup(f.id);
      f.pool = poolGroupOf(f.id);
    });
  }

  /* 시작할 때 각 성의 태수(정치·통솔)와 군사(지력·매력)를 가장 알맞은 장수로 앉힌다.
     언제든 관아에서 바꿀 수 있고, 자동 내정은 태수가 있는 성에서만 움직인다. */
  function appointDefaults(st) {
    const lord = (st.factions[st.playerFaction] || {}).lord;
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (cs.owner !== st.playerFaction) return;
      const all = st.heroes.filter((h) => h.city === c.id);
      /* v5.0.3 — 군주가 주둔한 성은 군주가 친히 다스린다 (태수 = 군주, 군사는 나머지 중 최적) */
      const lordHero = all.find((h) => h.name === lord) || null;
      if (lordHero) {
        cs.governor = lordHero.uid;
        const strat = all.filter((h) => h.uid !== lordHero.uid)
          .sort((a, b) => (b.ji * 0.7 + b.cha * 0.3) - (a.ji * 0.7 + a.cha * 0.3))[0];
        cs.advisor = strat ? strat.uid : null;
        return;
      }
      const gens = all;
      if (!gens.length) { cs.governor = null; cs.advisor = null; return; }
      const gov = gens.slice().sort((a, b) => (b.pol * 0.6 + b.tong * 0.4) - (a.pol * 0.6 + a.tong * 0.4))[0];
      cs.governor = gov ? gov.uid : null;
      const strat = gens.filter((h) => h.uid !== gov.uid)
        .sort((a, b) => (b.ji * 0.7 + b.cha * 0.3) - (a.ji * 0.7 + a.cha * 0.3))[0];
      cs.advisor = strat ? strat.uid : null;
    });
  }

  /* v5.0.3 — 군주가 있는 성은 반드시 군주가 태수다.
     군주가 다른 성으로 옴기면 그 성의 태수가 되고, 떠난 성은 남은 장수 중 가장 나은 사람이 맡는다.
     플레이어가 고른 태수는 군주가 그 성에 없는 한 그대로 둔다. */
  function enforceLordGovernor(st) {
    st = st || SK.state;
    if (!st || !st.factions) return false;
    const fid = st.playerFaction;
    const lord = (st.factions[fid] || {}).lord;
    if (!lord) return false;
    const lordHero = (st.heroes || []).find((h) => h.name === lord);
    const lordCity = lordHero && st.cities[lordHero.city] && st.cities[lordHero.city].owner === fid
      ? lordHero.city : null;
    let changed = false;
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (!cs || cs.owner !== fid) return;
      const gens = (st.heroes || []).filter((h) => h.city === c.id);
      if (c.id === lordCity) {
        if (cs.governor !== lordHero.uid) { cs.governor = lordHero.uid; changed = true; }
        if (cs.advisor === lordHero.uid) {
          const strat = gens.filter((h) => h.uid !== lordHero.uid)
            .sort((a, b) => (b.ji * 0.7 + b.cha * 0.3) - (a.ji * 0.7 + a.cha * 0.3))[0];
          cs.advisor = strat ? strat.uid : null;
          changed = true;
        }
        return;
      }
      if (lordHero && cs.governor === lordHero.uid) { cs.governor = null; changed = true; }
      if (cs.governor == null && gens.length) {
        const gov = gens.slice().sort((a, b) => (b.pol * 0.6 + b.tong * 0.4) - (a.pol * 0.6 + a.tong * 0.4))[0];
        if (gov) { cs.governor = gov.uid; changed = true; }
      }
    });
    return changed;
  }
  SK.enforceLordGovernor = enforceLordGovernor;

  /* 인물 하나를 내정 장수로 — 모든 장수는 Lv.1에서 출발한다 */
  function makeHero(name, cityId, lv) {
    const g = SK.GEN_BY_NAME[SK.normName(name)];
    if (!g) return null;
    const cls = SK.genClass(g);
    const level = lv || 1;
    const art = SK.artFor(g.name);
    return {
      uid: 'g_' + g.id, baseId: 'gen', genId: g.id, name: g.name, hanja: '',
      cls, portrait: art && art.portrait ? art.portrait : SK.genPortrait(g), unit: (art && art.unit) || null,
      lv: level, wu: g.war, ji: g.intel, tong: g.leadership,
      pol: g.politics || 60, cha: g.charm || 60, loyal: 100,
      tier: g.tier, skillName: g.skill || '',
      hp: maxHpOf(cls, level), mp: maxMpOf(cls, level), city: cityId, generic: true,
      exp: 0, tierLv: 0, equip: {}, actedThisMonth: false,
    };
  }

  /* 세력의 군주·장수를 수도와 영지에 배치 */
  function seedRoster(st, f, capital, ownedIds) {
    const names = [];
    const push = (n) => {
      const nm = SK.normName(n);
      if (!nm || names.indexOf(nm) >= 0) return;
      if (!SK.GEN_BY_NAME[nm]) return;
      names.push(nm);
    };
    if (f && f.lord) push(f.lord);
    ((f && f.generals) || []).forEach(push);
    const towns = ownedIds.filter((id) => id !== capital);
    // 수도에 3명, 나머지는 성마다 고르게 — 한 성에 장수가 몰리지 않게 한다
    names.forEach((nm, i) => {
      let cityId = capital;
      if (i >= 3 && towns.length) cityId = towns[(i - 3) % towns.length];
      const h = makeHero(nm, cityId, 1);
      if (h) st.heroes.push(h);
    });
    // 수도에 장수가 하나도 없으면 세력 장수 한 명을 불러온다 (같은 계열 인물만)
    if (!st.heroes.some((h) => h.city === capital)) {
      const grp = (f && f.pool) || poolGroupOf(st.playerFaction);
      const spare = SK.GENERALS.find((g) => !st.heroes.some((h) => h.genId === g.id)
        && genPoolGroup(g) === grp && SK.debutOk(g, eraYearOf(st)));
      if (spare) { const h = makeHero(spare.name, capital, 1); if (h) st.heroes.push(h); }
    }
  }

  /* v5.0.1 — 역사 고증 시작 보물. 장수 이름 → 보물 이름(슬롯에 맞게 장착) */
  const SIGNATURE_TREASURES = {
    '유비': ['쌍고검'], '조조': ['의천검', '절영'],
    '관우': ['청룡언월도'], '장비': ['장팔사모'], '여포': ['방천화극', '적토마'],
    '손견': ['고정도'], '손책': ['고정도'], '조운': ['청강검'], '전위': ['쌍철극'],
    '원소': ['사검'], '마초': ['서량철창'], '황충': ['백발궁'], '태사자': ['백우선'],
    '하후돈': ['철척'], '허저': ['팔모금강봉'], '감녕': ['비도단검'],
  };
  function giveStarters(st) {
    if (!SK.TREASURES.length) return;
    st.treasures = [];
    const f = st.factions[st.playerFaction] || {};
    const lord = f.lord;
    const grant = (hero, name) => {
      if (!hero) return false;
      const t = SK.TREASURES.find((x) => x.name === name);
      if (!t) return false;
      const slot = SK.treasureSlot(t);
      hero.equip = hero.equip || {};
      if (hero.equip[slot]) return false;
      hero.equip[slot] = t.id;
      return true;
    };
    let granted = 0;
    st.heroes.forEach((h) => {
      (SIGNATURE_TREASURES[h.name] || []).forEach((nm) => { if (grant(h, nm)) granted += 1; });
    });
    // 고증 보물이 하나도 없으면 군주에게 희귀 무기를 쥐여 준다
    const lordHero = st.heroes.find((h) => h.name === lord) || st.heroes[0];
    if (!granted && lordHero) {
      const sword = SK.TREASURES.find((t) => t.type === '무기' && t.grade === '희귀');
      if (sword) lordHero.equip.weapon = sword.id;
    }
  }

  /* 적성 수비 장수 — 그 성의 세력 인물로만 (지역·계열이 다른 인물은 세우지 않는다) */
  function assignGarrisons(st) {
    if (!SK.GENERALS.length) return;
    const year = eraYearOf(st);
    const used = new Set();
    st.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
    const rank = { S: 0, A: 1, B: 2, C: 3 };
    const byFaction = {};
    Object.keys(st.factions).forEach((k) => {
      const f = st.factions[k];
      const grp = f && f.pool ? f.pool : poolGroupOf(k);
      const pool = ((f && f.generals) || []).map((n) => SK.GEN_BY_NAME[n]).filter(Boolean)
        .filter((g) => genPoolGroup(g) === grp && SK.debutOk(g, year));
      pool.sort((a, b) => (rank[a.tier] - rank[b.tier]) || (b.war + b.intel) - (a.war + a.intel));
      byFaction[k] = pool;
    });
    // 수도를 먼저 채워 우두머리가 수도에 서게 한다
    const order = SK.CITY_LIST.slice().sort((a, b) => (a.type === 'capital' ? -1 : 0) - (b.type === 'capital' ? -1 : 0));
    order.forEach((c) => {
      const cs = st.cities[c.id];
      if (cs.owner === st.playerFaction) return;
      if (cs.owner === 'neutral') { cs.genIds = []; return; }
      const pool = byFaction[cs.owner] || [];
      const want = c.type === 'capital' ? 4 : 3;
      const picks = [];
      for (let i = 0; i < pool.length && picks.length < want; i++) {
        const g = pool[i];
        if (used.has(g.id)) continue;
        picks.push(g.id); used.add(g.id);
      }
      // 도시 데이터의 태수도 같은 세력·같은 지역이면 앞에 세운다
      const gov = SK.GEN_BY_NAME[SK.normName(c.governor)];
      const grp = pool.length ? SK.generalGroup(pool[0]) : null;
      if (gov && grp && SK.generalGroup(gov) === grp && !picks.includes(gov.id) && !used.has(gov.id) && picks.length < want + 1) {
        picks.unshift(gov.id); used.add(gov.id);
      }
      cs.genIds = picks.slice(0, want + 1);
    });
  }

  /* 재야 인재 — 성마다 고정된 지역 인재 풀 (전국 풀에서 텔레포트하지 않는다)
     v4.1: 보통(B·C급)이 주류, A급은 가끔, S급은 다섯 성에 하나꼴로만 숨어 있게 나눈다.
     v4.2: 한국 인재와 중국 인재를 지역별로 완전히 갈라 둔다. */
  function tavernGroupOf(st, cityId) {
    const cs = st && st.cities ? st.cities[cityId] : null;
    const owner = cs ? cs.owner : null;
    if (owner && owner !== 'neutral' && st.factions[owner]) {
      return st.factions[owner].pool || poolGroupOf(owner);
    }
    return SK.cityGroup(cityId) === '한국' ? '한국' : '군웅';
  }
  SK.tavernGroupOf = tavernGroupOf;

  function seedTalents(st) {
    const year = eraYearOf(st);
    const used = new Set();
    st.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
    SK.CITY_LIST.forEach((c) => (st.cities[c.id].genIds || []).forEach((id) => used.add(id)));
    const lordName = (st.factions[st.playerFaction] || {}).lord;
    const groups = ['위', '촉', '오', '군웅', '한국'];
    const buckets = {};
    groups.forEach((grp) => { buckets[grp] = { S: [], A: [], B: [], C: [] }; });
    SK.GENERALS.forEach((g) => {
      if (used.has(g.id) || g.name === lordName) return;
      if (!SK.debutOk(g, year)) return;          // 아직 나오지 않은 인물은 주점에도 없다
      const grp = genPoolGroup(g);
      (buckets[grp][g.tier] || buckets[grp].C).push(g);
    });
    groups.forEach((grp) => Object.keys(buckets[grp]).forEach((t) => {
      buckets[grp][t].sort((a, b) => SK.genScore(b) - SK.genScore(a) || a.id - b.id);
    }));
    // 한 성이 2~4명씩 가져가도록 B·C를 촘촘히, A를 드문드문 섞은 순서
    const MIX = ['C', 'B', 'C', 'C', 'B', 'A', 'C', 'B', 'C', 'C', 'B', 'A', 'C', 'C', 'B', 'B', 'C', 'A', 'B', 'C',
      'C', 'B', 'C', 'C', 'B'];
    const seq = {};
    groups.forEach((grp) => {
      const b = buckets[grp];
      const out = [];
      let guard = 0;
      while (guard++ < 200) {
        let moved = 0;
        MIX.forEach((t) => { if (b[t].length) { out.push(b[t].shift()); moved += 1; } });
        if (!moved) break;
      }
      seq[grp] = out;
    });
    const cursor = {}; const seen = {};
    groups.forEach((grp) => { cursor[grp] = 0; seen[grp] = 0; });
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      cs.talents = cs.talents || [];
      if (cs.talents.length) return;
      const grp = tavernGroupOf(st, c.id);
      const h = hashStr(c.id);
      const n = 2 + (h % 3);
      const list = seq[grp] || [];
      const take = [];
      for (let k = 0; k < n && cursor[grp] < list.length; k++) {
        const g = list[cursor[grp]++];
        if (!g || used.has(g.id)) { k -= 1; continue; }
        take.push(g.id); used.add(g.id);
      }
      // S급은 다섯 성에 한 곳꼴 — 만나면 확실히 사건이 된다
      const sPool = buckets[grp].S;
      const idx = seen[grp]++;
      if (sPool.length && idx % 5 === 4) {
        const g = sPool.shift();
        if (g && !used.has(g.id)) { take.unshift(g.id); used.add(g.id); }
      }
      cs.talents = take;
    });
  }

  /* 해가 바뀔 때 — 새로 성년이 된 명장을 각지 주점에 풀어 놓는다 (v5) */
  SK.refreshDebut = function (st) {
    const yr = eraYearOf(st);
    const used = new Set();
    st.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      (cs.talents || []).forEach((id) => used.add(id));
      (cs.genIds || []).forEach((id) => used.add(id));
    });
    const fresh = SK.GENERALS.filter((g) => Number(g.debutYear) === yr && !used.has(g.id));
    const out = [];
    fresh.forEach((g) => {
      const grp = genPoolGroup(g);
      let cands = SK.CITY_LIST.filter((c) => tavernGroupOf(st, c.id) === grp);
      if (!cands.length) cands = SK.CITY_LIST.filter((c) => SK.cityGroup(c.id) === (grp === '한국' ? '한국' : '중국'));
      if (!cands.length) return;
      const c = cands[Math.floor(Math.random() * cands.length)];
      const cs = st.cities[c.id];
      cs.talents = cs.talents || [];
      cs.talents.unshift(g.id);
      out.push(g);
    });
    return out;
  };

  /* 그 성에 지금 있는 재야 인재 (주점) */
  function localTalents(cityId) {
    const cs = SK.state.cities[cityId];
    if (!cs) return [];
    cs.talents = cs.talents || [];
    return cs.talents.map((id) => SK.GEN_BY_ID[id]).filter(Boolean);
  }
  SK.localTalents = localTalents;

  function removeLocalTalent(cityId, genId) {
    const cs = SK.state.cities[cityId];
    if (!cs || !cs.talents) return;
    cs.talents = cs.talents.filter((id) => id !== genId);
  }

  function maxHpOf(cls, lv) { return 100; }
  function maxMpOf(cls, lv) { return SK.CLASSES[cls].mp + (lv - 1) * 2; }
  SK.maxHpOf = maxHpOf; SK.maxMpOf = maxMpOf;

  SK.gainExp = function (h, amount) {
    h.exp = (h.exp || 0) + amount;
    const ups = [];
    let guard = 0;
    while (h.lv < 30 && h.exp >= SK.expNeed(h.lv) && guard++ < 40) {
      h.exp -= SK.expNeed(h.lv);
      const before = SK.classTitle(h.cls, h.lv);
      h.lv += 1;
      h.wu = Math.min(100, h.wu + 1);
      h.ji = Math.min(100, h.ji + 1);
      h.tong = Math.min(100, h.tong + 1);
      h.mp = maxMpOf(h.cls, h.lv);
      h.rank = SK.tierForLv(h.lv);
      const after = SK.classTitle(h.cls, h.lv);
      ups.push({ lv: h.lv, promote: after !== before, title: after, before });
    }
    if (h.lv >= 30) h.exp = Math.min(h.exp, SK.expNeed(30));
    return ups;
  };

  SK.state = null;

  SK.save = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(SK.state)); } catch (e) { /* ignore */ }
  };
  SK.load = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.version !== 5) return false;
      s.treasures = s.treasures || [];
      (s.heroes || []).forEach((h) => { h.equip = h.equip || {}; });
      // v4.2 저장 이관 — 훈련도·태수·군사·자동 내정 자리 만들기
      SK.CITY_LIST.forEach((c) => {
        const cs = s.cities && s.cities[c.id];
        if (!cs) return;
        if (cs.train == null) cs.train = 50;
        if (cs.governor === undefined) cs.governor = null;
        if (cs.advisor === undefined) cs.advisor = null;
        if (cs.auto == null) cs.auto = true;
        if (cs.order == null) cs.order = 55;   // v5.2 — 치안 분리
        ensureSlots(cs, c);                 // v5 — 공터 슬롯 이관
        if (cs.scoutedUntil == null) cs.scoutedUntil = 0;
      });
      /* v5.0.3 — 예전 저장 파일: 군주를 태수에서 빼 둔 것을 되돌린다 */
      enforceLordGovernor(s);
      const lordName = ((s.factions || {})[s.playerFaction] || {}).lord;
      if (lordName) {
        SK.CITY_LIST.forEach((c) => {
          const cs = s.cities && s.cities[c.id];
          if (!cs) return;
          const a = (s.heroes || []).find((h) => h.uid === cs.advisor);
          if (a && a.name === lordName) cs.advisor = null;
        });
      }
      s.techs = s.techs || [];
      s.truce = s.truce || {};
      s.rp = s.rp || 0;
      s.marches = s.marches || [];
      s.recruitFail = s.recruitFail || {};
      if (s.pendingMarch == null) s.pendingMarch = null;
      (s.heroes || []).forEach((h) => { if (!s.marches.some((m) => m.id === h.marchId)) h.marchId = null; });
      SK.state = s;
      // v4.2 인재 분포 — 한국/중국 인재를 갈라 다시 놓는다
      if (s.talentsVersion !== 3 && SK.GENERALS.length) {
        s.talentsVersion = 3;
        SK.CITY_LIST.forEach((c) => { const cs = s.cities[c.id]; if (cs) cs.talents = []; });
        try { seedTalents(s); } catch (e) { /* ignore */ }
      }
      return true;
    } catch (e) { return false; }
  };
  SK.hasSave = function () { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };

  /* ───────────── 알림 ───────────── */
  let toastTimer = null;
  SK.toast = function (msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('top', !!document.querySelector('#modal-root .modal-layer'));
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 260); }, 2400);
  };

  SK.modal = function (opts) {
    if (opts && opts.delay) {
      const t = setTimeout(() => SK.modal(Object.assign({}, opts, { delay: 0 })), opts.delay);
      return { close() { clearTimeout(t); }, el: document.createElement('div') };
    }
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-layer';
    wrap.innerHTML = `
      <div class="modal ${opts.wide ? 'wide' : ''}">
        ${opts.kicker ? `<p class="modal-kicker">${opts.kicker}</p>` : ''}
        <h3>${opts.title || ''}</h3>
        ${opts.body || ''}
        <div class="modal-actions"></div>
      </div>`;
    const actions = wrap.querySelector('.modal-actions');
    (opts.actions || [{ label: '닫기' }]).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.primary ? 'btn-primary' : a.ghost ? 'btn-ghost' : 'btn-paper');
      b.textContent = a.label;
      b.onclick = () => {
        if (!a.keepOpen) close();
        if (a.onClick) a.onClick();
      };
      actions.appendChild(b);
    });
    function close() { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 220); }
    wrap.addEventListener('click', (e) => { if (e.target === wrap && opts.dismissible !== false) close(); });
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    return { close, el: wrap };
  };

  /* ───────────── 화면 전환 ───────────── */
  const SCREENS = ['screen-title', 'screen-scenario', 'screen-faction', 'screen-map', 'screen-city', 'screen-battle'];
  let lastTheme = null;
  function bgm(theme) {
    if (!window.JojoBGM || lastTheme === theme) return;
    lastTheme = theme;
    try { JojoBGM.play(theme); } catch (e) { /* ignore */ }
  }
  SK.bgm = bgm;
  SK.show = function (id) {
    SCREENS.forEach((s) => $('#' + s).classList.toggle('active', s === id));
  };
  SK.showMap = function () {
    SK.show('screen-map');
    bgm('map');
    SK.refreshHud();
    if (window.SKMap) { SKMap.init(); SKMap.refresh(); setTimeout(() => SKMap.relayout && SKMap.relayout(), 30); }
    /* v5.3 — 저장을 다시 열었을 때 남아 있는 행군 사건을 이어서 보여 준다 */
    if (SK.state && SK.state.pendingMarch) setTimeout(openPendingMarch, 520);
  };

  /* ───────────── 499 장수 로드 ───────────── */
  async function loadTreasures() {
    if (SK.TREASURES.length) return true;
    try {
      const res = await fetch('data/treasures.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setTreasures(await res.json());
      return true;
    } catch (e) { console.warn('보물 데이터를 불러오지 못했습니다.', e); return false; }
  }
  SK.loadTreasures = loadTreasures;

  async function loadScenarios() {
    if (SK.HIST.length) return true;
    try {
      const res = await fetch('data/historical_scenarios.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setHistorical(await res.json());
      return true;
    } catch (e) { console.warn('시나리오를 불러오지 못했습니다.', e); return false; }
  }
  SK.loadScenarios = loadScenarios;

  async function loadCities() {
    if (SK.CITY_LIST.length) return true;
    try {
      const res = await fetch('data/cities.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setCities(await res.json());
      return true;
    } catch (e) { console.warn('거점 데이터를 불러오지 못했습니다.', e); return false; }
  }
  SK.loadCities = loadCities;

  async function loadEvents() {
    if (SK.EVENTS.length) return true;
    try {
      const res = await fetch('data/events.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setEvents(await res.json());
      return true;
    } catch (e) { console.warn('이벤트 데이터를 불러오지 못했습니다.', e); return false; }
  }
  SK.loadEvents = loadEvents;

  async function loadClasses() {
    if (SK._classesLoaded) return true;
    try {
      const res = await fetch('data/classes.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.applyClassData(await res.json());
      SK._classesLoaded = true;
      return true;
    } catch (e) { console.warn('병과 데이터를 불러오지 못했습니다.', e); return false; }
  }
  SK.loadClasses = loadClasses;

  async function loadTopArt() {
    if (Object.keys(SK.ART).length) return true;
    try {
      const res = await fetch('data/top100_art_manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setTopArt(await res.json());
      applyLordArt();
      return true;
    } catch (e) { console.warn('전용 일러스트 목록을 불러오지 못했습니다.', e); return false; }
  }
  SK.loadTopArt = loadTopArt;

  async function loadTechTree() {
    if (SK.TECHS && SK.TECHS.length) return true;
    try {
      const res = await fetch('data/tech_tree.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.TECHS = await res.json();
      return true;
    } catch (e) { console.warn('기술 데이터를 불러오지 못했습니다.', e); SK.TECHS = SK.TECHS || []; return false; }
  }
  SK.loadTechTree = loadTechTree;

  async function loadPassives() {
    if (SK.PASSIVES && Object.keys(SK.PASSIVES).length) return true;
    try {
      const res = await fetch('data/unique_passives.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();
      SK.PASSIVES = {};
      (list || []).forEach((p) => { if (p && p.name) SK.PASSIVES[p.name] = p; });
      return true;
    } catch (e) { console.warn('고유 특기를 불러오지 못했습니다.', e); SK.PASSIVES = SK.PASSIVES || {}; return false; }
  }
  SK.loadPassives = loadPassives;

  async function loadQuotesAndRanks() {
    if (SK.RANKS.length) return true;
    try {
      const res = await fetch('data/quotes_and_ranks.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setQuotesAndRanks(await res.json());
      return true;
    } catch (e) { console.warn('관작 데이터를 불러오지 못했습니다.', e); return false; }
  }
  SK.loadQuotesAndRanks = loadQuotesAndRanks;

  async function loadDomesticEvents() {
    if (SK.DOMESTIC_EVENTS.length) return true;
    try {
      const res = await fetch('data/domestic_events.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setDomesticEvents(await res.json());
      return true;
    } catch (e) { console.warn('내정 이벤트를 불러오지 못했습니다.', e); return false; }
  }
  SK.loadDomesticEvents = loadDomesticEvents;

  async function loadBonds() {
    if (SK.BONDS.length) return true;
    try {
      const res = await fetch('data/bonds.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setBonds(await res.json());
      return true;
    } catch (e) { console.warn('인연 데이터를 불러오지 못했습니다.', e); return false; }
  }
  SK.loadBonds = loadBonds;

  async function loadGenerals() {
    if (SK.GENERALS.length) return true;
    try {
      const res = await fetch('data/generals.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();
      SK.setGenerals(list);
      return true;
    } catch (e) {
      console.warn('장수 데이터를 불러오지 못했습니다.', e);
      return false;
    }
  }
  SK.loadGenerals = loadGenerals;

  /* 전용 일러스트가 있으면 타이틀·지도 초상화도 교체 */
  function applyLordArt() {
    const pt = SK.artPortrait('조조');
    if (!pt) return;
    ['#title-lord', '#lord-mini'].forEach((sel) => {
      const el = $(sel);
      if (el) el.src = pt;
    });
  }
  SK.applyLordArt = applyLordArt;

  /* ───────────── 시작 ───────────── */
  async function startGame(fresh) {
    if (!SK.CITY_LIST.length) await loadCities();
    if (!SK.SCENARIOS.length) await loadScenarios();
    if (!SK._classesLoaded) await loadClasses();
    if (!SK.EVENTS.length) await loadEvents();
    if (!SK.GENERALS.length) await loadGenerals();
    if (!SK.BONDS.length) await loadBonds();
    if (!SK.DOMESTIC_EVENTS.length) await loadDomesticEvents();
    if (!SK.RANKS.length) await loadQuotesAndRanks();
    if (!Object.keys(SK.ART).length) await loadTopArt();
    if (!SK.TECHS || !SK.TECHS.length) await loadTechTree();
    if (!SK.PASSIVES || !Object.keys(SK.PASSIVES).length) await loadPassives();
    applyLordArt();
    if (!SK.TREASURES.length) await loadTreasures();
    if (fresh) { openScenarioPicker(); return; }
    if (!SK.state) { SK.state = newState(SK.HIST[SK.HIST.length - 1] || null, 'caocao'); SK.save(); }
    SK.showMap();
    SK.refreshHud();
    if (window.SKMap) SKMap.resetCamera();
    setTimeout(() => {
      if (false) {
        SK.modal({
          kicker: '190년 1월',
          title: '천하의 서막',
          body: `<div class="intro-modal">
            <div class="intro-portrait"><img src="assets/portraits/v2/caocao.webp" alt="조조"></div>
            <p>“천하는 넓고, 내 길은 멀다.”</p>
            <ul>
              <li><b>지도</b> — 76개 거점을 눌러 내정하고, 적성 인근에서 출진합니다.</li>
              <li><b>내정</b> — 개간·상업·징병·인재·보수로 성을 키웁니다.</li>
              <li><b>전장</b> — 18×18 대형 격자를 끌어 이동하며 부대를 지휘합니다.</li>
            </ul>
          </div>`,
          actions: [{ label: '출발한다', primary: true }],
        });
      } else {
        SK.toast('저장된 천하를 이어받았습니다.');
      }
    }, 260);
  }

  /* ───────────── 시나리오 · 세력 선택 ───────────── */
  function factionCard(f) {
    const n = (f.cities || []).length;
    /* v5.2 — 카드의 장수 N = 인게임 시작 장수 수 (같은 명부를 센다) */
    const roster = (f.startGenerals && f.startGenerals.length ? f.startGenerals : (f.generals || [])).length;
    return `<button class="fac-card" data-fid="${f.id}" style="--fc:${f.color}">
      <span class="fc-seal">${SK.markOf(f)}</span>
      <div class="fc-main">
        <b>${f.name}</b>
        <span>${f.lord} · ${SK.typeName((SK.CITY[f.capital] || {}).type || 'capital')}</span>
        <em>수도 ${f.capitalName} · 거점 ${n} · 장수 ${roster}</em>
      </div>
      <span class="fc-go">▸</span>
    </button>`;
  }

  /* v16 — 시나리오 선택은 모달 대신 전용 화면(#screen-scenario)에 도안 A 배너로 그린다 */
  const SC_BADGE = { 190: '#7a2b26', 200: '#2b3f6b', 208: '#8a2f24', 220: '#4b2f6b' };
  function scenarioLine(sc) {
    const facs = sc.factions || [];
    const names = facs.slice(0, 3).map((f) => String(f.name || '').replace(/군$/, '')).filter(Boolean);
    return `${facs.length}개 세력 · ${names.join('·')}${facs.length > 3 ? '\u00A0외' : ''}`;
  }

  function openScenarioPicker() {
    if (!SK.HIST.length) { beginScenario(null, null); return; }
    const list = $('#scenario-list');
    if (list) {
      list.innerHTML = SK.HIST.map((sc) => `<button class="scbn" data-sc="${sc.id}" style="--ac:${SC_BADGE[sc.year] || '#7a2b26'}">
        <span class="scbn-art"><img src="assets/scenarios/scen_${sc.year}.webp" alt="" /></span>
        <span class="scbn-body">
          <span class="scbn-year">${sc.year}</span>
          <span class="scbn-name">${sc.title}</span>
          <span class="scbn-meta">${scenarioLine(sc)}</span>
        </span>
        <span class="scbn-go" aria-hidden="true">›</span>
      </button>`).join('');
      list.scrollTop = 0;
      list.querySelectorAll('.scbn').forEach((b) => {
        b.onclick = () => {
          const sc = SK.HIST.find((x) => Number(x.id) === Number(b.dataset.sc));
          if (sc) openFactionPicker(sc);
        };
      });
    }
    SK.show('screen-scenario');
    const back = $('#btn-scenario-back');
    if (back) back.onclick = () => { if (SK.state) SK.showMap(); else SK.show('screen-title'); };
  }
  SK.openScenarioPicker = openScenarioPicker;

  /* v5.3 — 세력 선택은 모달이 아니라 시나리오 화면과 같은 먹·나무결·금테 전용 화면(#screen-faction)이다 */
  const SC_NOTE = {
    190: '동탁이 낙양을 장악하고 헌제를 세운 190년. 원소를 중심으로 제후가 연합했으나 곧 갈라섰습니다.',
    200: '관도에서 조조가 원소를 꺾고 하북을 삼킨 200년. 유비는 형주로 몸을 피했습니다.',
    208: '적벽을 앞둔 208년. 조조의 대군이 남하하고 손권·유비가 손을 잡습니다.',
    220: '조비가 한을 대신한 220년. 위·촉·오 삼국의 국경이 굳어집니다.',
  };
  function factionScreenCard(f) {
    const n = (f.cities || []).length;
    const roster = (f.startGenerals && f.startGenerals.length ? f.startGenerals : (f.generals || [])).length;
    const lord = SK.GEN_BY_NAME[f.lord];
    const pt = lord ? SK.genPortrait(lord) : (SK.CLASS_PORTRAIT.gunwoong || 'gen_bobyung');
    return `<button class="fx-card" data-fid="${f.id}" style="--fc:${f.color}">
      <span class="fx-port"><img src="${SK.ptSrc(pt)}" alt=""><em class="fx-badge">${f.mark}</em></span>
      <div class="fx-main">
        <b class="fx-name">${f.name}</b>
        <span class="fx-lord">${f.lord || '재야'}</span>
        <span class="fx-cap">수도 ${f.capitalName}</span>
        <span class="fx-nums"><i>거점 <b>${n}</b></i><i>장수 <b>${roster}</b></i></span>
      </div>
    </button>`;
  }

  function openFactionPicker(sc) {
    const res = SK.resolveScenario(sc);
    const facs = Object.keys(res ? res.factions : {}).filter((k) => k !== 'neutral' && res.factions[k].cities.length)
      .map((k) => res.factions[k])
      .sort((a, b) => b.cities.length - a.cities.length);
    const list = $('#faction-list');
    if (list) {
      list.innerHTML = facs.map((f) => factionScreenCard({
        id: f.id, name: f.name, lord: f.lord, color: f.color, mark: SK.markOf(f),
        capital: f.capital, capitalName: (SK.CITY[f.capital] || {}).name || '-',
        cities: f.cities, generals: f.generals, startGenerals: f.startGenerals,
      })).join('') || '<p class="fx-empty">이 시대에 일어설 세력이 없습니다.</p>';
      list.scrollTop = 0;
      list.querySelectorAll('.fx-card').forEach((b) => {
        b.onclick = () => beginScenario(sc, b.dataset.fid);
      });
    }
    const yr = $('#fx-year'); if (yr) yr.textContent = sc.year;
    const nm = $('#fx-scname'); if (nm) nm.textContent = sc.title;
    const nt = $('#fx-note'); if (nt) nt.textContent = SC_NOTE[sc.year] || sc.historyNote || '';
    SK.show('screen-faction');
    const back = $('#btn-faction-back');
    if (back) back.onclick = () => openScenarioPicker();
  }

  function beginScenario(sc, factionId) {
    SK.state = newState(sc, factionId);
    SK.save();
    SK.showMap();
    if (window.SKMap) { SKMap.resetCamera(); }
    SK.refreshHud();
    const s = SK.state;
    const f = s.factions[s.playerFaction] || {};
    const lord = SK.GEN_BY_NAME[f.lord];
    const cap = SK.CITY[s.playerCapital];
    setTimeout(() => {
      SK.modal({
        kicker: sc ? `${sc.year}년` : '난세의 시작',
        title: sc ? sc.title : '천하의 서막',
        body: `<div class="intro-modal">
          <div class="intro-portrait" style="border-color:${f.color || '#b8862f'}"><img src="${SK.ptSrc(lord ? SK.genPortrait(lord) : 'caocao')}" alt=""></div>
          <p>“${SK.quoteOf(f.lord, 'deploy') || '천하는 넓고, 내 길은 멀다.'}”</p>
          <ul>
            <li><b>세력</b> ${f.name || '-'} · ${f.lord || '-'}</li>
            <li><b>수도</b> ${cap ? cap.name : '-'} · <b>영지</b> ${(f.cities || []).length}곳</li>
            <li><b>목표</b> 인접한 적성을 공략해 천하를 통일하십시오.</li>
          </ul>
          ${sc && sc.historyNote ? `<p class="sc-summary">${sc.historyNote}</p>` : ''}
        </div>`,
        actions: [{ label: '출발한다', primary: true }],
      });
    }, 320);
    // 시작 달의 연표 이벤트
    const ev = sc ? SK.timelineFor(sc, s.eraYear, s.month + 1) : null;
    if (ev) {
      s.timelineSeen = s.timelineSeen || [];
      s.timelineSeen.push(ev.title);
      setTimeout(() => showTimelineCard(ev, true), 900);
    }
  }

  /* 연표 — 역사 사건 카드 */
  function showTimelineCard(ev, intro, after) {
    if (!ev) return;
    SK.modal({
      kicker: intro ? '난세의 기록' : '역사의 흐름',
      title: ev.title,
      body: `<div class="timeline-card">
        <span class="tl-seal">사</span>
        <p>${ev.text}</p>
        <p class="tl-date">${ev.year}년 ${ev.month}월</p>
      </div>`,
      actions: [{ label: '기억해 두겠다', primary: true, onClick: () => { if (after) setTimeout(after, 240); } }],
      wide: true,
    });
  }

  /* ───────────── HUD ───────────── */
  SK.refreshHud = function () {
    const s = SK.state;
    if (!s) return;
    // 상단 깃발 — 플레이 세력의 색·한자·군주 초상
    const pfInfo = SK.factionInfo(PF());
    const chip = $('.flag-chip');
    if (chip) {
      chip.style.borderColor = pfInfo.color || '#b8862f';
      const span = chip.querySelector('span');
      if (span) { span.textContent = SK.markOf(pfInfo); span.title = pfInfo.name || ''; }
      const mini = $('#lord-mini');
      const lordG = pfInfo.lord ? SK.GEN_BY_NAME[pfInfo.lord] : null;
      if (mini && lordG) mini.src = SK.ptSrc(SK.genPortrait(lordG));
    }
    const capBtn = $('#go-capital');
    if (capBtn) capBtn.textContent = SK.markOf(pfInfo);
    $('#map-gold').textContent = fmt(s.gold);
    $('#map-food').textContent = fmt(s.food);
    $('#map-troops').textContent = fmt(totalTroops());
    $('#map-date').textContent = SK.dateLabel(s.eraYear || (195 + s.year), s.month);
    $('#map-fame').textContent = '명성 ' + fmt(s.fame);
    const rank = SK.rankFor(s.fame);
    const rk = $('#map-rank');
    if (rk) {
      rk.textContent = rank.title;
      const nx = SK.nextRank(s.fame);
      rk.title = nx ? `관작 ${rank.title} · 다음 ${nx.title}까지 명성 ${fmt(nx.minRenown - s.fame)}` : `관작 ${rank.title}`;
    }
    const se = $('#map-season');
    if (se) {
      se.textContent = ['봄', '여름', '가을', '겨울'][Math.min(3, Math.floor(s.month / 3))];
      se.title = `${['봄', '여름', '가을', '겨울'][Math.min(3, Math.floor(s.month / 3))]} 계절`;
    }
    const owned = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF()).length;
    const fname = SK.factionName(PF());
    $('#map-hint').textContent = owned >= SK.CITY_LIST.length ? `천하통일! 모든 거점이 ${fname}의 깃발 아래 있습니다.` :
      `${fname} 거점 ${owned} / ${SK.CITY_LIST.length} · 다음 달이 되면 세수와 군량이 들어옵니다.`;
  };
  function totalTroops() {
    return SK.CITY_LIST.reduce((sum, c) => sum + (SK.state.cities[c.id].owner === PF() ? SK.state.cities[c.id].troops : 0), 0);
  }
  SK.totalTroops = totalTroops;

  /* 관작에 따라 성의 병력 상한이 올라간다 */
  function troopCap() {
    const rank = SK.rankFor(SK.state ? SK.state.fame : 0);
    return 20000 + (rank.maxTroopsBonus || 0);
  }
  SK.troopCap = troopCap;

  /* ───────────── 도시 시트 (지도 하단) ───────────── */
  function isScouted(st) {
    const s = SK.state;
    return !!(st && st.scoutedUntil && Number(st.scoutedUntil) >= (s ? s.turn : 1));
  }
  SK.isScouted = isScouted;

  function scoutCost() { return 45; }
  SK.scoutCost = scoutCost;

  /* 정찰 — 길로 이어진 아군 성에서 첩자를 보내 3~4개월 동안 적성 내부를 볼 수 있다 */
  SK.scoutCity = function (id, fromId) {
    const s = SK.state;
    const st = s.cities[id];
    if (!st || st.owner === PF()) return false;
    if (s.gold < scoutCost()) { SK.sfx.play('deny'); SK.toast(`금이 부족합니다. (정찰 금 ${scoutCost()})`); return false; }
    const from = fromId || SK.allNeighbors(id).find((n) => s.cities[n] && s.cities[n].owner === PF());
    if (!from) { SK.toast('정찰을 보낼 아군 성이 맞닿아 있지 않습니다.'); return false; }
    s.gold -= scoutCost();
    const months = 3 + Math.floor(Math.random() * 2);
    st.scoutedUntil = s.turn + months;
    st.scoutedFrom = from;
    SK.save();
    SK.refreshHud();
    SK.sfx.play('ui');
    SK.toast(`${CITY[id].name} 정찰 완료 — ${months}개월 동안 성내가 보입니다.`);
    if (document.querySelector('#screen-map.active')) SK.openCitySheet(id);
    return true;
  };

  SK.openCitySheet = function (id) {
    const c = CITY[id];
    const st = SK.state.cities[id];
    const f = SK.factionInfo(st.owner);
    const mine = st.owner === PF();
    const scouted = mine || isScouted(st);
    const ownGens = SK.state.heroes.filter((h) => h.city === id);
    const defGens = mine ? [] : (st.genIds || []).map((gid) => SK.GEN_BY_ID[gid]).filter(Boolean);
    const generals = mine ? ownGens : (scouted ? defGens : []);
    const canAttack = !mine && SK.allNeighbors(id).some((n) => SK.state.cities[n].owner === PF());
    const hidden = '? <em class="fog">미정찰</em>';
    const sheet = $('#city-sheet');
    sheet.hidden = false;
    sheet.innerHTML = `
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <span class="faction-badge" style="--fc:${f.color}">${SK.markOf(f)}</span>
        <div class="sheet-title"><h3>${c.name}</h3>
          <p>${f.name} · ${typeName(c.type)} · ${c.region}${!mine && scouted ? ' · <b class="scout-on">정찰됨</b>' : ''}</p></div>
        <button class="sheet-close" aria-label="닫기">✕</button>
      </div>
      <div class="sheet-stats ${scouted ? '' : 'fogged'}">
        <div><span>수비병</span><b>${scouted ? fmt(st.troops) : hidden}</b></div>
        <div><span>성벽</span><b>${scouted ? st.def : hidden}</b></div>
        <div><span>민심</span><b>${scouted ? st.loyalty : hidden}</b></div>
        <div><span>장수</span><b>${scouted ? generals.length : hidden}</b></div>
      </div>
      ${generals.length ? `<div class="sheet-gens">${generals.slice(0, 6).map((g) => `<div class="mini-gen" title="통솔 ${g.tong || g.leadership} 무력 ${g.wu || g.war} 지력 ${g.ji || g.intel} 정치 ${g.pol || g.politics || 60} 매력 ${g.cha || g.charm || 60}"><img src="${SK.ptSrc(g.portrait || SK.genPortrait(g))}" alt=""><div><span>${g.name}</span><em>통${g.tong || g.leadership} 무${g.wu || g.war} 지${g.ji || g.intel} 정${g.pol || g.politics || 60} 매${g.cha || g.charm || 60}</em></div></div>`).join('')}</div>` : ''}
      ${!mine && !scouted ? `<p class="fog-note">첩자가 닿지 않아 성안을 알 수 없습니다. [정찰 보내기]로 3~4개월 동안 병력·성벽·장수를 살필 수 있습니다.</p>` : ''}
      <div class="sheet-actions">
        ${mine ? `<button class="btn btn-primary" data-a="enter">입성 · 내정</button>` : ''}
        ${!mine && canAttack ? `<button class="btn btn-primary danger" data-a="attack">출진 · 공격</button>` : ''}
        ${!mine && !scouted ? `<button class="btn btn-paper" data-a="scout">정찰 보내기 <em>금 ${scoutCost()}</em></button>` : ''}
        ${!mine && !canAttack ? `<button class="btn btn-paper" data-a="far">원정 불가</button>` : ''}
        <button class="btn btn-paper" data-a="close">닫기</button>
      </div>`;
    sheet.querySelector('.sheet-close').onclick = () => (sheet.hidden = true);
    sheet.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'enter') { sheet.hidden = true; SK.openCity(id); }
        else if (a === 'attack') {
          if (!isScouted(st)) {
            SK.modal({
              kicker: `${c.name} · 미정찰`,
              title: '보이지 않는 성을 칠까',
              body: `<p class="modal-p">아직 첩자가 닿지 않아 ${c.name}의 병력·성벽·장수를 모릅니다. 먼저 정찰하면 출진할 때 적의 전력을 알고 편성할 수 있습니다.</p>`,
              actions: [
                { label: '닫기' },
                { label: `정찰 먼저 (금 ${scoutCost()})`, onClick: () => SK.scoutCity(id) },
                { label: '그래도 출진', onClick: () => { sheet.hidden = true; const from = SK.allNeighbors(id).find((n) => SK.state.cities[n].owner === PF()) || SK.state.lastCity; SK.openSortiePrep(id, from); } },
              ],
            });
            return;
          }
          sheet.hidden = true;
          const from = SK.allNeighbors(id).find((n) => SK.state.cities[n].owner === PF()) || SK.state.lastCity;
          SK.openSortiePrep(id, from);
        }
        else if (a === 'scout') { const ok = SK.scoutCity(id); if (ok) SK.closeCitySheet(); }
        else if (a === 'far') { SK.toast('인접한 아군 거점에서만 출진할 수 있습니다.'); }
        else sheet.hidden = true;
      };
    });
  };
  SK.closeCitySheet = function () { const s = $('#city-sheet'); if (s) s.hidden = true; };

  function typeName(t) {
    return { capital: '대도시', town: '소도시', pass: '관문', fortress: '요새' }[t] || '거점';
  }
  SK.typeName = typeName;

  /* ───────────── 내정 화면 — 6개 시설 ───────────── */
  /* v5.0.1 — 성 마당의 실제 건물·공터 자리 (성 그림 위 %).
     공터 슬롯(소도시 5 · 대도시 8 · 관문 2 · 요새 3)이 이 자리에 그대로 그려지고,
     건물을 누르면 건설/증축/담당 배치가 바로 열린다. */
  /* v5.3 — 시장은 깃발에 가리지 않게 왼쪽 아래 상가 쪽으로, 관아는 성문 위로 */
  const YARD_SPOTS = [
    { x: 11, y: 34 }, { x: 34, y: 21 }, { x: 66, y: 21 }, { x: 82, y: 26 },
    { x: 18, y: 58 }, { x: 34, y: 62 }, { x: 66, y: 62 }, { x: 82, y: 58 },
  ];
  /* v5.0.3 — 성벽은 안뜰이 아니라 성문·외벽 위에 둔다 (2026-11-20 지적) */
  const WALL_SPOT = { x: 50, y: 82 };
  const OFFICE_SPOT = { x: 50, y: 15 };
  const HOTSPOTS = [{ key: 'office', name: '관아', x: OFFICE_SPOT.x, y: OFFICE_SPOT.y }];

  SK.openCity = function (id) {
    const s = SK.state;
    const c = CITY[id];
    const st = s.cities[id];
    if (st.owner !== PF()) { SK.openCitySheet(id); return; }
    /* v5.0.3 — 군주가 주둔한 성은 언제나 군주가 친히 다스린다 */
    if (enforceLordGovernor(s)) SK.save();
    s.lastCity = id;
    SK.save();
    const f = SK.factionInfo(st.owner);
    $('#city-name').textContent = c.name;
    $('#city-hanja').textContent = typeName(c.type);
    $('#city-faction').textContent = SK.markOf(f);
    $('#city-faction').style.background = f.color;
    $('#city-lord-img').src = `${SK.ptSrc(heroPortrait(id))}`;
    const scene = sceneFor(c);
    $('#city-scene-img').src = `assets/scenes/${scene}.webp`;
    $('#city-gold').textContent = fmt(s.gold);
    $('#city-food').textContent = fmt(s.food);
    $('#city-troops').textContent = fmt(st.troops);
    const gens = s.heroes.filter((h) => h.city === id);
    if (!gens.length) cityActorUid = null;
    ensureSlots(st, c);
    $('#city-weather').textContent = `${monthWeather(s)} · ${st.loyalty > 75 ? '민심 안정' : st.loyalty > 50 ? '민심 보통' : '민심 흉흉'}`;
    const cr = $('#city-rank');
    if (cr) cr.textContent = SK.rankFor(s.fame).title;
    renderCityDev(id);
    renderCitySlots(id);
    renderSceneLevel(id);
    renderCityGens(id);
    renderYard(id);
    SK.show('screen-city');
    bgm('domestic');
  };

  function heroPortrait(cityId) {
    const g = SK.state.heroes.find((h) => h.city === cityId);
    return g ? g.portrait : 'caocao';
  }
  function sceneFor(c) {
    if (c.region === '한국' || c.region === '대만') return 'city_mountain';
    if (c.region === '서촉' || c.region === '서량' || c.region === '익주') return 'city_mountain';
    if (['강동', '회남', '형주', '광동'].indexOf(c.region) >= 0) return 'city_river';
    return 'city_main';
  }
  function monthWeather(s) {
    const arr = ['맑음', '구름 조금', '바람', '비', '안개'];
    return arr[(s.month + 2) % arr.length];
  }

  function bondLines(name) {
    const bonds = SK.bondsOf ? SK.bondsOf(name) : [];
    if (!bonds.length) return '';
    const rows = bonds.map((b) => {
      const p = SK.bondPartner(b, name);
      const rival = b.relation === '숙적';
      return `<div class="hb-row ${rival ? 'rival' : 'friend'}">
        <span class="hb-rel">${rival ? '숙적' : '친밀'}</span>
        <div><b>${p}</b><span>${b.title}</span><em>${b.effect}</em></div>
      </div>`;
    }).join('');
    return `<div class="hi-bonds"><p class="hb-title">인연</p>${rows}</div>`;
  }

  /* 우리 군주와 숙적인 인물은 등용을 거부한다 */
  function lordRival(name) {
    const lord = SK.factionInfo(PF()).lord;
    if (!lord) return false;
    return (SK.bondsOf ? SK.bondsOf(name) : []).some((b) => b.relation === '숙적' && (b.a === lord || b.b === lord));
  }
  SK.lordRival = lordRival;

  function equipLines(g) {
    const eq = SK.equipBonus(g);
    const items = Object.keys(SK.SLOT_NAMES).map((sl) => {
      const id = (g.equip || {})[sl];
      const t = id ? SK.TREASURE_BY_ID[id] : null;
      return t ? `<span class="eq-chip" style="--gc:${SK.GRADE_COLOR[t.grade]}">${t.name}</span>` : '';
    }).join('');
    const bonus = [];
    if (eq.war) bonus.push(`무력+${eq.war}`);
    if (eq.intel) bonus.push(`지력+${eq.intel}`);
    if (eq.leadership) bonus.push(`통솔+${eq.leadership}`);
    if (eq.move) bonus.push(`이동+${eq.move}`);
    return `<div class="hi-equip">${items || '<span class="eq-none">장비 없음</span>'}</div>${bonus.length ? `<p class="hi-bonus">보물 보정 — ${bonus.join(' · ')}</p>` : ''}`;
  }

  function openTreasures(hero) {
    const s = SK.state;
    hero.equip = hero.equip || {};
    s.treasures = s.treasures || [];
    let slot = 'weapon';
    const m = SK.modal({
      kicker: `${hero.name}의 보물`,
      title: '장비를 갖추다',
      body: '<div id="tr-body"></div>',
      wide: true,
      actions: [
        { label: '← 뒤로', onClick: () => setTimeout(() => showHeroInfo(hero.uid), 40) },
        { label: '닫기', primary: true },
      ],
    });
    const render = () => {
      const bonusLine = (t) => {
        const st = SK.treasureStats(t);
        const b = [];
        if (st.war) b.push(`무력+${st.war}`);
        if (st.intel) b.push(`지력+${st.intel}`);
        if (st.leadership) b.push(`통솔+${st.leadership}`);
        if (st.politics) b.push(`정치+${st.politics}`);
        if (st.charm) b.push(`매력+${st.charm}`);
        if (st.move) b.push(`이동+${st.move}`);
        return b.join(' · ');
      };
      const slots = Object.keys(SK.SLOT_NAMES).map((sl) => {
        const id = hero.equip[sl];
        const t = id ? SK.TREASURE_BY_ID[id] : null;
        return `<button class="tr-slot ${slot === sl ? 'sel' : ''}" data-slot="${sl}" style="--gc:${t ? SK.GRADE_COLOR[t.grade] : '#9a8a66'}">
          <span class="ts-type">${SK.SLOT_NAMES[sl]}</span>
          <b style="color:${t ? SK.GRADE_COLOR[t.grade] : '#9a8a66'}">${t ? t.name : '비어 있음'}</b>
          ${t ? `<em class="ts-grade">${t.grade}</em><span class="ts-bonus">${bonusLine(t)}</span><span class="ts-effect">${t.effect}</span>` : ''}
        </button>`;
      }).join('');
      const owned = new Set();
      s.heroes.forEach((h) => Object.values(h.equip || {}).forEach((id) => owned.add(id)));
      const inv = s.treasures.map((id) => SK.TREASURE_BY_ID[id]).filter((t) => t && SK.treasureSlot(t) === slot);
      const list = inv.length ? inv.map((t) => `<button class="tr-item" data-id="${t.id}" style="--gc:${SK.GRADE_COLOR[t.grade]}">
          <span class="tr-grade">${t.grade}</span>
          <div><b>${t.name}</b><span class="tr-bonus">${bonusLine(t)}</span><span class="tr-eff">${t.effect}</span></div>
          <em>장착</em>
        </button>`).join('') : `<p class="tr-empty">${SK.SLOT_NAMES[slot]} 보물이 없습니다. 전장이나 [탐색]으로 얻을 수 있습니다.</p>`;
      const cur = hero.equip[slot] ? `<button class="btn btn-paper tr-unequip" id="tr-unequip">${SK.SLOT_NAMES[slot]} 해제</button>` : '';
      m.el.querySelector('#tr-body').innerHTML = `
        <div class="tr-slots">${slots}</div>
        <div class="tr-inv-head"><span>보유 ${SK.SLOT_NAMES[slot]}</span>${cur}</div>
        <div class="tr-list">${list}</div>
        <p class="tr-note">보물은 무기·방어구·명마·병법서 한 자리씩 장착됩니다. 전장이나 [탐색]으로 얻을 수 있습니다.</p>`;
      m.el.querySelectorAll('.tr-slot').forEach((b) => { b.onclick = () => { slot = b.dataset.slot; render(); }; });
      m.el.querySelectorAll('.tr-item').forEach((b) => {
        b.onclick = () => {
          const id = Number(b.dataset.id);
          if (hero.equip[slot]) s.treasures.push(hero.equip[slot]);
          hero.equip[slot] = id;
          s.treasures = s.treasures.filter((x) => x !== id);
          SK.save();
          render();
          SK.toast(`${josa(hero.name, 'i')} ${josa(SK.TREASURE_BY_ID[id].name, 'eul')} 장착했습니다.`);
        };
      });
      const un = m.el.querySelector('#tr-unequip');
      if (un) un.onclick = () => {
        if (!hero.equip[slot]) return;
        s.treasures.push(hero.equip[slot]);
        delete hero.equip[slot];
        SK.save(); render();
      };
    };
    render();
    return m;
  }
  SK.openTreasures = openTreasures;

  SK.rollTreasure = function (names, cityName) {
    if (!SK.TREASURES.length) return null;
    const s = SK.state;
    if (Math.random() > 0.62) return null;
    const owned = new Set(s.treasures || []);
    s.heroes.forEach((h) => Object.values(h.equip || {}).forEach((id) => owned.add(id)));
    const pool = SK.TREASURES.filter((t) => !owned.has(t.id));
    if (!pool.length) return null;
    const weights = pool.map((t) => {
      let b = t.grade === '전설' ? 1 : t.grade === '영웅' ? 2.2 : 3.5;
      if ((names || []).some((n) => n && t.dropHint.includes(n)) || (cityName && t.dropHint.includes(cityName))) b *= 12;
      return b;
    });
    let total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { pick = pool[i]; break; } }
    s.treasures.push(pick.id);
    return pick;
  };

  /* ───────────── 장수 명부 (Koei풍 표) ───────────── */
  const ROSTER_COLS = [
    { key: 'name', label: '이름', w: 'wide', sort: (h) => h.name },
    { key: 'tong', label: '통솔', num: true, sort: (h) => h.tong },
    { key: 'wu', label: '무력', num: true, sort: (h) => h.wu },
    { key: 'ji', label: '지략', num: true, sort: (h) => h.ji },
    { key: 'pol', label: '정치', num: true, sort: (h) => h.pol || 0 },
    { key: 'cha', label: '매력', num: true, sort: (h) => h.cha || 0 },
    { key: 'loyal', label: '충성', num: true, sort: (h) => (h.loyal == null ? 100 : h.loyal) },
    { key: 'role', label: '직책', sort: (h) => roleOf(h) },
    { key: 'city', label: '위치', sort: (h) => (CITY[h.city] || {}).name || '' },
  ];

  /* v5 — 나이 (세는나이: 올해 - 태어난 해 + 1). 태어난 해를 모르면 0 */
  function heroAge(h) {
    if (!h) return 0;
    const g = h.genId ? SK.GEN_BY_ID[h.genId] : SK.GEN_BY_NAME[h.name];
    const by = g && Number(g.birthYear);
    if (!by) return 0;
    const yr = SK.state ? Number(SK.state.eraYear || 190) : 190;
    return Math.max(1, yr - by + 1);
  }
  SK.heroAge = heroAge;

  function roleOf(h) {
    const s = SK.state;
    const f = s.factions[PF()] || {};
    if (h.name === f.lord) return '군주';
    const cs = s.cities[h.city];
    if (cs && cs.governor === h.uid) return '태수';
    if (cs && cs.advisor === h.uid) return '군사';
    if (cs && cs.governor == null) {
      const peers = s.heroes.filter((x) => x.city === h.city);
      if (peers.length) {
        const top = peers.slice().sort((a, b) => (b.pol * 0.6 + b.tong * 0.4) - (a.pol * 0.6 + a.tong * 0.4))[0];
        if (top.uid === h.uid) return '태수';
      }
    }
    return '일반';
  }
  SK.roleOf = roleOf;

  function openRoster(tab) {
    let cur = tab || 'gen';
    let sortKey = 'tong';
    let dir = -1;

    const m = SK.modal({
      kicker: '내 장수',
      title: '장수 명부',
      body: `<div class="roster">
        <div class="rs-tabs">
          <button data-t="gen" class="on">장수</button>
          <button data-t="item">보물</button>
          <button data-t="map">배치</button>
        </div>
        <div class="rs-body" id="rs-body"></div>
      </div>`,
      wide: true,
      actions: [{ label: '닫기', primary: true }],
      dismissible: true,
    });

    function rows() {
      const list = SK.state.heroes.slice();
      const col = ROSTER_COLS.find((c) => c.key === sortKey) || ROSTER_COLS[0];
      list.sort((a, b) => {
        const va = col.sort(a), vb = col.sort(b);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'ko') * dir;
      });
      return list;
    }

    function renderGen() {
      const list = rows();
      const head = ROSTER_COLS.map((c) => `<button class="rs-th ${c.num ? 'num' : ''} ${sortKey === c.key ? 'on' : ''}" data-k="${c.key}">${c.label}${sortKey === c.key ? (dir < 0 ? ' ▼' : ' ▲') : ''}</button>`).join('');
      const body = list.map((h) => `<button class="rs-row" data-uid="${h.uid}">
          <span class="rs-name"><img style="--fa:${genAura(h.genId, h.name)}" src="${SK.ptSrc(h.portrait)}" alt=""><b>${h.name}</b><em class="rs-age">${heroAge(h) || '-'}</em></span>
          <span class="rs-num">${h.tong}</span>
          <span class="rs-num">${h.wu}</span>
          <span class="rs-num">${h.ji}</span>
          <span class="rs-num dim">${h.pol || 60}</span>
          <span class="rs-num dim">${h.cha || 60}</span>
          <span class="rs-num dim">${h.loyal == null ? 100 : h.loyal}</span>
          <span class="rs-role r-${roleOf(h)}">${roleOf(h)}</span>
          <span class="rs-city">${(CITY[h.city] || {}).name || '-'}</span>
        </button>`).join('');
      m.el.querySelector('#rs-body').innerHTML = `<div class="rs-table">
          <div class="rs-head">${head}</div>
          <div class="rs-rows">${body || '<p class="rs-empty">아직 휘하에 장수가 없습니다. 주점에서 인재를 등용하세요.</p>'}</div>
        </div>
        <p class="rs-note">머리글을 누르면 정렬됩니다 · 장수를 누르면 상세·보물·이동</p>`;
      m.el.querySelectorAll('.rs-th').forEach((b) => {
        b.onclick = () => {
          const k = b.dataset.k;
          if (sortKey === k) dir = -dir;
          else { sortKey = k; dir = (k === 'name' || k === 'role' || k === 'city') ? 1 : -1; }
          renderGen();
        };
      });
      m.el.querySelectorAll('.rs-row').forEach((b) => {
        b.onclick = () => { m.close(); setTimeout(() => showHeroInfo(b.dataset.uid), 40); };
      });
    }

    function renderItem() {
      const s = SK.state;
      const owned = new Set();
      s.heroes.forEach((h) => Object.values(h.equip || {}).forEach((id) => owned.add(id)));
      const inv = (s.treasures || []).map((id) => SK.TREASURE_BY_ID[id]).filter(Boolean);
      const rowsHtml = s.heroes.map((h) => {
        const chips = Object.keys(SK.SLOT_NAMES).map((sl) => {
          const t = SK.TREASURE_BY_ID[(h.equip || {})[sl]];
          return t ? `<span class="eq-chip" style="--gc:${SK.GRADE_COLOR[t.grade]}">${t.name}</span>` : '';
        }).join('');
        return `<button class="rs-item" data-uid="${h.uid}">
          <img src="${SK.ptSrc(h.portrait)}" alt="">
          <div><b>${h.name}</b><span>${chips || '<em class="eq-none">장비 없음</em>'}</span></div>
          <em>관리 ▸</em>
        </button>`;
      }).join('');
      m.el.querySelector('#rs-body').innerHTML = `<div class="rs-inv"><b>보관 중인 보물 ${inv.length}점</b>
          <span>${inv.slice(0, 8).map((t) => `<i style="--gc:${SK.GRADE_COLOR[t.grade]}">${t.name}</i>`).join('') || '없음'}</span></div>
        <div class="rs-items">${rowsHtml}</div>`;
      m.el.querySelectorAll('.rs-item').forEach((b) => {
        b.onclick = () => {
          const h = SK.state.heroes.find((x) => x.uid === b.dataset.uid);
          m.close();
          setTimeout(() => openTreasures(h), 40);
        };
      });
      void owned;
    }

    function renderMap() {
      const s = SK.state;
      const ids = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF())
        .sort((a, b) => (CITY[b.id].type === 'capital' ? 1 : 0) - (CITY[a.id].type === 'capital' ? 1 : 0));
      const html = ids.map((c) => {
        const cs = s.cities[c.id];
        const gens = s.heroes.filter((h) => h.city === c.id);
        return `<button class="rs-citycard" data-c="${c.id}">
          <span class="rc-badge" style="background:${SK.factionColor(PF())}">${cityLevel(cs)}</span>
          <div class="rc-main"><b>${c.name}</b>
            <span>인구 ${fmt(cs.pop)} · 병력 ${fmt(cs.troops)}/${fmt(cityCap(cs))} · 민심 ${cs.loyalty}</span></div>
          <span class="rc-gens">${gens.length}명</span>
        </button>`;
      }).join('');
      m.el.querySelector('#rs-body').innerHTML = `<div class="rs-map">${html}</div>`;
      m.el.querySelectorAll('.rs-citycard').forEach((b) => {
        b.onclick = () => { m.close(); setTimeout(() => { SK.openCity(b.dataset.c); }, 40); };
      });
    }

    function render() {
      m.el.querySelectorAll('.rs-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === cur));
      if (cur === 'gen') renderGen();
      else if (cur === 'item') renderItem();
      else renderMap();
    }
    m.el.querySelectorAll('.rs-tabs button').forEach((b) => {
      b.onclick = () => { cur = b.dataset.t; render(); };
    });
    render();
    return m;
  }
  SK.openRoster = openRoster;

  /* 계열별 초상화 오라 색 — 위 파랑 · 촉 옥빛 초록 · 오 크림슨 · 한국 금/틸 · 군웅 보랏빛/호박 */
  const GROUP_AURA = { '위': '#3B82F6', '촉': '#22A06B', '오': '#DC2626', '한국': '#D4A017', '군웅': '#8B5CF6' };
  function genAura(genId, name) {
    const g = genId ? SK.GEN_BY_ID[genId] : (name ? SK.GEN_BY_NAME[name] : null);
    const grp = g ? genPoolGroup(g) : '군웅';
    return GROUP_AURA[grp] || GROUP_AURA['군웅'];
  }
  SK.genAura = genAura;

  function showHeroInfo(uid) {
    const g = SK.state.heroes.find((h) => h.uid === uid);
    if (!g) return;
    const C = SK.CLASSES[g.cls];
    const hpM = maxHpOf(g.cls, g.lv), mpM = maxMpOf(g.cls, g.lv);
    SK.modal({
      title: `${g.name}`,          body: `<div class="hero-info">
        <div class="hi-portrait" style="--fa:${genAura(g.genId, g.name)}"><img src="${SK.ptSrc(g.portrait)}" alt=""></div>
        <div class="hi-body">
          <p class="hi-cls">${SK.classTitle(g.cls, g.lv)} · ${C.role} · Lv.${g.lv}${g.tier ? ` · ${g.tier}급` : ''}${heroAge(g) ? ` · ${heroAge(g)}세` : ''}</p>
          ${g.skillName ? `<p class="hi-skill">특기 — ${g.skillName}</p>` : ''}
          ${(SK.PASSIVES && SK.PASSIVES[g.name]) ? `<div class="hi-passive"><span>고유 특기</span><b>${SK.PASSIVES[g.name].title}</b><p>${SK.PASSIVES[g.name].effect}</p></div>` : ''}
          <div class="hi-exp"><i style="width:${Math.min(100, Math.round((g.exp || 0) / SK.expNeed(g.lv) * 100))}%"></i><em>EXP ${g.exp || 0} / ${SK.expNeed(g.lv)}</em></div>
          <p class="hi-next">${SK.nextPromo(g.lv) ? `다음 승급 Lv.${SK.nextPromo(g.lv)} · ${SK.PROMO[g.cls] ? SK.PROMO[g.cls].names[Math.min(4, SK.PROMO[g.cls].names.length - 1)] : ''}` : '최고 승급 단계'}</p>
          <div class="hi-bars"><span class="hi-hp">출진 병력 ${SK.troopForNamed(g.lv).toLocaleString('ko-KR')} / 최대 ${SK.troopCapOf(g).toLocaleString('ko-KR')}</span><span class="hi-mp">MP ${g.mp}/${mpM}</span></div>
          <div class="hi-attrs five">
            <div><span>통솔</span><b>${g.tong}</b></div>
            <div><span>무력</span><b>${g.wu}</b></div>
            <div><span>지력</span><b>${g.ji}</b></div>
            <div><span>정치</span><b>${g.pol || 60}</b></div>
            <div><span>매력</span><b>${g.cha || 60}</b></div>
          </div>
          <p class="hi-desc">${C.desc}</p>
          ${bondLines(g.name)}
          <p class="hi-quote">“${SK.quoteOf(g.name, 'deploy') || '필승을 기원한다.'}”</p>
        </div>
      </div>`,
      actions: [
        { label: '← 뒤로', onClick: () => setTimeout(() => openRoster('gen'), 40) },
        { label: '보물 관리', onClick: () => openTreasures(g) },
        ...(SK.state.cities[g.city] && SK.state.cities[g.city].owner === PF()
          ? [{ label: '다른 성으로 이동', onClick: () => openTransfer(g) }] : []),
        { label: '닫기', primary: true },
      ],
    });
  }
  SK.showHeroInfo = showHeroInfo;

  function openTransfer(g) {
    const s = SK.state;
    const towns = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF() && c.id !== g.city);
    if (!towns.length) { SK.toast('옮겨 갈 다른 성이 없습니다.'); return; }
    const rows = towns.map((c) => `<button class="target-card" data-c="${c.id}">
      <span class="tc-flag" style="background:${SK.factionColor(PF())}">${SK.markOf(SK.factionInfo(PF()))}</span>
      <div class="tc-main"><b>${c.name}</b><span>${typeName(c.type)} · 주둔 ${s.heroes.filter((h) => h.city === c.id).length}명</span></div>
      <span class="tc-troops"><span>수비병</span><b>${fmt(s.cities[c.id].troops)}</b></span>
      <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({ kicker: `${g.name} 이동`, title: '어느 성으로 갈까', body: `<div class="target-list">${rows}</div>`, chest: true, actions: [{ label: '취소' }], wide: true });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        const dest = b.dataset.c;
        g.city = dest;
        enforceLordGovernor(s);
        SK.save();
        m.close();
        SK.toast(`${josa(g.name, 'i')} ${josa(CITY[dest].name, 'euro')} 이동했습니다.`);
        if (document.querySelector('#screen-city.active')) SK.openCity(s.lastCity);
      };
    });
  }
  SK.openTransfer = openTransfer;

  /* ───────────── 내정 명령 · 행동력 ───────────── */
  const DOMESTIC = ['farm', 'trade', 'recruit', 'train', 'talent', 'repair'];
  const ACTION_SFX = { farm: 'chop', trade: 'coin', recruit: 'drum', train: 'drum', talent: 'coin', repair: 'hammer' };
  const CUTIN_LINES = {
    farm: ['민심을 살피고 창고를 채웠습니다!', '들녘을 일구니 곡식이 가득합니다!', '백성과 함께 땀을 흘렸습니다.'],
    trade: ['저잣거리에 금빛이 넘칩니다!', '상로를 열어 금은을 모았습니다!', '상인들이 웃으며 성을 떠납니다.'],
    recruit: ['백성들이 창을 들었습니다!', '새 병사가 대열에 섰습니다!', '깃발 아래로 젊은이들이 모였습니다.'],
    train: ['병법을 익혀 사기가 올랐습니다!', '한 번 더, 다시 한 번!', '진법이 흐트러짐 없이 정돈됩니다.'],
    talent: ['재야의 인재가 우리를 찾아왔습니다!', '천하의 인재를 얻었습니다!', '이 사람, 쓸 만합니다.'],
    repair: ['성벽을 다시 세웠습니다!', '이제 성문은 굳건합니다!', '돌 하나까지 손보았습니다.'],
  };

  function fail(msg) { SK.toast(msg); return null; }
  function roll(p) { return Math.random() < p; }
  function pickLine(key) {
    const arr = CUTIN_LINES[key] || [''];
    return arr[Math.floor(Math.random() * arr.length)];
  }
  /* 행군 중인 장수는 성에 없는 것으로 친다 (v5.3) */
  function cityGens(cityId) { return SK.state.heroes.filter((h) => h.city === cityId && !h.marchId); }

  /* 세력 이름 뒤에 '군'을 한 번만 붙인다 (공융군군 → 공융군) */
  function armyName(f) {
    const n = String((f && f.name) || '재야');
    return /군$/.test(n) ? n : n + '군';
  }
  SK.armyName = armyName;

  /* ══════════════════════════════════════════════════════════════
     v5 내정 개편 1단계 — 설치식 내성 건설(공터 슬롯) · 5묶음 메뉴
     · 공터에 건물을 지어 두면 담당자가 없어도 50% 효과가 돌아간다
     · 담당 장수를 앉히면 능력치에 따라 100~150% 효과 + 매달 경험치
     · 장수는 한 달에 한 번, '건물 담당'이거나 '직접 명령' 중 하나를 한다
     ══════════════════════════════════════════════════════════════ */
  const SLOT_DEFS = {
    market: { name: '시장', icon: 'market', stat: 'pol', res: 'gold', desc: '매달 금을 벌어들입니다' },
    farm: { name: '농원', icon: 'farm', stat: 'pol', res: 'food', desc: '매달 군량을 쌓습니다' },
    barracks: { name: '병영', icon: 'barracks', stat: 'tong', res: 'troops', desc: '매달 수비병을 모읍니다' },
    training: { name: '연병장', icon: 'training', stat: 'tong', res: 'train', desc: '훈련도를 올리고 담당 장수를 키웁니다' },
    patrol: { name: '순찰소', icon: 'patrol', stat: 'cha', res: 'loyalty', desc: '민심과 치안을 다스립니다' },
    tavern: { name: '주점', icon: 'tavern', stat: 'cha', res: 'talent', desc: '재야 인재가 모여듭니다' },
    wall: { name: '성벽', icon: 'wall', stat: 'tong', res: 'def', desc: '성벽을 손봅니다' },
    lab: { name: '연구소', icon: 'lab', stat: 'pol', res: 'research', desc: '기술 연구를 돕습니다' },
    workshop: { name: '공방', icon: 'workshop', stat: 'pol', res: 'gold', desc: '수송과 병기를 준비합니다' },
  };
  SK.SLOT_DEFS = SLOT_DEFS;
  const SLOT_MAX = { capital: 8, town: 5, pass: 2, fortress: 3 };
  const SLOT_DEFAULT = {
    capital: ['market', 'farm', 'barracks', 'training', 'patrol', 'wall'],
    town: ['market', 'farm', 'barracks'],
    pass: ['wall'],
    fortress: ['wall', 'barracks'],
  };
  function slotCount(type) { return SLOT_MAX[type] || 4; }
  /* v5.2 — 시설 경험치. 담당 장수를 앉혀 몇 달 굴려야 다음 Lv이 열린다 */
  function slotExpNeed(lv) { return 60 + (Number(lv) || 1) * 45; }
  SK.slotExpNeed = slotExpNeed;
  function slotExpRatio(sl) {
    if (!sl || !sl.key) return 0;
    const need = slotExpNeed(sl.lv);
    return Math.max(0, Math.min(1, (sl.exp || 0) / need));
  }
  SK.slotExpRatio = slotExpRatio;
  function ensureSlots(cs, c) {
    if (!cs) return;
    const n = slotCount(c.type);
    if (!Array.isArray(cs.slots)) cs.slots = [];
    const defs = SLOT_DEFAULT[c.type] || SLOT_DEFAULT.town;
    while (cs.slots.length < n) {
      const i = cs.slots.length;
      cs.slots.push({ key: defs[i] || null, lv: defs[i] ? 1 : 0, uid: null });
    }
    if (cs.slots.length > n) cs.slots.length = n;
    cs.slots.forEach((sl) => {
      if (sl.lv == null) sl.lv = sl.key ? 1 : 0;
      if (sl.uid === undefined) sl.uid = null;
      if (sl.exp == null) sl.exp = 0;
    });
    if (cs.order == null) cs.order = 55;
  }
  SK.ensureSlots = ensureSlots;

  /* 시설 아이콘 — 현재 Lv의 외형 (Lv.5는 기존 그림, 없으면 그 그림으로 폴백) */
  function bldSrc(icon, lv) {
    const key = icon || 'market';
    const L = clamp(Math.round(Number(lv) || 1), 1, 5);
    return `assets/buildings/${key}_lv${L}.webp`;
  }
  SK.bldSrc = bldSrc;
  function bldFallback(icon) { return `this.onerror=null;this.src='assets/buildings/${icon || 'market'}.webp';`; }
  SK.bldFallback = bldFallback;

  function slotMul(cs, sl, g) {
    if (!sl || !sl.key) return 0;
    const base = 0.5;
    if (!g) return base;
    const def = SLOT_DEFS[sl.key] || {};
    const stat = g[def.stat || 'pol'] || 60;
    return Math.min(1.5, 1 + Math.max(-0.15, (stat - 60) * 0.0075)) * (0.92 + sl.lv * 0.03);
  }
  SK.slotMul = slotMul;

  function slotOwner(cityId, sl) { return sl && sl.uid ? cityGens(cityId).find((g) => g.uid === sl.uid) || null : null; }

  /* 장수 상태 — 건물 담당 / 대기 / 완료 */
  function dutyOf(h, cityId) {
    const cs = SK.state.cities[cityId || h.city];
    if (cs && (cs.slots || []).some((sl) => sl.uid === h.uid)) return '건물 담당';
    if (h.actedThisMonth) return '이번 달 완료';
    return '대기';
  }
  SK.dutyOf = dutyOf;

  function buildCost(sl) { return sl.key ? Math.round(320 * (sl.lv + 1) * (1 + sl.lv * 0.35)) : 300; }

  function renderCitySlots(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const box = $('#city-slots');
    if (!box) return;
    ensureSlots(cs, c);
    const built = cs.slots.filter((sl) => sl.key).length;
    const free = cs.slots.length - built;
    box.innerHTML = `<div class="slot-head"><b>내성 시설</b><span>${built}/${cs.slots.length}칸 · 공터 ${free}</span>
        <em>치안 ${cs.order == null ? 55 : Math.round(cs.order)} · 마당 건물을 눌러도 같은 창</em></div>
      <div class="slot-row">${cs.slots.map((sl, i) => {
        if (!sl.key) {
          return `<button class="slot-card empty" data-slot="${i}">
            <span class="sc-empty">＋</span><b>공터</b><small>건설 300</small></button>`;
        }
        const def = SLOT_DEFS[sl.key] || { name: sl.key, icon: 'market' };
        const g = slotOwner(cityId, sl);
        const ep = slotExpRatio(sl);
        const full = sl.lv >= 5 || ep >= 1;
        return `<button class="slot-card" data-slot="${i}" style="--sc:#b8862f">
          <img class="sc-ico" src="${bldSrc(def.icon, sl.lv)}" onerror="${bldFallback(def.icon)}" alt="">
          <div class="sc-main"><b>${def.name}</b><small>Lv.${sl.lv}${full && sl.lv < 5 ? '<b class="sc-up">증축</b>' : ''}</small>
            <div class="sc-exp ${full ? 'full' : ''}"><i style="width:${Math.round(ep * 100)}%"></i></div>
            <em>${g ? `<img class="sc-face" src="${SK.ptSrc(g.portrait)}" alt="">${g.name}` : '담당 없음 50%'}</em></div></button>`;
      }).join('')}</div>`;
    box.querySelectorAll('.slot-card').forEach((b) => {
      b.onclick = () => openSlot(cityId, Number(b.dataset.slot));
    });
  }
  SK.renderCitySlots = renderCitySlots;

  /* 마당 그림 위의 건물·공터 (v5.0.1) */
  function renderYard(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const hs = $('#scene-hotspots');
    if (!hs || !cs) return;
    ensureSlots(cs, c);
    const office = `<button class="hotspot office" style="left:${OFFICE_SPOT.x}%;top:${OFFICE_SPOT.y}%" data-key="office"><img class="hs-ico" src="assets/buildings/palace.webp" alt="관아"><span>관아</span></button>`;
    const yard = cs.slots.map((sl, i) => {
      const sp = sl.key === 'wall' ? WALL_SPOT : (YARD_SPOTS[i] || { x: 50, y: 60 });
      if (!sl.key) {
        return `<button class="yard-b empty" data-slot="${i}" style="left:${sp.x}%;top:${sp.y}%" aria-label="공터 건설">
          <span class="yb-plus">＋</span><span class="yb-tag">공터</span></button>`;
      }
      const def = SLOT_DEFS[sl.key] || { name: sl.key, icon: 'market' };
      const g = slotOwner(cityId, sl);
      const ep = slotExpRatio(sl);
      return `<button class="yard-b built" data-slot="${i}" style="left:${sp.x}%;top:${sp.y}%" aria-label="${def.name} Lv.${sl.lv}">
        <span class="yb-ico"><img src="${bldSrc(def.icon, sl.lv)}" onerror="${bldFallback(def.icon)}" alt=""></span>
        <span class="yb-lv">Lv.${sl.lv}</span>
        <span class="yb-exp"><i style="width:${Math.round(ep * 100)}%"></i></span>
        ${g ? `<span class="yb-face"><img src="${SK.ptSrc(g.portrait)}" alt=""></span>` : ''}
        <span class="yb-tag">${def.name}</span></button>`;
    }).join('');
    hs.innerHTML = office + yard;
    hs.querySelectorAll('[data-slot]').forEach((b) => {
      b.onclick = () => openSlot(cityId, Number(b.dataset.slot));
    });
    const off = hs.querySelector('.hotspot');
    if (off) off.onclick = () => doCommand('office');
  }
  SK.renderYard = renderYard;

  /* 명령 키 → 마당 좌표 (컷인·불꽃이 건물 위에서 터진다) */
  function spotFor(key) {
    if (!key || key === 'office') return OFFICE_SPOT;
    const map = { farm: 'farm', trade: 'market', repair: 'wall', talent: 'tavern', recruit: 'barracks', train: 'training' };
    const s = SK.state;
    const cs = s && s.cities[s.lastCity];
    const idx = cs && cs.slots ? cs.slots.findIndex((sl) => sl.key === map[key]) : -1;
    return YARD_SPOTS[idx >= 0 ? idx : 0] || OFFICE_SPOT;
  }

  function openSlot(cityId, idx) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    ensureSlots(cs, c);
    const sl = cs.slots[idx];
    if (!sl) return;
    if (!sl.key) {
      const rows = Object.keys(SLOT_DEFS).map((k) => {
        const def = SLOT_DEFS[k];
        const same = cs.slots.filter((x) => x.key === k).length;
        return `<button class="build-row" data-k="${k}" ${s.gold < 300 ? 'disabled' : ''}>
          <img src="${bldSrc(def.icon, 1)}" onerror="${bldFallback(def.icon)}" alt="">
          <div><b>${def.name}${same ? ` <em>이미 ${same}곳</em>` : ''}</b><span>${def.desc}</span></div>
          <em class="br-cost">금 ${fmt(300)}</em></button>`;
      }).join('');
      const m = SK.modal({
        kicker: `${c.name} · 공터`, title: '무엇을 지을까',
        body: `<p class="talent-note">건물은 담당자가 없어도 기본 효과의 50%를 냅니다. 담당 장수를 앉히면 정치·통솔·매력에 따라 100~150%까지 오르고, 그 장수는 그달 건물 일을 맡습니다.</p>
          <div class="build-list">${rows}</div>`, wide: true, actions: [{ label: '닫기' }],
      });
      m.el.querySelectorAll('.build-row').forEach((b) => {
        b.onclick = () => {
          if (s.gold < 300) { SK.sfx.play('deny'); SK.toast('금이 부족합니다. (필요 금 300)'); return; }
          s.gold -= 300;
          sl.key = b.dataset.k; sl.lv = 1; sl.uid = null; sl.exp = 0;
          SK.save(); SK.refreshHud(); m.close();
          SK.openCity(cityId);
          SK.sfx.play('hammer');
          SK.toast(`${josa(SLOT_DEFS[sl.key].name, 'eul')} 지었습니다 — 금 -300`);
        };
      });
      return;
    }
    const def = SLOT_DEFS[sl.key];
    const g = slotOwner(cityId, sl);
    const cost = buildCost(sl);
    const needEp = slotExpNeed(sl.lv);
    const ep = Math.round(sl.exp || 0);
    const epOk = ep >= needEp;
    const free = dutyCandidates(cityId, cs, def);
    const opts = free.map((h, i) => `<button class="target-card" data-uid="${h.uid}">
        <img class="tc-portrait" src="${SK.ptSrc(h.portrait)}" alt="">
        <div class="tc-main"><b>${h.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b><span>${SK.CLASSES[h.cls].name} · ${STAT_LABEL[def.stat] || '정치'} ${h[def.stat] || 60}</span></div>
        <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({
      kicker: `${c.name} · ${def.name}`, title: `Lv.${sl.lv} ${def.name}`,
      body: `<div class="slot-detail">
          <img class="sd-ico" src="${bldSrc(def.icon, sl.lv)}" onerror="${bldFallback(def.icon)}" alt="">
          <div><b>${def.desc}</b>
            <span>효과 ${Math.round(slotMul(cs, sl, g) * 100)}% ${g ? `· 담당 ${g.name}` : '· 담당 없음'}</span>
            <em>${sl.lv < 5 ? `증축 금 ${fmt(cost)}` : '최고 등급'}</em></div>
        </div>
        ${sl.lv < 5 ? `<div class="slot-expbox">
          <div class="se-head"><b>시설 경험</b><span>${ep} / ${needEp}</span></div>
          <div class="se-bar"><i style="width:${Math.round(Math.min(1, ep / needEp) * 100)}%"></i></div>
          <p>${epOk ? '경험이 가득 찼습니다 — 증축할 수 있습니다.' : `담당 장수를 앉혀 ${Math.max(1, Math.ceil((needEp - ep) / (30 + sl.lv * 8)))}개월 더 굴려야 증축할 수 있습니다.`}</p>
        </div>` : ''}
        <div class="menu-list">
          ${sl.lv < 5 ? `<button data-a="up" ${(s.gold < cost || !epOk) ? 'disabled' : ''}>증축 — 금 ${fmt(cost)} (Lv.${sl.lv + 1})${epOk ? '' : ' · 경험 부족'}</button>` : ''}
          ${g ? '<button data-a="free">담당 해제 — 이번 달 자유 행동</button>' : ''}
          <button data-a="assign">담당 장수 앉히기</button>
        </div>
        ${!g && free.length ? `<p class="talent-note">앉힐 수 있는 대기 장수 ${free.length}명</p><div class="target-list">${opts}</div>` : ''}`,
      wide: true, actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'up') {
          if (s.gold < cost) { SK.toast('금이 부족합니다.'); return; }
          if ((sl.exp || 0) < slotExpNeed(sl.lv)) { SK.toast(`시설 경험이 부족합니다. (${Math.round(sl.exp || 0)}/${slotExpNeed(sl.lv)})`); return; }
          s.gold -= cost;
          sl.exp = Math.max(0, (sl.exp || 0) - slotExpNeed(sl.lv));
          sl.lv += 1;
          SK.save(); SK.refreshHud(); m.close(); SK.openCity(cityId);
          SK.toast(`${def.name} Lv.${sl.lv} 증축 완료`);
          SK.sfx.play('hammer');
        } else if (a === 'free') {
          sl.uid = null;
          SK.save(); m.close(); SK.openCity(cityId);
          SK.toast('담당을 해제했습니다. 이번 달 자유 행동이 돌아옵니다.');
        } else if (a === 'assign') {
          m.close();
          openDutyPick(cityId, idx);
        }
      };
    });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        sl.uid = b.dataset.uid;
        const h = cityGens(cityId).find((x) => x.uid === sl.uid);
        if (h) h.actedThisMonth = true;
        SK.save(); m.close(); SK.openCity(cityId);
        SK.toast(`${josa(h ? h.name : '', 'i')} ${def.name} 담당이 되었습니다.`);
      };
    });
  }
  SK.openSlot = openSlot;

  /* v5.3 — 9종 건물 모두 해당 능력치가 높은 순으로 앉힐 후보를 정렬하고 1등에게 [추천] */
  const STAT_LABEL = { pol: '정치', cha: '매력', tong: '통솔', wu: '무력', ji: '지력' };
  function dutyCandidates(cityId, cs, def) {
    const stat = (def && def.stat) || 'pol';
    const free = cityGens(cityId).filter((h) => !cs.slots.some((x) => x.uid === h.uid));
    return free.slice().sort((a, b) => {
      const d = (b[stat] || 0) - (a[stat] || 0);
      return d || String(a.name).localeCompare(String(b.name));
    });
  }

  function openDutyPick(cityId, idx) {
    const cs = SK.state.cities[cityId];
    const sl = cs.slots[idx];
    const def = SLOT_DEFS[sl.key];
    const free = dutyCandidates(cityId, cs, def);
    if (!free.length) { SK.toast('앉힐 수 있는 장수가 없습니다. (모두 다른 건물을 맡고 있습니다)'); return; }
    const rows = free.map((h, i) => `<button class="target-card" data-uid="${h.uid}">
      <img class="tc-portrait" src="${SK.ptSrc(h.portrait)}" alt="">
      <div class="tc-main"><b>${h.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b><span>${SK.CLASSES[h.cls].name} · ${STAT_LABEL[def.stat] || '정치'} ${h[def.stat] || 60}</span></div>
      <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({ kicker: `${CITY[cityId].name} · ${def.name}`, title: '누구에게 맡길까',
      body: `<div class="target-list">${rows}</div>`, wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        sl.uid = b.dataset.uid;
        const h = cityGens(cityId).find((x) => x.uid === sl.uid);
        if (h) h.actedThisMonth = true;
        SK.save(); m.close(); SK.openCity(cityId);
        SK.toast(`${josa(h ? h.name : '', 'i')} ${def.name} 담당이 되었습니다.`);
      };
    });
  }

  /* 달이 바뀔 때 건물이 내놓는 결산 — 담당 장수는 경험치를 얻는다 */
  function runSlots(st) {
    const log = [];
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      ensureSlots(cs, c);
      let gold = 0, food = 0, troops = 0, train = 0, loyalty = 0, def = 0, rp = 0, order = 0;
      if (cs.order == null) cs.order = 55;
      cs.slots.forEach((sl) => {
        if (!sl.key) return;
        const g = slotOwner(c.id, sl);
        const mul = slotMul(cs, sl, g);
        const lv = sl.lv;
        /* v5.2 — 시설 경험치. 담당 장수가 있으면 빨리, 없으면 천천히 쌓인다 */
        if (lv < 5) {
          sl.exp = (sl.exp || 0) + Math.round((g ? 26 + lv * 8 : 6) * (g ? mul : 1));
        }
        if (sl.key === 'market') gold += Math.round((90 + lv * 70) * mul);
        else if (sl.key === 'farm') food += Math.round((130 + lv * 90) * mul);
        else if (sl.key === 'barracks') troops += Math.round((70 + lv * 50) * mul);
        else if (sl.key === 'training') { train += 0.5 * lv * mul; if (g) SK.gainExp(g, Math.round(40 * lv * mul)); }
        else if (sl.key === 'patrol') { order += 1.1 * lv * mul; loyalty += 0.25 * lv * mul; }
        else if (sl.key === 'wall') def += 0.6 * lv * mul;
        else if (sl.key === 'lab') rp += 1;
        else if (sl.key === 'workshop') gold += Math.round((40 + lv * 40) * mul);
        else if (sl.key === 'tavern') { if (g) SK.gainExp(g, 20); }
        if (g && sl.key !== 'training' && sl.key !== 'tavern') SK.gainExp(g, Math.round(16 * lv * mul));
      });
      if (gold) { st.gold += gold; cs.gold = (cs.gold || 0) + gold; }
      if (food) { st.food += food; }
      if (troops) cs.troops = clamp(cs.troops + troops, 0, cityCap(cs));
      if (train) cs.train = clamp((cs.train == null ? 50 : cs.train) + train, 0, 100);
      if (loyalty) cs.loyalty = clamp(cs.loyalty + loyalty, 0, 100);
      if (order) cs.order = clamp(cs.order + order, 0, 100);
      else cs.order = clamp(cs.order - 0.5, 0, 100);          // 순찰소가 없으면 치안이 조금씩 풀린다
      if (def) cs.def = clamp(cs.def + def, 0, 100);
      if (rp) st.rp = (st.rp || 0) + rp;
      if (gold || food || troops) log.push({ city: c.name, gold, food, troops });
    });
    return log;
  }
  SK.runSlots = runSlots;

  /* 담당 장수는 그달 건물 일을 한 것으로 친다 (자유 행동 없음) */
  function applyDuty(st) {
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (!cs || cs.owner !== PF() || !cs.slots) return;
      cs.slots.forEach((sl) => {
        if (!sl.uid) return;
        const h = st.heroes.find((x) => x.uid === sl.uid);
        if (h) h.actedThisMonth = true;
      });
    });
  }
  SK.applyDuty = applyDuty;

  /* ───────────── 탐색 — 금 0 · 여러 사건 (v5.0.1) ─────────────
     탐색은 금이 들지 않고 장수의 그달 행동만 쓴다. 보물 확률을 낮춘 대신
     금·군량·의용병·은거 인재·산적 퇴치·맹수 사냥·일기토 사건을 고루 섞는다. */
  function exploreCost() { return 0; }
  function explore(cityId, actor) {
    const s = SK.state;
    const c = CITY[cityId];
    const cs = s.cities[cityId];
    const lucky = (actor ? (actor.cha || 60) : 60) + (actor ? (actor.ji || 60) : 60);
    const bonus = Math.min(0.22, Math.max(0, (lucky - 120) * 0.0025));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const roll = Math.random();
    const w = [
      { k: 'treasure', p: 0.14 + bonus * 0.6 },
      { k: 'talent', p: 0.16 + bonus },
      { k: 'goods', p: 0.23 },
      { k: 'volunteer', p: 0.16 },
      { k: 'bandit', p: 0.12 },
      { k: 'beast', p: 0.09 },
      { k: 'duel', p: 0.10 },
    ];
    let acc = 0, kind = 'goods';
    for (let i = 0; i < w.length; i++) { acc += w[i].p; if (roll <= acc) { kind = w[i].k; break; } }
    if (kind === 'treasure') {
      const owned = new Set(s.treasures || []);
      s.heroes.forEach((h) => Object.values(h.equip || {}).forEach((id) => owned.add(id)));
      const pool = SK.TREASURES.filter((t) => !owned.has(t.id));
      if (pool.length) {
        const weights = pool.map((t) => (t.grade === '전설' ? 1 : t.grade === '영웅' ? 2.4 : 4));
        let total = weights.reduce((a, b) => a + b, 0), r = Math.random() * total, hit = pool[0];
        for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { hit = pool[i]; break; } }
        s.treasures.push(hit.id);
        return { ok: true, kind: 'treasure', title: `보물을 찾았다 — ${hit.name}`, text: `${c.name} 근방 산야에서 ${hit.grade} 등급의 ${josa(hit.name, 'eul')} 캐냈습니다. ${hit.effect}`, gain: '보관함에 넣었습니다' };
      }
    }
    if (kind === 'talent') {
      const grp = tavernGroupOf(s, cityId);
      const used = new Set();
      s.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
      SK.CITY_LIST.forEach((x) => (s.cities[x.id].talents || []).forEach((id) => used.add(id)));
      const pool = SK.GENERALS.filter((g) => !used.has(g.id) && genPoolGroup(g) === grp && SK.debutOk(g, eraYearOf(s)));
      if (pool.length) {
        const g2 = pool[Math.floor(Math.random() * pool.length)];
        cs.talents = cs.talents || [];
        cs.talents.unshift(g2.id);
        return { ok: true, kind: 'talent', title: `은거하던 인재 — ${g2.name}`, text: `${c.name} 인근에서 ${g2.name}(${g2.tier}급 ${SK.CLASSES[SK.genClass(g2)].name})${hasBatchim(g2.name) ? '을' : '를'} 만났습니다. 주점에 소문을 내 두었습니다.`, gain: '주점에 등장' };
      }
    }
    if (kind === 'volunteer') {
      const cap = cityCap(cs);
      const add = Math.min(cap - cs.troops, 450 + Math.floor(Math.random() * 550) + Math.round(bonus * 1200));
      if (add > 0) {
        cs.troops += add;
        cs.loyalty = clamp(cs.loyalty + 2, 0, 100);
        return { ok: true, kind: 'troops', title: '의용병이 모였다', text: `${c.name} 향민들이 “성을 지키겠다”며 창을 들었습니다. 젊은이들이 스스로 대열에 섰습니다.`, gain: `수비병 +${fmt(add)} · 민심 +2` };
      }
    }
    if (kind === 'bandit') {
      const base = 300 + Math.floor(Math.random() * 400) + Math.round((actor ? (actor.wu || 60) : 60) * 4);
      s.gold += base; s.fame += 2;
      cs.loyalty = clamp(cs.loyalty + 2, 0, 100);
      return { ok: true, kind: 'battle', title: '산적 퇴치', text: `${c.name} 외곽 산채의 산적 떼가 길을 막고 있었습니다. ${actor ? josa(actor.name, 'i') : '탐색대가'} 앞장서 소굴을 쓸어 버렸습니다.`, gain: `금 +${fmt(base)} · 명성 +2 · 민심 +2` };
    }
    if (kind === 'beast') {
      const food = 260 + Math.floor(Math.random() * 340);
      const gold = 80 + Math.floor(Math.random() * 160);
      s.food += food; s.gold += gold;
      return { ok: true, kind: 'hunt', title: '맹수 사냥', text: `산중에서 호랑이가 나타났습니다. ${actor ? josa(actor.name, 'i') : '사냥꾼이'} 활을 쏘아 잡았고, 고기와 가죽이 성으로 들어왔습니다.`, gain: `군량 +${fmt(food)} · 금 +${fmt(gold)}` };
    }
    if (kind === 'duel') {
      const win = Math.random() < 0.45 + Math.min(0.25, ((actor ? (actor.wu || 60) : 60) - 60) * 0.006);
      if (win) {
        const fame = 3 + Math.floor(Math.random() * 3);
        const gold = 150 + Math.floor(Math.random() * 250);
        s.fame += fame; s.gold += gold;
        return { ok: true, kind: 'duel', title: '일기토 승리', text: `${c.name} 길목에서 떠돌이 장수가 대결을 청했습니다. ${actor ? josa(actor.name, 'i') : '장수가'} 세 합 만에 승부를 냈습니다.`, gain: `명성 +${fame} · 금 +${fmt(gold)}` };
      }
      s.fame += 1;
      return { ok: true, kind: 'duel', title: '일기토 — 무승부', text: `떠돌이 장수와 겨루었으나 끝내 승부가 나지 않았습니다. 그래도 백성들이 그 용맹을 이야기합니다.`, gain: '명성 +1' };
    }
    const gold = 160 + Math.floor(Math.random() * 240) + Math.round(bonus * 400);
    const food = 260 + Math.floor(Math.random() * 420);
    s.gold += gold; s.food += food;
    return { ok: true, kind: 'goods', title: '탐색 성과 — 은닉한 재물', text: `${c.name} 산기슭의 옛 창고에서 금 ${fmt(gold)}과(와) 군량 ${fmt(food)}을(를) 찾았습니다.`, gain: `금 +${fmt(gold)} · 군량 +${fmt(food)}` };
  }
  SK.explore = explore;

  function openExplore(cityId) {
    const actor = pickActor(cityId);
    if (!actor) return;
    const res = explore(cityId, actor);
    if (!res.ok) { SK.sfx.play('deny'); SK.toast(res.msg); return; }
    actor.actedThisMonth = true;
    SK.gainExp(actor, 22);
    cityActorUid = null;
    SK.save(); SK.refreshHud();
    SK.openCity(cityId);
    SK.sfx.play('coin');
    SK.modal({
      kicker: `${CITY[cityId].name} 탐색`, title: res.title,
      body: `<div class="explore-card ${res.kind}"><p>${res.text}</p><b>${res.gain}</b></div>`,
      actions: [{ label: '확인', primary: true }],
    });
  }
  SK.openExplore = openExplore;

  /* ───────────── 기술 연구 트리 ───────────── */
  function openTech() {
    const s = SK.state;
    s.techs = s.techs || [];
    const list = SK.TECHS || [];
    if (!list.length) { SK.toast('기술 데이터를 불러오지 못했습니다.'); return; }
    const cats = [];
    list.forEach((t) => { if (cats.indexOf(t.category) < 0) cats.push(t.category); });
    const can = (t) => !s.techs.includes(t.id) && (!t.prereq || s.techs.includes(t.prereq));
    const rows = cats.map((cat) => {
      const items = list.filter((t) => t.category === cat).sort((a, b) => a.tier - b.tier);
      return `<div class="tech-branch"><p class="tb-name">${cat}</p>
        ${items.map((t) => {
          const done = s.techs.includes(t.id);
          const ok = can(t);
          return `<button class="tech-node ${done ? 'done' : ok ? 'ready' : 'locked'}" data-t="${t.id}" ${done || !ok || s.gold < t.costGold ? 'disabled' : ''}>
            <span class="tn-lv">${['I','II','III','IV'][Math.min(3, t.tier - 1)]}</span>
            <div><b>${t.name}</b><span>${t.summary}</span></div>
            <em>${done ? '완료' : `금 ${fmt(t.costGold)}`}</em></button>`;
        }).join('')}
      </div>`;
    }).join('');
    const m = SK.modal({
      kicker: '기술 연구', title: `연구 ${s.techs.length} / ${list.length}`,
      body: `<p class="talent-note">기술은 여섯 계열 24종입니다. 앞 단계를 먼저 연구해야 다음 단계가 열리고, 연구하면 전군 공격·방어, 세수, 군량, 징병, 성벽 효과가 실제로 올라갑니다.</p>
        <div class="tech-wrap">${rows}</div>`,
      wide: true, actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('.tech-node').forEach((b) => {
      b.onclick = () => {
        const t = list.find((x) => x.id === b.dataset.t);
        if (!t) return;
        if (s.gold < t.costGold) { SK.toast('금이 부족합니다.'); return; }
        if (t.prereq && !s.techs.includes(t.prereq)) { SK.toast('앞 단계 기술이 필요합니다.'); return; }
        s.gold -= t.costGold;
        s.techs.push(t.id);
        SK.save(); SK.refreshHud(); m.close();
        SK.sfx.play('levelup');
        SK.toast(`${t.name} 연구 완료 — ${t.summary}`);
        if (document.querySelector('#screen-city.active')) SK.openCity(s.lastCity);
      };
    });
  }
  SK.openTech = openTech;
  function techPct(key) {
    const s = SK.state;
    if (!s || !s.techs || !s.techs.length) return 0;
    let v = 0;
    (SK.TECHS || []).forEach((t) => { if (s.techs.includes(t.id)) v += (t.bonus && t.bonus[key]) || 0; });
    return v;
  }
  SK.techPct = techPct;

  /* ───────────── 5묶음 메뉴 (시설·인사/탐색·외교/계략·기술·군사) ───────────── */
  const GROUPS = {
    facility: {
      name: '시설 관리', sub: '건설·증축·민심',
      items: [
        { key: 'build', label: '내성 시설 보기 · 건설/증축', desc: '공터에 시장·농원·병영·연병장·순찰소 등을 짓고 Lv.1~5로 키웁니다' },
        { key: 'comfort', label: '백성 위로', desc: '금 100으로 민심을 올립니다' },
        { key: 'office', label: '관아 — 태수·군사·자동 내정', desc: '성을 맡길 사람과 자동 내정을 정합니다' },
      ],
    },
    talent: {
      name: '인사·탐색', sub: '등용·탐색·명부',
      items: [
        { key: 'talent', label: '주점 — 인재 등용', desc: '이 성과 길로 이어진 성의 재야 인재를 만납니다' },
        { key: 'explore', label: '탐색 — 보물·은거 인재', desc: '금 0 · 장수의 이번 달 행동으로 산야를 뒤져 보물·인재·의용병·산적 퇴치를 찾습니다' },
        { key: 'roster', label: '장수 명부 · 보물 · 배치', desc: '전체 장수를 표로 보고 장비를 관리합니다' },
      ],
    },
    diplomacy: {
      name: '외교·계략', sub: '정찰·이간·유언비어',
      items: [
        { key: 'scout', label: '정찰 — 이웃 적성 첩보', desc: `금 ${scoutCost()}으로 3~4개월 동안 적성 내부를 봅니다` },
        { key: 'spy', label: '이간계 — 적 장수 흔들기', desc: '금 100 · 적성 장수 충성을 꺾어 수비를 흔듭니다' },
        { key: 'rumor', label: '유언비어 — 적성 민심 흔들기', desc: '금 80 · 적성 민심과 병력을 깎습니다' },
        { key: 'peace', label: '화친 — 휴전 청하기', desc: '금 200 · 6개월간 그 세력의 공격을 늦춥니다' },
      ],
    },
    tech: {
      name: '기술 연구', sub: `24종 트리 · 연구 ${(SK.state && (SK.state.techs || []).length) || 0}/24`,
      items: [{ key: 'tech', label: '기술 트리 열기', desc: '군사·치안·경제·개발·정무·계략 6계열 24종' }],
    },
    military: {
      name: '군사 출진·수송', sub: '출진·수송',
      items: [
        { key: 'sortie', label: '출진 — 이웃 적성 공략', desc: '부대를 편성해 전장으로 나갑니다' },
        { key: 'transport', label: '수송 — 아군 성에 병력·군량', desc: '후방 성에서 전방 성으로 보급합니다' },
        { key: 'train', label: '훈련 — 주둔 장수 경험치', desc: '금 80으로 훈련도와 장수 경험치를 올립니다' },
        { key: 'recruit', label: '징병 — 수비병 모으기', desc: '금 150 · 군량 120으로 병력을 채웁니다' },
      ],
    },
  };

  function openGroupMenu(grp) {
    const g = GROUPS[grp];
    if (!g) return;
    const cityId = SK.state.lastCity;
    const rows = g.items.map((it) => `<button class="grp-row" data-k="${it.key}">
      <div><b>${it.label}</b><span>${it.desc}</span></div><span class="grp-go">▸</span></button>`).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} · ${g.name}`, title: g.sub,
      body: `<div class="grp-list">${rows}</div>`, actions: [{ label: '닫기' }], wide: true,
    });
    m.el.querySelectorAll('.grp-row').forEach((b) => {
      b.onclick = () => { const k = b.dataset.k; m.close(); setTimeout(() => groupAction(k, cityId), 30); };
    });
  }
  SK.openGroupMenu = openGroupMenu;

  function groupAction(k, cityId) {
    if (k === 'build') {
      const box = $('#city-slots');
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      SK.toast('공터를 눌러 건설하고, 지은 건물을 눌러 증축·담당을 정하세요.');
      return;
    }
    if (k === 'comfort') {
      const gov = officerOf(cityId, 'gov');
      const res = comfortCity(cityId, gov);
      if (!res.ok) { SK.sfx.play('deny'); SK.toast(res.msg); return; }
      SK.save(); SK.refreshHud(); SK.openCity(cityId); SK.toast(res.msg);
      return;
    }
    if (k === 'office') { openOffice(cityId); return; }
    if (k === 'roster') { SK.openRoster(); return; }
    if (k === 'explore') { openExplore(cityId); return; }
    if (k === 'tech') { openTech(); return; }
    if (k === 'scout') { openScoutPick(cityId); return; }
    if (k === 'spy') { openSpy(cityId, 'spy'); return; }
    if (k === 'rumor') { openSpy(cityId, 'rumor'); return; }
    if (k === 'peace') { openPeace(cityId); return; }
    if (k === 'transport') { openTransport(cityId); return; }
    doCommand(k);
  }

  function openScoutPick(cityId) {
    const s = SK.state;
    const targets = SK.allNeighbors(cityId).filter((n) => s.cities[n] && s.cities[n].owner !== PF());
    if (!targets.length) { SK.toast('정찰할 이웃 적성이 없습니다.'); return; }
    const rows = targets.map((id) => {
      const st = s.cities[id];
      const f = SK.factionInfo(st.owner);
      const sc = isScouted(st);
      return `<button class="target-card" data-c="${id}">
        <span class="tc-flag" style="background:${f.color}">${SK.markOf(f)}</span>
        <div class="tc-main"><b>${CITY[id].name}</b><span>${f.name} · ${typeName(CITY[id].type)} · ${sc ? `정찰 중 (${st.scoutedUntil - s.turn}개월 남음)` : '미정찰'}</span></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({ kicker: `${CITY[cityId].name} 첩보`, title: '어느 성을 살필까',
      body: `<p class="talent-note">정찰하면 3~4개월 동안 그 성의 수비병·성벽·민심·장수를 볼 수 있습니다. (금 ${scoutCost()})</p><div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => { const ok = SK.scoutCity(b.dataset.c, cityId); if (ok) m.close(); };
    });
  }

  /* 계략 — 이간계·유언비어 */
  function openSpy(cityId, kind) {
    const s = SK.state;
    const cost = kind === 'spy' ? 100 : 80;
    const targets = SK.allNeighbors(cityId).filter((n) => s.cities[n] && s.cities[n].owner !== PF() && s.cities[n].owner !== 'neutral');
    if (!targets.length) { SK.toast('계략을 펼칠 이웃 적성이 없습니다.'); return; }
    const rows = targets.map((id) => {
      const st = s.cities[id];
      const f = SK.factionInfo(st.owner);
      return `<button class="target-card" data-c="${id}">
        <span class="tc-flag" style="background:${f.color}">${SK.markOf(f)}</span>
        <div class="tc-main"><b>${CITY[id].name}</b><span>${f.name} · 수비병 ${isScouted(st) ? fmt(st.troops) : '?'}</span></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 계략`, title: kind === 'spy' ? '이간계를 펼 성' : '유언비어를 풀 성',
      body: `<p class="talent-note">${kind === 'spy' ? '적 장수 사이를 갈라 수비병과 성벽을 약화시킵니다.' : '거짓 소문을 풀어 적성 민심을 흔듭니다.'} 실패하면 금만 나갑니다. (금 ${cost})</p>
        <div class="target-list">${rows}</div>`, wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        if (s.gold < cost) { SK.sfx.play('deny'); SK.toast(`금이 부족합니다. (필요 금 ${cost})`); return; }
        s.gold -= cost;
        const st = s.cities[b.dataset.c];
        const actor = pickActor(cityId);
        const base = kind === 'spy' ? 0.55 : 0.65;
        const bonus = actor ? Math.min(0.25, Math.max(0, ((actor.ji || 60) - 60) * 0.005)) : 0;
        const ok = Math.random() < base + bonus;
        if (actor) { actor.actedThisMonth = true; SK.gainExp(actor, 14); }
        if (ok) {
          if (kind === 'spy') { st.troops = Math.max(200, Math.round(st.troops * 0.88)); st.def = Math.max(20, st.def - 4); }
          else { st.loyalty = Math.max(10, st.loyalty - 8); st.troops = Math.max(200, Math.round(st.troops * 0.94)); }
        }
        SK.save(); SK.refreshHud(); m.close(); SK.openCity(cityId);
        SK.sfx.play(ok ? 'ui' : 'deny');
        SK.modal({
          kicker: `${CITY[cityId].name} 계략`, title: ok ? '계략이 통했습니다' : '계략이 들통났습니다',
          body: `<p class="modal-p">${ok ? (kind === 'spy' ? `${CITY[b.dataset.c].name}의 장수들이 서로를 의심해 수비병과 성벽이 흔들렸습니다.` : `${CITY[b.dataset.c].name}에 거짓 소문이 퍼져 민심이 흔들렸습니다.`) : '상대가 첩자를 붙잡았습니다. 이번 일은 수포로 돌아갔습니다.'}</p>`,
          actions: [{ label: '확인', primary: true }],
        });
      };
    });
  }

  function openPeace(cityId) {
    const s = SK.state;
    const fids = {};
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (st.owner && st.owner !== PF() && st.owner !== 'neutral') fids[st.owner] = true;
    });
    const list = Object.keys(fids);
    if (!list.length) { SK.toast('화친을 청할 세력이 없습니다.'); return; }
    const rows = list.map((fid) => {
      const f = SK.factionInfo(fid);
      const left = (s.truce && s.truce[fid]) ? Math.max(0, s.truce[fid] - s.turn) : 0;
      return `<button class="target-card" data-f="${fid}">
        <span class="tc-flag" style="background:${f.color}">${SK.markOf(f)}</span>
        <div class="tc-main"><b>${f.name}</b><span>${left ? `휴전 중 (${left}개월)` : '교전 중'}</span></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({ kicker: `${CITY[cityId].name} 외교`, title: '화친할 세력',
      body: `<p class="talent-note">금 200과 사자를 보내 6개월 휴전을 청합니다. 매력이 높은 장수가 나서면 성사가 쉽습니다.</p><div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        if (s.gold < 200) { SK.toast('금이 부족합니다. (필요 금 200)'); return; }
        s.gold -= 200;
        const actor = pickActor(cityId);
        const ok = Math.random() < (actor ? 0.35 + Math.min(0.35, ((actor.cha || 60) - 60) * 0.007) : 0.35);
        if (actor) { actor.actedThisMonth = true; }
        s.truce = s.truce || {};
        if (ok) s.truce[b.dataset.f] = s.turn + 6;
        SK.save(); SK.refreshHud(); m.close(); SK.openCity(cityId);
        SK.modal({ kicker: '외교', title: ok ? '휴전이 성립했습니다' : '사자가 빈손으로 돌아왔습니다',
          body: `<p class="modal-p">${ok ? '6개월간 상대가 먼저 치지 않습니다.' : '상대 군주가 사자를 물리쳤습니다. 금만 나갔습니다.'}</p>`, actions: [{ label: '확인', primary: true }] });
      };
    });
  }

  /* 수송 — 아군 성 사이에 병력·군량을 옮긴다 */
  function openTransport(cityId) {
    const s = SK.state;
    const dests = SK.CITY_LIST.filter((c) => c.id !== cityId && s.cities[c.id].owner === PF());
    if (!dests.length) { SK.toast('수송할 다른 아군 성이 없습니다.'); return; }
    const rows = dests.map((c) => {
      const st = s.cities[c.id];
      return `<button class="target-card" data-c="${c.id}">
        <span class="tc-flag" style="background:${SK.factionColor(PF())}">${SK.markOf(SK.factionInfo(PF()))}</span>
        <div class="tc-main"><b>${c.name}</b><span>${typeName(c.type)} · 병력 ${fmt(st.troops)} / ${fmt(cityCap(st))}</span></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({ kicker: `${CITY[cityId].name} 수송`, title: '어디로 보낼까',
      body: `<p class="talent-note">보유 병력 ${fmt(s.cities[cityId].troops)} · 금 ${fmt(s.gold)} · 군량 ${fmt(s.food)}. 수송에는 장수 한 명의 이번 달 행동이 듭니다.</p><div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => { m.close(); openTransportAmount(cityId, b.dataset.c); };
    });
  }
  function openTransportAmount(from, to) {
    const s = SK.state;
    const src = s.cities[from];
    const maxT = Math.max(0, Math.floor(src.troops * 0.6));
    const maxG = Math.floor(s.gold * 0.5);
    const maxF = Math.floor(s.food * 0.5);
    let t = Math.min(maxT, 3000), g = Math.min(maxG, 600), f = Math.min(maxF, 1200);
    const m = SK.modal({
      kicker: `${CITY[from].name} → ${CITY[to].name}`, title: '수송품을 정하세요',
      body: `<div class="transport">
        <label>병력 <input id="tp-t" type="range" min="0" max="${maxT}" step="1" value="${t}"><b id="tp-tv">${fmt(t)}</b>
          <span class="tp-step"><button id="tp-tminus" aria-label="1 줄이기">−1</button><button id="tp-tplus" aria-label="1 늘리기">＋1</button></span></label>
        <label>금 <input id="tp-g" type="range" min="0" max="${maxG}" step="50" value="${g}"><b id="tp-gv">${fmt(g)}</b></label>
        <label>군량 <input id="tp-f" type="range" min="0" max="${maxF}" step="100" value="${f}"><b id="tp-fv">${fmt(f)}</b></label>
        <p class="talent-note">도착할 성의 병력 상한은 ${fmt(cityCap(s.cities[to]))}입니다.</p>
      </div>`,
      wide: true,
      actions: [{ label: '취소' }, { label: '수송 보내기', primary: true, onClick: () => {
        const actor = pickActor(from);
        if (!actor) return;
        const dst = s.cities[to];
        const room = Math.max(0, cityCap(dst) - dst.troops);
        const sendT = Math.min(t, room);
        src.troops -= sendT; dst.troops += sendT;
        s.gold -= g; s.food -= f;
        dst.gold = (dst.gold || 0) + g; dst.food = (dst.food || 0) + f;
        actor.actedThisMonth = true;
        SK.gainExp(actor, 12);
        cityActorUid = null;
        SK.save(); SK.refreshHud(); SK.openCity(from);
        SK.sfx.play('drum');
        SK.toast(`${CITY[to].name}으로 수송 — 병력 ${fmt(sendT)} · 금 ${fmt(g)} · 군량 ${fmt(f)}`);
      } }],
    });
    const bindRange = (id, valId, setter) => {
      const el = m.el.querySelector(id);
      const lab = m.el.querySelector(valId);
      if (el) el.oninput = () => { setter(Number(el.value)); lab.textContent = fmt(Number(el.value)); };
    };
    bindRange('#tp-t', '#tp-tv', (v) => { t = v; });
    const tEl = m.el.querySelector('#tp-t');
    const tLab = m.el.querySelector('#tp-tv');
    const stepT = (d) => {
      t = Math.max(0, Math.min(maxT, Math.round(t) + d));
      if (tEl) tEl.value = String(t);
      if (tLab) tLab.textContent = fmt(t);
    };
    const tm = m.el.querySelector('#tp-tminus'), tp = m.el.querySelector('#tp-tplus');
    if (tm) tm.onclick = () => stepT(-1);
    if (tp) tp.onclick = () => stepT(1);
    bindRange('#tp-g', '#tp-gv', (v) => { g = v; });
    bindRange('#tp-f', '#tp-fv', (v) => { f = v; });
  }

  /* ───────────── 명성과 관작 ───────────── */
  function openRank() {
    const s = SK.state;
    const rank = SK.rankFor(s.fame);
    const nx = SK.nextRank(s.fame);
    const pct = nx ? Math.min(100, Math.round((s.fame - rank.minRenown) / Math.max(1, nx.minRenown - rank.minRenown) * 100)) : 100;
    const list = (SK.RANKS || []).map((r) => {
      const on = r.title === rank.title;
      return `<div class="rank-row ${on ? 'on' : ''}"><span class="rr-lv">${r.level}</span>
        <b>${r.title}</b><span>명성 ${fmt(r.minRenown)}</span>
        <em>봉급 금 ${fmt(r.salaryGold || 0)} · 병력 +${fmt(r.maxTroopsBonus || 0)}</em></div>`;
    }).join('');
    SK.modal({
      kicker: '명성과 관작', title: `${rank.title} — 다음은 ${nx ? nx.title : '없음'}`,
      body: `<div class="rank-wrap">
        <div class="rank-progress"><i style="width:${pct}%"></i></div>
        <p class="rank-note">현재 명성 <b>${fmt(s.fame)}</b>${nx ? ` · ${nx.title}까지 <b>${fmt(Math.max(0, nx.minRenown - s.fame))}</b> 남았습니다` : ' · 최고 관작입니다'}</p>
        <p class="talent-note">명성은 달이 바뀔 때, 성을 함락할 때, 큰 인물을 등용할 때 오릅니다. 관작이 오르면 매달 봉급과 거느릴 수 있는 병력이 늘어납니다.</p>
        <div class="rank-list">${list}</div>
      </div>`,
      wide: true, actions: [{ label: '닫기', primary: true }],
    });
  }
  SK.openRank = openRank;

  function pickActor(cityId) {
    const gens = cityGens(cityId);
    if (!gens.length) { SK.toast('이 성에 주둔한 장수가 없습니다. [인재]로 등용하세요.'); return null; }
    const ready = gens.filter((g) => !g.actedThisMonth);
    if (!ready.length) {
      SK.sfx.play('deny');
      SK.toast('이번 달 내정 행동을 모두 마쳤습니다. [다음 달]로 넘어가세요.');
      return null;
    }
    const chosen = ready.find((g) => g.uid === cityActorUid) || ready[0];
    cityActorUid = chosen.uid;
    return chosen;
  }

  /* ── 도시 개발도 · 인구 · 등급 ── */
  const LV_TEXT = ['', '초라한 성', '자라나는 성', '번성하는 성', '큰 성', '천하의 명성'];
  function devBar(label, val, color) {
    return `<div class="dev-cell">
      <span class="dev-label">${label}</span>
      <i class="dev-bar"><em style="width:${Math.max(2, Math.min(100, val))}%;background:${color}"></em></i>
      <b class="dev-val">${Math.round(val)}</b>
    </div>`;
  }
  function renderCityDev(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const lv = cityLevel(cs);
    const dev = $('#city-dev');
    if (!dev) return;
    dev.innerHTML = `
      <div class="dev-head">
        <span class="dev-lv">Lv.${lv}<em>/5</em></span>
        <b class="dev-name">${LV_TEXT[lv]}</b>
        <span class="dev-pop">인구 <b>${fmt(cs.pop)}</b></span>
      </div>
      <div class="dev-bars">
        ${devBar('농업', cs.agri, 'linear-gradient(90deg,#5f8b34,#8cbb54)')}
        ${devBar('상업', cs.comm, 'linear-gradient(90deg,#b8862f,#e8c268)')}
        ${devBar('민심', cs.loyalty, 'linear-gradient(90deg,#a8443a,#d97a63)')}
        ${devBar('치안', cs.order == null ? 55 : cs.order, 'linear-gradient(90deg,#3f6b8a,#7fb0cf)')}
        ${devBar('성벽', cs.def, 'linear-gradient(90deg,#5b7387,#8fa8bd)')}
      </div>`;
    const info = $('#city-info');
    if (info) {
      const cap = cityCap(cs);
      const pct = Math.round(cs.troops / cap * 100);
      const govG = cityGens(cityId).find((g) => g.uid === cs.governor) || null;
      const govName = govG ? govG.name : '없음';
      const lordNow = SK.factionInfo(PF()).lord;
      const govIsLord = !!(govG && lordNow && govG.name === lordNow);
      const advName = (cityGens(cityId).find((g) => g.uid === cs.advisor) || {}).name || '없음';
      info.innerHTML = `<span class="ci-item">인구 <b>${fmt(cs.pop)}</b></span>
        <span class="ci-item">최대 병력 <b>${fmt(cap)}</b> <em>(인구 17%)</em></span>
        <span class="ci-item">주둔병 <b class="${pct >= 100 ? 'full' : ''}">${fmt(cs.troops)}</b> <em>${pct}%</em></span>
        <span class="ci-item">훈련도 <b>${cs.train == null ? 50 : cs.train}</b></span>
        <span class="ci-item">태수 <b>${govName}${govIsLord ? ' <em>(군주)</em>' : ''}</b></span>
        <span class="ci-item">군사 <b>${advName}</b></span>
        <span class="ci-item">주둔 장수 <b>${s.heroes.filter((h) => h.city === cityId).length}</b></span>`;
    }
    const lvEl = $('#city-level');
    if (lvEl) { lvEl.textContent = `Lv.${lv}`; lvEl.dataset.lv = lv; }
    void c;
  }
  SK.renderCityDev = renderCityDev;
  SK.cityLevelOf = function (id) { return cityLevel(SK.state.cities[id]); };

  /* ── 성 등급에 따른 장면 변화 (깃발·등불·인파·온기) ── */
  const sceneMissing = {};
  const SCENE_FILE = { 1: 'city_lv1', 2: 'city_lv2', 3: 'city_lv3', 4: 'city_lv3', 5: 'city_lv5' };
  function sceneImageFor(base, lv) {
    const img = $('#city-scene-img');
    if (!img) return;
    const file = SCENE_FILE[lv] || 'city_lv1';
    const lvSrc = `assets/scenes/${file}.webp`;
    if (!sceneMissing[file]) {
      img.onerror = () => {
        sceneMissing[file] = true;
        img.onerror = null;
        img.src = base;
      };
      if (img.getAttribute('src') !== lvSrc) img.src = lvSrc;
    } else {
      img.onerror = null;
      img.src = base;
    }
  }
  function renderSceneLevel(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const lv = cityLevel(cs);
    const scene = $('#city-scene');
    if (scene) scene.className = 'city-scene lv-' + lv;
    sceneImageFor(`assets/scenes/${sceneFor(c)}.webp`, lv);
    const box = $('#scene-lv');
    if (!box) return;
    let html = '';
    const banners = 1 + lv;
    for (let i = 0; i < banners; i++) {
      html += `<i class="sb-flag" style="left:${16 + i * (66 / banners)}%; animation-delay:${(i * 0.35).toFixed(2)}s"></i>`;
    }
    if (lv >= 2) {
      const n = lv * 6;
      for (let i = 0; i < n; i++) {
        const x = 30 + ((i * 37) % 42);
        const y = 42 + ((i * 23) % 20);
        html += `<i class="sb-crowd" style="left:${x}%;top:${y}%;animation-delay:${(i * 0.13).toFixed(2)}s"></i>`;
      }
    }
    if (lv >= 3) {
      for (let i = 0; i < 6; i++) {
        html += `<i class="sb-lamp" style="left:${12 + i * 15}%;top:${54 + (i % 2) * 9}%;animation-delay:${(i * 0.5).toFixed(2)}s"></i>`;
      }
    }
    if (lv >= 5) html += '<i class="sb-glow"></i>';
    box.innerHTML = html;
  }
  SK.renderSceneLevel = renderSceneLevel;

  /* ── 장수 선택 · 행동력 표시 ── */
  function renderCityGens(cityId) {
    const gens = cityGens(cityId);
    const cur = gens.find((g) => g.uid === cityActorUid && !g.actedThisMonth);
    if (!cur) {
      const ready = gens.filter((g) => !g.actedThisMonth);
      cityActorUid = ready.length ? ready[0].uid : null;
    }
    const el = $('#city-generals');
    const allChip = `<button class="gen-chip all" data-all="1"><span class="gc-all">전</span><div><b>장수 명부</b><span>전체 보기</span></div></button>`;
    el.innerHTML = (gens.map((g) => {
      const duty = dutyOf(g, cityId);
      const done = duty === '이번 달 완료';
      const sel = !done && duty !== '건물 담당' && g.uid === cityActorUid;
      const role = roleOf(g);
      return `<button class="gen-chip ${done ? 'done' : ''} ${duty === '건물 담당' ? 'duty' : ''} ${sel ? 'sel' : ''}" data-uid="${g.uid}">
        <img src="${SK.ptSrc(g.portrait)}" alt="">
        <div><b>${g.name}<em class="gc-age">${heroAge(g) || ''}세</em></b><span>${role === SK.CLASSES[g.cls].name ? role : `${role} · ${SK.CLASSES[g.cls].name}`} · Lv.${g.lv}</span>
          <em class="gc-stats"><i>통${g.tong}</i><i>무${g.wu}</i><i>지${g.ji}</i><i>정${g.pol || 60}</i><i>매${g.cha || 60}</i></em></div>
        <em class="gc-flag">${duty}</em>
      </button>`;
    }).join('') || '<p class="empty-gens">주둔한 장수가 없습니다. 주점에서 인재를 등용하세요.</p>') + allChip;
    el.querySelectorAll('.gen-chip').forEach((b) => {
      b.onclick = () => { if (b.dataset.all) { SK.openRoster('gen'); return; } onGenChip(b.dataset.uid); };
    });
    renderApBar(gens);
  }

  function onGenChip(uid) {
    const g = SK.state.heroes.find((h) => h.uid === uid);
    if (!g) return;
    if (g.actedThisMonth) {
      SK.sfx.play('deny');
      SK.toast(`${josa(g.name, 'eun')} 이번 달 행동을 마쳤습니다.`);
      return;
    }
    if (g.uid === cityActorUid) { showHeroInfo(uid); return; }
    cityActorUid = uid;
    SK.sfx.play('ui');
    renderCityGens(SK.state.lastCity);
  }

  /* 장수 상태판 — 공용 행동력 숫자 대신 담당·대기·완료로 보여 준다 (v5) */
  function renderApBar(gens) {
    const bar = $('#city-ap');
    if (!bar) return;
    const cityId = SK.state.lastCity;
    const cs = SK.state.cities[cityId] || {};
    const slots = cs.slots || [];
    const dutyN = gens.filter((g) => slots.some((sl) => sl.uid === g.uid)).length;
    const doneN = gens.filter((g) => g.actedThisMonth && !slots.some((sl) => sl.uid === g.uid)).length;
    const readyN = gens.length - dutyN - doneN;
    const advisor = gens.find((g) => g.uid === cs.advisor);
    const actor = gens.find((g) => g.uid === cityActorUid && !g.actedThisMonth);
    bar.innerHTML = `
      <div class="ap-head">
        <span class="ap-title">장수 상태</span>
        <b class="ap-count ${readyN ? '' : 'none'}">대기 ${readyN}명</b>
        <span class="ap-actor">${actor
          ? `<img src="${SK.ptSrc(actor.portrait)}" alt="">${actor.name} 차례`
          : (readyN ? '대기 장수를 고르세요' : '다음 달에 다시')}</span>
      </div>
      <div class="ap-row2">
        <div class="ap-dots">
          <i class="duty"></i><em>담당 ${dutyN}</em>
          <i class="ready"></i><em>대기 ${readyN}</em>
          <i class="spent"></i><em>완료 ${doneN}</em>
        </div>
        <button class="ap-delegate" id="btn-delegate" title="군사에게 지금 성에 필요한 조언을 듣는다">
          <span>${advisor ? advisor.name : '군사'}</span>${advisor ? '조언' : '임명'}
        </button>
      </div>`;
    const del = bar.querySelector('#btn-delegate');
    if (del) {
      del.onclick = () => {
        if (!advisor) { openAdvisorPick(cityId); return; }
        openAdvice(cityId);
      };
    }
  }

  /* ── 컷인 · 파티클 ── */
  let cutinTimer = null;
  function showCutin(actor, line) {
    const el = $('#city-cutin');
    if (!el || !actor) return;
    el.innerHTML = `<div class="ci-portrait"><img src="${SK.ptSrc(actor.portrait)}" alt=""></div>
      <div class="ci-body"><b>${actor.name}</b><em>${SK.classTitle(actor.cls, actor.lv)} · ${SK.CLASSES[actor.cls].name}</em>
      <p>${line}</p></div>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(cutinTimer);
    cutinTimer = setTimeout(() => el.classList.remove('show'), 1850);
  }
  SK.showCutin = showCutin;

  function floatHotspot(key, text) {
    const h = spotFor(key);
    const wrap = $('#city-floats');
    if (!h || !wrap || !text) return;
    const el = document.createElement('div');
    el.className = 'hot-float';
    el.style.left = h.x + '%';
    el.style.top = h.y + '%';
    el.innerHTML = `<b>${text}</b>`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  function sparkleAt(key) {
    const h = spotFor(key);
    const wrap = $('#city-floats');
    if (!h || !wrap) return;
    const spot = YARD_SPOTS.findIndex((p) => p.x === h.x && p.y === h.y);
    const btn = spot >= 0 ? document.querySelector(`.yard-b[data-slot="${spot}"]`) : document.querySelector('.hotspot[data-key="office"]');
    if (btn) { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }
    for (let i = 0; i < 8; i++) {
      const sp = document.createElement('i');
      sp.className = 'spark';
      sp.style.left = h.x + '%';
      sp.style.top = h.y + '%';
      sp.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2));
      sp.style.setProperty('--dy', (-0.4 - Math.random()).toFixed(2));
      sp.style.animationDelay = (i * 45) + 'ms';
      wrap.appendChild(sp);
      setTimeout(() => sp.remove(), 1250);
    }
  }
  SK.sparkleAt = sparkleAt;

  /* ── 태수 · 군사 — 성의 내정 보정 (v4.2) ──
     태수는 정치·통솔로 개간·상업·보수·민심을, 군사는 지력·매력으로 징병·등용·조언을 돕는다. */
  function officerOf(cityId, which) {
    const cs = SK.state && SK.state.cities[cityId];
    if (!cs) return null;
    const uid = which === 'gov' ? cs.governor : cs.advisor;
    if (!uid) return null;
    return cityGens(cityId).find((g) => g.uid === uid) || null;
  }
  SK.officerOf = officerOf;

  function polMul(cityId, actor) {
    const gov = officerOf(cityId, 'gov');
    const pol = (actor ? actor.pol : 60) * 0.55 + (gov ? gov.pol : 60) * 0.35 + (gov ? gov.tong : 60) * 0.10;
    return 1 + Math.max(-0.15, Math.min(0.34, (pol - 60) * 0.0085));
  }
  function conMul(cityId, actor) {
    const gov = officerOf(cityId, 'gov');
    const cha = (actor ? actor.cha : 60) * 0.45 + (gov ? gov.cha : 60) * 0.30 + (gov ? gov.tong : 60) * 0.25;
    return 1 + Math.max(-0.15, Math.min(0.30, (cha - 60) * 0.0075));
  }
  function talentMul(cityId, actor) {
    const strat = officerOf(cityId, 'adv');
    const cha = (actor ? actor.cha : 60) * 0.5 + (strat ? strat.cha : 60) * 0.3 + (strat ? strat.ji : 60) * 0.2;
    return Math.max(0.82, 1 - Math.max(0, (cha - 60) * 0.005));
  }
  SK.polMul = polMul; SK.conMul = conMul; SK.talentMul = talentMul;

  /* 민심 위로 — 관아·조언·자동 내정이 같이 쓴다 */
  function comfortCity(cityId, actor) {
    const s = SK.state;
    const cs = s.cities[cityId];
    if (s.gold < 100) return { ok: false, msg: '금이 부족합니다. (필요 금 100)' };
    const gain = Math.max(3, Math.round(5 * polMul(cityId, actor)));
    s.gold -= 100;
    cs.loyalty = clamp(cs.loyalty + gain, 0, 100);
    return { ok: true, gain, msg: `백성을 위로했습니다 — 민심 +${gain}` };
  }
  SK.comfortCity = comfortCity;

  /* ── 명령 정의 ── */
  const CMDS = {
    farm: { name: '개간', run(cityId, actor) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 100) return fail('금이 부족합니다. (필요 금 100)');
      const m = polMul(cityId, actor);
      const agri = Math.max(2, Math.round(6 * m));
      const food = Math.round(300 * m);
      s.gold -= 100; s.food += food;
      st.agri = clamp(st.agri + agri, 0, 100);
      st.pop = Math.round(st.pop * 1.01);
      let msg = `개간 완료 — 농업 +${agri}, 군량 +${fmt(food)}, 인구 +${fmt(Math.round(st.pop * 0.01))}`;
      let hot = `농업 +${agri}`;
      if (roll(0.22)) { const extra = Math.round(160 * m); s.food += extra; st.agri = clamp(st.agri + 2, 0, 100); hot = `농업 +${agri + 2}`; msg += ` · 대풍년! 군량 +${fmt(extra)}`; }
      return { msg, hotKey: 'farm', hot, exp: 12 };
    } },
    trade: { name: '상업', run(cityId, actor) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.food < 80) return fail('군량이 부족합니다. (필요 미 80)');
      const m = polMul(cityId, actor);
      const comm = Math.max(2, Math.round(6 * m));
      const gold = Math.round(240 * m);
      s.food -= 80; s.gold += gold;
      st.comm = clamp(st.comm + comm, 0, 100);
      let msg = `상업 완료 — 상업 +${comm}, 금 +${fmt(gold)}`;
      let hot = `상업 +${comm}`;
      if (roll(0.2)) { const extra = Math.round(200 * m); s.gold += extra; st.comm = clamp(st.comm + 2, 0, 100); hot = `상업 +${comm + 2}`; msg += ` · 대상인 방문! 금 +${fmt(extra)}`; }
      return { msg, hotKey: 'trade', hot, exp: 12 };
    } },
    recruit: { name: '징병', run(cityId, actor) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 150 || s.food < 120) return fail('금이나 군량이 부족합니다. (필요 금 150 · 미 120)');
      const cap = cityCap(st);
      if (st.troops >= cap) return fail(`인구 대비 병력 상한입니다. (최대 ${fmt(cap)} · 인구 17%)`);
      if (st.pop < 9000) return fail(`인구가 너무 적습니다. (인구 ${fmt(st.pop)})`);
      const m = conMul(cityId, actor);
      const rPct = 1 + (SK.techPct ? SK.techPct('recruitPct') : 0) / 100;
      const want = Math.min(Math.round((2500 + (roll(0.2) ? 800 : 0)) * m * rPct), cap - st.troops, Math.floor((st.pop - 6000) * 0.9));
      if (want < 300) return fail('징병할 수 있는 인구가 부족합니다.');
      const drop = clamp(5 - Math.round(((actor ? actor.cha : 60) - 60) * 0.04), 2, 7);
      s.gold -= 150; s.food -= 120;
      st.troops += want;
      st.pop = Math.max(6000, st.pop - Math.round(want * 0.8));
      st.loyalty = clamp(st.loyalty - drop, 0, 100);
      return { msg: `징병 완료 — 수비병 +${fmt(want)} · 인구 -${fmt(Math.round(want * 0.8))} · 민심 -${drop}`,
        hotKey: 'repair', hot: `병력 +${fmt(want)}`, exp: 12 };
    } },
    train: { name: '훈련', run(cityId, actor) {
      const s = SK.state;
      if (s.gold < 80) return fail('금이 부족합니다. (필요 금 80)');
      const gens = cityGens(cityId);
      if (!gens.length) return fail('훈련할 장수가 없습니다. [인재]로 등용하세요.');
      s.gold -= 80;
      const cs = s.cities[cityId];
      const beforeTrain = cs.train == null ? 50 : cs.train;
      cs.train = clamp(beforeTrain + 3, 0, 100);
      const bonus = roll(0.2) ? 60 : 0;
      const rows = gens.map((h) => {
        const isActor = actor && h.uid === actor.uid;
        const gain = 90 + bonus + (isActor ? 90 : 0);
        const ups = SK.gainExp(h, gain);
        const title = SK.classTitle(h.cls, h.lv);
        const upTxt = ups.length ? ups.map((u) => `Lv.${u.lv}${u.promote ? ` · ${u.title} 승급!` : ' 달성'}`).join(' ') : null;
        return `<div class="train-row ${ups.length ? 'up' : ''}">
          <img src="${SK.ptSrc(h.portrait)}" alt="">
          <div class="tr-main"><b>${h.name}${isActor ? ' <em class="tr-lead">지휘</em>' : ''}</b><span>${title} · Lv.${h.lv}</span></div>
          <div class="tr-exp"><i style="width:${Math.min(100, Math.round(h.exp / SK.expNeed(h.lv) * 100))}%"></i><em>${h.exp} / ${SK.expNeed(h.lv)}</em></div>
          ${upTxt ? `<span class="tr-up">${upTxt}</span>` : `<span class="tr-gain">EXP +${gain}</span>`}
        </div>`;
      }).join('');
      return {
        msg: `훈련 완료 — 훈련도 ${beforeTrain}→${cs.train}${actor ? ` · ${actor.name} 경험치 +180` : ''}`,
        hotKey: 'repair', hot: `훈련도 ${cs.train}`, exp: 0, train: cs.train,
        after: () => SK.modal({ kicker: `${CITY[cityId].name} 훈련장`, title: '병법을 익혔다', body: `<div class="train-list">${rows}</div>`, actions: [{ label: '확인', primary: true }] }),
      };
    } },
    talent: { name: '인재', run(cityId, actor) {
      const s = SK.state;
      if (cityGens(cityId).length >= 99) return fail('이 성에는 더 이상 장수를 둘 수 없습니다.');
      if (!tavernPool(cityId).length) return fail('주점에 소문난 인재가 없습니다. 다른 성의 주점을 찾아보세요.');
      openTavern(cityId, actor);
      return { pending: true };
    } },
    repair: { name: '보수', run(cityId, actor) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 120) return fail('금이 부족합니다. (필요 금 120)');
      if (st.def >= 100) return fail('성벽이 이미 완벽합니다.');
      const m = polMul(cityId, actor);
      const wPct = 1 + (SK.techPct ? SK.techPct('wallPct') : 0) / 100;
      const up = Math.max(3, Math.round(9 * m * wPct));
      s.gold -= 120; st.def = clamp(st.def + up, 0, 100);
      st.loyalty = clamp(st.loyalty + 1, 0, 100);
      let msg = `보수 완료 — 성벽 +${up}, 민심 +1`;
      let hot = `성벽 +${up}`;
      if (roll(0.2)) { st.def = clamp(st.def + 3, 0, 100); hot = `성벽 +${up + 3}`; msg += ' · 좋은 석재 +3'; }
      return { msg, hotKey: 'repair', hot, exp: 12 };
    } },
  };

  /* ── 주점 — 이 성과 길로 이어진 옆 성의 재야 인재까지 만난다 (v4.1) ── */
  const TALENT_COST = { S: 1600, A: 1000, B: 620, C: 380 };
  const RUMORS = {
    S: ['천하에 이름을 떨치는 큰 인물이라 합니다', '한 번 앉히면 일이 척척 풀린다더군요', '제후들이 앞다퉈 청했다는 소문이 있습니다'],
    A: ['관가에서도 눈여겨보는 인물입니다', '글과 무예를 겸비했다 합니다', '요즘 주점마다 이 이름이 오릅니다'],
    B: ['쓸 만한 인재라 합니다', '한 고을을 맡길 만하다는 평입니다', '아직 세상에 알려지지 않았을 뿐이지요'],
    C: ['젊은 데다 패기가 있습니다', '발이 빠르다 합니다', '성실하다는 소문입니다'],
  };
  /* v5.0.3 — 성 하나에 장수 10명 제한을 없앴다. 삼국지처럼 한 성에 인재를 모을 수 있다 */
  const TALENT_LIMIT = 99;

  /* 이 성 + 길로 이어진 성의 재야 인재 (주점 진열) — 같은 지역 인물만 보인다 */
  function tavernPool(cityId) {
    const out = [];
    const seen = new Set();
    const st = SK.state;
    const grp = tavernGroupOf(st, cityId);
    const take = (g, fromId, here) => {
      if (!g || seen.has(g.id)) return;
      if (genPoolGroup(g) !== grp) return;
      if (!SK.debutOk(g, eraYearOf(st))) return;
      seen.add(g.id);
      out.push({ g, cityId: fromId, here });
    };
    localTalents(cityId).forEach((g) => take(g, cityId, true));
    SK.allNeighbors(cityId).forEach((nid) => {
      if (!SK.CITY[nid] || nid === cityId) return;
      localTalents(nid).forEach((g) => take(g, nid, false));
    });
    const rank = { S: 0, A: 1, B: 2, C: 3 };
    out.sort((a, b) => {
      if (a.here !== b.here) return a.here ? -1 : 1;
      const d = (rank[a.g.tier] || 3) - (rank[b.g.tier] || 3);
      return d || String(a.g.name).localeCompare(String(b.g.name));
    });
    return out;
  }
  SK.tavernPool = tavernPool;

  /* 성을 새로 얻었을 때 그 성의 주점을 다시 채운다 (깃발에 맞는 지역 인물만) */
  SK.refillTalents = function (cityId) {
    const s = SK.state;
    const cs = s && s.cities ? s.cities[cityId] : null;
    if (!cs || !SK.GENERALS.length) return;
    const used = new Set();
    s.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
    SK.CITY_LIST.forEach((c) => {
      (s.cities[c.id].genIds || []).forEach((id) => used.add(id));
      if (c.id !== cityId) (s.cities[c.id].talents || []).forEach((id) => used.add(id));
    });
    const grp = tavernGroupOf(s, cityId);
    const yr = eraYearOf(s);
    const pool = SK.GENERALS.filter((g) => !used.has(g.id) && genPoolGroup(g) === grp && SK.debutOk(g, yr))
      .sort((a, b) => SK.genScore(b) - SK.genScore(a));
    const start = Math.max(0, Math.min(pool.length - 1, Math.floor(pool.length * 0.5)));
    cs.talents = pool.slice(start, start + 3).map((g) => g.id);
  };

  /* 등용 비용 — 매력이 높은 장수가 나서면 값이 줄어든다 */
  function talentCost(cityId, g, actor) {
    const base = TALENT_COST[g.tier] || 620;
    return Math.max(200, Math.round(base * talentMul(cityId, actor) / 10) * 10);
  }

  /* v5.3 — 등용 성공률(%): 등급 + 보낸 장수의 매력·지력 + 군주 명성 + 친밀 인연.
     실패해도 금은 쓰지 않고, 보낸 장수의 이번 달 행동만 소모한다. */
  const RECRUIT_BASE = { S: 12, A: 26, B: 48, C: 70 };
  function recruitChance(cityId, g, actor) {
    const s = SK.state;
    let p = RECRUIT_BASE[g.tier] || 48;
    if (actor) p += ((actor.cha || 60) - 60) * 0.55 + ((actor.ji || 60) - 60) * 0.18;
    p += Math.min(14, (s.fame || 0) * 0.05);
    const bond = actor ? SK.bondBetween(actor.name, g.name) : null;
    if (bond && bond.relation === '친밀') p += 15;
    else if (bond && bond.relation === '숙적') p -= 15;
    if (s.recruitFail && s.recruitFail[g.id] === s.turn) p = 0;
    return clamp(Math.round(p), 0, 95);
  }
  SK.recruitChance = recruitChance;

  const REFUSE_LINES = [
    '“아직은 때가 아닙니다. 다른 곳을 찾아보십시오.”',
    '“제게는 아직 해야 할 일이 남아 있습니다.”',
    '“그대의 뜻은 알겠으나, 이번에는 사양하겠습니다.”',
    '“세상이 아직 저를 부르지 않는군요.”',
    '“한 번 더 생각할 시간을 주십시오.”',
  ];

  function openTavern(cityId, actor) {
    const s = SK.state;
    if (!s.recruitFail) s.recruitFail = {};
    const c = CITY[cityId];
    const pool = tavernPool(cityId);
    const hereN = pool.filter((p) => p.here).length;
    const rows = pool.map(({ g, cityId: fromId, here }) => {
      const cls = SK.genClass(g);
      const cost = talentCost(cityId, g, actor);
      const refuse = lordRival(g.name);
      const rate = recruitChance(cityId, g, actor);
      const tried = !refuse && rate === 0;
      const ok = s.gold >= cost && !refuse && !tried && cityGens(cityId).length < TALENT_LIMIT;
      const rumor = RUMORS[g.tier][hashStr(g.name) % RUMORS[g.tier].length];
      const from = here ? '현재 성' : `${CITY[fromId].name} · 인접`;
      return `<button class="gen-pick ${ok ? '' : 'off'} ${refuse ? 'refuse' : ''}" data-gid="${g.id}" data-city="${fromId}">
        <span class="tier t${g.tier}">${g.tier}</span>
        <img style="--fa:${genAura(g.id, g.name)}" src="${SK.ptSrc(SK.genPortrait(g))}" alt="">
        <div class="gp-main">
          <b>${g.name}<em class="gp-city ${here ? 'here' : ''}">${from}</em></b>
          <span>${SK.CLASSES[cls].name} · ${g.skill || '특기 없음'}${g.birthYear ? ` · ${SK.state.eraYear - g.birthYear + 1}세` : ''}</span>
          ${(SK.PASSIVES && SK.PASSIVES[g.name]) ? `<em class="gp-passive">${SK.PASSIVES[g.name].title}</em>` : ''}
          <em class="gp-rumor">“${rumor}”</em>
          <em class="gp-stats"><i>통 <b>${g.leadership}</b></i><i>무 <b>${g.war}</b></i><i>지 <b>${g.intel}</b></i><i>정 <b>${g.politics || 60}</b></i><i>매 <b>${g.charm || 60}</b></i></em>
        </div>
        <span class="gp-cost">${refuse ? '등용 거부' : tried ? '이번 달 거절' : `금 ${fmt(cost)}<small class="gp-rate ${rate < 30 ? 'low' : rate < 60 ? 'mid' : ''}">등용 ${rate}%</small>`}</span>
      </button>`;
    }).join('') || '<p class="tr-empty">주점이 조용합니다. 이 성과 옆 성에도 소문난 인재가 없습니다.</p>';
    const m = SK.modal({
      kicker: `${c.name} 주점`,
      title: '어떤 인재가 있나',
      body: `<p class="talent-note">${actor ? `${josa(actor.name, 'i')} 이번 달 주점을 찾았습니다. ` : ''}이 성에서 ${hereN}명, 길로 이어진 옆 성에서 ${pool.length - hereN}명을 만났습니다. 등용하면 ${actor ? actor.name + ' 님의 행동력과 ' : ''}새로 온 장수의 이번 달 행동이 끝납니다. 매력이 높은 장수가 나서면 값이 줄어듭니다.<br><b>보통 인재(B·C급)가 흔하고, S·A급은 좀처럼 모습을 드러내지 않습니다.</b> 이 성 깃발에 맞는 동네 인물만 찾아옵니다.</p>
        <div class="gen-pick-list">${rows}</div>`,
      wide: true,
      actions: [{ label: '나가기' }],
    });
    m.el.querySelectorAll('.gen-pick').forEach((b) => {
      b.onclick = () => {
        const g = SK.GEN_BY_ID[Number(b.dataset.gid)];
        if (!g) return;
        const fromId = b.dataset.city || cityId;
        const cost = talentCost(cityId, g, actor);
        if (lordRival(g.name)) {
          SK.sfx.play('deny');
          SK.toast(`${josa(g.name, 'eun')} 우리 군주와 숙적이라 등용을 거부합니다.`);
          return;
        }
        if (s.gold < cost) { SK.sfx.play('deny'); SK.toast(`금이 부족합니다. (필요 금 ${fmt(cost)})`); return; }
        if (cityGens(cityId).length >= TALENT_LIMIT) { SK.toast('이 성의 장수가 99명을 넘었습니다. 다른 성으로 옮겨 주십시오.'); return; }
        if (s.recruitFail && s.recruitFail[g.id] === s.turn) { SK.toast('이번 달에는 이미 거절당했습니다. 다음 달에 다시 청해 보십시오.'); return; }
        const rate = recruitChance(cityId, g, actor);
        if (Math.random() * 100 >= rate) {
          /* 실패 — 금은 그대로, 보낸 장수의 이번 달 행동만 쓴다 */
          s.recruitFail[g.id] = s.turn;
          if (actor) actor.actedThisMonth = true;
          cityActorUid = null;
          SK.save();
          m.close();
          SK.openCity(cityId);
          const line = REFUSE_LINES[hashStr(g.name + s.turn) % REFUSE_LINES.length];
          showCutin({ name: g.name, portrait: SK.genPortrait(g), cls: SK.genClass(g), lv: SK.genLv(g) }, line);
          SK.sfx.play('deny');
          SK.toast(`${g.name} — 등용 실패 (성공률 ${rate}%) · 금은 쓰지 않았습니다`);
          return;
        }
        s.gold -= cost;
        const hero = makeHero(g.name, cityId, 1);
        if (!hero) return;
        hero.actedThisMonth = true;          // 등용 직후 자동 턴 종료
        s.heroes.push(hero);
        removeLocalTalent(fromId, g.id);
        if (actor) { actor.actedThisMonth = true; SK.gainExp(actor, 18); }
        cityActorUid = null;
        SK.save();
        m.close();
        SK.openCity(cityId);
        if (actor) showCutin(actor, pickLine('talent'));
        floatHotspot('talent', `${g.name} 합류`);
        sparkleAt('talent');
        SK.sfx.play('levelup');
        SK.toast(`${g.name} 합류 — 금 -${fmt(cost)}${fromId !== cityId ? ` · ${CITY[fromId].name}에서 왔습니다` : ''}`);
      };
    });
  }

  SK.openTavern = openTavern;

  /* ── 병영 — 징병 · 훈련 선택 ── */
  function openBarracksMenu(cityId) {
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 병영`,
      title: '군사를 일으킨다',
      body: `<div class="menu-list">
        <button data-b="recruit">징병 — 금 150 · 미 120 · 수비병 +2,500</button>
        <button data-b="train">훈련 — 금 80 · 주둔 장수 경험치</button>
      </div>`,
      actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('[data-b]').forEach((b) => {
      b.onclick = () => { m.close(); doCommand(b.dataset.b); };
    });
  }

  /* ── 관아 — 민심 · 태수/군사 임명 · 자동 내정 · 위임 ── */
  function openOffice(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const gens = cityGens(cityId);
    const advisor = gens.find((g) => g.uid === cs.advisor) || null;
    const gov = gens.find((g) => g.uid === cs.governor) || null;
    const ready = gens.filter((g) => !g.actedThisMonth).length;
    const isCapital = cityId === s.playerCapital;
    const autoOn = cs.auto !== false;
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 관아`,
      title: '성을 다스린다',
      body: `<div class="office-wrap">
        <div class="office-stats">
          <div><span>민심</span><b>${cs.loyalty}</b></div>
          <div><span>성벽</span><b>${cs.def}</b></div>
          <div><span>훈련도</span><b>${cs.train == null ? 50 : cs.train}</b></div>
          <div><span>대기 장수</span><b>${ready} / ${gens.length}</b></div>
        </div>
        <div class="office-officers">
          <button class="office-officer" data-o="governor" ${gens.length ? '' : 'disabled'}>
            <span>태수</span><b>${gov ? gov.name + (SK.factionInfo(PF()).lord === gov.name ? ' (군주)' : '') : '임명 필요'}</b>
            <em>${gov ? `정치 ${gov.pol} · 통솔 ${gov.tong} · 매력 ${gov.cha}` : '정치·통솔이 높을수록 개간·상업·보수·민심이 좋아집니다'}</em>
          </button>
          <button class="office-officer" data-o="advisor" ${gens.length ? '' : 'disabled'}>
            <span>군사</span><b>${advisor ? advisor.name : '임명 필요'}</b>
            <em>${advisor ? `지력 ${advisor.ji} · 매력 ${advisor.cha}` : '지력·매력이 높을수록 징병·등용·조언이 좋아집니다'}</em>
          </button>
        </div>
        <button class="office-auto ${autoOn ? 'on' : ''}" data-o="auto">
          <b>자동 내정 ${autoOn ? '켜짐' : '꺼짐'}</b>
          <span>${isCapital ? '본성은 달이 바뀌어도 자동으로 내정하지 않습니다' : (gov ? `달이 바뀌면 ${gov.name}이(가) 남은 행동으로 내정합니다` : '태수를 앉히지 않으면 자동 내정하지 않습니다')}</span>
        </button>
        <p class="office-note">태수·군사는 언제든 바꿀 수 있고, 이 성의 내정은 언제나 직접 할 수 있습니다. [군사 조언] 버튼으로 지금 필요한 조언을 들을 수 있습니다. 대기 장수에게 남은 내정을 한 번에 맡기려면 아래 [대기 장수 일괄 내정]을 쓰십시오.</p>
        <div class="menu-list">
          <button data-o="comfort">백성을 위로한다 — 금 100 · 민심 +${Math.max(3, Math.round(5 * polMul(cityId, gov)))}</button>
          <button data-o="advice">군사 조언 — 지금 필요한 것</button>
          <button data-o="delegate" ${ready ? '' : 'disabled'}>대기 장수 일괄 내정 (${ready}명)</button>
        </div>
      </div>`,
      actions: [{ label: '닫기' }],
      wide: true,
    });
    m.el.querySelectorAll('[data-o]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.o;
        if (k === 'comfort') {
          const res = comfortCity(cityId, gov);
          if (!res.ok) { SK.sfx.play('deny'); SK.toast(res.msg); return; }
          SK.save(); SK.refreshHud();
          m.close();
          SK.openCity(cityId);
          floatHotspot('office', `민심 +${res.gain}`);
          SK.toast(res.msg);
        } else if (k === 'governor') {
          m.close();
          openGovernorPick(cityId);
        } else if (k === 'advisor') {
          m.close();
          openAdvisorPick(cityId);
        } else if (k === 'auto') {
          cs.auto = !autoOn;
          SK.save();
          m.close();
          openOffice(cityId);
          SK.toast(`자동 내정을 ${cs.auto ? '켰습니다' : '껐습니다'}.`);
        } else if (k === 'advice') {
          m.close();
          openAdvice(cityId);
        } else if (k === 'delegate') {
          m.close();
          runDelegation(cityId);
        }
      };
    });
  }

  /* 태수 임명 — 정치·통솔이 높은 장수가 내정과 징병을 끌어올린다 */
  function openGovernorPick(cityId) {
    const cs = SK.state.cities[cityId];
    const lord = SK.factionInfo(PF()).lord;
    const all = cityGens(cityId);
    const lordHero = all.find((g) => g.name === lord) || null;
    const gens = lordHero ? [lordHero].concat(all.filter((g) => g.uid !== lordHero.uid)) : all;
    if (!gens.length) { SK.toast('이 성에 태수로 앉힐 장수가 없습니다.'); return; }
    const score = (g) => g.pol * 0.6 + g.tong * 0.4;
    const list = lordHero ? gens : gens.slice().sort((a, b) => score(b) - score(a));
    const rows = list.map((g) => `<button class="target-card" data-uid="${g.uid}">
      <img class="tc-portrait" src="${SK.ptSrc(g.portrait)}" alt="">
      <div class="tc-main"><b>${g.name}${cs.governor === g.uid ? ' <em>태수</em>' : ''}${g.name === lord ? ' <em>군주</em>' : ''}</b>
        <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}</span></div>
      <div class="tc-troops"><span>정치 ${g.pol} · 통솔</span><b>${g.tong}</b></div>
      <span class="tc-go">▸</span>
    </button>`).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 인사`,
      title: '태수로 임명할 장수',
      body: `<p class="talent-note">${lordHero ? `군주 <b>${lordHero.name}</b>이(가) 이 성에 주둔하고 있어 친히 다스립니다. 군주가 있는 동안에는 다른 장수를 태수로 앉힐 수 없습니다.` : '태수의 정치·통솔이 높을수록 개간·상업·성벽 보수·민심 위로가 잘 되고, 징병도 많이 모입니다.'} 달이 바뀔 때 남은 행동으로 내정을 맡깁니다(본성 제외).</p><div class="target-list">${rows}</div>`,
      actions: [{ label: '취소' }],
      wide: true,
    });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        const pickUid = b.dataset.uid;
        const pick = gens.find((g) => g.uid === pickUid);
        if (lordHero && pickUid !== lordHero.uid) {
          SK.toast(`군주 ${lordHero.name}이(가) 주둔한 성은 군주가 친히 다스립니다. 군주를 옮기면 다른 장수에게 맡길 수 있습니다.`);
          return;
        }
        cs.governor = pickUid;
        SK.save();
        m.close();
        const g = SK.state.heroes.find((h) => h.uid === cs.governor);
        SK.toast(`${josa(g.name, 'eul')} 태수로 임명했습니다.`);
        SK.openCity(cityId);
      };
    });
  }
  SK.openGovernorPick = openGovernorPick;

  function openAdvisorPick(cityId) {
    const cs = SK.state.cities[cityId];
    const lord = SK.factionInfo(PF()).lord;
    const gens = cityGens(cityId).filter((g) => g.name !== lord);
    if (!gens.length) { SK.toast('이 성에 군사로 앉힐 장수가 없습니다. (군주는 군사를 겸하지 않습니다)'); return; }
    const score = (g) => g.ji * 1.4 + g.tong;
    const list = gens.slice().sort((a, b) => score(b) - score(a));
    const rows = list.map((g) => `<button class="target-card" data-uid="${g.uid}">
      <img class="tc-portrait" src="${SK.ptSrc(g.portrait)}" alt="">
      <div class="tc-main"><b>${g.name}${cs.advisor === g.uid ? ' <em>군사</em>' : ''}</b>
        <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}</span></div>
      <div class="tc-troops"><span>지력</span><b>${g.ji}</b></div>
      <span class="tc-go">▸</span>
    </button>`).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 인사`,
      title: '군사로 임명할 장수',
      body: `<p class="talent-note">지력과 매력이 높은 장수가 좋은 조언을 하고 징병·등용을 돕습니다. 조언은 행동력을 쓰지 않습니다.</p><div class="target-list">${rows}</div>`,
      actions: [{ label: '취소' }],
      wide: true,
    });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        cs.advisor = b.dataset.uid;
        SK.save();
        m.close();
        const g = SK.state.heroes.find((h) => h.uid === cs.advisor);
        SK.toast(`${josa(g.name, 'eul')} 군사로 임명했습니다.`);
        SK.openCity(cityId);
      };
    });
  }

  function chooseDelegatedAction(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const cap = cityCap(cs);
    if (cs.troops < cap * 0.7 && s.gold >= 150 && s.food >= 120 && cs.pop > 12000) return 'recruit';
    if (cs.def < 65 && s.gold >= 120) return 'repair';
    if (s.food < 5000 && s.gold >= 100) return 'farm';
    if (s.gold < 6000 && s.food >= 80) return 'trade';
    if (cs.def < 92 && s.gold >= 120) return 'repair';
    if (s.gold >= 80) return 'train';
    return null;
  }

  /* 달이 바뀔 때 태수가 남은 행동으로 고르는 내정 — 민심·병력·성벽·재정·훈련 순서
     같은 일만 반복하지 않도록 이번 달에 이미 한 일을 세어 둔다. */
  function chooseAutoAction(cityId, done) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const cap = cityCap(cs);
    const n = done || {};
    if (s.gold < 200) return null;                       // 군자금은 남겨 둔다
    if (cs.loyalty < 55 && s.gold >= 100 && !n.comfort) return 'comfort';
    if (cs.troops < cap * 0.75 && s.gold >= 150 && s.food >= 120 && cs.pop > 12000 && !n.recruit) return 'recruit';
    if (cs.def < 70 && s.gold >= 120 && !n.repair) return 'repair';
    if (s.food < 6000 && s.gold >= 100 && (n.farm || 0) < 2) return 'farm';
    if (s.gold < 5000 && s.food >= 80 && (n.trade || 0) < 2) return 'trade';
    if ((cs.train == null ? 50 : cs.train) < 70 && s.gold >= 80 && !n.train) return 'train';
    if (cs.def < 95 && s.gold >= 120 && !n.repair) return 'repair';
    if (cs.loyalty < 70 && s.gold >= 100 && !n.comfort) return 'comfort';
    if (s.gold >= 100 && (n.farm || 0) < 2) return 'farm';
    if (s.food >= 80 && (n.trade || 0) < 2) return 'trade';
    return null;
  }

  /* 태수 자동 내정 — 본성과 태수가 없는 성은 움직이지 않는다 */
  function runAutoDomestic(s) {
    const out = [];
    SK.CITY_LIST.forEach((c) => {
      if (c.id === s.playerCapital) return;
      const cs = s.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      if (cs.auto === false) return;
      const gov = officerOf(c.id, 'gov');
      if (!gov) return;
      const acts = [];
      const done = {};
      let guard = 0;
      while (guard++ < 8) {
        const actor = cityGens(c.id).find((g) => !g.actedThisMonth);
        if (!actor) break;
        const key = chooseAutoAction(c.id, done);
        if (!key) break;
        let res;
        if (key === 'comfort') {
          res = comfortCity(c.id, gov);
          if (!res.ok) break;
          res.exp = 6;
          res.short = `민심 +${res.gain}`;
        } else {
          res = CMDS[key].run(c.id, actor);
          if (res && res.short == null) res.short = res.hot || CMDS[key].name;
        }
        if (!res || res.pending) break;
        done[key] = (done[key] || 0) + 1;
        actor.actedThisMonth = true;
        if (res.exp) SK.gainExp(actor, res.exp);
        acts.push({ key, short: res.short });
      }
      if (acts.length) {
        SK.gainExp(gov, 8 * acts.length);
        out.push({ city: CITY[c.id].name, gov: gov.name, acts });
      }
    });
    return out;
  }
  SK.runAutoDomestic = runAutoDomestic;

  const DELEGATE_LIMIT = 10;

  /* 군사 위임 — 남은 장수들의 행동력을 차례로 써서 내정을 처리한다 */
  function runDelegation(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const gens = cityGens(cityId);
    const advisor = gens.find((g) => g.uid === cs.advisor) || gens.slice().sort((a, b) => (b.ji * 1.4 + b.tong) - (a.ji * 1.4 + a.tong))[0];
    if (!advisor) { SK.toast('군사를 임명할 장수가 없습니다.'); return; }
    if (!cs.advisor) cs.advisor = advisor.uid;
    const log = [];
    let guard = 0;
    while (guard++ < DELEGATE_LIMIT) {
      const actor = cityGens(cityId).find((g) => !g.actedThisMonth);
      if (!actor) break;
      const key = chooseDelegatedAction(cityId);
      if (!key) break;
      const res = CMDS[key].run(cityId, actor);
      if (!res || res.pending) break;
      actor.actedThisMonth = true;
      if (res.exp) SK.gainExp(actor, res.exp);
      log.push({ actor, key, msg: res.msg || CMDS[key].name });
    }
    if (log.length && advisor) SK.gainExp(advisor, 12 * log.length);
    cityActorUid = null;
    SK.save();
    SK.refreshHud();
    const rows = log.map((r) => `<div class="train-row">
        <img src="${SK.ptSrc(r.actor.portrait)}" alt="">
        <div class="tr-main"><b>${r.actor.name}</b><span>${CMDS[r.key].name}</span></div>
        <span class="tr-gain">${r.msg}</span>
      </div>`).join('') || '<p class="tr-empty">금과 군량이 모자라 아무 일도 하지 못했습니다.</p>';
    SK.modal({
      kicker: `${CITY[cityId].name} 위임`,
      title: log.length ? `${advisor.name}의 위임 보고` : '위임할 일이 없습니다',
      body: `<div class="train-list">${rows}</div>`,
      actions: [{ label: '확인', primary: true, onClick: () => { if (document.querySelector('#screen-city.active')) SK.openCity(cityId); } }],
      wide: true,
    });
    SK.sfx.play('drum');
  }
  SK.runDelegation = runDelegation;

  /* ───────────── 군사 조언 (v4.1) ─────────────
     군사를 임명하면 [군사] 버튼은 남은 행동력을 태우는 위임이 아니라,
     지금 이 성의 형편(민심·병력·성벽·재정·옆 성의 위협·주점 인재)을 읽은 조언을 연다.
     원할 때만 '조언대로 진행'으로 한 번에 실행한다. */
  function advisorOf(cityId) {
    const cs = SK.state.cities[cityId];
    if (!cs) return null;
    const gens = cityGens(cityId);
    return gens.find((g) => g.uid === cs.advisor) ||
      gens.slice().sort((a, b) => (b.ji * 1.4 + b.tong) - (a.ji * 1.4 + a.tong))[0] || null;
  }
  SK.advisorOf = advisorOf;

  function citySituation(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const gens = cityGens(cityId);
    const ready = gens.filter((g) => !g.actedThisMonth).length;
    const nb = SK.allNeighbors(cityId).map((id) => SK.CITY[id]).filter(Boolean).map((c) => {
      const st = s.cities[c.id];
      return { id: c.id, name: c.name, mine: st.owner === PF(), troops: st.troops, def: st.def, type: c.type };
    });
    const foes = nb.filter((n) => !n.mine).sort((a, b) => b.troops - a.troops);
    const friends = nb.filter((n) => n.mine);
    const talents = tavernPool(cityId);
    return { s, cs, gens, ready, nb, foes, friends, cap: cityCap(cs), talents };
  }

  function buildAdvice(sit) {
    const { s, cs, ready, foes, cap, talents } = sit;
    const items = [];
    const push = (o) => { if (!items.some((x) => x.key === o.key)) items.push(o); };
    const topFoe = foes[0] || null;
    const weakFoe = foes.slice().sort((a, b) => a.troops - b.troops)[0] || null;
    const capGap = cap - cs.troops;
    const canRecruit = s.gold >= 150 && s.food >= 120 && cs.pop > 12000 && capGap > 300;
    const threat = topFoe && topFoe.troops > cs.troops * 0.8;

    if (cs.loyalty < 58) {
      push({ key: 'comfort', tone: cs.loyalty < 42 ? 'urgent' : 'warn',
        title: `민심이 ${cs.loyalty}까지 내려앉았습니다`,
        body: `백성이 등을 돌리면 징병도 세수도 줄어듭니다. 관아에서 백성을 위로하면 금 100으로 민심을 5 올릴 수 있습니다.`,
        label: '관아 · 백성 위로 (금 100)', short: '민심 위로' });
    }

    if (threat) {
      if (canRecruit) {
        push({ key: 'recruit', tone: 'urgent',
          title: `이웃 ${topFoe.name}의 병력 ${fmt(topFoe.troops)}이 우리 ${fmt(cs.troops)}보다 많습니다`,
          body: `성벽 ${cs.def}도 넉넉하지 않습니다. 병영에서 징병해 병력을 채우고(금 150 · 군량 120), 다음 달에 성벽을 보수하십시오.`,
          label: '병영 · 징병 (금 150 · 군량 120)', short: '징병' });
      } else if (s.gold >= 120 && cs.def < 95) {
        push({ key: 'repair', tone: 'urgent',
          title: `이웃 ${topFoe.name}이 병력 ${fmt(topFoe.troops)}으로 노리고 있습니다`,
          body: `지금은 군량과 금이 모자라 징병이 어렵습니다. 성벽(현재 ${cs.def})을 먼저 손보아 버티면서 재정을 세우십시오.`,
          label: '성벽 · 보수 (금 120)', short: '성벽 보수' });
      } else {
        push({ key: 'trade', tone: 'warn',
          title: `이웃 ${topFoe.name}의 위협이 큽니다`,
          body: `금 ${fmt(s.gold)} · 군량 ${fmt(s.food)}으로는 징병도 보수도 어렵습니다. 상업으로 금을 만들고(군량 80) 개간으로 군량을 채우십시오.`,
          label: '시장 · 상업 (군량 80)', short: '상업' });
      }
    } else if (capGap > cap * 0.32 && canRecruit) {
      push({ key: 'recruit', tone: 'info',
        title: `병력이 상한의 ${Math.round(cs.troops / cap * 100)}%입니다`,
        body: `이 성은 인구 ${fmt(cs.pop)}으로 ${fmt(cap)}까지 병력을 채울 수 있습니다. 징병으로 ${fmt(Math.min(capGap, 2500))}가량을 더 세울 수 있습니다.`,
        label: '병영 · 징병 (금 150 · 군량 120)', short: '징병' });
    }

    if (s.food < 4500 && s.gold >= 100) {
      push({ key: 'farm', tone: s.food < 1800 ? 'warn' : 'info',
        title: `군량이 ${fmt(s.food)}뿐입니다`,
        body: `출진과 징병에 군량이 듭니다. 농장에서 개간하면 군량 +300과 농업 +6을 얻습니다.`,
        label: '농장 · 개간 (금 100)', short: '개간' });
    }
    if (s.gold < 900 && s.food >= 80) {
      push({ key: 'trade', tone: s.gold < 300 ? 'warn' : 'info',
        title: `금이 ${fmt(s.gold)}으로 마릅니다`,
        body: `징병·보수·등용 모두 금이 듭니다. 시장에서 상업을 벌이면 금 +240과 상업 +6을 얻습니다.`,
        label: '시장 · 상업 (군량 80)', short: '상업' });
    }

    if (talents.length) {
      const rank = { S: 0, A: 1, B: 2, C: 3 };
      const best = talents.slice().sort((a, b) => (rank[a.g.tier] || 3) - (rank[b.g.tier] || 3))[0];
      const where = best.here ? '이 성 주점' : `${CITY[best.cityId].name} 주점(길로 이어진 성)`;
      push({ key: 'talent', tone: 'good',
        title: `${where}에 ${best.g.name}(${best.g.tier}급)이 있습니다`,
        body: `${SK.CLASSES[SK.genClass(best.g)].name} · 지력 ${best.g.intel} · 통솔 ${best.g.leadership}. 등용하면 금 ${fmt(TALENT_COST[best.g.tier] || 620)}이 들고, 이번 달 행동이 끝납니다.`,
        label: '주점 · 인재 등용', short: '인재 등용' });
    }

    if (ready > 0 && weakFoe && cs.troops >= Math.max(1500, weakFoe.troops * 1.05) && cs.def >= 42) {
      push({ key: 'sortie', target: weakFoe.id, tone: 'good',
        title: `${weakFoe.name}을 노려볼 만합니다`,
        body: `우리 병력 ${fmt(cs.troops)} · 성벽 ${cs.def}, ${weakFoe.name}은 병력 ${fmt(weakFoe.troops)}입니다. 지금 출진하면 이길 만합니다.`,
        label: `출진 · ${weakFoe.name} 공략`, short: '출진' });
    }

    if (!items.length) {
      push({ key: 'train', tone: 'info',
        title: '지금은 성을 다질 때입니다',
        body: `민심 ${cs.loyalty} · 병력 ${fmt(cs.troops)}/${fmt(cap)} · 성벽 ${cs.def} · 금 ${fmt(s.gold)} · 군량 ${fmt(s.food)}. 급한 곳은 없으니 훈련으로 장수들을 키우십시오.`,
        label: '병영 · 훈련 (금 80)', short: '훈련' });
    }
    return items.slice(0, 4);
  }

  const TONE_LABEL = { urgent: '급함', warn: '주의', info: '권장', good: '기회' };

  function openAdvice(cityId) {
    const sit = citySituation(cityId);
    const adv = advisorOf(cityId);
    if (!adv) { openAdvisorPick(cityId); return; }
    if (!sit.cs.advisor) { sit.cs.advisor = adv.uid; SK.save(); }
    const items = buildAdvice(sit);
    const top = items[0];
    const c = CITY[cityId];
    const rows = items.map((it) => `<div class="advice-row ${it.tone}">
        <div class="advice-head"><span class="advice-tone">${TONE_LABEL[it.tone] || '조언'}</span><b>${it.title}</b></div>
        <p>${it.body}</p>
        <span class="advice-go">${it.label}</span>
      </div>`).join('');
    SK.modal({
      kicker: `${c.name} 군사 조언`,
      title: `${adv.name}의 조언`,
      body: `<div class="advice-wrap">
        <div class="advice-stats">
          <div><span>민심</span><b>${sit.cs.loyalty}</b></div>
          <div><span>성벽</span><b>${sit.cs.def}</b></div>
          <div><span>수비병</span><b>${fmt(sit.cs.troops)}</b></div>
          <div><span>대기 장수</span><b>${sit.ready}/${sit.gens.length}</b></div>
        </div>
        <p class="advice-sum">금 ${fmt(sit.s.gold)} · 군량 ${fmt(sit.s.food)} · 병력 상한 ${fmt(sit.cap)}
          ${sit.foes.length ? ` · 이웃 적성 ${sit.foes.map((f) => `${f.name}(${fmt(f.troops)})`).join(' · ')}` : ' · 이웃에 적성이 없습니다'}
          ${sit.talents.length ? ` · 주점 인재 ${sit.talents.length}명` : ''}</p>
        <div class="advice-list">${rows}</div>
        <p class="office-note">조언은 행동력을 쓰지 않습니다. 진행을 누를 때만 장수 한 명의 이번 달 행동이 쓰입니다.</p>
      </div>`,
      wide: true,
      actions: [
        { label: '닫기', primary: true },
        top ? { label: `조언대로 진행 — ${top.short}`, onClick: () => runAdvice(cityId, top) } : null,
      ].filter(Boolean),
    });
    SK.sfx.play('ui');
  }
  SK.openAdvice = openAdvice;

  function runAdvice(cityId, item) {
    if (!item) return;
    if (item.key === 'comfort') {
      const res = comfortCity(cityId, SK.advisorOf(cityId));
      if (!res.ok) { SK.sfx.play('deny'); SK.toast(res.msg); return; }
      SK.save();
      SK.refreshHud();
      SK.openCity(cityId);
      floatHotspot('office', `민심 +${res.gain}`);
      SK.sfx.play('ui');
      SK.toast(res.msg);
      return;
    }
    if (item.key === 'sortie') { SK.openSortiePrep(item.target || null, cityId); return; }
    doCommand(item.key);
  }
  SK.runAdvice = runAdvice;

  function finishAction(cityId, actor, key, res) {
    const s = SK.state;
    if (actor) {
      actor.actedThisMonth = true;
      if (res.exp) SK.gainExp(actor, res.exp);
      cityActorUid = null;
    }
    SK.save();
    SK.refreshHud();
    if (document.querySelector('#screen-city.active')) SK.openCity(cityId);
    if (actor) showCutin(actor, SK.quoteOf(actor.name, 'domestic') || res.line || pickLine(key));
    if (res.hotKey) { floatHotspot(res.hotKey, res.hot); sparkleAt(res.hotKey); }
    SK.sfx.play(ACTION_SFX[key] || 'ui');
    if (res.msg) SK.toast(res.msg);
    if (res.after) setTimeout(res.after, 820);
  }

  function doCommand(key) {
    const s = SK.state;
    const cityId = s.lastCity;
    if (key === 'map') { SK.showMap(); return; }
    if (key === 'sortie') { SK.openSortiePrep(null, cityId); return; }
    if (key === 'office') { openOffice(cityId); return; }
    if (key === 'barracks') { openBarracksMenu(cityId); return; }
    const cmd = CMDS[key];
    if (!cmd) return;
    let actor = null;
    if (DOMESTIC.includes(key)) {
      actor = pickActor(cityId);
      if (!actor) return;
    }
    const res = cmd.run(cityId, actor);
    if (!res || res.pending) return;
    finishAction(cityId, actor, key, res);
  }

  /* ───────────── 출진 준비 ───────────── */
  SK.openSortiePrep = function (targetId, fromCityId) {
    const s = SK.state;
    const origin = fromCityId || s.lastCity ||
      SK.CITY_LIST.find((c) => s.cities[c.id].owner === PF() && SK.allNeighbors(c.id).some((n) => s.cities[n].owner !== PF()))?.id;
    if (!origin) { SK.toast('출진할 아군 거점이 없습니다.'); return; }
    let targets = SK.allNeighbors(origin).filter((n) => s.cities[n].owner !== PF()).map((t) => ({ t, from: origin }));
    if (targetId) { openDeploy(origin, targetId); return; }
    if (!targets.length) {
      const seen = new Set();
      SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF()).forEach((pc) => {
        SK.allNeighbors(pc.id).forEach((n) => {
          if (s.cities[n].owner === PF() || seen.has(n)) return;
          seen.add(n); targets.push({ t: n, from: pc.id });
        });
      });
    }
    if (!targets.length) {
      SK.modal({ title: '출진할 적성 없음', body: `<p class="modal-p">${CITY[origin].name} 인근의 적 거점을 모두 평정했습니다. 다른 성에서 출진하세요.</p>`, actions: [{ label: '지도로', primary: true, onClick: () => SK.showMap() }] });
      return;
    }
    const rows = targets.map(({ t, from }) => {
      const c = CITY[t], st = s.cities[t], f = SK.factionInfo(st.owner);
      const bt = SK.battleTypeFor(c);
      return `<button class="target-card" data-t="${t}">
        <span class="tc-flag" style="background:${f.color}">${SK.markOf(f)}</span>
        <div class="tc-main"><b>${c.name}</b>
          <span>${f.name} · ${typeName(c.type)} · ${SK.BATTLE_TYPES[bt].name}${from !== origin ? ` · ${CITY[from].name}에서` : ''}</span></div>
        <div class="tc-troops"><span>수비병</span><b>${fmt(st.troops)}</b></div>
        <span class="tc-go">▸</span>
      </button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[origin].name} 출진`,
      title: '어느 적성을 칠까',
      body: `<div class="target-list">${rows}</div>`,
      actions: [{ label: '돌아가기' }],
      wide: true,
    });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      const pick = targets.find((x) => x.t === b.dataset.t);
      b.onclick = () => { m.close(); openDeploy(pick ? pick.from : origin, b.dataset.t); };
    });
  };

  function openDeploy(origin, targetId) {
    const s = SK.state;
    const tc = SK.CITY[targetId], ts = s.cities[targetId];
    const bt = SK.battleTypeFor(tc);
    const f = SK.factionInfo(ts.owner);
    const pool = cityGens(origin);
    if (!pool.length && ts.troops < 1800) {
      SK.modal({ title: '출진 불가', body: `<p class="modal-p">${SK.CITY[origin].name}에 장수도 병력도 부족합니다. [인재]와 [징병]으로 전력을 갖추세요.</p>`, actions: [{ label: '닫기', primary: true }] });
      return;
    }
    const avail = Math.floor(s.cities[origin].troops);
    /* v5.3 — 명장 최소 출진 1,000 · 기본 출진 2,000 */
    const MIN_T = 1000;
    const capOf = (h) => SK.troopCapOf(h);   // v5.2 — 군주 10,000 / 일반 5,000
    const baseTroops = (h) => clamp(2000, MIN_T, capOf(h));
    const pick = {};          // uid → 병력
    let budget = avail;
    pool.slice(0, 4).forEach((h) => {
      const c = baseTroops(h);
      if (c <= budget) { pick[h.uid] = c; budget -= c; }
    });
    const regs = {};
    SK.REGIMENTS.forEach((r) => { regs[r.cls] = 0; });
    const MAX_UNITS = 10;

    const heroOf = (uid) => s.heroes.find((x) => x.uid === uid);
    const heroCost = () => Object.keys(pick).reduce((sum, uid) => sum + (pick[uid] || 0), 0);
    const regCost = () => SK.REGIMENTS.reduce((sum, r) => sum + (regs[r.cls] || 0) * r.cost, 0);
    const totalCost = () => heroCost() + regCost();
    const unitCount = () => Object.keys(pick).length + SK.REGIMENTS.reduce((sum, r) => sum + (regs[r.cls] || 0), 0);
    const left = () => avail - totalCost();

    const body = `<div class="deploy-wrap">
      <div class="deploy-banner" style="--fc:${f.color}">
        <span class="db-flag">${SK.markOf(f)}</span>
        <div><b>${armyName(f)} ${fmt(ts.troops)}</b><span>성벽 ${ts.def} · ${SK.BATTLE_TYPES[bt].desc}</span></div>
      </div>
      ${deployQuote(pool, Object.keys(pick), s)}
      <p class="march-note"><b>행군 ${marchTurns(origin, targetId)}개월</b> · ${SK.CITY[origin].name} → ${tc.name} · 길에서 적 요격대를 만날 수 있습니다.</p>
      ${(ts.genIds && ts.genIds.length) ? `<p class="enemy-gens">적장 — ${ts.genIds.map((gid) => SK.GEN_BY_ID[gid]).filter(Boolean).map((g) => `${g.name}(${g.tier})`).join(' · ')}</p>` : ''}
      <div class="troop-ledger">
        <div><span>보유 병력</span><b id="dp-avail">${fmt(avail)}</b></div>
        <div><span>출진 병력</span><b id="dp-cost" class="hot">0</b></div>
        <div><span>남는 병력</span><b id="dp-left">0</b></div>
        <div><span>부대</span><b id="dp-units">0 / ${MAX_UNITS}</b></div>
      </div>
      <p class="deploy-tip">${SK.BATTLE_TYPES[bt].skill} 병력이 곧 부대의 HP입니다. 장수 줄을 눌러 출진을 켜고 끄고, −／＋로 병력을 1명씩 조절하세요(길게 누르면 빠르게 오릅니다).</p>
      <div class="deploy-section"><span>명장 출진</span><em>장수별 병력 조절 (최소 1,000)</em></div>
      <div class="deploy-list" id="deploy-list">${pool.map((h) => heroPickRow(h, pick[h.uid] != null, pick[h.uid] != null ? pick[h.uid] : baseTroops(h))).join('') || '<p class="empty-gens">주둔 장수가 없습니다. 병종 부대만으로 출진할 수 있습니다.</p>'}</div>
      <div class="deploy-section"><span>병종 부대 편성</span><em>병력이 남으면 일반 부대를 더 편성할 수 있습니다</em></div>
      <div class="regiment-list" id="regiment-list">
        ${SK.REGIMENTS.map((r) => `<div class="reg-row" data-cls="${r.cls}">
          <span class="reg-emblem">${SK.CLASSES[r.cls].name.charAt(0)}</span>
          <div class="reg-main"><b>${r.name}</b><span>${SK.CLASSES[r.cls].role} · 병력 ${fmt(r.cost)}</span></div>
          <div class="reg-stepper"><button class="stepminus" aria-label="줄이기">−</button><b class="reg-count">0</b><button class="stepplus" aria-label="늘리기">＋</button></div>
        </div>`).join('')}
      </div>
      <p class="deploy-count"><b id="deploy-count">0</b> 부대 · 병력 <b id="dp-cost2">0</b> / ${fmt(avail)}</p>
    </div>`;

    const m = SK.modal({
      kicker: `${SK.BATTLE_TYPES[bt].name} · ${SK.CITY[origin].name} → ${tc.name}`,
      title: `${tc.name} 공략`,
      body,
      wide: true,
      actions: [
        { label: '돌아가기' },
        { label: '출진!', primary: true, onClick: () => {
          if (!unitCount()) { SK.toast('부대를 한 개 이상 편성하세요.'); return; }
          if (totalCost() > avail) { SK.toast(`보유 병력이 ${fmt(totalCost() - avail)} 부족합니다. 부대를 줄이세요.`); return; }
          const units = [];
          Object.keys(pick).forEach((uid) => units.push({ kind: 'hero', uid, troops: pick[uid] }));
          SK.REGIMENTS.forEach((r) => {
            for (let i = 0; i < (regs[r.cls] || 0); i++) units.push({ kind: 'regiment', cls: r.cls, name: r.name, troops: r.cost });
          });
          s.cities[origin].troops = Math.max(0, avail - totalCost());
          const turns = marchTurns(origin, targetId);
          startMarch({ origin, targetId, type: bt, units });
          SK.showMap();
          if (window.SKMap) { try { SKMap.setScale(1.25); SKMap.focusCity(origin, true); } catch (e) { /* ignore */ } }
          SK.toast(`행군 시작 — ${turns}개월 뒤 ${tc.name} 도착 · 지도에 행군 부대가 표시됩니다`);
        } },
      ],
    });

    const refresh = () => {
      m.el.querySelector('#dp-cost').textContent = fmt(totalCost());
      m.el.querySelector('#dp-cost2').textContent = fmt(totalCost());
      m.el.querySelector('#dp-left').textContent = fmt(left());
      m.el.querySelector('#dp-left').classList.toggle('bad', left() < 0);
      m.el.querySelector('#dp-units').textContent = `${unitCount()} / ${MAX_UNITS}`;
      m.el.querySelector('#deploy-count').textContent = unitCount();
      m.el.querySelectorAll('.hero-pick').forEach((el) => {
        const uid = el.dataset.uid;
        const on = pick[uid] != null;
        el.classList.toggle('on', on);
        const b = el.querySelector('.hp-count');
        if (b) b.textContent = fmt(on ? pick[uid] : baseTroops(heroOf(uid)));
      });
      m.el.querySelectorAll('.reg-row').forEach((row) => {
        const cls = row.dataset.cls;
        row.querySelector('.reg-count').textContent = regs[cls] || 0;
        row.classList.toggle('on', (regs[cls] || 0) > 0);
      });
    };

    const toggleHero = (uid) => {
      if (pick[uid] != null) { delete pick[uid]; refresh(); return; }
      if (unitCount() >= MAX_UNITS) { SK.toast(`부대는 최대 ${MAX_UNITS}개입니다.`); return; }
      const h = heroOf(uid);
      const want = Math.min(baseTroops(h), Math.max(MIN_T, left()));
      if (want < MIN_T) { SK.toast('병력이 부족합니다. 다른 부대를 줄이세요.'); return; }
      pick[uid] = want;
      refresh();
    };
    const adjustHero = (uid, delta) => {
      const h = heroOf(uid);
      const cap = capOf(h);
      if (pick[uid] == null) {
        if (delta < 0) return;
        if (left() < MIN_T) { SK.toast('보유 병력이 부족합니다.'); return; }
        pick[uid] = MIN_T;
        refresh();
        return;
      }
      const next = clamp((pick[uid] || 0) + delta, MIN_T, cap);
      const diff = next - (pick[uid] || 0);
      if (diff > left()) { SK.toast('보유 병력이 부족합니다.'); return; }
      pick[uid] = next;
      refresh();
    };

    /* v5.2 — 병력 숫자를 누르면 키패드로 직접 입력.
       2000·3000처럼 큰 수를 바로 넣고, 최소 500 ~ 상한/남은 병력으로 자동 조정된다. */
    const openTroopInput = (uid) => {
      const h = heroOf(uid);
      if (!h) return;
      const on = pick[uid] != null;
      const own = on ? pick[uid] : 0;
      const cur = on ? pick[uid] : baseTroops(h);
      const maxNow = Math.max(MIN_T, Math.min(capOf(h), left() + own));
      const im = SK.modal({
        kicker: `${h.name} · 병력`, title: '병력을 직접 입력',
        body: `<div class="troop-input">
          <label>병력 <em>${fmt(MIN_T)} ~ ${fmt(maxNow)}</em></label>
          <input id="ti-num" type="number" inputmode="numeric" pattern="[0-9]*" min="${MIN_T}" max="${maxNow}" step="100" value="${cur}">
          <div class="ti-quick">${[1000, 2000, 3000, 4000, 5000, 8000, 10000].filter((v) => v <= maxNow).map((v) => `<button data-v="${v}">${fmt(v)}</button>`).join('')}</div>
          <p class="ti-note">장수 상한 ${fmt(capOf(h))} · 남은 병력 ${fmt(left() + own)} 안에서 자동으로 맞줍니다.</p>
        </div>`,
        actions: [
          { label: '취소' },
          { label: '적용', primary: true, onClick: () => {
            const el = im.el.querySelector('#ti-num');
            const v = clamp(Math.round(Number(el.value) || 0), MIN_T, maxNow);
            pick[uid] = v;
            refresh();
            SK.toast(`${h.name} 병력 ${fmt(v)}`);
          } },
        ],
      });
      const inp = im.el.querySelector('#ti-num');
      im.el.querySelectorAll('.ti-quick button').forEach((b) => { b.onclick = () => { inp.value = b.dataset.v; }; });
      setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 120);
    };

    m.el.querySelectorAll('.hero-pick').forEach((el) => {
      const uid = el.dataset.uid;
      el.onclick = (e) => {
        if (e.target.closest('.hp-step')) return;
        toggleHero(uid);
      };
      /* v5.0.3 — 병력은 1명 단위로. 길게 누르면 점점 빠르게(1→5→25→100) 오른다. */
      const cntBtn = el.querySelector('.hp-count');
      if (cntBtn) cntBtn.onclick = (e) => { e.stopPropagation(); openTroopInput(uid); };   // v5.2 — 숫자 탭 → 직접 입력
      el.querySelectorAll('.hp-step button[data-d]').forEach((b) => {
        const dir = Number(b.dataset.d);
        let timer = null, held = 0;
        const tick = () => {
          held += 1;
          const step = held < 12 ? 1 : held < 30 ? 5 : held < 60 ? 25 : 100;
          adjustHero(uid, dir * step);
        };
        const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
        b.onpointerdown = (e) => {
          e.stopPropagation();
          e.preventDefault();
          held = 0;
          tick();
          timer = setInterval(tick, 55);
        };
        b.onpointerup = stop;
        b.onpointerleave = stop;
        b.onpointercancel = stop;
      });
    });
    m.el.querySelectorAll('.reg-row').forEach((row) => {
      const cls = row.dataset.cls;
      const reg = SK.REGIMENTS.find((r) => r.cls === cls);
      row.querySelector('.stepplus').onclick = () => {
        if (unitCount() >= MAX_UNITS) { SK.toast(`부대는 최대 ${MAX_UNITS}개입니다.`); return; }
        if (totalCost() + reg.cost > avail) { SK.toast('병력이 부족합니다.'); return; }
        regs[cls] += 1; refresh();
      };
      row.querySelector('.stepminus').onclick = () => { regs[cls] = Math.max(0, regs[cls] - 1); refresh(); };
    });
    refresh();
  }

  /* ───────────── v5.3 — 행군 2~3개월 · 도중 요격전 ─────────────
     출진하면 곧바로 성 앞이 아니라 지도 길 위를 2~3달 걸어간다.
     중간 달에 적 병력·성벽·지형에 따라 확률로 요격전(평야·산악·도하·수전·매복)이 걸린다. */
  const MARCH_MIN = 2, MARCH_MAX = 3;
  function marchTurns(origin, targetId) {
    const a = CITY[origin], b = CITY[targetId];
    if (!a || !b) return MARCH_MIN;
    const d = Math.hypot((a.u - b.u) * 2000, (a.v - b.v) * 1333);
    return d > 620 ? MARCH_MAX : MARCH_MIN;
  }
  SK.marchTurns = marchTurns;

  function marchUnitTroops(units) { return (units || []).reduce((n, u) => n + (u.troops || 0), 0); }

  function startMarch(opts) {
    const s = SK.state;
    s.marches = s.marches || [];
    const id = 'm' + (s.marchSeq = (s.marchSeq || 0) + 1);
    const total = marchTurns(opts.origin, opts.targetId);
    const m = { id, origin: opts.origin, target: opts.targetId, type: opts.type,
      units: opts.units.map((u) => Object.assign({}, u)), total, left: total,
      heroes: opts.units.filter((u) => u.kind === 'hero').map((u) => u.uid), started: s.turn };
    s.marches.push(m);
    m.heroes.forEach((uid) => { const h = s.heroes.find((x) => x.uid === uid); if (h) { h.marchId = id; h.actedThisMonth = true; } });
    SK.save();
    return m;
  }
  SK.startMarch = startMarch;

  function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy);
    const o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by);
    return (o1 * o2 < 0) && (o3 * o4 < 0);
  }
  function pathCrossesRiver(a, b) {
    const pts = SK.roadPoints(a, b);
    const rivers = (SK.MAPGEO && SK.MAPGEO.rivers) || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      for (let r = 0; r < rivers.length; r++) {
        const flat = rivers[r].p || [];
        for (let k = 0; k + 3 < flat.length; k += 2) {
          if (segCross(ax, ay, bx, by, flat[k], flat[k + 1], flat[k + 2], flat[k + 3])) return true;
        }
      }
    }
    return false;
  }

  function interceptTypeFor(m) {
    const A = SK.CITY[m.origin], B = SK.CITY[m.target];
    if (A && (A.sea || []).indexOf(m.target) >= 0) return 'naval';
    const r = Math.random();
    if (pathCrossesRiver(m.origin, m.target)) return r < 0.6 ? 'ford' : (r < 0.8 ? 'plain' : 'ambush');
    if (B && B.type === 'pass') return r < 0.55 ? 'mountain' : 'ambush';
    if (B && B.type === 'fortress') return r < 0.45 ? 'plain' : 'mountain';
    if (r < 0.36) return 'plain';
    if (r < 0.62) return 'ambush';
    if (r < 0.84) return 'mountain';
    return 'ford';
  }
  SK.interceptTypeFor = interceptTypeFor;

  /* 한 달에 한 사건만 — 도착이 먼저, 없으면 요격. 나머지 행군대는 다음 달로 넘긴다 */
  function stepMarches(s) {
    if (!s.marches || !s.marches.length || s.pendingMarch) return s.pendingMarch;
    for (let i = 0; i < s.marches.length; i++) {
      const m = s.marches[i];
      if (m.left > 0) m.left -= 1;
      if (m.left <= 0) {
        s.pendingMarch = { kind: 'arrive', marchId: m.id };
        break;
      }
      const ts = s.cities[m.target];
      const c = SK.CITY[m.target];
      if (!ts || !c) continue;
      let p = 0.28 + Math.min(0.24, (ts.troops || 0) / 50000) + Math.max(-0.08, Math.min(0.14, ((ts.def || 60) - 65) / 250));
      if (c.type === 'pass' || c.type === 'fortress') p += 0.08;
      p = clamp(p, 0.2, 0.7);
      if (Math.random() < p) {
        const budget = clamp(Math.round((ts.troops || 2000) * 0.24), 1200, 5200);
        const cnt = clamp(4 + Math.floor((ts.troops || 0) / 3200), 4, 6);
        const per = clamp(Math.round(budget / cnt / 100) * 100, 700, 2200);
        m.raiders = per * cnt;
        m.interceptType = interceptTypeFor(m);
        s.pendingMarch = { kind: 'intercept', marchId: m.id };
        break;
      }
    }
    return s.pendingMarch;
  }
  SK.stepMarches = stepMarches;

  function openPendingMarch() {
    const s = SK.state;
    if (!s || !s.pendingMarch) return;
    if (document.querySelector('#modal-root .modal-layer')) return;
    const m = (s.marches || []).find((x) => x.id === s.pendingMarch.marchId);
    if (!m) { s.pendingMarch = null; SK.save(); return; }
    const tc = SK.CITY[m.target], ts = s.cities[m.target];
    const f = SK.factionInfo(ts.owner);
    const troops = marchUnitTroops(m.units);
    if (s.pendingMarch.kind === 'intercept') {
      const itype = m.interceptType || 'plain';
      const idef = SK.BATTLE_TYPES[itype];
      const raiders = m.raiders || 2400;
      SK.modal({
        kicker: `행군 ${m.total - m.left}/${m.total}개월 · ${SK.CITY[m.origin].name} → ${tc.name}`,
        title: `도중 요격 — ${idef.name}`,
        body: `<div class="march-event">
            <div class="me-flag" style="background:${f.color}">${SK.markOf(f)}</div>
            <p>${f.name}의 요격대가 길을 막았습니다. <b>${idef.desc}</b></p>
            <div class="me-nums"><span>우리 병력 <b>${fmt(troops)}</b></span><span>적 요격대 <b>${fmt(raiders)}</b></span></div>
            <p class="me-note">${idef.skill || ''} 승리하면 행군을 이어가고, 패하면 남은 병력으로 본성으로 돌아갑니다.</p>
          </div>`,
        actions: [{ label: '싸운다', primary: true, onClick: () => {
          s.pendingMarch = null;
          SK.save();
          SK.startBattle({ origin: m.origin, targetId: m.target, type: itype, units: m.units,
            intercept: { marchId: m.id, name: `${tc.name} 가는 길`, troops: raiders } });
        } }],
        dismissible: false,
      });
    } else {
      SK.modal({
        kicker: `행군 ${m.total}/${m.total}개월`,
        title: `${tc.name} 성 앞 도착`,
        body: `<div class="march-event">
            <div class="me-flag" style="background:${f.color}">${SK.markOf(f)}</div>
            <p>${m.total}개월 행군 끝에 <b>${tc.name}</b> 성 아래에 닿았습니다.</p>
            <div class="me-nums"><span>도착 병력 <b>${fmt(troops)}</b></span><span>수비병 <b>${fmt(ts.troops)}</b></span></div>
            <p class="me-note">${SK.BATTLE_TYPES[m.type].name} — ${SK.BATTLE_TYPES[m.type].desc}</p>
          </div>`,
        actions: [{ label: `${SK.BATTLE_TYPES[m.type].name} 시작`, primary: true, onClick: () => {
          s.pendingMarch = null;
          s.marches = (s.marches || []).filter((x) => x.id !== m.id);
          SK.save();
          SK.startBattle({ origin: m.origin, targetId: m.target, type: m.type, units: m.units, marchId: m.id });
        } }],
        dismissible: false,
      });
    }
  }
  SK.openPendingMarch = openPendingMarch;

  function deployQuote(pool, picked, s) {
    const lead = (picked || []).map((uid) => s.heroes.find((h) => h.uid === uid)).find((h) => h && SK.quoteOf(h.name, 'deploy'))
      || (pool || []).find((h) => SK.quoteOf(h.name, 'deploy'));
    const lordName = SK.factionInfo(PF()).lord || '조조';
    const q = lead ? SK.quoteOf(lead.name, 'deploy') : (SK.quoteOf(lordName, 'deploy') || SK.quoteOf('조조', 'deploy'));
    if (!q) return '';
    return `<p class="deploy-quote">“${q}” — ${lead ? lead.name : '조조'}</p>`;
  }
  SK.deployQuote = deployQuote;

  function heroPickRow(h, on, cost) {
    return `<div class="hero-pick ${on ? 'on' : ''}" data-uid="${h.uid}">
      <img src="${SK.ptSrc(h.portrait)}" alt="">
      <div class="hp-main"><b>${h.name}</b><span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv}</span></div>
      <div class="hp-stats"><span>무 ${h.wu}</span><span>지 ${h.ji}</span><span>통 ${h.tong}</span></div>
      <div class="hp-step"><button data-d="-1" aria-label="줄이기">−</button><button class="hp-count" type="button" title="직접 입력">${fmt(cost)}</button><button data-d="1" aria-label="늘리기">＋</button></div>
      <span class="hp-check">✓</span>
    </div>`;
  }

  /* ───────────── 다음 달 ───────────── */
  const MONTH_EVENTS = [
    { title: '풍년', hanja: '풍', text: '들녘마다 곡식이 익어 창고가 넘칩니다.',
      apply(s) { const v = 400 + Math.floor(Math.random() * 400); s.food += v; return `군량 +${fmt(v)}`; } },
    { title: '대상인 방문', hanja: '상', text: '서역 대상인이 값진 물건을 두고 갔습니다.',
      apply(s) { const v = 300 + Math.floor(Math.random() * 300); s.gold += v; return `금 +${fmt(v)}`; } },
    { title: '재야의 소문', hanja: '현', text: '재야에 뛰어난 인재가 숨어 있다는 소문이 돕니다.',
      apply(s) { s.talentLuck = 2; return '다음 인재 탐색에 상급 인재 등장'; } },
    { title: '성벽 보수', hanja: '벽', text: '백성들이 스스로 성벽을 손봤습니다.',
      apply(s) { let n = 0; SK.CITY_LIST.forEach((c) => { const st = s.cities[c.id]; if (st.owner === PF() && st.def < 100) { st.def = clamp(st.def + 4, 0, 100); n += 1; } }); return n ? '전 거점 성벽 +4' : '성벽이 이미 완벽'; } },
    { title: '유민 유입', hanja: '민', text: '전란을 피해 백성이 몰려와 병사로 나섰습니다.',
      apply(s) { SK.CITY_LIST.forEach((c) => { const st = s.cities[c.id]; if (st.owner === PF()) st.troops = clamp(st.troops + 400, 0, 20000); }); return '전 거점 수비병 +400'; } },
    { title: '마을 축제', hanja: '락', text: '마을마다 풍악이 울리고 민심이 흡족합니다.',
      apply(s) { SK.CITY_LIST.forEach((c) => { const st = s.cities[c.id]; if (st.owner === PF()) st.loyalty = clamp(st.loyalty + 3, 0, 100); }); return '전 거점 민심 +3'; } },
  ];

  function rollMonthEvent(s) {
    const season = seasonOf(s.month);
    const list = SK.DOMESTIC_EVENTS || [];
    if (list.length) {
      if (Math.random() > 0.72) return null;
      const pool = list.filter((e) => e.season === season || e.season === '상시');
      if (!pool.length) return null;
      const good = pool.filter((e) => e.type !== '위기');
      const bad = pool.filter((e) => e.type === '위기');
      const wantBad = Math.random() < 0.35;
      const bag = wantBad && bad.length ? bad : (good.length ? good : pool);
      const ev = bag[Math.floor(Math.random() * bag.length)];
      return {
        title: ev.title,
        hanja: ev.type === '위기' ? '재' : '길',
        text: ev.text,
        gain: applyDomesticEvent(ev, s),
        type: ev.type || '긍정',
        season: ev.season === '상시' ? '상시' : `${ev.season} 이벤트`,
      };
    }
    // 폴백 — 이벤트 데이터를 불러오지 못했을 때
    if (Math.random() > 0.6) return null;
    const ev = MONTH_EVENTS[Math.floor(Math.random() * MONTH_EVENTS.length)];
    let gain = '';
    try { gain = ev.apply(s) || ''; } catch (e) { gain = ''; }
    return { title: ev.title, hanja: ev.hanja, text: ev.text, gain, type: '긍정', season: '상시' };
  }

  const SEASONS = ['봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울', '겨울', '겨울'];
  function seasonOf(month) { return SEASONS[((month % 12) + 12) % 12]; }

  function applyDomesticEvent(ev, s) {
    const eff = ev.effect || {};
    const cities = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF());
    const parts = [];
    const sign = (v) => (v > 0 ? '+' : '') + fmt(v);
    let gold = 0, food = 0, troops = 0, morale = 0;
    if (eff.gold) { gold = Math.round(eff.gold); s.gold = Math.max(0, s.gold + gold); }
    if (eff.food) { food = Math.round(eff.food); s.food = Math.max(0, s.food + food); }
    if (eff.troops && cities.length) {
      const per = Math.round(eff.troops / cities.length);
      cities.forEach((c) => { const st = s.cities[c.id]; st.troops = clamp(st.troops + per, 0, 20000); });
      troops = per * cities.length;
    }
    if (eff.morale && cities.length) {
      morale = Math.round(eff.morale);
      cities.forEach((c) => { const st = s.cities[c.id]; st.loyalty = clamp(st.loyalty + morale, 0, 100); });
    }
    if (gold) parts.push(`금 ${sign(gold)}`);
    if (food) parts.push(`군량 ${sign(food)}`);
    if (troops) parts.push(`수비병 ${sign(troops)}`);
    if (morale) parts.push(`민심 ${sign(morale)}`);
    return parts.join(' · ');
  }

  /* ───────────── 다음 달 — 어터치 방지 확인 + 월 전환 배너 (v5.0.1) ───────────── */
  function pendingCount() {
    const s = SK.state;
    if (!s) return 0;
    let n = 0;
    SK.CITY_LIST.forEach((c) => {
      const cs = s.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      const slots = cs.slots || [];
      s.heroes.forEach((h) => {
        if (h.city !== c.id) return;
        if (h.actedThisMonth) return;
        if (slots.some((sl) => sl.uid === h.uid)) return;
        n += 1;
      });
    });
    return n;
  }
  SK.pendingCount = pendingCount;

  function showMonthBanner(text) {
    const el = $('#month-banner');
    if (!el) return;
    const span = el.querySelector('span');
    if (span) span.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
  }
  SK.showMonthBanner = showMonthBanner;

  function confirmNextMonth() {
    const s = SK.state;
    if (!s) return;
    const n = pendingCount();
    SK.modal({
      kicker: SK.dateLabel(s.eraYear || (195 + s.year), s.month),
      title: '다음 달로 넘어갈까요',
      body: `<div class="next-month-confirm">
        <p class="nm-main">${n ? `아직 대기 중인 장수가 <b>${n}명</b> 있습니다.<br>다음 달로 넘어가시겠습니까?` : '모든 장수가 이번 달 일을 마쳤습니다.<br>다음 달로 넘어가시겠습니까?'}</p>
        <p class="nm-sub">넘어가면 달마다 세수·군량과 건설 결산이 들어오고, 대기 장수의 행동이 새로 생깁니다.</p>
      </div>`,
      actions: [
        { label: '조금 더 둘러본다' },
        { label: '다음 달 ▶', primary: true, onClick: () => advanceMonth() },
      ],
    });
  }
  SK.confirmNextMonth = confirmNextMonth;

  function advanceMonth() {
    const s = SK.state;
    const prevYear = s.eraYear || (195 + s.year);
    s.month += 1;
    if (s.month >= 12) { s.month = 0; s.year += 1; if (s.eraYear) s.eraYear += 1; }
    s.turn += 1;
    // 달이 바뀌기 전에 태수들이 남은 행동으로 내정을 마친다 (본성·태수 없는 성 제외)
    const autoLog = runAutoDomestic(s);
    let gold = 0, food = 0, pop = 0, popGrowth = 0, unrest = 0;
    const gPct = 1 + (SK.techPct ? SK.techPct('goldPct') : 0) / 100;
    const fPct = 1 + (SK.techPct ? SK.techPct('foodPct') : 0) / 100;
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (st.owner !== PF()) return;
      const base = econMul(c);
      const morale = st.loyalty;
      // 민심이 좋으면 세수와 인구가 오르고, 나쁘면 줄고 소란이 난다
      const moraleMul = morale >= 70 ? 1.15 : morale < 40 ? 0.85 : 1;
      gold += Math.round((c.gold / 22 + morale * 1.1) * base * moraleMul * (0.85 + st.comm / 250) * gPct);
      food += Math.round((c.food / 30 + morale * 0.95) * base * (0.85 + st.agri / 250) * fPct);
      const growing = Math.round(st.pop * (0.004 + st.agri / 100 * 0.010 + (morale - 50) / 100 * 0.006 + (SK.techPct ? SK.techPct('popPct') : 0) / 1000));
      if (morale >= 70) popGrowth += Math.round(st.pop * 0.004);
      if (morale < 40) {
        unrest += 1;
        st.pop = Math.max(6000, st.pop - Math.round(st.pop * 0.004));
        st.loyalty = clamp(st.loyalty - 1, 0, 100);
      } else {
        st.pop = Math.max(6000, st.pop + growing);
      }
      pop += Math.round(160 * base);
      st.pop = Math.min(cityPopCap(c), st.pop);
      if (st.def < 100 && Math.random() < 0.25) st.def = clamp(st.def + 1, 0, 100);
      st.loyalty = clamp(st.loyalty + (Math.random() < 0.5 ? 1 : -1), 0, 100);
      st.troops = clamp(st.troops + 160, 0, cityCap(st));
      // 엉망인 성은 조금씩 스스로 회복한다
      if (st.agri < 45 && Math.random() < 0.3) st.agri = clamp(st.agri + 1, 0, 100);
      if (st.comm < 45 && Math.random() < 0.3) st.comm = clamp(st.comm + 1, 0, 100);
    });
    s.gold += gold; s.food += food; s.fame += 3;
    const rank = SK.rankFor(s.fame);
    const salary = rank.salaryGold || 0;
    s.gold += salary;
    // 적 세력도 계절마다 병력을 키운다
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (st.owner === PF() || st.owner === 'neutral') return;
      st.troops = Math.min(cityCap(st), Math.round(st.troops * 1.04 + 120));
      st.pop = Math.round(st.pop * 1.003);
      if (st.def < 95 && Math.random() < 0.4) st.def = Math.min(95, st.def + 1);
    });
    s.heroes.forEach((h) => {
      h.actedThisMonth = false;
      if (s.cities[h.city] && s.cities[h.city].owner === PF()) {
        h.hp = maxHpOf(h.cls, h.lv);
        h.mp = maxMpOf(h.cls, h.lv);
      }
    });
    // v5 — 건물 담당 장수는 이번 달 건물 일을 한 것으로 치고, 건물이 결산을 내놓는다
    applyDuty(s);
    const slotLog = runSlots(s);
    gold += slotLog.reduce((a, x) => a + (x.gold || 0), 0);
    food += slotLog.reduce((a, x) => a + (x.food || 0), 0);
    // 해가 바뀌면 새로 성년이 된 명장이 주점에 나타난다
    let debuted = [];
    if (s.month === 0 && (s.eraYear || 0) !== prevYear) debuted = SK.refreshDebut(s);
    cityActorUid = null;
    const ev = rollMonthEvent(s);
    // 역사 연표 이벤트
    const sc = s.scenario ? SK.histById(s.scenario) : null;
    const tl = sc ? SK.timelineFor(sc, s.eraYear, s.month + 1) : null;
    let tlEv = null;
    if (tl) {
      s.timelineSeen = s.timelineSeen || [];
      if (s.timelineSeen.indexOf(tl.title) < 0) { s.timelineSeen.push(tl.title); tlEv = tl; }
    }
    /* v5.3 — 행군대가 한 달씩 전진하고, 도착·요격 사건을 예약한다 */
    stepMarches(s);
    SK.save();
    SK.refreshHud();
    if (window.SKMap) SKMap.refresh();
    /* v5.0.3 — 성 화면에서 [다음 달]을 누르면 열려 있던 성 화면도 새 달로 다시 그린다.
       (예전에는 대기 0명·이번 달 완료 표시가 그대로 남아 있었다) */
    const cityScr = document.getElementById('screen-city');
    const inCity = cityScr && cityScr.classList.contains('active');
    if (inCity && s.lastCity && s.cities[s.lastCity] && s.cities[s.lastCity].owner === PF()) {
      SK.openCity(s.lastCity);
    }
    SK.sfx.play('month');
    showMonthBanner(SK.dateLabel(s.eraYear || (195 + s.year), s.month));
    SK.modal({
      delay: 900,
      kicker: SK.dateLabel(s.eraYear || (195 + s.year), s.month),
      title: '월정산',
      body: `<div class="month-report">
        <div class="mr-row"><span>세입</span><b class="plus">금 +${fmt(gold)}</b></div>
        <div class="mr-row"><span>군량</span><b class="plus">미 +${fmt(food)}</b></div>
        <div class="mr-row"><span>징집</span><b>병 +${fmt(pop)}</b></div>
        <div class="mr-row"><span>봉급 · ${rank.title}</span><b class="plus">금 +${fmt(salary)}</b></div>
        <div class="mr-row"><span>인구</span><b class="${popGrowth ? 'plus' : ''}">${popGrowth ? `인구 성장 +${fmt(popGrowth)}` : '인구 유지'}${unrest ? ` · 민심 흔들리는 성 ${unrest}곳` : ''}</b></div>
        <div class="mr-row"><span>명성</span><b>+3</b></div>
        ${autoLog.length ? `<div class="mr-auto">
          <p class="mr-auto-title">태수 내정 보고</p>
          ${autoLog.map((l) => `<div class="mr-auto-row"><b>${l.city} ${l.gov}</b><span>${l.acts.map((a) => a.short).join(' · ')}</span></div>`).join('')}
        </div>` : ''}
        ${ev ? `<div class="mr-event ${ev.type === '위기' ? 'crisis' : ''}"><span class="me-seal">${ev.hanja}</span>
          <div class="me-main"><b>${ev.title} <em class="me-season">${ev.type || ''} · ${ev.season || ''}</em></b><span>${ev.text}</span><em>${ev.gain}</em></div></div>` : ''}
        ${slotLog.length ? `<div class="mr-auto"><p class="mr-auto-title">내성 시설 수입</p>
          ${slotLog.slice(0, 6).map((l) => `<div class="mr-auto-row"><b>${l.city}</b><span>${[l.gold ? `금 +${fmt(l.gold)}` : '', l.food ? `군량 +${fmt(l.food)}` : '', l.troops ? `병력 +${fmt(l.troops)}` : ''].filter(Boolean).join(' · ')}</span></div>`).join('')}</div>` : ''}
        ${debuted.length ? `<div class="mr-event"><span class="me-seal">영</span><div class="me-main"><b>새 명장이 세상에 나왔습니다</b><span>${debuted.slice(0, 6).map((g) => g.name).join(' · ')}${debuted.length > 6 ? ' 외' : ''} — 각지 주점에 소문이 돕니다.</span></div></div>` : ''}
        <p class="mr-note">주둔 장수의 체력이 회복되고, 이번 달 행동력이 모두 돌아왔습니다. 태수가 앉은 성은 달이 바뀔 때 대기 장수로 내정을 마칩니다(본성 제외). 건물 담당 장수는 건물 일을 맡은 것으로 칩니다.</p>
      </div>`,
      actions: [{ label: '계속', primary: true, onClick: () => {
        const go = () => { if (s.pendingMarch) setTimeout(openPendingMarch, 280); };
        if (tlEv) setTimeout(() => showTimelineCard(tlEv, false, go), 220);
        else setTimeout(go, 260);
      } }],
    });
  }

  /* ───────────── 메뉴 ───────────── */
  function openMenu() {
    const m = SK.modal({
      kicker: '군령',
      title: '메뉴',
      body: `<div class="menu-list">
        <button data-m="roster">장수 명부 · 보물 · 배치</button>
        <button data-m="help">조작법 보기</button>
        <button data-m="save">지금 저장</button>
        <button data-m="reset">처음부터 시작</button>
      </div>`,
      actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.m;
        m.close();
        if (k === 'roster') SK.openRoster();
        if (k === 'help') SK.showHelp();
        if (k === 'save') { SK.save(); SK.toast('저장했습니다.'); }
        if (k === 'reset') {
          SK.modal({ title: '처음부터 시작할까요?', body: '<p class="modal-p">저장된 진행이 모두 사라집니다.</p>', actions: [
            { label: '취소' }, { label: '새로 시작', primary: true, onClick: () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} startGame(true); } },
          ] });
        }
      };
    });
  }

  SK.showHelp = function () {
    SK.modal({
      kicker: '조작법',
      title: '이렇게 싸운다',
      body: `<div class="help-body">
        <div class="help-item"><b>지도</b><p>두 손가락으로 확대·축소하고, 한 손가락으로 끌어 이동합니다. 우리 성을 누르면 내정, 적성을 누르면 공격 정보가 열립니다. 아래 [내 본성 ▶]을 누르면 언제든 내 수도로 돌아갑니다.</p></div>
        <div class="help-item"><b>태수·군사와 자동 내정</b><p>관아에서 태수(정치·통솔)와 군사(지력·매력)를 앉힙니다. 태수가 앉은 성은 [다음 달]을 누를 때 대기 장수로 개간·징병·보수·민심·훈련을 스스로 마치고 월정산에 보고합니다. 본성과 태수가 없는 성은 자동으로 움직이지 않으며, 관아에서 자동 내정을 끄거나 언제든 직접 지시할 수 있습니다.</p></div>
        <div class="help-item"><b>내성 시설과 담당 장수</b><p>성 안의 공터에 시장·농원·병영·연병장·순찰소·성벽·연구소를 직접 지을 수 있습니다(소도시 5칸 · 대도시 8칸 · 관문 2칸 · 요새 3칸). 담당 장수가 없어도 효과의 절반은 돌고, 정치·통솔·매력이 높은 장수를 앉히면 100~150%까지 오릅니다. 건전을 눌러 Lv.1→5로 증축하면 외형과 효과가 함께 자랍니다.</p></div>
        <div class="help-item"><b>장수는 한 달에 한 번</b><p>장수는 <b>건물 담당</b>, 아니면 직접 명령(탐색·등용·수송·계략·연구·출진) 중 하나를 합니다. 담당을 맡은 장수는 매달 자동으로 건물 효과를 내므로, 급히 출진에 쓰고 싶으면 그 건물에서 담당을 해제하세요. 행동력 숫자는 없앴고 장수 카드에 <b>건물 담당 / 대기 / 이번 달 완료</b>로만 표시됩니다.</p></div>
        <div class="help-item"><b>인사·탐색</b><p>주점에서 재야 인재를 등용하고, [탐색]은 <b>금이 들지 않고</b> 장수의 그달 행동만 씁니다. 탐색에서는 보물·은거 인재·금·군량·의용병 합류·산적 퇴치·맹수 사냥·일기토가 고루 나옵니다. 태수·군사는 관아에서 언제든 바꿉니다.</p></div>
        <div class="help-item"><b>외교·계략</b><p>정찰(금 45)로 3~4개월 적성 내부를 보고, 이간계(금 100)·유언비어(금 80)로 적의 병력·성벽·민심을 깎고, 화친(금 200)으로 6개월 휴전을 청합니다.</p></div>
        <div class="help-item"><b>기술 연구</b><p>군사·치안·경제·개발·정무·계략 6계열 24종입니다. 앞 단계를 먼저 연구하면 다음이 열리고, 공격·방어·세수·군량·징병·성벽 효과가 실제 전투와 내정에 반영됩니다.</p></div>
        <div class="help-item"><b>명성과 관작</b><p>지도 위 관작 표식(현령·태수·자사…)을 누르면 승진 진행도가 열립니다. 명성은 달이 바뀔 때, 성을 함락할 때, 인물을 등용할 때 오르고, 관작이 오르면 매달 봉급과 거느릴 수 있는 병력이 늘어납니다.</p></div>
        <div class="help-item"><b>미정찰 적성</b><p>첩자가 닿지 않은 성은 병력·성벽·민심·장수가 <b>? (미정찰)</b>로 보입니다. 도시 팝업의 [정찰 보내기]나 외교·계략의 [정찰]로 3~4개월 동안 성안을 살필 수 있습니다.</p></div>
        <div class="help-item"><b>인구와 징병</b><p>징병은 그 성의 인구에서 병사를 빼옵니다. 주둔병은 인구의 30%를 넘을 수 없고, 징병하면 민심이 내려갑니다(매력이 높으면 덜 내려갑니다). 민심이 70 이상이면 세수와 인구가 더 늘고, 40 아래면 줄어듭니다.</p></div>
        <div class="help-item"><b>군사 조언</b><p>관아나 행동력 줄의 [군사] 버튼으로 군사를 임명하면, 그 성의 민심·병력·성벽·재정과 이웃 적성·주점 인재를 읽어 지금 필요한 일을 조언합니다. 조언은 행동력을 쓰지 않고, '조언대로 진행'을 눌러야 실행됩니다. 대기 장수에게 남은 내정을 통째로 맡기려면 관아의 [대기 장수 일괄 내정]을 쓰십시오.</p></div>
        <div class="help-item"><b>장수 명부</b><p>메뉴나 도시 장수 줄의 [전체]로 장수·보물·배치를 한눈에 봅니다. 머리글을 누르면 정렬됩니다.</p></div>
        <div class="help-item"><b>전장 이동</b><p>부대를 누르면 파란 타일이 나타납니다. 타일을 누르면 부대가 한 칸씩 걸어서 이동하고, 붉은 적을 눌러 공격합니다. 화면을 끌면 18×18 전장을 넓게 볼 수 있습니다.</p></div>
        <div class="help-item"><b>책략과 군량</b><p>[책략]으로 병과별 기술을 쓰고, [군량]으로 HP를 회복합니다. [대기] 후 다음 부대로 넘어갑니다.</p></div>
        <div class="help-item"><b>소리</b><p>상단 ♪ 버튼으로 효과음을 끄고 켜고 할 수 있습니다. 첫 터치 때 소리가 준비됩니다.</p></div>
        <div class="help-item"><b>승리</b><p>적을 모두 쓰러뜨리면 성을 차지합니다. 성문·다리·숲의 지형 보정을 활용하세요.</p></div>
      </div>`,
      actions: [{ label: '알겠다', primary: true }],
    });
  };

  /* ───────────── 이벤트 연결 ───────────── */
  function bind() {
    const has = SK.hasSave();
    $('#btn-continue').hidden = !has;
    $('#btn-start').onclick = () => startGame(true);
    $('#btn-continue').onclick = () => { if (SK.load()) startGame(false); else startGame(true); };
    $('#btn-next-month').onclick = confirmNextMonth;
    const capitalBtn = $('#btn-capital');
    if (capitalBtn) capitalBtn.onclick = () => {
      const s = SK.state;
      if (!s) return;
      const owned = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF());
      const capOk = s.playerCapital && s.cities[s.playerCapital] && s.cities[s.playerCapital].owner === PF();
      const id = capOk ? s.playerCapital : (owned[0] && owned[0].id);
      if (!id) { SK.toast('아직 거느린 성이 없습니다.'); return; }
      SK.closeCitySheet();
      SK.openCity(id);
    };
    $('#btn-map-menu').onclick = openMenu;
    $('#btn-city-back').onclick = () => SK.showMap();
    $('#btn-battle-help').onclick = () => SK.showHelp();
    $$('.city-commands .cmd[data-grp]').forEach((b) => { b.onclick = () => openGroupMenu(b.dataset.grp); });
    const cn = $('#btn-city-next');
    if (cn) cn.onclick = () => confirmNextMonth();
    const cmap = $('#btn-city-map');
    if (cmap) cmap.onclick = () => { SK.closeCitySheet(); SK.showMap(); };
    const rk = $('#map-rank');
    if (rk) { rk.style.cursor = 'pointer'; rk.onclick = () => openRank(); }
    $('#btn-retreat').onclick = () => {
      SK.modal({ title: '후퇴할까요?', body: '<p class="modal-p">전투에서 물러나면 이번 공격은 실패합니다.</p>', actions: [
        { label: '계속 싸운다' }, { label: '후퇴', onClick: () => { if (window.SKBattle) SKBattle.retreat(); } },
      ] });
    };
  }

  /* expose */
  SK.startGame = startGame;
  SK.advanceMonth = advanceMonth;
  SK.openMenu = openMenu;
  SK.doCommand = doCommand;
  SK.newState = newState;

  document.addEventListener('DOMContentLoaded', () => {
    loadCities();
    loadScenarios();
    loadClasses();
    loadEvents();
    loadGenerals();
    loadBonds();
    loadDomesticEvents();
    loadQuotesAndRanks();
    loadTopArt();
    loadTreasures();
    loadTechTree();
    loadPassives();
    bind();
    if (hasSaveOnBoot()) $('#btn-continue').hidden = false;
  });
  function hasSaveOnBoot() { return SK.hasSave(); }

  // 자동 저장
  setInterval(() => { if (SK.state && document.querySelector('#screen-map.active, #screen-city.active')) SK.save(); }, 8000);
})();
