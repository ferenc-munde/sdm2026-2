import { describe, expect, it } from "vitest";
import { INTERACT_RANGE } from "../constants.ts";
import { createTrainMap } from "../map/map.ts";
import { movePosition } from "../movement/movement.ts";
import { makeItem, makePlayer, makeState } from "../run/testState.ts";
import type { GameState, Vec2 } from "../types.ts";
import { createStartItems, drop, holderOf, nearestFreeItem, pickUp, pickUpOrDrop, resolvePickUpOrDrop } from "./items.ts";

const map = createTrainMap();
const at = (x: number, y: number): Vec2 => ({ x, y });

/** Two players standing at the origin with a wrench and an extinguisher in reach. */
const scene = (): GameState =>
  makeState({
    players: { p1: makePlayer("p1", { position: at(0, 0) }), p2: makePlayer("p2", { position: at(0, 0) }) },
    items: {
      wrench: makeItem("wrench", "wrench", { position: at(10, 0) }),
      extinguisher: makeItem("extinguisher", "extinguisher", { position: at(20, 0) }),
    },
  });

describe("start items", () => {
  it("puts the wrench and the extinguisher at their racks", () => {
    const items = createStartItems(map);
    const rack = (kind: string) => map.stations.find((s) => s.kind === kind)?.position;
    expect(Object.keys(items).sort()).toEqual(["extinguisher", "wrench"]);
    expect(items.wrench?.position).toEqual(rack("wrenchRack"));
    expect(items.extinguisher?.position).toEqual(rack("extinguisherRack"));
    expect(Object.values(items).every((item) => item.heldBy === null)).toBe(true);
  });
});

describe("picking up", () => {
  it("takes the nearest free item in reach", () => {
    const next = pickUp(scene(), "p1");
    expect(next.players.p1?.heldItem).toBe("wrench");
    expect(holderOf(next, "wrench")).toBe("p1");
  });

  it("does nothing when no item is within reach", () => {
    const far = { ...scene(), players: { p1: makePlayer("p1", { position: at(500, 0) }) } };
    expect(pickUp(far, "p1")).toBe(far);
    // Exactly INTERACT_RANGE from the wrench (at x 10); the extinguisher (at x 20) is out of reach.
    const edge = { ...scene(), players: { p1: makePlayer("p1", { position: at(10 - INTERACT_RANGE, 0) }) } };
    expect(pickUp(edge, "p1").players.p1?.heldItem).toBe("wrench");
  });

  it("works with coal as well as the tools", () => {
    const state = makeState({
      players: { p1: makePlayer("p1", { position: at(0, 0) }) },
      items: { "coal-1": makeItem("coal-1", "coal", { position: at(5, 5) }) },
    });
    expect(pickUp(state, "p1").players.p1?.heldItem).toBe("coal-1");
  });

  it("is refused for disconnected players and outside a run", () => {
    const state = scene();
    const offline = { ...state, players: { ...state.players, p1: makePlayer("p1", { connected: false }) } };
    expect(pickUp(offline, "p1")).toBe(offline);
    for (const phase of ["lobby", "won", "lost"] as const) {
      const notPlaying = { ...state, phase };
      expect(pickUp(notPlaying, "p1")).toBe(notPlaying);
    }
  });

  it("picks between items at the same distance by id, not by storage order", () => {
    const a = makeState({
      players: { p1: makePlayer("p1", { position: at(0, 0) }) },
      items: { wrench: makeItem("wrench", "wrench", { position: at(10, 0) }), extinguisher: makeItem("extinguisher", "extinguisher", { position: at(-10, 0) }) },
    });
    const b = { ...a, items: { extinguisher: a.items.extinguisher!, wrench: a.items.wrench! } };
    expect(nearestFreeItem(a, at(0, 0))?.id).toBe("extinguisher");
    expect(nearestFreeItem(b, at(0, 0))?.id).toBe("extinguisher");
  });
});

describe("one item per player", () => {
  it("holds at most one item: a second pick-up does nothing", () => {
    const holding = pickUp(scene(), "p1");
    expect(pickUp(holding, "p1")).toBe(holding);
    expect(holding.players.p1?.heldItem).toBe("wrench");
    expect(holderOf(holding, "extinguisher")).toBeNull();
  });

  it("pickUpOrDrop drops instead of taking a second item", () => {
    const holding = pickUpOrDrop(scene(), "p1");
    const after = pickUpOrDrop(holding, "p1");
    expect(after.players.p1?.heldItem).toBeNull();
    expect(Object.values(after.items).filter((item) => item.heldBy === "p1")).toHaveLength(0);
  });

  it("never lets anyone hold more than one item, whatever the order of requests", () => {
    let state = scene();
    for (const id of ["p1", "p1", "p2", "p1", "p2", "p2", "p1"]) {
      state = pickUpOrDrop(state, id);
      for (const player of Object.values(state.players)) {
        const held = Object.values(state.items).filter((item) => item.heldBy === player.id);
        expect(held.length).toBeLessThanOrEqual(1);
        expect(player.heldItem).toBe(held[0]?.id ?? null);
      }
    }
  });
});

describe("two players grab the same item", () => {
  /** Only the wrench is in reach of both. */
  const contested = (): GameState =>
    makeState({
      players: { p1: makePlayer("p1", { position: at(-20, 0) }), p2: makePlayer("p2", { position: at(20, 0) }) },
      items: { wrench: makeItem("wrench", "wrench", { position: at(0, 0) }) },
    });

  it("gives it to the first request only", () => {
    const next = resolvePickUpOrDrop(contested(), ["p1", "p2"]);
    expect(holderOf(next, "wrench")).toBe("p1");
    expect(next.players.p1?.heldItem).toBe("wrench");
    expect(next.players.p2?.heldItem).toBeNull();
  });

  it("gives it to the other player when their request came first", () => {
    const next = resolvePickUpOrDrop(contested(), ["p2", "p1"]);
    expect(holderOf(next, "wrench")).toBe("p2");
    expect(next.players.p1?.heldItem).toBeNull();
  });

  it("does not let a player take an item out of someone else's hands", () => {
    const held = pickUp(contested(), "p1");
    expect(pickUp(held, "p2")).toBe(held);
  });

  it("gives the second player the next free item instead, if one is in reach", () => {
    const state = scene();
    const next = resolvePickUpOrDrop(state, ["p1", "p2"]);
    expect(next.players.p1?.heldItem).toBe("wrench");
    expect(next.players.p2?.heldItem).toBe("extinguisher");
  });
});

describe("dropping", () => {
  it("leaves the item exactly where the player stood", () => {
    const holding = pickUp(scene(), "p1");
    const moved = { ...holding, players: { ...holding.players, p1: { ...holding.players.p1!, position: at(150, -40) } } };
    const dropped = drop(moved, "p1");
    expect(dropped.items.wrench?.position).toEqual(at(150, -40));
    expect(dropped.items.wrench?.heldBy).toBeNull();
    expect(dropped.players.p1?.heldItem).toBeNull();
  });

  it("stays there while players walk away and the run goes on", () => {
    const dropped = drop(pickUp(scene(), "p1"), "p1");
    const elsewhere = { ...dropped, players: { ...dropped.players, p1: { ...dropped.players.p1!, position: at(300, 0) } } };
    expect(elsewhere.items.wrench?.position).toEqual(dropped.items.wrench?.position);
    expect(pickUp(elsewhere, "p1")).toBe(elsewhere);
  });

  it("can be picked up again by anyone in reach", () => {
    const dropped = drop(pickUp(scene(), "p1"), "p1");
    expect(pickUp(dropped, "p2").players.p2?.heldItem).toBe("wrench");
  });

  it("does nothing with empty hands", () => {
    const state = scene();
    expect(drop(state, "p1")).toBe(state);
  });

  it("never changes its input", () => {
    const state = scene();
    const before = structuredClone(state);
    drop(pickUp(state, "p1"), "p1");
    resolvePickUpOrDrop(state, ["p1", "p2", "p1"]);
    expect(state).toEqual(before);
  });
});

describe("on the real train", () => {
  it("a player walks to the wrench rack, picks up the wrench, carries it into the engine car and drops it", () => {
    let state = makeState({
      players: { p1: makePlayer("p1", { position: { ...(map.playerSpawns[0] ?? at(0, 0)) } }) },
      items: createStartItems(map),
    });
    const rack = map.stations.find((s) => s.kind === "wrenchRack")!.position;
    const walk = (to: Vec2, steps = 400): void => {
      let pos = state.players.p1!.position;
      for (let i = 0; i < steps && Math.hypot(pos.x - to.x, pos.y - to.y) > 4; i++) {
        const dx = Math.sign(Math.round(to.x - pos.x)) as -1 | 0 | 1;
        const dy = Math.sign(Math.round(to.y - pos.y)) as -1 | 0 | 1;
        pos = movePosition(map, pos, { dx, dy }, 1 / 20);
      }
      state = { ...state, players: { ...state.players, p1: { ...state.players.p1!, position: pos } } };
    };
    walk(at(rack.x, rack.y - 20));
    state = pickUpOrDrop(state, "p1");
    expect(state.players.p1?.heldItem).toBe("wrench");
    walk(at(rack.x, 0));
    walk(at(map.cars[0]!.x, 0), 800);
    state = pickUpOrDrop(state, "p1");
    expect(state.items.wrench?.heldBy).toBeNull();
    expect(Math.abs(state.items.wrench!.position.x - map.cars[0]!.x)).toBeLessThan(5);
  });
});
