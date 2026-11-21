/* ══════════════════════════════════════════════════════════════
   4단계 · 대형 격자 전장 — 24/28/32 팬/줌·미니맵, 이동·공격·책략·AI
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK;
  const $ = (s) => document.querySelector(s);
  /* v5.17 — 격자 크기는 전장마다 다르다. 요격·소도시 24, 중도시 28, 대도시 32.
     startBattle에서 B.cols·B.rows에 맞춰 N·WORLD를 다시 잡는다. */
  const TILE = 64;
  let N = 18, WORLD = N * TILE;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  /* cheb — 정사각(맨해튼 아님) 거리. 인연·특기 같은 '주변' 판정에만 쓴다 */
  const cheb = (x1, y1, x2, y2) => Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
  /* v5.14 — 조조전식 ◇ 마름모 사거리. 대각선 1칸은 거리 2로 센다.
     공격·책략 사거리와 범위 판정은 전부 이 거리로 통일한다 (이동 탐색은 격자 BFS라 그대로). */
  const manh = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);
  /* v5.14 — 성문을 때릴 수 있는 진영. 공성전은 공격측 아군, 수성전은 침공측 적군. */
  function gateAttackerSide() { return B && B.defense ? 'enemy' : 'ally'; }
  function isGateAttacker(u) { return !!u && u.alive !== false && u.side === gateAttackerSide(); }

  const CLASS_UNIT = SK.CLASS_UNIT;
  const CLASS_PORTRAIT = SK.CLASS_PORTRAIT;

  let ctx, canvas, stage;
  let B = null;
  let cam = { s: 0.8, x: 0, y: 0 };
  let dpr = 1;
  let mode = 'idle';
  let pendingSkill = null;
  let raf = 0;
  let lastT = 0;
  let busy = false;
  const floats = [];
  const fx = [];
  const imgs = {};
  const pointers = new Map();
  let drag = { on: false, moved: 0, sx: 0, sy: 0, lx: 0, ly: 0 };
  let pinch = null;
  let inertia = null;
  let hoverTile = null;
  let timeScale = 1;            // QA용 배속/저속 (기본 1)
  let autoOn = false;           // v5.2 — 아군 턴 자동 진행
  let autoTimer = null;
  let autoPending = null;
  /* v5.10 — 자동전투 배속. 기본 1x = 예전 속도의 절반(2배 느리게), 2x = 예전 속도 */
  let autoSpeed = 1;
  const LV_GROW = 0.018;        // 1레벨마다 공·방 +1.8% (아군·적군 공통)
  /* v5.10 — 전투 배속: ×1이면 전장의 모든 대기·연출이 2배 느려지고 ×2면 예전 그대로.
     수동 조작 중(autoOn=false)에는 아무 영향이 없다. */
  function paceMs(ms) { return autoOn ? Math.round((Number(ms) || 0) * (2 / autoSpeed)) : (Number(ms) || 0); }
  function wait(fn, ms) { return setTimeout(fn, paceMs(ms)); }
  SK.battlePace = paceMs;
  const anims = [];            // 타일 단위 이동 · 돌격 애니메이션
  let shakeT = 0, shakeAmp = 0; // 화면 진동
  let bondTick = 0;
  let calloutTimer = null;

  /* ───────────── 이미지 로드 ───────────── */
  function loadImg(src) {
    if (imgs[src]) return imgs[src];
    const im = new Image();
    im.src = src;
    imgs[src] = im;
    return im;
  }
  function unitImgFor(u) {
    /* v5.2 — 수전에서 물 타일 위로 나간 부대는 조각배(Skiff)로 표시 */
    if (B && B.type === 'naval' && B.tiles && B.tiles[u.y] && B.tiles[u.y][u.x] === 'W') {
      return loadImg('assets/units/skiff.webp');
    }
    const key = u.unit || CLASS_UNIT[u.cls] || 'bobyung';
    return loadImg(`${SK.unitSrc(key)}`);
  }

  /* 세력 우두머리를 전장 지휘관으로 — 이름·초상화·병과 */
  function bossOfFaction(faction) {
    const info = SK.factionInfo(faction);
    const lord = info && info.lord;
    const g = lord ? SK.GEN_BY_NAME[lord] : null;
    if (g) {
      return { name: g.name, hanja: '', pt: SK.genPortrait(g), cls: SK.genClass(g), lv: Math.max(4, SK.genLv(g)) };
    }
    if (lord) return { name: lord, hanja: '', pt: SK.CLASS_PORTRAIT.gunwoong || 'gen_bobyung', cls: 'gunwoong', lv: 5 };
    return null;
  }

  /* 회복량 — 대상 최대 병력의 12~22%만. 표준 공격 피해를 넘지 않게 상한을 둔다 (v4.2) */
  function healAmount(sk, target) {
    const maxHp = target && target.maxHp ? target.maxHp : 0;
    const pct = clamp(sk && sk.healPct != null ? sk.healPct : 0.16, 0.12, 0.22);
    return Math.max(1, Math.min(Math.round(maxHp * pct), Math.round(maxHp * 0.22)));
  }
  SK.healAmount = healAmount;
  SK.startBattle = function (opts) {
    document.querySelectorAll('#modal-root .modal-layer').forEach((m) => m.remove());
    const s = SK.state;
    const target = SK.CITY[opts.targetId];
    const defense = opts.defense || null;
    const type = opts.type || SK.battleTypeFor(target);
    const def = SK.BATTLE_TYPES[type];
    /* v5.11 — 공성·수성 통일: 같은 성이면 공격/방어 모두 같은 성벽 맵을 쓴다.
       도시 등급이 높을수록 성벽이 1중 → 2중 → 3중으로 겹친다. */
    const isSiege = (type === 'siege' || type === 'defense');
    const cellState = s.cities[opts.targetId];
    const rings = isSiege ? (SK.siegeRingsOfCity ? SK.siegeRingsOfCity(target) : 1) : 0;
    const mapKey = isSiege && SK.siegeMapKey ? SK.siegeMapKey(rings) : def.map;
    const mapRows = SK.MAPS[mapKey] || SK.MAPS[def.map];
    const tiles = mapRows.map((r) => r.split(''));
    /* v5.17 — 동적 격자 크기 + 1×1 본진·마을 자리 */
    const meta = SK.MAP_META[mapKey] || (def.map && SK.MAP_META[def.map]) || null;
    const cols = meta ? meta.cols : tiles[0].length;
    const rows = meta ? meta.rows : tiles.length;
    N = cols; WORLD = N * TILE;
    const bgKey = (type === 'siege' || type === 'defense')
      ? (rings >= 3 ? 'siege3' : (rings === 2 ? 'siege2' : 'siege'))
      : (def.img || def.map);
    const faction = defense ? defense.faction : s.cities[opts.targetId].owner;
    const bossInfo = bossOfFaction(faction);
    const intercept = opts.intercept || null;

    const allies = opts.units.map((spec, i) => (spec.kind === 'hero' ? makeAlly(spec, i, opts.origin) : makeRegiment(spec, i)));
    /* v5.21 — 수성전 배치 모달에서 고른 자리(외성·망루·내성)를 부대에 달아 둔다 */
    allies.forEach((u, i) => { const sp = opts.units[i]; if (sp && sp.zone) u.zone = sp.zone; });
    /* v5.9 — 인접 성에서 온 지원군 표시 (전투가 끝나면 원래 성으로 돌아간다) */
    if (opts.reinforce) allies.forEach((u, i) => { if (opts.units[i] && opts.units[i].rfg) u.rfg = opts.reinforce.from; });

    /* v5.7 — 수성전이면 적 병력은 침공군 규모, 지키는 쪽이 아군 */
    const cityTroops = defense ? Math.max(1200, defense.troops || 0) : s.cities[opts.targetId].troops;
    /* v5.17 — 출진 10부대·병력 5,000/10,000 시대에 맞춰 적 편성도 6~10부대로 늘린다
       v5.21 — 요격전은 경고창에 적힌 요격대 병력(intercept.troops)과 실제 편성이 같아야 한다.
       예전에는 700명 요격대도 부대 수 5 × 최소 900명 = 4,500명으로 불어나 있었다. */
    const enemyCount = intercept ? clamp(2 + Math.round((intercept.troops || 800) / 1200), 2, 6)
      : clamp(6 + Math.floor(cityTroops / 3800), 6, 10);
    const per = intercept
      ? Math.max(120, Math.round(((intercept.troops || 800) / (enemyCount + 0.5)) / 20) * 20)
      : clamp(Math.round(cityTroops / enemyCount / 100) * 100, 900, 5200);
    const defGens = (defense ? (defense.genIds || []) : (s.cities[opts.targetId].genIds || []))
      .map((id) => {
        const g = SK.GEN_BY_ID[id];
        if (!g) return null;
        /* v5.10 — 적 성 장수도 Lv.1에서 시작해 달마다 자란다 (수성전은 공격해 온 성 기준) */
        const lv = SK.enemyGenLevel ? SK.enemyGenLevel(defense ? defense.from : opts.targetId, id) : 1;
        return Object.assign({}, g, { _lv: lv });
      })
      .filter(Boolean)
      .slice(0, intercept ? 1 : 99);
    const enemies = [];
    /* v5.0.1 — 수비 부대는 전투 병종 위주로 뽑고 보조 병종(군악·무희·풍수사)은 1기까지만 */
    const SUPPORT_CLS = { gunakdae: 1, muhui: 1, pungsusa: 1 };
    let supportUsed = 0;
    /* v5.15 — 요격전 8종의 적 편성표를 그대로 쓴다 */
    const combatType = (type === 'naval') ? 'naval'
      : (type === 'mountain') ? 'mountain'
      : (type === 'forest' || type === 'ambush') ? 'forest'
      : (type === 'gorge') ? 'gorge'
      : (type === 'camp') ? 'camp'
      : (type === 'plain') ? 'plain'
      : (type === 'ford') ? 'ford'
      : 'siege';
    for (let i = 0; i < enemyCount; i++) {
      if (defGens[i]) { enemies.push(makeNamedEnemy(defGens[i], per, i === 0)); continue; }
      if (i === 0 && bossInfo && !defGens.length) { enemies.push(makeBoss(bossInfo, faction, per)); continue; }
      let cls = SK.enemyClassesFor(combatType, i);
      if (SUPPORT_CLS[cls]) {
        supportUsed += 1;
        if (supportUsed > 1) cls = SK.enemyClassesFor(combatType, i + 3);
        if (SUPPORT_CLS[cls]) cls = 'changbyung';
      }
      const spec = { kind: 'enemy', cls };
      enemies.push(makeEnemyCls(spec.cls, i, type, faction, per));
    }

    /* v5.10 — 적 인접 성 지원군 합류 (플레이어의 [지원군 파견]과 같은 눈금) */
    const supportNames = [];
    (opts.aiSupport || []).forEach((sp, k) => {
      const ids = (sp.genIds || []).slice(0, 2);
      const share = Math.max(600, Math.round((sp.troops || 0) * 0.42 / Math.max(1, ids.length) / 100) * 100);
      ids.forEach((gid, j) => {
        const base = SK.GEN_BY_ID[gid];
        if (!base) return;
        const lv = SK.enemyGenLevel ? SK.enemyGenLevel(sp.from, gid) : 1;
        const u = makeNamedEnemy(Object.assign({}, base, { _lv: lv }), share, false);
        u.id = u.id + '_r' + k + j;
        u.support = sp.name;
        u.isSupport = true;
        enemies.push(u);
      });
      if (ids.length) supportNames.push(sp.name);
    });

    /* v5.2 — 성문 내구도. v5.11 — 겹성벽이면 바깥 성문부터 차례로 부순다.
       수성전도 같은 성문·성벽을 그대로 쓴다 (진영만 바뀐다). */
    const gateRows = [];
    if (type === 'siege' || type === 'defense' || type === 'fortress') {
      const rowsWithGate = [];
      tiles.forEach((row, y) => {
        if (row.indexOf('G') < 0) return;
        rowsWithGate.push(y);
      });
      /* v5.17 — 성벽 두께(2칸)만큼 이어진 성문 줄은 하나의 성문으로 묶는다 */
      rowsWithGate.sort((a, b) => b - a);
      rowsWithGate.forEach((y) => {
        const last = gateRows[gateRows.length - 1];
        if (last && last.rows[last.rows.length - 1] - y <= 1) last.rows.push(y);
        else gateRows.push({ row: y, rows: [y], tiles: [] });
      });
      gateRows.forEach((gr) => {
        gr.rows.forEach((y) => tiles[y].forEach((ch, x) => { if (ch === 'G') gr.tiles.push({ x, y }); }));
      });
    }
    /* 바깥(큰 y)부터 안쪽 순서 */
    gateRows.sort((a, b) => b.row - a.row);
    const gateHpBase = clamp(Math.round(cityTroops * 0.14) + 500, 800, 2200);
    const gates = gateRows.map((gr, i) => {
      const hp = Math.max(500, Math.round(gateHpBase * (i === 0 ? 1 : (i === 1 ? 0.72 : 0.55))));
      return { row: gr.row, tiles: gr.tiles, hp, maxHp: hp, ring: i + 1 };
    });
    const gateInit = gates[0] || null;   // B.gate는 가장 바깥에 남은 성문을 가리킨다

    B = {
      type, def, name: defense ? `${target.name} 수성전` : (intercept ? `${intercept.name} · ${def.name}` : `${target.name} ${def.name}`),
      targetId: opts.targetId, origin: opts.origin,
      tiles, units: [], turn: 1, phase: 'ally', sel: null,
      cols: cols, rows: rows, bgKey: bgKey, mapKey: mapKey,
      acted: false, over: false, log: [], faction, rewards: { gold: 0, food: 0 }, gate: gateInit, gates: gates, rings: rings,
      introLines: buildIntro(type, target, faction, bossInfo, defGens, SK.pickEvent(target, defGens), intercept),
      event: SK.pickEvent(target, defGens),
      objective: defense ? '성을 지켜라 — 적을 전멸시켜라' : def.objective, started: false, moveAnim: null, deployed: opts.units, introDone: false,
      bondSeen: {}, intercept, marchId: opts.marchId || null, defense: defense, lastStand: !!opts.lastStand,
      reinforce: opts.reinforce || null, supportNames: supportNames,
      /* v5.21 — 수성전에서 고르지 않아 성에 남긴 예비 병력 */
      reserve: Math.max(0, Math.round(opts.reserve || 0)),
    };
    /* v5.11 — 공성 진영 장식 (assets/battle). 격자 뒤에 깔려 부대를 가리지 않는다 */
    if (type === 'camp') {
      /* v5.15 — 야영 기습전: 막사·보급품·목책이 늘어선 적 진영 */
      B.props = [
        { k: 'camp', x: 2, y: 2, s: 1.0 }, { k: 'camp', x: 15, y: 2, s: 1.0 },
        { k: 'supply', x: 1, y: 6, s: 0.9 }, { k: 'supply', x: 16, y: 11, s: 0.9 },
        { k: 'barricade', x: 2, y: 10, s: 0.88 }, { k: 'barricade', x: 15, y: 7, s: 0.88 },
        { k: 'camp', x: 2, y: 16, s: 1.0 }, { k: 'camp', x: 15, y: 16, s: 1.0 },
      ];
    } else if (type === 'siege' || type === 'defense' || type === 'fortress') {
      B.props = [
        { k: 'camp', x: 2, y: 15, s: 1.0 }, { k: 'camp', x: 15, y: 15, s: 1.0 },
        { k: 'supply', x: 2, y: 16, s: 0.88 }, { k: 'supply', x: 15, y: 16, s: 0.88 },
        { k: 'barricade', x: 4, y: 16, s: 0.84 }, { k: 'barricade', x: 13, y: 16, s: 0.84 },
        { k: 'catapult', x: 5, y: 15, s: 0.9 }, { k: 'catapult', x: 12, y: 15, s: 0.9 },
        { k: 'ram', x: 7, y: 16, s: 0.88 }, { k: 'ram', x: 10, y: 16, s: 0.88 },
        { k: 'siege_tower', x: 4, y: 14, s: 0.9 }, { k: 'siege_tower', x: 13, y: 14, s: 0.9 },
      ];
    }
    placeSide(allies, SK.allySlots(type, rings, cols), 'ally', type === 'defense' ? { zones: defenseZoneSlots(tiles, meta, cols, rows) } : null);
    placeSide(enemies, SK.enemySlots(type, rings, cols), 'enemy');
    /* v5.17 — 1×1 본진·마을. 수성전은 진영이 뒤집히므로 본진 자리도 바꿔 단다 */
    B.sites = [];
    if (meta) {
      const allyPos = type === 'defense' ? meta.enemyBase : meta.allyBase;
      const enemyPos = type === 'defense' ? meta.allyBase : meta.enemyBase;
      if (allyPos) B.sites.push({ type: 'allyHQ', x: allyPos.x, y: allyPos.y, owner: 'ally' });
      if (enemyPos) B.sites.push({ type: 'enemyHQ', x: enemyPos.x, y: enemyPos.y, owner: 'enemy' });
      (meta.villages || []).forEach((v) => B.sites.push({ type: 'village', x: v.x, y: v.y, owner: null }));
    }
    /* v5.17 — 총대장(적)과 아군 총대장. 격파되면 그 자리에서 승패가 갈린다 */
    const eLeader = B.units.filter((u) => u.side === 'enemy').sort((a, b) => ((b.boss ? 1 : 0) - (a.boss ? 1 : 0)) || (b.lv - a.lv))[0];
    if (eLeader) {
      eLeader.leader = true;
      /* 무명 수비 부대가 총대장이 되면 이름을 붙여 준다 (적 성에 장수가 없을 때) */
      if (!eLeader.genId && !eLeader.boss) {
        eLeader.boss = true;
        eLeader.name = `${SK.factionName(faction).replace(/군$/, '')} 수비대장`;
      }
      B.enemyLeaderId = eLeader.id;
    }
    const aLeader = B.units.filter((u) => u.side === 'ally' && u.uid).sort((a, b) => b.lv - a.lv)[0]
      || B.units.filter((u) => u.side === 'ally')[0];
    if (aLeader) { aLeader.leader = true; B.allyLeaderId = aLeader.id; }
    /* v5.17 — AI 역할: 수비대·호위병은 본진·총대장을 지키고, 돍격대는 아군 본진·빈 마을을 노린다 */
    /* 수성전은 적이 성으로 밀고 들어오는 입장이라 전원 돍격, 공성·요새는 수비대가 자리를 지킨다.
       들판 요격전은 절반이 마을·아군 본진을 노리는 돍격대가 된다. */
    const eHQ = B.sites.find((x) => x.type === 'enemyHQ');
    B.units.filter((u) => u.side === 'enemy').forEach((u, i) => {
      if (type === 'defense') { u.role = 'assault'; return; }
      if (type === 'siege' || type === 'fortress') { u.role = 'guard'; return; }
      u.role = u.leader ? 'guard' : (i % 2 === 0 ? 'assault' : 'guard');
    });
    B.units.forEach((u) => { if (u.tier == null) u.tier = SK.tierForLv(u.lv); });
    /* v5.16 — 전장에서 마주친 적 장수를 도감에 조우로 남긴다 */
    if (SK.codexMeet) SK.codexMeet(enemies.filter((u) => u.genId != null).map((u) => u.genId));
    B.objective = defense ? SK.BATTLE_TYPES.defense.objective : def.objective;
    if (B.sites && B.sites.length) B.objective = '적 총대장 격파 또는 적 본진 점령 — 아군 총대장·본진을 지켜라';
    B.rewards.gold = intercept ? Math.round((intercept.troops || 2400) * 0.10 + 80) : Math.round(cityTroops * 0.16 + 320);
    B.rewards.food = intercept ? Math.round((intercept.troops || 2400) * 0.07 + 60) : Math.round(cityTroops * 0.11 + 240);
    anims.length = 0;
    fx.length = 0;
    floats.length = 0;
    shakeT = 0;
    autoStop();
    autoPending = null;
    autoSpeed = 1;          // v5.10 — 전투마다 기본 ×1로 시작
    paintSpeedBtn();
    SK.show('screen-battle');
    if (window.JojoBGM) {
      try { JojoBGM.play(type === 'siege' || type === 'fortress' ? 'battle_siege' : 'battle_field'); } catch (e) { /* ignore */ }
    }
    if (window.SK && SK.bgm && !window.JojoBGM) SK.bgm(type === 'siege' || type === 'fortress' ? 'battle_siege' : 'battle_field');
    initCanvas();
    const feedEl = document.querySelector('#battle-feed');
    if (feedEl) feedEl.innerHTML = '';
    SKBattle.refreshUI();
    showIntro();
    if (supportNames.length) {
      wait(() => SK.toast(`적 지원군 합류 — ${supportNames.join(' · ')}`), 260);
    }
  };

  /* 훈련도 — 부대의 숙련도 (레벨·등급이 높을수록 단단하다) */
  function trainOf(lv, tierKey) {
    const t = SK.TIER_LV[tierKey] || 3;
    return clamp(Math.round(42 + (Number(lv) || 1) * 2.6 + t * 5), 30, 100);
  }
  SK.trainOf = trainOf;

  function makeAlly(spec, i, origin) {
    const h = SK.state.heroes.find((x) => x.uid === spec.uid);
    const C = SK.CLASSES[h.cls];
    const eq = SK.equipBonus(h);
    const troops = spec.troops || SK.troopForNamed(h.lv);
    const passive = (SK.PASSIVES && SK.PASSIVES[h.name]) || null;
    const techAtk = 1 + ((SK.techPct ? SK.techPct('atkPct') : 0) / 100);
    const techDef = 1 + ((SK.techPct ? SK.techPct('defPct') : 0) / 100);
    /* v5.7 — 충성: 100이면 그대로, 낮을수록 전투에서 힘을 덜 쓴다 (40 아래는 큰 폭) */
    const loy = clamp(Number(h.loyal == null ? 100 : h.loyal) || 0, 0, 100);
    const loyMul = 0.86 + loy * 0.0014;
    // 고유 특기(상시형)는 공격·방어에 소폭 보탬이 된다 — 값의 절반만, 사기적이지 않게
    const pMul = passive && passive.trigger === 'passive' ? 1 + (Number(passive.valuePct) || 0) / 200 : 1;
    /* v5.10 — 레벨 성장: 1레벨마다 공·방 +1.8%, 승급 구간은 +6% 추가 */
    const lvMul = 1 + LV_GROW * (Math.max(1, Number(h.lv) || 1) - 1);
    /* v5.11 — 관직 보정 (무관 공·방 / 문관 병력·내정) */
    const offB = SK.officeWarBonus ? SK.officeWarBonus(h) : { atk: 0, def: 0 };
    return {
      id: 'a' + i, side: 'ally', uid: h.uid, name: h.name, hanja: h.hanja, cls: h.cls, lv: h.lv,
      hp: troops, maxHp: troops, mp: h.mp, maxMp: SK.maxMpOf(h.cls, h.lv),
      atk: (C.atk + (h.wu + eq.war - 60) * 0.17) * (1 + 0.06 * SK.tierForLv(h.lv)) * lvMul * techAtk * pMul * loyMul * (1 + offB.atk),
      def: (C.def + (h.tong + eq.leadership - 60) * 0.09) * (1 + 0.06 * SK.tierForLv(h.lv)) * lvMul * techDef * pMul * loyMul * (1 + offB.def),
      mov: Math.min(9, C.mov + eq.move), rng: C.rng, minRng: C.minRng || 1,
      wu: h.wu + eq.war, ji: h.ji + eq.intel, tong: h.tong + eq.leadership,
      portrait: h.portrait, unit: h.unit || CLASS_UNIT[h.cls], skills: SK.skillsFor(h.cls, h.lv),
      passive, pUsed: {}, x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 2, face: 1, expGain: 0,
      stat: { dealt: 0, taken: 0, heal: 0, kills: 0 },
      train: allyTrain(origin, h),
    };
  }

  /* 출진한 성의 시작 훈련도(50)를 부대에 그대로 넘긴다 — 훈련으로 올라간 만큼 강해진다 */
  function allyTrain(origin, h) {
    const cs = SK.state && SK.state.cities ? SK.state.cities[origin] : null;
    const base = cs && cs.train != null ? cs.train : 50;
    return clamp(Math.round(base + Math.max(0, (h.lv || 1) - 1) * 1.5), 20, 100);
  }
  SK.allyTrain = allyTrain;

  function makeRegiment(spec, i) {
    const C = SK.CLASSES[spec.cls];
    const lv = 3;
    return {
      id: 'r' + i, side: 'ally', uid: null, name: spec.name, hanja: '', cls: spec.cls, lv,
      hp: spec.troops, maxHp: spec.troops, mp: C.mp, maxMp: C.mp,
      /* v5.3 — 일반 부대는 Lv.1 C급 장수보다 약하게 (장수 부대가 확실히 우위) */
      atk: C.atk - 1.5, def: C.def - 1.5, mov: C.mov, rng: C.rng, minRng: C.minRng || 1,
      wu: 52, ji: 50, tong: 52, portrait: CLASS_PORTRAIT[spec.cls], unit: CLASS_UNIT[spec.cls],
      skills: C.skills.slice(), x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: 1,
      stat: { dealt: 0, taken: 0, heal: 0, kills: 0 },
      train: 45,
    };
  }

  function makeBoss(info, faction, per) {
    const C = SK.CLASSES[info.cls];
    const lv = info.lv;
    const troops = Math.round(per * 1.5);
    return {
      id: 'boss', side: 'enemy', name: info.name, hanja: info.hanja, cls: info.cls, lv,
      hp: troops, maxHp: troops, mp: C.mp + lv * 2, maxMp: C.mp + lv * 2,
      atk: C.atk + lv * 1.15, def: C.def + lv * 0.8,
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: 82 + lv, ji: 60 + lv, tong: 80, boss: true,
      portrait: info.pt, unit: CLASS_UNIT[info.cls], skills: C.skills.slice(),
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: -1,
      train: 82,
    };
  }

  function makeNamedEnemy(g, per, boss) {
    const cls = SK.genClass(g);
    const C = SK.CLASSES[cls];
    /* v5.10 — 적 장수도 Lv.1에서 시작해 자란다 (_lv는 성의 성장 기록에서 온 값) */
    const lv = clamp(Math.round(Number(g._lv) || 1), 1, 30);
    const mul = boss ? 1.5 : 1;
    const troops = Math.round(per * mul);
    const lvMul = 1 + LV_GROW * (lv - 1);
    return {
      id: 'ng' + g.id, side: 'enemy', name: g.name, hanja: '', cls, lv, genId: g.id,
      hp: troops, maxHp: troops, mp: C.mp + lv * 2, maxMp: C.mp + lv * 2,
      /* v5.17 — 적 명장도 아군과 같은 모양의 계산을 쓴다 (능력치 60 기준).
         예전에는 g.war를 그대로 더해 A급 적장이 아군보다 1.8배 강했다 — 반격까지 겹쳐
         아군이 4배 이상 손해를 보던 원인. */
      atk: (C.atk + (g.war - 60) * 0.14) * (1 + (SK.TIER_LV[g.tier] || 3) * 0.025) * lvMul,
      def: (C.def + (g.leadership - 60) * 0.08) * (1 + 0.04 * ((SK.TIER_LV[g.tier] || 3) - 1)) * lvMul,
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: g.war, ji: g.intel, tong: g.leadership,
      boss: boss && g.tier === 'S', portrait: SK.genPortrait(g), unit: SK.genUnit(g),
      skills: SK.skillsFor(cls, lv), skillName: g.skill, tier: g.tier,
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: -1,
      train: trainOf(lv, g.tier),
    };
  }

  function makeEnemy(i, type, faction, per) {
    return makeEnemyCls(SK.enemyClassesFor(type, i), i, type, faction, per);
  }

  function makeEnemyCls(cls, i, type, faction, per) {
    const C = SK.CLASSES[cls];
    const season = Math.floor(((SK.state && SK.state.turn) || 1) / 6);
    const lv = clamp(2 + Math.floor(per / 900) + season, 2, 10);
    const frac = [1, 0.9, 1.05, 0.95, 1, 0.9, 1.1, 0.95][i % 8];
    const troops = Math.round(per * frac);
    return {
      id: 'e' + i, side: 'enemy', name: `${SK.factionName(faction).replace(/군$/, '')} ${C.name}대`,
      hanja: '', cls, lv,
      hp: troops, maxHp: troops, mp: C.mp + lv, maxMp: C.mp + lv,
      /* v5.3 — 무명 일반 수비병도 아군 일반 부대와 같은 낮은 기준 (명장 부대가 확실히 강하다) */
      atk: C.atk - 1.5, def: C.def - 1.5,
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: 50, ji: 48, tong: 50,
      portrait: CLASS_PORTRAIT[cls], unit: CLASS_UNIT[cls], skills: C.skills.slice(),
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: -1,
      train: 45,
    };
  }

  function placeSide(list, slots, side, opts) {
    const zmap = (opts && opts.zones) || null;
    const taken = new Set();
    const zused = { wall: 0, tower: 0, keep: 0 };
    list.forEach((u, i) => {
      let x, y;
      /* v5.21 — 수성전은 장수가 고른 자리(외성·망루·내성)부터 채운다 */
      const zone = zmap && u.zone && zmap[u.zone] ? u.zone : null;
      if (zone) {
        const zs = zmap[zone];
        for (let k = zused[zone]; k < zs.length; k++) {
          const [zx, zy] = zs[k];
          if (taken.has(zx + ',' + zy)) continue;
          if (!B.tiles[zy] || !passable(B.tiles[zy][zx])) continue;
          if (B.units.some((o) => o.x === zx && o.y === zy)) continue;
          x = zx; y = zy; zused[zone] = k + 1;
          break;
        }
      }
      if (x == null) [x, y] = slots[i % slots.length];
      if (x == null || !B.tiles[y] || !passable(B.tiles[y][x]) || B.units.some((o) => o.x === x && o.y === y)) {
        const alt = findFree(B.tiles, x == null ? 1 : x, y == null ? 1 : y);
        x = alt.x; y = alt.y;
      }
      taken.add(x + ',' + y);
      u.x = x; u.y = y; u.rx = x; u.ry = y; u.flash = 0; u.shake = 0; u.side = side;
      B.units.push(u);
    });
  }

  function passable(ch) { return ch !== 'C' && ch !== 'H'; }

  /* v5.21 — 수성전 자리별 슬롯.
     · 외성: 가장 바깥 성벽(성문 줄) 안쪽 1~3칸 마당 — 성문 앞을 막는다
     · 망루: 망루(T) 칸과 그 사방 — 좌·우에서 성 밖을 쏜다
     · 내성: 본진 앞 마당 (슬롯 계산은 slotsAround) */
  function defenseZoneSlots(tiles, meta, cols, rows) {
    const free = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && passable(tiles[y][x]);
    let outer = -1;
    const towers = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = tiles[y][x];
        if (ch === 'G') outer = Math.max(outer, y);
        else if (ch === 'T') towers.push({ x, y });
      }
    }
    const cx = Math.floor(cols / 2);
    const wall = [];
    if (outer >= 0) {
      for (let dy = 1; dy <= 3; dy++) {
        const y = outer - dy;
        if (y < 0) continue;
        for (let dx = 0; dx <= 5; dx++) {
          const xs = dx === 0 ? [cx - 1, cx] : [cx - dx, cx + dx - 1];
          xs.forEach((x) => { if (free(x, y)) wall.push([x, y]); });
        }
      }
    }
    const tower = [];
    /* 바깥 성벽에 가까운 망루부터 (적이 성문으로 몰리는 쪽) */
    towers.sort((a, b) => Math.abs(a.y - outer) - Math.abs(b.y - outer));
    towers.forEach((t) => {
      if (free(t.x, t.y)) tower.push([t.x, t.y]);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => { if (free(t.x + dx, t.y + dy)) tower.push([t.x + dx, t.y + dy]); });
    });
    const base = meta && meta.enemyBase ? meta.enemyBase : { x: cx, y: Math.max(1, outer - 4) };
    const keep = slotsAround(base, cols, 14).filter(([x, y]) => free(x, y));
    return { wall, tower, keep };
  }
  SK.defenseZoneSlots = defenseZoneSlots;
  function findFree(tiles, cx, cy) {
    for (let r = 0; r < N; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          if (!passable(tiles[y][x])) continue;
          if (B.units.some((o) => o.x === x && o.y === y)) continue;
          return { x, y };
        }
      }
    }
    return { x: 1, y: 1 };
  }

  function buildIntro(type, target, faction, bossInfo, defGens, event, intercept) {
    const lines = [];
    if (event) lines.push({ event });
    const mine = SK.factionInfo(SK.playerFaction());
    const lordName = mine.lord || '조조';
    const lordG = SK.GEN_BY_NAME[lordName];
    const lordPt = lordG ? SK.genPortrait(lordG) : SK.CLASS_PORTRAIT.gunwoong;
    if (intercept) {
      lines.push({ who: lordName, hanja: '', pt: lordPt, side: 'ally',
        text: SK.quoteOf(lordName, 'deploy') || '길을 막는 자는 뚫고 지나간다.' });
      lines.push({ who: lordName, hanja: '', pt: lordPt, side: 'ally',
        text: {
          plain: '들을 가로지른다. 대형을 흐트러뜨리지 마라!',
          ford: '물이 얕은 곳을 찾아라. 강을 건너면 우리 땅이다.',
          mountain: '산길이 좁다. 앞사람만 따라와라.',
          naval: '적선을 나란히 붙여라. 물길은 내가 안다.',
          ambush: '숲이 조용하다. 매복을 먼저 찾아라!',
        }[type] || '막아서는 자들을 밀어내라.' });
      const raider = (defGens || [])[0];
      lines.push({ who: raider ? raider.name : '적 요격대', hanja: '',
        pt: raider ? SK.genPortrait(raider) : SK.CLASS_PORTRAIT.chaeksa, side: 'enemy',
        text: '이 길로는 못 지나간다. 여기서 발을 붙여 보아라!' });
      return lines;
    }
    lines.push({ who: lordName, hanja: '', pt: lordG ? SK.genPortrait(lordG) : SK.CLASS_PORTRAIT.gunwoong,
      side: 'ally', text: SK.quoteOf(lordName, 'deploy') || `${target.name}의 성문을 열어라. 오늘로 끝내겠다.` });
    /* v5.7 — 수성전은 우리가 성 안에서 맞는다 */
    if (type === 'defense') {
      const mine2 = SK.factionInfo(SK.playerFaction());
      const named = (defGens || [])[0];
      lines.push({ who: lordName, hanja: '', pt: lordG ? SK.genPortrait(lordG) : SK.CLASS_PORTRAIT.gunwoong,
        side: 'ally', text: `${target.name}은 우리 성이다. 문을 닫고 한 걸음도 내주지 마라!` });
      lines.push({ who: named ? named.name : `${SK.factionName(faction)} 장수`, hanja: '',
        pt: named ? SK.genPortrait(named) : SK.CLASS_PORTRAIT.chaeksa, side: 'enemy',
        text: `${mine2.name}의 성문을 열어라. 오늘로 이 땅을 끝내겠다.` });
      return lines;
    }
    const hint = {
      siege: '성벽이 높습니다. 성문을 향해 힘을 모으십시오.',
      naval: '물길은 내가 안다. 배를 따라오너라!',
      mountain: '산길은 좁다. 내 뒤에 붙어라!',
      fortress: '목책 하나, 부수면 그만이다.',
      plain: '넓은 들이다. 기병을 살려라.',
      ford: '여울을 먼저 잡아라. 강을 등지면 끝이다.',
      ambush: '숲의 숨소리를 들어라. 매복이 있다.',
    }[type];
    const speaker = (SK.state.heroes || []).find((h) => h.city === (B && B.origin) && SK.quoteOf(h.name, 'deploy'));
    if (hint) {
      lines.push({ who: speaker ? speaker.name : lordName, hanja: '',
        pt: speaker ? speaker.portrait : (lordG ? SK.genPortrait(lordG) : SK.CLASS_PORTRAIT.gunwoong),
        side: 'ally', text: hint });
    }
    const named = (defGens || [])[0];
    if (named) lines.push({ who: named.name, hanja: '', pt: SK.genPortrait(named), side: 'enemy', text: `${SK.CLASSES[SK.genClass(named)].name} ${named.name}, 이 성은 내가 지킨다.` });
    else if (bossInfo) lines.push({ who: bossInfo.name, hanja: bossInfo.hanja, pt: bossInfo.pt, side: 'enemy', text: bossLine(faction) });
    return lines;
  }
  function bossLine(faction) {
    return {
      yuanshao: '하북의 힘을 얕보지 마라!', dongzhuo: '감히 나에게 맞서는가!', sunjian: '강동의 호랑이가 어디 도망가겠나!',
      sunquan: '강동의 물길은 내가 안다!', liubiao: '형주의 성은 그대들의 무덤이 될 것이다.',
      liuyan: '익주의 산하는 쉽게 넘지 못한다.', liuzhang: '촉의 산하는 쉽게 넘지 못한다.',
      mateng: '서량의 철기를 보아라.', goguryeo: '동방의 땅을 함부로 밟지 마라.',
      baekje: '한강의 물결이 너희를 삼키리라.', silla: '경주의 기상이 너희를 막으리라.',
    }[faction] || '감히 이 성을 넘보는가!';
  }

  /* ───────────── 캔버스 ───────────── */
  function initCanvas() {
    canvas = $('#battle-canvas');
    stage = $('#battle-stage');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    bindBattleCamera();
    mmStatic = null;
    buildMinimap();
    bindMinimap();
    if (!B.started) {
      B.started = true;
      // center camera on allies before the fade-in
      const a = B.units.filter((u) => u.side === 'ally');
      const cx = a.reduce((s2, u) => s2 + u.x, 0) / Math.max(1, a.length);
      const cy = a.reduce((s2, u) => s2 + u.y, 0) / Math.max(1, a.length);
      /* v5.17 — 화면에 약 11칸이 들어오게 맞추고 아군 본진 쪽을 비춘다 */
      const base = (B.sites || []).find((s) => s.type === 'allyHQ');
      const focus = base ? [base.x, base.y - 1] : [cx, cy];
      cam.s = clamp(stage.clientWidth / (11 * TILE), 0.42, 0.8);
      centerCam(focus[0], focus[1]);
    }
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
  }

  function resizeCanvas() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
  }

  function camClamp() {
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const sw = WORLD * cam.s, sh = WORLD * cam.s;
    if (sw <= w) cam.x = (w - sw) / 2;
    else cam.x = clamp(cam.x, w - sw, 0);
    if (sh <= h) cam.y = (h - sh) / 2;
    else cam.y = clamp(cam.y, h - sh, 0);
  }
  function centerCam(tx, ty) {
    const w = canvas.width / dpr, h = canvas.height / dpr;
    cam.x = w / 2 - (tx + 0.5) * TILE * cam.s;
    cam.y = h / 2 - (ty + 0.5) * TILE * cam.s;
    camClamp();
  }

  /* v5.0.1 — 턴이 바뀔 때마다 지금 차례인 장수로 부드럽게 카메라를 옮긴다 */
  let camGlide = null;
  function glideCam(tx, ty, dur) {
    if (!canvas) return;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const gx = w / 2 - (tx + 0.5) * TILE * cam.s;
    const gy = h / 2 - (ty + 0.5) * TILE * cam.s;
    if (camGlide) { cancelAnimationFrame(camGlide); camGlide = null; }
    const x0 = cam.x, y0 = cam.y;
    const t0 = performance.now();
    const d = dur || 420;
    camGlide = requestAnimationFrame(function step() {
      const p = Math.min(1, (performance.now() - t0) / d);
      const e = 1 - Math.pow(1 - p, 3);
      cam.x = x0 + (gx - x0) * e;
      cam.y = y0 + (gy - y0) * e;
      camClamp();
      camGlide = p < 1 ? requestAnimationFrame(step) : null;
    });
  }
  function trackTurn(u, force) {
    if (!u || !canvas) return;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const sx = (rxOf(u) + 0.5) * TILE * cam.s + cam.x;
    const sy = (rxOf(u) + 0.5) * TILE * cam.s + cam.y;
    const near = Math.abs(sx - w / 2) < w * 0.26 && Math.abs(sy - h / 2) < h * 0.26;
    if (force || !near) glideCam(rxOf(u), ryOf(u));
  }
  function screenToWorld(px, py) {
    return { x: (px - cam.x) / cam.s, y: (py - cam.y) / cam.s };
  }
  function screenToTile(px, py) {
    const w = screenToWorld(px, py);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }

  /* ───────────── 입력 ───────────── */
  function bindBattleCamera() {
    if (canvas.dataset.bound) return;
    canvas.dataset.bound = '1';
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        stopInertia();
        drag = { on: true, moved: 0, sx: e.clientX, sy: e.clientY, lx: cam.x, ly: cam.y,
          px: e.clientX, py: e.clientY, pt: e.timeStamp || performance.now(), vx: 0, vy: 0 };
      } else if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), s: cam.s,
          mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2 };
        drag.on = false;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const pts = Array.from(pointers.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const r = canvas.getBoundingClientRect();
        const fx2 = (pts[0].x + pts[1].x) / 2 - r.left, fy2 = (pts[0].y + pts[1].y) / 2 - r.top;
        zoomAt(pinch.s * (d / pinch.d), fx2, fy2);
        return;
      }
      if (drag.on) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        const now = e.timeStamp || performance.now();
        const dt = Math.max(8, now - (drag.pt || now - 16));
        const ivx = (e.clientX - (drag.px == null ? e.clientX : drag.px)) / dt * 16;
        const ivy = (e.clientY - (drag.py == null ? e.clientY : drag.py)) / dt * 16;
        drag.vx = (drag.vx || 0) * 0.35 + ivx * 0.65;
        drag.vy = (drag.vy || 0) * 0.35 + ivy * 0.65;
        drag.px = e.clientX; drag.py = e.clientY; drag.pt = now;
        cam.x = drag.lx + dx; cam.y = drag.ly + dy;
        camClamp();
      } else if (e.pointerType !== 'touch') {
        hoverTile = screenToTile(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
      }
    });
    const up = (e) => {
      const wasDrag = drag.moved;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (drag.on && wasDrag < 8) {
          const r = canvas.getBoundingClientRect();
          const t = screenToTile(e.clientX - r.left, e.clientY - r.top);
          onTileTap(t.x, t.y);
        } else if (drag.on) {
          startInertia(drag.vx || 0, drag.vy || 0);
        }
        drag.on = false;
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(cam.s * (e.deltaY < 0 ? 1.12 : 0.9), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    new ResizeObserver(() => { if (B) { resizeCanvas(); camClamp(); } }).observe(stage);
  }

  function zoomAt(ns, fx2, fy2) {
    stopInertia();
    const fit = Math.min(stage.clientWidth / WORLD, stage.clientHeight / WORLD);
    ns = clamp(ns, fit * 0.95, 2.2);
    const k = ns / cam.s;
    cam.x = fx2 - (fx2 - cam.x) * k;
    cam.y = fy2 - (fy2 - cam.y) * k;
    cam.s = ns;
    camClamp();
  }
  function stopInertia() {
    if (inertia) { cancelAnimationFrame(inertia); inertia = null; }
    if (camGlide) { cancelAnimationFrame(camGlide); camGlide = null; }
  }

  /* 전장을 손으로 튕기면 관성으로 미끄러진다 */
  function startInertia(vx, vy) {
    if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) return;
    stopInertia();
    const step = () => {
      cam.x += vx; cam.y += vy;
      vx *= 0.92; vy *= 0.92;
      camClamp();
      if (Math.abs(vx) > 0.3 || Math.abs(vy) > 0.3) inertia = requestAnimationFrame(step);
      else inertia = null;
    };
    inertia = requestAnimationFrame(step);
  }

  window.addEventListener('resize', () => { if (B && canvas) { resizeCanvas(); camClamp(); } });

  /* ───────────── 렌더 ───────────── */
  function loop(t) {
    const dt = Math.min(60, t - lastT);
    lastT = t;
    /* v5.10 — 자동전투 배속은 대기 간격만이 아니라 이동·타격 연출에도 걸린다.
       ×1이면 전장 전체가 절반 속도로 흐르고, ×2면 예전 그대로다. */
    const sdt = dt * timeScale * (autoOn ? 1 / autoSpeed : 1);
    updateFx(sdt);
    updateAnims(sdt);
    updateUnits(sdt);
    updateBonds(sdt);
    if (shakeT > 0) shakeT = Math.max(0, shakeT - sdt);
    if (B) draw();
    raf = requestAnimationFrame(loop);
  }

  /* ══════════════════════════════════════════════════════════════
     v5.1 — 공성전 직교 맵: 배경 그림 없이 타일을 코드로 직접 그린다.
     격자(TILE=64)와 1:1로 맞고, 한 번 그려 둔 레이어를 매 프레임 깔기만 한다.
     ══════════════════════════════════════════════════════════════ */
  const SIEGE_SCALE = 1.5; // 폰 메모리를 위해 레이어 해상도 상한

  function siegeHash(x, y, k) {
    let n = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(k + 1, 1274126177)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (((n ^ (n >>> 16)) >>> 0) % 10000) / 10000;
  }

  function buildSiegeLayer(tiles) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(WORLD * SIEGE_SCALE);
    const g = cv.getContext('2d');
    g.scale(SIEGE_SCALE, SIEGE_SCALE);
    const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 'P' : tiles[y][x]);
    // 1) 바닥(잔디)을 전부 깔고 2) 지형별로 덧그린다
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) siegeGrass(g, x, y);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ch = at(x, y);
        const px = x * TILE, py = y * TILE;
        g.save();
        g.translate(px, py);
        g.beginPath(); g.rect(0, 0, TILE, TILE); g.clip();
        if (ch === 'R') siegeRoad(g, x, y, at);
        else if (ch === 'D') siegeYard(g, x, y);
        else if (ch === 'H') siegeRoof(g, x, y, at);
        else if (ch === 'K') siegeKeep(g, x, y, at);
        else if (ch === 'T') siegeTower(g, x, y);
        else if (ch === 'W') siegeWater(g, x, y, at);
        else if (ch === 'S') siegeFord(g, x, y);
        else if (ch === 'B') siegeBridge(g, x, y, at);
        else if (ch === 'C' || ch === 'G') siegeWall(g, x, y, at);
        else if (ch === 'F') siegeForest(g, x, y);
        else if (ch === 'M') siegeMountain(g, x, y);
        g.restore();
      }
    }
    // 성문은 두 칸을 한 덩어리로 그려야 하므로 벽 위에 따로 얹는다
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (at(x, y) === 'G' && at(x - 1, y) !== 'G') {
          const w = at(x + 1, y) === 'G' ? 2 : 1;
          g.save(); g.translate(x * TILE, y * TILE); siegeGate(g, w); g.restore();
        }
      }
    }
    return cv;
  }

  function siegeGrass(g, x, y) {
    const tone = ['#8c9c5c', '#879858', '#91a160'][Math.floor(siegeHash(x, y, 1) * 3)];
    g.fillStyle = tone; g.fillRect(x * TILE, y * TILE, TILE, TILE);
    g.strokeStyle = 'rgba(88,110,52,0.55)'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const gx = x * TILE + 6 + siegeHash(x, y, 10 + i) * 52;
      const gy = y * TILE + 8 + siegeHash(x, y, 20 + i) * 48;
      g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx - 2, gy - 6); g.moveTo(gx, gy); g.lineTo(gx + 2.5, gy - 5); g.stroke();
    }
  }

  function siegeRoad(g, x, y, at) {
    const road = (c) => c === 'R' || c === 'B' || c === 'G';
    g.fillStyle = '#c9aa6c'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#b8995d';
    for (let i = 0; i < 5; i++) {
      g.beginPath(); g.ellipse(6 + siegeHash(x, y, 30 + i) * 52, 6 + siegeHash(x, y, 40 + i) * 52, 3.2, 2, 0, 0, 6.283); g.fill();
    }
    g.fillStyle = '#a07f46';
    if (!road(at(x - 1, y))) g.fillRect(0, 0, 5, TILE);
    if (!road(at(x + 1, y))) g.fillRect(TILE - 5, 0, 5, TILE);
  }

  function siegeYard(g, x, y) {
    g.fillStyle = '#cdb98f'; g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = 'rgba(150,126,86,0.55)'; g.lineWidth = 1.2;
    const off = (y % 2) * 16;
    g.beginPath();
    g.moveTo(0, 32); g.lineTo(TILE, 32);
    g.moveTo(16 + off, 0); g.lineTo(16 + off, 32);
    g.moveTo(48 - off, 32); g.lineTo(48 - off, TILE);
    g.stroke();
  }

  function siegeRoof(g, x, y, at) {
    siegeYard(g, x, y);
    const up = at(x, y - 1) === 'H', down = at(x, y + 1) === 'H';
    const left = at(x - 1, y) === 'H', right = at(x + 1, y) === 'H';
    g.fillStyle = 'rgba(60,40,20,0.28)'; g.fillRect(left ? 0 : 3, 5, TILE - (left ? 0 : 3), TILE);
    /* v5.1.1 — 아래 칸이 이어지는 지붕이면 타일 끝까지 채운다(바닥색 이음매 제거) */
    g.fillStyle = '#7c3c2c'; g.fillRect(left ? 0 : 2, up ? 0 : 3, TILE - (left ? 0 : 2) - (right ? 0 : 2), TILE - (up ? 0 : 3) - (down ? 0 : 3));
    g.strokeStyle = '#5e2b1f'; g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 8; i < TILE; i += 8) { g.moveTo(i, up ? 0 : 3); g.lineTo(i, down ? TILE : TILE - 9); }
    g.stroke();
    if (!up) { g.fillStyle = '#a2603f'; g.fillRect(left ? 0 : 2, 3, TILE - (left ? 0 : 2) - (right ? 0 : 2), 9); }
    if (!down) { g.fillStyle = '#3d1c14'; g.fillRect(left ? 0 : 2, TILE - 12, TILE - (left ? 0 : 2) - (right ? 0 : 2), 5); g.fillStyle = '#e6d8b0'; g.fillRect(left ? 0 : 2, TILE - 7, TILE - (left ? 0 : 2) - (right ? 0 : 2), 4); }
    if (!up && !left) { g.fillStyle = '#d6b45a'; g.fillRect(2, 3, 5, 5); }
    if (!up && !right) { g.fillStyle = '#d6b45a'; g.fillRect(TILE - 7, 3, 5, 5); }
  }

  /* v5.3 — 본성(금빛 지붕 계단)과 망루(2층 목탑) */
  function siegeKeep(g, x, y, at) {
    siegeYard(g, x, y);
    const left = at(x - 1, y) === 'K', right = at(x + 1, y) === 'K';
    g.fillStyle = '#a49a83'; g.fillRect(left ? 0 : 5, 16, TILE - (left ? 0 : 5) - (right ? 0 : 5), TILE - 20);
    g.fillStyle = '#c9bfa4'; g.fillRect(left ? 0 : 10, 21, TILE - (left ? 0 : 10) - (right ? 0 : 10), TILE - 30);
    g.strokeStyle = 'rgba(120,104,74,0.6)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(12, 34); g.lineTo(TILE - 12, 34); g.moveTo(12, 46); g.lineTo(TILE - 12, 46); g.stroke();
    g.fillStyle = '#8a5a1c'; g.fillRect(left ? 0 : 6, 7, TILE - (left ? 0 : 6) - (right ? 0 : 6), 13);
    g.fillStyle = '#d6b45a'; g.fillRect(left ? 0 : 6, 7, TILE - (left ? 0 : 6) - (right ? 0 : 6), 3);
    g.fillStyle = '#5e3a12';
    g.fillRect(left ? 0 : 6, 18, TILE - (left ? 0 : 6) - (right ? 0 : 6), 3);
    if (!left) { g.fillStyle = '#7c3c2c'; g.fillRect(2, 6, 6, 16); }
    if (!right) { g.fillStyle = '#7c3c2c'; g.fillRect(TILE - 8, 6, 6, 16); }
  }

  function siegeTower(g, x, y) {
    siegeYard(g, x, y);
    g.fillStyle = '#a49a83'; g.beginPath(); g.ellipse(32, 50, 25, 9, 0, 0, 6.283); g.fill();
    g.fillStyle = '#b9af96'; g.fillRect(13, 30, 38, 18);
    g.fillStyle = '#6b4a26'; g.fillRect(16, 20, 6, 22); g.fillRect(42, 20, 6, 22);
    g.fillStyle = '#7c3c2c';
    g.beginPath(); g.moveTo(5, 24); g.lineTo(32, 6); g.lineTo(59, 24); g.closePath(); g.fill();
    g.fillStyle = '#a2603f';
    g.beginPath(); g.moveTo(10, 24); g.lineTo(32, 10); g.lineTo(54, 24); g.closePath(); g.fill();
    g.fillStyle = '#e6d8b0'; g.fillRect(30, 2, 4, 8);
    g.strokeStyle = 'rgba(60,40,20,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(2, 52); g.lineTo(62, 52); g.stroke();
  }

  function siegeWater(g, x, y, at) {
    const wet = (c) => c === 'W' || c === 'S' || c === 'B';
    g.fillStyle = '#3f7f9d'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = 'rgba(120,180,205,0.28)'; g.fillRect(0, 18, TILE, 26);
    g.fillStyle = '#2d5f78';
    if (!wet(at(x, y - 1))) g.fillRect(0, 0, TILE, 7);
    if (!wet(at(x, y + 1))) g.fillRect(0, TILE - 7, TILE, 7);
    if (!wet(at(x - 1, y))) g.fillRect(0, 0, 6, TILE);
    if (!wet(at(x + 1, y))) g.fillRect(TILE - 6, 0, 6, TILE);
  }

  function siegeFord(g, x, y) {
    g.fillStyle = '#7fb2b0'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#d8c690';
    for (let i = 0; i < 9; i++) {
      g.beginPath(); g.ellipse(6 + siegeHash(x, y, 50 + i) * 52, 6 + siegeHash(x, y, 60 + i) * 52, 4, 2.6, 0, 0, 6.283); g.fill();
    }
    g.fillStyle = '#9d9a86';
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.ellipse(10 + siegeHash(x, y, 70 + i) * 44, 10 + siegeHash(x, y, 80 + i) * 44, 5, 3.6, 0, 0, 6.283); g.fill();
    }
  }

  function siegeBridge(g, x, y, at) {
    siegeWater(g, x, y, at);
    const left = at(x - 1, y) === 'B', right = at(x + 1, y) === 'B';
    const x0 = left ? 0 : 5, x1 = right ? TILE : TILE - 5;
    g.fillStyle = '#a06f3f'; g.fillRect(x0, 0, x1 - x0, TILE);
    g.strokeStyle = '#6e4624'; g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i <= TILE; i += 8) { g.moveTo(x0, i); g.lineTo(x1, i); }
    g.stroke();
    g.fillStyle = '#5a381c';
    if (!left) g.fillRect(x0, 0, 6, TILE);
    if (!right) g.fillRect(x1 - 6, 0, 6, TILE);
  }

  function siegeWall(g, x, y, at) {
    const wall = (c) => c === 'C' || c === 'G';
    g.fillStyle = '#a39d8c'; g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = '#7e786a'; g.lineWidth = 1.5;
    g.beginPath();
    for (let r = 0; r < 4; r++) {
      const ry = 14 + r * 12.5;
      g.moveTo(0, ry); g.lineTo(TILE, ry);
      const sx = (r % 2 ? 11 : 27);
      for (let bx = sx; bx < TILE; bx += 32) { g.moveTo(bx, ry); g.lineTo(bx, ry + 12.5); }
    }
    g.stroke();
    if (!wall(at(x, y - 1))) {
      g.fillStyle = '#8a8473'; g.fillRect(0, 0, TILE, 14);
      g.fillStyle = '#cbc5b0'; g.strokeStyle = '#6f6958'; g.lineWidth = 1.5;
      for (let m = 0; m < 3; m++) { g.fillRect(3 + m * 22, 0, 14, 13); g.strokeRect(3 + m * 22, 0, 14, 13); }
    }
    if (!wall(at(x, y + 1))) { g.fillStyle = 'rgba(40,36,28,0.45)'; g.fillRect(0, TILE - 7, TILE, 7); }
  }

  /* 성문: 한 칸 또는 두 칸 폭의 아치형 나무 문 */
  function siegeGate(g, w) {
    const W = TILE * w;
    g.beginPath();
    g.moveTo(8, TILE); g.lineTo(8, 40);
    g.ellipse(W / 2, 40, W / 2 - 8, 34, 0, Math.PI, 2 * Math.PI);
    g.lineTo(W - 8, TILE); g.closePath();
    g.fillStyle = '#6b4423'; g.fill();
    g.strokeStyle = '#2f2a22'; g.lineWidth = 3; g.stroke();
    g.save(); g.clip();
    g.strokeStyle = '#4a2d15'; g.lineWidth = 1.4;
    g.beginPath();
    for (let x = 8; x < W; x += 10) { g.moveTo(x, 0); g.lineTo(x, TILE); }
    g.stroke();
    g.strokeStyle = '#2f2a22'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 30); g.lineTo(W, 30); g.moveTo(0, 50); g.lineTo(W, 50); g.stroke();
    g.fillStyle = '#d6b45a';
    for (let x = 14; x < W; x += 20) { g.beginPath(); g.arc(x, 30, 2, 0, 6.283); g.arc(x, 50, 2, 0, 6.283); g.fill(); }
    if (w === 2) { g.strokeStyle = '#2a1a0c'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, TILE); g.stroke(); }
    g.restore();
  }

  function siegeForest(g, x, y) {
    const trees = [];
    for (let i = 0; i < 3; i++) trees.push([12 + siegeHash(x, y, 90 + i) * 40, 20 + siegeHash(x, y, 100 + i) * 34, 13 + siegeHash(x, y, 110 + i) * 5]);
    trees.sort((a, b) => a[1] - b[1]);
    trees.forEach(([tx, ty, r]) => {
      g.fillStyle = '#5a3d22'; g.fillRect(tx - 2.5, ty + r * 0.6, 5, 9);
      g.fillStyle = '#34602e'; g.beginPath(); g.arc(tx, ty, r, 0, 6.283); g.fill();
      g.fillStyle = '#4a7c3d'; g.beginPath(); g.arc(tx - 2, ty - 3, r * 0.72, 0, 6.283); g.fill();
      g.fillStyle = '#62954a'; g.beginPath(); g.arc(tx - 4, ty - 6, r * 0.38, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(30,50,26,0.8)'; g.lineWidth = 1.4; g.beginPath(); g.arc(tx, ty, r, 0, 6.283); g.stroke();
    });
  }

  function siegeMountain(g, x, y) {
    g.fillStyle = '#8d8573'; g.fillRect(0, 0, TILE, TILE);
    const peaks = [[20 + siegeHash(x, y, 120) * 8, 34, 22], [44 + siegeHash(x, y, 121) * 6, 44, 18]];
    peaks.forEach(([px, py, r], i) => {
      const top = py - r - 6, base = py + 16;
      g.fillStyle = '#7d7566'; g.beginPath(); g.moveTo(px - r - 4, base); g.lineTo(px, top); g.lineTo(px + r + 4, base); g.closePath(); g.fill();
      g.fillStyle = '#a89f8a'; g.beginPath(); g.moveTo(px, top); g.lineTo(px + r + 4, base); g.lineTo(px + 3, base); g.closePath(); g.fill();
      g.fillStyle = '#eee9dc'; g.beginPath(); g.moveTo(px, top); g.lineTo(px - 6, top + 9); g.lineTo(px + 6, top + 9); g.closePath(); g.fill();
      g.strokeStyle = '#4f4938'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px - r - 4, base); g.lineTo(px, top); g.lineTo(px + r + 4, base); g.stroke();
    });
  }

  /* 해자 물결 — 정지한 레이어 위에 가벼운 반짝임만 매 프레임 그린다 */
  function drawSiegeWater() {
    const t = performance.now() / 1400;
    ctx.save();
    ctx.strokeStyle = 'rgba(200,232,245,0.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (B.tiles[y][x] !== 'W') continue;
        for (let i = 0; i < 2; i++) {
          const ph = (t + siegeHash(x, y, 130 + i)) % 1;
          const wx = x * TILE + 8 + ph * 36, wy = y * TILE + 22 + i * 22;
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /* ══════════ v5.17 — 우측 상단 미니맵 (조조전식) ══════════
     전체 전장 축소도 위에 아군(파랑)·적군(빨강)·총대장(금테)·본진(금)·마을(초록),
     지금 화면이 보이는 범위를 흰 사각형으로 보여 준다. 누르면 그 자리로 즉시 이동. */
  const MM_W = 104, MM_H = 104;
  let mmStatic = null, mmBound = false, mmOpen = true;
  function mmEl() { return document.getElementById('mm-canvas'); }
  function buildMinimap() {
    const cv = mmEl();
    if (!cv || !B || !B.tiles) return;
    const dpr2 = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(MM_W * dpr2); cv.height = Math.round(MM_H * dpr2);
    cv.style.width = MM_W + 'px'; cv.style.height = MM_H + 'px';
    const st = document.createElement('canvas');
    st.width = cv.width; st.height = cv.height;
    const sc = st.getContext('2d');
    sc.setTransform(dpr2, 0, 0, dpr2, 0, 0);
    sc.fillStyle = '#2a2317'; sc.fillRect(0, 0, MM_W, MM_H);
    const img = loadImg(`assets/maps/v2/battle_${B.bgKey}.webp`);
    if (img.complete && img.naturalWidth) sc.drawImage(img, 0, 0, MM_W, MM_H);
    else { sc.fillStyle = (B.type === 'siege' || B.type === 'defense') ? '#c9ab6c' : '#7d8a52'; sc.fillRect(0, 0, MM_W, MM_H); }
    const sx = MM_W / N, sy = MM_H / N;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ch = B.tiles[y][x];
        if (ch === 'C' || ch === 'H') { sc.fillStyle = 'rgba(34,26,14,0.62)'; sc.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6); }
        else if (ch === 'W') { sc.fillStyle = 'rgba(40,96,150,0.55)'; sc.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6); }
      }
    }
    if (img.complete && img.naturalWidth) st.dataset.img = '1';
    mmStatic = st;
  }
  function drawMinimap() {
    const cv = mmEl();
    if (!cv || !B || !B.tiles || !mmOpen) return;
    if (!mmStatic || cv.width !== Math.round(MM_W * Math.min(2.5, window.devicePixelRatio || 1))) buildMinimap();
    /* 배경 그림이 늦게 도착하면 한 번 다시 그린다 */
    if (mmStatic && !mmStatic.dataset.img) {
      const im0 = loadImg(`assets/maps/v2/battle_${B.bgKey}.webp`);
      if (im0.complete && im0.naturalWidth) { buildMinimap(); }
    }
    if (!mmStatic) return;
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(mmStatic, 0, 0);
    const dpr2 = cv.width / MM_W;
    c.setTransform(dpr2, 0, 0, dpr2, 0, 0);
    const sx = MM_W / N, sy = MM_H / N;
    /* 본진·마을 */
    (B.sites || []).forEach((s) => {
      c.fillStyle = s.type === 'village'
        ? (s.owner === 'ally' ? '#6fb6ff' : s.owner === 'enemy' ? '#ff7a5c' : '#7ee08a')
        : (s.type === 'allyHQ' ? '#ffd35c' : '#e8b23c');
      c.fillRect(s.x * sx + 0.5, s.y * sy + 0.5, Math.max(2.4, sx), Math.max(2.4, sy));
      c.strokeStyle = 'rgba(30,22,10,0.8)'; c.lineWidth = 0.8;
      c.strokeRect(s.x * sx + 0.5, s.y * sy + 0.5, Math.max(2.4, sx), Math.max(2.4, sy));
    });
    /* 성문 */
    (B.gates || []).forEach((gate) => {
      gate.tiles.forEach((t) => {
        c.fillStyle = gate.hp > 0 ? '#ffe08a' : 'rgba(120,180,110,0.9)';
        c.fillRect(t.x * sx, t.y * sy, sx + 0.4, sy + 0.4);
      });
    });
    /* 부대 */
    B.units.forEach((u) => {
      if (!u.alive) return;
      c.fillStyle = u.side === 'ally' ? '#5aa0ff' : '#ff5a3c';
      c.beginPath();
      c.arc((u.x + 0.5) * sx, (u.y + 0.5) * sy, 1.9, 0, Math.PI * 2);
      c.fill();
      if (u.leader) {
        c.strokeStyle = '#ffd35c'; c.lineWidth = 1.2;
        c.beginPath(); c.arc((u.x + 0.5) * sx, (u.y + 0.5) * sy, 3.1, 0, Math.PI * 2); c.stroke();
      }
    });
    /* 지금 보이는 화면 */
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const vx = (-cam.x / cam.s) / TILE, vy = (-cam.y / cam.s) / TILE;
    const vw = (w / cam.s) / TILE, vh = (h / cam.s) / TILE;
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = 1.4;
    const x0 = clamp(vx, 0, N) * sx, y0 = clamp(vy, 0, N) * sy;
    const x1 = clamp(vx + vw, 0, N) * sx, y1 = clamp(vy + vh, 0, N) * sy;
    c.strokeRect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0));
  }
  function bindMinimap() {
    if (mmBound) return;
    mmBound = true;
    const cv = mmEl();
    const tog = document.getElementById('mm-toggle');
    const box = document.getElementById('mm-box');
    if (tog && box) {
      tog.onclick = (e) => {
        e.stopPropagation();
        mmOpen = !mmOpen;
        box.style.display = mmOpen ? '' : 'none';
        tog.textContent = mmOpen ? '◧' : '◨';
        tog.setAttribute('aria-label', mmOpen ? '미니맵 접기' : '미니맵 펼치기');
      };
    }
    if (!cv) return;
    const jump = (ev) => {
      if (!B || !canvas) return;
      const r = cv.getBoundingClientRect();
      const x = clamp((ev.clientX - r.left) / r.width, 0, 1) * N;
      const y = clamp((ev.clientY - r.top) / r.height, 0, 1) * N;
      centerCam(Math.floor(x), Math.floor(y));
      SK.sfx.play('ui');
    };
    cv.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); jump(ev); });
  }

  function draw() {
    if (!ctx) return;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#2a2317';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    let ox = 0, oy = 0;
    if (shakeT > 0) {
      const k = (shakeT / 240) * shakeAmp;
      ox = rnd(-k, k); oy = rnd(-k, k);
    }
    ctx.translate(cam.x + ox, cam.y + oy);
    ctx.scale(cam.s, cam.s);

    // v5.17 — 모든 전장이 칸 수에 맞는 그림을 쓴다 (공성·수성은 겹성벽 그림)
    const bg = loadImg(`assets/maps/v2/battle_${B.bgKey}.webp`);
    if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, WORLD, WORLD);
    else { ctx.fillStyle = (B.type === 'siege' || B.type === 'defense') ? '#c9ab6c' : '#7d8a52'; ctx.fillRect(0, 0, WORLD, WORLD); }

    drawTerrainTint();
    drawBattleProps();
    drawBrokenGates();
    drawKeyProps();
    drawSites();
    drawGrid();
    drawObjective();
    drawHighlights();
    drawUnits();
    drawFx();
    ctx.restore();
    drawFloats();
    drawMinimap();
  }

  /* v5.11 — assets/battle/ 추출 에셋을 격자 좌표에 맞춰 얹는다.
     성벽(wall_straight·wall_corner·wall_broken), 성문(gate), 망루(watchtower),
     본성(hq_pavilion), 진영(camp·supply·barricade), 공성 병기(catapult·ram·siege_tower),
     숲(forest)·산(mountain). 모두 타일 아래변에 발을 붙여 배경과 어긋나지 않게 그린다. */
  function drawProp(img, x, y, scale, alpha) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const w = TILE * (scale || 1), h = w;
    const cx = (x + 0.5) * TILE, by = (y + 0.86) * TILE;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(img, cx - w / 2, by - h, w, h);
    ctx.restore();
  }

  function drawBattleProps() {
    if (!B || !B.tiles) return;
    /* v5.17 — 배경 그림이 막사·성벽·성문을 이미 담고 있다. 프랍을 다시 얹으면 겹쳐 보인다. */
    return;
    const img = (n) => loadImg(`assets/battle/${n}.webp`);
    const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 'P' : B.tiles[y][x]);
    const wallAt = (x, y) => { const c = at(x, y); return c === 'C' || c === 'G'; };
    /* 성벽·성문 */
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ch = at(x, y);
        if (ch === 'G') {
          const gate = (B.gates || []).find((g) => g.tiles.some((t) => t.x === x && t.y === y));
          const broken = gate && gate.hp <= 0;
          drawProp(img(broken ? 'wall_broken' : 'gate'), x, y, 1.08, broken ? 0.96 : 1);
        } else if (ch === 'C') {
          const horiz = wallAt(x - 1, y) || wallAt(x + 1, y);
          drawProp(img(horiz ? 'wall_straight' : 'wall_corner'), x, y, 1.04);
        }
      }
    }
    /* 망루·본성·숲·산 */
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ch = at(x, y);
        if (ch === 'T') drawProp(img('watchtower'), x, y, 1.0);
        else if (ch === 'K') drawProp(img('hq_pavilion'), x, y, 1.12);
        else if (ch === 'F') drawProp(img('forest'), x, y, 1.0, 0.94);
        else if (ch === 'M') drawProp(img('mountain'), x, y, 1.06, 0.96);
      }
    }
    /* 진영·공성 병기 — 타일을 막지 않는 장식이다 (부대가 위에 선다) */
    (B.props || []).forEach((p) => drawProp(img(p.k), p.x, p.y, p.s || 0.98, 0.95));
    /* 불타는 성문 — 부서진 성문 위에 불꽃 */
    (B.gates || []).forEach((g) => {
      if (g.hp > 0) return;
      const t0 = g.tiles[0];
      if (t0) drawProp(img('fire'), t0.x, t0.y, 0.72, 0.9);
    });
  }

  /* v5.21 — 성문이 무너지면 배경의 닫힌 문짝 위에 '박살 난 문' 오버레이 타일을 얹는다.
     (배경 그림에는 문이 닫힌 모습만 있어서, 부서져도 문이 그대로 서 있는 것처럼 보였다)
     이미지는 성문 칸 묶음(2칸 폭 x 성문 줄 + 위 한 줄)에 맞춰 늘려 그린다.
     배경 그림의 성문은 겹수·크기마다 칸 눈금과 조금씩 어긋나 있어서, 그림 속 문 위치에 맞춰
     아래 표만큼 세로로 밀어 준다 (칸 단위). */
  const GATE_ART_OFF = {
    siege: { 1: 0.1 },
    siege2: { 1: 0.8, 2: 1.7 },
    siege3: { 1: 2.0, 2: 2.0, 3: 2.0 },
  };
  SK.GATE_ART_OFF = GATE_ART_OFF;
  function drawBrokenGates() {
    if (!B || !B.tiles) return;
    if (B.type !== 'siege' && B.type !== 'defense' && B.type !== 'fortress') return;
    const list = B.gates && B.gates.length ? B.gates : (B.gate ? [B.gate] : []);
    const img = loadImg('assets/battle/gate_broken.webp');
    if (!img.complete || !img.naturalWidth) return;
    const offTbl = GATE_ART_OFF[B.mapKey] || null;
    list.forEach((g) => {
      if (!g || !g.tiles || !g.tiles.length || g.hp > 0) return;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      g.tiles.forEach((t) => {
        x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x);
        y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y);
      });
      if (!isFinite(x0)) return;
      const off = offTbl ? (offTbl[g.ring] || 0) : 0;
      const padX = 0.2, up = 1;
      const bx = (x0 - padX) * TILE;
      const bw = (x1 - x0 + 1 + padX * 2) * TILE;
      const by = (y0 - up + off) * TILE;
      const bh = (y1 - y0 + 1 + up) * TILE;
      ctx.save();
      ctx.drawImage(img, bx, by, bw, bh);
      ctx.restore();
    });
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(46,38,22,0.20)';
    ctx.lineWidth = 1 / Math.max(0.4, cam.s);
    for (let i = 0; i <= N; i++) {
      ctx.beginPath(); ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, WORLD); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * TILE); ctx.lineTo(WORLD, i * TILE); ctx.stroke();
    }
    // frame
    ctx.strokeStyle = 'rgba(30,24,14,0.55)';
    ctx.lineWidth = 3 / cam.s;
    ctx.strokeRect(2, 2, WORLD - 4, WORLD - 4);
    ctx.restore();
  }

  function drawTerrainTint() {
    /* v5.17 — 겹성벽은 그림 위에 성벽·성문 칸을 옅게 덧칠해 "어디가 막힌 칸인지"를 보여 준다 */
    if (B.type === 'siege' || B.type === 'defense') {
      const t0 = B.tiles;
      ctx.save();
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const ch = t0[y][x];
          if (ch === 'C') {
            ctx.fillStyle = 'rgba(44,36,24,0.10)';
            ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          } else if (ch === 'G') {
            const gate = (B.gates || []).find((g) => g.tiles.some((t) => t.x === x && t.y === y));
            const broken = gate && gate.hp <= 0;
            /* 문이 살아 있으면 금테만, 부서졌으면 초록 점선으로 "지나갈 수 있음"을 보인다 */
            ctx.strokeStyle = broken ? 'rgba(126,224,138,0.85)' : 'rgba(255,200,90,0.9)';
            ctx.lineWidth = 2.6;
            if (broken) ctx.setLineDash([5, 4]);
            ctx.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
            ctx.setLineDash([]);
          }
        }
      }
      ctx.restore();
      return;
    }
    const t = B.tiles;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ch = t[y][x];
        if (ch === 'C') {
          ctx.fillStyle = 'rgba(86,78,62,0.42)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.strokeStyle = 'rgba(40,34,24,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x * TILE + 6, y * TILE + TILE - 6); ctx.lineTo(x * TILE + TILE - 6, y * TILE + 6); ctx.stroke();
        } else if (ch === 'W') {
          ctx.fillStyle = 'rgba(41,96,128,0.14)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        } else if (ch === 'D') {
          ctx.fillStyle = 'rgba(206,180,130,0.10)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        } else if (ch === 'G') {
          ctx.fillStyle = 'rgba(226,186,92,0.30)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.strokeStyle = 'rgba(120,88,30,0.7)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8);
        }
      }
    }
  }

  function drawObjective() {
    if (B.type !== 'siege' && B.type !== 'fortress') return;
    // gate marker
    const gates = [];
    B.tiles.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'G') gates.push({ x, y }); }));
    if (!gates.length) return;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420);
    ctx.save();
    gates.forEach((g) => {
      ctx.strokeStyle = `rgba(226,180,72,${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(g.x * TILE + 5, g.y * TILE + 5, TILE - 10, TILE - 10);
    });
    /* v5.2 — 성문 내구도 HP 바 (성문 타일 **안**에 그려 위층 적 부대에 가리지 않게)
       v5.11 — 겹성벽은 성벽 줄마다 바를 그린다 */
    const gateList = B.gates && B.gates.length ? B.gates : (B.gate ? [B.gate] : []);
    gateList.forEach((gate) => {
      if (!gate || !gate.tiles || !gate.tiles.length) return;
      const g0 = gate.tiles[0], g1 = gate.tiles[gate.tiles.length - 1];
      const x0 = g0.x * TILE, x1 = (g1.x + 1) * TILE;
      const w = x1 - x0 - 12;
      const y = (g0.y + 1) * TILE - 14;
      const ratio = clamp(gate.hp / Math.max(1, gate.maxHp), 0, 1);
      const k = 1 / Math.max(0.45, cam.s);
      ctx.fillStyle = 'rgba(30,22,10,0.86)';
      ctx.fillRect(x0 + 6, y, w, 8 * k);
      ctx.fillStyle = ratio > 0.55 ? '#7fc08a' : ratio > 0.25 ? '#e8c268' : '#d9634f';
      ctx.fillRect(x0 + 6, y, w * ratio, 8 * k);
      ctx.strokeStyle = 'rgba(227,189,99,0.9)';
      ctx.lineWidth = 1 * k;
      ctx.strokeRect(x0 + 6, y, w, 8 * k);
      if (gate.hp <= 0) {
        ctx.font = `bold ${Math.round(9 * k)}px "Noto Sans CJK KR", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#ffcf9a';
        ctx.fillText('파손', (x0 + x1) / 2, y - 3 * k);
      }
    });
    ctx.restore();
  }

  /* v5.17 — 망루(T)·본성 계단(K)은 배경 그림에 없으므로 코드로 얹는다 */
  function drawKeyProps() {
    if (!B || !B.tiles) return;
    const tower = loadImg('assets/battle/watchtower.webp');
    const keep = loadImg('assets/battle/hq_pavilion.webp');
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ch = B.tiles[y][x];
        if (ch === 'T') drawProp(tower, x, y, 0.94, 0.96);
        else if (ch === 'K') drawProp(keep, x, y, 1.08, 0.96);
      }
    }
  }

  /* ══════ v5.17 — 1×1 본진 · 마을 ══════
     본진 위 부대: 턴 시작 최대 병력 +20% · MP +10 · 방어 +25%
     마을 위 부대(점령한 편): 최대 병력 +10% · MP +5 · 방어 +15%
     마을은 밟은 진영의 것이 되고, 적진이 다시 밟으면 빼앗긴다. */
  function siteAt(x, y) {
    if (!B || !B.sites) return null;
    return B.sites.find((s) => s.x === x && s.y === y) || null;
  }
  function siteBonusOf(u) {
    if (!u) return null;
    const s = siteAt(u.x, u.y);
    if (!s) return null;
    if (s.type === 'village') return s.owner === u.side ? { def: 1.15, heal: 0.10, mp: 5 } : null;
    const mine = (s.type === 'allyHQ' && u.side === 'ally') || (s.type === 'enemyHQ' && u.side === 'enemy');
    return mine ? { def: 1.25, heal: 0.20, mp: 10 } : null;
  }
  function sitePhase(heal) {
    if (!B || !B.sites || B.over) return;
    B.units.forEach((u) => {
      if (!u.alive) return;
      const s = siteAt(u.x, u.y);
      if (!s) return;
      if (s.type === 'village' && s.owner !== u.side) {
        s.owner = u.side;
        feed(`${u.name} — 마을 점령 (${u.side === 'ally' ? '아군' : '적군'})`, u.side === 'ally' ? 'good' : 'bad');
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '마을 점령', '#9ef0b8');
        SK.sfx.play('ui');
      }
      if (!heal) return;
      const b = siteBonusOf(u);
      if (!b) return;
      if (u.hp < u.maxHp) {
        const hh = Math.max(1, Math.round(u.maxHp * b.heal));
        u.hp = Math.min(u.maxHp, u.hp + hh);
        addHeal(u, hh, u);
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.34) * TILE, '+' + hh, '#a8f0b8');
        addFx({ kind: 'heal', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 520 });
      }
      if (u.mp < u.maxMp) u.mp = Math.min(u.maxMp, u.mp + b.mp);
    });
  }
  /* 본진·마을 그림 — 배경 위에 깔리고, 부대는 그 위에 선다 */
  function drawSites() {
    if (!B || !B.sites || !B.sites.length) return;
    const t = performance.now() / 950;
    const k = clamp(1 / Math.max(0.5, cam.s), 1, 1.5);
    B.sites.forEach((s) => {
      const key = s.type === 'allyHQ' ? 'hq_ally' : s.type === 'enemyHQ' ? 'hq_enemy' : 'village';
      const img = loadImg(`assets/battle/${key}.webp`);
      const x = s.x * TILE, y = s.y * TILE;
      const col = s.type === 'village'
        ? (s.owner === 'ally' ? '90,160,255' : s.owner === 'enemy' ? '255,90,60' : '126,196,132')
        : (s.type === 'allyHQ' ? '90,160,255' : '255,90,60');
      ctx.save();
      ctx.fillStyle = `rgba(${col},0.16)`;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = `rgba(${col},${(0.55 + 0.22 * Math.sin(t * 3)).toFixed(3)})`;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
      if (img.complete && img.naturalWidth) {
        const w = TILE * (s.type === 'village' ? 0.84 : 1.45);
        ctx.drawImage(img, x + TILE / 2 - w / 2, y + TILE - w, w, w);
      }
      const label = s.type === 'allyHQ' ? '본진' : s.type === 'enemyHQ' ? '적 본진'
        : (s.owner === 'ally' ? '마을 · 아군' : s.owner === 'enemy' ? '마을 · 적' : '마을');
      ctx.font = `800 ${Math.round(9.4 * k)}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 11 * k;
      const th = Math.round(13.5 * k);
      ctx.fillStyle = 'rgba(24,19,11,0.82)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x + TILE / 2 - tw / 2, y - th - 2 * k, tw, th, th / 2); ctx.fill(); }
      else ctx.fillRect(x + TILE / 2 - tw / 2, y - th - 2 * k, tw, th);
      ctx.fillStyle = s.type === 'village' && !s.owner ? '#cfeccf' : '#fff3d8';
      ctx.fillText(label, x + TILE / 2, y - th / 2 - 2 * k + 0.5);
      ctx.restore();
    });
  }

  /* v5.15 — 야수병: 숲·산지에 서 있거나 산전·밀림전이면 이동력 +1 (실효 6급).
     평지 이동 6은 기병 전용으로 남긴다. */
  const BEAST_TERRAIN_TYPES = { mountain: 1, forest: 1, ambush: 1, gorge: 1 };
  function movOf(u) {
    if (!u) return 0;
    let m = Number(u.mov) || 0;
    if (u.cls === 'yasubyung') {
      const ch = B && B.tiles && B.tiles[u.y] ? B.tiles[u.y][u.x] : 'P';
      if (ch === 'F' || ch === 'M' || (B && BEAST_TERRAIN_TYPES[B.type])) m += 1;
    }
    return Math.min(10, m);
  }

  function moveCost(cls, ch, x, y, side) {
    if (ch === 'G') {
      if (!gateTileAt(x, y)) return 1;
      /* v5.21 — 성 주인(수성전 아군)은 살아 있는 자기 성문을 그냥 지난다.
         적 침공군만 문에 막힌다. (예전에는 아군까지 99라 성 안에 갇혔다) */
      if (B && B.defense && side === 'ally') return 1;
      return 99;
    }
    if (ch === 'W') return cls === 'sujeok' ? 1 : 99;
    if (ch === 'C' || ch === 'H') return 99;
    if (ch === 'M') return (cls === 'sanjeok' || cls === 'yasubyung') ? 1 : (cls === 'gibi' ? 99 : 2);
    if (ch === 'F') return (cls === 'sanjeok' || cls === 'yasubyung') ? 1 : (cls === 'gibi' ? 3 : 2);
    if (ch === 'S') return 2;
    return 1;
  }

  function reachSet(u) {
    if (!u) return new Set();
    const seen = new Map();
    const key = (x, y) => x + ',' + y;
    const cap = movOf(u);
    const start = key(u.x, u.y);
    seen.set(start, 0);
    const q = [[u.x, u.y, 0]];
    const out = new Set();
    while (q.length) {
      const [x, y, c] = q.shift();
      if (c > 0) out.add(key(x, y));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ch = B.tiles[ny][nx];
        const cost = moveCost(u.cls, ch, nx, ny, u.side);
        if (cost >= 90) continue;
        if (B.units.some((o) => o.alive && o.x === nx && o.y === ny)) continue;
        const nc = c + cost;
        if (nc > cap) continue;
        const k = key(nx, ny);
        if (seen.has(k) && seen.get(k) <= nc) continue;
        seen.set(k, nc);
        q.push([nx, ny, nc]);
      }
    }
    return out;
  }

  function drawHighlights() {
    const u = B.sel;
    if (!u || !u.alive) return;
    const reach = B.reachCache && B.reachCache.uid === u.id ? B.reachCache.set : null;
    /* v5.13 — 회복·아군 버프를 고르는 동안은 이동 범위(파랑)를 깔지 않는다.
       v5.14 — 책략 대상을 고르는 동안은 모두 같다. 파란 이동 범위가 ◇ 사거리와 겹쳐 탁해지지 않게. */
    const healPick = mode === 'skillTarget' && !!pendingSkill;
    if (reach && !healPick) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 380);
      reach.forEach((k) => {
        const [x, y] = k.split(',').map(Number);
        ctx.fillStyle = `rgba(70,140,225,${0.20 + pulse * 0.10})`;
        ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = 'rgba(120,190,255,0.55)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x * TILE + 2.5, y * TILE + 2.5, TILE - 5, TILE - 5);
      });
    }
    if (mode === 'attack' || mode === 'skillTarget') {
      /* v5.14 — 표시 사거리도 실제 판정(effRng, 지형 보너스 포함)과 같은 값을 쓴다 */
      const rng = pendingSkill ? (pendingSkill.range || pendingSkill.radius || effRng(u)) : effRng(u);
      /* v5.13 — 회복·아군 버프는 자기 발밑(거리 0)도 대상 — 풍수사가 제 발밑을 치료한다 */
      const selfSkill = !!(pendingSkill && (pendingSkill.kind === 'heal' || pendingSkill.kind === 'buffAlly'));
      const minR = selfSkill ? 0 : (pendingSkill ? (pendingSkill.minRange || 1) : (u.minRng || 1));
      /* v5.2 — 책략 선택 시 사거리·효과 범위 바닥 타일을 먼저 밝혀 준다 */
      if (mode === 'skillTarget' && pendingSkill) {
        const pulse2 = 0.5 + 0.5 * Math.sin(performance.now() / 400);
        /* v5.13 — 회복·아군 버프는 범위 자체를 초록으로 물들인다 (자기 발밑 포함) */
        const greenRange = pendingSkill.kind === 'heal' || pendingSkill.kind === 'buffAlly';
        const inSet = new Set();
        for (let y2 = 0; y2 < N; y2++) {
          for (let x2 = 0; x2 < N; x2++) {
            const d2 = manh(u.x, u.y, x2, y2);
            if (d2 < minR || d2 > rng) continue;
            inSet.add(x2 + ',' + y2);
            ctx.fillStyle = greenRange
              ? `rgba(110,255,215,${0.40 + pulse2 * 0.08})`
              : `rgba(132,96,255,${0.34 + pulse2 * 0.10})`;
            ctx.fillRect(x2 * TILE + 2, y2 * TILE + 2, TILE - 4, TILE - 4);
            ctx.strokeStyle = greenRange ? 'rgba(215,255,240,0.9)' : 'rgba(225,210,255,0.75)';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x2 * TILE + 3, y2 * TILE + 3, TILE - 6, TILE - 6);
          }
        }
        /* v5.14 — 사거리 경계를 ◇ 마름모 윤곽으로 또렷하게 긋는다 (지형 색에 묻히지 않게) */
        if (inSet.size) {
          ctx.save();
          ctx.strokeStyle = greenRange ? 'rgba(225,255,245,0.95)' : 'rgba(238,228,255,1)';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          inSet.forEach((k) => {
            const [x2, y2] = k.split(',').map(Number);
            const px = x2 * TILE, py = y2 * TILE;
            if (!inSet.has(x2 + ',' + (y2 - 1))) { ctx.moveTo(px + 2, py + 2.5); ctx.lineTo(px + TILE - 2, py + 2.5); }
            if (!inSet.has(x2 + ',' + (y2 + 1))) { ctx.moveTo(px + 2, py + TILE - 2.5); ctx.lineTo(px + TILE - 2, py + TILE - 2.5); }
            if (!inSet.has((x2 - 1) + ',' + y2)) { ctx.moveTo(px + 2.5, py + 2); ctx.lineTo(px + 2.5, py + TILE - 2); }
            if (!inSet.has((x2 + 1) + ',' + y2)) { ctx.moveTo(px + TILE - 2.5, py + 2); ctx.lineTo(px + TILE - 2.5, py + TILE - 2); }
          });
          ctx.stroke();
          ctx.restore();
        }
        const rad = pendingSkill.radius || 0;
        if (rad > 0) {
          const hx = (hoverTile && manh(u.x, u.y, hoverTile.x, hoverTile.y) <= rng) ? hoverTile.x : u.x;
          const hy = (hoverTile && manh(u.x, u.y, hoverTile.x, hoverTile.y) <= rng) ? hoverTile.y : u.y;
          for (let y2 = 0; y2 < N; y2++) {
            for (let x2 = 0; x2 < N; x2++) {
              if (manh(hx, hy, x2, y2) > rad) continue;
              ctx.fillStyle = 'rgba(255,170,90,0.26)';
              ctx.fillRect(x2 * TILE + 2, y2 * TILE + 2, TILE - 4, TILE - 4);
              ctx.strokeStyle = 'rgba(255,205,130,0.7)';
              ctx.lineWidth = 1.4;
              ctx.strokeRect(x2 * TILE + 3, y2 * TILE + 3, TILE - 6, TILE - 6);
            }
          }
        }
      }
      B.units.forEach((t) => {
        if (!t.alive) return;
        if (t.side === u.side) return;
        if (!canHit(u, t, rng)) return;
        ctx.fillStyle = 'rgba(214,72,58,0.30)';
        ctx.fillRect(t.x * TILE + 3, t.y * TILE + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = 'rgba(255,120,100,0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x * TILE + 3, t.y * TILE + 3, TILE - 6, TILE - 6);
      });
      if (pendingSkill && (pendingSkill.kind === 'heal' || pendingSkill.kind === 'buffAlly')) {
        B.units.forEach((t) => {
          if (!t.alive || t.side !== u.side) return;
          if (manh(u.x, u.y, t.x, t.y) > (pendingSkill.range || effRng(u))) return;
          ctx.fillStyle = 'rgba(80,180,120,0.30)';
          ctx.fillRect(t.x * TILE + 3, t.y * TILE + 3, TILE - 6, TILE - 6);
          /* v5.13 — 시전자 자기 발밑은 초록 테두리까지 그려 '나도 치료 가능'을 분명히 */
          if (t === u) {
            ctx.strokeStyle = 'rgba(190,255,215,1)';
            ctx.lineWidth = 2.6;
            ctx.strokeRect(t.x * TILE + 3.5, t.y * TILE + 3.5, TILE - 7, TILE - 7);
          }
        });
      }
      /* v5.14 — 성문 황금 타일은 문을 부수는 진영(공성전 아군·수성전 적군)에게만 */
      if (gateIntact() && isGateAttacker(u)) {
        activeGate().tiles.forEach((g) => {
          if (manh(u.x, u.y, g.x, g.y) > rng) return;
          ctx.fillStyle = 'rgba(226,170,72,0.42)';
          ctx.fillRect(g.x * TILE + 3, g.y * TILE + 3, TILE - 6, TILE - 6);
          ctx.strokeStyle = 'rgba(255,222,150,0.95)';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(g.x * TILE + 3, g.y * TILE + 3, TILE - 6, TILE - 6);
        });
      }
    }
    // selection ring
    ctx.save();
    ctx.strokeStyle = 'rgba(255,232,150,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc((u.x + 0.5) * TILE, (u.y + 0.86) * TILE, TILE * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (hoverTile && (hoverTile.x !== u.x || hoverTile.y !== u.y)) drawTerrainBadge(hoverTile.x, hoverTile.y, true);
  }

  /* 타일 지형 방어 배지 — 화면 크기에 맞춰 일정하게 보인다 */
  function drawTerrainBadge(x, y, dim, high) {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const tr = SK.TERRAIN[B.tiles[y][x]] || SK.TERRAIN.P;
    const label = `${tr.name}${tr.def ? ` 방어${tr.def > 0 ? '+' : ''}${Math.round(tr.def * 100)}%` : ''}`;
    const k = 1 / Math.max(0.42, cam.s);
    ctx.save();
    ctx.font = `bold ${Math.round(9 * k)}px "Noto Sans CJK KR", sans-serif`;
    const tw = ctx.measureText(label).width;
    const w = tw + 12 * k, hh = 14 * k;
    const bx = (x + 0.5) * TILE - w / 2;
    const by = high ? y * TILE - TILE * 1.42 : y * TILE - hh - 4 * k;
    ctx.globalAlpha = dim ? 0.8 : 1;
    ctx.fillStyle = 'rgba(36,29,16,0.84)';
    ctx.strokeStyle = 'rgba(227,189,99,0.62)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(bx, by, w, hh, 5 * k); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(bx, by, w, hh); ctx.strokeRect(bx, by, w, hh);
    }
    ctx.fillStyle = tr.def > 0 ? '#cbe6a8' : '#e8d7ad';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, (x + 0.5) * TILE, by + hh / 2 + 0.5);
    ctx.restore();
  }

  function drawUnits() {
    drawBondLinks();
    const sorted = B.units.filter((u) => u.alive).sort((a, b) => a.y - b.y);
    sorted.forEach((u) => drawUnit(u));
  }

  function drawBondLinks() {
    if (!SK.bondsOf) return;
    const alive = B.units.filter((u) => u.alive);
    const pulse = 0.35 + 0.3 * Math.sin(performance.now() / 430);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (a.side !== b.side) continue;
        if (cheb(a.x, a.y, b.x, b.y) > 2) continue;
        const bond = SK.bondBetween(a.name, b.name);
        if (!bond || bond.relation !== '친밀') continue;
        const ax = (a.rx + 0.5) * TILE, ay = (a.ry + 0.55) * TILE;
        const bx2 = (b.rx + 0.5) * TILE, by2 = (b.ry + 0.55) * TILE;
        const mx = (ax + bx2) / 2, my = (ay + by2) / 2 - 10;
        ctx.save();
        ctx.strokeStyle = `rgba(246,214,120,${pulse})`;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(255,238,180,${0.55 + pulse * 0.4})`;
        ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6b3f10';
        ctx.font = 'bold 8px "Noto Serif CJK KR", serif';
        ctx.textAlign = 'center';
        ctx.fillText('연', mx, my + 3);
        ctx.restore();
      }
    }
  }

  /* ── SD 스프라이트 크기 정규화 ──
     그림마다 캔버스 여백과 가로세로 비율이 달라 같은 타일 위에서도 키가 들쭉날쭉했다.
     이미지를 한 번 뜯어 보이는 부분(알파 경계)을 재 두고, 그 높이를 언제나 같게 그린다. */
  const spriteBox = {};
  function unitBox(img) {
    const key = img.currentSrc || img.src;
    if (spriteBox[key]) return spriteBox[key];
    let box = null;
    try {
      const nw = img.naturalWidth, nh = img.naturalHeight;
      if (nw && nh) {
        const cv = document.createElement('canvas');
        cv.width = nw; cv.height = nh;
        const c2 = cv.getContext('2d', { willReadFrequently: true });
        c2.drawImage(img, 0, 0);
        const d = c2.getImageData(0, 0, nw, nh).data;
        let x0 = nw, y0 = nh, x1 = -1, y1 = -1;
        for (let y = 0; y < nh; y++) {
          const row = y * nw * 4;
          for (let x = 0; x < nw; x++) {
            if (d[row + x * 4 + 3] > 40) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 >= x0 && y1 >= y0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      }
    } catch (e) { /* 캔버스를 읽을 수 없으면 원본 크기 그대로 */ }
    if (!box) box = { x: 0, y: 0, w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
    spriteBox[key] = box;
    return box;
  }

  const SIDE_TINT = {
    ally: { ring: '#3d8bff', ringSoft: 'rgba(90,160,255,0.30)', bar: ['#4f9bff', '#a9d2ff'], chip: '#2f6fd0', label: '아' },
    enemy: { ring: '#ff4a34', ringSoft: 'rgba(255,90,60,0.28)', bar: ['#e2452f', '#ff9d84'], chip: '#bf3325', label: '적' },
  };

  /* 병과 배지 — HP 배지 옆에 붙어 서 있는 SD 영웅의 병과를 바로 읽게 한다 (v5) */
  const CLASS_BADGE = {
    gunwoong: ['👑', '군주'], gibi: ['🐎', '기병'], gunggi: ['🏹', '궁기'], changbyung: ['🗡', '창병'],
    geombyung: ['🛡', '검병'], sanjeok: ['🪓', '산적'], sujeok: ['🔱', '수적'], chaeksa: ['📜', '책사'],
    pungsusa: ['🌿', '풍수'], dosa: ['☯', '도사'], gungsu: ['🏹', '궁수'], mudoga: ['👊', '무도'],
    yasubyung: ['🐯', '야수'], muhui: ['💃', '무희'], yeonnobyung: ['🏹', '연노'], deunggabyung: ['🛡', '등갑'],
    gunakdae: ['🥁', '군악'], pocha: ['💥', '포차'], balseokcha: ['💥', '발석'],
  };
  const BADGE_BG = {
    ally: 'rgba(30,52,92,0.9)', enemy: 'rgba(74,26,20,0.9)',
  };

  function drawUnit(u) {
    const ux = u.rx == null ? u.x : u.rx;
    const uy = u.ry == null ? u.y : u.ry;
    const bx = (ux + 0.5) * TILE;
    const by = (uy + 1) * TILE - 4;
    const img = unitImgFor(u);
    const tint = SIDE_TINT[u.side] || SIDE_TINT.enemy;
    const ready = img.complete && img.naturalWidth;
    // 스프라이트를 보이는 높이 기준으로 통일 (넓은 말·공성차는 살짝 줄여 무게를 맞춘다)
    const box = ready ? unitBox(img) : { x: 0, y: 0, w: 3, h: 4 };
    /* v5.17 — 전직 단계마다 SD가 조금씩 커진다 */
    const tier = clamp(Number(u.tier) || 0, 0, 3);
    const targetH = TILE * (0.9 + 0.022 * tier);
    let sc = targetH / Math.max(1, box.h);
    const ar = box.w / Math.max(1, box.h);
    if (ar > 0.82) sc *= Math.max(0.76, 0.82 / ar);
    const dh = box.h * sc, dw = box.w * sc;
    const dx = bx - dw / 2;
    const dy = by - dh;
    const topY = by - dh;
    ctx.save();
    if (u.shake > 0) ctx.translate(rnd(-3, 3) * Math.min(1, u.shake / 240), rnd(-2, 2) * Math.min(1, u.shake / 240));
    // 발밑 그림자 + 진영 발판 (아군 파랑 · 적군 빨강)
    ctx.fillStyle = 'rgba(22,18,10,0.30)';
    ctx.beginPath();
    ctx.ellipse(bx, by - 1, TILE * 0.27, TILE * 0.115, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tint.ringSoft;
    ctx.beginPath();
    ctx.ellipse(bx, by - 2, TILE * 0.3, TILE * 0.135, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = tint.ring;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = tint.ring;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(bx, by - 2, TILE * 0.3, TILE * 0.135, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    /* v5.17 — 전직 3단계 외형: 1단계 동테 · 2단계 은테 · 3단계 금테+오라 */
    if (tier > 0) {
      const tcol = tier >= 3 ? '255,211,92' : (tier === 2 ? '212,220,228' : '198,140,60');
      const pulse = tier >= 3 ? (0.60 + 0.30 * Math.sin(performance.now() / 260)).toFixed(2) : '0.78';
      ctx.save();
      ctx.strokeStyle = `rgba(${tcol},${pulse})`;
      ctx.lineWidth = tier >= 3 ? 4.4 : (tier === 2 ? 3.2 : 2.6);
      ctx.beginPath();
      ctx.ellipse(bx, by - 2, TILE * (0.34 + tier * 0.02), TILE * (0.152 + tier * 0.008), 0, 0, Math.PI * 2);
      ctx.stroke();
      if (tier >= 3) {
        ctx.strokeStyle = `rgba(${tcol},0.34)`;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.ellipse(bx, by - 2, TILE * 0.41, TILE * 0.19, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (ready) {
      ctx.save();
      if (u.side === 'enemy') ctx.filter = 'saturate(0.9) brightness(0.99)';
      /* v5.17 — 전직 단계가 높을수록 SD에 은은한 빛테를 두른다 */
      if (tier > 0) {
        ctx.shadowColor = tier >= 3 ? 'rgba(255,208,90,0.95)' : (tier === 2 ? 'rgba(220,230,240,0.9)' : 'rgba(198,140,60,0.85)');
        ctx.shadowBlur = 6 + tier * 4;
      }
      ctx.drawImage(img, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
      if (u.flash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.85, u.flash);
        if ('filter' in ctx) ctx.filter = 'brightness(0.5) sepia(1) saturate(8) hue-rotate(-18deg)';
        ctx.drawImage(img, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
        ctx.restore();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = u.side === 'ally' ? '#40609a' : '#9a4038';
      ctx.fillRect(bx - 12, by - 40, 24, 38);
    }
    // 행동 완료 표시
    if (u.side === 'ally' && u.acted) {
      ctx.fillStyle = 'rgba(20,26,40,0.26)';
      ctx.beginPath(); ctx.ellipse(bx, by - 2, TILE * 0.31, TILE * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 배지(아/적) + 병력 숫자 + 병력 바 — 화면 배율과 무관하게 읽히도록
    const k = clamp(1 / Math.max(0.5, cam.s), 1, 1.55);
    const num = Math.round(u.hp).toLocaleString('ko-KR');
    const bh = 6;
    const bw = Math.max(TILE * 0.66, 0);
    const barY = topY - 8 - bh;
    const fsz = Math.round(9 * k);
    ctx.font = `800 ${fsz}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
    const numW = ctx.measureText(num).width;
    const chipW = Math.round(11 * k);
    const pillW = chipW + numW + Math.round(9 * k);
    const pillH = Math.round(13 * k);
    const pillX = bx - pillW / 2;
    const pillY = barY - pillH - Math.round(2 * k);
    ctx.save();
    ctx.fillStyle = 'rgba(24,19,11,0.86)';
    ctx.strokeStyle = u.side === 'ally' ? 'rgba(130,180,255,0.75)' : 'rgba(255,150,130,0.7)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2); ctx.fill(); ctx.stroke(); }
    else { ctx.fillRect(pillX, pillY, pillW, pillH); ctx.strokeRect(pillX, pillY, pillW, pillH); }
    ctx.fillStyle = tint.chip;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(pillX + 1, pillY + 1, chipW, pillH - 2, (pillH - 2) / 2); ctx.fill(); }
    else ctx.fillRect(pillX + 1, pillY + 1, chipW, pillH - 2);
    ctx.fillStyle = '#fff6e2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(fsz * 0.82)}px "Noto Sans CJK KR", sans-serif`;
    ctx.fillText(tint.label, pillX + 1 + chipW / 2, pillY + pillH / 2 + 0.5);
    ctx.font = `800 ${fsz}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fffaf0';
    ctx.fillText(num, pillX + chipW + Math.round(4 * k), pillY + pillH / 2 + 0.5);
    ctx.restore();
    // 병과 배지 — [🐎 기병] 형태의 작은 칩을 HP 배지 왼쪽에 붙인다
    const badge = CLASS_BADGE[u.cls] || ['', SK.CLASSES[u.cls] ? SK.CLASSES[u.cls].name.slice(0, 2) : ''];
    if (badge[1]) {
      const bsz = Math.max(7, Math.round(7.4 * k));
      ctx.save();
      ctx.font = `800 ${bsz}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
      const btxt = badge[1];
      const bw2 = ctx.measureText(btxt).width + Math.round(8 * k);
      const bh2 = Math.round(12 * k);
      // HP 배지 같은 줄 왼쪽(적군은 오른쪽)에 작게 붙여 이웃 부대와 겹치지 않게 한다
      const bx2 = u.side === 'enemy' ? pillX + pillW + Math.round(3 * k) : pillX - bw2 - Math.round(3 * k);
      const by2 = pillY + (pillH - bh2) / 2;
      ctx.fillStyle = BADGE_BG[u.side] || BADGE_BG.enemy;
      ctx.strokeStyle = u.side === 'ally' ? 'rgba(150,190,255,0.55)' : 'rgba(255,170,150,0.5)';
      ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx2, by2, bw2, bh2, bh2 / 2); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(bx2, by2, bw2, bh2); ctx.strokeRect(bx2, by2, bw2, bh2); }
      ctx.fillStyle = '#f4ead2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btxt, bx2 + bw2 / 2, by2 + bh2 / 2 + 0.5);
      ctx.restore();
    }
    // 병력 바
    const p = clamp(u.hp / u.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(18,14,8,0.8)';
    ctx.fillRect(bx - bw / 2 - 1, barY - 1, bw + 2, bh + 2);
    const grad = ctx.createLinearGradient(bx - bw / 2, barY, bx + bw / 2, barY + bh);
    grad.addColorStop(0, tint.bar[0]);
    grad.addColorStop(1, tint.bar[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(bx - bw / 2, barY, bw * p, bh);
    ctx.strokeStyle = tint.ring;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - bw / 2 - 1.5, barY - 1.5, bw + 3, bh + 3);
    // 적장 표시
    if (u.boss) {
      ctx.fillStyle = '#ffd766';
      ctx.font = `bold ${Math.round(TILE * 0.2)}px "Noto Serif CJK KR", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('◆', bx, pillY - 3 * k);
    }
    /* v5.17 — 총대장(적 총대장·아군 총대장) 금관 · 전직 2~3단계 깃발 */
    if (u.leader) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `bold ${Math.round(13 * k)}px "Noto Sans CJK KR", sans-serif`;
      ctx.fillStyle = '#ffd35c';
      ctx.fillText('♛', bx + (u.side === 'enemy' ? 0 : 0), pillY - 2 * k);
      ctx.restore();
    } else if (tier >= 1) {
      /* 전직 표식 — 1단계 ★(동) · 2단계 ⚑(은) · 3단계 ♛(금). 어두운 테두리를 둘러 어떤 바닥에서도 읽힌다 */
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const fs = Math.round((tier >= 3 ? 15 : 13) * k);
      ctx.font = `900 ${fs}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(30,22,8,0.85)';
      const mark = tier >= 3 ? '♛' : (tier === 2 ? '⚑' : '★');
      ctx.strokeText(mark, bx, pillY - 13 * k);
      ctx.fillStyle = tier >= 3 ? '#ffd35c' : (tier === 2 ? '#eef4ff' : '#e0a452');
      ctx.fillText(mark, bx, pillY - 13 * k);
      ctx.restore();
    }
    // 강화 표시
    if (u.buffs.atk || u.buffs.def) {
      ctx.fillStyle = '#8fd0ff';
      ctx.beginPath(); ctx.arc(bx + bw / 2, barY + bh / 2, 3.2 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ───────────── 이펙트 ───────────── */
  function addFx(o) { fx.push(Object.assign({ t: 0, life: 420 }, o)); }
  function addFloat(x, y, text, color) { floats.push({ x, y, text, color, life: 950, t: 0 }); }

  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.t > f.life) {
        fx.splice(i, 1);
        if (f.onEnd) { const cb = f.onEnd; f.onEnd = null; try { cb(); } catch (e) { console.error(e); } }
      }
    }
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > floats[i].life) floats.splice(i, 1); }
  }

  function drawFx() {
    fx.forEach((f) => {
      const p = f.t / f.life;
      ctx.save();
      if (f.kind === 'slash') {
        ctx.strokeStyle = `rgba(255,240,190,${1 - p})`;
        ctx.lineWidth = 5 * (1 - p) + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, TILE * 0.55, -0.9, 0.9 + p * 0.6);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,120,80,${0.7 * (1 - p)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (f.kind === 'arrow') {
        const tx = f.x + (f.tx - f.x) * p, ty = f.y + (f.ty - f.y) * p;
        ctx.strokeStyle = 'rgba(255,245,210,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = '#ffe6a8';
        ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'heal') {
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9 + p * 3;
          const r = TILE * 0.15 + p * TILE * 0.45;
          ctx.fillStyle = `rgba(150,240,180,${0.8 * (1 - p)})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r - p * 24, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(140,230,170,${(1 - p) * 0.7})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, TILE * (0.3 + p * 0.5), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'fire') {
        for (let i = 0; i < 10; i++) {
          const a = i * 2.1;
          const r = TILE * 0.5 * p;
          ctx.fillStyle = `rgba(${220 + i * 3},${120 - i * 6},40,${0.55 * (1 - p)})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r - p * 30, 5 * (1 - p) + 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'buff') {
        ctx.strokeStyle = `rgba(${f.color || '150,210,255'},${0.8 * (1 - p)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, TILE * (0.25 + p * 0.55), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'step') {
        ctx.fillStyle = `rgba(240,226,180,${0.4 * (1 - p)})`;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, TILE * 0.22, TILE * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'dust') {
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05;
          const d = TILE * (0.12 + p * 0.5);
          ctx.fillStyle = `rgba(214,198,164,${(1 - p) * 0.42})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.5, 3.5 * (1 - p) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'proj') {
        const ease = p * p * (3 - 2 * p);
        const x = f.x + (f.tx - f.x) * ease;
        const y = f.y + (f.ty - f.y) * ease - Math.sin(p * Math.PI) * TILE * (f.arc || 0.12) * 4;
        const ang = Math.atan2(f.ty - f.y, f.tx - f.x);
        // 궤적 잔상
        const trail = f.sub === 'rock' ? 34 : 26;
        ctx.strokeStyle = `rgba(255,236,190,${0.16 + 0.24 * (1 - p)})`;
        ctx.lineWidth = f.sub === 'rock' ? 4 : 2.4;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ang) * trail, y - Math.sin(ang) * trail);
        ctx.lineTo(x, y);
        ctx.stroke();
        // 밝은 테두리 + 본체
        if (f.sub === 'rock') {
          ctx.fillStyle = 'rgba(30,22,10,0.55)';
          ctx.beginPath(); ctx.arc(x, y, 9.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#9c8a62';
          ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,238,190,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
        } else if (f.sub === 'bolt') {
          ctx.strokeStyle = 'rgba(40,30,12,0.6)'; ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(ang) * 18, y - Math.sin(ang) * 18);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.strokeStyle = '#fff4c4'; ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(ang) * 18, y - Math.sin(ang) * 18);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.fillStyle = '#ffe9a0';
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(38,28,12,0.65)'; ctx.lineWidth = 4.4;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(ang) * 20, y - Math.sin(ang) * 20);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.strokeStyle = '#fff6d6'; ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(ang) * 18, y - Math.sin(ang) * 18);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.fillStyle = '#fff6d6';
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(ang) * 6, y + Math.sin(ang) * 6);
          ctx.lineTo(x - Math.cos(ang - 0.45) * 6, y - Math.sin(ang - 0.45) * 6);
          ctx.lineTo(x - Math.cos(ang + 0.45) * 6, y - Math.sin(ang + 0.45) * 6);
          ctx.closePath(); ctx.fill();
        }
      } else if (f.kind === 'burst') {
        const r = TILE * (0.15 + p * 0.55);
        ctx.strokeStyle = `rgba(255,236,180,${(1 - p) * 0.9})`;
        ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + 0.3;
          const d = TILE * (0.15 + p * 0.7);
          ctx.fillStyle = `rgba(${f.color || '255,214,120'},${(1 - p) * 0.9})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 2.6 * (1 - p) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'ring') {
        ctx.strokeStyle = `rgba(${f.color || '180,210,255'},${(1 - p) * 0.8})`;
        ctx.lineWidth = 3 * (1 - p) + 0.8;
        ctx.beginPath(); ctx.arc(f.x, f.y, TILE * (0.2 + p * 0.9), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'spell') {
        const r = TILE * (0.26 + p * 0.42);
        const rot = p * Math.PI * 2.2;
        ctx.strokeStyle = `rgba(${f.color || '170,200,255'},${(1 - p) * 0.85})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.62, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = rot + i * Math.PI / 3;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * r * 0.62, f.y + Math.sin(a) * r * 0.62);
          ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
          ctx.stroke();
        }
      } else if (f.kind === 'bolt') {
        const top = f.y - TILE * 2.6;
        ctx.strokeStyle = `rgba(220,240,255,${(1 - p) * 0.95})`;
        ctx.lineWidth = 3.5 * (1 - p) + 1;
        ctx.beginPath();
        ctx.moveTo(f.x, top);
        for (let i = 1; i <= 6; i++) {
          const ny = top + (f.y - top) * (i / 6);
          const nx = f.x + (i === 6 ? 0 : rnd(-12, 12));
          ctx.lineTo(nx, ny);
        }
        ctx.stroke();
        ctx.fillStyle = `rgba(200,230,255,${(1 - p) * 0.35})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, TILE * 0.35 * (1 - p) + 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawFloats() {
    floats.forEach((f) => {
      const p = f.t / f.life;
      const sx = f.x * cam.s + cam.x, sy = f.y * cam.s + cam.y - p * 38;
      ctx.save();
      ctx.globalAlpha = 1 - p * 0.85;
      ctx.font = 'bold 17px "Noto Serif CJK KR", serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = 'rgba(24,18,8,0.92)';
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color || '#fff2c8';
      ctx.fillText(f.text, sx, sy);
      ctx.restore();
    });
  }

  /* ───────────── 이동 · 전투 애니메이션 ───────────── */
  function findPath(u, tx, ty) {
    if (!u || (u.x === tx && u.y === ty)) return [];
    const key = (x, y) => x + ',' + y;
    const dist = new Map();
    const prev = new Map();
    dist.set(key(u.x, u.y), 0);
    const open = [{ x: u.x, y: u.y, c: 0 }];
    const blocked = (x, y) => B.units.some((o) => o.alive && o !== u && o.x === x && o.y === y);
    let found = false;
    let guard = 0;
    while (open.length && guard++ < 900) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].c < open[bi].c) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (dist.get(key(cur.x, cur.y)) < cur.c) continue;
      if (cur.x === tx && cur.y === ty) { found = true; break; }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cur.x + dx, ny = cur.y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const cost = moveCost(u.cls, B.tiles[ny][nx], nx, ny, u.side);
          if (cost >= 90) continue;
          if (blocked(nx, ny)) continue;
          const nc = cur.c + cost;
          const k = key(nx, ny);
          if (dist.has(k) && dist.get(k) <= nc) continue;
          dist.set(k, nc);
          prev.set(k, { x: cur.x, y: cur.y });
          open.push({ x: nx, y: ny, c: nc });
        }
      }
    }
    if (!found) return [];
    const path = [];
    let cx = tx, cy = ty, guard2 = 0;
    while (!(cx === u.x && cy === u.y) && guard2++ < 400) {
      path.unshift([cx, cy]);
      const p = prev.get(key(cx, cy));
      if (!p) return [];
      cx = p.x; cy = p.y;
    }
    return path;
  }

  function animatePath(u, path, opts) {
    opts = opts || {};
    const done = opts.onDone || function () { };
    if (!path || !path.length) { done(); return; }
    u.rx = u.x; u.ry = u.y;
    anims.push({ kind: 'walk', u, path, i: 0, t: 0, dur: opts.step || 105, cam: !!opts.cam, done });
  }

  function updateAnims(dt) {
    for (let k = anims.length - 1; k >= 0; k--) {
      const a = anims[k];
      a.t += dt;
      if (a.kind === 'walk') {
        const seg = a.path[a.i];
        if (!seg) { a.u.rx = a.u.x; a.u.ry = a.u.y; anims.splice(k, 1); a.done(); continue; }
        const from = a.i === 0
          ? { x: a.path.length ? a.u.rx : a.u.x, y: a.path.length ? a.u.ry : a.u.y }
          : { x: a.path[a.i - 1][0], y: a.path[a.i - 1][1] };
        const p = Math.min(1, a.t / a.dur);
        a.u.rx = from.x + (seg[0] - from.x) * p;
        a.u.ry = from.y + (seg[1] - from.y) * p;
        if (a.cam) followCam(a.u);
        if (p >= 1) {
          a.u.x = seg[0]; a.u.y = seg[1];
          a.u.rx = a.u.x; a.u.ry = a.u.y;
          a.i += 1; a.t = 0;
          addFx({ kind: 'step', x: (a.u.x + 0.5) * TILE, y: (a.u.y + 0.95) * TILE, life: 300 });
          SK.sfx.play('step');
          if (a.i >= a.path.length) {
            anims.splice(k, 1);
            addFx({ kind: 'dust', x: (a.u.x + 0.5) * TILE, y: (a.u.y + 0.9) * TILE, life: 430 });
            a.done();
          }
        }
      } else if (a.kind === 'lunge') {
        const p = Math.min(1, a.t / a.dur);
        const swing = Math.sin(p * Math.PI);
        a.u.rx = a.ax + a.dx * swing;
        a.u.ry = a.ay + a.dy * swing;
        if (p >= 1) {
          a.u.rx = a.ax; a.u.ry = a.ay;
          anims.splice(k, 1);
          a.done();
        }
      }
    }
  }

  function updateUnits(dt) {
    if (!B) return;
    B.units.forEach((u) => {
      if (u.rx == null) { u.rx = u.x; u.ry = u.y; }
      if (u.flash > 0) u.flash = Math.max(0, u.flash - dt / 280);
      if (u.shake > 0) u.shake = Math.max(0, u.shake - dt);
    });
  }

  function followCam(u) {
    if (!canvas) return;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const sx = (u.rx + 0.5) * TILE * cam.s + cam.x;
    const sy = (u.ry + 0.5) * TILE * cam.s + cam.y;
    const mx = Math.min(140, w * 0.22), my = Math.min(140, h * 0.22);
    let dx = 0, dy = 0;
    if (sx < mx) dx = mx - sx; else if (sx > w - mx) dx = w - mx - sx;
    if (sy < my) dy = my - sy; else if (sy > h - my) dy = h - my - sy;
    if (dx || dy) { cam.x += dx * 0.3; cam.y += dy * 0.3; camClamp(); }
  }

  function lunge(a, d, cb) {
    if (!a || !d) { cb(); return; }
    a.rx = a.x; a.ry = a.y;
    anims.push({ kind: 'lunge', u: a, t: 0, dur: 300, ax: a.x, ay: a.y,
      dx: Math.sign(d.x - a.x) * 0.42, dy: Math.sign(d.y - a.y) * 0.42, done: cb });
  }

  function launchProjectile(a, d, kind, onHit) {
    const sx = (a.rx == null ? a.x : a.rx) + 0.5;
    const sy = (a.ry == null ? a.y : a.ry) + 0.45;
    const tx = (d.rx == null ? d.x : d.rx) + 0.5;
    const ty = (d.ry == null ? d.y : d.ry) + 0.45;
    const dist = Math.hypot((tx - sx) * TILE, (ty - sy) * TILE);
    const arc = kind === 'rock' ? 0.45 : 0.12;
    addFx({ kind: 'proj', sub: kind, x: sx * TILE, y: sy * TILE, tx: tx * TILE, ty: ty * TILE,
      arc, life: clamp(dist * 0.55, 150, 620), onEnd: onHit });
    if (kind === 'rock') SK.sfx.play('rock'); else SK.sfx.play('bow');
  }

  /* ───────────── 인연 · 숙적 ───────────── */
  function bondAllyMul(u) {
    if (!u || !u.name || !SK.bondsOf) return 1;
    const bonds = SK.bondsOf(u.name);
    if (!bonds.length) return 1;
    for (let i = 0; i < bonds.length; i++) {
      const b = bonds[i];
      if (b.relation !== '친밀') continue;
      const partner = SK.bondPartner(b, u.name);
      const mate = B.units.find((o) => o.alive && o !== u && o.side === u.side && o.name === partner && cheb(u.x, u.y, o.x, o.y) <= 2);
      if (mate) return 1.15;
    }
    return 1;
  }

  function updateBonds(dt) {
    if (!B || B.over) return;
    bondTick += dt;
    if (bondTick < 420) return;
    bondTick = 0;
    if (!SK.bondsOf) return;
    B.bondSeen = B.bondSeen || {};
    const alive = B.units.filter((u) => u.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (a.side !== b.side) continue;
        if (cheb(a.x, a.y, b.x, b.y) > 2) continue;
        const bond = SK.bondBetween(a.name, b.name);
        if (!bond || bond.relation !== '친밀') continue;
        const key = bond.id + ':' + a.side;
        if (B.bondSeen[key]) continue;
        B.bondSeen[key] = true;
        feed(`인연 · ${bond.title} — ${a.name} · ${b.name}`, 'friend');
        addFloat((a.rx + 0.5) * TILE, (a.ry + 0.1) * TILE, '공격 +15%', '#ffe6a0');
      }
    }
  }

  function feed(text, kind) {
    const el = $('#battle-feed');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'feed-pill ' + (kind || '');
    d.textContent = text;
    el.appendChild(d);
    requestAnimationFrame(() => d.classList.add('in'));
    wait(() => { d.classList.remove('in'); wait(() => d.remove(), 260); }, 3800);
    while (el.children.length > 3) el.firstChild.remove();
  }

  /* v5.0.1 — [공격]·[책략]을 누르면 사거리 안의 대상을 버튼으로 보여 준다 */
  function renderTargetBar() {
    const tb = $('#battle-targets');
    if (!tb) return;
    const u = B && B.sel;
    const active = B && B.phase === 'ally' && !B.over && u && !u.acted && (mode === 'attack' || mode === 'skillTarget');
    if (!active) { tb.hidden = true; tb.innerHTML = ''; return; }
    const heal = pendingSkill && (pendingSkill.kind === 'heal' || pendingSkill.kind === 'buffAlly');
    const rng = pendingSkill && pendingSkill.range ? pendingSkill.range : effRng(u);
    /* v5.13 — 회복은 시전자 자신(거리 0)도 고를 수 있다 */
    const minR = heal ? 0 : (pendingSkill ? (pendingSkill.minRange || 1) : (u.minRng || 1));
    const list = B.units.filter((t) => {
      if (!t.alive) return false;
      if (heal) return t.side === u.side && manh(u.x, u.y, t.x, t.y) <= rng;
      if (t.side === u.side) return false;
      const d = manh(u.x, u.y, t.x, t.y);
      return d >= minR && d <= rng;
    });
    tb.hidden = false;
    if (!list.length) {
      tb.innerHTML = `<span class="bt-hint">${heal ? '사거리 안 아군' : '사거리 안 적'}이 없습니다 — 한 칸 더 붙으세요</span>`;
      return;
    }
    tb.innerHTML = `<span class="bt-hint">${heal ? '아군' : '적'} 선택</span>`
      + list.map((t) => {
        const me = heal && t === u;                    // v5.13 — 자기 자신은 '나'로 표시
        return `<button class="bt-chip ${t.side}${me ? ' self' : ''}" data-id="${t.id}"><b>${me ? `나 (${t.name})` : t.name}</b><em>${Math.round(t.hp).toLocaleString('ko-KR')}</em></button>`;
      }).join('');
    tb.querySelectorAll('.bt-chip').forEach((b) => {
      b.onclick = () => {
        const t = B.units.find((x) => x.id === b.dataset.id);
        if (!t) return;
        if (mode === 'attack') openAttackPreview(u, t);
        else trySkillAt(t.x, t.y);
      };
    });
  }

  function showCallout(text, kind) {
    const el = $('#battle-callout');
    if (!el) return;
    el.textContent = text;
    el.className = 'battle-callout show ' + (kind || '');
    clearTimeout(calloutTimer);
    calloutTimer = wait(() => el.classList.remove('show'), 1750);
  }

  function shakeScreen(amp) { shakeAmp = amp || 5; shakeT = 240; }

  function rivalClash(bond, a, d) {
    B.rivalSeen = B.rivalSeen || {};
    const key = bond.id + ':' + [a.name, d.name].sort().join('|');
    const now = performance.now();
    if (B.rivalSeen[key] && now - B.rivalSeen[key] < 1400) return;
    B.rivalSeen[key] = now;
    showCallout(`숙적 · ${bond.title}`, 'rival');
    feed(`${a.name} ↔ ${d.name} — ${bond.title} (피해 +20%)`, 'rival');
    SK.sfx.play('drum');
    shakeScreen(6);
  }

  /* ───────────── 전투 규칙 ───────────── */
  function terr(u) { return SK.TERRAIN[B.tiles[u.y][u.x]] || SK.TERRAIN.P; }
  function buffVal(u, k) { const b = u.buffs[k]; return b && b.t > 0 ? b.v : 0; }

  function typeBonus(u) { return (SK.terrainBonus(u.cls, B.type) || 0) / 100; }

  /* ── v5.2 성문 규칙 · v5.11 겹성벽 ── */
  function activeGate() {
    if (!B) return null;
    if (B.gates && B.gates.length) return B.gates.find((g) => g.hp > 0) || B.gates[B.gates.length - 1];
    return B.gate || null;
  }
  function gateIntact() { const g = activeGate(); return !!(g && g.hp > 0); }
  function gateTileAt(x, y) {
    if (!B) return false;
    const list = B.gates && B.gates.length ? B.gates : (B.gate ? [B.gate] : []);
    return list.some((g) => g.hp > 0 && g.tiles.some((t) => t.x === x && t.y === y));
  }
  /* 성문 안쪽/바깥쪽을 가로지르는가 (그 성벽의 문이 살아 있으면 근접으로는 못 넘는다) */
  function wallBlocked(a, d) {
    if (!B || !a || !d) return false;
    const list = (B.gates && B.gates.length ? B.gates : (B.gate ? [B.gate] : [])).filter((g) => g.hp > 0);
    return list.some((g) => (a.y > g.row) !== (d.y > g.row));
  }

  /* 병력 수가 곧 전투력 — 만성 부대(약 1,800)를 1.0으로 둔다 */
  function troopPower(u) {
    const ratio = Math.max(0, u.hp) / Math.max(1, u.maxHp);
    const abs = Math.min(1.45, Math.max(0.5, Math.sqrt(Math.max(200, u.hp) / 1800)));
    return (0.44 + 0.56 * ratio) * abs;
  }
  function troopGuard(u) {
    const ratio = Math.max(0, u.hp) / Math.max(1, u.maxHp);
    return 0.7 + 0.3 * ratio;
  }
  function effAtk(u) {
    const ch = B.tiles[u.y][u.x];
    const aff = SK.affinity(u.cls, ch);
    return u.atk * troopPower(u) * (1 + buffVal(u, 'atk') + aff.atk * 1.3 + typeBonus(u) * 1.25) * bondAllyMul(u);
  }
  function effDef(u) {
    const ch = B.tiles[u.y][u.x];
    const aff = SK.affinity(u.cls, ch);
    /* 방어 강화·약화를 실제 피해 계산에 반영한다 (0 아래로는 내려가지 않는다) */
    const mul = Math.max(0.05, 1 + buffVal(u, 'def'));
    /* v5.3 — 망루·본성 위에서는 방어 +45% */
    const hold = (ch === 'T' || ch === 'K') ? 1.45 : 1;
    /* v5.17 — 본진 위 +25% · 점령한 마을 위 +15% */
    const site = siteBonusOf(u);
    const sit = site ? site.def : 1;
    return u.def * troopGuard(u) * (1 - terr(u).def * 1.0 + aff.def * 1.25 + typeBonus(u) * 0.6) * mul * hold * sit;
  }
  function effRng(u) {
    const aff = SK.affinity(u.cls, B.tiles[u.y][u.x]);
    return u.rng + Math.min(1, aff.rng + wallRngBonus(u));
  }
  /* v5.15 — 수성전: 성벽·망루·안쪽 진지(C·T·K) 위에 선 원거리·공성 병과는 사거리 +1.
     산·성 지형 보너스(aff.rng)와 겹쳐도 최대 +1까지만 (effRng에서 합산해 자른다). */
  const WALL_RNG_CLS = { gungsu: 1, gunggi: 1, yeonnobyung: 1, pocha: 1, balseokcha: 1 };
  function wallRngBonus(u) {
    if (!B || !u || !WALL_RNG_CLS[u.cls]) return 0;
    /* v5.17 — 성을 지키는 쪽(공성전이면 적, 수성전이면 아군)이 성벽·망루·본성 위에서 쏘면 +1 */
    const defending = B.defense ? u.side === 'ally' : u.side === 'enemy';
    if (!defending) return 0;
    const ch = B.tiles[u.y] && B.tiles[u.y][u.x];
    return (ch === 'C' || ch === 'T' || ch === 'K') ? 1 : 0;
  }
  /* v5.0.3 — 책략 공격력(책공)과 책략 방어력(책방/정신력).
     지력이 책공의 바탕이고, 지력+통솔이 책방의 바탕이다. 병력이 줄면 함께 약해진다. */
  function magicAtk(u) {
    const tp = troopPower(u);
    return (u.ji * 1.05 + u.lv * 3 + Math.min(400, u.hp * 0.02) * 0.25) * tp * (1 + buffVal(u, 'atk') * 0.6);
  }
  function magicDef(u) {
    const ch = B.tiles[u.y][u.x];
    const mul = Math.max(0.05, 1 + buffVal(u, 'def') * 0.6);
    return (u.ji * 0.62 + u.tong * 0.34 + u.lv * 2) * troopGuard(u) * (1 + terr(u).def * 0.6) * mul;
  }
  /* v5.22 — 성을 지키는 원거리 병과는 성벽·망루·본성 위에서 밖을 쏠 수 있다.
     (예전에는 성문이 버티는 동안 성벽 너머로 어떤 공격도 닿지 않아,
      수성전 궁수·연노병이 문이 깨질 때까지 아무것도 못 했다) */
  function canShootOut(a) {
    if (!B || !a) return false;
    const defending = B.defense ? a.side === 'ally' : a.side === 'enemy';
    if (!defending) return false;
    if (attackKind(a) === 'melee') return false;
    const row = B.tiles[a.y];
    const ch = row && row[a.x];
    return ch === 'T' || ch === 'K' || ch === 'G' || ch === 'C';
  }
  function canHit(a, d, rng) {
    const dist = manh(a.x, a.y, d.x, d.y);
    const min = a.minRng || 1;
    if (dist < min || dist > (rng || effRng(a))) return false;
    /* v5.17 — 성문이 버티는 동안에는 성벽 너머로 어떤 공격도 닿지 않는다.
       (근접만 막던 예전 규칙에서는 성 밖에서 사격·투석으로 적 총대장을 잡아 버려
        겹성벽을 뚫는 의미가 없었다) */
    if (wallBlocked(a, d) && !canShootOut(a)) return false;
    return true;
  }
  /* v5.14 — 성문 타일 한 칸을 칠 수 있는 거리인가 (성문 클릭·황금 타일과 같은 눈금) */
  function canHitTile(a, x, y) { return manh(a.x, a.y, x, y) <= effRng(a); }

  /* v5.2 — 병력 상한(5,000~20,000)에 맞춘 피해 보정.
     부대가 커진 만큼 피해도 같이 커져 다병력 일격사나 끝없는 장기전을 막는다. */
  function sizeScale(d) {
    const t = clamp((d && d.maxHp ? d.maxHp : 1800) / 1800, 0.35, 8);
    return Math.pow(t, 0.65);
  }
  function atkScale(a) {
    const t = clamp((a && a.maxHp ? a.maxHp : 1800) / 1800, 0.35, 8);
    return Math.pow(t, 0.4);
  }
  function calcDamage(a, d, opts) {
    let atk = effAtk(a);
    if (opts && opts.mult) atk *= opts.mult;
    const def = opts && opts.ignoreTerrain ? d.def : effDef(d);
    /* v5.15 — 병과 삼각 상성 (보병↔궁병↔기병↔창병) */
    const tri = SK.triangleMul ? SK.triangleMul(a.cls, d.cls) : { mul: 1, label: '' };
    /* v5.15 — 등갑병 '4딜 벽' 완화: 방어 계수 0.62 → 0.52 */
    let base = (atk * 0.92 - def * 0.52) * 16;
    base *= tri.mul;
    base *= sizeScale(d) * atkScale(a);
    base *= rnd(0.92, 1.08);
    /* v5.2 — 투석차·발석차는 일반 부대에 약하고 성문·성벽에 강하다 */
    const kind = attackKind(a, opts);
    if (kind === 'rock') base *= 0.55;
    /* v5.15 — 무희 오라의 회피(받는 피해 −8%) */
    const ev = buffVal(d, 'evade');
    if (ev > 0) base *= Math.max(0.6, 1 - ev);
    let crit = false;
    const cc = 0.05 + (a.wu - 60) * 0.0011 + (a.cls === 'sanjeok' ? 0.06 : 0) + Math.max(0, buffVal(a, 'crit'));
    if (!opts || !opts.noCrit) {
      if (Math.random() < cc) { crit = true; base *= 1.55; }
    }
    const bond = SK.bondBetween ? SK.bondBetween(a.name, d.name) : null;
    if (bond && bond.relation === '숙적') base *= 1.2;
    /* v5.15 — 최소 피해 하한: 방어 버프·지형이 겹쳐도 한 대는 들어간다 */
    let floor = Math.max(4, Math.round(atk * 2.2 * sizeScale(d) * (kind === 'rock' ? 0.55 : 1)));
    if (bond && bond.relation === '숙적') floor = Math.round(floor * 1.2);
    return { dmg: Math.max(floor, Math.round(base)), crit, bond, tri };
  }

  function rxOf(u) { return u.rx == null ? u.x : u.rx; }
  function ryOf(u) { return u.ry == null ? u.y : u.ry; }

  function attackKind(a, opts) {
    if (opts && opts.forceKind) return opts.forceKind;
    const cls = a.cls;
    if (cls === 'pocha' || cls === 'balseokcha') return 'rock';
    if (cls === 'gungsu' || cls === 'gunggi') return 'arrow';
    if (cls === 'yeonnobyung') return 'bolt';
    return 'melee';
  }

  function impactAt(d, color) {
    addFx({ kind: 'burst', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.5) * TILE, life: 430, color });
    d.flash = 1;
    d.shake = 240;
  }

  /* v5.11 — 장수별 결산(딜·탱·힐·처치) 기록 */
  function statOf(u) {
    if (!u) return { dealt: 0, taken: 0, heal: 0, kills: 0 };
    u.stat = u.stat || { dealt: 0, taken: 0, heal: 0, kills: 0 };
    return u.stat;
  }
  function addHeal(target, amount, src) {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (n && src && src.side === 'ally') statOf(src).heal += n;
    else if (n && target && target.side === 'ally') statOf(target).heal += n;
  }
  function addMagicDamage(a, d, dmg) {
    if (a) statOf(a).dealt += dmg;
    if (d) statOf(d).taken += dmg;
  }

  /* v5.17 — 전투 불능은 더 이상 "전사"가 아니다. 15% 생포 / 85% 퇴각. */
  function downUnit(u) {
    if (!u || !u.alive) return;
    u.hp = 0;
    u.alive = false;
    u.fate = Math.random() < 0.15 ? '생포' : '퇴각';
  }

  function applyDamage(a, d, dmg, crit, bond) {
    const wasAlive = d.hp > 0;
    d.hp = Math.max(0, d.hp - dmg);
    if (a) statOf(a).dealt += dmg;
    statOf(d).taken += dmg;
    if (wasAlive && d.hp <= 0 && a) statOf(a).kills += 1;
    addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.4) * TILE, (crit ? '회심! ' : '') + dmg,
      crit ? '#ffd166' : (bond ? '#ffd0c0' : '#ffe9d0'));
    if (a.side === 'ally' && a.uid) a.expGain = (a.expGain || 0) + (d.hp <= 0 ? 42 : 9);
    if (d.hp <= 0) {
      downUnit(d);
      addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.2) * TILE, d.fate === '생포' ? '생포!' : '퇴각', d.fate === '생포' ? '#ffd166' : '#ff9a7a');
      d.flash = 1;
    }
    if (window.SKBattle) SKBattle.refreshUI();
  }

  /* melee: 돌진 후 베기 / 원거리: 화살·노·석탄 비행 후 폭발 */
  function attackUnit(a, d, opts, onDone) {
    if (!a || !d) { if (onDone) onDone(); return; }
    const res = calcDamage(a, d, opts);
    const bond = res.bond && res.bond.relation === '숙적' ? res.bond : null;
    if (bond) rivalClash(bond, a, d);
    const kind = attackKind(a, opts);
    const land = () => {
      applyDamage(a, d, res.dmg, res.crit, bond);
      impactAt(d, bond ? '255,140,110' : '255,214,120');
      if (kind !== 'melee') addFx({ kind: 'ring', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.55) * TILE, life: 350 });
      SK.sfx.play('hit');
      if (onDone) onDone();
    };
    if (kind === 'melee') {
      lunge(a, d, () => {
        addFx({ kind: 'slash', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.45) * TILE, life: 380 });
        SK.sfx.play('sword');
        wait(land, 70);
      });
    } else {
      launchProjectile(a, d, kind, land);
    }
  }

  /* v5.15 — 반격: 방어자의 최소 사거리(minRng) 안쪽이면 반격하지 못한다.
     반격 피해는 일반 병과 75%, 검병은 방패 맞다이 특화로 90%. */
  const COUNTER_MUL = 0.75, COUNTER_MUL_SHIELD = 0.90;
  function counterMulOf(u) { return u && u.cls === 'geombyung' ? COUNTER_MUL_SHIELD : COUNTER_MUL; }
  function canCounterAt(a, d) {
    if (!a || !d || !a.alive || !d.alive) return false;
    const dist = manh(a.x, a.y, d.x, d.y);
    const min = a.minRng || 1;
    return dist >= min && dist <= effRng(a);
  }
  function counter(a, d) {
    // a = 반격하는 방어자, d = 공격자
    if (!canCounterAt(a, d)) return;
    const mul = counterMulOf(a);
    wait(() => {
      if (!B || !a.alive || !d.alive || B.over) return;   // v5.16 — 전투가 닫힌 뒤(B=null) 콜백 보호
      attackUnit(a, d, { mult: mul }, () => finishCheck());
    }, 240);
  }

  /* ───────────── 조작 ───────────── */
  function onTileTap(x, y) {
    if (!B || B.over || busy || !B.introDone) return;
    if (B.phase !== 'ally') return;
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const u = B.sel;
    const t = B.units.find((o) => o.alive && o.x === x && o.y === y);

    if (mode === 'skillTarget' && pendingSkill) { trySkillAt(x, y); return; }

    /* v5.2 — 성문 타일을 눌러 공략 (근접·사격·투석 모두 가능)
       v5.14 — 문을 부수는 진영만. 수성전 아군은 자기 성문을 칠 수 없다. */
    if (!t && gateIntact() && gateTileAt(x, y) && u && u.side === 'ally' && !u.acted) {
      if (!isGateAttacker(u)) {
        /* v5.21 — 수성전 성 주인은 자기 성문을 지나갈 수 있다 (누르면 이동, 공격 모드면 안내) */
        if (mode !== 'attack') {
          const reachG = B.reachCache && B.reachCache.uid === u.id ? B.reachCache.set : null;
          if (reachG && reachG.has(x + ',' + y)) { moveUnit(u, x, y); return; }
        }
        if (mode === 'attack') SK.toast('수성전 — 우리 성문은 아군이 칠 수 없습니다.');
        clearSel();
        return;
      }
      if (mode === 'attack' || mode === 'move' || mode === 'act' || mode === 'idle') {
        if (manh(u.x, u.y, x, y) <= effRng(u)) { openGateAttack(u, { x, y }); return; }
        SK.toast(`성문까지 거리가 멉니다. (사거리 ${effRng(u)})`);
        return;
      }
    }

    if (t && t.side === 'ally') {
      if (t.acted) { selectUnit(t); return; }
      if (mode === 'attack' && u && u.side !== t.side) return;
      selectUnit(t);
      return;
    }
    if (t && t.side === 'enemy') {
      if (u && u.side === 'ally' && !u.acted && mode !== 'skillTarget') {
        if (canHit(u, t)) { openAttackPreview(u, t); return; }
        SK.toast(`사거리 밖입니다. (사거리 ${effRng(u)})`);
        return;
      }
      showUnitInfo(t);
      return;
    }
    /* v5.0.1 — 적을 살짝 빗나가게 눌러도 사거리 안의 적을 잡아 준다 */
    if (!t && u && u.side === 'ally' && !u.acted && mode === 'attack') {
      const near = B.units.filter((o) => o.alive && o.side !== u.side && Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1 && canHit(u, o));
      if (near.length) { openAttackPreview(u, near[0]); return; }
    }
    if (u && mode === 'move' && !u.acted) {
      const reach = B.reachCache && B.reachCache.uid === u.id ? B.reachCache.set : null;
      if (reach && reach.has(x + ',' + y)) { moveUnit(u, x, y); return; }
    }
    clearSel();
  }

  function ensureVisible(u) {
    if (!canvas) return;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const sx = (u.x + 0.5) * TILE * cam.s + cam.x;
    const sy = (u.y + 0.5) * TILE * cam.s + cam.y;
    const mx = Math.min(110, w * 0.28), my = Math.min(110, h * 0.28);
    if (sx < mx || sx > w - mx || sy < my || sy > h - my) centerCam(u.x, u.y);
  }

  function selectUnit(u) {
    if (!u || !u.alive) return;
    if (u.rx == null) { u.rx = u.x; u.ry = u.y; }
    B.sel = u;
    trackTurn(u);
    B.reachCache = { uid: u.id, set: reachSet(u) };
    mode = u.side === 'ally' && !u.acted ? 'move' : 'idle';
    pendingSkill = null;
    SKBattle.refreshUI();
    const t = SK.TERRAIN[B.tiles[u.y][u.x]];
    $('#battle-tip').textContent = `${u.name} · ${SK.CLASSES[u.cls].name} · 이동 ${movOf(u)} · ${t.name} 방어 ${Math.round(t.def * 100)}%`;
  }

  function clearSel() {
    B.sel = null;
    B.reachCache = null;
    mode = 'idle';
    pendingSkill = null;
    SKBattle.refreshUI();
    $('#battle-tip').textContent = '화면을 끌어 이동 · 부대를 눌러 선택';
  }

  function moveUnit(u, x, y) {
    const path = findPath(u, x, y);
    if (SKBattle && SKBattle.debug) SKBattle.debug._move = { n: u.name, from: [u.x, u.y], to: [x, y], len: path.length };
    if (!path.length) {
      SK.toast('그곳으로는 갈 수 없습니다.');
      return;
    }
    busy = true;
    mode = 'idle';
    B.reachCache = null;
    animatePath(u, path, { cam: true, step: path.length > 6 ? 92 : 108, onDone: () => {
      busy = false;
      mode = 'act';
      B.reachCache = null;
      SKBattle.refreshUI();
      const t = SK.TERRAIN[B.tiles[u.y][u.x]];
      $('#battle-tip').textContent = `${u.name} 이동 완료 · ${t.name} · 공격하거나 [대기]를 누르세요`;
      sitePhase(false);      // v5.17 — 마을을 밟았으면 그 자리에서 점령
      finishCheck();
    } });
  }

  /* 조조전식 전투 예고 — 피해·반격·지형·인연 배지를 먼저 보여준다 */
  function openAttackPreview(a, d) {
    if (busy || !a || !d || !a.alive || !d.alive) return;
    const atk = calcDamage(a, d, {});
    const bond = SK.bondBetween ? SK.bondBetween(a.name, d.name) : null;
    /* v5.15 — 반격은 방어자의 최소 사거리 안쪽이면 불가, 피해는 75%(검병 90%) */
    const canCounter = canCounterAt(d, a);
    const cntMul = counterMulOf(d);
    const cnt = canCounter ? calcDamage(d, a, { mult: cntMul, noCrit: true }) : null;
    const tri = SK.triangleMul ? SK.triangleMul(a.cls, d.cls) : { mul: 1, label: '' };
    const triBack = SK.triangleMul ? SK.triangleMul(d.cls, a.cls) : { mul: 1, label: '' };
    const tr = SK.TERRAIN[B.tiles[d.y][d.x]] || SK.TERRAIN.P;
    const critChance = Math.round((0.05 + (a.wu - 60) * 0.0022 + (a.cls === 'sanjeok' ? 0.06 : 0) + Math.max(0, buffVal(a, 'crit'))) * 100);
    const bondHtml = bond
      ? `<div class="ap-bond ${bond.relation === '숙적' ? 'rival' : 'friend'}">${bond.relation} · ${bond.title}<em>${bond.relation === '숙적' ? '피해 +20%' : '공격 +15%'}</em></div>`
      : '';
    const triName = tri.label ? tri.label.replace(/\s*\+\d+%$/, '') : '';
    const triHtml = tri.mul > 1
      ? `<div class="ap-row tri"><span>병과 상성</span><b>+${Math.round((tri.mul - 1) * 100)}%</b><em>${triName} 상성</em></div>`
      : '<div class="ap-row"><span>병과 상성</span><b>없음</b><em>기본 피해</em></div>';
    const dMin = d.minRng || 1;
    const m = SK.modal({
      kicker: '전투 예고',
      title: `${a.name} → ${d.name}`,
      body: `<div class="atk-preview">
        <div class="ap-row"><span>예상 피해</span><b>${atk.dmg}</b><em>치명타 ${critChance}%</em></div>
        ${triHtml}
        ${canCounter
          ? `<div class="ap-row counter"><span>반격 피해</span><b>${cnt.dmg}</b><em>${d.name}의 반격 ${Math.round(cntMul * 100)}%${triBack.mul > 1 ? ` · ${triBack.label}` : ''}</em></div>`
          : `<div class="ap-row"><span>반격</span><b>없음</b><em>${dMin > 1 ? `${SK.josa(d.name, 'eun')} ${dMin}칸 안쪽을 못 쏩니다` : '사거리 밖'}</em></div>`}
        <div class="ap-row"><span>지형</span><b>${tr.name}</b><em>방어 ${tr.def >= 0 ? '+' : ''}${Math.round(tr.def * 100)}%</em></div>
        ${bondHtml}
        <p class="ap-note">${d.name} 병력 ${Math.round(d.hp).toLocaleString('ko-KR')} / ${Math.round(d.maxHp).toLocaleString('ko-KR')}</p>
      </div>`,
      actions: [
        { label: '취소' },
        { label: '공격!', primary: true, onClick: () => doAttack(a, d) },
      ],
    });
    return m;
  }

  /* ── v5.2 성문 공략 ── */
  function calcGateDamage(a, opts) {
    const kind = attackKind(a, opts);
    let base = effAtk(a) * 10;
    if (a.cls === 'pocha') base *= 2.0;                 // 투석차 — 성문 특화
    else if (a.cls === 'balseokcha') base *= 1.8;
    else if (kind === 'arrow' || kind === 'bolt') base *= 0.6;
    base *= rnd(0.94, 1.06);
    const cc = 0.05 + (a.wu - 60) * 0.0011;
    let crit = false;
    if (Math.random() < cc) { crit = true; base *= 1.4; }
    return { dmg: Math.max(40, Math.round(base)), crit, kind };
  }

  function openGateAttack(a, g) {
    const gate = activeGate();
    if (busy || !a || !a.alive || !gate || gate.hp <= 0) return;
    /* v5.14 — 자기 성문을 치는 진영은 없다 (수성전 아군 / 공성전 적군 차단) */
    if (!isGateAttacker(a)) { SK.toast('우리 성문은 아군이 칠 수 없습니다.'); return; }
    const res = calcGateDamage(a, {});
    const m = SK.modal({
      kicker: '성문 공략', title: `${a.name} → ${gate.ring > 1 || (B.gates || []).length > 1 ? `${gate.ring}번째 성문` : '성문'}`,
      body: `<div class="atk-preview">
        <div class="ap-row"><span>성문 피해</span><b>${res.dmg}</b><em>${res.kind === 'rock' ? '포격 특화' : res.kind === 'melee' ? '근접' : '사격'}</em></div>
        <div class="ap-row"><span>성문 내구도</span><b>${Math.round(gate.hp).toLocaleString('ko-KR')}</b><em>/ ${Math.round(gate.maxHp).toLocaleString('ko-KR')}</em></div>
        <p class="ap-note">성문을 부수면 근접 부대가 성안으로 들어갈 수 있습니다. 겹성벽은 바깥 문부터 차례로 부숴야 합니다. 투석차·발석차가 가장 빠릅니다.</p>
      </div>`,
      actions: [{ label: '취소' }, { label: '공격!', primary: true, onClick: () => doGateAttack(a, g, res.dmg) }],
    });
    return m;
  }

  function doGateAttack(a, g, dmg) {
    if (!a || !a.alive || !activeGate() || activeGate().hp <= 0 || busy) return;
    if (!isGateAttacker(a)) return;
    B.gate = activeGate();
    busy = true;
    mode = 'idle';
    a.acted = true;
    B.reachCache = null;
    const hit = dmg != null ? dmg : calcGateDamage(a, {}).dmg;
    const kind = attackKind(a);
    const target = { x: g.x, y: g.y, rx: g.x, ry: g.y };
    const cx = (g.x + 0.5) * TILE, cy = (g.y + 0.5) * TILE;
    const land = () => {
      if (!B || B.over) { busy = false; return; }
      B.gate.hp = Math.max(0, B.gate.hp - hit);
      addFloat(cx, cy - 8, '-' + hit, '#ffd08a');
      addFx({ kind: 'burst', x: cx, y: cy, life: 420, color: '226,180,72' });
      SK.sfx.play('hit');
      feed(`${a.name} — 성문에 ${hit} 피해`, 'good');
      if (B.gate.hp <= 0) {
        const next = activeGate();
        const more = next && next !== B.gate && next.hp > 0;
        B.gate = next;
        feed(more ? `${B.gate.ring}번째 성문이 무너졌습니다 — 안쪽 성문이 남아 있습니다.` : '성문이 무너졌습니다 — 근접 부대도 성안으로 들어갈 수 있습니다.', 'good');
        SK.toast(more ? `성문 파손! 안쪽 ${B.gate.ring}번째 성문이 남았습니다.` : '성문 파손! 성안으로 진입할 수 있습니다.');
        shakeScreen(7);
        SK.sfx.play('drum');
      }
      busy = false;
      SKBattle.refreshUI();
      if (!B.over) wait(() => { if (B && !B.over) nextUnitOrWait(); }, 240);
    };
    if (kind === 'melee') {
      wait(() => {
        addFx({ kind: 'slash', x: cx, y: cy, life: 360 });
        SK.sfx.play('sword');
        wait(land, 70);
      }, 120);
    } else {
      launchProjectile(a, target, kind, land);
    }
  }

  /* v5.14 — 수성전: 문을 부수는 쪽(적군)이 성문 앞까지 붙어 문을 친다.
     성문을 칠 수 있는 자리(지금 서 있는 칸 + 이동 가능 칸) 중 가장 가까운 곳을 고른다. */
  function gateStrikePlan(u) {
    const gate = gateIntact() ? activeGate() : null;
    if (!gate || !isGateAttacker(u)) return null;
    const rng = effRng(u);
    const cands = [{ x: u.x, y: u.y }];
    reachSet(u).forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      if (B.units.some((o) => o.alive && o !== u && o.x === x && o.y === y)) return;
      cands.push({ x, y });
    });
    let best = null;
    cands.forEach((t) => {
      gate.tiles.forEach((g) => {
        const d = manh(t.x, t.y, g.x, g.y);
        if (d < 1 || d > rng) return;
        const sc = -d + (t.x === u.x && t.y === u.y ? 0.5 : 0);
        if (!best || sc > best.score) best = { x: t.x, y: t.y, gate: { x: g.x, y: g.y }, score: sc };
      });
    });
    return best;
  }

  function enemyGateStrike(e, plan, done) {
    const go = () => {
      if (!B || B.over) { done(); return; }
      const gate = activeGate();
      if (!gate || gate.hp <= 0) { e.acted = true; finishCheck(); done(); return; }
      const res = calcGateDamage(e, {});
      const cx = (plan.gate.x + 0.5) * TILE, cy = (plan.gate.y + 0.5) * TILE;
      gate.hp = Math.max(0, gate.hp - res.dmg);
      addFloat(cx, cy - 8, '-' + res.dmg, '#ffd08a');
      addFx({ kind: 'burst', x: cx, y: cy, life: 420, color: '226,180,72' });
      SK.sfx.play(attackKind(e) === 'melee' ? 'sword' : 'hit');
      shakeScreen(4);
      feed(`${e.name} — 성문에 ${res.dmg} 피해`, 'bad');
      B.gate = gate;
      if (gate.hp <= 0) {
        const next = activeGate();
        const more = next && next !== gate && next.hp > 0;
        B.gate = next;
        feed(more ? `${B.gate.ring}번째 성문이 무너졌습니다 — 안쪽 성문이 남아 있습니다.` : '성문이 무너졌습니다 — 적이 성안으로 밀려들어옵니다.', 'bad');
        SK.toast(more ? `성문 파손! 안쪽 ${B.gate.ring}번째 성문이 남았습니다.` : '성문 파손! 적이 성안으로 들어옵니다.');
        shakeScreen(7);
        SK.sfx.play('drum');
      }
      e.acted = true;
      finishCheck();
      done();
    };
    if (plan.x !== e.x || plan.y !== e.y) {
      animatePath(e, findPath(e, plan.x, plan.y), { step: paceMs(88), onDone: () => wait(go, 150) });
    } else go();
  }

  /* 고유 특기 발동 — 상위 100명의 data/unique_passives.json
     on_attack: 공격 후 주변 아군 강화 / turn_start: 매 턴 아군 지원 / 그 외: 공격 시 발동으로 본다 */
  function triggerPassive(u, when) {
    const p = u && u.passive;
    if (!p || !u.alive || B.over) return;
    const trig = p.trigger || 'on_attack';
    if (when === 'turn_start' ? trig !== 'turn_start' : trig === 'turn_start') return;
    if (when !== 'turn_start' && u.pUsed && u.pUsed[trig]) return;
    const v = clamp((Number(p.valuePct) || 10) / 100, 0.03, 0.2);
    const cx = (rxOf(u) + 0.5) * TILE, cy = (ryOf(u) + 0.5) * TILE;
    if (trig === 'turn_start') {
      /* v5.14 — 매 턴 무제한 8% 회복이 아군·적군을 좀비로 만들던 것을 막는다.
         · 마름모(manh) 2칸 이내 같은 편만
         · 회복량 3% 이하 (자기 자신은 절반)
         · 한 전투에서 4회까지만 */
      const eff = String(p.effect || '');
      const hpHeal = /HP/.test(eff);
      u.pCount = u.pCount || {};
      const used = u.pCount[trig] || 0;
      if (used >= 4) return;
      u.pCount[trig] = used + 1;
      const healPct = hpHeal ? Math.min(0.03, Math.max(0.01, (Number(p.valuePct) || 3) / 100)) : 0.02;
      const list = B.units.filter((o) => o.alive && o.side === u.side && manh(o.x, o.y, u.x, u.y) <= 2);
      list.forEach((o) => {
        const hpGain = Math.round(o.maxHp * (o === u ? healPct * 0.5 : healPct));
        if (hpGain <= 0) return;
        o.hp = Math.min(o.maxHp, o.hp + hpGain);
        addHeal(o, hpGain, u);
        addFx({ kind: 'heal', x: (rxOf(o) + 0.5) * TILE, y: (ryOf(o) + 0.5) * TILE, life: 520 });
      });
      /* 사기·방어 계열 특기는 설명대로 1턴짜리 옅은 강화도 함께 준다 */
      if (!hpHeal) {
        const buffDef = /방어|책략/.test(eff);
        list.forEach((o) => {
          const cur = o.buffs[buffDef ? 'def' : 'atk'];
          const val = Math.max(0.06, (cur && cur.v) || 0);
          o.buffs[buffDef ? 'def' : 'atk'] = { v: val, t: 1 };
        });
      }
      addFloat(cx, cy - 10, `「${p.title}」`, '#9ef0b8');
      feed(`${u.name}의 고유 특기 「${p.title}」 — 주변 아군 지원`, 'good');
      return;
    }
    u.pUsed = u.pUsed || {};
    u.pUsed[trig] = true;
    const allies = B.units.filter((o) => o.alive && o.side === u.side && o !== u && cheb(o.x, o.y, u.x, u.y) <= 2).slice(0, 3);
    allies.forEach((o) => {
      o.buffs.atk = { v: Math.max(v, (o.buffs.atk && o.buffs.atk.v) || 0), t: 2 };
      addFx({ kind: 'ring', x: (rxOf(o) + 0.5) * TILE, y: (ryOf(o) + 0.5) * TILE, life: 420, color: '255,210,120' });
    });
    addFloat(cx, cy - 10, `「${p.title}」`, '#ffe08a');
    feed(`${u.name}의 고유 특기 「${p.title}」 — 아군 사기 상승`, 'good');
  }

  /* v5.15 — 군악대·무희의 전장 출진 오라 (병과 고유, 매 턴 시작).
     군악대: 마름모 2칸 아군 MP +4 · 공격 +8%(1턴)
     무희: 마름모 2칸 아군 회피·치명 +8%(1턴), 마름모 2칸 적 공격 −8%(1턴)
     한 부대가 여러 번 겹쳐도 한 번만 발동한다(같은 값으로 덮어쓴다). */
  function classAuraPhase(side) {
    if (!B || B.over) return;
    const band = B.units.filter((u) => u.alive && u.side === side && u.cls === 'gunakdae');
    const dancers = B.units.filter((u) => u.alive && u.side === side && u.cls === 'muhui');
    const inDia = (o, u) => o.alive && manh(o.x, o.y, u.x, u.y) <= 2;
    band.forEach((u) => {
      const list = B.units.filter((o) => o.side === side && inDia(o, u));
      list.forEach((o) => {
        o.mp = Math.min(o.maxMp, o.mp + 4);
        o.buffs.atk = { v: Math.max(0.08, (o.buffs.atk && o.buffs.atk.t > 0 && o.buffs.atk.v) || 0), t: 1 };
        addFx({ kind: 'ring', x: (rxOf(o) + 0.5) * TILE, y: (rxOf(o) + 0.5) * TILE, life: 360, color: '255,214,140' });
      });
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '「군악」 MP+4 · 공+8%', '#ffe08a');
      feed(`${u.name}의 군악 — 주변 아군 MP +4 · 공격 +8%`, side === 'ally' ? 'good' : 'bad');
    });
    dancers.forEach((u) => {
      const allies = B.units.filter((o) => o.side === side && inDia(o, u));
      allies.forEach((o) => {
        o.buffs.crit = { v: 0.08, t: 1 };
        o.buffs.evade = { v: 0.08, t: 1 };
        addFx({ kind: 'ring', x: (rxOf(o) + 0.5) * TILE, y: (ryOf(o) + 0.5) * TILE, life: 360, color: '240,170,220' });
      });
      const foes = B.units.filter((o) => o.side !== side && inDia(o, u));
      foes.forEach((o) => {
        o.buffs.atk = { v: Math.min(-0.08, (o.buffs.atk && o.buffs.atk.t > 0 && o.buffs.atk.v) || 0), t: 1 };
      });
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '「무희」 회피·치명 +8%', '#f0b8e0');
      feed(`${u.name}의 춤 — 아군 회피·치명 +8%, 적 공격 −8%`, side === 'ally' ? 'good' : 'bad');
    });
  }

  function doAttack(a, d) {
    if (!a || !d || !a.alive || !d.alive) return;
    busy = true;
    mode = 'idle';
    a.acted = true;
    B.reachCache = null;
    attackUnit(a, d, { mult: 1 }, () => {
      const wasAlive = d.alive && d.hp > 0;
      triggerPassive(a, 'on_attack');
      wait(() => {
        if (!B || B.over) { busy = false; return; }
        if (wasAlive && d.alive && !B.over) counter(d, a);
        busy = false;
        finishCheck();
        if (!B.over) wait(() => { if (B && !B.over) nextUnitOrWait(); }, 300);
      }, 320);
    });
    SKBattle.refreshUI();
  }

  function finishCheck() {
    if (B.over) return;
    sitePhase(false);          // v5.17 — 밟고 선 마을 점령 반영
    if (B.over) return;
    const allies = B.units.filter((u) => u.side === 'ally' && u.alive);
    const enemies = B.units.filter((u) => u.side === 'enemy' && u.alive);
    if (!enemies.length) { B.winReason = '적군 전멸'; return victory(); }
    if (!allies.length) { B.winReason = '아군 전멸'; return defeat(); }
    /* v5.17 — 총대장 격파 · 본진 점령은 그 즉시 승패 */
    const eL = B.enemyLeaderId ? B.units.find((u) => u.id === B.enemyLeaderId) : null;
    if (eL && !eL.alive) { B.winReason = '적 총대장 격파'; return victory(); }
    const aL = B.allyLeaderId ? B.units.find((u) => u.id === B.allyLeaderId) : null;
    if (aL && !aL.alive) { B.winReason = '아군 총대장 격파'; return defeat(); }
    const eHQ = (B.sites || []).find((s) => s.type === 'enemyHQ');
    const aHQ = (B.sites || []).find((s) => s.type === 'allyHQ');
    if (eHQ && allies.some((u) => u.x === eHQ.x && u.y === eHQ.y)) { B.winReason = '적 본진 점령'; return victory(); }
    if (aHQ && enemies.some((u) => u.x === aHQ.x && u.y === aHQ.y)) { B.winReason = '아군 본진 점령당함'; return defeat(); }
    SKBattle.refreshUI();
  }

  function nextUnitOrWait() {
    const next = B.units.find((u) => u.side === 'ally' && u.alive && !u.acted);
    if (next) selectUnit(next);
    else { B.sel = null; mode = 'idle'; B.reachCache = null; SKBattle.refreshUI(); $('#battle-tip').textContent = '모든 부대가 행동했습니다. [턴 종료]를 누르세요.'; }
  }

  /* ───────────── 책략 ───────────── */
  function openSkillMenu() {
    const u = B.sel;
    if (!u || u.acted) { SK.toast('먼저 이동할 부대를 선택하세요.'); return; }
    if (!u.skills.length) { SK.toast('이 병과는 책략이 없습니다.'); return; }
    const rows = u.skills.map((k) => {
      const sk = SK.SKILLS[k];
      const dis = u.mp < sk.mp;
      return `<button class="skill-row ${dis ? 'off' : ''}" data-k="${k}" ${dis ? 'disabled' : ''}>
        <span class="sk-mp">${sk.mp}</span>
        <div><b>${sk.name}</b><span>${sk.desc}</span></div>
      </button>`;
    }).join('');
    const m = SK.modal({
      kicker: `${u.name}의 책략`,
      title: '무엇을 펼칠까',
      body: `<div class="skill-list">${rows}</div><p class="skill-mp">남은 책략 ${u.mp} / ${u.maxMp}</p>`,
      actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.skill-row').forEach((b) => {
      b.onclick = () => { m.close(); beginSkill(u, b.dataset.k); };
    });
  }

  function beginSkill(u, key) {
    const sk = SK.SKILLS[key];
    if (u.mp < sk.mp) return;
    pendingSkill = Object.assign({ key }, sk);
    mode = 'skillTarget';
    if (sk.kind === 'buffAreaAllies' || sk.kind === 'healArea' || sk.kind === 'buffSelf') {
      castInstant(u, sk);
    } else {
      $('#battle-tip').textContent = `${sk.name} — 대상 지점을 선택하세요`;
    }
    SKBattle.refreshUI();
  }

  function castInstant(u, sk) {
    busy = true;
    u.mp -= sk.mp;
    castCircle(u, sk.kind === 'buffSelf' ? '150,210,255' : '255,215,120');
    SK.sfx.play(sk.kind === 'healArea' ? 'heal' : 'spell');
    if (sk.kind === 'healArea') {
      B.units.forEach((t) => {
        if (t.alive && t.side === u.side && manh(u.x, u.y, t.x, t.y) <= sk.radius) {
          const heal = healAmount(sk, t);
          t.hp = Math.min(t.maxHp, t.hp + heal);
          addHeal(t, heal, u);
          addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.4) * TILE, '+' + heal, '#a8f0b8');
          addFx({ kind: 'heal', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 620 });
        }
      });
    } else if (sk.kind === 'buffSelf') {
      u.buffs.def = { v: sk.def, t: sk.turns };
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '방어↑', '#9fd8ff');
      addFx({ kind: 'buff', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 600, color: '150,210,255' });
    } else if (sk.kind === 'buffAreaAllies') {
      B.units.forEach((t) => {
        if (t.alive && t.side === u.side && manh(u.x, u.y, t.x, t.y) <= sk.radius) {
          t.buffs.atk = { v: sk.atk, t: sk.turns };
          addFx({ kind: 'buff', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 600 });
        }
      });
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, sk.name, '#ffe08a');
    }
    u.acted = true;
    pendingSkill = null;
    mode = 'idle';
    SKBattle.refreshUI();
    wait(() => {
      busy = false;
      if (!B || B.over) return;
      finishCheck();
      if (!B.over) nextUnitOrWait();
    }, 640);
  }

  function trySkillAt(x, y) {
    const u = B.sel;
    const sk = pendingSkill;
    if (!u || !sk) return;
    const dist = manh(u.x, u.y, x, y);
    /* v5.13 — 회복·아군 버프는 거리 0(자기 자신) 허용 */
    const selfSkill = sk.kind === 'heal' || sk.kind === 'buffAlly';
    if (!selfSkill && sk.minRange && dist < sk.minRange) { SK.toast(`최소 사거리 ${sk.minRange}칸입니다.`); return; }
    if (dist > (sk.range || effRng(u))) { SK.toast('사거리 밖입니다.'); return; }
    const target = B.units.find((o) => o.alive && o.x === x && o.y === y);
    const finish = (delay) => {
      u.acted = true; pendingSkill = null; mode = 'idle';
      SKBattle.refreshUI();
      wait(() => {
        busy = false;
        if (!B || B.over) return;
        finishCheck();
        if (!B.over) nextUnitOrWait();
      }, delay || 600);
    };

    if (sk.kind === 'heal' || sk.kind === 'buffAlly') {
      if (!target || target.side !== u.side) { SK.toast('아군을 선택하세요.'); return; }
      busy = true;
      u.mp -= sk.mp;
      castCircle(u, sk.kind === 'heal' ? '150,240,180' : '255,215,120');
      SK.sfx.play(sk.kind === 'heal' ? 'heal' : 'spell');
      if (sk.kind === 'heal') {
        const heal = Math.round(healAmount(sk, target) * Math.max(0.85, Math.min(1.45, 1 + (magicAtk(u) - magicDef(target)) / 420)));
        target.hp = Math.min(target.maxHp, target.hp + heal);
        addHeal(target, heal, u);
        addFloat((x + 0.5) * TILE, (y + 0.4) * TILE, '+' + heal, '#a8f0b8');
        addFx({ kind: 'heal', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 700 });
      } else {
        target.buffs.atk = { v: sk.atk, t: sk.turns };
        addFloat((x + 0.5) * TILE, (y + 0.3) * TILE, '공격↑', '#ffe08a');
        addFx({ kind: 'buff', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 650, color: '255,215,120' });
      }
      finish(520);
      return;
    }

    if (sk.kind === 'debuffDef' || sk.kind === 'debuffAtk') {
      busy = true;
      u.mp -= sk.mp;
      castCircle(u, sk.kind === 'debuffDef' ? '190,160,255' : '255,170,215');
      SK.sfx.play('spell');
      const rad = sk.radius || 1;
      const color = sk.kind === 'debuffDef' ? '190,160,255' : '255,170,215';
      B.units.forEach((t) => {
        if (t.alive && t.side !== u.side && manh(x, y, t.x, t.y) <= rad) {
          /* 책략이 강할수록 약화가 깊어진다 (0.75 ~ 1.35배) */
          const potency = Math.max(0.75, Math.min(1.35, 1 + (magicAtk(u) - magicDef(t)) / 500));
          const amt = sk.amount * potency;
          if (sk.kind === 'debuffDef') t.buffs.def = { v: amt, t: sk.turns };
          else t.buffs.atk = { v: amt, t: sk.turns };
          addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.3) * TILE, sk.kind === 'debuffDef' ? '방어↓' : '공격↓',
            sk.kind === 'debuffDef' ? '#c9a6ff' : '#ffb0d8');
          addFx({ kind: 'spell', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.7) * TILE, life: 640, color });
          addFx({ kind: 'buff', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 620, color });
        }
      });
      addFx({ kind: 'ring', x: (x + 0.5) * TILE, y: (y + 0.6) * TILE, life: 620, color });
      finish(600);
      return;
    }

    if (sk.kind === 'magicArea') {
      busy = true;
      u.mp -= sk.mp;
      castCircle(u, u.cls === 'balseokcha' ? '230,200,150' : '255,170,120');
      SK.sfx.play(u.cls === 'balseokcha' ? 'rock' : 'spell');
      const rad = sk.radius || 1;
      wait(() => {
        if (!B || B.over) { finish(0); return; }
        addFx({ kind: 'burst', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 620, color: '255,150,80' });
        addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 760 });
        B.units.forEach((t) => {
          if (t.alive && t.side !== u.side && manh(x, y, t.x, t.y) <= rad) {
            const dmg = Math.max(10, Math.round((sk.power * 0.70 + magicAtk(u) * 1.30 - magicDef(t) * 0.80) * sizeScale(t) * 0.8));
            t.hp = Math.max(0, t.hp - dmg);
            addMagicDamage(u, t, dmg);
            t.flash = 1; t.shake = 240;
            addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.4) * TILE, String(dmg), '#ffb36a');
            if (t.hp <= 0) downUnit(t);
          }
        });
        SK.sfx.play('hit');
        finishCheck();
        finish(560);
      }, 260);
      return;
    }

    if (!target || target.side === u.side) { SK.toast('적을 선택하세요.'); return; }
    busy = true;
    u.mp -= sk.mp;
    if (sk.kind === 'magic') {
      castCircle(u, '255,170,120');
      SK.sfx.play('spell');
      wait(() => {
        if (!B || B.over) { finish(0); return; }
        const dmg = Math.max(10, Math.round((sk.power * 0.60 + magicAtk(u) * 2.00 - magicDef(target) * 0.90) * sizeScale(target) * 0.8));
        target.hp = Math.max(0, target.hp - dmg);
        addMagicDamage(u, target, dmg);
        target.flash = 1; target.shake = 240;
        addFloat((x + 0.5) * TILE, (y + 0.4) * TILE, '화계 ' + dmg, '#ffb36a');
        addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.55) * TILE, life: 720 });
        addFx({ kind: 'burst', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 520, color: '255,150,80' });
        if (target.hp <= 0) downUnit(target);
        SK.sfx.play('hit');
        finishCheck();
        finish(520);
      }, 300);
      return;
    }
    // damaging power skill
    let mult = sk.power || 1.4;
    if (sk.waterBonus && B.tiles[u.y][u.x] === 'W') mult += 0.15;
    if (sk.vsMount && (target.cls === 'gibi' || (SK.CLASSES[target.cls] && SK.CLASSES[target.cls].mount))) mult += sk.vsMount;
    if (sk.siegeBonus) {
      const tch = B.tiles[target.y][target.x];
      if (tch === 'G' || tch === 'D') mult += sk.siegeBonus;
    }
    const ranged = ['yeonno', 'jipsajung', 'gwanse', 'pogyeok', 'yeonpo', 'tuseok', 'hwayeom', 'hwagye'].indexOf(sk.key) >= 0;
    const forceKind = ranged
      ? (u.cls === 'pocha' || u.cls === 'balseokcha' ? 'rock' : (u.cls === 'yeonnobyung' ? 'bolt' : 'arrow'))
      : null;
    addFloat((x + 0.5) * TILE, (y + 0.15) * TILE, sk.name, '#ffe6a8');
    if (ranged) SK.sfx.play('spell');
    const hits = sk.hits || 1;
    const apply = (n) => {
      attackUnit(u, target, { mult, ignoreTerrain: sk.ignoreTerrain, forceKind }, () => {
        if (n > 1 && target.alive && B && !B.over) {
          wait(() => { if (B && !B.over && target.alive) apply(n - 1); else finish(300); }, 160);
        } else {
          if (B && !B.over) finishCheck();
          finish(300);
        }
      });
    };
    apply(hits);
  }

  /* ───────────── 아이템/대기 ───────────── */
  function useItem() {
    const u = B.sel;
    if (!u || u.acted) { SK.toast('부대를 먼저 선택하세요.'); return; }
    if (u.items <= 0) { SK.toast('군량이 없습니다.'); return; }
    u.items -= 1;
    const heal = Math.round(u.maxHp * 0.32);
    u.hp = Math.min(u.maxHp, u.hp + heal);
    addHeal(u, heal, u);
    addFloat((u.x + 0.5) * TILE, (u.y + 0.4) * TILE, '+' + heal, '#a8f0b8');
    addFx({ kind: 'heal', x: (u.x + 0.5) * TILE, y: (u.y + 0.5) * TILE, life: 650 });
    SK.sfx.play('heal');
    u.acted = true;
    SKBattle.refreshUI();
    wait(() => { if (B && !B.over) nextUnitOrWait(); }, 450);   // v5.16 — B=null 보호
  }

  function waitUnit() {
    if (!B) return;   // v5.16 — 전투가 닫힌 뒤 호출 보호
    const u = B.sel;
    if (!u || u.acted) return;
    u.acted = true;
    SKBattle.refreshUI();
    nextUnitOrWait();
  }

  function showUnitInfo(t) {
    const C = SK.CLASSES[t.cls];
    const tr = SK.TERRAIN[B.tiles[t.y][t.x]];
    const bonds = (SK.bondsOf ? SK.bondsOf(t.name) : []).map((b) => {
      const p = SK.bondPartner(b, t.name);
      const rival = b.relation === '숙적';
      return `<div class="hb-row ${rival ? 'rival' : 'friend'}"><span class="hb-rel">${rival ? '숙적' : '친밀'}</span>
        <div><b>${p}</b><span>${b.title}</span><em>${b.effect}</em></div></div>`;
    }).join('');
    SK.modal({
      title: `${t.name}`,
      body: `<div class="battle-info">
        <img src="${SK.ptSrc(t.portrait)}" alt="">
        <div class="bi-main">
          <p class="bi-cls">${C.name} · Lv.${t.lv} ${t.boss ? '· 적장' : ''}${t.tier ? ` · ${t.tier}급` : ''}</p>${t.skillName ? `<p class="bi-skill">특기 — ${t.skillName}</p>` : ''}
          <div class="bi-hp"><i style="width:${Math.round(t.hp / t.maxHp * 100)}%"></i><span>병력 ${Math.round(t.hp).toLocaleString('ko-KR')} / ${Math.round(t.maxHp).toLocaleString('ko-KR')}</span></div>
          <p class="bi-train">훈련도 ${t.train == null ? trainOf(t.lv, t.tier) : t.train}</p><div class="bi-attrs"><span>공 ${Math.round(effAtk(t))}</span><span>방 ${Math.round(effDef(t))}</span><span>책공 ${Math.round(magicAtk(t))}</span><span>책방 ${Math.round(magicDef(t))}</span><span>이동 ${movOf(t)}</span><span>사거리 ${effRng(t)}</span></div>
          <p class="bi-terr">지형 ${tr.name} · 방어 ${Math.round(tr.def * 100)}%${bondAllyMul(t) > 1 ? ' · 인연 공격 +15%' : ''}</p>
        </div>
      </div>${bonds ? `<div class="hi-bonds">${bonds}</div>` : ''}`,
      actions: [{ label: '닫기', primary: true }],
    });
  }

  /* ───────────── 턴 종료·AI ───────────── */
  function endTurn() {
    if (!B || B.over || B.phase !== 'ally' || busy) return;
    B.phase = 'enemy';
    B.sel = null; mode = 'idle'; B.reachCache = null;
    SKBattle.refreshUI();
    banner('적군 페이즈', 'enemy');
    wait(enemyPhase, 650);
  }

  /* ───────────── v5.2 — 아군 턴 [자동] 진행 ───────────── */
  function autoClear() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } }
  function speedLabel() { return '×' + autoSpeed; }
  function paintSpeedBtn() {
    const btn = document.querySelector('#btn-speed, .act.speed');
    if (!btn) return;
    btn.classList.toggle('fast', autoSpeed === 2);
    const sp = btn.querySelector('span');
    if (sp) sp.textContent = speedLabel();
    btn.setAttribute('aria-label', `전투 배속 ${speedLabel()}`);
  }
  function toggleSpeed() {
    /* v5.17 — 대형 전장(24·28·32칸)에서는 전투가 길어 ×3 단계를 더한다 */
    autoSpeed = autoSpeed === 3 ? 1 : autoSpeed + 1;
    paintSpeedBtn();
    SK.sfx.play('ui');
    SK.toast(autoSpeed === 3 ? '전투 배속 ×3 — 아주 빠르게 진행합니다.'
      : autoSpeed === 2 ? '전투 배속 ×2 — 빠르게 진행합니다.'
      : '전투 배속 ×1 — 기본 속도(절반)로 돌아갑니다.');
    if (autoOn) { autoClear(); autoTimer = wait(autoStep, 240); }
    return autoSpeed;
  }

  function autoStop(msg) {
    autoOn = false;
    autoPending = null;
    autoClear();
    const btn = document.querySelector('.act.auto');
    if (btn) btn.classList.remove('active');
    if (msg) SK.toast(msg);
  }

  function toggleAuto(force) {
    autoOn = force == null ? !autoOn : !!force;
    autoPending = null;
    autoClear();
    const btn = document.querySelector('.act.auto');
    if (btn) btn.classList.toggle('active', autoOn);
    paintSpeedBtn();
    if (autoOn) {
      SK.toast(`자동 행군 — 아군 턴을 스스로 마칩니다. (배속 ${speedLabel()})`);
      autoTimer = wait(autoStep, 320);
    } else {
      autoStop('자동 행군을 멈췄습니다.');
    }
  }

  /* ───────────── v5.3 — 전 병종 책략 판단 ─────────────
     회복 > 디버프 > 광역 버프 > 공격 책략 > 단일 버프/자기 버프 순으로
     “지금 쓸 값이 있는가”를 따져 고른다. 값이 없으면 기본 공격·접근으로 돌아간다. */
  function skillListOf(u) {
    if (!u || !u.skills || !u.skills.length) return [];
    return u.skills.map((k) => {
      const s = SK.SKILLS[k];
      return s ? Object.assign({ key: k }, s) : null;
    }).filter((s) => s && (u.mp || 0) >= (s.mp || 0));
  }

  function moveTiles(u) {
    const tiles = [{ x: u.x, y: u.y }];
    const set = (B.reachCache && B.reachCache.uid === u.id) ? B.reachCache.set : reachSet(u);
    /* v5.22 — 수성전 수비 역할(원거리·보조)은 성 밖 칸을 후보에 넣지 않는다 */
    const allow = defenseAllowFor(u);
    set.forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      if (B.units.some((o) => o.alive && o.x === x && o.y === y)) return;
      if (allow && !allow(x, y)) return;
      tiles.push({ x, y });
    });
    return tiles;
  }

  function estBasicDmg(u, f) {
    const def = effDef(f);
    const tri = SK.triangleMul ? SK.triangleMul(u.cls, f.cls) : { mul: 1 };
    let base = (effAtk(u) * 0.92 - def * 0.52) * 16 * sizeScale(f) * atkScale(u) * tri.mul;
    if (attackKind(u) === 'rock') base *= 0.55;
    return Math.max(4, Math.round(base));
  }

  function estSkillDmg(u, f, sk) {
    const tri = SK.triangleMul ? SK.triangleMul(u.cls, f.cls) : { mul: 1 };
    if (sk.kind === 'power') {
      let mult = sk.power || 1.4;
      if (sk.vsMount && (f.cls === 'gibi' || (SK.CLASSES[f.cls] && SK.CLASSES[f.cls].mount))) mult += sk.vsMount;
      let base = (effAtk(u) * mult * 0.92 - effDef(f) * 0.52) * 16 * sizeScale(f) * atkScale(u) * tri.mul;
      if (attackKind(u) === 'rock') base *= 0.55;
      return Math.max(4, Math.round(base)) * (sk.hits || 1);
    }
    if (sk.kind === 'magic') {
      return Math.max(10, Math.round((sk.power * 0.60 + magicAtk(u) * 2.00 - magicDef(f) * 0.90) * sizeScale(f) * 0.8));
    }
    if (sk.kind === 'magicArea') {
      return Math.max(10, Math.round((sk.power * 0.70 + magicAtk(u) * 1.30 - magicDef(f) * 0.80) * sizeScale(f) * 0.8));
    }
    return 0;
  }

  function planSupportSkill(u) {
    const skills = skillListOf(u);
    if (!skills.length) return null;
    const foes = B.units.filter((o) => o.alive && o.side !== u.side);
    const allies = B.units.filter((o) => o.alive && o.side === u.side);
    const tiles = moveTiles(u);
    const dTo = (t, x, y) => manh(t.x, t.y, x, y);

    /* 1) 회복 — HP 85% 이하 아군이 있으면 최우선 */
    const heals = skills.filter((s) => s.kind === 'heal' || s.kind === 'healArea');
    const hurt = allies.filter((a) => a.hp < a.maxHp * 0.85).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (heals.length && hurt.length) {
      let best = null;
      heals.forEach((sk) => {
        tiles.forEach((t) => {
          if (sk.kind === 'heal') {
            const reach = sk.range || effRng(u);
            hurt.forEach((a) => {
              if (dTo(t, a.x, a.y) > reach) return;
              const sc = (1 - a.hp / a.maxHp) * 130 - dTo(t, u.x, u.y) * 0.4;
              if (!best || sc > best.score) best = { kind: 'skill', mode: 'heal', key: sk.key, x: t.x, y: t.y, tx: a.x, ty: a.y, target: a, score: sc };
            });
          } else {
            const rad = sk.radius || 2;
            const inRange = hurt.filter((a) => dTo(t, a.x, a.y) <= rad);
            if (!inRange.length) return;
            let sc = 0;
            inRange.forEach((a) => { sc += (1 - a.hp / a.maxHp) * 90; });
            sc += inRange.length > 1 ? 30 : 0;
            sc -= dTo(t, u.x, u.y) * 0.4;
            if (!best || sc > best.score) best = { kind: 'skill', mode: 'heal', key: sk.key, x: t.x, y: t.y, tx: t.x, ty: t.y, target: inRange[0], score: sc };
          }
        });
      });
      if (best && best.score > 0) return best;
    }

    /* 2) 디버프 — 적 핵심 부대가 아직 걸리지 않았을 때 */
    const debs = skills.filter((s) => s.kind === 'debuffDef' || s.kind === 'debuffAtk');
    if (debs.length && foes.length) {
      const threat = (f) => effAtk(f) * f.maxHp;
      const core = foes.slice().sort((a, b) => threat(b) - threat(a)).slice(0, 3);
      let best = null;
      debs.forEach((sk) => {
        const bk = sk.kind === 'debuffDef' ? 'def' : 'atk';
        const rad = sk.radius || 1;
        const range = sk.range || effRng(u);
        tiles.forEach((t) => {
          core.forEach((f) => {
            if (f.buffs[bk] && f.buffs[bk].t > 0) return;
            if (dTo(t, f.x, f.y) > range) return;
            const hit = foes.filter((o) => !o.buffs[bk] && manh(f.x, f.y, o.x, o.y) <= rad).length;
            const sc = 34 + hit * 16 + threat(f) / 9000 - dTo(t, u.x, u.y) * 0.3;
            if (!best || sc > best.score) best = { kind: 'skill', mode: 'debuff', key: sk.key, x: t.x, y: t.y, tx: f.x, ty: f.y, target: f, score: sc };
          });
        });
      });
      if (best) return best;
    }

    /* 3) 광역 버프 — 주변 아군 2기 이상이 아직 버프를 못 받았을 때 */
    const areaBuf = skills.find((s) => s.kind === 'buffAreaAllies');
    if (areaBuf && foes.length) {
      const rad = areaBuf.radius || 2;
      let best = null;
      tiles.forEach((t) => {
        const group = allies.filter((a) => dTo(t, a.x, a.y) <= rad);
        const need = group.filter((a) => !a.buffs.atk || a.buffs.atk.t <= 0).length;
        if (need < 2) return;
        const sc = need * 24 + group.length * 5 - dTo(t, u.x, u.y) * 0.3;
        if (!best || sc > best.score) best = { kind: 'skill', mode: 'instant', key: areaBuf.key, x: t.x, y: t.y, tx: t.x, ty: t.y, score: sc };
      });
      if (best) return best;
    }

    /* 4) 공격 책략 — 기대 피해가 기본 공격보다 확실히 크거나 처치 가능할 때 */
    const dmgs = skills.filter((s) => s.kind === 'power' || s.kind === 'magic' || s.kind === 'magicArea');
    if (dmgs.length && foes.length) {
      let basic = 0;
      tiles.forEach((t) => {
        foes.forEach((f) => {
          const d = dTo(t, f.x, f.y);
          if (d < 1 || d > effRng(u)) return;
          if (wallBlocked({ x: t.x, y: t.y }, f) && attackKind(u) === 'melee') return;
          basic = Math.max(basic, estBasicDmg(u, f));
        });
      });
      let best = null;
      dmgs.forEach((sk) => {
        const range = sk.range || effRng(u);
        const minR = sk.minRange || 1;
        if (sk.kind === 'magicArea') {
          tiles.forEach((t) => {
            foes.forEach((f) => {
              if (dTo(t, f.x, f.y) > range) return;
              const rad = sk.radius || 1;
              const hit = foes.filter((o) => manh(f.x, f.y, o.x, o.y) <= rad);
              let sum = 0, kill = false;
              hit.forEach((o) => { const e = estSkillDmg(u, o, sk); sum += e; if (e >= o.hp) kill = true; });
              const sc = sum * (hit.length >= 2 ? 1.15 : 0.9) + (kill ? 200 : 0) - dTo(t, u.x, u.y) * 0.3;
              if (!best || sc > best.score) best = { kind: 'skill', mode: 'damage', key: sk.key, x: t.x, y: t.y, tx: f.x, ty: f.y, target: f, score: sc };
            });
          });
        } else {
          tiles.forEach((t) => {
            foes.forEach((f) => {
              const d = dTo(t, f.x, f.y);
              if (d < minR || d > range) return;
              const e = estSkillDmg(u, f, sk);
              const kill = e >= f.hp;
              const sc = e * (sk.hits || 1) + (kill ? 170 : 0) - dTo(t, u.x, u.y) * 0.3;
              if (!best || sc > best.score) best = { kind: 'skill', mode: 'damage', key: sk.key, x: t.x, y: t.y, tx: f.x, ty: f.y, target: f, score: sc };
            });
          });
        }
      });
      if (best && (best.score > basic * 1.08 + 12 || (best.target && estSkillDmg(u, best.target, SK.SKILLS[best.key]) >= best.target.hp))) return best;
    }

    /* 5) 단일 아군 버프 */
    const allyBuf = skills.find((s) => s.kind === 'buffAlly');
    if (allyBuf) {
      let best = null;
      tiles.forEach((t) => {
        allies.forEach((a) => {
          if (a.buffs.atk && a.buffs.atk.t > 0) return;
          if (dTo(t, a.x, a.y) > (allyBuf.range || effRng(u))) return;
          const sc = 22 + effAtk(a) * 0.5 + (1 - a.hp / a.maxHp) * 30 - dTo(t, u.x, u.y) * 0.3;
          if (!best || sc > best.score) best = { kind: 'skill', mode: 'buff', key: allyBuf.key, x: t.x, y: t.y, tx: a.x, ty: a.y, target: a, score: sc };
        });
      });
      if (best) return best;
    }

    /* 6) 자기 버프 — 교전 직전 한 번 */
    const selfBuf = skills.find((s) => s.kind === 'buffSelf');
    if (selfBuf && foes.length && !(u.buffs.def && u.buffs.def.t > 0)) {
      const near = Math.min.apply(null, foes.map((f) => manh(u.x, u.y, f.x, f.y)));
      if (near <= 3) return { kind: 'skill', mode: 'instant', key: selfBuf.key, x: u.x, y: u.y, tx: u.x, ty: u.y, score: 18 };
    }
    return null;
  }

  /* 책략을 실제로 펼친다 (UI 조작 없이). 성공하면 true */
  function aiCast(u, sk, x, y) {
    if (!u || !sk || u.acted || (u.mp || 0) < (sk.mp || 0)) return false;
    const tgt = B.units.find((o) => o.alive && o.x === x && o.y === y);
    if (sk.kind === 'heal' || sk.kind === 'buffAlly') { if (!tgt || tgt.side !== u.side) return false; }
    if (sk.kind === 'power' || sk.kind === 'magic') { if (!tgt || tgt.side === u.side) return false; }
    const dist = manh(u.x, u.y, x, y);
    if (sk.minRange && dist < sk.minRange) return false;
    if (sk.kind !== 'buffSelf' && sk.kind !== 'buffAreaAllies' && sk.kind !== 'healArea' && dist > (sk.range || effRng(u))) return false;
    B.sel = u;
    mode = 'skillTarget';
    pendingSkill = Object.assign({ key: sk.key }, sk);
    if (sk.kind === 'buffSelf' || sk.kind === 'buffAreaAllies' || sk.kind === 'healArea') { castInstant(u, sk); return true; }
    trySkillAt(x, y);
    return true;
  }

  /* ───────────── v5.22 — 수성전 수비 역할 분리 ─────────────
     성을 지키는 자동전투에서 원거리·보조 병과가 성문 밖으로 쏟아져 나가
     성벽을 비우던 문제를 고친다.
     · 원거리(궁수·연노병·궁기·포차·발석차) — 성문 안 성벽·망루에서만 쏜다
     · 보조(책사·풍수사·도사·군악대·무희) — 본진 곁을 지키며 회복·버프만 한다
     · 근접(검병·창병·기병·등갑병·무도가·산적·수적·야수병) — 문이 깨지거나 적이
       문 앞까지 붙기 전에는 성 안에서 기다리고, 필요할 때만 출격한다 */
  const DEF_HOLD_ROLE = {
    gungsu: 'wall', gunggi: 'wall', yeonnobyung: 'wall', pocha: 'wall', balseokcha: 'wall',
    chaeksa: 'keep', pungsusa: 'keep', dosa: 'keep', gunakdae: 'keep', muhui: 'keep',
  };
  function defenseHome() {
    if (!B) return null;
    if (B._home) return B._home;
    let gateRow = -1, wallRow = -1;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ch = B.tiles[y] && B.tiles[y][x];
        if (ch === 'G') gateRow = Math.max(gateRow, y);
        if (ch === 'C') wallRow = Math.max(wallRow, y);
      }
    }
    /* 수성전은 진영이 뒤집혀 있다 — 우리 본진은 'allyHQ'(성 안) */
    const hq = (B.sites || []).find((s) => s.type === 'allyHQ')
      || (B.sites || []).find((s) => s.type === 'enemyHQ') || null;
    const towers = [];
    for (let y = 0; y <= Math.max(gateRow, 0); y++) {
      for (let x = 0; x < N; x++) if (B.tiles[y] && B.tiles[y][x] === 'T') towers.push({ x, y });
    }
    B._home = { gateRow, wallRow, insideY: gateRow > 0 ? gateRow - 1 : N - 1, hq, towers };
    return B._home;
  }
  function defenseRoleOf(u) {
    if (!B || !B.defense || !u || u.side !== 'ally') return null;
    if (u._defRole == null) {
      u._defRole = (u.zone === 'tower' ? 'wall' : u.zone === 'keep' ? 'keep' : null)
        || DEF_HOLD_ROLE[u.cls] || 'melee';
    }
    return u._defRole;
  }
  /* 바깥 성문이 부서졌는가 — 부서진 뒤에만 근접이 밖으로 나간다 */
  function outerGateBroken() {
    const list = (B.gates && B.gates.length ? B.gates : (B.gate ? [B.gate] : []));
    if (!list.length) return false;
    const out = list.slice().sort((a, b) => (b.row || 0) - (a.row || 0))[0];
    return !!out && out.hp <= 0;
  }
  function defenseAllowed(u, role, home) {
    if (!home) return null;
    const inside = (x, y) => {
      const row = B.tiles[y];
      if (!row || row[x] == null) return false;
      if (row[x] === 'C' || row[x] === 'H') return false;
      return y <= home.insideY || row[x] === 'G';
    };
    if (role === 'keep') {
      const hq = home.hq || { x: Math.floor(N / 2), y: Math.max(1, home.insideY - 2) };
      return (x, y) => inside(x, y) && manh(x, y, hq.x, hq.y) <= 6;
    }
    if (role === 'wall') return (x, y) => inside(x, y) && y >= home.insideY - 5;
    /* 근접 — 문이 버티는 동안에는 성문 안쪽에서 막고, 문이 깨진 뒤에만 나가서 맞는다 */
    if (outerGateBroken()) return () => true;
    return inside;
  }

  function defenseAllowFor(u) {
    const role = defenseRoleOf(u);
    if (!role) return null;
    return defenseAllowed(u, role, defenseHome());
  }

  /* 한 부대가 할 최선의 행동을 고른다 — 책략 > 사거리 안 적 공격 > (문을 부수는 진영만) 성문 타격 > 접근 */
  function planAuto(u) {
    /* v5.17 — 책략보다 실제 공격·성문 공략을 먼저 본다.
       (예전엔 광역 버프가 늘 앞서서 성문 앞에서 버프만 되풀이하는 자동전투 교착이 있었다.
        회복이 급한 경우에만 책략을 앞세운다.) */
    const sup = planSupportSkill(u);
    if (sup && sup.mode === 'heal' && sup.score > 45) return sup;
    const rng = effRng(u);
    const minR = u.minRng || 1;
    /* v5.14 — 성문 공략은 문을 부수는 진영만 고른다. 수비측은 적 부대 요격·망루 수사에 집중 */
    const stormGate = isGateAttacker(u);
    const foes = B.units.filter((o) => o.alive && o.side !== u.side);
    /* v5.22 — 수성전 수비 역할: 원거리·보조는 성 밖으로 나가지 않는다 */
    const defRole = defenseRoleOf(u);
    const home = defRole ? defenseHome() : null;
    const allow = defRole ? defenseAllowFor(u) : null;
    const tiles = [{ x: u.x, y: u.y }];
    (B.reachCache && B.reachCache.set ? B.reachCache.set : new Set()).forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      if (B.units.some((o) => o.alive && o.x === x && o.y === y)) return;
      if (allow && !allow(x, y)) return;
      tiles.push({ x, y });
    });
    if (allow && tiles.length <= 1) {
      /* 역할 자리에 한 칸도 못 닿으면 성 안 아무 곳이나 — 밖으로는 나가지 않는다 */
      (B.reachCache && B.reachCache.set ? B.reachCache.set : new Set()).forEach((k) => {
        const [x, y] = k.split(',').map(Number);
        if (B.units.some((o) => o.alive && o.x === x && o.y === y)) return;
        const ch = B.tiles[y] && B.tiles[y][x];
        if (!ch || ch === 'C' || ch === 'H') return;
        if (home && y > home.insideY && ch !== 'G') return;
        tiles.push({ x, y });
      });
    }
    let best = null;
    const kind = attackKind(u);
    tiles.forEach((t) => {
      const home = t.x === u.x && t.y === u.y;
      foes.forEach((e) => {
        const d = manh(t.x, t.y, e.x, e.y);
        if (d < minR || d > rng) return;
        if (wallBlocked({ x: t.x, y: t.y }, e) && !canShootOut({ x: t.x, y: t.y, cls: u.cls, side: u.side })) return;
        const est = calcDamage(u, e, {}).dmg;
        const score = (est / Math.max(1, e.maxHp)) * 100 + (1 - e.hp / Math.max(1, e.maxHp)) * 55 + (home ? 12 : 0);
        if (!best || score > best.score) best = { x: t.x, y: t.y, target: e, score, kind: 'hit' };
      });
      if (stormGate && gateIntact() && activeGate()) {
        activeGate().tiles.forEach((g) => {
          if (manh(t.x, t.y, g.x, g.y) > rng) return;
          const sc = (kind === 'rock' ? 90 : kind === 'melee' ? 55 : 25) + (home ? 4 : 0);
          if (!best || sc > best.score) best = { x: t.x, y: t.y, gate: { x: g.x, y: g.y }, score: sc, kind: 'gate' };
        });
      }
    });
    if (best) return best;
    if (sup) return sup;
    let pick = null;
    tiles.forEach((t) => {
      const d = foes.length ? Math.min(...foes.map((f) => manh(t.x, t.y, f.x, f.y))) : 99;
      const gy = (stormGate && gateIntact() && activeGate())
        ? Math.min(...activeGate().tiles.map((g) => manh(t.x, t.y, g.x, g.y))) - 1 : 99;
      let score = -Math.min(d, gy);
      /* 수비측은 망루·본성에 붙어 버티는 쪽을 조금 더 선호한다 (문을 부수는 진영 제외) */
      if (!stormGate && (B.tiles[t.y][t.x] === 'T' || B.tiles[t.y][t.x] === 'K')) score += 2.5;
      /* v5.22 — 역할별 자리 지키기 */
      if (defRole === 'wall' && home) {
        const ch = B.tiles[t.y][t.x];
        if (ch === 'T') score += 12;                                   // 망루 위가 최선 (사거리 +1·방어 +45%)
        else if (t.y >= home.insideY - 3) score += 4;                   // 성문 바로 안쪽 성벽
        if (ch === 'G') score -= 3;                                    // 문통에 서면 뚫린 뒤 그대로 맞는다
        if (t.y > home.insideY && ch !== 'G') score -= 20;
      } else if (defRole === 'keep' && home) {
        const hq = home.hq || { x: Math.floor(N / 2), y: home.insideY };
        score = -manh(t.x, t.y, hq.x, hq.y) * 2.2 - Math.min(d, 8) * 0.5;
        if (B.tiles[t.y][t.x] === 'K') score += 4;
      } else if (defRole === 'melee' && home && gateIntact()) {
        if (B.tiles[t.y][t.x] === 'G') score += 5;                     // 성문 안쪽에서 문을 막는다
        else if (t.y >= home.insideY - 2) score += 2;
        if (t.y > home.insideY && B.tiles[t.y][t.x] !== 'G') score -= 25;
      }
      if (!pick || score > pick.score) pick = { x: t.x, y: t.y, score, kind: 'move' };
    });
    return pick;
  }

  function autoStep() {
    if (!autoOn) return;
    if (!B || B.over) { autoStop(); return; }
    if (busy || !B.introDone) { autoTimer = wait(autoStep, 220); return; }
    if (B.phase !== 'ally') { autoTimer = wait(autoStep, 300); return; }
    if (autoPending) {
      const p = autoPending;
      autoPending = null;
      const u = B.units.find((v) => v.uid === p.uid && v.alive);
      if (u && !u.acted) {
        if (p.skill) {
          const sk = SK.SKILLS[p.skill];
          if (!aiCast(u, sk, p.sx == null ? p.x : p.sx, p.sy == null ? p.y : p.sy)) { u.acted = true; SKBattle.refreshUI(); }
        } else if (p.gate && gateIntact()) doGateAttack(u, p.gate);
        else if (p.target && p.target.alive && canHit(u, p.target)) doAttack(u, p.target);
        else { u.acted = true; SKBattle.refreshUI(); }
      }
      autoTimer = wait(autoStep, 420);
      return;
    }
    const u = B.units.find((v) => v.side === 'ally' && v.alive && !v.acted);
    if (!u) {
      if (busy) { autoTimer = wait(autoStep, 300); return; }
      endTurn();
      autoTimer = wait(autoStep, 600);   // 적군 페이즈가 끝나면 다시 아군 턴을 잡는다
      return;
    }
    selectUnit(u);
    const plan = planAuto(u);
    if (plan && plan.kind === 'skill') {
      if (plan.x !== u.x || plan.y !== u.y) {
        autoPending = { uid: u.uid, skill: plan.key, x: plan.x, y: plan.y, sx: plan.tx, sy: plan.ty };
        moveUnit(u, plan.x, plan.y);
        autoTimer = wait(autoStep, 260);
        return;
      }
      const sk = SK.SKILLS[plan.key];
      if (!aiCast(u, sk, plan.tx == null ? plan.x : plan.tx, plan.ty == null ? plan.y : plan.ty)) { u.acted = true; SKBattle.refreshUI(); }
      autoTimer = wait(autoStep, 420);
      return;
    }
    if (plan && (plan.x !== u.x || plan.y !== u.y)) {
      autoPending = { uid: u.uid, target: plan.kind === 'hit' ? plan.target : null, gate: plan.kind === 'gate' ? plan.gate : null };
      moveUnit(u, plan.x, plan.y);
      autoTimer = wait(autoStep, 260);
      return;
    }
    if (plan && plan.kind === 'hit' && plan.target) doAttack(u, plan.target);
    else if (plan && plan.kind === 'gate' && plan.gate) doGateAttack(u, plan.gate);
    else { u.acted = true; SKBattle.refreshUI(); }
    autoTimer = wait(autoStep, 420);
  }

  function enemyPhase() {
    if (B.over) return;
    sitePhase(true);          // v5.17 — 적 턴 시작: 본진·점령 마을 위 부대 회복
    if (B.over) return;
    classAuraPhase('enemy');
    const enemies = B.units.filter((u) => u.side === 'enemy' && u.alive).sort((a, b) => a.y - b.y);
    let i = 0;
    const step = () => {
      if (B.over) return;
      if (i >= enemies.length) {
        // back to player's turn
        B.turn += 1;
        /* v5.17 — 대형 전장(28·32칸)은 턴 한도를 늘린다 */
        if (B.turn > (N >= 28 ? 40 : 30)) return defeat();
        B.units.forEach((u) => {
          if (!u.alive) return;
          u.acted = false;
          Object.keys(u.buffs).forEach((k) => { u.buffs[k].t -= 1; if (u.buffs[k].t <= 0) delete u.buffs[k]; });
          if (u.side === 'ally') u.mp = Math.min(u.maxMp, u.mp + 3);
          else u.mp = Math.min(u.maxMp, u.mp + 2);
          /* v5.3 — 망루·본성에 선 부대는 턴마다 병력 15% 회복 */
          const holdCh = B.tiles[u.y][u.x];
          if ((holdCh === 'T' || holdCh === 'K') && u.hp < u.maxHp) {
            const hh = Math.max(1, Math.round(u.maxHp * 0.15));
            u.hp = Math.min(u.maxHp, u.hp + hh);
            addHeal(u, hh, u);
            addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.4) * TILE, '+' + hh, '#a8f0b8');
            addFx({ kind: 'heal', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 520 });
          }
        });
        B.phase = 'ally';
        sitePhase(true);       // v5.17 — 아군 턴 시작: 본진·점령 마을 위 부대 회복
        if (B.over) return;
        B.units.forEach((u) => { if (u.side === 'ally' && u.alive) triggerPassive(u, 'turn_start'); });
        classAuraPhase('ally');
        banner('아군 페이즈', 'ally');
        SKBattle.refreshUI();
        const first = B.units.find((u) => u.side === 'ally' && u.alive && !u.acted);
        if (first) selectUnit(first);
        return;
      }
      const e = enemies[i++];
      if (!e.alive) { step(); return; }
      enemyAct(e, () => wait(step, 220));
    };
    step();
  }

  /* v5.17 — AI 역할별 목표지. 호위병은 본진, 돍격대는 빈 마을 → 아군 본진 */
  function aiGoalOf(e) {
    if (!B || !B.sites) return null;
    const enemyHQ = B.sites.find((s) => s.type === 'enemyHQ');
    const allyHQ = B.sites.find((s) => s.type === 'allyHQ');
    if (e.role === 'guard') return enemyHQ || null;
    const free = B.sites.filter((s) => s.type === 'village' && s.owner !== e.side);
    if (free.length) {
      const best = free.map((s) => ({ s, d: manh(e.x, e.y, s.x, s.y) })).sort((a, b) => a.d - b.d)[0];
      if (best && best.d <= 10) return best.s;
    }
    return allyHQ || null;
  }

  function enemyAct(e, done) {
    if (!e.alive) { done(); return; }
    if (e.x != null) trackTurn(e, true);
    const targets = B.units.filter((u) => u.side === 'ally' && u.alive);
    if (!targets.length) { done(); return; }
    let target = targets.reduce((best, t) => {
      const d = manh(e.x, e.y, t.x, t.y);
      return !best || d < best.d ? { t, d } : best;
    }, null).t;
    const aiGoal = aiGoalOf(e);
    const rng = effRng(e);
    /* v5.3 — 망루·본성에 선 수비 부대는 적이 사거리 밖이면 자리를 지켜 회복한다 */
    const holdCh = B.tiles[e.y][e.x];
    if (holdCh === 'T' || holdCh === 'K') {
      const near = Math.min.apply(null, targets.map((t) => manh(e.x, e.y, t.x, t.y)));
      if (near > rng + 1) { e.acted = true; finishCheck(); done(); return; }
    }

    /* v5.3 — 적도 책략을 판단해 쓴다 (회복·버프·디버프·공격 책략) */
    const sup = planSupportSkill(e);
    if (sup) {
      const sk = SK.SKILLS[sup.key];
      const go = () => {
        if (!B || B.over) { done(); return; }
        const ok = aiCast(e, sk, sup.tx == null ? sup.x : sup.tx, sup.ty == null ? sup.y : sup.ty);
        if (!ok) { e.acted = true; finishCheck(); done(); return; }
        e.acted = true;
        wait(() => { if (!B || B.over) { done(); return; } finishCheck(); done(); }, 760);
      };
      if (sup.x !== e.x || sup.y !== e.y) {
        animatePath(e, findPath(e, sup.x, sup.y), { step: paceMs(88), onDone: () => wait(go, 150) });
      } else go();
      return;
    }

    // cast a heal on a wounded ally if priest
    if (e.cls === 'pungsusa' && e.mp >= 10) {
      const hurt = B.units.filter((u) => u.side === 'enemy' && u.alive && u.hp < u.maxHp * 0.6)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt && manh(e.x, e.y, hurt.x, hurt.y) <= 2) {
        const heal = healAmount({ healPct: 0.15 }, hurt);
        e.mp -= 10; hurt.hp = Math.min(hurt.maxHp, hurt.hp + heal);
        addFloat((hurt.x + 0.5) * TILE, (hurt.y + 0.4) * TILE, '+' + heal, '#a8f0b8');
        addFx({ kind: 'heal', x: (hurt.x + 0.5) * TILE, y: (hurt.y + 0.5) * TILE, life: 600 });
        e.acted = true; done(); return;
      }
    }

    // magic if in range
    if ((e.cls === 'chaeksa') && e.mp >= 10 && manh(e.x, e.y, target.x, target.y) <= rng) {
      e.mp -= 10;
      e.acted = true;
      castCircle(e, '255,170,120');
      SK.sfx.play('spell');
      wait(() => {
        if (!B || B.over) { done(); return; }
        const dmg = Math.max(6, Math.round((20 + e.ji * 0.1 + Math.min(200, e.hp * 0.01) - target.ji * 0.04) * sizeScale(target) * 0.9));
        target.hp = Math.max(0, target.hp - dmg);
        addMagicDamage(e, target, dmg);
        addFloat((rxOf(target) + 0.5) * TILE, (ryOf(target) + 0.4) * TILE, '화계 ' + dmg, '#ffb36a');
        addFx({ kind: 'fire', x: (rxOf(target) + 0.5) * TILE, y: (ryOf(target) + 0.55) * TILE, life: 700 });
        impactAt(target, '255,150,90');
        SK.sfx.play('hit');
        if (target.hp <= 0) downUnit(target);
        finishCheck();
        done();
      }, 300);
      return;
    }

    const minR = e.minRng || 1;
    const curD = manh(e.x, e.y, target.x, target.y);
    const already = curD >= minR && curD <= rng;
    /* v5.14 — 수성전 침공군: 지금 사거리 안에 아군이 없으면 성문을 부수러 간다.
       (수성전에서 성문을 칠 수 있는 진영은 적군뿐이다) */
    if (!already && isGateAttacker(e) && gateIntact()) {
      const gp = gateStrikePlan(e);
      if (gp) { enemyGateStrike(e, gp, done); return; }
    }
    const reach = reachSet(e);
    const freeTiles = [];
    reach.forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      const occ = B.units.find((o) => o.alive && o.x === x && o.y === y);
      if (!occ) freeTiles.push({ x, y });
    });
    let best = null;
    freeTiles.forEach((t) => {
      const d = manh(t.x, t.y, target.x, target.y);
      const inRange = d >= minR && d <= rng;
      let score = inRange ? -100 + d : (d < minR ? 150 - d : d);
      /* v5.17 — 수비대는 본진 곁을, 돍격대는 마을·아군 본진 쪽으로 움직인다 */
      if (aiGoal) {
        const gd = manh(t.x, t.y, aiGoal.x, aiGoal.y);
        if (e.role === 'guard') score += gd * (inRange ? 0.25 : 0.85);
        else score += gd * 0.5;
      }
      if (!best || score < best.score) best = { t, score, inRange };
    });
    const moveTo = already ? null : (best && best.t);
    const finishMove = () => {
      const path = moveTo ? findPath(e, moveTo.x, moveTo.y) : [];
      animatePath(e, path, { step: paceMs(88), onDone: () => {
        wait(() => {
          if (!B || B.over) { done(); return; }
          const dist = manh(e.x, e.y, target.x, target.y);
          if (dist >= (e.minRng || 1) && dist <= rng && !wallBlocked(e, target)) {
            attackUnit(e, target, {}, () => {
              if (!B || B.over) { done(); return; }
              if (target.alive && manh(target.x, target.y, e.x, e.y) <= effRng(target) && Math.random() < 0.7) {
                wait(() => {
                  if (!B || B.over) { done(); return; }
                  if (!target.alive || !e.alive) { e.acted = true; finishCheck(); done(); return; }
                  attackUnit(target, e, {}, () => { e.acted = true; finishCheck(); done(); });
                }, 220);
                return;
              }
              e.acted = true;
              finishCheck();
              done();
            });
            return;
          }
          e.acted = true;
          finishCheck();
          done();
        }, 170);
      } });
    };
    finishMove();
  }

  function castCircle(u, color) {
    addFx({ kind: 'spell', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.72) * TILE, life: 720, color });
    addFx({ kind: 'ring', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.72) * TILE, life: 520, color: '210,225,255' });
  }

  /* v5.11 — 전투 결산: 아군 장수별 가한 피해(딜)·받은 피해(탱)·회복(힐)·처치·MVP */
  /* v5.11 — 결산 MVP에게 공훈치 보너스 (전투 공훈 정산 연동) */
  function awardMvpMerit() {
    if (!B || !B.units) return null;
    const list = B.units.filter((u) => u.side === 'ally' && u.uid).map((u) => {
      const s = u.stat || { dealt: 0, taken: 0, heal: 0, kills: 0 };
      return { u, score: s.dealt * 0.6 + s.taken * 0.18 + s.heal * 0.5 + s.kills * 150 };
    }).sort((a, b) => b.score - a.score);
    if (!list.length || list[0].score <= 0) return null;
    const h = SK.state.heroes.find((x) => x.uid === list[0].u.uid);
    if (h && SK.gainMerit) SK.gainMerit(h, 6);
    return h ? h.name : null;
  }

  function battleReportHTML() {
    if (!B || !B.units) return '';
    const list = B.units.filter((u) => u.side === 'ally').map((u) => {
      const s = u.stat || { dealt: 0, taken: 0, heal: 0, kills: 0 };
      return { name: u.name, dealt: Math.round(s.dealt), taken: Math.round(s.taken),
        heal: Math.round(s.heal), kills: s.kills, alive: u.alive, fate: u.fate || null,
        score: s.dealt * 0.6 + s.taken * 0.18 + s.heal * 0.5 + s.kills * 150 };
    });
    if (!list.length) return '';
    const best = list.slice().sort((a, b) => b.score - a.score)[0];
    const maxDealt = Math.max(1, ...list.map((r) => r.dealt));
    const fmtN = (n) => Math.round(n).toLocaleString('ko-KR');
    /* v5.16 — 총공격력·총피해·총회복 합계 줄 */
    const sum = list.reduce((a, r) => ({ dealt: a.dealt + r.dealt, taken: a.taken + r.taken, heal: a.heal + r.heal, kills: a.kills + r.kills }), { dealt: 0, taken: 0, heal: 0, kills: 0 });
    return `<div class="rm-report">
      <div class="rm-report-head"><b>전투 결산</b><span>MVP <em>👑 ${best.name}</em></span></div>
      <div class="rm-report-scroll"><table class="rm-dmg">
        <thead><tr><th>장수</th><th>총공격</th><th>받은피해</th><th>회복</th><th>처치</th></tr></thead>
        <tbody>${list.sort((a, b) => b.score - a.score).map((r) => `<tr class="${r.name === best.name ? 'mvp' : ''}">
          <td>${r.name === best.name ? '👑 ' : ''}${r.name}${r.alive ? '' : ` <em class="rm-fallen ${r.fate === '생포' ? 'captured' : ''}">${r.fate || '퇴각'}</em>`}</td>
          <td><i style="width:${Math.max(2, Math.round((r.dealt / maxDealt) * 32))}px"></i>${fmtN(r.dealt)}</td>
          <td>${fmtN(r.taken)}</td><td>${r.heal ? '+' + fmtN(r.heal) : '0'}</td><td>${r.kills}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="rm-sum-bar"><span>합계</span><b>${fmtN(sum.dealt)}</b><b>${fmtN(sum.taken)}</b><b>${sum.heal ? '+' + fmtN(sum.heal) : '0'}</b><b>${sum.kills}</b></div>
    </div>`;
  }

  function victoryQuote() {
    const lord = SK.factionInfo(SK.playerFaction()).lord || '조조';
    return SK.quoteOf(lord, 'victory') || SK.quoteOf('조조', 'victory');
  }

  /* ───────────── v5.3 — 행군 요격전의 승패 ───────────── */
  function marchOf(id) { return ((SK.state && SK.state.marches) || []).find((m) => m.id === id); }

  function interceptVictory() {
    B.over = true;
    SK.sfx.play('victory');
    if (window.JojoBGM) { try { JojoBGM.play('victory'); } catch (e) { /* ignore */ } }
    const s = SK.state;
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const dead = B.units.filter((u) => u.side === 'ally' && !u.alive);
    const m = marchOf(B.intercept && B.intercept.marchId);
    if (m) {
      m.units = survivors.map((u) => (u.uid
        ? { kind: 'hero', uid: u.uid, troops: Math.max(1, Math.round(u.hp)) }
        : { kind: 'regiment', cls: u.cls, name: u.name, troops: Math.max(1, Math.round(u.hp)) }));
      m.heroes = m.units.filter((x) => x.kind === 'hero').map((x) => x.uid);
    }
    dead.forEach((u) => {
      if (!u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (h) { h.marchId = null; h.hp = 1; }
    });
    survivors.forEach((u) => {
      if (!u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (h) { h.hp = Math.max(1, Math.round((u.hp / u.maxHp) * SK.maxHpOf(h.cls, h.lv))); SK.gainExp(h, 45, 12); }
    });
    if (s.cities[B.origin] && s.cities[B.origin].owner === SK.playerFaction()) s.purseCity = B.origin;
    s.gold += B.rewards.gold;
    s.food += B.rewards.food;
    s.fame += 2;
    s.pendingMarch = null;
    SK.save();
    SKBattle.refreshUI();
    const m2 = marchOf(B.intercept && B.intercept.marchId);
    const left = m2 ? m2.left : 0;
    SK.modal({
      kicker: '요격전 승리',
      title: `${B.def.name} 돌파`,
      body: `<div class="result-modal win"><div class="rm-seal">승</div>
        <p class="rm-line">길을 막던 적 요격대를 물리쳤습니다. <b>${left > 0 ? `${left}개월 뒤 도착` : '곧 도착'}</b> — 행군을 이어갑니다.</p>
        ${battleReportHTML()}
        <div class="rm-rewards">
          <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
          <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
          <div><span>병력</span><b>${Math.round(survivors.reduce((a, u) => a + u.hp, 0)).toLocaleString('ko-KR')}</b></div>
        </div>
        <p class="rm-note">다음 달에 행군이 한 달 더 진행됩니다.</p></div>`,
      actions: [{ label: '지도로', primary: true, onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  function interceptDefeat() {
    B.over = true;
    SK.sfx.play('defeat');
    const s = SK.state;
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = survivors.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
    const st = s.cities[B.origin];
    if (st) st.troops = Math.min(20000, st.troops + Math.round(troopsLeft));
    const mid = B.intercept && B.intercept.marchId;
    s.marches = (s.marches || []).filter((m) => m.id !== mid);
    B.units.forEach((u) => {
      if (u.side !== 'ally' || !u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (h) { h.marchId = null; h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * (u.alive ? 0.5 : 0.2))); }
    });
    if (s.cities[B.origin] && s.cities[B.origin].owner === SK.playerFaction()) s.purseCity = B.origin;
    s.gold = Math.max(0, s.gold - 100);
    s.pendingMarch = null;
    SK.save();
    SK.modal({
      kicker: '행군 실패',
      title: '본성으로 회군',
      body: `<div class="result-modal lose"><div class="rm-seal">패</div>
        <p class="rm-line">요격대에 길이 막혔습니다. 남은 병력은 ${SK.CITY[B.origin] ? SK.CITY[B.origin].name : '본성'}으로 돌아갑니다.</p>
        ${battleReportHTML()}
        <p class="rm-note">복귀 병력 ${Math.round(troopsLeft).toLocaleString('ko-KR')} · 금 -100</p></div>`,
      actions: [{ label: '지도로', onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  function clearMarchFlags() {
    const s = SK.state;
    B.units.forEach((u) => {
      if (u.side !== 'ally' || !u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (h) h.marchId = null;
    });
    const mid = B.marchId || (B.intercept && B.intercept.marchId);
    if (mid) s.marches = (s.marches || []).filter((m) => m.id !== mid);
    s.pendingMarch = null;
  }

  /* ══════════════════════════════════════════════════════════════
     v5.8 — 전투 후 포로 처분
     이긴 자리가 적 장수를 사로잡으면 등용·석방·처형을 고른다.
     · 등용 — 매력·충성 판정. 성공하면 내 장수(충성 55)가 된다
     · 석방 — 금과 명성을 얻는다
     · 처형 — 명성이 조금 깎이지만 그 장수는 다시 나오지 않는다
     ══════════════════════════════════════════════════════════════ */
  function rollPrisoners() {
    const bossName = (SK.factionInfo(B.faction) || {}).lord || '';
    const named = [];
    const caught = [];          // v5.17 — 전장에서 생포된 적은 반드시 포로가 된다
    B.units.forEach((u) => {
      if (u.side !== 'enemy' || !u.genId) return;
      const g = SK.GEN_BY_ID[u.genId];
      if (!g || g.name === bossName) return;
      if (named.some((x) => x.id === g.id)) return;
      named.push(g);
      if (u.fate === '생포') caught.push(g);
    });
    const out = caught.slice(0, 2);
    named.forEach((g) => {
      if (out.length >= 2 || out.indexOf(g) >= 0) return;
      if (Math.random() < 0.45) out.push(g);
    });
    if (!out.length && named.length && Math.random() < 0.3) {
      out.push(named[Math.floor(Math.random() * named.length)]);
    }
    return out;
  }

  let prisonCity = null;
  const PRISON_CAP = 6;
  function statePrisonCapLeft() {
    const n = ((SK.state && SK.state.prisoners) || []).length;
    return n >= PRISON_CAP ? '억류 자리 가득' : `억류 ${n}/${PRISON_CAP}`;
  }
  function addPrisoner(g, cityId) {
    const s = SK.state;
    if (!s || !g) return null;
    s.prisoners = s.prisoners || [];
    const found = s.prisoners.find((p) => p.gid === g.id);
    if (found) return found;
    if (s.prisoners.length >= PRISON_CAP) return null;
    /* v5.17 — 몸값 제안은 "누가 잡았나"가 아니라 "원 소속 세력"이 보낸다.
       사로잡은 순간의 상대 세력을 by에 남겨 두고, 그 세력이 멸망했으면 외교 제안을 끊는다. */
    const by = (B && B.faction) || (g.faction !== '재야' ? g.faction : '') || '';
    const rec = { gid: g.id, name: g.name, tier: g.tier || 'C', faction: g.faction || '', by: by,
      city: cityId || s.lastCity, months: 0, loyal: SK.enemyLoyal ? SK.enemyLoyal(g) : 72,
      offer: null, recruitTried: false };
    s.prisoners.push(rec);
    /* 가둔 장수는 적 성 명부에서 빠진다 (다시 수비대로 나오지 않게) */
    SK.CITY_LIST.forEach((c) => { const cs = s.cities[c.id]; if (cs && cs.genIds) cs.genIds = cs.genIds.filter((id) => id !== g.id); });
    return rec;
  }
  SK.addPrisoner = addPrisoner;

  function openPrisoners(list, idx, log) {
    const s = SK.state;
    const all = list || (B && B.prisoners) || [];
    const cityId = prisonCity || (B && B.targetId) || s.lastCity;
    const i = idx == null ? 0 : idx;
    const lines = log || [];
    if (!all.length) return;
    if (i >= all.length) {
      if (lines.length) {
        SK.modal({
          kicker: '포로 처리', title: '포로를 정리했습니다',
          body: `<div class="prison-log">${lines.map((l) => `<p>${l}</p>`).join('')}</div>`,
          actions: [{ label: '지도로', primary: true }],
        });
      }
      return;
    }
    const g = all[i];
    const loy = SK.enemyLoyal ? SK.enemyLoyal(g) : 72;
    const cls = SK.genClass(g);
    const lordName = ((s.factions || {})[s.playerFaction] || {}).lord || '';
    const lordG = lordName ? SK.GEN_BY_NAME[lordName] : null;
    const cha = (lordG && lordG.charm) || 62;
    const pRec = clamp(0.5 + (cha - 60) * 0.006 - (loy - 70) * 0.004 - (g.tier === 'S' ? 0.12 : g.tier === 'A' ? 0.05 : 0), 0.08, 0.85);
    const gold = ({ S: 500, A: 350, B: 250, C: 180 }[g.tier] || 200);
    const m = SK.modal({
      kicker: `포로 ${i + 1} / ${all.length}`, title: `${SK.josa(g.name, 'eul')} 어떻게 할까`, wide: true,
      body: `<div class="prison-card">
        <img class="prison-port" src="${SK.ptSrc(SK.genPortrait(g))}" alt="">
        <div class="prison-main">
          <b>${g.name}</b>
          <span>${SK.CLASSES[cls].name} · ${g.tier}급 · 지력 ${g.intel} · 무력 ${g.war}</span>
          <span class="prison-loy"><i style="width:${loy}%"></i><em>충성 ${loy}</em></span>
          <p>${g.tier === 'S' || g.tier === 'A' ? '이름난 장수라 쉽게 무릎을 굽히지 않습니다.' : '싸움에 진 자세로 고개를 숙이고 있습니다.'}</p>
        </div>
      </div>
      <div class="prison-opts">
        <button class="prison-opt hire" data-p="hire"><b>등용</b><span>매력 대결 · 성공 ${Math.round(pRec * 100)}%</span></button>
        <button class="prison-opt free" data-p="free"><b>석방</b><span>금 +${gold} · 명성 +3</span></button>
        <button class="prison-opt hold" data-p="hold"><b>포로 억류</b><span>${statePrisonCapLeft()} · 3개월 탈출 불가 · 매달 설득</span></button>
      </div>`,
      actions: [], dismissible: false,
    });
    m.el.querySelectorAll('.prison-opt').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.p;
        let line = '';
        if (act === 'hire') {
          if (Math.random() < pRec) {
            const hero = makeHeroByGen(g, cityId);
            if (hero) { hero.loyal = 55; s.heroes.push(hero); s.fame += 4; }
            line = `<b>${g.name}</b> — 등용 성공. 충성 55로 우리 장수가 되었습니다. [포상]으로 마음을 잡으십시오.`;
            SK.sfx.play('ui');
          } else {
            s.fame = Math.max(0, (s.fame || 0) + 1);
            if (SK.state) { SK.state.genLoyal = SK.state.genLoyal || {}; }
            line = `<b>${g.name}</b> — “두 번 다시 그런 말 마시오.” 등용 실패. 풀어 주었습니다. 명성 +1.`;
            SK.sfx.play('deny');
          }
        } else if (act === 'free') {
          if (SK.setPurse) SK.setPurse(cityId);
          s.gold += gold;
          s.fame += 3;
          line = `<b>${g.name}</b> — 석방. 몸값 금 +${gold}, 명성 +3.`;
          SK.sfx.play('coin');
        } else {
          /* v5.11 — 처형 대신 포로 억류: 첫 3개월 탈출 불가, 이후 매달 확률 탈출 */
          const rec = addPrisoner(g, cityId);
          line = rec
            ? `<b>${g.name}</b> — 포로 억류. ${cityId && SK.CITY[cityId] ? SK.CITY[cityId].name : '성'} 순찰소에 가뒀습니다. 3개월은 탈출하지 못하고, 그 뒤로는 순찰소·치안이 높을수록 탈출이 어려워집니다.`
            : `<b>${g.name}</b> — 억류할 자리가 없습니다. 6명까지만 가둘 수 있어 풀어 주었습니다.`;
          if (rec) SK.sfx.play('drum'); else SK.sfx.play('deny');
        }
        SK.save(); SK.refreshHud();
        m.close();
        lines.push(line);
        wait(() => openPrisoners(all, i + 1, lines), 240);
      };
    });
  }
  /* GENERALS 데이터로 내 장수 하나 만들기 (전투 후 포로·투항용) */
  function makeHeroByGen(g, cityId) {
    if (SK.makeHero) return SK.makeHero(g.name, cityId, SK.genLv(g));
    const cls = SK.genClass(g);
    return {
      uid: 'g_' + g.id, baseId: 'gen', genId: g.id, name: g.name, hanja: '', cls,
      portrait: SK.genPortrait(g), unit: SK.genUnit(g), lv: SK.genLv(g),
      wu: g.war, ji: g.intel, tong: g.leadership, pol: g.politics || 60, cha: g.charm || 60,
      loyal: 55, tier: g.tier, skillName: g.skill || '', hp: 100, mp: 60, city: cityId,
      generic: true, exp: 0, tierLv: 0, equip: {}, actedThisMonth: true,
    };
  }

  /* ══════════════════════════════════════════════════════════════
     v5.9 — 부상병 · 지원군 정산
     · 아군 손실 일부가 전사 대신 부상병으로 남아 성에서 회복한다
     · 수성전에 온 원군은 살아남으면 원래 성으로 병력을 데리고 돌아간다
     ══════════════════════════════════════════════════════════════ */
  function deployedOf(side) {
    return (B.units || []).filter((u) => u.side === side).reduce((a, u) => a + (u.maxHp || u.hp || 0), 0);
  }
  function lostOf(side, filter) {
    const list = (B.units || []).filter((u) => u.side === side && (!filter || filter(u)));
    const max = list.reduce((a, u) => a + (u.maxHp || 0), 0);
    const left = list.reduce((a, u) => a + Math.max(0, u.hp || 0), 0);
    return Math.max(0, Math.round(max - left));
  }
  function settleReinforce() {
    const s = SK.state;
    const r = B && B.reinforce;
    if (!r) return null;
    const list = (B.units || []).filter((u) => u.side === 'ally' && u.rfg);
    const left = Math.round(list.filter((u) => u.alive).reduce((a, u) => a + Math.max(0, u.hp || 0), 0));
    const lost = lostOf('ally', (u) => !!u.rfg);
    const home = s.cities[r.from];
    const homeOk = !!(home && home.owner === SK.playerFaction());
    if (homeOk) {
      home.troops = Math.min(20000, Math.round(home.troops || 0) + left);
    } else {
      const tgt = s.cities[B.targetId];
      if (tgt && tgt.owner === SK.playerFaction()) tgt.troops = Math.min(20000, Math.round(tgt.troops || 0) + left);
    }
    const wound = (homeOk && SK.addWounded && lost) ? SK.addWounded(r.from, lost, { ratio: SK.woundedRatio(B.origin) }) : 0;
    let gensBack = 0;
    (r.units || []).forEach((spec) => {
      if (!spec.uid) return;
      const h = (s.heroes || []).find((x) => x.uid === spec.uid);
      if (!h) return;
      delete h.rfgTo;
      h.city = homeOk ? r.from : B.targetId;
      const bu = list.find((u) => u.uid === spec.uid);
      if (bu) {
        h.hp = Math.max(1, Math.round((Math.max(0, bu.hp) / bu.maxHp) * SK.maxHpOf(h.cls, h.lv)));
        if (bu.alive) SK.gainExp(h, 40);
      }
      gensBack += 1;
    });
    s.reinforce = null;
    B.reinforce = null;
    return { from: r.from, home: SK.CITY[r.from] ? SK.CITY[r.from].name : '', left, lost, wound, gens: gensBack, homeOk };
  }
  /* 전투가 끝나면(B.reinforce가 없어도) 남아 있는 지원군 표시를 풀어 준다 */
  function clearReinforceFlags() {
    const s = SK.state;
    if (!s) return;
    if (s.reinforce) return;
    (s.heroes || []).forEach((h) => { if (h.rfgTo) delete h.rfgTo; });
  }

  /* ───────────── 승패 ───────────── */
  function victory() {
    if (B.over) return;
    if (B.intercept) { interceptVictory(); return; }
    if (B.defense) { defenseVictory(); return; }
    B.over = true;
    SK.sfx.play('victory');
    if (window.JojoBGM) { try { JojoBGM.play('victory'); } catch (e) { /* ignore */ } }
    const s = SK.state;
    const st = s.cities[B.targetId];
    const c = SK.CITY[B.targetId];
    const prevOwner = st.owner;
    const defeatedNames = B.units.filter((u) => u.side === 'enemy').map((u) => u.name);
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = survivors.reduce((sum, u) => sum + u.hp, 0);
    /* v5.9 — 잃은 병력의 35~50%는 전사 대신 부상병으로 함락한 성에 남는다 */
    const lostN = lostOf('ally');
    st.owner = SK.playerFaction();
    st.genIds = [];
    st.wounded = 0;
    const woundedAdd = lostN && SK.addWounded ? SK.addWounded(B.targetId, lostN, { ratio: SK.woundedRatio(B.origin) }) : 0;
    st.troops = Math.max(1200, Math.round(troopsLeft));
    st.def = Math.max(30, Math.round(st.def * 0.8));
    /* v5.16 — 공성 전란 피해: 오래 끌거나(7턴~) 중간 성문을 부순 채 함락하면
       성벽·내성 시설 경험치·레벨·농업·상업·치안·인구가 함께 상한다.
       → 성 밖에서 [요격]해 미리 막는 쪽이 이득이라는 유인이 생긴다. */
    let siegeWreck = null;
    if (B.type === 'siege' || B.type === 'fortress') {
      const gatesBroken = (B.gates || []).filter((g) => g.hp <= 0).length;
      const longFight = clamp(((B.turn || 1) - 6) / 10, 0, 1);
      const sev = clamp(0.18 + longFight * 0.42 + gatesBroken * 0.08, 0.18, 0.86);
      const b0 = { def: Math.round(st.def || 30), agri: Math.round(st.agri || 0), comm: Math.round(st.comm || 0), order: Math.round(st.order || 0), pop: Math.round(st.pop || 0) };
      st.def = Math.max(24, Math.round((st.def || 30) - (6 + 20 * sev)));
      st.agri = clamp((st.agri || 0) - Math.round(2 + 7 * sev), 0, 100);
      st.comm = clamp((st.comm || 0) - Math.round(2 + 7 * sev), 0, 100);
      st.order = clamp((st.order || 0) - Math.round(3 + 8 * sev), 0, 100);
      st.pop = Math.max(6000, Math.round((st.pop || 0) * (1 - 0.01 - 0.03 * sev)));
      let wrecked = 0;
      (st.slots || []).forEach((sl) => {
        if (!sl || !sl.key) return;
        sl.exp = Math.round((sl.exp || 0) * (1 - 0.15 - 0.35 * sev));
        if (sev > 0.58 && Math.random() < 0.22) {
          const lv = sl.lv || 1;
          if (lv > 1) { sl.lv = lv - 1; wrecked += 1; }
        }
      });
      siegeWreck = { turn: B.turn || 1, gates: gatesBroken, sev, wrecked,
        def: b0.def - Math.round(st.def), agri: b0.agri - Math.round(st.agri),
        comm: b0.comm - Math.round(st.comm), order: b0.order - Math.round(st.order),
        pop: b0.pop - Math.round(st.pop) };
    }
    st.loyalty = 55;
    st.governor = null;
    st.advisor = null;
    st.auto = true;
    st.bandit = false;
    if (st.train == null) st.train = 50;
    if (SK.refillTalents) { try { SK.refillTalents(B.targetId); } catch (e) { /* ignore */ } }
    s.purseCity = B.targetId;      // v5.11 — 함락한 성의 금고·창고를 차지한다
    s.gold += B.rewards.gold;
    s.food += B.rewards.food;
    s.fame += 12 + (SK.battleTypeFor(c) === 'fortress' ? 6 : 0) + (B.event ? 5 : 0);
    const drop = SK.rollTreasure ? SK.rollTreasure(defeatedNames, c.name) : null;
    if (drop && SK.codexTreasure) SK.codexTreasure(drop.id);
    awardMvpMerit();
    /* v5.8 — 이긴 자리에서 적 장수 일부를 사로잡는다 */
    prisonCity = B.targetId;
    const prisoners = rollPrisoners();
    B.prisoners = prisoners;
    const levelUps = [];
    s.heroes.forEach((h) => {
      const u = B.units.find((x) => x.uid === h.uid);
      if (u) {
        h.hp = Math.max(1, Math.round((u.hp / u.maxHp) * SK.maxHpOf(h.cls, h.lv)));
        h.mp = u.mp;
        h.marchId = null;
        if (u.alive) h.city = B.targetId;
        const gain = (u.expGain || 0) + (u.alive ? 70 : 30) + (B.def.name === '공성전' ? 15 : 0);
        /* v5.10 — 승리·참전·격파의 공훈치 */
        const merit = 10 + defeatedNames.length * 3 + (u.alive ? 6 : 0);
        const ups = SK.gainExp(h, gain, merit);
        if (ups.length) levelUps.push({ name: h.name, lv: h.lv, title: SK.classTitle(h.cls, h.lv), promote: ups.some((x) => x.promote) });
      }
    });
    // move wounded survivors to the captured city
    clearMarchFlags();
    SK.save();
    SKBattle.refreshUI();
    const owned = SK.CITY_LIST.filter((x) => s.cities[x.id].owner === SK.playerFaction()).length;
    SK.modal({
      kicker: '승리',
      title: `${c.name} 함락`,
      body: `<div class="result-modal win">
        <div class="rm-seal">승</div>
        ${B.winReason ? `<p class="rm-reason">${B.winReason}${B.winReason.indexOf('전멸') >= 0 ? '' : ' — 적 진영이 무너졌습니다'}!</p>` : ''}
        <p class="rm-line">${SK.josa(SK.factionName(prevOwner), 'eul')} 무찌르고 <b>${SK.josa(c.name, 'eul')}</b> 차지했습니다.</p>
        <div class="rm-rewards">
          <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
          <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
          <div><span>명성</span><b>+12</b></div>
          <div><span>영토</span><b>${owned} / ${SK.CITY_LIST.length}</b></div>
          ${woundedAdd ? `<div class="rm-wound"><span>부상병</span><b>${woundedAdd.toLocaleString('ko-KR')}</b><em>회복중</em></div>` : ''}
        </div>
        ${battleReportHTML()}
        ${drop ? `<div class="rm-treasure" style="--gc:${SK.GRADE_COLOR[drop.grade]}">
          <span class="rt-grade">${drop.grade} 보물</span>
          <b>${drop.name}</b><em>${drop.effect}</em>
        </div>` : ''}
        ${levelUps.length ? `<div class="rm-levels">${levelUps.map((l) => `<span class="${l.promote ? 'promote' : ''}">${l.name} Lv.${l.lv}${l.promote ? ` · ${l.title} 승급!` : ' 달성'}</span>`).join('')}</div>` : ''}
        <div class="rm-survivors">${survivors.map((u) => `<img src="${SK.ptSrc(u.portrait)}" title="${u.name}">`).join('')}</div>
        ${prisoners.length ? `<div class="rm-prisoners"><span class="rp-tag">포로 ${prisoners.length}명</span>${prisoners.map((g) => `<img src="${SK.ptSrc(SK.genPortrait(g))}" title="${g.name}">`).join('')}<em>승리를 마치면 처리합니다</em></div>` : ''}
        ${woundedAdd ? `<p class="rm-note">부상병 ${woundedAdd.toLocaleString('ko-KR')}명이 ${c.name}에서 회복 중입니다 — 달이 바뀌면 돌아오고, [병영]에서 금으로 바로 치료할 수 있습니다.</p>` : ''}
        ${B.event ? `<p class="rm-event">특별 이벤트 — ${B.event.title} · 명성 +5</p>` : ''}
        ${siegeWreck ? `<p class="rm-war">전란 피해 — ${siegeWreck.turn}턴 공성${siegeWreck.gates ? ` · 성문 ${siegeWreck.gates}개 파괴` : ''} · 성벽 −${siegeWreck.def} · 농업 −${siegeWreck.agri} · 상업 −${siegeWreck.comm} · 치안 −${siegeWreck.order} · 인구 −${Math.round(siegeWreck.pop).toLocaleString('ko-KR')}${siegeWreck.wrecked ? ` · 시설 ${siegeWreck.wrecked}곳 Lv. 하락` : ''} · 내성 건물 경험치 −${Math.round((0.15 + 0.35 * siegeWreck.sev) * 100)}%<br><em>성을 오래 두드리면 함락해도 쓸모가 줄어듭니다. 다음에는 행군 길목에서 [요격]해 적을 먼저 꺾으십시오.</em></p>` : ''}
        ${victoryQuote() ? `<p class="rm-quote">“${victoryQuote()}”</p>` : ''}
        <p class="rm-note">${owned >= SK.CITY_LIST.length ? '천하가 하나로 모였습니다!' : '다음 성으로 나아가십시오.'}</p>
      </div>`,
      actions: [{ label: prisoners.length ? '포로를 처리한다' : '지도로', primary: true, onClick: () => {
        closeBattle(); SK.showMap();
        if (prisoners.length) wait(() => openPrisoners(prisoners), 340);
      } }],
      dismissible: false,
    });
  }

  function defeat() {
    if (B.over) return;
    if (B.intercept) { interceptDefeat(); return; }
    if (B.defense) { defenseDefeat(); return; }
    B.over = true;
    SK.sfx.play('defeat');
    const s = SK.state;
    const st = s.cities[B.origin];
    const defeatedNames = B.units.filter((u) => u.side === 'enemy').map((u) => u.name);
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = survivors.reduce((sum, u) => sum + u.hp, 0);
    const originMine = !!(st && st.owner === SK.playerFaction());
    if (originMine) st.troops = Math.min(20000, st.troops + Math.round(troopsLeft));
    /* v5.9 — 퇴각해도 잃은 병력의 일부는 부상병으로 본성에 돌아온다 */
    const woundedAdd = (originMine && lostOf('ally') && SK.addWounded) ? SK.addWounded(B.origin, lostOf('ally'), { ratio: SK.woundedRatio(B.origin) }) : 0;
    if (s.cities[B.origin] && s.cities[B.origin].owner === SK.playerFaction()) s.purseCity = B.origin;
    s.gold = Math.max(0, s.gold - 200);
    B.units.forEach((u) => {
      if (u.side === 'ally' && u.uid) {
        const h = s.heroes.find((x) => x.uid === u.uid);
        if (h) { h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.4)); h.marchId = null; }
      }
    });
    /* v5.11 — 패배하면 낮은 확률로 장수 한 명이 적에게 사로잡힌다 → 포로 교환 협상 재료 */
    let captured = null;
    const alive = B.units.filter((u) => u.side === 'ally' && u.uid && u.alive);
    if (alive.length && B.faction && B.faction !== 'neutral' && Math.random() < 0.22) {
      const pick = alive[Math.floor(Math.random() * alive.length)];
      const h = s.heroes.find((x) => x.uid === pick.uid);
      if (h) {
        s.captured = s.captured || [];
        if (!s.captured.some((x) => x.uid === h.uid)) s.captured.push({ uid: h.uid, name: h.name, by: B.faction, at: s.turn });
        h.captured = true; h.marchId = null;
        captured = h.name;
      }
    }
    clearMarchFlags();
    SK.save();
    /* v5.11 — 마지막 성까지 잃은 배수진 전투에서 지면 패망 */
    const leftCities = SK.CITY_LIST.filter((x) => s.cities[x.id].owner === SK.playerFaction()).length;
    if (!leftCities) { if (SK.gameOver) SK.gameOver('유랑군 배수진이 무너졌습니다.'); return; }
    SK.modal({
      kicker: '패배',
      title: '퇴각',
      body: `<div class="result-modal lose"><div class="rm-seal">패</div>
        ${B.winReason ? `<p class="rm-reason">${B.winReason}!</p>` : ''}
        <p class="rm-line">적의 방어가 완강했습니다. 병력을 정비하고 다시 도전하십시오.</p>
        ${battleReportHTML()}
        ${SK.quoteOf('조조', 'retreat') ? `<p class="rm-quote">“${SK.quoteOf('조조', 'retreat')}”</p>` : ''}
        <p class="rm-note">보유 금 -200 · 부상병 ${woundedAdd ? `${Math.round(woundedAdd).toLocaleString('ko-KR')}명이 ${SK.CITY[B.origin] ? SK.CITY[B.origin].name : '본성'}에서 회복 중입니다` : '없음'}${captured ? ` · 사로잡힌 장수 <b>${captured}</b>` : ''}</p></div>`,
      actions: [{ label: '지도로', onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  /* ───────────── v5.7 — 수성전의 승패 ───────────── */
  function defenseVictory() {
    B.over = true;
    SK.sfx.play('victory');
    if (window.JojoBGM) { try { JojoBGM.play('victory'); } catch (e) { /* ignore */ } }
    const s = SK.state;
    const st = s.cities[B.targetId];
    const c = SK.CITY[B.targetId];
    /* v5.9 — 원군은 자기 성으로 돌아가고, 이 성의 손실 일부는 부상병으로 남는다 */
    const rfgInfo = settleReinforce();
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive && !u.rfg);
    const dead = B.units.filter((u) => u.side === 'ally' && !u.alive && !u.rfg);
    const troopsLeft = survivors.reduce((a, u) => a + u.hp, 0);
    const woundedAdd = SK.addWounded ? SK.addWounded(B.targetId, lostOf('ally', (u) => !u.rfg), { ratio: SK.woundedRatio(B.targetId) }) : 0;
    /* v5.11 — 공성전이 성 안까지 밀고 들어오면 이겨도 전란 피해가 남는다.
       성벽·내성 건물 경험치·농업·상업·치안·민심이 함께 깎여, 성 밖 [요격]을 택할 이유가 생긴다. */
    let warDamage = null;
    if (st) {
      const wallLoss = 7 + (B.rings || 1) * 3;
      const before = { def: Math.round(st.def || 50), agri: Math.round(st.agri || 0), comm: Math.round(st.comm || 0), order: Math.round(st.order || 0) };
      st.troops = Math.max(600, Math.round(troopsLeft) + Math.round(B.reserve || 0));
      st.loyalty = clamp((st.loyalty || 50) + 2, 0, 100);
      st.def = Math.max(12, Math.round((st.def || 50) - wallLoss));
      st.agri = clamp((st.agri || 0) - 3, 0, 100);
      st.comm = clamp((st.comm || 0) - 3, 0, 100);
      st.order = clamp((st.order || 0) - 5, 0, 100);
      st.pop = Math.max(6000, Math.round((st.pop || 0) * 0.98));
      (st.slots || []).forEach((sl) => { if (sl && sl.key) sl.exp = Math.round((sl.exp || 0) * 0.75); });
      warDamage = { def: before.def - Math.round(st.def), agri: before.agri - Math.round(st.agri), comm: before.comm - Math.round(st.comm), order: before.order - Math.round(st.order) };
    }
    s.purseCity = B.targetId;
    s.gold += B.rewards.gold;
    s.food += B.rewards.food;
    s.fame = (s.fame || 0) + 10;
    awardMvpMerit();
    const levelUps = [];
    B.units.forEach((u) => {
      if (u.side !== 'ally' || !u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (!h) return;
      h.hp = Math.max(1, Math.round((u.hp / u.maxHp) * SK.maxHpOf(h.cls, h.lv)));
      if (u.alive) {
        const ups = SK.gainExp(h, 70);
        if (ups.length) levelUps.push({ name: h.name, lv: h.lv, title: SK.classTitle(h.cls, h.lv), promote: ups.some((x) => x.promote) });
      } else h.hp = 1;
    });
    s.pendingInvasion = null;
    /* v5.8 — 수성전에서도 적 장수 일부를 사로잡는다 */
    prisonCity = B.targetId;
    const prisoners = rollPrisoners();
    B.prisoners = prisoners;
    SK.save();
    SK.refreshHud();
    if (window.SKMap) { try { SKMap.refresh(); } catch (e) { /* ignore */ } }
    SK.modal({
      kicker: '수성전 승리',
      title: `${SK.josa(c.name, 'eul')} 지켰습니다`,
      body: `<div class="result-modal win"><div class="rm-seal">승</div>
        <p class="rm-line">${SK.factionName(B.defense.faction)}의 침공을 막아냈습니다. 성은 우리 것입니다.</p>
        <div class="rm-rewards">
          <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
          <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
          <div><span>명성</span><b>+10</b></div>
          <div><span>남은 수비병</span><b>${Math.round(troopsLeft).toLocaleString('ko-KR')}</b></div>
        </div>
        ${levelUps.length ? `<div class="rm-levels">${levelUps.map((l) => `<span class="${l.promote ? 'promote' : ''}">${l.name} Lv.${l.lv}${l.promote ? ` · ${l.title} 승급!` : ' 달성'}</span>`).join('')}</div>` : ''}
        ${battleReportHTML()}
        <div class="rm-survivors">${survivors.map((u) => `<img src="${SK.ptSrc(u.portrait)}" title="${u.name}">`).join('')}</div>
        ${prisoners.length ? `<div class="rm-prisoners"><span class="rp-tag">포로 ${prisoners.length}명</span>${prisoners.map((g) => `<img src="${SK.ptSrc(SK.genPortrait(g))}" title="${g.name}">`).join('')}<em>승리를 마치면 처리합니다</em></div>` : ''}
        ${woundedAdd || (rfgInfo && rfgInfo.left) ? `<p class="rm-note">${woundedAdd ? `부상병 ${woundedAdd.toLocaleString('ko-KR')}명이 성에서 회복 중입니다. ` : ''}${rfgInfo && rfgInfo.home ? `${rfgInfo.home} 원군 ${Math.round(rfgInfo.left).toLocaleString('ko-KR')}명이 돌아갔습니다.` : ''}</p>` : ''}
        ${warDamage ? `<p class="rm-war">전란 피해 — 성벽 −${warDamage.def} · 농업 −${warDamage.agri} · 상업 −${warDamage.comm} · 치안 −${warDamage.order} · 내성 건물 경험치 −25%<br><em>성이 침공받으면 이겨도 성이 상합니다. 다음에는 성 밖에서 [요격]해 미리 막는 편이 이득입니다.</em></p>` : ''}
        <p class="rm-note">${dead.length ? '전사한 장수는 체력 1로 살아났습니다. ' : ''}민심 +2 · 성벽 −${warDamage ? warDamage.def : 6}</p></div>`,
      actions: [{ label: prisoners.length ? '포로를 처리한다' : '지도로', primary: true, onClick: () => {
        closeBattle(); SK.showMap();
        if (prisoners.length) wait(() => openPrisoners(prisoners), 340);
      } }],
      dismissible: false,
    });
  }

  function defenseDefeat() {
    B.over = true;
    SK.sfx.play('defeat');
    if (window.JojoBGM) { try { JojoBGM.play('defeat'); } catch (e) { /* ignore */ } }
    const s = SK.state;
    const c = SK.CITY[B.targetId];
    const inv = B.defense || {};
    /* v5.9 — 원군은 살아서 자기 성으로 돌아간다 (성을 내주더라도) */
    const rfgInfo = settleReinforce();
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive && !u.rfg);
    const troopsLeft = survivors.reduce((a, u) => a + Math.max(0, u.hp), 0);
    B.units.forEach((u) => {
      if (u.side !== 'ally' || !u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (h) h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * (u.alive ? 0.5 : 0.2)));
    });
    const res = SK.loseCity ? SK.loseCity(B.targetId, inv.faction, {
      troops: Math.round(troopsLeft * 0.8),
      garrison: Math.max(700, Math.round((inv.troops || 2000) * 0.45)),
      genIds: inv.genIds || [],
    }) : { refuge: null, moved: 0 };
    s.fame = Math.max(0, (s.fame || 0) - 10);
    if (s.cities[B.targetId] && s.cities[B.targetId].owner !== SK.playerFaction()) s.cities[B.targetId].wounded = 0;
    const left = SK.CITY_LIST.filter((x) => s.cities[x.id].owner === SK.playerFaction()).length;
    s.pendingInvasion = null;
    SK.save();
    SK.refreshHud();
    if (window.SKMap) { try { SKMap.refresh(); } catch (e) { /* ignore */ } }
    if (!left) {
      /* v5.11 — 성은 다 잃었지만 밖에 원정 주력이 살아 있으면 유랑군 배수진 1회 */
      const army = (s.marches || []).filter((m) => (m.units || []).some((u) => u.uid && u.troops > 0));
      if (army.length && SK.openLastStand) {
        SK.modal({
          kicker: '천하 패배 직전', title: '성을 모두 잃었습니다',
          body: `<div class="result-modal lose"><div class="rm-seal">망</div>${battleReportHTML()}
            <p class="rm-line">마지막 성이 함락되었습니다. 그러나 밖에 나가 있던 원정 주력 <b>${army.length}부대</b>가 아직 살아 있습니다.</p>
            <p class="rm-note">유랑군이 되어 성 하나를 되찾는 <b>배수진</b>에 한 번 도전할 수 있습니다. 지면 그대로 패망합니다.</p></div>`,
          actions: [{ label: '패망을 받아들인다', onClick: () => { closeBattle(); SK.gameOver('마지막 성을 잃었습니다.'); } },
            { label: '유랑군 배수진', primary: true, onClick: () => { closeBattle(); SK.openLastStand(); } }],
          dismissible: false,
        });
        return;
      }
      SK.modal({
        kicker: '천하 패배', title: '거점을 모두 잃었습니다',
        body: `<div class="result-modal lose"><div class="rm-seal">망</div>${battleReportHTML()}
          <p class="rm-line">마지막 성이 함락되어 천하를 잃었습니다.</p>
          <p class="rm-note">처음부터 다시 도전할 수 있습니다. 메뉴의 [처음부터 시작]을 쓰십시오.</p></div>`,
        actions: [{ label: '지도로', onClick: () => { if (SK.lockRun) SK.lockRun(); closeBattle(); SK.showMap(); } }],
        dismissible: false,
      });
      return;
    }
    SK.modal({
      kicker: '수성전 패배', title: `${c.name} 함락`,
      body: `<div class="result-modal lose"><div class="rm-seal">패</div>
        <p class="rm-line">${SK.josa(SK.factionName(inv.faction), 'i')} 성을 차지했습니다.${res.refuge ? ` 남은 병력 ${Math.round(res.moved).toLocaleString('ko-KR')}과 장수는 <b>${SK.CITY[res.refuge].name}</b>으로 물러났습니다.` : ' 물러날 성이 없습니다.'}</p>
        <p class="rm-note">명성 −10 · 성벽·민심이 무너지고, 다음 달부터 이 성은 적의 것입니다.${rfgInfo && rfgInfo.home ? ` ${rfgInfo.home} 원군은 자기 성으로 돌아갔습니다.` : ''}</p></div>`,
      actions: [{ label: '지도로', primary: true, onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  function retreat() {
    if (!B) return;
    /* v5.7 — 수성전에서 물러나면 성을 내주는 것과 같다 */
    if (B.defense) { defenseDefeat(); return; }
    if (B.intercept || B.marchId) {
      /* 행군 중 후퇴 — 남은 병력은 본성으로, 행군은 취소된다 */
      const s = SK.state;
      const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
      const troopsLeft = survivors.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
      const st = s.cities[B.origin];
      if (st) st.troops = Math.min(20000, st.troops + Math.round(troopsLeft));
      B.units.forEach((u) => {
        if (u.side !== 'ally' || !u.uid) return;
        const h = s.heroes.find((x) => x.uid === u.uid);
        if (h) { h.marchId = null; h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.6)); }
      });
      clearMarchFlags();
      SK.save();
    }
    B.over = true;
    closeBattle();
    SK.showMap();
    SK.toast('전투에서 물러났습니다.');
  }

  function closeBattle() {
    B = null;
    mode = 'idle';
    pendingSkill = null;
    cancelAnimationFrame(raf); raf = 0;
    $('#battle-overlay').hidden = true;
    /* v5.25 — 전투가 끝난 뒤에도 남은 행군 도착·적 침공 사건을 이어서 띄운다 */
    if (SK.armPendingWatch) setTimeout(() => SK.armPendingWatch(), 500);
  }

  /* ───────────── 전장 UI ───────────── */
  function banner(text, side) {
    const el = $('#turn-banner');
    if (!el) return;
    el.textContent = text;
    el.className = 'turn-banner show ' + side;
    wait(() => { el.className = 'turn-banner ' + side; }, 1200);
  }

  function showIntro() {
    let i = 0;
    const ov = $('#battle-overlay');
    ov.hidden = false;
    const render = () => {
      if (!B) return;
      if (i >= B.introLines.length) { ov.hidden = true; ov.onclick = null; B.introDone = true; classAuraPhase('ally'); banner('아군 페이즈', 'ally'); const first = B.units.find((u) => u.side === 'ally'); if (first) selectUnit(first); return; }
      const L = B.introLines[i];
      if (L.event) {
        const ev = L.event;
        /* v5.20 — 이 이벤트는 적 성의 장수(defGens)에게서 골라지므로, 보상 문구의 '아군'은
           플레이어가 아니라 적군을 가리킨다. 그대로 두면 김유신의 '아군 사기 +15'가 우리 군에
           붙는 줄 알고 수성전에 들어가게 된다. */
        const evReward = String(ev.reward || '').replace(/아군/g, '적군');
        ov.innerHTML = `<div class="event-card">
          <div class="ev-seal">연</div>
          <div class="ev-main"><span class="ev-type">${ev.type || '특별 이벤트'} · 적 장수</span>
            <h4>${ev.title}</h4>
            <p class="ev-dialogue">“${ev.dialogue}”</p>
            <p class="ev-reward">${evReward}</p>
            <em class="ev-enemy">적 장수 효과 — 우리 군에는 적용되지 않습니다</em>
            <span class="ic-tap">터치하여 계속 ▸</span></div>
        </div>`;
        ov.onclick = () => { i += 1; render(); };
        return;
      }
      ov.innerHTML = `<div class="intro-card ${L.side}">
        <img class="ic-portrait" src="${SK.ptSrc(L.pt)}" alt="">
        <div class="ic-box">
          <div class="ic-name">${L.who}</div>
          <p class="ic-text">${L.text}</p>
          <span class="ic-tap">터치하여 계속 ▸</span>
        </div>
      </div>`;
      ov.onclick = () => { i += 1; render(); };
    };
    render();
  }

  const SKBattle = {
    refreshUI() {
      if (!B) return;
      const allies = B.units.filter((u) => u.side === 'ally' && u.alive);
      const enemies = B.units.filter((u) => u.side === 'enemy' && u.alive);
      $('#battle-name').textContent = B.name;
      $('#battle-kind').textContent = `${B.def.name} · ${B.def.desc}`;
      /* v5.2 — 성문 내구도는 화면 위 칩에 숫자로 크게 보인다 */
      const goalChip = $('#battle-objective');
      if (goalChip) {
        const gate = activeGate();
        const total = (B.gates || []).filter((g) => g.maxHp > 0).length;
        goalChip.textContent = (gate && gate.hp > 0)
          ? `성문${total > 1 ? ` ${gate.ring}/${total}` : ''} ${Math.round(gate.hp).toLocaleString('ko-KR')} / ${Math.round(gate.maxHp).toLocaleString('ko-KR')}`
          : B.objective;
        goalChip.classList.toggle('gate', !!(gate && gate.hp > 0));
      }
      $('#battle-turn').textContent = B.turn + '턴';
      $('#battle-phase').textContent = B.phase === 'ally' ? '아군' : '적군';
      $('#battle-phase').className = B.phase;
      /* v5.0.1 — 상단은 부대 수가 아니라 총 병력 수 + 병력 비율 게이지 */
      const allyHp = B.units.filter((u) => u.side === 'ally' && u.alive).reduce((sum, u) => sum + Math.max(0, u.hp), 0);
      const enemyHp = B.units.filter((u) => u.side === 'enemy' && u.alive).reduce((sum, u) => sum + Math.max(0, u.hp), 0);
      const allyStart = B.units.filter((u) => u.side === 'ally').reduce((sum, u) => sum + Math.max(0, u.maxHp), 0);
      const enemyStart = B.units.filter((u) => u.side === 'enemy').reduce((sum, u) => sum + Math.max(0, u.maxHp), 0);
      $('#count-ally').textContent = Math.round(allyHp).toLocaleString('ko-KR');
      $('#count-enemy').textContent = Math.round(enemyHp).toLocaleString('ko-KR');
      $('#bar-ally').style.width = Math.round(allyStart ? allyHp / allyStart * 100 : 0) + '%';
      $('#bar-enemy').style.width = Math.round(enemyStart ? enemyHp / enemyStart * 100 : 0) + '%';
      const u = B.sel;
      const card = $('#unit-card');
      if (u) {
        card.classList.add('on');
        $('#uc-img').src = `${SK.ptSrc(u.portrait)}`;
        $('#uc-lv').textContent = 'Lv.' + u.lv;
        $('#uc-name').textContent = u.name;
        $('#uc-cls').textContent = SK.CLASSES[u.cls].name;
        const tr = SK.TERRAIN[B.tiles[u.y][u.x]];
        const holdTag = B.tiles[u.y][u.x] === 'T' ? '망루 방어↑·회복' : B.tiles[u.y][u.x] === 'K' ? '본성 방어↑·회복' : '';
        $('#uc-terrain').textContent = tr.name + (tr.def ? ` 방어+${Math.round(tr.def * 100)}%` : '') + (holdTag ? ` · ${holdTag}` : '') + (SK.affinity(u.cls, B.tiles[u.y][u.x]).label ? ` · ${SK.affinity(u.cls, B.tiles[u.y][u.x]).label}` : '') + (typeBonus(u) ? ` · ${B.def.name} ${typeBonus(u) > 0 ? '+' : ''}${Math.round(typeBonus(u) * 100)}%` : '');
        $('#uc-hp').style.width = Math.round(u.hp / u.maxHp * 100) + '%';
        $('#uc-hp-txt').textContent = `${Math.round(u.hp).toLocaleString('ko-KR')} / ${Math.round(u.maxHp).toLocaleString('ko-KR')}`;
        $('#uc-mp').style.width = Math.round(u.mp / u.maxMp * 100) + '%';
        $('#uc-mp-txt').textContent = `${u.mp}/${u.maxMp}`;
        /* v5.0.3 — 경험치 바 */
        const needExp = SK.expNeed ? SK.expNeed(u.lv) : 100;
        const ex = $('#uc-exp'), exT = $('#uc-exp-txt');
        if (ex) ex.style.width = Math.max(0, Math.min(100, Math.round((u.exp || 0) / needExp * 100))) + '%';
        if (exT) exT.textContent = `EXP ${u.exp || 0}/${needExp}`;
        $('#uc-troops').textContent = `${Math.round(u.hp).toLocaleString('ko-KR')} / ${Math.round(u.maxHp).toLocaleString('ko-KR')}`;
        $('#uc-train').textContent = `${u.train == null ? trainOf(u.lv, u.tier) : u.train}`;
        $('#uc-atk').textContent = Math.round(effAtk(u));
        $('#uc-def').textContent = Math.round(effDef(u));
        const ma = $('#uc-matk'), md = $('#uc-mdef');
        if (ma) ma.textContent = Math.round(magicAtk(u));
        if (md) md.textContent = Math.round(magicDef(u));
        const bfBox = $('#uc-buffs');
        if (bfBox) {
          const pills = [];
          ['atk', 'def'].forEach((k) => {
            const b = u.buffs[k];
            if (!b || b.t <= 0) return;
            const pct = Math.round(b.v * 100);
            pills.push(`<span class="bf ${pct >= 0 ? 'good' : 'bad'}">${k === 'atk' ? '공' : '방'}${pct >= 0 ? '+' : ''}${pct}% (${b.t}턴)</span>`);
          });
          bfBox.innerHTML = pills.join('');
        }
        $('#uc-mov').textContent = movOf(u);
        $('#uc-rng').textContent = effRng(u);
        const canAct = u.side === 'ally' && !u.acted;
        document.querySelectorAll('.act').forEach((b) => b.classList.toggle('off', !canAct));
      } else {
        card.classList.remove('on');
        $('#uc-name').textContent = '부대를 선택하세요';
        const bfBox0 = $('#uc-buffs'); if (bfBox0) bfBox0.innerHTML = '';
        $('#uc-cls').textContent = B.def.desc;
        $('#uc-terrain').textContent = '';
        $('#uc-hp').style.width = '0%'; $('#uc-mp').style.width = '0%';
        const ex0 = $('#uc-exp'); if (ex0) ex0.style.width = '0%';
        const exT0 = $('#uc-exp-txt'); if (exT0) exT0.textContent = 'EXP 0/0';
        $('#uc-hp-txt').textContent = ''; $('#uc-mp-txt').textContent = '';
        $('#uc-troops').textContent = '0'; $('#uc-train').textContent = '-';
        $('#uc-atk').textContent = '-'; $('#uc-def').textContent = '-';
        const ma0 = $('#uc-matk'), md0 = $('#uc-mdef');
        if (ma0) ma0.textContent = '-';
        if (md0) md0.textContent = '-';
        $('#uc-mov').textContent = '-'; $('#uc-rng').textContent = '-';
      }
      document.querySelectorAll('.act').forEach((b) => {
        if (b.dataset.act === 'attack') b.classList.toggle('active', mode === 'attack');
        if (b.dataset.act === 'skill') b.classList.toggle('active', mode === 'skillTarget');
      });
      renderTargetBar();
    },
    endTurn,
    retreat,
    debug: {
      get battle() { return B; },
      get mode() { return mode; },
      get busy() { return busy; },
      get pending() { return pendingSkill; },
      get autoOn() { return autoOn; },
      get cam() { return cam; },
      centerCam(x, y) { centerCam(x, y); },
      zoomFit() { if (!stage) return; const fit = Math.min(stage.clientWidth / WORLD, stage.clientHeight / WORLD); cam.s = fit; cam.x = (stage.clientWidth - WORLD * fit) / 2; cam.y = (stage.clientHeight - WORLD * fit) / 2; },
      get enemies() { return B ? B.units.filter((u) => u.side === 'enemy' && u.alive).map((u) => u.name) : []; },
      get anims() { return anims.map((a) => a.kind); },
      get fx() { return fx.map((f) => f.kind); },
      get floats() { return floats.map((f) => f.text); },
      get anims() { return anims.map((a) => a.kind); },
      tap(x, y) { onTileTap(x, y); },
      select(name) { const u = B.units.find((o) => o.name === name && o.alive); if (u) { selectUnit(u); return { x: u.x, y: u.y }; } return null; },
      endTurn,
      checkFinish() { finishCheck(); },
      gateStrike(name) { const u = B && B.units.find((o) => o.name === name); const g = activeGate(); if (!u || !g) return null; const before = g.hp; doGateAttack(u, g.tiles[0]); return { before, after: g.hp, busy, acted: u.acted, attacker: isGateAttacker(u) }; },
      plan(name) { const u = B && B.units.find((o) => o.name === name); if (!u) return null; const p = planAuto(u); return p ? { kind: p.kind, x: p.x, y: p.y, gate: p.gate || null, target: p.target ? p.target.name : null } : null; },
      reach(name) { const u = B && B.units.find((o) => o.name === name); if (!u) return null; return { from: [u.x, u.y], tiles: [...reachSet(u)] }; },
      kill(name) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return null;
        const a = B.units.find((o) => o.side !== u.side);
        applyDamage(a, u, Math.max(1, u.hp), false, null);
        return { fate: u.fate, alive: u.alive };
      },
      openSkillMenu,
      beginSkill,
      /* v5.13 — 자동전투 판단 점검: 이 부대가 고를 책략(회복 포함)을 그대로 돌려준다 */
      planSupport(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        const p = planSupportSkill(u);
        return p ? { kind: p.kind, mode: p.mode, key: p.key, tx: p.tx, ty: p.ty,
          x: p.x, y: p.y, target: p.target ? p.target.name : null, score: p.score } : null;
      },
      hurtEnemies(n) { B.units.filter((u) => u.side === 'enemy').forEach((u) => { u.hp = n; if (n <= 0) u.alive = false; }); },
      finish() { finishCheck(); },
      closeBattle,
      openPrisoners(genIds) {
        const list = (genIds || []).map((id) => SK.GEN_BY_ID[id]).filter(Boolean);
        if (!list.length) list.push(...rollPrisoners());
        openPrisoners(list);
        return list.map((g) => g.name);
      },
      forceVictory() { victory(); },
      gate() { return B && B.gate ? { hp: Math.round(B.gate.hp), max: Math.round(B.gate.maxHp), tiles: B.gate.tiles } : null; },
      /* v5.14 — 지금 고른 책략(중복 getter pending은 autoPending이라 따로 둔다) */
      get pendingSkill() { return pendingSkill ? { key: pendingSkill.key, kind: pendingSkill.kind, range: pendingSkill.range, minRange: pendingSkill.minRange, radius: pendingSkill.radius } : null; },
      get uiMode() { return mode; },
      setMode(m) { mode = m; if (m !== 'skillTarget') pendingSkill = null; SKBattle.refreshUI(); return mode; },
      /* v5.14 — 마름모 사거리·성문 공격 진영 점검용 */
      manh(x1, y1, x2, y2) { return manh(x1, y1, x2, y2); },
      /* v5.15 — 상성·반격·이동·오라 점검용 */
      dmg(aName, dName, opts) {
        const a = B && B.units.find((o) => o.name === aName), d = B && B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        const r = calcDamage(a, d, opts || {});
        return { dmg: r.dmg, crit: r.crit, tri: r.tri ? r.tri.label : '', mul: r.tri ? r.tri.mul : 1 };
      },
      counterInfo(aName, dName) {
        const a = B && B.units.find((o) => o.name === aName), d = B && B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        return { can: canCounterAt(a, d), mul: counterMulOf(a), minRng: a.minRng || 1, rng: effRng(a), dist: manh(a.x, a.y, d.x, d.y) };
      },
      mov(name) { const u = B && B.units.find((o) => o.name === name); return u ? { base: u.mov, eff: movOf(u), cls: u.cls } : null; },
      /* v5.15 — 군악대·무희 오라를 그 자리에서 돌려 본다 (턴 시작과 같은 함수) */
      runAura(side) { classAuraPhase(side || 'ally'); return this.auras(); },
      auras() {
        return B.units.filter((u) => u.alive).map((u) => ({ name: u.name, cls: u.cls, mp: Math.round(u.mp),
          atk: u.buffs.atk || null, crit: u.buffs.crit || null, evade: u.buffs.evade || null }));
      },
      gateAttackerSide() { return gateAttackerSide(); },
      get lastMove() { return this._move || null; },
      /* v5.22 — 수성전 수비 역할 점검 */
      defRoles() {
        if (!B || !B.defense) return null;
        const home = defenseHome();
        return B.units.filter((u) => u.side === 'ally').map((u) => {
          const role = defenseRoleOf(u);
          const allow = defenseAllowed(u, role, home);
          return { n: u.name, cls: u.cls, role, x: u.x, y: u.y, allowed: allow ? !!allow(u.x, u.y) : null, insideY: home.insideY };
        });
      },
      isGateAttacker(name) { const u = B && B.units.find((o) => o.name === name); return u ? isGateAttacker(u) : null; },
      effRng(name) { const u = B && B.units.find((o) => o.name === name); return u ? effRng(u) : null; },
      canHit(aName, dName) {
        const a = B.units.find((o) => o.name === aName), d = B.units.find((o) => o.name === dName);
        return a && d ? canHit(a, d) : null;
      },
      plan(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        const p = planAuto(u);
        if (!p) return null;
        return { kind: p.kind, x: p.x, y: p.y, target: p.target ? p.target.name : null,
          gate: p.gate || null, score: p.score };
      },
      gatePlan(name) {
        const u = B && B.units.find((o) => o.name === name);
        const gp = u ? gateStrikePlan(u) : null;
        return gp ? { x: gp.x, y: gp.y, gate: gp.gate } : null;
      },
      /* 하이라이트와 같은 조건으로 사거리 안 타일을 돌려준다 (마름모 모양 확인용) */
      rangeTiles(name, opts) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        const o = opts || {};
        const rng = o.rng != null ? o.rng : effRng(u);
        const minR = o.minR != null ? o.minR : (u.minRng || 1);
        const out = [];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const d = manh(u.x, u.y, x, y);
          if (d < minR || d > rng) continue;
          out.push([x, y, d]);
        }
        return { from: { x: u.x, y: u.y }, rng: rng, minR: minR, count: out.length, tiles: out };
      },
      hitList(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return {
          gateAttacker: isGateAttacker(u),
          doors: (gateIntact() ? activeGate().tiles : []).filter((g) => canHitTile(u, g.x, g.y)),
          foes: B.units.filter((o) => o.alive && o.side !== u.side && canHit(u, o)).map((o) => o.name),
        };
      },
      gates() { return B && B.gates ? B.gates.map((g) => ({ row: g.row, hp: Math.round(g.hp), ring: g.ring })) : []; },
      rings() { return B ? B.rings : null; },
      type() { return B ? B.type : null; },
      img(name) { const u = B && B.units.find((v) => v.name === name); return u ? (unitImgFor(u).getAttribute('src') || unitImgFor(u).src) : null; },      gateAttack(x, y) { const u = B.sel; if (u) doGateAttack(u, { x, y }); },
      toggleAuto(force) { toggleAuto(force); return autoOn; },
      get auto() { return autoOn; },
      get speed() { return autoSpeed; },
      toggleSpeed() { return toggleSpeed(); },
      get busy() { return busy; },
      get mode() { return mode; },
      get pending() { return autoPending ? Object.assign({}, autoPending) : null; },
      moveTo(x, y) { const u = B.sel; if (u) moveUnit(u, x, y); },
      focus(x, y, s) { if (s) cam.s = clamp(s, 0.4, 2.2); centerCam(x, y); },
      setTimeScale(v) { timeScale = v > 0 ? v : 1; return timeScale; },
      eff(name) {
        const u = B.units.find((o) => o.name === name);
        return u ? { atk: Math.round(effAtk(u)), def: Math.round(effDef(u)), matk: Math.round(magicAtk(u)),
          mdef: Math.round(magicDef(u)), rng: effRng(u), bond: bondAllyMul(u),
          buffs: JSON.parse(JSON.stringify(u.buffs || {})) } : null;
      },
      place(unitName, x, y) { const u = B.units.find((o) => o.name === unitName); if (u) { u.x = x; u.y = y; u.rx = x; u.ry = y; } return u ? { x: u.x, y: u.y } : null; },
      attack(targetId) { const u = B.sel; const t = B.units.find((o) => o.id === targetId); if (u && t) doAttack(u, t); },
      findPath(x, y) { const u = B.sel; return u ? findPath(u, x, y) : []; },
      bonds() {
        const list = [];
        const alive = B.units.filter((u) => u.alive);
        for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
          const bond = SK.bondBetween(alive[i].name, alive[j].name);
          if (bond) list.push({ a: alive[i].name, b: alive[j].name, rel: bond.relation, title: bond.title, side: alive[i].side, dist: cheb(alive[i].x, alive[i].y, alive[j].x, alive[j].y) });
        }
        return list;
      },
    },
  };
  SK.SKBattle = SKBattle;
  window.SKBattle = SKBattle;

  /* 전장 버튼 */
  document.addEventListener('DOMContentLoaded', () => {
    $('#battle-actions').addEventListener('click', (e) => {
      const b = e.target.closest('.act');
      if (!b || !B) return;
      const act = b.dataset.act;
      if (act === 'endturn') { endTurn(); return; }
      if (act === 'auto') { toggleAuto(); return; }   // v5.2 — 아군 턴 자동 토글
      if (act === 'speed') { toggleSpeed(); return; }  // v5.10 — 자동전투 배속 ×1 / ×2
      if (B.phase !== 'ally' || B.over) return;
      const u = B.sel;
      if (act === 'attack') {
        if (!u || u.acted) { SK.toast('부대를 먼저 선택하세요.'); return; }
        mode = 'attack'; pendingSkill = null;
        $('#battle-tip').textContent = '공격할 적을 선택하세요';
        SKBattle.refreshUI();
      }
      if (act === 'skill') openSkillMenu();
      if (act === 'item') useItem();
      if (act === 'wait') waitUnit();
    });
    const spdBtn = $('#btn-speed');
    if (spdBtn) { spdBtn.onclick = () => toggleSpeed(); paintSpeedBtn(); }
    $('#b-zoom-in').onclick = () => zoomAt(cam.s * 1.25, stage.clientWidth / 2, stage.clientHeight / 2);
    $('#b-zoom-out').onclick = () => zoomAt(cam.s / 1.25, stage.clientWidth / 2, stage.clientHeight / 2);
    $('#b-zoom-fit').onclick = () => {
      const fit = Math.min(stage.clientWidth / WORLD, stage.clientHeight / WORLD);
      cam.s = fit;
      cam.x = (stage.clientWidth - WORLD * fit) / 2;
      cam.y = (stage.clientHeight - WORLD * fit) / 2;
    };
  });
})();
