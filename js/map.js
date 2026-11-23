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
  const ICON_H = { capital: 30, mid: 26, town: 22, pass: 21, fortress: 21 };
  const ICON_ASPECT = { capital: 1.62, mid: 1.77, town: 1.42, pass: 1.58, fortress: 1.18 };
  const ICON_SRC = { capital: 'capital', mid: 'mid', town: 'town', pass: 'pass', fortress: 'fortress' };
  const TERR_SCALE = 1.25;
  /* v5.6 — 지형 베이스는 사용자가 확정한 도안 A 그림(assets/map_bg.webp)이다.
     그림이 오면 절차적 지형(바다·육지·산·숲·강)은 그리지 않고, 그 위에 영토·길·아이콘만 얹는다. */
  const BG_URL = 'assets/map_bg.webp';
  /* v5.10 — 달에 따라 계절 지도로 갈아입는다 (여름은 기존 기본 그림) */
  const BG_SEASON = {
    spring: 'assets/map_bg_spring.webp',
    autumn: 'assets/map_bg_autumn.webp',
    winter: 'assets/map_bg_winter.webp',
  };
  let bgSeason = '';
  function seasonKey() {
    return (SK.seasonKeyOf && SK.state) ? SK.seasonKeyOf(SK.state.month) : 'summer';
  }
  const LAND_URL = 'assets/map_land.png';  /* 영토 색칠을 육지로만 오려내는 마스크 */
  let bgImg = null, bgState = 'loading';   /* loading | ready | failed */
  let landImg = null, landReady = false;
  const GRID_W = 800;                       /* 영토 계산 격자 */
  const GRID_H = Math.round(GRID_W * MAPH / MAPW);

  const cam = { s: 1, tx: 0, ty: 0 };
  let vp = null, layer = null, canvas = null, cx = null;
  let terrCanvas = null, tcx = null, featCanvas = null, fcx = null, routeCanvas = null, rcx = null;
  let markersEl = null;
  let seasonCanvas = null;   // v5.10 — 지도 위 계절 파티클
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

  function buildStatic(lite) {
    const G = SK.MAPGEO;
    landPath = new Path2D();
    G.land.forEach((r) => ringPath(landPath, r));
    lakePath = new Path2D();
    G.lakes.forEach((r) => ringPath(lakePath, r));
    riverPaths = G.rivers.map((r) => riverPath(r.p));
    riverMain = G.rivers.map((r) => MAIN_RIVERS.indexOf(r.n) >= 0);

    /* 산맥 — 봉우리 삼각형 배치 (촘촘하게) */
    /* v5.0.3 — 같은 삼각형이 일렬로 늘어서던 것을 산군(群) 단위로 바꾼다.
       산줄기를 따라 26~42px 간격으로 덩어리를 놓고, 덩어리마다 1~3개의 크기가 다른 봉우리를
       능선 좌우로 흔들어 배치한다. 길·성 바로 위에는 봉우리를 놓지 않는다. */
    const roadPts = [];
    SK.ROADS.forEach(([a, b]) => {
      const A = city(a), B = city(b);
      if (!A || !B) return;
      const ax = A.u * MAPW, ay = A.v * MAPH, bx = B.u * MAPW, by = B.v * MAPH;
      const mx = (ax + bx) / 2 + (by - ay) * -0.045;
      const my = (ay + by) / 2 + (bx - ax) * 0.045;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        roadPts.push([(1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx,
          (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by]);
      }
    });
    const cityPts = SK.CITY_LIST.map((c) => [c.u * MAPW, c.v * MAPH]);
    const clearOf = (x, y, r) => {
      for (let i = 0; i < cityPts.length; i++) {
        const dx = x - cityPts[i][0], dy = y - cityPts[i][1];
        if (dx * dx + dy * dy < 30 * 30) return false;
      }
      const r2 = r * r;
      for (let i = 0; i < roadPts.length; i++) {
        const dx = x - roadPts[i][0], dy = y - roadPts[i][1];
        if (dx * dx + dy * dy < r2) return false;
      }
      return true;
    };
    peaks = [];
    if (!lite) (G.mountains || []).forEach((m, mi) => {
      const flat = m.p;
      const n = flat.length / 2;
      let carry = 0, idx = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = pt(flat, i), b = pt(flat, i + 1);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.5) continue;
        const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
        const nx = -uy, ny = ux;
        const step = 26 + 16 * hash2(i + 11, mi + 3);
        let d = carry;
        while (d < len) {
          const t = d / len;
          const bx0 = a[0] + ux * d, by0 = a[1] + uy * d;
          const clump = 1 + Math.floor(hash2(idx + 7, mi + 13) * 2.6);   /* 1 ~ 3 봉우리 */
          for (let k = 0; k < clump; k++) {
            const hs = hash2(idx * 31 + k * 7, mi * 17 + k * 3);
            const hs2 = hash2(idx * 13 + k * 29, mi * 7 + 5);
            const side = (hash2(idx + k * 19, mi + 2) - 0.5) * 34;
            const x = bx0 + nx * side + (hs - 0.5) * 22;
            const y = by0 + ny * side + (hs2 - 0.5) * 16;
            const s = 0.40 + hs * 0.78 + (k === 0 ? 0.12 : 0);
            if (!clearOf(x, y, 15)) continue;
            peaks.push({ x, y, w: 27 * s, h: (13 + 11 * hs2) * s, v: hs, deep: k === 0 ? 1 : 0 });
          }
          idx++;
          d += step * (0.85 + 0.5 * hash2(idx + 5, mi + 9));
        }
        carry = d - len;
      }
    });
    peaks.sort((p1, p2) => p1.y - p2.y);

    /* 숲 — 초록 계열 색조 안쪽에만 나무를 흩뿌린다 */
    trees = [];
    (lite ? [] : (G.tints || [])).forEach(([x, y, r, color], ti) => {
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
    (lite ? [] : (G.tints || [])).forEach(([x, y, r, color, a], ti) => {
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
      const via = (SK.ROAD_VIA || {})[a + '|' + b] || (SK.ROAD_VIA || {})[b + '|' + a];
      if (via && via.length) {
        /* 해안으로 돌아가는 길 — 꺾은점을 따라 그린다 */
        roadPath.moveTo(ax, ay);
        via.forEach((p) => roadPath.lineTo(p[0], p[1]));
        roadPath.lineTo(bx, by);
        return;
      }
      const mx = (ax + bx) / 2 + (by - ay) * -0.045;
      const my = (ay + by) / 2 + (bx - ax) * 0.045;
      roadPath.moveTo(ax, ay);
      roadPath.quadraticCurveTo(mx, my, bx, by);
    });
    /* v5.6 — 해로는 바다 쪽으로 부풀린다. 두 후보 중 가운데가 물인 쪽을 고른다
       (예전처럼 한쪽으로만 부풀리면 건업—광릉 배길이 하비 앞 육지를 가로질렀다). */
    const isWater = (x, y) => (typeof SK.landAt === 'function' ? !SK.landAt(x, y) : false);
    SK.SEALANES.forEach(([a, b]) => {
      const A = city(a), B = city(b);
      if (!A || !B) return;
      const ax = A.u * MAPW, ay = A.v * MAPH, bx = B.u * MAPW, by = B.v * MAPH;
      const dx = bx - ax, dy = by - ay;
      const cands = [
        [(ax + bx) / 2 + dy * 0.2, (ay + by) / 2 - dx * 0.2],
        [(ax + bx) / 2 - dy * 0.2, (ay + by) / 2 + dx * 0.2],
      ];
      let mx = cands[0][0], my = cands[0][1];
      if (isWater(cands[1][0], cands[1][1]) && !isWater(cands[0][0], cands[0][1])) {
        mx = cands[1][0]; my = cands[1][1];
      }
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

    if (!lite) buildRelief();
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
        const strength = 12 + 64 * Math.pow(clamp(elev * 1.5, 0, 1), 1.2);
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

    /* ── 도안 A 그림 배경 (확정 지형) ── */
    if (bgState === 'ready' && bgImg) {
      g.fillStyle = '#3f778c';
      g.fillRect(0, 0, MAPW, MAPH);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(bgImg, 0, 0, MAPW, MAPH);
      /* 그림 가장자리를 화면 톤과 이어 준다 — 아주 옅은 파치먼트 김 */
      if (paperPattern) {
        g.globalCompositeOperation = 'soft-light';
        g.globalAlpha = 0.18;
        g.fillStyle = paperPattern;
        g.fillRect(0, 0, MAPW, MAPH);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      renderScale = R;
      canvas.style.opacity = 1;
      return;
    }

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
      const aa = Math.min(0.19, a * 0.34);
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
      g.globalAlpha = 0.42;
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
    /* 숲·산은 부드러운 덩어리라 1.35배면 충분하다 — 모바일 캔버스 메모리를 아낀다 */
    R = clamp(R, 0.8, 1.35);
    const cw = Math.round(MAPW * R), ch = Math.round(MAPH * R);
    if (featCanvas.width !== cw || featCanvas.height !== ch) { featCanvas.width = cw; featCanvas.height = ch; }
    const g = fcx;
    g.setTransform(R, 0, 0, R, 0, 0);
    g.clearRect(0, 0, MAPW, MAPH);
    /* 그림 배경이 깔리면 산·숲·강은 그림에 이미 있다 — 이 레이어는 비워 둔다 */
    if (bgState === 'ready') { featScale = R; return; }
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

    /* ── 산맥 바탕 — 산줄기를 따라 깔리는 흙빛 덩어리 (아주 옅게) ── */
    (SK.MAPGEO.mountains || []).forEach((m) => {
      const flat = m.p;
      const pth = new Path2D();
      pth.moveTo(flat[0], flat[1]);
      for (let i = 2; i < flat.length; i += 2) pth.lineTo(flat[i], flat[i + 1]);
      g.strokeStyle = 'rgba(124,130,94,0.03)';
      g.lineWidth = 26;
      g.stroke(pth);
    });

    /* ── 산맥 — 크기가 다른 봉우리들을 포개 산군처럼 (v5.0.3) ── */
    peaks.forEach((p) => {
      const { x, y, w, h } = p;
      const v = p.v || 0;
      const tall = h > 19;
      /* 발치 그늘 — 산이 땅에 서 있는 느낌만큼만 */
      g.fillStyle = 'rgba(96,104,72,0.10)';
      g.beginPath();
      g.ellipse(x + w * 0.08, y + 1.2, w * 0.62, h * 0.13, 0, 0, Math.PI * 2);
      g.fill();
      /* 몸통 — 좌우 비탈이 비대칭인 부드러운 능선 */
      const apexX = x - w * (0.06 + 0.10 * v);
      g.beginPath();
      g.moveTo(x - w / 2, y + 0.6);
      g.quadraticCurveTo(x - w * 0.26, y - h * 0.52, apexX, y - h);
      g.quadraticCurveTo(x + w * 0.20, y - h * 0.46, x + w / 2, y + 0.6);
      g.closePath();
      const mg = g.createLinearGradient(apexX, y - h, x + w * 0.25, y);
      if (v > 0.5) {
        mg.addColorStop(0, '#b9bc93');
        mg.addColorStop(0.55, '#969d76');
        mg.addColorStop(1, '#7a845f');
      } else {
        mg.addColorStop(0, '#b2b58c');
        mg.addColorStop(0.55, '#8f9770');
        mg.addColorStop(1, '#737e59');
      }
      g.fillStyle = mg;
      g.fill();
      /* 그늘진 오른쪽 비탈 — 낮은 투명도 */
      g.beginPath();
      g.moveTo(apexX, y - h);
      g.quadraticCurveTo(x + w * 0.22, y - h * 0.44, x + w * 0.46, y + 0.4);
      g.lineTo(x + w * 0.02, y + 0.4);
      g.closePath();
      g.fillStyle = 'rgba(74,84,58,0.20)';
      g.fill();
      /* 햇빛 받는 왼쪽 능선 */
      g.beginPath();
      g.moveTo(apexX, y - h);
      g.quadraticCurveTo(x - w * 0.30, y - h * 0.5, x - w * 0.46, y + 0.2);
      g.lineTo(x - w * 0.10, y + 0.2);
      g.closePath();
      g.fillStyle = 'rgba(236,234,202,0.22)';
      g.fill();
      /* 설관 — 아주 높은 봉우리에만, 작게 */
      if (tall && v > 0.82) {
        g.beginPath();
        g.moveTo(apexX, y - h);
        g.lineTo(apexX - w * 0.09, y - h * 0.80);
        g.lineTo(apexX - w * 0.02, y - h * 0.84);
        g.lineTo(apexX + w * 0.05, y - h * 0.79);
        g.closePath();
        g.fillStyle = 'rgba(250,250,244,0.78)';
        g.fill();
      }
      /* 윤곽 — 삼각형이 도드라지지 않게 아주 옅은 선만 */
      g.strokeStyle = 'rgba(70,80,52,0.22)';
      g.lineWidth = 0.55;
      g.beginPath();
      g.moveTo(x - w / 2, y + 0.6);
      g.quadraticCurveTo(x - w * 0.26, y - h * 0.52, apexX, y - h);
      g.quadraticCurveTo(x + w * 0.20, y - h * 0.46, x + w / 2, y + 0.6);
      g.stroke();
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
  let routeScale = 0;
  function renderRoutes(R) {
    if (!routeCanvas) return;
    R = clamp(R || 1.35, 1.2, 2.2);
    const cw = Math.round(MAPW * R), ch = Math.round(MAPH * R);
    if (routeCanvas.width !== cw || routeCanvas.height !== ch) { routeCanvas.width = cw; routeCanvas.height = ch; }
    const g = rcx;
    g.setTransform(R, 0, 0, R, 0, 0);
    g.clearRect(0, 0, MAPW, MAPH);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    /* 육로 — 그림 지형 위에서도 또렷하되 무겁지 않게: 파치먼트 테 → 먹색 밑그림 → 금빛 점선 → 안쪽 하이라이트 */
    g.strokeStyle = 'rgba(255, 246, 220, 0.34)';
    g.lineWidth = 4.2;
    g.stroke(roadPath);
    g.strokeStyle = 'rgba(52,38,14,0.30)';
    g.lineWidth = 2.6;
    g.stroke(roadPath);
    g.setLineDash([6, 5]);
    g.strokeStyle = 'rgba(250,214,128,0.96)';
    g.lineWidth = 1.5;
    g.stroke(roadPath);
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,246,205,0.40)';
    g.lineWidth = 0.6;
    g.stroke(roadPath);
    /* 해로 */
    g.setLineDash([5, 9]);
    g.strokeStyle = 'rgba(18,52,68,0.30)';
    g.lineWidth = 2.6;
    g.stroke(seaPath);
    g.strokeStyle = 'rgba(224,246,250,0.88)';
    g.lineWidth = 1.4;
    g.stroke(seaPath);
    g.setLineDash([]);
    routeScale = R;
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

  /* ══════════════════════════════════════════════════════════════
     v5.30 — 영토 칠하기 캐시
     달이 바뀔 때마다 세력이 바뀌면 영토를 다시 칠한다. 예전에는 칸마다 80거점까지 거리를
     매번 계산해(426,000 × 80 ≈ 3,400만 회) 21성 후반월 전환이 180ms까지 느려졌다.
     거점 위치·종류는 게임 중 거의 바뀌지 않으므로, 칸마다 '가장 가까운 거점 2곳'과
     반경·잡음·경계 번짐만 미리 계산해 두고, 다시 칠할 때는 세력 색만 입힌다.
     ══════════════════════════════════════════════════════════════ */
  let terrGeo = null;
  function territoryGeoKey() {
    let s = SK.CITY_LIST.length + '|';
    for (let i = 0; i < SK.CITY_LIST.length; i++) s += SK.CITY_LIST[i].id + ',';
    return s;
  }
  const RAD_OF = { capital: 132, town: 98, pass: 92, fortress: 96 };
  const BLEND = 34;                       /* world px — 두 세력 색이 번지는 폭 (기존과 같은 눈금) */
  function buildTerritoryGeo() {
    const G = GRID_W * GRID_H;
    const n1 = new Uint8Array(G).fill(255), n2 = new Uint8Array(G).fill(255);
    const d1 = new Uint16Array(G), d2 = new Uint16Array(G);   /* world px × 4 로 저장 (최대 16,383px) */
    const fade = new Uint8Array(G), wob = new Uint8Array(G);
    const visArr = [];
    const list = SK.CITY_LIST.map((c) => ({ u: c.u * MAPW, v: c.v * MAPH, rr: RAD_OF[c.type] || 118 }));
    const unit = MAPW / GRID_W;
    const Q = 4;
    const lim = 65535 / Q;
    /* v5.30 — 경계 잡음은 4칸 간격으로만 계산해 보간한다. 칸마다 fbm을 두 번씩 돌리던
       첫 지도 그리기(150ms대)가 40ms 안쪽으로 줄어든다. */
    const NS = 4;
    const NW = Math.ceil(GRID_W / NS) + 1, NH = Math.ceil(GRID_H / NS) + 1;
    const nz = new Float32Array(NW * NH);
    for (let j = 0; j < NH; j++) {
      const wy = (j * NS + 0.5) * unit;
      for (let i = 0; i < NW; i++) {
        const wx = (i * NS + 0.5) * unit;
        nz[j * NW + i] = (fbm(wx * 0.008, wy * 0.008, 3) - 0.5) * 58 + (fbm(wx * 0.028, wy * 0.028, 2) - 0.5) * 16;
      }
    }
    for (let gy = 0; gy < GRID_H; gy++) {
      const wy = (gy + 0.5) * unit;
      for (let gx = 0; gx < GRID_W; gx++) {
        const wx = (gx + 0.5) * unit;
        const i0 = gy * GRID_W + gx;
        let a1 = 1e12, a2 = 1e12, ia = 255, ib = 255;
        for (let i = 0; i < list.length; i++) {
          const dx = wx - list[i].u, dy = wy - list[i].v;
          const d = dx * dx + dy * dy;
          if (d < a1) { a2 = a1; ib = ia; a1 = d; ia = i; }
          else if (d < a2) { a2 = d; ib = i; }
        }
        if (ia === 255) continue;
        const dist = Math.sqrt(a1);
        const rr = list[ia].rr;
        if (dist > rr) continue;
        fade[i0] = dist <= rr - 44 ? 255 : Math.round((rr - dist) / 44 * 255);
        if (fade[i0] > 0) visArr.push(i0);
        n1[i0] = ia; d1[i0] = Math.min(lim, Math.round(dist * Q));
        if (ib !== 255) { n2[i0] = ib; d2[i0] = Math.min(lim, Math.round(Math.sqrt(a2) * Q)); }
        /* 경계에서 경계선이 자로 그은 듯 곧지 않도록 섞는 잡음 — 위치가 고정이라 한 번만 */
        const fx0 = gx / NS, fy0 = gy / NS;
        const ix = fx0 | 0, iy = fy0 | 0, tx = fx0 - ix, ty = fy0 - iy;
        const za = nz[iy * NW + ix], zb = nz[iy * NW + ix + 1];
        const zc = nz[(iy + 1) * NW + ix], zd = nz[(iy + 1) * NW + ix + 1];
        const w = za * (1 - tx) * (1 - ty) + zb * tx * (1 - ty) + zc * (1 - tx) * ty + zd * tx * ty;
        wob[i0] = Math.max(0, Math.min(255, Math.round((w + 37) / 74 * 255)));
      }
    }
    const visList = Int32Array.from(visArr);
    return { key: territoryGeoKey(), n1, n2, d1, d2, fade, wob, vis: visList };
  }

  function drawTerritory() {
    if (!terrCanvas || !SK.state) return;
    const list = SK.CITY_LIST.map((c) => {
      const t = SK.state.cities[c.id];
      return { id: c.id, u: c.u * MAPW, v: c.v * MAPH, type: c.type, owner: t ? t.owner : 'neutral' };
    });
    const ownGrid = new Int16Array(GRID_W * GRID_H).fill(-1);
    const img = new ImageData(GRID_W, GRID_H);
    const dat = img.data;
    const colors = {};
    /* 물감이 종이에 번지는 느낌 — 세력색을 파치먼트 쪽으로 살짝 무명하게 섞는다 */
    const PAPER = [232, 219, 184];
    const mixPaper = (rgb, k) => [
      Math.round(rgb[0] + (PAPER[0] - rgb[0]) * k),
      Math.round(rgb[1] + (PAPER[1] - rgb[1]) * k),
      Math.round(rgb[2] + (PAPER[2] - rgb[2]) * k),
    ];
    const colorOf = (o) => {
      if (!o || o === 'neutral') return null;
      if (!colors[o]) {
        const c = (SK.factionInfo ? SK.factionInfo(o).color : '#8b8777') || '#8b8777';
        colors[o] = {
          rgb: mixPaper([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)], 0.16),
        };
      }
      return colors[o].rgb;
    };
    if (!terrGeo || terrGeo.key !== territoryGeoKey()) terrGeo = buildTerritoryGeo();
    const { n1, n2, d1, d2, fade, wob, vis } = terrGeo;
    const invB = 1 / BLEND;
    const nearLimit = 300 * 4;            /* 이보다 먼 두 번째 거점은 경계 번짐에 닿지 않는다 */
    /* v5.30 — 영토가 칠해지는 칸만 모아 둔 목록(vis)을 돌린다. 426,000칸 전부를 매달
       훑지 않으므로 달 넘김의 지도 갱신이 가벼워진다. */
    for (let vi = 0; vi < vis.length; vi++) {
      const i0 = vis[vi];
      const gx = i0 % GRID_W, gy = (i0 / GRID_W) | 0;
      {
        const fv = fade[i0];
        const ia = n1[i0];
        const o = i0 * 4;
        const rgb1 = colorOf(list[ia].owner);
        if (!rgb1) { dat[o + 3] = 0; continue; }
        let ib = n2[i0];
        let d2v = d2[i0];
        if (ib !== 255 && list[ib].owner === list[ia].owner) {
          /* 두 번째로 가까운 거점이 같은 세력이면, 가까운 편일 때만 다른 세력을 다시 찾는다 */
          if (d2v - d1[i0] < nearLimit) {
            let best = 1e12, bi = -1;
            for (let i = 0; i < list.length; i++) {
              if (list[i].owner === list[ia].owner) continue;
              const dx = (gx + 0.5) * (MAPW / GRID_W) - list[i].u, dy = (gy + 0.5) * (MAPH / GRID_W) - list[i].v;
              const dd = Math.sqrt(dx * dx + dy * dy);
              if (dd < best) { best = dd; bi = i; }
            }
            ib = bi;
            if (ib >= 0) d2v = Math.min(65535, Math.round(best * 4)); else d2v = 65535;
          } else ib = 255;
        }
        let b = 0, rgb2 = null, seam = 1;
        if (ib !== 255 && ib >= 0) {
          const wv = (wob[i0] / 255) * 74 - 37;
          const gap = (d2v - d1[i0]) / 4 + wv;
          if (gap < BLEND) {
            let t = gap * invB;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            t = t * t * (3 - 2 * t);
            seam = 0.14 + 0.86 * t;
            b = 0.30 * (1 - t);
            rgb2 = colorOf(list[ib].owner) || PAPER;
          }
        }
        let r = rgb1[0], gg = rgb1[1], bb = rgb1[2];
        if (b > 0 && rgb2) {
          r = Math.round(r * (1 - b) + rgb2[0] * b);
          gg = Math.round(gg * (1 - b) + rgb2[1] * b);
          bb = Math.round(bb * (1 - b) + rgb2[2] * b);
        }
        dat[o] = r; dat[o + 1] = gg; dat[o + 2] = bb;
        dat[o + 3] = Math.round(255 * 0.30 * (fv / 255) * seam);
        ownGrid[i0] = ia;
      }
    }

    /* ── 영토 테두리 — 이웃 칸이 다른 세력이면 그 세력 색을 진하게 둘러 경계를 읽게 한다 ── */
    for (let vi = 0; vi < vis.length; vi++) {
      const i0 = vis[vi];
      const gx = i0 % GRID_W, gy = (i0 / GRID_W) | 0;
      {
        const me = ownGrid[i0];
        if (me < 0) continue;
        let edge = false;
        if (gx > 0 && ownGrid[i0 - 1] >= 0 && ownGrid[i0 - 1] !== me) edge = true;
        else if (gx < GRID_W - 1 && ownGrid[i0 + 1] >= 0 && ownGrid[i0 + 1] !== me) edge = true;
        else if (gy > 0 && ownGrid[i0 - GRID_W] >= 0 && ownGrid[i0 - GRID_W] !== me) edge = true;
        else if (gy < GRID_H - 1 && ownGrid[i0 + GRID_W] >= 0 && ownGrid[i0 + GRID_W] !== me) edge = true;
        if (!edge) continue;
        const rgb = colorOf(list[me].owner);
        if (!rgb) continue;
        const o = i0 * 4;
        const k = 0.72;
        dat[o] = Math.round(rgb[0] * k);
        dat[o + 1] = Math.round(rgb[1] * k);
        dat[o + 2] = Math.round(rgb[2] * k);
        dat[o + 3] = Math.max(dat[o + 3], 190);
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
    /* 물감이 종이에 스민 느낌 — 업스케일할 때 살짝 흐리게 */
    g.filter = 'blur(2px)';
    g.drawImage(small, 0, 0, cw, ch);
    g.filter = 'none';
    /* 바다로 새지 않게 육지 모양으로 오려낸다 */
    g.setTransform(TERR_SCALE, 0, 0, TERR_SCALE, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    if (landReady && landImg) {
      /* v5.6 — 배경 그림의 육지 모양으로 오려낸다 (옛 폴리곤은 그림 해안선과 어긋난다) */
      g.imageSmoothingEnabled = true;
      g.drawImage(landImg, 0, 0, MAPW, MAPH);
    } else {
      g.fillStyle = '#fff';
      g.fill(landPath);
    }
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
    /* v5.41 — 예전에는 지도 밖으로 90px까지 밀 수 있어 화면 위쪽에 검은 띠가 남았다.
       지도 끝은 화면 끝에 딱 맞춘다 (더 밀어낼 여백 없음). */
    const padX = 0, padY = 0;
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
      const rs = clamp((window.devicePixelRatio || 1) * cam.s, 1.3, 2.0);
      if (!routeScale || Math.abs(rs - routeScale) / routeScale > 0.2) renderRoutes(rs);
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
  let marchEls = [];
  function syncMarchMarks() {
    if (!markersEl) return;
    const list = (SK.state && SK.state.marches) || [];
    markersEl.querySelectorAll('.march-mark').forEach((el) => el.remove());
    /* v5.47 — [성에서 기다리기]로 다음 달로 미뤄진 침공: 성 위에 붉은 ⚔ 표식을 붙인다 */
    const sieges = [];
    if (SK.state) {
      const turn = SK.state.turn || 0;
      const q = SK.state.pendingInvasion;
      if (q && q.due && q.due > turn) sieges.push(q);
      ((SK.state.invasionQueue || []) || []).forEach((w) => { if (w && w.due && w.due > turn) sieges.push(w); });
    }
    marchEls = list.map((m) => {
      const el = document.createElement('div');
      el.className = 'march-mark';
      el.innerHTML = `<span class="mm-dot">⚔</span><span class="mm-tag">행군</span>`;
      markersEl.appendChild(el);
      return { m, el, tag: el.querySelector('.mm-tag') };
    }).concat(sieges.map((inv) => {
      const el = document.createElement('div');
      el.className = 'march-mark siege-soon';
      el.innerHTML = `<span class="mm-dot">⚔</span><span class="mm-tag">내달 성 아래</span>`;
      markersEl.appendChild(el);
      return { inv, siege: true, el, tag: el.querySelector('.mm-tag') };
    }));
    placeMarchMarks();
  }

  function placeMarchMarks() {
    if (!marchEls.length) return;
    const s = cam.s;
    marchEls.forEach((entry) => {
      const m = entry.m, el = entry.el, tag = entry.tag;
      /* v5.47 — 미뤄진 침공 표식은 길 위가 아니라 목표 성 위에 붙는다 */
      if (entry.siege) {
        const c = entry.inv ? city(entry.inv.target) : null;
        if (!c) return;
        el.style.transform = `translate3d(${(cam.tx + c.u * MAPW * s).toFixed(2)}px, ${(cam.ty + c.v * MAPH * s).toFixed(2)}px, 0)`;
        return;
      }
      const path = SK.roadPoints(m.origin, m.target);
      if (!path || path.length < 2) return;
      const prog = Math.max(0.22, Math.min(0.94, 1 - Math.max(0, m.left) / Math.max(1, m.total)));
      const idx = prog * (path.length - 1);
      const i0 = Math.floor(idx), i1 = Math.min(path.length - 1, i0 + 1), f = idx - i0;
      const px = path[i0][0] + (path[i1][0] - path[i0][0]) * f;
      const py = path[i0][1] + (path[i1][1] - path[i0][1]) * f;
      el.style.transform = `translate3d(${(cam.tx + px * s).toFixed(2)}px, ${(cam.ty + py * s).toFixed(2)}px, 0)`;
      const leg = Math.min(m.total, Math.max(1, m.total - m.left + 1));
      /* v5.65 — 턴은 한 달 — '행군 1/2일'이 아니라 '행군 1/2개월' */
      if (tag) tag.textContent = `행군 ${leg}/${m.total}개월`;
    });
  }

  function buildMarkers() {
    markersEl.innerHTML = '';
    marks = SK.CITY_LIST.map((c) => {
      const b = document.createElement('button');
      b.className = `marker t-${c.type}`;
      b.dataset.id = c.id;
      b.innerHTML = `
        <span class="m-hit"></span>
        <img class="m-icon" src="assets/icons/${ICON_SRC[c.type]}.webp" alt="" draggable="false" />
        <span class="m-roof" aria-hidden="true"><i class="r1"></i><i class="r2"></i><i class="r3"></i></span>
        <span class="m-flag"><b class="m-lv">1</b></span>
        <span class="m-badge" hidden></span>
        <span class="m-label">${c.name}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        /* v5.10 — 거점을 끌어 지도를 옮긴 경우에는 열지 않는다.
           탭(8px 미만)은 제스처 쪽에서 이미 열었으므로 중복 호출도 막는다 */
        if (performance.now() - lastTapHandled < 600) return;
        if (drag && drag.moved >= 8) return;
        onMarker(c.id);
      });
      /* v5.10 — 거점 위에서도 지도를 끌 수 있게 pointerdown 차단을 없앴다.
         (탭 = 거점 선택 / 드래그 = 지도 이동은 bindGestures가 판정한다) */
      markersEl.appendChild(b);
      return { id: c.id, el: b, city: c, anchor: 0, lw: 0, lh: 0, hidden: false,
        flagEl: b.querySelector('.m-flag'), labelEl: b.querySelector('.m-label'), lvEl: b.querySelector('.m-lv'),
        badgeEl: b.querySelector('.m-badge') };
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
    placeMarchMarks();
  }

  /* 라벨 겹침 해소 — 아이콘·이름이 서로 겹치지 않게 자리를 고르고, 자리가 없으면 잠시 감춘다 */
  /* v5.26 — 지도 위에 떠 있는 UI(오른쪽 조작 버튼·범례)는 라벨이 비켜 간다. */
  function mapObstacles() {
    if (!vp) return [];
    const v = vp.getBoundingClientRect();
    const out = [];
    /* v5.36 — 지도 타겟 선택 중에는 아래 안내 바도 장애물로 본다 (성 이름이 바 밑으로 숨지 않게) */
    ['.map-controls', '#map-legend', '#map-pick-bar'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden || !el.offsetParent) return;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return;
      out.push([b.left - v.left - 3, b.top - v.top - 3, b.width + 6, b.height + 6, 1]);
    });
    return out;
  }
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
    const obstacles = mapObstacles();
    const vw = (vp && vp.getBoundingClientRect().width) || 0;
    const vh = (vp && vp.getBoundingClientRect().height) || 0;
    order.forEach((m) => {
      const o = iconOf[m.id];
      const iw = o.iw, ih = o.ih;
      const iconRect = [o.x - iw / 2, o.y - ih, iw, ih];
      let iconOverlap = 0;
      for (let i = 0; i < placedIcons.length; i++) iconOverlap += overlap(iconRect, placedIcons[i]);
      const isSel = m.el.classList.contains('sel');
      const owned = st(m.id) && st(m.id).owner === pf;
      const pickOn = !!pickCfg && pickCfg.ids.has(m.id);
      const keep = isSel || owned || pickOn;
      /* 아주 멀리서는 소도시부터, 그다음 중도시를 숨겨 개요 지도를 깔끔하게 (대도시는 남긴다) */
      const farHide = !isSel && !owned && (
        (s < 0.26 && m.city.type === 'town')
        || (s < 0.23 && m.city.type === 'mid')
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
      /* v5.36 — 지도 타겟 선택 중 고를 수 있는 성은 아이콘 위 배지와 엇갈리지 않게 아래 자리만 쓴다 */
      const cands = pickOn ? c.filter((x) => x.a === 3) : c;
      for (let ci = 0; ci < cands.length; ci++) {
        const cand = cands[ci];
        const bx = o.x + cand.dx + (cand.al === 'c' ? -lw / 2 : 0);
        const rect = [bx, o.y + cand.dy, lw, lh];
        let score = ci * 1.2;      /* 가까운 자리를 살짝 선호 */
        for (let bi = 0; bi < boxes.length; bi++) {
          const ov = overlap(rect, boxes[bi]);
          if (ov) score += ov * (boxes[bi][4] === 1 ? 1.15 : 1.0);
        }
        /* v5.26 — 조작 버튼·범례 밑으로는 이름을 두지 않는다 (거의 금지) */
        for (let oi = 0; oi < obstacles.length; oi++) {
          const ov = overlap(rect, obstacles[oi]);
          if (ov) score += 6000 + ov * 4;
        }
        /* 화면 밖으로 잘려 나가는 자리도 피한다 */
        if (vw) {
          if (rect[0] < 2) score += (2 - rect[0]) * 60 + 900;
          if (rect[0] + rect[2] > vw - 2) score += (rect[0] + rect[2] - vw + 2) * 60 + 900;
        }
        if (vh) {
          if (rect[1] < 2) score += 900;
          if (rect[1] + rect[3] > vh - 2) score += (rect[1] + rect[3] - vh + 2) * 40 + 500;
        }
        if (score < bestScore) { bestScore = score; best = { a: cand.a, rect, al: cand.al, dx: cand.dx, dy: cand.dy }; }
        if (score <= 0.5) break;
      }
      const area = lw * lh;
      /* 배율별 이름 표시 — 멀리서는 대도시·관문·내 성만, 가까이서는 전부 */
      let labelOk = true;
      if (s < 0.30) labelOk = m.city.type === 'capital' || isSel || owned;
      else if (s < 0.52) labelOk = (m.city.type !== 'town' && m.city.type !== 'mid') || isSel || owned;
      if (pickOn) labelOk = true;   // v5.36 — 고를 수 있는 성 이름은 늘 보인다
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

  /* ══════════════════════════════════════════════════════════════
     v5.36 — 지도에서 대상 거점 고르기 (내정 명령의 '어느 성을 고를까')
     고를 수 있는 거점만 금빛 테넌로 두드리고, 아이콘 위에 배지(병력·거리·미정찰 등)를 붙인다.
     탭은 onPick 으로 보내고, 가를 수 없는 성은 토스트로 돌려준다.
     ══════════════════════════════════════════════════════════════ */
  let pickCfg = null;   // { ids:Set, origin, chips:{}, block, onPick }

  function setPick(cfg) {
    pickCfg = cfg ? {
      ids: new Set(cfg.ids || []), origin: cfg.origin || null,
      chips: cfg.chips || {}, block: cfg.block || '지금은 고를 수 없는 거점입니다.',
      onPick: cfg.onPick || null,
    } : null;
    const scr = document.getElementById('screen-map');
    if (scr) scr.classList.toggle('picking', !!pickCfg);
    if (pickCfg) {
      marks.forEach((m) => m.el.classList.remove('sel'));
      focusPicker(Array.from(pickCfg.ids), pickCfg.origin);
    }
    refreshPick();
  }

  function paintPick() {
    if (!marks.length) return;
    marks.forEach((m) => {
      const on = !!pickCfg && pickCfg.ids.has(m.id);
      const isOrigin = !!pickCfg && pickCfg.origin === m.id;
      m.el.classList.toggle('pickable', on);
      /* 출발 성은 흐리게 두지 않는다 — 어디서 보내는지 늘 보이게 */
      m.el.classList.toggle('pick-off', !!pickCfg && !on && !isOrigin);
      m.el.classList.toggle('pick-origin', isOrigin);
      if (m.badgeEl) {
        const txt = on ? (pickCfg.chips[m.id] || '') : (isOrigin ? '출발' : '');
        if (m.badgeEl.textContent !== txt) m.badgeEl.textContent = txt;
        m.badgeEl.hidden = !txt;
      }
    });
  }

  function refreshPick() {
    if (!marks.length) return;
    paintPick();
    labelAnchorDirty = true;
    placeMarks();
  }

  /* 고를 거점들이 한 화면에 들어오게 맞춘다 — 출발 성도 함께 본다 */
  function focusPicker(ids, origin) {
    if (!vp) return;
    const list = (ids || []).map((id) => city(id)).filter(Boolean);
    const o = origin ? city(origin) : null;
    if (o) list.push(o);
    if (!list.length) { fitAll(); return; }
    let minU = 9, maxU = -9, minV = 9, maxV = -9;
    list.forEach((c) => {
      minU = Math.min(minU, c.u); maxU = Math.max(maxU, c.u);
      minV = Math.min(minV, c.v); maxV = Math.max(maxV, c.v);
    });
    const { w, h } = viewSize();
    if (!w || !h) return;
    const spanU = Math.max(0.014, maxU - minU), spanV = Math.max(0.014, maxV - minV);
    /* 아래 띠(안내 바)에 가리지 않게 화면 높이의 62%만 쓴다 */
    const s = clamp(Math.min((w * 0.78) / (spanU * MAPW), (h * 0.62) / (spanV * MAPH)),
      fitScale() * 0.99, 1.25);
    labelAnchorDirty = true;
    centerOn(((minU + maxU) / 2) * MAPW, ((minV + maxV) / 2) * MAPH, s);
  }

  function onMarker(id) {
    if (pickCfg) {
      if (pickCfg.ids.has(id)) {
        const cb = pickCfg.onPick;
        if (cb) cb(id);
        return;
      }
      if (SK.toast) SK.toast(pickCfg.block);
      return;
    }
    const t = st(id);
    const mine = t.owner === playerFaction();
    if (mine) SK.openCity(id);
    else { SK.openCitySheet(id); focusCity(id, true); }
    marks.forEach((m) => m.el.classList.toggle('sel', m.id === id));
  }

  function refresh() {
    if (!SK.state || !marks.length) return;
    /* v5.10 — 달이 바뀌어 계절이 달라지면 계절 지도·파티클을 갈아입는다 */
    const nowSeason = seasonKey();
    if (nowSeason !== bgSeason) {
      loadBg(nowSeason);
      if (seasonCanvas && SK.seasonFX) SK.seasonFX.reseed(seasonCanvas);
    }
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
    paintPick();
    labelAnchorDirty = true;
    placeMarks();
    syncMarchMarks();
  }

  /* ───────────── 제스처 ───────────── */
  let pointers = new Map();
  let drag = null, pinch = null, inertia = 0, vx = 0, vy = 0;
  let lastTap = { t: 0, x: 0, y: 0 };
  let lastTapHandled = 0;   // v5.10 — 제스처가 거점을 연 직후의 click 중복 방지

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
          px: e.clientX, py: e.clientY, t: performance.now(), moved: 0, vx: 0, vy: 0,
          downTarget: e.target   /* v5.10 — 탭한 대상(거점 마커)을 기억한다 */ };
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
            /* v5.10 — 8px 미만 = 탭: 거점 위라면 그 성을 연다 */
            const mk = drag.downTarget && drag.downTarget.closest ? drag.downTarget.closest('.marker') : null;
            if (mk && mk.dataset && mk.dataset.id) {
              lastTapHandled = performance.now();
              const sheet = $('#city-sheet');
              if (sheet && !sheet.hidden) SK.closeCitySheet();
              onMarker(mk.dataset.id);
            } else {
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
    const lgBtn = $('#legend-toggle'), lgBox = $('#map-legend');
    if (lgBtn && lgBox) {
      lgBtn.onclick = (e) => {
        e.stopPropagation();
        const open = lgBox.hidden;
        lgBox.hidden = !open;
        lgBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
    }
    /* v5.38 — 성 정보 시트가 열려 있는 동안 지도 조작 버튼·범례를 숨긴다.
       가로 한 줄이던 시절 시트의 [출진·공격]·[정찰 보내기]·[닫기] 위를 덮었다(실기기 스샷).
       시트는 여러 곳에서 hidden만 바꾸므로 속성 변화를 지켜 #screen-map.sheet-open을 맞춘다. */
    const sheetEl = $('#city-sheet'), mapScreenEl = $('#screen-map');
    const syncSheetOpen = () => {
      if (!mapScreenEl) return;
      mapScreenEl.classList.toggle('sheet-open', !!(sheetEl && !sheetEl.hidden));
      labelAnchorDirty = true;
    };
    if (sheetEl) {
      if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(syncSheetOpen).observe(sheetEl, { attributes: true, attributeFilter: ['hidden'] });
      }
      syncSheetOpen();
    }
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
  /* ───────────── 도안 A 배경 이미지 ───────────── */
  function loadBg(season) {
    if (typeof Image === 'undefined') { bgState = 'failed'; return; }
    const sk = season || seasonKey();
    const url = BG_SEASON[sk] || BG_URL;
    bgSeason = sk;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      bgImg = img;
      bgState = 'ready';
      /* v5.41 — 지도 밖 여백에는 같은 그림을 흐리게 깔아 검은 띠 대신 지도가 이어진 것처럼 보이게 한다 */
      const vpEl = vp || $('#world-viewport');
      if (vpEl) {
        vpEl.style.backgroundImage = `url("${url}")`;
        vpEl.classList.add('has-bleed');
      }
      if (!built) return;
      renderTerrain(renderScale || 1.25);
      renderFeatures(featScale || 1.25);
    };
    img.onerror = () => {
      /* 계절 그림을 못 받으면 기본 지도로, 그것도 안 되면 옛 절차적 지형으로 */
      if (url !== BG_URL) { loadBg('summer'); return; }
      bgState = 'failed';
      if (!built) return;
      buildStatic(false);
      renderTerrain(renderScale || 1.25);
      renderFeatures(featScale || 1.25);
    };
    img.src = url;
  }

  function loadLand() {
    if (typeof Image === 'undefined') return;
    landImg = new Image();
    landImg.decoding = 'async';
    landImg.onload = () => { landReady = true; if (built && SK.state) drawTerritory(); };
    landImg.onerror = () => { landReady = false; };
    landImg.src = LAND_URL;
  }

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
    /* v5.10 — 지도 위 계절 파티클 (지도 판 위에 고정, 포인터는 통과) */
    if (markersEl && markersEl.parentNode && !seasonCanvas) {
      seasonCanvas = document.createElement('canvas');
      seasonCanvas.className = 'season-fx map-season';
      seasonCanvas.setAttribute('aria-hidden', 'true');
      markersEl.parentNode.insertBefore(seasonCanvas, markersEl);
      if (SK.seasonFX) SK.seasonFX.attach(seasonCanvas, function () { return seasonKey(); });
    }
    buildStatic(bgState !== 'failed');
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
    /* v5.36 — 지도 타겟 선택 모드 */
    setPick(cfg) { setPick(cfg); },
    pickInfo() {
      return pickCfg ? { ids: Array.from(pickCfg.ids), origin: pickCfg.origin, chips: pickCfg.chips } : null;
    },
    pickables() { return marks.filter((m) => m.el.classList.contains('pickable')).map((m) => m.id); },
    pickState() {
      return marks.filter((m) => m.el.classList.contains('pickable')).map((m) => ({
        id: m.id, badge: (m.badgeEl && !m.badgeEl.hidden) ? m.badgeEl.textContent : '',
        labelOff: !!(m.labelEl && m.labelEl.classList.contains('off')),
      }));
    },
    get scale() { return cam.s; },
    setScale(s) { setScaleTo(s); },
    relayout() { if (!built) return; if (!vp.getBoundingClientRect().width) return; clampCam(); apply(); },
    open(id) { onMarker(id); },
    /* 테스트/검증용 */
    debug() {
      return {
        built, scale: cam.s, tx: cam.tx, ty: cam.ty, marks: marks.length,
        /* v5.30 — 영토 다시 칠하기·캐시 만들기 시간 측정 */
        terrRedraw() {
          const t0 = performance.now();
          terrSig = '';               // 시그니처를 비워 강제로 다시 칠하게
          drawTerritory();
          return +(performance.now() - t0).toFixed(1);
        },
        terrBuild() {
          terrGeo = null; terrSig = '';
          const t0 = performance.now();
          drawTerritory();
          return +(performance.now() - t0).toFixed(1);
        },
        terrCells() { return terrGeo ? terrGeo.vis.length : 0; },
        renderScale, labelCount: document.querySelectorAll('.m-label').length,
        labelsHidden: marks.filter((m) => m.hidden).length,
        trees: trees.length, peaks: peaks.length, fields: fields.length,
        hasRelief: !!reliefCanvas, territory: !!terrCanvas, features: !!featCanvas, routes: !!routeCanvas,
        season: bgSeason, bg: bgState, fxCount: (seasonCanvas && SK.seasonFX) ? SK.seasonFX.count(seasonCanvas) : 0,
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
    loadBg();
    loadLand();
    setTimeout(() => { try { window.SKMap.init(); } catch (e) { console.error(e); } }, 60);
  });
})();
