# How the game runs on the platform

The shared platform is in `server/`: `@sdm/core` (the contract every game follows) and `@sdm/host` (the Colyseus 0.18 + Express server). The platform rules are in [`server/CLAUDE.md`](../../../server/CLAUDE.md); how joining works for every game is in [`server/docs/LOBBY_AND_JOIN.md`](../../../server/docs/LOBBY_AND_JOIN.md).

## The pieces

| File | What it does |
|---|---|
| `server.ts` | `startGameServer({ gameId: "team-3", config, rooms })`. The host reads `PORT` (default 2567), `APP_ENV` and `COMMIT_SHA`. |
| `room/index.ts` | `{ game: (deps) => createGameRoom(lastTrain, deps) }`: the game becomes the platform's `game` room. |
| `shared/game.ts` | `lastTrain`, the `GameDefinition`. It adapts the rule pipeline in `shared/run/room.ts` to the platform's hooks. |
| `config/game.json` | `tickRate: 20`, `patchRate: 20`, `maxPlayers: 4`, `reconnectSeconds: 30`, checked by the platform's `RoomSettingsSchema`. |
| `client/roomConnection.ts` | The browser side: create a room, join by code, send messages, read the state. |

The platform owns the tick loop, the room code, seats (`state.seats`), input validation and de-duplication, reconnection windows and logs. The game owns everything in `shared/`.

## What is synced

`LastTrainState extends BaseState` and adds two string fields:

| Field | Content |
|---|---|
| `view` | The whole `GameState` to draw, as JSON (`roomView`): the platform while the crew waits, the train during a run. Read it with `readView(state)`. |
| `notices` | The last refusal per player, as JSON `Record<PlayerId, { error, message?, n }>`. Read it with `readNotice(state, playerId)`. |

`GameState` (in `shared/types.ts`) is plain objects: `roomCode`, `phase` (`lobby`, `playing`, `won`, `lost`), `lobby { hostId, crewSize }`, `time`, `players`, `items`, `hazards`, `journey { fuel, hull, distance, speedFactor }`.

The rules keep their real state outside the schema, in a `WeakMap` keyed by the synced state (`hidden` in `shared/game.ts`), and publish a fresh `view` after every step. The train map, platform map and rule systems are one read-only `world` shared by all rooms.

## What a client sends

Every message goes out as the platform's input: `room.send("input", { seq, input: <message> })`, with `seq` rising by one. `roomConnection.ts` adds the envelope.

| Message | When |
|---|---|
| `{ type: "createRoom", name }` | First message of the player who created the room |
| `{ type: "joinRoom", name, code }` | First message of a player who joined by code |
| `{ type: "configureRoom", crewSize }` | The host sets the crew size (2 to 4) |
| `{ type: "startGame" }` | The host starts the run |
| `{ type: "input", direction, interacting }` | Movement and hold-to-interact, sent when either changes |
| `{ type: "pickUpOrDrop" }`, `{ type: "throw" }` | Item actions |
| `{ type: "playAgain" }` | After a win or loss |

The platform's `inputSchema` for this game is `z.unknown()`; the message is checked by `parseClientMessage` in `step`, so a bad message becomes a notice (`invalidMessage`) instead of a closed connection.

A player takes a seat in the game only when `createRoom` or `joinRoom` arrives, because that message carries the name. The platform's own `join` hook is empty.

## Creating and joining a room

```
create:  new Client(ws).create("game")            → then send { type: "createRoom", name }
join:    POST /api/rooms/join { code } → { roomId } → joinById(roomId) → send { type: "joinRoom", name, code }
```

`404` from the join route is "room not found", `409` is "room full". The room code is the platform's 4-character code in `state.code`; the shared link is the page address with `?room=CODE` (`client/roomLinks.ts`, `client/sharedLinkJoin.ts`).

## What changed in the platform on 2026-11-13 (pull request #236)

Nothing in this folder had to change, and all 42 test files pass against it. Three additions are available now:

- **Join options.** A game can declare `joinOptionsSchema` and gets the checked options as the fourth argument of `join(state, playerId, ctx, options)`. With it the name could travel with the join itself, and the separate `createRoom` / `joinRoom` first message would no longer be needed.
- **Config in the context.** `ctx.config` is the validated `config/game.json` in every hook, so tuning values can move out of `shared/constants.ts` into the config file.
- **`@sdm/core/client`.** `serverAddress`, `hostRoom`, `joinRoomByCode`, `JoinError`: the same thing `client/roomConnection.ts` does, as shared platform code. The team's own file was the model for it; switching is optional.

## Rules to keep

From `server/CLAUDE.md`, they matter for every change in `shared/`:

- Browser-safe: import only `@colyseus/schema`, `zod`, `@sdm/core/shared` and `@sdm/core/sim`. Never `colyseus`, `@sdm/host` or `node:*`.
- Deterministic: use `ctx.random`, never `Math.random()`; never read `Date.now()` or `performance.now()` in the rules; advance only in fixed ticks.
- Never import another team's folder or platform files by relative path.
