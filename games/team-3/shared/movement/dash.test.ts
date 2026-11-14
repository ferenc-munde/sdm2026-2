import { describe, expect, it } from "vitest";
import { DASH_COOLDOWN_SECONDS, DASH_SECONDS, DASH_SPEED, PLAYER_RADIUS } from "../constants.ts";
import { CAR_WIDTH, carCentreX, createTrainMap } from "../map/map.ts";
import { makeItem, makePlayer, makeState } from "../run/testState.ts";
import type { Direction, GameState, Vec2 } from "../types.ts";
import { canDash, startDash, stepDashes } from "./dash.ts";
import { hitsWall, stepMovement } from "./movement.ts";

const map = createTrainMap();
const TICK = 1 / 20;
const MIDDLE: Vec2 = { x: carCentreX(1), y: 0 };
const withP1 = (over: Partial<GameState["players"][string]> = {}, facing: Direction = { dx: 1, dy: 0 }): GameState =>
  makeState({ players: { p1: makePlayer("p1", { position: { ...MIDDLE }, facing, ...over }) } });
const run = (s: GameState, seconds: number, keys: Record<string, Direction> = {}): GameState => {
  let next = s;
  for (let t = 0; t < Math.round(seconds / TICK); t++) next = stepDashes(stepMovement(next, keys, TICK, map), TICK, map);
  return next;
};

describe("dash burst", () => {
  it("moves DASH_SPEED × DASH_SECONDS in the facing direction, then stops", () => {
    const end = run(startDash(withP1(), "p1"), 1).players.p1!;
    expect(end.position.x - MIDDLE.x).toBeCloseTo(DASH_SPEED * DASH_SECONDS, 5);
    expect(end.position.y).toBe(0);
    expect(end.dashSeconds).toBe(0);
  });

  it("is faster than walking", () => {
    const dashed = run(startDash(withP1(), "p1"), DASH_SECONDS).players.p1!.position.x;
    const walked = run(withP1(), DASH_SECONDS, { p1: { dx: 1, dy: 0 } }).players.p1!.position.x;
    expect(dashed - MIDDLE.x).toBeGreaterThan(2 * (walked - MIDDLE.x));
  });

  it("ignores walking keys while dashing", () => {
    const end = run(startDash(withP1(), "p1"), DASH_SECONDS, { p1: { dx: 0, dy: 1 } }).players.p1!;
    expect(end.position.y).toBe(0);
  });

  it("stops at a wall without stunning the player", () => {
    const nearWall = { x: MIDDLE.x, y: CAR_WIDTH / 2 - PLAYER_RADIUS - 20 };
    const end = run(startDash(withP1({ position: nearWall }, { dx: 0, dy: 1 }), "p1"), 1).players.p1!;
    expect(hitsWall(map, end.position)).toBe(false);
    expect(end.position.y).toBeGreaterThan(nearWall.y);
    expect(end.stunnedSeconds ?? 0).toBe(0);
  });
});

describe("cooldown", () => {
  it("blocks a second dash until DASH_COOLDOWN_SECONDS have passed", () => {
    let s = startDash(withP1(), "p1");
    s = run(s, DASH_COOLDOWN_SECONDS - 0.1);
    expect(canDash(s, "p1")).toBe(false);
    expect(startDash(s, "p1")).toBe(s);
    s = run(s, 0.15);
    expect(canDash(s, "p1")).toBe(true);
  });

  it("counts down while the player stands still", () => {
    const s = run(startDash(withP1(), "p1"), DASH_COOLDOWN_SECONDS + 0.05);
    expect(s.players.p1!.dashCooldown).toBe(0);
  });
});

describe("when there is no dash", () => {
  it("not while stunned or knocked back (#227)", () => {
    expect(canDash(withP1({ stunnedSeconds: 1 }), "p1")).toBe(false);
    expect(canDash(withP1({ velocity: { x: 0, y: 300 } }), "p1")).toBe(false);
  });

  it("a stun cuts a dash short", () => {
    let s = run(startDash(withP1(), "p1"), TICK);
    const p = s.players.p1!;
    s = { ...s, players: { p1: { ...p, stunnedSeconds: 1 } } };
    s = stepDashes(s, TICK, map);
    expect(s.players.p1!.dashSeconds).toBe(0);
    expect(s.players.p1!.position).toEqual(p.position);
  });

  it("not with an item in hand (that key throws it), when disconnected, or outside a run", () => {
    const holding = makeState({
      players: { p1: makePlayer("p1", { heldItem: "w" }) },
      items: { w: makeItem("w", "wrench", { heldBy: "p1" }) },
    });
    expect(canDash(holding, "p1")).toBe(false);
    expect(canDash(withP1({ connected: false }), "p1")).toBe(false);
    expect(canDash({ ...withP1(), phase: "lobby" }, "p1")).toBe(false);
  });

  it("never changes its input", () => {
    const s = startDash(withP1(), "p1");
    const before = structuredClone(s);
    run(s, 1);
    expect(s).toEqual(before);
  });
});
