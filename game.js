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
  S: { name: '여울', def: 0.05, note: '이동 2 · 방어 +5%' },
  B: { name: '다리', def: 0, note: '이동 1' },
  G: { name: '성문', def: 0.35, note: '이동 1 · 방어 +35%' },
  C: { name: '성벽', def: 0.5, note: '통행 불가' },
};

const CLASSES = {
  gunwoong: { name: '군웅', hanja: '群雄', role: '지휘 · 균형', hp: 118, mp: 40, atk: 25, def: 18, mov: 4, rng: 1, weapon: 'sword', skills: ['jihwi'],
    wu: 78, ji: 84, tong: 88,
    desc: '아군 전체를 지휘하는 군주 병과. 지휘 책략으로 부대를 강화한다.' },
  gibi: { name: '기병', hanja: '騎兵', role: '돌격 · 기동', hp: 116, mp: 20, atk: 28, def: 16, mov: 6, rng: 1, weapon: 'spear', mount: true,
    wu: 88, ji: 52, tong: 74,
    desc: '이동 6의 돌격 병과. 숲은 3, 산지는 통행할 수 없다.' },
  gunggi: { name: '궁기병', hanja: '弓騎兵', role: '원거리 · 기동', hp: 102, mp: 24, atk: 24, def: 13, mov: 5, rng: 3, weapon: 'bow', mount: true,
    wu: 80, ji: 62, tong: 72,
    desc: '대각선을 포함해 3칸까지 사격한다. 산지에 오르면 사거리 +1.' },
  pungsusa: { name: '풍수사', hanja: '風水師', role: '회복 · 보조', hp: 86, mp: 60, atk: 14, def: 11, mov: 4, rng: 2, weapon: 'staff',
    wu: 32, ji: 90, tong: 58, skills: ['sobogeup', 'daebogeup', 'gomu', 'pungsu'],
    desc: '소·대보급으로 아군을 살리고, 고무와 풍수로 전장을 뒤집는다.' },
  sanjeok: { name: '산적', hanja: '山賊', role: '산지 · 숲 특화', hp: 128, mp: 16, atk: 30, def: 13, mov: 5, rng: 1, weapon: 'axe',
    wu: 86, ji: 38, tong: 52,
    desc: '산지·숲에서 이동 1, 공격 +25%, 회심 확률 상승. 산에서는 최강.' },
  sujeok: { name: '수적', hanja: '水賊', role: '수전 특화', hp: 122, mp: 20, atk: 26, def: 15, mov: 5, rng: 1, weapon: 'trident',
    wu: 82, ji: 48, tong: 66,
    desc: '강물 위를 자유롭게 누비며 공격 +20%, 방어 보정을 받는다.' },
  bobyung: { name: '보병', hanja: '步兵', role: '방어 · 균형', hp: 112, mp: 10, atk: 22, def: 18, mov: 4, rng: 1, weapon: 'sword',
    wu: 68, ji: 46, tong: 70,
    desc: '튼튼한 방어의 기본 병과. 성문과 평지를 지키는 데 알맞다.' },
  gungbyung: { name: '궁병', hanja: '弓兵', role: '원거리', hp: 92, mp: 14, atk: 21, def: 12, mov: 4, rng: 3, weapon: 'bow',
    wu: 62, ji: 50, tong: 60,
    desc: '3칸 밖에서 일방적으로 공격한다. 붙으면 약하다.' },
  chaeksa: { name: '책사', hanja: '策士', role: '책략', hp: 80, mp: 56, atk: 15, def: 10, mov: 4, rng: 2, weapon: 'fan', skills: ['hwagye'],
    wu: 30, ji: 88, tong: 62,
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

/* 아군 장수 — pt: 초상화 키 */
const HEROES = [
  { id: 'jojo', name: '조조', hanja: '曹操', cls: 'gunwoong', lv: 6, wu: 78, ji: 90, tong: 90,
    pt: 'caocao', quote: '천하는 넓고, 내 길은 멀다.' },
  { id: 'hahoudon', name: '하후돈', hanja: '夏侯惇', cls: 'gibi', lv: 5, wu: 94, ji: 55, tong: 80,
    pt: 'xiahoudun', quote: '한 번 뚫으면 멈추지 않는다.' },
  { id: 'hahouyeon', name: '하후연', hanja: '夏侯淵', cls: 'gunggi', lv: 5, wu: 88, ji: 66, tong: 78,
    pt: 'xiahouyuan', quote: '세 번의 화살이면 충분하다.' },
  { id: 'sunyoo', name: '순유', hanja: '荀攸', cls: 'pungsusa', lv: 5, wu: 26, ji: 94, tong: 62,
    pt: 'xunyou', quote: '하늘과 땅을 읽으면 이길 수 있습니다.' },
  { id: 'johong', name: '조홍', hanja: '曹洪', cls: 'bobyung', lv: 4, wu: 76, ji: 44, tong: 78,
    pt: 'caohong', quote: '성이 무너져도 내가 버틴다.' },
];
const HERO_MAP = Object.fromEntries(HEROES.map((h) => [h.id, h]));

const CITY_DEFS = [
  { id: 'heochang', name: '허창', hanja: '許昌', x: 132, y: 148, gold: 360, rice: 420 },
  { id: 'wan', name: '완', hanja: '宛', x: 96, y: 219, gold: 250, rice: 300 },
  { id: 'yeonan', name: '여남', hanja: '汝南', x: 168, y: 247, gold: 320, rice: 360, battle: 'yeonan' },
  { id: 'geonup', name: '건업', hanja: '建業', x: 276, y: 236, gold: 380, rice: 430, battle: 'geonup' },
  { id: 'eop', name: '업', hanja: '鄴', x: 196, y: 66, gold: 340, rice: 380, battle: 'eop' },
];
const CITY_MAP = Object.fromEntries(CITY_DEFS.map((c) => [c.id, c]));
const ROADS = [
  ['heochang', 'wan'], ['heochang', 'yeonan'], ['heochang', 'eop'],
  ['wan', 'yeonan'], ['yeonan', 'geonup'], ['eop', 'geonup'],
];

/* ── 전장 지형도 (생성한 배경 아트와 타일을 일치시켜 설계) ──
   P 평지 · R 도로 · F 숲 · M 산지 · W 강물 · S 여울 · B 다리 · G 성문 · C 성벽
   여남: 완만한 강이 가로지르고 중앙 다리 하나, 좌상단 숲, 우하단 산맥
   건업: 온 화면을 채우는 큰 강 + 좌우 두 개의 다리, 위쪽 버드나무 숲
   업성: 오른쪽으로 기우는 성벽과 성문, 그 앞 진입로                        */
const MAP_YEONAN = [
  'FFFFPPPPPPPP',
  'FFFFFPRPPPPP',
  'FFFFPPRPPPPP',
  'FFPPPRPPPPPP',
  'WWWWWWBWWWMM',
  'WWWWWWBWWMMM',
  'PPPPPPRPPPMM',
  'PPPPPPRPMMMM',
  'PPPPPPPPMMMM',
  'FPPPPPRMMMMM',
];
const MAP_GEONUP = [
  'FFFFFFFFFFFF',
  'FFFRFFFFFRFF',
  'SSSBSSSSSBSS',
  'WWWBWWWWWBWW',
  'WWWBWWWWWBWW',
  'WWWBWWWWWBWW',
  'WWWBWWWWWBWW',
  'SSSBSSSSSBSS',
  'RRRRRRRRRRRR',
  'PPPPPPPPPPPP',
];
const MAP_EOP = [
  'PPPPPPCCCCCC',
  'PPPPPPPCCCCC',
  'PPPPPPPPCCCC',
  'PPPPPPPPPCCC',
  'PPPPPPPPPGCC',
  'PPPPPPPPPPCC',
  'PPPPPPPPPPCC',
  'PPPPPPPPPPPC',
  'PPPPPPPPPPPC',
  'PPPPPPPPPPPC',
];

const BATTLES = {
  yeonan: {
    title: '여남 공방전', subtitle: '황건 잔당 토벌', map: MAP_YEONAN, bg: 'battle_yeonan',
    enemies: [
      { id: 'juchang', name: '주창', hanja: '周倉', cls: 'sanjeok', lv: 6, boss: true, x: 10, y: 8, pt: 'zhoucang',
        line: '이 산에서… 내가 질 리가 없다…' },
      { id: 'jutaek', name: '주태', hanja: '周泰', cls: 'sujeok', lv: 6, boss: true, x: 8, y: 4, pt: 'zhoutai',
        line: '강물이… 나를 버렸구나…' },
      { id: 'hg1', name: '황건적', hanja: '黃巾', cls: 'bobyung', lv: 2, x: 8, y: 2 },
      { id: 'hg2', name: '황건 궁수', hanja: '黃巾', cls: 'gungbyung', lv: 2, x: 10, y: 1 },
      { id: 'hg3', name: '황건 술사', hanja: '黃巾', cls: 'chaeksa', lv: 3, x: 9, y: 3 },
      { id: 'hg4', name: '황건적', hanja: '黃巾', cls: 'bobyung', lv: 2, x: 7, y: 6 },
    ],
    intro: [
      { who: '조조', hanja: '曹操', cls: 'gunwoong', side: 'ally', pt: 'caocao', text: '여남의 황건 잔당… 오늘로 끝내겠다.' },
      { who: '주창', hanja: '周倉', cls: 'sanjeok', side: 'enemy', pt: 'zhoucang', text: '허! 이 산에서 우리를 잡을 수 있을까?' },
      { who: '주태', hanja: '周泰', cls: 'sujeok', side: 'enemy', pt: 'zhoutai', text: '강물을 건너온 자는 다시 돌아가지 못한다.' },
      { who: '순유', hanja: '荀攸', cls: 'pungsusa', side: 'ally', pt: 'xunyou', text: '강을 건너려면 저 다리 하나뿐입니다. 산지와 강물의 상성을 살피십시오.' },
    ],
    winLine: '여남을 평정했다. 황건의 잔불이 꺼졌다.',
    reward: { gold: 900, rice: 500 },
  },
  geonup: {
    title: '건업 수전', subtitle: '수적 소탕 · 강을 건너라', map: MAP_GEONUP, bg: 'battle_geonup',
    enemies: [
      { id: 'gamnyeong', name: '수적 두목', hanja: '水賊', cls: 'sujeok', lv: 5, boss: true, x: 6, y: 5, pt: 'shuizei',
        line: '이 강은… 영원히 우리 것인데…' },
      { id: 'su1', name: '수군', hanja: '水軍', cls: 'sujeok', lv: 3, x: 5, y: 4 },
      { id: 'su2', name: '수군', hanja: '水軍', cls: 'sujeok', lv: 3, x: 7, y: 6 },
      { id: 'su3', name: '수군', hanja: '水軍', cls: 'sujeok', lv: 3, x: 2, y: 4 },
      { id: 'gb1', name: '수적 궁수', hanja: '水賊', cls: 'gungbyung', lv: 3, x: 1, y: 1 },
      { id: 'bb1', name: '수적 보병', hanja: '水賊', cls: 'bobyung', lv: 3, x: 10, y: 2 },
      { id: 'cs1', name: '수적 책사', hanja: '水賊', cls: 'chaeksa', lv: 3, x: 10, y: 1 },
    ],
    intro: [
      { who: '조조', hanja: '曹操', cls: 'gunwoong', side: 'ally', pt: 'caocao', text: '강을 건너야 건업에 닿는다. 다리를 지켜라.' },
      { who: '수적 두목', hanja: '水賊', cls: 'sujeok', side: 'enemy', pt: 'shuizei', text: '이 강은 우리 집이다. 물 위에서 덤벼라!' },
      { who: '하후연', hanja: '夏侯淵', cls: 'gunggi', side: 'ally', pt: 'xiahouyuan', text: '물 위의 적도 화살은 피하지 못합니다.' },
    ],
    winLine: '강줄기를 장악했다. 건업의 수적이 흩어졌다.',
    reward: { gold: 1200, rice: 600 },
  },
  eop: {
    title: '업성 공략', subtitle: '성문을 뚫어라', map: MAP_EOP, bg: 'battle_eop',
    enemies: [
      { id: 'hwangduk', name: '황건 두목', hanja: '黃巾', cls: 'bobyung', lv: 6, boss: true, x: 9, y: 4, pt: 'huangjin',
        line: '하늘에… 복이 없도다…' },
      { id: 'eop_cs', name: '황건 책사', hanja: '黃巾', cls: 'chaeksa', lv: 4, x: 7, y: 2 },
      { id: 'eop_bb1', name: '황건 보병', hanja: '黃巾', cls: 'bobyung', lv: 4, x: 8, y: 3 },
      { id: 'eop_bb2', name: '황건 보병', hanja: '黃巾', cls: 'bobyung', lv: 4, x: 7, y: 4 },
      { id: 'eop_gb1', name: '황건 궁수', hanja: '黃巾', cls: 'gungbyung', lv: 4, x: 8, y: 5 },
      { id: 'eop_gb2', name: '황건 궁수', hanja: '黃巾', cls: 'gungbyung', lv: 3, x: 6, y: 6 },
    ],
    intro: [
      { who: '조조', hanja: '曹操', cls: 'gunwoong', side: 'ally', pt: 'caocao', text: '업성의 성문은 좁다. 한 번에 밀어붙인다.' },
      { who: '황건 두목', hanja: '黃巾', cls: 'bobyung', side: 'enemy', pt: 'huangjin', text: '성문 앞에 서 봐라! 여기가 너희 무덤이다.' },
      { who: '하후돈', hanja: '夏侯惇', cls: 'gibi', side: 'ally', pt: 'xiahoudun', text: '성문 하나면 충분하다.' },
    ],
    winLine: '업성의 성문이 열렸다. 하북으로 가는 길이 트였다.',
    reward: { gold: 1000, rice: 700 },
  },
};

/* 초상화 해석: 장수 키 → 초상화, 없으면 병과+진영으로 */
const HERO_PORTRAIT = {
  jojo: 'caocao', hahoudon: 'xiahoudun', hahouyeon: 'xiahouyuan', sunyoo: 'xunyou', johong: 'caohong',
  juchang: 'zhoucang', jutaek: 'zhoutai', gamnyeong: 'shuizei', hwangduk: 'huangjin',
};
const CLASS_PORTRAIT_ALLY = { gunwoong: 'caocao', gibi: 'xiahoudun', gunggi: 'xiahouyuan', pungsusa: 'xunyou', bobyung: 'caohong' };
const CLASS_PORTRAIT_ENEMY = {
  bobyung: 'gen_bobyung', gungbyung: 'gen_gungbyung', chaeksa: 'gen_chaeksa', sujeok: 'gen_sujeok',
  sanjeok: 'zhoucang', gunwoong: 'huangjin',
};
function portraitKeyFor(def, side, clsKey) {
  return def.pt || HERO_PORTRAIT[def.id] || def.portrait ||
    (side === 'ally' ? CLASS_PORTRAIT_ALLY[clsKey] : CLASS_PORTRAIT_ENEMY[clsKey]) || 'gen_bobyung';
}

/* ────────────────────────── 1.5 아트 에셋 ────────────────────────── */
const PORTRAIT_SRC = {
  caocao: 'assets/portraits/web/caocao.webp',
  xiahoudun: 'assets/portraits/web/xiahoudun.webp',
  xiahouyuan: 'assets/portraits/web/xiahouyuan.webp',
  xunyou: 'assets/portraits/web/xunyou.webp',
  caohong: 'assets/portraits/web/caohong.webp',
  zhoucang: 'assets/portraits/web/zhoucang.webp',
  zhoutai: 'assets/portraits/web/zhoutai.webp',
  huangjin: 'assets/portraits/web/huangjin.webp',
  shuizei: 'assets/portraits/web/shuizei.webp',
  gen_bobyung: 'assets/portraits/web/gen_bobyung.webp',
  gen_gungbyung: 'assets/portraits/web/gen_gungbyung.webp',
  gen_chaeksa: 'assets/portraits/web/gen_chaeksa.webp',
  gen_sujeok: 'assets/portraits/web/gen_sujeok.webp',
};
const SPRITE_CLASSES = ['gunwoong', 'gibi', 'gunggi', 'pungsusa', 'sanjeok', 'sujeok', 'bobyung', 'gungbyung', 'chaeksa'];
/* 병과별 스프라이트 크기 보정 — 무기 길이 때문에 인물이 작게 보이는 병과를 키운다 */
const SPRITE_SCALE = {
  gunwoong: 1.06, gibi: 1.02, gunggi: 1.02, pungsusa: 1.08,
  sanjeok: 1.02, sujeok: 0.98, bobyung: 1.24, gungbyung: 1.16, chaeksa: 1.08,
};
const MAP_SRC = {
  battle_yeonan: 'assets/maps/web/battle_yeonan.webp',
  battle_geonup: 'assets/maps/web/battle_geonup.webp',
  battle_eop: 'assets/maps/web/battle_eop.webp',
};
const WORLD_SRC = 'assets/maps/web/worldmap.webp';

const IMG = { portrait: {}, sprite: {}, map: {}, worldmap: null, ready: false, failed: [] };

function loadImg(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => { IMG.failed.push(src); resolve(null); };
    im.src = src;
  });
}

async function preloadAssets(onProgress) {
  const jobs = [];
  Object.entries(PORTRAIT_SRC).forEach(([k, src]) => jobs.push(loadImg(src).then((im) => { IMG.portrait[k] = im; })));
  SPRITE_CLASSES.forEach((c) => {
    ['ally', 'enemy'].forEach((side) => {
      const src = `assets/sprites/web/${c}${side === 'enemy' ? '_enemy' : ''}.webp`;
      jobs.push(loadImg(src).then((im) => { (IMG.sprite[c] = IMG.sprite[c] || {})[side] = im; }));
    });
  });
  Object.entries(MAP_SRC).forEach(([k, src]) => jobs.push(loadImg(src).then((im) => { IMG.map[k] = im; })));
  jobs.push(loadImg(WORLD_SRC).then((im) => { IMG.worldmap = im; }));
  let done = 0;
  jobs.forEach((j) => j.then(() => { done += 1; if (onProgress) onProgress(done, jobs.length); }));
  await Promise.all(jobs);
  IMG.ready = true;
}

function spriteImg(clsKey, side) {
  const set = IMG.sprite[clsKey];
  if (!set) return null;
  return side === 'enemy' ? (set.enemy || set.ally) : set.ally;
}
function portraitImg(key) { return IMG.portrait[key] || null; }

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
  shoot: () => { noiseBurst(0.06, 0.03); tone(900, 0.08, 'sawtooth', 0.022, 0, 380); },
  shake: () => tone(90, 0.18, 'sawtooth', 0.03, 0, 45),
  coin: () => { tone(880, 0.06, 'square', 0.03); tone(1174, 0.09, 'square', 0.025, 0.05); },
};
function sfx(name) { ensureAudio(); if (SFX[name]) SFX[name](); }

function refreshSoundButtons() {
  ['#btn-sound', '#btn-sound2'].forEach((sel) => {
    const b = $(sel); if (!b) return;
    b.textContent = soundOn ? '♪' : '♪';
    b.classList.toggle('off', !soundOn);
    b.setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기');
    b.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
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
  const main = own === 'player' ? '#2f66ad' : '#a83a26';
  const light = own === 'player' ? '#9ecdf5' : '#f3ab92';
  const deep = own === 'player' ? '#16335c' : '#5c1a10';
  const glowId = own === 'player' ? 'glowBlue' : 'glowRed';
  const attackable = own === 'enemy' && neighbors(c.id).some((n) => cityState(n).owner === 'player');
  const sel = selectedCityId === c.id;
  const cs2 = cs.troops >= 3000;
  return `
  <g class="city" data-city="${c.id}" transform="translate(${c.x},${c.y}) scale(.86)" style="cursor:pointer">
    <ellipse cx="0" cy="16" rx="19" ry="5.5" fill="rgba(40,26,10,.35)"/>
    <circle r="31" fill="url(#${glowId})"/>
    ${attackable ? `<circle r="25" fill="none" stroke="#c9a44a" stroke-width="1.6" stroke-dasharray="4 5" opacity=".9">
        <animate attributeName="opacity" values="0.2;0.95;0.2" dur="2.2s" repeatCount="indefinite"/></circle>` : ''}
    ${sel ? `<circle r="21" fill="none" stroke="#ffe9a8" stroke-width="1.8" opacity=".95"/>` : ''}
    <rect x="-30" y="-26" width="60" height="56" fill="rgba(255,255,255,0.001)"/>
    <!-- 성곽 기단 -->
    <path d="M-16,12 L-16,-2 L16,-2 L16,12 Z" fill="${deep}" stroke="#2a1a0e" stroke-width="1.3"/>
    <path d="M-16,-2 L16,-2 L13,-7 L-13,-7 Z" fill="${main}" stroke="#2a1a0e" stroke-width="1.1"/>
    <!-- 담장 톱니 -->
    <path d="M-16,-7 L-16,-11 L-11,-11 L-11,-8 L-6,-8 L-6,-11 L-1,-11 L-1,-8 L4,-8 L4,-11 L9,-11 L9,-8 L14,-8 L14,-7 Z"
      fill="${light}" stroke="#2a1a0e" stroke-width="1"/>
    <!-- 망루 -->
    <rect x="-6" y="-20" width="12" height="13" fill="${main}" stroke="#2a1a0e" stroke-width="1.2"/>
    <path d="M-9,-20 L0,-27 L9,-20 Z" fill="${light}" stroke="#2a1a0e" stroke-width="1.1"/>
    <rect x="-2.4" y="-13" width="4.8" height="8" fill="#20140a"/>
    <!-- 군기 -->
    <rect x="13" y="-26" width="1.6" height="24" fill="#3a2410"/>
    <path d="M14.6,-26 L26,-22.5 L14.6,-19 Z" fill="${main}" stroke="#2a1a0e" stroke-width=".9"/>
    <circle cx="13.8" cy="-26.5" r="1.6" fill="#e8c877" stroke="#6b4a1a" stroke-width=".6"/>
    ${attackable ? `<text x="0" y="-30" text-anchor="middle" font-family="serif" font-size="12" fill="#8a2a16"
      stroke="#ffd9a0" stroke-width="2.6" paint-order="stroke">戰</text>` : ''}
    <g class="city-plate" transform="translate(0,21)">
      <rect x="-26" y="-8" width="52" height="16" rx="2" fill="rgba(28,18,8,.82)" stroke="${main}" stroke-width="1"/>
      <text x="0" y="4" text-anchor="middle" font-family="serif" font-size="11.5" font-weight="700"
        fill="#f4e6c4" letter-spacing="1">${c.name}</text>
    </g>
    <text x="0" y="-29" text-anchor="middle" font-family="serif" font-size="9" fill="#6b5230" opacity=".9">${c.hanja}</text>
  </g>`;
}

function buildMapSVG() {
  const s = [];
  s.push(`<defs>
    <radialGradient id="glowBlue"><stop offset="0" stop-color="rgba(70,130,200,.5)"/><stop offset="1" stop-color="rgba(70,130,200,0)"/></radialGradient>
    <radialGradient id="glowRed"><stop offset="0" stop-color="rgba(190,60,40,.46)"/><stop offset="1" stop-color="rgba(190,60,40,0)"/></radialGradient>
    <radialGradient id="vign" cx="50%" cy="46%" r="72%">
      <stop offset="60%" stop-color="rgba(60,38,14,0)"/><stop offset="100%" stop-color="rgba(48,28,10,.42)"/>
    </radialGradient>
  </defs>`);
  // 길 — 점선 대신 옅은 붓길
  ROADS.forEach(([a, b]) => {
    const A = CITY_MAP[a], B = CITY_MAP[b];
    const mx = (A.x + B.x) / 2 + (B.y - A.y) * 0.09;
    const my = (A.y + B.y) / 2 - (B.x - A.x) * 0.09;
    s.push(`<path d="M${A.x},${A.y} Q${mx},${my} ${B.x},${B.y}" fill="none" stroke="rgba(96,68,30,.5)"
      stroke-width="2.2" stroke-linecap="round" stroke-dasharray="7 6"/>`);
  });
  s.push(`<rect x="0" y="0" width="360" height="320" fill="url(#vign)" pointer-events="none"/>`);
  CITY_DEFS.forEach((c) => s.push(citySVG(c)));
  return s.join('');
}
/* 지도 액자 — 화면 비율을 지키면서 남는 공간에 맞춘다 (가로/세로 모두) */
function fitMapFrame() {
  const wrap = document.querySelector('.map-wrap');
  const frame = document.querySelector('.map-frame');
  if (!wrap || !frame) return;
  const W = wrap.clientWidth - 16, H = wrap.clientHeight - 16;
  if (W < 40 || H < 40) return;
  const w = Math.min(W, 600, H * 360 / 320);
  frame.style.width = Math.round(w) + 'px';
  frame.style.height = Math.round(w * 320 / 360) + 'px';
}

function renderMapScreen() {
  if (!state) return;
  hudUpdate();
  fitMapFrame();
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

  let info = `<div class="city-head">
    <span class="hanja">${c.hanja}</span>
    <span class="name">${c.name}</span>
    <span class="badge ${isPlayer ? 'player' : 'enemy'}">${isPlayer ? '아군' : '적군'}</span>
    <span class="owner-note">${isPlayer ? '통치 중' : '황건 잔당 점령'}</span>
  </div>`;

  let actions = '';

  if (isPlayer) {
    info += `<div class="city-stats">
      <div class="cs"><i>병력</i><b>${fmt(cs.troops)}</b></div>
      <div class="cs"><i>훈련도</i><b>${cs.train}</b></div>
      <div class="cs"><i>개발</i><b>${cs.dev}</b></div>
      <div class="cs"><i>수입</i><b>${fmt(inc.gold)}金</b></div>
    </div>
    <div class="city-generals">배치 장수 ${gens.length ? gens.map((g) => `<span class="gchip">${g.name} <span style="opacity:.65">${CLASSES[g.cls].name}</span></span>`).join('') : '<b>없음</b> — 장수를 배치해야 출진할 수 있다.'}</div>`;
    const targets = neighbors(c.id).filter((id) => cityState(id).owner === 'enemy');
    const targetLabel = targets.length ? targets.map((id) => cityDef(id).name).join(' · ') + ' 방면' : '인접한 적 도시 없음';
    actions = `<button class="btn" data-act="recruit" ${canRecruit ? '' : 'disabled'}>징병 <em>400金 · +600</em></button>
      <button class="btn" data-act="train" ${canTrain ? '' : 'disabled'}>훈련 <em>250金 · +8</em></button>
      <button class="btn" data-act="develop" ${canDev ? '' : 'disabled'}>개발 <em>500金 · +1</em></button>
      <button class="btn ghost" data-act="deploy" ${cs.acted ? 'disabled' : ''}>장수 배치</button>
      <button class="btn primary span2" data-act="sortie" ${gens.length ? '' : 'disabled'}>출진 <em>${targetLabel}</em></button>`;
  } else {
    const bkey = c.battle;
    const bdef = BATTLES[bkey];
    const sources = neighbors(c.id).filter((n) => cityState(n).owner === 'player' && state.roster.some((r) => r.city === n));
    info += `<div class="city-stats">
      <div class="cs"><i>수비 병력</i><b>${fmt(cs.troops)}</b></div>
      <div class="cs"><i>성 방어</i><b>${cs.dev + 1}</b></div>
      <div class="cs"><i>지형</i><b>${bkey === 'geonup' ? '수전' : bkey === 'eop' ? '성문' : '산림'}</b></div>
      <div class="cs"><i>수입</i><b>${fmt(inc.gold)}金</b></div>
    </div>
    <div class="city-generals">수비 장수 ${bdef.enemies.filter((e) => e.boss).map((e) => `<span class="gchip">${e.name} <span style="opacity:.65">${CLASSES[e.cls].name}</span></span>`).join('')}</div>
    <div class="city-note">적의 거점이다. 인접한 아군 도시에서 장수를 이끌고 출진해 점령할 수 있다.</div>`;
    actions = `<button class="btn primary full" data-act="attack" ${sources.length ? '' : 'disabled'}>출진 <em>${sources.length ? sources.map((n) => cityDef(n).name).join('·') + '에서 공격' : '인접한 아군 도시가 필요'}</em></button>`;
  }

  // 월간 보고는 스크롤 영역 안에
  if (state.log.length) {
    info += `<div class="city-note" style="border-top:1px dotted rgba(201,164,74,.18);margin-top:8px;padding-top:6px">${state.log.slice(0, 2).map((t) => '· ' + t).join('<br/>')}</div>`;
  }

  panel.innerHTML = `<div class="city-scroll">${info}</div><div class="city-actions">${actions}</div>`;
  const sc = panel.querySelector('.city-scroll');
  if (sc) requestAnimationFrame(() => sc.classList.toggle('scrollable', sc.scrollHeight > sc.clientHeight + 2));

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
  if (ch === 'S') return clsKey === 'sujeok' ? 1 : 2;
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
function terrainAt(x, y) { const row = battle.map[y] || ''; return TERRAIN[row[x]] || TERRAIN.P; }
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
    wu: d.wu || cls.wu, ji: d.ji || cls.ji, tong: d.tong || cls.tong,
    pt: portraitKeyFor(d, side, d.cls),
    maxHp: Math.round((cls.hp + g * 6) * (d.hpMul || 1)),
    maxMp: cls.mp + g * 2,
    atk: Math.round((cls.atk + g * 2) * (d.atkMul || 1)),
    def: Math.round(cls.def + g),
    mov: cls.mov, rng: cls.rng,
    x, y, px: null, py: null,
    moved: false, acted: false, dead: false,
    buffs: [], boss: !!d.boss, quote: d.quote || '', line: d.line || '',
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
  const ch = (battle.map[y] || '')[x];
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
  const ch = (battle.map[u.y] || '')[u.x] || 'P';
  let mul = 1 + TERRAIN[ch].def + buffValue(u, 'def');
  if (u.clsKey === 'sanjeok' && (ch === 'M' || ch === 'F')) mul += 0.10;
  if (u.clsKey === 'sujeok' && ch === 'W') mul += 0.10;
  return Math.max(1, u.def * mul);
}
function effectiveRange(u, x = u.x, y = u.y) {
  let r = u.rng;
  if ((u.clsKey === 'gunggi' || u.clsKey === 'gungbyung') && (battle.map[y] || '')[x] === 'M') r += 1;
  return r;
}
function inRangeFrom(u, x, y, target) {
  if (u.clsKey === 'bobyung' || u.rng === 1) return manh(x, y, target.x, target.y) === 1;
  const d = cheb(x, y, target.x, target.y);
  return d >= 1 && d <= effectiveRange(u, x, y);
}
function critChance(u, x = u.x, y = u.y) {
  const ch = (battle.map[y] || '')[x];
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
  await showBattleCard(bdef);
  await showDialogue(bdef.intro);
  battle.busy = false;
  banner('아군의 차례');
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
    const d = Math.abs(x - 2) * 1.0 + Math.abs(y - 8) * 1.1;
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
  const ranged = manh(a.x, a.y, d.x, d.y) > 1;
  if (ranged) {
    addFx({ kind: 'arrow', sx: a.x, sy: a.y, x: d.x, y: d.y, life: 24 });
    sfx('shoot');
    await sleep(210);
  } else {
    await lunge(a, d);
  }
  addFx({ kind: 'slash', x: d.x, y: d.y, life: 24 });
  addFx({ kind: 'spark', x: d.x, y: d.y, life: 16 });
  shakeScreen(res.crit ? 6.5 : 3.2);
  applyDamage(d, res.dmg, res.crit);
  sfx(res.crit ? 'crit' : 'hit');
  logLine(`${a.name}의 공격 — ${d.name}에게 ${res.dmg} 피해${res.crit ? ' (회심의 일격!)' : ''}`,
    a.side === 'ally' ? 'good' : 'bad');
  gainExp(a, res.crit ? 16 : 12);
  await sleep(170);
  if (d.dead && d.boss && d.side === 'enemy' && d.line) {
    await sleep(240);
    await showDialogue([{ who: d.name, hanja: d.hanja, cls: d.clsKey, side: 'enemy', pt: d.pt, text: d.line }]);
  }
  if (!d.dead && inRangeFrom(d, d.x, d.y, a)) {
    const c = calcDamage(d, a, d.x, d.y);
    const cd = Math.max(2, Math.round(c.dmg * 0.55));
    await lunge(d, a);
    addFx({ kind: 'spark', x: a.x, y: a.y, life: 14 });
    shakeScreen(2.2);
    applyDamage(a, cd, false);
    sfx('hit');
    logLine(`${d.name}의 반격 — ${a.name}에게 ${cd} 피해`, d.side === 'ally' ? 'good' : 'bad');
    gainExp(d, 4);
    await sleep(140);
  }
  checkBattleEnd();
}

function shakeScreen(power) {
  if (!battle) return;
  battle.shake = { t: 12, life: 12, power };
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
    addFx({ kind: 'heal', x: target.x, y: target.y, life: 40 });
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
        addFx({ kind: 'heal', x: a.x, y: a.y, life: 40 });
      }
    });
    sfx('heal');
    logLine(`아군 전체 ${total} HP 회복`, 'good');
    gainExp(u, 10);
  } else if (sk.kind === 'buff') {
    addBuff(target, 'atk', sk.atk, sk.turns);
    floatText(target.x, target.y, '공격↑', '#ffe08a');
    addFx({ kind: 'buff', x: target.x, y: target.y, life: 36 });
    sfx('buff');
    logLine(`${target.name}의 공격력 +${Math.round(sk.atk * 100)}% (${sk.turns}턴)`, 'good');
    gainExp(u, 6);
  } else if (sk.kind === 'buffAreaAllies') {
    aliveUnits('ally').forEach((a) => {
      if (cheb(u.x, u.y, a.x, a.y) <= sk.radius) {
        addBuff(a, 'atk', sk.atk, sk.turns);
        addFx({ kind: 'buff', x: a.x, y: a.y, life: 34 });
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
        addFx({ kind: 'debuff', x: e.x, y: e.y, life: 34 });
        n++;
      }
    });
    addFx({ kind: 'ring', x: cx, y: cy, color: 'rgba(180,140,240,.6)', life: 40, big: true });
    shakeScreen(2.4);
    sfx('cast');
    logLine(`적 ${n}명의 방어력 -25% (${sk.turns}턴)`, 'good');
    gainExp(u, 8);
  } else if (sk.kind === 'magic') {
    const dmg = Math.max(6, Math.round((sk.power + u.lv * 3) * rnd(0.92, 1.08) - effDef(target) * 0.15));
    addFx({ kind: 'flame', x: target.x, y: target.y, life: 34 });
    shakeScreen(5.5);
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
  const survivors = b.units.filter((u) => u.side === 'ally' && !u.dead).length;
  const rw = win
    ? `<div class="cost-line"><span>노획 금</span><b>+${fmt(reward.gold)}</b></div>
       <div class="cost-line"><span>노획 군량</span><b>+${fmt(reward.rice)}</b></div>
       <div class="cost-line"><span>명성</span><b>+1</b></div>`
    : `<div class="cost-line bad"><span>${b.srcCityId ? cityDef(b.srcCityId).name : '본진'} 병력</span><b>-500</b></div>
       <div class="cost-line bad"><span>군량</span><b>-100</b></div>`;
  const m = openModal(`
    <div class="res-head ${win ? 'win' : 'lose'}">
      <div class="res-seal">${win ? '勝' : '敗'}</div>
      <div class="res-title">${win ? '승 리' : '패 배'}</div>
      <div class="res-sub">${b.bdef.title} · ${Math.min(b.turn, TURN_LIMIT)}턴 · 격파 ${defeated}/${b.bdef.enemies.length}</div>
    </div>
    <div class="rule"></div>
    <div class="cost-line"><span>생존 부대</span><b>${survivors} / ${b.units.filter((u) => u.side === 'ally').length}</b></div>
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
  const stage = $('#field-stage');
  const W = stage.clientWidth || wrap.clientWidth;
  const landscape = window.innerWidth > window.innerHeight;
  const availH = landscape
    ? Math.max(120, wrap.clientHeight - 44)
    : Math.max(120, window.innerHeight * 0.58 - 46);
  if (W < 20) return;
  const tile = Math.max(12, Math.floor(Math.min((W - 8) / MAP_W, (availH - 8) / MAP_H)));
  const cssW = tile * MAP_W, cssH = tile * MAP_H;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  field.width = Math.round(cssW * dpr);
  field.height = Math.round(cssH * dpr);
  field.style.width = cssW + 'px';
  field.style.height = cssH + 'px';
  const strip = $('.war-strip');
  if (strip) strip.style.width = cssW + 'px';
  const obj = $('.field-objective');
  if (obj) obj.style.maxWidth = cssW + 'px';
  view = { tile, dpr, w: cssW, h: cssH };
  wrap.classList.toggle('tight', availH - cssH < 20);
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  buildTerrain();
}

function h2(x, y, s = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/* 지형 아트 위에 얹는 얇은 격자 — 타일 경계를 알려주되 그림을 해치지 않게 */
function drawGridOverlay(ctx, T) {
  ctx.save();
  ctx.strokeStyle = 'rgba(14,9,3,.22)';
  ctx.lineWidth = 1;
  for (let x = 1; x < MAP_W; x++) {
    ctx.beginPath(); ctx.moveTo(Math.round(x * T) + 0.5, 0); ctx.lineTo(Math.round(x * T) + 0.5, MAP_H * T); ctx.stroke();
  }
  for (let y = 1; y < MAP_H; y++) {
    ctx.beginPath(); ctx.moveTo(0, Math.round(y * T) + 0.5); ctx.lineTo(MAP_W * T, Math.round(y * T) + 0.5); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,232,180,.09)';
  ctx.strokeRect(0.5, 0.5, MAP_W * T - 1, MAP_H * T - 1);
  ctx.restore();
}

function buildTerrain() {
  if (!battle) return;
  const c = document.createElement('canvas');
  c.width = Math.round(view.w * view.dpr);
  c.height = Math.round(view.h * view.dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const im = IMG.map[battle.bdef.bg];
  if (im) {
    ctx.drawImage(im, 0, 0, view.w, view.h);
  } else {
    const base = { P: '#50693c', R: '#9b8055', F: '#3a5430', M: '#6b6252', W: '#224e6d', S: '#3d7d92', B: '#2f5471', G: '#6d6455', C: '#453d33' };
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        ctx.fillStyle = base[battle.map[y][x]] || '#50693c';
        ctx.fillRect(x * view.tile, y * view.tile, view.tile, view.tile);
      }
    }
  }
  drawGridOverlay(ctx, view.tile);
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

function drawUnitSprite(ctx, T, u) {
  const img = spriteImg(u.clsKey, u.side);
  const cx = T / 2, baseY = T * 0.97;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.36)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - T * 0.02, T * 0.30, T * 0.115, 0, 0, Math.PI * 2);
  ctx.fill();
  if (img) {
    const boost = SPRITE_SCALE[u.clsKey] || 1;
    const maxH = T * 1.52 * boost, maxW = T * 1.55 * boost;
    const sc = Math.min(maxH / img.naturalHeight, maxW / img.naturalWidth);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx - dw / 2, baseY - dh, dw, dh);
  } else {
    // 폴백: 단순 실루엣
    const P = u.side === 'ally' ? { m: '#3f74b8', d: '#284a76' } : { m: '#a8452f', d: '#6f2a1c' };
    ctx.fillStyle = P.d;
    ctx.fillRect(cx - T * 0.18, baseY - T * 0.62, T * 0.36, T * 0.6);
    ctx.fillStyle = P.m;
    ctx.fillRect(cx - T * 0.22, baseY - T * 0.5, T * 0.44, T * 0.3);
    ctx.beginPath();
    ctx.arc(cx, baseY - T * 0.72, T * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function makePortrait(key, side) {
  const el = document.createElement('img');
  el.className = 'portrait';
  el.alt = '';
  el.draggable = false;
  const src = PORTRAIT_SRC[key];
  if (src) el.src = src;
  else el.style.background = 'radial-gradient(60% 60% at 50% 40%,#2c1f13,#0d0803)';
  return el;
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
  fctx.globalAlpha = u.acted ? 0.58 : 1;
  if (u.side === 'enemy' && battle.phase === 'player' && !u.acted) {
    // 적이 살아 움직이는 느낌: 아주 미세한 숨쉬기
    fctx.translate(0, Math.sin(performance.now() / 700 + u.x) * T * 0.006);
  }
  fctx.translate(-T / 2, -T / 2);
  drawUnitSprite(fctx, T, u);
  fctx.restore();

  if (u.acted && !u.dead) {
    fctx.fillStyle = 'rgba(10,7,4,.20)';
    fctx.fillRect(px + 1, py + 1, T - 2, T - 2);
  }
  // 선택 표시 — 금빛 모서리
  if (sel) {
    const pulse = 0.6 + Math.sin(performance.now() / 220) * 0.3;
    fctx.strokeStyle = `rgba(255,224,140,${pulse})`;
    fctx.lineWidth = Math.max(1.5, T * 0.05);
    const g = T * 0.26, o = 1;
    fctx.beginPath();
    fctx.moveTo(px + o, py + o + g); fctx.lineTo(px + o, py + o); fctx.lineTo(px + o + g, py + o);
    fctx.moveTo(px + T - o - g, py + o); fctx.lineTo(px + T - o, py + o); fctx.lineTo(px + T - o, py + o + g);
    fctx.moveTo(px + T - o, py + T - o - g); fctx.lineTo(px + T - o, py + T - o); fctx.lineTo(px + T - o - g, py + T - o);
    fctx.moveTo(px + o + g, py + T - o); fctx.lineTo(px + o, py + T - o); fctx.lineTo(px + o, py + T - o - g);
    fctx.stroke();
  }
  // HP 바
  const bw = T * 0.74, bh = Math.max(3, T * 0.075);
  const bx = px + (T - bw) / 2, by = py + T * 0.015;
  fctx.fillStyle = 'rgba(8,5,2,.82)';
  fctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  const ratio = clamp(u.hp / u.maxHp, 0, 1);
  fctx.fillStyle = u.side === 'ally' ? (ratio > 0.5 ? '#77cf62' : ratio > 0.25 ? '#ddba4c' : '#cf5539') : '#c8503a';
  fctx.fillRect(bx, by, bw * ratio, bh);
  fctx.strokeStyle = 'rgba(255,235,190,.4)';
  fctx.lineWidth = 1;
  fctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);

  // 지휘관 표식 — 금빛 깃발
  if (u.boss) {
    const sx = px + T * 0.12, sy = py + T * 0.10;
    fctx.strokeStyle = '#3a2410';
    fctx.lineWidth = Math.max(1, T * 0.035);
    fctx.beginPath(); fctx.moveTo(sx, sy); fctx.lineTo(sx, sy + T * 0.26); fctx.stroke();
    fctx.fillStyle = u.side === 'ally' ? '#6fa8e8' : '#e8a03a';
    fctx.beginPath();
    fctx.moveTo(sx, sy);
    fctx.lineTo(sx + T * 0.2, sy + T * 0.05);
    fctx.lineTo(sx, sy + T * 0.11);
    fctx.closePath(); fctx.fill();
  }
  if (u.side === 'ally' && !u.acted && battle.phase === 'player' && !battle.over) {
    const blink = 0.35 + Math.sin(performance.now() / 380) * 0.3;
    fctx.fillStyle = `rgba(140,210,255,${blink})`;
    fctx.fillRect(px + T * 0.42, py + T * 0.95, T * 0.16, T * 0.045);
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
      const rise = p * T * 0.85;
      const pop = 1 + (1 - Math.min(1, p * 6)) * 0.35;
      fctx.globalAlpha = Math.min(1, (1 - p) * 1.5);
      fctx.save();
      fctx.translate(cx, cy - T * 0.22 - rise);
      fctx.scale(pop, pop);
      fctx.font = `900 ${Math.round(T * (f.big ? 0.66 : 0.54))}px "Noto Sans KR", system-ui, sans-serif`;
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      fctx.lineWidth = Math.max(3, T * 0.13);
      fctx.strokeStyle = 'rgba(10,5,2,.95)';
      fctx.strokeText(f.text, 0, 0);
      fctx.fillStyle = f.color;
      fctx.fillText(f.text, 0, 0);
      fctx.restore();
      fctx.globalAlpha = 1;
    } else if (f.kind === 'slash') {
      // 참격 — 굵은 궤적이 베고 지나간다
      for (let i = 0; i < 3; i++) {
        const q = clamp(p * 2.4 - i * 0.18, 0, 1);
        if (q <= 0) continue;
        fctx.globalAlpha = (1 - p * 0.9) * (1 - i * 0.25);
        fctx.strokeStyle = i === 0 ? '#ffffff' : (i === 1 ? '#ffdf9a' : '#ff9a6a');
        fctx.lineWidth = Math.max(2, T * (0.15 - i * 0.04));
        fctx.lineCap = 'round';
        fctx.beginPath();
        const a1 = -Math.PI * 0.72, a2 = Math.PI * 0.44;
        const rr = T * 0.62;
        fctx.arc(cx, cy, rr, a1, a1 + (a2 - a1) * q);
        fctx.stroke();
      }
      fctx.lineCap = 'butt';
      fctx.globalAlpha = 1;
      if (p < 0.16) {
        fctx.fillStyle = `rgba(255,250,235,${(0.16 - p) * 4})`;
        fctx.beginPath(); fctx.arc(cx, cy, T * 0.42, 0, Math.PI * 2); fctx.fill();
      }
    } else if (f.kind === 'spark') {
      fctx.globalAlpha = 1 - p * 0.9;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + h2(f.x, f.y, i) * 1.4;
        const d = T * (0.14 + p * (0.55 + h2(i, f.y, 3) * 0.5));
        fctx.strokeStyle = i % 3 ? '#ffe9a8' : '#fffbe8';
        fctx.lineWidth = Math.max(1.2, T * 0.055 * (1 - p));
        fctx.lineCap = 'round';
        fctx.beginPath();
        fctx.moveTo(cx + Math.cos(a) * d * 0.55, cy + Math.sin(a) * d * 0.55);
        fctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        fctx.stroke();
      }
      fctx.lineCap = 'butt';
      fctx.globalAlpha = 1;
    } else if (f.kind === 'arrow') {
      const sx = f.sx * T + T / 2, sy = f.sy * T + T * 0.45;
      const ex = cx, ey = cy;
      const arc = T * 0.62;
      const pos = (q) => [sx + (ex - sx) * q, sy + (ey - sy) * q - Math.sin(q * Math.PI) * arc];
      // 궤적 잔상
      fctx.globalAlpha = 0.55;
      fctx.strokeStyle = 'rgba(255,248,220,.7)';
      fctx.lineWidth = Math.max(1.2, T * 0.045);
      fctx.lineCap = 'round';
      fctx.beginPath();
      for (let q = 0; q <= 1.001; q += 0.08) {
        const qq = clamp(p - 0.22 * (1 - q), 0, 1);
        const [px, py] = pos(qq);
        if (q === 0) fctx.moveTo(px, py); else fctx.lineTo(px, py);
      }
      fctx.stroke();
      fctx.lineCap = 'butt';
      // 화살
      const [x, y] = pos(p);
      const [x2, y2] = pos(Math.min(1, p + 0.06));
      const ang = Math.atan2(y2 - y, x2 - x);
      fctx.globalAlpha = 1;
      fctx.save();
      fctx.translate(x, y);
      fctx.rotate(ang);
      fctx.fillStyle = 'rgba(255,240,190,.35)';
      fctx.fillRect(-T * 0.42, -T * 0.035, T * 0.5, T * 0.07);
      fctx.fillStyle = '#2a1c0e';
      fctx.fillRect(-T * 0.30, -T * 0.022, T * 0.46, T * 0.044);
      fctx.fillStyle = '#f8f0d2';
      fctx.beginPath();
      fctx.moveTo(T * 0.22, 0);
      fctx.lineTo(T * 0.06, -T * 0.085);
      fctx.lineTo(T * 0.06, T * 0.085);
      fctx.closePath();
      fctx.fill();
      fctx.fillStyle = '#e8d7a8';
      fctx.beginPath();
      fctx.moveTo(-T * 0.30, 0);
      fctx.lineTo(-T * 0.16, -T * 0.07);
      fctx.lineTo(-T * 0.24, 0);
      fctx.lineTo(-T * 0.16, T * 0.07);
      fctx.closePath();
      fctx.fill();
      fctx.restore();
    } else if (f.kind === 'ring') {
      fctx.globalAlpha = (1 - p) * 0.9;
      fctx.strokeStyle = f.color;
      fctx.lineWidth = Math.max(1.5, T * 0.08 * (1 - p));
      fctx.beginPath();
      fctx.arc(cx, cy, T * (0.15 + p * (f.big ? 0.85 : 0.55)), 0, Math.PI * 2);
      fctx.stroke();
      fctx.globalAlpha = 1;
    } else if (f.kind === 'heal') {
      // 회복 — 번지는 초록빛과 솟아오르는 빛 입자
      fctx.globalAlpha = 1;
      const R = T * (0.42 + p * 0.75);
      const grd = fctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grd.addColorStop(0, `rgba(225,255,230,${0.85 * (1 - p)})`);
      grd.addColorStop(0.4, `rgba(150,245,175,${0.45 * (1 - p)})`);
      grd.addColorStop(1, 'rgba(120,225,140,0)');
      fctx.fillStyle = grd;
      fctx.beginPath(); fctx.arc(cx, cy, R, 0, Math.PI * 2); fctx.fill();
      fctx.strokeStyle = `rgba(200,255,210,${0.8 * (1 - p)})`;
      fctx.lineWidth = Math.max(1.5, T * 0.06 * (1 - p));
      fctx.beginPath(); fctx.arc(cx, cy + T * 0.12, T * (0.2 + p * 0.55), 0, Math.PI * 2); fctx.stroke();
      for (let i = 0; i < 14; i++) {
        const ox = (h2(i, f.x, 1) - 0.5) * T * 1.0;
        const oy = (h2(i, f.y, 2) - 0.5) * T * 0.55 - p * T * 1.15;
        const r = Math.max(2, T * 0.085 * (1 - p * 0.5));
        fctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,235,1)' : 'rgba(185,252,196,.95)';
        fctx.beginPath(); fctx.arc(cx + ox, cy + oy, r / 2, 0, Math.PI * 2); fctx.fill();
      }
      fctx.globalAlpha = 1;
    } else if (f.kind === 'buff') {
      fctx.globalAlpha = 1 - p * 0.75;
      for (let i = 0; i < 3; i++) {
        const oy = -p * T * 1.0 + i * T * 0.18;
        const oA = T * 0.24 * (1 - Math.abs(i - 1) * 0.25);
        fctx.strokeStyle = i === 1 ? 'rgba(255,244,200,1)' : 'rgba(255,200,105,.85)';
        fctx.lineWidth = Math.max(2, T * 0.065);
        fctx.beginPath();
        fctx.moveTo(cx - oA, cy + oy + T * 0.09);
        fctx.lineTo(cx, cy + oy - T * 0.05);
        fctx.lineTo(cx + oA, cy + oy + T * 0.09);
        fctx.stroke();
      }
      fctx.globalAlpha = 1;
    } else if (f.kind === 'flame') {
      fctx.globalAlpha = (1 - p) * 0.98;
      // 바닥 불길
      const base = fctx.createRadialGradient(cx, cy + T * 0.18, 0, cx, cy + T * 0.18, T * 0.42);
      base.addColorStop(0, `rgba(255,220,140,${0.8 * (1 - p)})`);
      base.addColorStop(1, 'rgba(220,70,20,0)');
      fctx.fillStyle = base;
      fctx.beginPath(); fctx.arc(cx, cy + T * 0.18, T * 0.42, 0, Math.PI * 2); fctx.fill();
      for (let i = 0; i < 9; i++) {
        const fx = cx + (h2(i, f.t, 3) - 0.5) * T * 0.72;
        const fy = cy + T * 0.24 - p * T * (0.45 + h2(i, f.t, 7) * 1.0);
        const rr = T * 0.26 * (1 - p * 0.85) * (0.7 + h2(i, f.t, 11) * 0.6);
        const grd = fctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(1, rr));
        grd.addColorStop(0, 'rgba(255,250,210,.98)');
        grd.addColorStop(0.35, 'rgba(255,175,60,.9)');
        grd.addColorStop(0.75, 'rgba(220,70,25,.5)');
        grd.addColorStop(1, 'rgba(150,30,10,0)');
        fctx.fillStyle = grd;
        fctx.beginPath(); fctx.arc(fx, fy, Math.max(1, rr), 0, Math.PI * 2); fctx.fill();
      }
      if (p < 0.35) {
        fctx.fillStyle = `rgba(255,225,150,${(0.35 - p) * 1.6})`;
        fctx.beginPath(); fctx.arc(cx, cy, T * 0.6, 0, Math.PI * 2); fctx.fill();
      }
      fctx.globalAlpha = 1;
    } else if (f.kind === 'debuff') {
      fctx.globalAlpha = (1 - p) * 0.9;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - p * 2.4;
        const rr = T * (0.3 + p * 0.36);
        fctx.fillStyle = i % 2 ? 'rgba(200,160,255,.9)' : 'rgba(150,110,220,.85)';
        fctx.beginPath();
        fctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.max(1.5, T * 0.065 * (1 - p)), 0, Math.PI * 2);
        fctx.fill();
      }
      fctx.globalAlpha = 1;
    }
  }
  battle.fx = battle.fx.filter((f) => f.t < f.life);
}

function drawField() {
  if (!battle || !terrainCanvas) return;
  const T = view.tile;
  fctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  fctx.clearRect(0, 0, view.w, view.h);
  fctx.save();
  if (battle.shake && battle.shake.t > 0) {
    battle.shake.t -= 1;
    const k = battle.shake.power * (battle.shake.t / battle.shake.life);
    fctx.translate(rnd(-k, k), rnd(-k, k));
  }
  fctx.drawImage(terrainCanvas, 0, 0, view.w, view.h);

  const sel = selectedUnit();

  // 이동 범위
  if (sel && !sel.acted && battle.phase === 'player' && battle.mode !== 'skill') {
    if (!sel.moved) {
      battle.reach.forEach((n) => {
        if (n.x === sel.x && n.y === sel.y) return;
        if (!canStopAt(n.x, n.y, sel)) return;
        fillTile(n.x, n.y, 'rgba(96,158,236,.28)');
        strokeTile(n.x, n.y, 'rgba(170,215,255,.34)');
      });
    }
  }

  // 사거리
  if (sel && !sel.acted && battle.phase === 'player' && battle.mode !== 'skill') {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (x === sel.x && y === sel.y) continue;
      const enemy = battle.units.find((u) => !u.dead && u.side === 'enemy' && u.x === x && u.y === y);
      if (enemy && inRangeFrom(sel, sel.x, sel.y, enemy)) {
        fillTile(x, y, 'rgba(226,86,60,.32)');
        strokeTile(x, y, 'rgba(255,150,120,.9)', 2);
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
      const color = (sk.kind === 'heal' || sk.kind === 'buff') ? 'rgba(96,214,138,.30)' : 'rgba(226,96,72,.30)';
      const line = (sk.kind === 'heal' || sk.kind === 'buff') ? 'rgba(170,255,196,.85)' : 'rgba(255,158,128,.85)';
      fillTile(x, y, color);
      strokeTile(x, y, line, 2);
      if (sk.kind === 'debuffArea') {
        for (let yy = 0; yy < MAP_H; yy++) for (let xx = 0; xx < MAP_W; xx++) {
          if (cheb(x, y, xx, yy) <= sk.radius && cheb(x, y, xx, yy) > 0) fillTile(xx, yy, 'rgba(176,128,246,.13)');
        }
      }
    }
  }

  const units = battle.units.filter((u) => !u.dead).sort((a, b) => (a.py != null ? a.py : a.y) - (b.py != null ? b.py : b.y));
  units.forEach(drawUnit);
  drawFx();
  fctx.restore();
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
  if (!battle) return;  $('#battle-turn').textContent = `${Math.min(battle.turn, TURN_LIMIT)}턴 / ${TURN_LIMIT}`;
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
  renderFoePanel();
}

function renderFoePanel() {
  const el = $('#foe-panel');
  if (!el) return;
  const foes = battle.units.filter((u) => u.side === 'enemy');
  const left = foes.filter((u) => !u.dead).length;
  el.innerHTML = `<div class="fp-head"><span class="fp-tag">敵</span><span>적 장수</span><b>${left} / ${foes.length}</b></div>
    <div class="fp-list">${foes.map((u) => `
      <div class="foe-row ${u.dead ? 'dead' : ''} ${u.boss ? 'boss' : ''}" data-foe="${u.id}">
        <img class="fp-p" src="${PORTRAIT_SRC[u.pt] || ''}" alt="" />
        <span class="fn">${u.name}</span>
        <span class="fc">${u.cls.name}</span>
        <span class="flv">Lv.${u.lv}</span>
        <span class="fp-hp"><i style="width:${Math.round(100 * Math.max(0, u.hp) / u.maxHp)}%"></i></span>
      </div>`).join('')}</div>`;
  el.querySelectorAll('[data-foe]').forEach((row) => {
    row.addEventListener('click', () => {
      const unit = battle.units.find((q) => q.id === row.getAttribute('data-foe'));
      if (unit) { battle.infoId = unit.id; battle.selId = null; battle.reach = new Map(); renderBattleUI(); }
    });
  });
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
      <div class="u-top"><span class="u-name">${battle.bdef.title}</span>
        <span class="u-hanja">${battle.bdef.subtitle}</span>
        <span class="u-lv">${battle.phase === 'player' ? '아군 차례' : '적 차례'}</span></div>
      <div class="u-hint-line">지도에서 <b>아군</b>을 눌러 이동하고, <b>붉게 빛나는 적</b>을 눌러 공격합니다. · 남은 부대 <b>${remaining}</b></div>
      <div class="allies">${battle.units.filter((q) => q.side === 'ally').map((q) => `
        <span class="ally-chip ${q.acted || q.dead ? 'done' : ''}" data-sel="${q.id}">
          <img class="chip-p" src="${PORTRAIT_SRC[q.pt] || ''}" alt="" />
          <span class="cn">${q.dead ? '✕ ' : ''}${q.name}</span>
          <span class="hp"><i style="width:${Math.round(100 * q.hp / q.maxHp)}%"></i></span>
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
  const tdef = Math.round(t.def * 100);
  el.innerHTML = `<div class="p-slot"></div>
    <div class="u-body">
      <div class="u-top">
        <span class="u-name">${u.name}</span>
        <span class="u-hanja">${u.hanja}</span>
        <span class="u-lv">Lv.${u.lv}${u.boss ? ' · 장수' : ''}</span>
      </div>
      <div class="u-classline"><span class="u-class">${u.cls.name}</span><span class="u-hanja-sm">${u.cls.hanja}</span><span class="u-role">${u.cls.role}</span></div>
      <div class="u-stats">
        <span class="st"><i>무력</i><b>${u.wu}</b></span>
        <span class="st"><i>지력</i><b>${u.ji}</b></span>
        <span class="st"><i>통솔</i><b>${u.tong}</b></span>
        <span class="st sep"><i>공</i><b>${Math.round(effAtk(u))}</b></span>
        <span class="st"><i>방</i><b>${Math.round(effDef(u))}</b></span>
        <span class="st"><i>이동</i><b>${u.mov}</b></span>
      </div>
      <div class="u-bar"><span class="lab">HP</span><div class="bar hp"><i style="width:${Math.round(100 * u.hp / u.maxHp)}%"></i></div><span class="u-val">${u.hp}/${u.maxHp}</span></div>
      <div class="u-bar"><span class="lab">MP</span><div class="bar mp"><i style="width:${Math.round(100 * u.mp / u.maxMp)}%"></i></div><span class="u-val">${u.mp}/${u.maxMp}</span></div>
      <div class="u-terrain"><b>${t.name}</b> · 방어 ${tdef >= 0 ? '+' : ''}${tdef}%${atkMod > 0 ? ` · 공격 +${Math.round(atkMod * 100)}%` : ''}${buffs ? ` · ${buffs}` : ''}</div>
    </div>`;
  el.querySelector('.p-slot').appendChild(makePortrait(u.pt));
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

/* 조조전식 전장 개시 타이틀 카드 */
async function showBattleCard(bdef) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'battle-card';
    layer.innerHTML = `
      <div class="bc-inner">
        <div class="bc-seal">戰</div>
        <div class="bc-title">${bdef.title}</div>
        <div class="bc-rule"><i></i></div>
        <div class="bc-sub">${bdef.subtitle}</div>
      </div>`;
    $('#modal-root').appendChild(layer);
    sfx('turn');
    setTimeout(() => {
      layer.classList.add('out');
      setTimeout(() => { layer.remove(); resolve(); }, 420);
    }, 1250);
  });
}

function showDialogue(lines) {
  return new Promise((resolve) => {
    if (!lines || !lines.length) { resolve(); return; }
    const root = $('#modal-root');
    let idx = 0, typing = false, timer = null;
    const layer = document.createElement('div');
    layer.className = 'dialogue-layer';
    layer.innerHTML = `<div class="cine-bar top"></div>
      <div class="cine-bar bottom"></div>
      <div class="dialogue panel">
        <div class="d-portrait"><div class="p-slot"></div></div>
        <div class="d-body">
          <div class="who"><span class="w-name"></span><span class="hanja"></span><span class="w-cls"></span></div>
          <div class="text"></div>
          <div class="next">▼ 터치</div>
        </div>
      </div>`;
    root.appendChild(layer);
    const slot = layer.querySelector('.p-slot');
    const nameEl = layer.querySelector('.w-name');
    const hanjaEl = layer.querySelector('.who .hanja');
    const clsEl = layer.querySelector('.w-cls');
    const textEl = layer.querySelector('.text');

    const showLine = () => {
      const line = lines[idx];
      if (!line) { finish(); return; }
      nameEl.textContent = line.who;
      hanjaEl.textContent = line.hanja || '';
      clsEl.textContent = (line.side === 'enemy' ? '적' : '아군') + ' · ' + (CLASSES[line.cls] ? CLASSES[line.cls].name : '');
      layer.classList.toggle('enemy', line.side === 'enemy');
      slot.innerHTML = '';
      slot.appendChild(makePortrait(line.pt || portraitKeyFor(line, line.side, line.cls)));
      textEl.textContent = '';
      typing = true;
      let i = 0;
      clearInterval(timer);
      timer = setInterval(() => {
        i += 1;
        textEl.textContent = line.text.slice(0, i);
        if (i >= line.text.length) { clearInterval(timer); typing = false; }
      }, 26);
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
  $('#btn-start').addEventListener('click', () => {
    if (!loadGame()) { startNewGame(); return; }
    const m = openModal(`
      <h2>새로 시작</h2>
      <div class="sub">저장된 진행이 있습니다. 새로 시작하면 지금까지의 진행이 사라집니다.</div>
      <div class="row">
        <button class="btn ghost" id="new-no">취소</button>
        <button class="btn primary" id="new-yes">새로 시작</button>
      </div>
    `, { sticky: true });
    m.el.querySelector('#new-no').addEventListener('click', m.close);
    m.el.querySelector('#new-yes').addEventListener('click', () => { m.close(); startNewGame(); });
  });
  document.addEventListener('pointerdown', () => ensureAudio(), { passive: true });
  $('#btn-continue').addEventListener('click', () => {
    const s = loadGame();
    if (s) resumeGame(s);
    else toast('저장된 진행이 없습니다');
  });
  const saved = loadGame();
  if (saved) $('#btn-continue').classList.remove('hidden');

  window.addEventListener('resize', () => { fitMapFrame(); if (battle) resizeField(); });
  window.addEventListener('orientationchange', () => { setTimeout(() => { fitMapFrame(); if (battle) resizeField(); }, 250); });

  let lastW = 0, lastH = 0;
  const ro = new ResizeObserver(() => {
    if (!battle) return;
    const w = $('#field-stage').clientWidth, h = window.innerHeight;
    if (Math.abs(w - lastW) > 2 || Math.abs(h - lastH) > 2) { lastW = w; lastH = h; resizeField(); }
  });
  ro.observe($('#field-stage'));

  function loop() {
    if (battle) {
      if (!terrainCanvas) resizeField();
      drawField();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  $('#splash').classList.remove('hidden');

  const startBtn = $('#btn-start');
  startBtn.disabled = true;
  $('#splash-foot').textContent = '전장을 그리는 중… 0%';
  preloadAssets((d, t) => {
    if (d < t) $('#splash-foot').textContent = `전장을 그리는 중… ${Math.round((d / t) * 100)}%`;
  }).then(() => {
    startBtn.disabled = false;
    $('#splash-foot').textContent = '1단계 프로토타입 · 모바일 웹';
    if (saved || loadGame()) $('#btn-continue').classList.remove('hidden');
    if (IMG.failed.length) console.warn('에셋 로드 실패', IMG.failed);
  });
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
  warp(id, x, y) {
    const u = battle && battle.units.find((q) => q.id === id);
    if (u) { u.x = x; u.y = y; u.px = null; u.py = null; }
    renderBattleUI();
  },
  fx(kind, x, y) { if (battle) addFx({ kind, x, y, life: 40 }); },
  cast(id, skillId, targetId) {
    if (!battle) return null;
    const u = battle.units.find((q) => q.id === id);
    const sk = SKILLS[skillId];
    const t = targetId ? battle.units.find((q) => q.id === targetId) : null;
    return castSkill(u, sk, t, t ? undefined : { x: u.x, y: u.y });
  },
  selectFirst() { const u = battle && battle.units.find((q) => q.side === 'ally' && !q.dead && !q.acted); if (u) selectUnit(u); return u ? u.name : null; },
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
