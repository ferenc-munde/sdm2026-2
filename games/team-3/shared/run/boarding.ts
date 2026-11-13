// Moving between the platform and the train (#148). In the lobby the crew walks on the
// platform; when the host departs, everyone boards the train at its player starts and the
// tools go on their racks; after "play again" the crew is back on the platform.

import { createStartItems } from "../items/items.ts";
import type { TrainMap } from "../map/map.ts";
import { platformSpawn, type PlatformMap } from "../map/platform.ts";
import { stepMovement } from "../movement/movement.ts";
import type { GameState, PlayerId, Vec2 } from "../types.ts";
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
