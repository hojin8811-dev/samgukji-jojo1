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

  /* 징병 상한 — 인구의 30% */
  function cityCap(cs) { return Math.max(1200, Math.floor((cs.pop || 10000) * 0.3)); }
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
  function basePop(c) {
    const t = { capital: 52000, town: 33000, pass: 14000, fortress: 15000 }[c.type] || 28000;
    return Math.round(t * (0.86 + (hashStr(c.id) % 26) / 100));
  }
  function cityPopCap(c) {
    return Math.round(({ capital: 90000, town: 64000, pass: 26000, fortress: 28000 }[c.type] || 60000));
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
        troops: Math.min(c.baseTroops, Math.round(base * 0.3)),
        def: Math.min(100, c.defense + (c.type === 'pass' ? 8 : c.type === 'fortress' ? 6 : 0)),
        loyalty: 62 + (h % 12),
        pop: base,
        agri: ({ capital: 34, town: 25, pass: 19, fortress: 21 }[c.type] || 24) + (h % 9),
        comm: ({ capital: 31, town: 23, pass: 17, fortress: 19 }[c.type] || 22) + ((h >> 3) % 10),
        gold: 0, food: 0, genIds: [], advisor: null,
      };
    });
    const st = {
      version: 5, year: 1, month: 0, gold: 0, food: 0, fame: 0, turn: 1,
      cities, heroes: [], citiesOwned: 0, log: [], lastCity: 'xuchang', treasures: [],
      playerFaction: factionId || 'caocao', factions: {}, scenario: sc ? Number(sc.id) : null,
      eraYear: sc ? Number(sc.year) : 200, timelineSeen: [], talentLuck: 0, talentsVersion: 2,
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
    const ownedIds = SK.CITY_LIST.filter((c) => st.cities[c.id].owner === st.playerFaction).map((c) => c.id);
    const f = st.factions[st.playerFaction] || {};
    const capital = (f.capital && ownedIds.indexOf(f.capital) >= 0) ? f.capital : (ownedIds[0] || 'xuchang');
    st.playerCapital = capital;
    st.lastCity = capital;
    const playerCities = SK.CITY_LIST.filter((c) => st.cities[c.id].owner === st.playerFaction);
    st.gold = Math.round(playerCities.reduce((a, c) => a + c.gold, 0) / 9) || 3000;
    st.food = Math.round(playerCities.reduce((a, c) => a + c.food, 0) / 12) || 4000;
    seedRoster(st, f, capital, ownedIds);
    giveStarters(st);
    assignGarrisons(st);
    seedTalents(st);
    return st;
  }

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
    names.forEach((nm, i) => {
      let cityId = capital;
      if (i >= 4 && towns.length) cityId = towns[(i - 4) % towns.length];
      const h = makeHero(nm, cityId, 1);
      if (h) st.heroes.push(h);
    });
    // 수도에 장수가 하나도 없으면 세력 장수 한 명을 불러온다
    if (!st.heroes.some((h) => h.city === capital)) {
      const spare = SK.GENERALS.find((g) => !st.heroes.some((h) => h.genId === g.id) && (g.faction === '군웅' || !g.faction));
      if (spare) { const h = makeHero(spare.name, capital, 1); if (h) st.heroes.push(h); }
    }
  }

  function giveStarters(st) {
    if (!SK.TREASURES.length) return;
    const lord = (st.factions[st.playerFaction] || {}).lord;
    const hero = st.heroes.find((h) => h.name === lord) || st.heroes[0];
    if (!hero) return;
    const sword = SK.TREASURES.find((t) => t.name === '청강검') || SK.TREASURES.find((t) => t.type === '무기' && t.grade === '희귀');
    if (sword) hero.equip.weapon = sword.id;
    const armor = SK.TREASURES.find((t) => t.type === '방어구' && t.grade === '희귀');
    const second = st.heroes.find((h) => h !== hero);
    if (second && armor) second.equip.armor = armor.id;
    st.treasures = [];
  }

  /* 적성 수비 장수 — 그 성의 세력 인물로만 */
  function assignGarrisons(st) {
    if (!SK.GENERALS.length) return;
    const used = new Set();
    st.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
    const rank = { S: 0, A: 1, B: 2, C: 3 };
    const byFaction = {};
    Object.keys(st.factions).forEach((k) => {
      const f = st.factions[k];
      const pool = ((f && f.generals) || []).map((n) => SK.GEN_BY_NAME[n]).filter(Boolean);
      pool.sort((a, b) => (rank[a.tier] - rank[b.tier]) || (b.war + b.intel) - (a.war + a.intel));
      byFaction[k] = pool;
    });
    // 수도를 먼저 채워 우두머리가 수도에 서게 한다
    const order = SK.CITY_LIST.slice().sort((a, b) => (a.type === 'capital' ? -1 : 0) - (b.type === 'capital' ? -1 : 0));
    order.forEach((c) => {
      const cs = st.cities[c.id];
      if (cs.owner === st.playerFaction) return;
      const pool = byFaction[cs.owner] || [];
      const want = c.type === 'capital' ? 4 : 3;
      const picks = [];
      for (let i = 0; i < pool.length && picks.length < want; i++) {
        const g = pool[i];
        if (used.has(g.id)) continue;
        picks.push(g.id); used.add(g.id);
      }
      // 도시 데이터의 태수도 같은 세력이면 앞에 세운다
      const gov = SK.GEN_BY_NAME[c.governor];
      if (gov && !picks.includes(gov.id) && !used.has(gov.id) && picks.length < want + 1) {
        picks.unshift(gov.id); used.add(gov.id);
      }
      cs.genIds = picks.slice(0, want + 1);
    });
  }

  /* 재야 인재 — 성마다 고정된 지역 인재 풀 (전국 풀에서 텔레포트하지 않는다)
     v4.1: 보통(B·C급)이 주류, A급은 가끔, S급은 다섯 성에 하나꼴로만 숨어 있게 나눈다. */
  function seedTalents(st) {
    const used = new Set();
    st.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
    SK.CITY_LIST.forEach((c) => (st.cities[c.id].genIds || []).forEach((id) => used.add(id)));
    const pool = SK.GENERALS.filter((g) => !used.has(g.id) && g.name !== (st.factions[st.playerFaction] || {}).lord);
    const buckets = { S: [], A: [], B: [], C: [] };
    pool.forEach((g) => { (buckets[g.tier] || buckets.C).push(g); });
    ['S', 'A', 'B', 'C'].forEach((t) => buckets[t].sort((a, b) => SK.genScore(b) - SK.genScore(a) || a.id - b.id));
    // 한 성이 2~4명씩 가져가도록 B·C를 촘촘히, A를 드문드문 섞은 순서
    const MIX = ['C', 'B', 'C', 'C', 'B', 'A', 'C', 'B', 'C', 'C', 'B', 'A', 'C', 'C', 'B', 'B', 'C', 'A', 'B', 'C',
      'C', 'B', 'C', 'C', 'B'];
    const ordered = [];
    let guard = 0;
    while (guard++ < 200) {
      let moved = 0;
      MIX.forEach((t) => { const b = buckets[t]; if (b && b.length) { ordered.push(b.shift()); moved += 1; } });
      if (!moved) break;
    }
    // 남은 인재는 뒤에 붙인다 (S는 여기서 따로 나눠 준다)
    const spare = buckets.C.concat(buckets.B, buckets.A);
    const sPool = buckets.S;
    SK.CITY_LIST.forEach((c, ci) => {
      const cs = st.cities[c.id];
      cs.talents = cs.talents || [];
      if (cs.talents.length) return;
      const h = hashStr(c.id);
      const n = 2 + (h % 3);
      const take = [];
      for (let k = 0; k < n; k++) {
        if (!ordered.length && spare.length) ordered.push(spare.shift());
        if (!ordered.length) break;
        const idx = (ci * 3 + k * 29 + (h % 7)) % ordered.length;
        const g = ordered.splice(idx, 1)[0];
        if (!g || used.has(g.id)) { k -= 1; continue; }
        take.push(g.id); used.add(g.id);
      }
      // S급은 다섯 성에 한 곳꼴 — 만나면 확실히 사건이 된다
      if (sPool.length && h % 5 === 0) {
        const g = sPool.shift();
        if (g && !used.has(g.id)) { take.unshift(g.id); used.add(g.id); }
      }
      cs.talents = take;
    });
  }

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
      SK.state = s;
      // v4.1 인재 분포로 옮겨 온다 (예전 저장은 고급 인재만 남아 있었다)
      if (s.talentsVersion !== 2 && SK.GENERALS.length) {
        s.talentsVersion = 2;
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
  const SCREENS = ['screen-title', 'screen-map', 'screen-city', 'screen-battle'];
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
    return `<button class="fac-card" data-fid="${f.id}" style="--fc:${f.color}">
      <span class="fc-seal">${SK.markOf(f)}</span>
      <div class="fc-main">
        <b>${f.name}</b>
        <span>${f.lord} · ${SK.typeName((SK.CITY[f.capital] || {}).type || 'capital')}</span>
        <em>수도 ${f.capitalName} · 거점 ${n} · 장수 ${(f.generals || []).length}</em>
      </div>
      <span class="fc-go">▸</span>
    </button>`;
  }

  function openScenarioPicker() {
    if (!SK.HIST.length) { beginScenario(null, null); return; }
    const cards = SK.HIST.map((sc) => {
      const facs = sc.factions || [];
      return `<button class="sc-card" data-sc="${sc.id}">
        <span class="sc-year">${sc.year}</span>
        <div class="sc-main"><b>${sc.title}</b><p>${(sc.historyNote || '').slice(0, 64)}…</p>
          <span class="sc-line">${facs.length}개 세력 · ${facs.slice(0, 5).map((f) => f.name).join(' · ')}${facs.length > 5 ? ' 외' : ''}</span></div>
      </button>`;
    }).join('');
    const m = SK.modal({
      kicker: '새로 시작',
      title: '어느 난세를 살아갈까',
      body: `<p class="talent-note">역사 시나리오를 고르면, 다음 화면에서 원하는 세력을 직접 선택할 수 있습니다.</p><div class="sc-list">${cards}</div>`,
      wide: true,
      actions: [{ label: '취소' }],
      dismissible: true,
    });
    m.el.querySelectorAll('.sc-card').forEach((b) => {
      b.onclick = () => {
        const sc = SK.HIST.find((x) => Number(x.id) === Number(b.dataset.sc));
        m.close();
        if (sc) openFactionPicker(sc);
      };
    });
  }

  function openFactionPicker(sc) {
    const res = SK.resolveScenario(sc);
    const facs = Object.keys(res ? res.factions : {}).filter((k) => k !== 'neutral' && res.factions[k].cities.length)
      .map((k) => res.factions[k])
      .sort((a, b) => b.cities.length - a.cities.length);
    const cards = facs.map((f) => factionCard({
      id: f.id, name: f.name, lord: f.lord, color: f.color, mark: SK.markOf(f),
      capital: f.capital, capitalName: (SK.CITY[f.capital] || {}).name || '-',
      cities: f.cities, generals: f.generals,
    })).join('');
    const m = SK.modal({
      kicker: `${sc.year}년 · ${sc.title}`,
      title: '어느 세력으로 일어설까',
      body: `<p class="talent-note">${(sc.historyNote || '').slice(0, 150)}</p>
        <div class="fac-list">${cards}</div>`,
      wide: true,
      actions: [{ label: '돌아가기', onClick: () => setTimeout(openScenarioPicker, 60) }],
      dismissible: true,
    });
    m.el.querySelectorAll('.fac-card').forEach((b) => {
      b.onclick = () => {
        m.close();
        beginScenario(sc, b.dataset.fid);
      };
    });
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
  function showTimelineCard(ev, intro) {
    if (!ev) return;
    SK.modal({
      kicker: intro ? '난세의 기록' : '역사의 흐름',
      title: ev.title,
      body: `<div class="timeline-card">
        <span class="tl-seal">사</span>
        <p>${ev.text}</p>
        <p class="tl-date">${ev.year}년 ${ev.month}월</p>
      </div>`,
      actions: [{ label: '기억해 두겠다', primary: true }],
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
  SK.openCitySheet = function (id) {
    const c = CITY[id];
    const st = SK.state.cities[id];
    const f = SK.factionInfo(st.owner);
    const mine = st.owner === PF();
    const ownGens = SK.state.heroes.filter((h) => h.city === id);
    const defGens = mine ? [] : (st.genIds || []).map((gid) => SK.GEN_BY_ID[gid]).filter(Boolean);
    const generals = mine ? ownGens : defGens;
    const canAttack = !mine && SK.allNeighbors(id).some((n) => SK.state.cities[n].owner === PF());
    const sheet = $('#city-sheet');
    sheet.hidden = false;
    sheet.innerHTML = `
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <span class="faction-badge" style="--fc:${f.color}">${SK.markOf(f)}</span>
        <div class="sheet-title"><h3>${c.name}</h3>
          <p>${f.name} · ${typeName(c.type)} · ${c.region}</p></div>
        <button class="sheet-close" aria-label="닫기">✕</button>
      </div>
      <div class="sheet-stats">
        <div><span>수비병</span><b>${fmt(st.troops)}</b></div>
        <div><span>성벽</span><b>${st.def}</b></div>
        <div><span>민심</span><b>${st.loyalty}</b></div>
        <div><span>장수</span><b>${generals.length}</b></div>
      </div>
      ${generals.length ? `<div class="sheet-gens">${generals.slice(0, 6).map((g) => `<div class="mini-gen"><img src="${SK.ptSrc(g.portrait || SK.genPortrait(g))}" alt=""><span>${g.name}</span></div>`).join('')}</div>` : ''}
      <div class="sheet-actions">
        ${mine ? `<button class="btn btn-primary" data-a="enter">입성 · 내정</button>` :
          canAttack ? `<button class="btn btn-primary danger" data-a="attack">출진 · 공격</button>` :
            `<button class="btn btn-paper" data-a="far">원정 불가</button>`}
        <button class="btn btn-paper" data-a="close">닫기</button>
      </div>`;
    sheet.querySelector('.sheet-close').onclick = () => (sheet.hidden = true);
    sheet.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'enter') { sheet.hidden = true; SK.openCity(id); }
        else if (a === 'attack') {
          sheet.hidden = true;
          const from = SK.allNeighbors(id).find((n) => SK.state.cities[n].owner === PF()) || SK.state.lastCity;
          SK.openSortiePrep(id, from);
        }
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
  const HOTSPOTS = [
    { key: 'office', name: '관아', x: 50, y: 22 },
    { key: 'farm', name: '농장', x: 18, y: 44 },
    { key: 'trade', name: '시장', x: 50, y: 52 },
    { key: 'barracks', name: '병영', x: 82, y: 45 },
    { key: 'talent', name: '주점', x: 74, y: 30 },
    { key: 'repair', name: '성벽', x: 50, y: 80 },
  ];

  SK.openCity = function (id) {
    const s = SK.state;
    const c = CITY[id];
    const st = s.cities[id];
    if (st.owner !== PF()) { SK.openCitySheet(id); return; }
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
    $('#city-weather').textContent = `${monthWeather(s)} · ${st.loyalty > 75 ? '민심 안정' : st.loyalty > 50 ? '민심 보통' : '민심 흉흉'}`;
    const cr = $('#city-rank');
    if (cr) cr.textContent = SK.rankFor(s.fame).title;
    renderCityDev(id);
    renderSceneLevel(id);
    renderCityGens(id);
    const hs = $('#scene-hotspots');
    hs.innerHTML = HOTSPOTS.map((h) => `<button class="hotspot" style="left:${h.x}%;top:${h.y}%" data-key="${h.key}"><i></i><span>${h.name}</span></button>`).join('');
    hs.querySelectorAll('.hotspot').forEach((b) => {
      b.onclick = () => doCommand(b.dataset.key);
    });
    SK.show('screen-city');
    bgm('domestic');
  };

  function heroPortrait(cityId) {
    const g = SK.state.heroes.find((h) => h.city === cityId);
    return g ? g.portrait : 'caocao';
  }
  function sceneFor(c) {
    if (c.region === '한국' || c.region === '대만') return 'city_mountain';
    if (SK.battleTypeFor(c) === 'naval') return 'city_river';
    if (c.region === '서촉' || c.region === '서량') return 'city_mountain';
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
      actions: [{ label: '닫기', primary: true }],
    });
    const render = () => {
      const slots = Object.keys(SK.SLOT_NAMES).map((sl) => {
        const id = hero.equip[sl];
        const t = id ? SK.TREASURE_BY_ID[id] : null;
        return `<button class="tr-slot ${slot === sl ? 'sel' : ''}" data-slot="${sl}">
          <span class="ts-type">${SK.SLOT_NAMES[sl]}</span>
          <b style="color:${t ? SK.GRADE_COLOR[t.grade] : '#9a8a66'}">${t ? t.name : '비어 있음'}</b>
        </button>`;
      }).join('');
      const owned = new Set();
      s.heroes.forEach((h) => Object.values(h.equip || {}).forEach((id) => owned.add(id)));
      const inv = s.treasures.map((id) => SK.TREASURE_BY_ID[id]).filter((t) => t && SK.treasureSlot(t) === slot);
      const list = inv.length ? inv.map((t) => `<button class="tr-item" data-id="${t.id}" style="--gc:${SK.GRADE_COLOR[t.grade]}">
          <span class="tr-grade">${t.grade}</span>
          <div><b>${t.name}</b><span>${t.effect}</span></div>
          <em>장착</em>
        </button>`).join('') : `<p class="tr-empty">${SK.SLOT_NAMES[slot]} 보물이 없습니다. 전장에서 적장을 쓰러뜨리면 얻을 수 있습니다.</p>`;
      const cur = hero.equip[slot] ? `<button class="btn btn-paper tr-unequip" id="tr-unequip">${SK.SLOT_NAMES[slot]} 해제</button>` : '';
      m.el.querySelector('#tr-body').innerHTML = `
        <div class="tr-slots">${slots}</div>
        <div class="tr-inv-head"><span>보유 ${SK.SLOT_NAMES[slot]}</span>${cur}</div>
        <div class="tr-list">${list}</div>
        <p class="tr-note">보물은 무기·방어구·명마·병법서 한 자리씩 장착됩니다.</p>`;
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

  function roleOf(h) {
    const s = SK.state;
    const f = s.factions[PF()] || {};
    if (h.name === f.lord) return '군주';
    const cs = s.cities[h.city];
    if (cs && cs.advisor === h.uid) return '군사';
    const peers = s.heroes.filter((x) => x.city === h.city);
    if (peers.length) {
      const top = peers.slice().sort((a, b) => (b.tong + b.wu + b.ji) - (a.tong + a.wu + a.ji))[0];
      if (top.uid === h.uid) return '태수';
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
          <span class="rs-name"><img src="${SK.ptSrc(h.portrait)}" alt=""><b>${h.name}</b></span>
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

  function showHeroInfo(uid) {
    const g = SK.state.heroes.find((h) => h.uid === uid);
    if (!g) return;
    const C = SK.CLASSES[g.cls];
    const hpM = maxHpOf(g.cls, g.lv), mpM = maxMpOf(g.cls, g.lv);
    SK.modal({
      title: `${g.name}`,
      body: `<div class="hero-info">
        <div class="hi-portrait"><img src="${SK.ptSrc(g.portrait)}" alt=""></div>
        <div class="hi-body">
          <p class="hi-cls">${SK.classTitle(g.cls, g.lv)} · ${C.role} · Lv.${g.lv}${g.tier ? ` · ${g.tier}급` : ''}</p>
          ${g.skillName ? `<p class="hi-skill">특기 — ${g.skillName}</p>` : ''}
          <div class="hi-exp"><i style="width:${Math.min(100, Math.round((g.exp || 0) / SK.expNeed(g.lv) * 100))}%"></i><em>EXP ${g.exp || 0} / ${SK.expNeed(g.lv)}</em></div>
          <p class="hi-next">${SK.nextPromo(g.lv) ? `다음 승급 Lv.${SK.nextPromo(g.lv)} · ${SK.PROMO[g.cls] ? SK.PROMO[g.cls].names[Math.min(4, SK.PROMO[g.cls].names.length - 1)] : ''}` : '최고 승급 단계'}</p>
          <div class="hi-bars"><span class="hi-hp">출진 병력 ${SK.troopForNamed(g.lv).toLocaleString('ko-KR')}</span><span class="hi-mp">MP ${g.mp}/${mpM}</span></div>
          <div class="hi-attrs">
            <div><span>무력</span><b>${g.wu}</b></div>
            <div><span>지력</span><b>${g.ji}</b></div>
            <div><span>통솔</span><b>${g.tong}</b></div>
          </div>
          <p class="hi-desc">${C.desc}</p>
          ${bondLines(g.name)}
          <p class="hi-quote">“${SK.quoteOf(g.name, 'deploy') || '필승을 기원한다.'}”</p>
        </div>
      </div>`,
      actions: [
        { label: '보물 관리', onClick: () => openTreasures(g) },
        ...(SK.state.cities[g.city] && SK.state.cities[g.city].owner === 'wei'
          ? [{ label: '다른 성으로 이동', onClick: () => openTransfer(g) }] : []),
        { label: '닫기', primary: true },
      ],
    });
  }
  SK.showHeroInfo = showHeroInfo;

  function openTransfer(g) {
    const s = SK.state;
    const towns = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === 'wei' && c.id !== g.city);
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
  function cityGens(cityId) { return SK.state.heroes.filter((h) => h.city === cityId); }

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
        ${devBar('성벽', cs.def, 'linear-gradient(90deg,#5b7387,#8fa8bd)')}
      </div>`;
    const info = $('#city-info');
    if (info) {
      const cap = cityCap(cs);
      const pct = Math.round(cs.troops / cap * 100);
      info.innerHTML = `<span class="ci-item">인구 <b>${fmt(cs.pop)}</b></span>
        <span class="ci-item">최대 병력 <b>${fmt(cap)}</b> <em>(인구 30%)</em></span>
        <span class="ci-item">주둔병 <b class="${pct >= 100 ? 'full' : ''}">${fmt(cs.troops)}</b> <em>${pct}%</em></span>
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
      const done = !!g.actedThisMonth;
      const sel = !done && g.uid === cityActorUid;
      const role = roleOf(g);
      return `<button class="gen-chip ${done ? 'done' : ''} ${sel ? 'sel' : ''}" data-uid="${g.uid}">
        <img src="${SK.ptSrc(g.portrait)}" alt="">
        <div><b>${g.name}</b><span>${role === SK.CLASSES[g.cls].name ? role : `${role} · ${SK.CLASSES[g.cls].name}`} · Lv.${g.lv}</span></div>
        <em class="gc-flag">${done ? '행동 완료' : sel ? '행동 차례' : '대기'}</em>
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

  function renderApBar(gens) {
    const bar = $('#city-ap');
    if (!bar) return;
    const cityId = SK.state.lastCity;
    const cs = SK.state.cities[cityId] || {};
    const ready = gens.filter((g) => !g.actedThisMonth);
    const actor = gens.find((g) => g.uid === cityActorUid && !g.actedThisMonth);
    const advisor = gens.find((g) => g.uid === cs.advisor);
    bar.innerHTML = `
      <div class="ap-head">
        <span class="ap-title">이번 달 행동</span>
        <b class="ap-count ${ready.length ? '' : 'none'}">행동 ${ready.length}/${gens.length}</b>
        <span class="ap-actor">${actor
          ? `<img src="${SK.ptSrc(actor.portrait)}" alt="">${actor.name} 차례`
          : (ready.length ? '장수를 고르세요' : '다음 달에 다시')}</span>
      </div>
      <div class="ap-row2">
        <div class="ap-dots">${gens.map((g) => `<i class="${g.actedThisMonth ? 'spent' : 'ready'}" title="${g.name}"></i>`).join('')}</div>
        <button class="ap-delegate" id="btn-delegate" title="군사에게 지금 성에 필요한 조언을 듣는다 (행동력은 쓰지 않습니다)">
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
    const nav = $('.city-commands');
    if (nav) {
      nav.classList.toggle('locked', !ready.length);
      nav.querySelectorAll('.cmd').forEach((b) => {
        if (DOMESTIC.includes(b.dataset.cmd)) b.classList.toggle('off', !ready.length);
      });
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
    const h = HOTSPOTS.find((x) => x.key === key);
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
    const h = HOTSPOTS.find((x) => x.key === key);
    const wrap = $('#city-floats');
    if (!h || !wrap) return;
    const btn = document.querySelector(`.hotspot[data-key="${key}"]`);
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

  /* ── 명령 정의 ── */
  const CMDS = {
    farm: { name: '개간', run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 100) return fail('금이 부족합니다. (필요 금 100)');
      s.gold -= 100; s.food += 300;
      st.agri = clamp(st.agri + 6, 0, 100);
      st.pop = Math.round(st.pop * 1.01);
      let msg = `개간 완료 — 농업 +6, 군량 +300, 인구 +${fmt(Math.round(st.pop * 0.01))}`;
      let hot = '농업 +6';
      if (roll(0.22)) { s.food += 160; st.agri = clamp(st.agri + 2, 0, 100); hot = '농업 +8'; msg += ' · 대풍년! 군량 +160'; }
      return { msg, hotKey: 'farm', hot, exp: 12 };
    } },
    trade: { name: '상업', run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.food < 80) return fail('군량이 부족합니다. (필요 미 80)');
      s.food -= 80; s.gold += 240;
      st.comm = clamp(st.comm + 6, 0, 100);
      let msg = `상업 완료 — 상업 +6, 금 +240`;
      let hot = '상업 +6';
      if (roll(0.2)) { s.gold += 200; st.comm = clamp(st.comm + 2, 0, 100); hot = '상업 +8'; msg += ' · 대상인 방문! 금 +200'; }
      return { msg, hotKey: 'trade', hot, exp: 12 };
    } },
    recruit: { name: '징병', run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 150 || s.food < 120) return fail('금이나 군량이 부족합니다. (필요 금 150 · 미 120)');
      const cap = cityCap(st);
      if (st.troops >= cap) return fail(`인구 대비 병력 상한입니다. (최대 ${fmt(cap)} · 인구 30%)`);
      if (st.pop < 9000) return fail(`인구가 너무 적습니다. (인구 ${fmt(st.pop)})`);
      const want = Math.min(2500 + (roll(0.2) ? 800 : 0), cap - st.troops, Math.floor((st.pop - 6000) * 0.9));
      if (want < 300) return fail('징병할 수 있는 인구가 부족합니다.');
      s.gold -= 150; s.food -= 120;
      st.troops += want;
      st.pop = Math.max(6000, st.pop - Math.round(want * 0.8));
      st.loyalty = clamp(st.loyalty - 5, 0, 100);
      return { msg: `징병 완료 — 수비병 +${fmt(want)} · 인구 -${fmt(Math.round(want * 0.8))} · 민심 -5`,
        hotKey: 'repair', hot: `병력 +${fmt(want)}`, exp: 12 };
    } },
    train: { name: '훈련', run(cityId, actor) {
      const s = SK.state;
      if (s.gold < 80) return fail('금이 부족합니다. (필요 금 80)');
      const gens = cityGens(cityId);
      if (!gens.length) return fail('훈련할 장수가 없습니다. [인재]로 등용하세요.');
      s.gold -= 80;
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
        msg: `훈련 완료 — 주둔 장수 경험치 +${90 + bonus}${actor ? ` · ${actor.name} +180` : ''}`,
        hotKey: 'repair', hot: '훈련 완료', exp: 0,
        after: () => SK.modal({ kicker: `${CITY[cityId].name} 훈련장`, title: '병법을 익혔다', body: `<div class="train-list">${rows}</div>`, actions: [{ label: '확인', primary: true }] }),
      };
    } },
    talent: { name: '인재', run(cityId, actor) {
      const s = SK.state;
      if (cityGens(cityId).length >= 10) return fail('이 성에는 더 이상 장수를 둘 수 없습니다.');
      if (!tavernPool(cityId).length) return fail('주점에 소문난 인재가 없습니다. 다른 성의 주점을 찾아보세요.');
      openTavern(cityId, actor);
      return { pending: true };
    } },
    repair: { name: '보수', run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 120) return fail('금이 부족합니다. (필요 금 120)');
      if (st.def >= 100) return fail('성벽이 이미 완벽합니다.');
      s.gold -= 120; st.def = clamp(st.def + 9, 0, 100);
      st.loyalty = clamp(st.loyalty + 1, 0, 100);
      let msg = '보수 완료 — 성벽 +9, 민심 +1';
      let hot = '성벽 +9';
      if (roll(0.2)) { st.def = clamp(st.def + 3, 0, 100); hot = '성벽 +12'; msg += ' · 좋은 석재 +3'; }
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
  const TALENT_LIMIT = 10;

  /* 이 성 + 길로 이어진 성의 재야 인재 (주점 진열) */
  function tavernPool(cityId) {
    const out = [];
    const seen = new Set();
    localTalents(cityId).forEach((g) => {
      if (seen.has(g.id)) return;
      seen.add(g.id);
      out.push({ g, cityId, here: true });
    });
    SK.allNeighbors(cityId).forEach((nid) => {
      if (!SK.CITY[nid] || nid === cityId) return;
      localTalents(nid).forEach((g) => {
        if (seen.has(g.id)) return;
        seen.add(g.id);
        out.push({ g, cityId: nid, here: false });
      });
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

  function openTavern(cityId, actor) {
    const s = SK.state;
    const c = CITY[cityId];
    const pool = tavernPool(cityId);
    const hereN = pool.filter((p) => p.here).length;
    const rows = pool.map(({ g, cityId: fromId, here }) => {
      const cls = SK.genClass(g);
      const cost = TALENT_COST[g.tier] || 620;
      const refuse = lordRival(g.name);
      const ok = s.gold >= cost && !refuse && cityGens(cityId).length < TALENT_LIMIT;
      const rumor = RUMORS[g.tier][hashStr(g.name) % RUMORS[g.tier].length];
      const from = here ? '현재 성' : `${CITY[fromId].name} · 인접`;
      return `<button class="gen-pick ${ok ? '' : 'off'} ${refuse ? 'refuse' : ''}" data-gid="${g.id}" data-city="${fromId}">
        <span class="tier t${g.tier}">${g.tier}</span>
        <img src="${SK.ptSrc(SK.genPortrait(g))}" alt="">
        <div class="gp-main">
          <b>${g.name}<em class="gp-city ${here ? 'here' : ''}">${from}</em></b>
          <span>${SK.CLASSES[cls].name} · ${g.skill || '특기 없음'}</span>
          <em class="gp-rumor">“${rumor}”</em>
          <em>통 ${g.leadership} 무 ${g.war} 지 ${g.intel}</em>
        </div>
        <span class="gp-cost">${refuse ? '등용 거부' : `금 ${fmt(cost)}`}</span>
      </button>`;
    }).join('') || '<p class="tr-empty">주점이 조용합니다. 이 성과 옆 성에도 소문난 인재가 없습니다.</p>';
    const m = SK.modal({
      kicker: `${c.name} 주점`,
      title: '어떤 인재가 있나',
      body: `<p class="talent-note">${actor ? `${josa(actor.name, 'i')} 이번 달 주점을 찾았습니다. ` : ''}이 성에서 ${hereN}명, 길로 이어진 옆 성에서 ${pool.length - hereN}명을 만났습니다. 등용하면 ${actor ? actor.name + ' 님의 행동력과 ' : ''}새로 온 장수의 이번 달 행동이 끝납니다.<br><b>보통 인재(B·C급)가 흔하고, S·A급은 좀처럼 모습을 드러내지 않습니다.</b></p>
        <div class="gen-pick-list">${rows}</div>`,
      wide: true,
      actions: [{ label: '나가기' }],
    });
    m.el.querySelectorAll('.gen-pick').forEach((b) => {
      b.onclick = () => {
        const g = SK.GEN_BY_ID[Number(b.dataset.gid)];
        if (!g) return;
        const fromId = b.dataset.city || cityId;
        const cost = TALENT_COST[g.tier] || 620;
        if (lordRival(g.name)) {
          SK.sfx.play('deny');
          SK.toast(`${josa(g.name, 'eun')} 우리 군주와 숙적이라 등용을 거부합니다.`);
          return;
        }
        if (s.gold < cost) { SK.sfx.play('deny'); SK.toast(`금이 부족합니다. (필요 금 ${fmt(cost)})`); return; }
        if (cityGens(cityId).length >= TALENT_LIMIT) { SK.toast('이 성에는 더 이상 장수를 둘 수 없습니다.'); return; }
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

  /* ── 관아 — 민심 · 군사 임명 · 내정 위임 ── */
  function openOffice(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const gens = cityGens(cityId);
    const advisor = gens.find((g) => g.uid === cs.advisor) || null;
    const ready = gens.filter((g) => !g.actedThisMonth).length;
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 관아`,
      title: '성을 다스린다',
      body: `<div class="office-wrap">
        <div class="office-stats">
          <div><span>민심</span><b>${cs.loyalty}</b></div>
          <div><span>성벽</span><b>${cs.def}</b></div>
          <div><span>이번 달 남은 행동</span><b>${ready} / ${gens.length}</b></div>
        </div>
        <p class="office-note">군사를 임명하면 [군사] 버튼으로 이 성에 필요한 조언을 들을 수 있습니다. 남은 내정을 통째로 맡기려면 아래 위임을 쓰십시오.</p>
        <div class="menu-list">
          <button data-o="comfort">백성을 위로한다 — 금 100 · 민심 +5</button>
          <button data-o="appoint" ${gens.length ? '' : 'disabled'}>군사 임명${advisor ? ` — 현재 ${advisor.name}` : ''}</button>
          <button data-o="advice">군사 조언 — 지금 필요한 것</button>
          <button data-o="delegate" ${ready ? '' : 'disabled'}>군사 위임 — 남은 내정 자동 처리 (${ready})</button>
        </div>
      </div>`,
      actions: [{ label: '닫기' }],
      wide: true,
    });
    m.el.querySelectorAll('[data-o]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.o;
        if (k === 'comfort') {
          if (s.gold < 100) { SK.sfx.play('deny'); SK.toast('금이 부족합니다. (필요 금 100)'); return; }
          s.gold -= 100; cs.loyalty = clamp(cs.loyalty + 5, 0, 100);
          SK.save(); SK.refreshHud();
          m.close();
          SK.openCity(cityId);
          floatHotspot('office', '민심 +5');
          SK.toast('백성을 위로했습니다 — 민심 +5');
        } else if (k === 'appoint') {
          m.close();
          openAdvisorPick(cityId);
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

  function openAdvisorPick(cityId) {
    const cs = SK.state.cities[cityId];
    const gens = cityGens(cityId);
    if (!gens.length) { SK.toast('이 성에 장수가 없습니다.'); return; }
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
      body: `<p class="talent-note">지력과 통솔이 높은 장수가 좋은 조언을 합니다. 조언은 행동력을 쓰지 않습니다.</p><div class="target-list">${rows}</div>`,
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
          <div><span>남은 행동</span><b>${sit.ready}/${sit.gens.length}</b></div>
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
      const s = SK.state;
      const cs = s.cities[cityId];
      if (s.gold < 100) { SK.sfx.play('deny'); SK.toast('금이 부족합니다. (필요 금 100)'); return; }
      s.gold -= 100;
      cs.loyalty = clamp(cs.loyalty + 5, 0, 100);
      SK.save();
      SK.refreshHud();
      SK.openCity(cityId);
      floatHotspot('office', '민심 +5');
      SK.sfx.play('ui');
      SK.toast('백성을 위로했습니다 — 민심 +5');
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
    const pool = s.heroes.filter((h) => h.city === origin);
    if (!pool.length && ts.troops < 1800) {
      SK.modal({ title: '출진 불가', body: `<p class="modal-p">${SK.CITY[origin].name}에 장수도 병력도 부족합니다. [인재]와 [징병]으로 전력을 갖추세요.</p>`, actions: [{ label: '닫기', primary: true }] });
      return;
    }
    const avail = Math.floor(s.cities[origin].troops);
    let picked = [];
    let budget = avail;
    pool.slice(0, 4).forEach((h) => {
      const c = SK.troopForNamed(h.lv);
      if (c <= budget) { picked.push(h.uid); budget -= c; }
    });
    const regs = {};
    SK.REGIMENTS.forEach((r) => { regs[r.cls] = 0; });
    const MAX_UNITS = 10;

    const unitCost = (uid) => {
      const h = s.heroes.find((x) => x.uid === uid);
      return SK.troopForNamed(h.lv);
    };
    const namedCost = () => picked.reduce((sum, uid) => sum + unitCost(uid), 0);
    const regCost = () => SK.REGIMENTS.reduce((sum, r) => sum + (regs[r.cls] || 0) * r.cost, 0);
    const totalCost = () => namedCost() + regCost();
    const unitCount = () => picked.length + SK.REGIMENTS.reduce((sum, r) => sum + (regs[r.cls] || 0), 0);
    const left = () => avail - totalCost();

    const body = `<div class="deploy-wrap">
      <div class="deploy-banner" style="--fc:${f.color}">
        <span class="db-flag">${SK.markOf(f)}</span>
        <div><b>${f.name}군 ${fmt(ts.troops)}</b><span>성벽 ${ts.def} · ${SK.BATTLE_TYPES[bt].desc}</span></div>
      </div>
      ${deployQuote(pool, picked, s)}
      ${(ts.genIds && ts.genIds.length) ? `<p class="enemy-gens">적장 — ${ts.genIds.map((gid) => SK.GEN_BY_ID[gid]).filter(Boolean).map((g) => `${g.name}(${g.tier})`).join(' · ')}</p>` : ''}
      <div class="troop-ledger">
        <div><span>보유 병력</span><b id="dp-avail">${fmt(avail)}</b></div>
        <div><span>출진 병력</span><b id="dp-cost" class="hot">0</b></div>
        <div><span>남는 병력</span><b id="dp-left">0</b></div>
        <div><span>부대</span><b id="dp-units">0 / ${MAX_UNITS}</b></div>
      </div>
      <p class="deploy-tip">${SK.BATTLE_TYPES[bt].skill} 병력이 곧 부대의 HP입니다.</p>
      <div class="deploy-section"><span>명장 출진</span><em>각 장수의 병력은 성에서 배정됩니다</em></div>
      <div class="deploy-list" id="deploy-list">${pool.map((h) => heroPickRow(h, picked.includes(h.uid), unitCost(h.uid))).join('') || '<p class="empty-gens">주둔 장수가 없습니다. 병종 부대만으로 출진할 수 있습니다.</p>'}</div>
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
          picked.forEach((uid) => units.push({ kind: 'hero', uid, troops: unitCost(uid) }));
          SK.REGIMENTS.forEach((r) => {
            for (let i = 0; i < (regs[r.cls] || 0); i++) units.push({ kind: 'regiment', cls: r.cls, name: r.name, troops: r.cost });
          });
          s.cities[origin].troops = Math.max(0, avail - totalCost());
          SK.save();
          SK.startBattle({ origin, targetId, type: bt, units });
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
      m.el.querySelectorAll('.hero-pick').forEach((el) => el.classList.toggle('on', picked.includes(el.dataset.uid)));
      m.el.querySelectorAll('.reg-row').forEach((row) => {
        const cls = row.dataset.cls;
        row.querySelector('.reg-count').textContent = regs[cls] || 0;
        row.classList.toggle('on', (regs[cls] || 0) > 0);
      });
    };

    m.el.querySelectorAll('.hero-pick').forEach((el) => {
      el.onclick = () => {
        const uid = el.dataset.uid;
        if (picked.includes(uid)) picked = picked.filter((x) => x !== uid);
        else {
          if (unitCount() >= MAX_UNITS) { SK.toast(`부대는 최대 ${MAX_UNITS}개입니다.`); return; }
          if (totalCost() + unitCost(uid) > avail) { SK.toast('병력이 부족합니다. 다른 부대를 줄이세요.'); return; }
          picked.push(uid);
        }
        refresh();
      };
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
    const C = SK.CLASSES[h.cls];
    return `<button class="hero-pick ${on ? 'on' : ''}" data-uid="${h.uid}">
      <img src="${SK.ptSrc(h.portrait)}" alt="">
      <div class="hp-main"><b>${h.name}</b><span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv}</span></div>
      <div class="hp-stats"><span>무 ${h.wu}</span><span>지 ${h.ji}</span><span>통 ${h.tong}</span></div>
      <div class="hp-troops">병력 ${fmt(cost)}</div>
      <span class="hp-check">✓</span>
    </button>`;
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

  function advanceMonth() {
    const s = SK.state;
    s.month += 1;
    if (s.month >= 12) { s.month = 0; s.year += 1; if (s.eraYear) s.eraYear += 1; }
    s.turn += 1;
    let gold = 0, food = 0, pop = 0, popGrowth = 0, unrest = 0;
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (st.owner !== PF()) return;
      const base = econMul(c);
      const morale = st.loyalty;
      // 민심이 좋으면 세수와 인구가 오르고, 나쁘면 줄고 소란이 난다
      const moraleMul = morale >= 70 ? 1.15 : morale < 40 ? 0.85 : 1;
      gold += Math.round((c.gold / 45 + morale * 0.6) * base * moraleMul * (0.85 + st.comm / 250));
      food += Math.round((c.food / 60 + morale * 0.5) * base * (0.85 + st.agri / 250));
      const growing = Math.round(st.pop * (0.004 + st.agri / 100 * 0.010 + (morale - 50) / 100 * 0.006));
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
      if (st.owner === PF()) return;
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
    SK.save();
    SK.refreshHud();
    if (window.SKMap) SKMap.refresh();
    SK.sfx.play('month');
    SK.modal({
      kicker: SK.dateLabel(s.eraYear || (195 + s.year), s.month),
      title: '월정산',
      body: `<div class="month-report">
        <div class="mr-row"><span>세입</span><b class="plus">금 +${fmt(gold)}</b></div>
        <div class="mr-row"><span>군량</span><b class="plus">미 +${fmt(food)}</b></div>
        <div class="mr-row"><span>징집</span><b>병 +${fmt(pop)}</b></div>
        <div class="mr-row"><span>봉급 · ${rank.title}</span><b class="plus">금 +${fmt(salary)}</b></div>
        <div class="mr-row"><span>인구</span><b class="${popGrowth ? 'plus' : ''}">인구 성장 +${fmt(popGrowth)}${unrest ? ` · 민심 흔들리는 성 ${unrest}곳` : ''}</b></div>
        <div class="mr-row"><span>명성</span><b>+3</b></div>
        ${ev ? `<div class="mr-event ${ev.type === '위기' ? 'crisis' : ''}"><span class="me-seal">${ev.hanja}</span>
          <div class="me-main"><b>${ev.title} <em class="me-season">${ev.type || ''} · ${ev.season || ''}</em></b><span>${ev.text}</span><em>${ev.gain}</em></div></div>` : ''}
        <p class="mr-note">주둔 장수의 체력이 회복되고, 이번 달 행동력이 모두 돌아왔습니다.</p>
      </div>`,
      actions: [{ label: '계속', primary: true, onClick: () => { if (tlEv) setTimeout(() => showTimelineCard(tlEv), 220); } }],
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
        <div class="help-item"><b>지도</b><p>두 손가락으로 확대·축소하고, 한 손가락으로 끌어 이동합니다. 우리 성을 누르면 내정, 적성을 누르면 공격 정보가 열립니다.</p></div>
        <div class="help-item"><b>내정 행동력</b><p>주둔 장수는 한 달에 한 번만 내정을 할 수 있습니다. 장수를 눌러 이번 달 일을 맡기고, 모두 일하면 [다음 달]을 눌러야 합니다.</p></div>
        <div class="help-item"><b>여섯 시설</b><p>관아(민심·군사 임명) · 농장(개간) · 시장(상업) · 병영(징병·훈련) · 주점(그 성의 인재 등용) · 성벽(보수). 개발도가 오르면 성이 Lv.1→Lv.5로 자라고 장면도 바뀝니다.</p></div>
        <div class="help-item"><b>인구와 징병</b><p>징병은 그 성의 인구에서 병사를 빼옵니다. 주둔병은 인구의 30%를 넘을 수 없고, 징병하면 민심이 5 내려갑니다. 민심이 70 이상이면 세수와 인구가 더 늘고, 40 아래면 줄어듭니다.</p></div>
        <div class="help-item"><b>군사 조언</b><p>관아나 행동력 줄의 [군사] 버튼으로 군사를 임명하면, 그 성의 민심·병력·성벽·재정과 이웃 적성·주점 인재를 읽어 지금 필요한 일을 조언합니다. 조언은 행동력을 쓰지 않고, '조언대로 진행'을 눌러야 실행됩니다. 남은 내정을 통째로 맡기는 위임은 관아에서 따로 고를 수 있습니다.</p></div>
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
    $('#btn-next-month').onclick = advanceMonth;
    $('#btn-map-menu').onclick = openMenu;
    $('#btn-city-back').onclick = () => SK.showMap();
    $('#btn-battle-help').onclick = () => SK.showHelp();
    $('#btn-city-back').onclick = () => SK.showMap();
    $$('.city-commands .cmd').forEach((b) => { b.onclick = () => doCommand(b.dataset.cmd); });
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
    bind();
    if (hasSaveOnBoot()) $('#btn-continue').hidden = false;
  });
  function hasSaveOnBoot() { return SK.hasSave(); }

  // 자동 저장
  setInterval(() => { if (SK.state && document.querySelector('#screen-map.active, #screen-city.active')) SK.save(); }, 8000);
})();
