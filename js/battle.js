/* ══════════════════════════════════════════════════════════════
   4단계 · 대형 격자 전장 — 18×18 팬/줌, 이동·공격·책략·AI
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK;
  const $ = (s) => document.querySelector(s);
  const TILE = 64, N = 18, WORLD = N * TILE;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const cheb = (x1, y1, x2, y2) => Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));

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
    const type = opts.type || SK.battleTypeFor(target);
    const def = SK.BATTLE_TYPES[type];
    const mapRows = SK.MAPS[def.map];
    const tiles = mapRows.map((r) => r.split(''));
    const faction = s.cities[opts.targetId].owner;
    const bossInfo = bossOfFaction(faction);

    const allies = opts.units.map((spec, i) => (spec.kind === 'hero' ? makeAlly(spec, i, opts.origin) : makeRegiment(spec, i)));

    const cityTroops = s.cities[opts.targetId].troops;
    const enemyCount = clamp(5 + Math.floor(cityTroops / 2600), 5, 8);
    const per = clamp(Math.round(cityTroops / enemyCount / 100) * 100, 800, 2200);
    const defGens = (s.cities[opts.targetId].genIds || []).map((id) => SK.GEN_BY_ID[id]).filter(Boolean);
    const enemies = [];
    /* v5.0.1 — 수비 부대는 전투 병종 위주로 뽑고 보조 병종(군악·무희·풍수사)은 1기까지만 */
    const SUPPORT_CLS = { gunakdae: 1, muhui: 1, pungsusa: 1 };
    let supportUsed = 0;
    const combatType = type === 'naval' ? 'naval' : (type === 'mountain' ? 'mountain' : 'siege');
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

    B = {
      type, def, name: `${target.name} ${def.name}`, targetId: opts.targetId, origin: opts.origin,
      tiles, units: [], turn: 1, phase: 'ally', sel: null,
      acted: false, over: false, log: [], faction, rewards: { gold: 0, food: 0 },
      introLines: buildIntro(type, target, faction, bossInfo, defGens, SK.pickEvent(target, defGens)),
      event: SK.pickEvent(target, defGens),
      objective: def.objective, started: false, moveAnim: null, deployed: opts.units, introDone: false,
      bondSeen: {},
    };
    placeSide(allies, SK.allySlots(type), 'ally');
    placeSide(enemies, SK.enemySlots(type), 'enemy');
    B.rewards.gold = Math.round(cityTroops * 0.16 + 320);
    B.rewards.food = Math.round(cityTroops * 0.11 + 240);

    anims.length = 0;
    fx.length = 0;
    floats.length = 0;
    shakeT = 0;
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
    // 고유 특기(상시형)는 공격·방어에 소폭 보탬이 된다 — 값의 절반만, 사기적이지 않게
    const pMul = passive && passive.trigger === 'passive' ? 1 + (Number(passive.valuePct) || 0) / 200 : 1;
    return {
      id: 'a' + i, side: 'ally', uid: h.uid, name: h.name, hanja: h.hanja, cls: h.cls, lv: h.lv,
      hp: troops, maxHp: troops, mp: h.mp, maxMp: SK.maxMpOf(h.cls, h.lv),
      atk: (C.atk + (h.wu + eq.war - 60) * 0.17) * (1 + 0.06 * SK.tierForLv(h.lv)) * techAtk * pMul,
      def: (C.def + (h.tong + eq.leadership - 60) * 0.09) * (1 + 0.06 * SK.tierForLv(h.lv)) * techDef * pMul,
      mov: Math.min(9, C.mov + eq.move), rng: C.rng, minRng: C.minRng || 1,
      wu: h.wu + eq.war, ji: h.ji + eq.intel, tong: h.tong + eq.leadership,
      portrait: h.portrait, unit: h.unit || CLASS_UNIT[h.cls], skills: SK.skillsFor(h.cls, h.lv),
      passive, pUsed: {}, x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 2, face: 1, expGain: 0,
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
      atk: C.atk + 1, def: C.def + 1, mov: C.mov, rng: C.rng, minRng: C.minRng || 1,
      wu: 66, ji: 58, tong: 62, portrait: CLASS_PORTRAIT[spec.cls], unit: CLASS_UNIT[spec.cls],
      skills: C.skills.slice(), x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: 1,
      train: 58,
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
    const lv = SK.genLv(g);
    const mul = boss ? 1.5 : 1;
    const troops = Math.round(per * mul);
    return {
      id: 'ng' + g.id, side: 'enemy', name: g.name, hanja: '', cls, lv,
      hp: troops, maxHp: troops, mp: C.mp + lv * 2, maxMp: C.mp + lv * 2,
      atk: (C.atk + g.war * 0.13) * (1 + (SK.TIER_LV[g.tier] || 3) * 0.03),
      def: (C.def + g.leadership * 0.08),
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
      atk: (C.atk + lv * 1.15) * (1 + season * 0.03), def: (C.def + lv * 0.75) * (1 + season * 0.03),
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: 60 + lv * 3, ji: 55 + lv * 2, tong: 60 + lv * 2,
      portrait: CLASS_PORTRAIT[cls], unit: CLASS_UNIT[cls], skills: C.skills.slice(),
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: -1,
      train: trainOf(lv, 'B'),
    };
  }

  function placeSide(list, slots, side) {
    list.forEach((u, i) => {
      let [x, y] = slots[i % slots.length];
      if (!B.tiles[y] || !passable(B.tiles[y][x]) || B.units.some((o) => o.x === x && o.y === y)) {
        const alt = findFree(B.tiles, x, y);
        x = alt.x; y = alt.y;
      }
      u.x = x; u.y = y; u.rx = x; u.ry = y; u.flash = 0; u.shake = 0; u.side = side;
      B.units.push(u);
    });
  }

  function passable(ch) { return ch !== 'C'; }
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

  function buildIntro(type, target, faction, bossInfo, defGens, event) {
    const lines = [];
    if (event) lines.push({ event });
    const mine = SK.factionInfo(SK.playerFaction());
    const lordName = mine.lord || '조조';
    const lordG = SK.GEN_BY_NAME[lordName];
    lines.push({ who: lordName, hanja: '', pt: lordG ? SK.genPortrait(lordG) : SK.CLASS_PORTRAIT.gunwoong,
      side: 'ally', text: SK.quoteOf(lordName, 'deploy') || `${target.name}의 성문을 열어라. 오늘로 끝내겠다.` });
    const hint = {
      siege: '성벽이 높습니다. 성문을 향해 힘을 모으십시오.',
      naval: '물길은 내가 안다. 배를 따라오너라!',
      mountain: '산길은 좁다. 내 뒤에 붙어라!',
      fortress: '목책 하나, 부수면 그만이다.',
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
    if (!B.started) {
      B.started = true;
      // center camera on allies before the fade-in
      const a = B.units.filter((u) => u.side === 'ally');
      const cx = a.reduce((s2, u) => s2 + u.x, 0) / a.length;
      const cy = a.reduce((s2, u) => s2 + u.y, 0) / a.length;
      const focus = { siege: [8.5, 10], fortress: [8, 11], naval: [9, 8.5], mountain: [8, 10] }[B.type] || [9, 9];
      cam.s = clamp(stage.clientWidth / (12.5 * TILE), 0.44, 0.7);
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
    const sdt = dt * timeScale;
    updateFx(sdt);
    updateAnims(sdt);
    updateUnits(sdt);
    updateBonds(sdt);
    if (shakeT > 0) shakeT = Math.max(0, shakeT - sdt);
    if (B) draw();
    raf = requestAnimationFrame(loop);
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

    // background
    const bg = loadImg(`assets/maps/v2/battle_${B.def.map}.webp`);
    if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, WORLD, WORLD);
    else { ctx.fillStyle = '#7d8a52'; ctx.fillRect(0, 0, WORLD, WORLD); }

    drawTerrainTint();
    drawGrid();
    drawObjective();
    drawHighlights();
    drawUnits();
    drawFx();
    ctx.restore();
    drawFloats();
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
    ctx.restore();
  }

  function moveCost(cls, ch) {
    if (ch === 'W') return cls === 'sujeok' ? 1 : 99;
    if (ch === 'C') return 99;
    if (ch === 'M') return (cls === 'sanjeok' || cls === 'yasubyung') ? 1 : (cls === 'gibi' ? 99 : 2);
    if (ch === 'F') return (cls === 'sanjeok' || cls === 'yasubyung') ? 1 : (cls === 'gibi' ? 3 : 2);
    if (ch === 'S') return 2;
    return 1;
  }

  function reachSet(u) {
    if (!u) return new Set();
    const seen = new Map();
    const key = (x, y) => x + ',' + y;
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
        const cost = moveCost(u.cls, ch);
        if (cost >= 90) continue;
        if (B.units.some((o) => o.alive && o.x === nx && o.y === ny)) continue;
        const nc = c + cost;
        if (nc > u.mov) continue;
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
    if (reach) {
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
      const rng = pendingSkill ? (pendingSkill.range || u.rng) : u.rng;
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
          if (cheb(u.x, u.y, t.x, t.y) > rng) return;
          ctx.fillStyle = 'rgba(80,180,120,0.30)';
          ctx.fillRect(t.x * TILE + 3, t.y * TILE + 3, TILE - 6, TILE - 6);
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
    drawTerrainBadge(u.x, u.y, false, true);
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
    const targetH = TILE * 0.9;
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
    if (ready) {
      ctx.save();
      if (u.side === 'enemy') ctx.filter = 'saturate(0.9) brightness(0.99)';
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
      // HP 배지 같은 줄 왼쪽에 작게 붙여 위아래 겹침을 줄인다
      const bx2 = pillX - bw2 - Math.round(3 * k);
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
      ctx.font = 'bold 20px "Noto Serif CJK KR", serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30,24,12,0.85)';
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
          const cost = moveCost(u.cls, B.tiles[ny][nx]);
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
    setTimeout(() => { d.classList.remove('in'); setTimeout(() => d.remove(), 260); }, 3800);
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
    const rng = pendingSkill && pendingSkill.range ? pendingSkill.range : u.rng;
    const minR = pendingSkill ? (pendingSkill.minRange || 1) : (u.minRng || 1);
    const list = B.units.filter((t) => {
      if (!t.alive) return false;
      if (heal) return t.side === u.side && cheb(u.x, u.y, t.x, t.y) <= rng;
      if (t.side === u.side) return false;
      const d = cheb(u.x, u.y, t.x, t.y);
      return d >= minR && d <= rng;
    });
    tb.hidden = false;
    if (!list.length) {
      tb.innerHTML = `<span class="bt-hint">${heal ? '사거리 안 아군' : '사거리 안 적'}이 없습니다 — 한 칸 더 붙으세요</span>`;
      return;
    }
    tb.innerHTML = `<span class="bt-hint">${heal ? '아군' : '적'} 선택</span>`
      + list.map((t) => `<button class="bt-chip ${t.side}" data-id="${t.id}"><b>${t.name}</b><em>${Math.round(t.hp).toLocaleString('ko-KR')}</em></button>`).join('');
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
    calloutTimer = setTimeout(() => el.classList.remove('show'), 1750);
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
    return u.def * troopGuard(u) * (1 - terr(u).def * 1.0 + aff.def * 1.25 + typeBonus(u) * 0.6) * (1 + buffVal(u, 'def'));
  }
  function effRng(u) {
    const aff = SK.affinity(u.cls, B.tiles[u.y][u.x]);
    return u.rng + aff.rng;
  }
  function canHit(a, d, rng) {
    const dist = cheb(a.x, a.y, d.x, d.y);
    const min = a.minRng || 1;
    return dist >= min && dist <= (rng || effRng(a));
  }

  function calcDamage(a, d, opts) {
    let atk = effAtk(a);
    if (opts && opts.mult) atk *= opts.mult;
    const def = opts && opts.ignoreTerrain ? d.def : effDef(d);
    let base = (atk * 0.92 - def * 0.62) * 16;
    base *= rnd(0.92, 1.08);
    let crit = false;
    const cc = 0.05 + (a.wu - 60) * 0.0011 + (a.cls === 'sanjeok' ? 0.06 : 0);
    if (!opts || !opts.noCrit) {
      if (Math.random() < cc) { crit = true; base *= 1.55; }
    }
    const bond = SK.bondBetween ? SK.bondBetween(a.name, d.name) : null;
    if (bond && bond.relation === '숙적') base *= 1.2;
    return { dmg: Math.max(4, Math.round(base)), crit, bond };
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

  function applyDamage(a, d, dmg, crit, bond) {
    d.hp = Math.max(0, d.hp - dmg);
    addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.4) * TILE, (crit ? '회심! ' : '') + dmg,
      crit ? '#ffd166' : (bond ? '#ffd0c0' : '#ffe9d0'));
    if (a.side === 'ally' && a.uid) a.expGain = (a.expGain || 0) + (d.hp <= 0 ? 42 : 9);
    if (d.hp <= 0) {
      d.alive = false;
      addFloat((rxOf(d) + 0.5) * TILE, (ryOf(d) + 0.2) * TILE, '격파', '#ff9a7a');
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
        setTimeout(land, 70);
      });
    } else {
      launchProjectile(a, d, kind, land);
    }
  }

  function counter(a, d) {
    // a = 반격하는 방어자, d = 공격자
    if (!d.alive || !a.alive) return;
    if (cheb(a.x, a.y, d.x, d.y) <= effRng(a)) {
      setTimeout(() => {
        if (!a.alive || !d.alive || B.over) return;
        attackUnit(a, d, {}, () => finishCheck());
      }, 240);
    }
  }

  /* ───────────── 조작 ───────────── */
  function onTileTap(x, y) {
    if (!B || B.over || busy || !B.introDone) return;
    if (B.phase !== 'ally') return;
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const u = B.sel;
    const t = B.units.find((o) => o.alive && o.x === x && o.y === y);

    if (mode === 'skillTarget' && pendingSkill) { trySkillAt(x, y); return; }

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
    $('#battle-tip').textContent = `${u.name} · ${SK.CLASSES[u.cls].name} · 이동 ${u.mov} · ${t.name} 방어 ${Math.round(t.def * 100)}%`;
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
    } });
  }

  /* 조조전식 전투 예고 — 피해·반격·지형·인연 배지를 먼저 보여준다 */
  function openAttackPreview(a, d) {
    if (busy || !a || !d || !a.alive || !d.alive) return;
    const atk = calcDamage(a, d, {});
    const bond = SK.bondBetween ? SK.bondBetween(a.name, d.name) : null;
    const canCounter = d.alive && cheb(a.x, a.y, d.x, d.y) <= effRng(d);
    const cnt = canCounter ? calcDamage(d, a, {}) : null;
    const tr = SK.TERRAIN[B.tiles[d.y][d.x]] || SK.TERRAIN.P;
    const critChance = Math.round((0.05 + (a.wu - 60) * 0.0022 + (a.cls === 'sanjeok' ? 0.06 : 0)) * 100);
    const bondHtml = bond
      ? `<div class="ap-bond ${bond.relation === '숙적' ? 'rival' : 'friend'}">${bond.relation} · ${bond.title}<em>${bond.relation === '숙적' ? '피해 +20%' : '공격 +15%'}</em></div>`
      : '';
    const m = SK.modal({
      kicker: '전투 예고',
      title: `${a.name} → ${d.name}`,
      body: `<div class="atk-preview">
        <div class="ap-row"><span>예상 피해</span><b>${atk.dmg}</b><em>치명타 ${critChance}%</em></div>
        ${canCounter
          ? `<div class="ap-row counter"><span>반격 피해</span><b>${cnt.dmg}</b><em>${d.name}의 반격</em></div>`
          : '<div class="ap-row"><span>반격</span><b>없음</b><em>사거리 밖</em></div>'}
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

  /* 고유 특기 발동 — 상위 100명의 data/unique_passives.json
     on_attack: 공격 후 주변 아군 강화 / turn_start: 매 턴 아군 회복 / 그 외: 공격 시 발동으로 본다 */
  function triggerPassive(u, when) {
    const p = u && u.passive;
    if (!p || !u.alive || B.over) return;
    const trig = p.trigger || 'on_attack';
    if (when === 'turn_start' ? trig !== 'turn_start' : trig === 'turn_start') return;
    if (when !== 'turn_start' && u.pUsed && u.pUsed[trig]) return;
    const v = clamp((Number(p.valuePct) || 10) / 100, 0.03, 0.2);
    const cx = (rxOf(u) + 0.5) * TILE, cy = (ryOf(u) + 0.5) * TILE;
    if (trig === 'turn_start') {
      const list = B.units.filter((o) => o.alive && o.side === u.side && cheb(rxOf(o), ryOf(o), rxOf(u), ryOf(u)) <= 2);
      list.forEach((o) => {
        o.hp = Math.min(o.maxHp, o.hp + Math.round(o.maxHp * v));
        addFx({ kind: 'heal', x: (rxOf(o) + 0.5) * TILE, y: (ryOf(o) + 0.5) * TILE, life: 520 });
      });
      addFloat(cx, cy - 10, `「${p.title}」`, '#9ef0b8');
      feed(`${u.name}의 고유 특기 「${p.title}」 — 주변 아군 회복`, 'good');
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

  function doAttack(a, d) {
    if (!a || !d || !a.alive || !d.alive) return;
    busy = true;
    mode = 'idle';
    a.acted = true;
    B.reachCache = null;
    attackUnit(a, d, { mult: 1 }, () => {
      const wasAlive = d.alive && d.hp > 0;
      triggerPassive(a, 'on_attack');
      setTimeout(() => {
        if (!B || B.over) { busy = false; return; }
        if (wasAlive && d.alive && !B.over) counter(d, a);
        busy = false;
        finishCheck();
        if (!B.over) setTimeout(() => { if (B && !B.over) nextUnitOrWait(); }, 300);
      }, 320);
    });
    SKBattle.refreshUI();
  }

  function finishCheck() {
    if (B.over) return;
    const allies = B.units.filter((u) => u.side === 'ally' && u.alive);
    const enemies = B.units.filter((u) => u.side === 'enemy' && u.alive);
    if (!enemies.length) return victory();
    if (!allies.length) return defeat();
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
        if (t.alive && t.side === u.side && cheb(u.x, u.y, t.x, t.y) <= sk.radius) {
          const heal = healAmount(sk, t);
          t.hp = Math.min(t.maxHp, t.hp + heal);
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
        if (t.alive && t.side === u.side && cheb(u.x, u.y, t.x, t.y) <= sk.radius) {
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
    setTimeout(() => {
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
    const dist = cheb(u.x, u.y, x, y);
    if (sk.minRange && dist < sk.minRange) { SK.toast(`최소 사거리 ${sk.minRange}칸입니다.`); return; }
    if (dist > (sk.range || u.rng)) { SK.toast('사거리 밖입니다.'); return; }
    const target = B.units.find((o) => o.alive && o.x === x && o.y === y);
    const finish = (delay) => {
      u.acted = true; pendingSkill = null; mode = 'idle';
      SKBattle.refreshUI();
      setTimeout(() => {
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
        const heal = healAmount(sk, target);
        target.hp = Math.min(target.maxHp, target.hp + heal);
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
        if (t.alive && t.side !== u.side && cheb(x, y, t.x, t.y) <= rad) {
          if (sk.kind === 'debuffDef') t.buffs.def = { v: sk.amount, t: sk.turns };
          else t.buffs.atk = { v: sk.amount, t: sk.turns };
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
      setTimeout(() => {
        if (!B || B.over) { finish(0); return; }
        addFx({ kind: 'burst', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 620, color: '255,150,80' });
        addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 760 });
        B.units.forEach((t) => {
          if (t.alive && t.side !== u.side && cheb(x, y, t.x, t.y) <= rad) {
            const dmg = Math.max(10, Math.round(sk.power * 0.9 + u.ji * 0.35 + Math.min(400, u.hp * 0.02) - t.ji * 0.14));
            t.hp = Math.max(0, t.hp - dmg);
            t.flash = 1; t.shake = 240;
            addFloat((rxOf(t) + 0.5) * TILE, (ryOf(t) + 0.4) * TILE, String(dmg), '#ffb36a');
            if (t.hp <= 0) t.alive = false;
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
      setTimeout(() => {
        if (!B || B.over) { finish(0); return; }
        const dmg = Math.max(10, Math.round(sk.power * 0.9 + u.ji * 1.5 + Math.min(600, u.hp * 0.04) - target.ji * 0.4));
        target.hp = Math.max(0, target.hp - dmg);
        target.flash = 1; target.shake = 240;
        addFloat((x + 0.5) * TILE, (y + 0.4) * TILE, '화계 ' + dmg, '#ffb36a');
        addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.55) * TILE, life: 720 });
        addFx({ kind: 'burst', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 520, color: '255,150,80' });
        if (target.hp <= 0) target.alive = false;
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
          setTimeout(() => { if (B && !B.over && target.alive) apply(n - 1); else finish(300); }, 160);
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
    addFloat((u.x + 0.5) * TILE, (u.y + 0.4) * TILE, '+' + heal, '#a8f0b8');
    addFx({ kind: 'heal', x: (u.x + 0.5) * TILE, y: (u.y + 0.5) * TILE, life: 650 });
    SK.sfx.play('heal');
    u.acted = true;
    SKBattle.refreshUI();
    setTimeout(() => { if (!B.over) nextUnitOrWait(); }, 450);
  }

  function waitUnit() {
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
          <p class="bi-train">훈련도 ${t.train == null ? trainOf(t.lv, t.tier) : t.train}</p><div class="bi-attrs"><span>공 ${Math.round(effAtk(t))}</span><span>방 ${Math.round(effDef(t))}</span><span>이동 ${t.mov}</span><span>사거리 ${effRng(t)}</span></div>
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
    setTimeout(enemyPhase, 650);
  }

  function enemyPhase() {
    if (B.over) return;
    const enemies = B.units.filter((u) => u.side === 'enemy' && u.alive).sort((a, b) => a.y - b.y);
    let i = 0;
    const step = () => {
      if (B.over) return;
      if (i >= enemies.length) {
        // back to player's turn
        B.turn += 1;
        if (B.turn > 30) return defeat();
        B.units.forEach((u) => {
          if (!u.alive) return;
          u.acted = false;
          Object.keys(u.buffs).forEach((k) => { u.buffs[k].t -= 1; if (u.buffs[k].t <= 0) delete u.buffs[k]; });
          if (u.side === 'ally') u.mp = Math.min(u.maxMp, u.mp + 3);
          else u.mp = Math.min(u.maxMp, u.mp + 2);
        });
        B.phase = 'ally';
        B.units.forEach((u) => { if (u.side === 'ally' && u.alive) triggerPassive(u, 'turn_start'); });
        banner('아군 페이즈', 'ally');
        SKBattle.refreshUI();
        const first = B.units.find((u) => u.side === 'ally' && u.alive && !u.acted);
        if (first) selectUnit(first);
        return;
      }
      const e = enemies[i++];
      if (!e.alive) { step(); return; }
      enemyAct(e, () => setTimeout(step, 220));
    };
    step();
  }

  function enemyAct(e, done) {
    if (!e.alive) { done(); return; }
    if (e.x != null) trackTurn(e, true);
    const targets = B.units.filter((u) => u.side === 'ally' && u.alive);
    if (!targets.length) { done(); return; }
    let target = targets.reduce((best, t) => {
      const d = cheb(e.x, e.y, t.x, t.y);
      return !best || d < best.d ? { t, d } : best;
    }, null).t;
    const rng = effRng(e);

    // cast a heal on a wounded ally if priest
    if (e.cls === 'pungsusa' && e.mp >= 10) {
      const hurt = B.units.filter((u) => u.side === 'enemy' && u.alive && u.hp < u.maxHp * 0.6)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt && cheb(e.x, e.y, hurt.x, hurt.y) <= 2) {
        const heal = healAmount({ healPct: 0.15 }, hurt);
        e.mp -= 10; hurt.hp = Math.min(hurt.maxHp, hurt.hp + heal);
        addFloat((hurt.x + 0.5) * TILE, (hurt.y + 0.4) * TILE, '+' + heal, '#a8f0b8');
        addFx({ kind: 'heal', x: (hurt.x + 0.5) * TILE, y: (hurt.y + 0.5) * TILE, life: 600 });
        e.acted = true; done(); return;
      }
    }

    // magic if in range
    if ((e.cls === 'chaeksa') && e.mp >= 10 && cheb(e.x, e.y, target.x, target.y) <= rng) {
      e.mp -= 10;
      e.acted = true;
      castCircle(e, '255,170,120');
      SK.sfx.play('spell');
      setTimeout(() => {
        if (!B || B.over) { done(); return; }
        const dmg = Math.max(6, Math.round(20 + e.ji * 0.1 + Math.min(200, e.hp * 0.01) - target.ji * 0.04));
        target.hp = Math.max(0, target.hp - dmg);
        addFloat((rxOf(target) + 0.5) * TILE, (ryOf(target) + 0.4) * TILE, '화계 ' + dmg, '#ffb36a');
        addFx({ kind: 'fire', x: (rxOf(target) + 0.5) * TILE, y: (ryOf(target) + 0.55) * TILE, life: 700 });
        impactAt(target, '255,150,90');
        SK.sfx.play('hit');
        if (target.hp <= 0) target.alive = false;
        finishCheck();
        done();
      }, 300);
      return;
    }

    const minR = e.minRng || 1;
    const curD = cheb(e.x, e.y, target.x, target.y);
    const already = curD >= minR && curD <= rng;
    const reach = reachSet(e);
    const freeTiles = [];
    reach.forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      const occ = B.units.find((o) => o.alive && o.x === x && o.y === y);
      if (!occ) freeTiles.push({ x, y });
    });
    let best = null;
    freeTiles.forEach((t) => {
      const d = cheb(t.x, t.y, target.x, target.y);
      const inRange = d >= minR && d <= rng;
      const score = inRange ? -100 + d : (d < minR ? 150 - d : d);
      if (!best || score < best.score) best = { t, score, inRange };
    });
    const moveTo = already ? null : (best && best.t);
    const finishMove = () => {
      const path = moveTo ? findPath(e, moveTo.x, moveTo.y) : [];
      animatePath(e, path, { step: 88, onDone: () => {
        setTimeout(() => {
          if (!B || B.over) { done(); return; }
          const dist = cheb(e.x, e.y, target.x, target.y);
          if (dist >= (e.minRng || 1) && dist <= rng) {
            attackUnit(e, target, {}, () => {
              if (!B || B.over) { done(); return; }
              if (target.alive && cheb(target.x, target.y, e.x, e.y) <= effRng(target) && Math.random() < 0.7) {
                setTimeout(() => {
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

  function victoryQuote() {
    const lord = SK.factionInfo(SK.playerFaction()).lord || '조조';
    return SK.quoteOf(lord, 'victory') || SK.quoteOf('조조', 'victory');
  }

  /* ───────────── 승패 ───────────── */
  function victory() {
    if (B.over) return;
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
    st.owner = SK.playerFaction();
    st.genIds = [];
    st.troops = Math.max(1200, Math.round(troopsLeft));
    st.def = Math.max(30, Math.round(st.def * 0.8));
    st.loyalty = 55;
    st.governor = null;
    st.advisor = null;
    st.auto = true;
    st.bandit = false;
    if (st.train == null) st.train = 50;
    if (SK.refillTalents) { try { SK.refillTalents(B.targetId); } catch (e) { /* ignore */ } }
    s.gold += B.rewards.gold;
    s.food += B.rewards.food;
    s.fame += 12 + (SK.battleTypeFor(c) === 'fortress' ? 6 : 0) + (B.event ? 5 : 0);
    const drop = SK.rollTreasure ? SK.rollTreasure(defeatedNames, c.name) : null;
    const levelUps = [];
    s.heroes.forEach((h) => {
      const u = B.units.find((x) => x.uid === h.uid);
      if (u) {
        h.hp = Math.max(1, Math.round((u.hp / u.maxHp) * SK.maxHpOf(h.cls, h.lv)));
        h.mp = u.mp;
        if (u.alive) h.city = B.targetId;
        const gain = (u.expGain || 0) + (u.alive ? 70 : 30) + (B.def.name === '공성전' ? 15 : 0);
        const ups = SK.gainExp(h, gain);
        if (ups.length) levelUps.push({ name: h.name, lv: h.lv, title: SK.classTitle(h.cls, h.lv), promote: ups.some((x) => x.promote) });
      }
    });
    // move wounded survivors to the captured city
    SK.save();
    SKBattle.refreshUI();
    const owned = SK.CITY_LIST.filter((x) => s.cities[x.id].owner === SK.playerFaction()).length;
    SK.modal({
      kicker: '승리',
      title: `${c.name} 함락`,
      body: `<div class="result-modal win">
        <div class="rm-seal">승</div>
        <p class="rm-line">${SK.factionName(prevOwner)}을(를) 무찌르고 <b>${c.name}</b>을(를) 차지했습니다.</p>
        <div class="rm-rewards">
          <div><span>금</span><b>+${Math.round(B.rewards.gold).toLocaleString('ko-KR')}</b></div>
          <div><span>군량</span><b>+${Math.round(B.rewards.food).toLocaleString('ko-KR')}</b></div>
          <div><span>명성</span><b>+12</b></div>
          <div><span>영토</span><b>${owned} / ${SK.CITY_LIST.length}</b></div>
        </div>
        ${drop ? `<div class="rm-treasure" style="--gc:${SK.GRADE_COLOR[drop.grade]}">
          <span class="rt-grade">${drop.grade} 보물</span>
          <b>${drop.name}</b><em>${drop.effect}</em>
        </div>` : ''}
        ${levelUps.length ? `<div class="rm-levels">${levelUps.map((l) => `<span class="${l.promote ? 'promote' : ''}">${l.name} Lv.${l.lv}${l.promote ? ` · ${l.title} 승급!` : ' 달성'}</span>`).join('')}</div>` : ''}
        <div class="rm-survivors">${survivors.map((u) => `<img src="${SK.ptSrc(u.portrait)}" title="${u.name}">`).join('')}</div>
        ${B.event ? `<p class="rm-event">특별 이벤트 — ${B.event.title} · 명성 +5</p>` : ''}
        ${victoryQuote() ? `<p class="rm-quote">“${victoryQuote()}”</p>` : ''}
        <p class="rm-note">${owned >= SK.CITY_LIST.length ? '천하가 하나로 모였습니다!' : '다음 성으로 나아가십시오.'}</p>
      </div>`,
      actions: [{ label: '지도로', primary: true, onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  function defeat() {
    if (B.over) return;
    B.over = true;
    SK.sfx.play('defeat');
    const s = SK.state;
    const st = s.cities[B.origin];
    const defeatedNames = B.units.filter((u) => u.side === 'enemy').map((u) => u.name);
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = survivors.reduce((sum, u) => sum + u.hp, 0);
    if (st) st.troops = Math.min(20000, st.troops + Math.round(troopsLeft));
    s.gold = Math.max(0, s.gold - 200);
    B.units.forEach((u) => {
      if (u.side === 'ally' && u.uid) {
        const h = s.heroes.find((x) => x.uid === u.uid);
        if (h) h.hp = Math.max(1, Math.round(SK.maxHpOf(h.cls, h.lv) * 0.4));
      }
    });
    SK.save();
    SK.modal({
      kicker: '패배',
      title: '퇴각',
      body: `<div class="result-modal lose"><div class="rm-seal">패</div>
        <p class="rm-line">적의 방어가 완강했습니다. 병력을 정비하고 다시 도전하십시오.</p>
        ${SK.quoteOf('조조', 'retreat') ? `<p class="rm-quote">“${SK.quoteOf('조조', 'retreat')}”</p>` : ''}
        <p class="rm-note">보유 금 -200 · 부상병이 생겼습니다.</p></div>`,
      actions: [{ label: '지도로', onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  function retreat() {
    if (!B) return;
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
  }

  /* ───────────── 전장 UI ───────────── */
  function banner(text, side) {
    const el = $('#turn-banner');
    if (!el) return;
    el.textContent = text;
    el.className = 'turn-banner show ' + side;
    setTimeout(() => { el.className = 'turn-banner ' + side; }, 1200);
  }

  function showIntro() {
    let i = 0;
    const ov = $('#battle-overlay');
    ov.hidden = false;
    const render = () => {
      if (!B) return;
      if (i >= B.introLines.length) { ov.hidden = true; ov.onclick = null; B.introDone = true; banner('아군 페이즈', 'ally'); const first = B.units.find((u) => u.side === 'ally'); if (first) selectUnit(first); return; }
      const L = B.introLines[i];
      if (L.event) {
        const ev = L.event;
        ov.innerHTML = `<div class="event-card">
          <div class="ev-seal">연</div>
          <div class="ev-main"><span class="ev-type">${ev.type || '특별 이벤트'}</span>
            <h4>${ev.title}</h4>
            <p class="ev-dialogue">“${ev.dialogue}”</p>
            <p class="ev-reward">${ev.reward || ''}</p>
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
      $('#battle-kind').textContent = `${B.def.name} · ${B.objective}`;
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
        $('#uc-terrain').textContent = tr.name + (tr.def ? ` 방어+${Math.round(tr.def * 100)}%` : '') + (SK.affinity(u.cls, B.tiles[u.y][u.x]).label ? ` · ${SK.affinity(u.cls, B.tiles[u.y][u.x]).label}` : '') + (typeBonus(u) ? ` · ${B.def.name} ${typeBonus(u) > 0 ? '+' : ''}${Math.round(typeBonus(u) * 100)}%` : '');
        $('#uc-hp').style.width = Math.round(u.hp / u.maxHp * 100) + '%';
        $('#uc-hp-txt').textContent = `${Math.round(u.hp).toLocaleString('ko-KR')} / ${Math.round(u.maxHp).toLocaleString('ko-KR')}`;
        $('#uc-mp').style.width = Math.round(u.mp / u.maxMp * 100) + '%';
        $('#uc-mp-txt').textContent = `${u.mp}/${u.maxMp}`;
        $('#uc-troops').textContent = `${Math.round(u.hp).toLocaleString('ko-KR')} / ${Math.round(u.maxHp).toLocaleString('ko-KR')}`;
        $('#uc-train').textContent = `${u.train == null ? trainOf(u.lv, u.tier) : u.train}`;
        $('#uc-atk').textContent = Math.round(effAtk(u));
        $('#uc-def').textContent = Math.round(effDef(u));
        $('#uc-mov').textContent = u.mov;
        $('#uc-rng').textContent = effRng(u);
        const canAct = u.side === 'ally' && !u.acted;
        document.querySelectorAll('.act').forEach((b) => b.classList.toggle('off', !canAct));
      } else {
        card.classList.remove('on');
        $('#uc-name').textContent = '부대를 선택하세요';
        $('#uc-cls').textContent = B.def.desc;
        $('#uc-terrain').textContent = '';
        $('#uc-hp').style.width = '0%'; $('#uc-mp').style.width = '0%';
        $('#uc-hp-txt').textContent = ''; $('#uc-mp-txt').textContent = '';
        $('#uc-troops').textContent = '0'; $('#uc-train').textContent = '-';
        $('#uc-atk').textContent = '-'; $('#uc-def').textContent = '-';
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
      get fx() { return fx.map((f) => f.kind); },
      get floats() { return floats.map((f) => f.text); },
      get anims() { return anims.map((a) => a.kind); },
      tap(x, y) { onTileTap(x, y); },
      endTurn,
      openSkillMenu,
      beginSkill,
      hurtEnemies(n) { B.units.filter((u) => u.side === 'enemy').forEach((u) => { u.hp = n; if (n <= 0) u.alive = false; }); },
      finish() { finishCheck(); },
      closeBattle,
      moveTo(x, y) { const u = B.sel; if (u) moveUnit(u, x, y); },
      focus(x, y, s) { if (s) cam.s = clamp(s, 0.4, 2.2); centerCam(x, y); },
      setTimeScale(v) { timeScale = v > 0 ? v : 1; return timeScale; },
      eff(name) {
        const u = B.units.find((o) => o.name === name);
        return u ? { atk: Math.round(effAtk(u)), def: Math.round(effDef(u)), rng: effRng(u), bond: bondAllyMul(u) } : null;
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
