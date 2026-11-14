# Team 2 — Last Train

This folder holds the game of Team 2 (package `@team-2/game`, label `team-2`).

Work only inside this folder unless an issue says otherwise. The game runs on the shared platform (`@sdm/core`, `@sdm/host`): the rules are in [server/CLAUDE.md](../../server/CLAUDE.md), build details in `DEVELOPMENT.md`.

**New here, or an AI agent picking the work up? Start with [`docs/README.md`](docs/README.md)**, then [`docs/PLATFORM.md`](docs/PLATFORM.md) and [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md).

## Game

5-carriage co-op survival train. One **Colyseus 0.18 authoritative server** per team package, one **Vite + TypeScript browser client**, deterministic simulation (replayable), rendered with **Three.js** + DOM HUD (Among-Us-style task minigames, timed journey with a train-on-a-track strip).

- `SPEC.md` — game design, state schema, input contract, issue list (source of truth)
- `WORKFLOW.md` — who owns what, runbook, schedules, agent role prompts

## Prerequisites

- Node.js 22 LTS, pnpm 10 (`corepack enable`)
- Your AI agent of choice (see `WORKFLOW.md` §2)
- GitHub CLI (`gh`) is **optional** — handy for issues/PRs from the terminal,
  but the web UI works fine; nothing in the run steps needs it

## Run the game and multiplayer lobby

Install once from the repository root (`pnpm install`: this is one pnpm workspace), then from `games/team-2/`:

```bash
pnpm dev             # game server on :2567 (lobby + game room) and Vite client on :5173
pnpm test            # rules tests and the two-client room test
pnpm run typecheck
pnpm run build       # typecheck + client build to client/dist/ (Vite root is client/)
pnpm run preview     # serve the client build
```

Open two browser tabs at `http://127.0.0.1:5173/`. In the first tab, enter a
name, choose a crew size, and select **Create Room**. Share the displayed room
code with the other players; they enter their names and that code, then select
**Join Room**. Rooms support up to four players. The lobby waits without a
timer, shows the joined-player count, and starts automatically when the chosen
crew size is reached. The host can start early with the players already there.

After departure every player sits in the **same game room on the server**:
the lobby host's browser creates it and the others join it by its code. Each
player is a coloured disc; WASD or the arrow keys move it (Shift runs) and the
server decides the position, so both tabs show both players moving. Phases,
tasks, hazards, items and the journey are not simulated yet
([docs/NEXT_STEPS.md](docs/NEXT_STEPS.md)).

Add `?local` to the address for the offline demo: no server and no lobby, the
same rules run in the browser with one player (`client/stateModel.ts`).
`?room=CODE` joins a game room directly by its code. The lobby code is distinct
from this gameplay room code and is used only to gather the crew before departure.

The map is flat 2D, displayed by Three.js with five vertical carriages, 20
station locations, four passages, scrolling scenery and a carriage inspector.
The landscape scrolls in the scene preview and follows `speed` from the game
state otherwise (which stays 0 until the speed model exists).

The **Game state** data source shows the actual state. Current rule modules
are partly stubs, so speed, tasks and journey do not advance even while ticks
increase.

Choose **Scene preview** to use the separate example controls: repair,
journey/time, speed (0–2x), pause, victory, defeat and reset. These controls
never modify the game state. Switch back to Game state to see live state.
The standalone HUD preview is also available with `node client/preview-hud.mjs`
on port 5174.

## Workflow (repo rules — see root `CLAUDE.md`)

1. **Issue first** — `[team-2] Short description`, goal + `done when`, label `team-2`, assignee.
2. Branch `team-2/<issue#>-<short-description>` from up-to-date `Team_2_Feature`.
3. Conventional Commits: `feat(team-2): add boiler station` + `Refs #N` in the body.
4. One PR per issue, `Closes #N`, say how you tested it; ≥1 approving review; delete branch after merge.
5. Never push to `main`. Platform needs → `platform`-labeled issue, never patch `server/`.
