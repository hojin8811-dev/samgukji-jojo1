/* ══════════════════════════════════════════════════════════════
   꼬마영웅 대난투 — 안드로이드·모바일 뒤로가기(popstate) 이탈 방지
   v5.23 (?v=37) · v5.32 (?v=46) · v5.39 (?v=55) 보강

   · 모달이 열려 있으면  → 맨 위 모달만 닫는다 (dismissible:false 는 무시)
   · 전장 화면이면       → 이동만 하고 행동 전이면 '이동 취소',
                            아니면 "게임을 종료하시겠습니까?" (계속 싸운다 / 후퇴 / 종료)
   · 성(내정) 화면이면   → 지도로 돌아간다
   · 시나리오·세력 화면  → 한 단계 앞 화면으로 돌아간다
   · 지도·타이틀이면     → "게임을 종료하시겠습니까?" 확인 창 (계속하기 / 종료)

   v5.32 — 안드로이드 크롬의 User-Activation History Intervention 대응:
   사용자 제스처 없이 넣은 pushState 항목은 크롬이 무시할 수 있어, 앱을 연 직후
   지도에서 뒤로가기를 누르면 그대로 사이트를 나가 버린다. 그래서 boot() 뿐 아니라
   첫 pointerdown·touchstart·keydown 때 history.state 에 가드가 없으면 한 번 더 얹는다.

   v5.53 — 전장에서 뒤로가기가 앱을 튕겨 나가던 문제:
   ensureGuard 가 {once:true} 라 첫 입력 뒤로는 가드를 다시 얹지 않았고, popstate 안에서
   (사용자 제스처 없이) 얹은 항목은 크롬이 '건너뛸 수 있는 항목'으로 표시해 두었다.
   그래서 전장에서 뒤로가기를 누르면 가드를 지나쳐 앱 밖으로 나가 버렸다.
   이제 입력이 들어올 때마다(state.act 가 없는) 가드를 '제스처 있는 항목'으로 다시 얹는다.
   그리고 전장의 뒤로가기는 곧바로 후퇴하지 않고 "게임을 종료하시겠습니까?" 창을 띄운다.

   히스토리 설계: 앱을 열 때 pushState 로 '가드' 항목 하나를 얹는다.
   뒤로가기가 오면 항상 같은 항목을 다시 얹어(popstate → pushState) 제자리로 돌아오므로
   히스토리가 늘어나지 않고(길이 고정), 실제로 나갈 때만 가드를 얹지 않고 한 칸 더 나간다.
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const SK = window.SK || (window.SK = {});
  const GUARD_WINDOW = 2000;   // (v5.32 — 실제 종료 확인 창으로 바뀌며 대기 시간은 쓰지 않는다)
  let armedAt = 0;             // 첫 뒤로가기 시각 (점검용, 0 이면 대기 중이 아님)
  let exiting = false;         // 실제 이탈 처리 중
  let navigatedAway = false;   // 페이지가 떠나는 중 (pagehide)
  let guardStopped = false;    // pushState 가 막힌 환경
  let guardCount = 0;          // 지금까지 얹은 가드 항목 수 (점검용)
  let lockedAt = 0;            // 필수 선택 모달에서 뒤로가기를 누른 시각
  let exitOpen = false;        // "게임을 종료하시겠습니까?" 창이 열려 있는가 (지도·타이틀)
  let battleExitOpen = false;  // 전장에서 같은 창이 열려 있는가 (v5.53)

  /* ── 가드 항목 ───────────────────────────────────────────── */
  /* v5.53 — byGesture: 사용자 입력(pointerdown 등) 안에서 얹은 가드인가.
     크롬은 제스처 없이 만든 히스토리 항목을 뒤로가기에서 건너뛸 수 있어서,
     state.act 로 구분해 두고 다음 입력 때 다시 얹는다. */
  function pushGuard(byGesture) {
    if (guardStopped) return;
    try {
      history.pushState({ skBackGuard: 1, act: byGesture ? 1 : 0 }, '', location.href);
      guardCount += 1;
    } catch (e) {
      /* 시크릿 모드·히스토리 제한 등: 뒤로가기 보호 없이 조용히 넘어간다 */
      guardStopped = true;
      try { console.warn('[backguard] pushState 실패 — 뒤로가기 가드를 쓰지 않습니다.', e); } catch (e2) {}
    }
  }
  /* v5.32 — 지금 히스토리 항목에 가드가 없으면 다시 얹는다.
     안드로이드 크롬은 사용자 제스처 없이 만든 pushState 항목을 무시할 수 있어,
     첫 터치/키 입력 순간에 이 검사를 한 번 더 해야 지도에서 바로 나가지 않는다. */
  let gestureCount = 0;        // 사용자 입력 횟수 (점검용)
  function ensureGuard() {
    gestureCount += 1;
    let st = null;
    try { st = history.state; } catch (e) { st = null; }
    /* v5.53 — {once:true}를 걷어냈다. popstate 가 만든(제스처 없는) 가드는 다음 입력 때
       '제스처 있는 항목'으로 다시 얹어야, 그 뒤의 뒤로가기가 가드를 건너뛰고 앱을 나가지 않는다. */
    if (!st || !st.skBackGuard || !st.act) pushGuard(true);
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, ensureGuard, { capture: true, passive: true });
  });

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
    if (exitOpen || battleExitOpen) return 'exit-ask';   // 종료 확인 창 위에서는 아무 것도 하지 않는다
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
    /* v5.36 — 지도에서 대상을 고르던 중이면 뒤로가기는 '취소'다 (출진·정찰·전출·수송·외교) */
    if (scr === 'screen-map' && typeof SK.mapPickActive === 'function' && SK.mapPickActive()) {
      if (SK.cancelMapPick) SK.cancelMapPick();
      return 'sub';
    }
    if (scr === 'screen-battle') {
      /* v5.39 — 이동만 하고 아직 행동하지 않은 부대가 있으면 뒤로가기는 '이동 취소'다.
         v5.53 — 그 밖에는 곧바로 후퇴시키지 않고, 다른 화면과 똑같이
         "게임을 종료하시겠습니까?" 창을 띄운다 (계속 싸운다 / 후퇴 / 종료).
         예전에는 후퇴 확인만 띄웠는데, 가드가 건너뛰어지면 그대로 앱이 닫혔다. */
      if (typeof SK.battleUndoMove === 'function' && SK.battleUndoMove()) return 'sub';
      askBattleExit();
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
    /* v5.68 — 원정 전투 중 뒤로가기는 전투만 닫고 대기실로 돌아간다 (본편으로 나가지 않게) */
    const expBtl = document.getElementById('exp-battle');
    if (scr === 'screen-expedition' && expBtl && !expBtl.hidden) {
      if (!press('#eb-exit')) expBtl.hidden = true;
      return 'sub';
    }
    /* v5.67 — 원정 시나리오 대기실(비밀 · DEV): 뒤로가기는 본편 표지로 */
    if (scr === 'screen-expedition') {
      if (!press('#exp-back')) SK.show('screen-title');
      return 'sub';
    }
    return 'exit';
  }

  /* ── 실제로 나가기 ───────────────────────────────────────── */
  /* v5.32 — 가드 항목이 여러 개 쌓여 있을 수 있어(계속하기·화면 이동마다 한 칸),
     한 번만 back 하면 같은 문서의 가드 항목으로 돌아와 나가지 못한다.
     나가는 동안에는 popstate 를 무시하고, 문서가 떠날 때까지(최대 12칸) 한 칸씩 물러난다. */
  function leave() {
    armedAt = 0;
    exiting = true;
    let hops = 0;
    function step() {
      if (navigatedAway || document.visibilityState === 'hidden') return;
      if (hops >= 12) {
        exiting = false;
        pushGuard();
        if (SK.toast) SK.toast('뒤로 갈 페이지가 없습니다. 브라우저를 닫아 주세요.');
        return;
      }
      hops += 1;
      try { history.back(); } catch (e) { /* ignore */ }
      setTimeout(step, 320);
    }
    step();
  }

  /* ── v5.32 — 지도·타이틀에서 뒤로가기: 토스트 대신 확인 창 ───────────
     · 이 시점에 히스토리는 이미 앱을 처음 연 항목으로 돌아와 있다(가드는 아직 안 얹음)
     · 계속하기 → 가드를 다시 얹고 게임에 남는다
     · 종료     → 한 칸 더 나가 이전 페이지로 (갈 곳이 없으면 안내) */
  function askExit() {
    if (exitOpen) return;
    exitOpen = true;
    if (typeof SK.modal !== 'function') {
      /* 모달을 그릴 수 없는 아주 이른 시점: 예전처럼 한 번 더 누르면 나가게 둔다 */
      exitOpen = false;
      armedAt = Date.now();
      if (SK.toast) SK.toast('한 번 더 누르면 종료됩니다');
      pushGuard();
      return;
    }
    SK.modal({
      kicker: '뒤로가기',
      title: '게임을 종료하시겠습니까?',
      body: '<p class="modal-p">지금 나가면 마지막 저장 지점부터 다시 시작합니다.<br><span class="modal-sub">달이 바뀔 때 자동 저장되며, [메뉴 → 세이브 슬롯]에서 직접 저장할 수도 있습니다.</span></p>',
      actions: [
        { label: '계속하기', primary: true, onClick: function () {
          exitOpen = false;
          pushGuard();
          if (SK.toast) SK.toast('게임을 계속합니다.');
        } },
        { label: '종료', onClick: function () {
          exitOpen = false;
          leave();
        } },
      ],
      dismissible: false,
    });
  }

  /* ── v5.53 — 전장에서 뒤로가기: 종료 확인 창 ────────────────
     · 계속 싸운다 → 가드를 다시 얹고 전장으로 돌아온다
     · 후퇴        → 이번 공격을 포기하고 지도로 (기존 후퇴와 같은 처리)
     · 종료        → 한 칸 더 나가 이전 페이지로 (갈 곳이 없으면 안내) */
  function askBattleExit() {
    if (battleExitOpen) return;
    battleExitOpen = true;
    if (typeof SK.modal !== 'function') {
      battleExitOpen = false;
      pushGuard();
      return;
    }
    const done = function () { battleExitOpen = false; };
    SK.modal({
      kicker: '전장',
      title: '게임을 종료하시겠습니까?',
      body: '<p class="modal-p">지금 전투에서 나가면 이번 공격은 취소되고, 마지막 저장 지점부터 다시 시작합니다.<br><span class="modal-sub">계속 싸우거나, [후퇴]로 이번 공격을 포기하거나, 게임을 종료할 수 있습니다.</span></p>',
      actions: [
        { label: '계속 싸운다', primary: true, onClick: function () { done(); if (SK.toast) SK.toast('전투를 계속합니다.'); } },
        { label: '후퇴', onClick: function () { done(); if (window.SKBattle) SKBattle.retreat(); } },
        { label: '종료', onClick: function () { done(); leave(); } },
      ],
      dismissible: false,
    });
  }

  /* ── popstate ────────────────────────────────────────────── */
  function onPop() {
    if (exiting) return;             // leave() 가 부른 history.back() 의 되울림은 무시
    if (navigatedAway) return;

    const act = backAction();

    if (act === 'exit') {
      /* v5.32 — 지도·타이틀: 토스트 대신 확인 창. 여기서는 가드를 얹지 않고,
         계속하기를 골랐을 때만 다시 얹어 히스토리를 깨끗하게 유지한다. */
      armedAt = 0;
      askExit();
      return;
    }

    /* v5.53 — 종료 확인 창이 떠 있는 동안 또 뒤로가기를 눌러도 앱을 나가지 않는다.
       (예전에는 여기서 가드를 다시 얹지 않아 히스토리 가드가 비어 버렸다) */
    if (act === 'exit-ask') { pushGuard(); return; }

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
        exitOpen,
        battleExitOpen,
        gestureCount,
        guardCount,
        stopped: guardStopped,
        historyLength: history.length,
        canGoBack: history.length > 1,
        stateGuard: !!(history.state && history.state.skBackGuard),
      };
    },
    /* 테스트에서 대기 상태를 만들 때만 쓴다 */
    arm() { armedAt = Date.now(); return this.info(); },
    /* 테스트에서 종료 확인 창을 직접 열 때 */
    askExit() { askExit(); return this.info(); },
    askBattleExit() { askBattleExit(); return this.info(); },
    /* 가드가 '제스처 있는 항목'으로 서 있는지 */
    guardState() { try { return history.state || null; } catch (e) { return null; } },
  };
})();
