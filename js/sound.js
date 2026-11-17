/**
 * Sonido sintetizado con WebAudio: nada de archivos, todo generado.
 * Arranca desactivado; el usuario lo enciende desde la barra de tareas.
 */
let ctx = null;
let master = null;
let enabled = false;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function tone(freq, dur, opts = {}) {
  if (!enabled || !ensure()) return;
  const { type = 'square', gain = 0.05, delay = 0, slide = null, detune = 0 } = opts;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.detune.setValueAtTime(detune, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur = 0.05, gain = 0.03, freq = 1800, delay = 0) {
  if (!enabled || !ensure()) return;
  const t0 = ctx.currentTime + delay;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

const SFX = {
  boot() {
    noise(0.25, 0.05, 900);
    [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.14, { delay: 0.18 + i * 0.11, gain: 0.035, type: 'triangle' }));
  },
  open() {
    tone(740, 0.05, { gain: 0.04 });
    tone(1108, 0.06, { delay: 0.05, gain: 0.035 });
  },
  close() {
    tone(620, 0.05, { gain: 0.035 });
    tone(392, 0.08, { delay: 0.04, gain: 0.03 });
  },
  click() {
    noise(0.028, 0.05, 2400);
  },
  tick() {
    noise(0.012, 0.03, 3200);
  },
  key() {
    noise(0.02, 0.045, 2100);
  },
  apply() {
    tone(880, 0.06, { gain: 0.03 });
    tone(1174, 0.08, { delay: 0.05, gain: 0.025 });
  },
  error() {
    tone(196, 0.18, { gain: 0.05, type: 'sawtooth', slide: 130 });
    tone(146, 0.22, { delay: 0.12, gain: 0.04, type: 'sawtooth' });
  },
  ok() {
    tone(659, 0.07, { gain: 0.03 });
    tone(987, 0.1, { delay: 0.06, gain: 0.03 });
  },
  power() {
    tone(320, 0.25, { gain: 0.045, type: 'triangle', slide: 60 });
    noise(0.16, 0.04, 1200);
  },
  load() {
    for (let i = 0; i < 6; i++) noise(0.03, 0.03, 1400 + i * 260, i * 0.07);
    tone(1046, 0.12, { delay: 0.44, gain: 0.03, type: 'triangle' });
  }
};

export const sound = {
  get enabled() { return enabled; },
  setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) {
      ensure();
      tone(880, 0.06, { gain: 0.04 });
      tone(1320, 0.09, { delay: 0.06, gain: 0.03 });
    }
  },
  play(name) {
    if (!enabled) return;
    const fn = SFX[name];
    if (fn) {
      try { fn(); } catch { /* sin audio, sin drama */ }
    }
  }
};
