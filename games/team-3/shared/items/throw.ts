// Throwing items (#29): a player throws what they hold in the direction they face. The item
// flies at THROW_SPEED, slows evenly (THROW_FRICTION) and lands; it stops early at a wall and
// passes through doorways, so coal thrown near a door lands in the next car. While it flies
// nobody can pick it up (items.ts); once it lands, anyone in reach can. Pure and deterministic.

import { ITEM_RADIUS, THROW_FRICTION, THROW_SPEED } from "../constants.ts";
import { circleOverlapsBox, velocityFor, type Walled } from "../movement/movement.ts";
import type { StepSystem } from "../run/session.ts";
import type { GameState, Item, PlayerId, Vec2 } from "../types.ts";

/** Flying items move at most this far per sub-step, so they never pass through a wall. */
const MAX_SUBSTEP = 1;

/** True while the item is flying from a throw. */
export function isFlying(item: Item): boolean {
  return item.heldBy === null && (item.velocity.x !== 0 || item.velocity.y !== 0);
}

/** How far a throw carries on open floor: THROW_SPEED² / (2 × THROW_FRICTION). */
export function throwDistance(): number {
  return (THROW_SPEED * THROW_SPEED) / (2 * THROW_FRICTION);
}

/** The player throws the item they hold in the direction they face. Nothing happens with empty hands. */
export function throwItem(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (state.phase !== "playing" || !player?.connected || player.heldItem === null) return state;
  const item = state.items[player.heldItem];
  if (!item) return state;
  const velocity = velocityFor(player.facing, THROW_SPEED);
  if (velocity.x === 0 && velocity.y === 0) return state;
  const thrown: Item = { ...item, heldBy: null, position: { ...player.position }, velocity };
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...player, heldItem: null } },
    items: { ...state.items, [item.id]: thrown },
  };
}

const hitsWall = (map: Walled, p: Vec2): boolean => map.walls.some((wall) => circleOverlapsBox(p, ITEM_RADIUS, wall));

/** Advances one flying item by `dt` seconds: it slows evenly and stops at walls. */
function flyItem(item: Item, dt: number, map: Walled): Item {
  const speed = Math.hypot(item.velocity.x, item.velocity.y);
  const nextSpeed = Math.max(0, speed - THROW_FRICTION * dt);
  // Even slowing: the distance this step is the average speed times the time it actually moved.
  const movingTime = Math.min(dt, speed / THROW_FRICTION);
  const travel = ((speed + nextSpeed) / 2) * movingTime;
  let vx = item.velocity.x / speed;
  let vy = item.velocity.y / speed;
  let position = item.position;

  const steps = Math.max(1, Math.ceil(travel / MAX_SUBSTEP));
  const step = travel / steps;
  for (let i = 0; i < steps && (vx !== 0 || vy !== 0); i++) {
    // Move each axis on its own, and stop that axis at a wall.
    if (vx !== 0) {
      const next = { x: position.x + vx * step, y: position.y };
      if (hitsWall(map, next)) vx = 0;
      else position = next;
    }
    if (vy !== 0) {
      const next = { x: position.x, y: position.y + vy * step };
      if (hitsWall(map, next)) vy = 0;
      else position = next;
    }
  }
  const landed = nextSpeed === 0 || (vx === 0 && vy === 0);
  const velocity = landed ? { x: 0, y: 0 } : { x: vx * nextSpeed, y: vy * nextSpeed };
  return { ...item, position, velocity };
}

/** Moves every flying item by `dt` seconds. Items in hands or on the floor stay put. */
export function stepThrownItems(state: GameState, dt: number, map: Walled): GameState {
  if (state.phase !== "playing" || dt <= 0) return state;
  let items: GameState["items"] | null = null;
  for (const item of Object.values(state.items)) {
    if (!isFlying(item)) continue;
    items ??= { ...state.items };
    items[item.id] = flyItem(item, dt, map);
  }
  return items ? { ...state, items } : state;
}

/** Flying items as a rule system for the game session (run it with movement). */
export function createThrowSystem(map: Walled): StepSystem {
  return (state, dt) => stepThrownItems(state, dt, map);
}
