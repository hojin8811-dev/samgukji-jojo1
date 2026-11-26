/* ══════════════════════════════════════════════════════════════
   4단계 · 대형 격자 전장 — 24/28/32 팬/줌·미니맵, 이동·공격·책략·AI
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK;
  const $ = (s) => document.querySelector(s);
  /* v5.17 — 격자 크기는 전장마다 다르다. 요격·소도시 24, 중도시 28, 대도시 32.
     v5.90 — 가로(COLS)·세로(ROWS)를 따로 둔다. 직사각형 지도에서도 카메라 클램프·
     미니맵·그리기 범위가 실제 지도 크기와 어긋나지 않는다.
     startBattle에서 B.cols·B.rows에 맞춰 다시 잡는다. */
  const TILE = 64;
  let COLS = 18, ROWS = 18;
  let WORLD_W = COLS * TILE, WORLD_H = ROWS * TILE;
  /* v5.90 — 화면 가장자리 HUD(위 목표 띠·오른쪽 미니맵·아래 줌/팁)에 가려진 끝 칸도
     가운데 쪽으로 끌어와 누를 수 있게, 카메라가 지도 밖으로 이만큼 더 나가게 허용한다. */
  const CAM_PAD_L = 72, CAM_PAD_R = 72, CAM_PAD_T = 56, CAM_PAD_B = 84;
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
  /* v5.89 — 총도독 전쟁 [관전하기]·[건너뛰기]
     · spectateMode: 아군도 AI가 지휘하고 플레이어 명령을 전부 막는다(관전 전용).
     · skipMode: 관전 없이 빠르게 자동 결산(같은 전투 엔진, 배속만 최대로). */
  let spectateMode = false;
  let skipMode = false;
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
  /* v5.59 — 배율표는 data.js `SK.mpScaleOf(cls)` 하나다. 책사·도사·풍수사 0.65 · 나머지 0.5.
     적·일반 부대도 같은 표를 쓰므로 아군 장수(SK.maxMpOf)와 값이 어궸나지 않는다. */
  function mpScaleOf(cls) {
    if (SK.mpScaleOf) return SK.mpScaleOf(cls);
    if (SK.MP_SCALE_BY_CLASS && SK.MP_SCALE_BY_CLASS[cls] != null) return SK.MP_SCALE_BY_CLASS[cls];
    return MP_SCALE;
  }
  function maxMpBase(base, cls) { return Math.max(MP_FLOOR, Math.round((Number(base) || 0) * mpScaleOf(cls))); }
  SK.maxMpBase = maxMpBase;
  SK.battleMpScaleOf = mpScaleOf;
  /* v5.10 — 전투 배속(처음엔 자동전투에만 걸었다).
     v5.51 — 수동 전투에도 실제로 걸린다. 예전 paceMs는 autoOn일 때만 계산해서
     수동 조작 중(적군 페이즈 포함)에 ×2·×3·×4를 눌러도 아무것도 빨라지지 않았고,
     autoOn일 때도 `2 / 배속`이라 ×1이 0.5배속·×2가 1.0배속이었다.
     이제 ×1=그대로 · ×2=÷2 · ×3=÷3 · ×4=÷4.
     너무 짧아져 연출이 사라지거나 턴 처리가 겹치지 않게 하한만 둔다(×2 16ms · ×3 12ms · ×4 8ms). */
  /* v5.83 — 관리자 관전 전용 추가 배속(paceBoost). 1이면 지금까지와 똑같다. */
  let paceBoost = 1;
  function paceMs(ms) {
    const n = Math.round(Number(ms) || 0);
    const sp = autoSpeed || 1;
    if (n <= 0) return n;
    if (sp <= 1 && paceBoost <= 1) return n;
    const eff = Math.max(1, sp) * Math.max(1, paceBoost);
    const floor = sp >= 4 ? 8 : (sp === 3 ? 12 : 16);
    return Math.max(floor, Math.round(n / eff));
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

  /* ══════════════════════════════════════════════════════════════
     v5.65 — 적 편성 계획을 한 곳에서 계산 (편성·도착 카드 ↔ 실제 전장 일치)
     · 예전에는 수비병 1,200~2,000인 약해진 성에도 부대마다 최소 900명을
       채워 6부대 5,400명이 나왔다 — 화면에 적힌 수비병 수와 3배 넘게 어긋났다.
     · 이제 부대당 최소 병력을 300까지 내려 총병력이 성 수비병을 따라간다.
     · startBattle(실제 소환)과 js/app.js enemyFieldForecast(카드 표시)가
       이 함수 하나를 같이 쓴다 — 수식을 고칠 때는 여기만 고친다.
     ══════════════════════════════════════════════════════════════ */
  const ENEMY_FRAC = [1, 0.9, 1.05, 0.95, 1, 0.9, 1.1, 0.95];
  function enemyPlan(o) {
    const opt = o || {};
    const intercept = opt.intercept || null;
    const cityTroops = Math.max(0, Math.round(Number(opt.cityTroops) || 0));
    let count, per;
    if (intercept) {
      /* 요격전은 경고창에 적힌 요격대 병력과 같은 수로 (v5.21) */
      count = clamp(2 + Math.round((intercept.troops || 800) / 1200), 2, 6);
      per = Math.max(120, Math.round(((intercept.troops || 800) / (count + 0.5)) / 20) * 20);
    } else {
      count = clamp(6 + Math.floor(cityTroops / 3800), 6, 10);
      per = clamp(Math.round(cityTroops / count / 100) * 100, 300, 5200);
    }
    const defGens = Math.max(0, Math.round(Number(opt.defGens) || 0));
    const hasBoss = !!opt.hasBoss;
    const troops = [];
    for (let i = 0; i < count; i++) {
      let mul = ENEMY_FRAC[i % 8];
      if (i < defGens) mul = (i === 0) ? 1.5 : 1;
      else if (i === 0 && hasBoss) mul = 1.5;
      troops.push(Math.round(per * mul));
    }
    const total = troops.reduce((a, b) => a + b, 0);
    return { count, per, troops, total };
  }
  SK.enemyPlan = enemyPlan;

  SK.startBattle = function (opts) {
    document.querySelectorAll('#modal-root .modal-layer').forEach((m) => m.remove());
    closeGenInfo();   // v5.53 — 앞 전투의 《장수 정보》 창이 새 전장에 남지 않게
    const s = SK.state;
    const target = SK.CITY[opts.targetId];
    const defense = opts.defense || null;
    const type = opts.type || SK.battleTypeFor(target);
    /* v5.66a — GA4: 전투 진입(공성·수성·요격·야전·관문) */
    try { if (window.skTrack) window.skTrack('battle_start', { battle_type: type }); } catch (e) { /* ignore */ }
    const def = SK.BATTLE_TYPES[type];
    /* v5.97 — 이 전투를 다시 열 때 필요한 최소 정보만 남긴다 (이탈 복구용 스냅샷) */
    const snapOpts = snapOptsOf(opts, type);
    /* v5.11 — 공성·수성 통일: 같은 성이면 공격/방어 모두 같은 성벽 맵을 쓴다.
       도시 등급이 높을수록 성벽이 1중 → 2중 → 3중으로 겹친다. */
    /* v6.0 — 수상 공성·산성 공략도 공성 계열이다 (성문·성벽·겹성벽 규칙을 그대로 쓴다) */
    const isSiege = (SK.isSiegeType ? SK.isSiegeType(type) : (type === 'siege' || type === 'defense'));
    const cellState = s.cities[opts.targetId];
    const rings = isSiege ? (SK.siegeRingsOfCity ? SK.siegeRingsOfCity(target) : 1) : 0;
    const mapKey = (SK.mapKeyFor ? SK.mapKeyFor(type, rings) : (isSiege && SK.siegeMapKey ? SK.siegeMapKey(rings) : def.map));
    /* v5.86b — 에디터에서 칠한 커스텀 전장(__map_editor)은 통이미지 대신 타일을 직접 그린다 */
    const customTilesRender = !!(opts.customTiles) || (typeof mapKey === 'string' && mapKey.slice(0, 2) === '__');
    const mapRows = SK.MAPS[mapKey] || SK.MAPS[def.map];
    const tiles = mapRows.map((r) => r.split(''));
    /* v5.17 — 동적 격자 크기 + 1×1 본진·마을 자리 */
    const meta = SK.MAP_META[mapKey] || (def.map && SK.MAP_META[def.map]) || null;
    const cols = meta ? meta.cols : tiles[0].length;
    const rows = meta ? meta.rows : tiles.length;
    COLS = cols; ROWS = rows;
    WORLD_W = COLS * TILE; WORLD_H = ROWS * TILE;
    const bgKey = isSiege
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
    /* v5.65 — 부대 수·부대별 병력은 enemyPlan 하나가 정한다 (편성 카드 예측과 같은 수) */
    const plan = enemyPlan({ cityTroops, intercept, defGens: defGens.length, hasBoss: !!bossInfo });
    const enemyCount = plan.count;
    const per = plan.per;
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
      if (defGens[i]) {
        /* v5.81 — 성마다 S·A급 에이스에게 병력을 몰아준다 (S ×1.35 · A ×1.2, 후열 B·C는 ×0.85) */
        const gt = defGens[i].tier;
        const aceMul = gt === 'S' ? 1.35 : gt === 'A' ? 1.2 : (i >= 3 ? 0.85 : 1);
        enemies.push(makeNamedEnemy(defGens[i], Math.round(per * aceMul), i === 0));
        continue;
      }
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
    /* v5.81 — 난이도(어려움·패왕): 적 부대 스펙 상향. 아군 부대에는 붙이지 않는다. */
    const diffNow = SK.diffOf ? SK.diffOf(s) : null;
    if (diffNow && diffNow.stat && diffNow.stat !== 1) {
      const mul = diffNow.stat;
      enemies.forEach((u) => {
        u.atk = u.atk * mul;
        u.def = u.def * mul;
        u.maxHp = Math.round(u.maxHp * mul);
        u.hp = Math.round(u.hp * mul);
        u.train = Math.min(100, Math.round((u.train || 60) * (1 + (mul - 1) * 0.5)));
      });
    }
    /* v5.65 — 실제로 세운 적 부대의 총병력 (편성·도착 카드의 예측과 같은 수) */
    const enemyTotal = enemies.reduce((a, u) => a + Math.max(0, u.hp || 0), 0);

    /* v5.2 — 성문 내구도. v5.11 — 겹성벽이면 바깥 성문부터 차례로 부순다.
       수성전도 같은 성문·성벽을 그대로 쓴다 (진영만 바뀐다). */
    const gateRows = [];
    if (isSiege || type === 'fortress') {
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
    /* v6.0 — 같은 성벽 줄에 정문과 동·서 측면 샛문이 함께 있으면 문마다 따로 부순다.
       성문 칸을 가로 위치로 묶어(한 칸 사이는 같은 문, 3칸 이상 벌어지면 다른 문) 각각 하나의 성문으로 만든다.
       정문 HP를 다 깎지 않고 측면 샛문을 먼저 뚫는 '우회 공성'이 가능해진다. */
    const gateHpBase = clamp(Math.round(cityTroops * 0.14) + 500, 800, 2200);
    const cxMid = Math.floor(COLS / 2);
    const gateList = [];
    gateRows.forEach((gr, bandIdx) => {
      const xs = Array.from(new Set(gr.tiles.map((t) => t.x))).sort((a, b) => a - b);
      const clusters = [];
      xs.forEach((x) => {
        const last = clusters[clusters.length - 1];
        if (last && x - last[last.length - 1] <= 1) last.push(x);
        else clusters.push([x]);
      });
      clusters.forEach((cl) => {
        const center = cl.reduce((a, b) => a + b, 0) / cl.length;
        const main = Math.abs(center - cxMid) <= 1;
        const list = [];
        gr.rows.forEach((y) => cl.forEach((x) => list.push({ x, y })));
        gateList.push({ row: gr.row, rows: gr.rows, center, main, band: bandIdx, tiles: list });
      });
    });
    /* 같은 줄이면 정문 → 측문 순. 바깥 줄이 먼저 온다 */
    gateList.sort((a, b) => (b.row - a.row) || ((b.main ? 1 : 0) - (a.main ? 1 : 0)) || (a.center - b.center));
    const gates = gateList.map((g) => {
      const ring = g.band + 1;
      const factor = ring === 1 ? 1 : (ring === 2 ? 0.72 : 0.55);
      const hp = Math.max(420, Math.round(gateHpBase * factor * (g.main ? 1 : 0.7)));
      return { row: g.row, rows: g.rows, tiles: g.tiles, hp, maxHp: hp, ring, main: !!g.main, side: !g.main };
    });
    const gateInit = gates[0] || null;   // B.gate는 가장 바깥에 남은 성문을 가리킨다

    B = {
      type, def, name: defense ? `${target.name} 수성전` : (intercept ? `${intercept.name}` : `${target.name} ${def.name}`),
      targetId: opts.targetId, origin: opts.origin,
      tiles, units: [], turn: 1, phase: 'ally', sel: null, insp: null,   // v5.53 — insp = 아래 카드에 띄운 부대(적군 포함, 읽기 전용)
      cols: cols, rows: rows, bgKey: bgKey, mapKey: mapKey, customTilesRender: customTilesRender,
      acted: false, over: false, log: [], faction, rewards: { gold: 0, food: 0 }, gate: gateInit, gates: gates, rings: rings, towers: [],
      introLines: buildIntro(type, target, faction, bossInfo, defGens, SK.pickEvent(target, defGens), intercept),
      _snapOpts: snapOpts,
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
      /* v5.65 — 적 총병력(예측/실제) */
      enemyTotal, enemyPlanTotal: plan.total,
      /* v5.93 — 요새 성벽 방어 2배: 거점 주인이 서는 쪽을 '수비측'으로 두고
         그쪽 부대의 성벽 방어를 계수(요새 2.0)만큼 올린다 (공성·수성·요새전 공통) */
      wallDefMul: (SK.fortressWallMul ? SK.fortressWallMul(target) : ((target && (target.type === 'fortress' || target.type === 'pass')) ? 2 : 1)),
      wallDefSide: (((s.cities[opts.targetId] || {}).owner === SK.playerFaction()) ? 'ally' : 'enemy'),
      wallPct: Math.max(0, Math.min(100, Number((((s.cities[opts.targetId] || {}).def) == null ? 50 : s.cities[opts.targetId].def)))),
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
    } else if (type === 'convoy') {
      /* v6.0 — 호송 마차 진지: 보급품 상자·바리케이드·막사 */
      B.props = [
        { k: 'supply', x: 9, y: 11, s: 0.9 }, { k: 'supply', x: 14, y: 12, s: 0.9 },
        { k: 'supply', x: 12, y: 9, s: 0.82 }, { k: 'barricade', x: 8, y: 12, s: 0.86 },
        { k: 'barricade', x: 15, y: 11, s: 0.86 }, { k: 'camp', x: 11, y: 14, s: 0.92 },
      ];
    } else if (type === 'steppe') {
      /* v6.0 — 초원 목책 진지: 천막과 바리케이드 */
      B.props = [
        { k: 'camp', x: 6, y: 4, s: 1.0 }, { k: 'camp', x: 17, y: 4, s: 1.0 },
        { k: 'barricade', x: 9, y: 6, s: 0.86 }, { k: 'barricade', x: 14, y: 6, s: 0.86 },
        { k: 'supply', x: 8, y: 3, s: 0.84 }, { k: 'supply', x: 16, y: 3, s: 0.84 },
      ];
    } else if (isSiege || type === 'fortress') {
      B.props = [
        { k: 'camp', x: 2, y: 15, s: 1.0 }, { k: 'camp', x: 15, y: 15, s: 1.0 },
        { k: 'supply', x: 2, y: 16, s: 0.88 }, { k: 'supply', x: 15, y: 16, s: 0.88 },
        { k: 'barricade', x: 4, y: 16, s: 0.84 }, { k: 'barricade', x: 13, y: 16, s: 0.84 },
        { k: 'catapult', x: 5, y: 15, s: 0.9 }, { k: 'catapult', x: 12, y: 15, s: 0.9 },
        { k: 'ram', x: 7, y: 16, s: 0.88 }, { k: 'ram', x: 10, y: 16, s: 0.88 },
        { k: 'siege_tower', x: 4, y: 14, s: 0.9 }, { k: 'siege_tower', x: 13, y: 14, s: 0.9 },
      ];
    }
    /* v5.96 — 부대가 마을·본진 칸 위에 겹쳐 서지 않게, 사이트 자리를 배치 전에 모아 둔다.
       B.sites는 배치가 끝난 뒤에 세우므로 여기서는 지도 meta의 좌표를 그대로 쓴다. */
    const spawnTaken = new Set();
    if (meta) {
      [meta.allyBase, meta.enemyBase].forEach((b) => { if (b) spawnTaken.add(b.x + ',' + b.y); });
      (meta.villages || []).forEach((v) => { if (v) spawnTaken.add(v.x + ',' + v.y); });
    }
    /* v5.90 — 배치 도우미에도 가로·세로를 함께 넘긴다 (직사각형 지도 대응) */
    placeSide(allies, SK.allySlots(type, rings, cols, rows), 'ally',
      Object.assign({ blocked: spawnTaken }, type === 'defense' ? { zones: defenseZoneSlots(tiles, meta, cols, rows) } : null));
    /* v5.81 — AI 진형: 탱커(검병·창병·등갑병)를 전열에, 원거리·보조를 후열에 세운다 */
    const DEPLOY_RANK = { geombyung: 0, changbyung: 1, deunggabyung: 0, mudoga: 2, yasubyung: 2, sanjeok: 2, sujeok: 2, gibi: 2, gunwoong: 3,
      gungsu: 4, gunggi: 4, yeonnobyung: 4, pocha: 5, balseokcha: 5, chaeksa: 6, dosa: 6, pungsusa: 7, muhui: 7, gunakdae: 7 };
    enemies.sort((a, b) => (DEPLOY_RANK[a.cls] == null ? 3 : DEPLOY_RANK[a.cls]) - (DEPLOY_RANK[b.cls] == null ? 3 : DEPLOY_RANK[b.cls]));
    placeSide(enemies, SK.enemySlots(type, rings, cols, rows), 'enemy', { blocked: spawnTaken });
    /* v5.31 — 사기·상태이상 초기화 (보물의 사기 +N·상태이상 저항이 여기서 붙는다) */
    B.units.forEach(initStatus);
    /* v6.0 — 전략 지형 상태: 연소 중인 갈대밭(B.fire)과 군량고·무기고(B.objs) */
    B.fire = {};
    B.objs = makeObjs();
    B.objTaken = {};
    /* v6.0 — 직전 요격전(보급대 습격 등)에서 적 군량고·무기고를 끊었으면
       이어지는 공성전의 성문이 약해지고 적 사기가 낮게 시작한다. */
    const siegeGift = (SK.state && SK.state.nextSiegeBonus) || null;
    if (siegeGift && isSiege && !defense && siegeGift.cityId === opts.targetId) {
      (B.gates || []).forEach((g) => {
        g.hp = Math.max(220, Math.round(g.hp * (siegeGift.gate || 0.8)));
        g.maxHp = Math.max(g.maxHp, g.hp);
      });
      B.units.forEach((u) => {
        if (u.side !== 'enemy') return;
        u.morale = clamp((u.morale == null ? MORALE_BASE : u.morale) - (siegeGift.morale || 10), 0, u.moraleMax || 100);
      });
      B.siegeGift = siegeGift;
      SK.state.nextSiegeBonus = null;
      wait(() => SK.toast('요격전 성과 — 적 군량이 끊겨 성문이 약하고 적 사기가 낮습니다'), 900);
    }
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
        u.morale = clamp((u.morale == null ? MORALE_BASE : u.morale) + b, 0, u.moraleMax || 100);
      }
    });
    B.surprise = !!opts.surprise;
    if (B.surprise) {
      B.units.forEach((u) => {
        if (u.side !== 'enemy' || !u.alive) return;
        u.morale = clamp((u.morale == null ? MORALE_BASE : u.morale) - 8, 0, u.moraleMax || 100);
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
    /* v5.91 — 공성·수성전: 성문 좌우에 자동 포격 망루 (성 규모 1/2/3 → 2/3/4대) */
    initTowers();
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
      if (isSiege || type === 'fortress') { u.role = u.leader ? 'assault' : 'guard'; return; }
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
    /* v5.89 — 관전/자동결산 모드 플래그 (전장을 열 때마다 새로 잡는다) */
    spectateMode = !!opts.spectate;
    skipMode = !!opts.skip;
    B.spectate = spectateMode || skipMode;
    B.skip = skipMode;
    if (spectateMode) { autoSpeed = skipMode ? 4 : Math.max(2, autoSpeed); }
    paintSpeedBtn();
    SK.show('screen-battle');
    if (window.JojoBGM) {
      try { JojoBGM.play(isSiege || type === 'fortress' ? 'battle_siege' : 'battle_field'); } catch (e) { /* ignore */ }
    }
    if (window.SK && SK.bgm && !window.JojoBGM) SK.bgm(isSiege || type === 'fortress' ? 'battle_siege' : 'battle_field');
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
    /* v5.97 — 저장된 스냅샷으로 다시 연 전장이면 턴·병력·좌표를 되살리고 인트로는 건너뛴다 */
    const resumed = opts.snap ? applySnap(opts.snap) : false;
    if (opts.snap) { try { clearSnap(); } catch (e) { /* ignore */ } }
    if (resumed) { B.introDone = true; }
    SKBattle.refreshUI();
    if (!resumed) { try { saveSnap(); } catch (e) { /* ignore */ } }
    /* v5.89 — [건너뛰기]는 인트로를 건너뛰고 바로 자동 결산으로 들어간다 */
    if (skipMode || resumed) finishIntro(); else showIntro();
    if (supportNames.length) {
      wait(() => SK.toast(`적 지원군 합류 — ${supportNames.join(' · ')}`), 260);
    }
    if (B.surprise) {
      wait(() => SK.toast('기습 — 강행군으로 진을 치기 전에 닿았습니다 (적 사기 −8)'), 320);
    }
  };

  /* ══════════ v5.97 — 전투 중 이탈 복구 (localStorage 스냅샷) ══════════
     모바일에서 잠깐 다른 앱을 갔다 오거나 새로고침으로 전장이 사라져도,
     다음 실행에서 [이어하기] 또는 [자동 결산]을 고를 수 있게 매 아군 턴 시작에
     전투 상태(부대 위치·병력·행동·성문·턴)를 적어 둔다. 고르지 않고 [병력 회수]를
     고르면 지금까지처럼 병력을 성으로 돌려보낸다 (기존 안전 장치 유지).
     ══════════════════════════════════════════════════════════════════ */
  const SNAP_KEY = 'samgukji-jojo-battle-snap-v1';
  const SNAP_MAX_AGE = 24 * 3600 * 1000;
  function clearSnap() {
    try { localStorage.removeItem(SNAP_KEY); } catch (e) { /* ignore */ }
  }
  function peekSnap() {
    try {
      const raw = localStorage.getItem(SNAP_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || o.v !== 1 || !o.opts) return null;
      if (Date.now() - (Number(o.at) || 0) > SNAP_MAX_AGE) { clearSnap(); return null; }
      return o;
    } catch (e) { return null; }
  }
  function snapOptsOf(opts, type) {
    const units = (opts.units || []).map((u) => ({
      kind: u.kind, uid: u.uid, cls: u.cls, name: u.name, troops: u.troops,
      zone: u.zone, rfg: u.rfg ? 1 : 0, moraleBonus: u.moraleBonus || 0,
    }));
    const out = {
      origin: opts.origin, targetId: opts.targetId, type: type,
      units: units, marchId: opts.marchId || null, reserve: Math.max(0, Math.round(opts.reserve || 0)),
      surprise: !!opts.surprise, lastStand: !!opts.lastStand,
    };
    if (opts.defense) {
      out.defense = { faction: opts.defense.faction, troops: opts.defense.troops, from: opts.defense.from,
        genIds: (opts.defense.genIds || []).slice(0, 8), survivingEnemies: opts.defense.survivingEnemies || null };
    }
    if (opts.intercept) {
      out.intercept = { name: opts.intercept.name, troops: opts.intercept.troops, faction: opts.intercept.faction,
        from: opts.intercept.from, genIds: (opts.intercept.genIds || []).slice(0, 8) };
    }
    if (opts.reinforce) {
      out.reinforce = { from: opts.reinforce.from, arriveTurn: opts.reinforce.arriveTurn || 0,
        units: (opts.reinforce.units || []).map((u) => ({ kind: u.kind, uid: u.uid, cls: u.cls, name: u.name, troops: u.troops })) };
    }
    return out;
  }
  /* 지금 전투 상태를 요약해 저장한다 (아군 턴 시작·첫 배치) */
  function saveSnap() {
    if (!B || B.over || !B._snapOpts) return;
    /* v5.98 — 튜토리얼 전투는 본편 이탈 복구 스냅샷을 건드리지 않는다
       (튜토리얼을 중간에 나가도 다음 실행이 본편 전장을 되살리지 않게) */
    if (typeof window !== 'undefined' && window.SKTUT && window.SKTUT.active) return;
    try {
      const data = {
        v: 1, at: Date.now(),
        opts: B._snapOpts,
        turn: B.turn, phase: B.phase,
        gates: (B.gates || []).map((g) => ({ row: g.row, hp: Math.round(g.hp), maxHp: Math.round(g.maxHp) })),
        units: B.units.map((u) => ({
          i: u.id, side: u.side, name: u.name, cls: u.cls,
          hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), mp: Math.round(u.mp || 0),
          x: u.x, y: u.y, acted: !!u.acted, alive: !!u.alive, boss: !!u.boss,
        })),
      };
      localStorage.setItem(SNAP_KEY, JSON.stringify(data));
    } catch (e) { /* 저장 공간 부족·시크릿 모드 */ }
  }
  /* 스냅샷을 지금 새로 열린 전장에 되살린다 */
  function applySnap(snap) {
    if (!B || !snap || !Array.isArray(snap.units)) return false;
    B.turn = Math.max(1, Math.round(Number(snap.turn) || 1));
    B.phase = 'ally';
    (snap.gates || []).forEach((sg, i) => {
      const g = (B.gates || [])[i];
      if (!g) return;
      g.maxHp = Math.max(1, Math.round(Number(sg.maxHp) || g.maxHp));
      g.hp = Math.max(0, Math.min(g.maxHp, Math.round(Number(sg.hp) || 0)));
    });
    B.gate = activeGate();
    const used = [];
    const take = (su) => {
      let hit = B.units.find((x) => used.indexOf(x) < 0 && x.side === su.side && x.name === su.name && x.cls === su.cls);
      if (!hit) hit = B.units.find((x) => used.indexOf(x) < 0 && x.side === su.side && x.id === su.i);
      if (!hit) hit = B.units.find((x) => used.indexOf(x) < 0 && x.side === su.side);
      return hit || null;
    };
    snap.units.forEach((su) => {
      const u = take(su);
      if (!u) return;
      used.push(u);
      u.maxHp = Math.max(1, Math.round(Number(su.maxHp) || u.maxHp));
      u.hp = Math.max(0, Math.min(u.maxHp, Math.round(Number(su.hp) || 0)));
      u.mp = Math.max(0, Math.round(Number(su.mp) || 0));
      u.x = u.rx = clamp(Math.round(Number(su.x) || 0), 0, COLS - 1);
      u.y = u.ry = clamp(Math.round(Number(su.y) || 0), 0, ROWS - 1);
      u.turnStartX = u.x; u.turnStartY = u.y;
      u.acted = !!su.acted; u.alive = su.alive !== false && u.hp > 0;
      if (su.boss) u.boss = true;
    });
    B.reachCache = null;
    B._home = null;
    B._safeRing = null;
    return true;
  }
  /* 저장된 스냅샷으로 전장을 다시 연다 (opt.skip 이면 자동 결산) */
  function resumeBattle(snap, opt) {
    const o = opt || {};
    if (!snap || !snap.opts) return false;
    const s = SK.state;
    if (!s) return false;
    try {
      SK.startBattle(Object.assign({}, snap.opts, { snap: snap, skip: !!o.skip, spectate: !!o.skip }));
      return true;
    } catch (e) {
      console.warn('[전투 복구] 실패', e);
      clearSnap();
      return false;
    }
  }
  SK.clearBattleSnap = clearSnap;
  SK.battleSnap = peekSnap;
  SK.resumeBattle = resumeBattle;

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
    /* v5.82 — 40종 특기는 수치를 vp에 그대로 적고 계산 자리마다 따로 넣으므로, 이 총합 보너스는 쓰지 않는다 */
    const pMul = (passive && passive.trigger === 'passive' && !passive.v582) ? 1 + (Number(passive.valuePct) || 0) / 200 : 1;
    /* v5.10 — 레벨 성장: 1레벨마다 공·방 +1.8%, 승급 구간은 +6% 추가 */
    const lvMul = 1 + LV_GROW * (Math.max(1, Number(h.lv) || 1) - 1);
    /* v5.11 — 관직 보정 (무관 공·방 / 문관 병력·내정) */
    const offB = SK.officeWarBonus ? SK.officeWarBonus(h) : { atk: 0, def: 0 };
    /* v5.33 — 전투 중 실시간 레벨업을 위해 공·방 계산을 '고정값 × 성장 배율'로 나눠 둔다.
       레벨이 오르면 grow 값만 다시 곱해 부대 능력치를 그 자리에서 올린다. */
    const atkFlat = C.atk + (h.wu + eq.war - 60) * 0.17;
    const defFlat = C.def + (h.tong + eq.leadership - 60) * 0.09;
    /* v5.75 — 보물 세트(같은 계열 3종 이상 보유)의 영구 전장 보정 — 내 부대에만 */
    const setB = (SK.treasureSetBonus ? SK.treasureSetBonus() : null) || { atk: 0, def: 0 };
    const atkMulBase = techAtk * pMul * loyMul * (1 + offB.atk) * (1 + (setB.atk || 0));
    const defMulBase = techDef * pMul * loyMul * (1 + offB.def) * (1 + (setB.def || 0));
    return {
      id: 'a' + i, side: 'ally', uid: h.uid, genId: h.genId, name: h.name, hanja: h.hanja, cls: h.cls, lv: h.lv,
      /* v5.86 — 운(매력)은 상태저항·치명에 쓰인다 */
      cha: Number(h.cha == null ? 60 : h.cha) || 60,
      hp: troops, maxHp: troops, mp: h.mp, maxMp: SK.maxMpOf(h.cls, h.lv),
      atk: atkFlat * (1 + 0.06 * SK.tierForLv(h.lv)) * lvMul * atkMulBase,
      def: defFlat * (1 + 0.06 * SK.tierForLv(h.lv)) * lvMul * defMulBase,
      grow: { atkFlat, defFlat, atkMulBase, defMulBase, lv0: h.lv, wu0: h.wu, tong0: h.tong },
      mov: Math.min(9, C.mov + eq.move), rng: C.rng + (C.rng > 1 ? (eq.rng || 0) : 0), minRng: C.minRng || 1,
      /* v5.83 — 관리자 병과 편집의 지력(ji) 보정을 부대 지력에 더한다 (0이면 예전과 같다) */
      wu: h.wu + eq.war, ji: h.ji + eq.intel + (C.ji || 0), tong: h.tong + eq.leadership,
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
      hp: spec.troops, maxHp: spec.troops, mp: maxMpBase(C.mp, spec.cls), maxMp: maxMpBase(C.mp, spec.cls),
      /* v5.3 — 일반 부대는 Lv.1 C급 장수보다 약하게 (장수 부대가 확실히 우위) */
      atk: C.atk - 1.5, def: C.def - 1.5, mov: C.mov, rng: C.rng, minRng: C.minRng || 1,
      wu: 52, ji: 50 + (C.ji || 0), tong: 52, cha: 55, portrait: CLASS_PORTRAIT[spec.cls], unit: CLASS_UNIT[spec.cls],
      /* v5.62 — 일반 부대도 자기 레벨 미만의 책략은 펼치지 못한다 */
      skills: SK.skillsFor(spec.cls, lv), x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: 1,
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
      hp: troops, maxHp: troops, mp: maxMpBase(C.mp + lv * 2, info.cls), maxMp: maxMpBase(C.mp + lv * 2, info.cls),
      atk: C.atk + lv * 1.15, def: C.def + lv * 0.8,
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: 82 + lv, ji: 60 + lv + (C.ji || 0), tong: 80, cha: 70, boss: true,
      portrait: info.pt, unit: CLASS_UNIT[info.cls], skills: SK.skillsFor(info.cls, lv),
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
      hp: troops, maxHp: troops, mp: maxMpBase(C.mp + lv * 2, cls), maxMp: maxMpBase(C.mp + lv * 2, cls),
      /* v5.17 — 적 명장도 아군과 같은 모양의 계산을 쓴다 (능력치 60 기준).
         예전에는 g.war를 그대로 더해 A급 적장이 아군보다 1.8배 강했다 — 반격까지 겹쳐
         아군이 4배 이상 손해를 보던 원인. */
      atk: (C.atk + (g.war - 60) * 0.14) * (1 + (SK.TIER_LV[g.tier] || 3) * 0.025) * lvMul,
      def: (C.def + (g.leadership - 60) * 0.08) * (1 + 0.04 * ((SK.TIER_LV[g.tier] || 3) - 1)) * lvMul,
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: g.war, ji: g.intel + (C.ji || 0), tong: g.leadership,
      cha: Number(g.charm == null ? 60 : g.charm) || 60,
      boss: boss && g.tier === 'S', portrait: SK.genPortrait(g), unit: SK.genUnit(g),
      skills: SK.skillsFor(cls, lv), skillName: g.skill, tier: g.tier,
      passive: (SK.PASSIVES && SK.PASSIVES[g.name]) || null, pUsed: {},
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
      hp: troops, maxHp: troops, mp: maxMpBase(C.mp + lv, cls), maxMp: maxMpBase(C.mp + lv, cls),
      /* v5.3 — 무명 일반 수비병도 아군 일반 부대와 같은 낮은 기준 (명장 부대가 확실히 강하다) */
      atk: C.atk - 1.5, def: C.def - 1.5,
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: 50, ji: 48 + (C.ji || 0), tong: 50, cha: 55,
      portrait: CLASS_PORTRAIT[cls], unit: CLASS_UNIT[cls], skills: SK.skillsFor(cls, lv),
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: -1,
      train: 45,
    };
  }

  function placeSide(list, slots, side, opts) {
    const zmap = (opts && opts.zones) || null;
    /* v5.96 — 마을·본진 좌표는 부대 자리로 쓰지 않는다 */
    const avoid = (opts && opts.blocked) || null;
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
          if (avoid && avoid.has(zx + ',' + zy)) continue;
          if (!B.tiles[zy] || !passable(B.tiles[zy][zx])) continue;
          if (B.units.some((o) => o.x === zx && o.y === zy)) continue;
          x = zx; y = zy; zused[place] = k + 1;
          break;
        }
      }
      if (x == null) [x, y] = slots[i % slots.length];
      if (x == null || !B.tiles[y] || !passable(B.tiles[y][x]) || B.units.some((o) => o.x === x && o.y === y)
        || (avoid && avoid.has(x + ',' + y))) {
        const alt = findFree(B.tiles, x == null ? 1 : x, y == null ? 1 : y, avoid);
        x = alt.x; y = alt.y;
      }
      taken.add(x + ',' + y);
      u.x = x; u.y = y; u.rx = x; u.ry = y; u.flash = 0; u.shake = 0; u.side = side;
      /* v5.39 — 턴 시작 좌표·이번 턴 이동 여부 (뒤로가기 이동 취소·재이동 방지) */
      u.turnStartX = x; u.turnStartY = y; u.movedThisTurn = false;
      B.units.push(u);
    });
  }

  /* v6.0 — 목책(N)도 통행 불가라 부대 자리로 쓰지 않는다 */
  function passable(ch) { return ch !== 'C' && ch !== 'H' && ch !== 'N'; }

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
  function findFree(tiles, cx, cy, avoid) {
    for (let r = 0; r < Math.max(COLS, ROWS); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
          if (!passable(tiles[y][x])) continue;
          if (B.units.some((o) => o.x === x && o.y === y)) continue;
          if (avoid && avoid.has(x + ',' + y)) continue;
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
    /* v5.84 — 앞 전장에서 남은 필살기 타격 연출을 새 전장에 끌고 오지 않는다 */
    try { if (window.V584_ULT_FX && window.V584_ULT_FX.stop) window.V584_ULT_FX.stop(); } catch (e) { /* ignore */ }
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
    const sw = WORLD_W * cam.s, sh = WORLD_H * cam.s;
    /* v5.90 — 좌우 72px·위 56px·아래 84px 여백을 허용한다. 지도가 화면보다 크면
       끝 칸(0,0 · COLS-1,0 · 0,ROWS-1 · COLS-1,ROWS-1)을 HUD 안쪽 가운데로 끌어올 수 있고,
       작으면 여백 안에서 가운데로 둔다. */
    const iw = Math.max(40, w - CAM_PAD_L - CAM_PAD_R);
    const ih = Math.max(40, h - CAM_PAD_T - CAM_PAD_B);
    if (sw <= iw) cam.x = CAM_PAD_L + (iw - sw) / 2;
    else cam.x = clamp(cam.x, (w - CAM_PAD_R) - sw, CAM_PAD_L);
    if (sh <= ih) cam.y = CAM_PAD_T + (ih - sh) / 2;
    else cam.y = clamp(cam.y, (h - CAM_PAD_B) - sh, CAM_PAD_T);
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
          const px = e.clientX - r.left, py = e.clientY - r.top;
          /* v5.98 — 병력 숫자·HP 바 라벨을 눌러도 그 부대를 선택한다 (스프라이트 힟박스 + 라벨 힟박스) */
          const lab = unitLabelAt(px, py);
          if (lab) onTappedUnit(lab);
          else {
            const t = screenToTile(px, py);
            onTileTap(t.x, t.y);
          }
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

  /* v5.90 — 여백(CAM_PAD_*)을 뺀 상자에 지도 전체가 들어가는 배율 */
  function viewFit() {
    if (!stage) return 1;
    const iw = Math.max(40, stage.clientWidth - CAM_PAD_L - CAM_PAD_R);
    const ih = Math.max(40, stage.clientHeight - CAM_PAD_T - CAM_PAD_B);
    return Math.min(iw / WORLD_W, ih / WORLD_H);
  }
  function zoomAt(ns, fx2, fy2) {
    stopInertia();
    const fit = viewFit();
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
  let frameNo = 0;   /* v5.60 — 검수용 렌더 프레임 수 (그리는 루프가 살아 있는지) */
  function loop(t) {
    frameNo += 1;
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
    cv.width = Math.round(WORLD_W * SIEGE_SCALE); cv.height = Math.round(WORLD_H * SIEGE_SCALE);
    const g = cv.getContext('2d');
    g.scale(SIEGE_SCALE, SIEGE_SCALE);
    const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? 'P' : tiles[y][x]);
    // 1) 바닥(잔디)을 전부 깔고 2) 지형별로 덧그린다
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) siegeGrass(g, x, y);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
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
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
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
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
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
    const cap = Math.max(COLS, ROWS) >= 28 ? 148 : 168;
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
    const sx = S / COLS, sy = S / ROWS;
    /* v5.86b — 커스텀 전장은 칠한 타일을 색으로 줄여 미니맵에 그대로 보여 준다 */
    const custom = !!B.customTilesRender;
    const img = custom ? null : loadImg(`assets/maps/v2/battle_${B.bgKey}.webp`);
    if (custom) {
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          sc.fillStyle = MM_CUSTOM[B.tiles[y][x]] || MM_CUSTOM.P;
          sc.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6);
        }
      }
    } else {
      if (img.complete && img.naturalWidth) sc.drawImage(img, 0, 0, S, S);
      else { sc.fillStyle = (SK.isSiegeType(B.type)) ? '#c9ab6c' : '#7d8a52'; sc.fillRect(0, 0, S, S); }
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const ch = B.tiles[y][x];
          if (ch === 'C' || ch === 'H') { sc.fillStyle = 'rgba(34,26,14,0.62)'; sc.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6); }
          else if (ch === 'W') { sc.fillStyle = 'rgba(40,96,150,0.55)'; sc.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6); }
        }
      }
    }
    if (custom || (img.complete && img.naturalWidth)) st.dataset.img = '1';
    mmStatic = st;
  }
  function drawMinimap() {
    const cv = mmEl();
    if (!cv || !B || !B.tiles || !mmOpen) return;
    const S = mmPx();
    if (!mmStatic || cv.width !== Math.round(S * Math.min(2.5, window.devicePixelRatio || 1))) buildMinimap();
    /* 배경 그림이 늦게 도착하면 한 번 다시 그린다 (커스텀 전장은 그림을 안 쓴다) */
    if (mmStatic && !mmStatic.dataset.img && !B.customTilesRender) {
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
    const sx = S / COLS, sy = S / ROWS;
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
        c.fillStyle = gate.hp > 0 ? (gate.side ? '#ffd08a' : '#ffe08a') : 'rgba(120,180,110,0.9)';
        c.fillRect(t.x * sx, t.y * sy, sx + 0.4, sy + 0.4);
      });
    });
    /* v6.0 — 군량고·무기고 (점령 진영 색) */
    (B.objs || []).forEach((o) => {
      c.fillStyle = o.owner ? (o.owner === 'ally' ? '#6fb6ff' : '#ff7a5c') : '#ffe08a';
      c.fillRect(o.x * sx, o.y * sy, Math.max(2, sx) + 0.4, Math.max(2, sy) + 0.4);
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
    const x0 = clamp(vx, 0, COLS) * sx, y0 = clamp(vy, 0, ROWS) * sy;
    const x1 = clamp(vx + vw, 0, COLS) * sx, y1 = clamp(vy + vh, 0, ROWS) * sy;
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
      const x = clamp((ev.clientX - r.left) / r.width, 0, 1) * COLS;
      const y = clamp((ev.clientY - r.top) / r.height, 0, 1) * ROWS;
      centerCam(Math.floor(x), Math.floor(y));
      SK.sfx.play('ui');
    };
    cv.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); jump(ev); });
    /* 두 번 톡톡 — 확대/축소 (한 번 탭은 그 자리로 이동) */
    cv.addEventListener('dblclick', (ev) => { ev.preventDefault(); ev.stopPropagation(); mmSetBig(!mmBig); });
  }

  /* ══════════════════════════════════════════════════════════════
     v5.98 — 사거리 내 유효 타겟 하이라이트 (.tile-attack-target)
     · 공격·필살기·책략 대상을 고르는 동안, 지금 때릴 수 있는 적·성문·망루 칸을
       전장 위에 반짐이는 붉은 테두리로 덮어 헛클릭을 막는다.
     · 캔버스 그림 위에 DOM 레이어를 깔고 칸마다 .tile-attack-target 클래스를 준다
       (가이드 스펙의 클래스 이름 그대로 — CSS 반짐 애니메이션은 css/game.css).
     ══════════════════════════════════════════════════════════════ */
  let targetLayer = null, targetSig = '';
  function ensureTargetLayer() {
    if (!stage) return null;
    if (!targetLayer || targetLayer.parentNode !== stage) {
      targetLayer = document.createElement('div');
      targetLayer.id = 'tile-attack-target-layer';
      targetLayer.className = 'tile-attack-layer';
      targetLayer.setAttribute('aria-hidden', 'true');
      stage.appendChild(targetLayer);
      targetSig = '';
    }
    return targetLayer;
  }
  /* 지금 고른 부대가 실제로 때릴 수 있는 칸 목록 */
  function attackTargetTiles() {
    const u = B && B.sel;
    if (!B || !u || !u.alive || u.side !== 'ally' || u.acted) return [];
    if (B.phase !== 'ally' || busy || B.over) return [];
    const out = [];
    const add = (x, y) => {
      if (x == null || y == null) return;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
      for (let i = 0; i < out.length; i++) if (out[i].x === x && out[i].y === y) return;
      out.push({ x: x, y: y });
    };
    if (mode === 'ultTarget') {
      const spec = ultOf(u);
      if (!spec) return [];
      const rng = ultRange(u, spec);
      B.units.forEach((o) => { if (o.alive && o.side !== u.side && manh(u.x, u.y, o.x, o.y) <= rng) add(o.x, o.y); });
      return out;
    }
    if (mode === 'skillTarget' && pendingSkill) {
      /* 회복·아군 버프는 아군이 대상이라 붉은 타겟을 찍지 않는다 */
      if (pendingSkill.kind === 'heal' || pendingSkill.kind === 'buffAlly' || pendingSkill.shape === 'allies') return [];
      const rng = skRange(u, pendingSkill);
      const min = pendingSkill.minRange || 1;
      B.units.forEach((o) => {
        if (!o.alive || o.side === u.side) return;
        if (canHit(u, o, rng) && manh(u.x, u.y, o.x, o.y) >= min) add(o.x, o.y);
      });
      return out;
    }
    if (mode !== 'attack') return out;
    const rng = effRng(u);
    /* ① 사거리 안의 적 부대 */
    B.units.forEach((o) => { if (o.alive && o.side !== u.side && canHit(u, o, rng)) add(o.x, o.y); });
    /* ② 성문 — 문을 부수는 진영만 */
    if (gateIntact() && isGateAttacker(u)) {
      const gates = (B.gates && B.gates.length) ? B.gates : (B.gate ? [B.gate] : []);
      gates.forEach((g) => {
        if (!g || g.hp <= 0) return;
        (g.tiles || []).forEach((t) => { if (manh(u.x, u.y, t.x, t.y) <= rng) add(t.x, t.y); });
      });
    }
    /* ③ 적 망루 (공성전 자동 포격 대포) */
    towerList().forEach((t) => { if (t.alive && t.side !== u.side && manh(u.x, u.y, t.x, t.y) <= rng) add(t.x, t.y); });
    return out;
  }
  function clearAttackTargets() {
    targetSig = '';
    if (targetLayer && targetLayer.parentNode) targetLayer.innerHTML = '';
  }
  function syncAttackTargets() {
    if (!B || !stage) return;
    const layer = ensureTargetLayer();
    if (!layer) return;
    const list = attackTargetTiles();
    const sig = list.map((t) => t.x + ',' + t.y).join('|') + '@' +
      Math.round(cam.x) + ',' + Math.round(cam.y) + ',' + cam.s.toFixed(3);
    if (sig === targetSig) return;
    targetSig = sig;
    layer.innerHTML = '';
    if (!list.length) return;
    const size = TILE * cam.s;
    const bw = Math.max(2, Math.round(size * 0.085));
    list.forEach((t) => {
      const d = document.createElement('div');
      d.className = 'tile-attack-target';
      d.style.left = (cam.x + t.x * size) + 'px';
      d.style.top = (cam.y + t.y * size) + 'px';
      d.style.width = Math.max(6, size) + 'px';
      d.style.height = Math.max(6, size) + 'px';
      d.style.borderWidth = bw + 'px';
      d.style.borderRadius = Math.max(3, Math.round(size * 0.09)) + 'px';
      layer.appendChild(d);
    });
  }
  SK.battleAttackTargets = attackTargetTiles;

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

    // v5.86b — 커스텀(에디터) 전장은 통이미지를 깔지 않고 B.tiles 를 한 칸씩 직접 그린다
    if (B.customTilesRender) {
      drawCustomTerrain();
    } else {
      // v5.17 — 모든 전장이 칸 수에 맞는 그림을 쓴다 (공성·수성은 겹성벽 그림)
      const bg = loadImg(`assets/maps/v2/battle_${B.bgKey}.webp`);
      if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, WORLD_W, WORLD_H);
      else { ctx.fillStyle = (SK.isSiegeType(B.type)) ? '#c9ab6c' : '#7d8a52'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }
      /* v6.1 — 통이미지 위에 지형 질감·물가 오토타일링·입체 그림자·전략 지형을
         한 장으로 구워 얹는다 (매 프레임 다시 그리지 않는다) */
      drawDetailLayer();
    }

    drawTerrainTint();
    /* v6.1 — 전략 지형은 drawDetailLayer 안에서 함께 구워졌다 (drawStrategyTiles 는 호환용) */
    drawObjMarkers();         // v6.0 — 군량고·무기고 표식(점령 진영 색)
    drawWaterWaves();
    drawBattleProps();
    drawBrokenGates();
    drawKeyProps();
    drawSites();
    drawGrid();
    drawObjective();
    drawHighlights();
    drawBackFloats();
    drawTowers();
    drawFires();              // v6.0 — 연소하는 갈대밭 불꽃
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
    /* v5.98 — 사거리 안 유효 타겟 붉은 테두리 (.tile-attack-target) */
    syncAttackTargets();
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

  /* v5.91a — 세로를 기준으로 그림 비율을 지켜 그린다.
     정제한 망루 스프라이트는 정사각이 아니라서 drawProp으로 그리면 가로로 늘어난다. */
  function drawPropTall(img, x, y, scale, alpha) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const h = TILE * (scale || 1);
    const w = h * (img.naturalWidth / img.naturalHeight);
    const cx = (x + 0.5) * TILE, by = (y + 0.9) * TILE;
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
    const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? 'P' : B.tiles[y][x]);
    const wallAt = (x, y) => { const c = at(x, y); return c === 'C' || c === 'G'; };
    /* 성벽·성문 */
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
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
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
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
    if (!SK.isSiegeType(B.type) && B.type !== 'fortress') return;
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

  /* ══════════ v5.86b — 커스텀(에디터) 전장: 칸마다 타일을 직접 그린다 ══════════
     정식 12종 전장은 통이미지(assets/maps/v2/battle_*.webp)를 그대로 쓰고,
     관리자 전장맵 에디터에서 칠한 맵(B.customTilesRender)만 통이미지를 깔지 않고
     B.tiles 의 16종 지형(P R F M W S B G C D H T K A E V)을 한 칸씩 도트 타일로 그린다.
     · 이웃을 보고 도로가 이어지고, 물가에 모래 둑이 지고, 다리가 강을 건너고,
       성벽·관아가 줄로 붙는다 (칸 테두리가 드러나지 않게).
     · 한 번 그려 B._terrain 에 담아 두고, 매 프레임에는 그 그림 한 장만 얹는다.
     · 잔물결은 지금처럼 drawWaterWaves 가 움직인다 (커스텀 전장에서도 켠다). */
  const CT = {
    grass: '#7d8e4f', grass2: '#8d9d5b', grass3: '#6d7c44', grass4: '#95a566', grass5: '#62713d',
    grassLit: '#a8b878', bloom: '#efe9b4',
    dirt: '#c6a670', dirt2: '#b6945c', dirt3: '#dcbf8a', dirt4: '#9d7f4b', pebble: '#bdb096',
    water: '#2f6a90', water2: '#38789d', water3: '#66a9c4', water4: '#1d4a67', foam: '#e4f6fd',
    sand: '#c9b78c', sand2: '#ac996f', sand3: '#dccfae',
    wood: '#9c6f43', wood2: '#75502f', wood3: '#c29468',
    stone: '#8f8f86', stone1: '#aaa99e', stone3: '#66655c', mortar: '#57564f',
    roof: '#46506a', roof2: '#5f6c8a',
    rock: '#8a7c69', rock2: '#6c6053', rock3: '#ab9d88',
    leaf: '#356b34', leaf2: '#45803f', leaf3: '#61a851', trunk: '#5a4126',
    yard: '#c9b489', yard2: '#b39c72', yard3: '#d8c7a0',
  };
  /* 미니맵 축소판 색 (같은 지형이 같은 색으로 읽히게) */
  const MM_CUSTOM = {
    P: '#7b8c4e', R: '#c6a670', F: '#356b34', M: '#8a7c69', W: '#2f6a90', S: '#4f8fa4',
    B: '#9c6f43', G: '#c2a05e', C: '#8f8f86', D: '#c9b489', H: '#46506a', T: '#a49c8c',
    K: '#a49c8c', A: '#cbb98f', E: '#cbb98f', V: '#bda97e',
    U: '#8fa860', J: '#9aa25a', Q: '#d8b46a', Y: '#9aa0a8', N: '#8a6238', L: '#a97c4b', O: '#b08a58',
  };

  /* 칸 좌표로 정해지는 잡음 — 칠할 때마다 같은 자리에 같은 결이 남는다 */
  function ctHash(x, y, s) {
    let h = Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul((s || 0) + 1, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function ctAt(x, y) {
    const row = (B && B.tiles) ? B.tiles[y] : null;
    if (!row || x < 0 || x >= row.length) return 'P';
    return row[x] || 'P';
  }
  function ctWater(ch) { return ch === 'W' || ch === 'S' || ch === 'B'; }
  /* v6.1 — 강둑 판단용: 다리·부교·포구 위에도 모래둑을 두지 않는다 */
  function ctWet(ch) { return ch === 'W' || ch === 'S' || ch === 'B' || ch === 'L' || ch === 'O'; }
  function ctRoadish(ch) { return ch === 'R' || ch === 'D' || ch === 'G' || ch === 'B' || ch === 'V' || ch === 'A' || ch === 'E'; }
  function ctWallish(ch) { return ch === 'C' || ch === 'H' || ch === 'G'; }

  /* ══════════ v6.1 — 공용 지형 붓 (질감·오토타일·입체 그림자) ══════════
     커스텀 전장 바탕(buildCustomTerrain)과 통이미지 전장 덧칠(buildDetailLayer)이
     같은 붓을 쓴다 — 그래야 16종 전장이 같은 화풍으로 읽힌다. */
  function ctShadow(c, X, Y, h, a) {
    if (h <= 0) return;
    const g = c.createLinearGradient(0, Y + TILE - 1, 0, Y + TILE + h);
    g.addColorStop(0, `rgba(16,26,16,${a})`);
    g.addColorStop(0.55, `rgba(16,26,16,${(a * 0.42).toFixed(3)})`);
    g.addColorStop(1, 'rgba(16,26,16,0)');
    c.fillStyle = g;
    c.fillRect(X + 1, Y + TILE - 1, TILE - 2, h);
  }
  /* 자갈·바위 한 알 — 아래쪽에 접지 그림자를 깔아 반쯤 박힌 느낌 */
  function ctRock(c, px, py, r, col, shade) {
    c.fillStyle = 'rgba(30,26,16,0.22)';
    c.beginPath(); c.ellipse(px + r * 0.25, py + r * 0.55, r * 1.05, r * 0.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = col || CT.rock3;
    c.beginPath(); c.ellipse(px, py, r, r * 0.72, 0.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = shade || CT.rock2;
    c.beginPath(); c.ellipse(px + r * 0.2, py + r * 0.2, r * 0.6, r * 0.4, 0.2, 0, Math.PI * 2); c.fill();
  }
  /* 풀잎 한 포기 */
  function ctTuft(c, px, py, h, col) {
    c.strokeStyle = col || 'rgba(96,118,58,0.6)';
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(px, py); c.quadraticCurveTo(px - 1.6, py - h * 0.5, px - 3, py - h);
    c.moveTo(px + 1.2, py); c.quadraticCurveTo(px + 1.4, py - h * 0.55, px + 2.4, py - h * 0.86);
    c.moveTo(px + 2.4, py); c.quadraticCurveTo(px + 3.4, py - h * 0.4, px + 4.6, py - h * 0.7);
    c.stroke();
  }

  /* ── 평지: 칸마다 다른 초록 + 부드러운 얼룩 + 잔풀결 (단색 사각형 느낌 제거) ── */
  function ctGrassBase(c, X, Y, x, y, tone) {
    /* 바탕색은 buildCustomTerrain 이 한 번에 깔아 둔다 — 칸마다 단색을 채우면
       격자무늬(체커보드)처럼 보이기 때문. 여기서는 경계가 없는 부드러운 얼룩만 얹는다. */
    if (tone) { c.fillStyle = tone; c.fillRect(X, Y, TILE, TILE); }
    c.save();
    for (let i = 0; i < 3; i++) {
      const hx = ctHash(x, y, 10 + i * 4), hy = ctHash(x, y, 11 + i * 4), hr = ctHash(x, y, 12 + i * 4);
      const px = X + 12 + hx * (TILE - 24), py = Y + 12 + hy * (TILE - 24);
      const r = 13 + hr * 14;
      const g = c.createRadialGradient(px, py, 1, px, py, r);
      const lit = i !== 1;
      const a = 0.16 + hr * 0.10;
      g.addColorStop(0, lit ? `rgba(172,188,122,${a.toFixed(3)})` : `rgba(78,96,48,${a.toFixed(3)})`);
      g.addColorStop(1, lit ? 'rgba(172,188,122,0)' : 'rgba(78,96,48,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(px, py, r, r * 0.74, hr * 3, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    /* 잔풀결 — 아주 작은 점 */
    for (let i = 0; i < 8; i++) {
      const hx = ctHash(x, y, 40 + i), hy = ctHash(x, y, 60 + i);
      c.fillStyle = i % 2 ? 'rgba(214,224,164,0.16)' : 'rgba(58,74,40,0.18)';
      c.fillRect(X + 4 + hx * (TILE - 8), Y + 4 + hy * (TILE - 8), 1.5, 1.5);
    }
    ctTuft(c, X + 9 + ctHash(x, y, 70) * (TILE - 18), Y + 26 + ctHash(x, y, 71) * (TILE - 36), 7 + ctHash(x, y, 72) * 3);
    ctTuft(c, X + 9 + ctHash(x, y, 73) * (TILE - 18), Y + 30 + ctHash(x, y, 74) * (TILE - 38), 5 + ctHash(x, y, 75) * 3);
    /* 드문 들꽃·자갈 — 넓은 평지가 밋밋하지 않게 */
    const hb = ctHash(x, y, 91);
    if (hb > 0.87) {
      const px = X + 12 + ctHash(x, y, 92) * (TILE - 24), py = Y + 14 + ctHash(x, y, 93) * (TILE - 26);
      c.fillStyle = 'rgba(244,240,196,0.8)';
      for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(px + Math.cos(k * 2.1) * 2.2, py + Math.sin(k * 2.1) * 2.2, 1.2, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = 'rgba(232,190,80,0.9)';
      c.beginPath(); c.arc(px, py, 1, 0, Math.PI * 2); c.fill();
    } else if (hb > 0.8) {
      const px = X + 10 + ctHash(x, y, 94) * (TILE - 20), py = Y + 14 + ctHash(x, y, 95) * (TILE - 22);
      c.fillStyle = 'rgba(166,158,136,0.55)';
      c.beginPath(); c.ellipse(px, py, 2.2, 1.5, 0.4, 0, Math.PI * 2); c.fill();
    }
  }
  function ctGrass(c, X, Y, x, y) { ctGrassBase(c, X, Y, x, y); }

  /* 도로 — 이어진 이웃 쪽으로만 흙이 뻗는다 (모서리·갈림길이 자연스럽게).
     돌길 결 + 가운데 마모된 길 + 길이 아닌 쪽에 부서진 가장자리. */
  function ctRoad(c, X, Y, x, y) {
    const up = ctRoadish(ctAt(x, y - 1)), dn = ctRoadish(ctAt(x, y + 1));
    const lf = ctRoadish(ctAt(x - 1, y)), rt = ctRoadish(ctAt(x + 1, y));
    const w = 42, cx = X + TILE / 2, cy = Y + TILE / 2;
    const hw0 = w / 2;
    const shape = () => {
      c.beginPath();
      c.rect(cx - hw0, cy - hw0, w, w);
      if (up) c.rect(cx - hw0, Y - 1, w, TILE / 2 + 2);
      if (dn) c.rect(cx - hw0, cy, w, TILE / 2 + 1);
      if (lf) c.rect(X - 1, cy - hw0, TILE / 2 + 2, w);
      if (rt) c.rect(cx, cy - hw0, TILE / 2 + 1, w);
      /* 모서리 — 양옆이 길이면 남는 네 귀퉁이도 채운다 (길 가장자리에 풀 네모가
         바둑판처럼 남지 않게) */
      if (up && rt) c.rect(cx + hw0, Y - 1, TILE / 2 - hw0 + 2, TILE / 2 - hw0 + 2);
      if (up && lf) c.rect(X - 1, Y - 1, TILE / 2 - hw0 + 2, TILE / 2 - hw0 + 2);
      if (dn && rt) c.rect(cx + hw0, cy + hw0, TILE / 2 - hw0 + 2, TILE / 2 - hw0 + 2);
      if (dn && lf) c.rect(X - 1, cy + hw0, TILE / 2 - hw0 + 2, TILE / 2 - hw0 + 2);
    };
    shape();
    c.fillStyle = CT.dirt;
    c.fill();
    c.save();
    shape();
    c.clip();
    /* 밟혀 닳은 흙 색 */
    c.fillStyle = CT.dirt2;
    c.globalAlpha = 0.34;
    for (let i = 0; i < 5; i++) {
      const hx = ctHash(x, y, 40 + i), hy = ctHash(x, y, 41 + i);
      c.beginPath(); c.arc(X + hx * TILE, Y + hy * TILE, 3 + hx * 4.2, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    /* 돌길 — 납작한 조약돌을 흩어 깐다 (칸마다 결이 달라 반복감이 없다) */
    for (let i = 0; i < 13; i++) {
      const hx = ctHash(x, y, 200 + i), hy = ctHash(x, y, 230 + i), hr = ctHash(x, y, 260 + i);
      const px = X + hx * TILE, py = Y + hy * TILE;
      const r = 2.2 + hr * 3.4;
      c.fillStyle = i % 3 === 0 ? 'rgba(210,190,152,0.40)' : (i % 3 === 1 ? 'rgba(150,132,100,0.42)' : 'rgba(178,166,140,0.38)');
      c.beginPath(); c.ellipse(px, py, r, r * 0.68, hx * 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(96,76,44,0.22)';
      c.beginPath(); c.ellipse(px + 0.6, py + r * 0.4, r * 0.9, r * 0.34, hx * 3, 0, Math.PI * 2); c.fill();
    }
    /* 가운데 바퀴·발길 자국 — 길이 이어진 방향으로만 */
    c.fillStyle = 'rgba(222,200,158,0.20)';
    if (up || dn) {
      c.fillRect(cx - 8, Y, 2.4, TILE);
      c.fillRect(cx + 5, Y, 2.4, TILE);
      c.fillStyle = 'rgba(140,116,74,0.18)';
      c.fillRect(cx - 2, Y, 4, TILE);
    }
    if (lf || rt) {
      c.fillStyle = 'rgba(222,200,158,0.20)';
      c.fillRect(X, cy - 7, TILE, 3);
      c.fillRect(X, cy + 4, TILE, 3);
      c.fillStyle = 'rgba(140,116,74,0.25)';
      c.fillRect(X, cy - 2, TILE, 4);
    }
    c.restore();
    /* 마모된 가장자리 — 길이 아닌 이웃 쪽에만, 곧은 줄 대신 부서진 흙부스러기 */
    const hw = w / 2;
    const edge = (x0, y0, x1, y1, horiz) => {
      c.strokeStyle = 'rgba(120,98,58,0.34)';
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      for (let i = 0; i < 4; i++) {
        const h1 = ctHash(x, y, 300 + i + (horiz ? 0 : 9)), h2 = ctHash(x, y, 320 + i + (horiz ? 0 : 9));
        const px = horiz ? x0 + (x1 - x0) * (0.1 + h1 * 0.8) : x0 + (h1 - 0.5) * 5;
        const py = horiz ? y0 + (h1 - 0.5) * 5 : y0 + (y1 - y0) * (0.1 + h2 * 0.8);
        c.fillStyle = i % 2 ? 'rgba(196,176,140,0.5)' : 'rgba(128,106,66,0.4)';
        c.beginPath(); c.ellipse(px, py, 1.4 + h2 * 1.6, 1.1 + h2, 0, 0, Math.PI * 2); c.fill();
      }
    };
    if (!up) edge(cx - hw, cy - hw, cx + hw, cy - hw, true);
    if (!dn) edge(cx - hw, cy + hw, cx + hw, cy + hw, true);
    if (!lf) edge(cx - hw, cy - hw, cx - hw, cy + hw, false);
    if (!rt) edge(cx + hw, cy - hw, cx + hw, cy + hw, false);
    /* 길가 풀포기 — 흙과 풀이 섞이는 자리 */
    if (!up || !lf) ctTuft(c, X + 6 + ctHash(x, y, 340) * 8, Y + TILE * 0.5 + 8, 6);
    if (!dn || !rt) ctTuft(c, X + TILE - 12 - ctHash(x, y, 341) * 8, Y + TILE * 0.5 - 4, 6);
  }

  /* 강물 — 물빛 농도·잔물결·윤슬 + 물가의 모래·자갈·물거품 (강둑 오토타일링) */
  function ctWaterTile(c, X, Y, x, y) {
    c.fillStyle = CT.water;
    c.fillRect(X, Y, TILE, TILE);
    /* 깊이 얼룩 — 칸마다 세로 그라디언트를 넣으면 가로 줄무늬처럼 보여서,
       경계가 없는 둥근 얼룩으로만 물빛을 바꾼다 */
    c.save();
    for (let i = 0; i < 3; i++) {
      const hx = ctHash(x, y, 72 + i * 3), hy = ctHash(x, y, 73 + i * 3), hr = ctHash(x, y, 74 + i * 3);
      const px = X + 10 + hx * (TILE - 20), py = Y + 10 + hy * (TILE - 20);
      const r = 14 + hr * 14;
      const g = c.createRadialGradient(px, py, 1, px, py, r);
      const deep = i === 0;
      g.addColorStop(0, deep ? 'rgba(24,72,102,0.16)' : 'rgba(112,186,214,0.10)');
      g.addColorStop(1, deep ? 'rgba(24,72,102,0)' : 'rgba(112,186,214,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(px, py, r, r * 0.8, hr * 3, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    /* 잔물결 (움직이는 물결은 drawWaterWaves 가 덧그린다) */
    c.save();
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const hy = ctHash(x, y, 80 + i), hx2 = ctHash(x, y, 83 + i);
      const yy = Y + 6 + hy * (TILE - 12) + i * 5;
      c.strokeStyle = `rgba(164,214,234,${(0.16 + hy * 0.12).toFixed(3)})`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(X + 6 + hx2 * 8, yy);
      c.quadraticCurveTo(X + TILE * 0.5, yy - 3.4, X + TILE - 6 - hx2 * 8, yy);
      c.stroke();
    }
    /* 윤슬 — 짧고 밝은 반짝임 */
    for (let i = 0; i < 3; i++) {
      const hx = ctHash(x, y, 86 + i), hy = ctHash(x, y, 88 + i);
      const px = X + 10 + hx * (TILE - 26), py = Y + 12 + hy * (TILE - 24);
      c.strokeStyle = 'rgba(226,248,255,0.42)';
      c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + 5 + hy * 4, py - 1.2); c.stroke();
    }
    c.restore();
    const bank = (side) => {
      const T = TILE, a = 7;
      const horiz = side === 'up' || side === 'dn';
      /* 물가 그늘 — 육지와 맞닿은 물쪽에 어두운 띠 */
      c.fillStyle = 'rgba(12,34,48,0.30)';
      if (side === 'up') c.fillRect(X, Y, T, 3);
      else if (side === 'dn') c.fillRect(X, Y + T - 3, T, 3);
      else if (side === 'lf') c.fillRect(X, Y, 3, T);
      else c.fillRect(X + T - 3, Y, 3, T);
      /* 젖은 모래 → 마른 모래 */
      c.fillStyle = CT.sand2;
      if (side === 'up') c.fillRect(X, Y + 2, T, a);
      else if (side === 'dn') c.fillRect(X, Y + T - a - 2, T, a);
      else if (side === 'lf') c.fillRect(X + 2, Y, a, T);
      else c.fillRect(X + T - a - 2, Y, a, T);
      c.fillStyle = CT.sand;
      if (side === 'up') c.fillRect(X, Y + 2, T, 4);
      else if (side === 'dn') c.fillRect(X, Y + T - 6, T, 4);
      else if (side === 'lf') c.fillRect(X + 2, Y, 4, T);
      else c.fillRect(X + T - 6, Y, 4, T);
      /* 물거품 — 물쪽 경계에 잔물결 모양 */
      c.strokeStyle = 'rgba(232,248,255,0.5)';
      c.lineWidth = 1.5;
      c.beginPath();
      const amp = 2.2;
      if (horiz) {
        const yy = side === 'up' ? Y + a + 2 : Y + T - a - 2;
        for (let i = 0; i <= 4; i++) {
          const px = X + 4 + i * (T - 8) / 4;
          const py = yy + (i % 2 ? amp : -amp) * ctHash(x, y, 350 + i);
          if (i === 0) c.moveTo(px, py); else c.quadraticCurveTo(px - (T - 8) / 8, py + (i % 2 ? -3 : 3), px, py);
        }
      } else {
        const xx = side === 'lf' ? X + a + 2 : X + T - a - 2;
        for (let i = 0; i <= 4; i++) {
          const py = Y + 4 + i * (T - 8) / 4;
          const px = xx + (i % 2 ? amp : -amp) * ctHash(x, y, 360 + i);
          if (i === 0) c.moveTo(px, py); else c.quadraticCurveTo(px + (i % 2 ? -3 : 3), py - (T - 8) / 8, px, py);
        }
      }
      c.stroke();
      /* 강둑 자갈 */
      for (let i = 0; i < 2; i++) {
        const h1 = ctHash(x, y, 370 + i + (side.charCodeAt(0) % 7) * 3), h2 = ctHash(x, y, 380 + i + (side.charCodeAt(1) % 7) * 3);
        const px = horiz ? X + 10 + h1 * (T - 20) : (side === 'lf' ? X + 4 + h1 * 5 : X + T - 6 - h1 * 5);
        const py = horiz ? (side === 'up' ? Y + 3 + h2 * 4 : Y + T - 5 - h2 * 4) : Y + 10 + h2 * (T - 20);
        ctRock(c, px, py, 1.8 + h1 * 1.8);
      }
    };
    if (!ctWet(ctAt(x, y - 1))) bank('up');
    if (!ctWet(ctAt(x, y + 1))) bank('dn');
    if (!ctWet(ctAt(x - 1, y))) bank('lf');
    if (!ctWet(ctAt(x + 1, y))) bank('rt');
  }

  /* 여울 — 얕은 물 + 모래톱 + 잔 자갈 + 흐르는 물금 */
  function ctShallow(c, X, Y, x, y) {
    c.fillStyle = '#4c8ca6';
    c.fillRect(X, Y, TILE, TILE);
    c.save();
    for (let i = 0; i < 2; i++) {
      const hx = ctHash(x, y, 380 + i * 3), hy = ctHash(x, y, 381 + i * 3), hr = ctHash(x, y, 382 + i * 3);
      const px = X + 12 + hx * (TILE - 24), py = Y + 12 + hy * (TILE - 24);
      const r = 11 + hr * 9;
      const g = c.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, 'rgba(150,206,222,0.22)');
      g.addColorStop(1, 'rgba(150,206,222,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(px, py, r, r * 0.78, hr * 3, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    /* 모래톱 — 작은 모래 패치 두어 개 (칸을 가로지르는 큰 타원 하나로 보이지 않게) */
    const hx0 = ctHash(x, y, 390), hy0 = ctHash(x, y, 391);
    for (let i = 0; i < 2; i++) {
      const px = X + TILE * (0.28 + i * 0.34 + (hx0 - 0.5) * 0.12);
      const py = Y + TILE * (0.58 + (i ? 0.16 : -0.04) + (hy0 - 0.5) * 0.12);
      c.fillStyle = 'rgba(196,182,142,0.40)';
      c.beginPath(); c.ellipse(px, py, TILE * 0.17, TILE * 0.09, hx0 * 0.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(220,206,168,0.35)';
      c.beginPath(); c.ellipse(px - 2, py - 2, TILE * 0.10, TILE * 0.05, hx0 * 0.6, 0, Math.PI * 2); c.fill();
    }
    /* 여울 돌 — 물 위로 등만 내민 자갈 */
    for (let i = 0; i < 6; i++) {
      const hx = ctHash(x, y, 100 + i), hy = ctHash(x, y, 110 + i);
      const px = X + 8 + hx * (TILE - 16), py = Y + 12 + hy * (TILE - 22);
      ctRock(c, px, py, 2 + hx * 2, i % 2 ? 'rgba(200,196,172,1)' : 'rgba(168,176,160,1)', i % 2 ? 'rgba(150,146,124,1)' : 'rgba(126,136,124,1)');
    }
    /* 흐르는 물금 */
    c.strokeStyle = 'rgba(232,246,252,0.34)';
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const hy = ctHash(x, y, 120 + i);
      const yy = Y + 8 + hy * (TILE - 16);
      const x0 = X + 6 + ctHash(x, y, 124 + i) * 10;
      c.beginPath(); c.moveTo(x0, yy); c.quadraticCurveTo(x0 + 9, yy - 2.6, x0 + 19, yy); c.stroke();
    }
    /* 깊은 물 쪽 경계에 물거품 */
    const foam = (side) => {
      c.strokeStyle = 'rgba(228,246,252,0.34)';
      c.lineWidth = 1.3;
      c.beginPath();
      if (side === 'up') { c.moveTo(X + 6, Y + 2); c.quadraticCurveTo(X + TILE * 0.5, Y + 5, X + TILE - 6, Y + 2); }
      else if (side === 'dn') { c.moveTo(X + 6, Y + TILE - 2); c.quadraticCurveTo(X + TILE * 0.5, Y + TILE - 5, X + TILE - 6, Y + TILE - 2); }
      else if (side === 'lf') { c.moveTo(X + 2, Y + 6); c.quadraticCurveTo(X + 5, Y + TILE * 0.5, X + 2, Y + TILE - 6); }
      else { c.moveTo(X + TILE - 2, Y + 6); c.quadraticCurveTo(X + TILE - 5, Y + TILE * 0.5, X + TILE - 2, Y + TILE - 6); }
      c.stroke();
    };
    if (ctAt(x, y - 1) === 'W') foam('up');
    if (ctAt(x, y + 1) === 'W') foam('dn');
    if (ctAt(x - 1, y) === 'W') foam('lf');
    if (ctAt(x + 1, y) === 'W') foam('rt');
  }

  /* 다리 — 강이 좌우로 흐르면 위아래로, 위아래로 흐르면 좌우로 건넌다.
     (건너는 방향은 강물 바로 옆에만 맞춘다 — 다리 칸끼리는 세지 않는다) */
  function ctBridge(c, X, Y, x, y) {
    const isW = (ch) => ch === 'W' || ch === 'S';
    const wLR = isW(ctAt(x - 1, y)) || isW(ctAt(x + 1, y));
    const wUD = isW(ctAt(x, y - 1)) || isW(ctAt(x, y + 1));
    if (wLR || wUD) { c.fillStyle = CT.water; c.fillRect(X, Y, TILE, TILE); }
    const horiz = wUD && !wLR ? true : (wLR && !wUD ? false : true);
    const rail = CT.wood2, deck = CT.wood, edge = CT.wood3;
    c.save();
    if (horiz) {
      const dy = Y + 9, dh = TILE - 18;
      c.fillStyle = 'rgba(10,26,36,0.38)';
      c.fillRect(X - 1, dy + dh - 1, TILE + 2, 4);
      c.fillStyle = deck;
      c.fillRect(X, dy, TILE, dh);
      /* 널빤지 결 */
      c.strokeStyle = 'rgba(90,62,32,0.5)';
      c.lineWidth = 1.2;
      for (let i = 1; i < 5; i++) {
        const px = X + (i * TILE) / 5;
        c.beginPath(); c.moveTo(px, dy + 4); c.lineTo(px, dy + dh - 4); c.stroke();
      }
      c.fillStyle = 'rgba(214,164,108,0.28)';
      for (let i = 0; i < 4; i++) c.fillRect(X + 2, dy + 5 + i * (dh - 10) / 4, TILE - 4, 1.6);
      c.fillStyle = rail;
      c.fillRect(X, dy, TILE, 4);
      c.fillRect(X, dy + dh - 4, TILE, 4);
      c.fillStyle = edge;
      c.fillRect(X, dy + 4, TILE, 2);
      c.fillRect(X, dy + dh - 6, TILE, 2);
    } else {
      const dx = X + 9, dw = TILE - 18;
      c.fillStyle = 'rgba(10,26,36,0.38)';
      c.fillRect(dx + dw - 1, Y - 1, 4, TILE + 2);
      c.fillStyle = deck;
      c.fillRect(dx, Y, dw, TILE);
      c.strokeStyle = 'rgba(90,62,32,0.5)';
      c.lineWidth = 1.2;
      for (let i = 1; i < 5; i++) {
        const py = Y + (i * TILE) / 5;
        c.beginPath(); c.moveTo(dx + 4, py); c.lineTo(dx + dw - 4, py); c.stroke();
      }
      c.fillStyle = 'rgba(214,164,108,0.28)';
      for (let i = 0; i < 4; i++) c.fillRect(dx + 5 + i * (dw - 10) / 4, Y + 2, 1.6, TILE - 4);
      c.fillStyle = rail;
      c.fillRect(dx, Y, 4, TILE);
      c.fillRect(dx + dw - 4, Y, 4, TILE);
      c.fillStyle = edge;
      c.fillRect(dx + 4, Y, 2, TILE);
      c.fillRect(dx + dw - 6, Y, 2, TILE);
    }
    c.restore();
  }

  /* 나뭇잎 덩어리 — 여러 개의 둥근 잎 뭉치를 삐죽하게 겹쳐 나무 수관을 만든다.
     (한 개의 큰 원으로 그리면 '초록 공'처럼 보여서, 들쭉날쭉한 윤곽 + 윗면 하이라이트로 입체를 준다) */
  function ctCanopy(c, px, py, r, tx, ty, seed) {
    const t = (seed || 0) * 11;
    const ring = (n, rr, sq, col) => {
      c.fillStyle = col;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ctHash(tx, ty, 900 + t + i) * 0.5;
        const rad = rr * (0.60 + ctHash(tx, ty, 930 + t + i) * 0.46);
        const ex = Math.cos(a) * rr * 0.62 * sq, ey = Math.sin(a) * rr * 0.52;
        c.beginPath(); c.arc(px + ex, py + ey, rad, 0, Math.PI * 2); c.fill();
      }
    };
    /* 드롭 섀도우 */
    c.fillStyle = 'rgba(18,34,16,0.34)';
    c.beginPath(); c.ellipse(px + r * 0.30, py + r * 1.02, r * 0.92, r * 0.36, 0, 0, Math.PI * 2); c.fill();
    /* 줄기 */
    c.fillStyle = '#4a3722';
    c.fillRect(px - r * 0.10, py + r * 0.35, r * 0.20, r * 0.9);
    c.fillStyle = '#6b5233';
    c.fillRect(px - r * 0.10, py + r * 0.35, r * 0.07, r * 0.85);
    /* 수관 — 어두운 밑 → 중간 → 밝은 윗면 */
    ring(10, r * 0.74, 1.0, '#224d23');
    c.beginPath(); c.arc(px + r * 0.08, py + r * 0.10, r * 0.60, 0, Math.PI * 2); c.fillStyle = '#2a5a28'; c.fill();
    const n2 = 7;
    c.fillStyle = '#2e6429';
    for (let i = 0; i < n2; i++) {
      const a = (i / n2) * Math.PI * 2 + ctHash(tx, ty, 960 + t + i) * 0.6;
      const rad = r * 0.36 * (0.78 + ctHash(tx, ty, 980 + t + i) * 0.4);
      c.beginPath();
      c.arc(px + Math.cos(a) * r * 0.36 - r * 0.10, py + Math.sin(a) * r * 0.30 - r * 0.18, rad, 0, Math.PI * 2);
      c.fill();
    }
    const n3 = 4;
    c.fillStyle = '#41903a';
    for (let i = 0; i < n3; i++) {
      const a = -2.4 + i * 0.7 + ctHash(tx, ty, 990 + t + i) * 0.4;
      const rad = r * 0.24 * (0.8 + ctHash(tx, ty, 995 + t + i) * 0.4);
      c.beginPath();
      c.arc(px + Math.cos(a) * r * 0.42 - r * 0.1, py + Math.sin(a) * r * 0.38 - r * 0.2, rad, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(148,206,104,0.75)';
    for (let i = 0; i < 3; i++) {
      const a = -2.3 + i * 0.55;
      c.beginPath();
      c.arc(px + Math.cos(a) * r * 0.44 - r * 0.12, py + Math.sin(a) * r * 0.4 - r * 0.24, r * 0.11, 0, Math.PI * 2);
      c.fill();
    }
    /* 윗면 잎 끝 — 수관 윤곽을 삐죽하게 (동그란 테두리로 보이지 않게) */
    const nf = 6;
    for (let i = 0; i < nf; i++) {
      const a = -2.9 + i * 0.42 + ctHash(tx, ty, 970 + t + i) * 0.2;
      c.fillStyle = i % 2 ? '#4f8f42' : '#3f8134';
      c.beginPath();
      c.ellipse(px + Math.cos(a) * r * 0.86, py + Math.sin(a) * r * 0.72, r * 0.17, r * 0.10, a * 0.6, 0, Math.PI * 2);
      c.fill();
    }
    /* 잎 사이 그늘 */
    c.fillStyle = 'rgba(16,38,16,0.4)';
    for (let i = 0; i < 3; i++) {
      const a = ctHash(tx, ty, 700 + t + i) * 6.283;
      const rr = 0.30 + ctHash(tx, ty, 720 + t + i) * 0.4;
      c.beginPath(); c.arc(px + Math.cos(a) * r * rr + r * 0.22, py + Math.sin(a) * r * rr + r * 0.28, r * 0.12, 0, Math.PI * 2); c.fill();
    }
  }

  /* 숲 — 가운데는 유닛이 설 수 있는 풀밭 빈터, 나무는 위쪽·가장자리에 (드롭 섀도우 포함) */
  function ctForest(c, X, Y, x, y) {
    ctGrassBase(c, X, Y, x, y);
    /* 숲 바닥 그늘 — 가운데가 살짝 어둡고 가장자리로 갈수록 옅게 (칸 경계가 드러나지 않게) */
    const cx0 = X + TILE / 2, cy0 = Y + TILE * 0.52;
    const shade = c.createRadialGradient(cx0, cy0, TILE * 0.1, cx0, cy0, TILE * 0.78);
    shade.addColorStop(0, 'rgba(44,62,32,0.20)');
    shade.addColorStop(0.75, 'rgba(44,62,32,0.12)');
    shade.addColorStop(1, 'rgba(44,62,32,0)');
    c.fillStyle = shade;
    c.fillRect(X, Y, TILE, TILE);
    /* 빈터 — 가운데·아래쪽이 눌린 풀밭 */
    const cxp = X + TILE * 0.5, cyp = Y + TILE * 0.70;
    const g = c.createRadialGradient(cxp, cyp, 2, cxp, cyp, TILE * 0.36);
    g.addColorStop(0, 'rgba(182,196,126,0.30)');
    g.addColorStop(0.65, 'rgba(150,170,104,0.14)');
    g.addColorStop(1, 'rgba(140,160,96,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cxp, cyp, TILE * 0.36, TILE * 0.22, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(96,118,58,0.35)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(cxp - 9, cyp + 2); c.quadraticCurveTo(cxp - 4, cyp - 4, cxp, cyp + 1);
    c.moveTo(cxp + 3, cyp + 4); c.quadraticCurveTo(cxp + 8, cyp - 2, cxp + 12, cyp + 3);
    c.stroke();
    /* 나무 — 큰 나무 한 그루(위쪽) + 좌우 가장자리 나무 (칸마다 자리·크기를 흔들어 반복감을 지운다).
       가운데·아래는 빈터로 남겨 유닛이 숲 속에 서고, 전경 잎이 하반신을 덮는다. */
    const h0 = ctHash(x, y, 88);
    if (h0 < 0.9) {
      const hx = ctHash(x, y, 90), hy = ctHash(x, y, 91), hz = ctHash(x, y, 92);
      ctCanopy(c, X + TILE * (0.48 + (hx - 0.5) * 0.16), Y + TILE * (0.30 + (hy - 0.5) * 0.08), TILE * (0.27 + hz * 0.06), x, y, 1);
    }
    for (let i = 0; i < 2; i++) {
      const hx = ctHash(x, y, 100 + i * 4), hy = ctHash(x, y, 101 + i * 4), hz = ctHash(x, y, 102 + i * 4);
      if (hx > 0.86) continue;
      const px = X + TILE * (i ? 0.92 : 0.08 + (hx - 0.5) * 0.06);
      const py = Y + TILE * (0.55 + (hy - 0.5) * 0.12);
      ctCanopy(c, px, py, TILE * (0.20 + hz * 0.05), x, y, 2 + i);
    }
    /* 앞쪽 가장자리 덤불 — 낮게 깔린 잎 뭉치 (동그란 구슬처럼 보이지 않게 가로로 퍼진 모양) */
    for (let i = 0; i < 2; i++) {
      const hx = ctHash(x, y, 120 + i), hy = ctHash(x, y, 121 + i);
      if (hx > 0.66) continue;
      const px = X + TILE * (i ? 0.90 : 0.10);
      const py = Y + TILE * (0.90 + hy * 0.04);
      const r = TILE * (0.13 + hx * 0.05);
      c.fillStyle = 'rgba(26,42,20,0.24)';
      c.beginPath(); c.ellipse(px + 2, py + r * 0.5, r * 1.15, r * 0.4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#264d22';
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.ellipse(px + (k - 1) * r * 0.62, py + (k === 1 ? -r * 0.22 : 0), r * 0.62, r * 0.44, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#356b34';
      for (let k = 0; k < 2; k++) {
        c.beginPath();
        c.ellipse(px + (k ? 0.22 : -0.3) * r, py - r * 0.3, r * 0.42, r * 0.28, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#4f8f42';
      c.beginPath(); c.ellipse(px - r * 0.3, py - r * 0.42, r * 0.26, r * 0.16, 0, 0, Math.PI * 2); c.fill();
    }
  }

  /* 산지 — 위가 산이면 이어진 산허리(암반 질감), 능선 칸에만 봉우리를 세운다.
     (칸마다 같은 봉우리를 찍으면 이빨처럼 반복돼서, 위가 산이면 봉우리를 그리지 않는다) */
  function ctMountain(c, X, Y, x, y) {
    const up = ctAt(x, y - 1) === 'M', dn = ctAt(x, y + 1) === 'M';
    const lf = ctAt(x - 1, y) === 'M', rt = ctAt(x + 1, y) === 'M';
    const h0 = ctHash(x, y, 500), h1 = ctHash(x, y, 501), h2 = ctHash(x, y, 502);
    /* 암반 바탕 — 위에서 아래로 조금씩 어두워진다 */
    const bg = c.createLinearGradient(0, Y, 0, Y + TILE);
    bg.addColorStop(0, up ? '#8b7d68' : '#94856f');
    bg.addColorStop(1, '#6f6353');
    c.fillStyle = bg;
    if (up) {
      c.fillRect(X - 1, Y - 1, TILE + 2, TILE + 2);
    } else {
      c.beginPath();
      c.moveTo(X - 1, Y + TILE + 1);
      c.lineTo(X - 1, Y + TILE * (0.46 + h0 * 0.1));
      for (let i = 1; i <= 4; i++) {
        const px = X + (i / 4) * TILE;
        const py = Y + TILE * (0.34 + ctHash(x, y, 135 + i) * 0.2);
        c.quadraticCurveTo(px - TILE / 8, py - 5, px, py);
      }
      c.lineTo(X + TILE + 1, Y + TILE + 1);
      c.closePath();
      c.fill();
    }
    /* 암반 결 — 큰 얼룩과 금 간 자국 */
    for (let i = 0; i < 4; i++) {
      const hx = ctHash(x, y, 510 + i * 3), hy = ctHash(x, y, 511 + i * 3), hr = ctHash(x, y, 512 + i * 3);
      c.fillStyle = i % 2 ? 'rgba(190,180,156,0.16)' : 'rgba(60,52,40,0.18)';
      c.beginPath();
      c.ellipse(X + 8 + hx * (TILE - 16), Y + 10 + hy * (TILE - 20), 5 + hr * 9, 3 + hr * 6, hr * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(58,48,34,0.35)';
    c.lineWidth = 1.3;
    for (let i = 0; i < 3; i++) {
      const hx = ctHash(x, y, 520 + i), hy = ctHash(x, y, 530 + i);
      const px = X + 8 + hx * (TILE - 20), py = Y + 10 + hy * (TILE - 24);
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + 7 + hx * 7, py + 4 + hy * 6); c.stroke();
    }
    /* 능선 칸에만 봉우리 — 위치·크기를 칸마다 흔든다 */
    if (!up) {
      const peak = (px, py, w, h) => {
        c.beginPath(); c.moveTo(px - w, py); c.lineTo(px, py - h); c.lineTo(px + w, py); c.closePath();
        c.fillStyle = '#7b6d5a'; c.fill();
        c.beginPath(); c.moveTo(px - w, py); c.lineTo(px, py - h); c.lineTo(px + w * 0.08, py); c.closePath();
        c.fillStyle = '#b3a48c'; c.fill();
        c.beginPath(); c.moveTo(px + w * 0.08, py); c.lineTo(px, py - h); c.lineTo(px + w, py); c.closePath();
        c.fillStyle = 'rgba(72,62,48,0.30)'; c.fill();
        c.beginPath(); c.moveTo(px - w, py); c.lineTo(px, py - h); c.lineTo(px + w, py); c.closePath();
        c.strokeStyle = 'rgba(58,48,36,0.42)'; c.lineWidth = 1.3; c.stroke();
        /* 눈·밝은 바위 끝 */
        c.fillStyle = 'rgba(232,226,206,0.5)';
        c.beginPath(); c.moveTo(px - w * 0.18, py - h * 0.82); c.lineTo(px, py - h); c.lineTo(px + w * 0.16, py - h * 0.8); c.closePath(); c.fill();
      };
      peak(X + TILE * (0.20 + h1 * 0.18), Y + TILE * (0.84 + h2 * 0.08), TILE * (0.26 + h0 * 0.12), TILE * (0.48 + h1 * 0.26));
      peak(X + TILE * (0.60 + h2 * 0.20), Y + TILE * (0.96 + h0 * 0.06), TILE * (0.28 + h1 * 0.14), TILE * (0.58 + h0 * 0.24));
    }
    /* 이어진 산줄기 — 위·아래가 산이면 칸 경계를 지우는 띠 */
    if (up) { c.fillStyle = 'rgba(90,78,60,0.18)'; c.fillRect(X, Y, TILE, 2); }
    if (dn) { c.fillStyle = 'rgba(60,52,40,0.20)'; c.fillRect(X, Y + TILE - 3, TILE, 3); }
    if (lf) { c.fillStyle = 'rgba(60,52,40,0.14)'; c.fillRect(X, Y, 2, TILE); }
    if (rt) { c.fillStyle = 'rgba(60,52,40,0.14)'; c.fillRect(X + TILE - 2, Y, 2, TILE); }
    /* 자갈 몇 알 */
    for (let i = 0; i < 3; i++) {
      const hx = ctHash(x, y, 540 + i), hy = ctHash(x, y, 550 + i);
      ctRock(c, X + 8 + hx * (TILE - 16), Y + TILE * 0.62 + hy * 18, 1.6 + hx * 2.2, 'rgba(158,146,124,1)', 'rgba(104,94,78,1)');
    }
  }

  /* 성벽 — 돌벽돌 + 윗면(밝은 띠) + 아래 그림자로 두께가 보인다 */
  function ctWall(c, X, Y, x, y) {
    c.fillStyle = CT.stone;
    c.fillRect(X, Y, TILE, TILE);
    c.strokeStyle = CT.mortar;
    c.lineWidth = 2;
    for (let r = 0; r <= 4; r++) {
      const yy = Y + r * 16;
      c.beginPath(); c.moveTo(X, yy); c.lineTo(X + TILE, yy); c.stroke();
      if (r === 4) break;
      const off = (r % 2) ? 16 : 0;
      for (let k = 0; k < 4; k++) {
        const xx = X + ((off + k * 32) % TILE);
        c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx, yy + 16); c.stroke();
      }
    }
    c.fillStyle = 'rgba(196,196,182,0.30)';
    for (let r = 0; r < 4; r++) c.fillRect(X, Y + r * 16 + 2, TILE, 2);
    /* 벽돌 이랑의 옅은 얼룩 — 회색 단색으로 보이지 않게 */
    for (let i = 0; i < 5; i++) {
      const hx = ctHash(x, y, 400 + i), hy = ctHash(x, y, 410 + i);
      c.fillStyle = i % 2 ? 'rgba(220,216,200,0.16)' : 'rgba(70,68,58,0.16)';
      c.beginPath(); c.arc(X + hx * TILE, Y + hy * TILE, 3 + hx * 5, 0, Math.PI * 2); c.fill();
    }
    if (!ctWallish(ctAt(x, y - 1))) {
      c.fillStyle = CT.stone1;
      c.fillRect(X, Y, TILE, 7);
      c.fillStyle = 'rgba(60,58,50,0.55)';
      c.fillRect(X, Y + 7, TILE, 2);
      c.fillStyle = 'rgba(226,224,208,0.45)';
      c.fillRect(X, Y, TILE, 2);
    }
    if (!ctWallish(ctAt(x, y + 1))) {
      c.fillStyle = CT.stone3;
      c.fillRect(X, Y + TILE - 6, TILE, 6);
    }
    if (!ctWallish(ctAt(x - 1, y))) {
      c.fillStyle = 'rgba(52,50,44,0.35)';
      c.fillRect(X, Y, 2, TILE);
    }
    if (!ctWallish(ctAt(x + 1, y))) {
      c.fillStyle = 'rgba(52,50,44,0.35)';
      c.fillRect(X + TILE - 2, Y, 2, TILE);
    }
  }

  /* 성문 — 성벽 위에 나무 문 두 짝 */
  function ctGate(c, X, Y, x, y) {
    ctWall(c, X, Y, x, y);
    const dw = TILE - 18, dh = TILE - 16;
    const dx = X + 9, dy = Y + 9;
    c.fillStyle = CT.stone3;
    c.fillRect(dx - 3, dy - 3, dw + 6, dh + 6);
    c.fillStyle = CT.wood2;
    c.fillRect(dx, dy, dw, dh);
    c.fillStyle = CT.wood;
    c.fillRect(dx + 2, dy + 2, dw / 2 - 4, dh - 4);
    c.fillRect(dx + dw / 2 + 2, dy + 2, dw / 2 - 4, dh - 4);
    /* 문짝 널결 */
    c.strokeStyle = 'rgba(88,58,28,0.45)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const yy = dy + 10 + i * 13;
      c.beginPath(); c.moveTo(dx + 3, yy); c.lineTo(dx + dw / 2 - 4, yy); c.moveTo(dx + dw / 2 + 3, yy); c.lineTo(dx + dw - 3, yy); c.stroke();
    }
    c.fillStyle = CT.stone3;
    c.fillRect(dx + dw / 2 - 1, dy, 2, dh);
    c.fillStyle = '#3b3933';
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 2; k++) {
        c.beginPath(); c.arc(dx + 7 + k * 9, dy + 12 + r * 19, 2.1, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(dx + dw - 7 - k * 9, dy + 12 + r * 19, 2.1, 0, Math.PI * 2); c.fill();
      }
    }
    c.fillStyle = 'rgba(18,14,8,0.38)';
    c.fillRect(dx, dy, dw, 4);
    c.strokeStyle = 'rgba(30,24,14,0.6)';
    c.lineWidth = 1.6;
    c.strokeRect(dx - 3.5, dy - 3.5, dw + 7, dh + 7);
  }

  /* 관아·궁궐(H) — 기와지붕 건물 */
  function ctHall(c, X, Y, x, y) {
    c.fillStyle = CT.yard;
    c.fillRect(X, Y, TILE, TILE);
    c.fillStyle = 'rgba(60,52,36,0.22)';
    c.fillRect(X + 10, Y + 30, TILE - 20, TILE - 32);
    c.fillStyle = '#d8c9a6';
    c.fillRect(X + 10, Y + 30, TILE - 20, TILE - 34);
    c.fillStyle = '#8e5a3c';
    c.fillRect(X + 10, Y + 30, 4, TILE - 34);
    c.fillRect(X + TILE - 14, Y + 30, 4, TILE - 34);
    c.fillStyle = '#7d6a4e';
    c.fillRect(X + 22, Y + 38, 8, TILE - 44);
    c.fillRect(X + TILE - 30, Y + 38, 8, TILE - 44);
    /* 창호 — 먹선 격자 */
    c.strokeStyle = 'rgba(96,74,48,0.55)';
    c.lineWidth = 1;
    c.strokeRect(X + 33, Y + 44, TILE - 66, TILE - 50);
    c.beginPath(); c.moveTo(X + TILE / 2, Y + 44); c.lineTo(X + TILE / 2, Y + TILE - 6); c.stroke();
    c.beginPath();
    c.moveTo(X + 2, Y + 33); c.lineTo(X + 11, Y + 11);
    c.lineTo(X + TILE - 11, Y + 11); c.lineTo(X + TILE - 2, Y + 33);
    c.closePath();
    c.fillStyle = CT.roof; c.fill();
    c.strokeStyle = 'rgba(24,30,44,0.7)'; c.lineWidth = 1.6; c.stroke();
    c.fillStyle = CT.roof2;
    c.fillRect(X + 11, Y + 11, TILE - 22, 5);
    c.strokeStyle = 'rgba(26,32,48,0.5)';
    c.lineWidth = 1.2;
    for (let i = 1; i < 4; i++) {
      const yy = Y + 16 + i * 4;
      const half = (TILE / 2 - 9) * (1 - i * 0.22);
      c.beginPath(); c.moveTo(X + TILE / 2 - half, yy); c.lineTo(X + TILE / 2 + half, yy); c.stroke();
    }
    /* 처마 그림자 */
    c.fillStyle = 'rgba(28,22,12,0.22)';
    c.fillRect(X + 4, Y + 33, TILE - 8, 4);
  }

  /* 마당·본진·마을 바닥 — 돌을 깐 마당 */
  function ctYard(c, X, Y, x, y, base) {
    c.fillStyle = base || CT.yard;
    c.fillRect(X, Y, TILE, TILE);
    c.save();
    c.globalAlpha = 0.22;
    c.fillStyle = CT.yard2;
    for (let i = 0; i < 5; i++) {
      const hx = ctHash(x, y, 150 + i), hy = ctHash(x, y, 160 + i), hr = ctHash(x, y, 170 + i);
      c.beginPath(); c.ellipse(X + 9 + hx * (TILE - 18), Y + 9 + hy * (TILE - 18), 6 + hr * 10, 4 + hr * 6, hr * 3, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    /* 판석 이음 */
    c.strokeStyle = 'rgba(96,80,52,0.20)';
    c.lineWidth = 1.2;
    const hy0 = Y + TILE * (0.34 + ctHash(x, y, 180) * 0.2);
    c.beginPath(); c.moveTo(X + 2, hy0); c.lineTo(X + TILE - 2, hy0); c.stroke();
    const hx0 = X + TILE * (0.3 + ctHash(x, y, 181) * 0.4);
    c.beginPath(); c.moveTo(hx0, Y + 2); c.lineTo(hx0, Y + TILE - 2); c.stroke();
    c.strokeStyle = 'rgba(236,226,196,0.20)';
    c.lineWidth = 1.4;
    c.strokeRect(X + 1, Y + 1, TILE - 2, TILE - 2);
  }

  /* ══════════ v6.0 — 신규 전략 지형 타일 그림 ══════════
     고지대(U)·갈대밭(J)·군량고(Q)·무기고(Y)·목책(N)·부교(L)·포구(O)를
     한 칸 도트 타일로 그린다. 통이미지(배경 그림) 전장에서는 이 함수들을
     칸 위에 덧그려(drawDetailLayer) 그림과 어우러지게 얹는다. */
  const NT = {
    high1: '#a89a6f', high2: '#8d7f57', high3: '#c4b78c', highEdge: '#6d6247',
    reed1: '#6f7d4a', reed2: '#8a9152', reed3: '#b9ab63', reedHead: '#d8c98a',
    granWall: '#8a6a44', granRoof: '#b08a4e', granSack: '#d9c48d',
    armWall: '#8d8d84', armRoof: '#5f6c8a', armWood: '#9c6f43',
    palWood: '#8a6238', palTip: '#c9a877', plank: '#a97c4b', plankDark: '#7d5832',
    rope: '#d8c9a0', portDeck: '#b08a58',
  };
  /* 고지대 — 초록 평평한 꼭대기 + 남쪽에 깎아지른 흙벽. 한눈에 '높은 땅'으로 읽힌다.
     위·옆이 고지대면 단차를 긋지 않아 능선이 이어진다. */
  function ntHighland(c, X, Y, x, y, onBg) {
    const T = TILE;
    const up = ctAt(x, y - 1) === 'U', dn = ctAt(x, y + 1) === 'U';
    const lf = ctAt(x - 1, y) === 'U', rt = ctAt(x + 1, y) === 'U';
    const lipY = dn ? T : T * 0.76;          // 아래가 고지대면 끝까지 평지
    if (onBg) {
      /* 통이미지 전장 — 배경 그림의 풀밭을 그대로 두고 '높은 땅' 표시만 얹는다
         (단색으로 덮으면 그림 위에 판때기를 얹은 것처럼 보인다) */
      c.save();
      /* 올라선 땅은 살짝 그늘지고, 꼭대기 끝은 밝다 — 배경 그림의 풀결은 그대로 살린다 */
      c.globalAlpha = 0.30; c.fillStyle = '#a8c96c';
      c.fillRect(X, Y, T, lipY);
      if (!dn) { c.globalAlpha = 0.22; c.fillStyle = '#54702c'; c.fillRect(X, Y + lipY * 0.82, T, lipY * 0.18); }
      c.globalAlpha = 0.26; c.fillStyle = '#eef8c4';
      c.fillRect(X, Y, T, 2);
      c.restore();
    } else {
      /* 꼭대기 바닥 — 주변 풀밭보다 한 톤 밝은 초록 */
      c.fillStyle = '#84954f';
      c.fillRect(X, Y, T, lipY);
      c.fillStyle = '#8da05a';
      c.fillRect(X + 3, Y + 2, T - 6, Math.max(2, lipY - 6));
    }
    /* 풀결 — 얼룩과 풀잎 (통이미지 전장은 배경 그림이 이미 풀결을 갖고 있어 생략) */
    if (!onBg) for (let i = 0; i < 4; i++) {
      const hx = ctHash(x, y, 300 + i), hy = ctHash(x, y, 320 + i);
      c.fillStyle = i % 2 ? 'rgba(186,204,132,0.10)' : 'rgba(88,108,52,0.09)';
      c.beginPath();
      c.ellipse(X + T * 0.16 + hx * T * 0.68, Y + T * 0.14 + hy * Math.max(4, lipY - T * 0.24), 5 + hx * 7, 3 + hy * 4, hx * 3, 0, Math.PI * 2);
      c.fill();
    }
    if (!onBg) {
      c.strokeStyle = 'rgba(84,108,52,0.7)'; c.lineWidth = 1.5; c.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const hx = ctHash(x, y, 330 + i), hy = ctHash(x, y, 340 + i);
        const px = X + 8 + hx * (T - 16), py = Y + T * 0.18 + hy * Math.max(4, lipY - T * 0.3);
        c.beginPath(); c.moveTo(px, py + 5); c.lineTo(px - 3, py - 3); c.moveTo(px, py + 5); c.lineTo(px + 3, py - 4); c.stroke();
      }
    }
    /* 남쪽 단차 — 흙벽과 그 아래 그늘 */
    if (!dn) {
      const eg = c.createLinearGradient(0, Y + lipY, 0, Y + T);
      eg.addColorStop(0, '#a08c60');
      eg.addColorStop(0.5, '#866f47');
      eg.addColorStop(1, '#5f4f34');
      c.fillStyle = eg; c.fillRect(X, Y + lipY, T, T - lipY);
      /* 흙벽 세로 결 — 삐죽한 자국 */
      c.fillStyle = 'rgba(74,60,36,0.30)';
      for (let i = 0; i < 6; i++) {
        const hx = ctHash(x, y, 360 + i), hh = 3 + hx * (T - lipY - 4);
        c.fillRect(X + 3 + i * (T - 6) / 6 + hx * 3, Y + lipY + 2, 1.6, Math.max(2, hh));
      }
      c.fillStyle = 'rgba(226,214,172,0.18)';
      for (let i = 0; i < 4; i++) c.fillRect(X + 6 + i * 14, Y + lipY + 2, 1.4, 4);
      c.fillStyle = 'rgba(36,28,16,0.34)'; c.fillRect(X, Y + T - 5, T, 5);
      /* 꼭대기 끝의 밝은 흙 선 — 단차가 도드라진다 */
      c.fillStyle = 'rgba(226,232,186,0.55)'; c.fillRect(X + 1, Y + lipY - 1.5, T - 2, 2);
      c.fillStyle = 'rgba(66,58,38,0.30)'; c.fillRect(X + 1, Y + lipY + 0.5, T - 2, 1.4);
    }
    /* 위·옆 단차 */
    if (!up) { c.fillStyle = 'rgba(232,238,192,0.30)'; c.fillRect(X + 2, Y, T - 4, 2.4); }
    if (!lf) { c.fillStyle = 'rgba(112,96,64,0.42)'; c.fillRect(X, Y + 2, 2.6, lipY - 4); }
    if (!rt) { c.fillStyle = 'rgba(112,96,64,0.42)'; c.fillRect(X + T - 2.6, Y + 2, 2.6, lipY - 4); }
  }
  /* 갈대밭 — 물기 어린 풀바닥에 갈대 줄기와 이삭.
     가운데·아래는 눌린 자리를 남겨 유닛이 서면 갈대에 몸을 숨긴 것처럼 보인다. */
  function ntReeds(c, X, Y, x, y, onBg) {
    if (onBg) {
      /* 통이미지 전장 — 배경 풀밭 위에 젖은 땅 그늘만 옅게 깔고 갈대를 세운다 */
      c.save();
      c.globalAlpha = 0.30; c.fillStyle = '#4f6338';
      c.fillRect(X, Y, TILE, TILE);
      c.globalAlpha = 0.18; c.fillStyle = '#2f4a30';
      c.fillRect(X, Y + TILE * 0.62, TILE, TILE * 0.38);
      c.restore();
    } else {
      c.fillStyle = NT.reed1; c.fillRect(X, Y, TILE, TILE);
    }
    const g = c.createRadialGradient(X + TILE * 0.5, Y + TILE * 0.7, 2, X + TILE * 0.5, Y + TILE * 0.7, TILE * 0.4);
    g.addColorStop(0, 'rgba(150,150,96,0.32)');
    g.addColorStop(1, 'rgba(150,150,96,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(X + TILE * 0.5, Y + TILE * 0.7, TILE * 0.4, TILE * 0.26, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(58,86,72,0.34)';
    c.beginPath(); c.ellipse(X + TILE / 2, Y + TILE - 6, TILE * 0.52, 9, 0, 0, 6.283); c.fill();
    /* 갈대 — 가장자리·위쪽 위주로 (가운데 아래는 비워 둔다) */
    c.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const h1 = ctHash(x, y, 400 + i), h2 = ctHash(x, y, 430 + i);
      let fx = h1;
      if (i < 5) fx = 0.06 + h1 * 0.14;            // 왼쪽 띠
      else if (i < 10) fx = 0.80 + h1 * 0.14;      // 오른쪽 띠
      const bx = X + 4 + fx * (TILE - 8);
      const by = Y + TILE - 4;
      const hh = 17 + h2 * 27;
      const lean = (h1 - 0.5) * 10;
      c.strokeStyle = 'rgba(52,58,34,0.35)';
      c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(bx + 1.2, by); c.quadraticCurveTo(bx + lean * 0.4 + 1.2, by - hh * 0.6, bx + lean + 1.2, by - hh); c.stroke();
      c.strokeStyle = i % 3 === 0 ? '#b2ac66' : '#8e9455';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + lean * 0.4, by - hh * 0.6, bx + lean, by - hh); c.stroke();
      /* 이삭 — 갈색·금색이 섞인 솔 모양 */
      c.fillStyle = i % 4 === 0 ? '#d9c07c' : (i % 4 === 1 ? '#c0a768' : '#a98f52');
      c.beginPath(); c.ellipse(bx + lean, by - hh, 1.9, 4.6, lean * 0.06, 0, 6.283); c.fill();
      c.fillStyle = 'rgba(92,74,38,0.5)';
      c.beginPath(); c.ellipse(bx + lean + 0.6, by - hh + 1.2, 1.1, 3.2, lean * 0.06, 0, 6.283); c.fill();
      /* 잎 한 장 */
      c.strokeStyle = 'rgba(132,138,78,0.75)';
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(bx, by - hh * 0.45); c.quadraticCurveTo(bx + 6 * (h1 - 0.5), by - hh * 0.6, bx + 9 * (h1 - 0.5), by - hh * 0.78); c.stroke();
    }
    /* 눌린 갈대 — 가운데 아래 */
    c.strokeStyle = 'rgba(178,172,110,0.55)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(X + TILE * 0.3, Y + TILE * 0.86); c.quadraticCurveTo(X + TILE * 0.5, Y + TILE * 0.8, X + TILE * 0.72, Y + TILE * 0.88);
    c.stroke();
  }
  /* 군량고 — 마당에 선 나무 창고와 곡식 자루 */
  function ntGranary(c, X, Y, x, y) {
    c.fillStyle = CT.yard; c.fillRect(X, Y, TILE, TILE);
    c.fillStyle = 'rgba(150,126,86,0.35)'; c.fillRect(X, Y + TILE - 6, TILE, 6);
    /* 창고 */
    c.fillStyle = NT.granWall; c.fillRect(X + 10, Y + 22, TILE - 20, TILE - 30);
    c.fillStyle = '#6b5233'; c.fillRect(X + 14, Y + 30, TILE - 28, 4);
    c.fillStyle = NT.granRoof;
    c.beginPath(); c.moveTo(X + 6, Y + 23); c.lineTo(X + TILE - 6, Y + 23); c.lineTo(X + TILE - 14, Y + 12); c.lineTo(X + 14, Y + 12); c.closePath(); c.fill();
    c.fillStyle = 'rgba(232,196,128,0.4)';
    c.fillRect(X + 14, Y + 13, TILE - 28, 2.4);
    c.strokeStyle = 'rgba(60,44,24,0.45)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(X + 10, Y + 22); c.lineTo(X + 10, Y + TILE - 8); c.moveTo(X + TILE - 10, Y + 22); c.lineTo(X + TILE - 10, Y + TILE - 8); c.stroke();
    /* 자루 */
    c.fillStyle = NT.granSack;
    c.beginPath(); c.ellipse(X + TILE - 14, Y + TILE - 12, 5, 6, 0, 0, 6.283); c.fill();
    c.beginPath(); c.ellipse(X + TILE - 24, Y + TILE - 10, 4, 5, 0, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(120,96,54,0.5)';
    c.fillRect(X + TILE - 17, Y + TILE - 15, 6, 1.4);
  }
  /* 무기고 — 돌벽 창고와 세워 둔 창·방패 */
  function ntArmory(c, X, Y, x, y) {
    c.fillStyle = CT.yard; c.fillRect(X, Y, TILE, TILE);
    c.fillStyle = 'rgba(120,116,104,0.4)'; c.fillRect(X, Y + TILE - 6, TILE, 6);
    c.fillStyle = NT.armWall; c.fillRect(X + 12, Y + 20, TILE - 24, TILE - 26);
    c.fillStyle = NT.armRoof; c.fillRect(X + 8, Y + 14, TILE - 16, 8);
    c.fillStyle = 'rgba(206,214,228,0.35)'; c.fillRect(X + 8, Y + 14, TILE - 16, 2);
    c.strokeStyle = 'rgba(50,50,44,0.45)'; c.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) c.strokeRect(X + 14 + i * 10, Y + 26, 9, TILE - 34);
    /* 창 걸이 */
    c.strokeStyle = NT.armWood; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X + 4, Y + TILE - 14); c.lineTo(X + 4, Y + 26); c.stroke();
    c.strokeStyle = '#cfcfc4'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(X + 7, Y + TILE - 12); c.lineTo(X + 9, Y + 18); c.moveTo(X + 12, Y + TILE - 12); c.lineTo(X + 13, Y + 22); c.stroke();
    /* 방패 */
    c.fillStyle = '#8a4a38';
    c.beginPath(); c.ellipse(X + TILE - 14, Y + TILE - 16, 6, 7.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d8c49a';
    c.beginPath(); c.arc(X + TILE - 14, Y + TILE - 16, 2.2, 0, Math.PI * 2); c.fill();
  }
  /* 목책 — 뾰족한 말뚝을 세운 나무 울타리 */
  function ntPalisade(c, X, Y, x, y) {
    c.fillStyle = CT.grass; c.fillRect(X, Y, TILE, TILE);
    c.fillStyle = 'rgba(40,32,18,0.30)'; c.fillRect(X, Y + TILE - 10, TILE, 10);
    c.fillStyle = NT.palWood;
    for (let i = 0; i < 6; i++) {
      const bx = X + 3 + i * 10;
      c.beginPath();
      c.moveTo(bx, Y + TILE - 6); c.lineTo(bx, Y + 20); c.lineTo(bx + 4, Y + 10); c.lineTo(bx + 8, Y + 20); c.lineTo(bx + 8, Y + TILE - 6);
      c.closePath(); c.fill();
      c.fillStyle = NT.palTip; c.fillRect(bx + 3, Y + 12, 2, 6); c.fillStyle = NT.palWood;
      c.fillStyle = 'rgba(52,38,20,0.5)'; c.fillRect(bx + 6.6, Y + 20, 1.4, TILE - 26); c.fillStyle = NT.palWood;
    }
    c.strokeStyle = 'rgba(58,42,22,0.7)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X + 2, Y + TILE - 22); c.lineTo(X + TILE - 2, Y + TILE - 24); c.stroke();
    c.strokeStyle = 'rgba(196,166,120,0.5)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(X + 2, Y + TILE - 24); c.lineTo(X + TILE - 2, Y + TILE - 26); c.stroke();
  }
  /* 부교 — 물 위에 띄운 널빤지 다리 (양옆에 물이 비치고 통나무 부표가 뜬다) */
  function ntPontoon(c, X, Y, x, y) {
    const T = TILE;
    const up = ctAt(x, y - 1) === 'L', dn = ctAt(x, y + 1) === 'L';
    const lfL = ctAt(x - 1, y) === 'L', rtL = ctAt(x + 1, y) === 'L';
    const upW = ctAt(x, y - 1) === 'W', dnW = ctAt(x, y + 1) === 'W';
    const lfW = ctAt(x - 1, y) === 'W', rtW = ctAt(x + 1, y) === 'W';
    /* 건너는 방향 — 강물이 좌우에 있으면 위아래로 건너는 다리, 위아래에 있으면 좌우로 */
    const vertical = (lfW || rtW) ? true : ((upW || dnW) ? false : !lfL && !rtL);
    c.fillStyle = CT.water; c.fillRect(X, Y, T, T);
    c.fillStyle = 'rgba(150,206,228,0.10)'; c.fillRect(X, Y, T, T);
    /* 통나무 부표 — 다리 끝(물에 닿는 첫 칸)에만 띄운다 */
    if ((vertical && (!up || !dn)) || (!vertical && (!lfL || !rtL))) {
      [0.12, 0.88].forEach((kx) => {
        [0.16, 0.84].forEach((ky) => {
          if ((vertical && ((!up && ky < 0.5) || (!dn && ky > 0.5))) ||
              (!vertical && ((!lfL && kx < 0.5) || (!rtL && kx > 0.5)))) {
            c.fillStyle = '#8a6238';
            c.beginPath(); c.ellipse(X + T * kx, Y + T * ky, 6.5, 3.8, 0, 0, 6.283); c.fill();
            c.fillStyle = '#b0834f';
            c.beginPath(); c.ellipse(X + T * kx, Y + T * ky, 4.2, 2.2, 0, 0, 6.283); c.fill();
          }
        });
      });
    }
    /* 이웃한 부교 칸과 널판을 이어 붙인다 (2칸 폭 부교가 가운데서 끊기지 않게) */
    const x0 = vertical ? (lfL ? X : X + T * 0.19) : X;
    const x1 = vertical ? (rtL ? X + T : X + T * 0.81) : X + T;
    const y0 = vertical ? Y : (up ? Y : Y + T * 0.19);
    const y1 = vertical ? Y + T : (dn ? Y + T : Y + T * 0.81);
    /* 물 위 그림자 → 널빤지 */
    c.fillStyle = 'rgba(8,26,36,0.32)';
    c.fillRect(x0 + 1, y0 + 3, (x1 - x0) - 2, (y1 - y0) - 3);
    const n = vertical ? 4 : 3;
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? '#b0834f' : '#a07442';
      if (vertical) {
        const py = y0 + i * (y1 - y0) / n;
        c.fillRect(x0, py, x1 - x0, (y1 - y0) / n - 2.2);
        c.fillStyle = 'rgba(226,190,140,0.28)';
        c.fillRect(x0, py + 1, x1 - x0, 1.3);
        c.fillStyle = 'rgba(84,58,30,0.5)';
        c.fillRect(x0, py + (y1 - y0) / n - 2.6, x1 - x0, 1.4);
      } else {
        const px = x0 + i * (x1 - x0) / n;
        c.fillRect(px, y0, (x1 - x0) / n - 2.2, y1 - y0);
        c.fillStyle = 'rgba(226,190,140,0.28)';
        c.fillRect(px + 1, y0, 1.3, y1 - y0);
        c.fillStyle = 'rgba(84,58,30,0.5)';
        c.fillRect(px + (x1 - x0) / n - 2.6, y0, 1.4, y1 - y0);
      }
    }
    /* 밧줄 난간 — 물에 닿은 쪽에만 */
    c.strokeStyle = '#e2d3a6'; c.lineWidth = 1.8;
    c.beginPath();
    if (vertical) {
      if (!lfL) { c.moveTo(X + T * 0.18, Y); c.lineTo(X + T * 0.18, Y + T); }
      if (!rtL) { c.moveTo(X + T * 0.82, Y); c.lineTo(X + T * 0.82, Y + T); }
    } else {
      if (!up) { c.moveTo(X, Y + T * 0.18); c.lineTo(X + T, Y + T * 0.18); }
      if (!dn) { c.moveTo(X, Y + T * 0.82); c.lineTo(X + T, Y + T * 0.82); }
    }
    c.stroke();
    c.fillStyle = 'rgba(198,234,248,0.20)';
    if (vertical) c.fillRect(x0, Y + T - 4, x1 - x0, 3);
  }

  /* 포구 — 물가에 놓인 나무 선착장 */
  function ntPort(c, X, Y, x, y) {
    c.fillStyle = CT.water; c.fillRect(X, Y, TILE, TILE);
    c.fillStyle = 'rgba(120,190,220,0.10)'; c.fillRect(X, Y, TILE, TILE);
    c.fillStyle = 'rgba(10,26,36,0.30)';
    c.fillRect(X + 6, Y + TILE * 0.17, TILE - 8, TILE * 0.70);
    c.fillStyle = NT.portDeck;
    c.fillRect(X + 4, Y + TILE * 0.15, TILE - 8, TILE * 0.72);
    c.fillStyle = NT.plankDark;
    for (let i = 0; i < 5; i++) c.fillRect(X + 6, Y + TILE * 0.18 + i * 9, TILE - 12, 2);
    c.fillStyle = 'rgba(226,190,140,0.25)';
    for (let i = 0; i < 4; i++) c.fillRect(X + 8, Y + TILE * 0.21 + i * 9, TILE - 16, 1.2);
    c.fillStyle = '#6b4a2a';
    c.fillRect(X + 6, Y + TILE * 0.14, 5, TILE * 0.74);
    c.fillRect(X + TILE - 11, Y + TILE * 0.14, 5, TILE * 0.74);
    c.strokeStyle = 'rgba(60,40,20,0.4)'; c.lineWidth = 1.2;
    c.strokeRect(X + 4.5, Y + TILE * 0.15, TILE - 9, TILE * 0.72);
    /* 물가 물거품 */
    c.strokeStyle = 'rgba(228,246,252,0.35)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(X + 2, Y + TILE * 0.9); c.quadraticCurveTo(X + TILE * 0.5, Y + TILE * 0.93, X + TILE - 2, Y + TILE * 0.89); c.stroke();
  }
  const NT_PAINT = { U: ntHighland, J: ntReeds, Q: ntGranary, Y: ntArmory, N: ntPalisade, L: ntPontoon, O: ntPort };
  function drawNewTile(c, ch, X, Y, x, y, onBg) {
    const f = NT_PAINT[ch];
    if (f) f(c, X, Y, x, y, onBg);
  }

  /* 2.5D — 지형이 다음 칸 위로 떨어뜨리는 그림자 (남쪽으로) */
  const CT_CAST = {
    C: [10, 0.30], G: [10, 0.32], H: [15, 0.32], K: [13, 0.30], T: [13, 0.28],
    Q: [11, 0.28], Y: [11, 0.28], N: [9, 0.24], O: [8, 0.20], U: [9, 0.22], M: [8, 0.20],
  };
  function ctShadowPass(c) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = ctAt(x, y);
        const cfg = CT_CAST[ch];
        if (!cfg) continue;
        const dn = ctAt(x, y + 1);
        if (dn === ch) continue;                                  // 이어지는 능선·벽에는 띠를 긋지 않는다
        if ((ch === 'C' || ch === 'G') && (dn === 'C' || dn === 'G')) continue;
        if (y + 1 >= ROWS) continue;
        ctShadow(c, x * TILE, y * TILE, cfg[0], cfg[1]);
      }
    }
  }

  /* ══════════ v6.1 — 통이미지 전장 위 덧칠 레이어 ══════════
     정식 전장(plain·ford·naval·mountain·forest·gorge·camp·siege·fortress)은
     배경 그림을 그대로 쓰므로, 그 위에 칸 단위 질감·물가·입체 그림자만 아주 옅게 얹는다.
     한 번 그려 B._detail 에 담아 두고 매 프레임에는 한 장만 얹는다 (모바일 프레임 유지). */
  function vdGrass(c, X, Y, x, y) {
    c.save();
    for (let i = 0; i < 2; i++) {
      const hx = ctHash(x, y, 600 + i * 4), hy = ctHash(x, y, 601 + i * 4), hr = ctHash(x, y, 602 + i * 4);
      const px = X + 12 + hx * (TILE - 24), py = Y + 12 + hy * (TILE - 24);
      const r = 10 + hr * 13;
      const g = c.createRadialGradient(px, py, 1, px, py, r);
      const lit = i === 0;
      g.addColorStop(0, lit ? 'rgba(190,204,126,0.16)' : 'rgba(50,68,34,0.18)');
      g.addColorStop(1, lit ? 'rgba(190,204,126,0)' : 'rgba(50,68,34,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(px, py, r, r * 0.7, hr * 3, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(62,84,40,0.24)';
    c.lineWidth = 1.2;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const hx = ctHash(x, y, 610 + i * 3), hy = ctHash(x, y, 611 + i * 3);
      const px = X + 9 + hx * (TILE - 18), py = Y + 22 + hy * (TILE - 34);
      c.beginPath();
      c.moveTo(px, py); c.quadraticCurveTo(px - 1.6, py - 4, px - 2.8, py - 7);
      c.moveTo(px + 2, py); c.quadraticCurveTo(px + 3, py - 3.4, px + 4.6, py - 5.4);
      c.stroke();
    }
    if (ctHash(x, y, 620) > 0.88) {
      const px = X + 12 + ctHash(x, y, 621) * (TILE - 24), py = Y + 14 + ctHash(x, y, 622) * (TILE - 26);
      c.fillStyle = 'rgba(246,242,200,0.45)';
      for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(px + Math.cos(k * 2.1) * 2, py + Math.sin(k * 2.1) * 2, 1.1, 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
  }
  function vdRoad(c, X, Y, x, y, ch) {
    c.save();
    /* 바퀴·발길 자국 */
    const up = ctRoadish(ctAt(x, y - 1)), dn = ctRoadish(ctAt(x, y + 1));
    const lf = ctRoadish(ctAt(x - 1, y)), rt = ctRoadish(ctAt(x + 1, y));
    c.fillStyle = 'rgba(226,202,158,0.13)';
    if (up || dn) { c.fillRect(X + TILE / 2 - 8, Y, 3, TILE); c.fillRect(X + TILE / 2 + 5, Y, 3, TILE); }
    if (lf || rt) { c.fillRect(X, Y + TILE / 2 - 8, TILE, 3); c.fillRect(X, Y + TILE / 2 + 5, TILE, 3); }
    /* 조약돌 */
    for (let i = 0; i < 6; i++) {
      const hx = ctHash(x, y, 630 + i), hy = ctHash(x, y, 640 + i), hr = ctHash(x, y, 650 + i);
      const px = X + 8 + hx * (TILE - 16), py = Y + 8 + hy * (TILE - 16);
      c.fillStyle = i % 2 ? 'rgba(226,206,166,0.24)' : 'rgba(146,124,86,0.22)';
      c.beginPath(); c.ellipse(px, py, 2.2 + hr * 2.6, 1.6 + hr * 1.6, hx * 3, 0, Math.PI * 2); c.fill();
    }
    /* 마모된 가장자리 — 길이 아닌 쪽에 부스러기 */
    c.fillStyle = 'rgba(120,98,58,0.16)';
    if (!up) c.fillRect(X, Y + 1, TILE, 3);
    if (!dn) c.fillRect(X, Y + TILE - 4, TILE, 3);
    if (!lf) c.fillRect(X + 1, Y, 3, TILE);
    if (!rt) c.fillRect(X + TILE - 4, Y, 3, TILE);
    c.restore();
  }
  function vdWater(c, X, Y, x, y) {
    const land = (ch) => ch !== 'W' && ch !== 'S' && ch !== 'B' && ch !== 'L' && ch !== 'O';
    c.save();
    /* 윤슬 */
    c.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const hy = ctHash(x, y, 660 + i);
      const yy = Y + 14 + hy * (TILE - 28);
      const x0 = X + 10 + ctHash(x, y, 662 + i) * 16;
      c.strokeStyle = 'rgba(220,244,255,0.22)';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x0, yy); c.quadraticCurveTo(x0 + 8, yy - 2.4, x0 + 17, yy); c.stroke();
    }
    /* 물가 — 물거품과 강둑 자갈 */
    const foam = (side) => {
      c.strokeStyle = 'rgba(230,248,255,0.28)';
      c.lineWidth = 1.6;
      c.beginPath();
      if (side === 'up') { c.moveTo(X + 4, Y + 4); c.quadraticCurveTo(X + TILE * 0.3, Y + 7, X + TILE * 0.55, Y + 3); c.quadraticCurveTo(X + TILE * 0.8, Y + 1, X + TILE - 4, Y + 5); }
      else if (side === 'dn') { c.moveTo(X + 4, Y + TILE - 4); c.quadraticCurveTo(X + TILE * 0.3, Y + TILE - 7, X + TILE * 0.55, Y + TILE - 3); c.quadraticCurveTo(X + TILE * 0.8, Y + TILE - 1, X + TILE - 4, Y + TILE - 5); }
      else if (side === 'lf') { c.moveTo(X + 4, Y + 4); c.quadraticCurveTo(X + 7, Y + TILE * 0.3, X + 3, Y + TILE * 0.55); c.quadraticCurveTo(X + 1, Y + TILE * 0.8, X + 5, Y + TILE - 4); }
      else { c.moveTo(X + TILE - 4, Y + 4); c.quadraticCurveTo(X + TILE - 7, Y + TILE * 0.3, X + TILE - 3, Y + TILE * 0.55); c.quadraticCurveTo(X + TILE - 1, Y + TILE * 0.8, X + TILE - 5, Y + TILE - 4); }
      c.stroke();
      for (let i = 0; i < 2; i++) {
        const h1 = ctHash(x, y, 670 + i + side.length), h2 = ctHash(x, y, 680 + i + side.length);
        const px = (side === 'up' || side === 'dn') ? X + 8 + h1 * (TILE - 16) : (side === 'lf' ? X + 6 + h2 * 5 : X + TILE - 8 - h2 * 5);
        const py = (side === 'up' || side === 'dn') ? (side === 'up' ? Y + 5 + h2 * 4 : Y + TILE - 7 - h2 * 4) : Y + 8 + h1 * (TILE - 16);
        ctRock(c, px, py, 1.6 + h1 * 1.6);
      }
    };
    if (land(ctAt(x, y - 1))) foam('up');
    if (land(ctAt(x, y + 1))) foam('dn');
    if (land(ctAt(x - 1, y))) foam('lf');
    if (land(ctAt(x + 1, y))) foam('rt');
    c.restore();
  }
  function vdShallow(c, X, Y, x, y) {
    c.save();
    c.strokeStyle = 'rgba(232,246,252,0.24)';
    c.lineWidth = 1.4; c.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const yy = Y + 16 + i * 22 + ctHash(x, y, 690 + i) * 6;
      c.beginPath(); c.moveTo(X + 9, yy); c.quadraticCurveTo(X + TILE * 0.5, yy - 3, X + TILE - 9, yy); c.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const hx = ctHash(x, y, 700 + i), hy = ctHash(x, y, 710 + i);
      ctRock(c, X + 10 + hx * (TILE - 20), Y + 14 + hy * (TILE - 26), 1.6 + hx * 1.6, 'rgba(206,200,172,1)');
    }
    c.restore();
  }
  function vdForest(c, X, Y, x, y) {
    c.save();
    /* 숲 바닥 빈터 — 가운데·아래를 옅게 밝혀 유닛이 설 자리를 만든다 */
    const g = c.createRadialGradient(X + TILE * 0.5, Y + TILE * 0.7, 2, X + TILE * 0.5, Y + TILE * 0.7, TILE * 0.42);
    g.addColorStop(0, 'rgba(186,204,130,0.14)');
    g.addColorStop(1, 'rgba(186,204,130,0)');
    c.fillStyle = g;
    c.fillRect(X, Y, TILE, TILE);
    /* 아래쪽 수풀 그늘 */
    const g2 = c.createLinearGradient(0, Y + TILE * 0.45, 0, Y + TILE);
    g2.addColorStop(0, 'rgba(12,28,14,0)');
    g2.addColorStop(1, 'rgba(12,28,14,0.15)');
    c.fillStyle = g2;
    c.fillRect(X, Y + TILE * 0.45, TILE, TILE * 0.55);
    c.restore();
  }
  function vdMountain(c, X, Y, x, y) {
    c.save();
    /* 바위 결 — 능선 방향으로 짧은 그늘 */
    c.strokeStyle = 'rgba(58,48,36,0.18)';
    c.lineWidth = 1.4;
    for (let i = 0; i < 2; i++) {
      const hx = ctHash(x, y, 720 + i), hy = ctHash(x, y, 730 + i);
      const px = X + 10 + hx * (TILE - 24), py = Y + TILE * 0.4 + hy * TILE * 0.34;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + 8 + hx * 8, py + 5 + hy * 5); c.stroke();
    }
    c.restore();
  }
  function vdStructure(c, X, Y, x, y) {
    c.save();
    /* 건물·성벽 밑동 접지 그늘 — 배경 그림 위에 앉은 느낌 */
    const ch = ctAt(x, y);
    if (ch !== 'C' && ch !== 'G' && ch !== 'H' && ch !== 'K' && ch !== 'T') return c.restore();
    const dn = ctAt(x, y + 1);
    if (ch === 'C' && (dn === 'C' || dn === 'G')) { c.restore(); return; }
    const g = c.createLinearGradient(0, Y + TILE - 6, 0, Y + TILE + 6);
    g.addColorStop(0, 'rgba(18,20,14,0.20)');
    g.addColorStop(1, 'rgba(18,20,14,0)');
    c.fillStyle = g;
    c.fillRect(X, Y + TILE - 6, TILE, 12);
    c.restore();
  }

  function buildDetailLayer() {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, WORLD_W); cv.height = Math.max(1, WORLD_H);
    const c = cv.getContext('2d');
    if (!c) return null;
    /* ① 질감 — 통이미지 위에 아주 옅게 (지형별 오토타일링) */
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = ctAt(x, y);
        const X = x * TILE, Y = y * TILE;
        if (NT_PAINT[ch]) continue;
        if (ch === 'P') vdGrass(c, X, Y, x, y);
        else if (ch === 'R' || ch === 'V') vdRoad(c, X, Y, x, y, ch);
        else if (ch === 'W') vdWater(c, X, Y, x, y);
        else if (ch === 'S') vdShallow(c, X, Y, x, y);
        else if (ch === 'F') vdForest(c, X, Y, x, y);
        else if (ch === 'M') vdMountain(c, X, Y, x, y);
        vdStructure(c, X, Y, x, y);
      }
    }
    /* ② 전략 지형 7종 — 배경 그림의 칸을 덮되, 그 칸의 바탕색을 아주 옅게 섞어
       배경 화풍(밝은 초록·모래)과 어긋나지 않게 한다 */
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = ctAt(x, y);
        if (!NT_PAINT[ch]) continue;
        drawNewTile(c, ch, x * TILE, y * TILE, x, y, true);
      }
    }
    /* ③ 입체 그림자 */
    ctShadowPass(c);
    return cv;
  }
  function drawDetailLayer() {
    if (!B || !B.tiles || B.customTilesRender) return;
    if (!B._detail || B._detail.width !== WORLD_W || B._detail.height !== WORLD_H) B._detail = buildDetailLayer();
    if (B._detail) ctx.drawImage(B._detail, 0, 0, WORLD_W, WORLD_H);
  }
  /* 배경 그림 전장: 새 지형 칸만 위에 덧그린다 (이전 버전 호환 — 지금은 drawDetailLayer 로 합쳤다) */
  function drawStrategyTiles() { drawDetailLayer(); }
  /* 군량고·무기고 표식 — 커스텀 전장·배경 그림 전장 모두에 그린다 */
  function drawObjMarkers() {
    if (!B || !B.objs) return;
    B.objs.forEach((o) => {
      if (!inViewBoard(o.x, o.y)) return;
      drawObjMarker(o.x, o.y, o.x * TILE, o.y * TILE);
    });
  }
  function drawObjMarker(x, y, X, Y) {
    const o = objAt(x, y);
    const col = o && o.owner ? (o.owner === 'ally' ? '90,160,255' : '255,90,60') : '236,206,120';
    const t = performance.now() / 900;
    ctx.save();
    ctx.strokeStyle = `rgba(${col},${(0.55 + 0.25 * Math.sin(t * 3)).toFixed(3)})`;
    ctx.lineWidth = 2.4;
    ctx.strokeRect(X + 2.5, Y + 2.5, TILE - 5, TILE - 5);
    ctx.fillStyle = `rgba(${col},0.10)`;
    ctx.fillRect(X + 2.5, Y + 2.5, TILE - 5, TILE - 5);
    /* 이름표 */
    const k = clamp(1 / Math.max(0.5, cam.s), 0.9, 1.25);
    ctx.font = `bold ${Math.round(9 * k)}px "Noto Sans CJK KR", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(28,22,12,0.72)';
    const label = o ? o.name : '';
    const w = ctx.measureText(label).width + 8;
    ctx.fillRect(X + TILE / 2 - w / 2, Y + TILE - 14 * k, w, 12 * k);
    ctx.fillStyle = `rgb(${col})`;
    ctx.fillText(label, X + TILE / 2, Y + TILE - 13 * k);
    ctx.restore();
  }
  /* 연소하는 갈대밭 — 흔들리는 불꽃과 그을음 */
  function drawFlameTile(x, y, X, Y) {
    const t = performance.now() / 130;
    const f = (B.fire && B.fire[fireKey(x, y)]) || { t: 1 };
    const k = clamp(f.t / 3, 0.35, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(48,28,10,0.28)';
    ctx.fillRect(X, Y, TILE, TILE);
    for (let i = 0; i < 4; i++) {
      const ph = t + i * 1.7 + x * 0.6 + y * 1.1;
      const fx0 = X + 10 + ((i * 17 + x * 5 + y * 3) % (TILE - 20));
      const fy0 = Y + TILE - 10;
      const hh = (12 + 9 * (0.5 + 0.5 * Math.sin(ph))) * k;
      const grd = ctx.createLinearGradient(fx0, fy0, fx0, fy0 - hh);
      grd.addColorStop(0, 'rgba(255,120,40,0.92)');
      grd.addColorStop(0.55, 'rgba(255,186,70,0.85)');
      grd.addColorStop(1, 'rgba(255,240,190,0.15)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(fx0 - 4, fy0);
      ctx.quadraticCurveTo(fx0 - 5, fy0 - hh * 0.6, fx0, fy0 - hh);
      ctx.quadraticCurveTo(fx0 + 5, fy0 - hh * 0.6, fx0 + 4, fy0);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  /* 커스텀 전장은 정적 레이어에 불이 이미 그려져 있으므로, 매 프레임 불꽃만 얹는다 */
  function drawFires() {
    if (!B || !B.fire) return;
    Object.keys(B.fire).forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      if (!inViewBoard(x, y)) return;
      drawFlameTile(x, y, x * TILE, y * TILE);
    });
  }
  function inViewBoard(x, y) {
    if (!ctx) return true;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const sx = (x + 0.5) * TILE * cam.s + cam.x, sy = (y + 0.5) * TILE * cam.s + cam.y;
    return sx > -TILE && sy > -TILE && sx < w + TILE && sy < h + TILE;
  }

  /* 커스텀 전장 바탕 한 장 — 칸마다 자기 지형을 그린다 */
  function buildCustomTerrain() {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W; cv.height = WORLD_H;
    const c = cv.getContext('2d');
    if (!c) return null;
    /* ① 바탕 — 한 장에 풀밭을 깔고 경계 없는 큰 얼룩으로 명암을 준다
       (칸마다 단색을 채우면 체커보드처럼 보인다) */
    c.fillStyle = CT.grass;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 26; i++) {
      const hx = ctHash(i, 0, 950), hy = ctHash(i, 1, 951), hr = ctHash(i, 2, 952), ht = ctHash(i, 3, 953);
      const px = hx * WORLD_W, py = hy * WORLD_H, r = TILE * (1.4 + hr * 2.2);
      const g = c.createRadialGradient(px, py, 1, px, py, r);
      const lit = ht > 0.5;
      g.addColorStop(0, lit ? 'rgba(180,196,130,0.13)' : 'rgba(72,88,44,0.14)');
      g.addColorStop(1, lit ? 'rgba(180,196,130,0)' : 'rgba(72,88,44,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(px, py, r, r * 0.8, 0, 0, Math.PI * 2); c.fill();
    }
    /* ② 칸마다 지형 (도로·물·숲·산·성벽 …) */
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = ctAt(x, y);
        const X = x * TILE, Y = y * TILE;
        if (ch === 'P') ctGrass(c, X, Y, x, y);
        else if (ch === 'R') { ctGrass(c, X, Y, x, y); ctRoad(c, X, Y, x, y); }
        else if (ch === 'W') ctWaterTile(c, X, Y, x, y);
        else if (ch === 'S') ctShallow(c, X, Y, x, y);
        else if (ch === 'B') ctBridge(c, X, Y, x, y);
        else if (ch === 'F') ctForest(c, X, Y, x, y);
        else if (ch === 'M') ctMountain(c, X, Y, x, y);
        else if (ch === 'C') ctWall(c, X, Y, x, y);
        else if (ch === 'G') ctGate(c, X, Y, x, y);
        else if (ch === 'H') ctHall(c, X, Y, x, y);
        else if (ch === 'T' || ch === 'K') ctYard(c, X, Y, x, y, '#a49c8c');
        else if (ch === 'D') ctYard(c, X, Y, x, y, CT.yard);
        else if (ch === 'V') ctYard(c, X, Y, x, y, '#bda97e');
        else if (ch === 'A' || ch === 'E') ctYard(c, X, Y, x, y, '#cbb98f');
        else if (NT_PAINT[ch]) drawNewTile(c, ch, X, Y, x, y);   // v6.0 — 전략 지형
      }
    }
    /* ③ 입체 그림자 — 지형이 다음 칸 위로 드리우는 그늘 */
    ctShadowPass(c);
    return cv;
  }
  function drawCustomTerrain() {
    if (!B || !B.tiles) return;
    if (!B._terrain || B._terrain.width !== WORLD_W || B._terrain.height !== WORLD_H) B._terrain = buildCustomTerrain();
    if (B._terrain) ctx.drawImage(B._terrain, 0, 0, WORLD_W, WORLD_H);
    else { ctx.fillStyle = '#7d8a52'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }
  }

  /* ══════════ v6.1 — 숲·갈대밭 전경 엄폐 ══════════
     유닛을 그린 뒤 발밑~하반신 위로 앞쪽 잎·갈대 이삭을 반투명으로 덧그린다.
     (나무 위에 둥둥 뜨지 않고 숲·갈대 속에 몸을 숨긴 것처럼) */
  const COVER = {
    forest: { dark: '#1f4423', mid: '#2f6a33', light: '#4f8f42', hi: '#79b556' },
    reeds: { stalk: '#a7ab60', stalk2: '#c3b26c', dry: '#8e7f43', head: '#e6d492', head2: '#cbb876' },
  };
  function coverAt(x, y) {
    const ch = tileAt(x, y);
    return ch === 'F' ? 'forest' : (ch === 'J' ? 'reeds' : null);
  }
  /* 발밑 빈터 — 숲·갈대 속에서도 발 디딜 자리가 보이게 (스프라이트 아래) */
  function drawHideGround(kind, bx, by) {
    ctx.save();
    if (kind === 'forest') {
      const g = ctx.createRadialGradient(bx, by - TILE * 0.06, 2, bx, by - TILE * 0.06, TILE * 0.34);
      g.addColorStop(0, 'rgba(176,196,118,0.34)');
      g.addColorStop(0.6, 'rgba(150,172,98,0.16)');
      g.addColorStop(1, 'rgba(140,164,92,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(bx, by - TILE * 0.05, TILE * 0.34, TILE * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(92,118,58,0.45)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(bx - TILE * 0.16, by - TILE * 0.04); ctx.quadraticCurveTo(bx - TILE * 0.06, by - TILE * 0.1, bx + TILE * 0.02, by - TILE * 0.03);
      ctx.moveTo(bx + TILE * 0.05, by - TILE * 0.01); ctx.quadraticCurveTo(bx + TILE * 0.13, by - TILE * 0.07, bx + TILE * 0.19, by);
      ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(bx, by - TILE * 0.05, 2, bx, by - TILE * 0.05, TILE * 0.32);
      g.addColorStop(0, 'rgba(168,166,104,0.30)');
      g.addColorStop(1, 'rgba(160,158,98,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(bx, by - TILE * 0.04, TILE * 0.32, TILE * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(126,120,70,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx - TILE * 0.17, by - TILE * 0.02); ctx.quadraticCurveTo(bx - TILE * 0.04, by - TILE * 0.09, bx + TILE * 0.1, by - TILE * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawLeafCover(bx, by, X, Y, t, tx, ty) {
    const C = COVER.forest;
    const spots = [[0.04, 0.64], [0.26, 0.58], [0.74, 0.58], [0.96, 0.64], [0.28, 0.88], [0.72, 0.88], [0.50, 1.0]];
    ctx.globalAlpha = 0.68;
    for (let i = 0; i < spots.length; i++) {
      const hx = ctHash(tx, ty, 800 + i * 5), hy = ctHash(tx, ty, 801 + i * 5), hz = ctHash(tx, ty, 802 + i * 5);
      const px = X + spots[i][0] * TILE + (hx - 0.5) * 7;
      const py = Y + spots[i][1] * TILE + (hy - 0.5) * 5 + Math.sin(t * 0.9 + i * 1.4 + tx * 0.6) * 1.1;
      const r = 8.5 + hz * 5.5;
      ctx.fillStyle = 'rgba(10,22,10,0.34)';
      ctx.beginPath(); ctx.ellipse(px + 1.4, py + r * 0.28, r * 0.98, r * 0.58, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#17371c';
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.dark;
      ctx.beginPath(); ctx.arc(px - r * 0.18, py - r * 0.18, r * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.mid;
      ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.44, 0, Math.PI * 2); ctx.fill();
      /* 삐죽 나온 잎사귀 */
      for (let k = 0; k < 3; k++) {
        const a = (hz * 6.28) + k * 2.1;
        ctx.fillStyle = k === 2 ? C.light : C.dark;
        ctx.beginPath();
        ctx.ellipse(px + Math.cos(a) * r * 0.86, py + Math.sin(a) * r * 0.5, r * 0.44, r * 0.2, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(20,38,18,0.55)';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(px, py, r * 0.96, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function drawReedCover(bx, by, X, Y, t, tx, ty) {
    const C = COVER.reeds;
    ctx.globalAlpha = 0.7;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const h1 = ctHash(tx, ty, 840 + i), h2 = ctHash(tx, ty, 870 + i);
      const px = X + 6 + h1 * (TILE - 12);
      const h = TILE * (0.30 + h2 * 0.30);
      const sway = Math.sin(t * 1.05 + i * 1.31 + tx * 0.7) * 2.1;
      const by0 = Y + TILE - 2;
      ctx.strokeStyle = i % 3 === 0 ? C.stalk2 : C.stalk;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(px, by0);
      ctx.quadraticCurveTo(px + sway * 0.35, by0 - h * 0.58, px + sway, by0 - h);
      ctx.stroke();
      /* 이삭 */
      ctx.fillStyle = i % 4 === 0 ? C.head2 : C.head;
      ctx.beginPath();
      ctx.ellipse(px + sway, by0 - h, 2.1, 4.8, sway * 0.1, 0, Math.PI * 2);
      ctx.fill();
      /* 잎 */
      if (i % 2 === 0) {
        ctx.strokeStyle = C.dry;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(px, by0 - h * 0.4);
        ctx.quadraticCurveTo(px + (i % 4 ? 7 : -7), by0 - h * 0.55, px + (i % 4 ? 11 : -11), by0 - h * 0.78);
        ctx.stroke();
      }
    }
  }
  function drawHideCover(u, bx, by) {
    const ux = u.rx == null ? u.x : u.rx, uy = u.ry == null ? u.y : u.ry;
    const tx = Math.round(ux), ty = Math.round(uy);
    const kind = coverAt(tx, ty);
    if (!kind) return;
    const X = tx * TILE, Y = ty * TILE;
    const t = performance.now() / 1000;
    ctx.save();
    /* 앞쪽(아래)만 — 유닛 얼굴·어깨는 가리지 않는다 */
    ctx.beginPath();
    ctx.rect(X - 6, Y + TILE * 0.34, TILE + 12, TILE * 0.72);
    ctx.clip();
    if (kind === 'forest') drawLeafCover(bx, by, X, Y, t, tx, ty);
    else drawReedCover(bx, by, X, Y, t, tx, ty);
    ctx.restore();
  }

  /* v6.1 — 격자선: 평소에는 아주 은은하게(눈금이 지형을 방해하지 않게) 깔고,
     이동 가능 범위(파랑)·사거리(빨강) 하이라이트가 켜질 때만 또렷하게 강조한다. */
  function gridActive() {
    if (!B || !B.sel || !B.sel.alive) return false;
    if (mode === 'attack' || mode === 'skillTarget' || mode === 'ultTarget') return true;
    const rc = B.reachCache;
    return !!(rc && rc.uid === B.sel.id && rc.set && rc.set.size);
  }
  function drawGrid() {
    const act = gridActive();
    const s = Math.max(0.4, cam.s);
    ctx.save();
    /* ① 어두운 선 — 평소 0.06, 하이라이트 중 0.22 */
    ctx.strokeStyle = `rgba(38,30,18,${act ? 0.22 : 0.062})`;
    ctx.lineWidth = (act ? 1.3 : 1) / s;
    ctx.beginPath();
    for (let i = 0; i <= COLS; i++) { ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, WORLD_H); }
    for (let i = 0; i <= ROWS; i++) { ctx.moveTo(0, i * TILE); ctx.lineTo(WORLD_W, i * TILE); }
    ctx.stroke();
    /* ② 한 픽셀 옆의 밝은 선 — 종이에 눌린 눈금처럼 결이 살아난다 */
    ctx.strokeStyle = `rgba(255,246,214,${act ? 0.16 : 0.05})`;
    ctx.lineWidth = (act ? 1.2 : 0.9) / s;
    ctx.beginPath();
    for (let i = 0; i <= COLS; i++) { const px = i * TILE + 1 / s; ctx.moveTo(px, 0); ctx.lineTo(px, WORLD_H); }
    for (let i = 0; i <= ROWS; i++) { const py = i * TILE + 1 / s; ctx.moveTo(0, py); ctx.lineTo(WORLD_W, py); }
    ctx.stroke();
    // frame
    ctx.strokeStyle = `rgba(30,24,14,${act ? 0.6 : 0.5})`;
    ctx.lineWidth = 3 / s;
    ctx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);
    ctx.restore();
  }

  /* v5.31 — 수전 물결: 물 칸 위에 천천히 흐르는 잔물결 두 줄 (수전·도하에서만, 화면 안 칸만) */
  function drawWaterWaves() {
    /* v5.86b — 커스텀 전장은 칠한 강물 위에서도 물결이 흐르게 한다 */
    if (!B || !ctx) return;
    /* v6.1 — 강물(W)이 있는 전장이면 통이미지·커스텀 모두 물결이 흐른다 */
    if (!B.boatable && !B.customTilesRender && !(B.tiles && B.tiles.some((r) => r.indexOf('W') >= 0))) return;
    const tnow = performance.now();
    const cw = canvas.width / dpr, chh = canvas.height / dpr;
    const x0 = Math.max(0, Math.floor((-cam.x / cam.s) / TILE) - 1);
    const y0 = Math.max(0, Math.floor((-cam.y / cam.s) / TILE) - 1);
    const x1 = Math.min(COLS - 1, Math.ceil((cw - cam.x) / cam.s / TILE) + 1);
    const y1 = Math.min(ROWS - 1, Math.ceil((chh - cam.y) / cam.s / TILE) + 1);
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
          /* v6.1 — 칸마다 물결 높이를 흔들어 가로 줄무늬처럼 보이지 않게 */
          const yy = by + TILE * (0.14 + ctHash(x, y, 1600 + k) * 0.70);
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
    if (SK.isSiegeType(B.type)) {
      const t0 = B.tiles;
      ctx.save();
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
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
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
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
    if (!SK.isSiegeType(B.type) && B.type !== 'fortress') return;
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
    const tower = loadImg(TOWER_SRC);
    const keep = loadImg('assets/battle/hq_pavilion.webp');
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = B.tiles[y][x];
        if (ch === 'T') drawPropTall(tower, x, y, 0.94, 0.96);
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
    /* v5.56 — 이동불가(사기 붕괴): 이번 턴에는 한 칸도 걷지 못한다 */
    if (u.ail && u.ail.root > 0) return 0;
    let m = Number(u.mov) || 0;
    /* v5.31 — 둔화(이동 −1) */
    if (u.slow) m -= 1;
    /* v5.81 — 유연신법 같은 '이동력 +1' 버프 */
    m += Math.max(0, Math.round(buffVal(u, 'move')));
    /* v5.82 — 신속(이동력 +1) · 둔화 계열 필살기의 이동 −N */
    m += Math.min(0, Math.round(buffVal(u, 'moveDown'))) + Math.max(0, Math.round(vpv(u, 'move')));
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
         적 침공군만 문에 막힌다. (예전에는 아군까지 99라 성 안에 갇혔다)
         v5.88 — 공성전에서 성을 지키는 적도 자기 성문을 지난다.
           (예전에는 수비측 적이 안쪽 문으로 물러나지 못해 마당에 갇혀 있었다) */
      const keeper = B && (B.defense ? side === 'ally' : side === 'enemy');
      if (keeper) return 1;
      return 99;
    }
    /* v5.31 — 수전·도하 전장에서는 누구나 조각배를 타고 물을 건넌다 (한 칸 2).
       수적은 배 없이 걷는다(1). 해자(W)뿐인 공성전은 그대로 막힌다. */
    if (ch === 'W') return cls === 'sujeok' ? 1 : ((B && B.boatable) ? 2 : 99);
    if (ch === 'C' || ch === 'H') return 99;
    if (ch === 'M') return (cls === 'sanjeok' || cls === 'yasubyung') ? 1 : (cls === 'gibi' ? 99 : 2);
    if (ch === 'F') return (cls === 'sanjeok' || cls === 'yasubyung') ? 1 : (cls === 'gibi' ? 3 : 2);
    if (ch === 'S') return 2;
    /* v6.0 — 전략 지형 이동 비용 */
    if (ch === 'N') return 99;                       // 목책은 막힌다
    if (ch === 'L' || ch === 'O' || ch === 'Q' || ch === 'Y') return 1;   // 부교·포구·군량고·무기고
    if (ch === 'J') return burningAt(x, y) ? 3 : 2;  // 갈대밭 — 불이 붙으면 더 느리다
    if (ch === 'U') {
      /* 고지대 — 산적·야수병은 능하고, 말탄 기병은 오르는 데 3칸을 쓴다 */
      if (cls === 'sanjeok' || cls === 'yasubyung') return 1;
      return cls === 'gibi' ? 3 : 2;
    }
    return 1;
  }

  /* ══════════ v6.0 — 전략 지형: 갈대밭 연소 · 군량고 · 무기고 ══════════
     · 갈대밭(J)에 화공·불·포격이 닿으면 그 칸이 3턴 동안 탄다(연소).
       불탄 칸 위 부대는 턴마다 화상 피해를 받고, 그 칸으로 걸어가려면 3칸을 쓴다.
     · 군량고(Q)를 차지하면 그 진영 **전 부대**가 최대 병력의 8%를 회복하고,
       상대 진영은 사기 -15.
     · 무기고(Y)를 차지하면 그 진영 전 부대가 공격 +10%(3턴)를 받는다.
     ══════════════════════════════════════════════════════════════ */
  const FIRE_SKILL_KEYS = { hwagye: 1, hwayeom: 1, tuseok: 1, pogyeok: 1, yeonpo: 1 };
  /* 병과 책략은 'c_chaeksa_0' 같은 생성 키를 쓰므로, 이름으로도 불 기술을 알아본다 */
  function isFireSkill(sk) {
    if (!sk) return false;
    if (sk.key && FIRE_SKILL_KEYS[sk.key]) return true;
    return /화계|화염|화공|포격|투석|폭염|불바다|불꽃/.test(sk.name || '');
  }
  const BURN_TURNS = 3;
  function tileAt(x, y) {
    const row = B && B.tiles ? B.tiles[y] : null;
    if (!row || x < 0 || y < 0 || x >= COLS || y >= ROWS) return 'P';
    return row[x] || 'P';
  }
  function fireKey(x, y) { return x + ',' + y; }
  function burningAt(x, y) {
    if (!B || !B.fire) return false;
    const f = B.fire[fireKey(x, y)];
    return !!(f && f.t > 0);
  }
  function burningNear(x, y, r) {
    const rr = r == null ? 1 : r;
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) if (burningAt(x + dx, y + dy)) return true;
    }
    return false;
  }
  /* 한 칸에 불을 붙인다 — 갈대밭이면 그 자리와 바로 옆 갈대밭으로 번진다 */
  function igniteAt(x, y, bySide, depth) {
    if (!B || !B.fire) return false;
    if (tileAt(x, y) !== 'J') return false;
    const k = fireKey(x, y);
    B.fire[k] = { t: Math.max((B.fire[k] && B.fire[k].t) || 0, BURN_TURNS), side: bySide || null };
    addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 760 });
    if ((depth || 0) < 1) {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        if (tileAt(x + dx, y + dy) === 'J' && Math.random() < 0.5) igniteAt(x + dx, y + dy, bySide, (depth || 0) + 1);
      });
    }
    return true;
  }
  /* 화공·불·포격이 적에게 닿았을 때 — 그 적이 선 갈대밭(과 그 주변)에 불이 옮는다 */
  function fireSpreadFrom(a, d, sk, kind) {
    if (!B || !d) return;
    const fire = (kind === 'rock') || isFireSkill(sk);
    if (!fire) return;
    const hit = igniteAt(d.x, d.y, a && a.side);
    if (hit) {
      feed(`갈대밭에 불이 옮었다 — ${d.x},${d.y} 연소 (3턴)`, 'info');
      addFloat((d.x + 0.5) * TILE, (d.y + 0.1) * TILE, '갈대 연소!', '#ffb36a', { back: true });
    }
  }
  function tickFires() {
    if (!B || !B.fire) return;
    Object.keys(B.fire).forEach((k) => {
      const f = B.fire[k];
      if (!f) return;
      f.t -= 1;
      if (f.t <= 0) delete B.fire[k];
    });
  }
  /* ── 1×1 전략 오브젝트(군량고·무기고) ── */
  function makeObjs() {
    const out = [];
    (B.tiles || []).forEach((row, y) => row.forEach((ch, x) => {
      if (ch === 'Q') out.push({ x, y, kind: 'granary', owner: null, name: '군량고' });
      else if (ch === 'Y') out.push({ x, y, kind: 'armory', owner: null, name: '무기고' });
    }));
    return out;
  }
  function objAt(x, y) {
    if (!B || !B.objs) return null;
    return B.objs.find((o) => o.x === x && o.y === y) || null;
  }
  function objValueOf(o, side) {
    if (!o || !side) return 0;
    return o.owner === side ? 0 : (o.kind === 'granary' ? 1 : 0.85);
  }
  /* 군량고·무기고 점령 — 부대가 그 칸에 서면 그 진영 것이 된다 */
  function objPhase() {
    if (!B || !B.objs || B.over) return;
    B.units.forEach((u) => {
      if (!u.alive) return;
      const o = objAt(u.x, u.y);
      if (!o || o.owner === u.side) return;
      o.owner = u.side;
      const mine = u.side === 'ally';
      if (o.kind === 'granary') {
        /* 군량고 — 그 진영 전 부대 병력 8% 회복 · 상대 진영 사기 -15 */
        B.units.forEach((v) => {
          if (!v.alive) return;
          if (v.side === u.side) {
            const hh = Math.max(1, Math.round(v.maxHp * 0.08));
            v.hp = Math.min(v.maxHp, v.hp + hh);
            addHeal(v, hh, u);
            addFloat((rxOf(v) + 0.5) * TILE, (ryOf(v) + 0.34) * TILE, '+' + hh, '#a8f0b8');
          } else {
            moraleShift(v, -15);
          }
        });
        feed(`${u.name} — 군량고 점령! 아군 병력 회복 · 적 사기 −15`, mine ? 'good' : 'bad');
      } else {
        /* 무기고 — 그 진영 전 부대 공격 +10% (3턴) */
        B.units.forEach((v) => {
          if (v.alive && v.side === u.side) v.buffs.atk = { v: 0.10, t: 3 };
        });
        feed(`${u.name} — 무기고 점령! ${mine ? '아군' : '적군'} 전체 공격 +10% (3턴)`, mine ? 'good' : 'bad');
      }
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.15) * TILE, `${o.name} 점령!`, mine ? '#9ef0b8' : '#ffb0a0', { back: true });
      addFx({ kind: 'ring', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 620, color: mine ? '150,240,180' : '255,150,120' });
      SK.sfx.play('ui');
      /* 요격전에서 차지한 보급은 이어지는 공성전까지 이어진다 (battle.js 승리 처리에서 사용) */
      B.objTaken = B.objTaken || {};
      B.objTaken[o.kind] = u.side;
    });
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
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ch = B.tiles[ny][nx];
        const cost = moveCost(u.cls, ch, nx, ny, u.side, u);
        if (cost >= 90) continue;
        if (B.units.some((o) => o.alive && o.x === nx && o.y === ny)) continue;
        if (towerBlockAt(nx, ny)) continue;          // v5.91 — 살아 있는 망루 칸은 지나갈 수 없다
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
        for (let y2 = 0; y2 < ROWS; y2++) {
          for (let x2 = 0; x2 < COLS; x2++) {
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
          for (let y2 = 0; y2 < ROWS; y2++) {
            for (let x2 = 0; x2 < COLS; x2++) {
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
        for (let y2 = 0; y2 < ROWS; y2++) {
          for (let x2 = 0; x2 < COLS; x2++) {
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
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
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
    /* v6.1 — 숲·갈대밭에 선 부대는 발밑에 빈터를 깔아 '나무 위에 뜬' 느낌을 지운다 */
    const hideKind = u.aboard ? null : coverAt(Math.round(ux), Math.round(uy));
    if (hideKind) drawHideGround(hideKind, bx, by);
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
    /* v6.1 — 전경 엄폐(Foreground Cover): 유닛 뒤(위)는 두고 발밑~하반신 위로
       앞쪽 잎·갈대 이삭을 반투명(0.68~0.7)으로 덧그려 숲·갈대에 몸을 숨긴 느낌을 만든다. */
    if (hideKind) drawHideCover(u, bx, by);
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
    /* v5.98 — 부대 선택 힟박스 확장: 스프라이트뿐 아니라 머리 위 병력 숫자·병력 바·병과 배지까지
       탭하면 그 부대가 선택되게, 지금 그린 라벨 영역을 월드 좌표로 적어 둔다.
       (칸 안에 정확히 누르지 못해 선택이 풀리던 답답함 — 사용자 가이드) */
    u._tap = {
      x0: bx - Math.max(bw, pillW) / 2 - 8, x1: bx + Math.max(bw, pillW) / 2 + 8,
      y0: pillY - Math.round(16 * kNum), y1: barY + bh + 6,
    };
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
    if (badge[1] && !veryDense) {
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
  /* v5.98 — 안내 말풍선: 부대/칸 위에 둥근 말풍선 한 줄을 띄운다.
     (빈 타일을 눌렀을 때 "거긴 아무도 없는데?!" 처럼 조작 안내를 숫자와 구분해 보여 준다) */
  function addSay(x, y, text, color) {
    floats.push({ x, y, text, color: color || '#ffeec2', life: 3000, t: 0, say: true });
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
      } else if (f.kind === 'skillfx') {
        /* v5.60 — 병과 책략 속성 이펙트 (독안개·지진·황금 파동·화염+버프 링 …) */
        drawSkillFx(f, p);
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
      /* v5.97 — 난전에서 숫자가 서로 겹치지 않게 부대마다 높이를 조금씩 어긋나게 띄우고
         글자를 조금 줄인다 (17px → 15px). 판독은 아래 부대 카드가 정확한 값을 맡는다. */
      const jit = (((f.x * 7 + f.y * 13) % 5) - 2) * 5;
      const sx = f.x * cam.s + cam.x, sy = f.y * cam.s + cam.y - p * 38 + jit;
      ctx.save();
      /* v5.98 — 말풍선(조작 안내)은 읽을 시간을 준다: 75%까지 그대로 있다가 짧게 사라진다 */
      ctx.globalAlpha = f.say ? (p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.25)) : 1 - p * 0.85;
      /* v5.98 — 말풍선(조작 안내): 숫자와 구분되는 둥근 말풍선 + 작은 꼬리 */
      if (f.say) {
        ctx.font = 'bold 11.5px "Noto Serif CJK KR", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(f.text).width;
        const bw = tw + 18, bh = 20, by2 = sy - p * 6;
        ctx.fillStyle = 'rgba(30,23,12,0.92)';
        ctx.strokeStyle = 'rgba(246,214,120,0.9)';
        ctx.lineWidth = 1.4;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(sx - bw / 2, by2 - bh / 2, bw, bh, 10); ctx.fill(); ctx.stroke(); }
        else { ctx.fillRect(sx - bw / 2, by2 - bh / 2, bw, bh); ctx.strokeRect(sx - bw / 2, by2 - bh / 2, bw, bh); }
        ctx.beginPath();
        ctx.moveTo(sx - 4, by2 + bh / 2 - 1);
        ctx.lineTo(sx, by2 + bh / 2 + 6);
        ctx.lineTo(sx + 4, by2 + bh / 2 - 1);
        ctx.closePath();
        ctx.fillStyle = 'rgba(30,23,12,0.92)';
        ctx.fill();
        ctx.fillStyle = f.color || '#ffeec2';
        ctx.fillText(f.text, sx, by2 + 0.5);
        ctx.restore();
        return;
      }
      /* v5.26 — 고유 특기 이름(「…」)은 숫자보다 작게 그린다. 17px 고정이라 전장 한가운데를 크게 가렸다 */
      const isName = f.text.indexOf('「') >= 0;
      ctx.font = isName ? 'bold 11.5px "Noto Serif CJK KR", serif' : 'bold 15px "Noto Serif CJK KR", serif';
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
    const blocked = (x, y) => B.units.some((o) => o.alive && o !== u && o.x === x && o.y === y) || towerBlockAt(x, y);
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
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
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
     v5.52 — 고퀄 1:1 일기토 미니게임 (사용자 확정 사양) · v5.92 리메이크
     · 이름 있는 장수끼리 근접 교전에서 벌어진다 — 확률은 두 장수의 무력으로 가중(기본 5%, v6.4) (아군이 거는 공격만)
       한 판에 3번까지 · 같은 상대와는 한 번만
     · HP 100 대 100 · 최대 5턴
     · v5.92 — 보물 포함 무력(totalWar = 장수 무력 + 장착 보물 무력) 구간별로 커맨드가 열린다
       ~59 강공 / 60~69 +속공 / 70~79 +방어 / 80~89 +간파 / 90~99 +반격 / 100+ 장수 고유 초필살기(황금 슬롯 · 한 판 1회)
       ⚔️강공 → 💨속공·👁️간파 / 💨속공 → 👁️간파·💥반격 / 🛡️방어 → ⚔️강공·💨속공(지면 피해 50% 반감)
       👁️간파 → 🛡️방어·🔥초필살기 / 💥반격 → ⚔️강공(유인 150%) / 🔥초필살기 → 나머지 전부(간파에만 진다)
     · 무장은 무력, 문관(책사·도사·풍수·무희·군악)은 지력으로 공격하고, 통솔로 피해를 덜어낸다
     · 승리 = 사기 +18 + 본대 병력 10% 회복 · 패배 = 10% 붕괴(생포) / 90% 사기 −22
     · 빨리 감기 ×3·×4나 자동전투에서는 연출과 진행이 함께 짧아진다
     ══════════════════════════════════════════════════════════════ */
  /* v5.53 — 일기토 발동 확률은 '두 장수의 무력'에 따라 달라진다 (사용자: "무력이 높을수록 일기토 확률 가중치").
     v6.4 — 기본값을 2.5% → **5%**로 올리고 상한도 7% → 9%로 넓혔다 (사용자: "본편 1:1 일기토 확률 5%로 상향").
     · 기본 5% + (두 무력 평균 − 50) × 0.08%p, 4.5%~9%로 자른다.
       보통 장수끼리(무력 50 안팎)는 정확히 5%대, 관우·여포·장비 같은 고무력 맞대결 ≈ 7~9%, 낮은 무력끼리는 4.5%.
     · duelRate 는 검수용 고정값 — null 이면 무력 가중치를 쓴다. */
  const DUEL_RATE_BASE = 0.05;
  let duelRate = null;   // 검수에서 고정 확률을 넣을 때만 쓴다
  function duelChance(a, d) {
    if (duelRate != null) return duelRate;
    const avg = ((Number(a && a.wu) || 50) + (Number(d && d.wu) || 50)) / 2;
    return clamp(DUEL_RATE_BASE + (avg - 50) * 0.0008, 0.045, 0.09);
  }
  const DUEL_TURNS = 5;
  const DUEL_MAX_HP = 100;
  /* 문관 계열 — 공격에 지력을 쓴다 */
  const DUEL_INT_CLS = { chaeksa: 1, pungsusa: 1, dosa: 1, muhui: 1, gunakdae: 1 };
  /* v5.92 — 무력 구간별 해금. req = 그 커맨드가 열리는 totalWar */
  const DUEL_MOVES = [
    { k: 'strike', ico: '⚔️', name: '강공', fx: '황금 대참격', beats: ['speed', 'read'], short: '속공·간파 승', req: 0, mul: 1 },
    { k: 'speed', ico: '💨', name: '속공', fx: '청록 연참', beats: ['read', 'parry'], short: '간파·반격 승', req: 60, mul: 1 },
    { k: 'guard', ico: '🛡️', name: '방어', fx: '금빛 파동', beats: ['strike', 'speed'], short: '강공·속공 승 · 피해 반감', req: 70, mul: 1, guard: 1 },
    { k: 'read', ico: '👁️', name: '간파', fx: '보라 역습', beats: ['guard', 'ult'], short: '방어·필살 격파', req: 80, mul: 1.15 },
    { k: 'parry', ico: '💥', name: '반격', fx: '진홍 반격', beats: ['strike'], short: '강공 유인 150%', req: 90, mul: 1.5 },
  ];
  /* 100+ 무쌍 전용 — 장수 고유 초필살기 (황금빛 전용 슬롯 · 절대 위력 · 한 판에 1번) */
  const DUEL_ULT = { k: 'ult', ico: '🔥', name: '초필살기', fx: '화염 폭발',
    beats: ['strike', 'speed', 'guard', 'parry'], short: '절대 위력', req: 100, mul: 1.8, once: 1 };
  const DUEL_MOVE_BY = {};
  DUEL_MOVES.concat([DUEL_ULT]).forEach((m) => { DUEL_MOVE_BY[m.k] = m; });
  /* 수 아이콘 — 어떤 폰에서도 같은 모양이 나오게 이모지 대신 SVG로 그린다 */
  const DUEL_ICONS = {
    strike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l13 13"/><path d="M4 4v3.4M4 4h3.4"/><path d="M20 4L7 17"/><path d="M20 4v3.4M20 4h-3.4"/><path d="M15.6 18.4L18.4 21.6M8.4 18.4L5.6 21.6" stroke-width="2"/></svg>',
    speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 7h11.5a3.2 3.2 0 100-6.4"/><path d="M3 12h14.5"/><path d="M3 17h9.5a3 3 0 110 6"/></svg>',
    read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M2.4 12S6.4 5.6 12 5.6 21.6 12 21.6 12 17.6 18.4 12 18.4 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="3.1" fill="currentColor" stroke="none"/></svg>',
    kill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.6 2c.4 3.2 2.3 4.3 3.6 6.4 1.6 2.6 2.4 4.2 2.4 6.6a6.6 6.6 0 11-13.2 0c0-2 .8-3.3 2-4.8.5 1.3 1.1 2 2.1 2.7-.3-2.4.4-5.4 3.1-7.6-.4 2 .3 3 1.2 3.7.3-2 .1-4.3-1.2-7z"/></svg>',
    parry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 18.2a8.4 8.4 0 0112.9-10.6"/><path d="M19.4 3.6v4.3h-4.3"/><path d="M20.6 5.8L16.3 10.1"/><path d="M4 19.6l5-5.1"/><path d="M6.2 16.9l1.4 1.4"/></svg>',
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
    /* v5.92 — 반격: 진홍 낙하산 겸 되받아치기 (강공을 유인해 150%로 돌려준다) */
    parry: `<svg viewBox="0 0 200 200" aria-hidden="true">
      <defs><radialGradient id="dvCrim" cx="50%" cy="50%" r="52%">
        <stop offset="0%" stop-color="#fff0e6" stop-opacity="0.95"/><stop offset="46%" stop-color="#ff6b48" stop-opacity="0.62"/><stop offset="100%" stop-color="#6d0d05" stop-opacity="0"/></radialGradient></defs>
      <circle cx="100" cy="100" r="76" fill="url(#dvCrim)"/>
      <path class="dv-par" d="M162,42 A86,86 0 1 0 178,124" fill="none" stroke="#fff2e4" stroke-width="7" stroke-linecap="round"/>
      <path d="M150,26 L176,40 L154,62 Z" fill="#fff6ea" stroke="#ff9a5a" stroke-width="3"/>
      <path d="M30,164 Q86,120 118,74 Q96,132 46,182 Z" fill="#ffd8c2" opacity="0.9"/>
      <circle cx="70" cy="66" r="5" fill="#ffe2cc"/><circle cx="140" cy="150" r="5.5" fill="#ffb090"/>
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
  /* v5.84 — 일기토 대사: S·A급은 장수별 코믹·귀여운 대사 사전(js/patch_v584.js)을 쓴다.
     개전(open) · 격돌(clash) · 피격(hit) · 승리(win) · 패배(lose) 다섯 순간으로 옮긴다.
     v5.98 — 격돌에서 밀린 순간은 '피격'으로 보내 "아야! 내 꼬까옷…" 공통 대사가 나간다. */
  const V584_DUEL_PHASE = { start: 'open', clashWin: 'clash', clashLose: 'hit', victory: 'win', defeat: 'lose', collapse: 'lose' };
  /* 병과 키 → 대사 폴백 풀이 알아보는 계열 이름 */
  const V584_FAM = {
    gunwoong: 'lord', gibi: 'cav', gunggi: 'archer', gungsu: 'archer', changbyung: 'spear',
    geombyung: 'sword', sanjeok: 'sword', sujeok: 'sword', chaeksa: 'mage', pungsusa: 'mage',
    dosa: 'mage', mudoga: 'martial', yasubyung: 'beast', muhui: 'support', gunakdae: 'support',
    yeonnobyung: 'crossbow', deunggabyung: 'shield', pocha: 'crossbow', balseokcha: 'crossbow',
  };
  function v584Esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  }
  /* 명부에서 그 장수의 병과·능력치 (대사 폴백·MVP 한마디에 쓴다) */
  function v584WhoOf(name) {
    const h = ((SK.state && SK.state.heroes) || []).find((x) => x && x.name === name);
    const g = (SK.GEN_BY_NAME && SK.GEN_BY_NAME[name]) || null;
    const cls = (h && h.cls) || (g && SK.genClass(g)) || '';
    return { name: name, cls: V584_FAM[cls] || '',
      war: (h && h.wu) || (g && g.war), int: (h && h.ji) || (g && g.intel) };
  }
  /* 부대의 장수 등급 — 아군은 장수 원본 등급, 적군은 명부 등급을 먼저 본다 */
  function genGradeOf(u) {
    if (!u) return '';
    if (u.side === 'ally') { const h = giHero(u); if (h && h.tier) return h.tier; }
    const g = SK.GEN_BY_NAME && SK.GEN_BY_NAME[u.name];
    return (g && g.tier) || u.tier || '';
  }
  function v584DuelLine(u, moment) {
    const P = (typeof window !== 'undefined') ? window.V584 : null;
    if (!P || !P.duelLine || !u) return '';
    const who = { name: u.name, cls: V584_FAM[u.cls] || '', war: u.wu, int: u.ji, tong: u.tong };
    try { return P.duelLine(who, V584_DUEL_PHASE[moment] || 'open') || ''; } catch (e) { return ''; }
  }
  function duelTalk(u, moment) {
    if (!u) return '';
    const gr = genGradeOf(u);
    if (gr === 'S' || gr === 'A') {
      const line = v584DuelLine(u, moment);
      if (line) return line;
    }
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
    /* v5.92 — 적 AI도 자기 무력에 해금된 커맨드 중에서만 고른다 (잠긴 수는 쓰지 않는다) */
    const isAi = !!(duel && u === duel.d);
    const deck = duelDeckFor(u);
    const usedUlt = !!(duel && (isAi ? duel.ultD : duel.ultA));
    const pool = deck.cmds.filter((c) => c.unlocked && !(c.k === 'ult' && usedUlt));
    if (!pool.length) return 'strike';
    const war = deck.war.total;
    const pref = DUEL_INT_CLS[u && u.cls] ? ['read', 'guard']
      : (war >= 90 ? ['strike', 'parry'] : ['strike', 'guard', 'speed']);
    const w = pool.map((m) => (m.k === 'ult' ? 1 : (pref.indexOf(m.k) >= 0 ? 1.7 : 1)));
    let total = w.reduce((x, y) => x + y, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i].k; }
    return pool[0].k;
  }
  function duelWarStat(u) {
    if (!u) return { base: 50, bonus: 0, total: 50 };
    /* 부대에 보물 목록이 실려 오는 경우(다른 모드·향후 확장) — 목록의 무력 보너스를 그대로 더한다 */
    if (Array.isArray(u.treasures) && u.treasures.length) {
      const base = Number(u.war != null ? u.war : (u.str != null ? u.str : (u.wu != null ? u.wu : 50)));
      const tb = u.treasures.reduce((s, t) => s + Number((t && (t.war != null ? t.war : (t.statBonus && t.statBonus.war))) || 0), 0);
      const bonus = tb + Number(u.itemWar || 0);
      return { base, bonus, total: base + bonus };
    }
    const h = giHero(u);   // 아군 장수 원본(명부) — 장착 보물도 여기에 있다
    const eqWar = (h && SK.equipBonus) ? Math.round(Number(SK.equipBonus(h).war) || 0) : 0;
    /* 아군 부대의 u.wu 는 이미 (장수 무력 + 장착 보물 무력)이다 — 보너스를 따로 보여 주려고 나눠 둔다 */
    const total0 = Number(u.wu != null ? u.wu : (u.war != null ? u.war : (u.str != null ? u.str : 50)));
    const itemWar = Number(u.itemWar || 0);
    const total = total0 + itemWar;
    const bonus = eqWar + itemWar;
    return { base: Math.max(0, total - bonus), bonus, total };
  }
  /* 무력 구간 → 커맨드 해금 수 (1~5) */
  function duelDiversity(totalWar) {
    if (totalWar >= 90) return 5;
    if (totalWar >= 80) return 4;
    if (totalWar >= 70) return 3;
    if (totalWar >= 60) return 2;
    return 1;
  }
  /* 장수 고유 초필살기 이름 — SK.ULTIMATES 의 기술명 → 기존 이름 → '초필살기' */
  function duelUltName(u) {
    const s = (u && SK.ULTIMATES) ? SK.ULTIMATES[u.name] : null;
    return (s && (s.skill || s.n)) || '초필살기';
  }
  /* 이 장수가 지금 쓸 수 있는 커맨드 덱 — 잠긴 수는 unlocked:false 로 남긴다 */
  function duelDeckFor(u) {
    const war = duelWarStat(u);
    const level = duelDiversity(war.total);
    const cmds = DUEL_MOVES.map((m) => Object.assign({}, m, {
      unlocked: war.total >= m.req, label: war.total >= m.req ? m.name : `🔒 무${m.req}`,
    }));
    const hasUlt = war.total >= 100;
    cmds.push(Object.assign({}, DUEL_ULT, {
      unlocked: hasUlt, ultName: duelUltName(u),
      label: hasUlt ? duelUltName(u) : '🔒 무100',
      short: hasUlt ? duelUltName(u) : '무력 100 필요',
    }));
    return { war, level, cmds, hasUlt };
  }
  function duelMoveLabel(u, k) {
    return k === 'ult' ? duelUltName(u) : ((DUEL_MOVE_BY[k] || {}).name || k);
  }
  /* 커맨드 카드·다양성 도트·무력 표시를 그 장수의 덱으로 다시 그린다 */
  function renderDuelDeck() {
    if (!duel || !duelEls || !duel.deckA) return;
    const e = duelEls, deck = duel.deckA;
    e.cmds.innerHTML = deck.cmds.map((c) => {
      const usedUp = c.k === 'ult' && !!duel.ultA;
      const locked = !c.unlocked || usedUp;
      const cls = `duel-cmd${locked ? ' locked' : ''}${c.k === 'ult' ? ' ult' : ''}`;
      const nm = c.k === 'ult' ? '초필살기' : c.name;
      const sub = c.k === 'ult'
        ? (usedUp ? '사용 완료' : (c.unlocked ? `${c.ultName || '초필살기'} · 1회` : `🔒 무${c.req}`))
        : (c.unlocked ? c.short : `🔒 무${c.req}`);
      return `<button type="button" class="${cls}" data-k="${c.k}"${locked ? ' disabled aria-disabled="true"' : ''}>`
        + `<span class="dcmd-ico">${DUEL_ICONS[c.k] || (c.k === 'ult' ? DUEL_ICONS.kill : '')}</span><b>${nm}</b><span class="dcmd-rule">${sub}</span></button>`;
    }).join('');
    e.cmds.querySelectorAll('.duel-cmd').forEach((b) => { b.onclick = () => duelPick(b.dataset.k); });
    /* 지금 고른 수는 다시 그린 뒤에도 금테 표시를 남긴다 */
    if (duel.last && duel.busy) {
      e.cmds.querySelectorAll('.duel-cmd').forEach((b) => b.classList.toggle('on', b.dataset.k === duel.last.player));
    }
    if (e.dots) {
      e.dots.innerHTML = deck.cmds.map((c) => `<i class="dot${c.k === 'ult' ? ' ult' : ''}${c.unlocked ? ' on' : ''}"></i>`).join('');
      e.dots.title = `공격 다양성 ${deck.level}/5${deck.hasUlt ? ' + 초필살기' : ''}`;
    }
    if (e.war) {
      e.war.textContent = `무 ${Math.round(deck.war.total)}${deck.war.bonus ? ` (보물 +${deck.war.bonus})` : ''}`;
      e.war.classList.toggle('peak', deck.hasUlt);
      e.war.title = `장수 무력 ${Math.round(deck.war.base)}${deck.war.bonus ? ` + 보물 ${deck.war.bonus}` : ''}`;
    }
    if (e.deckTxt) {
      const n = deck.cmds.filter((c) => c.k !== 'ult' && c.unlocked).length;
      e.deckTxt.textContent = `커맨드 ${n}/5${deck.hasUlt ? ' +초필살기' : ''}`;
    }
  }

  /* 일기토 연출 시계 — 전투 배속이 빠르면 연출도 함께 짧아진다 */
  let duelFast = false;   // QA 전용: 연출 없이 즉시 진행
  let duelSlow = 1;       // QA 전용: 연출을 늘려 프레임을 붙잡는다 (기본 1 — 게임에는 영향 없음)
  /* v6.4 — 일기토 연출 타이머는 전부 여기 모아 두었다가 종료·닫기에서 한 번에 정리한다
     (닫힌 뒤에 늦게 도착한 콜백이 사라진 노드를 건드리지 않게) */
  let duelTimers = [];
  function dtimer(fn, ms) {
    const id = setTimeout(function () {
      duelTimers = duelTimers.filter((t) => t !== id);
      fn();
    }, Math.max(0, Math.round(ms || 0)));
    duelTimers.push(id);
    return id;
  }
  function duelClearTimers() {
    duelTimers.forEach((t) => clearTimeout(t));
    duelTimers = [];
  }
  /* 배속 연동 — CSS 모션 길이(--dsp)와 dwait 지연이 같은 비율로 줄어든다 */
  function dsp() {
    if (duelFast) return 0.12;
    const sp = autoSpeed || 1;
    const base = sp >= 3 ? 0.55 : (sp === 2 ? 0.75 : 1);
    return base * (duelSlow > 0 ? duelSlow : 1);
  }
  function dwait(fn, ms) {
    if (duelFast) return dtimer(fn, 0);
    return dtimer(fn, Math.max(90, Math.round(ms * dsp())));
  }

  function ensureDuelDom() {
    if (duelEls && document.body.contains(duelEls.root)) return duelEls;
    try { const pre = new Image(); pre.src = 'assets/duel_arena_bg.webp?v=131'; } catch (e) { /* ignore */ }
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
        <div class="duel-hint" id="duel-hint">
          <span class="dh-war" id="duel-war">무 50</span>
          <span class="div-dots" id="duel-dots" aria-hidden="true"></span>
          <span class="dh-txt" id="duel-deck">커맨드 1/5</span>
        </div>
        <div class="duel-cmds" id="duel-cmds"></div>
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
      wrapA: q('.duel-sprite.ally'), wrapD: q('.duel-sprite.enemy'),
      bubA: q('#duel-bub-a'), bubD: q('#duel-bub-d'),
      fx: q('#duel-fx'), dmgA: q('#duel-dmg-a'), dmgD: q('#duel-dmg-d'),
      cmds: q('#duel-cmds'), dots: q('#duel-dots'), war: q('#duel-war'), deckTxt: q('#duel-deck'),
    };
    /* 커맨드 카드는 일기토를 열 때 그 장수의 무력에 맞춰 다시 그린다 (renderDuelDeck) */
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
    /* v5.92 — 초필살기는 기존 '필살' 화염 연출(fx-kill)을 그대로 쓴다 */
    if (mk === 'ult') mk = 'kill';
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

  /* ══════════════════════════════════════════════════════════════
     v6.4 — 일기토 전투 연출 (원정 v6.3 전투씬의 호흡을 무대에 옮긴다)
     · 예비동작(뒤로 젖힘) → 돌진(잔상·발밑 흙먼지) → 접촉 순간의
       반달 칼바람 + 스파크 + (강타·초필살기) 임팩트 링 + 화면 흔들림
     · 피격 넉백(스프링 복귀) + 히트 플래시 · 패배는 그자리에서 기울며 쓰러짐
     · 모션 길이는 모두 --dsp(전투 배속)를 공유하고, 타이머는 duelTimers로 모아 정리한다
     ══════════════════════════════════════════════════════════════ */
  let duelPoseOf = { a: '', d: '' };
  function duelWrapEl(side) { return duelEls ? (side === 'a' ? duelEls.wrapA : duelEls.wrapD) : null; }
  /* 자세는 한 번에 하나만 — 새 모션을 걸기 전에 이전 모션 클래스를 전부 벗긴다 */
  function duelMotion(side, cls, ms) {
    const w = duelWrapEl(side);
    if (!w) return;
    w.classList.remove('mo-wind', 'mo-charge', 'mo-hit', 'mo-fall', 'mo-win');
    duelPoseOf[side] = cls || '';
    if (!cls) return;
    if (duelEls && duelEls.stage) duelEls.stage.style.setProperty('--dsp', dsp());
    void w.offsetWidth;
    w.classList.add(cls);
    if (ms) {
      dtimer(() => {
        if (duelPoseOf[side] === cls) { w.classList.remove(cls); duelPoseOf[side] = ''; }
      }, ms);
    }
  }
  /* 무대 기준 좌표 — 스프라이트 그림의 가운데(가슴 높이) */
  function duelSpotOf(side) {
    const img = side === 'a' ? duelEls.spA : duelEls.spD;
    const stage = duelEls.stage;
    const r = img.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height * 0.46, w: r.width, h: r.height };
  }
  function duelFxNode(cls, x, y) {
    if (!duelEls || !duelEls.fx) return null;
    const n = document.createElement('div');
    n.className = 'duel-fx-item ' + cls;
    n.style.left = x.toFixed(1) + 'px';
    n.style.top = y.toFixed(1) + 'px';
    duelEls.fx.appendChild(n);
    return n;
  }
  /* 돌진 잔상 — 지금 화면에 그려진 스프라이트를 그 자리에 복사해 흐려진다 */
  function duelGhost(side) {
    if (!duelEls) return;
    const img = side === 'a' ? duelEls.spA : duelEls.spD;
    const stage = duelEls.stage;
    if (!img || !stage || !img.src) return;
    const r = img.getBoundingClientRect(), s = stage.getBoundingClientRect();
    if (!r.width || !s.width) return;
    const g = document.createElement('img');
    g.className = 'duel-ghost' + (side === 'a' ? ' ally' : ' enemy');
    g.src = img.src;
    g.alt = '';
    g.style.left = (r.left - s.left).toFixed(1) + 'px';
    g.style.top = (r.top - s.top).toFixed(1) + 'px';
    g.style.width = r.width.toFixed(1) + 'px';
    g.style.height = r.height.toFixed(1) + 'px';
    stage.appendChild(g);
    dtimer(() => { if (g.parentNode) g.parentNode.removeChild(g); }, Math.round(360 * dsp()));
  }
  /* 맞은 쪽 히트 플래시 */
  function duelFlash(side, heavy) {
    const w = duelWrapEl(side);
    if (!w) return;
    w.classList.remove('hitflash');
    void w.offsetWidth;
    w.classList.add('hitflash');
    dtimer(() => w.classList.remove('hitflash'), Math.round((heavy ? 760 : 600) * dsp()));
  }
  /* 접촉 연출 — 반달 칼바람 + 스파크 (+ 강타는 임팩트 링 · 수별 큰 그림) */
  function duelStrikeFx(atkSide, defSide, moveK, heavy) {
    if (!duelEls) return;
    const A = duelSpotOf(atkSide), D = duelSpotOf(defSide);
    const dx = D.x - A.x, dy = D.y - A.y;
    const ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
    const ix = A.x + dx * 0.64, iy = A.y + dy * 0.64;
    const arc = duelFxNode('arc' + (heavy ? ' big' : ''), ix, iy);
    if (arc) {
      arc.style.setProperty('--a', ang + 'deg');
      dtimer(() => { if (arc.parentNode) arc.parentNode.removeChild(arc); }, Math.round(520 * dsp()));
    }
    const sp = duelFxNode('spark' + (heavy ? ' big' : ''), ix, iy);
    if (sp) dtimer(() => { if (sp.parentNode) sp.parentNode.removeChild(sp); }, Math.round(480 * dsp()));
    if (heavy) {
      const rg = duelFxNode('ring', ix, iy);
      if (rg) dtimer(() => { if (rg.parentNode) rg.parentNode.removeChild(rg); }, Math.round(560 * dsp()));
    }
    /* 수별 큰 그림은 초필살기(화염)·반격(진홍)·방어(금빛)만 남긴다 */
    if (moveK === 'ult' || moveK === 'parry' || moveK === 'guard') duelFxAt(defSide, moveK);
  }
  function duelHitReaction(defSide, dmg, heavy) {
    duelPop(defSide, dmg);
    duelFlash(defSide, heavy);
    duelMotion(defSide, 'mo-hit', Math.round(560 * dsp()));
    duelShake(heavy);
    shakeScreen(heavy ? 8 : 6);
  }
  /* 돌진 → 접촉 연출 → 피해 반영(onImpact) — 한 수의 타임라인 */
  function duelStrike(atkSide, moveK, dmg, onImpact) {
    const heavy = (moveK === 'ult' || moveK === 'parry');
    const defSide = atkSide === 'a' ? 'd' : 'a';
    if (duelEls && duelEls.stage) {
      duelEls.stage.classList.toggle('heavy', heavy);
      duelEls.stage.style.setProperty('--dsp', dsp());
    }
    duelMotion(atkSide, 'mo-charge', Math.round(700 * dsp()));
    dtimer(() => duelGhost(atkSide), Math.round(90 * dsp()));
    dtimer(() => duelGhost(atkSide), Math.round(220 * dsp()));
    const foot = duelSpotOf(atkSide);
    const dust = duelFxNode('dust', foot.x, foot.y + foot.h * 0.42);
    if (dust) {
      dust.style.setProperty('--dx', (atkSide === 'a' ? 30 : -30) + 'px');
      dtimer(() => { if (dust.parentNode) dust.parentNode.removeChild(dust); }, Math.round(640 * dsp()));
    }
    dwait(() => {
      if (!duel || duel.over) return;
      duelStrikeFx(atkSide, defSide, moveK, heavy);
      duelHitReaction(defSide, dmg, heavy);
      if (onImpact) onImpact();
    }, 330);
  }

  /* 일어날 수 있는 일기토인가 — 무력 가중 확률(기본 5% · 4.5~9%) · 이름 있는 장수 · 서로 다른 편 · 한 판 3번까지 */
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
      /* v5.92 — 두 장수의 무력 덱(해금 커맨드) · 초필살기 사용 여부 */
      deckA: duelDeckFor(a), deckD: duelDeckFor(d), ultA: false, ultD: false,
      bond: SK.bondBetween ? SK.bondBetween(a.name, d.name) : null,
    };
    const e = els;
    /* v6.4 — 지난 일기토가 남긴 모션 클래스·잔상·타이머를 먼저 걷어낸다 */
    duelClearTimers();
    duelPoseOf = { a: '', d: '' };
    [e.wrapA, e.wrapD].forEach((w) => {
      if (w) w.classList.remove('mo-wind', 'mo-charge', 'mo-hit', 'mo-fall', 'mo-win', 'hitflash');
    });
    e.stage.classList.remove('hit', 'hit-strong', 'heavy');
    e.stage.style.setProperty('--dsp', dsp());
    e.stage.querySelectorAll('.duel-ghost').forEach((n) => n.remove());
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
    renderDuelDeck();
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
    /* v5.92 — 잠긴 커맨드는 눌리지 않고, 초필살기는 한 판에 한 번만 */
    const cmd = (duel.deckA && duel.deckA.cmds) ? duel.deckA.cmds.filter((c) => c.k === k)[0] : null;
    if (!cmd || !cmd.unlocked) return false;
    if (k === 'ult' && duel.ultA) return false;
    if (k === 'ult') duel.ultA = true;
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
    if (aiK === 'ult') duel.ultD = true;          // v5.92 — 적의 초필살기도 한 판 1회
    const labA = duelMoveLabel(a, playerK), labD = duelMoveLabel(d, aiK);
    duel.last = { player: playerK, ai: aiK };
    duel.log = duel.log || [];
    duel.log.push({ turn: duel.turn, player: playerK, ai: aiK });
    if (playerK === 'ult' || aiK === 'ult') renderDuelDeck();   // 다 쓴 초필살기 슬롯을 바로 잠근다
    setDuelBanner(`${a.name} [${labA}]`, `${d.name} [${labD}]`, '···');
    const aWins = A.beats.indexOf(aiK) >= 0;
    const dWins = D.beats.indexOf(playerK) >= 0;
    /* v5.92 — 상성·특징을 피해에 그대로 반영한다
       · 반격이 강공을 유인하면 150% · 초필살기는 절대 위력(180%) · 간파의 격파 115%
       · 지고도 방어를 들었으면 피해 50% 반감 */
    const mulOf = (mv, foeMv) => (mv.mul || 1) * (foeMv && foeMv.guard ? 0.5 : 1);
    if (duelEls && duelEls.stage) duelEls.stage.style.setProperty('--dsp', dsp());
    /* ① 예비동작 — 두 장수가 함께 뒤로 젖히며 숨을 고른다 */
    duelMotion('a', 'mo-wind', Math.round(300 * dsp()));
    duelMotion('d', 'mo-wind', Math.round(300 * dsp()));
    dwait(() => {
      if (!duel || duel.over) return;
      if (aWins || dWins) {
        /* ② 이긴 쪽이 돌진해 ③ 접촉과 함께 피해가 들어간다 */
        const side = aWins ? 'a' : 'd';
        const k = aWins ? playerK : aiK;
        const foeK = aWins ? aiK : playerK;
        const mv = aWins ? A : D, foeMv = aWins ? D : A;
        const atkU = aWins ? a : d, defU = aWins ? d : a;
        const dmg = Math.round(duelDamage(atkU, defU) * mulOf(mv, foeMv));
        let line = '';
        if (aWins) {
          if (playerK === 'read' && aiK === 'ult') line = `초필살기를 간파했다! ${labA} — 상대의 절대 위력을 꿰뚫었다!`;
          else if (playerK === 'parry') line = `강공을 유인해 되받아쳤다! ${labA} — 150% 반격!`;
          else if (playerK === 'ult') line = `${labA} — 초필살기! 절대 위력이 ${d.name}을 덮쳤다!`;
          else line = `상성 승리! ${A.fx}이 ${d.name}을 강타했다!`;
        } else {
          if (aiK === 'ult') line = `${labD} — 초필살기! 절대 위력에 ${a.name}이 밀렸다!`;
          else if (aiK === 'parry') line = `${d.name}이 강공을 유인해 150%로 되받아쳤다!`;
          else line = `상성 패배… ${D.fx}이 ${a.name}을 덮쳤다!`;
        }
        if (foeMv.guard) line += ' (방어로 피해 50% 반감)';
        duelStrike(side, k, dmg, () => {
          if (!duel) return;
          if (aWins) {
            duel.hpD = Math.max(0, duel.hpD - dmg);
            showDuelBubble('a', duelTalk(a, 'clashWin'), 1500);
            if (Math.random() < 0.5) showDuelBubble('d', duelTalk(d, 'clashLose'), 1500);
            SK.sfx.play('sword');
          } else {
            duel.hpA = Math.max(0, duel.hpA - dmg);
            showDuelBubble('d', duelTalk(d, 'clashWin'), 1500);
            if (Math.random() < 0.5) showDuelBubble('a', duelTalk(a, 'clashLose'), 1500);
            SK.sfx.play('hit');
          }
          setDuelBanner(`${a.name} [${labA}]`, `${d.name} [${labD}]`, line);
          updateDuelHp();
          dwait(duelNext, 1000);
        });
      } else {
        /* 같은 수 — 두 장수가 동시에 부딪혀 둘 다 물러선다 */
        const c1 = Math.max(4, Math.round(duelDamage(a, d) * 0.42));
        const c2 = Math.max(4, Math.round(duelDamage(d, a) * 0.42));
        duelMotion('a', 'mo-charge', Math.round(700 * dsp()));
        duelMotion('d', 'mo-charge', Math.round(700 * dsp()));
        dwait(() => {
          if (!duel || duel.over) return;
          const A2 = duelSpotOf('a'), D2 = duelSpotOf('d');
          const mx = (A2.x + D2.x) / 2, my = (A2.y + D2.y) / 2;
          const rg = duelFxNode('ring', mx, my);
          if (rg) dtimer(() => { if (rg.parentNode) rg.parentNode.removeChild(rg); }, Math.round(520 * dsp()));
          duelFxAt('a', 'guard');
          duelFxAt('d', 'guard');
          duel.hpA = Math.max(0, duel.hpA - c2);
          duel.hpD = Math.max(0, duel.hpD - c1);
          duelPop('a', c2); duelPop('d', c1);
          duelMotion('a', 'mo-hit', Math.round(560 * dsp()));
          duelMotion('d', 'mo-hit', Math.round(560 * dsp()));
          duelShake(false);
          shakeScreen(4);
          SK.sfx.play('hit');
          setDuelBanner(`${a.name} [${labA}]`, `${d.name} [${labD}]`, `같은 ${labA} — 칼날이 맞부딪혀 양쪽이 물러섰다`);
          updateDuelHp();
          dwait(duelNext, 1000);
        }, 330);
      }
    }, 200);
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
    /* v6.4 — 이긴 쪽은 한 번 뛰어오르고, 진 쪽은 그 자리에서 기울며 쓰러진다 */
    if (winner === 'a' || winner === 'd') {
      duelMotion(winner, 'mo-win', Math.round(820 * dsp()));
      duelMotion(winner === 'a' ? 'd' : 'a', 'mo-fall', 0);
    } else {
      duelMotion('a', 'mo-wind', Math.round(320 * dsp()));
      duelMotion('d', 'mo-wind', Math.round(320 * dsp()));
    }
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
    /* v6.4 — 닫을 때 모션·잔상·이펙트·타이머를 모두 걷어낸다(늦게 도착한 콜백 없음) */
    duelClearTimers();
    duelPoseOf = { a: '', d: '' };
    if (duelEls) {
      const e = duelEls;
      [e.wrapA, e.wrapD].forEach((w) => {
        if (w) w.classList.remove('mo-wind', 'mo-charge', 'mo-hit', 'mo-fall', 'mo-win', 'hitflash');
      });
      [e.bubA, e.bubD, e.dmgA, e.dmgD].forEach((n) => { if (n && n._t) { clearTimeout(n._t); n._t = 0; } });
      if (e.stage) {
        if (e.stage._sh) { clearTimeout(e.stage._sh); e.stage._sh = 0; }
        e.stage.classList.remove('hit', 'hit-strong', 'heavy');
      }
      try { e.fx.innerHTML = ''; } catch (err) { /* ignore */ }
      if (e.stage) e.stage.querySelectorAll('.duel-ghost').forEach((n) => n.remove());
      e.root.classList.add('out');
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
     v5.81 — 병과 고유 패시브 · 장수 고유 특기(fx)를 전투 계산에 붙인다
     · classPassiveOf: 무도가(치명+10·회피+10) · 야수병(숲·산지 치명+15)
     · pasFx: 장수 특기 data/unique_passives.json 의 fx/p (예: lifesteal 25)
     ══════════════════════════════════════════════════════════════ */
  function classPas(u) { return (u && SK.CLASS_PASSIVE && SK.CLASS_PASSIVE[u.cls]) || null; }
  function pasFx(u, fx) {
    const p = u && u.passive;
    return (p && p.fx === fx) ? (Number(p.p) || 0) / 100 : 0;
  }
  /* 실수치(MP +18 같은) — 분수가 아닌 값 */
  function pasP(u, fx) {
    const p = u && u.passive;
    return (p && p.fx === fx) ? (Number(p.p) || 0) : 0;
  }
  /* ══════════════════════════════════════════════════════════════
     v5.82 — 고유 특기 40종 (전투 25 · 하이브리드 5)
     data/unique_passives.json 의 각 장수 항목에 v582(특기 id)·vp(수치)가 실린다.
     아래 헬퍼가 그 수치를 전투 계산 자리마다 읽는다.
       선봉돌격·추격·궁수저격·일기토·복병·철벽수비·공성파괴·혈전·연격·기마돌파·
       위압·지휘·책략간파·독공·화공·사기진작·창벽·쾌검·불굴·급습·신속·군의술·
       책략극대·방진·야습 + 지장·문무겸전·군략가·의장·모사
     ══════════════════════════════════════════════════════════════ */
  function vpid(u) { const p = u && u.passive; return (p && p.v582) || ''; }
  function vpv(u, k) { const p = u && u.passive; const v = p && p.vp; return (v && Number(v[k])) || 0; }
  /* 병과 → 계열 (기마돌파·창벽 판정용) */
  const VP_FAM = { gunwoong: 'lord', changbyung: 'spear', sujeok: 'spear', gibi: 'cav',
    deunggabyung: 'shield', gungsu: 'archer', gunggi: 'archer', yeonnobyung: 'crossbow',
    geombyung: 'sword', mudoga: 'martial', sanjeok: 'martial', yasubyung: 'beast',
    muhui: 'support', gunakdae: 'support', chaeksa: 'mage', pungsusa: 'mage', dosa: 'mage', pocha: 'siege' };
  function famU(u) { return VP_FAM[(u && u.cls) || ''] || 'sword'; }
  function vpCh(u) { return (B && B.tiles && B.tiles[u.y]) ? B.tiles[u.y][u.x] : ''; }
  function vpAdjFoes(u) {
    let n = 0;
    B.units.forEach((o) => { if (o.alive && o.side !== u.side && manh(o.x, o.y, u.x, u.y) <= 1) n += 1; });
    return n;
  }
  function vpAdjAllies(u) {
    let n = 0;
    B.units.forEach((o) => { if (o !== u && o.alive && o.side === u.side && manh(o.x, o.y, u.x, u.y) <= 1) n += 1; });
    return n;
  }
  /* 대상이 바라보는 앞쪽에 선 공격인가 (아니면 옆·뒤 → 급습) */
  function vpFront(a, d) { return d && d.face > 0 ? a.x > d.x : a.x < d.x; }
  /* 인접 아군의 지휘(공·방 +8%) · 군략가(공격 +5%) 오라 */
  function vpAura(u, k) {
    if (!B) return 0;
    let v = 0;
    B.units.forEach((o) => {
      if (!o.alive || o === u || o.side !== u.side || manh(o.x, o.y, u.x, u.y) > 1) return;
      const id = vpid(o);
      if (id === 'command') v += vpv(o, k);
      else if (id === 'h_cmd' && k === 'atk') v += vpv(o, 'atk');
    });
    return v;
  }
  function vpAtkMul(a, d, opts) {
    if (!a || !d) return 1;
    const id = vpid(a);
    const melee = attackKind(a, opts) === 'melee';
    const dist = (opts && opts.dist != null) ? opts.dist : manh(a.x, a.y, d.x, d.y);
    let m = 1;
    switch (id) {
      case 'charge': if (B && B.turn <= 1) m *= 1 + vpv(a, 'atk'); break;
      case 'snipe': if (!melee && dist >= 2) m *= 1 + vpv(a, 'ranged'); break;
      case 'duel': if (melee && vpAdjFoes(a) <= 1) m *= 1 + vpv(a, 'duel'); break;
      case 'bloodlust': if (a.maxHp && a.hp / a.maxHp <= vpv(a, 'hp') / 100) m *= 1 + vpv(a, 'atk'); break;
      case 'breakthrough': if (famU(a) === 'cav' && (a.movedTiles || 0) >= vpv(a, 'minMove')) m *= 1 + vpv(a, 'dash'); break;
      case 'flank': if (melee && !(opts && opts.counterHit) && !vpFront(a, d)) m *= 1 + vpv(a, 'flank'); break;
      case 'spearwall': if (famU(d) === 'cav') m *= 1 + vpv(a, 'cav'); break;
      case 'nightraid': if (d.acted === false) m *= 1 + vpv(a, 'raid'); break;
      case 'h_both': m *= 1 + vpv(a, 'atk'); break;
      case 'unyielding': if (a.vpRage) m *= 1 + vpv(a, 'atk'); break;
    }
    return m * (1 + vpAura(a, 'atk'));
  }
  function vpDefMul(d) {
    const id = vpid(d);
    if (id === 'phalanx' && vpAdjAllies(d) >= 1) return 1 + vpv(d, 'def');
    if (id === 'h_both') return 1 + vpv(d, 'def');
    return 1;
  }
  function vpTakenMul(d) {
    if (!d) return 1;
    return vpid(d) === 'ironwall' ? 1 - vpv(d, 'taken') : 1;
  }
  function vpCritAdd(a, d, melee) {
    let v = 0;
    /* 복병의 숲·산지 치명은 critChanceOf 에서 한 번만 더한다 (예상 창과 동일) */
    if (vpid(a) === 'flank' && d && melee && !vpFront(a, d)) v += vpv(a, 'crit');
    return v;
  }
  function vpEvade(u) {
    if (vpid(u) !== 'ambush') return 0;
    const ch = vpCh(u);
    return (ch === 'F' || ch === 'M') ? vpv(u, 'evade') : 0;
  }
  function vpMagicMul(u, t) {
    let m = 1;
    const iu = vpid(u), it = vpid(t);
    if (iu === 'sorcery' || iu === 'h_strat') m *= 1 + vpv(u, 'magic');
    if (it === 'counterspell' || it === 'h_adv') m *= 1 - vpv(t, 'mtaken');
    /* v5.82 — 세종 「집현전의 지혜」 같은 '계략방어 +N%' 필살기 버프 */
    const md = buffVal(t, 'magicDef');
    if (md > 0) m *= 1 - Math.min(0.6, md);
    return m;
  }
  /* 적중 순간: 독공·화공·위압·쾌검 */
  function vpOnHit(a, d, crit, opts) {
    if (!a || !d || !d.alive || !B || B.over) return;
    if (opts && opts.counterHit) return;
    const id = vpid(a);
    if (!id) return;
    if (id === 'venom' && Math.random() < vpv(a, 'chance')) {
      if (ailApply(d, 'poison', null, vpv(a, 'turns'))) {
        d.ailDot = d.ailDot || {};
        d.ailDot.poison = Math.max(vpv(a, 'dot'), d.ailDot.poison || 0);
      }
    }
    if (id === 'pyro' && Math.random() < vpv(a, 'chance')) {
      if (ailApply(d, 'burn', null, vpv(a, 'turns'))) {
        d.ailDot = d.ailDot || {};
        d.ailDot.burn = Math.max(vpv(a, 'dot'), d.ailDot.burn || 0);
      }
    }
    if (id === 'awe' && d.alive) {
      moraleShift(d, -vpv(a, 'morale') * (crit ? 2 : 1));
      addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.18) * TILE, '위압!', '#ffcf8a');
    }
    if (id === 'swiftblade') {
      a.buffs.evade = { v: Math.max(vpv(a, 'evade'), (a.buffs.evade && a.buffs.evade.t > 0 && a.buffs.evade.v) || 0), t: 1 };
    }
  }
  /* 턴 시작: 사기진작(MP·아군 사기) · 군의술·의장(치유) */
  function vpTurnStart(u) {
    if (!B || !u || !u.alive) return;
    const id = vpid(u);
    if (!id) return;
    if (id === 'morale') {
      u.mp = Math.min(u.maxMp, u.mp + vpv(u, 'mp'));
      B.units.forEach((o) => {
        if (o.alive && o.side === u.side && manh(o.x, o.y, u.x, u.y) <= 1) moraleShift(o, vpv(u, 'morale'));
      });
    }
    if (id === 'medic' || id === 'h_sage') {
      /* 한 전투 4회까지만 — 매 턴 무제한 회복으로 좀비 판이 되지 않게 */
      u.vpHealN = u.vpHealN || 0;
      if (u.vpHealN >= 4) return;
      u.vpHealN += 1;
      const selfP = vpv(u, 'self'), allyP = vpv(u, 'ally');
      B.units.forEach((o) => {
        if (!o.alive || o.side !== u.side) return;
        if (o !== u && manh(o.x, o.y, u.x, u.y) > 1) return;
        const p = o === u ? selfP : allyP;
        if (!p || o.hp >= o.maxHp) return;
        const hl = Math.max(1, Math.round(o.maxHp * p));
        o.hp = Math.min(o.maxHp, o.hp + hl);
        addHeal(o, hl, u);
        addFloat((rxOf(o) + 0.5) * TILE, (ryOf(o) + 0.3) * TILE, '+' + hl, '#a8f0b8');
        addFx({ kind: 'heal', x: (rxOf(o) + 0.5) * TILE, y: (ryOf(o) + 0.5) * TILE, life: 520 });
      });
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.08) * TILE, `「${(u.passive && u.passive.title) || '군의술'}」`, '#9ef0b8', { back: true });
    }
  }
  function classCrit(u) {
    const c = classPas(u);
    if (!c) return 0;
    let v = c.crit || 0;
    if (c.ambushCrit) {
      const ch = B && B.tiles && B.tiles[u.y] ? B.tiles[u.y][u.x] : '';
      if (ch === 'F' || ch === 'M') v += c.ambushCrit;
    }
    return v;
  }
  function classEva(u) { const c = classPas(u); return (c && c.eva) || 0; }

  /* ══════════════════════════════════════════════════════════════
     v5.31 — 사기(morale)와 상태이상(ailment)
     · 사기: v5.56 — 양쪽 모두 80에서 시작. 80 이상은 100% 전투력(과다 보너스 없음),
       80 아래로 떨어질수록 공격·방어가 함께 완만하게 약해진다(60 −5% · 40 −10% · 20 −15% · 0 −20%).
       큰 타격·전우 전사(3칸 안 −8 · 그 밖 −4)로 떨어지고, 턴마다 2(50 미만이면 3)씩 회복된다.
       **20 이하로 떨어지면 그 자리에서 사기 붕괴** — 기절·혼란·중독·이동불가 중 하나 + 사기 50 복귀.
       (v5.32의 사기 하한 25는 폐지 — 붕괴가 그 역할을 대신한다)
     · 상태이상: 기절(이번 턴 행동 불가) · 혼란(아군·적을 가리지 않고 가까운 부대 공격) ·
       위축(공격 −20%) · 중독·화상(턴마다 병력 감소) · 둔화(이동 −1) · 이동불가(사기 붕괴, 이동 0)
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
    /* v5.56 — 사기 붕괴 전용: 이동불가 (그 턴 움직이지 못하고 제자리에서 싸운다) */
    root:    { n: '이동불가', c: '226,196,140', t: 2 },
  };
  SK.BATTLE_AIL = AIL;
  /* v5.56 — 사기 기준점. 양쪽 모두 80에서 시작하고, 80 이상은 정직하게 100% 전투력 */
  const MORALE_BASE = 80;
  const MORALE_LOW = 20;         // 이 아래로 떨어지면 붕괴(상태이상 + 50 복귀)
  function initStatus(u) {
    const f = u.tfx || {};
    u.moraleMax = 100 + Math.max(0, Math.round(f.moraleMax || 0));
    u.morale = Math.min(u.moraleMax, MORALE_BASE + Math.max(0, Math.round(f.morale || 0)));
    u.ail = {};
    /* v5.32 — 같은 상태이상이 거듭 걸릴수록 저항이 붙는다(ailRes) · 기절에서 깬 직후 면역(stunCd) */
    u.ailRes = {};
    u.stunCd = 0;
    u.slow = 0;
    u.aboard = false;
  }
  /* v5.56 — 사기 → 전투력. 80이 기준(100%). 80 위로는 더 세지지 않고(과다 보너스 없음),
     80 아래로 떨어질수록 공·방이 함께 완만하게 약해진다.
     60 → −5% · 40 → −10% · 20 → −15% · 0 → −20% */
  function moraleMul(u) {
    const m = (u && u.morale != null) ? u.morale : MORALE_BASE;
    if (m >= MORALE_BASE) return 1;
    return Math.max(0.8, 1 - (MORALE_BASE - m) * 0.0025);
  }
  /* v5.56 — 훈련도 → 전투력. 50이 기준(100%)이고 50을 중심으로 **연속 비례**한다.
     (훈련도를 항상 100으로 맞출 수 없으니 중간값도 차등으로 힘을 낸다)
     50 → 1.00 · 60 +2.4% · 75 +6.0% · 90 +9.6% · 100 +12.0% · 25 −5.0% · 0 −10.0% */
  function trainValOf(u) {
    if (!u) return 50;
    if (u.train != null) return clamp(Number(u.train) || 0, 0, 100);
    return trainOf(u.lv, u.tier);
  }
  function trainMul(u) {
    const t = trainValOf(u);
    return t >= 50 ? 1 + (t - 50) * 0.0024 : 1 - (50 - t) * 0.0020;
  }
  /* 훈련도 → 치명타 확률. 100에서 +4%p */
  function trainCritBonus(u) {
    const t = trainValOf(u);
    return t > 50 ? (t - 50) * 0.0008 : 0;
  }
  /* v5.56 — 사기 붕괴. 사기가 20 이하로 떨어지면 그 자리에서 무너진다.
     기절(1턴)·혼란(2턴)·중독(2턴)·이동불가(2턴) 중 하나가 붙고, 사기는 50으로 돌아온다.
     (50에서 다시 쌓이므로 같은 부대가 연달아 붕괴해 판이 잠기는 일은 없다) */
  const COLLAPSE_AIL = [['stun', 1], ['confuse', 2], ['poison', 2], ['root', 2]];
  function moraleCollapse(u) {
    if (!u || !u.alive) return null;
    const pick = COLLAPSE_AIL[Math.floor(Math.random() * COLLAPSE_AIL.length)];
    const kind = pick[0];
    u.ail = u.ail || {};
    u.ail[kind] = Math.max(u.ail[kind] || 0, pick[1]);
    if (kind === 'slow') u.slow = Math.max(u.slow || 0, 1);
    u.ailRes = u.ailRes || {};
    u.ailRes[kind] = (u.ailRes[kind] || 0) + 1;
    if (kind === 'stun') u.stunCd = 3;
    u.collapseN = (u.collapseN || 0) + 1;
    addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.1) * TILE, `사기 붕괴! ${AIL[kind].n}`, `rgb(${AIL[kind].c})`, { back: true });
    addFx({ kind: 'burst', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 560, color: AIL[kind].c });
    addFx({ kind: 'buff', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 520, color: AIL[kind].c });
    shakeScreen(4);
    feed(`${u.name}의 사기가 무너졌다 — ${AIL[kind].n} (사기 50으로 복귀)`, u.side === 'ally' ? 'bad' : 'good');
    B.lastCollapse = { name: u.name, side: u.side, ail: kind, turn: B.turn, morale: 50 };
    u.morale = 50;
    return kind;
  }
  function moraleShift(u, d) {
    if (!u || !u.alive || !d) return;
    const before = u.morale == null ? MORALE_BASE : u.morale;
    /* v5.81 — 백절불굴(고유 특기): 사기 감소 N% 경감 */
    const cut = d < 0 ? Math.max(0, Math.min(0.9, fxPct(u, 'moraleSave') + pasFx(u, 'moraleGuard'))) : 0;
    /* v5.56 — 하한 25를 없앴다. 20 이하까지 내려가면 그 자리에서 '사기 붕괴'(위 moraleCollapse)가
       터지므로, 부대가 0에서 판을 버티는 일도 잠기는 일도 없다. */
    const next = clamp(before + (d < 0 ? d * (1 - cut) : d), 0, u.moraleMax || 100);
    u.morale = Math.round(next * 10) / 10;
    const diff = u.morale - before;
    if (Math.abs(diff) >= 3) {
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.1) * TILE,
        `${diff > 0 ? '사기↑' : '사기↓'} ${Math.round(Math.abs(diff))}`, diff > 0 ? '#a8f0b8' : '#ff9a86');
    }
    if (u.morale <= MORALE_LOW) moraleCollapse(u);
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
    const res = statusResistOf(t);
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
      /* v5.58 — 무기 해제 면역(가야철검·금강완갑)은 이 방어 약화를 막는다 */
      if (d.tfx && d.tfx.immuneDisarm) {
        addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.16) * TILE, '무기 사수', '#ffe6a8');
      } else {
        d.buffs.def = { v: -0.2, t: 2 };
        addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.16) * TILE, '방어↓', '#c9a6ff');
      }
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
    /* v5.58 — classes.json 이 적어 준 기절·혼란·위축·둔화를 먼저 본다 */
    if (sk && sk.stun) out.push({ k: 'stun', p: Math.min(0.6, Number(sk.stun) / 100) });
    /* v5.81 — 이동불가(20~30%)를 적어 준 기술(마상돌격·백수급습) */
    if (sk && sk.root) out.push({ k: 'root', p: Math.min(0.6, Number(sk.root) / 100) });
    if (sk && sk.confuse) out.push({ k: 'confuse', p: 0.7 });
    if (sk && sk.fear) out.push({ k: 'fear', p: 0.75 });
    if (sk && sk.slow) out.push({ k: 'slow', p: 1 });
    /* v5.60 — 독무술·만독진: classes.json 의 poison:true 면 중독(턴마다 3%)을 건다 */
    if (sk && sk.poison) out.push({ k: 'poison', p: 0.85 });
    const stun = desc.match(/기절\s*확률\s*(\d+)\s*%/);
    if (stun && !(sk && sk.stun)) out.push({ k: 'stun', p: Math.min(0.6, Number(stun[1]) / 100) });
    if (/혼란\s*상태\s*부여|혼란\s*유발|혼란\s*피해/.test(desc) && !(sk && sk.confuse)) out.push({ k: 'confuse', p: 0.7 });
    if (/위축|공포\s*유발|공포\s*상태/.test(desc) && !(sk && sk.fear)) out.push({ k: 'fear', p: 0.75 });
    if (/이동력\s*-\s*\d+/.test(desc) && !(sk && sk.slow)) out.push({ k: 'slow', p: 1 });
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
    /* v5.58 — classes.json 의 morale 값이 있으면 그것을 쓴다 (문구와 같은 값) */
    const v = (sk && sk.morale != null) ? Number(sk.morale)
      : (m ? Number(m[2]) * (m[1] === '+' ? 1 : -1) : 0);
    if (!v) return 0;
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
        /* v5.82 — 독공·화공(고유 특기)이 건 상태이상은 더 아프게 돈다 */
        const pp = (u.ailDot && u.ailDot[k]) || p;
        const d = Math.max(4, Math.round(u.maxHp * pp));
        u.hp = Math.max(0, u.hp - d);
        statOf(u).taken += d;
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.4) * TILE, `${AIL[k].n} -${d}`, `rgb(${AIL[k].c})`);
        addFx({ kind: 'buff', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.45) * TILE, life: 460, color: AIL[k].c });
        u.flash = 0.6;
        if (u.hp <= 0) downUnit(u);
      });
      if (!u.alive) return;
      /* v6.0 — 연소 중인 갈대밭 위에 서 있으면 턴마다 화상 피해 (추가 화상 4%) */
      if (burningAt(u.x, u.y)) {
        const fd = Math.max(6, Math.round(u.maxHp * 0.04));
        u.hp = Math.max(0, u.hp - fd);
        statOf(u).taken += fd;
        u.ail = u.ail || {};
        u.ail.burn = Math.max(u.ail.burn || 0, 2);
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.4) * TILE, `불길 -${fd}`, 'rgb(255,154,92)');
        addFx({ kind: 'fire', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 520 });
        if (u.hp <= 0) { downUnit(u); return; }
      }
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
      /* v5.56 — 이동불가(사기 붕괴)도 턴이 지나면 풀린다 */
      if (u.ail.root) {
        u.ail.root -= 1;
        if (u.ail.root <= 0) delete u.ail.root;
      }
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
      ['fear', 'confuse', 'poison', 'burn', 'root'].forEach((k) => {
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
  /* ══ v5.83 — 책략 쿨타임 (관리자 병과 편집용) ══
     sk.cd 가 0이면 지금까지와 똑같이 매 턴 쓸 수 있다.
     cd 값은 '대기 턴 수'다 — 2로 두면 한 턴을 쉬고 그다음 턴에 다시 펼친다. */
  function skillKeyOf(sk) {
    if (!sk) return '';
    if (sk.key) return sk.key;
    const ks = Object.keys(SK.SKILLS || {});
    for (let i = 0; i < ks.length; i++) if (SK.SKILLS[ks[i]] === sk) return ks[i];
    return '';
  }
  function skCdLeft(u, sk) {
    if (!u || !sk) return 0;
    const k = skillKeyOf(sk);
    if (!k || !u.scd) return 0;
    return Math.max(0, Number(u.scd[k]) || 0);
  }
  function spendSkill(u, sk) {
    u.mp -= mpCostOf(u, sk);
    const cd = Math.max(0, Number(sk && sk.cd) || 0);
    const k = skillKeyOf(sk);
    if (cd > 0 && k) { u.scd = u.scd || {}; u.scd[k] = cd; }
  }
  SK.skCdLeft = skCdLeft;
  function effAtk(u) {
    const ch = tileAt(u.x, u.y);
    const aff = SK.affinity(u.cls, ch);
    const tb = fxPct(u, 'atk');
    /* v5.31 — 사기·위축·조각배(수전) 보정 */
    const fear = (u.ail && u.ail.fear) ? 0.8 : 1;
    const boat = (u.aboard && u.cls !== 'sujeok') ? 0.82 : 1;
    return u.atk * troopPower(u) * (1 + buffVal(u, 'atk') + aff.atk * 1.3 + typeBonus(u) * 1.25 + tb + terrFxPct(u))
      * bondAllyMul(u) * moraleMul(u) * trainMul(u) * fear * boat;
  }
  function effDef(u) {
    const ch = tileAt(u.x, u.y);
    const aff = SK.affinity(u.cls, ch);
    /* 방어 강화·약화를 실제 피해 계산에 반영한다 (0 아래로는 내려가지 않는다) */
    const mul = Math.max(0.05, 1 + buffVal(u, 'def'));
    /* v5.3 — 망루·본성 위에서는 방어 +45% */
    const hold = (ch === 'T' || ch === 'K') ? 1.45 : 1;
    /* v5.17 — 본진 위 +25% · 점령한 마을 위 +15% */
    const site = siteBonusOf(u);
    const sit = site ? site.def : 1;
    /* v5.29 — 보물 방어력, 성벽·망루·본진 위에서는 '성벽 위 방어력'까지 */
    const onWallTile = (ch === 'C' || ch === 'T' || ch === 'K' || ch === 'G');
    const wall = onWallTile ? fxPct(u, 'defWall') : 0;
    const tdef = fxPct(u, 'def') + wall + terrFxPct(u);
    /* v5.31 — 조각배 위에서는 방어도 조금 떨어진다 (수적 제외) */
    const boat = (u.aboard && u.cls !== 'sujeok') ? 0.88 : 1;
    /* v5.93 — 거점 성벽 방어 계수: 요새(2.0)면 수비측이 성벽·망루 위에서 얻는 방어 +
       거점 성벽 수치(def 0~100)만큼의 철벽 보정까지 두 배로 받는다. */
    let fortWall = 1;
    if (B && B.wallDefMul > 1 && u.side === B.wallDefSide) {
      const pct = clamp(Number(B.wallPct) || 0, 0, 100) / 100;
      const holdAdd = onWallTile ? (hold - 1) : 0;
      fortWall = (1 + 0.25 * pct * (B.wallDefMul - 1)) * (1 + holdAdd * (B.wallDefMul - 1));
    }
    /* v5.96 — 공성 수비대의 성벽 활용: 아직 남은 바깥 성문 바로 안쪽 두 줄에 선 수비 부대는
       성벽 그늘에서 방어 +15%. 문이 뚫리면 사라지므로 공방이 문 앞에서 길어진다. */
    const shade = wallShadeOn(u) ? 1.15 : 1;
    /* v5.56 — 사기·훈련도는 방어에도 그대로 붙는다 (낮은 사기는 공·방을 함께 깎는다) */
    return u.def * troopGuard(u) * (1 - terr(u).def * 1.0 + aff.def * 1.25 + typeBonus(u) * 0.6 + tdef)
      * mul * hold * sit * boat * fortWall * shade * moraleMul(u) * trainMul(u)
      /* v5.82 — 방진(인접 아군 있으면 방어 +)·문무겸전·지휘 오라 */
      * vpDefMul(u) * (1 + vpAura(u, 'def'));
  }
  /* v5.96 — 성문 그늘(바깥 성문 안쪽 두 줄)에 선 수비 부대인가
     v5.97 — 수성전(아군 수비)에도 똑같이 적용한다. 예전에는 공성전 적 수비대에만 붙어
     수성전 아군만 성문 그늘 +15%를 못 받았다 (QA 2-1). */
  function wallShadeOn(u) {
    if (!B || !u) return false;
    if (!SK.isSiegeType(B.type)) return false;
    const defSide = B.defense ? 'ally' : 'enemy';
    if (u.side !== defSide) return false;
    const g = activeGate();
    if (!g || g.hp <= 0) return false;
    return u.y <= g.row - 1 && u.y >= g.row - 2;
  }
  function effRng(u) {
    const aff = SK.affinity(u.cls, tileAt(u.x, u.y));
    /* v5.58 — 보물 '사거리 +1'은 원거리 병과(기본 사거리 2 이상)에만 붙는다 */
    const rp = (u.tfx && u.tfx.rngPlus && (u.rng || 1) >= 2) ? 1 : 0;
    /* v6.0 — 고지대(U)에 선 원거리 병과는 사거리 +1 (산·성벽 보너스와 겹쳐도 최대 +1) */
    const high = (tileAt(u.x, u.y) === 'U' && (u.rng || 1) >= 2) ? 1 : 0;
    return u.rng + Math.min(1, aff.rng + wallRngBonus(u) + high) + rp;
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
    /* v5.86 — 병과 숨은 스탯: 책략 위력(%, 기본 100 = 예전과 같다) */
    const tacticMul = Math.max(0.5, Math.min(2, classHiddenOf(u).tacticPct / 100));
    return (u.ji * 1.05 + u.lv * 3 + Math.min(400, u.hp * 0.02) * 0.25) * tp * (1 + buffVal(u, 'atk') * 0.6) * magicAtkMul(u) * tacticMul;
  }
  function magicDef(u) {
    const ch = tileAt(u.x, u.y);
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
    if (ch === 'T' || ch === 'K' || ch === 'G' || ch === 'C') return true;
    /* v5.97 — 성벽 바로 안쪽 두 줄에 선 원거리 부대도 남은 성문 너머로 쏠 수 있게 한다.
       (수성전에서 문이 버티는 동안 원거리 수비대가 사거리가 닿는데도 벽에 막혀
        일방적으로 맞기만 하던 문제 — 망루 사거리 4칸과 같은 눈금) */
    const g = activeGate();
    if (g && g.hp > 0 && a.y >= g.row - 2 && a.y <= g.row - 1) return true;
    return false;
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
    let defNow = (opts && opts.ignoreTerrain) ? d.def : effDef(d);
    /* v5.58 — '방어력 N% 관통' 책략(천마돌파·파천격·집중노사) */
    if (opts && opts.defPierce) defNow *= Math.max(0, 1 - opts.defPierce);
    /* v5.81 — 갑옷 파쇄(고유 특기): 언제나 대상 방어력을 N% 무시한다 */
    const pPen = pasFx(a, 'pierce') + (vpid(a) === 'siege' ? vpv(a, 'pierce') : 0);
    if (pPen) defNow *= Math.max(0, 1 - pPen);
    const def = (opts && opts.pierce) ? 0 : defNow;
    /* v5.15 — 병과 삼각 상성 (보병↔궁병↔기병↔창병) */
    const tri = SK.triangleMul ? SK.triangleMul(a.cls, d.cls) : { mul: 1, label: '' };
    /* v5.15 — 등갑병 '4딜 벽' 완화: 방어 계수 0.62 → 0.52 */
    let base = (atk * 0.92 - def * 0.52) * 12;
    base *= tri.mul;
    /* v5.58 — 대상 병과를 콕 집는 보물(대부도끼·청강검): 검병·등갑병(방패 병과)·중갑에게 주는 피해 */
    const vg = fxPct(a, 'vsGeom');
    if (vg && (d.cls === 'geombyung' || d.cls === 'deunggabyung')) base *= 1 + vg;
    const vh = fxPct(a, 'vsHeavy');
    if (vh && (d.cls === 'geombyung' || d.cls === 'deunggabyung' || d.cls === 'changbyung')) base *= 1 + vh;
    /* v5.58 — 성벽·성문 위의 적(수성 병력)에게 주는 추가 피해 (선화부끼·벽력거부품) */
    const sd = fxPct(a, 'siegeDmg');
    if (sd) {
      const dch = B.tiles[d.y] && B.tiles[d.y][d.x];
      if (dch === 'C' || dch === 'G' || dch === 'K' || dch === 'H' || dch === 'T') base *= 1 + sd;
    }
    base *= sizeScale(d) * atkScale(a);
    base *= rnd(0.92, 1.08);
    /* v5.29 — 보물: 주는 피해(+), 받는 피해 감소(−), 첫 공격(선제) 피해 */
    const bonusDeal = fxPct(a, 'dmg');
    if (bonusDeal) base *= Math.max(0.4, 1 + bonusDeal);
    /* v5.81 — 기동 타격(고유 특기): 이번 턴 이동한 칸 1칸당 피해 +N% (최대 3칸) */
    const mvP = pasFx(a, 'moveDmg');
    if (mvP && !(opts && opts.counterHit)) base *= 1 + mvP * Math.min(3, (a.movedTiles || 0));
    /* v6.0 — 고지대에서 내려치는 공격 +15% (위에서 아래로). 올라가는 쪽은 보정이 없다 */
    const aCh = B.tiles[a.y] && B.tiles[a.y][a.x];
    const dCh = B.tiles[d.y] && B.tiles[d.y][d.x];
    if (aCh === 'U' && dCh !== 'U' && dCh !== 'M') base *= 1.15;
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
    /* v5.15 — 무희 오라의 회피(받는 피해 −8%) · v5.81 무도가 고유 회피 · v5.82 복병(숲·산지 회피) */
    const ev = buffVal(d, 'evade') + classEva(d) + vpEvade(d);
    if (ev > 0) base *= Math.max(0.6, 1 - ev);
    /* v5.82 — 고유 특기 40종: 공격자 배율·방어자 배율 (계산 맨 끝에서 한 번에) */
    base *= vpAtkMul(a, d, opts);
    base *= vpTakenMul(d);
    /* v5.86 — 병과 숨은 스탯: 방어자의 '받는 피해 감소'(%) — 기본 0이라 예전과 같다 */
    const drv = classHiddenOf(d).dmgRedPct;
    if (drv) base *= Math.max(0.4, 1 - drv / 100);
    let crit = false;
    /* v5.81 — 기술 자체의 치명 보너스(조준사격 +10 · 연환권 +15 등) */
    const cc = critChanceOf(a) + (opts && opts.critBonus ? Number(opts.critBonus) / 100 : 0);
    if (!opts || !opts.noCrit) {
      if (Math.random() < cc + vpCritAdd(a, d, kind === 'melee')) {
        crit = true;
        /* v5.29 — 보물 치명타 피해(+), 방어자의 치명타 저항(−) · v5.86 병과 치명피해 */
        base *= Math.max(1.15, 1.55 + fxPct(a, 'critDmg') - fxPct(d, 'critRes') + classHiddenOf(a).critDmgPct / 100);
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
    /* v5.82 — 전위 「악래의 방패」: 가리기(cover) 중인 장수가 인접 아군이 받는 피해의 40%를 대신 받는다 */
    if (d && d.alive && dmg > 0 && B && B.units) {
      const guard = B.units.find((o) => o !== d && o !== a && o.alive && o.side === d.side
        && (o.vpCover || 0) > 0 && manh(o.x, o.y, d.x, d.y) <= 1);
      if (guard) {
        const share = Math.round(dmg * 0.4);
        if (share > 0) {
          dmg -= share;
          guard.hp = Math.max(0, guard.hp - share);
          statOf(guard).taken += share;
          addFloat((rxOf(guard) + 0.5) * TILE, (ryOf(guard) + 0.3) * TILE, `가로막음 ${share}`, '#ffe08a');
          if (guard.hp <= 0) downUnit(guard);
        }
      }
    }
    d.hp = Math.max(0, d.hp - dmg);
    /* v5.82 — 불굴: 전투당 1회, 치명상에서도 병력 1로 버틴다 (그 뒤 공격 +15%) */
    if (wasAlive && d.hp <= 0 && vpid(d) === 'unyielding' && !d.vpBroken) {
      d.vpBroken = true;
      d.vpRage = true;
      const hl = 1;
      d.hp = hl;
      addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.24) * TILE, `「${(d.passive && d.passive.title) || '불굴'}」 버팀!`, '#ffe08a', { back: true });
      feed(`${d.name}의 고유 특기 「${(d.passive && d.passive.title) || '불굴'}」 — 쓰러지지 않고 버텼다 (공격 상승)`, d.side === 'ally' ? 'good' : 'bad');
      addFx({ kind: 'ring', x: (rxOf(d) + 0.5) * TILE, y: (ryOf(d) + 0.5) * TILE, life: 520, color: '255,214,120' });
    }
    /* v5.31 — 사기: 최대 병력의 15% 이상을 한 번에 잃으면 흔들린다 */
    if (d.maxHp && dmg >= d.maxHp * 0.15) moraleShift(d, -4);
    if (wasAlive && d.hp <= 0) {
      /* v5.56 — 전우가 쓰러지면 **전장의 모든 아군 부대**가 흔들린다.
         (예전에는 3칸 안 아군만 −4라, 멀리 있던 부대는 "사기가 떨어졌다고 나오는데 그대로"였다)
         · 3칸 안 동료 −8 · 그 밖의 살아 있는 아군 −4 · 쓰러뜨린 쪽 +6 */
      moraleShift(a, 6);
      B.units.forEach((o) => {
        if (!o.alive || o === d || o.side !== d.side) return;
        moraleShift(o, manh(o.x, o.y, d.x, d.y) <= 3 ? -8 : -4);
      });
    }
    if (a) statOf(a).dealt += dmg;
    statOf(d).taken += dmg;
    /* v5.81 — 피의 갈증(고유 특기): 준 피해의 N%를 자기 병력으로 회복
       v5.82 — 혈전(고유 특기)도 같은 흡혈을 쓴다 */
    if (a && a.alive && dmg > 0) {
      const ls = pasFx(a, 'lifesteal') || (vpid(a) === 'bloodlust' ? vpv(a, 'leech') : 0)
        /* v5.86 — 장수 숨은 스탯: 흡혈(%) */
        || (((genHiddenOf(a) && genHiddenOf(a).lifestealPct) || 0) / 100);
      if (ls) {
        const hl = Math.max(1, Math.round(dmg * ls));
        const before = a.hp;
        a.hp = Math.min(a.maxHp, a.hp + hl);
        if (a.hp > before) {
          addHeal(a, a.hp - before, a);
          addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.28) * TILE, '+' + (a.hp - before), '#a8f0b8');
          addFx({ kind: 'heal', x: (rxOf(a) + 0.5) * TILE, y: (ryOf(a) + 0.5) * TILE, life: 420 });
        }
      }
    }
    /* v5.30 — 검증용 마지막 타격 기록 (연격·광역·반사가 실제로 들어갔는지 확인) */
    if (B) {
      B.lastHits = B.lastHits || [];
      B.lastHits.push({ a: a && a.name, d: d.name, dmg: dmg, crit: !!crit });
      if (B.lastHits.length > 14) B.lastHits.shift();
    }
    if (wasAlive && d.hp <= 0 && a) {
      statOf(a).kills += 1;
      /* v5.81 — 연격 돌파(고유 특기): 처치하면 곧바로 가장 가까운 다른 적을 한 번 더 친다 */
      const kp = pasFx(a, 'killAct');
      if (kp > 0 && !a.killActUsed && Math.random() < kp) {
        a.killActUsed = true;
        wait(() => {
          if (!B || B.over || !a.alive) return;
          const other = B.units.filter((o) => o.alive && o.side !== a.side)
            .sort((x, y) => manh(a.x, a.y, x.x, x.y) - manh(a.x, a.y, y.x, y.y))[0];
          if (!other) return;
          feed(`${a.name}의 특기 「${(a.passive && a.passive.title) || '연격'}」 — ${other.name}을(를) 한 번 더 칩니다`, a.side === 'ally' ? 'good' : 'bad');
          attackUnit(a, other, { mult: 1, noStrike: true });
        }, 460);
      }
      /* v5.82 — 추격: 처치하면 30% 확률로 가장 가까운 적을 한 번 더 치고, 실패하면 인접 적에게 추가 피해 */
      if (vpid(a) === 'pursue' && !a.vpPursued) {
        a.vpPursued = true;
        const others = B.units.filter((o) => o.alive && o.hp > 0 && o !== d && o.side !== a.side);
        const near = others.filter((o) => manh(o.x, o.y, a.x, a.y) <= 1);
        const reach = others.filter((o) => manh(a.x, a.y, o.x, o.y) <= effRng(a));
        if (Math.random() < vpv(a, 'act') && reach.length) {
          const other = reach.slice().sort((x, y) => manh(a.x, a.y, x.x, x.y) - manh(a.x, a.y, y.x, y.y))[0];
          wait(() => {
            if (!B || B.over || !a.alive || !other.alive) return;
            feed(`${a.name}의 고유 특기 「${(a.passive && a.passive.title) || '추격'}」 — ${other.name}을(를) 한 번 더 칩니다`, a.side === 'ally' ? 'good' : 'bad');
            addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.1) * TILE, '추격!', '#ffe08a', { back: true });
            attackUnit(a, other, { mult: 1, noStrike: true, counterHit: true });
          }, 420);
        } else if (near.length) {
          wait(() => {
            if (!B || B.over || !a.alive) return;
            near.forEach((o) => {
              if (!o.alive) return;
              const sd = Math.max(1, Math.round(dmg * vpv(a, 'splash')));
              addFloat((rxOf(o) + 0.5) * TILE, (ryOf(o) + 0.34) * TILE, `추격 ${sd}`, '#ffc98a');
              applyDamage(a, o, sd, false, null);
            });
            feed(`${a.name}의 고유 특기 「${(a.passive && a.passive.title) || '추격'}」 — 인접 적에게 추가 피해`, a.side === 'ally' ? 'good' : 'bad');
          }, 360);
        }
      }
      /* v5.58 — '적 처치 시' 고유 특기(여몽·관흥·여포): 이 부대 공격력이 오른다 */
      const pk = a.passive;
      if (pk && pk.trigger === 'on_kill' && !pk.fx && !(a.pUsed && a.pUsed.on_kill)) {
        a.pUsed = a.pUsed || {};
        a.pUsed.on_kill = true;
        const pv = Math.max(0.03, Math.min(0.2, (Number(pk.valuePct) || 10) / 100));
        a.buffs.atk = { v: pv, t: 2 };
        addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.1) * TILE, `「${pk.title}」 공격↑`, '#ffe08a', { back: true });
        feed(`${a.name}의 고유 특기 「${pk.title}」 — 적을 쓰러뜨리고 기세가 올랐다 (공격 +${Math.round(pv * 100)}% · 2턴)`, 'good');
      }
    }
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
    /* v5.86 — 민첩 명중/회피: 일반 물리 공격만 굴린다 (책략·필살기는 이 함수를 쓰지 않는다).
       회피율은 병과·장수·민첩·보물을 모두 더한 값이고 상한은 40%(0.40)다.
       …예전 v5.29의 '보물 회피'도 이 한 번의 판정에 합쳤다(주사위를 두 번 굴리지 않는다). */
    const hitP = hitRateOf(a, d);
    const dodged = !(opts && opts.noDodge) && Math.random() > hitP;
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
        /* v5.86 — 검증용: 회피도 lastHits에 남긴다 (누가 누구를 몇 % 명중으로 빗나갔는지) */
        if (B) {
          B.lastHits = B.lastHits || [];
          B.lastHits.push({ a: a.name, d: d.name, dmg: 0, crit: false, evaded: true, hitPct: Math.round(hitP * 1000) / 10 });
          if (B.lastHits.length > 14) B.lastHits.shift();
        }
        if (onDone) onDone();
        return;
      }
      applyDamage(a, d, res.dmg, res.crit, bond);
      /* v6.0 — 불·포격이 갈대밭 위의 적에게 닿으면 그 자리가 탄다 */
      fireSpreadFrom(a, d, opts && opts.skill, kind);
      /* v5.31 — 보물의 적중 시 상태이상·사기 저하 */
      if (d.alive) onHitAil(a, d, kind, opts);
      /* v5.82 — 고유 특기 적중 효과 (독공·화공·위압·쾌검) */
      if (d.alive) vpOnHit(a, d, res.crit, opts);
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
  function counterMulOf(u) {
    return (u && u.cls === 'geombyung' ? COUNTER_MUL_SHIELD : COUNTER_MUL) + fxPct(u, 'counter') + pasFx(u, 'counter')
      + (vpid(u) === 'ironwall' ? vpv(u, 'counter') : 0)
      /* v5.86 — 병과·장수 숨은 스탯: 반격 피해(%) */
      + (classHiddenOf(u).cntPct + ((genHiddenOf(u) && genHiddenOf(u).cntPct) || 0)) / 100;
  }
  function canCounterAt(a, d) {
    if (!a || !d || !a.alive || !d.alive) return false;
    /* v5.82 — 창벽: 기병에게 맞으면 최소 사거리와 상관없이 반격한다 */
    if (vpid(a) === 'spearwall' && famU(d) === 'cav' && manh(a.x, a.y, d.x, d.y) <= 1) return true;
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
  /* v5.98 — 머리 위 병력 숫자·HP 바 라벨 힟박스 판정 (drawUnit이 그릴 때 남긴 _tap 사각형)
     같은 높이에서 겹치면 나중에 그린(아래쪽 y가 큰) 부대를 고른다. */
  function unitLabelAt(px, py) {
    if (!B) return null;
    const w = screenToWorld(px, py);
    let hit = null;
    const list = B.units.filter((u) => u.alive && u._tap).sort((a, b) => a.y - b.y);
    for (let i = 0; i < list.length; i++) {
      const r = list[i]._tap;
      if (w.x >= r.x0 && w.x <= r.x1 && w.y >= r.y0 && w.y <= r.y1) hit = list[i];
    }
    return hit;
  }
  function onTappedUnit(u) {
    if (!u || !B || B.over) return;
    onTileTap(u.x, u.y);
  }

  function onTileTap(x, y) {
    if (!B || B.over || busy || !B.introDone) return;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    /* v5.89 — 관전 중에는 명령을 받지 않는다. 부대 정보만 열어 준다 */
    if (spectateMode || skipMode) {
      const t0 = B.units.find((o) => o.alive && o.x === x && o.y === y);
      if (t0) inspectUnit(t0, { open: true });
      return;
    }
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

    /* v5.91 — 망루: 공격 측 부대가 사거리 안의 살아 있는 망루를 눌러 공략한다. */
    const twp = !t ? towerAt(x, y) : null;
    if (twp) {
      if (u && u.side === 'ally' && !u.acted && u.side === towerAttackerSide()) {
        if (manh(u.x, u.y, twp.x, twp.y) > effRng(u)) {
          SK.toast(`망루까지 거리가 멉니다. (사거리 ${effRng(u)})`);
          return;
        }
        openTowerAttack(u, twp);
        return;
      }
      if (u && u.side === towerOwnerSide()) {
        SK.toast(`우리 망루입니다 — 내구도 ${Math.round(twp.hp)} / ${twp.maxHp}`);
        return;
      }
      SK.toast(`적 망루 — 내구도 ${Math.round(twp.hp)} / ${twp.maxHp} · 공격 측 부대를 골라 누르면 공략할 수 있습니다.`);
      return;
    }
    if (!t && towerRubbleAt(x, y)) { SK.toast('부서진 망루의 잔해입니다.'); return; }

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
    /* v5.98 — 이미 부대를 고른 상태에서 빈 칸(이동·공격 불가)을 탭해도 선택을 풀지 않는다.
       무엇을 눌렀는지 말풍선으로 알려 주고, 고른 부대는 그대로 둔다 (헛터치 방지). */
    if (u && u.alive && u.side === 'ally' && !u.acted) {
      addSay((x + 0.5) * TILE, (y + 0.35) * TILE, '거긴 아무도 없는데?!', '#ffe9b8');
      SK.sfx.play('deny');
      $('#battle-tip').textContent = '빈 칸입니다 — 파란 칸(이동)이나 붉게 빛나는 적을 누르세요';
      return;
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
    clearAttackTargets();   // v5.98 — 선택을 풀면 붉은 타겟 테두리도 걷아낸다
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
      objPhase();            // v6.0 — 군량고·무기고도 밟으면 점령
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

  /* ══════════════════════════════════════════════════════════════
     v5.86 — 민첩(agi) · 운(매력) · 숨은 스탯 (사용자 확정 규칙)
     · 민첩 = 병과 기본 agi(data.js SK.CLASSES[key].agi) + Math.round((무력−60)×0.1).
       이동력(mov)은 절대 넣지 않는다.
     · 명중·회피는 일반 물리 공격에만. book(책략)·필살기는 attackUnit 을 쓰지 않으므로
       이 함수들을 거치지 않는다 = 언제나 100% 명중.
       기본 명중 93% + (공격자 agi − 방어자 agi) × 0.25% (60%~99%)
       총 회피율 상한 40%(0.40) 고정 — 병과 회피 + 장수 회피 + 민첩 회피 + 보물 회피의 합.
     · 운 = 매력. 상태이상 저항 max(0,(매력−60)×0.5)% (최대 20%),
       치명타 +max(0,(매력−60)×0.08)%p (최대 3.2%p).
     · 병과·장수의 숨은 스탯은 SK.classHiddenOf / SK.genHiddenOf 한 곳에서만 읽는다
       (관리자 모드 ?admin=1 이 고친 값, 일반 주소에서는 기본값).
     ══════════════════════════════════════════════════════════════ */
  const HIT_BASE = 0.93, HIT_AGI_W = 0.0025, EVADE_AGI_W = 0.0018, EVADE_CAP = 0.40;
  function classHiddenOf(u) { return (SK.classHiddenOf ? SK.classHiddenOf(u && u.cls) : { agi: 60 }); }
  function genHiddenOf(u) { return (SK.genHiddenOf ? SK.genHiddenOf(u && u.genId) : null); }
  function agiOf(u) {
    if (!u) return 60;
    const war = Number(u.wu == null ? 60 : u.wu) || 60;
    return clamp(Math.round(classHiddenOf(u).agi + (war - 60) * 0.1), 10, 100);
  }
  function charmOf(u) {
    const c = Number(u && u.cha == null ? 60 : (u && u.cha));
    return clamp(isFinite(c) ? c : 60, 0, 120);
  }
  /* 상태이상 저항 = 보물·특기 저항 + 매력(최대 +20%) + 병과 상태저항 */
  function statusResistOf(t) {
    const C = classHiddenOf(t);
    const charm = Math.min(0.20, Math.max(0, (charmOf(t) - 60) * 0.005));
    return clamp(fxPct(t, 'statusRes') + vpv(t, 'resist') + charm + C.statusResPct / 100, 0, 0.75);
  }
  /* 치명타 보정 — 매력(최대 +3.2%p) + 병과·장수 숨은 치명 */
  function charmCritOf(u) { return Math.min(3.2, Math.max(0, (charmOf(u) - 60) * 0.08)) / 100; }
  function extraCritOf(u) {
    const G = genHiddenOf(u);
    return (classHiddenOf(u).critPct + ((G && G.critPct) || 0)) / 100;
  }
  /* 총 회피율 (상한 40% 고정) */
  function evadeRateOf(d) {
    if (!d) return 0;
    const G = genHiddenOf(d);
    const raw = (agiOf(d) - 60) * EVADE_AGI_W
      + classHiddenOf(d).evaPct / 100 + ((G && G.evaPct) || 0) / 100 + fxPct(d, 'evade');
    return clamp(raw, 0, EVADE_CAP);
  }
  /* 최종 명중률 (회피까지 곱한 값, 60%~99%) */
  function hitRateOf(a, d) {
    if (!a || !d) return 1;
    const base = HIT_BASE + (agiOf(a) - agiOf(d)) * HIT_AGI_W;
    return clamp(clamp(base, 0.60, 0.99) * (1 - evadeRateOf(d)), 0.60, 0.99);
  }
  SK.agiOf = agiOf;
  SK.hitRateOf = hitRateOf;
  SK.evadeRateOf = evadeRateOf;

  /* v5.29 — 치명타 확률은 한 곳에서만 계산한다 (예고·실제 전투가 같은 값을 쓰도록) */
  function critChanceOf(u) {
    /* v5.82 — 복병(숲·산지 치명 +N%p)은 예상 창에도 그대로 보인다 */
    const amb = (vpid(u) === 'ambush' && (vpCh(u) === 'F' || vpCh(u) === 'M')) ? vpv(u, 'crit') : 0;
    return 0.05 + (u.wu - 60) * 0.0011 + (u.cls === 'sanjeok' ? 0.06 : 0) + Math.max(0, buffVal(u, 'crit'))
      + fxPct(u, 'crit') + trainCritBonus(u) + classCrit(u) + pasFx(u, 'crit') + amb
      /* v5.86 — 운(매력) + 병과·장수 숨은 치명 */
      + charmCritOf(u) + extraCritOf(u);
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
    /* v5.86 — 민첩 명중·회피·치명을 예고 창에도 그대로 (실제 판정과 같은 함수) */
    const critChance = Math.round(critChanceOf(a) * 1000) / 10;
    const hitPct = Math.round(hitRateOf(a, d) * 1000) / 10;
    const evadePct = Math.round(evadeRateOf(d) * 1000) / 10;
    const agiA = agiOf(a), agiD = agiOf(d);
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
        <div class="ap-row"><span>명중</span><b>${hitPct}%</b><em>민첩 ${agiA} vs ${agiD} · 상대 회피 ${evadePct}%</em></div>
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
    /* v5.58 — '성벽·성문 피해 +N%'도 성문 타격에 그대로 붙는다 (중복은 60%까지만) */
    const sg = Math.max(0, Math.min(0.6, fxPct(a, 'siegeDmg')));
    if (sg) base *= 1 + sg;
    /* v5.81 — 공성 공병대(고유 특기): 성문 피해 +N% */
    const gp = Math.max(0, Math.min(0.6, pasFx(a, 'gate')));
    if (gp) base *= 1 + gp;
    /* v5.82 — 공성파괴(고유 특기): 성문 피해 +20% */
    if (vpid(a) === 'siege') base *= 1 + vpv(a, 'siege');
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
    if (!a || !a.alive || !gateIntact() || busy) return;
    if (!isGateAttacker(a)) return;
    /* v6.0 — 때린 칸이 속한 성문(정문·측면 샛문)을 그대로 깎는다.
       예전에는 어느 문을 때려도 '가장 바깥에 남은 문' 하나만 깎여, 옆 문을 치면 피해가 엉뚱한 문으로 갔다. */
    const hitGate = (B.gates || []).find((gt) => gt.hp > 0 && (gt.tiles || []).some((t) => t.x === g.x && t.y === g.y))
      || activeGate();
    B.gate = hitGate;
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
      hitGate.hp = Math.max(0, hitGate.hp - hit);
      addFloat(cx, cy - 8, '-' + hit, '#ffd08a');
      addFx({ kind: 'burst', x: cx, y: cy, life: 420, color: '226,180,72' });
      SK.sfx.play('hit');
      feed(`${a.name} — 성문에 ${hit} 피해`, 'good');
      if (hitGate.hp <= 0) {
        const next = activeGate();
        const more = next && next !== hitGate && next.hp > 0;
        B.gate = next;
        feed(more ? `${hitGate.side ? '측면 샛문' : `${hitGate.ring}번째 성문`}이 무너졌습니다 — ${next.side ? '다른 문' : '안쪽 성문'}이 남아 있습니다.` : '성문이 무너졌습니다 — 근접 부대도 성안으로 들어갈 수 있습니다.', 'good');
        /* v5.97 — 피드와 중앙 토스트가 겹쳐 하단 정보창을 가리지 않게 토스트는 띄우지 않는다 */
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
    const gates = gateListIntact();
    if (!gates.length || !isGateAttacker(u)) return null;
    const rng = effRng(u);
    const cands = [{ x: u.x, y: u.y }];
    reachSet(u).forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      if (B.units.some((o) => o.alive && o !== u && o.x === x && o.y === y)) return;
      cands.push({ x, y });
    });
    let best = null;
    cands.forEach((t) => {
      gates.forEach((gate) => {
        gate.tiles.forEach((g) => {
          const d = manh(t.x, t.y, g.x, g.y);
          if (d < 1 || d > rng) return;
          const sc = -d + (t.x === u.x && t.y === u.y ? 0.5 : 0) + (gate.side ? 0.6 : 0);
          if (!best || sc > best.score) best = { x: t.x, y: t.y, gate: { x: g.x, y: g.y }, score: sc };
        });
      });
    });
    return best;
  }

  function enemyGateStrike(e, plan, done) {
    const go = () => {
      if (!B || B.over) { done(); return; }
      const gate = (B.gates || []).find((gt) => gt.hp > 0 && (gt.tiles || []).some((t) => t.x === plan.gate.x && t.y === plan.gate.y))
        || activeGate();
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
        /* v5.97 — 중앙 토스트 중복 제거 (전투 피드만 남긴다) */
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
    /* v5.56 — 내정형 특기(domestic)는 전장에서 발동하지 않는다 (성에 주둔했을 때만 힘을 낸다) */
    if (trig === 'domestic') return;
    /* v5.81 — 개편된 전투 특기(fx: 이동비례·반격·흡혈·치명·관통·사기방어·MP·성문·처치재행동)는
       각자의 전투 계산 자리에서 이미 일한다. 여기서 옛 '주변 아군 공격력 +%'를 또 발동하지 않는다. */
    if (p.fx) return;
    /* v5.82 — 40종 특기(vp)도 각자의 계산 자리에서 일한다 */
    if (p.v582) return;
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
      /* v5.58 — 특기 데이터가 mode('heal'|'buff')·stat('atk'|'def')을 적어 주면 그것을 따른다 */
      const hpHeal = p.mode ? p.mode === 'heal' : /HP/.test(eff);
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
        const buffDef = p.stat ? p.stat === 'def' : /방어|책략/.test(eff);
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
      /* v5.81 — 군악대 참전 패시브: 전장에 서 있는 동안 아군 전체 공·방 +5% · 매 턴 사기 +3 */
      const list = B.units.filter((o) => o.side === side && o.alive);
      list.forEach((o) => {
        o.mp = Math.min(o.maxMp, o.mp + 2);
        o.buffs.atk = { v: Math.max(0.05, (o.buffs.atk && o.buffs.atk.t > 0 && o.buffs.atk.v) || 0), t: 1 };
        o.buffs.def = { v: Math.max(0.05, (o.buffs.def && o.buffs.def.t > 0 && o.buffs.def.v) || 0), t: 1 };
        moraleShift(o, 3);
        addFx({ kind: 'ring', x: (rxOf(o) + 0.5) * TILE, y: (rxOf(o) + 0.5) * TILE, life: 360, color: '255,214,140' });
      });
      /* v5.56 — 사기가 55 아래로 기운 아군이 곁에 있으면 북을 쳐 사기를 올린다(붕괴 20을 막는다) */
      const shaky = list.filter((o) => o.morale != null && o.morale < 55).sort((a, b) => a.morale - b.morale)[0];
      if (shaky) {
        moraleShift(shaky, 5);
        addFloat((rxOf(shaky) + 0.5) * TILE, (ryOf(shaky) + 0.15) * TILE, '북소리 — 사기 +5', '#ffe08a', { back: true });
      }
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '「군악」 아군 공·방 +5% · 사기 +3', '#ffe08a', { back: true });
      feed(`${u.name}의 군악 — 아군 전체 공·방 +5% · 매 턴 사기 +3${shaky ? ` · ${shaky.name} 사기 +5` : ''}`, side === 'ally' ? 'good' : 'bad');
    });
    dancers.forEach((u) => {
      /* v5.81 — 무희 참전 패시브: 전장에 서 있는 동안 아군 전체 회피 +8% · 치명 +5% (적 교란은 2칸) */
      const allies = B.units.filter((o) => o.side === side && o.alive);
      allies.forEach((o) => {
        o.buffs.crit = { v: 0.05, t: 1 };
        o.buffs.evade = { v: 0.08, t: 1 };
        addFx({ kind: 'ring', x: (rxOf(o) + 0.5) * TILE, y: (ryOf(o) + 0.5) * TILE, life: 360, color: '240,170,220' });
      });
      const foes = B.units.filter((o) => o.side !== side && inDia(o, u));
      foes.forEach((o) => {
        o.buffs.atk = { v: Math.min(-0.08, (o.buffs.atk && o.buffs.atk.t > 0 && o.buffs.atk.v) || 0), t: 1 };
      });
      /* v5.56 — 춤으로 기운을 돌려 준다: 사기 55 미만 아군 한 부대 +4 */
      const low = allies.filter((o) => o.morale != null && o.morale < 55).sort((a, b) => a.morale - b.morale)[0];
      if (low) {
        moraleShift(low, 4);
        addFloat((rxOf(low) + 0.5) * TILE, (ryOf(low) + 0.15) * TILE, '춤사위 — 사기 +4', '#f0b8e0', { back: true });
      }
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '「무희」 아군 회피 +8% · 치명 +5%' + (low ? ' · 사기 +4' : ''), '#f0b8e0', { back: true });
      feed(`${u.name}의 춤 — 아군 전체 회피 +8% · 치명 +5%, 2칸 안 적 공격 −8%${low ? ` · ${low.name} 사기 +4` : ''}`, side === 'ally' ? 'good' : 'bad');
    });
  }

  /* v5.30 — 연격·연속 사격: 한 번 더 친다 (연격 62% · 연속 사격 55% 피해) */
  function extraKindOf(a, kind) {
    /* v5.82 — 연격(고유 특기): 확률로 추가타 (보물 연격과 별개로 한 번 더 굴린다) */
    if (a && vpid(a) === 'combo' && Math.random() < vpv(a, 'chance')) return 'vpcombo';
    if (!a || !a.tfx) return null;
    if (kind === 'melee') return (fxPct(a, 'combo') > 0 && Math.random() < Math.min(0.5, fxPct(a, 'combo'))) ? 'combo' : null;
    return (fxPct(a, 'volley') > 0 && Math.random() < Math.min(0.5, fxPct(a, 'volley'))) ? 'volley' : null;
  }
  function extraStrike(a, d, kind, done) {
    const vpCombo = kind === 'vpcombo';
    const pierce = kind === 'combo' && !!(a.tfx && a.tfx.pierce);
    const mult = vpCombo ? vpv(a, 'pct') : kind === 'combo' ? 0.62 : 0.55;
    const label = vpCombo ? `「${(a.passive && a.passive.title) || '연격'}」` : kind === 'combo' ? '연격!' : '연속 사격!';
    addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.1) * TILE, label, '#ffe6a8', { back: true });
    feed(`${a.name} — ${vpCombo ? '연격 특기' : kind === 'combo' ? '연격' : '연속 사격'}${pierce ? ' · 방어 무시' : ''}`, 'good');
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
    objPhase();                // v6.0 — 밟고 선 군량고·무기고 점령 반영
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
  /* v5.62 — 병종의 책략 4종을 모두 보여 준다. 아직 레벨이 모자란 기술도
     목록에 남겨 두되, 흐리게 + `🔒 Lv.N 해금` 배지로 눌리지 않게 한다.
     실제 시전·AI는 u.skills(SK.skillsFor = 해금된 것만)만 쓰므로 미해금 기술은 나가지 않는다. */
  function openSkillMenu() {
    const u = B.sel;
    if (!u || u.acted) { SK.toast('먼저 이동할 부대를 선택하세요.'); return; }
    const all = SK.allSkillsOf(u.cls);
    if (!all.length) { SK.toast('이 병과는 책략이 없습니다.'); return; }
    const lv = Number(u.lv) || 1;
    let lockedN = 0, nextNeed = 0;
    const rows = all.map((k) => {
      const sk = SK.SKILLS[k];
      const need = SK.skillLockLv(k, lv);
      const poor = u.mp < sk.mp;
      /* v5.83 — 쿨타임 중인 책략은 목록에서 흐리게 + 남은 턴을 적는다 */
      const cool = skCdLeft(u, sk);
      const dis = need > 0 || poor || cool > 0;
      if (need > 0) { lockedN += 1; if (!nextNeed || need < nextNeed) nextNeed = need; }
      const state = need > 0 ? 'lock' : (poor || cool > 0 ? 'off' : '');
      const badge = need > 0 ? `<em class="sk-lock">🔒 Lv.${need} 해금</em>`
        : (cool > 0 ? `<em class="sk-lock">⏳ ${cool}턴 대기</em>` : '');
      return `<button class="skill-row ${state}" data-k="${k}" ${dis ? 'disabled' : ''}>
        <span class="sk-mp">${sk.mp}</span>
        <div><b>${sk.name}${badge}<em class="sk-rng">사거리 ${skRange(u, sk)}</em></b><span>${sk.desc}</span></div>
      </button>`;
    }).join('');
    const lockNote = lockedN
      ? `<p class="skill-locknote">🔒 미해금 ${lockedN}종 · 가장 가까운 해금 Lv.${nextNeed} <em>(이 부대 Lv.${lv})</em></p>`
      : '';
    const m = SK.modal({
      kicker: `${u.name}의 책략`,
      title: '무엇을 펼칠까',
      body: `<div class="skill-list">${rows}</div><p class="skill-mp">남은 책략 ${u.mp} / ${u.maxMp}</p>${lockNote}`,
      actions: [{ label: '취소' }],
    });
    m.el.querySelectorAll('.skill-row').forEach((b) => {
      b.onclick = () => { m.close(); beginSkill(u, b.dataset.k); };
    });
  }

  function beginSkill(u, key) {
    const sk = SK.SKILLS[key];
    if (!sk) return;
    if (SK.skillLockLv(key, u.lv)) { SK.toast(`Lv.${SK.SKILLS[key].unlockLv}에 해금되는 책략입니다.`); return; }
    /* v5.83 — 관리자 병과 편집의 쿨타임: 남은 턴이 있으면 펼치지 못한다 */
    const cdLeft = skCdLeft(u, sk);
    if (cdLeft > 0) { SK.toast(`『${sk.name}』은(는) ${cdLeft}턴 뒤에 다시 펼칠 수 있습니다.`); return; }
    if (u.mp < sk.mp) return;
    pendingSkill = Object.assign({ key }, sk);
    mode = 'skillTarget';
    if (sk.kind === 'buffAreaAllies' || sk.kind === 'healArea' || sk.kind === 'buffSelf' || sk.kind === 'buffAllAllies' || sk.kind === 'healAll') {
      castInstant(u, sk);
    } else {
      $('#battle-tip').textContent = `${sk.name} — 대상 지점을 선택하세요`;
    }
    SKBattle.refreshUI();
  }

  function castInstant(u, sk) {
    busy = true;
    spendSkill(u, sk);
    const auraCol = sk.kind === 'buffSelf' ? '150,210,255'
      : sk.kind === 'buffAllAllies' ? '255,226,140' : '255,215,120';
    castCircle(u, auraCol);
    SK.sfx.play(sk.kind === 'healArea' ? 'heal' : sk.kind === 'buffAllAllies' ? 'drum' : 'spell');
    /* v5.60 — 전장 전체 기술은 파동 반경을 전장 크기로 잡고, 화면도 한 번 금빛으로 물들인다 */
    if (sk.kind === 'buffAllAllies') {
      skillFxAt(u, sk, u.x, u.y, { radius: Math.max(6, Math.round((B.cols || COLS) / 3)) });
      addFx({ kind: 'tint', life: 520, color: '255,214,120' });
      shakeScreen(5);
    } else skillFxAt(u, sk, u.x, u.y);
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
          /* v5.31 — '상태이상 해제'가 적힌 회복 책략(천상의 가무·승리의 교향곡) */
          if (sk.cleanse || /상태이상\s*해제|공포\s*상태\s*해제/.test(sk.desc || '')) ailClear(t, 2);
          /* v5.58 — 회복과 함께 사기 +N도 오른다 */
          const moH = skillMoraleOf(sk, true);
          if (moH) moraleShift(t, moH);
        }
      });
    } else if (sk.kind === 'healAll') {
      /* v5.81 — 풍수사 4번 '산천진법': 전장 아군 전체 병력 10% 치유 */
      battleExp(u, 10);
      let nHeal = 0;
      B.units.forEach((t) => {
        if (!t.alive || t.side !== u.side) return;
        const heal = Math.max(1, Math.round(t.maxHp * (sk.healPct || 0.1) * (1 + fxPct(u, 'heal'))));
        t.hp = Math.min(t.maxHp, t.hp + heal);
        addHeal(t, heal, u);
        nHeal += 1;
        addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.35) * TILE, '+' + heal, '#a8f0b8');
        addFx({ kind: 'heal', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 620 });
        const moH = skillMoraleOf(sk, true);
        if (moH) moraleShift(t, moH);
      });
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.05) * TILE, sk.name, '#bfe8ff', { back: true });
      feed(`${u.name} — 「${sk.name}」 아군 ${nHeal}부대 병력 회복`, u.side === 'ally' ? 'good' : 'bad');
    } else if (sk.kind === 'buffSelf') {
      /* v5.60 — 방어뿐 아니라 공격(기마돌격태세·무아지경)·사기까지 오른다
         v5.81 — 유연신법의 회피 +25%·이동력 +1까지 실제로 건다 */
      const tS = sk.turns || 3;
      if (sk.atk) u.buffs.atk = { v: sk.atk, t: tS };
      if (sk.def) u.buffs.def = { v: sk.def, t: tS };
      if (sk.eva) u.buffs.evade = { v: Math.max(sk.eva, (u.buffs.evade && u.buffs.evade.t > 0 && u.buffs.evade.v) || 0), t: tS };
      if (sk.move) u.buffs.move = { v: sk.move, t: tS };
      const moS = skillMoraleOf(sk, true);
      if (moS) moraleShift(u, moS);
      const labS = sk.eva ? '회피↑ 이동+1' : (sk.atk && sk.def ? '공격↑ 방어↑' : sk.atk ? '공격↑' : '방어↑');
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, labS, sk.atk ? '#ffe08a' : '#9fd8ff');
      addFx({ kind: 'buff', x: (rxOf(u) + 0.5) * TILE, y: (ryOf(u) + 0.5) * TILE, life: 600, color: sk.atk ? '255,226,150' : '150,210,255' });
    } else if (sk.kind === 'buffAllAllies') {
      /* v5.60 — 군주 천하호령: 전장에 있는 아군 전원(내 진영 전체)에게 공격·방어·사기.
         한 번에 판 전체 아군이 강해지는 만큼 MP 30 · 3턴이다. */
      const tA = sk.turns || 3;
      const moA = skillMoraleOf(sk, true);
      let hitN = 0;
      B.units.forEach((t) => {
        if (!t.alive || t.side !== u.side) return;
        hitN += 1;
        if (sk.atk) t.buffs.atk = { v: sk.atk, t: tA };
        if (sk.def) t.buffs.def = { v: sk.def, t: tA };
        if (moA) moraleShift(t, moA);
        if (sk.cleanse) ailClear(t, 2);
        addFx({ kind: 'buff', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 700, color: '255,226,150' });
        if (hitN <= 14) addFx({ kind: 'skillfx', sub: 'pillar', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.95) * TILE, life: 1150, color: '255,236,170' });
      });
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.05) * TILE, sk.name, '#ffe9a8', { back: true });
      /* 화면 가운데 큰 콜아웃은 파동 이펙트를 가리므로 쓰지 않는다(피드 한 줄로 알린다) */
      feed(`${u.name} — 「${sk.name}」 전장 아군 ${hitN}부대 강화`, u.side === 'ally' ? 'good' : 'bad');
      shakeScreen(3);
    } else if (sk.kind === 'buffAreaAllies') {
      const rad = sk.radius + Math.max(0, Math.round((u.tfx && u.tfx.radius) || 0));
      const mo = skillMoraleOf(sk, true);
      B.units.forEach((t) => {
        if (t.alive && t.side === u.side && manh(u.x, u.y, t.x, t.y) <= rad) {
          if (sk.atk) t.buffs.atk = { v: sk.atk, t: sk.turns };
          /* v5.58 — 방어 버프(산천진법·불침진형)도 실제로 건다
             v5.81 — 광폭화의 회피 +15%도 실제로 건다 */
          if (sk.def) t.buffs.def = { v: sk.def, t: sk.turns };
          if (sk.eva) t.buffs.evade = { v: Math.max(sk.eva, (t.buffs.evade && t.buffs.evade.t > 0 && t.buffs.evade.v) || 0), t: sk.turns };
          if (sk.move) t.buffs.move = { v: sk.move, t: sk.turns };
          if (mo) moraleShift(t, mo);
          if (sk.cleanse || /상태이상\s*해제|공포\s*상태\s*해제/.test(sk.desc || '')) ailClear(t, 2);
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
      spendSkill(u, sk);
      castCircle(u, sk.kind === 'heal' ? '150,240,180' : '255,215,120');
      SK.sfx.play(sk.kind === 'heal' ? 'heal' : 'spell');
      skillFxAt(u, sk, x, y);
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
      spendSkill(u, sk);
      castCircle(u, sk.kind === 'debuffDef' ? '190,160,255' : '255,170,215');
      SK.sfx.play('spell');
      skillFxAt(u, sk, x, y);
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

    /* ══════════════════════════════════════════════════════════════
       v5.81 — 여러 칸을 덮는 병과 기술 (사용자 개편안)
       pattern: line2(전방 2칸 일렬) · rowFront(전방 가로 3칸) ·
                colBehind(세로 일렬 2칸+돌파) · range2(주변 2칸 내 적 전원)
       ══════════════════════════════════════════════════════════════ */
    if (sk.kind === 'power' && sk.pattern) {
      busy = true;
      spendSkill(u, sk);
      castCircle(u, sk.pattern === 'range2' ? '255,170,215' : '255,236,160');
      SK.sfx.play(sk.pattern === 'range2' ? 'spell' : 'sword');
      skillFxAt(u, sk, x, y, { radius: sk.pattern === 'range2' ? 2 : 1 });
      const dir = (function () {
        const dx = x - u.x, dy = y - u.y;
        return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
      })();
      const perp = { x: -dir.y, y: dir.x };
      let tiles = [];
      if (sk.pattern === 'line2' || sk.pattern === 'colBehind') {
        tiles = [1, 2].map((k) => ({ x: u.x + dir.x * k, y: u.y + dir.y * k }));
      } else if (sk.pattern === 'rowFront') {
        tiles = [-1, 0, 1].map((l) => ({ x: u.x + dir.x + perp.x * l, y: u.y + dir.y + perp.y * l }));
      }
      const foes = B.units.filter((o) => o.alive && o.side !== u.side);
      let tg = sk.pattern === 'range2'
        ? foes.filter((f) => manh(u.x, u.y, f.x, f.y) <= 2)
        : tiles.map((t) => foes.find((o) => o.x === t.x && o.y === t.y)).filter(Boolean);
      tg = tg.sort((a, b) => manh(u.x, u.y, a.x, a.y) - manh(u.x, u.y, b.x, b.y)).slice(0, sk.maxTargets || 99);
      const after = () => {
        if (sk.selfBuff) {
          const tS = sk.selfBuff.turns || 2;
          if (sk.selfBuff.atk) u.buffs.atk = { v: sk.selfBuff.atk, t: tS };
          if (sk.selfBuff.def) u.buffs.def = { v: sk.selfBuff.def, t: tS };
          addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, sk.selfBuff.atk ? '공격↑' : '방어↑', '#ffe08a');
        }
        /* 철기돌파 — 적 뒤 칸으로 돌파 (막혀 있거나 맵 끝이면 제자리) */
        if (sk.dash === 'behind' && tg.length) {
          const far = tg.reduce((m, t) => manh(u.x, u.y, t.x, t.y) > manh(u.x, u.y, m.x, m.y) ? t : m, tg[0]);
          const to = { x: far.x + dir.x, y: far.y + dir.y };
          const ch = (B.tiles[to.y] || [])[to.x];
          const free = ch && ch !== 'C' && ch !== 'H' && ch !== 'W'
            && !B.units.some((o) => o.alive && o.x === to.x && o.y === to.y);
          if (free) {
            u.x = to.x; u.y = to.y; u.rx = to.x; u.ry = to.y;
            addFx({ kind: 'ring', x: (to.x + 0.5) * TILE, y: (to.y + 0.5) * TILE, life: 520, color: '255,236,160' });
            addFloat((to.x + 0.5) * TILE, (to.y + 0.15) * TILE, '돌파!', '#ffe6a8', { back: true });
          }
        }
        if (B && !B.over) finishCheck();
        finish(420);
      };
      const step = (i) => {
        if (!B || B.over) { finish(0); return; }
        if (i >= tg.length) { after(); return; }
        const t = tg[i];
        if (!t.alive) { step(i + 1); return; }
        let mult = sk.power || 1;
        if (sk.ifHpBelow && t.hp / Math.max(1, t.maxHp) <= sk.ifHpBelow.thr / 100) mult *= 1 + sk.ifHpBelow.pct / 100;
        attackUnit(u, t, { mult, defPierce: sk.defPierce || 0, critBonus: sk.crit || 0 }, () => {
          if (!B || B.over) { finish(0); return; }
          if (t.alive) {
            skillAilApply(u, t, sk);
            if (sk.morale < 0) moraleShift(t, Math.max(-20, Number(sk.morale) || 0));
          }
          const vs = sk.vsMount && (t.cls === 'gibi' || (SK.CLASSES[t.cls] && SK.CLASSES[t.cls].mount));
          if (vs) {
            wait(() => {
              if (B && !B.over && t.alive) {
                addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.1) * TILE, '기병 추가타', '#ffe08a', { back: true });
                attackUnit(u, t, { mult: sk.vsMount }, () => wait(() => step(i + 1), 120));
              } else step(i + 1);
            }, 150);
          } else wait(() => step(i + 1), 150);
        });
      };
      if (!tg.length) { addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.15) * TILE, '허탕', '#cfcfcf'); after(); return; }
      step(0);
      return;
    }

    /* v5.81 — 궁수 '화시': 책략이 아닌 물리 공격력 기반 지점 범위 피해 */
    if (sk.kind === 'powerArea') {
      busy = true;
      spendSkill(u, sk);
      castCircle(u, '255,225,170');
      SK.sfx.play('bow');
      const rad = (sk.radius || 1) + Math.max(0, Math.round((u.tfx && u.tfx.radius) || 0));
      skillFxAt(u, sk, x, y, { radius: rad });
      addFloat((x + 0.5) * TILE, (y + 0.15) * TILE, sk.name, '#ffe6a8');
      wait(() => {
        if (!B || B.over) { finish(0); return; }
        const list = B.units.filter((t) => t.alive && t.side !== u.side && manh(x, y, t.x, t.y) <= rad);
        let i = 0;
        const one = () => {
          if (!B || B.over) { finish(0); return; }
          if (i >= list.length) { finishCheck(); finish(420); return; }
          const t = list[i++];
          if (!t.alive) { one(); return; }
          attackUnit(u, t, { mult: sk.power || 1, critBonus: sk.crit || 0, forceKind: 'arrow' }, () => {
            if (t.alive) { skillAilApply(u, t, sk); if (sk.morale < 0) moraleShift(t, sk.morale); }
            wait(one, 120);
          });
        };
        one();
      }, 240);
      return;
    }

    if (sk.kind === 'magicArea') {
      busy = true;
      spendSkill(u, sk);
      castCircle(u, u.cls === 'balseokcha' ? '230,200,150' : '255,170,120');
      SK.sfx.play(u.cls === 'balseokcha' ? 'rock' : 'spell');
      const rad = (sk.radius || 1) + Math.max(0, Math.round((u.tfx && u.tfx.radius) || 0));
      skillFxAt(u, sk, x, y, { radius: rad });
      /* v5.60 — 공격하면서 시전자·주변 아군을 강화하는 책략(팔진화공) */
      const fxSelf = sk.selfBuff || null, fxAlly = sk.allyBuff || null;
      if (fxSelf || fxAlly) {
        const bRad = fxAlly ? (fxAlly.radius || 2) + Math.max(0, Math.round((u.tfx && u.tfx.radius) || 0)) : 0;
        B.units.forEach((t) => {
          if (!t.alive || t.side !== u.side) return;
          const isSelf = t === u;
          if (!isSelf && !(fxAlly && manh(u.x, u.y, t.x, t.y) <= bRad)) return;
          const src = isSelf ? (fxSelf || fxAlly) : fxAlly;
          if (!src) return;
          const tv = src.turns || 3;
          if (src.atk) t.buffs.atk = { v: src.atk, t: tv };
          if (src.def) t.buffs.def = { v: src.def, t: tv };
          if (src.morale) moraleShift(t, Math.max(0, Number(src.morale) || 0));
          addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.25) * TILE, src.atk ? '공격↑' : '방어↑', '#ffe0a0');
          addFx({ kind: 'buff', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 700, color: '255,206,120' });
          addFx({ kind: 'skillfx', sub: 'buffRing', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.6) * TILE, life: 900, color: '255,206,120' });
        });
      }
      wait(() => {
        if (!B || B.over) { finish(0); return; }
        addFx({ kind: 'burst', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 620, color: '255,150,80' });
        addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 760 });
        /* v6.0 — 불붙은 돌(투석·화염투석)이 갈대밭에 떨어지면 그 일대가 탄다 */
        if (isFireSkill(sk)) {
          for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) if (Math.abs(dx) + Math.abs(dy) <= rad) igniteAt(x + dx, y + dy, u.side, 1);
          }
        }
        B.units.forEach((t) => {
          if (t.alive && t.side !== u.side && manh(x, y, t.x, t.y) <= rad) {
            const dmg = Math.max(10, Math.round((sk.power * 0.70 + magicAtk(u) * 2.25 - magicDef(t) * 2.20) * sizeScale(t) * 0.8
              * (1 + fxPct(u, 'magic')) * (1 - Math.min(0.5, Math.max(-0.5, fxPct(t, 'magicTaken')))) * vpMagicMul(u, t)));
            t.hp = Math.max(0, t.hp - dmg);
            addMagicDamage(u, t, dmg);
            t.flash = 1; t.shake = 240;
            addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.4) * TILE, String(dmg), '#ffb36a');
            if (t.hp <= 0) downUnit(t);
            else skillAilApply(u, t, sk);   // v5.31 — 낙뢰(기절)·독무술(중독)·천벌폭풍
            /* v5.60 — 지진술 같은 '적 방어 -N%' 광역 약화 */
            if (t.alive && sk.defDown && sk.defDown.amount) {
              t.buffs.def = { v: sk.defDown.amount, t: sk.defDown.turns || 2 };
              addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.22) * TILE, '방어↓', '#d8c08a');
            }
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
    spendSkill(u, sk);
    if (sk.kind === 'magic') {
      castCircle(u, '255,170,120');
      SK.sfx.play('spell');
      wait(() => {
        if (!B || B.over) { finish(0); return; }
        const dmg = Math.max(10, Math.round((sk.power * 0.60 + magicAtk(u) * 3.40 - magicDef(target) * 2.25) * sizeScale(target) * 0.8
          * (1 + fxPct(u, 'magic')) * (1 - Math.min(0.5, Math.max(-0.5, fxPct(target, 'magicTaken')))) * vpMagicMul(u, target)));
        target.hp = Math.max(0, target.hp - dmg);
        addMagicDamage(u, target, dmg);
        target.flash = 1; target.shake = 240;
        addFloat((x + 0.5) * TILE, (y + 0.4) * TILE, '화계 ' + dmg, '#ffb36a');
        fireSpreadFrom(u, target, sk, 'magic');
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
    /* v5.81 — 암살일격: 적 병력 50% 이하이면 추가 피해 +30% */
    if (sk.ifHpBelow && target.hp / Math.max(1, target.maxHp) <= sk.ifHpBelow.thr / 100) mult *= 1 + sk.ifHpBelow.pct / 100;
    if (sk.waterBonus && B.tiles[u.y][u.x] === 'W') mult += 0.15;
    if (sk.vsMount && (target.cls === 'gibi' || (SK.CLASSES[target.cls] && SK.CLASSES[target.cls].mount))) mult += sk.vsMount;
    if (sk.siegeBonus) {
      const tch = B.tiles[target.y][target.x];
      if (tch === 'G' || tch === 'D') mult += sk.siegeBonus;
    }
    /* v5.60 — 이펙트 태그가 곧 투사체 종류다 (화살비·연노는 arrow/bolt, 포차는 rock) */
    const pTag = skillFxTag(u, sk);
    const ranged = ['arrow', 'arrowRain', 'bolt', 'boltStorm', 'rock'].indexOf(pTag) >= 0
      || ['yeonno', 'jipsajung', 'gwanse', 'pogyeok', 'yeonpo', 'tuseok', 'hwayeom', 'hwagye'].indexOf(sk.key) >= 0;
    const forceKind = ranged
      ? (pTag === 'rock' || u.cls === 'pocha' || u.cls === 'balseokcha' ? 'rock'
        : (pTag === 'bolt' || pTag === 'boltStorm' || u.cls === 'yeonnobyung' ? 'bolt' : 'arrow'))
      : null;
    addFloat((x + 0.5) * TILE, (y + 0.15) * TILE, sk.name, '#ffe6a8');
    skillFxAt(u, sk, x, y, { target: target });
    if (ranged) SK.sfx.play(forceKind === 'rock' ? 'rock' : forceKind === 'bolt' ? 'bolt' : 'bow');
    const hits = sk.hits || 1;
    const apply = (n) => {
      attackUnit(u, target, { mult, ignoreTerrain: sk.ignoreTerrain, forceKind,
        defPierce: sk.defPierce || 0, noDodge: !!sk.ignoreEvade, critBonus: sk.crit || 0 }, () => {
        /* v5.31 — 파천격(기절 35%)·방패돌진(기절 20%) */
        if (target.alive && B && !B.over) skillAilApply(u, target, sk);
        /* v5.60 — 패왕참·산채습격처럼 '적 사기 -N'이 붙은 강타 */
        if (target.alive && B && !B.over && sk.morale < 0) moraleShift(target, Math.max(-20, Number(sk.morale) || 0));
        if (n > 1 && target.alive && B && !B.over) {
          wait(() => { if (B && !B.over && target.alive) apply(n - 1); else finish(300); }, 160);
        } else {
          /* v5.81 — 공격 뒤에 자기 강화가 붙는 기술 (기마돌격태세·철벽방어·일섬·무아지경) */
          if (B && !B.over && sk.selfBuff) {
            const tS = sk.selfBuff.turns || 2;
            if (sk.selfBuff.atk) u.buffs.atk = { v: sk.selfBuff.atk, t: tS };
            if (sk.selfBuff.def) u.buffs.def = { v: sk.selfBuff.def, t: tS };
            addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, sk.selfBuff.atk ? '공격↑' : '방어↑', '#ffe08a');
          }
          if (sk.morale > 0 && B && !B.over) moraleShift(u, sk.morale);
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
  /* 이 부대의 고유 필살기 — v5.81: S급과 A급 모두 (A급은 cutinTier:'A' 로 한 단계 낮다) */
  function ultOf(u) {
    if (!u || !SK.ULTIMATES) return null;
    const t = unitTier(u);
    if (t !== 'S' && t !== 'A') return null;
    const spec = SK.ULTIMATES[u.name] || null;
    if (!spec) return null;
    if (!spec.tier) spec.tier = (t === 'A' ? 'A' : 'S');
    return spec;
  }
  const ULT_TARGET_KINDS = { hit: 1, combo: 1, aoe: 1, arrow: 1, arrowAoe: 1, magic: 1, rock: 1, debuff: 1, line: 1 };
  function ultNeedsTarget(spec) { return !!(spec && spec.e && ULT_TARGET_KINDS[spec.e.k]); }
  function ultRange(u, spec) {
    if (!u || !spec || !spec.e) return 1;
    if (spec.e.rng) return spec.e.rng;
    const k = spec.e.k;
    if (k === 'line') return (spec.e.len || 2) + 1;
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
      case 'line': return `${e.len || 2}칸 직선 관통${e.stat === 'int' ? ' 계략' : ''} ${pc(e.m || e.p || 1)}${ail}`;
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
  /* v5.82 — 필살기 한 줄 설명: 새로 붙은 개성(관통·치명·처치·광역·회복)을 문장에 더한다 */
  function ultExtraText(spec) {
    const e = spec && spec.e;
    if (!e) return '';
    const s = [];
    if (e.pierce) s.push(`방어 ${Math.round(e.pierce * 100)}% 무시`);
    if (e.crit) s.push(`치명 ${Math.round((e.crit.chance || 0) * 100)}% (×${e.crit.mul || 1.5})`);
    if (e.execute) s.push(`HP ${e.execute.hpBelow}% 이하 +${e.execute.bonusPct}%`);
    if (e.lowHpBonus) s.push(`잃은 병력 10%당 +${e.lowHpBonus.per10}%`);
    if (e.moveBonus) s.push(`이동 후 +${e.moveBonus}%`);
    if (e.stun) s.push(`기절 ${Math.round((e.stun.chance == null ? 1 : e.stun.chance) * 100)}%`);
    if (e.burn && !/화상/.test(spec.desc || '')) s.push(`화상 ${e.burn.turns}턴`);
    if (e.lifesteal) s.push(`흡혈 ${Math.round(e.lifesteal * 100)}%`);
    if (e.mp && e.mp.gain) s.push(`MP +${e.mp.gain}`);
    if (e.mp && e.mp.drain) s.push(`MP ${e.mp.drain} 흡수`);
    if (e.heal) s.push(`HP ${Math.round(e.heal.pct * 100)}% 회복`);
    if (e.buff) {
      const b = [];
      if (e.buff.atk) b.push(`공격 +${Math.round(e.buff.atk * 100)}%`);
      if (e.buff.def) b.push(`방어 +${Math.round(e.buff.def * 100)}%`);
      if (e.buff.evade) b.push(`회피 +${Math.round(e.buff.evade * 100)}%`);
      if (e.buff.counter) b.push(`반격 +${Math.round(e.buff.counter * 100)}%`);
      if (e.buff.magicDef) b.push(`계략방어 +${Math.round(e.buff.magicDef * 100)}%`);
      if (b.length) s.push(`아군 ${b.join('·')}(${e.buff.turns || 2}턴)`);
    }
    if (e.debuff && e.debuff.move) s.push(`적 이동 ${e.debuff.move}`);
    if (e.shred) s.push('방어 누적 감소');
    if (e.selfCost) s.push(`자신 HP ${e.selfCost.hpPct}% 소모`);
    if (e.cover) s.push('인접 아군 피해 40% 대신 받음(3턴)');
    if (e.enemyAll) {
      if (e.enemyAll.morale) s.push(`적 전체 사기 ${e.enemyAll.morale}`);
      if (e.enemyAll.burn) s.push('적 전체 화상');
    }
    if (e.onKill) {
      if (e.onKill.extraAction) s.push('처치 시 재행동');
      if (e.onKill.heal) s.push(`처치 시 HP ${Math.round(e.onKill.heal * 100)}% 회복`);
      if (e.onKill.allyMorale) s.push(`처치 시 아군 사기 +${e.onKill.allyMorale}`);
    }
    return s.join(' · ');
  }
  /* UI·세부창 공용 한 줄 설명 */
  function ultTextOf(spec) {
    if (!spec) return '';
    if (spec.desc) return spec.desc;
    const base = ultDesc(spec);
    const ex = ultExtraText(spec);
    return ex ? `${base} · ${ex}` : base;
  }
  SK.ultDescText = ultTextOf;

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
    /* v5.81 — A급 컷인은 한 단계 조용한 연출 (CSS #ult-cutin[data-tier="A"]) */
    el.dataset.tier = spec.tier || 'S';
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
  /* v5.82 — 필살기 타격: 방어 관통·치명 확정·HP 비율 추가피해·잃은 병력 비례·
     이동 후 보너스·방어 누적 감소·MP 흡수를 한 자리에서 처리한다. */
  function ultStrike(u, t, mult, e, opts) {
    if (!t || !t.alive) return 0;
    e = e || {};
    let m = mult;
    if (e.moveBonus && (u.movedTiles || 0) >= 1) m *= 1 + e.moveBonus / 100;
    if (e.lowHpBonus) {
      const lost = Math.max(0, 1 - u.hp / Math.max(1, u.maxHp));
      const steps = Math.floor(lost * 10);
      m *= 1 + Math.min(e.lowHpBonus.max, steps * e.lowHpBonus.per10) / 100;
    }
    if (e.execute && t.maxHp && t.hp / t.maxHp <= e.execute.hpBelow / 100) m *= 1 + e.execute.bonusPct / 100;
    const res = calcDamage(u, t, Object.assign({ mult: m, noCrit: true, firstStrike: false, defPierce: e.pierce || 0 }, opts || {}));
    let dmg = res.dmg;
    let crit = false;
    if (e.crit && Math.random() < (e.crit.chance || 0)) {
      crit = true;
      dmg = Math.round(dmg * (e.crit.mul || 1.5));
    }
    applyDamage(u, t, dmg, crit, null);
    addFx({ kind: 'spark', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.4) * TILE, life: 300, color: '255,230,170' });
    if (e.lifesteal && u.alive) {
      const hl = Math.max(1, Math.round(dmg * e.lifesteal));
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + hl);
      if (u.hp > before) {
        addHeal(u, u.hp - before, u);
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.28) * TILE, '+' + (u.hp - before), '#a8f0b8');
      }
    }
    if (t.alive && e.shred && e.shred.def) {
      const cur = (t.buffs.def && t.buffs.def.v) || 0;
      t.buffs.def = { v: Math.max(-0.5, cur + e.shred.def), t: 2 };
      addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.22) * TILE, '방어↓', '#d8c08a');
    }
    if (t.alive && e.mp && e.mp.drain) {
      const dr = Math.min(t.mp || 0, e.mp.drain);
      t.mp -= dr;
      u.mp = Math.min(u.maxMp, (u.mp || 0) + dr);
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, `MP +${dr}`, '#bfe8ff');
    }
    return dmg;
  }
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
      * (1 - Math.min(0.5, Math.max(-0.5, fxPct(t, 'magicTaken')))) * vpMagicMul(u, t)));
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
  /* v5.82 — 3~4칸 직선 관통: 시전자에서 대상 방향으로 len칸까지 줄 위의 적 */
  function ultLineFoes(u, tgt, len) {
    let dx = 0, dy = 0;
    if (tgt) {
      dx = Math.sign(tgt.x - u.x);
      dy = Math.sign(tgt.y - u.y);
    }
    if (!dx && !dy) { dx = (u.face > 0 ? 1 : -1); }
    if (dx && dy) dy = 0;   // 대각선은 가로로 편다 (격자 직선)
    const out = [];
    for (let i = 1; i <= (len || 2); i++) {
      const x = u.x + dx * i, y = u.y + dy * i;
      B.units.forEach((o) => {
        if (!o.alive || o.side === u.side) return;
        if (o.x === x && o.y === y && out.indexOf(o) < 0) out.push(o);
      });
    }
    return out;
  }
  function applyUlt(u, spec, tgt) {
    if (!B || B.over || !u || !spec) return null;
    const e = spec.e || {};
    const foes = B.units.filter((o) => o.alive && o.side !== u.side);
    const allies = B.units.filter((o) => o.alive && o.side === u.side);
    const out = { dmg: 0, hits: [], kills: [] };
    /* v5.82 — 자신의 병력을 태워 쓰는 필살기 (계백 황산벌 결사) */
    if (e.selfCost && e.selfCost.hpPct) {
      const cost = Math.min(u.hp - 1, Math.round(u.maxHp * e.selfCost.hpPct / 100));
      if (cost > 0) {
        u.hp -= cost;
        addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.28) * TILE, `-${cost}`, '#ff9a86');
        statOf(u).taken += cost;
      }
    }
    const ail = (t) => {
      if (!t || !t.alive) return;
      if (e.ail) ailApply(t, e.ail, e.ch == null ? 1 : e.ch, e.turns);
      if (e.stun) ailApply(t, 'stun', e.stun.chance == null ? 1 : e.stun.chance, e.stun.turns || 1);
      if (e.burn) {
        if (ailApply(t, 'burn', 1, e.burn.turns || 2)) {
          t.ailDot = t.ailDot || {};
          t.ailDot.burn = Math.max(e.burn.dot || 0.04, t.ailDot.burn || 0);
        }
      }
    };
    const track = (t) => { if (t && !t.alive && out.kills.indexOf(t.name) < 0) out.kills.push(t.name); };
    if (e.k === 'hit' || e.k === 'arrow') {
      if (!tgt || !tgt.alive) return out;
      if (e.k === 'arrow' && (e.n || 1) > 1) {
        const per = (e.m || 1.3) / (e.n || 1);
        for (let i = 0; i < (e.n || 1); i++) wait(() => { if (B && !B.over && tgt.alive) out.dmg += ultStrike(u, tgt, per, e); }, 90 * i);
      } else {
        out.dmg += ultStrike(u, tgt, e.m || 1.3, e);
      }
      ail(tgt);
      track(tgt);
    } else if (e.k === 'combo') {
      if (!tgt || !tgt.alive) return out;
      const n = e.n || 2, per = (e.m || 1.4) / n;
      for (let i = 0; i < n; i++) {
        wait(() => {
          if (!B || B.over || !tgt.alive) return;
          out.dmg += ultStrike(u, tgt, per, e);
          addFx({ kind: 'slash', x: (rxOf(tgt) + 0.5) * TILE, y: (ryOf(tgt) + 0.45) * TILE, life: 320 });
        }, 130 * i);
      }
      wait(() => { ail(tgt); track(tgt); }, 130 * n + 40);
    } else if (e.k === 'aoe' || e.k === 'arrowAoe') {
      const cx = tgt ? tgt.x : u.x, cy = tgt ? tgt.y : u.y;
      const list = ultFoesAt(cx, cy, e.r || 1, u.side);
      list.forEach((t, i) => {
        wait(() => {
          if (!B || B.over || !t.alive) return;
          let d = 0;
          const n = (e.k === 'arrowAoe') ? (e.n || 2) : 1;
          for (let k = 0; k < n; k++) d += ultStrike(u, t, (e.m || 1) / n, e);
          out.dmg += d;
          out.hits.push(t.name);
          ail(t);
          track(t);
          if (t.alive && e.morale) moraleShift(t, e.morale);
          addFx({ kind: 'burst', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.45) * TILE, life: 420, color: spec.c });
        }, 80 + i * 90);
      });
    } else if (e.k === 'line') {
      /* v5.82 — 3~4칸 직선 관통 (마초·손책·광개토대왕·육손) */
      const list = ultLineFoes(u, tgt, e.len || 2);
      if (!list.length && tgt && tgt.alive) list.push(tgt);
      list.forEach((t, i) => {
        wait(() => {
          if (!B || B.over || !t.alive) return;
          const stat = e.stat === 'int';
          const d = stat ? ultMagicHit(u, t, e.p || 1.0) : ultStrike(u, t, e.m || 1.0, e);
          out.dmg += d;
          out.hits.push(t.name);
          ail(t);
          track(t);
          if (t.alive && e.morale) moraleShift(t, e.morale);
          addFx({ kind: 'burst', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.45) * TILE, life: 420, color: spec.c });
        }, 90 + i * 90);
      });
    } else if (e.k === 'magic' || e.k === 'rock') {
      const cx = tgt ? tgt.x : u.x, cy = tgt ? tgt.y : u.y;
      const list = ultFoesAt(cx, cy, e.r || 1, u.side);
      list.forEach((t, i) => {
        wait(() => {
          if (!B || B.over || !t.alive) return;
          const md = ultMagicHit(u, t, e.p || 1.2);
          out.dmg += md;
          out.hits.push(t.name);
          /* v5.82 — 계략형 필살기의 MP 흡수·흡혈·방어 약화도 함께 */
          if (t.alive && e.mp && e.mp.drain) {
            const dr = Math.min(t.mp || 0, e.mp.drain);
            t.mp -= dr;
            u.mp = Math.min(u.maxMp, (u.mp || 0) + dr);
            addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, `MP +${dr}`, '#bfe8ff');
          }
          if (e.lifesteal && u.alive && md > 0) {
            const hl = Math.max(1, Math.round(md * e.lifesteal));
            u.hp = Math.min(u.maxHp, u.hp + hl);
            addHeal(u, hl, u);
          }
          if (t.alive && e.shred && e.shred.def) {
            const cur = (t.buffs.def && t.buffs.def.v) || 0;
            t.buffs.def = { v: Math.max(-0.5, cur + e.shred.def), t: 2 };
          }
          ail(t);
          track(t);
          if (t.alive && e.morale) moraleShift(t, e.morale);
        }, 120 + i * 80);
      });
    } else if (e.k === 'buff') {
      const r = e.r || 2;
      const b = e.buff || null;
      const gain = (a) => {
        const tS = (b && b.turns) || e.turns || 3;
        if (e.atk || (b && b.atk)) a.buffs.atk = { v: (b && b.atk) || e.atk, t: tS };
        if (e.def || (b && b.def)) a.buffs.def = { v: (b && b.def) || e.def, t: tS };
        if (b && b.evade) a.buffs.evade = { v: b.evade, t: tS };
        if (b && b.counter) a.buffs.counter = { v: b.counter, t: tS };
        if (b && b.magicDef) a.buffs.magicDef = { v: b.magicDef, t: tS };
        if (e.morale) moraleShift(a, e.morale);
        if (e.mp && e.mp.gain) a.mp = Math.min(a.maxMp, (a.mp || 0) + e.mp.gain);
        if (e.heal && e.heal.pct) {
          const hl = Math.round(a.maxHp * e.heal.pct);
          a.hp = Math.min(a.maxHp, a.hp + hl);
          addHeal(a, hl, u);
          addFloat((rxOf(a) + 0.5) * TILE, (ryOf(a) + 0.35) * TILE, '+' + hl, '#a8f0b8');
        }
        if (e.clear) ailClear(a, 3);
      };
      const whole = !e.r || e.r >= 9;
      allies.filter((a) => whole || manh(u.x, u.y, a.x, a.y) <= r).forEach((a) => {
        gain(a);
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
      allies.filter((aa) => manh(u.x, u.y, aa.x, aa.y) <= r).forEach((aa) => {
        const hl = Math.round(aa.maxHp * (e.p || 0.14));
        aa.hp = Math.min(aa.maxHp, aa.hp + hl);
        addHeal(aa, hl, u);
        if (e.clear) ailClear(aa, 3);
        if (e.atk) aa.buffs.atk = { v: e.atk, t: e.turns || 3 };
        if (e.morale) moraleShift(aa, e.morale);
        out.hits.push(aa.name);
        addFloat((rxOf(aa) + 0.5) * TILE, (ryOf(aa) + 0.35) * TILE, '+' + hl, '#a8f0b8');
        addFx({ kind: 'heal', x: (rxOf(aa) + 0.5) * TILE, y: (ryOf(aa) + 0.5) * TILE, life: 680 });
      });
    } else if (e.k === 'debuff') {
      const cx = tgt ? tgt.x : u.x, cy = tgt ? tgt.y : u.y;
      const r = e.r || 2;
      const list = tgt ? ultFoesAt(cx, cy, r, u.side)
        : foes.filter((t) => manh(u.x, u.y, t.x, t.y) <= ultRange(u, spec));
      list.forEach((t) => {
        const db = e.debuff || null;
        const tS = (db && db.turns) || e.turns || 3;
        if (e.def || (db && db.def)) t.buffs.def = { v: (db && db.def) || e.def, t: tS };
        if (e.atk || (db && db.atk)) t.buffs.atk = { v: (db && db.atk) || e.atk, t: tS };
        if (db && db.move) { t.buffs.moveDown = { v: db.move, t: tS }; t.slow = 1; }
        if (e.morale) moraleShift(t, e.morale);
        ail(t);
        out.hits.push(t.name);
        addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.3) * TILE, '약화!', '#c9a6ff');
        addFx({ kind: 'buff', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 620, color: spec.c });
      });
    }
    /* v5.82 — 자신만/인접 아군만 강화하는 필살기 (조운 회피 +30%, 김유신 인접 공격 +15%) */
    const applyBuffTo = (t, bt) => {
      if (!t || !t.alive || !bt) return;
      const tB = bt.turns || 2;
      if (bt.atk) t.buffs.atk = { v: bt.atk, t: tB };
      if (bt.def) t.buffs.def = { v: bt.def, t: tB };
      if (bt.evade) t.buffs.evade = { v: bt.evade, t: tB };
      if (bt.counter) t.buffs.counter = { v: bt.counter, t: tB };
      if (bt.magicDef) t.buffs.magicDef = { v: bt.magicDef, t: tB };
      addFx({ kind: 'buff', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.5) * TILE, life: 640, color: spec.c });
      addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.2) * TILE, '필살기 ↑', '#ffe08a');
    };
    if (e.selfBuff) applyBuffTo(u, e.selfBuff);
    if (e.adjacentBuff) {
      allies.filter((a) => a !== u && manh(u.x, u.y, a.x, a.y) <= 1).forEach((a) => applyBuffTo(a, e.adjacentBuff));
    }
    /* v5.82 — 아군을 강화하며 곁의 적을 함께 때리는 필살기 (유비 인덕의 맹약) */
    if (e.allyHit) {
      ultFoesAt(u.x, u.y, e.allyHit.r || 1, u.side).forEach((t, i) => {
        wait(() => {
          if (!B || B.over || !t.alive) return;
          out.dmg += ultStrike(u, t, (e.allyHit.pct || 80) / 100, e);
          out.hits.push(t.name);
          track(t);
          addFx({ kind: 'burst', x: (rxOf(t) + 0.5) * TILE, y: (ryOf(t) + 0.45) * TILE, life: 420, color: spec.c });
        }, 120 + i * 90);
      });
    }
    /* v5.82 — 전장 전체를 흔드는 부수 효과 (이순신 학익진·세종 집현전) */
    if (e.enemyAll) {
      foes.forEach((t) => {
        if (e.enemyAll.morale) moraleShift(t, e.enemyAll.morale);
        if (e.enemyAll.burn) {
          if (ailApply(t, 'burn', 1, e.enemyAll.burn.turns || 2)) {
            t.ailDot = t.ailDot || {};
            t.ailDot.burn = Math.max(e.enemyAll.burn.dot || 0.04, t.ailDot.burn || 0);
          }
        }
        addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.25) * TILE, e.enemyAll.morale ? `사기 ${e.enemyAll.morale}` : '화상', '#c9a6ff');
      });
    }
    if (e.cover) {
      u.vpCover = 3;
      addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.16) * TILE, '아군을 가린다', '#ffe08a', { back: true });
    }
    /* 부수 효과: 아군 공격 보정·자기 방어 */
    if (e.allyAtk) {
      allies.filter((a) => manh(u.x, u.y, a.x, a.y) <= 2).forEach((a) => { a.buffs.atk = { v: e.allyAtk, t: 3 }; });
    }
    if (e.selfDef) u.buffs.def = { v: e.selfDef, t: 3 };
    /* v5.82 — 처치 시 보상 (여포·장료 재행동 · 하후돈 회복 · 계백·광개토 사기) */
    if (e.onKill) {
      wait(() => {
        if (!B || B.over || !u.alive) return;
        const ok = e.onKill.extraAction ? out.kills.length > 0 : out.kills.length > 0;
        if (!ok) return;
        if (e.onKill.extraAction) {
          u.acted = false;
          u.vpExtraAct = true;
          feed(`${u.name} — 「${spec.n}」으로 적을 베고 한 번 더 움직인다`, u.side === 'ally' ? 'good' : 'bad');
          addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.08) * TILE, '재행동!', '#ffe08a', { back: true });
          if (u.side === 'ally') { B.reachCache = null; selectUnit(u); }
        }
        if (e.onKill.heal) {
          const hl = Math.round(u.maxHp * e.onKill.heal);
          u.hp = Math.min(u.maxHp, u.hp + hl);
          addHeal(u, hl, u);
          addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.2) * TILE, '+' + hl, '#a8f0b8');
        }
        if (e.onKill.allyMorale) {
          B.units.forEach((a) => { if (a.alive && a.side === u.side) moraleShift(a, e.onKill.allyMorale); });
        }
      }, 700);
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     v5.84 — 필살기 타격 임팩트 (js/patch_v584.js 의 V584_ULT_FX)
     · 캔버스 위 실제 대상 부대의 '화면 좌표'를 넘겨서
       암전·화면 흔들림·히트스톱·Canvas 파티클·큰 데미지 팝업을 띄운다.
     · 컷인 배너(1.35초)가 닫히기 직전(760ms)에 터지고, 턴은 그 연출이
       끝난 뒤(1750ms) 넘어간다. 타격감만 더하고 전투 규칙은 건드리지 않는다.
     ══════════════════════════════════════════════════════════════════ */
  function v584Fx() { return (typeof window !== 'undefined' && window.V584_ULT_FX) || null; }
  /* 부대 한 칸이 차지하는 화면 사각형 (전장 캔버스 + 카메라 좌표) */
  function ultScreenRect(t) {
    if (!t || !stage) return null;
    const r = stage.getBoundingClientRect();
    const s = cam.s || 1, w = Math.max(18, TILE * s);
    const cx = r.left + (rxOf(t) + 0.5) * TILE * s + cam.x;
    const cy = r.top + (ryOf(t) + 0.55) * TILE * s + cam.y;
    return { left: cx - w / 2, top: cy - w / 2, width: w, height: w };
  }
  function ultImpactFx(u, spec, tgt, dmg) {
    const FX = v584Fx();
    if (!FX || !FX.play || !B || !stage) return;
    /* v5.83 관전 모드(×10)에서는 한 전투가 몇 초에 지나간다 — 2초짜리 연출을 겹치우지 않는다 */
    if (paceBoost > 1) return;
    const e = (spec && spec.e) || {};
    const main = (tgt && tgt.x != null) ? tgt : u;
    const rc = ultScreenRect(main);
    if (!rc) return;
    const n = Math.round(Math.max(0, Number(dmg) || 0));
    let pr = null;
    try {
      pr = FX.play({
        kind: FX.kindOf ? FX.kindOf(e) : 'hit',
        tier: spec.tier === 'A' ? 'A' : 'S',
        color: (typeof spec.c === 'string' ? spec.c : null) || (FX.colorOf ? FX.colorOf('hit') : '255,90,70'),
        targetElOrRect: rc,
        shakeEl: stage,
        dmgText: n > 0 ? n.toLocaleString('ko-KR') : ''
      });
    } catch (err) { /* 연출 실패가 전투를 멈추지 않게 */ }
    /* 연출이 끝나면 빈 캔버스 충만 남기지 않고 오버레이를 거둔다 (다른 연출이 떠 있으면 그대로 둔다) */
    if (pr && pr.then) {
      pr.then(() => setTimeout(() => {
        try {
          const r = document.getElementById('v584-fx-root');
          if (r && !r.querySelector('div') && FX.stop) FX.stop();
        } catch (err) { /* ignore */ }
      }, 160));
    }
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
    const isA = (spec.tier === 'A');
    feed(`${u.name}의 필살기 — 「${spec.n}」${isA ? ' (A급)' : ''}`, u.side === 'ally' ? 'good' : 'bad');
    addFloat((rxOf(u) + 0.5) * TILE, (ryOf(u) + 0.1) * TILE, `「${spec.n}」`, '#ffe6a8', { back: true });
    shakeScreen(isA ? 3 : 7);
    SK.sfx.play('spell');
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      /* v5.82 — 처치 시 재행동(여포·장료)은 castUlt의 마무리(acted=true)보다 먼저 왔다.
         그 약속을 마무리에서 살린다. */
      u.acted = !u.vpExtraAct;
      u.vpExtraAct = false;
      busy = false;
      SKBattle.refreshUI();
      /* v5.84 — 광역·연타·계략 필살기의 피해는 applyUlt 안의 지연 콜백에서 들어간다.
         380ms에 본 finishCheck 는 그 전을 지나가므로, 적을 전멸시킨 필살기가 승리를
         못 알리고 빈 전장에 서 있던 문제를 여기서 한 번 더 보고막는다. */
      if (B && !B.over) finishCheck();
      if (!B || B.over) { if (done) done(); return; }
      if (done) done(); else nextUnitOrWait();
    };
    wait(() => { if (B && !B.over) ultVfx(u, spec, tgt); }, 150);
    /* v5.84 — 이번 필살기가 실제로 입힌 피해 (V584 타격 팝업에 그대로 쓴다) */
    let fxDmg = 0;
    const fxHp = B.units.filter((o) => o.alive).map((o) => ({ u: o, hp: o.hp, side: o.side }));
    wait(() => {
      if (!B || B.over) { end(); return; }
      const out = applyUlt(u, spec, tgt);
      if (out && out.dmg > 0) fxDmg = out.dmg;
      finishCheck();
    }, 380);
    /* v5.84 — 컷인 배너가 닫히기 직전, 실제 대상 칸에 타격 임팩트.
       900ms: applyUlt 안의 지연 콜백(광역 10명이면 890ms)까지 끝나 실제 피해가 다 들어온 뒤다. */
    wait(() => {
      if (!B || B.over) return;          // 승패가 갈린 일격은 결과 창이 대신한다
      let d = fxDmg;
      if (!d) {
        for (let i = 0; i < fxHp.length; i++) {
          const rec = fxHp[i];
          if (rec.side === u.side) continue;
          d += Math.max(0, rec.hp - Math.max(0, rec.u.hp));
        }
      }
      ultImpactFx(u, spec, tgt, d);
    }, 900);
    wait(end, 1750);
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
          } else if (e.k === 'line') {
            /* v5.82 — 3~4칸 직선 관통: 그 줄에 선 적을 모두 센다 */
            const near = ultLineFoes({ x: sp.x, y: sp.y, side: u.side, face: u.face }, t, e.len || 2);
            hitN = Math.max(1, near.length);
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
      /* v5.81 — A급은 배율이 낮은 만큼 조금 더 자주 쓴다 */
      const minRatio = spec.tier === 'A' ? 0.22 : 0.3;
      if (!(best.kill || best.hitN >= 2 || best.ratio >= minRatio)) return null;
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
    const isSA = !!(u && (unitTier(u) === 'S' || unitTier(u) === 'A'));
    const used = !!(u && u.ultUsed);
    const canUse = !!(u && u.side === 'ally' && !u.acted && spec && !used);
    /* v5.65 — 고유 필살기가 없는 일반 장수를 골랐을 때는 회색 잠금으로 확실히 비활성 표시 */
    const noUlt = !!(u && u.side === 'ally' && !spec);
    if (em) em.textContent = !u ? '—' : (spec ? (used ? '0/1' : '1/1') : '없음');
    btn.classList.toggle('ready', canUse);
    btn.classList.toggle('off', !canUse);
    btn.classList.toggle('locked', noUlt);
    btn.classList.toggle('active', mode === 'ultTarget' && canUse);
    btn.setAttribute('aria-disabled', canUse ? 'false' : 'true');
    btn.title = !u ? '부대를 고르면 필살기를 쓸 수 있습니다'
      : !spec ? (isSA ? '이 장수의 고유 필살기가 아직 없습니다' : '고유 필살기는 S·A급 장수가 씁니다')
        : used ? `「${spec.n}」 — 이 전투에서 사용 완료` : `「${spec.n}」 — 전투당 1회${spec.tier === 'A' ? ' (A급)' : ''}`;
    const lab = btn.querySelector('b');
    if (lab) lab.textContent = '필살기';
  }

  function openUltMenu() {
    const u = B && B.sel;
    if (!B || B.phase !== 'ally' || B.over) return;
    if (!u || u.side !== 'ally' || u.acted) { SK.toast('먼저 내 부대를 선택하세요.'); return; }
    const spec = ultOf(u);
    if (!spec) { SK.toast((unitTier(u) === 'S' || unitTier(u) === 'A') ? '이 장수의 고유 필살기가 아직 없습니다.' : '고유 필살기는 S·A급 장수가 씁니다.'); return; }
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
  const GI_TRIGGER = { passive: '상시', turn_start: '턴 시작', on_attack: '공격 시', domestic: '내정', on_kill: '처치 시', after_action: '행동 후' };
  /* v5.56 — 등급 배지 (장수 등급 그대로: S>A>B>C) + 내정 특기 표시 */
  const GI_TIER_CLASS = { S: 'tier-S', A: 'tier-A', B: 'tier-B', C: 'tier-C' };
  function giTierOf2(u) {
    if (u.tier) return u.tier;
    const h = SK.state && SK.state.heroes ? SK.state.heroes.find((x) => x.uid === u.uid) : null;
    if (h && h.tier) return h.tier;
    const g = SK.GEN_BY_NAME ? SK.GEN_BY_NAME[u.name] : null;
    return (g && g.tier) || 'C';
  }
  function giPassiveNote(p) {
    if (!p) return '';
    /* 내정형은 effect 문구에 이미 '이 성에 주둔하면 … +N%'가 들어 있다 */
    if (p.kind === 'domestic') return '';
    /* applied = data/unique_passives.json 에 적힌 **실제 전장 적용 수치** (문구와 별개로 코드가 하는 일) */
    if (p.applied) return `<p class="gi-trait-note"><b>${p.applied}</b></p>`;
    const tr = p.trigger;
    if (tr === 'passive') return '<p class="gi-trait-note">전투 내내 적용 (공격·방어 양쪽)</p>';
    if (tr === 'turn_start') return '<p class="gi-trait-note">매 아군 페이즈 시작에 자동 발동</p>';
    if (tr === 'on_kill') return '<p class="gi-trait-note">이 부대가 적을 쓰러뜨릴 때 전투당 1회 자동 발동</p>';
    return '<p class="gi-trait-note">이 부대가 공격할 때 전투당 1회 자동 발동</p>';
  }

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
    const morale = Math.round(u.morale == null ? 80 : u.morale);
    const moralePct = Math.round((moraleMul(u) - 1) * 100);
    const trainV = Math.round(trainValOf(u));
    const trainPct = Math.round((trainMul(u) - 1) * 1000) / 10;
    const critP = Math.round(trainCritBonus(u) * 1000) / 10;
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
      ['훈련도', trainV],
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
      <p class="gi-sec">지형·사기·훈련도</p>
      <div class="gi-state">
        <span class="gi-st">${tr.name}</span>
        <span class="gi-st ${tr.def >= 0 ? 'good' : 'bad'}">방어 ${tr.def >= 0 ? '+' : ''}${Math.round(tr.def * 100)}%</span>
        ${hold}
        <span class="gi-st ${morale >= 80 ? 'good' : 'bad'}">사기 ${morale} <em>공·방 ${moralePct >= 0 ? '+' : ''}${moralePct}%</em></span>
        <span class="gi-st ${trainV >= 50 ? 'good' : ''}">훈련도 ${trainV} <em>공·방 ${trainPct >= 0 ? '+' : ''}${trainPct}% · 치명 +${critP}%p</em></span>
      </div>
      <p class="gi-note">사기는 <b>80이 기준(100%)</b>입니다 — 80 위로는 더 세지지 않고, 80 아래로 떨어질수록 공·방이 함께 약해집니다(20 → −15%). <b>20 이하가 되면 그 자리에서 사기 붕괴</b> — 기절·혼란·중독·이동불가 중 하나가 붙고 사기 50으로 돌아옵니다. 훈련도는 <b>50이 기준</b>이고 그 위로는 최대 +12%(100) · 치명 +4%p까지 붙습니다.</p>
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
    /* v5.59 — 전장 적용과 내정·외교 적용을 나눠 적는다 (보물 창과 같은 문구) */
    let fxBattle = [], fxDomestic = [];
    if (h && SK.heroTreasureFx && SK.fxScopes) {
      const sc = SK.fxScopes(SK.heroTreasureFx(h));
      fxBattle = sc.battle || [];
      fxDomestic = sc.domestic || [];
    }
    return `<p class="gi-sec">장비</p>
      <div class="gi-eq">
        <div class="gi-eq-row"><span class="gi-slot">병장</span><div><b>${wpn}</b><em>병과 기본 무기 · 보정 없음</em></div></div>
        ${rows}
      </div>
      <p class="gi-sum">보물 보정 — ${sum.length ? sum.join(' · ') : '없음'}</p>
      ${fxBattle.length ? `<p class="gi-sum">${SK.TREASURE_SCOPE_LABEL.battle} — ${fxBattle.join(' · ')}</p>` : ''}
      ${fxDomestic.length ? `<p class="gi-sum gi-sum-dom">${SK.TREASURE_SCOPE_LABEL.domestic} — ${fxDomestic.join(' · ')}</p>` : ''}
      ${h ? '' : '<p class="gi-note">적군 부대와 일반 부대는 보물을 장착하지 않습니다.</p>'}`;
  }

  function giTraitHTML(u) {
    const C = SK.CLASSES[u.cls] || {};
    const p = u.passive;
    let uniq;
    if (p) {
      const tier = p.tier || giTierOf2(u);
      uniq = `<div class="gi-trait"><b>「${p.title || u.skillName || '고유 특기'}」<em class="gi-trait-tier ${GI_TIER_CLASS[tier] || 'tier-C'}">${tier}급</em><em>${GI_TRIGGER[p.trigger] || '공격 시'}</em></b><p>${p.effect || ''}</p>${giPassiveNote(p)}</div>`;
    } else if (u.skillName) {
      uniq = `<div class="gi-trait"><b>「${u.skillName}」</b><p>열전에 기록된 특기입니다. 전장 수치 효과는 아직 붙지 않았습니다.</p></div>`;
    } else {
      uniq = u.uid ? '<p class="gi-note">이 장수의 고유 특기가 아직 없습니다.</p>'
        : '<p class="gi-note">이 부대는 병과 공용 부대라 고유 특기가 없습니다.</p>';
    }
    /* v5.62 — 병종 책략 4종을 모두 보여 주고, 이 부대 레벨에 아직 잠긴 기술은
       흐리게 + `🔒 Lv.N 해금` 배지로 남긴다 (시전은 u.skills만 쓴다) */
    const lvU = Number(u.lv) || 1;
    const skills = SK.allSkillsOf(u.cls).map((k) => {
      const sk = SK.SKILLS[k];
      const need = SK.skillLockLv(k, lvU);
      const rng = sk.radius ? `반경 ${sk.radius}` : `사거리 ${skRange(u, sk)}`;
      const cool = skCdLeft(u, sk);
      const state = need > 0 ? 'lock' : ((u.mp < sk.mp || cool > 0) ? 'off' : '');
      const badge = need > 0 ? `<em class="sk-lock">🔒 Lv.${need} 해금</em>`
        : (cool > 0 ? `<em class="sk-lock">⏳ ${cool}턴 대기</em>` : '');
      return `<div class="skill-row gi-skill ${state}"><span class="sk-mp">${sk.mp}</span>
        <div><b>${sk.name}${badge}<em class="sk-rng">${rng}</em></b><span>${sk.desc || ''}</span></div></div>`;
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
    /* v5.60 — 검수용 잠금: 72종 책략을 차례로 펼치는 동안 턴이 넘어가지 않게 한다 */
    if (B && B.lockTurn) { B.phase = 'ally'; return; }
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
    }).filter((s) => s && (u.mp || 0) >= (s.mp || 0) && skCdLeft(u, s) <= 0);
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
    if (sk.kind === 'power' || sk.kind === 'powerArea') {
      let mult = sk.power || 1.4;
      if (sk.ifHpBelow && f.hp / Math.max(1, f.maxHp) <= sk.ifHpBelow.thr / 100) mult *= 1 + sk.ifHpBelow.pct / 100;
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

    /* v5.56 — 사기 지원. 아군 사기가 60 아래로 내려간 부대가 있으면,
       사기를 올리는 책략(군악·호령·포효처럼 '사기 +N'이 붙은 기술)을 그 부대에 먼저 쓴다.
       20 밑으로 떨어지면 붕괴하므로 붕괴 직전 부대의 값이 가장 크다. */
    const moraleSkills = skills.filter((s) => skillMoraleOf(s, true) > 0);
    const shaky = allies.filter((a) => a.alive && a.morale != null && a.morale <= 60)
      .sort((a, b) => a.morale - b.morale);
    if (moraleSkills.length && shaky.length && u.morale != null && u.morale >= 25) {
      let best = null;
      moraleSkills.forEach((sk) => {
        const reach = sk.radius ? sk.radius : skRange(u, sk);
        tiles.forEach((t) => {
          const hit = shaky.filter((a) => manh(t.x, t.y, a.x, a.y) <= reach);
          if (!hit.length) return;
          let sc = 0;
          hit.forEach((a) => { sc += (60 - a.morale) * (a.morale <= 30 ? 4.2 : 2.4); });
          sc -= dTo(t, u.x, u.y) * 0.3;
          sc -= foeThreatAt(t.x, t.y, foes) * 0.6;
          if (!best || sc > best.score) {
            best = { kind: 'skill', mode: hit[0].side === u.side && sk.kind === 'buffAlly' ? 'buff' : 'support',
              key: sk.key, x: t.x, y: t.y, tx: hit[0].x, ty: hit[0].y, target: hit[0], score: sc };
          }
        });
      });
      if (best && best.score > 16) return best;
    }

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

    /* 3-b) v5.60 — 전장 전체 아군 버프(군주 천하호령). 아군 다수가 아직 강화되지 않았으면
       아군이 몰린 자리로 걸어가서 판 전체에 깔아 준다. */
    const allBuf = skills.find((s) => s.kind === 'buffAllAllies');
    if (allBuf && foes.length) {
      const group = allies.filter((a) => !(a.buffs.atk && a.buffs.atk.t > 0) || (a.morale != null && a.morale <= 60));
      if (group.length >= 2) {
        let best = null;
        tiles.forEach((t) => {
          const near = allies.filter((a) => manh(t.x, t.y, a.x, a.y) <= 6).length;
          const sc = near * 26 + group.length * 22 - dTo(t, u.x, u.y) * 0.2 - foeThreatAt(t.x, t.y, foes) * 0.8 + vBoost(t, true);
          if (!best || sc > best.score) best = { kind: 'skill', mode: 'instant', key: allBuf.key, x: t.x, y: t.y, tx: t.x, ty: t.y, score: sc };
        });
        if (best && best.score > 70) return best;
      }
    }

    /* 4) 공격 책략 — 기대 피해가 기본 공격보다 확실히 크거나 처치 가능할 때 */
    const dmgs = skills.filter((s) => s.kind === 'power' || s.kind === 'powerArea' || s.kind === 'magic' || s.kind === 'magicArea');
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
              let sc = sum * (hit.length >= 2 ? 1.15 : 0.9) + (kill ? 200 : 0) + (sk.allyBuff ? 40 : 0) - dTo(t, u.x, u.y) * 0.3 + vBoost(t, true);
              /* v6.0 — 화공 계열은 갈대밭 위의 적을 노릴 때 크게 가중한다 (불이 번져 더 탄다) */
              if (isFireSkill(sk)) sc += hit.filter((o) => tileAt(o.x, o.y) === 'J' && !burningAt(o.x, o.y)).length * 150;
              if (!best || sc > best.score) best = { kind: 'skill', mode: 'damage', key: sk.key, fire: isFireSkill(sk), x: t.x, y: t.y, tx: f.x, ty: f.y, target: f, score: sc };
            });
          });
        } else {
          tiles.forEach((t) => {
            foes.forEach((f) => {
              const d = dTo(t, f.x, f.y);
              if (d < minR || d > range) return;
              const e = estSkillDmg(u, f, sk);
              /* v5.81 — 여러 명을 덮는 기술(창진·천장관통·철기돌파·제왕의 위엄)은 묶어서 값을 매긴다 */
              let nHit = 1;
              if (sk.pattern === 'range2') nHit = Math.min(3, foes.filter((o) => manh(u.x, u.y, o.x, o.y) <= 2).length);
              else if (sk.pattern) nHit = Math.min(sk.maxTargets || 2, 2);
              const kill = e >= f.hp;
              let sc = e * (sk.hits || 1) * Math.max(1, nHit * 0.75) + (kill ? 170 : 0) + (nHit >= 2 ? 90 : 0) - dTo(t, u.x, u.y) * 0.3 + vBoost(t, true);
              /* v6.0 — 화계·포격은 갈대밭에 선 적에게 먼저 쓴다 */
              const fireSk = isFireSkill(sk);
              if (fireSk && tileAt(f.x, f.y) === 'J' && !burningAt(f.x, f.y)) sc += 160;
              else if (fireSk && burningAt(f.x, f.y)) sc -= 40;
              if (!best || sc > best.score) best = { kind: 'skill', mode: 'damage', key: sk.key, fire: isFireSkill(sk), x: t.x, y: t.y, tx: f.x, ty: f.y, target: f, score: sc };
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
          if (a.buffs.atk && a.buffs.atk.t > 0 && a.morale != null && a.morale > 55) return;
          if (dTo(t, a.x, a.y) > skRange(u, allyBuf)) return;
          /* v5.56 — 사기가 낮은 아군은 이 미약한 강화라도 먼저 받는다 */
          const sc = 22 + effAtk(a) * 0.5 + (1 - a.hp / a.maxHp) * 30
            + (a.morale != null && a.morale < 60 ? (60 - a.morale) * 1.6 : 0) - dTo(t, u.x, u.y) * 0.3;
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
    if (skCdLeft(u, sk) > 0) return false;
    const tgt = B.units.find((o) => o.alive && o.x === x && o.y === y);
    if (sk.kind === 'heal' || sk.kind === 'buffAlly') { if (!tgt || tgt.side !== u.side) return false; }
    if (sk.kind === 'power' || sk.kind === 'magic') { if (!tgt || tgt.side === u.side) return false; }
    /* v5.81 — 화시(powerArea)는 적이 없는 지점도 노릴 수 있다 */
    if (sk.kind === 'powerArea') { if (tgt && tgt.side === u.side) return false; }
    const dist = manh(u.x, u.y, x, y);
    const selfCentered = sk.kind === 'buffSelf' || sk.kind === 'buffAreaAllies' || sk.kind === 'healArea' || sk.kind === 'buffAllAllies' || sk.kind === 'healAll';
    /* v5.83 — 자기 중심 광역 기술은 최소 사거리 검사에서 제외한다 (플레이어 경로와 같은 규칙) */
    if (sk.minRange && dist < sk.minRange && !(dist === 0 && selfCentered)) return false;
    if (!selfCentered && dist > skRange(u, sk)) return false;
    B.sel = u;
    mode = 'skillTarget';
    /* v6.0 — AI 시전에도 기술 키를 붙인다 (예전엔 key가 비어 화공 판정·투사체 종류가 어긋났다) */
    pendingSkill = Object.assign({}, sk, { key: sk.key || skillKeyOf(sk) });
    if (sk.kind === 'buffSelf' || sk.kind === 'buffAreaAllies' || sk.kind === 'healArea' || sk.kind === 'buffAllAllies' || sk.kind === 'healAll') { castInstant(u, sk); return true; }
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
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
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
      for (let x = 0; x < COLS; x++) if (B.tiles[y] && B.tiles[y][x] === 'T') towers.push({ x, y });
    }
    B._home = { gateRow, wallRow, insideY: gateRow > 0 ? gateRow - 1 : ROWS - 1, hq, towers };
    return B._home;
  }
  /* v5.88 — 수비선(성 안쪽 어디까지 지킬 수 있는가).
     바깥 성문이 살아 있으면 그 문 안쪽 줄, 뚫리면 다음 안쪽 문 앞 줄로 한 단계 물러난다.
     모든 문이 뚫리면 본진 앞에서 막는다. */
  function defenseBoundary(homeIn) {
    const home = homeIn || defenseHome();
    if (!B) return home ? home.insideY : ROWS - 1;
    const gates = (B.gates && B.gates.length ? B.gates : (B.gate ? [B.gate] : []));
    const intact = gates.filter((g) => g && g.hp > 0);
    if (!intact.length) {
      const hq = home && home.hq;
      if (hq && hq.y != null) return Math.max(0, Math.min(ROWS - 1, hq.y + 1));
      return home ? Math.max(0, home.insideY - 1) : ROWS - 1;
    }
    const out = intact.slice().sort((a, b) => (b.row || 0) - (a.row || 0))[0];
    return Math.max(0, (out.row || 0) - 1);
  }
  SK.defenseBoundary = defenseBoundary;

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
    const line = defenseBoundary(home);      // v5.88 — 뚫린 문 수만큼 안으로 물러난 선
    const inside = (x, y) => {
      const row = B.tiles[y];
      if (!row || row[x] == null) return false;
      if (row[x] === 'C' || row[x] === 'H') return false;
      return y <= line || row[x] === 'G';
    };
    const sortie = defenseSortieNeeded(home);
    const openField = (x, y) => {
      const row = B.tiles[y];
      if (!row || row[x] == null || row[x] === 'C' || row[x] === 'H') return false;
      return true;
    };
    const uOut = !!(u && u.y > line);
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
    if (role === 'wall') return (x, y) => inside(x, y) && y >= line - 5;
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
      for (let x = 0; x < COLS; x++) {
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
        if (s.kind !== 'heal' && s.kind !== 'healArea' && s.kind !== 'buffAlly' && s.kind !== 'buffAreaAllies' && s.kind !== 'buffAllAllies') return;
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
  /* ══════════ v6.0 — AI 지형 판단 ══════════
     새 지형·기믹을 AI가 실제로 읽고 쓴다.
     · 원거리·수비 AI는 고지대(U)를 먼저 잡고, 기병은 오르는 비용을 피해 돌아간다
     · 불타는 갈대밭(J)은 이동 후보에서 크게 깎아 피한다
     · 군량고(Q)·무기고(Y)·측면 샛문은 정면 성문과 함께 목표 값으로 계산한다
     · 책사 AI는 갈대밭 위의 적에게 화계를 우선 시전한다 (planSupportSkill)
     ══════════════════════════════════════════════════════════════ */
  function gateListIntact() {
    return (B.gates && B.gates.length ? B.gates : (B.gate ? [B.gate] : [])).filter((g) => g && g.hp > 0);
  }
  function nearestGateTo(x, y, list) {
    let best = null, bd = 99;
    (list || gateListIntact()).forEach((g) => (g.tiles || []).forEach((t) => {
      const d = manh(x, y, t.x, t.y);
      if (d < bd) { bd = d; best = { x: t.x, y: t.y }; }
    }));
    return best ? { tile: best, dist: bd } : null;
  }
  /* 우회 공성 — 부대마다 정문·동·서 샛문 중 하나를 맡는다(세 부대 중 하나가 측면).
     성문이 하나뿐이거나 측면 문이 없으면 정문으로 돌아간다. */
  function gatePlanFor(u) {
    const gates = gateListIntact();
    if (!gates.length) return [];
    if (u._flank === undefined) {
      /* id는 'a0'·'e3' 같은 문자열 — 숫자만 떼어 세 부대 중 하나를 측면에 붙인다 */
      const nid = parseInt(String(u.id).replace(/\D+/g, ''), 10) || 0;
      const m = nid % 6;
      u._flank = m === 0 ? 'west' : (m === 1 ? 'east' : null);
    }
    if (!u._flank) return gates;
    const cxm = Math.floor(COLS / 2);
    const side = gates.filter((g) => {
      const gx = g.tiles.reduce((a, t) => a + t.x, 0) / Math.max(1, g.tiles.length);
      return u._flank === 'west' ? gx < cxm : gx > cxm;
    });
    return side.length ? side : gates;
  }
  /* 칸 하나의 AI 가치 — 고지대·불·오브젝트. 어째서 그 칸을 골랐는지도 함께 돌려준다 */
  function terrainAiScore(u, x, y) {
    const ch = tileAt(x, y);
    let sc = 0, why = '';
    if (ch === 'U') {
      if ((u.rng || 1) >= 2) { sc += 11; why = 'highland-ranged'; }
      else if (u.cls === 'gibi') { sc -= 4; why = 'highland-cav-slow'; }
      else { sc += 4; why = 'highland'; }
    }
    if (burningAt(x, y)) { sc -= 60; why = 'fire-avoid'; }
    else if (ch === 'J') {
      sc -= 4;
      if (burningNear(x, y, 1)) { sc -= 12; if (!why) why = 'reeds-near-fire'; }
    }
    if (ch === 'N') sc -= 40;
    const o = objAt(x, y);
    if (o && o.owner !== u.side) {
      sc += o.kind === 'granary' ? 44 : 36;
      why = 'objective-' + o.kind;
    }
    return { sc, why };
  }
  function aiNote(u, plan) {
    if (!B || !plan) return plan;
    const tile = tileAt(plan.x, plan.y);
    const rec = { side: u.side, name: u.name, cls: u.cls, kind: plan.kind, x: plan.x, y: plan.y, tile, why: plan.why || '',
      objective: objAt(plan.x, plan.y) ? (objAt(plan.x, plan.y).kind) : null, fire: burningAt(plan.x, plan.y),
      gateSide: !!(plan.gate && (B.gates || []).some((g) => g.side && g.tiles.some((t) => t.x === plan.gate.x && t.y === plan.gate.y))) };
    B.aiLog = B.aiLog || [];
    B.aiLog.push(rec);
    if (B.aiLog.length > 400) B.aiLog.shift();
    u._aiPlan = rec;
    return plan;
  }

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
    /* v5.88 — 공성 공격 AI: 가장 바깥에 남은 성문(B.gate)이 살아 있는 동안에는
       · 문 너머(안쪽 성벽 뒤)의 먼 적을 쫓지 않고
       · 문 하나에 병력을 집결시켜 집중 돌파한다. 문이 뚫리면 다음 문으로 이어진다. */
    const stormGateObj = (stormGate && gateIntact()) ? activeGate() : null;
    const strikeGates = (stormGate && gateIntact()) ? gatePlanFor(u) : [];
    const stormGateRow = stormGateObj ? stormGateObj.row : null;
    const stormGateX = stormGateObj ? stormGateObj.tiles.reduce((a, g) => a + g.x, 0) / stormGateObj.tiles.length : null;
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
        /* v6.0 — 고지대에서 내려치는 자리를 더 높게 (피해 +15%가 실제로 붙는 자리) */
        if (tileAt(t.x, t.y) === 'U' && tileAt(e.x, e.y) !== 'U' && tileAt(e.x, e.y) !== 'M') score += 9;
        /* v5.56 — 사기 20 밑으로 몰린 적을 한 대 더 때려 '사기 붕괴'를 유도한다 */
        if (e.morale != null && e.morale <= 32) score += (33 - e.morale) * 2.6;
        /* v5.56 — 우리 사기가 낮으면(붕괴 위험) 반격이 아픈 적은 피긴다 */
        if (u.morale != null && u.morale <= 34) {
          const ret = calcDamage(e, u, {}).dmg;
          if (ret > u.maxHp * 0.1) score -= 24;
        }
        /* v5.88 — 문이 살아 있으면 문 너머의 먼 적은 값이 없다 (문을 먼저 부순다) */
        if (stormGateRow != null && !skipGate && e.y < stormGateRow) {
          score -= (d > 2 ? 70 : 45);
        }
        /* v5.49 — 같은 적을 칠 수 있는 칸이라면 마을을 밟고 치는 쪽을 고른다 */
        score += vv(t, true);
        /* v5.33 — 후방 문관·보조에게 3칸 안으로 붙은 적을 먼저 친다 (전투 병과만) */
        if (!SUPPORT_CLS_SET[u.cls] && allies.some((a) => a !== u && SUPPORT_CLS_SET[a.cls] && manh(e.x, e.y, a.x, a.y) <= 3)) score += 24;
        if (!best || score > best.score) best = { x: t.x, y: t.y, target: e, score, kind: 'hit' };
      });
      if (stormGate && gateIntact() && !skipGate) {
        /* v6.0 — 정면 문만 두드리지 않는다. 살아 있는 모든 성문(정문·동·서 샛문)을 후보로 두고,
           가까운 문을 우선하되 측면 샛문에는 약간의 가중을 준다 (HP가 70%라 먼저 뚫린다). */
        const ngx = nearestGateTo(t.x, t.y, strikeGates);
        strikeGates.forEach((gate) => {
          gate.tiles.forEach((g) => {
            if (manh(t.x, t.y, g.x, g.y) > rng) return;
            let sc = (kind === 'rock' ? 130 : kind === 'melee' ? 105 : 55) + (home ? 4 : 0);
            if (gate.side) sc += 14;
            if (ngx) sc -= Math.min(6, manh(t.x, t.y, ngx.tile.x, ngx.tile.y) * 0.4);
            if (!best || sc > best.score) best = { x: t.x, y: t.y, gate: { x: g.x, y: g.y }, score: sc, kind: 'gate', why: gate.side ? 'side-gate' : 'main-gate' };
          });
        });
      }
    });
    /* v6.0 — 갈대밭 위의 적에게는 화공(화계·포격)을 먼저 쓴다. 불이 번져 피해가 크게 늘어난다. */
    if (sup && sup.kind === 'skill' && sup.mode === 'damage' && sup.fire && sup.target
      && tileAt(sup.target.x, sup.target.y) === 'J' && !burningAt(sup.target.x, sup.target.y)) {
      sup.why = 'fire-on-reeds';
      return aiNote(u, sup);
    }
    if (best) return aiNote(u, best);
    if (sup) return aiNote(u, sup);
    /* v5.91 — 칠 적도 없고 성문도 사거리 밖이면, 사거리 안의 망루를 공략한다 */
    const twPlan = planTowerStrike(u);
    if (twPlan) return twPlan;
    let pick = null, pickWhy = '';
    tiles.forEach((t) => {
      const d = foes.length ? Math.min(...foes.map((f) => manh(t.x, t.y, f.x, f.y))) : 99;
      /* v6.0 — 문까지의 거리는 '가장 가까운 살아 있는 성문'(정문이든 측면 샛문이든)으로 잰다 */
      const ng = (stormGate && gateIntact() && !skipGate) ? nearestGateTo(t.x, t.y, strikeGates) : null;
      const gy = ng ? ng.dist - 1 : 99;
      /* v5.88 — 공성 공격수는 적과의 거리보다 '가장 바깥 문까지의 거리'로 움직인다 (문 앞 집결) */
      let score = (stormGateRow != null && !skipGate && gy < 99)
        ? (-gy * 1.6 - Math.min(d, 8) * 0.25)
        : -Math.min(d, gy);
      const gateX = ng ? ng.tile.x : stormGateX;
      if (stormGateRow != null && !skipGate && gateX != null) score -= Math.abs(t.x - gateX) * 0.35;
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
        const lineNow = defenseBoundary(home);
        const gateNear = activeGate() ? Math.min(...activeGate().tiles.map((g) => manh(t.x, t.y, g.x, g.y))) : 99;
        /* v5.26 — 망루 보너스는 사거리 안에 적이 있을 때만. 예전에는 적이 성문 반대편에 있어도
           망루(+12)에 붙어 있어 사거리 밖에서 7턴을 허비하는 부대가 있었다. */
        const foeD = foes.length ? Math.min(...foes.map((f) => manh(t.x, t.y, f.x, f.y))) : 99;
        if (ch === 'T' && foeD <= rng + 1) score += 12;                 // 망루 위가 최선 (사거리 +1·방어 +45%)
        else if (ch === 'T') score += 1;                                // 사거리 밖이면 미련 없이 이동
        else if (t.y >= lineNow - 3) score += 4;                        // 성문 바로 안쪽 성벽
        /* v5.88 — 문 앞 병목: 지금 살아 있는 문 가까운 성벽에서 막는다 */
        if (gateNear <= 2 && ch !== 'G') score += 5;
        if (ch === 'G') score += 1;                                    // 문통도 문을 지키는 자리 (뚫리면 안쪽으로 물러난다)
        if (t.y > lineNow && ch !== 'G') score -= 20;
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
        const hq = home.hq || { x: Math.floor(COLS / 2), y: home.insideY };
        /* 지원이 닿으면 그 자리, 안 닿으면 아군 쪽으로 다가간다 (적 사거리 밖은 allow가 지킨다) */
        score = cover * 9 - Math.max(0, near - reach) * 2.2 - Math.min(d, 14) * 0.7 - manh(t.x, t.y, hq.x, hq.y) * 0.1;
        if (B.tiles[t.y][t.x] === 'K') score += 1.5;
      } else if (defRole === 'melee' && home && gateIntact() && !defenseSortieNeeded(home)) {
        /* v5.33 — 교착(적이 성 밖에서만 버팀)이면 이 '문 안에서 막기' 점수를 끄고 나가서 친다 */
        /* v5.88 — 문 앞 병목 방어: 문 안쪽 바로 뒤에서 막는다. 바깥 문이 뚫리면
           다음 안쪽 문(lineNow) 앞으로 물러나 다시 병목을 만든다. */
        const lineM = defenseBoundary(home);
        const gNear = activeGate() ? Math.min(...activeGate().tiles.map((g) => manh(t.x, t.y, g.x, g.y))) : 99;
        if (B.tiles[t.y][t.x] === 'G') score += 10;
        else if (t.y >= lineM - 1) score += 4;
        if (gNear <= 2) score += 6;
        if (t.y > lineM && B.tiles[t.y][t.x] !== 'G') score -= 25;
      }
      /* v5.49 — 걸어갈 수 있는 마을은 밟고 지나간다. 그 칸에서 아직 적을 칠 수 있으면 더 크게. */
      score += vv(t, canStrikeFrom(u, t.x, t.y, foes, rng, minR));
      /* v6.0 — 고지대·연소·군량고·무기고 값. 새 지형을 AI가 실제로 읽는다 */
      const tz = terrainAiScore(u, t.x, t.y);
      score += tz.sc;
      if (!pick || score > pick.score) { pick = { x: t.x, y: t.y, score, kind: 'move' }; pickWhy = tz.why || ''; }
    });
    if (pick) pick.why = pickWhy;
    return aiNote(u, pick);
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
        else if (p.tower && p.tower.alive) doTowerAttack(u, p.tower);
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
      autoPending = { uid: u.uid, target: plan.kind === 'hit' ? plan.target : null, gate: plan.kind === 'gate' ? plan.gate : null,
        tower: plan.kind === 'tower' ? plan.tower : null };
      moveUnit(u, plan.x, plan.y);
      autoTimer = wait(autoStep, 260);
      return;
    }
    if (plan && plan.kind === 'hit' && plan.target) doAttack(u, plan.target);
    else if (plan && plan.kind === 'gate' && plan.gate) doGateAttack(u, plan.gate);
    else if (plan && plan.kind === 'tower' && plan.tower) doTowerAttack(u, plan.tower);
    else { u.acted = true; SKBattle.refreshUI(); }
    autoTimer = wait(autoStep, 420);
  }

  function enemyPhase() {
    if (B.over) return;
    sitePhase(true);          // v5.17 — 적 턴 시작: 본진·점령 마을 위 부대 회복
    if (B.over) return;
    objPhase();               // v6.0 — 군량고·무기고 위에 선 부대 점령
    ailPhase('enemy');        // v5.31 — 적의 중독·화상·사기 회복
    if (!B || B.over) return;
    finishCheck();
    if (!B || B.over) return;
    classAuraPhase('enemy');
    /* v5.56 — 적 장수도 고유 특기(턴 시작형)를 쓴다 (아군과 같은 규칙) */
    B.units.forEach((u) => { if (u.side === 'enemy' && u.alive) triggerPassive(u, 'turn_start'); });
    /* v5.82 — 적 턴 시작: 사기진작·군의술 같은 40종 특기 */
    B.units.forEach((u) => { if (u.side === 'enemy' && u.alive) vpTurnStart(u); });
    /* v5.91 — 수비 측(공성전의 적) 망루 포격을 먼저 풀고 적 행동을 시작한다 */
    if (towerTurnFire('enemy', enemyActLoop)) return;
    enemyActLoop();
  }

  /* v5.91 — 적군 행동 루프 (enemyPhase의 나머지) */
  function enemyActLoop() {
    if (!B || B.over) return;
    const enemies = B.units.filter((u) => u.side === 'enemy' && u.alive).sort((a, b) => a.y - b.y);
    let i = 0;
    const step = () => {
      if (B.over) return;
      if (i >= enemies.length) {
        // back to player's turn
        B.turn += 1;
        /* v5.17 — 대형 전장(28·32칸)은 턴 한도를 늘린다 */
        if (B.turn > (Math.max(COLS, ROWS) >= 28 ? 40 : 30)) return defeat();
        B.units.forEach((u) => {
          if (!u.alive) return;
          u.acted = false;
          /* v5.30 — 한 턴 2회 공격(일월쌍도·쌍고검) 쿨타임과 돌격 이동 거리 초기화 */
          u.dblUsed = false;
          if (u.dblCd > 0) u.dblCd -= 1;
          /* v5.83 — 책략 쿨타임 1턴 감소 */
          if (u.scd) Object.keys(u.scd).forEach((k) => { u.scd[k] = (Number(u.scd[k]) || 0) - 1; if (u.scd[k] <= 0) delete u.scd[k]; });
          u.movedTiles = 0;
          u.movedThisTurn = false;
          u.turnStartX = u.x; u.turnStartY = u.y;
          lastMovedUid = null;
          Object.keys(u.buffs).forEach((k) => { u.buffs[k].t -= 1; if (u.buffs[k].t <= 0) delete u.buffs[k]; });
          /* v5.82 — 기백 순환(고유 특기): 매 턴 MP 회복 */
          const pMp = pasP(u, 'mpRegen');
          /* v5.82 — 가리기(cover) 지속 턴 */
          if (u.vpCover > 0) u.vpCover -= 1;
          if (u.side === 'ally') u.mp = Math.min(u.maxMp, u.mp + 3 + Math.max(0, (u.tfx && u.tfx.mp) || 0) + pMp);
          else u.mp = Math.min(u.maxMp, u.mp + 2 + pMp);
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
        objPhase();            // v6.0 — 군량고·무기고 점령 확인
        tickFires();           // v6.0 — 연소 중인 갈대밭 한 턴 줄이기 (한 바퀴에 한 번)
        ailPhase('ally');      // v5.31 — 아군 중독·화상·기절·사기 회복
        if (!B || B.over) return;
        finishCheck();
        if (!B || B.over) return;
        B.units.forEach((u) => { if (u.side === 'ally' && u.alive) triggerPassive(u, 'turn_start'); });
        /* v5.82 — 아군 턴 시작: 40종 특기 (사기진작·군의술·의장) */
        B.units.forEach((u) => { if (u.side === 'ally' && u.alive) vpTurnStart(u); });
        classAuraPhase('ally');
        banner('아군 페이즈', 'ally');
        SKBattle.refreshUI();
        /* v5.97 — 아군 턴이 시작될 때마다 복구용 스냅샷을 갱신한다 */
        if (!skipMode) saveSnap();
        const startAllyTurn = () => {
          if (!B || B.over) return;
          const first = B.units.find((u) => u.side === 'ally' && u.alive && !u.acted);
          if (first) selectUnit(first);
          else {
            /* v5.33 — 턴 시작부터 전원이 행동 불가(기절·혼란 등)면 안내만 띄우고 멈추지 않는다 */
            $('#battle-tip').textContent = '행동할 수 있는 부대가 없습니다 — 잠시 뒤 적군 차례로 넘어갑니다.';
            scheduleAutoEndTurn(520);
          }
        };
        /* v5.91 — 수비 측(수성전 아군) 망루 포격 후 아군 턴 시작 */
        if (!towerTurnFire('ally', startAllyTurn)) startAllyTurn();
        return;
      }
      const e = enemies[i++];
      if (!e.alive) { step(); return; }
      enemyAct(e, () => wait(step, 220));
    };
    step();
  }

  /* v5.88 — 공성전에서 성을 지키는 쪽(적군)이 문 밖으로 쏟아져 나오지 않게
     '가장 바깥에 남은 문 안쪽 병목'을 목표로 삼는다. 문이 다 뚫리면 본진으로 물러난다. */
  function enemySiegeDefense() {
    if (!B || B.defense) return null;
    if (!SK.isSiegeType(B.type) && B.type !== 'fortress') return null;
    const gates = (B.gates && B.gates.length ? B.gates : (B.gate ? [B.gate] : [])).filter((g) => g && g.hp > 0);
    if (!gates.length) return null;
    const out = gates.slice().sort((a, b) => (b.row || 0) - (a.row || 0))[0];
    if (!out || !out.tiles || !out.tiles.length) return null;
    const gx = out.tiles.reduce((a, t) => a + t.x, 0) / out.tiles.length;
    return { gate: out, row: Math.max(0, (out.row || 0) - 1), x: gx };
  }
  SK.enemySiegeDefense = enemySiegeDefense;

  /* v5.17 — AI 역할별 목표지. 호위병은 본진, 돍격대는 빈 마을 → 아군 본진 */
  function aiGoalOf(e) {
    if (!B || !B.sites) return null;
    const defSiege = enemySiegeDefense();
    if (defSiege) {
      /* v5.88 — 공성전 수비측은 문 앞 병목 → 문이 뚫리면 그다음 안쪽 문 → 다 뚫리면 본진 */
      if (e.role !== 'guard') e.role = 'guard';
      return { x: defSiege.x, y: defSiege.row };
    }
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
    /* v5.88 — 성을 지키는 적(공성전 수비측)의 수비선 */
    const defSiegeNow = enemySiegeDefense();
    /* v5.33 — 적 전투 병과도 자기 문관을 노리는 아군을 먼저 친다
       v5.81 — 일점사: 킬각(한 방에 잡히는 아군) > 피 적은 아군 > 힐러·원거리 > 가까운 순 */
    let target = targets.reduce((best, t) => {
      const d = manh(e.x, e.y, t.x, t.y);
      let sc = d;
      /* v5.88 — 침공군은 문이 살아 있는 동안 문 너머 먼 아군을 쫓지 않는다 (문에 집중) */
      const gNow = (isGateAttacker(e) && gateIntact()) ? activeGate() : null;
      if (gNow && t.y < gNow.row && d > 3) sc += 8;
      /* v5.88 — 성을 지키는 적은 문 밖 먼 아군을 쫓지 않는다 (문 앞 병목에서 맞는다) */
      if (defSiegeNow && t.y > defSiegeNow.row + 2 && d > 3) sc += 8;
      const est = estBasicDmg(e, t);
      if (est >= t.hp) sc -= 9;                                        // 이번 타격에 쓰러뜨릴 수 있다
      sc -= (1 - t.hp / Math.max(1, t.maxHp)) * 4;                     // 피가 적을수록 먼저
      if (SUPPORT_CLS_SET[t.cls]) sc -= 3.2;                           // 풍수사·무희·군악대 우선
      else if (effRng(t) >= 2) sc -= 1.4;                              // 원거리 딜러
      if (!SUPPORT_CLS_SET[e.cls] && B.units.some((o) => o.alive && o.side === e.side && SUPPORT_CLS_SET[o.cls] && manh(t.x, t.y, o.x, o.y) <= 3)) sc -= 2;
      /* v5.56 — 사기가 낮은 아군을 먼저 노려 붕괴를 만든다 */
      if (t.morale != null && t.morale <= 32) sc -= 2.5;
      /* v6.0 — 적 책사는 갈대밭에 선 아군에게 화계를 우선 건다 (불이 붙으면 크게 탄다) */
      if (e.cls === 'chaeksa' && tileAt(t.x, t.y) === 'J' && !burningAt(t.x, t.y)) sc -= 6;
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
        fireSpreadFrom(e, target, SK.SKILLS.hwagye, 'magic');
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
    /* v5.91 — 아군 부대도 성문도 사거리에 없으면 수비 측 망루를 때린다 */
    if (!already) {
      const twNow = towerAiTarget(e);
      if (twNow && doTowerAttack(e, twNow, null, done)) return;
    }
    const reach = reachSet(e);
    const freeTiles = [];
    /* v5.88 — 공성전 수비측: 문이 살아 있는 동안 성 밖(문 너머)으로 나가는 칸은 버린다.
       적이 2부대 이하로 줄었거나 모든 문이 뚫리면 나가서 맞는다. */
    const fewFoesNow = targets.length <= 2;
    reach.forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      const occ = B.units.find((o) => o.alive && o.x === x && o.y === y);
      if (occ) return;
      if (defSiegeNow && !fewFoesNow && e.y <= defSiegeNow.row && y > defSiegeNow.row) return;
      freeTiles.push({ x, y });
    });
    let best = null;
    freeTiles.forEach((t) => {
      const d = manh(t.x, t.y, target.x, target.y);
      const inRange = d >= minR && d <= rng;
      let score = inRange ? -100 + d : (d < minR ? 150 - d : d);
      /* v5.88 — 지금 문을 칠 수 없어도, 문이 살아 있으면 문 앞으로 집결한다 */
      if (!already && isGateAttacker(e) && gateIntact()) {
        /* v6.0 — 적도 가장 가까운 성문(정문·측면 샛문)으로 붙는다 */
        const gnear = nearestGateTo(t.x, t.y, gatePlanFor(e));
        const gd = gnear ? gnear.dist : 99;
        score = gd * 1.6 + Math.min(d, 8) * 0.2;
      }
      /* v5.81 — 원거리 부대 카이팅: 붙으면 한 대 더 맞으므로 한 칸 물러나 쏘는 자리를 고른다 */
      if (rng >= 2 && minR < 2 && d <= 1 && inRange) score += 28;
      if (rng >= 2 && minR < 2 && d >= 2 && inRange) score -= 6;
      /* v5.17 — 수비대는 본진 곁을, 돍격대는 마을·아군 본진 쪽으로 움직인다 */
      if (aiGoal) {
        const gd = manh(t.x, t.y, aiGoal.x, aiGoal.y);
        if (e.role === 'guard') score += gd * (inRange ? 0.25 : 0.85);
        else score += gd * 0.5;
      }
      /* v5.88 — 공성전 수비측은 문 앞 병목·성벽 안쪽에 붙어 있는 쪽을 고른다 */
      if (defSiegeNow) {
        score += Math.abs(t.x - defSiegeNow.x) * 0.45;                    // 문 기둥 쪽으로 모인다
        if (t.y > defSiegeNow.row) score += 26;                           // 문 밖으로 나가는 칸
        else if (t.y >= defSiegeNow.row - 2) score -= 5;                  // 문 바로 안쪽 병목
        if (B.tiles[t.y] && (B.tiles[t.y][t.x] === 'T' || B.tiles[t.y][t.x] === 'C')) score -= 2;
      }
      /* v5.49 — 적군 AI도 마을을 밟고 차지한다 (적은 점수가 낮을수록 좋은 칸) */
      const vv = villageValueAt(e, t.x, t.y, { foes: targets, canStrike: inRange });
      if (vv > 0) score -= vv;
      /* v6.0 — 새 지형도 적 AI가 읽는다 (고지대·불 회피·군량고/무기고) */
      const etz = terrainAiScore(e, t.x, t.y);
      score -= etz.sc;
      if (etz.why) B._lastAiWhy = etz.why;
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
              triggerPassive(e, 'on_attack');
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
          /* v5.91 — 걸어간 자리에서도 아군을 못 치면 망루를 친다 */
          const tw2 = towerAiTarget(e);
          if (tw2 && doTowerAttack(e, tw2, null, done)) return;
          e.acted = true;
          finishCheck();
          done();
        }, 170);
      } });
    };
    finishMove();
  }

  /* ════════════════════════════════════════════════════════════════════════
     v5.60 — 병과 책략 속성 이펙트
     · classes.json 의 각 기술에 붙은 `fx` 태그 하나가 '어떤 그림이 터지는지'를 정한다.
       독안개(독무술) · 황토 균열(지진술) · 황금 파동+빛기둥(천하호령) · 황금 참격(패왕참) ·
       화염+버프 링(팔진화공)처럼 기술마다 색과 모양이 다르다.
     · addFx({kind:'skillfx', sub})로 쌓이고 drawSkillFx 가 그린다(검수 훅: skillFxTags).
     ════════════════════════════════════════════════════════════════════════ */
  const SKILL_FX_TAGS = ('gold goldSlash goldWave auraDark slash wind arrow arrowRain thrust earth water fire ' +
    'fireBuff quake poison bolt boltStorm fog buffRing dance music heal fist beast roar shield rock dark pillar areaRing').split(' ');
  const SKILL_FX_COLOR = {
    gold: '255,214,120', goldSlash: '255,236,160', goldWave: '255,206,90', auraDark: '188,140,235',
    slash: '235,245,255', wind: '196,236,255', arrow: '255,240,200', arrowRain: '255,232,170',
    thrust: '255,246,220', earth: '208,172,110', water: '150,220,245', fire: '255,150,80',
    fireBuff: '255,196,110', quake: '214,176,110', poison: '150,225,120', bolt: '210,235,255',
    boltStorm: '230,244,255', fog: '208,220,228', buffRing: '255,226,150', dance: '255,180,225',
    music: '255,214,140', heal: '150,240,180', fist: '255,236,190', beast: '255,190,140',
    roar: '255,170,140', shield: '170,200,240', rock: '200,180,140', dark: '170,130,210',
    pillar: '255,232,170', areaRing: '255,214,150',
  };
  /* 태그가 없는 옛/외부 기술은 병과로 짐작한다 (설명과 그림이 어긋나지 않게) */
  function skillFxTag(u, sk) {
    const t = sk && sk.fx;
    if (t && SKILL_FX_TAGS.indexOf(t) >= 0) return t;
    const cls = (u && u.cls) || '';
    if (cls === 'dosa') return sk && sk.poison ? 'poison' : 'bolt';
    if (cls === 'chaeksa') return 'fire';
    if (cls === 'pungsusa') return sk && (sk.kind === 'heal' || sk.kind === 'healArea') ? 'heal' : 'quake';
    if (cls === 'gunwoong') return 'gold';
    if (cls === 'sujeok') return 'water';
    if (cls === 'muhui') return 'dance';
    if (cls === 'gunakdae') return 'music';
    if (cls === 'pocha' || cls === 'balseokcha') return 'rock';
    if (cls === 'yeonnobyung' || cls === 'gungsu' || cls === 'gunggi') return 'arrow';
    if (cls === 'yasubyung') return 'beast';
    if (cls === 'sanjeok') return 'dark';
    if (cls === 'deunggabyung') return 'shield';
    if (cls === 'mudoga') return 'fist';
    if (cls === 'gibi') return 'slash';
    if (sk && (sk.kind === 'heal' || sk.kind === 'healArea')) return 'heal';
    if (sk && /buff/.test(sk.kind || '')) return 'buffRing';
    return 'slash';
  }
  /* 시전 지점(또는 착탄 지점)에 속성 이펙트를 깐다. 돌려주는 값은 태그(검수용) */
  function skillFxAt(u, sk, x, y, opts) {
    const tag = skillFxTag(u, sk);
    const rad = (opts && opts.radius != null) ? opts.radius : ((sk && sk.radius) || 0);
    const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
    const col = SKILL_FX_COLOR[tag] || '255,214,120';
    const o = { kind: 'skillfx', sub: tag, x: cx, y: cy, life: 1150, color: col, radius: (rad + 1) * TILE, mag: (sk && sk.power) ? Math.min(2, sk.power / 400 + 0.4) : 1 };
    if (opts && opts.target) { o.tx = (opts.target.x + 0.5) * TILE; o.ty = (opts.target.y + 0.55) * TILE; }
    addFx(o);
    /* 검수용 로그 — 이펙트가 수명(820ms)보다 늦게 읽혀도 '무엇이 터졌는지' 남는다 */
    if (B) { B.skillFxLog = B.skillFxLog || []; B.skillFxLog.push(tag); }
    if (rad > 0) addFx({ kind: 'skillfx', sub: 'areaRing', x: cx, y: cy, life: 1000, radius: rad * TILE + TILE * 0.55, color: col });
    /* v5.60 — 큰 기술은 화면 전체가 한 번 물들어 '터졌다'는 것이 확실히 보인다 (화면 좌표계) */
    const big = (sk && sk.kind === 'buffAllAllies') || (sk && sk.kind === 'magicArea')
      || (sk && sk.power && sk.power >= 1.7) || (sk && sk.kind === 'buffSelf' && sk.atk);
    if (big) addFx({ kind: 'tint', life: 420, color: col });
    return tag;
  }
  SK.skillFxTag = skillFxTag;

  function drawSkillFx(f, p) {
    /* 좌표가 숫자가 아니면 그리지 않는다 (죽은 부대·화면 밖 좌표에서 캔버스가 예외를 내지 않게) */
    if (!isFinite(f.x) || !isFinite(f.y)) { (window.__fxNaN = window.__fxNaN || []).push(f.sub); return; }
    /* v5.60 — 폰 화면(배율 0.36~0.5)에서도 한눈에 보이도록 그림 자체를 1.9배로 그린다.
       범위 윤곽(areaRing)은 실제 판정 범위를 가리켜야 하므로 확대하지 않는다. */
    if (f.sub !== 'areaRing') {
      ctx.translate(f.x, f.y); ctx.scale(1.9, 1.9); ctx.translate(-f.x, -f.y);
    }
    /* v5.60 — 폰 화면에서도 단번에 보이도록: 초반은 불투명하게 유지하고 뒤에서만 옅어진다 */
    const A = Math.pow(1 - p, 0.7);
    const T = TILE;
    const col = f.color || '255,214,120';
    const R = f.radius || T * 1.6;
    const mag = f.mag || 1;
    switch (f.sub) {
      case 'areaRing': {
        /* 영향을 받는 범위를 마름모 윤곽으로 먼저 밝힌다 */
        ctx.strokeStyle = `rgba(${col},${Math.min(1, 0.85 * A)})`;
        ctx.lineWidth = 6 * A + 1.5;
        ctx.beginPath();
        const dx = f.radius + T * 0.4;
        ctx.moveTo(f.x - dx, f.y); ctx.lineTo(f.x, f.y - dx * 0.62);
        ctx.lineTo(f.x + dx, f.y); ctx.lineTo(f.x, f.y + dx * 0.62); ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = `rgba(${col},${0.20 * A})`;
        ctx.fill();
        break;
      }
      case 'slash': {
        ctx.strokeStyle = `rgba(${col},${0.9 * A})`;
        ctx.lineWidth = 6 * A + 1.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, T * 0.55, -1.0, 1.15 + p * 0.4); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * A})`;
        ctx.lineWidth = 2 * A + 0.6;
        ctx.beginPath(); ctx.arc(f.x, f.y, T * 0.34, 2.4, 4.3 + p * 0.5); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = -1 + i * 0.42;
          const d = T * (0.3 + p * 0.55);
          ctx.fillStyle = `rgba(255,244,210,${A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 2.2 * A + 0.8, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'goldSlash': {
        /* 군주 강타 — 두 겹 황금 참격이 크게 지나가고 중앙이 하얗게 번쩍인다 */
        const gg = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, T * (1.0 + p * 1.3));
        gg.addColorStop(0, `rgba(255,255,240,${Math.min(1, 1.05 * A)})`);
        gg.addColorStop(0.4, `rgba(255,206,110,${0.62 * A})`);
        gg.addColorStop(1, 'rgba(255,190,80,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(f.x, f.y, T * (1.0 + p * 1.3), 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 2; i++) {
          ctx.strokeStyle = `rgba(255,${236 - i * 26},${170 - i * 40},${Math.min(1, (1.0 - i * 0.22) * A)})`;
          ctx.lineWidth = (26 - i * 9) * A + 3;
          ctx.beginPath(); ctx.arc(f.x, f.y, T * (1.0 + i * 0.34), -1.45 - i * 0.12, 1.05 + p * 0.9); ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255,255,250,${Math.min(1, 0.95 * A)})`;
        ctx.lineWidth = 9 * A + 1.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, T * (1.05 + p * 0.3), -1.3, 0.9 + p * 0.7); ctx.stroke();
        for (let i = 0; i < 14; i++) {
          const a = i * 0.55 + f.x * 0.01;
          const d = T * (0.35 + p * 1.25);
          ctx.fillStyle = `rgba(255,240,175,${A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.8, 5.5 * A + 1.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'thrust': {
        const ang = Math.atan2((f.ty == null ? f.y : f.ty) - f.y, (f.tx == null ? f.x : f.tx) - f.x);
        ctx.strokeStyle = `rgba(${col},${0.9 * A})`;
        ctx.lineWidth = 4 * A + 1;
        for (let i = -1; i <= 1; i++) {
          const off = i * 5;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(ang + 1.57) * off - Math.cos(ang) * T * 0.9, f.y + Math.sin(ang + 1.57) * off - Math.sin(ang) * T * 0.9);
          ctx.lineTo(f.x + Math.cos(ang) * T * (0.4 + p * 0.7), f.y + Math.sin(ang) * T * (0.4 + p * 0.7));
          ctx.stroke();
        }
        break;
      }
      case 'fist': {
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + 0.2;
          const d = T * (0.15 + p * 0.7);
          ctx.strokeStyle = `rgba(${col},${0.85 * A})`;
          ctx.lineWidth = 3.2 * A + 1;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * d * 0.35, f.y + Math.sin(a) * d * 0.35);
          ctx.lineTo(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d);
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * A})`;
        ctx.lineWidth = 2 * A + 0.8;
        ctx.beginPath(); ctx.arc(f.x, f.y, T * (0.2 + p * 0.5), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'beast': {
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = `rgba(${col},${(0.85 - i * 0.2) * A})`;
          ctx.lineWidth = 4 * A + 1;
          ctx.beginPath();
          ctx.arc(f.x - T * 0.12 + i * 6, f.y, T * (0.38 + i * 0.06), -1.15, 0.55 + p * 0.5);
          ctx.stroke();
        }
        break;
      }
      case 'shield': {
        const w = T * (0.34 + p * 0.3), h = T * (0.42 + p * 0.3);
        ctx.fillStyle = `rgba(${col},${0.28 * A})`;
        ctx.strokeStyle = `rgba(230,244,255,${0.9 * A})`;
        ctx.lineWidth = 3 * A + 1;
        ctx.beginPath();
        ctx.moveTo(f.x - w, f.y - h * 0.8); ctx.lineTo(f.x + w, f.y - h * 0.8);
        ctx.lineTo(f.x + w, f.y + h * 0.1); ctx.quadraticCurveTo(f.x, f.y + h * 1.15, f.x - w, f.y + h * 0.1);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'wind': {
        for (let i = 0; i < 4; i++) {
          const d = T * (0.2 + p * 0.75) + i * 4;
          ctx.strokeStyle = `rgba(${col},${(0.8 - i * 0.16) * A})`;
          ctx.lineWidth = 3 * A + 0.8;
          ctx.beginPath(); ctx.arc(f.x, f.y, d, -0.9 + i * 0.16, 0.9 + i * 0.16); ctx.stroke();
        }
        break;
      }
      case 'arrow': {
        const ang = Math.atan2((f.ty == null ? f.y : f.ty) - f.y, (f.tx == null ? f.x : f.tx) - f.x);
        for (let i = 0; i < 3; i++) {
          const k = Math.max(0, p - i * 0.06);
          const d = T * (0.2 + k * 0.8);
          ctx.strokeStyle = `rgba(255,248,220,${(0.9 - i * 0.25) * (1 - p)})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d); ctx.stroke();
        }
        break;
      }
      case 'arrowRain': {
        /* 궁기 화살비 — 위에서 떨어지는 화살 여러 대 + 착탄 링 */
        for (let i = 0; i < 12; i++) {
          const a = i * 0.78 + (f.x % 17) * 0.1;
          const rr = R * 0.72 * ((i % 5) / 5 + 0.2);
          const px = f.x + Math.cos(a) * rr, py = f.y + Math.sin(a) * rr * 0.6;
          const fall = Math.max(0, Math.min(1, (p - (i % 4) * 0.07) * 2.2));
          ctx.strokeStyle = `rgba(255,240,190,${0.85 * (1 - p * 0.7)})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(px, py - T * 0.9 * (1 - fall)); ctx.lineTo(px, py - T * 0.9 * (1 - fall) + T * 0.42); ctx.stroke();
          if (fall > 0.85) {
            ctx.strokeStyle = `rgba(255,230,160,${0.6 * A})`;
            ctx.beginPath(); ctx.arc(px, py, T * 0.12, 0, Math.PI * 2); ctx.stroke();
          }
        }
        break;
      }
      case 'bolt': {
        const top = f.y - T * 2.4;
        ctx.strokeStyle = `rgba(210,238,255,${0.95 * A})`;
        ctx.lineWidth = 4 * A + 1;
        ctx.beginPath(); ctx.moveTo(f.x, top);
        for (let i = 1; i <= 6; i++) ctx.lineTo(f.x + (i === 6 ? 0 : Math.sin(i * 2.7 + f.x) * 10), top + (f.y - top) * (i / 6));
        ctx.stroke();
        const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, T * 0.7);
        g.addColorStop(0, `rgba(225,245,255,${0.8 * A})`);
        g.addColorStop(1, 'rgba(190,225,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, T * 0.7, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'boltStorm': {
        /* 천벌폭풍 — 굵은 번개 세 갈래가 번쩍이고 흰 충격 고리가 퍼진다 */
        for (let k = -1; k <= 1; k++) {
          const bx = f.x + k * T * 0.7;
          const top = f.y - T * 2.6;
          ctx.strokeStyle = k === 0 ? `rgba(255,255,255,${0.95 * A})` : `rgba(200,232,255,${0.75 * A})`;
          ctx.lineWidth = (k === 0 ? 6 : 3.5) * A + 1;
          ctx.beginPath(); ctx.moveTo(bx, top);
          for (let i = 1; i <= 7; i++) ctx.lineTo(bx + (i === 7 ? 0 : Math.sin(i * 3.1 + k) * 12), top + (f.y - top) * (i / 7));
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(235,248,255,${0.8 * A})`;
        ctx.lineWidth = 4 * A + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.5 + p * 0.9), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'fire': {
        for (let i = 0; i < 14; i++) {
          const a = i * 1.7;
          const r = R * 0.6 * p * (0.5 + (i % 4) * 0.2);
          ctx.fillStyle = `rgba(${240 - i * 4},${120 + (i % 5) * 12},40,${0.6 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r - p * T * 0.7, 6 * A + 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = `rgba(255,190,110,${0.8 * A})`;
        ctx.lineWidth = 3 * A + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.45 + p * 0.55), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'fireBuff': {
        /* 팔진화공 — 불기둥이 솟고 그 위로 금빛 버프 링이 퍼진다 */
        for (let i = 0; i < 12; i++) {
          const a = i * 1.9;
          const r = R * 0.55 * p;
          ctx.fillStyle = `rgba(255,${140 + (i % 4) * 16},60,${Math.min(0.95, 0.95 * A + 0.05)})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.8 - p * T * 0.9, 9 * A + 3, 0, Math.PI * 2); ctx.fill();
        }
        for (let i = 0; i < 2; i++) {
          ctx.strokeStyle = `rgba(255,232,160,${Math.min(1, (1.0 - i * 0.22) * A)})`;
          ctx.lineWidth = 7 - i * 2;
          ctx.beginPath(); ctx.arc(f.x, f.y, T * (0.8 + i * 0.35 + p * 1.1), 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'poison': {
        /* 독무술 — 초록·보라 독안개가 퍼지고 방울이 올라온다 */
        for (let i = 0; i < 9; i++) {
          const a = i * 1.1 + p * 0.6;
          const r = R * (0.25 + p * 0.65) * (0.55 + (i % 3) * 0.2);
          const c = i % 3 === 0 ? '176,140,225' : i % 3 === 1 ? '120,215,130' : '156,232,140';
          ctx.fillStyle = `rgba(${c},${Math.min(0.62, 0.62 * A + 0.10)})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.55 - p * T * 0.5, T * (0.46 + (i % 4) * 0.16) * (0.8 + p * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 10; i++) {
          const a = i * 0.63;
          const rr = R * 0.5 * (0.3 + (i % 4) * 0.22);
          const rise = p * T * (1.1 + (i % 3) * 0.3);
          ctx.fillStyle = i % 2 ? `rgba(196,255,170,${Math.min(1, 1.05 * A)})` : `rgba(210,170,250,${Math.min(1, 1.05 * A)})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.5 - rise, 5.2 * A + 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(90,160,70,${0.55 * A})`; ctx.lineWidth = 1.4; ctx.stroke();
        }
        break;
      }
      case 'quake': {
        /* 지진술 — 황토 균열이 갈라지고 돌파편이 튄다 */
        ctx.fillStyle = `rgba(198,158,92,${0.34 * A + 0.06})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.55 + p * 0.8), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(96,66,30,${Math.min(1, 1.05 * A)})`;
        ctx.lineWidth = 10 * A + 2;
        for (let i = 0; i < 9; i++) {
          const a = i * 0.9 + 0.3;
          let px = f.x, py = f.y;
          ctx.beginPath(); ctx.moveTo(px, py);
          for (let k = 1; k <= 3; k++) {
            px += Math.cos(a + Math.sin(k * 2 + i) * 0.5) * T * 0.42 * (1 + p);
            py += Math.sin(a + Math.cos(k * 3 + i) * 0.4) * T * 0.26 * (1 + p);
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        for (let i = 0; i < 12; i++) {
          const a = i * 0.7;
          const d = R * p * (0.5 + (i % 3) * 0.2);
          const up = Math.sin(Math.min(1, p * 1.4) * Math.PI) * T * 0.5;
          ctx.fillStyle = `rgba(${196 + (i % 3) * 14},${164 + (i % 4) * 10},${104},${Math.min(1, 1.05 * A)})`;
          ctx.save();
          ctx.translate(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6 - up);
          ctx.rotate(a + p * 2);
          ctx.fillRect(-6, -4, 12, 8);
          ctx.strokeStyle = `rgba(70,46,20,${0.8 * A})`; ctx.lineWidth = 1.6; ctx.strokeRect(-6, -4, 12, 8);
          ctx.restore();
        }
        ctx.strokeStyle = `rgba(214,176,110,${0.7 * A})`;
        ctx.lineWidth = 3 * A + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.4 + p * 0.8), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'earth': {
        for (let i = 0; i < 10; i++) {
          const a = i * 0.66;
          const d = R * p * 0.7;
          ctx.fillStyle = `rgba(196,168,116,${0.55 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6 - Math.sin(p * Math.PI) * T * 0.3, 4.5 * A + 1.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'water': {
        for (let i = 0; i < 3; i++) {
          const rr = R * (0.3 + p * 0.8 + i * 0.18);
          ctx.strokeStyle = `rgba(${col},${(0.85 - i * 0.22) * A})`;
          ctx.lineWidth = 4 * A + 1;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
        }
        for (let i = 0; i < 10; i++) {
          const a = i * 0.8;
          const d = R * 0.6 * p;
          ctx.fillStyle = `rgba(220,246,255,${0.9 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.5 - Math.sin(p * Math.PI) * T * 0.35, 2.8 * A + 1, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'dark': {
        for (let i = 0; i < 8; i++) {
          const a = i * 0.9 + p * 2.2;
          const r = R * (0.2 + p * 0.5) * (0.6 + (i % 3) * 0.2);
          ctx.fillStyle = `rgba(${col},${0.34 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.6 - p * T * 0.3, T * 0.28 * (0.8 + p * 0.4), 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'auraDark': {
        /* 광역 약화 — 보라 파동이 두 번 퍼진다 */
        for (let i = 0; i < 2; i++) {
          const k = Math.max(0, Math.min(1, p * 1.4 - i * 0.25));
          ctx.strokeStyle = `rgba(${col},${(0.8 - i * 0.25) * (1 - k)})`;
          ctx.lineWidth = 4 * (1 - k) + 1;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, R * (0.2 + k), R * (0.2 + k) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        }
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7 - p * 1.8;
          const d = R * 0.55 * (0.4 + p * 0.6);
          ctx.fillStyle = `rgba(${col},${0.75 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6 - p * T * 0.5, 2.6 * A + 1, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'gold': {
        for (let i = 0; i < 2; i++) {
          ctx.strokeStyle = `rgba(${col},${(0.9 - i * 0.3) * A})`;
          ctx.lineWidth = 3 * A + 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, T * (0.3 + i * 0.22 + p * 0.5), 0, Math.PI * 2); ctx.stroke();
        }
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9 + p * 1.6;
          const d = T * (0.3 + p * 0.5);
          ctx.fillStyle = `rgba(255,238,180,${0.9 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6 - p * T * 0.5, 2.4 * A + 1, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'goldWave': {
        /* 천하호령 — 지휘관 발밑에서 전장 끝까지 황금 파동이 세 번 퍼진다 */
        for (let i = 0; i < 3; i++) {
          const k = Math.max(0, Math.min(1, p * 1.35 - i * 0.2));
          if (k <= 0) continue;
          ctx.strokeStyle = `rgba(255,${232 - i * 18},${150 - i * 20},${Math.min(1, (1.05 - i * 0.2) * (1 - k))})`;
          ctx.lineWidth = (18 - i * 4) * (1 - k) + 3;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, R * k, R * k * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = `rgba(255,206,110,${0.20 * (1 - k)})`;
          ctx.fill();
        }
        const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, R * (0.35 + p * 0.8));
        g.addColorStop(0, `rgba(255,248,215,${Math.min(1, 0.95 * A)})`);
        g.addColorStop(0.55, `rgba(255,206,110,${0.5 * A})`);
        g.addColorStop(1, 'rgba(255,190,90,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.35 + p * 0.8), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'pillar': {
        /* 아군 한 부대 위로 솟는 빛기둥 */
        const h = T * (2.0 + p * 0.6);
        const g = ctx.createLinearGradient(f.x, f.y - h, f.x, f.y + T * 0.3);
        g.addColorStop(0, `rgba(${col},0)`);
        g.addColorStop(0.45, `rgba(${col},${0.72 * A})`);
        g.addColorStop(1, `rgba(255,252,230,${0.8 * A})`);
        ctx.fillStyle = g;
        ctx.fillRect(f.x - T * 0.24 * (1 - p * 0.3), f.y - h, T * 0.48 * (1 - p * 0.3), h + T * 0.3);
        ctx.strokeStyle = `rgba(255,250,225,${0.7 * A})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y + T * 0.28, T * (0.3 + p * 0.2), T * (0.14 + p * 0.1), 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'buffRing': {
        for (let i = 0; i < 2; i++) {
          ctx.strokeStyle = `rgba(${col},${Math.min(1, (1.0 - i * 0.25) * A)})`;
          ctx.lineWidth = 5 * A + 1.5;
          ctx.beginPath(); ctx.arc(f.x, f.y, T * (0.25 + i * 0.2 + p * 0.55), 0, Math.PI * 2); ctx.stroke();
        }
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 - p * 2;
          const d = T * (0.22 + p * 0.4);
          ctx.fillStyle = `rgba(255,240,190,${0.9 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.7 - p * T * 0.45, 2.4 * A + 0.8, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'dance': {
        for (let i = 0; i < 8; i++) {
          const a = i * 0.8 + p * 3.2;
          const d = T * (0.3 + p * 0.7) * (0.6 + (i % 3) * 0.2);
          ctx.fillStyle = `rgba(${col},${0.8 * A})`;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.5 - p * T * 0.6, 3.4 * A + 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(255,235,250,${0.6 * A})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, T * (0.35 + p * 0.6), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'music': {
        for (let i = 0; i < 3; i++) {
          const k = Math.max(0, Math.min(1, p * 1.3 - i * 0.22));
          if (k <= 0) continue;
          ctx.strokeStyle = `rgba(${col},${(0.8 - i * 0.2) * (1 - k)})`;
          ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, R * k * 0.6, -0.6, 0.6); ctx.stroke();
          ctx.beginPath(); ctx.arc(f.x, f.y, R * k * 0.6, 2.5, 3.7); ctx.stroke();
        }
        break;
      }
      case 'heal': {
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7 + p * 2.4;
          const d = T * (0.2 + p * 0.55);
          ctx.fillStyle = `rgba(${col},${0.85 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6 - p * T * 0.7, 2.6 * A + 1, 0, Math.PI * 2); ctx.fill();
        }
        for (let i = 0; i < 2; i++) {
          ctx.strokeStyle = `rgba(${col},${(0.7 - i * 0.25) * A})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, T * (0.3 + p * 0.5 + i * 0.15), T * (0.16 + p * 0.28), 0, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'fog': {
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + p * 0.7;
          const r = R * (0.25 + p * 0.6) * (0.5 + (i % 3) * 0.25);
          ctx.fillStyle = `rgba(${col},${0.24 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.5, T * 0.4 * (0.8 + p * 0.6), 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'roar': {
        for (let i = 0; i < 3; i++) {
          const k = Math.max(0, Math.min(1, p * 1.5 - i * 0.28));
          if (k <= 0) continue;
          ctx.strokeStyle = `rgba(${col},${(0.85 - i * 0.22) * (1 - k)})`;
          ctx.lineWidth = 3.4 * (1 - k) + 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.2 + k * 0.7), -0.7, 0.7); ctx.stroke();
          ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.2 + k * 0.7), Math.PI - 0.7, Math.PI + 0.7); ctx.stroke();
        }
        break;
      }
      case 'rock': {
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9;
          const d = R * p * (0.35 + (i % 3) * 0.2);
          const up = Math.sin(Math.min(1, p * 1.5) * Math.PI) * T * 0.55;
          ctx.fillStyle = `rgba(150,132,96,${0.9 * A})`;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6 - up, 5 * A + 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(255,238,190,${0.5 * A})`;
          ctx.lineWidth = 1.4; ctx.stroke();
        }
        break;
      }
    }
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

  function battleReportHTML(opt) {
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
    /* v5.84 — 승전 결산에만 1등 공신의 코믹 한마디를 붙인다 (patch_v584 의 V584_EXTRA_LINES.mvp) */
    let mvpBub = '';
    if (opt && opt.mvp) {
      const P = (typeof window !== 'undefined') ? window.V584 : null;
      let say = '';
      try { say = (P && P.mvpLine) ? (P.mvpLine(v584WhoOf(best.name)) || '') : ''; } catch (e) { say = ''; }
      if (say) mvpBub = `<div class="v584-bub mvp"><span class="vb-tag">👑 ${v584Esc(best.name)}</span><p>“${v584Esc(say)}”</p></div>`;
    }
    /* v5.16 — 총공격력·총피해·총회복 합계 줄 */
    const sum = list.reduce((a, r) => ({ dealt: a.dealt + r.dealt, taken: a.taken + r.taken, heal: a.heal + r.heal, kills: a.kills + r.kills }), { dealt: 0, taken: 0, heal: 0, kills: 0 });
    return `<div class="rm-report">
      <div class="rm-report-head"><b>전투 결산</b><span>MVP <em>👑 ${best.name}</em></span></div>
      ${mvpBub}
      <div class="rm-report-scroll"><table class="rm-dmg">
        <thead><tr><th>장수</th><th>총공격</th><th>받은피해</th><th>회복</th><th>처치</th></tr></thead>
        <tbody>${list.sort((a, b) => b.score - a.score).map((r) => `<tr class="${r.name === best.name ? 'mvp' : ''}">
          <td>${r.name === best.name ? '👑 ' : ''}${r.name}${r.alive ? '' : ` <em class="rm-fallen ${r.fate === '생포' ? 'captured' : ''}">${r.fate || '퇴각'}</em>`}</td>
          <td><i style="width:${r.dealt > 0 ? Math.max(2, Math.round((r.dealt / maxDealt) * 32)) : 0}px"></i>${fmtN(r.dealt)}</td>
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
      h.actedThisMonth = true;   // v5.80 — 요격 출진으로 이번 달을 썼다
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
    /* v5.87b — 요청 승리 명성 120~250 (적 격파 병력이 많을수록 높다) */
    if (SK.fameAdd) SK.fameAdd('battleWin', { defeated: Math.round(foeLeft) });
    else s.fame += 3;
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
        ${battleReportHTML({ mvp: true })}
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
      h.actedThisMonth = true;   // v5.80 — 요격 출진으로 이번 달을 썼다
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
        <p class="rm-line">길목을 지키지 못했습니다. 살아남은 병력은 <b>${SK.josa(targetName, 'euro')}</b> 물러났고, 적은 줄어든 병력으로 성 앞에 다다릅니다.</p>
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
      if (h) { h.marchId = null; h.actedThisMonth = true; h.hp = 1; }   // v5.80 — 이번 달 행동 소진
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
    if (SK.fameAdd) SK.fameAdd('battleWin');
    else s.fame += 2;
    s.pendingMarch = null;
    SK.save();
    SKBattle.refreshUI();
    const m2 = marchOf(B.intercept && B.intercept.marchId);
    const left = m2 ? m2.left : 0;
    /* v5.80 — 맞공격 요격 승리: 적 침공은 꺾이고, 우리 행군은 그대로 이어진다 */
    if (B.intercept && B.intercept.headOn) {
      const ho = B.intercept.headOn;
      const mid = B.intercept.marchId;
      if (ho.homeId && SK.markInvasionRepelled) { try { SK.markInvasionRepelled(ho.homeId, s); } catch (e) { /* ignore */ } }
      const cl = marchOf(mid);
      const nextLeft = cl ? (cl.left || 0) : 0;
      const homeName = ho.homeId && SK.CITY[ho.homeId] ? SK.CITY[ho.homeId].name : '우리 성';
      const goalName = ho.cityId && SK.CITY[ho.cityId] ? SK.CITY[ho.cityId].name : '적 성';
      SK.save();
      if (SK.refreshHud) SK.refreshHud();
      SK.modal({
        kicker: '맞공격 요격 승리',
        title: '길목을 지켰습니다',
        body: `<div class="result-modal win"><div class="rm-seal">승</div>
          <p class="rm-line">같은 길에서 마주친 적 침공군을 꺾었습니다. <b>${homeName}</b>을 노리던 침공은 무산되었습니다.</p>
          ${battleReportHTML({ mvp: true })}
          <div class="rm-rewards">
            <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
            <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
            <div><span>병력</span><b>${Math.round(survivors.reduce((a, u) => a + u.hp, 0)).toLocaleString('ko-KR')}</b></div>
          </div>
          <p class="rm-note">${nextLeft > 0 ? `행군을 이어갑니다 — <b>${nextLeft}개월 뒤 ${goalName}</b> 도착` : `이 달 그대로 <b>${goalName}</b> 공성전으로 이어집니다`} · 적 성은 침공군을 내보낸 만큼 수비병이 줄어 있습니다.</p></div>`,
        actions: [{ label: nextLeft > 0 ? '행군 계속' : '성으로 밀어넣는다', primary: true, onClick: () => {
          closeBattle();
          if (SK.afterFieldBattle) setTimeout(() => SK.afterFieldBattle(mid, 'clash'), 320);
          else SK.showMap();
        } }],
        dismissible: false,
      });
      return;
    }
    /* v5.66 — 성하 야전 승리: 나온 적만큼 성안 수비병을 깎고, 같은 달 곧바로 공성전으로 */
    if (B.intercept && B.intercept.field) {
      const fld = B.intercept.field;
      const mid = B.intercept.marchId;
      const ts = s.cities[fld.cityId] || null;
      const before = Math.round((ts && ts.troops) || 0);
      const cut = Math.max(0, Math.min(before, Math.round(fld.troops || 0)));
      if (ts) ts.troops = Math.max(0, before - cut);
      /* v6.0 — 이 요격전에서 군량고·무기고를 차지했으면 이어지는 공성전에 보너스로 남긴다 */
      const gotGoals = Object.keys(B.objTaken || {}).filter((k) => B.objTaken[k] === 'ally');
      let gift = null;
      if (gotGoals.length && s.cities[fld.cityId] && s.cities[fld.cityId].owner !== SK.playerFaction()) {
        const hasG = gotGoals.indexOf('granary') >= 0;
        gift = { cityId: fld.cityId, gate: hasG ? 0.72 : 0.82, morale: hasG ? 12 : 8, goals: gotGoals.slice() };
        s.nextSiegeBonus = gift;
      }
      SK.save();
      if (SK.refreshHud) SK.refreshHud();
      const after = ts ? Math.round(ts.troops || 0) : 0;
      SK.modal({
        kicker: '성하 야전 승리',
        title: `${(SK.CITY[fld.cityId] || {}).name || ''} 성하 돌파`,
        body: `<div class="result-modal win"><div class="rm-seal">승</div>
          <p class="rm-line">성 밖으로 나온 적을 꺾었습니다. 성안 수비병이 <b>${before.toLocaleString('ko-KR')} → ${after.toLocaleString('ko-KR')}</b>으로 줄었습니다 — 이 달 바로 공성전으로 이어집니다.</p>
          ${battleReportHTML({ mvp: true })}
          <div class="rm-rewards">
            <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
            <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
            <div><span>병력</span><b>${Math.round(survivors.reduce((a, u) => a + u.hp, 0)).toLocaleString('ko-KR')}</b></div>
            <div><span>적 수비병</span><b>${after.toLocaleString('ko-KR')}</b></div>
          </div>
          ${gift ? `<p class="rm-village">요격전 성과 — ${gift.goals.indexOf('granary') >= 0 ? '군량고' : ''}${gift.goals.length > 1 ? '·' : ''}${gift.goals.indexOf('armory') >= 0 ? '무기고' : ''}를 끊었습니다. 이어지는 공성전에서 <b>성문 HP ${Math.round((1 - gift.gate) * 100)}% 감소 · 적 사기 −${gift.morale}</b>.</p>` : ''}
          ${ts ? `<p class="rm-note">성벽 ${Math.round(ts.def || 0)} · 성안에 남은 수비병으로 성을 지킬 것입니다.</p>` : ''}</div>`,
        actions: [{ label: '성으로 밀어넣는다', primary: true, onClick: () => {
          closeBattle();
          if (SK.afterFieldBattle) setTimeout(() => SK.afterFieldBattle(mid), 320);
          else SK.showMap();
        } }],
        dismissible: false,
      });
      return;
    }
    SK.modal({
      kicker: '요격전 승리',
      title: `${B.def.name} 돌파`,
      body: `<div class="result-modal win"><div class="rm-seal">승</div>
        <p class="rm-line">길을 막던 적 요격대를 물리쳤습니다. <b>${left > 0 ? `${left}개월 뒤 도착` : '곧 도착'}</b> — 행군을 이어갑니다.</p>
        ${battleReportHTML({ mvp: true })}
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

  /* v5.80 — 맞공격 길목 야전에서 지거나 물러나면, 적 침공군이 그대로 우리 성으로 밀고 들어온다 */
  function restoreHeadOnInvasion() {
    if (!B || !B.intercept || !B.intercept.headOn) return null;
    const s = SK.state;
    const inv = B.intercept.headOn.invasion ? Object.assign({}, B.intercept.headOn.invasion) : null;
    const tgt = inv && s.cities[inv.target];
    if (!inv || !tgt || tgt.owner !== SK.playerFaction() || !SK.pushInvasion) return null;
    const foeLeft = Math.round(B.units.filter((u) => u.side === 'enemy' && u.alive).reduce((a, u) => a + Math.max(0, u.hp), 0));
    inv.troops = Math.max(600, Math.min(Math.round(inv.troops || 0), foeLeft || Math.round((inv.troops || 0) * 0.6)));
    inv.intercepted = false;
    inv.survivingEnemies = B.units.filter((u) => u.side === 'enemy' && u.alive).map((u) => ({
      name: u.name, cls: u.cls, lv: u.lv, hp: Math.round(u.hp), maxHp: Math.round(u.maxHp),
      genId: u.genId != null ? u.genId : null, boss: !!u.boss, leader: !!u.leader,
      portrait: u.portrait || null, tier: u.tier || null,
    }));
    SK.pushInvasion(s, inv);
    return inv;
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
      if (h) { h.marchId = null; h.actedThisMonth = true; if (hid) h.city = hid; h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * (u.alive ? 0.5 : 0.2))); }
    });
    if (st) s.purseCity = hid;
    s.gold = Math.max(0, s.gold - 100);
    s.pendingMarch = null;
    /* v5.80 — 맞공격 요격 패배: 행군은 무산되고, 적 침공군은 그대로 우리 성 앞으로 밀고 들어온다 */
    const headOnPush = !!restoreHeadOnInvasion();
    SK.save();
    const homeName = hid && SK.CITY[hid] ? SK.CITY[hid].name : null;
    const fieldLost = !!(B.intercept && B.intercept.field);
    const headOnLost = !!(B.intercept && B.intercept.headOn);
    const invName = (B.intercept && B.intercept.headOn && B.intercept.headOn.homeId && SK.CITY[B.intercept.headOn.homeId])
      ? SK.CITY[B.intercept.headOn.homeId].name : '우리 성';
    SK.modal({
      kicker: headOnLost ? '맞공격 요격 패배' : (fieldLost ? '성하 야전 패배' : '행군 실패'),
      title: homeName ? '회군' : '유랑군',
      body: `<div class="result-modal lose"><div class="rm-seal">패</div>
        <p class="rm-line">${headOnLost ? '같은 길에서 마주친 적 침공군에게 밀렸습니다. 행군은 무산되고, 적이 그대로 성 앞으로 밀고 들어옵니다.' : (fieldLost ? '성 밖으로 나온 적에게 밀렸습니다.' : '요격대에 길이 막혔습니다.')} ${homeName ? `남은 병력은 <b>${homeName}</b>으로 돌아갑니다.` : '돌아갈 성이 없어 남은 병력이 흩어졌습니다.'}${hid && hid !== B.origin ? `<br><em>출발 성 ${SK.josa(SK.CITY[B.origin] ? SK.CITY[B.origin].name : '본성', 'i')} 이미 함락되어 가장 가까운 아군 성으로 향했습니다.</em>` : ''}</p>
        ${battleReportHTML()}
        <p class="rm-note">복귀 병력 ${Math.round(back).toLocaleString('ko-KR')}${cut ? ` (패전 피해 감소 +${Math.round(back - troopsLeft)})` : ''} · 금 -100${headOnPush ? ` · <b>${invName}</b> 수성전으로 이어집니다` : ''}</p></div>`,
      actions: [{ label: headOnPush ? '성을 지킨다' : '지도로', primary: headOnPush, onClick: () => {
        closeBattle();
        SK.showMap();
        if (headOnPush) {
          setTimeout(() => {
            if (SK.promoteInvasionQueue) SK.promoteInvasionQueue(s);
            if (s.pendingInvasion && SK.openPendingInvasion) SK.openPendingInvasion();
          }, 520);
        }
      } }],
      dismissible: false,
    });
  }

  function clearMarchFlags() {
    const s = SK.state;
    B.units.forEach((u) => {
      if (u.side !== 'ally' || !u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      /* v5.80 — 전투로 이번 달을 썼으므로, 행군에서 풀려도 그 달에는 다시 출진할 수 없다
         (달이 바뀔 때 advanceMonth가 false로 되돌린다) */
      if (h) { h.marchId = null; h.actedThisMonth = true; }
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
  function rollPrisoners(all) {
    const info = SK.factionInfo(B.faction) || {};
    const bossName = info.lord || '';
    const st0 = SK.state || {};
    const heroes0 = st0.heroes || [];
    const alreadyMine = (g) => heroes0.some((h) => h && (h.genId === g.id || h.name === g.name));
    /* v5.78 — 마지막 성(세력 멸망)을 함락하면 "최대 2명"·"군주 제외" 규칙을 풀고
       그 성에 남아 있던 적 장수를 군주까지 전부 포로 목록으로 넘긴다. */
    if (all && typeof all === 'object' && all.all) {
      const allOut = [];
      const add = (g) => {
        if (!g || g.id == null) return;
        if (allOut.some((x) => x.id === g.id)) return;
        if (alreadyMine(g)) return;
        if (SK.isDead && SK.isDead(g.id, g.name)) return;
        allOut.push(g);
      };
      B.units.forEach((u) => { if (u.side === 'enemy' && u.genId) add(SK.GEN_BY_ID[u.genId]); });
      (all.genIds || []).forEach((gid) => add(SK.GEN_BY_ID[gid]));
      if (bossName) add(SK.GEN_BY_NAME[bossName]);
      return allOut;
    }
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
    /* v5.84 — 포로 대표 한 명의 한마디를 창 위에 깔끔하게 (patch_v584 의 V584_EXTRA_LINES.capture) */
    let capSay = '';
    try {
      const P = (typeof window !== 'undefined') ? window.V584 : null;
      capSay = (P && P.captureLine) ? (P.captureLine(v584WhoOf(g.name)) || '') : '';
    } catch (e) { capSay = ''; }
    const m = SK.modal({
      kicker: `포로 ${i + 1} / ${all.length}`, title: `${SK.josa(g.name, 'eul')} 어떻게 할까`, wide: true,
      body: `${capSay ? `<div class="v584-bub cap"><span class="vb-tag">🗣️ ${v584Esc(g.name)}</span><p>“${v584Esc(capSay)}”</p></div>` : ''}<div class="prison-card">
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
            /* v5.80 — 등용한 장수는 주점 재야 명부·옛 군주 명부에서도 지운다 (주점에 또 앉는 버그) */
            if (SK.claimWildGen) SK.claimWildGen(g);
            line = `<b>${g.name}</b> — 등용 성공. 충성 55로 우리 장수가 되었습니다. [포상]으로 마음을 잡으십시오.`;
            SK.sfx.play('ui');
          } else {
            s.fame = Math.max(0, (s.fame || 0) + 1);
            if (SK.state) { SK.state.genLoyal = SK.state.genLoyal || {}; }
            line = `<b>${g.name}</b> — “두 번 다시 그런 말 마시오.” 등용 실패. 풀어 주었습니다. 명성 +1.`;
            /* v5.78 — 풀려난 장수는 재야가 되어 주점에 다시 앉는다 (군주도 포함) */
            if (SK.wildRelease) SK.wildRelease(g, cityId);
            SK.sfx.play('deny');
          }
        } else if (act === 'free') {
          if (SK.setPurse) SK.setPurse(cityId);
          s.gold += gold;
          s.fame += 3;
          /* v5.78 — 석방한 장수도 재야로 풀려나 이후 주점 탐색에 다시 나온다 */
          if (SK.wildRelease) SK.wildRelease(g, cityId);
          line = `<b>${g.name}</b> — 석방. 몸값 금 +${gold}, 명성 +3.`;
          SK.sfx.play('coin');
        } else {
          /* v5.11 — 처형 대신 포로 억류: 첫 3개월 탈출 불가, 이후 매달 확률 탈출 */
          const rec = addPrisoner(g, cityId);
          line = rec
            ? `<b>${g.name}</b> — 포로 억류. ${cityId && SK.CITY[cityId] ? SK.CITY[cityId].name : '성'} 순찰소에 가뒀습니다. 3개월은 탈출하지 못하고, 그 뒤로는 순찰소·치안이 높을수록 탈출이 어려워집니다.`
            : `<b>${g.name}</b> — 억류할 자리가 없습니다. 6명까지만 가둘 수 있어 풀어 주었습니다.`;
          /* v5.78 — 자리가 없어 풀어 준 경우에도 재야로 돌려보낸다 */
          if (!rec && SK.wildRelease) SK.wildRelease(g, cityId);
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
    /* v5.65 — 포로·투항 장수도 늦게 합류하면 시대 AI 평균 레벨에 맞춰 온다 */
    if (SK.makeHero) return SK.makeHero(g.name, cityId, SK.joinLevelOf ? SK.joinLevelOf(g) : SK.genLv(g));
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
        h.actedThisMonth = true;   // v5.80 — 원군으로 이번 달을 썼다
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
    /* v5.78 — 멸망 속보 배너에 쓸 깃발·색·군주도 지우기 전에 적어 둔다 */
    const prevFac = (s.factions || {})[prevOwner] || {};
    const prevLord = prevFac.lord || '';
    const prevMark = prevFac.mark || SK.FACTION_MARK[prevOwner] || '';
    const prevColor = prevFac.color || SK.FACTION_COLOR[prevOwner] || '';
    const defeatedNames = B.units.filter((u) => u.side === 'enemy').map((u) => u.name);
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = survivors.reduce((sum, u) => sum + u.hp, 0);
    /* v5.9 — 잃은 병력의 35~50%는 전사 대신 부상병으로 함락한 성에 남는다 */
    const lostN = lostOf('ally');
    const prevGenIds = (st.genIds || []).slice();   // v5.77 — 포로·등용되지 않은 적 장수는 남은 성으로 퇴각시킨다
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
    if (SK.isSiegeType(B.type) || B.type === 'fortress') {
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
    /* v5.61 — 마지막 성을 빼앗긴 세력은 그 자리에서 정리하고(유령 세력 방지),
       남은 세력 수를 승전 창의 멸망 배너에 적는다. AI끼리 성을 주고받아 0성이 된
       세력도 이때 함께 걷어낸다. */
    if (SK.pruneLandlessFactions) {
      try {
        const goneNow = SK.pruneLandlessFactions(s) || [];
        if (!fallenFaction && goneNow.length) fallenFaction = goneNow[0];
        /* v5.87b — 마지막 성을 빼앗아 세력을 지우면 명성 +1,200 */
        if (goneNow.length && SK.fameAdd) SK.fameAdd('factionDestroy', { count: goneNow.length });
      } catch (e) { /* ignore */ }
    }
    const factionsLeft = Object.keys(s.factions || {}).filter((k) => k !== 'neutral').length;
    s.gold += B.rewards.gold;
    s.food += B.rewards.food;
    const vgGold = addVillageWarGold(s);   // v5.42 — 마을 점령 수당
    /* v5.87b — 성 함락 명성: 350 + 성 종류 보너스(대도시 +150 · 중도시 +75 · 관문·요새 +50) */
    if (SK.fameAdd) SK.fameAdd('cityCapture', { cityId: B.targetId, type: c && c.type });
    else s.fame += 12 + (SK.battleTypeFor(c) === 'fortress' ? 6 : 0) + (B.event ? 5 : 0);
    const drop = SK.rollTreasure ? SK.rollTreasure(defeatedNames, c.name) : null;
    if (drop && SK.codexTreasure) SK.codexTreasure(drop.id);
    awardMvpMerit();
    /* v5.8 — 이긴 자리에서 적 장수 일부를 사로잡는다 */
    prisonCity = B.targetId;
    /* v5.78 — 마지막 성이면 군주 포함 전원 포로 (2명 제한·군주 제외 해제) */
    const prisoners = rollPrisoners(fallenFaction ? { all: true, genIds: prevGenIds } : null);
    B.prisoners = prisoners;
    /* v5.77 — 함락한 성 장수 중 포로로 잡히지 않은 이들은 그 세력의 남은 성으로 퇴각한다.
       예전에는 genIds를 비워 버려 맹획군 성(영창)이 남아 있어도 맹획·축융·올돌골이 증발했다. */
    let genRetreat = { cityId: null, cityName: '', count: 0 };
    if (SK.retreatEnemyGens) {
      try { genRetreat = SK.retreatEnemyGens(s, prevOwner, B.targetId, prevGenIds, prisoners.map((g) => g.id)); } catch (e) { /* ignore */ }
    }
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
    /* v5.78 — 플레이어 공성으로 세력이 멸망했으면 승전 창을 넘길 때 코믹 속보를 먼저 띄우고
       [포로 N명 처리하러 가기 →] 로 포로 처리 창에 잇는다. */
    let fallItem = null;
    if (fallenFaction) {
      fallItem = {
        id: prevOwner, name: prevOwnerName, lord: prevLord, mark: prevMark, color: prevColor,
        cityName: c.name, byPlayer: true, prisoners,
      };
      s.fallQueue = (s.fallQueue || []).filter((x) => !x || x.id !== prevOwner);
    }
    SK.modal({
      kicker: '승리',
      title: `${c.name} 함락`,
      body: `<div class="result-modal win">
        <div class="rm-seal">승</div>
        ${B.winReason ? `<p class="rm-reason">승리 사유: ${B.winReason}</p>` : ''}
        <p class="rm-line">${SK.josa(prevOwnerName, 'eul')} 무찌르고 <b>${SK.josa(c.name, 'eul')}</b> 차지했습니다.</p>
        ${fallenFaction ? `<div class="rm-fall-banner"><b>🏆 ${fallenFaction} 멸망!</b><span>마지막 성을 잃고 천하에서 사라졌습니다 · 남은 세력 ${factionsLeft}곳${freedCaptives.length ? ` · 해방된 아군 포로 ${freedCaptives.join(' · ')}` : ''}</span></div>` : ''}
        ${freedCaptives.length && !fallenFaction ? `<p class="rm-release">사로잡혀 있던 ${freedCaptives.join(' · ')} — 풀려나 ${c.name}으로 돌아왔습니다.</p>` : ''}
        ${genRetreat.count ? `<p class="rm-release">${prevOwnerName} 장수 ${genRetreat.count}명은 ${SK.josa(genRetreat.cityName, 'euro')} 퇴각했습니다.</p>` : ''}
        <div class="rm-rewards">
          <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
          <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
          <div><span>명성</span><b>+12</b></div>
          <div><span>영토</span><b>${owned} / ${SK.CITY_LIST.length}</b></div>
          ${woundedAdd ? `<div class="rm-wound"><span>부상병</span><b>${woundedAdd.toLocaleString('ko-KR')}</b><em>회복중</em></div>` : ''}
        </div>
        ${vgGold.gold ? `<p class="rm-village">마을 <b>${vgGold.count}</b>곳 점령 수당 — 금 <b>+${vgGold.gold.toLocaleString('ko-KR')}</b></p>` : ''}
        ${battleReportHTML({ mvp: true })}
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
      actions: [(window.SKTUT && SKTUT.active)
        /* v5.98 — 튜토리얼 공성전 승리: 결산을 넘기면 '입문 완료!' 팝업으로 잇는다 */
        ? { label: '입문 완료!', primary: true, onClick: () => { closeBattle(); SKTUT.onWin({ cityName: c.name }); } }
        : { label: prisoners.length || fallItem ? '포로를 처리한다' : '지도로', primary: true, onClick: () => {
          closeBattle(); SK.showMap();
          const goPrison = () => { if (prisoners.length) wait(() => openPrisoners(prisoners), 340); };
          if (fallItem && SK.showFallBanner) SK.showFallBanner(fallItem, goPrison);
          else goPrison();
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
      actions: [(window.SKTUT && SKTUT.active)
        /* v5.98 — 튜토리얼에서 지면 같은 전장을 다시 열 수 있게 한다 */
        ? { label: '다시 도전', primary: true, onClick: () => { closeBattle(); SKTUT.onLose(); } }
        : { label: '지도로', onClick: () => { closeBattle(); SK.showMap(); } }],
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
    /* v5.87b — 수성전으로 막으면 명성 +160 */
    if (SK.fameAdd) SK.fameAdd('defendWin');
    else s.fame = (s.fame || 0) + 10;
    awardMvpMerit();
    const levelUps = [];
    B.units.forEach((u) => {
      if (u.side !== 'ally' || !u.uid) return;
      const h = s.heroes.find((x) => x.uid === u.uid);
      if (!h) return;
      h.actedThisMonth = true;   // v5.80 — 수성전으로 이번 달 행동을 썼다 (같은 달 재출진 방지)
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
        ${battleReportHTML({ mvp: true })}
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
    s.fame = Math.max(0, (s.fame || 0) - 30);
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
        <p class="rm-line">${SK.josa(SK.factionName(inv.faction), 'i')} 성을 차지했습니다.${res.refuge ? ` 남은 병력 ${Math.round(res.moved).toLocaleString('ko-KR')}과 장수는 <b>${SK.josa(SK.CITY[res.refuge].name, 'euro')}</b> 물러났습니다.` : ' 물러날 성이 없습니다.'}</p>
        <p class="rm-note">명성 −10 · 성벽·민심이 무너지고, 다음 달부터 이 성은 적의 것입니다.${rfgInfo && rfgInfo.home ? ` ${rfgInfo.home} 원군은 자기 성으로 돌아갔습니다.` : ''}</p></div>`,
      actions: [{ label: '지도로', primary: true, onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  function retreat() {
    if (!B) return;
    /* v5.89 — 관전·자동결산 중에는 후퇴도 받지 않는다 (AI가 끝까지 지휘한다) */
    if (spectateMode || skipMode) {
      SK.toast('관전 중에는 후퇴할 수 없습니다 — AI가 지휘합니다.');
      return;
    }
    /* v5.7 — 수성전에서 물러나면 성을 내주는 것과 같다 */
    if (B.defense) { defenseDefeat(); return; }
    /* v5.98 — 튜토리얼 후퇴: 행군 없이 연 전장이라 병력을 잃지 않고 진류로 돌려보낸 뒤
       다시 도전할 수 있게 한다 (입문에서 병력을 날리고 막혀 버리지 않게) */
    if (typeof window !== 'undefined' && window.SKTUT && window.SKTUT.active) {
      const st0 = SK.state && SK.state.cities ? SK.state.cities[B.origin] : null;
      const surv = B.units.filter((u) => u.side === 'ally' && u.alive);
      const left = surv.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
      if (st0) st0.troops = Math.min(20000, Math.round((st0.troops || 0) + left));
      B.units.forEach((u) => {
        if (u.side !== 'ally' || !u.uid) return;
        const h = SK.state.heroes.find((x) => x.uid === u.uid);
        if (h) { h.marchId = null; h.actedThisMonth = false; h.city = B.origin; h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.8)); }
      });
      SK.save();
      B.over = true;
      clearBattleProgress();
      closeBattle();
      window.SKTUT.onLose();
      return;
    }
    let headOnBack = false;
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
        if (h) { h.marchId = null; h.actedThisMonth = true; h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.6)); }
      });
      /* v5.80 — 맞공격 야전에서 물러나면 적 침공은 그대로 우리 성으로 온다 */
      headOnBack = !!restoreHeadOnInvasion();
      clearMarchFlags();
      SK.save();
    }
    B.over = true;
    clearBattleProgress();
    closeBattle();
    SK.showMap();
    SK.toast(headOnBack ? '전투에서 물러났습니다 — 적이 성으로 밀고 들어옵니다.' : '전투에서 물러났습니다.');
    if (headOnBack) {
      setTimeout(() => {
        if (SK.promoteInvasionQueue) SK.promoteInvasionQueue(SK.state);
        if (SK.state.pendingInvasion && SK.openPendingInvasion) SK.openPendingInvasion();
      }, 520);
    }
  }

    /* v5.27 — 전투 결과가 확정되면 복귀용 표식을 지운다 (앱을 닫았다 열어도 병력이 겹쳐 돌아오지 않게) */
  function clearBattleProgress() {
    try {
      if (SK.state && SK.state.battleInProgress) { SK.state.battleInProgress = null; SK.save(); }
    } catch (e) { /* ignore */ }
    clearSnap();
  }
  function closeBattle() {
    clearBattleProgress();
    /* v5.89 — 관전·자동결산 상태와 배속을 다음 전장으로 넘기지 않는다 */
    spectateMode = false;
    skipMode = false;
    paceBoost = 1;
    const sbar = document.querySelector('#spectate-bar');
    if (sbar) sbar.hidden = true;
    const scr = document.getElementById('screen-battle');
    if (scr) scr.classList.remove('spectating');
    ['#battle-actions .act.auto', '#btn-retreat', '#btn-speed'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.hidden = false;
    });
    /* v5.84 — 필살기 타격 연출(암전·팝업·파티클)이 지도나 결과 창 위에 남지 않게 걷어낸다 */
    try { if (window.V584_ULT_FX && window.V584_ULT_FX.stop) window.V584_ULT_FX.stop(); } catch (e) { /* ignore */ }
    /* v5.98 — 사거리 타겟 테두리 레이어도 함께 정리 */
    try { clearAttackTargets(); if (targetLayer && targetLayer.parentNode) targetLayer.parentNode.removeChild(targetLayer); targetLayer = null; } catch (e) { /* ignore */ }
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

  /* v5.89 — 인트로 종료 처리를 한 함수로 모은다 (관전·자동결산은 인트로 없이 바로 시작) */
  function finishIntro() {
    const ov = $('#battle-overlay');
    if (ov) { ov.innerHTML = ''; ov.hidden = true; ov.onclick = null; }
    if (!B) return;
    B.introDone = true;
    classAuraPhase('ally');
    /* v5.82 — 첫 아군 턴 시작 특기 */
    B.units.forEach((u) => { if (u.side === 'ally' && u.alive) vpTurnStart(u); });
    banner(spectateMode ? (skipMode ? '자동 결산' : '관전') : '아군 페이즈', 'ally');
    const afterVolley = () => {
      if (!B) return;
      if (spectateMode) {
        const first = B.units.find((u) => u.side === 'ally');
        if (first) selectUnit(first);
      }
      if (spectateMode || skipMode) startSpectating();
    };
    /* v5.91 — 수성전 첫 아군 턴(수비 측)도 망루가 먼저 쏜다 */
    if (!towerTurnFire('ally', afterVolley)) afterVolley();
  }

  /* v5.89 — 관전/자동결산: 아군 [자동]을 강제로 켜고, 플레이어 명령·후퇴·배속 버튼을 잠근다.
     (건너뛰기는 같은 엔진을 배속 10으로 돌려 결과만 빠르게 받는다) */
  function startSpectating() {
    if (!B) return;
    const bar = document.querySelector('#spectate-bar');
    if (bar) {
      bar.hidden = false;
      bar.innerHTML = skipMode
        ? '<b>👁 자동 결산</b> 총도독이 지휘합니다 — 결과까지 AI가 진행합니다'
        : '<b>👁 관전 중</b> AI가 지휘합니다 — 직접 조작할 수 없습니다';
    }
    const autoBtn = document.querySelector('#battle-actions .act.auto');
    if (autoBtn) autoBtn.hidden = true;
    const retreat = document.querySelector('#btn-retreat');
    if (retreat) retreat.hidden = true;
    const spd = document.querySelector('#btn-speed');
    if (spd) spd.hidden = true;
    /* hidden 속성은 display 규칙에 져서 화면에 남는다(.act·.icon-btn) → 전용 클래스로 확실히 숨긴다 */
    const scr = document.getElementById('screen-battle');
    if (scr) scr.classList.add('spectating');
    if (skipMode) {
      autoSpeed = 4;
      paceBoost = 12;   // 같은 엔진을 최대 배속으로 돌려 결과만 빨리 받는다
    }
    paintSpeedBtn();
    autoStop();
    autoOn = true;
    autoPending = null;
    autoClear();
    autoTimer = wait(autoStep, 160);
    SK.toast(skipMode ? '총도독 전투 — 결과까지 자동으로 결산합니다.' : '관전 — 아군도 AI가 지휘합니다. 직접 명령은 잠겼습니다.');
  }

  function showIntro() {
    let i = 0;
    const ov = $('#battle-overlay');
    ov.hidden = false;
    /* v5.65 — [건너뛰기 ⏭] — 전투마다 3~4번 터치해야 하던 인트로를 한 번에 넘긴다 */
    const skipBtn = '<button type="button" class="intro-skip" aria-label="인트로 건너뛰기">건너뛰기 ⏭</button>';
    const render = () => {
      if (!B) return;
      if (i >= B.introLines.length) { finishIntro(); return; }
      const L = B.introLines[i];
      if (L.event) {
        const ev = L.event;
        /* v5.20 — 이 이벤트는 적 성의 장수(defGens)에게서 골라지므로, 보상 문구의 '아군'은
           플레이어가 아니라 적군을 가리킨다. 그대로 두면 김유신의 '아군 사기 +15'가 우리 군에
           붙는 줄 알고 수성전에 들어가게 된다. */
        const evReward = String(ev.reward || '').replace(/아군/g, '적군');
        ov.innerHTML = `${skipBtn}<div class="event-card">
          <div class="ev-seal">연</div>
          <div class="ev-main"><span class="ev-type">${ev.type || '특별 이벤트'} · 적 장수</span>
            <h4>${ev.title}</h4>
            <p class="ev-dialogue">“${ev.dialogue}”</p>
            <p class="ev-reward">${evReward}</p>
            <em class="ev-enemy">적 장수 효과 — 우리 군에는 적용되지 않습니다</em>
            <span class="ic-tap">터치하여 계속 ▸</span></div>
        </div>`;
        ov.onclick = (ev) => {
          if (ev && ev.target && ev.target.closest && ev.target.closest('.intro-skip')) { i = B.introLines.length; render(); return; }
          i += 1; render();
        };
        return;
      }
      ov.innerHTML = `${skipBtn}<div class="intro-card ${L.side}">
        <img class="ic-portrait ${SK.tcls(L.who)}" src="${SK.ptSrc(L.pt)}" alt="">
        <div class="ic-box">
          <div class="ic-name">${L.who}</div>
          <p class="ic-text">${L.text}</p>
          <span class="ic-tap">터치하여 계속 ▸</span>
        </div>
      </div>`;
      ov.onclick = (ev) => {
        if (ev && ev.target && ev.target.closest && ev.target.closest('.intro-skip')) { i = B.introLines.length; render(); return; }
        i += 1; render();
      };
    };
    render();
  }

  /* ════════════════════════════════════════════════════════════════════════
     v5.91 — 공성 자동 포격 망루 (수성 측 성문 좌우)
     · 공성전(siege)·수성전(defense)에서 성 규모(rings)에 맞춰 2 · 3 · 4대를
       가장 바깥 성문부터 성문 좌우 안쪽 칸에 세운다 (가운데 통로는 비워 둔다).
     · 수비 측 턴이 시작되면 살아 있는 망루가 사거리 3칸 안의 가장 가까운
       공격 측 부대에 화살을 쏜다 (130~180 − 방어×0.6, 최소 40).
     · 공격 측 부대는 사거리 안의 망루를 눌러 공략할 수 있다 (포차·발석차 ×1.5).
       수비 측 부대는 자기편 망루를 치지 못한다. 공격 측 AI도 같은 규칙을 쓴다.
     · 기존 망루(T) 지형 효과(방어 +45% · 사거리 +1 · 회복)는 그대로 둔다.
     ════════════════════════════════════════════════════════════════════════ */
  const TOWER = {
    /* v5.96 — 초반 공성전 보강: 성문 좌우 망루의 사거리 3→4칸, 화살 150~200(최소 45).
       성문을 두드리는 동안 성벽 안쪽에서 계속 포격이 들어와 4턴 일방전이 줄어든다. */
    HP: 500, RNG: 4,
    DMG_MIN: 150, DMG_MAX: 200, DMG_FLOOR: 45, DEF_CUT: 0.6,
    SIEGE_MUL: 1.5, SIEGE_CLS: { pocha: 1, balseokcha: 1 },
    ATK_K: 5.0,                 // 공격 측 부대가 망루에 주는 피해 계수
    ARROW_MS: 380, FIRE_GAP: 240,
  };
  function towerOwnerSide() { return B && B.defense ? 'ally' : 'enemy'; }
  function towerAttackerSide() { return B && B.defense ? 'enemy' : 'ally'; }
  function towerList() { return (B && B.towers) || []; }
  function towerAt(x, y) {
    const list = towerList();
    for (let i = 0; i < list.length; i++) if (list[i].alive && list[i].x === x && list[i].y === y) return list[i];
    return null;
  }
  /* 파괴된 잔해도 칸을 막는다 — 부대가 잔해 위에 서지 않게 */
  function towerRubbleAt(x, y) {
    const list = towerList();
    for (let i = 0; i < list.length; i++) if (!list[i].alive && list[i].x === x && list[i].y === y) return list[i];
    return null;
  }
  /* 살아 있는 망루만 길을 막는다 (잔해는 밟고 지나갈 수 있다) */
  function towerBlockAt(x, y) { return !!towerAt(x, y); }

  function towerCountFor(rings) {
    const r = Number(rings) || 1;
    return r >= 3 ? 4 : (r === 2 ? 3 : 2);
  }
  /* 망루를 세울 수 있는 칸인가 — 부대·성문·성벽·본성·기존 망루 지형·본진/마을과 겹치지 않게 */
  function towerSpotFree(x, y) {
    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) return false;
    const row = B.tiles[y];
    const ch = row ? row[x] : '';
    if (!ch) return false;
    if (ch === 'C' || ch === 'H' || ch === 'G' || ch === 'K' || ch === 'T' || ch === 'W' || ch === 'M') return false;
    if ((B.gates || []).some((g) => (g.tiles || []).some((t) => t.x === x && t.y === y))) return false;
    if (B.units.some((u) => u.alive && u.x === x && u.y === y)) return false;
    if ((B.sites || []).some((s) => s.x === x && s.y === y)) return false;
    if (towerBlockAt(x, y)) return false;
    return true;
  }

  /* 전투를 열 때(B·부대·성문·본진이 모두 자리 잡은 뒤) 한 번 부른다. */
  function initTowers() {
    if (!B) return;
    B.towers = [];
    if (!SK.isSiegeType(B.type)) return;
    const gates = (B.gates || []).slice().sort((a, b) => (b.row || 0) - (a.row || 0));
    if (!gates.length) return;
    const n = towerCountFor(B.rings || 1);
    const side = towerOwnerSide();
    /* 성문마다 좌·우 한 대씩, 안쪽(성 안) 가까운 칸부터 후보를 모은다 */
    const slots = gates.map((g) => {
      const xs = (g.tiles || []).map((t) => t.x);
      const ys = (g.tiles || []).map((t) => t.y);
      if (!xs.length) return [];
      const leftX = Math.min.apply(null, xs), rightX = Math.max.apply(null, xs);
      const innerY = Math.min.apply(null, ys) - 1;
      /* 성문 좌·우에서 안쪽으로 한 칸 더 들어간 자리부터 — 성문 누각 그림에 가리지 않게 */
      const spots = [];
      [1, 0, 2, 3].forEach((dy) => {
        [1, 2, 3, 4].forEach((off) => {
          spots.push({ x: leftX - off, y: innerY - dy });
          spots.push({ x: rightX + off, y: innerY - dy });
        });
      });
      return spots.filter((s) => towerSpotFree(s.x, s.y));
    });
    /* 성문을 돌아가며 한 대씩 — 가장 바깥 성문부터 */
    let round = 0;
    while (B.towers.length < n && round < 8) {
      for (let gi = 0; gi < gates.length && B.towers.length < n; gi++) {
        const s = slots[gi].shift();
        if (!s) continue;
        B.towers.push({
          id: 'tw' + (B.towers.length + 1), x: s.x, y: s.y,
          hp: TOWER.HP, maxHp: TOWER.HP, side: side, rng: TOWER.RNG,
          alive: true, gateIdx: gi,
        });
      }
      round += 1;
    }
    B.towerFired = null;
  }
  SK.initTowers = initTowers;   // 훅(검수·재배치용)

  /* ── 피해 · 포격 ── */
  function towerStrikeDamage(target) {
    const base = TOWER.DMG_MIN + Math.random() * (TOWER.DMG_MAX - TOWER.DMG_MIN);
    return Math.max(TOWER.DMG_FLOOR, Math.round(base - effDef(target) * TOWER.DEF_CUT));
  }
  function towerFireArrow(t, target, onEnd) {
    const sx = (t.x + 0.5) * TILE, sy = (t.y + 0.34) * TILE;
    const tx = (rxOf(target) + 0.5) * TILE, ty = (ryOf(target) + 0.45) * TILE;
    addFx({ kind: 'proj', sub: 'arrow', x: sx, y: sy, tx: tx, ty: ty, arc: 0.34, life: TOWER.ARROW_MS, onEnd: onEnd });
    SK.sfx.play('bow');
  }
  /* 망루 화살이 부대에 꽂혔을 때 */
  function towerHitUnit(target, dmg) {
    if (!B || B.over || !target || !target.alive || dmg <= 0) return;
    const wasAlive = target.hp > 0;
    target.hp = Math.max(0, target.hp - dmg);
    statOf(target).taken += dmg;
    if (target.maxHp && dmg >= target.maxHp * 0.15) moraleShift(target, -4);
    addFloat((rxOf(target) + 0.5) * TILE, (ryOf(target) + 0.4) * TILE, '-' + dmg, '#ff5a4a');
    addFx({ kind: 'burst', x: (rxOf(target) + 0.5) * TILE, y: (ryOf(target) + 0.5) * TILE, life: 360, color: '255,150,90' });
    impactAt(target, '255,140,90');
    SK.sfx.play('hit');
    B.lastHits = B.lastHits || [];
    B.lastHits.push({ a: '망루', d: target.name, dmg: dmg, crit: false, tower: true });
    if (B.lastHits.length > 14) B.lastHits.shift();
    feed(`망루 포격 — ${target.name}에게 ${dmg} 피해`, target.side === 'ally' ? 'bad' : 'good');
    if (wasAlive && target.hp <= 0) {
      downUnit(target);
      addFloat((rxOf(target) + 0.5) * TILE, (ryOf(target) + 0.2) * TILE,
        target.fate === '생포' ? '생포!' : '퇴각', target.fate === '생포' ? '#ffd166' : '#ff9a7a');
      target.flash = 1;
    }
    SKBattle.refreshUI();
  }
  /* 수비 측 턴 시작 — 살아 있는 망루가 사거리 3칸 안 가장 가까운 적 부대를 쏜다.
     실제로 쏠 망루가 있으면 true(비동기로 done을 부른다), 없으면 false. */
  function towerTurnFire(side, done) {
    const cb = typeof done === 'function' ? done : function () { };
    if (!B || B.over || !towerList().length) return false;
    if (side !== towerOwnerSide()) return false;
    const queue = towerList().filter((t) => t.alive);
    if (!queue.length) return false;
    const mark = (B.turn || 0) + ':' + side;
    if (B.towerFired === mark) return false;
    if (!queue.some((t) => towerPickTarget(t))) return false;
    B.towerFired = mark;
    busy = true;
    mode = 'idle';
    B.reachCache = null;
    banner('망루 포격', side);
    let i = 0;
    const step = () => {
      if (!B || B.over) { busy = false; return; }
      if (i >= queue.length) {
        busy = false;
        SKBattle.refreshUI();
        cb();
        return;
      }
      const t = queue[i++];
      if (!t.alive) { step(); return; }
      const target = towerPickTarget(t);
      if (!target) { step(); return; }
      towerFireArrow(t, target, () => {
        if (!B || B.over) { busy = false; return; }
        towerHitUnit(target, towerStrikeDamage(target));
        if (!B || B.over) { busy = false; return; }
        finishCheck();
        if (!B || B.over) { busy = false; return; }
        wait(step, TOWER.FIRE_GAP);
      });
    };
    wait(step, 300);
    return true;
  }
  /* 망루가 노릴 부대 — 사거리 3칸 안 공격 측 부대 중 가장 가까운(동률이면 병력이 적은) 부대 */
  function towerPickTarget(t) {
    if (!B || !t || !t.alive) return null;
    let best = null, bd = Infinity;
    B.units.forEach((u) => {
      if (!u.alive || u.hp <= 0 || u.side === t.side) return;
      const d = manh(t.x, t.y, u.x, u.y);
      if (d < 1 || d > t.rng) return;
      if (d < bd || (d === bd && best && u.hp < best.hp)) { bd = d; best = u; }
    });
    return best;
  }
  /* ── 공격 측: 망루 공략 ── */
  function towerInRange(u, t) {
    return !!(B && u && t && t.alive && u.alive && u.side !== t.side && manh(u.x, u.y, t.x, t.y) <= effRng(u));
  }
  function towerDamageOf(u, t) {
    const kind = attackKind(u);
    let base = effAtk(u) * TOWER.ATK_K;
    if (TOWER.SIEGE_CLS[u.cls]) base *= TOWER.SIEGE_MUL;
    if (kind === 'arrow' || kind === 'bolt') base *= 0.8;
    base *= rnd(0.94, 1.06);
    return { dmg: Math.max(40, Math.round(base)), kind: kind };
  }
  function towerAiTarget(u) {
    if (!B || !u || !u.alive || u.side !== towerAttackerSide()) return null;
    const rng = effRng(u);
    const list = towerList().filter((t) => t.alive && t.side !== u.side
      && manh(u.x, u.y, t.x, t.y) >= 1 && manh(u.x, u.y, t.x, t.y) <= rng);
    if (!list.length) return null;
    list.sort((a, b) => (a.hp - b.hp) || (manh(u.x, u.y, a.x, a.y) - manh(u.x, u.y, b.x, b.y)));
    return list[0];
  }
  /* 지금 설 수 있는 칸(지금 칸 + 이동 가능 칸) 중 망루를 칠 수 있는 가장 값진 자리 */
  function planTowerStrike(u) {
    if (!B || !u || !u.alive || u.side !== towerAttackerSide()) return null;
    const towers = towerList().filter((t) => t.alive && t.side !== u.side);
    if (!towers.length) return null;
    const rng = effRng(u);
    const cands = [{ x: u.x, y: u.y }];
    (B.reachCache && B.reachCache.uid === u.id ? B.reachCache.set : new Set()).forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      if (B.units.some((o) => o.alive && o.x === x && o.y === y)) return;
      cands.push({ x: x, y: y });
    });
    let best = null;
    cands.forEach((c) => {
      towers.forEach((t) => {
        const d = manh(c.x, c.y, t.x, t.y);
        if (d < 1 || d > rng) return;
        const sc = 40 - d * 3 + (1 - t.hp / Math.max(1, t.maxHp)) * 34
          + (c.x === u.x && c.y === u.y ? 2 : 0) + (TOWER.SIEGE_CLS[u.cls] ? 6 : 0);
        if (!best || sc > best.score) best = { x: c.x, y: c.y, tower: t, score: sc, kind: 'tower' };
      });
    });
    return best;
  }
  /* 망루에 들어간 피해 — 0이 되면 파괴(잔해) */
  function damageTower(t, dmg, by) {
    if (!B || !t || !t.alive) return 0;
    const hit = Math.max(1, Math.round(dmg));
    t.hp = Math.max(0, t.hp - hit);
    addFloat((t.x + 0.5) * TILE, (t.y + 0.1) * TILE, '-' + hit, '#ffd24a');
    addFx({ kind: 'burst', x: (t.x + 0.5) * TILE, y: (t.y + 0.4) * TILE, life: 420, color: '255,214,120' });
    if (by) { statOf(by).dealt += hit; by.acted = true; }
    B.lastHits = B.lastHits || [];
    B.lastHits.push({ a: by ? by.name : '아군', d: '망루', dmg: hit, crit: false, destroyTower: t.hp <= 0 });
    if (B.lastHits.length > 14) B.lastHits.shift();
    feed(`${by ? by.name + ' — ' : ''}망루에 ${hit} 피해 (${Math.round(t.hp)}/${t.maxHp})`, by && by.side === 'ally' ? 'good' : 'bad');
    if (t.hp <= 0) {
      t.alive = false;
      addFx({ kind: 'ring', x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE, life: 640, color: '255,150,80' });
      addFloat((t.x + 0.5) * TILE, (t.y + 0.05) * TILE, '망루 파괴!', '#ffffff', { back: true });
      shakeScreen(5);
      SK.sfx.play('drum');
      SK.toast(t.side === 'ally' ? '아군 망루가 파괴되었습니다.' : '적 망루를 파괴했습니다!');
      feed(t.side === 'ally' ? '아군 망루가 부서졌습니다' : '적 망루가 무너졌습니다', t.side === 'ally' ? 'bad' : 'good');
    } else {
      SK.sfx.play('hit');
    }
    SKBattle.refreshUI();
    return hit;
  }
  function doTowerAttack(a, t, dmg, onDone) {
    if (!B || B.over || busy || !a || !a.alive || !t || !t.alive) return false;
    if (a.side !== towerAttackerSide()) return false;
    if (!towerInRange(a, t)) return false;
    const res = dmg != null ? { dmg: dmg, kind: attackKind(a) } : towerDamageOf(a, t);
    busy = true;
    mode = 'idle';
    a.acted = true;
    B.reachCache = null;
    SKBattle.refreshUI();
    const land = () => {
      if (!B || B.over) { busy = false; if (onDone) onDone(); return; }
      damageTower(t, res.dmg, a);
      busy = false;
      SKBattle.refreshUI();
      if (onDone) { onDone(); return; }
      if (!B.over) wait(() => { if (B && !B.over) nextUnitOrWait(); }, 240);
    };
    if (res.kind === 'melee') {
      const cx = (t.x + 0.5) * TILE, cy = (t.y + 0.5) * TILE;
      wait(() => {
        if (!B || B.over || !a.alive) { busy = false; if (onDone) onDone(); return; }
        addFx({ kind: 'slash', x: cx, y: cy, life: 360 });
        SK.sfx.play('sword');
        wait(land, 70);
      }, 120);
    } else {
      launchProjectile(a, { x: t.x, y: t.y, rx: t.x, ry: t.y }, res.kind, land);
    }
    return true;
  }
  function openTowerAttack(u, t) {
    if (!B || B.over || busy || !u || !u.alive || !t || !t.alive) return null;
    if (u.side !== towerAttackerSide()) {
      SK.toast(u.side === 'ally' ? '우리 망루는 아군이 칠 수 없습니다.' : '아군 망루는 칠 수 없습니다.');
      return null;
    }
    if (!towerInRange(u, t)) { SK.toast(`망루까지 거리가 멉니다. (사거리 ${effRng(u)})`); return null; }
    const res = towerDamageOf(u, t);
    const mul = TOWER.SIEGE_CLS[u.cls] ? ` · ${SK.CLASSES[u.cls].name} 공성 ×${TOWER.SIEGE_MUL}` : '';
    return SK.modal({
      kicker: '망루 공략',
      title: `${u.name} → ${t.side === 'enemy' ? '적' : '아군'} 망루`,
      body: `<div class="atk-preview">
        <div class="ap-row"><span>망루 피해</span><b>${res.dmg}</b><em>${res.kind === 'rock' ? '포격 특화' : res.kind === 'melee' ? '근접' : '사격'}${mul}</em></div>
        <div class="ap-row"><span>망루 내구도</span><b>${t.hp.toLocaleString('ko-KR')}</b><em>/ ${t.maxHp.toLocaleString('ko-KR')}</em></div>
        <p class="ap-note">망루는 수비 측 턴이 시작될 때마다 사거리 3칸 안의 부대에 화살을 쏩니다. 부수면 그 포격이 멈춥니다.</p>
      </div>`,
      actions: [{ label: '취소' }, { label: '공격!', primary: true, onClick: () => doTowerAttack(u, t, res.dmg) }],
    });
  }

  /* ── 렌더링 ── */
  /* v5.91a — v5.91에서 캔버스 도형(사각 기단·삼각 지붕)으로 얹었던 자동 포격 망루를
     고퀄리티 도트 스프라이트로 바꾼다. 원본 png의 왼쪽 목책 조각·오른쪽 자투리를 지우고
     관측창 흰 틈을 뚫은 정제본(tools/refine_watchtower.py)을 쓴다.
     · 아군(수성 측) 망루는 깃발만 푸른 판(watchtower_ally.webp)으로 세운다.
     · 부서진 망루는 그을린 반투명 잔해 + 돌무더기로 남긴다.
     · 살아 있는 망루 위에는 500/500 내구도 바를 그대로 얹는다. */
  const TOWER_SRC = 'assets/battle/watchtower.webp?v=118';
  const TOWER_SRC_ALLY = 'assets/battle/watchtower_ally.webp?v=118';
  function towerSprite(side) {
    const ally = loadImg(TOWER_SRC_ALLY);
    if (side === 'ally' && ally.complete && ally.naturalWidth) return ally;
    return loadImg(TOWER_SRC);
  }
  const _towerGhosts = {};
  function towerGhost(img) {
    const key = img.src + '|' + img.naturalWidth + 'x' + img.naturalHeight;
    if (_towerGhosts[key]) return _towerGhosts[key];
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(38,30,22,0.42)';    /* 그을린 돌빛 */
    c.fillRect(0, 0, cv.width, cv.height);
    _towerGhosts[key] = cv;
    return cv;
  }
  function drawTowers() {
    const list = towerList();
    if (!list.length || !ctx) return;
    list.forEach((t) => {
      const px = t.x * TILE, py = t.y * TILE;
      const cx = px + TILE * 0.5;
      const base = py + TILE * 0.92;                 /* 망루 발이 닿는 줄 */
      const h = TILE * 1.04;                          /* 한 칸보다 살짝 크게 */
      const img = towerSprite(t.side);
      const ready = !!(img && img.complete && img.naturalWidth);
      const w = ready ? h * (img.naturalWidth / img.naturalHeight) : h;
      ctx.save();
      /* 그림자 — 발밑을 눌러 배경에 뜨지 않게 */
      ctx.fillStyle = t.alive ? 'rgba(0,0,0,0.24)' : 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.ellipse(cx, base - TILE * 0.02, TILE * 0.34, TILE * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      if (t.alive) {
        if (ready) ctx.drawImage(img, cx - w / 2, base - h, w, h);
        /* 내구도 바 + 500/500 — 부대 병력 라벨과 같은 방식으로 화면 배율에 맞춰 크기를 잡고,
           도트 위에서도 읽히게 검은 반침·글자 외곽선을 준다 */
        const k = clamp(1 / Math.max(0.5, cam.s), 1, 1.6);
        const bw = TILE * 0.78, bh = Math.max(3, Math.round(5 * k));
        const bx = px + (TILE - bw) / 2, by = py - bh - Math.round(6 * k);
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
        const ratio = Math.max(0, t.hp / Math.max(1, t.maxHp));
        ctx.fillStyle = ratio > 0.5 ? '#4cd964' : (ratio > 0.25 ? '#f1c40f' : '#e74c3c');
        ctx.fillRect(bx, by, bw * ratio, bh);
        ctx.strokeStyle = 'rgba(255,255,255,0.32)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.font = '800 ' + Math.round(9 * k) + 'px "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = Math.max(1.6, 2.4 * k);
        ctx.strokeStyle = 'rgba(12,9,6,0.92)';
        ctx.strokeText(Math.round(t.hp) + '/' + t.maxHp, cx, by - Math.round(1.5 * k));
        ctx.fillStyle = '#ffffff';
        ctx.fillText(Math.round(t.hp) + '/' + t.maxHp, cx, by - Math.round(1.5 * k));
      } else {
        /* 파괴 — 부러진 윗면을 남긴 성벽 몸통(그을린 스프라이트) + 발치의 돌무더기 */
        const cut = base - TILE * 0.42;
        if (ready) {
          const x0 = cx - w / 2, x1 = cx + w / 2;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x0, base + 2);
          ctx.lineTo(x0, cut + 3);
          for (let i = 0; i <= 8; i++) {
            const xt = x0 + (x1 - x0) * (i / 8);
            const yt = cut + (i % 2 ? 5 : 0) + (i % 3 === 0 ? 3 : 0);   /* 들쭉날쭉 부러진 윗면 */
            ctx.lineTo(xt, yt);
          }
          ctx.lineTo(x1, base + 2);
          ctx.closePath();
          ctx.clip();
          ctx.globalAlpha = 0.92;
          ctx.drawImage(towerGhost(img), cx - w / 2, base - h, w, h);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
        /* 발치 돌무더기 — 작은 돌 여남은 개를 흩어 놓는다 */
        ctx.fillStyle = 'rgba(18,15,12,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, base - TILE * 0.02, TILE * 0.38, TILE * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        const stone = (dx, dy, rw, rh, c1, c2) => {
          ctx.beginPath();
          ctx.ellipse(cx + dx * TILE, base - dy * TILE, rw * TILE, rh * TILE, 0, Math.PI, 0);
          ctx.closePath();
          const g2 = ctx.createLinearGradient(0, base - (dy + rh) * TILE, 0, base - dy * TILE);
          g2.addColorStop(0, c1); g2.addColorStop(1, c2);
          ctx.fillStyle = g2; ctx.fill();
          ctx.strokeStyle = '#2b241c'; ctx.lineWidth = 1; ctx.stroke();
        };
        stone(-0.3, 0.0, 0.11, 0.07, '#a49a86', '#5d5546');
        stone(-0.16, 0.01, 0.13, 0.09, '#b3a894', '#665d4d');
        stone(0.0, 0.0, 0.12, 0.07, '#9c9280', '#574f41');
        stone(0.15, 0.01, 0.14, 0.1, '#aba08c', '#615849');
        stone(0.31, 0.0, 0.1, 0.06, '#948a78', '#544c3f');
        stone(0.06, 0.03, 0.09, 0.12, '#b7ac97', '#6a6151');
        /* 부러진 들보 조각 두 자루 */
        ctx.strokeStyle = '#3d3023'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 0.2 * TILE, base - TILE * 0.02); ctx.lineTo(cx - 0.24 * TILE, base - TILE * 0.16);
        ctx.moveTo(cx + 0.2 * TILE, base - TILE * 0.01); ctx.lineTo(cx + 0.3 * TILE, base - TILE * 0.12);
        ctx.stroke();
        ctx.lineCap = 'butt';
        /* 재 */
        ctx.fillStyle = 'rgba(26,23,20,0.55)';
        ctx.beginPath(); ctx.arc(cx + 0.1 * TILE, base - TILE * 0.03, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 0.36 * TILE, base - TILE * 0.02, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }

  const SKBattle = {
    refreshUI() {
      if (!B) return;
      const allies = B.units.filter((u) => u.side === 'ally' && u.alive);
      const enemies = B.units.filter((u) => u.side === 'enemy' && u.alive);
      $('#battle-name').textContent = B.name;
      /* v5.97 — 부제가 잘리지 않게 전장 이름과 겹치는 유형 이름은 빼고 규칙만 적는다 */
      $('#battle-kind').textContent = `${B.night ? '야간 · ' : ''}${B.def.desc}`;
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
        /* v5.56 — 훈련도는 숫자만 찍고, 전장 보정은 title(롱프레스)에 적는다 (카드 폭 유지) */
        const tV = Math.round(trainValOf(u));
        const tPct = Math.round((trainMul(u) - 1) * 1000) / 10;
        const ucTr = $('#uc-train');
        ucTr.textContent = `${tV}`;
        ucTr.title = `훈련도 ${tV} — 전장 공·방 ${tPct >= 0 ? '+' : ''}${tPct}% · 치명 +${Math.round(trainCritBonus(u) * 1000) / 10}%p`;
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
          const mv = Math.round(u.morale == null ? 80 : u.morale);
          pills.push(`<span class="bf ${mv >= 80 ? 'good' : 'bad'}">사기 ${mv}${mv >= 80 ? ' · 100%' : ` · 공·방 ${Math.round((moraleMul(u) - 1) * 100)}%`}</span>`);
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
      /* v5.90 — 검수용: 지도 칸수·월드 크기·끝 칸의 화면 좌표 */
      get cols() { return COLS; },
      get rows() { return ROWS; },
      get world() { return { w: WORLD_W, h: WORLD_H, tile: TILE }; },
      tileScreen(x, y) {
        if (!canvas) return null;
        const X = (x + 0.5) * TILE * cam.s + cam.x, Y = (y + 0.5) * TILE * cam.s + cam.y;
        const r = canvas.getBoundingClientRect();
        return { x: X, y: Y, pageX: r.left + X, pageY: r.top + Y,
          w: canvas.width / dpr, h: canvas.height / dpr, s: cam.s, cam: { x: cam.x, y: cam.y } };
      },
      /* v5.91 — 망루 검수 훅 */
      towers() {
        return towerList().map((t) => ({
          id: t.id, x: t.x, y: t.y, hp: Math.round(t.hp), maxHp: t.maxHp,
          side: t.side, alive: t.alive, rng: t.rng, gateIdx: t.gateIdx,
          terrain: (B && B.tiles[t.y] ? B.tiles[t.y][t.x] : null),
        }));
      },
      get towerFired() { return B ? (B.towerFired || null) : null; },
      towerOwner() { return towerOwnerSide(); },
      /* 전투 AI가 이 부대에 내린 계획(망루 타격 경로 검수용) */
      planOf(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        const p = planAuto(u);
        return p ? { kind: p.kind, x: p.x, y: p.y, score: p.score, tower: p.tower ? p.tower.id : null,
          gate: !!p.gate, target: p.target ? p.target.name : null } : null;
      },
      /* 망루 피해 계산 값(공격 전) — 병과 계수 검수용 */
      towerDmg(name) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        const t = towerList().filter((x) => x.alive)[0];
        if (!u || !t) return null;
        const r = towerDamageOf(u, t);
        return { name: u.name, cls: u.cls, side: u.side, atk: u.atk, effAtk: Math.round(effAtk(u) * 100) / 100,
          rng: effRng(u), dmg: r.dmg, kind: r.kind, siegeMul: TOWER.SIEGE_CLS[u.cls] ? TOWER.SIEGE_MUL : 1,
          tower: t.id, inRange: towerInRange(u, t) };
      },
      /* 망루를 칠 수 있는 아군 부대 이름 (사거리 안) */
      towerShooters() {
        return B ? B.units.filter((u) => u.side === 'ally' && u.alive).map((u) => ({
          name: u.name, cls: u.cls, x: u.x, y: u.y, acted: !!u.acted, rng: effRng(u),
          towers: towerList().filter((t) => towerInRange(u, t)).map((t) => t.id),
        })) : [];
      },
      /* v5.37 — 관전 QA: 전투가 멈춘 것인지(페이즈·연출·행동 플래그) 한 번에 본다 */
      state() {
        if (!B) return null;
        return { phase: B.phase, turn: B.turn, over: !!B.over, busy: busy, anims: anims.length, fx: fx.length,
          ally: B.units.filter((u) => u.side === 'ally' && u.alive).length,
          enemy: B.units.filter((u) => u.side === 'enemy' && u.alive).length,
          allyDone: B.units.filter((u) => u.side === 'ally' && u.alive && u.acted).length,
          enemyDone: B.units.filter((u) => u.side === 'enemy' && u.alive && u.acted).length };
      },
      /* v6.0 — 검수용: 새 전략 지형·기믹 상태와 AI 판단 로그 */
      terrain() {
        if (!B) return null;
        const cnt = (ch) => { let n = 0; B.tiles.forEach((r) => r.forEach((c) => { if (c === ch) n += 1; })); return n; };
        return {
          type: B.type, mapKey: B.mapKey, cols: COLS, rows: ROWS,
          tiles: { U: cnt('U'), J: cnt('J'), Q: cnt('Q'), Y: cnt('Y'), N: cnt('N'), L: cnt('L'), O: cnt('O'),
            W: cnt('W'), S: cnt('S'), B: cnt('B'), C: cnt('C'), G: cnt('G') },
          fire: Object.keys(B.fire || {}),
          objs: (B.objs || []).map((o) => ({ x: o.x, y: o.y, kind: o.kind, owner: o.owner })),
          gates: (B.gates || []).map((g) => ({ row: g.row, ring: g.ring, side: !!g.side, hp: Math.round(g.hp) })),
          siegeGift: B.siegeGift || null,
        };
      },
      /* v6.0 — 검수용: 지형·기믹을 실제 계산식으로 확인하는 훅 */
      dmgOf(aName, dName) {
        if (!B) return null;
        const a = B.units.find((u) => u.name === aName && u.alive);
        const d = B.units.find((u) => u.name === dName && u.alive);
        if (!a || !d) return null;
        const r = calcDamage(a, d, { noCrit: true });   // 치명타 난수를 빼고 지형 보정만 본다
        return { a: a.name, d: d.name, aTile: tileAt(a.x, a.y), dTile: tileAt(d.x, d.y),
          effAtk: Math.round(effAtk(a) * 10) / 10, effDef: Math.round(effDef(d) * 10) / 10,
          rng: effRng(a), dmg: r.dmg };
      },
      place(name, x, y) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return false;
        u.x = x; u.y = y; u.rx = x; u.ry = y;
        return true;
      },
      castSkill(name, key, x, y) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        const sk = SK.SKILLS[key];
        if (!u || !sk) return false;
        return aiCast(u, sk, x, y);
      },
      ignite(x, y) { return igniteAt(x, y, 'ally'); },
      support(name) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return null;
        B.reachCache = { uid: u.id, set: reachSet(u) };
        const p = planSupportSkill(u);
        return p ? { kind: p.kind, mode: p.mode, key: p.key, x: p.x, y: p.y, tx: p.tx, ty: p.ty,
          score: Math.round(p.score), target: p.target ? p.target.name : null,
          targetTile: p.target ? tileAt(p.target.x, p.target.y) : null } : null;
      },
      tileScore(name, x, y) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        const t = terrainAiScore(u, x, y);
        return { tile: tileAt(x, y), sc: t.sc, why: t.why, burning: burningAt(x, y) };
      },
      plan(name) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return null;
        B.reachCache = { uid: u.id, set: reachSet(u) };
        const p = planAuto(u);
        return p ? { kind: p.kind, key: p.key || null, x: p.x, y: p.y, tile: tileAt(p.x, p.y), why: p.why || '',
          target: p.target ? p.target.name : null, gate: p.gate || null } : null;
      },
      get aiLog() { return (B && B.aiLog) || []; },
      aiOf(name) { return ((B && B.aiLog) || []).filter((r) => r.name === name).slice(-6); },
      get mode() { return mode; },
      get busy() { return busy; },
      get pending() { return pendingSkill; },
      get autoOn() { return autoOn; },
      get cam() { return cam; },
      centerCam(x, y) { centerCam(x, y); },
      zoomFit() { if (!stage) return; const fit = viewFit(); cam.s = fit; cam.x = (stage.clientWidth - WORLD_W * fit) / 2; cam.y = (stage.clientHeight - WORLD_H * fit) / 2; camClamp(); },
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
            range: s ? ultRange(u, s) : null, desc: s ? ultTextOf(s) : null,
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
      /* v5.81 — 병과 4스킬·패시브 검수 훅 */
      skillInfo(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return (u.skills || []).map((k) => {
          const s = SK.SKILLS[k] || {};
          return { key: k, name: s.name, kind: s.kind, pattern: s.pattern || null, power: s.power || null,
            hits: s.hits || 1, mp: s.mp, unlockLv: s.unlockLv, desc: s.desc };
        });
      },
      skillMenu(name) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return false;
        if (u.acted) u.acted = false;
        B.sel = u; mode = 'idle'; busy = false;
        openSkillMenu();
        return true;
      },
      castSkillAt(name, key, tx, ty) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        const sk = SK.SKILLS[key];
        if (!u || !sk) return { ok: false, why: 'no-unit-or-skill' };
        if (u.acted) { u.acted = false; }
        B.sel = u; mode = 'idle'; busy = false;
        const before = B.units.filter((o) => o.alive && o.side !== u.side).map((o) => ({ name: o.name, hp: Math.round(o.hp), x: o.x, y: o.y }));
        beginSkill(u, key);
        const md = mode, pend = pendingSkill ? pendingSkill.name : null;
        trySkillAt(tx == null ? u.x : tx, ty == null ? u.y : ty);
        return { ok: true, before, pos: { x: u.x, y: u.y }, modeBefore: md, pendingName: pend,
          mp: Math.round(u.mp), acted: !!u.acted, dist: manh(u.x, u.y, tx == null ? u.x : tx, ty == null ? u.y : ty), range: skRange(u, sk) };
      },
      unit(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return { name: u.name, cls: u.cls, side: u.side, hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), mp: Math.round(u.mp),
          x: u.x, y: u.y, buffs: Object.keys(u.buffs || {}), morale: u.morale, passive: u.passive ? { title: u.passive.title, fx: u.passive.fx, p: u.passive.p } : null,
          atk: Math.round(effAtk(u)), def: Math.round(effDef(u)), crit: Math.round(critChanceOf(u) * 100), mov: movOf(u) };
      },
      move(name, x, y) { const u = B && B.units.find((o) => o.name === name); if (!u) return false; u.x = x; u.y = y; u.rx = x; u.ry = y; return true; },
      setHp(name, hp) { const u = B && B.units.find((o) => o.name === name); if (!u) return false; u.hp = Math.max(1, Math.min(u.maxHp, hp)); return true; },
      diff() { return SK.diffOf && SK.state ? SK.diffOf(SK.state) : null; },
      enemyStats() {
        return B ? B.units.filter((u) => u.side === 'enemy').slice(0, 3).map((u) => ({ name: u.name, atk: Math.round(u.atk), hp: Math.round(u.maxHp) })) : [];
      },
      lastHits() { return (B && B.lastHits) || []; },
      morale(name, delta) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        const before = u.morale;
        if (delta) moraleShift(u, delta);
        return { before, after: u.morale, max: u.moraleMax || 100 };
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
      /* v5.60 — 병과 책략 72종 실행 점검 훅. MP·행동 여부를 무시하고 그 자리에서 펼친다.
         (v5.49의 castSkill 은 MP가 모자라면 false 를 돌려주므로 검수에는 이 훅을 쓴다) */
      castForce(name, key, tx, ty) {
        if (!B) return { ok: false, why: 'no-battle' };
        const u = B.units.find((o) => o.name === name && o.alive);
        const sk = SK.SKILLS[key];
        if (!u || !sk) return { ok: false, why: 'no-unit-or-skill' };
        u.mp = Math.max(u.maxMp || 0, 999);
        u.acted = false;
        const snap = () => ({
          foes: B.units.filter((o) => o.side !== u.side && o.alive).map((o) => ({ n: o.name, hp: Math.round(o.hp), atk: +(o.buffs.atk ? o.buffs.atk.v : 0).toFixed(3), def: +(o.buffs.def ? o.buffs.def.v : 0).toFixed(3), morale: Math.round(o.morale || 0), ail: Object.keys(o.ail || {}) })),
          allies: B.units.filter((o) => o.side === u.side && o.alive).map((o) => ({ n: o.name, hp: Math.round(o.hp), atk: +(o.buffs.atk ? o.buffs.atk.v : 0).toFixed(3), def: +(o.buffs.def ? o.buffs.def.v : 0).toFixed(3), morale: Math.round(o.morale || 0) })),
        });
        const before = snap();
        fx.length = 0;
        B.sel = u; mode = 'skillTarget';
        pendingSkill = Object.assign({ key }, sk);
        const px = tx == null ? u.x : tx, py = ty == null ? u.y : ty;
        if (sk.kind === 'buffSelf' || sk.kind === 'buffAreaAllies' || sk.kind === 'healArea' || sk.kind === 'buffAllAllies' || sk.kind === 'healAll') castInstant(u, sk);
        else trySkillAt(px, py);
        return { ok: true, kind: sk.kind, fx: sk.fx || null, tag: skillFxTag(u, sk), mp: sk.mp, before };
      },
      placeDuel(casterName, foeName, gap) {
        if (!B) return null;
        const c = B.units.find((o) => o.name === casterName && o.alive);
        const f = B.units.find((o) => o.name === foeName && o.alive);
        if (!c || !f) return null;
        const need = Math.max(1, Math.round(gap || 1));
        let tx = f.x, ty = f.y + need;
        if (!B.tiles[ty] || !B.tiles[ty][tx]) ty = f.y - need;
        if (!B.tiles[ty] || !B.tiles[ty][tx]) return null;
        B.units.forEach((u) => {
          if (u === c || !u.alive) return;
          if (u.x === tx && u.y === ty) { const alt = findFree(B.tiles, 2, 2); u.x = alt.x; u.y = alt.y; u.rx = alt.x; u.ry = alt.y; }
        });
        c.x = tx; c.y = ty; c.rx = tx; c.ry = ty;
        return { x: tx, y: ty };
      },
      cluster() {
        if (!B) return null;
        const allies = B.units.filter((u) => u.side === 'ally' && u.alive);
        const foes = B.units.filter((u) => u.side === 'enemy' && u.alive);
        const rows = [];
        allies.forEach((a, i) => rows.push({ n: a.name, x: 8 + (i % 6), y: 20 + Math.floor(i / 6) }));
        foes.forEach((f, i) => rows.push({ n: f.name, x: 8 + (i % 6), y: 17 + Math.floor(i / 6) }));
        this.placeUnits(rows);
        return { allies: allies.length, foes: foes.length };
      },
      castResult(name) {
        if (!B) return null;
        const u = B.units.find((o) => o.name === name);
        if (!u) return null;
        return {
          allies: B.units.filter((o) => o.side === u.side && o.alive).map((o) => ({ n: o.name, hp: Math.round(o.hp), atk: +(o.buffs.atk ? o.buffs.atk.v : 0).toFixed(3), def: +(o.buffs.def ? o.buffs.def.v : 0).toFixed(3), morale: Math.round(o.morale || 0) })),
          foes: B.units.filter((o) => o.side !== u.side && o.alive).map((o) => ({ n: o.name, hp: Math.round(o.hp), atk: +(o.buffs.atk ? o.buffs.atk.v : 0).toFixed(3), def: +(o.buffs.def ? o.buffs.def.v : 0).toFixed(3), morale: Math.round(o.morale || 0), ail: Object.keys(o.ail || {}) })),
          fx: (B.skillFxLog || []).slice(),
        };
      },
      skillFxTags() { return fx.filter((f) => f.kind === 'skillfx').map((f) => f.sub); },
      fxLog() { return B && B.skillFxLog ? B.skillFxLog.slice() : []; },
      frameNo() { return frameNo; },
      focusCam() { return { s: Math.round(cam.s * 1000) / 1000, x: Math.round(cam.x), y: Math.round(cam.y), tile: TILE }; },
      /* v5.60 — 카메라를 한 부대에 붙이고 배율을 올린다 (이펙트 프레임 검수용) */
      focusUnit(name, sc) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return null;
        cam.s = Math.max(0.2, Math.min(1.6, Number(sc) || 0.85));
        centerCam(u.x, u.y);
        return { s: cam.s, x: Math.round(cam.x), y: Math.round(cam.y) };
      },
      speedSet(v) { autoSpeed = Math.max(1, Math.min(4, Number(v) || 1)); speedPref = autoSpeed; paintSpeedBtn(); return autoSpeed; },
      lockTurn(v) { if (B) B.lockTurn = v !== false; return B ? !!B.lockTurn : null; },
      resetTurn() {
        if (!B) return null;
        B.phase = 'ally'; busy = false; mode = 'idle'; B.sel = null; pendingSkill = null;
        B.units.forEach((u) => { if (u.side === 'ally') u.acted = false; });
        return { turn: B.turn, phase: B.phase };
      },
      skillFxCount() { return fx.filter((f) => f.kind === 'skillfx').length; },
      clearFx() { fx.length = 0; if (B) B.skillFxLog = []; },
      setHp(name, v) { const u = B && B.units.find((o) => o.name === name); if (!u) return null; u.hp = v; return Math.round(u.hp); },
      bulkUp() {
        if (!B) return null;
        B.units.forEach((u) => { u.maxHp = 40000; u.hp = u.side === 'ally' ? Math.round(u.maxHp * 0.5) : 40000; });
        return B.units.length;
      },
      placeUnits(rows) {
        if (!B || !rows) return null;
        rows.forEach((r) => {
          const u = B.units.find((o) => o.name === r.n);
          if (u && B.tiles[r.y] && B.tiles[r.y][r.x]) { u.x = r.x; u.y = r.y; u.rx = r.x; u.ry = r.y; }
        });
        return B.units.filter((u) => u.alive).map((u) => ({ n: u.name, x: u.x, y: u.y }));
      },
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
      /* v5.56 — 사기·훈련도 개편 검수 훅 */
      moraleCurve() {
        const f = (m) => Math.round(moraleMul({ morale: m }) * 1000) / 1000;
        return { base: MORALE_BASE, low: MORALE_LOW, m100: f(100), m80: f(80), m60: f(60), m40: f(40), m20: f(20), m0: f(0) };
      },
      setMorale(name, v) { const u = B && B.units.find((o) => o.name === name); if (!u) return null; u.morale = v; SKBattle.refreshUI(); return Math.round(u.morale * 10) / 10; },
      collapseTest(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        u.ail = {};
        u.morale = 24;
        moraleShift(u, -6);
        return { morale: Math.round(u.morale), ail: Object.assign({}, u.ail || {}), collapseN: u.collapseN || 0,
          mov: movOf(u), tiles: moveTiles(u).filter((t) => t.x !== u.x || t.y !== u.y).length };
      },
      lastCollapse() { return B ? (B.lastCollapse || null) : null; },
      trainCurve() {
        const f = (t) => Math.round(trainMul({ train: t }) * 1000) / 1000;
        const c = (t) => Math.round(trainCritBonus({ train: t }) * 1000) / 10;
        return { t100: f(100), t75: f(75), t60: f(60), t50: f(50), t25: f(25), t0: f(0), c100: c(100), c50: c(50) };
      },
      setTrain(name, v) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        u.train = v; SKBattle.refreshUI();
        return this.magStats(name);
      },
      passiveOf(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        const p = u.passive;
        return p ? { title: p.title, tier: p.tier || u.tier || null, kind: p.kind || 'combat',
          trigger: p.trigger, effect: p.effect, valuePct: p.valuePct, dom: p.dom || null } : null;
      },
      /* v5.56 — 고유 특기가 전장에서 실제로 발동하는지 (on_attack/turn_start) */
      passiveFire(name, when) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        triggerPassive(u, when || 'on_attack');
        const mates = B.units.filter((o) => o.alive && o.side === u.side && o !== u && cheb(o.x, o.y, u.x, u.y) <= 2)
          .map((o) => ({ n: o.name, atk: o.buffs.atk || null, def: o.buffs.def || null, hp: Math.round(o.hp) }));
        return { name: u.name, trigger: (u.passive && u.passive.trigger) || null, used: !!(u.pUsed && u.pUsed.on_attack), mates };
      },
      moveAll(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return { mov: movOf(u), tiles: moveTiles(u).filter((t) => t.x !== u.x || t.y !== u.y).length, ail: Object.assign({}, u.ail || {}) };
      },
      moraleAll() {
        return B.units.filter((u) => u.alive).map((u) => ({ n: u.name, side: u.side, m: Math.round(u.morale), train: Math.round(trainValOf(u)) }));
      },
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
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
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
      setPaceBoost(v) { paceBoost = Math.max(1, Math.min(12, Number(v) || 1)); return paceBoost; },
      get paceBoost() { return paceBoost; },
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
        return { a: a.name, d: d.name, atkA: duelAtkStat(a), atkD: duelAtkStat(d),
          warA: Math.round(duelWarStat(a).total), warD: Math.round(duelWarStat(d).total),
          deckA: duel.deckA.cmds.filter((c) => c.unlocked).map((c) => c.k),
          deckD: duel.deckD.cmds.filter((c) => c.unlocked).map((c) => c.k) };
      },
      duelState() {
        if (!duel) return null;
        return { a: duel.a.name, d: duel.d.name, hpA: Math.round(duel.hpA), hpD: Math.round(duel.hpD),
          turn: duel.turn, over: !!duel.over, busy: !!duel.busy, auto: !!duel.auto,
          last: duel.last, ended: duel.ended, war: duel.a.alive && duel.d.alive,
          ultA: !!duel.ultA, ultD: !!duel.ultD,
          levelA: duel.deckA ? duel.deckA.level : null, levelD: duel.deckD ? duel.deckD.level : null };
      },
      duelChoose(k) { return duelPick(k); },
      /* v5.92 — 보물 포함 무력·해금 커맨드·초필살기 슬롯 검수 훅 */
      duelDeck(name) {
        const u = (duel && !name) ? duel.a : (B && B.units.find((o) => o.name === name));
        if (!u) return null;
        const deck = duelDeckFor(u);
        return { name: u.name, side: u.side, cls: u.cls, wu: Math.round(u.wu),
          base: Math.round(deck.war.base), bonus: Math.round(deck.war.bonus), total: Math.round(deck.war.total),
          level: deck.level, hasUlt: deck.hasUlt, ultName: duelUltName(u),
          cmds: deck.cmds.map((c) => ({ k: c.k, name: c.name, req: c.req, unlocked: !!c.unlocked })) };
      },
      duelUltUsed() { return duel ? { a: !!duel.ultA, d: !!duel.ultD } : null; },
      duelCards() {
        return [...document.querySelectorAll('#duel-cmds .duel-cmd')].map((b) => ({
          k: b.dataset.k, disabled: !!b.disabled, locked: b.classList.contains('locked'),
          ult: b.classList.contains('ult'), text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        }));
      },
      duelForceAi(k) { if (!duel) return null; duel.forceAi = k; return k; },
      duelFast(v) { duelFast = !!v; return duelFast; },
      duelSlow(v) { duelSlow = Math.max(0.2, Math.min(6, Number(v) || 1)); return duelSlow; },
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
      /* v5.82 — 고유 특기·필살기 검증 훅 */
      doAttack(aName, dName) { return this.attackNow(aName, dName); },
      turnStart(name) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        if (!u) return null;
        vpTurnStart(u);
        return { name: u.name, mp: Math.round(u.mp), morale: u.morale, vp: vpid(u) };
      },
      ultApply(name, targetName) {
        const u = B && B.units.find((o) => o.name === name && o.alive);
        const t = targetName ? B.units.find((o) => o.name === targetName && o.alive) : null;
        const s = ultOf(u);
        if (!u || !s) return null;
        return applyUlt(u, s, t);
      },
      vpOf(name) {        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return { id: vpid(u), vp: (u.passive && u.passive.vp) || null, title: u.passive && u.passive.title };
      },
      /* v5.82 — 적중 효과(독공·화공·위압·쾌검)를 시간·난수 없이 한 번에 검사 */
      strike(aName, dName, dmg) {
        const a = B && B.units.find((o) => o.name === aName && o.alive);
        const d = B && B.units.find((o) => o.name === dName && o.alive);
        if (!a || !d) return null;
        applyDamage(a, d, dmg == null ? d.hp : dmg, false, null);
        return { alive: d.alive, hp: Math.round(d.hp) };
      },
      ailTest(name, kind) {
        const t = B && B.units.find((o) => o.name === name && o.alive);
        if (!t) return null;
        const o = Math.random; Math.random = () => 0.01;
        const ok = ailApply(t, kind || 'poison', null, 3);
        Math.random = o;
        return { ok, ail: Object.keys(t.ail || {}), res: fxPct(t, 'statusRes'), resist: vpv(t, 'resist'), immune: ailImmune(t, kind || 'poison'), tfx: !!t.tfx };
      },
      vpHit(aName, dName, crit) {        const a = B && B.units.find((o) => o.name === aName && o.alive);
        const d = B && B.units.find((o) => o.name === dName && o.alive);
        if (!a || !d) return null;
        const o = Math.random; Math.random = () => 0.01;
        vpOnHit(a, d, !!crit, {});
        Math.random = o;
        return { ail: Object.keys(d.ail || {}), dot: d.ailDot || null, morale: Math.round(d.morale || 0) };
      },
      /* v5.86 — 민첩·운·숨은 스탯 검증용: 부대별 계산값을 그대로 돌려준다 */
      hidden(name) {
        const u = B && B.units.find((o) => o.name === name);
        if (!u) return null;
        return {
          name: u.name, cls: u.cls, clsName: (SK.CLASSES[u.cls] || {}).name, side: u.side,
          wu: u.wu, cha: u.cha == null ? 60 : u.cha, agi: agiOf(u),
          evadePct: Math.round(evadeRateOf(u) * 1000) / 10,
          critPct: Math.round(critChanceOf(u) * 1000) / 10,
          statusResistPct: Math.round(statusResistOf(u) * 1000) / 10,
          counterMulPct: Math.round(counterMulOf(u) * 1000) / 10,
          classHidden: SK.classHiddenOf(u.cls), genHidden: (SK.genHiddenOf(u.genId) || null),
        };
      },
      hitOf(aName, dName) {
        const a = B && B.units.find((o) => o.name === aName), d = B && B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        return { a: a.name, d: d.name, agiA: agiOf(a), agiD: agiOf(d),
          hitPct: Math.round(hitRateOf(a, d) * 1000) / 10, evadePct: Math.round(evadeRateOf(d) * 1000) / 10 };
      },
      /* 같은 명중률로 n번 굴려 본다 (실제 주사위 분포 확인 — 피해·연출 없음) */
      rollHit(aName, dName, n) {
        const a = B && B.units.find((o) => o.name === aName), d = B && B.units.find((o) => o.name === dName);
        if (!a || !d) return null;
        const p = hitRateOf(a, d), k = clamp(Math.round(n || 1000), 1, 20000);
        let miss = 0;
        for (let i = 0; i < k; i++) if (Math.random() > p) miss++;
        return { hitPct: Math.round(p * 1000) / 10, missPct: Math.round(miss / k * 1000) / 10, evaded: miss, n: k };
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
      /* v5.89 — 관전·자동결산 중에는 플레이어 명령(공격·책략·필살기·아이템·대기·턴 종료)을 막는다 */
      if ((spectateMode || skipMode) && act !== 'speed') {
        SK.toast('관전 중에는 직접 명령할 수 없습니다 — AI가 지휘합니다.');
        return;
      }
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
      const fit = viewFit();
      cam.s = fit;
      cam.x = (stage.clientWidth - WORLD_W * fit) / 2;
      cam.y = (stage.clientHeight - WORLD_H * fit) / 2;
      camClamp();
    };
  });
})();
