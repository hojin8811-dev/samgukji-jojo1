'use strict';
/* ═══════════════════════════════════════════════════════════════
   삼국지 조조전 · 천하의 서막
   1단계 프로토타입 — 전국 지도 내정 + 조조전식 격자 전장
   ═══════════════════════════════════════════════════════════════ */

/* ────────────────────────── 0. 도우미 ────────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
const key = (x, y) => x + ',' + y;
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const MAP_W = 12, MAP_H = 10, TURN_LIMIT = 40;

/* ────────────────────────── 1. 데이터 ────────────────────────── */
const TERRAIN = {
  P: { name: '평지', def: 0, note: '이동 1' },
  R: { name: '도로', def: -0.05, note: '이동 1 · 방어 -5%' },
  F: { name: '숲', def: 0.15, note: '이동 2 · 방어 +15%' },
  M: { name: '산지', def: 0.30, note: '이동 2 · 방어 +30%' },
  W: { name: '강물', def: 0.15, note: '수적만 통행' },
  B: { name: '다리', def: 0, note: '이동 1' },
  G: { name: '성문', def: 0.35, note: '이동 1 · 방어 +35%' },
  C: { name: '성벽', def: 0.5, note: '통행 불가' },
};

const CLASSES = {
  gunwoong: { name: '군웅', hanja: '群雄', role: '지휘 · 균형', hp: 118, mp: 40, atk: 25, def: 18, mov: 4, rng: 1, weapon: 'sword', skills: ['jihwi'],
    desc: '아군 전체를 지휘하는 군주 병과. 지휘 책략으로 부대를 강화한다.' },
  gibi: { name: '기병', hanja: '騎兵', role: '돌격 · 기동', hp: 116, mp: 20, atk: 28, def: 16, mov: 6, rng: 1, weapon: 'spear', mount: true,
    desc: '이동 6의 돌격 병과. 숲은 3, 산지는 통행할 수 없다.' },
  gunggi: { name: '궁기병', hanja: '弓騎兵', role: '원거리 · 기동', hp: 102, mp: 24, atk: 24, def: 13, mov: 5, rng: 3, weapon: 'bow', mount: true,
    desc: '대각선을 포함해 3칸까지 사격한다. 산지에 오르면 사거리 +1.' },
  pungsusa: { name: '풍수사', hanja: '風水師', role: '회복 · 보조', hp: 86, mp: 60, atk: 14, def: 11, mov: 4, rng: 2, weapon: 'staff',
    skills: ['sobogeup', 'daebogeup', 'gomu', 'pungsu'],
    desc: '소·대보급으로 아군을 살리고, 고무와 풍수로 전장을 뒤집는다.' },
  sanjeok: { name: '산적', hanja: '山賊', role: '산지 · 숲 특화', hp: 128, mp: 16, atk: 30, def: 13, mov: 5, rng: 1, weapon: 'axe',
    desc: '산지·숲에서 이동 1, 공격 +25%, 회심 확률 상승. 산에서는 최강.' },
  sujeok: { name: '수적', hanja: '水賊', role: '수전 특화', hp: 122, mp: 20, atk: 26, def: 15, mov: 5, rng: 1, weapon: 'trident',
    desc: '강물 위를 자유롭게 누비며 공격 +20%, 방어 보정을 받는다.' },
  bobyung: { name: '보병', hanja: '步兵', role: '방어 · 균형', hp: 112, mp: 10, atk: 22, def: 18, mov: 4, rng: 1, weapon: 'sword',
    desc: '튼튼한 방어의 기본 병과. 성문과 평지를 지키는 데 알맞다.' },
  gungbyung: { name: '궁병', hanja: '弓兵', role: '원거리', hp: 92, mp: 14, atk: 21, def: 12, mov: 4, rng: 3, weapon: 'bow',
    desc: '3칸 밖에서 일방적으로 공격한다. 붙으면 약하다.' },
  chaeksa: { name: '책사', hanja: '策士', role: '책략', hp: 80, mp: 56, atk: 15, def: 10, mov: 4, rng: 2, weapon: 'fan', skills: ['hwagye'],
    desc: '화계로 방어를 무시하는 피해를 준다. 근접전에는 취약하다.' },
};

const SKILLS = {
  sobogeup: { name: '소보급', hanja: '小補給', mp: 8, kind: 'heal', range: 2, power: 34,
    desc: '아군 1명의 HP를 크게 회복' },
  daebogeup: { name: '대보급', hanja: '大補給', mp: 18, kind: 'healArea', radius: 2, power: 22,
    desc: '주변 2칸 안의 아군 전원을 회복' },
  gomu: { name: '고무', hanja: '鼓舞', mp: 12, kind: 'buff', range: 2, atk: 0.3, turns: 2,
    desc: '아군 1명의 공격력 +30%(2턴)' },
  pungsu: { name: '풍수', hanja: '風水', mp: 16, kind: 'debuffArea', range: 3, radius: 2, turns: 2,
    desc: '지정 지점 2칸 안의 적 방어력 -25%(2턴)' },
  jihwi: { name: '지휘', hanja: '指揮', mp: 12, kind: 'buffAreaAllies', radius: 3, atk: 0.2, turns: 2,
    desc: '주변 3칸 안의 아군 전원 공격력 +20%(2턴)' },
  hwagye: { name: '화계', hanja: '火計', mp: 10, kind: 'magic', range: 3, power: 24,
    desc: '불을 질러 방어를 무시하는 피해' },
};

const HEROES = [
  { id: 'jojo', name: '조조', hanja: '曹操', cls: 'gunwoong', lv: 6, quote: '천하는 넓고, 내 길은 멀다.' },
  { id: 'hahoudon', name: '하후돈', hanja: '夏侯惇', cls: 'gibi', lv: 5, quote: '한 번 뚫으면 멈추지 않는다.' },
  { id: 'hahouyeon', name: '하후연', hanja: '夏侯淵', cls: 'gunggi', lv: 5, quote: '세 번의 화살이면 충분하다.' },
  { id: 'sunyoo', name: '순유', hanja: '荀攸', cls: 'pungsusa', lv: 5, quote: '하늘과 땅을 읽으면 이길 수 있습니다.' },
  { id: 'johong', name: '조홍', hanja: '曹洪', cls: 'bobyung', lv: 4, quote: '성이 무너져도 내가 버틴다.' },
];
const HERO_MAP = Object.fromEntries(HEROES.map((h) => [h.id, h]));

const CITY_DEFS = [
  { id: 'heochang', name: '허창', hanja: '許昌', x: 82, y: 128, gold: 360, rice: 420 },
  { id: 'wan', name: '완', hanja: '宛', x: 108, y: 214, gold: 250, rice: 300 },
  { id: 'yeonan', name: '여남', hanja: '汝南', x: 176, y: 244, gold: 320, rice: 360, battle: 'yeonan' },
  { id: 'geonup', name: '건업', hanja: '建業', x: 282, y: 238, gold: 380, rice: 430, battle: 'geonup' },
  { id: 'eop', name: '업', hanja: '鄴', x: 214, y: 62, gold: 340, rice: 380, battle: 'eop' },
];
const CITY_MAP = Object.fromEntries(CITY_DEFS.map((c) => [c.id, c]));
const ROADS = [
  ['heochang', 'wan'], ['heochang', 'yeonan'], ['heochang', 'eop'],
  ['wan', 'yeonan'], ['yeonan', 'geonup'], ['eop', 'geonup'],
];

const MAP_YEONAN = [
  'PPPPPPPPPPPP',
  'PFFPPPMMMMPP',
  'PFFPPMMMMMGP',
  'PPPPWWBWWGPP',
  'PPMPWWBWWPPP',
  'PPMPWWBWWPPP',
  'PPPPWWBWWPPP',
  'PFFPPPPPGGPP',
  'PFFPPMMMPPPP',
  'PPPPPPMMPPPP',
];
const MAP_GEONUP = [
  'PPPPPPPPPPPP',
  'PFFPPPPPPPPP',
  'PPPPPPPMMPPP',
  'WWBWWWWWWBWW',
  'WWBWWWWWWBWW',
  'WWBWWWWWWBWW',
  'PPPPPPPPPPPP',
  'PFFPPMMMPPPP',
  'PPPMMMMMPPPP',
  'PPPPPPPPPPPP',
];
const MAP_EOP = [
  'PPPPPPPPPPPP',
  'PFFPPPMMMMCP',
  'PFFPPMMMMMGP',
  'PPPPWWBWWPCP',
  'PPMPWWBWWPGP',
  'PPMPWWBWWPCP',
  'PPPPWWBWWPCP',
  'PFFPPPPPCCCP',
  'PFFPPMMMPPPP',
  'PPPPPPMMPPPP',
];

const BATTLES = {
  yeonan: {
    title: '여남 공방전', subtitle: '황건 잔당 토벌', map: MAP_YEONAN,
    enemies: [
      { id: 'juchang', name: '주창', hanja: '周倉', cls: 'sanjeok', lv: 6, boss: true, x: 8, y: 2 },
      { id: 'jutaek', name: '주태', hanja: '周泰', cls: 'sujeok', lv: 6, boss: true, x: 7, y: 5 },
      { id: 'hg1', name: '황건적', hanja: '黃巾', cls: 'bobyung', lv: 2, x: 9, y: 7 },
      { id: 'hg2', name: '황건 궁수', hanja: '黃巾', cls: 'gungbyung', lv: 2, x: 10, y: 1 },
      { id: 'hg3', name: '황건 술사', hanja: '黃巾', cls: 'chaeksa', lv: 3, x: 9, y: 3 },
      { id: 'hg4', name: '황건적', hanja: '黃巾', cls: 'bobyung', lv: 2, x: 11, y: 4 },
    ],
    intro: [
      { who: '조조', hanja: '曹操', cls: 'gunwoong', side: 'ally', text: '여남의 황건 잔당… 오늘로 끝내겠다.' },
      { who: '주창', hanja: '周倉', cls: 'sanjeok', side: 'enemy', text: '허! 이 산에서 우리를 잡을 수 있을까?' },
      { who: '주태', hanja: '周泰', cls: 'sujeok', side: 'enemy', text: '강물을 건너온 자는 다시 돌아가지 못한다.' },
      { who: '순유', hanja: '荀攸', cls: 'pungsusa', side: 'ally', text: '산지와 강물이 길을 막고 있습니다. 병과의 지형 상성을 살펴야 합니다.' },
    ],
    winLine: '여남을 평정했다. 황건의 잔불이 꺼졌다.',
    reward: { gold: 900, rice: 500 },
  },
  geonup: {
    title: '건업 수전', subtitle: '수적 소탕 · 강을 건너라', map: MAP_GEONUP,
    enemies: [
      { id: 'gamnyeong', name: '수적 두목', hanja: '水賊', cls: 'sujeok', lv: 6, boss: true, x: 6, y: 4 },
      { id: 'su1', name: '수군', hanja: '水軍', cls: 'sujeok', lv: 4, x: 4, y: 4 },
      { id: 'su2', name: '수군', hanja: '水軍', cls: 'sujeok', lv: 4, x: 8, y: 4 },
      { id: 'su3', name: '수군', hanja: '水軍', cls: 'sujeok', lv: 3, x: 8, y: 5 },
      { id: 'gb1', name: '수적 궁수', hanja: '水賊', cls: 'gungbyung', lv: 4, x: 2, y: 2 },
      { id: 'bb1', name: '수적 보병', hanja: '水賊', cls: 'bobyung', lv: 4, x: 9, y: 2 },
      { id: 'cs1', name: '수적 책사', hanja: '水賊', cls: 'chaeksa', lv: 4, x: 10, y: 1 },
    ],
    intro: [
      { who: '조조', hanja: '曹操', cls: 'gunwoong', side: 'ally', text: '강을 건너야 건업에 닿는다. 다리를 지켜라.' },
      { who: '수적 두목', hanja: '水賊', cls: 'sujeok', side: 'enemy', text: '이 강은 우리 집이다. 물 위에서 덤벼라!' },
      { who: '하후연', hanja: '夏侯淵', cls: 'gunggi', side: 'ally', text: '물 위의 적도 화살은 피하지 못합니다.' },
    ],
    winLine: '강줄기를 장악했다. 건업의 수적이 흩어졌다.',
    reward: { gold: 1200, rice: 600 },
  },
  eop: {
    title: '업성 공략', subtitle: '성문을 뚫어라', map: MAP_EOP,
    enemies: [
      { id: 'hwangduk', name: '황건 두목', hanja: '黃巾', cls: 'bobyung', lv: 6, boss: true, x: 11, y: 4 },
      { id: 'eop_cs', name: '황건 책사', hanja: '黃巾', cls: 'chaeksa', lv: 4, x: 11, y: 2 },
      { id: 'eop_bb1', name: '황건 보병', hanja: '黃巾', cls: 'bobyung', lv: 4, x: 9, y: 1 },
      { id: 'eop_bb2', name: '황건 보병', hanja: '黃巾', cls: 'bobyung', lv: 4, x: 9, y: 8 },
      { id: 'eop_gb1', name: '황건 궁수', hanja: '黃巾', cls: 'gungbyung', lv: 4, x: 8, y: 2 },
      { id: 'eop_gb2', name: '황건 궁수', hanja: '黃巾', cls: 'gungbyung', lv: 3, x: 6, y: 8 },
    ],
    intro: [
      { who: '조조', hanja: '曹操', cls: 'gunwoong', side: 'ally', text: '업성의 성문은 좁다. 한 번에 밀어붙인다.' },
      { who: '황건 두목', hanja: '黃巾', cls: 'bobyung', side: 'enemy', text: '성벽을 넘어와 봐라! 여기가 너희 무덤이다.' },
      { who: '하후돈', hanja: '夏侯惇', cls: 'gibi', side: 'ally', text: '성문 하나면 충분하다.' },
    ],
    winLine: '업성의 성문이 열렸다. 하북으로 가는 길이 트였다.',
    reward: { gold: 1000, rice: 700 },
  },
};

/* ────────────────────────── 2. 사운드 ────────────────────────── */
let audioCtx = null;
let soundOn = true;

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* 소리 없이 진행 */ }
}
function tone(freq, dur, type = 'square', vol = 0.04, when = 0, slide = null) {
  if (!soundOn || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch (e) { /* ignore */ }
}
function noiseBurst(dur = 0.12, vol = 0.06, when = 0) {
  if (!soundOn || !audioCtx) return;
  try {
    const len = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.value = vol;
    const f = audioCtx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400;
    src.connect(f).connect(g).connect(audioCtx.destination);
    src.start(audioCtx.currentTime + when);
  } catch (e) { /* ignore */ }
}
const SFX = {
  tap: () => tone(680, 0.05, 'square', 0.03),
  step: () => tone(240, 0.045, 'triangle', 0.02),
  nope: () => tone(150, 0.09, 'sawtooth', 0.025),
  hit: () => { noiseBurst(0.12, 0.07); tone(180, 0.1, 'sawtooth', 0.03, 0, 90); },
  crit: () => { noiseBurst(0.16, 0.09); tone(320, 0.16, 'square', 0.04, 0, 110); },
  down: () => { noiseBurst(0.22, 0.06); tone(160, 0.28, 'triangle', 0.035, 0, 70); },
  cast: () => { tone(520, 0.16, 'sine', 0.035, 0, 880); tone(780, 0.2, 'triangle', 0.025, 0.06); },
  heal: () => { tone(520, 0.1, 'sine', 0.04); tone(660, 0.1, 'sine', 0.04, 0.08); tone(880, 0.16, 'sine', 0.04, 0.16); },
  buff: () => { tone(440, 0.08, 'triangle', 0.035); tone(660, 0.12, 'triangle', 0.035, 0.07); },
  level: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.045, i * 0.09)); },
  turn: () => { tone(392, 0.14, 'sine', 0.035); tone(294, 0.22, 'sine', 0.03, 0.1); },
  victory: () => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.05, i * 0.13)); },
  defeat: () => { [330, 294, 262, 196].forEach((f, i) => tone(f, 0.34, 'sine', 0.05, i * 0.17)); },
  talk: () => tone(420 + Math.random() * 90, 0.03, 'square', 0.012),
  coin: () => { tone(880, 0.06, 'square', 0.03); tone(1174, 0.09, 'square', 0.025, 0.05); },
};
function sfx(name) { ensureAudio(); if (SFX[name]) SFX[name](); }

function refreshSoundButtons() {
  ['#btn-sound', '#btn-sound2'].forEach((sel) => {
    const b = $(sel); if (!b) return;
    b.textContent = soundOn ? '♪' : '♪';
    b.classList.toggle('off', !soundOn);
    b.setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기');
  });
}
function toggleSound() {
  soundOn = !soundOn;
  if (soundOn) { ensureAudio(); sfx('tap'); }
  try { localStorage.setItem('samgukji-sound', soundOn ? '1' : '0'); } catch (e) { /* ignore */ }
  refreshSoundButtons();
}

/* ────────────────────────── 3. 캠페인 상태 ────────────────────────── */
const SAVE_KEY = 'samgukji-jojo-save-v1';
const SAVE_VERSION = 1;
let state = null;
let selectedCityId = 'heochang';
let pendingFinal = false;

function defaultState() {
  return {
    version: SAVE_VERSION,
    turn: 1,
    gold: 1500,
    rice: 900,
    fame: 0,
    log: ['허창에서 군을 일으켰다. 천하는 아직 누구의 것도 아니다.'],
    cleared: [],
    cities: CITY_DEFS.map((c) => ({
      id: c.id,
      owner: (c.id === 'heochang' || c.id === 'wan') ? 'player' : 'enemy',
      troops: c.id === 'heochang' ? 3600 : (c.id === 'wan' ? 2200 : 3000),
      train: c.id === 'heochang' ? 60 : 45,
      dev: c.id === 'heochang' ? 2 : 1,
      acted: false,
    })),
    roster: HEROES.map((h) => ({ id: h.id, lv: h.lv, exp: 0, city: 'heochang' })),
    battlesWon: 0,
  };
}
const cityDef = (id) => CITY_MAP[id];
const cityState = (id) => state.cities.find((c) => c.id === id);
const heroDef = (id) => HERO_MAP[id];
const neighbors = (id) => ROADS.filter((r) => r[0] === id || r[1] === id).map((r) => (r[0] === id ? r[1] : r[0]));

function cityIncome(cs) {
  const d = cityDef(cs.id);
  return {
    gold: Math.round(d.gold + cs.dev * 70 + cs.train * 1.1),
    rice: Math.round(d.rice + cs.dev * 45),
  };
}
function playerTroops() {
  return state.cities.filter((c) => c.owner === 'player').reduce((s, c) => s + c.troops, 0);
}
function incomePreview() {
  let gold = 0, rice = 0;
  state.cities.forEach((c) => { if (c.owner === 'player') { const i = cityIncome(c); gold += i.gold; rice += i.rice; } });
  const upkeep = Math.round(playerTroops() / 80);
  return { gold, rice: rice - upkeep, upkeep };
}
function monthLabel(turn) {
  const y = Math.floor((turn - 1) / 12) + 1;
  const m = ((turn - 1) % 12) + 1;
  return `건안 ${y}년 ${m}월`;
}
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== SAVE_VERSION) return null;
    if (!Array.isArray(s.cities) || !Array.isArray(s.roster)) return null;
    return s;
  } catch (e) { return null; }
}

/* ────────────────────────── 4. 지도 화면 ────────────────────────── */
function hudUpdate() {
  $('#hud-gold').textContent = fmt(state.gold);
  $('#hud-rice').textContent = fmt(state.rice);
  $('#hud-troops').textContent = fmt(playerTroops());
  $('#date-label').textContent = monthLabel(state.turn);
  $('#fame-label').textContent = '명성 ' + state.fame;
  const inc = incomePreview();
  $('#next-hint').innerHTML = `다음 달 수입 <b style="color:#d9bd7e">금 +${fmt(inc.gold)}</b> · <b style="color:#d9bd7e">군량 ${inc.rice >= 0 ? '+' : ''}${fmt(inc.rice)}</b>`;
}

function citySVG(c) {
  const cs = cityState(c.id);
  const own = cs.owner;
  const main = own === 'player' ? '#3f74b8' : '#a8452f';
  const light = own === 'player' ? '#7fb2e8' : '#e08a6a';
  const glowId = own === 'player' ? 'glowBlue' : 'glowRed';
  const attackable = own === 'enemy' && neighbors(c.id).some((n) => cityState(n).owner === 'player');
  const sel = selectedCityId === c.id;
  return `
  <g class="city" data-city="${c.id}" transform="translate(${c.x},${c.y})" style="cursor:pointer">
    <circle r="30" fill="url(#${glowId})"/>
    ${attackable ? `<circle r="26" fill="none" stroke="#c9a44a" stroke-width="1.2" stroke-dasharray="3 4" opacity=".85">
        <animate attributeName="opacity" values="0.25;0.9;0.25" dur="2s" repeatCount="indefinite"/></circle>` : ''}
    ${sel ? `<circle r="22" fill="none" stroke="#ffe9a8" stroke-width="1.6" opacity=".9"/>` : ''}
    <rect x="-30" y="-24" width="60" height="60" fill="rgba(255,255,255,0.001)"/>
    <rect x="-15" y="-4" width="30" height="15" fill="${main}" stroke="#2a1a0e" stroke-width="1.4"/>
    <rect x="-15" y="-4" width="30" height="3" fill="${light}"/>
    <rect x="-15" y="-4" width="3" height="15" fill="${light}" opacity=".7"/>
    <rect x="12" y="-4" width="3" height="15" fill="${light}" opacity=".7"/>
    <rect x="-5" y="3" width="10" height="8" fill="#241708"/>
    <rect x="-18" y="-9" width="4" height="5" fill="${main}" stroke="#2a1a0e" stroke-width="1"/>
    <rect x="14" y="-9" width="4" height="5" fill="${main}" stroke="#2a1a0e" stroke-width="1"/>
    <rect x="-14" y="-8" width="28" height="3" fill="${light}" opacity=".55"/>
    <rect x="-21" y="-21" width="2" height="17" fill="#3a2410"/>
    <path d="M-19,-21 L-5,-18 L-19,-15 Z" fill="${main}" stroke="#2a1a0e" stroke-width=".8"/>
    <text x="0" y="26" text-anchor="middle" font-family="serif" font-size="12" font-weight="600"
      fill="#3a2a12" stroke="#e9d7ab" stroke-width="2.6" paint-order="stroke">${c.name}</text>
    <text x="0" y="-26" text-anchor="middle" font-family="serif" font-size="9.5" fill="#6b5230">${c.hanja}</text>
  </g>`;
}

function buildMapSVG() {
  const s = [];
  s.push(`<defs>
    <linearGradient id="parch" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#ead8ad"/><stop offset="0.55" stop-color="#e0c99a"/><stop offset="1" stop-color="#cdb281"/>
    </linearGradient>
    <radialGradient id="glowBlue"><stop offset="0" stop-color="rgba(70,130,200,.42)"/><stop offset="1" stop-color="rgba(70,130,200,0)"/></radialGradient>
    <radialGradient id="glowRed"><stop offset="0" stop-color="rgba(170,60,40,.38)"/><stop offset="1" stop-color="rgba(170,60,40,0)"/></radialGradient>
    <linearGradient id="riverG" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8fb4c8"/><stop offset="1" stop-color="#6f9ab4"/>
    </linearGradient>
  </defs>`);
  s.push(`<rect x="0" y="0" width="360" height="320" fill="url(#parch)"/>`);
  // 바람결 같은 종이 결
  for (let i = 0; i < 26; i++) {
    const y = (i * 53) % 316, x = (i * 97) % 340;
    s.push(`<ellipse cx="${x}" cy="${y}" rx="${18 + (i % 7) * 5}" ry="${2 + (i % 3)}" fill="rgba(160,130,80,.05)"/>`);
  }
  // 강
  s.push(`<path d="M-6,18 C60,54 96,74 132,108 C168,142 190,196 236,232 C272,260 310,268 366,282"
      fill="none" stroke="url(#riverG)" stroke-width="7.5" stroke-linecap="round" opacity=".85"/>`);
  s.push(`<path d="M-6,18 C60,54 96,74 132,108 C168,142 190,196 236,232 C272,260 310,268 366,282"
      fill="none" stroke="#dceaf2" stroke-width="1" stroke-linecap="round" opacity=".5"/>`);
  // 산맥
  const mountains = [[40, 60], [58, 48], [246, 88], [262, 100], [300, 120], [132, 286], [150, 292], [318, 168]];
  mountains.forEach(([x, y], i) => {
    s.push(`<path d="M${x - 14},${y + 8} L${x},${y - 9} L${x + 14},${y + 8} Z" fill="#a89a7a" stroke="#7d6f52" stroke-width="1"/>`);
    s.push(`<path d="M${x - 5},${y + 3} L${x},${y - 9} L${x + 5},${y + 3} Z" fill="#c3b697" opacity=".8"/>`);
  });
  // 숲
  for (let i = 0; i < 16; i++) {
    const x = 30 + ((i * 71) % 300), y = 40 + ((i * 47) % 250);
    if (Math.abs(x - 82) < 34 && Math.abs(y - 128) < 34) continue;
    s.push(`<circle cx="${x}" cy="${y}" r="3.2" fill="#7d9163" opacity=".55"/>`);
  }
  // 도로
  ROADS.forEach(([a, b]) => {
    const A = CITY_MAP[a], B = CITY_MAP[b];
    s.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#8d7143" stroke-width="2.4"
      stroke-dasharray="5 5" opacity=".55" stroke-linecap="round"/>`);
  });
  // 테두리
  s.push(`<rect x="4" y="4" width="352" height="312" fill="none" stroke="#8a6a3a" stroke-width="2.5"/>`);
  s.push(`<rect x="8" y="8" width="344" height="304" fill="none" stroke="#b99a63" stroke-width="1" opacity=".8"/>`);
  // 도시
  CITY_DEFS.forEach((c) => s.push(citySVG(c)));
  return s.join('');
}

function renderMapScreen() {
  if (!state) return;
  hudUpdate();
  const svg = $('#worldmap');
  svg.innerHTML = buildMapSVG();
  svg.querySelectorAll('.city').forEach((g) => {
    g.addEventListener('pointerup', (ev) => {
      ev.preventDefault();
      const id = g.getAttribute('data-city');
      if (!id) return;
      selectedCityId = id;
      sfx('tap');
      renderMapScreen();
    });
  });
  renderCityPanel();
}

function renderCityPanel() {
  const panel = $('#city-panel');
  if (!state) return;
  const c = cityDef(selectedCityId);
  const cs = cityState(selectedCityId);
  const isPlayer = cs.owner === 'player';
  const inc = cityIncome(cs);
  const gens = state.roster.filter((r) => r.city === selectedCityId).map((r) => HERO_MAP[r.id]);
  const canRecruit = isPlayer && !cs.acted && state.gold >= 400 && cs.troops < 9000;
  const canTrain = isPlayer && !cs.acted && state.gold >= 250 && cs.train < 100;
  const canDev = isPlayer && !cs.acted && state.gold >= 500 && cs.dev < 6;

  let html = `<div class="city-head">
    <span class="hanja">${c.hanja}</span>
    <span class="name">${c.name}</span>
    <span class="badge ${isPlayer ? 'player' : 'enemy'}">${isPlayer ? '아군' : '적군'}</span>
    <span class="owner-note">${isPlayer ? '통치 중' : '황건 잔당 점령'}</span>
  </div>`;

  if (isPlayer) {
    html += `<div class="city-stats">
      <div class="cs"><i>병력</i><b>${fmt(cs.troops)}</b></div>
      <div class="cs"><i>훈련도</i><b>${cs.train}</b></div>
      <div class="cs"><i>개발</i><b>${cs.dev}</b></div>
      <div class="cs"><i>수입</i><b>${fmt(inc.gold)}金</b></div>
    </div>
    <div class="city-generals">배치 장수 ${gens.length ? gens.map((g) => `<span class="gchip">${g.name} <span style="opacity:.65">${CLASSES[g.cls].name}</span></span>`).join('') : '<b>없음</b> — 장수를 배치해야 출진할 수 있다.'}</div>
    <div class="city-actions">
      <button class="btn" data-act="recruit" ${canRecruit ? '' : 'disabled'}>징병 <em>400金 · +600</em></button>
      <button class="btn" data-act="train" ${canTrain ? '' : 'disabled'}>훈련 <em>250金 · +8</em></button>
      <button class="btn" data-act="develop" ${canDev ? '' : 'disabled'}>개발 <em>500金 · +1</em></button>
      <button class="btn ghost" data-act="deploy" ${cs.acted ? 'disabled' : ''}>장수 배치</button>
      <button class="btn primary full" data-act="sortie" ${gens.length ? '' : 'disabled'}>출진 <em>${(() => {
        const targets = neighbors(c.id).filter((id) => cityState(id).owner === 'enemy');
        return targets.length ? targets.map((id) => cityDef(id).name).join(' · ') + ' 방면' : '인접한 적 도시 없음';
      })()}</em></button>
    </div>`;
  } else {
    const bkey = c.battle;
    const bdef = BATTLES[bkey];
    const canAttack = neighbors(c.id).some((n) => cityState(n).owner === 'player' && state.roster.some((r) => r.city === n));
    html += `<div class="city-stats">
      <div class="cs"><i>수비 병력</i><b>${fmt(cs.troops)}</b></div>
      <div class="cs"><i>성 방어</i><b>${cs.dev + 1}</b></div>
      <div class="cs"><i>지형</i><b>${bkey === 'geonup' ? '수전' : bkey === 'eop' ? '성문' : '산림'}</b></div>
      <div class="cs"><i>수입</i><b>${fmt(inc.gold)}金</b></div>
    </div>
    <div class="city-generals">수비 장수 ${bdef.enemies.filter((e) => e.boss).map((e) => `<span class="gchip">${e.name} <span style="opacity:.65">${CLASSES[e.cls].name}</span></span>`).join('')}</div>
    <div class="city-actions">
      <button class="btn primary full" data-act="attack" ${canAttack ? '' : 'disabled'}>출진 <em>${canAttack ? neighbors(c.id).filter((n) => cityState(n).owner === 'player').map((n) => cityDef(n).name).join('·') + '에서 공격' : '인접한 아군 도시가 필요'}</em></button>
    </div>
    <div class="city-note">적의 거점이다. 인접한 아군 도시에서 장수를 이끌고 출진해 점령할 수 있다.</div>`;
  }

  // 월간 보고
  if (state.log.length) {
    html += `<div class="city-note" style="border-top:1px dotted rgba(201,164,74,.18);margin-top:8px;padding-top:6px">${state.log.slice(0, 2).map((t) => '· ' + t).join('<br/>')}</div>`;
  }
  panel.innerHTML = html;

  panel.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'recruit') doRecruit();
      else if (act === 'train') doTrain();
      else if (act === 'develop') doDevelop();
      else if (act === 'deploy') openDeploy(selectedCityId);
      else if (act === 'sortie') openSortieFrom(selectedCityId);
      else if (act === 'attack') openSortieTo(selectedCityId);
    });
  });
}

function doRecruit() {
  const cs = cityState(selectedCityId);
  if (state.gold < 400) { toast('금이 부족합니다'); sfx('nope'); return; }
  state.gold -= 400;
  cs.troops = Math.min(9000, cs.troops + 600);
  cs.acted = true;
  cs.train = Math.max(0, cs.train - 2);
  toast('징병 완료 — 병력 +600', 'good');
  sfx('coin');
  saveGame(); renderMapScreen();
}
function doTrain() {
  const cs = cityState(selectedCityId);
  if (state.gold < 250) { toast('금이 부족합니다'); sfx('nope'); return; }
  state.gold -= 250;
  cs.train = Math.min(100, cs.train + 8);
  cs.acted = true;
  toast(`훈련 완료 — 훈련도 ${cs.train}`, 'good');
  sfx('buff');
  saveGame(); renderMapScreen();
}
function doDevelop() {
  const cs = cityState(selectedCityId);
  if (state.gold < 500) { toast('금이 부족합니다'); sfx('nope'); return; }
  state.gold -= 500;
  cs.dev += 1;
  cs.acted = true;
  toast(`개발 완료 — ${cityDef(cs.id).name} 개발 ${cs.dev}`, 'good');
  sfx('coin');
  saveGame(); renderMapScreen();
}

function advanceTurn() {
  if (!state) return;
  let gold = 0, rice = 0;
  state.cities.forEach((c) => {
    if (c.owner !== 'player') return;
    const inc = cityIncome(c);
    gold += inc.gold; rice += inc.rice;
  });
  const upkeep = Math.round(playerTroops() / 80);
  state.gold += gold;
  state.rice = Math.max(0, state.rice + rice - upkeep);
  let desert = 0;
  if (state.rice <= 0) {
    state.cities.forEach((c) => {
      if (c.owner === 'player' && c.troops > 0) { const d = Math.min(120, c.troops); c.troops -= d; desert += d; }
    });
  }
  state.turn += 1;
  state.cities.forEach((c) => { c.acted = false; });
  state.cities.forEach((c) => { if (c.owner === 'enemy') c.troops = Math.min(9000, c.troops + 60 + Math.floor(Math.random() * 120)); });
  const msg = `${monthLabel(state.turn)} — 금 +${fmt(gold)}, 군량 +${fmt(rice - upkeep)}` + (desert ? ` · 군량 부족으로 병사 ${desert}명 이탈` : '');
  state.log.unshift(msg);
  state.log = state.log.slice(0, 12);
  toast(msg, desert ? 'bad' : '');
  sfx('turn');
  saveGame();
  renderMapScreen();
}

/* ────────────────────────── 5. 출진 준비 · 배치 ────────────────────────── */
function costLine(label, need, have) {
  const ok = have >= need;
  return `<div class="cost-line ${ok ? '' : 'bad'}"><span>${label}</span><b>${fmt(need)} / 보유 ${fmt(have)}</b></div>`;
}

function openSortieFrom(fromCityId) {
  const targets = neighbors(fromCityId).filter((id) => cityState(id).owner === 'enemy');
  if (!targets.length) { toast('인접한 적 도시가 없습니다'); sfx('nope'); return; }
  if (targets.length === 1) { openBattlePrep(targets[0], fromCityId); return; }
  const m = openModal(`
    <h2>출진 방향</h2>
    <div class="sub">${cityDef(fromCityId).name}에서 어디로 진군할까?</div>
    <div class="pick">
      ${targets.map((id) => `<button class="chip" data-t="${id}"><span>${cityDef(id).name}</span><span class="c">${BATTLES[cityDef(id).battle].subtitle}</span></button>`).join('')}
    </div>
    <div class="row"><button class="btn" data-close>돌아가기</button></div>
  `);
  m.el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
    const t = b.getAttribute('data-t'); m.close(); openBattlePrep(t, fromCityId);
  }));
  m.el.querySelector('[data-close]').addEventListener('click', m.close);
}

function openSortieTo(targetCityId) {
  const sources = neighbors(targetCityId).filter((id) => cityState(id).owner === 'player');
  const usable = sources.filter((id) => state.roster.some((r) => r.city === id));
  if (!usable.length) {
    toast('인접한 아군 도시에 장수가 없습니다'); sfx('nope');
    return;
  }
  if (usable.length === 1) { openBattlePrep(targetCityId, usable[0]); return; }
  const m = openModal(`
    <h2>출진 도시 선택</h2>
    <div class="sub">${cityDef(targetCityId).name}을(를) 칠 거점을 고르세요.</div>
    <div class="pick">
      ${usable.map((id) => `<button class="chip" data-s="${id}"><span>${cityDef(id).name}</span><span class="c">장수 ${state.roster.filter((r) => r.city === id).length}명</span></button>`).join('')}
    </div>
    <div class="row"><button class="btn" data-close>돌아가기</button></div>
  `);
  m.el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
    const s = b.getAttribute('data-s'); m.close(); openBattlePrep(targetCityId, s);
  }));
  m.el.querySelector('[data-close]').addEventListener('click', m.close);
}

function openBattlePrep(targetCityId, fromCityId) {
  const tCity = cityDef(targetCityId);
  const fCity = cityDef(fromCityId);
  const bdef = BATTLES[tCity.battle];
  if (!bdef) { toast('아직 준비되지 않은 전장입니다'); return; }
  const roster = state.roster.filter((r) => r.city === fromCityId);
  if (!roster.length) { toast('출진할 장수가 없습니다. 장수를 배치하세요'); sfx('nope'); return; }
  const chosen = new Set(roster.map((r) => r.id));
  const cost = { gold: 300, rice: 150 };
  const enough = state.gold >= cost.gold && state.rice >= cost.rice;

  const m = openModal(`
    <h2>${bdef.title}</h2>
    <div class="sub">${fCity.name} → ${tCity.name} · ${bdef.subtitle}</div>
    <div class="enemy-list">
      ${bdef.enemies.map((e) => `<div class="enemy-row ${e.boss ? 'boss' : ''}">
        <span>${e.name}</span><span class="cls">${CLASSES[e.cls].name}</span>
        ${e.boss ? '<span class="boss-tag">장수</span>' : ''}<span class="lv">Lv.${e.lv}</span></div>`).join('')}
    </div>
    <div class="rule"></div>
    <div class="sub">출진 장수 <span id="pick-count"></span></div>
    <div class="pick" id="pick-list">
      ${roster.map((r) => {
        const h = HERO_MAP[r.id];
        return `<button class="chip on" data-hid="${r.id}"><span>${h.name}</span><span class="c">${CLASSES[h.cls].name} · Lv.${r.lv}</span></button>`;
      }).join('')}
    </div>
    <div class="rule"></div>
    ${costLine('출진 비용 · 금', cost.gold, state.gold)}
    ${costLine('출진 비용 · 군량', cost.rice, state.rice)}
    <div class="cost-line"><span>${fCity.name} 훈련도</span><b>${cityState(fromCityId).train} (공격 보정 +${Math.round(cityState(fromCityId).train / 5)}%)</b></div>
    <div class="row">
      <button class="btn ghost" data-close>돌아가기</button>
      <button class="btn primary" id="prep-go" ${enough ? '' : 'disabled'}>출진!</button>
    </div>
  `);

  const countEl = m.el.querySelector('#pick-count');
  const updateCount = () => { countEl.textContent = `(${chosen.size}명)`; };
  updateCount();
  m.el.querySelectorAll('[data-hid]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-hid');
      if (chosen.has(id)) { if (chosen.size === 1) { toast('최소 1명은 출진해야 합니다'); return; } chosen.delete(id); b.classList.remove('on'); b.classList.add('off'); }
      else { chosen.add(id); b.classList.add('on'); b.classList.remove('off'); }
      sfx('tap'); updateCount();
    });
  });
  m.el.querySelector('[data-close]').addEventListener('click', m.close);
  m.el.querySelector('#prep-go').addEventListener('click', () => {
    if (!enough) { toast('금 또는 군량이 부족합니다'); sfx('nope'); return; }
    if (!chosen.size) { toast('장수를 선택하세요'); return; }
    state.gold -= cost.gold;
    state.rice = Math.max(0, state.rice - cost.rice);
    saveGame();
    m.close();
    startBattle(tCity.battle, targetCityId, fromCityId, [...chosen]);
  });
}

function openDeploy(cityId) {
  const city = cityDef(cityId);
  const m = openModal(`
    <h2>장수 배치</h2>
    <div class="sub">${city.name}에 배치할 장수를 고르세요. 한 장수는 한 도시에만 머뭅니다.</div>
    <div class="pick" id="deploy-list"></div>
    <div class="row"><button class="btn" data-close>닫기</button></div>
  `);
  const list = m.el.querySelector('#deploy-list');
  const draw = () => {
    list.innerHTML = state.roster.map((r) => {
      const h = HERO_MAP[r.id];
      const here = r.city === cityId;
      return `<button class="chip ${here ? 'on' : ''}" data-r="${r.id}">
        <span>${h.name}</span><span class="c">${CLASSES[h.cls].name} · Lv.${r.lv} · ${cityDef(r.city).name}</span></button>`;
    }).join('');
    list.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
      const r = state.roster.find((x) => x.id === b.getAttribute('data-r'));
      if (r.city === cityId) { toast(`${HERO_MAP[r.id].name}은(는) 이미 ${city.name}에 있습니다`); return; }
      r.city = cityId;
      toast(`${HERO_MAP[r.id].name} → ${city.name} 배치`, 'good');
      sfx('tap');
      saveGame(); draw(); renderMapScreen();
    }));
  };
  draw();
  m.el.querySelector('[data-close]').addEventListener('click', () => { m.close(); renderMapScreen(); });
  m.layer.addEventListener('pointerdown', (e) => { if (e.target === m.layer) renderMapScreen(); });
}

/* ────────────────────────── 6. 전장 코어 ────────────────────────── */
let battle = null;
let unitSeq = 0;

const PAL = {
  ally: { main: '#3f74b8', dark: '#284a76', light: '#7fb2e8', trim: '#e0c07a', horse: '#6b4a2a', horseD: '#4f3520' },
  enemy: { main: '#a8452f', dark: '#6f2a1c', light: '#e08a6a', trim: '#d9b46a', horse: '#5b3b22', horseD: '#3f2817' },
};

function terrainCost(clsKey, ch) {
  if (ch === 'C') return Infinity;
  if (ch === 'W') return clsKey === 'sujeok' ? 1 : Infinity;
  if (ch === 'M') {
    if (clsKey === 'sanjeok') return 1;
    if (clsKey === 'gibi' || clsKey === 'gunggi') return Infinity;
    return 2;
  }
  if (ch === 'F') {
    if (clsKey === 'sanjeok') return 1;
    if (clsKey === 'gibi' || clsKey === 'gunggi') return 3;
    return 2;
  }
  return 1;
}
function terrainAt(x, y) { return TERRAIN[battle.map[y][x]] || TERRAIN.P; }
function cheb(x1, y1, x2, y2) { return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)); }
function manh(x1, y1, x2, y2) { return Math.abs(x1 - x2) + Math.abs(y1 - y2); }

function makeUnit(d, side, x, y) {
  const cls = CLASSES[d.cls];
  const lv = d.lv || 1;
  const g = Math.max(0, lv - 1);
  const u = {
    id: (side === 'ally' ? 'a' : 'e') + (++unitSeq),
    key: d.id, name: d.name, hanja: d.hanja || '',
    clsKey: d.cls, cls, side, lv, exp: 0,
    maxHp: Math.round((cls.hp + g * 6) * (d.hpMul || 1)),
    maxMp: cls.mp + g * 2,
    atk: Math.round((cls.atk + g * 2) * (d.atkMul || 1)),
    def: Math.round(cls.def + g),
    mov: cls.mov, rng: cls.rng,
    x, y, px: null, py: null,
    moved: false, acted: false, dead: false,
    buffs: [], boss: !!d.boss, quote: d.quote || '',
    skills: (cls.skills || []).slice(),
  };
  u.hp = u.maxHp;
  u.mp = u.maxMp;
  return u;
}

function unitAt(x, y) {
  if (!battle) return null;
  return battle.units.find((u) => !u.dead && u.x === x && u.y === y) || null;
}
function aliveUnits(side) { return battle.units.filter((u) => !u.dead && (!side || u.side === side)); }
function selectedUnit() { return battle && battle.selId ? battle.units.find((u) => u.id === battle.selId) : null; }
function isPassableTile(clsKey, x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  return isFinite(terrainCost(clsKey, battle.map[y][x]));
}

function computeReach(unit) {
  const res = new Map();
  res.set(key(unit.x, unit.y), { x: unit.x, y: unit.y, cost: 0, from: null });
  const open = [{ x: unit.x, y: unit.y, cost: 0 }];
  const occ = new Map();
  battle.units.forEach((u) => { if (!u.dead && u.id !== unit.id) occ.set(key(u.x, u.y), u); });
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift();
    if (cur.cost > unit.mov) continue;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
      const step = terrainCost(unit.clsKey, battle.map[ny][nx]);
      if (!isFinite(step)) return;
      const other = occ.get(key(nx, ny));
      if (other && other.side !== unit.side) return;
      const nc = cur.cost + step;
      if (nc > unit.mov) return;
      const k = key(nx, ny);
      const old = res.get(k);
      if (!old || nc < old.cost) {
        res.set(k, { x: nx, y: ny, cost: nc, from: key(cur.x, cur.y) });
        open.push({ x: nx, y: ny, cost: nc });
      }
    });
  }
  return res;
}
function pathTo(reach, x, y) {
  const path = [];
  let k = key(x, y);
  let guard = 0;
  while (k && guard++ < 60) {
    const n = reach.get(k);
    if (!n || n.from === null) break;
    path.unshift({ x: n.x, y: n.y });
    k = n.from;
  }
  return path;
}
function canStopAt(x, y, unit) {
  const u = unitAt(x, y);
  return !u || u.id === unit.id;
}

function addBuff(u, stat, value, turns) {
  u.buffs = u.buffs.filter((b) => b.stat !== stat);
  u.buffs.push({ stat, value, turns });
}
function buffValue(u, stat) {
  return u.buffs.filter((b) => b.stat === stat).reduce((s, b) => s + b.value, 0);
}
function atkTerrainMod(u, x, y) {
  const ch = battle.map[y][x];
  let m = 0;
  if (u.clsKey === 'sanjeok' && (ch === 'M' || ch === 'F')) m += 0.25;
  if (u.clsKey === 'sujeok' && ch === 'W') m += 0.20;
  if ((u.clsKey === 'gunggi' || u.clsKey === 'gungbyung') && ch === 'M') m += 0.10;
  return m;
}
function effAtk(u, x = u.x, y = u.y) {
  return Math.max(1, u.atk * (1 + atkTerrainMod(u, x, y) + buffValue(u, 'atk')));
}
function effDef(u) {
  const ch = battle.map[u.y][u.x];
  let mul = 1 + TERRAIN[ch].def + buffValue(u, 'def');
  if (u.clsKey === 'sanjeok' && (ch === 'M' || ch === 'F')) mul += 0.10;
  if (u.clsKey === 'sujeok' && ch === 'W') mul += 0.10;
  return Math.max(1, u.def * mul);
}
function effectiveRange(u, x = u.x, y = u.y) {
  let r = u.rng;
  if ((u.clsKey === 'gunggi' || u.clsKey === 'gungbyung') && battle.map[y][x] === 'M') r += 1;
  return r;
}
function inRangeFrom(u, x, y, target) {
  if (u.clsKey === 'bobyung' || u.rng === 1) return manh(x, y, target.x, target.y) === 1;
  const d = cheb(x, y, target.x, target.y);
  return d >= 1 && d <= effectiveRange(u, x, y);
}
function critChance(u, x = u.x, y = u.y) {
  const ch = battle.map[y][x];
  let c = 0.08;
  if (u.clsKey === 'sanjeok' && (ch === 'M' || ch === 'F')) c += 0.15;
  return c;
}
function calcDamage(a, d, ax, ay, opts = {}) {
  const atk = effAtk(a, ax, ay);
  const def = effDef(d);
  let dmg = atk * 1.5 - def * 0.8;
  dmg *= 1 + clamp((a.lv - d.lv) * 0.03, -0.12, 0.12);
  dmg *= rnd(0.92, 1.08);
  const crit = opts.noCrit ? false : chance(critChance(a, ax, ay));
  if (crit) dmg *= 1.55;
  return { dmg: Math.max(3, Math.round(dmg)), crit };
}
function estimateDamage(a, d, ax, ay) {
  return Math.max(3, Math.round(effAtk(a, ax, ay) * 1.5 - effDef(d) * 0.8));
}

/* ── 전장 생성 ── */
async function startBattle(bkey, cityId, srcCityId, heroIds) {
  const bdef = BATTLES[bkey];
  if (!bdef) return;
  const map = bdef.map.map((r) => (r + 'PPPPPPPPPPPP').slice(0, MAP_W));
  battle = {
    key: bkey, bdef, cityId, srcCityId,
    map, units: [],
    turn: 1, phase: 'player', selId: null, infoId: null, mode: 'idle',
    reach: new Map(), pendingSkill: null,
    over: false, busy: true, fx: [], lunge: null, logLines: [], result: null,
  };
  unitSeq = 0;
  const used = new Set();

  bdef.enemies.forEach((e) => {
    if (!isPassableTile(e.cls, e.x, e.y)) {
      // 설정 좌표가 지형에 맞지 않으면 가까운 통행 가능 타일로 보정
      const fixed = findFreeTile(e.cls, used, MAP_W - 2, 5);
      e = { ...e, x: fixed.x, y: fixed.y };
    }
    const u = makeUnit(e, 'enemy', e.x, e.y);
    battle.units.push(u);
    used.add(key(e.x, e.y));
  });

  const src = cityState(srcCityId);
  heroIds.forEach((hid) => {
    const hd = HERO_MAP[hid];
    const r = state.roster.find((x) => x.id === hid);
    const slot = findStartSlot(hd.cls, used);
    const u = makeUnit({ ...hd, lv: r ? r.lv : hd.lv }, 'ally', slot.x, slot.y);
    u.key = hid;
    if (src) {
      const hpBonus = Math.min(45, Math.round(src.troops / 160));
      u.maxHp += hpBonus; u.hp = u.maxHp;
      u.atk = Math.round(u.atk * (1 + src.train / 500));
    }
    battle.units.push(u);
    used.add(key(slot.x, slot.y));
  });

  battle.logLines = [];
  $('#log').innerHTML = '';
  $('#battle-name').textContent = bdef.title;
  logLine(`${bdef.title} — ${bdef.subtitle}`, 'sys');
  logLine(`아군 ${aliveUnits('ally').length}명 · 적군 ${aliveUnits('enemy').length}명`, 'sys');
  showScreen('battle');
  await sleep(30);
  resizeField();
  renderBattleUI();
  sfx('turn');

  await showDialogue(bdef.intro);
  battle.busy = false;
  banner('아군의 차례');
  toast('아군 유닛을 눌러 이동하고, 적을 눌러 공격하세요');
  renderBattleUI();
}

function findFreeTile(clsKey, used, cx, cy) {
  let best = null;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (used.has(key(x, y))) continue;
    if (!isFinite(terrainCost(clsKey, battle.map[y][x]))) continue;
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (!best || d < best.d) best = { x, y, d };
  }
  return best || { x: 0, y: 0 };
}
function findStartSlot(clsKey, used) {
  let best = null;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (used.has(key(x, y))) continue;
    if (!isFinite(terrainCost(clsKey, battle.map[y][x]))) continue;
    const d = Math.abs(x - 1) * 1.15 + Math.abs(y - 7);
    if (!best || d < best.d) best = { x, y, d };
  }
  return best || { x: 0, y: 0 };
}

/* ── 전투 판정/효과 ── */
function addFx(f) { if (battle) battle.fx.push(Object.assign({ t: 0 }, f)); }
function logLine(text, cls = '') {
  if (!battle) return;
  battle.logLines.push({ text, cls });
  if (battle.logLines.length > 60) battle.logLines.shift();
  const el = $('#log');
  if (el) {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    el.appendChild(p);
    while (el.children.length > 40) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
}
function floatText(x, y, text, color, big = false) {
  addFx({ kind: 'text', x, y, text, color, life: big ? 52 : 44, big });
}
function applyDamage(u, dmg, crit) {
  u.hp = Math.max(0, u.hp - dmg);
  floatText(u.x, u.y, '-' + dmg, crit ? '#ffd76a' : '#ff9d84', !!crit);
  if (u.hp <= 0 && !u.dead) {
    u.dead = true;
    addFx({ kind: 'ring', x: u.x, y: u.y, color: 'rgba(226,120,90,.85)', life: 32 });
    logLine(`${u.name} 쓰러지다`, u.side === 'ally' ? 'bad' : 'good');
    sfx('down');
  }
}
function gainExp(u, amt) {
  if (!u || u.side !== 'ally' || u.dead) return;
  u.exp += amt;
  while (u.exp >= 100) {
    u.exp -= 100;
    u.lv += 1;
    u.maxHp += 6; u.hp += 6;
    u.atk += 2; u.def += 1;
    u.maxMp += 2; u.mp += 2;
    logLine(`✦ ${u.name} Lv.${u.lv} 달성!`, 'lv');
    toast(`${u.name} 레벨 업! Lv.${u.lv}`, 'good');
    addFx({ kind: 'ring', x: u.x, y: u.y, color: 'rgba(255,220,120,.9)', life: 40 });
    sfx('level');
  }
}
async function lunge(a, d) {
  battle.lunge = { id: a.id, dx: Math.sign(d.x - a.x), dy: Math.sign(d.y - a.y), start: performance.now() };
  await sleep(150);
  battle.lunge = null;
  await sleep(60);
}
async function doAttack(a, d) {
  const res = calcDamage(a, d, a.x, a.y);
  await lunge(a, d);
  addFx({ kind: 'slash', x: d.x, y: d.y, life: 24 });
  applyDamage(d, res.dmg, res.crit);
  sfx(res.crit ? 'crit' : 'hit');
  logLine(`${a.name}의 공격 — ${d.name}에게 ${res.dmg} 피해${res.crit ? ' (회심의 일격!)' : ''}`,
    a.side === 'ally' ? 'good' : 'bad');
  gainExp(a, res.crit ? 16 : 12);
  await sleep(170);
  if (!d.dead && inRangeFrom(d, d.x, d.y, a)) {
    const c = calcDamage(d, a, d.x, d.y);
    const cd = Math.max(2, Math.round(c.dmg * 0.55));
    await lunge(d, a);
    applyDamage(a, cd, false);
    sfx('hit');
    logLine(`${d.name}의 반격 — ${a.name}에게 ${cd} 피해`, d.side === 'ally' ? 'good' : 'bad');
    gainExp(d, 4);
    await sleep(140);
  }
  checkBattleEnd();
}

async function playerAttack(a, d) {
  if (!a || !d || battle.busy) return;
  battle.busy = true;
  battle.mode = 'idle';
  battle.reach = new Map();
  renderBattleUI();
  await doAttack(a, d);
  a.moved = true; a.acted = true;
  if (battle.over) { renderBattleUI(); return; }
  battle.busy = false;
  battle.selId = a.id;
  renderBattleUI();
}

async function playerMove(u, x, y) {
  const path = pathTo(battle.reach, x, y);
  if (!path.length) return;
  battle.busy = true;
  battle.mode = 'idle';
  battle.reach = new Map();
  renderBattleUI();
  await animateMove(u, path);
  u.moved = true;
  battle.busy = false;
  battle.mode = 'select';
  renderBattleUI();
}
async function animateMove(u, path) {
  for (const p of path) {
    u.px = p.x; u.py = p.y;
    sfx('step');
    await sleep(80);
  }
  if (path.length) { u.x = path[path.length - 1].x; u.y = path[path.length - 1].y; }
  u.px = null; u.py = null;
}

/* ── 책략 ── */
function startSkill(id) {
  const u = selectedUnit();
  if (!u || u.acted || battle.busy) return;
  const sk = SKILLS[id];
  if (!sk) return;
  if (u.mp < sk.mp) { toast('MP가 부족합니다'); sfx('nope'); return; }
  if (sk.kind === 'healArea') {
    const hurt = battle.units.filter((a) => a.side === 'ally' && !a.dead && a.hp < a.maxHp && cheb(u.x, u.y, a.x, a.y) <= sk.radius);
    if (!hurt.length) { toast('회복할 아군이 없습니다'); sfx('nope'); return; }
  }
  if (sk.kind === 'healArea' || sk.kind === 'buffAreaAllies') { castSkill(u, sk, null, null); return; }
  battle.pendingSkill = id;
  battle.mode = 'skill';
  battle.reach = new Map();
  sfx('tap');
  renderBattleUI();
}
async function handleSkillTap(x, y, target) {
  const u = selectedUnit();
  const sk = SKILLS[battle.pendingSkill];
  if (!u || !sk) return;
  if (sk.kind === 'heal' || sk.kind === 'buff') {
    if (!target || target.side !== 'ally' || target.dead) { toast('아군을 선택하세요'); sfx('nope'); return; }
    if (cheb(u.x, u.y, target.x, target.y) > sk.range) { toast('사거리 밖입니다'); sfx('nope'); return; }
    if (sk.kind === 'heal' && target.hp >= target.maxHp) { toast('이미 HP가 가득합니다'); sfx('nope'); return; }
  } else if (sk.kind === 'magic') {
    if (!target || target.side !== 'enemy' || target.dead) { toast('적을 선택하세요'); sfx('nope'); return; }
    if (cheb(u.x, u.y, target.x, target.y) > sk.range) { toast('사거리 밖입니다'); sfx('nope'); return; }
  } else if (sk.kind === 'debuffArea') {
    if (cheb(u.x, u.y, x, y) > sk.range) { toast('사거리 밖입니다'); sfx('nope'); return; }
  }
  await castSkill(u, sk, target, { x, y });
}
async function castSkill(u, sk, target, tile, opts = {}) {
  if (!u) return;
  if (battle.busy && !opts.force) return;
  const wasBusy = battle.busy;
  battle.busy = true;
  battle.mode = 'idle';
  battle.pendingSkill = null;
  battle.reach = new Map();
  u.mp = Math.max(0, u.mp - sk.mp);
  sfx('cast');
  renderBattleUI();
  const cx = tile ? tile.x : u.x, cy = tile ? tile.y : u.y;
  logLine(`${u.name} — ${sk.name}!`, 'sys');

  if (sk.kind === 'heal') {
    const amt = Math.round(sk.power + u.lv * 3);
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amt);
    const real = target.hp - before;
    floatText(target.x, target.y, '+' + real, '#a8e08a');
    addFx({ kind: 'ring', x: target.x, y: target.y, color: 'rgba(140,230,150,.9)', life: 34 });
    sfx('heal');
    logLine(`${target.name}의 HP ${real} 회복`, 'good');
    gainExp(u, 8);
  } else if (sk.kind === 'healArea') {
    let total = 0;
    aliveUnits('ally').forEach((a) => {
      if (cheb(u.x, u.y, a.x, a.y) <= sk.radius) {
        const amt = Math.round(sk.power + u.lv * 2);
        const before = a.hp;
        a.hp = Math.min(a.maxHp, a.hp + amt);
        total += a.hp - before;
        floatText(a.x, a.y, '+' + (a.hp - before), '#a8e08a');
        addFx({ kind: 'ring', x: a.x, y: a.y, color: 'rgba(140,230,150,.85)', life: 34 });
      }
    });
    sfx('heal');
    logLine(`아군 전체 ${total} HP 회복`, 'good');
    gainExp(u, 10);
  } else if (sk.kind === 'buff') {
    addBuff(target, 'atk', sk.atk, sk.turns);
    floatText(target.x, target.y, '공격↑', '#ffe08a');
    addFx({ kind: 'ring', x: target.x, y: target.y, color: 'rgba(255,215,110,.9)', life: 30 });
    sfx('buff');
    logLine(`${target.name}의 공격력 +${Math.round(sk.atk * 100)}% (${sk.turns}턴)`, 'good');
    gainExp(u, 6);
  } else if (sk.kind === 'buffAreaAllies') {
    aliveUnits('ally').forEach((a) => {
      if (cheb(u.x, u.y, a.x, a.y) <= sk.radius) {
        addBuff(a, 'atk', sk.atk, sk.turns);
        addFx({ kind: 'ring', x: a.x, y: a.y, color: 'rgba(255,215,110,.8)', life: 28 });
      }
    });
    sfx('buff');
    logLine(`주변 아군 공격력 +${Math.round(sk.atk * 100)}% (${sk.turns}턴)`, 'good');
    gainExp(u, 8);
  } else if (sk.kind === 'debuffArea') {
    let n = 0;
    aliveUnits('enemy').forEach((e) => {
      if (cheb(cx, cy, e.x, e.y) <= sk.radius) {
        addBuff(e, 'def', -0.25, sk.turns);
        floatText(e.x, e.y, '방어↓', '#c9a9ff');
        addFx({ kind: 'ring', x: e.x, y: e.y, color: 'rgba(180,140,240,.8)', life: 30 });
        n++;
      }
    });
    addFx({ kind: 'ring', x: cx, y: cy, color: 'rgba(180,140,240,.6)', life: 40, big: true });
    sfx('cast');
    logLine(`적 ${n}명의 방어력 -25% (${sk.turns}턴)`, 'good');
    gainExp(u, 8);
  } else if (sk.kind === 'magic') {
    const dmg = Math.max(6, Math.round((sk.power + u.lv * 3) * rnd(0.92, 1.08) - effDef(target) * 0.15));
    addFx({ kind: 'flame', x: target.x, y: target.y, life: 34 });
    applyDamage(target, dmg, false);
    sfx('cast');
    logLine(`화계 — ${target.name}에게 ${dmg} 피해 (방어 무시)`, 'good');
    gainExp(u, 12);
  }
  await sleep(420);
  if (u.side === 'ally') { u.acted = true; u.moved = true; }
  battle.busy = wasBusy ? true : false;
  renderBattleUI();
  checkBattleEnd();
}

/* ── 턴 진행 ── */
function tickBuffs() {
  battle.units.forEach((u) => {
    u.buffs = u.buffs.filter((b) => { b.turns -= 1; return b.turns > 0; });
  });
}
function startPlayerTurn() {
  battle.turn += 1;
  battle.phase = 'player';
  tickBuffs();
  battle.units.forEach((u) => {
    if (u.dead) return;
    if (u.side === 'ally') {
      u.moved = false; u.acted = false;
      u.mp = Math.min(u.maxMp, u.mp + 4);
    } else {
      u.mp = Math.min(u.maxMp, u.mp + 3);
    }
  });
  battle.turn = Math.min(battle.turn, TURN_LIMIT + 1);
  renderBattleUI();
  banner('아군의 차례');
  checkBattleEnd();
}

async function endPlayerTurn() {
  if (!battle || battle.busy || battle.over || battle.phase !== 'player') return;
  battle.selId = null; battle.infoId = null; battle.mode = 'idle';
  battle.pendingSkill = null; battle.reach = new Map();
  battle.phase = 'enemy';
  battle.busy = true;
  renderBattleUI();
  banner('적의 차례', true);
  sfx('turn');
  await sleep(620);
  const enemies = battle.units.filter((u) => u.side === 'enemy' && !u.dead);
  for (const e of enemies) {
    if (battle.over) break;
    if (e.dead) continue;
    e.moved = false; e.acted = false;
    await enemyAct(e);
    await sleep(140);
  }
  if (battle.over) return;
  battle.busy = false;
  startPlayerTurn();
  battle.busy = false;
  renderBattleUI();
}

/* ── 적 AI ── */
async function enemyAct(u) {
  const foes = aliveUnits('ally');
  if (!foes.length) return;
  const reach = computeReach(u);
  const options = [];
  reach.forEach((n) => {
    if (n.x === u.x && n.y === u.y) { options.push({ x: n.x, y: n.y }); return; }
    const occ = unitAt(n.x, n.y);
    if (!occ) options.push({ x: n.x, y: n.y });
  });
  let best = null;
  for (const opt of options) {
    let score = 0;
    let bestTarget = null, bestScore = -1;
    for (const f of foes) {
      if (!inRangeFrom(u, opt.x, opt.y, f)) continue;
      const dmg = estimateDamage(u, f, opt.x, opt.y);
      let s = dmg;
      if (dmg >= f.hp) s += 80;
      const risk = inRangeFrom(f, f.x, f.y, u) ? estimateDamage(f, u, f.x, f.y) * 0.4 : 0;
      s -= risk;
      if (s > bestScore) { bestScore = s; bestTarget = f; }
    }
    if (bestTarget) score += 110 + bestScore * 1.6;

    let magicTarget = null, magicScore = 0;
    if (u.skills.includes('hwagye') && u.mp >= SKILLS.hwagye.mp) {
      for (const f of foes) {
        if (cheb(opt.x, opt.y, f.x, f.y) <= SKILLS.hwagye.range) {
          const dmg = SKILLS.hwagye.power + u.lv * 3;
          let s = dmg * 1.5 + (dmg >= f.hp ? 70 : 0);
          if (s > magicScore) { magicScore = s; magicTarget = f; }
        }
      }
      score += magicScore;
    }
    const ch = battle.map[opt.y][opt.x];
    score += TERRAIN[ch].def * 130;
    if (u.clsKey === 'sanjeok' && (ch === 'M' || ch === 'F')) score += 26;
    if (u.clsKey === 'sujeok' && ch === 'W') score += 24;
    const nearest = Math.min(...foes.map((f) => cheb(opt.x, opt.y, f.x, f.y)));
    score -= nearest * 2.2;
    if (u.clsKey === 'chaeksa' && nearest <= 1) score -= 50;
    if (!best || score > best.score) best = { ...opt, target: bestTarget, magicTarget, score };
  }
  if (!best) return;
  const path = pathTo(reach, best.x, best.y);
  if (path.length) {
    u.moved = true;
    await animateMove(u, path);
    await sleep(80);
  }
  if (battle.over) return;
  if (best.magicTarget) {
    await castSkill(u, SKILLS.hwagye, best.magicTarget, null, { force: true });
  } else if (best.target) {
    await doAttack(u, best.target);
  }
  u.acted = true;
  renderBattleUI();
}

/* ── 승패 ── */
function checkBattleEnd() {
  if (!battle || battle.over) return;
  const enemiesLeft = aliveUnits('enemy').length;
  const alliesLeft = aliveUnits('ally').length;
  if (enemiesLeft === 0) { endBattle(true); return; }
  if (alliesLeft === 0) { endBattle(false, '전군이 괴멸했다'); return; }
  if (battle.turn > TURN_LIMIT) { endBattle(false, '군량이 바닥나 철수했다'); }
}
async function endBattle(win, reason) {
  if (!battle || battle.over) return;
  battle.over = true;
  battle.busy = true;
  battle.selId = null;
  battle.mode = 'idle';
  battle.result = { win, reason };
  renderBattleUI();
  sfx(win ? 'victory' : 'defeat');
  await sleep(500);
  if (win) {
    await showDialogue([{ who: '조조', hanja: '曹操', cls: 'gunwoong', side: 'ally', text: battle.bdef.winLine }]);
  } else {
    await showDialogue([{ who: '조조', hanja: '曹操', cls: 'gunwoong', side: 'ally', text: `${reason || '패배'}… 오늘은 물러난다.` }]);
  }
  showBattleResult(win, reason);
}

function showBattleResult(win, reason) {
  const b = battle;
  const reward = b.bdef.reward || { gold: 0, rice: 0 };
  const defeated = b.units.filter((u) => u.side === 'enemy' && u.dead).length;
  const rw = win
    ? `<div class="cost-line"><span>노획 금</span><b>+${fmt(reward.gold)}</b></div>
       <div class="cost-line"><span>노획 군량</span><b>+${fmt(reward.rice)}</b></div>
       <div class="cost-line"><span>명성</span><b>+1</b></div>`
    : `<div class="cost-line bad"><span>${b.srcCityId ? cityDef(b.srcCityId).name : '본진'} 병력</span><b>-500</b></div>
       <div class="cost-line bad"><span>군량</span><b>-100</b></div>`;
  const m = openModal(`
    <h2 style="color:${win ? '#ffe9a8' : '#f0a58c'}">${win ? '승 리' : '패 배'}</h2>
    <div class="sub">${b.bdef.title} · ${Math.min(b.turn, TURN_LIMIT)}턴 · 격파 ${defeated}/${b.bdef.enemies.length}</div>
    <div class="rule"></div>
    ${rw}
    <div class="row"><button class="btn primary" id="res-ok">${win ? '지도로 돌아가기' : '본진으로 돌아가기'}</button></div>
  `, { sticky: true });
  m.el.querySelector('#res-ok').addEventListener('click', () => {
    m.close();
    applyBattleResult(win);
    returnToMap();
  });
}

function applyBattleResult(win) {
  const b = battle;
  // 장수 경험치/레벨 저장
  b.units.filter((u) => u.side === 'ally').forEach((u) => {
    const r = state.roster.find((x) => x.id === u.key);
    if (r) { r.lv = u.lv; r.exp = u.exp; }
  });
  const cs = cityState(b.cityId);
  if (win) {
    cs.owner = 'player';
    cs.troops = 1200 + Math.floor(Math.random() * 400);
    cs.train = Math.max(40, cs.train);
    state.gold += b.bdef.reward.gold;
    state.rice += b.bdef.reward.rice;
    state.fame += 1;
    state.battlesWon += 1;
    if (!state.cleared.includes(b.key)) state.cleared.push(b.key);
    state.log.unshift(`${cityDef(b.cityId).name}을 평정했다. (${state.battlesWon}번째 승리)`);
  } else {
    const src = cityState(b.srcCityId);
    if (src) src.troops = Math.max(0, src.troops - 500);
    state.rice = Math.max(0, state.rice - 100);
    state.log.unshift(`${cityDef(b.cityId).name} 공략에 실패해 물러났다.`);
  }
  state.log = state.log.slice(0, 12);
  saveGame();
  if (win && state.cities.every((c) => c.owner === 'player')) pendingFinal = true;
}

function returnToMap() {
  battle = null;
  showScreen('map');
  renderMapScreen();
  if (pendingFinal) {
    pendingFinal = false;
    setTimeout(() => {
      const m = openModal(`
        <h2>천 하 통 일</h2>
        <div class="sub">모든 거점이 조조의 깃발 아래 들어왔다.</div>
        <div class="rule"></div>
        <div class="cost-line"><span>거점</span><b>${state.cities.length} / ${state.cities.length}</b></div>
        <div class="cost-line"><span>전투 승리</span><b>${state.battlesWon}회</b></div>
        <div class="cost-line"><span>명성</span><b>${state.fame}</b></div>
        <div class="rule"></div>
        <div class="sub">1단계 프로토타입의 끝. 다음 단계에서 더 많은 거점과 장수, 시나리오가 이어진다.</div>
        <div class="row"><button class="btn primary" id="fin-ok">계속 둘러보기</button></div>
      `, { sticky: true });
      m.el.querySelector('#fin-ok').addEventListener('click', m.close);
      sfx('victory');
    }, 500);
  }
}

/* ────────────────────────── 7. 전장 그리기 ────────────────────────── */
const field = $('#field');
const fctx = field.getContext('2d');
let view = { tile: 32, dpr: 1, w: 0, h: 0 };
let terrainCanvas = null;

function resizeField() {
  if (!battle) return;
  const wrap = $('#field-wrap');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (W < 20 || H < 20) return;
  const tile = Math.max(12, Math.floor(Math.min((W - 10) / MAP_W, (H - 10) / MAP_H)));
  const cssW = tile * MAP_W, cssH = tile * MAP_H;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  field.width = Math.round(cssW * dpr);
  field.height = Math.round(cssH * dpr);
  field.style.width = cssW + 'px';
  field.style.height = cssH + 'px';
  view = { tile, dpr, w: cssW, h: cssH };
  const gapY = (H - cssH) / 2;
  wrap.classList.toggle('tight', gapY < 34);
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fctx.imageSmoothingEnabled = false;
  buildTerrain();
}

function h2(x, y, s = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function drawTile(ctx, tx, ty, ch, T) {
  const x = tx * T, y = ty * T;
  const base = { P: '#50693c', R: '#9b8055', F: '#3a5430', M: '#6b6252', W: '#224e6d', B: '#2f5471', G: '#6d6455', C: '#453d33' }[ch] || '#50693c';
  ctx.fillStyle = base;
  ctx.fillRect(x, y, T, T);
  const r1 = h2(tx, ty, 1), r2 = h2(tx, ty, 2), r3 = h2(tx, ty, 3);

  if (ch === 'P' || ch === 'R' || ch === 'F' || ch === 'G') {
    if (ch === 'P') {
      ctx.fillStyle = '#476034';
      for (let i = 0; i < 3; i++) {
        const px = x + 3 + h2(tx, ty, i + 5) * (T - 8);
        const py = y + 4 + h2(tx, ty, i + 9) * (T - 10);
        ctx.fillRect(px, py, Math.max(2, T * 0.09), Math.max(2, T * 0.03));
      }
      if (r1 > 0.82) {
        ctx.fillStyle = '#78915a';
        ctx.fillRect(x + T * 0.2, y + T * 0.3, T * 0.08, T * 0.08);
        ctx.fillRect(x + T * 0.62, y + T * 0.66, T * 0.08, T * 0.08);
      }
    } else if (ch === 'R') {
      ctx.fillStyle = '#8a7048';
      ctx.fillRect(x, y + T * 0.46, T, T * 0.08);
      ctx.fillStyle = '#b09565';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x + h2(tx, ty, i + 3) * (T - 4), y + h2(tx, ty, i + 7) * (T - 4), Math.max(2, T * 0.06), Math.max(2, T * 0.06));
      }
    } else if (ch === 'F') {
      for (let i = 0; i < 2; i++) {
        const cx = x + T * (0.27 + i * 0.42) + (r2 - 0.5) * T * 0.08;
        const cy = y + T * (0.68 - i * 0.1);
        ctx.fillStyle = '#4a3320';
        ctx.fillRect(cx - T * 0.035, cy, Math.max(1, T * 0.07), T * 0.24);
        ctx.fillStyle = '#2b4626';
        ctx.beginPath(); ctx.arc(cx, cy - T * 0.1, T * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3d6234';
        ctx.beginPath(); ctx.arc(cx - T * 0.07, cy - T * 0.2, T * 0.13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(20,30,15,.35)';
        ctx.beginPath(); ctx.arc(cx + T * 0.06, cy - T * 0.04, T * 0.12, 0, Math.PI * 2); ctx.fill();
      }
    } else if (ch === 'G') {
      ctx.fillStyle = '#7b7060';
      for (let i = 0; i < 3; i++) ctx.fillRect(x, y + T * (0.18 + i * 0.26), T, Math.max(1, T * 0.03));
      ctx.fillStyle = '#554c3f';
      ctx.fillRect(x + T * 0.22, y + T * 0.36, T * 0.56, T * 0.64);
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.moveTo(x + T * 0.28, y + T);
      ctx.lineTo(x + T * 0.28, y + T * 0.58);
      ctx.quadraticCurveTo(x + T * 0.5, y + T * 0.38, x + T * 0.72, y + T * 0.58);
      ctx.lineTo(x + T * 0.72, y + T);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9a44a';
      ctx.fillRect(x + T * 0.34, y + T * 0.24, Math.max(1, T * 0.05), Math.max(1, T * 0.05));
      ctx.fillRect(x + T * 0.62, y + T * 0.24, Math.max(1, T * 0.05), Math.max(1, T * 0.05));
      ctx.fillStyle = '#8c3a24';
      ctx.fillRect(x, y, T, T * 0.1);
    }
  } else if (ch === 'M') {
    const peak = 0.34 + r1 * 0.26;
    ctx.fillStyle = '#5b5444';
    ctx.beginPath();
    ctx.moveTo(x + T * (peak - 0.44), y + T);
    ctx.lineTo(x + T * (peak - 0.1), y + T * 0.36);
    ctx.lineTo(x + T * (peak + 0.3), y + T);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7e7565';
    ctx.beginPath();
    ctx.moveTo(x + T * (peak - 0.28), y + T);
    ctx.lineTo(x + T * peak, y + T * (0.16 + r2 * 0.08));
    ctx.lineTo(x + T * (peak + 0.36), y + T);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a89d88';
    ctx.beginPath();
    ctx.moveTo(x + T * peak, y + T * (0.16 + r2 * 0.08));
    ctx.lineTo(x + T * (peak + 0.11), y + T * 0.56);
    ctx.lineTo(x + T * (peak - 0.03), y + T * 0.56);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,34,24,.30)';
    ctx.beginPath();
    ctx.moveTo(x + T * (peak + 0.36), y + T);
    ctx.lineTo(x + T * peak, y + T * (0.16 + r2 * 0.08));
    ctx.lineTo(x + T * (peak + 0.08), y + T * 0.72);
    ctx.closePath(); ctx.fill();
  } else if (ch === 'W') {
    ctx.fillStyle = '#2c6285';
    for (let i = 0; i < 3; i++) {
      const wy = y + T * (0.22 + i * 0.28);
      const off = Math.sin((tx + ty) * 1.7 + i) * T * 0.08;
      ctx.fillRect(x + T * 0.14 + off, wy, T * 0.34, Math.max(1, T * 0.045));
      ctx.fillRect(x + T * 0.54 - off, wy + T * 0.08, T * 0.3, Math.max(1, T * 0.04));
    }
    ctx.fillStyle = 'rgba(160,210,230,.12)';
    ctx.fillRect(x, y + T * 0.5 + Math.sin(tx * 2) * T * 0.06, T, Math.max(1, T * 0.05));
  } else if (ch === 'B') {
    ctx.fillStyle = '#2c6285';
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = '#7d5f39';
    ctx.fillRect(x + T * 0.08, y, T * 0.84, T);
    ctx.fillStyle = '#5a4226';
    for (let i = 0; i < 5; i++) ctx.fillRect(x + T * 0.08, y + T * (0.1 + i * 0.2), T * 0.84, Math.max(1, T * 0.03));
    ctx.fillStyle = '#4a3320';
    ctx.fillRect(x + T * 0.06, y, Math.max(1, T * 0.06), T);
    ctx.fillRect(x + T * 0.88, y, Math.max(1, T * 0.06), T);
  } else if (ch === 'C') {
    ctx.fillStyle = '#574e42';
    for (let i = 0; i < 4; i++) ctx.fillRect(x, y + T * (0.14 + i * 0.24), T, Math.max(1, T * 0.05));
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(x, y, T, T * 0.12);
  }

  ctx.strokeStyle = 'rgba(0,0,0,.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
}

function buildTerrain() {
  if (!battle) return;
  const c = document.createElement('canvas');
  c.width = Math.round(view.w * view.dpr);
  c.height = Math.round(view.h * view.dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) drawTile(ctx, x, y, battle.map[y][x], view.tile);
  terrainCanvas = c;
}

function tileRect(x, y) { return { x: x * view.tile, y: y * view.tile, s: view.tile }; }
function fillTile(x, y, fill) {
  const r = tileRect(x, y);
  fctx.fillStyle = fill;
  fctx.fillRect(r.x + 1, r.y + 1, r.s - 2, r.s - 2);
}
function strokeTile(x, y, stroke, lw = 1.4) {
  const r = tileRect(x, y);
  fctx.strokeStyle = stroke;
  fctx.lineWidth = lw;
  fctx.strokeRect(r.x + 1.5, r.y + 1.5, r.s - 3, r.s - 3);
}

function drawSprite(ctx, t, u) {
  const s = t / 16;
  const P = PAL[u.side] || PAL.ally;
  const cls = u.clsKey;
  const mounted = cls === 'gibi' || cls === 'gunggi';
  const skin = '#e9c39a', skinD = '#c99a70', ink = '#241708';
  const R = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  };
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath();
  ctx.ellipse(8 * s, 15.3 * s, 5.2 * s, 1.9 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  if (mounted) {
    R(1, 8.2, 2, 3.4, P.horseD);
    R(2.4, 7.6, 9, 4, P.horse);
    R(2.4, 7.6, 9, 0.8, P.horseD);
    R(11, 5.2, 2.6, 3.6, P.horse);
    R(12.6, 4.0, 3.0, 2.6, P.horse);
    R(14.8, 3.4, 1, 1.4, P.horseD);
    R(13.4, 4.9, 1, 1, ink);
    R(11.4, 4.4, 1, 2.2, P.horseD);
    R(3, 11.4, 1.6, 3.2, P.horseD);
    R(6.4, 11.4, 1.6, 3.2, P.horseD);
    R(9.6, 11.4, 1.6, 3.2, P.horseD);
    R(4.4, 7.3, 5, 1.5, P.dark);
  }
  const oy = mounted ? -1.2 : 0;

  if (!mounted) {
    R(6, 11.4, 2, 3.2, P.dark);
    R(9, 11.4, 2, 3.2, P.dark);
    R(5.2, 14.4, 3, 1.1, ink);
    R(8.8, 14.4, 3, 1.1, ink);
  }
  // 몸통
  R(5, 6.6 + oy, 6, 5.2, P.main);
  R(6, 7.2 + oy, 4, 1, P.light);
  R(5, 10.8 + oy, 6, 1.1, P.dark);
  R(4, 6.6 + oy, 1.6, 2.6, P.dark);
  R(10.4, 6.6 + oy, 1.6, 2.6, P.dark);
  R(4, 6.6 + oy, 1.6, 0.7, P.trim);
  R(10.4, 6.6 + oy, 1.6, 0.7, P.trim);
  // 머리
  R(6, 2.6 + oy, 4, 4, skin);
  R(6, 5.4 + oy, 4, 0.8, skinD);
  R(7, 4.3 + oy, 1, 1, ink);
  R(8.9, 4.3 + oy, 1, 1, ink);
  // 투구
  R(5.2, 1.4 + oy, 5.6, 1.6, P.main);
  R(7.2, 0.4 + oy, 1.6, 1.2, P.trim);
  R(5.2, 2.6 + oy, 1.2, 0.9, P.dark);
  R(9.6, 2.6 + oy, 1.2, 0.9, P.dark);

  // 망토
  if (cls === 'gunwoong') R(3.8, 7.2 + oy, 1.4, 4.2, P.light);
  if (cls === 'chaeksa') R(3.9, 7.0 + oy, 1.2, 4.4, '#e6dbc0');
  if (cls === 'pungsusa') R(3.9, 7.0 + oy, 1.2, 4.4, '#8fd6c8');

  if (cls === 'gunwoong' || cls === 'bobyung') {
    R(12.2, 2.8 + oy, 0.9, 6.4, '#d6dde6');
    R(11.4, 9.0 + oy, 2.6, 0.9, P.trim);
    R(12.2, 9.9 + oy, 0.9, 1.6, '#6b4a2a');
  } else if (cls === 'gibi') {
    R(13.4, 0.4, 0.9, 14.4, '#8a6238');
    ctx.fillStyle = '#d6dde6';
    ctx.beginPath();
    ctx.moveTo(13.85 * s, 0 * s);
    ctx.lineTo(14.7 * s, 2.3 * s);
    ctx.lineTo(13.0 * s, 2.3 * s);
    ctx.closePath(); ctx.fill();
  } else if (cls === 'gunggi' || cls === 'gungbyung') {
    const bx = 12.4, by = 6.4, br = 3.1, a1 = -0.36 * Math.PI, a2 = 0.36 * Math.PI;
    ctx.strokeStyle = '#c9a44a';
    ctx.lineWidth = Math.max(1, 0.85 * s);
    ctx.beginPath();
    ctx.arc(bx * s, by * s, br * s, a1, a2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,232,200,.85)';
    ctx.lineWidth = Math.max(1, 0.3 * s);
    ctx.beginPath();
    ctx.moveTo((bx + br * Math.cos(a1)) * s, (by + br * Math.sin(a1)) * s);
    ctx.lineTo((bx + br * Math.cos(a2)) * s, (by + br * Math.sin(a2)) * s);
    ctx.stroke();
  } else if (cls === 'sanjeok') {
    R(12.6, 1.6, 0.9, 12, '#6b4a2a');
    R(12.9, 2.2, 2.6, 2.4, '#b8c0c8');
    R(12.9, 2.2, 2.6, 0.6, '#e6eef5');
  } else if (cls === 'sujeok') {
    R(13.4, 1.4, 0.9, 12, '#6b4a2a');
    R(12.2, 0.8, 0.8, 2.6, '#c8d0d8');
    R(13.4, 0.2, 0.9, 3.4, '#c8d0d8');
    R(14.6, 0.8, 0.8, 2.6, '#c8d0d8');
  } else if (cls === 'pungsusa') {
    R(13.2, 2.0 + oy, 0.9, 11, '#5b3a1e');
    ctx.fillStyle = '#8fe0ff';
    ctx.beginPath();
    ctx.arc(13.65 * s, (1.5 + oy) * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(143,224,255,.35)';
    ctx.beginPath();
    ctx.arc(13.65 * s, (1.5 + oy) * s, 2.4 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (cls === 'chaeksa') {
    ctx.fillStyle = '#efe6cf';
    ctx.beginPath();
    ctx.moveTo(13 * s, 3.2 * s);
    ctx.lineTo(15.4 * s, 7.4 * s);
    ctx.lineTo(10.6 * s, 7.4 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b9ab8c';
    ctx.fillRect(12.4 * s, 7.0 * s, 1.2 * s, 2.2 * s);
  }
}

function makePortrait(clsKey, side) {
  const c = document.createElement('canvas');
  c.width = 100; c.height = 120;
  c.className = 'portrait';
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(50, 50, 6, 50, 56, 72);
  g.addColorStop(0, side === 'ally' ? '#2b3f5e' : '#4a2419');
  g.addColorStop(1, '#0b0704');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 100, 120);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(50, 104, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(201,164,74,.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 98, 118);
  ctx.save();
  ctx.translate(2, 6);
  drawSprite(ctx, 96, { clsKey, side });
  ctx.restore();
  return c;
}

function drawUnit(u) {
  const T = view.tile;
  let x = u.px != null ? u.px : u.x;
  let y = u.py != null ? u.py : u.y;
  let ox = 0, oy = 0;
  if (battle.lunge && battle.lunge.id === u.id) {
    const el = performance.now() - battle.lunge.start;
    const p = clamp(el / 260, 0, 1);
    const k = Math.sin(p * Math.PI) * 0.34;
    ox = battle.lunge.dx * k * T;
    oy = battle.lunge.dy * k * T;
  }
  const px = x * T + ox, py = y * T + oy;
  const sel = battle.selId === u.id;
  fctx.save();
  fctx.translate(px + T / 2, py + T / 2);
  if (u.side === 'enemy') fctx.scale(-1, 1);
  fctx.globalAlpha = u.acted ? 0.55 : 1;
  fctx.translate(-T / 2, -T / 2);
  drawSprite(fctx, T, u);
  fctx.restore();

  if (u.acted && !u.dead) {
    fctx.fillStyle = 'rgba(10,7,4,.22)';
    fctx.fillRect(px + 1, py + 1, T - 2, T - 2);
  }
  // 선택 표시
  if (sel) {
    const pulse = 0.55 + Math.sin(performance.now() / 220) * 0.35;
    fctx.strokeStyle = `rgba(255,224,140,${pulse})`;
    fctx.lineWidth = 2;
    fctx.strokeRect(px + 1.5, py + 1.5, T - 3, T - 3);
  }
  // HP 바
  const bw = T * 0.72, bh = Math.max(3, T * 0.075);
  const bx = px + (T - bw) / 2, by = py + T * 0.03;
  fctx.fillStyle = 'rgba(8,5,2,.8)';
  fctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  const ratio = clamp(u.hp / u.maxHp, 0, 1);
  fctx.fillStyle = u.side === 'ally' ? (ratio > 0.5 ? '#6fbf5b' : ratio > 0.25 ? '#d9b64a' : '#c0503a') : '#c0503a';
  fctx.fillRect(bx, by, bw * ratio, bh);
  fctx.strokeStyle = 'rgba(255,235,190,.35)';
  fctx.lineWidth = 1;
  fctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);

  if (u.boss) {
    fctx.fillStyle = '#ffd76a';
    fctx.beginPath();
    const sx = px + T / 2, sy = py - T * 0.06;
    fctx.moveTo(sx, sy - T * 0.09);
    fctx.lineTo(sx + T * 0.09, sy);
    fctx.lineTo(sx, sy + T * 0.09);
    fctx.lineTo(sx - T * 0.09, sy);
    fctx.closePath(); fctx.fill();
  }
  if (u.side === 'ally' && !u.acted && battle.phase === 'player' && !battle.over) {
    const blink = 0.35 + Math.sin(performance.now() / 380) * 0.3;
    fctx.fillStyle = `rgba(140,210,255,${blink})`;
    fctx.fillRect(px + T * 0.44, py + T * 0.92, T * 0.12, T * 0.05);
  }
}

function drawFx() {
  const T = view.tile;
  for (const f of battle.fx) {
    f.t += 1;
    const p = f.t / f.life;
    if (p >= 1) continue;
    const cx = f.x * T + T / 2, cy = f.y * T + T / 2;
    if (f.kind === 'text') {
      fctx.globalAlpha = 1 - p * p;
      fctx.font = `700 ${Math.round(T * (f.big ? 0.5 : 0.4))}px "Noto Sans KR", sans-serif`;
      fctx.textAlign = 'center';
      fctx.lineWidth = 3;
      fctx.strokeStyle = 'rgba(0,0,0,.85)';
      fctx.strokeText(f.text, cx, cy - T * 0.15 - p * T * 0.7);
      fctx.fillStyle = f.color;
      fctx.fillText(f.text, cx, cy - T * 0.15 - p * T * 0.7);
      fctx.globalAlpha = 1;
    } else if (f.kind === 'slash') {
      fctx.globalAlpha = 1 - p;
      fctx.strokeStyle = '#fff2c0';
      fctx.lineWidth = Math.max(2, T * 0.11);
      fctx.beginPath();
      fctx.moveTo(cx - T * 0.34, cy - T * 0.34);
      fctx.lineTo(cx + T * 0.34, cy + T * 0.34);
      fctx.moveTo(cx + T * 0.28, cy - T * 0.38);
      fctx.lineTo(cx - T * 0.2, cy + T * 0.1);
      fctx.stroke();
      fctx.globalAlpha = 1;
    } else if (f.kind === 'ring') {
      fctx.globalAlpha = (1 - p) * 0.9;
      fctx.strokeStyle = f.color;
      fctx.lineWidth = Math.max(1.5, T * 0.08 * (1 - p));
      fctx.beginPath();
      fctx.arc(cx, cy, T * (0.15 + p * (f.big ? 0.75 : 0.5)), 0, Math.PI * 2);
      fctx.stroke();
      fctx.globalAlpha = 1;
    } else if (f.kind === 'flame') {
      fctx.globalAlpha = (1 - p) * 0.95;
      for (let i = 0; i < 5; i++) {
        const fx = cx + (h2(i, f.t, 3) - 0.5) * T * 0.6;
        const fy = cy - p * T * (0.3 + h2(i, f.t, 7) * 0.7);
        const rr = T * 0.14 * (1 - p);
        const grd = fctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(1, rr));
        grd.addColorStop(0, 'rgba(255,235,150,.95)');
        grd.addColorStop(0.5, 'rgba(255,140,60,.8)');
        grd.addColorStop(1, 'rgba(200,60,30,0)');
        fctx.fillStyle = grd;
        fctx.beginPath(); fctx.arc(fx, fy, Math.max(1, rr), 0, Math.PI * 2); fctx.fill();
      }
      fctx.globalAlpha = 1;
    }
  }
  battle.fx = battle.fx.filter((f) => f.t < f.life);
}

function drawField() {
  if (!battle || !terrainCanvas) return;
  const T = view.tile;
  fctx.clearRect(0, 0, view.w, view.h);
  fctx.drawImage(terrainCanvas, 0, 0, view.w, view.h);

  const sel = selectedUnit();

  // 이동 범위
  if (sel && !sel.acted && battle.phase === 'player' && battle.mode !== 'skill') {
    if (!sel.moved) {
      battle.reach.forEach((n) => {
        if (n.x === sel.x && n.y === sel.y) return;
        if (!canStopAt(n.x, n.y, sel)) return;
        fillTile(n.x, n.y, 'rgba(86,150,230,.30)');
        strokeTile(n.x, n.y, 'rgba(150,205,255,.55)');
      });
    }
  }

  // 사거리
  if (sel && !sel.acted && battle.phase === 'player' && battle.mode !== 'skill') {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (x === sel.x && y === sel.y) continue;
      const enemy = battle.units.find((u) => !u.dead && u.side === 'enemy' && u.x === x && u.y === y);
      if (enemy && inRangeFrom(sel, sel.x, sel.y, enemy)) {
        fillTile(x, y, 'rgba(220,80,60,.34)');
        strokeTile(x, y, 'rgba(255,140,110,.8)', 2);
      }
    }
  }

  // 책략 대상
  if (sel && battle.mode === 'skill' && battle.pendingSkill) {
    const sk = SKILLS[battle.pendingSkill];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const dist = cheb(sel.x, sel.y, x, y);
      if (dist < 1 || dist > (sk.range || 0)) continue;
      const u = battle.units.find((q) => !q.dead && q.x === x && q.y === y);
      let valid = false;
      if ((sk.kind === 'heal' || sk.kind === 'buff') && u && u.side === 'ally') valid = true;
      if (sk.kind === 'magic' && u && u.side === 'enemy') valid = true;
      if (sk.kind === 'debuffArea') valid = true;
      if (!valid) continue;
      const color = (sk.kind === 'heal' || sk.kind === 'buff') ? 'rgba(90,210,130,.32)' : 'rgba(220,90,70,.30)';
      const line = (sk.kind === 'heal' || sk.kind === 'buff') ? 'rgba(160,255,190,.8)' : 'rgba(255,150,120,.8)';
      fillTile(x, y, color);
      strokeTile(x, y, line, 2);
      if (sk.kind === 'debuffArea') {
        for (let yy = 0; yy < MAP_H; yy++) for (let xx = 0; xx < MAP_W; xx++) {
          if (cheb(x, y, xx, yy) <= sk.radius && cheb(x, y, xx, yy) > 0) fillTile(xx, yy, 'rgba(170,120,240,.12)');
        }
      }
    }
  }

  const units = battle.units.filter((u) => !u.dead).sort((a, b) => (a.py != null ? a.py : a.y) - (b.py != null ? b.py : b.y));
  units.forEach(drawUnit);
  drawFx();
}

/* ────────────────────────── 8. 전장 UI ────────────────────────── */
function banner(text, enemy = false) {
  const el = $('#phase-banner');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('enemy', enemy);
  el.classList.add('show');
  clearTimeout(banner._t);
  banner._t = setTimeout(() => el.classList.remove('show'), 1100);
}

function renderBattleUI() {
  if (!battle) return;
  $('#battle-turn').textContent = `${Math.min(battle.turn, TURN_LIMIT)}턴 / ${TURN_LIMIT}`;
  const ph = $('#battle-phase');
  const enemyN = aliveUnits('enemy').length;
  const narrow = window.innerWidth < 430;
  ph.textContent = battle.phase === 'player'
    ? (narrow ? `아군 · 적 ${enemyN}` : `아군 페이즈 · 적 ${enemyN}`)
    : (narrow ? '적의 차례' : '적의 페이즈');
  ph.className = 'battle-status ' + (battle.phase === 'player' ? 'ally' : 'enemy');
  // 전력 게이지
  const allies = battle.units.filter((u) => u.side === 'ally');
  const enemies = battle.units.filter((u) => u.side === 'enemy');
  const aRatio = allies.length ? allies.reduce((s, u) => s + Math.max(0, u.hp), 0) / allies.reduce((s, u) => s + u.maxHp, 0) : 0;
  const eRatio = enemies.length ? enemies.reduce((s, u) => s + Math.max(0, u.hp), 0) / enemies.reduce((s, u) => s + u.maxHp, 0) : 0;
  const ap = $('#ally-power'), ep = $('#enemy-power');
  if (ap) ap.style.width = Math.round(aRatio * 100) + '%';
  if (ep) ep.style.width = Math.round(eRatio * 100) + '%';
  renderLog();
  renderUnitCard();
  renderActions();
}

function renderLog() {
  const el = $('#log');
  if (!el || !battle) return;
  el.innerHTML = battle.logLines.slice(-24).map((l) => `<p class="${l.cls}">${escapeHTML(l.text)}</p>`).join('');
  el.scrollTop = el.scrollHeight;
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function unitCardUnit() {
  const sel = selectedUnit();
  if (sel) return sel;
  if (battle.infoId) return battle.units.find((u) => u.id === battle.infoId);
  return null;
}

function renderUnitCard() {
  const el = $('#unit-card');
  if (battle.over) {
    el.innerHTML = `<div class="u-body"><div class="u-top"><span class="u-name">${battle.bdef.title}</span>
      <span class="u-hanja">${battle.bdef.subtitle}</span></div>
      <div class="u-empty">전투가 끝났습니다.<br/><span style="color:#8f7f62">결과 창을 확인하세요.</span></div></div>`;
    return;
  }
  const u = unitCardUnit();
  if (!u) {
    const remaining = battle.units.filter((q) => q.side === 'ally' && !q.dead && !q.acted).length;
    el.innerHTML = `<div class="u-body">
      <div class="u-top"><span class="u-name">${battle.bdef.title}</span></div>
      <div class="u-empty">지도 위의 <b>아군 유닛</b>을 눌러 이동하고,<br/>붉게 표시된 <b>적</b>을 눌러 공격하세요.<br/>
      <span style="color:#8f7f62">아직 행동 가능한 부대 ${remaining}개 · ${battle.phase === 'player' ? '아군 차례' : '적 차례'}</span></div>
      <div class="allies">${battle.units.filter((q) => q.side === 'ally').map((q) => `
        <span class="ally-chip ${q.acted || q.dead ? 'done' : ''}" data-sel="${q.id}">
          ${q.dead ? '✕ ' : ''}${q.name}<span class="hp"><i style="width:${Math.round(100 * q.hp / q.maxHp)}%"></i></span>
        </span>`).join('')}</div>
    </div>`;
    el.querySelectorAll('[data-sel]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const unit = battle.units.find((q) => q.id === chip.getAttribute('data-sel'));
        if (unit && !unit.dead && unit.side === 'ally' && !unit.acted && battle.phase === 'player' && !battle.busy) selectUnit(unit);
        else if (unit) { battle.infoId = unit.id; renderBattleUI(); }
      });
    });
    return;
  }
  const t = terrainAt(u.x, u.y);
  const atkMod = atkTerrainMod(u, u.x, u.y);
  const buffs = u.buffs.map((b) => `${b.stat === 'atk' ? '공격' : '방어'}${b.value > 0 ? '+' : ''}${Math.round(b.value * 100)}%(${b.turns})`).join(' · ');
  el.innerHTML = `<div class="p-slot"></div>
    <div class="u-body">
      <div class="u-top">
        <span class="u-name">${u.name}</span>
        <span class="u-hanja">${u.hanja}</span>
        <span class="u-class">${u.cls.name}</span>
        <span class="u-lv">Lv.${u.lv}${u.boss ? ' · 장수' : ''}</span>
      </div>
      <div class="u-bar"><span class="lab">HP</span><div class="bar hp"><i style="width:${Math.round(100 * u.hp / u.maxHp)}%"></i></div><span class="u-val">${u.hp}/${u.maxHp}</span></div>
      <div class="u-bar"><span class="lab">MP</span><div class="bar mp"><i style="width:${Math.round(100 * u.mp / u.maxMp)}%"></i></div><span class="u-val">${u.mp}/${u.maxMp}</span></div>
      <div class="u-meta"><span>공 <b>${Math.round(effAtk(u))}</b></span><span>방 <b>${Math.round(effDef(u))}</b></span>
        <span>이동 <b>${u.mov}</b></span><span>사거리 <b>${effectiveRange(u)}</b></span></div>
      <div class="u-terrain">${t.name} · 방어 ${t.def >= 0 ? '+' : ''}${Math.round(t.def * 100)}%${atkMod > 0 ? ` · 공격 +${Math.round(atkMod * 100)}%` : ''}${buffs ? ` · ${buffs}` : ''}</div>
    </div>`;
  el.querySelector('.p-slot').appendChild(makePortrait(u.clsKey, u.side));
}

function renderActions() {
  const el = $('#actions');
  if (!battle) return;
  const sel = selectedUnit();
  const playerTurn = battle.phase === 'player' && !battle.over && !battle.busy;
  const parts = [];

  if (battle.over) {
    el.innerHTML = `<div class="hint">전투가 끝났습니다.</div>`;
    return;
  }

  if (!playerTurn) {
    parts.push(`<button class="btn wide" disabled>${battle.phase === 'enemy' ? '적군이 움직이는 중…' : '잠시만 기다리세요'}</button>`);
    el.innerHTML = parts.join('');
    return;
  }

  if (sel && !sel.acted) {
    if (sel.skills.length) {
      sel.skills.forEach((sid) => {
        const sk = SKILLS[sid];
        parts.push(`<button class="btn skill ${battle.pendingSkill === sid ? 'primary' : ''}" data-skill="${sid}">${sk.name}<small>MP ${sk.mp}</small></button>`);
      });
    }
    parts.push(`<button class="btn ghost" data-act="wait">${sel.moved ? '대기' : '이동 안 함'}</button>`);
    parts.push(`<button class="btn" data-act="clear">선택 해제</button>`);
    parts.push(`<button class="btn primary wide" data-act="end">턴 종료</button>`);
    if (battle.mode === 'skill') {
      parts.unshift(`<div class="hint">${SKILLS[battle.pendingSkill].name} — ${SKILLS[battle.pendingSkill].desc}</div>`);
    }
  } else if (sel && sel.acted) {
    parts.push(`<button class="btn wide" disabled>${sel.name} — 이번 턴 행동 완료</button>`);
    parts.push(`<button class="btn ghost" data-act="select-next">다음 부대</button>`);
    parts.push(`<button class="btn primary" data-act="end">턴 종료</button>`);
  } else {
    parts.push(`<button class="btn ghost" data-act="select-next">다음 부대</button>`);
    parts.push(`<button class="btn" data-act="help">조작법</button>`);
    parts.push(`<button class="btn primary" data-act="end">턴 종료</button>`);
  }
  el.innerHTML = parts.join('');
  el.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => startSkill(b.getAttribute('data-skill'))));
  el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const act = b.getAttribute('data-act');
    if (act === 'end') endPlayerTurn();
    else if (act === 'clear') { battle.selId = null; battle.mode = 'idle'; battle.pendingSkill = null; battle.reach = new Map(); renderBattleUI(); }
    else if (act === 'wait') {
      const u = selectedUnit();
      if (u) { u.acted = true; u.moved = true; }
      battle.selId = null; battle.mode = 'idle'; battle.pendingSkill = null;
      renderBattleUI();
    } else if (act === 'select-next') {
      const next = battle.units.find((q) => q.side === 'ally' && !q.dead && !q.acted);
      if (next) selectUnit(next); else toast('행동할 부대가 없습니다');
    } else if (act === 'help') openHelp();
  }));
}

function selectUnit(u) {
  if (!u || u.dead || u.acted || u.side !== 'ally' || battle.phase !== 'player' || battle.busy) return;
  battle.selId = u.id;
  battle.infoId = null;
  battle.mode = 'select';
  battle.pendingSkill = null;
  battle.reach = u.moved ? new Map() : computeReach(u);
  sfx('tap');
  renderBattleUI();
}

function handleTileTap(x, y) {
  const u = unitAt(x, y);
  const sel = selectedUnit();

  if (battle.mode === 'skill' && battle.pendingSkill) {
    handleSkillTap(x, y, u);
    return;
  }
  if (sel && !sel.acted) {
    if (u && u.id === sel.id) {
      battle.selId = null; battle.reach = new Map(); battle.mode = 'idle'; renderBattleUI(); return;
    }
    if (u && u.side === 'enemy') {
      if (inRangeFrom(sel, sel.x, sel.y, u)) playerAttack(sel, u);
      else { toast('사거리 밖 — 먼저 이동하세요'); sfx('nope'); }
      return;
    }
    if (u && u.side === 'ally') {
      if (!u.acted) selectUnit(u);
      else { battle.infoId = u.id; battle.selId = null; renderBattleUI(); }
      return;
    }
    if (!u && battle.reach.has(key(x, y)) && canStopAt(x, y, sel)) { playerMove(sel, x, y); return; }
  }
  if (u && u.side === 'ally') { selectUnit(u); return; }
  if (u && u.side === 'enemy') { battle.infoId = u.id; battle.selId = null; renderBattleUI(); return; }
  battle.selId = null; battle.mode = 'idle'; battle.reach = new Map(); renderBattleUI();
}

field.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if (!battle || battle.busy || battle.over || battle.phase !== 'player') return;
  const rect = field.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / view.tile);
  const y = Math.floor((ev.clientY - rect.top) / view.tile);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  handleTileTap(x, y);
}, { passive: false });

/* ────────────────────────── 9. 모달/대사/토스트 ────────────────────────── */
function openModal(html, opts = {}) {
  const root = $('#modal-root');
  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  layer.innerHTML = `<div class="modal panel">${html}</div>`;
  root.appendChild(layer);
  const close = () => { if (layer.parentNode) layer.remove(); };
  if (!opts.sticky) {
    layer.addEventListener('pointerdown', (e) => { if (e.target === layer) close(); });
  }
  return { layer, el: layer.querySelector('.modal'), close };
}
function closeAllModals() { $$('#modal-root .modal-layer').forEach((l) => l.remove()); }

function showDialogue(lines) {
  return new Promise((resolve) => {
    if (!lines || !lines.length) { resolve(); return; }
    const root = $('#modal-root');
    let idx = 0, typing = false, timer = null;
    const layer = document.createElement('div');
    layer.className = 'dialogue-layer';
    layer.innerHTML = `<div class="dialogue panel">
      <div class="p-slot"></div>
      <div class="d-body">
        <div class="who"><span class="w-name"></span><span class="hanja"></span></div>
        <div class="text"></div>
        <div class="next">▼ 터치</div>
      </div>
    </div>`;
    root.appendChild(layer);
    const slot = layer.querySelector('.p-slot');
    const nameEl = layer.querySelector('.w-name');
    const hanjaEl = layer.querySelector('.who .hanja');
    const textEl = layer.querySelector('.text');

    const showLine = () => {
      const line = lines[idx];
      if (!line) { finish(); return; }
      nameEl.textContent = line.who;
      hanjaEl.textContent = line.hanja || '';
      slot.innerHTML = '';
      slot.appendChild(makePortrait(line.cls || 'bobyung', line.side || 'ally'));
      textEl.textContent = '';
      typing = true;
      let i = 0;
      clearInterval(timer);
      timer = setInterval(() => {
        i += 1;
        textEl.textContent = line.text.slice(0, i);
        if (i >= line.text.length) { clearInterval(timer); typing = false; }
      }, 24);
      sfx('talk');
    };
    const advance = () => {
      if (typing) {
        clearInterval(timer);
        textEl.textContent = lines[idx].text;
        typing = false;
        return;
      }
      idx += 1;
      if (idx >= lines.length) { finish(); return; }
      showLine();
    };
    const finish = () => { clearInterval(timer); layer.remove(); resolve(); };
    layer.addEventListener('pointerdown', (e) => { e.preventDefault(); advance(); });
    showLine();
  });
}

let toastTimer = [];
function toast(text, cls = '') {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = text;
  root.appendChild(el);
  const t = setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2600);
  toastTimer.push(t);
  while (root.children.length > 3) root.removeChild(root.firstChild);
}

function getAttendance() {}

function openHelp() {
  const m = openModal(`
    <h2>전장 조작법</h2>
    <div class="sub">한 손가락으로 전부 조작할 수 있습니다.</div>
    <div class="rule"></div>
    <div class="cost-line"><span>아군 선택</span><b>아군 유닛 터치</b></div>
    <div class="cost-line"><span>이동</span><b>파란 타일 터치</b></div>
    <div class="cost-line"><span>공격</span><b>붉게 빛나는 적 터치</b></div>
    <div class="cost-line"><span>책략</span><b>아래 책략 버튼 → 대상 터치</b></div>
    <div class="cost-line"><span>턴 넘기기</span><b>턴 종료 버튼</b></div>
    <div class="rule"></div>
    <div class="sub" style="margin-bottom:0">병과마다 지형 상성이 다릅니다. 산적은 산지·숲, 수적은 강물, 궁기병은 산지에서 강해집니다.</div>
    <div class="row"><button class="btn" data-close>닫기</button></div>
  `);
  m.el.querySelector('[data-close]').addEventListener('click', m.close);
}

function openMenu() {
  const m = openModal(`
    <h2>군 정보</h2>
    <div class="sub">${monthLabel(state.turn)} · ${state.fame} 명성</div>
    <div class="rule"></div>
    <div class="cost-line"><span>보유 거점</span><b>${state.cities.filter((c) => c.owner === 'player').length} / ${state.cities.length}</b></div>
    <div class="cost-line"><span>전투 승리</span><b>${state.battlesWon}회</b></div>
    <div class="cost-line"><span>아군 병력</span><b>${fmt(playerTroops())}</b></div>
    <div class="rule"></div>
    <div class="sub">전국 지도에서 내정을 다스리고, 인접한 적 도시로 출진해 영토를 넓히세요.</div>
    <div class="row">
      <button class="btn ghost" data-close>닫기</button>
      <button class="btn" id="menu-reset">처음부터</button>
    </div>
  `);
  m.el.querySelector('[data-close]').addEventListener('click', m.close);
  m.el.querySelector('#menu-reset').addEventListener('click', () => {
    m.close();
    const m2 = openModal(`
      <h2>처음부터 시작</h2>
      <div class="sub">저장된 진행 상황이 사라집니다. 정말 새로 시작할까요?</div>
      <div class="row">
        <button class="btn ghost" id="reset-no">취소</button>
        <button class="btn primary" id="reset-yes">새로 시작</button>
      </div>
    `, { sticky: true });
    m2.el.querySelector('#reset-no').addEventListener('click', m2.close);
    m2.el.querySelector('#reset-yes').addEventListener('click', () => { m2.close(); startNewGame(); });
  });
}

/* ────────────────────────── 10. 화면 전환/시작 ────────────────────────── */
function showScreen(name) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name === 'battle') requestAnimationFrame(() => resizeField());
}

async function startNewGame() {
  state = defaultState();
  selectedCityId = 'heochang';
  saveGame();
  $('#splash').classList.add('hidden');
  showScreen('map');
  renderMapScreen();
  await sleep(260);
  const m = openModal(`
    <h2>후한 말 · 군웅할거</h2>
    <div class="sub">허창에서 군을 일으켰다. 먼저 내정을 다스리고, 여남의 황건 잔당을 쳐부수자.</div>
    <div class="rule"></div>
    <div class="cost-line"><span>① 지도에서 도시 선택</span><b>징병 · 훈련 · 개발</b></div>
    <div class="cost-line"><span>② 장수 배치 후 출진</span><b>격자 전장으로</b></div>
    <div class="cost-line"><span>③ 이동 → 공격 · 책략</span><b>턴제 전투</b></div>
    <div class="rule"></div>
    <div class="sub" style="margin-bottom:0">모든 조작은 한 손가락 터치로 됩니다.</div>
    <div class="row"><button class="btn primary" id="intro-go">군을 일으킨다</button></div>
  `, { sticky: true });
  m.el.querySelector('#intro-go').addEventListener('click', () => { m.close(); sfx('turn'); });
}

function resumeGame(saved) {
  state = saved;
  if (!state.log) state.log = [];
  selectedCityId = state.cities.find((c) => c.owner === 'player')?.id || 'heochang';
  $('#splash').classList.add('hidden');
  showScreen('map');
  renderMapScreen();
  toast('저장된 진행을 불러왔습니다', 'good');
}

function boot() {
  state = defaultState();
  try { soundOn = localStorage.getItem('samgukji-sound') !== '0'; } catch (e) { /* ignore */ }
  refreshSoundButtons();
  $('#btn-sound').addEventListener('click', toggleSound);
  $('#btn-sound2').addEventListener('click', toggleSound);
  $('#btn-menu').addEventListener('click', openMenu);
  $('#btn-next-turn').addEventListener('click', advanceTurn);
  $('#btn-help').addEventListener('click', openHelp);
  $('#btn-retreat').addEventListener('click', () => {
    if (!battle || battle.over) return;
    if (battle.busy || battle.phase !== 'player') { toast('적의 차례에는 후퇴할 수 없습니다'); sfx('nope'); return; }
    const m = openModal(`
      <h2>후퇴</h2>
      <div class="sub">전장에서 물러나면 이번 출진은 실패로 처리됩니다.</div>
      <div class="row">
        <button class="btn ghost" data-close>계속 싸운다</button>
        <button class="btn primary" id="retreat-yes">후퇴한다</button>
      </div>
    `);
    m.el.querySelector('[data-close]').addEventListener('click', m.close);
    m.el.querySelector('#retreat-yes').addEventListener('click', () => { m.close(); endBattle(false, '스스로 후퇴했다'); });
  });
  $('#btn-start').addEventListener('click', startNewGame);
  document.addEventListener('pointerdown', () => ensureAudio(), { passive: true });
  $('#btn-continue').addEventListener('click', () => {
    const s = loadGame();
    if (s) resumeGame(s);
    else toast('저장된 진행이 없습니다');
  });
  const saved = loadGame();
  if (saved) $('#btn-continue').classList.remove('hidden');

  window.addEventListener('resize', () => { if (battle) resizeField(); });
  window.addEventListener('orientationchange', () => { setTimeout(() => { if (battle) resizeField(); }, 250); });

  let lastW = 0, lastH = 0;
  const ro = new ResizeObserver(() => {
    if (!battle) return;
    const w = $('#field-wrap').clientWidth, h = $('#field-wrap').clientHeight;
    if (Math.abs(w - lastW) > 2 || Math.abs(h - lastH) > 2) { lastW = w; lastH = h; resizeField(); }
  });
  ro.observe($('#field-wrap'));

  function loop() {
    if (battle) {
      if (!terrainCanvas) resizeField();
      drawField();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  $('#splash').classList.remove('hidden');
}

/* 테스트·디버그용 (게임에는 영향 없음) */
window.__SK = {
  get state() { return state; },
  get battle() { return battle; },
  startBattle, openBattlePrep, advanceTurn, renderMapScreen,
  finish(win = true) {
    if (!battle) return;
    battle.units.filter((u) => u.side === 'enemy').forEach((u) => { u.hp = 0; u.dead = true; });
    checkBattleEnd();
  },
  hurt(side, amount) {
    if (!battle) return;
    battle.units.filter((u) => u.side === side).forEach((u) => { u.hp = Math.max(1, u.hp - amount); });
  },
  tap(x, y) { if (battle) handleTileTap(x, y); },
  selectFirst() { const u = battle && battle.units.find((q) => q.side === 'ally' && !q.dead && !q.acted); if (u) selectUnit(u); return u ? u.name : null; },
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
