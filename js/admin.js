/* ═══════════════════════════════════════════════════════════════════════════
   v5.86 — 관리자 모드 (?admin=1)
   · 숨은 스탯 확장: 장수(통솔·회피%·치명%·반격피해%·흡혈%·필살기 교체)와
     병과(기본 agi·회피%·치명%·치명피해%·반격피해%·최소사거리·받는피해감소%·책략위력%·상태저항%).
     장수 쪽은 SK.HIDDEN_GEN[genId], 병과 쪽은 SK.CLASSES[key] 에 얹고,
     실제 전투 계산은 battle.js v5.86 블록(agiOf·hitRateOf·critChanceOf…)이 그 값을 읽는다.
   · 일반 주소(?v=106)에서는 이 파일이 SK.adminMode=false 만 남기고 즉시 끝나므로
     SK.HIDDEN_GEN 도 빈 객체 그대로다 (평소 전투는 표의 기본값으로만 돌아간다).

   v5.83 — 관리자 모드 (?admin=1)
   · 주소에 admin=1 이 있을 때만 이 파일이 화면에 무엇이든 만든다.
     일반 주소(?v=102)에서는 감시용 전역 변수 하나(SK.adminMode=false) 말고는
     DOM·저장소를 전혀 건드리지 않는다.
   · 기능 4가지
       ① 전 세력 AI 관전 + 배속(일시정지·×1·×2·×5·×10)
       ② 장수 편집  — 701명 검색/세력 필터 → 능력치·등급·병과·특기·소속·병력·충성
       ③ 보물 편집  — 350종 검색/등급 필터 → 지급·회수·등급·능력치·설명
       ④ 병과 편집  — 18병과 기본 능력치 + 4책략 위력/쿨타임/MP
   · 고친 값은 localStorage('samgukji-jojo-admin-v1')에 자동 저장되고,
     새로고침·재접속 때 SK.adminApply()가 다시 얹는다.
     [📋 변경사항 복사]는 원본과 다른 값만 골라 diff JSON으로 clipboard에 넣는다.
     [♻️ 기본값 초기화]는 이 파일이 기억한 원본으로 되돌린다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var SK = window.SK;
  if (!SK) return;
  var ADMIN_ON = (function () {
    try {
      var q = new URLSearchParams(window.location.search);
      var v = q.get('admin');
      return v === '1' || v === 'true';
    } catch (e) { return false; }
  })();
  SK.adminMode = ADMIN_ON;
  if (!ADMIN_ON) return;

  var STORE_KEY = 'samgukji-jojo-admin-v1';
  var TIERS = ['S', 'A', 'B', 'C'];
  var SPEEDS = [1, 2, 5, 10];
  /* v5.86 — 숨은 스탯. 장수는 SK.HIDDEN_GEN[genId] 로, 병과는 SK.CLASSES[key] 로 넘긴다.
     battle.js 는 SK.genHiddenOf / SK.classHiddenOf 한 곳으로만 읽으므로 여기만 맞추면 된다. */
  var GEN_HIDDEN = ['evaPct', 'critPct', 'cntPct', 'lifestealPct'];
  var CLS_HIDDEN = ['agi', 'evaPct', 'critPct', 'critDmgPct', 'cntPct', 'minRng', 'dmgRedPct', 'tacticPct', 'statusResPct'];
  var CLS_RANGE = {
    atk: [1, 80], def: [1, 80], ji: [-30, 60], mov: [1, 9], rng: [1, 7], mp: [0, 120],
    agi: [10, 100], evaPct: [0, 40], critPct: [0, 60], critDmgPct: [0, 100], cntPct: [-50, 100],
    minRng: [1, 3], dmgRedPct: [0, 50], tacticPct: [50, 200], statusResPct: [0, 60]
  };
  var GEN_HIDDEN_RANGE = { leadership: 'int', evaPct: [0, 40], critPct: [0, 60], cntPct: [-50, 100], lifestealPct: [0, 35] };
  /* 장수 숨은 스탯을 전투 쪽에 얹는다 (값이 없으면 아예 만들지 않는다 → 평소와 동일) */
  function syncGenHidden(id) {
    id = gid(id);
    var o = ST.gens[id];
    SK.HIDDEN_GEN = SK.HIDDEN_GEN || {};
    var out = null;
    if (o) {
      out = {};
      GEN_HIDDEN.forEach(function (k) { if (o[k] != null) out[k] = num(o[k], 0); });
      if (!Object.keys(out).length) out = null;
    }
    if (out) SK.HIDDEN_GEN[id] = out;
    else delete SK.HIDDEN_GEN[id];
  }
  /* 필살기 교체 — SK.ULTIMATES 는 '장수 이름'으로 잠겨 있으므로 고른 필살기를 그 이름에 복사한다 */
  function applyGenUlt(g, key) {
    if (!g || !key || !SK.ULTIMATES) return;
    var src = SK.ULTIMATES[key];
    if (!src) return;
    var copy = JSON.parse(JSON.stringify(src));
    copy.srcName = key;
    SK.ULTIMATES[g.name] = copy;
  }

  /* ── 저장소 ──────────────────────────────────────────────────────────────
     ST.gens[id]  = { war,intel,politics,charm,tier,cls,lv,loyal,cityId,passiveId,
                      leadership,evaPct,critPct,cntPct,lifestealPct,ult }
     ST.trees[id] = { grade,effect,statBonus:{war,leadership,intel,politics,charm,move,rng} }
     ST.cls[key]  = { atk,def,ji,mov,rng,mp, skills:[{p,cd,mp}],
                      agi,evaPct,critPct,critDmgPct,cntPct,minRng,dmgRedPct,tacticPct,statusResPct }
     ST.orig*     = 같은 모양의 '처음 값' (diff·초기화용)                        */
  var ST = { v: 1, gens: {}, trees: {}, cls: {}, origGen: {}, origTree: {}, origCls: {} };

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      ST.gens = o.gens || {};
      ST.trees = o.trees || {};
      ST.cls = o.cls || {};
      ST.origGen = o.origGen || {};
      ST.origTree = o.origTree || {};
      ST.origCls = o.origCls || {};
    } catch (e) { /* 저장소가 막힌 브라우저는 이번 판만 적용한다 */ }
  }
  var saveTimer = null;
  function saveStore() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(ST)); } catch (e) { /* ignore */ }
      var f = document.getElementById('adm-foot');
      if (f) f.textContent = '💾 자동 저장됨 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 240);
  }

  /* ── 작은 도우미 ───────────────────────────────────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function num(v, d) { var n = Number(v); return isNaN(n) ? d : n; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(n) { return String(Math.round(num(n, 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function plainText(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ''); }
  function state() { return SK.state || null; }
  function PF() { return (state() && state().playerFaction) || (SK.PF ? SK.PF() : 'caocao'); }
  function cityName(id) { return (SK.CITY && SK.CITY[id] && SK.CITY[id].name) || id || '—'; }
  function factionName(fid) { return fid === 'neutral' ? '재야' : (SK.factionName ? SK.factionName(fid) : fid); }
  /* 저장소의 키는 문자열, 판 안의 genId 는 숫자 — 어느 쪽으로 들어와도 맞춘다 */
  function gid(id) { var n = Number(id); return isNaN(n) ? id : n; }
  function heroOf(genId) {
    var s = state(), id = gid(genId);
    if (!s || !s.heroes) return null;
    for (var i = 0; i < s.heroes.length; i++) if (s.heroes[i].genId === id) return s.heroes[i];
    return null;
  }
  function aiHomeOf(genId) {
    var s = state(), id = gid(genId);
    if (!s) return null;
    var ids = Object.keys(s.cities || {});
    for (var i = 0; i < ids.length; i++) {
      var cs = s.cities[ids[i]];
      if (cs && (cs.genIds || []).indexOf(id) >= 0) return ids[i];
    }
    return null;
  }
  function allSkillsOf(cls) { return (SK.allSkillsOf ? SK.allSkillsOf(cls) : []) || []; }
  function classSkill(cls, i) { return SK.SKILLS['c_' + cls + '_' + i] || null; }
  function jobOfClass(cls) {
    var keys = Object.keys(SK.JOB_CLASS || {});
    for (var i = 0; i < keys.length; i++) if (SK.JOB_CLASS[keys[i]] === cls) return keys[i];
    return '';
  }
  function classKeys() {
    return Object.keys(SK.CLASSES || {}).filter(function (k) { return SK.CLASSES[k] && SK.CLASSES[k].name; });
  }
  function portOf(g) { return SK.ptSrc ? SK.ptSrc(SK.genPortrait(g)) : 'assets/portraits/v2/caocao.webp'; }
  function tierCls(t) { return 'tier-' + (TIERS.indexOf(t) >= 0 ? t : 'C'); }

  /* ═══════════════════════════════════════════════════════════════════════
     1) 적용 — 저장된 오버라이드를 실제 데이터·판에 얹는다
     ═══════════════════════════════════════════════════════════════════════ */
  function applyGen(id) {
    id = gid(id);
    var o = ST.gens[id]; if (!o) return;
    var g = SK.GEN_BY_ID[id]; if (!g) return;
    if (o.war != null) g.war = num(o.war, g.war);
    if (o.intel != null) g.intel = num(o.intel, g.intel);
    if (o.politics != null) g.politics = num(o.politics, g.politics);
    if (o.charm != null) g.charm = num(o.charm, g.charm);
    if (o.tier && TIERS.indexOf(o.tier) >= 0) g.tier = o.tier;
    if (o.cls) { var job = jobOfClass(o.cls); if (job) g.job = job; }
    if (o.passiveId) applyPassive(g, o.passiveId);
    /* v5.86 — 숨은 스탯: 통솔·필살기 교체 (나머지 %값은 SK.HIDDEN_GEN 으로) */
    if (o.leadership != null) g.leadership = clamp(Math.round(num(o.leadership, g.leadership)), 1, 100);
    if (o.ult) applyGenUlt(g, o.ult);
    syncGenHidden(id);

    var s = state(); if (!s) return;
    var h = heroOf(id);
    if (h) {
      h.wu = g.war; h.ji = g.intel; h.pol = g.politics; h.cha = g.charm; h.tong = g.leadership;
      h.tier = g.tier;
      h.cls = SK.genClass(g);
      h.unit = SK.genUnit(g);
      h.portrait = SK.genPortrait(g);
      if (o.lv != null) h.lv = clamp(num(o.lv, h.lv || 1), 1, 30);
      if (o.loyal != null) h.loyal = clamp(num(o.loyal, 100), 0, 100);
      var mx = SK.maxMpOf ? SK.maxMpOf(h.cls, h.lv) : h.mp;
      h.mp = Math.min(mx, num(h.mp, mx));
      if (o.cityId && s.cities[o.cityId] && s.cities[o.cityId].owner === s.playerFaction) h.city = o.cityId;
    } else {
      var home = aiHomeOf(id);
      if (home && s.cities[home]) {
        if (o.lv != null) { var cs = s.cities[home]; cs.genLv = cs.genLv || {}; cs.genLv[id] = clamp(num(o.lv, 1), 1, 30); }
        if (o.loyal != null) { s.genLoyal = s.genLoyal || {}; s.genLoyal[id] = clamp(num(o.loyal, 70), 0, 100); }
        if (o.cityId && o.cityId !== home && s.cities[o.cityId]) moveGeneral(id, o.cityId, true);
      }
    }
  }

  function applyPassive(g, passiveId) {
    if (!SK.PASSIVES) return;
    var tpl = passiveTemplate(passiveId);
    if (!tpl) return;
    var copy = JSON.parse(JSON.stringify(tpl));
    copy.name = g.name;
    SK.PASSIVES[g.name] = copy;
  }
  function passiveTemplate(passiveId) {
    if (!SK.PASSIVES || !passiveId) return null;
    var names = Object.keys(SK.PASSIVES);
    for (var i = 0; i < names.length; i++) {
      var p = SK.PASSIVES[names[i]];
      if (p && (p.v582 || p.id) === passiveId) return p;
    }
    return null;
  }
  function passiveKindList() {
    var seen = {}, out = [];
    var names = Object.keys(SK.PASSIVES || {});
    for (var i = 0; i < names.length; i++) {
      var p = SK.PASSIVES[names[i]];
      if (!p) continue;
      var id = p.v582 || p.id;
      if (!id || seen[id]) continue;
      seen[id] = 1;
      out.push({ id: id, title: p.title || names[i], effect: p.effect || '', trigger: p.trigger || '' });
    }
    return out.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
  }

  function applyTree(id) {
    var o = ST.trees[id]; if (!o) return;
    var t = SK.TREASURE_BY_ID[id]; if (!t) return;
    if (o.grade) t.grade = o.grade;
    if (o.effect != null) t.effect = o.effect;
    if (o.statBonus) t.statBonus = Object.assign({}, t.statBonus || {}, o.statBonus);
  }

  function applyClass(key) {
    var o = ST.cls[key]; if (!o) return;
    var C = SK.CLASSES[key]; if (!C) return;
    ['atk', 'def', 'ji', 'mov', 'rng', 'mp'].concat(CLS_HIDDEN).forEach(function (k) {
      if (o[k] != null) C[k] = num(o[k], C[k] == null ? 0 : C[k]);
    });
    (o.skills || []).forEach(function (sk, i) {
      var live = classSkill(key, i);
      if (!live || !sk) return;
      if (sk.p != null) {
        var e = skillEff(live);
        var v = num(sk.p, 0) / 100;
        if (e.key === 'amount') v = Math.min(0, v);
        live[e.key] = v;
      }
      if (sk.cd != null) live.cd = Math.max(0, num(sk.cd, 0));
      if (sk.mp != null) live.mp = Math.max(0, num(sk.mp, live.mp));
    });
  }

  function applyAll() {
    if (!SK.GENERALS || !SK.GENERALS.length) return false;
    Object.keys(ST.gens).forEach(applyGen);
    if (SK.TREASURE_BY_ID) Object.keys(ST.trees).forEach(applyTree);
    Object.keys(ST.cls).forEach(applyClass);
    return true;
  }
  SK.adminApply = applyAll;

  /* ── 장수 이동 (내 성 ↔ 다른 성) ───────────────────────────────────────── */
  function ownedCityIds() {
    var s = state(); if (!s) return [];
    return (SK.CITY_LIST || []).filter(function (c) { return s.cities[c.id] && s.cities[c.id].owner === s.playerFaction; }).map(function (c) { return c.id; });
  }
  function moveGeneral(genId, toCity, quiet) {
    var s = state(); if (!s) return false;
    genId = gid(genId);
    var g = SK.GEN_BY_ID[genId]; if (!g) return false;
    if (!s.cities[toCity]) return false;
    var h = heroOf(genId);
    var toOwner = s.cities[toCity].owner;
    if (h) {
      /* v5.83 — 남의 성으로 옮기면 우리 장수 명부에서 빠지고 그 성 소속이 된다 */
      if (toOwner !== s.playerFaction) {
        Object.keys(h.equip || {}).forEach(function (sl) {
          if (h.equip[sl] != null) { s.treasures = s.treasures || []; s.treasures.push(h.equip[sl]); delete h.equip[sl]; }
        });
        var idx = s.heroes.indexOf(h);
        if (idx >= 0) s.heroes.splice(idx, 1);
        s.cities[toCity].genIds = s.cities[toCity].genIds || [];
        if (s.cities[toCity].genIds.indexOf(genId) < 0) s.cities[toCity].genIds.push(genId);
        s.cities[toCity].genLv = s.cities[toCity].genLv || {};
        s.cities[toCity].genLv[genId] = clamp(num(h.lv, 1), 1, 30);
        s.genLoyal = s.genLoyal || {};
        s.genLoyal[genId] = clamp(num(h.loyal, 70), 0, 100);
        return true;
      }
      h.city = toCity;
      h.marchId = null; h.rfgTo = null;
      return true;
    }
    /* 적·재야 장수 → 다른 성으로 옮긴다. 내 성이면 부하 장수로 들어온다 */
    var from = aiHomeOf(genId);
    var lv = 1, loy = 70;
    if (from && s.cities[from]) {
      lv = num((s.cities[from].genLv || {})[genId], SK.genLv ? SK.genLv(g) : 1);
      loy = num((s.genLoyal || {})[genId], loy);
    }
    Object.keys(s.cities).forEach(function (cid) {
      var cs = s.cities[cid];
      if (!cs || !cs.genIds) return;
      var i = cs.genIds.indexOf(genId);
      if (i >= 0) cs.genIds.splice(i, 1);
      if (cs.genLv) delete cs.genLv[genId];
    });
    if (s.cities[toCity].owner === s.playerFaction) {
      var nh = SK.makeHero(g.name, toCity, lv);
      if (!nh) return false;
      nh.lv = clamp(lv, 1, 30);
      nh.loyal = clamp(loy, 0, 100);
      SK.addHero(s, nh);
      if (SK.PASSIVES && SK.PASSIVES[g.name] && SK.GEN_BY_NAME[g.name] !== g) { /* noop */ }
    } else {
      s.cities[toCity].genIds = s.cities[toCity].genIds || [];
      s.cities[toCity].genIds.push(genId);
      s.cities[toCity].genLv = s.cities[toCity].genLv || {};
      s.cities[toCity].genLv[genId] = clamp(lv, 1, 30);
      s.genLoyal = s.genLoyal || {};
      s.genLoyal[genId] = clamp(loy, 0, 100);
    }
    return true;
  }

  /* ── 원본 스냅샷 (diff·초기화의 바탕) ──────────────────────────────────── */
  function ensureOrigGen(id) {
    id = gid(id);
    if (ST.origGen[id]) return ST.origGen[id];
    var g = SK.GEN_BY_ID[id]; if (!g) return null;
    var h = heroOf(id);
    var home = h ? h.city : aiHomeOf(id);
    var cs = home && state() ? state().cities[home] : null;
    var o = {
      war: g.war, intel: g.intel, politics: g.politics, charm: g.charm,
      tier: g.tier, job: g.job, lv: h ? h.lv : (cs && cs.genLv ? num(cs.genLv[id], 1) : 1),
      loyal: h ? h.loyal : (state() && state().genLoyal ? state().genLoyal[id] : null),
      cityId: home || null,
      passive: SK.PASSIVES && SK.PASSIVES[g.name] ? JSON.parse(JSON.stringify(SK.PASSIVES[g.name])) : null,
      /* v5.86 — 숨은 스탯의 '처음 값' */
      leadership: g.leadership,
      ult: SK.ULTIMATES && SK.ULTIMATES[g.name] ? JSON.parse(JSON.stringify(SK.ULTIMATES[g.name])) : null,
    };
    ST.origGen[id] = o;
    return o;
  }
  function ensureOrigTree(id) {
    if (ST.origTree[id]) return ST.origTree[id];
    var t = SK.TREASURE_BY_ID[id]; if (!t) return null;
    var o = { grade: t.grade, effect: t.effect, statBonus: JSON.parse(JSON.stringify(t.statBonus || {})) };
    ST.origTree[id] = o;
    return o;
  }
  function skillEff(sk) {
    if (!sk) return { key: 'power', val: 0 };
    if (sk.power != null) return { key: 'power', val: sk.power };
    if (sk.atk != null) return { key: 'atk', val: sk.atk };
    if (sk.amount != null) return { key: 'amount', val: sk.amount };
    if (sk.healPct != null) return { key: 'healPct', val: sk.healPct };
    return { key: 'power', val: 0 };
  }
  function ensureOrigCls(key) {
    if (ST.origCls[key]) return ST.origCls[key];
    var C = SK.CLASSES[key]; if (!C) return null;
    var o = { atk: C.atk, def: C.def, ji: C.ji || 0, mov: C.mov, rng: C.rng, mp: C.mp, skills: [] };
    /* v5.86 — 숨은 스탯의 '처음 값' */
    var D = SK.CLASS_HIDDEN_DEFAULT || {};
    o.agi = C.agi; o.minRng = C.minRng == null ? 1 : C.minRng;
    CLS_HIDDEN.forEach(function (k) { if (o[k] == null) o[k] = C[k] == null ? (D[k] == null ? 0 : D[k]) : C[k]; });
    for (var i = 0; i < 4; i++) {
      var sk = classSkill(key, i);
      if (!sk) { o.skills.push(null); continue; }
      var e = skillEff(sk);
      o.skills.push({ p: Math.round(e.val * 1000) / 10, cd: num(sk.cd, 0), mp: num(sk.mp, 0), key: e.key });
    }
    ST.origCls[key] = o;
    return o;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     2) 패널 뼈대
     ═══════════════════════════════════════════════════════════════════════ */
  var UI = { open: false, tab: 'obs', gen: { q: '', fid: 'all', tier: 'all', limit: 60, sel: null },
    tree: { q: '', grade: 'all', limit: 60, sel: null }, cls: { sel: null }, timer: null };

  function build() {
    if ($('#adm-panel')) return;
    var el = document.createElement('div');
    el.id = 'adm-panel';
    el.className = 'adm';
    el.hidden = true;
    el.innerHTML =
      '<div class="adm-box">' +
        '<header class="adm-h">' +
          '<div class="adm-h-l"><b>🛠️ 관리자 모드</b><small>?admin=1 · v5.87a</small></div>' +
          '<div class="adm-h-r">' +
            '<button type="button" class="adm-mini" id="adm-copy-top">📋 복사</button>' +
            '<button type="button" class="adm-mini ghost" id="adm-reset-top" aria-label="기본값 초기화">♻️</button>' +
            '<button type="button" class="adm-x" id="adm-close" aria-label="닫기">✕</button>' +
          '</div>' +
        '</header>' +
        '<nav class="adm-tabs">' +
          '<button type="button" data-tab="obs" class="on">🤖 관전</button>' +
          '<button type="button" data-tab="gen">🧑 장수</button>' +
          '<button type="button" data-tab="tree">🎁 보물</button>' +
          '<button type="button" data-tab="cls">⚔ 병과</button>' +
          '<button type="button" data-tab="save">💾 저장</button>' +
        '</nav>' +
        '<div class="adm-body" id="adm-body"></div>' +
        '<footer class="adm-foot" id="adm-foot">고친 값은 이 폰에 자동 저장됩니다</footer>' +
      '</div>';
    document.body.appendChild(el);

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'adm-fab';
    fab.className = 'adm-fab';
    fab.innerHTML = '🛠️ 관리자';
    fab.title = '관리자 모드';
    fab.onclick = openPanel;
    /* #app 안에 넣어야 모달(#modal-root z=50) 아래, 화면 위에 놓인다 */
    (document.getElementById('app') || document.body).appendChild(fab);

    $('#adm-close', el).onclick = closePanel;
    $('#adm-copy-top', el).onclick = copyDiff;
    $('#adm-reset-top', el).onclick = askReset;
    $$('.adm-tabs button', el).forEach(function (b) {
      b.onclick = function () { UI.tab = b.dataset.tab; UI.gen.sel = null; UI.tree.sel = null; UI.cls.sel = null; render(); };
    });
  }

  function openPanel() {
    build();
    var el = $('#adm-panel');
    el.hidden = false;
    UI.open = true;
    document.getElementById('adm-fab').hidden = true;
    render();
    if (UI.timer) clearInterval(UI.timer);
    UI.timer = setInterval(function () { if (UI.open && UI.tab === 'obs') renderObsStatus(); }, 700);
  }
  function closePanel() {
    var el = $('#adm-panel');
    if (el) el.hidden = true;
    UI.open = false;
    var fab = document.getElementById('adm-fab');
    if (fab) fab.hidden = false;
    if (UI.timer) { clearInterval(UI.timer); UI.timer = null; }
  }
  SK.adminOpen = openPanel;
  SK.adminClose = closePanel;

  function render() {
    var el = $('#adm-panel'); if (!el || el.hidden) return;
    $$('.adm-tabs button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.tab === UI.tab); });
    var body = $('#adm-body', el);
    var top = body.scrollTop;
    if (UI.tab === 'obs') body.innerHTML = obsHTML();
    else if (UI.tab === 'gen') body.innerHTML = genHTML();
    else if (UI.tab === 'tree') body.innerHTML = treeHTML();
    else if (UI.tab === 'cls') body.innerHTML = clsHTML();
    else body.innerHTML = saveHTML();
    body.scrollTop = UI.tab === 'gen' || UI.tab === 'tree' ? 0 : top;
    bindPane(body);
    if (UI.tab === 'obs') renderObsStatus();
  }

  function bindPane(body) {
    if (UI.tab === 'obs') {
      var tg = $('#adm-obs-toggle', body);
      if (tg) tg.onclick = toggleObs;
      $$('[data-sp]', body).forEach(function (b) {
        b.onclick = function () { setSpeed(num(b.dataset.sp, 1)); };
      });
      var go = $('#adm-obs-map', body);
      if (go) go.onclick = function () { if (SK.showMap) SK.showMap(); closePanel(); };
    }
    if (UI.tab === 'gen') bindGen(body);
    if (UI.tab === 'tree') bindTree(body);
    if (UI.tab === 'cls') bindCls(body);
    if (UI.tab === 'save') {
      var c = $('#adm-copy', body); if (c) c.onclick = copyDiff;
      var r = $('#adm-reset', body); if (r) r.onclick = askReset;
      var rr = $('#adm-reset-state', body); if (rr) rr.onclick = resetStateEdits;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     3) 관전 탭
     ═══════════════════════════════════════════════════════════════════════ */
  function obsOn() { return !!(SK.devObs && SK.devObs.on); }
  function obsSpeed() { return (SK.devObs && SK.devObs.speed) || 1; }

  function obsHTML() {
    var on = obsOn();
    var sp = obsSpeed();
    var speeds = [[0, '⏸ 일시정지']].concat(SPEEDS.map(function (v) { return [v, '×' + v]; }));
    return '' +
      '<div class="adm-card">' +
        '<p class="adm-lead">플레이어 세력을 포함한 <b>모든 세력</b>이 AI로 내정·징병·출진하고, 전투는 자동 ×4로 지나갑니다. ' +
        '월정산·침공·포로·선택지 창도 알아서 넘깁니다. 전투가 벌어지면 그 전장이 끝날 때까지 달이 잠시 멈춥니다.</p>' +
        '<button type="button" class="adm-big' + (on ? ' on' : '') + '" id="adm-obs-toggle">' +
          (on ? '⏸ 관전 정지' : '▶ 전 세력 AI 관전 시작') + '</button>' +
        '<div class="adm-speeds">' +
          speeds.map(function (s) {
            var hot = on && s[0] > 0 && s[0] === sp;
            return '<button type="button" data-sp="' + s[0] + '" class="' + (hot ? 'on' : '') + '">' + s[1] + '</button>';
          }).join('') +
        '</div>' +
        '<p class="adm-hint">×1 ≈ 1.5초에 한 달 · ×10 ≈ 0.12초에 한 달. 관전 중에도 지도 화면은 그대로 보입니다.</p>' +
      '</div>' +
      '<div class="adm-card" id="adm-obs-status"></div>' +
      '<div class="adm-card"><p class="adm-sec">최근 소식</p><div class="adm-log" id="adm-obs-log"></div></div>' +
      '<div class="adm-card"><button type="button" class="adm-wide" id="adm-obs-map">🗺️ 지도 화면으로</button></div>';
  }

  function renderObsStatus() {
    var box = document.getElementById('adm-obs-status');
    if (!box) return;
    var s = state();
    if (!s) {
      box.innerHTML = '<p class="adm-empty">아직 판이 없습니다. 표지에서 <b>새로 시작</b>을 눌러 주세요.</p>';
      var lg0 = document.getElementById('adm-obs-log');
      if (lg0) lg0.innerHTML = '<div class="adm-dim">판을 열고 ▶ 를 누르면 AI가 대신 플레이합니다.</div>';
      return;
    }
    var tally = {}, troops = 0;
    (SK.CITY_LIST || []).forEach(function (c) {
      var cs = s.cities[c.id];
      if (!cs) return;
      if (cs.owner && cs.owner !== 'neutral') { tally[cs.owner] = (tally[cs.owner] || 0) + 1; troops += num(cs.troops, 0); }
    });
    var fids = Object.keys(tally);
    var top = null;
    fids.forEach(function (f) { if (!top || tally[f] > tally[top]) top = f; });
    var date = SK.dateLabel ? SK.dateLabel(s.eraYear || (195 + (s.year || 1)), s.month) : (s.year + '년');
    var B = (window.SKBattle && SKBattle.debug) ? SKBattle.debug.battle : null;
    var inBattle = !!(B && !B.over);
    box.innerHTML =
      '<div class="adm-stats">' +
        '<div><span>연월</span><b>' + esc(date) + '</b></div>' +
        '<div><span>남은 세력</span><b>' + fids.length + '</b></div>' +
        '<div><span>1위</span><b>' + esc(top ? factionName(top) : '—') + (top ? ' <em>' + tally[top] + '성</em>' : '') + '</b></div>' +
        '<div><span>총 병력</span><b>' + fmt(troops) + '</b></div>' +
        '<div><span>관전</span><b class="' + (obsOn() ? 'on' : '') + '">' + (obsOn() ? '진행 중 ×' + obsSpeed() : '정지') + '</b></div>' +
        '<div><span>전장</span><b>' + (inBattle ? '⚔ 자동 전투 ×4' : '—') + '</b></div>' +
        '<div><span>내 세력</span><b>' + esc(factionName(s.playerFaction)) + ' ' + (tally[s.playerFaction] || 0) + '성</b></div>' +
      '</div>';
    var log = document.getElementById('adm-obs-log');
    if (log) {
      var lines = (SK.devObs && SK.devObs.log ? SK.devObs.log() : []).slice(-7);
      log.innerHTML = lines.length ? lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('')
        : '<div class="adm-dim">▶ 를 누르면 AI가 대신 플레이합니다.</div>';
    }
  }

  function toggleObs() {
    if (!SK.devObs) { toast('관전 도구를 불러오지 못했습니다. 새로고침해 주세요.'); return; }
    if (obsOn()) SK.devObs.stop('⏸ 관리자 — 관전 정지');
    else SK.devObs.start();
    render();
  }
  function setSpeed(v) {
    if (!SK.devObs) { toast('관전 도구를 불러오지 못했습니다.'); return; }
    if (v === 0) {
      if (obsOn()) SK.devObs.stop('⏸ 일시정지');
      render();
      return;
    }
    SK.devObs.setSpeed(v);
    if (!obsOn()) SK.devObs.start();
    render();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4) 장수 탭
     ═══════════════════════════════════════════════════════════════════════ */
  function genFactions() {
    var s = state();
    var out = [{ id: 'all', name: '전체' }, { id: 'player', name: '내 세력' }];
    if (s && s.factions) {
      Object.keys(s.factions).sort(function (a, b) {
        return String(s.factions[a].name).localeCompare(String(s.factions[b].name));
      }).forEach(function (fid) {
        if (fid === s.playerFaction) return;
        out.push({ id: fid, name: s.factions[fid].name || fid });
      });
    }
    out.push({ id: 'neutral', name: '재야' });
    return out;
  }
  function genOwnerOf(genId) {
    var s = state();
    if (!s) return { fid: 'neutral', city: null };
    var h = heroOf(genId);
    if (h) return { fid: s.playerFaction, city: h.city };
    var cid = aiHomeOf(genId);
    if (cid && s.cities[cid]) return { fid: s.cities[cid].owner, city: cid };
    return { fid: 'neutral', city: null };
  }
  function genFiltered() {
    var s = state();
    var q = UI.gen.q.trim();
    var out = [];
    (SK.GENERALS || []).forEach(function (g) {
      var own = genOwnerOf(g.id);
      if (UI.gen.fid === 'player' && own.fid !== (s && s.playerFaction)) return;
      if (UI.gen.fid !== 'all' && UI.gen.fid !== 'player' && own.fid !== UI.gen.fid) return;
      var ttier = g.tier || 'C';
      if (UI.gen.tier !== 'all' && ttier !== UI.gen.tier) return;
      if (q && String(g.name).indexOf(q) < 0) return;
      out.push({ g: g, own: own });
    });
    out.sort(function (a, b) {
      var ta = TIERS.indexOf(a.g.tier || 'C'), tb = TIERS.indexOf(b.g.tier || 'C');
      if (ta !== tb) return ta - tb;
      return String(a.g.name).localeCompare(String(b.g.name));
    });
    return out;
  }

  function genHTML() {
    if (!SK.GENERALS || !SK.GENERALS.length) return '<p class="adm-empty">장수 데이터를 불러오는 중입니다…</p>';
    if (UI.gen.sel != null) return genDetailHTML(UI.gen.sel);
    var list = genFiltered();
    var shown = list.slice(0, UI.gen.limit);
    var rows = shown.map(function (r) {
      var g = r.g, own = r.own;
      var lv = 1;
      var h = heroOf(g.id);
      if (h) lv = h.lv || 1;
      else if (own.city && state().cities[own.city] && state().cities[own.city].genLv) lv = num(state().cities[own.city].genLv[g.id], 1);
      return '<button type="button" class="adm-row" data-gen="' + g.id + '">' +
        '<span class="adm-pt tf ' + tierCls(g.tier) + '"><img src="' + esc(portOf(g)) + '" alt="" loading="lazy"></span>' +
        '<span class="adm-rowmain"><b>' + esc(g.name) + ' <em class="adm-tier ' + tierCls(g.tier) + '">' + esc(g.tier || 'C') + '</em></b>' +
        '<small>' + esc(factionName(own.fid)) + (own.city ? ' · ' + esc(cityName(own.city)) : '') + ' · ' + esc((SK.CLASSES[SK.genClass(g)] || {}).name || '') + ' · Lv.' + lv + '</small></span>' +
        '<span class="adm-arrow">›</span></button>';
    }).join('');
    return '' +
      '<div class="adm-filter">' +
        '<input type="search" id="adm-gen-q" class="adm-search" placeholder="장수 이름 검색 (701명)" value="' + esc(UI.gen.q) + '">' +
        '<div class="adm-chips">' + genFactions().map(function (f) {
          return '<button type="button" data-fid="' + esc(f.id) + '" class="' + (UI.gen.fid === f.id ? 'on' : '') + '">' + esc(f.name) + '</button>';
        }).join('') + '</div>' +
        '<div class="adm-chips tiers">' + ['all'].concat(TIERS).map(function (t) {
          return '<button type="button" data-tier="' + t + '" class="' + (UI.gen.tier === t ? 'on' : '') + '">' + (t === 'all' ? '전체' : t + '급') + '</button>';
        }).join('') + '</div>' +
        '<p class="adm-count">' + list.length + '명 중 ' + shown.length + '명 표시</p>' +
      '</div>' +
      '<div class="adm-list">' + (rows || '<p class="adm-empty">조건에 맞는 장수가 없습니다.</p>') + '</div>' +
      (list.length > shown.length ? '<button type="button" class="adm-wide" id="adm-gen-more">＋ ' + (list.length - shown.length) + '명 더 보기</button>' : '');
  }

  function genDetailHTML(id) {
    var g = SK.GEN_BY_ID[id];
    if (!g) return '<p class="adm-empty">장수를 찾을 수 없습니다.</p>';
    var s = state();
    var own = genOwnerOf(id);
    var h = heroOf(id);
    var lv = h ? (h.lv || 1) : (own.city && s && s.cities[own.city] && s.cities[own.city].genLv ? num(s.cities[own.city].genLv[id], 1) : 1);
    var loyal = h ? num(h.loyal, 100) : num((s && s.genLoyal ? s.genLoyal[id] : null), 70);
    var cs = own.city && s ? s.cities[own.city] : null;
    var passives = passiveKindList();
    var curP = SK.PASSIVES && SK.PASSIVES[g.name];
    var curPid = curP ? (curP.v582 || curP.id || '') : '';
    var myCities = ownedCityIds();
    var otherCities = (SK.CITY_LIST || []).filter(function (c) {
      var cs = s && s.cities[c.id];
      return cs && cs.owner !== s.playerFaction && cs.owner !== 'neutral';
    }).sort(function (a, b) { return String(cityName(a.id)).localeCompare(String(cityName(b.id))); });
    var stat = function (label, k, v, min, max) {
      return '<label class="adm-num"><span>' + label + '</span>' +
        '<input type="number" inputmode="numeric" data-k="' + k + '" value="' + v + '" min="' + min + '" max="' + max + '"></label>';
    };
    /* v5.86 — 숨은 스탯(소수 허용) */
    var hid = SK.HIDDEN_GEN && SK.HIDDEN_GEN[id] ? SK.HIDDEN_GEN[id] : {};
    var hf = function (label, k, lo, hi) {
      var v = hid[k] == null ? 0 : num(hid[k], 0);
      return '<label class="adm-num"><span>' + label + '</span>' +
        '<input type="number" inputmode="decimal" step="0.5" data-k="' + k + '" value="' + v + '" min="' + lo + '" max="' + hi + '"></label>';
    };
    var ultKeys = SK.ULTIMATES ? Object.keys(SK.ULTIMATES) : [];
    var curUlt = (ST.gens[id] && ST.gens[id].ult) || '';
    var ultP = SK.ULTIMATES && SK.ULTIMATES[g.name];
    return '' +
      '<button type="button" class="adm-back" id="adm-gen-back">‹ 장수 목록</button>' +
      '<div class="adm-dhead">' +
        '<span class="adm-pt big tf ' + tierCls(g.tier) + '"><img src="' + esc(portOf(g)) + '" alt=""></span>' +
        '<div><b>' + esc(g.name) + '</b><small>' + esc(factionName(own.fid)) + (own.city ? ' · ' + esc(cityName(own.city)) : ' · 재야') + ' · ' + esc((SK.CLASSES[SK.genClass(g)] || {}).name || '') + '</small>' +
        '<em class="adm-tier ' + tierCls(g.tier) + '">' + esc(g.tier || 'C') + '급</em></div>' +
      '</div>' +
      '<div class="adm-card">' +
        '<p class="adm-sec">능력치</p>' +
        '<div class="adm-nums">' +
          stat('무력', 'war', g.war, 1, 100) + stat('지력', 'intel', g.intel, 1, 100) +
          stat('정치', 'politics', g.politics, 1, 100) + stat('매력', 'charm', g.charm, 1, 100) +
          stat('레벨', 'lv', lv, 1, 30) + stat('충성', 'loyal', loyal, 0, 100) +
        '</div>' +
        '<p class="adm-sec">등급 · 병과</p>' +
        '<div class="adm-nums">' +
          '<label class="adm-num"><span>등급</span><select data-k="tier">' + TIERS.map(function (t) {
            return '<option value="' + t + '"' + (g.tier === t ? ' selected' : '') + '>' + t + '급</option>';
          }).join('') + '</select></label>' +
          '<label class="adm-num wide"><span>병과</span><select data-k="cls">' + classKeys().map(function (k) {
            return '<option value="' + k + '"' + (SK.genClass(g) === k ? ' selected' : '') + '>' + esc(SK.CLASSES[k].name) + '</option>';
          }).join('') + '</select></label>' +
        '</div>' +
      '</div>' +
      '<div class="adm-card">' +
        '<p class="adm-sec">숨은 스탯 (v5.86)</p>' +
        '<div class="adm-nums">' +
          stat('통솔', 'leadership', g.leadership, 1, 100) +
          hf('회피 %', 'evaPct', 0, 40) + hf('치명 %', 'critPct', 0, 60) +
          hf('반격피해 %', 'cntPct', -50, 100) + hf('흡혈 %', 'lifestealPct', 0, 35) +
        '</div>' +
        '<label class="adm-num wide"><span>필살기 교체</span><select data-k="ult">' +
          '<option value="">— 원래 필살기 그대로 —</option>' +
          ultKeys.map(function (k) {
            return '<option value="' + esc(k) + '"' + (curUlt === k ? ' selected' : '') + '>' + esc(k) + '</option>';
          }).join('') +
        '</select></label>' +
        '<p class="adm-hint">지금 필살기: <b>' + esc(ultP ? ((ultP.srcName ? ultP.srcName + ' → ' : '') + (ultP.name || ultP.title || g.name)) : '없음') + '</b>' +
          ' · 숨은 스탯은 이 폰(관리자 모드)에서만 적용됩니다.' +
          ' 민첩 = 병과 기본 agi + (무력−60)×0.1, 운(매력)은 상태저항·치명에 이미 들어갑니다.</p>' +
      '</div>' +
      '<div class="adm-card">' +
        '<p class="adm-sec">고유 특기</p>' +
        '<select class="adm-wide" data-k="passiveId">' +
          '<option value="">— 원래 특기 그대로 —</option>' +
          passives.map(function (p) {
            return '<option value="' + esc(p.id) + '"' + (curPid === p.id ? ' selected' : '') + '>' + esc(p.title) + (p.trigger === 'passive' ? ' (상시)' : '') + '</option>';
          }).join('') +
        '</select>' +
        '<p class="adm-hint">' + esc(curP ? (curP.title || '') + ' — ' + plainText(curP.effect || '') : '이 장수에게 붙은 특기 데이터가 없습니다.') + '</p>' +
      '</div>' +
      '<div class="adm-card">' +
        '<p class="adm-sec">소속 · 병력</p>' +
        '<p class="adm-hint">지금: <b>' + esc(factionName(own.fid)) + (own.city ? ' · ' + esc(cityName(own.city)) : '') + '</b>' +
          (cs ? ' · 성 병력 ' + fmt(cs.troops) + ' · 금 ' + fmt(cs.gold) : '') + '</p>' +
        (myCities.length || otherCities.length ? '<label class="adm-num wide"><span>소속 성 바꾸기</span><select data-k="cityId">' +
          '<option value="">— 그대로 —</option>' +
          (myCities.length ? '<optgroup label="내 성">' + myCities.map(function (cid) {
            return '<option value="' + esc(cid) + '"' + (own.city === cid ? ' selected' : '') + '>' + esc(cityName(cid)) + '</option>';
          }).join('') + '</optgroup>' : '') +
          (otherCities.length ? '<optgroup label="다른 세력 성">' + otherCities.map(function (c) {
            return '<option value="' + esc(c.id) + '"' + (own.city === c.id ? ' selected' : '') + '>' + esc(factionName(s.cities[c.id].owner)) + ' · ' + esc(cityName(c.id)) + '</option>';
          }).join('') + '</optgroup>' : '') +
          '</select></label>' : '') +
        (cs ? '<label class="adm-num wide"><span>소속 성 병력</span><input type="number" inputmode="numeric" data-k="cityTroops" value="' + num(cs.troops, 0) + '" min="0" max="999999"></label>' : '') +
        (own.fid !== (s && s.playerFaction) ? '<button type="button" class="adm-wide gold" id="adm-gen-hire">🤝 내 세력으로 데려오기</button>' : '') +
      '</div>' +
      '<button type="button" class="adm-wide danger" id="adm-gen-reset">이 장수만 기본값으로</button>';
  }

  function bindGen(body) {
    var q = $('#adm-gen-q', body);
    if (q) {
      q.oninput = function () {
        UI.gen.q = q.value; UI.gen.limit = 60;
        var v = q.value;
        render();
        var q2 = document.getElementById('adm-gen-q');
        if (q2) { q2.focus(); try { q2.setSelectionRange(v.length, v.length); } catch (e) { /* ignore */ } }
      };
    }
    $$('[data-fid]', body).forEach(function (b) {
      b.onclick = function () { UI.gen.fid = b.dataset.fid; UI.gen.limit = 60; render(); };
    });
    $$('[data-tier]', body).forEach(function (b) {
      b.onclick = function () { UI.gen.tier = b.dataset.tier; UI.gen.limit = 60; render(); };
    });
    $$('[data-gen]', body).forEach(function (b) {
      b.onclick = function () { UI.gen.sel = num(b.dataset.gen, null); render(); };
    });
    var more = $('#adm-gen-more', body);
    if (more) more.onclick = function () { UI.gen.limit += 60; render(); };
    var back = $('#adm-gen-back', body);
    if (back) back.onclick = function () { UI.gen.sel = null; render(); };
    var reset = $('#adm-gen-reset', body);
    if (reset) reset.onclick = function () { resetGen(UI.gen.sel); render(); };
    var hire = $('#adm-gen-hire', body);
    if (hire) hire.onclick = function () {
      var ids = ownedCityIds();
      if (!ids.length) { toast('내 성이 없습니다.'); return; }
      var to = UI.gen.sel != null ? genOwnerOf(UI.gen.sel).city : null;
      var pick = ids.indexOf(SK.state.playerCapital) >= 0 ? SK.state.playerCapital : ids[0];
      if (moveGeneral(UI.gen.sel, pick, false)) {
        rememberCity(UI.gen.sel, pick);
        SK.save(); refreshWorld();
        toast(cityName(pick) + '(으)로 데려왔습니다.');
        render();
      }
    };
    var d = $('.adm-dhead', body);
    if (!d) return;
    var pane = body;
    var handler = function (e) {
      var el = e.target;
      var k = el && el.dataset ? el.dataset.k : '';
      if (!k) return;
      if (UI.gen.sel == null) return;
      onGenField(k, el);
    };
    pane.oninput = handler;
    pane.onchange = handler;
  }

  function rememberCity(id, cityId) {
    id = gid(id);
    ensureOrigGen(id);
    ST.gens[id] = ST.gens[id] || {};
    ST.gens[id].cityId = cityId;
    saveStore();
  }

  function onGenField(k, el) {
    var id = UI.gen.sel;
    var g = SK.GEN_BY_ID[id];
    if (!g) return;
    ensureOrigGen(id);
    var o = ST.gens[id] = ST.gens[id] || {};
    if (k === 'cityTroops') {
      var own = genOwnerOf(id);
      var cs = own.city && state() ? state().cities[own.city] : null;
      if (!cs) return;
      cs.troops = clamp(Math.round(num(el.value, cs.troops)), 0, 999999);
      SK.save();
      return;
    }
    if (k === 'tier') { o.tier = el.value; }
    else if (k === 'cls') { o.cls = el.value; }
    else if (k === 'ult') { o.ult = el.value; }
    else if (k === 'leadership' || k === 'evaPct' || k === 'critPct' || k === 'cntPct' || k === 'lifestealPct') {
      var rg = GEN_HIDDEN_RANGE[k];
      if (k === 'leadership') o.leadership = clamp(Math.round(num(el.value, g.leadership)), 1, 100);
      else o[k] = clamp(Math.round(num(el.value, 0) * 10) / 10, rg[0], rg[1]);
    }
    else if (k === 'passiveId') {
      if (!el.value) { o.passiveId = ''; }
      else o.passiveId = el.value;
    } else if (k === 'cityId') {
      if (!el.value) return;
      if (!moveGeneral(id, el.value, false)) { toast('옮기지 못했습니다.'); return; }
      o.cityId = el.value;
      SK.save(); refreshWorld();
      toast(cityName(el.value) + '(으)로 옮겼습니다.');
      render();
      return;
    } else if (k === 'lv' || k === 'loyal') {
      o[k] = clamp(Math.round(num(el.value, 1)), k === 'lv' ? 1 : 0, k === 'lv' ? 30 : 100);
    } else {
      o[k] = clamp(Math.round(num(el.value, 0)), 1, 100);
    }
    if (k === 'ult' && !el.value && SK.ULTIMATES) {
      var og = ST.origGen[id];
      if (og && og.ult) SK.ULTIMATES[g.name] = JSON.parse(JSON.stringify(og.ult));
      delete ST.gens[id].ult;
    }
    applyGen(id);
    SK.save(); refreshWorld();
    saveStore();
  }

  function resetGen(id) {
    id = gid(id);
    var o = ST.origGen[id];
    var g = SK.GEN_BY_ID[id];
    if (g && o) {
      g.war = o.war; g.intel = o.intel; g.politics = o.politics; g.charm = o.charm; g.tier = o.tier; g.job = o.job;
      /* v5.86 — 숨은 스탯·필살기 교체도 처음 값으로 */
      if (o.leadership != null) g.leadership = o.leadership;
      if (SK.ULTIMATES) {
        if (o.ult) SK.ULTIMATES[g.name] = JSON.parse(JSON.stringify(o.ult));
        else delete SK.ULTIMATES[g.name];
      }
      if (SK.PASSIVES) {
        if (o.passive) SK.PASSIVES[g.name] = JSON.parse(JSON.stringify(o.passive));
        else if (SK.PASSIVES[g.name]) delete SK.PASSIVES[g.name];
      }
      var h = heroOf(id);
      if (h) {
        h.wu = g.war; h.ji = g.intel; h.pol = g.politics; h.cha = g.charm; h.tong = g.leadership; h.tier = g.tier;
        h.cls = SK.genClass(g); h.unit = SK.genUnit(g); h.portrait = SK.genPortrait(g);
        if (o.lv != null) h.lv = o.lv;
        if (o.loyal != null) h.loyal = o.loyal;
        if (o.cityId) h.city = o.cityId;
      } else {
        var home = aiHomeOf(id);
        if (home && o.lv != null) { var cs = state().cities[home]; cs.genLv = cs.genLv || {}; cs.genLv[id] = o.lv; }
        if (o.loyal != null) { state().genLoyal = state().genLoyal || {}; state().genLoyal[id] = o.loyal; }
      }
    }
    delete ST.gens[id]; delete ST.origGen[id];
    syncGenHidden(id);
    saveStore(); SK.save(); refreshWorld();
    toast('이 장수를 처음 값으로 되돌렸습니다.');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     5) 보물 탭
     ═══════════════════════════════════════════════════════════════════════ */
  var TREASURE_GRADES = ['전설', '영웅', '희귀', '일반'];

  function treeOwned(id) {
    var s = state();
    if (!s) return false;
    if ((s.treasures || []).indexOf(id) >= 0) return true;
    for (var i = 0; i < (s.heroes || []).length; i++) {
      var eq = s.heroes[i].equip || {};
      var keys = Object.keys(eq);
      for (var j = 0; j < keys.length; j++) if (eq[keys[j]] === id) return true;
    }
    return false;
  }
  function treeEquippedBy(id) {
    var s = state();
    for (var i = 0; i < ((s && s.heroes) || []).length; i++) {
      var h = s.heroes[i], eq = h.equip || {};
      var keys = Object.keys(eq);
      for (var j = 0; j < keys.length; j++) if (eq[keys[j]] === id) return h;
    }
    return null;
  }
  function treeFiltered() {
    var q = UI.tree.q.trim();
    return (SK.TREASURES || []).filter(function (t) {
      if (UI.tree.grade !== 'all' && t.grade !== UI.tree.grade) return false;
      if (q && String(t.name).indexOf(q) < 0) return false;
      return true;
    });
  }

  function treeHTML() {
    if (!SK.TREASURES || !SK.TREASURES.length) {
      if (SK.loadTreasures) SK.loadTreasures();
      return '<p class="adm-empty">보물 데이터를 불러오는 중입니다…</p>';
    }
    if (UI.tree.sel != null) return treeDetailHTML(UI.tree.sel);
    var list = treeFiltered();
    var shown = list.slice(0, UI.tree.limit);
    var rows = shown.map(function (t) {
      var owned = treeOwned(t.id);
      return '<button type="button" class="adm-row" data-tree="' + t.id + '">' +
        '<span class="adm-gem ' + (owned ? 'on' : '') + '">🎁</span>' +
        '<span class="adm-rowmain"><b>' + esc(t.name) + ' <em class="adm-grade g-' + esc(t.grade || '일반') + '">' + esc(t.grade || '일반') + '</em></b>' +
        '<small>' + esc(t.type || '') + ' · ' + esc(t.effect || '') + '</small></span>' +
        (owned ? '<span class="adm-badge">보유</span>' : '') +
        '<span class="adm-arrow">›</span></button>';
    }).join('');
    return '' +
      '<div class="adm-filter">' +
        '<input type="search" id="adm-tree-q" class="adm-search" placeholder="보물 이름 검색 (350종)" value="' + esc(UI.tree.q) + '">' +
        '<div class="adm-chips">' + ['all'].concat(TREASURE_GRADES).map(function (gr) {
          return '<button type="button" data-grade="' + esc(gr) + '" class="' + (UI.tree.grade === gr ? 'on' : '') + '">' + (gr === 'all' ? '전체' : gr) + '</button>';
        }).join('') + '</div>' +
        '<p class="adm-count">' + list.length + '종 중 ' + shown.length + '종 표시</p>' +
      '</div>' +
      '<div class="adm-list">' + (rows || '<p class="adm-empty">조건에 맞는 보물이 없습니다.</p>') + '</div>' +
      (list.length > shown.length ? '<button type="button" class="adm-wide" id="adm-tree-more">＋ ' + (list.length - shown.length) + '종 더 보기</button>' : '');
  }

  function treeDetailHTML(id) {
    var t = SK.TREASURE_BY_ID[id];
    if (!t) return '<p class="adm-empty">보물을 찾을 수 없습니다.</p>';
    var owned = treeOwned(id);
    var eq = treeEquippedBy(id);
    var stb = t.statBonus || {};
    var f = function (label, key, v, min, max) {
      return '<label class="adm-num"><span>' + label + '</span><input type="number" inputmode="numeric" data-tk="' + key + '" value="' + num(v, 0) + '" min="' + min + '" max="' + max + '"></label>';
    };
    return '' +
      '<button type="button" class="adm-back" id="adm-tree-back">‹ 보물 목록</button>' +
      '<div class="adm-dhead">' +
        '<span class="adm-gem big">🎁</span>' +
        '<div><b>' + esc(t.name) + '</b><small>' + esc(t.type || '') + ' · ' + esc(t.grade || '일반') + (owned ? ' · 보유 중' : ' · 미보유') + '</small>' +
        (eq ? '<em class="adm-hint">' + esc(eq.name) + ' 장착</em>' : '') + '</div>' +
      '</div>' +
      '<div class="adm-card">' +
        '<button type="button" class="adm-big ' + (owned ? 'off' : '') + '" id="adm-tree-give">' + (owned ? '↩️ 보물고에서 회수' : '🎁 아군 보물고에 지급') + '</button>' +
        '<p class="adm-hint">지급하면 보관함에 들어가 장수에게 장착할 수 있습니다. 회수하면 장착 중이던 자리에서도 빠집니다.</p>' +
      '</div>' +
      '<div class="adm-card">' +
        '<p class="adm-sec">등급 · 설명</p>' +
        '<label class="adm-num wide"><span>등급</span><select data-tk="grade">' + TREASURE_GRADES.map(function (gr) {
          return '<option value="' + gr + '"' + (t.grade === gr ? ' selected' : '') + '>' + gr + '</option>';
        }).join('') + '</select></label>' +
        '<label class="adm-field"><span>설명</span><textarea data-tk="effect" rows="2">' + esc(t.effect || '') + '</textarea></label>' +
      '</div>' +
      '<div class="adm-card">' +
        '<p class="adm-sec">능력치</p>' +
        '<div class="adm-nums">' +
          f('무력', 'war', stb.war, -20, 40) + f('통솔', 'leadership', stb.leadership, -20, 40) +
          f('지력', 'intel', stb.intel, -20, 40) + f('정치', 'politics', stb.politics, -20, 40) +
          f('매력', 'charm', stb.charm, -20, 40) + f('이동력', 'move', stb.move, -3, 6) +
          f('사거리', 'rng', stb.rng, -1, 3) +
        '</div>' +
      '</div>' +
      '<button type="button" class="adm-wide danger" id="adm-tree-reset">이 보물만 기본값으로</button>';
  }

  function bindTree(body) {
    var q = $('#adm-tree-q', body);
    if (q) {
      q.oninput = function () {
        UI.tree.q = q.value; UI.tree.limit = 60;
        var v = q.value;
        render();
        var q2 = document.getElementById('adm-tree-q');
        if (q2) { q2.focus(); try { q2.setSelectionRange(v.length, v.length); } catch (e) { /* ignore */ } }
      };
    }
    $$('[data-grade]', body).forEach(function (b) {
      b.onclick = function () { UI.tree.grade = b.dataset.grade; UI.tree.limit = 60; render(); };
    });
    $$('[data-tree]', body).forEach(function (b) {
      b.onclick = function () { UI.tree.sel = num(b.dataset.tree, null); render(); };
    });
    var more = $('#adm-tree-more', body);
    if (more) more.onclick = function () { UI.tree.limit += 60; render(); };
    var back = $('#adm-tree-back', body);
    if (back) back.onclick = function () { UI.tree.sel = null; render(); };
    var give = $('#adm-tree-give', body);
    if (give) give.onclick = function () { toggleTreeOwned(UI.tree.sel); };
    var reset = $('#adm-tree-reset', body);
    if (reset) reset.onclick = function () { resetTree(UI.tree.sel); render(); };
    var handler = function (e) {
      var el = e.target;
      var k = el && el.dataset ? el.dataset.tk : '';
      if (!k || UI.tree.sel == null) return;
      onTreeField(k, el);
    };
    body.oninput = handler;
    body.onchange = handler;
  }

  function onTreeField(k, el) {
    var id = UI.tree.sel;
    var t = SK.TREASURE_BY_ID[id];
    if (!t) return;
    ensureOrigTree(id);
    var o = ST.trees[id] = ST.trees[id] || {};
    if (k === 'grade') o.grade = el.value;
    else if (k === 'effect') o.effect = el.value;
    else {
      o.statBonus = o.statBonus || {};
      o.statBonus[k] = Math.round(num(el.value, 0));
    }
    applyTree(id);
    saveStore();
  }

  function toggleTreeOwned(id) {
    var s = state();
    if (!s) { toast('먼저 게임을 시작하세요.'); return; }
    var t = SK.TREASURE_BY_ID[id];
    if (!t) return;
    s.treasures = s.treasures || [];
    var idx = s.treasures.indexOf(id);
    if (idx >= 0) {
      s.treasures.splice(idx, 1);
      (s.heroes || []).forEach(function (h) {
        Object.keys(h.equip || {}).forEach(function (sl) { if (h.equip[sl] === id) delete h.equip[sl]; });
      });
      toast('『' + t.name + '』 회수');
    } else {
      s.treasures.push(id);
      if (SK.codexTreasure) { try { SK.codexTreasure(t); } catch (e) { /* ignore */ } }
      toast('『' + t.name + '』 지급');
    }
    SK.save();
    render();
  }

  function resetTree(id) {
    var t = SK.TREASURE_BY_ID[id];
    var o = ST.origTree[id];
    if (t && o) {
      t.grade = o.grade;
      t.effect = o.effect;
      t.statBonus = JSON.parse(JSON.stringify(o.statBonus || {}));
    }
    delete ST.trees[id]; delete ST.origTree[id];
    saveStore();
    toast('보물을 처음 값으로 되돌렸습니다.');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     6) 병과 탭
     ═══════════════════════════════════════════════════════════════════════ */
  function clsHTML() {
    var keys = classKeys();
    if (!keys.length) return '<p class="adm-empty">병과 데이터를 불러오는 중입니다…</p>';
    if (UI.cls.sel) return clsDetailHTML(UI.cls.sel);
    var rows = keys.map(function (k) {
      var C = SK.CLASSES[k];
      return '<button type="button" class="adm-row" data-cls="' + esc(k) + '">' +
        '<span class="adm-gem">⚔</span>' +
        '<span class="adm-rowmain"><b>' + esc(C.name) + '</b><small>공 ' + num(C.atk, 0) + ' · 방 ' + num(C.def, 0) + ' · 지 ' + num(C.ji, 0) + ' · 이동 ' + num(C.mov, 0) + ' · 사거리 ' + num(C.rng, 0) + '</small></span>' +
        '<span class="adm-arrow">›</span></button>';
    }).join('');
    return '<p class="adm-count">' + keys.length + '개 병과</p><div class="adm-list">' + rows + '</div>';
  }

  function clsDetailHTML(key) {
    var C = SK.CLASSES[key];
    if (!C) return '<p class="adm-empty">병과를 찾을 수 없습니다.</p>';
    var f = function (label, k, v, min, max) {
      return '<label class="adm-num"><span>' + label + '</span><input type="number" inputmode="numeric" data-ck="' + k + '" value="' + num(v, 0) + '" min="' + min + '" max="' + max + '"></label>';
    };
    var sk = '';
    for (var i = 0; i < 4; i++) {
      var live = classSkill(key, i);
      if (!live) { sk += '<p class="adm-dim">책략 ' + (i + 1) + ' — 데이터 없음</p>'; continue; }
      var e = skillEff(live);
      sk += '<div class="adm-skill">' +
        '<b>' + (i + 1) + '. ' + esc(live.name) + ' <em>' + (live.unlockLv ? 'Lv.' + live.unlockLv + ' 해금' : '') + '</em></b>' +
        '<div class="adm-nums three">' +
          '<label class="adm-num"><span>위력/효과 %</span><input type="number" inputmode="numeric" data-sk="' + i + '" data-sf="p" value="' + Math.round(num(e.val, 0) * 1000) / 10 + '" min="-90" max="400"></label>' +
          '<label class="adm-num"><span>쿨타임(턴)</span><input type="number" inputmode="numeric" data-sk="' + i + '" data-sf="cd" value="' + num(live.cd, 0) + '" min="0" max="9"></label>' +
          '<label class="adm-num"><span>MP</span><input type="number" inputmode="numeric" data-sk="' + i + '" data-sf="mp" value="' + num(live.mp, 0) + '" min="0" max="99"></label>' +
        '</div>' +
        '<p class="adm-hint">' + esc(live.desc || '') + '</p>' +
      '</div>';
    }
    return '' +
      '<button type="button" class="adm-back" id="adm-cls-back">‹ 병과 목록</button>' +
      '<div class="adm-dhead"><span class="adm-gem big">⚔</span><div><b>' + esc(C.name) + '</b><small>' + esc(C.role || '') + '</small></div></div>' +
      '<div class="adm-card">' +
        '<p class="adm-sec">기본 능력치</p>' +
        '<div class="adm-nums">' +
          f('공격', 'atk', C.atk, 1, 80) + f('방어', 'def', C.def, 1, 80) +
          f('지력', 'ji', C.ji || 0, -30, 60) + f('이동력', 'mov', C.mov, 1, 9) +
          f('사거리', 'rng', C.rng, 1, 7) + f('기본 MP', 'mp', C.mp, 0, 120) +
        '</div>' +
        '<p class="adm-hint">공격·방어는 병과 기본값입니다. 장수 부대는 여기에 무력·통솔 보정이 더해집니다. 지력은 부대 지력에 더해지는 값(책략 위력)이고 0이면 예전과 같습니다.</p>' +
        '<p class="adm-sec">숨은 스탯 (v5.86)</p>' +
        '<div class="adm-nums">' +
          f('기본 민첩', 'agi', C.agi == null ? 60 : C.agi, 10, 100) +
          f('최소사거리', 'minRng', C.minRng == null ? 1 : C.minRng, 1, 3) +
          f('회피 %', 'evaPct', C.evaPct, 0, 40) + f('치명 %', 'critPct', C.critPct, 0, 60) +
          f('치명피해 %', 'critDmgPct', C.critDmgPct, 0, 100) + f('반격피해 %', 'cntPct', C.cntPct, -50, 100) +
          f('받는피해감소 %', 'dmgRedPct', C.dmgRedPct, 0, 50) + f('책략위력 %', 'tacticPct', C.tacticPct == null ? 100 : C.tacticPct, 50, 200) +
          f('상태저항 %', 'statusResPct', C.statusResPct, 0, 60) +
        '</div>' +
        '<p class="adm-hint">민첩은 이동력과 무관합니다(민첩·회피·명중 전용). 명중 93% + (공격자 민첩−방어자 민첩)×0.25%, 총 회피 상한 40%. 최소사거리는 2칸·3칸 병과의 사각을 정합니다.</p>' +
      '</div>' +
      '<div class="adm-card"><p class="adm-sec">병과 책략 4종</p>' + sk +
        '<p class="adm-hint">쿨타임 0 = 없음(지금까지와 같음). 2로 두면 한 턴 쉬고 다시 씁니다.</p>' +
      '</div>' +
      '<button type="button" class="adm-wide danger" id="adm-cls-reset">이 병과만 기본값으로</button>';
  }

  function bindCls(body) {
    $$('[data-cls]', body).forEach(function (b) {
      b.onclick = function () { UI.cls.sel = b.dataset.cls; render(); };
    });
    var back = $('#adm-cls-back', body);
    if (back) back.onclick = function () { UI.cls.sel = null; render(); };
    var reset = $('#adm-cls-reset', body);
    if (reset) reset.onclick = function () { resetCls(UI.cls.sel); render(); };
    var handler = function (e) {
      var el = e.target;
      if (!el || !el.dataset || !UI.cls.sel) return;
      var k = el.dataset.ck;
      if (k) return onClsField(k, el);
      var si = el.dataset.sk, sf = el.dataset.sf;
      if (si != null && sf) onClsSkill(UI.cls.sel, num(si, 0), sf, el);
    };
    body.oninput = handler;
    body.onchange = handler;
  }

  function onClsField(k, el) {
    var key = UI.cls.sel;
    var C = SK.CLASSES[key];
    if (!C) return;
    ensureOrigCls(key);
    var o = ST.cls[key] = ST.cls[key] || {};
    /* v5.86 — 숨은 스탯까지 같은 범위표로 자른다 */
    var rg = CLS_RANGE[k] || [1, 100];
    o[k] = clamp(Math.round(num(el.value, C[k] == null ? 0 : C[k]) * 10) / 10, rg[0], rg[1]);
    applyClass(key);
    saveStore();
  }

  function onClsSkill(key, i, field, el) {
    var live = classSkill(key, i);
    if (!live) return;
    ensureOrigCls(key);
    var o = ST.cls[key] = ST.cls[key] || {};
    o.skills = o.skills || [];
    o.skills[i] = o.skills[i] || {};
    var v = num(el.value, 0);
    if (field === 'p') o.skills[i].p = clamp(v, -90, 400);
    else if (field === 'cd') o.skills[i].cd = clamp(Math.round(v), 0, 9);
    else if (field === 'mp') o.skills[i].mp = clamp(Math.round(v), 0, 99);
    applyClass(key);
    saveStore();
  }

  function resetCls(key) {
    var C = SK.CLASSES[key];
    var o = ST.origCls[key];
    if (C && o) {
      ['atk', 'def', 'ji', 'mov', 'rng', 'mp'].concat(CLS_HIDDEN).forEach(function (k) { if (o[k] != null) C[k] = o[k]; });
      (o.skills || []).forEach(function (s, i) {
        var live = classSkill(key, i);
        if (!live || !s) return;
        live[s.key] = s.p / 100;
        live.cd = s.cd;
        live.mp = s.mp;
      });
    }
    delete ST.cls[key]; delete ST.origCls[key];
    saveStore();
    toast('병과를 처음 값으로 되돌렸습니다.');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     7) 저장 탭 — diff 복사 · 초기화
     ═══════════════════════════════════════════════════════════════════════ */
  function saveHTML() {
    var nGen = Object.keys(ST.gens).length, nTree = Object.keys(ST.trees).length, nCls = Object.keys(ST.cls).length;
    return '' +
      '<div class="adm-card">' +
        '<p class="adm-sec">이 폰에 저장된 수정</p>' +
        '<div class="adm-stats">' +
          '<div><span>장수</span><b>' + nGen + '명</b></div>' +
          '<div><span>보물</span><b>' + nTree + '종</b></div>' +
          '<div><span>병과</span><b>' + nCls + '개</b></div>' +
        '</div>' +
        '<p class="adm-hint">고친 값은 <b>localStorage</b>에 자동 저장됩니다. 새로고침·재접속해도 이 폰에서는 그대로 유지됩니다.</p>' +
      '</div>' +
      '<button type="button" class="adm-big gold" id="adm-copy">📋 변경사항 복사 (diff JSON)</button>' +
      '<div class="adm-card">' +
        '<p class="adm-sec">영구 반영용</p>' +
        '<p class="adm-hint">복사한 JSON을 채팅에 붙여넣으면, 메인 개발에서 <code>data/generals.json</code>·<code>data/treasures.json</code>·<code>data/classes.json</code>에 그대로 반영합니다.</p>' +
      '</div>' +
      '<button type="button" class="adm-wide danger" id="adm-reset">♻️ 기본값 초기화 (전체)</button>' +
      '<button type="button" class="adm-wide" id="adm-reset-state">장수 소속·병력만 되돌리기</button>' +
      '<p class="adm-hint center">초기화해도 장수 영입·보물 지급으로 바뀐 <b>판 자체</b>는 되돌리지 않습니다. 새 판을 원하면 표지의 <b>새로 시작</b>을 쓰세요.</p>';
  }

  function buildDiff() {
    var out = { v: 1, game: 'v5.86', at: new Date().toISOString(), generals: [], treasures: [], classes: [] };
    Object.keys(ST.gens).forEach(function (id) {
      var g = SK.GEN_BY_ID[id], o = ST.origGen[id], cur = ST.gens[id];
      if (!g || !cur) return;
      var d = { id: num(id, id), name: g.name };
      var changed = false;
      [['war', 'war'], ['intel', 'intel'], ['politics', 'politics'], ['charm', 'charm']].forEach(function (p) {
        if (o && num(o[p[0]], null) !== num(g[p[0]], null)) { d[p[1]] = g[p[0]]; changed = true; }
      });
      if (o && o.tier !== g.tier) { d.tier = g.tier; changed = true; }
      if (o && o.job !== g.job) { d.cls = SK.genClass(g); changed = true; }
      if (cur.passiveId) { d.passive = cur.passiveId; changed = true; }
      if (o && o.lv != null && cur.lv != null && num(o.lv) !== num(cur.lv)) { d.lv = num(cur.lv); changed = true; }
      if (o && o.loyal != null && cur.loyal != null && num(o.loyal) !== num(cur.loyal)) { d.loyal = num(cur.loyal); changed = true; }
      if (o && cur.cityId && o.cityId !== cur.cityId) { d.city = cityName(cur.cityId); changed = true; }
      /* v5.86 — 숨은 스탯·필살기 교체 */
      if (o && o.leadership != null && num(o.leadership) !== num(g.leadership)) { d.leadership = num(g.leadership); changed = true; }
      if (cur.ult) { d.ult = cur.ult; changed = true; }
      GEN_HIDDEN.forEach(function (k) {
        var v = num((SK.HIDDEN_GEN && SK.HIDDEN_GEN[id] ? SK.HIDDEN_GEN[id][k] : 0), 0);
        if (v) { d.hidden = d.hidden || {}; d.hidden[k] = v; changed = true; }
      });
      if (changed) out.generals.push(d);
    });
    Object.keys(ST.trees).forEach(function (id) {
      var t = SK.TREASURE_BY_ID[id], o = ST.origTree[id];
      if (!t || !o) return;
      var d = { id: num(id, id), name: t.name }, changed = false;
      if (o.grade !== t.grade) { d.grade = t.grade; changed = true; }
      if (o.effect !== t.effect) { d.effect = t.effect; changed = true; }
      var sb = {}, sbChanged = false;
      Object.keys(t.statBonus || {}).forEach(function (k) {
        if (num((o.statBonus || {})[k], 0) !== num(t.statBonus[k], 0)) { sb[k] = num(t.statBonus[k], 0); sbChanged = true; }
      });
      if (sbChanged) { d.statBonus = sb; changed = true; }
      if (changed) out.treasures.push(d);
    });
    Object.keys(ST.cls).forEach(function (key) {
      var C = SK.CLASSES[key], o = ST.origCls[key];
      if (!C || !o) return;
      var d = { job: C.name }, changed = false;
      ['atk', 'def', 'ji', 'mov', 'rng', 'mp'].concat(CLS_HIDDEN).forEach(function (k) {
        if (num(o[k], null) !== num(C[k], null)) { d[k] = num(C[k]); changed = true; }
      });
      var skOut = [];
      for (var i = 0; i < 4; i++) {
        var live = classSkill(key, i), os = (o.skills || [])[i];
        if (!live || !os) continue;
        var e = skillEff(live);
        var p = Math.round(num(e.val, 0) * 1000) / 10;
        var one = { name: live.name };
        if (Math.abs(p - num(os.p, 0)) > 0.05) one.power = p;
        if (num(live.cd, 0) !== num(os.cd, 0)) one.cd = num(live.cd, 0);
        if (num(live.mp, 0) !== num(os.mp, 0)) one.mp = num(live.mp, 0);
        if (one.power != null || one.cd != null || one.mp != null) { skOut.push(one); changed = true; }
      }
      if (skOut.length) d.skills = skOut;
      if (changed) out.classes.push(d);
    });
    return out;
  }

  function copyDiff() {
    var diff = buildDiff();
    var txt = JSON.stringify(diff, null, 2);
    var total = diff.generals.length + diff.treasures.length + diff.classes.length;
    if (!total) { toast('바뀐 값이 없습니다.'); return; }
    var done = function () { toast('변경사항 ' + total + '건을 복사했습니다.'); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) done(); else showText(txt);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  function showText(txt) {
    var el = document.createElement('div');
    el.className = 'adm-sheet';
    el.innerHTML = '<div class="adm-sheet-in"><b>변경사항 JSON</b><p class="adm-hint">길게 눌러 전체 선택 → 복사해 주세요.</p>' +
      '<textarea readonly rows="14">' + esc(txt) + '</textarea>' +
      '<button type="button" class="adm-wide">닫기</button></div>';
    el.querySelector('button').onclick = function () { el.remove(); };
    document.body.appendChild(el);
  }

  function askReset() {
    var el = document.createElement('div');
    el.className = 'adm-sheet';
    el.innerHTML = '<div class="adm-sheet-in"><b>정말 기본값으로 돌릴까요?</b>' +
      '<p class="adm-hint">장수·보물·병과에 얹은 수정을 모두 지우고 처음 데이터로 되돌립니다. ' +
      '(영입·보물 지급처럼 판 안에서 이미 일어난 일은 그대로 남습니다)</p>' +
      '<div class="adm-sheet-btns"><button type="button" class="adm-wide" data-no>취소</button>' +
      '<button type="button" class="adm-wide danger" data-yes>♻️ 초기화</button></div></div>';
    el.querySelector('[data-no]').onclick = function () { el.remove(); };
    el.querySelector('[data-yes]').onclick = function () { el.remove(); resetAll(); };
    document.body.appendChild(el);
  }

  function resetAll() {
    Object.keys(ST.origGen).forEach(function (id) { resetGenQuiet(id); });
    Object.keys(ST.origTree).forEach(function (id) { resetTreeQuiet(id); });
    Object.keys(ST.origCls).forEach(function (key) { resetClsQuiet(key); });
    ST = { v: 1, gens: {}, trees: {}, cls: {}, origGen: {}, origTree: {}, origCls: {} };
    SK.HIDDEN_GEN = {};
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    SK.save(); refreshWorld();
    toast('모든 수정을 기본값으로 되돌렸습니다.');
    render();
  }
  function resetGenQuiet(id) {
    id = gid(id);
    var o = ST.origGen[id], g = SK.GEN_BY_ID[id];
    if (!g || !o) return;
    g.war = o.war; g.intel = o.intel; g.politics = o.politics; g.charm = o.charm; g.tier = o.tier; g.job = o.job;
    if (SK.PASSIVES) {
      if (o.passive) SK.PASSIVES[g.name] = JSON.parse(JSON.stringify(o.passive));
      else if (SK.PASSIVES[g.name]) delete SK.PASSIVES[g.name];
    }
    var h = heroOf(id);
    if (h) {
      h.wu = g.war; h.ji = g.intel; h.pol = g.politics; h.cha = g.charm; h.tier = g.tier;
      h.cls = SK.genClass(g); h.unit = SK.genUnit(g); h.portrait = SK.genPortrait(g);
      if (o.lv != null) h.lv = o.lv;
      if (o.loyal != null) h.loyal = o.loyal;
    }
  }
  function resetTreeQuiet(id) {
    var t = SK.TREASURE_BY_ID[id], o = ST.origTree[id];
    if (!t || !o) return;
    t.grade = o.grade; t.effect = o.effect; t.statBonus = JSON.parse(JSON.stringify(o.statBonus || {}));
  }
  function resetClsQuiet(key) {
    var C = SK.CLASSES[key], o = ST.origCls[key];
    if (!C || !o) return;
    ['atk', 'def', 'ji', 'mov', 'rng', 'mp'].concat(CLS_HIDDEN).forEach(function (k) { if (o[k] != null) C[k] = o[k]; });
    (o.skills || []).forEach(function (s, i) {
      var live = classSkill(key, i);
      if (!live || !s) return;
      live[s.key] = s.p / 100; live.cd = s.cd; live.mp = s.mp;
    });
  }
  function resetStateEdits() {
    var s = state();
    if (!s) return;
    (s.heroes || []).forEach(function (h) {
      var g = SK.GEN_BY_ID[h.genId];
      if (!g) return;
      h.wu = g.war; h.ji = g.intel; h.pol = g.politics; h.cha = g.charm; h.tong = g.leadership; h.tier = g.tier;
    });
    Object.keys(s.cities || {}).forEach(function (cid) {
      var cs = s.cities[cid];
      if (cs && cs.owner === s.playerFaction && cs.troops > 99999) cs.troops = 99999;
    });
    SK.save(); refreshWorld();
    toast('장수 능력치를 지금 데이터 값으로 다시 맞췄습니다.');
  }

  /* ── 공용 ─────────────────────────────────────────────────────────────── */
  function toast(msg) {
    if (SK.toast) SK.toast(msg);
    else { var f = document.getElementById('adm-foot'); if (f) f.textContent = msg; }
  }
  function refreshWorld() {
    if (SK.refreshHud) { try { SK.refreshHud(); } catch (e) { /* ignore */ } }
    if (window.SKMap && SKMap.refresh) { try { SKMap.refresh(); } catch (e) { /* ignore */ } }
    if (UI.open) renderObsStatus();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     8) 시작 — 저장된 값을 얹고 버튼을 세운다
     ═══════════════════════════════════════════════════════════════════════ */
  function boot() {
    loadStore();
    build();
    /* 데이터가 늦게 실리는 경우(장수 JSON fetch)를 몇 번 더 시도한다 */
    var tries = 0;
    (function apply() {
      var ok = applyAll();
      if (!ok && tries++ < 40) setTimeout(apply, 500);
    })();
    /* 보물·병과 탭은 데이터 fetch가 따로 필요하다 */
    if (SK.loadTreasures) { try { SK.loadTreasures(); } catch (e) { /* ignore */ } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);

  /* 관리자 화면이 열려 있으면 판이 바뀔 때마다 상태를 다시 그린다 */
  setInterval(function () { if (UI.open && UI.tab === 'obs') renderObsStatus(); }, 1200);
})();
