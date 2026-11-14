# Developing Last Train (Team 2)

## Layout

```
games/team-2/
├─ package.json      @team-2/game
├─ config/game.json  room settings, timeLimitSeconds, walkSpeed, runSpeed
├─ shared/           browser-safe game rules, state, inputs and config (pure, tested)
├─ server.ts         starts the platform host with the rooms below
├─ room/             room registration (game room + lobby room), room test
├─ client/           browser code: Three.js scene, input, screens, net layer
└─ docs/             start here: status, platform notes, next steps
```

The full folder map, file by file, is in [`docs/README.md`](docs/README.md).
How the game plugs into the platform (state, inputs, rooms, the client net
layer) is in [`docs/PLATFORM.md`](docs/PLATFORM.md). See `SPEC.md` for the
game design and `WORKFLOW.md` for who owns which files.

The game runs on the shared platform since #241: `server.ts` calls
`startGameServer()` from `@sdm/host`, `room/index.ts` registers the game
room (`createGameRoom(lastTrain, deps)`) next to the team's lobby room, and
the client connects through `client/net.ts` (`@sdm/core/client`).
`client/stateModel.ts` is the offline stand-in for the room, used with
`?local` and by the client tests.

`shared/config.ts` extends the platform's `RoomSettingsSchema`. The tsconfig
adds `experimentalDecorators` + `useDefineForClassFields: false`, required by
the `@colyseus/schema` state classes.

## Run the tests

Install once from the repository root with `pnpm install` (one pnpm
workspace, one lockfile at the root). Then from `games/team-2/`:

```bash
pnpm test
pnpm run typecheck
pnpm run build
```

These are the steps CI runs. `vitest.config.ts` sets `pool: "threads"`,
which the Colyseus server in `room/room.test.ts` needs.

## Run the game

From `games/team-2/`, run `pnpm dev`. The dev script starts Vite with
`client/` as its root on port 5173 and the game server (lobby room and game
room) on port 2567. `pnpm dev:server` and `pnpm dev:client` start one of the
two. The server runs through `vite-node`.
Use two browser tabs, choose the same team size, and join with distinct player
names. The lobby waits indefinitely and starts when the selected crew size is
filled; the host can start early with the current crew, including one player.
Everybody lands in the same running game room.

## Rules for code in `shared/`

- Pure functions only: the same state, input and elapsed time always give the
  same result.
- No `Math.random()`: use `ctx.random`, the room's `SeededRandom` from
  `@sdm/core/shared` (determinism rules in root `CLAUDE.md`).
- No clock (`Date.now()`, `performance.now()`): time advances only in fixed
  ticks (`1 / ctx.config.tickRate` seconds per step).
- No imports from `node:*`, the `colyseus` server or the DOM, because the
  client imports these files too.
- Tests sit next to the code as `*.test.ts`.

## Coming next

### Train motion (#434)

The game room starts running on its first player join, after the separate lobby
departs. `shared/sim.ts` publishes route speed and distance for all clients.
With full power and zero pressure, the clear-route journey takes 200 seconds.
Each unfinished task subtracts 20% of cruising speed; each hazard subtracts
8%, capped at 85% total drag. The round lasts four minutes; even one persistent
task makes the 200-second clear-route journey take 250 seconds, so repairs matter.
Completing tasks removes their drag on the next
tick. These values are validated in `shared/config.ts` and set in
`config/game.json`. Existing power and pressure also scale speed.

Scenery converts route fractions/second to a visual multiplier; the HUD keeps
the real route speed. Restart the dev server after changing shared rules.
Test through the lobby with two tabs; `?local` is only the offline alternative.
Arrival clamps distance at 100%; win/lose and timeout decisions remain a
separate responsibility, and are not implemented by the speed module.

See [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) for the prioritised list of
what `SPEC.md` describes and the code does not do yet.
