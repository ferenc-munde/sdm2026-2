// The waiting room's logic, without the DOM (#146).
//
// Pure functions over `GameState.lobby` and the players, so the crew list, the
// host badge, the crew-size options and the departure button can be tested.

import { MAX_PLAYERS, MIN_PLAYERS } from "../shared/constants.ts";
import { canDepart, isValidCrewSize } from "../shared/run/lobby.ts";
import type { GameState, PlayerId } from "../shared/types.ts";

/** One row of the crew list. */
export interface CrewMember {
  id: PlayerId;
  name: string;
  connected: boolean;
  host: boolean;
}

export interface CrewSizeOption {
  size: number;
  /** False below the players already in the room (the rules forbid shrinking past them). */
  enabled: boolean;
}

export interface WaitingView {
  code: string;
  crew: CrewMember[];
  /** Players in the room, including disconnected seats. */
  seats: number;
  /** Players currently connected. */
  connected: number;
  crewSize: number;
  isHost: boolean;
  /** True when the connected players match the crew size. */
  complete: boolean;
  /** True when this player may depart right now (host + complete + lobby). */
  canDepart: boolean;
  sizeOptions: CrewSizeOption[];
}

/** Everything the waiting room shows, derived from one room state. */
export function waitingView(state: GameState, me: PlayerId): WaitingView {
  const crew: CrewMember[] = Object.values(state.players).map((player) => ({
    id: player.id,
    name: player.name,
    connected: player.connected,
    host: player.id === state.lobby.hostId,
  }));

  const connected = crew.filter((member) => member.connected).length;
  const sizeOptions: CrewSizeOption[] = [];
  for (let size = MIN_PLAYERS; size <= MAX_PLAYERS; size += 1) {
    sizeOptions.push({ size, enabled: isValidCrewSize(state, size) });
  }

  return {
    code: state.roomCode,
    crew,
    seats: crew.length,
    connected,
    crewSize: state.lobby.crewSize,
    isHost: state.lobby.hostId === me,
    complete: connected === state.lobby.crewSize,
    canDepart: canDepart(state, me),
    sizeOptions,
  };
}

/** The line under the crew size: what the host is waiting for. */
export function waitingHint(view: WaitingView): string {
  if (view.complete) {
    return view.isHost ? "Crew complete. Walk to the departure lever or press Depart." : "Waiting for the host to depart.";
  }
  const missing = view.crewSize - view.connected;
  return `Waiting for ${missing} more player${missing === 1 ? "" : "s"}.`;
}
