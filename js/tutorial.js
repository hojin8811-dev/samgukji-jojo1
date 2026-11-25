/* =====================================================================
 * 《삼국지-꼬마영웅 난타전》 v5.98 — 🎓 3분 입문 튜토리얼 (js/tutorial.js)
 *
 *  표지 [새로 시작] 바로 위 [🎓 튜토리얼] 버튼으로 들어오는 1:1 입문 모드.
 *  · 진류(아군, 조조·하후돈·곽가 · 병력 8,000 · 금 1,000 · 군량 3,000)
 *    ↔ 허창(재야 수비병 1,200) 두 거점만 쓰는 작은 판.
 *  · 4단계 고정 미션 배너
 *      1) 공터에 시장 건설 → 장수 1명 담당
 *      2) [다음 달]로 월정산 확인
 *      3) [군사 → 출진]에서 장수 3명 + 포차대 1부대 → [출진!]
 *      4) 전장에서 이동·공격 → 필살기/자동·×3배속 → 승리
 *  · v6.4 — 안내 문구를 최신 본편에 맞춰 다듬었다: 전략 지형(고지대·갈대밭·군량고),
 *      기술 연구, 조조전식 격자 전장. 흐름(4단계)과 본편 세이브 분리 규칙은 그대로.
 *  · 본편 세이브(SAVE_KEY 'samgukji-jojo-v4-save')와 완전히 분리:
 *      - 튜토리얼 중 SK.save()는 전용 키(sk_tutorial_v598)로만 적는다
 *      - 전투 이탈 복구 스냅샷(SNAP_KEY)도 건드리지 않고, 시작 전 값을 되돌려 놓는다
 *      - 나가면 SK.state를 본편 상태로 되돌린다
 *  · 언제든 [튜토리얼 나가기]로 표지로 돌아갈 수 있다.
 * ===================================================================== */
(function (g) {
  'use strict';
  var SK = g.SK || (g.SK = {});

  var TKEY = 'sk_tutorial_v598';            // 튜토리얼 전용 저장 (본편과 분리)
  var SNAP_KEY = 'samgukji-jojo-battle-snap-v1';
  var HOME = 'chenliu';                     // 진류 (아군)
  var FOE = 'xuchang';                      // 허창 (재야)
  var HEROES = ['조조', '하후돈', '곽가'];
  var FOE_TROOPS = 1200;

  var T = {
    active: false, step: 0, sub: '', prevState: null, prevSnap: null,
    timer: 0, inBattle: false, won: false, hint: '',
  };

  var STEPS = {
    1: { tag: '미션 1/4 · 내정', text: '진류의 <b>공터(＋)</b>를 눌러 <b>시장</b>을 짓고, 장수 1명을 <b>담당</b>으로 앉히세요' },
    2: { tag: '미션 2/4 · 월정산', text: '<b>[다음 달]</b>을 눌러 한 달을 보내고 <b>월정산 요약</b>(세수·군량·건물)을 확인하세요' },
    3: { tag: '미션 3/4 · 출진 편성', text: '<b>[군사] → [출진]</b>에서 장수 3명 + <b>포차대</b> 1부대를 넣고 <b>[출진!]</b> — 조조전식 격자 전장이 열립니다' },
    4: { tag: '미션 4/4 · 실전', text: '부대를 눌러 <b>파란 칸으로 이동</b> → <b>붉게 빛나는 적</b>을 공격 (지형·사거리 확인)' },
  };

  /* ───────────── 저장 분리 ───────────── */
  var saveHooked = false;
  function hookSave() {
    if (saveHooked || typeof SK.save !== 'function') return;
    saveHooked = true;
    var orig = SK.save;
    SK.save = function () {
      if (T.active) {
        /* 튜토리얼 중에는 본편 SAVE_KEY를 절대 쓰지 않는다 */
        try { localStorage.setItem(TKEY, JSON.stringify(SK.state)); } catch (e) { /* ignore */ }
        return;
      }
      return orig.apply(this, arguments);
    };
  }
  hookSave();

  /* 허창은 대도시(3중 성벽)지만, 입문에서는 1중 성벽의 작은 전장으로 연다 */
  var ringsHooked = false;
  function hookRings() {
    if (ringsHooked || typeof SK.siegeRingsOfCity !== 'function') return;
    ringsHooked = true;
    var orig = SK.siegeRingsOfCity;
    SK.siegeRingsOfCity = function (city) {
      if (T.active && city && city.id === FOE) return 1;
      return orig.apply(this, arguments);
    };
  }
  hookRings();

  /* ───────────── 상태 만들기 ───────────── */
  function buildState() {
    /* 조조군 한 세력 · 진류 한 성만 있는 작은 시나리오로 상태를 만든다.
       (다른 80거점은 전부 재야로 남고, 튜토리얼 동안 지도에 쓰지 않는다) */
    var sc = {
      id: 900, year: 190, title: '3분 입문',
      factions: [{
        id: 'caocao', name: '조조군', leader: '조조', capital: '진류',
        cities: ['진류'], generals: HEROES.slice(),
      }],
    };
    var st = SK.newState(sc, 'caocao');
    st.tutorial = 1;
    st.tutorialStep = 1;
    st.difficulty = 'normal';
    st.fame = 0; st.turn = 1; st.month = 0; st.year = 1; st.eraYear = 190;
    st.marches = []; st.marchSeq = 0; st.pendingMarch = null;
    st.pendingInvasion = null; st.invasionWarn = null; st.invasionWarns = []; st.invasionQueue = [];
    st.fallQueue = []; st.aiNews = []; st.buildLog = []; st.transitQueue = []; st.corps = [];
    st.truce = {}; st.pacts = {}; st.prisoners = []; st.captured = [];
    st.playerCapital = HOME; st.lastCity = HOME; st.purseCity = HOME;

    /* 세력 정보 — 진류 한 곳 */
    var fac = st.factions.caocao = st.factions.caocao || {};
    fac.id = 'caocao'; fac.cities = [HOME]; fac.capital = HOME;
    if (!fac.name) fac.name = '조조군';
    if (!fac.lord) fac.lord = '조조';

    /* 다른 거점은 전부 재야 · 얇은 수비 (튜토리얼에서는 열지 않는다) */
    SK.CITY_LIST.forEach(function (c) {
      if (c.id === HOME || c.id === FOE) return;
      var cs = st.cities[c.id];
      if (!cs) return;
      cs.owner = 'neutral'; cs.troops = 800; cs.genIds = []; cs.talents = [];
      cs.bandit = true; cs.def = Math.min(50, cs.def || 50);
    });

    /* 진류 — 아군 본성 (병력 8,000 · 금 1,000 · 군량 3,000) */
    var home = st.cities[HOME];
    home.owner = 'caocao'; home.troops = 8000; home.def = 60; home.train = 60;
    home.gold = 1000; home.food = 3000;
    home.loyalty = 70; home.order = 60; home.bandit = false; home.wounded = 0;
    home.genIds = []; home.advisor = null; home.governor = null; home.auto = false;
    home.talents = []; home.grandMerchant = 0; home.scoutedUntil = 0;
    /* 첫 수업이 '시장 짓기'가 되도록 진류의 시장 자리를 공터로 비워 둔다 */
    (home.slots || []).forEach(function (sl) {
      if (sl && sl.key === 'market') { sl.key = null; sl.lv = 0; sl.uid = null; sl.exp = 0; }
    });
    if (!(home.slots || []).some(function (sl) { return !sl.key; })) {
      home.slots.push({ key: null, lv: 0, uid: null, exp: 0 });
    }

    /* 허창 — 재야 수비병 1,200 */
    var foe = st.cities[FOE];
    foe.owner = 'neutral'; foe.troops = FOE_TROOPS; foe.def = 40; foe.train = 40;
    foe.gold = 200; foe.food = 300; foe.genIds = []; foe.bandit = true;
    foe.loyalty = 40; foe.order = 45; foe.talents = []; foe.wounded = 0;

    /* 장수는 조조·하후돈·곽가 셋만 */
    var seen = {};
    st.heroes = (st.heroes || []).filter(function (h) {
      if (!h || HEROES.indexOf(h.name) < 0 || seen[h.name]) return false;
      seen[h.name] = 1;
      h.city = HOME; h.actedThisMonth = false; h.transitTo = null; h.marchId = null;
      return true;
    });
    st.heroes.forEach(function (h) { if (h.hp == null) h.hp = 1; });

    SK.state = st;
    if (SK.installPurse) { try { SK.installPurse(st); } catch (e) { /* ignore */ } }
    T.inBattle = false; T.won = false;
    return st;
  }

  /* ───────────── 미션 배너 ───────────── */
  var banner = null;
  function ensureBanner() {
    if (banner && banner.parentNode) return banner;
    banner = document.createElement('div');
    banner.id = 'tut-mission';
    banner.className = 'tut-mission';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    /* #app 안에 두어야 모달(#modal-root z=50) 아래에 깔린다 (#app이 자체 스택 문맥) */
    (document.getElementById('app') || document.body).appendChild(banner);
    return banner;
  }
  /* 화면마다 실측한 하단 막대 위(전장은 상단 머리 아래)에 배너를 앉힌다.
     · 성·지도: 명령줄(.city-commands / .map-bottom) 바로 위
     · 전장: 아군 부대가 서는 아래쪽을 가리지 않게 상단 머리 바로 아래 한 줄 */
  function placeBanner(el) {
    el.classList.toggle('compact', document.body.classList.contains('tut-battle'));
    if (!el.style) return;
    if (document.body.classList.contains('tut-battle')) {
      var head = document.querySelector('.battle-top');
      el.style.top = ((head ? head.offsetHeight : 40) + 3) + 'px';
      el.style.bottom = 'auto';
      return;
    }
    el.style.top = 'auto';
    var bar = document.querySelector('#screen-city.active .city-commands') ||
      document.querySelector('#screen-map.active .map-bottom');
    el.style.bottom = ((bar ? bar.offsetHeight : 62) + 6) + 'px';
  }
  function hideBanner() { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null; }
  function stepText() {
    if (T.step === 1 && T.sub === 'assign') return '지은 <b>시장</b>을 눌러 장수 1명을 <b>담당</b>으로 앉히세요';
    if (T.step === 4 && T.inBattle) {
      var s = null;
      try { s = (g.SKBattle && g.SKBattle.debug && g.SKBattle.debug.state) ? g.SKBattle.debug.state() : null; } catch (e) { s = null; }
      var fought = !!(s && (s.allyDone > 0 || s.turn > 1));
      return fought
        ? '<b>[⚡필살기]</b> 또는 <b>[⟳자동]</b>을 누르고 <b>[×3 배속]</b>으로 마무리하세요 — <b>고지대</b>에 서면 사거리·명중이 유리합니다'
        : '부대를 눌러 <b>파란 칸으로 이동</b> → <b>붉은 테두리 적</b>을 공격하세요 — <b>갈대밭</b>에 숨으면 적의 사격을 피할 수 있습니다';
    }
    var st = STEPS[T.step] || STEPS[4];
    return st.text;
  }
  function render() {
    if (!T.active) { hideBanner(); return; }
    var el = ensureBanner();
    var st = STEPS[T.step] || STEPS[4];
    var html = '<div class="tm-top"><span class="tm-kicker">' + st.tag + '</span>' +
      '<button type="button" class="tm-exit">튜토리얼 나가기</button></div>' +
      '<p class="tm-text">' + stepText() + '</p>' +
      '<div class="tm-dots">' + [1, 2, 3, 4].map(function (n) {
        return '<i class="' + (n < T.step ? 'on' : (n === T.step ? 'cur' : '')) + '"></i>';
      }).join('') + '</div>';
    el.innerHTML = html;
    var x = el.querySelector('.tm-exit');
    if (x) x.onclick = askExit;
    placeBanner(el);
  }
  /* 화면이 돌아가거나 커졌을 때 배너 자리를 다시 잡는다 */
  if (g.addEventListener) {
    g.addEventListener('resize', function () { if (T.active && banner) placeBanner(banner); });
    g.addEventListener('orientationchange', function () { setTimeout(function () { if (T.active && banner) placeBanner(banner); }, 260); });
  }

  function setStep(n, note) {
    if (!T.active || T.step === n) return;
    T.step = n; T.sub = '';
    if (SK.state) SK.state.tutorialStep = n;
    render();
    if (note && SK.toast) SK.toast(note);
  }

  /* ───────────── 단계 확인 (가벼운 폴링) ───────────── */
  function marketSlot() {
    var cs = SK.state && SK.state.cities && SK.state.cities[HOME];
    if (!cs || !cs.slots) return null;
    for (var i = 0; i < cs.slots.length; i++) if (cs.slots[i] && cs.slots[i].key === 'market') return cs.slots[i];
    return null;
  }
  function tick() {
    if (!T.active) return;
    try {
      var s = SK.state;
      if (!s || !s.cities) return;
      if (T.step === 1) {
        var m = marketSlot();
        if (m && m.uid) setStep(2, '시장 완성! 이제 [다음 달]을 눌러 보세요');
        else if (m && !T.sub) { T.sub = 'assign'; render(); }
      } else if (T.step === 2) {
        if ((s.turn || 1) >= 2) {
          /* 재야 수비병은 달마다 회복하므로 입문 값(1,200)으로 다시 맞춘다 */
          if (s.cities[FOE]) s.cities[FOE].troops = FOE_TROOPS;
          setStep(3, '이제 [군사] → [출진]으로 허창을 칩니다');
        }
      } else if (T.step === 3) {
        if (s.cities[FOE] && s.cities[FOE].owner === 'neutral' && s.cities[FOE].troops !== FOE_TROOPS) s.cities[FOE].troops = FOE_TROOPS;
      } else if (T.step === 4) {
        render();   // 전투 진행에 따라 안내 문구가 바뀐다
      }
    } catch (e) { /* 튜토리얼 안내가 게임을 막지 않게 */ }
  }

  /* ───────────── 시작 / 나가기 ───────────── */
  function start() {
    if (T.active) return;
    var go = function () {
      T.prevState = SK.state || null;
      T.prevSnap = null;
      try { T.prevSnap = localStorage.getItem(SNAP_KEY); } catch (e) { /* ignore */ }
      buildState();
      T.active = true; T.step = 0; T.sub = ''; T.won = false; T.inBattle = false;
      document.body.classList.add('tut-on');
      document.body.classList.remove('tut-battle');
      if (!T.timer) T.timer = setInterval(tick, 420);
      welcome();
    };
    if (SK.ensureData) {
      Promise.resolve(SK.ensureData()).then(go, go);
    } else go();
  }

  function welcome() {
    SK.modal({
      kicker: '🎓 3분 입문',
      title: '진류에서 허창까지 — 한 판으로 배우는 삼국지',
      body: '<div class="tut-intro">' +
        '<p class="modal-p">작은 1:1 전장에서 <b>내정 → 월정산 → 출진 → 전투</b> 네 단계만 따라 해 봅니다. ' +
        '최근 업데이트된 <b>전략 지형</b>(고지대·갈대밭·군량고)과 <b>기술 연구</b>, 조조전식 격자 전장도 이 판에서 그대로 맛볼 수 있습니다. ' +
        '본편 세이브와는 완전히 따로 놀기 때문에, 여기서 무엇을 해도 본편 진행은 그대로입니다.</p>' +
        '<ul class="tut-sl">' +
        '<li><b class="tnum">1</b><span class="tlx">공터에 <b>시장</b>을 짓고 장수 1명을 배속</span></li>' +
        '<li><b class="tnum">2</b><span class="tlx"><b>[다음 달]</b>로 월정산 확인</span></li>' +
        '<li><b class="tnum">3</b><span class="tlx">장수 3명 + <b>포차대</b>로 허창 출진</span></li>' +
        '<li><b class="tnum">4</b><span class="tlx">이동·공격 → <b>필살기</b>·자동으로 승리</span></li>' +
        '</ul>' +
        '<div class="tut-armies"><span class="ta ally"><b>아군 진류</b>조조 · 하후돈 · 곽가<br>병력 8,000 · 금 1,000 · 군량 3,000</span>' +
        '<span class="ta vs">VS</span>' +
        '<span class="ta foe"><b>적 허창</b>재야 수비병<br>병력 1,200 · 성벽 1중</span></div>' +
        '<p class="modal-sub">언제든 미션 배너의 [튜토리얼 나가기]로 표지로 돌아갈 수 있습니다.</p>' +
        '</div>',
      actions: [
        { label: '나가기', onClick: function () { exit(); backToTitle(); } },
        { label: '튜토리얼 시작!', primary: true, onClick: function () {
          T.step = 1;
          if (SK.state) SK.state.tutorialStep = 1;
          render();
          SK.openCity(HOME);
          setTimeout(function () { SK.toast('공터(＋)를 눌러 시장을 지어 보세요'); }, 500);
        } },
      ],
      dismissible: false,
      wide: true,
    });
  }

  function backToTitle() {
    try {
      if (SK.show) SK.show('screen-title');
      var cont = document.getElementById('btn-continue');
      if (cont) cont.hidden = !(SK.hasSave && SK.hasSave());
      if (g.JojoBGM && JojoBGM.play) { try { JojoBGM.play('title'); } catch (e) { /* ignore */ } }
    } catch (e) { /* ignore */ }
  }

  function exit() {
    if (!T.active && !T.prevState) return;
    T.active = false;
    if (T.timer) { clearInterval(T.timer); T.timer = 0; }
    hideBanner();
    document.body.classList.remove('tut-on');
    document.body.classList.remove('tut-battle');
    try { localStorage.removeItem(TKEY); } catch (e) { /* ignore */ }
    /* 본편 상태 되돌리기 */
    SK.state = T.prevState || null;
    T.prevState = null;
    /* 본편 전투 이탈 스냅샷도 원래대로 */
    try {
      if (T.prevSnap) localStorage.setItem(SNAP_KEY, T.prevSnap);
      else localStorage.removeItem(SNAP_KEY);
    } catch (e) { /* ignore */ }
    T.prevSnap = null;
    T.step = 0; T.inBattle = false;
    if (SK.refreshHud) { try { SK.refreshHud(); } catch (e) { /* ignore */ } }
  }

  function askExit() {
    SK.modal({
      kicker: '튜토리얼', title: '튜토리얼을 나갈까요?',
      body: '<p class="modal-p">지금까지의 입문 진행은 저장되지 않습니다. <b>본편 세이브는 그대로</b> 남아 있습니다.</p>',
      actions: [
        { label: '계속 하기' },
        { label: '나가기', primary: true, onClick: function () { exit(); backToTitle(); } },
      ],
      dismissible: true,
    });
  }

  /* ───────────── 출진 → 전투 ───────────── */
  function openSortie() {
    if (!T.active || !SK.openDeploy) return;
    var s = SK.state;
    if (!s || !s.cities) return;
    if (!s.cities[HOME] || s.cities[HOME].owner !== (s.playerFaction || 'caocao')) {
      SK.toast('진류를 먼저 차지해야 합니다.');
      return;
    }
    SK.openDeploy(HOME, FOE);
  }

  function battleStart(o) {
    if (!T.active || !SK.startBattle) return;
    var s = SK.state;
    var units = (o && o.units) || [];
    T.inBattle = true;
    T.step = 4;
    if (s) { s.tutorialStep = 4; s.lastCity = HOME; s.purseCity = HOME; }
    document.body.classList.add('tut-battle');
    render();
    try {
      SK.startBattle({
        origin: (o && o.origin) || HOME,
        targetId: (o && o.targetId) || FOE,
        type: 'siege',
        units: units,
        reserve: 0,
      });
    } catch (e) {
      T.inBattle = false;
      document.body.classList.remove('tut-battle');
      if (g.console) console.warn('[tut] battle error', e);
      SK.toast('전장을 열지 못했습니다 — 다시 시도해 주세요.');
    }
  }

  function onWin(info) {
    T.won = true; T.inBattle = false;
    document.body.classList.remove('tut-battle');
    T.step = 5; hideBanner();
    SK.modal({
      kicker: '🎓 입문 완료',
      title: '입문 완료! 이제 본편을 시작할까요?',
      body: '<div class="tut-done">' +
        '<div class="td-seal">완</div>' +
        '<p class="modal-p"><b>' + ((SK.josa && info && info.cityName) ? SK.josa(info.cityName, 'eul') : (((info && info.cityName) || '허창') + '을(를)')) + '</b> 함락했습니다. ' +
        '시장으로 돈을 벌고, 달을 넘겨 정산하고, 장수와 병종을 편성해 성을 치는 — 본편의 한 바퀴를 모두 해 봤습니다.</p>' +
        '<ul class="tut-sl done">' +
        '<li><span class="tlx"><b>내정</b> 공터에 건물을 짓고 장수를 배속하면 효과가 커집니다 — <b>기술 연구</b>도 성 화면에서</span></li>' +
        '<li><span class="tlx"><b>월정산</b> [다음 달]마다 세수·봉급·군량이 정산됩니다</span></li>' +
        '<li><span class="tlx"><b>출진</b> 이어진 성에만 나갈 수 있고, 행군 뒤 전투가 열립니다</span></li>' +
        '<li><span class="tlx"><b>전투</b> 고지대는 사거리·명중이 오르고, 갈대밭은 엄폐가 되고, <b>군량고</b>를 차지하면 적 보급이 끊깁니다</span></li>' +
        '</ul>' +
        '<p class="modal-sub">본편은 80개 거점 · 28세력입니다. 입문 추천은 <b>유비군</b> — 떨어져 있고 좋은 장수가 많습니다.</p>' +
        '</div>',
      actions: [
        { label: '타이틀로', onClick: function () { exit(); backToTitle(); } },
        { label: '본편 새로 시작', primary: true, onClick: function () {
          exit();
          if (SK.openScenarioPicker) SK.openScenarioPicker();
        } },
      ],
      dismissible: false,
      wide: true,
    });
  }

  function onLose() {
    T.inBattle = false;
    document.body.classList.remove('tut-battle');
    T.step = 3;
    if (SK.state) { SK.state.tutorialStep = 3; SK.state.cities[FOE].troops = FOE_TROOPS; }
    render();
    setTimeout(function () {
      if (SK.state && SK.state.cities[HOME] && SK.state.cities[HOME].owner === 'caocao') SK.openCity(HOME);
      SK.toast('다시 [군사] → [출진]으로 도전해 보세요 — 자동·×3배속을 쓰면 빠릅니다');
    }, 380);
  }

  g.SKTUT = {
    get active() { return T.active; },
    get step() { return T.step; },
    start: start,
    exit: exit,
    openSortie: openSortie,
    battleStart: battleStart,
    onWin: onWin,
    onLose: onLose,
    keys: { save: TKEY, home: HOME, foe: FOE },
  };
})(typeof window !== 'undefined' ? window : this);
