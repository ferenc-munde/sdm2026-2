# Team 2 — Last Train

This folder holds the game of Team 2 (package `@team-2/game`, label `team-2`).

Work only inside this folder unless an issue says otherwise. The package was self-scaffolded (mirroring [server/template/README.md](../../server/template/README.md)) until the platform lands: the rules are in [server/CLAUDE.md](../../server/CLAUDE.md), build details in `DEVELOPMENT.md`.

## Game

5-carriage co-op survival train. One **Colyseus 0.18 authoritative server** per team package, one **Vite + TypeScript browser client**, deterministic simulation (replayable), rendered with **Three.js** + DOM HUD (Among-Us-style task minigames, timed journey with a train-on-a-track strip).

- `SPEC.md` — game design, state schema, input contract, issue list (source of truth)
- `WORKFLOW.md` — who owns what, runbook, schedules, agent role prompts

## Prerequisites

- Node.js 22 LTS, pnpm 10 (`corepack enable`)
- Your AI agent of choice (see `WORKFLOW.md` §2)
- GitHub CLI (`gh`) is **optional** — handy for issues/PRs from the terminal,
  but the web UI works fine; nothing in the run steps needs it

## Run the local game and multiplayer lobby

From `games/team-2/`, run `npm install` once, then `npm run dev`. This starts
the Vite client on `http://127.0.0.1:5173/` and the Colyseus lobby server on
`http://127.0.0.1:2567`. Open two browser tabs, enter different names, select
the same crew size, and choose **Create / Join Game** in both tabs. A full crew
starts immediately. The host can skip the 30-second countdown to start with
the current crew, including a solo player. If the timer expires, the game
starts with whoever joined.

The train world and HUD remain the existing local gameplay demo after the
lobby starts; gameplay simulation and movement are not networked yet.
`npm run build` checks TypeScript and builds the browser app into `dist/`;
`npm run preview` serves that build locally.

The standalone task-panel preview remains available with
`node client/preview-hud.mjs` on port 5174.

## Multiplayer lobby

```bash
npm install
npm run dev     # client on :5173, lobby server on :2567
npm test        # headless rules tests
```

> The lobby server uses a Colyseus room in this package. The existing train
> scene and HUD remain local demo visuals after the match starts; gameplay
> movement and simulation are not networked yet.

Two browser tabs at `localhost:5173` = two players.

## Workflow (repo rules — see root `CLAUDE.md`)

1. **Issue first** — `[team-2] Short description`, goal + `done when`, label `team-2`, assignee.
2. Branch `team-2/<issue#>-<short-description>` from up-to-date `main`.
3. Conventional Commits: `feat(team-2): add boiler station` + `Refs #N` in the body.
4. One PR per issue, `Closes #N`, say how you tested it; ≥1 approving review; delete branch after merge.
5. Never push to `main`. Platform needs → `platform`-labeled issue, never patch `server/`.
