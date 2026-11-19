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
  let hoverTile = null;

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
    return loadImg(`assets/units/v2/${key}.webp`);
  }

  /* ───────────── 전장 시작 ───────────── */
  SK.startBattle = function (opts) {
    document.querySelectorAll('#modal-root .modal-layer').forEach((m) => m.remove());
    const s = SK.state;
    const target = SK.CITY[opts.targetId];
    const type = opts.type || SK.battleTypeFor(target);
    const def = SK.BATTLE_TYPES[type];
    const mapRows = SK.MAPS[def.map];
    const tiles = mapRows.map((r) => r.split(''));
    const faction = s.cities[opts.targetId].owner;
    const bossInfo = SK.BOSS_PORTRAITS[faction];

    const allies = opts.units.map((spec, i) => (spec.kind === 'hero' ? makeAlly(spec, i) : makeRegiment(spec, i)));

    const cityTroops = s.cities[opts.targetId].troops;
    const enemyCount = clamp(5 + Math.floor(cityTroops / 2600), 5, 8);
    const per = clamp(Math.round(cityTroops / enemyCount / 100) * 100, 800, 2200);
    const defGens = (s.cities[opts.targetId].genIds || []).map((id) => SK.GEN_BY_ID[id]).filter(Boolean);
    const enemies = [];
    for (let i = 0; i < enemyCount; i++) {
      if (defGens[i]) enemies.push(makeNamedEnemy(defGens[i], per, i === 0));
      else if (i === 0 && bossInfo && !defGens.length) enemies.push(makeBoss(bossInfo, faction, per));
      else enemies.push(makeEnemy(i, type, faction, per));
    }

    B = {
      type, def, name: `${target.name} ${def.name}`, targetId: opts.targetId, origin: opts.origin,
      tiles, units: [], turn: 1, phase: 'ally', sel: null,
      acted: false, over: false, log: [], faction, rewards: { gold: 0, food: 0 },
      introLines: buildIntro(type, target, faction, bossInfo, defGens, SK.pickEvent(target, defGens)),
      event: SK.pickEvent(target, defGens),
      objective: def.objective, started: false, moveAnim: null, deployed: opts.units, introDone: false,
    };
    placeSide(allies, SK.allySlots(type), 'ally');
    placeSide(enemies, SK.enemySlots(type), 'enemy');
    B.rewards.gold = Math.round(cityTroops * 0.16 + 320);
    B.rewards.food = Math.round(cityTroops * 0.11 + 240);

    SK.show('screen-battle');
    initCanvas();
    SKBattle.refreshUI();
    showIntro();
  };

  function makeAlly(spec, i) {
    const h = SK.state.heroes.find((x) => x.uid === spec.uid);
    const C = SK.CLASSES[h.cls];
    const eq = SK.equipBonus(h);
    const troops = spec.troops || SK.troopForNamed(h.lv);
    return {
      id: 'a' + i, side: 'ally', uid: h.uid, name: h.name, hanja: h.hanja, cls: h.cls, lv: h.lv,
      hp: troops, maxHp: troops, mp: h.mp, maxMp: SK.maxMpOf(h.cls, h.lv),
      atk: (C.atk + (h.wu + eq.war - 60) * 0.30) * (1 + 0.10 * SK.tierForLv(h.lv)),
      def: (C.def + (h.tong + eq.leadership - 60) * 0.15) * (1 + 0.10 * SK.tierForLv(h.lv)),
      mov: Math.min(9, C.mov + eq.move), rng: C.rng, minRng: C.minRng || 1,
      wu: h.wu + eq.war, ji: h.ji + eq.intel, tong: h.tong + eq.leadership,
      portrait: h.portrait, unit: h.unit || CLASS_UNIT[h.cls], skills: SK.skillsFor(h.cls, h.lv),
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 2, face: 1, expGain: 0,
    };
  }

  function makeRegiment(spec, i) {
    const C = SK.CLASSES[spec.cls];
    const lv = 3;
    return {
      id: 'r' + i, side: 'ally', uid: null, name: spec.name, hanja: '', cls: spec.cls, lv,
      hp: spec.troops, maxHp: spec.troops, mp: C.mp, maxMp: C.mp,
      atk: C.atk + 1, def: C.def + 1, mov: C.mov, rng: C.rng, minRng: C.minRng || 1,
      wu: 66, ji: 58, tong: 62, portrait: CLASS_PORTRAIT[spec.cls], unit: CLASS_UNIT[spec.cls],
      skills: C.skills.slice(), x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: 1,
    };
  }

  function makeBoss(info, faction, per) {
    const C = SK.CLASSES[info.cls];
    const lv = info.lv;
    const troops = Math.round(per * 1.5);
    return {
      id: 'boss', side: 'enemy', name: info.name, hanja: info.hanja, cls: info.cls, lv,
      hp: troops, maxHp: troops, mp: C.mp + lv * 2, maxMp: C.mp + lv * 2,
      atk: C.atk + lv * 1.8, def: C.def + lv * 1.2,
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: 82 + lv, ji: 60 + lv, tong: 80, boss: true,
      portrait: info.pt, unit: CLASS_UNIT[info.cls], skills: C.skills.slice(),
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: -1,
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
      atk: (C.atk + g.war * 0.22) * (1 + (SK.TIER_LV[g.tier] || 3) * 0.03),
      def: (C.def + g.leadership * 0.14),
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: g.war, ji: g.intel, tong: g.leadership,
      boss: boss && g.tier === 'S', portrait: SK.genPortrait(g), unit: SK.genUnit(g),
      skills: SK.skillsFor(cls, lv), skillName: g.skill, tier: g.tier,
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: -1,
    };
  }

  function makeEnemy(i, type, faction, per) {
    const cls = SK.enemyClassesFor(type, i);
    const C = SK.CLASSES[cls];
    const season = Math.floor(((SK.state && SK.state.turn) || 1) / 6);
    const lv = clamp(2 + Math.floor(per / 900) + season, 2, 10);
    const frac = [1, 0.9, 1.05, 0.95, 1, 0.9, 1.1, 0.95][i % 8];
    const troops = Math.round(per * frac);
    return {
      id: 'e' + i, side: 'enemy', name: `${faction === 'han' ? '한 ' : ''}${C.name}대`,
      hanja: '', cls, lv,
      hp: troops, maxHp: troops, mp: C.mp + lv, maxMp: C.mp + lv,
      atk: (C.atk + lv * 1.6) * (1 + season * 0.03), def: (C.def + lv * 1.0) * (1 + season * 0.03),
      mov: C.mov, rng: C.rng, minRng: C.minRng || 1, wu: 60 + lv * 3, ji: 55 + lv * 2, tong: 60 + lv * 2,
      portrait: CLASS_PORTRAIT[cls], unit: CLASS_UNIT[cls], skills: C.skills.slice(),
      x: 0, y: 0, acted: false, alive: true, buffs: {}, items: 1, face: -1,
    };
  }

  function placeSide(list, slots, side) {
    list.forEach((u, i) => {
      let [x, y] = slots[i % slots.length];
      if (!B.tiles[y] || !passable(B.tiles[y][x]) || B.units.some((o) => o.x === x && o.y === y)) {
        const alt = findFree(B.tiles, x, y);
        x = alt.x; y = alt.y;
      }
      u.x = x; u.y = y; u.side = side;
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
    const F = SK.FACTIONS[faction];
    const lines = [];
    if (event) lines.push({ event });
    lines.push({ who: '조조', hanja: '曹操', pt: 'caocao', side: 'ally', text: `${target.name}의 성문을 열어라. 오늘로 끝내겠다.` });
    if (type === 'siege') lines.push({ who: '순유', hanja: '荀攸', pt: 'xunyou', side: 'ally', text: '성벽이 높습니다. 성문을 향해 힘을 모으십시오.' });
    if (type === 'naval') lines.push({ who: '주태', hanja: '周泰', pt: 'zhoutai', side: 'ally', text: '물길은 내가 안다. 배를 따라오너라!' });
    if (type === 'mountain') lines.push({ who: '주창', hanja: '周倉', pt: 'zhoucang', side: 'ally', text: '산길은 좁다. 내 뒤에 붙어라!' });
    if (type === 'fortress') lines.push({ who: '하후돈', hanja: '夏侯惇', pt: 'xiahoudun', side: 'ally', text: '목책 하나, 부수면 그만이다.' });
    const named = (defGens || [])[0];
    if (named) lines.push({ who: named.name, hanja: '', pt: SK.genPortrait(named), side: 'enemy', text: `${SK.CLASSES[SK.genClass(named)].name} ${named.name}, 이 성은 내가 지킨다.` });
    else if (bossInfo) lines.push({ who: bossInfo.name, hanja: bossInfo.hanja, pt: bossInfo.pt, side: 'enemy', text: bossLine(faction) });
    return lines;
  }
  function bossLine(faction) {
    return {
      yuan: '하북의 힘을 얕보지 마라!', lv: '내 창 앞에서 무릎 꿇어라!', wu: '강동의 호랑이가 어디 도망가겠나!',
      liu: '형주의 성은 그대들의 무덤이 될 것이다.', yan: '촉의 산하는 쉽게 넘지 못한다.',
      ma: '서량의 철기를 보아라.', dong: '이 성은 내 것이다.',
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
        drag = { on: true, moved: 0, sx: e.clientX, sy: e.clientY, lx: cam.x, ly: cam.y };
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
    const fit = Math.min(stage.clientWidth / WORLD, stage.clientHeight / WORLD);
    ns = clamp(ns, fit * 0.95, 2.2);
    const k = ns / cam.s;
    cam.x = fx2 - (fx2 - cam.x) * k;
    cam.y = fy2 - (fy2 - cam.y) * k;
    cam.s = ns;
    camClamp();
  }
  window.addEventListener('resize', () => { if (B && canvas) { resizeCanvas(); camClamp(); } });

  /* ───────────── 렌더 ───────────── */
  function loop(t) {
    const dt = Math.min(60, t - lastT);
    lastT = t;
    updateFx(dt);
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
    ctx.translate(cam.x, cam.y);
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
  }

  function drawUnits() {
    const sorted = B.units.filter((u) => u.alive).sort((a, b) => a.y - b.y);
    sorted.forEach((u) => drawUnit(u));
  }

  function drawUnit(u) {
    const bx = (u.x + 0.5) * TILE;
    const by = (u.y + 1) * TILE - 4;
    const img = unitImgFor(u);
    const h = TILE * 1.28;
    const w = img.complete && img.naturalWidth ? (img.width / img.height) * h : h * 0.75;
    // shadow + side ring
    ctx.save();
    ctx.fillStyle = 'rgba(28,24,14,0.28)';
    ctx.beginPath();
    ctx.ellipse(bx, by - 2, TILE * 0.26, TILE * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = u.side === 'ally' ? 'rgba(70,130,220,0.9)' : 'rgba(190,60,50,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(bx, by - 2, TILE * 0.27, TILE * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (img.complete && img.naturalWidth) {
      ctx.save();
      if (u.side === 'enemy') {
        ctx.filter = 'saturate(0.85) brightness(0.97)';
      }
      ctx.drawImage(img, bx - w / 2, by - h, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = u.side === 'ally' ? '#40609a' : '#9a4038';
      ctx.fillRect(bx - 12, by - 40, 24, 38);
    }
    // acted veil
    if (u.side === 'ally' && u.acted) {
      ctx.fillStyle = 'rgba(30,30,30,0.22)';
      ctx.beginPath(); ctx.ellipse(bx, by - 2, TILE * 0.3, TILE * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    }
    // hp bar
    const bw = TILE * 0.62, bh = 5;
    const p = clamp(u.hp / u.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(20,16,10,0.65)';
    ctx.fillRect(bx - bw / 2 - 1, by - h - 9, bw + 2, bh + 2);
    ctx.fillStyle = p > 0.55 ? '#5fb86a' : p > 0.28 ? '#d4a73c' : '#c9503f';
    ctx.fillRect(bx - bw / 2, by - h - 8, bw * p, bh);
    // boss crown
    if (u.boss) {
      ctx.fillStyle = '#e0b94e';
      ctx.font = `bold ${Math.round(TILE * 0.22)}px "Noto Serif CJK KR", serif`;
      ctx.textAlign = 'center';
      ctx.fillText('◆', bx, by - h - 14);
    }
    // buff dot
    if (u.buffs.atk || u.buffs.def) {
      ctx.fillStyle = '#8fd0ff';
      ctx.beginPath(); ctx.arc(bx + bw / 2 - 2, by - h - 8, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ───────────── 이펙트 ───────────── */
  function addFx(o) { fx.push(Object.assign({ t: 0, life: 420 }, o)); }
  function addFloat(x, y, text, color) { floats.push({ x, y, text, color, life: 950, t: 0 }); }

  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > fx[i].life) fx.splice(i, 1); }
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

  /* ───────────── 전투 규칙 ───────────── */
  function terr(u) { return SK.TERRAIN[B.tiles[u.y][u.x]] || SK.TERRAIN.P; }
  function buffVal(u, k) { const b = u.buffs[k]; return b && b.t > 0 ? b.v : 0; }

  function typeBonus(u) { return (SK.terrainBonus(u.cls, B.type) || 0) / 100; }
  function effAtk(u) {
    const ch = B.tiles[u.y][u.x];
    const aff = SK.affinity(u.cls, ch);
    return u.atk * (1 + buffVal(u, 'atk') + aff.atk + typeBonus(u));
  }
  function effDef(u) {
    const ch = B.tiles[u.y][u.x];
    const aff = SK.affinity(u.cls, ch);
    return u.def * (1 - terr(u).def * 0.8 + aff.def + typeBonus(u) * 0.5) * (1 + buffVal(u, 'def'));
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
    const cc = 0.05 + (a.wu - 60) * 0.0022 + (a.cls === 'sanjeok' ? 0.06 : 0);
    if (!opts || !opts.noCrit) {
      if (Math.random() < cc) { crit = true; base *= 1.55; }
    }
    return { dmg: Math.max(4, Math.round(base)), crit };
  }

  function attackUnit(a, d, opts) {
    const { dmg, crit } = calcDamage(a, d, opts);
    d.hp = Math.max(0, d.hp - dmg);
    const dx = (a.x + d.x) / 2 * TILE + TILE / 2, dy = (a.y + d.y) / 2 * TILE + TILE / 2;
    if (a.cls === 'gungbyung' || a.cls === 'gunggi' || (a.cls === 'chaeksa' && opts && opts.ranged)) {
      addFx({ kind: 'arrow', x: (a.x + 0.5) * TILE, y: (a.y + 0.45) * TILE, tx: (d.x + 0.5) * TILE, ty: (d.y + 0.5) * TILE, life: 300 });
    } else {
      addFx({ kind: 'slash', x: (d.x + 0.5) * TILE, y: (d.y + 0.5) * TILE, life: 380 });
    }
    addFloat((d.x + 0.5) * TILE, (d.y + 0.4) * TILE, (crit ? '회심! ' : '') + dmg, crit ? '#ffd166' : '#ffe9d0');
    if (a.side === 'ally' && a.uid) a.expGain = (a.expGain || 0) + (d.hp <= 0 ? 42 : 9);
    if (d.hp <= 0) { d.alive = false; addFloat((d.x + 0.5) * TILE, (d.y + 0.2) * TILE, '격파', '#ff9a7a'); }
    if (window.SKBattle) SKBattle.refreshUI();
  }

  function counter(a, d) {
    if (!d.alive || !a.alive) return;
    if (cheb(a.x, a.y, d.x, d.y) <= effRng(a)) {
      setTimeout(() => {
        if (!a.alive || !d.alive || B.over) return;
        const r = calcDamage(a, d);
        d.hp = Math.max(0, d.hp - r.dmg);
        addFloat((d.x + 0.5) * TILE, (d.y + 0.4) * TILE, String(r.dmg), '#ffcfae');
        addFx({ kind: 'slash', x: (d.x + 0.5) * TILE, y: (d.y + 0.5) * TILE, life: 320 });
        if (d.hp <= 0) { d.alive = false; addFloat((d.x + 0.5) * TILE, (d.y + 0.2) * TILE, '격파', '#ff9a7a'); }
        finishCheck();
      }, 260);
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
        if (canHit(u, t)) { doAttack(u, t); return; }
        SK.toast(`사거리 밖입니다. (사거리 ${effRng(u)})`);
        return;
      }
      showUnitInfo(t);
      return;
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
    B.sel = u;
    ensureVisible(u);
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
    busy = true;
    const sx = u.x, sy = u.y;
    const path = [];
    // simple straight-ish step animation
    const steps = Math.max(Math.abs(x - sx), Math.abs(y - sy));
    for (let i = 1; i <= steps; i++) path.push([Math.round(sx + (x - sx) * i / steps), Math.round(sy + (y - sy) * i / steps)]);
    let i = 0;
    const tick = () => {
      if (i >= path.length) {
        u.x = x; u.y = y;
        addFx({ kind: 'step', x: (x + 0.5) * TILE, y: (y + 0.9) * TILE, life: 300 });
        busy = false; mode = 'act'; B.reachCache = null;
        SKBattle.refreshUI();
        return;
      }
      const [nx, ny] = path[i++];
      u.x = nx; u.y = ny;
      addFx({ kind: 'step', x: (nx + 0.5) * TILE, y: (ny + 0.95) * TILE, life: 260 });
      setTimeout(tick, 85);
    };
    tick();
  }

  function doAttack(a, d) {
    busy = true;
    mode = 'idle';
    const mult = 1.0;
    attackUnit(a, d, { mult });
    const wasAlive = d.hp > 0;
    setTimeout(() => {
      if (wasAlive) counter(d, a);
      a.acted = true;
      busy = false;
      finishCheck();
      if (!B.over) nextUnitOrWait();
    }, 380);
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
        <div><b>${sk.name} <em>${sk.hanja}</em></b><span>${sk.desc}</span></div>
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
    u.mp -= sk.mp;
    if (sk.kind === 'healArea') {
      B.units.forEach((t) => {
        if (t.alive && t.side === u.side && cheb(u.x, u.y, t.x, t.y) <= sk.radius) {
          t.hp = Math.min(t.maxHp, t.hp + sk.power);
          addFloat((t.x + 0.5) * TILE, (t.y + 0.4) * TILE, '+' + sk.power, '#a8f0b8');
          addFx({ kind: 'heal', x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE, life: 620 });
        }
      });
    } else if (sk.kind === 'buffSelf') {
      u.buffs.def = { v: sk.def, t: sk.turns };
      addFloat((u.x + 0.5) * TILE, (u.y + 0.2) * TILE, '방어↑', '#9fd8ff');
      addFx({ kind: 'buff', x: (u.x + 0.5) * TILE, y: (u.y + 0.5) * TILE, life: 600, color: '150,210,255' });
    } else if (sk.kind === 'buffAreaAllies') {
      B.units.forEach((t) => {
        if (t.alive && t.side === u.side && cheb(u.x, u.y, t.x, t.y) <= sk.radius) {
          t.buffs.atk = { v: sk.atk, t: sk.turns };
          addFx({ kind: 'buff', x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE, life: 600 });
        }
      });
      addFloat((u.x + 0.5) * TILE, (u.y + 0.2) * TILE, sk.name, '#ffe08a');
    }
    u.acted = true;
    pendingSkill = null;
    mode = 'idle';
    SKBattle.refreshUI();
    setTimeout(() => { finishCheck(); if (!B.over) nextUnitOrWait(); }, 600);
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
      setTimeout(() => { finishCheck(); if (!B.over) nextUnitOrWait(); }, delay || 600);
    };

    if (sk.kind === 'heal' || sk.kind === 'buffAlly') {
      if (!target || target.side !== u.side) { SK.toast('아군을 선택하세요.'); return; }
      u.mp -= sk.mp;
      if (sk.kind === 'heal') {
        target.hp = Math.min(target.maxHp, target.hp + sk.power);
        addFloat((x + 0.5) * TILE, (y + 0.4) * TILE, '+' + Math.round(sk.power), '#a8f0b8');
        addFx({ kind: 'heal', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 700 });
      } else {
        target.buffs.atk = { v: sk.atk, t: sk.turns };
        addFloat((x + 0.5) * TILE, (y + 0.3) * TILE, '공격↑', '#ffe08a');
        addFx({ kind: 'buff', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 650, color: '255,215,120' });
      }
      finish(550);
      return;
    }

    if (sk.kind === 'debuffDef' || sk.kind === 'debuffAtk') {
      u.mp -= sk.mp;
      const rad = sk.radius || 1;
      B.units.forEach((t) => {
        if (t.alive && t.side !== u.side && cheb(x, y, t.x, t.y) <= rad) {
          if (sk.kind === 'debuffDef') t.buffs.def = { v: sk.amount, t: sk.turns };
          else t.buffs.atk = { v: sk.amount, t: sk.turns };
          addFloat((t.x + 0.5) * TILE, (t.y + 0.3) * TILE, sk.kind === 'debuffDef' ? '방어↓' : '공격↓',
            sk.kind === 'debuffDef' ? '#c9a6ff' : '#ffb0d8');
          addFx({ kind: 'buff', x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE, life: 620, color: sk.kind === 'debuffDef' ? '190,160,255' : '255,170,215' });
        }
      });
      addFx({ kind: 'buff', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 800, color: '190,160,255' });
      finish(600);
      return;
    }

    if (sk.kind === 'magicArea') {
      u.mp -= sk.mp;
      B.units.forEach((t) => {
        if (t.alive && t.side !== u.side && cheb(x, y, t.x, t.y) <= (sk.radius || 1)) {
          const dmg = Math.max(10, Math.round(sk.power + u.ji * 0.5 - t.ji * 0.2));
          t.hp = Math.max(0, t.hp - dmg);
          if (t.hp <= 0) t.alive = false;
          addFloat((t.x + 0.5) * TILE, (t.y + 0.4) * TILE, String(dmg), '#ffb36a');
        }
      });
      addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, life: 760 });
      finish(650);
      return;
    }

    if (!target || target.side === u.side) { SK.toast('적을 선택하세요.'); return; }
    u.mp -= sk.mp;
    if (sk.kind === 'magic') {
      const dmg = Math.max(10, Math.round(sk.power + u.ji * 2.4 - target.ji * 0.6));
      target.hp = Math.max(0, target.hp - dmg);
      addFloat((x + 0.5) * TILE, (y + 0.4) * TILE, '화계 ' + dmg, '#ffb36a');
      addFx({ kind: 'fire', x: (x + 0.5) * TILE, y: (y + 0.55) * TILE, life: 700 });
      if (target.hp <= 0) target.alive = false;
      finish(650);
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
    const hits = sk.hits || 1;
    const apply = (n) => {
      attackUnit(u, target, { mult, ignoreTerrain: sk.ignoreTerrain, ranged: true });
      if (n > 1 && target.alive) setTimeout(() => { if (target.alive) apply(n - 1); }, 220);
    };
    apply(hits);
    addFloat((x + 0.5) * TILE, (y + 0.15) * TILE, sk.name, '#ffe6a8');
    finish(650 + hits * 200);
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
    SK.modal({
      title: `${t.name}`,
      body: `<div class="battle-info">
        <img src="assets/portraits/v2/${t.portrait}.webp" alt="">
        <div class="bi-main">
          <p class="bi-cls">${C.name} · Lv.${t.lv} ${t.boss ? '· 적장' : ''}${t.tier ? ` · ${t.tier}급` : ''}</p>${t.skillName ? `<p class="bi-skill">특기 — ${t.skillName}</p>` : ''}
          <div class="bi-hp"><i style="width:${Math.round(t.hp / t.maxHp * 100)}%"></i><span>HP ${t.hp}/${t.maxHp}</span></div>
          <div class="bi-attrs"><span>공 ${Math.round(effAtk(t))}</span><span>방 ${Math.round(effDef(t))}</span><span>이동 ${t.mov}</span><span>사거리 ${effRng(t)}</span></div>
          <p class="bi-terr">지형 ${tr.name} · 방어 ${Math.round(tr.def * 100)}%</p>
        </div>
      </div>`,
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
    const targets = B.units.filter((u) => u.side === 'ally' && u.alive);
    if (!targets.length) { done(); return; }
    let target = targets.reduce((best, t) => {
      const d = cheb(e.x, e.y, t.x, t.y);
      return !best || d < best.d ? { t, d } : best;
    }, null).t;
    const rng = effRng(e);

    // cast a heal on a wounded ally if priest
    if (e.cls === 'pungsusa' && e.mp >= 8) {
      const hurt = B.units.filter((u) => u.side === 'enemy' && u.alive && u.hp < u.maxHp * 0.6)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt && cheb(e.x, e.y, hurt.x, hurt.y) <= 2) {
        e.mp -= 8; hurt.hp = Math.min(hurt.maxHp, hurt.hp + 30);
        addFloat((hurt.x + 0.5) * TILE, (hurt.y + 0.4) * TILE, '+30', '#a8f0b8');
        addFx({ kind: 'heal', x: (hurt.x + 0.5) * TILE, y: (hurt.y + 0.5) * TILE, life: 600 });
        e.acted = true; done(); return;
      }
    }

    // magic if in range
    if ((e.cls === 'chaeksa') && e.mp >= 10 && cheb(e.x, e.y, target.x, target.y) <= rng) {
      e.mp -= 10;
      const dmg = Math.max(6, Math.round(20 + e.ji * 0.18 - target.ji * 0.05));
      target.hp = Math.max(0, target.hp - dmg);
      addFloat((target.x + 0.5) * TILE, (target.y + 0.4) * TILE, '화계 ' + dmg, '#ffb36a');
      addFx({ kind: 'fire', x: (target.x + 0.5) * TILE, y: (target.y + 0.55) * TILE, life: 700 });
      if (target.hp <= 0) target.alive = false;
      e.acted = true;
      finishCheck();
      done();
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
      if (moveTo) {
        const steps = Math.max(Math.abs(moveTo.x - e.x), Math.abs(moveTo.y - e.y));
        if (steps > 0) {
          const from = { x: e.x, y: e.y };
          for (let i = 1; i <= steps; i++) {
            setTimeout(() => {
              e.x = Math.round(from.x + (moveTo.x - from.x) * i / steps);
              e.y = Math.round(from.y + (moveTo.y - from.y) * i / steps);
            }, i * 70);
          }
        }
      }
      setTimeout(() => {
        if (B.over) { done(); return; }
        const dist = cheb(e.x, e.y, target.x, target.y);
        if (dist >= (e.minRng || 1) && dist <= rng) {
          attackUnit(e, target);
          if (target.alive && cheb(target.x, target.y, e.x, e.y) <= effRng(target) && Math.random() < 0.7) {
            setTimeout(() => {
              const r = calcDamage(target, e);
              e.hp = Math.max(0, e.hp - r.dmg);
              addFloat((e.x + 0.5) * TILE, (e.y + 0.4) * TILE, String(r.dmg), '#ffcfae');
              if (e.hp <= 0) e.alive = false;
              finishCheck(); done();
            }, 300);
            return;
          }
        }
        e.acted = true;
        finishCheck();
        done();
      }, 260);
    };
    finishMove();
  }

  /* ───────────── 승패 ───────────── */
  function victory() {
    if (B.over) return;
    B.over = true;
    const s = SK.state;
    const st = s.cities[B.targetId];
    const c = SK.CITY[B.targetId];
    const prevOwner = st.owner;
    const defeatedNames = B.units.filter((u) => u.side === 'enemy').map((u) => u.name);
    const survivors = B.units.filter((u) => u.side === 'ally' && u.alive);
    const troopsLeft = survivors.reduce((sum, u) => sum + u.hp, 0);
    st.owner = 'wei';
    st.genIds = [];
    st.troops = Math.max(1200, Math.round(troopsLeft));
    st.def = Math.max(30, Math.round(st.def * 0.8));
    st.loyalty = 55;
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
    const owned = SK.CITY_LIST.filter((x) => s.cities[x.id].owner === 'wei').length;
    SK.modal({
      kicker: '勝',
      title: `${c.name} 함락`,
      body: `<div class="result-modal win">
        <div class="rm-seal">勝</div>
        <p class="rm-line">${SK.FACTIONS[prevOwner].name}군을 무찌르고 <b>${c.name}</b>을(를) 차지했습니다.</p>
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
        <div class="rm-survivors">${survivors.map((u) => `<img src="assets/portraits/v2/${u.portrait}.webp" title="${u.name}">`).join('')}</div>
        ${B.event ? `<p class="rm-event">특별 이벤트 — ${B.event.title} · 명성 +5</p>` : ''}
        <p class="rm-note">${owned >= 76 ? '천하가 하나로 모였습니다!' : '다음 성으로 나아가십시오.'}</p>
      </div>`,
      actions: [{ label: '지도로', primary: true, onClick: () => { closeBattle(); SK.showMap(); } }],
      dismissible: false,
    });
  }

  function defeat() {
    if (B.over) return;
    B.over = true;
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
      kicker: '敗',
      title: '퇴각',
      body: `<div class="result-modal lose"><div class="rm-seal">敗</div>
        <p class="rm-line">적의 방어가 완강했습니다. 병력을 정비하고 다시 도전하십시오.</p>
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
          <div class="ev-seal">緣</div>
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
        <img class="ic-portrait" src="assets/portraits/v2/${L.pt}.webp" alt="">
        <div class="ic-box">
          <div class="ic-name">${L.who} <em>${L.hanja || ''}</em></div>
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
      $('#count-ally').textContent = allies.length;
      $('#count-enemy').textContent = enemies.length;
      const aMax = Math.max(1, B.units.filter((u) => u.side === 'ally').length);
      const eMax = Math.max(1, B.units.filter((u) => u.side === 'enemy').length);
      $('#bar-ally').style.width = Math.round(allies.length / aMax * 100) + '%';
      $('#bar-enemy').style.width = Math.round(enemies.length / eMax * 100) + '%';
      const u = B.sel;
      const card = $('#unit-card');
      if (u) {
        card.classList.add('on');
        $('#uc-img').src = `assets/portraits/v2/${u.portrait}.webp`;
        $('#uc-lv').textContent = 'Lv.' + u.lv;
        $('#uc-name').textContent = u.name;
        $('#uc-cls').textContent = SK.CLASSES[u.cls].name;
        const tr = SK.TERRAIN[B.tiles[u.y][u.x]];
        $('#uc-terrain').textContent = tr.name + (tr.def ? ` 방어+${Math.round(tr.def * 100)}%` : '') + (SK.affinity(u.cls, B.tiles[u.y][u.x]).label ? ` · ${SK.affinity(u.cls, B.tiles[u.y][u.x]).label}` : '') + (typeBonus(u) ? ` · ${B.def.name} ${typeBonus(u) > 0 ? '+' : ''}${Math.round(typeBonus(u) * 100)}%` : '');
        $('#uc-hp').style.width = Math.round(u.hp / u.maxHp * 100) + '%';
        $('#uc-hp-txt').textContent = `${Math.round(u.hp).toLocaleString('ko-KR')} / ${Math.round(u.maxHp).toLocaleString('ko-KR')}`;
        $('#uc-mp').style.width = Math.round(u.mp / u.maxMp * 100) + '%';
        $('#uc-mp-txt').textContent = `${u.mp}/${u.maxMp}`;
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
        $('#uc-atk').textContent = '-'; $('#uc-def').textContent = '-';
        $('#uc-mov').textContent = '-'; $('#uc-rng').textContent = '-';
      }
      document.querySelectorAll('.act').forEach((b) => {
        if (b.dataset.act === 'attack') b.classList.toggle('active', mode === 'attack');
        if (b.dataset.act === 'skill') b.classList.toggle('active', mode === 'skillTarget');
      });
    },
    endTurn,
    retreat,
    debug: {
      get battle() { return B; },
      tap(x, y) { onTileTap(x, y); },
      endTurn,
      openSkillMenu,
      beginSkill,
      hurtEnemies(n) { B.units.filter((u) => u.side === 'enemy').forEach((u) => { u.hp = n; if (n <= 0) u.alive = false; }); },
      finish() { finishCheck(); },
      closeBattle,
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
