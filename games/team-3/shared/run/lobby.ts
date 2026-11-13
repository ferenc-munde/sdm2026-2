// The lobby (#148): before a run, the room has a host and a crew size. The host picks how
// many players the crew will have (2–4), the room fills up to that size, and only the host
// can depart, once the crew is complete. Pure functions on the state; the session (session.ts)
// calls them from its join, leave, configure and start events.

import { MAX_PLAYERS, MIN_PLAYERS } from "../constants.ts";
import type { GameState, Lobby, PlayerId } from "../types.ts";

/** A new room's setup: no host yet, and room for a full crew until the host says otherwise. */
export function newLobby(): Lobby {
  return { hostId: null, crewSize: MAX_PLAYERS };
}

/**
 * Keeps the host if they are still in the room; otherwise the player who joined earliest
 * becomes host (players keep their join order), or nobody when the room is empty.
 */
export function withHost(state: GameState): GameState {
  const { hostId } = state.lobby;
  if (hostId !== null && state.players[hostId]) return state;
  const next = Object.keys(state.players)[0] ?? null;
  if (next === hostId) return state;
  return { ...state, lobby: { ...state.lobby, hostId: next } };
}

/** True when the room has as many players as the crew size, so nobody new can join. */
export function isRoomFull(state: GameState): boolean {
  return Object.keys(state.players).length >= state.lobby.crewSize;
}

/** The smallest crew size the host may pick right now: never below the players already in. */
export function smallestCrewSize(state: GameState): number {
  return Math.max(MIN_PLAYERS, Object.keys(state.players).length);
}

/** True for a crew size the host may pick right now. */
export function isValidCrewSize(state: GameState, crewSize: number): boolean {
  return Number.isInteger(crewSize) && crewSize >= smallestCrewSize(state) && crewSize <= MAX_PLAYERS;
}

/** How many players are in the room and connected. */
function connectedCount(state: GameState): number {
  return Object.values(state.players).filter((player) => player.connected).length;
}

/** True when the crew is complete: as many connected players as the crew size. */
export function isCrewComplete(state: GameState): boolean {
  return connectedCount(state) === state.lobby.crewSize;
}

/**
 * True when `playerId` may depart (start the run) now: in the lobby, they are the host, and
 * the crew is complete. The departure lever on the platform (#153) asks this.
 */
export function canDepart(state: GameState, playerId: PlayerId): boolean {
  return state.phase === "lobby" && state.lobby.hostId === playerId && isCrewComplete(state);
}
