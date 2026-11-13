// Room registration for the platform host (`startGameServer({ rooms })`).
//   game         the game itself: the platform room shell running the Last Train rules
//   train_lobby  the team's own waiting room (crew size, countdown, host departure)
import { matchMaker, type Room } from "colyseus";
import { GAME_ROOM_NAME } from "@sdm/core/shared";
import { createGameRoom, type HostDeps } from "@sdm/host";
import { lastTrain } from "../shared/game.ts";
import { LOBBY_ROOM_NAME } from "../shared/lobby.ts";
import { TrainLobbyRoom } from "./lobby-room.ts";

export const rooms: Record<string, (deps: HostDeps) => new () => Room<any>> = {
	[GAME_ROOM_NAME]: (deps) => createGameRoom(lastTrain, deps),
	[LOBBY_ROOM_NAME]: () => TrainLobbyRoom,
};

/**
 * Call once after `startGameServer()`. The host registers rooms without matchmaking filters, but
 * the lobby needs one: `joinOrCreate("train_lobby", { teamSize })` must only find lobbies of that
 * crew size, otherwise a crew of 4 lands in a lobby for 2 and is refused.
 */
export function configureMatchmaking(): void {
	matchMaker.getHandler(LOBBY_ROOM_NAME)?.filterBy(["teamSize"]);
}
