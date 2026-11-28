/* ══════════════════════════════════════════════════════════════════════════
   v6.13 — 천하 연무장 (비동기 유저 덱 대전 · 서버 0원)

   · 내 드림팀(최대 10명: 장수 id · 레벨 · 장비 보물 3칸)을 짧은 URL-safe 코드로
     내보내고, 상대는 `?vs=코드` 링크로 오거나 연무장 창에 코드를 붙여넣는다.
   · 전투는 본편과 같은 18×18 격자 엔진(SK.startBattle · type 'arena')이 그대로
     치른다 — 성·영토·보물·전적에는 아무것도 남지 않는 연습 대전이다.
   · 코드 형식 (SJG1):
       [0] 버전 1 | [1] 회차 | [2] 이름 길이(0이면 없음) | 이름 UTF-8 …
       [n] 인원 | 인원마다 { 장수 id 2B, 레벨 1B, 보물 수 1B, 보물 id 2B × n }
       [끝] 체크섬 1B (앞 바이트 합 & 0xFF)
     → base64url (A-Z a-z 0-9 - _) 로 감싸 `SJG1-…` 꼴이 된다.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  const SK = window.SK;
  if (!SK) return;

  const PREFIX = 'SJG1';
  const MAX_DECK = 10;
  const MAX_LABEL = 18;
  const PEND_KEY = 'sk_arena_vs_pending';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  /* ── base64url ── */
  function toB64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      const n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      if (b != null) out += B64[(n >> 6) & 63];
      if (c != null) out += B64[n & 63];
    }
    return out;
  }
  function fromB64(str) {
    const out = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < str.length; i++) {
      const v = B64.indexOf(str[i]);
      if (v < 0) continue;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xFF); }
    }
    return out;
  }
  function utf8(str) {
    const s = String(str || '');
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        const d = s.charCodeAt(i + 1);
        c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i += 1;
        out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function fromUtf8(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i];
      if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
      else if (b < 0xE0) { out += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63)); i += 2; }
      else if (b < 0xF0) { out += String.fromCharCode(((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)); i += 3; }
      else { out += String.fromCharCode(0xD800 + ((((b & 7) << 8) | (bytes[i + 1] & 63)) - 64), 0xDC00 + ((bytes[i + 2] & 63) << 6) + (bytes[i + 3] & 63)); i += 4; }
    }
    return out;
  }
  function sum8(bytes) { let s = 0; for (let i = 0; i < bytes.length; i++) s = (s + bytes[i]) & 0xFF; return s; }
  function push16(arr, n) { arr.push((n >> 8) & 0xFF, n & 0xFF); }

  /* ── 덱 코드 만들기 / 읽기 ── */
  function encode(deck, label, round) {
    const bytes = [1, Math.max(1, Math.min(99, Math.round(Number(round) || 1)))];
    const lab = utf8(String(label || '').slice(0, 8));
    /* 이름은 UTF-8 글자 경계에서 자른다 (한글 중간이 잘려 깨지지 않게) */
    let labN = Math.min(MAX_LABEL, lab.length);
    while (labN > 0 && lab[labN] != null && (lab[labN] & 0xC0) === 0x80) labN -= 1;
    bytes.push(labN);
    for (let i = 0; i < labN; i++) bytes.push(lab[i]);
    const list = (deck || []).slice(0, MAX_DECK);
    bytes.push(list.length);
    list.forEach((e) => {
      push16(bytes, Math.max(1, Math.min(796, Math.round(Number(e.g) || 0))));
      bytes.push(Math.max(1, Math.min(30, Math.round(Number(e.lv) || 1))));
      const ts = (e.t || []).filter((x) => Number(x) > 0).slice(0, 3);
      bytes.push(ts.length);
      ts.forEach((id) => push16(bytes, Math.max(1, Math.min(999, Math.round(Number(id) || 0)))));
    });
    bytes.push(sum8(bytes));
    return PREFIX + '-' + toB64(bytes);
  }
  function decode(raw) {
    let code = String(raw || '').trim();
    if (!code) return null;
    /* 링크를 통째로 붙여넣은 경우도 받아 준다 (?vs=…) */
    const m = /[?&]vs=([^&#\s]+)/.exec(code);
    if (m) code = decodeURIComponent(m[1]);
    code = code.replace(/\s+/g, '');
    code = code.replace(/^SJG1[-_]?/i, '');
    /* base64url 그대로 읽는다 (표준 base64로 온 코드도 받아 준다) */
    code = code.replace(/[^A-Za-z0-9+\/\-_]/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const bytes = fromB64(code);
    if (bytes.length < 6) return null;
    if (bytes[0] !== 1) return null;
    const chk = bytes[bytes.length - 1];
    if (sum8(bytes.slice(0, -1)) !== chk) return null;
    let p = 1;
    const round = Math.max(1, Math.min(99, bytes[p++] || 1));
    const labN = Math.min(MAX_LABEL, bytes[p++] || 0);
    if (p + labN > bytes.length - 1) return null;
    const label = labN ? fromUtf8(bytes.slice(p, p + labN)) : '';
    p += labN;
    const n = Math.min(MAX_DECK, bytes[p++] || 0);
    const deck = [];
    for (let i = 0; i < n; i++) {
      if (p + 4 > bytes.length - 1) return null;
      const g = (bytes[p] << 8) | bytes[p + 1]; p += 2;
      const lv = bytes[p++];
      const tc = Math.min(3, bytes[p++] || 0);
      const t = [];
      for (let k = 0; k < tc; k++) {
        if (p + 2 > bytes.length - 1) break;
        t.push((bytes[p] << 8) | bytes[p + 1]); p += 2;
      }
      if (g > 0 && SK.GEN_BY_ID && SK.GEN_BY_ID[g]) deck.push({ g: g, lv: lv, t: t });
    }
    if (!deck.length) return null;
    return { round: round, label: label, deck: deck };
  }

  /* ── 내 덱 ── */
  const TIER_RANK = { S: 4, A: 3, B: 2, C: 1 };
  function scoreOf(h) {
    return (TIER_RANK[h.tier] || 0) * 1000 + (Number(h.lv) || 1) * 10 + (SK.meritOf ? Math.min(9, Math.round((SK.meritOf(h) || 0) / 500)) : 0);
  }
  function myHeroes() {
    const s = SK.state;
    if (!s || !Array.isArray(s.heroes)) return [];
    return s.heroes.filter((h) => h && h.genId && !h.captured).slice()
      .sort((a, b) => scoreOf(b) - scoreOf(a));
  }
  let chosen = null;           // uid 배열 (세션 동안 유지)
  function defaultChosen() {
    return myHeroes().slice(0, MAX_DECK).map((h) => h.uid);
  }
  function chosenHeroes() {
    const list = myHeroes();
    if (!chosen || !chosen.length) chosen = defaultChosen();
    const byUid = {};
    list.forEach((h) => { byUid[h.uid] = h; });
    const out = chosen.map((u) => byUid[u]).filter(Boolean);
    return out.length ? out : list.slice(0, MAX_DECK);
  }
  function deckPayload() {
    return chosenHeroes().map((h) => ({
      g: h.genId,
      lv: Math.max(1, Math.round(Number(h.lv) || 1)),
      t: Object.keys(h.equip || {}).map((k) => Number(h.equip[k])).filter((x) => x > 0).slice(0, 3),
    }));
  }
  function deckLabel() {
    const s = SK.state || {};
    const f = (s.factions || {})[s.playerFaction] || {};
    const nm = (f.name || '').replace(/군$/, '');
    const lord = f.lord || '';
    return (nm && lord) ? `${nm}·${lord}` : (nm || lord || '내 덱');
  }
  function myCode() {
    return encode(deckPayload(), deckLabel(), SK.roundOf ? SK.roundOf() : 1);
  }
  function shareUrl(code) {
    const base = location.origin + location.pathname;
    return `${base}?vs=${encodeURIComponent(code || myCode())}`;
  }

  /* ── 복사 ── */
  function copyText(text, okMsg) {
    const ok = () => { if (SK.toast) SK.toast(okMsg || '복사했습니다.'); };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select(); ta.setSelectionRange(0, ta.value.length);
        const done = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        if (done) ok(); else if (SK.toast) SK.toast('복사가 막혔습니다 — 코드 칸을 길게 눌러 직접 복사하세요.');
      } catch (e) { if (SK.toast) SK.toast('복사가 막혔습니다 — 코드 칸을 길게 눌러 직접 복사하세요.'); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok).catch(fallback);
        return;
      }
    } catch (e) { /* fallback */ }
    fallback();
  }

  /* ── 전투 시작 ── */
  let last = null;              // { code, label, deck }
  function startWithCode(raw) {
    const dec = decode(raw);
    if (!dec) { if (SK.toast) SK.toast('상대 덱 코드를 읽지 못했습니다 — 코드가 잘렸는지 확인해 주세요.'); return false; }
    const s = SK.state;
    if (!s) { if (SK.toast) SK.toast('먼저 천하를 시작해야 내 덱이 생깁니다.'); return false; }
    const mine = chosenHeroes();
    if (!mine.length) { if (SK.toast) SK.toast('내 덱에 세울 장수가 없습니다.'); return false; }
    const home = s.playerCapital || s.lastCity;
    if (!home || !SK.CITY[home]) { if (SK.toast) SK.toast('출진할 본성이 없습니다.'); return false; }
    last = { code: encode(dec.deck, dec.label, dec.round), label: dec.label || '상대 덱', deck: dec.deck };
    SK.startBattle({
      targetId: home, origin: home, type: 'arena',
      units: mine.map((h) => ({ kind: 'hero', uid: h.uid })),
      arena: { deck: dec.deck, label: last.label, code: last.code, round: dec.round },
    });
    return true;
  }
  function replay() {
    if (!last) { open(); return false; }
    return startWithCode(last.code);
  }

  /* ── 연무장 창 ── */
  function heroChipsHtml() {
    const list = myHeroes();
    const pick = chosenHeroes().map((h) => h.uid);
    if (!list.length) return '<p class="arena-empty">아직 휘하 장수가 없습니다. 천하를 시작해 장수를 모아 오세요.</p>';
    return list.slice(0, 24).map((h) => {
      const on = pick.indexOf(h.uid) >= 0;
      return `<button type="button" class="arena-hero ${on ? 'on' : ''}" data-uid="${h.uid}" aria-pressed="${on ? 'true' : 'false'}">
        <img class="${SK.tcls(h)}" src="${SK.ptSrc(SK.genPortrait((SK.GEN_BY_ID && SK.GEN_BY_ID[h.genId]) || h))}" alt="">
        <b>${h.name}</b><span>Lv.${h.lv} · ${h.tier || '-'}급</span>${on ? '<i>✓</i>' : ''}
      </button>`;
    }).join('');
  }

  function open(opt) {
    const o = opt || {};
    const s = SK.state;
    if (!s) {
      SK.modal({ kicker: '천하 연무장', title: '먼저 천하를 시작해 주세요',
        body: '<p class="modal-p">연무장은 <b>내가 키운 장수들</b>로 겨루는 자리입니다. 세력을 하나 고르고 나서 다시 열어 주세요.</p>',
        actions: [{ label: '닫기' }, { label: '새로 시작', primary: true, onClick: () => SK.startGame(true) }] });
      return;
    }
    const code = myCode();
    const link = shareUrl(code);
    const body = `<div class="arena-wrap">
      <div class="arena-top">
        <p class="arena-lead">내 드림팀 코드 하나로 <b>서버 없이 1:1 격자 대전</b>을 겨룹니다. <em>내 세이브에는 아무 변화도 없습니다.</em></p>
      </div>
      <div class="arena-sec">
        <div class="arena-head"><b>① 내 덱</b><span id="arena-count">${chosenHeroes().length} / ${MAX_DECK}명</span></div>
        <p class="arena-hint">장수를 눌러 넣고 빼세요 — 최대 ${MAX_DECK}명. 레벨·장비 보물이 그대로 코드에 담깁니다.</p>
        <div class="arena-heroes" id="arena-heroes">${heroChipsHtml()}</div>
      </div>
      <div class="arena-sec">
        <div class="arena-head"><b>② 내 덱 코드</b><span>친구에게 보내기</span></div>
        <textarea class="arena-code" id="arena-code" readonly rows="3">${code}</textarea>
        <div class="arena-btns">
          <button type="button" class="arena-btn" id="arena-copy-code">📋 덱 코드 복사</button>
          <button type="button" class="arena-btn" id="arena-copy-link">🔗 공유 링크 복사</button>
        </div>
        <p class="arena-link" id="arena-link">${link}</p>
      </div>
      <div class="arena-sec">
        <div class="arena-head"><b>③ 상대 덱 코드</b><span>붙여넣고 격돌</span></div>
        <textarea class="arena-code in" id="arena-in" rows="3" placeholder="SJG1-… 또는 ?vs= 링크를 붙여넣으세요"></textarea>
        <div class="arena-btns">
          <button type="button" class="arena-btn primary" id="arena-go">⚔️ 대전 시작</button>
          <button type="button" class="arena-btn" id="arena-self">내 코드로 시험</button>
        </div>
        <p class="arena-note">코드는 장수 id·레벨·보물만 담은 짧은 글자입니다. 서버·계정·돈이 들지 않습니다.</p>
      </div>
    </div>`;
    const m = SK.modal({
      kicker: '천하 연무장 · 비동기 대전', title: '내 덱 코드로 겨루기',
      body, wide: true, scrollHint: true,
      actions: [{ label: '닫기', primary: true }],
    });
    const el = m.el;
    const $ = (sel) => el.querySelector(sel);
    const refresh = () => {
      const code2 = myCode();
      const ta = $('#arena-code');
      if (ta) ta.value = code2;
      const lk = $('#arena-link');
      if (lk) lk.textContent = shareUrl(code2);
      const c = $('#arena-count');
      if (c) c.textContent = `${chosenHeroes().length} / ${MAX_DECK}명`;
      const box = $('#arena-heroes');
      if (box) {
        box.innerHTML = heroChipsHtml();
        wireChips();
      }
    };
    function wireChips() {
      el.querySelectorAll('.arena-hero').forEach((b) => {
        b.onclick = () => {
          const uid = b.dataset.uid;
          const cur = chosenHeroes().map((h) => h.uid);
          const at = cur.indexOf(uid);
          if (at >= 0) {
            if (cur.length <= 1) { SK.toast('최소 1명은 남겨 두세요.'); return; }
            cur.splice(at, 1);
          } else {
            if (cur.length >= MAX_DECK) { SK.toast(`한 덱에 ${MAX_DECK}명까지 넣을 수 있습니다.`); return; }
            cur.push(uid);
          }
          chosen = cur;
          SK.sfx.play('ui');
          refresh();
        };
      });
    }
    wireChips();
    $('#arena-copy-code').onclick = () => copyText(myCode(), '덱 코드를 복사했습니다 — 친구에게 붙여넣으세요.');
    $('#arena-copy-link').onclick = () => copyText(shareUrl(myCode()), '공유 링크를 복사했습니다.');
    $('#arena-go').onclick = () => {
      const v = ($('#arena-in') || {}).value || '';
      if (!v.trim()) { SK.toast('상대 덱 코드를 붙여넣어 주세요.'); return; }
      if (startWithCode(v)) m.close();
    };
    $('#arena-self').onclick = () => {
      const ta = $('#arena-in');
      if (ta) ta.value = myCode();
      SK.toast('내 코드를 넣었습니다 — [대전 시작]을 누르면 그대로 시험해 봅니다.');
    };
    if (o.code) {
      const ta = $('#arena-in');
      if (ta) ta.value = o.code;
    }
  }

  /* ── ?vs= 링크로 도착 ── */
  function vsFromUrl() {
    const m = /[?&]vs=([^&#]+)/.exec(location.search || '');
    return m ? decodeURIComponent(m[1]) : '';
  }
  let arriveDone = false;
  function arrive(code) {
    if (arriveDone) return;
    const dec = decode(code);
    if (!dec) { SK.toast('상대 덱 코드가 손상되어 열지 못했습니다.'); return; }
    const s = SK.state;
    if (!s) {
      try { localStorage.setItem(PEND_KEY, code); } catch (e) { /* ignore */ }
      SK.modal({
        kicker: '천하 연무장', title: '상대의 덱이 도착했습니다',
        body: `<div class="arena-arrive"><b>${dec.label || '상대 덱'}</b><span>${dec.deck.length}명 · ${dec.round}회차</span>
          <p class="modal-p">연무장에 나가려면 <b>내 장수</b>가 필요합니다. 아래 [천하 시작]으로 새 천하를 열면 <b> 바로 이 덱과 겨루는 연무장</b>이 열립니다.</p></div>`,
        actions: [{ label: '나중에' }, { label: '천하 시작', primary: true, onClick: () => SK.startGame(true) }],
      });
      return;
    }
    const busy = !!(s.pendingMarch || s.pendingInvasion || (SK.battleLive && SK.battleLive()));
    if (busy) {
      /* 지도에 처리할 사건(도착·침공)이 떠 있으면 전장을 덮지 않는다 — 한 번 묻고 연다 */
      SK.modal({
        kicker: '천하 연무장', title: '상대의 덱이 도착했습니다',
        body: `<div class="arena-arrive"><b>${dec.label || '상대 덱'}</b><span>${dec.deck.length}명 · ${dec.round}회차</span>
          <p class="modal-p">지금 처리할 소식이 남아 있습니다. 연무는 확인을 누르면 바로 시작합니다.</p></div>`,
        actions: [{ label: '나중에' }, { label: '⚔️ 지금 격돌', primary: true, onClick: () => startWithCode(code) }],
      });
      return;
    }
    arriveDone = true;
    if (SK.toast) SK.toast(`${dec.label || '상대 덱'}의 도전 — 연무장으로!`);
    setTimeout(() => { if (!startWithCode(code)) open({ code: code }); }, 380);
  }
  let vsWatch = 0;
  function watchUrl() {
    const code = vsFromUrl();
    if (!code || arriveDone) return;
    if (!SK.GEN_BY_ID || !Object.keys(SK.GEN_BY_ID || {}).length) { vsWatch = setTimeout(watchUrl, 400); return; }
    if (!SK.state) {
      /* 저장이 있으면 이어하기를 대신 눌러 준다 (링크로 왔으니 바로 겨루는 흐름) */
      if (SK.hasSave && SK.hasSave()) {
        if (!watchUrl.loaded) {
          watchUrl.loaded = true;
          try { if (SK.load()) SK.startGame(false); } catch (e) { /* ignore */ }
        }
        vsWatch = setTimeout(watchUrl, 500);
        return;
      }
      /* 저장이 아예 없으면 "먼저 시작해 달라"는 안내로 한 번만 보낸다 */
      setTimeout(() => arrive(code), 300);
      return;
    }
    setTimeout(() => arrive(code), 900);
  }

  /* ── 지도 pill · 메뉴 항목 ── */
  function pendingVs() {
    if (!SK.state || arriveDone) return '';
    let code = '';
    try { code = localStorage.getItem(PEND_KEY) || ''; } catch (e) { return ''; }
    if (!code) return '';
    try { localStorage.removeItem(PEND_KEY); } catch (e) { /* ignore */ }
    return code;
  }
  function checkPending() {
    const code = pendingVs();
    if (!code) return;
    arrive(code);
  }
  function paintPill() {
    const pill = document.getElementById('btn-arena-pill');
    if (!pill) return;
    const n = myHeroes().length;
    const badge = document.getElementById('arena-pill-n');
    if (badge) badge.textContent = String(Math.min(MAX_DECK, n || 0));
  }
  function bindEntry() {
    const pill = document.getElementById('btn-arena-pill');
    if (pill) pill.onclick = () => open();
  }

  SK.Arena = {
    open: open,
    start: startWithCode,
    replay: replay,
    decode: decode,
    encode: encode,
    myCode: myCode,
    shareUrl: shareUrl,
    myDeck: chosenHeroes,
    myHeroes: myHeroes,
    copy: copyText,
    paintPill: paintPill,
    arrive: arrive,
    MAX: MAX_DECK,
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindEntry();
    paintPill();
    setTimeout(watchUrl, 600);
  });
  /* 지도로 돌아올 때마다 배지 갱신 */
  const _showMap = SK.showMap;
  if (typeof _showMap === 'function') {
    SK.showMap = function () {
      const r = _showMap.apply(SK, arguments);
      try { paintPill(); } catch (e) { /* ignore */ }
      /* 저장 없이 ?vs= 로 와서 [천하 시작]을 누른 경우 — 지도에 들어오면 그 덱과 겨룬다 */
      setTimeout(() => { try { checkPending(); } catch (e) { /* ignore */ } }, 700);
      return r;
    };
  }
})();
