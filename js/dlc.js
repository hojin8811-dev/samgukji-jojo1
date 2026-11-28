/* ═══════════════════════════════════════════════════════════════════════
   js/dlc.js — 《이세계 특전 영웅》 DLC (1~3탄: dlc_01 ~ dlc_30)
   · data/dlc_heroes.json 하나가 영웅 명부·고유 직업·고유 책략·필살기·가격을 들고 있다.
     이 파일은 그것을 게임의 실제 심볼(SK.CLASSES·SK.SKILLS·SK.ULTIMATES·SK.ART·
     SK.GEN_BY_ID)에 그대로 등록하고, 상점 UI·해금·Google Play Billing 연결점을 맡는다.
   · 본편 주점(recruit)·탐색·도감 풀과는 완전히 분리된다:
     특전 영웅은 SK.GENERALS(명부)에 들어가지 않으므로 재야·주점·AI 세력에 절대 나오지 않는다.
   · 2026-11-27 지시: 출시 전까지 상점은 비공개. 주소에 ?dlc=1 이 있거나
     localStorage 'dlcTestMode'='1' 인 테스트 기기에서만 보인다. (DLC_PUBLIC = false)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var SK = (window.SK = window.SK || {});
  var DATA_URL = 'data/dlc_heroes.json';
  var UNLOCK_KEY = 'unlockedDlc';       // ["dlc_hero_01", ...] — 개별 해금
  var TEST_KEY = 'dlcTestMode';         // '1' 이면 상점이 보인다 (테스트 기기)
  var DLC_PUBLIC = false;               // 출시 후 true 로 바꾸면 전체 공개
  var GEN_ID_BASE = 81000;

  /* v6.9a — 상점 2번째 탭 『편의·후원』 상품 2종.
     · pass_auto_city — 3,900원 영구. 전체 성 원터치 자동 내정.
     · pack_supporter_once — 1,900원 계정당 1회. 👑 후원자 뱃지 + 초기 지원. */
  var GOODS = [
    /* v6.14 — 한국 패키지 (4,900원 · 사용자 확정). 반대편 대륙(한반도)에서 시작하는
       스타팅 캠페인이다. 기본판의 '중원 통일 → 한국 보스 침공' 무료 엔드 콘텐츠는
       그대로 두고, 이 상품은 방향이 반대인 캠페인을 더한다(대칭 엔드 규칙).
       기존 무료 한국 영웅·보물·시너지는 빼앗지 않는다. */
    {
      productId: 'pack_korea', kind: 'pack', ic: '🇰🇷',
      name: '한국 패키지', price: 4900, tag: '확장 콘텐츠 · 영구',
      one: '한반도 전용 지도 + 한국 세력 스타팅 캠페인',
      bullets: [
        '한반도(+요동) 19거점에서 고구려·백제·신라·고려·조선 중 하나로 시작',
        '한반도를 통일하고 서진해 업·진양·평원 세 관문을 넘으면 중국 보스전 개막',
        '중원 최강 보스(조조·사마의·여포·제갈량)까지 격파하면 최종 천하통일',
        '기본판의 한국 영웅 30명·한국 보물·시너지는 무료 그대로 — 잠그지 않습니다',
      ],
      foot: '계정에 영구 적용 · 기본판(중원)과 무료 한국 보스전은 그대로',
    },
    {
      productId: 'pass_auto_city', kind: 'pass', ic: '⚡',
      name: '자동 내정 패스', price: 3900, tag: '편의성 · 영구',
      one: '성이 늘어도 매달 반복되는 내정을 한 번에',
      bullets: [
        '내 모든 성의 남은 장수로 상업·개간·치안·징병·보급을 일괄 실행',
        '성마다 형편(민심·병력·훈련도·성벽·금·군량)을 읽어 급한 일부터 지시',
        '지도·성 화면 [⚡ 전체 자동 내정] 원터치 버튼',
        '처리한 성·장수 수와 금·군량·병력 변화를 한 창으로 보고',
      ],
      foot: '계정에 영구 적용 · 내 성의 남은 행동만 씁니다',
    },
    {
      productId: 'pack_supporter_once', kind: 'supporter', ic: '👑',
      name: '개발자 응원 팩', price: 1900, tag: '후원 · 계정당 1회',
      one: '응원 한 번 — 명예 뱃지와 초기 지원',
      bullets: [
        '군주 이름 옆 [👑 후원자] 명예 뱃지 상시 표시',
        '지금 세력 또는 새 게임에 금 +3,000 · 군량 +3,000',
        'S/A급 랜덤 보물 1개 (세력당 한 번, 중복 지급 없음)',
      ],
      foot: '계정당 1회 한정 · 구매 뒤에는 버튼이 잠깁니다',
    },
    /* v6.12 — 세이브 슬롯 2~5 유료 해금 (슬롯당 1,900원 · 사용자 확정).
       1번 슬롯은 기본 무료이고, 여기 네 상품이 2~5번을 하나씩 연다. */
    {
      productId: 'save_slot_2', kind: 'save_slot', ic: '💾',
      name: '세이브 슬롯 2', price: 1900, tag: '세이브 · 영구',
      one: '두 번째 세이브 — 갈래를 나눠 저장',
      bullets: ['2번 슬롯을 영구히 사용할 수 있습니다', '여러 세력을 따로 키우거나 큰 결정 앞에서 갈래를 나눕니다', '1번 슬롯은 무료 · 자동 저장도 그대로'],
      foot: '계정에 영구 적용 · 이 슬롯 하나만 열립니다',
    },
    {
      productId: 'save_slot_3', kind: 'save_slot', ic: '💾',
      name: '세이브 슬롯 3', price: 1900, tag: '세이브 · 영구',
      one: '세 번째 세이브 — 도전과 본편을 따로',
      bullets: ['3번 슬롯을 영구히 사용할 수 있습니다', '실험적인 도전과 안전한 본편을 동시에', '1번 슬롯은 무료 · 자동 저장도 그대로'],
      foot: '계정에 영구 적용 · 이 슬롯 하나만 열립니다',
    },
    {
      productId: 'save_slot_4', kind: 'save_slot', ic: '💾',
      name: '세이브 슬롯 4', price: 1900, tag: '세이브 · 영구',
      one: '네 번째 세이브 — 마음 편한 되돌림',
      bullets: ['4번 슬롯을 영구히 사용할 수 있습니다', '큰 싸움 앞에서 갈래를 미리 저장해 둡니다', '1번 슬롯은 무료 · 자동 저장도 그대로'],
      foot: '계정에 영구 적용 · 이 슬롯 하나만 열립니다',
    },
    {
      productId: 'save_slot_5', kind: 'save_slot', ic: '💾',
      name: '세이브 슬롯 5', price: 1900, tag: '세이브 · 영구',
      one: '다섯 번째 세이브 — 모든 갈래 보관',
      bullets: ['5번 슬롯을 영구히 사용할 수 있습니다', '다섯 갈래의 천하를 모두 보관', '1번 슬롯은 무료 · 자동 저장도 그대로'],
      foot: '계정에 영구 적용 · 이 슬롯 하나만 열립니다',
    },
  ];
  function goodsOf(pid) {
    for (var i = 0; i < GOODS.length; i++) if (GOODS[i].productId === String(pid)) return GOODS[i];
    return null;
  }

  var data = null;
  var loading = null;
  var byProduct = {};
  var byId = {};
  var autoOpened = false;

  /* ─────────────────────────── 접근 게이트 ─────────────────────────── */
  function hasParam() {
    try {
      var q = new URLSearchParams(window.location.search);
      var v = q.get('dlc');
      return v === '1' || v === 'true' || v === 'on';
    } catch (e) { return false; }
  }
  function testMode() {
    try { return localStorage.getItem(TEST_KEY) === '1'; } catch (e) { return false; }
  }
  function isDlcOpen() { return !!(DLC_PUBLIC || hasParam() || testMode()); }
  function setTestMode(on) {
    try { if (on) localStorage.setItem(TEST_KEY, '1'); else localStorage.removeItem(TEST_KEY); } catch (e) { /* 저장 불가 브라우저 */ }
    syncPill();
  }

  /* ─────────────────────────── 해금 상태 ─────────────────────────── */
  function readUnlocked() {
    try {
      var raw = localStorage.getItem(UNLOCK_KEY);
      var list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) return list.map(String);
      if (list && typeof list === 'object') return Object.keys(list).filter(function (k) { return list[k]; });
    } catch (e) { /* 깨진 값은 빈 목록으로 */ }
    return [];
  }
  function writeUnlocked(list) {
    var clean = [];
    (list || []).forEach(function (p) { if (p && clean.indexOf(String(p)) < 0) clean.push(String(p)); });
    try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(clean)); } catch (e) { /* ignore */ }
    return clean;
  }
  function isUnlocked(productId) { return readUnlocked().indexOf(String(productId)) >= 0; }

  /* ─────────────────────────── 등록 ─────────────────────────── */
  function heroList() { return (data && data.heroes) || []; }
  function heroOf(id) { return byId[id] || null; }

  function registerSkill(h, cd, sk, i) {
    var def = {
      name: sk.name, hanja: '', mp: sk.mp, unlockLv: sk.unlockLv || 1,
      desc: sk.desc || '', range: sk.range != null ? sk.range : cd.rng,
      minRange: sk.minRange != null ? sk.minRange : (cd.minRng || 1),
      dlc: h.id,
    };
    ['kind', 'power', 'hits', 'radius', 'maxTargets', 'amount', 'turns', 'atk', 'def', 'eva', 'move',
      'healPct', 'vsMount', 'pattern', 'crit', 'dash', 'confuse', 'fear', 'stun', 'slow', 'cleanse',
      'poison', 'morale', 'ignoreTerrain', 'siegeBonus', 'lifesteal', 'waterBonus', 'ifHpBelow',
      'defDown', 'selfBuff', 'allyBuff', 'root', 'ignoreEvade'].forEach(function (k) {
      if (sk[k] != null) def[k] = sk[k];
    });
    SK.SKILLS[sk.key] = def;
    return sk.key;
  }

  function unitPathOf(h) { return 'assets/units/dlc/' + h.id + '.webp'; }
  function registerOne(h, idx) {
    var cd = h.classDef || {};
    var keys = (h.skills || []).map(function (sk) { return registerSkill(h, cd, sk, idx); });
    var clsDef = {
      name: h.title, hanja: '', role: cd.role || '', atk: cd.atk, def: cd.def, mov: cd.mov,
      rng: cd.rng, minRng: cd.minRng || 1, agi: cd.agi || 60, mp: cd.mp,
      skills: keys, weapon: cd.weapon || 'sword', mount: !!cd.mount, loot: cd.loot || 0,
      desc: cd.desc || '', tier: h.tier || 'S', dlc: h.id,
    };
    SK.CLASSES[h.cls] = clsDef;
    /* v6.10c — 병과 지형 보정(사오정 수전 등)과 병과 패시브(블라드 흡혈·구미호 회피).
       본편 SK.TB·SK.CLASS_PASSIVE 와 같은 표를 쓰므로 전투 계산이 그대로 읽는다. */
    SK.TB[h.cls] = Object.assign({ siege: 0, naval: 0, mountain: 0, fortress: 0 }, cd.tb || {});
    if (cd.passive) SK.CLASS_PASSIVE[h.cls] = Object.assign({}, cd.passive);
    SK.CLASS_UNIT[h.cls] = unitPathOf(h);   /* 전장 전용 SD — 병종 스프라이트 재탕 없음 */
    SK.CLASS_PORTRAIT[h.cls] = h.portrait;
    SK.JOB_CLASS[h.job] = h.cls;

    if (h.ultimate) {
      var u = h.ultimate;
      SK.ULTIMATES[h.name] = {
        n: u.n, q: u.q, v: u.v || 'royal_aura', c: u.c || '255,215,120',
        e: u.e || {}, desc: u.desc || '', tier: h.tier || 'S', dlc: h.id,
      };
    }
    SK.ART[h.name] = Object.assign({}, SK.ART[h.name] || {}, { portrait: h.portrait, unit: unitPathOf(h) });

    var gen = {
      id: GEN_ID_BASE + idx, name: h.name, faction: '이세계', tier: h.tier || 'S', job: h.job,
      leadership: h.stats.leadership, war: h.stats.war, intel: h.stats.intel,
      politics: h.stats.politics, charm: h.stats.charm,
      skill: (h.ultimate && h.ultimate.n) || '', cls: h.cls, portrait: h.portrait,
      region: '이세계', dlc: h.id, dlcId: h.id, productId: h.productId,
    };
    SK.GEN_BY_ID[gen.id] = gen;
    SK.GEN_BY_NAME[h.name] = gen;
    h.genId = gen.id;
  }

  function register() {
    SK.CLASSES = SK.CLASSES || {};
    SK.SKILLS = SK.SKILLS || {};
    SK.ULTIMATES = SK.ULTIMATES || {};
    SK.ART = SK.ART || {};
    SK.GEN_BY_ID = SK.GEN_BY_ID || {};
    SK.GEN_BY_NAME = SK.GEN_BY_NAME || {};
    SK.JOB_CLASS = SK.JOB_CLASS || {};
    SK.CLASS_UNIT = SK.CLASS_UNIT || {};
    SK.CLASS_PORTRAIT = SK.CLASS_PORTRAIT || {};
    SK.CLASS_PASSIVE = SK.CLASS_PASSIVE || {};
    SK.TB = SK.TB || {};
    byProduct = {}; byId = {};
    heroList().forEach(function (h, i) {
      byProduct[h.productId] = h; byId[h.id] = h;
      registerOne(h, i + 1);
    });
    SK.DLC.loaded = true;
    SK.DLC.ready = true;
  }

  function load() {
    if (loading) return loading;
    loading = fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        data = json || { heroes: [] };
        register();
        syncPill();
        return true;
      })
      .catch(function (e) {
        console.warn('특전 영웅 데이터를 불러오지 못했습니다.', e);
        SK.DLC.loadError = String((e && e.message) || e);
        return false;
      });
    return loading;
  }
  /* 본편 ensureData 가 장수 명부를 새로 세운 뒤에도 특전 영웅의 클래스·필살기가 남도록
     한 번 더 등록한다 (등록은 같은 값으로 덮어쓰는 멱등 동작). */
  function ensureRegistered() {
    if (!data) return load().then(function (ok) { if (ok) register(); return ok; });
    if (!SK.DLC.loaded) register();
    return Promise.resolve(true);
  }

  /* ─────────────────────────── 로스터 합류 ─────────────────────────── */
  function capitalId() {
    var s = SK.state;
    if (!s || !s.cities) return null;
    var cap = s.playerCapital;
    if (cap && s.cities[cap] && s.cities[cap].owner === s.playerFaction) return cap;
    var ids = Object.keys(s.cities);
    for (var i = 0; i < ids.length; i++) {
      if (s.cities[ids[i]].owner === s.playerFaction) return ids[i];
    }
    return null;
  }
  function findHero(id) {
    var s = SK.state;
    if (!s) return null;
    return (s.heroes || []).find(function (h) {
      return h && (h.dlcId === id || h.uid === 'dlc' + String(id).replace('dlc_', '') || h.uid === 'dlc_' + id);
    }) || null;
  }
  function makeDlcHero(h, cityId) {
    var lv = 5;                       // S급 기본 레벨 (SK.TIER_LV.S)
    return {
      uid: 'dlc' + String(h.id).replace('dlc_', ''), baseId: 'dlc', genId: h.genId, name: h.name, hanja: '',
      cls: h.cls, portrait: h.portrait, unit: unitPathOf(h),
      lv: lv, wu: h.stats.war, ji: h.stats.intel, tong: h.stats.leadership,
      pol: h.stats.politics, cha: h.stats.charm, loyal: 100,
      tier: h.tier || 'S', skillName: (h.ultimate && h.ultimate.n) || '',
      hp: SK.maxHpOf ? SK.maxHpOf(h.cls, lv) : 100,
      mp: SK.maxMpOf ? SK.maxMpOf(h.cls, lv) : 30,
      city: cityId, generic: true, exp: 0, tierLv: 0, equip: {}, actedThisMonth: false,
      dlc: true, dlcId: h.id, productId: h.productId,
    };
  }
  function join(id, opts) {
    var h = heroOf(id);
    if (!h || !SK.state) return null;
    var have = findHero(id);
    if (have) return have;
    var city = capitalId();
    if (!city) return null;
    var hero = makeDlcHero(h, city);
    var added = SK.addHero ? SK.addHero(SK.state, hero) : (SK.state.heroes.push(hero), hero);
    if (!added) return findHero(id);
    try { SK.save(); } catch (e) { /* ignore */ }
    if (!(opts && opts.silent)) {
      var cn = (SK.CITY[city] || {}).name || '본성';
      SK.toast(h.name + ' — ' + cn + '에 합류했습니다. 출진 편성에서 바로 쓸 수 있습니다.');
    }
    return added;
  }
  function leave(id, opts) {
    var h = findHero(id);
    if (!h || !SK.state) return false;
    var s = SK.state;
    var marching = (s.marches || []).some(function (m) {
      return (m.units || []).some(function (u) { return u && u.uid === h.uid; });
    });
    if (marching) {
      if (!(opts && opts.silent)) SK.toast(h.name + ' — 행군 중이라 지금은 잠글 수 없습니다. 행군이 끝난 뒤 다시 시도하세요.');
      return false;
    }
    s.heroes = (s.heroes || []).filter(function (x) { return x !== h && x.uid !== h.uid; });
    // 시설 배속·태수 자리에서도 내린다
    Object.keys(s.cities || {}).forEach(function (cid) {
      var cs = s.cities[cid];
      if (!cs) return;
      if (cs.governor === h.uid) cs.governor = null;
      if (cs.advisor === h.uid) cs.advisor = null;
      (cs.slots || []).forEach(function (sl) { if (sl && sl.uid === h.uid) sl.uid = null; });
    });
    try { SK.save(); } catch (e) { /* ignore */ }
    if (!(opts && opts.silent)) SK.toast(h.name + ' — 로스터에서 빠졌습니다.');
    return true;
  }
  /* 해금된 특전 영웅은 어느 세이브에서든 본성 로스터에 있다 (출진·전투 가능). */
  function ensureRoster(opts) {
    if (!SK.state || !heroList().length) return 0;
    var n = 0;
    readUnlocked().forEach(function (pid) {
      var h = byProduct[pid];
      if (h && !findHero(h.id) && join(h.id, { silent: true })) n += 1;
    });
    if (n && !(opts && opts.silent)) SK.toast('특전 영웅 ' + n + '명이 본성에 합류해 있습니다.');
    return n;
  }

  /* ─────────────────────────── 해금 / 잠금 ─────────────────────────── */
  function unlock(productId, opts) {
    var h = byProduct[productId];
    if (!h) return false;
    writeUnlocked(readUnlocked().concat([String(productId)]));
    join(h.id, { silent: !!(opts && opts.silent) });
    syncPill();
    if (SK.refreshHud) { try { SK.refreshHud(); } catch (e) { /* ignore */ } }
    return true;
  }
  function lock(productId, opts) {
    var h = byProduct[productId];
    if (!h) return false;
    if (!leave(h.id, opts)) return false;
    writeUnlocked(readUnlocked().filter(function (p) { return p !== String(productId); }));
    syncPill();
    if (SK.refreshHud) { try { SK.refreshHud(); } catch (e) { /* ignore */ } }
    return true;
  }

  /* ─────────────────────────── 편의·후원 상품 해금 ───────────────────────────
     결제·해금 기록은 특전 영웅과 같은 localStorage 배열(unlockedDlc)에 상품 ID로 쌓는다.
     · 패스: 해금 즉시 지도·성 화면 버튼이 나타난다.
     · 응원 팩: 해금 즉시 뱃지 + 초기 지원(세력당 1회, s.supGrant 가드). */
  function goodsOwned(g) { return isUnlocked(g.productId); }
  function grantGoods(pid, opts) {
    var g = goodsOf(pid);
    if (!g) return false;
    if (g.kind === 'supporter' && isUnlocked(g.productId)) return false;   /* 계정당 1회 */
    writeUnlocked(readUnlocked().concat([String(g.productId)]));
    if (g.kind === 'pass') {
      syncAutoPill();
      if (SK.toast && !(opts && opts.silent)) SK.toast('『' + g.name + '』 해금 — 지도·성 화면의 [⚡ 전체 자동 내정]을 쓰세요.');
    } else if (g.kind === 'pack') {
      /* v6.14 — 한국 패키지: 새로 시작의 시나리오 화면에 [한반도 대난투] 카드가 열린다 */
      if (SK.toast && !(opts && opts.silent)) SK.toast('『' + g.name + '』 해금 — [새로 시작] → [한반도 대난투]에서 한국 세력을 고르세요.');
    } else if (g.kind === 'save_slot') {
      /* v6.12 — 세이브 슬롯 상품: 슬롯만 열고 다른 보상은 없다 */
      if (SK.toast && !(opts && opts.silent)) SK.toast('『' + g.name + '』 해금 — 세이브·불러오기 창에서 바로 쓸 수 있습니다.');
    } else {
      if (SK.state) SK.state.supporter = true;
      ensureSupporter({ silent: !!(opts && opts.silent) });
      if (SK.toast && !(opts && opts.silent)) SK.toast('『' + g.name + '』 후원 감사합니다!');
    }
    if (SK.refreshHud) { try { SK.refreshHud(); } catch (e) { /* ignore */ } }
    if (SK.save) { try { SK.save(); } catch (e) { /* ignore */ } }
    return true;
  }
  /* 웹 테스트 해금을 끌 때 — 패스는 버튼을 숨기고, 응원 팩은 뱃지만 걷는다.
     (이미 지급한 금·군량·보물은 되돌리지 않는다) */
  function revokeGoods(pid, opts) {
    var g = goodsOf(pid);
    if (!g) return false;
    writeUnlocked(readUnlocked().filter(function (p) { return p !== String(g.productId); }));
    if (g.kind === 'pass') {
      syncAutoPill();
      if (SK.toast && !(opts && opts.silent)) SK.toast('테스트 해금을 껐습니다 — 전체 자동 내정 버튼이 숨겨집니다.');
    } else if (g.kind === 'pack') {
      if (SK.toast && !(opts && opts.silent)) SK.toast('테스트 해금을 껐습니다 — [한반도 대난투] 캠페인이 다시 잠깁니다.');
    } else if (g.kind === 'save_slot') {
      if (SK.toast && !(opts && opts.silent)) SK.toast('테스트 해금을 껐습니다 — 이 슬롯은 다시 잠깁니다. (이미 저장한 데이터는 그대로 남습니다)');
    } else {
      /* 지급 기록(s.supGrant)은 지우지 않는다 — 테스트로 꺼다 켜도 같은 세력에 두 번 지급되지 않게 */
      if (SK.state) SK.state.supporter = false;
      if (SK.refreshHud) { try { SK.refreshHud(); } catch (e) { /* ignore */ } }
      if (SK.toast && !(opts && opts.silent)) SK.toast('테스트 해금을 껐습니다 — 후원자 뱃지가 사라집니다. (이미 받은 지원은 남습니다)');
    }
    if (SK.save) { try { SK.save(); } catch (e) { /* ignore */ } }
    return true;
  }

  /* 응원 팩 초기 지원 — 현재 세력에 아직 안 받았을 때만 (새 게임 포함) */
  var supportPending = false;
  function ensureSupporter(opts) {
    if (!isUnlocked('pack_supporter_once')) {
      if (SK.state && SK.state.supporter) SK.state.supporter = false;
      return 0;
    }
    if (!SK.state) return 0;
    if (SK.state.supporter && SK.state.supGrant) return 0;
    if (supportPending) return 0;
    var doIt = function () {
      supportPending = false;
      if (!SK.state) return 0;
      SK.state.supporter = true;
      if (SK.state.supGrant) return 0;
      var r = SK.grantSupporterSupport ? SK.grantSupporterSupport() : null;
      if (SK.refreshHud) { try { SK.refreshHud(); } catch (e) { /* ignore */ } }
      if (r && !(opts && opts.silent)) {
        SK.toast('응원 팩 — ' + r.city + '에 금 +' + r.gold.toLocaleString('ko-KR') + ' · 군량 +' + r.food.toLocaleString('ko-KR')
          + (r.treasure ? ' · 「' + r.treasure.name + '」' : '') + ' 지급. 후원 감사합니다!');
      }
      if (SK.save) { try { SK.save(); } catch (e) { /* ignore */ } }
      return r ? 1 : 0;
    };
    if (SK.TREASURES && SK.TREASURES.length) return doIt();
    supportPending = true;
    if (SK.ensureData) {
      Promise.resolve(SK.ensureData()).then(doIt).catch(function () { supportPending = false; doIt(); });
      return 0;
    }
    return doIt();
  }

  /* ─────────────────────────── Google Play Billing 연결점 ───────────────────────────
     네이티브(TWA/WebView) 쪽은 window.AndroidBilling.purchase(productId) 를 호출하고,
     결제가 끝나면 SK.DlcBilling.onPurchaseSuccess(productId) 를 부른다.
     웹에는 결제 수단이 없으므로 purchase() 는 'unavailable' 을 돌려주고 상점이 안내한다. */
  function bridge() {
    var b = window.AndroidBilling || window.SKAndroidBilling || window.SK_ANDROID_BILLING;
    return b && typeof b.purchase === 'function' ? b : null;
  }
  var Billing = {
    available: function () { return !!bridge(); },
    /* 상점에 올라간 모든 상품 ID — 특전 영웅 30(1·2·3탄) + 편의·후원 2 */
    products: function () {
      return heroList().map(function (h) { return h.productId; }).concat(GOODS.map(function (g) { return g.productId; }));
    },
    kindOf: function (productId) {
      if (byProduct[productId]) return 'hero';
      var g = goodsOf(productId);
      return g ? g.kind : null;
    },
    priceLabel: function (productId) {
      var h = byProduct[productId];
      var g = goodsOf(productId);
      var p = (h && h.price) || (g && g.price) || (data && data.priceKRW) || 2900;
      return p.toLocaleString('ko-KR') + '원';
    },
    isPurchased: function (productId) { return isUnlocked(productId); },
    /* 결제 요청 — 네이티브 브리지로 넘긴다. 성공·실패는 onPurchaseSuccess/Fail 로 돌아온다. */
    purchase: function (productId) {
      var h = byProduct[productId];
      var g = goodsOf(productId);
      if (!h && !g) return 'unknown';
      if (isUnlocked(productId)) {
        if (h) unlock(productId);
        return 'already';
      }
      var b = bridge();
      if (!b) return 'unavailable';
      try {
        b.purchase(productId);
        if (SK.toast) SK.toast('결제 창을 엽니다 — ' + (h ? h.name : g.name));
        return 'pending';
      } catch (e) {
        console.warn('Billing bridge 실패', e);
        return 'error';
      }
    },
    onPurchaseSuccess: function (productId) {
      var h = byProduct[productId];
      if (h) {
        unlock(productId, { silent: true });
        if (SK.toast) SK.toast('『' + h.name + '』 해금 완료 — 본성 로스터에 합류했습니다.');
        if (SK.sfx) { try { SK.sfx.play('victory'); } catch (e) { /* ignore */ } }
        return true;
      }
      var g = goodsOf(productId);
      if (g) {
        var ok = grantGoods(productId, { silent: true });
        if (SK.toast) SK.toast(ok ? '『' + g.name + '』 구매 완료 — 감사합니다!' : '『' + g.name + '』은(는) 계정당 1회만 살 수 있습니다.');
        if (ok && SK.sfx) { try { SK.sfx.play('victory'); } catch (e) { /* ignore */ } }
        return ok;
      }
      return false;
    },
    onPurchaseFail: function (productId, reason) {
      var h = byProduct[productId];
      var g = goodsOf(productId);
      if (SK.toast) SK.toast(((h && h.name) || (g && g.name) || '상품') + ' 결제가 취소되었거나 실패했습니다' + (reason ? ' — ' + reason : ''));
      return false;
    },
  };
  SK.DlcBilling = Billing;

  /* ─────────────────────────── 상점 UI ─────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function statChips(h) {
    var s = h.stats || {};
    return '<div class="dlc-stats">' +
      '<span>통 <b>' + s.leadership + '</b></span>' +
      '<span>무 <b>' + s.war + '</b></span>' +
      '<span>지 <b>' + s.intel + '</b></span>' +
      '<span>정 <b>' + s.politics + '</b></span>' +
      '<span>매 <b>' + s.charm + '</b></span></div>';
  }
  function cardHTML(h) {
    var owned = isUnlocked(h.productId);
    var u = h.ultimate || {};
    var price = (h.price || 2900).toLocaleString('ko-KR');
    return '<div class="dlc-card' + (owned ? ' owned' : '') + '" data-id="' + h.id + '">' +
      '<div class="dlc-port tf tier-' + (h.tier || 'S') + '"><img src="' + SK.ptSrc(h.portrait) + '" alt="' + esc(h.name) + '"></div>' +
      '<div class="dlc-body">' +
        '<div class="dlc-top"><b class="dlc-name">' + esc(h.name) + '</b>' +
          '<em class="dlc-tier">' + (h.tier || 'S') + '</em>' +
          '<em class="dlc-job">' + esc(h.title) + '</em>' +
          (owned ? '<em class="dlc-own">보유</em>' : '') + '</div>' +
        '<p class="dlc-one">' + esc((h.classDef || {}).role || '') + ' · 이동 ' + ((h.classDef || {}).mov || 4) + ' · 사거리 ' + ((h.classDef || {}).rng || 1) + '</p>' +
        statChips(h) +
        '<p class="dlc-ult"><b>「' + esc(u.n || '') + '」</b> ' + esc(u.desc || '') + '</p>' +
        '<div class="dlc-acts">' +
          (owned
            ? '<button class="dlc-buy ok" data-act="detail">출진 준비 완료 · 상세</button>'
            : '<button class="dlc-buy" data-act="buy" data-prod="' + h.productId + '">' + price + '원 구매</button>') +
          '<label class="dlc-sw" title="웹 테스트용 — 이 기기에서만 해금"><input type="checkbox" data-act="test" data-prod="' + h.productId + '"' + (owned ? ' checked' : '') + '><i></i><span>테스트 해금</span></label>' +
        '</div>' +
      '</div></div>';
  }
  function shopInner() {
    var d = data || {};
    var eps = epList().map(function (e) { return epShort(e.n); }).join('·');
    return '<div class="dlc-head"><b>✨ 이세계 특전 영웅 · ' + esc(eps) + '</b>' +
      '<span>묶음 없이 1인 단품 판매 — 각 ' + ((d.priceKRW || 2900).toLocaleString('ko-KR')) + '원 · 총 ' + heroList().length + '명</span>' +
      '<em>본편 주점·도감과 분리된 유료 특전 영웅입니다. 능력치는 본편 S급 최상위권과 동급이고, 고유 직업·고유 필살기·고유 외형으로만 차별화합니다.</em></div>' +
      filterHTML() + heroCardsHTML() +
      '<p class="dlc-foot">특전 영웅 30명 완결 — 1탄(1~10) · 2탄(11~20) · 3탄(21~30). 해금한 영웅은 본성 로스터에 합류해 출진·전투·고유 필살기를 그대로 쓸 수 있습니다.</p>';
  }
  function shopBody() { return '<div class="dlc-shop">' + shopInnerHTML() + '</div>'; }

  /* ── v6.9a — 2번째 탭 『편의·후원』 ── */
  function goodsCardHTML(g) {
    var owned = isUnlocked(g.productId);
    var price = (g.price || 0).toLocaleString('ko-KR');
    var btn;
    if (owned) {
      btn = g.kind === 'supporter'
        ? '<button class="dlc-buy done" type="button" disabled>감사합니다!</button>'
        : (g.kind === 'pack'
          ? '<button class="dlc-buy ok" type="button" disabled>보유 중 — [새로 시작] → 한반도 대난투</button>'
          : '<button class="dlc-buy ok" type="button" disabled>보유 중 — 지도·성 화면 ⚡</button>');
    } else {
      btn = '<button class="dlc-buy" type="button" data-act="buy" data-prod="' + g.productId + '">' + price + '원 구매</button>';
    }
    return '<div class="dlc-card goods ' + g.kind + (owned ? ' owned' : '') + '" data-prod="' + g.productId + '">' +
      '<div class="goods-ic" aria-hidden="true">' + g.ic + '</div>' +
      '<div class="dlc-body">' +
        '<div class="dlc-top"><b class="dlc-name">' + esc(g.name) + '</b>' +
          '<em class="dlc-job">' + esc(g.tag) + '</em>' +
          (owned ? '<em class="dlc-own">' + (g.kind === 'supporter' ? '후원 완료' : '보유') + '</em>' : '') + '</div>' +
        '<p class="dlc-one">' + esc(g.one) + '</p>' +
        '<ul class="goods-list">' + g.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
        '<div class="dlc-acts">' + btn +
          '<label class="dlc-sw" title="웹 테스트용 — 이 기기에서만 해금"><input type="checkbox" data-act="test" data-prod="' + g.productId + '"' + (owned ? ' checked' : '') + '><i></i><span>테스트 해금</span></label>' +
        '</div>' +
        '<p class="goods-foot">' + esc(g.foot) + ' · Billing ID <code>' + esc(g.productId) + '</code></p>' +
      '</div></div>';
  }
  function goodsInner() {
    return '<div class="dlc-head dlc-head-goods"><b>🎁 편의·후원</b>' +
      '<span>한 번 결제 · 계정에 바로 적용</span>' +
      '<em>게임을 편하게 만드는 편의 상품과 개발자를 응원하는 후원 상품입니다. 특전 영웅과 같이 Google Play Billing 상품 ID로 연결되어 있으며, 본편 밸런스(능력치·전투)는 건드리지 않습니다.</em></div>' +
      GOODS.map(goodsCardHTML).join('') +
      '<p class="dlc-foot">결제는 앱(안드로이드)의 Google Play 결제로 열립니다. 웹에서는 카드 아래 <b>테스트 해금</b> 스위치로 먼저 확인할 수 있습니다.</p>';
  }

  /* 상점 탭 · 판 — 한 번에 다시 그린다 */
  var shopTab = 'hero';
  function ownedHeroN() {
    return readUnlocked().filter(function (p) { return !!byProduct[p]; }).length;
  }
  /* ── v6.10b — 탄 구분과 필터 / v6.10c — 3탄까지(전체 0/30) ───────────
     영웅마다 data 의 ep(1·2·3) 를 읽는다. ep 가 없으면 11번째부터 2탄으로 본다.
     필터 칩은 [전체 0/30] [1탄 0/10] [2탄 0/10] [3탄 0/10] 으로 보유 수를 같이 보여 준다. */
  var epFilter = 'all';
  function epList() {
    if (data && data.episodes && data.episodes.length) return data.episodes;
    return [{ n: 1, title: (data && data.episodeTitle) || '1탄', range: '1~10번' },
      { n: 2, title: '2탄 — 신화와 명장', range: '11~20번' }];
  }
  function epOf(h) {
    if (!h) return 1;
    if (h.ep) return Number(h.ep);
    return heroList().indexOf(h) >= 10 ? 2 : 1;
  }
  function epEntry(n) {
    return epList().filter(function (x) { return Number(x.n) === Number(n); })[0] || null;
  }
  function epShort(n) {
    var e = epEntry(n);
    if (!e) return String(n) + '탄';
    return String(e.title || '').split(' — ')[0] || (n + '탄');
  }
  function epTitleOf(n) {
    var e = epEntry(n);
    return e ? (e.title || epShort(n)) : (n + '탄');
  }
  function epHeroes(n) { return heroList().filter(function (h) { return epOf(h) === Number(n); }); }
  function epOwned(n) { return epHeroes(n).filter(function (h) { return isUnlocked(h.productId); }).length; }
  function filterHTML() {
    var chip = function (key, label, own, all) {
      var on = epFilter === key;
      return '<button type="button" class="dlc-fchip' + (on ? ' on' : '') + '" data-f="' + key + '" role="tab" aria-selected="' + on + '">' +
        '<b>' + esc(label) + '</b><span>' + own + '/' + all + '</span></button>';
    };
    return '<div class="dlc-filters" role="tablist" aria-label="탄 선택">' +
      chip('all', '전체', ownedHeroN(), heroList().length) +
      epList().map(function (e) { return chip(String(e.n), epShort(e.n), epOwned(e.n), epHeroes(e.n).length); }).join('') +
      '</div>';
  }
  function heroCardsHTML() {
    if (epFilter === 'all') {
      return epList().map(function (e) {
        var list = epHeroes(e.n);
        if (!list.length) return '';
        return '<div class="dlc-ep-h"><b>' + esc(epTitleOf(e.n)) + '</b>' +
          '<span>' + esc(e.range || '') + ' · ' + epOwned(e.n) + '/' + list.length + ' 보유</span></div>' +
          list.map(cardHTML).join('');
      }).join('');
    }
    return epHeroes(Number(epFilter)).map(cardHTML).join('');
  }
  function ownedGoodsN() {
    return GOODS.filter(function (g) { return isUnlocked(g.productId); }).length;
  }
  function tabsHTML() {
    var hero = shopTab !== 'goods';
    return '<div class="dlc-tabs" role="tablist" aria-label="상점 탭">' +
      '<button type="button" class="dlc-tab' + (hero ? ' on' : '') + '" data-tab="hero" role="tab" aria-selected="' + hero + '">✨ 특전 영웅 <b>' + ownedHeroN() + '/' + heroList().length + '</b></button>' +
      '<button type="button" class="dlc-tab' + (!hero ? ' on' : '') + '" data-tab="goods" role="tab" aria-selected="' + (!hero) + '">🎁 편의·후원 <b>' + ownedGoodsN() + '/' + GOODS.length + '</b></button>' +
      '</div>';
  }
  function panesHTML() {
    var hero = shopTab !== 'goods';
    return '<div class="dlc-pane" data-pane="hero"' + (hero ? '' : ' hidden') + '>' + shopInner() + '</div>' +
      '<div class="dlc-pane" data-pane="goods"' + (hero ? ' hidden' : '') + '>' + goodsInner() + '</div>';
  }
  function shopInnerHTML() { return tabsHTML() + panesHTML(); }
  function kickerText() {
    return '상점 · 특전 ' + ownedHeroN() + '/' + heroList().length + ' · 편의·후원 ' + ownedGoodsN() + '/' + GOODS.length;
  }
  function detailBody(h) {
    var u = h.ultimate || {};
    var cd = h.classDef || {};
    var owned = isUnlocked(h.productId);
    var skills = (h.skills || []).map(function (s) {
      return '<li><b>' + esc(s.name) + '</b> <i>MP ' + s.mp + '</i><span>' + esc(s.desc || '') + '</span></li>';
    }).join('');
    return '<div class="dlc-detail">' +
      '<div class="dd-top"><div class="dlc-port tf tier-' + (h.tier || 'S') + '"><img src="' + SK.ptSrc(h.portrait) + '" alt=""></div>' +
        '<div><b>' + esc(h.name) + '</b><em>' + esc(epShort(epOf(h))) + ' · ' + esc(h.title) + ' · ' + (h.tier || 'S') + '급</em>' +
        '<p class="dd-desc">' + esc(h.desc) + '</p></div></div>' +
      statChips(h) +
      '<p class="dd-line">고유 직업 <b>' + esc(cd.role || '') + '</b> — ' + esc(cd.desc || '') + '</p>' +
      '<p class="dd-line">이동 <b>' + cd.mov + '</b> · 사거리 <b>' + cd.rng + '</b> · 공 <b>' + cd.atk + '</b> · 방 <b>' + cd.def + '</b> · 책략 <b>' + cd.mp + '</b></p>' +
      '<div class="dd-sec">고유 책략</div><ul class="dd-skills">' + skills + '</ul>' +
      '<div class="dd-sec">고유 필살기</div>' +
      '<div class="dd-ult"><b>「' + esc(u.n || '') + '」</b><span>' + esc(u.desc || '') + '</span>' +
      (u.q ? '<em>“' + esc(u.q) + '”</em>' : '') + '</div>' +
      '<div class="dlc-acts">' +
        (owned ? '<button class="dlc-buy ok" data-act="join">본성에 합류</button>'
          : '<button class="dlc-buy" data-act="buy" data-prod="' + h.productId + '">' + (h.price || 2900).toLocaleString('ko-KR') + '원 구매</button>') +
        '<label class="dlc-sw"><input type="checkbox" data-act="test" data-prod="' + h.productId + '"' + (owned ? ' checked' : '') + '><i></i><span>테스트 해금</span></label>' +
      '</div></div>';
  }
  function bindCardActions(root, modal) {
    root.querySelectorAll('[data-act]').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (act === 'test') {
        el.onchange = function () {
          var pid = el.getAttribute('data-prod');
          setTestMode(true);
          if (byProduct[pid]) {
            if (el.checked) unlock(pid);
            else if (!lock(pid)) { el.checked = true; return; }
          } else if (el.checked) {
            grantGoods(pid);
          } else {
            revokeGoods(pid);
          }
          refreshShop(modal);
        };
      } else if (act === 'buy') {
        el.onclick = function () {
          var pid = el.getAttribute('data-prod');
          var r = Billing.purchase(pid);
          if (r === 'unavailable') {
            SK.modal({
              kicker: '결제 안내', title: '지금은 테스트 해금으로 확인하세요',
              body: '<p class="modal-p">Google Play 결제는 앱(안드로이드)에서만 열립니다. 상품 ID <b>' + esc(pid) + '</b> 는 이미 연결되어 있어, 스토어에 올리면 그대로 결제됩니다.</p>' +
                '<p class="modal-sub">웹 테스트에서는 카드 오른쪽 <b>테스트 해금</b> 스위치로 켜고 출진·전투·필살기를 확인할 수 있습니다.</p>',
              actions: [{ label: '닫기' }],
            });
          }
        };
      } else if (act === 'detail') {
        el.onclick = function () {
          var card = el.closest('.dlc-card');
          var h = heroOf(card && card.getAttribute('data-id'));
          if (h) openDetail(h);
        };
      } else if (act === 'join') {
        el.onclick = function () {
          var card = el.closest('.dlc-detail');
          var h = byId[card && card.getAttribute('data-id')];
          if (!h) h = heroOf(el.getAttribute('data-id'));
          if (h) { unlock(h.productId); SK.toast(h.name + ' — 본성 로스터에 있습니다.'); }
        };
      }
    });
    root.querySelectorAll('.dlc-card').forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.closest('[data-act]') || e.target.closest('.dlc-sw')) return;
        var h = heroOf(card.getAttribute('data-id'));
        if (h) openDetail(h);
      };
    });
  }
  function refreshShop(modal) {
    if (!modal || !modal.el) return;
    var shop = modal.el.querySelector('.modal-body .dlc-shop');
    if (!shop) return;
    shop.innerHTML = shopInnerHTML();
    bindShop(shop, modal);
    var kick = modal.el.querySelector('.modal-kicker');
    if (kick) kick.textContent = kickerText();
    /* 탄 필터를 바꾸면 목록 처음부터 (30명이라 스크롤이 깊다) */
    var body = modal.el.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
  }
  /* 탭 + 탄 필터 + 카드 액션을 함께 묶는다 */
  function bindShop(root, modal) {
    if (!root) return;
    root.querySelectorAll('.dlc-tab').forEach(function (b) {
      b.onclick = function () {
        shopTab = b.getAttribute('data-tab') === 'goods' ? 'goods' : 'hero';
        refreshShop(modal);
      };
    });
    root.querySelectorAll('.dlc-fchip').forEach(function (b) {
      b.onclick = function () {
        epFilter = b.getAttribute('data-f') || 'all';
        refreshShop(modal);
      };
    });
    bindCardActions(root, modal);
  }
  function openDetail(h) {
    var m = SK.modal({
      kicker: h.name + ' · ' + h.title,
      title: '특전 영웅 상세',
      body: detailBody(h),
      wide: true,
      actions: [{ label: '닫기' }],
      dismissible: true,
    });
    var root = m.el.querySelector('.dlc-detail');
    if (root) {
      root.setAttribute('data-id', h.id);
      root.querySelectorAll('[data-act]').forEach(function (el) {
        var act = el.getAttribute('data-act');
        if (act === 'test') {
          el.onchange = function () {
            var pid = el.getAttribute('data-prod');
            setTestMode(true);
            if (el.checked) unlock(pid); else lock(pid);
            m.close();
            openShop();
          };
          el.onclick = function (e) { e.stopPropagation(); };
        } else if (act === 'buy') {
          el.onclick = function () { Billing.purchase(el.getAttribute('data-prod')); };
        } else if (act === 'join') {
          el.onclick = function () { if (!findHero(h.id)) unlock(h.productId, { silent: true }); join(h.id); m.close(); };
        }
      });
    }
  }
  function openShop() {
    if (!isDlcOpen()) return null;
    /* 이미 열려 있으면 겹쳐 열지 않는다 (지도 진입 자동 오픈 + 사용자 탭) */
    var opened0 = document.querySelector('#modal-root .modal-layer .dlc-shop');
    if (opened0) {
      var layer0 = opened0.closest('.modal-layer');
      if (layer0) { layer0.scrollTop = 0; return null; }
    }
    if (!data) {
      load().then(function (ok) { if (ok) openShop(); });
      return null;
    }
    var m = SK.modal({
      kicker: kickerText(),
      title: '✨ 이세계 상점',
      body: shopBody(),
      wide: true,
      scrollHint: true,
      actions: [{ label: '닫기' }],
      dismissible: true,
    });
    bindShop(m.el.querySelector('.dlc-shop') || m.el, m);
    return m;
  }

  /* ─────────────────────────── 지도 진입 버튼 ─────────────────────────── */
  function syncPill() {
    var b = document.getElementById('btn-dlc-pill');
    var open = isDlcOpen();
    if (b) {
      if (!open) { b.hidden = true; }
      else {
        b.hidden = false;
        var n = readUnlocked().length;
        var cnt = b.querySelector('.mp-n');
        if (cnt) cnt.textContent = n;
        b.title = '이세계 상점 — 특전 ' + ownedHeroN() + ' / ' + heroList().length + ' · 편의·후원 ' + ownedGoodsN() + ' / ' + GOODS.length;
      }
    }
    syncAutoPill();
  }
  function bindPill() {
    var b = document.getElementById('btn-dlc-pill');
    if (!b || b._dlcBound) return;
    b._dlcBound = true;
    b.onclick = function () { openShop(); };
    syncPill();
  }
  function bindMenu() {
    /* 메뉴(☰) 버튼은 app.js 내부 함수를 직접 물고 있다 — 우리가 한 번 감싼 메뉴로 다시 연결한다 */
    var btn = document.getElementById('btn-map-menu');
    if (!btn || btn._dlcBound || !SK.openMenu) return;
    btn._dlcBound = true;
    var orig = SK.openMenu;
    SK.openMenu = function () {
      orig.apply(SK, arguments);
      if (!isDlcOpen()) return;
      var layers = document.querySelectorAll('#modal-root .modal-layer');
      var last = layers[layers.length - 1];
      var list = last && last.querySelector('.menu-list');
      if (!list || list.querySelector('[data-m="dlc"]')) return;
      var b = document.createElement('button');
      b.setAttribute('data-m', 'dlc');
      b.className = 'menu-dlc';
      b.innerHTML = '✨ 이세계 특전 영웅 — 상점 (보유 ' + readUnlocked().length + ')';
      b.onclick = function () {
        var top = (SK.modalStack || [])[SK.modalStack.length - 1];
        if (top && top.close) top.close();
        setTimeout(openShop, 240);
      };
      list.appendChild(b);
    };
    btn.onclick = function () { SK.openMenu(); };
  }

  /* ─────────────────────────── 『자동 내정 패스』 버튼 ───────────────────────────
     해금한 계정에만 지도 pill 과 성 화면 띠 버튼을 보인다. 미해금·일반 유저에게는 hidden. */
  function hasPass(pid) { return isUnlocked(pid || 'pass_auto_city'); }
  /* v6.14 — 한국 패키지 보유 여부 (한반도 캠페인 잠금 해제) */
  function hasPack(pid) { return isUnlocked(pid || 'pack_korea'); }
  function syncAutoPill() {
    var on = hasPass('pass_auto_city');
    var pill = document.getElementById('btn-auto-city');
    var bar = document.getElementById('btn-auto-city-city');
    if (pill) {
      pill.hidden = !on;
      /* 특전 pill 이 보이면 그 위로, 아니면 한 칸 내려서 (겹침 없이) */
      var dp = document.getElementById('btn-dlc-pill');
      pill.style.bottom = (dp && !dp.hidden) ? 'calc(116px + env(safe-area-inset-bottom))' : 'calc(80px + env(safe-area-inset-bottom))';
    }
    if (bar) bar.hidden = !on;
  }
  function runAutoCityAll() {
    if (!hasPass('pass_auto_city')) {
      if (SK.toast) SK.toast('『자동 내정 패스』를 보유해야 쓸 수 있습니다. 상점 [🎁 편의·후원]에서 확인하세요.');
      return null;
    }
    if (!SK.openAutoCityAll) return null;
    if (SK.sfx) { try { SK.sfx.play('ui'); } catch (e) { /* ignore */ } }
    return SK.openAutoCityAll();
  }
  function bindPassButtons() {
    ['btn-auto-city', 'btn-auto-city-city'].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b || b._autoCityBound) return;
      b._autoCityBound = true;
      b.onclick = function () { runAutoCityAll(); };
    });
    syncAutoPill();
  }

  /* ─────────────────────────── 바깥 연결 ─────────────────────────── */
  SK.DLC = {
    PUBLIC: DLC_PUBLIC,
    isOpen: isDlcOpen,
    setTestMode: setTestMode,
    heroes: heroList,
    heroOf: heroOf,
    byProduct: function (pid) { return byProduct[pid] || null; },
    productIds: function () { return heroList().map(function (h) { return h.productId; }); },
    unlocked: readUnlocked,
    isUnlocked: isUnlocked,
    unlock: unlock,
    lock: lock,
    join: join,
    ensureRoster: ensureRoster,
    findHero: findHero,
    load: load,
    ensureRegistered: ensureRegistered,
    open: openShop,
    openShop: openShop,
    priceOf: function (pid) { return Billing.priceLabel(pid); },
    /* v6.9a — 편의·후원 */
    GOODS: GOODS,
    goods: function () { return GOODS.slice(); },
    goodsOf: goodsOf,
    hasPass: hasPass,
    hasPack: hasPack,
    hasKorea: function () { return hasPack('pack_korea'); },
    isSupporter: function () { return isUnlocked('pack_supporter_once'); },
    grantGoods: grantGoods,
    revokeGoods: revokeGoods,
    ensureSupporter: ensureSupporter,
    autoCity: runAutoCityAll,
    syncAutoPill: syncAutoPill,
    chibiOf: function (id) { var h = byId[id]; return (h && h.chibi) || null; },
    badgeOf: function (cls) {
      var h = heroList().find(function (x) { return x.cls === cls; });
      return (h && h.chibi && h.chibi.badge) || null;
    },
    lootMul: function (cls) { var C = SK.CLASSES[cls]; return (C && C.loot) || 0; },
    debug: {
      unlockAll: function () { heroList().forEach(function (h) { unlock(h.productId, { silent: true }); }); SK.toast('특전 영웅 ' + heroList().length + '명 테스트 해금'); },
      lockAll: function () { heroList().slice().reverse().forEach(function (h) { lock(h.productId, { silent: true }); }); SK.toast('특전 영웅 전체 잠금'); },
      /* v6.9a — 편의·후원 검수용 */
      passOn: function () { grantGoods('pass_auto_city'); },
      passOff: function () { revokeGoods('pass_auto_city'); },
      supporterOn: function () { grantGoods('pack_supporter_once'); },
      supporterOff: function () { revokeGoods('pack_supporter_once'); },
      autoCity: function () { return runAutoCityAll(); },
      /* v6.12 — 세이브 슬롯 검수용 */
      saveSlotOn: function (n) { return grantGoods('save_slot_' + n); },
      saveSlotOff: function (n) { return revokeGoods('save_slot_' + n); },
      /* v6.14 — 한국 패키지 검수용 */
      packOn: function () { return grantGoods('pack_korea'); },
      packOff: function () { return revokeGoods('pack_korea'); },
    },
  };
  SK.DlcBilling = Billing;

  /* 본편 데이터 로딩(ensureData)에 특전 영웅 데이터를 끼워 넣는다 */
  function hookEnsureData() {
    if (!SK.ensureData || SK.ensureData._dlcHooked) return;
    var orig = SK.ensureData;
    var wrapped = function () {
      return Promise.resolve(orig.apply(SK, arguments)).then(function (v) {
        return ensureRegistered().then(function () { return v; });
      });
    };
    wrapped._dlcHooked = true;
    SK.ensureData = wrapped;
  }
  /* 지도에 들어올 때마다 해금된 특전 영웅·상품 상태를 맞춘다 */
  function hookShowMap() {
    if (!SK.showMap || SK.showMap._dlcHooked) return;
    var orig = SK.showMap;
    var wrapped = function () {
      var r = orig.apply(SK, arguments);
      try {
        if (SK.state) {
          if (heroList().length) ensureRoster({ silent: true });
          ensureSupporter({ silent: false });   /* 응원 팩 — 현재 세력에 아직 안 받았으면 1회 지급 */
          syncPill();
          bindPassButtons();
          if (hasParam() && !autoOpened) { autoOpened = true; setTimeout(openShop, 700); }
        }
      } catch (e) { console.warn('DLC 로스터·상품 확인 실패', e); }
      return r;
    };
    wrapped._dlcHooked = true;
    SK.showMap = wrapped;
  }

  function boot() {
    hookEnsureData();
    hookShowMap();
    bindPill();
    bindMenu();
    bindPassButtons();
    /* 표지에서 미리 받아 두어 게임 시작이 기다리지 않게 한다 */
    load().then(function () { syncPill(); ensureSupporter({ silent: true }); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 40); });
  } else {
    setTimeout(boot, 0);
  }
})();
