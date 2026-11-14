/**
 * Placeholder ambient sound (the "noise"): every task and hazard type gets a
 * small synthesized loop, so the game has audio before any real recordings
 * exist. Swap a `KINDS[kind].asset` in and the synth is bypassed. Hazards
 * (D) reuse the same `playAmbient(kind)` entry point.
 *
 * Browsers only allow audio after a user gesture: call `unlockAudio()` from a
 * key/click handler before the first `playAmbient`.
 */

type Patch = { gain: number; build: (ctx: AudioContext, out: GainNode) => { stop(): void } | null; asset?: string };

const KINDS: Record<string, Patch> = {
  POWER: { gain: 0.05, build: hum(55, 240) },
  PRESSURE: { gain: 0.05, build: hiss(1400) },
  FIRE: { gain: 0.12, build: crackle() },
  NAVIGATION: { gain: 0.03, build: blips(880) },
  CARGO: { gain: 0.09, build: rumble() },
  // Hazard aliases (D's hazard types) land on the closest existing patch.
  steam: { gain: 0.05, build: hiss(2400) },
  arcing: { gain: 0.04, build: blips(1400) },
  spill: { gain: 0.03, build: hiss(600) },
  darkness: { gain: 0.04, build: hum(40, 120) },
};

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let current: { stop(): void } | undefined;
let currentKind: string | undefined;
const buffers = new Map<string, AudioBuffer>();

export function unlockAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function noiseBuffer(ctx: AudioContext, brown: boolean, seconds = 2): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = brown ? Math.min(1, Math.max(-1, last + 0.02 * white)) : white;
    data[i] = brown ? last * 3 : white;
  }
  return buffer;
}

function loopSource(ctx: AudioContext, kind: string, brown = false): AudioBufferSourceNode {
  const key = `${kind}:${brown}`;
  let buffer = buffers.get(key);
  if (!buffer) {
    buffer = noiseBuffer(ctx, brown);
    buffers.set(key, buffer);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function hum(base: number, cutoff: number): Patch["build"] {
  return (ctx, out) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = base;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = cutoff;
    const swell = ctx.createGain();
    swell.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const depth = ctx.createGain();
    depth.gain.value = 0.35;
    lfo.connect(depth);
    depth.connect(swell.gain);
    osc.connect(low);
    low.connect(swell);
    swell.connect(out);
    osc.start();
    lfo.start();
    return { stop: () => { osc.stop(); lfo.stop(); depth.disconnect(); } };
  };
}

function hiss(band: number): Patch["build"] {
  return (ctx, out) => {
    const source = loopSource(ctx, `hiss${band}`);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = band;
    filter.Q.value = 1.1;
    source.connect(filter);
    filter.connect(out);
    source.start();
    return { stop: () => { source.stop(); } };
  };
}

function crackle(): Patch["build"] {
  // Crackle is hiss whose gain jumps around; the jump pattern lives in the buffer.
  return (ctx, out) => {
    const source = loopSource(ctx, "crackle");
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 900;
    source.connect(low);
    low.connect(out);
    source.start();
    return { stop: () => { source.stop(); } };
  };
}

function blips(frequency: number): Patch["build"] {
  return (ctx, out) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const gate = ctx.createOscillator();
    gate.type = "square";
    gate.frequency.value = 0.5;
    const gateGain = ctx.createGain();
    gateGain.gain.value = 0.5;
    const shaper = ctx.createGain();
    shaper.gain.value = 1;
    gate.connect(gateGain);
    gateGain.connect(shaper.gain);
    osc.connect(shaper);
    shaper.connect(out);
    osc.start();
    gate.start();
    return { stop: () => { osc.stop(); gate.stop(); gateGain.disconnect(); } };
  };
}

function rumble(): Patch["build"] {
  return (ctx, out) => {
    const source = loopSource(ctx, "rumble", true);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 120;
    source.connect(low);
    low.connect(out);
    source.start();
    return { stop: () => { source.stop(); } };
  };
}

/** Short ping when a task spawns, so the crew notices a new job. */
export function taskSpawnPing(): void {
  if (!ctx || !master) return;
  const time = ctx.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.12, 1320]] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time + offset);
    gain.gain.exponentialRampToValueAtTime(0.2, time + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + offset + 0.18);
    osc.connect(gain);
    gain.connect(master);
    osc.start(time + offset);
    osc.stop(time + offset + 0.2);
  }
}

/** Crossfade to the loop for `kind` (task type or hazard type). */
export function playAmbient(kind: string): void {
  if (!ctx || !master || kind === currentKind) return;
  stopAmbient();
  const patch = KINDS[kind] ?? KINDS.POWER!;
  if (patch.asset) {
    // Real recording exists: play the file instead of the synth (not wired yet).
    return;
  }
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.connect(master);
  out.gain.linearRampToValueAtTime(patch.gain, ctx.currentTime + 0.8);
  const audio = ctx;
  const inner = patch.build(audio, out);
  if (!inner) return;
  current = {
    stop: () => {
      out.gain.cancelScheduledValues(audio.currentTime);
      out.gain.setValueAtTime(out.gain.value, audio.currentTime);
      out.gain.linearRampToValueAtTime(0.0001, audio.currentTime + 0.4);
      inner.stop();
      window.setTimeout(() => out.disconnect(), 600);
    },
  };
  currentKind = kind;
}

export function stopAmbient(): void {
  current?.stop();
  current = undefined;
  currentKind = undefined;
}
