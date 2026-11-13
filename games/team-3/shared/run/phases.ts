// Run phases: lobby -> playing -> won or lost -> back to the lobby.
// Pure functions: each returns a new state and never changes its input.

import {
  FUEL_START,
  HULL_START,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SPEED_FACTOR_FULL,
  WIN_DISTANCE,
} from "../constants.ts";
import type { GameState, Journey } from "../types.ts";

/** How many players are in the room and connected. */
export function connectedPlayerCount(state: GameState): number {
  return Object.values(state.players).filter((player) => player.connected).length;
}

/** The journey at the start of a run: full fuel, full hull, no distance. */
export function newJourney(): Journey {
  return { fuel: FUEL_START, hull: HULL_START, distance: 0, speedFactor: SPEED_FACTOR_FULL };
}

/** A run can start from the lobby with two to four connected players. */
export function canStartRun(state: GameState): boolean {
  const count = connectedPlayerCount(state);
  return state.phase === "lobby" && count >= MIN_PLAYERS && count <= MAX_PLAYERS;
}

/** Starts the run if it can start; otherwise returns the state unchanged. */
export function startRun(state: GameState): GameState {
  if (!canStartRun(state)) return state;
  return { ...state, phase: "playing", time: 0, hazards: {}, journey: newJourney() };
}

/** True once the run has ended, either way. */
export function isRunOver(state: GameState): boolean {
  return state.phase === "won" || state.phase === "lost";
}

/**
 * Ends the run when the train has arrived or the hull has failed. Arriving counts first:
 * a crew that reaches the destination on the same step the hull fails has made it.
 */
export function evaluateOutcome(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (state.journey.distance >= WIN_DISTANCE) return { ...state, phase: "won" };
  if (state.journey.hull <= 0) return { ...state, phase: "lost" };
  return state;
}

/** Adds the elapsed time to the run clock while the run is being played. */
export function advanceRunClock(state: GameState, dt: number): GameState {
  if (state.phase !== "playing" || dt <= 0) return state;
  return { ...state, time: state.time + dt };
}

/**
 * "Play again": after a run has ended, puts the same crew back in the lobby with a fresh
 * journey, no hazards and empty hands. Does nothing while a run is still being played.
 */
export function returnToLobby(state: GameState): GameState {
  if (!isRunOver(state)) return state;
  const players: GameState["players"] = {};
  for (const [id, player] of Object.entries(state.players)) players[id] = { ...player, heldItem: null };
  const items: GameState["items"] = {};
  for (const [id, item] of Object.entries(state.items)) items[id] = { ...item, heldBy: null };
  return { ...state, phase: "lobby", time: 0, hazards: {}, journey: newJourney(), players, items };
}
