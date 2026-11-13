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
  crewSize,
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

const manySpots: HazardSpot[] = Array.from({ length: 12 }, (_, i) => ({
  id: `spot-${i}`,
  car: i % 3,
  position: { x: i * 20, y: 5 },
}));

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

/** A crew of two: one hazard every 14 seconds, about every 8.17 seconds late in the journey. */
const pairState = (overrides: Partial<GameState> = {}): GameState => makeState(overrides, ["p1", "p2"]);
const PAIR_INTERVAL = 14;
const PAIR_LATE_INTERVAL = (14 * 7) / 12;
const crewOf = (count: number): GameState =>
  makeState(
    {},
    Array.from({ length: count }, (_, i) => `p${i + 1}`),
  );

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

describe("difficulty scaling", () => {
  it("gives a bigger crew hazards more often", () => {
    expect(hazardInterval(0, 2)).toBe(14);
    expect(hazardInterval(0, 3)).toBe(11);
    expect(hazardInterval(0, 4)).toBe(9);
    expect(hazardInterval(0, 2)).toBeGreaterThan(hazardInterval(0, 3));
    expect(hazardInterval(0, 3)).toBeGreaterThan(hazardInterval(0, 4));
  });

  it("uses the plan's base interval when no crew size is given", () => {
    expect(hazardInterval(0)).toBe(HAZARD_INTERVAL_SECONDS);
    expect(createDirector().secondsUntilNext).toBe(HAZARD_INTERVAL_SECONDS);
  });

  it("never makes the game harder when the crew shrinks", () => {
    // A crew of two that drops to one connected player keeps the two-player rate.
    expect(hazardInterval(0, 1)).toBe(hazardInterval(0, 2));
    expect(hazardInterval(0, 0)).toBe(hazardInterval(0, 2));
    for (const count of [1, 2, 3]) {
      expect(hazardInterval(0, count)).toBeGreaterThanOrEqual(hazardInterval(0, count + 1));
      expect(hazardInterval(0.9, count)).toBeGreaterThanOrEqual(hazardInterval(0.9, count + 1));
    }
  });

  it("uses the four-player rate for anything above four", () => {
    expect(hazardInterval(0, 7)).toBe(hazardInterval(0, 4));
  });

  it("keeps the two-player rate in a run where one of two players drops out", () => {
    const pair = pairState();
    const p2 = pair.players.p2;
    if (!p2) throw new Error("missing player");
    const alone: GameState = { ...pair, players: { ...pair.players, p2: { ...p2, connected: false } } };
    expect(crewSize(alone)).toBe(1);
    const after = (seconds: number) => hazardCount(run(seconds, alone, SPOTS, 1, createDirector(2)).state);
    expect(after(PAIR_INTERVAL + 0.1)).toBe(1);
    expect(after(2 * PAIR_INTERVAL - 0.5)).toBe(1);
    expect(after(2 * PAIR_INTERVAL + 0.1)).toBe(2);
  });

  it("shrinks every crew's interval by the same ratio late in the journey", () => {
    for (const count of [2, 3, 4]) {
      expect(hazardInterval(0.9, count)).toBeCloseTo((hazardInterval(0, count) * 7) / 12, 10);
      expect(hazardInterval(0.9, count)).toBeLessThan(hazardInterval(0, count));
    }
  });

  it("counts only connected players as crew", () => {
    const state = crewOf(4);
    const p4 = state.players.p4;
    if (!p4) throw new Error("missing player");
    const dropped: GameState = { ...state, players: { ...state.players, p4: { ...p4, connected: false } } };
    expect(crewSize(state)).toBe(4);
    expect(crewSize(dropped)).toBe(3);
  });

  it("starts the first hazard after the crew's own interval", () => {
    expect(createDirector(2).secondsUntilNext).toBe(14);
    expect(createDirector(4).secondsUntilNext).toBe(9);
    expect(createDirector().secondsUntilNext).toBe(HAZARD_INTERVAL_SECONDS);
  });

  it("starts more hazards for four players than for two over the same time", () => {
    const after = (count: number) => hazardCount(run(60, crewOf(count), manySpots, 1, createDirector(count)).state);
    expect(after(2)).toBe(4);
    expect(after(3)).toBe(5);
    expect(after(4)).toBe(6);
  });
});

describe("hazard director", () => {
  it("starts no hazard before the first interval has passed", () => {
    expect(hazardCount(run(PAIR_INTERVAL - 0.5, pairState(), SPOTS, 1, createDirector(2)).state)).toBe(0);
  });

  it("starts a hazard every interval of the crew (14 seconds for two players)", () => {
    const after = (seconds: number) => hazardCount(run(seconds, pairState(), SPOTS, 1, createDirector(2)).state);
    expect(after(PAIR_INTERVAL + 0.1)).toBe(1);
    expect(after(2 * PAIR_INTERVAL + 0.1)).toBe(2);
    expect(after(3 * PAIR_INTERVAL + 0.1)).toBe(3);
  });

  it("starts hazards faster late in the journey (ratio 7 / 12)", () => {
    const late = pairState({ journey: { ...makeState().journey, distance: WIN_DISTANCE * 0.8 } });
    const director: DirectorState = { secondsUntilNext: PAIR_LATE_INTERVAL, spawnedCount: 0 };
    const after = (seconds: number) => hazardCount(run(seconds, late, SPOTS, 1, director).state);
    expect(after(PAIR_LATE_INTERVAL + 0.1)).toBe(1);
    expect(after(2 * PAIR_LATE_INTERVAL + 0.1)).toBe(2);
    expect(after(3 * PAIR_LATE_INTERVAL + 0.1)).toBe(3);
  });

  it("creates a new, unrepaired breach or fire on a known spot", () => {
    const { state } = run(14.1, pairState());
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
    const full = run(60, pairState(), oneSpot);
    expect(hazardCount(full.state)).toBe(1);
    expect(full.director.secondsUntilNext).toBe(0);

    const repaired: GameState = { ...full.state, hazards: {} };
    const after = stepDirector(full.director, repaired, oneSpot, TICK_SECONDS, createSeededRandom(5));
    expect(hazardCount(after.state)).toBe(1);
    expect(after.director.secondsUntilNext).toBeCloseTo(PAIR_INTERVAL - TICK_SECONDS, 5);
  });

  it("gives every hazard of a run a unique id", () => {
    let current = run(14.1, pairState(), SPOTS.slice(0, 1));
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
    const { state } = run(14.1, pairState());
    const taken = Object.values(state.hazards)[0]?.spotId;
    const free = freeSpots(SPOTS, state.hazards).map((s) => s.id);
    expect(free).toHaveLength(SPOTS.length - 1);
    expect(free).not.toContain(taken);
  });
});
