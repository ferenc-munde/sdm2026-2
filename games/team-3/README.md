# Team 3 — The Last Train

This folder holds the game of Team 3 (package `@team-3/game`, label `team-3`).

**The Last Train** is a co-operative, non-violent, online multiplayer game for 2–4 players. The players are the maintenance crew of a moving train: they carry coal, repair leaks and put out fires so the train reaches its destination before the hull fails.

- **Start here (status, folder map, how to run, what is left):** [docs/README.md](docs/README.md)
- **Plan, scope, roles and backlog:** [PLAN.md](PLAN.md)
- **The game rules, module by module:** [shared/README.md](shared/README.md)
- **Developing here (branches, CI, rules for `shared/`):** [DEVELOPMENT.md](DEVELOPMENT.md)
- **Project board:** <https://github.com/users/favyabils234-hash/projects/1>
- **Issues:** [`[team-3]` issues](https://github.com/ferenc-munde/sdm2026-2/issues?q=is%3Aissue+%22%5Bteam-3%5D%22)

## Run it

You need **Node.js 22** and **pnpm 10**. The repository is one pnpm workspace, so team 3 installs together with the platform packages (`@sdm/core`, `@sdm/host`). From `games/team-3/`:

```bash
pnpm install
pnpm run dev         # the client in the browser: http://localhost:5173
pnpm run server      # the game room on the platform host: http://localhost:2567 (PORT to change it)
pnpm test            # all rule, client and room tests (Vitest)
pnpm run typecheck   # TypeScript
pnpm run build       # production build of the client
```

`pnpm test`, `pnpm run typecheck` and `pnpm run build` are the same steps the "Team 3 Feature CI" runs on every push to `Team_3_Feature`. The server runs with `vite-node`, the same loader as the tests, because the platform's state classes need TypeScript's legacy decorators.

## What works now

| Part | Status |
|---|---|
| **Game rules** (`shared/`) | ✅ Complete and tested: movement, journey, carrying items, coal, breach and fire repair, engine stall, course hazard, fire spread, hazard director scaled to the crew, run phases, leaving and rejoining, lobby host and crew size, the waiting platform and boarding |
| **Client** (`client/`) | ✅ Three.js train, players with names, stations, items and hazards with repair progress, HUD bars, keyboard, how-to-play, win and lose screens, scenery, sound, conductor announcements, main menu and shared-link join |
| **Online play** | ✅ `pnpm run server` runs the game as a platform room (#80) and the client plays it (#220): create a room, join by code or shared link, see each other and play. **Next:** hosting (#22). Details: [docs/PLATFORM.md](docs/PLATFORM.md) |

`pnpm run dev` opens the real game, which needs `pnpm run server` running. Add `?demo` to the address for the **hand-check page**: the train with a demo crew and a demo journey, showing every client part working without a server.

## Controls

| Action | Keys |
|---|---|
| Move | **W A S D** or the **arrow keys** |
| Interact (hold) | **Space** or **E**: repair a breach with the wrench, put out a fire with the extinguisher, hold the steering console |
| Pick up / drop, take or deliver coal, pull the departure lever | **Tap E** or **left-click** |
| Throw the held item, or **dash** with empty hands (1.5 s cooldown) | **Shift** or **F** |

## How the game works

The crew wins when the train reaches **1800** distance and loses when the **hull** reaches **0**. Full numbers are in [PLAN.md section 3](PLAN.md#3-game-numbers-from-the-idea-document).

- **Fuel** drains **1.8 per second**. **Coal** from the dispenser in the last car adds **35** at the engine in the front car (up to 100).
- **Speed** is full above 25 fuel, half at 25 or below, and **zero** when the tank is empty or **the engine is on fire**.
- **Hazards** start every **12 s** (7 s late in the journey), more often with a bigger crew. A **breach** costs 2.5 hull per second until repaired (hold the wrench for 3 s); a **fire** costs 1.5 per second until put out (hold the extinguisher for 2.5 s) and **spreads after 15 s**.
- **Course warning:** hold the steering console in the last 2 seconds of the warning, or lose 12 hull.
- **Lobby:** the crew waits on a station platform. The first player to join is the host, picks the crew size (2–4) and pulls the departure lever when everyone is in.

## Team

| Developer | GitHub | Area |
|---|---|---|
| 1 | `Abmuminfav` | Core rules: contract, map, movement, journey, items, lobby and platform |
| 2 | `favyabils234-hash` | Room, run flow, hazard director, release |
| 3 | `Main-66` | Client |
| 4 | `davidudo2005` | Stations and hazards |

## Working here

Pull requests from work branches go into `Team_3_Feature`, which is promoted to `development`, `staging` and then `main`. See [DEVELOPMENT.md](DEVELOPMENT.md#branches-and-ci).

Work only inside this folder unless an issue says otherwise. The game package follows the layout of the platform template ([server/template/README.md](../../server/template/README.md)). The template and the platform host haven't been built yet, so the team wrote the rules in `shared/` as pure, deterministic functions with tests. They can be wrapped in the platform's game definition (#80) without being rewritten, once `@sdm/host` is merged.
