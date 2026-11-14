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

Start it with `pnpm --filter ./server/gateway run start` (the root `railway.json` does this for the service without a `GAME` variable). Games must work under a path prefix: build their client with `--base=./` (the `railway.json` build does) and connect to `<address>/team-N`, which `serverAddress()` from `@sdm/core/client` already does.
