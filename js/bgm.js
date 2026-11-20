/* ══════════════════════════════════════════════════════════════
   오디오 허브 + 배경음 (v5.9 — 16비트 FM · 고전 SRPG 편곡)
   · AudioContext는 앱 전체에 하나만 (효과음·배경음이 같은 컨텍스트를 쓴다)
   · 배경음은 네 겹으로 편곡한다
       ① 리드   — 비브라토가 걸린 FM 피리/얼후 (2-op FM + LFO)
       ② 아르페지오 — 비파·고쟁 느낌의 뜯는 소리 (16분 화음 분산)
       ③ 패드   — 따뜻한 스트링 화음 (디튠 톱니 + 로우패스, 느린 어택)
       ④ 리듬   — 타고 북·스네어·심벌 노이즈
   · 짧은 잔향(4탭 딜레이 + 피드백) 버스를 따로 두어 깡통 소리를 없앤다
   · 테마(표지·내정·지도·야전·공성)마다 조성·템포·화음·북 강약이 다르고,
     화면이 바뀌면 크로스페이드로 갈아탄다
   · 미리 오프라인 렌더링한 루프 버퍼를 재생 → 스케줄 지터 없음
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ───────────── 테마 악보 ─────────────
     s = 16분음표 칸(0..bars*16-1), m = MIDI 음, d = 길이(칸), v = 세기(0~1) */

  const THEMES = {
    /* 표지 — 장엄하고 느린 개막. 낮은 현과 북, 높은 피리 */
    title: {
      loop: true, tempo: 72, bars: 4, arpRate: 2, arpGain: 0.09, padGain: 0.15,
      chords: [
        { notes: [50, 57, 62], bass: 38 },   // Dm
        { notes: [46, 53, 58], bass: 34 },   // Bb
        { notes: [41, 48, 53], bass: 29 },   // F
        { notes: [45, 52, 57], bass: 33 },   // A
      ],
      lead: [
        { s: 0, m: 69, d: 3, v: 0.95 }, { s: 3, m: 74, d: 1, v: 0.85 },
        { s: 4, m: 72, d: 3, v: 0.9 }, { s: 7, m: 69, d: 1, v: 0.8 },
        { s: 8, m: 67, d: 4, v: 0.9 },
        { s: 12, m: 65, d: 2, v: 0.85 }, { s: 14, m: 62, d: 2, v: 0.8 },
        { s: 16, m: 65, d: 3, v: 0.9 }, { s: 19, m: 67, d: 1, v: 0.8 },
        { s: 20, m: 69, d: 6, v: 0.95 },
        { s: 26, m: 74, d: 2, v: 0.85 },
        { s: 28, m: 72, d: 4, v: 0.9 },
        { s: 32, m: 69, d: 3, v: 0.95 }, { s: 35, m: 72, d: 1, v: 0.85 },
        { s: 36, m: 74, d: 4, v: 0.95 }, { s: 40, m: 72, d: 2, v: 0.85 },
        { s: 42, m: 69, d: 2, v: 0.8 }, { s: 44, m: 65, d: 4, v: 0.85 },
        { s: 48, m: 67, d: 2, v: 0.85 }, { s: 50, m: 65, d: 2, v: 0.8 },
        { s: 52, m: 62, d: 4, v: 0.9 },
        { s: 56, m: 62, d: 3, v: 0.8 }, { s: 59, m: 69, d: 1, v: 0.75 },
        { s: 60, m: 74, d: 4, v: 0.9 },
      ],
      bass: [
        { s: 0, m: 38, d: 6, v: 0.9 }, { s: 6, m: 38, d: 2, v: 0.7 },
        { s: 8, m: 45, d: 4, v: 0.8 }, { s: 12, m: 43, d: 4, v: 0.8 },
        { s: 16, m: 34, d: 6, v: 0.9 }, { s: 22, m: 34, d: 2, v: 0.7 },
        { s: 24, m: 41, d: 4, v: 0.8 }, { s: 28, m: 38, d: 4, v: 0.8 },
        { s: 32, m: 29, d: 6, v: 0.9 }, { s: 38, m: 29, d: 2, v: 0.7 },
        { s: 40, m: 36, d: 4, v: 0.8 }, { s: 44, m: 33, d: 4, v: 0.8 },
        { s: 48, m: 33, d: 6, v: 0.9 }, { s: 54, m: 33, d: 2, v: 0.7 },
        { s: 56, m: 40, d: 4, v: 0.8 }, { s: 60, m: 38, d: 4, v: 0.85 },
      ],
      perc: [
        { s: 0, t: 'taiko', v: 0.95 }, { s: 0, t: 'cym', v: 0.55 },
        { s: 6, t: 'rim', v: 0.3 }, { s: 8, t: 'taiko', v: 0.7 },
        { s: 12, t: 'rim', v: 0.32 }, { s: 14, t: 'snare', v: 0.4 },
        { s: 16, t: 'taiko', v: 0.85 }, { s: 22, t: 'rim', v: 0.3 },
        { s: 24, t: 'taiko', v: 0.65 }, { s: 28, t: 'rim', v: 0.32 },
        { s: 30, t: 'snare', v: 0.42 },
        { s: 32, t: 'taiko', v: 0.95 }, { s: 32, t: 'cym', v: 0.5 },
        { s: 38, t: 'rim', v: 0.3 }, { s: 40, t: 'taiko', v: 0.7 },
        { s: 44, t: 'rim', v: 0.32 }, { s: 46, t: 'snare', v: 0.4 },
        { s: 48, t: 'taiko', v: 0.85 }, { s: 54, t: 'rim', v: 0.3 },
        { s: 56, t: 'taiko', v: 0.75 }, { s: 58, t: 'snare', v: 0.45 },
        { s: 60, t: 'taiko', v: 0.8 }, { s: 62, t: 'snare', v: 0.5 },
      ],
    },

    /* 내정 — 평온한 5음계. 고쟁 아르페지오와 부드러운 패드, 가벼운 북 */
    domestic: {
      loop: true, tempo: 84, bars: 4, arpRate: 2, arpGain: 0.13, padGain: 0.13,
      chords: [
        { notes: [55, 59, 62], bass: 43 },   // G
        { notes: [52, 59, 64], bass: 40 },   // Em
        { notes: [48, 55, 60], bass: 36 },   // C
        { notes: [50, 57, 62], bass: 38 },   // D
      ],
      lead: [
        { s: 0, m: 59, d: 2, v: 0.75 }, { s: 2, m: 62, d: 2, v: 0.7 },
        { s: 4, m: 64, d: 4, v: 0.8 }, { s: 8, m: 62, d: 2, v: 0.7 },
        { s: 10, m: 59, d: 2, v: 0.68 }, { s: 12, m: 57, d: 4, v: 0.72 },
        { s: 16, m: 55, d: 2, v: 0.72 }, { s: 18, m: 57, d: 2, v: 0.7 },
        { s: 20, m: 59, d: 4, v: 0.78 }, { s: 24, m: 62, d: 2, v: 0.7 },
        { s: 26, m: 64, d: 2, v: 0.72 }, { s: 28, m: 62, d: 4, v: 0.76 },
        { s: 32, m: 64, d: 2, v: 0.76 }, { s: 34, m: 67, d: 2, v: 0.74 },
        { s: 36, m: 69, d: 4, v: 0.8 }, { s: 40, m: 67, d: 2, v: 0.72 },
        { s: 42, m: 64, d: 2, v: 0.7 }, { s: 44, m: 62, d: 4, v: 0.74 },
        { s: 48, m: 59, d: 2, v: 0.72 }, { s: 50, m: 62, d: 2, v: 0.7 },
        { s: 52, m: 64, d: 2, v: 0.72 }, { s: 54, m: 62, d: 2, v: 0.68 },
        { s: 56, m: 59, d: 6, v: 0.7 },
      ],
      bass: [
        { s: 0, m: 43, d: 4, v: 0.72 }, { s: 4, m: 50, d: 4, v: 0.6 },
        { s: 8, m: 43, d: 4, v: 0.68 }, { s: 12, m: 55, d: 4, v: 0.6 },
        { s: 16, m: 40, d: 4, v: 0.72 }, { s: 20, m: 47, d: 4, v: 0.6 },
        { s: 24, m: 40, d: 4, v: 0.68 }, { s: 28, m: 52, d: 4, v: 0.6 },
        { s: 32, m: 36, d: 4, v: 0.72 }, { s: 36, m: 43, d: 4, v: 0.6 },
        { s: 40, m: 36, d: 4, v: 0.68 }, { s: 44, m: 48, d: 4, v: 0.6 },
        { s: 48, m: 38, d: 4, v: 0.72 }, { s: 52, m: 45, d: 4, v: 0.6 },
        { s: 56, m: 38, d: 4, v: 0.68 }, { s: 60, m: 50, d: 4, v: 0.62 },
      ],
      perc: [
        { s: 0, t: 'rim', v: 0.24 }, { s: 4, t: 'rim', v: 0.18 },
        { s: 8, t: 'rim', v: 0.26 }, { s: 12, t: 'rim', v: 0.18 },
        { s: 16, t: 'taiko', v: 0.32 }, { s: 20, t: 'rim', v: 0.18 },
        { s: 24, t: 'rim', v: 0.24 }, { s: 28, t: 'rim', v: 0.18 },
        { s: 32, t: 'rim', v: 0.26 }, { s: 36, t: 'rim', v: 0.18 },
        { s: 40, t: 'rim', v: 0.24 }, { s: 44, t: 'rim', v: 0.18 },
        { s: 48, t: 'taiko', v: 0.3 }, { s: 52, t: 'rim', v: 0.18 },
        { s: 56, t: 'rim', v: 0.24 }, { s: 60, t: 'rim', v: 0.2 },
      ],
    },

    /* 지도 — 천하를 내려다보는 행진곡. 낮은 현, 또렷한 북, 넓은 선율 */
    map: {
      loop: true, tempo: 96, bars: 4, arpRate: 4, arpGain: 0.07, padGain: 0.16,
      chords: [
        { notes: [45, 52, 57, 60], bass: 33 },   // Am
        { notes: [41, 48, 53, 57], bass: 29 },   // F
        { notes: [43, 50, 55, 59], bass: 31 },   // G
        { notes: [40, 47, 52, 56], bass: 28 },   // E
      ],
      lead: [
        { s: 0, m: 57, d: 4, v: 0.9 }, { s: 4, m: 60, d: 2, v: 0.82 },
        { s: 6, m: 62, d: 2, v: 0.84 }, { s: 8, m: 64, d: 5, v: 0.95 },
        { s: 13, m: 62, d: 3, v: 0.8 },
        { s: 16, m: 60, d: 4, v: 0.88 }, { s: 20, m: 57, d: 4, v: 0.82 },
        { s: 24, m: 55, d: 4, v: 0.84 }, { s: 28, m: 57, d: 4, v: 0.86 },
        { s: 32, m: 64, d: 4, v: 0.95 }, { s: 36, m: 67, d: 2, v: 0.86 },
        { s: 38, m: 69, d: 2, v: 0.88 }, { s: 40, m: 67, d: 6, v: 0.9 },
        { s: 46, m: 64, d: 2, v: 0.82 },
        { s: 48, m: 62, d: 4, v: 0.88 }, { s: 52, m: 60, d: 4, v: 0.84 },
        { s: 56, m: 57, d: 6, v: 0.9 }, { s: 62, m: 55, d: 2, v: 0.78 },
      ],
      bass: [
        { s: 0, m: 33, d: 2, v: 0.82 }, { s: 2, m: 45, d: 2, v: 0.62 },
        { s: 4, m: 33, d: 2, v: 0.78 }, { s: 6, m: 45, d: 2, v: 0.6 },
        { s: 8, m: 33, d: 2, v: 0.8 }, { s: 10, m: 45, d: 2, v: 0.6 },
        { s: 12, m: 31, d: 2, v: 0.72 }, { s: 14, m: 43, d: 2, v: 0.58 },
        { s: 16, m: 29, d: 2, v: 0.82 }, { s: 18, m: 41, d: 2, v: 0.6 },
        { s: 20, m: 29, d: 2, v: 0.78 }, { s: 22, m: 41, d: 2, v: 0.6 },
        { s: 24, m: 29, d: 2, v: 0.8 }, { s: 26, m: 41, d: 2, v: 0.6 },
        { s: 28, m: 28, d: 2, v: 0.72 }, { s: 30, m: 40, d: 2, v: 0.58 },
        { s: 32, m: 31, d: 2, v: 0.82 }, { s: 34, m: 43, d: 2, v: 0.62 },
        { s: 36, m: 31, d: 2, v: 0.78 }, { s: 38, m: 43, d: 2, v: 0.6 },
        { s: 40, m: 31, d: 2, v: 0.8 }, { s: 42, m: 43, d: 2, v: 0.6 },
        { s: 44, m: 36, d: 2, v: 0.72 }, { s: 46, m: 48, d: 2, v: 0.58 },
        { s: 48, m: 28, d: 2, v: 0.82 }, { s: 50, m: 40, d: 2, v: 0.6 },
        { s: 52, m: 28, d: 2, v: 0.78 }, { s: 54, m: 40, d: 2, v: 0.6 },
        { s: 56, m: 33, d: 2, v: 0.8 }, { s: 58, m: 45, d: 2, v: 0.6 },
        { s: 60, m: 31, d: 4, v: 0.78 },
      ],
      perc: [
        { s: 0, t: 'taiko', v: 0.95 }, { s: 0, t: 'cym', v: 0.5 },
        { s: 2, t: 'taiko', v: 0.5 }, { s: 4, t: 'snare', v: 0.42 },
        { s: 6, t: 'taiko', v: 0.62 }, { s: 8, t: 'snare', v: 0.5 },
        { s: 10, t: 'rim', v: 0.3 }, { s: 12, t: 'snare', v: 0.55 },
        { s: 14, t: 'snare', v: 0.6 },
        { s: 16, t: 'taiko', v: 0.9 }, { s: 18, t: 'taiko', v: 0.5 },
        { s: 20, t: 'snare', v: 0.42 }, { s: 22, t: 'taiko', v: 0.6 },
        { s: 24, t: 'snare', v: 0.5 }, { s: 26, t: 'rim', v: 0.3 },
        { s: 28, t: 'snare', v: 0.55 }, { s: 30, t: 'snare', v: 0.6 },
        { s: 32, t: 'taiko', v: 0.95 }, { s: 32, t: 'cym', v: 0.45 },
        { s: 34, t: 'taiko', v: 0.5 }, { s: 36, t: 'snare', v: 0.42 },
        { s: 38, t: 'taiko', v: 0.62 }, { s: 40, t: 'snare', v: 0.5 },
        { s: 42, t: 'rim', v: 0.3 }, { s: 44, t: 'snare', v: 0.55 },
        { s: 46, t: 'snare', v: 0.6 },
        { s: 48, t: 'taiko', v: 0.9 }, { s: 50, t: 'taiko', v: 0.5 },
        { s: 52, t: 'snare', v: 0.45 }, { s: 54, t: 'taiko', v: 0.62 },
        { s: 56, t: 'snare', v: 0.5 }, { s: 58, t: 'tom', v: 0.55 },
        { s: 60, t: 'snare', v: 0.6 }, { s: 62, t: 'snare', v: 0.68 },
      ],
    },

    /* 야전 — 빠른 박자, 질주하는 8분음표 선율과 몰아치는 북 */
    battle_field: {
      loop: true, tempo: 138, bars: 4, arpRate: 1, arpGain: 0.06, padGain: 0.1,
      chords: [
        { notes: [52, 59, 64], bass: 40 },   // Em
        { notes: [48, 55, 60], bass: 36 },   // C
        { notes: [50, 57, 62], bass: 38 },   // D
        { notes: [47, 54, 59], bass: 35 },   // B
      ],
      lead: [
        { s: 0, m: 64, d: 1, v: 0.9 }, { s: 1, m: 67, d: 1, v: 0.8 },
        { s: 2, m: 69, d: 1, v: 0.85 }, { s: 3, m: 71, d: 1, v: 0.9 },
        { s: 4, m: 69, d: 2, v: 0.88 }, { s: 6, m: 67, d: 2, v: 0.82 },
        { s: 8, m: 64, d: 1, v: 0.85 }, { s: 9, m: 62, d: 1, v: 0.78 },
        { s: 10, m: 64, d: 1, v: 0.82 }, { s: 11, m: 67, d: 1, v: 0.86 },
        { s: 12, m: 69, d: 4, v: 0.95 },
        { s: 16, m: 71, d: 2, v: 0.95 }, { s: 18, m: 69, d: 2, v: 0.88 },
        { s: 20, m: 67, d: 2, v: 0.85 }, { s: 22, m: 64, d: 2, v: 0.82 },
        { s: 24, m: 62, d: 1, v: 0.8 }, { s: 25, m: 64, d: 1, v: 0.82 },
        { s: 26, m: 67, d: 2, v: 0.86 }, { s: 28, m: 69, d: 4, v: 0.92 },
        { s: 32, m: 67, d: 1, v: 0.85 }, { s: 33, m: 69, d: 1, v: 0.88 },
        { s: 34, m: 71, d: 2, v: 0.95 }, { s: 36, m: 74, d: 2, v: 0.98 },
        { s: 38, m: 71, d: 2, v: 0.9 }, { s: 40, m: 69, d: 4, v: 0.92 },
        { s: 44, m: 67, d: 4, v: 0.88 },
        { s: 48, m: 64, d: 2, v: 0.9 }, { s: 50, m: 62, d: 2, v: 0.85 },
        { s: 52, m: 59, d: 4, v: 0.9 }, { s: 56, m: 64, d: 6, v: 0.95 },
        { s: 62, m: 67, d: 2, v: 0.85 },
      ],
      bass: [
        { s: 0, m: 40, d: 1, v: 0.8 }, { s: 2, m: 40, d: 1, v: 0.65 },
        { s: 4, m: 47, d: 1, v: 0.7 }, { s: 6, m: 40, d: 1, v: 0.65 },
        { s: 8, m: 40, d: 1, v: 0.8 }, { s: 10, m: 40, d: 1, v: 0.65 },
        { s: 12, m: 47, d: 1, v: 0.7 }, { s: 14, m: 45, d: 1, v: 0.62 },
        { s: 16, m: 36, d: 1, v: 0.8 }, { s: 18, m: 36, d: 1, v: 0.65 },
        { s: 20, m: 43, d: 1, v: 0.7 }, { s: 22, m: 36, d: 1, v: 0.65 },
        { s: 24, m: 36, d: 1, v: 0.8 }, { s: 26, m: 36, d: 1, v: 0.65 },
        { s: 28, m: 43, d: 1, v: 0.7 }, { s: 30, m: 41, d: 1, v: 0.62 },
        { s: 32, m: 38, d: 1, v: 0.8 }, { s: 34, m: 38, d: 1, v: 0.65 },
        { s: 36, m: 45, d: 1, v: 0.7 }, { s: 38, m: 38, d: 1, v: 0.65 },
        { s: 40, m: 38, d: 1, v: 0.8 }, { s: 42, m: 38, d: 1, v: 0.65 },
        { s: 44, m: 45, d: 1, v: 0.7 }, { s: 46, m: 43, d: 1, v: 0.62 },
        { s: 48, m: 35, d: 1, v: 0.82 }, { s: 50, m: 35, d: 1, v: 0.66 },
        { s: 52, m: 42, d: 1, v: 0.72 }, { s: 54, m: 35, d: 1, v: 0.66 },
        { s: 56, m: 35, d: 1, v: 0.82 }, { s: 58, m: 35, d: 1, v: 0.66 },
        { s: 60, m: 42, d: 1, v: 0.72 }, { s: 62, m: 40, d: 1, v: 0.7 },
      ],
      perc: [
        { s: 0, t: 'taiko', v: 0.95 }, { s: 0, t: 'cym', v: 0.5 },
        { s: 2, t: 'snare', v: 0.55 }, { s: 3, t: 'rim', v: 0.28 },
        { s: 4, t: 'taiko', v: 0.72 }, { s: 6, t: 'snare', v: 0.55 },
        { s: 8, t: 'taiko', v: 0.9 }, { s: 10, t: 'snare', v: 0.5 },
        { s: 11, t: 'rim', v: 0.28 }, { s: 12, t: 'taiko', v: 0.68 },
        { s: 14, t: 'snare', v: 0.6 }, { s: 15, t: 'snare', v: 0.5 },
        { s: 16, t: 'taiko', v: 0.95 }, { s: 18, t: 'snare', v: 0.55 },
        { s: 19, t: 'rim', v: 0.28 }, { s: 20, t: 'taiko', v: 0.72 },
        { s: 22, t: 'snare', v: 0.55 }, { s: 24, t: 'taiko', v: 0.9 },
        { s: 26, t: 'snare', v: 0.5 }, { s: 27, t: 'rim', v: 0.28 },
        { s: 28, t: 'taiko', v: 0.68 }, { s: 30, t: 'snare', v: 0.62 },
        { s: 31, t: 'snare', v: 0.52 },
        { s: 32, t: 'taiko', v: 0.95 }, { s: 32, t: 'cym', v: 0.45 },
        { s: 34, t: 'snare', v: 0.55 }, { s: 35, t: 'rim', v: 0.28 },
        { s: 36, t: 'taiko', v: 0.72 }, { s: 38, t: 'snare', v: 0.55 },
        { s: 40, t: 'taiko', v: 0.9 }, { s: 42, t: 'snare', v: 0.5 },
        { s: 43, t: 'rim', v: 0.28 }, { s: 44, t: 'tom', v: 0.6 },
        { s: 46, t: 'snare', v: 0.62 }, { s: 47, t: 'snare', v: 0.52 },
        { s: 48, t: 'taiko', v: 0.95 }, { s: 50, t: 'snare', v: 0.55 },
        { s: 51, t: 'rim', v: 0.28 }, { s: 52, t: 'taiko', v: 0.72 },
        { s: 54, t: 'snare', v: 0.55 }, { s: 56, t: 'taiko', v: 0.92 },
        { s: 58, t: 'tom', v: 0.6 }, { s: 59, t: 'tom', v: 0.55 },
        { s: 60, t: 'snare', v: 0.62 }, { s: 62, t: 'snare', v: 0.7 },
      ],
    },

    /* 공성전 — 더 빠르고 긴장된 단조. 낮은 드론과 쉬지 않는 북 */
    battle_siege: {
      loop: true, tempo: 148, bars: 4, arpRate: 1, arpGain: 0.055, padGain: 0.13,
      drone: 33,
      chords: [
        { notes: [45, 52, 57], bass: 33 },   // Am
        { notes: [41, 48, 53], bass: 29 },   // F
        { notes: [40, 47, 52], bass: 28 },   // E
        { notes: [45, 52, 57], bass: 33 },   // Am
      ],
      lead: [
        { s: 0, m: 69, d: 1, v: 0.95 }, { s: 1, m: 72, d: 1, v: 0.85 },
        { s: 2, m: 71, d: 1, v: 0.88 }, { s: 3, m: 69, d: 1, v: 0.82 },
        { s: 4, m: 64, d: 2, v: 0.9 }, { s: 6, m: 65, d: 2, v: 0.88 },
        { s: 8, m: 64, d: 1, v: 0.86 }, { s: 9, m: 62, d: 1, v: 0.8 },
        { s: 10, m: 64, d: 1, v: 0.84 }, { s: 11, m: 65, d: 1, v: 0.88 },
        { s: 12, m: 69, d: 4, v: 0.96 },
        { s: 16, m: 69, d: 1, v: 0.95 }, { s: 17, m: 72, d: 1, v: 0.85 },
        { s: 18, m: 74, d: 2, v: 0.95 }, { s: 20, m: 72, d: 2, v: 0.9 },
        { s: 22, m: 71, d: 2, v: 0.86 }, { s: 24, m: 69, d: 2, v: 0.88 },
        { s: 26, m: 71, d: 2, v: 0.85 }, { s: 28, m: 72, d: 4, v: 0.95 },
        { s: 32, m: 65, d: 2, v: 0.9 }, { s: 34, m: 64, d: 2, v: 0.86 },
        { s: 36, m: 62, d: 2, v: 0.88 }, { s: 38, m: 64, d: 2, v: 0.9 },
        { s: 40, m: 69, d: 4, v: 0.96 }, { s: 44, m: 68, d: 4, v: 0.94 },
        { s: 48, m: 69, d: 2, v: 0.95 }, { s: 50, m: 71, d: 2, v: 0.9 },
        { s: 52, m: 72, d: 2, v: 0.92 }, { s: 54, m: 71, d: 2, v: 0.88 },
        { s: 56, m: 69, d: 6, v: 0.96 }, { s: 62, m: 64, d: 2, v: 0.85 },
      ],
      bass: [
        { s: 0, m: 33, d: 1, v: 0.9 }, { s: 1, m: 33, d: 1, v: 0.6 },
        { s: 2, m: 45, d: 1, v: 0.72 }, { s: 3, m: 33, d: 1, v: 0.6 },
        { s: 4, m: 33, d: 1, v: 0.86 }, { s: 5, m: 33, d: 1, v: 0.6 },
        { s: 6, m: 45, d: 1, v: 0.72 }, { s: 7, m: 40, d: 1, v: 0.62 },
        { s: 8, m: 33, d: 1, v: 0.9 }, { s: 9, m: 33, d: 1, v: 0.6 },
        { s: 10, m: 45, d: 1, v: 0.72 }, { s: 11, m: 33, d: 1, v: 0.6 },
        { s: 12, m: 40, d: 1, v: 0.82 }, { s: 13, m: 40, d: 1, v: 0.6 },
        { s: 14, m: 47, d: 2, v: 0.72 },
        { s: 16, m: 29, d: 1, v: 0.9 }, { s: 17, m: 29, d: 1, v: 0.6 },
        { s: 18, m: 41, d: 1, v: 0.72 }, { s: 19, m: 29, d: 1, v: 0.6 },
        { s: 20, m: 29, d: 1, v: 0.86 }, { s: 21, m: 29, d: 1, v: 0.6 },
        { s: 22, m: 41, d: 1, v: 0.72 }, { s: 23, m: 36, d: 1, v: 0.62 },
        { s: 24, m: 29, d: 1, v: 0.9 }, { s: 25, m: 29, d: 1, v: 0.6 },
        { s: 26, m: 41, d: 1, v: 0.72 }, { s: 27, m: 29, d: 1, v: 0.6 },
        { s: 28, m: 36, d: 1, v: 0.82 }, { s: 29, m: 36, d: 1, v: 0.6 },
        { s: 30, m: 43, d: 2, v: 0.72 },
        { s: 32, m: 28, d: 1, v: 0.9 }, { s: 33, m: 28, d: 1, v: 0.6 },
        { s: 34, m: 40, d: 1, v: 0.72 }, { s: 35, m: 28, d: 1, v: 0.6 },
        { s: 36, m: 28, d: 1, v: 0.86 }, { s: 37, m: 28, d: 1, v: 0.6 },
        { s: 38, m: 40, d: 1, v: 0.72 }, { s: 39, m: 35, d: 1, v: 0.62 },
        { s: 40, m: 28, d: 1, v: 0.9 }, { s: 41, m: 28, d: 1, v: 0.6 },
        { s: 42, m: 40, d: 1, v: 0.72 }, { s: 43, m: 28, d: 1, v: 0.6 },
        { s: 44, m: 35, d: 1, v: 0.82 }, { s: 45, m: 35, d: 1, v: 0.6 },
        { s: 46, m: 47, d: 2, v: 0.72 },
        { s: 48, m: 33, d: 1, v: 0.92 }, { s: 49, m: 33, d: 1, v: 0.62 },
        { s: 50, m: 45, d: 1, v: 0.74 }, { s: 51, m: 33, d: 1, v: 0.62 },
        { s: 52, m: 33, d: 1, v: 0.88 }, { s: 53, m: 33, d: 1, v: 0.62 },
        { s: 54, m: 45, d: 1, v: 0.74 }, { s: 55, m: 40, d: 1, v: 0.64 },
        { s: 56, m: 33, d: 1, v: 0.92 }, { s: 57, m: 33, d: 1, v: 0.62 },
        { s: 58, m: 45, d: 1, v: 0.74 }, { s: 59, m: 33, d: 1, v: 0.62 },
        { s: 60, m: 40, d: 4, v: 0.84 },
      ],
      perc: [
        { s: 0, t: 'taiko', v: 1 }, { s: 0, t: 'cym', v: 0.6 },
        { s: 1, t: 'snare', v: 0.4 }, { s: 2, t: 'snare', v: 0.55 },
        { s: 3, t: 'rim', v: 0.3 }, { s: 4, t: 'taiko', v: 0.8 },
        { s: 5, t: 'snare', v: 0.4 }, { s: 6, t: 'snare', v: 0.6 },
        { s: 7, t: 'tom', v: 0.5 }, { s: 8, t: 'taiko', v: 0.95 },
        { s: 9, t: 'snare', v: 0.4 }, { s: 10, t: 'snare', v: 0.55 },
        { s: 11, t: 'rim', v: 0.3 }, { s: 12, t: 'taiko', v: 0.75 },
        { s: 13, t: 'snare', v: 0.45 }, { s: 14, t: 'snare', v: 0.65 },
        { s: 15, t: 'snare', v: 0.55 },
        { s: 16, t: 'taiko', v: 1 }, { s: 16, t: 'cym', v: 0.55 },
        { s: 17, t: 'snare', v: 0.4 }, { s: 18, t: 'snare', v: 0.55 },
        { s: 19, t: 'rim', v: 0.3 }, { s: 20, t: 'taiko', v: 0.8 },
        { s: 21, t: 'snare', v: 0.4 }, { s: 22, t: 'snare', v: 0.6 },
        { s: 23, t: 'tom', v: 0.5 }, { s: 24, t: 'taiko', v: 0.95 },
        { s: 25, t: 'snare', v: 0.4 }, { s: 26, t: 'snare', v: 0.55 },
        { s: 27, t: 'rim', v: 0.3 }, { s: 28, t: 'taiko', v: 0.75 },
        { s: 29, t: 'snare', v: 0.45 }, { s: 30, t: 'snare', v: 0.68 },
        { s: 31, t: 'snare', v: 0.6 },
        { s: 32, t: 'taiko', v: 1 }, { s: 32, t: 'cym', v: 0.5 },
        { s: 33, t: 'snare', v: 0.4 }, { s: 34, t: 'snare', v: 0.55 },
        { s: 35, t: 'rim', v: 0.3 }, { s: 36, t: 'taiko', v: 0.8 },
        { s: 37, t: 'snare', v: 0.4 }, { s: 38, t: 'snare', v: 0.6 },
        { s: 39, t: 'tom', v: 0.5 }, { s: 40, t: 'taiko', v: 0.95 },
        { s: 41, t: 'snare', v: 0.4 }, { s: 42, t: 'snare', v: 0.55 },
        { s: 43, t: 'rim', v: 0.3 }, { s: 44, t: 'tom', v: 0.62 },
        { s: 45, t: 'tom', v: 0.58 }, { s: 46, t: 'snare', v: 0.68 },
        { s: 47, t: 'snare', v: 0.62 },
        { s: 48, t: 'taiko', v: 1 }, { s: 48, t: 'cym', v: 0.6 },
        { s: 49, t: 'snare', v: 0.42 }, { s: 50, t: 'snare', v: 0.58 },
        { s: 51, t: 'rim', v: 0.3 }, { s: 52, t: 'taiko', v: 0.85 },
        { s: 53, t: 'snare', v: 0.42 }, { s: 54, t: 'snare', v: 0.6 },
        { s: 55, t: 'tom', v: 0.52 }, { s: 56, t: 'taiko', v: 0.98 },
        { s: 57, t: 'snare', v: 0.45 }, { s: 58, t: 'snare', v: 0.6 },
        { s: 59, t: 'tom', v: 0.55 }, { s: 60, t: 'taiko', v: 0.9 },
        { s: 61, t: 'snare', v: 0.55 }, { s: 62, t: 'snare', v: 0.7 },
        { s: 63, t: 'cym', v: 0.5 },
      ],
    },

    /* 패배 — 짧게 가라앉는 곡 (한 번만) */
    defeat: {
      loop: false, tempo: 88, bars: 2, arpRate: 4, arpGain: 0.07, padGain: 0.15,
      chords: [
        { notes: [45, 52, 57], bass: 33 },   // Am
        { notes: [41, 48, 53], bass: 29 },   // F
      ],
      lead: [
        { s: 0, m: 69, d: 2, v: 0.85 }, { s: 2, m: 67, d: 2, v: 0.78 },
        { s: 4, m: 65, d: 2, v: 0.76 }, { s: 6, m: 64, d: 2, v: 0.74 },
        { s: 8, m: 62, d: 4, v: 0.78 }, { s: 12, m: 60, d: 4, v: 0.72 },
        { s: 16, m: 57, d: 3, v: 0.7 }, { s: 19, m: 55, d: 1, v: 0.62 },
        { s: 20, m: 57, d: 8, v: 0.7 },
      ],
      bass: [
        { s: 0, m: 33, d: 4, v: 0.8 }, { s: 4, m: 45, d: 4, v: 0.66 },
        { s: 8, m: 41, d: 4, v: 0.76 }, { s: 12, m: 40, d: 4, v: 0.66 },
        { s: 16, m: 29, d: 6, v: 0.78 }, { s: 22, m: 36, d: 4, v: 0.62 },
        { s: 26, m: 33, d: 6, v: 0.7 },
      ],
      perc: [
        { s: 0, t: 'taiko', v: 0.8 }, { s: 0, t: 'cym', v: 0.4 },
        { s: 8, t: 'taiko', v: 0.6 }, { s: 16, t: 'tom', v: 0.55 },
        { s: 20, t: 'tom', v: 0.5 }, { s: 24, t: 'taiko', v: 0.7 },
        { s: 24, t: 'cym', v: 0.45 },
      ],
    },

    /* 승리 — 한 번만 울리는 개선가 */
    victory: {
      loop: false, tempo: 120, bars: 2, arpRate: 2, arpGain: 0.1, padGain: 0.16,
      chords: [
        { notes: [48, 55, 60], bass: 36 },   // C
        { notes: [41, 48, 53], bass: 29 },   // F
      ],
      lead: [
        { s: 0, m: 60, d: 1, v: 0.95 }, { s: 1, m: 64, d: 1, v: 0.9 },
        { s: 2, m: 67, d: 1, v: 0.95 }, { s: 3, m: 72, d: 1, v: 1 },
        { s: 4, m: 67, d: 2, v: 0.9 }, { s: 6, m: 69, d: 2, v: 0.9 },
        { s: 8, m: 67, d: 2, v: 0.88 }, { s: 10, m: 64, d: 2, v: 0.86 },
        { s: 12, m: 62, d: 4, v: 0.9 },
        { s: 16, m: 60, d: 1, v: 0.95 }, { s: 17, m: 64, d: 1, v: 0.92 },
        { s: 18, m: 67, d: 1, v: 0.95 }, { s: 19, m: 72, d: 1, v: 1 },
        { s: 20, m: 76, d: 4, v: 1 }, { s: 24, m: 72, d: 2, v: 0.9 },
        { s: 26, m: 67, d: 6, v: 0.95 },
      ],
      bass: [
        { s: 0, m: 36, d: 4, v: 0.85 }, { s: 4, m: 43, d: 4, v: 0.7 },
        { s: 8, m: 36, d: 4, v: 0.8 }, { s: 12, m: 43, d: 4, v: 0.7 },
        { s: 16, m: 29, d: 4, v: 0.85 }, { s: 20, m: 36, d: 4, v: 0.7 },
        { s: 24, m: 48, d: 8, v: 0.8 },
      ],
      perc: [
        { s: 0, t: 'taiko', v: 1 }, { s: 0, t: 'cym', v: 0.65 },
        { s: 4, t: 'snare', v: 0.5 }, { s: 8, t: 'taiko', v: 0.8 },
        { s: 12, t: 'snare', v: 0.55 },
        { s: 16, t: 'taiko', v: 1 }, { s: 16, t: 'cym', v: 0.6 },
        { s: 20, t: 'snare', v: 0.5 }, { s: 24, t: 'taiko', v: 0.95 },
        { s: 24, t: 'cym', v: 0.55 },
      ],
    },
  };

  const STEPS_PER_BAR = 16;
  const MASTER_VOLUME = 0.75;
  const MUSIC_VOLUME = 0.4;
  const SFX_VOLUME = 0.8;
  const FADE_SEC = 1.15;      /* 화면 전환 크로스페이드 */

  const hub = {
    ctx: null, comp: null, master: null, musicBus: null, sfxBus: null, noise: null,
    muted: false, voices: 0, maxVoices: 26, hidden: false, lastPlay: {},
  };

  function ensure() {
    if (hub.ctx) return hub.ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = new AC();
      hub.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 5;
      comp.attack.value = 0.006; comp.release.value = 0.22;
      hub.comp = comp;

      const master = ctx.createGain();
      master.gain.value = hub.muted ? 0 : MASTER_VOLUME;
      hub.master = master;

      const musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_VOLUME;
      hub.musicBus = musicBus;

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = SFX_VOLUME;
      hub.sfxBus = sfxBus;

      comp.connect(master);
      master.connect(ctx.destination);
      musicBus.connect(comp);
      sfxBus.connect(comp);

      const len = Math.floor(ctx.sampleRate * 0.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      hub.noise = buf;

      bindVisibility();
      return ctx;
    } catch (e) {
      hub.ctx = null;
      return null;
    }
  }

  function resume() {
    const ctx = ensure();
    if (!ctx) return Promise.resolve();
    if (ctx.state === 'suspended') return ctx.resume().catch(() => {});
    return Promise.resolve();
  }

  function bindVisibility() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      const ctx = hub.ctx;
      if (!ctx) return;
      if (document.hidden) {
        hub.hidden = true;
        stopAllSources();
        if (ctx.state === 'running') { try { ctx.suspend(); } catch (e) { /* ignore */ } }
      } else {
        hub.hidden = false;
        resume().then(() => {
          if (playing && currentTheme && !chans.length) startTheme(currentTheme, 0.45);
        });
      }
    });
  }

  /* ───────────── 악기 ─────────────
     모두 오프라인 렌더에서도 같은 코드를 쓴다 (ctx만 갈아 끼운다) */

  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ① 리드 — 2-op FM. 반짝이는 배음 + 비브라토로 피리·얼후 느낌 */
  function playLead(ctx, out, freq, t, dur, vel) {
    const v = Math.max(0.05, Math.min(1, vel == null ? 0.9 : vel));
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    car.type = 'sine';
    mod.type = 'sine';
    car.frequency.setValueAtTime(freq * 0.985, t);
    car.frequency.exponentialRampToValueAtTime(freq, t + 0.045);   // 살짝 미끄러져 들어온다
    mod.frequency.setValueAtTime(freq * 2.005, t);
    modGain.gain.setValueAtTime(freq * (0.9 + v * 0.7), t);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.14), t + Math.min(0.3, dur * 0.7));

    vib.type = 'sine';
    vib.frequency.setValueAtTime(5.3, t);
    vibGain.gain.setValueAtTime(0.0001, t);
    vibGain.gain.linearRampToValueAtTime(freq * 0.0058, t + 0.18);   // 비브라토는 조금 늦게
    vib.connect(vibGain);
    vibGain.connect(car.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(6000, freq * 6), t);
    filter.Q.value = 0.9;

    const peak = 0.34 * v;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.028);
    env.gain.linearRampToValueAtTime(peak * 0.8, t + Math.min(0.16, dur * 0.4));
    env.gain.setTargetAtTime(peak * 0.55, t + Math.min(0.2, dur * 0.5), 0.08);
    env.gain.setTargetAtTime(0.0001, t + Math.max(0.05, dur - 0.06), 0.05);

    mod.connect(modGain);
    modGain.connect(car.frequency);
    car.connect(filter);
    filter.connect(env);
    env.connect(out);

    car.start(t); mod.start(t); vib.start(t);
    const end = t + dur + 0.28;
    car.stop(end); mod.stop(end); vib.stop(end);
  }

  /* ② 아르페지오 — 비파·고쟁. 짧게 튕기고 배음이 빠르게 잦아든다 */
  function playPluck(ctx, out, freq, t, dur, vel) {
    const v = Math.max(0.05, Math.min(1, vel == null ? 0.6 : vel));
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    const bright = ctx.createGain();

    o1.type = 'triangle';
    o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(freq, t);
    o2.frequency.setValueAtTime(freq * 2.006, t);
    o2.detune.setValueAtTime(4, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(5200, freq * 9), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(420, freq * 1.5), t + Math.max(0.12, dur));
    filter.Q.value = 1.6;

    bright.gain.setValueAtTime(0.32, t);
    bright.gain.exponentialRampToValueAtTime(0.02, t + Math.min(0.22, dur));

    const peak = 0.26 * v;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.005);
    env.gain.exponentialRampToValueAtTime(peak * 0.42, t + 0.09);
    env.gain.exponentialRampToValueAtTime(0.0006, t + Math.max(0.16, dur));

    o1.connect(filter);
    o2.connect(bright);
    bright.connect(filter);
    filter.connect(env);
    env.connect(out);
    o1.start(t); o2.start(t);
    const end = t + Math.max(0.16, dur) + 0.06;
    o1.stop(end); o2.stop(end);
  }

  /* ③ 패드 — 따뜻한 스트링. 느린 어택, 살짝 디튠 */
  function playString(ctx, out, freq, t, dur, vel) {
    const v = Math.max(0.05, Math.min(1, vel == null ? 0.8 : vel));
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    const c = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    a.type = 'sawtooth'; b.type = 'sawtooth'; c.type = 'triangle';
    a.frequency.setValueAtTime(freq, t);
    b.frequency.setValueAtTime(freq, t);
    c.frequency.setValueAtTime(freq * 2, t);
    a.detune.setValueAtTime(-7, t);
    b.detune.setValueAtTime(7, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1050, t);
    filter.frequency.linearRampToValueAtTime(1500, t + Math.min(0.5, dur * 0.4));
    filter.frequency.linearRampToValueAtTime(820, t + dur);
    filter.Q.value = 0.6;

    const attack = Math.min(0.3, dur * 0.35);
    const peak = 0.115 * v;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.linearRampToValueAtTime(peak * 0.88, t + dur * 0.7);
    env.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.14);

    a.connect(filter); b.connect(filter); c.connect(filter);
    filter.connect(env); env.connect(out);
    a.start(t); b.start(t); c.start(t);
    const end = t + dur + 0.5;
    a.stop(end); b.stop(end); c.stop(end);
  }

  /* 저음 — FM 베이스. 단단하지만 먹먹하지 않게 */
  function playBass(ctx, out, freq, t, dur, vel) {
    const v = Math.max(0.05, Math.min(1, vel == null ? 0.8 : vel));
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    car.type = 'sine';
    mod.type = 'sine';
    sub.type = 'sine';
    car.frequency.setValueAtTime(freq, t);
    mod.frequency.setValueAtTime(freq * 1.005, t);
    modGain.gain.setValueAtTime(freq * 0.75, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.12, t + 0.18);
    sub.frequency.setValueAtTime(freq * 0.5, t);
    subGain.gain.setValueAtTime(0.22 * v, t);
    subGain.gain.exponentialRampToValueAtTime(0.02, t + Math.min(0.4, dur));

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(900, freq * 5), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(160, freq * 1.8), t + dur);
    filter.Q.value = 0.8;

    const peak = 0.3 * v;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.012);
    env.gain.setTargetAtTime(peak * 0.62, t + 0.05, 0.07);
    env.gain.setTargetAtTime(0.0001, t + Math.max(0.06, dur - 0.03), 0.05);

    mod.connect(modGain); modGain.connect(car.frequency);
    car.connect(filter); sub.connect(subGain); subGain.connect(filter);
    filter.connect(env); env.connect(out);
    car.start(t); mod.start(t); sub.start(t);
    const end = t + dur + 0.22;
    car.stop(end); mod.stop(end); sub.stop(end);
  }

  /* ④ 리듬 — 타고북 · 스네어 · 심벌 · 테두리 · 톰 */
  function playDrum(ctx, out, noiseBuf, type, t, vel) {
    const v = Math.max(0.05, Math.min(1, vel == null ? 0.7 : vel));
    if (type === 'taiko') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const body = ctx.createBiquadFilter();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(148, t);
      osc.frequency.exponentialRampToValueAtTime(52, t + 0.22);
      body.type = 'lowpass'; body.frequency.value = 420;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.5 * v, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
      osc.connect(body); body.connect(gain); gain.connect(out);
      osc.start(t); osc.stop(t + 0.46);
      if (noiseBuf) {
        const n = ctx.createBufferSource(); n.buffer = noiseBuf;
        const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 340;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.linearRampToValueAtTime(0.16 * v, t + 0.006);
        ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);
        n.connect(nf); nf.connect(ng); ng.connect(out);
        n.start(t); n.stop(t + 0.16);
      }
    } else if (type === 'tom') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.2);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.32 * v, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
      osc.connect(gain); gain.connect(out);
      osc.start(t); osc.stop(t + 0.3);
    } else if (!noiseBuf) {
      return;
    } else if (type === 'snare') {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1900, t); bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.26 * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);
      n.connect(bp); bp.connect(g); g.connect(out);
      n.start(t); n.stop(t + 0.16);
      const tone = ctx.createOscillator();
      const tg = ctx.createGain();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(196, t);
      tone.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      tg.gain.setValueAtTime(0.0001, t);
      tg.gain.linearRampToValueAtTime(0.12 * v, t + 0.004);
      tg.gain.exponentialRampToValueAtTime(0.0008, t + 0.1);
      tone.connect(tg); tg.connect(out);
      tone.start(t); tone.stop(t + 0.12);
    } else if (type === 'cym') {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14 * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.62);
      n.connect(hp); hp.connect(g); g.connect(out);
      n.start(t); n.stop(t + 0.66);
    } else if (type === 'rim') {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 2600; bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.13 * v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.055);
      n.connect(bp); bp.connect(g); g.connect(out);
      n.start(t); n.stop(t + 0.07);
    }
  }

  /* ───────────── 잔향 버스 (짧은 4탭 딜레이 · 리버브 대용) ───────────── */
  function makeFxBus(ctx, dest, wet) {
    const input = ctx.createGain();
    input.gain.value = wet == null ? 0.32 : wet;
    const damp = ctx.createBiquadFilter();
    damp.type = 'highpass'; damp.frequency.value = 320;
    input.connect(damp);
    const taps = [0.083, 0.149, 0.233, 0.347];
    taps.forEach((dt, i) => {
      const d = ctx.createDelay(1.0);
      d.delayTime.value = dt;
      const fb = ctx.createGain();
      fb.gain.value = 0.44 - i * 0.07;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2900 - i * 380;
      damp.connect(d);
      d.connect(lp);
      lp.connect(fb);
      fb.connect(d);
      lp.connect(dest);
    });
    return input;
  }

  function stepDur(theme) { return 60 / theme.tempo / 4; }

  /* ───────────── 테마를 오프라인 렌더 → 매끄러운 루프 버퍼 ───────────── */
  const buffers = {};
  const rendering = {};

  /* 화음에서 아르페지오 음을 만든다 (위·아래를 오가는 고쟁 주법) */
  function arpNotes(chord, rate, bar) {
    const tones = chord.notes.slice();
    const up = tones.concat(tones.map((n) => n + 12));
    const seq = [];
    for (let i = 0; i < up.length; i++) seq.push(up[i]);
    for (let i = up.length - 2; i > 0; i--) seq.push(up[i]);
    const out = [];
    const n = Math.floor(STEPS_PER_BAR / rate);
    for (let i = 0; i < n; i++) {
      const idx = (i + bar) % seq.length;
      out.push({ s: i * rate, m: seq[idx], d: rate });
    }
    return out;
  }

  function renderTheme(name) {
    if (buffers[name]) return Promise.resolve(buffers[name]);
    if (rendering[name]) return rendering[name];
    const theme = THEMES[name];
    const ctx = hub.ctx;
    if (!theme || !ctx) return Promise.resolve(null);
    const Offline = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!Offline) return Promise.resolve(null);

    const dt = stepDur(theme);
    const barLen = STEPS_PER_BAR * dt;
    const tail = 1.7;
    const sr = ctx.sampleRate;
    const total = theme.bars * barLen + tail;
    const off = new Offline(2, Math.ceil(sr * total), sr);

    const noise = off.createBuffer(1, Math.floor(sr * 0.5), sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const master = off.createGain();
    master.gain.value = 0.9;
    const comp = off.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 22; comp.ratio.value = 3.4;
    comp.attack.value = 0.008; comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(off.destination);

    /* 레이어별 버스 — 겹겹이 쌓여도 서로를 먹지 않게 */
    const busLead = off.createGain(); busLead.gain.value = 0.95;
    const busArp = off.createGain(); busArp.gain.value = theme.arpGain || 0.1;
    const busPad = off.createGain(); busPad.gain.value = theme.padGain || 0.13;
    const busBass = off.createGain(); busBass.gain.value = 0.9;
    const busPerc = off.createGain(); busPerc.gain.value = 0.85;
    [busLead, busArp, busPad, busBass, busPerc].forEach((b) => b.connect(master));

    /* 짧은 잔향 — 리드·아르페지오·패드만 조금 보낸다 */
    const fx = makeFxBus(off, master, 0.3);
    busLead.connect(fx);
    busArp.connect(fx);
    busPad.connect(fx);

    const totalSteps = theme.bars * STEPS_PER_BAR;

    /* ① 리드 */
    (theme.lead || []).forEach((ev) => {
      const t = ev.s * dt;
      const freq = midiHz(ev.m);
      playLead(off, busLead, freq, t, Math.max(0.1, ev.d * dt * 0.95), ev.v);
      /* 한 옥타브 위에 살짝 겹쳐 16비트 FM 특유의 반짝임 */
      if (ev.d >= 3) playLead(off, busLead, freq * 2, t, Math.max(0.08, ev.d * dt * 0.8), (ev.v || 0.8) * 0.16);
    });

    /* ② 패드 + 아르페지오 */
    theme.chords.forEach((chord, bar) => {
      const t = bar * barLen;
      const padLen = barLen * 0.98;
      chord.notes.forEach((m, i) => {
        playString(off, busPad, midiHz(m), t + i * 0.012, padLen, 0.85);
        playString(off, busPad, midiHz(m + 12), t + 0.02 + i * 0.012, padLen * 0.9, 0.32);
      });
      arpNotes(chord, theme.arpRate || 2, bar).forEach((n) => {
        playPluck(off, busArp, midiHz(n.m + 12), t + n.s * dt, Math.max(0.08, n.d * dt), 0.55 + (n.s % 4 === 0 ? 0.25 : 0));
      });
    });

    /* ③ 저음 */
    (theme.bass || []).forEach((ev) => {
      playBass(off, busBass, midiHz(ev.m), ev.s * dt, Math.max(0.08, ev.d * dt * 0.95), ev.v);
    });
    /* 공성전 — 낮은 드론으로 긴장을 깔아 준다 */
    if (theme.drone) {
      playString(off, busBass, midiHz(theme.drone), 0, totalSteps * dt * 0.99, 0.5);
      playString(off, busBass, midiHz(theme.drone + 7), 0, totalSteps * dt * 0.99, 0.22);
    }

    /* ④ 리듬 */
    (theme.perc || []).forEach((ev) => {
      playDrum(off, busPerc, noise, ev.t, ev.s * dt, ev.v);
    });

    rendering[name] = off.startRendering().then((rendered) => {
      const ch0 = rendered.getChannelData(0);
      const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
      let buf;
      if (theme.loop) {
        /* 꼬리를 앞머리에 겹쳐 넣어 이음매 없는 루프를 만든다 */
        const loopLen = Math.floor(sr * theme.bars * barLen);
        buf = ctx.createBuffer(2, loopLen, sr);
        const d0 = buf.getChannelData(0);
        const d1 = buf.getChannelData(1);
        for (let i = 0; i < loopLen; i++) { d0[i] = ch0[i] || 0; d1[i] = ch1[i] || 0; }
        for (let i = loopLen; i < ch0.length; i++) {
          const j = i - loopLen;
          d0[j] = Math.max(-1, Math.min(1, d0[j] + (ch0[i] || 0)));
          d1[j] = Math.max(-1, Math.min(1, d1[j] + (ch1[i] || 0)));
        }
      } else {
        buf = ctx.createBuffer(2, ch0.length, sr);
        buf.getChannelData(0).set(ch0);
        buf.getChannelData(1).set(ch1);
      }
      /* 너무 크면 살짝 눌러 준다 (레이어가 겹칠 때 찢어지지 않게) */
      let peak = 0;
      const a = buf.getChannelData(0);
      for (let i = 0; i < a.length; i += 7) peak = Math.max(peak, Math.abs(a[i]));
      if (peak > 0.82) {
        const k = 0.82 / peak;
        const b0 = buf.getChannelData(0);
        const b1 = buf.getChannelData(1);
        for (let i = 0; i < b0.length; i++) { b0[i] *= k; b1[i] *= k; }
      }
      buffers[name] = buf;
      delete rendering[name];
      return buf;
    }).catch(() => { delete rendering[name]; return null; });
    return rendering[name];
  }

  /* ───────────── 재생 상태 (두 채널 크로스페이드) ───────────── */
  let currentTheme = null;
  let playing = false;
  let chans = [];

  function stopAllSources() {
    chans.forEach((c) => {
      try { c.src.stop(); } catch (e) { /* ignore */ }
      try { c.src.disconnect(); c.gain.disconnect(); } catch (e) { /* ignore */ }
    });
    chans = [];
  }

  function startTheme(themeName, fadeSec) {
    const ctx = hub.ctx;
    const buf = buffers[themeName];
    if (!ctx || !buf) return;
    const theme = THEMES[themeName];
    const fade = fadeSec == null ? FADE_SEC : fadeSec;
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!theme.loop;
    src.connect(gain);
    gain.connect(hub.musicBus);
    try { src.start(now + 0.02); } catch (e) { return; }
    gain.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fade));

    /* 이전 테마는 같은 시간 동안 빠진다 */
    const old = chans;
    chans = [{ src, gain }];
    old.forEach((c) => {
      try {
        c.gain.gain.cancelScheduledValues(now);
        c.gain.gain.setValueAtTime(c.gain.gain.value || 0.6, now);
        c.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.05, fade));
      } catch (e) { /* ignore */ }
      const s = c.src;
      setTimeout(() => {
        try { s.stop(); } catch (e) { /* ignore */ }
        try { s.disconnect(); c.gain.disconnect(); } catch (e) { /* ignore */ }
      }, (fade + 0.2) * 1000);
    });
  }

  function play(themeName) {
    if (!THEMES[themeName]) return;
    ensure();
    if (!hub.ctx) return;
    if (currentTheme === themeName && (chans.length || rendering[themeName])) return;
    const prev = currentTheme;
    currentTheme = themeName;
    playing = true;
    const token = ++playToken;
    resume().then(() => renderTheme(themeName)).then((buf) => {
      if (!buf || token !== playToken || currentTheme !== themeName) return;
      if (hub.hidden) return;
      startTheme(themeName, prev ? FADE_SEC : 0.5);
      prewarm();
    }).catch(() => {});
  }

  let playToken = 0;

  /* 첫 곡이 끝나면 나머지 테마를 미리 렌더해 둔다 (화면 전환 때 끊기지 않게) */
  let prewarmed = false;
  function prewarm() {
    if (prewarmed) return;
    prewarmed = true;
    const rest = Object.keys(THEMES).filter((k) => k !== currentTheme);
    let i = 0;
    const step = () => {
      if (i >= rest.length) return;
      const name = rest[i++];
      renderTheme(name).then(() => setTimeout(step, 60)).catch(() => setTimeout(step, 60));
    };
    setTimeout(step, 900);
  }

  function stop() {
    playing = false;
    currentTheme = null;
    stopAllSources();
  }

  function setMuted(bool) {
    hub.muted = Boolean(bool);
    const ctx = ensure();
    if (!ctx || !hub.master) return;
    try {
      hub.master.gain.cancelScheduledValues(ctx.currentTime);
      hub.master.gain.setTargetAtTime(hub.muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.04);
    } catch (e) { hub.master.gain.value = hub.muted ? 0 : MASTER_VOLUME; }
  }

  function isMuted() { return hub.muted; }

  /* ───────────── 효과음도 같은 허브를 쓴다 ───────────── */
  function acquire() {
    if (hub.voices >= hub.maxVoices) return false;
    hub.voices += 1;
    return true;
  }
  function release() { hub.voices = Math.max(0, hub.voices - 1); }

  function throttled(name, ms) {
    const now = (global.performance && performance.now()) || Date.now();
    const last = hub.lastPlay[name] || 0;
    if (now - last < (ms || 35)) return true;
    hub.lastPlay[name] = now;
    return false;
  }

  global.SKAudio = {
    ensure, resume,
    get ctx() { return hub.ctx; },
    get musicBus() { return hub.musicBus; },
    get sfxBus() { return hub.sfxBus; },
    get noise() { return hub.noise; },
    acquire, release, throttled,
    get muted() { return hub.muted; },
  };

  global.JojoBGM = {
    play, stop, setMuted, isMuted,
    /* 점검용 — 테마 목록·렌더 상태 */
    debug: {
      themes: () => Object.keys(THEMES),
      rendered: () => Object.keys(buffers),
      get current() { return currentTheme; },
      get channels() { return chans.length; },
      spec(name) { const t = THEMES[name]; return t ? { tempo: t.tempo, bars: t.bars, lead: (t.lead || []).length, bass: (t.bass || []).length, perc: (t.perc || []).length, chords: t.chords.length, loop: !!t.loop } : null; },
      levels(name) {
        const b = buffers[name];
        if (!b) return null;
        const d = b.getChannelData(0);
        let peak = 0, sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 3) { const v = Math.abs(d[i]); peak = Math.max(peak, v); sum += v * v; n++; }
        return { sec: +(b.duration).toFixed(2), peak: +peak.toFixed(3), rms: +Math.sqrt(sum / Math.max(1, n)).toFixed(4), ch: b.numberOfChannels };
      },
      render: (n) => renderTheme(n).then((b) => !!b),
    },
  };

  /* 첫 사용자 제스처에서 컨텍스트를 깨운다 */
  if (typeof document !== 'undefined') {
    const unlock = () => {
      resume().then(() => { if (playing && currentTheme && !chans.length && !hub.hidden) play(currentTheme); });
    };
    ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
      document.addEventListener(ev, unlock, { passive: true });
    });
  }
})(typeof window !== 'undefined' ? window : this);
