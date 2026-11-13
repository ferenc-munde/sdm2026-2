# `@sdm/gateway`

The only public service of an environment: one address, one path per game. Every game stays its own private service, so a crash in one game never takes the others down.

| Request | What happens |
|---|---|
| `/` | An index of the games, with the ones not released yet marked |
| `/health` | The gateway's own health |
| `/<game>` | Redirect to `/<game>/` |
| `/<game>/rest` | Proxied to the game's private address, WebSocket upgrades included; the `/<game>` prefix is removed |
| anything else | 404; a game that cannot be reached gives 502 |

Settings (environment variables): `GAMES` (the games it serves), `PLANNED_GAMES` (listed as "not released yet"), `UPSTREAM_PORT`, `PORT`, `APP_ENV`.

Built after the first game runs on Railway (step 6 of the [build order](../README.md#build-order)). Games must work under a path prefix: the client connects to `<address>/team-N`.
