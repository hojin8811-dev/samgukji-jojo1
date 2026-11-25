/* =====================================================================
 * 《삼국지-꼬마영웅 난타전》 patch_v584.js  — 연출 · 대사 패치
 *
 *  v5.84 — 본편(js/battle.js)에 그대로 물렸다:
 *    · castUlt → 380ms 뒤 데미지 계산, 760ms 뒤 V584_ULT_FX.play(대상 칸·계열·등급·색·실제 데미지)
 *    · 일기토 duelTalk → S·A급이면 V584.duelLine(이름, open|clash|win|lose)
 *    · 포로 모달 openPrisoners → V584.captureLine(이름)
 *    · 승전 결산 battleReportHTML → V584.mvpLine(MVP 장수)
 *  본편 필살기 e 객체는 효과 종류를 `k`(hit/combo/aoe/line/magic/rock/arrow/arrowAoe/buff/heal/debuff)로
 *  적는다. kindOf 가 그 k를 먼저 읽고, 없을 때만 아래 v5.82식 추론으로 넘어간다.
 *
 *  1) window.V584_ULT_FX      필살기 타격 임팩트 (Canvas + DOM)
 *  2) window.V584_DUEL_LINES  일기토 코믹·귀여운 대사 (67명 + 폴백 풀 22종)
 *  3) window.V584_EXTRA_LINES 포로(capture) / 승전 MVP(mvp) 대사
 *  4) window.V584             조회 헬퍼 (duelLine / captureLine / mvpLine)
 *
 * 사용 예
 *   V584_ULT_FX.play({ kind:'hit', tier:'S', color:'255,90,70',
 *                      targetElOrRect: enemyEl, dmgText:'1,284' });
 *   V584_ULT_FX.play({ kind: V584_ULT_FX.kindOf(ultE), tier:'S', ... }); // v5.82 e 객체 연동
 *   V584.duelLine('여포','open')   // phase: open | clash | win | lose
 *   V584.captureLine('관우')       V584.mvpLine(heroObj)
 *
 * 설정: V584_ULT_FX.config = { enabled, shake, hitstop, maxDpr }
 * 주의: 쉐이크는 #battleField 등 전장 요소를 흔들고, 없으면 body를 짧게 흔듭니다.
 *       필요하면 opts.shakeEl 로 흔들 요소를 직접 지정하세요.
 * ===================================================================== */

/* =====================================================================
 * 1. 필살기 타격 연출
 * ===================================================================== */
(function (g) {
  'use strict';

  var CFG = { enabled: true, shake: true, hitstop: true, maxDpr: 2, z: 2147483000 };
  var reduced = false;
  try { reduced = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }

  var TIER = {
    S: { vig: 0.88, vigMs: 450, shake: 8, stop: 110, mul: 1.6, pop: 58, flash: 0.55, label: '필살!' },
    A: { vig: 0.58, vigMs: 300, shake: 5, stop: 60, mul: 1, pop: 44, flash: 0.35, label: '강타!' }
  };
  var COLORS = {
    hit: '255,90,70', aoe: '255,170,60', magic: '170,110,255', buff: '255,214,90',
    debuff: '150,70,200', heal: '110,230,150', arrow: '240,230,200', combo: '255,110,90'
  };
  var SHAKE_SEL = ['#battleField', '#battlefield', '#battle-field', '#battleStage', '#battleScreen', '#battle', '#battleView', '#gameBoard', '#game', '#app', 'main'];

  var root, cv, cx, W = 0, H = 0, dpr = 1, parts = [], clock = 0, lastTs = 0, raf = 0, stopUntil = 0;

  function R(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rgba(c, a) { return 'rgba(' + c + ',' + a + ')'; }
  function lighten(c, k) { return c.split(',').map(function (n) { n = +n; return Math.round(n + (255 - n) * k); }).join(','); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
  function validColor(c) { return (typeof c === 'string' && /^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/.test(c)) ? c.replace(/\s+/g, '') : null; }

  /* ---------- 마운트 / 캔버스 ---------- */
  function resize() {
    if (!cv) return;
    dpr = Math.min(CFG.maxDpr, g.devicePixelRatio || 1);
    W = g.innerWidth; H = g.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  function mount() {
    if (root && root.parentNode) return;
    root = document.createElement('div');
    root.id = 'v584-fx-root';
    root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:' + CFG.z + ';overflow:hidden;';
    cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;';
    root.appendChild(cv);
    document.documentElement.appendChild(root);
    cx = cv.getContext('2d');
    resize();
    g.addEventListener('resize', resize);
  }

  function rectOf(t) {
    var r = null;
    if (t && t.getBoundingClientRect) r = t.getBoundingClientRect();
    else if (t && typeof t === 'object') {
      r = {
        left: (t.left != null ? t.left : t.x) || 0, top: (t.top != null ? t.top : t.y) || 0,
        width: (t.width != null ? t.width : t.w) || 0, height: (t.height != null ? t.height : t.h) || 0
      };
    }
    if (!r || (!r.width && !r.height && !r.left && !r.top)) r = { left: W * 0.5 - 30, top: H * 0.45 - 30, width: 60, height: 60 };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.max(r.width, 24), h: Math.max(r.height, 24) };
  }

  /* ---------- 파티클 엔진 ---------- */
  function add(k, delay, dur, o) {
    o.k = k; o.s = clock + delay; o.d = dur; parts.push(o);
    if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); }
  }
  function loop(ts) {
    raf = 0;
    if (!cx) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(50, ts - lastTs); lastTs = ts;
    if (performance.now() < stopUntil) dt = 0;         // 히트스톱: 시간 정지
    clock += dt;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], age = clock - p.s;
      if (age < 0) continue;
      if (age >= p.d) { parts.splice(i, 1); i--; if (p.end) p.end(p); continue; }
      cx.save();
      cx.globalCompositeOperation = p.comp || 'lighter';
      DRAW[p.k](p, age / p.d, age);
      cx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(loop);
    else { cx.clearRect(0, 0, W, H); lastTs = 0; }
  }

  var DRAW = {
    /* 검기 슬래시 아크 */
    arc: function (p, t) {
      var e = 1 - Math.pow(1 - Math.min(1, t * 1.8), 3), a1 = p.a0 + p.sw * e;
      var tail = p.sw > 0 ? Math.max(p.a0, a1 - p.sw * 0.55) : Math.min(p.a0, a1 - p.sw * 0.55);
      var al = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55);
      cx.lineCap = 'round';
      var L = [[p.w * 3.2, 0.28, p.c], [p.w * 1.6, 0.75, p.c], [p.w * 0.7, 1, '255,255,255']];
      for (var i = 0; i < L.length; i++) {
        cx.beginPath(); cx.arc(p.x, p.y, p.r, tail, a1, p.sw < 0);
        cx.strokeStyle = rgba(L[i][2], L[i][1] * al); cx.lineWidth = L[i][0];
        cx.shadowBlur = i === 0 ? 18 : 0; cx.shadowColor = rgba(p.c, 0.9);
        cx.stroke();
      }
    },
    /* 번개 */
    bolt: function (p, t) {
      var al = (Math.floor(t * 10) % 2 === 0 ? 1 : 0.55) * (1 - t * 0.6);
      cx.lineJoin = 'round'; cx.lineCap = 'round';
      [[p.w * 3, 0.35, p.c], [p.w * 1.1, 1, '255,255,255']].forEach(function (s) {
        cx.beginPath(); cx.moveTo(p.pts[0][0], p.pts[0][1]);
        for (var i = 1; i < p.pts.length; i++) cx.lineTo(p.pts[i][0], p.pts[i][1]);
        cx.strokeStyle = rgba(s[2], s[1] * al); cx.lineWidth = s[0];
        cx.shadowBlur = 16; cx.shadowColor = rgba(p.c, 1); cx.stroke();
      });
    },
    /* 불꽃 튀김 */
    spark: function (p, t, age) {
      var s = age / 1000, x = p.x + p.vx * s, y = p.y + p.vy * s + 0.5 * p.g * s * s;
      var x2 = x - p.vx * 0.025, y2 = y - (p.vy + p.g * s) * 0.025;
      cx.lineCap = 'round'; cx.strokeStyle = rgba(p.c, 1 - t); cx.lineWidth = Math.max(0.5, p.w * (1 - t));
      cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x2, y2); cx.stroke();
    },
    /* 충격파 링 */
    ring: function (p, t) {
      var e = 1 - Math.pow(1 - t, 3), r = p.r0 + (p.r1 - p.r0) * e;
      cx.beginPath(); cx.ellipse(p.x, p.y, Math.max(1, r), Math.max(1, r * (p.sq || 1)), 0, 0, 6.2832);
      cx.strokeStyle = rgba(p.c, (1 - t) * (p.a == null ? 1 : p.a)); cx.lineWidth = Math.max(0.5, p.w * (1 - t));
      cx.shadowBlur = p.comp ? 0 : 14; cx.shadowColor = rgba(p.c, 0.9); cx.stroke();
    },
    /* 폭발 글로우 */
    glow: function (p, t) {
      var r = p.r * (0.5 + 0.5 * t), a = Math.pow(1 - t, 1.6) * (p.a == null ? 1 : p.a);
      var gr = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, rgba('255,255,255', a)); gr.addColorStop(0.35, rgba(p.c, a * 0.8)); gr.addColorStop(1, rgba(p.c, 0));
      cx.fillStyle = gr; cx.beginPath(); cx.arc(p.x, p.y, r, 0, 6.2832); cx.fill();
    },
    /* 화염 잔불 */
    ember: function (p, t, age) {
      var s = age / 1000, x = p.x + p.vx * s, y = p.y + p.vy * s + 0.5 * p.g * s * s;
      cx.fillStyle = rgba(t < 0.3 ? lighten(p.c, 0.6) : p.c, 1 - t);
      cx.beginPath(); cx.arc(x, y, Math.max(0.5, p.r * (1 - t)), 0, 6.2832); cx.fill();
    },
    /* 화살 */
    arrow: function (p, t) {
      var e = t * t, x = p.sx + (p.tx - p.sx) * e, y = p.sy + (p.ty - p.sy) * e;
      var dx = p.tx - p.sx, dy = p.ty - p.sy, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
      cx.lineCap = 'round';
      cx.strokeStyle = rgba(p.c, 0.9); cx.lineWidth = 2.4; cx.shadowBlur = 8; cx.shadowColor = rgba(p.c, 1);
      cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - ux * 46, y - uy * 46); cx.stroke();
      cx.strokeStyle = 'rgba(255,255,255,.95)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - ux * 30, y - uy * 30); cx.stroke();
    },
    /* 상승 반짝이 (버프/회복) */
    rise: function (p, t, age) {
      var s = age / 1000, x = p.x + Math.sin(s * p.f + p.ph) * p.amp, y = p.y - p.v * s;
      var r = p.r * (1 - t * 0.5), al = Math.sin(Math.PI * Math.min(1, t));
      cx.strokeStyle = rgba(p.c, al); cx.lineWidth = 2; cx.shadowBlur = 10; cx.shadowColor = rgba(p.c, 0.9);
      cx.beginPath(); cx.moveTo(x - r, y); cx.lineTo(x + r, y); cx.moveTo(x, y - r); cx.lineTo(x, y + r); cx.stroke();
      cx.fillStyle = 'rgba(255,255,255,' + al + ')'; cx.beginPath(); cx.arc(x, y, r * 0.28, 0, 6.2832); cx.fill();
    },
    /* 수렴하는 암흑 (디버프) */
    sink: function (p, t) {
      var e = 1 - Math.pow(1 - t, 2), a = p.a0 + p.sp * t, rad = p.R * (1 - e);
      var x = p.x + Math.cos(a) * rad, y = p.y + Math.sin(a) * rad * 0.7;
      var al = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8, r = p.r * (1 - t * 0.5);
      cx.fillStyle = rgba('30,0,45', 0.85 * al); cx.beginPath(); cx.arc(x, y, r, 0, 6.2832); cx.fill();
      cx.strokeStyle = rgba(p.c, 0.8 * al); cx.lineWidth = 1.5; cx.stroke();
    }
  };

  /* ---------- 파티클 생성 헬퍼 ---------- */
  function burst(x, y, n, spd, c, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, v = R(spd * 0.4, spd);
      add('spark', o.delay || 0, R(280, 520), { x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.g == null ? 600 : o.g, w: R(1.5, 3.5), c: c });
    }
  }
  function embers(x, y, n, c, spread, delay) {
    for (var i = 0; i < n; i++)
      add('ember', delay || 0, R(450, 900), { x: x + R(-spread, spread), y: y + R(-spread * 0.4, spread * 0.4), vx: R(-60, 60), vy: R(-220, -60), g: -40, r: R(2, 5), c: c });
  }
  function slash(x, y, r, mid, sw, w, c, delay) {
    add('arc', delay, 260, { x: x - Math.cos(mid) * r, y: y - Math.sin(mid) * r, r: r, a0: mid - sw / 2, sw: sw, w: w, c: c });
  }
  function bolt(x0, y0, x1, y1, w, c, delay) {
    var pts = [[x0, y0]], n = 7;
    for (var i = 1; i < n; i++) {
      var k = i / n;
      pts.push([x0 + (x1 - x0) * k + R(-26, 26), y0 + (y1 - y0) * k + R(-8, 8)]);
    }
    pts.push([x1, y1]);
    add('bolt', delay, 280, { pts: pts, w: w, c: c });
  }

  /* ---------- 계열별 연출 (반환: imp=타격 시점ms, end=종료ms) ---------- */
  var KIND = {
    hit: function (rc, c, T, sz) {
      var n = T.mul > 1 ? 3 : 2, mids = [0.8, -0.8, 2.4];
      for (var i = 0; i < n; i++) slash(rc.x, rc.y, sz * (1 + i * 0.18), mids[i] + R(-0.15, 0.15), (i % 2 ? -1 : 1) * R(1.5, 1.9), 7 * T.mul, c, i * 60);
      add('glow', 90, 360, { x: rc.x, y: rc.y, r: sz * 1.4 * T.mul, c: c });
      add('ring', 100, 380, { x: rc.x, y: rc.y, r0: 8, r1: sz * 1.5, w: 5, c: c });
      burst(rc.x, rc.y, Math.round(26 * T.mul), 520, c, { delay: 100 });
      return { imp: 110, end: 1250 };
    },
    combo: function (rc, c, T, sz, o) {
      var n = T.mul > 1 ? 5 : 3, step = 110, amp = T.shake * 0.5, el = shakeTarget(o);
      for (var i = 0; i < n; i++) {
        (function (i) {
          slash(rc.x + R(-14, 14), rc.y + R(-14, 14), sz * R(0.9, 1.3), R(-1.4, 1.4), (i % 2 ? -1 : 1) * R(1.5, 2), 6 * T.mul, c, i * step);
          burst(rc.x, rc.y, 8, 380, c, { delay: i * step + 50 });
          add('glow', i * step + 40, 240, { x: rc.x, y: rc.y, r: sz * 0.9, c: c, a: 0.8 });
          setTimeout(function () { doShake(el, amp, 150); }, i * step + 50);
        })(i);
      }
      var last = n * step;
      add('ring', last, 420, { x: rc.x, y: rc.y, r0: 10, r1: sz * 1.9, w: 6, c: c });
      add('glow', last, 420, { x: rc.x, y: rc.y, r: sz * 1.8 * T.mul, c: c });
      burst(rc.x, rc.y, Math.round(34 * T.mul), 560, c, { delay: last });
      return { imp: last + 30, end: last + 1200 };
    },
    aoe: function (rc, c, T, sz) {
      var big = sz * (T.mul > 1 ? 3.4 : 2.8);
      add('glow', 0, 420, { x: rc.x, y: rc.y, r: big * 0.8, c: c });
      for (var i = 0; i < 3; i++) add('ring', 60 + i * 90, 520, { x: rc.x, y: rc.y, r0: 12, r1: big * (1 - i * 0.18), w: 8 - i * 2, c: c, sq: 0.5 });
      add('ring', 40, 360, { x: rc.x, y: rc.y, r0: 6, r1: big * 0.7, w: 4, c: '255,255,255', sq: 0.5, a: 0.8 });
      burst(rc.x, rc.y, Math.round(36 * T.mul), 640, c, { delay: 60 });
      for (var k = 0; k < 12; k++) {
        var a = k / 12 * 6.2832;
        add('spark', 60, 520, { x: rc.x, y: rc.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 350, g: 0, w: 3, c: c });
      }
      embers(rc.x, rc.y, Math.round(14 * T.mul), c, sz, 80);
      return { imp: 130, end: 1300 };
    },
    magic: function (rc, c, T, sz) {
      var n = Math.round(3 * T.mul);
      for (var i = 0; i < n; i++) bolt(rc.x + R(-70, 70), -10, rc.x + R(-12, 12), rc.y, 3.5 * T.mul, c, i * 70);
      var t0 = (n - 1) * 70 + 60;
      add('glow', t0, 520, { x: rc.x, y: rc.y, r: sz * 2.2 * T.mul, c: c });
      add('ring', t0, 480, { x: rc.x, y: rc.y, r0: 10, r1: sz * 2, w: 6, c: c, sq: 0.6 });
      embers(rc.x, rc.y, Math.round(24 * T.mul), c, sz * 0.8, t0);
      burst(rc.x, rc.y, Math.round(24 * T.mul), 500, c, { delay: t0 });
      return { imp: t0 + 10, end: t0 + 1200 };
    },
    arrow: function (rc, c, T, sz) {
      var n = Math.round(22 * T.mul), spreadX = Math.max(rc.w * 1.6, 90), spreadY = Math.max(rc.h, 60), lastT = 0;
      for (var i = 0; i < n; i++) {
        var tx = rc.x + R(-spreadX / 1.2, spreadX / 1.2), ty = rc.y + R(-spreadY / 2, spreadY / 2);
        var d = R(260, 380), dl = R(0, 380);
        lastT = Math.max(lastT, d + dl);
        (function (tx, ty) {
          add('arrow', dl, d, {
            sx: tx + 160 + R(-30, 30), sy: -30 - R(0, 150), tx: tx, ty: ty, c: c,
            end: function () { burst(tx, ty, 5, 260, c); add('glow', 0, 220, { x: tx, y: ty, r: 26, c: c }); }
          });
        })(tx, ty);
      }
      return { imp: lastT - 80, end: lastT + 900 };
    },
    buff: function (rc, c, T, sz) {
      add('glow', 0, 520, { x: rc.x, y: rc.y, r: sz * 1.6, c: c, a: 0.9 });
      for (var i = 0; i < 4; i++) add('ring', i * 120, 700, { x: rc.x, y: rc.y + sz * 0.3, r0: 10, r1: sz * 2.4, w: 6 - i, c: c, sq: 0.4 });
      for (var k = 0; k < Math.round(26 * T.mul); k++)
        add('rise', R(0, 420), R(800, 1200), { x: rc.x + R(-sz, sz), y: rc.y + sz * 0.5, v: R(60, 160), f: R(3, 6), ph: R(0, 6), amp: R(4, 14), r: R(5, 9), c: c });
      return { imp: 80, end: 1700, calm: true };
    },
    heal: function (rc, c, T, sz) {
      add('glow', 0, 600, { x: rc.x, y: rc.y, r: sz * 1.5, c: c, a: 0.8 });
      add('ring', 0, 700, { x: rc.x, y: rc.y + sz * 0.3, r0: 10, r1: sz * 1.8, w: 5, c: c, sq: 0.45 });
      for (var k = 0; k < Math.round(24 * T.mul); k++)
        add('rise', R(0, 500), R(900, 1300), { x: rc.x + R(-sz * 0.8, sz * 0.8), y: rc.y + sz * 0.4, v: R(50, 130), f: R(2, 5), ph: R(0, 6), amp: R(6, 16), r: R(6, 10), c: c });
      return { imp: 80, end: 1800, calm: true };
    },
    debuff: function (rc, c, T, sz) {
      var R0 = sz * 2.2;
      add('ring', 0, 650, { x: rc.x, y: rc.y, r0: R0, r1: sz * 0.3, w: 6, c: '40,0,60', comp: 'source-over', sq: 0.7 });
      add('ring', 80, 600, { x: rc.x, y: rc.y, r0: R0 * 0.8, r1: sz * 0.2, w: 4, c: c, sq: 0.7 });
      for (var k = 0; k < Math.round(26 * T.mul); k++)
        add('sink', R(0, 300), R(650, 950), { x: rc.x, y: rc.y, R: R(sz * 1.2, sz * 2.2), a0: R(0, 6.28), sp: R(2, 4), r: R(5, 10), c: c, comp: 'source-over' });
      for (var j = 0; j < 8; j++)
        add('spark', R(300, 600), 500, { x: rc.x + R(-sz, sz), y: rc.y - sz, vx: 0, vy: R(120, 260), g: 900, w: 3, c: c });
      return { imp: 300, end: 1500, calm: true };
    }
  };

  /* ---------- 화면 연출 ---------- */
  function vignette(c, T, calm) {
    var v = document.createElement('div'), a = calm ? T.vig * 0.5 : T.vig, ms = calm ? Math.round(T.vigMs * 0.8) : T.vigMs;
    v.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;opacity:0;pointer-events:none;' +
      'background:radial-gradient(ellipse at center,rgba(0,0,0,' + (a * 0.22) + ') 0%,rgba(0,0,0,' + a + ') 100%);' +
      'box-shadow:inset 0 0 120px ' + rgba(c, calm ? 0.2 : 0.38) + ';';
    root.insertBefore(v, cv);
    var done = function () { if (v.parentNode) v.parentNode.removeChild(v); };
    if (v.animate) {
      var an = v.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
      an.onfinish = done;
    }
    setTimeout(done, ms + 80);
  }
  function whiteFlash(a) {
    var f = document.createElement('div');
    f.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(255,255,255,' + a + ');pointer-events:none;opacity:0;';
    root.appendChild(f);
    var done = function () { if (f.parentNode) f.parentNode.removeChild(f); };
    if (f.animate) f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-out' }).onfinish = done;
    setTimeout(done, 200);
  }
  function shakeTarget(o) {
    if (o && o.shakeEl) return o.shakeEl;
    for (var i = 0; i < SHAKE_SEL.length; i++) {
      var el = document.querySelector(SHAKE_SEL[i]);
      if (el && el.offsetWidth > 0) return el;
    }
    return document.body;
  }
  function doShake(el, amp, dur) {
    if (!CFG.shake || !el || !el.animate) return;
    if (reduced) amp = Math.min(amp, 2);
    var n = Math.max(4, Math.round(dur / 35)), kf = [];
    for (var i = 0; i < n; i++) {
      var k = 1 - i / n, sg = i % 2 ? 1 : -1;
      kf.push({ transform: 'translate(' + (sg * amp * k * (0.6 + Math.random() * 0.4)).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * amp * k).toFixed(1) + 'px) rotate(' + (sg * 0.25 * k).toFixed(2) + 'deg)' });
    }
    kf.push({ transform: 'translate(0,0) rotate(0deg)' });
    try { el.animate(kf, { duration: dur, easing: 'linear' }); } catch (e) { }
  }

  /* ---------- 큼직한 데미지 팝업 ---------- */
  function popup(rc, c, T, o) {
    var txt = o.dmgText;
    if (txt == null || txt === '') return;
    var size = Math.min(T.pop, Math.round(W * 0.16)), label = o.label == null ? T.label : o.label;
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:' + rc.x + 'px;top:' + (rc.y - rc.h * 0.15) + 'px;transform:translate(-50%,-50%);' +
      'font-weight:900;font-family:Impact,"Arial Black","Noto Sans KR",sans-serif;white-space:nowrap;text-align:center;line-height:1;' +
      'pointer-events:none;z-index:' + (CFG.z + 2) + ';will-change:transform,opacity;';
    var col = 'rgb(' + lighten(c, 0.55) + ')';
    el.innerHTML = (label ? '<div style="font-size:' + Math.round(size * 0.38) + 'px;letter-spacing:2px;color:' + col +
      ';-webkit-text-stroke:4px rgba(0,0,0,.85);paint-order:stroke fill;text-shadow:0 0 10px ' + rgba(c, 1) + ';margin-bottom:3px">' + esc(label) + '</div>' : '') +
      '<div style="font-size:' + size + 'px;color:#fff;-webkit-text-stroke:7px rgba(0,0,0,.88);paint-order:stroke fill;' +
      'text-shadow:0 0 14px ' + rgba(c, 1) + ',0 0 28px ' + rgba(c, 0.7) + ',0 4px 0 rgba(0,0,0,.6)">' + esc(txt) + '</div>';
    document.documentElement.appendChild(el);
    var rm = function () { if (el.parentNode) el.parentNode.removeChild(el); };
    if (!el.animate) { setTimeout(rm, 1100); return; }
    var tilt = R(-8, 8), B = 'translate(-50%,-50%) ';
    var an = el.animate([
      { transform: B + 'scale(.2) rotate(' + (tilt * 2) + 'deg)', opacity: 0, offset: 0 },
      { transform: B + 'translateY(-20px) scale(1.9) rotate(' + tilt + 'deg)', opacity: 1, offset: 0.14 },
      { transform: B + 'translateY(-34px) scale(1.25) rotate(' + (tilt * 0.6) + 'deg)', opacity: 1, offset: 0.28 },
      { transform: B + 'translateY(-50px) scale(1.5) rotate(' + (tilt * 0.4) + 'deg)', opacity: 1, offset: 0.4 },
      { transform: B + 'translateY(-72px) scale(1.35) rotate(0deg)', opacity: 1, offset: 0.75 },
      { transform: B + 'translateY(-115px) scale(1.2) rotate(0deg)', opacity: 0, offset: 1 }
    ], { duration: 1150, easing: 'ease-out' });
    an.onfinish = rm;
    setTimeout(rm, 1500);
  }

  /* ---------- 공개 API ---------- */
  function play(o) {
    o = o || {};
    if (!CFG.enabled || typeof document === 'undefined') return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        mount();
        var kind = KIND[o.kind] ? o.kind : 'hit';
        var T = TIER[o.tier === 'S' ? 'S' : 'A'];
        var c = validColor(o.color) || COLORS[kind];
        var rc = rectOf(o.targetElOrRect || o.target);
        var sz = clamp(Math.max(rc.w, rc.h) * 0.9, 70, 190);
        var info = KIND[kind](rc, c, T, sz, o);
        vignette(c, T, info.calm);
        setTimeout(function () {
          if (!info.calm) {
            whiteFlash(T.flash);
            if (CFG.hitstop && T.stop) stopUntil = performance.now() + T.stop;
            if (kind !== 'combo') setTimeout(function () { doShake(shakeTarget(o), T.shake, T.mul > 1 ? 380 : 300); }, CFG.hitstop ? T.stop : 0);
            else setTimeout(function () { doShake(shakeTarget(o), T.shake, 380); }, CFG.hitstop ? T.stop : 0);
          }
          popup(rc, c, T, o);
        }, Math.max(0, info.imp));
        setTimeout(function () { resolve(true); }, info.end);
      } catch (e) {
        if (g.console) console.warn('[v584] fx error', e);
        resolve(false);
      }
    });
  }

  /* v5.82 필살기 e 객체 → kind 매핑
     v5.84 — 본편 e 객체는 `k`에 효과 종류를 적는다. 그 값을 먼저 쓴다. */
  var KIND_OF_K = {
    hit: 'hit', combo: 'combo', aoe: 'aoe', arrow: 'arrow', arrowAoe: 'arrow',
    magic: 'magic', rock: 'magic', buff: 'buff', heal: 'heal', debuff: 'debuff' /* line 은 아래에서 갈래를 본다 */
  };
  function kindOf(e) {
    e = e || {};
    if (e.k) {
      if (e.k === 'line') return e.stat === 'int' ? 'magic' : 'hit';
      if (KIND_OF_K[e.k]) return KIND_OF_K[e.k];
    }
    if (e.shape === 'allies') return (e.heal && !e.buff) ? 'heal' : 'buff';
    if (!e.pct && e.debuff) return 'debuff';
    if (e.stat === 'int' || e.burn) return 'magic';
    if (e.range >= 3) return 'arrow';
    if (e.hits >= 3) return 'combo';
    if (e.shape === 'aoe' || e.shape === 'line') return 'aoe';
    return 'hit';
  }

  g.V584_ULT_FX = {
    version: '5.8.4',
    config: CFG,
    kinds: Object.keys(KIND),
    play: play,
    kindOf: kindOf,
    colorOf: function (kind) { return COLORS[kind] || COLORS.hit; },
    stop: function () {
      parts.length = 0;
      if (cx) cx.clearRect(0, 0, W, H);
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = cv = cx = null;
    }
  };
})(typeof window !== 'undefined' ? window : this);


/* =====================================================================
 * 2. 일기토 코믹·귀여운 대사 사전
 * ===================================================================== */
(function (g) {
  'use strict';
  /* v5.98 — 사용자 가이드(전장조작_코믹대사)의 꼬마영웅 전용 귀여움·코믹 대사
     · open  = 일기토 개전 (첫 대사)
     · clash = 격돌 (서로 한 수 주고받을 때)
     · hit   = 공통 피격 (격돌에서 밀렸을 때 — "아야! 내 꼬까옷…")
     · lose  = 공통 패배·퇴각 ("엄마야! 삼십육계…")
     값을 배열로 적으면 그중 하나를 골라 쓴다(바로 앞 대사는 피한다). */
  var COMMON_HIT = ['아야! 내 꼬까옷 찢어졌잖아!', '치사하게 정수리를 노리다니!'];
  var COMMON_LOSE = ['엄마야! 삼십육계 줄행랑이다~!', '후퇴하면서 고구마나 구워먹자!', '두고 봐라, 형아 데려온다!'];
  function D(o, c, w, l) { return { open: o, clash: c, win: w, lose: l }; }
  function PL(o, c, w, l) { return { open: o, clash: c, win: w, lose: l }; }

  var L = {
    /* ---- 삼국지 ---- */
    '조조': D('내가 천하를 버릴지언정, 내 만두는 못 뺏긴다!', '패왕의 호령이다! 다들 줄 서라!', '역시 난세의 간웅이지, 후후.', COMMON_LOSE),
    '유비': D('저, 싸움은 서툰데... 형제들아 도와줘!', '인덕이 곧 무기입니다!', '이겼어요! 다친 데 없으세요?', '운장아, 익덕아... 형 좀 구해 줘!'),
    '관우': D('내 수염에 먼지 묻히면 청룡도가 삐친다네!', '언월도 앞에서는 키 재는 거 아니다~', '한 잔 술 식기 전에 끝났군.', COMMON_LOSE),
    '장비': D('장판파에서 목청 한 번 틔워볼까?! 귀 막아라~!', '이 형님이 딱밤 한 대 놔주마!', '큰형님 봤소? 내가 해냈소!', COMMON_LOSE),
    '여포': D('적토마도 너보단 빠르게 뛰겠다, 꼬마야!', '내 방천화극이 오늘따라 간지럽대~', '내 앞에서 얼쩡거리지 마라!', COMMON_LOSE),
    '조운': D('상산 조자룡! 한 번에 끝내 드리죠!', '창이 번개처럼 나갑니다!', '오늘도 무사 귀환입니다.', '으, 갑옷에 흠집이... 아깝다!'),
    '마초': D('비단 마초 납시오! 얼굴은 덤이다!', '서량 철기 앞에 서면 다 눕는다!', '내 창 맛이 어떠냐!', '아버지... 오늘은 운이 없었소...'),
    '하후돈': D('이 눈알 값은 네 목숨으로 받겠다!', '내 눈은 하나여도 시야는 넓다!', '하나 남은 눈으로도 다 보인다!', '눈이 하나라 거리 계산이 틀렸...!'),
    '하후연': D('삼 일에 오백 리! 빠르게 끝내 주마!', '느리면 지는 거야, 알지?', '배달 완료! 승리 배송이요!', '너무 빨리 달리다 헛디뎠네...'),
    '허저': D('호치 허저, 밥값 하러 왔소!', '으랏차차! 맨손으로도 돼!', '주공, 칭찬해 주쇼! 고기도 주쇼!', '밥... 밥을 덜 먹어서 그렇소...'),
    '장료': D('합비의 8백 용사, 내가 선봉이다!', '울던 아이도 그치게 해 주마!', '아이가 울음을 그칠 만하지?', '8백 명만 더 있었어도...!'),
    '서황': D('질서 정연하게, 정확하게 끝내지요!', '도끼질도 각이 중요하답니다!', '깔끔하게 마무리했습니다.', '각이 안 맞았나... 다시 계산해야겠군.'),
    '방덕': D('관을 짊어지고 왔다, 각오해라!', '죽을 각오라면 내가 한 수 위다!', '관은 아직 쓸 일이 없구먼.', '관 준비한 보람이 있는 건가...'),
    '손견': D('강동의 호랑이 납시오! 어흥!', '호랑이 발톱 맛 좀 볼래?', '아들들아, 아비를 보았느냐!', '화살 조심... 아야야!'),
    '손책': D('소패왕이 나가신다! 다 비켜!', '강동 한 번 휘저어 볼까!', '공근, 봤냐? 내가 해냈다!', '크윽... 얼굴만은 때리지 마!'),
    '손권': D('내가 직접...? 알겠어, 한 번만이야!', '눈은 푸르고 수염은 붉다, 쫄았지?', '강동의 주인은 못 건드리지!', '역시 난 싸움보단 내정이 맞아...'),
    '주태': D('온몸이 상처뿐, 이제 무서울 게 없다!', '흉터가 훈장이다! 한 방 더!', '상처 하나 더 늘었지만 이겼다!', '상처 자리가 또 늘어나겠군...'),
    '감녕': D('비단 돛 휘날리며 습격이다!', '방울 소리 들리면 이미 늦었어!', '백 명으로 충분했지, 후후.', '방울이 울렸는데도 졌다니...'),
    '태사자': D('신의를 걸고 한 발에 끝낸다!', '활도 창도 내 손 안이야!', '약속은 지켰다! 돌아갑니다!', '신의는 지켰는데 승부는 졌네...'),
    '장임': D('낙봉파 맛 좀 볼래요?', '매복은 내 특기랍니다!', '낙봉파에서 또 만나요~', '이번엔 매복이 들켰나...'),
    '엄안': D('늙은이라 얕보지 마라, 허허!', '이 나이에 이 근력, 놀랍지?', '역시 경험이 최고라네, 허허.', '허리야... 이 나이에 무리했군.'),
    '황충': D('나이는 숫자일 뿐! 활 간다!', '백발백중 노인장 나가신다!', '노익장 보셨소? 허허허!', '화살이 휘었나... 아니, 눈이 침침했나?'),
    '위연': D('모반? 아니, 그냥 선봉이오!', '자오곡으로 가면 됐을 텐데!', '봤소 승상? 내 계책이 맞았소!', '뒤통수만은 조심하라 했는데...'),
    '제갈량': D('바람의 방향을 바꿨으니… 감기 조심하십시오.', '부채질 한 번에 네 투구도 날아간다~', '모든 게 제 계산대로입니다.', COMMON_LOSE),
    '주유': D('이 공근이 거문고 한 곡 들려주지!', '음이 틀리면 죽는다, 알지?', '순간의 화음도 놓치지 않았다!', '기왕 주유를 낳고 왜 제갈량을 또...!'),
    '사마의': D('죽은 척이라면 자신 있지!', '인내하는 자가 이기는 법이다!', '끝까지 살아남은 놈이 승자지.', '오늘은 병이 도졌소... 철수!'),
    '동탁': D('배 나온 건 힘이 세다는 증거지!', '내 배로 널 깔아뭉개 주마!', '내 뱃살 앞에 무릎 꿇어라!', '뱃살이 방해돼서 못 피했네...'),
    '원소': D('가문도 좋고 병사도 많다! 덤벼라!', '쪽수가 곧 힘이다!', '역시 사세삼공 가문이로다!', '결정을 못 내리다 맞았네...'),
    '전위': D('주공은 내가 지킨다! 비켜라!', '쌍극 두 자루가 춤을 춘다!', '주공, 이 악래가 해냈소!', '주공만은... 먼저 도망가시오!'),
    '고순': D('함진영 출동! 내 앞에서 뚫릴 줄 알고?', '이 진영은 뚫리지 않는다!', '함진영이 뚫은 건 적뿐이다!', '여포 님이 도망만 안 갔어도...'),
    '화웅': D('제후 놈들아, 내 칼 받고 갈래?', '술이 식기 전에 목을 가져가겠다!', '허허, 허무하게 끝났군!', '술이 식기도 전에... 아이고...'),
    '안량': D('하북 제일 무장 안량이다, 비켜서라!', '하북 사나이 맛 좀 보라구!', '원소 님, 상 주십쇼!', '저 붉은 얼굴은 누구냐... 억!'),
    '문추': D('안량 형 복수는 내가 한다!', '형제의 힘을 보여 주마!', '형님, 원수 갚았소!', '형님... 곧 따라갑니다...'),
    '조인': D('지키는 건 내가 최고지! 한번 해 봐!', '성벽보다 단단하다, 난!', '난공불락은 이런 거다!', '이번엔 성벽이 먼저 무너졌네...'),
    '악진': D('작은 키라고 얕보면 큰코다친다!', '작은 고추가 맵다고!', '키는 작아도 공은 크다!', '키가 닿질 않았군...'),
    '우금': D('군기는 엄격하게! 정렬해라!', '규율이 곧 힘이다!', '질서가 승리를 만들었다!', '물이... 물이 갑자기 차올랐다!'),
    '장합': D('우아하게 베어 드리지요!', '손동작이 우아하지 않소?', '꽃처럼 베었구려!', '머리 모양이 흐트러졌잖소!'),
    '마대': D('마초 형님 사촌 마대, 출격이오!', '일격에 끝낼 수 있소!', '위연? 내가 한 칼이면 되오!', '사촌 형님이 더 낫네...'),
    '관평': D('아버님 이름에 먹칠 안 합니다!', '아버님 청룡도 한 수 배웠소!', '아버님, 칭찬해 주십시오!', '아버님께는 말씀 마십시오...'),
    '강유': D('제갈 승상의 뜻을 이어받았소!', '아직 북벌은 끝나지 않았다!', '한나라 부흥에 한 걸음 더!', '승상... 죄송합니다...'),
    '등애': D('이, 이거... 말, 말 더듬어도 강해!', '음평 산길 뚫은 몸이다!', '지, 지름길로 이겼소!', '말... 말이 꼬여서...'),
    '육손': D('샌님 같다고? 불 한번 맛볼래?', '이릉에서 한 번 데었잖소!', '불은 조심해야 하는 법이오.', '이번엔 불이 안 붙네...'),
    '여몽': D('선비 사흘 안 보면 눈 비벼 보라 했지!', '공부한 자의 칼은 달라!', '3일 만에 이렇게 컸소!', '책이 더 쉬웠는데...'),
    '능통': D('아버지 원수... 아니, 일단 맞고 보자!', '합비에서 쌓은 실력이다!', '감녕 장군과는 화해했소!', '아직 풋내기였나...'),
    '정보': D('강동의 맏형이 한 수 알려 주마!', '나이는 못 속여도 칼은 못 꺾는다!', '술 한 잔이면 충분하지!', '허리가 삐끗...'),
    '황개': D('고육지책이라 했소! 맞으면 아프다!', '내 몸은 이미 불에 구워졌소!', '불꽃 공연 잘 봤소?', '이번엔 진짜로 맞았소...!'),
    '한당': D('강동 노장이 아직 팔팔하다!', '나이 많아도 칼은 안 녹슨다!', '노장은 죽지 않아!', '허허, 젊은이가 세구먼...'),

    /* ---- 한국 위인 ---- */
    '이순신': D('신에게는 아직 열두 척이 있사옵니다!', '필사즉생! 필생즉사!', '난중일기에 오늘 일 적어야겠군.', '괜찮다, 아직 거북선이 있다!'),
    '을지문덕': D('그대에게 시 한 수 읊어 드리지!', '살수에서 헤엄치는 건 어때?', '수나라는 오늘도 수영 중이군!', '이번엔 시가 안 먹혔나...'),
    '강감찬': D('별이 떨어졌다던 그 장수요!', '귀주에서 한 수 배우고 가쇼!', '거란 따위, 별빛 앞에 무릎이다!', '별이 잠깐 구름에 가렸군...'),
    '계백': D('오천 결사대, 오늘도 출근이다!', '황산벌 정신 못 차렸냐!', '결사대 퇴근해도 좋다!', '오천이면 충분하다 했거늘...!'),
    '김유신': D('화랑도 맏형이 한 수 가르쳐 주마!', '삼국통일의 길은 험하단다!', '말이 알아서 길을 아는구나!', '말 목을 괜히 베었나...'),
    '광개토대왕': D('영토 확장은 취미생활이지!', '땅이 모자라! 더 가자!', '오늘 땅 좀 넓혔군, 허허!', '지도가 좁아 보이는군...'),
    '연개소문': D('칼 다섯 자루로 인사드립니다!', '허리춤에 다섯 자루, 하나 골라 봐!', '대막리지에게 덤비다니 용감하구나!', '칼이 무거워서 균형을 잃었네...'),
    '양만춘': D('안시성 문 앞에서 기다렸소!', '눈에 화살 한 방 선물이오!', '당 태종도 돌아갔다오~', '성문 닫고 숨을 걸 그랬나...'),
    '최영': D('황금 보기를 돌같이 하라 하셨지!', '돌 같은 주먹도 있다!', '청렴하게 이겼소이다!', '황금도 없고 승리도 없네...'),
    '척준경': D('여진 따위는 한 줄로 세워 주마!', '담 넘는 건 자신 있지!', '담장도 적도 다 넘었다!', '이번 담은 좀 높았군...'),
    '김시민': D('진주성은 못 내준다, 국물도 없다!', '화약 냄새 좋지 않냐?', '진주성 만세! 다들 고생했소!', '성은 내 몫이니 잠시 쉬겠소...'),
    '곽재우': D('붉은 옷 입은 홍의장군 나가신다!', '의병은 지치지 않는다고!', '붉은 옷 입고 이겼소~', '붉은 옷이 너무 눈에 띄었나...'),
    '안중근': D('조용히, 정확하게, 한 발이면 충분하오.', '대한독립 만세! 비켜라!', '약속은 지켰소, 만세!', '여기서 쓰러질 순 없는데...'),
    '홍범도': D('날아다니는 홍 장군이외다, 하하!', '산골 포수 솜씨 보여 주마!', '독립군 만세! 만세!', '탄약이 떨어졌나... 아쉽군.'),
    '김좌진': D('청산리에서 보자던 약속, 지키러 왔소!', '청산리 골짜기가 널 기다려!', '청산리 대첩 한 번 더 어떻소!', '이번엔 지형이 우리 편이 아니군...'),
    '권율': D('행주치마 안 벗어도 이길 수 있소!', '돌멩이도 무기가 된다!', '행주산성의 승리다!', '돌이 떨어졌나...'),
    '이성계': D('활 한 발로 끝내 주겠소!', '위화도에서 회군할 걸 그랬나!', '신궁이란 별명 괜히 있나!', '활시위가 끊어졌네...'),
    '대조영': D('발해를 세운 몸이시다!', '동모산에서 배운 솜씨다!', '해동성국의 힘이다!', '건국이 쉽지 않군...'),
    '윤관': D('별무반 출동! 여진 정벌이다!', '9성을 쌓으러 가자!', '9성 쌓은 보람이 있군!', '9성을 도로 내줄 순 없는데...'),
    '세종대왕': D('글자를 만든 자의 주먹을 받아라!', '과학 기술의 힘을 보여 주마!', '이겼으니 훈민정음 한 번 읽자!', '신하들아, 짐을 좀 구해라...')
  };

  /* v5.98 — 공통 피격 · 공통 패배/퇴각 (모든 장수가 함께 쓰는 풀) */
  L._hit = COMMON_HIT;
  L._lose = COMMON_LOSE;

  /* ---- 폴백 풀 22종 (병과 11 + 성격 5 + 특성 5 + 공용 1) ---- */
  L._pool = {
    cav: PL(['말이 먼저 달려 나갑니다!', '히히힝~ 출발이다!'], ['말발굽 소리 들리지?', '내 말이 더 빠르다!'], ['말한테 당근 줘야겠다!', '승마 실력의 승리!'], ['말이 갑자기 멈췄어!', '낙마라니, 말도 안 돼!']),
    spear: PL(['창이 길어서 미안하오!', '찌르기 한 번에 끝낸다!'], ['거리 재기는 내가 최고!', '찌르고 빠지고, 반복!'], ['창끝이 오늘 반짝이네!', '역시 긴 게 이기는 법!'], ['창이 너무 길어서 걸렸네!', '손잡이 놓쳤다!']),
    sword: PL(['칼 맛 좀 보여 줄까?', '한 칼이면 충분하지!'], ['칼날이 춤춘다!', '쨍쨍! 불꽃 튄다!'], ['칼집에 넣고 퇴근!', '깔끔하게 베었다!'], ['칼이 부러졌...!', '칼날이 무뎠나?']),
    shield: PL(['방패 뒤에서 인사드립니다!', '단단함이 자랑이오!'], ['안 아파요, 하나도!', '방패로 박치기다!'], ['방패가 칼보다 강하다!', '수비가 최고의 공격!'], ['방패가 갈라졌어...!', '방패가 오늘따라 무겁네!']),
    archer: PL(['화살 비 예약하셨죠?', '조준 완료, 발사!'], ['가까우면 활도 칼이야!', '화살이 모자라...!'], ['과녁 정중앙이다!', '백발백중 인증!'], ['활시위가 끊어졌어!', '화살통이 비었네...']),
    crossbow: PL(['연노 두 발, 서비스다!', '철컥! 장전 완료!'], ['연사 속도가 자랑이지!', '쏘고 쏘고 또 쏜다!'], ['화살값은 받아 가겠소!', '화살 정산 끝!'], ['장전이 늦었어!', '연노가 걸렸다!']),
    mage: PL(['부적 한 장이면 충분하지~', '주문 외우는 중, 잠깐만!'], ['번개가 번쩍!', '불꽃이 팡팡 튄다!'], ['주문 대성공!', '마법은 역시 계산이지!'], ['주문을 틀렸어...!', '부적이 젖어 버렸네!']),
    lord: PL(['군주가 직접 나섰다, 영광인 줄 알라!', '내 부하들 지켜보고 있다!'], ['군주의 품격을 보라!', '체면이 걸렸다!'], ['역시 대장은 다르지!', '부하들, 박수!'], ['부하들아, 구해 줘!', '체면이 땅에 떨어졌다...']),
    martial: PL(['맨주먹이 제일 빠르지!', '발차기 준비 완료!'], ['주먹 연타 간다!', '무기? 내 몸이 무기다!'], ['손맛 좋았다!', '운동 한 번 잘했네!'], ['주먹이 빗나갔다!', '다리에 쥐가...!']),
    beast: PL(['어흥! 사냥 시작이다!', '야수의 본능이 눈을 뜬다!'], ['물고 뜯고 할퀴자!', '털 곤두섰다!'], ['사냥 성공! 고기 먹자!', '포효 한 번 해 볼까!'], ['꼬리 밟혔다...!', '배고파서 힘이 안 나...']),
    support: PL(['응원은 맡겨 주세요!', '싸움은 서툴지만 힘낼게요!'], ['북소리로 박자 맞춰요!', '춤추듯이 피해요!'], ['다 같이 만세!', '제가 이긴 거 맞죠?!'], ['엉엉, 무서웠어요...', '다음엔 응원만 할래요...']),
    brave: PL(['두려움은 집에 두고 왔소!', '덤벼라, 한판 붙자!'], ['물러서지 않는다!', '뜨거운 심장이 말한다!'], ['용기가 승리했다!', '당연한 결과지!'], ['용기만으론 안 되나...', '다음엔 이긴다!']),
    cunning: PL(['힘 빼고 머리로 이길게~', '이미 계산 끝났거든?'], ['어디 한번 속아 볼래?', '함정이라니까, 알지?'], ['머리는 이럴 때 쓰는 거지!', '계획대로야, 후후.'], ['계산에 없던 일이야...', '이게 아닌데...?']),
    loyal: PL(['주군을 위해 나선다!', '충성을 걸고 한판!'], ['주군께 부끄럽지 않게!', '의리로 버틴다!'], ['주군, 보셨습니까!', '충성의 승리입니다!'], ['주군, 면목이 없습니다...', '충성이 부족했나...']),
    reckless: PL(['생각은 나중에 하자!', '돌격 앞으로! 일단 달린다!'], ['아무튼 세게 친다!', '계획? 그게 뭐야?'], ['이겼으면 됐지!', '근육이 머리를 이겼다!'], ['앞뒤 안 재고 달렸더니...', '어, 이거 함정이었어?!']),
    calm: PL(['침착하게, 천천히 가죠.', '숨 한 번 고르고 시작합시다.'], ['서두르지 않는 게 승리의 비결!', '차분차분, 한 수씩.'], ['예상한 대로입니다.', '조용히 끝났군요.'], ['잠시 호흡이 흐트러졌군요.', '다음 수를 준비하겠습니다.']),
    veteran: PL(['늙은이 한 수 받아 보게나~', '경험이 곧 무기라네!'], ['젊은이, 아직 멀었어!', '허리야... 그래도 한 방!'], ['역시 짬밥은 못 속이지!', '노장은 죽지 않는다!'], ['허리가 삐끗했네...', '나이는 못 속이는군...']),
    young: PL(['처음이라 떨리지만 갑니다!', '신입이지만 열심히 할게요!'], ['배운 대로 해 보자!', '선배님들 보고 있죠?'], ['제가 이겼어요?! 진짜?!', '첫 승리다! 만세!'], ['아직 부족했네요...', '다음엔 더 열심히 할게요!']),
    beauty: PL(['얼굴은 건드리지 마세요!', '우아하게 끝내 드리죠.'], ['머리카락 흐트러지잖아요!', '땀이 나잖아요, 어서 끝내요!'], ['승리도 미모도 완벽!', '옷에 피 안 묻었네, 다행!'], ['내 얼굴에 흠집이!!', '화장이 번졌어요...']),
    drunk: PL(['딸꾹! 술 한잔 하고 하자!', '취기가 올라야 제맛이지!'], ['세상이 빙글빙글~', '취권 간다, 딸꾹!'], ['딸꾹, 이긴 건가?', '승리 기념 한잔 더!'], ['술이 덜 깼나...', '딸꾹, 땅이 흔들리네...']),
    foodie: PL(['싸움 끝나면 밥이다!', '배고프니 빨리 끝내자!'], ['배에서 꼬르륵 소리가...', '고기 먹을 힘으로 친다!'], ['이겼다! 밥 먹으러 가자!', '승리의 맛은 고기!'], ['배고파서 힘이 안 나...', '점심 거른 게 문제였어...']),
    generic: PL(['한 수 가르쳐 드리죠!', '덤비시오, 후회는 없소!'], ['이거나 받아라!', '아직 안 끝났다!'], ['이겼다! 만세!', '다음 상대는 누구냐!'], ['으윽, 다음엔 이긴다!', '오늘은 컨디션이 안 좋아서...'].concat(COMMON_LOSE))
  };
  g.V584_DUEL_LINES = L;

  /* ===================================================================
   * 3. 포로 / 승전 MVP 코믹 한마디
   * =================================================================== */
  g.V584_EXTRA_LINES = {
    capture: {
      '조조': '내 군사가 곧 올 거다, 지금 풀어 주면 선처해 주지!',
      '유비': '저를 베시기 전에 백성들 밥은 먹여 주시오...',
      '관우': '의리를 아는 자라면 술 한 잔만 주시게.',
      '장비': '밧줄이 간지럽소! 풀어 주면 안 되오?',
      '여포': '밧줄이 너무 조이잖소! 조금만 풀어 주시오!',
      '조운': '제 몸이 묶인 건 괜찮으니 주군은 무사하신지 알려 주시오.',
      '마초': '내 얼굴에 흠집 내면 가만 안 둔다!',
      '하후돈': '눈 하나 더 잃느니 항복하겠소... 농담이오!',
      '허저': '고기 주면 바로 충성하오!',
      '장료': '날 알아봐 주는 주군이라면 모시겠소.',
      '서황': '매듭이 삐뚤어졌소. 제가 다시 묶어 드리리다.',
      '방덕': '죽일 거면 빨리 죽이쇼, 관은 이미 있소!',
      '손책': '얼굴은 건드리지 마시오!',
      '주태': '상처 하나쯤 더 늘어도 상관없소.',
      '감녕': '방울 소리가 안 나게 묶어 주시오, 부끄럽소.',
      '태사자': '신의를 아는 분이시라면 한 번만 놔 주시오.',
      '장임': '낙봉파에서 잡혔지만 마음은 안 잡혔소!',
      '엄안': '이 늙은이, 대접이 좋으면 마음이 풀릴지도 모르오.',
      '황충': '이 나이에 포로라니... 활이나 돌려주시오!',
      '위연': '내가 반역자라고? 이번엔 진짜 항복이오!',
      '이순신': '나는 백의종군은 해도 항복은 못 하오.',
      '을지문덕': '시 한 수 읊을 테니 풀어 주시겠소?',
      '강감찬': '별이 포로가 되다니, 하늘도 놀라겠군.',
      '계백': '내 목숨은 가져가도 의리는 못 가져간다!',
      '김유신': '내 말 목을 베기 전에 풀어 주는 게 좋을 거요.',
      '연개소문': '내 칼 다섯 자루 돌려주기 전엔 안 움직이오.',
      '양만춘': '눈 하나 정도는 줄 수 있어도 성은 못 주오.',
      '최영': '황금은 필요 없다. 밥이나 주시오.',
      '안중근': '나는 대한의 군인이오. 포로 예우를 요구하오.',
      '제갈량': '이 또한 계산 안 한 건 아니지요, 후후.',
      '주유': '내가 잡혔다고? 거문고라도 돌려주시오.',
      '사마의': '일단 항복하고 보는 겁니다. 살아야 이기죠.',
      '동탁': '살려 주면 쌀 만 석 주겠소!',
      '원소': '내 가문이 누군지 아시오? 대우를 좀...',
      '전위': '주공이 걱정이지 내 걱정은 안 하오!',
      '고순': '여포 님은 어디 계시오? 또 도망갔소?',
      '화웅': '술 식기 전에 풀어 주면 안 되겠소?',
      _pool: [
        '밧줄 좀 살살 묶어 주쇼...', '밥만 주면 바로 충성합니다!', '여기 이불은 없소? 바닥이 차네...',
        '졌소! 졌으니까 그만 꼬집으시오!', '포로 대접이 이래서야 되겠소!', '내가 어디 가서 안 꿀리는 장수인데...',
        '살려 주시면 술 한 잔 사겠소!', '묶인 김에 낮잠이나 잘까...', '주군이 곧 구하러 올 거요! ...아마도.',
        '항복이오! 근데 몸값은 얼마요?', '내 말은 잘 먹이고 있겠지?', '이 매듭, 누가 묶었소? 솜씨 좋네.',
        '충성 맹세는 식사 후에 하겠소!', '도망 안 갈 테니 발만 풀어 주시오.', '이 신세가 되다니... 오늘 운세 최악이군.',
        '밥 세 끼 보장이면 생각해 보겠소!', '손이 저려서 칼도 못 쥐겠소...', '포로 대우 조항은 읽어 보셨소?'
      ]
    },
    mvp: {
      '조조': '다들 수고했다. 오늘 연회는 내가 쏜다!',
      '유비': '모두의 덕이오! 저는 박수만 쳤소...',
      '관우': '청룡도가 오늘도 목말랐소.',
      '장비': '이겼다! 술 가져와라!',
      '여포': '이 정도 가지고 뭘, 상이나 내놔라!',
      '조운': '무사히 돌아왔으니 그걸로 충분합니다.',
      '마초': '내 얼굴도 MVP 감 아닌가?',
      '하후돈': '눈 하나로도 이 정도 한다!',
      '하후연': '벌써 끝났소? 아직 몸도 안 풀렸는데!',
      '허저': '월급은 고기로 올려 주시오!',
      '장료': '8백 명이면 충분했지!',
      '서황': '정석대로 했을 뿐입니다.',
      '방덕': '관은 다음 기회에 쓰겠소!',
      '손책': '소패왕 이름값 했지?',
      '주태': '흉터 하나 더 늘었지만 MVP요!',
      '감녕': '백 명으로 이겼으니 상금도 백 배요!',
      '태사자': '약속대로 끝냈소!',
      '장임': '낙봉파 매복 성공! 칭찬해 주세요!',
      '황충': '노익장 MVP! 허허!',
      '위연': '내 계책 쓰셨으면 더 빨랐을 거요!',
      '이순신': '모든 장졸의 공이오. 신은 그저 지켜봤을 뿐이오.',
      '을지문덕': '시 한 수 지어 올리리다.',
      '강감찬': '별빛은 오늘도 어김없었군.',
      '계백': '결사대 모두 수고했소!',
      '김유신': '삼국통일은 이렇게 하는 거지!',
      '광개토대왕': '땅이 또 늘었군!',
      '연개소문': '칼 다섯 자루가 다 울었다!',
      '양만춘': '안시성 지킨 솜씨 어떻소?',
      '최영': '황금은 필요 없고 쌀이나 주시오!',
      '안중근': '대한독립 만세! 오늘도 한 발 앞으로.',
      '제갈량': '계산대로입니다. 수고하셨습니다.',
      '주유': '화음이 완벽했지?',
      '사마의': '살아남았으니 내가 승자지.',
      '권율': '행주치마 값은 한 거요!',
      '곽재우': '붉은 옷이 눈에 띄어 이겼소!',
      '홍범도': '독립군 만세!',
      '김좌진': '청산리 대첩 재연 성공!',
      _pool: [
        '오늘 칼질 좀 잘 받네!', '월급 올려주시는 거죠?', '내가 했지만 내가 봐도 멋지다!',
        '다음 전투도 나만 믿어요!', '상금은 현금으로 부탁하오!', '박수는 크게, 환호는 더 크게!',
        '오늘 저녁은 고기 먹읍시다!', '이 정도면 승진 각이지!', '사진 한 장 찍어 줘, 간직하게.',
        '나 없었으면 큰일 날 뻔했지?', '피곤하지만 기분은 최고요!', '다들 나한테 고마워해야 해!',
        '이겼으니 낮잠 자러 갑니다~', '내 칼은 오늘도 무료 서비스!', '상처는 훈장, 승리는 습관!',
        '이름 석 자 똑똑히 기억하시오!', '휴가는 언제 주시오?', '조금만 더 칭찬해 줘도 되는데...'
      ]
    }
  };

  /* ===================================================================
   * 4. 조회 헬퍼 (게임 코드에서 호출)
   * =================================================================== */
  var lastLine = {};
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rndNoRepeat(key, arr) {
    var v = rnd(arr), n = 0;
    while (arr.length > 1 && v === lastLine[key] && n++ < 4) v = rnd(arr);
    lastLine[key] = v; return v;
  }
  function famOf(c) {
    c = String(c || '').toLowerCase();
    if (/군주|lord|king/.test(c)) return 'lord';
    if (/연노|crossbow/.test(c)) return 'crossbow';
    if (/궁|archer|bow/.test(c)) return 'archer';
    if (/기병|기마|cav|knight|horse/.test(c)) return 'cav';
    if (/등갑|방패|shield|armor/.test(c)) return 'shield';
    if (/창|spear|pike|lance/.test(c)) return 'spear';
    if (/풍수|책사|술사|도사|mage|sorc|strateg|wizard/.test(c)) return 'mage';
    if (/무도|martial|monk/.test(c)) return 'martial';
    if (/야수|beast/.test(c)) return 'beast';
    if (/무희|군악|dancer|bard|support|healer/.test(c)) return 'support';
    if (/검|sword|blade/.test(c)) return 'sword';
    return '';
  }
  function num(h, ks) {
    var S = [h, h && h.stats, h && h.abilities, h && h.stat];
    for (var i = 0; i < S.length; i++) if (S[i]) for (var j = 0; j < ks.length; j++) if (typeof S[i][ks[j]] === 'number') return S[i][ks[j]];
    return null;
  }
  function findHero(name) {
    var SK = g.SK || {}, src = [SK.HEROES, SK.heroes, SK.HERO_LIST, SK.state && SK.state.heroes, g.HEROES, g.heroes];
    for (var i = 0; i < src.length; i++) {
      var s = src[i]; if (!s) continue;
      if (Array.isArray(s)) { for (var j = 0; j < s.length; j++) if (s[j] && (s[j].name === name || s[j].n === name)) return s[j]; }
      else if (s[name]) return s[name];
    }
    return null;
  }
  function norm(h) {
    if (typeof h === 'string') return { name: h, hero: findHero(h) || {} };
    h = h || {}; return { name: h.name || h.n || '', hero: h };
  }
  /* 병과·성격·능력치로 폴백 풀 후보를 고른다 */
  function cats(h) {
    var out = [], fam = famOf(h.cls || h.class || h.unit || h.troop || h.type || '');
    if (fam) out.push(fam);
    var t = String(h.trait || h.personality || h.character || h['성격'] || h.tag || '');
    if (/용맹|호방|brave/.test(t)) out.push('brave');
    if (/지략|교활|cunning/.test(t)) out.push('cunning');
    if (/충의|충성|loyal/.test(t)) out.push('loyal');
    if (/저돌|무모|reckless/.test(t)) out.push('reckless');
    if (/침착|냉철|calm/.test(t)) out.push('calm');
    if (/술|drunk/.test(t)) out.push('drunk');
    if (/먹|식|foodie/.test(t)) out.push('foodie');
    var w = num(h, ['war', 'wu', 'str', '무력']), i = num(h, ['int', 'intel', '지력']), p = num(h, ['pol', 'politics', '정치']);
    if (w != null && w >= 85) out.push('brave');
    if (w != null && i != null && w >= 80 && i < 55) out.push('reckless');
    if (i != null && i >= 80) out.push('cunning');
    if (p != null && p >= 80) out.push('calm');
    var age = h.age; if (typeof age === 'number') { if (age >= 55) out.push('veteran'); if (age <= 22) out.push('young'); }
    if (h.gender === 'f' || h.sex === 'f' || /미녀|미남|beauty/.test(t)) out.push('beauty');
    return out;
  }

  g.V584 = {
    version: '5.8.4',
    /* phase: open | clash | win | lose */
    duelLine: function (who, phase) {
      var n = norm(who), d = L[n.name];
      /* v5.98 — 공통 피격은 장수와 무관하게 같은 풀을 쓴다 (꼬까옷 대사) */
      if (phase === 'hit') return rndNoRepeat('duelHit', L._hit);
      phase = L._pool.generic[phase] ? phase : 'open';
      var pick = function (v, key) {
        return Array.isArray(v) ? rndNoRepeat(key, v) : v;
      };
      if (d && d[phase]) return pick(d[phase], 'duel' + phase);
      var c = cats(n.hero), pool = c.length ? L._pool[rnd(c)] : L._pool.generic;
      if (!pool[phase]) pool = L._pool.generic;
      return rndNoRepeat('duel' + phase, pool[phase]);
    },
    captureLine: function (who) {
      var n = norm(who), E = g.V584_EXTRA_LINES.capture;
      return E[n.name] || rndNoRepeat('cap', E._pool);
    },
    mvpLine: function (who) {
      var n = norm(who), E = g.V584_EXTRA_LINES.mvp;
      return E[n.name] || rndNoRepeat('mvp', E._pool);
    },
    stats: function () {
      var E = g.V584_EXTRA_LINES;
      return {
        duelNamed: Object.keys(L).filter(function (k) { return k.charAt(0) !== '_'; }).length,
        duelPools: Object.keys(L._pool).length,
        duelHit: L._hit.length, duelLose: L._lose.length,
        captureNamed: Object.keys(E.capture).length - 1, capturePool: E.capture._pool.length,
        mvpNamed: Object.keys(E.mvp).length - 1, mvpPool: E.mvp._pool.length
      };
    }
  };
})(typeof window !== 'undefined' ? window : this);
