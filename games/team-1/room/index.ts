// Room registration for the platform host (issue #240). No game rules here: they live in shared/.
import { createGameRoom, GAME_ROOM_NAME, type HostDeps } from "@sdm/host";
import { lastTrain } from "../shared/game";

export const rooms = {
  [GAME_ROOM_NAME]: (deps: HostDeps) => createGameRoom(lastTrain, deps),
};
