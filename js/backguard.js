/* ══════════════════════════════════════════════════════════════
   꼬마영웅 대난투 — 안드로이드·모바일 뒤로가기(popstate) 이탈 방지
   v5.23 (?v=37)

   · 모달이 열려 있으면  → 맨 위 모달만 닫는다 (dismissible:false 는 무시)
   · 전장 화면이면       → 상단 ‹ 버튼과 같은 '후퇴할까요?' 확인을 띄운다
   · 성(내정) 화면이면   → 지도로 돌아간다
   · 시나리오·세력 화면  → 한 단계 앞 화면으로 돌아간다
   · 지도·타이틀이면     → "한 번 더 누르면 종료됩니다" 토스트, 2초 안에 또 누르면 실제로 나간다

   히스토리 설계: 앱을 열 때 pushState 로 '가드' 항목 하나를 얹는다.
   뒤로가기가 오면 항상 같은 항목을 다시 얹어(popstate → pushState) 제자리로 돌아오므로
   히스토리가 늘어나지 않고(길이 고정), 실제로 나갈 때만 가드를 얹지 않고 한 칸 더 나간다.
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK || (window.SK = {});
  const GUARD_WINDOW = 2000;   // 지도·타이틀에서 두 번째 뒤로가기를 받아 주는 시간
  let armedAt = 0;             // 첫 뒤로가기 시각 (0 이면 대기 중이 아님)
  let exiting = false;         // 실제 이탈 처리 중
  let navigatedAway = false;   // 페이지가 떠나는 중 (pagehide)
  let guardStopped = false;    // pushState 가 막힌 환경
  let guardCount = 0;          // 지금까지 얹은 가드 항목 수 (점검용)
  let lockedAt = 0;            // 필수 선택 모달에서 뒤로가기를 누른 시각

  /* ── 가드 항목 ───────────────────────────────────────────── */
  function pushGuard() {
    if (guardStopped) return;
    try {
      history.pushState({ skBackGuard: 1 }, '', location.href);
      guardCount += 1;
    } catch (e) {
      /* 시크릿 모드·히스토리 제한 등: 뒤로가기 보호 없이 조용히 넘어간다 */
      guardStopped = true;
      try { console.warn('[backguard] pushState 실패 — 뒤로가기 가드를 쓰지 않습니다.', e); } catch (e2) {}
    }
  }

  /* ── 지금 화면 상태 읽기 ─────────────────────────────────── */
  function topModal() {
    const st = SK.modalStack || [];
    for (let i = st.length - 1; i >= 0; i--) {
      const m = st[i];
      if (!m) continue;
      if (m.el && (!m.el.isConnected || m.el.classList.contains('out'))) continue;
      return m;
    }
    return null;
  }

  function activeScreen() {
    const el = document.querySelector('.screen.active');
    return el ? el.id : '';
  }

  function press(sel) {
    const b = document.querySelector(sel);
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }

  /* ── 뒤로가기 한 번에 할 일 정하기 ───────────────────────── */
  /* 'modal' | 'locked' | 'battle' | 'city' | 'sub' | 'exit' */
  function backAction() {
    const m = topModal();
    if (m) {
      /* 닫으면 안 되는 모달(돌발 사건·필수 선택 등)은 그대로 둔다 */
      if (m.dismissible === false) {
        /* v5.28 — 아무 반응 없는 것처럼 보이지 않게 이유를 알려 준다 (2초에 한 번) */
        const now = Date.now();
        if (now - lockedAt > 2000 && SK.toast) { SK.toast('선택을 마쳐야 넘어갈 수 있습니다'); lockedAt = now; }
        return 'locked';
      }
      m.close();
      return 'modal';
    }
    const scr = activeScreen();
    if (scr === 'screen-battle') {
      if (typeof SK.confirmRetreat === 'function') SK.confirmRetreat();
      else press('#btn-retreat');
      return 'battle';
    }
    if (scr === 'screen-city') {
      const sheet = document.querySelector('#city-sheet');
      if (sheet && !sheet.hidden) {
        if (SK.closeCitySheet) SK.closeCitySheet();
        return 'city';
      }
      if (!press('#btn-city-back') && SK.showMap) SK.showMap();
      return 'city';
    }
    if (scr === 'screen-faction') {
      if (!press('#btn-faction-back') && SK.openScenarioPicker) SK.openScenarioPicker();
      return 'sub';
    }
    if (scr === 'screen-scenario') {
      if (!press('#btn-scenario-back')) SK.show(SK.state ? 'screen-map' : 'screen-title');
      return 'sub';
    }
    return 'exit';
  }

  /* ── 실제로 나가기 ───────────────────────────────────────── */
  function leave() {
    armedAt = 0;
    exiting = true;
    /* 지금 위치는 가드 바로 앞(앱을 처음 연 항목)이므로, 한 칸 더 가면 이전 페이지로 나간다. */
    try { history.back(); } catch (e) {}
    setTimeout(function () {
      exiting = false;
      /* 갈 곳이 없어(첫 진입·홈 화면 앱) 그대로 남아 있으면 가드를 다시 세우고 알린다. */
      if (navigatedAway || document.visibilityState === 'hidden') return;
      pushGuard();
      if (SK.toast) SK.toast('뒤로 갈 페이지가 없습니다. 브라우저를 닫아 주세요.');
    }, 800);
  }

  /* ── popstate ────────────────────────────────────────────── */
  function onPop() {
    if (exiting) return;             // leave() 가 부른 history.back() 의 되울림은 무시
    if (navigatedAway) return;

    const act = backAction();

    if (act === 'exit') {
      const now = Date.now();
      if (armedAt && now - armedAt <= GUARD_WINDOW) { leave(); return; }
      armedAt = now;
      if (SK.toast) SK.toast('한 번 더 누르면 종료됩니다');
      pushGuard();
      return;
    }

    armedAt = 0;                     // 모달·화면 이동이 있었으면 종료 대기는 취소
    pushGuard();                     // 가드를 다시 얹어 히스토리를 늘리지 않고 제자리로
  }

  window.addEventListener('popstate', onPop);

  window.addEventListener('pagehide', function () { navigatedAway = true; });
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    /* 뒤로 갔다가 앞으로(beforeunload/bfcache) 돌아온 경우 가드를 다시 세운다 */
    navigatedAway = false;
    exiting = false;
    armedAt = 0;
    pushGuard();
  });

  /* ── 시작 ────────────────────────────────────────────────── */
  function boot() {
    pushGuard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 점검용 — 브라우저 콘솔·Playwright 에서 상태를 확인한다 */
  SK.backGuard = {
    info() {
      const m = topModal();
      return {
        screen: activeScreen(),
        modal: m ? { dismissible: m.dismissible } : null,
        armed: armedAt ? Date.now() - armedAt : -1,
        exiting,
        guardCount,
        stopped: guardStopped,
        historyLength: history.length,
        canGoBack: history.length > 1,
      };
    },
    /* 테스트에서 대기 상태를 만들 때만 쓴다 */
    arm() { armedAt = Date.now(); return this.info(); },
  };
})();
