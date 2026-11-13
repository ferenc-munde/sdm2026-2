// The game session: one room's state plus the director, and the events that change it.
//
// This is the single entry point the room calls. It maps onto the platform's game
// definition (`createState`, `join`, `leave`, `disconnect`, `reconnect`, `step`), so
// connecting to `@sdm/host` (#8) is a thin wrapper around these functions.
// Everything here is pure and deterministic.

import { roomSettings } from "../config.ts";
import { PLAYER_NAME_MAX_LENGTH } from "../constants.ts";
import type { ErrorCode } from "../messages.ts";
import type { GameState, PlayerId, Vec2 } from "../types.ts";
import { createDirector, crewSize, type DirectorState, type HazardSpot, stepDirector } from "./director.ts";
import { advanceRunClock, canStartRun, evaluateOutcome, newJourney, returnToLobby, startRun } from "./phases.ts";
import { disconnectPlayer, reconnectPlayer, removePlayer } from "./presence.ts";
import type { RandomSource } from "./random.ts";

/** Everything the server keeps for one room. */
export interface GameSession {
  state: GameState;
  director: DirectorState;
}

/** The result of an event a player asked for: the new session, or why it was refused. */
export type SessionResult = { ok: true; session: GameSession } | { ok: false; error: ErrorCode; session: GameSession };

/**
 * One rule that advances the state by `dt` seconds, such as movement, the journey model or
 * hazard damage. Systems run in order on every step while the run is being played.
 */
export type StepSystem = (state: GameState, dt: number) => GameState;

/** What a step needs besides the session and the elapsed time. */
export interface StepContext {
  /** Where hazards can start; from the map data. */
  spots: readonly HazardSpot[];
  /** The room's seeded random source. */
  random: RandomSource;
  /** The rules to run before the director and the win/lose check. */
  systems?: readonly StepSystem[];
}

/** A new, empty room waiting in the lobby. */
export function createSession(roomCode: string): GameSession {
  const state: GameState = {
    roomCode,
    phase: "lobby",
    time: 0,
    players: {},
    items: {},
    hazards: {},
    journey: newJourney(),
  };
  return { state, director: createDirector() };
}

/** Trims a name and checks its length; returns null when it cannot be used. */
export function cleanPlayerName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > PLAYER_NAME_MAX_LENGTH) return null;
  return trimmed;
}

const refuse = (session: GameSession, error: ErrorCode): SessionResult => ({ ok: false, error, session });
const accept = (session: GameSession): SessionResult => ({ ok: true, session });

/**
 * A player joins the room. New players are only let in while the room is in the lobby and
 * has a free seat; a player who is already in the room gets their seat back at any time.
 */
export function joinSession(
  session: GameSession,
  playerId: PlayerId,
  name: string,
  spawn: Vec2 = { x: 0, y: 0 },
): SessionResult {
  const { state } = session;
  if (state.players[playerId]) return accept({ ...session, state: reconnectPlayer(state, playerId) });

  const cleanName = cleanPlayerName(name);
  if (cleanName === null) return refuse(session, "invalidName");
  if (state.phase !== "lobby") return refuse(session, "gameInProgress");
  if (Object.keys(state.players).length >= roomSettings.maxPlayers) return refuse(session, "roomFull");

  const player = {
    id: playerId,
    name: cleanName,
    position: { x: spawn.x, y: spawn.y },
    facing: { dx: 1 as const, dy: 0 as const },
    heldItem: null,
    connected: true,
  };
  return accept({ ...session, state: { ...state, players: { ...state.players, [playerId]: player } } });
}

/** A player's connection dropped: they keep their seat and their item falls. */
export function disconnectFromSession(session: GameSession, playerId: PlayerId): GameSession {
  return { ...session, state: disconnectPlayer(session.state, playerId) };
}

/** A player left for good, or their seat timed out. */
export function leaveSession(session: GameSession, playerId: PlayerId): GameSession {
  return { ...session, state: removePlayer(session.state, playerId) };
}

/** Starts the run from the lobby; refused unless two to four players are connected. */
export function startSession(session: GameSession): SessionResult {
  if (session.state.phase !== "lobby") return refuse(session, "gameInProgress");
  if (!canStartRun(session.state)) return refuse(session, "invalidMessage");
  const state = startRun(session.state);
  return accept({ state, director: createDirector(crewSize(state)) });
}

/** "Play again" after a run has ended: the same crew goes back to the lobby. */
export function playAgain(session: GameSession): SessionResult {
  const state = returnToLobby(session.state);
  if (state === session.state) return refuse(session, "invalidMessage");
  return accept({ state, director: createDirector() });
}

/**
 * Advances the room by `dt` seconds. While the run is being played: the clock, then the
 * given systems in order, then the hazard director, then the win/lose check.
 * Outside the "playing" phase nothing changes.
 */
export function stepSession(session: GameSession, dt: number, context: StepContext): GameSession {
  if (session.state.phase !== "playing" || dt <= 0) return session;

  let state = advanceRunClock(session.state, dt);
  for (const system of context.systems ?? []) state = system(state, dt);

  const directed = stepDirector(session.director, state, context.spots, dt, context.random);
  return { state: evaluateOutcome(directed.state), director: directed.director };
}
