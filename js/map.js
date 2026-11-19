/* ══════════════════════════════════════════════════════════════
   1단계 · 천하 지도 — 팬/줌, 76거점 마커, 도로
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK;
  const $ = (s) => document.querySelector(s);
  const MAPW = 2000, MAPH = 1333;
  const PLAYER = 'wei';
  const ICON = { capital: 'capital', town: 'town', pass: 'pass', fortress: 'fortress' };
  const ICON_H = { capital: 46, town: 30, pass: 28, fortress: 28 };

  const cam = { s: 0.95, tx: 0, ty: 0 };
  let vp = null, layer = null, markersEl = null;
  let built = false;
  const pointers = new Map();
  let drag = { on: false, moved: 0, sx: 0, sy: 0, lx: 0, ly: 0 };
  let pinch = null;
  let inertia = null;

  function city(id) { return SK.CITY[id]; }
  function st(id) { return SK.state.cities[id]; }

  function build() {
    vp = $('#world-viewport');
    layer = $('#world-layer');
    markersEl = $('#city-markers');
    buildRoads();
    buildMarkers();
    bindCamera();
    built = true;
    resetCamera();
  }

  function buildRoads() {
    const svg = $('#roads-svg');
    const NS = 'http://www.w3.org/2000/svg';
    svg.innerHTML = '';
    const mk = (pts, cls, dash) => {
      const p = document.createElementNS(NS, 'polyline');
      p.setAttribute('points', pts);
      p.setAttribute('class', cls);
      if (dash) p.setAttribute('stroke-dasharray', dash);
      svg.appendChild(p);
    };
    SK.ROADS.forEach(([a, b]) => {
      const A = city(a), B = city(b);
      if (!A || !B) return;
      const ax = A.u * MAPW, ay = A.v * MAPH, bx = B.u * MAPW, by = B.v * MAPH;
      const mx = (ax + bx) / 2 + (by - ay) * -0.028;
      const my = (ay + by) / 2 + (bx - ax) * 0.028;
      const pts = `${ax},${ay} ${mx},${my} ${bx},${by}`;
      mk(pts, 'road-under');
      mk(pts, 'road-line');
    });
    SK.SEALANES.forEach(([a, b]) => {
      const A = city(a), B = city(b);
      if (!A || !B) return;
      const ax = A.u * MAPW, ay = A.v * MAPH, bx = B.u * MAPW, by = B.v * MAPH;
      const mx = (ax + bx) / 2 + (by - ay) * 0.14;
      const my = (ay + by) / 2 + (bx - ax) * 0.14;
      mk(`${ax},${ay} ${mx},${my} ${bx},${by}`, 'sea-lane', '7 8');
    });
  }

  function buildMarkers() {
    markersEl.innerHTML = '';
    SK.CITY_LIST.forEach((c) => {
      const b = document.createElement('button');
      b.className = `marker t-${c.type}`;
      b.dataset.id = c.id;
      b.style.left = (c.u * MAPW) + 'px';
      b.style.top = (c.v * MAPH) + 'px';
      b.innerHTML = `
        <span class="m-flag"></span>
        <img class="m-icon" src="assets/icons/${ICON[c.type]}.webp" alt="" draggable="false" style="height:${ICON_H[c.type]}px" />
        <span class="m-label">${c.name}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onMarker(c.id);
      });
      markersEl.appendChild(b);
    });
    refresh();
  }

  function onMarker(id) {
    const s = SK.state;
    const t = s.cities[id];
    const c = city(id);
    if (t.owner === PLAYER) {
      SK.openCity(id);          // 내 성 → 바로 내정 화면
    } else {
      SK.openCitySheet(id);     // 적성 → 정보 시트 (출진)
      focusCity(id, true);
    }
    $$markers().forEach((m) => m.classList.toggle('sel', m.dataset.id === id));
  }
  function $$markers() { return Array.from(markersEl.children); }

  function refresh() {
    if (!SK.state) return;
    const s = SK.state;
    const owned = SK.CITY_LIST.filter((c) => s.cities[c.id].owner === PLAYER).length;
    markersEl.classList.toggle('labels-all', cam.s >= 1.02);
    layer.classList.toggle('zoomed-out', cam.s < 0.72);
    $$markers().forEach((m) => {
      const c = city(m.dataset.id);
      const t = s.cities[m.dataset.id];
      const f = SK.FACTIONS[t.owner];
      m.style.setProperty('--fc', f.color);
      m.classList.toggle('mine', t.owner === PLAYER);
      m.classList.toggle('enemy', t.owner !== PLAYER);
      m.classList.toggle('target', t.owner !== PLAYER && SK.allNeighbors(c.id).some((n) => s.cities[n].owner === PLAYER));
      m.title = `${c.name} · ${f.name}`;
    });
    const hint = $('#map-hint');
    if (hint) hint.textContent = owned >= SK.CITY_LIST.length ? '천하통일! 모든 거점이 위의 깃발 아래 있습니다.' :
      `위의 거점 ${owned} / ${SK.CITY_LIST.length} · 성을 눌러 내정 · 붉은 테두리 적성에서 출진`;
  }

  /* ─────────── 카메라 ─────────── */
  function viewSize() {
    const r = vp.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  function apply() {
    layer.style.transform = `translate3d(${cam.tx}px, ${cam.ty}px, 0) scale(${cam.s})`;
    markersEl.style.setProperty('--inv', (1 / Math.max(cam.s, 0.95)).toFixed(4));
    if (markersEl) {
      markersEl.classList.toggle('labels-all', cam.s >= 1.02);
      markersEl.classList.toggle('mid', cam.s >= 0.8 && cam.s < 1.15);
    }
  }
  function clampCam() {
    const { w, h } = viewSize();
    const sw = MAPW * cam.s, sh = MAPH * cam.s;
    const mX = Math.min(140, w * 0.5), mY = Math.min(140, h * 0.5);
    cam.tx = Math.min(w - mX * 0.4, Math.max(w - sw + mX * 0.4 - (w - mX), cam.tx));
    // simple bounds: keep at least a quarter screen of map inside
    const minTx = w - sw - 80, maxTx = 80;
    const minTy = h - sh - 80, maxTy = 80;
    cam.tx = Math.min(maxTx, Math.max(minTx, cam.tx));
    cam.ty = Math.min(maxTy, Math.max(minTy, cam.ty));
  }
  function stopInertia() {
    if (inertia) { cancelAnimationFrame(inertia); inertia = null; }
  }

  /* 지도를 손으로 튕기면 관성으로 미끄러진다 */
  function startInertia(vx, vy) {
    if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) return;
    stopInertia();
    const step = () => {
      cam.tx += vx; cam.ty += vy;
      vx *= 0.92; vy *= 0.92;
      clampCam(); apply();
      if (Math.abs(vx) > 0.3 || Math.abs(vy) > 0.3) inertia = requestAnimationFrame(step);
      else inertia = null;
    };
    inertia = requestAnimationFrame(step);
  }

  function setZoom(ns, fx, fy) {
    const { w, h } = viewSize();
    ns = Math.min(3.2, Math.max(fitScale() * 0.92, ns));
    if (fx == null) { fx = w / 2; fy = h / 2; }
    const k = ns / cam.s;
    cam.tx = fx - (fx - cam.tx) * k;
    cam.ty = fy - (fy - cam.ty) * k;
    cam.s = ns;
    clampCam(); apply(); refreshLabelsOnly();
  }
  function refreshLabelsOnly() {
    markersEl.style.setProperty('--inv', (1 / Math.max(cam.s, 0.95)).toFixed(4));
    markersEl.classList.toggle('labels-all', cam.s >= 1.02);
    markersEl.classList.toggle('mid', cam.s >= 0.8 && cam.s < 1.15);
  }
  function fitScale() {
    const { w, h } = viewSize();
    return Math.min(w / MAPW, h / MAPH);
  }
  function centerOn(lx, ly, scale) {
    const { w, h } = viewSize();
    if (scale) cam.s = Math.min(3.2, Math.max(fitScale() * 0.92, scale));
    cam.tx = w / 2 - lx * cam.s;
    cam.ty = h / 2 - ly * cam.s;
    clampCam(); apply(); refreshLabelsOnly();
  }
  function focusCity(id, keepScale) {
    const c = city(id);
    centerOn(c.u * MAPW, c.v * MAPH, keepScale ? cam.s : Math.max(cam.s, 1.05));
  }

  function resetCamera() {
    if (!built || !SK.state) return;
    const s = SK.state;
    const home = city(s.lastCity || 'xuchang');
    cam.s = Math.max(fitScale() * 1.35, 0.95);
    centerOn(home.u * MAPW, home.v * MAPH, cam.s);
  }
  function fitAll() {
    cam.s = fitScale();
    const { w, h } = viewSize();
    cam.tx = (w - MAPW * cam.s) / 2;
    cam.ty = (h - MAPH * cam.s) / 2;
    apply(); refreshLabelsOnly();
  }

  /* ─────────── 제스처 ─────────── */
  function bindCamera() {
    vp.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.marker') || e.target.closest('.map-controls')) return;
      vp.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        stopInertia();
        drag = { on: true, moved: 0, sx: e.clientX, sy: e.clientY, lx: cam.tx, ly: cam.ty,
          px: e.clientX, py: e.clientY, pt: e.timeStamp || performance.now(), vx: 0, vy: 0 };
      } else if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), s: cam.s,
          mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2 };
        drag.on = false;
      }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const pts = Array.from(pointers.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const r = vp.getBoundingClientRect();
        const fx = (pts[0].x + pts[1].x) / 2 - r.left, fy = (pts[0].y + pts[1].y) / 2 - r.top;
        setZoom(pinch.s * (d / pinch.d), fx, fy);
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
        cam.tx = drag.lx + dx; cam.ty = drag.ly + dy;
        clampCam(); apply();
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (drag.on && drag.moved < 7) {
          const sheet = $('#city-sheet');
          if (sheet && !sheet.hidden) SK.closeCitySheet();
          $$markers().forEach((m) => m.classList.remove('sel'));
        } else if (drag.on) {
          startInertia(drag.vx || 0, drag.vy || 0);
        }
        drag.on = false;
      }
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      setZoom(cam.s * (e.deltaY < 0 ? 1.12 : 0.9), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    $('#zoom-in').onclick = () => setZoom(cam.s * 1.3);
    $('#zoom-out').onclick = () => setZoom(cam.s / 1.3);
    $('#zoom-fit').onclick = fitAll;
    $('#go-capital').onclick = () => focusCity(SK.state.lastCity || 'xuchang', false);
    window.addEventListener('resize', () => { if (built) { clampCam(); apply(); } });
  }

  window.SKMap = {
    init() { if (!SK.state) return; if (!built) build(); else refresh(); },
    refresh,
    resetCamera,
    focusCity,
    fitAll,
    zoomBy(f) { setZoom(cam.s * f); },
    zoomIn() { setZoom(cam.s * 1.25); },
    zoomOut() { setZoom(cam.s / 1.25); },
    get scale() { return cam.s; },
    relayout() { if (!built || !SK.state) return; if (!vp || !vp.getBoundingClientRect().width) return; clampCam(); apply(); },
    open(id) { onMarker(id); },
  };

  document.addEventListener('DOMContentLoaded', () => {
    // wait one tick for #screen-map to be laid out
    setTimeout(() => { try { window.SKMap.init(); } catch (e) { console.error(e); } }, 60);
  });
})();
