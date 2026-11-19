/* ══════════════════════════════════════════════════════════════
   오디오 허브 + 배경음 (v4)
   · AudioContext는 앱 전체에 하나만 (효과음·배경음이 같은 컨텍스트를 쓴다)
   · 배경음은 미리 오프라인 렌더링한 루프 버퍼로 재생 → 노드 생성·스케줄 지터 없음
   · 화면이 가려지면 컨텍스트를 재우고, 돌아오면 깨운다
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const THEMES = {
    map: {
      loop: true,
      tempo: 68,
      scale: [220.00, 246.94, 293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25],
      melody: [
        { s: 0, n: 0, d: 3, inst: 'pad' },
        { s: 2, n: 4, d: 2, inst: 'pluck' },
        { s: 4, n: 5, d: 3, inst: 'pluck' },
        { s: 6, n: 3, d: 2, inst: 'pad' },
        { s: 8, n: 2, d: 2, inst: 'pluck' },
        { s: 10, n: 4, d: 2, inst: 'pluck' },
        { s: 12, n: 7, d: 4, inst: 'pad' },
      ],
      bass: [
        { s: 0, n: 0, d: 4, inst: 'pluck' },
        { s: 4, n: 3, d: 4, inst: 'pluck' },
        { s: 8, n: 2, d: 4, inst: 'pluck' },
        { s: 12, n: 0, d: 4, inst: 'pluck' },
      ],
      perc: [
        { s: 0, type: 'deep', vel: 0.75 },
        { s: 6, type: 'rim', vel: 0.35 },
        { s: 8, type: 'deep', vel: 0.65 },
        { s: 14, type: 'rim', vel: 0.4 },
      ],
    },

    domestic: {
      loop: true,
      tempo: 78,
      scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99],
      melody: [
        { s: 0, n: 2, d: 2, inst: 'pluck' },
        { s: 1.5, n: 3, d: 1.5, inst: 'pluck' },
        { s: 3, n: 5, d: 3, inst: 'pad' },
        { s: 6, n: 4, d: 2, inst: 'pluck' },
        { s: 8, n: 3, d: 2, inst: 'pluck' },
        { s: 10, n: 2, d: 2, inst: 'pad' },
        { s: 12, n: 0, d: 4, inst: 'pluck' },
      ],
      bass: [
        { s: 0, n: 0, d: 4, inst: 'pluck' },
        { s: 4, n: 3, d: 4, inst: 'pluck' },
        { s: 8, n: 2, d: 4, inst: 'pluck' },
        { s: 12, n: 5, d: 4, inst: 'pluck' },
      ],
      perc: [
        { s: 0, type: 'rim', vel: 0.25 },
        { s: 4, type: 'rim', vel: 0.2 },
        { s: 8, type: 'rim', vel: 0.28 },
        { s: 12, type: 'rim', vel: 0.2 },
      ],
    },

    battle_siege: {
      loop: true,
      tempo: 112,
      scale: [196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33],
      melody: [
        { s: 0, n: 5, d: 1.5, inst: 'pad' },
        { s: 1.5, n: 6, d: 1.5, inst: 'pluck' },
        { s: 3, n: 7, d: 2, inst: 'pad' },
        { s: 5, n: 5, d: 1, inst: 'pluck' },
        { s: 6, n: 4, d: 2, inst: 'pluck' },
        { s: 8, n: 3, d: 2, inst: 'pad' },
        { s: 10, n: 4, d: 2, inst: 'pluck' },
        { s: 12, n: 2, d: 4, inst: 'pad' },
      ],
      bass: [
        { s: 0, n: 0, d: 2, inst: 'pluck' },
        { s: 2, n: 0, d: 2, inst: 'pluck' },
        { s: 4, n: 3, d: 2, inst: 'pluck' },
        { s: 6, n: 3, d: 2, inst: 'pluck' },
        { s: 8, n: 2, d: 2, inst: 'pluck' },
        { s: 10, n: 2, d: 2, inst: 'pluck' },
        { s: 12, n: 0, d: 4, inst: 'pluck' },
      ],
      perc: [
        { s: 0, type: 'deep', vel: 0.9 },
        { s: 2, type: 'rim', vel: 0.5 },
        { s: 4, type: 'deep', vel: 0.8 },
        { s: 6, type: 'deep', vel: 0.7 },
        { s: 7, type: 'rim', vel: 0.45 },
        { s: 8, type: 'deep', vel: 0.9 },
        { s: 10, type: 'rim', vel: 0.55 },
        { s: 12, type: 'deep', vel: 0.85 },
        { s: 14, type: 'deep', vel: 0.75 },
      ],
    },

    battle_field: {
      loop: true,
      tempo: 132,
      scale: [246.94, 293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25, 783.99],
      melody: [
        { s: 0, n: 0, d: 1, inst: 'pluck' },
        { s: 1, n: 2, d: 1, inst: 'pluck' },
        { s: 2, n: 3, d: 1, inst: 'pluck' },
        { s: 3, n: 4, d: 1, inst: 'pluck' },
        { s: 4, n: 6, d: 2, inst: 'pad' },
        { s: 6, n: 4, d: 1, inst: 'pluck' },
        { s: 7, n: 3, d: 1, inst: 'pluck' },
        { s: 8, n: 4, d: 1.5, inst: 'pluck' },
        { s: 9.5, n: 6, d: 1.5, inst: 'pluck' },
        { s: 11, n: 7, d: 1, inst: 'pluck' },
        { s: 12, n: 6, d: 2, inst: 'pad' },
        { s: 14, n: 4, d: 2, inst: 'pluck' },
      ],
      bass: [
        { s: 0, n: 0, d: 1, inst: 'pluck' },
        { s: 2, n: 0, d: 1, inst: 'pluck' },
        { s: 4, n: 3, d: 1, inst: 'pluck' },
        { s: 6, n: 3, d: 1, inst: 'pluck' },
        { s: 8, n: 4, d: 1, inst: 'pluck' },
        { s: 10, n: 4, d: 1, inst: 'pluck' },
        { s: 12, n: 2, d: 1, inst: 'pluck' },
        { s: 14, n: 3, d: 1, inst: 'pluck' },
      ],
      perc: [
        { s: 0, type: 'deep', vel: 0.85 },
        { s: 1, type: 'rim', vel: 0.4 },
        { s: 2, type: 'deep', vel: 0.65 },
        { s: 3, type: 'rim', vel: 0.45 },
        { s: 4, type: 'deep', vel: 0.85 },
        { s: 5, type: 'rim', vel: 0.4 },
        { s: 6, type: 'deep', vel: 0.7 },
        { s: 7, type: 'rim', vel: 0.5 },
        { s: 8, type: 'deep', vel: 0.85 },
        { s: 9, type: 'rim', vel: 0.45 },
        { s: 10, type: 'deep', vel: 0.75 },
        { s: 11, type: 'rim', vel: 0.5 },
        { s: 12, type: 'deep', vel: 0.9 },
        { s: 14, type: 'deep', vel: 0.8 },
      ],
    },

    victory: {
      loop: false,
      tempo: 116,
      scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99],
      melody: [
        { s: 0, n: 0, d: 1, inst: 'pad' },
        { s: 1, n: 2, d: 1, inst: 'pad' },
        { s: 2, n: 3, d: 1.5, inst: 'pad' },
        { s: 3.5, n: 5, d: 1.5, inst: 'pluck' },
        { s: 5, n: 6, d: 1.5, inst: 'pluck' },
        { s: 6.5, n: 7, d: 1.5, inst: 'pad' },
        { s: 8, n: 8, d: 4, inst: 'pad' },
      ],
      bass: [
        { s: 0, n: 0, d: 2, inst: 'pluck' },
        { s: 2, n: 3, d: 2, inst: 'pluck' },
        { s: 4, n: 5, d: 2, inst: 'pluck' },
        { s: 6, n: 2, d: 2, inst: 'pluck' },
        { s: 8, n: 0, d: 4, inst: 'pad' },
      ],
      perc: [
        { s: 0, type: 'deep', vel: 0.85 },
        { s: 2, type: 'deep', vel: 0.7 },
        { s: 4, type: 'deep', vel: 0.8 },
        { s: 6, type: 'rim', vel: 0.55 },
        { s: 8, type: 'deep', vel: 0.95 },
      ],
    },
  };

  const STEPS_PER_BAR = 16;
  const MASTER_VOLUME = 0.75;
  const MUSIC_VOLUME = 0.34;
  const SFX_VOLUME = 0.8;

  const hub = {
    ctx: null,
    comp: null,
    master: null,
    musicBus: null,
    sfxBus: null,
    noise: null,
    muted: false,
    voices: 0,
    maxVoices: 26,
    hidden: false,
    lastPlay: {},
  };

  function ensure() {
    if (hub.ctx) return hub.ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = new AC();
      hub.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 20;
      comp.ratio.value = 5;
      comp.attack.value = 0.006;
      comp.release.value = 0.22;
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

      // 노이즈 원음 1개만 만들어 재사용 (효과음·배경음 공용)
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
        if (playing) pauseSource();
        if (ctx.state === 'running') { try { ctx.suspend(); } catch (e) { /* ignore */ } }
      } else {
        hub.hidden = false;
        resume().then(() => {
          if (playing && !source) startSource();
        });
      }
    });
  }

  /* ───────────── 악기 (오프라인 렌더에서도 같은 코드 사용) ───────────── */
  function playPluck(ctx, out, freq, t, dur, gainScale) {
    const scale = gainScale || 1;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    const subGain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, t);
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.997, t + dur);
    osc2.frequency.setValueAtTime(freq * 2, t);

    subGain.gain.setValueAtTime(0.1, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + Math.min(0.25, dur * 0.4));

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(2400, freq * 4.5), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(380, freq * 1.4), t + dur);
    filter.Q.value = 1.1;

    const peak = 0.3 * scale;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.014);
    env.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    osc1.connect(filter);
    osc2.connect(subGain);
    subGain.connect(filter);
    filter.connect(env);
    env.connect(out);
    osc1.start(t); osc2.start(t);
    osc1.stop(t + dur + 0.03); osc2.stop(t + dur + 0.03);
  }

  function playPad(ctx, out, freq, t, dur, gainScale) {
    const scale = gainScale || 1;
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    oscA.type = 'sine';
    oscB.type = 'triangle';
    oscA.frequency.setValueAtTime(freq, t);
    oscB.frequency.setValueAtTime(freq * 1.002, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1300, t);
    filter.frequency.linearRampToValueAtTime(930, t + dur);
    filter.Q.value = 0.7;

    const attack = Math.min(0.16, dur * 0.25);
    const release = Math.min(0.24, dur * 0.35);
    const peak = 0.2 * scale;

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.setValueAtTime(peak * 0.85, t + Math.max(attack, dur - release));
    env.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    oscA.connect(filter); oscB.connect(filter);
    filter.connect(env); env.connect(out);
    oscA.start(t); oscB.start(t);
    oscA.stop(t + dur + 0.04); oscB.stop(t + dur + 0.04);
  }

  function playPerc(ctx, out, noiseBuf, type, t, vel) {
    const v = Math.max(0.05, Math.min(1, vel || 0.7));
    if (type === 'deep') {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(116, t);
      osc.frequency.exponentialRampToValueAtTime(46, t + 0.3);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, t);
      filter.Q.value = 1.0;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.42 * v, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0008, t + 0.4);
      osc.connect(filter); filter.connect(env); env.connect(out);
      osc.start(t); osc.stop(t + 0.44);
    } else if (noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(760, t);
      filter.Q.value = 1.5;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.18 * v, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
      src.connect(filter); filter.connect(env); env.connect(out);
      src.start(t); src.stop(t + 0.11);
    }
  }

  function stepDur(theme) { return 60 / theme.tempo / 4; }

  /* ───────────── 테마를 오프라인으로 렌더 → 매끄러운 루프 버퍼 ───────────── */
  const buffers = {};
  const rendering = {};

  function renderTheme(name) {
    if (buffers[name]) return Promise.resolve(buffers[name]);
    if (rendering[name]) return rendering[name];
    const theme = THEMES[name];
    const ctx = hub.ctx;
    if (!theme || !ctx) return Promise.resolve(null);
    const dt = stepDur(theme);
    const bars = theme.loop ? 2 : 1;
    const barLen = STEPS_PER_BAR * dt;
    const tail = 1.1;
    const sr = ctx.sampleRate;
    const Offline = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!Offline) return Promise.resolve(null);
    const total = bars * barLen + tail;
    const off = new Offline(1, Math.ceil(sr * total), sr);

    const noise = off.createBuffer(1, Math.floor(sr * 0.5), sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const music = off.createGain();
    music.gain.value = 1;
    const comp = off.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 5;
    music.connect(comp);
    comp.connect(off.destination);

    for (let step = 0; step < bars * STEPS_PER_BAR; step++) {
      const t = step * dt;
      const s = step % STEPS_PER_BAR;
      theme.melody.forEach((ev) => {
        if (Math.abs(ev.s - s) > 0.001) return;
        const freq = theme.scale[Math.max(0, Math.min(theme.scale.length - 1, ev.n))];
        const dur = Math.max(0.08, ev.d * dt * 0.92);
        if (ev.inst === 'pad') playPad(off, music, freq, t, dur, 0.95);
        else playPluck(off, music, freq, t, dur, 1.0);
      });
      theme.bass.forEach((ev) => {
        if (Math.abs(ev.s - s) > 0.001) return;
        const freq = theme.scale[Math.max(0, Math.min(theme.scale.length - 1, ev.n))] * 0.5;
        const dur = Math.max(0.1, ev.d * dt * 0.95);
        if (ev.inst === 'pad') playPad(off, music, freq, t, dur, 0.75);
        else playPluck(off, music, freq, t, dur, 0.8);
      });
      theme.perc.forEach((ev) => {
        if (Math.abs(ev.s - s) > 0.001) return;
        playPerc(off, music, noise, ev.type, t, ev.vel);
      });
    }

    rendering[name] = off.startRendering().then((rendered) => {
      const src = rendered.getChannelData(0);
      let out = rendered;
      if (theme.loop) {
        // 꼬리를 앞머리에 겹쳐 넣어 이음매 없는 루프를 만든다
        const loopLen = Math.floor(sr * bars * barLen);
        const buf = ctx.createBuffer(1, loopLen, sr);
        const dst = buf.getChannelData(0);
        for (let i = 0; i < loopLen; i++) dst[i] = src[i] || 0;
        for (let i = loopLen; i < src.length; i++) {
          const j = i - loopLen;
          dst[j] = Math.min(1.2, dst[j] + src[i]);
        }
        out = buf;
      }
      buffers[name] = out;
      delete rendering[name];
      return out;
    }).catch(() => { delete rendering[name]; return null; });
    return rendering[name];
  }

  /* ───────────── 재생 상태 ───────────── */
  let currentTheme = null;
  let playing = false;
  let source = null;
  let playToken = 0;

  function fade(gain, to, sec) {
    const ctx = hub.ctx;
    if (!ctx || !gain) return;
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(to, ctx.currentTime, Math.max(0.02, sec));
    } catch (e) { gain.gain.value = to; }
  }

  function stopSource() {
    if (!source) return;
    const s = source;
    source = null;
    try { s.stop(); } catch (e) { /* ignore */ }
    try { s.disconnect(); } catch (e) { /* ignore */ }
  }

  function pauseSource() {
    stopSource();
    isPlaying = false;
  }

  let isPlaying = false;

  function startSource() {
    const ctx = hub.ctx;
    const buf = buffers[currentTheme];
    if (!ctx || !buf) return;
    stopSource();
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = !!THEMES[currentTheme].loop;
    s.connect(hub.musicBus);
    try { s.start(); } catch (e) { return; }
    source = s;
    isPlaying = true;
  }

  function play(themeName) {
    if (!THEMES[themeName]) return;
    ensure();
    if (!hub.ctx) return;
    if (currentTheme === themeName && (isPlaying || rendering[themeName])) return;
    currentTheme = themeName;
    playing = true;
    isPlaying = false;
    const token = ++playToken;
    resume().then(() => renderTheme(themeName)).then((buf) => {
      if (!buf || token !== playToken || currentTheme !== themeName) return;
      if (hub.hidden) { isPlaying = false; return; }
      startSource();
    }).catch(() => {});
  }

  function stop() {
    playing = false;
    currentTheme = null;
    isPlaying = false;
    stopSource();
  }

  function setMuted(bool) {
    hub.muted = Boolean(bool);
    const ctx = ensure();
    if (!ctx || !hub.master) return;
    fade(hub.master, hub.muted ? 0 : MASTER_VOLUME, 0.05);
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

  global.JojoBGM = { play, stop, setMuted, isMuted };

  /* 첫 사용자 제스처에서 컨텍스트를 깨운다 */
  if (typeof document !== 'undefined') {
    const unlock = () => {
      resume().then(() => { if (playing && currentTheme && !isPlaying && !hub.hidden) play(currentTheme); });
    };
    ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
      document.addEventListener(ev, unlock, { passive: true });
    });
  }
})(typeof window !== 'undefined' ? window : this);
