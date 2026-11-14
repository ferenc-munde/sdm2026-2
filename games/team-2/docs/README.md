# Last Train (Team 2): start here

This folder is the map for the team and for the AI coding agents working with it. Read this page first, then [PLATFORM.md](PLATFORM.md) (how the game talks to the shared platform) and [NEXT_STEPS.md](NEXT_STEPS.md) (what to build next). The game design itself is in [`../SPEC.md`](../SPEC.md).

## What the game is

A co-operative survival game for 2 to 4 players on a train of 5 carriages. The crew walks between carriages, repairs what breaks and keeps power and pressure in range, so the train reaches the station before the time limit. The server decides everything; browsers send inputs and draw the state they receive.

## Current status (2026-11-13)

- **Runs on the shared platform.** The game is a `GameDefinition` hosted by `@sdm/host`; the client connects with `@sdm/core/client`. The old local copy of the platform types is gone.
- **Multiplayer movement works on the server.** Players join one game room, get a spawn position, and move with WASD or the arrow keys inside the carriages and passages. Every client sees every player. This is covered by an integration test with two real clients.
- **The lobby** (name, crew size, visible player count) waits indefinitely, starts automatically when full, and lets the host start early.
- **Not built yet:** phases and the timer, win and lose, hazards, the task library, item spawning, station interactions, doors. See [NEXT_STEPS.md](NEXT_STEPS.md).
- **Not checked in a browser** after the move to the platform: the automated tests, the typecheck and the build pass, but nobody has looked at two tabs yet. Do that first (steps below).

## Folder map

```
games/team-2/
├─ package.json        @team-2/game: scripts and dependencies (pnpm workspace package)
├─ server.ts           starts the platform host with this game's rooms (port 2567)
├─ vitest.config.ts    test runner settings (thread pool, needed by Colyseus)
├─ tsconfig.json       TypeScript settings (decorators on, for the state schema)
├─ config/game.json    room settings and tuning values, checked by shared/config.ts
├─ shared/             the rules. Browser-safe and deterministic. Server and client both import it
│  ├─ game.ts          the GameDefinition: createState, init, join, leave, step
│  ├─ state.ts         LastTrainState and its parts (players, tasks, hazards, items, doors)
│  ├─ input.ts         what a client may send (zod), and the join options
│  ├─ config.ts        config schema (extends the platform's room settings)
│  ├─ map.ts           train geometry: carriages, passages, walkable area, spawn points
│  ├─ movement.ts      server-side movement
│  ├─ items.ts         pick up and drop (works on items already in the state)
│  ├─ tasks.ts         task progress (stub: no tasks are created yet)
│  ├─ sim.ts           power, pressure, speed, journey (stub: does nothing yet)
│  ├─ lobby.ts         lobby state and rules, lobby message names
│  └─ *.test.ts        unit tests, next to the code
├─ room/
│  ├─ index.ts         room registration: the game room and the lobby room
│  ├─ lobby-room.ts    the team's lobby room (TrainLobbyRoom)
│  └─ room.test.ts     integration test: real server, two real clients
├─ client/             the browser app (Vite root is this folder)
│  ├─ index.html       page and demo controls
│  ├─ main.ts          wires everything: session, keyboard, HUD, scene, lobby
│  ├─ net.ts           networked session (platform connection helper)
│  ├─ stateModel.ts    offline session (`?local`): runs the rules in the browser
│  ├─ lobby.ts         lobby screen
│  ├─ scene.ts         Three.js top-down scene, one marker per player
│  ├─ train-map.ts     artwork data: carriage names, colours, station positions
│  ├─ hud.ts           task list, gauges, journey strip
│  ├─ state-to-hud.ts  turns game state into HUD values
│  └─ HUD.md, MAP.md   notes from the HUD and map issues
├─ scripts/dev.mjs     starts server and client together
├─ docs/               this folder
└─ SPEC.md, WORKFLOW.md, README.md, DEVELOPMENT.md
```

## Install and run

You need Node.js 22 and pnpm 10 (`corepack enable`). Install once from the **repository root**, because this is one pnpm workspace:

```bash
pnpm install
```

Then, from `games/team-2/`:

```bash
pnpm dev          # game server on :2567 and Vite client on :5173, together
pnpm dev:server   # only the server
pnpm dev:client   # only the client
```

### Two tabs in one game

1. Run `pnpm dev`.
2. Open `http://127.0.0.1:5173/` in two tabs.
3. In the first tab, enter a name, choose a crew size, and press **Create Room**. In the other tab, enter a name and the host's room code, then press **Join Room**.
4. The lobby shows the start condition. A full crew starts automatically; the host can press **START NOW · CURRENT CREW** to start early.
5. Both tabs are now in the same game room. The status line at the top shows `Room XXXX · 2 crew aboard`. Move with WASD or the arrow keys, hold Shift to run. Each tab shows two discs; your own has a white outline.

Other ways to open the client:

| Address | What happens |
|---|---|
| `http://127.0.0.1:5173/` | Lobby, then the networked game room |
| `http://127.0.0.1:5173/?room=XXXX` | Skips the lobby and joins the game room with that code |
| `http://127.0.0.1:5173/?local` | Offline demo: no server, the rules run in the browser |
| `…/?lobby=http://host:2567` | Uses a game server at another address |

## Test

From `games/team-2/` (these are the steps CI runs):

```bash
pnpm test            # vitest: unit tests and the room integration test
pnpm run typecheck   # tsc --noEmit
pnpm run build       # typecheck, then the client build into client/dist/
```

The integration test (`room/room.test.ts`) starts a real server on a free port. It prints a few expected error lines when it checks that a bad join is refused.

## Rules to remember

- Work only inside `games/team-2/`. Need something from the platform? Open a `platform` issue; do not edit `server/`.
- `shared/` must stay browser-safe and deterministic: no `Math.random()`, no clock, no `node:*`, no `colyseus`. Use `ctx.random` and tick counts.
- Do not write `tick`, `code`, `paused` or `seats`: the room owns them.
- Repository workflow (issue, branch, commits, pull request): root [`CLAUDE.md`](../../../CLAUDE.md). Platform rules: [`server/CLAUDE.md`](../../../server/CLAUDE.md).
