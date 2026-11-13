// Starts The Last Train on the platform host (#80): `pnpm run server`.
// The host reads PORT, APP_ENV and COMMIT_SHA from the environment.
import { startGameServer } from "@sdm/host";
import config from "./config/game.json" with { type: "json" };
import { rooms } from "./room/index.ts";
import { GAME_ID } from "./shared/index.ts";

await startGameServer({ gameId: GAME_ID, config, rooms });
