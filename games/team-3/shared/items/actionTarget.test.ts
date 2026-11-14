import { describe, expect, it } from "vitest";
import { carCentreX, createTrainMap } from "../map/map.ts";
import { createPlatformMap } from "../map/platform.ts";
import { createSeededRandom } from "../run/random.ts";
import { useRunAction } from "../run/room.ts";
import { makeItem, makePlayer, makeState } from "../run/testState.ts";
import type { GameState, Vec2 } from "../types.ts";
import { actionTarget } from "./actionTarget.ts";
import { createStartItems } from "./items.ts";

const train = createTrainMap();
const platform = createPlatformMap();
const world = { train, platform };
const stationAt = (kind: string): Vec2 => train.stations.find((s) => s.kind === kind)!.position;
const near = (p: Vec2, dx = -20): Vec2 => ({ x: p.x + dx, y: p.y });
const solo = (position: Vec2, extra: Partial<GameState> = {}, heldItem: string | null = null): GameState =>
  makeState({ players: { p1: makePlayer("p1", { position, heldItem }) }, items: createStartItems(train), ...extra });

describe("what tap-E would do", () => {
  it("takes coal at the dispenser with empty hands", () => {
    expect(actionTarget(solo(near(stationAt("coalDispenser"))), "p1", world)?.kind).toBe("takeCoal");
  });

  it("delivers held coal at the engine", () => {
    const s = solo(near(stationAt("engine"), 20), { items: { c: makeItem("c", "coal", { heldBy: "p1" }) } }, "c");
    expect(actionTarget(s, "p1", world)?.kind).toBe("deliverCoal");
  });

  it("picks up the nearest free item, and drops what is held", () => {
    const rack = stationAt("wrenchRack");
    expect(actionTarget(solo({ x: rack.x, y: rack.y - 20 }), "p1", world)).toMatchObject({ kind: "pickUp", itemId: "wrench" });
    const holding = solo({ x: carCentreX(1), y: 0 }, { items: { w: makeItem("w", "wrench", { heldBy: "p1" }) } }, "w");
    expect(actionTarget(holding, "p1", world)).toEqual({ kind: "drop", itemId: "w" });
  });

  it("is nothing out of reach, at the engine with empty hands, or when disconnected", () => {
    expect(actionTarget(solo({ x: carCentreX(2), y: 60 }), "p1", world)).toBeNull();
    expect(actionTarget(solo(near(stationAt("engine"), 20)), "p1", world)).toBeNull();
    const off = solo(near(stationAt("coalDispenser")));
    expect(actionTarget({ ...off, players: { p1: { ...off.players.p1!, connected: false } } }, "p1", world)).toBeNull();
  });

  it("is the departure lever on the platform, only within reach", () => {
    const lever = platform.objects.departureLever;
    const lobby = (p: Vec2) => ({ ...solo(p), phase: "lobby" as const, items: {} });
    expect(actionTarget(lobby({ x: lever.x - 20, y: lever.y + 10 }), "p1", world)).toEqual({ kind: "lever", position: lever });
    expect(actionTarget(lobby({ x: 0, y: 0 }), "p1", world)).toBeNull();
  });
});

describe("never disagrees with the room (useRunAction)", () => {
  it("predicts exactly what tap-E then does, at hundreds of positions and hands", () => {
    const random = createSeededRandom(295);
    const spots = [stationAt("coalDispenser"), stationAt("engine"), stationAt("wrenchRack"), stationAt("extinguisherRack"), { x: carCentreX(1), y: 0 }];
    for (let i = 0; i < 400; i++) {
      const base = spots[i % spots.length]!;
      const position = { x: base.x + (random.next() - 0.5) * 120, y: Math.max(-95, Math.min(95, base.y + (random.next() - 0.5) * 120)) };
      const hold = ["none", "coal", "wrench"][Math.floor(random.next() * 3)]!;
      const items: GameState["items"] = { ...createStartItems(train), ...(hold === "coal" ? { c: makeItem("c", "coal", { heldBy: "p1", position }) } : {}) };
      if (hold === "wrench") items.wrench = { ...items.wrench!, heldBy: "p1" };
      const heldItem = hold === "coal" ? "c" : hold === "wrench" ? "wrench" : null;
      // Sometimes a fire burns beside a station, which disables it (#226).
      const near = train.stations.find((st) => Math.hypot(st.position.x - position.x, st.position.y - position.y) < 70);
      const hazards: GameState["hazards"] = near && random.next() < 0.4
        ? { f: { id: "f", kind: "fire", car: near.car, spotId: "test", position: { x: near.position.x + 10, y: near.position.y }, age: 0, progress: 0, countdown: null } }
        : {};
      const s = solo(position, { items, hazards }, heldItem);

      const target = actionTarget(s, "p1", world);
      const after = useRunAction(s, "p1", train);
      const p = after.players.p1!;
      const where = `${hold} at (${position.x.toFixed(0)}, ${position.y.toFixed(0)})`;
      if (target === null) expect(after, where).toBe(s);
      else if (target.kind === "takeCoal") expect(after.items[p.heldItem!]?.kind, where).toBe("coal");
      else if (target.kind === "deliverCoal") expect([p.heldItem, after.items[s.players.p1!.heldItem!]], where).toEqual([null, undefined]);
      else if (target.kind === "drop") expect([p.heldItem, after.items[target.itemId]?.heldBy], where).toEqual([null, null]);
      else if (target.kind === "pickUp") expect(p.heldItem, where).toBe(target.itemId);
    }
  });
});

describe("stations disabled by fire (#226)", () => {
  it("does not offer the coal dispenser while a fire burns beside it, like the room", () => {
    const dispenser = train.stations.find((st) => st.kind === "coalDispenser")!;
    const fire = { id: "f", kind: "fire" as const, car: dispenser.car, spotId: "x", position: { x: dispenser.position.x + 10, y: dispenser.position.y }, age: 0, progress: 0, countdown: null };
    const s = solo(near(dispenser.position), { hazards: { f: fire } });
    expect(actionTarget(s, "p1", world)?.kind).not.toBe("takeCoal");
    expect(Object.values(useRunAction(s, "p1", train).items).some((i) => i.kind === "coal")).toBe(false);
  });
});
