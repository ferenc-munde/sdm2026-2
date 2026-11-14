import { describe, expect, it } from "vitest";
import { HULL_MAX } from "../constants.ts";
import type { Hazard } from "../types.ts";
import { HULL_RECOVERY_PER_SECOND, hullRecoverySystem } from "./hullRecovery.ts";
import { makeState } from "./testState.ts";

const frame = { inputs: {} } as never;
const hazard = (kind: Hazard["kind"]): Hazard => ({
  id: `${kind}-1`, kind, car: 0, spotId: "s", position: { x: 0, y: 0 }, age: 1, progress: 0,
  countdown: kind === "course" ? 3 : null,
});
const playing = (hull: number, hazards: Hazard[] = []) =>
  makeState({
    phase: "playing",
    journey: { fuel: 100, hull, distance: 0, speedFactor: 1 },
    hazards: Object.fromEntries(hazards.map((h) => [h.id, h])),
  });

describe("hull recovery", () => {
  it("climbs while no breach or fire is open", () => {
    expect(hullRecoverySystem(playing(50), 2, frame).journey.hull).toBeCloseTo(50 + 2 * HULL_RECOVERY_PER_SECOND);
  });

  it("does not climb while a breach or a fire is open", () => {
    for (const kind of ["breach", "fire"] as const) {
      expect(hullRecoverySystem(playing(50, [hazard(kind)]), 2, frame).journey.hull).toBe(50);
    }
  });

  it("still climbs during a sharp-curve warning", () => {
    expect(hullRecoverySystem(playing(50, [hazard("course")]), 1, frame).journey.hull).toBeGreaterThan(50);
  });

  it("stops at the maximum, never revives a broken hull, and only runs during a run", () => {
    expect(hullRecoverySystem(playing(HULL_MAX - 0.2), 5, frame).journey.hull).toBe(HULL_MAX);
    expect(hullRecoverySystem(playing(0), 5, frame).journey.hull).toBe(0);
    const lobby = { ...playing(50), phase: "lobby" as const };
    expect(hullRecoverySystem(lobby, 5, frame).journey.hull).toBe(50);
  });
});
