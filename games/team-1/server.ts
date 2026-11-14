// Starts The Last Train (Team 1) on the platform host: `pnpm run dev:server`.
// The host reads PORT (default 2567), APP_ENV and COMMIT_SHA from the environment.
import { startGameServer } from "@sdm/host";
import config from "./config/game.json";
import { rooms } from "./room/index";
import { GAME_ID } from "./shared/constants";

await startGameServer({ gameId: GAME_ID, config, rooms });
