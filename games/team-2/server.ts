import { startGameServer } from "@sdm/host";
import config from "./config/game.json" with { type: "json" };
import { rooms } from "./room/index.ts";

// Port (PORT, default 2567) and environment (APP_ENV) are read by the host.
await startGameServer({ gameId: "team-2", config, rooms });
