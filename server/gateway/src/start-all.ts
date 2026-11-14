// Runs the whole monorepo as ONE service: every game in games/ as its own process on an internal port,
// and the gateway on $PORT in front of them, so `https://<domain>/team-N/` reaches each game.
//   PORT=8080  APP_ENV=production  GAMES=team-1,team-2 (default: every game in games/)
//   PLANNED_GAMES=team-4  GAME_PORT_BASE=8101  GAMES_DIR=/path/to/games
import { fileURLToPath } from "node:url";
import { createGateway } from "./gateway";
import { assignPorts, discoverGames } from "./games";
import { supervise, type Supervised } from "./supervisor";

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

const gamesDir = process.env.GAMES_DIR ?? fileURLToPath(new URL("../../../games", import.meta.url));
const games = list(process.env.GAMES).length > 0 ? list(process.env.GAMES) : discoverGames(gamesDir);
const planned = list(process.env.PLANNED_GAMES);
const port = Number(process.env.PORT ?? 8080);
const ports = assignPorts(games, Number(process.env.GAME_PORT_BASE ?? 8101));
const base = { env: process.env.APP_ENV ?? "local", sha: process.env.COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown", game: "gateway" };
const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ ...base, ...fields }));

if (games.length === 0) {
  log({ level: "error", message: `no game found: ${gamesDir} has no folder with a "server" script, and GAMES is empty` });
  process.exit(1);
}

const running: Supervised[] = games.map((name) =>
  supervise(
    {
      name,
      command: "pnpm",
      args: ["--filter", `./games/${name}`, "run", "server"],
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
      env: { PORT: String(ports[name]), APP_ENV: base.env, COMMIT_SHA: base.sha },
    },
    { log },
  ),
);

const server = createGateway({
  games,
  planned,
  upstream: (name) => new URL(`http://127.0.0.1:${ports[name]}`),
  log,
});
server.listen(port, () => log({ level: "info", message: "gateway listening", port, games, ports, planned }));

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  server.close();
  await Promise.all(running.map((process_) => process_.stop()));
  process.exit(0);
};
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void shutdown());
