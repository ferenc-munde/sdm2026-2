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

import { stepBreaches } from "./breach.ts";

describe.each([
  ["breach", "wrench", 3, 2.5],
] as const)("%s repair (#16/#17)", (kind, tool, seconds, rate) => {
  it("requires the full hold duration and keeps the tool", () => {
    const initial = setup(kind, tool);
    let state = initial;
    for (let i = 0; i < seconds * 20 - 1; i++) state = stepBreaches(state, { p1: true }, 0.05);
    expect(state.hazards.h).toBeDefined();
    state = stepBreaches(state, { p1: true }, 0.05);
    expect(state.hazards.h).toBeUndefined();
    expect(state.players.p1!.heldItem).toBe("tool");
    expect(state.items.tool!.heldBy).toBe("p1");
    expect(state.journey.hull).toBeCloseTo(100 - seconds * rate);
    expect(initial.hazards.h!.progress).toBe(0);
  });
  it("resets progress on release, distance or disconnect", () => {
    const halfway = stepBreaches(setup(kind, tool), { p1: true }, 1);
    expect(stepBreaches(halfway, {}, 0.05).hazards.h!.progress).toBe(0);
    halfway.players.p1!.position.x = 41;
    expect(stepBreaches(halfway, { p1: true }, 0.05).hazards.h!.progress).toBe(0);
    halfway.players.p1!.position.x = 0; halfway.players.p1!.connected = false;
    expect(stepBreaches(halfway, { p1: true }, 0.05).hazards.h!.progress).toBe(0);
  });
  it("rejects the wrong tool and empty hands while continuing hull damage", () => {
    const wrong = setup(kind, "coal");
    const next = stepBreaches(wrong, { p1: true }, seconds);
    expect(next.hazards.h!.progress).toBe(0);
    expect(next.journey.hull).toBeCloseTo(100 - seconds * rate);
    wrong.players.p1!.heldItem = null;
    expect(stepBreaches(wrong, { p1: true }, seconds).hazards.h!.progress).toBe(0);
  });
  it("does not multiply repair speed for multiple players", () => {
    const state = setup(kind, tool);
    state.items.second = makeItem("second", tool, { heldBy: "p2" });
    state.players.p2!.heldItem = "second";
    expect(stepBreaches(state, { p1: true, p2: true }, 1).hazards.h!.progress).toBeCloseTo(1 / seconds);
  });
  it("ignores paused runs and invalid durations; clamps hull at zero", () => {
    const state = setup(kind, tool);
    for (const dt of [0, -1, NaN, Infinity]) expect(stepBreaches(state, {}, dt)).toBe(state);
    state.phase = "won";
    expect(stepBreaches(state, {}, 1)).toBe(state);
    state.phase = "playing";
    expect(stepBreaches(state, {}, 1000).journey.hull).toBe(0);
  });
});
