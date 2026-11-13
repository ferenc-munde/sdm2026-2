// Players leaving and coming back. Pure functions: each returns a new state.

import type { GameState, PlayerId } from "../types.ts";

/** Puts whatever the player holds on the floor where they stand. */
export function dropHeldItem(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (!player || player.heldItem === null) return state;
  const item = state.items[player.heldItem];
  const players = { ...state.players, [playerId]: { ...player, heldItem: null } };
  if (!item) return { ...state, players };
  const dropped = {
    ...item,
    heldBy: null,
    position: { x: player.position.x, y: player.position.y },
    velocity: { x: 0, y: 0 },
  };
  return { ...state, players, items: { ...state.items, [item.id]: dropped } };
}

/**
 * The connection dropped: the player keeps their seat but their item falls to the floor,
 * so the rest of the crew can pick it up.
 */
export function disconnectPlayer(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (!player || !player.connected) return state;
  const dropped = dropHeldItem(state, playerId);
  const current = dropped.players[playerId];
  if (!current) return dropped;
  return { ...dropped, players: { ...dropped.players, [playerId]: { ...current, connected: false } } };
}

/** The player is back: same seat, same position, empty hands. */
export function reconnectPlayer(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (!player || player.connected) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, connected: true } } };
}

/** The player left for good (or their seat timed out): drop their item and free the seat. */
export function removePlayer(state: GameState, playerId: PlayerId): GameState {
  if (!state.players[playerId]) return state;
  const dropped = dropHeldItem(state, playerId);
  const players = { ...dropped.players };
  delete players[playerId];
  return { ...dropped, players };
}

/** True when nobody is left in the room, connected or not, so the room can be closed. */
export function isRoomEmpty(state: GameState): boolean {
  return Object.keys(state.players).length === 0;
}

/** True when no connected player is left to keep the train running. */
export function isCrewGone(state: GameState): boolean {
  return Object.values(state.players).every((player) => !player.connected);
}
