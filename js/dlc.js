/* ═══════════════════════════════════════════════════════════════════════
   js/dlc.js — 《이세계 특전 영웅》 DLC (1탄: dlc_01 ~ dlc_10)
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
      'poison', 'morale', 'ignoreTerrain', 'siegeBonus'].forEach(function (k) {
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
    SK.TB[h.cls] = SK.TB[h.cls] || { siege: 0, naval: 0, mountain: 0, fortress: 0 };
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
    priceLabel: function (productId) {
      var h = byProduct[productId];
      var p = (h && h.price) || (data && data.priceKRW) || 2900;
      return p.toLocaleString('ko-KR') + '원';
    },
    isPurchased: function (productId) { return isUnlocked(productId); },
    /* 결제 요청 — 네이티브 브리지로 넘긴다. 성공·실패는 onPurchaseSuccess/Fail 로 돌아온다. */
    purchase: function (productId) {
      var h = byProduct[productId];
      if (!h) return 'unknown';
      if (isUnlocked(productId)) { unlock(productId); return 'already'; }
      var b = bridge();
      if (!b) return 'unavailable';
      try {
        b.purchase(productId);
        if (SK.toast) SK.toast('결제 창을 엽니다 — ' + h.name);
        return 'pending';
      } catch (e) {
        console.warn('Billing bridge 실패', e);
        return 'error';
      }
    },
    onPurchaseSuccess: function (productId) {
      var h = byProduct[productId];
      if (!h) return false;
      unlock(productId, { silent: true });
      if (SK.toast) SK.toast('『' + h.name + '』 해금 완료 — 본성 로스터에 합류했습니다.');
      if (SK.sfx) { try { SK.sfx.play('victory'); } catch (e) { /* ignore */ } }
      return true;
    },
    onPurchaseFail: function (productId, reason) {
      var h = byProduct[productId];
      if (SK.toast) SK.toast(((h && h.name) || '특전 영웅') + ' 결제가 취소되었거나 실패했습니다' + (reason ? ' — ' + reason : ''));
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
    return '<div class="dlc-head"><b>✨ 이세계 특전 영웅 · ' + esc(d.episodeTitle || '1탄') + '</b>' +
      '<span>묶음 없이 1인 단품 판매 — 각 ' + ((d.priceKRW || 2900).toLocaleString('ko-KR')) + '원</span>' +
      '<em>본편 주점·도감과 분리된 유료 특전 영웅입니다. 능력치는 본편 S급 최상위권과 동급이고, 고유 직업·고유 필살기·고유 외형으로만 차별화합니다.</em></div>' +
      heroList().map(cardHTML).join('') +
      '<p class="dlc-foot">2탄(11~20)과 3탄(21~30)은 후속 업데이트로 이어집니다. 해금한 영웅은 본성 로스터에 합류해 출진·전투·고유 필살기를 그대로 쓸 수 있습니다.</p>';
  }
  function shopBody() { return '<div class="dlc-shop">' + shopInner() + '</div>'; }
  function detailBody(h) {
    var u = h.ultimate || {};
    var cd = h.classDef || {};
    var owned = isUnlocked(h.productId);
    var skills = (h.skills || []).map(function (s) {
      return '<li><b>' + esc(s.name) + '</b> <i>MP ' + s.mp + '</i><span>' + esc(s.desc || '') + '</span></li>';
    }).join('');
    return '<div class="dlc-detail">' +
      '<div class="dd-top"><div class="dlc-port tf tier-' + (h.tier || 'S') + '"><img src="' + SK.ptSrc(h.portrait) + '" alt=""></div>' +
        '<div><b>' + esc(h.name) + '</b><em>' + esc(h.title) + ' · ' + (h.tier || 'S') + '급</em>' +
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
          if (el.checked) {
            unlock(pid);
          } else if (!lock(pid)) {
            el.checked = true;
            return;
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
    shop.innerHTML = shopInner();
    bindCardActions(shop, modal);
    var kick = modal.el.querySelector('.modal-kicker');
    if (kick) kick.textContent = '특전 영웅 · 보유 ' + readUnlocked().length + ' / ' + heroList().length;
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
      kicker: '특전 영웅 · 보유 ' + readUnlocked().length + ' / ' + heroList().length,
      title: '✨ 이세계 특전 영웅',
      body: shopBody(),
      wide: true,
      scrollHint: true,
      actions: [{ label: '닫기' }],
      dismissible: true,
    });
    bindCardActions(m.el.querySelector('.dlc-shop') || m.el, m);
    return m;
  }

  /* ─────────────────────────── 지도 진입 버튼 ─────────────────────────── */
  function syncPill() {
    var b = document.getElementById('btn-dlc-pill');
    if (!b) return;
    if (!isDlcOpen()) { b.hidden = true; return; }
    b.hidden = false;
    var n = readUnlocked().length;
    var cnt = b.querySelector('.mp-n');
    if (cnt) cnt.textContent = n;
    b.title = '이세계 특전 영웅 상점 — 보유 ' + n + ' / ' + heroList().length;
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
    chibiOf: function (id) { var h = byId[id]; return (h && h.chibi) || null; },
    badgeOf: function (cls) {
      var h = heroList().find(function (x) { return x.cls === cls; });
      return (h && h.chibi && h.chibi.badge) || null;
    },
    lootMul: function (cls) { var C = SK.CLASSES[cls]; return (C && C.loot) || 0; },
    debug: {
      unlockAll: function () { heroList().forEach(function (h) { unlock(h.productId, { silent: true }); }); SK.toast('특전 영웅 10명 테스트 해금'); },
      lockAll: function () { heroList().slice().reverse().forEach(function (h) { lock(h.productId, { silent: true }); }); SK.toast('특전 영웅 전체 잠금'); },
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
  /* 지도에 들어올 때마다 해금된 특전 영웅이 로스터에 있는지 확인한다 */
  function hookShowMap() {
    if (!SK.showMap || SK.showMap._dlcHooked) return;
    var orig = SK.showMap;
    var wrapped = function () {
      var r = orig.apply(SK, arguments);
      try {
        if (SK.state && heroList().length) {
          ensureRoster({ silent: true });
          syncPill();
          if (hasParam() && !autoOpened) { autoOpened = true; setTimeout(openShop, 700); }
        }
      } catch (e) { console.warn('DLC 로스터 확인 실패', e); }
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
    /* 표지에서 미리 받아 두어 게임 시작이 기다리지 않게 한다 */
    load().then(function () { syncPill(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 40); });
  } else {
    setTimeout(boot, 0);
  }
})();
