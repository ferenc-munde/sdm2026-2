import { describe, expect, it } from "vitest";
import {
  HAZARD_INTERVAL_LATE_SECONDS,
  HAZARD_INTERVAL_SECONDS,
  HAZARD_LATE_PROGRESS,
  TICK_SECONDS,
  WIN_DISTANCE,
} from "../constants.ts";
import type { GameState } from "../types.ts";
import {
  createDirector,
  type DirectorState,
  freeSpots,
  type HazardSpot,
  hazardInterval,
  journeyProgress,
  stepDirector,
} from "./director.ts";
import { createSeededRandom } from "./random.ts";
import { makeState } from "./testState.ts";

const SPOTS: HazardSpot[] = [
  { id: "engine", car: 0, position: { x: 10, y: 5 } },
  { id: "car1-left", car: 1, position: { x: 110, y: 5 } },
  { id: "car1-right", car: 1, position: { x: 150, y: 35 } },
  { id: "car2-left", car: 2, position: { x: 210, y: 5 } },
];

/** Runs the director in fixed ticks for `seconds` and returns where it ended. */
function run(seconds: number, state: GameState, spots: HazardSpot[] = SPOTS, seed = 1, director = createDirector()) {
  const random = createSeededRandom(seed);
  let current: { director: DirectorState; state: GameState } = { director, state };
  const ticks = Math.round(seconds / TICK_SECONDS);
  for (let i = 0; i < ticks; i++) {
    current = stepDirector(current.director, current.state, spots, TICK_SECONDS, random);
  }
  return current;
}

const hazardCount = (state: GameState): number => Object.keys(state.hazards).length;

describe("hazard interval", () => {
  it("is 12 seconds early in the journey", () => {
    expect(hazardInterval(0)).toBe(HAZARD_INTERVAL_SECONDS);
    expect(hazardInterval(HAZARD_LATE_PROGRESS)).toBe(12);
  });

  it("is 7 seconds once more than 65% of the distance is covered", () => {
    expect(hazardInterval(0.66)).toBe(HAZARD_INTERVAL_LATE_SECONDS);
    expect(hazardInterval(1)).toBe(7);
  });

  it("measures progress as distance over the win distance, clamped to 0..1", () => {
    const at = (distance: number) => journeyProgress(makeState({ journey: { ...makeState().journey, distance } }));
    expect(at(0)).toBe(0);
    expect(at(WIN_DISTANCE / 2)).toBe(0.5);
    expect(at(WIN_DISTANCE * 2)).toBe(1);
    expect(at(-5)).toBe(0);
  });
});

describe("hazard director", () => {
  it("starts no hazard before the first interval has passed", () => {
    expect(hazardCount(run(HAZARD_INTERVAL_SECONDS - 0.5, makeState()).state)).toBe(0);
  });

  it("starts a hazard every 12 seconds", () => {
    expect(hazardCount(run(12.1, makeState()).state)).toBe(1);
    expect(hazardCount(run(24.1, makeState()).state)).toBe(2);
    expect(hazardCount(run(36.1, makeState()).state)).toBe(3);
  });

  it("starts a hazard every 7 seconds late in the journey", () => {
    const late = makeState({ journey: { ...makeState().journey, distance: WIN_DISTANCE * 0.8 } });
    const director: DirectorState = { secondsUntilNext: HAZARD_INTERVAL_LATE_SECONDS, spawnedCount: 0 };
    expect(hazardCount(run(7.1, late, SPOTS, 1, director).state)).toBe(1);
    expect(hazardCount(run(14.1, late, SPOTS, 1, director).state)).toBe(2);
    expect(hazardCount(run(21.1, late, SPOTS, 1, director).state)).toBe(3);
  });

  it("creates a new, unrepaired breach or fire on a known spot", () => {
    const { state } = run(12.1, makeState());
    const hazard = Object.values(state.hazards)[0];
    expect(hazard).toBeDefined();
    if (!hazard) return;
    const spot = SPOTS.find((s) => s.id === hazard.spotId);
    expect(spot).toBeDefined();
    expect(["breach", "fire"]).toContain(hazard.kind);
    expect(hazard).toMatchObject({ car: spot?.car, position: spot?.position, age: 0, progress: 0, countdown: null });
    expect(state.hazards[hazard.id]).toBe(hazard);
  });

  it("never starts a hazard on a spot that already has one", () => {
    const { state } = run(200, makeState());
    const spotIds = Object.values(state.hazards).map((hazard) => hazard.spotId);
    expect(spotIds.length).toBe(SPOTS.length);
    expect(new Set(spotIds).size).toBe(SPOTS.length);
  });

  it("waits when every spot is busy and starts one as soon as a spot is free", () => {
    const oneSpot = SPOTS.slice(0, 1);
    const full = run(60, makeState(), oneSpot);
    expect(hazardCount(full.state)).toBe(1);
    expect(full.director.secondsUntilNext).toBe(0);

    const repaired: GameState = { ...full.state, hazards: {} };
    const after = stepDirector(full.director, repaired, oneSpot, TICK_SECONDS, createSeededRandom(5));
    expect(hazardCount(after.state)).toBe(1);
    expect(after.director.secondsUntilNext).toBeCloseTo(HAZARD_INTERVAL_SECONDS - TICK_SECONDS, 5);
  });

  it("gives every hazard of a run a unique id", () => {
    let current = run(12.1, makeState(), SPOTS.slice(0, 1));
    const firstId = Object.keys(current.state.hazards)[0];
    current = { director: current.director, state: { ...current.state, hazards: {} } };
    current = run(12.1, current.state, SPOTS.slice(0, 1), 9, current.director);
    expect(Object.keys(current.state.hazards)[0]).not.toBe(firstId);
  });

  it("does nothing outside the playing phase", () => {
    for (const phase of ["lobby", "won", "lost"] as const) {
      const result = run(60, makeState({ phase }));
      expect(hazardCount(result.state)).toBe(0);
      expect(result.director).toEqual(createDirector());
    }
  });

  it("gives the same run for the same seed, and does not change its inputs", () => {
    const start = makeState();
    const snapshot = structuredClone(start);
    const a = run(100, start, SPOTS, 1234);
    const b = run(100, start, SPOTS, 1234);
    expect(a).toEqual(b);
    expect(start).toEqual(snapshot);
  });

  it("uses the seed to choose spots and kinds", () => {
    const summary = (seed: number) =>
      Object.values(run(200, makeState(), SPOTS, seed).state.hazards)
        .map((h) => `${h.spotId}:${h.kind}`)
        .join(",");
    const results = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(summary));
    expect(results.size).toBeGreaterThan(1);
  });

  it("lists only spots without a hazard as free", () => {
    const { state } = run(12.1, makeState());
    const taken = Object.values(state.hazards)[0]?.spotId;
    const free = freeSpots(SPOTS, state.hazards).map((s) => s.id);
    expect(free).toHaveLength(SPOTS.length - 1);
    expect(free).not.toContain(taken);
  });
});
