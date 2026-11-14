# `@sdm/gateway`

The only public service of an environment: one address, one path per game. Every game stays its own private service, so a crash in one game never takes the others down.

| Request | What happens |
|---|---|
| `/` | An index of the games, with the ones not released yet marked |
| `/health` | The gateway's own health |
| `/<game>` | Redirect to `/<game>/` |
| `/<game>/rest` | Proxied to the game's private address, WebSocket upgrades included; the `/<game>` prefix is removed |
| anything else | 404; a game that cannot be reached gives 502 |

Settings (environment variables): `GAMES` (the games it serves, comma separated), `PLANNED_GAMES` (listed as "not released yet"), `UPSTREAM_PORT` (the port every game listens on, default 8080), `PORT` (default 8080), `APP_ENV`, and optionally `UPSTREAM_<GAME>` (for example `UPSTREAM_TEAM_1=http://localhost:2801`) to point one game at another address, for running the gateway on your machine. A game `team-1` is reached at `http://team-1.railway.internal:<UPSTREAM_PORT>`, the private address of the Railway service named `team-1`.

## Two ways to run it

- **One service for the whole monorepo (what `railway.json` does):** `pnpm --filter ./server/gateway run start:all` starts every game in `games/` that has a `server` script as its own process on an internal port (`GAME_PORT_BASE`, default 8101, counting up), restarts a game that crashes, and runs the gateway on `$PORT` in front of them. One Railway service, one domain: `https://<domain>/team-1/`, `/team-2/`, `/team-3/`. `GAMES` limits the games, `GAMES_DIR` points at another `games/` folder.
- **Gateway only:** `pnpm --filter ./server/gateway run start` serves games that run as their own services and are reached by their private address (see the settings above).

Games must work under a path prefix: the build uses `--base=./` (the `railway.json` build does) and the client connects to `<address>/team-N`, which `serverAddress()` from `@sdm/core/client` already does.
