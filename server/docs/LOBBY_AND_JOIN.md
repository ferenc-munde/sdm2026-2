# Lobby and joining a room

> **Reference from the previous hackathon.** This describes how creating, joining and rejoining a room worked on the platform of `sdm2026-1` (Team 10, 2026-11-06 and 07), where four games ran on it. Nothing here is built in this repository yet. Use it as the design to follow when `@sdm/host`, `@sdm/core` and the template game are written, so every game joins the same way.

## The short version

- A player **creates a private room** and gets a **4-letter code**.
- Another player **joins with the code**, typed in or carried by an invite link (`?room=QXTR`).
- Joining by code is **two calls**: an HTTP route turns the code into a room id, then the Colyseus SDK joins by id.
- A player who drops keeps their seat for a while and **reconnects with a token**.
- The platform has **no lobby screen and no "ready" logic**. It gives every game seats and a room code; the waiting room is part of each game's own state.

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
   │                                │  POST /api/rooms/join {code}   │
   │                                │◄───────────────────────────────┤
   │                                ├───────────────────────────────►│
   │                                │  { roomId }                    │
   │                                │  client.joinById(roomId,       │
   │                                │   { name, guestId })           │
   │                                │◄───────────────────────────────┤
   │  both now see the same state: seats, code, the game's fields    │
```

## Creating a room

The client asks Colyseus for a new room and marks it private:

```ts
const room = await client.create("game", { private: true, name: "Ada", guestId: getGuestId() });
// room.state.code is the code to share, for example "QXTR"
```

On the server, in the room's `onCreate`:

1. If `private` is set, the room picks a code and writes it into the state (`state.code`), so every client can show it.
2. The room registers itself in the **live room registry**: a map of the rooms in this server process, searchable by room id and by code.
3. The room is hidden from matchmaking (`setPrivate(true)`), so nobody lands in it by accident.
4. `maxClients` is set from `maxPlayers` in the game's `config/game.json`.

Without `private: true` the room is a **quick-match room**: `client.joinOrCreate("game", options)` finds it, and `state.code` is `""`.

### Room codes

| Rule | Value |
|---|---|
| Length | 4 letters |
| Alphabet | `A`–`Z` without `I` and `O`, so a code is never misread as `1` or `0` |
| Unique among | the live rooms of one game (the registry is asked before a code is used) |
| Case | The server compares in upper case and trims spaces, so `qxtr` works |

The client checks the same pattern (`/^[A-HJ-NP-Z]{4}$/`) before it calls the server, so a typo gives an instant message instead of "unknown room". A test kept the client pattern and the server alphabet in sync.

Each game is its own server process, so a code is unique inside one game, not across all games.

## Joining by code

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

`POST /api/rooms/join` looks the code up in the live room registry:

| Answer | When |
|---|---|
| `200 { roomId }` | The room exists and has a free seat |
| `400 { error: "expected { code }" }` | The body is not `{ code: string }` |
| `404 { error: "unknown room" }` | No live room has this code |
| `409 { error: "room is full" }` | The room already has `maxPlayers` seats. A dropped player whose seat is still held counts |

Why two calls: the code is looked up in the server's own memory, so no matchmaker query is needed, and the client gets a clear error (unknown or full) before it opens a WebSocket.

### Join options

The options of `create` and `joinById` (`name` and whatever the game adds) are checked against the game's `joinOptionsSchema` (zod). Invalid options reject the join with the message `can't join: <reason>`, which the client shows in its lobby. A rejected join is logged, and it does not close the room.

### Invite links

The link is the game's own page with only `?room=<code>`:

```
https://<address>/team-2/?room=QXTR
```

When the page loads, the client tries in this order:

1. **Reconnect** with a saved token (see below).
2. **Join by the code in the URL**, if there is one.
3. Otherwise **show the lobby**: a "Create room" button, and a code field with "Join by code".

`?name=Ada` sets the player name the same way (at most 24 characters).

## The seat

Every game state extends a base state that the platform owns. A game never writes these fields itself:

| Field | Meaning |
|---|---|
| `code` | The room code, `""` for quick-match rooms |
| `seats` | One entry per player, keyed by session id |
| `seats[id].connected` | `false` while the player is dropped and the seat is held |
| `seats[id].guest` | A short fingerprint that recognises a returning browser (see below) |
| `tick`, `paused` | Simulation tick and pause flag |

When a player takes a seat, the game's `join(ctx, playerId, options, { guest })` hook runs: this is where the game adds its own per-player data (position, role, score).

## The waiting room belongs to the game

The platform only seats players. "Waiting for the second player", "ready" and "start" are **game state and game inputs**, written by each team. What the four games did:

| Game | How it waited and started |
|---|---|
| Team 1 | `phase` starts as `"waiting"`; a briefing step where each player sends a `ready` input (one bit per player); a `solo` join option to play alone |
| Team 2 | The clock starts when the second player joins; either player can restart for both |
| Team 3 | `phase` is `"lobby"`, `"playing"` or `"over"`; the creator picks the loop length as a join option |
| Team 4 | A `ready` flag per player in the state, set by an input |

Guidelines that worked:

- Keep one `phase` field in the state and let the client draw the screen from it.
- Start the game from the simulation (`step`), when the conditions hold (enough seats, everyone ready), never from a client message alone.
- Settings picked in the lobby (difficulty, time limit) are join options of the creator, checked by `joinOptionsSchema`.

## Leaving and reconnecting

| What happens | Server | State |
|---|---|---|
| Connection drops (refresh, lost wifi) | The seat is held for `reconnectSeconds` from `config/game.json` | `seats[id].connected = false`; the game's optional `disconnect` hook runs |
| The player comes back in time | Same session id, same seat, same game data | `connected = true`; the optional `reconnect` hook runs |
| The hold runs out, or the player leaves on purpose | The seat is removed | The game's `leave` hook runs |

On the client:

```ts
// after joining
sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken);

// when the page loads
const room = await client.reconnect(sessionStorage.getItem(TOKEN_KEY));
```

If `reconnect` throws (the seat expired or the room closed), the client drops the token and joins the saved room code again **as a new player**.

### Guest ID

A session id lasts for one seat. To recognise the same person in a second tab or after their seat expired, the client sends a random id that the browser keeps in `localStorage` (`getGuestId()`) as the join option `guestId`.

- The server never stores, logs or syncs the raw id. It keeps a 12-character fingerprint, different in every game, as `seats[id].guest`.
- A missing or invalid `guestId` never rejects a join; the fingerprint is then `""`.
- It is a hint, not a login: never use it to hand over a seat, a score or ownership.

## Things that went wrong, and the rule that fixed them

- **The game lives under a path.** Behind the gateway a game is served at `<address>/team-N/`. The server address therefore comes from the page's folder, never from `location.origin`, and no link or `fetch` starts with `/`. In local development the client talks to `http://localhost:2567`.
- **Browser storage is shared by all games** on the one address. Put the game's path in every storage key (`sdm:/team-2:reconnectionToken`), or a token saved by one game is tried on another. The guest id is the one deliberate exception.
- **Room state in the query string, not in the path.** `/team-2/?room=QXTR` works; `/team-2/lobby/QXTR` loads the page with broken asset paths.
- **`sessionStorage` and `localStorage` can throw** (private windows). Wrap every access in `try`/`catch` and keep the player able to join without them.

## What to build for this (platform team)

In build order, matching [../README.md](../README.md#build-order):

1. `@sdm/core/shared`: the route name `/api/rooms/join`, the request and response schemas (`{ code }`, `{ roomId }`).
2. `@sdm/core/sim`: the base state with `code` and `seats`, and the `join`, `leave`, `disconnect`, `reconnect` hooks of the game definition.
3. `@sdm/core/server`: the room code generator (alphabet without `I` and `O`, retry while the code is taken).
4. `@sdm/host`: the live room registry, `createGameRoom()` (code on create, private rooms, seat hold on drop) and the join route with its 400, 404 and 409 answers.
5. `@sdm/core/client`: reading `?room` and `?name`, building the invite link, the server address under a path, the guest id.
6. `@sdm/template`: a lobby with "Create room" and "Join by code" that the teams copy.
