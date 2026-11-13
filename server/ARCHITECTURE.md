# Architecture

> **Target architecture.** This describes how the system is built. The repository is a skeleton: the platform team and the game teams build these parts during the hackathon. Each folder's `README.md` says what goes in it.

Every team builds its own real-time multiplayer browser game in `games/team-N/`. All games share one platform in `server/`: the same server host, contract, tooling and CI.

```
repo root            pnpm workspace (package.json, pnpm-workspace.yaml, lint/format and test config)
├─ games/team-N/     one package per team: client/, room/, shared/, config/, server.ts
├─ course/           course information and the team roster (instructors)
└─ server/           platform (owned by the platform team)
   ├─ core/          @sdm/core      contract, sim contract, Simulation + replays, client core
   ├─ host/          @sdm/host      Colyseus + Express host, createGameRoom, routes, logs
   ├─ gateway/       @sdm/gateway   the one public address, a path per game
   ├─ template/      @sdm/template  reference game that teams copy
   ├─ tooling/       @sdm/tooling   shared TypeScript config, scripts and checks
   └─ docs/          platform documentation
```

## Runtime

Each game deploys as **one service**: its `server.ts` calls `startGameServer()`, which runs Colyseus (game rooms over WebSocket) and Express (HTTP) on one port and serves the game's built client from the same origin. The client therefore connects to its own origin in deployed environments, with no CORS or per-environment URLs. In local development the client runs on Vite (:5173) and connects to the server on :2567.

The server is authoritative: clients send inputs, never state. Rooms advance in fixed ticks, use a seeded random generator, and record every event, so any room can be replayed exactly.

## Rooms: game definition → Simulation → room

| Layer | Where | What it does |
|---|---|---|
| Game definition | `games/team-N/shared/` | Pure, browser-safe rules: `createState`, `init`, `join`, `leave`, `step`, optional `disconnect`/`reconnect` and debug `commands`. Implements `GameDefinition` from `@sdm/core/sim`. |
| Simulation | `@sdm/core/server` | Applies and records every event (join, leave, drop, reconnect, input, debug). A replay runner drives the same class headless, so a replay re-runs to the same state hash. |
| Room | `@sdm/host` `createGameRoom()` | Colyseus shell: fixed tick, room codes, reconnection, debug commands (rejected in production), stats, logs, error handling. |

Every game state extends `BaseState` (`tick`, `code`, `paused`, `seats` with `connected` and `lastSeq`). Every game config extends `RoomSettingsSchema` (`tickRate`, `patchRate`, `maxPlayers`, `reconnectSeconds`) and lives in `games/team-N/config/game.json`.

`createGameRoom` lives in `@sdm/host`, not `@sdm/core`, so every room shares the host's single copy of the Colyseus runtime.

## HTTP routes (`@sdm/host`)

| Route | What it does |
|---|---|
| `GET /health` | `ok`, environment, commit SHA, start time |
| `POST /api/rooms/join` | `{code}` → `{roomId}`; 404 unknown, 409 full |
| `GET /api/replays/:roomId` | Replay download for a live or recently finished room (kept in memory) |
| `POST /api/bug-reports`, `GET /api/bug-reports/:id` | Bug reports with a copy of the room's replay, rate-limited per IP |
| `GET /api/stats` | Process and per-room stats |

## The contract (`@sdm/core/shared`)

| Module | Defines |
|---|---|
| `env` | `AppEnv` (`local`, `development`, `production`), `HealthResponse`, `isDebugEnabled()` |
| `messages` | WebSocket message names, HTTP routes, input envelope, debug commands, bug reports |
| `replay` | Replay file format |
| `random` | `SeededRandom` |

Each game adds its own contract in `games/team-N/shared/`: Colyseus state schema, input schema and config schema.

## Observability

Structured JSON logs (for example pino) that Railway's log explorer can filter: every line has `env`, `sha` and `game`; room lines add `roomId`, `code`, `tick` and `playerId`. Rooms log periodic stats (tick time, late ticks, inputs, patches, reconnects), the process logs its own (rooms, players, event-loop lag, memory). An exception in game code is logged with the replay URL, players get a notice, and the room closes.

## Gateway (`@sdm/gateway`)

One address, one path per game. The gateway is the only public service of an environment; every game is its own service on Railway's private network, so a crash in one game never takes the others down, and merging one team's game redeploys only that team's service.

| Request | What happens |
|---|---|
| `/` | An index of the games, with the ones not released yet marked |
| `/health` | The gateway's own health |
| `/<game>` | Redirect to `/<game>/` |
| `/<game>/rest` | Proxied to the game's private address, WebSocket upgrades included; the `/<game>` prefix is removed |
| anything else | 404; a game that cannot be reached gives 502 |

## Environments (Railway)

Railway project `sdm2026-2`, separate from Team 10's `sdm2026-1` project (see the instructors' setup issues). The gateway plus one service per game, one replica each.

| Environment | Deploys | `APP_ENV` |
|---|---|---|
| development | `main`, after CI passed on the commit | `development` |
| production | `prod`, through a reviewed release PR from `main` | `production` |

- Infrastructure is code, defined in one reviewed file, and changed only through a platform PR. **Never apply it while linked to another Railway project.**
- Only the gateway has a public domain. Games are reached through it at `<address>/team-N`.
- Secrets live in Railway variables, never in the repository.
