# `@sdm/host`

The game server host every game runs on. A game's `server.ts` calls `startGameServer()` and gets one process with Colyseus (rooms over WebSocket) and Express (HTTP) on one port, serving the game's built client from the same origin.

What goes in it (`src/`):

| Part | What it does |
|---|---|
| `startGameServer()` | Starts Colyseus + Express on `$PORT`, registers the game's rooms, serves the built client |
| `createGameRoom(game, deps)` | The Colyseus room shell around a `GameDefinition`: fixed tick, room codes, reconnection, debug commands (rejected in production), stats, logs, error handling |
| Routes | `GET /health`, `POST /api/rooms/join`, `GET /api/replays/:roomId`, `POST/GET /api/bug-reports`, `GET /api/stats` (see [../ARCHITECTURE.md](../ARCHITECTURE.md#http-routes-sdmhost)) |
| Logging and stats | Structured JSON logs with `env`, `sha`, `game` on every line; room and process stats |
| `@sdm/host/testing` | Helpers for room tests: boot a server on a free port, capture logs |

`createGameRoom` lives here, not in `@sdm/core`, so every room shares the host's single copy of the Colyseus runtime.
