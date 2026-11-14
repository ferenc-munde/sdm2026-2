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
  POWER: { gain: 0.035, build: hum(55, 240) },
  PRESSURE: { gain: 0.028, build: hiss(1400) },
  FIRE: { gain: 0.045, build: crackle() },
  NAVIGATION: { gain: 0.025, build: blips(880) },
  CARGO: { gain: 0.04, build: rumble() },
  // Hazard aliases (D's hazard types) land on the closest existing patch.
  steam: { gain: 0.03, build: hiss(2400) },
  arcing: { gain: 0.025, build: blips(1400) },
  spill: { gain: 0.02, build: hiss(600) },
  darkness: { gain: 0.03, build: hum(40, 120) },
};

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let current: { stop(): void } | undefined;
let currentKind: string | undefined;
let trainAmbience: { stop(): void } | undefined;
let lobbyMusic: { stop(): void } | undefined;
let volume = 0.7;
let muted = false;
const buffers = new Map<string, AudioBuffer>();

export function unlockAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function getAudioSettings(): { volume: number; muted: boolean } {
  return { volume, muted };
}

export function setAudioVolume(next: number): void {
  volume = Math.max(0, Math.min(1, next));
  updateMasterVolume();
}

export function toggleAudioMute(): boolean {
  muted = !muted;
  updateMasterVolume();
  return muted;
}

function updateMasterVolume(): void {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.035);
}

function whenAudioRuns(action: (audio: AudioContext, output: GainNode) => void): void {
  if (!ctx || !master) return;
  const audio = ctx;
  const output = master;
  const run = () => {
    if (ctx === audio && master === output && audio.state === "running") action(audio, output);
  };
  if (audio.state === "running") run();
  else void audio.resume().then(run).catch(() => {});
}

/** A quiet mechanical bed while players are aboard the train. */
export function playTrainAmbience(): void {
  whenAudioRuns((audio, output) => {
    if (trainAmbience) return;
    const out = audio.createGain();
    out.gain.value = 0.0001;
    out.connect(output);
    out.gain.linearRampToValueAtTime(0.07, audio.currentTime + 1.5);
    const inner = rumble()(audio, out);
    if (!inner) return;
    trainAmbience = {
      stop: () => {
        out.gain.cancelScheduledValues(audio.currentTime);
        out.gain.setValueAtTime(out.gain.value, audio.currentTime);
        out.gain.linearRampToValueAtTime(0.0001, audio.currentTime + 0.6);
        window.setTimeout(() => {
          inner.stop();
          out.disconnect();
        }, 800);
      },
    };
  });
}

export function stopTrainAmbience(): void {
  trainAmbience?.stop();
  trainAmbience = undefined;
}

/** A mellow, repeating pentatonic phrase while players are gathering in the lobby. */
export function playLobbyMusic(): void {
  whenAudioRuns((audio, output) => {
    if (lobbyMusic) return;
    const bus = audio.createGain();
    bus.gain.value = 0.0001;
    bus.connect(output);
    bus.gain.linearRampToValueAtTime(0.075, audio.currentTime + 1.8);

    const phrase = [392, 440, 523.25, 440, 349.23, 392, 440, 392];
    let index = 0;
    let timer = 0;
    let stopped = false;
    const playNote = () => {
      if (stopped || audio.state !== "running") return;
      const start = audio.currentTime;
      const note = audio.createOscillator();
      const envelope = audio.createGain();
      note.type = "sine";
      note.frequency.value = phrase[index % phrase.length]!;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.11, start + 0.24);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 1.25);
      note.connect(envelope);
      envelope.connect(bus);
      note.start(start);
      note.stop(start + 1.3);
      index++;
      timer = window.setTimeout(playNote, 1500);
    };
    playNote();
    lobbyMusic = {
      stop: () => {
        stopped = true;
        window.clearTimeout(timer);
        bus.gain.cancelScheduledValues(audio.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, audio.currentTime);
        bus.gain.linearRampToValueAtTime(0.0001, audio.currentTime + 0.5);
        window.setTimeout(() => bus.disconnect(), 700);
      },
    };
  });
}

export function stopLobbyMusic(): void {
  lobbyMusic?.stop();
  lobbyMusic = undefined;
}

function playToneSequence(notes: readonly { frequency: number; offset: number; duration: number; gain: number }[]): void {
  whenAudioRuns((audio, output) => {
    const start = audio.currentTime;
    for (const note of notes) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = note.frequency;
      envelope.gain.setValueAtTime(0.0001, start + note.offset);
      envelope.gain.exponentialRampToValueAtTime(note.gain, start + note.offset + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + note.offset + note.duration);
      oscillator.connect(envelope);
      envelope.connect(output);
      oscillator.start(start + note.offset);
      oscillator.stop(start + note.offset + note.duration + 0.02);
    }
  });
}

/** Soft confirmation tick for buttons; called after a user gesture unlocks audio. */
export function playButtonInteraction(): void {
  playToneSequence([{ frequency: 560, offset: 0, duration: 0.045, gain: 0.09 }]);
}

/** Short rising chime for completing a repair minigame. */
export function playPuzzleSuccess(): void {
  playToneSequence([
    { frequency: 523, offset: 0, duration: 0.17, gain: 0.1 },
    { frequency: 659, offset: 0.16, duration: 0.22, gain: 0.11 },
  ]);
}

/** Two restrained low notes for a newly dangerous train gauge. */
export function playWarning(): void {
  playToneSequence([
    { frequency: 294, offset: 0, duration: 0.13, gain: 0.095 },
    { frequency: 294, offset: 0.22, duration: 0.13, gain: 0.085 },
  ]);
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
