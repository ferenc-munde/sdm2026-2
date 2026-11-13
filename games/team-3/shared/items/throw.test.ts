import { describe, expect, it } from "vitest";
import { ITEM_RADIUS, THROW_SPEED } from "../constants.ts";
import { carAt, carCentreX, createTrainMap, type TrainMap } from "../map/map.ts";
import { circleOverlapsBox } from "../movement/movement.ts";
import { makeItem, makePlayer, makeState } from "../run/testState.ts";
import type { Direction, GameState, Vec2 } from "../types.ts";
import { pickUp } from "./items.ts";
import { createThrowSystem, isFlying, stepThrownItems, throwDistance, throwItem } from "./throw.ts";

const map = createTrainMap();
const TICK = 1 / 20;
const MIDDLE: Vec2 = { x: carCentreX(1), y: 0 };

/** p1 holds coal at `at`, facing `facing`; p2 stands elsewhere in the same car. */
const holding = (at: Vec2, facing: Direction, p2At: Vec2 = { x: carCentreX(1) + 150, y: -60 }): GameState =>
  makeState({
    players: {
      p1: makePlayer("p1", { position: { ...at }, facing, heldItem: "coal" }),
      p2: makePlayer("p2", { position: { ...p2At } }),
    },
    items: { coal: makeItem("coal", "coal", { heldBy: "p1", position: { ...at } }) },
  });

/** Runs the flight in room ticks until the item lands (or `max` seconds pass). */
const fly = (state: GameState, max = 5, m: TrainMap = map): GameState => {
  let s = state;
  for (let t = 0; t < max / TICK && Object.values(s.items).some(isFlying); t++) s = stepThrownItems(s, TICK, m);
  return s;
};

describe("throwing", () => {
  it("leaves the player's hands empty and sends the item off at THROW_SPEED in the facing direction", () => {
    const s = throwItem(holding(MIDDLE, { dx: 1, dy: 0 }), "p1");
    expect(s.players.p1?.heldItem).toBeNull();
    expect(s.items.coal?.heldBy).toBeNull();
    expect(s.items.coal?.velocity).toEqual({ x: THROW_SPEED, y: 0 });
  });

  it("does nothing with empty hands, when disconnected, or outside a run", () => {
    const empty = makeState({ players: { p1: makePlayer("p1") } });
    expect(throwItem(empty, "p1")).toBe(empty);
    const s = holding(MIDDLE, { dx: 1, dy: 0 });
    const offline = { ...s, players: { ...s.players, p1: { ...s.players.p1!, connected: false } } };
    expect(throwItem(offline, "p1")).toBe(offline);
    const lobby = { ...s, phase: "lobby" as const };
    expect(throwItem(lobby, "p1")).toBe(lobby);
  });
});

describe("a thrown item travels in the facing direction and slows to a stop", () => {
  it("flies the throw distance on open floor, then stops", () => {
    const start = { x: carCentreX(1) - 120, y: 0 };
    const landed = fly(throwItem(holding(start, { dx: 1, dy: 0 }), "p1"));
    expect(landed.items.coal?.velocity).toEqual({ x: 0, y: 0 });
    expect(landed.items.coal!.position.x - start.x).toBeCloseTo(throwDistance(), 0);
    expect(landed.items.coal!.position.y).toBe(0);
  });

  it("goes the way the player faces, at the same distance diagonally", () => {
    for (const facing of [{ dx: -1, dy: 0 }, { dx: 1, dy: 1 }, { dx: -1, dy: -1 }] as Direction[]) {
      const start = { x: carCentreX(1), y: 0 };
      const end = fly(throwItem(holding(start, facing), "p1")).items.coal!.position;
      expect(Math.sign(end.x - start.x)).toBe(facing.dx);
      expect(Math.sign(end.y - start.y)).toBe(facing.dy);
    }
    // Straight across open floor: the full throw distance.
    const start = { x: carCentreX(1) + 100, y: 0 };
    const back = fly(throwItem(holding(start, { dx: -1, dy: 0 }), "p1")).items.coal!.position;
    expect(start.x - back.x).toBeCloseTo(throwDistance(), 0);
  });

  it("slows down every tick", () => {
    let s = throwItem(holding(MIDDLE, { dx: 1, dy: 0 }), "p1");
    let previous = THROW_SPEED;
    for (let t = 0; t < 10; t++) {
      s = stepThrownItems(s, TICK, map);
      const speed = Math.hypot(s.items.coal!.velocity.x, s.items.coal!.velocity.y);
      expect(speed).toBeLessThan(previous);
      previous = speed;
    }
  });

  it("stops at a wall instead of passing through it", () => {
    const nearWall = { x: carCentreX(1), y: 60 };
    const landed = fly(throwItem(holding(nearWall, { dx: 0, dy: 1 }), "p1")).items.coal!;
    expect(landed.velocity).toEqual({ x: 0, y: 0 });
    expect(map.walls.some((w) => circleOverlapsBox(landed.position, ITEM_RADIUS, w))).toBe(false);
    expect(carAt(map, landed.position)).toBe(1);
  });

  it("crosses the gap between cars when thrown through a door", () => {
    const nearDoor = { x: carCentreX(0) + 150, y: 0 };
    const landed = fly(throwItem(holding(nearDoor, { dx: 1, dy: 0 }), "p1")).items.coal!;
    expect(carAt(map, landed.position)).toBe(1);
  });

  it("does not move items lying on the floor or held in hands", () => {
    const s = holding(MIDDLE, { dx: 1, dy: 0 });
    expect(stepThrownItems(s, TICK, map)).toBe(s);
  });
});

describe("another player can pick it up after it lands", () => {
  it("cannot be caught mid-air, then is free once it lands", () => {
    const start = { x: carCentreX(1) - 120, y: 0 };
    // p2 stands in the flight path, right where the item is after one tick: in reach.
    const inPath = { x: start.x + 25, y: 10 };
    let s = throwItem(holding(start, { dx: 1, dy: 0 }, inPath), "p1");
    s = stepThrownItems(s, TICK, map);
    expect(Math.hypot(s.items.coal!.position.x - inPath.x, s.items.coal!.position.y - inPath.y)).toBeLessThan(40);
    expect(pickUp(s, "p2").players.p2?.heldItem).toBeNull(); // in reach, but still flying
    s = fly(s);
    // After it lands, p2 walks over and picks it up.
    const landedAt = s.items.coal!.position;
    s = { ...s, players: { ...s.players, p2: { ...s.players.p2!, position: { x: landedAt.x - 10, y: landedAt.y } } } };
    expect(pickUp(s, "p2").players.p2?.heldItem).toBe("coal");
  });

  it("plugs into the session as a rule system", () => {
    const system = createThrowSystem(map);
    const s = throwItem(holding(MIDDLE, { dx: 1, dy: 0 }), "p1");
    const next = system(s, TICK, { inputs: {}, random: { next: () => 0.5 } });
    expect(next.items.coal!.position.x).toBeGreaterThan(MIDDLE.x);
  });

  it("never changes its input", () => {
    const s = throwItem(holding(MIDDLE, { dx: 1, dy: 0 }), "p1");
    const before = structuredClone(s);
    fly(s);
    expect(s).toEqual(before);
  });
});
