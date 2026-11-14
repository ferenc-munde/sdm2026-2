# Next steps

## What changed on 2026-11-13 (issue #240)

The game was moved onto the shared platform. Before, it was a client-only preview with mock state in one browser tab. Now:

- `shared/game.ts` holds the rules as a platform `GameDefinition` (state schema, inputs `move` / `start` / `repair`, join option `name`, config schema); `config/game.json` holds the tuning values.
- `room/index.ts` and `server.ts` run it on the platform host; `pnpm run dev` starts server and client.
- `client/room-adapters.ts` implements the existing `SessionAdapter` and `GameStateAdapter` interfaces on top of a real room; `client/main.ts` uses it by default and keeps the mocks behind `?mock`.
- The lobby shows the platform's room code, a second tab can join with it, and "Board the train" starts the run for everyone in the room.
- New tests: rules (`shared/game.test.ts`), room with two real clients (`room/room.test.ts`), adapters (`client/room-adapters.test.ts`), the live lobby page (`tests/live-room-dom.test.mjs`).
- `client/styles.css` got one rule, `[hidden]{display:none!important}`: several lobby blocks set `display` in CSS, which silently overrode the `hidden` attribute the code uses to switch screens.

How it works: [PLATFORM.md](PLATFORM.md). How to run it: [README.md](README.md).

## Not done yet, in priority order

1. **Play it in two real browser tabs.** Everything was verified with automated tests (Node, happy-dom, real server and real WebSocket clients), not on screen. Check: lobby layout in live mode, the avatars moving, the HUD, the outcome overlay, "Back to crew" and playing a second run.
2. **Collision with the train.** The server only keeps players inside the outer rectangle (0..1). They walk through partition walls, doorways are not enforced, and equipment is not solid. Needs a wall and doorway map in `shared/train-layout.ts` (the scene builds its walls in `client/environment/TrainEnvironment.ts`) and a collision step in `step`. `client/physics/Collision.ts` is client-only and grid-based; it cannot be imported from `shared/` as it is.
3. **Show where the repairs are.** A task only names its section in the HUD label. There is no marker in the scene and no "you can repair here" hint. The state already has `tasks[i].section`; the snapshot type would need the section (or a position) to draw it.
4. **Real tasks.** A repair is "stand in the section and press E ten times". There are no mini-games, no items, no tasks that need two players, no new faults during a run, and the catalogue has only three entries. The teammate's electrical repair in the prototype (`client/tasks/ElectricalRepair.js`) is not connected.
5. **Smooth movement.** The avatar is drawn at the last server position (20 updates a second) with no interpolation and no client-side prediction, so the local player feels slightly delayed. Interpolate in `client/player-scene.ts` first; predict with the shared `step` later.
6. **Reconnection after a page reload.** The Colyseus SDK reconnects by itself after a short network drop (the HUD shows `RECONNECTING`, the seat is held for `reconnectSeconds`), but this was not tested. A reload always joins as a new player: the reconnection token is not stored. See `server/docs/LOBBY_AND_JOIN.md` ("Leaving and reconnecting").
7. **Deployment under `/team-1`.** Only local development works. Behind the gateway the page lives under a path, so check that asset paths are relative (`index.html` uses `/client/...`, Vite `base` is not set) and set `VITE_SERVER_URL` for the deployed server. Nothing here was tried on Railway.
8. **Lobby rules.** Any player can start, alone if they like; there is no host, no "ready" state and no minimum crew size. A player who joins during a run is put straight into it. Invite links (`?room=CODE`) are not read.
9. **Stuck keys.** If the window loses focus while a movement key is held, the player keeps walking until the key is pressed and released again (`client/input/InputHandler.ts` does not listen for `blur`).
10. **Balance.** The numbers in `config/game.json` are first guesses; nobody has played a full run.
11. **Clean-up.** `shared/types/game.ts` is unused. The train size exists twice (`shared/train-layout.ts` and the Three.js scene) and is kept in sync by hand; the client scene should read it from `shared/`. The JS bundle is about 800 kB (Three.js plus the Colyseus SDK) and Vite warns about it.
12. **Debug commands and replays.** The game defines no `commands`, and replays were not looked at.

## Known noise

- In `room/room.test.ts`, the test for rejected joins prints a `ServerError ... 'not joined'` stack on stderr. It comes from the platform host handling the rejected join; the test passes.
