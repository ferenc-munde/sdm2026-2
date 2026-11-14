import { describe, expect, it } from "vitest";
import { LOW_FUEL_THRESHOLD } from "../shared/constants.ts";
import { makeState } from "../shared/run/testState.ts";
import type { Hazard, HazardKind, GameState } from "../shared/types.ts";
import { SOUNDS, createSoundPlayer, eventsBetween, type AudioContextLike, type SoundName } from "./sound.ts";

const JOURNEY = { fuel: 100, hull: 100, distance: 0, speedFactor: 1 } as const;

const hazard = (id: string, kind: HazardKind = "fire"): Hazard => ({
  id,
  kind,
  car: 0,
  spotId: `spot-${id}`,
  position: { x: 0, y: 0 },
  age: 0,
  progress: 0,
  countdown: null,
});

function state(change: Partial<GameState> = {}): GameState {
  return makeState({
    ...change,
    journey: { ...JOURNEY, ...(change.journey ?? {}) },
  });
}

describe("eventsBetween", () => {
  it("sounds a hazard when one appears", () => {
    expect(eventsBetween(state(), state({ hazards: { h1: hazard("h1") } }))).toEqual(["hazard"]);
  });

  it("sounds a repair when a hazard disappears", () => {
    expect(eventsBetween(state({ hazards: { h1: hazard("h1") } }), state())).toEqual(["repairDone"]);
  });

  it("handles a repair and a new hazard in the same tick", () => {
    const before = state({ hazards: { h1: hazard("h1") } });
    const after = state({ hazards: { h2: hazard("h2") } });
    expect(eventsBetween(before, after)).toEqual(["hazard", "repairDone"]);
  });

  it("sounds low fuel only when the tank crosses the threshold", () => {
    const at = (fuel: number): GameState => state({ journey: { ...JOURNEY, fuel } });
    expect(eventsBetween(at(30), at(LOW_FUEL_THRESHOLD))).toEqual(["lowFuel"]);
    expect(eventsBetween(at(30), at(24))).toEqual(["lowFuel"]);
    expect(eventsBetween(at(LOW_FUEL_THRESHOLD + 1), at(LOW_FUEL_THRESHOLD + 1))).toEqual([]);
    expect(eventsBetween(at(20), at(19))).toEqual([]);
    expect(eventsBetween(at(10), at(50))).toEqual([]);
  });

  it("sounds the end of the run, replacing other events", () => {
    const hazardState = state({ hazards: { h1: hazard("h1") } });
    expect(eventsBetween(state(), state({ phase: "won" }))).toEqual(["win"]);
    expect(eventsBetween(hazardState, state({ phase: "lost" }))).toEqual(["lose"]);
    expect(eventsBetween(state({ phase: "won" }), state({ phase: "lobby" }))).toEqual([]);
  });

  it("whistles once when the lobby departs (#401)", () => {
    expect(eventsBetween(state({ phase: "lobby" }), state({ phase: "playing" }))).toEqual(["depart"]);
    expect(eventsBetween(state({ phase: "playing" }), state({ phase: "playing" }))).toEqual([]);
  });

  it("stays quiet when nothing changed", () => {
    expect(eventsBetween(state(), state())).toEqual([]);
    expect(eventsBetween(state({ hazards: { h1: hazard("h1") } }), state({ hazards: { h1: hazard("h1") } }))).toEqual(
      [],
    );
  });
});

describe("sound specs", () => {
  it("has a short sound for every event", () => {
    const names: SoundName[] = ["hazard", "repairDone", "lowFuel", "depart", "win", "lose"];
    for (const name of names) {
      const spec = SOUNDS[name];
      expect(spec.notes.length).toBeGreaterThan(0);
      expect(spec.volume).toBeGreaterThan(0);
      expect(spec.volume).toBeLessThanOrEqual(1);
      for (const note of spec.notes) {
        expect(note.frequency).toBeGreaterThan(100);
        expect(note.frequency).toBeLessThan(2000);
        expect(note.seconds).toBeGreaterThan(0);
        expect(note.seconds).toBeLessThan(1);
      }
      const total = spec.notes.reduce((sum, note) => sum + note.seconds, 0);
      expect(total).toBeLessThan(1.5);
    }
  });
});

describe("sound player", () => {
  class FakeParam {
    values: number[] = [];
    setValueAtTime(value: number): void {
      this.values.push(value);
    }
    linearRampToValueAtTime(value: number): void {
      this.values.push(value);
    }
  }

  class FakeOscillator {
    type = "sine";
    frequency = new FakeParam();
    started: number | null = null;
    stopped: number | null = null;
    connect(): void {}
    start(when: number): void {
      this.started = when;
    }
    stop(when: number): void {
      this.stopped = when;
    }
  }

  class FakeGain {
    gain = new FakeParam();
    connect(): void {}
  }

  function fakeContext(): { context: AudioContextLike; oscillators: FakeOscillator[] } {
    const oscillators: FakeOscillator[] = [];
    const context: AudioContextLike = {
      currentTime: 10,
      destination: {},
      state: "running",
      resume: () => Promise.resolve(),
      createOscillator: () => {
        const oscillator = new FakeOscillator();
        oscillators.push(oscillator);
        return oscillator as unknown as ReturnType<AudioContextLike["createOscillator"]>;
      },
      createGain: () => new FakeGain() as unknown as ReturnType<AudioContextLike["createGain"]>,
    };
    return { context, oscillators };
  }

  it("plays one oscillator per note at the right frequency", () => {
    const { context, oscillators } = fakeContext();
    const player = createSoundPlayer(() => context);
    player.play("hazard");

    expect(oscillators).toHaveLength(2);
    expect(oscillators.map((oscillator) => oscillator.frequency.values[0])).toEqual(
      SOUNDS.hazard.notes.map((note) => note.frequency),
    );
    expect(oscillators[0]?.type).toBe("square");
    expect(oscillators[0]?.started).toBe(10);
    expect(oscillators[1]?.started).toBeCloseTo(10.12);
  });

  it("does nothing while muted, and works again after unmuting", () => {
    const { context, oscillators } = fakeContext();
    const player = createSoundPlayer(() => context);

    player.setMuted(true);
    expect(player.muted).toBe(true);
    player.play("win");
    expect(oscillators).toHaveLength(0);

    player.setMuted(false);
    player.play("win");
    expect(oscillators).toHaveLength(SOUNDS.win.notes.length);
  });

  it("creates the context lazily, on the first sound", () => {
    const { context, oscillators } = fakeContext();
    let created = 0;
    const player = createSoundPlayer(() => {
      created += 1;
      return context;
    });

    expect(created).toBe(0);
    player.play("lose");
    expect(created).toBe(1);
    player.play("win");
    expect(created).toBe(1);
    expect(oscillators.length).toBe(SOUNDS.lose.notes.length + SOUNDS.win.notes.length);
  });
});
