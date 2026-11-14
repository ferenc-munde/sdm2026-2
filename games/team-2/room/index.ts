// Room registration for the platform host (`startGameServer({ rooms })`).
//   game         the game itself: the platform room shell running the Last Train rules
//   train_lobby  the team's private waiting room (room code, crew, full-room start, host departure)
import type { Room } from "colyseus";
import { GAME_ROOM_NAME } from "@sdm/core/shared";
import { createGameRoom, type HostDeps } from "@sdm/host";
import { lastTrain } from "../shared/game.ts";
import { LOBBY_ROOM_NAME } from "../shared/lobby.ts";
import { TrainLobbyRoom } from "./lobby-room.ts";

export const rooms: Record<string, (deps: HostDeps) => new () => Room<any>> = {
	[GAME_ROOM_NAME]: (deps) => createGameRoom(lastTrain, deps),
	[LOBBY_ROOM_NAME]: () => TrainLobbyRoom,
};
