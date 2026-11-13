// Player movement: moves a player from their input at a constant speed, stopping at
// walls and passing through the doors between cars.
//
// A player is a circle of PLAYER_RADIUS on the floor. Walls are the solid boxes of the
// map (../map/map.ts). Movement is pure and deterministic: the same state, inputs and
// elapsed time always give the same positions.
//
// Direction convention (shared with the keyboard, #84): dx +1 is towards the back of the
// train (+x), dy +1 is down on screen (+y). Opposite keys cancel out before they get here.

import { PLAYER_RADIUS, PLAYER_SPEED } from "../constants.ts";
import type { FloorBox, TrainMap } from "../map/map.ts";
import type { Direction, GameState, PlayerId, Vec2 } from "../types.ts";

/**
 * The longest distance a player moves in one sub-step. Walls are 10 units thick, so moving
 * at most 1 unit at a time can never jump through a wall, however large `dt` is.
 */
const MAX_SUBSTEP = 1;

/** True when nothing is pressed. */
export function isStill(direction: Direction): boolean {
  return direction.dx === 0 && direction.dy === 0;
}

/**
 * Velocity in units per second for a direction. Diagonals are scaled down so a player
 * moves at PLAYER_SPEED in all 8 directions.
 */
export function velocityFor(direction: Direction, speed = PLAYER_SPEED): Vec2 {
  if (isStill(direction)) return { x: 0, y: 0 };
  const length = Math.hypot(direction.dx, direction.dy);
  return { x: (direction.dx / length) * speed, y: (direction.dy / length) * speed };
}

/** True when a circle at `center` overlaps `box`. Touching the edge is allowed. */
export function circleOverlapsBox(center: Vec2, radius: number, box: FloorBox): boolean {
  const nearestX = Math.max(box.x - box.width / 2, Math.min(center.x, box.x + box.width / 2));
  const nearestY = Math.max(box.y - box.depth / 2, Math.min(center.y, box.y + box.depth / 2));
  const dx = center.x - nearestX;
  const dy = center.y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

/** True when a player standing at `position` would overlap any wall. */
export function hitsWall(map: TrainMap, position: Vec2, radius = PLAYER_RADIUS): boolean {
  return map.walls.some((wall) => circleOverlapsBox(position, radius, wall));
}

/**
 * Moves along one axis in small sub-steps and stops at the last free position before a
 * wall. Moving the two axes separately lets a player slide along a wall when they walk
 * into it at an angle.
 */
function moveAxis(map: TrainMap, start: Vec2, axis: "x" | "y", distance: number): Vec2 {
  if (distance === 0) return start;
  const steps = Math.ceil(Math.abs(distance) / MAX_SUBSTEP);
  const step = distance / steps;
  let position = start;
  for (let i = 0; i < steps; i += 1) {
    const next = axis === "x" ? { x: position.x + step, y: position.y } : { x: position.x, y: position.y + step };
    if (hitsWall(map, next)) break;
    position = next;
  }
  return position;
}

/** Where a player at `position` ends up after moving in `direction` for `dt` seconds. */
export function movePosition(map: TrainMap, position: Vec2, direction: Direction, dt: number): Vec2 {
  if (dt <= 0 || isStill(direction)) return position;
  const velocity = velocityFor(direction);
  const afterX = moveAxis(map, position, "x", velocity.x * dt);
  return moveAxis(map, afterX, "y", velocity.y * dt);
}

/**
 * Moves every connected player by their input for `dt` seconds and turns them to face the
 * way they walked. Players without input, or with nothing pressed, stay where they are and
 * keep facing the same way. Returns a new state; the input state is never changed.
 */
export function stepMovement(
  state: GameState,
  inputs: Readonly<Record<PlayerId, Direction>>,
  dt: number,
  map: TrainMap,
): GameState {
  if (dt <= 0) return state;
  let players: GameState["players"] | null = null;
  for (const [id, player] of Object.entries(state.players)) {
    const direction = inputs[id];
    if (!player.connected || !direction || isStill(direction)) continue;
    const position = movePosition(map, player.position, direction, dt);
    players ??= { ...state.players };
    players[id] = { ...player, position, facing: { dx: direction.dx, dy: direction.dy } };
  }
  return players ? { ...state, players } : state;
}
