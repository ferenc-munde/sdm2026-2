# The Last Train (Team 1): start here

This folder is written for the team and for the AI coding agents that work with it. Read this file first, then [PLATFORM.md](PLATFORM.md) (how the game talks to the server) and [NEXT_STEPS.md](NEXT_STEPS.md) (what is not done).

## What the game is

A co-operative game for up to four players. The crew boards a night train, has a fixed time to reach the destination, and must finish the repairs before the time or the train's condition runs out. Everybody wins or loses together.

## Status (2026-11-13)

- The game runs on the shared platform (`server/`, Colyseus 0.18): one room per crew, a 4-character room code, the rules run on the server.
- Two browsers can share a room: create, join by code, see each other in the lobby, start the run together, walk around, repair, win or lose.
- The rules are small on purpose: walking, a countdown, a decaying train condition and five "stand in the right section and press E" repairs.
- Checked by automated tests only (rules, room with two real clients, the lobby page in a simulated DOM). **Nobody has looked at it in a real browser since the move to the platform**: do that first.

## Folder map

| Path | What it is |
|---|---|
| `index.html` | **The real entry point.** Loads `client/main.ts`. |
| `client/main.ts` | Lobby screen (create, join, crew list) and the wiring between the adapters and the game view. |
| `client/room-adapters.ts` | The real adapters: `SessionAdapter` and `GameStateAdapter` backed by a platform room. Maps room state to `GameClientSnapshot`. |
| `client/room-input-controller.ts` | Keyboard to room inputs (`move`, `repair`) for the local player. |
| `client/session-adapter.mjs` + `.d.mts` | The lobby adapter interface, its errors, and the in-memory `MockSessionAdapter`. |
| `client/game-state-adapter.mjs` + `.d.mts` | The game-state adapter interface, the snapshot type, the input type, and `MockGameStateAdapter`. |
| `client/gameplay-view.ts` | The HUD (countdown, condition, repairs, crew) and the canvas. Draws whatever snapshot the adapter gives it. |
| `client/player-scene.ts`, `client/scene.ts`, `client/environment/` | The Three.js scene: a top-down view of the 26 x 10 train floor and the player avatars. |
| `client/presentation-model.mjs` | Small pure functions that format snapshot values for the HUD. |
| `client/player-preview-controller.ts`, `client/player/`, `client/input/`, `client/physics/` | Local player movement for mock mode. Live mode uses only `client/input/InputHandler.ts`. |
| `shared/game.ts` | **The rules**: state schema, input schema, join options, config schema, `step`. Runs on the server. |
| `shared/train-layout.ts` | Train size, the five sections, the repair catalogue. |
| `shared/constants.ts` | Game id, name length, player colours, phases. |
| `shared/types/game.ts` | Old, unused interfaces from before the platform. Safe to delete in a later clean-up. |
| `room/index.ts` | Registers the game as the platform's room. No rules here. |
| `server.ts` | Starts the game server (`startGameServer` from `@sdm/host`). |
| `config/game.json` | Tuning values (tick rate, players, round length, speed, repairs). Validated by `ConfigSchema` in `shared/game.ts`. |
| `scripts/dev.mjs` | Starts the server and the client together. |
| `tests/` | Plain Node test scripts (`*.test.mjs`), some with happy-dom and a Vite loader. |
| `shared/game.test.ts`, `room/room.test.ts`, `client/room-adapters.test.ts` | Vitest tests for the rules, the room with real clients, and the adapters. |
| `prototype.html`, `client/main.js`, `client/style.css`, `client/three/`, `client/world/`, `client/players/`, `client/tasks/` | **A separate standalone prototype** by a teammate (its own Three.js carriage with seats, a player and an electrical repair task). It is not connected to the platform or to `index.html`. Open it at `/prototype.html` while the client runs. Leave it alone unless you are working on it. |

## Install and run

Everything is one pnpm workspace. Run the install from the repository root, the rest from `games/team-1`:

```
pnpm install                 # in the repository root, once
cd games/team-1
pnpm run dev                 # game server on :2567 and the client on :5173
```

Then open `http://localhost:5173/` in two tabs:

1. Tab 1: type a name, **Create a session**. The crew room shows a 4-character crew code.
2. Tab 2: type a name and that code, **Join session**. Both tabs now list both players.
3. Either tab: **Board the train**. Both tabs switch to the train. Move with WASD or the arrow keys, repair with E while standing in the section named in the task.

To run the two parts separately: `pnpm run dev:server` and `pnpm run dev:client`. The server port comes from `PORT` (default 2567). The client looks for the server on the page's host at port 2567; set `VITE_SERVER_URL` (for example in `.env.local`) to point it somewhere else.

`http://localhost:5173/?mock` runs the old preview without any server (in-memory lobby, room `DEMO`, mock controls).

## Test

From `games/team-1`:

```
pnpm test            # the Node test scripts, then vitest
pnpm run typecheck   # tsc --noEmit
pnpm run build       # typecheck and vite build
```

These three, after `pnpm install`, are what CI runs (`.github/workflows/team-1-feature.yml`). `pnpm exec vitest run shared` runs only the rule tests.

## Rules that apply here

The repository rules are in `/CLAUDE.md` and `/server/CLAUDE.md`. The ones that bite most often:

- `shared/` must stay browser-safe and deterministic: no `Math.random`, `Date.now` or `performance.now`; randomness comes from `ctx.random`, time from ticks.
- Import the platform only by package name (`@sdm/core/...`, `@sdm/host`), never by relative path into `server/`.
- Work only inside `games/team-1/`; a platform change needs its own `platform` issue.
- Issue first, then a `team-1/<issue>-<description>` branch and a pull request into `Team_1_Feature`. Code, comments and docs are in English.
