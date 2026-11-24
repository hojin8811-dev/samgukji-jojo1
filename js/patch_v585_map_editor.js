/* ═══════════════════════════════════════════════════════════════════════════
   v5.85 — 관리자(?admin=1) 전장 타일 맵 에디터 + 천하 전략 지도 편집기
   · 주소에 admin=1 이 없으면 (SK.adminMode === false) 이 파일은 즉시 끝난다.
     DOM·localStorage·게임 데이터 어느 것도 건드리지 않는다 (일반 주소 ?v=105 그대로).
   · 실제 엔진 자료구조에 그대로 물린다 (이름만 비슷한 사본을 만들지 않는다)
        전장 맵  SK.MAPS[key] = ['PPRR…', …]  ·  SK.MAP_META[key] = {cols,rows,allyBase,enemyBase,villages}
        지형     SK.TERRAIN[코드] = {name, def, cost, icon}   (16종: P R F M W S B G C D H T K A E V)
        거점     SK.CITY[id] = {id,name,u,v,type,faction,battleType,baseTroops,defense,roads,sea}  (u·v = 0~1)
        길       SK.ROADS = [[a,b],…] · SK.SEALANES = [[a,b],…]
        지도 그리기 SKMap.refresh()
   · 전장맵: 기존 전장 불러오기 · 16지형 브러시 터치 칠하기 · Undo(20단계) · 확대/축소 · 이동
            · [⚔️ 테스트 전투] → 편집한 맵으로 실제 전장에 들어간다(판은 건드리지 않는 모래판)
            · [📋 JSON 복사] → 엔진에 바로 넣을 수 있는 {cols,rows,rows:[…],meta} 형식
   · 천하맵: 거점 검색·선택·편집(이름/유형/세력/전장/병력/방어도/좌표) · 2000×1333 지도 터치로 위치 이동
            · 새 거점 추가·삭제 · 길 연결/해제 · [📋 거점·길 JSON 복사](원본 대비 diff)
            · [🗺️ 지도에 적용] 이번 판 미리보기(저장 안 됨 · 새로고침하면 원래대로)
   · 저장: localStorage('samgukji-jojo-admin-maps-v1') — 관리자 주소에서만 읽고 쓴다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SK = window.SK;
  /* ── 경계: 관리자 주소가 아니면 여기서 끝. 아래 코드는 한 줄도 실행되지 않는다 ── */
  if (!SK || SK.adminMode !== true) return;

  var VERSION = '5.85';
  var STORE_KEY = 'samgukji-jojo-admin-maps-v1';
  var WORLD_W = 2000, WORLD_H = 1333;   /* 엔진의 SK.MAPGEO.w/h 와 같은 크기 */
  var MAX_UNDO = 20;
  var CUSTOM_KEY = '__map_editor';      /* 테스트 전투용 임시 전장 키 */
  var TMP_CITY = '__map_editor_test';   /* 테스트 전투용 임시 거점 id */

  /* 지형 16종 — 이름은 SK.TERRAIN 에서 읽고, 색만 여기서 정한다 */
  var COLORS = {
    P: '#7cb342', R: '#d7b87a', F: '#2e7d32', M: '#6d5d53', W: '#1e88e5', S: '#4fc3f7',
    B: '#a1887f', G: '#b0bec5', C: '#546e7a', D: '#c5b38a', H: '#8d6e63', T: '#78909c',
    K: '#ffb300', A: '#29b6f6', E: '#ef5350', V: '#9ccc65',
  };
  var CODES = ['P', 'R', 'F', 'M', 'W', 'S', 'B', 'G', 'C', 'D', 'H', 'T', 'K', 'A', 'E', 'V'];
  /* 지나갈 수 있는 땅 (cost 99 = 벽·물) */
  var PASSABLE_FALLBACK = { P: 1, R: 1, F: 1, M: 1, S: 1, B: 1, D: 1, G: 1, T: 1, K: 1, A: 1, E: 1, V: 1 };

  function terrainName(code) {
    var t = SK.TERRAIN && SK.TERRAIN[code];
    return (t && t.name) || code;
  }
  function isPassable(code) {
    var t = SK.TERRAIN && SK.TERRAIN[code];
    if (t && typeof t.cost === 'number') return t.cost < 99;
    return !!PASSABLE_FALLBACK[code];
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; } }

  /* ── 클립보드 ─────────────────────────────────────────────────────────── */
  function copyText(text, done) {
    var finish = function (ok) { if (done) done(!!ok); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { finish(true); }, function () { legacyCopy(text, finish); });
        return;
      }
    } catch (e) { /* 아래 예비 경로 */ }
    legacyCopy(text, finish);
  }
  function legacyCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      done(!!ok);
    } catch (e) { done(false); }
  }

  /* ── 저장소 (관리자 주소에서만) ────────────────────────────────────────── */
  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
  }
  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: VERSION,
        savedAt: Date.now(),
        battle: { name: st.name, cols: st.cols, rows: st.rows, bgKey: st.bgKey, srcKey: st.srcKey, rows: st.tiles.map(function (r) { return r.join(''); }) },
        world: { cities: wst.cities, routes: wst.routes, sea: wst.sea, deleted: wst.deleted, sel: wst.sel },
      }));
      storeSaved = true;
    } catch (e) { /* 저장소가 막힌 브라우저는 이번 판만 쓴다 */ }
  }
  var storeSaved = false;

  /* ═══════════════════════════════════════════════════════════════════════
     1) 전장 맵 — 엔진(SK.MAPS) 읽고 쓰기
     ═══════════════════════════════════════════════════════════════════════ */
  function rowsFromTiles(tiles) {
    return tiles.map(function (r) { return r.join(''); });
  }
  function tilesFromRows(rows, cols, nrows) {
    var out = [], y, x, row;
    for (y = 0; y < nrows; y++) {
      row = String((rows && rows[y]) || '');
      var line = [];
      for (x = 0; x < cols; x++) {
        var ch = row.charAt(x).toUpperCase();
        line.push(COLORS[ch] ? ch : 'P');
      }
      out.push(line);
    }
    return out;
  }
  /* 엔진의 전장 목록 — BATTLE_TYPES 의 이름을 붙여 사람이 알아보게 */
  function engineBattleList() {
    var list = [], seen = {}, byMap = {};
    Object.keys(SK.BATTLE_TYPES || {}).forEach(function (k) {
      var bt = SK.BATTLE_TYPES[k];
      if (bt && bt.map && !byMap[bt.map]) byMap[bt.map] = bt;
    });
    Object.keys(SK.MAPS || {}).forEach(function (key) {
      var rows = SK.MAPS[key];
      if (!Array.isArray(rows) || !rows.length || typeof rows[0] !== 'string') return;
      if (seen[key]) return;
      if (key === 'ambush') return;            /* forest 의 옛 이름(같은 배열) */
      seen[key] = 1;
      var meta = (SK.MAP_META && SK.MAP_META[key]) || null;
      var bt = byMap[key];
      list.push({
        key: key,
        label: (bt && bt.name) ? bt.name : key,
        cols: rows[0].length,
        rows: rows.length,
        rowStrings: rows.slice(),
        meta: meta,
      });
    });
    return list;
  }
  function loadEngineMap(key) {
    var all = engineBattleList(), found = null, i;
    for (i = 0; i < all.length; i++) if (all[i].key === key) { found = all[i]; break; }
    if (!found) return false;
    st.srcKey = found.key;
    st.name = found.label || found.key;
    st.cols = found.cols;
    st.rows = found.rows;
    st.tiles = tilesFromRows(found.rowStrings, found.cols, found.rows);
    st.bgKey = guessBgKey(found.key);
    undo = [];
    syncBattleFields();
    renderBattle();
    return true;
  }
  function guessBgKey(key) {
    if (key === 'siege' || key === 'siege2' || key === 'siege3') return key;
    return key || 'plain';
  }

  function newBattleMap(cols, rows, keep) {
    pushUndo();
    var next = [], y, x;
    for (y = 0; y < rows; y++) {
      var line = [];
      for (x = 0; x < cols; x++) {
        var ch = keep && st.tiles[y] && st.tiles[y][x] ? st.tiles[y][x] : 'P';
        line.push(ch);
      }
      next.push(line);
    }
    st.cols = cols; st.rows = rows; st.tiles = next; st.srcKey = '';
    battleZoom = 1; battlePanX = 0; battlePanY = 0;
    syncBattleFields();
    renderBattle();
    saveStore();
  }

  /* 편집한 타일에서 본진·마을 자리를 뽑아 MAP_META 모양으로 만든다.
     place 가 true 면(테스트 전투용 사본) A·E 가 없을 때 그 사본에 본진 타일을 찍는다. */
  function metaFromTiles(tiles, cols, rows, place) {
    var grid = tiles || st.tiles, C = cols || st.cols, R = rows || st.rows;
    var ally = null, enemy = null, villages = [], y, x;
    for (y = 0; y < R; y++) {
      for (x = 0; x < C; x++) {
        var ch = grid[y][x];
        if (ch === 'A' && !ally) ally = { x: x, y: y };
        else if (ch === 'E' && !enemy) enemy = { x: x, y: y };
        else if (ch === 'V') villages.push({ x: x, y: y, type: 'village' });
      }
    }
    /* A·E 를 안 찍었으면 아래·위 가운데의 지나갈 수 있는 땅에 세운다 */
    if (!ally) {
      ally = findOpenTile(grid, C, R, Math.floor(C / 2), R - 2);
      if (place && grid[ally.y]) grid[ally.y][ally.x] = 'A';
    }
    if (!enemy) {
      enemy = findOpenTile(grid, C, R, Math.floor(C / 2), 1);
      if (place && grid[enemy.y]) grid[enemy.y][enemy.x] = 'E';
    }
    return {
      cols: C, rows: R,
      allyBase: ally ? { x: ally.x, y: ally.y } : null,
      enemyBase: enemy ? { x: enemy.x, y: enemy.y } : null,
      villages: villages,
    };
  }
  /* (sx,sy)에서 가까운 지나갈 수 있는 칸 (체비쇼프 거리 순) */
  function findOpenTile(grid, C, R, sx, sy) {
    var r, y, x;
    for (r = 0; r < Math.max(C, R); r++) {
      for (y = Math.max(0, sy - r); y <= Math.min(R - 1, sy + r); y++) {
        for (x = Math.max(0, sx - r); x <= Math.min(C - 1, sx + r); x++) {
          if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r) continue;
          if (!isPassable(grid[y][x])) continue;
          return { x: x, y: y };
        }
      }
    }
    return { x: clamp(sx, 0, C - 1), y: clamp(sy, 0, R - 1) };
  }
  function battlePayload() {
    return {
      key: CUSTOM_KEY.replace(/^__/, ''),
      name: st.name || '편집_전장',
      cols: st.cols,
      rows: st.rows,
      bgKey: st.bgKey || 'plain',
      rows: rowsFromTiles(st.tiles),
      meta: metaFromTiles(st.tiles, st.cols, st.rows, false),
    };
  }
  function battleJsonText() {
    return JSON.stringify(battlePayload(), null, 2);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     2) 천하 지도 — 엔진(SK.CITY / SK.ROADS / SK.SEALANES) 읽고 쓰기
     ═══════════════════════════════════════════════════════════════════════ */
  /* 엔진 원본 거점을 편집기 좌표(2000×1333 픽셀)로 옮긴다 */
  function readEngineWorld() {
    var cities = [], byId = {}, routes = [], sea = [];
    (SK.CITY_LIST || []).forEach(function (c) {
      var item = {
        id: c.id,
        name: c.name,
        type: c.type || 'town',
        faction: c.faction || 'neutral',
        battleType: c.battleType || 'field',
        troops: Math.round(c.baseTroops || 5000),
        defense: Math.round(c.defense || 70),
        x: Math.round((c.u || 0.5) * WORLD_W),
        y: Math.round((c.v || 0.5) * WORLD_H),
      };
      cities.push(item);
      byId[item.id] = item;
    });
    (SK.ROADS || []).forEach(function (r) { if (r && r[0] && r[1]) routes.push([String(r[0]), String(r[1])]); });
    (SK.SEALANES || []).forEach(function (r) { if (r && r[0] && r[1]) sea.push([String(r[0]), String(r[1])]); });
    return { cities: cities, byId: byId, routes: routes, sea: sea };
  }
  function routeKey(a, b) { var p = [String(a), String(b)].sort(); return p[0] + '|' + p[1]; }
  function hasRoute(list, a, b) {
    var k = routeKey(a, b), i;
    for (i = 0; i < list.length; i++) if (routeKey(list[i][0], list[i][1]) === k) return true;
    return false;
  }
  function toggleRoute(list, a, b) {
    var k = routeKey(a, b), i;
    for (i = 0; i < list.length; i++) if (routeKey(list[i][0], list[i][1]) === k) { list.splice(i, 1); return false; }
    list.push([String(a), String(b)]);
    return true;
  }
  function worldCityById(id) {
    for (var i = 0; i < wst.cities.length; i++) if (wst.cities[i].id === id) return wst.cities[i];
    return null;
  }
  function selectedCity() { return worldCityById(wst.sel) || wst.cities[0] || null; }

  function worldDiff() {
    var add = {}, upd = {}, base = wbase.byId, i, c, b, changes, k;
    var keys = ['name', 'type', 'faction', 'battleType', 'troops', 'defense'];
    for (i = 0; i < wst.cities.length; i++) {
      c = wst.cities[i];
      b = base[c.id];
      var u = Math.round(c.x / WORLD_W * 10000) / 10000;
      var v = Math.round(c.y / WORLD_H * 10000) / 10000;
      if (!b) {
        add[c.id] = { name: c.name, type: c.type, faction: c.faction, battleType: c.battleType, troops: c.troops, defense: c.defense, u: u, v: v };
        continue;
      }
      changes = {};
      for (k = 0; k < keys.length; k++) if (b[keys[k]] !== c[keys[k]]) changes[keys[k]] = c[keys[k]];
      if (b.x !== c.x || b.y !== c.y) { changes.u = u; changes.v = v; }
      if (Object.keys(changes).length) upd[c.id] = changes;
    }
    var deleted = [], id;
    for (id in base) if (Object.prototype.hasOwnProperty.call(base, id) && !worldCityById(id)) deleted.push(id);
    var roadsAdd = [], roadsRemove = [], j;
    for (j = 0; j < wst.routes.length; j++) if (!hasRoute(wbase.routes, wst.routes[j][0], wst.routes[j][1])) roadsAdd.push([wst.routes[j][0], wst.routes[j][1]]);
    for (j = 0; j < wbase.routes.length; j++) if (!hasRoute(wst.routes, wbase.routes[j][0], wbase.routes[j][1])) roadsRemove.push([wbase.routes[j][0], wbase.routes[j][1]]);
    var seaAdd = [], seaRemove = [];
    for (j = 0; j < wst.sea.length; j++) if (!hasRoute(wbase.sea, wst.sea[j][0], wst.sea[j][1])) seaAdd.push([wst.sea[j][0], wst.sea[j][1]]);
    for (j = 0; j < wbase.sea.length; j++) if (!hasRoute(wst.sea, wbase.sea[j][0], wbase.sea[j][1])) seaRemove.push([wbase.sea[j][0], wbase.sea[j][1]]);
    return {
      worldBounds: { w: WORLD_W, h: WORLD_H },
      cities: { add: add, update: upd, remove: deleted },
      roads: { add: roadsAdd, remove: roadsRemove, total: wst.routes.length },
      seaLanes: { add: seaAdd, remove: seaRemove, total: wst.sea.length },
    };
  }
  function worldJsonText() { return JSON.stringify(worldDiff(), null, 2); }

  /* 이번 판 미리보기 — 저장하지 않는다. 새로고침하면 엔진 원본(SK.CITY_GEO·ROAD_EDGES)으로 돌아간다. */
  function applyWorldPreview() {
    var byId = {}, i, c, e;
    for (i = 0; i < wst.cities.length; i++) byId[wst.cities[i].id] = wst.cities[i];
    for (i = 0; i < (SK.CITY_LIST || []).length; i++) {
      c = SK.CITY_LIST[i];
      e = byId[c.id];
      if (!e) continue;
      c.u = clamp(e.x / WORLD_W, 0, 1);
      c.v = clamp(e.y / WORLD_H, 0, 1);
      c.type = e.type || c.type;
      c.battleType = e.battleType || c.battleType;
    }
    SK.CITY_LIST.forEach(function (x) { x.roads = []; x.sea = []; });
    SK.ROADS.length = 0;
    SK.SEALANES.length = 0;
    wst.routes.forEach(function (r) {
      var a = SK.CITY[r[0]], b = SK.CITY[r[1]];
      if (!a || !b || a === b) return;
      if (a.roads.indexOf(b.id) < 0) a.roads.push(b.id);
      if (b.roads.indexOf(a.id) < 0) b.roads.push(a.id);
      SK.ROADS.push([a.id, b.id]);
    });
    wst.sea.forEach(function (r) {
      var a = SK.CITY[r[0]], b = SK.CITY[r[1]];
      if (!a || !b || a === b) return;
      if (a.sea.indexOf(b.id) < 0) a.sea.push(b.id);
      if (b.sea.indexOf(a.id) < 0) b.sea.push(a.id);
      SK.SEALANES.push([a.id, b.id]);
    });
    try { if (window.SKMap && SKMap.refresh) SKMap.refresh(); } catch (e2) { /* 지도 화면이 아직 없으면 다음에 그려진다 */ }
    var extra = wst.cities.filter(function (x) { return !wbase.byId[x.id]; }).length;
    setStatus('지도에 적용했습니다 — 이번 판만(새로고침하면 원래대로).'
      + (extra ? ' 새 거점 ' + extra + '곳은 저장 구조가 없어 좌표만 보입니다.' : ''));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     3) 편집기 상태
     ═══════════════════════════════════════════════════════════════════════ */
  var st = { name: '편집_전장', cols: 24, rows: 24, tiles: [], bgKey: 'plain', srcKey: '' };
  var wst = { cities: [], routes: [], sea: [], deleted: [], sel: '' };
  var wbase = { byId: {}, cities: [], routes: [], sea: [] };
  var brush = 'P';
  var undo = [];
  var battleZoom = 1, battlePanX = 0, battlePanY = 0;
  var worldZoom = 1, worldPanX = 0, worldPanY = 0;
  var panMode = false, pickMode = false;
  var statusText = '준비 완료';

  var ui = {};
  var open = false;
  var pendingBattle = false;   /* 테스트 전투 모래판이 돌고 있는지 */
  var worldInit = false;

  function setStatus(msg) {
    statusText = msg;
    if (ui.status) ui.status.textContent = msg;
  }

  /* ── 초기값: 저장된 편집본 → 없으면 엔진의 평야전 ───────────────────── */
  function initState() {
    var saved = loadStore();
    if (saved && saved.battle && Array.isArray(saved.battle.rows) && saved.battle.rows.length) {
      var b = saved.battle;
      st.name = b.name || '편집_전장';
      st.cols = Number(b.cols) || b.rows[0].length;
      st.rows = Number(b.rows) || b.rows.length;
      st.bgKey = b.bgKey || 'plain';
      st.srcKey = b.srcKey || '';
      st.tiles = tilesFromRows(b.rows, st.cols, st.rows);
    } else {
      loadEngineMap('plain');
    }
    ensureWorld();
  }
  /* 천하 거점은 app.js 가 data/cities.json 을 읽은 뒤에 채워진다.
     그래서 처음 [🌏 천하맵] 을 열 때(또는 늦게 도착하면) 그때 읽는다. */
  function ensureWorld() {
    if (worldInit) return true;
    var base = readEngineWorld();
    if (!base.cities.length) return false;
    wbase = base;
    var saved = loadStore();
    if (saved && saved.world && Array.isArray(saved.world.cities) && saved.world.cities.length) {
      wst.cities = clone(saved.world.cities);
      wst.routes = clone(saved.world.routes || []);
      wst.sea = clone(saved.world.sea || []);
      wst.deleted = clone(saved.world.deleted || []);
      wst.sel = saved.world.sel || (wst.cities[0] && wst.cities[0].id) || '';
    } else {
      resetWorldModel();
    }
    worldInit = true;
    return true;
  }
  function resetWorldModel() {
    wst.cities = clone(wbase.cities);
    wst.routes = clone(wbase.routes);
    wst.sea = clone(wbase.sea);
    wst.deleted = [];
    wst.sel = wst.cities[0] ? wst.cities[0].id : '';
    worldZoom = 1; worldPanX = 0; worldPanY = 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4) DOM — 스타일 · 런처 · 오버레이
     ═══════════════════════════════════════════════════════════════════════ */
  function injectStyle() {
    if (document.getElementById('v585-style')) return;
    var s = document.createElement('style');
    s.id = 'v585-style';
    s.textContent = [
      '#v585-back{z-index:1300;position:fixed;inset:0;display:none;align-items:stretch;justify-content:center;',
      '  background:rgba(8,6,3,.62);font-family:var(--sans,-apple-system,"Malgun Gothic",sans-serif);color:#f0e3c4;animation:v585in .16s ease-out}',
      '#v585-back.open{display:flex}',
      '@keyframes v585in{from{opacity:0}to{opacity:1}}',
      '#v585-box{width:100%;max-width:520px;height:100%;display:flex;flex-direction:column;',
      '  background:radial-gradient(circle at 20% 0%,rgba(227,189,99,.10),transparent 55%),linear-gradient(180deg,#241d10 0%,#1a150b 55%,#120e07 100%);',
      '  border-left:1px solid #6b5a2c;border-right:1px solid #6b5a2c;box-shadow:0 0 32px rgba(0,0,0,.6)}',
      '#v585-head{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:calc(env(safe-area-inset-top,0px) + 8px) 9px 8px;',
      '  border-bottom:1px solid #5a4a22;background:linear-gradient(180deg,#322816,#241d10)}',
      '#v585-tabs{display:flex;gap:4px;flex:1 1 auto;min-width:0}',
      '.v585-tab{flex:1 1 0;min-height:40px;padding:0 4px;border-radius:8px;border:1px solid #4a3c1c;background:#221b10;',
      '  font-size:11.5px;font-weight:900;letter-spacing:-.03em;color:#c8b184;white-space:nowrap}',
      '.v585-tab.on{color:#2c2310;border-color:#e3bd63;background:linear-gradient(180deg,#f0d79b,#d7ae58)}',
      '.v585-x{width:38px;height:38px;flex:0 0 auto;border-radius:9px;border:1px solid #6b5a2c;background:#241d10;color:#e8d9b4;font-size:15px;font-weight:900}',
      '#v585-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:9px 9px 12px;display:flex;flex-direction:column;gap:8px}',
      '.v585-sec{display:none;flex-direction:column;gap:8px}',
      '.v585-sec.on{display:flex}',
      '.v585-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
      '.v585-btn{min-height:40px;padding:0 10px;border-radius:8px;border:1px solid #6b5a2c;background:linear-gradient(180deg,#3a2f18,#241d10);',
      '  color:#f1e3b8;font-size:12px;font-weight:800;letter-spacing:-.02em;white-space:nowrap;touch-action:manipulation}',
      '.v585-btn:active{transform:translateY(1px)}',
      '.v585-btn.on{color:#2c2310;border-color:#e3bd63;background:linear-gradient(180deg,#f0d79b,#d7ae58)}',
      '.v585-btn.gold{border-color:#e3bd63;color:#2c2310;background:linear-gradient(180deg,#f0d79b,#d7ae58)}',
      '.v585-btn.danger{border-color:#8a3f32;color:#ffd7c8;background:linear-gradient(180deg,#6d2b21,#3d1610)}',
      '.v585-in,.v585-sel{min-height:40px;padding:0 8px;border-radius:8px;border:1px solid #6b5a2c;background:#100d09;color:#fff3d1;font-size:12.5px;box-sizing:border-box;flex:1 1 90px;min-width:0}',
      '.v585-pal{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}',
      '.v585-brush{min-height:44px;border-radius:8px;border:1.5px solid #4a3b25;background:#211b14;color:#f0e3c4;font-size:10.5px;font-weight:800;',
      '  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:2px;touch-action:manipulation}',
      '.v585-brush.sel{border-color:#ffd54f;background:#34291b;box-shadow:0 0 0 2px rgba(255,213,79,.3)}',
      '.v585-sw{width:20px;height:10px;border-radius:3px;border:1px solid rgba(255,255,255,.45)}',
      '.v585-cv{position:relative;width:100%;height:250px;border:1.5px solid #6b5a2c;border-radius:10px;overflow:hidden;background:#0d0b09;touch-action:none}',
      '.v585-cv canvas{width:100%;height:100%;display:block}',
      '.v585-cv.tall{height:270px}',
      '.v585-status{position:sticky;bottom:0;font-size:11.5px;line-height:1.4;color:#f7dc88;background:#221a12;border:1px solid #594418;border-radius:8px;padding:6px 9px;word-break:break-all}',
      '.v585-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '.v585-f{display:flex;flex-direction:column;gap:3px;font-size:10.5px;font-weight:800;color:#c9ad6a}',
      '.v585-f .v585-in,.v585-f .v585-sel{width:100%;flex:0 0 auto}',
      '.v585-hint{margin:0;font-size:10.5px;line-height:1.45;color:#a9925f}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildUI() {
    if (ui.root) return;
    injectStyle();
    var root = el('div'); root.id = 'v585-back'; ui.root = root;
    var box = el('div'); box.id = 'v585-box';
    var head = el('div'); head.id = 'v585-head';
    var tabs = el('div'); tabs.id = 'v585-tabs';
    var tBattle = el('button', 'v585-tab on', '🗺️ 전장맵'); tBattle.type = 'button';
    var tWorld = el('button', 'v585-tab', '🌏 천하맵'); tWorld.type = 'button';
    var close = el('button', 'v585-x', '✕'); close.type = 'button'; close.setAttribute('aria-label', '닫기');
    tabs.appendChild(tBattle); tabs.appendChild(tWorld);
    head.appendChild(tabs); head.appendChild(close);
    var body = el('div'); body.id = 'v585-body';
    box.appendChild(head); box.appendChild(body);
    root.appendChild(box);
    document.body.appendChild(root);
    ui.body = body;
    ui.tabBattle = tBattle; ui.tabWorld = tWorld;
    tBattle.onclick = function () { switchTab('battle'); };
    tWorld.onclick = function () { switchTab('world'); };
    close.onclick = function () { closeEditor(); };

    buildBattleSection();
    buildWorldSection();
    var status = el('div', 'v585-status', statusText);
    ui.status = status;
    body.appendChild(status);
  }

  function switchTab(which) {
    ui.tabBattle.classList.toggle('on', which === 'battle');
    ui.tabWorld.classList.toggle('on', which !== 'battle');
    ui.secBattle.classList.toggle('on', which === 'battle');
    ui.secWorld.classList.toggle('on', which !== 'battle');
    if (which === 'battle') { renderBattle(); }
    else {
      if (!ensureWorld()) {
        setStatus('천하 거점 자료를 불러오는 중입니다 — 잠시 뒤 다시 [🌏 천하맵]을 눌러 주세요.');
        setTimeout(function () { if (open && ui.secWorld.classList.contains('on')) switchTab('world'); }, 700);
        return;
      }
      syncCityList(); syncCityForm(); syncRouteOptions(); renderWorld();
    }
  }

  function openEditor(which) {
    if (SK.adminMode !== true) return;
    buildUI();
    open = true;
    ui.root.classList.add('open');
    switchTab(which || 'battle');
  }
  function closeEditor() {
    if (ui.root) ui.root.classList.remove('open');
    open = false;
  }

  /* ── 전장맵 구역 ─────────────────────────────────────────────────────── */
  function buildBattleSection() {
    var sec = el('div', 'v585-sec on'); ui.secBattle = sec;

    var row1 = el('div', 'v585-row');
    var nameIn = el('input', 'v585-in'); nameIn.type = 'text'; nameIn.placeholder = '전장 이름';
    var sizeSel = el('select', 'v585-sel');
    ['16', '20', '24', '28', '32'].forEach(function (n) {
      var o = el('option', null, n + '×' + n); o.value = n; sizeSel.appendChild(o);
    });
    var newBtn = el('button', 'v585-btn', '새 맵'); newBtn.type = 'button';
    row1.appendChild(nameIn); row1.appendChild(sizeSel); row1.appendChild(newBtn);
    ui.battleName = nameIn; ui.battleSize = sizeSel;

    var row2 = el('div', 'v585-row');
    var mapSel = el('select', 'v585-sel'); ui.battleMapSel = mapSel;
    var loadBtn = el('button', 'v585-btn', '불러오기'); loadBtn.type = 'button';
    row2.appendChild(mapSel); row2.appendChild(loadBtn);

    var pal = el('div', 'v585-pal'); ui.palette = {};
    CODES.forEach(function (code) {
      var b = el('button', 'v585-brush' + (code === brush ? ' sel' : '')); b.type = 'button';
      var sw = el('span', 'v585-sw'); sw.style.background = COLORS[code];
      b.appendChild(sw); b.appendChild(el('span', null, code + ' ' + terrainName(code)));
      b.onclick = function () {
        brush = code;
        Object.keys(ui.palette).forEach(function (k) { ui.palette[k].classList.toggle('sel', k === brush); });
        setStatus('브러시 ' + code + ' (' + terrainName(code) + ')' + (isPassable(code) ? '' : ' — 지나갈 수 없는 지형'));
      };
      ui.palette[code] = b;
      pal.appendChild(b);
    });

    var tools = el('div', 'v585-row');
    var panBtn = el('button', 'v585-btn', '✋ 이동/확대'); panBtn.type = 'button';
    var zin = el('button', 'v585-btn', '＋'); zin.type = 'button'; zin.setAttribute('aria-label', '확대');
    var zout = el('button', 'v585-btn', '－'); zout.type = 'button'; zout.setAttribute('aria-label', '축소');
    var undoBtn = el('button', 'v585-btn', '↩ 되돌리기'); undoBtn.type = 'button';
    tools.appendChild(panBtn); tools.appendChild(zin); tools.appendChild(zout); tools.appendChild(undoBtn);
    ui.panBtn = panBtn;

    var wrap = el('div', 'v585-cv tall');
    var canvas = document.createElement('canvas'); ui.battleCanvas = canvas;
    wrap.appendChild(canvas);

    var acts = el('div', 'v585-row');
    var testBtn = el('button', 'v585-btn gold', '⚔️ 테스트 전투'); testBtn.type = 'button';
    var copyBtn = el('button', 'v585-btn', '📋 JSON 복사'); copyBtn.type = 'button';
    var resetBtn = el('button', 'v585-btn danger', '♻️ 초기화'); resetBtn.type = 'button';
    acts.appendChild(testBtn); acts.appendChild(copyBtn); acts.appendChild(resetBtn);

    var hint = el('p', 'v585-hint', '브러시를 고르고 격자를 문질러 칠합니다. [이동/확대]를 켜면 끌어서 화면을 옮깁니다. A(아군 본진)·E(적 본진)·V(마을)를 찍으면 그 자리에 본진이 서고, 없으면 아래·위 가운데에 자동으로 놓입니다.');

    sec.appendChild(row1); sec.appendChild(row2); sec.appendChild(pal); sec.appendChild(tools);
    sec.appendChild(wrap); sec.appendChild(acts); sec.appendChild(hint);
    ui.body.appendChild(sec);

    nameIn.onchange = function () { st.name = nameIn.value.trim() || '편집_전장'; saveStore(); };
    sizeSel.onchange = function () {
      var n = Number(sizeSel.value) || 24;
      newBattleMap(n, n, true);
      setStatus('전장 크기 ' + n + '×' + n + (n < st.rows ? ' — 줄어든 가장자리 칸은 잘렸습니다.' : ''));
    };
    newBtn.onclick = function () {
      var n = Number(sizeSel.value) || 24;
      newBattleMap(n, n, false);
      setStatus('새 전장(' + n + '×' + n + ', 전부 평지)을 폈습니다.');
    };
    loadBtn.onclick = function () {
      var key = mapSel.value;
      if (!key) return;
      if (loadEngineMap(key)) setStatus('기존 전장 "' + st.name + '"(' + st.cols + '×' + st.rows + ')을 불러왔습니다.');
      saveStore();
    };
    panBtn.onclick = function () {
      panMode = !panMode;
      panBtn.classList.toggle('on', panMode);
      setStatus(panMode ? '이동/확대 모드 — 끌어서 옮기고 ＋/－로 확대합니다.' : '브러시 모드 — 문질러 칠합니다.');
    };
    zin.onclick = function () { battleZoom = Math.min(4, Math.round(battleZoom * 1.25 * 100) / 100); renderBattle(); };
    zout.onclick = function () { battleZoom = Math.max(0.6, Math.round(battleZoom / 1.25 * 100) / 100); renderBattle(); };
    undoBtn.onclick = function () {
      if (!undo.length) { setStatus('되돌릴 이력이 없습니다 (최대 ' + MAX_UNDO + '단계).'); return; }
      var prev = undo.pop();
      st.cols = prev.cols; st.rows = prev.rows; st.tiles = clone(prev.tiles);
      syncBattleFields(); renderBattle(); saveStore();
      setStatus('되돌리기 — 남은 이력 ' + undo.length + '단계');
    };
    testBtn.onclick = runTestBattle;
    copyBtn.onclick = function () {
      copyText(battleJsonText(), function (ok) {
        setStatus(ok ? '전장 맵 JSON을 복사했습니다 — {cols, rows, rows:[…], meta} 엔진 형식.'
          : '클립보드 복사에 실패했습니다. [📋 JSON 복사]를 길게 눌러 다시 시도해 주세요.');
      });
    };
    resetBtn.onclick = function () {
      loadEngineMap('plain');
      saveStore();
      setStatus('평야전(plain) 원본으로 되돌렸습니다.');
    };

    bindBattlePointer(canvas, wrap);
    /* 지금 상태(저장된 편집본 또는 평야전)를 화면에 채운다 */
    nameIn.value = st.name;
    if (['16', '20', '24', '28', '32'].indexOf(String(st.cols)) < 0) {
      var extra = el('option', null, st.cols + '×' + st.rows); extra.value = String(st.cols); sizeSel.appendChild(extra);
    }
    sizeSel.value = String(st.cols);
    fillBattleMapOptions();
  }

  function bindBattlePointer(canvas, wrap) {
    var down = false, lastIdx = -1, lastPan = null;
    function cellAt(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      var px = (clientX - r.left) * (canvas.width / r.width);
      var py = (clientY - r.top) * (canvas.height / r.height);
      var base = Math.min(canvas.width / st.cols, canvas.height / st.rows);
      var ts = base * battleZoom;
      var ox = (canvas.width - ts * st.cols) * 0.5 + battlePanX;
      var oy = (canvas.height - ts * st.rows) * 0.5 + battlePanY;
      var cx = Math.floor((px - ox) / ts), cy = Math.floor((py - oy) / ts);
      if (cx < 0 || cy < 0 || cx >= st.cols || cy >= st.rows) return null;
      return { x: cx, y: cy };
    }
    function paintAt(clientX, clientY, first) {
      var c = cellAt(clientX, clientY);
      if (!c) return;
      if (first) { pushUndo(); lastIdx = -1; }
      var idx = c.y * st.cols + c.x;
      if (idx === lastIdx) return;
      lastIdx = idx;
      if (st.tiles[c.y][c.x] === brush) return;
      st.tiles[c.y][c.x] = brush;
      renderBattle();
    }
    canvas.addEventListener('pointerdown', function (e) {
      down = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 구형 브라우저 */ }
      if (panMode) { lastPan = { x: e.clientX, y: e.clientY }; }
      else { paintAt(e.clientX, e.clientY, true); }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!down) return;
      if (panMode && lastPan) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        battlePanX += (e.clientX - lastPan.x) * dpr;
        battlePanY += (e.clientY - lastPan.y) * dpr;
        lastPan = { x: e.clientX, y: e.clientY };
        renderBattle();
      } else if (!panMode) {
        paintAt(e.clientX, e.clientY, false);
      }
      e.preventDefault();
    });
    function end() {
      if (down && !panMode) saveStore();   /* 한 붓을 마치면 이 폰에 저장 */
      down = false; lastPan = null; lastIdx = -1;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', function () { lastIdx = -1; });
  }

  function pushUndo() {
    undo.push({ cols: st.cols, rows: st.rows, tiles: clone(st.tiles) });
    if (undo.length > MAX_UNDO) undo.shift();
  }

  function syncBattleFields() {
    if (ui.battleName) ui.battleName.value = st.name;
    if (ui.battleSize) ui.battleSize.value = String(st.cols);
    if (ui.battleMapSel && !ui.battleMapSel.options.length) fillBattleMapOptions();
  }
  function fillBattleMapOptions() {
    var sel = ui.battleMapSel;
    if (!sel) return;
    sel.innerHTML = '';
    var all = engineBattleList();
    all.forEach(function (m) {
      var o = el('option', null, m.label + ' (' + m.cols + '×' + m.rows + ')');
      o.value = m.key;
      sel.appendChild(o);
    });
    if (!all.length) { var e = el('option', null, '엔진 전장 없음'); e.value = ''; sel.appendChild(e); }
    if (st.srcKey) sel.value = st.srcKey;
  }

  function renderBattle() {
    var canvas = ui.battleCanvas;
    if (!canvas || !canvas.parentElement) return;
    var wrap = canvas.parentElement;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.floor((wrap.clientWidth || 340) * dpr));
    var h = Math.max(1, Math.floor((wrap.clientHeight || 250) * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d0b09';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var base = Math.min(canvas.width / st.cols, canvas.height / st.rows);
    var ts = base * battleZoom;
    var ox = (canvas.width - ts * st.cols) * 0.5 + battlePanX;
    var oy = (canvas.height - ts * st.rows) * 0.5 + battlePanY;
    var y, x, code;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (y = 0; y < st.rows; y++) {
      for (x = 0; x < st.cols; x++) {
        code = st.tiles[y][x] || 'P';
        var px = ox + x * ts, py = oy + y * ts;
        ctx.fillStyle = COLORS[code] || COLORS.P;
        ctx.fillRect(px, py, ts + 0.6, ts + 0.6);
        ctx.strokeStyle = 'rgba(0,0,0,.30)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + .5, py + .5, ts - 1, ts - 1);
        if (code === 'A' || code === 'E') {
          ctx.strokeStyle = code === 'A' ? '#e1f5fe' : '#ffcdd2';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, ts - 4, ts - 4);
        }
        if (ts >= 15) {
          ctx.fillStyle = code === 'A' || code === 'E' || code === 'K' || code === 'V' ? '#1b1206' : 'rgba(255,255,255,.92)';
          ctx.font = 'bold ' + Math.max(8, Math.floor(ts * 0.44)) + 'px sans-serif';
          ctx.fillText(code, px + ts * 0.5, py + ts * 0.5);
        }
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     5) 테스트 전투 — 편집한 맵으로 실제 전장에 들어간다 (판은 모래판)
     ═══════════════════════════════════════════════════════════════════════ */
  function pickTestFaction(s, skipFaction) {
    var count = {}, i, id, best = null, bestN = 1;
    var ids = Object.keys((s && s.cities) || {});
    for (i = 0; i < ids.length; i++) {
      id = s.cities[ids[i]] && s.cities[ids[i]].owner;
      if (!id || id === skipFaction || id === 'neutral') continue;
      count[id] = (count[id] || 0) + 1;
    }
    Object.keys(count).forEach(function (k) { if (count[k] > bestN) { bestN = count[k]; best = k; } });
    return best || 'warlord';
  }

  function runTestBattle() {
    if (pendingBattle) return;
    if (typeof SK.startBattle !== 'function') { setStatus('전투 엔진(SK.startBattle)이 아직 없습니다.'); return; }
    if (window.SKBattle && SKBattle.debug && SKBattle.debug.battle) {
      setStatus('지금 전투 중입니다 — 전투를 마치고 다시 눌러 주세요.');
      return;
    }
    var s = SK.state;
    if (!s || !s.cities || !s.heroes) {
      setStatus('먼저 표지에서 [새로 시작]으로 판을 연 뒤에 테스트 전투를 쓸 수 있습니다.');
      return;
    }
    /* 벽·성문이 있으면 공성전 규칙(성문 내구도)으로, 아니면 평야전 규칙으로 연다 */
    var hasWall = false, y, x;
    for (y = 0; y < st.rows && !hasWall; y++) {
      for (x = 0; x < st.cols; x++) { if (st.tiles[y][x] === 'C' || st.tiles[y][x] === 'G') { hasWall = true; break; } }
    }
    var type = hasWall ? 'siege' : 'plain';
    /* 테스트는 사본으로 — 편집 중인 원본 타일은 건드리지 않는다 */
    var testTiles = clone(st.tiles);
    var meta = metaFromTiles(testTiles, st.cols, st.rows, true);
    var rows = rowsFromTiles(testTiles);

    /* ── 모래판 준비: 지금 판을 그대로 되돌릴 수 있게 스냅숏 ── */
    var snapshot = JSON.stringify(s);
    var origSave = SK.save;
    var origShowMap = SK.showMap;
    var origPlainMap = SK.BATTLE_TYPES.plain && SK.BATTLE_TYPES.plain.map;
    var origSiegeKey = SK.siegeMapKey;
    var hadMap = Object.prototype.hasOwnProperty.call(SK.MAPS, CUSTOM_KEY);
    var hadMeta = Object.prototype.hasOwnProperty.call(SK.MAP_META, CUSTOM_KEY);
    var hadCityState = Object.prototype.hasOwnProperty.call(s.cities, CUSTOM_KEY);
    var cityListLen = SK.CITY_LIST.length;
    /* 도감은 판과 별도 저장소라 따로 스냅숏을 들어 둔다 */
    var CODEX_KEY = 'samgukji-jojo-codex';
    var codexRaw = null;
    try { codexRaw = localStorage.getItem(CODEX_KEY); } catch (e) { codexRaw = null; }
    var pf = s.playerFaction || SK.playerFaction() || 'caocao';
    var fac = pickTestFaction(s, pf);
    var reopen = open;

    SK.MAPS[CUSTOM_KEY] = rows;
    SK.MAP_META[CUSTOM_KEY] = meta;
    if (type === 'siege') { SK.siegeMapKey = function () { return CUSTOM_KEY; }; }
    else { SK.BATTLE_TYPES.plain.map = CUSTOM_KEY; }

    var templateSlots = null;
    for (var ci = 0; ci < SK.CITY_LIST.length; ci++) {
      var cs0 = s.cities[SK.CITY_LIST[ci].id];
      if (cs0 && cs0.slots) { templateSlots = clone(cs0.slots); break; }
    }
    SK.CITY[TMP_CITY] = {
      id: TMP_CITY, name: '전장 테스트', hanja: '', u: 0.5, v: 0.5, region: '테스트',
      type: 'town', faction: fac, battleType: type === 'siege' ? 'siege' : 'field',
      gold: 0, food: 0, baseTroops: 4200, defense: 60, governor: '', roads: [], sea: [],
    };
    SK.CITY_LIST.push(SK.CITY[TMP_CITY]);
    s.cities[TMP_CITY] = {
      owner: fac, troops: 4200, def: 60, loyalty: 60, order: 60, pop: 12000,
      agri: 20, comm: 20, train: 50, gold: 0, food: 0, genIds: [], advisor: null, governor: null,
      auto: true, bandit: false, slots: templateSlots, scoutedUntil: 0, wounded: 0,
    };

    /* 아군 부대 — 내 장수 최대 6명, 없으면 일반 부대 */
    var units = [], heroes = (s.heroes || []).filter(function (h) { return h && !h.dead && !h.captured; }).slice(0, 6);
    heroes.forEach(function (h) {
      var cap = SK.troopCapOf ? SK.troopCapOf(h) : 6000;
      var base = SK.troopForNamed ? SK.troopForNamed(h.lv) : 3000;
      units.push({ kind: 'hero', uid: h.uid, troops: Math.max(800, Math.min(cap, base)) });
    });
    if (!units.length) {
      units = [
        { kind: 'regiment', cls: 'geombyung', name: '시험 검병', troops: 2600 },
        { kind: 'regiment', cls: 'changbyung', name: '시험 창병', troops: 2600 },
        { kind: 'regiment', cls: 'gungsu', name: '시험 궁수', troops: 2200 },
      ];
      setStatus('아직 내 장수가 없어 일반 부대로 전장을 엽니다.');
    }
    var origin = (heroes[0] && heroes[0].city) || s.lastCity || '';
    if (!origin || !s.cities[origin]) {
      var mine = SK.CITY_LIST.filter(function (c) { return s.cities[c.id] && s.cities[c.id].owner === pf; })[0];
      origin = mine ? mine.id : (SK.CITY_LIST[0] && SK.CITY_LIST[0].id);
    }

    /* 저장을 잠근다 — 테스트 전투가 실제 세이브를 덮어쓰지 않는다 */
    SK.save = function () {};
    var origModal = SK.modal;
    pendingBattle = true;
    if (reopen) closeEditor();
    if (typeof SK.adminClose === 'function') SK.adminClose();

    /* 전투가 끝나 지도로 돌아오는 순간, 판을 원상복구한다 (victory·defeat·retreat 모두 SK.showMap 을 거친다) */
    SK.showMap = function () {
      var args = arguments;
      try { restoreSandbox(); } catch (e) { /* 복구 실패가 지도 표시를 막지 않게 */ }
      return origShowMap.apply(SK, args);
    };

    function restoreSandbox() {
      if (!pendingBattle) return;
      pendingBattle = false;
      try {
        /* 1) 판 내용 되돌리기 — 같은 객체(SK.state)를 그대로 두고 속성만 갈아 끼운다 */
        var fresh = JSON.parse(snapshot);
        Object.keys(s).forEach(function (k) { delete s[k]; });
        Object.keys(fresh).forEach(function (k) { s[k] = fresh[k]; });
        /* 2) 임시 거점·전장 청소 */
        delete SK.CITY[TMP_CITY];
        if (!hadCityState) delete s.cities[TMP_CITY];
        if (SK.CITY_LIST.length > cityListLen) SK.CITY_LIST.length = cityListLen;
        if (!hadMap) delete SK.MAPS[CUSTOM_KEY];
        if (!hadMeta) delete SK.MAP_META[CUSTOM_KEY];
        if (origPlainMap) SK.BATTLE_TYPES.plain.map = origPlainMap;
        SK.siegeMapKey = origSiegeKey;
        SK.save = origSave;
        SK.showMap = origShowMap;
        /* 3) 도감에 테스트 전투 보상이 섞이지 않게 */
        try {
          if (codexRaw == null) localStorage.removeItem(CODEX_KEY);
          else localStorage.setItem(CODEX_KEY, codexRaw);
        } catch (e4) { /* ignore */ }
      } catch (e) { /* 위에서 이미 원래 함수로 되돌리지 못했으면 다음 판에서 정리된다 */ }
      /* 4) 승리 창 뒤에 이어지는 포로·멸망·속보 창은 모래판의 것이라 띄우지 않는다.
         (그 창의 버튼이 되돌린 판에 그대로 적용되면 장수를 잘못 얻거나 잃는다) */
      var guardUntil = Date.now() + 2600;
      SK.modal = function () {
        if (Date.now() < guardUntil) return undefined;
        SK.modal = origModal;
        return origModal.apply(SK, arguments);
      };
      setTimeout(function () { if (SK.modal !== origModal) SK.modal = origModal; }, 2700);
      setTimeout(function () {
        setStatus('테스트 전투를 마쳤습니다 — 판은 그대로입니다 (병력·성·장수 변화 없음).');
        if (reopen) openEditor('battle');
        try { SK.toast('테스트 전투 종료 — 판은 그대로 돌아왔습니다.'); } catch (e2) { /* ignore */ }
      }, 380);
    }

    setStatus('테스트 전투를 엽니다 — ' + (type === 'siege' ? '공성전 규칙' : '평야전 규칙') + ' · ' + st.cols + '×' + st.rows);
    try {
      SK.startBattle({ targetId: TMP_CITY, origin: origin, type: type, units: units });
    } catch (err) {
      pendingBattle = false;
      SK.save = origSave;
      SK.showMap = origShowMap;
      SK.modal = origModal;
      if (origPlainMap) SK.BATTLE_TYPES.plain.map = origPlainMap;
      SK.siegeMapKey = origSiegeKey;
      if (!hadMap) delete SK.MAPS[CUSTOM_KEY];
      if (!hadMeta) delete SK.MAP_META[CUSTOM_KEY];
      delete SK.CITY[TMP_CITY];
      if (!hadCityState) delete s.cities[TMP_CITY];
      if (SK.CITY_LIST.length > cityListLen) SK.CITY_LIST.length = cityListLen;
      try {
        if (codexRaw == null) localStorage.removeItem(CODEX_KEY);
        else localStorage.setItem(CODEX_KEY, codexRaw);
      } catch (e5) { /* ignore */ }
      try {
        var fresh2 = JSON.parse(snapshot);
        Object.keys(s).forEach(function (k) { delete s[k]; });
        Object.keys(fresh2).forEach(function (k) { s[k] = fresh2[k]; });
      } catch (e3) { /* ignore */ }
      if (reopen) openEditor('battle');
      setStatus('테스트 전투를 열지 못했습니다 — ' + ((err && err.message) || err));
    }
  }

  /* ── 천하맵 구역 ─────────────────────────────────────────────────────── */
  function buildWorldSection() {
    var sec = el('div', 'v585-sec'); ui.secWorld = sec;

    var searchRow = el('div', 'v585-row');
    var q = el('input', 'v585-in'); q.type = 'search'; q.placeholder = '거점 검색 (이름·세력)';
    var sel = el('select', 'v585-sel'); ui.citySel = sel;
    searchRow.appendChild(q); searchRow.appendChild(sel);
    ui.citySearch = q;

    var wrap = el('div', 'v585-cv');
    var canvas = document.createElement('canvas'); ui.worldCanvas = canvas;
    wrap.appendChild(canvas);

    var pickRow = el('div', 'v585-row');
    var pickBtn = el('button', 'v585-btn', '📍 위치 찍기'); pickBtn.type = 'button';
    var zin = el('button', 'v585-btn', '＋'); zin.type = 'button'; zin.setAttribute('aria-label', '확대');
    var zout = el('button', 'v585-btn', '－'); zout.type = 'button'; zout.setAttribute('aria-label', '축소');
    var fit = el('button', 'v585-btn', '⤢ 전체'); fit.type = 'button';
    pickRow.appendChild(pickBtn); pickRow.appendChild(zin); pickRow.appendChild(zout); pickRow.appendChild(fit);
    ui.pickBtn = pickBtn;

    var grid = el('div', 'v585-grid');
    var nameIn = el('input', 'v585-in'); nameIn.type = 'text';
    var typeSel = el('select', 'v585-sel');
    [['capital', '대도시'], ['mid', '중도시'], ['town', '소도시'], ['pass', '관문'], ['fortress', '요새']].forEach(function (p) {
      var o = el('option', null, p[1]); o.value = p[0]; typeSel.appendChild(o);
    });
    var facSel = el('select', 'v585-sel');
    Object.keys(SK.FACTIONS || {}).forEach(function (k) {
      var o = el('option', null, SK.factionName ? SK.factionName(k) : k); o.value = k; facSel.appendChild(o);
    });
    var battleIn = el('input', 'v585-in'); battleIn.type = 'text'; battleIn.placeholder = 'siege / field …';
    var troopsIn = el('input', 'v585-in'); troopsIn.type = 'number'; troopsIn.min = '0'; troopsIn.step = '100';
    var defIn = el('input', 'v585-in'); defIn.type = 'number'; defIn.min = '0'; defIn.max = '100';
    var xIn = el('input', 'v585-in'); xIn.type = 'number'; xIn.min = '0'; xIn.max = String(WORLD_W);
    var yIn = el('input', 'v585-in'); yIn.type = 'number'; yIn.min = '0'; yIn.max = String(WORLD_H);

    function field(label, control) {
      var f = el('label', 'v585-f');
      f.appendChild(el('span', null, label));
      f.appendChild(control);
      return f;
    }
    grid.appendChild(field('거점 이름', nameIn));
    grid.appendChild(field('유형', typeSel));
    grid.appendChild(field('세력', facSel));
    grid.appendChild(field('전장 유형', battleIn));
    grid.appendChild(field('기본 병력', troopsIn));
    grid.appendChild(field('방어도', defIn));
    grid.appendChild(field('좌표 X (0~2000)', xIn));
    grid.appendChild(field('좌표 Y (0~1333)', yIn));
    ui.wName = nameIn; ui.wType = typeSel; ui.wFac = facSel; ui.wBattle = battleIn;
    ui.wTroops = troopsIn; ui.wDef = defIn; ui.wX = xIn; ui.wY = yIn;

    [nameIn, typeSel, facSel, battleIn, troopsIn, defIn, xIn, yIn].forEach(function (n) {
      n.addEventListener('change', applyCityForm);
    });

    var crud = el('div', 'v585-row');
    var addBtn = el('button', 'v585-btn', '➕ 새 거점'); addBtn.type = 'button';
    var delBtn = el('button', 'v585-btn danger', '🗑️ 거점 삭제'); delBtn.type = 'button';
    crud.appendChild(addBtn); crud.appendChild(delBtn);

    var routeRow = el('div', 'v585-row');
    var routeSel = el('select', 'v585-sel'); ui.routeSel = routeSel;
    var routeBtn = el('button', 'v585-btn', '🔗 길 연결/해제'); routeBtn.type = 'button';
    routeRow.appendChild(routeSel); routeRow.appendChild(routeBtn);

    var acts = el('div', 'v585-row');
    var copyBtn = el('button', 'v585-btn', '📋 JSON 복사'); copyBtn.type = 'button';
    var applyBtn = el('button', 'v585-btn gold', '🗺️ 지도에 적용'); applyBtn.type = 'button';
    var resetBtn = el('button', 'v585-btn danger', '♻️ 초기화'); resetBtn.type = 'button';
    acts.appendChild(copyBtn); acts.appendChild(applyBtn); acts.appendChild(resetBtn);

    var hint = el('p', 'v585-hint', '지도(2000×1333)를 눌러 가까운 거점을 고르고, [📍 위치 찍기]를 켠 뒤 지도를 누르면 그 자리로 옮깁니다. 길은 이어져 있으면 빨간 점선, 새로 이으면 금색 실선으로 보입니다.');

    sec.appendChild(searchRow); sec.appendChild(wrap); sec.appendChild(pickRow);
    sec.appendChild(grid); sec.appendChild(crud); sec.appendChild(routeRow);
    sec.appendChild(acts); sec.appendChild(hint);
    ui.body.appendChild(sec);

    q.oninput = function () { syncCityList(); };
    sel.onchange = function () {
      wst.sel = sel.value;
      syncCityForm(); syncRouteOptions(); renderWorld(); saveStore();
    };
    pickBtn.onclick = function () {
      pickMode = !pickMode;
      pickBtn.classList.toggle('on', pickMode);
      setStatus(pickMode ? '"' + (selectedCity() ? selectedCity().name : '거점') + '" — 지도에서 새 자리를 눌러 주세요.' : '위치 찍기 취소');
    };
    zin.onclick = function () { worldZoom = Math.min(5, Math.round(worldZoom * 1.3 * 100) / 100); renderWorld(); };
    zout.onclick = function () { worldZoom = Math.max(0.8, Math.round(worldZoom / 1.3 * 100) / 100); renderWorld(); };
    fit.onclick = function () { worldZoom = 1; worldPanX = 0; worldPanY = 0; renderWorld(); };
    addBtn.onclick = function () {
      var idx = wst.cities.length + 1;
      var id = 'custom_' + Date.now().toString(36);
      var c = { id: id, name: '신규거점_' + idx, type: 'town', faction: 'neutral', battleType: 'field', troops: 4000, defense: 60,
        x: Math.round(WORLD_W / 2), y: Math.round(WORLD_H / 2) };
      wst.cities.push(c);
      wst.sel = id;
      saveStore(); syncCityList(); syncCityForm(); syncRouteOptions(); renderWorld();
      setStatus('새 거점 "' + c.name + '"을(를) 지도 가운데에 세웠습니다 — [📍 위치 찍기]로 자리를 잡아 주세요.');
    };
    delBtn.onclick = function () {
      var c = selectedCity();
      if (!c) return;
      wst.cities = wst.cities.filter(function (x) { return x.id !== c.id; });
      wst.routes = wst.routes.filter(function (r) { return r[0] !== c.id && r[1] !== c.id; });
      wst.sea = wst.sea.filter(function (r) { return r[0] !== c.id && r[1] !== c.id; });
      if (wbase.byId[c.id]) wst.deleted.push(c.id);
      wst.sel = wst.cities[0] ? wst.cities[0].id : '';
      saveStore(); syncCityList(); syncCityForm(); syncRouteOptions(); renderWorld();
      setStatus('거점 "' + c.name + '"을(를) 지도에서 지웠습니다.');
    };
    routeBtn.onclick = function () {
      var c = selectedCity();
      var target = routeSel.value;
      if (!c || !target || target === c.id) { setStatus('길로 이을 다른 거점을 골라 주세요.'); return; }
      var linked = toggleRoute(wst.routes, c.id, target);
      var other = worldCityById(target);
      saveStore(); syncRouteOptions(); renderWorld();
      setStatus((linked ? '길 연결 — ' : '길 해제 — ') + c.name + ' ↔ ' + (other ? other.name : target));
    };
    copyBtn.onclick = function () {
      copyText(worldJsonText(), function (ok) {
        setStatus(ok ? '거점·길 diff JSON을 복사했습니다 (원본 대비 바뀐 것만).' : '클립보드 복사에 실패했습니다.');
      });
    };
    applyBtn.onclick = applyWorldPreview;
    resetBtn.onclick = function () {
      wbase = readEngineWorld();
      resetWorldModel();
      pickMode = false; pickBtn.classList.remove('on');
      saveStore(); syncCityList(); syncCityForm(); syncRouteOptions(); renderWorld();
      setStatus('천하 지도를 엔진 원본(SK.CITY · SK.ROADS)으로 되돌렸습니다.');
    };

    bindWorldPointer(canvas);
  }

  function bindWorldPointer(canvas) {
    var down = false, moved = false, start = null, last = null;
    function toWorld(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      var px = (clientX - r.left) * (canvas.width / r.width);
      var py = (clientY - r.top) * (canvas.height / r.height);
      var base = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
      var sc = base * worldZoom;
      var ox = (canvas.width - WORLD_W * sc) * 0.5 + worldPanX;
      var oy = (canvas.height - WORLD_H * sc) * 0.5 + worldPanY;
      return { px: px, py: py, sc: sc, ox: ox, oy: oy,
        x: clamp(Math.round((px - ox) / sc), 0, WORLD_W),
        y: clamp(Math.round((py - oy) / sc), 0, WORLD_H) };
    }
    function nearest(px, py, sc, ox, oy) {
      var best = null, bestD = 1e9;
      wst.cities.forEach(function (c) {
        var d = Math.hypot(ox + c.x * sc - px, oy + c.y * sc - py);
        if (d < bestD) { bestD = d; best = c; }
      });
      return bestD <= Math.max(16, 13 * Math.min(window.devicePixelRatio || 1, 2)) ? best : null;
    }
    canvas.addEventListener('pointerdown', function (e) {
      down = true; moved = false;
      start = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!down || !last) return;
      if (Math.abs(e.clientX - start.x) > 6 || Math.abs(e.clientY - start.y) > 6) moved = true;
      if (moved && !pickMode) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        worldPanX += (e.clientX - last.x) * dpr;
        worldPanY += (e.clientY - last.y) * dpr;
        last = { x: e.clientX, y: e.clientY };
        renderWorld();
      }
      e.preventDefault();
    });
    canvas.addEventListener('pointerup', function (e) {
      if (!down) return;
      down = false;
      if (moved) return;
      var p = toWorld(e.clientX, e.clientY);
      if (!p) return;
      var c = selectedCity();
      if (pickMode && c) {
        c.x = p.x; c.y = p.y;
        pickMode = false;
        if (ui.pickBtn) ui.pickBtn.classList.remove('on');
        saveStore(); syncCityForm(); renderWorld();
        setStatus('"' + c.name + '" 위치 → (' + p.x + ', ' + p.y + ')');
        return;
      }
      var hit = nearest(p.px, p.py, p.sc, p.ox, p.oy);
      if (hit) {
        wst.sel = hit.id;
        syncCityList(); syncCityForm(); syncRouteOptions(); renderWorld(); saveStore();
        setStatus('거점 선택 — ' + hit.name + ' (' + hit.id + ')');
      }
    });
    canvas.addEventListener('pointercancel', function () { down = false; });
  }

  function syncCityList() {
    var sel = ui.citySel;
    if (!sel) return;
    var kw = (ui.citySearch && ui.citySearch.value || '').trim().toLowerCase();
    var list = wst.cities.filter(function (c) {
      if (!kw) return true;
      return (c.name + ' ' + c.id + ' ' + c.faction).toLowerCase().indexOf(kw) >= 0;
    });
    sel.innerHTML = '';
    list.forEach(function (c) {
      var o = el('option', null, c.name + ' (' + c.id + ')');
      o.value = c.id;
      sel.appendChild(o);
    });
    if (!list.length) { var e = el('option', null, '검색 결과 없음'); e.value = ''; sel.appendChild(e); }
    if (wst.sel) sel.value = wst.sel;
  }
  function syncCityForm() {
    var c = selectedCity();
    if (!c) return;
    ui.wName.value = c.name;
    ui.wType.value = c.type || 'town';
    ui.wFac.value = c.faction || 'neutral';
    ui.wBattle.value = c.battleType || 'field';
    ui.wTroops.value = String(Math.round(c.troops || 0));
    ui.wDef.value = String(Math.round(c.defense || 0));
    ui.wX.value = String(Math.round(c.x));
    ui.wY.value = String(Math.round(c.y));
  }
  function applyCityForm() {
    var c = selectedCity();
    if (!c) return;
    c.name = (ui.wName.value || '').trim() || c.name;
    c.type = ui.wType.value || c.type;
    c.faction = ui.wFac.value || c.faction;
    c.battleType = (ui.wBattle.value || '').trim() || c.battleType;
    c.troops = Math.max(0, Math.round(Number(ui.wTroops.value) || 0));
    c.defense = clamp(Math.round(Number(ui.wDef.value) || 0), 0, 100);
    c.x = clamp(Math.round(Number(ui.wX.value) || 0), 0, WORLD_W);
    c.y = clamp(Math.round(Number(ui.wY.value) || 0), 0, WORLD_H);
    saveStore(); syncCityList(); renderWorld();
    setStatus('거점 "' + c.name + '" 저장 — (' + c.x + ', ' + c.y + ')');
  }
  function syncRouteOptions() {
    var sel = ui.routeSel;
    if (!sel) return;
    var c = selectedCity();
    sel.innerHTML = '';
    wst.cities.forEach(function (o) {
      if (!c || o.id === c.id) return;
      var linked = hasRoute(wst.routes, c.id, o.id);
      var sea = hasRoute(wst.sea, c.id, o.id);
      var opt = el('option', null, (linked ? '🔗 ' : (sea ? '⛵ ' : '➕ ')) + o.name);
      opt.value = o.id;
      sel.appendChild(opt);
    });
  }

  /* 지도 그림 — 엔진의 지형 배경(assets/map_bg.webp) 위에 거점·길을 그린다 */
  var worldBg = null, worldBgTried = false;
  function ensureWorldBg() {
    if (worldBg || worldBgTried) return;
    worldBgTried = true;
    try {
      var img = new Image();
      img.onload = function () { worldBg = img; renderWorld(); };
      img.onerror = function () { worldBg = null; };
      img.src = 'assets/map_bg.webp';
    } catch (e) { worldBg = null; }
  }

  function renderWorld() {
    var canvas = ui.worldCanvas;
    if (!canvas || !canvas.parentElement) return;
    ensureWorldBg();
    var wrap = canvas.parentElement;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.floor((wrap.clientWidth || 340) * dpr));
    var h = Math.max(1, Math.floor((wrap.clientHeight || 250) * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var base = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
    var sc = base * worldZoom;
    var ox = (canvas.width - WORLD_W * sc) * 0.5 + worldPanX;
    var oy = (canvas.height - WORLD_H * sc) * 0.5 + worldPanY;

    if (worldBg) {
      ctx.drawImage(worldBg, ox, oy, WORLD_W * sc, WORLD_H * sc);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(ox, oy, WORLD_W * sc, WORLD_H * sc);
    } else {
      ctx.fillStyle = '#1b1b12';
      ctx.fillRect(ox, oy, WORLD_W * sc, WORLD_H * sc);
    }
    ctx.strokeStyle = '#7c6223';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, WORLD_W * sc, WORLD_H * sc);

    var byId = {};
    wst.cities.forEach(function (c) { byId[c.id] = c; });
    /* 바닷길 (있으면) */
    ctx.strokeStyle = 'rgba(90,200,230,.60)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    wst.sea.forEach(function (r) {
      var a = byId[r[0]], b = byId[r[1]];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(ox + a.x * sc, oy + a.y * sc);
      ctx.lineTo(ox + b.x * sc, oy + b.y * sc);
      ctx.stroke();
    });
    /* 육로 */
    ctx.strokeStyle = 'rgba(240,205,120,.85)';
    wst.routes.forEach(function (r) {
      var a = byId[r[0]], b = byId[r[1]];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(ox + a.x * sc, oy + a.y * sc);
      ctx.lineTo(ox + b.x * sc, oy + b.y * sc);
      ctx.stroke();
    });
    /* 거점 */
    wst.cities.forEach(function (c) {
      var px = ox + c.x * sc, py = oy + c.y * sc;
      var isSel = c.id === wst.sel;
      var r = (isSel ? 6.5 : 4.2) * dpr;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = skFactionColor(c.faction);
      ctx.fill();
      ctx.lineWidth = isSel ? 2.2 * dpr : 1 * dpr;
      ctx.strokeStyle = isSel ? '#ffe082' : 'rgba(20,14,6,.85)';
      ctx.stroke();
      if (isSel) {
        ctx.font = 'bold ' + Math.round(11 * dpr) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(0,0,0,.65)';
        var tw = ctx.measureText(c.name).width;
        ctx.fillRect(px - tw / 2 - 3 * dpr, py - r - 16 * dpr, tw + 6 * dpr, 14 * dpr);
        ctx.fillStyle = '#fff3c4';
        ctx.fillText(c.name, px, py - r - 4 * dpr);
      }
    });
  }
  function skFactionColor(f) {
    try { if (SK.factionColor) return SK.factionColor(f) || '#c8b184'; } catch (e) { /* ignore */ }
    return '#c8b184';
  }

  /* ═══════════════════════════════════════════════════════════════════════
     6) 관리자 패널 연결 — [🛠️ 관리자] 탭 줄에 [🗺️ 전장맵] [🌏 천하맵] 을 붙인다
     ═══════════════════════════════════════════════════════════════════════ */
  function injectNavButtons() {
    var tabs = document.querySelector('#adm-panel .adm-tabs');
    if (!tabs || tabs.querySelector('[data-mapedit]')) return;
    var b1 = el('button', null, '🗺️ 전장맵');
    b1.type = 'button'; b1.setAttribute('data-mapedit', 'battle');
    b1.onclick = function () { openEditor('battle'); };
    var b2 = el('button', null, '🌏 천하맵');
    b2.type = 'button'; b2.setAttribute('data-mapedit', 'world');
    b2.onclick = function () { openEditor('world'); };
    tabs.appendChild(b1);
    tabs.appendChild(b2);
  }
  function hookAdminPanel() {
    if (typeof SK.adminOpen === 'function' && !SK.adminOpen.__v585) {
      var orig = SK.adminOpen;
      var wrapped = function () {
        var r = orig.apply(this, arguments);
        injectNavButtons();
        return r;
      };
      wrapped.__v585 = true;
      SK.adminOpen = wrapped;
    }
    injectNavButtons();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     7) 시작
     ═══════════════════════════════════════════════════════════════════════ */
  function boot() {
    initState();
    hookAdminPanel();
    /* 관리자 패널이 나중에 만들어지는 경우에도 탭을 붙인다 */
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { injectNavButtons(); });
      mo.observe(document.body, { childList: true, subtree: false });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.V585_MAP_EDITOR = {
    version: VERSION,
    storageKey: STORE_KEY,
    openBattleEditor: function () { openEditor('battle'); },
    openWorldEditor: function () { openEditor('world'); },
    close: closeEditor,
    /* 검증용 */
    state: function () {
      return {
        open: open, brush: brush, undo: undo.length, pendingBattle: pendingBattle,
        battle: { name: st.name, cols: st.cols, rows: st.rows, tiles: clone(st.tiles), rowText: rowsFromTiles(st.tiles) },
        world: { cities: clone(wst.cities), routes: clone(wst.routes), sea: clone(wst.sea), sel: wst.sel },
      };
    },
    setBrush: function (code) {
      if (COLORS[code]) {
        brush = code;
        if (ui.palette) Object.keys(ui.palette).forEach(function (k) { ui.palette[k].classList.toggle('sel', k === brush); });
      }
      return brush;
    },
    paint: function (x, y, code) {
      if (!st.tiles[y] || st.tiles[y][x] == null) return false;
      pushUndo();
      st.tiles[y][x] = COLORS[code] ? code : brush;
      renderBattle();
      saveStore();
      return true;
    },
    undo: function () {
      if (!undo.length) return false;
      var prev = undo.pop();
      st.cols = prev.cols; st.rows = prev.rows; st.tiles = clone(prev.tiles);
      syncBattleFields(); renderBattle();
      return true;
    },
    loadBattleMap: loadEngineMap,
    exportBattleJson: battlePayload,
    exportBattleText: battleJsonText,
    exportWorldJson: worldDiff,
    exportWorldText: worldJsonText,
    runTestBattle: runTestBattle,
    applyWorldPreview: applyWorldPreview,
    metaFromTiles: function () { return metaFromTiles(st.tiles, st.cols, st.rows, false); },
  };
})();
