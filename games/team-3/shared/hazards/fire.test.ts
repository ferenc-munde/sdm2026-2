import { describe, expect, it } from "vitest";
import { makeItem, makeState } from "../run/testState.ts";
import type { HazardKind, ItemKind } from "../types.ts";

function setup(kind: HazardKind, tool: ItemKind) {
  const state = makeState();
  state.items.tool = makeItem("tool", tool, { heldBy: "p1" });
  state.players.p1!.heldItem = "tool";
  state.hazards.h = { id: "h", kind, car: 0, spotId: "engine", position: { x: 0, y: 0 }, age: 0, progress: 0, countdown: null };
  return state;
}

import { stepFires, speedFactorForHazards } from "./fire.ts";

describe.each([
  ["fire", "extinguisher", 2.5, 1.5],
] as const)("%s repair (#16/#17)", (kind, tool, seconds, rate) => {
  it("requires the full hold duration and keeps the tool", () => {
    const initial = setup(kind, tool);
    let state = initial;
    for (let i = 0; i < seconds * 20 - 1; i++) state = stepFires(state, { p1: true }, 0.05);
    expect(state.hazards.h).toBeDefined();
    state = stepFires(state, { p1: true }, 0.05);
    expect(state.hazards.h).toBeUndefined();
    expect(state.players.p1!.heldItem).toBe("tool");
    expect(state.items.tool!.heldBy).toBe("p1");
    expect(state.journey.hull).toBeCloseTo(100);
    expect(initial.hazards.h!.progress).toBe(0);
  });
  it("resets progress on release, distance or disconnect", () => {
    const halfway = stepFires(setup(kind, tool), { p1: true }, 1);
    expect(stepFires(halfway, {}, 0.05).hazards.h!.progress).toBe(0);
    halfway.players.p1!.position.x = 41;
    expect(stepFires(halfway, { p1: true }, 0.05).hazards.h!.progress).toBe(0);
    halfway.players.p1!.position.x = 0; halfway.players.p1!.connected = false;
    expect(stepFires(halfway, { p1: true }, 0.05).hazards.h!.progress).toBe(0);
  });
  it("rejects the wrong tool and empty hands while continuing hull damage", () => {
    const wrong = setup(kind, "coal");
    const next = stepFires(wrong, { p1: true }, seconds);
    expect(next.hazards.h!.progress).toBe(0);
    expect(next.journey.hull).toBeCloseTo(100);
    wrong.players.p1!.heldItem = null;
    expect(stepFires(wrong, { p1: true }, seconds).hazards.h!.progress).toBe(0);
  });
  it("does not multiply repair speed for multiple players", () => {
    const state = setup(kind, tool);
    state.items.second = makeItem("second", tool, { heldBy: "p2" });
    state.players.p2!.heldItem = "second";
    expect(stepFires(state, { p1: true, p2: true }, 1).hazards.h!.progress).toBeCloseTo(1 / seconds);
  });
  it("ignores paused runs and invalid durations; clamps hull at zero", () => {
    const state = setup(kind, tool);
    for (const dt of [0, -1, NaN, Infinity]) expect(stepFires(state, {}, dt)).toBe(state);
    state.phase = "won";
    expect(stepFires(state, {}, 1)).toBe(state);
    state.phase = "playing";
    expect(stepFires(state, {}, 1000).journey.hull).toBe(100);
  });
});

it("stalls only for engine fires, then restores the fuel-derived speed", () => {
  const state = setup("fire", "extinguisher");
  expect(stepFires(state, {}, 0.05).journey.speedFactor).toBe(0);
  expect(stepFires(state, { p1: true }, 2.5).journey.speedFactor).toBe(1);
  state.journey.fuel = 25;
  expect(stepFires(state, { p1: true }, 2.5).journey.speedFactor).toBe(0.5);
  state.hazards.h!.spotId = "other";
  expect(speedFactorForHazards(state)).toBe(0.5);
  state.journey.fuel = 0;
  expect(speedFactorForHazards(state)).toBe(0);
});

