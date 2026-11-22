/* ══════════════════════════════════════════════════════════════
   경량 효과음 엔진 (v4) — 공용 오디오 허브 위에서 동작
   · 컨텍스트는 하나만, 동시 발음 수 상한, 같은 소리 연타는 솎아낸다
   ══════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  window.SK = window.SK || {};
  const SK = window.SK;
  const KEY = 'samgukji-jojo-sound';

  let muted = false, unlocked = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) { /* ignore */ }

  function hub() { return window.SKAudio || null; }

  function ready() {
    if (muted) return null;
    const H = hub();
    if (!H) return null;
    const a = H.ensure ? H.ensure() : H.ctx;
    if (!a) return null;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) { /* ignore */ } }
    return a;
  }

  /* 동시 발음 상한 안에서만 소리를 낸다 */
  function guard() {
    const H = hub();
    if (H && H.acquire && !H.acquire()) return false;
    return true;
  }
  function done(node) {
    const H = hub();
    if (!H || !H.release) return;
    if (node && node.onended !== undefined) {
      node.onended = () => { node.onended = null; H.release(); };
    } else {
      setTimeout(() => H.release(), 420);
    }
  }

  function tone(freq, dur, type, vol, opts) {
    const a = ready();
    if (!a || !guard()) return;
    const H = hub();
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
    o.connect(g);
    g.connect(H.sfxBus || a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
    done(o);
  }

  function noise(dur, vol, freq, opts) {
    const a = ready();
    if (!a || !guard()) return;
    const H = hub();
    opts = opts || {};
    const t0 = a.currentTime + (opts.delay || 0);
    const s = a.createBufferSource();
    s.buffer = H.noise || null;
    if (!s.buffer) { done(); return; }
    const f = a.createBiquadFilter();
    f.type = opts.type || 'bandpass';
    f.frequency.setValueAtTime(freq || 1200, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.to), t0 + dur);
    f.Q.value = opts.q == null ? 1 : opts.q;
    const g = a.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol || 0.15), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(H.sfxBus || a.destination);
    s.start(t0);
    s.stop(t0 + dur + 0.03);
    done(s);
  }

  const SOUNDS = {
    step: () => noise(0.045, 0.09, 950, { q: 2.2 }),
    ui: () => tone(680, 0.05, 'sine', 0.09),
    deny: () => tone(200, 0.11, 'square', 0.07, { to: 150 }),
    sword: () => {
      noise(0.13, 0.18, 2800, { q: 0.7 });
      tone(2450, 0.045, 'square', 0.035);
    },
    hit: () => {
      noise(0.1, 0.16, 520, { type: 'lowpass' });
      tone(115, 0.12, 'square', 0.075, { to: 58 });
    },
    bow: () => { tone(920, 0.09, 'triangle', 0.09, { to: 300 }); noise(0.035, 0.06, 3200); },
    bolt: () => { noise(0.3, 0.22, 2400, { q: 0.6 }); tone(1400, 0.12, 'sawtooth', 0.05, { to: 260 }); },
    rock: () => { noise(0.24, 0.18, 340, { type: 'lowpass', to: 90 }); },
    spell: () => {
      tone(523, 0.16, 'sine', 0.075);
      tone(659, 0.16, 'sine', 0.06, { delay: 0.06 });
      tone(784, 0.2, 'sine', 0.06, { delay: 0.12 });
    },
    heal: () => { tone(494, 0.18, 'sine', 0.07); tone(740, 0.24, 'sine', 0.07, { delay: 0.08, to: 900 }); },
    coin: () => { tone(1320, 0.06, 'square', 0.05); tone(1760, 0.08, 'square', 0.04, { delay: 0.05 }); },
    drum: () => { tone(120, 0.16, 'sine', 0.13, { to: 68 }); noise(0.12, 0.1, 420, { type: 'lowpass' }); },
    chop: () => { noise(0.08, 0.12, 720, { type: 'lowpass', to: 320 }); },
    hammer: () => { tone(330, 0.05, 'square', 0.08); noise(0.09, 0.13, 1800); },
    levelup: () => { [784, 988, 1175].forEach((f, i) => tone(f, 0.15, 'triangle', 0.07, { delay: i * 0.07 })); },
    victory: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i === 3 ? 0.55 : 0.16, 'triangle', 0.09, { delay: i * 0.13 })); },
    defeat: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.32, 'sine', 0.08, { delay: i * 0.17 })); },
    turn: () => { tone(330, 0.12, 'triangle', 0.06); tone(440, 0.16, 'triangle', 0.06, { delay: 0.1 }); },
    month: () => { tone(392, 0.14, 'sine', 0.06); tone(523, 0.2, 'sine', 0.06, { delay: 0.1 }); },
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
      const H = hub();
      if (H && H.throttled && H.throttled(name, name === 'step' ? 60 : 32)) return;
      try { f(); } catch (e) { /* audio must never break the game */ }
    },
    unlock() {
      if (unlocked) return;
      unlocked = true;
      const H = hub();
      if (H && H.resume) H.resume();
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

  /* 저장된 설정을 배경음에도 반영 */
  try {
    if (muted && window.JojoBGM) window.JojoBGM.setMuted(true);
  } catch (e) { /* ignore */ }

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
