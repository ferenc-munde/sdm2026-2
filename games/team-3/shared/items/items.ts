// Carrying items: a player picks up the nearest free item in reach, carries one item at
// a time, and drops it where they stand. The server decides who gets an item: requests
// are handled one at a time, so when two players grab the same item, only the first gets it.
//
// Coal comes from the coal dispenser and goes into the engine (shared/stations, #15);
// those station uses run before a plain pick-up or drop. Pure and deterministic.

import { INTERACT_RANGE } from "../constants.ts";
import type { TrainMap } from "../map/map.ts";
import type { GameState, Item, ItemId, PlayerId, Vec2 } from "../types.ts";

const AT_REST: Vec2 = { x: 0, y: 0 };

/** The items lying at their start positions when a run begins: the wrench and the extinguisher. */
export function createStartItems(map: TrainMap): GameState["items"] {
  const items: GameState["items"] = {};
  const counts: Record<string, number> = {};
  for (const spawn of map.itemSpawns) {
    counts[spawn.kind] = (counts[spawn.kind] ?? 0) + 1;
    const id = counts[spawn.kind] === 1 ? spawn.kind : `${spawn.kind}-${counts[spawn.kind]}`;
    items[id] = { id, kind: spawn.kind, position: { ...spawn.position }, heldBy: null, velocity: { ...AT_REST } };
  }
  return items;
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The free item nearest to `position`, within INTERACT_RANGE, or null. Ties are broken by
 * item id, so the result never depends on the order the items were stored in. An item still
 * flying from a throw (#29) is not free until it lands.
 */
export function nearestFreeItem(state: GameState, position: Vec2): Item | null {
  let best: Item | null = null;
  let bestDistance = Infinity;
  for (const item of Object.values(state.items)) {
    if (item.heldBy !== null || item.velocity.x !== 0 || item.velocity.y !== 0) continue;
    const d = distance(item.position, position);
    if (d > INTERACT_RANGE) continue;
    if (d < bestDistance || (d === bestDistance && best !== null && item.id < best.id)) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

/** True when the player is in the room, connected, and the run is being played. */
function canAct(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return state.phase === "playing" && player !== undefined && player.connected;
}

/** The player picks up the nearest free item in reach. Nothing happens if their hands are full. */
export function pickUp(state: GameState, playerId: PlayerId): GameState {
  if (!canAct(state, playerId)) return state;
  const player = state.players[playerId];
  if (!player || player.heldItem !== null) return state;
  const item = nearestFreeItem(state, player.position);
  if (!item) return state;
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...player, heldItem: item.id } },
    items: { ...state.items, [item.id]: { ...item, heldBy: playerId, velocity: { ...AT_REST } } },
  };
}

/** The player puts down what they hold, at the spot where they stand. */
export function drop(state: GameState, playerId: PlayerId): GameState {
  if (!canAct(state, playerId)) return state;
  const player = state.players[playerId];
  if (!player || player.heldItem === null) return state;
  const item = state.items[player.heldItem];
  const players = { ...state.players, [playerId]: { ...player, heldItem: null } };
  if (!item) return { ...state, players };
  const dropped: Item = { ...item, heldBy: null, position: { ...player.position }, velocity: { ...AT_REST } };
  return { ...state, players, items: { ...state.items, [item.id]: dropped } };
}

/** The `pickUpOrDrop` message: drop when holding something, otherwise pick up. */
export function pickUpOrDrop(state: GameState, playerId: PlayerId): GameState {
  const holding = (state.players[playerId]?.heldItem ?? null) !== null;
  return holding ? drop(state, playerId) : pickUp(state, playerId);
}

/**
 * Handles several `pickUpOrDrop` requests that arrived in the same tick, one after another
 * in arrival order. An item one player has just taken is no longer free for the next, so
 * two players grabbing the same item can never both get it.
 */
export function resolvePickUpOrDrop(state: GameState, requests: readonly PlayerId[]): GameState {
  return requests.reduce((current, playerId) => pickUpOrDrop(current, playerId), state);
}

/** Who holds an item, or null when it lies on the floor. */
export function holderOf(state: GameState, itemId: ItemId): PlayerId | null {
  return state.items[itemId]?.heldBy ?? null;
}
