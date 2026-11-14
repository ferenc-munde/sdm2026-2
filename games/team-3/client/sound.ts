// Sound effects (#31).
//
// `eventsBetween` is pure and tested: it compares two states and says which
// sounds should play. `createSoundPlayer` plays them with the Web Audio API
// (no audio files), and `createMuteButton` is the on/off control.
//
// The browser does not allow audio before a user gesture, so the AudioContext is
// created lazily on the first sound; the demo page makes a sound on a click.

import { LOW_FUEL_THRESHOLD } from "../shared/constants.ts";
import type { GameState } from "../shared/types.ts";

export type SoundName = "hazard" | "repairDone" | "lowFuel" | "depart" | "win" | "lose";

/** One beep: a frequency and how long it lasts. */
export interface Note {
  frequency: number;
  seconds: number;
}

export interface SoundSpec {
  type: OscillatorType;
  /** Peak gain, 0..1. */
  volume: number;
  notes: readonly Note[];
}

/** The short sounds of #31. Kept short on purpose: they are cues, not music. */
export const SOUNDS: Record<SoundName, SoundSpec> = {
  hazard: {
    type: "square",
    volume: 0.16,
    notes: [
      { frequency: 660, seconds: 0.12 },
      { frequency: 440, seconds: 0.16 },
    ],
  },
  repairDone: {
    type: "sine",
    volume: 0.18,
    notes: [
      { frequency: 660, seconds: 0.1 },
      { frequency: 880, seconds: 0.14 },
    ],
  },
  lowFuel: {
    type: "triangle",
    volume: 0.18,
    notes: [
      { frequency: 440, seconds: 0.14 },
      { frequency: 440, seconds: 0.14 },
    ],
  },
  depart: {
    type: "triangle",
    volume: 0.22,
    notes: [
      { frequency: 784, seconds: 0.14 },
      { frequency: 1046, seconds: 0.22 },
    ],
  },
  win: {
    type: "sine",
    volume: 0.2,
    notes: [
      { frequency: 523, seconds: 0.16 },
      { frequency: 659, seconds: 0.16 },
      { frequency: 784, seconds: 0.24 },
    ],
  },
  lose: {
    type: "sine",
    volume: 0.2,
    notes: [
      { frequency: 392, seconds: 0.18 },
      { frequency: 311, seconds: 0.18 },
      { frequency: 233, seconds: 0.28 },
    ],
  },
};

const hazardIds = (state: GameState): Set<string> => new Set(Object.keys(state.hazards));

/**
 * Which sounds a state change should play. Win and lose replace everything else,
 * so a run that ends does not also beep for the hazard that ended it.
 */
export function eventsBetween(previous: GameState, next: GameState): SoundName[] {
  if (next.phase !== previous.phase) {
    if (next.phase === "won") return ["win"];
    if (next.phase === "lost") return ["lose"];
    // The host's confirmed departure, after the 5 s countdown (#385/#401).
    if (previous.phase === "lobby" && next.phase === "playing") return ["depart"];
  }

  const before = hazardIds(previous);
  const after = hazardIds(next);
  const sounds: SoundName[] = [];
  if ([...after].some((id) => !before.has(id))) sounds.push("hazard");
  if ([...before].some((id) => !after.has(id))) sounds.push("repairDone");

  const crossedLowFuel =
    previous.journey.fuel > LOW_FUEL_THRESHOLD && next.journey.fuel <= LOW_FUEL_THRESHOLD;
  if (crossedLowFuel) sounds.push("lowFuel");

  return sounds;
}

// --- Web Audio, behind small interfaces so it can be tested without a browser ---

export interface ToneNode {
  type: OscillatorType;
  frequency: { setValueAtTime(value: number, when: number): void };
  connect(destination: unknown): void;
  start(when: number): void;
  stop(when: number): void;
}

export interface GainNodeLike {
  gain: {
    setValueAtTime(value: number, when: number): void;
    linearRampToValueAtTime(value: number, when: number): void;
  };
  connect(destination: unknown): void;
}

export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  state?: string;
  resume?(): Promise<void>;
  createOscillator(): ToneNode;
  createGain(): GainNodeLike;
}

export interface SoundPlayer {
  readonly muted: boolean;
  play(name: SoundName): void;
  setMuted(value: boolean): void;
}

/** Creates the tiny synth that plays the sounds. */
export function createSoundPlayer(
  createContext: () => AudioContextLike = () => new AudioContext(),
): SoundPlayer {
  let context: AudioContextLike | null = null;
  let muted = false;

  const contextFor = (): AudioContextLike => {
    if (!context) context = createContext();
    if (context.state === "suspended") void context.resume?.();
    return context;
  };

  return {
    get muted() {
      return muted;
    },
    setMuted(value: boolean): void {
      muted = value;
    },
    play(name: SoundName): void {
      if (muted) return;
      const spec = SOUNDS[name];
      const audio = contextFor();
      let when = audio.currentTime;

      for (const note of spec.notes) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = spec.type;
        oscillator.frequency.setValueAtTime(note.frequency, when);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(spec.volume, when + 0.01);
        gain.gain.linearRampToValueAtTime(0.0001, when + note.seconds);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(when);
        oscillator.stop(when + note.seconds + 0.02);
        when += note.seconds;
      }
    },
  };
}

/** The mute button. It flips the player and updates its own label. */
export function createMuteButton(container: HTMLElement, player: SoundPlayer): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mute";

  const render = (): void => {
    button.textContent = player.muted ? "Sound off" : "Sound on";
    button.setAttribute("aria-pressed", String(player.muted));
  };

  button.addEventListener("click", () => {
    player.setMuted(!player.muted);
    render();
  });

  render();
  container.append(button);
  return button;
}
