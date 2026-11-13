// Room registration for the platform host (#80). No game rules here: they live in shared/.
import { createGameRoom, GAME_ROOM_NAME, type HostDeps } from "@sdm/host";
import { lastTrain } from "../shared/game.ts";

export const rooms = {
  [GAME_ROOM_NAME]: (deps: HostDeps) => createGameRoom(lastTrain, deps),
};
