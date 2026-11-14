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

## What is built

- **Replays:** every room runs on a `Simulation` from `@sdm/core/server`, which records join, leave, drop, reconnect, input and debug events with the room's seed. `GET /api/replays/:roomId` returns the replay of a live room or of one of the last 20 closed rooms (in memory). `runReplay()` re-runs a replay headless and checks the final state hash.
- **Bug reports:** `POST /api/bug-reports` (`{ roomId?, message }`, at most 5 per minute per client address) stores the report with a copy of the room's replay; `GET /api/bug-reports/:id` reads it. In memory, the oldest of 200 are dropped.
- **Stats:** `GET /api/stats` returns process stats (rooms, players, memory, event loop lag) and per-room counters (ticks, late ticks, tick time, inputs applied, rejected and dropped, reconnects). The same numbers are logged every 10 seconds per room and every 30 seconds for the process.
- **Inputs:** an invalid input gets a `notice` and is not applied; ten invalid inputs in a row remove the client. A client may send 100 inputs per second, the rest are dropped.
- **Crashes:** an exception in `step` is logged with the replay address (`/api/replays/:roomId`), the players get a notice and the room closes. Its replay stays available.
- **Client:** the folder in `clientDir` or `$CLIENT_DIR` is served from the same origin; without either, `./dist` or `./client/dist` (the first that holds an `index.html`).

Not built yet: persistent storage of replays and bug reports (they are lost on restart).
