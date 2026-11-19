/* ══════════════════════════════════════════════════════════════
   삼국지 조조전 · 천하통일 — 상태·화면·내정
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const MONTHS = ['정월', '이월', '삼월', '사월', '오월', '유월', '칠월', '팔월', '구월', '시월', '동월', '섣달'];
  const SAVE_KEY = 'samgukji-jojo-v4-save';

  /* ───────────── 도시 런타임 ───────────── */
  const CITY = SK.CITY;

  const PLAYER = 'wei';

  /* ───────────── 상태 ───────────── */
  function newState(sc) {
    const cities = {};
    SK.CITY_LIST.forEach((c) => {
      const owned = c.faction === PLAYER;
      cities[c.id] = {
        owner: c.faction,
        troops: c.baseTroops,
        def: c.defense,
        loyalty: owned ? 78 : 58 + Math.round(Math.random() * 22),
        gold: 0, food: 0, genIds: [],
      };
    });
    const heroes = [];
    const put = (baseId, cityId) => {
      const b = SK.HEROES[baseId];
      const g = SK.GEN_BY_NAME[b.name] || null;
      const cls = g ? SK.genClass(g) : b.cls;
      const st = g ? SK.genStats(g) : { wu: b.wu, ji: b.ji, tong: b.tong };
      const lv = Math.max(b.lv, g ? SK.genLv(g) : 1);
      heroes.push({
        uid: 'h_' + baseId, baseId, genId: g ? g.id : null, name: b.name, hanja: b.hanja, cls,
        portrait: b.pt, unit: b.unit || null, lv, wu: st.wu, ji: st.ji, tong: st.tong, tier: g ? g.tier : '',
        skillName: g ? g.skill : '',
        hp: maxHpOf(cls, lv), mp: maxMpOf(cls, lv), city: cityId, generic: false, exp: 0, tierLv: 0, equip: {},
      });
    };
    ['jojo', 'sunyoo', 'wujin'].forEach((h) => put(h, 'xuchang'));
    ['hahoudon', 'yuejin'].forEach((h) => put(h, 'chenliu'));
    ['hahouyeon'].forEach((h) => put(h, 'wan'));
    ['mifang', 'sunqian'].forEach((h) => put(h, 'runan'));
    ['juchang', 'jutaek', 'lidian'].forEach((h) => put(h, 'xinye'));
    const st = {
      version: 4, year: 1, month: 0, gold: 0, food: 0, fame: 0, turn: 1,
      cities, heroes, citiesOwned: 0, log: [], lastCity: 'xuchang', treasures: [],
    };
    if (sc) { st.scenario = sc.id; st.eraYear = sc.year; SK.applyScenario(st.cities, sc); }
    // 시나리오로 소유가 바뀌면 장수를 플레이어 수도로 모은다
    const playerCities = SK.CITY_LIST.filter((c) => st.cities[c.id].owner === PLAYER);
    const capital = (sc && sc.factions && sc.factions['위'] && sc.factions['위'].capital)
      ? (SK.CITY_LIST.find((c) => c.name === sc.factions['위'].capital) || playerCities[0])
      : (SK.CITY_LIST.find((c) => c.id === 'xuchang') || playerCities[0]);
    st.heroes.forEach((h) => { if (st.cities[h.city] && st.cities[h.city].owner !== PLAYER) h.city = capital.id; });
    st.lastCity = capital.id;
    st.gold = Math.round(playerCities.reduce((a, c) => a + c.gold, 0) / 9);
    st.food = Math.round(playerCities.reduce((a, c) => a + c.food, 0) / 12);
    st.diplomacy = sc ? sc.factions : null;
    st.playerCapital = capital.id;
    assignExtras(st);
    giveStarters(st);
    assignGarrisons(st);
    return st;
  }

  const FACTION_JSON = { wei: '위', wu: '오', shu: '촉', liu: '촉', yan: '촉', han: '한국',
    warlord: '군웅', yuan: '군웅', lv: '군웅', dong: '군웅', gongsun: '군웅', ma: '군웅', neutral: '군웅' };
  const CORE_NAMES = new Set(Object.values(SK.HEROES).map((h) => h.name));

  function genHero(g, cityId) {
    const cls = SK.genClass(g);
    const lv = SK.genLv(g);
    return {
      uid: 'g_' + g.id, baseId: 'gen', genId: g.id, name: g.name, hanja: '',
      cls, portrait: SK.genPortrait(g), unit: null, lv,
      wu: g.war, ji: g.intel, tong: g.leadership, tier: g.tier, skillName: g.skill,
      hp: maxHpOf(cls, lv), mp: maxMpOf(cls, lv), city: cityId, generic: true, exp: 0, tierLv: 0, equip: {},
      factionName: g.faction,
    };
  }

  function giveStarters(st) {
    if (!SK.TREASURES.length) return;
    const hero = st.heroes.find((h) => h.name === '조조');
    const sword = SK.TREASURES.find((t) => t.name === '청강검') || SK.TREASURES.find((t) => t.type === '무기' && t.grade === '희귀');
    if (hero && sword) hero.equip.weapon = sword.id;
    const hd = st.heroes.find((h) => h.name === '하후돈');
    const armor = SK.TREASURES.find((t) => t.type === '방어구' && t.grade === '희귀');
    if (hd && armor) hd.equip.armor = armor.id;
    st.treasures = SK.TREASURES.slice(0, 0).map((t) => t.id);
  }

  function assignExtras(st) {
    if (!SK.GENERALS.length) return;
    const used = new Set(st.heroes.map((h) => h.genId).filter(Boolean));
    // 1) 각 위 거점의 태수(governor)를 장수로 배치
    SK.CITY_LIST.forEach((c) => {
      if (st.cities[c.id].owner !== PLAYER) return;
      const g = SK.GEN_BY_NAME[c.governor];
      if (!g || used.has(g.id)) return;
      if (st.heroes.some((h) => h.name === g.name)) return;
      st.heroes.push(genHero(g, c.id));
      used.add(g.id);
    });
    // 2) 장수가 없는 성은 위 세력 인재로 한 명씩 채운다
    const pool = SK.GENERALS.filter((g) => g.faction === '위' && !CORE_NAMES.has(g.name) && !used.has(g.id));
    let i = 0;
    SK.CITY_LIST.filter((c) => st.cities[c.id].owner === PLAYER).forEach((c) => {
      if (st.heroes.some((h) => h.city === c.id)) return;
      if (i < pool.length) { st.heroes.push(genHero(pool[i], c.id)); used.add(pool[i].id); i += 1; }
    });
  }

  function assignGarrisons(st) {
    if (!SK.GENERALS.length) return;
    const byFac = {};
    const rank = { S: 0, A: 1, B: 2, C: 3 };
    SK.GENERALS.forEach((g) => {
      if (CORE_NAMES.has(g.name)) return;
      (byFac[g.faction] = byFac[g.faction] || []).push(g);
    });
    Object.keys(byFac).forEach((f) => byFac[f].sort((a, b) => (rank[a.tier] - rank[b.tier]) || (a.id - b.id)));
    const usedIds = new Set();
    const picks = {};
    // 1) 도시 데이터의 태수(governor)를 수비장으로 배치
    SK.CITY_LIST.forEach((c) => {
      picks[c.id] = [];
      if (st.cities[c.id].owner === PLAYER) return;
      const g = SK.GEN_BY_NAME[c.governor];
      if (g && !usedIds.has(g.id)) { picks[c.id].push(g.id); usedIds.add(g.id); }
      (SK.CITY_LORDS[c.id] || []).forEach((nm) => {
        const g2 = SK.GEN_BY_NAME[nm];
        if (g2 && !usedIds.has(g2.id) && picks[c.id].length < 4) { picks[c.id].push(g2.id); usedIds.add(g2.id); }
      });
    });
    // 2) 나머지 자리는 같은 세력의 장수로 채운다
    const cursor = {};
    SK.CITY_LIST.forEach((c) => {
      if (st.cities[c.id].owner === PLAYER) { st.cities[c.id].genIds = []; return; }
      const key = FACTION_JSON[st.cities[c.id].owner] || '군웅';
      const pool = byFac[key] || [];
      const n = c.type === 'capital' ? 4 : 3;
      let guard = 0;
      while (picks[c.id].length < n && pool.length && guard < pool.length * 3) {
        const k = (cursor[key] = (cursor[key] || 0) + 1);
        const g = pool[k % pool.length];
        if (!usedIds.has(g.id)) { picks[c.id].push(g.id); usedIds.add(g.id); }
        guard += 1;
      }
      st.cities[c.id].genIds = picks[c.id];
    });
  }

  function availableGenerals() {
    if (!SK.GENERALS.length) return [];
    const used = new Set();
    SK.state.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
    SK.CITY_LIST.forEach((c) => (SK.state.cities[c.id].genIds || []).forEach((id) => used.add(id)));
    return SK.GENERALS.filter((g) => !used.has(g.id) && !CORE_NAMES.has(g.name));
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
      if (!s || (s.version !== 4 && s.version !== 3)) return false;
      s.treasures = s.treasures || [];
      (s.heroes || []).forEach((h) => { h.equip = h.equip || {}; });
      SK.state = s;
      return true;
    } catch (e) { return false; }
  };
  SK.hasSave = function () { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };

  /* ───────────── 알림 ───────────── */
  let toastTimer = null;
  SK.toast = function (msg) {
    const t = $('#toast');
    t.textContent = msg;
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
  SK.show = function (id) {
    SCREENS.forEach((s) => $('#' + s).classList.toggle('active', s === id));
  };
  SK.showMap = function () {
    SK.show('screen-map');
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
    if (SK.SCENARIOS.length) return true;
    try {
      const res = await fetch('data/scenarios.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setScenarios(await res.json());
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

  /* ───────────── 시작 ───────────── */
  async function startGame(fresh) {
    if (!SK.CITY_LIST.length) await loadCities();
    if (!SK.SCENARIOS.length) await loadScenarios();
    if (!SK._classesLoaded) await loadClasses();
    if (!SK.EVENTS.length) await loadEvents();
    if (!SK.GENERALS.length) await loadGenerals();
    if (!SK.TREASURES.length) await loadTreasures();
    if (fresh) { openScenarioPicker(); return; }
    if (!SK.state) { SK.state = newState(); SK.save(); }
    SK.showMap();
    SK.refreshHud();
    if (window.SKMap) SKMap.resetCamera();
    setTimeout(() => {
      if (false) {
        SK.modal({
          kicker: '건안 원년 정월',
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

  function openScenarioPicker() {
    if (!SK.SCENARIOS.length) { beginScenario(null); return; }
    const cards = SK.SCENARIOS.map((sc) => `<button class="sc-card" data-sc="${sc.id}">
      <span class="sc-year">${sc.year}</span>
      <div class="sc-main"><b>${sc.title}</b><p>${sc.summary}</p>
        <span class="sc-line">${Object.keys(sc.factions).map((f) => `${f}·${sc.factions[f].leader}`).join(' / ')}</span></div>
    </button>`).join('');
    const m = SK.modal({
      kicker: '새로 시작',
      title: '어느 난세를 살아갈까',
      body: `<p class="talent-note">시나리오마다 세력의 수도와 영토가 달라집니다. 플레이 세력은 위(魏)·조조입니다.</p><div class="sc-list">${cards}</div>`,
      wide: true,
      actions: [{ label: '취소' }],
      dismissible: true,
    });
    m.el.querySelectorAll('.sc-card').forEach((b) => {
      b.onclick = () => {
        const sc = SK.SCENARIOS.find((x) => x.id === Number(b.dataset.sc));
        m.close();
        beginScenario(sc);
      };
    });
  }

  function beginScenario(sc) {
    SK.state = newState(sc);
    SK.save();
    SK.showMap();
    if (window.SKMap) { SKMap.resetCamera(); }
    SK.refreshHud();
    setTimeout(() => {
      if (sc) {
        const wi = sc.factions['위'] || {};
        SK.modal({
          kicker: `서기 ${sc.year}년`,
          title: sc.title,
          body: `<div class="intro-modal">
            <div class="intro-portrait"><img src="assets/portraits/v2/${SK.GEN_BY_NAME[wi.leader] ? SK.genPortrait(SK.GEN_BY_NAME[wi.leader]) : 'caocao'}.webp"></div>
            <p>“${wi.intro || '천하는 넓고, 내 길은 멀다.'}”</p>
            <p class="sc-summary">${sc.summary}</p>
            <ul><li><b>수도</b> ${wi.capital || '허창'}</li><li><b>세력</b> ${Object.keys(sc.factions).join(' · ')}</li><li><b>목표</b> 인접한 적성을 공략해 천하를 통일하십시오.</li></ul>
          </div>`,
          actions: [{ label: '출발한다', primary: true }],
        });
      }
    }, 300);
  }

  /* ───────────── HUD ───────────── */
  SK.refreshHud = function () {
    const s = SK.state;
    if (!s) return;
    $('#map-gold').textContent = fmt(s.gold);
    $('#map-food').textContent = fmt(s.food);
    $('#map-troops').textContent = fmt(totalTroops());
    $('#map-date').textContent = s.eraYear ? `서기 ${s.eraYear}년 ${MONTHS[s.month]}` : `건안 ${s.year}년 ${MONTHS[s.month]}`;
    $('#map-fame').textContent = '명성 ' + fmt(s.fame);
    const owned = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PLAYER).length;
    $('#map-hint').textContent = owned >= SK.CITY_LIST.length ? '천하통일! 모든 거점이 위의 깃발 아래 있습니다.' :
      `위의 거점 ${owned} / ${SK.CITY_LIST.length} · 다음 달이 되면 세수와 군량이 들어옵니다.`;
  };
  function totalTroops() {
    return SK.CITY_LIST.reduce((sum, c) => sum + (SK.state.cities[c.id].owner === PLAYER ? SK.state.cities[c.id].troops : 0), 0);
  }
  SK.totalTroops = totalTroops;

  /* ───────────── 도시 시트 (지도 하단) ───────────── */
  SK.openCitySheet = function (id) {
    const c = CITY[id];
    const st = SK.state.cities[id];
    const f = SK.FACTIONS[st.owner];
    const mine = st.owner === PLAYER;
    const ownGens = SK.state.heroes.filter((h) => h.city === id);
    const defGens = mine ? [] : (st.genIds || []).map((gid) => SK.GEN_BY_ID[gid]).filter(Boolean);
    const generals = mine ? ownGens : defGens;
    const canAttack = !mine && SK.allNeighbors(id).some((n) => SK.state.cities[n].owner === PLAYER);
    const sheet = $('#city-sheet');
    sheet.hidden = false;
    sheet.innerHTML = `
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <span class="faction-badge" style="--fc:${f.color}">${f.hanja}</span>
        <div class="sheet-title"><h3>${c.name} <em>${c.hanja}</em></h3>
          <p>${f.name} · ${typeName(c.type)} · ${c.region}</p></div>
        <button class="sheet-close" aria-label="닫기">✕</button>
      </div>
      <div class="sheet-stats">
        <div><span>수비병</span><b>${fmt(st.troops)}</b></div>
        <div><span>성벽</span><b>${st.def}</b></div>
        <div><span>민심</span><b>${st.loyalty}</b></div>
        <div><span>장수</span><b>${generals.length}</b></div>
      </div>
      ${generals.length ? `<div class="sheet-gens">${generals.slice(0, 6).map((g) => `<div class="mini-gen"><img src="assets/portraits/v2/${g.portrait || SK.genPortrait(g)}.webp" alt=""><span>${g.name}</span></div>`).join('')}</div>` : ''}
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
          const from = SK.allNeighbors(id).find((n) => SK.state.cities[n].owner === PLAYER) || s.lastCity;
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

  /* ───────────── 내정 화면 ───────────── */
  const HOTSPOTS = [
    { key: 'talent', name: '관아', x: 50, y: 30 },
    { key: 'farm', name: '농장', x: 24, y: 56 },
    { key: 'trade', name: '시장', x: 74, y: 52 },
    { key: 'repair', name: '병영', x: 40, y: 78 },
  ];

  SK.openCity = function (id) {
    const s = SK.state;
    const c = CITY[id];
    const st = s.cities[id];
    if (st.owner !== PLAYER) { SK.openCitySheet(id); return; }
    s.lastCity = id;
    SK.save();
    const f = SK.FACTIONS[st.owner];
    $('#city-name').textContent = c.name;
    $('#city-hanja').textContent = c.hanja;
    $('#city-faction').textContent = f.hanja;
    $('#city-faction').style.background = f.color;
    $('#city-lord-img').src = `assets/portraits/v2/${heroPortrait(id)}.webp`;
    const scene = sceneFor(c);
    $('#city-scene-img').src = `assets/scenes/${scene}.webp`;
    $('#city-gold').textContent = fmt(s.gold);
    $('#city-food').textContent = fmt(s.food);
    $('#city-troops').textContent = fmt(st.troops);
    $('#stat-def').textContent = st.def;
    $('#stat-loyal').textContent = st.loyalty;
    const gens = s.heroes.filter((h) => h.city === id);
    $('#stat-generals').textContent = gens.length;
    $('#bar-def').style.width = st.def + '%';
    $('#bar-loyal').style.width = st.loyalty + '%';
    $('#bar-gen').style.width = Math.min(100, gens.length * 20) + '%';
    $('#city-weather').textContent = `${monthWeather(s)} · ${st.loyalty > 75 ? '민심 안정' : st.loyalty > 50 ? '민심 보통' : '민심 흉흉'}`;
    $('#city-generals').innerHTML = gens.map((g) => `
      <div class="gen-chip" data-uid="${g.uid}">
        <img src="assets/portraits/v2/${g.portrait}.webp" alt="">
        <div><b>${g.name}</b><span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}</span></div>
      </div>`).join('') || '<p class="empty-gens">주둔한 장수가 없습니다. [인재]로 등용하세요.</p>';
    $$('#city-generals .gen-chip').forEach((el) => {
      el.onclick = () => showHeroInfo(el.dataset.uid);
    });
    const hs = $('#scene-hotspots');
    hs.innerHTML = HOTSPOTS.map((h) => `<button class="hotspot" style="left:${h.x}%;top:${h.y}%" data-key="${h.key}"><i></i><span>${h.name}</span></button>`).join('');
    hs.querySelectorAll('.hotspot').forEach((b) => {
      b.onclick = () => doCommand(b.dataset.key);
    });
    SK.show('screen-city');
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
          SK.toast(`${hero.name}이(가) ${SK.TREASURE_BY_ID[id].name}을(를) 장착했습니다.`);
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

  function showHeroInfo(uid) {
    const g = SK.state.heroes.find((h) => h.uid === uid);
    if (!g) return;
    const C = SK.CLASSES[g.cls];
    const hpM = maxHpOf(g.cls, g.lv), mpM = maxMpOf(g.cls, g.lv);
    SK.modal({
      title: `${g.name} <em class="hanja">${g.hanja || ''}</em>`,
      body: `<div class="hero-info">
        <div class="hi-portrait"><img src="assets/portraits/v2/${g.portrait}.webp" alt=""></div>
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
          <p class="hi-quote">“${SK.HEROES[g.baseId] ? SK.HEROES[g.baseId].quote : '필승을 기원한다.'}”</p>
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
      <span class="tc-flag" style="background:${SK.FACTIONS.wei.color}">${SK.FACTIONS.wei.hanja}</span>
      <div class="tc-main"><b>${c.name} <em>${c.hanja}</em></b><span>${typeName(c.type)} · 주둔 ${s.heroes.filter((h) => h.city === c.id).length}명</span></div>
      <span class="tc-troops"><span>수비병</span><b>${fmt(s.cities[c.id].troops)}</b></span>
      <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({ kicker: `${g.name} 이동`, title: '어느 성으로 갈까', body: `<div class="target-list">${rows}</div>`, chest: true, actions: [{ label: '취소' }], wide: true });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        const dest = b.dataset.c;
        g.city = dest;
        SK.save();
        m.close();
        SK.toast(`${g.name}이(가) ${CITY[dest].name}(으)로 이동했습니다.`);
        if (document.querySelector('#screen-city.active')) SK.openCity(s.lastCity);
      };
    });
  }
  SK.openTransfer = openTransfer;

  /* ───────────── 내정 명령 ───────────── */
  const CMDS = {
    farm: { name: '개간', gold: 100, run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 100) return SK.toast('금이 부족합니다. (필요 금 100)');
      s.gold -= 100; s.food += 300; st.loyalty = clamp(st.loyalty + 1, 0, 100);
      return `개간 완료 — 군량 +300, 민심 +1`;
    } },
    trade: { name: '상업', food: 80, run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.food < 80) return SK.toast('군량이 부족합니다. (필요 미 80)');
      s.food -= 80; s.gold += 240; st.loyalty = clamp(st.loyalty + 1, 0, 100);
      return '상업 완료 — 금 +240, 민심 +1';
    } },
    recruit: { name: '징병', gold: 150, food: 120, run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 150 || s.food < 120) return SK.toast('금이나 군량이 부족합니다.');
      if (st.troops >= 20000) return SK.toast('수비병이 이미 가득 찼습니다. (상한 20,000)');
      s.gold -= 150; s.food -= 120; st.troops = clamp(st.troops + 2500, 0, 20000);
      return '징병 완료 — 수비병 +2,500';
    } },
    train: { name: '훈련', gold: 80, run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 80) return SK.toast('금이 부족합니다. (필요 금 80)');
      const gens = s.heroes.filter((h) => h.city === cityId);
      if (!gens.length) return SK.toast('훈련할 장수가 없습니다. [인재]로 등용하세요.');
      s.gold -= 80;
      const rows = gens.map((h) => {
        const ups = SK.gainExp(h, 90);
        const title = SK.classTitle(h.cls, h.lv);
        const upTxt = ups.length ? ups.map((u) => `Lv.${u.lv}${u.promote ? ` · ${u.title} 승급!` : ' 달성'}`).join(' ') : null;
        return `<div class="train-row ${ups.length ? 'up' : ''}">
          <img src="assets/portraits/v2/${h.portrait}.webp" alt="">
          <div class="tr-main"><b>${h.name}</b><span>${title} · Lv.${h.lv}</span></div>
          <div class="tr-exp"><i style="width:${Math.min(100, Math.round(h.exp / SK.expNeed(h.lv) * 100))}%"></i><em>${h.exp} / ${SK.expNeed(h.lv)}</em></div>
          ${upTxt ? `<span class="tr-up">${upTxt}</span>` : '<span class="tr-gain">EXP +90</span>'}
        </div>`;
      }).join('');
      SK.save();
      SK.openCity(cityId);
      SK.modal({ kicker: `${CITY[cityId].name} 훈련장`, title: '병법을 익혔다', body: `<div class="train-list">${rows}</div>`, actions: [{ label: '확인', primary: true }] });
      return null;
    } },
    talent: { name: '인재', gold: 200, run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 200) return SK.toast('금이 부족합니다. (필요 금 200)');
      const gens = s.heroes.filter((h) => h.city === cityId);
      if (gens.length >= 8) return SK.toast('이 성에는 더 이상 장수를 둘 수 없습니다.');
      const pool = availableGenerals();
      if (!pool.length) return SK.toast('등용할 수 있는 인재가 없습니다.');
      const sample = [];
      const bag = pool.slice();
      while (sample.length < 24 && bag.length) sample.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
      const cost = { S: 600, A: 400, B: 250, C: 200 };
      const rows = sample.map((g) => {
        const cls = SK.genClass(g);
        const c = cost[g.tier] || 300;
        const on = s.gold >= c;
        return `<button class="gen-pick ${on ? '' : 'off'}" data-gid="${g.id}" ${on ? '' : 'disabled'}>
          <span class="tier t${g.tier}">${g.tier}</span>
          <img src="assets/portraits/v2/${SK.genPortrait(g)}.webp" alt="">
          <div class="gp-main"><b>${g.name}</b><span>${SK.CLASSES[cls].name} · ${g.skill || '특기 없음'}</span>
            <em>통 ${g.leadership} 무 ${g.war} 지 ${g.intel}</em></div>
          <span class="gp-cost">금 ${c}</span>
        </button>`;
      }).join('');
      const m = SK.modal({
        kicker: `${CITY[cityId].name} 인재 탐색`,
        title: '누구를 등용할까',
        body: `<p class="talent-note">전국에 ${pool.length}명의 인재가 남아 있습니다. 등급이 높을수록 많은 금이 듭니다.</p><div class="gen-pick-list">${rows}</div>`,
        wide: true,
        actions: [
          { label: '닫기' },
          { label: '다시 찾기', primary: true, keepOpen: false, onClick: () => doCommand('talent') },
        ],
      });
      m.el.querySelectorAll('.gen-pick').forEach((b) => {
        b.onclick = () => {
          const g = SK.GEN_BY_ID[Number(b.dataset.gid)];
          const c = cost[g.tier] || 300;
          if (s.gold < c) { SK.toast('금이 부족합니다.'); return; }
          s.gold -= c;
          s.heroes.push(genHero(g, cityId));
          SK.save();
          m.close();
          SK.openCity(cityId);
          SK.modal({ kicker: '등용', title: `${g.name} 합류!`, body: `<div class="hire-card"><img src="assets/portraits/v2/${SK.genPortrait(g)}.webp"><div><p><b>${g.name}</b> · ${SK.CLASSES[SK.genClass(g)].name}</p><p class="hc-skill">특기 — ${g.skill}</p><p class="hc-stat">통솔 ${g.leadership} · 무력 ${g.war} · 지력 ${g.intel} · 정치 ${g.politics} · 매력 ${g.charm}</p></div></div>`, actions: [{ label: '환영한다', primary: true }] });
        };
      });
      return null;
    } },
    repair: { name: '보수', gold: 120, run(cityId) {
      const s = SK.state; const st = s.cities[cityId];
      if (s.gold < 120) return SK.toast('금이 부족합니다. (필요 금 120)');
      if (st.def >= 100) return SK.toast('성벽이 이미 완벽합니다.');
      s.gold -= 120; st.def = clamp(st.def + 9, 0, 100);
      return '보수 완료 — 성벽 +9';
    } },
  };

  function doCommand(key) {
    const s = SK.state;
    const cityId = s.lastCity;
    const st = s.cities[cityId];
    if (key === 'map') { SK.showMap(); return; }
    if (key === 'sortie') { SK.openSortiePrep(null, cityId); return; }
    const cmd = CMDS[key];
    if (!cmd) return;
    const msg = cmd.run(cityId);
    if (typeof msg === 'string' && msg) {
      SK.toast(msg);
      SK.save();
      SK.refreshHud();
      if (document.querySelector('#screen-city.active')) SK.openCity(cityId);
    }
  }

  /* ───────────── 출진 준비 ───────────── */
  SK.openSortiePrep = function (targetId, fromCityId) {
    const s = SK.state;
    const origin = fromCityId || s.lastCity ||
      SK.CITY_LIST.find((c) => s.cities[c.id].owner === PLAYER && SK.allNeighbors(c.id).some((n) => s.cities[n].owner !== PLAYER))?.id;
    if (!origin) { SK.toast('출진할 아군 거점이 없습니다.'); return; }
    let targets = SK.allNeighbors(origin).filter((n) => s.cities[n].owner !== PLAYER).map((t) => ({ t, from: origin }));
    if (targetId) { openDeploy(origin, targetId); return; }
    if (!targets.length) {
      const seen = new Set();
      SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PLAYER).forEach((pc) => {
        SK.allNeighbors(pc.id).forEach((n) => {
          if (s.cities[n].owner === PLAYER || seen.has(n)) return;
          seen.add(n); targets.push({ t: n, from: pc.id });
        });
      });
    }
    if (!targets.length) {
      SK.modal({ title: '출진할 적성 없음', body: `<p class="modal-p">${CITY[origin].name} 인근의 적 거점을 모두 평정했습니다. 다른 성에서 출진하세요.</p>`, actions: [{ label: '지도로', primary: true, onClick: () => SK.showMap() }] });
      return;
    }
    const rows = targets.map(({ t, from }) => {
      const c = CITY[t], st = s.cities[t], f = SK.FACTIONS[st.owner];
      const bt = SK.battleTypeFor(c);
      return `<button class="target-card" data-t="${t}">
        <span class="tc-flag" style="background:${f.color}">${f.hanja}</span>
        <div class="tc-main"><b>${c.name} <em>${c.hanja}</em></b>
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
    const f = SK.FACTIONS[ts.owner];
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
        <span class="db-flag">${f.hanja}</span>
        <div><b>${f.name}군 ${fmt(ts.troops)}</b><span>성벽 ${ts.def} · ${SK.BATTLE_TYPES[bt].desc}</span></div>
      </div>
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
          <span class="reg-emblem">${SK.CLASSES[r.cls].hanja}</span>
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

  function heroPickRow(h, on, cost) {
    const C = SK.CLASSES[h.cls];
    return `<button class="hero-pick ${on ? 'on' : ''}" data-uid="${h.uid}">
      <img src="assets/portraits/v2/${h.portrait}.webp" alt="">
      <div class="hp-main"><b>${h.name}</b><span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv}</span></div>
      <div class="hp-stats"><span>무 ${h.wu}</span><span>지 ${h.ji}</span><span>통 ${h.tong}</span></div>
      <div class="hp-troops">병력 ${fmt(cost)}</div>
      <span class="hp-check">✓</span>
    </button>`;
  }

  /* ───────────── 다음 달 ───────────── */
  function advanceMonth() {
    const s = SK.state;
    s.month += 1;
    if (s.month >= 12) { s.month = 0; s.year += 1; if (s.eraYear) s.eraYear += 1; }
    s.turn += 1;
    let gold = 0, food = 0, pop = 0;
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (st.owner !== PLAYER) return;
      const base = { capital: 1.5, town: 1, pass: 0.8, fortress: 0.9 }[c.type] || 1;
      gold += Math.round((c.gold / 45 + st.loyalty * 0.6) * base);
      food += Math.round((c.food / 60 + st.loyalty * 0.5) * base);
      pop += Math.round(160 * base);
      if (st.def < 100 && Math.random() < 0.25) st.def = clamp(st.def + 1, 0, 100);
      st.loyalty = clamp(st.loyalty + (Math.random() < 0.5 ? 1 : 0), 0, 100);
      st.troops = clamp(st.troops + 160, 0, 12000);
    });
    s.gold += gold; s.food += food; s.fame += 3;
    // 적 세력도 계절마다 병력을 키운다
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (st.owner === PLAYER) return;
      st.troops = Math.min(18000, Math.round(st.troops * 1.04 + 120));
      if (st.def < 95 && Math.random() < 0.4) st.def = Math.min(95, st.def + 1);
    });
    s.heroes.forEach((h) => {
      if (s.cities[h.city] && s.cities[h.city].owner === PLAYER) {
        h.hp = maxHpOf(h.cls, h.lv);
        h.mp = maxMpOf(h.cls, h.lv);
      }
    });
    SK.save();
    SK.refreshHud();
    if (window.SKMap) SKMap.refresh();
    SK.modal({
      kicker: `건안 ${s.year}년 ${MONTHS[s.month]}`,
      title: '월정산',
      body: `<div class="month-report">
        <div class="mr-row"><span>세입</span><b class="plus">금 +${fmt(gold)}</b></div>
        <div class="mr-row"><span>군량</span><b class="plus">미 +${fmt(food)}</b></div>
        <div class="mr-row"><span>징집</span><b>병 +${fmt(pop)}</b></div>
        <div class="mr-row"><span>명성</span><b>+3</b></div>
        <p class="mr-note">주둔 장수의 체력과 책략이 회복되었습니다.</p>
      </div>`,
      actions: [{ label: '계속', primary: true }],
    });
  }

  /* ───────────── 메뉴 ───────────── */
  function openMenu() {
    const m = SK.modal({
      kicker: '軍令',
      title: '메뉴',
      body: `<div class="menu-list">
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
        <div class="help-item"><b>전장 이동</b><p>부대를 누르면 파란 타일이 나타납니다. 타일을 눌러 이동하고, 붉은 적을 눌러 공격합니다. 화면을 끌면 18×18 전장을 넓게 볼 수 있습니다.</p></div>
        <div class="help-item"><b>책략과 군량</b><p>[책략]으로 병과별 기술을 쓰고, [군량]으로 HP를 회복합니다. [대기] 후 다음 부대로 넘어갑니다.</p></div>
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
    loadTreasures();
    bind();
    if (hasSaveOnBoot()) $('#btn-continue').hidden = false;
  });
  function hasSaveOnBoot() { return SK.hasSave(); }

  // 자동 저장
  setInterval(() => { if (SK.state && document.querySelector('#screen-map.active, #screen-city.active')) SK.save(); }, 8000);
})();
