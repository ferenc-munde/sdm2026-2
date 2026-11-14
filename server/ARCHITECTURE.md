# Architecture

> **Target architecture.** This describes how the system is built. The repository is a skeleton: the platform team and the game teams build these parts during the hackathon. Each folder's `README.md` says what goes in it. [Current status](#current-status) shows what exists so far.

Every team builds its own real-time multiplayer browser game in `games/team-N/`. All games share one platform in `server/`: the same server host, contract, tooling and CI.

## Current status

What has been done so far:

| Area | Status |
|---|---|
| Repository skeleton | Done: rules (`CLAUDE.md`), getting started guide, `server/` structure with a README per package, `games/team-1` to `team-4` folders, course info |
| Team roster | Done: `course/teams.json` lists instructors, students and their team |
| Branches | Done: `main` → `staging` → `development` → `Team_1_Feature`, `Team_2_Feature`, `Team_3_Feature` (see [Branch structure](#branch-structure)) |
| Repository skeleton | Done: rules (`CLAUDE.md`), getting started guide, `server/` structure with a README per package, `games/team-1` to `team-3` folders, course info |
| Team roster | Done: `course/teams.json` lists instructors, students and their team |
| Branches | Done: `main` (production), `staging`, `development`, `Team_1_Feature`, `Team_2_Feature`, `Team_3_Feature`. Work flows `Team_N_Feature` → `development` → `staging` → `main` (see [Branch structure](#branch-structure)) |
| CI workflows | In progress (platform team, build-order step 2): GitHub Actions on every PR |
| Workspace (`package.json`, `pnpm-workspace.yaml`, TypeScript config) | Not started (build-order step 1) |
| `@sdm/core`, `@sdm/host`, `@sdm/template` | Not built: only the README of each package exists |
| `@sdm/gateway`, Railway environments | Not built, nothing is deployed |
| Game teams | Planning: project plans, specs and package skeletons are in review (for example Team 2, PRs #75 and #85) |

The game teams are blocked on `@sdm/core`, `@sdm/host` and `@sdm/template` before they can write their game rules. Team 2 asked for them in issue #73. The build order is in [README.md](README.md#build-order).

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

## Branch structure

Branches created so far. `staging` was cut from `main`, `development` from `staging`, and the feature branches from `development`, so every team has its own branch to put its work on:

```
main
└─ staging
   └─ development
      ├─ Team_1_Feature
      ├─ Team_2_Feature
      └─ Team_3_Feature
```

| Branch | Purpose |
|---|---|
| `main` | Root branch of the repository |
| `staging` | Created from `main` |
| `development` | Created from `staging`; integration branch for the teams |
| `Team_N_Feature` | Created from `development`; the branch a team works on and puts its stuff in |

Teams commit to their own `Team_N_Feature` branch and merge into `development` through a PR. Only three feature branches exist so far; `Team_4_Feature` is not created yet.

The repository rules in [../CLAUDE.md](../CLAUDE.md#2-branch) still describe short-lived `<team-label>/<issue-number>-<short-description>` branches and PRs into `main`. Which base branch those PRs target (`Team_N_Feature`, `development` or `main`) is still to be decided and then written into `CLAUDE.md`.

## Environments (Railway)

> **Not set up yet.** This is the target. Which branch deploys to which environment has to be aligned with the [branch structure](#branch-structure) above.
`main` is production. Below it is `staging`, below that `development`, and below that one feature branch per team:

```
main                      production (prod)
└─ staging                release candidate
   └─ development         integration of all teams
      ├─ Team_1_Feature
      ├─ Team_2_Feature
      └─ Team_3_Feature   one integration branch per team
         └─ team-3/<issue>-<description>   short-lived work branch, one per issue
```

Work moves **upwards only**, one reviewed pull request per step:

```
team-N/<issue>-<description>  →  Team_N_Feature  →  development  →  staging  →  main
```

| Branch | Purpose | Receives pull requests from |
|---|---|---|
| `main` | Production: the stable, released state | `staging` only |
| `staging` | Release candidate, checked before it goes to production | `development` only |
| `development` | Integration branch for all teams | `Team_N_Feature`, and `platform` and `team-instructor` work branches |
| `Team_N_Feature` | Team N's integration branch | Team N's work branches (`team-N/<issue>-<description>`) |

Rules:

- **A feature branch goes into `development`.** `Team_N_Feature` is never merged into `staging` or `main` directly, and a team's work branch is never merged into anything but its own `Team_N_Feature`.
- Nobody commits directly to `main`, `staging`, `development` or `Team_N_Feature`: they change only through merged pull requests.
- `platform` and `team-instructor` have no feature branch. Their work branches start from `development` and their pull requests go into `development`.
- A team keeps its `Team_N_Feature` up to date by merging `development` into it.

The same rules, with the commit and pull request format, are in [../CLAUDE.md](../CLAUDE.md#branches).

## Environments (Railway)

> **Not set up yet.** This is the target.

Railway project `sdm2026-2`, separate from Team 10's `sdm2026-1` project (see the instructors' setup issues). The gateway plus one service per game, one replica each.

| Environment | Deploys | `APP_ENV` |
|---|---|---|
| development | `development`, after CI passed on the commit | `development` |
| production | `main`, through a reviewed promotion PR from `staging` | `production` |

`staging` has no environment of its own yet: it is the release candidate that CI checks before the promotion to `main`.

- Infrastructure is code, defined in one reviewed file, and changed only through a platform PR. **Never apply it while linked to another Railway project.**
- Only the gateway has a public domain. Games are reached through it at `<address>/team-N`.
- Secrets live in Railway variables, never in the repository.
