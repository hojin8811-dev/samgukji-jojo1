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
  /* v5.10 — 전투 배속(처음엔 자동전투에만). ×1 = 기본 속도, ×2·×3·×4 = 그만큼 빠르게.
     v5.51 — 수동 전투에도 똑같이 건다(예전엔 ×1이 0.5배속·×2가 기본이었고, 수동에는 안 걸렸다).
     한 판에서 고른 배속은 세션 동안 다음 전투에도 이어진다. */
  let autoSpeed = 1;
  let speedPref = 1;
  const LV_GROW = 0.018;        // 1레벨마다 공·방 +1.8% (아군·적군 공통)
  /* v5.49 — 책략(기술)에는 반격이 없는 대신 모두의 최대 MP를 절반으로 낮춘다.
     아군 장수는 SK.maxMpOf(app.js)가 절반으로 계산하고, 일반 부대·적 부대는 여기서
     병종 기본 MP에 같은 비율(0.5)을 걸어 맞춘다. 최소 12 — 가장 싼 책략(8~10) 한 번은 가능. */
  const MP_SCALE = 0.5, MP_FLOOR = 12;
  function maxMpBase(base) { return Math.max(MP_FLOOR, Math.round((Number(base) || 0) * MP_SCALE)); }
  SK.maxMpBase = maxMpBase;
  /* v5.10 — 전투 배속(처음엔 자동전투에만 걸었다).
     v5.51 — 수동 전투에도 실제로 걸린다. 예전 paceMs는 autoOn일 때만 계산해서
     수동 조작 중(적군 페이즈 포함)에 ×2·×3·×4를 눌러도 아무것도 빨라지지 않았고,
     autoOn일 때도 `2 / 배속`이라 ×1이 0.5배속·×2가 1.0배속이었다.
     이제 ×1=그대로 · ×2=÷2 · ×3=÷3 · ×4=÷4.
     너무 짧아져 연출이 사라지거나 턴 처리가 겹치지 않게 하한만 둔다(×2 16ms · ×3 12ms · ×4 8ms). */
  function paceMs(ms) {
    const n = Math.round(Number(ms) || 0);
    const sp = autoSpeed || 1;
    if (sp <= 1 || n <= 0) return n;
    const floor = sp >= 4 ? 8 : (sp === 3 ? 12 : 16);
    return Math.max(floor, Math.round(n / sp));
  }
  function wait(fn, ms) { return setTimeout(fn, paceMs(ms)); }
  SK.battlePace = paceMs;
  const anims = [];            // 타일 단위 이동 · 돌격 애니메이션
  let shakeT = 0, shakeAmp = 0; // 화면 진동
  let bondTick = 0;
  let calloutTimer = null;
  let lastMovedUid = null;      // v5.39 — 이번 턴 마지막으로 이동한 아군 부대 (뒤로가기 이동 취소)

  /* ───────────── 이미지 로드 ───────────── */
  function loadImg(src) {
    if (imgs[src]) return imgs[src];
    const im = new Image();
    im.src = src;
    imgs[src] = im;
    return im;
  }
  function unitImgFor(u) {
    /* v5.2 — 물 타일 위로 나간 부대는 조각배(Skiff)로 표시
       v5.31 — 수전·도하 전장에서는 어떤 부대든 물에 들면 승선하고, 수적은 물 위를 걷는다 */
    if (u && u.aboard && u.cls !== 'sujeok') return loadImg('assets/units/skiff.webp');
    if (B && B.type === 'naval' && B.tiles && B.tiles[u.y] && B.tiles[u.y][u.x] === 'W' && u.cls !== 'sujeok') {
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
  function healAmount(sk, target, src) {
    const maxHp = target && target.maxHp ? target.maxHp : 0;
    const pct = clamp(sk && sk.healPct != null ? sk.healPct : 0.16, 0.12, 0.22);
    /* v5.29 — 보물 회복량 보정 (최대 병력의 22% → 25%까지만) */
    const bonus = 1 + fxPct(src, 'heal');
    return Math.max(1, Math.min(Math.round(maxHp * pct * bonus), Math.round(maxHp * 0.25)));
  }
  SK.healAmount = healAmount;
  SK.startBattle = function (opts) {
    document.querySelectorAll('#modal-root .modal-layer').forEach((m) => m.remove());
    closeGenInfo();   // v5.53 — 앞 전투의 《장수 정보》 창이 새 전장에 남지 않게
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
    /* v5.33 — 요격 출진은 '아군 성'에서 벌어지므로 targetId의 주인이 곧 아군이다.
       침공군 세력(intercept.faction)을 먼저 본다 — 예전에는 유비 성을 요격하면
       적 부대 이름이 '유비 무도가대'처럼 아군 세력으로 붙었다(사용자 제보). */
    const faction = defense ? defense.faction
      : ((opts.intercept && opts.intercept.faction) ? opts.intercept.faction : s.cities[opts.targetId].owner);
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
    /* v5.33 — 요격전은 침공군이 데려온 장수(intercept.genIds)를 모두 세운다.
       예전에는 1명으로 잘라, 적 침공인데도 이름 있는 장수가 거의 없었다(사용자 제보 '적 장수는 1도 안 왔어?'). */
    const genIdSrc = (intercept && (intercept.genIds || []).length) ? intercept.genIds
      : (defense ? (defense.genIds || []) : (s.cities[opts.targetId].genIds || []));
    const genLvFrom = defense ? defense.from : ((intercept && intercept.from) ? intercept.from : opts.targetId);
    const defGens = genIdSrc
      .map((id) => {
        const g = SK.GEN_BY_ID[id];
        if (!g) return null;
        /* v5.10 — 적 성 장수도 Lv.1에서 시작해 달마다 자란다 (수성전은 공격해 온 성 기준) */
        const lv = SK.enemyGenLevel ? SK.enemyGenLevel(genLvFrom, id) : 1;
        return Object.assign({}, g, { _lv: lv });
      })
      .filter(Boolean)
      .slice(0, 99);
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
    /* v5.33 — 요격전에서 살아남은 적 부대가 있으면 그 편성 그대로 수성전을 연다.
       (죽인 부대는 나오지 않고, 살아남은 부대는 병종·장수·남은 병력이 유지된다) */
    const surv = (defense && defense.survivingEnemies && defense.survivingEnemies.length)
      ? defense.survivingEnemies.slice(0, 10) : null;
    if (surv) {
      surv.forEach((sp, i) => {
        let u = null;
        const base = sp.genId != null ? SK.GEN_BY_ID[sp.genId] : null;
        if (base) u = makeNamedEnemy(Object.assign({}, base, { _lv: sp.lv || 1 }), per, i === 0 && !!sp.leader);
        if (!u) {
          u = makeEnemyCls(sp.cls || 'changbyung', i, 'defense', faction, per);
          if (sp.name) u.name = sp.name;
        }
        if (!u) return;
        u.cls = sp.cls || u.cls;
        u.lv = sp.lv || u.lv;
        u.hp = Math.max(80, Math.round(sp.hp || u.hp));
        u.maxHp = Math.max(u.hp, Math.round(sp.maxHp || u.hp));
        u.boss = !!sp.boss;
        u.survivor = true;                       // 요격전에서 살아남아 그대로 이어진 부대
        if (sp.portrait) u.portrait = sp.portrait;
        if (sp.tier) u.tier = sp.tier;
        enemies.push(u);
      });
    }
    for (let i = 0; !surv && i < enemyCount; i++) {
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
      type, def, name: defense ? `${target.name} 수성전` : (intercept ? `${intercept.name}` : `${target.name} ${def.name}`),
      targetId: opts.targetId, origin: opts.origin,
      tiles, units: [], turn: 1, phase: 'ally', sel: null, insp: null,   // v5.53 — insp = 아래 카드에 띄운 부대(적군 포함, 읽기 전용)
      cols: cols, rows: rows, bgKey: bgKey, mapKey: mapKey,
      acted: false, over: false, log: [], faction, rewards: { gold: 0, food: 0 }, gate: gateInit, gates: gates, rings: rings,
      introLines: buildIntro(type, target, faction, bossInfo, defGens, SK.pickEvent(target, defGens), intercept),
      event: SK.pickEvent(target, defGens),
      objective: defense ? '성을 지켜라 — 적을 전멸시켜라' : def.objective, started: false, moveAnim: null, deployed: opts.units, introDone: false,
      bondSeen: {}, intercept, marchId: opts.marchId || null, defense: defense, lastStand: !!opts.lastStand,
      /* v5.30 — 야간 전장: 야영 기습전은 밤에 습격하는 전투로 친다.
         흑갑·혼천의모형 같은 '야간' 보물이 여기서만 실제로 붙는다. */
      night: (type === 'camp'),
      /* v5.31 — 물 타일(강·호수)에 조각배로 오갈 수 있는 전장 (수전·도하) */
      boatable: (type === 'naval' || type === 'ford'),
      duels: { n: 0, last: 0, seen: {} },
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
    /* v5.31 — 사기·상태이상 초기화 (보물의 사기 +N·상태이상 저항이 여기서 붙는다) */
    B.units.forEach(initStatus);
    /* v5.32 — 행군 중도 야영(사기 +N)과 강행군 기습(적 사기 −8)을 전장으로 넘긴다 */
    B.units.forEach((u, i) => {
      if (u.side !== 'ally') return;
      const sp = (opts.units || [])[i];
      if (!sp || !sp.moraleBonus) return;
      const b = Number(sp.moraleBonus) || 0;
      /* 야영(+N)은 최대치도 함께 올려 100에서 잘려 사라지지 않게 한다 */
      if (b > 0) {
        u.moraleMax = (u.moraleMax || 100) + b;
        u.morale = Math.min(u.moraleMax, (u.morale == null ? 100 : u.morale) + b);
      } else {
        u.morale = clamp((u.morale == null ? 100 : u.morale) + b, 25, u.moraleMax || 100);
      }
    });
    B.surprise = !!opts.surprise;
    if (B.surprise) {
      B.units.forEach((u) => {
        if (u.side !== 'enemy' || !u.alive) return;
        u.morale = clamp((u.morale == null ? 100 : u.morale) - 8, 25, u.moraleMax || 100);
      });
    }
    /* v5.17 — 1×1 본진·마을. 수성전은 진영이 뒤집히므로 본진 자리도 바꿔 단다 */
    B.sites = [];
    if (meta) {
      const allyPos = type === 'defense' ? meta.enemyBase : meta.allyBase;
      const enemyPos = type === 'defense' ? meta.allyBase : meta.enemyBase;
      if (allyPos) B.sites.push({ type: 'allyHQ', x: allyPos.x, y: allyPos.y, owner: 'ally' });
      if (enemyPos) B.sites.push({ type: 'enemyHQ', x: enemyPos.x, y: enemyPos.y, owner: 'enemy' });
      (meta.villages || []).forEach((v) => B.sites.push({ type: 'village', x: v.x, y: v.y, owner: null }));
    }
    /* v5.17 — 총대장(적)·아군 총대장 표식. v5.32 — 격파해도 전투는 끝나지 않는다(금관 표시용) */
    const eLeader = B.units.filter((u) => u.side === 'enemy').sort((a, b) => ((b.boss ? 1 : 0) - (a.boss ? 1 : 0)) || (b.lv - a.lv))[0];
    if (eLeader) {
      eLeader.leader = true;
      /* 무명 수비 부대가 총대장이 되면 이름을 붙여 준다 (적 성에 장수가 없을 때) */
      if (!eLeader.genId && !eLeader.boss && !eLeader.survivor) {
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
      /* v5.33 — 총대장 격파 규칙이 사라졌으니 군주·총대장도 본진에 웅크리지 않고 함께 나선다.
         (본진이 실제로 위급할 때만 aiGoalOf가 본진으로 돌려세운다) */
      if (type === 'siege' || type === 'fortress') { u.role = u.leader ? 'assault' : 'guard'; return; }
      u.role = (i % 2 === 0 ? 'assault' : 'guard');
    });
    B.units.forEach((u) => { if (u.tier == null) u.tier = SK.tierForLv(u.lv); });
    /* v5.16 — 전장에서 마주친 적 장수를 도감에 조우로 남긴다 */
    if (SK.codexMeet) SK.codexMeet(enemies.filter((u) => u.genId != null).map((u) => u.genId));
    B.objective = defense ? SK.BATTLE_TYPES.defense.objective : def.objective;
    /* v5.38 — 본진 점령이 즉시 승패가 아니므로 목표는 '전멸' 하나로 정리한다 */
    if (B.sites && B.sites.length) B.objective = defense ? '성을 지켜라 — 적을 전멸시켜라' : '적 전멸';
    B.rewards.gold = intercept ? Math.round((intercept.troops || 2400) * 0.10 + 80) : Math.round(cityTroops * 0.16 + 320);
    B.rewards.food = intercept ? Math.round((intercept.troops || 2400) * 0.07 + 60) : Math.round(cityTroops * 0.11 + 240);
    anims.length = 0;
    fx.length = 0;
    floats.length = 0;
    shakeT = 0;
    /* v5.51 — 새 전장을 열 때 연출 잠금을 푼다. 예전엔 앞 전투의 애니메이션이
       도중에 끊기면(anims만 비우고 done을 부르지 않음) busy가 true로 남아
       다음 전투에서 아무것도 누를 수 없게 됐다 — [자동]도 이 플래그에 막혀 멈춘다. */
    busy = false;
    mode = 'idle';
    autoOn = false;
    /* v5.52 — 앞 전장의 일기토 창이 열린 채 남아 있지 않게 닫는다 */
    if (duel) { duel.done = null; duel = null; }
    if (duelEls) { duelEls.root.hidden = true; duelEls.root.classList.remove('show', 'out'); }
    autoStop();
    autoPending = null;
    autoSpeed = speedPref || 1;   // v5.26 — 지난 전투에서 고른 배속을 이어 쓴다 (처음엔 ×1)
    paintSpeedBtn();
    SK.show('screen-battle');
    if (window.JojoBGM) {
      try { JojoBGM.play(type === 'siege' || type === 'fortress' ? 'battle_siege' : 'battle_field'); } catch (e) { /* ignore */ }
    }
    if (window.SK && SK.bgm && !window.JojoBGM) SK.bgm(type === 'siege' || type === 'fortress' ? 'battle_siege' : 'battle_field');
    /* v5.27 — 전투 중에 앱을 닫거나 새로고침해도 출진 병력이 허공으로 사라지지 않게
       '전투 중' 표식을 저장해 둔다. 복귀하면 SK.load가 병력을 출발 성으로 돌려준다. */
    try {
      if (SK.state) {
        SK.state.battleInProgress = {
          origin: opts.origin || opts.targetId, targetId: opts.targetId, type,
          troops: (opts.units || []).reduce((a, u) => a + (u.troops || 0), 0),
          heroes: (opts.units || []).filter((u) => u.uid).map((u) => u.uid),
          at: Date.now(),
          /* v5.40 — 요격전이면 어느 행군이 막힌 것인지 남긴다.
             (예전에는 병력만 돌려보내 요격전이 통째로 사라졌다) */
          marchId: (intercept && intercept.marchId) || opts.marchId || null,
          intercept: !!intercept,
          raiders: intercept ? (intercept.troops || 0) : 0,
        };
        SK.save();
      }
    } catch (e) { /* ignore */ }
    initCanvas();
    const feedEl = document.querySelector('#battle-feed');
    if (feedEl) feedEl.innerHTML = '';
    SKBattle.refreshUI();
    showIntro();
    if (supportNames.length) {
      wait(() => SK.toast(`적 지원군 합류 — ${supportNames.join(' · ')}`), 260);
    }
    if (B.surprise) {
      wait(() => SK.toast('기습 — 강행군으로 진을 치기 전에 닿았습니다 (적 사기 −8)'), 320);
    }
  };

  /* v5.33 — 레벨 성장 배율 (1레벨마다 공·방 +1.8%, 전직 구간은 +6%) */
  function growMul(lv) {
    const L = Math.max(1, Number(lv) || 1);
    return (1 + 0.06 * SK.tierForLv(L)) * (1 + LV_GROW * (L - 1));
  }
  SK.growMul = growMul;

  /* v5.33 — 레벨이 오른 아군 부대의 공·방·MP·기술을 그 자리에서 다시 계산한다 */
  function recalcAlly(u, h) {
    if (!u || !u.grow || !h) return;
    const g = u.grow;
    u.atk = (g.atkFlat + (h.wu - g.wu0) * 0.17) * growMul(h.lv) * g.atkMulBase;
    u.def = (g.defFlat + (h.tong - g.tong0) * 0.09) * growMul(h.lv) * g.defMulBase;
    u.wu = h.wu; u.ji = h.ji; u.tong = h.tong;
    u.lv = h.lv;
    u.tier = SK.tierForLv(h.lv);
    u.maxMp = SK.maxMpOf(h.cls, h.lv);
    u.mp = Math.min(u.maxMp, Math.max(u.mp, h.mp || 0));
    u.skills = SK.skillsFor(h.cls, h.lv);
  }
  SK.recalcAlly = recalcAlly;

  /* ══════════════════════════════════════════════════════════════
     v5.33 — 전투 중 실시간 경험치
     예전에는 타격마다 u.expGain에 숫자만 쌓아 두고 전투가 끝날 때 한꺼번에
     SK.gainExp로 정산해, 전투 중에는 EXP 바가 0에서 움직이지 않았다.
     이제 맞히거나(9)·쓰러뜨리거나(42)·치유할 때마다 그 자리에서 장수 경험치로 넣고,
     레벨이 오르면 부대 공·방·MP·기술을 바로 올린 뒤 `Lv.N!`을 띄운다.
     전직 팝업은 SK.flushPromotions가 전장이 열려 있는 동안 미뤄 두므로 조작을 막지 않는다.
     ══════════════════════════════════════════════════════════════ */
  function battleExp(u, amount) {
    if (!B || B.over || !u || u.side !== 'ally' || !u.uid) return null;
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (!n) return null;
    const s = SK.state;
    if (!s) return null;
    const h = (s.heroes || []).find((x) => x.uid === u.uid);
    if (!h) return null;
    u.expGain = (u.expGain || 0) + n;
    const lv0 = h.lv;
    const ups = SK.gainExp(h, n) || [];
    if (h.lv > lv0) {
      recalcAlly(u, h);
      const promo = ups.length && ups[ups.length - 1].promote ? ` · ${ups[ups.length - 1].title}` : '';
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.02) * TILE, `Lv.${h.lv}!`, '#ffe08a', { back: true });
      addFx({ kind: 'ring', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 620, color: '255,226,120' });
      feed(`${u.name} 레벨 업 — Lv.${h.lv}${promo}`, 'good');
      SK.sfx.play('levelup');
      B.levelUps = B.levelUps || [];
      B.levelUps.push({ name: h.name, lv: h.lv, promote: !!promo, turn: B.turn });
    }
    return ups;
  }
  SK.battleExp = battleExp;

  /* 훈련도 — 부대의 숙련도 (레벨·등급이 높을수록 단단하다) */
  function trainOf(lv, tierKey) {
    const t = SK.TIER_LV[tierKey] || 3;
    return clamp(Math.round(42 + (Number(lv) || 1) * 2.6 + t * 5), 30, 100);
  }
  SK.trainOf = trainOf;

  function makeAlly(spec, i, origin) {
    const h = SK.state.heroes.find((x) => x.uid === spec.uid);
    /* v5.29 — 장착한 보물의 정성 효과(주는 피해·받는 피해·책략·치명·회피·반격·회복 등)를
       부대에 그대로 넘긴다. 보물이 없으면 모든 값이 0이다. */
    const tfx = SK.heroTreasureFx ? SK.heroTreasureFx(h) : null;
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
    /* v5.33 — 전투 중 실시간 레벨업을 위해 공·방 계산을 '고정값 × 성장 배율'로 나눠 둔다.
       레벨이 오르면 grow 값만 다시 곱해 부대 능력치를 그 자리에서 올린다. */
    const atkFlat = C.atk + (h.wu + eq.war - 60) * 0.17;
    const defFlat = C.def + (h.tong + eq.leadership - 60) * 0.09;
    const atkMulBase = techAtk * pMul * loyMul * (1 + offB.atk);
    const defMulBase = techDef * pMul * loyMul * (1 + offB.def);
    return {
      id: 'a' + i, side: 'ally', uid: h.uid, name: h.name, hanja: h.hanja, cls: h.cls, lv: h.lv,
      hp: troops, maxHp: troops, mp: h.mp, maxMp: SK.maxMpOf(h.cls, h.lv),
      atk: atkFlat * (1 + 0.06 * SK.tierForLv(h.lv)) * lvMul * atkMulBase,
      def: defFlat * (1 + 0.06 * SK.tierForLv(h.lv)) * lvMul * defMulBase,
      grow: { atkFlat, defFlat, atkMulBase, defMulBase, lv0: h.lv, wu0: h.wu, tong0: h.tong },
      mov: Math.min(9, C.mov + eq.move), rng: C.rng + (C.rng > 1 ? (eq.rng || 0) : 0), minRng: C.minRng || 1,
      wu: h.wu + eq.war, ji: h.ji + eq.intel, tong: h.tong + eq.leadership,
      portrait: h.portrait, unit: h.unit || CLASS_UNIT[h.cls], skills: SK.skillsFor(h.cls, h.lv),
      passive, pUsed: {}, x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 2, face: 1, expGain: 0,
      tfx,
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
      hp: spec.troops, maxHp: spec.troops, mp: maxMpBase(C.mp), maxMp: maxMpBase(C.mp),
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
      hp: troops, maxHp: troops, mp: maxMpBase(C.mp + lv * 2), maxMp: maxMpBase(C.mp + lv * 2),
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
      hp: troops, maxHp: troops, mp: maxMpBase(C.mp + lv * 2), maxMp: maxMpBase(C.mp + lv * 2),
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
      hp: troops, maxHp: troops, mp: maxMpBase(C.mp + lv), maxMp: maxMpBase(C.mp + lv),
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
    const zused = { wall: 0, tower: 0, keep: 0, rear: 0 };
    list.forEach((u, i) => {
      let x, y;
      /* v5.21 — 수성전은 장수가 고른 자리(외성·망루·내성)부터 채운다 */
      const zone = zmap && u.zone && zmap[u.zone] ? u.zone : null;
      /* v5.28 — '내성'에 세운 보조 병과는 본진 앞이 아니라 성벽 바로 뒤 후방 지원선에 둔다.
         (32×32 3중성은 본진 y≈9 · 성문 y≈24라 첫 2~3턴을 걷기만 했다) */
      const place = (zone === 'keep' && SUPPORT_CLS_SET[u.cls] && zmap.rear && zmap.rear.length) ? 'rear' : zone;
      if (place) {
        const zs = zmap[place];
        for (let k = zused[place]; k < zs.length; k++) {
          const [zx, zy] = zs[k];
          if (taken.has(zx + ',' + zy)) continue;
          if (!B.tiles[zy] || !passable(B.tiles[zy][zx])) continue;
          if (B.units.some((o) => o.x === zx && o.y === zy)) continue;
          x = zx; y = zy; zused[place] = k + 1;
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
      /* v5.39 — 턴 시작 좌표·이번 턴 이동 여부 (뒤로가기 이동 취소·재이동 방지) */
      u.turnStartX = x; u.turnStartY = y; u.movedThisTurn = false;
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
    /* v5.28 — 후방 지원선: 바깥 성벽 안쪽 3~5칸. 보조 병과가 1턴부터 성벽·망루의
       아군에게 회복·버프를 넣을 수 있는 자리. 외성 슬롯과 자리가 겹쳐도
       placeSide가 이미 선 부대를 피해 잡으므로 문제없다. */
    const rear = [];
    if (outer >= 0) {
      for (let dy = 3; dy <= 5; dy++) {
        const y = outer - dy;
        if (y < 0) continue;
        for (let dx = 0; dx <= 4; dx++) {
          const xs = dx === 0 ? [cx - 1, cx] : [cx - dx, cx + dx - 1];
          xs.forEach((x) => {
            if (!free(x, y)) return;
            if (rear.some(([rx, ry]) => rx === x && ry === y)) return;
            rear.push([x, y]);
          });
        }
      }
    }
    return { wall, tower, keep, rear };
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
      B.startFrame = frameStartView();
      /* v5.33 — 미니맵 확대를 기억한 채 전투가 열리면 본성이 미니맵 뒤에 서지 않게 비킨다 */
      if (mmBig && mmOpen) shiftCamForMinimap(true);
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

  /* ══════════════════════════════════════════════════════════════
     v5.54 — 전장 시작 카메라 구도
     · 예전: `stage.clientHeight * 0.94` 하나만 보고 화면 중앙에 내용을 놓아,
       390×844에서는 아래 줄 아군의 발이 전투 패널에 잘리고 390×680에서는 두 전선이
       통째로 화면 밖으로 밀렸다(배율 하한 0.42가 실제 필요한 배율보다 컸다).
     · 이제 보이는 상자(위 목표 띠 30px·아래 상태줄 26px·좌우 4px을 비킨 영역)를 기준으로
       아군 본진·적 1선·모든 부대에 머리(이름 알약)·발 여백까지 넣어 맞춘다.
     · 내용이 상자보다 크면 배율을 더 낮춰 둘 다 들어오게 하고(하한 0.28),
       남는 여백은 위아래로 고르게 나눈다. */
  function startViewBox() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const padL = 4, padR = 4, padT = 30, padB = 26;
    return { x: padL, y: padT, w: Math.max(60, w - padL - padR), h: Math.max(60, h - padT - padB) };
  }
  function frameStartView() {
    if (!B || !stage) return null;
    const box = startViewBox();
    const base = (B.sites || []).find((s) => s.type === 'allyHQ')
      || (B.sites || []).find((s) => s.type === 'enemyHQ');
    const all = (base ? [{ x: base.x, y: base.y }] : [])
      .concat(B.units.filter((u) => u.alive !== false).map((u) => ({ x: u.x, y: u.y })));
    const mine = B.units.filter((u) => u.alive !== false && u.side === 'ally').map((u) => ({ x: u.x, y: u.y }));
    if (!all.length) return null;
    const minX = Math.min.apply(null, all.map((p) => p.x));
    const maxX = Math.max.apply(null, all.map((p) => p.x));
    const minY = Math.min.apply(null, all.map((p) => p.y));
    const maxY = Math.max.apply(null, all.map((p) => p.y));
    /* 부대 그림은 발밑 칸 아래로 0.12칸, 이름표·머리까지 위로 1.9칸 차지한다 */
    const left = minX * TILE, right = (maxX + 1) * TILE;
    const top = minY * TILE - TILE * 1.9, bottom = (maxY + 1) * TILE + TILE * 0.12;
    const cw = Math.max(TILE, right - left), ch = Math.max(TILE, bottom - top);
    /* 아군 줄(발)은 어떤 전장에서도 반드시 상자 안에 들어와야 한다 */
    const aMaxY = mine.length ? Math.max.apply(null, mine.map((p) => p.y)) : maxY;
    const aMinY = mine.length ? Math.min.apply(null, mine.map((p) => p.y)) : minY;
    const allyTop = aMinY * TILE - TILE * 1.9, allyFoot = (aMaxY + 1) * TILE;
    const allyH = Math.max(TILE, allyFoot - allyTop);
    let s = clamp(Math.min(box.w / cw, box.h / ch) * 0.98, 0.24, 0.8);
    let guard = 0;
    let camY = 0;
    for (;;) {
      cam.s = s;
      const fullH = ch * s;
      /* 전체가 들어가면 가운데, 아니면 아군 발을 상자 아래쪽에 맞춘다 */
      camY = (fullH <= box.h - 4)
        ? box.y + (box.h - fullH) / 2 - top * s
        : box.y + box.h - (aMaxY + 1) * TILE * s;
      cam.x = box.x + box.w / 2 - (left + cw / 2) * s;
      cam.y = camY;
      camClamp();
      const foot = (aMaxY + 1) * TILE * s + cam.y;
      const head = (aMinY * TILE - TILE * 1.4) * s + cam.y;
      if (foot <= box.y + box.h + 1 && head >= box.y - TILE * 0.6 * s) break;
      if (guard++ > 8 || s <= 0.16) break;
      s = Math.max(0.16, s * 0.9);   // 월드가 짧아 밀리면 조금씩 더 멀리서 본다
    }
    return { box: box, scale: Math.round(cam.s * 100) / 100, span: [minX, minY, maxX, maxY], allyH: Math.round(allyH) };
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
    /* v5.10 — 전투 배속은 대기 간격만이 아니라 이동·타격 연출에도 걸린다.
       v5.51 — 수동 전투에서도 똑같이 건다. 예전 식은 `dt / 배속`이라 배속을 올릴수록
       애니메이션 시계가 **느려져** 걸음·돌진이 오히려 길어졌다(그래서 ×4가 ×1보다 느렸다).
       이제 전장의 시계가 배속만큼 빨리 흐른다 — 보행·돌진·타격·이펙트·진동이 모두 ÷배속.
       피해 숫자는 ×4에서도 읽히도록 배속을 2배까지만 적용한다(fdt). */
    const spd = autoSpeed || 1;
    const sdt = dt * timeScale * spd;
    const fdt = dt * timeScale * Math.min(2, spd);
    updateFx(sdt, fdt);
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
     지금 화면이 보이는 범위를 흰 사각형으로 보여 준다. 누르면 그 자리로 즉시 이동.
     v5.32 — [⤢ 확대]로 104px ↔ 화면 폭의 42%(최대 168px)를 전환한다.
     큰 전장(28×28·32×32)에서 마을·본진·성문 위치를 한눈에 잡으라고 만든 토글이다. */
  const MM_SMALL = 104;
  let mmStatic = null, mmBound = false, mmOpen = true, mmNote = null, mmBig = false;
  function mmEl() { return document.getElementById('mm-canvas'); }
  /* 확대 크기 — 390px 폰에서 160px 안팎, 넉넉한 화면에서는 168px 상한 */
  function mmPx() {
    if (!mmBig) return MM_SMALL;
    const vw = window.innerWidth || 390;
    /* v5.33 — 32×32 대도시에서는 확대해도 성곽(본성·성문)을 덜 가리게 한 단계 작게 */
    const cap = N >= 28 ? 148 : 168;
    return Math.round(Math.min(cap, Math.max(136, vw * 0.42)));
  }
  /* v5.33 — 확대한 미니맵이 덮는 폭만큼 전장 초점을 왼쪽으로 비켜 준다 */
  function shiftCamForMinimap(open) {
    if (!canvas || !stage) return;
    const box = document.getElementById('mm-box');
    const mmW = box ? box.getBoundingClientRect().width : 0;
    if (!mmW) return;
    const dx = (open ? -1 : 1) * Math.round(mmW / 2);
    cam.x += dx;
    camClamp();
  }
  function buildMinimap() {
    const cv = mmEl();
    if (!cv || !B || !B.tiles) return;
    const S = mmPx();
    const dpr2 = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(S * dpr2); cv.height = Math.round(S * dpr2);
    cv.style.width = S + 'px'; cv.style.height = S + 'px';
    const st = document.createElement('canvas');
    st.width = cv.width; st.height = cv.height;
    const sc = st.getContext('2d');
    sc.setTransform(dpr2, 0, 0, dpr2, 0, 0);
    sc.fillStyle = '#2a2317'; sc.fillRect(0, 0, S, S);
    const img = loadImg(`assets/maps/v2/battle_${B.bgKey}.webp`);
    if (img.complete && img.naturalWidth) sc.drawImage(img, 0, 0, S, S);
    else { sc.fillStyle = (B.type === 'siege' || B.type === 'defense') ? '#c9ab6c' : '#7d8a52'; sc.fillRect(0, 0, S, S); }
    const sx = S / N, sy = S / N;
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
    const S = mmPx();
    if (!mmStatic || cv.width !== Math.round(S * Math.min(2.5, window.devicePixelRatio || 1))) buildMinimap();
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
    const dpr2 = cv.width / S;
    c.setTransform(dpr2, 0, 0, dpr2, 0, 0);
    const sx = S / N, sy = S / N;
    /* 본진·마을 */
    (B.sites || []).forEach((s) => {
      /* v5.38 — 점령된 본진은 미니맵에서도 점령한 진영 색 */
      c.fillStyle = s.captured
        ? (s.captured === 'ally' ? '#6fb6ff' : '#ff7a5c')
        : s.type === 'village'
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
    /* 부대 — v5.28 대형 전장 줌아웃에서도 점이 묻히지 않게 크게 + 어두운 테두리 */
    const tinyView = cam.s < 0.30;
    const mk = Math.min(1.4, S / MM_SMALL);          // 확대하면 점·테두리도 조금 키운다
    const dotR = (tinyView ? 2.9 : 2.0) * (mmBig ? Math.max(1, mk * 0.86) : 1);
    B.units.forEach((u) => {
      if (!u.alive) return;
      const px = (u.x + 0.5) * sx, py = (u.y + 0.5) * sy;
      if (tinyView) {
        c.fillStyle = 'rgba(18,13,6,0.8)';
        c.beginPath(); c.arc(px, py, dotR + 1.2, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = u.side === 'ally' ? '#5aa0ff' : '#ff5a3c';
      c.beginPath();
      c.arc(px, py, dotR, 0, Math.PI * 2);
      c.fill();
      /* v5.28 — 지금 고른 부대와 처지가 위태로운(35% 이하) 부대를 덧그린다 */
      if (u === B.sel || (u.hp / Math.max(1, u.maxHp)) <= 0.35) {
        c.strokeStyle = u === B.sel ? '#ffffff' : 'rgba(255,226,140,0.95)';
        c.lineWidth = u === B.sel ? 1.6 : 1.2;
        c.beginPath(); c.arc(px, py, dotR + 1.8, 0, Math.PI * 2); c.stroke();
      }
      if (u.leader) {
        c.strokeStyle = '#ffd35c'; c.lineWidth = 1.3;
        c.beginPath(); c.arc(px, py, dotR + 3.2, 0, Math.PI * 2); c.stroke();
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
    if (mmNote) mmNote(mmOpen);
  }
  /* v5.32 — 미니맵 크게/작게. 폰을 세로로 들고 32×32 성을 칠 때 마을·본진이
     한눈에 들어오게 한다. 고른 크기는 다음 전투에도 기억한다. */
  function mmSetBig(on, silent) {
    mmBig = !!on;
    try { localStorage.setItem('jojo-mm-big', mmBig ? '1' : '0'); } catch (e) { /* ignore */ }
    mmStatic = null;
    const box = document.getElementById('mm-box');
    const btn = document.getElementById('mm-size');
    const stage = document.getElementById('battle-stage');
    if (box) box.classList.toggle('big', mmBig);
    if (stage) stage.classList.toggle('mm-big', mmBig);
    if (btn) {
      btn.textContent = mmBig ? '⤡ 축소' : '⤢ 확대';
      btn.setAttribute('aria-label', mmBig ? '미니맵 원래 크기로' : '미니맵 확대');
      btn.classList.toggle('on', mmBig);
    }
    if (!silent) {
      buildMinimap(); drawMinimap();
      /* v5.33 — 확대하면 그만큼 전장을 왼쪽으로 비켜 본성·성곽이 미니맵 뒤에 숨지 않게 한다 */
      shiftCamForMinimap(mmBig);
      SK.sfx.play('ui');
    } else if (!mmBig) { /* 기억된 '작게' 상태는 그대로 */ }
  }
  SK.mmSetBig = mmSetBig;
  function bindMinimap() {
    if (mmBound) return;
    mmBound = true;
    const cv = mmEl();
    const tog = document.getElementById('mm-toggle');
    const box = document.getElementById('mm-box');
    const legend = document.getElementById('mm-legend');
    const note = (on) => {
      if (!legend) return;
      const tiny = !!(B && cam && cam.s < 0.30);
      /* 확대 상태에서는 점이 크고 색이 많아지므로 범례를 늘 보여 준다 */
      legend.style.display = (on && (tiny || mmBig)) ? 'flex' : 'none';
    };
    mmNote = note;
    /* v5.41 — 390px 폰에서는 미니맵이 우측 상단 적 부대·HP를 덮었다('적 94…' 알약이 패널 뒤로).
       좁은 화면(450px 미만)은 기본을 '접힘'으로 시작하고, 토글로 언제든 펼친다. */
    const narrow = (window.innerWidth || document.documentElement.clientWidth || 390) < 450;
    mmOpen = !narrow;
    if (box) box.style.display = mmOpen ? '' : 'none';
    if (tog) {
      tog.textContent = mmOpen ? '◧' : '◨';
      tog.setAttribute('aria-label', mmOpen ? '미니맵 접기' : '미니맵 펼치기');
      tog.title = mmOpen ? '미니맵 접기' : '미니맵 펼치기';
    }
    if (stage) stage.classList.toggle('mm-collapsed', !mmOpen);
    try { mmSetBig(localStorage.getItem('jojo-mm-big') === '1', true); } catch (e) { /* ignore */ }
    if (tog && box) {
      tog.onclick = (e) => {
        e.stopPropagation();
        mmOpen = !mmOpen;
        box.style.display = mmOpen ? '' : 'none';
        tog.textContent = mmOpen ? '◧' : '◨';
        tog.setAttribute('aria-label', mmOpen ? '미니맵 접기' : '미니맵 펼치기');
        tog.title = mmOpen ? '미니맵 접기' : '미니맵 펼치기';
        if (stage) stage.classList.toggle('mm-collapsed', !mmOpen);
        if (!mmOpen) { const lg = document.getElementById('mm-legend'); if (lg) lg.style.display = 'none'; }
      };
    }
    const size = document.getElementById('mm-size');
    if (size) size.onclick = (e) => { e.stopPropagation(); mmSetBig(!mmBig); };
    /* 화면 폭이 바뀌면 확대 크기를 다시 잡는다 */
    window.addEventListener('resize', () => { if (!mmBig) return; mmStatic = null; buildMinimap(); drawMinimap(); });
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
    /* 두 번 톡톡 — 확대/축소 (한 번 탭은 그 자리로 이동) */
    cv.addEventListener('dblclick', (ev) => { ev.preventDefault(); ev.stopPropagation(); mmSetBig(!mmBig); });
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
    drawWaterWaves();
    drawBattleProps();
    drawBrokenGates();
    drawKeyProps();
    drawSites();
    drawGrid();
    drawObjective();
    drawHighlights();
    drawBackFloats();
    drawUnits();
    drawFx();
    ctx.restore();
    /* v5.54 — 필살기 화면 물들임 (한 번 번쩍 지나간다) */
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      if (f.kind !== 'tint') continue;
      const tp = f.t / f.life;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(${f.color || '255,220,140'},${0.17 * (1 - tp)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }
    /* v5.30 — 야간 전장(야영 기습전): 화면 전체를 한 번 어둡게 깔고 횃불 빛을 더한다.
       제목에만 '야간'이라 적고 낮그림을 그대로 두면 어색해서, 실제 밤으로 보이게 했다. */
    if (B.night) drawNight(w, h);
    drawFloats();
    drawUltBubble(w, h);
    drawMinimap();
  }

  function drawNight(w, h) {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#5c6cae';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.s, cam.s);
    ctx.globalCompositeOperation = 'lighter';
    const fires = [[3, 3], [17, 3], [3, 17], [17, 17], [12, 21], [12, 4]];
    fires.forEach(([fx0, fy0]) => {
      const gx = (fx0 + 0.5) * TILE, gy = (fy0 + 0.5) * TILE, rad = TILE * 3.4;
      const g = ctx.createRadialGradient(gx, gy, TILE * 0.2, gx, gy, rad);
      g.addColorStop(0, 'rgba(255,196,110,0.42)');
      g.addColorStop(0.5, 'rgba(255,160,80,0.16)');
      g.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, gy, rad, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
    /* 밤의 어둑함 — 가장자리를 더 어둡게 죽여 횃불 주변만 읽히게 */
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.22, w * 0.5, h * 0.46, Math.max(w, h) * 0.78);
    vig.addColorStop(0, 'rgba(6,10,30,0)');
    vig.addColorStop(1, 'rgba(5,8,26,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
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

  /* v5.31 — 수전 물결: 물 칸 위에 천천히 흐르는 잔물결 두 줄 (수전·도하에서만, 화면 안 칸만) */
  function drawWaterWaves() {
    if (!B || !B.boatable || !ctx) return;
    const tnow = performance.now();
    const cw = canvas.width / dpr, chh = canvas.height / dpr;
    const x0 = Math.max(0, Math.floor((-cam.x / cam.s) / TILE) - 1);
    const y0 = Math.max(0, Math.floor((-cam.y / cam.s) / TILE) - 1);
    const x1 = Math.min(N - 1, Math.ceil((cw - cam.x) / cam.s / TILE) + 1);
    const y1 = Math.min(N - 1, Math.ceil((chh - cam.y) / cam.s / TILE) + 1);
    ctx.save();
    ctx.lineCap = 'round';
    for (let y = y0; y <= y1; y++) {
      const row = B.tiles[y];
      if (!row) continue;
      for (let x = x0; x <= x1; x++) {
        if (row[x] !== 'W') continue;
        const ph = tnow / 900 + x * 0.7 + y * 1.3;
        const alpha = 0.16 + 0.12 * (0.5 + 0.5 * Math.sin(ph * 2.2));
        ctx.strokeStyle = `rgba(198,234,248,${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.5;
        const bx = x * TILE, by = y * TILE;
        for (let k = 0; k < 2; k++) {
          const ox = ((ph * 9 + k * 26) % TILE);
          const yy = by + TILE * (0.3 + k * 0.34);
          ctx.beginPath();
          ctx.moveTo(bx + ox - 9, yy);
          ctx.quadraticCurveTo(bx + ox, yy - 3.4, bx + ox + 9, yy);
          ctx.stroke();
        }
      }
    }
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
          /* v5.31 — 물 칸이 목록 모양의 네모로 보이지 않게 칸마다 농도를 살짝 다르게 칠한다 */
          const wv = 0.125 + 0.022 * (0.5 + 0.5 * Math.sin(x * 1.7 + y * 2.3));
          ctx.fillStyle = `rgba(41,96,128,${wv.toFixed(3)})`;
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
     v5.42 — 마을을 중앙 길목으로 옮기고 값을 올렸다:
       · 점령하는 순간 그 부대에 사기 +10 · MP +8 · 최대 병력 10% 회복
       · 점령한 마을 위에 서 있으면 방어 +20% · 매 턴 회복 +15% · MP +5
       · 전투에서 이기면 아군이 차지한 마을 하나당 금 +150
     마을은 발은 진영의 것이 되고, 적진이 다시 밸으면 빼앗긴다. */
  function siteAt(x, y) {
    if (!B || !B.sites) return null;
    return B.sites.find((s) => s.x === x && s.y === y) || null;
  }
  function siteBonusOf(u) {
    if (!u) return null;
    const s = siteAt(u.x, u.y);
    if (!s) return null;
    if (s.type === 'village') return s.owner === u.side ? { def: 1.20, heal: 0.15, mp: 5 } : null;
    const mine = (s.type === 'allyHQ' && u.side === 'ally') || (s.type === 'enemyHQ' && u.side === 'enemy');
    return mine ? { def: 1.25, heal: 0.20, mp: 10 } : null;
  }
  /* v5.42 — 마을 점령 즉시 보상: 사기 +10(상한) · MP +8 · 최대 병력 10% 회복 */
  function villageCaptureBonus(u) {
    const got = [];
    const m0 = u.morale == null ? 100 : u.morale;
    const mmax = u.moraleMax || 100;
    if (m0 < mmax) {
      u.morale = Math.round(Math.min(mmax, m0 + 10) * 10) / 10;
      got.push('사기+' + Math.round(u.morale - m0));
    }
    if (u.mp < u.maxMp) {
      const mp = Math.min(8, u.maxMp - u.mp);
      u.mp += mp;
      if (mp > 0) got.push('MP+' + mp);
    }
    if (u.hp < u.maxHp) {
      const hh = Math.min(u.maxHp - u.hp, Math.max(1, Math.round(u.maxHp * 0.10)));
      u.hp += hh;
      addHeal(u, hh, u);
      got.push('회복+' + hh);
    }
    return got;
  }
  /* v5.42 — 승리 보상: 이긴 전장에서 아군이 차지한 마을 하나당 금 +150 */
  function villageWarGold() {
    if (!B || !B.sites) return { count: 0, gold: 0 };
    const count = B.sites.filter((s) => s.type === 'village' && s.owner === 'ally').length;
    return { count: count, gold: count * 150 };
  }
  function addVillageWarGold(st) {
    const v = villageWarGold();
    if (v.gold > 0 && st) st.gold += v.gold;
    return v;
  }
  function sitePhase(heal) {
    if (!B || !B.sites || B.over) return;
    B.units.forEach((u) => {
      if (!u.alive) return;
      const s = siteAt(u.x, u.y);
      if (!s) return;
      if (s.type === 'village' && s.owner !== u.side) {
        s.owner = u.side;
        const got = villageCaptureBonus(u);
        const full = got.length ? got.join(' ') : '이미 만전';
        feed(`${u.name} — 마을 점령 · ${full} (${u.side === 'ally' ? '아군' : '적군'})`, u.side === 'ally' ? 'good' : 'bad');
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE,
          got.length ? `마을 점령 · ${got.slice(0, 2).join(' ')}` : '마을 점령', '#9ef0b8');
        addFx({ kind: 'heal', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 520 });
        SK.sfx.play('ui');
      }
      if (!heal) return;
      const b = siteBonusOf(u);
      if (!b) return;
      if (u.hp < u.maxHp) {
        const hh = Math.max(1, Math.round(u.maxHp * b.heal * (1 + fxPct(u, 'heal'))));
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
      /* v5.38 — 점령된 본진은 점령한 진영 색으로 간다 (한 번 점령되면 고정) */
      const cap = s.captured || null;
      const col = cap ? (cap === 'ally' ? '90,160,255' : '255,90,60')
        : s.type === 'village'
          ? (s.owner === 'ally' ? '90,160,255' : s.owner === 'enemy' ? '255,90,60' : '126,196,132')
          : (s.type === 'allyHQ' ? '90,160,255' : '255,90,60');
      ctx.save();
      ctx.fillStyle = `rgba(${col},${cap ? '0.30' : '0.16'})`;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = `rgba(${col},${(0.55 + 0.22 * Math.sin(t * 3)).toFixed(3)})`;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
      if (img.complete && img.naturalWidth) {
        const w = TILE * (s.type === 'village' ? 0.84 : 1.45);
        ctx.drawImage(img, x + TILE / 2 - w / 2, y + TILE - w, w, w);
      }
      /* v5.38 — 점령 깃발: 타일 오른쪽 위에 점령한 진영 색 깃발을 꽂는다 */
      if (cap) {
        const px = x + TILE * 0.80, py = y + TILE * 0.10;
        ctx.strokeStyle = 'rgba(22,16,8,0.94)';
        ctx.lineWidth = Math.max(1.8, 2.1 * k);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + TILE * 0.40); ctx.stroke();
        ctx.fillStyle = cap === 'ally' ? '#6fb0ff' : '#ff7a5c';
        ctx.beginPath();
        ctx.moveTo(px, py + 0.6);
        ctx.lineTo(px + TILE * 0.30, py + TILE * 0.11);
        ctx.lineTo(px, py + TILE * 0.21);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(20,14,6,0.9)';
        ctx.lineWidth = Math.max(1, 1.1 * k);
        ctx.stroke();
      }
      const base = s.type === 'allyHQ' ? '본진' : s.type === 'enemyHQ' ? '적 본진'
        : (s.owner === 'ally' ? '마을 · 아군' : s.owner === 'enemy' ? '마을 · 적' : '마을');
      const label = cap ? `${base} · 점령` : base;
      ctx.font = `800 ${Math.round(9.4 * k)}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 11 * k;
      const th = Math.round(13.5 * k);
      ctx.fillStyle = cap ? (cap === 'ally' ? 'rgba(30,64,112,0.94)' : 'rgba(112,34,24,0.94)') : 'rgba(24,19,11,0.82)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x + TILE / 2 - tw / 2, y - th - 2 * k, tw, th, th / 2); ctx.fill(); }
      else ctx.fillRect(x + TILE / 2 - tw / 2, y - th - 2 * k, tw, th);
      ctx.fillStyle = s.type === 'village' && !s.owner ? '#cfeccf' : (cap ? '#ffffff' : '#fff3d8');
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
    /* v5.31 — 둔화(이동 −1) */
    if (u.slow) m -= 1;
    if (u.cls === 'yasubyung') {
      const ch = B && B.tiles && B.tiles[u.y] ? B.tiles[u.y][u.x] : 'P';
      if (ch === 'F' || ch === 'M' || (B && BEAST_TERRAIN_TYPES[B.type])) m += 1;
    }
    return Math.min(10, m);
  }

  function moveCost(cls, ch, x, y, side, u) {
    const base = moveCostBase(cls, ch, x, y, side);
    /* v5.29 — 보물 '험지 이동 페널티 무효' (천리마·대동여지도첩·청풍도포) */
    if (u && u.tfx && u.tfx.rough && base > 1 && base < 90) return 1;
    return base;
  }
  function moveCostBase(cls, ch, x, y, side) {
    if (ch === 'G') {
      if (!gateTileAt(x, y)) return 1;
      /* v5.21 — 성 주인(수성전 아군)은 살아 있는 자기 성문을 그냥 지난다.
         적 침공군만 문에 막힌다. (예전에는 아군까지 99라 성 안에 갇혔다) */
      if (B && B.defense && side === 'ally') return 1;
      return 99;
    }
    /* v5.31 — 수전·도하 전장에서는 누구나 조각배를 타고 물을 건넌다 (한 칸 2).
       수적은 배 없이 걷는다(1). 해자(W)뿐인 공성전은 그대로 막힌다. */
    if (ch === 'W') return cls === 'sujeok' ? 1 : ((B && B.boatable) ? 2 : 99);
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
        const cost = moveCost(u.cls, ch, nx, ny, u.side, u);
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
    /* v5.39 — [공격] 모드에서는 파란 이동 범위를 깔지 않는다 (사거리 타일만 보이게) */
    if (reach && !healPick && mode !== 'attack') {
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
      const rng = pendingSkill ? ((pendingSkill.range ? skRange(u, pendingSkill) : pendingSkill.radius || effRng(u))) : effRng(u);
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
      /* v5.39 — [공격] 모드: 사거리 안에 적이 있든 없든 공격 사거리 타일을 붉은 주황으로 깐다.
         (예전에는 적 타일만 붉게 칠해 '한 칸 더 붙으세요' 때 어디까지 닿는지 보이지 않았다) */
      if (mode === 'attack' && !pendingSkill) {
        const pulse3 = 0.5 + 0.5 * Math.sin(performance.now() / 400);
        const minA = u.minRng || 1;
        const inSetA = new Set();
        for (let y2 = 0; y2 < N; y2++) {
          for (let x2 = 0; x2 < N; x2++) {
            const d2 = manh(u.x, u.y, x2, y2);
            if (d2 < minA || d2 > rng) continue;
            inSetA.add(x2 + ',' + y2);
            ctx.fillStyle = `rgba(196,32,24,${0.30 + pulse3 * 0.10})`;
            ctx.fillRect(x2 * TILE + 2, y2 * TILE + 2, TILE - 4, TILE - 4);
            ctx.strokeStyle = 'rgba(255,126,96,1)';
            ctx.lineWidth = 2.2;
            ctx.strokeRect(x2 * TILE + 3, y2 * TILE + 3, TILE - 6, TILE - 6);
          }
        }
        if (inSetA.size) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,178,140,1)';
          ctx.lineWidth = 3.4;
          ctx.beginPath();
          inSetA.forEach((k) => {
            const [x2, y2] = k.split(',').map(Number);
            const px = x2 * TILE, py = y2 * TILE;
            if (!inSetA.has(x2 + ',' + (y2 - 1))) { ctx.moveTo(px + 2, py + 2.5); ctx.lineTo(px + TILE - 2, py + 2.5); }
            if (!inSetA.has(x2 + ',' + (y2 + 1))) { ctx.moveTo(px + 2, py + TILE - 2.5); ctx.lineTo(px + TILE - 2, py + TILE - 2.5); }
            if (!inSetA.has((x2 - 1) + ',' + y2)) { ctx.moveTo(px + 2.5, py + 2); ctx.lineTo(px + 2.5, py + TILE - 2); }
            if (!inSetA.has((x2 + 1) + ',' + y2)) { ctx.moveTo(px + TILE - 2.5, py + 2); ctx.lineTo(px + TILE - 2.5, py + TILE - 2); }
          });
          ctx.stroke();
          ctx.restore();
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
          if (manh(u.x, u.y, t.x, t.y) > (pendingSkill.range ? skRange(u, pendingSkill) : effRng(u))) return;
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
    /* v5.31 — 조각배는 물결 위에 떠서 천천히 흔들린다 */
    const bob = u.aboard ? Math.sin(performance.now() / 430 + (u.x + u.y) * 1.7) * 2.4 : 0;
    const dy = by - dh + bob;
    const topY = by - dh;   // 라벨은 흔들리지 않게 원래 높이 기준
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
      /* v5.31 — 조각배 뒤로 남는 물길(V자 물결) */
      if (u.aboard) {
        const wt = performance.now() / 240;
        ctx.strokeStyle = 'rgba(206,240,252,0.55)';
        ctx.lineWidth = 2.2;
        for (let wi = 0; wi < 2; wi++) {
          const spread = TILE * (0.22 + wi * 0.12) + Math.sin(wt + wi) * 1.5;
          ctx.beginPath();
          ctx.moveTo(bx - spread, by + 1 - wi * 2);
          ctx.quadraticCurveTo(bx, by + 6 - wi * 3, bx + spread, by + 1 - wi * 2);
          ctx.stroke();
        }
      }
      if (u.side === 'enemy') ctx.filter = 'saturate(0.9) brightness(0.99)';
      /* v5.39 — 행동을 마친 부대는 스프라이트를 어둡게·저채도로 (턴이 돌아오면 원래 밝기) */
      if (u.acted) ctx.filter = (ctx.filter && ctx.filter !== 'none' ? ctx.filter + ' ' : '') + 'brightness(0.62) grayscale(0.5)';
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
    // 행동 완료 표시 (v5.39 — 발치에 ✓ 배지를 붙인다)
    if (u.acted) {
      ctx.save();
      ctx.fillStyle = 'rgba(16,14,10,0.28)';
      ctx.beginPath(); ctx.ellipse(bx, by - 2, TILE * 0.32, TILE * 0.145, 0, 0, Math.PI * 2); ctx.fill();
      const ck = Math.max(6, Math.round(7 * clamp(1 / Math.max(0.5, cam.s), 1, 1.55)));
      const chx = bx + TILE * 0.28, chy = by - TILE * 0.03;
      ctx.beginPath(); ctx.arc(chx, chy, ck, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(26,22,14,0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,120,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      /* v5.39 — 폰트 글꼴 대신 두 줄로 그린 체크 (어떤 기기에서도 같은 모양) */
      ctx.strokeStyle = '#ffd97a';
      ctx.lineWidth = Math.max(1.6, ck * 0.34);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(chx - ck * 0.42, chy + ck * 0.02);
      ctx.lineTo(chx - ck * 0.10, chy + ck * 0.36);
      ctx.lineTo(chx + ck * 0.46, chy - ck * 0.38);
      ctx.stroke();
      ctx.restore();
    }
    // 배지(아/적) + 병력 숫자 + 병력 바 — 화면 배율과 무관하게 읽히도록
    const k = clamp(1 / Math.max(0.5, cam.s), 1, 1.55);
    /* v5.26 — 부대가 밀집하면 숫자를 '1.4k'로 줄이고 아/적 칩과 병과 배지를 생략해
       이웃 부대 라벨과 겹치는 문제를 완화한다. (성벽 2×2 대형·성문 앞 난전에서 심했다) */
    let crowd = 0;
    for (let ci = 0; ci < B.units.length; ci++) {
      const o = B.units[ci];
      if (!o.alive || o === u) continue;
      if (Math.max(Math.abs(o.x - u.x), Math.abs(o.y - u.y)) <= 1) crowd += 1;
    }
    const dense = crowd >= 2, veryDense = crowd >= 4;
    /* v5.27 — 24~32칸 대형 전장을 한눈에 보는 배율(cam.s<0.30)에서는 부대마다 붙는 숫자 배지가
       서로 덮여 읽을 수 없다. 그때는 지금 고른 부대·적 총대장만 숫자를 달고 나머지는 병력 바로만 보여 준다.
       밀집할 때도 글자 상한을 낮춰 라벨 폭을 한 칸 이하로 줄인다. */
    const tinyView = cam.s < 0.30;
    const kNum = dense ? Math.min(k, 1.06) : k;
    /* v5.28 — 아주 멀리 축소해도 체력이 위태로운(35% 이하) 부대는 숫자를 보여 준다 */
    const showNum = !tinyView || u === B.sel || u.boss || (u.hp / Math.max(1, u.maxHp)) <= 0.35;
    const shortNum = (v) => {
      const n = Math.max(0, Math.round(v));
      if (n >= 10000) return Math.round(n / 1000) + 'k';
      if (n >= 1000) return (Math.round(n / 100) / 10).toFixed(1) + 'k';
      return String(n);
    };
    /* v5.32 — 전장 병력 배지는 줌·밀집도와 무관하게 항상 짧은 표기(2.7k/10k/729).
       예전에는 확대하면 2,700, 멀어지면 2.7k로 오가 눈이 어지러웠다. 정확한 수치는 하단 부대 카드가 맡는다. */
    const num = shortNum(u.hp);
    const bh = 6;
    const bw = Math.max(TILE * 0.66, 0);
    /* 밀집 시 한 칸씩 엇갈려 세로로도 덜 부딪히게 (v5.27 — 엇갈림 폭 4→6) */
    const stair = dense && (((u.x * 2 + u.y) % 3) === 1) ? Math.round(6 * kNum) : 0;
    const barY = topY - 8 - bh - stair;
    const fsz = Math.round(9 * kNum * (veryDense ? 0.84 : dense ? 0.93 : 1));
    ctx.font = `800 ${fsz}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
    const numW = showNum ? ctx.measureText(num).width : 0;
    /* v5.27 — 밀집하면 아/적 글자 칩을 색 점으로 줄여 라벨 폭을 한 칸 안으로 줄인다 */
    const showChip = !dense && showNum && !tinyView;
    const dotW = dense && showNum ? Math.round(5 * kNum) : 0;
    const chipW = showChip ? Math.round(11 * kNum) : dotW;
    const padW = Math.round((dense ? 7 : 9) * kNum);
    const pillW = showNum ? chipW + numW + padW : 0;
    const pillH = Math.round((dense ? 12 : 13) * kNum);
    const pillX = bx - pillW / 2;
    const pillY = barY - pillH - Math.round(2 * kNum);
    ctx.save();
    if (showNum) {
      ctx.fillStyle = dense ? 'rgba(24,19,11,0.8)' : 'rgba(24,19,11,0.86)';
      ctx.strokeStyle = u.side === 'ally' ? 'rgba(130,180,255,0.75)' : 'rgba(255,150,130,0.7)';
      ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(pillX, pillY, pillW, pillH); ctx.strokeRect(pillX, pillY, pillW, pillH); }
    }
    if (showChip) {
      ctx.fillStyle = tint.chip;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(pillX + 1, pillY + 1, chipW, pillH - 2, (pillH - 2) / 2); ctx.fill(); }
      else ctx.fillRect(pillX + 1, pillY + 1, chipW, pillH - 2);
      ctx.fillStyle = '#fff6e2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(fsz * 0.82)}px "Noto Sans CJK KR", sans-serif`;
      ctx.fillText(tint.label, pillX + 1 + chipW / 2, pillY + pillH / 2 + 0.5);
    } else if (dotW) {
      ctx.fillStyle = tint.chip;
      ctx.beginPath();
      ctx.arc(pillX + 1 + dotW / 2 + 0.5, pillY + pillH / 2, Math.max(2, dotW * 0.38), 0, Math.PI * 2);
      ctx.fill();
    }
    if (showNum) {
      ctx.font = `800 ${fsz}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
      ctx.textAlign = chipW ? 'left' : 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fffaf0';
      ctx.fillText(num, chipW ? pillX + chipW + Math.round(3 * kNum) : pillX + pillW / 2, pillY + pillH / 2 + 0.5);
    }
    ctx.restore();
    // 병과 배지 — [🐎 기병] 형태의 작은 칩을 HP 배지 왼쪽에 붙인다 (밀집하면 생략)
    const badge = CLASS_BADGE[u.cls] || ['', SK.CLASSES[u.cls] ? SK.CLASSES[u.cls].name.slice(0, 2) : ''];
    /* v5.40 — 병과 배지를 HP 알약 '위 줄'에 따로 세운다.
       예전에는 알약 옆에 붙여, 부대가 나란히 서면(mid 부대) 옆 칸과 부딪혀 통째로 생략됐다.
       밀집·축소 시에는 한 글자(기·궁·창·군)로 줄여 언제나 병과가 보이게 한다. */
    if (badge[1]) {
      const btxt = (dense || veryDense || tinyView) ? String(badge[1]).slice(0, 1) : badge[1];
      const bsz = Math.max(6.5, Math.round((dense || veryDense ? 6.6 : 7.2) * k));
      ctx.save();
      ctx.font = `800 ${bsz}px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif`;
      const bw2 = ctx.measureText(btxt).width + Math.round(7 * k);
      const bh2 = Math.round((dense || veryDense ? 10 : 11) * k);
      const bx2 = bx - bw2 / 2;
      const by2 = pillY - bh2 - Math.round(2 * k);
      ctx.fillStyle = BADGE_BG[u.side] || BADGE_BG.enemy;
      ctx.strokeStyle = u.side === 'ally' ? 'rgba(150,190,255,0.6)' : 'rgba(255,170,150,0.55)';
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
    /* v5.31 — 사기 바(병력 바 아래 얇게) + 상태이상 배지 */
    if (!tinyView) {
      const mw = bw * 0.88;
      const mmax = Math.max(1, u.moraleMax || 100);
      const mv = clamp((u.morale == null ? 100 : u.morale) / mmax, 0, 1);
      const mby = barY + bh + 1.4;
      ctx.fillStyle = 'rgba(18,14,8,0.72)';
      ctx.fillRect(bx - mw / 2, mby, mw, 2.8);
      ctx.fillStyle = mv > 0.85 ? '#8ad38a' : (mv > 0.62 ? '#e2c85a' : '#d9694f');
      ctx.fillRect(bx - mw / 2, mby, mw * mv, 2.8);
    }
    const ailKeys = u.ail ? Object.keys(u.ail).filter((k) => u.ail[k] > 0) : [];
    if (ailKeys.length && !tinyView) {
      const asz = Math.max(8, Math.round(9 * k));
      /* v5.31 — 390px 화면에서 이웃 라벨을 덮지 않게 가장 심한 상태 하나만 그린다.
         (나머지는 부대 카드의 알약으로 본다) */
      const order = ['stun', 'confuse', 'fear', 'burn', 'poison', 'slow'];
      const top = order.find((k) => ailKeys.indexOf(k) >= 0) || ailKeys[0];
      ctx.save();
      ctx.font = `900 ${asz}px "Noto Sans CJK KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ax = pillX - asz * 0.58 - 1;
      const ay = pillY + pillH / 2;
      ctx.fillStyle = `rgba(${AIL[top].c},0.92)`;
      ctx.beginPath();
      ctx.arc(ax, ay, asz * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#231a0c';
      ctx.fillText(AIL[top].n.charAt(0), ax, ay + 0.5);
      if (ailKeys.length > 1) {
        ctx.font = `800 ${Math.round(asz * 0.7)}px "Noto Sans CJK KR", sans-serif`;
        ctx.fillStyle = '#ffe9c0';
        ctx.textAlign = 'left';
        ctx.fillText('+', ax + asz * 0.5, ay - asz * 0.42);
      }
      ctx.restore();
    }
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
  /* v5.27 — opts.back: 유닛 뒤(스프라이트·병력 라벨 아래)에 깔리는 글자. 고유특기 이름처럼
     길게 떠 있는 문구가 부대 병력 라벨을 덮지 않게 한다. */
  function addFloat(x, y, text, color, opts) {
    floats.push({ x, y, text, color, life: 950, t: 0, back: !!(opts && opts.back) });
  }

  function updateFx(dt, fdt) {
    /* v5.54 — 필살기 말풍선은 부대를 따라가며 스스로 사라진다 */
    if (ultShout) { ultShout.t += dt; if (ultShout.t > ultShout.life) ultShout = null; }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.t > f.life) {
        fx.splice(i, 1);
        if (f.onEnd) { const cb = f.onEnd; f.onEnd = null; try { cb(); } catch (e) { console.error(e); } }
      }
    }
    /* v5.51 — 피해 숫자(float)는 배속을 2배까지만 받는다 (×4에서도 470ms 남아 읽힌다) */
    const fdtv = fdt == null ? dt : fdt;
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += fdtv; if (floats[i].t > floats[i].life) floats.splice(i, 1); }
  }

  function drawFx() {
    fx.forEach((f) => {
      const p = f.t / f.life;
      ctx.save();
      if (f.kind === 'slash') {
        /* v5.30 — 베기: 두 갈래 궤적 + 튀는 불티로 손맛을 살린다 */
        ctx.strokeStyle = `rgba(255,240,190,${1 - p})`;
        ctx.lineWidth = 5 * (1 - p) + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, TILE * 0.55, -0.9, 0.9 + p * 0.6);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,120,80,${0.7 * (1 - p)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,236,190,${0.55 * (1 - p)})`;
        ctx.lineWidth = 2.4 * (1 - p) + 0.6;
        ctx.beginPath();
        ctx.arc(f.x, f.y, TILE * 0.38, 2.5, 4.4 + p * 0.7);
        ctx.stroke();
      } else if (f.kind === 'spark') {
        /* v5.30 — 타격 순간 튀는 불티 */
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9 + f.x * 0.01;
          const d = TILE * (0.08 + p * 0.42) * (i % 2 ? 1 : 0.72);
          ctx.fillStyle = `rgba(${f.color || '255,220,150'},${(1 - p) * 0.9})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.7, 2.2 * (1 - p) + 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
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
      } else if (f.kind === 'splash') {
        /* v5.31 — 조각배 승선·하선 물보라: 퍼지는 물고리 + 튀는 물방울 */
        for (let i = 0; i < 3; i++) {
          const rr = TILE * (0.14 + p * 0.5 + i * 0.1);
          ctx.strokeStyle = `rgba(196,236,250,${(0.8 - i * 0.2) * (1 - p)})`;
          ctx.lineWidth = 2.4 * (1 - p) + 0.6;
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, rr, rr * 0.42, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (let i = 0; i < 8; i++) {
          const a2 = i * 0.8 + f.x * 0.01;
          const d = TILE * (0.1 + p * 0.5);
          ctx.fillStyle = `rgba(214,244,255,${(1 - p) * 0.85})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a2) * d, f.y + Math.sin(a2) * d * 0.5 - Math.sin(p * Math.PI) * TILE * 0.22, 2.4 * (1 - p) + 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
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
      } else if (f.kind === 'ult') {
        const mx = (f.x + (f.tx == null ? f.x : f.tx)) / 2;
        const my = (f.y + (f.ty == null ? f.y : f.ty)) / 2;
        const Z = Math.min(1.7, Math.max(1, 0.46 / Math.max(0.2, cam.s)));
        ctx.translate(mx, my); ctx.scale(Z, Z); ctx.translate(-mx, -my);
        drawUltFx(f, p);
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

  /* ───────────── v5.54 — 필살기 이펙트·말풍선 ───────────── */
  function ultRGBA(f, a) { return `rgba(${f.color || '255,220,140'},${a})`; }
  function ultRnd(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
  function drawUltFx(f, p) {
    const c = f.color || '255,220,140';
    const A = 1 - p;
    const T = TILE;
    const dx = f.tx - f.x, dy = f.ty - f.y;
    const ang = Math.atan2(dy, dx);
    const dist = Math.max(1, Math.hypot(dx, dy));
    switch (f.sub) {
      /* 一자 참격 — 붉은 칼날이 대상 위를 세 번 가른다 */
      case 'slash_crimson': {
        for (let i = 0; i < 3; i++) {
          const g = Math.min(1, Math.max(0, p * 3.4 - i * 0.22));
          if (g <= 0) continue;
          const off = (i - 1) * T * 0.26;
          const x0 = f.tx - T * 0.85 + off * 0.35, y0 = f.ty - T * 0.75 + off;
          ctx.strokeStyle = ultRGBA(f, 0.92 * A);
          ctx.lineWidth = 10 * A + 2;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + T * 1.7 * g, y0 + T * 1.45 * g); ctx.stroke();
          ctx.strokeStyle = `rgba(255,250,235,${0.9 * A})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + T * 1.7 * g, y0 + T * 1.45 * g); ctx.stroke();
        }
        for (let i = 0; i < 10; i++) {
          const s2 = ultRnd(i + f.tx * 0.01 + f.ty * 0.02);
          const d = T * (0.2 + p * 0.7) * (0.6 + s2);
          ctx.fillStyle = ultRGBA(f, 0.85 * A);
          ctx.beginPath(); ctx.arc(f.tx + Math.cos(s2 * 6.28) * d, f.ty + Math.sin(s2 * 6.28) * d * 0.7, 2.4 * A + 0.8, 0, 6.283); ctx.fill();
        }
        break;
      }
      /* 용의 일도 — 시전자에서 대상까지 큰 초승달 파도 */
      case 'dragon_cleave': {
        /* 시전자 → 대상 궤적 (초승달이 날아간 자리) */
        ctx.strokeStyle = ultRGBA(f, 0.5 * A);
        ctx.lineWidth = 10 * A + 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y - T * 0.2); ctx.lineTo(f.x + dx * Math.min(1, p * 1.6), f.y + dy * Math.min(1, p * 1.6) - T * 0.2); ctx.stroke();
        /* 대상 위에 크게 터지는 초승달 칼날 — 두 호를 채워 진짜 초승달 모양으로 */
        const g = Math.min(1, p * 2.6);
        const R1 = T * (1.05 + g * 0.75), R2 = R1 * 0.6;
        [[1.0, 0.95], [0.72, 0.6]].forEach(([k2, al], i) => {
          ctx.save();
          ctx.translate(f.tx, f.ty - T * 0.1);
          ctx.rotate(ang - 0.35 + p * 0.8 + i * 0.16);
          const r1 = R1 * k2, r2 = R2 * k2;
          const grd = ctx.createRadialGradient(0, 0, r2 * 0.7, 0, 0, r1);
          grd.addColorStop(0, `rgba(255,255,255,${0.9 * al * A})`);
          grd.addColorStop(0.55, ultRGBA(f, 0.9 * al * A));
          grd.addColorStop(1, ultRGBA(f, 0.15 * al * A));
          ctx.beginPath();
          ctx.arc(0, 0, r1, -1.05, 1.05);
          ctx.arc(0, 0, r2, 1.05, -1.05, true);
          ctx.closePath();
          ctx.fillStyle = grd;
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.85 * al * A})`;
          ctx.lineWidth = 2 + al * A;
          ctx.stroke();
          ctx.restore();
        });
        /* 흩어지는 빛가루 */
        for (let i = 0; i < 12; i++) {
          const s2 = ultRnd(i * 4.1 + f.tx * 0.03);
          const a2 = ang - 1 + s2 * 2;
          const d = T * (0.3 + p * 1.1) * (0.6 + s2 * 0.8);
          ctx.fillStyle = ultRGBA(f, 0.8 * A);
          ctx.beginPath(); ctx.arc(f.tx + Math.cos(a2) * d, f.ty + Math.sin(a2) * d, 2.6 * A + 0.8, 0, 6.283); ctx.fill();
        }
        break;
      }
      /* 화공 — 솟구치는 불기둥과 불티 */
      case 'fire_storm': {
        const grow = Math.min(1, p * 2.2);
        ctx.fillStyle = `rgba(255,120,40,${0.28 * A})`;
        ctx.beginPath(); ctx.ellipse(f.tx, f.ty, T * 0.9 * grow, T * 0.45 * grow, 0, 0, 6.283); ctx.fill();
        for (let i = 0; i < 12; i++) {
          const s2 = ultRnd(i * 3.1 + f.tx);
          const a2 = s2 * 6.283;
          const rr = (f.r || T) * 0.7 * s2;
          const hh = T * (0.5 + s2) * (0.4 + p);
          const x = f.tx + Math.cos(a2) * rr, y = f.ty + Math.sin(a2) * rr * 0.6;
          const grd = ctx.createLinearGradient(x, y, x, y - hh);
          grd.addColorStop(0, `rgba(255,210,120,${0.85 * A})`);
          grd.addColorStop(0.5, `rgba(255,130,40,${0.7 * A})`);
          grd.addColorStop(1, `rgba(180,40,10,0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.moveTo(x - 7, y);
          ctx.quadraticCurveTo(x - 3, y - hh * 0.6, x + Math.sin(p * 6 + i) * 4, y - hh);
          ctx.quadraticCurveTo(x + 4, y - hh * 0.6, x + 7, y);
          ctx.closePath(); ctx.fill();
        }
        for (let i = 0; i < 9; i++) {
          const s2 = ultRnd(i * 7.7 + f.ty);
          ctx.fillStyle = `rgba(255,${170 + Math.round(60 * s2)},90,${0.8 * A})`;
          ctx.beginPath(); ctx.arc(f.tx + (s2 - 0.5) * f.r * 1.4, f.ty - p * T * (0.6 + s2), 2.2 * A + 0.7, 0, 6.283); ctx.fill();
        }
        break;
      }
      /* 천뢰 — 하늘에서 내리꽂히는 번개 세 갈래 */
      case 'lightning_array': {
        const bol = [[0, 0], [-T * 0.5, T * 0.12], [T * 0.55, -T * 0.1]];
        bol.forEach((o, i) => {
          const g = Math.min(1, Math.max(0, p * 3 - i * 0.2));
          if (g <= 0) return;
          const bx = f.tx + o[0], by = f.ty + o[1];
          const top = by - T * 3.2;
          const path = () => {
            ctx.beginPath();
            ctx.moveTo(bx, top);
            for (let k = 1; k <= 5; k++) {
              const ny = top + (by - top) * (k / 5) * g;
              const nx = bx + (k === 5 ? 0 : (k % 2 ? 1 : -1) * T * (0.22 + ultRnd(k + i * 7) * 0.28));
              ctx.lineTo(nx, ny);
            }
          };
          ctx.strokeStyle = `rgba(12,18,34,${0.6 * A})`;
          ctx.lineWidth = 15 * A + 6;
          path(); ctx.stroke();
          ctx.strokeStyle = ultRGBA(f, 0.85 * A);
          ctx.lineWidth = 10 * A + 3;
          path(); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${0.99 * A})`;
          ctx.lineWidth = 4.6 * A + 1.6;
          path(); ctx.stroke();
        });
        ctx.fillStyle = `rgba(230,245,255,${0.4 * A})`;
        ctx.beginPath(); ctx.arc(f.tx, f.ty, T * (0.4 + p * 0.6), 0, 6.283); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * A})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.tx, f.ty + T * 0.15, T * (0.4 + p * 0.9), T * (0.16 + p * 0.32), 0, 0, 6.283); ctx.stroke();
        break;
      }
      /* 궁진 — 비스듬히 쏟아지는 화살비 */
      case 'arrow_rain': {
        for (let i = 0; i < 9; i++) {
          const s2 = ultRnd(i * 5.3 + f.tx * 0.3);
          const g = Math.min(1, Math.max(0, p * 2.6 - s2 * 0.5));
          if (g <= 0) continue;
          const ex = f.tx + (s2 - 0.5) * (f.r || T) * 1.2;
          const ey = f.ty + (ultRnd(i + 3.3) - 0.5) * (f.r || T) * 0.5;
          const sx = ex - T * 0.9 * (1 - g), sy = ey - T * 2.4 * (1 - g);
          ctx.strokeStyle = `rgba(40,28,10,${0.45 * A})`;
          ctx.lineWidth = 5.5;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.strokeStyle = `rgba(255,248,215,${0.95 * A})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.fillStyle = `rgba(255,236,160,${0.95 * A})`;
          ctx.beginPath(); ctx.arc(ex, ey, 2, 0, 6.283); ctx.fill();
        }
        break;
      }
      /* 포효 — 시전자에서 퍼지는 충격 고리와 먼지 */
      case 'roar_shockwave': {
        for (let i = 0; i < 4; i++) {
          const rr = T * (0.5 + p * 3.0 + i * 0.42);
          ctx.strokeStyle = `rgba(30,20,8,${(0.35 - i * 0.06) * A})`;
          ctx.lineWidth = (12 - i * 2.4) * A + 2;
          ctx.beginPath(); ctx.ellipse(f.x, f.y + T * 0.25, rr, rr * 0.55, 0, 0, 6.283); ctx.stroke();
          ctx.strokeStyle = ultRGBA(f, (0.85 - i * 0.16) * A);
          ctx.lineWidth = (7 - i * 1.6) * A + 1.5;
          ctx.beginPath(); ctx.ellipse(f.x, f.y + T * 0.25, rr, rr * 0.55, 0, 0, 6.283); ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,240,200,${0.18 * A})`;
        ctx.beginPath(); ctx.arc(f.x + T * 0.9, f.y - T * 0.7, T * (0.25 + p * 0.4), 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.arc(f.x - T * 1.0, f.y - T * 0.5, T * (0.2 + p * 0.35), 0, 6.283); ctx.fill();
        for (let i = 0; i < 8; i++) {
          const a2 = i * 0.78;
          ctx.fillStyle = `rgba(220,205,170,${0.5 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a2) * T * (0.5 + p * 1.6), f.y + Math.sin(a2) * T * (0.3 + p * 0.9), 3 * A + 1, 0, 6.283); ctx.fill();
        }
        break;
      }
      /* 왕기 — 금빛 기둥과 봉인진 */
      case 'royal_aura': {
        for (let i = 0; i < 3; i++) {
          const rr = T * (0.5 + p * 1.3 + i * 0.4);
          ctx.strokeStyle = ultRGBA(f, (0.75 - i * 0.2) * A);
          ctx.lineWidth = (5 - i) * A + 1;
          ctx.beginPath(); ctx.ellipse(f.x, f.y + T * 0.3, rr, rr * 0.4, 0, 0, 6.283); ctx.stroke();
        }
        const grd = ctx.createLinearGradient(f.x, f.y - T * 2.2, f.x, f.y + T * 0.3);
        grd.addColorStop(0, `rgba(${c},0)`);
        grd.addColorStop(0.6, `rgba(${c},${0.28 * A})`);
        grd.addColorStop(1, `rgba(255,255,230,${0.4 * A})`);
        ctx.fillStyle = grd;
        ctx.fillRect(f.x - T * 0.5, f.y - T * 2.2, T, T * 2.5);
        ctx.fillStyle = `rgba(255,248,210,${0.85 * A})`;
        ctx.font = `bold ${Math.round(T * 0.5)}px "Noto Serif CJK KR", serif`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = A * 0.95;
        ctx.fillText('王', f.x, f.y - T * 0.7 - p * T * 0.3);
        for (let i = 0; i < 10; i++) {
          const a2 = i * 0.63 + p * 2;
          ctx.fillStyle = ultRGBA(f, 0.75 * A);
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a2) * T * 0.9, f.y - p * T * 1.6 * (0.4 + ultRnd(i)), 2.4 * A + 0.8, 0, 6.283); ctx.fill();
        }
        break;
      }
      /* 수공 — 밀려오는 물결과 물보라 */
      case 'water_surge': {
        for (let i = 0; i < 3; i++) {
          const g = Math.min(1, Math.max(0, p * 2.4 - i * 0.22));
          if (g <= 0) continue;
          const rr = (f.r || T) * (0.5 + g * 1.2);
          ctx.strokeStyle = `rgba(${c},${0.75 * A})`;
          ctx.lineWidth = 8 * A + 2;
          ctx.beginPath(); ctx.ellipse(f.tx, f.ty + T * 0.2, rr, rr * 0.42, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
          ctx.strokeStyle = `rgba(230,250,255,${0.75 * A})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.ellipse(f.tx, f.ty + T * 0.2, rr, rr * 0.42, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        }
        for (let i = 0; i < 10; i++) {
          const s2 = ultRnd(i * 2.7 + f.ty);
          ctx.fillStyle = `rgba(210,245,255,${0.8 * A})`;
          ctx.beginPath();
          ctx.arc(f.tx + (s2 - 0.5) * (f.r || T) * 1.6, f.ty - Math.sin(p * 3 + i) * T * 0.5 - p * T * 0.2, 2.6 * A + 0.8, 0, 6.283);
          ctx.fill();
        }
        break;
      }
      /* 암영 — 잔상과 보랏빛 칼날 */
      case 'shadow_blade': {
        for (let i = 0; i < 4; i++) {
          const g = Math.min(1, Math.max(0, p * 3.2 - i * 0.2));
          if (g <= 0) continue;
          const ox = (i - 1.5) * T * 0.3;
          ctx.fillStyle = `rgba(${c},${0.32 * A})`;
          ctx.beginPath();
          ctx.ellipse(f.tx + ox, f.ty + T * 0.1, T * 0.3, T * 0.6, 0.3, 0, 6.283);
          ctx.fill();
          ctx.strokeStyle = ultRGBA(f, 0.85 * A);
          ctx.lineWidth = 5 * A + 1;
          ctx.beginPath();
          ctx.moveTo(f.tx + ox - T * 0.6, f.ty + T * 0.7);
          ctx.lineTo(f.tx + ox + T * 0.5 * g, f.ty - T * 0.9 * g);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(20,10,40,${0.28 * A})`;
        ctx.beginPath(); ctx.arc(f.tx, f.ty, T * (0.5 + p * 0.6), 0, 6.283); ctx.fill();
        break;
      }
      /* 창진 — 사방으로 뻗는 창날 */
      case 'spear_storm': {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const a2 = (i / n) * 6.283 + 0.4;
          const g = Math.min(1, Math.max(0, p * 2.8 - (i % 3) * 0.12));
          if (g <= 0) continue;
          const sx = f.tx, sy = f.ty;
          const ex = sx + Math.cos(a2) * T * 1.5 * g, ey = sy + Math.sin(a2) * T * 1.0 * g;
          ctx.strokeStyle = `rgba(30,24,10,${0.4 * A})`;
          ctx.lineWidth = 7 * A + 2;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.strokeStyle = ultRGBA(f, 0.95 * A);
          ctx.lineWidth = 3.6 * A + 1;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,250,${0.9 * A})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,255,240,${0.5 * A})`;
        ctx.beginPath(); ctx.arc(f.tx, f.ty, T * 0.16 * (1 - p) + 3, 0, 6.283); ctx.fill();
        break;
      }
      /* 철벽 — 방패 문양과 솟는 돌기둥 */
      case 'iron_wall': {
        const g = Math.min(1, p * 2.4);
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.strokeStyle = ultRGBA(f, 0.9 * A);
        ctx.lineWidth = 5 * A + 1.5;
        const w2 = T * 0.85 * g, h2 = T * 1.15 * g;
        ctx.beginPath();
        ctx.moveTo(-w2, -h2 * 0.55);
        ctx.lineTo(0, -h2);
        ctx.lineTo(w2, -h2 * 0.55);
        ctx.lineTo(w2, h2 * 0.3);
        ctx.lineTo(0, h2 * 0.7);
        ctx.lineTo(-w2, h2 * 0.3);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = `rgba(${c},${0.22 * A})`;
        ctx.fill();
        ctx.restore();
        for (let i = 0; i < 5; i++) {
          const s2 = ultRnd(i * 4.4 + f.y);
          const x = f.x + (s2 - 0.5) * T * 2.2;
          const hh = T * 0.5 * (0.4 + p) * (0.7 + s2);
          ctx.fillStyle = `rgba(${c},${0.55 * A})`;
          ctx.beginPath();
          ctx.moveTo(x - 6, f.y + T * 0.3); ctx.lineTo(x, f.y + T * 0.3 - hh); ctx.lineTo(x + 6, f.y + T * 0.3);
          ctx.closePath(); ctx.fill();
        }
        break;
      }
      /* 투석 — 하늘에서 떨어지는 바위와 폭발 */
      case 'stone_barrage': {
        for (let i = 0; i < 4; i++) {
          const s2 = ultRnd(i * 6.1 + f.tx * 0.2);
          const g = Math.min(1, Math.max(0, p * 2.2 - s2 * 0.35));
          if (g <= 0) continue;
          const ex = f.tx + (s2 - 0.5) * (f.r || T) * 1.1;
          const ey = f.ty + (ultRnd(i + 8.8) - 0.5) * (f.r || T) * 0.4;
          const x = ex - T * 0.5 * (1 - g), y = ey - T * 3 * (1 - g);
          ctx.strokeStyle = `rgba(255,220,160,${0.45 * A})`;
          ctx.lineWidth = 6 * A + 1;
          ctx.beginPath(); ctx.moveTo(x + T * 0.3, y - T * 0.9); ctx.lineTo(x, y); ctx.stroke();
          ctx.fillStyle = `rgba(90,74,50,${0.95 * A})`;
          ctx.beginPath(); ctx.arc(x, y, T * 0.16, 0, 6.283); ctx.fill();
          ctx.strokeStyle = `rgba(255,236,190,${0.8 * A})`;
          ctx.lineWidth = 1.4; ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255,220,150,${0.55 * A})`;
        ctx.lineWidth = 3 * A + 1;
        ctx.beginPath(); ctx.ellipse(f.tx, f.ty + T * 0.25, T * (0.5 + p * 1.1), T * (0.2 + p * 0.4), 0, 0, 6.283); ctx.stroke();
        break;
      }
      /* 화무 — 흩날리는 꽃잎 */
      case 'petal_dance': {
        for (let i = 0; i < 12; i++) {
          const s2 = ultRnd(i * 3.9 + f.tx * 0.4);
          const a2 = s2 * 6.283 + p * 2.4;
          const rr = T * (0.3 + p * 1.0) * (0.6 + s2);
          const x = f.tx + Math.cos(a2) * rr, y = f.ty + Math.sin(a2) * rr * 0.7 - p * T * 0.6;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a2 + p * 3);
          ctx.fillStyle = ultRGBA(f, 0.85 * A);
          ctx.beginPath(); ctx.ellipse(0, 0, 4.5 * A + 1.5, 2.4 * A + 0.8, 0, 0, 6.283); ctx.fill();
          ctx.restore();
        }
        break;
      }
      /* 독무 — 피어오르는 안개와 기포 */
      case 'poison_mist': {
        for (let i = 0; i < 7; i++) {
          const s2 = ultRnd(i * 8.3 + f.ty);
          const rr = (f.r || T) * (0.3 + p * 0.8) * (0.5 + s2);
          ctx.fillStyle = ultRGBA(f, 0.16 * A);
          ctx.beginPath();
          ctx.arc(f.tx + (s2 - 0.5) * (f.r || T) * 1.2, f.ty - p * T * 0.5 - s2 * T * 0.3, rr, 0, 6.283);
          ctx.fill();
        }
        for (let i = 0; i < 8; i++) {
          const s2 = ultRnd(i * 1.7 + f.tx);
          ctx.fillStyle = ultRGBA(f, 0.8 * A);
          ctx.beginPath();
          ctx.arc(f.tx + (s2 - 0.5) * (f.r || T), f.ty - p * T * (0.4 + s2 * 0.8), 2.2 * A + 0.7, 0, 6.283);
          ctx.fill();
        }
        break;
      }
      /* 풍격 — 휘몰아치는 바람 줄기 */
      case 'wind_gale': {
        for (let i = 0; i < 5; i++) {
          const g = Math.min(1, Math.max(0, p * 2.6 - i * 0.15));
          if (g <= 0) continue;
          ctx.strokeStyle = ultRGBA(f, (0.7 - i * 0.1) * A);
          ctx.lineWidth = 3.4 * A + 1;
          ctx.beginPath();
          for (let k = 0; k <= 10; k++) {
            const u = k / 10;
            const x = f.x + (f.tx - f.x) * u;
            const y = f.y + (f.ty - f.y) * u + Math.sin(u * 6 + p * 8 + i) * T * 0.22;
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255,255,245,${0.5 * A})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(f.tx, f.ty, T * (0.35 + p * 0.9), 0, 6.283); ctx.stroke();
        break;
      }
      /* 철기 — 흙먼지와 말발굽 궤적 */
      case 'beast_charge': {
        for (let i = 0; i < 6; i++) {
          const u = (i + 1) / 7;
          const px = f.x + dx * u, py = f.y + dy * u;
          const g = Math.min(1, Math.max(0, p * 2.4 - i * 0.12));
          if (g <= 0) continue;
          ctx.fillStyle = `rgba(226,208,172,${0.4 * A})`;
          ctx.beginPath(); ctx.ellipse(px, py + T * 0.28, T * 0.28 * g, T * 0.1 * g, 0, 0, 6.283); ctx.fill();
          ctx.strokeStyle = ultRGBA(f, 0.55 * A);
          ctx.lineWidth = 2.4 * A + 1;
          ctx.beginPath(); ctx.moveTo(px - T * 0.25, py); ctx.lineTo(px + T * 0.25, py); ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255,255,240,${0.85 * A})`;
        ctx.lineWidth = 8 * A + 2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y - T * 0.2);
        ctx.lineTo(f.x + dx * Math.min(1, p * 1.4), f.y + dy * Math.min(1, p * 1.4) - T * 0.2);
        ctx.stroke();
        break;
      }
      default: {
        ctx.strokeStyle = ultRGBA(f, 0.8 * A);
        ctx.lineWidth = 4 * A + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, T * (0.3 + p * 1.2), 0, 6.283); ctx.stroke();
      }
    }
  }

  /* 필살기 전용 말풍선 — 장수 머리 위에 초상·이름·필살기·대사를 띄운다 (화면 좌표) */
  function ultWrapText(text, maxW, maxLines) {
    const out = [];
    if (!text) return out;
    const words = String(text).split(' ');
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = words[i];
        if (out.length >= maxLines) break;
      } else line = test;
    }
    if (out.length < maxLines && line) out.push(line);
    /* 넘치면 마지막 줄만 …로 줄인다 */
    if (out.join(' ').length < String(text).length) {
      let last = out[maxLines - 1] || '';
      while (last.length > 2 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      out[maxLines - 1] = last.replace(/[\s,·—-]+$/, '') + '…';
    }
    return out.slice(0, maxLines);
  }
  function roundRect2(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawUltBubble(w, h) {
    if (!ultShout || !B || !ctx) return;
    const u = B.units.find((o) => o.id === ultShout.uid);
    if (!u) return;
    const t = ultShout.t;
    /* v5.54 — 컷인(0~1.3초)이 먼저 지나가고, 말풍선은 0.55초에 나타나 1.75초에 사라진다 */
    const inP = Math.max(0, Math.min(1, (t - 550) / 200));
    const outP = Math.min(1, Math.max(0, (ultShout.life - t) / 240));
    const a = Math.min(inP, outP);
    if (a <= 0.02) return;
    ultBubbleFrames += 1;
    const cx = (rxOf(u) + 0.5) * TILE * cam.s + cam.x;
    const headY = (ryOf(u) + 0.05) * TILE * cam.s + cam.y - TILE * 1.15 * cam.s;
    const c = ultShout.c || '255,220,140';
    const pad = 7;
    const bw = Math.min(w - 16, 232);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 12px "Noto Serif CJK KR", serif';
    ctx.font = '10px "Noto Sans CJK KR", sans-serif';
    const qLines = ultWrapText(ultShout.q, bw - pad * 2, 2);
    const bh = pad * 2 + 24 + (qLines.length ? qLines.length * 12 + 4 : 0);
    let bx = cx - bw / 2;
    bx = Math.max(6, Math.min(w - bw - 6, bx));
    let by = headY - bh - 10;
    if (by < 6) by = 6;
    /* 몸통 */
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    roundRect2(bx, by, bw, bh, 9);
    ctx.fillStyle = 'rgba(26,19,8,0.95)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${c},0.95)`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    /* 꼬리 — 장수 머리를 가리킨다 */
    const tailX = Math.max(bx + 14, Math.min(bx + bw - 14, cx));
    const baseY = by + bh;
    ctx.beginPath();
    ctx.moveTo(tailX - 7, baseY - 1);
    ctx.lineTo(tailX, Math.min(baseY + 10, headY - 2));
    ctx.lineTo(tailX + 6, baseY - 1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(26,19,8,0.95)';
    ctx.fill();
    ctx.strokeStyle = `rgba(${c},0.95)`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(tailX - 7, baseY);
    ctx.lineTo(tailX, Math.min(baseY + 10, headY - 2));
    ctx.lineTo(tailX + 6, baseY);
    ctx.stroke();
    /* 이름 · 필살기 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 9.5px "Noto Sans CJK KR", sans-serif';
    ctx.fillStyle = '#e8d9b4';
    ctx.fillText(ultShout.name, bx + bw / 2, by + pad + 9);
    ctx.font = 'bold 13.5px "Noto Serif CJK KR", serif';
    ctx.fillStyle = `rgb(${c})`;
    ctx.fillText(`「${ultShout.n}」`, bx + bw / 2, by + pad + 25);
    /* 대사 */
    if (qLines.length) {
      ctx.font = '10px "Noto Sans CJK KR", sans-serif';
      ctx.fillStyle = '#f0e4c6';
      ctx.textAlign = 'left';
      qLines.forEach((ln, i) => ctx.fillText(ln, bx + pad, by + pad + 38 + i * 12));
    }
    ctx.restore();
  }

  /* v5.27 — 고유특기 이름·오라 문구는 부대보다 먼저 그린다.
     부대 병력 라벨과 스프라이트가 위에 올라와 문구가 라벨을 덮지 않는다. (월드 좌표) */
  function drawBackFloats() {
    const zs = Math.max(0.3, cam.s);
    floats.forEach((f) => {
      if (!f.back) return;
      const p = f.t / f.life;
      const x = f.x, y = f.y - TILE * 2.0 - (p * 20) / zs;
      ctx.save();
      ctx.globalAlpha = (1 - p * 0.7) * 0.9;
      ctx.font = `bold ${Math.round(11 / zs)}px "Noto Serif CJK KR", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4 / zs;
      ctx.strokeStyle = 'rgba(24,18,8,0.85)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color || '#fff2c8';
      ctx.fillText(f.text, x, y);
      ctx.restore();
    });
  }

  function drawFloats() {
    floats.forEach((f) => {
      if (f.back) return;
      const p = f.t / f.life;
      const sx = f.x * cam.s + cam.x, sy = f.y * cam.s + cam.y - p * 38;
      ctx.save();
      ctx.globalAlpha = 1 - p * 0.85;
      /* v5.26 — 고유 특기 이름(「…」)은 숫자보다 작게 그린다. 17px 고정이라 전장 한가운데를 크게 가렸다 */
      const isName = f.text.indexOf('「') >= 0;
      ctx.font = isName ? 'bold 11.5px "Noto Serif CJK KR", serif' : 'bold 17px "Noto Serif CJK KR", serif';
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
          const cost = moveCost(u.cls, B.tiles[ny][nx], nx, ny, u.side, u);
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

  /* v5.31 — 조각배 승선/하선. 물에 들어서면 물보라와 함께 배로 바뀌고, 뭍에 닿으면 내린다. */
  function waterTileAt(x, y) {
    const row = B && B.tiles ? B.tiles[y] : null;
    return !!(row && row[x] === 'W');
  }
  function syncBoat(u) {
    if (!B || !u || !u.alive) return;
    const wet = !!B.boatable && waterTileAt(u.x, u.y) && u.cls !== 'sujeok';
    if (wet === !!u.aboard) return;
    u.aboard = wet;
    const cx = (u.x + 0.5) * TILE, cy = (u.y + 0.92) * TILE;
    addFx({ kind: 'splash', x: cx, y: cy, life: 520 });
    addFloat(cx, cy - TILE * 1.1, wet ? '승선' : '하선', wet ? '#bfe8ff' : '#dfe9b0');
    feed(`${u.name} ${wet ? '조각배에 올랐습니다' : '뭍에 올랐습니다'}`, 'info');
    SK.sfx.play('step');
  }
  SK.boatSync = function () { if (B) B.units.forEach(syncBoat); };

  function animatePath(u, path, opts) {
    opts = opts || {};
    const done = opts.onDone || function () { };
    if (!path || !path.length) { done(); return; }
    u.rx = u.x; u.ry = u.y;
    /* v5.51 — 보폭은 dt(프레임) 쪽에서 ÷배속되므로 여기서는 원래 ms를 그대로 넣는다.
       (양쪽에 모두 나누면 서로 상쇄돼 연출이 빨라지지 않는다) */
    anims.push({ kind: 'walk', u, path, i: 0, t: 0, dur: opts.step || 105, cam: !!opts.cam, done });
  }

  function updateAnims(dt) {
    for (let k = anims.length - 1; k >= 0; k--) {
      const a = anims[k];
      a.t += dt;
      if (a.kind === 'walk') {
        if (a.i >= a.path.length) { a.u.rx = a.u.x; a.u.ry = a.u.y; anims.splice(k, 1); a.done(); continue; }
        /* v5.51 — 배속 ×3·×4에서는 한 프레임에 두 칸 이상 지나간다. 예전것은 프레임마다
           1칸만 넘겨서, 프레임이 느린 기기·헤드리스에서 걸음이 배속을 못 따라갔다.
           남은 시간(a.t)만큼 칸을 이어서 넘기고, 남은 시간은 버리지 않고 다음 칸에 쓴다. */
        let stepped = 0;
        while (a.t >= a.dur && a.i < a.path.length && stepped < 40) {
          const s = a.path[a.i];
          a.t -= a.dur;
          a.u.x = s[0]; a.u.y = s[1];
          a.u.rx = a.u.x; a.u.ry = a.u.y;
          syncBoat(a.u);
          a.i += 1; stepped += 1;
        }
        if (stepped) {
          addFx({ kind: 'step', x: (a.u.x + 0.5) * TILE, y: (a.u.y + 0.95) * TILE, life: 300 });
          SK.sfx.play('step');
        }
        if (a.i >= a.path.length) {
          a.u.rx = a.u.x; a.u.ry = a.u.y;
          anims.splice(k, 1);
          addFx({ kind: 'dust', x: (a.u.x + 0.5) * TILE, y: (a.u.y + 0.9) * TILE, life: 430 });
          a.done();
          continue;
        }
        const seg = a.path[a.i];
        const from = a.i === 0
          ? { x: a.path.length ? a.u.rx : a.u.x, y: a.path.length ? a.u.ry : a.u.y }
          : { x: a.path[a.i - 1][0], y: a.path[a.i - 1][1] };
        const p = Math.min(1, a.t / a.dur);
        a.u.rx = from.x + (seg[0] - from.x) * p;
        a.u.ry = from.y + (seg[1] - from.y) * p;
        if (a.cam) followCam(a.u);
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
    /* v5.51 — 피드 글자는 배속이 높아도 읽을 수 있게 최소 1.2초는 남긴다 */
    wait(() => { d.classList.remove('in'); wait(() => d.remove(), 260); }, Math.max(1200, paceMs(3800)));
    while (el.children.length > 3) el.firstChild.remove();
  }

  /* v5.0.1 — [공격]·[책략]을 누르면 사거리 안의 대상을 버튼으로 보여 준다 */
  function renderTargetBar() {
    const tb = $('#battle-targets');
    if (!tb) return;
    const u = B && B.sel;
    const isUlt = mode === 'ultTarget';
    const active = B && B.phase === 'ally' && !B.over && u && !u.acted && (mode === 'attack' || mode === 'skillTarget' || isUlt);
    if (!active) { tb.hidden = true; tb.innerHTML = ''; return; }
    if (isUlt) {
      /* v5.54 — 필살기: 사거리 안 적을 칩으로 보여 주고, 누르면 바로 시전 */
      const spec = ultOf(u);
      const urg = spec ? ultRange(u, spec) : 1;
      const list = spec ? B.units.filter((t) => t.alive && t.side !== u.side && manh(u.x, u.y, t.x, t.y) <= urg) : [];
      tb.hidden = false;
      if (!list.length) { tb.innerHTML = `<span class="bt-hint">필살기 사거리 ${urg}칸 안에 적이 없습니다 — 한 칸 더 붙으세요</span>`; return; }
      tb.innerHTML = `<span class="bt-hint">「${spec.n}」 대상</span>` + list.map((t) => `<button class="bt-chip ${t.side}" data-id="${t.id}"><b>${t.name}</b><em>${Math.round(t.hp).toLocaleString('ko-KR')}</em></button>`).join('');
      tb.querySelectorAll('.bt-chip').forEach((b) => {
        b.onclick = () => { const t = B.units.find((x) => x.id === b.dataset.id); if (t && spec) castUlt(u, spec, t); };
      });
      return;
    }
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
      tb.innerHTML = `<span class="bt-hint">${heal ? '사거리 안 아군' : `사거리 ${rng}칸 안에 적`}이 없습니다 — 한 칸 더 붙으세요</span>`;
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
    calloutTimer = wait(() => el.classList.remove('show'), Math.max(700, paceMs(1750)));
  }

  function shakeScreen(amp) { shakeAmp = amp || 5; shakeT = 240; }

  /* ══════════════════════════════════════════════════════════════
     v5.30 — 조조전식 일기토 컷인
     · 이름 있는 장수(아군 장수·적 명장/적장)끼리 근접으로 맞붙을 때만
     · 한 판에 3번까지, 같은 상대와는 한 번만 — 남발하지 않는다
     · 배속 ×4에서는 180ms 안쪽으로 줄어 템포를 깨지 않는다
     ══════════════════════════════════════════════════════════════ */
  let duelTimer = 0;
  function duelCutin(a, d) {
    if (!B || !a || !d) return false;
    /* v5.33 — 일기토는 '살아 있는 서로 다른 편'의 교전에서만.
       혼란에 빠진 부대가 아군을 칠 때 관우 ↔ 유비 같은 컷인이 뜨던 문제(사용자 제보)를 막는다. */
    if (a === d || a.side === d.side || !a.alive || !d.alive) return false;
    const el = document.getElementById('duel-cutin');
    if (!el) return false;
    /* v5.30 — '일기토'는 이름 있는 장수끼리만. 무명 수비대장(재야 수비대장 등)은 뺀다 */
    const isNamed = (u) => !!u && (!!u.uid || !!u.genId || (!!u.boss && !/대장$/.test(String(u.name || ''))));
    const aNamed = isNamed(a);
    const dNamed = isNamed(d);
    if (!aNamed || !dNamed) return false;
    const now = performance.now();
    B.duels = B.duels || { n: 0, last: 0, seen: {} };
    const key = [a.name, d.name].sort().join('|');
    if (B.duels.n >= 3 || now - B.duels.last < 1000 || B.duels.seen[key]) return false;
    B.duels.seen[key] = 1; B.duels.n += 1; B.duels.last = now;
    const bond = SK.bondBetween ? SK.bondBetween(a.name, d.name) : null;
    const rival = !!(bond && bond.relation === '숙적');
    const imgA = el.querySelector('#dc-img-a'), imgB = el.querySelector('#dc-img-b');
    const nmA = el.querySelector('#dc-name-a'), nmB = el.querySelector('#dc-name-b');
    const subEl = el.querySelector('#dc-sub');
    imgA.src = SK.ptSrc ? SK.ptSrc(a.portrait) : a.portrait;
    imgB.src = SK.ptSrc ? SK.ptSrc(d.portrait) : d.portrait;
    SK.paintTier(imgA.parentElement, ptTier(a));
    SK.paintTier(imgB.parentElement, ptTier(d));
    nmA.textContent = a.name; nmB.textContent = d.name;
    if (subEl) subEl.textContent = rival ? `숙적 · ${bond.title}` : '장수 맞대결';
    el.classList.toggle('rival', rival);
    const dur = Math.max(180, paceMs(720));
    el.style.setProperty('--dcs', (dur / 720).toFixed(2));
    el.hidden = false;
    const stageEl = document.getElementById('battle-stage');
    if (stageEl) stageEl.classList.add('dueling');
    el.classList.remove('out', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(duelTimer);
    duelTimer = wait(() => {
      el.classList.add('out');
      wait(() => {
        el.classList.remove('show', 'out'); el.hidden = true;
        if (stageEl) stageEl.classList.remove('dueling');
      }, Math.max(80, paceMs(200)));
    }, dur);
    SK.sfx.play('drum');
    shakeScreen(4);
    feed(`${a.name} ↔ ${d.name} — 일기토`, 'rival');
    return true;
  }

  /* ══════════════════════════════════════════════════════════════
     v5.52 — 고퀄 1:1 일기토 미니게임 (사용자 확정 사양)
     · 이름 있는 장수끼리 근접 교전에서 벌어진다 — 확률은 두 장수의 무력으로 가중(2~7%, v5.53) (아군이 거는 공격만)
       한 판에 3번까지 · 같은 상대와는 한 번만
     · HP 100 대 100 · 최대 5턴 · 5가지 수의 가위바위보
       ⚔️강공 → 💨속공·👁️간파 / 💨속공 → 👁️간파·🔥필살 / 👁️간파 → 🔥필살·🛡️방어
       🔥필살 → 🛡️방어·⚔️강공 / 🛡️방어 → ⚔️강공·💨속공
     · 무장은 무력, 문관(책사·도사·풍수·무희·군악)은 지력으로 공격하고, 통솔로 피해를 덜어낸다
     · 승리 = 사기 +18 + 본대 병력 10% 회복 · 패배 = 10% 붕괴(생포) / 90% 사기 −22
     · 빨리 감기 ×3·×4나 자동전투에서는 연출과 진행이 함께 짧아진다
     ══════════════════════════════════════════════════════════════ */
  /* v5.53 — 일기토 발동 확률은 '두 장수의 무력'에 따라 달라진다 (사용자: "무력이 높을수록 일기토 확률 가중치").
     · 기본 2.5% + (두 무력 평균 − 50) × 0.08%p, 2%~7%로 자른다.
       관우·여포·장비 같은 고무력 맞대결 ≈ 5.5~6.5%, 책사·풍수사처럼 낮은 무력끼리는 2%.
     · duelRate 는 검수용 고정값 — null 이면 무력 가중치를 쓴다. */
  const DUEL_RATE_BASE = 0.025;
  let duelRate = null;   // 검수에서 고정 확률을 넣을 때만 쓴다
  function duelChance(a, d) {
    if (duelRate != null) return duelRate;
    const avg = ((Number(a && a.wu) || 50) + (Number(d && d.wu) || 50)) / 2;
    return clamp(DUEL_RATE_BASE + (avg - 50) * 0.0008, 0.02, 0.07);
  }
  const DUEL_TURNS = 5;
  const DUEL_MAX_HP = 100;
  /* 문관 계열 — 공격에 지력을 쓴다 */
  const DUEL_INT_CLS = { chaeksa: 1, pungsusa: 1, dosa: 1, muhui: 1, gunakdae: 1 };
  const DUEL_MOVES = [
    { k: 'strike', ico: '⚔️', name: '강공', fx: '황금 대참격', beats: ['speed', 'read'], short: '속공·간파 승' },
    { k: 'speed', ico: '💨', name: '속공', fx: '청록 연참', beats: ['read', 'kill'], short: '간파·필살 승' },
    { k: 'read', ico: '👁️', name: '간파', fx: '보라 역습', beats: ['kill', 'guard'], short: '필살·방어 승' },
    { k: 'kill', ico: '🔥', name: '필살', fx: '화염 폭발', beats: ['guard', 'strike'], short: '방어·강공 승' },
    { k: 'guard', ico: '🛡️', name: '방어', fx: '금빛 파동', beats: ['strike', 'speed'], short: '강공·속공 승' },
  ];
  const DUEL_MOVE_BY = {};
  DUEL_MOVES.forEach((m) => { DUEL_MOVE_BY[m.k] = m; });
  /* 수 아이콘 — 어떤 폰에서도 같은 모양이 나오게 이모지 대신 SVG로 그린다 */
  const DUEL_ICONS = {
    strike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l13 13"/><path d="M4 4v3.4M4 4h3.4"/><path d="M20 4L7 17"/><path d="M20 4v3.4M20 4h-3.4"/><path d="M15.6 18.4L18.4 21.6M8.4 18.4L5.6 21.6" stroke-width="2"/></svg>',
    speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 7h11.5a3.2 3.2 0 100-6.4"/><path d="M3 12h14.5"/><path d="M3 17h9.5a3 3 0 110 6"/></svg>',
    read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M2.4 12S6.4 5.6 12 5.6 21.6 12 21.6 12 17.6 18.4 12 18.4 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="3.1" fill="currentColor" stroke="none"/></svg>',
    kill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.6 2c.4 3.2 2.3 4.3 3.6 6.4 1.6 2.6 2.4 4.2 2.4 6.6a6.6 6.6 0 11-13.2 0c0-2 .8-3.3 2-4.8.5 1.3 1.1 2 2.1 2.7-.3-2.4.4-5.4 3.1-7.6-.4 2 .3 3 1.2 3.7.3-2 .1-4.3-1.2-7z"/></svg>',
    guard: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.8l8.2 3v7.1c0 5-3.5 8.4-8.2 10.3C7.3 20.3 3.8 16.9 3.8 11.9V4.8l8.2-3z"/><path d="M12 5.4l5 1.9v4.7c0 3.2-2.1 5.4-5 6.7-2.9-1.3-5-3.5-5-6.7V7.3l5-1.9z" fill="#fff9ec" opacity="0.85"/></svg>',
  };
  /* 장수 말풍선 — 성격(무력·지력)과 세력에 맞춰 고른다 */
  const DUEL_TALK = {
    호장: {
      start: ['어디, 한번 붙어 보자!', '칼끝으로 말하겠다!', '물러서면 내가 아니다!'],
      clashWin: ['이맛이야!', '한 수 배웠나?', '아직 멀었다!'],
      clashLose: ['크윽—!', '제법이군…', '아직 안 끝났다!'],
      victory: ['천하에 내 이름을 새겼다!', '일합에 끝났군!', '이것이 무인의 길이다!'],
      defeat: ['이런… 내가 지다니!', '한 수 접어 주지…', '다음엔 다를 것이다!'],
      collapse: ['으윽… 부하들에게 미안하다…', '내 목을 가져라!'],
    },
    지장: {
      start: ['힘만으로 되는 싸움은 아닙니다.', '허를 찌르겠습니다.', '한 수 읽히지 않겠습니까?'],
      clashWin: ['보시다시피, 읽혔습니다.', '지략은 힘을 이깁니다.', '한 발 앞서 있었습니다.'],
      clashLose: ['이런… 계산이 틀렸나.', '흠, 제법이군요.', '아직 판이 남았습니다.'],
      victory: ['지혜가 칼을 이겼습니다.', '예견한 그대로입니다.', '이것이 승산입니다.'],
      defeat: ['제 판단이 얕았습니다.', '허를 내줬군요…', '다시 만나면 다를 겁니다.'],
      collapse: ['이럴 수가… 내 계획이…', '여기서 무너지다니…'],
    },
    명장: {
      start: ['명예를 걸고 겨루겠다.', '좋은 상대를 만났군.', '한 판, 정정당당히!'],
      clashWin: ['좋은 일격이었다!', '한 걸음 앞섰군.', '아직 내가 위다.'],
      clashLose: ['훌륭하군…', '제법인데?', '한 번 더!'],
      victory: ['승부는 났다.', '이만하면 이름값을 했다.', '부하들이 보고 있다 — 이겼다!'],
      defeat: ['나의 패배다.', '뜻밖의 상대였군…', '이름을 잃었구나…'],
      collapse: ['부디… 살려 주게…', '여기까지인가…'],
    },
  };
  const DUEL_FACTION_START = {
    위: ['위군의 위엄을 보여 주마!', '이 길을 열어라!'],
    촉: ['의로써 겨루겠다!', '형제들이 지켜보고 있다!'],
    오: ['오의 노련함을 알려 주지.', '오래 버틴 자가 이긴다.'],
    군웅: ['이 난세, 내가 주인이다!', '목숨을 걸고 붙자!'],
    한국: ['이 땅의 기개를 보여 주마!', '이름을 걸고 싸운다!'],
  };
  /* 수마다 다른 타격 연출 — CSS(.duel-fx-item.fx-*)가 움직인다 */
  const DUEL_FX_SVG = {
    strike: `<svg viewBox="0 0 200 200" aria-hidden="true">
      <defs><radialGradient id="dvGold" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff8d6" stop-opacity="0.95"/><stop offset="48%" stop-color="#ffb42b" stop-opacity="0.6"/><stop offset="100%" stop-color="#ff4a12" stop-opacity="0"/></radialGradient></defs>
      <circle cx="100" cy="100" r="74" fill="url(#dvGold)"/>
      <path d="M18,168 Q104,78 188,18 Q120,98 40,182 Z" fill="#fff9d6" stroke="#ff9410" stroke-width="5"/>
      <path d="M8,120 Q88,84 176,44 Q104,100 20,140 Z" fill="#ffd95a" opacity="0.85"/>
      <circle cx="52" cy="52" r="5" fill="#fff4b8"/><circle cx="156" cy="146" r="6" fill="#ffcf4d"/><circle cx="148" cy="40" r="4" fill="#fff"/>
    </svg>`,
    speed: `<svg viewBox="0 0 200 200" aria-hidden="true">
      <defs><radialGradient id="dvTeal" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#e8fff8" stop-opacity="0.9"/><stop offset="60%" stop-color="#37e0c0" stop-opacity="0.35"/><stop offset="100%" stop-color="#0f8f8a" stop-opacity="0"/></radialGradient></defs>
      <circle cx="100" cy="100" r="70" fill="url(#dvTeal)"/>
      <path class="dv-s1" d="M140,26 Q86,74 34,150" fill="none" stroke="#dffff8" stroke-width="7" stroke-linecap="round"/>
      <path class="dv-s2" d="M172,58 Q110,92 62,162" fill="none" stroke="#5ef0d2" stroke-width="6" stroke-linecap="round"/>
      <path class="dv-s3" d="M182,104 Q126,120 86,172" fill="none" stroke="#a8fff0" stroke-width="5" stroke-linecap="round"/>
      <circle cx="60" cy="52" r="4" fill="#eafffb"/><circle cx="142" cy="120" r="4.5" fill="#bafff2"/>
    </svg>`,
    read: `<svg viewBox="0 0 200 200" aria-hidden="true">
      <defs><radialGradient id="dvPur" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f4e6ff" stop-opacity="0.95"/><stop offset="55%" stop-color="#a45cff" stop-opacity="0.45"/><stop offset="100%" stop-color="#4a1a9c" stop-opacity="0"/></radialGradient></defs>
      <circle cx="100" cy="100" r="72" fill="url(#dvPur)"/>
      <circle class="dv-ring" cx="100" cy="100" r="52" fill="none" stroke="#d9b7ff" stroke-width="5" stroke-dasharray="18 10"/>
      <path class="dv-bolt" d="M100,14 L114,84 L186,100 L114,118 L100,188 L86,118 L14,100 L86,84 Z" fill="#9b5cff" stroke="#5b1fa8" stroke-width="4" opacity="0.85"/>
      <circle cx="100" cy="100" r="19" fill="#fffdf2"/>
    </svg>`,
    kill: `<svg viewBox="0 0 200 200" aria-hidden="true">
      <defs><radialGradient id="dvFire" cx="50%" cy="55%" r="55%">
        <stop offset="0%" stop-color="#fffbe0" stop-opacity="0.98"/><stop offset="35%" stop-color="#ffd245" stop-opacity="0.9"/>
        <stop offset="68%" stop-color="#ff6a12" stop-opacity="0.6"/><stop offset="100%" stop-color="#8f1400" stop-opacity="0"/></radialGradient></defs>
      <circle cx="100" cy="102" r="90" fill="#6b1500" opacity="0.5"/>
      <circle cx="100" cy="102" r="80" fill="url(#dvFire)"/>
      <path class="dv-flame" d="M100,22 Q128,64 118,92 Q146,84 136,122 Q158,134 128,170 Q104,190 74,168 Q44,148 58,116 Q42,82 74,90 Q62,54 100,22 Z" fill="#ff6a00" stroke="#5c1300" stroke-width="5"/>
      <path d="M100,60 Q120,88 112,110 Q134,106 126,138 Q112,164 88,148 Q66,130 78,106 Q64,82 100,60 Z" fill="#ffd24a"/>
      <circle cx="100" cy="116" r="18" fill="#fffdf2"/>
      <circle cx="52" cy="52" r="5" fill="#fff3b8"/><circle cx="156" cy="62" r="6" fill="#ffb347"/><circle cx="150" cy="158" r="5" fill="#ffe6a0"/>
    </svg>`,
    guard: `<svg viewBox="0 0 200 200" aria-hidden="true">
      <defs><radialGradient id="dvShield" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fffdf0" stop-opacity="0.9"/><stop offset="58%" stop-color="#ffd878" stop-opacity="0.42"/><stop offset="100%" stop-color="#a06a08" stop-opacity="0"/></radialGradient></defs>
      <circle cx="100" cy="100" r="74" fill="url(#dvShield)"/>
      <path d="M100,32 L154,55 Q154,121 100,170 Q46,121 46,55 Z" fill="#fff3d0" opacity="0.42" stroke="#7a5200" stroke-width="5"/>
      <path class="dv-rip1" d="M100,20 L166,48 Q166,126 100,184 Q34,126 34,48 Z" fill="none" stroke="#fff0c0" stroke-width="4"/>
      <path class="dv-rip2" d="M100,52 L142,70 Q142,120 100,154 Q58,120 58,70 Z" fill="none" stroke="#ffd45e" stroke-width="3"/>
      <circle cx="100" cy="100" r="10" fill="#fffdf0"/>
    </svg>`,
  };

  let duel = null;      // 진행 중인 일기토 상태
  let duelEls = null;

  function namedUnit(u) { return !!u && (!!u.uid || !!u.genId || (!!u.boss && !/대장$/.test(String(u.name || '')))); }

  function duelAtkStat(u) {
    if (!u) return 60;
    return DUEL_INT_CLS[u.cls] ? (u.ji || 60) : (u.wu || 60);
  }
  function duelDamage(atkU, defU) {
    const atk = duelAtkStat(atkU);
    const def = Math.max(20, Math.min(110, (defU && defU.tong) || 60));
    const base = (10 + atk * 0.24) * (1 - def * 0.0022);
    return Math.max(6, Math.round(base * (0.88 + Math.random() * 0.24)));
  }
  function duelArch(u) {
    if (!u) return '명장';
    if (DUEL_INT_CLS[u.cls]) return '지장';
    if ((u.wu || 0) >= 90) return '호장';
    return '명장';
  }
  function duelTalk(u, moment) {
    const g = SK.GEN_BY_NAME ? SK.GEN_BY_NAME[u.name] : null;
    if (moment === 'start' && g && DUEL_FACTION_START[g.faction] && Math.random() < 0.55) {
      const f = DUEL_FACTION_START[g.faction];
      return f[Math.floor(Math.random() * f.length)];
    }
    const pool = (DUEL_TALK[duelArch(u)] || {})[moment] || [];
    if (!pool.length) return '';
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function duelAiPick(u) {
    if (duel && duel.forceAi) { const k = duel.forceAi; duel.forceAi = null; return k; }
    const pref = DUEL_INT_CLS[u && u.cls] ? ['read', 'guard', 'kill']
      : ((u && u.wu >= 90) ? ['strike', 'kill'] : ['strike', 'guard', 'speed']);
    const w = DUEL_MOVES.map((m) => (pref.indexOf(m.k) >= 0 ? 1.7 : 1));
    let total = w.reduce((x, y) => x + y, 0);
    let r = Math.random() * total;
    for (let i = 0; i < DUEL_MOVES.length; i++) { r -= w[i]; if (r <= 0) return DUEL_MOVES[i].k; }
    return 'strike';
  }
  /* 일기토 연출 시계 — 전투 배속이 빠르면 연출도 함께 짧아진다 */
  let duelFast = false;   // QA 전용: 연출 없이 즉시 진행
  function dwait(fn, ms) {
    if (duelFast) return setTimeout(fn, 0);
    const sp = autoSpeed || 1;
    const k = sp >= 3 ? 0.55 : (sp === 2 ? 0.75 : 1);
    return setTimeout(fn, Math.max(90, Math.round(ms * k)));
  }

  function ensureDuelDom() {
    if (duelEls && document.body.contains(duelEls.root)) return duelEls;
    try { const pre = new Image(); pre.src = 'assets/duel_arena_bg.webp'; } catch (e) { /* ignore */ }
    const root = document.createElement('div');
    root.id = 'duel-arena';
    root.className = 'duel-arena';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '일기토');
    root.innerHTML = `
      <div class="duel-top">
        <span class="duel-badge"><i class="dbl-ic">${DUEL_ICONS.strike}</i>일기토 1:1</span>
        <span class="duel-turn" id="duel-turn">1 / ${DUEL_TURNS}턴</span>
        <button type="button" class="duel-auto" id="duel-auto">⚡ 자동</button>
      </div>
      <div class="duel-hud">
        <div class="duel-card ally">
          <div class="dc-head"><img id="duel-pt-a" alt="" /><div><b id="duel-name-a"></b><em id="duel-role-a"></em></div></div>
          <div class="dc-hp"><div class="dc-hp-label"><span>HP</span><span id="duel-hp-txt-a">100 / 100</span></div><div class="dc-hp-bar"><i id="duel-hp-a"></i></div></div>
        </div>
        <div class="duel-vs">VS</div>
        <div class="duel-card enemy">
          <div class="dc-head"><img id="duel-pt-d" alt="" /><div><b id="duel-name-d"></b><em id="duel-role-d"></em></div></div>
          <div class="dc-hp"><div class="dc-hp-label"><span>HP</span><span id="duel-hp-txt-d">100 / 100</span></div><div class="dc-hp-bar"><i id="duel-hp-d"></i></div></div>
        </div>
      </div>
      <div class="duel-stage" id="duel-stage">
        <div class="duel-banner" id="duel-banner"><b></b><span></span></div>
        <div class="duel-sprite ally"><span class="duel-bubble" id="duel-bub-a" hidden></span><img id="duel-sp-a" alt="" /></div>
        <div class="duel-sprite enemy"><span class="duel-bubble" id="duel-bub-d" hidden></span><img id="duel-sp-d" alt="" /></div>
        <div class="duel-fx" id="duel-fx"></div>
        <span class="duel-dmg a" id="duel-dmg-a"></span>
        <span class="duel-dmg d" id="duel-dmg-d"></span>
      </div>
      <div class="duel-panel">
        <div class="duel-hint">수마다 고유 타격 · 무장=무력 / 문관=지력 / 통솔=방어</div>
        <div class="duel-cmds" id="duel-cmds">${DUEL_MOVES.map((m) => `<button type="button" class="duel-cmd" data-k="${m.k}"><span class="dcmd-ico">${DUEL_ICONS[m.k]}</span><b>${m.name}</b><span>${m.short}</span></button>`).join('')}</div>
        <div class="duel-reward">승리: 사기 +18 · 본대 병력 10% 회복 · 패배: 10% 붕괴(생포) / 90% 사기 −22</div>
      </div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    duelEls = {
      root,
      stage: q('#duel-stage'), turn: q('#duel-turn'), auto: q('#duel-auto'),
      banner: q('#duel-banner'), bannerB: q('#duel-banner b'), bannerS: q('#duel-banner span'),
      ptA: q('#duel-pt-a'), ptD: q('#duel-pt-d'),
      nameA: q('#duel-name-a'), nameD: q('#duel-name-d'),
      roleA: q('#duel-role-a'), roleD: q('#duel-role-d'),
      hpA: q('#duel-hp-a'), hpD: q('#duel-hp-d'),
      hpTxtA: q('#duel-hp-txt-a'), hpTxtD: q('#duel-hp-txt-d'),
      spA: q('#duel-sp-a'), spD: q('#duel-sp-d'),
      bubA: q('#duel-bub-a'), bubD: q('#duel-bub-d'),
      fx: q('#duel-fx'), dmgA: q('#duel-dmg-a'), dmgD: q('#duel-dmg-d'),
      cmds: q('#duel-cmds'),
    };
    duelEls.cmds.querySelectorAll('.duel-cmd').forEach((b) => { b.onclick = () => duelPick(b.dataset.k); });
    duelEls.auto.onclick = () => duelToggleAuto();
    root.addEventListener('click', (e) => {
      if (duel && duel.over) { e.preventDefault(); e.stopPropagation(); closeDuel(); }
    });
    return duelEls;
  }

  function updateDuelHp() {
    if (!duel || !duelEls) return;
    const e = duelEls;
    const pa = Math.max(0, Math.round(duel.hpA)), pd = Math.max(0, Math.round(duel.hpD));
    e.hpA.style.width = (pa / DUEL_MAX_HP * 100) + '%';
    e.hpD.style.width = (pd / DUEL_MAX_HP * 100) + '%';
    e.hpTxtA.textContent = `${pa} / ${DUEL_MAX_HP}`;
    e.hpTxtD.textContent = `${pd} / ${DUEL_MAX_HP}`;
    e.hpA.classList.toggle('low', pa <= 34);
    e.hpD.classList.toggle('low', pd <= 34);
  }
  function setDuelBanner(left, right, line) {
    if (!duelEls) return;
    duelEls.bannerB.textContent = left + (right ? ` vs ${right}` : '');
    duelEls.bannerS.textContent = line || '';
    duelEls.banner.classList.remove('on');
    void duelEls.banner.offsetWidth;
    duelEls.banner.classList.add('on');
  }
  function showDuelBubble(side, text, ms) {
    if (!duelEls || !text) return;
    const el = side === 'a' ? duelEls.bubA : duelEls.bubD;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; el.classList.remove('on'); }, ms || 1500);
  }
  function duelFxAt(side, mk) {
    if (!duelEls || !duelEls.stage) return;
    const sp = side === 'a' ? duelEls.spA : duelEls.spD;
    const stage = duelEls.stage;
    const r = sp.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    if (!r.width || !sr.width) return;
    const wrap = document.createElement('div');
    wrap.className = 'duel-fx-item fx-' + mk;
    wrap.style.left = ((r.left - sr.left) + r.width / 2) + 'px';
    wrap.style.top = ((r.top - sr.top) + r.height * 0.46) + 'px';
    wrap.innerHTML = DUEL_FX_SVG[mk] || '';
    duelEls.fx.appendChild(wrap);
    setTimeout(() => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 1150);
  }
  /* 전장이 아니라 이 화면이 흔들려야 한다 (일기토 창이 전장을 덮으므로) */
  function duelShake(strong) {
    if (!duelEls) return;
    const el = duelEls.stage;
    el.classList.remove('hit', 'hit-strong');
    void el.offsetWidth;
    el.classList.add(strong ? 'hit-strong' : 'hit');
    clearTimeout(el._sh);
    el._sh = setTimeout(() => el.classList.remove('hit', 'hit-strong'), 340);
  }
  function duelPop(side, dmg) {
    if (!duelEls) return;
    const el = side === 'a' ? duelEls.dmgA : duelEls.dmgD;
    el.textContent = `-${dmg}!`;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), 950);
  }

  /* 일어날 수 있는 일기토인가 — 무력 가중 확률(2~7%) · 이름 있는 장수 · 서로 다른 편 · 한 판 3번까지 */
  function duelOffer(a, d) {
    if (!B || !a || !d || a === d || !a.alive || !d.alive) return false;
    if (a.side === d.side || a.side !== 'ally') return false;
    if (duel) return false;
    if (!namedUnit(a) || !namedUnit(d)) return false;
    B.duels = B.duels || { n: 0, last: 0, seen: {} };
    const key = [a.name, d.name].sort().join('|');
    if (B.duels.n >= 3 || B.duels.seen[key]) return false;
    return Math.random() < duelChance(a, d);
  }

  function openDuel(a, d, done) {
    const els = ensureDuelDom();
    if (!els || !B) { if (done) done(); return false; }
    B.duels = B.duels || { n: 0, last: 0, seen: {} };
    B.duels.seen[[a.name, d.name].sort().join('|')] = 1;
    B.duels.n = (B.duels.n || 0) + 1;
    B.duels.last = performance.now();
    duel = {
      a, d, hpA: DUEL_MAX_HP, hpD: DUEL_MAX_HP, turn: 1, over: false, busy: false,
      auto: !!autoOn, done: done || null, last: null, ended: null,
      bond: SK.bondBetween ? SK.bondBetween(a.name, d.name) : null,
    };
    const e = els;
    e.ptA.src = SK.ptSrc(a.portrait);
    e.ptD.src = SK.ptSrc(d.portrait);
    SK.paintTier(e.ptA, ptTier(a));
    SK.paintTier(e.ptD, ptTier(d));
    e.spA.src = unitImgFor(a).src;
    e.spD.src = unitImgFor(d).src;
    e.nameA.textContent = a.name; e.nameD.textContent = d.name;
    const clsName = (u) => `${((SK.CLASSES[u.cls] || {}).name) || '장수'} · ${DUEL_INT_CLS[u.cls] ? '지' : '무'}${Math.round(duelAtkStat(u))} 통${Math.round(u.tong || 60)}`;
    e.roleA.textContent = clsName(a);
    e.roleD.textContent = clsName(d);
    e.turn.textContent = `1 / ${DUEL_TURNS}턴`;
    e.auto.classList.toggle('on', duel.auto);
    e.auto.textContent = duel.auto ? '⚡ 자동 중' : '⚡ 자동';
    e.fx.innerHTML = '';
    e.dmgA.classList.remove('on'); e.dmgD.classList.remove('on');
    e.bubA.hidden = true; e.bubD.hidden = true;
    e.root.querySelectorAll('.duel-cmd').forEach((b) => b.classList.remove('on'));
    e.cmds.classList.remove('busy', 'done');
    updateDuelHp();
    e.root.hidden = false;
    e.root.classList.remove('out');
    e.root.classList.add('show');
    const rival = !!(duel.bond && duel.bond.relation === '숙적');
    setDuelBanner(a.name, d.name, rival ? `숙적 · ${duel.bond.title} — 한판 승부!` : '일기토 개시 — 다섯 합으로 승부를 낸다!');
    SK.sfx.play('drum');
    shakeScreen(5);
    showDuelBubble('a', duelTalk(a, 'start'), 1900);
    dwait(() => showDuelBubble('d', duelTalk(d, 'start'), 1900), 340);
    feed(`${a.name} ↔ ${d.name} — 일기토! (HP 100 · 5합)`, 'rival');
    if (duel.auto) dwait(() => { if (duel && !duel.over && !duel.busy) duelPick(duelAiPick(duel.a)); }, 950);
    return true;
  }

  function duelPick(k) {
    if (!duel || duel.over || duel.busy || !DUEL_MOVE_BY[k]) return false;
    duel.busy = true;
    if (duelEls) {
      duelEls.cmds.classList.add('busy');
      duelEls.cmds.querySelectorAll('.duel-cmd').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    }
    SK.sfx.play('ui');
    duelResolve(k);
    return true;
  }

  function duelResolve(playerK) {
    const a = duel.a, d = duel.d;
    const aiK = duelAiPick(d);
    const A = DUEL_MOVE_BY[playerK], D = DUEL_MOVE_BY[aiK];
    duel.last = { player: playerK, ai: aiK };
    duel.log = duel.log || [];
    duel.log.push({ turn: duel.turn, player: playerK, ai: aiK });
    setDuelBanner(`${a.name} [${A.name}]`, `${d.name} [${D.name}]`, '···');
    dwait(() => {
      if (!duel || duel.over) return;
      const aWins = A.beats.indexOf(aiK) >= 0;
      const dWins = D.beats.indexOf(playerK) >= 0;
      let line = '';
      if (aWins) {
        const dmg = duelDamage(a, d);
        duel.hpD = Math.max(0, duel.hpD - dmg);
        duelFxAt('d', playerK);
        duelPop('d', dmg);
        line = `상성 승리! ${A.fx}이 ${d.name}을 강타했다!`;
        showDuelBubble('a', duelTalk(a, 'clashWin'), 1500);
        if (Math.random() < 0.5) showDuelBubble('d', duelTalk(d, 'clashLose'), 1500);
        SK.sfx.play('sword');
        duelShake(false);
        shakeScreen(7);
      } else if (dWins) {
        const dmg = duelDamage(d, a);
        duel.hpA = Math.max(0, duel.hpA - dmg);
        duelFxAt('a', aiK);
        duelPop('a', dmg);
        line = `상성 패배… ${D.fx}이 ${a.name}을 덮쳤다!`;
        showDuelBubble('d', duelTalk(d, 'clashWin'), 1500);
        if (Math.random() < 0.5) showDuelBubble('a', duelTalk(a, 'clashLose'), 1500);
        SK.sfx.play('hit');
        duelShake(true);
        shakeScreen(7);
      } else {
        const c1 = Math.max(4, Math.round(duelDamage(a, d) * 0.42));
        const c2 = Math.max(4, Math.round(duelDamage(d, a) * 0.42));
        duel.hpA = Math.max(0, duel.hpA - c2);
        duel.hpD = Math.max(0, duel.hpD - c1);
        duelFxAt('a', 'guard');
        duelFxAt('d', 'guard');
        duelPop('a', c2); duelPop('d', c1);
        line = `같은 ${A.name} — 칼날이 맞부딪혀 양쪽이 물러섰다`;
        SK.sfx.play('hit');
        duelShake(false);
        shakeScreen(4);
      }
      setDuelBanner(`${a.name} [${A.name}]`, `${d.name} [${D.name}]`, line);
      updateDuelHp();
      dwait(duelNext, 1000);
    }, 430);
  }

  function duelNext() {
    if (!duel || duel.over) return;
    if (duel.hpA <= 0 || duel.hpD <= 0 || duel.turn >= DUEL_TURNS) { duelEnd(); return; }
    duel.turn += 1;
    duel.busy = false;
    if (duelEls) {
      duelEls.turn.textContent = `${duel.turn} / ${DUEL_TURNS}턴`;
      duelEls.cmds.classList.remove('busy');
      duelEls.cmds.querySelectorAll('.duel-cmd').forEach((b) => b.classList.remove('on'));
    }
    if (duel.auto) dwait(() => { if (duel && !duel.over && !duel.busy) duelPick(duelAiPick(duel.a)); }, 560);
  }

  function duelEnd() {
    if (!duel || duel.over) return;
    const a = duel.a, d = duel.d;
    let winner = null;
    if (duel.hpD <= 0 && duel.hpA > 0) winner = 'a';
    else if (duel.hpA <= 0 && duel.hpD > 0) winner = 'd';
    else if (duel.hpA > duel.hpD) winner = 'a';
    else if (duel.hpD > duel.hpA) winner = 'd';
    else {
      const sa = duelAtkStat(a) + (a.tong || 60), sd = duelAtkStat(d) + (d.tong || 60);
      winner = sa > sd ? 'a' : (sd > sa ? 'd' : null);
    }
    duel.over = true;
    duel.busy = false;
    duel.ended = winner;
    if (duelEls) {
      duelEls.cmds.classList.add('done', 'busy');
      duelEls.cmds.querySelectorAll('.duel-cmd').forEach((b) => b.classList.remove('on'));
    }
    duelApply(winner);
    if (winner === 'a') {
      setDuelBanner(`★ ${a.name} 승리!`, '', `일기토 승리 — 사기 +18 · 본대 병력 10% 회복`);
      showDuelBubble('a', duelTalk(a, 'victory'), 2600);
      dwait(() => showDuelBubble('d', duelTalk(d, 'defeat'), 2600), 380);
      SK.sfx.play('victory');
    } else if (winner === 'd') {
      setDuelBanner(`✕ ${d.name} 승리…`, '', `일기토 패배 — 우리 부대가 큰 타격을 입었다`);
      showDuelBubble('d', duelTalk(d, 'victory'), 2600);
      dwait(() => showDuelBubble('a', duelTalk(a, 'defeat'), 2600), 380);
      SK.sfx.play('defeat');
    } else {
      setDuelBanner('무승부', '', '다섯 합을 겨루었으나 승부가 나지 않았다');
      SK.sfx.play('deny');
    }
    const hold = (duel.auto || autoSpeed >= 3) ? 900 : 2100;
    dwait(closeDuel, hold);
  }

  /* 일기토 결과를 본 전장에 적용한다 */
  function duelApply(winner) {
    if (!B || !duel) return;
    if (!winner) { feed('일기토 — 무승부 (양쪽 물러섬)', 'rival'); return; }
    const win = winner === 'a' ? duel.a : duel.d;
    const lose = winner === 'a' ? duel.d : duel.a;
    if (win.alive) {
      moraleShift(win, 18);
      const heal = Math.round(win.maxHp * 0.10);
      const before = win.hp;
      win.hp = Math.min(win.maxHp, win.hp + heal);
      const got = Math.round(win.hp - before);
      if (got > 0) {
        addHeal(win, got, win);
        addFloat((rxOf(win) + 0.5) * TILE, (ryOf(win) + 0.15) * TILE, '일기토 승리 +' + got, '#a8f0b8');
        addFx({ kind: 'heal', x: (rxOf(win) + 0.5) * TILE, y: (ryOf(win) + 0.5) * TILE, life: 620 });
      }
      feed(`${win.name} — 일기토 승리! 사기 +18 · 병력 +${got.toLocaleString('ko-KR')} 회복`, 'good');
    }
    if (lose.alive) {
      if (Math.random() < 0.10) {
        downUnit(lose);
        lose.fate = '생포';
        statOf(win).kills += 1;
        addFloat((rxOf(lose) + 0.5) * TILE, (ryOf(lose) + 0.2) * TILE, '일기토 패배 — 생포!', '#ffd166');
        feed(`${lose.name} — 일기토 패배, 대열이 무너져 생포됐다!`, 'bad');
        SK.sfx.play('drum');
        shakeScreen(6);
      } else {
        moraleShift(lose, -22);
        feed(`${lose.name} — 일기토 패배, 사기 −22`, 'bad');
      }
    }
    if (window.SKBattle) SKBattle.refreshUI();
  }

  function closeDuel() {
    if (!duel) return;
    const cb = duel.done;
    duel.done = null;
    duel = null;
    if (duelEls) {
      duelEls.root.classList.add('out');
      setTimeout(() => {
        if (!duelEls) return;
        duelEls.root.hidden = true;
        duelEls.root.classList.remove('show', 'out');
        duelEls.fx.innerHTML = '';
      }, 240);
    }
    if (cb) setTimeout(cb, 140);
  }

  /* 자동 — 남은 합을 알아서 끝낸다 */
  function duelToggleAuto() {
    if (!duel || duel.over) return;
    duel.auto = !duel.auto;
    if (duelEls) {
      duelEls.auto.classList.toggle('on', duel.auto);
      duelEls.auto.textContent = duel.auto ? '⚡ 자동 중' : '⚡ 자동';
    }
    SK.sfx.play('ui');
    if (duel.auto && !duel.busy) dwait(() => { if (duel && duel.auto && !duel.over && !duel.busy) duelPick(duelAiPick(duel.a)); }, 280);
  }

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

  /* ══════════════════════════════════════════════════════════════
     v5.31 — 사기(morale)와 상태이상(ailment)
     · 사기: 100이 기준. 높으면 공격이 세지고(최대 +16%), 낮으면 약해진다(최대 −18%).
       큰 타격을 받거나 아군 부대가 무너지면 떨어지고, 턴마다 조금씩 회복된다.
       v5.32 — 사기 하한 25(항복하지 않는다) · 턴 회복 2(50 미만이면 3)
     · 상태이상: 기절(이번 턴 행동 불가) · 혼란(아군·적을 가리지 않고 가까운 부대 공격) ·
       위축(공격 −20%) · 중독·화상(턴마다 병력 감소) · 둔화(이동 −1)
       v5.32 — 같은 상태이상이 반복되면 저항 누적 · 기절에서 깬 뒤 2턴 기절 면역
     · v5.31 보물 70절의 사기·상태이상 문구와 병과 책략(낙뢰·파천격·혼란·포효 등)이
       여기에 실제로 붙는다.
     ══════════════════════════════════════════════════════════════ */
  const AIL = {
    stun:    { n: '기절', c: '255,224,102', t: 1 },
    confuse: { n: '혼란', c: '201,166,255', t: 2 },
    fear:    { n: '위축', c: '255,176,216', t: 2 },
    poison:  { n: '중독', c: '143,220,122', t: 3 },
    burn:    { n: '화상', c: '255,154,92', t: 2 },
    slow:    { n: '둔화', c: '159,216,255', t: 2 },
  };
  SK.BATTLE_AIL = AIL;
  function initStatus(u) {
    const f = u.tfx || {};
    u.moraleMax = 100 + Math.max(0, Math.round(f.moraleMax || 0));
    u.morale = Math.min(u.moraleMax, 100 + Math.max(0, Math.round(f.morale || 0)));
    u.ail = {};
    /* v5.32 — 같은 상태이상이 거듭 걸릴수록 저항이 붙는다(ailRes) · 기절에서 깬 직후 면역(stunCd) */
    u.ailRes = {};
    u.stunCd = 0;
    u.slow = 0;
    u.aboard = false;
  }
  function moraleMul(u) {
    const m = (u && u.morale != null) ? u.morale : 100;
    return clamp(1 + (m - 100) * 0.004, 0.82, 1.16);
  }
  function moraleShift(u, d) {
    if (!u || !u.alive || !d) return;
    const before = u.morale == null ? 100 : u.morale;
    const cut = d < 0 ? Math.max(0, Math.min(0.7, fxPct(u, 'moraleSave'))) : 0;
    /* v5.32 — 사기 하한 25. 부대는 항복하지 않는다 — 몇 번의 큰 타격·연쇄 붕괴로
       0까지 떨어져도 더 나빠지지 않으므로, 한 번 무너진 부대가 판 전체를 버티지 못하는 일은 없다. */
    const floor = d < 0 ? 25 : 0;
    const next = clamp(before + (d < 0 ? d * (1 - cut) : d), floor, u.moraleMax || 100);
    u.morale = Math.round(next * 10) / 10;
    const diff = u.morale - before;
    if (Math.abs(diff) >= 3) {
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.1) * TILE,
        `${diff > 0 ? '사기↑' : '사기↓'} ${Math.round(Math.abs(diff))}`, diff > 0 ? '#a8f0b8' : '#ff9a86');
    }
  }
  function ailImmune(u, kind) {
    const f = u.tfx || {};
    if ((kind === 'fear' || kind === 'confuse') && f.immuneFC) return true;
    if (kind === 'poison' && f.immunePoison) return true;
    return false;
  }
  function ailApply(t, kind, chance, turns) {
    if (!t || !t.alive || !AIL[kind]) return false;
    /* v5.32 — 기절에서 막 깨어난 부대는 두 턴 동안 다시 기절하지 않는다.
       예전에는 낙뢰·파천격이 매 턴 들어오면 한 부대가 판 내내 한 번도 못 움직였다. */
    if (kind === 'stun' && (t.stunCd || 0) > 0) {
      addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.28) * TILE, '기절 내성', '#ffe6a8');
      return false;
    }
    /* v5.32 — 같은 상태이상이 두 번째, 세 번째 걸릴수록 저항이 붙는다(1/(1+0.4n)).
       기절·혼란·위축이 한 부대에 겹쳐 들어와도 장기전이 잠금놀이가 되지 않는다. */
    const stack = (t.ailRes && t.ailRes[kind]) || 0;
    const guard = 1 / (1 + stack * 0.4);
    if (chance != null && Math.random() > chance * guard) return false;
    if (ailImmune(t, kind)) {
      addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.28) * TILE, '면역', '#ffe6a8');
      return false;
    }
    const res = Math.max(0, Math.min(0.75, fxPct(t, 'statusRes')));
    if (res > 0 && Math.random() < res) {
      addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.28) * TILE, '저항!', '#ffd9a0');
      return false;
    }
    t.ail = t.ail || {};
    t.ail[kind] = Math.max(t.ail[kind] || 0, turns || AIL[kind].t);
    t.ailRes = t.ailRes || {};
    t.ailRes[kind] = stack + 1;
    if (kind === 'slow') t.slow = Math.max(t.slow || 0, 1);
    /* 기절은 걸린 턴 + 깨어난 뒤 2턴의 면역을 남긴다 */
    if (kind === 'stun') t.stunCd = 3;
    addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.2) * TILE, AIL[kind].n, `rgb(${AIL[kind].c})`);
    addFx({ kind: 'buff', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 520, color: AIL[kind].c });
    return true;
  }
  /* 상태이상 해제 — 아군 상태이상 해제 확률(금척검·옥선)·천상의 가무 */
  function ailClear(u, n) {
    if (!u || !u.ail) return 0;
    let cleared = 0;
    Object.keys(AIL).forEach((k) => {
      if (cleared >= n) return;
      if (!u.ail[k]) return;
      delete u.ail[k];
      if (k === 'slow') u.slow = 0;
      cleared += 1;
    });
    return cleared;
  }
  function ailNearClear(u, radius, n, color) {
    let c = 0;
    B.units.forEach((o) => {
      if (!o.alive || o.side !== u.side) return;
      if (manh(u.x, u.y, o.x, o.y) > radius) return;
      const k = ailClear(o, n);
      if (k) {
        c += k;
        addFloat((rxOf(o) + 0.5) * TILE, (ryOf(o) + 0.2) * TILE, '해제', color || '#bfe8ff');
      }
    });
    return c;
  }
  /* 상태이상 부여 — 공격 적중 시(보물)·책략 시(병과 기술) 공용 */
  function onHitAil(a, d, kind, opts) {
    if (!a || !d || !d.alive) return;
    if (opts && opts.counterHit) return;      // 반격·추격에는 상태이상이 붙지 않는다
    const f = a.tfx || {};
    if (f.moraleHit) moraleShift(d, -Math.max(2, Math.min(20, Math.round(f.moraleHit))));
    if (f.stunHit && Math.random() < Math.min(0.35, f.stunHit / 100)) ailApply(d, 'stun', null);
    if (f.fearHit && kind === 'melee' && Math.random() < Math.min(0.5, f.fearHit / 100)) ailApply(d, 'fear', null);
    if (f.disarm && Math.random() < Math.min(0.5, f.disarm / 100)) {
      d.buffs.def = { v: -0.2, t: 2 };
      addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.16) * TILE, '방어↓', '#c9a6ff');
    }
    if (f.slowHit && kind === 'melee') {
      const C = SK.CLASSES[a.cls] || {};
      if (C.weapon === 'axe' || C.weapon === 'mace' || a.cls === 'sanjeok') ailApply(d, 'slow', 0.5);
    }
  }
  /* 책략이 적힌 대로 상태이상을 건다 — 낙뢰(기절 25%)·파천격(35%)·방패돌진(20%)·혼란·포효 */
  function skillAilOf(sk) {
    const desc = (sk && sk.desc) || '';
    const out = [];
    const stun = desc.match(/기절\s*확률\s*(\d+)\s*%/);
    if (stun) out.push({ k: 'stun', p: Math.min(0.6, Number(stun[1]) / 100) });
    if (/혼란\s*상태\s*부여|혼란\s*유발|혼란\s*피해/.test(desc)) out.push({ k: 'confuse', p: 0.7 });
    if (/위축|공포\s*유발|공포\s*상태/.test(desc)) out.push({ k: 'fear', p: 0.75 });
    return out;
  }
  function skillAilApply(u, t, sk) {
    if (!u || !t || !sk) return;
    skillAilOf(sk).forEach((x) => { if (t.alive) ailApply(t, x.k, x.p); });
  }
  /* 병과 책략의 '사기 +N / 사기 -N' 문구 */
  function skillMoraleOf(sk, gain) {
    const desc = (sk && sk.desc) || '';
    const m = desc.match(/사기\s*([+\-])\s*(\d+)/);
    if (!m) return 0;
    const v = Number(m[2]) * (m[1] === '+' ? 1 : -1);
    return gain ? Math.max(0, v) : Math.min(0, v);
  }
  /* 턴 시작 — 중독·화상 피해, 기절/둔화/위축/혼란 지속 턴, 사기 회복, 상태이상 해제 */
  function ailPhase(side) {
    if (!B) return;
    B.units.forEach((u) => {
      if (!u.alive || u.side !== side) return;
      u.ail = u.ail || {};
      [['poison', 0.03], ['burn', 0.04]].forEach(([k, p]) => {
        if (!u.ail[k] || !u.alive) return;
        const d = Math.max(4, Math.round(u.maxHp * p));
        u.hp = Math.max(0, u.hp - d);
        statOf(u).taken += d;
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.4) * TILE, `${AIL[k].n} -${d}`, `rgb(${AIL[k].c})`);
        addFx({ kind: 'buff', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.45) * TILE, life: 460, color: AIL[k].c });
        u.flash = 0.6;
        if (u.hp <= 0) downUnit(u);
      });
      if (!u.alive) return;
      if (u.stunCd > 0) u.stunCd -= 1;
      if (u.ail.stun) {
        u.acted = true;
        u.ail.stun -= 1;
        if (u.ail.stun <= 0) delete u.ail.stun;
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '기절 — 행동 불가', `rgb(${AIL.stun.c})`);
      }
      if (u.ail.slow) {
        u.slow = 1;
        u.ail.slow -= 1;
        if (u.ail.slow <= 0) { delete u.ail.slow; u.slow = 0; }
      } else u.slow = 0;
      if (u.morale < u.moraleMax) {
        /* v5.32 — 기본 회복을 1→2로, 사기가 50 아래면 3으로 올린다.
           예전에는 사기 40에서 6턴을 버텨도 46밖에 안 올라, 한 번 꺾인 부대가 판 내내 회복하지 못했다. */
        const rg = (u.morale < 50 ? 3 : 2) + Math.round(Math.max(0, fxPct(u, 'moraleRegen')) * 10);
        moraleShift(u, rg);
      }
      const cl = Math.max(0, fxPct(u, 'cleanse'));
      if (cl > 0 && Math.random() < cl) {
        /* v5.31 — 금척검·옥선: 자기 상태이상이 없으면 인접 아군 것을 풀어 준다 */
        if (ailClear(u, 1)) addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.24) * TILE, '상태이상 해제', '#bfe8ff');
        else ailNearClear(u, 1, 1);
      }
      ['fear', 'confuse', 'poison', 'burn'].forEach((k) => {
        if (!u.ail[k]) return;
        u.ail[k] -= 1;
        if (u.ail[k] <= 0) delete u.ail[k];
      });
    });
  }

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
  /* v5.29 — 보물 효과 훅. u.tfx에는 장수가 장착한 보물의 합산 수치가 들어 있다(단위 %). */
  function fxPct(u, k) {
    const f = u && u.tfx;
    return f && f[k] ? f[k] / 100 : 0;
  }
  /* v5.30 — 지형·야간 조건 보정. 해동병법처럼 '수전·산악 지형에서 능력치 보정'인 보물은
     해당 지형에 설 때만 공·방에 붙는다. 야간(야영 기습전)은 B.night로 표시한다. */
  function terrFxPct(u) {
    if (!B || !u) return 0;
    const ch = B.tiles[u.y] && B.tiles[u.y][u.x];
    let v = 0;
    if (ch === 'W' || ch === 'S') v += fxPct(u, 'water');
    if (ch === 'M') v += fxPct(u, 'mountain');
    if (B.night) v += fxPct(u, 'night');
    return v;
  }
  /* v5.29 — 보물 '책략 소비 기력 -N%' (백우선). 최소 1은 든다. */
  function mpCostOf(u, sk) {
    const base = (sk && sk.mp) || 0;
    const cut = Math.min(0.6, Math.max(0, fxPct(u, 'mpCost')));
    return Math.max(1, Math.round(base * (1 - cut)));
  }
  function effAtk(u) {
    const ch = B.tiles[u.y][u.x];
    const aff = SK.affinity(u.cls, ch);
    const tb = fxPct(u, 'atk');
    /* v5.31 — 사기·위축·조각배(수전) 보정 */
    const fear = (u.ail && u.ail.fear) ? 0.8 : 1;
    const boat = (u.aboard && u.cls !== 'sujeok') ? 0.82 : 1;
    return u.atk * troopPower(u) * (1 + buffVal(u, 'atk') + aff.atk * 1.3 + typeBonus(u) * 1.25 + tb + terrFxPct(u)) * bondAllyMul(u) * moraleMul(u) * fear * boat;
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
    /* v5.29 — 보물 방어력, 성벽·망루·본진 위에서는 '성벽 위 방어력'까지 */
    const wall = (ch === 'C' || ch === 'T' || ch === 'K' || ch === 'G') ? fxPct(u, 'defWall') : 0;
    const tdef = fxPct(u, 'def') + wall + terrFxPct(u);
    /* v5.31 — 조각배 위에서는 방어도 조금 떨어진다 (수적 제외) */
    const boat = (u.aboard && u.cls !== 'sujeok') ? 0.88 : 1;
    return u.def * troopGuard(u) * (1 - terr(u).def * 1.0 + aff.def * 1.25 + typeBonus(u) * 0.6 + tdef) * mul * hold * sit * boat;
  }
  function effRng(u) {
    const aff = SK.affinity(u.cls, B.tiles[u.y][u.x]);
    return u.rng + Math.min(1, aff.rng + wallRngBonus(u));
  }

  /* v5.33 — 책사·풍수사·도사의 책략 사거리 +1 (사용자 '책사계 풍수 도사 책략사거리 1업').
     스킬 표의 range를 직접 고치면 다른 병과까지 따라오므로, 시전자 병과로 한 번만 보정한다. */
  const CASTER_RANGE_BONUS = { chaeksa: 1, pungsusa: 1, dosa: 1 };
  function skRange(u, sk) {
    const base = (sk && sk.range) || (u ? effRng(u) : 1);
    return base + ((u && CASTER_RANGE_BONUS[u.cls]) ? 1 : 0);
  }
  SK.skRange = skRange;
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
     지력이 책공의 바탕이고, 지력+통솔이 책방의 바탕이다. 병력이 줄면 함께 약해진다.
     v5.54 — 병과별 배율을 곱해 모든 병과가 같은 눈금에서 읽히게 정리했다.
       예전에는 지력만 보고 값을 만들어 군주·기병까지 책공이 물리 공격의 두 배로 보였고,
       방어력(20~35)에 비해 책방(70~85)만 유난히 커 보였다.
       · 책략계(책사·도사·풍수사·무희·군악대) — 책공이 공격력보다 확실히 높다
       · 근접·기병·궁병·군주 — 책공이 공격력보다 낮다 (싸움은 칼로 한다)
       · 공성 병기(포차·발석차) — 기계의 위력이라 중간값을 준다 */
  const MAGIC_ATK_MUL = {
    chaeksa: 0.58, dosa: 0.60, pungsusa: 0.56, muhui: 0.50, gunakdae: 0.50,
    gungsu: 0.32, gunggi: 0.34, yeonnobyung: 0.32, pocha: 0.44, balseokcha: 0.44,
    gunwoong: 0.36, deunggabyung: 0.30, geombyung: 0.30,
  };
  const MAGIC_DEF_MUL = {
    chaeksa: 0.60, dosa: 0.60, pungsusa: 0.58, muhui: 0.52, gunakdae: 0.50,
    gungsu: 0.36, gunggi: 0.36, yeonnobyung: 0.36, pocha: 0.30, balseokcha: 0.30,
    gunwoong: 0.38, deunggabyung: 0.34, geombyung: 0.34,
  };
  /* v5.54 — 병과 표에 없는 병과(기병·창병·산적·수적·무도가·야수병)의 기본 배율 */
  const MAGIC_ATK_BASE = 0.30, MAGIC_DEF_BASE = 0.32;
  function magicAtkMul(u) { return (u && MAGIC_ATK_MUL[u.cls] != null) ? MAGIC_ATK_MUL[u.cls] : MAGIC_ATK_BASE; }
  function magicDefMul(u) { return (u && MAGIC_DEF_MUL[u.cls] != null) ? MAGIC_DEF_MUL[u.cls] : MAGIC_DEF_BASE; }
  function magicAtk(u) {
    const tp = troopPower(u);
    return (u.ji * 1.05 + u.lv * 3 + Math.min(400, u.hp * 0.02) * 0.25) * tp * (1 + buffVal(u, 'atk') * 0.6) * magicAtkMul(u);
  }
  function magicDef(u) {
    const ch = B.tiles[u.y][u.x];
    const mul = Math.max(0.05, 1 + buffVal(u, 'def') * 0.6);
    return (u.ji * 0.62 + u.tong * 0.34 + u.lv * 2) * troopGuard(u) * (1 + terr(u).def * 0.6) * mul * magicDefMul(u);
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
  /* v5.36 — 공격력은 최대 병력만 보지 않고 지금 남은 병력을 함께 본다
     (0.55·최대 + 0.45·현재). 병력이 줄수록 한 방의 무게도 자연스럽게 줄어 장기전이 늘어진다. */
  function atkScale(a) {
    const max = (a && a.maxHp) ? a.maxHp : 1800;
    const hp = (a && a.hp > 0) ? a.hp : 0;
    const eff = hp > 0 ? (0.55 * max + 0.45 * hp) : max;
    const t = clamp(eff / 1800, 0.35, 8);
    return Math.pow(t, 0.4);
  }
  function calcDamage(a, d, opts) {
    let atk = effAtk(a);
    if (opts && opts.mult) atk *= opts.mult;
    /* v5.30 — 신검지휘도: 연격의 두 번째 타격은 대상 방어력을 무시한다 */
    const def = (opts && opts.pierce) ? 0 : (opts && opts.ignoreTerrain ? d.def : effDef(d));
    /* v5.15 — 병과 삼각 상성 (보병↔궁병↔기병↔창병) */
    const tri = SK.triangleMul ? SK.triangleMul(a.cls, d.cls) : { mul: 1, label: '' };
    /* v5.15 — 등갑병 '4딜 벽' 완화: 방어 계수 0.62 → 0.52 */
    let base = (atk * 0.92 - def * 0.52) * 12;
    base *= tri.mul;
    base *= sizeScale(d) * atkScale(a);
    base *= rnd(0.92, 1.08);
    /* v5.29 — 보물: 주는 피해(+), 받는 피해 감소(−), 첫 공격(선제) 피해 */
    const bonusDeal = fxPct(a, 'dmg');
    if (bonusDeal) base *= Math.max(0.4, 1 + bonusDeal);
    /* v5.30 — 측면·배후 추가 피해(비도단검): 대상이 바라보는 쪽의 반대에서 치면 붙는다 */
    const flank = fxPct(a, 'flank');
    if (flank && attackKind(a, opts) === 'melee' && !(opts && opts.counterHit)) {
      const behind = (d.face > 0) ? (a.x < d.x) : (a.x > d.x);
      if (behind) base *= 1 + flank;
    }
    /* v5.30 — 돌격 추가 피해(호표기창·청룡연월도): 이번 턴 2칸 이상 움직였을 때, 이동 거리에 비례 */
    const chg = fxPct(a, 'charge');
    if (chg && attackKind(a, opts) === 'melee' && (a.movedTiles || 0) >= 2 && !(opts && opts.counterHit)) {
      base *= 1 + chg * Math.min(2, (a.movedTiles || 0) / 2);
    }
    if (opts && opts.firstStrike) {
      const f = fxPct(a, 'first');
      if (f) base *= Math.max(0.4, 1 + f);
    }
    const cutTaken = Math.max(-0.5, Math.min(0.55, fxPct(d, 'taken')));
    if (cutTaken) base *= 1 - cutTaken;
    /* v5.31 — 근접 받는 피해 감소(용린갑·호피망토) */
    if (attackKind(a, opts) === 'melee') {
      const mt = Math.max(0, Math.min(0.5, fxPct(d, 'meleeTaken')));
      if (mt) base *= 1 - mt;
    }
    /* v5.31 — 원거리 부대가 이번 턴 움직인 뒤 쏘면 위력 −12% (백발궁은 무효) */
    if (attackKind(a, opts) !== 'melee' && (a.movedTiles || 0) >= 1 && !(a.tfx && a.tfx.moveShot)) base *= 0.88;
    /* v5.30 — 흑갑 같은 '야간 전투 시 피해 −N%'는 밤 전장에서만 */
    if (B && B.night) {
      const ncut = Math.max(0, Math.min(0.5, fxPct(d, 'nightTaken')));
      if (ncut) base *= 1 - ncut;
    }
    /* v5.2 — 투석차·발석차는 일반 부대에 약하고 성문·성벽에 강하다 */
    const kind = attackKind(a, opts);
    if (kind === 'rock') base *= 0.55;
    /* v5.15 — 무희 오라의 회피(받는 피해 −8%) */
    const ev = buffVal(d, 'evade');
    if (ev > 0) base *= Math.max(0.6, 1 - ev);
    let crit = false;
    const cc = critChanceOf(a);
    if (!opts || !opts.noCrit) {
      if (Math.random() < cc) {
        crit = true;
        /* v5.29 — 보물 치명타 피해(+), 방어자의 치명타 저항(−) */
        base *= Math.max(1.15, 1.55 + fxPct(a, 'critDmg') - fxPct(d, 'critRes'));
      }
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
    /* v5.30 — 타격감: 맞은 자리에서 튀는 불티와 짧은 화면 진동 */
    addFx({ kind: 'spark', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.42) * TILE, life: 260, color });
    d.flash = 1;
    d.shake = 240;
    shakeScreen(2.6);
  }

  /* v5.30 — 크리티컬 한 방: 화면 가장자리 금빛 번쩍임 + 더 큰 진동 */
  function critFlash() {
    const el = document.getElementById('crit-flash');
    if (!el) return;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    const t = wait(() => el.classList.remove('on'), 220);
    return t;
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
    /* v5.31 — 사기: 최대 병력의 15% 이상을 한 번에 잃으면 흔들린다 */
    if (d.maxHp && dmg >= d.maxHp * 0.15) moraleShift(d, -4);
    if (wasAlive && d.hp <= 0) {
      moraleShift(a, 5);
      B.units.forEach((o) => {
        if (!o.alive || o === d || o.side !== d.side) return;
        if (manh(o.x, o.y, d.x, d.y) <= 3) moraleShift(o, -4);
      });
    }
    if (a) statOf(a).dealt += dmg;
    statOf(d).taken += dmg;
    /* v5.30 — 검증용 마지막 타격 기록 (연격·광역·반사가 실제로 들어갔는지 확인) */
    if (B) {
      B.lastHits = B.lastHits || [];
      B.lastHits.push({ a: a && a.name, d: d.name, dmg: dmg, crit: !!crit });
      if (B.lastHits.length > 14) B.lastHits.shift();
    }
    if (wasAlive && d.hp <= 0 && a) statOf(a).kills += 1;
    addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.4) * TILE, (crit ? '회심! ' : '') + dmg,
      crit ? '#ffd166' : (bond ? '#ffd0c0' : '#ffe9d0'));
    if (crit) {
      /* v5.30 — 크리티컬은 숫자·번쩍임·진동으로 확실히 구분된다 */
      critFlash();
      addFx({ kind: 'burst', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.45) * TILE, life: 520, color: '255,226,120' });
      shakeScreen(7);
    }
    /* v5.33 — 타격 경험치를 그 자리에서 장수에게 넣는다 (적 처치 42 · 명중 9) */
    if (a.side === 'ally' && a.uid) battleExp(a, wasAlive && d.hp <= 0 ? 42 : 9);
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
    /* v5.29 — 보물 회피: 방어자가 회피하면 피해 없이 '회피!' (최대 40%) */
    const dodged = !(opts && opts.noDodge) && fxPct(d, 'evade') > 0 && Math.random() < Math.min(0.4, fxPct(d, 'evade'));
    /* v5.29 — 선제 타격: 그 전투에서 이 부대의 첫 공격에만 붙는다 */
    if (!(opts && opts.noStrike) && !a.struckOnce) {
      opts = Object.assign({}, opts, { firstStrike: true });
      a.struckOnce = true;
    }
    const res = dodged ? { dmg: 0 } : calcDamage(a, d, opts);
    const bond = (res.bond && res.bond.relation === '숙적') ? res.bond : null;
    if (bond) rivalClash(bond, a, d);
    const kind = attackKind(a, opts);
    const land = () => {
      if (dodged) {
        addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.4) * TILE, '회피!', '#9fd8ff');
        SK.sfx.play('deny');
        if (onDone) onDone();
        return;
      }
      applyDamage(a, d, res.dmg, res.crit, bond);
      /* v5.31 — 보물의 적중 시 상태이상·사기 저하 */
      if (d.alive) onHitAil(a, d, kind, opts);
      impactAt(d, bond ? '255,140,110' : '255,214,120');
      if (kind !== 'melee') addFx({ kind: 'ring', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.55) * TILE, life: 350 });
      if (opts && opts.onDamage) opts.onDamage(res.dmg, res.crit);
      SK.sfx.play('hit');
      if (onDone) onDone();
    };
    /* v5.52 — 근접 공격에서 확률(무력 가중 2~7%)로 1:1 일기토 미니게임. 일기토가 끝난 뒤에야
       원래 공격(돌진 → 피해)이 이어진다. 일기토에서 쓰러진 부대는 공격하지 못한다. */
    const swing = () => {
      if (!B || !a.alive || !d.alive) { if (onDone) onDone(); return; }
      if (kind === 'melee') {
        lunge(a, d, () => {
          addFx({ kind: 'slash', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.45) * TILE, life: 380 });
          SK.sfx.play('sword');
          wait(land, 70);
        });
      } else {
        launchProjectile(a, d, kind, land);
      }
    };
    if (opts && opts.duel && kind === 'melee' && !dodged && duelOffer(a, d)) {
      openDuel(a, d, swing);
      return;
    }
    swing();
  }

  /* v5.15 — 반격: 방어자의 최소 사거리(minRng) 안쪽이면 반격하지 못한다.
     반격 피해는 일반 병과 75%, 검병은 방패 맞다이 특화로 90%. */
  const COUNTER_MUL = 0.75, COUNTER_MUL_SHIELD = 0.90;
  /* v5.29 — 보물 반격 피해 보정 (검병 90% · 일반 75% + 보물 %) */
  function counterMulOf(u) { return (u && u.cls === 'geombyung' ? COUNTER_MUL_SHIELD : COUNTER_MUL) + fxPct(u, 'counter'); }
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
      const before = d.hp;
      attackUnit(a, d, { mult: mul, counterHit: true }, () => {
        /* v5.30 — 현무방패 등 '반격 시 반사 피해': 반격으로 준 피해의 일부를 공격자에게 되돌린다 */
        const rf = fxPct(a, 'reflect');
        const dealt = Math.max(0, before - d.hp);
        if (rf > 0 && dealt > 0 && d.alive && B && !B.over) {
          const back = Math.max(1, Math.round(dealt * Math.min(0.6, rf)));
          addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.2) * TILE, '반사 ' + back, '#cdb6ff');
          addFx({ kind: 'ring', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.55) * TILE, life: 340, color: '190,160,255' });
          applyDamage(a, d, back, false, null);
          feed(`${a.name}의 반사 피해 ${back}`, 'good');
        }
        finishCheck();
      });
    }, 240);
  }

  /* ───────────── 조작 ───────────── */
  function onTileTap(x, y) {
    if (!B || B.over || busy || !B.introDone) return;
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const u = B.sel;
    const t = B.units.find((o) => o.alive && o.x === x && o.y === y);
    /* v5.53 — 적군 페이즈에도 부대를 눌러 《장수 정보》를 볼 수 있다.
       읽기 전용이라 턴·이동·공격에는 아무 영향이 없다. */
    if (B.phase !== 'ally') {
      if (t) inspectUnit(t, { open: true });
      return;
    }

    if (mode === 'skillTarget' && pendingSkill) { trySkillAt(x, y); return; }
    /* v5.54 — 필살기 대상 선택 */
    if (mode === 'ultTarget') {
      const spec = ultOf(u);
      if (!spec || !u) { mode = 'idle'; SKBattle.refreshUI(); return; }
      if (!t || t.side === u.side) { SK.toast('필살기를 맞을 적을 선택하세요.'); return; }
      if (manh(u.x, u.y, t.x, t.y) > ultRange(u, spec)) { SK.toast(`필살기 사거리(${ultRange(u, spec)}칸) 밖입니다.`); return; }
      castUlt(u, spec, t);
      return;
    }

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
      /* v5.53 — [공격]을 눌러 대상을 고르는 중일 때만 한 번에 공격 예고.
         그 밖에는 적군을 눌러도 《장수 정보》가 열린다 (사거리 밖 적군도 병력·장비를 볼 수 있게).
         정보 창 아래 [공격 예고]로 바로 칠 수도 있다. */
      if (mode === 'attack' && u && u.side === 'ally' && !u.acted && canHit(u, t)) { openAttackPreview(u, t); return; }
      inspectUnit(t, { open: true });
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
    B.insp = null;   // v5.53 — 내 부대를 고르면 적군 정보 보기에서 돌아온다
    B.sel = u;
    trackTurn(u);
    /* v5.39 — 이미 이번 턴에 걸어간 부대는 다시 선택해도 이동 범위를 열지 않는다.
       (예전에는 선택을 풀었다 다시 집으면 파란 칸이 되살아나 한 턴에 무한 재이동이 가능했다)
       이동을 물리려면 폰의 뒤로가기 = 이동 취소. */
    const canMoveNow = u.side === 'ally' && !u.acted && !u.movedThisTurn;
    B.reachCache = canMoveNow ? { uid: u.id, set: reachSet(u) } : null;
    mode = canMoveNow ? 'move' : (u.side === 'ally' && !u.acted ? 'act' : 'idle');
    pendingSkill = null;
    SKBattle.refreshUI();
    const t = SK.TERRAIN[B.tiles[u.y][u.x]];
    $('#battle-tip').textContent = u.movedThisTurn && !u.acted
      ? `${u.name} · 이동 완료 · 공격·책략·대기 중 선택 (뒤로가기 = 이동 취소)`
      : `${u.name} · ${SK.CLASSES[u.cls].name} · 이동 ${movOf(u)} · ${t.name} 방어 ${Math.round(t.def * 100)}%`;
  }

  function clearSel() {
    B.sel = null;
    B.insp = null;   // v5.53
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
    /* v5.39 — 이번 턴 이동을 쓴 부대로 표시한다 (재선택해도 이동 범위가 다시 열리지 않게) */
    u.movedThisTurn = true;
    lastMovedUid = u.id;
    if (u.turnStartX == null) { u.turnStartX = u.x; u.turnStartY = u.y; }
    /* v5.30 — 돌격 보정(호표기창·청룡연월도)을 위해 이번 턴에 걸은 칸 수를 센다 */
    u.movedTiles = Math.max(0, path.length - 1);
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

  /* ══════════════════════════════════════════════════════════════
     v5.39 — 뒤로가기 = 이동 취소 (아직 행동하지 않은 부대만)
     · 공격·책략 대상을 고르던 중이면 그 선택부터 물린다
     · 이동만 하고 행동을 확정하지 않은 부대는 턴 시작 좌표로 돌아간다
     · 돌아오면 movedThisTurn=false가 되어 다시 걸을 수 있다
     ══════════════════════════════════════════════════════════════ */
  function undoMove() {
    if (!B || B.over || !B.introDone || B.phase !== 'ally') return false;
    if (busy) { SK.toast('이동 중입니다 — 잠시 뒤 다시 눌러 주세요'); return true; }
    /* 공격·책략 대상을 고르는 중: 이동을 되돌리기 전에 그 선택만 먼저 물린다 */
    if (mode === 'attack' || mode === 'skillTarget') {
      mode = 'idle';
      pendingSkill = null;
      SKBattle.refreshUI();
      $('#battle-tip').textContent = '대상 고르기를 취소했습니다 — 한 번 더 누르면 이동을 취소합니다';
      SK.toast('대상 고르기를 취소했습니다');
      return true;
    }
    const movedOk = (u) => !!u && u.alive && u.side === 'ally' && !u.acted && u.movedThisTurn && u.turnStartX != null;
    let u = movedOk(B.sel) ? B.sel : null;
    if (!u && lastMovedUid != null) {
      const c = B.units.find((x) => x.id === lastMovedUid);
      if (movedOk(c)) u = c;
    }
    if (!u) return false;
    u.x = u.turnStartX; u.y = u.turnStartY;
    u.rx = u.x; u.ry = u.y;
    u.movedThisTurn = false;
    u.movedTiles = 0;
    lastMovedUid = null;
    mode = 'idle';
    B.reachCache = null;
    pendingSkill = null;
    SK.sfx.play('ui');
    selectUnit(u);          // 다시 이동 범위(파란 칸)가 열린다
    ensureVisible(u);
    SK.toast('이동을 취소하고 제자리로 돌아왔습니다');
    return true;
  }
  SK.battleUndoMove = undoMove;

  /* v5.29 — 치명타 확률은 한 곳에서만 계산한다 (예고·실제 전투가 같은 값을 쓰도록) */
  function critChanceOf(u) {
    return 0.05 + (u.wu - 60) * 0.0011 + (u.cls === 'sanjeok' ? 0.06 : 0) + Math.max(0, buffVal(u, 'crit')) + fxPct(u, 'crit');
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
    const critChance = Math.round(critChanceOf(a) * 100);
    const bondHtml = bond
      ? `<div class="ap-bond ${bond.relation === '숙적' ? 'rival' : 'friend'}">${bond.relation} · ${bond.title}<em>${bond.relation === '숙적' ? '피해 +20%' : '공격 +15%'}</em></div>`
      : '';
    /* v5.30 — 연격·연속 사격·광역·관통·한 턴 2회도 예고 창에 보여 준다 */
    const fxTags = (u) => {
      if (!u || !u.tfx) return [];
      const t = u.tfx, out = [];
      if (t.dmg) out.push(`공격 피해 +${t.dmg}%`);
      if (t.first) out.push(`첫 공격 +${t.first}%`);
      if (t.combo) out.push(`연격 ${Math.min(50, t.combo)}%`);
      if (t.volley) out.push(`연속 사격 ${Math.min(50, t.volley)}%`);
      if (t.splash) out.push(`주변 ${t.splash}%`);
      if (t.line) out.push(`관통 ${t.line}%`);
      if (t.pierce) out.push('연격 시 방어 무시');
      if (t.doubleAct) out.push('한 턴 2회');
      if (t.evade) out.push(`회피 ${Math.min(40, t.evade)}%`);
      if (t.taken) out.push(`받는 피해 −${t.taken}%`);
      if (B.night && t.nightTaken) out.push(`야간 피해 −${t.nightTaken}%`);
      return out;
    };
    const aTags = fxTags(a), dTags = fxTags(d);
    const fxRow = (aTags.length || dTags.length)
      ? `<div class="ap-row"><span>보물</span><b>${[...aTags, ...dTags.map((x) => `${d.name} ${x}`)].slice(0, 4).join(' · ')}</b><em>장착 보물</em></div>`
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
        ${fxRow}
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
    /* v5.31 — 성문·장애물 파괴 효율 (흑철도끼·거북선포) */
    const gb = Math.max(0, Math.min(1.2, fxPct(a, 'gateDmg')));
    if (gb) base *= 1 + gb;
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
      animatePath(e, findPath(e, plan.x, plan.y), { step: 88, onDone: () => wait(go, 150) });
    } else go();
  }

  /* 고유 특기 발동 — 상위 100명의 data/unique_passives.json
     on_attack: 공격 후 주변 아군 강화 / turn_start: 매 턴 아군 지원 / 그 외: 공격 시 발동으로 본다 */
  function triggerPassive(u, when) {
    const p = u && u.passive;
    if (!p || !u.alive || B.over) return;
    const trig = p.trigger || 'on_attack';
    if (when === 'turn_start' ? trig !== 'turn_start' : trig === 'turn_start') return;
    if (when !== 'turn_start' && u.pUsed && u.pUsed[trig]) {
      /* v5.31 — 사기병법서·육도비록: '전술 발동 확률 +N%'는 한 번 쓴 고유특기가 다시 터질 확률 */
      const again = Math.max(0, Math.min(0.5, fxPct(u, 'passive')));
      if (!again || Math.random() >= again) return;
      feed(`${u.name}의 특기 「${p.title || ''}」 재발동`, 'good');
    }
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
      addFloat(cx, cy - 10, `「${p.title}」`, '#9ef0b8', { back: true });
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
    addFloat(cx, cy - 10, `「${p.title}」`, '#ffe08a', { back: true });
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
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '「군악」 MP+4 · 공+8%', '#ffe08a', { back: true });
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
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '「무희」 회피·치명 +8%', '#f0b8e0', { back: true });
      feed(`${u.name}의 춤 — 아군 회피·치명 +8%, 적 공격 −8%`, side === 'ally' ? 'good' : 'bad');
    });
  }

  /* v5.30 — 연격·연속 사격: 한 번 더 친다 (연격 62% · 연속 사격 55% 피해) */
  function extraKindOf(a, kind) {
    if (!a || !a.tfx) return null;
    if (kind === 'melee') return (fxPct(a, 'combo') > 0 && Math.random() < Math.min(0.5, fxPct(a, 'combo'))) ? 'combo' : null;
    return (fxPct(a, 'volley') > 0 && Math.random() < Math.min(0.5, fxPct(a, 'volley'))) ? 'volley' : null;
  }
  function extraStrike(a, d, kind, done) {
    const pierce = kind === 'combo' && !!(a.tfx && a.tfx.pierce);
    const mult = kind === 'combo' ? 0.62 : 0.55;
    addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.1) * TILE, kind === 'combo' ? '연격!' : '연속 사격!', '#ffe6a8', { back: true });
    feed(`${a.name} — ${kind === 'combo' ? '연격' : '연속 사격'}${pierce ? ' · 방어 무시' : ''}`, 'good');
    wait(() => {
      if (!B || B.over || !a.alive || !d.alive) { done(); return; }
      attackUnit(a, d, { mult, pierce, noStrike: true, noDuel: true }, () => {
        wait(() => { if (B && !B.over) done(); }, 160);
      });
    }, 120);
  }
  /* v5.30 — 광역·관통 추가 피해: 주 대상에 붙은 적(주변 1칸)과 같은 줄 뒤쪽 적도 함께 벤다 */
  function areaStrike(a, d, mainDmg) {
    if (!B || B.over || !a || !d || mainDmg <= 0) return 0;
    const splash = fxPct(a, 'splash'), line = fxPct(a, 'line');
    if (!splash && !line) return 0;
    const hitSet = new Set();
    const rows = [];
    if (splash) {
      B.units.forEach((o) => {
        if (!o.alive || o.side === a.side || o === d) return;
        if (manh(o.x, o.y, d.x, d.y) <= 1) { hitSet.add(o); rows.push([o, splash, '광역']); }
      });
    }
    if (line) {
      const dx = Math.sign(d.x - a.x), dy = Math.sign(d.y - a.y);
      B.units.forEach((o) => {
        if (!o.alive || o.side === a.side || o === d || hitSet.has(o)) return;
        const onLine = (dx === 0 && o.x === d.x && Math.sign(o.y - d.y) === dy)
          || (dy === 0 && o.y === d.y && Math.sign(o.x - d.x) === dx);
        if (onLine && manh(o.x, o.y, d.x, d.y) <= 2) { hitSet.add(o); rows.push([o, line, '관통']); }
      });
    }
    rows.forEach(([o, pct, label]) => {
      const amount = Math.max(1, Math.round(mainDmg * Math.min(0.6, pct)));
      addFloat((rxOf(o) + 0.5) * TILE, (ryOf(o) + 0.35) * TILE, `${label} ${amount}`, '#ffc98a');
      addFx({ kind: 'ring', x: (rxOf(o) + 0.5) * TILE, y: (ryOf(o) + 0.55) * TILE, life: 320, color: '255,200,140' });
      applyDamage(a, o, amount, false, null);
    });
    if (rows.length) { shakeScreen(3.4); SK.sfx.play('hit'); }
    return rows.length;
  }

  function doAttack(a, d) {
    if (!a || !d || !a.alive || !d.alive) return;
    busy = true;
    mode = 'idle';
    a.acted = true;
    B.reachCache = null;
    const kind = attackKind(a, {});
    const extra = extraKindOf(a, kind);
    /* v5.30 — 한 턴 2회 공격(일월쌍도·쌍고검): 근접 공격만, 3턴 쿨타임 */
    const dblReady = !!(kind === 'melee' && a.tfx && a.tfx.doubleAct && !a.dblUsed && (a.dblCd || 0) <= 0);
    let dealt = 0;
    attackUnit(a, d, { mult: 1, duel: true, onDamage: (n) => { dealt = n; } }, () => {
      /* v5.52 — 일기토에서 우리 장수가 쓰러졌으면 공격도 반격도 없다 */
      if (!B || B.over || !a || !a.alive) { busy = false; finishCheck(); return; }
      const wasAlive = d.alive && d.hp > 0;
      triggerPassive(a, 'on_attack');
      wait(() => {
        if (!B || B.over) { busy = false; return; }
        const after = () => {
          areaStrike(a, d, dealt);
          /* v5.31 — 추격: 근접으로 적을 쓰러뜨리면 곁의 적을 한 번 더 친다 */
          if (wasAlive && !d.alive) pursuitStrike(a, d);
          if (wasAlive && d.alive && !B.over) counter(d, a);
          busy = false;
          finishCheck();
          if (!B || B.over) return;
          if (dblReady && a.alive) {
            a.dblUsed = true; a.dblCd = 3;
            a.acted = false;
            B.reachCache = reachSet(a);
            selectUnit(a);
            showCallout('한 번 더 — 쌍검', 'duel');
            feed(`${a.name} — 한 턴 2회 공격 (3턴 쿨타임)`, 'good');
            return;
          }
          wait(() => { if (B && !B.over) nextUnitOrWait(); }, 300);
        };
        if (extra && d.alive) extraStrike(a, d, extra, after);
        else after();
      }, 320);
    });
    SKBattle.refreshUI();
  }

  /* v5.31 — 추격 공격 (비전마·적토모조마). 근접 처치 뒤 확률로 사거리 안 적 하나를 65% 위력으로 */
  function pursuitStrike(a, d) {
    if (!B || B.over || !a || !a.alive) return;
    const pr = Math.max(0, Math.min(0.6, fxPct(a, 'pursuit')));
    if (!pr || Math.random() >= pr) return;
    const nxt = B.units.filter((o) => o.alive && o !== a && o.side !== a.side && canHit(a, o))
      .sort((p, q) => p.hp - q.hp)[0];
    if (!nxt) return;
    addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.1) * TILE, '추격!', '#ffe08a');
    feed(`${a.name} — 추격 공격`, 'good');
    wait(() => {
      if (!B || B.over || !a.alive || !nxt.alive) return;
      attackUnit(a, nxt, { mult: 0.65, counterHit: true, noStrike: true }, () => {
        if (B && !B.over) finishCheck();
      });
    }, 240);
  }

  /* v5.31 — 혼란: 아군·적을 가리지 않고 사거리 안 부대를 친다 */
  function confusedStrike(u, done) {
    if (!u || !u.alive) { if (done) done(); return; }
    const cand = B.units.filter((o) => o.alive && o !== u && canHit(u, o));
    addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '혼란!', `rgb(${AIL.confuse.c})`);
    if (!cand.length) {
      u.acted = true;
      SKBattle.refreshUI();
      if (done) done();
      return;
    }
    const t = cand[Math.floor(Math.random() * cand.length)];
    u.acted = true;
    const foe = t.side !== u.side;
    feed(`${u.name}의 혼란 — ${foe ? '적' : '아군'} ${t.name}을 공격`, 'bad');
    attackUnit(u, t, { mult: 0.8, noDodge: false }, () => {
      if (!B || B.over) { if (done) done(); return; }
      finishCheck();
      if (done) done();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     v5.38 — 본진 점령은 즉시 승패가 아니라 '사기 역전'
     · 밟은 쪽 전군 사기 +25 (상한 110) · 빼앗긴 쪽 전군 사기 −25 (하한 0)
     · 한 번 점령된 본진은 다시 뒤집히지 않는다 (1회 처리)
     · 승패는 오직 전멸로만 갈린다 → 목표도 '적 전멸'
     ══════════════════════════════════════════════════════════════ */
  const HQ_MORALE = 25;
  function hqMoraleShift(u, d) {
    if (!u || !u.alive || !d) return 0;
    const before = u.morale == null ? 100 : u.morale;
    /* 점령 사기는 상태이상 저항(moraleSave)을 타지 않는다 — 판을 뒤집는 사건이라 그대로 준다 */
    u.morale = Math.round(clamp(before + d, 0, 110) * 10) / 10;
    const diff = u.morale - before;
    if (Math.abs(diff) >= 1) {
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.1) * TILE,
        `${diff > 0 ? '사기↑' : '사기↓'} ${Math.round(Math.abs(diff))}`, diff > 0 ? '#a8f0b8' : '#ff9a86');
    }
    return Math.round(diff);
  }
  function captureHQ(site, by) {
    if (!B || B.over || !site || site.captured) return false;
    site.captured = by;
    const mine = by === 'ally' ? 'ally' : 'enemy';
    B.units.forEach((u) => {
      if (!u.alive) return;
      hqMoraleShift(u, u.side === mine ? HQ_MORALE : -HQ_MORALE);
    });
    const hqLabel = site.type === 'enemyHQ' ? '적 본진' : '본진';
    const swing = by === 'ally' ? '아군 사기 +25 · 적군 사기 −25' : '적군 사기 +25 · 아군 사기 −25';
    const line = `${hqLabel} 점령! ${swing}`;
    feed(line, by === 'ally' ? 'good' : 'bad');
    banner(by === 'ally' ? '적 본진 점령!' : '본진 점령당했다!', by === 'ally' ? 'ally' : 'enemy');
    addFloat((site.x + 0.5) * TILE, (site.y + 0.42) * TILE, by === 'ally' ? '본진 점령!' : '본진 함락!', by === 'ally' ? '#ffe08a' : '#ff9a86');
    addFx({ kind: 'buff', x: (site.x + 0.5) * TILE, y: (site.y + 0.5) * TILE, life: 620, color: by === 'ally' ? '150,200,255' : '255,140,110' });
    addFx({ kind: 'buff', x: (site.x + 0.5) * TILE, y: (site.y + 0.5) * TILE, life: 900 });
    shakeScreen(6);
    SK.sfx.play('drum');
    if (SK.toast) SK.toast(line);
    SKBattle.refreshUI();
    return true;
  }

  function finishCheck() {
    if (B.over) return;
    sitePhase(false);          // v5.17 — 밟고 선 마을 점령 반영
    if (B.over) return;
    const allies = B.units.filter((u) => u.side === 'ally' && u.alive);
    const enemies = B.units.filter((u) => u.side === 'enemy' && u.alive);
    if (!enemies.length) { B.winReason = '적군 전멸'; return victory(); }
    if (!allies.length) { B.winReason = '아군 전멸'; return defeat(); }
    /* v5.32 — 총대장(군주·선봉) 격파로 끝나는 규칙 제거. 승패는 오직 전멸.
       예전에는 선봉 장수 한 명이 퇴각해도 아군 13,935명이 남은 채로 즉시 패배했다.
       v5.38 — 본진 점령도 즉시 승패에서 빼고 사기 역전으로 바꿨다. */
    const eHQ = (B.sites || []).find((s) => s.type === 'enemyHQ');
    const aHQ = (B.sites || []).find((s) => s.type === 'allyHQ');
    if (eHQ && !eHQ.captured && allies.some((u) => u.x === eHQ.x && u.y === eHQ.y)) captureHQ(eHQ, 'ally');
    if (aHQ && !aHQ.captured && enemies.some((u) => u.x === aHQ.x && u.y === aHQ.y)) captureHQ(aHQ, 'enemy');
    SKBattle.refreshUI();
  }

  function nextUnitOrWait() {
    /* v5.39 — 아직 걷지 않은 부대를 먼저 고른다 (이동만 해 둔 부대는 뒤 순서) */
    const next = B.units.find((u) => u.side === 'ally' && u.alive && !u.acted && !u.movedThisTurn)
      || B.units.find((u) => u.side === 'ally' && u.alive && !u.acted);
    if (next && next.ail && next.ail.confuse) {
      /* v5.31 — 혼란에 빠진 부대는 내가 조종하지 못한다 */
      selectUnit(next);
      busy = true;
      wait(() => {
        busy = false;
        if (!B || B.over) return;
        confusedStrike(next, () => wait(() => { if (B && !B.over) nextUnitOrWait(); }, 300));
      }, 260);
      return;
    }
    if (next) selectUnit(next);
    else {
      B.sel = null; mode = 'idle'; B.reachCache = null; SKBattle.refreshUI();
      $('#battle-tip').textContent = '모든 부대가 행동했습니다 — 잠시 뒤 적군 차례로 넘어갑니다.';
      scheduleAutoEndTurn();
    }
  }

  /* ══════════════════════════════════════════════════════════════
     v5.33 — 아군 부대가 모두 행동을 마치면 [턴 종료]를 누르지 않아도 자동으로 넘어간다.
     (사용자 제보: 마지막 부대까지 움직였는데 '턴 종료를 누르세요'에서 손이 멈춘다)
     · 아군 페이즈이고, 살아 있는 아군 중 아직 행동하지 않은 부대가 하나도 없을 때만
     · 마지막 연출이 끝나도록 400ms 기다렸다가 endTurn()
     · 창(모달)이 떠 있거나 아직 연출 중이면 미루고 다시 예약한다 (최대 8회)
     · 자동전투 중에는 autoStep이 진행하므로 끼어들지 않는다
     ══════════════════════════════════════════════════════════════ */
  let autoEndTimer = null;
  let autoEndTries = 0;
  function canActAlly() { return !!(B && B.units.some((u) => u.side === 'ally' && u.alive && !u.acted)); }
  function scheduleAutoEndTurn(delay) {
    if (!B || B.over || B.phase !== 'ally' || autoOn) return false;
    if (canActAlly()) return false;
    if (autoEndTimer) return true;
    autoEndTries = 0;
    const tick = (ms) => {
      autoEndTimer = wait(() => {
        autoEndTimer = null;
        if (!B || B.over || B.phase !== 'ally') return;
        if (canActAlly()) { autoEndTries = 0; return; }
        if (autoEndTries++ > 8) return;
        const modalOpen = !!document.querySelector('#modal-root .modal-layer');
        if (busy || modalOpen) { scheduleRetry(320); return; }
        endTurn();
      }, ms);
    };
    const scheduleRetry = (ms) => { if (autoEndTimer) return; tick(ms); };
    tick(delay == null ? 400 : delay);
    return true;
  }
  SK.scheduleAutoEndTurn = scheduleAutoEndTurn;
  /* 턴이 넘어가면 예약을 지운다 (적 페이즈·전투 종료·재시작에서 남지 않게) */
  function clearAutoEnd() {
    if (autoEndTimer) { clearTimeout(autoEndTimer); autoEndTimer = null; }
    autoEndTries = 0;
  }
  SK.clearAutoEnd = clearAutoEnd;

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
        <div><b>${sk.name}<em class="sk-rng">사거리 ${skRange(u, sk)}</em></b><span>${sk.desc}</span></div>
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
    u.mp -= mpCostOf(u, sk);
    castCircle(u, sk.kind === 'buffSelf' ? '150,210,255' : '255,215,120');
    SK.sfx.play(sk.kind === 'healArea' ? 'heal' : 'spell');
    if (sk.kind === 'healArea') {
      battleExp(u, 8);                       // v5.33 — 치유 책략도 실시간 경험치
      const rad = sk.radius + Math.max(0, Math.round((u.tfx && u.tfx.radius) || 0));
      B.units.forEach((t) => {
        if (t.alive && t.side === u.side && manh(u.x, u.y, t.x, t.y) <= rad) {
          const heal = healAmount(sk, t, u);
          t.hp = Math.min(t.maxHp, t.hp + heal);
          addHeal(t, heal, u);
          addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.4) * TILE, '+' + heal, '#a8f0b8');
          addFx({ kind: 'heal', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 620 });
          /* v5.31 — '상태이상 해제'가 적힌 회복 책략(천상의 가무) */
          if (/상태이상\s*해제|공포\s*상태\s*해제/.test(sk.desc || '')) ailClear(t, 2);
        }
      });
    } else if (sk.kind === 'buffSelf') {
      u.buffs.def = { v: sk.def, t: sk.turns };
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '방어↑', '#9fd8ff');
      addFx({ kind: 'buff', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 600, color: '150,210,255' });
    } else if (sk.kind === 'buffAreaAllies') {
      const rad = sk.radius + Math.max(0, Math.round((u.tfx && u.tfx.radius) || 0));
      const mo = skillMoraleOf(sk, true);
      B.units.forEach((t) => {
        if (t.alive && t.side === u.side && manh(u.x, u.y, t.x, t.y) <= rad) {
          t.buffs.atk = { v: sk.atk, t: sk.turns };
          if (mo) moraleShift(t, mo);
          if (/상태이상\s*해제|공포\s*상태\s*해제/.test(sk.desc || '')) ailClear(t, 2);
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
    if (dist > skRange(u, sk)) { SK.toast(`사거리 밖입니다. (사거리 ${skRange(u, sk)})`); return; }
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
      u.mp -= mpCostOf(u, sk);
      castCircle(u, sk.kind === 'heal' ? '150,240,180' : '255,215,120');
      SK.sfx.play(sk.kind === 'heal' ? 'heal' : 'spell');
      if (sk.kind === 'heal') {
        battleExp(u, 8);                     // v5.33 — 치유할 때도 경험치가 바로 쌓인다
        const heal = Math.round(healAmount(sk, target, u) * Math.max(0.85, Math.min(1.45, 1 + (magicAtk(u) - magicDef(target)) / 240)));
        target.hp = Math.min(target.maxHp, target.hp + heal);
        addHeal(target, heal, u);
        addFloat((x + 0.5) * TILE, (y + 0.4) * TILE, '+' + heal, '#a8f0b8');
        addFx({ kind: 'heal', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 700 });
        if (/상태이상|혼란/.test(sk.desc || '')) ailClear(target, 2);   // v5.31
      } else {
        target.buffs.atk = { v: sk.atk, t: sk.turns };
        const mo1 = skillMoraleOf(sk, true);
        if (mo1) moraleShift(target, mo1);                            // v5.31 — 아군 1부대 사기 +N
        addFloat((x + 0.5) * TILE, (y + 0.3) * TILE, '공격↑', '#ffe08a');
        addFx({ kind: 'buff', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 650, color: '255,215,120' });
      }
      finish(520);
      return;
    }

    if (sk.kind === 'debuffDef' || sk.kind === 'debuffAtk') {
      busy = true;
      u.mp -= mpCostOf(u, sk);
      castCircle(u, sk.kind === 'debuffDef' ? '190,160,255' : '255,170,215');
      SK.sfx.play('spell');
      const rad = (sk.radius || 1) + Math.max(0, Math.round((u.tfx && u.tfx.radius) || 0));
      const color = sk.kind === 'debuffDef' ? '190,160,255' : '255,170,215';
      const moNeg = skillMoraleOf(sk, false);
      B.units.forEach((t) => {
        if (t.alive && t.side !== u.side && manh(x, y, t.x, t.y) <= rad) {
          /* v5.31 — 혼란·위축·적 사기 -N이 적힌 약화 책략 */
          skillAilApply(u, t, sk);
          if (moNeg) moraleShift(t, moNeg);
          /* 책략이 강할수록 약화가 깊어진다 (0.75 ~ 1.35배) */
          const potency = Math.max(0.75, Math.min(1.35, 1 + (magicAtk(u) - magicDef(t)) / 280));
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
      u.mp -= mpCostOf(u, sk);
      castCircle(u, u.cls === 'balseokcha' ? '230,200,150' : '255,170,120');
      SK.sfx.play(u.cls === 'balseokcha' ? 'rock' : 'spell');
      const rad = (sk.radius || 1) + Math.max(0, Math.round((u.tfx && u.tfx.radius) || 0));
      wait(() => {
        if (!B || B.over) { finish(0); return; }
        addFx({ kind: 'burst', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 620, color: '255,150,80' });
        addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 760 });
        B.units.forEach((t) => {
          if (t.alive && t.side !== u.side && manh(x, y, t.x, t.y) <= rad) {
            const dmg = Math.max(10, Math.round((sk.power * 0.70 + magicAtk(u) * 2.25 - magicDef(t) * 2.20) * sizeScale(t) * 0.8
              * (1 + fxPct(u, 'magic')) * (1 - Math.min(0.5, Math.max(-0.5, fxPct(t, 'magicTaken'))))));
            t.hp = Math.max(0, t.hp - dmg);
            addMagicDamage(u, t, dmg);
            t.flash = 1; t.shake = 240;
            addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.4) * TILE, String(dmg), '#ffb36a');
            if (t.hp <= 0) downUnit(t);
            else skillAilApply(u, t, sk);   // v5.31 — 낙뢰·천벌강림의 기절·혼란
            if (t.alive && skillMoraleOf(sk, false)) moraleShift(t, skillMoraleOf(sk, false));
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
    u.mp -= mpCostOf(u, sk);
    if (sk.kind === 'magic') {
      castCircle(u, '255,170,120');
      SK.sfx.play('spell');
      wait(() => {
        if (!B || B.over) { finish(0); return; }
        const dmg = Math.max(10, Math.round((sk.power * 0.60 + magicAtk(u) * 3.40 - magicDef(target) * 2.25) * sizeScale(target) * 0.8
          * (1 + fxPct(u, 'magic')) * (1 - Math.min(0.5, Math.max(-0.5, fxPct(target, 'magicTaken'))))));
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
        /* v5.31 — 파천격(기절 35%)·방패돌진(기절 20%) */
        if (target.alive && B && !B.over) skillAilApply(u, target, sk);
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

  /* v5.36 — 전투 하단 [군량] 버튼에 선택한 부대의 남은 횟수를 적는다.
     부대가 없으면 '군량', 0이면 '군량 (0)' + 잠금(disabled) — 예전에는 남은 횟수를 알 길이 없었다. */
  function paintItemButton(u) {
    const btn = document.querySelector('#battle-actions .act.item');
    if (!btn) return;
    const lab = btn.querySelector('b');
    const n = u ? Math.max(0, Math.round(u.items || 0)) : null;
    if (lab) lab.textContent = n == null ? '군량' : `군량 (${n})`;
    const empty = n === 0;
    const canUse = u ? (u.side === 'ally' && !u.acted && !empty) : false;
    btn.classList.toggle('empty', empty);
    btn.classList.toggle('off', !!u && !canUse);
    btn.disabled = empty;
    btn.title = n == null ? '부대를 고르면 남은 횟수가 보입니다'
      : n === 0 ? '이 부대의 군량을 다 썼습니다' : `남은 군량 ${n}회 — 병력 32%를 회복합니다`;
  }

  /* ════════════════════════════════════════════════════════════════════════
     v5.54 — S급 장수의 고유 필살기 (전투당 1회)
     · S급 장수만 쓴다 (아군·적군 공통). u.ultUsed = false → true 로 한 번만.
     · 밸런스: 일반 공격의 +25~45% 안쪽 단일 강타, 또는 범위·상태이상·버프·회복 같은
       전술형. 340% 일격·쿨다운 초기화 같은 붕괴형은 넣지 않는다.
     · 연출: 전용 컷인 배너 + 장수 머리 위 전용 말풍선(초상·이름·필살기·대사)
       + 장수마다 다른 이펙트(16종) + 화면 물들임 + 진동.
     · 적 S급 AI도 사거리 안에 값진 대상이 있으면 필살기를 먼저 꺼낸다.
     ════════════════════════════════════════════════════════════════════════ */
  let ultShout = null;              // 캔버스 말풍선 (지금 떠 있는 필살기)
  let ultBubbleFrames = 0;          // 말풍선이 실제로 그려진 프레임 수 (검수용)
  let ultBanner = null;             // 컷인 배너 상태(색)
  const ULT_AIL_N = { stun: '기절', fear: '공포', confuse: '혼란', poison: '중독', burn: '화상', slow: '둔화' };

  /* 장수의 등급 — 아군은 '장수 원본 등급'(h.tier), 적은 부대 등급(u.tier)을 본다.
     (아군 부대 u.tier는 레벨로 매긴 전투 등급이라 Lv.1이면 C가 된다) */
  function unitTier(u) {
    if (!u) return '';
    if (u.side === 'ally' && u.uid && SK.state) {
      const h = (SK.state.heroes || []).find((x) => x.uid === u.uid);
      if (h && h.tier) return h.tier;
    }
    return u.tier || '';
  }
  /* v5.55 — 초상 테두리용 등급. 이름 있는 장수는 원본 등급, 병과 공용 부대는 C(초록) */
  function ptTier(u) {
    const t = giTierOf(u);
    return t || 'C';
  }
  /* 이 부대의 고유 필살기 — S급이 아니면 null */
  function ultOf(u) {
    if (!u || !SK.ULTIMATES) return null;
    if (unitTier(u) !== 'S') return null;
    return SK.ULTIMATES[u.name] || null;
  }
  const ULT_TARGET_KINDS = { hit: 1, combo: 1, aoe: 1, arrow: 1, arrowAoe: 1, magic: 1, rock: 1, debuff: 1 };
  function ultNeedsTarget(spec) { return !!(spec && spec.e && ULT_TARGET_KINDS[spec.e.k]); }
  function ultRange(u, spec) {
    if (!u || !spec || !spec.e) return 1;
    if (spec.e.rng) return spec.e.rng;
    const k = spec.e.k;
    const bonus = (k === 'magic' || k === 'rock' || k === 'debuff' || k === 'aoe' || k === 'arrowAoe') ? 1 : 0;
    return Math.max(1, effRng(u) + bonus);
  }
  function ultDesc(spec) {
    if (!spec || !spec.e) return '';
    const e = spec.e;
    const pc = (v) => Math.round((Number(v) || 0) * 100) + '%';
    const ail = e.ail ? ` · ${ULT_AIL_N[e.ail] || e.ail} ${Math.round((e.ch || 1) * 100)}%` : '';
    switch (e.k) {
      case 'hit': return `적 1부대에게 일반 공격의 ${pc(e.m)} 위력${ail}`;
      case 'combo': return `적 1부대를 ${e.n || 2}회 연속 강타 (합계 ${pc(e.m)})${ail}`;
      case 'aoe': return `지점 반경 ${e.r || 1}칸의 적 전원에게 ${pc(e.m)} 강타${ail}`;
      case 'arrow': return `${e.n || 2}발의 화살을 한 번에 (합계 ${pc(e.m)})${ail}`;
      case 'arrowAoe': return `지점 반경 ${e.r || 1}칸에 화살 세례 (부대당 ${pc(e.m)}·${e.n || 2}발)${ail}`;
      case 'magic': return `지점 반경 ${e.r || 1}칸에 책략 폭발 (화계의 ${pc(e.p || 1.2)} 위력)${ail}`;
      case 'rock': return `지점 반경 ${e.r || 1}칸에 투석 폭격 (${pc(e.p || 1.2)})${ail}`;
      case 'buff': {
        const p = [];
        if (e.atk) p.push(`공격 +${Math.round(e.atk * 100)}%`);
        if (e.def) p.push(`방어 +${Math.round(e.def * 100)}%`);
        if (e.morale) p.push(`사기 +${e.morale}`);
        return `반경 ${e.r || 2}칸 아군 전원 ${p.join(' · ')} (${e.turns || 3}턴)`;
      }
      case 'heal': return `반경 ${e.r || 2}칸 아군 병력 ${pc(e.p || 0.14)} 회복${e.clear ? ' · 상태이상 해제' : ''}${e.atk ? ` · 공격 +${Math.round(e.atk * 100)}%` : ''}`;
      case 'debuff': {
        const p = [];
        if (e.def) p.push(`방어 ${Math.round(e.def * 100)}%`);
        if (e.atk) p.push(`공격 ${Math.round(e.atk * 100)}%`);
        if (e.morale) p.push(`사기 ${e.morale}`);
        return `반경 ${e.r || 2}칸 적 전원 ${p.join(' · ')} (${e.turns || 3}턴)`;
      }
      default: return '고유 필살기';
    }
  }

  /* ── 연출: 컷인 배너 + 말풍선 + 화면 물들임 ─────────────────────────── */
  function showUltCutin(u, spec) {
    const el = $('#ult-cutin');
    if (!el) return;
    const img = $('#ult-img');
    if (img) { img.src = `${SK.ptSrc(u.portrait)}`; img.alt = u.name; SK.paintTier(img.parentElement, ptTier(u)); }
    const side = $('#ult-side');
    if (side) { side.textContent = u.side === 'ally' ? '아군 필살기' : '적군 필살기'; side.className = 'ult-side ' + u.side; }
    const nm = $('#ult-caster'), sk = $('#ult-skill'), q = $('#ult-line');
    if (nm) nm.textContent = u.name;
    if (sk) sk.textContent = `「${spec.n}」`;
    if (q) q.textContent = spec.q || '';
    el.style.setProperty('--ult-c', spec.c || '255,220,140');
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(ultBanner);
    ultBanner = wait(() => {
      el.classList.remove('show');
      ultBanner = wait(() => { el.hidden = true; el.setAttribute('aria-hidden', 'true'); }, 220);
    }, 1350);
    /* 장수 머리 위 전용 말풍선 — 카메라가 움직여도 따라간다 */
    ultShout = { uid: u.id, name: u.name, n: spec.n, q: spec.q || '', c: spec.c || '255,220,140',
      side: u.side, t: 0, life: 1750 };
    addFx({ kind: 'tint', life: 480, color: spec.c || '255,220,140' });
  }

  /* ── 이펙트: 장수마다 다른 16종 ─────────────────────────────────────── */
  function ultVfx(u, spec, tgt) {
    const cx = (rxOf(u) + 0.5) * TILE, cy = (ryOf(u) + 0.45) * TILE;
    const tx = tgt ? (rxOf(tgt) + 0.5) * TILE : cx;
    const ty = tgt ? (ryOf(tgt) + 0.5) * TILE : cy;
    const c = spec.c || '255,220,140';
    const v = spec.v || 'royal_aura';
    const e = spec.e || {};
    const rad = (e.r || 1) * TILE;
    const one = (o) => addFx(Object.assign({ kind: 'ult', sub: v, x: cx, y: cy, tx: tx, ty: ty, color: c, r: rad, life: 900 }, o || {}));
    one({ delay: 0 });
    if (v === 'fire_storm' || v === 'stone_barrage' || v === 'lightning_array') {
      wait(() => { if (B && !B.over) one({ x: tx, y: ty, tx: tx, ty: ty, delay2: 1, life: 900 }); }, 180);
    }
    if (v === 'combo' || v === 'slash_crimson' || v === 'dragon_cleave' || v === 'spear_storm') {
      wait(() => { if (B && !B.over) one({ x: tx, y: ty, tx: tx, ty: ty, delay2: 1, life: 520 }); }, 200);
    }
    if (v === 'roar_shockwave' || v === 'royal_aura' || v === 'iron_wall' || v === 'wind_gale') {
      wait(() => { if (B && !B.over) addFx({ kind: 'ult', sub: v, x: cx, y: cy, tx: tx, ty: ty, color: c, r: rad, life: 700, delay2: 1 }); }, 230);
    }
    /* 대상 위 타격감 */
    if (tgt) {
      wait(() => {
        if (!B || B.over) return;
        impactAt(tgt, c);
        shakeScreen(6);
      }, 320);
    }
  }

  /* ── 효과 적용 ─────────────────────────────────────────────────────── */
  function ultDmgHit(u, t, mult, opts) {
    if (!t || !t.alive) return 0;
    const res = calcDamage(u, t, Object.assign({ mult: mult, noCrit: true, firstStrike: false }, opts || {}));
    applyDamage(u, t, res.dmg, false, null);
    addFx({ kind: 'spark', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.4) * TILE, life: 300, color: '255,230,170' });
    return res.dmg;
  }
  function ultMagicHit(u, t, p) {
    if (!t || !t.alive) return 0;
    const dmg = Math.max(10, Math.round((240 * (p || 1.2) * 0.70 + magicAtk(u) * 2.25 - magicDef(t) * 2.20)
      * sizeScale(t) * 0.8 * (1 + fxPct(u, 'magic'))
      * (1 - Math.min(0.5, Math.max(-0.5, fxPct(t, 'magicTaken'))))));
    t.hp = Math.max(0, t.hp - dmg);
    addMagicDamage(u, t, dmg);
    t.flash = 1; t.shake = 240;
    addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.45) * TILE, String(dmg), '#ffb36a');
    if (t.hp <= 0) downUnit(t);
    return dmg;
  }
  function ultFoesAt(x, y, r, side) {
    return B.units.filter((o) => o.alive && o.side !== side && manh(x, y, o.x, o.y) <= r);
  }
  function applyUlt(u, spec, tgt) {
    if (!B || B.over || !u || !spec) return null;
    const e = spec.e || {};
    const foes = B.units.filter((o) => o.alive && o.side !== u.side);
    const allies = B.units.filter((o) => o.alive && o.side === u.side);
    const out = { dmg: 0, hits: [] };
    const ail = (t) => { if (t.alive && e.ail) ailApply(t, e.ail, e.ch == null ? 1 : e.ch, e.turns); };
    if (e.k === 'hit' || e.k === 'arrow') {
      if (!tgt || !tgt.alive) return out;
      if (e.k === 'arrow' && (e.n || 1) > 1) {
        const per = (e.m || 1.3) / (e.n || 1);
        for (let i = 0; i < (e.n || 1); i++) wait(() => { if (B && !B.over && tgt.alive) out.dmg += ultDmgHit(u, tgt, per); }, 90 * i);
      } else {
        out.dmg += ultDmgHit(u, tgt, e.m || 1.3);
      }
      ail(tgt);
    } else if (e.k === 'combo') {
      if (!tgt || !tgt.alive) return out;
      const n = e.n || 2, per = (e.m || 1.4) / n;
      for (let i = 0; i < n; i++) {
        wait(() => {
          if (!B || B.over || !tgt.alive) return;
          out.dmg += ultDmgHit(u, tgt, per);
          addFx({ kind: 'slash', x: (rxOf(tgt) + 0.5) * TILE, y: (ryOf(tgt) + 0.45) * TILE, life: 320 });
        }, 130 * i);
      }
      wait(() => ail(tgt), 130 * n + 40);
    } else if (e.k === 'aoe' || e.k === 'arrowAoe') {
      const cx = tgt ? tgt.x : u.x, cy = tgt ? tgt.y : u.y;
      const list = ultFoesAt(cx, cy, e.r || 1, u.side);
      list.forEach((t, i) => {
        wait(() => {
          if (!B || B.over || !t.alive) return;
          let d = 0;
          const n = (e.k === 'arrowAoe') ? (e.n || 2) : 1;
          for (let k = 0; k < n; k++) d += ultDmgHit(u, t, (e.m || 1) / n);
          out.dmg += d;
          out.hits.push(t.name);
          ail(t);
          if (e.morale) moraleShift(t, e.morale);
          addFx({ kind: 'burst', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.45) * TILE, life: 420, color: spec.c });
        }, 80 + i * 90);
      });
    } else if (e.k === 'magic' || e.k === 'rock') {
      const cx = tgt ? tgt.x : u.x, cy = tgt ? tgt.y : u.y;
      const list = ultFoesAt(cx, cy, e.r || 1, u.side);
      list.forEach((t, i) => {
        wait(() => {
          if (!B || B.over || !t.alive) return;
          out.dmg += ultMagicHit(u, t, e.p || 1.2);
          out.hits.push(t.name);
          ail(t);
          if (t.alive && e.morale) moraleShift(t, e.morale);
        }, 120 + i * 80);
      });
    } else if (e.k === 'buff') {
      const r = e.r || 2;
      allies.filter((a) => manh(u.x, u.y, a.x, a.y) <= r).forEach((a) => {
        if (e.atk) a.buffs.atk = { v: e.atk, t: e.turns || 3 };
        if (e.def) a.buffs.def = { v: e.def, t: e.turns || 3 };
        if (e.morale) moraleShift(a, e.morale);
        out.hits.push(a.name);
        addFx({ kind: 'buff', x: (rxOf(a) + 0.5) * TILE, y: (ryOf(a) + 0.5) * TILE, life: 640, color: spec.c });
        addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.2) * TILE, '필살기 ↑', '#ffe08a');
      });
      if (e.selfHeal) {
        const hl = Math.round(u.maxHp * e.selfHeal);
        u.hp = Math.min(u.maxHp, u.hp + hl);
        addHeal(u, hl, u);
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.35) * TILE, '+' + hl, '#a8f0b8');
      }
    } else if (e.k === 'heal') {
      const r = e.r || 2;
      allies.filter((a) => manh(u.x, u.y, a.x, a.y) <= r).forEach((a) => {
        const hl = Math.round(a.maxHp * (e.p || 0.14));
        a.hp = Math.min(a.maxHp, a.hp + hl);
        addHeal(a, hl, u);
        if (e.clear) ailClear(a, 3);
        if (e.atk) a.buffs.atk = { v: e.atk, t: e.turns || 3 };
        if (e.morale) moraleShift(a, e.morale);
        out.hits.push(a.name);
        addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.35) * TILE, '+' + hl, '#a8f0b8');
        addFx({ kind: 'heal', x: (rxOf(a) + 0.5) * TILE, y: (ryOf(a) + 0.5) * TILE, life: 680 });
      });
    } else if (e.k === 'debuff') {
      const cx = tgt ? tgt.x : u.x, cy = tgt ? tgt.y : u.y;
      const r = e.r || 2;
      const list = tgt ? ultFoesAt(cx, cy, r, u.side)
        : foes.filter((t) => manh(u.x, u.y, t.x, t.y) <= ultRange(u, spec));
      list.forEach((t) => {
        if (e.def) t.buffs.def = { v: e.def, t: e.turns || 3 };
        if (e.atk) t.buffs.atk = { v: e.atk, t: e.turns || 3 };
        if (e.morale) moraleShift(t, e.morale);
        out.hits.push(t.name);
        addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.3) * TILE, '약화!', '#c9a6ff');
        addFx({ kind: 'buff', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 620, color: spec.c });
      });
    }
    /* 부수 효과: 아군 공격 보정·자기 방어 */
    if (e.allyAtk) {
      allies.filter((a) => manh(u.x, u.y, a.x, a.y) <= 2).forEach((a) => { a.buffs.atk = { v: e.allyAtk, t: 3 }; });
    }
    if (e.selfDef) u.buffs.def = { v: e.selfDef, t: 3 };
    return out;
  }

  /* ── 시전 ──────────────────────────────────────────────────────────── */
  function castUlt(u, spec, tgt, done) {
    if (!B || B.over || !u || !u.alive || !spec || u.ultUsed) { if (done) done(); return false; }
    u.ultUsed = true;
    busy = true;
    mode = 'idle';
    pendingSkill = null;
    clearAutoEnd();
    SKBattle.refreshUI();
    showUltCutin(u, spec);
    feed(`${u.name}의 필살기 — 「${spec.n}」`, u.side === 'ally' ? 'good' : 'bad');
    addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.1) * TILE, `「${spec.n}」`, '#ffe6a8', { back: true });
    shakeScreen(7);
    SK.sfx.play('spell');
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      u.acted = true;
      busy = false;
      SKBattle.refreshUI();
      if (!B || B.over) { if (done) done(); return; }
      if (done) done(); else nextUnitOrWait();
    };
    wait(() => { if (B && !B.over) ultVfx(u, spec, tgt); }, 150);
    wait(() => {
      if (!B || B.over) { end(); return; }
      applyUlt(u, spec, tgt);
      finishCheck();
    }, 380);
    wait(end, 1250);
    return true;
  }

  /* ── AI: 필살기를 쓸 만한 순간인가 ─────────────────────────────────── */
  function planUlt(u) {
    if (!B || !u || u.ultUsed || u.acted || !u.alive) return null;
    const spec = ultOf(u);
    if (!spec || !B.introDone) return null;
    const e = spec.e || {};
    const foes = B.units.filter((o) => o.alive && o.side !== u.side);
    const allies = B.units.filter((o) => o.alive && o.side === u.side);
    if (!foes.length) return null;
    const range = ultRange(u, spec);
    if (ultNeedsTarget(spec)) {
      /* v5.54 — 지금 자리뿐 아니라 이번 턴에 걸어갈 수 있는 칸까지 본다.
         (여포 같은 근접 S급이 두 칸 밖에서 그냥 평타로 끝나던 문제) */
      const spots = [{ x: u.x, y: u.y }].concat(moveTiles(u).filter((t) => t.x !== u.x || t.y !== u.y));
      let best = null;
      spots.forEach((sp) => {
        foes.forEach((t) => {
          if (manh(sp.x, sp.y, t.x, t.y) > range) return;
          if (wallBlocked(sp, t) && !canShootOut(u)) return;
          let est = 0, hitN = 1, sumHp = 0;
          if (e.k === 'magic' || e.k === 'rock') {
            const near = ultFoesAt(t.x, t.y, e.r || 1, u.side);
            hitN = near.length;
            near.forEach((o) => {
              est += Math.max(10, Math.round((240 * (e.p || 1.2) * 0.70 + magicAtk(u) * 2.25 - magicDef(o) * 2.20) * sizeScale(o) * 0.8));
              sumHp += o.hp;
            });
          } else if (e.k === 'aoe' || e.k === 'arrowAoe') {
            const near = ultFoesAt(t.x, t.y, e.r || 1, u.side);
            hitN = near.length;
            near.forEach((o) => { est += calcDamage(u, o, { mult: e.m || 1, noCrit: true }).dmg; sumHp += o.hp; });
          } else {
            est = calcDamage(u, t, { mult: e.m || 1.3, noCrit: true }).dmg;
            sumHp = t.hp;
          }
          const kill = est >= t.hp || (hitN > 1 && est >= sumHp);
          const away = manh(u.x, u.y, sp.x, sp.y) * 1.2;
          const worth = (est / Math.max(1, sumHp)) * 100 + (kill ? 110 : 0) + (hitN > 1 ? hitN * 22 : 0) + effAtk(t) * 0.25 - away;
          if (!best || worth > best.score) best = { x: sp.x, y: sp.y, tx: t.x, ty: t.y, target: t, score: worth, kill: kill, hitN: hitN, ratio: est / Math.max(1, sumHp) };
        });
      });
      if (!best) return null;
      if (!(best.kill || best.hitN >= 2 || best.ratio >= 0.3)) return null;
      return best;
    }
    if (e.k === 'heal') {
      const hurt = allies.filter((a) => a.hp < a.maxHp * 0.82).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      if (hurt.length >= 2 || (hurt.length >= 1 && hurt[0].hp < hurt[0].maxHp * 0.55)) {
        return { x: u.x, y: u.y, target: null, score: 80, kill: false, hitN: hurt.length, ratio: 1 };
      }
      return null;
    }
    if (e.k === 'buff') {
      const r = e.r || 2;
      const group = allies.filter((a) => manh(u.x, u.y, a.x, a.y) <= r);
      if (group.length >= 3 || (group.length >= 2 && B.turn >= 2)) {
        return { x: u.x, y: u.y, target: null, score: 60, kill: false, hitN: group.length, ratio: 1 };
      }
      return null;
    }
    if (e.k === 'debuff') {
      let best = null;
      foes.forEach((t) => {
        if (manh(u.x, u.y, t.x, t.y) > range) return;
        const near = ultFoesAt(t.x, t.y, e.r || 2, u.side);
        const sc = near.length * 45 + effAtk(t) * 0.3;
        if (!best || sc > best.score) best = { x: u.x, y: u.y, tx: t.x, ty: t.y, target: t, score: sc, kill: false, hitN: near.length, ratio: 1 };
      });
      return (best && best.score >= 90) ? best : null;
    }
    return null;
  }

  /* ── 버튼·메뉴 ─────────────────────────────────────────────────────── */
  function paintUltButton(u) {
    const btn = document.querySelector('#battle-actions .act.ult');
    if (!btn) return;
    const em = btn.querySelector('em');
    const spec = u ? ultOf(u) : null;
    const isS = !!(u && unitTier(u) === 'S');
    const used = !!(u && u.ultUsed);
    const canUse = !!(u && u.side === 'ally' && !u.acted && spec && !used);
    if (em) em.textContent = !u ? '—' : (spec ? (used ? '0/1' : '1/1') : (isS ? '—' : 'S급'));
    btn.classList.toggle('ready', canUse);
    btn.classList.toggle('off', !canUse);
    btn.classList.toggle('active', mode === 'ultTarget' && canUse);
    btn.title = !u ? '부대를 고르면 필살기를 쓸 수 있습니다'
      : !spec ? '고유 필살기는 S급 장수만 씁니다'
        : used ? `「${spec.n}」 — 이 전투에서 사용 완료` : `「${spec.n}」 — 전투당 1회`;
    const lab = btn.querySelector('b');
    if (lab) lab.textContent = '필살기';
  }

  function openUltMenu() {
    const u = B && B.sel;
    if (!B || B.phase !== 'ally' || B.over) return;
    if (!u || u.side !== 'ally' || u.acted) { SK.toast('먼저 내 부대를 선택하세요.'); return; }
    const spec = ultOf(u);
    if (!spec) { SK.toast(unitTier(u) === 'S' ? '이 장수의 고유 필살기가 아직 없습니다.' : '고유 필살기는 S급 장수만 씁니다.'); return; }
    if (u.ultUsed) { SK.toast(`「${spec.n}」은(는) 이 전투에서 이미 썼습니다.`); return; }
    if (!ultNeedsTarget(spec)) {
      castUlt(u, spec, null);
      return;
    }
    mode = 'ultTarget';
    SKBattle.refreshUI();
    const tip = $('#battle-tip');
    if (tip) tip.textContent = `「${spec.n}」 — 사거리 ${ultRange(u, spec)}칸 안의 적을 선택하세요`;
  }


  /* ───────────── 아이템/대기 ───────────── */
  function useItem() {
    const u = B.sel;
    if (!u || u.acted) { SK.toast('부대를 먼저 선택하세요.'); return; }
    if (u.items <= 0) { SK.toast('군량이 없습니다.'); return; }
    u.items -= 1;
    const heal = Math.round(u.maxHp * 0.32 * (1 + fxPct(u, 'heal')));
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

  /* ══════════════════════════════════════════════════════════════
     v5.53 — 조조전 스타일 《장수 정보》 (아군·적군 공통)
     · 전장에서 부대를 누르면 아래 카드에 그 부대가 뜨고, 카드의 초상화나
       [정보]를 누르면 이 창이 열린다. 적군·일반 부대도 읽기 전용으로 열린다.
     · 머리: 초상·이름·진영·병과·Lv·등급(S/A/B/C)·HP/MP/EXP·지형
     · 3탭: 능력(전투 스탯·5대 능력·상태) / 장비(보물·보정) / 특성·기술(고유 특기·병종·책략·버프·인연)
     · 아래: [이전] / [다음] — 같은 진영 부대 안에서 넘긴다. [닫기]
     ══════════════════════════════════════════════════════════════ */
  let giTab = 'stat';
  let giUid = null;
  let giTimer = null;

  function giHero(u) {
    return (u && u.side === 'ally' && u.uid && SK.state)
      ? ((SK.state.heroes || []).find((x) => x.uid === u.uid) || null) : null;
  }
  function giGen(u) {
    if (!u || u.genId == null || !SK.GEN_BY_ID) return null;
    return SK.GEN_BY_ID[u.genId] || null;
  }
  function giTierOf(u) {
    const h = giHero(u);
    /* v5.54 — 아군은 장수 원본 등급(h.tier)을 먼저 본다 (부대 u.tier는 레벨로 매긴 전투 등급) */
    const t = (h && h.tier) || (u && u.tier) || '';
    return SK.TIER_LV[t] ? t : '';
  }
  function giFive(u) {
    const h = giHero(u), g = giGen(u), src = h || g;
    if (!src) return null;
    const eq = h && SK.equipBonus ? SK.equipBonus(h) : null;
    const pick = (a, b) => (src[a] != null ? src[a] : (src[b] != null ? src[b] : null));
    return {
      tong: { base: pick('tong', 'leadership'), add: eq ? eq.leadership : 0 },
      wu: { base: pick('wu', 'war'), add: eq ? eq.war : 0 },
      ji: { base: pick('ji', 'intel'), add: eq ? eq.intel : 0 },
      pol: { base: pick('pol', 'politics'), add: eq ? eq.politics : 0 },
      cha: { base: pick('cha', 'charm'), add: eq ? eq.charm : 0 },
    };
  }
  function giExp(u) {
    const h = giHero(u);
    if (!h) return { val: 0, need: 0, has: false };
    const need = SK.expNeed ? SK.expNeed(h.lv) : 100;
    return { val: Math.max(0, Math.round(h.exp || 0)), need, has: true };
  }
  const GI_BUFF = { atk: '공격', def: '방어', crit: '치명', evade: '회피' };
  const GI_WEAPON = {
    sword: '검', spear: '창', bow: '활', crossbow: '석궁', axe: '도끼', fan: '부채',
    staff: '지팡이', fist: '맨손', trident: '삼지창', claw: '발톱', ribbon: '채찍',
    catapult: '투석기', ram: '충차', drum: '북',
  };
  const GI_TRIGGER = { passive: '상시', turn_start: '턴 시작', on_attack: '공격 시' };

  function giStateChips(u, kind) {
    const out = [];
    if (kind === 'ail') {
      if (u.ail) {
        Object.keys(AIL).forEach((k) => {
          const t = u.ail[k];
          if (t > 0) out.push(`<span class="gi-st bad">${AIL[k].n} <em>${t}턴</em></span>`);
        });
      }
      if (u.aboard) out.push('<span class="gi-st good">조각배 <em>수상</em></span>');
      if (u.side === 'ally' && u.acted) out.push('<span class="gi-st dim">행동 완료</span>');
      if (!out.length) out.push('<span class="gi-st normal">정상</span>');
    } else {
      if (u.buffs) {
        Object.keys(u.buffs).forEach((k) => {
          const b = u.buffs[k];
          if (!b || b.t <= 0 || !b.v) return;
          const v = Math.round(b.v * 100);
          out.push(`<span class="gi-st ${v >= 0 ? 'good' : 'bad'}">${GI_BUFF[k] || k} ${v >= 0 ? '+' : ''}${v}% <em>${b.t}턴</em></span>`);
        });
      }
      if (u.side === 'ally' && bondAllyMul(u) > 1) out.push('<span class="gi-st good">인연 <em>공격 +15%</em></span>');
      if (!out.length) out.push('<span class="gi-st normal">없음</span>');
    }
    return out.join('');
  }

  function giHeaderHTML(u) {
    const C = SK.CLASSES[u.cls] || { name: '부대' };
    const tr = SK.TERRAIN[B.tiles[u.y][u.x]] || SK.TERRAIN.P;
    const h = giHero(u), g = giGen(u);
    const tier = giTierOf(u);
    const promo = (SK.classTitle && C.name) ? SK.classTitle(u.cls, u.lv) : '';
    const hpPct = Math.round(clamp(u.hp / Math.max(1, u.maxHp), 0, 1) * 100);
    const mpPct = Math.round(clamp(u.mp / Math.max(1, u.maxMp), 0, 1) * 100);
    const ex = giExp(u);
    const exPct = ex.has ? Math.round(clamp(ex.val / Math.max(1, ex.need), 0, 1) * 100) : 0;
    const tile = B.tiles[u.y][u.x];
    const holdTag = tile === 'T' ? '망루 방어↑' : tile === 'K' ? '본성 방어↑' : '';
    const aff = (SK.affinity ? SK.affinity(u.cls, tile) : null);
    const chips = [
      `<span class="gi-chip side ${u.side}">${u.side === 'ally' ? '아군' : '적군'}</span>`,
      `<span class="gi-chip">${C.name}</span>`,
      promo && promo !== C.name ? `<span class="gi-chip">${promo}</span>` : '',
      `<span class="gi-chip">Lv.${u.lv}</span>`,
      tier ? `<span class="gi-chip tier t${tier}">${tier}급</span>` : '',
      u.boss ? '<span class="gi-chip boss">적장</span>' : '',
      !u.alive ? '<span class="gi-chip down">전투 불능</span>' : '',
    ].filter(Boolean).join('');
    return `<div class="gi-frame tf ${tier ? `tier-${tier}` : 'tier-C'}"><img src="${SK.ptSrc(u.portrait)}" alt="" /><span class="gi-lvtag">Lv.${u.lv}</span></div>
      <div class="gi-hmain">
        <div class="gi-hname"><b>${u.name}</b>${u.hanja ? `<span>${u.hanja}</span>` : ''}</div>
        <div class="gi-chips">${chips}</div>
        <div class="gi-bars">
          <div class="gi-bar2 hp"><i style="width:${hpPct}%"></i><em>병력 ${Math.round(u.hp).toLocaleString('ko-KR')} / ${Math.round(u.maxHp).toLocaleString('ko-KR')}</em></div>
          <div class="gi-bar2 mp"><i style="width:${mpPct}%"></i><em>기력 ${u.mp} / ${u.maxMp}</em></div>
          ${ex.has
            ? `<div class="gi-bar2 exp"><i style="width:${exPct}%"></i><em>EXP ${ex.val} / ${ex.need}</em></div>`
            : '<div class="gi-bar2 exp"><i style="width:0%"></i><em>EXP —</em></div>'}
        </div>
        <div class="gi-terrline">지형 <b>${tr.name}</b> · 방어 <b>${tr.def >= 0 ? '+' : ''}${Math.round(tr.def * 100)}%</b>${holdTag ? ` · ${holdTag}` : ''}${aff && aff.label ? ` · ${aff.label}` : ''}</div>
      </div>`;
  }

  function giStatHTML(u) {
    const tr = SK.TERRAIN[B.tiles[u.y][u.x]] || SK.TERRAIN.P;
    const five = giFive(u);
    const morale = Math.round(u.morale == null ? 100 : u.morale);
    const moralePct = Math.round((moraleMul(u) - 1) * 100);
    const tile = B.tiles[u.y][u.x];
    const hold = tile === 'T' ? '<span class="gi-st good">망루 방어↑·회복</span>'
      : tile === 'K' ? '<span class="gi-st good">본성 방어↑·회복</span>' : '';
    const cells = [
      ['공격력', Math.round(effAtk(u))],
      ['방어력', Math.round(effDef(u))],
      ['책략공격', Math.round(magicAtk(u))],
      ['책략방어', Math.round(magicDef(u))],
      ['이동력', movOf(u)],
      ['사거리', (u.minRng || 1) > 1 ? `${u.minRng}~${effRng(u)}` : effRng(u)],
      ['사기', morale],
      ['훈련도', u.train == null ? trainOf(u.lv, u.tier) : u.train],
    ].map(([k, v]) => `<span class="gi-cell"><i>${k}</i><b>${v}</b></span>`).join('');
    const fiveNames = [['통솔', 'tong'], ['무력', 'wu'], ['지력', 'ji'], ['정치', 'pol'], ['매력', 'cha']];
    const fiveHtml = five ? fiveNames.map(([lab, k]) => {
      const st = five[k];
      const base = st.base == null ? '—' : st.base;
      const add = (st.base != null && st.add) ? `<em>+${st.add}</em>` : '';
      return `<span class="gi-cell"><i>${lab}</i><b>${base}${add}</b></span>`;
    }).join('') : '';
    return `<p class="gi-sec">전투 능력</p>
      <div class="gi-grid">${cells}</div>
      <p class="gi-sec">기본 능력</p>
      ${five ? `<div class="gi-grid five">${fiveHtml}</div>`
        : '<p class="gi-note">일반 부대 — 통솔·무력·지력·정치·매력은 이름 있는 장수만 가집니다.</p>'}
      <p class="gi-sec">지형·사기</p>
      <div class="gi-state">
        <span class="gi-st">${tr.name}</span>
        <span class="gi-st ${tr.def >= 0 ? 'good' : 'bad'}">방어 ${tr.def >= 0 ? '+' : ''}${Math.round(tr.def * 100)}%</span>
        ${hold}
        <span class="gi-st ${morale >= 100 ? 'good' : (morale >= 80 ? '' : 'bad')}">사기 ${morale} <em>공격 ${moralePct >= 0 ? '+' : ''}${moralePct}%</em></span>
      </div>
      <p class="gi-sec">현재 상태</p>
      <div class="gi-state">${giStateChips(u, 'ail')}</div>`;
  }

  function giEquipHTML(u) {
    const h = giHero(u);
    const C = SK.CLASSES[u.cls] || {};
    const wpn = GI_WEAPON[C.weapon] || '기본 병장';
    const rows = Object.keys(SK.SLOT_NAMES).map((sl) => {
      const t = h && h.equip && h.equip[sl] ? SK.TREASURE_BY_ID[h.equip[sl]] : null;
      if (!t) {
        return `<div class="gi-eq-row none"><span class="gi-slot">${SK.SLOT_NAMES[sl]}</span><div><b>미착용</b></div></div>`;
      }
      const st = SK.treasureStats(t);
      const bonus = [];
      [['war', '무력'], ['intel', '지력'], ['leadership', '통솔'], ['politics', '정치'], ['charm', '매력'], ['move', '이동력'], ['rng', '사거리']]
        .forEach(([k, lab]) => { if (st[k]) bonus.push(`${lab} +${st[k]}`); });
      const grade = t.grade || '일반';
      return `<div class="gi-eq-row"><span class="gi-slot">${SK.SLOT_NAMES[sl]}</span><div>
        <b style="color:${SK.GRADE_COLOR[grade] || '#8a7a5a'}">${t.name}</b>
        <em><span class="gi-grade">${grade}</span>${bonus.join(' · ') || '능력치 보정 없음'}</em>
        ${t.effect ? `<p>${t.effect}</p>` : ''}</div></div>`;
    }).join('');
    const eq = h && SK.equipBonus ? SK.equipBonus(h) : null;
    const sum = [];
    if (eq) {
      [['war', '무력'], ['intel', '지력'], ['leadership', '통솔'], ['politics', '정치'], ['charm', '매력'], ['move', '이동력'], ['rng', '사거리']]
        .forEach(([k, lab]) => { if (eq[k]) sum.push(`${lab} +${eq[k]}`); });
    }
    let fxLine = '';
    if (h && SK.heroTreasureFx && SK.fxSumLine) {
      const parts = SK.fxSumLine(SK.heroTreasureFx(h), true) || [];
      if (parts.length) fxLine = parts.join(' · ');
    }
    return `<p class="gi-sec">장비</p>
      <div class="gi-eq">
        <div class="gi-eq-row"><span class="gi-slot">병장</span><div><b>${wpn}</b><em>병과 기본 무기 · 보정 없음</em></div></div>
        ${rows}
      </div>
      <p class="gi-sum">보물 보정 — ${sum.length ? sum.join(' · ') : '없음'}</p>
      ${fxLine ? `<p class="gi-sum">전장 적용 — ${fxLine}</p>` : ''}
      ${h ? '' : '<p class="gi-note">적군 부대와 일반 부대는 보물을 장착하지 않습니다.</p>'}`;
  }

  function giTraitHTML(u) {
    const C = SK.CLASSES[u.cls] || {};
    const p = u.passive;
    let uniq;
    if (p) {
      uniq = `<div class="gi-trait"><b>「${p.title || u.skillName || '고유 특기'}」<em>${GI_TRIGGER[p.trigger] || '공격 시'}</em></b><p>${p.effect || ''}</p></div>`;
    } else if (u.skillName) {
      uniq = `<div class="gi-trait"><b>「${u.skillName}」</b><p>열전에 기록된 특기입니다. 전장 수치 효과는 아직 붙지 않았습니다.</p></div>`;
    } else {
      uniq = '<p class="gi-note">고유 특기 없음 — 상위 100명 장수만 고유 특기를 가집니다.</p>';
    }
    const skills = (u.skills || []).map((k) => {
      const sk = SK.SKILLS[k];
      if (!sk) return '';
      const rng = sk.radius ? `반경 ${sk.radius}` : `사거리 ${skRange(u, sk)}`;
      const off = u.mp < sk.mp ? ' off' : '';
      return `<div class="skill-row gi-skill${off}"><span class="sk-mp">${sk.mp}</span>
        <div><b>${sk.name}<em class="sk-rng">${rng}</em></b><span>${sk.desc || ''}</span></div></div>`;
    }).join('');
    const bonds = (SK.bondsOf ? SK.bondsOf(u.name) : []).map((b) => {
      const partner = SK.bondPartner(b, u.name);
      const mate = B.units.find((o) => o.alive && o !== u && o.name === partner);
      const rival = b.relation === '숙적';
      return `<div class="gi-bond ${rival ? 'rival' : 'friend'}">
        <span class="gi-bond-tag">${rival ? '숙적' : '친밀'}</span>
        <div><b>${partner}</b><em>${b.title || ''}</em><p>${b.effect || ''}</p></div>
        ${mate ? `<i class="gi-bond-on">${mate.side === u.side ? '참전' : '적군 참전'}</i>` : ''}
      </div>`;
    }).join('');
    /* v5.54 — S급 고유 필살기 (이름·효과·사용 가능/사용 완료) */
    const us = ultOf(u);
    const tierS = giTierOf(u) === 'S';
    const ultBlock = us
      ? `<div class="gi-trait gi-ult${u.ultUsed ? ' used' : ''}"><b>「${us.n}」<em>${u.ultUsed ? '사용 완료' : '사용 가능'} · 전투당 1회</em></b>
          <p>${ultDesc(us)}</p><p class="gi-ult-q">"${us.q || ''}"</p></div>`
      : (tierS ? '<p class="gi-note">이 장수의 고유 필살기가 아직 없습니다.</p>'
        : '<p class="gi-note">고유 필살기는 S급 장수만 씁니다.</p>');
    return `<p class="gi-sec">고유 특기</p>${uniq}
      <p class="gi-sec">고유 필살기 <em class="gi-sec-sub">전투당 1회</em></p>${ultBlock}
      <p class="gi-sec">병종 특성</p>
      <div class="gi-trait"><b>${C.name}<em>${C.role || ''}</em></b><p>${C.desc || ''}</p></div>
      <p class="gi-sec">보유 책략</p>
      ${skills ? `<div class="skill-list gi-skills">${skills}</div>` : '<p class="gi-note">책략이 없는 병과입니다.</p>'}
      <p class="gi-sec">현재 버프</p>
      <div class="gi-state">${giStateChips(u, 'buff')}</div>
      <p class="gi-sec">인연</p>
      ${bonds || '<p class="gi-note">맺은 인연이 없습니다.</p>'}`;
  }

  function giAttackTarget(u) {
    const a = B && B.sel;
    return !!(a && u && a.side === 'ally' && a.alive && !a.acted && u.side === 'enemy' && u.alive
      && B.phase === 'ally' && canHit(a, u));
  }

  function giRender() {
    const panel = $('#gen-info');
    if (!panel || panel.hidden || !B) return;
    const u = B.units.find((o) => o.id === giUid);
    if (!u) { closeGenInfo(); return; }
    $('#gi-head').innerHTML = giHeaderHTML(u);
    $('#gi-body').innerHTML = giBodyHTML(u);
    panel.querySelectorAll('.gi-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === giTab));
    const list = giSideList(u);
    const idx = list.findIndex((o) => o.id === u.id);
    $('#gi-pos').textContent = idx >= 0 ? `${idx + 1} / ${list.length}` : '—';
    $('#gi-prev').disabled = list.length < 2;
    $('#gi-next').disabled = list.length < 2;
    const bar = $('#gi-actbar');
    const canAtk = giAttackTarget(u);
    if (bar) bar.hidden = !canAtk;
    if (canAtk) $('#gi-attack').textContent = `공격 예고 · ${B.sel.name} → ${u.name}`;
  }

  function giBodyHTML(u) {
    if (giTab === 'equip') return giEquipHTML(u);
    if (giTab === 'trait') return giTraitHTML(u);
    return giStatHTML(u);
  }

  function giSideList(u) {
    if (!B) return [];
    return B.units.filter((o) => o.alive && o.side === u.side);
  }

  function giState() {
    const panel = $('#gen-info');
    if (!panel || panel.hidden || !B) return null;
    const u = B.units.find((o) => o.id === giUid);
    if (!u) return null;
    const list = giSideList(u);
    const txt = (el) => (el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '');
    return {
      name: u.name, side: u.side, tab: giTab,
      tabs: Array.from(panel.querySelectorAll('.gi-tab')).map((b) => txt(b)),
      pos: txt($('#gi-pos')).replace(/\s*\/\s*/g, '/'),
      idx: list.findIndex((o) => o.id === u.id) + 1, total: list.length,
      head: txt($('#gi-head')),
      body: txt($('#gi-body')),
      attack: !!($('#gi-actbar') && !$('#gi-actbar').hidden),
      attackLabel: txt($('#gi-attack')),
    };
  }

  function openGenInfo(u) {
    const panel = $('#gen-info');
    if (!panel || !u || !B) return null;
    /* 창을 새로 열면 '능력' 탭부터 — [이전]/[다음]으로 부대를 넘길 때만 보던 탭을 유지한다 */
    if (panel.hidden) giTab = 'stat';
    giUid = u.id;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    giRender();
    if (giTimer) clearInterval(giTimer);
    /* 뒤에서 전투가 계속 도는 경우(적군 페이즈)에도 머리의 병력·기력은 따라간다.
       본문은 다시 그리지 않아 스크롤이 튀지 않는다. */
    giTimer = setInterval(() => {
      if (!B || B.over) { closeGenInfo(); return; }
      const cur = B.units.find((o) => o.id === giUid);
      if (!cur) { closeGenInfo(); return; }
      const head = $('#gi-head');
      if (head) head.innerHTML = giHeaderHTML(cur);
      const bar = $('#gi-actbar');
      if (bar) {
        const canAtk = giAttackTarget(cur);
        bar.hidden = !canAtk;
        if (canAtk) $('#gi-attack').textContent = `공격 예고 · ${B.sel.name} → ${cur.name}`;
      }
    }, 900);
    return giState();
  }

  function closeGenInfo() {
    const panel = $('#gen-info');
    if (giTimer) { clearInterval(giTimer); giTimer = null; }
    giUid = null;
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
  }

  function giNav(dir) {
    const u = B && B.units.find((o) => o.id === giUid);
    if (!u) { closeGenInfo(); return; }
    const list = giSideList(u);
    if (list.length < 2) return;
    let i = list.findIndex((o) => o.id === u.id);
    if (i < 0) i = 0;
    const nx = list[(i + dir + list.length) % list.length];
    giUid = nx.id;
    if (nx.side === 'enemy') B.insp = nx;   // 적군을 넘겨 보면 아래 카드도 그 적을 따라간다
    giRender();
    if (SK.sfx) SK.sfx.play('ui');
  }

  /* 전장에서 부대를 눌렀을 때 — 아래 카드에 띄우고(읽기 전용) 필요하면 창까지 연다 */
  function inspectUnit(u, opts) {
    if (!B || !u || !u.alive) return;
    B.insp = u;
    SKBattle.refreshUI();
    const tr = SK.TERRAIN[B.tiles[u.y][u.x]] || SK.TERRAIN.P;
    const tip = $('#battle-tip');
    if (tip) {
      tip.textContent = `${u.name} · ${(SK.CLASSES[u.cls] || {}).name || ''} · ${tr.name} 방어 ${Math.round(tr.def * 100)}% · [정보] 장수 정보`;
    }
    /* 카메라는 그대로 둔다 — 누른 부대는 이미 화면 안에 있고, 창을 닫으면 보던 자리 그대로다 */
    if (opts && opts.open) openGenInfo(u);
  }

  /* v5.53 — 예전 적군 정보 창(showUnitInfo)은 새 《장수 정보》로 통일했다 */
  function showUnitInfo(t) { return inspectUnit(t, { open: true }); }

  /* ───────────── 턴 종료·AI ───────────── */
  function endTurn() {
    if (!B || B.over || B.phase !== 'ally' || busy) return;
    clearAutoEnd();
    B.phase = 'enemy';
    B.sel = null; mode = 'idle'; B.reachCache = null;
    SKBattle.refreshUI();
    /* v5.33 — 자동으로 넘어갔을 때 '턴 종료를 누르세요' 안내가 남지 않게 */
    const tipEl = $('#battle-tip');
    if (tipEl && /턴 종료|넘어갑니다/.test(tipEl.textContent || '')) tipEl.textContent = '적군 페이즈 — 적군이 움직입니다';
    banner('적군 페이즈', 'enemy');
    wait(enemyPhase, 650);
  }

  /* ───────────── v5.2 — 아군 턴 [자동] 진행 ───────────── */
  function autoClear() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } }
  function speedLabel() { return '×' + autoSpeed; }
  function paintSpeedBtn() {
    const btn = document.querySelector('#btn-speed, .act.speed');
    if (!btn) return;
    btn.classList.toggle('fast', autoSpeed >= 2);
    if (btn) btn.title = `전투 배속 — 수동·자동 모두. 누를 때마다 ×1 → ×2 → ×3 → ×4 (지금 ×${autoSpeed})`;
    const sp = btn.querySelector('span');
    if (sp) sp.textContent = speedLabel();
    btn.setAttribute('aria-label', `전투 배속 ${speedLabel()}`);
  }
  function toggleSpeed() {
    /* v5.17 — 대형 전장(24·28·32칸)에서는 전투가 길어 ×3 단계를 더한다
       v5.26 — ×4까지. ×3·×4는 한 판에 몇 분씩 걸리는 대형 수성전·32×32 전장용 */
    autoSpeed = autoSpeed >= 4 ? 1 : autoSpeed + 1;
    speedPref = autoSpeed;
    paintSpeedBtn();
    SK.sfx.play('ui');
    SK.toast(autoSpeed === 4 ? '전투 배속 ×4 — 연출을 줄여 가장 빠르게 돌립니다.'
      : autoSpeed === 3 ? '전투 배속 ×3 — 아주 빠르게 진행합니다.'
      : autoSpeed === 2 ? '전투 배속 ×2 — 빠르게 진행합니다.'
      : '전투 배속 ×1 — 기본 속도로 돌아갑니다.');
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
    let base = (effAtk(u) * 0.92 - def * 0.52) * 12 * sizeScale(f) * atkScale(u) * tri.mul;
    if (attackKind(u) === 'rock') base *= 0.55;
    return Math.max(4, Math.round(base));
  }

  function estSkillDmg(u, f, sk) {
    const tri = SK.triangleMul ? SK.triangleMul(u.cls, f.cls) : { mul: 1 };
    if (sk.kind === 'power') {
      let mult = sk.power || 1.4;
      if (sk.vsMount && (f.cls === 'gibi' || (SK.CLASSES[f.cls] && SK.CLASSES[f.cls].mount))) mult += sk.vsMount;
      let base = (effAtk(u) * mult * 0.92 - effDef(f) * 0.52) * 12 * sizeScale(f) * atkScale(u) * tri.mul;
      if (attackKind(u) === 'rock') base *= 0.55;
      return Math.max(4, Math.round(base)) * (sk.hits || 1);
    }
    if (sk.kind === 'magic') {
      return Math.max(10, Math.round((sk.power * 0.60 + magicAtk(u) * 3.40 - magicDef(f) * 2.25) * sizeScale(f) * 0.8));
    }
    if (sk.kind === 'magicArea') {
      return Math.max(10, Math.round((sk.power * 0.70 + magicAtk(u) * 2.25 - magicDef(f) * 2.20) * sizeScale(f) * 0.8));
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
    /* v5.49 — 마을을 밟으면서 책략을 펼칠 수 있으면 그 자리를 고른다 (점령 값의 절반만 반영) */
    const vBoost = (t, canStrike) => villageValueAt(u, t.x, t.y, { foes, canStrike }) * 0.6;

    /* 1) 회복 — HP 85% 이하 아군이 있으면 최우선 */
    const heals = skills.filter((s) => s.kind === 'heal' || s.kind === 'healArea');
    const hurt = allies.filter((a) => a.hp < a.maxHp * 0.85).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (heals.length && hurt.length) {
      let best = null;
      heals.forEach((sk) => {
        tiles.forEach((t) => {
          if (sk.kind === 'heal') {
            const reach = skRange(u, sk);
            hurt.forEach((a) => {
              if (dTo(t, a.x, a.y) > reach) return;
              /* v5.33 — 적에게 붙는 자리에서 시전하지 않는다 */
              const sc = (1 - a.hp / a.maxHp) * 130 - dTo(t, u.x, u.y) * 0.4 - foeThreatAt(t.x, t.y, foes) + vBoost(t, true);
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
            sc -= foeThreatAt(t.x, t.y, foes);
            sc += vBoost(t, true);
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
        const range = skRange(u, sk);
        tiles.forEach((t) => {
          core.forEach((f) => {
            if (f.buffs[bk] && f.buffs[bk].t > 0) return;
            if (dTo(t, f.x, f.y) > range) return;
            const hit = foes.filter((o) => !o.buffs[bk] && manh(f.x, f.y, o.x, o.y) <= rad).length;
            const sc = 34 + hit * 16 + threat(f) / 9000 - dTo(t, u.x, u.y) * 0.3 - foeThreatAt(t.x, t.y, foes) * 0.7 + vBoost(t, true);
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
        const sc = need * 24 + group.length * 5 - dTo(t, u.x, u.y) * 0.3 - foeThreatAt(t.x, t.y, foes) + vBoost(t, true);
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
        const range = skRange(u, sk);
        const minR = sk.minRange || 1;
        if (sk.kind === 'magicArea') {
          tiles.forEach((t) => {
            foes.forEach((f) => {
              if (dTo(t, f.x, f.y) > range) return;
              const rad = sk.radius || 1;
              const hit = foes.filter((o) => manh(f.x, f.y, o.x, o.y) <= rad);
              let sum = 0, kill = false;
              hit.forEach((o) => { const e = estSkillDmg(u, o, sk); sum += e; if (e >= o.hp) kill = true; });
              const sc = sum * (hit.length >= 2 ? 1.15 : 0.9) + (kill ? 200 : 0) - dTo(t, u.x, u.y) * 0.3 + vBoost(t, true);
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
              const sc = e * (sk.hits || 1) + (kill ? 170 : 0) - dTo(t, u.x, u.y) * 0.3 + vBoost(t, true);
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
          if (dTo(t, a.x, a.y) > skRange(u, allyBuf)) return;
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
    if (sk.kind !== 'buffSelf' && sk.kind !== 'buffAreaAllies' && sk.kind !== 'healArea' && dist > skRange(u, sk)) return false;
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
  /* v5.27 — 보조 병과. 수성전 후방 판단에서 보조끼리 뭉치는 것을 지원 실적으로 치지 않는다 */
  const SUPPORT_CLS_SET = { chaeksa: 1, pungsusa: 1, dosa: 1, gunakdae: 1, muhui: 1 };
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
  /* v5.33 — 수성전 교착 판정: 적이 성 밖 원거리·공성 병과로만 버티거나,
     적이 2부대 이하로 줄었거나, 아군 병력이 적의 두 배 이상이면 문을 열고 나가 섬멸한다.
     (사용자 제보: 성문이 살아 있는 채 적 발석 1부대만 성 밖에 남아 자동전투가 12턴째 멈춤) */
  function defenseSortieNeeded(home) {
    if (!B || !home) return false;
    const foes = B.units.filter((o) => o.alive && o.side !== 'ally');
    if (!foes.length) return false;
    if (foes.length <= 2) return true;
    const mine = B.units.filter((o) => o.alive && o.side === 'ally');
    const myHp = mine.reduce((a, o) => a + Math.max(0, o.hp), 0);
    const foeHp = foes.reduce((a, o) => a + Math.max(0, o.hp), 0);
    if (myHp >= foeHp * 2) return true;
    const rangedCls = { pocha: 1, balseokcha: 1, gungsu: 1, gunggi: 1, yeonnobyung: 1, chaeksa: 1, dosa: 1 };
    const allStandoff = foes.every((f) => (rangedCls[f.cls] || effRng(f) > 1) && f.y >= home.insideY);
    if (allStandoff) return true;
    return false;
  }
  SK.defenseSortieNeeded = defenseSortieNeeded;

  function defenseAllowed(u, role, home) {
    if (!home) return null;
    const inside = (x, y) => {
      const row = B.tiles[y];
      if (!row || row[x] == null) return false;
      if (row[x] === 'C' || row[x] === 'H') return false;
      return y <= home.insideY || row[x] === 'G';
    };
    const sortie = defenseSortieNeeded(home);
    const openField = (x, y) => {
      const row = B.tiles[y];
      if (!row || row[x] == null || row[x] === 'C' || row[x] === 'H') return false;
      return true;
    };
    const uOut = !!(u && u.y > home.insideY);
    const foesNear = (x, y) => B.units.some((o) => o.alive && o.side !== 'ally' && manh(x, y, o.x, o.y) <= 3);
    if (role === 'keep') {
      /* 교착이면 보조도 문 밖으로 나가 출격한 아군을 받쳐 준다 */
      if (sortie) return openField;
      /* v5.27 — 보조 부대(책사·풍수사·도사·군악대·무희)가 본진 6칸 안에 묶여
         성문 앞 아군에게 회복·버프가 닿지 않던 문제. 이제 성 안쪽 어디든
         적의 지금 사거리 밖(근접 +2·원거리 +1 여유)이면 전진해 지원한다. */
      const ring = defenseSafeRing(home);
      return (x, y) => inside(x, y) && B.tiles[y][x] !== 'G' && (ring.none || ring.safe(x, y));
    }
    if (role === 'wall') return (x, y) => inside(x, y) && y >= home.insideY - 5;
    /* 근접 — 문이 버티는 동안에는 성문 안쪽에서 막고, 문이 깨지거나 교착이면 나가서 맞는다.
       이미 문 밖에 있는 부대는 다시 안으로 들어가지 않고 적 곁에서 계속 싸울 수 있다. */
    if (outerGateBroken() || sortie) return () => true;
    if (uOut) return (x, y) => inside(x, y) || foesNear(x, y);
    return inside;
  }

  /* v5.27 — 수성전 보조 부대가 서도 되는 '안전한 성 안 후방'.
     적마다 (사거리 + 근접 2·원거리 1)을 위협 반경으로 보고, 그 밖의 성 안 칸을 안전으로 본다.
     적이 성을 뚫고 들어와 안전한 칸이 하나도 없으면 조건을 풀어 마당 전체를 쓴다. */
  function defenseSafeRing(home) {
    if (!B || !home) return { safe: () => true, none: true };
    const foes = B.units.filter((o) => o.alive && o.side !== 'ally');
    const key = B.turn + '|' + home.insideY + '|' + foes.map((o) => `${o.x},${o.y},${o.cls}`).join(';');
    if (B._safeRing && B._safeRing.key === key) return B._safeRing;
    const bands = foes.map((f) => ({ x: f.x, y: f.y, r: effRng(f) + (attackKind(f) === 'melee' ? 2 : 1) }));
    const safe = (x, y) => bands.every((b) => manh(x, y, b.x, b.y) > b.r);
    let anySafe = false;
    for (let y = 0; y <= home.insideY && !anySafe; y++) {
      const row = B.tiles[y];
      if (!row) continue;
      for (let x = 0; x < N; x++) {
        const ch = row[x];
        if (!ch || ch === 'C' || ch === 'H' || ch === 'G') continue;
        if (safe(x, y)) { anySafe = true; break; }
      }
    }
    B._safeRing = { key, safe, none: !anySafe };
    return B._safeRing;
  }
  /* 보조 부대의 지원 사거리 — 회복·버프 계열의 최대 사거리(기본 3). 거리 계산용 */
  function supportReach(u) {
    let r = 3;
    try {
      (skillListOf(u) || []).forEach((s) => {
        if (s.kind !== 'heal' && s.kind !== 'healArea' && s.kind !== 'buffAlly' && s.kind !== 'buffAreaAllies') return;
        r = Math.max(r, Math.min(6, (s.range || r) + ((CASTER_RANGE_BONUS[u.cls]) ? 1 : 0)));
      });
    } catch (e) { /* ignore */ }
    return r;
  }

  /* v5.33 — 보조 부대가 서려는 칸이 적에게 얼마나 위험한가 (가까울수록 큰 값) */
  function foeThreatAt(x, y, foes) {
    if (!foes || !foes.length) return 0;
    let pen = 0;
    foes.forEach((f) => {
      const d = manh(x, y, f.x, f.y);
      const r = effRng(f) + (attackKind(f) === 'melee' ? 1 : 0);
      if (d <= 1) pen = Math.max(pen, 42);
      else if (d <= 2) pen = Math.max(pen, 26);
      else if (d <= 3) pen = Math.max(pen, 12);
      if (d <= r) pen = Math.max(pen, 32);          // 지금 적 사거리 안
      else if (d === r + 1) pen = Math.max(pen, 16);
    });
    return pen;
  }
  SK.foeThreatAt = foeThreatAt;

  /* ══════ v5.49 — AI의 마을 활용 ══════
     사용자 제보(성도 가는 길 5턴째): 바로 옆에 점령 안 된 마을이 있는데도
     아군 [자동]도 적군도 지나쳐 버렸다. 원인은 이동·공격 칸 점수가 '적과의 거리'만
     보고 마을 값은 아예 없었기 때문이다.
     이제 한 칸의 마을 값을 한 곳에서 매겨 공격 칸·이동 칸 점수에 함께 얹는다.
       · 밟는 순간 — 사기 +10 · MP +8 · 최대 병력 10% 회복
       · 그 위에 서면 — 방어 +20% · 매 턴 회복 +15% · MP +5
       · 이기면 — 마을 하나당 금 +150
     다친 부대·MP가 빈 부대는 더 크게 보고, 그 칸에서 아직 적을 칠 수 있으면 한 번 더.
     적이 코앞인데 뒤로 물러나며 집는 칸은 값이 거의 남지 않게 깎는다. */
  function villageValueAt(u, x, y, ctx) {
    if (!B || !B.sites || !B.sites.length) return 0;
    const s = siteAt(x, y);
    if (!s || s.type !== 'village') return 0;
    const c = ctx || {};
    const foes = c.foes || B.units.filter((o) => o.alive && o.side !== u.side);
    const mine = s.owner === u.side;
    const wounded = u.hp < u.maxHp * 0.85;
    const dry = (u.mp || 0) < (u.maxMp || 0) * 0.45;
    const hereD = foes.length ? Math.min(...foes.map((f) => manh(u.x, u.y, f.x, f.y))) : 99;
    const tileD = foes.length ? Math.min(...foes.map((f) => manh(x, y, f.x, f.y))) : 99;
    const back = Math.max(0, tileD - hereD);          // 지금보다 전선에서 멀어지는 칸 수
    let v = 0;
    if (!mine) {
      v = 46;                                          // 점령 기본값
      if (s.owner) v += 8;                             // 적이 가진 마을을 빼앗는 값
      if (wounded) v += 16;                            // 10% 회복 + 방어 20%가 급한 부대
      if (dry) v += 8;                                 // MP +8
      if (c.canStrike) v += 20;                        // 밟고도 같은 턴에 적을 칠 수 있으면
      if (back) v -= back * (hereD <= 2 ? 24 : 9);     // 코앞의 적을 두고 뒤로 빼지는 않는다
    } else {
      if (c.canStrike) v = 4;
      if (wounded) v = Math.max(v, 11);                // 내 마을 위에서 버티면 회복 +15%·방어 +20%
      if (back) v -= back * 12;
    }
    return Math.round(v);
  }

  /* 이 칸에서 지금 적을 칠 수 있는가 (마을에 서서도 한 턴을 쓰는지 판단) */
  function canStrikeFrom(u, x, y, foes, rng, minR) {
    if (!foes || !foes.length) return false;
    return foes.some((f) => {
      const d = manh(x, y, f.x, f.y);
      if (d < minR || d > rng) return false;
      if (wallBlocked({ x, y }, f) && !canShootOut({ x, y, cls: u.cls, side: u.side })) return false;
      return true;
    });
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
    const allies = B.units.filter((o) => o.alive && o.side === u.side);
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
    /* v5.36 — 마지막 적 우선 (사용자 제보: 허창 공성전 11턴·적 368 포차를 남겨 두고 허저가 안쪽 성문을 침)
       생존 적이 2부대 이하로 줄면, 이번 턴에 적을 때릴 수 있거나 적이 성문 안쪽이 아닌 쪽에 있으면
       성문 후보를 아예 포기하고 적 부대 섬멸을 먼저 한다. */
    const fewFoes = stormGate && gateIntact() && foes.length > 0 && foes.length <= 2;
    let foeBehindGate = false;
    let foeHitPossible = false;
    if (fewFoes) {
      const g0 = activeGate();
      const gY = g0 ? g0.tiles.reduce((a, g) => a + g.y, 0) / g0.tiles.length : null;
      foeBehindGate = gY != null && foes.some((e) => (e.y - gY) * (u.y - gY) < 0);
      foeHitPossible = tiles.some((t) => foes.some((e) => {
        const d = manh(t.x, t.y, e.x, e.y);
        if (d < minR || d > rng) return false;
        if (wallBlocked({ x: t.x, y: t.y }, e) && !canShootOut({ x: t.x, y: t.y, cls: u.cls, side: u.side })) return false;
        return true;
      }));
    }
    const skipGate = fewFoes && (foeHitPossible || !foeBehindGate);
    let best = null;
    const kind = attackKind(u);
    /* v5.49 — 마을 값. 수성전 성벽·본진 역할은 제자리를 지키는 게 우선이라 조금만 반영한다 */
    const vMul = defRole === 'wall' ? 0.4 : defRole === 'keep' ? 0.6 : 1;
    const vv = (t, canStrike) => villageValueAt(u, t.x, t.y, { foes, canStrike }) * vMul;
    tiles.forEach((t) => {
      const home = t.x === u.x && t.y === u.y;
      foes.forEach((e) => {
        const d = manh(t.x, t.y, e.x, e.y);
        if (d < minR || d > rng) return;
        if (wallBlocked({ x: t.x, y: t.y }, e) && !canShootOut({ x: t.x, y: t.y, cls: u.cls, side: u.side })) return;
        const est = calcDamage(u, e, {}).dmg;
        let score = (est / Math.max(1, e.maxHp)) * 100 + (1 - e.hp / Math.max(1, e.maxHp)) * 55 + (home ? 12 : 0);
        /* v5.49 — 같은 적을 칠 수 있는 칸이라면 마을을 밟고 치는 쪽을 고른다 */
        score += vv(t, true);
        /* v5.33 — 후방 문관·보조에게 3칸 안으로 붙은 적을 먼저 친다 (전투 병과만) */
        if (!SUPPORT_CLS_SET[u.cls] && allies.some((a) => a !== u && SUPPORT_CLS_SET[a.cls] && manh(e.x, e.y, a.x, a.y) <= 3)) score += 24;
        if (!best || score > best.score) best = { x: t.x, y: t.y, target: e, score, kind: 'hit' };
      });
      if (stormGate && gateIntact() && activeGate() && !skipGate) {
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
      const gy = (stormGate && gateIntact() && activeGate() && !skipGate)
        ? Math.min(...activeGate().tiles.map((g) => manh(t.x, t.y, g.x, g.y))) - 1 : 99;
      let score = -Math.min(d, gy);
      /* v5.33 — 보조 병과(풍수사·군악대·무희·도사·책사)는 공성·요격·들판에서도 전방으로 돌진하지 않는다.
         예전에는 home(수성전)이 없으면 점수가 '적과 가까울수록 높음'이라 풍수사가 1선으로 달려갔다.
         이제 아군 전투 부대에 지원이 닿는 자리 중 적과 4칸 이상 떨어진 칸을 고른다. */
      const isSupport = !!SUPPORT_CLS_SET[u.cls] || defRole === 'keep';
      if (!home && isSupport) {
        const reach = supportReach(u);
        let cover = 0, near = 99;
        allies.forEach((a) => {
          if (a === u || SUPPORT_CLS_SET[a.cls]) return;
          const dd = manh(t.x, t.y, a.x, a.y);
          if (dd < near) near = dd;
          if (dd <= reach) cover += 1 + (1 - a.hp / Math.max(1, a.maxHp)) * 1.6;
        });
        const fd = foes.length ? Math.min(...foes.map((f) => manh(t.x, t.y, f.x, f.y))) : 99;
        score = cover * 8.5 - Math.max(0, near - reach) * 2.2
          + Math.min(fd, 8) * 0.9                       // 적과 적당히 떨어질수록 좋다
          - (fd <= 2 ? (3 - fd) * 15 : 0)               // 적 바로 옆은 크게 깎는다
          - foeThreatAt(t.x, t.y, foes) * 0.5;
        if (fd >= 4) score += 4;                        // 4칸 이상 안전 거리 보너스
      } else if (!home && !SUPPORT_CLS_SET[u.cls]) {
        /* v5.33 — 전투 병과는 적과 우리 문관 사이 길목을 막는 자리에 선다 */
        const sups = allies.filter((a) => a !== u && SUPPORT_CLS_SET[a.cls]);
        let block = 0;
        sups.forEach((a) => {
          if (manh(t.x, t.y, a.x, a.y) > 4) return;
          foes.forEach((f) => {
            if (manh(t.x, t.y, f.x, f.y) < manh(a.x, a.y, f.x, f.y)) block = Math.max(block, 7);
          });
        });
        score += block;
      }
      /* 수비측은 망루·본성에 붙어 버티는 쪽을 조금 더 선호한다 (문을 부수는 진영 제외) */
      if (!stormGate && (B.tiles[t.y][t.x] === 'T' || B.tiles[t.y][t.x] === 'K')) score += 2.5;
      /* v5.22 — 역할별 자리 지키기 */
      if (defRole === 'wall' && home) {
        const ch = B.tiles[t.y][t.x];
        /* v5.26 — 망루 보너스는 사거리 안에 적이 있을 때만. 예전에는 적이 성문 반대편에 있어도
           망루(+12)에 붙어 있어 사거리 밖에서 7턴을 허비하는 부대가 있었다. */
        const foeD = foes.length ? Math.min(...foes.map((f) => manh(t.x, t.y, f.x, f.y))) : 99;
        if (ch === 'T' && foeD <= rng + 1) score += 12;                 // 망루 위가 최선 (사거리 +1·방어 +45%)
        else if (ch === 'T') score += 1;                                // 사거리 밖이면 미련 없이 이동
        else if (t.y >= home.insideY - 3) score += 4;                   // 성문 바로 안쪽 성벽
        if (ch === 'G') score -= 3;                                    // 문통에 서면 뚫린 뒤 그대로 맞는다
        if (t.y > home.insideY && ch !== 'G') score -= 20;
      } else if (defRole === 'keep' && home) {
        /* v5.27 — 보조는 본진 곁에 붙어 있는 대신, 아군에게 지원이 닿는 자리로 전진한다.
           (앞서는 본진과의 거리만 봐서 성문 앞 아군이 늘 사거리 밖이었다)
           · 지원이 닿는 아군이 많을수록 · 다친 아군일수록 높은 점수
           · 적과 가까울수록 · 본진에서 멀수록 조금씩 깎는다 */
        const reach = supportReach(u);
        let cover = 0, near = 99;
        allies.forEach((a) => {
          if (a === u || SUPPORT_CLS_SET[a.cls]) return;   // 보조끼리 뭉쳐도 지원 실적이 아니다
          const dd = manh(t.x, t.y, a.x, a.y);
          if (dd < near) near = dd;
          if (dd > reach) return;
          cover += 1 + (1 - a.hp / Math.max(1, a.maxHp)) * 1.6;
        });
        const hq = home.hq || { x: Math.floor(N / 2), y: home.insideY };
        /* 지원이 닿으면 그 자리, 안 닿으면 아군 쪽으로 다가간다 (적 사거리 밖은 allow가 지킨다) */
        score = cover * 9 - Math.max(0, near - reach) * 2.2 - Math.min(d, 14) * 0.7 - manh(t.x, t.y, hq.x, hq.y) * 0.1;
        if (B.tiles[t.y][t.x] === 'K') score += 1.5;
      } else if (defRole === 'melee' && home && gateIntact() && !defenseSortieNeeded(home)) {
        /* v5.33 — 교착(적이 성 밖에서만 버팀)이면 이 '문 안에서 막기' 점수를 끄고 나가서 친다 */
        if (B.tiles[t.y][t.x] === 'G') score += 5;                     // 성문 안쪽에서 문을 막는다
        else if (t.y >= home.insideY - 2) score += 2;
        if (t.y > home.insideY && B.tiles[t.y][t.x] !== 'G') score -= 25;
      }
      /* v5.49 — 걸어갈 수 있는 마을은 밟고 지나간다. 그 칸에서 아직 적을 칠 수 있으면 더 크게. */
      score += vv(t, canStrikeFrom(u, t.x, t.y, foes, rng, minR));
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
        if (p.ult) {
          const usp = ultOf(u);
          if (!usp || !castUlt(u, usp, B.units.find((o) => o.alive && o.x === p.tx && o.y === p.ty))) { u.acted = true; SKBattle.refreshUI(); }
        } else if (p.skill) {
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
    /* v5.54 — 자동 행군에서도 S급 장수는 필살기를 쓴다 */
    const uplan = planUlt(u);
    if (uplan) {
      const uspec = ultOf(u);
      if (uspec) {
        if (uplan.x !== u.x || uplan.y !== u.y) {
          autoPending = { uid: u.uid, ult: true, tx: uplan.tx, ty: uplan.ty };
          moveUnit(u, uplan.x, uplan.y);
          autoTimer = wait(autoStep, 260);
          return;
        }
        castUlt(u, uspec, uplan.target);
        autoTimer = wait(autoStep, 520);
        return;
      }
    }
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
    ailPhase('enemy');        // v5.31 — 적의 중독·화상·사기 회복
    if (!B || B.over) return;
    finishCheck();
    if (!B || B.over) return;
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
          /* v5.30 — 한 턴 2회 공격(일월쌍도·쌍고검) 쿨타임과 돌격 이동 거리 초기화 */
          u.dblUsed = false;
          if (u.dblCd > 0) u.dblCd -= 1;
          u.movedTiles = 0;
          u.movedThisTurn = false;
          u.turnStartX = u.x; u.turnStartY = u.y;
          lastMovedUid = null;
          Object.keys(u.buffs).forEach((k) => { u.buffs[k].t -= 1; if (u.buffs[k].t <= 0) delete u.buffs[k]; });
          if (u.side === 'ally') u.mp = Math.min(u.maxMp, u.mp + 3 + Math.max(0, (u.tfx && u.tfx.mp) || 0));
          else u.mp = Math.min(u.maxMp, u.mp + 2);
          /* v5.3 — 망루·본성에 선 부대는 턴마다 병력 15% 회복 */
          const holdCh = B.tiles[u.y][u.x];
          if ((holdCh === 'T' || holdCh === 'K') && u.hp < u.maxHp) {
            const hh = Math.max(1, Math.round(u.maxHp * 0.15 * (1 + fxPct(u, 'heal'))));
            u.hp = Math.min(u.maxHp, u.hp + hh);
            addHeal(u, hh, u);
            addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.4) * TILE, '+' + hh, '#a8f0b8');
            addFx({ kind: 'heal', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 520 });
          }
        });
        B.phase = 'ally';
        sitePhase(true);       // v5.17 — 아군 턴 시작: 본진·점령 마을 위 부대 회복
        if (B.over) return;
        ailPhase('ally');      // v5.31 — 아군 중독·화상·기절·사기 회복
        if (!B || B.over) return;
        finishCheck();
        if (!B || B.over) return;
        B.units.forEach((u) => { if (u.side === 'ally' && u.alive) triggerPassive(u, 'turn_start'); });
        classAuraPhase('ally');
        banner('아군 페이즈', 'ally');
        SKBattle.refreshUI();
        const first = B.units.find((u) => u.side === 'ally' && u.alive && !u.acted);
        if (first) selectUnit(first);
        else {
          /* v5.33 — 턴 시작부터 전원이 행동 불가(기절·혼란 등)면 안내만 띄우고 멈추지 않는다 */
          $('#battle-tip').textContent = '행동할 수 있는 부대가 없습니다 — 잠시 뒤 적군 차례로 넘어갑니다.';
          scheduleAutoEndTurn(520);
        }
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
    /* v5.33 — 군주(총대장)는 원래 role과 상관없이 적극 전진한다.
       예외: 본진 3칸 안에 적이 들어왔는데 지킬 수비대가 곁에 없을 때만 본진으로 돌아간다. */
    if (e.leader && enemyHQ) {
      const threat = B.units.some((o) => o.alive && o.side !== e.side && manh(o.x, o.y, enemyHQ.x, enemyHQ.y) <= 3);
      const guardNear = B.units.some((g) => g.alive && g !== e && g.side === e.side && g.role === 'guard'
        && manh(g.x, g.y, enemyHQ.x, enemyHQ.y) <= 4);
      if (threat && !guardNear) return enemyHQ;
      e.role = e.role === 'guard' ? 'assault' : e.role;
    }
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
    if (e.acted) { done(); return; }          // v5.31 — 기절한 적은 이번 턴 쉰다
    if (e.ail && e.ail.confuse) {             // v5.31 — 혼란에 빠진 적은 동료도 친다
      confusedStrike(e, done);
      return;
    }
    if (e.x != null) trackTurn(e, true);
    const targets = B.units.filter((u) => u.side === 'ally' && u.alive);
    if (!targets.length) { done(); return; }
    /* v5.33 — 적 전투 병과도 자기 문관을 노리는 아군을 먼저 친다 */
    let target = targets.reduce((best, t) => {
      const d = manh(e.x, e.y, t.x, t.y);
      let sc = d;
      if (!SUPPORT_CLS_SET[e.cls] && B.units.some((o) => o.alive && o.side === e.side && SUPPORT_CLS_SET[o.cls] && manh(t.x, t.y, o.x, o.y) <= 3)) sc -= 2;
      return !best || sc < best.sc ? { t, d, sc } : best;
    }, null).t;
    const aiGoal = aiGoalOf(e);
    const rng = effRng(e);
    /* v5.3 — 망루·본성에 선 수비 부대는 적이 사거리 밖이면 자리를 지켜 회복한다 */
    const holdCh = B.tiles[e.y][e.x];
    if (holdCh === 'T' || holdCh === 'K') {
      const near = Math.min.apply(null, targets.map((t) => manh(e.x, e.y, t.x, t.y)));
      if (near > rng + 1) { e.acted = true; finishCheck(); done(); return; }
    }

    /* v5.54 — S급 적장은 필살기를 먼저 꺼낸다 (사거리 안에 값진 대상이 있을 때만) */
    const ultp = planUlt(e);
    if (ultp) {
      const uspec = ultOf(e);
      if (uspec) {
        const ugo = () => {
          if (!B || B.over) { done(); return; }
          e.acted = true;
          finishCheck();
          done();
        };
        if (ultp.x !== e.x || ultp.y !== e.y) {
          animatePath(e, findPath(e, ultp.x, ultp.y), { step: 88, onDone: () => wait(() => castUlt(e, uspec, ultp.target, ugo), 120) });
        } else castUlt(e, uspec, ultp.target, ugo);
        return;
      }
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
        animatePath(e, findPath(e, sup.x, sup.y), { step: 88, onDone: () => wait(go, 150) });
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
        const dmg = Math.max(6, Math.round((20 + e.ji * 0.1 + Math.min(200, e.hp * 0.01) - target.ji * 0.04) * sizeScale(target) * 0.9
          * (1 - Math.min(0.5, Math.max(-0.5, fxPct(target, 'magicTaken'))))));
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
      /* v5.49 — 적군 AI도 마을을 밟고 차지한다 (적은 점수가 낮을수록 좋은 칸) */
      const vv = villageValueAt(e, t.x, t.y, { foes: targets, canStrike: inRange });
      if (vv > 0) score -= vv;
      if (!best || score < best.score) best = { t, score, inRange, vv };
    });
    let moveTo = already ? null : (best && best.t);
    /* v5.49 — 이미 사거리 안이어도, 마을을 밟으면서 그대로 칠 수 있는 칸이면 그리로 옮긴다
       (예전엔 사거리에 들면 그 턴에 아예 움직이지 않아 옆 마을을 그냥 지나쳤다) */
    if (already && best && best.vv >= 20 && best.inRange && best.t
      && (best.t.x !== e.x || best.t.y !== e.y)) moveTo = best.t;
    const finishMove = () => {
      const path = moveTo ? findPath(e, moveTo.x, moveTo.y) : [];
      animatePath(e, path, { step: 88, onDone: () => {
        wait(() => {
          if (!B || B.over) { done(); return; }
          const dist = manh(e.x, e.y, target.x, target.y);
          if (dist >= (e.minRng || 1) && dist <= rng && !wallBlocked(e, target)) {
            attackUnit(e, target, { duel: true }, () => {
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

  /* ══════════════════════════════════════════════════════════════
     v5.32 — 성 밖 요격 출진(침공 요격)의 승패 처리
     · 승리: 성벽 피해 없이 침공을 꺾고, 적 잔여 병력은 출발 성으로 쫓아낸다.
       살아 돌아온 아군은 성에 합류하고, 적장 포로·보물은 일반 승리와 같은 방식으로 정산한다.
     · 패배: 살아남은 아군은 성으로 물러나고, 적 생존 병력만 줄어든 채 다시 성 앞에 선다
       (openPendingInvasion 이 줄어든 병력으로 수성전을 다시 연다).
     ══════════════════════════════════════════════════════════════ */
  function invasionInterceptVictory() {
    B.over = true;
    clearBattleProgress();
    SK.sfx.play('victory');
    if (window.JojoBGM) { try { JojoBGM.play('victory'); } catch (e) { /* ignore */ } }
    const s = SK.state;
    const inv = B.intercept.invasion || {};
    const st = inv.target ? s.cities[inv.target] : null;
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = Math.round(survivors.reduce((sum, u) => sum + Math.max(0, u.hp), 0));
    if (st) st.troops = Math.min(20000, Math.round((st.troops || 0) + troopsLeft));
    B.units.filter((u) => u.side === 'ally' && u.uid).forEach((u) => {
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (!h) return;
      h.marchId = null;
      if (inv.target) h.city = inv.target;
      h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * (u.alive ? Math.max(0.35, u.hp / Math.max(1, u.maxHp)) : 0.2)));
      if (u.alive) SK.gainExp(h, 70, 16);
    });
    /* 적 잔여 병력은 출발 성으로 쫓아낸다 (전멸하지 않은 부대 + 후방에 남아 있던 병력 일부) */
    const foeLeft = Math.round(B.units.filter((u) => u.side === 'enemy' && u.alive).reduce((sum, u) => sum + Math.max(0, u.hp), 0));
    const fled = foeLeft + Math.round((inv.troops || 0) * 0.12);
    const from = inv.from ? s.cities[inv.from] : null;
    if (from && from.owner !== SK.playerFaction()) from.troops = Math.min(20000, Math.round((from.troops || 0) + fled));
    s.gold += B.rewards.gold;
    s.food += B.rewards.food;
    const vgGold = addVillageWarGold(s);   // v5.42 — 마을 점령 수당
    s.fame += 3;
    if (st) s.purseCity = inv.target;
    /* 침공 사건을 정리한다 — 뒤이은 침공(큐)은 chainPendingEvents 가 이어서 연다 */
    if (s.pendingInvasion === inv || (s.pendingInvasion && s.pendingInvasion.target === inv.target && s.pendingInvasion.from === inv.from)) s.pendingInvasion = null;
    s.invasionQueue = (s.invasionQueue || []).filter((q) => q !== inv);
    /* v5.35 — 요격으로 꺾은 성은 두 달간 다시 노려지지 않는다 */
    if (inv.target && SK.markInvasionRepelled) SK.markInvasionRepelled(inv.target, s);
    const prisoners = rollPrisoners();
    SK.save();
    SKBattle.refreshUI();
    const targetName = inv.target && SK.CITY[inv.target] ? SK.CITY[inv.target].name : '성';
    SK.modal({
      kicker: '요격전 승리',
      title: `${targetName} 앞길을 지켰다`,
      body: `<div class="result-modal win"><div class="rm-seal">승</div>
        <p class="rm-line">성 밖 길목에서 적 침공군을 먼저 맞아 꺾었습니다. <b>성벽 피해 없이</b> 침공이 물러갔습니다.</p>
        ${battleReportHTML()}
        <div class="rm-rewards">
          <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
          <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
          <div><span>성에 합류</span><b>${troopsLeft.toLocaleString('ko-KR')}</b></div>
          <div><span>명성</span><b>+3</b></div>
        </div>
        ${vgGold.gold ? `<p class="rm-village">마을 <b>${vgGold.count}</b>곳 점령 수당 — 금 <b>+${vgGold.gold.toLocaleString('ko-KR')}</b></p>` : ''}
        ${fled > 0 ? `<p class="rm-note">적 잔여 병력 ${fled.toLocaleString('ko-KR')}은 출발 성으로 쫓겨났습니다.</p>` : ''}
        ${prisoners.length ? `<div class="rm-prisoners"><span class="rp-tag">포로 ${prisoners.length}명</span>${prisoners.map((g) => `<img class="${SK.tcls(g)}" src="${SK.ptSrc(SK.genPortrait(g))}" title="${g.name}">`).join('')}<em>승리를 마치면 처리합니다</em></div>` : ''}
      </div>`,
      actions: [{ label: prisoners.length ? '포로를 처리한다' : '지도로', primary: true, onClick: () => {
        closeBattle();
        SK.showMap();
        if (prisoners.length) wait(() => openPrisoners(prisoners), 340);
        setTimeout(() => { if (SK.chainPendingEvents) SK.chainPendingEvents(); }, 700);
      } }],
      dismissible: false,
    });
  }

  function invasionInterceptDefeat() {
    B.over = true;
    clearBattleProgress();
    SK.sfx.play('defeat');
    const s = SK.state;
    const inv = B.intercept.invasion || {};
    /* v5.33 — 한 침공에 요격 출진은 한 번뿐. 패배하면 곧바로 수성전으로 넘어간다
       (사용자 제보: 요격에서 진 뒤 같은 침공의 요격 창이 또 떴다) */
    inv.intercepted = true;
    /* v5.33 — 요격전에서 살아남은 적 부대의 편성(병종·병력·레벨·장수)을 그대로 넘긴다.
       예전에는 남은 총병력만 넘겨서 수성전에서 적 병종이 처음부터 다시 뽑혔다(사용자 제보). */
    inv.survivingEnemies = B.units.filter((u) => u.side === 'enemy' && u.alive).map((u) => ({
      name: u.name, cls: u.cls, lv: u.lv, hp: Math.round(u.hp), maxHp: Math.round(u.maxHp),
      genId: u.genId != null ? u.genId : null, boss: !!u.boss, leader: !!u.leader,
      portrait: u.portrait || null, tier: u.tier || null,
    }));
    const st = inv.target ? s.cities[inv.target] : null;
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = Math.round(survivors.reduce((sum, u) => sum + Math.max(0, u.hp), 0));
    if (st) st.troops = Math.min(20000, Math.round((st.troops || 0) + troopsLeft));
    B.units.filter((u) => u.side === 'ally' && u.uid).forEach((u) => {
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (!h) return;
      h.marchId = null;
      if (inv.target) h.city = inv.target;
      h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * (u.alive ? 0.5 : 0.2)));
    });
    /* 적 생존 병력만 남겨 다시 성 앞에 세운다 — openPendingInvasion 이 이 수치로 수성전을 연다.
       (요격전에서 죽인 만큼 줄어들 뿐, 원래 침공 병력보다 늘어나지는 않는다) */
    const foeLeft = Math.round(B.units.filter((u) => u.side === 'enemy' && u.alive).reduce((sum, u) => sum + Math.max(0, u.hp), 0));
    inv.troops = Math.max(600, Math.min(Math.round(inv.troops || 0), foeLeft));
    if (st) s.purseCity = inv.target;
    SK.save();
    SKBattle.refreshUI();
    const targetName = inv.target && SK.CITY[inv.target] ? SK.CITY[inv.target].name : '성';
    SK.modal({
      kicker: '요격전 패배',
      title: '성을 지켜야 한다',
      body: `<div class="result-modal lose"><div class="rm-seal">패</div>
        <p class="rm-reason">패배 사유: ${B.winReason || '아군 전멸'}</p>
        <p class="rm-line">길목을 지키지 못했습니다. 살아남은 병력은 <b>${targetName}</b>으로 물러났고, 적은 줄어든 병력으로 성 앞에 다다릅니다.</p>
        ${battleReportHTML()}
        <p class="rm-note">성으로 돌아온 병력 ${troopsLeft.toLocaleString('ko-KR')} · 적 남은 병력 ${inv.troops.toLocaleString('ko-KR')}</p>
      </div>`,
      actions: [{ label: '수성전으로', primary: true, onClick: () => {
        closeBattle();
        /* 바로 수성전 배치로 — 선택 창을 다시 띄우지 않는다 */
        setTimeout(() => {
          if (SK.openDefenseDeploy) SK.openDefenseDeploy(inv);
          else if (SK.openPendingInvasion) SK.openPendingInvasion();
        }, 380);
      } }],
      dismissible: false,
    });
  }

  function interceptVictory() {
    B.over = true;
    clearBattleProgress();
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
    const vgGold = addVillageWarGold(s);   // v5.42 — 마을 점령 수당
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
        ${vgGold.gold ? `<p class="rm-village">마을 <b>${vgGold.count}</b>곳 점령 수당 — 금 <b>+${vgGold.gold.toLocaleString('ko-KR')}</b></p>` : ''}
        <p class="rm-note">다음 달에 행군이 한 달 더 진행됩니다.</p></div>`,
      actions: [{ label: '지도로', primary: true, onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  /* v5.31 — 패전 병력 손실 감소(금루갑·징비록초고) */
  function maxLossCut(units) {
    let v = 0;
    (units || []).forEach((u) => { if (u.side === 'ally') v = Math.max(v, fxPct(u, 'lossCut')); });
    return Math.max(0, Math.min(0.5, v));
  }
  /* v5.31 — 행군 중 출발 성을 잃었을 때 돌아갈 성 (app.js SK.fieldHome) */
  function homeOf(originId) {
    if (SK.fieldHome) return SK.fieldHome(originId);
    const s = SK.state;
    const st = s && s.cities ? s.cities[originId] : null;
    return (st && st.owner === SK.playerFaction()) ? originId : null;
  }

  function interceptDefeat() {
    B.over = true;
    clearBattleProgress();
    SK.sfx.play('defeat');
    const s = SK.state;
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = survivors.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
    /* v5.31 — 출발 성이 그새 함락됐으면 가장 가까운 아군 성으로 복귀 (적 성에 병력이 합쳐지던 버그) */
    const hid = homeOf(B.origin);
    const st = hid ? s.cities[hid] : null;
    const cut = maxLossCut(B.units);
    const back = Math.round(troopsLeft * (1 + cut * 0.5));
    if (st) st.troops = Math.min(20000, Math.round(st.troops || 0) + back);
    const mid = B.intercept && B.intercept.marchId;
    s.marches = (s.marches || []).filter((m) => m.id !== mid);
    B.units.forEach((u) => {
      if (u.side !== 'ally' || !u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (h) { h.marchId = null; if (hid) h.city = hid; h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * (u.alive ? 0.5 : 0.2))); }
    });
    if (st) s.purseCity = hid;
    s.gold = Math.max(0, s.gold - 100);
    s.pendingMarch = null;
    SK.save();
    const homeName = hid && SK.CITY[hid] ? SK.CITY[hid].name : null;
    SK.modal({
      kicker: '행군 실패',
      title: homeName ? '회군' : '유랑군',
      body: `<div class="result-modal lose"><div class="rm-seal">패</div>
        <p class="rm-line">요격대에 길이 막혔습니다. ${homeName ? `남은 병력은 <b>${homeName}</b>으로 돌아갑니다.` : '돌아갈 성이 없어 남은 병력이 흩어졌습니다.'}${hid && hid !== B.origin ? `<br><em>출발 성 ${SK.josa(SK.CITY[B.origin] ? SK.CITY[B.origin].name : '본성', 'i')} 이미 함락되어 가장 가까운 아군 성으로 향했습니다.</em>` : ''}</p>
        ${battleReportHTML()}
        <p class="rm-note">복귀 병력 ${Math.round(back).toLocaleString('ko-KR')}${cut ? ` (패전 피해 감소 +${Math.round(back - troopsLeft)})` : ''} · 금 -100</p></div>`,
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
    /* v5.28 — 이 전투의 행군만 지우고, 대기열에 있던 다른 부대의 도착 사건은 살려 둔다 */
    if (mid && s.pendingMarch && s.pendingMarch.marchId === mid) s.pendingMarch = null;
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
        <img class="prison-port ${SK.tcls(g)}" src="${SK.ptSrc(SK.genPortrait(g))}" alt="">
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
    if (B.intercept) { if (B.intercept.invasion) { invasionInterceptVictory(); return; } interceptVictory(); return; }
    if (B.defense) { defenseVictory(); return; }
    B.over = true;
    clearBattleProgress();
    SK.sfx.play('victory');
    if (window.JojoBGM) { try { JojoBGM.play('victory'); } catch (e) { /* ignore */ } }
    const s = SK.state;
    const st = s.cities[B.targetId];
    const c = SK.CITY[B.targetId];
    const prevOwner = st.owner;
    const prevOwnerName = SK.factionName(prevOwner);   // v5.27 — 멸망 처리로 명부에서 지우기 전에 이름을 잡아 둔다
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
    /* v5.27 — 마지막 성을 빼앗아 세력이 사라졌는데 명부에 남아 있던 문제 (항복 경로만 지우고 있었다).
       성을 모두 잃은 세력은 명부에서 지우고, 결산 창에 멸망을 알린다. */
    let fallenFaction = null;
    let freedCaptives = [];
    if (prevOwner && prevOwner !== 'neutral' && prevOwner !== SK.playerFaction()) {
      if (SK.syncFactionCities) { try { SK.syncFactionCities(s); } catch (e) { /* ignore */ } }
      const leftCities = SK.CITY_LIST.filter((x) => s.cities[x.id].owner === prevOwner).length;
      if (!leftCities && s.factions && s.factions[prevOwner]) {
        fallenFaction = s.factions[prevOwner].name || SK.factionName(prevOwner);
        delete s.factions[prevOwner];
        /* v5.28 — 멸망한 세력의 몸값 제안이 유령 이름으로 남지 않게 즉시 정리한다 */
        if (s.prisoners) s.prisoners.forEach((pr) => {
          if (pr.by !== prevOwner) return;
          pr.by = '';
          pr.orphan = true;
          pr.offer = null;
        });
        /* v5.28 — 그 세력이 사로잡고 있던 아군 장수도 풀려나 함락한 성으로 돌아온다 */
        if (s.captured && s.captured.length) {
          s.captured = s.captured.filter((cap) => {
            if (cap.by !== prevOwner) return true;
            const h = s.heroes.find((x) => x.uid === cap.uid);
            if (h) {
              h.captured = false;
              h.city = B.targetId;
              h.marchId = null;
              h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.4));
              freedCaptives.push(h.name);
            }
            return false;
          });
        }
      }
    }
    s.purseCity = B.targetId;      // v5.11 — 함락한 성의 금고·창고를 차지한다
    s.gold += B.rewards.gold;
    s.food += B.rewards.food;
    const vgGold = addVillageWarGold(s);   // v5.42 — 마을 점령 수당
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
        /* v5.33 — 타격·치유 경험치는 전투 중에 이미 들어갔다. 여기서는 참전·승리 보너스만 준다 */
        const gain = (u.alive ? 70 : 30) + (B.def.name === '공성전' ? 15 : 0);
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
        ${B.winReason ? `<p class="rm-reason">승리 사유: ${B.winReason}</p>` : ''}
        <p class="rm-line">${SK.josa(prevOwnerName, 'eul')} 무찌르고 <b>${SK.josa(c.name, 'eul')}</b> 차지했습니다.</p>
        ${fallenFaction ? `<p class="rm-fall">${SK.josa(fallenFaction, 'i')} 마지막 성을 잃고 천하에서 사라졌습니다.</p>` : ''}
        ${freedCaptives.length ? `<p class="rm-release">사로잡혀 있던 ${freedCaptives.join(' · ')} — 풀려나 ${c.name}으로 돌아왔습니다.</p>` : ''}
        <div class="rm-rewards">
          <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
          <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
          <div><span>명성</span><b>+12</b></div>
          <div><span>영토</span><b>${owned} / ${SK.CITY_LIST.length}</b></div>
          ${woundedAdd ? `<div class="rm-wound"><span>부상병</span><b>${woundedAdd.toLocaleString('ko-KR')}</b><em>회복중</em></div>` : ''}
        </div>
        ${vgGold.gold ? `<p class="rm-village">마을 <b>${vgGold.count}</b>곳 점령 수당 — 금 <b>+${vgGold.gold.toLocaleString('ko-KR')}</b></p>` : ''}
        ${battleReportHTML()}
        ${drop ? `<div class="rm-treasure" style="--gc:${SK.GRADE_COLOR[drop.grade]}">
          <span class="rt-grade">${drop.grade} 보물</span>
          <b>${drop.name}</b><em>${drop.effect}</em>
        </div>` : ''}
        ${levelUps.length ? `<div class="rm-levels">${levelUps.map((l) => `<span class="${l.promote ? 'promote' : ''}">${l.name} Lv.${l.lv}${l.promote ? ` · ${l.title} 승급!` : ' 달성'}</span>`).join('')}</div>` : ''}
        <div class="rm-survivors">${survivors.map((u) => `<img class="${SK.tcls(u)}" src="${SK.ptSrc(u.portrait)}" title="${u.name}">`).join('')}</div>
        ${prisoners.length ? `<div class="rm-prisoners"><span class="rp-tag">포로 ${prisoners.length}명</span>${prisoners.map((g) => `<img class="${SK.tcls(g)}" src="${SK.ptSrc(SK.genPortrait(g))}" title="${g.name}">`).join('')}<em>승리를 마치면 처리합니다</em></div>` : ''}
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
    if (B.intercept) { if (B.intercept.invasion) { invasionInterceptDefeat(); return; } interceptDefeat(); return; }
    if (B.defense) { defenseDefeat(); return; }
    B.over = true;
    clearBattleProgress();
    SK.sfx.play('defeat');
    const s = SK.state;
    /* v5.31 — 출발 성이 이미 함락됐으면 가장 가까운 아군 성으로 퇴각한다 */
    const hid = homeOf(B.origin);
    const st = hid ? s.cities[hid] : null;
    const defeatedNames = B.units.filter((u) => u.side === 'enemy').map((u) => u.name);
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = survivors.reduce((sum, u) => sum + u.hp, 0);
    const originMine = !!(st && st.owner === SK.playerFaction());
    const cut = maxLossCut(B.units);
    const salv = Math.round(lostOf('ally') * cut * 0.6);
    if (originMine) st.troops = Math.min(20000, Math.round(st.troops || 0) + Math.round(troopsLeft) + salv);
    /* v5.9 — 퇴각해도 잃은 병력의 일부는 부상병으로 본성에 돌아온다 */
    const woundedAdd = (originMine && lostOf('ally') && SK.addWounded) ? SK.addWounded(hid, lostOf('ally'), { ratio: SK.woundedRatio(hid) }) : 0;
    if (st) s.purseCity = hid;
    s.gold = Math.max(0, s.gold - 200);
    B.units.forEach((u) => {
      if (u.side === 'ally' && u.uid) {
        const h = s.heroes.find((x) => x.uid === u.uid);
        if (h) { h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.4)); h.marchId = null; if (hid) h.city = hid; }
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
        <p class="rm-reason">패배 사유: ${B.winReason || '아군 전멸'}</p>
        <p class="rm-line">적의 방어가 완강했습니다. 병력을 정비하고 다시 도전하십시오.</p>
        ${battleReportHTML()}
        ${SK.quoteOf('조조', 'retreat') ? `<p class="rm-quote">“${SK.quoteOf('조조', 'retreat')}”</p>` : ''}
        <p class="rm-note">보유 금 -200 · 부상병 ${woundedAdd ? `${Math.round(woundedAdd).toLocaleString('ko-KR')}명이 ${SK.CITY[hid] ? SK.CITY[hid].name : '본성'}에서 회복 중입니다` : '없음'}${salv ? ` · 패전 피해 감소 +${Math.round(salv).toLocaleString('ko-KR')}` : ''}${captured ? ` · 사로잡힌 장수 <b>${captured}</b>` : ''}</p></div>`,
      actions: [{ label: '지도로', onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  /* ───────────── v5.7 — 수성전의 승패 ───────────── */
  function defenseVictory() {
    B.over = true;
    clearBattleProgress();
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
    const vgGold = addVillageWarGold(s);   // v5.42 — 마을 점령 수당
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
    /* v5.35 — 수성전으로 막은 성도 두 달은 쉰다 */
    if (B.targetId && SK.markInvasionRepelled) SK.markInvasionRepelled(B.targetId, s);
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
        ${vgGold.gold ? `<p class="rm-village">마을 <b>${vgGold.count}</b>곳 점령 수당 — 금 <b>+${vgGold.gold.toLocaleString('ko-KR')}</b></p>` : ''}
        ${levelUps.length ? `<div class="rm-levels">${levelUps.map((l) => `<span class="${l.promote ? 'promote' : ''}">${l.name} Lv.${l.lv}${l.promote ? ` · ${l.title} 승급!` : ' 달성'}</span>`).join('')}</div>` : ''}
        ${battleReportHTML()}
        <div class="rm-survivors">${survivors.map((u) => `<img class="${SK.tcls(u)}" src="${SK.ptSrc(u.portrait)}" title="${u.name}">`).join('')}</div>
        ${prisoners.length ? `<div class="rm-prisoners"><span class="rp-tag">포로 ${prisoners.length}명</span>${prisoners.map((g) => `<img class="${SK.tcls(g)}" src="${SK.ptSrc(SK.genPortrait(g))}" title="${g.name}">`).join('')}<em>승리를 마치면 처리합니다</em></div>` : ''}
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
    clearBattleProgress();
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
          body: `<div class="result-modal lose"><div class="rm-seal">망</div>
            <p class="rm-reason">패배 사유: ${B.winReason || '성을 지키지 못함'}</p>${battleReportHTML()}
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
        body: `<div class="result-modal lose"><div class="rm-seal">망</div>
          <p class="rm-reason">패배 사유: ${B.winReason || '마지막 성 함락'}</p>${battleReportHTML()}
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
        <p class="rm-reason">패배 사유: ${B.winReason || '성을 지키지 못함'}</p>
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
    clearBattleProgress();
    closeBattle();
    SK.showMap();
    SK.toast('전투에서 물러났습니다.');
  }

  /* v5.27 — 전투 결과가 확정되면 복귀용 표식을 지운다 (앱을 닫았다 열어도 병력이 겹쳐 돌아오지 않게) */
  function clearBattleProgress() {
    try {
      if (SK.state && SK.state.battleInProgress) { SK.state.battleInProgress = null; SK.save(); }
    } catch (e) { /* ignore */ }
  }
  function closeBattle() {
    clearBattleProgress();
    /* v5.52 — 일기토 창이 떠 있는 채로 전장을 닫지 않는다 */
    if (duel) { duel.done = null; duel = null; }
    if (duelEls) { duelEls.root.hidden = true; duelEls.root.classList.remove('show', 'out'); }
    B = null;
    mode = 'idle';
    pendingSkill = null;
    cancelAnimationFrame(raf); raf = 0;
    $('#battle-overlay').hidden = true;
    /* v5.25 — 전투가 끝난 뒤에도 남은 행군 도착·적 침공 사건을 이어서 띄운다 */
    /* v5.28 — 같은 달에 도착한 다른 부대가 대기열에 있으면 곷바로 다음 사건으로 이어진다 */
    if (SK.chainPendingEvents) setTimeout(() => SK.chainPendingEvents(), 420);
    if (SK.armPendingWatch) setTimeout(() => SK.armPendingWatch(), 900);
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
        <img class="ic-portrait ${SK.tcls(L.who)}" src="${SK.ptSrc(L.pt)}" alt="">
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
      $('#battle-kind').textContent = `${B.night ? '야간 · ' : ''}${B.def.name} · ${B.def.desc}`;
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
      /* v5.38 — 턴 표시를 '2턴째'로 명확히 + 페이즈 배지와 함께 상단에서 한눈에 들어오게 */
      $('#battle-turn').textContent = B.turn + '턴째';
      $('#battle-phase').textContent = B.phase === 'ally' ? '아군' : '적군';
      $('#battle-phase').className = B.phase;
      const turnBox = document.querySelector('.battle-turnbox');
      if (turnBox) turnBox.classList.toggle('enemy', B.phase !== 'ally');
      /* v5.0.1 — 상단은 부대 수가 아니라 총 병력 수 + 병력 비율 게이지 */
      const allyHp = B.units.filter((u) => u.side === 'ally' && u.alive).reduce((sum, u) => sum + Math.max(0, u.hp), 0);
      const enemyHp = B.units.filter((u) => u.side === 'enemy' && u.alive).reduce((sum, u) => sum + Math.max(0, u.hp), 0);
      const allyStart = B.units.filter((u) => u.side === 'ally').reduce((sum, u) => sum + Math.max(0, u.maxHp), 0);
      const enemyStart = B.units.filter((u) => u.side === 'enemy').reduce((sum, u) => sum + Math.max(0, u.maxHp), 0);
      $('#count-ally').textContent = Math.round(allyHp).toLocaleString('ko-KR');
      $('#count-enemy').textContent = Math.round(enemyHp).toLocaleString('ko-KR');
      $('#bar-ally').style.width = Math.round(allyStart ? allyHp / allyStart * 100 : 0) + '%';
      $('#bar-enemy').style.width = Math.round(enemyStart ? enemyHp / enemyStart * 100 : 0) + '%';
      /* v5.53 — 적군(또는 아군)을 눌러 보면 아래 카드에 그 부대가 뜬다.
         B.sel은 내 부대 선택 그대로 두고, 보기용 부대는 B.insp가 맡는다(읽기 전용). */
      const u = B.insp || B.sel;
      const card = $('#unit-card');
      if (u) {
        card.classList.add('on');
        card.classList.remove('empty');
        $('#uc-img').src = `${SK.ptSrc(u.portrait)}`;
        SK.paintTier($('#uc-portrait'), ptTier(u));
        $('#uc-lv').textContent = 'Lv.' + u.lv;
        $('#uc-name').textContent = u.name;
        $('#uc-cls').textContent = SK.CLASSES[u.cls].name;
        const sideEl = $('#uc-side');
        if (sideEl) { sideEl.textContent = u.side === 'ally' ? '아군' : '적군'; sideEl.className = 'uc-side ' + u.side; sideEl.hidden = false; }
        const infoBtn = $('#btn-unit-info');
        if (infoBtn) { infoBtn.hidden = false; infoBtn.disabled = false; infoBtn.title = `${u.name} 장수 정보 — 능력·장비·특성`; }
        const tr = SK.TERRAIN[B.tiles[u.y][u.x]];
        const holdTag = B.tiles[u.y][u.x] === 'T' ? '망루 방어↑·회복' : B.tiles[u.y][u.x] === 'K' ? '본성 방어↑·회복' : '';
        /* v5.27 — 음수 지형(도로 −5%)에 '+'가 붙어 '방어+-5%'로 찍히던 표기 오류 */
        $('#uc-terrain').textContent = tr.name + (tr.def ? ` 방어${tr.def > 0 ? '+' : ''}${Math.round(tr.def * 100)}%` : '') + (holdTag ? ` · ${holdTag}` : '') + (SK.affinity(u.cls, B.tiles[u.y][u.x]).label ? ` · ${SK.affinity(u.cls, B.tiles[u.y][u.x]).label}` : '') + (typeBonus(u) ? ` · ${B.def.name} ${typeBonus(u) > 0 ? '+' : ''}${Math.round(typeBonus(u) * 100)}%` : '');
        $('#uc-hp').style.width = Math.round(u.hp / u.maxHp * 100) + '%';
        $('#uc-hp-txt').textContent = `${Math.round(u.hp).toLocaleString('ko-KR')} / ${Math.round(u.maxHp).toLocaleString('ko-KR')}`;
        $('#uc-mp').style.width = Math.round(u.mp / u.maxMp * 100) + '%';
        $('#uc-mp-txt').textContent = `${u.mp}/${u.maxMp}`;
        /* v5.33 — 경험치 바: 전투 중에 쌓인 경험치를 장수 값에서 바로 읽는다.
           예전에는 부대의 u.exp(늘 0)를 읽어 전투가 끝날 때까지 바가 멈춰 있었다. */
        const hero = (u.side === 'ally' && u.uid && SK.state) ? (SK.state.heroes || []).find((x) => x.uid === u.uid) : null;
        const exLv = hero ? hero.lv : u.lv;
        const exVal = hero ? (hero.exp || 0) : 0;
        const needExp = SK.expNeed ? SK.expNeed(exLv) : 100;
        const ex = $('#uc-exp'), exT = $('#uc-exp-txt');
        /* v5.53 — 적군·일반 부대는 경험치가 없다: 0/145를 보여 주지 않고 —로 둔다 */
        if (ex) ex.style.width = hero ? Math.max(0, Math.min(100, Math.round(exVal / needExp * 100))) + '%' : '0%';
        if (exT) exT.textContent = hero ? `EXP ${exVal}/${needExp}` : 'EXP —';
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
          /* v5.31 — 사기·상태이상·조각배 상태 */
          const mv = Math.round(u.morale == null ? 100 : u.morale);
          pills.push(`<span class="bf ${mv >= u.moraleMax ? 'good' : (mv >= 80 ? '' : 'bad')}">사기 ${mv}</span>`);
          if (u.ail) {
            Object.keys(AIL).forEach((k) => {
              const t = u.ail[k];
              if (!t || t <= 0) return;
              pills.push(`<span class="bf bad">${AIL[k].n} ${t}</span>`);
            });
          }
          if (u.aboard) pills.push('<span class="bf good">조각배</span>');
          if (u.expGain) pills.push(`<span class="bf exp">전투 경험 +${u.expGain}</span>`);   // v5.33
          bfBox.innerHTML = pills.join('');
        }
        $('#uc-mov').textContent = movOf(u);
        $('#uc-rng').textContent = effRng(u);
        /* v5.53 — 행동 가능 여부는 '내가 고른 부대'(B.sel)로 판단한다.
           적군을 보고 있을 때는 누구도 고르지 않은 것과 같다. */
        const canAct = !!B.sel && B.sel.side === 'ally' && !B.sel.acted;
        document.querySelectorAll('.act').forEach((b) => b.classList.toggle('off', !canAct));
        /* v5.36 — [군량] 버튼에 이 부대의 남은 횟수를 보여 준다: 군량 (2) / 군량 (0) 잠김 */
        /* v5.53 — 군량 버튼은 '실제로 명령을 받을 부대'(B.sel)의 남은 횟수를 보여 준다 */
        paintItemButton(B.sel || (u.side === 'ally' ? u : null));
        /* v5.54 — 필살기 버튼: S급이고 아직 안 썼으면 1/1, 쓰면 0/1 */
        paintUltButton(B.sel || null);
      } else {
        card.classList.remove('on');
        /* v5.40 — 선택한 부대가 없을 때 이전 초상·Lv·EXP·수치가 남지 않게 비운다 */
        card.classList.add('empty');
        $('#uc-name').textContent = '부대를 선택하세요';
        const bfBox0 = $('#uc-buffs'); if (bfBox0) bfBox0.innerHTML = '';
        $('#uc-lv').textContent = '';
        $('#uc-img').removeAttribute('src');
        $('#uc-cls').textContent = '부대를 고르면 병과·병력·사거리가 보입니다';
        $('#uc-terrain').textContent = '';
        $('#uc-hp').style.width = '0%'; $('#uc-mp').style.width = '0%';
        const ex0 = $('#uc-exp'); if (ex0) ex0.style.width = '0%';
        const exT0 = $('#uc-exp-txt'); if (exT0) exT0.textContent = 'EXP 0/0';
        const sideEl0 = $('#uc-side'); if (sideEl0) sideEl0.hidden = true;
        const infoBtn0 = $('#btn-unit-info'); if (infoBtn0) infoBtn0.hidden = true;
        $('#uc-hp-txt').textContent = ''; $('#uc-mp-txt').textContent = '';
        $('#uc-troops').textContent = '0'; $('#uc-train').textContent = '-';
        $('#uc-atk').textContent = '-'; $('#uc-def').textContent = '-';
        const ma0 = $('#uc-matk'), md0 = $('#uc-mdef');
        if (ma0) ma0.textContent = '-';
        if (md0) md0.textContent = '-';
        $('#uc-mov').textContent = '-'; $('#uc-rng').textContent = '-';
        /* v5.40 — 아래 상태줄에도 직전 부대 이름이 남지 않게 */
        const tipEl = $('#battle-tip');
        if (tipEl) tipEl.textContent = '부대를 눌러 선택하세요';
        paintItemButton(null);
        paintUltButton(null);
      }
      document.querySelectorAll('.act').forEach((b) => {
        if (b.dataset.act === 'attack') b.classList.toggle('active', mode === 'attack');
        if (b.dataset.act === 'skill') b.classList.toggle('active', mode === 'skillTarget');
        if (b.dataset.act === 'ult') b.classList.toggle('active', mode === 'ultTarget');
      });
      renderTargetBar();
    },
    endTurn,
    retreat,
    debug: {
      get battle() { return B; },
      /* v5.37 — 관전 QA: 전투가 멈춘 것인지(페이즈·연출·행동 플래그) 한 번에 본다 */
      state() {
        if (!B) return null;
        return { phase: B.phase, turn: B.turn, over: !!B.over, busy: busy, anims: anims.length, fx: fx.length,
          ally: B.units.filter((u) => u.side === 'ally' && u.alive).length,
          enemy: B.units.filter((u) => u.side === 'enemy' && u.alive).length,
          allyDone: B.units.filter((u) => u.side === 'ally' && u.alive && u.acted).length,
          enemyDone: B.units.filter((u) => u.side === 'enemy' && u.alive && u.acted).length };
      },
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
      /* v5.33 — 실시간 경험치 검증: 아군 부대별 레벨·경험치·이번 전투 획득량 */
      exp() {
        if (!B) return [];
        return B.units.filter((u) => u.side === 'ally' && u.uid).map((u) => {
          const h = (SK.state.heroes || []).find((x) => x.uid === u.uid) || {};
          return { name: u.name, lv: u.lv, heroLv: h.lv, exp: h.exp, need: SK.expNeed(h.lv || 1), gain: u.expGain || 0, atk: Math.round(u.atk) };
        });
      },
      get levelUps() { return (B && B.levelUps) || []; },
      /* v5.33 — 자동 턴 종료 검증: 지금 아군 중 행동할 부대가 남았는가 · 예약 상태 */
      get allActed() { return B ? !B.units.some((u) => u.side === 'ally' && u.alive && !u.acted) : null; },
      get autoEndPending() { return !!autoEndTimer; },
      get phase() { return B ? B.phase : null; },
      get turn() { return B ? B.turn : null; },
      tap(x, y) { onTileTap(x, y); },
      /* v5.53 — 《장수 정보》 QA: 탭 좌표·창 상태·바로 열기 */
      screenOf(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return { x: (u.x + 0.5) * TILE * cam.s + cam.x, y: (u.y + 0.62) * TILE * cam.s + cam.y, s: cam.s };
      },
      openInfo(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return openGenInfo(u);
      },
      info() { return giState(); },
      /* 화면 밖 부대를 검수에서 보이게 할 때 (기존 focus(x,y,s) 카메라 훅과 이름이 겹치지 않게) */
      centerOn(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        centerCam(u.x, u.y);
        return SKBattle.debug.screenOf(name);
      },
      closeInfo() { closeGenInfo(); },
      inspect() { return B && B.insp ? B.insp.name : null; },
      infoTab(k) { if (k) { giTab = k; giRender(); } return giTab; },
      /* v5.54 — 필살기 점검 훅 */
      ultInfo(name) {
        if (!B) return [];
        const list = name ? B.units.filter((o) => o.name === name) : B.units;
        return list.map((u) => {
          const s = ultOf(u);
          return { name: u.name, side: u.side, cls: u.cls, tier: unitTier(u), ult: s ? s.n : null,
            vfx: s ? s.v : null, used: !!u.ultUsed, need: !!(s && ultNeedsTarget(s)),
            range: s ? ultRange(u, s) : null, desc: s ? ultDesc(s) : null,
            ready: !!(s && !u.ultUsed && !u.acted && u.side === 'ally') };
        });
      },
      ultButton() {
        const btn = document.querySelector('#battle-actions .act.ult');
        if (!btn) return null;
        return { text: (btn.textContent || '').replace(/\s+/g, ' ').trim(), em: (btn.querySelector('em') || {}).textContent,
          ready: btn.classList.contains('ready'), off: btn.classList.contains('off'),
          active: btn.classList.contains('active'), disabled: btn.disabled };
      },
      /* v5.55 — 일기토 컷인 초상 테두리 검수 훅 (이름 있는 두 부대를 바로 붙여 본다) */
      duelCutin(aName, bName) {
        const a = B && B.units.find((o) => o.name === aName);
        const d = B && B.units.find((o) => o.name === bName);
        if (!a || !d) return { ok: false, why: 'no-unit' };
        if (B.duels) { B.duels.n = 0; B.duels.last = 0; B.duels.seen = {}; }
        const ok = duelCutin(a, d);
        const el = document.getElementById('duel-cutin');
        const card = (id) => { const im = el && el.querySelector(id); return im ? im.parentElement.className : null; };
        return { ok, a: card('#dc-img-a'), b: card('#dc-img-b') };
      },
      ultCast(name, targetName) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        const t = targetName ? B.units.find((o) => o.name === targetName && o.alive) : null;
        const s = ultOf(u);
        if (!u || !s) return { ok: false, why: 'no-ult' };
        const before = { hp: t ? Math.round(t.hp) : null };
        castUlt(u, s, t);
        return { ok: true, name: s.n, vfx: s.v, before };
      },
      ultPlan(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        const p = planUlt(u);
        return p ? { x: p.x, y: p.y, target: p.target ? p.target.name : null, score: Math.round(p.score), kill: !!p.kill, hitN: p.hitN } : null;
      },
      ultShout() { return ultShout ? { name: ultShout.name, n: ultShout.n, q: ultShout.q, t: Math.round(ultShout.t), life: ultShout.life } : null; },
      ultBubbleFrames() { return ultBubbleFrames; },
      ultFx() { return fx.filter((f) => f.kind === 'ult').map((f) => f.sub); },
      ultFxP() { return fx.filter((f) => f.kind === 'ult').map((f) => ({ sub: f.sub, p: Math.round(f.t / f.life * 100) / 100 })); },
      ultTint() { const f = fx.filter((x) => x.kind === 'tint')[0]; return f ? Math.round((1 - f.t / f.life) * 100) / 100 : 0; },
      ultList() { return Object.keys(SK.ULTIMATES || {}).length; },
      classMagic() {
        const out = {};
        Object.keys(SK.CLASSES).forEach((c) => { out[c] = { name: SK.CLASSES[c].name, atkMul: magicAtkMul({ cls: c }), defMul: magicDefMul({ cls: c }) }; });
        return out;
      },
      magStats(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return { name: u.name, cls: u.cls, atk: Math.round(effAtk(u)), def: Math.round(effDef(u)),
          matk: Math.round(magicAtk(u)), mdef: Math.round(magicDef(u)),
          atkMul: magicAtkMul(u), defMul: magicDefMul(u) };
      },
      skillDmg(aName, dName, key) {
        const a = B && B.units.find((o) => o.name === aName), d = B && B.units.find((o) => o.name === dName);
        const sk = SK.SKILLS[key];
        if (!a || !d || !sk) return null;
        return { est: estSkillDmg(a, d, sk), kind: sk.kind, power: sk.power };
      },
      basicDmg(aName, dName) {
        const a = B && B.units.find((o) => o.name === aName), d = B && B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        return calcDamage(a, d, { noCrit: true }).dmg;
      },
      startFrame() { return B && B.startFrame ? B.startFrame : null; },
      reframe() { return frameStartView(); },
      frameProbe() {
        if (!B || !stage) return null;
        const sw = stage.clientWidth, sh = stage.clientHeight;
        const box = startViewBox();
        const rect = B.units.filter((u) => u.alive).map((u) => {
          const head = (ryOf(u) + 0.05) * TILE * cam.s + cam.y - TILE * 1.2 * cam.s;
          const foot = (ryOf(u) + 1) * TILE * cam.s + cam.y;
          return { n: u.name, side: u.side, head: Math.round(head), foot: Math.round(foot) };
        });
        return { cam: { s: Math.round(cam.s * 1000) / 1000, x: Math.round(cam.x), y: Math.round(cam.y) },
          stage: { w: sw, h: sh, boxTop: box.y, boxBottom: box.y + box.h },
          units: rect,
          allyIn: rect.filter((r) => r.side === 'ally' && r.head >= box.y - 2 && r.foot <= sh + 1).map((r) => r.n),
          enemyIn: rect.filter((r) => r.side === 'enemy' && r.head >= box.y - 2 && r.foot <= sh + 1).map((r) => r.n) };
      },
      infoNav(d) { giNav(d); return giState(); },
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
      forceDefeat() { defeat(); },
      gate() { return B && B.gate ? { hp: Math.round(B.gate.hp), max: Math.round(B.gate.maxHp), tiles: B.gate.tiles } : null; },
      /* v5.31 — 사기·상태이상·조각배 점검 */
      status(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return { name: u.name, cls: u.cls, x: u.x, y: u.y, morale: Math.round(u.morale), moraleMax: u.moraleMax,
          hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), mp: Math.round(u.mp), maxMp: Math.round(u.maxMp),
          ail: Object.assign({}, u.ail || {}), aboard: !!u.aboard, slow: u.slow || 0,
          stunCd: u.stunCd || 0, ailRes: Object.assign({}, u.ailRes || {}),
          atk: Math.round(effAtk(u)), def: Math.round(effDef(u)), mov: movOf(u), tfx: u.tfx || {} };
      },
      /* v5.42 — 마을 자리·점령 상태 QA 훅 (중앙 길목으로 옮긴 자리와 점령 진영을 그대로 읽는다) */
      sites() {
        if (!B || !B.sites) return [];
        return B.sites.map((s) => ({ type: s.type, x: s.x, y: s.y, owner: s.owner || null, tile: B.tiles[s.y] ? B.tiles[s.y][s.x] : null }));
      },
      /* v5.49 — 마을 점령 판단 점검: 이 부대가 마을 칸마다 매기는 값과 지금 칸에서 갈 수 있는지 */
      villageScores(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u || !B.sites) return [];
        const foes = B.units.filter((o) => o.alive && o.side !== u.side);
        const reach = reachSet(u);
        return B.sites.filter((s) => s.type === 'village').map((s) => ({ x: s.x, y: s.y, owner: s.owner || null,
          d: manh(u.x, u.y, s.x, s.y), inReach: reach.has(s.x + ',' + s.y),
          value: villageValueAt(u, s.x, s.y, { foes, canStrike: canStrikeFrom(u, s.x, s.y, foes, effRng(u), u.minRng || 1) }) }));
      },
      statuses() {
        if (!B) return [];
        return B.units.filter((u) => u.alive).map((u) => ({ n: u.name, side: u.side, morale: Math.round(u.morale || 100),
          ail: Object.keys(u.ail || {}), aboard: !!u.aboard }));
      },
      giveAil(name, kind, turns) { const u = B && B.units.find((o) => o.name === name); return u ? ailApply(u, kind, null, turns) : null; },
      giveMorale(name, d) { const u = B && B.units.find((o) => o.name === name); if (!u) return null; moraleShift(u, d); return Math.round(u.morale); },
      place(name, x, y) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        u.x = x; u.y = y; u.rx = x; u.ry = y; syncBoat(u);
        return { tile: B.tiles[y] ? B.tiles[y][x] : null, aboard: !!u.aboard };
      },
      boatable() { return !!(B && B.boatable); },
      ailPhase(side) { ailPhase(side || 'ally'); return this.statuses(); },
      onHit(aName, dName) {
        const a = B && B.units.find((o) => o.name === aName), d = B && B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        onHitAil(a, d, 'melee', {});
        return { ail: Object.assign({}, d.ail || {}), morale: Math.round(d.morale) };
      },
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
      /* v5.27 — 고유특기 문구가 병력 라벨을 덮지 않는지 눈으로 보기 위한 QA 훅 */
      float(name, text) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return null;
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.5) * TILE, text || `「${(u.passive && u.passive.title) || '고유특기'}」`, '#ffe08a', { back: true });
        return floats.length;
      },
      floatY(name) {
        const u = B && B.units.find((o) => o.name === name);
        return u ? { feet: (ryOf(u) + 1) * TILE, cam: cam.s } : null;
      },
      /* v5.27 — 보조 부대가 이번 턴 설 수 있는 성 안 칸 (안전 후방 판단 검증용) */
      defTiles(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return { from: [u.x, u.y], role: defenseRoleOf(u), reach: supportReach(u),
          tiles: moveTiles(u).map((t) => [t.x, t.y]) };
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
      /* v5.49 — 책략에는 반격이 없다는 규칙 검증: 지정 부대가 책략을 그 자리에서 펼친다 */
      castSkill(name, key, x, y) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        const sk = key ? SK.SKILLS[key] : null;
        if (!u || !sk) return null;
        const before = { hp: Math.round(u.hp), mp: u.mp, maxMp: u.maxMp };
        const ok = aiCast(u, sk, x, y);
        return { ok, before, after: { hp: Math.round(u.hp), mp: u.mp }, cost: sk.mp || 0 };
      },
      /* v5.49 — 지금 이 부대가 쓸 수 있는 책략(MP가 되는 것) 목록 */
      skills(name) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return null;
        return { mp: u.mp, maxMp: u.maxMp,
          list: (u.skills || []).map((k) => ({ key: k, name: (SK.SKILLS[k] || {}).name, kind: (SK.SKILLS[k] || {}).kind, mp: (SK.SKILLS[k] || {}).mp })) };
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
          mdef: Math.round(magicDef(u)), rng: effRng(u), bond: bondAllyMul(u), hp: Math.round(u.hp), maxHp: Math.round(u.maxHp),
          buffs: JSON.parse(JSON.stringify(u.buffs || {})) } : null;
      },
      /* v5.30 — 전투 규칙 검증용: 예상 피해·보물 훅·일기토 횟수 */
      calc(aName, dName, opts) {
        const a = B.units.find((o) => o.name === aName), d = B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        const r = calcDamage(a, d, Object.assign({ noCrit: true }, opts || {}));
        return { dmg: r.dmg, tri: r.tri, atk: Math.round(effAtk(a)), def: Math.round(effDef(d)), tfx: a.tfx, dtfx: d.tfx };
      },
      duels() { return B ? Object.assign({}, B.duels || {}) : null; },
      /* v5.52 — 1:1 일기토 검증 훅: 강제 개전 · 상태 · 수 선택 · 자동 · 발동률 측정 */
      duelOpen(aName, dName) {
        if (!B) return null;
        const find = (n, side) => B.units.filter((u) => u.side === side && u.alive && (!n || u.name === n))[0];
        const a = find(aName, 'ally'), d = find(dName, 'enemy');
        if (!a || !d) return null;
        if (duel) closeDuel();
        openDuel(a, d, null);
        return { a: a.name, d: d.name, atkA: duelAtkStat(a), atkD: duelAtkStat(d) };
      },
      duelState() {
        if (!duel) return null;
        return { a: duel.a.name, d: duel.d.name, hpA: Math.round(duel.hpA), hpD: Math.round(duel.hpD),
          turn: duel.turn, over: !!duel.over, busy: !!duel.busy, auto: !!duel.auto,
          last: duel.last, ended: duel.ended, war: duel.a.alive && duel.d.alive };
      },
      duelChoose(k) { return duelPick(k); },
      duelForceAi(k) { if (!duel) return null; duel.forceAi = k; return k; },
      duelFast(v) { duelFast = !!v; return duelFast; },
      duelRateSet(v) { if (v != null) duelRate = Math.max(0, Math.min(1, Number(v) || 0)); return duelRate; },
      duelWait() { return !!(duelEls && !duelEls.root.hidden); },
      duelAuto() { duelToggleAuto(); return duel ? !!duel.auto : null; },
      duelClose() { closeDuel(); return true; },
      duelAlive() { return duel ? { a: duel.a.alive, d: duel.d.alive, fateA: duel.a.fate || null, fateD: duel.d.fate || null } : null; },
      /* 같은 조건으로 여러 번 뽑아 4% 발동률을 실측한다 (상태는 건드리지 않는다) */
      /* v5.53 — 무력 가중치 확인: 그 두 장수의 지금 발동 확률(%)과 고정값 설정 */
      duelChance(aName, dName) {
        if (!B) return null;
        const a = B.units.find((u) => u.name === aName && u.alive) || B.units.find((u) => u.side === 'ally' && u.alive);
        const d = B.units.find((u) => u.name === dName && u.alive) || B.units.find((u) => u.side === 'enemy' && u.alive);
        if (!a || !d) return null;
        return { a: a.name, d: d.name, aw: a.wu, dw: d.wu, pct: Math.round(duelChance(a, d) * 1000) / 10 };
      },
      duelSetRate(v) { duelRate = (v == null ? null : Number(v)); return duelRate; },
      duelProbe(aName, dName, n) {
        if (!B) return null;
        const a = B.units.filter((u) => u.side === 'ally' && u.alive && (!aName || u.name === aName))[0];
        const d = B.units.filter((u) => u.side === 'enemy' && u.alive && (!dName || u.name === dName))[0];
        if (!a || !d) return null;
        const keep = JSON.parse(JSON.stringify(B.duels || {}));
        B.duels = { n: 0, last: 0, seen: {} };
        let hits = 0;
        const total = Math.max(1, Number(n) || 1000);
        for (let i = 0; i < total; i++) if (duelOffer(a, d)) hits += 1;
        B.duels = keep;
        return { hits, n: total, pct: Math.round(hits / total * 1000) / 10 };
      },
      night() { return !!(B && B.night); },
      /* v5.30 — 공격/반격 한 번을 직접 실행해 보는 검증 훅 */
      strike(aName, dName, opts) {
        const a = B.units.find((o) => o.name === aName), d = B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        attackUnit(a, d, Object.assign({ noStrike: true, noDuel: true }, opts || {}), () => {});
        return { a: a.name, d: d.name };
      },
      counterOf(aName, dName) {
        const a = B.units.find((o) => o.name === aName), d = B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        counter(a, d);
        return { counter: a.name, attacker: d.name };
      },
      place(unitName, x, y) { const u = B.units.find((o) => o.name === unitName); if (u) { u.x = x; u.y = y; u.rx = x; u.ry = y; syncBoat(u); } return u ? { x: u.x, y: u.y, aboard: !!u.aboard } : null; },
      attack(targetId) { const u = B.sel; const t = B.units.find((o) => o.id === targetId); if (u && t) doAttack(u, t); },
      /* v5.31 — 보물 적중 효과·추격 검증용: 지정한 두 부대로 즉시 공격 */
      attackNow(aName, dName) {
        const a = B && B.units.find((o) => o.name === aName), d = B && B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        B.lastHits = [];
        doAttack(a, d);
        return { ok: true };
      },
      hits() { return B && B.lastHits ? B.lastHits.slice() : []; },
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
      if (act === 'speed') { toggleSpeed(); return; }  // v5.10 — 전투 배속 ×1 / ×2
      if (B.phase !== 'ally' || B.over) return;
      /* v5.53 — 적군 정보를 보던 중에 내 부대 명령을 누르면 보기용 선택을 먼저 푼다 */
      if (B.insp) { B.insp = null; B.reachCache = B.sel && !B.sel.acted && !B.sel.movedThisTurn ? { uid: B.sel.id, set: reachSet(B.sel) } : null; SKBattle.refreshUI(); }
      const u = B.sel;
      if (act === 'attack') {
        if (!u || u.acted) { SK.toast('부대를 먼저 선택하세요.'); return; }
        mode = 'attack'; pendingSkill = null;
        $('#battle-tip').textContent = '공격할 적을 선택하세요';
        SKBattle.refreshUI();
      }
      if (act === 'skill') openSkillMenu();
      if (act === 'ult') openUltMenu();   // v5.54 — S급 고유 필살기
      if (act === 'item') useItem();
      if (act === 'wait') waitUnit();
    });
    /* v5.53 — 아래 카드에서 《장수 정보》 열기 (초상화 탭 · [정보] 버튼) */
    const openInfoFromCard = () => {
      if (!B) return;
      const t = B.insp || B.sel;
      if (!t) { SK.toast('부대를 먼저 선택하세요.'); return; }
      if (SK.sfx) SK.sfx.play('ui');
      openGenInfo(t);
    };
    const ib = $('#btn-unit-info'), pc = $('#uc-portrait');
    if (ib) ib.onclick = openInfoFromCard;
    if (pc) {
      pc.onclick = openInfoFromCard;
      pc.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInfoFromCard(); } };
    }
    const gix = $('#gi-x'), gic = $('#gi-close');
    if (gix) gix.onclick = closeGenInfo;
    if (gic) gic.onclick = closeGenInfo;
    const gp = $('#gi-prev'), gn = $('#gi-next');
    if (gp) gp.onclick = () => giNav(-1);
    if (gn) gn.onclick = () => giNav(1);
    const gtabs = $('#gi-tabs');
    if (gtabs) gtabs.onclick = (e) => {
      const b = e.target.closest('.gi-tab');
      if (!b || !b.dataset.tab) return;
      giTab = b.dataset.tab;
      giRender();
      if (SK.sfx) SK.sfx.play('ui');
    };
    const gatk = $('#gi-attack');
    if (gatk) gatk.onclick = () => {
      if (!B) return;
      const t = B.units.find((o) => o.id === giUid);
      const a = B.sel;
      if (!t || !a) return;
      closeGenInfo();
      openAttackPreview(a, t);
    };
    const gpanel = $('#gen-info');
    if (gpanel) gpanel.addEventListener('click', (e) => { if (e.target === gpanel) closeGenInfo(); });
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
