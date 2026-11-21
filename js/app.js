/* ══════════════════════════════════════════════════════════════
   꼬마영웅 대난투 — 상태·화면·내정
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
    const m = { eun: b ? '은' : '는', i: b ? '이' : '가', eul: b ? '을' : '를', euro: b ? '으로' : '로', gwa: b ? '과' : '와' };
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

  /* ══════════════════════════════════════════════════════════════
     v5.11 — 성마다 따로 쓰는 금·군량 창고
     · 모든 성이 자기 금(cs.gold)·군량(cs.food)을 가진다
     · 지금 다루는 성은 s.purseCity. s.gold / s.food는 그 성의 창고를 가리키는
       가상 속성이라, 기존 명령·건설·징병·수송 코드가 그대로 성 단위로 동작한다
     · 세력 전체 합계는 SK.totalGold / SK.totalFood로 센다
     ══════════════════════════════════════════════════════════════ */
  function purseCs(s) {
    s = s || SK.state;
    if (!s || !s.cities) return null;
    const pf = s.playerFaction || PF();
    const owned = (id) => { const cs = s.cities[id]; return cs && cs.owner === pf ? cs : null; };
    const want = [s.purseCity, s.lastCity, s.playerCapital];
    for (let i = 0; i < want.length; i++) { const cs = want[i] ? owned(want[i]) : null; if (cs) return cs; }
    const c = SK.CITY_LIST.find((x) => owned(x.id));
    return c ? owned(c.id) : null;
  }
  SK.purseCs = purseCs;
  SK.setPurse = function (cityId) {
    const s = SK.state;
    if (!s || !cityId || !s.cities || !s.cities[cityId]) return;
    if (s.cities[cityId].owner === PF()) s.purseCity = cityId;
  };
  function installPurse(st) {
    ['gold', 'food'].forEach((k) => {
      try { delete st[k]; } catch (e) { /* ignore */ }
      Object.defineProperty(st, k, {
        enumerable: false, configurable: true,
        get() { const cs = purseCs(st); return cs ? Math.max(0, Math.round(Number(cs[k]) || 0)) : 0; },
        set(v) { const cs = purseCs(st); if (cs) cs[k] = Math.max(0, Math.round(Number(v) || 0)); },
      });
    });
  }
  SK.installPurse = installPurse;
  SK.totalGold = function (s) {
    s = s || SK.state;
    if (!s || !s.cities) return 0;
    return SK.CITY_LIST.reduce((a, c) => { const cs = s.cities[c.id]; return a + (cs && cs.owner === PF() ? Math.round(cs.gold || 0) : 0); }, 0);
  };
  SK.totalFood = function (s) {
    s = s || SK.state;
    if (!s || !s.cities) return 0;
    return SK.CITY_LIST.reduce((a, c) => { const cs = s.cities[c.id]; return a + (cs && cs.owner === PF() ? Math.round(cs.food || 0) : 0); }, 0);
  };
  SK.ownedPurses = function (s) {
    s = s || SK.state;
    if (!s || !s.cities) return [];
    return SK.CITY_LIST.filter((c) => s.cities[c.id] && s.cities[c.id].owner === PF())
      .map((c) => ({ id: c.id, name: c.name, gold: Math.round(s.cities[c.id].gold || 0), food: Math.round(s.cities[c.id].food || 0),
        troops: Math.round(s.cities[c.id].troops || 0) }));
  };

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

  /* 시작 등급 — 대도시·중도시는 Lv.2, 소도시·관문·요새는 Lv.1 */
  function enforceStartLevel(cs, c) {
    const want = (c.type === 'capital' || c.type === 'mid') ? 2 : 1;
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

  /* v5.5 — 대도시 12 · 중도시 20 · 소도시 37 · 관문 9 · 요새 2 (80거점).
     관문·요새는 도시의 40~45%, 중도시는 소도시의 1.22배 수입을 가진다 */
  const ECON_MUL = { capital: 1.5, mid: 1.22, town: 1, pass: 0.42, fortress: 0.45 };
  function econMul(c) { return ECON_MUL[c.type] || 1; }
  SK.econMul = econMul;
  /* v5 — 인구를 실제 도시 규모로 올린다
     관문·요새 3~6만 · 소도시 8~15만 · 중도시 15~24만 · 대도시 25~45만 */
  const BIG_CAPITALS = ['luoyang', 'changan', 'ye', 'chengdu', 'jianye', 'xuchang'];
  function basePop(c) {
    const h = hashStr(c.id);
    const v = (h % 1000) / 1000;                     // 0~1 고정 난수
    if (c.type === 'capital') {
      const big = BIG_CAPITALS.indexOf(c.id) >= 0;
      const lo = big ? 300000 : 250000, hi = big ? 450000 : 380000;
      return Math.round(lo + (hi - lo) * v);
    }
    if (c.type === 'mid') return Math.round(150000 + 90000 * v);
    if (c.type === 'town') return Math.round(80000 + 70000 * v);
    if (c.type === 'pass') return Math.round(30000 + 30000 * v);
    return Math.round(36000 + 24000 * v);            // 요새
  }
  function cityPopCap(c) {
    return Math.round(({ capital: 700000, mid: 420000, town: 260000, pass: 90000, fortress: 110000 }[c.type] || 150000));
  }

  /* v5.5 — 매달 인구 증감. 민심·치안·농업·상업·시설 Lv 합이 오를수록 더 빨리 늘고,
     민심·치안이 무너지면 줄어든다. 성 화면 (+N/월)과 월정산이 같은 함수를 쓴다. */
  function popMonthly(cs, c) {
    if (!cs) return 0;
    const morale = cs.loyalty == null ? 50 : cs.loyalty;
    const order = cs.order == null ? 55 : cs.order;
    const lvSum = (cs.slots || []).reduce((a, sl) => a + (sl.key ? (sl.lv || 1) : 0), 0);
    const tech = SK.techPct ? SK.techPct('popPct') : 0;
    const rate = 0.0022
      + (cs.agri || 0) / 100 * 0.0060
      + (cs.comm || 0) / 100 * 0.0035
      + (morale - 50) / 100 * 0.0060
      + (order - 50) / 100 * 0.0030
      + lvSum * 0.00009
      + tech / 100;
    const r = clamp(rate, -0.012, 0.022);
    const cap = cityPopCap(c || CITY[cs.id] || { type: 'town' });
    const raw = Math.round((cs.pop || 0) * r);
    if (raw > 0 && (cs.pop || 0) + raw > cap) return Math.max(0, cap - (cs.pop || 0));
    return raw;
  }
  SK.popMonthly = popMonthly;

  /* ══════════════════════════════════════════════════════════════
     v5.4 — 내정 경제 밸런스
     · 매달 금: 도시 세수 + 시장 Lv.1~5 + 관작 봉급 − 휘하 장수 봉급
     · 매달 군량: 도시 기본 쌀 수확은 없앴다. 병력 1,000명당 유지비만 나간다
     · 10월: 농업도·민심·농원 Lv·기술을 합산한 🌾 가을 대수확 한 번
     ══════════════════════════════════════════════════════════════ */
  const ECON = {
    upkeepPer1000: 20,            // 병력 1,000명당 매달 군량
    startFoodMonths: 12.0,        // 시작 군량 — 첫 수확까지 버티는 유지비 개월치 (v5.22 10.5→12: 병력이 늘어 유지비가 오르며 조조·유비가 9월에 굶던 것)
    harvestMonth: 9,              // 0-indexed 10월
    harvestBase: 0.30,            // 도시 기본 곡식(c.food) → 대수확 기준량
    harvestFarm: 0.09,            // 농원 Lv × 담당 배율 → 대수확 추가 배율
    farmTrickle: 30,              // 농원 Lv.1당 매달 비축 군량 (담당 배율 전). 주 수입은 10월 대수확
    marketGold: [0, 110, 180, 280, 400, 560],   // 시장 Lv.1~5 매달 금 (담당 배율 전)
    salary: { S: 28, A: 19, B: 14, C: 10 },     // 장수 등급별 매달 금 봉급
    lordExtra: 4,                 // 군주는 봉급이 조금 더 든다
    buildNew: 300,                // 공터 건설
    buildUp: [0, 550, 1200, 2600, 5200],        // Lv.1→2 … Lv.4→5 증축 (금이 쌓일 곳)
    famineLoyalty: 3,             // 군량이 바닥나면 성마다 민심 −3
    famineDesert: 0.03,           // 병력 3%가 굶어 대열을 떠난다
  };
  SK.ECON = ECON;

  /* ══════════════════════════════════════════════════════════════
     v5.31 — 보물의 내정·외교 효과를 성/장수 단위로 읽는다
     · 옥환대(내정 수입 +10%)·금관옥보(도시 내정 효율 +18%)·측우기(농업·수리 +14%) 같은
       문구가 '그 장수가 있는 성'의 세수·시장·군량 유지비에 실제로 붙는다.
     · 외교 성공률·호감도는 사자를 보내는 장수(actor)가 지닌 보물로 본다.
     ══════════════════════════════════════════════════════════════ */
  const heroTfxCache = new Map();
  function heroTfx(h) {
    if (!h || !SK.heroTreasureFx) return null;
    const key = h.uid + '|' + Object.values(h.equip || {}).join(',');
    const hit = heroTfxCache.get(key);
    if (hit) return hit;
    const fx = SK.heroTreasureFx(h);
    heroTfxCache.set(key, fx);
    if (heroTfxCache.size > 400) heroTfxCache.clear();
    return fx;
  }
  /* 성에 있는 장수들의 보물 효과 합 (상한을 둬서 보물 몇 개로 경제가 뒤집히지 않게) */
  function cityTfx(cityId, key, cap) {
    const s = SK.state;
    if (!s || !s.heroes) return 0;
    let v = 0;
    s.heroes.forEach((h) => {
      if (h.city !== cityId || h.captured) return;
      const fx = heroTfx(h);
      if (fx && fx[key]) v += fx[key];
    });
    return Math.min(cap == null ? 40 : cap, v);
  }
  SK.cityTfx = cityTfx;
  SK.heroTfx = heroTfx;

  /* 행군 중인 병력 — 성에서 빠져나갔지만 군량은 먹는다 */
  function marchTroopsOf(s) {
    return (s.marches || []).reduce((a, m) => a + (m.units || []).reduce((b, u) => b + (u.troops || 0), 0), 0);
  }
  /* 이번 달 병력 유지비 (군량) */
  function upkeepOf(s) {
    s = s || SK.state;
    if (!s) return 0;
    let up = 0;
    SK.CITY_LIST.forEach((c) => {
      const cs = s.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      /* v5.31 — 목우유마설계도(군량 소모 −25%) 같은 보물은 그 성 병력의 유지비를 깎는다 */
      const cut = Math.min(0.4, cityTfx(c.id, 'supply', 40) / 100);
      up += Math.ceil((cs.troops || 0) / 1000 * ECON.upkeepPer1000 * (1 - cut));
    });
    up += Math.ceil(marchTroopsOf(s) / 1000 * ECON.upkeepPer1000);
    return up;
  }
  SK.upkeepOf = upkeepOf;

  /* 장수 한 명의 매달 금 봉급 — 등급 + 레벨. 군주는 조금 더 든다 */
  function heroSalary(h) {
    const s = SK.state;
    const base = ECON.salary[h.tier] || ECON.salary.B;
    const lord = s && s.factions ? ((s.factions[PF()] || {}).lord || '') : '';
    const extra = (lord && h.name === lord) ? ECON.lordExtra : 0;
    /* v5.8 — 관직 봉급이 더해진다 */
    const office = SK.officeSalary ? SK.officeSalary(h) : 0;
    return Math.round((base + extra + office) * (1 + Math.max(0, (h.lv || 1) - 1) * 0.03));
  }
  SK.heroSalary = heroSalary;
  function payrollOf(s) {
    s = s || SK.state;
    if (!s || !s.heroes) return 0;
    return s.heroes.reduce((a, h) => a + heroSalary(h), 0);
  }
  SK.payrollOf = payrollOf;

  /* 다음 가을 대수확까지 남은 개월 (이번 달 이미 거둔 10월이면 12) */
  function monthsUntilHarvest(s) {
    s = s || SK.state;
    const d = ((ECON.harvestMonth - ((s && s.month) || 0)) + 12) % 12;
    return d || 12;
  }
  SK.monthsUntilHarvest = monthsUntilHarvest;

  /* 10월 대수확 — 성마다 농업도·민심·농원 Lv·기술을 함께 센다 */
  function harvestOf(s) {
    s = s || SK.state;
    const fPct = 1 + (SK.techPct ? SK.techPct('foodPct') : 0) / 100;
    let total = 0; const rows = [];
    SK.CITY_LIST.forEach((c) => {
      const cs = s.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      let farmM = 0;
      (cs.slots || []).forEach((sl) => {
        if (sl.key !== 'farm') return;
        farmM += ECON.harvestFarm * (sl.lv || 1) * slotMul(cs, sl, slotOwner(c.id, sl));
      });
      const agriM = 0.6 + (cs.agri || 0) / 100;
      const morM = 0.85 + (cs.loyalty == null ? 50 : cs.loyalty) / 250;
      const v = Math.round(c.food * ECON.harvestBase * agriM * morM * (1 + farmM) * fPct);
      if (v > 0) { total += v; rows.push({ id: c.id, city: c.name, food: v, farm: Math.round(farmM * 100) }); }
    });
    return { total: total, rows: rows };
  }
  SK.harvestOf = harvestOf;

  /* 이번 달 예상 수지 — 상단 경제 줄과 월정산이 같은 계산을 쓴다 */
  function econForecast(s) {
    s = s || SK.state;
    if (!s) return null;
    let tax = 0, market = 0, farm = 0;
    const gPct = 1 + (SK.techPct ? SK.techPct('goldPct') : 0) / 100;
    const taxMul = taxRateOf(s).mul;
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (!st || st.owner !== PF()) return;
      const base = econMul(c);
      const morale = st.loyalty;
      const moraleMul = morale >= 70 ? 1.15 : morale < 40 ? 0.85 : 1;
      /* v5.31 — 보물 내정 수입 (+N%) */
      const incMul = 1 + cityTfx(c.id, 'income', 60) / 100;
      tax += Math.round((c.gold / 22 + morale * 1.1) * base * moraleMul * (0.85 + st.comm / 250) * gPct * taxMul * incMul);
      (st.slots || []).forEach((sl) => {
        if (!sl.key) return;
        const mul = slotMul(st, sl, slotOwner(c.id, sl)) * incMul;
        if (sl.key === 'market') market += Math.round(ECON.marketGold[clamp(sl.lv, 1, 5)] * mul);
        else if (sl.key === 'workshop') market += Math.round((40 + sl.lv * 40) * mul);
        else if (sl.key === 'farm') farm += Math.round(ECON.farmTrickle * sl.lv * mul * econMul(c));
      });
    });
    const rank = SK.rankFor(s.fame);
    const payroll = payrollOf(s);
    const upkeep = upkeepOf(s);
    return {
      tax, market, rank: rank.salaryGold || 0, payroll, heroes: (s.heroes || []).length,
      goldNet: tax + market + (rank.salaryGold || 0) - payroll,
      farm, upkeep, foodNet: farm - upkeep,
      months: monthsUntilHarvest(s), harvest: s.month === ECON.harvestMonth ? 0 : harvestOf(s).total,
    };
  }
  SK.econForecast = econForecast;

  /* ══════════════════════════════════════════════════════════════
     v5.7 — 태수 위임 방침 5종 · 세율 3단계 · 군량 시세
     ══════════════════════════════════════════════════════════════ */
  const POLICIES = {
    balanced: { name: '균형', short: '민심·농업·상업·수비 고루', desc: '민심·병력·성벽·재정·훈련을 차례로 살핍니다.' },
    trade:    { name: '상업 중시', short: '시장·상업 개발 우선', desc: '상업과 금고를 먼저 키웁니다. 병력은 상한의 75%만 채웁니다.' },
    farm:     { name: '농업 중시', short: '농원·개간·민심 우선', desc: '개간과 민심으로 10월 대수확을 키웁니다.' },
    war:      { name: '전시 체제', short: '징병·훈련·성벽 우선', desc: '징병·훈련·성벽 보수로 성을 요새로 만듭니다.' },
    supply:   { name: '수송 중시', short: '잉여 병력을 지정 성으로', desc: '싸우지 않고 남는 병력을 지정한 성으로 매달 보냅니다.' },
  };
  SK.POLICIES = POLICIES;
  const POLICY_KEYS = ['balanced', 'trade', 'farm', 'war', 'supply'];
  SK.POLICY_KEYS = POLICY_KEYS;
  function policyOf(cs) { return cs && POLICIES[cs.policy] ? cs.policy : 'balanced'; }
  SK.policyOf = policyOf;

  /* 세율 — 전 거점 공통. 낮음은 민심이 오르고, 높음은 금이 늘고 민심이 준다 */
  const TAX_RATES = {
    low:    { name: '낮음', mul: 0.75, loyal: 2, desc: '세수×0.75 · 민심+2' },
    normal: { name: '보통', mul: 1, loyal: 0, desc: '세수×1 · 민심 그대로' },
    high:   { name: '높음', mul: 1.35, loyal: -3, desc: '세수×1.35 · 민심−3' },
  };
  SK.TAX_RATES = TAX_RATES;
  function taxRateOf(s) { return TAX_RATES[(s && s.taxRate) || 'normal'] || TAX_RATES.normal; }
  SK.taxRateOf = taxRateOf;

  /* 군량 시세 — 금 100으로 살 수 있는 쌀(군량). 10월 수확 뒤에 싸고 봄에 비싸다 */
  const RICE_YIELD = [96, 88, 85, 90, 96, 104, 118, 132, 150, 160, 148, 120];
  function ricePrice(s) {
    s = s || SK.state;
    if (!s) return 120;
    const base = RICE_YIELD[((s.month % 12) + 12) % 12] || 120;
    const j = (hashStr('rice' + (s.turn || 1)) % 13) - 6;    // 매달 ±6 변동
    return clamp(Math.round(base + j), 80, 160);
  }
  SK.ricePrice = ricePrice;
  function riceCheap(s) { return ricePrice(s) >= 130; }
  SK.riceCheap = riceCheap;

  /* 연병장 수련 명단 — 달이 바뀔 때 행동을 써서 개인 경험치를 얻는다 */
  function trainCrewOf(cs) {
    if (!cs) return [];
    if (!Array.isArray(cs.trainCrew)) cs.trainCrew = [];
    return cs.trainCrew;
  }
  SK.trainCrewOf = trainCrewOf;
  function crewGain(sl, h) {
    const lv = sl && sl.lv ? sl.lv : 1;
    return Math.round(34 + lv * 11 + ((h && h.tong) || 60) * 0.25);
  }
  SK.crewGain = crewGain;

  /* 충성 — 포상으로 오르고, 낮으면 전투에서 힘을 덜 쓴다 (v5.8 이간·항복의 바탕) */
  function loyalOf(h) { return h && h.loyal != null ? h.loyal : 100; }
  SK.loyalOf = loyalOf;
  function loyalGain(loyal, kind) {
    if (kind === 'treasure') return 15;
    const l = loyal == null ? 100 : loyal;
    if (l >= 90) return 2;
    if (l >= 70) return 4;
    return 8;
  }
  SK.loyalGain = loyalGain;

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
        agri: ({ capital: 34, mid: 29, town: 25, pass: 19, fortress: 21 }[c.type] || 24) + (h % 9),
        comm: ({ capital: 31, mid: 26, town: 23, pass: 17, fortress: 19 }[c.type] || 22) + ((h >> 3) % 10),
        train: 50,                        // 시작 훈련도는 50 (v4.2)
        gold: 0, food: 0, genIds: [], advisor: null, governor: null, auto: true, bandit: false,
        slots: null, scoutedUntil: 0, wounded: 0,          // v5.9 — 부상병(회복중)
      };
      ensureSlots(cities[c.id], c);
    });
    const st = {
      version: 5, year: 1, month: 0, gold: 0, food: 0, fame: 0, turn: 1,
      cities, heroes: [], citiesOwned: 0, log: [], lastCity: 'xuchang', treasures: [],
      playerFaction: factionId || 'caocao', factions: {}, scenario: sc ? Number(sc.id) : null,
      eraYear: sc ? Number(sc.year) : 200, timelineSeen: [], talentLuck: 0, talentsVersion: 3,
      rp: 0, techs: [], truce: {}, pacts: {}, genLoyal: {}, deadGens: {}, deadNames: {},
      marches: [], marchSeq: 0, pendingMarch: null, recruitFail: {}, autoBestDuty: false,
      prisoners: [], captured: [],   // v5.11 — 억류 포로 · 적에게 사로잡힌 아군
      codex: { g: {}, t: {} },        // v5.16 — 인물·보물 도감 누적 기록
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
      /* v5.11 — 중립 공백지도 토호 수비병 1,500~2,500명은 지킨다 (거저먹기 방지) */
      cs.troops = 1500 + (h % 1001);
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
    /* v5.8 — 난이도: 쉬움은 시작 자금을 35% 더 주고, 어려움은 20% 덜다 */
    st.difficulty = DIFFICULTIES[chosenDiff] ? chosenDiff : 'normal';
    const dMul = (DIFFICULTIES[st.difficulty] || DIFFICULTIES.normal).goldMul;
    st.gold = Math.round(Math.min(4000, 1150 + nOwn * 330 + (hashStr('g' + st.playerFaction) % 90)) * dMul);
    /* v5.4 — 시작 군량은 첫 해 10월 대수확까지 버티는 유지비 10.5개월치.
       병력이 많은 대세력은 더 많이, 1성 소세력은 적게 시작한다(±5%). */
    let startTroops = 0;
    playerCities.forEach((c) => { startTroops += (st.cities[c.id].troops || 0); });
    const startUpkeep = Math.ceil(startTroops / 1000 * ECON.upkeepPer1000);
    const fVar = 1 + ((hashStr('f' + st.playerFaction) % 80) - 40) / 800;
    st.food = Math.round(startUpkeep * ECON.startFoodMonths * fVar);
    seedRoster(st, f, capital, ownedIds);
    giveStarters(st);
    assignGarrisons(st);
    seedTalents(st);
    appointDefaults(st);
    /* v5.11 — 시작 금·군량을 성별 창고로 나눠 담는다 (인구 비례, 나머지는 수도) */
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (cs.owner !== st.playerFaction) {
        const hh = hashStr('p' + c.id);
        cs.gold = cs.owner === 'neutral' ? 120 + (hh % 180) : 240 + (hh % 420);
        cs.food = cs.owner === 'neutral' ? 200 + (hh % 320) : 380 + (hh % 620);
        return;
      }
      cs.gold = 0; cs.food = 0;
    });
    const totalG = Math.round(st.gold || 0), totalF = Math.round(st.food || 0);
    const sumPop = playerCities.reduce((a, c) => a + (st.cities[c.id].pop || 1), 0) || 1;
    let leftG = totalG, leftF = totalF;
    playerCities.forEach((c, i) => {
      const cs = st.cities[c.id];
      const last = i === playerCities.length - 1;
      const share = (cs.pop || 1) / sumPop;
      const g = last ? leftG : Math.round(totalG * share);
      const ff = last ? leftF : Math.round(totalF * share);
      cs.gold = Math.max(0, g); cs.food = Math.max(0, ff);
      leftG -= cs.gold; leftF -= cs.food;
      if (c.id === capital) { cs.gold += Math.max(0, leftG); cs.food += Math.max(0, leftF); leftG = 0; leftF = 0; }
    });
    st.gold = 0; st.food = 0;   // 아래 installPurse가 가상 속성으로 바꾸기 전 임시값
    delete st.gold; delete st.food;
    st.purseCity = capital;
    installPurse(st);
    return st;
  }

  /* 세력 하나가 거느릴 장수 수 — 큰 세력은 12~25명, 작은 군웅은 6~10명 */
  const MAJOR_FACTIONS = ['dongzhuo', 'yuanshao', 'caocao', 'liubei', 'sunjian', 'sunquan', 'yuanshu',
    'liubiao', 'liuyan', 'mateng', 'gongsunzan', 'taoqian', 'liuzhang', 'liuzong',
    'cao_wei_pre', 'cao_wei', 'shu_han', 'sun_wu', 'goguryeo', 'baekje', 'silla', 'joseon', 'goryeo'];
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
      const add = (n, locked) => {
        const nm = SK.normName(n);
        const g = nm ? SK.GEN_BY_NAME[nm] : null;
        if (!g || used.has(g.id)) return;
        /* v5.19 — 시나리오가 명시한 startGenerals는 등장 연도와 상관없이 그 세력 장수다.
           (190년 1막 드림팀: 제갈량·강유·주유·여몽 등) */
        if (!locked && !SK.debutOk(g, year)) return;          // 아직 세상에 나오지 않은 인물
        names.push(nm); used.add(g.id);
      };
      /* v5.2 — 시나리오 단계에서 확정한 시작 명부(startGenerals)를 그대로 쓴다.
         카드에 보이는 장수 수와 인게임 시작 장수 수가 어긋나지 않는다. */
      if (f.startGenerals && f.startGenerals.length) {
        f.startGenerals.forEach((n) => add(n, true));
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
        /* v5.27 — 군주가 다스리는 성도 군사가 비어 있으면 앉혀 둔다 */
        if (!cs.advisor) {
          const strat = gens.filter((h) => h.uid !== lordHero.uid)
            .sort((a, b) => (b.ji * 0.7 + b.cha * 0.3) - (a.ji * 0.7 + a.cha * 0.3))[0];
          if (strat) { cs.advisor = strat.uid; changed = true; }
        }
        return;
      }
      if (lordHero && cs.governor === lordHero.uid) { cs.governor = null; changed = true; }
      if (cs.governor == null && gens.length) {
        const gov = gens.slice().sort((a, b) => (b.pol * 0.6 + b.tong * 0.4) - (a.pol * 0.6 + a.tong * 0.4))[0];
        if (gov) { cs.governor = gov.uid; changed = true; }
      }
      /* v5.8 — 태수와 군사가 같은 사람이 되지 않게 한다 (군주가 성을 떠난 뒤 자주 생김) */
      if (gens.length && cs.advisor && cs.advisor === cs.governor) {
        const strat = gens.filter((h) => h.uid !== cs.governor)
          .sort((a, b) => (b.ji * 0.7 + b.cha * 0.3) - (a.ji * 0.7 + a.cha * 0.3))[0];
        cs.advisor = strat ? strat.uid : null;
        changed = true;
      }
      /* v5.27 — 새로 차지한 성에 군사가 빈 채로 남던 문제. 장수가 둘 이상이면
         태수와 다른 사람 중 지력·매력이 가장 나은 장수를 군사로 앉힌다. */
      if (gens.length > 1 && !cs.advisor) {
        const strat = gens.filter((h) => h.uid !== cs.governor)
          .sort((a, b) => (b.ji * 0.7 + b.cha * 0.3) - (a.ji * 0.7 + a.cha * 0.3))[0];
        if (strat) { cs.advisor = strat.uid; changed = true; }
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

  /* ══════════════════════════════════════════════════════════════
     v5.32 — 세상에 이미 소속이 있는 장수 id 모음.
     주점(seedTalents·refillTalents)·탐색·선택지가 이 장수들을 '재야 인재'로 다시 풀지 않는다.
     · 내 장수·포로·각 성 주둔(genIds)·주점에 이미 선 인재
     · AI 세력 명부(f.generals)에 올라 있는 장수 — 성에 다 앉히지 못했더라도 소속이 있다
     ══════════════════════════════════════════════════════════════ */
  function garrisonedIds(st) {
    const used = new Set();
    if (!st) return used;
    (st.heroes || []).forEach((h) => { if (h && h.genId != null) used.add(h.genId); });
    (st.prisoners || []).forEach((r) => { if (r && r.gid != null) used.add(r.gid); });
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities && st.cities[c.id];
      if (!cs) return;
      (cs.genIds || []).forEach((id) => used.add(id));
      (cs.talents || []).forEach((id) => used.add(id));
    });
    Object.keys(st.factions || {}).forEach((fid) => {
      if (fid === 'neutral') return;
      const f = st.factions[fid];
      if (!f) return;
      (f.generals || []).forEach((n) => { const g = SK.GEN_BY_NAME[n]; if (g) used.add(g.id); });
    });
    return used;
  }
  SK.garrisonedIds = garrisonedIds;

  /* 적성 수비 장수 — 그 성의 세력 인물로만 (지역·계열이 다른 인물은 세우지 않는다)
     v5.32 — 성마다 3~4명만 앉히고 남은 장수를 버리던 버그 수정:
     · 1성 세력은 그 성에 전원 배치 (성도 유언군 6명·하비 도겸군 6명·거록 장각군 7명)
     · 여러 성이면 성마다 고루 나눠 남는 장수 0명
     · 남는 장수가 없으니 진등·요화 같은 타 세력 장수가 주점에 새어 나오지 않는다 */
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
      /* v5.32 — 장부(f.generals)에 올라 있는 장수는 그 세력 소속이다. 예전에는 데이터상
         계열(진등·요화 = 촉)이 세력 풀(군웅)과 다르면 배치에서 빠져 주점으로 새어 나갔다.
         이제 계열 일치는 '수도 앞자리 우선순위'로만 쓰고, 등장 연도만 실제 조건으로 본다. */
      const pool = ((f && f.generals) || []).map((n) => SK.GEN_BY_NAME[n]).filter(Boolean)
        .filter((g) => SK.debutOk(g, year));
      const inPool = (g) => (genPoolGroup(g) === grp ? 1 : 0);
      pool.sort((a, b) => (inPool(b) - inPool(a)) || (rank[a.tier] - rank[b.tier]) || (b.war + b.intel) - (a.war + a.intel));
      byFaction[k] = pool;
    });
    // 수도를 먼저 채워 우두머리가 수도에 서게 한다
    const order = SK.CITY_LIST.slice().sort((a, b) => (a.type === 'capital' ? -1 : 0) - (b.type === 'capital' ? -1 : 0));
    const citiesOf = {};
    order.forEach((c) => {
      const cs = st.cities[c.id];
      if (!cs) return;
      if (cs.owner === 'neutral') { cs.genIds = []; return; }
      if (cs.owner === st.playerFaction) return;
      (citiesOf[cs.owner] = citiesOf[cs.owner] || []).push({ c, cs });
    });
    Object.keys(citiesOf).forEach((fid) => {
      const cities = citiesOf[fid];
      const pool = (byFaction[fid] || []).filter((g) => !used.has(g.id));
      cities.forEach(({ cs }) => { cs.genIds = []; });
      /* 도시 데이터의 태수는 자기 성에 먼저 앉힌다 */
      const reserved = new Set();
      cities.forEach(({ c, cs }) => {
        const gov = SK.GEN_BY_NAME[SK.normName(c.governor)];
        if (!gov || reserved.has(gov.id) || used.has(gov.id)) return;
        if (!pool.some((g) => g.id === gov.id)) return;
        cs.genIds.push(gov.id); reserved.add(gov.id); used.add(gov.id);
      });
      const rest = pool.filter((g) => !reserved.has(g.id));
      let idx = 0;
      /* 1차 — 성마다 기본 인원 (수도 4 · 그 밖 3) */
      cities.forEach(({ c, cs }) => {
        const want = c.type === 'capital' ? 4 : 3;
        while (cs.genIds.length < want && idx < rest.length) {
          const g = rest[idx++];
          if (used.has(g.id)) continue;
          cs.genIds.push(g.id); used.add(g.id);
        }
      });
      /* 2차 — 남은 장수는 성을 돌아가며 전원 배치 (한 성뿐이면 그 성에 모두) */
      let guard = 0;
      while (idx < rest.length && guard++ < 4000) {
        cities.forEach(({ cs }) => {
          while (idx < rest.length) {
            const g = rest[idx++];
            if (used.has(g.id)) continue;
            cs.genIds.push(g.id); used.add(g.id);
            return;
          }
        });
      }
    });
  }
  SK.assignGarrisons = assignGarrisons;

  /* v5.32 — QA: 다른 세력 소속 장수가 주점·주둔 명부에 섞였는지 전수 검사 */
  SK.garrisonLeaks = function () {
    const st = SK.state;
    const out = [];
    if (!st) return out;
    const ownerOf = {};
    Object.keys(st.factions || {}).forEach((fid) => {
      if (fid === 'neutral') return;
      ((st.factions[fid] || {}).generals || []).forEach((n) => { const g = SK.GEN_BY_NAME[n]; if (g) ownerOf[g.id] = fid; });
    });
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (!cs) return;
      (cs.talents || []).forEach((id) => {
        if (ownerOf[id]) out.push({ city: c.name, kind: 'talent', gen: (SK.GEN_BY_ID[id] || {}).name, faction: ownerOf[id], owner: cs.owner });
      });
      (cs.genIds || []).forEach((id) => {
        const fid = ownerOf[id];
        if (fid && fid !== cs.owner) out.push({ city: c.name, kind: 'garrison', gen: (SK.GEN_BY_ID[id] || {}).name, faction: fid, owner: cs.owner });
      });
    });
    return out;
  };

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
    /* v5.32 — 각 성 주둔 장수뿐 아니라 AI 세력 명부(f.generals)의 장수까지 '소속 있음'으로 잡는다.
       예전에는 배치에서 탈락한 진등(도겸군)·요화(장각군)가 그대로 재야 인재로 주점에 섰다. */
    const used = garrisonedIds(st);
    const lordName = (st.factions[st.playerFaction] || {}).lord;
    /* v5.20 — 다른 세력의 군주·왕은 주점 인재 줄에 앉지 않는다 */
    const lordSet = SK.lordNameSet(st);
    const groups = ['위', '촉', '오', '군웅', '한국'];
    const buckets = {};
    groups.forEach((grp) => { buckets[grp] = { S: [], A: [], B: [], C: [] }; });
    SK.GENERALS.forEach((g) => {
      if (used.has(g.id) || g.name === lordName) return;
      if (SK.isLordOnly(g, lordSet)) return;
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
    /* v5.22 — 왕실 인물을 재야에서 빼면서 한국 주점 풀이 바닥나, 내 본성(완산 등)에
       인재가 한 명도 없는 판이 생겼다. 남은 재야로 빈 성을 한 명, 내 본성은 두 명까지 채운다. */
    const spare = {};
    groups.forEach((grp) => { spare[grp] = []; });
    SK.GENERALS.forEach((g) => {
      if (used.has(g.id) || SK.isLordOnly(g, lordSet) || !SK.debutOk(g, year)) return;
      const grp = genPoolGroup(g);
      if (spare[grp]) spare[grp].push(g.id);
    });
    groups.forEach((grp) => spare[grp].sort((a, b) => SK.genScore(SK.GEN_BY_ID[b]) - SK.genScore(SK.GEN_BY_ID[a]) || a - b));
    const homeCap = SK.CITY_LIST.find((c) => c.type === 'capital' && st.cities[c.id].owner === st.playerFaction)
      || SK.CITY_LIST.find((c) => st.cities[c.id].owner === st.playerFaction);
    /* v5.23 — 빈 주점의 긴급 보충은 '같은 지역' 안에서만 한다.
       전에는 한국 풀이 바닥나면 위·촉·오 인물을 한국 성에 앉혀, 완산·개성 주점에
       관우·조조 같은 중국 인재가 서는 일이 있었다. 이제 한국 성은 한국 인재로만 채운다. */
    const regionOf = (grp) => (grp === '한국' ? '한국' : '중국');
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      const want = homeCap && homeCap.id === c.id ? 2 : 1;
      if ((cs.talents || []).length >= want) return;
      const grp = tavernGroupOf(st, c.id);
      const pools = [spare[grp] || []].concat(groups.filter((x) => x !== grp && regionOf(x) === regionOf(grp)).map((x) => spare[x]));
      for (let pi = 0; pi < pools.length && cs.talents.length < want; pi++) {
        while (pools[pi].length && cs.talents.length < want) {
          const id = pools[pi].shift();
          if (used.has(id) || cs.talents.indexOf(id) >= 0) continue;
          cs.talents.push(id); used.add(id);
        }
      }
    });
  }

  /* 해가 바뀔 때 — 새로 성년이 된 명장을 각지 주점에 풀어 놓는다 (v5) */
  SK.refreshDebut = function (st) {
    const yr = eraYearOf(st);
    const lordSet = SK.lordNameSet(st);
    const used = new Set();
    st.heroes.forEach((h) => { if (h.genId) used.add(h.genId); });
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      (cs.talents || []).forEach((id) => used.add(id));
      (cs.genIds || []).forEach((id) => used.add(id));
    });
    const fresh = SK.GENERALS.filter((g) => Number(g.debutYear) === yr && !used.has(g.id) && !SK.isLordOnly(g, lordSet));
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

  /* v5.10 — 공훈치. 경험치와 함께 쌓이는 장수 개인의 공적 (관직 서임 기준) */
  SK.gainMerit = function (h, n) {
    if (!h || !n) return SK.meritOf ? SK.meritOf(h) : 0;
    h.merit = Math.max(0, Math.round((Number(h.merit) || 0) + Number(n)));
    return h.merit;
  };

  SK.gainExp = function (h, amount, merit) {
    if (!h) return [];
    /* v5.29 — 보물 '부대 경험치 획득량 +N%' (삼략육도 등) */
    const expFx = (SK.heroTreasureFx ? SK.heroTreasureFx(h).exp : 0) || 0;
    if (expFx) amount = Math.round((Number(amount) || 0) * (1 + Math.max(-0.6, Math.min(1.0, expFx / 100))));
    /* v5.10 — 따로 적지 않으면 경험치의 1/12이 공훈치로 따라온다 (전투·탐색·등용이 자연히 쌓인다) */
    const m = merit == null ? Math.max(1, Math.round((Number(amount) || 0) / 12)) : merit;
    if (m) SK.gainMerit(h, m);
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
      /* v5.17 — Lv.10/20/30 전직 연출 대기열 */
      if (after !== before && SK.isPromoLv(h.lv)) SK.queuePromotion(h, h.lv);
    }
    if (h.lv >= 30) h.exp = Math.min(h.exp, SK.expNeed(30));
    return ups;
  };

  /* ══════════════════════════════════════════════════════════════
     v5.17 — 전직 연출 (Lv.10 → Lv.20 → Lv.30)
     레벨이 전직 지점을 넘으면 대기열에 넣고, 다른 창(승리 결산 등)이 닫힌 뒤
     한 명씩 전직 팝업을 띄운다. 새로 해금된 병종 기술도 함께 보여 준다.
     ══════════════════════════════════════════════════════════════ */
  SK.promoQueue = [];
  function skillsAtLevel(cls, lv) {
    const C = SK.CLASSES[cls] || {};
    return (C.skills || []).map((k) => SK.SKILLS[k]).filter((s) => s && Number(s.unlockLv) === Number(lv));
  }
  SK.skillsAtLevel = skillsAtLevel;
  let promoFlushTimer = null;
  SK.queuePromotion = function (h, lv) {
    if (!h || !SK.isPromoLv(lv)) return;
    if ((SK.promoQueue || []).some((x) => x.uid === h.uid && x.lv === lv)) return;
    SK.promoQueue.push({ uid: h.uid, name: h.name, cls: h.cls, lv: lv,
      title: SK.classTitle(h.cls, lv), stage: SK.promoStageOf(lv) });
    if (promoFlushTimer) return;
    promoFlushTimer = setTimeout(SK.flushPromotions, 900);
  };
  SK.flushPromotions = function () {
    promoFlushTimer = null;
    if (!SK.promoQueue || !SK.promoQueue.length) return;
    if (document.querySelector('#modal-root .modal-layer')) { promoFlushTimer = setTimeout(SK.flushPromotions, 1400); return; }
    /* v5.28 — 전장이 열려 있는 동안에는 전직 팝업을 띄우지 않는다 (전투 중 조작 방해) */
    const battleOpen = !!(document.querySelector('#screen-battle.active') && document.getElementById('battle-overlay') && !document.getElementById('battle-overlay').hidden);
    if (battleOpen) { promoFlushTimer = setTimeout(SK.flushPromotions, 1600); return; }
    const p = SK.promoQueue.shift();
    const h = (SK.state && SK.state.heroes || []).find((x) => x.uid === p.uid);
    const cls = SK.CLASSES[p.cls] || {};
    const news = skillsAtLevel(p.cls, p.lv);
    const crown = p.stage >= 3 ? '👑' : p.stage === 2 ? '⚑' : '★';
    const col = p.stage >= 3 ? '#ffd35c' : p.stage === 2 ? '#dfe6ee' : '#c98b3a';
    SK.sfx.play('victory');
    SK.modal({
      kicker: `전직 ${p.stage}단계 · Lv.${p.lv}`,
      title: `${p.name} — ${p.title}`,
      body: `<div class="promo-pop">
        <div class="promo-seal" style="--pc:${col}">${crown}</div>
        <p class="promo-line"><b>${p.name}</b>${hasBatchim(p.name) ? '이' : '가'} Lv.${p.lv}에 이르러 <b>${cls.name || ''}</b>에서 <b>${p.title}</b>${hasBatchim(p.title) ? '으로' : '로'} 전직했습니다.</p>
        <div class="promo-rings"><span class="pr-dot done"></span><span class="pr-dot ${p.stage >= 2 ? 'done' : ''}"></span><span class="pr-dot ${p.stage >= 3 ? 'done' : ''}"></span><em>${p.stage} / 3 전직</em></div>
        ${news.length ? `<div class="promo-skills"><span class="ps-head">새 기술 해금</span>${news.map((sk) => `<div class="ps-row"><b>${sk.name}</b><i>MP ${sk.mp}</i><em>${sk.desc || ''}</em></div>`).join('')}</div>` : '<p class="promo-note">병력 상한과 지휘 능력이 한 단계 올랐습니다.</p>'}
        <p class="promo-note">전장에서 ${p.stage >= 3 ? '금테 오라와 왕관' : p.stage === 2 ? '은테와 깃발' : '동테'}로 한층 위엄 있게 서게 됩니다.${h && p.lv >= 30 ? ' 더 오를 곳이 없는 최종 전직입니다.' : ''}</p>
      </div>`,
      actions: [{ label: '전직을 받아들인다', primary: true, onClick: () => setTimeout(SK.flushPromotions, 400) }],
      dismissible: false,
    });
  };

  SK.state = null;

  SK.save = function () {
    /* v5.16 — 저장할 때마다 도감 누적 기록을 지금 상태와 맞춘다 */
    if (SK.codexMerge) { try { SK.codexMerge(); } catch (e) { /* ignore */ } }
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
      /* v5.29 — 옛 저장의 단일 침공 경고(invasionWarn)를 배열로 옮기고, 대기열도 정리한다 */
      s.invasionQueue = (s.invasionQueue || []).filter((q) => q && s.cities && s.cities[q.target]);
      if (s.invasionWarn && !Array.isArray(s.invasionWarn)) s.invasionWarns = [s.invasionWarn];
      s.invasionWarns = (s.invasionWarns || []).filter((w) => w && s.cities && s.cities[w.target]);
      s.invasionWarn = null;
      if (s.pendingInvasion && (!s.cities[s.pendingInvasion.target] || s.cities[s.pendingInvasion.target].owner !== s.playerFaction)) s.pendingInvasion = null;
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
        if (cs.wounded == null) cs.wounded = 0;   // v5.9 — 부상병
      });
      /* v5.11 — 옛 저장: 세력 공용 s.gold / s.food를 성별 창고로 나눠 담는다 */
      const legacyG = Number(s.gold) || 0, legacyF = Number(s.food) || 0;
      const hasPurse = SK.CITY_LIST.some((c) => s.cities[c.id] && s.cities[c.id].gold != null);
      SK.CITY_LIST.forEach((c) => {
        const cs = s.cities[c.id];
        if (!cs) return;
        if (cs.gold == null) cs.gold = 0;
        if (cs.food == null) cs.food = 0;
      });
      if (!hasPurse) {
        const mine = SK.CITY_LIST.filter((c) => s.cities[c.id] && s.cities[c.id].owner === (s.playerFaction || 'neutral'));
        const sum = mine.reduce((a, c) => a + (s.cities[c.id].pop || 1), 0) || 1;
        let lg = Math.max(0, Math.round(legacyG)), lf = Math.max(0, Math.round(legacyF));
        mine.forEach((c, i) => {
          const cs = s.cities[c.id];
          const last = i === mine.length - 1;
          const share = (cs.pop || 1) / sum;
          const g = last ? lg : Math.round(legacyG * share);
          const ff = last ? lf : Math.round(legacyF * share);
          cs.gold = Math.max(0, g); cs.food = Math.max(0, ff);
          lg -= cs.gold; lf -= cs.food;
        });
      }
      delete s.gold; delete s.food;
      if (!s.purseCity || !s.cities[s.purseCity] || s.cities[s.purseCity].owner !== s.playerFaction) {
        s.purseCity = s.lastCity && s.cities[s.lastCity] && s.cities[s.lastCity].owner === s.playerFaction ? s.lastCity
          : (s.playerCapital || (SK.CITY_LIST.find((c) => s.cities[c.id] && s.cities[c.id].owner === s.playerFaction) || {}).id || null);
      }
      installPurse(s);
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
      if (s.autoBestDuty == null) s.autoBestDuty = false;
      s.prisoners = s.prisoners || [];   // v5.11 — 억류 포로
      s.codex = s.codex || { g: {}, t: {} };   // v5.16 — 도감
      s.captured = s.captured || [];     // v5.11 — 적에게 사로잡힌 아군
      if (s.pendingMarch == null) s.pendingMarch = null;
      /* v5.28 — 같은 달 도착 대기열: 없는 저장은 빈 배열, 사라진 행군은 걸러 낸다 */
      s.marchQueue = (s.marchQueue || []).filter((q) => q && q.marchId && (s.marches || []).some((m) => m.id === q.marchId));
      (s.heroes || []).forEach((h) => { if (!s.marches.some((m) => m.id === h.marchId)) h.marchId = null; });
      /* v5.9 — 저장을 다시 열면 전투가 없으므로, 지원군은 원래 성으로 돌려보낸다 */
      if (s.reinforce) {
        const r = s.reinforce;
        const home = s.cities && s.cities[r.from];
        const back = (r.units || []).reduce((a, u) => a + (u.troops || 0), 0);
        if (home) home.troops = Math.min(cityCap(home), Math.round(home.troops || 0) + back);
        s.reinforce = null;
      }
      (s.heroes || []).forEach((h) => { delete h.rfgTo; });
      /* v5.27 — 전투 중에 앱을 닫거나 새로고침했으면 그 전투는 저장되지 않는다.
         출진해 둔 병력이 그대로 사라지지 않게 출발 성으로 돌려보내고 알린다. */
      s.battleRecover = null;
      if (s.battleInProgress) {
        const bi = s.battleInProgress;
        /* v5.31 — 출발 성이 이미 함락됐으면 가장 가까운 아군 성으로 복귀한다 */
        const hid = fieldHome(bi.origin);
        const home = hid && s.cities ? s.cities[hid] : null;
        if (home && home.owner === s.playerFaction && bi.troops > 0) {
          home.troops = Math.min(cityCap(home), Math.round((home.troops || 0) + bi.troops));
          s.battleRecover = { city: hid, troops: Math.round(bi.troops), from: bi.origin };
        }
        s.battleInProgress = null;
      }
      SK.state = s;
      /* v5.28 — 옛 저장에 남은 0성 유령 세력을 정리 */
      try { pruneLandlessFactions(s); } catch (e) { /* ignore */ }
      /* v5.28 — 저장을 열었을 때 도착 대기열만 남아 있으면 첫 사건을 올린다 */
      if (!s.pendingMarch && s.marchQueue && s.marchQueue.length) promoteMarchQueue(s);
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

  /* ══════════════════════════════════════════════════════════════
     v5.11 — 수동 세이브 5슬롯 (+ 자동 저장 1)
     각 슬롯에 군주 초상·세력명·연월·거점 수·저장 시각을 보여 준다.
     ══════════════════════════════════════════════════════════════ */
  const SLOT_KEY = (i) => `samgukji-jojo-slot-${i}`;
  const SLOT_COUNT = 5;
  SK.SLOT_COUNT = SLOT_COUNT;
  function slotInfo(i) {
    try {
      const raw = localStorage.getItem(SLOT_KEY(i));
      if (!raw) return null;
      const box = JSON.parse(raw);
      if (!box || !box.state) return null;
      return box.meta || {};
    } catch (e) { return null; }
  }
  SK.slotInfo = slotInfo;
  SK.autoSlotInfo = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const f = (s.factions || {})[s.playerFaction] || {};
      const owned = SK.CITY_LIST.filter((c) => s.cities && s.cities[c.id] && s.cities[c.id].owner === s.playerFaction).length;
      const lordG = f.lord ? SK.GEN_BY_NAME[f.lord] : null;
      return { faction: f.name || '', lord: f.lord || '', date: SK.dateLabel(s.eraYear || 190, s.month || 0, s), cities: owned,
        portrait: lordG ? SK.genPortrait(lordG) : 'caocao', savedAt: '자동 저장' };
    } catch (e) { return null; }
  };
  function metaOf(s) {
    const f = (s.factions || {})[s.playerFaction] || {};
    const owned = SK.CITY_LIST.filter((c) => s.cities && s.cities[c.id] && s.cities[c.id].owner === s.playerFaction).length;
    const lordG = f.lord ? SK.GEN_BY_NAME[f.lord] : null;
    return { faction: f.name || '세력', lord: f.lord || '', color: f.color || '#8a6a2c',
      portrait: lordG ? SK.genPortrait(lordG) : 'caocao',
      date: SK.dateLabel(s.eraYear || 190, s.month || 0, s), cities: owned,
      savedAt: new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) };
  }
  SK.saveTo = function (i) {
    if (!SK.state) return false;
    try { localStorage.setItem(SLOT_KEY(i), JSON.stringify({ meta: metaOf(SK.state), state: SK.state })); return true; } catch (e) { return false; }
  };
  SK.loadFrom = function (i) {
    try {
      const raw = localStorage.getItem(SLOT_KEY(i));
      if (!raw) return false;
      localStorage.setItem(SAVE_KEY, JSON.stringify(JSON.parse(raw).state));
      return SK.load();
    } catch (e) { return false; }
  };
  SK.deleteSlot = function (i) { try { localStorage.removeItem(SLOT_KEY(i)); return true; } catch (e) { return false; } };

  function slotRow(label, info, idx, isAuto) {
    const has = !!info;
    return `<div class="save-slot ${has ? 'on' : ''} ${isAuto ? 'auto' : ''}">
      <span class="ss-no">${label}</span>
      ${has ? `<img class="ss-pt" src="${SK.ptSrc(info.portrait || 'caocao')}" alt="">` : '<span class="ss-pt empty">＋</span>'}
      <div class="ss-main">${has
        ? `<b>${info.faction || '세력'}${info.lord ? ` · ${info.lord}` : ''}</b><span>${info.date} · 거점 ${info.cities}곳</span><em>${info.savedAt}</em>`
        : '<b>빈 슬롯</b><span>저장하면 여기에 군주와 연월이 표시됩니다</span>'}</div>
      <div class="ss-btns">
        ${!isAuto ? `<button class="ss-save" data-save="${idx}" title="저장">저장</button>` : ''}
        ${has ? `<button class="ss-load" data-load="${idx}" data-auto="${isAuto ? 1 : 0}" title="불러오기">불러오기</button>` : ''}
        ${has ? `<button class="ss-del" data-del="${idx}" data-auto="${isAuto ? 1 : 0}" title="삭제">삭제</button>` : ''}
      </div>
    </div>`;
  }

  SK.openSaveSlots = function (mode) {
    const auto = SK.autoSlotInfo();
    const body = `<div class="save-wrap">
      <p class="talent-note">수동 슬롯 5개와 자동 저장 1개를 따로 둡니다. 여러 세력을 동시에 키우거나, 큰 결정 앞에서 갈래를 나눠 저장할 수 있습니다.</p>
      ${[1, 2, 3, 4, 5].map((i) => slotRow(`슬롯 ${i}`, slotInfo(i), i, false)).join('')}
      ${slotRow('자동', auto, 0, true)}
    </div>`;
    const m = SK.modal({ kicker: '세이브 · 불러오기', title: mode === 'load' ? '어느 저장으로 돌아갈까' : '세이브 슬롯', body, wide: true, actions: [{ label: '닫기' }] });
    m.el.querySelectorAll('[data-save]').forEach((b) => {
      b.onclick = () => {
        if (!SK.state) { SK.toast('게임을 시작한 뒤 저장할 수 있습니다.'); return; }
        const i = Number(b.dataset.save);
        const info = slotInfo(i);
        const doSave = () => { SK.saveTo(i); SK.sfx.play('ui'); m.close(); SK.toast(`슬롯 ${i}에 저장했습니다.`); setTimeout(() => SK.openSaveSlots('save'), 120); };
        if (info) SK.modal({ title: `슬롯 ${i} 덮어쓰기`, body: `<p class="modal-p">${info.faction} · ${info.date} 저장을 덮어쓸까요?</p>`, actions: [{ label: '취소' }, { label: '덮어쓰기', primary: true, onClick: doSave }] });
        else doSave();
      };
    });
    m.el.querySelectorAll('[data-load]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.load), isAuto = b.dataset.auto === '1';
        const go = () => {
          const ok = isAuto ? SK.load() : SK.loadFrom(i);
          if (!ok) { SK.toast('불러오지 못했습니다.'); return; }
          m.close();
          SK.startGame(false);
          SK.toast('저장을 불러왔습니다.');
        };
        SK.modal({ title: '불러오기', body: '<p class="modal-p">지금 진행 중인 내용은 사라집니다. 불러올까요?</p>', actions: [{ label: '취소' }, { label: '불러오기', primary: true, onClick: go }] });
      };
    });
    m.el.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.del), isAuto = b.dataset.auto === '1';
        if (isAuto) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
        else SK.deleteSlot(i);
        m.close(); SK.toast('저장을 지웠습니다.'); setTimeout(() => SK.openSaveSlots(mode), 120);
      };
    });
  };

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

  /* v5.23 — 열린 모달을 스택으로 관리한다. 안드로이드 뒤로가기(js/backguard.js)가
     '맨 위 모달만 닫기'를 하려면 어떤 모달이 열려 있고 닫을 수 있는지 알아야 한다. */
  SK.modalStack = SK.modalStack || [];
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
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      const i = SK.modalStack.indexOf(layer);
      if (i >= 0) SK.modalStack.splice(i, 1);
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 220);
      /* v5.28 — 창을 닫은 뒤에도 기다리던 도착·침공 사건이 있으면 이어서 연다
         (포로 처리처럼 시간이 걸리는 창을 오래 열어 두어도 사건이 굳지 않게) */
      setTimeout(() => {
        if (document.querySelector('#modal-root .modal-layer')) return;
        if (SK.chainPendingEvents) SK.chainPendingEvents();
      }, 380);
    }
    const layer = { el: wrap, dismissible: opts.dismissible !== false, close };
    SK.modalStack.push(layer);
    wrap.addEventListener('click', (e) => { if (e.target === wrap && opts.dismissible !== false) close(); });
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    return { close, el: wrap };
  };

  /* ───────────── 화면 전환 ───────────── */
  const SCREENS = ['screen-title', 'screen-scenario', 'screen-faction', 'screen-map', 'screen-city', 'screen-battle'];
  let lastTheme = null;
  function bgm(theme) {
    if (!window.JojoBGM) return;
    /* v5.9 — 전투 화면은 battle.js가 JojoBGM을 직접 부르므로, 실제 재생 중인 곡과 견준다
       (그러지 않으면 전투를 마치고 지도로 돌아와도 전장 음악이 그대로 남는다) */
    const cur = window.JojoBGM.debug && window.JojoBGM.debug.current;
    if (cur != null ? cur === theme : lastTheme === theme) return;
    lastTheme = theme;
    try { JojoBGM.play(theme); } catch (e) { /* ignore */ }
  }
  SK.bgm = bgm;

  /* v5.25 — 표지 아래 수치를 실제 데이터에서 다시 채운다 (장수 623 → 697처럼 낡지 않게) */
  function refreshTitleFoot() {
    const el = document.querySelector('.title-foot');
    if (!el) return;
    const n = (SK.GENERALS || []).length, c = (SK.CITY_LIST || []).length, k = Object.keys(SK.CLASSES || {}).length;
    if (!n || !c || !k) return;
    el.textContent = `${c}개 거점 · ${k}개 병과 · ${n}명 장수 · 최대 32×32 대형 전장`;
  }
  SK.refreshTitleFoot = refreshTitleFoot;

  /* v5.25 — 달이 바뀐 뒤 꼭 열려야 할 사건(행군 도착·요격·적 침공)이 모달에 가려
     영영 안 뜨는 일이 없도록 몇 초 동안 다시 확인한다. */
  let pendingWatch = null;
  function armPendingWatch() {
    if (pendingWatch) clearTimeout(pendingWatch);
    let left = 10;
    const tick = () => {
      pendingWatch = null;
      const s = SK.state;
      if (!s || s.over) return;
      /* v5.28 — 전투 중에는 다음 사건을 열지 않는다 (전투가 끝나면 closeBattle이 다시 무장한다) */
      const btl = document.getElementById('battle-overlay');
      if ((window.SKBattle && SKBattle.debug && SKBattle.debug.battle)
        || (document.querySelector('#screen-battle.active') && btl && !btl.hidden)) return;
      if (document.querySelector('#modal-root .modal-layer')) {
        if (left-- > 0) pendingWatch = setTimeout(tick, 700);
        return;
      }
      /* v5.29 — 같은 달에 여러 성이 침공받으면 침공 대기열도 이어서 연다 */
      if (SK.promoteInvasionQueue && SK.promoteInvasionQueue(s)) { if (left-- > 0) pendingWatch = setTimeout(tick, 220); return; }
      if (s.pendingInvasion) { if (SK.openPendingInvasion) SK.openPendingInvasion(); return; }
      if (s.pendingMarch) { if (SK.openPendingMarch) SK.openPendingMarch(); return; }
      /* v5.28 — 같은 달 도착 대기열이 남아 있으면 다음 사건을 올린다 */
      if (SK.promoteMarchQueue && SK.promoteMarchQueue(s)) { if (left-- > 0) pendingWatch = setTimeout(tick, 220); return; }
      if (left-- > 0) pendingWatch = setTimeout(tick, 700);
    };
    pendingWatch = setTimeout(tick, 900);
  }
  SK.armPendingWatch = armPendingWatch;
  SK.show = function (id) {
    SCREENS.forEach((s) => $('#' + s).classList.toggle('active', s === id));
  };
  SK.showMap = function () {
    SK.show('screen-map');
    bgm('map');
    /* v5.11 — 지도 HUD는 마지막으로 열었던 성의 금고를 기준으로 보여 준다 */
    if (SK.state && SK.state.lastCity && SK.state.cities[SK.state.lastCity] && SK.state.cities[SK.state.lastCity].owner === PF()) {
      SK.state.purseCity = SK.state.lastCity;
    }
    SK.refreshHud();
    if (window.SKMap) { SKMap.init(); SKMap.refresh(); setTimeout(() => SKMap.relayout && SKMap.relayout(), 30); }
    /* v5.3 — 저장을 다시 열었을 때 남아 있는 행군·침공 사건을 이어서 보여 준다 */
    if (SK.state && (SK.state.pendingMarch || SK.state.pendingInvasion
      || (SK.state.invasionQueue || []).length)) armPendingWatch();
    /* v5.16 — 모든 거점을 손에 넣었으면 천하통일 엔딩으로 */
    if (SK.checkUnification) setTimeout(() => SK.checkUnification(), 620);
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
      /* v5.8 — 새로 그린 A급 18인·한국 12인의 초상/SD를 위에 얹는다 */
      try {
        const r2 = await fetch('data/v58_art_manifest.json', { cache: 'no-cache' });
        if (r2.ok) SK.addTopArt(await r2.json());
      } catch (e2) { console.warn('v5.8 신규 일러스트 목록을 불러오지 못했습니다.', e2); }
      /* v5.23 — 한국 재야 풀 20인 전용 초상(5×4 시트를 256×256으로 잘라 넣은 것) */
      try {
        const r3 = await fetch('data/korea_v523_art.json', { cache: 'no-cache' });
        if (r3.ok) SK.addTopArt(await r3.json());
      } catch (e3) { console.warn('v5.23 한국 초상 목록을 불러오지 못했습니다.', e3); }
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

  /* v5.12 — 꼬마영웅 개그 한마디 */
  async function loadGags() {
    if (SK.GAGS && Object.keys(SK.GAGS.named || {}).length) return true;
    try {
      const res = await fetch('data/hero_gags.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SK.setGags(await res.json());
      return true;
    } catch (e) { console.warn('개그 한마디를 불러오지 못했습니다.', e); SK.GAGS = SK.GAGS || { named: {}, classes: {}, tiers: {} }; return false; }
  }
  SK.loadGags = loadGags;

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
    if (!SK.GAGS || !Object.keys(SK.GAGS.named || {}).length) await loadGags();
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
              <li><b>전장</b> — 24×24(요격·소도시)·28×28(중도시)·32×32(대도시) 격자를 끌어 이동하며 부대를 지휘합니다.</li>
            </ul>
          </div>`,
          actions: [{ label: '출발한다', primary: true }],
        });
      } else {
        SK.toast('저장된 천하를 이어받았습니다.');
      }
      /* v5.27 — 전투 중에 나갔다 돌아왔으면 출진 병력이 성으로 돌아왔다는 것을 알린다 */
      const rec = SK.state && SK.state.battleRecover;
      if (rec && rec.troops) {
        SK.state.battleRecover = null;
        setTimeout(() => {
          SK.modal({
            kicker: '전투 중 이탈', title: '부대가 성으로 돌아왔습니다',
            body: `<p class="modal-p">전투가 끝나기 전에 앱을 닫거나 새로고침해서 전장이 사라졌습니다. 출진했던 병력 <b>${fmt(rec.troops)}</b>명이 ${CITY[rec.city] ? SK.josa(CITY[rec.city].name, 'euro') : '출발 성으로'} 돌아왔습니다. 장수들도 성에 그대로 있습니다.</p>`,
            actions: [{ label: '알겠습니다', primary: true }],
          });
        }, 420);
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
  /* v5.12 — 정사 연도 뱃지 대신 코믹 막(幕) 표기 */
  const SC_ACT = { 190: '1막', 200: '2막', 208: '3막', 220: '4막' };
  const actOf = (sc) => SC_ACT[sc && sc.year] || '난투';
  /* v5.18 — 지금 열려 있는 것은 1막뿐. 2·3·4막 자리는 '새 컨텐츠 준비중' 카드로 둔다 */
  const SOON_ACTS = [
    { act: '2막', art: 'scen_200', color: '#2b3f6b' },
    { act: '3막', art: 'scen_208', color: '#8a2f24' },
    { act: '4막', art: 'scen_220', color: '#4b2f6b' },
  ];
  const OPEN_SCENARIO_YEAR = 190;
  function scenarioLine(sc) {
    const n = (sc.factions || []).length;
    return `${n}개 세력 · 전 영웅 집합!`;
  }

  function soonCard(s) {
    return `<button class="scbn soon" data-soon="${s.act}" style="--ac:${s.color}" aria-disabled="true">
        <span class="scbn-art"><img src="assets/scenarios/${s.art}.webp" alt="" /></span>
        <span class="scbn-soon-tag" aria-hidden="true">🚧 공사중</span>
        <span class="scbn-body">
          <span class="scbn-year">${s.act}</span>
          <span class="scbn-name">새 컨텐츠 준비중</span>
          <span class="scbn-sub">곧 새로운 모드가 업데이트됩니다!</span>
        </span>
        <span class="scbn-lock" aria-hidden="true">🔒</span>
      </button>`;
  }

  function openScenarioPicker() {
    if (!SK.HIST.length) { beginScenario(null, null); return; }
    const list = $('#scenario-list');
    /* v5.18 — 1막만 플레이 가능한 카드로 열고, 나머지 막은 준비중 카드 3장 */
    const open = SK.HIST.find((sc) => Number(sc.year) === OPEN_SCENARIO_YEAR) || SK.HIST[0];
    if (list) {
      const act1 = open ? `<button class="scbn" data-sc="${open.id}" style="--ac:${SC_BADGE[open.year] || '#7a2b26'}">
        <span class="scbn-art"><img src="assets/scenarios/scen_${open.year}.webp" alt="" /></span>
        <span class="scbn-body">
          <span class="scbn-year">${actOf(open)}</span>
          <span class="scbn-name">${open.title}</span>
          ${open.subtitle ? `<span class="scbn-sub">${open.subtitle}</span>` : ''}
          <span class="scbn-meta">${scenarioLine(open)}</span>
        </span>
        <span class="scbn-go" aria-hidden="true">›</span>
      </button>` : '';
      list.innerHTML = act1 + SOON_ACTS.map(soonCard).join('');
      list.scrollTop = 0;
      const btn = list.querySelector('.scbn[data-sc]');
      if (btn) btn.onclick = () => openFactionPicker(open);
      list.querySelectorAll('.scbn[data-soon]').forEach((b) => {
        b.onclick = () => SK.toast(`${b.dataset.soon}은 새 컨텐츠 준비중입니다. 곧 업데이트됩니다!`);
      });
    }
    SK.show('screen-scenario');
    const back = $('#btn-scenario-back');
    if (back) back.onclick = () => { if (SK.state) SK.showMap(); else SK.show('screen-title'); };
  }
  SK.openScenarioPicker = openScenarioPicker;

  /* v5.3 — 세력 선택은 모달이 아니라 시나리오 화면과 같은 먹·나무결·금테 전용 화면(#screen-faction)이다 */
  const SC_NOTE = {
    190: '동탁이 낙양·호로관만 꽉 쥐고? 다들 삐져서 전 영웅 총출동!',
    200: '발밑에 금 그어 놓고 "여긴 내 거!" 영토 쟁탈전.',
    208: '배를 다 묶어 놨다… 화공 한 방, 진짜 될까?',
    220: '이제 셋만 남았어요. 치킨도 셋이 나눠 먹는데!',
  };
  function factionScreenCard(f, rec) {
    const n = (f.cities || []).length;
    const roster = (f.startGenerals && f.startGenerals.length ? f.startGenerals : (f.generals || [])).length;
    const lord = SK.GEN_BY_NAME[f.lord];
    const pt = lord ? SK.genPortrait(lord) : (SK.CLASS_PORTRAIT.gunwoong || 'gen_bobyung');
    /* v5.13 — 시공초월 올스타: 군주 등급(S/A)을 초상 옆에 바로 보여 준다 */
    const tier = lord && lord.tier ? String(lord.tier) : '';
    return `<button class="fx-card ${rec ? 'reco' : ''}" data-fid="${f.id}" style="--fc:${f.color}">
      <span class="fx-port"><img src="${SK.ptSrc(pt)}" alt=""><em class="fx-badge">${f.mark}</em>${tier ? `<em class="fx-tier t-${tier}">${tier}</em>` : ''}${rec ? '<em class="fx-reco">⭐ 입문 추천</em>' : ''}</span>
      <div class="fx-main">
        <b class="fx-name">${f.name}</b>
        <span class="fx-lord">${f.lord || '재야'}</span>
        <span class="fx-cap">수도 ${f.capitalName}</span>
        <span class="fx-nums"><i>거점 <b>${n}</b></i><i>장수 <b>${roster}</b></i></span>
      </div>
    </button>`;
  }

  /* v5.8 — 난이도. 쉬움은 시작 자금이 넉넉하고 AI가 늦게 움직인다 */
  const DIFFICULTIES = {
    easy: { key: 'easy', name: '쉬움', desc: '시작 금 +35% · 침공 8개월 유예', goldMul: 1.35, grace: 8 },
    normal: { key: 'normal', name: '보통', desc: '시작 금 그대로 · 침공 4개월 유예', goldMul: 1, grace: 4 },
    hard: { key: 'hard', name: '어려움', desc: '시작 금 −20% · 침공 2개월 유예', goldMul: 0.8, grace: 2 },
  };
  let chosenDiff = 'normal';
  function diffOf(s) { return DIFFICULTIES[(s && s.difficulty) || chosenDiff] || DIFFICULTIES.normal; }
  SK.diffOf = diffOf;
  function graceOf(s) { return diffOf(s).grace; }
  SK.graceOf = graceOf;

  function openFactionPicker(sc) {
    const res = SK.resolveScenario(sc);
    const facs = Object.keys(res ? res.factions : {}).filter((k) => k !== 'neutral' && res.factions[k].cities.length)
      .map((k) => res.factions[k])
      .sort((a, b) => b.cities.length - a.cities.length);
    /* v5.8 — 입문 추천: 거점이 가장 많은(=전력이 넉넉한) 세력 하나 */
    const recId = facs.length ? facs[0].id : null;
    const list = $('#faction-list');
    if (list) {
      list.innerHTML = facs.map((f) => factionScreenCard({
        id: f.id, name: f.name, lord: f.lord, color: f.color, mark: SK.markOf(f),
        capital: f.capital, capitalName: (SK.CITY[f.capital] || {}).name || '-',
        cities: f.cities, generals: f.generals, startGenerals: f.startGenerals,
      }, f.id === recId)).join('') || '<p class="fx-empty">이 시대에 일어설 세력이 없습니다.</p>';
      list.scrollTop = 0;
      list.querySelectorAll('.fx-card').forEach((b) => {
        b.onclick = () => beginScenario(sc, b.dataset.fid);
      });
    }
    const yr = $('#fx-year'); if (yr) yr.textContent = actOf(sc);
    const nm = $('#fx-scname'); if (nm) nm.textContent = sc.title;
    const nt = $('#fx-note'); if (nt) nt.textContent = SC_NOTE[sc.year] || sc.subtitle || '';
    renderDiffRow();
    SK.show('screen-faction');
    const back = $('#btn-faction-back');
    if (back) back.onclick = () => openScenarioPicker();
  }

  /* 난이도 줄 — 세력 선택 화면 위쪽 */
  function renderDiffRow() {
    const box = $('#fx-diff');
    if (!box) return;
    box.innerHTML = Object.keys(DIFFICULTIES).map((k) => `<button class="fd-btn ${chosenDiff === k ? 'on' : ''}" data-diff="${k}">
        <b>${DIFFICULTIES[k].name}</b><span>${DIFFICULTIES[k].desc}</span></button>`).join('');
    box.querySelectorAll('[data-diff]').forEach((b) => {
      b.onclick = () => { chosenDiff = b.dataset.diff; renderDiffRow(); };
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
        kicker: sc ? `시공초월 · ${actOf(sc)}` : '시공초월',
        title: sc ? sc.title : '천하 대난투 개전!',
        body: `<div class="intro-modal">
          <div class="intro-portrait" style="border-color:${f.color || '#b8862f'}"><img src="${SK.ptSrc(lord ? SK.genPortrait(lord) : 'caocao')}" alt=""></div>
          <p>“${SK.quoteOf(f.lord, 'deploy') || '천하는 넓고, 내 길은 멀다.'}”</p>
          <ul>
            <li><b>세력</b> ${f.name || '-'} · ${f.lord || '-'}</li>
            <li><b>수도</b> ${cap ? cap.name : '-'} · <b>영지</b> ${(f.cities || []).length}곳</li>
            <li><b>목표</b> 옆 성부터 하나씩! 천하통일 가즈아!</li>
          </ul>
          ${sc && sc.historyNote ? `<p class="sc-summary">${sc.historyNote}</p>` : ''}
        </div>`,
        actions: [{ label: '천하통일 가즈아!', primary: true }],
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
      kicker: intro ? '시공초월 소식' : '천하 대난투 소식',
      title: ev.title,
      body: `<div class="timeline-card">
        <span class="tl-seal">톡</span>
        <p>${ev.text}</p>
        <p class="tl-date">${SK.seasonOf(Number(ev.month) - 1)} · ${SK.monthName(Number(ev.month) - 1)}</p>
      </div>`,
      actions: [{ label: '가보자고!', primary: true, onClick: () => { if (after) setTimeout(after, 240); } }],
      wide: true,
      dismissible: false,   // v5.28 — 뒤로가기·바탕 터치로 닫혀 다음 사건(도착·침공)이 끊기지 않게
    });
  }

  /* v5.4 — 경제 현황 — 상단 경제 줄을 누르면 열린다.
     다음 달에 들어올 세수·봉급·군량 유지비와 다음 가을 대수확 예상량을 한 화면에 보여 준다. */
  function openEcon() {
    const s = SK.state;
    if (!s) return;
    const eco = econForecast(s);
    const har = harvestOf(s);
    const fPct = 1 + (SK.techPct ? SK.techPct('foodPct') : 0) / 100;
    const totalG = SK.totalGold(s), totalF = SK.totalFood(s);
    const monthsOfFood = eco.upkeep ? Math.floor(totalF / eco.upkeep) : 99;
    const coverPct = eco.upkeep ? Math.round(har.total / (eco.upkeep * 12) * 100) : 0;
    const cityRows = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF()).map((c) => {
      const cs = s.cities[c.id];
      const row = har.rows.find((r) => r.city === c.name) || { food: 0, farm: 0 };
      return `<div class="ec-city"><b>${c.name}</b><span>농업 ${Math.round(cs.agri)} · 민심 ${Math.round(cs.loyalty)} · 농원 +${row.farm}%</span><em>+${fmt(row.food)}</em></div>`;
    }).join('');
    const topPay = (s.heroes || []).slice().sort((a, b) => heroSalary(b) - heroSalary(a)).slice(0, 5);
    const payRows = topPay.map((h) => `<span class="ec-pay"><b>${h.name}</b>${h.tier}급 · Lv.${h.lv}<em>${fmt(heroSalary(h))}</em></span>`).join('');
    const sign = (v) => (v >= 0 ? '+' : '−') + fmt(Math.abs(v));
    SK.modal({
      kicker: SK.dateLabel(s.eraYear || (195 + s.year), s.month),
      title: '경제 현황',
      body: `<div class="econ-modal">
        <div class="ec-head"><span>금</span><em>금고 <b>${fmt(totalG)}</b> <small>(전체 성 합계)</small></em></div>
        <div class="ec-line"><span>도시 세수</span><b class="plus">+${fmt(eco.tax)}</b></div>
        <div class="ec-line"><span>시장 · 공방</span><b class="plus">+${fmt(eco.market)}</b></div>
        <div class="ec-line"><span>관작 봉급 · ${SK.rankFor(s.fame).title}</span><b class="plus">+${fmt(eco.rank)}</b></div>
        <div class="ec-line"><span>장수 봉급 ${eco.heroes}명</span><b class="minus">−${fmt(eco.payroll)}</b></div>
        <div class="ec-line sum"><span>이번 달 세수 − 봉급</span><b class="${eco.goldNet >= 0 ? 'plus' : 'minus'}">${sign(eco.goldNet)}</b></div>
        <p class="ec-note" style="margin:-2px 0 2px">축제·상단·구제 같은 그 달의 지출은 빠지지 않은 예상치입니다. 실제 금고 증감은 달이 바뀔 때 월정산에 표시됩니다.</p>
        <div class="ec-head"><span>군량</span><em>창고 <b>${fmt(totalF)}</b> · 약 ${monthsOfFood}개월치</em></div>
        <div class="ec-purses">${SK.ownedPurses(s).map((p) => `<div class="ec-purse"><b>${p.name}</b><span>금 ${fmt(p.gold)}</span><em>군량 ${fmt(p.food)}</em></div>`).join('')}</div>
        <div class="ec-line"><span>병력 유지 ${fmt(totalTroops() + marchTroopsOf(s))}명</span><b class="minus">−${fmt(eco.upkeep)}</b></div>
        <div class="ec-line"><span>농원 비축</span><b class="plus">+${fmt(eco.farm)}</b></div>
        <div class="ec-line sum"><span>이번 달 군량</span><b class="${eco.foodNet >= 0 ? 'plus' : 'minus'}">${sign(eco.foodNet)}</b></div>
        <div class="ec-harvest">
          <div class="eh-top"><b>🌾 다음 가을 대수확</b><em>${s.month === ECON.harvestMonth ? '이번 달 거뒀습니다' : `${monthsUntilHarvest(s)}개월 뒤 · 10월`}</em></div>
          <div class="eh-num">예상 <b>+${fmt(har.total)}</b> <i>미</i></div>
          <p>지금 병력 유지비로 <b>${Math.round(har.total / Math.max(1, eco.upkeep))}개월</b>치${coverPct >= 100 ? ' — 1년을 넉넉히 넘깁니다' : ' — 1년치에 ' + (100 - coverPct) + '% 모자랍니다. 농원 증축·개간으로 채우십시오'}${fPct > 1 ? ` · 기술 보정 +${Math.round((fPct - 1) * 100)}%` : ''}</p>
          <div class="eh-cities">${cityRows || '<span>거점이 없습니다.</span>'}</div>
        </div>
        <div class="ec-head"><span>봉급이 큰 장수</span><em>등급 S·A일수록, Lv이 높을수록 금이 듭니다</em></div>
        <div class="ec-pays">${payRows || '<span>휘하 장수가 없습니다.</span>'}</div>
        <p class="ec-note">매달 1일이 되면 세수와 봉급, 병력 유지비가 정산됩니다. 군량이 바닥나면 민심 −${ECON.famineLoyalty}과 병력 이탈이 생기니, 10월 전에는 [개간]과 [탐색]으로 버티십시오.</p>
      </div>`,
      wide: true,
      actions: [{ label: '닫기', primary: true }],
    });
  }
  SK.openEcon = openEcon;

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
    /* v5.11 — 상단 HUD는 지금 성의 금고 + 세력 전체 합계를 함께 보여 준다 */
    const purseId = (s.lastCity && s.cities[s.lastCity] && s.cities[s.lastCity].owner === PF()) ? s.lastCity : s.playerCapital;
    const pcs = purseId ? s.cities[purseId] : null;
    const tg = SK.totalGold(s), tf = SK.totalFood(s);
    $('#map-gold').textContent = fmt(pcs ? pcs.gold : 0);
    $('#map-food').textContent = fmt(pcs ? pcs.food : 0);
    const gtot = $('#map-gold-total'), ftot = $('#map-food-total');
    /* 성이 하나뿐이라 합계가 같으면 보조 표기는 감춘다 (좁은 상단 줄 보호) */
    if (gtot) { const same = pcs && Math.round(tg) === Math.round(pcs.gold || 0); gtot.textContent = same ? '' : `/ ${fmt(tg)}`; gtot.title = '전체 성 금고 합계'; }
    if (ftot) { const same = pcs && Math.round(tf) === Math.round(pcs.food || 0); ftot.textContent = same ? '' : `/ ${fmt(tf)}`; ftot.title = '전체 성 창고 합계'; }
    const gcell = $('#map-gold-cell'), fcell = $('#map-food-cell');
    if (gcell) gcell.title = `${purseId ? CITY[purseId].name : '현재 성'} 금고 ${fmt(pcs ? pcs.gold : 0)} · 전체 ${fmt(tg)}`;
    if (fcell) fcell.title = `${purseId ? CITY[purseId].name : '현재 성'} 창고 ${fmt(pcs ? pcs.food : 0)} · 전체 ${fmt(tf)}`;
    $('#map-troops').textContent = fmt(totalTroops());
    /* v5.21 — 상단 자원 줄 밀도: 숫자가 5~6자리로 길어지면 글씨·아이콘·보조 합계를 단계적으로 줄여
       우측 도감 버튼과 겹치지 않게 한다 (좁은 폰 390px 기준) */
    const topBar = document.querySelector('.map-top');
    if (topBar) {
      const digits = ['#map-gold', '#map-food', '#map-troops'].reduce((a, sel) => {
        const el = $(sel);
        return a + (el ? el.textContent.replace(/[^0-9]/g, '').length : 0);
      }, 0) + ['#map-gold-total', '#map-food-total'].reduce((a, sel) => {
        const el = $(sel);
        return a + (el ? el.textContent.replace(/[^0-9]/g, '').length : 0);
      }, 0);
      topBar.dataset.res = digits >= 20 ? 'xlong' : (digits >= 15 ? 'long' : 'short');
    }
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
      const sName = SK.seasonOf(s.month);
      se.textContent = sName;
      se.title = `${sName} 계절`;
    }
    const owned = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF()).length;
    const fname = SK.factionName(PF());
    /* v5.4 — 상단 경제 줄: 이번 달 예상 순금·군량과 다음 가을 대수확까지 */
    const eco = econForecast(s);
    const eg = $('#eco-gold'), ef = $('#eco-food'), eh = $('#eco-harvest');
    if (eg && eco) {
      eg.textContent = `월 세수−봉급 ${eco.goldNet >= 0 ? '+' : '−'}${fmt(Math.abs(eco.goldNet))}`;
      eg.title = `도시 세수 ${fmt(eco.tax)} + 시장·공방 ${fmt(eco.market)} + 관작 ${fmt(eco.rank)} − 장수 봉급 ${fmt(eco.payroll)} (그 달 지출 제외)`;
      eg.classList.toggle('down', eco.goldNet < 0);
      ef.textContent = `월 군량 ${eco.foodNet >= 0 ? '+' : '−'}${fmt(Math.abs(eco.foodNet))}`;
      ef.classList.toggle('down', eco.foodNet < 0);
      ef.title = `병력 유지 −${fmt(eco.upkeep)} · 농원 +${fmt(eco.farm)}`;
      const m = monthsUntilHarvest(s);
      const harv = harvestOf(s).total;
      eh.textContent = s.month === ECON.harvestMonth ? '🌾 대수확 거뒀음' : `🌾 대수확 ${m}개월`;
      eh.classList.toggle('soon', m <= 2);
      eh.classList.toggle('done', s.month === ECON.harvestMonth);
      eh.title = `10월 가을 대수확 예상 군량 +${fmt(harv)}`;
    }
    $('#map-hint').textContent = owned >= SK.CITY_LIST.length ? `천하통일! 모든 거점이 ${fname}의 깃발 아래 있습니다.` :
      `${fname} 거점 ${owned} / ${SK.CITY_LIST.length} · 다음 달에 세수·봉급·군량 유지비가 정산됩니다.`;
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

  /* v5.5 — 첩자로 보낼 수 있는 대기 장수 (이번 달 아직 행동하지 않은 사람) */
  function scoutActors(cityId) {
    /* v5.32 — 첩자 후보도 대기 장수가 먼저 (건물 담당은 뒤로) */
    return actorPoolBy(cityId, (g) => (g.ji || 60) + (g.cha || 60));
  }
  SK.scoutActors = scoutActors;

  /* 정찰 — 길로 이어진 아군 성에서 대기 장수를 첩자로 보낸다.
     금 45 + 그 장수의 이번 달 행동. 지력·매력이 높으면 더 오래 살핀다. */
  SK.scoutCity = function (id, fromId, actor) {
    SK.setPurse(fromId);
    const s = SK.state;
    const st = s.cities[id];
    if (!st || st.owner === PF()) return false;
    if (s.gold < scoutCost()) { SK.sfx.play('deny'); SK.toast(`금이 부족합니다. (정찰 금 ${scoutCost()})`); return false; }
    const from = fromId || SK.allNeighbors(id).find((n) => s.cities[n] && s.cities[n].owner === PF());
    if (!from) { SK.toast('정찰을 보낼 아군 성이 맞닿아 있지 않습니다.'); return false; }
    let spy = actor || null;
    if (!spy) {
      spy = scoutActors(from)[0] || null;
      if (!spy) { SK.sfx.play('deny'); SK.toast('첩자로 보낼 대기 장수가 없습니다. (모두 이번 달 일을 마쳤습니다)'); return false; }
    }
    s.gold -= scoutCost();
    consumeDispatch(from, spy);
    SK.gainExp(spy, 10);
    const eye = ((spy.ji || 60) * 0.6 + (spy.cha || 60) * 0.4) - 60;
    const months = 3 + (eye >= 20 ? 2 : eye >= 6 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0);
    st.scoutedUntil = s.turn + months;
    st.scoutedFrom = from;
    st.scoutedBy = spy.uid;
    SK.save();
    SK.refreshHud();
    SK.sfx.play('ui');
    SK.toast(`${josa(spy.name, 'eul')} 첩자로 보냈습니다 — ${CITY[id].name} ${months}개월간 훔쳐봅니다. (금 −${scoutCost()})`);
    if (document.querySelector('#screen-map.active')) SK.openCitySheet(id);
    else if (document.querySelector('#screen-city.active')) SK.openCity(from);
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
        <div><span>성벽</span><b>${scouted ? Math.round(st.def) : hidden}</b></div>
        <div><span>민심</span><b>${scouted ? Math.round(st.loyalty) : hidden}</b></div>
        <div><span>장수</span><b>${scouted ? generals.length : hidden}</b></div>
      </div>
      ${generals.length ? `<div class="sheet-gens">${generals.slice(0, 6).map((g) => {
        const cls = SK.genClass(g);
        const cdef = SK.CLASSES[cls] || { name: '무장' };
        return `<div class="mini-gen" title="통솔 ${g.tong || g.leadership} 무력 ${g.wu || g.war} 지력 ${g.ji || g.intel} 정치 ${g.pol || g.politics || 60} 매력 ${g.cha || g.charm || 60}">
          <span class="mg-frame"><img src="${SK.ptSrc(g.portrait || SK.genPortrait(g))}" alt=""></span>
          <div><span>${g.name}</span><em class="mg-job j-${cls}">${cdef.name}</em>
            <em>통${g.tong || g.leadership} 무${g.wu || g.war} 지${g.ji || g.intel} 정${g.pol || g.politics || 60} 매${g.cha || g.charm || 60}</em></div></div>`;
      }).join('')}</div>` : ''}
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
                { label: `정찰 먼저 (금 ${scoutCost()})`, onClick: () => SK.openScoutSheet(id) },
                { label: '그래도 출진', onClick: () => { sheet.hidden = true; const from = SK.allNeighbors(id).find((n) => SK.state.cities[n].owner === PF()) || SK.state.lastCity; SK.openSortiePrep(id, from); } },
              ],
            });
            return;
          }
          sheet.hidden = true;
          const from = SK.allNeighbors(id).find((n) => SK.state.cities[n].owner === PF()) || SK.state.lastCity;
          SK.openSortiePrep(id, from);
        }
        else if (a === 'scout') { SK.openScoutSheet(id); }
        else if (a === 'far') { SK.toast('인접한 아군 거점에서만 출진할 수 있습니다.'); }
        else sheet.hidden = true;
      };
    });
  };
  SK.closeCitySheet = function () { const s = $('#city-sheet'); if (s) s.hidden = true; };

  function typeName(t) {
    return { capital: '대도시', mid: '중도시', town: '소도시', pass: '관문', fortress: '요새' }[t] || '거점';
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
    /* v5.17 — 대도시 10칸 · 중도시 8칸: 안뜰 가운데 두 자리를 더 쓴다 */
    { x: 50, y: 44 }, { x: 50, y: 70 },
  ];
  /* v5.0.3 — 성벽은 안뜰이 아니라 성문·외벽 위에 둔다 (2026-11-20 지적) */
  const WALL_SPOT = { x: 50, y: 82 };
  /* v5.4 — 관아 표지는 지붕 처마 아래로 내려 붙인다 (원형 아이콘 대신 금테 목재 간판) */
  const OFFICE_SPOT = { x: 50, y: 20.5 };
  const HOTSPOTS = [{ key: 'office', name: '관아', x: OFFICE_SPOT.x, y: OFFICE_SPOT.y }];

  /* ══════════════════════════════════════════════════════════
     v5.7 — 성 화면 안에서 내 거점을 ◀ ▶ 로 넘긴다
     (본성 → 나머지는 지도 위→아래·왼→오른 순서)
     ══════════════════════════════════════════════════════════ */
  function ownedCityList() {
    const s = SK.state;
    if (!s) return [];
    const cap = s.playerCapital;
    const list = SK.CITY_LIST.filter((c) => s.cities[c.id] && s.cities[c.id].owner === PF());
    list.sort((a, b) => {
      if (a.id === cap) return -1;
      if (b.id === cap) return 1;
      return (a.v - b.v) || (a.u - b.u);
    });
    return list;
  }
  SK.ownedCityList = ownedCityList;

  function renderCityNav(cityId) {
    const list = ownedCityList();
    const i = list.findIndex((c) => c.id === cityId);
    const prev = $('#btn-city-prev'), next = $('#btn-city-go'), no = $('#city-stepno');
    const solo = list.length < 2;
    [prev, next].forEach((b) => {
      if (!b) return;
      b.disabled = solo;
      b.style.visibility = solo ? 'hidden' : '';
    });
    if (no) no.textContent = solo ? '' : `${i < 0 ? 1 : i + 1} / ${list.length}`;
  }
  SK.renderCityNav = renderCityNav;

  function stepCity(dir) {
    const s = SK.state;
    const list = ownedCityList();
    if (list.length < 2) { SK.toast('거점이 하나뿐입니다. 성을 더 차지하면 여기서 바로 넘길 수 있습니다.'); return; }
    let i = list.findIndex((c) => c.id === s.lastCity);
    if (i < 0) i = 0;
    const nx = list[(i + dir + list.length) % list.length];
    SK.sfx.play('ui');
    SK.openCity(nx.id);
  }
  SK.stepCity = stepCity;

  function openCityPicker() {
    const s = SK.state;
    const list = ownedCityList();
    /* v5.29 — 후반(20성 이상)에는 목록이 길어져 "어느 성을 먼저 봐야 하나"가 병목이 된다.
       머리에 총계를 올리고, [전방 / 손볼 곳]으로 걸러 볼 수 있게 한다. */
    const info = (c) => {
      const cs = s.cities[c.id];
      const gens = s.heroes.filter((h) => h.city === c.id && !h.marchId).length;
      const built = (cs.slots || []).filter((sl) => sl.key).length;
      const front = (SK.allNeighbors(c.id) || []).some((n) => s.cities[n] && s.cities[n].owner !== PF() && s.cities[n].owner !== 'neutral');
      const cap = cityCap(cs);
      const wound = Math.round(cs.wounded || 0);
      const need = [];
      if (!gens) need.push('장수 없음');
      else if (!cs.governor) need.push('태수 없음');
      if (wound > 0) need.push(`부상병 ${fmt(wound)}`);
      /* 전방 성만 병력을 따진다 — 후방 성이 비어 있는 것은 정상이다 */
      if (front && cap && (cs.troops || 0) < cap * 0.25) need.push('병력 부족');
      if ((cs.food || 0) < 600) need.push('군량 부족');
      return { cs, gens, built, front, need };
    };
    const totals = list.reduce((a, c) => {
      const cs = s.cities[c.id];
      a.troops += Math.round(cs.troops || 0); a.food += Math.round(cs.food || 0); a.gold += Math.round(cs.gold || 0);
      if (info(c).front) a.front += 1;
      if (info(c).need.length) a.need += 1;
      return a;
    }, { troops: 0, food: 0, gold: 0, front: 0, need: 0 });
    let mode = 'all';
    const m = SK.modal({
      kicker: '내 거점', title: `보유 ${list.length}곳`,
      body: `<p class="talent-note">성을 누르면 그 성으로 바로 넘어갑니다. 성 이름을 눌러도 이 목록이 열립니다.</p>
        <div class="cp-sum"><span>총 병력 <b>${fmt(totals.troops)}</b></span><span>금고 <b>${fmt(s.gold)}</b></span><span>창고 <b>${fmt(totals.food)}</b></span><span>전방 <b>${totals.front}</b>곳</span></div>
        <div class="cp-chips"><button data-f="all" class="on">전체 ${list.length}</button><button data-f="front">전방 ${totals.front}</button><button data-f="need">손볼 곳 ${totals.need}</button></div>
        <div class="city-pick" id="cp-list"></div>`,
      wide: true, actions: [{ label: '닫기' }],
    });
    const draw = () => {
      const rows = list.filter((c) => {
        const it = info(c);
        if (mode === 'front') return it.front;
        if (mode === 'need') return it.need.length > 0;
        return true;
      }).sort((a, b) => {
        const ia = info(a), ib = info(b);
        return (ib.need.length - ia.need.length) || (Number(ib.front) - Number(ia.front)) || (a.id === s.playerCapital ? -1 : b.id === s.playerCapital ? 1 : 0);
      }).map((c) => {
        const it = info(c);
        return `<button class="city-pick-row ${c.id === s.lastCity ? 'on' : ''}" data-c="${c.id}">
        <span class="cp-lv" style="background:${SK.factionColor(PF())}">${cityLevel(it.cs)}</span>
        <span class="cp-main"><b>${c.name}${c.id === s.playerCapital ? ' <em style="font-style:normal;font-size:8.5px;color:#8a5f2a">본성</em>' : ''}${it.front ? ' <em class="cp-front">전방</em>' : ''}</b>
          <span>${typeName(c.type)} · 병력 ${fmt(it.cs.troops)}/${fmt(cityCap(it.cs))} · 민심 ${Math.round(it.cs.loyalty)} · 장수 ${it.gens}명</span>
          ${it.need.length ? `<span class="cp-need">${it.need.join(' · ')}</span>` : ''}</span>
        <span class="cp-cap">${it.built}시설</span>
        <span class="cp-go">▸</span>
      </button>`;
      }).join('');
      const box = m.el.querySelector('#cp-list');
      if (!box) return;
      box.innerHTML = rows || `<p class="tr-empty">${mode === 'front' ? '전방(적과 접한) 성이 없습니다.' : '지금 손볼 성이 없습니다.'}</p>`;
      box.querySelectorAll('.city-pick-row').forEach((b) => { b.onclick = () => { m.close(); SK.openCity(b.dataset.c); }; });
    };
    m.el.querySelectorAll('[data-f]').forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.f;
        m.el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
        draw();
      };
    });
    draw();
  }
  SK.openCityPicker = openCityPicker;

  SK.openCity = function (id) {
    const s = SK.state;
    const c = CITY[id];
    const st = s.cities[id];
    if (st.owner !== PF()) { SK.openCitySheet(id); return; }
    /* v5.0.3 — 군주가 주둔한 성은 언제나 군주가 친히 다스린다 */
    if (enforceLordGovernor(s)) SK.save();
    s.lastCity = id;
    s.purseCity = id;          // v5.11 — 이 성의 금고를 연다
    SK.save();
    const f = SK.factionInfo(st.owner);
    /* v5.18 — 성 이름이 길어 헤더에서 잘리지 않게, 관문·요새는 종류를 뺀 짧은 이름을 쓴다
       (종류는 바로 아래 '관문 · 1중 성벽' 배지가 이미 말해 준다) */
    $('#city-name').textContent = String(c.name).replace(/\s*(관문|요새)$/, '');
    const ringNo = SK.siegeRingsOfCity ? SK.siegeRingsOfCity(c) : 1;
    $('#city-hanja').textContent = `${typeName(c.type)} · ${ringNo}중 성벽`;
    $('#city-faction').textContent = SK.markOf(f);
    $('#city-faction').style.background = f.color;
    $('#city-lord-img').src = `${SK.ptSrc(heroPortrait(id))}`;
    const scene = sceneFor(c);
    $('#city-scene-img').src = `assets/scenes/${scene}.webp`;
    $('#city-gold').textContent = fmt(st.gold);
    $('#city-food').textContent = fmt(st.food);
    const cgt = $('#city-gold-total'), cft = $('#city-food-total');
    const allG = SK.totalGold(s), allF = SK.totalFood(s);
    if (cgt) { cgt.textContent = Math.round(allG) === Math.round(st.gold || 0) ? '' : `/ ${fmt(allG)}`; cgt.title = '전체 성 금고 합계'; }
    if (cft) { cft.textContent = Math.round(allF) === Math.round(st.food || 0) ? '' : `/ ${fmt(allF)}`; cft.title = '전체 성 창고 합계'; }
    $('#city-troops').textContent = fmt(st.troops);
    const gens = s.heroes.filter((h) => h.city === id);
    if (!gens.length) cityActorUid = null;
    ensureSlots(st, c);
    $('#city-weather').textContent = `${monthWeather(s)} · ${st.loyalty > 75 ? '민심 안정' : st.loyalty > 50 ? '민심 보통' : '민심 흉흉'}`;
    const cr = $('#city-rank');
    if (cr) cr.textContent = SK.rankFor(s.fame).title;
    const cd = $('#city-date');
    if (cd) cd.textContent = SK.dateLabel(s.eraYear || (195 + s.year), s.month);
    /* v5.12 — 대상인 체류 중이면 상단에 남은 개월 칩 */
    const gmc = $('#city-merchant');
    if (gmc) {
      const left = Number(st.grandMerchant) || 0;
      gmc.hidden = left <= 0;
      /* v5.32 — 칩을 누르면 바로 군량 상인(대상인) 창이 열린다 (문구·커서도 버튼처럼) */
      gmc.textContent = left > 0 ? `대상인 체류 ${left}개월 ▸` : '';
      gmc.title = left > 0 ? '눌러서 군량 상인(대상인) 열기 — 군량 특가 · 보물 판매' : '';
      gmc.setAttribute('aria-label', left > 0 ? `대상인 체류 ${left}개월 — 군량 상인 열기` : '군량 상인 열기');
      gmc.onclick = left > 0 ? (e) => {
        e.stopPropagation();
        if (SK.openRiceTrader) SK.openRiceTrader(id);
      } : null;
    }
    renderCityNav(id);
    renderCityDev(id);
    renderCityGuide();
    renderCitySlots(id);
    renderSceneLevel(id);
    renderCityGens(id);
    renderYard(id);
    renderCityTabs(id);
    SK.show('screen-city');
    bgm('domestic');
    if (SK.cityLife) SK.cityLife.start(id);
  };

  /* ══════════════════════════════════════════════════════════════
     v5.9 시안 A — 성 화면 3단 탭 [내정] · [시설] · [장수]
     ══════════════════════════════════════════════════════════════ */
  let cityTab = 'domestic';
  function setCityTab(tab, opts) {
    const ok = ['domestic', 'facility', 'generals'];
    cityTab = ok.indexOf(tab) >= 0 ? tab : 'domestic';
    document.querySelectorAll('#city-tabs .ct-tab').forEach((b) => {
      const on = b.dataset.tab === cityTab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.city-panes .city-pane').forEach((p) => {
      p.classList.toggle('on', p.dataset.pane === cityTab);
    });
    const pane = document.querySelector(`.city-panes .city-pane[data-pane="${cityTab}"]`);
    if (pane && pane.dataset.fresh !== '1') pane.dataset.fresh = '1';
    if (!(opts && opts.silent)) SK.sfx.play('ui');
  }
  SK.setCityTab = setCityTab;
  function renderCityTabs(cityId) {
    const cs = SK.state.cities[cityId];
    const nSlots = (cs.slots || []).length;
    const built = (cs.slots || []).filter((sl) => sl.key).length;
    const gens = cityGens(cityId).length;
    const val = { domestic: '', facility: nSlots ? `${built}/${nSlots}` : '', generals: gens ? `${gens}` : '' };
    document.querySelectorAll('#city-tabs .ct-tab').forEach((b) => {
      let em = b.querySelector('em');
      const v = val[b.dataset.tab];
      if (v) {
        if (!em) { em = document.createElement('em'); b.appendChild(em); }
        em.textContent = v;
      } else if (em) em.remove();
      b.onclick = () => setCityTab(b.dataset.tab);
    });
    setCityTab(cityTab, { silent: true });
  }

  /* v5.8 — 책사 첫걸음: 첫 3턴 동안 성 화면 맨 위에 한 줄 안내 (×로 닫으면 다시 안 뜨다) */
  const GUIDE_LINES = {
    1: '<b>① 배속</b> — 오른쪽 아래 <b>[시설 관리]</b>에서 공터에 건물을 지으면 수입이 늘어납니다. 장수를 배속하면 건물이 더 빨리 자랍니다. 다 됐으면 <b>[다음 달]</b>을 누르세요.',
    2: '<b>② 건설</b> — <b>[시설 관리 → 내성 시설]</b>의 공터를 눌러 시장·농원·병영을 세우고, 지은 건물을 눌러 증축하세요. 증축은 경험이 차면 열립니다.',
    3: '<b>③ 정찰·출진</b> — <b>[외교·계략 → 정찰]</b>로 이웃 성을 살피고, <b>[군사 → 출진]</b>으로 성을 치세요. 성을 하나 차지하면 천하가 열립니다.',
  };
  function renderCityGuide() {
    const box = $('#city-guide');
    if (!box) return;
    const s = SK.state;
    if (!s) { box.hidden = true; return; }
    const line = (s.turn || 1) <= 3 ? GUIDE_LINES[Math.max(1, s.turn || 1)] : null;
    if (!line || s.guideClosed) { box.hidden = true; return; }
    box.hidden = false;
    const txt = box.querySelector('.cg-text');
    if (txt) txt.innerHTML = line;
    const close = box.querySelector('.cg-close');
    if (close) close.onclick = () => { s.guideClosed = true; SK.save(); box.hidden = true; };
  }
  SK.renderCityGuide = renderCityGuide;

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
    const rows = Object.keys(SK.SLOT_NAMES).map((sl) => {
      const id = (g.equip || {})[sl];
      const t = id ? SK.TREASURE_BY_ID[id] : null;
      if (!t) return `<span class="eq-chip none"><i>${SK.SLOT_NAMES[sl]}</i>없음</span>`;
      return `<span class="eq-chip" style="--gc:${SK.GRADE_COLOR[t.grade]}"><i>${SK.SLOT_NAMES[sl]}</i>${t.name}</span>`;
    }).join('');
    const bonus = [];
    if (eq.war) bonus.push(`무력+${eq.war}`);
    if (eq.intel) bonus.push(`지력+${eq.intel}`);
    if (eq.leadership) bonus.push(`통솔+${eq.leadership}`);
    if (eq.politics) bonus.push(`정치+${eq.politics}`);
    if (eq.charm) bonus.push(`매력+${eq.charm}`);
    if (eq.move) bonus.push(`이동+${eq.move}`);
    if (eq.rng) bonus.push(`사거리+${eq.rng}`);
    /* v5.29 — 보물 문구가 전장 계산에 실제로 넣는 값 (같은 파서를 쓴다) */
    const fx = SK.heroTreasureFx ? SK.heroTreasureFx(g) : null;
    const parts = fx ? SK.fxSumLine(fx, true) : [];
    return `<div class="hi-equip">${rows}</div>${bonus.length ? `<p class="hi-bonus">보물 보정 — ${bonus.join(' · ')}</p>` : '<p class="hi-bonus">보물 보정 — 없음</p>'}
      ${parts.length ? `<p class="hi-bonus hi-fx">전장 적용 — ${parts.join(' · ')}</p>` : ''}`;
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
        if (st.rng) b.push(`사거리+${st.rng}`);
        return b.join(' · ');
      };
      /* v5.29 — 문구 → 전장 적용/미적용을 같은 파서 결과로 보여 준다
         v5.30 — 숫자가 없어 기본값으로 옮긴 절도 밝힌다 */
      const fxLine = (t, cls) => {
        const line = SK.treasureFxLine(t);
        const notes = SK.treasureFxNotes(t);
        const dflt = SK.treasureFxDefaults(t);
        if (!line && !notes.length) return '';
        return `<span class="${cls}">${line ? `<b>전장 적용</b> ${line}` : ''}${dflt.length ? ` <em class="tr-dflt">(숫자 없는 ${dflt.length}절은 기본값)</em>` : ''}${notes.length ? `${line ? ' · ' : ''}<i>미적용: ${notes.join(' / ')}</i>` : ''}</span>`;
      };
      const slots = Object.keys(SK.SLOT_NAMES).map((sl) => {
        const id = hero.equip[sl];
        const t = id ? SK.TREASURE_BY_ID[id] : null;
        return `<button class="tr-slot ${slot === sl ? 'sel' : ''}" data-slot="${sl}" style="--gc:${t ? SK.GRADE_COLOR[t.grade] : '#9a8a66'}">
          <span class="ts-type">${SK.SLOT_NAMES[sl]}</span>
          <b style="color:${t ? SK.GRADE_COLOR[t.grade] : '#9a8a66'}">${t ? t.name : '비어 있음'}</b>
          ${t ? `<em class="ts-grade">${t.grade}</em><span class="ts-bonus">${bonusLine(t)}</span><span class="ts-effect">${t.effect}</span>${fxLine(t, 'ts-fx')}` : ''}
        </button>`;
      }).join('');
      const owned = new Set();
      s.heroes.forEach((h) => Object.values(h.equip || {}).forEach((id) => owned.add(id)));
      const inv = s.treasures.map((id) => SK.TREASURE_BY_ID[id]).filter((t) => t && SK.treasureSlot(t) === slot);
      const list = inv.length ? inv.map((t) => `<button class="tr-item" data-id="${t.id}" style="--gc:${SK.GRADE_COLOR[t.grade]}">
          <span class="tr-grade">${t.grade}</span>
          <div><b>${t.name}</b><span class="tr-bonus">${bonusLine(t)}</span><span class="tr-eff">${t.effect}</span>${fxLine(t, 'tr-fx')}</div>
          <em>장착</em>
        </button>`).join('') : `<p class="tr-empty">${SK.SLOT_NAMES[slot]} 보물이 없습니다. 전장이나 [탐색]으로 얻을 수 있습니다.</p>`;
      const cur = hero.equip[slot] ? `<button class="btn btn-paper tr-unequip" id="tr-unequip">${SK.SLOT_NAMES[slot]} 해제</button>` : '';
      const sum = SK.heroTreasureFx(hero);
      const sumLine = SK.fxSumLine(sum);
      m.el.querySelector('#tr-body').innerHTML = `
        <div class="tr-slots">${slots}</div>
        ${sumLine ? `<div class="tr-sum"><span>${hero.name}의 전장 적용 합계</span><b>${sumLine}</b></div>` : ''}
        <div class="tr-inv-head"><span>보유 ${SK.SLOT_NAMES[slot]}</span>${cur}</div>
        <div class="tr-list">${list}</div>
        <p class="tr-note">보물은 무기·방어구·명마·병법서 한 자리씩 장착됩니다. 전장이나 [탐색]으로 얻을 수 있습니다.</p>
        <p class="tr-note tr-fxnote"><b>전장 적용</b>은 공격·피해·방어·책략·치명·회피·반격·회복 계산에 실제로 들어가는 값입니다. 게임에 그 판정이 없는 문구는 같은 눈금으로 옮겼습니다 — 명중률→주는 피해, 책략 명중률→책략 위력, 적 방어력 −N%→주는 피해, 받는 치명타 피해 −N%→치명타 저항, 반사→반격 피해. <b>v5.30</b>부터 전투 규칙도 실제로 붙습니다 — 연격·연속 사격 확률, 한 턴 2회 공격, 주변·관통 추가 피해, 수전·산악·야간 지형 보정, 반사·돌격·측면 추가 피해. 숫자가 없는 문구는 <b>기본값</b>으로 옮겼고 카드에 그 절 수를 적었습니다.</p>
        <p class="tr-note tr-fxnote"><b>v5.31 — 사기·상태이상·내정·외교</b>도 실제 판정에 붙습니다. · <b>사기</b>: 100이 기준이고 높으면 공격 +16%까지, 낮으면 −18%까지. 큰 타격·아군 부대 붕괴로 떨어지고 턴마다 회복합니다. 보물의 '사기 +N'은 시작 사기, '사기 저하 −N%'는 떨어지는 폭을 줄입니다. · <b>상태이상</b>: 기절(이번 턴 행동 불가) · 혼란(아군·적을 가리지 않고 인접 부대 공격) · 위축(공격 −20%) · 중독·화상(턴마다 병력 감소) · 둔화(이동 −1). '기절 부여 확률'·'위축 부여'·'방어 약화'·'면역'·'상태이상 저항'·'해제 확률'이 이 판정에 그대로 쓰입니다. · <b>내정·외교</b>: '내정 수입'은 그 장수가 있는 성의 세수·시장, '군량 유지비'는 그 성 병력의 군량, '외교·등용 성공률'은 사자를 보낸 장수의 협상 확률, '일기토 승리 확률'은 [탐색] 일기토, '정찰 범위'는 첩자 정찰 기간에 붙습니다.</p>`;
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
    if (SK.codexTreasure) SK.codexTreasure(pick.id);
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
    if (!g) return 0;
    const yr = SK.state ? Number(SK.state.eraYear || 190) : 190;
    return SK.ageOf ? SK.ageOf(g, yr) : 0;
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
      const head = ROSTER_COLS.map((c) => `<button class="rs-th ${c.num ? 'num' : ''} ${sortKey === c.key ? 'on' : ''}" data-k="${c.key}">${c.label}${sortKey === c.key ? `<i class="rs-arrow">${dir < 0 ? '▲' : '▼'}</i>` : ''}</button>`).join('');
      const body = list.map((h) => `<button class="rs-row" data-uid="${h.uid}">
          <span class="rs-name"><img style="--fa:${genAura(h.genId, h.name)}" src="${SK.ptSrc(h.portrait)}" alt="">
            <span class="rs-nm"><span class="rs-nm-top"><b>${h.name}</b></span>
              <em class="rs-cls">${(SK.CLASSES[h.cls] || {}).name || '장수'}</em></span></span>
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
            <span>인구 ${fmt(Math.round(cs.pop))} · 병력 ${fmt(cs.troops)}/${fmt(cityCap(cs))} · 민심 ${Math.round(cs.loyalty)}</span></div>
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
    /* v5.10 — 보물 보정을 합친 실제 능력치 (+N 표시)와 공훈치 */
    const eq = SK.equipBonus(g);
    const attrs = [
      { k: '통솔', v: g.tong, add: eq.leadership },
      { k: '무력', v: g.wu, add: eq.war },
      { k: '지력', v: g.ji, add: eq.intel },
      { k: '정치', v: g.pol || 60, add: eq.politics },
      { k: '매력', v: g.cha || 60, add: eq.charm },
    ].map((a) => `<div><span>${a.k}</span><b>${a.v + a.add}${a.add ? `<em class="hi-plus">(+${a.add})</em>` : ''}</b></div>`).join('');
    const merit = SK.meritOf(g);
    const nxOffice = SK.nextOfficeOf ? SK.nextOfficeOf(g) : null;
    const meritLine = `<p class="hi-merit">공훈치 <b>${fmt(merit)}</b>${nxOffice ? ` <em>· ${nxOffice.name}까지 ${fmt(Math.max(0, nxOffice.merit - merit))} 남음 (공훈 ${fmt(nxOffice.merit)})</em>` : ' <em>· 최고 관직</em>'}</p>`;
    const gag = SK.gagOf ? SK.gagOf(g.name, g.cls, g.tier) : '';
    SK.modal({
      title: `${g.name}`,          body: `<div class="hi-gag">
        <span class="gg-tag">꼬마영웅 개그 한마디</span>
        <p class="gg-line">“${gag}”</p>
      </div>
      <div class="hero-info">
        <div class="hi-portrait" style="--fa:${genAura(g.genId, g.name)}"><img src="${SK.ptSrc(g.portrait)}" alt=""></div>
        <div class="hi-body">
          <p class="hi-cls">${SK.classTitle(g.cls, g.lv)} · ${C.role} · Lv.${g.lv}${g.tier ? ` · ${g.tier}급` : ''}</p>
          ${g.skillName ? `<p class="hi-skill">특기 — ${g.skillName}</p>` : ''}
          ${(SK.PASSIVES && SK.PASSIVES[g.name]) ? `<div class="hi-passive"><span>고유 특기</span><b>${SK.PASSIVES[g.name].title}</b><p>${SK.PASSIVES[g.name].effect}</p></div>` : ''}
          <div class="hi-exp"><i style="width:${Math.min(100, Math.round((g.exp || 0) / SK.expNeed(g.lv) * 100))}%"></i><em>EXP ${g.exp || 0} / ${SK.expNeed(g.lv)}</em></div>
          <p class="hi-next">${SK.nextPromo(g.lv) ? `다음 승급 Lv.${SK.nextPromo(g.lv)} · ${SK.PROMO[g.cls] ? SK.PROMO[g.cls].names[Math.min(4, SK.PROMO[g.cls].names.length - 1)] : ''}` : '최고 승급 단계'}</p>
          <div class="hi-bars"><span class="hi-hp">출진 병력 ${SK.troopForNamed(g.lv).toLocaleString('ko-KR')} / 최대 ${SK.troopCapOf(g).toLocaleString('ko-KR')}</span><span class="hi-mp">MP ${g.mp}/${mpM}</span></div>
          <div class="hi-attrs five">${attrs}</div>
          ${equipLines(g)}
          ${meritLine}
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

  /* v5.11 — 인사·탐색의 [장수 전출] 바로가기: 이 성 장수를 골라 다른 성으로 */
  function openTransferPick(cityId) {
    const gens = cityGens(cityId).slice().sort((a, b) => {
      const da = dutyLabelOf(cityId, a) ? 1 : 0, db = dutyLabelOf(cityId, b) ? 1 : 0;
      return da - db || (b.wu + b.ji + b.pol) - (a.wu + a.ji + a.pol);
    });
    if (!gens.length) { SK.toast('이 성에 옮길 장수가 없습니다.'); return; }
    const rows = gens.map((g) => `<button class="target-card" data-u="${g.uid}">
      <span class="tc-flag" style="background:${SK.factionColor(PF())}">${SK.markOf(SK.factionInfo(PF()))}</span>
      <div class="tc-main"><b>${g.name}</b><span>${SK.classTitle(g.cls, g.lv)} · 통 ${g.tong} 무 ${g.wu} 지 ${g.ji}${dutyLabelOf(cityId, g) ? ` · ${dutyLabelOf(cityId, g)}` : ''}</span></div>
      <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({ kicker: `${CITY[cityId].name} 인사`, title: '누구를 전출할까', body: `<div class="target-list">${rows}</div>`, wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        const g = SK.state.heroes.find((x) => x.uid === b.dataset.u);
        m.close();
        if (g) setTimeout(() => openTransfer(g), 30);
      };
    });
  }
  SK.openTransferPick = openTransferPick;

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
  function cityGens(cityId) { return SK.state.heroes.filter((h) => h.city === cityId && !h.marchId && !h.rfgTo && !h.captured); }

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
    market: { name: '시장', icon: 'market', stat: 'pol', res: 'gold', desc: '매달 금을 벌어들입니다 (Lv가 오를수록 수입이 크게 늡니다)' },
    farm: { name: '농원', icon: 'farm', stat: 'pol', res: 'food', desc: '10월 가을 대수확을 키웁니다 (매달 비축은 조금)' },
    barracks: { name: '병영', icon: 'barracks', stat: 'tong', res: 'troops', desc: '매달 수비병을 모읍니다' },
    training: { name: '연병장', icon: 'training', stat: 'tong', res: 'train', desc: '훈련도를 올리고 담당 장수를 키웁니다' },
    patrol: { name: '순찰소', icon: 'patrol', stat: 'cha', res: 'loyalty', desc: '민심과 치안을 다스립니다' },
    tavern: { name: '주점', icon: 'tavern', stat: 'cha', res: 'talent', desc: '재야 인재가 모여듭니다' },
    wall: { name: '성벽', icon: 'wall', stat: 'tong', res: 'def', desc: '성벽을 손봅니다' },
    lab: { name: '연구소', icon: 'lab', stat: 'pol', res: 'research', desc: '기술 연구를 돕습니다' },
    workshop: { name: '공방', icon: 'workshop', stat: 'pol', res: 'gold', desc: '수송과 병기를 준비합니다' },
  };
  SK.SLOT_DEFS = SLOT_DEFS;
  /* v5.17 — 도시 규모별 공터·시설 칸: 소도시 6 · 중도시 8 · 대도시 10 */
  const SLOT_MAX = { capital: 10, mid: 8, town: 6, pass: 2, fortress: 3 };
  const SLOT_DEFAULT = {
    capital: ['market', 'farm', 'barracks', 'training', 'patrol', 'wall'],
    mid: ['market', 'farm', 'barracks', 'training', 'patrol', 'wall'],
    town: ['market', 'farm', 'barracks'],
    pass: ['wall'],
    fortress: ['wall', 'barracks'],
  };
  function slotCount(type) { return SLOT_MAX[type] || 4; }
  /* v5.2 — 시설 경험치. 담당 장수를 앉혀 몇 달 굴려야 다음 Lv이 열린다
     v5.4 — 첫 증축(Lv.1→2)은 두어 달이면 눌린다. 비용은 금이 크게 문다 */
  function slotExpNeed(lv) { return 40 + (Number(lv) || 1) * 35; }
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

  /* v5.10 — 보물 보정을 더한 실제 능력치. 내정 효율·탐색·등용 판정이 이 값을 쓴다 */
  function effStat(h, key) {
    if (!h) return 60;
    const eq = SK.equipBonus ? SK.equipBonus(h) : {};
    const base = Number(h[key] == null ? 60 : h[key]) || 0;
    const add = key === 'wu' ? eq.war : key === 'ji' ? eq.intel : key === 'tong' ? eq.leadership
      : key === 'pol' ? eq.politics : key === 'cha' ? eq.charm : 0;
    return base + (Number(add) || 0);
  }
  SK.effStat = effStat;

  /* v5.12 — 주담당 + 부장(최대 2명). 부장이 있으면 건물 효과 +45% */
  function slotMul(cs, sl, g) {
    if (!sl || !sl.key) return 0;
    const base = 0.5;
    const dep = sl.deputy ? ((SK.state && SK.state.heroes) || []).find((h) => h.uid === sl.deputy) : null;
    if (!g) return base * (dep ? 1.45 : 1);
    const def = SLOT_DEFS[sl.key] || {};
    const stat = effStat(g, def.stat || 'pol');
    return Math.min(1.9, Math.min(1.5, 1 + Math.max(-0.15, (stat - 60) * 0.0075)) * (0.92 + sl.lv * 0.03) * (dep ? 1.45 : 1));
  }
  SK.slotMul = slotMul;

  function slotOwner(cityId, sl) { return sl && sl.uid ? cityGens(cityId).find((g) => g.uid === sl.uid) || null : null; }
  function slotDeputy(cityId, sl) { return sl && sl.deputy ? cityGens(cityId).find((g) => g.uid === sl.deputy) || null : null; }
  SK.slotDeputy = slotDeputy;

  /* 장수 상태 — 건물 담당(건물 이름) / 대기 / 완료 */
  function dutyOf(h, cityId) {
    const cs = SK.state.cities[cityId || h.city];
    if (cs && Array.isArray(cs.trainCrew) && cs.trainCrew.indexOf(h.uid) >= 0) return '연병장 수련';
    const sl = cs && (cs.slots || []).find((x) => x.uid === h.uid);
    const dsl = cs && (cs.slots || []).find((x) => x.deputy === h.uid);
    if (sl || dsl) {
      /* v5.4 — '건물 담당' 대신 '순찰소 담당'처럼 맡은 시설 이름을 보여 준다 */
      const s2 = sl || dsl;
      const def = SLOT_DEFS[s2.key] || {};
      return `${def.name || '시설'} ${sl ? '담당' : '부장'}`;
    }
    if (h.actedThisMonth) return '이번 달 완료';
    return '대기';
  }
  function onDuty(h, cityId) {
    const cs = SK.state.cities[cityId || h.city];
    return !!(cs && (cs.slots || []).some((sl) => sl.uid === h.uid || sl.deputy === h.uid));
  }
  SK.onDuty = onDuty;
  SK.dutyOf = dutyOf;

  /* v5.7.1 — 건물 담당·수련 중인 장수를 파견 창에서 바로 뽑아 쓸 수 있게 한다.
     (배속은 행동이 아니다. 파견하면 그 자리에서 배속을 풀고 행동을 쓴다) */
  function dutySlotOf(cityId, uid) {
    const cs = SK.state.cities[cityId];
    const sl = cs && ((cs.slots || []).find((x) => x.uid === uid) || (cs.slots || []).find((x) => x.deputy === uid));
    return sl || null;
  }
  function dutyLabelOf(cityId, g) {
    if (!g) return '';
    const sl = dutySlotOf(cityId, g.uid);
    if (sl) {
      const nm = (SLOT_DEFS[sl.key] || {}).name || '건물';
      return `${nm} ${sl.uid === g.uid ? '담당' : '부장'}`;
    }
    const cs = SK.state.cities[cityId];
    if (cs && Array.isArray(cs.trainCrew) && cs.trainCrew.indexOf(g.uid) >= 0) return '연병장 수련';
    return '';
  }
  SK.dutyLabelOf = dutyLabelOf;
  /* 배속 해지 — 파견 직전에 부른다 */
  function releaseDuty(cityId, uid) {
    const cs = SK.state.cities[cityId];
    if (!cs) return '';
    let name = '';
    (cs.slots || []).forEach((sl) => {
      if (sl.uid === uid) { name = (SLOT_DEFS[sl.key] || {}).name || '건물'; sl.uid = null; }
      else if (sl.deputy === uid) { name = name || `${(SLOT_DEFS[sl.key] || {}).name || '건물'} 부장`; sl.deputy = null; }
    });
    if (Array.isArray(cs.trainCrew)) {
      const i = cs.trainCrew.indexOf(uid);
      if (i >= 0) { cs.trainCrew.splice(i, 1); name = name || '연병장 수련'; }
    }
    return name;
  }
  SK.releaseDuty = releaseDuty;
  /* 파견 가능 명단 — 이번 달 일을 마친 장수는 빼고, 배속된 장수는 포함한다 */
  function dispatchPool(cityId) {
    /* v5.11 — 아무것도 안 하는 '대기' 장수를 먼저, 건물 담당은 그 아래로 */
    const list = cityGens(cityId).filter((g) => !g.actedThisMonth || !!dutyLabelOf(cityId, g));
    return list.sort((a, b) => {
      const da = dutyLabelOf(cityId, a) ? 1 : 0;
      const db = dutyLabelOf(cityId, b) ? 1 : 0;
      if (da !== db) return da - db;
      return ((a.actedThisMonth ? 1 : 0) - (b.actedThisMonth ? 1 : 0)) || ((b.wu + b.ji + b.pol) - (a.wu + a.ji + a.pol));
    });
  }
  SK.dispatchPool = dispatchPool;
  /* 파견 = 배속 해지 + 이번 달 행동 소모 */
  function consumeDispatch(cityId, g) {
    if (!g) return '';
    const was = releaseDuty(cityId, g.uid);
    g.actedThisMonth = true;
    return was;
  }
  SK.consumeDispatch = consumeDispatch;
  /* 목록에 붙일 짧은 꼬리표 */
  function dutyTail(cityId, g) {
    const label = dutyLabelOf(cityId, g);
    return label ? ` · ${label} · 파견 시 자동 해제` : '';
  }
  SK.dutyTail = dutyTail;

  /* v5.4 — 증축 비용. Lv.1→2 550금부터 Lv.4→5 2,600금까지 오르고 수입은 배로 는다 */
  function buildCost(sl) { return sl.key ? ECON.buildUp[clamp(sl.lv, 1, 4)] : ECON.buildNew; }

  function renderCitySlots(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const box = $('#city-slots');
    if (!box) return;
    ensureSlots(cs, c);
    const built = cs.slots.filter((sl) => sl.key).length;
    const free = cs.slots.length - built;
    /* v5.7 — 경험이 차고 Lv.5가 아닌 시설이 있으면 [모두 증축] */
    const upList = upgradableSlots(cs);
    const upCost = upList.reduce((a, x) => a + x.cost, 0);
    /* v5.9 시안 A — 2열 건물 카드 그리드 (아이콘·이름·Lv·경혐 바·담당 장수)
       v5.10 — [＋ 자동 배속]·[매달 최선]을 장수 탭에서 이 탭 상단으로 옮겼다 */
    const bestOn = !!s.autoBestDuty;
    const gens = cityGens(cityId);
    const dutyN = gens.filter((g) => cs.slots.some((x) => x.uid === g.uid)).length;
    const doneN = gens.filter((g) => g.actedThisMonth && !cs.slots.some((x) => x.uid === g.uid)).length;
    const readyN = gens.length - dutyN - doneN;
    box.innerHTML = `<div class="slot-head">
        <b>내성 시설</b><span>${built}/${cs.slots.length}칸 · 공터 ${free}</span>
        ${upList.length ? `<button class="slot-upall" id="btn-up-all">모두 증축<em>${upList.length}곳 · 금 ${fmt(upCost)}</em></button>` : ''}
      </div>
      <div class="slot-tools">
        <button class="st-btn auto" id="btn-auto-duty" type="button"><span>＋</span>자동 배속</button>
        <button class="st-btn best ${bestOn ? 'on' : ''}" id="btn-auto-best" type="button"><i></i>매달 최선 ${bestOn ? 'ON' : 'OFF'}</button>
        <span class="st-note">담당 ${dutyN} · 대기 ${readyN} · 완료 ${doneN}</span>
      </div>
      <div class="slot-grid">${cs.slots.map((sl, i) => {
        if (!sl.key) {
          return `<button class="slot-card empty" data-slot="${i}">
            <span class="sc-plus">＋</span>
            <span class="sc-empty-main"><b>공터</b><small>건설 금 ${fmt(ECON.buildNew)}</small></span></button>`;
        }
        const def = SLOT_DEFS[sl.key] || { name: sl.key, icon: 'market' };
        const g = slotOwner(cityId, sl);
        const ep = slotExpRatio(sl);
        const full = sl.lv >= 5 || ep >= 1;
        const dep = slotDeputy(cityId, sl);
        return `<button class="slot-card${full && sl.lv < 5 ? ' ready' : ''}" data-slot="${i}">
          <img class="sc-ico" src="${bldSrc(def.icon, sl.lv)}" onerror="${bldFallback(def.icon)}" alt="">
          <div class="sc-main">
            <div class="sc-top"><b>${def.name}</b><em>Lv.${sl.lv}</em></div>
            <div class="sc-exp${full && sl.lv < 5 ? ' full' : ''}"><i style="width:${Math.round(Math.min(1, ep) * 100)}%"></i></div>
            <div class="sc-owner ${dep ? 'pair' : ''}">${g ? `<img class="sc-face" src="${SK.ptSrc(g.portrait)}" alt="">${g.name}` : '<em>담당 없음 · 수입 50%</em>'}${dep ? `<span class="sc-dep"><img class="sc-face" src="${SK.ptSrc(dep.portrait)}" alt="">${dep.name}</span>` : '<em class="sc-dep-empty">부장 없음</em>'}${full && sl.lv < 5 ? '<b class="sc-up">증축</b>' : ''}</div>
          </div></button>`;
      }).join('')}</div>
      <p class="slot-note">건물을 누르면 증축·배속·수입을 봅니다. 성 그림의 이름표를 눌러도 같은 창이 열립니다.</p>`;
    box.querySelectorAll('.slot-card').forEach((b) => {
      b.onclick = () => openSlot(cityId, Number(b.dataset.slot));
    });
    const upAll = box.querySelector('#btn-up-all');
    if (upAll) upAll.onclick = () => upgradeAll(cityId);
    /* v5.10 — 건물 배속 편의 버튼(장수 탭에서 이동) */
    const autoBtn = box.querySelector('#btn-auto-duty');
    if (autoBtn) {
      autoBtn.classList.toggle('dim', !built);
      autoBtn.onclick = () => {
        if (!built) { SK.toast('배속할 건물이 없습니다. 먼저 공터에 건물을 지으세요.'); return; }
        SK.sfx.play('ui');
        autoAssignDuty(cityId);
      };
    }
    const bestBtn = box.querySelector('#btn-auto-best');
    if (bestBtn) {
      bestBtn.onclick = () => {
        s.autoBestDuty = !s.autoBestDuty;
        SK.save();
        SK.sfx.play('ui');
        renderCitySlots(cityId);
        renderCityGens(cityId);
        SK.toast(s.autoBestDuty
          ? '매달 최선 배속을 켰습니다 — 달이 바뀌면 건물 배속을 다시 잡습니다.'
          : '매달 최선 배속을 껐습니다.');
      };
    }
  }
  SK.renderCitySlots = renderCitySlots;

  /* 증축 가능한 시설 목록 — 경험이 찼고 Lv.5 미만 */
  function upgradableSlots(cs) {
    const out = [];
    (cs.slots || []).forEach((sl, i) => {
      if (!sl.key || sl.lv >= 5) return;
      if ((sl.exp || 0) < slotExpNeed(sl.lv)) return;
      out.push({ sl, i, cost: buildCost(sl), name: (SLOT_DEFS[sl.key] || {}).name || sl.key });
    });
    out.sort((a, b) => (b.sl.exp / slotExpNeed(b.sl.lv)) - (a.sl.exp / slotExpNeed(a.sl.lv)));
    return out;
  }
  SK.upgradableSlots = upgradableSlots;

  /* [모두 증축] — 가능한 시설을 1탭으로 올린다 (금이 모자라면 앞에서부터) */
  function upgradeAll(cityId) {
    SK.setPurse(cityId);
    const s = SK.state;
    const cs = s.cities[cityId];
    const list = upgradableSlots(cs);
    if (!list.length) { SK.toast('지금 증축할 수 있는 시설이 없습니다. (시설 경험이 차야 합니다)'); return; }
    const total = list.reduce((a, x) => a + x.cost, 0);
    const cash = Math.floor(s.gold);
    let spend = 0, run = 0;
    list.forEach((x) => { if (spend + x.cost <= cash) { spend += x.cost; run += 1; } });
    const rows = list.map((x) => `<div class="upall-row">
        <img src="${bldSrc(SLOT_DEFS[x.sl.key].icon, x.sl.lv)}" onerror="${bldFallback(SLOT_DEFS[x.sl.key].icon)}" alt="">
        <b>${x.name} <span>Lv.${x.sl.lv} → Lv.${x.sl.lv + 1}</span></b>
        <span>경험 ${Math.round(x.sl.exp || 0)}/${slotExpNeed(x.sl.lv)}</span>
        <em>금 ${fmt(x.cost)}</em></div>`).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} · 증축`, title: `${list.length}곳을 한 번에`,
      body: `<div class="upall-list">${rows}</div>
        <div class="upall-total"><span>필요 금 합계</span><b>${fmt(total)}</b></div>
        <p class="talent-note">금고 ${fmt(s.gold)}${cash < total ? ` — 금이 모자라 <b>${run}곳</b>만 증축되고 <b>${fmt(total - spend)}</b>은 남습니다` : ' — 모두 증축할 수 있습니다'}.</p>`,
      wide: true,
      actions: [{ label: '취소' }, { label: run ? `${run}곳 증축` : '증축 불가', primary: true, onClick: () => {
        if (!run) { SK.toast('금이 부족합니다.'); return; }
        let n = 0, paid = 0;
        list.forEach((x) => {
          if (s.gold < x.cost) return;
          s.gold -= x.cost;
          x.sl.exp = Math.max(0, (x.sl.exp || 0) - slotExpNeed(x.sl.lv));
          x.sl.lv += 1;
          n += 1; paid += x.cost;
        });
        SK.save(); SK.refreshHud(); m.close(); SK.openCity(cityId);
        SK.sfx.play('hammer');
        SK.toast(`${n}곳을 증축했습니다 — 금 −${fmt(paid)}`);
      } }],
    });
  }
  SK.upgradeAll = upgradeAll;

  /* 마당 그림 위의 건물·공터 — v5.9 시안 A
     · 그림을 가리던 담당 장수 얼굴 스티커·건물 아이콘·이중 Lv 배지를 걷어내고
       건물 위에 1줄 이름표만 남긴다 (레벨·경험은 [시설] 탭 카드에서 본다) */
  function renderYard(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const hs = $('#scene-hotspots');
    if (!hs || !cs) return;
    ensureSlots(cs, c);
    const office = `<button class="hs-pin hotspot office" style="left:${OFFICE_SPOT.x}%;top:${OFFICE_SPOT.y}%" data-key="office" aria-label="관아"><span class="hs-name">관아</span></button>`;
    const yard = cs.slots.map((sl, i) => {
      const sp = sl.key === 'wall' ? WALL_SPOT : (YARD_SPOTS[i] || { x: 50, y: 60 });
      if (!sl.key) {
        return `<button class="hs-pin yard-b empty" data-slot="${i}" style="left:${sp.x}%;top:${sp.y}%" aria-label="공터 건설">
          <span class="hs-name"><em class="hs-plus">＋</em>공터</span></button>`;
      }
      const def = SLOT_DEFS[sl.key] || { name: sl.key, icon: 'market' };
      return `<button class="hs-pin yard-b built" data-slot="${i}" style="left:${sp.x}%;top:${sp.y}%" aria-label="${def.name} Lv.${sl.lv}">
        <span class="hs-name">${def.name}</span></button>`;
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
    SK.setPurse(cityId);
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
        return `<button class="build-row" data-k="${k}" ${s.gold < ECON.buildNew ? 'disabled' : ''}>
          <img src="${bldSrc(def.icon, 1)}" onerror="${bldFallback(def.icon)}" alt="">
          <div><b>${def.name}${same ? ` <em>이미 ${same}곳</em>` : ''}</b><span>${def.desc}</span></div>
          <em class="br-cost">금 ${fmt(ECON.buildNew)}</em></button>`;
      }).join('');
      const m = SK.modal({
        kicker: `${c.name} · 공터`, title: '무엇을 지을까',
        body: `<p class="talent-note">건물은 담당자가 없어도 기본 효과의 50%를 냅니다. 담당 장수를 앉히면 정치·통솔·매력에 따라 100~150%까지 오르고, 그 장수는 그달 건물 일을 맡습니다.</p>
          <div class="build-list">${rows}</div>`, wide: true, actions: [{ label: '닫기' }],
      });
      m.el.querySelectorAll('.build-row').forEach((b) => {
        b.onclick = () => {
          if (s.gold < ECON.buildNew) { SK.sfx.play('deny'); SK.toast(`금이 부족합니다. (필요 금 ${fmt(ECON.buildNew)})`); return; }
          s.gold -= ECON.buildNew;
          sl.key = b.dataset.k; sl.lv = 1; sl.uid = null; sl.exp = 0;
          SK.save(); SK.refreshHud(); m.close();
          SK.openCity(cityId);
          SK.sfx.play('hammer');
          SK.toast(`${josa(SLOT_DEFS[sl.key].name, 'eul')} 지었습니다 — 금 -${fmt(ECON.buildNew)}`);
        };
      });
      return;
    }
    const def = SLOT_DEFS[sl.key];
    const g = slotOwner(cityId, sl);
    const depG = slotDeputy(cityId, sl);
    const cost = buildCost(sl);
    const needEp = slotExpNeed(sl.lv);
    const ep = Math.round(sl.exp || 0);
    const epOk = ep >= needEp;
    const free = dutyCandidates(cityId, cs, def).filter((h) => !g || h.uid !== g.uid);
    const targetRole = !g ? 'uid' : (!depG ? 'deputy' : null);
    const opts = free.map((h, i) => `<button class="target-card" data-uid="${h.uid}">
        <img class="tc-portrait" src="${SK.ptSrc(h.portrait)}" alt="">
        <div class="tc-main"><b>${h.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b><span>${SK.CLASSES[h.cls].name} · ${STAT_LABEL[def.stat] || '정치'} ${effStat(h, def.stat)}</span></div>
        <span class="tc-go">▸</span></button>`).join('');
    /* v5.10 — 담당 장수를 창 안에서 바로 본다 (누르면 장수 상세창으로) */
    const ownerOff = g && SK.officeOf ? SK.officeOf(g) : null;
    const ownerExp = g ? Math.round((g.exp || 0) / SK.expNeed(g.lv) * 100) : 0;
    const ownerCard = g ? `<button class="sd-owner" data-owner="${g.uid}" type="button">
        <img class="sd-face" src="${SK.ptSrc(g.portrait)}" alt="">
        <div class="sd-oname">
          <b>${g.name} <em>Lv.${g.lv}</em>${ownerOff && ownerOff.key !== 'none' ? `<i>${ownerOff.name}</i>` : ''}</b>
          <span class="sd-stats">통 <b>${g.tong}</b> · 무 <b>${g.wu}</b> · 지 <b>${g.ji}</b> · 정 <b>${g.pol || 60}</b> · 매 <b>${g.cha || 60}</b></span>
          <span class="sd-lvline"><span class="sd-exp"><i style="width:${Math.max(2, Math.min(100, ownerExp))}%"></i></span><em class="sd-exptxt">EXP ${g.exp || 0}/${SK.expNeed(g.lv)}</em></span>
        </div>
        <span class="sd-go">▸</span>
      </button>` : '';
    /* v5.12 — 부장(2번째) 카드 */
    const depCard = depG ? `<button class="sd-owner dep" data-owner="${depG.uid}" type="button">
        <img class="sd-face" src="${SK.ptSrc(depG.portrait)}" alt="">
        <div class="sd-oname">
          <b>${depG.name} <em>Lv.${depG.lv}</em><i class="sd-role">부장</i></b>
          <span class="sd-stats">통 <b>${depG.tong}</b> · 무 <b>${depG.wu}</b> · 지 <b>${depG.ji}</b> · 정 <b>${depG.pol || 60}</b> · 매 <b>${depG.cha || 60}</b></span>
        </div>
        <span class="sd-go">▸</span>
      </button>` : '';
    const m = SK.modal({
      kicker: `${c.name} · ${def.name}`, title: `Lv.${sl.lv} ${def.name}`,
      body: `<div class="slot-detail">
          <img class="sd-ico" src="${bldSrc(def.icon, sl.lv)}" onerror="${bldFallback(def.icon)}" alt="">
          <div><b>${def.desc}</b>
            <span>효과 ${Math.round(slotMul(cs, sl, g) * 100)}% ${g ? `· 담당 ${g.name}` : '· 담당 없음'}${depG ? ` · 부장 ${depG.name}(+45%)` : ''}</span>
            <em>${sl.lv < 5 ? `증축 금 ${fmt(cost)}` : '최고 등급'}</em></div>
        </div>
        ${ownerCard}
        ${depCard}
        ${sl.lv < 5 ? `<div class="slot-expbox">
          <div class="se-head"><b>시설 경험</b><span>${ep} / ${needEp}</span></div>
          <div class="se-bar"><i style="width:${Math.round(Math.min(1, ep / needEp) * 100)}%"></i></div>
          <p>${epOk ? '경험이 가득 찼습니다 — 증축할 수 있습니다.' : `담당 장수를 배속해 ${Math.max(1, Math.ceil((needEp - ep) / (30 + sl.lv * 8)))}개월 더 운영하면 증축할 수 있습니다.`}</p>
        </div>` : ''}
        <div class="menu-list">
          ${sl.lv < 5 ? `<button data-a="up" ${(s.gold < cost || !epOk) ? 'disabled' : ''}>증축 — 금 ${fmt(cost)} (Lv.${sl.lv + 1})${epOk ? '' : ' · 경험 부족'}</button>` : ''}
          <button data-a="assign">주담당 ${g ? '교체' : '임명'}</button>
          <button data-a="assignDep">부장 ${depG ? '교체' : '임명'} — 효과 +45%</button>
          ${depG ? '<button data-a="freeDep">부장 해제</button>' : ''}
          ${g ? '<button data-a="free">주담당 해제 — 이번 달 자유 행동</button>' : ''}
          ${sl.key === 'training' ? `<button data-a="crew">수련 명단 — 함께 수련할 대기 장수 (${trainCrewOf(cs).length}명)</button>` : ''}
        </div>
        ${targetRole && free.length ? `<p class="talent-note">${targetRole === 'deputy' ? '부장으로 앉힐' : '앉힐 수 있는'} 대기 장수 ${free.length}명 — 주담당 1명 + 부장 1명까지 함께 맡을 수 있습니다</p><div class="target-list">${opts}</div>` : ''}`,
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
          SK.toast('주담당을 해제했습니다. 이번 달 자유 행동이 돌아옵니다.');
        } else if (a === 'freeDep') {
          sl.deputy = null;
          SK.save(); m.close(); SK.openCity(cityId);
          SK.toast('부장을 해제했습니다.');
        } else if (a === 'assign') {
          m.close();
          openDutyPick(cityId, idx, 'uid');
        } else if (a === 'assignDep') {
          m.close();
          openDutyPick(cityId, idx, 'deputy');
        } else if (a === 'crew') {
          m.close();
          openTrainCrew(cityId, idx);
        }
      };
    });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        sl[targetRole || 'uid'] = b.dataset.uid;
        const h = cityGens(cityId).find((x) => x.uid === b.dataset.uid);
        SK.save(); m.close(); SK.openCity(cityId);
        SK.toast(`${josa(h ? h.name : '', 'i')} ${def.name} ${targetRole === 'deputy' ? '부장' : '담당'}이 되었습니다. (배속은 행동을 쓰지 않습니다)`);
      };
    });
    /* v5.10 — 담당 장수 카드를 누르면 장수 상세창(스탯·보물·경험)으로
       v5.12 — 부장 카드도 같은 방식 */
    m.el.querySelectorAll('.sd-owner').forEach((btn) => {
      btn.onclick = () => {
        const uid = btn.dataset.owner;
        m.close();
        setTimeout(() => { if (SK.showHeroInfo) SK.showHeroInfo(uid); }, 60);
      };
    });
  }
  SK.openSlot = openSlot;
  /* 브리프에서 부르는 이름 — 장수 상세창 */
  SK.openGeneralDetail = function (uid) { showHeroInfo(uid); };

  /* v5.7 — 연병장 수련 명단: 남는 대기 장수를 여러 명 넣어 두고 매달 경험치를 쌓는다 */
  function openTrainCrew(cityId, idx) {
    SK.setPurse(cityId);
    const s = SK.state;
    const cs = s.cities[cityId];
    const sl = (cs.slots || []).find((x) => x.key === 'training') || (cs.slots || [])[idx] || { lv: 1 };
    const crew = trainCrewOf(cs);
    const gens = cityGens(cityId).filter((g) => !onDuty(g, cityId));
    const rows = gens.map((h) => {
      const on = crew.indexOf(h.uid) >= 0;
      return `<div class="crew-row">
        <img src="${SK.ptSrc(h.portrait)}" alt="">
        <div class="cw-main"><b>${h.name}</b><span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv} · 통솔 ${h.tong}${h.actedThisMonth ? ' · 이번 달 완료' : ''}</span></div>
        <span class="cw-gain">EXP +${crewGain(sl, h)}</span>
        <button class="onoff ${on ? 'on' : ''}" data-uid="${h.uid}">${on ? '빼기' : '넣기'}</button>
      </div>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 연병장`, title: `수련 명단 — Lv.${sl.lv || 1}`,
      body: `<p class="talent-note">명단에 넣은 장수는 달이 바뀔 때 연병장에서 개인 경험치(EXP)를 얻고, 그달 다른 내정·출진 명령은 하지 못합니다. 교관(담당)이 병사의 훈련도를 올리는 것과는 별개입니다.</p>
        <div class="crew-list">${rows || '<p class="tr-empty">수련에 넣을 대기 장수가 없습니다.</p>'}</div>
        <p class="talent-note">지금 ${crew.length}명 수련 중 · 연병장 하나에 최대 6명.</p>`,
      wide: true, actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('button[data-uid]').forEach((b) => {
      b.onclick = () => {
        const uid = b.dataset.uid;
        const i = crew.indexOf(uid);
        if (i >= 0) crew.splice(i, 1);
        else {
          if (crew.length >= 6) { SK.toast('한 연병장에서 여섯 명까지 수련할 수 있습니다.'); return; }
          crew.push(uid);
        }
        SK.save();
        m.close();
        openTrainCrew(cityId, idx);
      };
    });
  }
  SK.openTrainCrew = openTrainCrew;

  /* 달이 바뀔 때 수련 명단이 경험치를 받고, 그달 행동을 쓴 것으로 친다 */
  function runTrainCrew(s) {
    const rows = [];
    SK.CITY_LIST.forEach((c) => {
      const cs = s.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      const crew = trainCrewOf(cs);
      if (!crew.length) return;
      const sl = (cs.slots || []).find((x) => x.key === 'training');
      if (!sl) { cs.trainCrew = []; return; }
      const keep = [];
      crew.forEach((uid) => {
        const h = s.heroes.find((x) => x.uid === uid);
        if (!h || h.city !== c.id || h.marchId) return;
        const gain = crewGain(sl, h);
        SK.gainExp(h, gain);
        h.actedThisMonth = true;
        rows.push({ city: CITY[c.id].name, name: h.name, gain });
        keep.push(uid);
      });
      cs.trainCrew = keep;
    });
    return rows;
  }
  SK.runTrainCrew = runTrainCrew;

  /* v5.3 — 9종 건물 모두 해당 능력치가 높은 순으로 앉힐 후보를 정렬하고 1등에게 [추천] */
  const STAT_LABEL = { pol: '정치', cha: '매력', tong: '통솔', wu: '무력', ji: '지력' };
  function dutyCandidates(cityId, cs, def) {
    const stat = (def && def.stat) || 'pol';
    const free = cityGens(cityId).filter((h) => !cs.slots.some((x) => x.uid === h.uid || x.deputy === h.uid));
    return free.slice().sort((a, b) => {
      const d = effStat(b, stat) - effStat(a, stat);
      return d || String(a.name).localeCompare(String(b.name));
    });
  }

  /* v5.5 — 장수가 건물에 어울리는 점수 (해당 능력치 중심 + 종합 능력치 약간) */
  function dutyScore(h, def) {
    const stat = effStat(h, (def && def.stat) || 'pol');
    const total = effStat(h, 'pol') + effStat(h, 'tong') + effStat(h, 'cha') + effStat(h, 'ji') + effStat(h, 'wu');
    return stat * 10 + total * 0.25;
  }

  /* v5.5 — 성의 건물-장수 최선 배속안. 지어진 건물 전체를 놓고 점수가 높은 짝부터 고른다 */
  function bestDutyPlan(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    if (!cs) return [];
    const lord = ((s.factions[PF()] || {}).lord) || '';
    const slots = (cs.slots || []).filter((sl) => sl.key);
    const onDutyUids = {};
    slots.forEach((sl) => { if (sl.uid) onDutyUids[sl.uid] = true; if (sl.deputy) onDutyUids[sl.deputy] = true; });
    const depUids = {};
    slots.forEach((sl) => { if (sl.deputy) depUids[sl.deputy] = true; });
    const gens = cityGens(cityId).filter((g) => g.name !== lord && !depUids[g.uid] && (!g.actedThisMonth || onDutyUids[g.uid]));
    const pairs = [];
    slots.forEach((sl) => {
      const def = SLOT_DEFS[sl.key] || { stat: 'pol' };
      gens.forEach((g) => pairs.push({ sl: sl, g: g, score: dutyScore(g, def) }));
    });
    pairs.sort((a, b) => b.score - a.score || String(a.g.name).localeCompare(String(b.g.name)));
    const usedG = {}, usedS = {};
    const plan = [];
    pairs.forEach((p) => {
      const si = slots.indexOf(p.sl);
      if (usedG[p.g.uid] || usedS[si]) return;
      usedG[p.g.uid] = true; usedS[si] = true;
      plan.push(p);
    });
    return plan;
  }
  SK.bestDutyPlan = bestDutyPlan;

  /* v5.5 — [자동 배속] 빈 건물만 채우지 않고, 성 안 건물 전체를 최선으로 다시 앉힌다.
     월이 바뀔 때도 돌릴 수 있게 silent 옵션을 둔다(알림·화면 갱신 없음). */
  function autoAssignDuty(cityId, opts) {
    const silent = !!(opts && opts.silent);
    const s = SK.state;
    const cs = s.cities[cityId];
    if (!cs) return 0;
    const slots = (cs.slots || []).filter((sl) => sl.key);
    if (!slots.length) { if (!silent) SK.toast('배속할 건물이 없습니다. 먼저 공터에 건물을 지으세요.'); return 0; }
    const before = slots.map((sl) => `${sl.uid || ''}+${sl.deputy || ''}`).join('|');
    const plan = bestDutyPlan(cityId);
    if (!plan.length) { if (!silent) SK.toast('앉힐 수 있는 대기 장수가 없습니다.'); return 0; }
    /* v5.12 — 자동 배속은 주담당 자리만 채운다. 부장(2번째)은 사용자가 직접 임명한다
       (탐색·등용·징병·훈련에 보낼 대기 장수를 남겨 두기 위해서) */
    slots.forEach((sl) => { sl.uid = null; });
    plan.forEach((p) => { p.sl.uid = p.g.uid; });
    const after = slots.map((sl) => `${sl.uid || ''}+${sl.deputy || ''}`).join('|');
    const changed = before !== after;
    if (!silent) {
      SK.save();
      SK.openCity(cityId);
      SK.sfx.play('ui');
      SK.toast(changed
        ? `건물 ${plan.length}곳의 주담당을 최선으로 다시 앉혔습니다. (부장은 직접 임명)`
        : `이미 최선의 주담당 배속입니다 — 건물 ${plan.length}곳.`);
    }
    return changed ? plan.length : 0;
  }
  SK.autoAssignDuty = autoAssignDuty;

  function openDutyPick(cityId, idx, role) {
    const cs = SK.state.cities[cityId];
    const sl = cs.slots[idx];
    const def = SLOT_DEFS[sl.key];
    const isDep = role === 'deputy';
    const other = isDep ? sl.uid : sl.deputy;
    const free = dutyCandidates(cityId, cs, def).filter((h) => h.uid !== other);
    if (!free.length) { SK.toast('앉힐 수 있는 장수가 없습니다. (모두 다른 건물을 맡고 있습니다)'); return; }
    const rows = free.map((h, i) => `<button class="target-card" data-uid="${h.uid}">
      <img class="tc-portrait" src="${SK.ptSrc(h.portrait)}" alt="">
      <div class="tc-main"><b>${h.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b><span>${SK.CLASSES[h.cls].name} · ${STAT_LABEL[def.stat] || '정치'} ${effStat(h, def.stat)}</span></div>
      <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({ kicker: `${CITY[cityId].name} · ${def.name}`, title: isDep ? '부장은 누구로?' : '누구에게 맡길까',
      body: `<p class="talent-note">${isDep ? '부장은 주담당과 함께 건물 효과를 +45% 올리고, 매달 시설 경험과 공훈치를 함께 받습니다.' : '주담당은 그달 건물 일을 맡습니다. (배속은 행동을 쓰지 않습니다)'}</p>
        <div class="target-list">${rows}</div>`, wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        sl[isDep ? 'deputy' : 'uid'] = b.dataset.uid;
        const h = cityGens(cityId).find((x) => x.uid === b.dataset.uid);
        SK.save(); m.close(); SK.openCity(cityId);
        SK.toast(`${josa(h ? h.name : '', 'i')} ${def.name} ${isDep ? '부장' : '담당'}이 되었습니다. (배속은 행동을 쓰지 않습니다)`);
      };
    });
  }

  /* v5.10 — 농원·시장 담당 장수가 달을 넘기면 도시의 농업·상업이 실제로 오른다 (+1~3)
     = 건물 레벨과 담당 장수의 정치(농사는 정치·통솔) 능력에 비례 */
  function statGrowOf(sl, g) {
    const def = SLOT_DEFS[sl.key] || { stat: 'pol' };
    const st = (g && (g[def.stat] || 60)) || 60;
    const raw = 1 + ((Number(sl.lv) || 1) - 1) * 0.34 + (st - 60) / 45;
    return clamp(Math.round(raw), 1, 3);
  }
  SK.statGrowOf = statGrowOf;

  /* 달이 바뀔 때 건물이 내놓는 결산 — 담당 장수는 경험치를 얻는다 */
  function runSlots(st) {
    const log = [];
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      ensureSlots(cs, c);
      let gold = 0, food = 0, troops = 0, train = 0, loyalty = 0, def = 0, rp = 0, order = 0;
      let agri = 0, comm = 0;          // v5.10 — 배속 장수가 밀어 올린 농업·상업
      let merit = 0;                   // v5.10 — 이 성에서 이번 달에 쌓인 공훈치
      const grow = [];                 // v5.4 — 월정산에 보여 줄 시설 성장 기록
      if (cs.order == null) cs.order = 55;
      cs.slots.forEach((sl) => {
        if (!sl.key) return;
        const g = slotOwner(c.id, sl);
        const dep = slotDeputy(c.id, sl);
        const mul = slotMul(cs, sl, g);
        const lv = sl.lv;
        /* v5.2 — 시설 경험치. 담당 장수가 있으면 빨리, 없으면 천천히 쌓인다 */
        if (lv < 5) {
          const gain = Math.round((g ? 26 + lv * 8 : (dep ? 14 + lv * 4 : 6)) * (g ? mul : 1));
          sl.exp = (sl.exp || 0) + gain;
          grow.push({ city: c.name, key: sl.key, name: (SLOT_DEFS[sl.key] || {}).name || sl.key,
            lv: lv, gain: gain, exp: sl.exp, need: slotExpNeed(lv), duty: !!g });
        }
        if (sl.key === 'market') { gold += Math.round(ECON.marketGold[clamp(lv, 1, 5)] * mul); if (g) comm += statGrowOf(sl, g); if (dep) comm += Math.max(1, Math.round(statGrowOf(sl, dep) * 0.5)); }
        else if (sl.key === 'farm') { food += Math.round(ECON.farmTrickle * lv * mul * econMul(c)); if (g) agri += statGrowOf(sl, g); if (dep) agri += Math.max(1, Math.round(statGrowOf(sl, dep) * 0.5)); }
        else if (sl.key === 'barracks') troops += Math.round((70 + lv * 50) * mul);
        else if (sl.key === 'training') { train += 0.5 * lv * mul; if (g) SK.gainExp(g, Math.round(40 * lv * mul)); }
        else if (sl.key === 'patrol') { order += 1.1 * lv * mul; loyalty += 0.25 * lv * mul; }
        else if (sl.key === 'wall') def += 0.6 * lv * mul;
        else if (sl.key === 'lab') rp += 1;
        else if (sl.key === 'workshop') gold += Math.round((40 + lv * 40) * mul);
        else if (sl.key === 'tavern') { if (g) SK.gainExp(g, 20); }
        if (g && sl.key !== 'training' && sl.key !== 'tavern') SK.gainExp(g, Math.round(16 * lv * mul));
        /* v5.10 — 건물 일을 맡은 장수는 공훈치도 쌓는다 */
        if (g) { const m = 2 + Math.round(lv * 0.6); SK.gainMerit(g, m); merit += m; }
        /* v5.12 — 부장도 함께 EXP·공훈치를 얻는다 */
        if (dep) {
          if (sl.key !== 'training' && sl.key !== 'tavern') SK.gainExp(dep, Math.round(10 * lv));
          const m2 = 1 + Math.round(lv * 0.35);
          SK.gainMerit(dep, m2); merit += m2;
        }
      });
      /* v5.11 — 건물 수입도 그 성의 금고·창고로 들어간다 */
      if (gold) cs.gold = (cs.gold || 0) + gold;
      if (food) cs.food = (cs.food || 0) + food;
      if (troops) cs.troops = clamp(cs.troops + troops, 0, cityCap(cs));
      if (train) cs.train = clamp((cs.train == null ? 50 : cs.train) + train, 0, 100);
      if (loyalty) cs.loyalty = clamp(cs.loyalty + loyalty, 0, 100);
      if (order) cs.order = clamp(cs.order + order, 0, 100);
      else cs.order = clamp(cs.order - 0.5, 0, 100);          // 순찰소가 없으면 치안이 조금씩 풀린다
      if (def) cs.def = clamp(cs.def + def, 0, 100);
      if (agri) cs.agri = clamp((cs.agri || 0) + agri, 0, 100);
      if (comm) cs.comm = clamp((cs.comm || 0) + comm, 0, 100);
      if (rp) st.rp = (st.rp || 0) + rp;
      if (gold || food || troops || grow.length || agri || comm) {
        log.push({ city: c.name, gold, food, troops, grow, agri, comm, merit });
      }
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
        [sl.uid, sl.deputy].forEach((uid) => {
          if (!uid) return;
          const h = st.heroes.find((x) => x.uid === uid);
          if (h) h.actedThisMonth = true;
        });
      });
    });
  }
  SK.applyDuty = applyDuty;

  /* ───────────── 탐색 — 금 0 · 여러 사건 (v5.0.1) ─────────────
     탐색은 금이 들지 않고 장수의 그달 행동만 쓴다. 보물 확률을 낮춘 대신
     금·군량·의용병·은거 인재·산적 퇴치·맹수 사냥·일기토 사건을 고루 섞는다. */
  function exploreCost() { return 0; }
  function explore(cityId, actor, opts) {
    SK.setPurse(cityId);
    const s = SK.state;
    const c = CITY[cityId];
    const cs = s.cities[cityId];
    const lucky = (actor ? effStat(actor, 'cha') : 60) + (actor ? effStat(actor, 'ji') : 60);
    const bonus = Math.min(0.22, Math.max(0, (lucky - 120) * 0.0025));
    /* v5.10 — 주점 배속 자동 탐색은 주점 레벨만큼 보너스를 얻는다 (최대 +50%) */
    const boost = clamp((opts && opts.boost) || 0, 0, 0.5);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    /* v5.12 — 탐색 실패. 장수의 (지력+매력)/2 가 낮을수록 산길을 헤맨다.
       90+ 5% · 70 18% · 50 36% · 주점 보너스가 있으면 실패가 줄어든다. */
    const avg = actor ? (effStat(actor, 'ji') + effStat(actor, 'cha')) / 2 : 60;
    let failP = clamp(0.40 - (avg - 45) * 0.0085, 0.05, 0.40) * (1 - boost * 0.5);
    if (Math.random() < failP) {
      return {
        ok: true, kind: 'fail', fail: true,
        title: '탐색 실패 — 산책만 실컷',
        text: `${actor ? josa(actor.name, 'i') : '탐색대가'} 하루 종일 산을 헤매었어요. 돌아온 손에는 도토리 하나… “이거라도 드릴까요?” (지력·매력이 높은 장수를 보내면 더 잘 찾아요)`,
        gain: '경험치 +10 · 자원 없음',
      };
    }
    const roll = Math.random();
    const w = [
      { k: 'treasure', p: 0.14 + bonus * 0.6 + boost * 0.18 },
      { k: 'talent', p: 0.16 + bonus + boost * 0.22 },
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
        if (SK.codexTreasure) SK.codexTreasure(hit.id);
        return { ok: true, kind: 'treasure', title: `보물을 찾았다 — ${hit.name}`, text: `${c.name} 근방 산야에서 ${hit.grade} 등급의 ${josa(hit.name, 'eul')} 캐냈습니다. ${hit.effect}`, gain: '보관함에 넣었습니다' };
      }
    }
    if (kind === 'talent') {
      const grp = tavernGroupOf(s, cityId);
      const lordSet = SK.lordNameSet(s);
      /* v5.32 — 소속 있는 장수(내 장수·포로·전 성 주둔·AI 세력 명부)는 은거 인재로 다시 나오지 않는다 */
      const used = garrisonedIds(s);
      const pool = SK.GENERALS.filter((g) => !used.has(g.id) && genPoolGroup(g) === grp && SK.debutOk(g, eraYearOf(s)) && !SK.isDead(g.id, g.name) && !SK.isLordOnly(g, lordSet));
      if (pool.length) {
        const g2 = pool[Math.floor(Math.random() * pool.length)];
        cs.talents = cs.talents || [];
        cs.talents.unshift(g2.id);
        return { ok: true, kind: 'talent', title: `은거하던 인재 — ${g2.name}`, text: `${c.name} 인근에서 ${g2.name}(${g2.tier}급 ${SK.CLASSES[SK.genClass(g2)].name})${hasBatchim(g2.name) ? '을' : '를'} 만났습니다. 주점에 소문을 내 두었습니다.`, gain: '주점에 등장' };
      }
    }
    if (kind === 'volunteer') {
      const cap = cityCap(cs);
      const add = Math.min(cap - cs.troops, 180 + Math.floor(Math.random() * 240) + Math.round(bonus * 450));
      if (add > 0) {
        cs.troops += add;
        cs.loyalty = clamp(cs.loyalty + 2, 0, 100);
        return { ok: true, kind: 'troops', title: '의용병이 모였다', text: `${c.name} 향민들이 “성을 지키겠다”며 창을 들었습니다. 젊은이들이 스스로 대열에 섰습니다.`, gain: `수비병 +${fmt(add)} · 민심 +2` };
      }
    }
    if (kind === 'bandit') {
      /* v5.12 — 탐색 보상 하향(약 40~45%): 내정·수확의 긴장감을 지킨다 */
      const base = 70 + Math.floor(Math.random() * 150) + Math.round(Math.max(0, ((actor ? (actor.wu || 60) : 60) - 60) * 0.5));
      s.gold += base; s.fame += 2;
      cs.loyalty = clamp(cs.loyalty + 2, 0, 100);
      return { ok: true, kind: 'battle', title: '산적 퇴치', text: `${c.name} 외곽 산채의 산적 떼가 길을 막고 있었습니다. ${actor ? josa(actor.name, 'i') : '탐색대가'} 앞장서 소굴을 쓸어 버렸습니다.`, gain: `금 +${fmt(base)} · 명성 +2 · 민심 +2` };
    }
    if (kind === 'beast') {
      const food = 90 + Math.floor(Math.random() * 130);
      const gold = 25 + Math.floor(Math.random() * 60);
      s.food += food; s.gold += gold;
      return { ok: true, kind: 'hunt', title: '맹수 사냥', text: `산중에서 호랑이가 나타났습니다. ${actor ? josa(actor.name, 'i') : '사냥꾼이'} 활을 쏘아 잡았고, 고기와 가죽이 성으로 들어왔습니다.`, gain: `군량 +${fmt(food)} · 금 +${fmt(gold)}` };
    }
    if (kind === 'duel') {
      /* v5.31 — 고릉보검 '일기토 제안 성공률 상승' → 일기토 승리 확률 +N%p */
      const duelBonus = actor ? Math.min(0.25, (heroTfx(actor).duel || 0) / 100) : 0;
      const win = Math.random() < 0.45 + Math.min(0.25, ((actor ? (actor.wu || 60) : 60) - 60) * 0.006) + duelBonus;
      if (win) {
        const fame = 3 + Math.floor(Math.random() * 3);
        const gold = 60 + Math.floor(Math.random() * 100);
        s.fame += fame; s.gold += gold;
        return { ok: true, kind: 'duel', title: '일기토 승리', text: `${c.name} 길목에서 떠돌이 장수가 대결을 청했습니다. ${actor ? josa(actor.name, 'i') : '장수가'} 세 합 만에 승부를 냈습니다.`, gain: `명성 +${fame} · 금 +${fmt(gold)}` };
      }
      s.fame += 1;
      return { ok: true, kind: 'duel', title: '일기토 — 무승부', text: `떠돌이 장수와 겨루었으나 끝내 승부가 나지 않았습니다. 그래도 백성들이 그 용맹을 이야기합니다.`, gain: '명성 +1' };
    }
    const gold = 70 + Math.floor(Math.random() * 150) + Math.round(bonus * 170 + boost * 380);
    const food = 95 + Math.floor(Math.random() * 125);
    s.gold += gold; s.food += food;
    return { ok: true, kind: 'goods', title: '탐색 성과 — 은닉한 재물', text: `${c.name} 산기슭의 옛 창고에서 금 ${fmt(gold)}, 군량 ${fmt(food)}를 찾았습니다.`, gain: `금 +${fmt(gold)} · 군량 +${fmt(food)}` };
  }
  SK.explore = explore;

  /* v5.8 — 탐색은 아무나 쓰지 않는다. 보낼 장수를 직접 고르고, 건물 담당 장수도 뽑아 쓸 수 있다 */
  function openExplore(cityId) {
    const s = SK.state;
    /* v5.32 — 놀고 있는 '대기' 장수가 먼저 [추천], 건물 담당은 그 아래로.
       예전에는 매력+지력 순으로만 정렬해 시장 담당 제갈량이 맨 위에 서고 대기 장수가 밀렸다. */
    const pool = actorPoolBy(cityId, (g) => (g.cha || 60) + (g.ji || 60));
    if (!pool.length) {
      SK.sfx.play('deny');
      SK.toast('탐색에 보낼 장수가 없습니다. (모두 이번 달 일을 마쳤습니다)');
      return;
    }
    let mode = 'one';                 // 'one' 한 명씩 · 'many' 여러 명 한번에
    const sel = new Set();            // 여러 명 모드에서 고른 장수 uid

    const sendOne = (actor) => {
      const freed = consumeDispatch(cityId, actor);
      const res = explore(cityId, actor);
      if (!res.ok) { SK.sfx.play('deny'); SK.toast(res.msg || '탐색할 곳이 없었습니다.'); return false; }
      SK.gainExp(actor, res.fail ? 10 : 22);
      cityActorUid = null;
      SK.save(); SK.refreshHud();
      SK.openCity(cityId);
      SK.sfx.play('coin');
      SK.modal({
        kicker: `${CITY[cityId].name} 탐색 · ${actor.name}`, title: res.title,
        body: `<div class="explore-card ${res.kind}"><p>${res.text}</p><b>${res.gain}</b>${freed ? `<em class="ex-duty">${freed} 배속을 풀고 내보냈습니다</em>` : ''}</div>`,
        actions: [{ label: '확인', primary: true }],
      });
      return true;
    };

    /* 여러 명 한 번에 — 고른 장수마다 배속 해지 + 탐색 + 경험치, 결과는 한 창에 모은다 */
    const sendMany = () => {
      const picked = pool.filter((g) => sel.has(g.uid));
      if (!picked.length) return;
      const out = [];
      let freedN = 0;
      picked.forEach((actor) => {
        const freed = consumeDispatch(cityId, actor);
        if (freed) freedN += 1;
        const res = explore(cityId, actor);
        if (!res || !res.ok) {
          out.push({ name: actor.name, kind: 'fail', title: '탐색 실패', gain: (res && res.msg) || '아무것도 찾지 못했습니다' });
          return;
        }
        SK.gainExp(actor, res.fail ? 10 : 22);
        out.push({ name: actor.name, kind: res.kind || 'misc', title: res.title, gain: res.gain || '', fail: !!res.fail });
      });
      cityActorUid = null;
      SK.save(); SK.refreshHud();
      SK.openCity(cityId);
      SK.sfx.play('coin');
      const good = out.filter((r) => !r.fail).length;
      SK.modal({
        kicker: `${CITY[cityId].name} 탐색 · ${out.length}명`, title: '탐색 결과',
        body: `<p class="talent-note"><b>${out.length}명</b>을 한 번에 보냈습니다 — 성과 ${good}건${freedN ? ` · 건물 담당 ${freedN}명은 배속을 풀고 나갔습니다` : ''}. 보낸 장수는 이번 달 행동을 마쳤습니다.</p>
          <div class="exr-list">${out.map((r) => `<div class="exr-row ${r.fail ? 'fail' : ''}">
            <b>${r.name}</b>
            <div><span>${r.title}</span><em>${r.gain}</em></div>
          </div>`).join('')}</div>`,
        actions: [{ label: '확인', primary: true }],
      });
    };

    const render = (m) => {
      const tabs = `<div class="ex-tabs">
        <button data-ex="one" class="${mode === 'one' ? 'on' : ''}">한 명씩</button>
        <button data-ex="many" class="${mode === 'many' ? 'on' : ''}">여러 명 한번에</button>
      </div>`;
      const note = mode === 'one'
        ? `<p class="talent-note">탐색은 금이 들지 않고, 보낸 장수의 이번 달 행동을 씁니다. 매력·지력이 높을수록 보물·인재를 더 잘 찾습니다. 건물 담당 중인 장수를 고르면 그 배속은 지금 풀립니다.</p>`
        : `<p class="talent-note"><b>여러 명 한번에</b> — 보낼 장수를 체크해 한 번에 내보냅니다. 고른 장수마다 이번 달 행동을 쓰고, 결과는 한 창에 모아 보여 줍니다. 건물 담당 장수는 보내는 순간 배속이 풀립니다.</p>
          <div class="ex-many-bar">
            <button id="ex-all">대기 장수 전체 선택</button>
            <button id="ex-none">선택 해제</button>
            <b id="ex-count">${sel.size}명 선택</b>
          </div>`;
      const cards = pool.map((g, i) => {
        if (mode === 'one') {
          return `<button class="target-card" data-uid="${g.uid}">
            <img class="tc-portrait gold" src="${SK.ptSrc(g.portrait)}" alt="">
            <div class="tc-main"><b>${g.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b>
              <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}${dutyTail(cityId, g)}</span></div>
            <div class="tc-troops"><span>매력 ${g.cha} · 지력 ${g.ji}</span><b>${g.actedThisMonth ? '이번 달 완료' : '파견 가능'}</b></div>
            <span class="tc-go">▸</span></button>`;
        }
        const on = sel.has(g.uid);
        return `<button class="target-card ex-pick ${on ? 'on' : ''}" data-pick="${g.uid}">
          <span class="ex-check ${on ? 'on' : ''}">✓</span>
          <img class="tc-portrait gold" src="${SK.ptSrc(g.portrait)}" alt="">
          <div class="tc-main"><b>${g.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b>
            <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}${dutyTail(cityId, g)}</span></div>
          <div class="tc-troops"><span>매력 ${g.cha} · 지력 ${g.ji}</span><b>${g.actedThisMonth ? '이번 달 완료' : '파견 가능'}</b></div>
          <span class="tc-go">▸</span></button>`;
      }).join('');
      const go = mode === 'many'
        ? `<button class="ex-go" id="ex-go" ${sel.size ? '' : 'disabled'}>${sel.size}명 탐색 보내기</button>`
        : '';
      const wrap = m.el.querySelector('#ex-wrap');
      wrap.innerHTML = `${tabs}${note}<div class="target-list">${cards}</div>${go}`;
      wrap.querySelectorAll('[data-ex]').forEach((b) => {
        b.onclick = () => { mode = b.dataset.ex; SK.sfx.play('ui'); render(m); };
      });
      if (mode === 'one') {
        wrap.querySelectorAll('.target-card[data-uid]').forEach((b) => {
          b.onclick = () => {
            const actor = pool.find((g) => g.uid === b.dataset.uid);
            if (!actor) return;
            m.close();
            sendOne(actor);
          };
        });
        return;
      }
      wrap.querySelectorAll('[data-pick]').forEach((b) => {
        b.onclick = () => {
          const uid = b.dataset.pick;
          if (sel.has(uid)) sel.delete(uid); else sel.add(uid);
          SK.sfx.play('ui');
          render(m);
        };
      });
      const all = wrap.querySelector('#ex-all');
      if (all) all.onclick = () => {
        pool.forEach((g) => { if (!dutyLabelOf(cityId, g)) sel.add(g.uid); });
        SK.sfx.play('ui'); render(m);
      };
      const none = wrap.querySelector('#ex-none');
      if (none) none.onclick = () => { sel.clear(); SK.sfx.play('ui'); render(m); };
      const goBtn = wrap.querySelector('#ex-go');
      if (goBtn) goBtn.onclick = () => { m.close(); sendMany(); };
    };

    const m = SK.modal({
      kicker: `${CITY[cityId].name} 탐색`, title: '누구를 보낼까',
      body: `<div id="ex-wrap"></div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    render(m);
  }
  SK.openExplore = openExplore;

  /* ═══════════ v5.12 — 징병 · 훈련도 장수를 직접 고른다 ═══════════
     탐색·등용과 같은 방식: 대기 장수가 먼저, 건물 담당은 아래.
     고른 장수가 이번 달 행동을 쓰고, 통솔·매력(징병) / 통솔·무력(훈련)으로
     효율이 달라지며 경험치 + 공훈치를 얻는다. */
  function actorPoolBy(cityId, statOf) {
    return dispatchPool(cityId).slice().sort((a, b) => {
      const da = dutyLabelOf(cityId, a) ? 1 : 0;
      const db = dutyLabelOf(cityId, b) ? 1 : 0;
      if (da !== db) return da - db;
      return statOf(b) - statOf(a);
    });
  }

  function openRecruit(cityId) {
    const s = SK.state;
    const st = s.cities[cityId];
    const cap = cityCap(st);
    const pool = actorPoolBy(cityId, (g) => (g.tong || 60) + (g.cha || 60));
    if (!pool.length) {
      SK.sfx.play('deny');
      SK.toast('징병에 보낼 장수가 없습니다. (모두 이번 달 일을 마쳤습니다)');
      return;
    }
    const tech = 1 + (SK.techPct ? SK.techPct('recruitPct') : 0) / 100;
    const est = (g) => {
      const want = Math.round(1200 * conMul(cityId, g) * tech);
      return Math.max(0, Math.min(want, cap - st.troops, Math.floor((st.pop - 6000) * 0.9)));
    };
    const rows = pool.map((g, i) => {
      const want = est(g);
      const drop = clamp(5 - Math.round(((g.cha || 60) - 60) * 0.04), 2, 7);
      return `<button class="target-card" data-uid="${g.uid}">
        <img class="tc-portrait gold" src="${SK.ptSrc(g.portrait)}" alt="">
        <div class="tc-main"><b>${g.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b>
          <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}${dutyTail(cityId, g)}</span></div>
        <div class="tc-troops"><span>통솔 ${g.tong} · 매력 ${g.cha || 60}</span><b>+${fmt(want)}명 · 민심 -${drop}</b></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 징병`, title: '누구를 보낼까',
      body: `<p class="talent-note">금 150 · 군량 120이 들고, 보낸 장수의 이번 달 행동을 씁니다. 통솔·매력이 높을수록 더 많이 뽑고 민심 타격도 적습니다. 건물 담당 중인 장수를 고르면 그 배속은 지금 풀립니다.</p>
        <div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        const actor = pool.find((g) => g.uid === b.dataset.uid);
        if (!actor) return;
        m.close();
        const freed = consumeDispatch(cityId, actor);
        const res = CMDS.recruit.run(cityId, actor);
        if (!res || res.pending) { actor.actedThisMonth = false; return; }
        if (res.msg && /부족|상한|불가/.test(res.msg) && !res.hot) {
          actor.actedThisMonth = false;
          SK.sfx.play('deny'); SK.toast(res.msg);
          return;
        }
        if (freed && res) res.msg += ` · ${freed} 배속을 풀고 보냈습니다`;
        finishAction(cityId, actor, 'recruit', res);
      };
    });
  }
  SK.openRecruit = openRecruit;

  function openTrain(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const pool = actorPoolBy(cityId, (g) => (g.tong || 60) + (g.wu || 60));
    if (!pool.length) {
      SK.sfx.play('deny');
      SK.toast('훈련할 장수가 없습니다. [인재]로 등용하세요.');
      return;
    }
    const trainNow = Math.round(cs.train == null ? 50 : cs.train);
    const rows = pool.map((g, i) => {
      const avg = ((g.tong || 60) + (g.wu || 60)) / 2;
      const eff = clamp(0.8 + (avg - 50) * 0.008, 0.8, 1.35);
      const exp = Math.round(180 * eff);
      return `<button class="target-card" data-uid="${g.uid}">
        <img class="tc-portrait gold" src="${SK.ptSrc(g.portrait)}" alt="">
        <div class="tc-main"><b>${g.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b>
          <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}${dutyTail(cityId, g)}</span></div>
        <div class="tc-troops"><span>통솔 ${g.tong} · 무력 ${g.wu}</span><b>EXP +${fmt(exp)}</b></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 훈련`, title: '누구를 지휘관으로 세울까',
      body: `<p class="talent-note">금 80이 들고, 고른 장수가 이번 달 행동을 씁니다. 훈련도 ${trainNow} — 한 번에 병사 훈련도 +7~11이 오르고, 통솔·무력이 높은 장수가 지휘하면 더 오릅니다. 주둔 장수 전원이 경험치를 얻습니다. (연병장 담당자도 이 훈련으로 성장합니다)</p>
        <div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        const actor = pool.find((g) => g.uid === b.dataset.uid);
        if (!actor) return;
        m.close();
        const freed = consumeDispatch(cityId, actor);
        const res = CMDS.train.run(cityId, actor);
        if (!res || res.pending) { actor.actedThisMonth = false; return; }
        if (res.msg && /부족|없습니다/.test(res.msg) && !res.hot) {
          actor.actedThisMonth = false;
          SK.sfx.play('deny'); SK.toast(res.msg);
          return;
        }
        if (freed) res.msg += ` · ${freed} 배속을 풀었습니다`;
        finishAction(cityId, actor, 'train', res);
      };
    });
  }
  SK.openTrain = openTrain;

  /* ───────────── 기술 연구 트리 ───────────── */
  function openTech() {
    if (SK.state) SK.setPurse(SK.state.playerCapital);
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
        { key: 'rice', label: '군량 상인 — 쌀 사고팔기', desc: '이번 달 시세로 금과 군량을 바꿉니다 (금 100에 쌀 80~160)' },
        { key: 'comfort', label: '백성 위로', desc: '대기 장수를 파견합니다 — 금 100 + 행동, 매력·정치만큼 민심 상승' },
        { key: 'office', label: '관아 — 태수·군사·자동 내정', desc: '성을 맡길 사람과 자동 내정을 정합니다' },
      ],
    },
    talent: {
      name: '인사·탐색', sub: '등용·탐색·명부',
      items: [
        { key: 'talent', label: '주점 — 인재 등용', desc: '사신을 골라 보냅니다 — 매력이 높으면 값이 줄고 성공률이 오릅니다' },
        { key: 'explore', label: '탐색 — 보물·은거 인재', desc: '금 0 · 장수의 이번 달 행동으로 산야를 뒤져 보물·인재·의용병·산적 퇴치를 찾습니다' },
        { key: 'traincrew', label: '연병장 수련 — 대기 장수 경험치', desc: '대기 장수를 여러 명 넣어 두면 달이 바뀔 때 개인 경험치를 쌓습니다' },
        { key: 'transfer', label: '장수 전출 — 다른 내 성으로 이동', desc: '장수 한 명을 골라 다른 아군 성으로 옮깁니다' },
        { key: 'roster', label: '장수 명부 · 보물 · 배치', desc: '전체 장수를 표로 보고 장비를 관리합니다' },
      ],
    },
    diplomacy: {
      name: '외교·계략', sub: '이간·항복·동맹',
      items: [
        { key: 'scout', label: '정찰 — 이웃 적성 첩보', desc: `금 ${scoutCost()} + 대기 장수 1명의 행동 — 3~5개월 동안 적성 내부를 봅니다` },
        { key: 'estrange', label: '이간계 — 적 장수 지목', desc: '금 120 · 적 성의 장수 한 명을 지목해 충성을 깎고, 50 이하면 바로 회유합니다' },
        { key: 'surrender', label: '항복 권고 — 싸움 없이 성 받기', desc: '금 300 · 규모 차가 큰 약소 세력에 사자를 보내 성을 넘겨받습니다' },
        { key: 'spy', label: '계략 — 적성 수비 약화', desc: '금 100 · 적성 수비병과 성벽을 깎습니다' },
        { key: 'rumor', label: '유언비어 — 적성 민심 흔들기', desc: '금 80 · 적성 민심과 병력을 깎습니다' },
        { key: 'peace', label: '동맹·휴전 — 불가침 맺기', desc: '금 200/600 · 6개월 휴전 또는 12개월 동맹 (AI도 그 기간에는 치지 않습니다)' },
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
        { key: 'transport', label: '수송 — 병력·군량·장수 전출', desc: '후방 성에서 전방 성으로 병력·금·군량을 보내고 장수도 옮깁니다' },
        { key: 'train', label: '훈련 — 지휘관을 골라 병법 훈련', desc: '금 80 · 병사 훈련도(+7~11)와 장수 경험치가 함께 오릅니다' },
        { key: 'recruit', label: '징병 — 장수를 골라 병력 모으기', desc: '금 150 · 군량 120 · 통솔·매력이 높은 장수가 더 많이 뽑습니다' },
        { key: 'recall', label: '긴급 회군 — 원정 부대 불러들이기', desc: '행군 중인 주력 부대를 즉시 출발 성으로 돌려 수성전에 합류시킵니다' },
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
    if (k === 'comfort') { openComfort(cityId); return; }
    if (k === 'office') { openOffice(cityId); return; }
    if (k === 'roster') { SK.openRoster(); return; }
    if (k === 'explore') { openExplore(cityId); return; }
    if (k === 'recruit') { openRecruit(cityId); return; }
    if (k === 'train') { openTrain(cityId); return; }
    if (k === 'tech') { openTech(); return; }
    if (k === 'scout') { openScoutPick(cityId); return; }
    if (k === 'estrange') { openEstrange(cityId); return; }
    if (k === 'surrender') { openSurrenderAdvice(cityId); return; }
    if (k === 'spy') { openSpy(cityId, 'spy'); return; }
    if (k === 'rumor') { openSpy(cityId, 'rumor'); return; }
    if (k === 'peace') { openPeace(cityId); return; }
    if (k === 'transport') { openTransport(cityId); return; }
    if (k === 'rice') { openRiceTrader(cityId); return; }
    if (k === 'transfer') { openTransferPick(cityId); return; }
    if (k === 'recall') { SK.openRecall(cityId); return; }
    if (k === 'traincrew') {
      const ci = SK.state.cities[cityId];
      const ti = (ci.slots || []).findIndex((sl) => sl.key === 'training');
      if (ti < 0) { SK.toast('이 성에 연병장이 없습니다. 공터에 연병장을 먼저 지으세요.'); return; }
      openTrainCrew(cityId, ti);
      return;
    }
    doCommand(k);
  }

  /* v5.5 — 정찰: 먼저 어느 성을 살필지, 다음은 누구를 첩자로 보낼지 고른다 */
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
      body: `<p class="talent-note">정찰하면 3~5개월 동안 그 성의 수비병·성벽·민심·장수를 볼 수 있습니다. 금 ${scoutCost()}과 함께 첩자로 보낼 장수 한 명의 이번 달 행동을 씁니다.</p><div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => { m.close(); setTimeout(() => openScoutEnvoy(cityId, b.dataset.c), 30); };
    });
  }

  function scoutMonths(actor) {
    const eye = ((actor.ji || 60) * 0.6 + (actor.cha || 60) * 0.4) - 60;
    /* v5.31 — 청동거울·화류마: '매복·은신 탐지 범위'는 첩자 정찰 기간을 한 달 줄인다 */
    const detect = actor ? Math.min(1, Math.round((heroTfx(actor).detect || 0) > 0 ? 1 : 0)) : 0;
    return Math.max(2, 3 + (eye >= 20 ? 2 : eye >= 6 ? 1 : 0) - detect);
  }

  /* 첩자로 보낼 장수 고르기 — 지력·매력이 높을수록 오래 살핀다 */
  function openScoutEnvoy(fromId, targetId) {
    const actors = scoutActors(fromId);
    if (!actors.length) {
      SK.sfx.play('deny');
      SK.toast('첩자로 보낼 대기 장수가 없습니다. (모두 이번 달 일을 마쳤습니다)');
      return;
    }
    const rows = actors.map((g, i) => `<button class="target-card" data-uid="${g.uid}">
      <img class="tc-portrait gold" src="${SK.ptSrc(g.portrait)}" alt="">
      <div class="tc-main"><b>${g.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b>
        <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}${dutyTail(fromId, g)}</span></div>
      <div class="tc-troops"><span>지력 ${g.ji} · 매력 ${g.cha}</span><b>${scoutMonths(g)}개월</b></div>
      <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({
      kicker: `${CITY[fromId].name} → ${CITY[targetId].name}`,
      title: '누구를 첩자로 보낼까',
      body: `<p class="talent-note">금 ${scoutCost()}과 함께 보낸 장수의 이번 달 행동을 씁니다. 지력·매력이 높으면 더 오래 성안을 살핍니다.</p>
        <div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        const hero = cityGens(fromId).find((g) => g.uid === b.dataset.uid);
        if (!hero) return;
        m.close();
        SK.scoutCity(targetId, fromId, hero);
      };
    });
  }
  SK.openScoutEnvoy = openScoutEnvoy;

  /* 지도 적성 시트의 [정찰 보내기] — 맞닿은 내 성의 대기 장수 중에서 고른다 */
  SK.openScoutSheet = function (targetId) {
    const s = SK.state;
    const froms = SK.allNeighbors(targetId).filter((n) => s.cities[n] && s.cities[n].owner === PF());
    const rows = [];
    froms.forEach((fid) => {
      scoutActors(fid).slice(0, 4).forEach((g, i) => {
        rows.push(`<button class="target-card" data-city="${fid}" data-uid="${g.uid}">
          <img class="tc-portrait gold" src="${SK.ptSrc(g.portrait)}" alt="">
          <div class="tc-main"><b>${g.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b>
            <span>${CITY[fid].name} 주둔 · ${SK.CLASSES[g.cls].name}${dutyTail(fid, g)}</span></div>
          <div class="tc-troops"><span>지력 ${g.ji} · 매력 ${g.cha}</span><b>${scoutMonths(g)}개월</b></div>
          <span class="tc-go">▸</span></button>`);
      });
    });
    if (!rows.length) {
      SK.sfx.play('deny');
      SK.toast('첩자로 보낼 대기 장수가 없습니다. (모두 이번 달 일을 마쳤거나 맞닿은 내 성이 없습니다)');
      return;
    }
    const m = SK.modal({
      kicker: `${CITY[targetId].name} 첩보`, title: '누구를 첩자로 보낼까',
      body: `<p class="talent-note">금 ${scoutCost()}과 함께 보낸 장수의 이번 달 행동을 씁니다.</p>
        <div class="target-list">${rows.join('')}</div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        const hero = cityGens(b.dataset.city).find((g) => g.uid === b.dataset.uid);
        if (!hero) return;
        m.close();
        SK.scoutCity(targetId, b.dataset.city, hero);
      };
    });
  };

  /* 계략 — 이간계·유언비어 */
  function openSpy(cityId, kind) {
    SK.setPurse(cityId);
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
        if (actor) { consumeDispatch(cityId, actor); SK.gainExp(actor, 14); }
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

  /* ══════════════════════════════════════════════════════════════
     v5.8 — 외교·계약
     · 이간계: 적 성의 장수 한 명을 지목해 충성을 깎고, 낮아지면 회유한다
     · 항복 권고: 규모 차이가 큰 약소 세력에 어사를 보내 싸움 없이 성을 받는다
     · 동맹·휴전: 6~12개월 불가침 — AI도 그 기간에는 치지 않는다
     ══════════════════════════════════════════════════════════════ */
  const PEACE_TERMS = {
    truce: { key: 'truce', label: '휴전', months: 6, gold: 200, base: 0.44, desc: '6개월간 상대가 먼저 치지 않습니다' },
    pact: { key: 'pact', label: '동맹', months: 12, gold: 600, base: 0.26, desc: '12개월 불가침 — 국경을 맞대고도 서로 치지 않습니다' },
  };
  function enemyLoyal(g) {
    const s = SK.state || {};
    const v = s.genLoyal && g && s.genLoyal[g.id];
    if (v != null) return v;
    return ({ S: 92, A: 82, B: 72, C: 62 }[g.tier] || 72);
  }
  function setEnemyLoyal(gid, v) {
    const s = SK.state;
    s.genLoyal = s.genLoyal || {};
    s.genLoyal[gid] = clamp(Math.round(v), 0, 100);
    return s.genLoyal[gid];
  }
  SK.enemyLoyal = enemyLoyal;

  /* 이간계 — 성을 고르고, 그 성의 장수 한 명을 지목한다 */
  function openEstrange(cityId) {
    SK.setPurse(cityId);
    const s = SK.state;
    const targets = SK.allNeighbors(cityId).filter((n) => s.cities[n] && s.cities[n].owner !== PF()
      && s.cities[n].owner !== 'neutral' && (s.cities[n].genIds || []).length);
    if (!targets.length) { SK.toast('이간계를 펼 이웃 적성이 없습니다. (장수가 있는 성이 없습니다)'); return; }
    const rows = targets.map((id) => {
      const st = s.cities[id];
      const f = SK.factionInfo(st.owner);
      return `<button class="target-card" data-c="${id}">
        <span class="tc-flag" style="background:${f.color}">${SK.markOf(f)}</span>
        <div class="tc-main"><b>${CITY[id].name}</b><span>${f.name} · 장수 ${(st.genIds || []).length}명</span></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 이간계`, title: '어느 성을 흔들까',
      body: `<p class="talent-note">금 120과 장수 한 명의 이번 달 행동을 씹니다. 지력이 높으면 성공률이 오르고, 성공하면 지목한 장수의 충성이 뚝 떨어져 회유할 틈이 생깁니다.</p>
        <div class="target-list">${rows}</div>`, wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => { m.close(); setTimeout(() => openEstrangeGen(cityId, b.dataset.c), 30); };
    });
  }
  function openEstrangeGen(cityId, targetId) {
    SK.setPurse(cityId);
    const s = SK.state;
    const st = s.cities[targetId];
    const gens = (st.genIds || []).map((id) => SK.GEN_BY_ID[id]).filter(Boolean);
    if (!gens.length) { SK.toast('이 성에는 흔들 장수가 없습니다.'); return; }
    const rows = gens.map((g) => {
      const loy = enemyLoyal(g);
      return `<button class="target-card estr" data-g="${g.id}">
        <img class="tc-portrait" src="${SK.ptSrc(SK.genPortrait(g))}" alt="">
        <div class="tc-main"><b>${g.name}</b><span>${SK.CLASSES[SK.genClass(g)].name} · ${g.tier}급 · 지력 ${g.intel}</span>
          <span class="estr-bar"><i style="width:${loy}%"></i><em>충성 ${loy}</em></span></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[targetId].name} 이간계`, title: '누구를 흔들까',
      body: `<p class="talent-note">충성이 50 이하로 떨어지면 그 자리에서 회유를 시도합니다. 지력이 높은 장수를 보내면 성사가 쉽습니다. (금 120)</p>
        <div class="target-list">${rows}</div>`, wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card[data-g]').forEach((b) => {
      b.onclick = () => {
        if (s.gold < 120) { SK.sfx.play('deny'); SK.toast('금이 부족합니다. (필요 금 120)'); return; }
        const g = SK.GEN_BY_ID[Number(b.dataset.g)];
        const actor = pickActor(cityId);
        if (!actor) return;
        s.gold -= 120;
        consumeDispatch(cityId, actor);
        SK.gainExp(actor, 12);
        const p = clamp(0.52 + ((actor.ji || 60) - 60) * 0.009 - ((g.intel || 60) - 60) * 0.005, 0.12, 0.88);
        const ok = Math.random() < p;
        let after = enemyLoyal(g);
        if (ok) after = setEnemyLoyal(g.id, after - (26 + Math.floor(Math.random() * 16)));
        else setEnemyLoyal(g.id, Math.min(100, after + 4));
        SK.save(); SK.refreshHud(); m.close(); SK.openCity(cityId);
        SK.sfx.play(ok ? 'ui' : 'deny');
        const lure = ok && after <= 50;
        const res = SK.modal({
          kicker: `${CITY[targetId].name} 이간계`, title: ok ? `${g.name}의 충성이 흔들렸다` : '이간계가 들통났다',
          body: `<p class="modal-p">${ok
            ? `${josa(actor.name, 'i')} 적진에 거짓 편지를 풀어 ${josa(g.name, 'ui')} 의심하게 만들었습니다. 충성 ${after} — ${lure ? '지금 회유하면 넘어올 수 있습니다.' : '아직은 마음이 굳습니다.'}`
            : `${josa(g.name, 'i')} 보낸 사람을 의심했습니다. 이번 일은 수포로 돌아갔습니다.`}</p>`,
          actions: lure ? [
            { label: '나중에' },
            { label: `${g.name} 회유`, primary: true, onClick: () => lureGen(cityId, targetId, g, actor) },
          ] : [{ label: '확인', primary: true }],
        });
        void res;
      };
    });
  }
  /* 충성이 떨어진 적장을 회유 — 매력 대결. 성공하면 내 장수가 된다 */
  function lureGen(cityId, targetId, g, actor) {
    const s = SK.state;
    const loy = enemyLoyal(g);
    const p = clamp(0.34 + ((actor.cha || 60) - 60) * 0.008 + (35 - loy) * 0.015 + Math.min(0.1, (s.fame || 0) * 0.00002), 0.1, 0.9);
    const ok = Math.random() < p;
    if (ok) {
      const st = s.cities[targetId];
      st.genIds = (st.genIds || []).filter((id) => id !== g.id);
      const hero = makeHero(g.name, cityId, SK.genLv(g));
      if (hero) {
        hero.loyal = 55;
        s.heroes.push(hero);
        s.fame = (s.fame || 0) + 6;
      }
      delete (s.genLoyal || {})[g.id];
      SK.save(); SK.refreshHud();
      SK.sfx.play('ui');
      SK.modal({
        kicker: '회유 성공', title: `${g.name}, 우리에게로`, wide: true,
        body: `<div class="lure-card"><img src="${SK.ptSrc(SK.genPortrait(g))}" alt="">
          <div><b>${g.name}</b><span>${SK.CLASSES[SK.genClass(g)].name} · ${g.tier}급</span>
          <p>충성 ${loy}이던 장수가 사자를 따라 ${CITY[cityId].name}으로 왔습니다. 충성 55로 시작합니다 — [포상]으로 마음을 잡으십시오.</p></div></div>`,
        actions: [{ label: '맞이한다', primary: true }],
      });
    } else {
      setEnemyLoyal(g.id, Math.min(100, loy + 12));
      s.fame = Math.max(0, (s.fame || 0) - 2);
      SK.save();
      SK.sfx.play('deny');
      SK.modal({
        kicker: '회유 실패', title: '마음을 돌리지 못했다',
        body: `<p class="modal-p">${josa(g.name, 'i')} 사자를 돌려보냈습니다. 충성이 오히려 올라 이제 쉽지 않습니다.</p>`,
        actions: [{ label: '확인', primary: true }],
      });
    }
  }

  /* 항복 권고 — 규모 차이가 큰 약소 세력·고립된 한 성을 싸움 없이 받는다 */
  function openSurrenderAdvice(cityId) {
    const s = SK.state;
    const mine = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF()).reduce((a, c) => a + (s.cities[c.id].troops || 0), 0);
    const rows = [];
    SK.allNeighbors(cityId).forEach((id) => {
      const st = s.cities[id];
      if (!st || st.owner === PF() || st.owner === 'neutral') return;
      const fid = st.owner;
      const fCities = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === fid);
      const fTroops = fCities.reduce((a, c) => a + (s.cities[c.id].troops || 0), 0);
      const ratio = mine / Math.max(1, fTroops);
      if (fCities.length > 2 && ratio < 2) return;
      const f = SK.factionInfo(fid);
      rows.push(`<button class="target-card" data-c="${id}">
        <span class="tc-flag" style="background:${f.color}">${SK.markOf(f)}</span>
        <div class="tc-main"><b>${CITY[id].name}</b><span>${f.name} · 보유 ${fCities.length}성 · 병력 ${fmt(fTroops)}</span></div>
        <div class="tc-troops"><span>우리 병력 ${fmt(mine)}</span><b>${ratio.toFixed(1)}배</b></div>
        <span class="tc-go">▸</span></button>`);
    });
    if (!rows.length) {
      SK.toast('항복을 권할 만한 약소 세력이 이웃에 없습니다. (보유 3성 이하이거나 병력 2배 우위일 때)')
      return;
    }
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 외교`, title: '어느 세력에 항복을 권할까',
      body: `<p class="talent-note">금 300과 사자를 보냅니다. 상대가 작을수록·병력 차이가 클수록 성사가 쉽습니다. 성사되면 그 성과 성안의 장수가 우리 것이 됩니다.</p>
        <div class="target-list">${rows.join('')}</div>`, wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        if (s.gold < 300) { SK.sfx.play('deny'); SK.toast('금이 부족합니다. (필요 금 300)'); return; }
        const tid = b.dataset.c;
        const ts = s.cities[tid];
        const fid = ts.owner;
        const fCities = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === fid);
        const fTroops = fCities.reduce((a, c) => a + (s.cities[c.id].troops || 0), 0);
        const ratio = mine / Math.max(1, fTroops);
        const actor = pickActor(cityId);
        if (!actor) return;
        s.gold -= 300;
        consumeDispatch(cityId, actor);
        const p = clamp(0.1 + ((actor.cha || 60) - 60) * 0.008 + Math.max(0, ratio - 1.4) * 0.14 + Math.max(0, 3 - fCities.length) * 0.07, 0.05, 0.85);
        const ok = Math.random() < p;
        m.close();
        if (ok) {
          const join = [];
          (ts.genIds || []).forEach((gid) => {
            if (Math.random() < 0.45) { join.push(gid); return; }
          });
          ts.owner = PF();
          ts.troops = Math.max(800, Math.round((ts.troops || 800) * 0.7));
          ts.loyalty = 50;
          ts.def = Math.max(28, Math.round((ts.def || 50) * 0.85));
          ts.bandit = false;
          ts.governor = null;
          ts.advisor = null;
          ts.auto = true;
          ts.genIds = [];
          join.forEach((gid) => {
            const g = SK.GEN_BY_ID[gid];
            if (!g) return;
            const hero = makeHero(g.name, tid, SK.genLv(g));
            if (hero) { hero.loyal = 60; s.heroes.push(hero); }
          });
          s.fame = (s.fame || 0) + 8;
          syncFactionCities(s);
          /* v5.8 — 세력을 모두 잃으면 명부에서 지우므로, 이름은 지우기 전에 적어 둔다 */
          const fname = SK.factionName(fid);
          const leftF = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === fid).length;
          if (!leftF) delete s.factions[fid];
          SK.save(); SK.refreshHud();
          if (window.SKMap) { try { SKMap.refresh(); } catch (e) { /* ignore */ } }
          SK.sfx.play('ui');
          SK.openCity(cityId);
          if (SK.checkUnification) setTimeout(() => SK.checkUnification(), 700);
          SK.modal({
            kicker: '항복 권고 성사', title: `${SK.josa(CITY[tid].name, 'i')} 문을 열었다`, wide: true,
            body: `<div class="surr-card"><span class="surr-seal">降</span>
              <div><b>${fname}</b>
              <p>${josa(actor.name, 'i')} 설득한 끝에 상대가 싸우지 않고 성을 넘겼습니다. 명성 +8 · 병력 ${fmt(ts.troops)}을 그대로 받았습니다.</p>
              ${join.length ? `<em>성안 장수 ${join.map((id) => (SK.GEN_BY_ID[id] || {}).name).filter(Boolean).join(' · ')} 항복</em>` : '<em>성안 장수는 성을 떠났습니다</em>'}</div></div>`,
            actions: [{ label: '성으로', primary: true }],
          });
        } else {
          SK.save(); SK.refreshHud();
          SK.sfx.play('deny');
          SK.modal({
            kicker: '항복 권고', title: '상대가 거절했습니다',
            body: `<p class="modal-p">${josa(SK.factionName(fid), 'i')} 사자의 말을 받아들이지 않았습니다. 금 300만 나갔습니다.</p>`,
            actions: [{ label: '확인', primary: true }],
          });
        }
      };
    });
  }

  function openPeace(cityId) {
    const s = SK.state;
    const me = PF();
    const fids = {};
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (st.owner && st.owner !== me && st.owner !== 'neutral') fids[st.owner] = true;
    });
    const list = Object.keys(fids);
    if (!list.length) { SK.toast('화친을 청할 세력이 없습니다.'); return; }

    /* v5.27 — 이웃이 아닌 27개 세력이 모두 '교전 중'으로 줄줄이 나와 어느 쪽이 급한지 알 수 없던
       외교 화면을 상태 배지 + 관련도순 묶음으로 정리한다.
       · 거리: 우리 성에서 도로·해로로 몇 칸 떨어졌나 (BFS 3칸까지)
       · 1칸 = 국경을 맞댄 세력, 2칸 = 가까운 세력, 그 밖은 먼 세력 */
    const myCities = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === me).map((c) => c.id);
    const dist = {};
    myCities.forEach((id) => { dist[id] = 0; });
    let frontier = myCities.slice();
    for (let hop = 1; hop <= 3; hop++) {
      const next = [];
      frontier.forEach((id) => {
        (SK.neighbors(id) || []).concat(SK.seaNeighbors ? SK.seaNeighbors(id) : []).forEach((n) => {
          if (dist[n] == null) { dist[n] = hop; next.push(n); }
        });
      });
      frontier = next;
    }
    const rows = list.map((fid) => {
      const f = SK.factionInfo(fid);
      const left = (s.truce && s.truce[fid]) ? Math.max(0, s.truce[fid] - s.turn) : 0;
      const kind = (s.pacts && s.pacts[fid]) ? s.pacts[fid].kind : null;
      const cities = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === fid);
      let near = 99, ring = 0;
      cities.forEach((c) => {
        const d = dist[c.id] == null ? 99 : dist[c.id];
        if (d < near) near = d;
        if (d <= 1) ring += 1;
      });
      const status = left > 0 ? (kind === 'pact' ? 'pact' : 'truce') : 'war';
      return { fid, f, left, kind, status, near, ring, cities: cities.length };
    });
    const groups = [
      { key: 'pact', label: '휴전·동맹 중', desc: '기간이 끝나면 다시 적이 됩니다', items: [] },
      { key: 'near', label: '국경을 맞댄 세력', desc: '지금 바로 침공해 올 수 있습니다', items: [] },
      { key: 'close', label: '두 칸 안쪽 세력', desc: '곧 닿습니다', items: [] },
      { key: 'far', label: '먼 세력', desc: '당장은 국경이 닿지 않습니다', items: [] },
    ];
    rows.forEach((r) => {
      if (r.status !== 'war') groups[0].items.push(r);
      else if (r.near <= 1) groups[1].items.push(r);
      else if (r.near <= 2) groups[2].items.push(r);
      else groups[3].items.push(r);
    });
    groups.forEach((g) => {
      g.items.sort((a, b) => (a.near - b.near) || (b.ring - a.ring) || (a.f.name < b.f.name ? -1 : 1));
    });
    const badgeOf = (r) => r.status === 'pact'
      ? `<span class="dp-badge dp-pact">동맹 ${r.left}개월</span>`
      : r.status === 'truce' ? `<span class="dp-badge dp-truce">휴전 ${r.left}개월</span>`
      : `<span class="dp-badge dp-war">교전</span>`;
    const subOf = (r) => {
      if (r.status === 'war' && r.near > 2) return `${r.cities}성`;
      const bits = [`${r.cities}성`];
      if (r.ring) bits.push(`국경 ${r.ring}곳`);
      else if (r.near <= 2) bits.push('두 칸');
      return bits.join(' · ');
    };
    const cardOf = (r) => `<button class="target-card dp-card" data-f="${r.fid}">
        <span class="tc-flag" style="background:${r.f.color}">${SK.markOf(r.f)}</span>
        <div class="tc-main"><b>${r.f.name}</b><span>${subOf(r)}</span></div>
        ${badgeOf(r)}
        <span class="tc-go">▸</span></button>`;
    /* v5.27 — 먼 세력은 접어 둔다 (27개가 한 줄로 늘어서면 정작 급한 세력이 묻힌다) */
    const body = groups.filter((g) => g.items.length).map((g) => {
      const head = `<div class="dp-grp"><span>${g.label}</span><em>${g.items.length}</em><i>${g.desc}</i></div>`;
      if (g.key === 'far' && g.items.length > 4) {
        const first = g.items.slice(0, 3).map(cardOf).join('');
        const rest = g.items.slice(3).map(cardOf).join('');
        return `${head}${first}<div class="dp-far" hidden>${rest}</div>
          <button class="dp-more" data-more="1">먼 세력 ${g.items.length - 3}곳 더 보기 ▾</button>`;
      }
      return head + g.items.map(cardOf).join('');
    }).join('');
    const ringN = rows.filter((r) => r.status === 'war' && r.near <= 1).length;
    const pactN = rows.filter((r) => r.status !== 'war').length;
    const m = SK.modal({ kicker: `${CITY[cityId].name} 외교`, title: '어떤 세력과 만날까',
      body: `<p class="talent-note">사자를 보내 휴전(6개월 · 금 200)이나 동맹(12개월 · 금 600)을 맺습니다. 매력이 높은 장수가 나서면 성사가 쉽고, 기간 중에는 상대가 먼저 치지 않습니다.<br>국경을 맞댄 세력 <b>${ringN}</b> · 휴전·동맹 <b>${pactN}</b> · 나머지 <b>${rows.length - ringN - pactN}</b></p><div class="target-list">${body}</div>`,
      wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => { m.close(); setTimeout(() => openPeaceTerms(cityId, b.dataset.f), 30); };
    });
    const moreBtn = m.el.querySelector('.dp-more');
    if (moreBtn) {
      moreBtn.onclick = () => {
        const box = m.el.querySelector('.dp-far');
        if (!box) return;
        box.hidden = !box.hidden;
        moreBtn.textContent = box.hidden ? moreBtn.dataset.closed : '먼 세력 접기 ▴';
        SK.sfx.play('ui');
      };
      moreBtn.dataset.closed = moreBtn.textContent;
    }
  }

  function openPeaceTerms(cityId, fid) {
    const s = SK.state;
    const f = SK.factionInfo(fid);
    const left = (s.truce && s.truce[fid]) ? Math.max(0, s.truce[fid] - s.turn) : 0;
    const rows = Object.keys(PEACE_TERMS).map((k) => {
      const t = PEACE_TERMS[k];
      return `<button class="grp-row" data-t="${k}">
        <div><b>${t.label} — ${t.months}개월</b><span>${t.desc} · 금 ${t.gold}</span></div>
        <span class="grp-go">▸</span></button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${f.name} ${left ? `· ${left}개월 남음` : ''}`, title: '무엇을 청할까',
      body: `<p class="talent-note">기간이 끝나면 다시 적이 됩니다. 동맹은 사신 값이 비싸지만 두 배로 깁니다.</p><div class="grp-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('[data-t]').forEach((b) => {
      b.onclick = () => {
        const term = PEACE_TERMS[b.dataset.t];
        if (s.gold < term.gold) { SK.sfx.play('deny'); SK.toast(`금이 부족합니다. (필요 금 ${term.gold})`); return; }
        const actor = pickActor(cityId);
        if (!actor) return;
        s.gold -= term.gold;
        consumeDispatch(cityId, actor);
        /* v5.31 — 사자를 보낸 장수의 '외교 성공률·호감도' 보물이 그대로 확률에 붙는다 */
        const diploB = Math.min(0.25, (heroTfx(actor).diplo || 0) / 100);
        const p = clamp(term.base + Math.min(0.3, ((actor.cha || 60) - 60) * 0.006) + Math.min(0.1, (s.fame || 0) * 0.00002) + diploB, 0.08, 0.95);
        const ok = Math.random() < p;
        s.truce = s.truce || {};
        s.pacts = s.pacts || {};
        if (ok) {
          s.truce[fid] = s.turn + term.months;
          s.pacts[fid] = { kind: term.key, until: s.turn + term.months };
        }
        SK.save(); SK.refreshHud(); m.close(); SK.openCity(cityId);
        SK.sfx.play(ok ? 'ui' : 'deny');
        SK.modal({
          kicker: '외교', title: ok ? `${SK.josa(term.label, 'i')} 성립했습니다` : '사자가 빈손으로 돌아왔습니다',
          body: `<p class="modal-p">${ok ? `${josa(f.name, 'gwa')} ${term.months}개월 ${josa(term.label, 'eul')} 맺었습니다. 그동안 상대는 먼저 치지 않습니다.` : `${josa(f.name, 'i')} 사자를 물리쳤습니다. 금 ${term.gold}만 나갔습니다.`}</p>`,
          actions: [{ label: '확인', primary: true }],
        });
      };
    });
  }

  /* 수송 — 아군 성 사이에 병력·군량·금과 장수를 옮긴다 (v5.7 장수 전출 포함) */
  function openTransport(cityId) {
    SK.setPurse(cityId);
    const s = SK.state;
    const land = new Set(SK.neighbors(cityId) || []);
    const sea = new Set(SK.seaNeighbors(cityId) || []);
    const dests = SK.CITY_LIST.filter((c) => c.id !== cityId && s.cities[c.id].owner === PF())
      /* v5.29 — 성이 20곳을 넘으면 목록이 길다. 바로 이어진 성을 먼저 보여 준다. */
      .sort((a, b) => {
        const va = land.has(a.id) ? 0 : sea.has(a.id) ? 1 : 2;
        const vb = land.has(b.id) ? 0 : sea.has(b.id) ? 1 : 2;
        if (va !== vb) return va - vb;
        return (a.id === s.playerCapital ? -1 : b.id === s.playerCapital ? 1 : 0);
      });
    if (!dests.length) { SK.toast('수송할 다른 아군 성이 없습니다.'); return; }
    const rows = dests.map((c) => {
      const st = s.cities[c.id];
      const via = land.has(c.id) ? '육로' : sea.has(c.id) ? '해로' : '멀리';
      const fill = cityCap(st) ? Math.round((st.troops || 0) / cityCap(st) * 100) : 0;
      return `<button class="target-card" data-c="${c.id}">
        <span class="tc-flag" style="background:${SK.factionColor(PF())}">${SK.markOf(SK.factionInfo(PF()))}</span>
        <div class="tc-main"><b>${c.name}${c.id === s.playerCapital ? ' · 본성' : ''} <i class="tp-via">${via}</i></b><span>${typeName(c.type)} · 병력 ${fmt(st.troops)} / ${fmt(cityCap(st))} (${fill}%) · 장수 ${s.heroes.filter((h) => h.city === c.id).length}명</span></div>
        <span class="tc-go">▸</span></button>`;
    }).join('');
    const src = s.cities[cityId];
    const m = SK.modal({ kicker: `${CITY[cityId].name} 수송`, title: '어디로 보낼까',
      body: `<p class="talent-note">이 성의 병력 ${fmt(src.troops)} / ${fmt(cityCap(src))} · 금 ${fmt(s.gold)} · 군량 ${fmt(s.food)}. 병력·금·군량을 보내고, 장수도 함께 전출시킬 수 있습니다.</p><p class="talent-note">보유 ${dests.length}성 — 가까운(육로·해로로 이어진) 성이 위에 옵니다.</p><div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }] });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => { m.close(); openTransportAmount(cityId, b.dataset.c); };
    });
  }
  SK.openTransport = openTransport;
  function openTransportAmount(from, to) {
    SK.setPurse(from);
    const s = SK.state;
    const src = s.cities[from];
    const dst = s.cities[to];
    const maxT = Math.max(0, Math.floor(src.troops * 0.6));
    const maxG = Math.floor(s.gold * 0.5);
    const maxF = Math.floor(s.food * 0.5);
    const room = Math.max(0, cityCap(dst) - dst.troops);
    let t = Math.min(maxT, 3000, room), g = Math.min(maxG, 600), f = Math.min(maxF, 1200);
    const heroPool = cityGens(from);
    const move = {};
    /* v5.11 — 호송 장수 1명을 직접 고른다 (통솔이 높으면 더 많이 실어 나른다) */
    const escortPool = dispatchPool(from);
    let escortUid = escortPool.length ? escortPool[0].uid : null;
    const maxTBase = maxT;
    const escortCap = () => {
      const h = s.heroes.find((x) => x.uid === escortUid);
      return Math.round(maxTBase * (h ? clamp(1 + ((h.tong || 60) - 60) * 0.006, 0.9, 1.25) : 0.85));
    };
    const m = SK.modal({
      kicker: `${CITY[from].name} → ${CITY[to].name}`, title: '수송품을 정하세요',
      body: `<div class="transport">
        <label>병력 <input id="tp-t" type="range" min="0" max="${maxT}" step="1" value="${t}"><b id="tp-tv">${fmt(t)}</b>
          <span class="tp-step"><button id="tp-tminus" aria-label="1 줄이기">−1</button><button id="tp-tplus" aria-label="1 늘리기">＋1</button></span></label>
        <label>금 <input id="tp-g" type="range" min="0" max="${maxG}" step="50" value="${g}"><b id="tp-gv">${fmt(g)}</b></label>
        <label>군량 <input id="tp-f" type="range" min="0" max="${maxF}" step="100" value="${f}"><b id="tp-fv">${fmt(f)}</b></label>
        <p class="talent-note">보내는 성 병력 ${fmt(src.troops)} / ${fmt(cityCap(src))} · 받는 성 병력 ${fmt(dst.troops)} / ${fmt(cityCap(dst))} — 남는 자리 <b>${fmt(room)}</b>.</p>
      </div>
      <div class="deploy-section"><span>호송 장수</span><em>한 명을 고르십시오 — 통솔이 높으면 많이 실어 나릅니다</em></div>
      <div class="escort-row">${escortPool.length ? escortPool.map((h) => `<button class="ev-chip ${h.uid === escortUid ? 'on' : ''}" data-esc="${h.uid}">
        <img src="${SK.ptSrc(h.portrait)}" alt=""><b>${h.name}</b><em>통 ${h.tong}</em>${dutyLabelOf(from, h) ? '<i class="ev-duty">담당</i>' : ''}</button>`).join('') : '<em class="ev-none">이번 달 호송할 수 있는 장수가 없습니다 (병력·금·군량만 보냅니다)</em>'}</div>
      <div class="deploy-section"><span>장수 전출</span><em>함께 옮길 장수 (그달 행동은 쓰지 않습니다)</em></div>
      <div class="crew-list" id="tp-gens">${heroPool.map((h) => `<div class="crew-row">
          <img src="${SK.ptSrc(h.portrait)}" alt="">
          <div class="cw-main"><b>${h.name}</b><span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv} · ${dutyOf(h, from)}${h.uid === src.governor ? ' · 태수' : ''}${h.uid === src.advisor ? ' · 군사' : ''}</span></div>
          <button class="onoff" data-mv="${h.uid}">이동</button>
        </div>`).join('') || '<p class="tr-empty">이 성에 전출할 장수가 없습니다.</p>'}</div>`,
      wide: true,
      actions: [{ label: '취소' }, { label: '수송 보내기', primary: true, onClick: () => {
        const movers = Object.keys(move).filter((uid) => move[uid]);
        const actor = s.heroes.find((x) => x.uid === escortUid && x.city === from) || null;
        const roomNow = Math.max(0, cityCap(dst) - dst.troops);
        const sendT = Math.min(t, roomNow);
        src.troops = Math.max(0, src.troops - sendT);
        dst.troops += sendT;
        s.gold = Math.max(0, s.gold - g);
        s.food = Math.max(0, s.food - f);
        dst.gold = (dst.gold || 0) + g;
        dst.food = (dst.food || 0) + f;
        if (actor) { consumeDispatch(from, actor); SK.gainExp(actor, 18, 4); }
        movers.forEach((uid) => {
          const h = s.heroes.find((x) => x.uid === uid);
          if (!h) return;
          (src.slots || []).forEach((sl) => { if (sl.uid === uid) sl.uid = null; });
          src.trainCrew = (src.trainCrew || []).filter((id) => id !== uid);
          h.city = to;
          h.actedThisMonth = true;
        });
        if (src.governor && movers.indexOf(src.governor) >= 0) src.governor = null;
        if (src.advisor && movers.indexOf(src.advisor) >= 0) src.advisor = null;
        enforceLordGovernor(s);
        cityActorUid = null;
        SK.save(); SK.refreshHud(); m.close(); SK.openCity(from);
        SK.sfx.play('drum');
        SK.toast(`${CITY[to].name}으로 수송 — 병력 ${fmt(sendT)} · 금 ${fmt(g)} · 군량 ${fmt(f)}${movers.length ? ` · 장수 ${movers.length}명` : ''}`);
      } }],
    });
    m.el.querySelectorAll('[data-esc]').forEach((b) => {
      b.onclick = () => {
        escortUid = b.dataset.esc;
        m.el.querySelectorAll('[data-esc]').forEach((x) => x.classList.toggle('on', x === b));
        const tEl2 = m.el.querySelector('#tp-t');
        const cap = Math.max(0, Math.min(Math.floor(src.troops * 0.6), escortCap()));
        if (tEl2) { tEl2.max = String(cap); if (Number(tEl2.value) > cap) { tEl2.value = String(cap); t = cap; const lab = m.el.querySelector('#tp-tv'); if (lab) lab.textContent = fmt(cap); } }
      };
    });
    m.el.querySelectorAll('[data-mv]').forEach((b) => {
      b.onclick = () => {
        const uid = b.dataset.mv;
        move[uid] = !move[uid];
        b.classList.toggle('on', !!move[uid]);
        b.textContent = move[uid] ? '같이 감' : '이동';
      };
    });
    void g; void f; void maxG; void maxF;
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
    /* v5.7.1 — 건물 담당 장수도 일을 시킬 수 있다 (쓰면 그 건물 배속은 풀린다) */
    const ready = dispatchPool(cityId);
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
  /* ── v5.8 물음표 도움말 — 민심·치안·훈련도·대수확·세율 옆의 ? 버튼 ── */
  const HELP_TIPS = {
    loyal: { t: '민심', lines: ['백성이 다스림을 따르는 마음입니다. 세수와 인구가 민심을 따라 오르내립니다.', '40 아래로 떨어지면 소란이 나 병력이 줄고, 70을 넘으면 세수 15%가 붙습니다. [관아 → 백성 위로]로 올립니다.'] },
    order: { t: '치안', lines: ['성안 길이 얼마나 안전한지를 나타냅니다. 낮으면 산적과 도적이 늘고 병력이 새어 나갑니다.', '순찰소를 짓고 장수를 배속하면 달마다 조금씩 오릅니다.'] },
    train: { t: '훈련도', lines: ['이 성 병사들의 숙련도입니다. 높을수록 전장에서 같은 병력으로 더 강합니다.', '[병영 → 훈련]이나 연병장으로 올립니다. 출진할 때 이 수치가 부대에 그대로 넘어갑니다.'] },
    harvest: { t: '10월 대수확', lines: ['한 해 군량은 10월에 한 번에 들어옵니다. 농업도·민심·농원 Lv가 많을수록 많이 걷습니다.', '그 전까지는 [개간]·[탐색]·[군량 상인]으로 버티고, 병력 유지비는 매달 나갑니다.'] },
    tax: { t: '세율', lines: ['세금을 많이 걷으면 금은 빨리 모이지만 민심이 달마다 떨어집니다.', '낮게 두면 당장 금은 줄어도 민심이 올라 다음 달 세수와 인구가 늘어납니다.'] },
  };
  function helpDot(key) {
    return `<button class="help-dot" data-help="${key}" aria-label="설명 보기">?</button>`;
  }
  function showHelpTip(key) {
    const tip = HELP_TIPS[key];
    if (!tip) return;
    SK.modal({
      kicker: '쉬운 설명', title: tip.t,
      body: `<div class="help-tip">${tip.lines.map((l) => `<p>${l}</p>`).join('')}</div>`,
      actions: [{ label: '알겠습니다', primary: true }],
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('[data-help]') : null;
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    showHelpTip(b.dataset.help);
  });

  /* ══════════════════════════════════════════════════════════════
     v5.9 — 부상병(wounded)
     · 공격전·수성전에서 잃은 아군 병력의 35~50%가 전사 대신 부상병으로 남는다
       (병영 Lv.1마다 +3%p, 아무 병영이 없으면 35%)
     · 달이 바뀌면 부상병의 35%(최소 200명)가 주둔병으로 돌아온다
     · 병영에서 금으로 바로 치료할 수도 있다 ([부상병 치료])
     ══════════════════════════════════════════════════════════════ */
  const WOUND = {
    base: 0.35, perBarracks: 0.03, max: 0.50,
    healMonth: 0.35, healMin: 200, capRatio: 0.5, cost: 0.45,
  };
  SK.WOUND = WOUND;
  function barracksLv(cityId) {
    const cs = SK.state && SK.state.cities[cityId];
    const sl = cs && (cs.slots || []).find((x) => x.key === 'barracks');
    return sl ? (sl.lv || 1) : 0;
  }
  SK.barracksLv = barracksLv;
  function woundedRatio(cityId) {
    const blv = barracksLv(cityId);
    return Math.min(WOUND.max, WOUND.base + (blv ? (blv - 1) * WOUND.perBarracks : 0));
  }
  SK.woundedRatio = woundedRatio;
  function woundedCap(cityId) {
    const cs = SK.state && SK.state.cities[cityId];
    return cs ? Math.round(cityCap(cs) * WOUND.capRatio) : 0;
  }
  SK.woundedCap = woundedCap;
  /* 전투 손실 일부를 그 성의 부상병으로 돌린다 (돌려준 실제 인원) */
  SK.addWounded = function (cityId, lost, opts) {
    const s = SK.state;
    const cs = s && s.cities && s.cities[cityId];
    const lostN = Math.max(0, Math.round(lost || 0));
    if (!cs || !lostN) return 0;
    const ratio = opts && opts.ratio != null ? opts.ratio : woundedRatio(cityId);
    const cap = woundedCap(cityId);
    const room = Math.max(0, cap - Math.round(cs.wounded || 0));
    const add = Math.min(room, Math.round(lostN * ratio));
    if (add > 0) cs.wounded = Math.round(cs.wounded || 0) + add;
    return add;
  };
  /* 부상병 치료 비용 — 1명당 금 0.45 */
  SK.healCostOf = function (n) { return Math.max(1, Math.ceil(Math.max(0, n) * WOUND.cost)); };
  /* 금을 내고 치료 — 주둔병 상한까지 돌아온다 (돌려준 인원) */
  SK.tendWounded = function (cityId, opts) {
    SK.setPurse(cityId);
    const s = SK.state;
    const cs = s && s.cities && s.cities[cityId];
    if (!cs) return 0;
    const n = Math.round(cs.wounded || 0);
    if (!n) return 0;
    const cap = cityCap(cs);
    const room = Math.max(0, cap - Math.round(cs.troops || 0));
    const can = Math.min(n, room);
    if (can <= 0) { if (!(opts && opts.silent)) SK.toast('주둔병이 이미 최대입니다 — 자리가 날 때까지 회복을 기다리세요.'); return 0; }
    const cost = SK.healCostOf(can);
    if (Math.floor(s.gold) < cost) { if (!(opts && opts.silent)) SK.toast(`금이 모자랍니다 — 치료에 금 ${fmt(cost)}이 필요합니다.`); return 0; }
    s.gold -= cost;
    cs.wounded = n - can;
    cs.troops = Math.round(cs.troops || 0) + can;
    SK.save();
    SK.refreshHud();
    if (document.querySelector('#screen-city.active')) SK.openCity(cityId);
    SK.toast(`부상병 ${fmt(can)}명을 치료했습니다 — 금 −${fmt(cost)}`);
    SK.sfx.play('coin');
    return can;
  };
  function openHealWounded(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const n = Math.round(cs.wounded || 0);
    if (!n) { SK.toast('치료할 부상병이 없습니다.'); return; }
    const cap = cityCap(cs);
    const room = Math.max(0, cap - Math.round(cs.troops || 0));
    const can = Math.min(n, room);
    const cost = SK.healCostOf(can);
    const m = SK.modal({
      kicker: `${c.name} · 병영`, title: `부상병 ${fmt(n)}명`,
      body: `<div class="wound-card">
        <div class="wc-num"><svg class="wc-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-wound"></use></svg><b>${fmt(n)}</b><span>회복중</span></div>
        <p>전투에서 다친 병사들입니다. 달이 바뀌면 <b>${fmt(Math.max(Math.round(n * WOUND.healMonth), Math.min(n, WOUND.healMin)))}명</b>이 저절로 돌아오고, 지금 금을 내면 한 번에 치료합니다.</p>
        <div class="wc-rows">
          <div><span>지금 치료</span><b>${fmt(can)}명</b></div>
          <div><span>필요한 금</span><b class="${s.gold >= cost ? '' : 'minus'}">${fmt(cost)}</b></div>
          <div><span>금고</span><b>${fmt(s.gold)}</b></div>
          <div><span>주둔 자리</span><b>${fmt(room)}명</b></div>
        </div>
        ${can < n ? '<p class="talent-note">주둔병이 최대치에 가까워 지금은 일부만 돌아올 수 있습니다.</p>' : ''}
      </div>`,
      actions: [
        { label: '나중에' },
        { label: can ? `금 ${fmt(cost)}로 치료` : '치료 불가', primary: !!can, onClick: () => { if (can) { m.close(); SK.tendWounded(cityId); } } },
      ],
    });
  }
  SK.openHealWounded = openHealWounded;

  /* v5.9 시안 A — 내정 탭: 2열 막대 카드(+ 하단 요약은 #city-info) */
  function devCard(o) {
    const delta = o.delta ? `<em class="dc-delta ${o.delta.charAt(0) === '+' ? 'up' : 'down'}">${o.delta}</em>` : '';
    return `<div class="dev-card${o.warn ? ' warn' : ''}">
      <svg class="dc-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-${o.icon}"></use></svg>
      <div class="dc-main">
        <div class="dc-row"><span class="dc-label">${o.label}${o.help ? helpDot(o.help) : ''}</span><b class="dc-val">${o.val}</b>${delta}</div>
        <i class="dc-bar"><em style="width:${Math.max(2, Math.min(100, Math.round(o.pct)))}%;background:${o.color}"></em></i>
      </div>
    </div>`;
  }
  function renderCityDev(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const lv = cityLevel(cs);
    const dev = $('#city-dev');
    if (!dev) return;
    const pd = popMonthly(cs, c);
    const popCap = cityPopCap(c);
    const order = cs.order == null ? 55 : cs.order;
    dev.innerHTML = `
      <div class="dev-head">
        <span class="dev-lv">Lv.${lv}<em>/5</em></span>
        <b class="dev-name">${LV_TEXT[lv]}</b>
        <span class="dev-note">병력 상한 = 인구 17%</span>
      </div>
      <div class="dev-grid">
        ${devCard({ label: '인구', icon: 'pop', val: fmt(Math.round(cs.pop)), delta: `${pd >= 0 ? '+' : '−'}${fmt(Math.abs(pd))}/월`, pct: popCap ? cs.pop / popCap * 100 : 0, color: 'linear-gradient(90deg,#5f8b34,#8cbb54)' })}
        ${devCard({ label: '농업', icon: 'agri', val: Math.round(cs.agri), pct: cs.agri, color: 'linear-gradient(90deg,#5f8b34,#8cbb54)' })}
        ${devCard({ label: '민심', icon: 'loyal', val: Math.round(cs.loyalty), pct: cs.loyalty, color: 'linear-gradient(90deg,#a8443a,#d97a63)', help: 'loyal', warn: cs.loyalty < 40 })}
        ${devCard({ label: '상업', icon: 'comm', val: Math.round(cs.comm), pct: cs.comm, color: 'linear-gradient(90deg,#b8862f,#e8c268)' })}
        ${devCard({ label: '성벽', icon: 'wall', val: Math.round(cs.def), pct: cs.def, color: 'linear-gradient(90deg,#5b7387,#8fa8bd)' })}
        ${devCard({ label: '치안', icon: 'order', val: Math.round(order), pct: order, color: 'linear-gradient(90deg,#3f6b8a,#7fb0cf)', help: 'order', warn: order < 40 })}
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
      const wound = Math.round(cs.wounded || 0);
      const harvestFood = (harvestOf(s).rows.find((r) => r.city === c.name) || { food: 0 }).food;
      info.innerHTML = `<div class="ci-head"><b>성 요약</b><span>${c.name} · ${typeName(c.type)}</span></div>
        <div class="ci-grid">
          <div class="ci-cell"><span>최대 병력</span><b>${fmt(cap)}</b><em>인구 17%</em></div>
          <div class="ci-cell"><span>주둔병</span><b class="${pct >= 100 ? 'full' : ''}">${fmt(cs.troops)}</b><em>${pct}%</em></div>
          <div class="ci-cell wound${wound ? ' on' : ''}"><span>부상병</span><b>${fmt(wound)}</b>${wound ? `<button class="ci-heal" id="btn-heal-wounded" type="button">치료</button>` : '<em>없음</em>'}</div>
          <div class="ci-cell"><span>훈련도${helpDot('train')}</span><b>${Math.round(cs.train == null ? 50 : cs.train)}</b></div>
          <div class="ci-cell"><span>월 군량 유지</span><b class="minus">−${fmt(Math.ceil((cs.troops || 0) / 1000 * ECON.upkeepPer1000))}</b><em>이 성 병력 기준 · 1,000당 ${ECON.upkeepPer1000}</em></div>
          <div class="ci-cell"><span>${s.month === ECON.harvestMonth ? '가을 대수확' : '대수확'}${helpDot('harvest')}</span><b>${s.month === ECON.harvestMonth ? '거둠' : `${monthsUntilHarvest(s)}개월`}</b><em>대수확 예상 +${fmt(harvestFood)}</em></div>
          <div class="ci-cell"><span>태수</span><b>${govName}${govIsLord ? ' <em>(군주)</em>' : ''}</b></div>
          <div class="ci-cell"><span>군사</span><b>${advName}</b></div>
        </div>`;
      const heal = info.querySelector('#btn-heal-wounded');
      if (heal) heal.onclick = (e) => { e.stopPropagation(); SK.sfx.play('ui'); openHealWounded(cityId); };
    }
    const lvEl = $('#city-level');
    if (lvEl) { lvEl.textContent = `Lv.${lv}`; lvEl.dataset.lv = lv; }
  }
  SK.renderCityDev = renderCityDev;
  SK.cityLevelOf = function (id) { return cityLevel(SK.state.cities[id]); };

  /* ── 성 등급에 따른 장면 변화 (깃발·등불·인파·온기) ── */
  const SCENE_FILE = { 1: 'city_lv1', 2: 'city_lv2', 3: 'city_lv3', 4: 'city_lv3', 5: 'city_lv5' };
  /* v5.10 — 계절 그림을 먼저 걸고, 없으면 기존 그림으로 곶 떨어진다 */
  function setSceneSrc(img, chain) {
    let i = 0;
    const apply = () => {
      if (i >= chain.length) { img.onerror = null; return; }
      const src = chain[i];
      img.onerror = () => { i += 1; apply(); };
      if (img.getAttribute('src') !== src) img.src = src;
    };
    apply();
  }
  function sceneChainFor(file, base) {
    const season = (SK.seasonKeyOf && SK.state) ? SK.seasonKeyOf(SK.state.month) : 'summer';
    const chain = [];
    if (season !== 'summer') chain.push(`assets/scenes/${season}/${file}.webp`);
    chain.push(`assets/scenes/${file}.webp`);
    if (base) chain.push(base);
    return chain;
  }
  function sceneImageFor(base, lv) {
    const img = $('#city-scene-img');
    if (!img) return;
    const file = SCENE_FILE[lv] || 'city_lv1';
    setSceneSrc(img, sceneChainFor(file, base));
  }
  function renderSceneLevel(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const c = CITY[cityId];
    const lv = cityLevel(cs);
    /* v5.17 — 성곽 겹수(1·2·3중)를 성 그림 테두리와 배지로 보여 준다 */
    const rings = SK.siegeRingsOfCity ? SK.siegeRingsOfCity(c) : 1;
    const scene = $('#city-scene');
    if (scene) scene.className = 'city-scene lv-' + lv + ' ring-' + rings;
    sceneImageFor(`assets/scenes/${sceneFor(c)}.webp`, lv);
    /* v5.10 — 성 그림 위 계절 파티클 */
    if (SK.seasonFX) SK.seasonFX.attach($('#city-season'), () => SK.currentSeason());
    const box = $('#scene-lv');
    if (!box) return;
    let html = `<i class="sb-wall-badge r${rings}">${rings}중 성벽</i>`;
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

  /* ══════════════════════════════════════════════════════════════
     v5.5 — 성 안 살아 움직이는 백성·병사 (경량 2D 캔버스)
     · 성 그림 위에 투명 캔버스를 얹고, 지어진 시설(농원·시장·병영·순찰소·관아) 주변을
       카이로소프트풍 2등신 사람들이 오가게 그린다. 이미지·GIF 없이 코드로만 그린다.
     · 인구·민심·시설 수가 많을수록 사람이 늘고 거리가 활기차진다.
     ══════════════════════════════════════════════════════════════ */
  const CityLife = (function () {
    const ROLES = {
      farmer: { body: '#6f8b3c', trim: '#cfe0a0', hat: 'straw' },
      merchant: { body: '#b8862f', trim: '#f3dca8', hat: 'cap' },
      soldier: { body: '#4a6d9c', trim: '#b4c8e2', spear: true },
      patrol: { body: '#a8443a', trim: '#e8b3a4', spear: true },
      worker: { body: '#7e6c4c', trim: '#dbcba6' },
      kid: { body: '#c98c4e', trim: '#f4d9b0', small: true },
    };
    let cv = null, ctx = null, raf = 0, W = 0, H = 0, dpr = 1;
    let people = [], cityId = null, last = 0, running = false;

    function spotsFor(id) {
      const s = SK.state;
      const cs = s && s.cities[id];
      if (!cs) return [];
      const out = [{ x: OFFICE_SPOT.x, y: OFFICE_SPOT.y, role: 'patrol' }];
      (cs.slots || []).forEach((sl, i) => {
        if (!sl.key) return;
        const sp = sl.key === 'wall' ? WALL_SPOT : (YARD_SPOTS[i] || { x: 50, y: 60 });
        const role = sl.key === 'farm' ? 'farmer'
          : (sl.key === 'market' || sl.key === 'workshop') ? 'merchant'
          : (sl.key === 'barracks' || sl.key === 'training') ? 'soldier'
          : sl.key === 'patrol' ? 'patrol' : 'worker';
        out.push({ x: sp.x, y: sp.y, role: role, lv: sl.lv || 1 });
      });
      return out;
    }

    function resize() {
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn() {
      const s = SK.state;
      const cs = s && s.cities[cityId];
      people = [];
      if (!cs) return;
      const spots = spotsFor(cityId);
      const built = Math.max(1, spots.length);
      const pop = cs.pop || 0;
      const morale = cs.loyalty == null ? 50 : cs.loyalty;
      const want = Math.round(4 + pop / 24000 + morale / 14 + built * 0.7);
      const n = Math.max(3, Math.min(28, want));
      for (let i = 0; i < n; i++) {
        const sp = spots[i % spots.length];
        const roll = Math.random();
        const role = (roll < 0.12 && n > 6) ? 'kid' : sp.role;
        const hx = sp.x / 100 * W;
        const hy = sp.y / 100 * H + H * 0.045;
        const rad = Math.min(W, H) * (0.07 + Math.random() * 0.16);
        people.push({
          role: role, hx: hx, hy: hy, x: hx + (Math.random() * 2 - 1) * rad * 0.5,
          y: hy + (Math.random() * 2 - 1) * rad * 0.4, tx: hx, ty: hy, rad: rad,
          sp: (7 + Math.random() * 9), ph: Math.random() * Math.PI * 2, wait: Math.random() * 1.6, face: 1,
        });
        pickTarget(people[people.length - 1]);
      }
      people.sort((a, b) => a.y - b.y);
    }

    function pickTarget(p) {
      const a = Math.random() * Math.PI * 2;
      const d = p.rad * (0.35 + Math.random() * 0.65);
      p.tx = clamp(p.hx + Math.cos(a) * d, 12, W - 12);
      p.ty = clamp(p.hy + Math.sin(a) * d * 0.7, H * 0.16, H - 14);
    }

    function draw(p, sc) {
      const def = ROLES[p.role] || ROLES.worker;
      const h = (def.small ? 9.5 : 13.5) * sc;
      const walking = p.wait <= 0;
      const swing = walking ? Math.sin(p.ph) * 0.42 : 0;
      const bob = walking ? Math.abs(Math.sin(p.ph)) * h * 0.06 : 0;
      const x = p.x, y = p.y - bob;
      /* 그림자 */
      ctx.fillStyle = 'rgba(30, 20, 8, 0.22)';
      ctx.beginPath();
      ctx.ellipse(x, p.y + 0.6, h * 0.32, h * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      /* 다리 */
      ctx.strokeStyle = '#4a3a24';
      ctx.lineWidth = Math.max(0.8, h * 0.11);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - h * 0.1, y - h * 0.42);
      ctx.lineTo(x - h * 0.1 + swing * h * 0.7, y);
      ctx.moveTo(x + h * 0.1, y - h * 0.42);
      ctx.lineTo(x + h * 0.1 - swing * h * 0.7, y);
      ctx.stroke();
      /* 몸통 */
      ctx.fillStyle = def.body;
      const bw = h * 0.46, bh = h * 0.48;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - bw / 2, y - h * 0.9, bw, bh, h * 0.16);
      else ctx.rect(x - bw / 2, y - h * 0.9, bw, bh);
      ctx.fill();
      ctx.strokeStyle = 'rgba(38, 26, 12, 0.55)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      /* 옷깃 */
      ctx.fillStyle = def.trim;
      ctx.fillRect(x - bw * 0.16, y - h * 0.88, bw * 0.32, h * 0.14);
      /* 팔 */
      ctx.strokeStyle = def.body;
      ctx.lineWidth = Math.max(0.7, h * 0.1);
      ctx.beginPath();
      ctx.moveTo(x - bw * 0.48, y - h * 0.78);
      ctx.lineTo(x - bw * 0.62 + swing * h * 0.5, y - h * 0.5);
      ctx.moveTo(x + bw * 0.48, y - h * 0.78);
      ctx.lineTo(x + bw * 0.62 - swing * h * 0.5, y - h * 0.5);
      ctx.stroke();
      /* 창 */
      if (def.spear) {
        ctx.strokeStyle = '#6b5a3a';
        ctx.lineWidth = Math.max(0.6, h * 0.075);
        ctx.beginPath();
        ctx.moveTo(x + bw * 0.5, y - h * 1.25);
        ctx.lineTo(x + bw * 0.5, y - h * 0.1);
        ctx.stroke();
      }
      /* 머리 */
      ctx.fillStyle = '#f2cda6';
      ctx.beginPath();
      ctx.arc(x, y - h * 1.06, h * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(38, 26, 12, 0.5)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      /* 머리카락·삿갓 */
      if (def.hat === 'straw') {
        ctx.fillStyle = '#d8bb74';
        ctx.beginPath();
        ctx.moveTo(x - h * 0.34, y - h * 1.12);
        ctx.lineTo(x + h * 0.34, y - h * 1.12);
        ctx.lineTo(x, y - h * 1.34);
        ctx.closePath(); ctx.fill();
      } else if (def.hat === 'cap') {
        ctx.fillStyle = '#3c2f1c';
        ctx.beginPath();
        ctx.arc(x, y - h * 1.14, h * 0.22, Math.PI, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#3a2a18';
        ctx.beginPath();
        ctx.arc(x, y - h * 1.16, h * 0.19, Math.PI * 1.05, Math.PI * 1.95);
        ctx.fill();
      }
    }

    function frame(ts) {
      if (!running) return;
      const scr = document.getElementById('screen-city');
      if (!scr || !scr.classList.contains('active')) { stop(); return; }
      const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
      last = ts;
      const sc = Math.max(0.7, Math.min(1.5, H / 380));
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        if (p.wait > 0) {
          p.wait -= dt;
          p.ph += dt * 1.2;
        } else {
          const dx = p.tx - p.x, dy = p.ty - p.y;
          const d = Math.hypot(dx, dy);
          if (d < 1.6) { p.wait = 0.5 + Math.random() * 2.4; pickTarget(p); }
          else {
            const step = p.sp * dt;
            p.x += dx / d * step; p.y += dy / d * step;
            p.face = dx >= 0 ? 1 : -1;
            p.ph += dt * 9;
          }
        }
        draw(p, sc);
      }
      people.sort((a, b) => a.y - b.y);
      raf = requestAnimationFrame(frame);
    }

    function start(id) {
      cv = document.getElementById('city-life');
      if (!cv) return;
      ctx = cv.getContext('2d');
      cityId = id || (SK.state && SK.state.lastCity);
      stop();
      resize();
      spawn();
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ctx) ctx.clearRect(0, 0, W, H);
    }
    return {
      start: start, stop: stop,
      info() { return { running: running, count: people.length, w: W, h: H, city: cityId }; },
      resize() { resize(); spawn(); },
    };
  })();
  SK.cityLife = CityLife;

  /* ══════════════════════════════════════════════════════════════
     v5.10 — 사계절 파티클 (지도·성 그림 위 경량 캔버스)
     · 봄 벚꽃잎 · 여름 반딧불 · 가을 단풍잎 · 겨울 눈송이
     · 캔버스마다 rAF 하나만 돌리고, 캔버스가 화면에서 사라지면 스스로 멈춘다
     · 계절이 바뀌면(달이 바뀌면) 스스로 다시 뿌린다
     ══════════════════════════════════════════════════════════════ */
  const SeasonFX = (function () {
    const CONF = {
      spring: { n: 24, kind: 'petal' },
      summer: { n: 16, kind: 'firefly' },
      autumn: { n: 20, kind: 'leaf' },
      winter: { n: 34, kind: 'snow' },
    };
    const PETAL = ['#ffd6e6', '#ffe9f2', '#f6bcd2', '#fff2f7'];
    const LEAF = ['#d9822b', '#c1552c', '#e0a83a', '#a8443a'];
    const SNOW = ['#ffffff', '#eef7ff', '#dcecfb'];
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function seedParticle(kind, w, h) {
      const p = { x: Math.random() * w, y: Math.random() * h, ph: Math.random() * Math.PI * 2 };
      if (kind === 'firefly') {
        Object.assign(p, { r: rnd(1.0, 2.1), vy: rnd(-0.14, 0.14), vx: rnd(-0.18, 0.18), sw: rnd(0.5, 1.2), glow: rnd(0.45, 1) });
      } else if (kind === 'snow') {
        Object.assign(p, { r: rnd(0.9, 2.6), vy: rnd(0.24, 0.7), vx: rnd(-0.12, 0.2), sw: rnd(0.5, 1.4),
          a: rnd(0.55, 0.95), c: SNOW[Math.floor(Math.random() * SNOW.length)] });
      } else {
        const petal = kind === 'petal';
        Object.assign(p, {
          r: rnd(petal ? 3.2 : 3.6, petal ? 6.6 : 7.6), vy: rnd(0.26, 0.7), vx: rnd(-0.28, 0.5), sw: rnd(0.6, 1.5),
          rot: Math.random() * Math.PI * 2, spin: rnd(-0.024, 0.024),
          c: (petal ? PETAL : LEAF)[Math.floor(Math.random() * 4)], a: rnd(0.7, 0.95),
        });
      }
      return p;
    }
    function draw(ctx, kind, p, t) {
      const sway = Math.sin(t * 0.001 * p.sw + p.ph) * (kind === 'snow' ? 8 : 14);
      ctx.save();
      ctx.translate(p.x + sway, p.y);
      if (kind === 'snow') {
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 6.2832); ctx.fill();
      } else if (kind === 'firefly') {
        const pulse = 0.32 + 0.68 * Math.abs(Math.sin(t * 0.0011 + p.ph * 2));
        ctx.globalAlpha = p.glow * pulse;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r * 6);
        grad.addColorStop(0, '#fffcd0');
        grad.addColorStop(0.35, 'rgba(255,230,120,0.75)');
        grad.addColorStop(1, 'rgba(255,220,90,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, p.r * 6, 0, 6.2832); ctx.fill();
      } else {
        ctx.globalAlpha = p.a;
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * (kind === 'petal' ? 0.55 : 0.42), 0, 0, 6.2832);
        ctx.fill();
        if (kind === 'leaf') {
          ctx.strokeStyle = 'rgba(90,40,10,0.45)'; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(-p.r * 0.8, 0); ctx.lineTo(p.r * 0.8, 0); ctx.stroke();
        }
      }
      ctx.restore();
    }
    function attach(canvas, getSeason) {
      if (!canvas) return null;
      if (canvas.__sxfx) {
        if (getSeason) canvas.__sxfx.getSeason = getSeason;
        return canvas.__sxfx;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const st = { parts: [], season: '', kind: 'snow', raf: 0, w: 0, h: 0, dpr: 1, last: 0, getSeason: getSeason };
      const reseed = () => {
        const season = (st.getSeason && st.getSeason()) || 'summer';
        st.season = season;
        const conf = CONF[season] || CONF.summer;
        const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const want = calm ? Math.max(4, Math.round(conf.n / 3)) : conf.n;
        st.kind = conf.kind;
        st.parts = [];
        for (let i = 0; i < want; i++) st.parts.push(seedParticle(conf.kind, st.w, st.h));
      };
      const resize = () => {
        const r = canvas.getBoundingClientRect();
        st.dpr = Math.min(2, window.devicePixelRatio || 1);
        st.w = Math.max(1, Math.round(r.width));
        st.h = Math.max(1, Math.round(r.height));
        canvas.width = Math.round(st.w * st.dpr);
        canvas.height = Math.round(st.h * st.dpr);
        ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        reseed();
      };
      const step = (t) => {
        const dt = Math.min(48, t - (st.last || t)) / 16.67;
        st.last = t;
        if (!canvas.isConnected || !st.w || !st.h) { st.raf = 0; return; }
        const cur = (st.getSeason && st.getSeason()) || 'summer';
        if (cur !== st.season) reseed();
        ctx.clearRect(0, 0, st.w, st.h);
        const drift = st.kind === 'firefly' ? 1 : 1.4;
        for (let i = 0; i < st.parts.length; i++) {
          const p = st.parts[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt * drift;
          if (p.spin) p.rot += p.spin * dt;
          if (p.y > st.h + 12) { p.y = -12; p.x = Math.random() * st.w; }
          if (p.y < -14) p.y = st.h + 10;
          if (p.x < -18) p.x = st.w + 12; else if (p.x > st.w + 18) p.x = -12;
          draw(ctx, st.kind, p, t);
        }
        ctx.globalAlpha = 1;
        st.raf = requestAnimationFrame(step);
      };
      st.reseed = reseed;
      st.stop = () => { if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; } };
      st.start = () => { if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(step); } };
      canvas.__sxfx = st;
      resize();
      window.addEventListener('resize', () => { if (canvas.__sxfx === st) resize(); });
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => { if (canvas.__sxfx === st) resize(); });
        ro.observe(canvas);
      }
      st.start();
      return st;
    }
    return {
      attach: attach,
      reseed(canvas) { const st = canvas && canvas.__sxfx; if (st) st.reseed(); },
      count(canvas) { const st = canvas && canvas.__sxfx; return st ? st.parts.length : 0; },
      season(canvas) { const st = canvas && canvas.__sxfx; return st ? st.season : null; },
      kind(canvas) { const st = canvas && canvas.__sxfx; return st ? st.kind : null; },
    };
  })();
  SK.seasonFX = SeasonFX;

  /* ── 장수 선택 · 행동력 표시 (v5.9 시안 A — 장수 카드 목록) ── */
  function renderCityGens(cityId) {
    const gens = cityGens(cityId);
    const cur = gens.find((g) => g.uid === cityActorUid && !g.actedThisMonth);
    if (!cur) {
      const ready = gens.filter((g) => !g.actedThisMonth);
      cityActorUid = ready.length ? ready[0].uid : null;
    }
    const el = $('#city-generals');
    if (!el) return;
    el.innerHTML = `<div class="gl-head"><b>주둔 장수 <em>${gens.length}명</em></b>
        <button class="gl-all" data-all="1" type="button">장수 명부 ▸</button></div>
      <div class="gen-list">${gens.map((g) => {
      const duty = dutyOf(g, cityId);
      const done = duty === '이번 달 완료';
      const isDuty = onDuty(g, cityId);
      const sel = !done && !isDuty && g.uid === cityActorUid;
      const role = roleOf(g);
      const off = SK.officeOf ? SK.officeOf(g) : null;
      const dutyText = done ? '완료' : duty === '대기' ? '대기' : (duty.indexOf('수련') >= 0 ? '수련' : '담당');
      const dutyTone = done ? 'done' : dutyText === '대기' ? 'ready' : dutyText === '수련' ? 'train' : 'duty';
      const cls = `${done ? 'done' : ''} ${isDuty ? 'duty' : ''} ${sel ? 'sel' : ''}`.trim();
      return `<div class="gen-card ${cls}" data-uid="${g.uid}" role="button" tabindex="0">
        <span class="gc-pt"><img src="${SK.ptSrc(g.portrait)}" alt=""><em class="gc-lv">Lv.${g.lv}</em></span>
        <span class="gc-body">
          <span class="gc-line1">
            <b class="gc-name">${g.name}</b>
            ${off && off.key !== 'none' ? `<i class="gc-off">${off.name}</i>` : ''}
            ${(g.merit || 0) > 0 ? `<i class="gc-merit">공훈 ${fmt(g.merit || 0)}</i>` : ''}
            <em class="gc-flag ${dutyTone}">${dutyText}</em>
          </span>
          <span class="gc-line2">${role === SK.CLASSES[g.cls].name ? role : `${role} · ${SK.CLASSES[g.cls].name}`}</span>
          <span class="gc-nums"><i>통<b>${g.tong}</b></i><i>무<b>${g.wu}</b></i><i>지<b>${g.ji}</b></i><i>정<b>${g.pol || 60}</b></i><i>매<b>${g.cha || 60}</b></i><i class="loy">충<b>${Math.round(loyalOf(g))}</b></i></span>
        </span>
      </div>`;
    }).join('') || '<p class="empty-gens">주둔한 장수가 없습니다. 주점에서 인재를 등용하세요.</p>'}</div>`;
    el.querySelectorAll('.gen-card, .gl-all').forEach((b) => {
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

  /* 장수 상태판 — 공용 행동력 숫자 대신 담당·대기·완료로 보여 준다 (v5)
     v5.10 — [＋ 자동 배속]·[매달 최선]은 [시설] 탭으로 옮겼다. 여기는 상태 요약과 군사 조언만 */
  function renderApBar(gens) {
    const bar = $('#city-ap');
    if (!bar) return;
    const cityId = SK.state.lastCity;
    const cs = SK.state.cities[cityId] || {};
    const slots = cs.slots || [];
    const onSlot = (g) => slots.some((sl) => sl.uid === g.uid || sl.deputy === g.uid);
    const dutyN = gens.filter(onSlot).length;
    const doneN = gens.filter((g) => g.actedThisMonth && !onSlot(g)).length;
    const readyN = gens.length - dutyN - doneN;
    const advisor = gens.find((g) => g.uid === cs.advisor);
    const actor = gens.find((g) => g.uid === cityActorUid && !g.actedThisMonth);
    bar.innerHTML = `
      <div class="ap-head">
        <span class="ap-title">장수 상태</span>
        <div class="ap-dots">
          <i class="duty"></i><em>담당 ${dutyN}</em>
          <i class="ready"></i><em>대기 ${readyN}</em>
          <i class="spent"></i><em>완료 ${doneN}</em>
        </div>
      </div>
      <div class="ap-row2">
        <span class="ap-actor">${actor
          ? `<img src="${SK.ptSrc(actor.portrait)}" alt="">${actor.name} 차례`
          : (readyN ? '대기 장수를 고르세요' : '다음 달에 다시')}</span>
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
    const pol = (actor ? effStat(actor, 'pol') : 60) * 0.55 + (gov ? effStat(gov, 'pol') : 60) * 0.35 + (gov ? effStat(gov, 'tong') : 60) * 0.10;
    return 1 + Math.max(-0.15, Math.min(0.34, (pol - 60) * 0.0085));
  }
  /* v5.12 — 징병 효율은 보낸 장수의 매력·통솔을 함께 본다 */
  function conMul(cityId, actor) {
    const gov = officerOf(cityId, 'gov');
    const cha = (actor ? effStat(actor, 'cha') : 60) * 0.35 + (actor ? effStat(actor, 'tong') : 60) * 0.15
      + (gov ? effStat(gov, 'cha') : 60) * 0.25 + (gov ? effStat(gov, 'tong') : 60) * 0.25;
    return 1 + Math.max(-0.15, Math.min(0.30, (cha - 60) * 0.0075));
  }
  function talentMul(cityId, actor) {
    const strat = officerOf(cityId, 'adv');
    const cha = (actor ? effStat(actor, 'cha') : 60) * 0.5 + (strat ? effStat(strat, 'cha') : 60) * 0.3 + (strat ? effStat(strat, 'ji') : 60) * 0.2;
    return Math.max(0.82, 1 - Math.max(0, (cha - 60) * 0.005));
  }
  SK.polMul = polMul; SK.conMul = conMul; SK.talentMul = talentMul;

  /* 민심 위로 — 관아·조언·자동 내정이 같이 쓴다 (v5.5: 매력·정치 가중치) */
  function comfortGain(actor) {
    const cha = actor ? effStat(actor, 'cha') : 60;
    const pol = actor ? effStat(actor, 'pol') : 60;
    const mix = cha * 0.6 + pol * 0.4;
    return Math.max(2, Math.min(16, Math.round(3 + (mix - 60) * 0.16)));
  }
  function comfortCity(cityId, actor) {
    SK.setPurse(cityId);
    const s = SK.state;
    const cs = s.cities[cityId];
    if (!cs) return { ok: false, msg: '성 정보가 없습니다.' };
    if (s.gold < 100) return { ok: false, msg: '금이 부족합니다. (필요 금 100)' };
    const gain = comfortGain(actor);
    s.gold -= 100;
    cs.loyalty = clamp(cs.loyalty + gain, 0, 100);
    return { ok: true, gain, msg: `백성을 위로했습니다 — 민심 +${gain}` };
  }
  SK.comfortCity = comfortCity;
  SK.comfortGain = comfortGain;

  /* v5.5 — [백성을 위로한다]: 대기 장수를 골라 파견한다. 매력+정치가 높을수록 민심이 크게 오른다 */
  function openComfort(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    if (s.gold < 100) { SK.sfx.play('deny'); SK.toast('금이 부족합니다. (필요 금 100)'); return; }
    const ready = actorPoolBy(cityId, comfortGain);
    if (!ready.length) {
      SK.sfx.play('deny');
      SK.toast('백성을 위로하러 보낼 장수가 없습니다. (모두 이번 달 일을 마쳤습니다)');
      return;
    }
    const rows = ready.map((g, i) => `<button class="target-card" data-uid="${g.uid}">
      <img class="tc-portrait gold" src="${SK.ptSrc(g.portrait)}" alt="">
      <div class="tc-main"><b>${g.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b>
        <span>${SK.CLASSES[g.cls].name} · 매력 ${g.cha} · 정치 ${g.pol || 60}${dutyTail(cityId, g)}</span></div>
      <div class="tc-troops"><span>민심</span><b>+${comfortGain(g)}</b></div>
      <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 관아`, title: '누구를 보내 백성을 위로할까',
      body: `<p class="talent-note">금 100과 보낸 장수의 이번 달 행동을 씁니다. 매력과 정치가 높은 장수가 나서면 민심이 크게 오릅니다. 지금 민심 ${Math.round(cs.loyalty)}.</p>
        <div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card[data-uid]').forEach((b) => {
      b.onclick = () => {
        const g = cityGens(cityId).find((x) => x.uid === b.dataset.uid);
        if (!g) return;
        const res = comfortCity(cityId, g);
        if (!res.ok) { SK.sfx.play('deny'); SK.toast(res.msg); return; }
        const was = consumeDispatch(cityId, g);
        SK.gainExp(g, 8);
        SK.save(); SK.refreshHud(); m.close();
        SK.openCity(cityId);
        floatHotspot('office', `민심 +${res.gain}`);
        SK.toast(`${g.name} — ${res.msg}${was ? ` (${was} 배속 해제)` : ''}`);
      };
    });
  }
  SK.openComfort = openComfort;

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
      if (s.gold < 150 || s.food < 120) return fail('금이나 군량이 부족합니다. (필요 금 150 · 군량 120)');
      const cap = cityCap(st);
      if (st.troops >= cap) return fail(`인구 대비 병력 상한입니다. (최대 ${fmt(cap)} · 인구 17%)`);
      if (st.pop < 9000) return fail(`인구가 너무 적습니다. (인구 ${fmt(st.pop)})`);
      const m = conMul(cityId, actor);
      const rPct = 1 + (SK.techPct ? SK.techPct('recruitPct') : 0) / 100;
      /* v5.21 — 징병량 절반(2,500 → 1,200 · 보너스 800 → 350). 비용은 금 150 · 군량 120 그대로 */
      const want = Math.min(Math.round((1200 + (roll(0.2) ? 350 : 0)) * m * rPct), cap - st.troops, Math.floor((st.pop - 6000) * 0.9));
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
      /* v5.12 — 고른 지휘관의 통솔·무력으로 훈련 효율이 달라진다 */
      const avg = actor ? (((actor.tong || 60) + (actor.wu || 60)) / 2) : 60;
      const eff = clamp(0.8 + (avg - 50) * 0.008, 0.8, 1.35);
      /* v5.32 — 병사 훈련도를 한 번에 +7~+11 올린다 (예전 +2~+4는 체감이 없었다) */
      cs.train = clamp(beforeTrain + Math.max(5, Math.round(8 * eff)), 0, 100);
      const trainGain = Math.round(cs.train) - Math.round(beforeTrain);
      const bonus = roll(0.2) ? 60 : 0;
      const rows = gens.map((h) => {
        const isActor = actor && h.uid === actor.uid;
        const gain = Math.round((90 + bonus + (isActor ? 90 : 0)) * (isActor ? eff : 1));
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
        msg: `훈련 완료 — 훈련도 ${Math.round(beforeTrain)}→${Math.round(cs.train)}${actor ? ` · ${actor.name} 경험치 +${Math.round(180 * eff)} · 공훈 +${Math.max(1, Math.round(180 * eff / 12))}` : ''}`,
        hotKey: 'repair', hot: `훈련도 ${Math.round(cs.train)}`, exp: 0, train: cs.train,
        after: () => SK.modal({ kicker: `${CITY[cityId].name} 훈련장`, title: '병법을 익혔다',
          body: `<div class="train-banner">
              <div class="tb-top"><span>병사 훈련도</span>
                <b>${Math.round(beforeTrain)} <em>→</em> ${Math.round(cs.train)}</b>
                <em class="tb-gain">${trainGain > 0 ? `+${trainGain}` : '최고'}</em></div>
              <i class="tb-bar"><s style="width:${clamp(Math.round(cs.train), 0, 100)}%"></s><u style="left:${clamp(Math.round(beforeTrain), 0, 100)}%"></u></i>
              <p class="tb-note">${trainGain > 0 ? '이 성에서 출진하는 부대의 전장 훈련도가 함께 올라갑니다.' : '이미 최고 훈련도입니다 — 장수 경험치만 올랐습니다.'}</p>
            </div>
            <div class="train-list">${rows}</div>`,
          actions: [{ label: '확인', primary: true }] }),
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
    const lordSet = SK.lordNameSet(st);
    const take = (g, fromId, here) => {
      if (!g || seen.has(g.id)) return;
      /* v5.23 — 이 성에 앉아 있는 재야(here)도 같은 지역 인물만 보여 준다.
         (v5.22에서 예외로 둔 탓에 옛 세이브·긴급 보충으로 들어온 중국 인재가
          한국 성 주점에 그대로 남아 있었다. 한국 풀이 두터워진 지금은 예외가 필요 없다.) */
      if (genPoolGroup(g) !== grp) return;
      if (SK.isLordOnly(g, lordSet)) return;   // v5.20 — 군주·왕은 재야 인재가 아니다
      if (!SK.debutOk(g, eraYearOf(st))) return;
      if (SK.isDead(g.id, g.name)) return;          // v5.8 — 처형한 장수는 다시 나오지 않는다
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
    /* v5.32 — AI 세력 소속 장수까지 막는다 (성에 다 앉히지 못한 장수가 주점에 새는 길 차단) */
    const used = garrisonedIds(s);
    const grp = tavernGroupOf(s, cityId);
    const yr = eraYearOf(s);
    const lordSet = SK.lordNameSet(s);
    const pool = SK.GENERALS.filter((g) => !used.has(g.id) && genPoolGroup(g) === grp && SK.debutOk(g, yr) && !SK.isDead(g.id, g.name) && !SK.isLordOnly(g, lordSet))
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
    if (actor) p += (effStat(actor, 'cha') - 60) * 0.55 + (effStat(actor, 'ji') - 60) * 0.18;
    /* v5.31 — 옥선·비단전포·옥대: '외교·등용 효율'은 등용 성공률 +N%p */
    if (actor) p += Math.min(20, (heroTfx(actor).diplo || 0) * 0.6);
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
    SK.setPurse(cityId);
    const s = SK.state;
    if (!s.recruitFail) s.recruitFail = {};
    const c = CITY[cityId];
    const pool = tavernPool(cityId);
    /* v5.16 — 주점에서 마주친 인재는 도감에 조우로 남는다 */
    if (SK.codexMeet) SK.codexMeet(pool.map((p) => p.g.id));
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
          <span>${SK.CLASSES[cls].name} · ${g.skill || '특기 없음'}</span>
          ${(SK.PASSIVES && SK.PASSIVES[g.name]) ? `<em class="gp-passive">${SK.PASSIVES[g.name].title}</em>` : ''}
          <em class="gp-rumor">“${rumor}”</em>
          <em class="gp-stats"><i>통 <b>${g.leadership}</b></i><i>무 <b>${g.war}</b></i><i>지 <b>${g.intel}</b></i><i>정 <b>${g.politics || 60}</b></i><i>매 <b>${g.charm || 60}</b></i></em>
        </div>
        <span class="gp-cost">${refuse ? '등용 거부' : tried ? '이번 달 거절' : `금 ${fmt(cost)}<small class="gp-rate ${rate < 30 ? 'low' : rate < 60 ? 'mid' : ''}">등용 ${rate}%</small>`}</span>
      </button>`;
    }).join('') || '<p class="tr-empty">주점이 조용합니다. 이 성과 옆 성에도 소문난 인재가 없습니다.</p>';
    /* v5.5 — 사신을 직접 고른다. 매력이 높을수록 등용 확률·값이 유리하다
       v5.7.1 — 건물 담당 장수도 사신으로 세울 수 있다 (보내면 그 건물 배속은 풀린다) */
    const ready = actorPoolBy(cityId, (g) => (g.cha || 60));
    const envoyRow = `<div class="envoy-row">
      <span class="ev-label">사신</span>
      ${ready.length ? ready.slice(0, 8).map((g) => `<button class="ev-chip ${actor && actor.uid === g.uid ? 'on' : ''}" data-envoy="${g.uid}" title="${dutyLabelOf(cityId, g) ? dutyLabelOf(cityId, g) + ' · 파견 시 자동 해제' : '대기'}${g.actedThisMonth ? ' · 이번 달 완료' : ''}">
        <img src="${SK.ptSrc(g.portrait)}" alt=""><b>${g.name}</b><em>매력 ${g.cha}</em>${dutyLabelOf(cityId, g) ? '<i class="ev-duty">담당</i>' : ''}</button>`).join('')
        : '<em class="ev-none">이번 달 보낼 수 있는 장수가 없습니다</em>'}
    </div>`;
    const m = SK.modal({
      kicker: `${c.name} 주점`,
      title: '어떤 인재가 있나',
      body: `<p class="talent-note">${actor ? `${josa(actor.name, 'i')} 이번 달 주점을 찾았습니다. ` : ''}이 성에서 ${hereN}명, 길로 이어진 옆 성에서 ${pool.length - hereN}명을 만났습니다. 등용하면 ${actor ? actor.name + ' 님의 행동력과 ' : ''}새로 온 장수의 이번 달 행동이 끝납니다. 매력이 높은 장수가 사신으로 나서면 값이 줄고 성공률이 오릅니다.${actor && dutyLabelOf(cityId, actor) ? ` 사신 <b>${josa(actor.name, 'i')}</b> ${dutyLabelOf(cityId, actor)} 중이라 시도하는 순간 배속이 풀립니다.` : ''}<br><b>보통 인재(B·C급)가 흔하고, S·A급은 좀처럼 모습을 드러내지 않습니다.</b> 이 성 깃발에 맞는 동네 인물만 찾아옵니다.</p>
        ${envoyRow}
        <div class="gen-pick-list">${rows}</div>`,
      wide: true,
      actions: [{ label: '나가기' }],
    });
    m.el.querySelectorAll('.ev-chip[data-envoy]').forEach((b) => {
      b.onclick = () => {
        const g = cityGens(cityId).find((x) => x.uid === b.dataset.envoy);
        if (!g || (actor && g.uid === actor.uid)) return;
        m.close();
        openTavern(cityId, g);
      };
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
          if (actor) { consumeDispatch(cityId, actor); }
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
        if (actor) { consumeDispatch(cityId, actor); SK.gainExp(actor, 18); }
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

  /* ══════════════════════════════════════════════════════════════
     v5.10 — 주점 배속의 실제 효과 (달이 바뀔 때 한 번)
     ① 이 성·이웃 성에 재야 인재가 있으면 반값(50%) 등용 협상 자동 시도
     ② 재야 인재가 없으면 주점 소문 덕에 보너스(+주점 Lv×10%)를 받는 자동 탐색
     ══════════════════════════════════════════════════════════════ */
  function runTavernDuty(st) {
    const out = [];
    SK.CITY_LIST.forEach((c) => {
      const cs = st.cities[c.id];
      if (!cs || cs.owner !== PF() || !cs.slots) return;
      const sl = cs.slots.find((x) => x.key === 'tavern' && x.uid);
      if (!sl) return;
      const g = st.heroes.find((h) => h.uid === sl.uid && h.city === c.id);
      if (!g) return;
      const lv = Math.max(1, Number(sl.lv) || 1);
      const pool = tavernPool(c.id).filter((p) => p && p.g
        && !lordRival(p.g.name)
        && !(st.recruitFail && st.recruitFail[p.g.id] === st.turn));
      if (pool.length) {
        const p = pool[0];
        const half = Math.max(100, Math.round(talentCost(c.id, p.g, g) * 0.5 / 10) * 10);
        const rate = clamp(recruitChance(c.id, p.g, g) + 6 + lv * 2, 5, 92);
        if (cityGens(c.id).length >= TALENT_LIMIT) {
          out.push({ city: c.name, kind: 'skip', text: `주점 — 장수 정원이 가득 차 ${p.g.name} 등용을 건넜습니다` });
          return;
        }
        if (st.gold < half) {
          out.push({ city: c.name, kind: 'skip', text: `주점 — ${p.g.name} 반값 등용에 금 ${fmt(half)} 필요 (금고 부족)` });
          return;
        }
        if (Math.random() * 100 < rate) {
          st.gold -= half;
          const hero = makeHero(p.g.name, c.id, 1);
          if (!hero) return;
          hero.actedThisMonth = true;
          st.heroes.push(hero);
          const src = st.cities[p.cityId] || {};
          src.talents = (src.talents || []).filter((id) => id !== p.g.id);
          SK.gainExp(g, 14, 6);
          out.push({ city: c.name, kind: 'recruit',
            text: `주점 소문 — ${josa(p.g.name, 'i')} 합류했습니다 · 금 −${fmt(half)} (반값)` });
        } else {
          st.recruitFail = st.recruitFail || {};
          st.recruitFail[p.g.id] = st.turn;
          SK.gainExp(g, 8, 2);
          out.push({ city: c.name, kind: 'refuse', text: `주점 — ${p.g.name} 반값 등용 실패 (${rate}%) · 금은 쓰지 않았습니다` });
        }
        return;
      }
      /* 재야 인재가 없으면 — 주점 소문 보너스가 붙은 자동 탐색 */
      const res = explore(c.id, g, { boost: lv * 0.1 });
      SK.gainExp(g, 18, 4);
      if (res && res.ok) {
        out.push({ city: c.name, kind: 'explore', text: `주점 — 자동 탐색: ${res.title}`, gain: res.gain });
      }
    });
    return out;
  }
  SK.runTavernDuty = runTavernDuty;

  /* ── 병영 — 징병 · 훈련 선택 ── */
  function openBarracksMenu(cityId) {
    const cs = SK.state.cities[cityId];
    const wound = Math.round(cs.wounded || 0);
    const cap = cityCap(cs);
    const room = Math.max(0, cap - Math.round(cs.troops || 0));
    const healCost = SK.healCostOf(Math.min(wound, room));
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 병영`,
      title: '군사를 일으킨다',
      body: `<div class="menu-list">
        <button data-b="recruit">징병 — 금 150 · 군량 120 · 병력 1,200+ (통솔·매력 보정)</button>
        <button data-b="train">훈련 — 금 80 · 병사 훈련도 +7~11 · 장수 경험치</button>
        ${wound ? `<button data-b="heal">부상병 치료 — ${fmt(wound)}명 회복중 · 금 ${fmt(healCost)}</button>` : ''}
      </div>
      ${wound ? `<p class="talent-note">부상병은 달이 바뀌면 35%(최소 200명)씩 저절로 돌아옵니다. 지금 금을 내면 한 번에 치료합니다.</p>` : ''}`,
      actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('[data-b]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.b;
        m.close();
        if (k === 'heal') { SK.openHealWounded(cityId); return; }
        doCommand(k);
      };
    });
  }
  SK.openBarracksMenu = openBarracksMenu;

  /* ── 관아 — 민심 · 태수/군사 임명 · 자동 내정 · 위임 · 포상 · 세율 · 군량 상인 ── */
  /* v5.14 — 테스트·자동화에서 관아를 바로 열 수 있게 내보낸다 */
  function openOffice(cityId) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const gens = cityGens(cityId);
    const advisor = gens.find((g) => g.uid === cs.advisor) || null;
    const gov = gens.find((g) => g.uid === cs.governor) || null;
    const ready = gens.filter((g) => !g.actedThisMonth).length;
    const isCapital = cityId === s.playerCapital;
    const autoOn = cs.auto !== false;
    const pol = policyOf(cs);
    const supplyName = cs.supplyTo && s.cities[cs.supplyTo] && s.cities[cs.supplyTo].owner === PF()
      ? CITY[cs.supplyTo].name : '지정 안 됨';
    const tax = taxRateOf(s);
    const price = ricePrice(s);
    const lowLoyal = gens.filter((g) => loyalOf(g) < 40).length;
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 관아`,
      title: '성을 다스린다',
      body: `<div class="office-wrap">
        <div class="office-stats">
          <div><span>민심</span><b>${Math.round(cs.loyalty)}</b></div>
          <div><span>성벽</span><b>${Math.round(cs.def)}</b></div>
          <div><span>훈련도</span><b>${Math.round(cs.train == null ? 50 : cs.train)}</b></div>
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
        <div class="office-policy">
          <p>태수 위임 방침 — 달이 바뀔 때 이 순서로 내정합니다</p>
          <div class="op-grid">${POLICY_KEYS.map((k) => `<button class="op-btn ${pol === k ? 'on' : ''}" data-pol="${k}"><b>${POLICIES[k].name}</b><span>${POLICIES[k].short}</span></button>`).join('')}</div>
          <p class="op-note">${POLICIES[pol].desc}${pol === 'supply' ? ` · 보내는 곳 <b>${supplyName}</b>` : ''}${isCapital ? ' · 본성은 자동 내정을 하지 않지만 방침은 기억해 둡니다' : ''}</p>
          ${pol === 'supply' ? `<button class="grp-row" data-o="supplyTo" style="margin-top:4px"><div><b>수송 목적지 — ${supplyName}</b><span>남는 병력을 매달 이 성으로 보냅니다</span></div><span class="grp-go">▸</span></button>` : ''}
        </div>
        <button class="office-auto ${autoOn ? 'on' : ''}" data-o="auto">
          <b>자동 내정 ${autoOn ? '켜짐' : '꺼짐'}</b>
          <span>${isCapital ? '본성은 달이 바뀌어도 자동으로 내정하지 않습니다' : (gov ? `달이 바뀌면 ${josa(gov.name, 'i')} 남은 행동으로 내정합니다` : '태수를 앉히지 않으면 자동 내정하지 않습니다')}</span>
        </button>
        <div class="office-tax">
          <p class="op-note">세율 — 전 거점 공통 · 지금 ${tax.name}${helpDot('tax')}</p>
          <div class="tax-row">${Object.keys(TAX_RATES).map((k) => `<button data-tax="${k}" class="${(s.taxRate || 'normal') === k ? 'on' : ''}">${TAX_RATES[k].name}<small>${TAX_RATES[k].desc}</small></button>`).join('')}</div>
        </div>
        <p class="office-note">태수·군사는 언제든 바꿀 수 있고, 이 성의 내정은 언제나 직접 할 수 있습니다. 대기 장수에게 남은 내정을 한 번에 맡기려면 아래 [대기 장수 일괄 내정]을 쓰십시오.</p>
        <div class="menu-list">
          <button data-o="comfort">백성을 위로한다 — 금 100 · 대기 장수를 보낸다</button>
          <button data-o="appoint">관직 — 문관·무관 24단계 (출진 상한·내정·공방 보너스)</button>
          <button data-o="reward">포상 — 금·보물로 장수 충성 올리기${lowLoyal ? ` <em style="color:#a8443a;font-style:normal;font-weight:900">· 충성 낮은 장수 ${lowLoyal}명</em>` : ''}</button>
          <button data-o="prisoners">포로 — 설득·몸값 협상${(s.prisoners || []).length ? ` <em style="color:#a8443a;font-style:normal;font-weight:900">· ${s.prisoners.length}명 억류 중</em>` : ''}</button>
          <button data-o="rice">군량 상인 — 지금 금 100에 쌀 ${price} (사고팔기)</button>
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
          m.close();
          openComfort(cityId);
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
        } else if (k === 'reward') {
          m.close();
          openReward(cityId);
        } else if (k === 'appoint') {
          m.close();
          openAppoint(cityId);
        } else if (k === 'rice') {
          m.close();
          openRiceTrader(cityId);
        } else if (k === 'prisoners') {
          m.close();
          openPrison();
        } else if (k === 'supplyTo') {
          m.close();
          openSupplyPick(cityId);
        }
      };
    });
    /* 방침 5종 — 누르면 즉시 저장하고 관아를 다시 그린다 */
    m.el.querySelectorAll('[data-pol]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.pol;
        cs.policy = k;
        if (k === 'supply' && !(cs.supplyTo && s.cities[cs.supplyTo] && s.cities[cs.supplyTo].owner === PF())) {
          const alt = ownedCityList().find((c) => c.id !== cityId);
          cs.supplyTo = alt ? alt.id : null;
        }
        SK.save();
        m.close();
        openOffice(cityId);
        SK.toast(`${CITY[cityId].name} 위임 방침 — ${POLICIES[k].name}`);
      };
    });
    m.el.querySelectorAll('[data-tax]').forEach((b) => {
      b.onclick = () => {
        s.taxRate = b.dataset.tax;
        SK.save();
        m.close();
        openOffice(cityId);
        SK.toast(`세율을 ${SK.josa(TAX_RATES[s.taxRate].name, 'euro')} 바꿨습니다 — ${TAX_RATES[s.taxRate].desc}`);
      };
    });
  }

  /* v5.8 — 관직 서임. 군주 명성이 오르면 교위 → 중랑장 → 진동·진서장군 → 대장군까지 내린다 */
  function openAppoint(cityId) {
    const s = SK.state;
    const fame = s.fame || 0;
    const gens = s.heroes.slice().sort((a, b) => (SK.officeAdd(b) - SK.officeAdd(a)) || (b.tong - a.tong));
    const rows = gens.map((h) => {
      const off = SK.officeOf(h);
      const nx = SK.nextOfficeOf ? SK.nextOfficeOf(h) : null;
      const merit = SK.meritOf(h);
      const ready = nx && (s.fame || 0) >= nx.fame && merit >= nx.merit;
      return `<button class="ap-row ${h.appoint ? 'on' : ''} ${ready ? 'ready' : ''}" data-uid="${h.uid}">
        <img src="${SK.ptSrc(h.portrait)}" alt="">
        <div><b>${h.name}</b><span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv} · 충성 ${loyalOf(h)} · 봉급 ${fmt(heroSalary(h))}</span>
          <em class="ap-merit">공훈 ${fmt(merit)}${nx ? ` · ${nx.name} ${fmt(nx.merit)}` : ' · 최고'}</em></div>
        <em class="ap-office">${off.key === 'none' ? '관직 없음' : off.name}</em>
        <span class="ap-cap">출진 상한 <b>${fmt(SK.troopCapOf(h))}</b></span>
      </button>`;
    }).join('');
    const m = SK.modal({
      kicker: '관직 · 명성 ' + fmt(fame), title: '누구에게 관직을 내릴까',
      body: `<p class="talent-note">관직을 내리면 그 장수의 공격·방어 보정과 충성이 오르고, 봉급이 조금 늘어 달마다 금이 더 나갑니다. 문관 자리는 내정(정치)·책략(지력)에 보탬이 됩니다. 출진 병력 상한은 일반 5,000 · 군주 10,000으로 고정입니다.<br><b>이제는 군주 명성과 장수 개인의 공훈치를 함께</b> 채워야 서임할 수 있습니다 — 건물 담당·탐색·등용·계략·전투로 쌓입니다.</p>
        <div class="ap-list">${rows || '<p class="rs-empty">휘하에 장수가 없습니다.</p>'}</div>`,
      wide: true, actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('.ap-row').forEach((b) => {
      b.onclick = () => { m.close(); setTimeout(() => openAppointPick(cityId, b.dataset.uid), 30); };
    });
  }
  function openAppointPick(cityId, uid) {
    const s = SK.state;
    const h = s.heroes.find((x) => x.uid === uid);
    if (!h) return;
    const cur = h.appoint || 'none';
    const merit = SK.meritOf(h);
    const rows = SK.OFFICES.map((o) => {
      const fameOk = (s.fame || 0) >= o.fame;
      const meritOk = merit >= (o.merit || 0);
      const locked = !fameOk || !meritOk;
      const on = cur === o.key;
      const cap = o.key === 'none' ? 5000 : 5000 + o.add;
      const why = !fameOk ? `명성 ${fmt(o.fame)} 필요` : !meritOk ? `공훈 ${fmt(o.merit)} 필요 (지금 ${fmt(merit)})` : '서임 가능';
      const branch = o.branch === 'civ' ? '문관' : o.branch === 'mil' ? '무관' : '';
      const bonus = o.branch === 'civ' ? `· 내정 +${o.pol || 0} · 책략 +${o.intel || 0} ` : o.branch === 'mil' ? `· 공격 +${o.atk || 0}% · 방어 +${o.def || 0}% ` : '';
      return `<button class="ap-pick branch-${o.branch || 'none'} ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-k="${o.key}" ${locked ? 'disabled' : ''}>
        <b>${branch ? `<i class="ap-branch">${branch}</i> ` : ''}${o.name}${on ? ' · 현재' : ''}</b>
        <span>${o.fame ? `명성 ${fmt(o.fame)} · 공훈 ${fmt(o.merit || 0)}` : '처음 상태'}</span>
        <em>${why} · ${bonus}· 봉급 +${o.salary} · 충성 +${o.loyal}</em>
      </button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${h.name} · 명성 ${fmt(s.fame || 0)} · 공훈 ${fmt(merit)}`, title: '어떤 관직을 내릴까',
      body: `<div class="ap-picks">${rows}</div>
        <p class="talent-note">관직은 언제든 바꿀 수 있습니다. 높은 관직은 군주의 명성과 그 장수의 공훈치가 모두 그만큼 높아야 내릴 수 있습니다 — 공훈은 건물 담당·탐색·등용·계략·전투로 쌓입니다.</p>`,
      wide: true, actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('[data-k]:not([disabled])').forEach((b) => {
      b.onclick = () => {
        const o = SK.OFFICE_BY_KEY[b.dataset.k];
        if (!o) return;
        h.appoint = o.key === 'none' ? null : o.key;
        if (o.loyal) h.loyal = Math.min(100, loyalOf(h) + o.loyal);
        SK.save(); SK.refreshHud(); m.close();
        SK.sfx.play('ui');
        SK.toast(`${h.name} — ${o.name}${o.add ? ` · 출진 상한 ${fmt(SK.troopCapOf(h))}` : ''}`);
        openAppoint(cityId);
      };
    });
  }

  SK.openAppoint = openAppoint;
  SK.openAppointPick = openAppointPick;

  /* 수송 중시 방침의 목적지 — 본성이나 전방 성을 고른다 */
  function openSupplyPick(cityId) {
    const s = SK.state;
    const list = ownedCityList().filter((c) => c.id !== cityId);
    if (!list.length) { SK.toast('보낼 다른 성이 없습니다.'); return; }
    const rows = list.map((c) => {
      const cs = s.cities[c.id];
      return `<button class="city-pick-row ${s.cities[cityId].supplyTo === c.id ? 'on' : ''}" data-c="${c.id}">
        <span class="cp-lv" style="background:${SK.factionColor(PF())}">${cityLevel(cs)}</span>
        <span class="cp-main"><b>${c.name}${c.id === s.playerCapital ? ' <em style="font-style:normal;font-size:8.5px;color:#8a5f2a">본성</em>' : ''}</b>
          <span>병력 ${fmt(cs.troops)} / ${fmt(cityCap(cs))} · 성벽 ${Math.round(cs.def)}</span></span>
        <span class="tc-go">▸</span>
      </button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 수송`, title: '병력을 보낼 성',
      body: `<p class="talent-note">달이 바뀔 때 이 성의 병력이 상한의 45% 아래로는 가지 않게 남기고, 남는 병력을 고른 성으로 보냅니다.</p><div class="city-pick">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.city-pick-row').forEach((b) => {
      b.onclick = () => {
        s.cities[cityId].supplyTo = b.dataset.c;
        SK.save();
        m.close();
        openOffice(cityId);
        SK.toast(`수송 목적지 — ${CITY[b.dataset.c].name}`);
      };
    });
  }

  /* ── 포상 — 금·보물로 장수 충성(loyal)을 올린다 ── */
  function openReward(cityId) {
    SK.setPurse(cityId);
    const s = SK.state;
    const gens = cityGens(cityId).slice().sort((a, b) => loyalOf(a) - loyalOf(b));
    if (!gens.length) { SK.toast('이 성에 포상할 장수가 없습니다.'); return; }
    const inv = (s.treasures || []).map((id) => SK.TREASURE_BY_ID[id]).filter(Boolean);
    const rows = gens.map((h) => {
      const l = loyalOf(h);
      const chip = l >= 70 ? '' : l >= 40 ? 'mid' : 'low';
      const gain = loyalGain(l);
      return `<div class="reward-row">
        <img src="${SK.ptSrc(h.portrait)}" alt="">
        <div class="rw-main"><b>${h.name} <em class="loyal-chip ${chip}">충성 ${l}</em></b>
          <span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv}</span>
          <em class="rw-note ${chip}">${l < 40 ? '마음이 흔들림 · 이간에 약함' : l < 70 ? '아직 마음이 반즐' : '충심이 굳음'}</em></div>
        <button data-gold="${h.uid}" ${s.gold < 100 || l >= 100 ? 'disabled' : ''}>금 100 +${gain}</button>
        <button class="gift" data-gift="${h.uid}" ${inv.length && l < 100 ? '' : 'disabled'}>보물 +15</button>
      </div>`;
    }).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 관아`, title: '포상',
      body: `<p class="talent-note">금이나 보물을 내려 장수의 충성을 올립니다. 충성이 100이면 더 오르지 않고, 충성이 70 아래인 장수는 전투에서 힘을 덜 씁니다(40 아래는 큰 폭). 금고 ${fmt(s.gold)} · 보관 보물 ${inv.length}점</p>
        <div class="reward-list">${rows}</div>`,
      wide: true, actions: [{ label: '닫기' }],
    });
    const pay = (uid, kind) => {
      const h = s.heroes.find((x) => x.uid === uid);
      if (!h) return;
      if (kind === 'gold') {
        if (s.gold < 100) { SK.toast('금이 부족합니다. (필요 금 100)'); return; }
        const gain = loyalGain(loyalOf(h));
        s.gold -= 100;
        h.loyal = clamp(loyalOf(h) + gain, 0, 100);
        SK.save(); SK.refreshHud(); m.close();
        SK.sfx.play('coin');
        openReward(cityId);
        SK.toast(`${h.name}에게 금 100을 내렸습니다 — 충성 +${gain} (${h.loyal})`);
        return;
      }
      m.close();
      openTreasureGift(cityId, uid);
    };
    m.el.querySelectorAll('[data-gold]').forEach((b) => { b.onclick = () => pay(b.dataset.gold, 'gold'); });
    m.el.querySelectorAll('[data-gift]').forEach((b) => { b.onclick = () => pay(b.dataset.gift, 'treasure'); });
  }
  SK.openReward = openReward;

  function openTreasureGift(cityId, uid) {
    const s = SK.state;
    const h = s.heroes.find((x) => x.uid === uid);
    if (!h) return;
    const inv = (s.treasures || []).map((id) => SK.TREASURE_BY_ID[id]).filter(Boolean);
    if (!inv.length) { SK.toast('보관 중인 보물이 없습니다.'); openReward(cityId); return; }
    const rows = inv.map((t) => `<button class="target-card" data-t="${t.id}">
      <span class="tc-flag" style="background:${SK.GRADE_COLOR[t.grade] || '#8a6a2a'}">${t.name.charAt(0)}</span>
      <div class="tc-main"><b>${t.name}</b><span>${t.grade} · ${t.type} · ${t.effect || ''}</span></div>
      <span class="tc-go">▸</span></button>`).join('');
    const m = SK.modal({
      kicker: `${h.name} — 포상`, title: '어떤 보물을 내릴까',
      body: `<p class="talent-note">보물을 내리면 충성 +15. 그 자리에 이미 장비가 있으면 보관함으로 돌아옵니다.</p><div class="target-list">${rows}</div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        const t = SK.TREASURE_BY_ID[b.dataset.t];
        if (!t) return;
        const slot = SK.treasureSlot(t);
        h.equip = h.equip || {};
        const prev = h.equip[slot];
        h.equip[slot] = t.id;
        s.treasures = (s.treasures || []).filter((id) => id !== t.id);
        if (prev) s.treasures.push(prev);
        h.loyal = clamp(loyalOf(h) + 15, 0, 100);
        SK.save(); SK.refreshHud(); m.close();
        SK.sfx.play('levelup');
        openReward(cityId);
        SK.toast(`${h.name}에게 ${SK.josa(t.name, 'eul')} 내렸습니다 — 충성 +15 (${h.loyal})`);
      };
    });
  }

  /* ── 군량 상인 — 이번 달 시세로 쌀을 사고팔는다 ── */
  function openRiceTrader(cityId) {
    SK.setPurse(cityId);
    const s = SK.state;
    const csG = s.cities[cityId];
    const gmLeft = Number(csG.grandMerchant) || 0;
    const gmMul = gmLeft > 0 ? 1.18 : 1;
    const gmPrice = (t) => ({ '전설': 2600, '영웅': 1600, '희귀': 900 }[t.grade] || 1200);
    let mode = 'buy';
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 저잣거리`, title: gmLeft > 0 ? '군량 상인 · 대상인' : '군량 상인',
      body: '<div id="rice-body"></div>', wide: true, actions: [{ label: '닫기' }],
    });
    const render = () => {
      const price = Math.round(ricePrice(s) * (Number(csG.grandMerchant) > 0 ? 1.18 : 1));
      const box = m.el.querySelector('#rice-body');
      if (!box) return;
      const steps = [100, 500, 1000];
      const gm = Number(csG.grandMerchant) || 0;
      const stock = (csG.gmStock || []).map((id) => SK.TREASURE_BY_ID[id]).filter(Boolean);
      box.innerHTML = `${gm > 0 ? `<div class="gm-banner"><b>대상인 체류 중 (남은 ${gm}개월)</b>
          <span>먼 길을 걸어온 상인입니다 — 군량 특가 +18% · 희귀 보물 판매. 기간이 지나면 별을 떠납니다.</span></div>` : ''}
        <div class="rice-quote">
          <div class="rq-main"><b>금 100 → 쌀 ${price}</b><span>${SK.dateLabel(s.eraYear || (195 + s.year), s.month)} 시세${riceCheap(s) ? ' · 수확철이라 쌀이 쌈' : ' · 품귀라 쌀이 비쌈'}</span></div>
          <div class="rq-side"><span>금고 <b>${fmt(s.gold)}</b></span><span>창고 <b>${fmt(s.food)}</b></span></div>
        </div>
        <div class="rice-modes">
          <button data-m="buy" class="${mode === 'buy' ? 'on' : ''}">사기</button>
          <button data-m="sell" class="${mode === 'sell' ? 'on' : ''}">팔기</button>
        </div>
        <div class="rice-btns">${steps.map((v) => {
          const qty = Math.round(price * v / 100);
          const dis = mode === 'buy' ? s.gold < v : s.food < qty;
          return `<button class="${mode === 'sell' ? 'sell' : ''}" data-v="${v}" ${dis ? 'disabled' : ''}>
            ${mode === 'buy' ? '금 ' + fmt(v) : '쌀 ' + fmt(qty)}<small>${mode === 'buy' ? '→ 쌀 ' + fmt(qty) : '→ 금 ' + fmt(v)}</small></button>`;
        }).join('')}</div>
        <p class="talent-note">
          ${mode === 'buy' ? '금으로 군량을 삽니다 — 10월 수확 뒤(10~11월)가 가장 쌈니다.' : '군량을 팔아 금으로 바꿉니다 — 쌀이 귀한 봄(3~5월)에 팔면 이득입니다.'}
          시세는 매달 바뀌고, 금 100당 쌀 80~160 사이를 오갑니다.${gm > 0 ? ' 지금은 대상인 특가로 쌀을 18% 더 받습니다.' : ''}
        </p>
        ${stock.length ? `<div class="gm-shop"><p class="gm-shop-title">대상인의 보물 상자 — 금으로 삽니다</p>
          ${stock.map((t) => `<button class="gm-item" data-tr="${t.id}" ${s.gold < gmPrice(t) ? 'disabled' : ''}>
            <span class="gmi-g" style="--gc:${SK.GRADE_COLOR[t.grade]}">${t.grade}</span>
            <div><b>${t.name}</b><span>${t.effect}</span></div>
            <em>금 ${fmt(gmPrice(t))}</em></button>`).join('')}
        </div>` : ''}`;
      box.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { mode = b.dataset.m; render(); }; });
      box.querySelectorAll('[data-v]').forEach((b) => {
        b.onclick = () => {
          const v = Number(b.dataset.v);
          const p = Math.round(ricePrice(s) * gmMul);
          const qty = Math.round(p * v / 100);
          if (mode === 'buy') {
            if (s.gold < v) { SK.toast('금이 부족합니다.'); return; }
            s.gold -= v; s.food += qty;
            SK.sfx.play('coin');
            SK.toast(`쌀 ${fmt(qty)} 사들였습니다 — 금 −${fmt(v)}`);
          } else {
            if (s.food < qty) { SK.toast('창고의 군량이 부족합니다.'); return; }
            s.food -= qty; s.gold += v;
            SK.sfx.play('coin');
            SK.toast(`쌀 ${fmt(qty)} 판매 — 금 +${fmt(v)}`);
          }
          SK.save(); SK.refreshHud();
          if (document.querySelector('#screen-city.active')) {
            const g = document.getElementById('city-gold'), f = document.getElementById('city-food');
            if (g) g.textContent = fmt(s.gold);
            if (f) f.textContent = fmt(s.food);
          }
          render();
        };
      });
      /* v5.12 — 대상인의 보물 판매 */
      box.querySelectorAll('.gm-item[data-tr]').forEach((btn) => {
        btn.onclick = () => {
          const t = SK.TREASURE_BY_ID[Number(btn.dataset.tr)];
          if (!t) return;
          const cost = gmPrice(t);
          if (s.gold < cost) { SK.toast('금이 부족합니다.'); return; }
          s.gold -= cost;
          s.treasures = s.treasures || [];
          s.treasures.push(t.id);
          csG.gmStock = (csG.gmStock || []).filter((id) => Number(id) !== Number(t.id));
          SK.save(); SK.refreshHud();
          SK.sfx.play('coin');
          SK.toast(`${t.name}${josa(t.name, 'eul')} 샀습니다 — 금 −${fmt(cost)}`);
          render();
        };
      });
    };
    render();
  }
  SK.openRiceTrader = openRiceTrader;

  /* ══════════════════════════════════════════════════════════════
     v5.11 — 포로 억류 · 설득 · 몸값 협상
     · 가둔 지 2개월까지 탈출 불가 → 3개월째부터 매달 기본 10% 탈출
     · 성의 순찰소 Lv·치안이 높으면 2~3%대까지 억제
     · 매달 충성 −4~6, 가둔 쪽은 매달 설득(등용) 시도 가능
     · 상대 세력이 등급에 맞춰 금·군량·보물 몸값을 제안
     ══════════════════════════════════════════════════════════════ */
  function patrolLvOf(cs) {
    const sl = ((cs && cs.slots) || []).find((x) => x.key === 'patrol');
    return sl ? (sl.lv || 1) : 0;
  }
  function prisonEscapeChance(rec, cs) {
    if (!cs || rec.months < 3) return 0;
    const lv = patrolLvOf(cs);
    const order = Math.max(0, Math.min(100, cs.order == null ? 55 : cs.order));
    return clamp(0.10 - lv * 0.015 - (order / 100) * 0.03, 0.02, 0.10);
  }
  SK.prisonEscapeChance = prisonEscapeChance;


  /* v5.17 — 포로를 잡았던 세력(rec.by)이 아직 살아 있는가, 그 세력의 이름은 무엇인가 */
  function offerFactionAlive(rec, g) {
    const s = SK.state || {};
    const id = rec && rec.by ? rec.by : '';
    if (!id || id === '재야' || id === 'neutral') return false;
    const f = (s.factions || {})[id];
    if (!f) return false;
    const owns = SK.CITY_LIST.some((c) => s.cities && s.cities[c.id] && s.cities[c.id].owner === id);
    /* v5.28 — 성이 하나도 없는 세력은 이미 멸망한 것으로 본다 */
    if (!owns) return false;
    return true;
  }
  function offerFromOf(rec, g) {
    const s = SK.state || {};
    const id = rec && rec.by ? rec.by : '';
    const f = id ? (s.factions || {})[id] : null;
    if (f && f.name) return f.name;
    if (f && f.lord) return `${f.lord}군`;
    return '적 세력';
  }

  function prisonTick(s) {
    s.prisoners = s.prisoners || [];
    const news = [];
    const rank = { S: 900, A: 650, B: 450, C: 300 };
    s.prisoners = s.prisoners.filter((rec) => {
      if (!rec || !SK.GEN_BY_ID[rec.gid]) return false;
      rec.months = (rec.months || 0) + 1;
      rec.recruitTried = false;
      const drop = 4 + Math.floor(Math.random() * 3);
      rec.loyal = clamp((rec.loyal == null ? 70 : rec.loyal) - drop, 0, 100);
      /* v5.17 — 잡았던 세력이 사라졌으면 몸값 제안도 끝난다 (한 번만 알린다) */
      if (!offerFactionAlive(rec, SK.GEN_BY_ID[rec.gid])) {
        if (!rec.orphan) {
          rec.orphan = true;
          news.push({ kind: 'orphan', text: `${josa(rec.name, 'eul')} 잡았던 세력이 사라져 몸값 제안이 끊겼습니다 — 이제는 [설득]과 [석방]뿐입니다.` });
        }
        rec.offer = null;
      }
      /* 몸값 제안 — 가둔 지 한 달이 지나면 원 소속 세력이 협상해 온다 */
      if (!rec.orphan && !rec.offer && rec.months >= 1 && Math.random() < 0.35) {
        const g = SK.GEN_BY_ID[rec.gid];
        const base = rank[rec.tier] || 350;
        const vm = 0.8 + Math.random() * 0.5;
        const offer = { gold: Math.round(base * vm), food: Math.round(base * vm * 0.8), expires: 2, treasure: null, type: 'ransom' };
        if ((rec.tier === 'S' || rec.tier === 'A') && Math.random() < 0.22 && SK.TREASURES && SK.TREASURES.length) {
          const t = SK.TREASURES[Math.floor(Math.random() * SK.TREASURES.length)];
          offer.treasure = { id: t.id, name: t.name };
        }
        /* 적이 사로잡은 아군이 있으면 '포로 교환'을 제안해 온다
           v5.29 — 제안자는 포로의 원 소속 세력(rec.by)이므로, 그 세력이 사로잡고 있는
           아군이어야 맞바꿀 수 있다. 예전에는 s.captured[0]를 무조건 골라
           다른 세력에 잡힌 아군을 교환 조건으로 내세우는 일이 있었다. */
        const captorId = rec.by || '';
        const hold = (s.captured || []).find((x) => x && x.uid && (!captorId || x.by === captorId));
        if (hold && Math.random() < 0.45) {
          offer.type = 'exchange';
          offer.exchangeUid = hold.uid;
          offer.exchangeName = hold.name;
          offer.exchangeBy = hold.by;
        }
        /* v5.17 — 제안자는 포로의 "원 소속 세력". 그 세력이 멸망했으면 제안이 끊긴다. */
        offer.from = offerFromOf(rec, g);
        rec.offer = offer;
        news.push({ kind: 'offer', text: offer.type === 'exchange'
          ? `${offer.from}의 포로 교환 제안 — ${josa(g.name, 'gwa')} 사로잡힌 ${josa(hold.name, 'eul')} 맞바꾸자고 합니다.`
          : `${offer.from}의 포로 몸값 제안 — ${g.name}의 몸값으로 금 ${fmt(offer.gold)}${offer.food ? ` · 군량 ${fmt(offer.food)}` : ''}${offer.treasure ? ` · 보물 ${offer.treasure.name}` : ''}을 제안했습니다.` });
      } else if (rec.offer) {
        rec.offer.expires = (rec.offer.expires || 1) - 1;
        if (rec.offer.expires <= 0) { rec.offer = null; news.push({ kind: 'expire', text: `${rec.name}의 몸값 협상이 결렬되었습니다.` }); }
      }
      /* 탈출 판정 */
      const cs = s.cities[rec.city];
      const ch = prisonEscapeChance(rec, cs);
      if (ch > 0 && Math.random() < ch) {
        news.push({ kind: 'escape', text: `${josa(rec.name, 'i')} ${cs ? CITY[rec.city].name : '성'}에서 탈출했습니다.${lvLabel(cs)}` });
        return false;
      }
      return true;
    });
    return news;
  }
  SK.prisonTick = prisonTick;
  function lvLabel(cs) {
    const lv = patrolLvOf(cs);
    return lv ? ` (순찰소 Lv.${lv})` : ' (순찰소 없음)';
  }

  function openPrison() {
    const s = SK.state;
    s.prisoners = s.prisoners || [];
    const lordName = ((s.factions || {})[s.playerFaction] || {}).lord || '';
    const lordG = lordName ? SK.GEN_BY_NAME[lordName] : null;
    const cha = (lordG && lordG.charm) || 62;
    const rows = s.prisoners.map((rec, i) => {
      const g = SK.GEN_BY_ID[rec.gid];
      if (!g) return '';
      const cs = s.cities[rec.city];
      const chance = prisonEscapeChance(rec, cs);
      const hireP = clamp(0.35 + (cha - 60) * 0.006 - (rec.loyal || 70) * 0.003, 0.05, 0.8);
      /* v5.28 — 제안한 세력이 이미 멸망했으면 그 자리에서 취소한다 (유령 세력 이름 방지) */
      let offer = rec.offer;
      if (offer && !offerFactionAlive(rec, g)) { offer = null; rec.offer = null; SK.save(); }
      return `<div class="prison-row">
        <img class="pr-pt" src="${SK.ptSrc(SK.genPortrait(g))}" alt="">
        <div class="pr-main">
          <b>${g.name} <i class="pr-tier t${rec.tier}">${rec.tier}</i></b>
          <span>${CITY[rec.city] ? CITY[rec.city].name : '성'} 억류 ${rec.months}개월 · 충성 ${rec.loyal} · 등용 성공 ${Math.round(hireP * 100)}%</span>
          <em class="pr-esc ${chance > 0.06 ? 'hot' : ''}">${rec.months < 3 ? `탈출 불가 — ${3 - rec.months}개월 남음` : `이번 달 탈출 ${Math.round(chance * 100)}%${lvLabel(cs)}`}</em>
          ${offer ? `<div class="pr-offer"><span>${offer.from}의 ${offer.type === 'exchange' ? '포로 교환' : '포로 몸값'} 제안</span><b>${offer.type === 'exchange' ? `${g.name} ↔ ${offer.exchangeName}` : `금 ${fmt(offer.gold)}${offer.food ? ` · 군량 ${fmt(offer.food)}` : ''}${offer.treasure ? ` · ${offer.treasure.name}` : ''}`}</b><small>${offer.expires}개월 뒤 철회</small>
            <div class="pr-offer-btns"><button data-accept="${i}">수락</button><button data-refuse="${i}">거절</button></div></div>` : ''}
        </div>
        <div class="pr-btns">
          <button class="pr-hire" data-hire="${i}" ${rec.recruitTried ? 'disabled' : ''}>${rec.recruitTried ? '이번 달 시도함' : '설득'}</button>
          <button class="pr-free" data-free="${i}">석방</button>
        </div>
      </div>`;
    }).join('');
    const m = SK.modal({
      kicker: `포로 관리 · ${s.prisoners.length}명`, title: '포로를 어떻게 할까', wide: true,
      body: `<p class="talent-note">억류한 포로는 <b>가둔 지 2개월까지는 탈출하지 못하고</b>, 3개월째부터 매달 기본 10%로 탈출합니다. 성의 <b>순찰소 Lv·치안</b>이 높으면 2~3%까지 떨어집니다. 매달 충성이 4~6씩 내려가고, 달마다 [설득]으로 등용을 시도할 수 있습니다. 상대 세력이 몸값을 제안하면 금·군량·보물을 받고 풀어 줄 수 있습니다.</p>
        ${(s.captured || []).length ? `<div class="cap-box"><p class="talent-note cap-head"><b>적에게 사로잡힌 아군 ${s.captured.length}명</b> — 그 세력이 낸 포로 교환 제안에 응하면 돌아옵니다.</p>
          <div class="cap-list">${s.captured.map((c) => `<span class="cap-row"><b>${c.name}</b><em>${SK.factionName(c.by) || '알 수 없는 세력'}에 억류</em></span>`).join('')}</div></div>` : ''}
        <div class="prison-list">${rows || '<p class="tr-empty">포로가 없습니다. 전투에서 이기면 적 장수를 억류할 수 있습니다.</p>'}</div>`,
      actions: [{ label: '닫기' }],
    });
    const refresh = () => { m.close(); setTimeout(openPrison, 40); };
    m.el.querySelectorAll('[data-hire]').forEach((b) => {
      b.onclick = () => {
        const rec = s.prisoners[Number(b.dataset.hire)];
        if (!rec || rec.recruitTried) return;
        rec.recruitTried = true;
        const g = SK.GEN_BY_ID[rec.gid];
        const p = clamp(0.35 + (cha - 60) * 0.006 - (rec.loyal || 70) * 0.003, 0.05, 0.8);
        if (Math.random() < p) {
          const hero = SK.makeHero(g.name, rec.city, SK.genLv(g));
          if (hero) { hero.loyal = 55; s.heroes.push(hero); s.fame += 2; }
          s.prisoners = s.prisoners.filter((x) => x !== rec);
          SK.sfx.play('ui'); SK.toast(`${g.name} — 설득 성공! 충성 55로 합류했습니다.`);
        } else {
          rec.loyal = clamp((rec.loyal || 70) + 2, 0, 100);
          SK.sfx.play('deny'); SK.toast(`${g.name} — “아직은 아닙니다.” 설득 실패.`);
        }
        SK.save(); refresh();
      };
    });
    m.el.querySelectorAll('[data-free]').forEach((b) => {
      b.onclick = () => {
        const rec = s.prisoners[Number(b.dataset.free)];
        if (!rec) return;
        s.prisoners = s.prisoners.filter((x) => x !== rec);
        s.fame += 1; SK.save(); SK.toast(`${josa(rec.name, 'eul')} 풀어 주었습니다. 명성 +1`); refresh();
      };
    });
    m.el.querySelectorAll('[data-accept]').forEach((b) => {
      b.onclick = () => {
        const rec = s.prisoners[Number(b.dataset.accept)];
        if (!rec || !rec.offer) return;
        const offer = rec.offer;
        /* v5.28 — 제안한 세력이 그사이 멸망했으면 수락하지 않는다 */
        if (!offerFactionAlive(rec, SK.GEN_BY_ID[rec.gid])) {
          rec.offer = null; rec.orphan = true; SK.save();
          SK.toast('제안한 세력이 이미 사라졌습니다 — 몸값 협상이 취소되었습니다.');
          refresh();
          return;
        }
        if (offer.type === 'exchange') {
          const h = s.heroes.find((x) => x.uid === offer.exchangeUid);
          /* v5.26 — 교환할 아군이 이미 돌아오거나 사라졌으면 포로만 놓아주지 않는다 */
          if (!h || !(s.captured || []).some((x) => x.uid === offer.exchangeUid)) {
            rec.offer = null; SK.save();
            SK.toast('교환할 아군이 이미 없습니다 — 제안이 취소되었습니다.');
            refresh();
            return;
          }
          /* v5.29 — 제안한 세력이 그 아군을 아직 붙잡고 있는지 다시 본다 */
          const capRec = (s.captured || []).find((x) => x.uid === offer.exchangeUid);
          if (capRec && offer.exchangeBy && capRec.by !== offer.exchangeBy) {
            rec.offer = null; SK.save();
            SK.toast('그 아군은 다른 세력이 데려갔습니다 — 교환이 성립하지 않습니다.');
            refresh();
            return;
          }
          h.captured = false; h.city = rec.city; h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.5));
          s.captured = (s.captured || []).filter((x) => x.uid !== offer.exchangeUid);
          s.prisoners = s.prisoners.filter((x) => x !== rec);
          s.fame += 2; SK.save(); SK.sfx.play('ui');
          SK.toast(`포로 교환 — ${josa(offer.exchangeName, 'i')} 돌아오고 ${josa(rec.name, 'eul')} 풀어 주었습니다.`);
          refresh();
          return;
        }
        const cs = s.cities[rec.city] || purseCs(s);
        if (cs) { cs.gold = (cs.gold || 0) + offer.gold; cs.food = (cs.food || 0) + offer.food; }
        if (offer.treasure && s.treasures) s.treasures.push(offer.treasure.id);
        s.prisoners = s.prisoners.filter((x) => x !== rec);
        s.fame += 2; SK.save(); SK.sfx.play('coin');
        SK.toast(`몸값을 받고 ${josa(rec.name, 'eul')} 풀어 주었습니다 — 금 +${fmt(offer.gold)} · 명성 +2`);
        refresh();
      };
    });
    m.el.querySelectorAll('[data-refuse]').forEach((b) => {
      b.onclick = () => {
        const rec = s.prisoners[Number(b.dataset.refuse)];
        if (!rec) return;
        rec.offer = null; SK.save(); SK.toast('몸값 제안을 거절했습니다.'); refresh();
      };
    });
  }
  SK.openPrison = openPrison;

  /* ══════════════════════════════════════════════════════════════
     v5.16 — 인물·보물 도감 (수집 체크리스트)
     · 인물 : SK.GENERALS 625명 중 내 장수·포로로 만났거나 전장·주점에서 조우한 사람
     · 보물 : SK.TREASURES 151종 중 보유·획득한 것
     · 누적 기록은 localStorage 'samgukji-jojo-codex'에 남아 다음 회차에도 이어진다
     ══════════════════════════════════════════════════════════════ */
  const CODEX_KEY = 'samgukji-jojo-codex';
  const GEN_FACS = ['전체', '위', '촉', '오', '군웅', '한국', '재야'];
  const TIERS = ['전체', 'S', 'A', 'B', 'C'];
  const TRE_TYPES = ['전체', '무기', '방어구', '명마', '병법서·보물'];
  const TRE_GRADES = ['전체', '전설', '영웅', '희귀'];
  const CDX_PAGE = 120;

  function codexRead() {
    try {
      const raw = localStorage.getItem(CODEX_KEY);
      const o = raw ? JSON.parse(raw) : null;
      if (!o || typeof o !== 'object') return { g: {}, t: {} };
      return { g: o.g || {}, t: o.t || {} };
    } catch (e) { return { g: {}, t: {} }; }
  }
  function codexWrite(store) {
    try { localStorage.setItem(CODEX_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }
  /* 지금 상태(내 장수·포로·보물·장비)를 누적 기록에 합치고 state.codex에도 비춘다 */
  function codexMerge() {
    const store = codexRead();
    const s = SK.state;
    if (s) {
      (s.heroes || []).forEach((h) => { if (h && h.genId != null) store.g[String(h.genId)] = 1; });
      (s.prisoners || []).forEach((r) => { if (r && r.gid != null) store.g[String(r.gid)] = 1; });
      const tids = [];
      (s.treasures || []).forEach((id) => tids.push(id));
      (s.heroes || []).forEach((h) => Object.keys(h.equip || {}).forEach((k) => tids.push(h.equip[k])));
      tids.forEach((num) => { if (num != null) store.t[String(num)] = 1; });
      s.codex = { g: store.g, t: store.t };
    }
    codexWrite(store);
    return store;
  }
  SK.codexMerge = codexMerge;
  SK.codexMeet = function (ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    const store = codexRead();
    let added = 0;
    list.forEach((id) => {
      if (id == null) return;
      const k = String(id);
      if (SK.GEN_BY_ID && !SK.GEN_BY_ID[id]) return;
      if (!store.g[k]) { store.g[k] = 1; added += 1; }
    });
    if (added) codexWrite(store);
    return added;
  };
  SK.codexTreasure = function (ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    const store = codexRead();
    let added = 0;
    list.forEach((id) => {
      if (id == null) return;
      const k = String(id);
      if (!store.t[k]) { store.t[k] = 1; added += 1; }
    });
    if (added) codexWrite(store);
    return added;
  };
  function codexStats() {
    const store = codexMerge();
    const gens = SK.GENERALS || [];
    const tres = SK.TREASURES || [];
    const gHave = gens.filter((g) => store.g[String(g.id)]).length;
    const tHave = tres.filter((t) => store.t[String(t.id)]).length;
    return { store, gens, tres, gHave, tHave,
      gPct: gens.length ? (gHave / gens.length) * 100 : 0,
      tPct: tres.length ? (tHave / tres.length) * 100 : 0 };
  }
  SK.codexStats = codexStats;

  function codexBar(label, have, total, pct) {
    return `<div class="cdx-prog">
      <div class="cdx-prog-top"><b>${label}</b><span><em>${fmt(have)}</em> / ${fmt(total)}종</span><strong>${pct.toFixed(1)}%</strong></div>
      <i class="cdx-bar"><s style="width:${Math.max(1.2, pct).toFixed(1)}%"></s></i>
    </div>`;
  }

  let cdx = { tab: 'gen', fac: '전체', tier: '전체', type: '전체', grade: '전체', limit: CDX_PAGE, q: '' };

  function codexGenCells(st) {
    const store = st.store;
    const q = (cdx.q || '').trim();
    let list = st.gens.filter((g) => {
      if (cdx.fac !== '전체' && String(g.faction || '재야') !== cdx.fac) return false;
      if (cdx.tier !== '전체' && String(g.tier) !== cdx.tier) return false;
      return true;
    });
    if (q) {
      const hit = (g) => store.g[String(g.id)] && String(g.name).indexOf(q) >= 0;
      list = list.filter(hit);
    }
    const order = { S: 0, A: 1, B: 2, C: 3 };
    /* v5.16 — 수집한 인물을 먼저 보여 준다 (모은 보람이 바로 보이게) */
    const gotOf = (g) => (store.g[String(g.id)] ? 0 : 1);
    list.sort((a, b) => (gotOf(a) - gotOf(b)) || ((order[a.tier] ?? 4) - (order[b.tier] ?? 4)) || String(a.name).localeCompare(String(b.name)));
    const shown = list.slice(0, cdx.limit);
    const cells = shown.map((g) => {
      const got = !!store.g[String(g.id)];
      const cls = SK.genClass(g);
      const cname = (SK.CLASSES[cls] && SK.CLASSES[cls].name) || g.job || '';
      return `<button class="cdx-cell ${got ? 'got' : ''} t${g.tier}" data-gid="${g.id}" ${got ? '' : 'disabled'}>
        <span class="cdx-face">${got ? `<img src="${SK.ptSrc(SK.genPortrait(g))}" alt="" loading="lazy">` : '<em>?</em>'}<i class="cdx-tier">${g.tier}</i></span>
        <b class="cdx-name">${got ? g.name : '？？？'}</b>
        <small>${got ? cname : String(g.faction || '재야')}</small>
      </button>`;
    }).join('');
    const more = list.length > shown.length
      ? `<button class="cdx-more" data-more="1">${fmt(list.length - shown.length)}명 더 보기</button>` : '';
    return `<div class="cdx-grid">${cells || '<p class="tr-empty">조건에 맞는 장수가 없습니다.</p>'}</div>${more}`;
  }

  function codexTreRows(st) {
    const store = st.store;
    let list = st.tres.filter((t) => {
      if (cdx.type !== '전체' && String(t.type) !== cdx.type) return false;
      if (cdx.grade !== '전체' && String(t.grade) !== cdx.grade) return false;
      return true;
    });
    const order = { '전설': 0, '영웅': 1, '희귀': 2 };
    const gotOf = (t) => (store.t[String(t.id)] ? 0 : 1);
    list = list.slice().sort((a, b) => (gotOf(a) - gotOf(b)) || ((order[a.grade] ?? 3) - (order[b.grade] ?? 3)) || String(a.name).localeCompare(String(b.name)));
    const shown = list.slice(0, cdx.limit);
    const rows = shown.map((t) => {
      const got = !!store.t[String(t.id)];
      /* v5.32 — 얻지 못한 보물도 획득 경로(dropHint)를 보여 준다. 예전에는 도감에
         이름·효과만 있고 '어디서 나오는지'가 어디에도 적히지 않았다. */
      const hint = t.dropHint ? `${got ? '획득' : '힌트'} — ${t.dropHint}` : '';
      return `<div class="cdx-row ${got ? 'got' : ''}" data-tid="${t.id}" role="button" tabindex="0" style="--gc:${SK.GRADE_COLOR[t.grade] || '#9a8a66'}">
        <span class="cdx-gd">${t.grade}</span>
        <div><b>${got ? t.name : '？？？'}</b><small>${t.type}${got ? ` · ${t.effect || ''}` : ' · 아직 얻지 못했습니다'}</small>${hint ? `<em class="cdx-hint">${hint}</em>` : ''}</div>
        <em class="cdx-check">${got ? '✓' : '—'}</em>
      </div>`;
    }).join('');
    const more = list.length > shown.length
      ? `<button class="cdx-more" data-more="1">${fmt(list.length - shown.length)}종 더 보기</button>` : '';
    return `<div class="cdx-list">${rows || '<p class="tr-empty">조건에 맞는 보물이 없습니다.</p>'}</div>${more}`;
  }

  function codexBody(st) {
    if (cdx.tab === 'tre') return codexTreRows(st);
    return codexGenCells(st);
  }
  function codexChips(list, cur, kind) {
    return list.map((v) => `<button class="cdx-chip ${v === cur ? 'on' : ''}" data-f="${kind}" data-v="${v}">${v}</button>`).join('');
  }
  function codexRefresh(m) {
    const st = codexStats();
    const body = m.el.querySelector('#cdx-body');
    const tabs = m.el.querySelector('.cdx-tabs');
    if (tabs) {
      tabs.innerHTML = `<button class="cdx-tab ${cdx.tab === 'gen' ? 'on' : ''}" data-ct="gen">인물 도감 <b>${st.gHave}/${st.gens.length}</b><em>${st.gPct.toFixed(1)}%</em></button>
        <button class="cdx-tab ${cdx.tab === 'tre' ? 'on' : ''}" data-ct="tre">보물 도감 <b>${st.tHave}/${st.tres.length}</b><em>${st.tPct.toFixed(1)}%</em></button>`;
      tabs.querySelectorAll('[data-ct]').forEach((b) => {
        b.onclick = () => { cdx.tab = b.dataset.ct; cdx.limit = CDX_PAGE; codexRefresh(m); };
      });
    }
    if (!body) return;
    if (cdx.tab === 'gen') {
      body.innerHTML = `${codexBar('인물 수집', st.gHave, st.gens.length, st.gPct)}
        <div class="cdx-filters"><div>${codexChips(GEN_FACS, cdx.fac, 'fac')}</div><div>${codexChips(TIERS, cdx.tier, 'tier')}</div></div>
        ${codexGenCells(st)}`;
    } else {
      body.innerHTML = `${codexBar('보물 수집', st.tHave, st.tres.length, st.tPct)}
        <div class="cdx-filters"><div>${codexChips(TRE_TYPES, cdx.type, 'type')}</div><div>${codexChips(TRE_GRADES, cdx.grade, 'grade')}</div></div>
        ${codexTreRows(st)}`;
    }
    body.querySelectorAll('[data-f]').forEach((b) => {
      b.onclick = () => { cdx[b.dataset.f] = b.dataset.v; cdx.limit = CDX_PAGE; codexRefresh(m); };
    });
    const more = body.querySelector('[data-more]');
    if (more) more.onclick = () => { cdx.limit += CDX_PAGE; codexRefresh(m); };
    body.querySelectorAll('[data-gid]').forEach((b) => {
      b.onclick = () => { if (!b.disabled) openCodexGen(Number(b.dataset.gid)); };
    });
    /* v5.32 — 보물 줄을 누르면 효과·획득 경로를 크게 본다 */
    body.querySelectorAll('[data-tid]').forEach((row) => {
      row.onclick = () => openCodexTre(Number(row.dataset.tid));
    });
  }

  function openCodexGen(gid) {
    const g = SK.GEN_BY_ID[gid];
    if (!g) return;
    const s = SK.state;
    const cls = SK.genClass(g);
    const cname = (SK.CLASSES[cls] && SK.CLASSES[cls].name) || g.job || '';
    const hero = (s && s.heroes || []).find((h) => h.genId === gid) || null;
    const mine = !!hero;
    const jailed = (s && s.prisoners || []).some((r) => r.gid === gid);
    const stat = (k, v) => `<span class="cdx-stat"><i>${k}</i><b>${v == null ? '-' : v}</b></span>`;
    /* v5.32 — 전원 열전: 이름 전용 대사가 없어도 병종·등급 대사로 697명 모두 한 줄이 남는다 */
    const gag = SK.gagOf ? SK.gagOf(g.name, cls, g.tier) : '';
    const year = (s && (s.eraYear || (195 + s.year))) || 190;
    const age = SK.ageOf ? SK.ageOf(g, year) : 0;
    const born = g.birthYear ? `${g.birthYear}년생${age ? ` · ${year}년 ${age}세` : ''}` : '';
    const debut = g.debutYear ? `${g.debutYear}년 등장` : '';
    const where = mine && hero.city && SK.CITY[hero.city] ? `${SK.CITY[hero.city].name} 주둔` : '';
    const meta = [born, debut, where].filter(Boolean).join(' · ');
    SK.modal({
      kicker: `인물 도감 · ${g.tier}급 ${cname}`,
      title: g.name,
      body: `<div class="cdx-detail">
        <img src="${SK.ptSrc(SK.genPortrait(g))}" alt="">
        <div class="cdx-detail-main">
          <p class="cdx-detail-tag">${String(g.faction || '재야')} · ${cname}${mine ? ' · <b>내 장수</b>' : jailed ? ' · <b>억류 중</b>' : ' · 조우 기록'}</p>
          <div class="cdx-stats">${stat('통솔', g.leadership)}${stat('무력', g.war)}${stat('지력', g.intel)}${stat('정치', g.politics)}${stat('매력', g.charm)}</div>
          <p class="cdx-detail-skill">${g.skill ? `고유특기 — <b>${g.skill}</b>` : '고유특기 없음'}</p>
          ${gag ? `<p class="cdx-detail-story">“${gag}”</p>` : ''}
          ${meta ? `<p class="cdx-detail-meta">${meta}</p>` : ''}
        </div>
      </div>`,
      actions: [{ label: '닫기', primary: true }],
    });
  }

  /* v5.32 — 보물 한 점 자세히: 효과 수치·장착 부위·획득 경로 */
  function openCodexTre(tid) {
    const t = SK.TREASURE_BY_ID[tid];
    if (!t) return;
    const s = SK.state;
    const got = !!codexRead().t[String(tid)];
    const slot = SK.SLOT_NAMES[SK.treasureSlot(t)] || '병법서';
    const statMap = [['war', '무력'], ['intel', '지력'], ['leadership', '통솔'], ['charm', '매력'], ['politics', '정치'], ['move', '이동'], ['rng', '사거리']];
    const st = SK.treasureStats(t);
    const statTxt = statMap.filter(([k]) => st[k]).map(([k, n]) => `${n} ${st[k] > 0 ? '+' : ''}${st[k]}`).join(' · ');
    const owners = ((s && s.heroes) || []).filter((h) => Object.values(h.equip || {}).includes(tid)).map((h) => h.name);
    const inStore = ((s && s.treasures) || []).includes(tid);
    const hold = owners.length ? `${owners.join(' · ')} 장착` : inStore ? '보물고에 보관 중' : (got ? '이전에 손에 넣었던 보물' : '아직 얻지 못했습니다');
    SK.modal({
      kicker: `보물 도감 · ${t.grade} ${slot}`,
      title: got ? t.name : '？？？',
      body: `<div class="cdx-tre">
        <div class="cdx-tre-top"><span class="cdx-gd" style="--gc:${SK.GRADE_COLOR[t.grade] || '#9a8a66'}">${t.grade}</span>
          <b>${t.type}</b><em>${hold}</em></div>
        <p class="cdx-tre-effect">${got ? (t.effect || '효과 없음') : '아직 얻지 못해 효과를 알 수 없습니다.'}</p>
        ${got && statTxt ? `<p class="cdx-tre-stat">능력치 ${statTxt}</p>` : ''}
        <p class="cdx-tre-hint"><b>획득 경로</b> ${t.dropHint || '어디서 나오는지 알려지지 않았습니다.'}</p>
      </div>`,
      actions: [{ label: '닫기', primary: true }],
    });
  }

  function openCodex(tab) {
    if (tab) cdx.tab = tab;
    cdx.limit = CDX_PAGE;
    const st = codexStats();
    const m = SK.modal({
      kicker: '도감', title: '수집 기록', wide: true,
      body: `<p class="talent-note">내 장수로 맞이했거나 전장·주점에서 마주친 인물, 그리고 손에 넣은 보물을 기록합니다. <b>기록은 다음 회차에도 이어집니다.</b></p>
        <div class="cdx-tabs"></div>
        <div class="cdx-body" id="cdx-body"></div>`,
      actions: [{ label: '닫기', primary: true }],
    });
    m.st = st;
    codexRefresh(m);
    return m;
  }
  SK.openCodex = openCodex;


  /* 태수 임명 — 정치·통솔이 높은 장수가 내정과 징병을 끌어올린다
     v5.14 — 건물 배속과 같이 적합도(정치 60% + 통솔 40%) 순으로 세우고 상위 2명에게 [추천] */
  function govScore(g) { return effStat(g, 'pol') * 0.6 + effStat(g, 'tong') * 0.4; }
  function openGovernorPick(cityId) {
    const cs = SK.state.cities[cityId];
    const lord = SK.factionInfo(PF()).lord;
    const all = cityGens(cityId);
    const lordHero = all.find((g) => g.name === lord) || null;
    const gens = lordHero ? [lordHero].concat(all.filter((g) => g.uid !== lordHero.uid)) : all;
    if (!gens.length) { SK.toast('이 성에 태수로 앉힐 장수가 없습니다.'); return; }
    const score = govScore;
    /* v5.14 — 군주가 앉은 성이라도 나머지는 적합도 순으로 (군주는 맨 위 고정) */
    const list = lordHero
      ? [lordHero].concat(gens.filter((g) => g.uid !== lordHero.uid).sort((a, b) => score(b) - score(a) || String(a.name).localeCompare(String(b.name))))
      : gens.slice().sort((a, b) => score(b) - score(a) || String(a.name).localeCompare(String(b.name)));
    const rows = list.map((g, i) => `<button class="target-card" data-uid="${g.uid}">
      <img class="tc-portrait" src="${SK.ptSrc(g.portrait)}" alt="">
      <div class="tc-main"><b>${g.name}${i < 2 ? ' <em class="duty-reco">추천</em>' : ''}${cs.governor === g.uid ? ' <em>태수</em>' : ''}${g.name === lord ? ' <em>군주</em>' : ''}</b>
        <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv} · 적합도 ${Math.round(score(g))}</span></div>
      <div class="tc-troops"><span>정치 ${Math.round(effStat(g, 'pol'))} · 통솔</span><b>${Math.round(effStat(g, 'tong'))}</b></div>
      <span class="tc-go">▸</span>
    </button>`).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 인사`,
      title: '태수로 임명할 장수',
      body: `<p class="talent-note">${lordHero ? `군주 <b>${lordHero.name}</b>${hasBatchim(lordHero.name) ? '이' : '가'} 이 성에 주둔하고 있어 친히 다스립니다. 군주가 있는 동안에는 다른 장수를 태수로 앉힐 수 없습니다.` : '태수의 정치·통솔이 높을수록 개간·상업·성벽 보수·민심 위로가 잘 되고, 징병도 많이 모입니다. <b>정치 60% + 통솔 40%</b> 순으로 세우고 상위 2명에게 <em class="duty-reco">추천</em>을 달았습니다.'} 달이 바뀔 때 남은 행동으로 내정을 맡깁니다(본성 제외).</p><div class="target-list">${rows}</div>`,
      actions: [{ label: '취소' }],
      wide: true,
    });
    m.el.querySelectorAll('.target-card').forEach((b) => {
      b.onclick = () => {
        const pickUid = b.dataset.uid;
        const pick = gens.find((g) => g.uid === pickUid);
        if (lordHero && pickUid !== lordHero.uid) {
          SK.toast(`군주 ${josa(lordHero.name, 'i')} 주둔한 성은 군주가 친히 다스립니다. 군주를 옮기면 다른 장수에게 맡길 수 있습니다.`);
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
  SK.openAdvisorPick = openAdvisorPick;

  /* v5.14 — 군사는 지력 60% + 매력 40%가 높은 순, 상위 2명에게 [추천] */
  function advScore(g) { return effStat(g, 'ji') * 0.6 + effStat(g, 'cha') * 0.4; }
  function openAdvisorPick(cityId) {
    const cs = SK.state.cities[cityId];
    const lord = SK.factionInfo(PF()).lord;
    const gens = cityGens(cityId).filter((g) => g.name !== lord);
    if (!gens.length) { SK.toast('이 성에 군사로 앉힐 장수가 없습니다. (군주는 군사를 겸하지 않습니다)'); return; }
    const score = advScore;
    const list = gens.slice().sort((a, b) => score(b) - score(a) || String(a.name).localeCompare(String(b.name)));
    const rows = list.map((g, i) => `<button class="target-card" data-uid="${g.uid}">
      <img class="tc-portrait" src="${SK.ptSrc(g.portrait)}" alt="">
      <div class="tc-main"><b>${g.name}${i < 2 ? ' <em class="duty-reco">추천</em>' : ''}${cs.advisor === g.uid ? ' <em>군사</em>' : ''}</b>
        <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv} · 적합도 ${Math.round(score(g))}</span></div>
      <div class="tc-troops"><span>지력 ${Math.round(effStat(g, 'ji'))} · 매력</span><b>${Math.round(effStat(g, 'cha'))}</b></div>
      <span class="tc-go">▸</span>
    </button>`).join('');
    const m = SK.modal({
      kicker: `${CITY[cityId].name} 인사`,
      title: '군사로 임명할 장수',
      body: `<p class="talent-note">지력과 매력이 높은 장수가 좋은 조언을 하고 징병·등용을 돕습니다. <b>지력 60% + 매력 40%</b> 순으로 세우고 상위 2명에게 <em class="duty-reco">추천</em>을 달았습니다. 조언은 행동력을 쓰지 않습니다.</p><div class="target-list">${rows}</div>`,
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

  /* v5.26 — 위임 내정도 태수 자동 내정처럼 같은 일을 한 달에 한두 번으로 묶는다.
     (예전에는 장수 10명이 모두 '징병'을 골라 한 번에 +13,000 병력이 나왔다) */
  function chooseDelegatedAction(cityId, done) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const cap = cityCap(cs);
    const n = done || {};
    const once = (k) => !n[k];
    if (cs.troops < cap * 0.7 && s.gold >= 150 && s.food >= 120 && cs.pop > 12000 && once('recruit')) return 'recruit';
    if (cs.def < 65 && s.gold >= 120 && once('repair')) return 'repair';
    if (s.food < upkeepOf(s) * 4 && s.gold >= 100 && once('farm')) return 'farm';   // v5.4 — 유지비 4개월치 아래면 비상 개간
    if (s.gold < 6000 && s.food >= 80 && (n.trade || 0) < 2) return 'trade';
    if (cs.def < 92 && s.gold >= 120 && once('repair')) return 'repair';
    if (s.gold >= 80 && once('train')) return 'train';
    if (cs.loyalty < 70 && s.gold >= 100 && once('comfort')) return 'comfort';
    if (s.gold >= 100 && (n.farm || 0) < 2) return 'farm';
    return null;
  }

  SK.openOffice = openOffice;

  /* 달이 바뀔 때 태수가 남은 행동으로 고르는 내정 — 태수 위임 방침에 따라 순서가 달라진다 */
  function chooseAutoAction(cityId, done) {
    const s = SK.state;
    const cs = s.cities[cityId];
    const cap = cityCap(cs);
    const n = done || {};
    if (s.gold < 200) return null;                       // 군자금은 남겨 둔다
    const pol = policyOf(cs);
    const lowFood = s.food < upkeepOf(s) * 5;
    const poor = s.gold < 5000;
    const thin = cs.troops < cap * 0.75;
    const canRecruit = s.gold >= 150 && s.food >= 120 && cs.pop > 12000 && cs.troops < cap * 0.98;
    const lowTrain = (cs.train == null ? 50 : cs.train) < 70;
    const weakWall = cs.def < 70;
    const rows = {
      balanced: [
        [cs.loyalty < 55 && s.gold >= 100 && !n.comfort, 'comfort'],
        [thin && canRecruit && !n.recruit, 'recruit'],
        [weakWall && s.gold >= 120 && !n.repair, 'repair'],
        [lowFood && s.gold >= 100 && (n.farm || 0) < 2, 'farm'],
        [poor && s.food >= 80 && (n.trade || 0) < 2, 'trade'],
        [lowTrain && s.gold >= 80 && !n.train, 'train'],
        [cs.def < 95 && s.gold >= 120 && !n.repair, 'repair'],
        [cs.loyalty < 70 && s.gold >= 100 && !n.comfort, 'comfort'],
        [s.gold >= 100 && (n.farm || 0) < 2, 'farm'],
        [s.food >= 80 && (n.trade || 0) < 2, 'trade'],
      ],
      trade: [
        [cs.loyalty < 45 && s.gold >= 100 && !n.comfort, 'comfort'],
        [cs.def < 55 && s.gold >= 120 && !n.repair, 'repair'],
        [s.food >= 80 && (n.trade || 0) < 2, 'trade'],
        [thin && canRecruit && !n.recruit, 'recruit'],
        [lowTrain && s.gold >= 80 && !n.train, 'train'],
        [lowFood && s.gold >= 100 && (n.farm || 0) < 1, 'farm'],
        [cs.loyalty < 65 && s.gold >= 100 && !n.comfort, 'comfort'],
      ],
      farm: [
        [cs.loyalty < 65 && s.gold >= 100 && !n.comfort, 'comfort'],
        [s.gold >= 100 && (n.farm || 0) < 2, 'farm'],
        [thin && canRecruit && !n.recruit, 'recruit'],
        [weakWall && s.gold >= 120 && !n.repair, 'repair'],
        [s.food >= 200 && s.gold < 4000 && (n.trade || 0) < 1, 'trade'],
        [lowTrain && s.gold >= 80 && !n.train, 'train'],
      ],
      war: [
        [thin && canRecruit && !n.recruit, 'recruit'],
        [lowTrain && s.gold >= 80 && !n.train, 'train'],
        [cs.def < 85 && s.gold >= 120 && !n.repair, 'repair'],
        [cs.loyalty < 50 && s.gold >= 100 && !n.comfort, 'comfort'],
        [lowFood && s.gold >= 100 && (n.farm || 0) < 1, 'farm'],
      ],
      supply: [
        [cs.loyalty < 60 && s.gold >= 100 && !n.comfort, 'comfort'],
        [lowFood && s.gold >= 100 && (n.farm || 0) < 1, 'farm'],
        [s.food >= 120 && s.gold < 4500 && (n.trade || 0) < 1, 'trade'],
        [lowTrain && s.gold >= 80 && !n.train, 'train'],
      ],
    }[pol] || [];
    const hit = rows.find((r) => r[0]);
    return hit ? hit[1] : null;
  }

  /* 위임 성 태수 자동 증축 — 경험이 찬 시설 하나를 금이 넉넉할 때 올린다 */
  const AUTO_UPGRADE_RESERVE = 400;
  function pickAutoUpgrade(cs, s) {
    if (!cs || !Array.isArray(cs.slots)) return null;
    let best = null;
    cs.slots.forEach((sl) => {
      if (!sl.key || sl.lv >= 5) return;
      if ((sl.exp || 0) < slotExpNeed(sl.lv)) return;
      const cost = buildCost(sl);
      if (s.gold - cost < AUTO_UPGRADE_RESERVE) return;
      const r = (sl.exp || 0) / slotExpNeed(sl.lv) + sl.lv * 0.01;
      if (!best || r > best.r) best = { sl, cost, r, name: (SLOT_DEFS[sl.key] || {}).name || sl.key };
    });
    return best;
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
      s.purseCity = c.id;          // v5.11 — 이 성 금고로 내정한다
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
      /* v5.7 — 수송 중시: 남는 병력을 지정한 성으로 매달 보낸다 */
      if (policyOf(cs) === 'supply') {
        const to = cs.supplyTo;
        const dst = to && s.cities[to];
        if (dst && dst.owner === PF() && to !== c.id) {
          const keep = Math.max(700, Math.floor(cityCap(cs) * 0.45));
          const spare = Math.floor((cs.troops || 0) - keep);
          const room = Math.max(0, cityCap(dst) - (dst.troops || 0));
          const send = Math.min(spare, room);
          if (send >= 300) {
            cs.troops = Math.max(0, cs.troops - send);
            dst.troops += send;
            acts.push({ key: 'supply', short: `${CITY[to].name} 병력 +${fmt(send)} 수송` });
          }
        }
      }
      /* v5.7 — 태수가 스스로 증축 (한 달에 한 곳) */
      const up = pickAutoUpgrade(cs, s);
      if (up) {
        s.gold -= up.cost;
        up.sl.exp = Math.max(0, (up.sl.exp || 0) - slotExpNeed(up.sl.lv));
        up.sl.lv += 1;
        acts.push({ key: 'upgrade', short: `${up.name} Lv.${up.sl.lv} 증축 (금 −${fmt(up.cost)})` });
      }
      if (acts.length) {
        SK.gainExp(gov, 8 * acts.length);
        out.push({ city: CITY[c.id].name, gov: gov.name, acts });
      }
    });
    return out;
  }
  SK.runAutoDomestic = runAutoDomestic;

  /* v5.11 — 성이 많아져도 피로하지 않게: 굶주리거나 금고가 빈 성은
     길로 이어진 여유 있는 내 성이 스스로 보급 수송한다 (태수 위임 공통 규칙). */
  function autoSupplyNeighbors(s) {
    const rows = [];
    const upkeepPer = (cs) => Math.ceil((cs.troops || 0) / 1000 * ECON.upkeepPer1000);
    SK.CITY_LIST.forEach((c) => {
      const cs = s.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      const up = upkeepPer(cs);
      const needFood = (cs.food || 0) < up * 2;
      const needGold = (cs.gold || 0) < 120;
      if (!needFood && !needGold) return;
      const donors = SK.allNeighbors(c.id).map((nid) => ({ id: nid, cs: s.cities[nid] }))
        .filter((o) => o.cs && o.cs.owner === PF());
      for (let i = 0; i < donors.length; i++) {
        const ns = donors[i].cs;
        const nUp = upkeepPer(ns);
        const parts = [];
        if (needFood && (ns.food || 0) > nUp * 6) {
          const give = Math.round(((ns.food || 0) - nUp * 4) * 0.4);
          if (give > 100) { ns.food -= give; cs.food = (cs.food || 0) + give; parts.push(`군량 +${fmt(give)}`); }
        }
        if (needGold && (ns.gold || 0) > 900) {
          const give = Math.round((ns.gold || 0) * 0.3);
          ns.gold -= give; cs.gold = (cs.gold || 0) + give; parts.push(`금 +${fmt(give)}`);
        }
        if (parts.length) { rows.push({ to: c.name, from: CITY[donors[i].id].name, text: parts.join(' · ') }); break; }
      }
    });
    return rows;
  }
  SK.autoSupplyNeighbors = autoSupplyNeighbors;

  const DELEGATE_LIMIT = 10;

  /* 군사 위임 — 남은 장수들의 행동력을 차례로 써서 내정을 처리한다 */
  function runDelegation(cityId) {
    const s = SK.state;
    SK.setPurse(cityId);
    const cs = s.cities[cityId];
    const gens = cityGens(cityId);
    const advisor = gens.find((g) => g.uid === cs.advisor) || gens.slice().sort((a, b) => (b.ji * 1.4 + b.tong) - (a.ji * 1.4 + a.tong))[0];
    if (!advisor) { SK.toast('군사를 임명할 장수가 없습니다.'); return; }
    if (!cs.advisor) cs.advisor = advisor.uid;
    const log = [];
    const done = {};
    let guard = 0;
    while (guard++ < DELEGATE_LIMIT) {
      const actor = cityGens(cityId).find((g) => !g.actedThisMonth);
      if (!actor) break;
      const key = chooseDelegatedAction(cityId, done);
      if (!key) break;
      const res = key === 'comfort' ? comfortCity(cityId, actor) : CMDS[key].run(cityId, actor);
      if (key === 'comfort') {
        if (!res || !res.ok) break;               // 금이 모자라면 행동을 쓰지 않는다
        res.msg = `민심 +${res.gain}`; res.exp = 6;
      }
      if (!res || res.pending) break;
      done[key] = (done[key] || 0) + 1;
      actor.actedThisMonth = true;
      if (res.exp) SK.gainExp(actor, res.exp);
      log.push({ actor, key, msg: res.msg || (CMDS[key] ? CMDS[key].name : '내정') });
    }
    if (log.length && advisor) SK.gainExp(advisor, 12 * log.length);
    cityActorUid = null;
    SK.save();
    SK.refreshHud();
    const rows = log.map((r) => `<div class="train-row">
        <img src="${SK.ptSrc(r.actor.portrait)}" alt="">
        <div class="tr-main"><b>${r.actor.name}</b><span>${CMDS[r.key] ? CMDS[r.key].name : '백성 위로'}</span></div>
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
        title: `민심이 ${Math.round(cs.loyalty)}까지 내려앉았습니다`,
        body: `백성이 등을 돌리면 징병도 세수도 줄어듭니다. 관아에서 백성을 위로하면 금 100으로 민심을 5 올릴 수 있습니다.`,
        label: '관아 · 백성 위로 (금 100)', short: '민심 위로' });
    }

    if (threat) {
      const stronger = topFoe.troops > cs.troops;
      const threatWord = stronger ? '보다 많습니다' : '에 맞먹습니다';
      if (canRecruit) {
        push({ key: 'recruit', tone: 'urgent',
          title: `이웃 ${topFoe.name}의 병력 ${fmt(topFoe.troops)}이 우리 ${fmt(cs.troops)}${threatWord}`,
          body: `성벽 ${Math.round(cs.def)}도 넉넉하지 않습니다. 병영에서 징병해 병력을 채우고(금 150 · 군량 120), 다음 달에 성벽을 보수하십시오.`,
          label: '병영 · 징병 (금 150 · 군량 120)', short: '징병' });
      } else if (s.gold >= 120 && cs.def < 95) {
        push({ key: 'repair', tone: 'urgent',
          title: `이웃 ${topFoe.name}이 병력 ${fmt(topFoe.troops)}으로 노리고 있습니다`,
          body: `지금은 군량과 금이 모자라 징병이 어렵습니다. 성벽(현재 ${Math.round(cs.def)})을 먼저 손보아 버티면서 재정을 세우십시오.`,
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
        body: `이 성은 인구 ${fmt(cs.pop)}으로 ${fmt(cap)}까지 병력을 채울 수 있습니다. 징병으로 ${fmt(Math.min(capGap, 1200))}가량을 더 세울 수 있습니다.`,
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
        body: `우리 병력 ${fmt(cs.troops)} · 성벽 ${Math.round(cs.def)}, ${weakFoe.name}은 병력 ${fmt(weakFoe.troops)}입니다. 지금 출진하면 이길 만합니다.`,
        label: `출진 · ${weakFoe.name} 공략`, short: '출진' });
    }

    if (!items.length) {
      push({ key: 'train', tone: 'info',
        title: '지금은 성을 다질 때입니다',
        body: `민심 ${Math.round(cs.loyalty)} · 병력 ${fmt(cs.troops)}/${fmt(cap)} · 성벽 ${Math.round(cs.def)} · 금 ${fmt(s.gold)} · 군량 ${fmt(s.food)}. 급한 곳은 없으니 훈련으로 장수들을 키우십시오.`,
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
      const was = releaseDuty(cityId, actor.uid);
      actor.actedThisMonth = true;
      if (was && res) res.dutyReleased = was;
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
    /* v5.12 — 징병·훈련도 장수를 직접 고른다 (예전 자동 실행 제거) */
    if (key === 'recruit') { openRecruit(cityId); return; }
    if (key === 'train') { openTrain(cityId); return; }
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
    if (s.cities[origin] && s.cities[origin].owner === PF()) s.purseCity = origin;
    const tc = SK.CITY[targetId], ts = s.cities[targetId];
    const bt = SK.battleTypeFor(tc);
    const f = SK.factionInfo(ts.owner);
    const pool = cityGens(origin);
    /* v5.10 — 인접 적 성 원군 가능성 경고 */
    const aiSup = SK.aiSupportCandidates ? SK.aiSupportCandidates(targetId) : [];
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
      <p class="march-note"><b>행군 ${marchTurns(origin, targetId)}일</b> · ${SK.CITY[origin].name} → ${tc.name}${marchTurns(origin, targetId) >= 3 ? ' — 먼 원정입니다. 2일차에 중도 야영·보급을 고릅니다' : (marchTurns(origin, targetId) >= 2 ? ' — 길에서 적 요격대를 만날 수 있습니다' : '')}</p>
      ${(ts.genIds && ts.genIds.length) ? `<p class="enemy-gens">적장 — ${ts.genIds.map((gid) => SK.GEN_BY_ID[gid]).filter(Boolean).map((g) => `${g.name}(${g.tier})`).join(' · ')}</p>` : ''}
      ${aiSup.length ? `<p class="enemy-support">⚠ 인접 ${aiSup.map((x) => x.name).join(' · ')}에 원군 병력 — 수성전에 <b>적 지원군</b>이 합류할 수 있습니다</p>` : ''}
      <div class="troop-ledger">
        <div><span>보유 병력</span><b id="dp-avail">${fmt(avail)}</b></div>
        <div><span>출진 병력</span><b id="dp-cost" class="hot">0</b></div>
        <div><span>남는 병력</span><b id="dp-left">0</b></div>
        <div><span>출진 보급</span><b id="dp-supply">군량 0</b></div>
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
          /* v5.11 — 출진 보급은 그 성 창고에서 (병력 1,000당 미 5) */
          const supply = Math.ceil(totalCost() / 1000 * 5);
          if ((s.cities[origin].food || 0) < supply) {
            SK.sfx.play('deny');
            SK.toast(`출진 보급 군량이 부족합니다 — ${SK.CITY[origin].name} 창고 ${fmt(s.cities[origin].food || 0)} / 필요 ${fmt(supply)}. [군량 상인]이나 이웃 성 수송으로 채우세요.`);
            return;
          }
          s.cities[origin].food = Math.max(0, (s.cities[origin].food || 0) - supply);
          const units = [];
          Object.keys(pick).forEach((uid) => units.push({ kind: 'hero', uid, troops: pick[uid] }));
          SK.REGIMENTS.forEach((r) => {
            for (let i = 0; i < (regs[r.cls] || 0); i++) units.push({ kind: 'regiment', cls: r.cls, name: r.name, troops: r.cost });
          });
          s.cities[origin].troops = Math.max(0, avail - totalCost());
          /* v5.8 — 휴전·동맹 중인 세력을 치면 계약을 깨고 명성이 깎인다 */
          const tOwner = s.cities[targetId] && s.cities[targetId].owner;
          if (tOwner && s.truce && s.truce[tOwner] > (s.turn || 1)) {
            delete s.truce[tOwner];
            if (s.pacts) delete s.pacts[tOwner];
            s.fame = Math.max(0, (s.fame || 0) - 8);
            SK.toast('동맹을 깼습니다 — 명성 −8');
          }
          const turns = marchTurns(origin, targetId);
          startMarch({ origin, targetId, type: bt, units });
          SK.showMap();
          if (window.SKMap) { try { SKMap.setScale(1.25); SKMap.focusCity(origin, true); } catch (e) { /* ignore */ } }
          SK.toast(`행군 시작 — ${turns}일 뒤 ${tc.name} 도착 · 지도에 행군 부대가 표시됩니다`);
        } },
      ],
    });

    const refresh = () => {
      m.el.querySelector('#dp-cost').textContent = fmt(totalCost());
      m.el.querySelector('#dp-cost2').textContent = fmt(totalCost());
      m.el.querySelector('#dp-left').textContent = fmt(left());
      m.el.querySelector('#dp-left').classList.toggle('bad', left() < 0);
      const sup = Math.ceil(totalCost() / 1000 * 5);
      const supEl = m.el.querySelector('#dp-supply');
      if (supEl) { supEl.textContent = `군량 ${sup > 0 ? '−' : ''}${fmt(sup)}`; supEl.classList.toggle('bad', (s.cities[origin].food || 0) < sup); }
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

  SK.openDeploy = openDeploy;

  /* ───────────── v5.6 — 행군 · 도중 요격전 ─────────────
     v5.15 — 모든 성 공격은 무조건 2일(2턴) 행군. 첫날 길에서 요격전/대비를 거친다.
     2일이 되는 순간 매 공격에 1일차 요격 기회가 생긴다. */
  /* v5.31 — 아주 먼 원정(기준 거리의 2.6배 이상)은 3턴 행군.
     중도 요격을 더 자주 만나고, [긴급 회군]으로 전선을 바꿀 판단이 생긴다. */
  const MARCH_MIN = 2, MARCH_MAX = 2, MARCH_LONG = 3;
  const MARCH_REF = ['xiapi', 'langya'];
  function marchRefDist() {
    const A = CITY[MARCH_REF[0]], B = CITY[MARCH_REF[1]];
    if (!A || !B) return 120;
    return Math.hypot((A.u - B.u) * 2000, (A.v - B.v) * 1333);
  }
  SK.marchRefDist = marchRefDist;
  function marchTurns(origin, targetId) {
    const a = CITY[origin], b = CITY[targetId];
    if (!a || !b) return MARCH_MIN;
    const d = Math.hypot((a.u - b.u) * 2000, (a.v - b.v) * 1333);
    const ref = marchRefDist();
    if (d <= ref * 1.05) return MARCH_MIN;
    if (d >= ref * 2.6) return MARCH_LONG;
    return MARCH_MAX;
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

  /* ══════════════════════════════════════════════════════════════
     v5.11 — 원정 부대 [긴급 회군]
     성이 침공받을 때 밖으로 나간 주력 부대를 즉시 불러들여 수성전에 합류시킨다.
     (행군 중이던 병력·장수는 출발 성으로 돌아온다)
     ══════════════════════════════════════════════════════════════ */
  function marchUnitsTroops(m) { return (m.units || []).reduce((a, u) => a + (u.troops || 0), 0); }
  /* ══════════════════════════════════════════════════════════════
     v5.31 — 행군 도중 출발 성을 잃었을 때 부대가 돌아갈 곳
     예전에는 회군·요격 패배·전투 중 이탈 병력이 '이제 적의 성이 된 출발지'에
     그대로 합쳐졌다(병력·장수가 적 성으로 사라졌다). 이제 같은 세력의 가장 가까운 성으로
     돌아가고, 남은 성이 하나도 없으면 null(=유랑군)을 돌려준다.
     ══════════════════════════════════════════════════════════════ */
  function fieldHome(originId) {
    const s = SK.state;
    if (!s || !s.cities) return null;
    const home = s.cities[originId];
    if (home && home.owner === PF()) return originId;
    const from = SK.CITY[originId];
    let best = null;
    SK.CITY_LIST.forEach((c) => {
      const cs = s.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      const d = from ? Math.hypot((from.u - c.u) * 2000, (from.v - c.v) * 1333) : 0;
      if (!best || d < best.d) best = { id: c.id, d };
    });
    return best ? best.id : null;
  }
  SK.fieldHome = fieldHome;
  SK.recallMarch = function (id) {
    const s = SK.state;
    const m = (s.marches || []).find((x) => x.id === id);
    if (!m) return false;
    const homeId = fieldHome(m.origin || m.from);
    const home = homeId ? s.cities[homeId] : null;
    const troops = marchUnitsTroops(m);
    if (home) home.troops = Math.min(cityCap(home) + 6000, Math.round((home.troops || 0) + troops));
    (m.units || []).forEach((u) => {
      if (!u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (h) { h.marchId = null; if (homeId) h.city = homeId; }
    });
    s.marches = (s.marches || []).filter((x) => x.id !== id);
    s.pendingMarch = null;
    marchQueueDrop(s, id);
    SK.save(); SK.refreshHud();
    if (window.SKMap) { try { SKMap.refresh(); } catch (e) { /* ignore */ } }
    const movedNote = homeId && homeId !== (m.origin || m.from)
      ? `${CITY[homeId].name}(으)로 — 출발 성 ${CITY[m.origin || m.from] ? CITY[m.origin || m.from].name : ''}이(가) 이미 함락되어 가장 가까운 아군 성으로 돌아갑니다`
      : `${homeId ? CITY[homeId].name : '본성'}으로`;
    SK.toast(home
      ? `긴급 회군 — ${movedNote} 병력 ${fmt(troops)} 복귀`
      : `긴급 회군 — 돌아갈 성이 없어 병력 ${fmt(troops)}이(가) 흩어졌습니다`);
    return true;
  };
  /* ══════════════════════════════════════════════════════════════
     v5.16 — 천하통일 엔딩
     · 모든 거점(80)이 내 깃발 아래 들어오면 한 번만 축하 화면을 연다
     · 걸린 달 수·장수·명성·도감 수집률을 함께 보여 주고, 계속 둘러볼 수 있게 한다
     ══════════════════════════════════════════════════════════════ */
  function ownedCount(s) {
    s = s || SK.state;
    if (!s || !s.cities) return 0;
    return SK.CITY_LIST.filter((c) => s.cities[c.id] && s.cities[c.id].owner === PF()).length;
  }
  SK.ownedCount = ownedCount;
  SK.checkUnification = function (force) {
    const s = SK.state;
    if (!s) return false;
    if (ownedCount(s) < SK.CITY_LIST.length) return false;
    if (s.unified && !force) return false;
    s.unified = true;
    try { SK.save(); } catch (e) { /* ignore */ }
    setTimeout(() => showUnification(), 380);
    return true;
  };
  function showUnification() {
    const s = SK.state;
    if (!s) return;
    const months = Math.max(1, s.turn || 1);
    const q = SK.codexStats ? SK.codexStats() : { gPct: 0, tPct: 0, gHave: 0, gTotal: 0 };
    const rank = months <= 24 ? '전설의 난투왕' : months <= 48 ? '백전노장' : '천하의 주인';
    const f = s.factions[s.playerFaction] || {};
    const lord = f.lord ? SK.GEN_BY_NAME[f.lord] : null;
    SK.sfx.play('victory');
    if (window.JojoBGM) { try { JojoBGM.play('victory'); } catch (e) { /* ignore */ } }
    SK.modal({
      kicker: '천하통일', title: '천하가 하나로 모였습니다', wide: true,
      body: `<div class="unify-card">
        <div class="unify-seal">통일</div>
        ${lord ? `<img class="unify-lord" src="${SK.ptSrc(SK.genPortrait(lord))}" alt="">` : ''}
        <p class="unify-line"><b>${f.name || SK.factionName(s.playerFaction)}</b>의 깃발이 <b>${SK.CITY_LIST.length}개 거점</b> 모두에 섰습니다. ${months}개월의 난투 끝에 천하가 하나가 되었습니다.</p>
        <div class="unify-rank">${rank}</div>
        <div class="unify-stats">
          <div><span>걸린 달</span><b>${months}</b></div>
          <div><span>거점</span><b>${ownedCount(s)} / ${SK.CITY_LIST.length}</b></div>
          <div><span>장수</span><b>${(s.heroes || []).length}명</b></div>
          <div><span>명성</span><b>${fmt(s.fame || 0)}</b></div>
          <div><span>인물 도감</span><b>${q.gPct.toFixed(1)}%</b></div>
          <div><span>보물 도감</span><b>${q.tPct.toFixed(1)}%</b></div>
        </div>
        <p class="unify-note">도감은 다음 회차에도 이어집니다. 아직 만나지 못한 장수와 보물을 모아 보십시오.</p>
      </div>`,
      actions: [
        { label: '도감 보기', onClick: () => setTimeout(() => SK.openCodex(), 160) },
        { label: '계속 둘러보기', primary: true, onClick: () => { SK.showMap(); } },
      ],
      dismissible: false,
    });
  }
  SK.showUnification = showUnification;

  /* ══════════════════════════════════════════════════════════════
     v5.11 — 유랑군 배수진
     성을 모두 잃어도 이미 출발한 원정 주력이 살아 있으면 1회 점령 도전.
     성공하면 그 성을 되찾아 재기하고, 실패하면 패망한다.
     ══════════════════════════════════════════════════════════════ */
  /* v5.20 — 패망 잠금: 행군·침공 예약을 지우고 다음 달 진행을 막는다 */
  SK.lockRun = function () {
    const s = SK.state;
    if (!s) return;
    s.over = true;
    s.marches = [];
    s.pendingMarch = null;
    s.pendingInvasion = null;
    s.reinforce = null;
    try { SK.save(); } catch (e) { /* ignore */ }
  };
  SK.gameOver = function (reason) {
    const s = SK.state;
    /* v5.20 — 패망한 뒤에도 [다음 달]이 그대로 돌아가 행군·요격 이벤트가 계속 뜨던 문제.
       패망 선언 순간 행군·침공 예약을 지우고, 다음 달 진행을 잠근다. */
    SK.lockRun();
    SK.modal({
      kicker: '천하 패배', title: '패망',
      body: `<div class="result-modal lose"><div class="rm-seal">망</div>
        <p class="rm-reason">패배 사유: ${reason || '천하를 잃었습니다'}</p>
        <p class="rm-line">${reason || '천하를 잃었습니다.'}</p>
        <p class="rm-note">처음부터 다시 도전할 수 있습니다. 아래 <b>[새로 시작]</b>으로 새 판을 열어 보세요.</p></div>`,
      actions: [
        { label: '지도 보기', onClick: () => SK.showMap() },
        { label: '새로 시작', primary: true, onClick: () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } startGame(true); } },
      ], dismissible: false,
    });
  };
  SK.lastStandDone = false;
  SK.openLastStand = function () {
    const s = SK.state;
    const army = (s.marches || []).filter((m) => (m.units || []).some((u) => u.uid && u.troops > 0));
    if (!army.length) { SK.gameOver('되찾을 원정 부대가 없습니다.'); return; }
    const rows = army.map((m) => {
      const cand = [m.target || m.to].concat(SK.allNeighbors(m.target || m.to || m.origin || m.from)).filter((id) => id && s.cities[id] && s.cities[id].owner !== PF());
      const target = cand[0];
      const heroes = (m.units || []).filter((u) => u.uid).map((u) => { const h = s.heroes.find((x) => x.uid === u.uid); return h ? h.name : ''; }).filter(Boolean);
      return `<div class="recall-row"><div><b>${CITY[target] ? CITY[target].name : '적성'} 공략</b>
        <span>병력 ${fmt(marchUnitsTroops(m))} · ${heroes.join(' · ')}</span></div>
        <button data-stand="${m.id}">배수진</button></div>`;
    }).join('');
    const m = SK.modal({
      kicker: '유랑군', title: '한 번뿐인 배수진', wide: true,
      body: `<p class="talent-note">성을 모두 잃었지만 원정 주력이 남아 있습니다. 남은 병력으로 적성 하나를 쳐서 되찾으면 재기할 수 있고, 지면 그대로 패망합니다. <b>도전은 한 번뿐입니다.</b></p><div class="recall-list">${rows}</div>`,
      actions: [{ label: '패망을 받아들인다', onClick: () => { m.close(); SK.gameOver('유랑군이 길에서 흩어졌습니다.'); } }],
    });
    m.el.querySelectorAll('[data-stand]').forEach((b) => {
      b.onclick = () => {
        const march = (s.marches || []).find((x) => x.id === b.dataset.stand);
        if (!march) return;
        const cand = [march.target || march.to].concat(SK.allNeighbors(march.target || march.to || march.origin || march.from)).filter((id) => id && s.cities[id] && s.cities[id].owner !== PF());
        const target = cand[0];
        if (!target) { m.close(); SK.gameOver('공격할 적성이 없습니다.'); return; }
        m.close();
        SK.startBattle({ targetId: target, origin: march.origin || march.from, type: SK.battleTypeFor(SK.CITY[target]),
          units: (march.units || []).filter((u) => u.troops > 0), marchId: march.id, lastStand: true });
      };
    });
  };

  SK.openRecall = function (cityId) {
    const s = SK.state;
    const marches = (s.marches || []).filter((m) => (m.units || []).length);
    if (!marches.length) { SK.toast('밖으로 나간 원정 부대가 없습니다.'); return; }
    const rows = marches.map((m) => {
      const heroes = (m.units || []).filter((u) => u.uid).map((u) => { const h = s.heroes.find((x) => x.uid === u.uid); return h ? h.name : ''; }).filter(Boolean);
      return `<div class="recall-row">
        <div><b>${CITY[m.origin || m.from] ? CITY[m.origin || m.from].name : '?'} → ${CITY[m.target || m.to] ? CITY[m.target || m.to].name : '?'}</b>
          <span>${fmt(marchUnitsTroops(m))}명 · 도착까지 ${m.left || 0}개월${heroes.length ? ` · ${heroes.join(' · ')}` : ''}</span></div>
        <button data-recall="${m.id}">긴급 회군</button>
      </div>`;
    }).join('');
    const m = SK.modal({
      kicker: '원정 부대', title: '어느 부대를 불러들일까', wide: true,
      body: `<p class="talent-note">회군하면 행군이 취소되고 병력·장수가 출발 성으로 즉시 돌아옵니다. 성이 침공받을 때 주력을 불러들여 수성전에 합류시키십시오.</p><div class="recall-list">${rows}</div>`,
      actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('[data-recall]').forEach((b) => {
      b.onclick = () => { SK.recallMarch(b.dataset.recall); m.close(); };
    });
  };

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

  /* v5.15 — 요격전 8종을 지형에 맞게 고르되 전부 고르게 등장시킨다.
     바다 = 수전 / 강 건너 = 도하전 / 관문·산길 = 산전·협곡 / 요새 = 요새전 /
     그 밖의 육로 = 평야·밀림·야영. */
  const INTERCEPT_POOL = ['plain', 'forest', 'camp', 'gorge', 'mountain', 'ford'];
  function pickFrom(tbl, r) {
    let acc = 0;
    for (let i = 0; i < tbl.length; i++) { acc += tbl[i][1]; if (r < acc) return tbl[i][0]; }
    return tbl[0][0];
  }
  function interceptTypeFor(m) {
    const A = SK.CITY[m.origin], B = SK.CITY[m.target];
    if (A && (A.sea || []).indexOf(m.target) >= 0) return 'naval';
    const r = Math.random();
    if (pathCrossesRiver(m.origin, m.target)) {
      return pickFrom([['ford', 0.5], ['plain', 0.2], ['forest', 0.12], ['gorge', 0.08], ['camp', 0.1]], r);
    }
    if (B && B.type === 'pass') {
      return pickFrom([['mountain', 0.4], ['gorge', 0.4], ['forest', 0.2]], r);
    }
    if (B && B.type === 'fortress') {
      return pickFrom([['fortress', 0.3], ['plain', 0.25], ['camp', 0.25], ['mountain', 0.2]], r);
    }
    return pickFrom(INTERCEPT_POOL.map((k) => [k, k === 'plain' ? 0.24 : k === 'forest' ? 0.22 : k === 'camp' ? 0.2 : k === 'gorge' ? 0.14 : k === 'mountain' ? 0.12 : 0.08]), r);
  }
  SK.interceptTypeFor = interceptTypeFor;

  /* ══════════════════════════════════════════════════════════════
     v5.28 — 같은 달에 여러 부대가 도착·요격을 맞아도 한 사건씩 차례로 처리한다.
     · 도착·요격은 marchQueue 에 쌓아 두고, 앞 사건(전투 결산)이 끝나면 다음 사건을 연다
     · 예전에는 pendingMarch 하나뿐이라 두 번째 부대가 다음 달로 밀렸다
     ══════════════════════════════════════════════════════════════ */
  function marchQueuePush(s, kind, marchId) {
    s.marchQueue = s.marchQueue || [];
    if (s.marchQueue.some((q) => q.marchId === marchId)) return;
    s.marchQueue.push({ kind, marchId });
  }
  function marchQueueDrop(s, marchId) {
    if (!s || !s.marchQueue) return;
    s.marchQueue = s.marchQueue.filter((q) => q.marchId !== marchId);
  }
  SK.marchQueueDrop = marchQueueDrop;
  function queuedIds(s) {
    return new Set(((s && s.marchQueue) || []).map((q) => q.marchId));
  }
  /* 대기 중인 도착·요격 하나를 꺼내 pendingMarch 로 올린다 */
  function promoteMarchQueue(s) {
    s = s || SK.state;
    if (!s || s.over || s.pendingMarch || s.pendingInvasion) return false;
    /* 전투 중에는 다음 도착 사건을 꺼내지 않는다 */
    if (window.SKBattle && SKBattle.debug && SKBattle.debug.battle) return false;
    const alive = new Set((s.marches || []).map((m) => m.id));
    s.marchQueue = (s.marchQueue || []).filter((q) => alive.has(q.marchId));
    if (!s.marchQueue.length) return false;
    const q = s.marchQueue.shift();
    s.pendingMarch = { kind: q.kind, marchId: q.marchId };
    SK.save();
    return true;
  }
  SK.promoteMarchQueue = promoteMarchQueue;
  /* 전투·결산이 끝난 뒤 다음 도착 사건으로 자연스럽게 이어 준다 */
  function chainPendingEvents() {
    const s = SK.state;
    if (!s || s.over) return;
    if (document.querySelector('#modal-root .modal-layer')) return;
    /* 전장이 열려 있는 동안에는 다음 사건을 띄우지 않는다.
       화면 전환이늦어 overlay 가 아직 안 보일 때도 있으므로 전투 객체까지 본다. */
    const btl = document.getElementById('battle-overlay');
    const battleLive = !!(window.SKBattle && SKBattle.debug && SKBattle.debug.battle);
    if (battleLive || (document.querySelector('#screen-battle.active') && btl && !btl.hidden)) return;
    if (promoteMarchQueue(s)) { setTimeout(() => { if (SK.openPendingMarch) SK.openPendingMarch(); }, 320); return; }
    if (promoteInvasionQueue(s)) { setTimeout(() => { if (SK.openPendingInvasion) SK.openPendingInvasion(); }, 320); return; }
    if (s.pendingInvasion && SK.openPendingInvasion) setTimeout(() => { if (SK.openPendingInvasion) SK.openPendingInvasion(); }, 320);
  }
  SK.chainPendingEvents = chainPendingEvents;

  /* ───────────── v5.29 — 침공 대기열 ─────────────
     한 달에 두 성이 동시에 침공받거나, 수성전이 끝난 같은 달에 행군 도착이 겹칠 때
     예전에는 pendingInvasion 하나가 덮어써져 뒤 침공이 사라졌다.
     이제 침공은 invasionQueue에 쌓고 pendingInvasion 하나씩 순서대로 연다. */
  function pushInvasion(s, inv) {
    s = s || SK.state;
    if (!s || !inv) return null;
    s.invasionQueue = s.invasionQueue || [];
    if (!s.pendingInvasion && !s.invasionQueue.length) { s.pendingInvasion = inv; return inv; }
    s.invasionQueue.push(inv);
    return inv;
  }
  SK.pushInvasion = pushInvasion;
  function promoteInvasionQueue(s) {
    s = s || SK.state;
    if (!s || s.over || s.pendingInvasion || s.pendingMarch) return false;
    if (window.SKBattle && SKBattle.debug && SKBattle.debug.battle) return false;
    s.invasionQueue = s.invasionQueue || [];
    /* 이미 내 성이 아닌 곳을 노리는 침공은 버리고 다음을 고른다 */
    while (s.invasionQueue.length) {
      const inv = s.invasionQueue.shift();
      const ts = inv && s.cities[inv.target];
      if (!ts || ts.owner !== PF()) continue;
      s.pendingInvasion = inv;
      SK.save();
      return true;
    }
    SK.save();
    return false;
  }
  SK.promoteInvasionQueue = promoteInvasionQueue;
  /* 대기 중인 침공 수 (화면 표시용) */
  function pendingInvasionCount(s) {
    s = s || SK.state;
    if (!s) return 0;
    return (s.pendingInvasion ? 1 : 0) + ((s.invasionQueue || []).length);
  }
  SK.pendingInvasionCount = pendingInvasionCount;

  /* 한 달에 한 사건만 — 도착이 먼저, 없으면 요격. 같은 달 사건은 큐에 쌓아 차례로 연다 */
  function stepMarches(s) {
    if (!s.marches || !s.marches.length) return s.pendingMarch;
    if (s.pendingMarch) return s.pendingMarch;
    const queued = queuedIds(s);
    for (let i = 0; i < s.marches.length; i++) {
      const m = s.marches[i];
      if (queued.has(m.id)) continue;      // v5.28 — 이미 도착 대기 중인 부대는 더 세지 않는다
      if (m.left > 0) m.left -= 1;
      if (m.left <= 0) {
        marchQueuePush(s, 'arrive', m.id);
        continue;
      }
      /* v5.32 — 3일 원정의 2일차는 요격 주사위 대신 중도 야영/보급 선택을 연다.
         먼 원정이 '2일차 요격 또 요격'으로만 흘러가지 않게, 군량을 써서 사기를 지키거나
         병력을 깎아 하루를 당기는 판단을 넣는다. */
      if (m.total >= 3 && m.left === 1 && !m.campSeen) {
        m.campSeen = true;
        marchQueuePush(s, 'camp', m.id);
        continue;
      }
      const ts = s.cities[m.target];
      const c = SK.CITY[m.target];
      if (!ts || !c) continue;
      let p = 0.28 + Math.min(0.24, (ts.troops || 0) / 50000) + Math.max(-0.08, Math.min(0.14, ((ts.def || 60) - 65) / 250));
      if (c.type === 'pass' || c.type === 'fortress') p += 0.08;
      p = clamp(p, 0.2, 0.7);
      if (Math.random() < p) {
        /* v5.21 — 요격대 병력 뻥튀기 수정.
           옛 식은 부대 수 5 × 부대당 최소 900명이라 2,000명 성에도 무조건 4,500명이 나왔다.
           이제 요격대 총합은 목표 성 병력의 25~40%, 부대 수 2~6, 부대당 최소 병력도 성 규모에 맞춘다.
           v5.26 — 출진군이 성 수비병보다 클 때 700명 요격대가 8,000명 대군을 막는 헛전투가 났다.
           출진군의 20~30%(최대 60%)까지 같이 본다 — 덩치에 맞는 길막이가 되게. */
        const tgt = Math.max(200, Math.round(ts.troops || 2000));
        const marchT = marchUnitsTroops(m);
        const room = Math.min(6000, Math.max(tgt, Math.round(marchT * 0.6)));
        const total = clamp(Math.max(Math.round(tgt * (0.25 + Math.random() * 0.15)),
          Math.round(marchT * (0.2 + Math.random() * 0.1))), Math.min(400, room), room);
        const cnt = clamp(2 + Math.round(Math.max(tgt, marchT) / 6000), 2, 6);
        const per = Math.max(120, Math.round((total / cnt) / 50) * 50);
        m.raiders = per * cnt;
        m.interceptType = interceptTypeFor(m);
        marchQueuePush(s, 'intercept', m.id);
      }
    }
    /* 큐에 쌓인 사건 중 첫 번째를 이번 사건으로 올린다 */
    promoteMarchQueue(s);
    return s.pendingMarch;
  }
  SK.stepMarches = stepMarches;

  /* ══════════════════════════════════════════════════════════════
     v5.32 — 3일 원정 2일차: 중도 야영 · 보급 / 강행군
     · 야영 · 보급: 행군 성 창고의 군량을 내어 쉰다 — 병력 2% 보충, 전장 시작 사기 +12
     · 강행군: 병력 4%를 잃고(탈진·낙오) 하루를 당겨 오늘 도착, 적이 진을 못 친다(적 사기 −8)
     · 그대로 진군: 아무 일 없이 다음 날 도착
     군량은 출발 성(함락됐으면 가장 가까운 우리 성) 창고에서 나간다.
     ══════════════════════════════════════════════════════════════ */
  /* 야영 군량 = 원정 병력 한 달치 유지비(1,000명당 20) — '군량 일부를 내고 쉰다'가 실제로 값이 되게 */
  function marchCampCost(troops) { return Math.max(40, Math.ceil((Number(troops) || 0) / 1000 * 20)); }
  function openMarchCamp(m, troops, originNote) {
    const s = SK.state;
    const tc = SK.CITY[m.target];
    const homeId = fieldHome(m.origin);
    const home = homeId ? s.cities[homeId] : null;
    const cost = marchCampCost(troops);
    const food = home ? Math.round(home.food || 0) : 0;
    const canCamp = !!home && food >= cost;
    const heal = Math.max(20, Math.round(troops * 0.02));
    const loss = Math.max(30, Math.round(troops * 0.04));
    const done = () => { s.pendingMarch = null; SK.save(); setTimeout(() => SK.chainPendingEvents && SK.chainPendingEvents(), 240); };
    const mm = SK.modal({
      kicker: `행군 2/${m.total}일 · ${SK.CITY[m.origin].name} → ${tc.name}`,
      title: '중도 야영지',
      body: `<div class="march-event">
          <div class="me-flag" style="background:#7a6524">營</div>
          <p>긴 원정의 둘째 날, 길가에 물가와 빈 군영이 보입니다. 하루를 어떻게 보낼지 정하십시오.</p>
          <div class="me-nums"><span>원정 병력 <b>${fmt(troops)}</b></span><span>남은 행군 <b>1일</b></span>
            <span>${home ? `${SK.CITY[homeId].name} 군량 <b>${fmt(food)}</b>` : '군량을 댈 성 <b>없음</b>'}</span></div>
          ${originNote}
          <p class="me-note"><b>야영 · 보급</b> — 군량 ${fmt(cost)}을 내고 쉰다. 병력 ${fmt(heal)} 보충, 내일 전장에 <b>사기 +12</b>로 들어갑니다.${canCamp ? '' : ' <b class="me-warn">군량이 모자랍니다.</b>'}<br>
            <b>강행군</b> — 병력 ${fmt(loss)}(4%)를 잃는 대신 <b>오늘 바로 도착</b>합니다. 적이 미처 진을 못 쳐 <b>적 사기 −8</b>.<br>
            <b>그대로 진군</b> — 손해도 이득도 없이 내일 도착합니다.</p>
        </div>`,
      actions: [
        { label: '그대로 진군', keepOpen: true, onClick: () => { mm.close(); done(); SK.toast('야영을 건너뛰고 진군을 이어갑니다.'); } },
        { label: '강행군', keepOpen: true, onClick: () => {
          (m.units || []).forEach((u) => {
            u.troops = Math.max(300, Math.round((u.troops || 0) * 0.96));
            u.moraleBonus = (u.moraleBonus || 0) - 4;
          });
          m.surprise = 1;
          m.camp = 'forced';
          m.left = 0;
          marchQueuePush(s, 'arrive', m.id);
          mm.close();
          done();
          SK.toast(`강행군 — 병력 ${fmt(loss)}을 잃고 하루를 당겼습니다 (기습)`);
        } },
        { label: '야영 · 보급', primary: true, keepOpen: true, onClick: () => {
          if (!canCamp) {
            /* 창을 닫지 않고 그대로 두어 다른 선택을 고르게 한다 */
            SK.sfx.play('deny');
            SK.toast(home ? `군량이 부족합니다 — ${SK.CITY[homeId].name} 창고 ${fmt(food)} / 필요 ${fmt(cost)}` : '군량을 댈 성이 없어 야영할 수 없습니다.');
            return;
          }
          home.food = Math.max(0, (home.food || 0) - cost);
          (m.units || []).forEach((u) => {
            u.troops = Math.round((u.troops || 0) * 1.02);
            u.moraleBonus = (u.moraleBonus || 0) + 12;
          });
          m.camp = 'rest';
          mm.close();
          done();
          SK.toast(`야영 · 보급 — 군량 ${fmt(cost)} 사용, 병력 보충 · 사기 +12`);
        } },
      ],
      dismissible: false,
    });
  }

  function openPendingMarch() {
    const s = SK.state;
    if (!s || !s.pendingMarch) return;
    if (document.querySelector('#modal-root .modal-layer')) return;
    const m = (s.marches || []).find((x) => x.id === s.pendingMarch.marchId);
    if (!m) { s.pendingMarch = null; SK.save(); setTimeout(() => SK.chainPendingEvents && SK.chainPendingEvents(), 260); return; }
    const tc = SK.CITY[m.target], ts = s.cities[m.target];
    const f = SK.factionInfo(ts.owner);
    const troops = marchUnitTroops(m.units);
    const waitN = (s.marchQueue || []).length;
    const waitTag = waitN ? ` · 뒤이어 도착 ${waitN}부대` : '';
    /* v5.28 — 앞선 부대가 먼저 그 성을 차지했으면(같은 성으로 두 부대) 싸우지 않고 성에 들어간다 */
    if (ts.owner === PF()) {
      const add = Math.round(troops);
      const room = Math.max(0, cityCap(ts) + 6000 - Math.round(ts.troops || 0));
      const moved = Math.min(add, room);
      ts.troops = Math.round(ts.troops || 0) + moved;
      (m.units || []).forEach((u) => {
        if (!u.uid) return;
        const h = s.heroes.find((x) => x.uid === u.uid);
        if (h) { h.marchId = null; h.city = m.target; }
      });
      s.marches = (s.marches || []).filter((x) => x.id !== m.id);
      marchQueueDrop(s, m.id);
      s.pendingMarch = null;
      SK.save(); SK.refreshHud();
      if (window.SKMap) { try { SKMap.refresh(); } catch (e) { /* ignore */ } }
      SK.toast(`${tc.name}은 이미 아군 성입니다 — 도착한 부대가 성으로 들어갔습니다 (병력 +${fmt(moved)})`);
      setTimeout(() => SK.chainPendingEvents && SK.chainPendingEvents(), 360);
      return;
    }
    /* v5.31 — 행군 중 출발 성이 함락됐는지 (모달에 그대로 알린다) */
    const originSt = s.cities[m.origin];
    const originLost = !!(originSt && originSt.owner !== PF());
    const originNote = originLost
      ? `<p class="me-note me-warn">⚠ 출발 성 ${josa(SK.CITY[m.origin] ? SK.CITY[m.origin].name : '본성', 'i')} 이미 함락되었습니다 — 이 성을 차지하면 여기에 주둔하고, 지면 가장 가까운 아군 성으로 회군합니다.</p>`
      : '';
    if (s.pendingMarch.kind === 'camp') {
      openMarchCamp(m, troops, originNote);
      return;
    }
    if (s.pendingMarch.kind === 'intercept') {
      /* v5.15 — 옛 저장의 ambush 요격전은 밀림전으로 이어진다 */
      let itype = m.interceptType || 'plain';
      if (itype === 'ambush') itype = 'forest';
      const idef = SK.BATTLE_TYPES[itype] || SK.BATTLE_TYPES.plain;
      const raiders = m.raiders || 2400;
      SK.modal({
        kicker: `행군 ${m.total - m.left}/${m.total}일 · ${SK.CITY[m.origin].name} → ${tc.name}${waitTag}`,
        title: `도중 요격 — ${idef.name}`,
        body: `<div class="march-event">
            <div class="me-flag" style="background:${f.color}">${SK.markOf(f)}</div>
            <p>${f.name}의 요격대가 길을 막았습니다. <b>${idef.desc}</b></p>
            <div class="me-nums"><span>우리 병력 <b>${fmt(troops)}</b></span><span>적 요격대 <b>${fmt(raiders)}</b></span></div>
            <p class="me-note">${idef.skill || ''} 승리하면 행군을 이어가고, 패하면 남은 병력으로 본성으로 돌아갑니다.</p>
            ${originNote}
          </div>`,
        actions: [{ label: '싸운다', primary: true, onClick: () => {
          s.pendingMarch = null;
          marchQueueDrop(s, m.id);
          SK.save();
          SK.startBattle({ origin: m.origin, targetId: m.target, type: itype, units: m.units,
            intercept: { marchId: m.id, name: `${tc.name} 가는 길`, troops: raiders } });
        } }],
        dismissible: false,
      });
    } else {
      const supCands = SK.aiSupportCandidates ? SK.aiSupportCandidates(m.target) : [];
      /* v5.32 — 중도 야영·강행군의 결과를 도착 창에 한 줄로 남긴다 */
      const campNote = m.camp === 'rest'
        ? `<p class="me-support">야영 · 보급 — 군량을 나눠 쉬었습니다. 아군 사기 +12로 전장에 들어갑니다</p>`
        : (m.surprise ? `<p class="me-support">강행군 기습 — 적이 미처 진을 치지 못했습니다 (적 사기 −8)</p>` : '');
      SK.modal({
        kicker: `행군 ${m.total}/${m.total}일${m.surprise ? ' · 강행군 하루 당김' : ''}${waitTag}`,
        title: `${tc.name} 성 앞 도착`,
        body: `<div class="march-event">
            <div class="me-flag" style="background:${f.color}">${SK.markOf(f)}</div>
            <p>${m.total}일 행군 끝에 <b>${tc.name}</b> 성 아래에 닿았습니다.</p>
            <div class="me-nums"><span>도착 병력 <b>${fmt(troops)}</b></span><span>수비병 <b>${fmt(ts.troops)}</b></span></div>
            <p class="me-note">${SK.BATTLE_TYPES[m.type].name} — ${SK.BATTLE_TYPES[m.type].desc}</p>
            ${campNote}
            ${originNote}
            ${supCands.length ? `<p class="me-support">⚠ 인접 ${supCands.map((x) => x.name).join(' · ')}의 원군이 성으로 들어가고 있습니다 — 적 지원군이 합류할 수 있습니다</p>` : ''}
          </div>`,
        actions: [{ label: `${SK.BATTLE_TYPES[m.type].name} 시작`, primary: true, onClick: () => {
          s.pendingMarch = null;
          s.marches = (s.marches || []).filter((x) => x.id !== m.id);
          marchQueueDrop(s, m.id);
          /* v5.10 — 인접 적 성 지원군 합류 판정 (병력은 원 성에서 빠진다) */
          const aiSupport = SK.rollAiSupport ? SK.rollAiSupport(m.target) : [];
          SK.save();
          SK.startBattle({ origin: m.origin, targetId: m.target, type: m.type, units: m.units, marchId: m.id, aiSupport, surprise: !!m.surprise });
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
    /* v5.7 — 소속 성·현재 상태 배지 (업무 중인 장수를 실수로 빼지 않게) */
    const duty = dutyOf(h, h.city);
    const loy = loyalOf(h);
    const busy = duty !== '대기' && duty !== '이번 달 완료';
    return `<div class="hero-pick ${on ? 'on' : ''} ${busy ? 'busy' : ''}" data-uid="${h.uid}">
      <img src="${SK.ptSrc(h.portrait)}" alt="">
      <div class="hp-main"><b>${h.name}</b><span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv}</span>
        <em class="hp-badges"><i class="hp-city">${(CITY[h.city] || {}).name || '-'}</i><i class="hp-duty ${duty === '대기' ? 'hp-duty-wait' : 'hp-duty-busy'}">${duty}</i>${loy < 40 ? `<i class="hp-loyal-low">충성 ${loy}</i>` : ''}</em></div>
      <div class="hp-stats"><span>무 ${h.wu}</span><span>지 ${h.ji}</span><span>통 ${h.tong}</span></div>
      <div class="hp-step"><button data-d="-1" aria-label="줄이기">−</button><button class="hp-count" type="button" title="직접 입력">${fmt(cost)}</button><button data-d="1" aria-label="늘리기">＋</button></div>
      <span class="hp-check">✓</span>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     v5.7 — 세계제패형 AI
     · AI 세력도 달마다 병력 우위가 서면 이웃 중립·약소 세력을 실제로 점령한다
     · 첫 4개월은 플레이어를 치지 않는다. 그 뒤에도 하루아침에 치지 않고
       한 달 전에 첩보로 경고하고, 그다음 달에 수성전이 벌어진다
     ══════════════════════════════════════════════════════════════ */
  const AI_GRACE_TURNS = 4;       // 1~4월은 플레이어 적응 보호
  const AI_CITY_RESERVE = 900;    // 성을 비우지 않을 최소 병력

  function cityPower(cs) { return (cs.troops || 0) + (cs.def || 0) * 6 + 300; }
  SK.cityPower = cityPower;

  function syncFactionCities(s) {
    if (!s || !s.factions) return;
    Object.keys(s.factions).forEach((k) => {
      const f = s.factions[k];
      if (!f) return;
      f.cities = SK.CITY_LIST.filter((c) => s.cities[c.id] && s.cities[c.id].owner === k).map((c) => c.id);
    });
  }
  SK.syncFactionCities = syncFactionCities;

  /* ══════════════════════════════════════════════════════════════
     v5.28 — 성을 모두 잃은 세력을 명부에서 지운다.
     예전에는 플레이어가 마지막 성을 함락했을 때만 멸망 처리가 되어,
     AI끼리 성을 빼앗아 0성이 된 세력이 외교 명부·몸값 제안에 유령으로 남았다.
     ══════════════════════════════════════════════════════════════ */
  function pruneLandlessFactions(s) {
    s = s || SK.state;
    const gone = [];
    if (!s || !s.factions) return gone;
    Object.keys(s.factions).forEach((fid) => {
      if (fid === 'neutral' || fid === s.playerFaction) return;
      const owns = SK.CITY_LIST.some((c) => s.cities[c.id] && s.cities[c.id].owner === fid);
      if (owns) return;
      const f = s.factions[fid] || {};
      gone.push(f.name || SK.factionName(fid));
      delete s.factions[fid];
      if (s.truce) delete s.truce[fid];
      if (s.pacts) delete s.pacts[fid];
      /* 몸값·교환 제안이 유령 세력 이름으로 남지 않게 */
      if (s.prisoners) s.prisoners.forEach((pr) => {
        if (pr.by !== fid) return;
        pr.by = '';
        pr.orphan = true;
        pr.offer = null;
      });
      /* 그 세력이 사로잡고 있던 아군 장수는 풀려나 내 성으로 돌아온다 */
      if (s.captured && s.captured.length) {
        const home = (s.playerCapital && s.cities[s.playerCapital] && s.cities[s.playerCapital].owner === s.playerFaction)
          ? s.playerCapital
          : (SK.CITY_LIST.find((c) => s.cities[c.id] && s.cities[c.id].owner === s.playerFaction) || {}).id || null;
        s.captured = s.captured.filter((cap) => {
          if (cap.by !== fid) return true;
          const h = (s.heroes || []).find((x) => x.uid === cap.uid);
          if (h && home) {
            h.captured = false;
            h.marchId = null;
            h.city = home;
            h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.4));
          }
          return false;
        });
      }
    });
    if (gone.length) syncFactionCities(s);
    /* v5.29 — 아군 포로(s.captured) 잔여 기록 정리.
       이미 풀려났거나 더 이상 존재하지 않는 장수의 기록, 세력이 사라졌는데 남은 기록을 지우고,
       기록 없이 captured 표시만 남은 장수는 성으로 되돌린다. */
    if (s.captured && s.captured.length) {
      s.captured = s.captured.filter((cap) => {
        if (!cap || !cap.uid) return false;
        const h = (s.heroes || []).find((x) => x.uid === cap.uid);
        if (!h || !h.captured) return false;
        const by = cap.by || '';
        if (by && by !== 'neutral' && !s.factions[by]) return false;   // 사라진 세력
        return true;
      });
    }
    (s.heroes || []).forEach((h) => {
      if (!h.captured) return;
      if ((s.captured || []).some((c) => c.uid === h.uid)) return;
      /* 기록 없는 captured 표식 — 풀려난 것으로 보고 성으로 돌린다 */
      h.captured = false;
      if (!h.city || !s.cities[h.city] || s.cities[h.city].owner !== s.playerFaction) {
        const home = (s.playerCapital && s.cities[s.playerCapital] && s.cities[s.playerCapital].owner === s.playerFaction)
          ? s.playerCapital
          : (SK.CITY_LIST.find((c) => s.cities[c.id] && s.cities[c.id].owner === s.playerFaction) || {}).id || null;
        if (home) h.city = home;
      }
    });
    return gone;
  }
  SK.pruneLandlessFactions = pruneLandlessFactions;

  function nearestOwnedCity(s, id) {
    const a = CITY[id];
    if (!a) return null;
    let best = null;
    SK.CITY_LIST.forEach((c) => {
      if (c.id === id || !s.cities[c.id] || s.cities[c.id].owner !== PF()) return;
      const d = Math.hypot((a.u - c.u) * 2000, (a.v - c.v) * 1333);
      if (!best || d < best.d) best = { id: c.id, d };
    });
    return best ? best.id : null;
  }
  SK.nearestOwnedCity = nearestOwnedCity;

  /* 성을 잃을 때 — 병력·장수를 가까운 내 성으로 물리고 소유를 넘긴다 */
  function loseCity(id, faction, opts) {
    const s = SK.state;
    const ts = s.cities[id];
    if (!ts) return { refuge: null, moved: 0 };
    const o = opts || {};
    const refuge = nearestOwnedCity(s, id);
    const gens = cityGens(id);
    const survivors = Math.max(0, Math.round(o.troops || 0));
    let moved = 0;
    if (refuge) {
      const dst = s.cities[refuge];
      const room = Math.max(0, cityCap(dst) - (dst.troops || 0));
      moved = Math.min(survivors, room);
      dst.troops = (dst.troops || 0) + moved;
      gens.forEach((h) => { h.city = refuge; h.marchId = null; });
      (ts.slots || []).forEach((sl) => { sl.uid = null; });
      ts.trainCrew = [];
    }
    ts.owner = faction;
    ts.troops = Math.max(600, Math.round(o.garrison || 800));
    ts.def = Math.max(25, Math.round((ts.def || 50) * 0.7));
    ts.loyalty = 40;
    ts.governor = null;
    ts.advisor = null;
    ts.auto = true;
    ts.bandit = false;
    ts.policy = 'balanced';
    ts.genIds = o.genIds || [];
    if (s.playerCapital === id) s.playerCapital = refuge || null;
    syncFactionCities(s);
    SK.save();
    return { refuge, moved };
  }
  SK.loseCity = loseCity;

  /* AI 세력 하나가 노릴 만한 이웃 성 (플레이어 성은 제외 — 따로 경고·침공) */
  function aiAttackPlan(s, fid) {
    const owned = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === fid);
    let best = null;
    owned.forEach((a) => {
      const as = s.cities[a.id];
      const strength = (as.troops || 0) - AI_CITY_RESERVE;
      if (strength < 1600) return;
      SK.allNeighbors(a.id).forEach((tid) => {
        const ts = s.cities[tid];
        if (!ts || ts.owner === fid || ts.owner === PF()) return;
        const ratio = strength / cityPower(ts);
        if (ratio < 1.45) return;
        const score = ratio + (ts.owner === 'neutral' ? 0.18 : 0);
        if (!best || score > best.score) best = { from: a.id, target: tid, strength, ratio, score };
      });
    });
    return best;
  }
  SK.aiAttackPlan = aiAttackPlan;

  function resolveAiRaid(s, plan, fid) {
    const as = s.cities[plan.from];
    const ts = s.cities[plan.target];
    const commit = Math.round(plan.strength * 0.8);
    as.troops = Math.max(AI_CITY_RESERVE, (as.troops || 0) - commit);
    const winP = clamp(0.32 + (plan.ratio - 1.45) * 0.5, 0.25, 0.92);
    const win = Math.random() < winP;
    if (win) {
      const prev = ts.owner;
      ts.owner = fid;
      ts.troops = Math.max(500, Math.round(commit * (0.28 + Math.random() * 0.18)));
      ts.def = Math.max(28, Math.round((ts.def || 50) * 0.7));
      ts.loyalty = 40;
      ts.bandit = false;
      ts.governor = null;
      ts.advisor = null;
      ts.auto = true;
      ts.genIds = (as.genIds && as.genIds.length > 1) ? [as.genIds.pop()] : (ts.genIds || []).slice(0, 1);
      syncFactionCities(s);
      return { win: true, from: plan.from, target: plan.target, faction: fid, prev };
    }
    const back = Math.round(commit * 0.3);
    as.troops = Math.min(cityCap(as), (as.troops || 0) + back);
    /* v5.12 — 실패한 공격으로 재야 수비병이 300명까지 깎여 거저먹기 표적이 되지 않게
       중립 성은 기지의 40%(최소 600명) 아래로는 내려가지 않는다. */
    const floor = ts.owner === 'neutral' ? Math.round((1500 + (hashStr(plan.target) % 1001)) * 0.4) : 300;
    ts.troops = Math.max(floor, (ts.troops || 0) - Math.round(commit * 0.45));
    return { win: false, from: plan.from, target: plan.target, faction: fid };
  }

  /* 플레이어 접경 성을 노리는 침공 — 한 달 전에 경고만 남긴다
     v5.13 — 인접 성 1곳만 보지 않고 같은 세력의 인접 성 출진 병력을 합산해 판단한다.
     기준 배율도 1.55 → 1.20으로 낮춰 적이 실제로 플레이어를 노린다 (graceOf 유예는 그대로).
     v5.21 — 2칸 건너(ring) 성은 침공 출발지에서 뺀다. 예전에는 경주 → 부산(재야) → 완산처럼
     길이 이어지지 않은 남의 성을 건너뛰어 치는 '점프 침공'이 나왔다.
     이제 같은 세력이라도 직접 도로·해로로 이어진 인접 성(adj)에서만 출진한다. */
  const INVASION_RATIO = 1.20;
  /* v5.29 — 한 달에 성 두 곳까지 동시에 침공받을 수 있다.
     예전에는 invasionWarn·pendingInvasion이 하나뿐이라 두 번째 침공이 아예 생기지 않았고,
     행군 도착과 겹치면 늦은 쪽이 다음 달로 밀렸다.
     이제 경고는 s.invasionWarns(배열)에 쌓고, 실제 침공은 s.invasionQueue로 차례로 처리한다. */
  function invasionWarnList(s) {
    const list = [];
    if (Array.isArray(s.invasionWarns)) list.push(...s.invasionWarns);
    if (s.invasionWarn && !Array.isArray(s.invasionWarn)) list.push(s.invasionWarn);   // 옛 저장 호환
    return list.filter(Boolean);
  }
  SK.invasionWarnList = invasionWarnList;
  function planPlayerInvasion(s) {
    if ((s.turn || 1) <= graceOf(s)) return [];
    const pendingTargets = new Set((invasionWarnList(s) || []).map((w) => w.target));
    if (s.pendingInvasion) pendingTargets.add(s.pendingInvasion.target);
    const MAX_WARN = 2;
    if (pendingTargets.size >= MAX_WARN) return [];
    const turn = s.turn || 0;
    const found = [];
    SK.CITY_LIST.forEach((pc) => {
      if (s.cities[pc.id].owner !== PF()) return;
      if (pendingTargets.has(pc.id)) return;
      const adj = SK.allNeighbors(pc.id);
      const byF = {};
      adj.forEach((aid) => {
        const as = s.cities[aid];
        if (!as || as.owner === PF() || as.owner === 'neutral') return;
        if (s.truce && s.truce[as.owner] > turn) return;
        const strength = (as.troops || 0) - AI_CITY_RESERVE;
        if (strength < 800) return;
        (byF[as.owner] = byF[as.owner] || []).push({ id: aid, strength, front: true });
      });
      Object.keys(byF).forEach((fid) => {
        const crew = byF[fid].sort((a, b) => b.strength - a.strength || (b.front ? 1 : 0) - (a.front ? 1 : 0));
        const lead = crew.find((c) => c.front) || crew[0];
        const sum = crew.reduce((a, c) => a + c.strength, 0);
        const ratio = sum / cityPower(s.cities[pc.id]);
        if (ratio < INVASION_RATIO) return;
        found.push({
          from: lead.id, target: pc.id, faction: fid, ratio,
          troops: Math.round(sum * 0.7),
          helpers: crew.filter((c) => c.id !== lead.id).slice(0, 2).map((c) => c.id),
        });
      });
    });
    /* 성 하나당 가장 센 세력 하나씩, 비율이 높은 순서로 남은 자리만큼 */
    const byTarget = {};
    found.forEach((f) => { if (!byTarget[f.target] || f.ratio > byTarget[f.target].ratio) byTarget[f.target] = f; });
    const best = Object.values(byTarget).sort((a, b) => b.ratio - a.ratio)
      .slice(0, Math.max(0, MAX_WARN - pendingTargets.size));
    if (!best.length) return [];
    const list = invasionWarnList(s).concat(best.map((b) => Object.assign({ turn: s.turn }, b)));
    s.invasionWarns = list;
    s.invasionWarn = null;
    return best;
  }

  function runAiCampaigns(s) {
    const news = [];
    if (!s) return news;
    /* 1) 지난달 경고는 이번 달 실제 침공으로 이어진다 (여러 성이면 대기열에 차례로) */
    const warns = invasionWarnList(s);
    if (warns.length) {
      warns.forEach((w) => {
        const ts = s.cities[w.target], as = s.cities[w.from];
        if (!(ts && as && ts.owner === PF() && as.owner === w.faction)) return;
        /* v5.13 — 예고한 인접+주변 성이 함께 출진한다 (경고 병력과 실제 병력이 어긋나지 않게) */
        const helpers = (w.helpers || []).filter((id) => { const hs = s.cities[id]; return hs && hs.owner === w.faction; });
        let commit = Math.round((as.troops || 0) * 0.55);
        as.troops = Math.max(AI_CITY_RESERVE, (as.troops || 0) - commit);
        helpers.forEach((id) => {
          const hs = s.cities[id];
          const part = Math.round(Math.max(0, (hs.troops || 0) - AI_CITY_RESERVE) * 0.45);
          hs.troops = Math.max(AI_CITY_RESERVE, (hs.troops || 0) - part);
          commit += part;
        });
        SK.pushInvasion(s, {
          from: w.from, target: w.target, faction: w.faction,
          troops: Math.max(1200, commit), turn: s.turn, helpers,
        });
        news.push({ kind: 'invasion', text: `${SK.josa(SK.factionName(w.faction), 'i')} ${SK.josa(CITY[w.target].name, 'euro')} 진군했습니다 — 수성전` });
      });
      s.invasionWarn = null;
      s.invasionWarns = [];
    }
    if ((s.turn || 1) <= graceOf(s)) return news;
    /* 2) 다른 세력·중립 성 침공 — 한 달 최대 2건 */
    const fids = Object.keys(s.factions || {}).filter((k) => k !== 'neutral' && k !== PF());
    const order = fids.slice().sort(() => Math.random() - 0.5);
    let raids = 0;
    order.forEach((fid) => {
      if (raids >= 2) return;
      const plan = aiAttackPlan(s, fid);
      if (!plan) return;
      const r = resolveAiRaid(s, plan, fid);
      raids += 1;
      news.push({
        kind: r.win ? 'capture' : 'repelled',
        text: r.win
          ? `${SK.josa(SK.factionName(fid), 'i')} ${SK.josa(CITY[r.target].name, 'eul')} 차지했습니다`
          : `${SK.factionName(fid)}의 공격을 ${SK.josa(CITY[r.target].name, 'i')} 막아냈습니다`,
      });
    });
    /* 3) 플레이어 접경 성에 대한 첩보 경고 (한 달 두 곳까지) */
    const warned = planPlayerInvasion(s);
    (warned || []).forEach((w) => {
      news.push({ kind: 'warn', text: `첩보 — ${SK.josa(SK.factionName(w.faction), 'i')} ${CITY[w.from].name}에 병력을 모읍니다. ${SK.josa(CITY[w.target].name, 'eul')} 노립니다` });
    });
    if (news.length) s.aiNews = (s.aiNews || []).concat(news).slice(-6);
    return news;
  }
  SK.runAiCampaigns = runAiCampaigns;
  SK.planPlayerInvasion = planPlayerInvasion;   // v5.13 — 침공 판단 점검용
  SK.cityPower = cityPower;

  /* ══════════════════════════════════════════════════════════════
     v5.10 — 적 AI 세력도 달마다 내정·등용·장수 성장을 함께 굴린다
     · 병력·성벽뿐 아니라 농업·상업·치안이 오르고, 재야 인재를 등용한다
     · 소속 장수는 아군과 같은 눈금으로 경험치·공훈치를 쌓아 레벨이 오른다
     ══════════════════════════════════════════════════════════════ */
  function aiGenBook(cs) {
    if (!cs.genLv) cs.genLv = {};
    if (!cs.genExp) cs.genExp = {};
    if (!cs.genMerit) cs.genMerit = {};
    return cs;
  }
  /* 성을 지키는 적 장수의 레벨 (전투에서 그대로 쓴다). 어려움 난이도는 소폭 보정 */
  function enemyGenLevel(cityId, genId) {
    const s = SK.state;
    const cs = s && s.cities ? s.cities[cityId] : null;
    let lv = (cs && cs.genLv && Number(cs.genLv[genId])) || 1;
    if (s && s.difficulty === 'hard') lv += 1;
    return clamp(Math.round(lv), 1, 30);
  }
  SK.enemyGenLevel = enemyGenLevel;

  function runAiDomestic(s) {
    const news = [];
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (!st || st.owner === PF() || st.owner === 'neutral') return;
      /* 군비 */
      st.troops = Math.min(cityCap(st), Math.round((st.troops || 0) * 1.04 + 120));
      st.pop = Math.round((st.pop || 10000) * 1.003);
      if (st.def < 95 && Math.random() < 0.4) st.def = Math.min(95, st.def + 1);
      /* 내정 — 농업·상업·치안 */
      if (st.agri < 95) st.agri = clamp(Math.round((st.agri || 50) + (Math.random() < 0.62 ? 1 : 0)), 0, 100);
      if (st.comm < 95) st.comm = clamp(Math.round((st.comm || 50) + (Math.random() < 0.62 ? 1 : 0)), 0, 100);
      const oq = st.order == null ? 55 : st.order;
      if (oq < 92) st.order = clamp(Math.round(oq + (Math.random() < 0.45 ? 1 : 0)), 0, 100);
      if (st.loyalty < 82 && Math.random() < 0.35) st.loyalty = clamp(st.loyalty + 1, 0, 100);
      /* 장수 성장 — 경험치·공훈치·레벨업 */
      aiGenBook(st);
      (st.genIds || []).forEach((gid) => {
        let lv = Number(st.genLv[gid]) || 1;
        let exp = (Number(st.genExp[gid]) || 0) + 26 + Math.floor(Math.random() * 18);
        let guard = 0;
        while (lv < 30 && exp >= SK.expNeed(lv) && guard++ < 40) { exp -= SK.expNeed(lv); lv += 1; }
        st.genLv[gid] = lv;
        st.genExp[gid] = Math.round(exp);
        st.genMerit[gid] = (Number(st.genMerit[gid]) || 0) + 2;
      });
      /* 재야 인재 등용 — 가끔, 성 장수가 비좁지 않을 때 */
      st.talents = st.talents || [];
      if (st.talents.length && (st.genIds || []).length < 5 && Math.random() < 0.18) {
        const gid = st.talents[0];
        const g = SK.GEN_BY_ID[gid];
        if (g && !SK.isDead(gid, g.name)) {
          st.talents.shift();
          st.genIds = (st.genIds || []).concat([gid]);
          aiGenBook(st);
          st.genLv[gid] = 1;
          st.genExp[gid] = 0;
          st.genMerit[gid] = 0;
          if (g.tier === 'S' || g.tier === 'A') {
            news.push({ kind: 'recruit',
              text: `${c.name}에서 ${josa(SK.factionName(st.owner), 'i')} ${josa(g.name, 'eul')} 등용했습니다` });
          }
        }
      }
    });
    return news;
  }
  SK.runAiDomestic = runAiDomestic;

  /* 수성전에 내보낼 부대 — 주둔 장수와 수비병을 나눠 편성 */
  function defenseUnits(cityId) {
    const s = SK.state;
    const st = s.cities[cityId];
    const gens = cityGens(cityId).slice()
      .sort((a, b) => (b.tong * 0.6 + b.wu * 0.4) - (a.tong * 0.6 + a.wu * 0.4))
      .slice(0, 6);
    const total = Math.floor(st.troops || 0);
    const units = [];
    const used = () => units.reduce((a, u) => a + u.troops, 0);
    if (gens.length) {
      const per = Math.max(400, Math.round(total / gens.length / 100) * 100);
      gens.forEach((h) => {
        const room = total - used();
        if (room < 300) return;
        units.push({ kind: 'hero', uid: h.uid, troops: Math.min(SK.troopCapOf(h), per, room) });
      });
    }
    let rest = total - used();
    let guard = 0;
    while (rest >= 500 && units.length < 8 && guard++ < 8) {
      const t = Math.min(2000, rest);
      units.push({ kind: 'regiment', cls: 'changbyung', name: `${CITY[cityId].name} 수비병`, troops: t });
      rest -= t;
    }
    return units;
  }
  SK.defenseUnits = defenseUnits;

  /* ══════════════════════════════════════════════════════════════
     v5.10 — 적 인접 성 지원군 (플레이어의 [지원군 파견]에 대한 맞대응)
     · 같은 세력의 인접 성에 여유 병력(4,000+)과 장수가 있으면 수성전에 합류
     · 원 성에서 병력을 실제로 빼 가므로, 막아내면 그 성이 약해진다
     ══════════════════════════════════════════════════════════════ */
  function aiSupportCandidates(targetId) {
    const s = SK.state;
    if (!s) return [];
    const ts = s.cities[targetId];
    if (!ts || ts.owner === PF() || ts.owner === 'neutral') return [];
    const out = [];
    (SK.allNeighbors(targetId) || []).forEach((nid) => {
      if (nid === targetId) return;
      const ns = s.cities[nid];
      if (!ns || ns.owner !== ts.owner) return;
      const troops = Math.round(ns.troops || 0);
      if (troops < 4000) return;
      const gens = (ns.genIds || []).map((id) => SK.GEN_BY_ID[id]).filter(Boolean);
      if (!gens.length) return;
      out.push({ id: nid, name: CITY[nid].name, troops, gens });
    });
    return out;
  }
  SK.aiSupportCandidates = aiSupportCandidates;

  /* 실제 합류 편성 — 70% 확률로 성당 한 번, 원 성에서 병력을 실제로 빼 간다 */
  function rollAiSupport(targetId, opts) {
    const s = SK.state;
    const cands = aiSupportCandidates(targetId);
    if (!cands.length) return [];
    const force = !!(opts && opts.force);
    const picks = [];
    cands.slice(0, 2).forEach((c) => {
      if (!force && Math.random() > 0.7) return;
      const ns = s.cities[c.id];
      const send = Math.max(1200, Math.round((ns.troops || 0) * 0.45));
      ns.troops = Math.max(600, Math.round((ns.troops || 0) - send));
      const gens = c.gens.slice().sort((a, b) => (SK.TIER_LV[b.tier] || 3) - (SK.TIER_LV[a.tier] || 3)).slice(0, 2);
      picks.push({
        from: c.id, name: c.name, troops: send,
        genIds: gens.map((g) => g.id),
        gens: gens.map((g) => ({ id: g.id, name: g.name, lv: enemyGenLevel(c.id, g.id) })),
      });
    });
    return picks;
  }
  SK.rollAiSupport = rollAiSupport;

  /* ══════════════════════════════════════════════════════════════
     v5.9 — 인접 아군 성 [지원군 파견]
     적 침공 첩보·수성전 때, 육로/해로로 이어진 내 성에서 장수와 병력을 보내
     수비 부대에 합류시킨다. 전투가 끝나면 살아남은 원군은 원래 성으로 돌아간다.
     ══════════════════════════════════════════════════════════════ */
  function reinforceNeighbors(cityId) {
    const s = SK.state;
    if (!s) return [];
    const land = new Set(SK.neighbors(cityId) || []);
    const sea = new Set(SK.seaNeighbors(cityId) || []);
    const out = [];
    (SK.allNeighbors(cityId) || []).forEach((id) => {
      const cs = s.cities[id];
      if (!cs || cs.owner !== PF() || id === cityId) return;
      if (out.some((o) => o.id === id)) return;
      const gens = cityGens(id).length;
      const troops = Math.round(cs.troops || 0);
      if (troops < 300 && !gens) return;
      out.push({ id, name: CITY[id].name, via: land.has(id) ? '육로' : (sea.has(id) ? '해로' : '길'), troops, gens });
    });
    return out;
  }
  SK.reinforceNeighbors = reinforceNeighbors;

  function openReinforce(targetId) {
    const s = SK.state;
    const list = reinforceNeighbors(targetId);
    if (!list.length) { SK.toast('옆 성에 보낼 병력이나 장수가 없습니다.'); return; }
    const inv = s.pendingInvasion;
    const rows = list.map((o) => `<button class="rfg-row" data-c="${o.id}">
        <span class="rr-flag">${o.via}</span>
        <span class="rr-main"><b>${o.name}</b><em>주둔병 ${fmt(o.troops)} · 장수 ${o.gens}명</em></span>
        <span class="rr-go">▸</span></button>`).join('');
    const m = SK.modal({
      kicker: `${CITY[targetId].name} 위급`, title: '어느 성에서 보낼까',
      body: `<p class="talent-note">${inv ? `적 병력 <b>${fmt(inv.troops)}</b> — ` : ''}육로·해로로 이어진 내 성에서 장수와 병력을 보내 수성전에 합류시킵니다. 전투가 끝나면 살아남은 원군은 원래 성으로 돌아갑니다.</p>
        <div class="rfg-list">${rows}</div>`,
      wide: true, actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('.rfg-row').forEach((b) => {
      b.onclick = () => { m.close(); setTimeout(() => openReinforcePick(targetId, b.dataset.c), 130); };
    });
  }
  SK.openReinforce = openReinforce;

  function openReinforcePick(targetId, srcId) {
    const s = SK.state;
    const cs = s.cities[srcId];
    const c = CITY[srcId];
    const gens = cityGens(srcId);
    const pool = Math.max(0, Math.round(cs.troops || 0) - 300);
    let send = Math.min(pool, Math.max(pool >= 600 ? 600 : 0, Math.round(pool * 0.5 / 100) * 100));
    const picked = [];
    const genRows = gens.length ? gens.map((g) => `<button class="rp-gen" data-uid="${g.uid}">
        <img src="${SK.ptSrc(g.portrait)}" alt="">
        <span class="rp-main"><b>${g.name}</b><em>${SK.CLASSES[g.cls].name} · Lv.${g.lv}</em><i>통${g.tong} 무${g.wu} 지${g.ji}</i></span>
        <em class="rp-tick">＋</em></button>`).join('')
      : '<p class="empty-gens">이 성에 장수가 없습니다 — 병력만 보냅니다.</p>';
    const m = SK.modal({
      kicker: `${c.name} → ${CITY[targetId].name}`, title: '지원군 편성',
      body: `<div class="rfg-pick">
        <div class="rp-head"><b>보낼 장수</b><em>최대 3명 · 눌러서 고르기</em></div>
        <div class="rp-gens">${genRows}</div>
        <div class="rp-troops">
          <div class="rp-row"><span>보낼 병력</span><b id="rp-val">${fmt(send)}</b><em>/ ${fmt(pool)}명</em></div>
          <input type="range" id="rp-range" min="0" max="${pool}" step="100" value="${send}" />
        </div>
        <p class="talent-note" id="rp-note">남는 병력은 성에 둡니다. 원군은 수성전에서 함께 싸우고, 끝나면 이 성으로 돌아옵니다.</p>
      </div>`,
      wide: true,
      actions: [
        { label: '취소' },
        { label: '파견', primary: true, onClick: () => { dispatchReinforce(targetId, srcId, picked, send); } },
      ],
    });
    const range = m.el.querySelector('#rp-range');
    const val = m.el.querySelector('#rp-val');
    if (range) range.oninput = () => { send = Number(range.value) || 0; if (val) val.textContent = fmt(send); };
    m.el.querySelectorAll('.rp-gen').forEach((b) => {
      b.onclick = () => {
        const uid = b.dataset.uid;
        const i = picked.indexOf(uid);
        if (i >= 0) picked.splice(i, 1);
        else if (picked.length >= 3) { SK.sfx.play('deny'); SK.toast('장수는 3명까지 보낼 수 있습니다.'); return; }
        else picked.push(uid);
        b.classList.toggle('on', picked.indexOf(uid) >= 0);
        const tick = b.querySelector('.rp-tick');
        if (tick) tick.textContent = picked.indexOf(uid) >= 0 ? '✓' : '＋';
        SK.sfx.play('ui');
      };
    });
  }
  SK.openReinforcePick = openReinforcePick;

  function dispatchReinforce(targetId, srcId, uids, troops) {
    const s = SK.state;
    const cs = s.cities[srcId];
    if (!cs) return;
    const sel = (uids || []).map((u) => s.heroes.find((h) => h.uid === u)).filter(Boolean).slice(0, 3);
    const total = Math.max(0, Math.min(Math.round(troops || 0), Math.round(cs.troops || 0)));
    const units = [];
    if (sel.length) {
      const per = Math.max(400, Math.floor(total / sel.length / 100) * 100);
      sel.forEach((h) => units.push({ kind: 'hero', uid: h.uid, troops: Math.min(SK.troopCapOf(h), per) }));
    }
    let rest = total - units.reduce((a, u) => a + u.troops, 0);
    let guard = 0;
    while (rest >= 500 && units.length < 8 && guard++ < 8) {
      const t = Math.min(2000, rest);
      units.push({ kind: 'regiment', cls: 'changbyung', name: `${CITY[srcId].name} 원군`, troops: t });
      rest -= t;
    }
    const sent = units.reduce((a, u) => a + u.troops, 0);
    if (!units.length) { SK.toast('보낼 병력이나 장수를 고르세요.'); return; }
    cs.troops = Math.max(0, Math.round(cs.troops || 0) - sent);
    sel.forEach((h) => { releaseDuty(srcId, h.uid); h.rfgTo = targetId; });
    s.reinforce = { target: targetId, from: srcId, units, turn: s.turn };
    SK.save();
    SK.refreshHud();
    SK.sfx.play('month');
    SK.toast(`${CITY[srcId].name}에서 원군 ${fmt(sent)}명${sel.length ? ` · 장수 ${sel.length}명` : ''}이 달려갑니다.`);
    if (s.pendingInvasion && !document.querySelector('#modal-root .modal-layer')) setTimeout(openPendingInvasion, 260);
  }
  SK.dispatchReinforce = dispatchReinforce;

  /* ══════════════════════════════════════════════════════════════
     v5.32 — 침공 [요격 출진]: 성문을 닫고 기다리는 대신, 성 밖 길목에서 먼저 맞는다.
     · 이기면 성벽 피해 없이 침공이 꺾이고 적 잔여 병력은 출발 성으로 쫓겨난다
     · 지면 살아남은 아군은 성으로 물러나고, 줄어든 적 병력으로 수성전이 이어진다
     ══════════════════════════════════════════════════════════════ */
  function openInterceptSortie(inv) {
    const s = SK.state;
    const cid = inv.target;
    const c = SK.CITY[cid], ts = s.cities[cid];
    if (!c || !ts) return;
    const gens = cityGens(cid).slice().sort((a, b) => ((b.tong || 60) + (b.wu || 60)) - ((a.tong || 60) + (a.wu || 60)));
    const avail = Math.floor(ts.troops || 0);
    if (!gens.length || avail < 1200) {
      SK.sfx.play('deny');
      SK.toast('요격 나갈 장수와 병력이 부족합니다 (병력 1,200 이상 필요).');
      return;
    }
    const itype = interceptTypeFor({ origin: inv.from, target: cid });
    const idef = SK.BATTLE_TYPES[itype] || SK.BATTLE_TYPES.plain;
    const keep = Math.max(600, Math.round(avail * 0.3));       // 성에 남길 병력
    const budget = Math.max(0, avail - keep);
    const picked = new Set(gens.slice(0, Math.min(5, gens.length)).map((g) => g.uid));
    const perOf = (n) => Math.max(300, Math.min(3000, Math.floor(budget / Math.max(1, n) / 100) * 100));
    const sumOf = () => { const n = picked.size; const per = perOf(n); return per * n; };

    const render = (m) => {
      const n = picked.size;
      const per = perOf(n);
      const send = sumOf();
      const rows = gens.map((g, i) => {
        const on = picked.has(g.uid);
        return `<button class="target-card ex-pick ${on ? 'on' : ''}" data-pick="${g.uid}">
          <span class="ex-check ${on ? 'on' : ''}">✓</span>
          <img class="tc-portrait gold" src="${SK.ptSrc(g.portrait)}" alt="">
          <div class="tc-main"><b>${g.name}${i === 0 ? ' <em class="duty-reco">추천</em>' : ''}</b>
            <span>${SK.CLASSES[g.cls].name} · Lv.${g.lv}${dutyTail(cid, g)}</span></div>
          <div class="tc-troops"><span>통 ${g.tong} · 무 ${g.wu}</span><b>${fmt(on ? per : 0)}</b></div>
          <span class="tc-go">▸</span></button>`;
      }).join('');
      const wrap = m.el.querySelector('#is-wrap');
      wrap.innerHTML = `<p class="talent-note">길목 지형 — <b>${idef.name}</b> · ${idef.desc}<br>${idef.skill || ''}</p>
        <div class="is-sum"><span>출진 <b>${n}명</b></span><span>나갈 병력 <b>${fmt(send)}</b></span><span>성에 남는 병력 <b>${fmt(avail - send)}</b></span></div>
        <div class="target-list">${rows}</div>
        <button class="ex-go" id="is-go" ${n && send <= budget ? '' : 'disabled'}>요격 출진 — ${fmt(send)}으로 맞이한다</button>`;
      wrap.querySelectorAll('[data-pick]').forEach((b) => {
        b.onclick = () => {
          const uid = b.dataset.pick;
          if (picked.has(uid)) picked.delete(uid); else picked.add(uid);
          SK.sfx.play('ui');
          render(m);
        };
      });
      const go = wrap.querySelector('#is-go');
      if (go) go.onclick = () => {
        if (!picked.size) { SK.toast('요격에 나갈 장수를 한 명 이상 고르세요.'); return; }
        const units = gens.filter((g) => picked.has(g.uid)).map((g) => ({ kind: 'hero', uid: g.uid, troops: per }));
        const total = units.reduce((a, u) => a + u.troops, 0);
        if (total > budget) { SK.toast('나갈 병력이 너무 많습니다 — 장수를 줄이세요.'); return; }
        ts.troops = Math.max(0, avail - total);
        SK.save();
        SK.startBattle({
          origin: cid, targetId: cid, type: itype, units,
          intercept: { name: `${SK.CITY[inv.from] ? SK.CITY[inv.from].name : '적'} → ${c.name} 길목`, troops: inv.troops, invasion: inv },
        });
      };
    };
    const m = SK.modal({
      kicker: `${c.name} 요격 출진 · ${SK.factionName(inv.faction)}의 침공`,
      title: '누구를 길목에 세울까',
      body: `<div id="is-wrap"></div>`,
      wide: true, actions: [{ label: '취소' }],
    });
    render(m);
  }
  SK.openInterceptSortie = openInterceptSortie;

  function openPendingInvasion() {
    const s = SK.state;
    if (!s || !s.pendingInvasion) return;
    if (document.querySelector('#modal-root .modal-layer')) return;
    const inv = s.pendingInvasion;
    const ts = s.cities[inv.target];
    if (!ts || ts.owner !== PF()) { s.pendingInvasion = null; SK.save(); setTimeout(() => { if (SK.chainPendingEvents) SK.chainPendingEvents(); }, 160); return; }
    const c = CITY[inv.target];
    const f = SK.factionInfo(inv.faction);
    const gens = cityGens(inv.target);
    /* v5.29 — 같은 달에 더 들어오는 침공이 있으면 미리 알린다 */
    const more = (s.invasionQueue || []).filter((q) => q && s.cities[q.target]);
    const moreLine = more.length ? `<div class="rfg-tip"><b>뒤이을 침공 ${more.length}곳</b><span>${more.map((q) => `${CITY[q.target].name}(${SK.factionName(q.faction)} ${fmt(q.troops)})`).join(' · ')} — 이 수성전을 마치면 이어서 벌어집니다</span></div>` : '';
    /* v5.9 — 옆 성에서 원군을 보낼 수 있는가 */
    const near = reinforceNeighbors(inv.target);
    const rfg = (s.reinforce && s.reinforce.target === inv.target) ? s.reinforce : null;
    const rfgTroops = rfg ? rfg.units.reduce((a, u) => a + (u.troops || 0), 0) : 0;
    const rfgGens = rfg ? rfg.units.filter((u) => u.uid).length : 0;
    const woundNow = Math.round(ts.wounded || 0);
    SK.modal({
      kicker: `${c.name} 위급`, title: `${SK.factionName(inv.faction)}의 침공`,
      body: `<div class="invasion-card">
        <h4>${SK.josa(f.name, 'i')} ${SK.josa(c.name, 'euro')} 진군했습니다</h4>
        <p>한 달 전 첩보대로 적이 움직였습니다. 성을 지킬지, 병력을 빼고 성을 내줄지 정하십시오. 강제로 성을 잃지는 않습니다.</p>
        ${moreLine}
        <div class="invasion-nums"><span>적 병력 <b>${fmt(inv.troops)}</b></span><span>우리 수비병 <b>${fmt(ts.troops)}</b></span><span>성벽 <b>${Math.round(ts.def)}</b></span><span>주둔 장수 <b>${gens.length}명</b></span>${woundNow ? `<span>부상병 <b>${fmt(woundNow)}</b></span>` : ''}</div>
        ${rfg ? `<div class="rfg-ready"><b>${CITY[rfg.from].name} 원군 대기</b><span>병력 ${fmt(rfgTroops)}${rfgGens ? ` · 장수 ${rfgGens}명` : ''} — 수성전에 함께 들어갑니다</span></div>`
          : (near.length ? `<div class="rfg-tip"><b>지원군을 보낼 수 있습니다</b><span>${near.map((o) => `${o.name}(${o.via}·${fmt(o.troops)})`).join(' · ')}</span></div>` : '')}
        <p class="talent-note">[수성전] — 격자 전장에서 성을 지킵니다. 출진 장수(최대 10명)와 자리(외성·망루·내성)를 먼저 고릅니다. 이기면 적을 물리치고, 지면 성을 잃고 남은 병력·장수는 가까운 내 성으로 물러납니다.</p>
        <p class="talent-note">[요격 출진] — 성 밖 길목으로 나가 적을 먼저 맞아 싸웁니다. 이기면 <b>성벽 피해 없이</b> 침공을 꺾고 적 잔여 병력은 출발 성으로 쫓겨납니다. 지면 살아남은 병력이 성으로 돌아오고, 줄어든 적과 수성전을 치릅니다. 병력 1,200 이상이 필요합니다.</p>
        <p class="talent-note">[철수] — 싸우지 않고 병력 85%와 장수를 가까운 내 성으로 빼고 성을 내줍니다.</p>
      </div>`,
      actions: [
        { label: '철수', onClick: () => surrenderCity(inv) },
        (s.marches || []).length ? { label: '긴급 회군', onClick: () => { setTimeout(() => SK.openRecall(inv.target), 120); } } : null,
        near.length || rfg ? { label: rfg ? '지원군 다시' : '지원군 파견', onClick: () => { if (rfg) { cancelReinforce(); } setTimeout(() => openReinforce(inv.target), 140); } } : null,
        (gens.length && (ts.troops || 0) >= 1200) ? { label: '요격 출진', onClick: () => { setTimeout(() => openInterceptSortie(inv), 160); } } : null,
        { label: rfg ? '수성전 (원군 합류)' : '수성전', primary: true, onClick: () => { setTimeout(() => openDefenseDeploy(inv), 140); } },
      ].filter(Boolean),
      dismissible: false,
    });
  }
  SK.openPendingInvasion = openPendingInvasion;

  function startDefense(inv, plan) {
    const s = SK.state;
    const units = (plan && plan.units && plan.units.length) ? plan.units : defenseUnits(inv.target);
    if (!units.length) {
      SK.toast('지킬 병력이 없습니다 — 철수합니다.');
      surrenderCity(inv);
      return;
    }
    const from = s.cities[inv.from] || {};
    /* v5.9 — 인접 성에서 보낸 원군을 수비 부대에 합류시킨다 */
    const rfg = (s.reinforce && s.reinforce.target === inv.target) ? s.reinforce : null;
    const all = rfg ? units.concat(rfg.units.map((u) => Object.assign({}, u, { rfg: 1 }))) : units;
    s.pendingInvasion = null;
    SK.save();
    SK.startBattle({
      origin: inv.target, targetId: inv.target, type: 'defense', units: all,
      defense: { faction: inv.faction, troops: inv.troops, from: inv.from, genIds: (from.genIds || []).slice(0, 1) },
      reinforce: rfg,
      /* v5.21 — 고르지 않아 성에 남긴 예비 병력 (이기면 성에 그대로 남는다) */
      reserve: (plan && plan.reserve) || 0,
    });
  }
  SK.startDefense = startDefense;

  /* ══════════════════════════════════════════════════════════════
     v5.21 — 수성전 배치: 최대 10명 출진 장수를 고르고 각자 설 자리를 정한다.
     · 외성(1중 성벽 안쪽 마당) · 망루(좌·우 망루) · 내성(2중 성벽·본진 앞)
     · 고르지 않은 장수의 병력과 10부대를 넘는 병력은 성에 남아 예비대가 된다
     ══════════════════════════════════════════════════════════════ */
  const DEF_ZONES = [
    { key: 'wall', name: '외성', mark: '성', desc: '1중 성벽 안쪽 마당 — 성문 앞을 막는다' },
    { key: 'tower', name: '망루', mark: '루', desc: '좌·우 망루 — 궁수·연노병이 성 밖을 쏜다' },
    { key: 'keep', name: '내성', mark: '내', desc: '성 안쪽 마지막 방어선 — 보조 병과는 성벽 바로 뒤 후방에서 지원' },
  ];
  function defZoneDefault(h) {
    const c = h && h.cls;
    if (c === 'gungsu' || c === 'yeonnobyung' || c === 'gunggi' || c === 'balseokcha' || c === 'pocha') return 'tower';
    if (c === 'chaeksa' || c === 'pungsusa' || c === 'dosa' || c === 'gunakdae' || c === 'muhui') return 'keep';
    return 'wall';
  }
  /* 고른 장수·자리로 부대를 짠다. 남는 부대 자리(최대 10부대)는 수비병 부대로 채운다 */
  function buildDefensePlan(cityId, pick, zones) {
    const s = SK.state;
    const st = s.cities[cityId];
    const avail = Math.floor(st.troops || 0);
    const MAXU = 10;
    const chosen = pick.map((uid) => s.heroes.find((h) => h.uid === uid)).filter(Boolean);
    const units = [];
    const used = () => units.reduce((a, u) => a + u.troops, 0);
    if (chosen.length) {
      const reserveSlots = Math.max(0, Math.min(3, MAXU - chosen.length));   // 수비병 부대 몫
      const per = Math.max(400, Math.round(avail / (chosen.length + reserveSlots) / 100) * 100);
      chosen.forEach((h) => {
        const room = avail - used();
        if (room < 300) return;
        const t = Math.min(SK.troopCapOf(h), per, room);
        units.push({ kind: 'hero', uid: h.uid, troops: t, zone: zones[h.uid] || defZoneDefault(h) });
      });
    }
    let rest = avail - used();
    let guard = 0;
    while (rest >= 500 && units.length < (chosen.length ? MAXU - 1 : 8) && guard++ < 10) {
      const t = Math.min(2000, rest);
      units.push({ kind: 'regiment', cls: 'changbyung', name: `${CITY[cityId].name} 수비병`, troops: t, zone: 'wall' });
      rest -= t;
    }
    return { units, reserve: Math.max(0, rest) };
  }
  function openDefenseDeploy(inv) {
    const s = SK.state;
    const cityId = inv.target;
    const c = CITY[cityId];
    const st = s.cities[cityId];
    const f = SK.factionInfo(inv.faction);
    const gens = cityGens(cityId).slice().sort((a, b) => (b.tong * 0.6 + b.wu * 0.4) - (a.tong * 0.6 + a.wu * 0.4));
    const rfg = (s.reinforce && s.reinforce.target === cityId) ? s.reinforce : null;
    const rfgIds = rfg ? (rfg.units || []).map((u) => u.uid).filter(Boolean) : [];
    const pool = gens.filter((h) => rfgIds.indexOf(h.uid) < 0);
    const MAXH = 10;
    const zones = {};
    pool.forEach((h) => { zones[h.uid] = defZoneDefault(h); });
    let pick = pool.slice(0, MAXH).map((h) => h.uid);
    const rfgTroops = rfg ? rfg.units.reduce((a, u) => a + (u.troops || 0), 0) : 0;
    const rfgGens = rfg ? rfg.units.filter((u) => u.uid).length : 0;

    const rowsHTML = () => pool.map((h) => {
      const on = pick.indexOf(h.uid) >= 0;
      const z = zones[h.uid] || defZoneDefault(h);
      return `<div class="def-row ${on ? 'on' : ''}" data-uid="${h.uid}">
        <img class="dr-pt" src="${SK.ptSrc(h.portrait)}" alt="">
        <div class="dr-main"><b>${h.name}</b><span>${SK.classTitle(h.cls, h.lv)} · Lv.${h.lv} · 통 ${h.tong} 무 ${h.wu}</span></div>
        <div class="dr-zones">${DEF_ZONES.map((zz) => `<button type="button" class="dz ${on && z === zz.key ? 'on' : ''}" data-z="${zz.key}" title="${zz.desc}">${zz.name}</button>`).join('')}</div>
        <button type="button" class="dr-toggle ${on ? 'on' : ''}" data-t="1" aria-label="출진">${on ? '출진' : '대기'}</button>
      </div>`;
    }).join('') || '<p class="empty-gens">주둔 장수가 없습니다. 수비병 부대만으로 성을 지킵니다.</p>';

    const summaryHTML = () => {
      const plan = buildDefensePlan(cityId, pick, zones);
      const heroN = plan.units.filter((u) => u.kind === 'hero').length;
      const regN = plan.units.length - heroN;
      const total = plan.units.reduce((a, u) => a + u.troops, 0);
      const byZone = { wall: 0, tower: 0, keep: 0 };
      plan.units.forEach((u) => { byZone[u.zone] = (byZone[u.zone] || 0) + 1; });
      return `<div class="def-sum">
        <div><span>출진 장수</span><b>${heroN} / ${MAXH}명</b></div>
        <div><span>수비병 부대</span><b>${regN}부대</b></div>
        <div><span>출진 병력</span><b>${fmt(total)}</b></div>
        <div><span>성에 남는 예비</span><b>${fmt(plan.reserve)}</b></div>
        <div><span>자리</span><b>외성 ${byZone.wall} · 망루 ${byZone.tower} · 내성 ${byZone.keep}</b></div>
      </div>`;
    };

    const m = SK.modal({
      kicker: `${c.name} 수성전 · ${SK.factionName(inv.faction)}의 침공`,
      title: '누가 어디서 지킬까',
      wide: true,
      body: `<div class="def-prep">
        <div class="invasion-nums"><span>적 병력 <b>${fmt(inv.troops)}</b></span><span>우리 수비병 <b>${fmt(st.troops)}</b></span><span>성벽 <b>${Math.round(st.def)}</b></span>${st.wounded ? `<span>부상병 <b>${fmt(Math.round(st.wounded))}</b></span>` : ''}</div>
        ${rfg ? `<div class="rfg-ready"><b>${CITY[rfg.from].name} 원군</b><span>병력 ${fmt(rfgTroops)}${rfgGens ? ` · 장수 ${rfgGens}명` : ''} — 함께 들어갑니다</span></div>` : ''}
        <p class="deploy-tip">출진할 장수를 고르고, 각자 설 자리를 정하세요. <b>외성</b>은 성문 안쪽 마당을 막고, <b>망루</b>는 좌우 망루에서 성 밖 적을 쏘며, <b>내성</b>은 마지막 방어선입니다 — 책사·풍수사·군악대 같은 보조 병과는 여기 서면 성벽 바로 뒤 후방에 자리해 1턴부터 성벽의 아군을 회복·지원합니다. 고르지 않은 장수의 병력은 성에 남아 예비대가 됩니다.</p>
        <div class="def-list" id="def-list">${rowsHTML()}</div>
        <div id="def-sum">${summaryHTML()}</div>
      </div>`,
      actions: [
        { label: '철수', onClick: () => surrenderCity(inv) },
        { label: '수성전 시작', primary: true, onClick: () => {
          const plan = buildDefensePlan(cityId, pick, zones);
          startDefense(inv, plan);
        } },
      ],
      dismissible: false,
    });
    const paint = () => {
      const list = m.el.querySelector('#def-list');
      if (list) list.innerHTML = rowsHTML();
      const sum = m.el.querySelector('#def-sum');
      if (sum) sum.innerHTML = summaryHTML();
      bind();
    };
    const bind = () => {
      m.el.querySelectorAll('.def-row').forEach((row) => {
        const uid = row.dataset.uid;
        row.querySelectorAll('.dz').forEach((b) => {
          b.onclick = (e) => {
            e.stopPropagation();
            if (pick.indexOf(uid) < 0) { SK.toast('먼저 출진을 켜십시오.'); return; }
            zones[uid] = b.dataset.z;
            paint();
          };
        });
        const tg = row.querySelector('.dr-toggle');
        if (tg) tg.onclick = (e) => {
          e.stopPropagation();
          const i = pick.indexOf(uid);
          if (i >= 0) pick.splice(i, 1);
          else {
            if (pick.length >= MAXH) { SK.toast(`출진 장수는 ${MAXH}명까지입니다.`); return; }
            pick.push(uid);
          }
          paint();
        };
      });
    };
    bind();
  }
  SK.openDefenseDeploy = openDefenseDeploy;

  /* 지원군 편성을 취소하고 원래 성으로 되돌린다 */
  function cancelReinforce() {
    const s = SK.state;
    const r = s.reinforce;
    if (!r) return;
    const home = s.cities[r.from];
    const back = (r.units || []).reduce((a, u) => a + (u.troops || 0), 0);
    if (home) home.troops = Math.min(cityCap(home), Math.round(home.troops || 0) + back);
    (r.units || []).forEach((u) => {
      if (!u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (h) delete h.rfgTo;
    });
    s.reinforce = null;
    SK.save();
  }
  SK.cancelReinforce = cancelReinforce;

  function surrenderCity(inv) {
    const s = SK.state;
    const c = CITY[inv.target];
    if (s.reinforce && s.reinforce.target === inv.target) cancelReinforce();
    const ts = s.cities[inv.target];
    const survivors = Math.round((ts.troops || 0) * 0.85);
    const res = loseCity(inv.target, inv.faction, {
      troops: survivors,
      garrison: Math.max(600, Math.round(inv.troops * 0.5)),
      genIds: (s.cities[inv.from] || {}).genIds || [],
    });
    s.pendingInvasion = null;
    s.fame = Math.max(0, (s.fame || 0) - 8);
    SK.save();
    SK.refreshHud();
    SK.showMap();
    if (window.SKMap) { try { SKMap.refresh(); } catch (e) { /* ignore */ } }
    /* v5.29 — 철수로 한 침공을 닫았으면 대기 중인 다음 침공을 이어서 연다 */
    setTimeout(() => { if (SK.chainPendingEvents) SK.chainPendingEvents(); }, 700);
    /* v5.20 — 마지막 성을 '철수'로 내주면 도시 0·수도 null인 채로 게임이 계속 돌던 문제.
       남은 원정대가 있으면 배수진을, 없으면 패망을 바로 연다. */
    const left = SK.CITY_LIST.filter((x) => s.cities[x.id].owner === PF()).length;
    if (!left) {
      const army = (s.marches || []).filter((m) => (m.units || []).some((u) => u.uid && u.troops > 0));
      if (army.length && SK.openLastStand) {
        SK.modal({
          kicker: '천하 패배 직전', title: '마지막 성을 내주었습니다',
          body: `<div class="result-modal lose"><div class="rm-seal">망</div>
            <p class="rm-line">성을 모두 내주었지만 밖에 나가 있던 원정 주력 <b>${army.length}부대</b>가 살아 있습니다.</p>
            <p class="rm-note">유랑군이 되어 성 하나를 되찾는 <b>배수진</b>에 한 번 도전할 수 있습니다.</p></div>`,
          actions: [{ label: '패망을 받아들인다', onClick: () => SK.gameOver('유랑군이 길에서 흩어졌습니다.') },
            { label: '유랑군 배수진', primary: true, onClick: () => SK.openLastStand() }],
          dismissible: false,
        });
        return;
      }
      SK.gameOver('마지막 성을 내주어 천하를 잃었습니다.');
      return;
    }
    SK.modal({
      kicker: '철수', title: `${SK.josa(c.name, 'eul')} 내주었습니다`,
      body: `<div class="result-modal lose"><div class="rm-seal">퇴</div>
        <p class="rm-line">싸우지 않고 병력과 장수를 빼냈습니다.${res.refuge ? ` 병력 ${fmt(res.moved)}과 장수들이 <b>${CITY[res.refuge].name}</b>으로 물러났습니다.` : ''}</p>
        <p class="rm-note">명성 −8 · 군량과 금은 그대로입니다.</p></div>`,
      actions: [{ label: '지도로', primary: true }],
    });
    SK.sfx.play('defeat');
  }
  SK.surrenderCity = surrenderCity;

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
      apply(s) { SK.CITY_LIST.forEach((c) => { const st = s.cities[c.id]; if (st.owner === PF()) st.troops = clamp(st.troops + 400, 0, cityCap(st)); }); return '전 거점 수비병 +400'; } },
    { title: '마을 축제', hanja: '락', text: '마을마다 풍악이 울리고 민심이 흡족합니다.',
      apply(s) { SK.CITY_LIST.forEach((c) => { const st = s.cities[c.id]; if (st.owner === PF()) st.loyalty = clamp(st.loyalty + 3, 0, 100); }); return '전 거점 민심 +3'; } },
  ];

  /* ══════════════════════════════════════════════════════════════
     v5.8 — 달 포대 선택지 이벤트
     달이 바뀔 때 일정 확률로 2~3개 선택지가 있는 사건이 열린다
     (상단 방문 · 홍수·역병 구제 · 재야 명장 소문)
     ══════════════════════════════════════════════════════════════ */
  function pickChoiceTreasure(s) {
    const owned = new Set(s.treasures || []);
    s.heroes.forEach((h) => Object.values(h.equip || {}).forEach((id) => owned.add(id)));
    const pool = SK.TREASURES.filter((t) => !owned.has(t.id) && (t.grade === '희귀' || t.grade === '영웅'));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  function ownedCitySample(s, n) {
    const list = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF());
    const out = [];
    while (list.length && out.length < n) out.push(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
    return out;
  }
  function choiceTalentPool(s) {
    const grp = poolGroupOf(PF());
    /* v5.32 — 돌발 선택지의 인재 제안도 소속 있는 장수를 재야로 데려오지 않는다 */
    const used = garrisonedIds(s);
    return SK.GENERALS.filter((g) => !used.has(g.id) && genPoolGroup(g) === grp
      && SK.debutOk(g, eraYearOf(s)) && !SK.isDead(g.id, g.name));
  }
  function rollChoiceEvent(s, forceKind) {
    if ((s.turn || 1) < 3) return null;
    if (!forceKind && Math.random() > 0.45) return null;
    const cap = CITY[s.playerCapital] || CITY[s.lastCity] || { name: '본성' };
    const kinds = ['merchant', 'disaster', 'talent'];
    const kind = forceKind || kinds[Math.floor(Math.random() * kinds.length)];
    if (kind === 'merchant') {
      const t = pickChoiceTreasure(s);
      const price = t ? (t.grade === '영웅' ? 900 : 600) : 0;
      return {
        id: 'merchant', seal: '商', title: '상단이 찾아왔다',
        text: t ? `서역 상단이 ${cap.name}에 들렀습니다. “값은 비싸도 물건은 확실합니다.” — ${t.grade} 등급 ${t.name}` : `서역 상단이 ${cap.name}에 들렀지만, 이번엔 살 만한 물건이 없습니다.`,
        options: [
          { label: t ? `보물을 산다 — 금 ${fmt(price)}` : '살 만한 물건이 없다', sub: t ? `${t.name} · ${t.effect}` : '이번 상단은 그냥 지나갑니다', disabled: !t || (s.gold || 0) < price,
            run: () => { if (!t) return '상단을 보냈습니다.'; s.gold -= price; s.treasures.push(t.id); s.fame += 2;
              SK.sfx.play('coin'); return `금 ${fmt(price)}을 주고 ${josa(t.name, 'eul')} 샀습니다. 보관함에 넣었습니다. 명성 +2`; } },
          { label: '그냥 보낸다', sub: '금을 아끼고 명성만 조금 챙깁니다',
            run: () => { s.fame += 1; return '값이 비싸 사지 않았습니다. 명성 +1.'; } },
        ],
      };
    }
    if (kind === 'disaster') {
      const cities = ownedCitySample(s, 2);
      const names = cities.map((c) => c.name).join(' · ');
      const gold = 400, food = 300;
      return {
        id: 'disaster', seal: '災', title: '홍수와 역병',
        text: `${names}에 큰비가 내리고 역병이 들었습니다. 곳간을 열어 백성을 구제할지, 아껴 군량을 지킬지 정해야 합니다.`,
        options: [
          { label: `구제한다 — 금 ${fmt(gold)} · 군량 ${fmt(food)}`, sub: '민심과 인구를 지킵니다', disabled: (s.gold || 0) < gold || (s.food || 0) < food,
            run: () => { s.gold -= gold; s.food -= food;
              cities.forEach((c) => { const st = s.cities[c.id]; st.loyalty = clamp(st.loyalty + 7, 0, 100); st.pop += Math.round(c.basePop || st.pop * 0.01); });
              s.fame += 4; SK.sfx.play('ui');
              return `${names}에 곡식을 풀고 의원을 보냈습니다. 민심 +7씩 · 명성 +4.`; } },
          { label: '아껴서 넘긴다', sub: '금과 군량을 지키지만 민심이 상합니다',
            run: () => { cities.forEach((c) => { const st = s.cities[c.id]; st.loyalty = clamp(st.loyalty - 7, 0, 100); st.pop = Math.max(6000, Math.round(st.pop * 0.97)); });
              s.fame = Math.max(0, s.fame - 2);
              return `${names}의 민심이 흔들렸습니다. 민심 −7 · 인구 −3% · 명성 −2.`; } },
        ],
      };
    }
    const pool = choiceTalentPool(s);
    const g = pool.length ? pool.sort((a, b) => SK.genScore(b) - SK.genScore(a))[Math.floor(Math.random() * Math.min(3, pool.length))] : null;
    const cost = g ? ({ S: 1200, A: 900, B: 650, C: 450 }[g.tier] || 650) : 0;
    return {
      id: 'talent', seal: '賢', title: '재야 명장의 소문',
      text: g ? `“${g.name}(${g.tier}급 ${SK.CLASSES[SK.genClass(g)].name})${hasBatchim(g.name) ? '이' : '가'} 이 근처에 숨어 지난다”는 소문이 돌았습니다. 예물을 갖춰 사람을 보낼 수 있습니다.` : '요즘은 눈에 띄는 재야 인재 소문이 없습니다.',
      options: [
        { label: g ? `사자를 보낸다 — 금 ${fmt(cost)}` : '소문이 없다', sub: g ? `성공하면 ${josa(g.name, 'i')} 합류합니다` : '다음 달을 기다립니다', disabled: !g || (s.gold || 0) < cost,
          run: () => {
            if (!g) return '그냥 넘겼습니다.';
            s.gold -= cost;
            const p = clamp(0.55 + Math.min(0.2, (s.fame || 0) * 0.00003), 0.2, 0.85);
            if (Math.random() < p) {
              const hero = makeHero(g.name, s.playerCapital, SK.genLv(g));
              if (hero) { hero.loyal = 70; s.heroes.push(hero); }
              s.fame += 5; SK.sfx.play('ui');
              return `${josa(g.name, 'i')} 예물을 받고 ${CITY[s.playerCapital] ? CITY[s.playerCapital].name : '본성'}으로 왔습니다. 명성 +5.`;
            }
            SK.sfx.play('deny');
            return `${josa(g.name, 'i')} 예물을 되돌려 보냈습니다. 금 ${fmt(cost)}만 나갔습니다.`;
          } },
        { label: '넘긴다', sub: '다음 기회를 노립니다',
          run: () => '소문만 듣고 넘겼습니다.' },
      ],
    };
  }

  /* 선택지 이벤트 모달 — 고를 때마다 효과를 보여 주고 after로 넘긴다 */
  function showChoiceEvent(ev, after) {
    const s = SK.state;
    if (!ev || !s) { if (after) after(); return; }
    const m = SK.modal({
      kicker: '돌발 사건', title: ev.title, wide: true, dismissible: false,
      body: `<div class="choice-card"><span class="cc-seal">${ev.seal}</span>
        <p class="cc-text">${ev.text}</p>
        <div class="cc-opts">${ev.options.map((o, i) => `<button class="cc-opt" data-i="${i}" ${o.disabled ? 'disabled' : ''}>
          <b>${o.label}</b><span>${o.sub || ''}</span></button>`).join('')}</div>
      </div>`,
      actions: [],
    });
    m.el.querySelectorAll('.cc-opt').forEach((b) => {
      b.onclick = () => {
        const o = ev.options[Number(b.dataset.i)];
        if (!o || o.disabled) return;
        const line = o.run ? o.run() : '';
        SK.save(); SK.refreshHud();
        m.close();
        setTimeout(() => {
          SK.modal({
            kicker: ev.title, title: '결과',
            body: `<p class="modal-p">${line}</p>`,
            actions: [{ label: '계속', primary: true, onClick: () => { if (after) after(); } }],
            dismissible: false,   // v5.28 — 결과창을 뒤로가기로 닫아도 다음 흐름이 증발하지 않게
          });
        }, 220);
      };
    });
  }

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

  /* v5.11 — 계절 판정. s.month는 0이 1월이다.
     봄 4~5월(벚꽃) · 여름 6~9월(신록) · 가을 10~11월(단풍) · 겨울 12~3월(설경) */
  const SEASON_KEYS = ['winter', 'winter', 'winter', 'spring', 'spring', 'summer',
    'summer', 'summer', 'summer', 'autumn', 'autumn', 'winter'];
  const SEASON_NAMES = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
  function seasonKeyOf(month) {
    const m = Number(month) || 0;
    return SEASON_KEYS[((m % 12) + 12) % 12];
  }
  function seasonOf(month) { return SEASON_NAMES[seasonKeyOf(month)]; }
  SK.seasonKeyOf = seasonKeyOf;
  SK.seasonOf = seasonOf;
  SK.seasonName = function (key) { return SEASON_NAMES[key] || '여름'; };
  /* 지금 계절 — 저장이 없으면 4월(봄)로 본다 */
  SK.currentSeason = function () { return seasonKeyOf(SK.state ? SK.state.month : 3); };

  function applyDomesticEvent(ev, s) {
    const eff = ev.effect || {};
    const cities = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF());
    const parts = [];
    const sign = (v) => (v > 0 ? '+' : '') + fmt(v);
    let gold = 0, food = 0, troops = 0, morale = 0;
    /* v5.4 — 한 달 이벤트의 금·군량은 세력 규모에 맞춰 줄인다.
       유지비 1개월(기준 240)을 1로 보아 0.35배로 잡는다 — 10월 대수확이 주 수입이고
       이벤트는 석 달치 안팎의 보태기·위기가 되게. */
    let taxBase = 0;
    cities.forEach((c) => { taxBase += (c.gold / 22 + 60) * econMul(c); });
    const fScale = clamp(upkeepOf(s) / 240, 0.55, 4.5);
    const gScale = clamp(taxBase / 600, 0.55, 4.5);
    if (eff.gold) { gold = Math.round(eff.gold * 0.35 * gScale); s.gold = Math.max(0, s.gold + gold); }
    if (eff.food) { food = Math.round(eff.food * 0.35 * fScale); s.food = Math.max(0, s.food + food); }
    if (eff.troops && cities.length) {
      const per = Math.round(eff.troops / cities.length);
      cities.forEach((c) => { const st = s.cities[c.id]; st.troops = clamp(st.troops + per, 0, cityCap(st)); });
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
        /* v5.11 — 행군·지원군·연병장 수련 중인 장수는 '대기'가 아니다 */
        if (h.marchId || h.rfgTo) return;
        if ((cs.trainCrew || []).indexOf(h.uid) >= 0) return;
        if (slots.some((sl) => sl.uid === h.uid || sl.deputy === h.uid)) return;
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
    if (s.over) { SK.toast('이미 천하를 잃었습니다. [새로 시작]으로 새 판을 열어 주세요.'); return; }
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
    if (!s || s.over) return;
    /* v5.26 — 월정산의 '세수−봉급'과 '실제 금고 증감'이 다를 때 이유를 보여 주려고 시직값을 잡아 둔다 */
    const goldStart = SK.totalGold(s), foodStart = SK.totalFood(s);
    const prevYear = s.eraYear || (195 + s.year);
    s.month += 1;
    if (s.month >= 12) { s.month = 0; s.year += 1; if (s.eraYear) s.eraYear += 1; }
    s.turn += 1;
    /* v5.27 — 새로 차지한 성에 장수가 들어와도 태수·군사가 비어 있어
       (성 화면을 열기 전까지) 자동 내정이 돌지 않았다. 달이 바뀌 때마다
       군주 우선 규칙으로 빈 태수·군사를 다시 앉힌다. */
    if (enforceLordGovernor(s)) SK.save();
    // 달이 바뀌기 전에 태수들이 남은 행동으로 내정을 마친다 (본성·태수 없는 성 제외)
    const autoLog = runAutoDomestic(s);
    let tax = 0, pop = 0, popGrowth = 0, popLoss = 0, unrest = 0, growCities = 0, shrinkCities = 0;
    const gPct = 1 + (SK.techPct ? SK.techPct('goldPct') : 0) / 100;
    const taxRate = taxRateOf(s);
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (st.owner !== PF()) return;
      const base = econMul(c);
      const morale = st.loyalty;
      // 민심이 좋으면 세수와 인구가 오르고, 나쁘면 줄고 소란이 난다
      const moraleMul = morale >= 70 ? 1.15 : morale < 40 ? 0.85 : 1;
      const incMul = 1 + cityTfx(c.id, 'income', 60) / 100;   // v5.31 — 보물 내정 수입
      const cityTax = Math.round((c.gold / 22 + morale * 1.1) * base * moraleMul * (0.85 + st.comm / 250) * gPct * taxRate.mul * incMul);
      tax += cityTax;
      st.gold = (st.gold || 0) + cityTax;   // v5.11 — 세수는 그 성 금고로
      // v5.5 — 인구는 민심·치안·농업·상업·시설 Lv 합을 함께 본다 (popMonthly)
      const growing = popMonthly(st, c);
      if (growing > 0) { popGrowth += growing; growCities += 1; }
      else if (growing < 0) { popLoss += -growing; shrinkCities += 1; }
      if (morale < 40) {
        unrest += 1;
        st.loyalty = clamp(st.loyalty - 1, 0, 100);
      }
      st.pop = Math.max(6000, st.pop + growing);
      pop += Math.round(160 * base);
      st.pop = Math.min(cityPopCap(c), st.pop);
      if (st.def < 100 && Math.random() < 0.25) st.def = clamp(st.def + 1, 0, 100);
      st.loyalty = clamp(st.loyalty + (Math.random() < 0.5 ? 1 : -1) + taxRate.loyal, 0, 100);
      st.troops = clamp(st.troops + 160, 0, cityCap(st));
      // 엉망인 성은 조금씩 스스로 회복한다
      if (st.agri < 45 && Math.random() < 0.3) st.agri = clamp(st.agri + 1, 0, 100);
      if (st.comm < 45 && Math.random() < 0.3) st.comm = clamp(st.comm + 1, 0, 100);
    });
    /* v5.12 — 대상인: 시장이 큰 성을 우선으로 가끔 찾아와 2개월 머문다.
       (남은 달은 grandMerchant에 저장. 군량 특가 + 보물 판매) */
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (!st || st.owner !== PF()) return;
      if (st.grandMerchant > 0) {
        st.grandMerchant -= 1;
        if (st.grandMerchant <= 0) { st.grandMerchant = 0; st.gmStock = []; }
      }
    });
    let gmVisit = null;
    if (Math.random() < 0.18) {
      const owned = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PF() && !(s.cities[c.id].grandMerchant > 0));
      if (owned.length) {
        const weight = (c) => {
          const sl = ((s.cities[c.id].slots) || []).find((x) => x.key === 'market');
          return sl ? 1 + (sl.lv || 1) * 1.6 : 1;
        };
        let tot = owned.reduce((a, c) => a + weight(c), 0), r = Math.random() * tot, chosen = owned[0];
        for (let i = 0; i < owned.length; i++) { r -= weight(owned[i]); if (r <= 0) { chosen = owned[i]; break; } }
        const csG = s.cities[chosen.id];
        csG.grandMerchant = 2;
        const ownedT = new Set(s.treasures || []);
        s.heroes.forEach((h) => Object.values(h.equip || {}).forEach((id) => ownedT.add(id)));
        const pool = SK.TREASURES.filter((t) => !ownedT.has(t.id));
        csG.gmStock = pool.slice().sort(() => Math.random() - 0.5).slice(0, 1 + (Math.random() < 0.4 ? 1 : 0)).map((t) => t.id);
        gmVisit = { city: chosen.name, id: chosen.id };
      }
    }
    /* v5.12 — 재야 토호의 수비병 회복. AI의 실패한 요격으로 300명까지 깎인
       공백지가 거저먹기 표적이 되지 않게, 달마다 6%(최소 30명)씩 제자리로 돌아간다. */
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (!st || st.owner !== 'neutral') return;
      const base = 1500 + (hashStr(c.id) % 1001);
      if (st.troops < base) st.troops = Math.min(base, Math.round((st.troops || 0) + Math.max(60, base * 0.1)));
    });
    s.fame += 3;
    const rank = SK.rankFor(s.fame);
    const rankGold = rank.salaryGold || 0;
    /* v5.10 — 적 세력도 달마다 병력·성벽·내정·등용·장수 레벨을 함께 굴린다 */
    const aiGrowNews = runAiDomestic(s);
    s.heroes.forEach((h) => {
      h.actedThisMonth = false;
      if (s.cities[h.city] && s.cities[h.city].owner === PF()) {
        h.hp = maxHpOf(h.cls, h.lv);
        h.mp = maxMpOf(h.cls, h.lv);
      }
    });
    /* v5.7 — 연병장 수련 명단은 이번 달 행동을 써서 경험치를 쌓는다 */
    const crewLog = runTrainCrew(s);
    /* v5.7 — AI 세력의 확장·공세 (플레이어 침공은 한 달 전 경고 뒤에 온다) */
    const aiNews = runAiCampaigns(s).concat(aiGrowNews || []);
    /* v5.28 — AI끼리 성을 빼앗아 0성이 된 세력 정리 + 소식 */
    try {
      (SK.pruneLandlessFactions ? SK.pruneLandlessFactions(s) : []).forEach((nm) => {
        aiNews.push({ kind: 'warn', text: `${SK.josa(nm, 'i')} 마지막 성을 잃고 천하에서 사라졌습니다` });
      });
    } catch (e) { /* ignore */ }
    // v5 — 건물 담당 장수는 이번 달 건물 일을 한 것으로 치고, 건물이 결산을 내놓는다
    /* v5.5 — [매달 최선]이 켜져 있으면 달이 바뀔 때 성마다 건물 배속을 다시 잡는다 */
    if (s.autoBestDuty) {
      SK.CITY_LIST.forEach((c) => {
        const st = s.cities[c.id];
        if (st.owner === PF()) autoAssignDuty(c.id, { silent: true });
      });
    }
    applyDuty(s);
    const slotLog = runSlots(s);
    /* v5.10 — 주점 배속: 반값 등용 협상 또는 보너스 탐색 */
    const tavernLog = runTavernDuty(s);
    const growth = [];
    slotLog.forEach((l) => (l.grow || []).forEach((g) => growth.push(g)));
    growth.sort((a, b) => (b.exp / b.need) - (a.exp / a.need));
    const marketGold = slotLog.reduce((a, x) => a + (x.gold || 0), 0);
    const farmGain = slotLog.reduce((a, x) => a + (x.food || 0), 0);
    /* ── v5.11 성별 금 결산: 세수·시장은 이미 각 성 금고에 들어갔다.
       장수 봉급은 그 장수가 있는 성에서, 관작 봉급은 수도에서 낸다. ── */
    const payroll = payrollOf(s);
    const goldNet = tax + marketGold + rankGold - payroll;
    const payByCity = {};
    s.heroes.forEach((h) => {
      const cid = (h.city && s.cities[h.city] && s.cities[h.city].owner === PF()) ? h.city : s.playerCapital;
      if (!cid || !s.cities[cid]) return;
      payByCity[cid] = (payByCity[cid] || 0) + heroSalary(h);
    });
    let goldShort = 0;
    Object.keys(payByCity).forEach((cid) => {
      const cs = s.cities[cid];
      if (!cs) return;
      const need = payByCity[cid];
      if ((cs.gold || 0) >= need) cs.gold -= need;
      else { goldShort += need - (cs.gold || 0); cs.gold = 0; }
    });
    const capCs = s.cities[s.playerCapital];
    if (capCs && capCs.owner === PF()) capCs.gold = (capCs.gold || 0) + rankGold;
    /* ── v5.11 성별 군량 결산: 농원 비축(runSlots) + 10월 대수확 − 그 성 병력 유지비 ── */
    const isHarvest = s.month === ECON.harvestMonth;
    const harvest = isHarvest ? harvestOf(s) : { total: 0, rows: [] };
    const harvestBy = {};
    harvest.rows.forEach((r) => { harvestBy[r.id] = (harvestBy[r.id] || 0) + r.food; });
    const marchUpBy = {};
    (s.marches || []).forEach((m) => {
      const t = (m.units || []).reduce((a, u) => a + (u.troops || 0), 0);
      const mo = m.origin || m.from; if (mo) marchUpBy[mo] = (marchUpBy[mo] || 0) + t;
    });
    let upkeep = 0, foodNet = 0, famine = null;
    /* v5.20 — 목록의 '군량 순'은 농원 비축(runSlots가 이미 각 성 창고에 넣은 양)까지 더한 값이어야
       상단 '월 군량'과 실제 창고 증감이 맞는다. (예전에는 유지비만 빠져 −193처럼 보였다) */
    foodNet += farmGain;
    SK.CITY_LIST.forEach((c) => {
      const cs = s.cities[c.id];
      if (!cs || cs.owner !== PF()) return;
      /* v5.31 — 보물 군량 소모 −N% (성 단위) */
      const foodCut = Math.min(0.4, cityTfx(c.id, 'supply', 40) / 100);
      const up = Math.ceil(((cs.troops || 0) + (marchUpBy[c.id] || 0)) / 1000 * ECON.upkeepPer1000 * (1 - foodCut));
      upkeep += up;
      const harv = harvestBy[c.id] || 0;
      foodNet += harv - up;
      cs.food = Math.round((cs.food || 0) + harv - up);
      if (cs.food < 0) {
        if (!famine) famine = { short: 0, lost: 0, cities: [] };
        famine.short += -cs.food;
        famine.cities.push(c.name);
        cs.food = 0;
        cs.loyalty = clamp(cs.loyalty - ECON.famineLoyalty, 0, 100);
        const lost = Math.round((cs.troops || 0) * ECON.famineDesert);
        cs.troops = Math.max(0, (cs.troops || 0) - lost);
        famine.lost += lost;
      }
    });
    /* v5.11 — 굶주리거나 금고가 빈 성에 이웃 내 성이 자동 보급 수송 */
    const supplyLog = autoSupplyNeighbors(s);
    /* v5.11 — 억류 포로: 충성 하락 · 탈출 · 몸값 제안 */
    const prisonNews = SK.prisonTick(s);
    const foodAfter = SK.totalFood(s);
    const troopsNow = totalTroops() + marchTroopsOf(s);
    // 해가 바뀌면 새로 성년이 된 명장이 주점에 나타난다
    let debuted = [];
    if (s.month === 0 && (s.eraYear || 0) !== prevYear) debuted = SK.refreshDebut(s);
    cityActorUid = null;
    const ev = rollMonthEvent(s);
    /* v5.8 — 달 포대 선택지 사건 (상단·홍수역병·재야 명장) */
    const choiceEv = rollChoiceEvent(s);
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
    /* v5.5 — 내정 수치는 모두 정수로 통일한다 (소수점 잔재 제거) */
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (!st) return;
      ['agri', 'comm', 'loyalty', 'order', 'def', 'train', 'pop', 'troops'].forEach((k) => {
        if (st[k] != null) st[k] = Math.round(st[k]);
      });
      (st.slots || []).forEach((sl) => { sl.exp = Math.round(sl.exp || 0); });
    });
    /* v5.9 — 부상병 회복: 달이 바뀌면 부상병의 35%(최소 200명)가 주둔병으로 돌아온다 */
    let woundHeal = 0;
    SK.CITY_LIST.forEach((c) => {
      const st = s.cities[c.id];
      if (!st || st.owner !== PF()) return;
      const w = Math.round(st.wounded || 0);
      if (!w) return;
      const cap = cityCap(st);
      const room = Math.max(0, cap - Math.round(st.troops || 0));
      const heal = Math.min(w, room, Math.max(Math.round(w * WOUND.healMonth), Math.min(w, WOUND.healMin)));
      if (heal <= 0) return;
      st.wounded = w - heal;
      st.troops = Math.round(st.troops || 0) + heal;
      woundHeal += heal;
    });
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
      dismissible: false,   // v5.25 — 바깥을 잘못 눌러 월정산이 닫혀도 뒤이을 사건(요격·침공·선택지)이 사라지지 않게
      kicker: SK.dateLabel(s.eraYear || (195 + s.year), s.month),
      title: '월정산',
      body: `<div class="month-report">
        <div class="mr-sec"><span>금</span><em>세수 · 봉급</em></div>
        <div class="mr-row"><span>도시 세수</span><b class="plus">금 +${fmt(tax)}</b></div>
        ${marketGold ? `<div class="mr-row"><span>시장 · 공방</span><b class="plus">금 +${fmt(marketGold)}</b></div>` : ''}
        <div class="mr-row"><span>관작 봉급 · ${rank.title}</span><b class="plus">금 +${fmt(rankGold)}</b></div>
        <div class="mr-row"><span>장수 봉급 <em>${(s.heroes || []).length}명 · 등급·레벨</em></span><b class="minus">금 −${fmt(payroll)}</b></div>
        <div class="mr-row total"><span>세수 − 봉급</span><b class="${goldNet >= 0 ? 'plus' : 'minus'}">${goldNet >= 0 ? '+' : '−'}${fmt(Math.abs(goldNet))}<em>전체 금고 ${fmt(SK.totalGold(s))}</em></b></div>
        ${(SK.totalGold(s) - goldStart) !== goldNet ? `<div class="mr-row"><span>이 달 실제 금고 <em>사건·거래 포함</em></span><b class="${SK.totalGold(s) - goldStart >= 0 ? 'plus' : 'minus'}">${SK.totalGold(s) - goldStart >= 0 ? '+' : '−'}${fmt(Math.abs(SK.totalGold(s) - goldStart))}<em>${fmt(goldStart)} → ${fmt(SK.totalGold(s))}</em></b></div>` : ''}
        ${goldShort ? `<div class="mr-row famine"><span>금고가 비었습니다</span><b class="minus">봉급 ${fmt(goldShort)} 미지급</b></div>` : ''}
        <div class="mr-sec"><span>군량</span><em>${s.month === ECON.harvestMonth ? '가을 대수확' : `대수확까지 ${monthsUntilHarvest(s)}개월`}</em></div>
        <div class="mr-row"><span>병력 유지 <em>${fmt(troopsNow)}명 · 1,000명당 ${ECON.upkeepPer1000}</em></span><b class="minus">군량 −${fmt(upkeep)}</b></div>
        ${farmGain ? `<div class="mr-row"><span>농원 비축</span><b class="plus">군량 +${fmt(farmGain)}</b></div>` : ''}
        ${isHarvest && harvest.total ? `<div class="mr-harvest"><span class="mh-ic">🌾</span>
          <div class="mh-main"><b>10월 가을 대수확!</b><span>${harvest.rows.slice(0, 6).map((r) => `${r.city} +${fmt(r.food)}`).join(' · ')}${harvest.rows.length > 6 ? ' 외' : ''}</span></div>
          <em>군량 +${fmt(harvest.total)}</em></div>` : ''}
        <div class="mr-row total"><span>군량 수지</span><b class="${foodNet >= 0 ? 'plus' : 'minus'}">${foodNet >= 0 ? '+' : '−'}${fmt(Math.abs(foodNet))}<em>전체 창고 ${fmt(SK.totalFood(s))}</em></b></div>
        ${(SK.totalFood(s) - foodStart) !== foodNet ? `<div class="mr-row"><span>이 달 실제 창고 <em>사건·거래 포함</em></span><b class="${SK.totalFood(s) - foodStart >= 0 ? 'plus' : 'minus'}">${SK.totalFood(s) - foodStart >= 0 ? '+' : '−'}${fmt(Math.abs(SK.totalFood(s) - foodStart))}<em>${fmt(foodStart)} → ${fmt(SK.totalFood(s))}</em></b></div>` : ''}
        ${famine ? `<div class="mr-row famine"><span>군량이 바닥났습니다!</span><b class="minus">민심 −${ECON.famineLoyalty} · 병력 −${fmt(famine.lost)} 이탈</b></div>` : ''}
        ${supplyLog.length ? `<div class="mr-auto"><p class="mr-auto-title">이웃 성 자동 보급</p>
          ${supplyLog.map((r) => `<div class="mr-auto-row"><b>${r.from} → ${r.to}</b><span>${r.text}</span></div>`).join('')}</div>` : ''}
        ${prisonNews.length ? `<div class="mr-auto"><p class="mr-auto-title">포로 동향 <em>탈출 · 몸값</em></p>
          ${prisonNews.map((n) => `<div class="mr-auto-row"><b>${n.kind === 'escape' ? '탈출' : n.kind === 'offer' ? '제안' : '종결'}</b><span>${n.text}</span></div>`).join('')}</div>` : ''}
        ${!isHarvest ? `<p class="mr-note">다음 가을 대수확까지 ${monthsUntilHarvest(s)}개월 — 그때 1년치 군량이 한 번에 들어옵니다. 그 전에는 [개간]과 [탐색]으로 버팁니다.</p>` : ''}
        <div class="mr-row"><span>징집</span><b>병 +${fmt(pop)}</b></div>
        ${woundHeal ? `<div class="mr-row"><span>부상병 회복</span><b class="plus">병 +${fmt(woundHeal)}</b></div>` : ''}
        ${growth.length ? `<div class="mr-grow">
          <p class="mr-grow-title">시설 성장 <em>경험이 차면 증축할 수 있습니다</em></p>
          ${growth.slice(0, 6).map((g) => `<div class="mr-grow-row${g.exp >= g.need ? ' up' : ''}">
            <b>${g.city} ${g.name} <i>Lv.${g.lv}</i></b>
            <span class="mg-bar"><i style="width:${Math.min(100, Math.round(g.exp / g.need * 100))}%"></i></span>
            <em>+${g.gain} <i>(${Math.round(g.exp)}/${g.need})</i>${g.exp >= g.need ? ' · 증축 가능!' : ''}</em>
          </div>`).join('')}
          ${growth.length > 6 ? `<p class="mr-note">${growth.length - 6}곳 더 있습니다.</p>` : ''}
        </div>` : ''}
        <div class="mr-row"><span>인구 <em>성장 ${growCities}곳 · 감소 ${shrinkCities}곳</em></span><b class="${popGrowth - popLoss >= 0 ? 'plus' : 'minus'}">${popGrowth - popLoss >= 0 ? '＋' : '−'}${fmt(Math.abs(popGrowth - popLoss))}</b></div>
        ${gmVisit ? `<div class="mr-auto"><p class="mr-auto-title">대상인 방문</p>
          <div class="mr-auto-row"><b>${gmVisit.city}</b><span>먼 길을 걸어온 대상인이 2개월 머뭅니다 — 군량 특가 · 보물 판매</span></div></div>` : ''}
        ${unrest ? `<div class="mr-row"><span>민심 흔들리는 성</span><b class="minus">${unrest}곳</b></div>` : ''}
        <div class="mr-row"><span>명성</span><b>+3</b></div>
        ${autoLog.length ? `<div class="mr-auto">
          <p class="mr-auto-title">태수 내정 보고</p>
          ${autoLog.map((l) => `<div class="mr-auto-row"><b>${l.city} ${l.gov}</b><span>${l.acts.map((a) => a.short).join(' · ')}</span></div>`).join('')}
        </div>` : ''}
        ${crewLog.length ? `<div class="mr-auto"><p class="mr-auto-title">연병장 수련</p>
          ${crewLog.slice(0, 6).map((l) => `<div class="mr-auto-row"><b>${l.city} ${l.name}</b><span>EXP +${l.gain}</span></div>`).join('')}${crewLog.length > 6 ? `<p class="mr-note">${crewLog.length - 6}명 더 수련했습니다.</p>` : ''}</div>` : ''}
        ${aiNews.length ? `<div class="mr-ai"><p class="mr-ai-title">천하 소식 — 다른 세력의 움직임</p>
          ${aiNews.map((n) => `<div class="mr-ai-row"><em>${n.kind === 'warn' ? '❗' : n.kind === 'invasion' ? '⚔' : n.kind === 'capture' ? '◈' : '·'}</em><span>${n.text}</span></div>`).join('')}</div>` : ''}
        ${ev ? `<div class="mr-event ${ev.type === '위기' ? 'crisis' : ''}"><span class="me-seal">${ev.hanja}</span>
          <div class="me-main"><b>${ev.title} <em class="me-season">${ev.type || ''} · ${ev.season || ''}</em></b><span>${ev.text}</span><em>${ev.gain}</em></div></div>` : ''}
        ${slotLog.some((l) => l.troops) ? `<div class="mr-auto"><p class="mr-auto-title">병영 징집</p>
          ${slotLog.filter((l) => l.troops).slice(0, 6).map((l) => `<div class="mr-auto-row"><b>${l.city}</b><span>수비병 +${fmt(l.troops)}</span></div>`).join('')}</div>` : ''}
        ${slotLog.some((l) => l.agri || l.comm) ? `<div class="mr-auto"><p class="mr-auto-title">농업·상업 성장 <em>배속 장수가 밀어 올렸습니다</em></p>
          ${slotLog.filter((l) => l.agri || l.comm).slice(0, 6).map((l) => `<div class="mr-auto-row"><b>${l.city}</b><span>${l.agri ? `농업 +${l.agri}` : ''}${l.agri && l.comm ? ' · ' : ''}${l.comm ? `상업 +${l.comm}` : ''}</span></div>`).join('')}</div>` : ''}
        ${tavernLog.length ? `<div class="mr-auto"><p class="mr-auto-title">주점 배속 <em>반값 등용 · 소문 탐색</em></p>
          ${tavernLog.slice(0, 6).map((l) => `<div class="mr-auto-row"><b>${l.city}</b><span>${l.text}${l.gain ? ` · ${l.gain}` : ''}</span></div>`).join('')}</div>` : ''}
        ${debuted.length ? `<div class="mr-event"><span class="me-seal">영</span><div class="me-main"><b>새 명장이 세상에 나왔습니다</b><span>${debuted.slice(0, 6).map((g) => g.name).join(' · ')}${debuted.length > 6 ? ' 외' : ''} — 각지 주점에 소문이 돕니다.</span></div></div>` : ''}
        <p class="mr-note">주둔 장수의 체력이 회복되고, 이번 달 행동력이 모두 돌아왔습니다. 태수가 앉은 성은 달이 바뀔 때 대기 장수로 내정을 마칩니다(본성 제외). 건물 담당 장수는 건물 일을 맡은 것으로 칩니다.</p>
      </div>`,
      actions: [{ label: '계속', primary: true, onClick: () => {
        const inv = () => { if (s.pendingInvasion) setTimeout(openPendingInvasion, 280); };
        const go = () => {
          if (SK.promoteMarchQueue) SK.promoteMarchQueue(s);
          if (s.pendingMarch) setTimeout(openPendingMarch, 280); else inv();
        };
        const flow = () => {
          if (s.pendingInvasion) { inv(); return; }
          if (tlEv) setTimeout(() => showTimelineCard(tlEv, false, go), 220);
          else setTimeout(go, 260);
        };
        /* v5.8 — 돌발 선택지 이벤트가 있으면 월정산 다음에 먼저 연다 */
        if (choiceEv) setTimeout(() => showChoiceEvent(choiceEv, flow), 200);
        else flow();
      } }],
    });
    /* v5.25 — 월정산이 어떤 이유로든 일찍 닫혀도 행군·침공 사건을 다시 띄운다 */
    if (s.pendingMarch || s.pendingInvasion) armPendingWatch();
  }

  /* ───────────── 메뉴 ───────────── */
  function openMenu() {
    const m = SK.modal({
      kicker: '군령',
      title: '메뉴',
      body: `<div class="menu-list">
        <button data-m="codex">도감 · 인물·보물 수집</button>
        <button data-m="roster">장수 명부 · 보물 · 배치</button>
        <button data-m="recall">원정 부대 · 긴급 회군</button>
        <button data-m="slots">세이브 슬롯 (5칸 + 자동)</button>
        <button data-m="help">조작법 보기</button>
        <button data-m="reset">처음부터 시작</button>
      </div>`,
      actions: [{ label: '닫기' }],
    });
    m.el.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.m;
        m.close();
        if (k === 'codex') SK.openCodex();
        if (k === 'recall') SK.openRecall(SK.state && (SK.state.purseCity || SK.state.lastCity));
        if (k === 'roster') SK.openRoster();
        if (k === 'help') SK.showHelp();
        if (k === 'slots') SK.openSaveSlots('save');
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
        <div class="help-item"><b>내성 시설과 담당 장수</b><p>성 안의 공터에 시장·농원·병영·연병장·순찰소·성벽·연구소를 직접 지을 수 있습니다(소도시 5칸 · 대도시 8칸 · 관문 2칸 · 요새 3칸). 담당 장수가 없어도 효과의 절반은 돌고, 정치·통솔·매력이 높은 장수를 앉히면 100~150%까지 오릅니다. 건물을 눌러 Lv.1→5로 증축하면 외형과 효과가 함께 자랍니다.</p></div>
        <div class="help-item"><b>장수는 한 달에 한 번</b><p>장수는 <b>건물 담당</b>, 아니면 직접 명령(탐색·등용·수송·계략·연구·출진) 중 하나를 합니다. 담당을 맡은 장수는 매달 자동으로 건물 효과를 내므로, 급히 출진에 쓰고 싶으면 그 건물에서 담당을 해제하세요. 행동력 숫자는 없앴고 장수 카드에 <b>건물 담당 / 대기 / 이번 달 완료</b>로만 표시됩니다.</p></div>
        <div class="help-item"><b>인사·탐색</b><p>주점에서 재야 인재를 등용하고, [탐색]은 <b>금이 들지 않고</b> 장수의 그달 행동만 씁니다. 탐색에서는 보물·은거 인재·금·군량·의용병 합류·산적 퇴치·맹수 사냥·일기토가 고루 나옵니다. 태수·군사는 관아에서 언제든 바꿉니다.</p></div>
        <div class="help-item"><b>외교·계략</b><p>정찰(금 45)로 3~4개월 적성 내부를 보고, 이간계(금 100)·유언비어(금 80)로 적의 병력·성벽·민심을 깎고, 화친(금 200)으로 6개월 휴전을 청합니다.</p></div>
        <div class="help-item"><b>기술 연구</b><p>군사·치안·경제·개발·정무·계략 6계열 24종입니다. 앞 단계를 먼저 연구하면 다음이 열리고, 공격·방어·세수·군량·징병·성벽 효과가 실제 전투와 내정에 반영됩니다.</p></div>
        <div class="help-item"><b>명성과 관작</b><p>지도 위 관작 표식(현령·태수·자사…)을 누르면 승진 진행도가 열립니다. 명성은 달이 바뀔 때, 성을 함락할 때, 인물을 등용할 때 오르고, 관작이 오르면 매달 봉급과 거느릴 수 있는 병력이 늘어납니다.</p></div>
        <div class="help-item"><b>미정찰 적성</b><p>첩자가 닿지 않은 성은 병력·성벽·민심·장수가 <b>? (미정찰)</b>로 보입니다. 도시 팝업의 [정찰 보내기]나 외교·계략의 [정찰]로 3~4개월 동안 성안을 살필 수 있습니다.</p></div>
        <div class="help-item"><b>인구와 징병</b><p>징병은 그 성의 인구에서 병사를 빼옵니다. 주둔병은 인구의 30%를 넘을 수 없고, 징병하면 민심이 내려갑니다(매력이 높으면 덜 내려갑니다). 민심이 70 이상이면 세수와 인구가 더 늘고, 40 아래면 줄어듭니다.</p></div>
        <div class="help-item"><b>군사 조언</b><p>관아나 행동력 줄의 [군사] 버튼으로 군사를 임명하면, 그 성의 민심·병력·성벽·재정과 이웃 적성·주점 인재를 읽어 지금 필요한 일을 조언합니다. 조언은 행동력을 쓰지 않고, '조언대로 진행'을 눌러야 실행됩니다. 대기 장수에게 남은 내정을 통째로 맡기려면 관아의 [대기 장수 일괄 내정]을 쓰십시오.</p></div>
        <div class="help-item"><b>장수 명부</b><p>메뉴나 도시 장수 줄의 [전체]로 장수·보물·배치를 한눈에 봅니다. 머리글을 누르면 정렬됩니다.</p></div>
        <div class="help-item"><b>전장 이동</b><p>부대를 누르면 파란 타일이 나타납니다. 타일을 누르면 부대가 한 칸씩 걸어서 이동하고, 붉은 적을 눌러 공격합니다. 화면을 끌면 24~32칸 전장을 넓게 볼 수 있고, 우측 상단 미니맵을 누르면 그 자리로 바로 갑니다. 미니맵 위 <b>⤢ 확대</b>를 누르면 미니맵이 두 배 가까이 커져 마을·본진·성문 위치를 한눈에 봅니다(다시 누르면 원래 크기).</p></div>
        <div class="help-item"><b>뒤로가기·종료</b><p>폰의 뒤로가기는 창을 닫고, 성 화면에서는 지도로 돌아갑니다. 지도·타이틀에서 뒤로가면 <b>게임을 종료하시겠습니까?</b> 확인 창이 뜨고, <b>계속하기</b>를 누르면 그대로 남습니다.</p></div>
        <div class="help-item"><b>책략과 군량</b><p>[책략]으로 병과별 기술을 쓰고, [군량]으로 HP를 회복합니다. [대기] 후 다음 부대로 넘어갑니다.</p></div>
        <div class="help-item"><b>병과 상성</b><p>창병 → 기병·야수 <b>+35%</b> · 기병·야수 → 보병 <b>+18%</b> · 보병(검병·등갑병·무도가) → 궁병 <b>+20%</b> · 궁병 → 기병·책략계 <b>+18%</b>, 창병 <b>+20%</b>. 공격 전에 뜨는 [전투 예고]에 상성 배율과 반격 피해가 그대로 찍힙니다.</p></div>
        <div class="help-item"><b>반격</b><p>맞은 쪽이 사거리 안이면 반격합니다. 피해는 <b>75%</b>(검병만 방패 맞다이 <b>90%</b>). 궁수·연노·포차처럼 최소 사거리가 있는 병과는 붙으면 반격하지 못합니다.</p></div>
        <div class="help-item"><b>군악대·무희</b><p>매 턴 시작에 마름모 2칸 아군을 돕습니다 — 군악대는 <b>MP +4 · 공격 +8%</b>, 무희는 아군 <b>회피·치명 +8%</b>에 적 공격 <b>−8%</b>. 세워 두기만 해도 밥값을 합니다.</p></div>
        <div class="help-item"><b>소리</b><p>상단 ♪ 버튼으로 효과음을 끄고 켜고 할 수 있습니다. 첫 터치 때 소리가 준비됩니다.</p></div>
        <div class="help-item"><b>승리</b><p>적을 모두 쓰러뜨리면 성을 차지합니다. 성문·다리·숲의 지형 보정을 활용하세요.</p></div>
      </div>`,
      actions: [{ label: '알겠다', primary: true }],
    });
  };

  /* v5.13 — 모바일 세로 고정.
     PWA·전체화면에서는 screen.orientation.lock('portrait')으로 실제 잠그고,
     잠금이 막히는 일반 브라우저 탭은 CSS 오버레이(#rotate-guard)가 가로를 막는다. */
  let orientationTried = false;
  function lockPortrait() {
    try {
      const o = screen.orientation || window.orientation || null;
      const p = o && o.lock ? o.lock('portrait') : null;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* 잠금 미지원 브라우저는 조용히 넘어간다 */ }
    orientationTried = true;
  }
  SK.lockPortrait = lockPortrait;

  /* ───────────── 이벤트 연결 ───────────── */
  function bind() {
    const has = SK.hasSave();
    $('#btn-continue').hidden = !has;
    $('#btn-start').onclick = () => startGame(true);
    $('#btn-continue').onclick = () => { if (SK.load()) startGame(false); else startGame(true); };
    const slotsBtn = $('#btn-slots');
    if (slotsBtn) slotsBtn.onclick = () => SK.openSaveSlots('load');
    /* v5.11 — 표지 아무 곳이나 첫 터치/스크롤에 title BGM 잠금 해제 */
    const titleKick = () => {
      if (window.JojoBGM && JojoBGM.kick) { try { JojoBGM.kick('title'); } catch (e) { /* ignore */ } }
      const hint = $('#title-sound');
      if (hint) hint.classList.add('off');
    };
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((ev) => {
      window.addEventListener(ev, titleKick, { passive: true, once: true });
    });
    /* v5.13 — 첫 터치·전체화면 진입 때마다 세로 잠금을 다시 시도 */
    ['pointerdown', 'touchstart'].forEach((ev) => {
      window.addEventListener(ev, () => { if (!orientationTried) lockPortrait(); }, { passive: true, once: true });
    });
    document.addEventListener('fullscreenchange', () => { lockPortrait(); });
    /* 홈 화면 앱(standalone)으로 이미 열렸다면 첫 터치를 기다리지 않고 바로 시도 */
    try {
      const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone;
      if (standalone) lockPortrait();
    } catch (e) { /* ignore */ }
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
    const cdxBtn = $('#btn-map-codex');
    if (cdxBtn) cdxBtn.onclick = () => SK.openCodex();
    const estrip = $('#econ-strip');
    if (estrip) estrip.onclick = openEcon;
    $('#btn-city-back').onclick = () => SK.showMap();
    const cPrev = $('#btn-city-prev');
    if (cPrev) cPrev.onclick = () => stepCity(-1);
    const cNext = $('#btn-city-go');
    if (cNext) cNext.onclick = () => stepCity(1);
    const cName = $('#city-name');
    if (cName) cName.onclick = () => openCityPicker();
    $('#btn-battle-help').onclick = () => SK.showHelp();
    $$('.city-commands .cmd[data-grp]').forEach((b) => { b.onclick = () => openGroupMenu(b.dataset.grp); });
    const cn = $('#btn-city-next');
    if (cn) cn.onclick = () => confirmNextMonth();
    const cmap = $('#btn-city-map');
    if (cmap) cmap.onclick = () => { SK.closeCitySheet(); SK.showMap(); };
    const rk = $('#map-rank');
    if (rk) { rk.style.cursor = 'pointer'; rk.onclick = () => openRank(); }
    /* v5.23 — 전장 뒤로가기도 상단 ‹ 버튼과 똑같이 이 확인을 띄운다 */
    SK.confirmRetreat = function () {
      SK.modal({ title: '후퇴할까요?', body: '<p class="modal-p">전투에서 물러나면 이번 공격은 실패합니다.</p>', actions: [
        { label: '계속 싸운다' }, { label: '후퇴', onClick: () => { if (window.SKBattle) SKBattle.retreat(); } },
      ] });
    };
    $('#btn-retreat').onclick = () => SK.confirmRetreat();
  }

  /* expose */
  SK.startGame = startGame;
  SK.advanceMonth = advanceMonth;
  SK.openMenu = openMenu;
  SK.doCommand = doCommand;
  SK.newState = newState;
  SK.makeHero = makeHero;
  SK.openEstrange = openEstrange;
  SK.openSurrenderAdvice = openSurrenderAdvice;
  SK.openAppoint = openAppoint;
  SK.rollChoiceEvent = rollChoiceEvent;
  SK.showChoiceEvent = showChoiceEvent;
  SK.diffOf = diffOf;
  SK.setDifficulty = (k) => { if (DIFFICULTIES[k]) chosenDiff = k; return chosenDiff; };
  SK.getDifficulty = () => chosenDiff;

  document.addEventListener('DOMContentLoaded', () => {
    /* v5.9 — 표지 화면의 테마 (첫 터치에서 소리가 열린다) */
    bgm('title');
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
    /* v5.25 — 표지 수치(거점·병과·장수)를 실제 데이터로 다시 적는다 */
    Promise.all([loadCities(), loadClasses(), loadGenerals()]).then(refreshTitleFoot).catch(() => {});
  });
  function hasSaveOnBoot() { return SK.hasSave(); }

  // 자동 저장
  setInterval(() => { if (SK.state && document.querySelector('#screen-map.active, #screen-city.active')) SK.save(); }, 8000);
})();
