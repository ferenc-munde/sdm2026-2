import { describe, expect, it } from "vitest";
import {
  FUEL_DRAIN_PER_SECOND,
  FUEL_START,
  HULL_START,
  LOW_FUEL_THRESHOLD,
  TRAIN_FULL_SPEED,
  WIN_DISTANCE,
} from "../constants.ts";
import { ENGINE_SPOT_ID, createTrainMap } from "../map/map.ts";
import { createSeededRandom } from "../run/random.ts";
import { createSession, joinSession, startSession, stepSession, type GameSession } from "../run/session.ts";
import { makeState } from "../run/testState.ts";
import type { GameState, Hazard, HazardKind, Journey } from "../types.ts";
import { hullLossPerSecond, isEngineOnFire, journeySystem, speedFactorFor, stepJourney } from "./journey.ts";

const TICK = 1 / 20;

const hazard = (id: string, kind: HazardKind, spotId = `spot-${id}`): Hazard => ({
  id,
  kind,
  car: 1,
  spotId,
  position: { x: 0, y: 0 },
  age: 0,
  progress: 0,
  countdown: null,
});

const withJourney = (journey: Partial<Journey>, hazards: Hazard[] = []): GameState => {
  const base = makeState();
  return {
    ...base,
    journey: { ...base.journey, ...journey },
    hazards: Object.fromEntries(hazards.map((h) => [h.id, h])),
  };
};

/** Runs the journey in ticks of 1/20 s for `seconds`. */
const run = (state: GameState, seconds: number): GameState => {
  let next = state;
  for (let t = 0; t < Math.round(seconds / TICK); t++) next = stepJourney(next, TICK);
  return next;
};

describe("fuel", () => {
  it("drains 1.8 per second", () => {
    expect(run(withJourney({ fuel: 100 }), 1).journey.fuel).toBeCloseTo(100 - FUEL_DRAIN_PER_SECOND);
    expect(run(withJourney({ fuel: 100 }), 10).journey.fuel).toBeCloseTo(100 - 18);
  });

  it("never goes below 0", () => {
    expect(run(withJourney({ fuel: 1 }), 5).journey.fuel).toBe(0);
    expect(stepJourney(withJourney({ fuel: 0.5 }), 60).journey.fuel).toBe(0);
  });

  it("runs dry about 55 seconds after a full tank", () => {
    expect(run(withJourney({ fuel: FUEL_START }), 55).journey.fuel).toBeGreaterThan(0);
    expect(run(withJourney({ fuel: FUEL_START }), 56).journey.fuel).toBe(0);
  });
});

describe("speed factor", () => {
  it("is 1.0 above 25 fuel, 0.5 at 25 or below, and 0 when empty", () => {
    expect(speedFactorFor(100, false)).toBe(1);
    expect(speedFactorFor(25.01, false)).toBe(1);
    expect(speedFactorFor(LOW_FUEL_THRESHOLD, false)).toBe(0.5);
    expect(speedFactorFor(10, false)).toBe(0.5);
    expect(speedFactorFor(0, false)).toBe(0);
  });

  it("is 0 while the engine is on fire, whatever the fuel", () => {
    expect(speedFactorFor(100, true)).toBe(0);
  });

  it("only counts a fire on the engine spot as an engine fire", () => {
    expect(isEngineOnFire({ f: hazard("f", "fire", ENGINE_SPOT_ID) })).toBe(true);
    expect(isEngineOnFire({ f: hazard("f", "fire", "car1-a") })).toBe(false);
    expect(isEngineOnFire({ b: hazard("b", "breach", ENGINE_SPOT_ID) })).toBe(false);
  });

  it("follows the fuel level from step to step", () => {
    const low = run(withJourney({ fuel: LOW_FUEL_THRESHOLD + 1 }), 1);
    expect(low.journey.speedFactor).toBe(0.5);
    const empty = run(withJourney({ fuel: 0.5 }), 1);
    expect(empty.journey.speedFactor).toBe(0);
  });
});

describe("distance", () => {
  it("grows at full speed, half speed, or not at all", () => {
    expect(run(withJourney({ fuel: 100, distance: 0 }), 10).journey.distance).toBeCloseTo(10 * TRAIN_FULL_SPEED);
    expect(run(withJourney({ fuel: 20, distance: 0 }), 4).journey.distance).toBeCloseTo(4 * TRAIN_FULL_SPEED * 0.5);
    const burning = withJourney({ fuel: 100, distance: 50 }, [hazard("f", "fire", ENGINE_SPOT_ID)]);
    expect(run(burning, 5).journey.distance).toBe(50);
  });

  it("stops at the destination", () => {
    expect(stepJourney(withJourney({ distance: WIN_DISTANCE - 1 }), 10).journey.distance).toBe(WIN_DISTANCE);
  });
});

describe("hull", () => {
  it("loses 2.5 per second per breach and 1.5 per second per fire", () => {
    expect(run(withJourney({ hull: 100 }, [hazard("b", "breach")]), 2).journey.hull).toBeCloseTo(95);
    expect(run(withJourney({ hull: 100 }, [hazard("f", "fire")]), 2).journey.hull).toBeCloseTo(97);
    const both = withJourney({ hull: 100 }, [hazard("b1", "breach"), hazard("b2", "breach"), hazard("f", "fire")]);
    expect(hullLossPerSecond(both.hazards)).toBeCloseTo(2 * 2.5 + 1.5);
    expect(run(both, 2).journey.hull).toBeCloseTo(100 - 2 * 6.5);
  });

  it("does not drop without hazards, or from the course hazard", () => {
    expect(run(withJourney({ hull: 80 }), 5).journey.hull).toBe(80);
    expect(run(withJourney({ hull: 80 }, [hazard("c", "course")]), 5).journey.hull).toBe(80);
  });

  it("never goes below 0", () => {
    expect(stepJourney(withJourney({ hull: 1 }, [hazard("b", "breach")]), 10).journey.hull).toBe(0);
  });
});

describe("outside a run", () => {
  it("changes nothing in the lobby or after the run has ended", () => {
    for (const phase of ["lobby", "won", "lost"] as const) {
      const state = { ...withJourney({ fuel: 50 }, [hazard("b", "breach")]), phase };
      expect(stepJourney(state, 1)).toBe(state);
    }
  });

  it("never changes its input", () => {
    const state = withJourney({ fuel: 50, hull: 50 }, [hazard("b", "breach")]);
    const before = structuredClone(state);
    stepJourney(state, 1);
    expect(state).toEqual(before);
  });
});

describe("win and lose in a real session", () => {
  const map = createTrainMap();
  const ok = (r: { ok: boolean; session: GameSession }): GameSession => r.session;
  const started = (journey: Partial<Journey> = {}, hazards: Hazard[] = []): GameSession => {
    let s = createSession("TEST");
    s = ok(joinSession(s, "p1", "Ada", map.playerSpawns[0]));
    s = ok(joinSession(s, "p2", "Bo", map.playerSpawns[1]));
    s = ok(startSession(s));
    return {
      ...s,
      state: {
        ...s.state,
        journey: { ...s.state.journey, ...journey },
        hazards: Object.fromEntries(hazards.map((h) => [h.id, h])),
      },
    };
  };
  const play = (session: GameSession, seconds: number, spots = map.hazardSpots): GameSession => {
    const context = { spots, random: createSeededRandom(3), systems: [journeySystem] };
    let s = session;
    for (let t = 0; t < Math.round(seconds / TICK); t++) s = stepSession(s, TICK, context);
    return s;
  };

  it("wins when the train reaches 1800 distance", () => {
    const end = play(started({ fuel: 100, distance: WIN_DISTANCE - 20 }), 3, []);
    expect(end.state.journey.distance).toBe(WIN_DISTANCE);
    expect(end.state.phase).toBe("won");
  });

  it("loses when the hull reaches 0", () => {
    const end = play(started({ hull: 4 }, [hazard("b", "breach")]), 3, []);
    expect(end.state.journey.hull).toBe(0);
    expect(end.state.phase).toBe("lost");
  });

  it("freezes the journey once the run has ended", () => {
    const won = play(started({ distance: WIN_DISTANCE - 5 }), 1, []);
    const later = play(won, 5, []);
    expect(later.state.journey).toEqual(won.state.journey);
  });

  it("starts a run from full fuel and hull, and wears it down as hazards appear", () => {
    const s = started();
    expect(s.state.journey).toMatchObject({ fuel: FUEL_START, hull: HULL_START, distance: 0 });
    // 30 s with two players: fuel 100 - 54 = 46 (full speed), and hazards start from 14 s.
    // The engine spot is left out so a random engine fire cannot stall the train here.
    const later = play(s, 30, map.hazardSpots.filter((spot) => spot.id !== ENGINE_SPOT_ID));
    expect(later.state.phase).toBe("playing");
    expect(later.state.journey.fuel).toBeCloseTo(FUEL_START - 30 * FUEL_DRAIN_PER_SECOND);
    expect(later.state.journey.distance).toBeCloseTo(30 * TRAIN_FULL_SPEED, 0);
    expect(Object.keys(later.state.hazards).length).toBeGreaterThan(0);
    expect(later.state.journey.hull).toBeLessThan(HULL_START);
  });

  it("is lost within about a minute if nobody repairs anything", () => {
    const end = play(started(), 90);
    expect(end.state.phase).toBe("lost");
    expect(end.state.time).toBeLessThan(70);
  });
});
