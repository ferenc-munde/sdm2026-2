import { describe, expect, it } from "vitest";
import { createTrainMap } from "../map/map.ts";
import { makeState } from "../run/testState.ts";
import type { Hazard, Player } from "../types.ts";
import { stationStatus } from "./status.ts";

const map = createTrainMap();
const engine = map.stations.find((station) => station.kind === "engine")!;
const player = (position = engine.position): Player => ({
  id: "p1", name: "Ada", position, facing: { dx: 0, dy: 1 }, heldItem: null, connected: true,
});
const fire: Hazard = {
  id: "fire-1", kind: "fire", car: engine.car, spotId: "engine", position: engine.position,
  age: 1, progress: 0, countdown: null,
};

describe("stationStatus", () => {
  it("marks an unattended station usable", () => {
    expect(stationStatus(makeState(), map).engine).toBe("usable");
  });

  it("marks a station in use when a connected player is beside it", () => {
    expect(stationStatus(makeState({ players: { p1: player() } }), map).engine).toBe("inUse");
  });

  it("gives a nearby fire priority over in-use feedback", () => {
    const state = makeState({ players: { p1: player() }, hazards: { [fire.id]: fire } });
    expect(stationStatus(state, map).engine).toBe("disabledByFire");
  });
});
