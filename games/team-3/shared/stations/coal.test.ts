import { describe, expect, it } from "vitest";
import { makeState } from "../run/testState.ts";
import type { Station } from "../types.ts";
import { useCoalStation } from "./coal.ts";

const dispenser: Station = { kind: "coalDispenser", car: 0, position: { x: 0, y: 0 } };
const engine: Station = { ...dispenser, kind: "engine" };

describe("coal stations (#15)", () => {
  it("cannot use a station beside an active fire", () => {
    const burning = makeState();
    burning.players.p1!.position = { ...dispenser.position };
    burning.hazards.fire = {
      id: "fire", kind: "fire", car: dispenser.car, spotId: "near-dispenser",
      position: { ...dispenser.position }, age: 0, progress: 0, countdown: null,
    };
    expect(useCoalStation(burning, "p1", dispenser)).toBe(burning);
    const extinguished = { ...burning, hazards: {} };
    expect(useCoalStation(extinguished, "p1", dispenser)).not.toBe(extinguished);
  });

  it("gives one coal to an empty-handed player without mutating the input", () => {
    const initial = makeState();
    const next = useCoalStation(initial, "p1", dispenser);
    expect(initial.players.p1!.heldItem).toBeNull();
    expect(next.items[next.players.p1!.heldItem!]!.kind).toBe("coal");
    expect(useCoalStation(next, "p1", dispenser)).toBe(next);
  });
  it.each([[20, 55], [90, 100]])("adds 35 fuel capped at 100 (%s)", (fuel, expected) => {
    const state = makeState(); state.journey.fuel = fuel;
    const next = useCoalStation(useCoalStation(state, "p1", dispenser), "p1", engine);
    expect(next.journey.fuel).toBe(expected);
    expect(next.players.p1!.heldItem).toBeNull();
    expect(Object.keys(next.items)).toHaveLength(0);
  });
  it("rejects distant, disconnected and non-playing interactions", () => {
    const state = makeState(); state.players.p1!.position.x = 41;
    expect(useCoalStation(state, "p1", dispenser)).toBe(state);
    state.players.p1!.position.x = 0; state.players.p1!.connected = false;
    expect(useCoalStation(state, "p1", dispenser)).toBe(state);
    state.players.p1!.connected = true; state.phase = "lobby";
    expect(useCoalStation(state, "p1", dispenser)).toBe(state);
  });
  it("allocates distinct coal for simultaneous players", () => {
    const state = useCoalStation(useCoalStation(makeState(), "p1", dispenser), "p2", dispenser);
    expect(state.players.p1!.heldItem).not.toBe(state.players.p2!.heldItem);
  });
});
