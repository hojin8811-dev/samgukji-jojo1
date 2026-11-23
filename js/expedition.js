/* ══════════════════════════════════════════════════════════════════════════
   꼬마영웅 대난투 — 원정 시나리오 대기실 (비밀 · DEV)
   v5.67 (?v=85)

   · 독립 모듈: 본편(app.js · battle.js)의 흐름을 건드리지 않는다.
     공훈은 본편 상태(명성·점령지·천하통일)를 읽어 대기실을 열 때 적립한다.
   · 입장은 두 갈래뿐 — 주소에 ?exp=1, 또는 표지 제목을 1.5초 안에 5번 연속 터치.
     둘 다 '이번 화면 세션'에만 열리고 localStorage에 흔적을 남기지 않는다.
   · 1단계 범위: 시나리오 배너(1~10관 진행도) · 3×3 진형(최대 5명) · 하단 4메뉴 ·
     출진 버튼. 실제 3×3 전투는 2단계에서 붙인다.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const SK = window.SK || (window.SK = {});

  /* ── 저장 키 ─────────────────────────────────────────────── */
  const META_KEY = 'sk_meta_merit';          // 영구 공훈(본편과 공유하는 메타 재화)
  const EXP_KEY = 'sk_expedition_v1';        // 원정단·진형·진행도
  const STARTER_MERIT = 1000;                // 처음 연 사람에게 지급하는 시작 공훈
  const MAX_PARTY = 5;
  const STAGES = 10;
  const ROWS = ['전열', '중열', '후열'];
  const COLS = ['왼쪽', '가운데', '오른쪽'];
  const BOSSES = { 5: '장량', 8: '장보', 10: '장각' };
  const BOSS_PORTRAIT = 'assets/portraits/top100/57.webp';   // 10관 최종보스 장각

  /* 데이터가 아직 안 실렸을 때(첫 프레임) 쓸 기본값 — 미방·미축·간옹 */
  const STARTERS = [
    { name: '미방', id: 33, tier: 'A', job: '창병', leadership: 75, war: 74, intel: 52, politics: 60, charm: 41, skill: '수성의 보급', portrait: 'assets/portraits/a_rank/33_mifang.webp' },
    { name: '미축', id: 243, tier: 'A', job: '풍수사', leadership: 47, war: 24, intel: 76, politics: 87, charm: 84, skill: '거부의 군자금', portrait: 'assets/portraits/a_rank/243_mizhu.webp' },
    { name: '간옹', id: 35, tier: 'A', job: '책사', leadership: 38, war: 32, intel: 74, politics: 78, charm: 79, skill: '유머의 중재', portrait: 'assets/portraits/a_rank/35_jianyong.webp' },
  ];
  const START_NAMES = STARTERS.map((g) => g.name);

  /* ── 작은 도우미 ─────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);
  function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function toast(msg) { try { if (SK.toast) SK.toast(msg); } catch (e) { /* ignore */ } }
  function sfx(name) { try { if (SK.sfx && SK.sfx.play) SK.sfx.play(name || 'ui'); } catch (e) { /* ignore */ } }
  function tierOf(g) { const t = g && g.tier; return ['S', 'A', 'B', 'C'].indexOf(t) >= 0 ? t : 'C'; }

  function getGen(name) {
    if (!name) return null;
    const base = STARTERS.find((g) => g.name === name) || {};
    const live = (SK.GEN_BY_NAME && SK.GEN_BY_NAME[name]) || null;
    if (!live) return base.name ? base : null;
    return {
      name,
      id: live.id,
      tier: live.tier || base.tier,
      job: live.job || base.job || '',
      leadership: num(live.leadership, base.leadership),
      war: num(live.war, base.war),
      intel: num(live.intel, base.intel),
      politics: num(live.politics, base.politics),
      charm: num(live.charm, base.charm),
      skill: live.skill || base.skill || '',
      portrait: base.portrait || null,
    };
  }
  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : (fb || 0); }

  function portraitOf(name, g) {
    try {
      if (SK.artPortrait) { const a = SK.artPortrait(name); if (a) return a; }
    } catch (e) { /* ignore */ }
    try {
      const live = SK.GEN_BY_NAME && SK.GEN_BY_NAME[name];
      if (live && SK.genPortrait && SK.ptSrc) return SK.ptSrc(SK.genPortrait(live));
    } catch (e) { /* ignore */ }
    return (g && g.portrait) || 'assets/portraits/v2/gen_bobyung.webp';
  }

  function faceHtml(name, extraClass) {
    const g = getGen(name);
    if (!g) return '';
    const t = tierOf(g);
    return `<span class="exp-face tf tier-${t} ${extraClass || ''}"><img src="${portraitOf(name, g)}" alt="${name}" loading="lazy"></span>`;
  }

  function ownedCount(s) {
    if (!s || !SK.CITY_LIST) return 0;
    return SK.CITY_LIST.filter((c) => s.cities && s.cities[c.id] && s.cities[c.id].owner === s.playerFaction).length;
  }

  /* ── 영구 저장 ───────────────────────────────────────────── */
  function readMerit() {
    let v = null;
    try { const raw = localStorage.getItem(META_KEY); if (raw != null && raw !== '') v = Number(raw); } catch (e) { v = null; }
    if (v == null || !isFinite(v) || v < 0) { v = STARTER_MERIT; writeMerit(v); }
    return Math.round(v);
  }
  function writeMerit(v) {
    try { localStorage.setItem(META_KEY, String(Math.max(0, Math.round(Number(v) || 0)))); } catch (e) { /* 저장이 막힌 브라우저 */ }
  }

  function defaultFormation() {
    const f = new Array(9).fill(null);
    f[1] = '미방';   // 전열 가운데
    f[4] = '미축';   // 중열 가운데
    f[8] = '간옹';   // 후열 오른쪽
    return f;
  }

  function loadStore() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(EXP_KEY) || 'null'); } catch (e) { raw = null; }
    const st = (raw && typeof raw === 'object') ? raw : {};
    const roster = Array.isArray(st.roster) && st.roster.length
      ? st.roster.filter((n) => typeof n === 'string' && n) : START_NAMES.slice();
    let formation = null;
    if (Array.isArray(st.formation) && st.formation.length === 9) {
      formation = st.formation.map((n) => {
        if (typeof n !== 'string' || !n) return null;
        return roster.indexOf(n) >= 0 ? n : null;   // 보유하지 않은 이름은 비운다
      });
    }
    const credit = (st.credit && typeof st.credit === 'object') ? st.credit : {};
    return {
      roster,
      formation: formation || defaultFormation(),
      progress: Math.min(STAGES, Math.max(1, Number(st.progress) || 1)),
      credit: {
        raw: Number(credit.raw) || 0,
        baseCities: credit.baseCities == null ? null : Number(credit.baseCities),
      },
    };
  }

  let store = null;
  let selected = null;      // 진형에서 고른 칸
  let revealed = false;     // 이번 화면 세션에서 비밀 입장이 열렸는가

  function saveStore() {
    if (!store) return;
    try { localStorage.setItem(EXP_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  /* ── 공훈 연동 (본편 명성 · 점령지 · 천하통일) ─────────────── */
  function syncMerit(announce) {
    if (!store) store = loadStore();
    const c = store.credit;
    const s = SK.state;
    if (!s || !s.cities) return;
    const cities = ownedCount(s);
    if (c.baseCities == null) c.baseCities = cities;
    const fame = Number(s.fame) || 0;
    const raw = fame * 2 + Math.max(0, cities - c.baseCities) * 20 + (s.unified ? 500 : 0);
    if (raw < c.raw) {             // 새 판·불러오기로 되돌아간 경우: 기준만 다시 맞춘다
      c.baseCities = cities;
      c.raw = fame * 2 + (s.unified ? 500 : 0);
      return;
    }
    if (raw > c.raw) {
      const gain = raw - c.raw;
      writeMerit(readMerit() + gain);
      c.raw = raw;
      if (announce) toast(`본편 공훈 +${gain} 적립! (명성 ${fame})`);
    }
  }

  function addMerit(n) {
    const v = readMerit() + (Number(n) || 0);
    writeMerit(v);
    paintMerit();
    return v;
  }

  /* ── 화면 그리기 ─────────────────────────────────────────── */
  function paintMerit() {
    const el = $('exp-merit');
    if (el) el.textContent = fmt(readMerit());
  }

  function paintChips() {
    const box = $('exp-chips');
    if (!box) return;
    const prog = store ? store.progress : 1;
    let html = '';
    for (let i = 1; i <= STAGES; i++) {
      const cls = i < prog ? 'done' : (i === prog ? 'now' : '');
      const boss = BOSSES[i];
      const label = boss ? `${i}관 · 보스 ${boss}` : `${i}관`;
      html += `<span class="exp-chip ${cls}${boss ? ' boss' : ''}" role="listitem" data-stage="${i}" title="${label}" aria-label="${label}">${i}</span>`;
    }
    box.innerHTML = html;
    const note = $('exp-progress-note');
    if (note) {
      note.innerHTML = prog >= STAGES && BOSSES[STAGES]
        ? `<b>${STAGES}관 장각</b>이 마지막 관문입니다 — 무너뜨리면 제1막 완료!`
        : `<b>${prog}관문</b>부터 도전할 수 있습니다 · 5관 장량 · 8관 장보 · 10관 장각`;
    }
  }

  function partyCount() {
    return store ? store.formation.filter(Boolean).length : 0;
  }

  function partyPower() {
    if (!store) return 0;
    let p = 0;
    store.formation.forEach((n) => {
      const g = getGen(n);
      if (!g) return;
      p += num(g.leadership) * 12 + num(g.war) * 10 + num(g.intel) * 8;
    });
    return Math.round(p);
  }

  function paintGrid() {
    const grid = $('exp-grid');
    if (!grid) return;
    let html = '';
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const name = store.formation[i];
      const pos = `${ROWS[row]} ${COLS[col]}`;
      if (!name) {
        html += `<div class="exp-cell empty${selected === i ? ' sel' : ''}" data-slot="${i}" role="button" tabindex="0" aria-label="${pos} 빈칸">${ROWS[row]} · 빈칸</div>`;
        continue;
      }
      const g = getGen(name);
      const t = tierOf(g);
      html += `<div class="exp-cell filled tier-${t}${selected === i ? ' sel' : ''}" data-slot="${i}" role="button" tabindex="0" aria-label="${name}, ${pos}">`
        + `<span class="exp-rowtag">${ROWS[row]} · ${COLS[col]}</span>`
        + `<span class="exp-info" data-info="${i}" role="button" tabindex="0" aria-label="${name} 능력치">i</span>`
        + faceHtml(name)
        + `<span class="exp-name">${name}</span>`
        + `<span class="exp-sub">${t}급 · ${(g && g.job) || ''}</span>`
        + `</div>`;
    }
    grid.innerHTML = html;
    const cnt = $('exp-form-count');
    if (cnt) cnt.textContent = `배치 ${partyCount()} / ${MAX_PARTY}명`;
    const reserve = $('exp-reserve');
    if (reserve) {
      const next = partyCount() + 1;
      if (next > MAX_PARTY) {
        reserve.innerHTML = `<div class="exp-slot-empty" style="grid-column:1/-1">진형 가득 참 (${MAX_PARTY}명) · 출진 준비 완료</div>`;
      } else if (next === MAX_PARTY) {
        reserve.innerHTML = `<div class="exp-slot-empty" style="grid-column:1/-1">＋ ${next}번 슬롯 · <b>공훈 뽑기</b>로 마지막 한 자리</div>`;
      } else {
        reserve.innerHTML = `<div class="exp-slot-empty">＋ ${next}번 슬롯 · <b>공훈 뽑기</b></div>`
          + `<div class="exp-slot-empty">＋ ${next + 1}번 슬롯 · <b>공훈 뽑기</b></div>`;
      }
    }
  }

  function paintFoot() {
    const prog = store ? store.progress : 1;
    const power = partyPower();
    const reco = 4500 + (prog - 1) * 450;
    const btn = $('exp-sortie');
    if (btn) {
      btn.innerHTML = `<span>⚔️</span><b>${prog}관문 출진하기</b><small>전투력 ${fmt(power)} · 권장 ${fmt(reco)}</small>`;
      btn.classList.toggle('disabled', partyCount() === 0);
    }
  }

  function paintAll() {
    paintMerit();
    paintChips();
    paintGrid();
    paintFoot();
  }

  function posName(i) {
    const row = Math.floor(i / 3), col = i % 3;
    return `${ROWS[row]} ${COLS[col]}`;
  }

  /* ── 진형 터치 ───────────────────────────────────────────── */
  let longFired = false;

  function onCellTap(i) {
    if (!store) return;
    const name = store.formation[i];
    if (selected == null) {
      if (!name) { toast('먼저 옮길 장수를 탭해 주세요.'); return; }
      selected = i;
      paintGrid();
      sfx('ui');
      return;
    }
    if (selected === i) { selected = null; paintGrid(); return; }
    const from = selected;
    const a = store.formation[from];
    const b = store.formation[i];
    store.formation[from] = b;
    store.formation[i] = a;
    selected = null;
    saveStore();
    paintGrid();
    paintFoot();
    sfx('ui');
    toast(b ? `${a} ↔ ${b} 자리를 바꿨습니다.` : `${a}을(를) ${posName(i)}으로 옮겼습니다.`);
  }

  function openInfo(i) {
    if (!store) return;
    const name = store.formation[i];
    const g = getGen(name);
    if (!g) return;
    const t = tierOf(g);
    const stats = [
      ['통솔', g.leadership], ['무력', g.war], ['지력', g.intel], ['정치', g.politics], ['매력', g.charm],
    ];
    const rows = stats.map(([k, v]) => {
      const n = Math.max(0, Math.min(100, Number(v) || 0));
      return `<div class="exp-stat-row"><span>${k}</span><span class="exp-stat-bar"><i style="width:${n}%"></i></span><b>${n}</b></div>`;
    }).join('');
    SK.modal({
      kicker: `${posName(i)} · ${t}급 ${g.job || ''}`,
      title: `${name} 능력치`,
      wide: false,
      body: `<div class="exp-stat-head">${faceHtml(name)}<div><b>${name}</b><span>${t}급 · ${g.job || '장수'} · 원정단 ${store.roster.indexOf(name) >= 0 ? '보유' : '미보유'}</span></div></div>`
        + rows
        + (g.skill ? `<div class="exp-skill-line">고유 기술 · <b>${g.skill}</b></div>` : '')
        + `<p class="exp-note-line">진형에서 다른 칸을 탭하면 이 장수를 옮기거나 맞바꿀 수 있습니다.</p>`,
      actions: [{ label: '닫기', primary: true }],
    });
  }

  /* ── 내 원정단 (배치·해제) ───────────────────────────────── */
  function openRoster() {
    if (!store) store = loadStore();
    const rows = store.roster.map((name) => {
      const g = getGen(name);
      if (!g) return '';
      const slot = store.formation.indexOf(name);
      const placed = slot >= 0;
      const t = tierOf(g);
      return `<div class="exp-roster-row">`
        + faceHtml(name)
        + `<div class="exp-roster-main"><b>${name}</b><span>${t}급 · ${g.job || '장수'} · 통솔 ${num(g.leadership)} 무력 ${num(g.war)} 지력 ${num(g.intel)}</span>`
        + `<em>${placed ? posName(slot) + ' 배치됨' : '대기 중 (진형 밖)'}</em></div>`
        + `<span class="exp-roster-status${placed ? ' on' : ''}">${placed ? '출진' : '대기'}</span>`
        + `<button type="button" class="exp-roster-btn ${placed ? 'off' : 'place'}" data-roster="${name}" data-act="${placed ? 'remove' : 'place'}">${placed ? '해제' : '배치'}</button>`
        + `</div>`;
    }).join('');
    const m = SK.modal({
      kicker: '내 원정단 · 장비',
      title: `보유 ${store.roster.length}명 · 출진 ${partyCount()}/${MAX_PARTY}명`,
      wide: true,
      body: `<div class="exp-roster">${rows || '<p class="exp-note-line">보유한 장수가 없습니다.</p>'}</div>`
        + `<div class="exp-skill-line" style="margin-top:10px">🎒 보유 장비 <b>0</b> — 장비(보물) 뽑기는 2단계에서 열립니다.</div>`
        + `<p class="exp-note-line">[배치]는 빈 칸(전열 → 중열 → 후열)에 차례로 넣고, [해제]는 진형에서 뺍니다. 진형은 최대 ${MAX_PARTY}명입니다.</p>`,
      actions: [{ label: '닫기', primary: true }],
    });
    if (!m || !m.el) return;
    m.el.querySelectorAll('[data-roster]').forEach((b) => {
      b.onclick = () => {
        const name = b.dataset.roster;
        const act = b.dataset.act;
        const changed = act === 'place' ? placeGeneral(name) : removeGeneral(name);
        if (changed) { m.close(); setTimeout(openRoster, 90); }
      };
    });
  }

  function placeGeneral(name) {
    if (!store) return false;
    if (store.formation.indexOf(name) >= 0) { toast(`${name}은(는) 이미 진형에 있습니다.`); return false; }
    if (partyCount() >= MAX_PARTY) { toast(`진형은 최대 ${MAX_PARTY}명까지 배치할 수 있습니다.`); return false; }
    const order = [1, 4, 7, 0, 2, 3, 5, 6, 8];
    const idx = order.find((i) => !store.formation[i]);
    if (idx == null) { toast('빈 칸이 없습니다.'); return false; }
    store.formation[idx] = name;
    selected = null;
    saveStore();
    paintGrid();
    paintFoot();
    sfx('ui');
    toast(`${name}을(를) ${posName(idx)}에 배치했습니다.`);
    return true;
  }

  function removeGeneral(name) {
    if (!store) return false;
    const idx = store.formation.indexOf(name);
    if (idx < 0) { toast(`${name}은(는) 진형에 없습니다.`); return false; }
    store.formation[idx] = null;
    if (selected === idx) selected = null;
    saveStore();
    paintGrid();
    paintFoot();
    sfx('deny');
    toast(`${name}을(를) 진형에서 뺐습니다.`);
    return true;
  }

  /* ── 뽑기 미리보기 ───────────────────────────────────────── */
  function heroPool() {
    /* 미리보기는 S·A·B·C를 고루 보여 준다 (실제 확률은 2단계에서 공개) */
    const art = (n) => { try { return SK.artPortrait ? SK.artPortrait(n) : null; } catch (e) { return null; } };
    const list = (SK.GENERALS || []).filter((g) => g && START_NAMES.indexOf(g.name) < 0 && art(g.name));
    const byTier = { S: [], A: [], B: [], C: [] };
    list.forEach((g) => { const t = tierOf(g); if (byTier[t]) byTier[t].push(g); });
    const picks = [];
    const take = (t, frac) => {
      const arr = byTier[t] || [];
      if (!arr.length) return;
      const g = arr[Math.floor(arr.length * frac)];
      if (g && picks.indexOf(g.name) < 0) picks.push(g.name);
    };
    take('S', 0.25);
    take('A', 0.15); take('A', 0.6);
    take('B', 0.3); take('B', 0.7);
    take('C', 0.45);
    for (let i = 0; i < list.length && picks.length < 6; i++) {
      if (picks.indexOf(list[i].name) < 0) picks.push(list[i].name);
    }
    return picks.length ? picks.slice(0, 6) : START_NAMES.slice();
  }

  function openPullHero() {
    const pool = heroPool();
    const cards = pool.map((n) => {
      const g = getGen(n);
      return `<div class="exp-pull-card">${faceHtml(n)}<b>${n}</b><em>${tierOf(g)}급 · ${(g && g.job) || '장수'}</em></div>`;
    }).join('');
    SK.modal({
      kicker: '장수 공훈 뽑기',
      title: '공훈으로 장수를 부릅니다',
      wide: true,
      body: `<div class="exp-pull-head"><span class="exp-pull-cost">1회 공훈 100</span><span class="exp-pull-cost" style="background:none;border:0;color:#8a7448">현재 🏅 ${fmt(readMerit())}</span></div>`
        + `<div class="exp-pull-grid">${cards}</div>`
        + `<p class="exp-note-line">S~C 등급 중 한 명이 원정단에 합류합니다. 이미 가진 장수는 공훈으로 환급합니다.<br><b>뽑기 연출과 확률 공개는 2단계에서 열립니다.</b></p>`,
      actions: [{ label: '닫기' }, { label: '2단계에서 개방', primary: true }],
    });
  }

  const GEAR_ICON = { '명마': '🐎', '무기': '⚔️', '방어구': '🛡️', '서적': '📜', '보물': '💎', '약': '🧪', '악기': '🎵' };

  function openPullGear() {
    const all = SK.TREASURES || [];
    const legend = all.filter((t) => t && t.grade === '전설');
    const src = legend.length >= 4 ? legend : all;
    /* 종류가 겹치지 않게 먼저 하나씩 고르고, 모자라면 나머지로 채운다 */
    const pool = [];
    const seenType = {};
    src.forEach((t) => {
      if (!t || pool.length >= 4) return;
      const k = t.type || '보물';
      if (seenType[k]) return;
      seenType[k] = 1;
      pool.push(t);
    });
    for (let i = 0; i < src.length && pool.length < 4; i++) {
      if (pool.indexOf(src[i]) < 0) pool.push(src[i]);
    }
    const rows = pool.map((t) => `<div class="exp-gear-row"><span class="exp-gear-ic">${GEAR_ICON[t.type] || '💎'}</span>`
      + `<div><b>${t.name}</b><em>${t.type || '보물'} · ${t.effect || ''}</em></div>`
      + `<span class="exp-grade">${t.grade || '보물'}</span></div>`).join('');
    SK.modal({
      kicker: '장비(보물) 뽑기',
      title: '공훈으로 보물을 캡니다',
      wide: true,
      body: `<div class="exp-pull-head"><span class="exp-pull-cost">1회 공훈 80</span><span class="exp-pull-cost" style="background:none;border:0;color:#8a7448">현재 🏅 ${fmt(readMerit())}</span></div>`
        + (rows || '<p class="exp-note-line">보물 목록을 불러오는 중입니다.</p>')
        + `<p class="exp-note-line">본편의 250종 보물을 그대로 씁니다. 뽑은 장비는 원정단 장수에게 장착합니다.<br><b>뽑기 연출은 2단계에서 열립니다.</b></p>`,
      actions: [{ label: '닫기' }, { label: '2단계에서 개방', primary: true }],
    });
  }

  /* ── 유저 랭킹전 미리보기 ─────────────────────────────────── */
  function openRank() {
    const rows = [
      ['유비곰돌이', '12관 · 38턴'],
      ['청룡언월도', '11관 · 41턴'],
      ['적토마질주', '10관 · 44턴'],
      ['조조는간웅', '9관 · 47턴'],
      ['황건적두목', '8관 · 52턴'],
    ].map(([n, s], i) => `<div class="exp-rank-row"><span class="exp-rank-no">${i + 1}</span><b>${n}</b><em>${s}</em></div>`).join('');
    const mine = store ? `내 기록 · ${store.progress - 1}관 클리어 · 전투력 ${fmt(partyPower())}` : '';
    SK.modal({
      kicker: '유저 랭킹전',
      title: '누가 더 멀리 가나',
      wide: true,
      body: `<p class="exp-note-line" style="margin:0 0 6px">클리어 관문 → 턴 수 순으로 겨룹니다. (아래는 화면 확인용 예시)</p>`
        + rows
        + `<div class="exp-rank-me">${mine}</div>`
        + `<p class="exp-note-line"><b>서버 랭킹은 2단계에서 열립니다.</b> 가볍게 붙일 수 있게 점수·턴 기록부터 쌓아 둡니다.</p>`,
      actions: [{ label: '닫기', primary: true }],
    });
  }

  /* ── 출진 (2단계 예고) ───────────────────────────────────── */
  function openSortie() {
    if (!store) return;
    if (partyCount() === 0) { toast('진형에 장수를 먼저 배치해 주세요.'); return; }
    const prog = store.progress;
    const boss = BOSSES[prog];
    const power = partyPower();
    const reco = 4500 + (prog - 1) * 450;
    sfx('ui');
    SK.modal({
      kicker: `제1막 · 황건적의 난 · ${prog}관문`,
      title: boss ? `${prog}관문 · ${boss}의 진` : `${prog}관문 · 황건적 길목`,
      wide: true,
      body: `<div class="exp-story">`
        + `<p>“주공을 찾아 떠난 길에 황건적이 판을 깔았구먼.” 미축이 셈을 놓고, 미방이 창을 세웁니다.</p>`
        + `<p>“내가 앞에 설 테니 형님들은 뒤에서 봐 주시게!” — 간옹이 웃으며 진형을 가리킵니다.</p>`
        + (boss ? `<p><b>${prog}관 보스 · ${boss}</b>가 길을 막고 있습니다.</p>` : `<p>전열·중열·후열 3×3 진형으로 다음 황건적 무리를 맞습니다.</p>`)
        + `<div class="exp-story-note">⚔️ 3×3 전투는 <b>다음 단계(2단계)</b>에서 열립니다.<br>지금은 대기실에서 진형만 준비해 두세요.<br>전투력 ${fmt(power)} · 권장 ${fmt(reco)}</div>`
        + `</div>`,
      actions: [{ label: '닫기' }, { label: '진형 다시 보기', primary: true, onClick: () => { paintGrid(); } }],
    });
  }

  /* ── 화면 열기·닫기 ──────────────────────────────────────── */
  function openExpedition() {
    if (!revealed) return;
    store = loadStore();
    selected = null;
    syncMerit(true);
    saveStore();
    const el = $('screen-expedition');
    if (!el) return;
    /* SK.show 의 화면 목록에 들어 있으면 그대로, 아니면 직접 활성화한다 */
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    if (SK.show) SK.show('screen-expedition');
    el.classList.add('active');
    paintAll();
    try { if (SK.bgm) SK.bgm('title'); } catch (e) { /* ignore */ }
  }
  SK.expeditionOpen = openExpedition;

  function closeExpedition() {
    const el = $('screen-expedition');
    if (el) el.classList.remove('active');
    if (SK.show) SK.show('screen-title');
    else {
      const t = $('screen-title');
      if (t) t.classList.add('active');
    }
    try { if (SK.bgm) SK.bgm('title'); } catch (e) { /* ignore */ }
  }

  /* ── 비밀 입장 ───────────────────────────────────────────── */
  function revealEntry(quiet) {
    const b = $('btn-expedition');
    if (!b || !b.hidden) { revealed = true; return; }
    revealed = true;
    b.hidden = false;
    if (!quiet) toast('🤫 비밀 통로가 열렸습니다 — 원정 시나리오 (DEV)');
    sfx('ui');
  }

  function bindSecretEntry() {
    /* ① 주소의 ?exp=1 */
    let dev = false;
    try {
      const q = new URLSearchParams(location.search);
      dev = q.get('exp') === '1';
    } catch (e) { dev = false; }
    if (dev) revealEntry(true);

    /* ② 표지 제목 5연타 (각 터치 1.5초 이내) */
    const logo = document.querySelector('#screen-title .title-logo') || document.querySelector('.title-logo');
    if (!logo) return;
    let taps = [];
    const onTap = () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t <= 1500);
      taps.push(now);
      if (taps.length >= 5) {
        taps = [];
        if (!revealed) {
          revealEntry(false);
          const f = $('btn-expedition');
          if (f && f.scrollIntoView) { try { f.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
        } else {
          toast('비밀 통로는 이미 열려 있습니다.');
        }
      }
    };
    logo.addEventListener('click', onTap);
    logo.style.cursor = 'pointer';
  }

  /* ── 연결 ───────────────────────────────────────────────── */
  function bind() {
    const back = $('exp-back');
    if (back) back.onclick = closeExpedition;

    const entry = $('btn-expedition');
    if (entry) {
      entry.hidden = !revealed;
      entry.onclick = openExpedition;
    }

    const devBtn = $('exp-dev-merit');
    if (devBtn) devBtn.onclick = () => { addMerit(500); toast('테스트 공훈 +500 지급 (DEV)'); };

    const grid = $('exp-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const info = e.target.closest ? e.target.closest('[data-info]') : null;
        if (info) { e.stopPropagation(); openInfo(Number(info.dataset.info)); return; }
        const cell = e.target.closest ? e.target.closest('.exp-cell') : null;
        if (!cell) return;
        if (longFired) { longFired = false; return; }
        onCellTap(Number(cell.dataset.slot));
      });
      grid.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const cell = e.target.closest ? e.target.closest('.exp-cell') : null;
        if (!cell) return;
        e.preventDefault();
        onCellTap(Number(cell.dataset.slot));
      });
      /* 길게 누르면 능력치 (3×3 카드 정보 보기) */
      let lpTimer = null;
      const startLp = (e) => {
        const cell = e.target.closest ? e.target.closest('.exp-cell.filled') : null;
        if (!cell) return;
        const i = Number(cell.dataset.slot);
        clearTimeout(lpTimer);
        lpTimer = setTimeout(() => {
          longFired = true;
          openInfo(i);
          /* 길게 누른 뒤 올라온 click을 한 번만 삼키고, 혹시 안 올라와도 풀어 둔다 */
          setTimeout(() => { longFired = false; }, 900);
        }, 520);
      };
      const endLp = () => clearTimeout(lpTimer);
      grid.addEventListener('pointerdown', startLp);
      grid.addEventListener('pointerup', endLp);
      grid.addEventListener('pointerleave', endLp);
      grid.addEventListener('pointercancel', endLp);
    }

    const reserve = $('exp-reserve');
    if (reserve) reserve.addEventListener('click', (e) => {
      const slot = e.target.closest ? e.target.closest('.exp-slot-empty') : null;
      if (slot && slot.textContent.indexOf('슬롯') >= 0) openPullHero();
    });

    document.querySelectorAll('[data-exp-menu]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.expMenu;
        if (k === 'hero') openPullHero();
        else if (k === 'gear') openPullGear();
        else if (k === 'roster') openRoster();
        else if (k === 'rank') openRank();
      };
    });

    const sortie = $('exp-sortie');
    if (sortie) sortie.onclick = openSortie;
  }

  /* ── 시작 ───────────────────────────────────────────────── */
  function init() {
    bindSecretEntry();
    bind();
    /* 본편 데이터가 늦게 실리면 공훈·진형을 한 번 더 칠한다 */
    setTimeout(() => { if (document.querySelector('#screen-expedition.active') && store) { syncMerit(false); paintAll(); } }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 점검용 */
  SK.expedition = {
    open: openExpedition,
    close: closeExpedition,
    reveal: () => revealEntry(true),
    get state() { return store ? JSON.parse(JSON.stringify({ roster: store.roster, formation: store.formation, progress: store.progress, merit: readMerit() })) : null; },
    merit: () => readMerit(),
    addMerit,
    power: partyPower,
    reload: () => { store = loadStore(); paintAll(); },
    syncMerit,
  };
})();
