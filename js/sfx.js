/* ══════════════════════════════════════════════════════════════
   경량 효과음 엔진 — Web Audio 합성 (외부 음원 파일 없음)
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  window.SK = window.SK || {};
  const SK = window.SK;
  const KEY = 'samgukji-jojo-sound';

  let ac = null, master = null, noiseBuf = null;
  let muted = false, unlocked = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) { /* ignore */ }

  function ctx() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.4;
      master.connect(ac.destination);
    } catch (e) { ac = null; master = null; }
    return ac;
  }

  function ready() {
    if (muted) return null;
    const a = ctx();
    if (!a) return null;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) { /* ignore */ } }
    return a;
  }

  function tone(freq, dur, type, vol, opts) {
    const a = ready();
    if (!a) return;
    opts = opts || {};
    const t0 = a.currentTime + (opts.delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(24, opts.to), t0 + dur);
    const v = vol == null ? 0.15 : vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + Math.min(0.02, dur * 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  function noiseBuffer(a) {
    if (noiseBuf) return noiseBuf;
    const len = Math.max(1, Math.floor(a.sampleRate * 0.5));
    const b = a.createBuffer(1, len, a.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b;
    return b;
  }

  function noise(dur, vol, freq, opts) {
    const a = ready();
    if (!a) return;
    opts = opts || {};
    const t0 = a.currentTime + (opts.delay || 0);
    const s = a.createBufferSource();
    s.buffer = noiseBuffer(a);
    const f = a.createBiquadFilter();
    f.type = opts.type || 'bandpass';
    f.frequency.setValueAtTime(freq || 1200, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.to), t0 + dur);
    f.Q.value = opts.q == null ? 1 : opts.q;
    const g = a.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol || 0.15), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.03);
  }

  const SOUNDS = {
    step: () => noise(0.045, 0.09, 950, { q: 2.2 }),
    ui: () => tone(680, 0.05, 'sine', 0.09),
    deny: () => tone(200, 0.11, 'square', 0.07, { to: 150 }),
    sword: () => {
      noise(0.13, 0.2, 2800, { q: 0.7 });
      tone(2450, 0.045, 'square', 0.04);
      tone(190, 0.13, 'sawtooth', 0.05, { to: 85 });
    },
    hit: () => {
      noise(0.1, 0.18, 520, { type: 'lowpass' });
      tone(115, 0.12, 'square', 0.09, { to: 58 });
    },
    bow: () => { tone(920, 0.09, 'triangle', 0.1, { to: 300 }); noise(0.035, 0.07, 3200); },
    rock: () => { noise(0.24, 0.2, 340, { type: 'lowpass', to: 90 }); tone(95, 0.2, 'sine', 0.11, { to: 46 }); },
    spell: () => {
      tone(523, 0.16, 'sine', 0.09);
      tone(659, 0.16, 'sine', 0.08, { delay: 0.06 });
      tone(784, 0.2, 'sine', 0.08, { delay: 0.12 });
    },
    heal: () => { tone(494, 0.18, 'sine', 0.08); tone(740, 0.24, 'sine', 0.08, { delay: 0.08, to: 900 }); },
    coin: () => { tone(1320, 0.06, 'square', 0.06); tone(1760, 0.08, 'square', 0.05, { delay: 0.05 }); },
    drum: () => { tone(120, 0.16, 'sine', 0.15, { to: 68 }); noise(0.12, 0.13, 420, { type: 'lowpass' }); },
    chop: () => { noise(0.08, 0.14, 720, { type: 'lowpass', to: 320 }); },
    hammer: () => { tone(330, 0.05, 'square', 0.09); noise(0.09, 0.16, 1800); },
    levelup: () => { [784, 988, 1175].forEach((f, i) => tone(f, 0.15, 'triangle', 0.08, { delay: i * 0.07 })); },
    victory: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i === 3 ? 0.55 : 0.16, 'triangle', 0.1, { delay: i * 0.13 })); },
    defeat: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.32, 'sine', 0.09, { delay: i * 0.17 })); },
    turn: () => { tone(330, 0.12, 'triangle', 0.07); tone(440, 0.16, 'triangle', 0.07, { delay: 0.1 }); },
    month: () => { tone(392, 0.14, 'sine', 0.07); tone(523, 0.2, 'sine', 0.07, { delay: 0.1 }); },
  };

  function savePref() { try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (e) { /* ignore */ } }

  function syncBgm() {
    const B = window.JojoBGM;
    if (!B || typeof B.setMuted !== 'function') return;
    try { B.setMuted(muted); } catch (e) { /* ignore */ }
  }

  function syncButtons() {
    document.querySelectorAll('.js-sound').forEach((b) => {
      b.classList.toggle('muted', muted);
      b.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
      b.setAttribute('aria-pressed', muted ? 'true' : 'false');
      b.setAttribute('title', muted ? '소리 켜기' : '소리 끄기');
    });
  }

  const SKSfx = {
    play(name) {
      if (muted) return;
      const f = SOUNDS[name];
      if (!f) return;
      try { f(); } catch (e) { /* audio must never break the game */ }
    },
    unlock() {
      if (unlocked) return;
      unlocked = true;
      const a = ctx();
      if (a && a.state === 'suspended') { try { a.resume(); } catch (e) { /* ignore */ } }
    },
    toggle() {
      muted = !muted;
      savePref();
      if (!muted) { SKSfx.unlock(); SKSfx.play('ui'); }
      syncBgm();
      syncButtons();
      return muted;
    },
    get muted() { return muted; },
  };

  SK.sfx = SKSfx;

  document.addEventListener('DOMContentLoaded', () => {
    syncButtons();
    syncBgm();
    document.querySelectorAll('.js-sound').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); SKSfx.toggle(); };
    });
    const unlock = () => SKSfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  });
})();
