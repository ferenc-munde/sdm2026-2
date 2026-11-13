// The game session: one room's state plus the director, and the events that change it.
//
// This is the single entry point the room calls. It maps onto the platform's game
// definition (`createState`, `join`, `leave`, `disconnect`, `reconnect`, `step`), so
// connecting to `@sdm/host` (#8) is a thin wrapper around these functions.
// Everything here is pure and deterministic.

import { roomSettings } from "../config.ts";
import { PLAYER_NAME_MAX_LENGTH } from "../constants.ts";
import type { ErrorCode, InputMessage } from "../messages.ts";
import type { Direction, GameState, PlayerId, Vec2 } from "../types.ts";
import { createDirector, crewSize, type DirectorState, type HazardSpot, stepDirector } from "./director.ts";
import { advanceRunClock, canStartRun, evaluateOutcome, newJourney, returnToLobby, startRun } from "./phases.ts";
import { canDepart, isRoomFull, isValidCrewSize, newLobby, withHost } from "./lobby.ts";
import { disconnectPlayer, reconnectPlayer, removePlayer } from "./presence.ts";
import type { RandomSource } from "./random.ts";

/** What a player is holding down right now: the input message without its `type`. */
export type PlayerInput = Omit<InputMessage, "type">;

/** The latest input of each player. Kept next to the state, not in it, so it is never synced to clients. */
export type PlayerInputs = Readonly<Record<PlayerId, PlayerInput>>;

/** Everything the server keeps for one room. */
export interface GameSession {
  state: GameState;
  director: DirectorState;
  /** The latest input each player sent; used by the rule systems on every step. */
  inputs: PlayerInputs;
}

/** The result of an event a player asked for: the new session, or why it was refused. */
export type SessionResult = { ok: true; session: GameSession } | { ok: false; error: ErrorCode; session: GameSession };

/** What a rule system can read on a step, besides the state and the elapsed time. */
export interface StepFrame {
  /** The latest input of each player. A player with no entry has sent nothing yet. */
  inputs: PlayerInputs;
  /** The room's seeded random source. */
  random: RandomSource;
}

/**
 * One rule that advances the state by `dt` seconds, such as movement, the journey model or
 * hazard damage. Systems run in order on every step while the run is being played.
 */
export type StepSystem = (state: GameState, dt: number, frame: StepFrame) => GameState;

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
    lobby: newLobby(),
    time: 0,
    players: {},
    items: {},
    hazards: {},
    journey: newJourney(),
  };
  return { state, director: createDirector(), inputs: {} };
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
  if (isRoomFull(state) || Object.keys(state.players).length >= roomSettings.maxPlayers) {
    return refuse(session, "roomFull");
  }

  const player = {
    id: playerId,
    name: cleanName,
    position: { x: spawn.x, y: spawn.y },
    facing: { dx: 1 as const, dy: 0 as const },
    heldItem: null,
    connected: true,
  };
  const joined = { ...state, players: { ...state.players, [playerId]: player } };
  // The first player to join becomes the host (#148).
  return accept({ ...session, state: withHost(joined) });
}

/** The same inputs without one player's entry. */
function withoutInput(inputs: PlayerInputs, playerId: PlayerId): PlayerInputs {
  if (!(playerId in inputs)) return inputs;
  const rest = { ...inputs };
  delete rest[playerId];
  return rest;
}

const DIRECTION_VALUES: readonly number[] = [-1, 0, 1];

/** True for an input whose fields have the shapes the contract allows. */
export function isValidInput(input: PlayerInput): boolean {
  return (
    typeof input.interacting === "boolean" &&
    DIRECTION_VALUES.includes(input.direction?.dx) &&
    DIRECTION_VALUES.includes(input.direction?.dy)
  );
}

/**
 * A player's held keys changed. The input is remembered until the next change and used on
 * every step. Refused for an unknown or disconnected player and for a malformed input.
 */
export function applyInput(session: GameSession, playerId: PlayerId, input: PlayerInput): SessionResult {
  const player = session.state.players[playerId];
  if (!player || !player.connected || !isValidInput(input)) return refuse(session, "invalidMessage");
  const stored: PlayerInput = {
    direction: { dx: input.direction.dx, dy: input.direction.dy },
    interacting: input.interacting,
  };
  return accept({ ...session, inputs: { ...session.inputs, [playerId]: stored } });
}

/** Only the movement directions of the inputs, for rules that do not need the rest. */
export function inputDirections(inputs: PlayerInputs): Record<PlayerId, Direction> {
  const directions: Record<PlayerId, Direction> = {};
  for (const [id, input] of Object.entries(inputs)) directions[id] = input.direction;
  return directions;
}

/** A player's connection dropped: they keep their seat, their item falls and their keys are released. */
export function disconnectFromSession(session: GameSession, playerId: PlayerId): GameSession {
  return {
    ...session,
    state: disconnectPlayer(session.state, playerId),
    inputs: withoutInput(session.inputs, playerId),
  };
}

/** A player left for good, or their seat timed out. */
export function leaveSession(session: GameSession, playerId: PlayerId): GameSession {
  return {
    ...session,
    // If the host left, the player who joined next becomes host (#148).
    state: withHost(removePlayer(session.state, playerId)),
    inputs: withoutInput(session.inputs, playerId),
  };
}

/** Starts the run from the lobby; refused with `notEnoughPlayers` unless two to four players are connected. */
export function startSession(session: GameSession): SessionResult {
  if (session.state.phase !== "lobby") return refuse(session, "gameInProgress");
  if (!canStartRun(session.state)) return refuse(session, "notEnoughPlayers");
  const state = startRun(session.state);
  return accept({ state, director: createDirector(crewSize(state)), inputs: {} });
}

/**
 * The host changes the crew size in the lobby (#148): 2 to 4, never below the players
 * already in the room. Refused for anyone but the host and outside the lobby.
 */
export function configureRoom(session: GameSession, playerId: PlayerId, crewSize: number): SessionResult {
  const { state } = session;
  if (state.phase !== "lobby") return refuse(session, "gameInProgress");
  if (state.lobby.hostId !== playerId) return refuse(session, "notHost");
  if (!isValidCrewSize(state, crewSize)) return refuse(session, "invalidMessage");
  return accept({ ...session, state: { ...state, lobby: { ...state.lobby, crewSize } } });
}

/**
 * The host departs (`startGame`, or the departure lever in #153): starts the run once the
 * crew is complete. The room calls this rather than `startSession`, which does not check
 * who asked.
 */
export function departSession(session: GameSession, playerId: PlayerId): SessionResult {
  const { state } = session;
  if (state.phase !== "lobby") return refuse(session, "gameInProgress");
  if (state.lobby.hostId !== playerId) return refuse(session, "notHost");
  if (!canDepart(state, playerId)) return refuse(session, "notEnoughPlayers");
  return startSession(session);
}

/** "Play again" after a run has ended: the same crew goes back to the lobby. */
export function playAgain(session: GameSession): SessionResult {
  const state = returnToLobby(session.state);
  if (state === session.state) return refuse(session, "invalidMessage");
  return accept({ state, director: createDirector(), inputs: {} });
}

/**
 * Advances the room by `dt` seconds. While the run is being played: the clock, then the
 * given systems in order, then the hazard director, then the win/lose check.
 * Outside the "playing" phase nothing changes.
 */
export function stepSession(session: GameSession, dt: number, context: StepContext): GameSession {
  if (session.state.phase !== "playing" || dt <= 0) return session;

  const frame: StepFrame = { inputs: session.inputs, random: context.random };
  let state = advanceRunClock(session.state, dt);
  for (const system of context.systems ?? []) state = system(state, dt, frame);

  const directed = stepDirector(session.director, state, context.spots, dt, context.random);
  return { ...session, state: evaluateOutcome(directed.state), director: directed.director };
}
