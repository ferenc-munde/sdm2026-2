# How Last Train talks to the platform

The platform (`server/`, packages `@sdm/core` and `@sdm/host`) gives every game the same room: it creates the room code, keeps the seats, receives and checks inputs, calls the game's rules once per tick and sends the state to the clients. This page says what Team 2's game plugs into it.

```
browser                                   server (server.ts → startGameServer)
client/main.ts                            room "game"        createGameRoom(lastTrain)
  ├─ client/net.ts ── inputs ───────────►   checks input, queues it
  │   (@sdm/core/client)                    every tick: tick += 1, lastTrain.step(state, inputs, ctx)
  │                ◄── state ───────────    LastTrainState, sent 20 times per second
  └─ client/lobby.ts ◄──────────────────► room "train_lobby" TrainLobbyRoom (the team's own)
```

## The game definition (`shared/game.ts`)

`lastTrain` is a `GameDefinition<LastTrainState, GameConfig, ClientInput, JoinOptions>` from `@sdm/core/sim`.

| Hook | What it does today |
|---|---|
| `createState(config)` | A new `LastTrainState` |
| `init(state, ctx)` | Sets `timeLimitTicks`, creates the rule modules (tasks, items, sim, movement) |
| `join(state, playerId, ctx, options)` | Adds a `Player` named `options.name` (or `Crew N`) at a spawn point |
| `leave(state, playerId, ctx)` | Drops the item the player held, removes the player |
| `disconnect(state, playerId, ctx)` | Stops the player's movement while the connection is down |
| `step(state, inputs, ctx)` | Ticks the modules, applies the inputs, moves the players |
| `commands` | Empty. Debug commands go here |

`ctx.random` is the room's `SeededRandom` (`next()`, `int(min, max)`, `pick(items)`); `ctx.config` is the checked `config/game.json`. The room adds 1 to `state.tick` before every `step`, so the rules never write `tick`.

The rule modules live in a `WeakMap` keyed by the state object. They hold nothing that is synced; the movement module only remembers which direction each player is holding.

## State (`shared/state.ts`)

`LastTrainState extends BaseState`. The room owns the base fields: `tick`, `code` (the 4-character room code), `paused`, `seats`.

| Field | Type | Written today? |
|---|---|---|
| `phase` | string: `lobby`, `running`, `won`, `lost` | No. Stays `lobby` in the game room |
| `journeyDistance`, `speed`, `power`, `pressure`, `endgameUnlocked` | numbers, boolean | No (defaults) |
| `timeLimitTicks` | uint16 | Yes, in `init` |
| `runTicks` | uint32 | Yes, in `step`: ticks played in the current run. Rises while `phase` is `running`, restarts at 0 with a new run. The HUD reads the run clock from here; clients never count ticks |
| `players` | map of `Player`, keyed by player id (the session id) | Yes |
| `tasks`, `hazards`, `items`, `doors` | maps | No. Nothing creates entries yet |

`Player`: `name`, `carIndex` (0 to 4), `x`, `y`, `anim` (`idle`, `walk`, `run`), `holdingItemId`, `eliminated`.

**Coordinates.** `x` and `y` are map units on the 1600 × 1000 map the client draws: origin top-left, x to the right, y downwards (`shared/map.ts`). The scene converts them to Three.js coordinates. Note that `shared/items.ts` still uses a pickup radius of 1.5 from the SPEC, which is far too small in map units; see NEXT_STEPS.

## Inputs (`shared/input.ts`)

A client sends plain inputs; `@sdm/core/client` wraps each one in the platform envelope `{ seq, input }`, and the room drops repeated sequence numbers and checks the input with `clientInputSchema`. An input that fails the schema disconnects the client. **Inputs carry no `seq` of their own any more.**

| Input | Fields | Effect in `step` |
|---|---|---|
| `move` | `mx`, `my` (each −1 to 1), `run` | Sets the direction the player holds. It applies every tick until the next `move`. `mx: 0, my: 0` stops |
| `pickup` / `drop` | `itemId` | Items module (works only for items that exist in the state) |
| `progress` | `taskId`, `amount` 1 to 4 | Adds progress to an existing task |
| `interactDown` / `interactUp` | `stationId` | Accepted, ignored |
| `startRun` | (none) | Accepted, ignored |

Movement: `walkSpeed` or `runSpeed` map units per second, divided by `tickRate` per tick. Diagonals are not faster. A player stays inside the walkable area: the five carriage floors and the four passages on the central aisle. Stations are not obstacles yet.

## Join options

`joinOptionsSchema`: `{ name?: string }`, trimmed, 1 to 16 characters. A join with a bad name is refused before a seat is made. Without a name the player is called `Crew N`.

## Config (`config/game.json`, `shared/config.ts`)

`gameConfigSchema` extends the platform's `RoomSettingsSchema` with tighter limits.

| Value | Now | Meaning |
|---|---|---|
| `tickRate` | 20 | Simulation steps per second (10 to 60) |
| `patchRate` | 20 | State updates per second; not above `tickRate` |
| `maxPlayers` | 4 | Seats in a game room (2 to 4) |
| `reconnectSeconds` | 30 | How long a dropped player keeps the seat |
| `timeLimitSeconds` | 300 | Length of a run; `tickRate × timeLimitSeconds` must fit 65535 |
| `walkSpeed` | 120 | Map units per second |
| `runSpeed` | 200 | Map units per second, with Shift |

## Rooms (`room/index.ts`, `server.ts`)

```ts
export const rooms = {
  [GAME_ROOM_NAME]: (deps) => createGameRoom(lastTrain, deps), // "game": the platform room shell
  [LOBBY_ROOM_NAME]: () => TrainLobbyRoom,                     // "train_lobby": the team's lobby
};
```

`server.ts` calls `startGameServer({ gameId: "team-2", config, rooms })` and then `configureMatchmaking()`. That second call is needed: the host registers rooms without matchmaking filters, and the lobby must only match players who chose the same crew size (`filterBy(["teamSize"])`). A test or script that starts the server another way must call it too. If the platform later accepts filters in room registration, move it there (that needs a `platform` issue).

The host also serves `GET /health` and `POST /api/rooms/join` (turns a room code into a room id).

## From the lobby to the game room

The lobby and the game are two different rooms, and the platform has no lobby of its own. The flow:

1. Players join `train_lobby` with a name and a crew size (unchanged).
2. The lobby departs (full crew, countdown, or the host skips) and sends `match-started` (unchanged).
3. The **lobby host's** browser creates the game room (`hostGame`, which calls the platform's `hostRoom`) and sends the lobby the message `game-room` with `{ code }`.
4. The lobby room checks that the sender is the host and the lobby is running, then sends `game-room` to everybody.
5. The **other** browsers join the game room by that code (`joinGame`, which calls `joinRoomByCode`), with their lobby name.
6. Everybody leaves the lobby room.

Known limits: if the host closes the tab between steps 2 and 3, the others wait 15 seconds and see an error; they must reload. A player who reloads during the game does not come back automatically (the platform keeps the seat for `reconnectSeconds`, but the client does not reconnect yet). Anybody who knows the code can join with `?room=CODE` while a seat is free.

## The client net layer (`client/net.ts`) and the `?local` switch

The rest of the client talks to a `GameSession` (defined in `client/stateModel.ts`):

```ts
interface GameSession {
  state: LastTrainState;   // read only on the client
  playerId: string;        // my key in state.players
  code: string;            // room code, "" offline
  send(input: ClientInput): void;
  onTick(fn): void;        // called when the state changed
  start(): void; stop(): void;
}
```

There are two implementations:

- **Networked** (`client/net.ts`): `hostGame(server, name)` and `joinGame(server, code, name)` return a session once the first state has arrived. It never simulates; `state` is the synced state.
- **Offline** (`client/stateModel.ts`): `createLocalStateModel()` runs the same `lastTrain` rules in the browser with one fixed player. It plays the room's part: it advances `tick` and calls `step` every 50 ms.

`client/main.ts` chooses:

- `?local` in the address: offline only, no lobby, no server.
- otherwise: the offline model runs behind the lobby screen until the game room is joined, then the networked session replaces it.

Keyboard: `main.ts` sends one `move` when the held direction or Shift changes and a zero `move` on release or when the window loses focus. `E` and `Q` still send `pickup` and `drop` for the demo item id `wrench`, which does not exist on the server yet.

Rendering: `scene.setPlayers(players, myId)` is called on every state change. It creates one disc per entry of `state.players`, moves it, and removes it when the player is gone. There is no interpolation or prediction yet, so movement updates 20 times per second.

The server address is `http(s)://<page host>:2567` by default. `VITE_SERVER_URL` at build time or `?lobby=<url>` in the address overrides it for both rooms.
