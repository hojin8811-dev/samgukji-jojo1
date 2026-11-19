/* ══════════════════════════════════════════════════════════════
   1단계 · 천하 지도 (v4) — 코에이풍 벡터 지도 + 캔버스 카메라
   · 지형 textures: js/mapgeo.js (Natural Earth 50m 해안선·하천·산맥)
   · 거점 이름은 어떤 배율에서도 전부 보인다 (화면 좌표 DOM 라벨)
   · 팬·핀치·관성은 rAF로 한 프레임에 한 번만 반영
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK;
  const $ = (s) => document.querySelector(s);
  const MAPW = 2000, MAPH = 1333;
  const MAX_SCALE = 4.6;
  const ICON_H = { capital: 46, town: 32, pass: 30, fortress: 30 };
  const ICON_SRC = { capital: 'capital', town: 'town', pass: 'pass', fortress: 'fortress' };

  const cam = { s: 1, tx: 0, ty: 0 };
  let vp = null, layer = null, canvas = null, cx = null, markersEl = null;
  let built = false;
  let marks = [];
  let renderScale = 0, renderTimer = 0, pendingFocus = null;
  let rafId = 0, dirty = false;
  let labelAnchorDirty = true;

  /* 캐시 — world 좌표계 */
  let landPath = null, lakePath = null, roadPath = null, seaPath = null;
  let peaks = [], trees = [], riverPaths = [], seaDashes = [];
  let paperPattern = null;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function city(id) { return SK.CITY[id]; }
  function st(id) { return SK.state.cities[id]; }
  function playerFaction() { return (SK.state && SK.state.playerFaction) || 'wei'; }

  /* ───────────── 지형 자산 만들기 ───────────── */
  function sign(n) { return n < 0 ? -1 : 1; }

  function pt(flat, i) { return [flat[i * 2], flat[i * 2 + 1]]; }

  function ringPath(p2, flat) {
    const n = flat.length / 2;
    p2.moveTo(flat[0], flat[1]);
    for (let i = 1; i < n; i++) p2.lineTo(flat[i * 2], flat[i * 2 + 1]);
    p2.closePath();
  }

  function riverPath(flat) {
    const p = new Path2D();
    const n = flat.length / 2;
    p.moveTo(flat[0], flat[1]);
    for (let i = 1; i < n; i++) p.lineTo(flat[i * 2], flat[i * 2 + 1]);
    return p;
  }

  function buildStatic() {
    const G = SK.MAPGEO;
    landPath = new Path2D();
    G.land.forEach((r) => ringPath(landPath, r));
    lakePath = new Path2D();
    G.lakes.forEach((r) => ringPath(lakePath, r));
    riverPaths = G.rivers.map((r) => riverPath(r.p));

    /* 산맥 — 봉우리 삼각형 배치 */
    peaks = [];
    (G.mountains || []).forEach((m) => {
      const flat = m.p;
      const n = flat.length / 2;
      let carry = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = pt(flat, i), b = pt(flat, i + 1);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const step = 17;
        let d = carry;
        while (d < len) {
          const t = d / len;
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t;
          const jx = Math.sin((i + 1) * 2.7 + d * 0.21) * 5;
          const jy = Math.cos((i + 1) * 1.9 + d * 0.17) * 4;
          const s = 0.78 + 0.5 * Math.abs(Math.sin((i + 2) * 1.3 + d * 0.09));
          peaks.push({ x: x + jx, y: y + jy, w: 21 * s, h: 24 * s });
          d += step * (0.85 + 0.4 * Math.abs(Math.cos(d * 0.13)));
        }
        carry = d - len;
      }
    });

    /* 숲 — 초록 계열 색조 안쪽에만 나무를 흩뿌린다 */
    trees = [];
    (G.tints || []).forEach(([x, y, r, color], ti) => {
      const h = color.replace('#', '');
      const rr = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), bb = parseInt(h.slice(4, 6), 16);
      if (!(gg > rr + 6 && gg > bb + 6)) return;
      let seed = 1337 + ti * 977;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const n = Math.round(r * r / 900);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * r * 0.92;
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d * 0.9;
        if (!cx.isPointInPath(landPath, px, py)) continue;
        trees.push({ x: px, y: py, s: 0.8 + rnd() * 0.7 });
      }
    });

    /* 길 · 해로 */
    roadPath = new Path2D();
    seaPath = new Path2D();
    SK.ROADS.forEach(([a, b]) => {
      const A = city(a), B = city(b);
      if (!A || !B) return;
      const ax = A.u * MAPW, ay = A.v * MAPH, bx = B.u * MAPW, by = B.v * MAPH;
      const mx = (ax + bx) / 2 + (by - ay) * -0.045;
      const my = (ay + by) / 2 + (bx - ax) * 0.045;
      roadPath.moveTo(ax, ay);
      roadPath.quadraticCurveTo(mx, my, bx, by);
    });
    SK.SEALANES.forEach(([a, b]) => {
      const A = city(a), B = city(b);
      if (!A || !B) return;
      const ax = A.u * MAPW, ay = A.v * MAPH, bx = B.u * MAPW, by = B.v * MAPH;
      const mx = (ax + bx) / 2 + (by - ay) * 0.2;
      const my = (ay + by) / 2 + (bx - ax) * 0.2;
      seaPath.moveTo(ax, ay);
      seaPath.quadraticCurveTo(mx, my, bx, by);
    });

    /* 종이 질감 타일 */
    const tp = document.createElement('canvas');
    tp.width = tp.height = 128;
    const tc = tp.getContext('2d');
    const img = tc.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random();
      img.data[i] = 250; img.data[i + 1] = 244; img.data[i + 2] = 226;
      img.data[i + 3] = v > 0.72 ? 26 : v < 0.2 ? 16 : 4;
    }
    tc.putImageData(img, 0, 0);
    paperPattern = cx.createPattern(tp, 'repeat');
  }

  /* ───────────── 지형 그리기 ───────────── */
  function renderTerrain(R) {
    if (!canvas || !SK.MAPGEO) return;
    R = clamp(R, 0.8, 1.9);
    const cw = Math.round(MAPW * R), ch = Math.round(MAPH * R);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const g = cx;
    g.setTransform(R, 0, 0, R, 0, 0);
    g.clearRect(0, 0, MAPW, MAPH);

    /* 바다 */
    const seaGrad = g.createLinearGradient(0, 0, MAPW * 0.3, MAPH);
    seaGrad.addColorStop(0, '#5b8fa1');
    seaGrad.addColorStop(0.42, '#487f93');
    seaGrad.addColorStop(1, '#2f5d72');
    g.fillStyle = seaGrad;
    g.fillRect(0, 0, MAPW, MAPH);

    /* 얕은 바다 띠 — 해안을 따라 밝은 테두리 */
    g.lineJoin = 'round';
    [-30, -18, -9].forEach((w, i) => {
      g.strokeStyle = ['rgba(150,196,198,0.20)', 'rgba(163,207,205,0.28)', 'rgba(180,219,214,0.34)'][i];
      g.lineWidth = Math.abs(w) * 2;
      g.stroke(landPath);
    });

    /* 육지 */
    const landGrad = g.createLinearGradient(0, 0, MAPW * 0.2, MAPH);
    landGrad.addColorStop(0, '#c9c689');
    landGrad.addColorStop(0.4, '#c3c184');
    landGrad.addColorStop(0.72, '#b9bb7c');
    landGrad.addColorStop(1, '#a9b273');
    g.fillStyle = landGrad;
    g.fill(landPath);

    g.save();
    g.clip(landPath);

    /* 지형 색조 — 경계가 드러나지 않게 부드럽게 */
    (SK.MAPGEO.tints || []).forEach(([x, y, r, color, a]) => {
      const rg = g.createRadialGradient(x, y, r * 0.05, x, y, r);
      rg.addColorStop(0, rgba(color, a));
      rg.addColorStop(0.45, rgba(color, a * 0.72));
      rg.addColorStop(0.75, rgba(color, a * 0.3));
      rg.addColorStop(1, rgba(color, 0));
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    });

    /* 숲 */
    trees.forEach((t) => {
      const w = 5.2 * t.s, hh = 7.4 * t.s;
      g.fillStyle = '#6e8a4e';
      g.beginPath();
      g.moveTo(t.x - w, t.y);
      g.lineTo(t.x, t.y - hh);
      g.lineTo(t.x + w, t.y);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(58,78,42,0.55)';
      g.beginPath();
      g.moveTo(t.x, t.y - hh);
      g.lineTo(t.x + w, t.y);
      g.lineTo(t.x + w * 0.3, t.y);
      g.closePath();
      g.fill();
    });

    /* 산맥 */
    peaks.forEach((p) => {
      const { x, y, w, h } = p;
      g.beginPath();
      g.moveTo(x - w / 2, y);
      g.lineTo(x - w * 0.08, y - h);
      g.lineTo(x + w / 2, y);
      g.closePath();
      g.fillStyle = '#9aa37b';
      g.fill();
      g.beginPath();
      g.moveTo(x + w / 2, y);
      g.lineTo(x - w * 0.08, y - h);
      g.lineTo(x + w * 0.12, y);
      g.closePath();
      g.fillStyle = '#7d8a68';
      g.fill();
      g.beginPath();
      g.moveTo(x - w * 0.08, y - h);
      g.lineTo(x - w * 0.26, y - h * 0.45);
      g.lineTo(x + w * 0.08, y - h * 0.5);
      g.closePath();
      g.fillStyle = '#e6e3c0';
      g.globalAlpha = 0.85;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(84,86,54,0.5)';
      g.lineWidth = 0.9;
      g.stroke();
    });

    /* 강 */
    riverPaths.forEach((p) => {
      g.strokeStyle = 'rgba(52,88,110,0.30)';
      g.lineWidth = 5.6;
      g.stroke(p);
      g.strokeStyle = '#79b4c8';
      g.lineWidth = 3.1;
      g.stroke(p);
      g.strokeStyle = 'rgba(190,228,236,0.75)';
      g.lineWidth = 0.9;
      g.stroke(p);
    });

    /* 호수 */
    g.fillStyle = '#5e93a6';
    g.fill(lakePath);
    g.strokeStyle = 'rgba(46,86,104,0.55)';
    g.lineWidth = 1.2;
    g.stroke(lakePath);

    /* 해변 모래톱 */
    g.save();
    g.strokeStyle = 'rgba(246, 238, 200, 0.55)';
    g.lineWidth = 9;
    g.stroke(landPath);
    g.restore();

    /* 종이 질감 */
    if (paperPattern) {
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = 0.55;
      g.fillStyle = paperPattern;
      g.fillRect(0, 0, MAPW, MAPH);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    /* 해안선 */
    g.strokeStyle = 'rgba(92,88,50,0.85)';
    g.lineWidth = 2.2;
    g.stroke(landPath);
    g.strokeStyle = 'rgba(246,240,205,0.55)';
    g.lineWidth = 1.1;
    g.stroke(landPath);
    g.restore();

    /* 섬 테두리 */
    g.strokeStyle = 'rgba(246,240,205,0.35)';
    g.lineWidth = 1;
    g.stroke(lakePath);

    /* 길 — 금빛 점선 */
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(92,72,30,0.34)';
    g.lineWidth = 4.2;
    g.stroke(roadPath);
    g.setLineDash([7, 6]);
    g.strokeStyle = 'rgba(238,199,110,0.95)';
    g.lineWidth = 2.1;
    g.stroke(roadPath);
    g.setLineDash([]);

    /* 해로 */
    g.setLineDash([5, 8]);
    g.strokeStyle = 'rgba(215,240,246,0.75)';
    g.lineWidth = 2;
    g.stroke(seaPath);
    g.setLineDash([]);

    renderScale = R;
    canvas.style.opacity = 1;
  }

  /* ───────────── 카메라 ───────────── */
  function viewSize() {
    const r = vp.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  function fitScale() {
    const { w, h } = viewSize();
    return Math.min(w / MAPW, h / MAPH);
  }
  function minScale() { return fitScale() * 0.96; }

  function clampCam() {
    const { w, h } = viewSize();
    const sw = MAPW * cam.s, sh = MAPH * cam.s;
    cam.s = clamp(cam.s, minScale(), MAX_SCALE);
    const padX = Math.min(90, w * 0.22), padY = Math.min(90, h * 0.22);
    if (sw <= w) cam.tx = (w - sw) / 2;
    else cam.tx = clamp(cam.tx, w - sw - padX, padX);
    if (sh <= h) cam.ty = (h - sh) / 2;
    else cam.ty = clamp(cam.ty, h - sh - padY, padY);
  }

  function apply() {
    layer.style.transform = `translate3d(${cam.tx}px, ${cam.ty}px, 0) scale(${cam.s})`;
    placeMarks();
    scheduleRender();
  }

  function requestApply() {
    if (dirty) return;
    dirty = true;
    rafId = requestAnimationFrame(() => { dirty = false; apply(); });
  }

  /* 지형을 다시 그릴 배율 — 눈에 띄게 흐려질 때만 */
  function scheduleRender() {
    const want = clamp((window.devicePixelRatio || 1) * cam.s, 0.9, 1.9);
    if (renderScale && Math.abs(want - renderScale) / renderScale < 0.22) return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      renderTerrain(clamp((window.devicePixelRatio || 1) * cam.s, 0.9, 1.9));
    }, 110);
  }

  function centerOn(lx, ly, s) {
    const { w, h } = viewSize();
    if (s) cam.s = s;
    cam.s = clamp(cam.s, minScale(), MAX_SCALE);
    cam.tx = w / 2 - lx * cam.s;
    cam.ty = h / 2 - ly * cam.s;
    clampCam();
    requestApply();
  }

  function focusCity(id, keepScale) {
    const c = city(id);
    if (!c) return;
    labelAnchorDirty = true;
    centerOn(c.u * MAPW, c.v * MAPH, keepScale ? cam.s : Math.max(cam.s, 1.0));
  }

  function resetCamera() {
    if (!built || !SK.state) return;
    const s = SK.state;
    const home = city(s.lastCity || 'xuchang') || SK.CITY_LIST[0];
    labelAnchorDirty = true;
    centerOn(home.u * MAPW, home.v * MAPH, Math.max(fitScale() * 1.5, 0.95));
  }

  function fitAll() {
    cam.s = fitScale() * 0.99;
    const { w, h } = viewSize();
    cam.tx = (w - MAPW * cam.s) / 2;
    cam.ty = (h - MAPH * cam.s) / 2;
    labelAnchorDirty = true;
    requestApply();
  }

  function animatedZoom(ns, fx, fy) {
    const { w, h } = viewSize();
    if (fx == null) { fx = w / 2; fy = h / 2; }
    const s0 = cam.s, s1 = clamp(ns, minScale(), MAX_SCALE);
    if (Math.abs(s1 - s0) < 1e-4) return;
    const t0 = performance.now(), dur = 190;
    const wx = (fx - cam.tx) / s0, wy = (fy - cam.ty) / s0;
    stopInertia();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      cam.s = s0 + (s1 - s0) * e;
      cam.tx = fx - wx * cam.s;
      cam.ty = fy - wy * cam.s;
      clampCam();
      apply();
      labelAnchorDirty = true;
      if (t < 1) requestAnimationFrame(step);
      else { labelAnchorDirty = true; apply(); }
    };
    requestAnimationFrame(step);
  }

  function setZoom(ns, fx, fy) {
    const { w, h } = viewSize();
    if (fx == null) { fx = w / 2; fy = h / 2; }
    const k = clamp(ns, minScale(), MAX_SCALE) / cam.s;
    cam.tx = fx - (fx - cam.tx) * k;
    cam.ty = fy - (fy - cam.ty) * k;
    cam.s *= k;
    clampCam();
    labelAnchorDirty = true;
    requestApply();
  }

  /* ───────────── 거점 마커 ───────────── */
  function buildMarkers() {
    markersEl.innerHTML = '';
    marks = SK.CITY_LIST.map((c) => {
      const b = document.createElement('button');
      b.className = `marker t-${c.type}`;
      b.dataset.id = c.id;
      b.innerHTML = `
        <span class="m-flag"><b class="m-lv">1</b></span>
        <img class="m-icon" src="assets/icons/${ICON_SRC[c.type]}.webp" alt="" draggable="false" />
        <span class="m-label">${c.name}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); onMarker(c.id); });
      markersEl.appendChild(b);
      return { id: c.id, el: b, city: c, anchor: 0, lw: 0, lh: 0,
        flagEl: b.querySelector('.m-flag'), labelEl: b.querySelector('.m-label'), lvEl: b.querySelector('.m-lv') };
    });
    labelAnchorDirty = true;
    refresh();
  }

  function iconH(type, s) {
    const base = ICON_H[type] || 32;
    return base * clamp(0.40 + s * 0.62, 0.46, 1.2);
  }

  function placeMarks() {
    if (!marks.length) return;
    const s = cam.s;
    const ih = (type) => iconH(type, s);
    const fs = clamp(7.4 + s * 2.6, 7.6, 13.6);
    markersEl.style.setProperty('--fs', fs.toFixed(1) + 'px');
    if (labelAnchorDirty) { layoutAnchors(fs); labelAnchorDirty = false; }
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const x = cam.tx + m.city.u * MAPW * s;
      const y = cam.ty + m.city.v * MAPH * s;
      m.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      m.el.style.setProperty('--ih', ih(m.city.type).toFixed(1) + 'px');
      m.el.dataset.a = m.anchor;
    }
  }

  /* 라벨 겹침을 줄이는 방향(위/아래/왼쪽/오른쪽) 선택 — 배율이 크게 바뀔 때만 */
  function layoutAnchors(fs) {
    const prio = { capital: 0, pass: 1, fortress: 2, town: 3 };
    const order = marks.slice().sort((a, b) => (prio[a.city.type] - prio[b.city.type]));
    const boxes = [];
    const s = cam.s;
    order.forEach((m) => {
      const x = cam.tx + m.city.u * MAPW * s;
      const y = cam.ty + m.city.v * MAPH * s;
      const ih = iconH(m.city.type, s);
      const w = m.city.name.length * fs * 1.02 + 4;
      const h = fs + 6;
      const cands = [
        { a: 3, r: [x - w / 2, y + 2, w, h] },                        // below
        { a: 2, r: [x - w / 2, y - ih - h - 1, w, h] },               // above
        { a: 0, r: [x + ih * 0.34, y - ih * 0.55 - h / 2, w, h] },    // right
        { a: 1, r: [x - ih * 0.34 - w, y - ih * 0.55 - h / 2, w, h] },// left
      ];
      let best = cands[0], bestScore = 1e9;
      cands.forEach((c) => {
        let score = 0;
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          const ov = Math.max(0, Math.min(c.r[0] + c.r[2], b[0] + b[2]) - Math.max(c.r[0], b[0]))
            * Math.max(0, Math.min(c.r[1] + c.r[3], b[1] + b[3]) - Math.max(c.r[1], b[1]));
          if (ov > 0) score += ov;
        }
        if (score < bestScore) { bestScore = score; best = c; }
      });
      m.anchor = best.a;
      m.lw = w; m.lh = h;
      boxes.push(best.r);
    });
  }

  function onMarker(id) {
    const t = st(id);
    const mine = t.owner === playerFaction();
    if (mine) SK.openCity(id);
    else { SK.openCitySheet(id); focusCity(id, true); }
    marks.forEach((m) => m.el.classList.toggle('sel', m.id === id));
  }

  function refresh() {
    if (!SK.state || !marks.length) return;
    const pf = playerFaction();
    const info = SK.factionInfo || (() => ({ color: '#8d8d8d' }));
    marks.forEach((m) => {
      const t = st(m.id);
      if (!t) return;
      const f = info(t.owner);
      m.el.style.setProperty('--fc', f.color || '#8d8d8d');
      m.el.classList.toggle('mine', t.owner === pf);
      m.el.classList.toggle('enemy', t.owner !== pf);
      m.el.classList.toggle('target', t.owner !== pf && SK.allNeighbors(m.id).some((n) => SK.state.cities[n].owner === pf));
      const name = city(m.id).name;
      const lv = SK.cityLevel ? SK.cityLevel(t) : 1;
      if (m.lvEl && m.lvEl.textContent !== String(lv)) m.lvEl.textContent = String(lv);
      m.el.classList.toggle('lv-hi', lv >= 4);
      m.el.title = `${name} ${lv}급 · ${f.name || ''}`;
    });
    const owned = SK.CITY_LIST.filter((c) => st(c.id).owner === pf).length;
    const hint = $('#map-hint');
    if (hint) {
      const f = info(pf);
      hint.textContent = owned >= SK.CITY_LIST.length
        ? '천하통일! 모든 거점이 내 깃발 아래 있습니다.'
        : `${f.name || ''}의 거점 ${owned} / ${SK.CITY_LIST.length} · 성을 눌러 내정 · 붉은 테두리 적성에서 출진`;
    }
    labelAnchorDirty = true;
    placeMarks();
  }

  /* ───────────── 제스처 ───────────── */
  let pointers = new Map();
  let drag = null, pinch = null, inertia = 0, vx = 0, vy = 0;
  let lastTap = { t: 0, x: 0, y: 0 };

  function stopInertia() { if (inertia) { cancelAnimationFrame(inertia); inertia = 0; } }

  function startInertia() {
    if (Math.abs(vx) < 0.6 && Math.abs(vy) < 0.6) return;
    stopInertia();
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(48, now - last) / 16.67;
      last = now;
      cam.tx += vx * dt;
      cam.ty += vy * dt;
      const f = Math.pow(0.9, dt);
      vx *= f; vy *= f;
      clampCam();
      apply();
      if (Math.abs(vx) > 0.35 || Math.abs(vy) > 0.35) inertia = requestAnimationFrame(step);
      else { inertia = 0; labelAnchorDirty = true; }
    };
    inertia = requestAnimationFrame(step);
  }

  function bindGestures() {
    vp.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.map-controls') || e.target.closest('.map-legend')) return;
      stopInertia();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (pointers.size === 1) {
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: cam.tx, ly: cam.ty,
          px: e.clientX, py: e.clientY, t: performance.now(), moved: 0, vx: 0, vy: 0 };
        vx = vy = 0;
      } else if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), s: cam.s, moved: true };
        drag = null;
      }
    });

    vp.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2 && pinch) {
        const pts = Array.from(pointers.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinch.d < 1) return;
        const r = vp.getBoundingClientRect();
        const fx = (pts[0].x + pts[1].x) / 2 - r.left;
        const fy = (pts[0].y + pts[1].y) / 2 - r.top;
        setZoom(pinch.s * (d / pinch.d), fx, fy);
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      const now = performance.now();
      const dt = Math.max(8, now - drag.t);
      const ivx = (e.clientX - drag.px) / dt * 16.67;
      const ivy = (e.clientY - drag.py) / dt * 16.67;
      drag.vx = drag.vx * 0.4 + ivx * 0.6;
      drag.vy = drag.vy * 0.4 + ivy * 0.6;
      drag.px = e.clientX; drag.py = e.clientY; drag.t = now;
      cam.tx = drag.lx + dx;
      cam.ty = drag.ly + dy;
      vx = drag.vx; vy = drag.vy;
      clampCam();
      requestApply();
    });

    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (drag && drag.id === e.pointerId) {
          if (drag.moved < 8) {
            const now = performance.now();
            const isDouble = now - lastTap.t < 300 && Math.abs(e.clientX - lastTap.x) < 40 && Math.abs(e.clientY - lastTap.y) < 40;
            lastTap = { t: now, x: e.clientX, y: e.clientY };
            if (isDouble) {
              const r = vp.getBoundingClientRect();
              animatedZoom(cam.s * 1.9, e.clientX - r.left, e.clientY - r.top);
            } else {
              const sheet = $('#city-sheet');
              if (sheet && !sheet.hidden) SK.closeCitySheet();
              marks.forEach((m) => m.el.classList.remove('sel'));
            }
          } else {
            startInertia();
          }
        }
        drag = null;
      }
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      const k = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      setZoom(cam.s * k, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    $('#zoom-in').onclick = () => animatedZoom(cam.s * 1.5);
    $('#zoom-out').onclick = () => animatedZoom(cam.s / 1.5);
    $('#zoom-fit').onclick = fitAll;
    $('#go-capital').onclick = () => { labelAnchorDirty = true; focusCity(SK.state.lastCity || 'xuchang', false); };
    window.addEventListener('resize', () => {
      if (!built) return;
      clampCam();
      apply();
      renderScale = 0;
      scheduleRender();
    });
  }

  /* ───────────── 공개 API ───────────── */
  function build() {
    vp = $('#world-viewport');
    layer = $('#world-layer');
    markersEl = $('#city-markers');
    canvas = $('#map-terrain');
    if (!vp || !layer || !canvas) { console.warn('지도 요소를 찾지 못했습니다.'); return; }
    cx = canvas.getContext('2d');
    canvas.style.width = MAPW + 'px';
    canvas.style.height = MAPH + 'px';
    buildStatic();
    renderTerrain(1.25);
    buildMarkers();
    bindGestures();
    built = true;
    resetCamera();
  }

  window.SKMap = {
    init() { if (!SK.state || !SK.MAPGEO) return; if (!built) build(); else refresh(); },
    refresh,
    resetCamera,
    focusCity,
    fitAll,
    zoomIn() { animatedZoom(cam.s * 1.4); },
    zoomOut() { animatedZoom(cam.s / 1.4); },
    get scale() { return cam.s; },
    relayout() { if (!built) return; if (!vp.getBoundingClientRect().width) return; clampCam(); apply(); },
    open(id) { onMarker(id); },
    /* 테스트/검증용 */
    debug() {
      return {
        built, scale: cam.s, tx: cam.tx, ty: cam.ty, marks: marks.length,
        renderScale, labelCount: document.querySelectorAll('.m-label').length, trees: trees.length, peaks: peaks.length,
      };
    },
    cityScreenPos(id) {
      const c = city(id);
      return { x: cam.tx + c.u * MAPW * cam.s, y: cam.ty + c.v * MAPH * cam.s };
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { window.SKMap.init(); } catch (e) { console.error(e); } }, 60);
  });
})();
