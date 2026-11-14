// Moving between the platform and the train (#148). In the lobby the crew walks on the
// platform; when the host departs, everyone boards the train at its player starts and the
// tools go on their racks; after "play again" the crew is back on the platform.

import { DEPART_COUNTDOWN_SECONDS } from "../constants.ts";
import { createStartItems } from "../items/items.ts";
import type { TrainMap } from "../map/map.ts";
import { platformSpawn, type PlatformMap } from "../map/platform.ts";
import { stepMovement } from "../movement/movement.ts";
import {
  createPlatformPractice,
  isNearDepartureLever,
  isNearPracticeObject,
  platformPracticeView,
  stepPlatformPractice,
  useDepartureLever,
  usePracticeObject,
  type PlatformPractice,
} from "../stations/platform.ts";
import type { GameState, PlayerId, Vec2 } from "../types.ts";
import { canDepart } from "./lobby.ts";
import { departSession, inputDirections, playAgain, type GameSession, type SessionResult } from "./session.ts";

/** Puts every player at the start for their seat (join order) from `spawnFor`. */
function placePlayers(state: GameState, spawnFor: (seat: number) => Vec2): GameState {
  const players: GameState["players"] = {};
  Object.values(state.players).forEach((player, seat) => {
    players[player.id] = { ...player, position: spawnFor(seat), facing: { dx: 1, dy: 0 } };
  });
  return { ...state, players };
}

/** Walks the crew around the platform by their inputs while the room is in the lobby. */
export function stepLobby(session: GameSession, dt: number, platform: PlatformMap): GameSession {
  if (session.state.phase !== "lobby" || dt <= 0) return session;
  const state = stepMovement(session.state, inputDirections(session.inputs), dt, platform);
  return state === session.state ? session : { ...session, state };
}

/**
 * The host departs and the crew boards: starts the run (host only, crew complete; see
 * departSession), puts every player at the train's start for their seat and places the
 * wrench and extinguisher on their racks.
 */
export function departAndBoard(session: GameSession, playerId: PlayerId, train: TrainMap): SessionResult {
  const result = departSession(session, playerId);
  if (!result.ok) return result;
  const fallback = train.playerSpawns[0] ?? { x: 0, y: 0 };
  const boarded = placePlayers(result.session.state, (seat) => ({ ...(train.playerSpawns[seat] ?? fallback) }));
  return { ok: true, session: { ...result.session, state: { ...boarded, items: createStartItems(train) } } };
}

/** "Play again": the same crew goes back to the lobby and stands on the platform again. */
export function playAgainOnPlatform(session: GameSession, platform: PlatformMap): SessionResult {
  const result = playAgain(session);
  if (!result.ok) return result;
  const onPlatform = placePlayers(result.session.state, (seat) => platformSpawn(platform, seat));
  return { ok: true, session: { ...result.session, state: { ...onPlatform, items: {} } } };
}

/** Server-owned lobby state: the real room plus its deliberately isolated practice state. */
export interface PlatformLobbySession {
  session: GameSession;
  practice: PlatformPractice;
  /** Seconds left on the host's departure countdown (#385); null when not counting. */
  departingIn: number | null;
  /** Who asked to depart; the host at request time. */
  departingBy: PlayerId | null;
}

export type PlatformActionResult =
  | { ok: true; platform: PlatformLobbySession }
  | { ok: false; platform: PlatformLobbySession; message: string };

export function createPlatformLobby(session: GameSession, platform: PlatformMap): PlatformLobbySession {
  return { session, practice: createPlatformPractice(platform.objects), departingIn: null, departingBy: null };
}

/** Starts the host's 5-second departure countdown (#385); a second request is ignored. */
export function startDepartCountdown(current: PlatformLobbySession, playerId: PlayerId): PlatformLobbySession {
  if (current.departingIn !== null) return current;
  return { ...current, departingIn: DEPART_COUNTDOWN_SECONDS, departingBy: playerId };
}

/**
 * One authoritative lobby tick: walk, advance held practice repairs, and run the departure
 * countdown. At zero the host's departure is applied; if it is no longer allowed (a player left)
 * the countdown is cancelled.
 */
export function stepPlatformLobby(
  current: PlatformLobbySession,
  dt: number,
  platform: PlatformMap,
  train: TrainMap,
): PlatformLobbySession {
  const session = stepLobby(current.session, dt, platform);
  const interactions = Object.fromEntries(Object.entries(session.inputs).map(([id, input]) => [id, input.interacting]));
  const practice = stepPlatformPractice(session.state, current.practice, interactions, dt, platform.objects);

  if (current.departingIn !== null) {
    const remaining = current.departingIn - Math.max(0, dt);
    // A tiny epsilon: 5 - 100 × 0.05 lands on ~1e-15, which must still count as zero.
    if (remaining > 1e-6) return { ...current, session, practice, departingIn: remaining };
    const by = current.departingBy;
    if (by) {
      const departure = departAndBoard(session, by, train);
      if (departure.ok) {
        // Carrying the held keys across the phase change matters as much here as in handleMessage (#385):
        // otherwise a player still holding a direction stands frozen on the train.
        const inputs = Object.fromEntries(
          Object.entries(session.inputs).filter(([id]) => departure.session.state.players[id]?.connected),
        );
        return { session: { ...departure.session, inputs }, practice, departingIn: null, departingBy: null };
      }
    }
    // The host left or the crew is no longer complete: cancel and let the lobby show why.
    return { ...current, session, practice, departingIn: null, departingBy: null };
  }

  return session === current.session && practice === current.practice ? current : { ...current, session, practice };
}

/** State synced while waiting: real lobby data plus isolated practice objects. */
export function platformLobbyView(current: PlatformLobbySession, platform: PlatformMap): GameState {
  const view = platformPracticeView(current.session.state, current.practice, platform.objects);
  return { ...view, lobby: { ...view.lobby, departingIn: current.departingIn } };
}

/** Uses the real departure rule at the lever; otherwise operates practice objects. */
export function usePlatformAction(
  current: PlatformLobbySession, playerId: PlayerId, platform: PlatformMap, train: TrainMap,
): PlatformActionResult {
  if (isNearDepartureLever(current.session.state, playerId, platform.objects)) {
    const result = useDepartureLever(
      current.session, current.session.state, current.session.state.lobby.hostId, playerId, platform.objects,
      {
        canDepart: (session, id) => canDepart(session.state, id),
        start: (session, id) => {
          const departure = departAndBoard(session, id, train);
          if (departure.ok) return { ok: true as const, session: departure.session };
          const message = departure.error === "notHost" ? "Only the host can depart"
            : departure.error === "notEnoughPlayers" ? "Waiting for the crew" : departure.error;
          return { ok: false as const, session, message };
        },
      },
    );
    return result.ok
      ? { ok: true, platform: { ...current, session: result.session } }
      : { ok: false, platform: current, message: result.message };
  }
  // A player carrying a practice item can always drop it, wherever they stand.
  const carrying = Object.values(current.practice.items).some((item) => item.heldBy === playerId);
  if (!carrying && !isNearPracticeObject(current.session.state, playerId, platform.objects)) {
    return { ok: false, platform: current, message: "Action unavailable" };
  }
  const practice = usePracticeObject(current.session.state, current.practice, playerId, platform.objects);
  return practice === current.practice
    ? { ok: false, platform: current, message: "Walk to a platform object" }
    : { ok: true, platform: { ...current, practice } };
}
