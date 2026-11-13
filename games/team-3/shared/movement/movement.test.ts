import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../constants.ts";
import { CAR_WIDTH, carAt, carCentreX, createTrainMap, insideBox } from "../map/map.ts";
import { createSeededRandom } from "../run/random.ts";
import { makePlayer, makeState } from "../run/testState.ts";
import type { Direction, Vec2 } from "../types.ts";
import { hitsWall, movePosition, stepMovement, velocityFor } from "./movement.ts";

const map = createTrainMap();
const TICK = 1 / 20;

/** Moves for `seconds` in ticks of 1/20 s, like the room does. */
function walk(start: Vec2, direction: Direction, seconds: number): Vec2 {
  let position = start;
  for (let t = 0; t < Math.round(seconds / TICK); t++) position = movePosition(map, position, direction, TICK);
  return position;
}

const dir = (dx: -1 | 0 | 1, dy: -1 | 0 | 1): Direction => ({ dx, dy });
const EIGHT: Direction[] = [dir(1, 0), dir(1, 1), dir(0, 1), dir(-1, 1), dir(-1, 0), dir(-1, -1), dir(0, -1), dir(1, -1)];
/** The middle of the middle car: far enough from every wall for a short walk. */
const MIDDLE: Vec2 = { x: carCentreX(1), y: 0 };
/** Where a player stands when touching a side wall from inside. */
const SIDE_LIMIT = CAR_WIDTH / 2 - PLAYER_RADIUS;

describe("moving", () => {
  it("moves in all 8 directions at the same constant speed", () => {
    for (const direction of EIGHT) {
      const end = walk(MIDDLE, direction, 0.5);
      expect(Math.hypot(end.x - MIDDLE.x, end.y - MIDDLE.y)).toBeCloseTo(PLAYER_SPEED * 0.5, 5);
      expect(Math.sign(end.x - MIDDLE.x)).toBe(direction.dx);
      expect(Math.sign(end.y - MIDDLE.y)).toBe(direction.dy);
    }
  });

  it("moves diagonally at the same speed as straight", () => {
    for (const direction of EIGHT) expect(Math.hypot(velocityFor(direction).x, velocityFor(direction).y)).toBeCloseTo(PLAYER_SPEED);
  });

  it("does not move without input or time", () => {
    expect(movePosition(map, MIDDLE, dir(0, 0), 1)).toEqual(MIDDLE);
    expect(movePosition(map, MIDDLE, dir(1, 0), 0)).toEqual(MIDDLE);
  });

  it("uses the keyboard's convention: up is -y, right is +x", () => {
    expect(walk(MIDDLE, dir(0, -1), 0.1).y).toBeLessThan(MIDDLE.y);
    expect(walk(MIDDLE, dir(1, 0), 0.1).x).toBeGreaterThan(MIDDLE.x);
  });
});

describe("walls", () => {
  it("stops at a side wall, right against it", () => {
    const end = walk(MIDDLE, dir(0, 1), 3);
    expect(hitsWall(map, end)).toBe(false);
    expect(end.y).toBeGreaterThan(SIDE_LIMIT - 1);
    expect(end.y).toBeLessThanOrEqual(SIDE_LIMIT);
    expect(end.x).toBe(MIDDLE.x);
  });

  it("stops at the closed front of the train", () => {
    const end = walk({ x: carCentreX(0), y: 0 }, dir(-1, 0), 5);
    expect(hitsWall(map, end)).toBe(false);
    expect(carAt(map, end)).toBe(0);
  });

  it("stops at the wall beside a door instead of passing it", () => {
    const end = walk({ x: carCentreX(0), y: 80 }, dir(1, 0), 5);
    expect(carAt(map, end)).toBe(0);
    expect(end.y).toBe(80);
  });

  it("slides along a wall when walking into it at an angle", () => {
    const end = walk(MIDDLE, dir(1, 1), 1);
    expect(end.y).toBeGreaterThan(SIDE_LIMIT - 1);
    expect(end.y).toBeLessThanOrEqual(SIDE_LIMIT);
    expect(end.x - MIDDLE.x).toBeGreaterThan(100);
  });

  it("cannot jump through a wall in one very long step", () => {
    const end = movePosition(map, { x: carCentreX(0), y: 80 }, dir(1, 0), 60);
    expect(carAt(map, end)).toBe(0);
  });
});

describe("doors", () => {
  it("passes through the doors from the engine car to the last car", () => {
    let position: Vec2 = { x: carCentreX(0), y: 0 };
    position = walk(position, dir(1, 0), 3);
    expect(carAt(map, position)).toBe(1);
    position = walk(position, dir(1, 0), 3);
    expect(carAt(map, position)).toBe(2);
  });

  it("passes back through the doors to the engine car", () => {
    const end = walk({ x: carCentreX(2), y: 0 }, dir(-1, 0), 6);
    expect(carAt(map, end)).toBe(0);
  });

  it("passes a door when walking slightly off its centre", () => {
    const end = walk({ x: carCentreX(0), y: 30 }, dir(1, 0), 3);
    expect(carAt(map, end)).toBe(1);
  });
});

describe("never leaves the train", () => {
  it("stays on the floor through a long random walk", () => {
    const random = createSeededRandom(7);
    const walkable = [...map.cars, ...map.doors];
    let position = map.playerSpawns[0] ?? MIDDLE;
    for (let tick = 0; tick < 4000; tick++) {
      if (tick % 15 === 0) {
        const pick = EIGHT[Math.floor(random.next() * EIGHT.length)];
        if (pick) position = movePosition(map, position, pick, TICK);
      }
      const direction = EIGHT[tick % 8] ?? dir(1, 0);
      position = movePosition(map, position, direction, TICK * (1 + (tick % 3)));
      expect(hitsWall(map, position)).toBe(false);
      expect(walkable.some((area) => insideBox(area, position))).toBe(true);
    }
  });
});

describe("stepMovement", () => {
  it("knocks a player sideways, slows the impulse, and stuns on a wall", () => {
    const state = makeState({ phase: "playing" }, ["p1"]);
    state.players.p1!.position = { x: carCentreX(1), y: SIDE_LIMIT - 2 };
    state.players.p1!.velocity = { x: 0, y: 450 };
    const hit = stepMovement(state, { p1: dir(1, 0) }, 0.1, map);
    expect(hit.players.p1!.position.y).toBeLessThanOrEqual(SIDE_LIMIT);
    expect(hit.players.p1!.velocity).toEqual({ x: 0, y: 0 });
    expect(hit.players.p1!.stunnedSeconds).toBe(1.5);
    const stunned = stepMovement(hit, { p1: dir(1, 0) }, 1, map);
    expect(stunned.players.p1!.position).toEqual(hit.players.p1!.position);
    const recovered = stepMovement(stunned, { p1: dir(1, 0) }, 0.6, map);
    expect(recovered.players.p1!.position.x).toBeGreaterThan(stunned.players.p1!.position.x);
  });

  const start = (): ReturnType<typeof makeState> =>
    makeState({
      players: {
        p1: makePlayer("p1", { position: { ...MIDDLE } }),
        p2: makePlayer("p2", { position: { x: MIDDLE.x, y: 40 } }),
        p3: makePlayer("p3", { position: { x: MIDDLE.x, y: -40 }, connected: false }),
      },
    });

  it("moves each connected player by their own input and faces them that way", () => {
    const state = start();
    const next = stepMovement(state, { p1: dir(1, 0), p2: dir(0, -1) }, 0.5, map);
    expect(next.players.p1?.position.x).toBeCloseTo(MIDDLE.x + PLAYER_SPEED * 0.5);
    expect(next.players.p1?.facing).toEqual(dir(1, 0));
    expect(next.players.p2?.position.y).toBeCloseTo(40 - PLAYER_SPEED * 0.5);
    expect(next.players.p2?.facing).toEqual(dir(0, -1));
  });

  it("leaves players without input, and disconnected players, where they are", () => {
    const state = start();
    const next = stepMovement(state, { p3: dir(1, 0) }, 0.5, map);
    expect(next.players.p1?.position).toEqual(MIDDLE);
    expect(next.players.p3?.position).toEqual({ x: MIDDLE.x, y: -40 });
  });

  it("keeps the facing direction when the player stops", () => {
    const state = start();
    const moved = stepMovement(state, { p1: dir(-1, 1) }, 0.1, map);
    const stopped = stepMovement(moved, { p1: dir(0, 0) }, 0.1, map);
    expect(stopped.players.p1?.facing).toEqual(dir(-1, 1));
  });

  it("returns the same state when nobody moves, and never changes its input", () => {
    const state = start();
    const before = structuredClone(state);
    expect(stepMovement(state, {}, 0.5, map)).toBe(state);
    stepMovement(state, { p1: dir(1, 1), p2: dir(-1, 0) }, 0.5, map);
    expect(state).toEqual(before);
  });
});
