# Team 3 docs: start here

Read this first, whether you are a developer or an AI coding agent picking the work up. It says where the game stands, where things are and how to run it. It was written from the code on `Team_3_Feature` on 2026-11-13.

- [PLATFORM.md](PLATFORM.md): how the game runs as a room on the shared platform (state, messages, connection).
- [NEXT_STEPS.md](NEXT_STEPS.md): what is left, in priority order, and what changed on 2026-11-13.
- [../PLAN.md](../PLAN.md): scope, game numbers, roles and the backlog. [../DEVELOPMENT.md](../DEVELOPMENT.md): branches and CI.
- Client feature notes (conductor, course warning, help, room links, playtest fixes): [`../client/docs/`](../client/docs/).

## Status in five lines

- **The game is online.** It runs as a room on `@sdm/host`; the browser client connects to it, creates a room, joins by code or shared link, and draws the synced state.
- **Rules are complete and tested** (`shared/`): movement, journey, items and throwing, coal, breach, fire and fire spread, course hazard, hazard director, phases, lobby platform and boarding.
- **Client is complete** (`client/`): Three.js train and platform scenes, HUD, menus, how-to-play, win and lose screens, sound.
- **Tests:** 42 Vitest files, including `room/room.test.ts` with two real clients against the real host. Typecheck and build pass.
- **Not done:** hosting under `/team-3`, reconnecting after a dropped connection, and some efficiency work. See [NEXT_STEPS.md](NEXT_STEPS.md).

## Run it

Node.js 22 and pnpm 10. The repository is one pnpm workspace; install from anywhere in it.

```bash
pnpm install
cd games/team-3
pnpm run server      # the game room on the platform host: http://localhost:2567
pnpm run dev         # the client: http://localhost:5173  (run in a second terminal)
```

Open `http://localhost:5173` in two browser tabs: create a room in one, join with the code (or the shared link `?room=CODE`) in the other.

| Address | What you get |
|---|---|
| `http://localhost:5173` | The real game, connected to the room server |
| `http://localhost:5173/?room=CODE` | Straight to "enter your name, then join" for that room |
| `http://localhost:5173/?demo` | The hand-check page: a demo crew and journey, no server needed |

The client finds the server at `http://<page host>:2567`; set `VITE_SERVER_URL` at build time to point it elsewhere.

```bash
pnpm test            # all rule, client and room tests
pnpm run typecheck
pnpm run build       # production build of the client into dist/
```

These three are what "Team 3 Feature CI" runs.

## Where things are

```
games/team-3/
├─ server.ts            starts the game on the platform host (startGameServer)
├─ room/index.ts        registers the game as the platform's "game" room (createGameRoom)
├─ room/room.test.ts    integration test: two real clients, one room
├─ config/game.json     tickRate, patchRate, maxPlayers, reconnectSeconds
├─ shared/              the rules: pure, deterministic, browser-safe
│  ├─ game.ts           the GameDefinition the platform runs; wraps run/room.ts
│  ├─ types.ts          GameState and everything in it (plain objects)
│  ├─ messages.ts       the messages a client sends (createRoom, joinRoom, input, …)
│  ├─ constants.ts, config.ts
│  ├─ map/              the 3-car train map and the lobby platform map
│  ├─ movement/         8-direction movement, wall collision, slowdown, knockback
│  ├─ journey/          fuel, speed, distance, hull
│  ├─ items/            pick up, drop, throw
│  ├─ stations/         coal dispenser and engine; platform practice objects and lever
│  ├─ hazards/          breach, fire, fire spread, course warning
│  └─ run/              room.ts (message handling + step), session.ts, phases, lobby,
│                       presence, boarding, hazard director, course trigger
└─ client/              the browser: Vite root, index.html and vite.config.ts live here
   ├─ main.ts           entry point: menu, waiting room, live game, and the ?demo page
   ├─ roomConnection.ts the connection to the room (create, join by code, send, read state)
   ├─ trainScene.ts, platformScene.ts, scenery.ts, renderPlayer.ts   Three.js
   ├─ keyboard.ts, actionKeys.ts                                     input
   ├─ hud*.ts, screens.ts, help.ts, lobby*.ts, waitingRoom*.ts, platformBoard.ts,
   │  courseWarning.ts, conductor*.ts                                DOM user interface
   └─ sound.ts          WebAudio cues
```

Two things differ from the layout in `server/template/README.md`: `index.html` and `vite.config.ts` are in `client/` (the scripts run `vite client`), and the server runs with `vite-node` because the platform's state classes need TypeScript's legacy decorators.

## Three.js at a glance

Three.js `^0.170.0`. One `WebGLRenderer`, a fixed `PerspectiveCamera` (45°) looking down at 55°, fitted to the whole train or platform. Two scenes: the train (three cars as boxes, walls, doors, stations, players as coloured cylinders with name labels, items as boxes, fire as a cone, breach and course as discs, each hazard with a 3D progress bar) and the lobby platform. Sleepers scroll with the train's speed. The HUD and all screens are DOM, not canvas.
