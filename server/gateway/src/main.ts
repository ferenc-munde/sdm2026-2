// Starts the gateway from environment variables (see ../README.md):
// GAMES=team-1,team-2,team-3  PLANNED_GAMES=team-4  UPSTREAM_PORT=8080  PORT=8080  APP_ENV=production
// UPSTREAM_TEAM_1=http://localhost:2801 points one game at another address (for running the gateway locally).
import { createGateway } from "./gateway";

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

const games = list(process.env.GAMES);
const planned = list(process.env.PLANNED_GAMES);
const upstreamPort = process.env.UPSTREAM_PORT ?? "8080";
const port = Number(process.env.PORT ?? 8080);
const base = { env: process.env.APP_ENV ?? "local", sha: process.env.COMMIT_SHA ?? "unknown", game: "gateway" };
const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ ...base, ...fields }));

if (games.length === 0) {
  log({ level: "error", message: "GAMES is empty: set it to the games to serve, for example team-1,team-2,team-3" });
  process.exit(1);
}

const server = createGateway({
  games,
  planned,
  // Every game is its own Railway service, reachable on the private network by its service name.
  upstream: (game) =>
    new URL(process.env[`UPSTREAM_${game.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`] ?? `http://${game}.railway.internal:${upstreamPort}`),
  log,
});

server.listen(port, () => log({ level: "info", message: "gateway listening", port, games, planned }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
