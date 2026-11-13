# Lobby and join flow

> **Reference from the previous hackathon.** This describes how creating, joining and rejoining a room worked on the `sdm2026-1` platform (Team 10, 2026-11-06 and 07), where four games ran on it. This is a design reference, not a description of code in this repository. Use it when building `@sdm/core`, `@sdm/host` and the template so every game joins the same way.
>
> Source: the previous platform's code and docs, preserved at commit `2f1cd69` (`server/host/src/gameRoom.ts`, `server/host/src/routes.ts`, `server/core/src/server/roomCodes.ts`, `server/core/src/shared/guest.ts`, `server/core/src/client/urlParams.ts`, `server/docs/CLIENT_GUIDE.md` and `server/docs/design-docs/room-base.md`).

## The short version

- A player creates a **private room** and gets a **4-letter code**.
- Another player joins with the code, typed in or carried by an invite link such as `?room=QXTR`.
- Joining by code is two calls: an HTTP route turns the code into a room id, then the Colyseus SDK joins by id.
- A player who drops keeps their seat for a while and reconnects with a token.
- The platform provides rooms, seats, codes and reconnection, but no lobby screen or ready logic. Each game owns its waiting room.

```
Player A                         Server                          Player B
   │  client.create("game",         │                                │
   │   { private: true, name })     │                                │
   ├───────────────────────────────►│ makes the room and code "QXTR" │
   │◄───────────────────────────────┤                                │
   │  room.state.code = "QXTR"      │                                │
   │                                │                                │
   │        A sends B the code or the link  …/team-2/?room=QXTR      │
   │                                │                                │
   │                                │  POST /api/rooms/join { code } │
   │                                │◄───────────────────────────────┤
   │                                ├───────────────────────────────►│
   │                                │  { roomId }                    │
   │                                │  client.joinById(roomId,       │
   │                                │   { name, guestId })           │
   │                                │◄───────────────────────────────┤
   │  both now see the same state: seats, code and the game's fields │
```

## Creating a room

The client asks Colyseus for a new room and marks it private:

```ts
const room = await client.create("game", { private: true, name: "Ada", guestId: getGuestId() });
// room.state.code is the code to share, for example "QXTR"
```

In `onCreate`, the room picks a code, writes it to `state.code`, registers itself in a live room registry by room id and code, and calls `setPrivate(true)` so it is hidden from matchmaking. The registry only needs to cover live rooms in this server process. `maxClients` comes from `maxPlayers` in the game's `config/game.json`.

Without `private: true`, the room is a quick-match room: `client.joinOrCreate("game", options)` finds it and `state.code` is `""`. The room only reads the `private` flag from create options; it must not log or retain the options object, which can contain the raw guest id.

### Room codes

| Rule | Value |
|---|---|
| Length | 4 letters |
| Alphabet | `ABCDEFGHJKLMNPQRSTUVWXYZ` (A–Z without `I` and `O`, which can be misread as `1` and `0`) |
| Unique among | Live rooms in one game's server process |
| Case | Trim whitespace and compare in upper case, so `qxtr` works |

The server generates a code outside the simulation, before it starts, and retries if the code is already in use (up to 100 attempts, then fail). This is not game-rule randomness: using real randomness here is fine. The code is part of room state and replay data. Quick-match rooms have no code.

The client accepts only `^[A-HJ-NP-Z]{4}$`, through `normalizeRoomCode()`. Keep the client pattern and server alphabet defined and tested together. Invalid codes in a link should become `null` on the client so the player gets an immediate error rather than an "unknown room" response. Each game has its own server process, so codes need only be unique within that game.

## Joining by code

Joining by code takes two calls: the HTTP route looks up the room id in the live room registry, then the client joins that id:

```ts
const res = await fetch(`${SERVER_URL}/api/rooms/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code }),
});
if (!res.ok) throw new Error((await res.json()).error);
const { roomId } = await res.json();
const room = await client.joinById(roomId, { name: "Bo", guestId: getGuestId() });
```

`POST /api/rooms/join` accepts a JSON body of at most 1 KB:

| Answer | When | Body |
|---|---|---|
| `200` | The code belongs to a live room with a free seat | `{ roomId }` |
| `400` | The body is not `{ code: string }` | `{ error: "expected { code }" }` |
| `404` | No live room has this code or the code is empty | `{ error: "unknown room" }` |
| `409` | The room has as many players as `maxPlayers` | `{ error: "room is full" }` |

The route can only check whether a seat appears free. The seat is taken by the later `joinById`, so two players can race for the last seat; Colyseus enforces `maxClients` and rejects the second join. A dropped player whose seat is still held counts toward the limit. The registry avoids a matchmaker query and lets the client see an unknown-room or full-room error before opening a WebSocket.

The route stays enabled in production. Do not expose room ids or codes in production stats: they could let someone join private rooms or download their replays.

### Join options

The create and join options (`name` and game-specific values) are checked against the game's `joinOptionsSchema`. Invalid options reject the join with `can't join: <reason>`; the client shows the error and the room stays open. A game error during join closes the room instead. Remove the raw `guestId` from options before the game's schema sees them, so strict game schemas do not need to declare it.

### Invite links

An invite link is the game's page with the code in the query string:

```
https://<address>/team-2/?room=QXTR
```

`buildInviteLink(location.href, code)` replaces the current query and hash with `?room=<code>`, and `readClientParams(location.search).room` reads and normalizes it.

When the page loads, the client tries in this order:

1. Reconnect with a saved token.
2. Join by the code in `?room=`, if there is one.
3. Otherwise show the lobby: create a room or type a code.

`?name=Ada` can prefill the player's name, limited to 24 characters. Keep state in the query string, not the path: behind the gateway `/team-2/?room=QXTR` works, while `/team-2/lobby/QXTR` can break relative asset paths.

## The seat

Every game state extends a base state owned by the platform. Games do not write these fields:

| Field | Meaning |
|---|---|
| `code` | The room code, or `""` for quick-match rooms |
| `seats` | One entry per player, keyed by session id |
| `seats[id].connected` | `false` while the player is dropped and the seat is held |
| `seats[id].lastSeq` | Last input sequence number applied for this player |
| `seats[id].guest` | The player's public fingerprint for this game, or `""` |
| `tick`, `paused` | Simulation tick and pause flag |

The room owns seat changes. A game may read seats in its simulation because every change is recorded for replay, but it keeps its own entities wherever it likes; the platform does not assume one entity per player. On join, the game's `join(ctx, playerId, options, { guest })` hook adds game-specific data such as position, role or score. Optional `disconnect(ctx, playerId)` and `reconnect(ctx, playerId)` hooks let a game react to connection changes.

## The waiting room belongs to the game

The platform has no lobby phase, ready flag or start button. Those are game state and game inputs. The four previous games used different patterns:

| Game | How it waited and started |
|---|---|
| Team 1 | `phase` starts as `"waiting"`; players send a `ready` input during a briefing; a `solo` join option allows solo play |
| Team 2 | The clock starts when the second player joins; either player can restart for both |
| Team 3 | `phase` is `"lobby"`, `"playing"` or `"over"`; the creator picks the loop length as a join option |
| Team 4 | Each player has a `ready` flag in game state, set by an input |

Useful patterns:

- Keep a `phase` field in game state and let the client render from it. Keep ready flags on game entities, not in platform-owned `seats`.
- Start inside the simulation's `step`, once the required seats are present and ready, rather than directly from a client message. This keeps the transition deterministic and replayable.
- If there is a host, store its player id in game state and hand it to another player in `leave` or `disconnect` when needed.
- Treat creator-selected settings as join options validated by `joinOptionsSchema`.
- Decide how late joiners are handled: spectate, wait for the next round, or take an open slot.
- Store data needed to restore a returning player in synced game state keyed by `guest`, so a new seat can recover it in `join`.
- Use debug commands such as `start` or `ready all` to help QA reach a game phase without multiple browsers; debug commands are recorded and rejected in production.
- The waiting-room UI belongs to the game's client. The template should show the minimum: create, enter a code, join and share the invite link.

## Leaving and reconnecting

| What happens | Server | State |
|---|---|---|
| Unexpected drop (tab closed or network lost) | Hold the seat for `reconnectSeconds` from `config/game.json` | `connected = false`; the optional `disconnect` hook runs |
| Player returns within the window | Restore the same session id and seat | `connected = true`; the optional `reconnect` hook runs |
| The window expires | Record a `leave` and free the seat | The game's `leave` hook runs |
| Consented leave | Free the seat immediately | The game's `leave` hook runs |

`reconnectSeconds` was 20 in the previous template; `0` turns the hold off. The client stores `room.reconnectionToken` in `sessionStorage` and calls `client.reconnect(token)` after a refresh. Wrap storage access in `try`/`catch`: browser storage can be unavailable in private windows. Scope the token key by game path (for example, `sdm:${pathname}:reconnectionToken`) because all games share one address behind the gateway.

If reconnect fails because the seat expired or the room closed, clear the token and join the saved room code as a new player. On reconnect the server resets that seat's input sequence, so the refreshed client can start again at sequence `0`. Record drops and reconnects as replay events, and record the eventual leave at the tick the hold expires.

## Guest ID

A `sessionId` lasts for one seat. The browser sends a guest id on every create and join to recognize the same player in another tab or after a seat expires:

- `getGuestId()` keeps a random UUID in `localStorage` under `sdm:guestId`, shared across games. If storage is unavailable, use one in-memory id for the page so joining still works, but recognition will not survive a reload.
- The server removes the raw id from join options and never puts it in state, logs, replays or HTTP responses. For a valid UUID, store the first 12 hex characters of `SHA-256("<gameId>:<lowercased id>")` in `seats[sessionId].guest`, pass it as `info.guest` to the game's `join`, and use the same fingerprint in the join event and join log.
- A missing or invalid guest id becomes `""` and never rejects a join. The game id in the hash prevents players from being linked across games.
- A guest id is a hint, not a login. Never use it to hand over a seat, score or ownership; a client can send any UUID.

## Things that went wrong, and the rule that fixed them

- **The game lives under a path.** Behind the gateway a game is served at `<address>/team-N/`. Derive the server address from the page's folder, not just `location.origin`; links and fetches must work under that path. In local development the client talks to `http://localhost:2567`.
- **Browser storage is shared by all games** on the one address. Include the game's path in per-game keys, or a token saved by one game may be tried on another. The guest id is the deliberate exception.
- **Room state belongs in the query string, not the path.** `/team-2/?room=QXTR` works; `/team-2/lobby/QXTR` can make relative asset paths fail.
- **`sessionStorage` and `localStorage` can throw.** Catch storage errors and keep the player able to join without storage.

## What the platform team builds

The flow spans the current build order in [../README.md](../README.md#build-order):

| Step | Package or work | What this flow needs |
|---|---|---|
| 1 | Workspace and `@sdm/tooling` | The pnpm workspace, shared TypeScript config and game packages |
| 3 | `@sdm/core` contract and simulation | Join route and message contracts; `BaseState` with `code` and `seats`; seat fields; `RoomSettingsSchema`; `join`, `leave`, `disconnect` and `reconnect` hooks |
| 4 | `@sdm/host` | Room codes, live room registry, private rooms, seat limits and holds, reconnect behavior, join route and its `400`, `404` and `409` responses |
| 5 | `@sdm/template` | Create room, join by code, show the invite link and reconnect with the saved token |
| 6 | Gateway and deployment | Serve games under `/team-N/` so invite links and storage keys work behind a path prefix |
| 7 | Remaining core/client work | Code generation and replay events; guest fingerprinting; `getGuestId()`, `normalizeRoomCode()`, `readClientParams()`, `buildInviteLink()` and the server URL helper |

The code alphabet, code length and client pattern must be defined once and tested together, so the client never accepts a code the server cannot issue.

## Not part of this flow

- Accounts and login.
- Matchmaking beyond quick match and join by code.
- Keeping rooms, seats or replays across a server restart or deploy.
- Several server processes for one game; code lookup is in-process and would need a shared registry first.
