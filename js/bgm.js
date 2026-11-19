(function (global) {
  'use strict';

  const THEMES = {
    map: {
      loop: true,
      tempo: 68,
      scale: [220.00, 246.94, 293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25], // A3 궁·상·각·치·우 계열
      melody: [
        { s: 0, n: 0, d: 3, inst: 'pad' },
        { s: 2, n: 4, d: 2, inst: 'pluck' },
        { s: 4, n: 5, d: 3, inst: 'pluck' },
        { s: 6, n: 3, d: 2, inst: 'pad' },
        { s: 8, n: 2, d: 2, inst: 'pluck' },
        { s: 10, n: 4, d: 2, inst: 'pluck' },
        { s: 12, n: 7, d: 4, inst: 'pad' }
      ],
      bass: [
        { s: 0, n: 0, d: 4, inst: 'pluck' },
        { s: 4, n: 3, d: 4, inst: 'pluck' },
        { s: 8, n: 2, d: 4, inst: 'pluck' },
        { s: 12, n: 0, d: 4, inst: 'pluck' }
      ],
      perc: [
        { s: 0, type: 'deep', vel: 0.75 },
        { s: 6, type: 'rim', vel: 0.35 },
        { s: 8, type: 'deep', vel: 0.65 },
        { s: 14, type: 'rim', vel: 0.4 }
      ]
    },

    domestic: {
      loop: true,
      tempo: 78,
      scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99], // C4 동양 5음계
      melody: [
        { s: 0, n: 2, d: 2, inst: 'pluck' },
        { s: 1.5, n: 3, d: 1.5, inst: 'pluck' },
        { s: 3, n: 5, d: 3, inst: 'pad' },
        { s: 6, n: 4, d: 2, inst: 'pluck' },
        { s: 8, n: 3, d: 2, inst: 'pluck' },
        { s: 10, n: 2, d: 2, inst: 'pad' },
        { s: 12, n: 0, d: 4, inst: 'pluck' }
      ],
      bass: [
        { s: 0, n: 0, d: 4, inst: 'pluck' },
        { s: 4, n: 3, d: 4, inst: 'pluck' },
        { s: 8, n: 2, d: 4, inst: 'pluck' },
        { s: 12, n: 5, d: 4, inst: 'pluck' }
      ],
      perc: [
        { s: 0, type: 'rim', vel: 0.25 },
        { s: 4, type: 'rim', vel: 0.2 },
        { s: 8, type: 'rim', vel: 0.28 },
        { s: 12, type: 'rim', vel: 0.2 }
      ]
    },

    battle_siege: {
      loop: true,
      tempo: 112,
      scale: [196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33], // G3 비장·중후 5음계
      melody: [
        { s: 0, n: 5, d: 1.5, inst: 'pad' },
        { s: 1.5, n: 6, d: 1.5, inst: 'pluck' },
        { s: 3, n: 7, d: 2, inst: 'pad' },
        { s: 5, n: 5, d: 1, inst: 'pluck' },
        { s: 6, n: 4, d: 2, inst: 'pluck' },
        { s: 8, n: 3, d: 2, inst: 'pad' },
        { s: 10, n: 4, d: 2, inst: 'pluck' },
        { s: 12, n: 2, d: 4, inst: 'pad' }
      ],
      bass: [
        { s: 0, n: 0, d: 2, inst: 'pluck' },
        { s: 2, n: 0, d: 2, inst: 'pluck' },
        { s: 4, n: 3, d: 2, inst: 'pluck' },
        { s: 6, n: 3, d: 2, inst: 'pluck' },
        { s: 8, n: 2, d: 2, inst: 'pluck' },
        { s: 10, n: 2, d: 2, inst: 'pluck' },
        { s: 12, n: 0, d: 4, inst: 'pluck' }
      ],
      perc: [
        { s: 0, type: 'deep', vel: 0.9 },
        { s: 2, type: 'rim', vel: 0.55 },
        { s: 4, type: 'deep', vel: 0.85 },
        { s: 6, type: 'deep', vel: 0.75 },
        { s: 7, type: 'rim', vel: 0.5 },
        { s: 8, type: 'deep', vel: 0.95 },
        { s: 10, type: 'rim', vel: 0.6 },
        { s: 12, type: 'deep', vel: 0.9 },
        { s: 14, type: 'deep', vel: 0.8 },
        { s: 15, type: 'rim', vel: 0.65 }
      ]
    },

    battle_field: {
      loop: true,
      tempo: 138,
      scale: [246.94, 293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25, 783.99], // B3 역동 행군 5음계
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
        { s: 14, n: 4, d: 2, inst: 'pluck' }
      ],
      bass: [
        { s: 0, n: 0, d: 1, inst: 'pluck' },
        { s: 2, n: 0, d: 1, inst: 'pluck' },
        { s: 4, n: 3, d: 1, inst: 'pluck' },
        { s: 6, n: 3, d: 1, inst: 'pluck' },
        { s: 8, n: 4, d: 1, inst: 'pluck' },
        { s: 10, n: 4, d: 1, inst: 'pluck' },
        { s: 12, n: 2, d: 1, inst: 'pluck' },
        { s: 14, n: 3, d: 1, inst: 'pluck' }
      ],
      perc: [
        { s: 0, type: 'deep', vel: 0.85 },
        { s: 1, type: 'rim', vel: 0.45 },
        { s: 2, type: 'deep', vel: 0.7 },
        { s: 3, type: 'rim', vel: 0.5 },
        { s: 4, type: 'deep', vel: 0.9 },
        { s: 5, type: 'rim', vel: 0.45 },
        { s: 6, type: 'deep', vel: 0.75 },
        { s: 7, type: 'rim', vel: 0.55 },
        { s: 8, type: 'deep', vel: 0.9 },
        { s: 9, type: 'rim', vel: 0.5 },
        { s: 10, type: 'deep', vel: 0.8 },
        { s: 11, type: 'rim', vel: 0.55 },
        { s: 12, type: 'deep', vel: 0.95 },
        { s: 14, type: 'deep', vel: 0.85 },
        { s: 15, type: 'rim', vel: 0.65 }
      ]
    },

    victory: {
      loop: false,
      tempo: 116,
      scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99], // C4 승전 팡파르
      melody: [
        { s: 0, n: 0, d: 1, inst: 'pad' },
        { s: 1, n: 2, d: 1, inst: 'pad' },
        { s: 2, n: 3, d: 1.5, inst: 'pad' },
        { s: 3.5, n: 5, d: 1.5, inst: 'pluck' },
        { s: 5, n: 6, d: 1.5, inst: 'pluck' },
        { s: 6.5, n: 7, d: 1.5, inst: 'pad' },
        { s: 8, n: 8, d: 4, inst: 'pad' }
      ],
      bass: [
        { s: 0, n: 0, d: 2, inst: 'pluck' },
        { s: 2, n: 3, d: 2, inst: 'pluck' },
        { s: 4, n: 5, d: 2, inst: 'pluck' },
        { s: 6, n: 2, d: 2, inst: 'pluck' },
        { s: 8, n: 0, d: 4, inst: 'pad' }
      ],
      perc: [
        { s: 0, type: 'deep', vel: 0.85 },
        { s: 2, type: 'deep', vel: 0.75 },
        { s: 4, type: 'deep', vel: 0.85 },
        { s: 6, type: 'rim', vel: 0.6 },
        { s: 8, type: 'deep', vel: 1.0 }
      ]
    }
  };

  const STEPS_PER_BAR = 16;
  const DEFAULT_VOLUME = 0.2; // 0.15 ~ 0.25 범위 유지

  let ctx = null;
  let masterGain = null;
  let compressor = null;
  let noiseBuffer = null;
  let muted = false;
  let currentTheme = null;
  let isPlaying = false;
  let stepIndex = 0;
  let nextStepTime = 0;
  let timerId = null;
  let unlockBound = false;

  function ensureContext() {
    if (ctx) return ctx;
    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    if (!AudioCtx) return null;

    ctx = new AudioCtx();

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.2;

    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : DEFAULT_VOLUME;

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 1.5;
    noiseBuffer = ctx.createBuffer(1, length, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    bindMobileUnlock();
    return ctx;
  }

  function resumeContext() {
    const audioCtx = ensureContext();
    if (!audioCtx) return Promise.resolve();
    if (audioCtx.state === 'suspended') {
      return audioCtx.resume().catch(function () {});
    }
    return Promise.resolve();
  }

  function bindMobileUnlock() {
    if (unlockBound || typeof document === 'undefined') return;
    unlockBound = true;

    const unlock = function () {
      resumeContext().then(function () {
        if (currentTheme && !isPlaying && THEMES[currentTheme]) {
          startLoop(currentTheme);
        }
      });
    };

    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('click', unlock, { passive: true });
  }

  function stepDurationSec(tempo) {
    // 16분음표 1스텝 기준 (4/4박자 한 마디 = 16스텝)
    return 60 / tempo / 4;
  }

  function playPluck(freq, startTime, durSec, gainScale) {
    if (!ctx || !compressor) return;
    const scale = gainScale || 1;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    // 가야금·거문고 현의 미세한 피치 떨림(여운)
    osc1.frequency.setValueAtTime(freq, startTime);
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.997, startTime + durSec);
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.12, startTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.min(0.25, durSec * 0.4));

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(2400, freq * 4.5), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(380, freq * 1.4), startTime + durSec);
    filter.Q.value = 1.2;

    const peak = 0.32 * scale;
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peak, startTime + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + durSec);

    osc1.connect(filter);
    osc2.connect(subGain);
    subGain.connect(filter);
    filter.connect(env);
    env.connect(compressor);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + durSec + 0.03);
    osc2.stop(startTime + durSec + 0.03);
  }

  function playPad(freq, startTime, durSec, gainScale) {
    if (!ctx || !compressor) return;
    const scale = gainScale || 1;

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    // 대금·피리·관악기 패드 느낌
    oscA.type = 'sine';
    oscB.type = 'triangle';
    oscA.frequency.setValueAtTime(freq, startTime);
    oscB.frequency.setValueAtTime(freq * 1.002, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1350, startTime);
    filter.frequency.linearRampToValueAtTime(950, startTime + durSec);
    filter.Q.value = 0.8;

    const attack = Math.min(0.18, durSec * 0.25);
    const release = Math.min(0.25, durSec * 0.35);
    const peak = 0.22 * scale;

    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peak, startTime + attack);
    env.gain.setValueAtTime(peak * 0.85, startTime + Math.max(attack, durSec - release));
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + durSec);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(env);
    env.connect(compressor);

    oscA.start(startTime);
    oscB.start(startTime);
    oscA.stop(startTime + durSec + 0.04);
    oscB.stop(startTime + durSec + 0.04);
  }

  function playPerc(type, startTime, vel) {
    if (!ctx || !compressor) return;
    const v = Math.max(0.05, Math.min(1, vel || 0.7));

    if (type === 'deep') {
      // 동양 큰북(장고·대고) 저음 타격 + 부드러운 로우패스
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(118, startTime);
      osc.frequency.exponentialRampToValueAtTime(46, startTime + 0.32);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, startTime);
      filter.Q.value = 1.0;

      env.gain.setValueAtTime(0.0001, startTime);
      env.gain.linearRampToValueAtTime(0.45 * v, startTime + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.42);

      osc.connect(filter);
      filter.connect(env);
      env.connect(compressor);

      osc.start(startTime);
      osc.stop(startTime + 0.45);
    } else {
      // 북변·징·목탁 계열 부드러운 고음 어택(노이즈 + 필터)
      if (!noiseBuffer) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(780, startTime);
      filter.Q.value = 1.6;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, startTime);
      env.gain.linearRampToValueAtTime(0.2 * v, startTime + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.09);

      src.connect(filter);
      filter.connect(env);
      env.connect(compressor);

      src.start(startTime);
      src.stop(startTime + 0.11);
    }
  }

  function scheduleStep(theme, step, time) {
    const dt = stepDurationSec(theme.tempo);
    const scale = theme.scale;

    theme.melody.forEach(function (ev) {
      if (Math.abs(ev.s - step) < 0.001) {
        const freq = scale[Math.max(0, Math.min(scale.length - 1, ev.n))];
        const dur = Math.max(0.08, ev.d * dt * 0.92);
        if (ev.inst === 'pad') {
          playPad(freq, time, dur, 0.95);
        } else {
          playPluck(freq, time, dur, 1.0);
        }
      }
    });

    theme.bass.forEach(function (ev) {
      if (Math.abs(ev.s - step) < 0.001) {
        const freq = scale[Math.max(0, Math.min(scale.length - 1, ev.n))] * 0.5;
        const dur = Math.max(0.1, ev.d * dt * 0.95);
        if (ev.inst === 'pad') {
          playPad(freq, time, dur, 0.75);
        } else {
          playPluck(freq, time, dur, 0.8);
        }
      }
    });

    theme.perc.forEach(function (ev) {
      if (Math.abs(ev.s - step) < 0.001) {
        playPerc(ev.type, time, ev.vel);
      }
    });
  }

  function clearTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function scheduler() {
    if (!ctx || !isPlaying || !currentTheme) return;
    const theme = THEMES[currentTheme];
    if (!theme) return;

    const dt = stepDurationSec(theme.tempo);
    const lookahead = 0.12;

    while (nextStepTime < ctx.currentTime + lookahead) {
      if (!theme.loop && stepIndex >= STEPS_PER_BAR) {
        isPlaying = false;
        clearTimer();
        return;
      }

      const barStep = stepIndex % STEPS_PER_BAR;
      scheduleStep(theme, barStep, nextStepTime);

      nextStepTime += dt;
      stepIndex += 1;
    }
  }

  function startLoop(themeName) {
    const theme = THEMES[themeName];
    if (!theme || !ctx) return;

    clearTimer();
    currentTheme = themeName;
    stepIndex = 0;
    nextStepTime = ctx.currentTime + 0.04;
    isPlaying = true;

    timerId = setInterval(scheduler, 25);
  }

  function stop() {
    isPlaying = false;
    currentTheme = null;
    stepIndex = 0;
    clearTimer();
  }

  function play(themeName) {
    if (!THEMES[themeName]) return;

    const audioCtx = ensureContext();
    if (!audioCtx) return;

    currentTheme = themeName;
    stepIndex = 0;

    if (audioCtx.state === 'suspended') {
      isPlaying = false;
      audioCtx.resume().then(function () {
        if (currentTheme === themeName) {
          startLoop(themeName);
        }
      }).catch(function () {});
      return;
    }

    startLoop(themeName);
  }

  function setMuted(bool) {
    muted = Boolean(bool);
    ensureContext();
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : DEFAULT_VOLUME, ctx.currentTime, 0.02);
    }
  }

  function isMuted() {
    return muted;
  }

  global.JojoBGM = {
    play: play,
    stop: stop,
    setMuted: setMuted,
    isMuted: isMuted
  };
})(typeof window !== 'undefined' ? window : this);
