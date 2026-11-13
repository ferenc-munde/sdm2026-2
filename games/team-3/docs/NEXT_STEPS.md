# Next steps

What is left for Team 3, most important first. Found by reading the code on `Team_3_Feature` on 2026-11-13; none of it was checked in a browser, so start by playing a full run in two tabs.

## 1. Put the game online (plan task 20, issue #22)

Blocked on the platform team: there is no gateway and no Railway setup yet, and `startGameServer` does not serve the built client. When they exist:

- The game is served under a path (`<address>/team-3/`). No link or `fetch` may start with `/`, and the server address must come from the page's folder, not from `location.origin`. Today the client only knows `VITE_SERVER_URL` and the port 2567 default.
- Put the game's path in every browser storage key, because all games share one address.

## 2. Reconnect after a dropped connection

The server holds a dropped player's seat for 30 seconds (`reconnectSeconds`) and the rules handle `disconnect` and `reconnect`. The client does not use it: when the connection closes it goes back to the menu. Save `room.reconnectionToken` and call the SDK's `reconnect(token)` on load and on close, then fall back to joining by code.

## 3. Stop rebuilding the scene every frame

`trainScene.updateState` and `platformScene.updatePlayers` dispose and rebuild every mesh and every name-label canvas texture on every animation frame. Keep the meshes and update positions, and rebuild a label only when the name changes. This is the most likely cause of stutter on slower machines.

## 4. Send less state

The whole `GameState` goes out as one JSON string on every tick (20 times a second). It works for four players. If it becomes a problem, either publish only when the state changed, or move the fast-changing parts (player positions) into real schema fields so Colyseus sends deltas.

## 5. Smaller clean-ups

- **Seats.** A connection that never sends `createRoom` or `joinRoom` holds a platform seat without a game seat. With the platform's join options (see [PLATFORM.md](PLATFORM.md)) the name can travel with the join and this gap closes.
- **Input schema.** `inputSchema` is `z.unknown()` and messages are checked by hand in `parseClientMessage`. A zod discriminated union would do the same with less code; keep the "bad message becomes a notice" behaviour if you change it.
- **Config.** `config/game.json` only has the platform's four values. Game numbers live in `shared/constants.ts`; `ctx.config` now makes it possible to tune them from the config file.
- **Duplicates.** `RoomSettings` and `MIN_PLAYERS` are defined in more than one place; `GAME_ROOM = "game"` is hard-coded in the client and can be imported as `GAME_ROOM_NAME` from `@sdm/core/shared`.
- **Conductor.** `createAnnouncementService` is never called from `client/main.ts`, so announcements always use the fallback text.
- **`client/main.ts`** is 534 lines with the demo page and the live game interleaved, and an import in the middle of the file. Splitting the demo into its own module would make both easier to change.
- **No smoothing.** Each frame draws the latest synced state; there is no interpolation between ticks.
- **Stale text.** The header of `shared/messages.ts`, some comments in `client/main.ts`, `room/README.md` and the page title ("renderer check") still describe the time before the client was connected.

## What changed on 2026-11-13

- The three room branches (`team-3/197-room-pipeline`, `team-3/80-platform-room`, `team-3/220-browser-room`) are merged: the game runs as a platform room and the client plays it.
- `development` was merged into `Team_3_Feature` (pull request #239). It brought the platform additions from #236 (join options, `ctx.config`, `@sdm/core/client`), the root `.gitignore` and the CI workflows. Nothing in `games/team-3/` had to change; typecheck, all 42 test files and the build pass.
- This `docs/` folder was added (issue #242), and the status table in the README was corrected.
- Other teams are told to use this game as the reference for connecting to the platform.

## Branch flow reminder

Work branches are `team-3/<issue>-<description>`, cut from `Team_3_Feature`, with a pull request back into `Team_3_Feature`. `Team_3_Feature` is promoted to `development`, then `staging`, then `main`. A pull request merged into `Team_3_Feature` or `development` does not close its issue automatically: close it by hand.
