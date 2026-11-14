# Next steps

What `SPEC.md` describes and the code does not do yet, most important first. Each item says where the work goes. Open one issue per item (`[team-2] …`) before starting.

## What changed on 2026-11-13 (issue #241)

The game was moved onto the shared platform.

- The local copy of the platform types (`shared/types.ts`) and of the random generator (`shared/random.ts`) was **removed**. The code imports `BaseState`, `GameDefinition`, `RoomSettingsSchema` from `@sdm/core/sim` and `SeededRandom` from `@sdm/core/shared`.
- `shared/game.ts` follows the real `GameDefinition`: `step(state, inputs, ctx)` with inputs as `{ playerId, input }`, `ctx.random`, `ctx.config`, and join options with a `name`.
- Inputs lost their own `seq` field; the platform envelope carries it.
- `move` is real: the server moves players inside the train (`shared/map.ts`, `shared/movement.ts`), and every joining player gets a spawn position.
- `server.ts` uses `startGameServer`; `room/index.ts` registers the game room next to the lobby room.
- The client has a net layer (`client/net.ts`); the offline model is kept behind `?local`. The scene draws one marker per player from the state instead of three painted figures.
- `random.int` changed meaning with the platform generator: it is now `int(min, max)`, not `int(maxInclusive)`.
- The server is started with `vite-node` instead of `tsx` (`tsx` did not compile the platform's schema decorators).
- `package.json`: `@sdm/core` and `@sdm/host` are workspace dependencies; `zod`, `@colyseus/schema` and `@colyseus/sdk` use the same ranges as the platform and Team 3. The package no longer lists `@types/node`: a second version of it in the workspace broke the typecheck of `server/host`, and this package needs no Node types of its own.
- The unused `index.html` at the package root was removed; Vite serves `client/index.html`.

## First: look at it

1. **Check two tabs in a real browser.** The move was verified by tests, typecheck and build only. Follow "Two tabs in one game" in [README.md](README.md) and fix what looks wrong (marker size, colours, the status line, the lobby handover).

## Then, in this order

2. **Phases and the timer** (SPEC §1, §3). `phase` never changes in the game room and `startRun` is ignored. Handle `startRun` in `shared/game.ts` (or start when the room is created, since the lobby already gathered the crew), store the start tick in the state, and let the HUD count down from it. Today `client/state-to-hud.ts` gets the start tick from the client, which only works offline.
3. **Journey, speed, win and lose** (SPEC §1, §3). `shared/sim.ts` is an empty stub. Add `journeyDistance += speed × dt`, the speed formula from power, pressure and drag, and the checks that set `phase` to `won` or `lost`. Put the tuning values in `config/game.json`.
4. **Station interactions** (SPEC §2, §8.3). `interactDown` and `interactUp` are accepted and ignored. Move the station positions the rules need from `client/train-map.ts` into `shared/map.ts` (keep colours and labels in the client), check the distance to the station on the server, and drive the hold actions (wrench, crank, brake).
5. **Task library and director** (SPEC §4, §9). `shared/tasks.ts` only adds progress to tasks that already exist; nothing creates tasks. Build the 12 tasks and the director that spawns them with `ctx.random`. `progress` currently trusts the client: tie it to a station the player stands at.
6. **Items** (SPEC §7). Nothing spawns items, so `pickup` and `drop` do nothing in a real room. Spawn wrench, extinguisher, coal, battery at their lockers and bins. **Fix the pickup radius**: `shared/items.ts` uses 1.5, from the SPEC's old units; positions are now map units (a carriage is 220 wide), so use something like 24 and move it to the config. The client sends the fixed id `wrench`; send the nearest item instead. Carrying a battery should slow the player (SPEC §7).
7. **Hazards** (SPEC §6). The `hazards` map is never filled. Add the hazard director (fire, leaks, electrical faults), their effect on power, pressure and speed, and the extinguisher.
8. **Doors and lockdown** (SPEC §2). The `doors` map is never filled and passages are always open. Add door state per passage, block movement through a locked door in `shared/movement.ts`, and the crawl hatch.
9. **Elimination** (SPEC §5). `eliminated` exists and stops movement, but nothing sets it.
10. **Stations as obstacles.** Players walk over station artwork. Add the station rectangles to the walkable check if the team wants collisions.

## Client and platform follow-ups

- **Reconnect.** The platform keeps a dropped seat for `reconnectSeconds`; the client does not use the reconnection token yet, so a reload loses the seat. See `server/docs/LOBBY_AND_JOIN.md`.
- **Lobby handover if the host leaves** at the moment of departure: the crew waits 15 seconds and gets an error. Let the lobby room pick the next host, or have the server create the game room.
- **Smooth movement.** No interpolation or prediction: remote and local players move in 20 steps per second. Interpolate positions in `client/scene.ts`.
- **Player names in the scene.** Markers have no label; the name is in `state.players`.
- **Camera follows the local player** (SPEC §8.5); today the camera shows the whole train or one chosen carriage.
- **Debug commands.** `commands` is empty; SPEC §8.4 suggests spawn task, set power, skip phase.
- **Replay test.** The rules are written to be deterministic; there is no replay test that proves it for a whole run.
- **`SPEC.md` is older than the code in places**: it describes a horizontal train, Three.js "world units" and an `InputEvent` type. The vertical 1600 × 1000 map and `docs/PLATFORM.md` describe what is built.
- **Peer dependency warning** on install (`@colyseus/uwebsockets-transport`): harmless, the host uses the WebSocket transport; the same warning appears for `server/host`.
