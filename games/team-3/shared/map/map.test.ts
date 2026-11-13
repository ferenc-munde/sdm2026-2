import { describe, expect, it } from "vitest";
import { CAR_COUNT, MAX_PLAYERS, PLAYER_RADIUS } from "../constants.ts";
import { freeSpots, type HazardSpot } from "../run/director.ts";
import {
  CAR_LENGTH,
  ENGINE_SPOT_ID,
  REQUIRED_STATIONS,
  carAt,
  createTrainMap,
  insideBox,
  reachableCars,
  validateMap,
  type TrainMap,
} from "./map.ts";

const map = createTrainMap();

describe("train map", () => {
  it("loads without errors", () => {
    expect(validateMap(map)).toEqual([]);
  });

  it("has three cars in a row, the engine car first", () => {
    expect(map.cars.map((car) => car.index)).toEqual([0, 1, 2]);
    expect(map.cars).toHaveLength(CAR_COUNT);
    for (let i = 1; i < map.cars.length; i++) {
      const before = map.cars[i - 1];
      const car = map.cars[i];
      expect(car && before && car.x - before.x).toBeGreaterThan(CAR_LENGTH);
    }
  });

  it("has a door between each pair of neighbouring cars, wide enough for a player", () => {
    expect(map.doors.map((door) => [door.fromCar, door.toCar])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    for (const door of map.doors) expect(door.depth).toBeGreaterThanOrEqual(PLAYER_RADIUS * 2);
  });

  it("lets every car be reached through a door, from any car", () => {
    for (const car of map.cars) {
      expect([...reachableCars(map, car.index)].sort()).toEqual([0, 1, 2]);
    }
  });

  it("has a position for the engine, the coal dispenser, the tools and the steering console", () => {
    for (const kind of REQUIRED_STATIONS) {
      expect(map.stations.filter((station) => station.kind === kind)).toHaveLength(1);
    }
    const carOf = (kind: string) => map.stations.find((station) => station.kind === kind)?.car;
    expect(carOf("engine")).toBe(0);
    expect(carOf("coalDispenser")).toBe(2);
  });

  it("has hazard spots in every car, with unique ids and one on the engine", () => {
    const ids = map.hazardSpots.map((spot) => spot.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const car of map.cars) expect(map.hazardSpots.some((spot) => spot.car === car.index)).toBe(true);

    const engineSpot = map.hazardSpots.find((spot) => spot.id === ENGINE_SPOT_ID);
    const engine = map.stations.find((station) => station.kind === "engine");
    expect(engineSpot?.position).toEqual(engine?.position);
  });

  it("starts the wrench and the extinguisher at their racks", () => {
    const at = (kind: string) => map.itemSpawns.find((item) => item.kind === kind)?.position;
    const rack = (kind: string) => map.stations.find((station) => station.kind === kind)?.position;
    expect(at("wrench")).toEqual(rack("wrenchRack"));
    expect(at("extinguisher")).toEqual(rack("extinguisherRack"));
  });

  it("has a separate start for every seat, none overlapping", () => {
    expect(map.playerSpawns).toHaveLength(MAX_PLAYERS);
    for (let a = 0; a < map.playerSpawns.length; a++) {
      for (let b = a + 1; b < map.playerSpawns.length; b++) {
        const p = map.playerSpawns[a];
        const q = map.playerSpawns[b];
        if (!p || !q) continue;
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(PLAYER_RADIUS * 2);
      }
    }
  });

  it("keeps every wall off the walkable floor of the cars and doors", () => {
    const corners = (box: { x: number; y: number; width: number; depth: number }) =>
      [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: box.x + (sx * box.width) / 2 - sx * 0.01, y: box.y + (sy * box.depth) / 2 - sy * 0.01 })));
    for (const wall of map.walls) {
      for (const corner of corners(wall)) {
        for (const area of [...map.cars, ...map.doors]) expect(insideBox(area, corner, 0.02)).toBe(false);
      }
    }
  });

  it("can be passed to the hazard director", () => {
    const spots: HazardSpot[] = map.hazardSpots;
    expect(freeSpots(spots, {})).toHaveLength(map.hazardSpots.length);
  });

  it("reports the car under a point, and none in a doorway", () => {
    for (const car of map.cars) expect(carAt(map, { x: car.x, y: 0 })).toBe(car.index);
    const door = map.doors[0];
    expect(door && carAt(map, { x: door.x, y: door.y })).toBeNull();
  });
});

describe("validateMap", () => {
  const broken = (change: (copy: TrainMap) => void): string[] => {
    const copy = structuredClone(map);
    change(copy);
    return validateMap(copy);
  };

  it("finds a car that no door reaches", () => {
    expect(broken((m) => (m.doors = m.doors.filter((door) => door.toCar !== 2)))).toContain(
      "car 2 cannot be reached through a door",
    );
  });

  it("finds a missing station", () => {
    expect(broken((m) => (m.stations = m.stations.filter((s) => s.kind !== "coalDispenser")))).toContain(
      "station coalDispenser is missing",
    );
  });

  it("finds a station outside its car", () => {
    expect(
      broken((m) => {
        const engine = m.stations.find((s) => s.kind === "engine");
        if (engine) engine.position = { x: engine.position.x, y: 500 };
      }),
    ).toContain("station engine is not inside car 0");
  });

  it("finds duplicate hazard spot ids and a missing engine spot", () => {
    const problems = broken((m) => {
      for (const spot of m.hazardSpots) spot.id = "same";
    });
    expect(problems).toContain("hazard spot same is listed twice");
    expect(problems).toContain(`hazard spot ${ENGINE_SPOT_ID} is missing`);
  });

  it("finds a door that is too narrow or skips a car", () => {
    const problems = broken((m) => {
      m.doors.push({ x: 0, y: 0, width: 24, depth: 10, fromCar: 0, toCar: 2 });
    });
    expect(problems).toContain("door 0-2 does not join neighbouring cars");
    expect(problems).toContain("door 0-2 is too narrow for a player");
  });

  it("finds a player start outside the train", () => {
    expect(broken((m) => m.playerSpawns.push({ x: -1000, y: 0 }))).toContain("player start 4 is not inside a car");
  });
});
