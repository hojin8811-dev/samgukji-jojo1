/* ══════════════════════════════════════════════════════════════
   천하 지도 (v5.0.2) — 코에이풍 입체 지형 + 세력 영토 + 소형 성 아이콘
   · 지형: js/mapgeo.js (Natural Earth 50m 해안선·하천·산맥)
   · 레이어 3장 — 지형(map-terrain) / 세력 영토(map-territory) / 길(map-routes)
   · 거점 이름은 화면 좌표 DOM 라벨, 서로 겹치면 우선순위가 낮은 쪽을 잠시 감춘다
   · 팬·핀치·관성은 rAF로 한 프레임에 한 번만 반영
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK;
  const $ = (s) => document.querySelector(s);
  const MAPW = 2000, MAPH = 1333;
  const MAX_SCALE = 4.6;
  /* 아이콘 — 예전 성 그림(높이 46/32/30/30)보다 훨씬 작고 단단한 소형 성 */
  const ICON_H = { capital: 30, town: 22, pass: 21, fortress: 21 };
  const ICON_ASPECT = { capital: 1.62, town: 1.42, pass: 1.58, fortress: 1.18 };
  const ICON_SRC = { capital: 'capital', town: 'town', pass: 'pass', fortress: 'fortress' };
  const TERR_SCALE = 1.25;
  const GRID_W = 800;                       /* 영토 계산 격자 */
  const GRID_H = Math.round(GRID_W * MAPH / MAPW);

  const cam = { s: 1, tx: 0, ty: 0 };
  let vp = null, layer = null, canvas = null, cx = null;
  let terrCanvas = null, tcx = null, featCanvas = null, fcx = null, routeCanvas = null, rcx = null;
  let markersEl = null;
  let built = false;
  let marks = [];
  let renderScale = 0, featScale = 0, renderTimer = 0;
  let rafId = 0, dirty = false;
  let labelAnchorDirty = true, labelScale = 0;

  /* 캐시 — world 좌표계 */
  let landPath = null, lakePath = null, roadPath = null, seaPath = null;
  let peaks = [], trees = [], riverPaths = [], riverMain = [], fields = [];
  let paperPattern = null, grainPattern = null;
  let reliefCanvas = null;
  const MAIN_RIVERS = ['Huang', 'Chang Jiang', 'Yangtze', 'Jinsha'];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function shade(hex, k) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const r = Math.round(clamp(((n >> 16) & 255) * k, 0, 255));
    const g = Math.round(clamp(((n >> 8) & 255) * k, 0, 255));
    const b = Math.round(clamp((n & 255) * k, 0, 255));
    return `rgb(${r},${g},${b})`;
  }
  function city(id) { return SK.CITY[id]; }
  function st(id) { return SK.state.cities[id]; }
  function playerFaction() { return (SK.state && SK.state.playerFaction) || 'wei'; }
  function pt(flat, i) { return [flat[i * 2], flat[i * 2 + 1]]; }

  /* ───────────── 잡음 ───────────── */
  function hash2(x, y) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
  }
  const smoothStep = (t) => t * t * (3 - 2 * t);
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    const u = smoothStep(xf), v = smoothStep(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, y, oct) {
    let s = 0, amp = 0.55, f = 1;
    for (let i = 0; i < (oct || 4); i++) { s += amp * noise2(x * f, y * f); f *= 2.03; amp *= 0.5; }
    return s;
  }

  /* ───────────── 지형 자산 만들기 ───────────── */
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
    riverMain = G.rivers.map((r) => MAIN_RIVERS.indexOf(r.n) >= 0);

    /* 산맥 — 봉우리 삼각형 배치 (촘촘하게) */
    peaks = [];
    (G.mountains || []).forEach((m, mi) => {
      const flat = m.p;
      const n = flat.length / 2;
      let carry = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = pt(flat, i), b = pt(flat, i + 1);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const step = 11.5;
        let d = carry;
        while (d < len) {
          const t = d / len;
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t;
          const jx = Math.sin((i + 1) * 2.7 + d * 0.21 + mi) * 6;
          const jy = Math.cos((i + 1) * 1.9 + d * 0.17 + mi) * 4.5;
          const s = 0.72 + 0.55 * Math.abs(Math.sin((i + 2) * 1.3 + d * 0.09 + mi * 0.7));
          peaks.push({ x: x + jx, y: y + jy, w: 33 * s, h: 24 * s, v: hash2(i, mi) });
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
      const n = Math.round(r * r / 240);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * r * 0.94;
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d * 0.9;
        if (!cx.isPointInPath(landPath, px, py)) continue;
        trees.push({ x: px, y: py, s: 0.8 + rnd() * 0.75, v: rnd() });
      }
    });

    /* 밭이랑 — 평지·고원 색조 위에 작은 이랑 조각을 흩뿌린다 */
    fields = [];
    (G.tints || []).forEach(([x, y, r, color, a], ti) => {
      if (r < 90) return;
      let seed = 91 + ti * 613;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const n = Math.round(r / 4.5);
      for (let i = 0; i < n; i++) {
        const ang = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * r * 0.85;
        const px = x + Math.cos(ang) * d;
        const py = y + Math.sin(ang) * d * 0.9;
        if (!cx.isPointInPath(landPath, px, py)) continue;
        fields.push({ x: px, y: py, w: 9 + rnd() * 12, h: 4 + rnd() * 5, r: (rnd() - 0.5) * 0.9, v: rnd() });
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

    /* 고운 모래 알갱이 */
    const gp = document.createElement('canvas');
    gp.width = gp.height = 96;
    const gc = gp.getContext('2d');
    const gi = gc.createImageData(96, 96);
    for (let i = 0; i < gi.data.length; i += 4) {
      const v = Math.random() * 255;
      gi.data[i] = v; gi.data[i + 1] = v; gi.data[i + 2] = v;
      gi.data[i + 3] = Math.random() > 0.55 ? 18 : 0;
    }
    gc.putImageData(gi, 0, 0);
    grainPattern = cx.createPattern(gp, 'repeat');

    buildRelief();
  }

  /* ───────────── 입체 기복(힐셰이드) ───────────── */
  function buildRelief() {
    const G = SK.MAPGEO;
    const gw = 1000, gh = Math.round(gw * MAPH / MAPW);
    const k = gw / MAPW;
    const H = new Float32Array(gw * gh);

    /* 1) 완만한 기복 */
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const wx = x / k, wy = y / k;
        H[y * gw + x] = 0.10 + 0.17 * fbm(wx * 0.010, wy * 0.010, 4) + 0.035 * fbm(wx * 0.045, wy * 0.045, 3);
      }
    }
    /* 2) 고원·분지 — 색조 자리마다 살짝 솟는다 */
    (G.tints || []).forEach(([tx, ty, tr, color, a]) => {
      const gx = tx * k, gy = ty * k, gr = tr * k;
      const amp = 0.05 + 0.20 * a;
      for (let y = Math.max(0, Math.floor(gy - gr)); y < Math.min(gh, Math.ceil(gy + gr)); y++) {
        for (let x = Math.max(0, Math.floor(gx - gr)); x < Math.min(gw, Math.ceil(gx + gr)); x++) {
          const d = Math.hypot(x - gx, y - gy) / gr;
          if (d > 1) continue;
          H[y * gw + x] += amp * Math.pow(1 - d, 2.2);
        }
      }
    });
    /* 3) 산맥 — 능선을 따라 솟구치는 봉우리 */
    (G.mountains || []).forEach((m, mi) => {
      const flat = m.p;
      const n = flat.length / 2;
      let carry = 0, idx = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = pt(flat, i), b = pt(flat, i + 1);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let d = carry;
        while (d < len) {
          const t = d / len;
          const wx = a[0] + (b[0] - a[0]) * t;
          const wy = a[1] + (b[1] - a[1]) * t;
          const gx = wx * k, gy = wy * k;
          const r = (13 + 9 * Math.abs(Math.sin(idx * 0.7 + mi))) * k + 3;
          const amp = 0.7 + 0.75 * Math.abs(Math.sin(idx * 1.7 + mi * 2.1));
          const x0 = Math.max(0, Math.floor(gx - r)), x1 = Math.min(gw - 1, Math.ceil(gx + r));
          const y0 = Math.max(0, Math.floor(gy - r)), y1 = Math.min(gh - 1, Math.ceil(gy + r));
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const dd = Math.hypot(x - gx, y - gy) / r;
              if (dd > 1) continue;
              H[y * gw + x] += amp * Math.pow(1 - dd, 2.0);
            }
          }
          idx++;
          d += 5.5;
        }
        carry = d - len;
      }
    });

    /* 4) 육지 마스크 */
    const mk = document.createElement('canvas');
    mk.width = gw; mk.height = gh;
    const mc = mk.getContext('2d');
    mc.setTransform(k, 0, 0, k, 0, 0);
    mc.fillStyle = '#fff';
    mc.fill(landPath);
    mc.fill(lakePath);
    const mdata = mc.getImageData(0, 0, gw, gh).data;

    /* 5) 힐셰이드 — 북서쪽 빛 */
    const out = document.createElement('canvas');
    out.width = gw; out.height = gh;
    const oc = out.getContext('2d');
    const img = oc.createImageData(gw, gh);
    const dat = img.data;
    const Z = 9.0;
    for (let y = 3; y < gh - 3; y++) {
      for (let x = 3; x < gw - 3; x++) {
        const i = y * gw + x;
        const o = i * 4;
        const mask = mdata[o + 3];
        if (!mask) { dat[o + 3] = 0; continue; }
        const hl = H[i - 1], hr = H[i + 1];
        const hu = H[i - gw], hd = H[i + gw];
        const dx = (hr - hl) * Z;
        const dy = (hd - hu) * Z;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        /* 빛: 왼쪽 위(-0.62, -0.78, 0.62) */
        let lum = (-dx * -0.62 + -dy * -0.78 + 0.62) * inv;
        lum = clamp(lum, 0, 1);
        const elev = clamp(H[i], 0, 1.4);
        const strength = 26 + 200 * Math.pow(clamp(elev * 1.5, 0, 1), 1.15);
        const g = clamp(128 + (lum - 0.72) * strength, 0, 255);
        dat[o] = g; dat[o + 1] = g; dat[o + 2] = g; dat[o + 3] = 255;
      }
    }
    oc.putImageData(img, 0, 0);
    reliefCanvas = out;
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
    g.lineJoin = 'round';
    g.lineCap = 'round';

    /* ── 바다 (수심 그라데이션) ── */
    const seaGrad = g.createLinearGradient(0, 0, MAPW * 0.35, MAPH);
    seaGrad.addColorStop(0, '#4d8497');
    seaGrad.addColorStop(0.35, '#3f778c');
    seaGrad.addColorStop(0.7, '#356a80');
    seaGrad.addColorStop(1, '#2b5a70');
    g.fillStyle = seaGrad;
    g.fillRect(0, 0, MAPW, MAPH);
    /* 먼 바다 결 */
    if (grainPattern) {
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.16;
      g.fillStyle = grainPattern;
      g.fillRect(0, 0, MAPW, MAPH);
      g.restore();
    }

    /* ── 연안 수심 띠 (육지 바깥쪽으로 밝아진다) ── */
    const bands = [
      [120, 'rgba(88,150,158,0.10)'],
      [92, 'rgba(104,168,172,0.13)'],
      [66, 'rgba(124,186,186,0.16)'],
      [44, 'rgba(146,202,197,0.20)'],
      [26, 'rgba(172,219,208,0.24)'],
      [13, 'rgba(198,232,216,0.26)'],
    ];
    bands.forEach(([w, col]) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(landPath); });
    /* 잔물결 — 해안을 따라 3겹 */
    g.save();
    for (let i = 1; i <= 3; i++) {
      g.setLineDash([10 + i * 7, 15 + i * 9]);
      g.lineDashOffset = i * 13;
      g.strokeStyle = `rgba(226,244,246,${0.24 - i * 0.05})`;
      g.lineWidth = 1.1 + i * 0.5;
      g.stroke(landPath);
    }
    g.setLineDash([]);
    g.lineDashOffset = 0;
    g.restore();

    /* ── 육지 그림자 (바다로 드리운다) ── */
    g.save();
    g.translate(5, 8);
    g.fillStyle = 'rgba(16,42,54,0.22)';
    g.fill(landPath);
    g.restore();

    /* ── 육지 ── */
    const landGrad = g.createLinearGradient(0, 0, MAPW * 0.12, MAPH);
    landGrad.addColorStop(0, '#d3cc8a');
    landGrad.addColorStop(0.3, '#cbc684');
    landGrad.addColorStop(0.62, '#c2c17c');
    landGrad.addColorStop(0.85, '#b7be74');
    landGrad.addColorStop(1, '#aebc72');
    g.fillStyle = landGrad;
    g.fill(landPath);

    g.save();
    g.clip(landPath);

    /* ── 지역 색조 ── */
    (SK.MAPGEO.tints || []).forEach(([x, y, r, color, a]) => {
      const aa = Math.min(0.40, a * 0.62);
      const rg = g.createRadialGradient(x, y, r * 0.05, x, y, r);
      rg.addColorStop(0, rgba(color, aa));
      rg.addColorStop(0.45, rgba(color, aa * 0.75));
      rg.addColorStop(0.75, rgba(color, aa * 0.32));
      rg.addColorStop(1, rgba(color, 0));
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    });

    /* ── 기복(힐셰이드) — 평야는 은은하게, 산지는 뚜렷하게 ── */
    if (reliefCanvas) {
      g.save();
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.86;
      g.imageSmoothingEnabled = true;
      g.drawImage(reliefCanvas, 0, 0, MAPW, MAPH);
      g.restore();
    }

    /* ── 밭이랑 ── */
    fields.forEach((f) => {
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.r);
      g.beginPath();
      g.ellipse(0, 0, f.w / 2, f.h / 2, 0, 0, Math.PI * 2);
      g.fillStyle = f.v > 0.55 ? 'rgba(206,214,138,0.30)' : 'rgba(178,190,110,0.24)';
      g.fill();
      g.strokeStyle = 'rgba(122,132,74,0.16)';
      g.lineWidth = 0.6;
      g.stroke();
      g.restore();
    });

    /* ── 모래톱 (해안 안쪽) ── */
    g.strokeStyle = 'rgba(246, 238, 200, 0.62)';
    g.lineWidth = 8;
    g.stroke(landPath);

    /* ── 종이 질감 ── */
    if (paperPattern) {
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = 0.5;
      g.fillStyle = paperPattern;
      g.fillRect(0, 0, MAPW, MAPH);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    if (grainPattern) {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.16;
      g.fillStyle = grainPattern;
      g.fillRect(0, 0, MAPW, MAPH);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    /* ── 해안선 ── */
    g.strokeStyle = 'rgba(84,82,48,0.88)';
    g.lineWidth = 2.4;
    g.stroke(landPath);
    g.strokeStyle = 'rgba(250,244,212,0.55)';
    g.lineWidth = 1.1;
    g.stroke(landPath);
    g.restore();

    /* 섬 테두리 */
    g.strokeStyle = 'rgba(246,240,205,0.4)';
    g.lineWidth = 1;
    g.stroke(lakePath);

    renderScale = R;
    canvas.style.opacity = 1;
  }

  /* ───────────── 숲·산·강 레이어 (영토 위에 얹어 자연색을 지킨다) ───────────── */
  function renderFeatures(R) {
    if (!featCanvas || !SK.MAPGEO) return;
    R = clamp(R, 0.8, 1.9);
    const cw = Math.round(MAPW * R), ch = Math.round(MAPH * R);
    if (featCanvas.width !== cw || featCanvas.height !== ch) { featCanvas.width = cw; featCanvas.height = ch; }
    const g = fcx;
    g.setTransform(R, 0, 0, R, 0, 0);
    g.clearRect(0, 0, MAPW, MAPH);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.save();
    g.clip(landPath);
    /* ── 숲 — 둥근 잎 덩어리와 줄기 ── */
    trees.forEach((t) => {
      const sc = t.s;
      const v = t.v || 0;
      g.fillStyle = 'rgba(46,62,34,0.20)';
      g.beginPath();
      g.ellipse(t.x + 1.1 * sc, t.y + 0.8, 3.4 * sc, 1.3 * sc, 0, 0, Math.PI * 2);
      g.fill();
      /* 줄기 */
      g.fillStyle = '#6b5235';
      g.fillRect(t.x - 0.6 * sc, t.y - 2.6 * sc, 1.2 * sc, 2.8 * sc);
      /* 아래 어두운 잎 */
      g.fillStyle = v > 0.5 ? '#4a6734' : '#52703a';
      g.beginPath();
      g.ellipse(t.x, t.y - 5.0 * sc, 3.4 * sc, 3.9 * sc, 0, 0, Math.PI * 2);
      g.fill();
      /* 위쪽 밝은 잎 */
      g.fillStyle = v > 0.5 ? '#6d8c46' : '#74934c';
      g.beginPath();
      g.ellipse(t.x - 0.7 * sc, t.y - 6.4 * sc, 2.3 * sc, 2.7 * sc, 0, 0, Math.PI * 2);
      g.fill();
      /* 잎 하이라이트 */
      g.fillStyle = 'rgba(196,214,140,0.35)';
      g.beginPath();
      g.ellipse(t.x - 1.3 * sc, t.y - 7.1 * sc, 1.0 * sc, 1.1 * sc, 0, 0, Math.PI * 2);
      g.fill();
    });

    /* ── 산맥 바탕 — 산줄기를 따라 깔리는 흙빛 덩어리 ── */
    (SK.MAPGEO.mountains || []).forEach((m) => {
      const flat = m.p;
      const pth = new Path2D();
      pth.moveTo(flat[0], flat[1]);
      for (let i = 2; i < flat.length; i += 2) pth.lineTo(flat[i], flat[i + 1]);
      g.strokeStyle = 'rgba(122,128,92,0.16)';
      g.lineWidth = 54;
      g.stroke(pth);
      g.strokeStyle = 'rgba(112,118,84,0.14)';
      g.lineWidth = 34;
      g.stroke(pth);
    });

    /* ── 산맥 — 겹겹 능선과 그늘면, 설관 ── */
    peaks.forEach((p, pi) => {
      const { x, y, w, h } = p;
      const v = p.v || 0;
      /* 발치 그늘 — 산이 땅에 서 있는 느낌 */
      g.fillStyle = 'rgba(88,96,66,0.16)';
      g.beginPath();
      g.ellipse(x + w * 0.12, y + 1.4, w * 0.72, h * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      /* 뒤쪽 봉우리 그림자 */
      g.fillStyle = 'rgba(90,98,72,0.28)';
      g.beginPath();
      g.moveTo(x - w * 0.7, y + 3.0);
      g.lineTo(x + w * 0.12, y - h * 0.8);
      g.lineTo(x + w * 0.8, y + 3.0);
      g.closePath();
      g.fill();
      /* 몸통 */
      g.beginPath();
      g.moveTo(x - w / 2, y);
      g.lineTo(x - w * 0.06, y - h);
      g.lineTo(x + w / 2, y);
      g.closePath();
      const mg = g.createLinearGradient(x - w * 0.12, y - h, x + w * 0.22, y);
      if (v > 0.5) {
        mg.addColorStop(0, '#a9ae7d');
        mg.addColorStop(0.5, '#858e64');
        mg.addColorStop(1, '#6d7854');
      } else {
        mg.addColorStop(0, '#9ea578');
        mg.addColorStop(0.5, '#7d875e');
        mg.addColorStop(1, '#67724f');
      }
      g.fillStyle = mg;
      g.fill();
      /* 그늘진 오른쪽 면 */
      g.beginPath();
      g.moveTo(x + w / 2, y);
      g.lineTo(x - w * 0.06, y - h);
      g.lineTo(x + w * 0.18, y);
      g.closePath();
      g.fillStyle = 'rgba(72,82,58,0.95)';
      g.fill();
      /* 햇빛 받는 왼쪽 능선 */
      g.beginPath();
      g.moveTo(x - w * 0.06, y - h);
      g.lineTo(x - w * 0.5, y);
      g.lineTo(x - w * 0.18, y);
      g.closePath();
      g.fillStyle = 'rgba(228,228,196,0.34)';
      g.fill();
      /* 암벽 결 — 그늘면에 짧은 선 */
      if (h > 20) {
        g.strokeStyle = 'rgba(76,86,62,0.30)';
        g.lineWidth = 0.7;
        for (let i = 0; i < 2; i++) {
          const t = 0.35 + i * 0.3;
          g.beginPath();
          g.moveTo(x + w * (0.02 + t * 0.12), y - h * (0.72 - i * 0.28));
          g.lineTo(x + w * (0.22 + t * 0.1), y - h * (0.42 - i * 0.2));
          g.stroke();
        }
      }
      /* 설관 — 아주 높은 봉우리에만, 작게 */
      if (h > 27 && v > 0.72) {
        g.beginPath();
        g.moveTo(x - w * 0.06, y - h);
        g.lineTo(x - w * 0.16, y - h * 0.76);
        g.lineTo(x - w * 0.05, y - h * 0.8);
        g.lineTo(x + w * 0.03, y - h * 0.74);
        g.lineTo(x + w * 0.09, y - h * 0.82);
        g.closePath();
        g.fillStyle = 'rgba(250,250,244,0.92)';
        g.fill();
      }
      g.strokeStyle = 'rgba(58,66,44,0.55)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(x - w / 2, y);
      g.lineTo(x - w * 0.06, y - h);
      g.lineTo(x + w / 2, y);
      g.stroke();
      /* 발치 언덕 — 봉우리 사이를 메워 산줄기로 보이게 */
      if ((pi % 3) === 0) {
        g.beginPath();
        g.moveTo(x - w * 0.95, y + 1.5);
        g.lineTo(x - w * 0.45, y - h * 0.42);
        g.lineTo(x + w * 0.05, y + 1.5);
        g.closePath();
        g.fillStyle = 'rgba(128,136,96,0.65)';
        g.fill();
      }
    });

    /* ── 강 — 기슭 그늘, 물줄기, 물결빛 ── */
    riverPaths.forEach((p, i) => {
      const main = riverMain[i];
      const wBase = main ? 12.5 : 6.2;
      const wCore = main ? 6.6 : 3.3;
      g.strokeStyle = main ? 'rgba(30,58,74,0.50)' : 'rgba(44,76,96,0.38)';
      g.lineWidth = wBase + 2.4;
      g.stroke(p);
      g.strokeStyle = main ? 'rgba(226,232,196,0.30)' : 'rgba(212,220,184,0.22)';
      g.lineWidth = wBase + 0.4;
      g.stroke(p);
      g.strokeStyle = main ? '#77b2cb' : '#83bbcd';
      g.lineWidth = wCore;
      g.stroke(p);
      g.strokeStyle = 'rgba(206,240,246,0.62)';
      g.lineWidth = main ? 1.5 : 0.7;
      g.stroke(p);
    });

    /* ── 호수 ── */
    const lg = g.createLinearGradient(0, 300, 0, 800);
    lg.addColorStop(0, '#6fa5b8');
    lg.addColorStop(1, '#568c9f');
    g.fillStyle = lg;
    g.fill(lakePath);
    g.strokeStyle = 'rgba(38,74,92,0.55)';
    g.lineWidth = 1.4;
    g.stroke(lakePath);

    g.restore();
    featScale = R;
  }

  /* ───────────── 길 레이어 (지형·영토 위에 늘 선명하게) ───────────── */
  function renderRoutes() {
    if (!routeCanvas) return;
    const R = 1.5;
    const cw = Math.round(MAPW * R), ch = Math.round(MAPH * R);
    routeCanvas.width = cw; routeCanvas.height = ch;
    const g = rcx;
    g.setTransform(R, 0, 0, R, 0, 0);
    g.clearRect(0, 0, MAPW, MAPH);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    /* 육로 — 밑그림 + 금빛 점선 */
    g.strokeStyle = 'rgba(58,42,16,0.30)';
    g.lineWidth = 4.6;
    g.stroke(roadPath);
    g.setLineDash([7, 6]);
    g.strokeStyle = 'rgba(250,214,128,0.96)';
    g.lineWidth = 2.2;
    g.stroke(roadPath);
    g.setLineDash([]);
    /* 해로 */
    g.setLineDash([5, 9]);
    g.strokeStyle = 'rgba(224,246,250,0.82)';
    g.lineWidth = 1.9;
    g.stroke(seaPath);
    g.setLineDash([]);
  }

  /* ───────────── 세력 영토 ───────────── */
  let terrSig = '';
  function territorySignature() {
    if (!SK.state) return '';
    let s = playerFaction() + '|';
    for (let i = 0; i < SK.CITY_LIST.length; i++) {
      const c = SK.CITY_LIST[i];
      const t = SK.state.cities[c.id];
      s += t ? (t.owner || '.') + ',' : ',';
    }
    return s;
  }
  function drawTerritory() {
    if (!terrCanvas || !SK.state) return;
    const list = SK.CITY_LIST.map((c) => {
      const t = SK.state.cities[c.id];
      return { id: c.id, u: c.u * MAPW, v: c.v * MAPH, type: c.type, owner: t ? t.owner : 'neutral' };
    });
    const rad = { capital: 168, town: 132, pass: 116, fortress: 120 };
    const unit = MAPW / GRID_W;            /* 격자 한 칸 = 4 world px */
    const img = new ImageData(GRID_W, GRID_H);
    const dat = img.data;
    const ownerIdx = new Int16Array(GRID_W * GRID_H);
    const colors = {};
    const colorOf = (o) => {
      if (!o || o === 'neutral') return null;
      if (!colors[o]) {
        const c = (SK.factionInfo ? SK.factionInfo(o).color : '#8b8777') || '#8b8777';
        colors[o] = {
          rgb: [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)],
        };
      }
      return colors[o].rgb;
    };
    for (let gy = 0; gy < GRID_H; gy++) {
      const wy = (gy + 0.5) * unit;
      for (let gx = 0; gx < GRID_W; gx++) {
        const wx = (gx + 0.5) * unit;
        let best = -1, bestD = 1e9;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          const dx = wx - c.u, dy = wy - c.v;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = i; }
        }
        const i0 = gy * GRID_W + gx, o = i0 * 4;
        ownerIdx[i0] = best;
        if (best < 0) continue;
        const c = list[best];
        const rgb = colorOf(c.owner);
        if (!rgb) continue;
        /* 보로노이 칸을 그대로 채우고, 바깥 한계에서만 부드럽게 사라진다 */
        const d = Math.sqrt(bestD);
        const rr = rad[c.type] || 130;
        if (d > rr) continue;
        const fade = 34;
        const t = d <= rr - fade ? 1 : (rr - d) / fade;
        const a = Math.round(255 * 0.30 * t);
        dat[o] = rgb[0]; dat[o + 1] = rgb[1]; dat[o + 2] = rgb[2]; dat[o + 3] = a;
      }
    }
    /* 세력 경계 — 이웃 칸의 주인이 다르면 살짝 진하게 */
    for (let gy = 1; gy < GRID_H - 1; gy++) {
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        const i0 = gy * GRID_W + gx, o = i0 * 4;
        if (dat[o + 3] < 40) continue;
        const c = list[ownerIdx[i0]];
        if (!c || !c.owner || c.owner === 'neutral') continue;
        let edge = false;
        for (let k = 0; k < 4; k++) {
          const nx = gx + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const ny = gy + (k === 2 ? 1 : k === 3 ? -1 : 0);
          const nb = list[ownerIdx[ny * GRID_W + nx]];
          if (!nb || nb.owner !== c.owner) { edge = true; break; }
        }
        if (edge) {
          dat[o] = Math.round(dat[o] * 0.70); dat[o + 1] = Math.round(dat[o + 1] * 0.70); dat[o + 2] = Math.round(dat[o + 2] * 0.70);
          dat[o + 3] = Math.min(255, Math.round(dat[o + 3] * 1.15) + 10);
        }
      }
    }

    const small = document.createElement('canvas');
    small.width = GRID_W; small.height = GRID_H;
    small.getContext('2d').putImageData(img, 0, 0);

    const g = tcx;
    const cw = Math.round(MAPW * TERR_SCALE), ch = Math.round(MAPH * TERR_SCALE);
    if (terrCanvas.width !== cw || terrCanvas.height !== ch) { terrCanvas.width = cw; terrCanvas.height = ch; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, cw, ch);
    /* 바다로 새지 않게 육지 모양으로 오려낸다 */
    g.setTransform(TERR_SCALE, 0, 0, TERR_SCALE, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = '#fff';
    g.fill(landPath);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    terrSig = territorySignature();
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
      const rr = clamp((window.devicePixelRatio || 1) * cam.s, 0.9, 1.9);
      renderTerrain(rr);
      renderFeatures(rr);
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

  /* 인위적 배율 지정 (테스트·점프용) */
  function setScaleTo(s) {
    const { w, h } = viewSize();
    const k = clamp(s, minScale(), MAX_SCALE) / cam.s;
    cam.tx = w / 2 - (w / 2 - cam.tx) * k;
    cam.ty = h / 2 - (h / 2 - cam.ty) * k;
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
        <span class="m-hit"></span>
        <img class="m-icon" src="assets/icons/${ICON_SRC[c.type]}.webp" alt="" draggable="false" />
        <span class="m-flag"><b class="m-lv">1</b></span>
        <span class="m-label">${c.name}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); onMarker(c.id); });
      /* 지도 판이 포인터를 캡처하면 마커 클릭이 사라진다 — 마커 위 터치는 지도 제스처로 보내지 않는다 */
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      b.addEventListener('pointerup', (e) => { e.stopPropagation(); });
      markersEl.appendChild(b);
      return { id: c.id, el: b, city: c, anchor: 0, lw: 0, lh: 0, hidden: false,
        flagEl: b.querySelector('.m-flag'), labelEl: b.querySelector('.m-label'), lvEl: b.querySelector('.m-lv') };
    });
    labelAnchorDirty = true;
    refresh();
  }

  function iconH(type, s) {
    const base = ICON_H[type] || 21;
    return base * clamp(0.38 + s * 0.52, 0.32, 1.16);
  }
  function iconW(type, s) { return iconH(type, s) * (ICON_ASPECT[type] || 1.4); }

  function placeMarks() {
    if (!marks.length) return;
    const s = cam.s;
    const fs = clamp(7.2 + s * 2.6, 7.2, 13.4);
    markersEl.style.setProperty('--fs', fs.toFixed(1) + 'px');
    if (labelAnchorDirty || Math.abs(s - labelScale) / (labelScale || 1) > 0.02) {
      layoutAnchors(fs, s);
      labelAnchorDirty = false;
      labelScale = s;
    }
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const x = cam.tx + m.city.u * MAPW * s;
      const y = cam.ty + m.city.v * MAPH * s;
      m.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      m.el.classList.toggle('off', !!m.hide);
      m.el.style.setProperty('--ih', iconH(m.city.type, s).toFixed(1) + 'px');
      m.el.style.setProperty('--iw', iconW(m.city.type, s).toFixed(1) + 'px');
      m.el.dataset.a = m.anchor;
    }
  }

  /* 라벨 겹침 해소 — 아이콘·이름이 서로 겹치지 않게 자리를 고르고, 자리가 없으면 잠시 감춘다 */
  function layoutAnchors(fs, s) {
    const prio = { capital: 0, pass: 1, fortress: 2, town: 3 };
    const cx0 = cam.tx, cy0 = cam.ty;
    const order = marks.slice().sort((a, b) => {
      const pa = (a.el.classList.contains('sel') ? -10 : 0) + prio[a.city.type];
      const pb = (b.el.classList.contains('sel') ? -10 : 0) + prio[b.city.type];
      return pa - pb;
    });
    const boxes = [];      /* 아이콘 + 확정된 라벨 */
    const icons = [];
    marks.forEach((m) => {
      const x = cx0 + m.city.u * MAPW * s;
      const y = cy0 + m.city.v * MAPH * s;
      const iw = iconW(m.city.type, s), ih = iconH(m.city.type, s);
      icons.push({ m, x, y, iw, ih });
    });
    icons.forEach((o) => {
      /* 아이콘 + 왼쪽 위 깃발 배지까지 한 덩어리로 본다 */
      boxes.push([o.x - o.iw / 2 - 2, o.y - o.ih - 3, o.iw + 4, o.ih + 4, 1]);
    });
    const overlap = (a, b) => {
      const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
      const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
      return ox > 0 && oy > 0 ? ox * oy : 0;
    };
    const iconOf = {};
    icons.forEach((o) => { iconOf[o.m.id] = o; });
    const placedIcons = [];
    const pf = playerFaction();
    order.forEach((m) => {
      const o = iconOf[m.id];
      const iw = o.iw, ih = o.ih;
      const iconRect = [o.x - iw / 2, o.y - ih, iw, ih];
      let iconOverlap = 0;
      for (let i = 0; i < placedIcons.length; i++) iconOverlap += overlap(iconRect, placedIcons[i]);
      const isSel = m.el.classList.contains('sel');
      const owned = st(m.id) && st(m.id).owner === pf;
      const keep = isSel || owned;
      /* 아주 멀리서는 소도시 아이콘부터 숨겨 개요 지도를 깔끔하게 */
      const farHide = !isSel && !owned && (
        (s < 0.26 && m.city.type === 'town')
        || (s < 0.21 && m.city.type !== 'capital'));
      if (farHide || (iconOverlap > iw * ih * 0.22 && !keep)) {
        m.hide = true;
        m.hidden = true;
        if (m.labelEl) m.labelEl.classList.add('off');
        return;
      }
      m.hide = false;
      placedIcons.push(iconRect);
      const lw = m.city.name.length * fs * 1.0 + 4;
      const lh = fs + 5;
      const gap = 1.5;
      const c = [
        { a: 3, dx: 0, dy: o.ih + gap, al: 'c' },                          /* 아래 */
        { a: 2, dx: 0, dy: -gap - lh - o.ih, al: 'c' },                    /* 위 */
        { a: 0, dx: o.iw / 2 + gap, dy: -o.ih * 0.55 - lh / 2, al: 'l' },  /* 오른쪽 */
        { a: 1, dx: -o.iw / 2 - gap - lw, dy: -o.ih * 0.55 - lh / 2, al: 'l' }, /* 왼쪽 */
        { a: 3, dx: 5, dy: o.ih + gap + 2, al: 'c' },
        { a: 2, dx: -4, dy: -gap - lh - o.ih - 2, al: 'c' },
        { a: 0, dx: o.iw / 2 + gap + 2, dy: -o.ih * 0.8 - lh / 2, al: 'l' },
        { a: 1, dx: -o.iw / 2 - gap - lw - 2, dy: -o.ih * 0.3 - lh / 2, al: 'l' },
        { a: 3, dx: 0, dy: o.ih + gap + lh + 3, al: 'c' },
        { a: 2, dx: 0, dy: -gap - lh * 2 - o.ih - 5, al: 'c' },
      ];
      let best = null, bestScore = 1e18;
      for (let ci = 0; ci < c.length; ci++) {
        const cand = c[ci];
        const bx = o.x + cand.dx + (cand.al === 'c' ? -lw / 2 : 0);
        const rect = [bx, o.y + cand.dy, lw, lh];
        let score = ci * 1.2;      /* 가까운 자리를 살짝 선호 */
        for (let bi = 0; bi < boxes.length; bi++) {
          const ov = overlap(rect, boxes[bi]);
          if (ov) score += ov * (boxes[bi][4] === 1 ? 1.15 : 1.0);
        }
        /* 화면 아래 조작 버튼 · 상단 바와 겹치지 않게 */
        if (score < bestScore) { bestScore = score; best = { a: cand.a, rect, al: cand.al, dx: cand.dx, dy: cand.dy }; }
        if (score <= 0.5) break;
      }
      const area = lw * lh;
      /* 배율별 이름 표시 — 멀리서는 대도시·관문·내 성만, 가까이서는 전부 */
      let labelOk = true;
      if (s < 0.30) labelOk = m.city.type === 'capital' || isSel || owned;
      else if (s < 0.52) labelOk = m.city.type !== 'town' || isSel || owned;
      const hide = !labelOk || bestScore > area * 0.34;
      m.anchor = best.a;
      m.al = best.al; m.dx = best.dx; m.dy = best.dy; m.lw = lw; m.lh = lh;
      m.hidden = hide;
      m.el.classList.toggle('off', false);
      if (m.labelEl) m.labelEl.classList.toggle('off', hide);
      if (!hide) boxes.push([best.rect[0], best.rect[1], lw, lh, 2]);
      /* 확정 자리를 그대로 픽셀 위치로 넘긴다 */
      m.ox = best.rect[0] - o.x; m.oy = best.rect[1] - o.y;
      if (m.labelEl) {
        m.labelEl.style.left = (best.rect[0] - o.x).toFixed(1) + 'px';
        m.labelEl.style.top = (best.rect[1] - o.y).toFixed(1) + 'px';
        m.labelEl.style.width = lw.toFixed(1) + 'px';
        m.labelEl.style.textAlign = best.al === 'c' ? 'center' : (best.al === 'r' ? 'right' : 'left');
      }
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
      m.el.classList.toggle('neutral', t.owner === 'neutral');
      m.el.classList.toggle('mine', t.owner === pf);
      m.el.classList.toggle('enemy', t.owner !== pf && t.owner !== 'neutral');
      m.el.classList.toggle('target', t.owner !== pf && t.owner !== 'neutral'
        && SK.allNeighbors(m.id).some((n) => SK.state.cities[n].owner === pf));
      const name = city(m.id).name;
      const lv = SK.cityLevel ? SK.cityLevel(t) : 1;
      if (m.lvEl && m.lvEl.textContent !== String(lv)) m.lvEl.textContent = String(lv);
      m.el.classList.toggle('lv-hi', lv >= 4);
      m.el.title = `${name} ${lv}급 · ${f.name || ''}`;
    });
    /* 세력이 바뀌었을 때만 영토를 다시 칠한다 */
    const sig = territorySignature();
    if (sig !== terrSig) drawTerritory();
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
    $('#go-capital').onclick = () => { labelAnchorDirty = true; focusCity((SK.state && SK.state.playerCapital) || SK.state.lastCity || 'xuchang', false); };
    window.addEventListener('resize', () => {
      if (!built) return;
      clampCam();
      apply();
      renderScale = 0;
      featScale = 0;
      scheduleRender();
    });
  }

  /* ───────────── 공개 API ───────────── */
  function build() {
    vp = $('#world-viewport');
    layer = $('#world-layer');
    markersEl = $('#city-markers');
    canvas = $('#map-terrain');
    terrCanvas = $('#map-territory');
    featCanvas = $('#map-features');
    routeCanvas = $('#map-routes');
    if (!vp || !layer || !canvas) { console.warn('지도 요소를 찾지 못했습니다.'); return; }
    cx = canvas.getContext('2d');
    tcx = terrCanvas ? terrCanvas.getContext('2d') : null;
    fcx = featCanvas ? featCanvas.getContext('2d') : null;
    rcx = routeCanvas ? routeCanvas.getContext('2d') : null;
    canvas.style.width = MAPW + 'px';
    canvas.style.height = MAPH + 'px';
    buildStatic();
    renderTerrain(1.25);
    renderFeatures(1.25);
    renderRoutes();
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
    setScale(s) { setScaleTo(s); },
    relayout() { if (!built) return; if (!vp.getBoundingClientRect().width) return; clampCam(); apply(); },
    open(id) { onMarker(id); },
    /* 테스트/검증용 */
    debug() {
      return {
        built, scale: cam.s, tx: cam.tx, ty: cam.ty, marks: marks.length,
        renderScale, labelCount: document.querySelectorAll('.m-label').length,
        labelsHidden: marks.filter((m) => m.hidden).length,
        trees: trees.length, peaks: peaks.length, fields: fields.length,
        hasRelief: !!reliefCanvas, territory: !!terrCanvas, features: !!featCanvas, routes: !!routeCanvas,
      };
    },
    /* 겹침 검사 — 화면 좌표 라벨·아이콘 사각형이 서로 겹치는 수 */
    overlaps() {
      const s = cam.s;
      const rects = [];
      marks.forEach((m) => {
        if (m.hide) return;
        const x = cam.tx + m.city.u * MAPW * s;
        const y = cam.ty + m.city.v * MAPH * s;
        const iw = iconW(m.city.type, s), ih = iconH(m.city.type, s);
        rects.push({ type: 'icon', id: m.id, r: [x - iw / 2, y - ih, iw, ih] });
        if (!m.hidden) {
          rects.push({ type: 'label', id: m.id, r: [x + (m.ox || 0), y + (m.oy || 0), m.lw || 0, m.lh || 0] });
        }
      });
      const hits = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          if (rects[i].id === rects[j].id) continue;
          const a = rects[i].r, b = rects[j].r;
          const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
          const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
          if (ox > 1 && oy > 1) hits.push({ a: rects[i].type + ':' + rects[i].id, b: rects[j].type + ':' + rects[j].id, ox: Math.round(ox), oy: Math.round(oy) });
        }
      }
      return hits;
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
