# How the game talks to the platform

The platform (`server/`, packages `@sdm/core` and `@sdm/host`) gives every game a Colyseus 0.18 room with seats, a room code, a fixed tick and validated inputs. The game supplies a `GameDefinition`: a state class, schemas and a `step` function. Ours is `lastTrain` in [`../shared/game.ts`](../shared/game.ts).

```
browser tab                                      game server (pnpm run dev:server, port 2567)
-----------                                      ------------------------------------------
client/main.ts  (lobby, wiring)                  server.ts -> startGameServer({ gameId, config, rooms })
   |                                             room/index.ts -> createGameRoom(lastTrain, deps)
client/room-adapters.ts                             |
   |  hostRoom / joinRoomByCode (@sdm/core/client)  |  every tick: lastTrain.step(state, inputs, ctx)
   |  --- inputs: move / start / repair ----------> |
   |  <-- synced state (TrainState) --------------- |
   v
GameClientSnapshot -> client/gameplay-view.ts (HUD) and client/player-scene.ts (Three.js)
```

The client never changes game state itself. It sends inputs; the server applies them in `step`; the new state comes back to every client.

## State (`TrainState` in `shared/game.ts`)

`TrainState` extends the platform's `BaseState`. The platform owns `tick`, `code` (the room code), `paused` and `seats`; the game never writes them.

| Field | Type | Meaning |
|---|---|---|
| `players` | map of `PlayerState`, keyed by session id | One entry per player in the room |
| `players[id].name` | string | Crew name from the join options |
| `players[id].seat` | number | Seat index, lowest free one at join time. Decides colour and spawn point |
| `players[id].color` | string | `PLAYER_COLORS[seat]` (`shared/constants.ts`) |
| `players[id].connected` | boolean | `false` while the connection is dropped and the seat is held |
| `players[id].x`, `.z` | number, 0..1 | Position in the walkable area: `x` along the train (0 = front), `z` across it |
| `players[id].moveX`, `.moveZ` | number, -1..1 | Current walking direction, set by the last `move` input |
| `tasks` | array of `TaskState` | The repairs of this run |
| `tasks[i].id`, `.label` | string | From `TASK_CATALOGUE` in `shared/train-layout.ts`; the label includes the section name |
| `tasks[i].section` | string | `engine`, `electrical`, `control`, `passenger` or `rear`: where a player must stand to repair it |
| `tasks[i].progress` | number, 0..100 | Complete at 100 |
| `phase` | `lobby`, `playing`, `victory` or `failure` | The one field the client draws its screen from |
| `runTicks` | number | Ticks played in the current run |
| `secondsRemaining` | number | Whole seconds left, rounded up |
| `trainCondition` | number, 0..100 | The run fails at 0 |

Numbers are sent as 32-bit floats, so a client sees `0.38` as `0.3799999952316284`. Do not compare synced positions with `===` against literals.

## Inputs (`InputSchema`)

Sent with `connection.send(input)`; the platform wraps them in its `{ seq, input }` envelope and checks them against the schema. **An input that fails the schema disconnects the client**, so keep the client and the schema in step.

| Input | Effect in `step` |
|---|---|
| `{ type: "move", x, z }` (each -1..1) | Sets the player's walking direction (scaled back to length 1 if longer). The player keeps walking until the next `move`; `{ x: 0, z: 0 }` stops. Positions only change while `phase` is `playing`. |
| `{ type: "start" }` | If the phase is not `playing`: resets the run (clock, condition, tasks, spawn points) and sets `playing`. Any player may send it. Also used to play again after a victory or failure. |
| `{ type: "repair" }` | While playing: adds `repairStep` to the open task in the section the player stands in, if there is one. At most one step per player per tick. Completing a task adds `repairConditionBonus` to the train condition. |

Every tick while playing: players move by `playerSpeed / tickRate` world units, `runTicks` rises by one, `secondsRemaining` is recomputed, and the train condition drops by `conditionDecayPerSecond / tickRate` while a repair is open. Then: all tasks complete gives `victory`; otherwise no time or no condition left gives `failure`.

## Join options (`JoinOptionsSchema`)

`{ name: string }`: trimmed, 1 to 18 characters (`MAX_NAME_LENGTH`). The platform rejects a join whose options fail the schema (`JoinError` reason `rejected`) before a seat is made.

## Config (`config/game.json`, checked by `ConfigSchema`)

| Key | Value now | Meaning |
|---|---|---|
| `tickRate` | 20 | Simulation ticks per second (platform) |
| `patchRate` | 20 | State patches per second (platform) |
| `maxPlayers` | 4 | Seats in a room (platform) |
| `reconnectSeconds` | 20 | How long a dropped player's seat is held (platform) |
| `roundSeconds` | 180 | Length of a run |
| `playerSpeed` | 5 | Walking speed in world units per second (the train is 26 long) |
| `taskCount` | 5 | Repairs per run, picked from the catalogue with `ctx.random` |
| `repairStep` | 10 | Progress points per `repair` input |
| `conditionDecayPerSecond` | 0.4 | Condition lost per second while a repair is open |
| `repairConditionBonus` | 10 | Condition won back per completed repair |

The rules read these through `ctx.config`; never hard-code a tuning value in `shared/`.

## The adapter layer (client)

The lobby and the HUD were built against two small interfaces before any server existed. They are unchanged; there are now two implementations of each.

| Interface (declared in) | Mock (no server) | Real (platform room) |
|---|---|---|
| `SessionAdapter` (`client/session-adapter.d.mts`): `createSession`, `joinSession`, `leaveSession`, `subscribe` to `player-joined` / `player-left` | `MockSessionAdapter` | `createRoomAdapters(server).session` |
| `GameStateAdapter` (`client/game-state-adapter.d.mts`): `getSnapshot`, `subscribe` | `MockGameStateAdapter` (`publish`) | `createRoomAdapters(server).game`, which is a `LiveGameStateAdapter`: it also has `sendInput(input)` |

Both real adapters are views on one `RoomClient` in [`../client/room-adapters.ts`](../client/room-adapters.ts), because they share one connection.

- `createSession(name)` calls `hostRoom`, `joinSession(code, name)` calls `joinRoomByCode` (both from `@sdm/core/client`), then waits until the room code and the player's own entry have arrived. The returned `code` is the platform's room code (4 characters, letters and digits).
- Errors are mapped to the existing `SessionError` codes: `roomNotFound` to `NOT_FOUND`, `roomFull` to `SESSION_FULL`, `rejected` to `INVALID_NAME`, everything else to the new `CONNECTION_FAILED`. An empty name is refused before connecting; a second session on the same adapter gives `ALREADY_IN_SESSION`.
- `player-joined` and `player-left` are derived by comparing `state.players` with the previous state.
- Snapshot listeners are called only when the snapshot really changed (the server's tick counter changes 20 times a second; the snapshot does not).

### Room state to `GameClientSnapshot` (`toSnapshot`)

| Snapshot field | Comes from |
|---|---|
| `connectionState` | `connecting` while joining, `connected`, `reconnecting` after the SDK reports a drop, `disconnected` when the room is gone or was left |
| `players[]` | `state.players`, sorted by `seat`: `id` (session id), `name`, `connected`, `position { x, z }`, `color` |
| `secondsRemaining`, `trainCondition` | The same-named state fields |
| `tasks[]` | `state.tasks`: `status` is `complete` at progress 100, `in-progress` above 0, else `available` |
| `repairs` | `completed` = tasks at 100, `total` = number of tasks |
| `outcome` | `kind` is `victory` or `failure` in those phases, otherwise `playing` (also in the lobby); the message is fixed text per phase |
| `phase` | `state.phase`. New optional field; mock snapshots do not have it |

### How `client/main.ts` uses them

- Mode: `?mock` in the URL selects the mocks; anything else is live. The server address is `serverAddress(window.location, import.meta.env.VITE_SERVER_URL)`: the page's host on port 2567 unless the variable is set.
- Lobby: the crew list is refreshed from every snapshot, so it also shows `RECONNECTING` for a dropped player.
- **Board the train** sends `{ type: "start" }`. Every client opens the game view when it sees `phase` change to `playing`, so one click boards everyone. If a run is already under way (a player went back to the crew screen, or joined late), the button just opens the view.
- In the game view, `RoomInputController` sends a `move` when the pressed direction changes and a `repair` per press of E. The avatar moves when the server's position arrives.
- If the connection is lost for good, the client goes back to the lobby with a message.

## The mock switch

`http://localhost:5173/?mock` runs the page exactly as before the platform: in-memory sessions (one page only, demo room `DEMO`), the local mock snapshot controls, and `PlayerPreviewController` moving the local player in the snapshot. `tests/dom-integration.test.mjs` uses this mode; `tests/live-room-dom.test.mjs` uses the live mode against a real server on a free port.
