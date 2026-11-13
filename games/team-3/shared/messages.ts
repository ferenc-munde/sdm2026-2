// Messages between client and server, sent as JSON over the WebSocket.
// Every message has a `type` field so it can be switched on.
//
// Note: the platform's room base (@sdm/host, #8) owns room codes, seats, reconnection,
// the tick and state sync. Once we connect to it, createRoom, joinRoom, joined and state
// (and GameState.roomCode) will probably be replaced by the platform's own versions.
// They stay here until then so the client and the room can be built against them.

import type { Direction, GameState, PlayerId } from "./types.ts";

// --- Client to server ---

export interface CreateRoomMessage {
  type: "createRoom";
  name: string;
}

export interface JoinRoomMessage {
  type: "joinRoom";
  name: string;
  code: string;
}

/** The host departs: starts the run once the crew is complete (#148). Refused for anyone else. */
export interface StartGameMessage {
  type: "startGame";
}

/** The host changes the pre-game setup in the lobby (#148). */
export interface ConfigureRoomMessage {
  type: "configureRoom";
  /** How many players the crew will have, from MIN_PLAYERS to MAX_PLAYERS. */
  crewSize: number;
}

/** Sent whenever the held movement keys change. */
export interface InputMessage {
  type: "input";
  direction: Direction;
  /** True while the interact key is held (repair, extinguish, steer). */
  interacting: boolean;
}

/** Pick up the nearest item or take from a station; drop if already holding. */
export interface PickUpOrDropMessage {
  type: "pickUpOrDrop";
}

/** Stretch (#29): throw the held item in the facing direction. */
export interface ThrowMessage {
  type: "throw";
}

export interface PlayAgainMessage {
  type: "playAgain";
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | StartGameMessage
  | ConfigureRoomMessage
  | InputMessage
  | PickUpOrDropMessage
  | ThrowMessage
  | PlayAgainMessage;

// --- Server to client ---

export interface JoinedMessage {
  type: "joined";
  code: string;
  playerId: PlayerId;
}

/** Full state, broadcast every tick. */
export interface StateMessage {
  type: "state";
  state: GameState;
}

export type ErrorCode =
  | "roomNotFound"
  | "roomFull"
  | "gameInProgress"
  | "invalidName"
  | "invalidMessage"
  /** A run needs at least MIN_PLAYERS connected players to start. */
  | "notEnoughPlayers"
  /** Only the host can change the room setup or depart (#148). */
  | "notHost";

export interface ErrorMessage {
  type: "error";
  code: ErrorCode;
  message: string;
}

export type ServerMessage = JoinedMessage | StateMessage | ErrorMessage;

export type ClientMessageType = ClientMessage["type"];
export type ServerMessageType = ServerMessage["type"];
